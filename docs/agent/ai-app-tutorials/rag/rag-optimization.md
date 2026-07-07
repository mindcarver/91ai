# RAG 优化

## TL;DR

RAG 优化的核心思路是**可组合的多阶段检索**：便宜的第一轮粗筛（BM25/Dense → top-50）→ 昂贵的精排（CrossEncoder/ColBERT → top-5）。每一层解决一个特定问题，按需叠加。优化顺序：Baseline → Rewrite → Rerank → Hybrid → Multi-query → Compression → Grounding。每次只改一个变量，用数据说话。

## 概述

前文 [RAG问答链路v1](rag-qa-pipeline-v1.md) 跑通了端到端链路，但一定会暴露问题：检索不到、排序不对、答案编造、引用错误。本文逐个拆解这些问题的解决方案。

这些优化手段不是都要加的。正确做法：先跑基线，定位瓶颈，针对性优化，每步测量效果。

## 优化前的准备

在动手优化之前，先做三件事：

1. **建立评估基线。** 准备 50-100 个代表性问答对，跑一遍 v1，记录 recall@5、MRR、答案准确率。没有基线数据就无法判断任何优化是否有效。详见 [RAG评估与微调](rag-eval-and-finetuning.md)。

2. **错误归类。** 分析基线中的失败案例，归类为：检索失败（没召回）、排序失败（召回了但没排前面）、生成失败（有上下文但答案不对）、引用失败（答案对但来源标错）。不同问题对应不同优化手段。

3. **明确约束。** 延迟预算多少？成本预算多少？能否接受额外的 LLM 调用？这些约束决定你能用哪些优化。

## 一、Query Rewrite（查询改写）

用户问题和文档表述经常不一致。用户问"东西坏了怎么退"，文档写的是"产品退换货流程"——语义接近但字面重叠少，纯向量检索可能匹配不上。

### 改写方式

**LLM 改写。** 最灵活，让模型将用户问题转化为更适合检索的表述：

```python
REWRITE_PROMPT = """将用户问题改写为更适合知识库检索的查询。
保留核心意图，使用更正式完整的表述，提取关键实体和条件。

用户问题: {question}
改写后的查询:"""

rewritten = llm.invoke(REWRITE_PROMPT.format(question=user_query))
```

**Step-back Prompting。** 让模型从具体问题后退到更抽象的概念层面，提升召回：

```python
STEPBACK_PROMPT = """你是一个问题抽象专家。给定一个具体问题，
生成一个更抽象、更通用的问题，使其更容易在知识库中检索到相关背景信息。

具体问题: {question}
抽象问题:"""
```

用户问"iPhone 15 Pro 的电池能用多久"，step-back 改写为"智能手机电池续航的评估标准和方法"。具体问题可能检索不到，但抽象问题能命中电池续航的通用说明文档。

**改写的风险。** 改写可能偏离原始意图。验证方法：检查检索到的 Chunk 是否和原始问题相关，而非只和改写后的查询相关。如果改写后 recall 提升但 precision 下降，说明改写过度。

## 二、Multi-query + RAG Fusion（多查询检索）

### Multi-query

同一个意图有多种表达方式。生成多个不同角度的查询，分别检索，合并结果，覆盖面更广：

```python
MULTI_QUERY_PROMPT = """针对用户问题，生成3个不同角度的检索查询。
每个查询侧重不同的表述方式和关键词。

用户问题: {question}
输出格式（每行一个查询）:"""

queries = llm.invoke(MULTI_QUERY_PROMPT.format(question=user_query)).split('\n')
all_results = []
for q in queries:
    all_results.extend(vectorstore.similarity_search(q, k=10))
```

代价：更多 Embedding 调用和检索操作，延迟和成本都会增加。3 个查询意味着 3 倍的检索开销。

### RAG Fusion

Multi-query 的升级版，核心改进在于合并策略——使用 Reciprocal Rank Fusion (RRF) 替代简单的相似度合并：

```
RRF_score(d) = sum(1 / (k + rank_i(d)))  对所有查询i
```

其中 k=60 是常用参数，用于平滑排名靠前的结果的权重优势。

```python
def rrf_merge(result_lists: list[list], k: int = 60) -> list:
    """多个检索结果列表通过 RRF 合并"""
    scores = {}
    for results in result_lists:
        for rank, doc in enumerate(results):
            if doc.id not in scores:
                scores[doc.id] = 0
            scores[doc.id] += 1.0 / (k + rank + 1)
    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return [doc_map[doc_id] for doc_id, _ in ranked]
```

**RRF 的优势。** 不依赖原始分数的绝对值，只依赖排名顺序。这意味着不同检索方式（向量、BM25、不同模型的输出）可以直接合并，无需分数归一化。

**什么时候用。** 当单一查询经常漏召回时，Multi-query + RRF 是最直接的提升手段。但如果基线 recall 已经很高，多查询的边际收益可能不抵额外成本。

## 三、HyDE（假设文档嵌入）

先让 LLM 生成一个"假想答案"，用假想答案（而非原始问题）去检索。

```python
def hyde_retrieval(question: str, top_k: int = 5):
    # LLM 直接回答（不需要检索，凭知识回答）
    hypothetical = llm.invoke(f"请简要回答：{question}")
    # 用假想答案的向量去检索
    return vectorstore.similarity_search(hypothetical, k=top_k)
```

**为什么有效。** 问题是短句，文档是完整段落，两者的向量表示在语义空间中距离较远。假想答案在表述方式上更接近真实文档，匹配效果更好。

**HyDE 会翻车。** 如果 LLM 对该领域完全不了解，生成的假想答案可能严重偏离文档的术语体系和表述风格。这时假想答案反而会拉偏检索方向。实测建议：先在小样本上对比 HyDE vs 直接检索，确认有正向收益再上线。对于领域专业度高的知识库，HyDE 的收益通常不大甚至为负。

## 四、Hybrid Search（混合检索）

Hybrid Search 已成为 2025-2026 年的生产标准方案。Dense + BM25 的组合在大多数场景下比单一检索方式更稳定，典型提升 5-15% 的 recall。

**为什么需要。** 向量检索擅长语义匹配但不擅长精确匹配（SKU 编号、产品型号、版本号），BM25 擅长精确匹配但不擅长语义理解。两者互补。

**合并方式。** 生产环境普遍使用 RRF 合并两种检索结果：

```python
from langchain.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever

# Dense 检索
dense_retriever = vectorstore.as_retriever(search_kwargs={"k": 20})
# BM25 检索
bm25_retriever = BM25Retriever.from_documents(documents, k=20)
# 混合检索（RRF 合并，权重可调）
hybrid_retriever = EnsembleRetriever(
    retrievers=[bm25_retriever, dense_retriever],
    weights=[0.4, 0.6]  # BM25 权重 0.4, Dense 权重 0.6
)
results = hybrid_retriever.invoke("SKU12345 的退货政策是什么")
```

**权重调参。** 如果知识库中精确匹配需求多（技术文档、产品目录），BM25 权重调高（0.4-0.5）。如果主要是自然语言描述（FAQ、政策解读），Dense 权重调高（0.6-0.7）。用验证集测几组参数选最优。

**什么时候不需要。** 如果知识库几乎全是自然语言且没有专有名词/编号，纯 Dense 可能就够了，没必要加 BM25 的复杂度。

## 五、Rerank（重排序）

向量检索是粗筛，Rerank 是精排。这是收益/成本比最高的优化手段之一。

### 标准流程

```
用户问题 → 粗筛（BM25/Dense → top-50）→ Rerank（CrossEncoder → top-5）→ 送入 LLM
```

### Rerank 模型对比

| 模型 | 特点 | 适用场景 |
|------|------|----------|
| BGE-Reranker (bge-reranker-v2-m3) | 开源，多语言，效果好 | 中文场景首选，可本地部署 |
| Cohere Rerank v3 | API 服务，128K 上下文，多语言 | 不想自己部署时的最佳选择 |
| Jina Reranker v2 | 开源，支持 8K 上下文 | 需要长上下文精排的场景 |
| ColBERT (late interaction) | per-token 匹配，精度最高 | 对精度要求极高的场景 |

```python
# 使用 Cohere Rerank
from cohere import Client
co = Client("your-api-key")

results = co.rerank(
    model="rerank-v3",
    query=user_query,
    documents=[doc.page_content for doc in candidates],
    top_n=5
)
```

### ColBERT：Late Interaction 精排

ColBERT 是一种不同于 CrossEncoder 的精排思路。核心机制：

- **Per-token Embedding。** 不是把整个文档压缩成一个向量，而是为每个 token 生成独立的 embedding
- **MaxSim。** 对查询中的每个 token，找到文档中与之最相似的 token embedding，取最大相似度，然后求和
- **PLAID 引擎。** 为 ColBERT 的生产部署做了优化，通过聚类压缩和近似搜索将推理延迟降到可用水平

```python
# ColBERT 的 MaxSim 计算（简化示意）
import torch

def maxsim_score(query_embeddings, doc_embeddings):
    """
    query_embeddings: [query_len, dim]
    doc_embeddings: [doc_len, dim]
    """
    # 每个查询 token 对所有文档 token 取最大相似度
    sim_matrix = torch.matmul(query_embeddings, doc_embeddings.T)  # [query_len, doc_len]
    max_sim = sim_matrix.max(dim=1).values  # [query_len]
    return max_sim.sum().item()
```

ColBERT 的优势在于细粒度的 token 级匹配，对于长文档中某几句话高度相关的场景效果优于 CrossEncoder。缺点是存储成本高（每个文档要存所有 token 的 embedding），需要 PLAID 等专门引擎来优化。

### Rerank 的代价

CrossEncoder/ColBERT 的计算成本远高于向量检索。一次 top-50 的 Rerank 需要 50 次模型推理。所以 Rerank 只放在检索链路末端，对粗筛后的少量候选做精排。

## 六、Context Compression（上下文压缩）

检索到的 Chunk 可能很长且包含大量无关内容。压缩后送入 LLM，减少噪音，节省 token。

### LLMLingua-2

2025 年的代表性方案，基于 token 级别的二分类（保留/丢弃），不依赖 LLM 推理，速度快：

```python
from llmlingua import PromptCompressor

compressor = PromptCompressor(model_name="microsoft/llmlingua-2-bert-base-multilingual-cased")

compressed = compressor.compress_prompt(
    context_text,
    instruction=user_query,
    rate=0.5,  # 压缩到 50%
    force_tokens=["不", "没", "是"]  # 强制保留否定词等关键 token
)
# compressed["compressed_prompt"] 是压缩后的文本
```

**替代方案。** 也可以用小参数 LLM 做 extractive 压缩（提取相关句子），效果更好但成本更高。选择标准：延迟敏感用 LLMLingua-2，效果优先用 LLM 提取。

## 七、Answer Grounding + Citation Check（答案定位与引用验证）

### Grounding

生成答案时标注每个断言的来源，让用户可以验证：

```python
GROUNDING_PROMPT = """基于以下检索内容回答问题。
每个事实性断言必须用 [来源N] 标注出处。
如果检索内容不足以回答某个方面，明确说明"该方面信息不足"。

检索内容:
{context}

问题: {question}"""
```

### Citation Check

验证答案中的断言是否确实来自检索内容，而非模型编造：

```python
CITATION_CHECK_PROMPT = """检查以下答案的每个断言：
1. 是否能从检索内容中找到直接支持？
2. 数字、日期、人名等具体信息是否准确引用？

答案: {answer}
检索内容: {context}

输出格式:
- [断言内容]: 确认/无法确认/与原文矛盾"""
```

**验证失败时的处理。** 将无法确认的部分标记出来，返回保守答案："根据知识库，X 是明确的，但 Y 需要进一步确认。" 不要把无法确认的内容当成事实输出。

## 八、Query Routing（查询路由）

当系统有多个数据源或检索策略时，根据问题类型选择最合适的路径。

### 路由方式对比

| 方式 | 实现复杂度 | 灵活性 | 延迟 | 适用场景 |
|------|-----------|--------|------|----------|
| 规则路由（关键词/正则） | 低 | 低 | 极低 | 路径少且明确的简单系统 |
| LLM Function Calling | 中 | 高 | 中 | 路径多、判断逻辑复杂 |
| 语义相似度路由 | 中 | 中 | 低 | 介于前两者之间 |

**规则路由。** 关键词匹配，简单可控："我的订单" → SQL 路径，"退货政策" → 向量检索路径。路径少时够用，路径多时维护成本高。

**LLM Function Calling 路由。** 定义各数据源的 schema，让 LLM 选择：

```python
from pydantic import BaseModel, Field
from typing import Literal

class RouteQuery(BaseModel):
    """将用户问题路由到最合适的数据源"""
    datasource: Literal["vectorstore", "sql_db", "web_search", "direct"] = Field(
        ...,
        description=(
            "vectorstore: 文档问答 | "
            "sql_db: 订单/数据查询 | "
            "web_search: 实时信息 | "
            "direct: 通用知识"
        )
    )

# 通过 function calling 实现路由
route = llm.bind_tools([RouteQuery])
decision = route.invoke(user_query)
```

**语义相似度路由。** 为每个数据源预定义一组代表性问题，计算用户问题与各代表性问题的相似度，选最匹配的路径。比规则灵活，比 LLM 便宜。

## 九、高级检索技巧

### Self-Querying（自查询）

LLM 从用户问题中提取语义查询 + 元数据过滤条件：

```python
from langchain.chains.query_constructor.base import AttributeInfo

metadata_field_info = [
    AttributeInfo(name="year", description="文档年份", type="integer"),
    AttributeInfo(name="department", description="所属部门", type="string"),
]
# 用户问 "2024年退货政策变化"
# 提取出: 语义查询="退货政策变化", 过滤条件="year=2024"
```

只在元数据维度有限的场景有用（时间、部门、类别）。如果文档没有结构化元数据，这个方法无法使用。

### Parent Document Retrieval（父子文档）

存储用大 Chunk（完整段落），检索用小 Chunk（句子级别）。检索到小 Chunk 后返回所属的大 Chunk，兼顾精度和上下文完整性。

### Sentence Window Retrieval（句子窗口）

检索单个句子，返回前后各 N 个句子作为上下文窗口。和父子文档类似但粒度更细。

### Adaptive RAG

根据问题复杂度选择不同检索策略：简单问题直接回答，中等做标准检索，复杂做多轮检索 + 推理。避免对所有问题执行相同流程。详见 [Agentic-RAG](agentic-rag.md)。

### 图谱增强检索

在向量检索之外利用知识图谱做关系推理，适合跨文档多跳推理。详见 [高级专题与工程实战](advanced-topics-and-engineering.md) 中的 GraphRAG 部分。

## 十、回退策略

检索不到相关内容时（所有 Chunk 相似度低于阈值）的处理：

| 策略 | 做法 | 适用场景 |
|------|------|----------|
| 直接告知 | "知识库中没有找到相关信息" | 企业场景，准确性优先 |
| 引导改述 | "没找到。您是不是想问 XXX？" | 交互式系统 |
| 放宽条件 | 降低相似度阈值，扩大范围 | 宁可多返回一些 |
| 通用知识 | LLM 基于自身知识回答，标注来源 | 容忍一定不准确的场景 |

企业场景建议用策略 1 或 2。不准确但有帮助的答案不如诚实的"不知道"。选择策略 4 时必须在回答中明确标注"以下内容来自模型通用知识，未经知识库验证"。

## 十一、优化顺序建议

不要一次加所有优化。按以下顺序逐步迭代，每步测量效果：

```
Baseline → Rewrite → Rerank → Hybrid → Multi-query → Compression → Grounding
```

| 顺序 | 优化手段 | 解决的问题 | 收益预期 | 代价 |
|------|----------|-----------|----------|------|
| 1 | 基线测量 | 无 | 建立评估基准 | 时间 |
| 2 | Query Rewrite | 问题表述不精确 | 中 | 一次额外 LLM 调用 |
| 3 | Rerank | 检索结果排序不准 | 高 | Rerank 模型推理 |
| 4 | Hybrid Search | 精确匹配需求 | 中-高 | 维护两套检索 |
| 5 | Multi-query | 单一查询召回不足 | 中 | N 倍检索开销 |
| 6 | Compression | Context 过长 | 视情况 | 额外模型调用 |
| 7 | Grounding + Citation | 答案可信度 | 中 | Prompt 设计 + 验证 |

每次只加一个优化，在验证集上对比前后效果。如果某步改进不明显，说明该优化不适合当前场景，跳过。

## 延伸阅读

- [RAG问答链路v1](rag-qa-pipeline-v1.md) — 端到端 RAG 链路搭建
- [Agentic-RAG](agentic-rag.md) — 自适应检索、多轮推理、工具调用
- [RAG评估与微调](rag-eval-and-finetuning.md) — 评估指标体系、Counterfactual Testing、模型微调
- [高级专题与工程实战](advanced-topics-and-engineering.md) — GraphRAG、生产部署、监控告警
