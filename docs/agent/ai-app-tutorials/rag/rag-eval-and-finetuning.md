# RAG 评估与微调

**TL;DR**: 没有量化评估，优化就是盲目调参。2026 年的评估标准已经从简单的"检索准不准"升级到反事实测试——检索是否**因果地**改变了答案？RAGAS 四指标（Faithfulness、Answer Relevancy、Context Precision、Context Recall）是基础，LLM-as-judge 是生产环境主流。微调的 ROI：Embedding 提升 5-25%、Reranker 提升 10-30%（最高 ROI）、LLM LoRA 解决行为问题。

## 概述

前文已经跑通了 [RAG 问答链路 v1](rag-qa-pipeline-v1.md)，也做了各种[检索优化](rag-optimization.md)。但一个关键问题始终悬着：**怎么知道效果好不好？**

没有量化评估，优化就是盲目调参——改了参数也不知道是变好了还是变差了。本文覆盖评估方法和模型微调策略。评估告诉你"哪里有问题"，微调告诉你"怎么从模型层面改进"。

## 一、为什么评估是刚需

"试几个问题感觉还行"在原型阶段可以，但在生产环境不够：

- **主观感受不可靠。** 10 个问题试得好，第 11 个用户可能碰到边界情况，答案完全错误。
- **优化方向不明确。** 检索效果差，是 Embedding 的问题？Chunking 的问题？还是 Reranker 的问题？
- **回归检测缺失。** 修改参数修复了 A 问题但引入了 B 问题，没有自动化评估就无法发现。

## 二、RAGAS 评估框架

RAGAS（Retrieval Augmented Generation Assessment）是当前最主流的 RAG 评估框架，从四个维度评估：

### Context Precision（上下文精确率）

**问题**：检索到的 Chunk 中，有多少是真正相关的？

检索返回了很多不相关的内容 → 浪费 Prompt 空间，可能误导 LLM。Context Precision 低说明检索噪声大，需要加 Reranker 或调整检索参数。

### Context Recall（上下文召回率）

**问题**：回答问题所需的信息，是否都被检索到了？

检索遗漏了关键信息 → LLM 无法生成完整答案。Context Recall 低通常意味着 Embedding 模型匹配能力不足，或者 Chunking 切断了关键信息。

### Faithfulness（忠实度）

**问题**：LLM 的答案是否严格基于检索内容，有没有编造？

把答案拆分成多个陈述（claim），检查每个陈述能否从检索到的 Chunk 推导出来。能推导的比例就是忠实度。在医疗、法律等高风险场景，Faithfulness 必须接近 1.0。

### Answer Relevancy（答案相关性）

**问题**：答案是否真正回答了用户的问题？

用 LLM 从答案反向生成可能的问题，计算生成的问题与原始问题的相似度。答案跑题了 → 相关性低。

### 用 RAGAS 跑评估

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
from datasets import Dataset

eval_data = {
    "question": ["退货政策是什么？", "保修期多长？", "SKU12345的价格？"],
    "ground_truth": ["7天内可退货", "整机保修1年", "299元"],
    "contexts": [["退货政策规定7天内可无条件退货..."], ["保修条款：整机保修1年..."], ["价格表：SKU12345 299元..."]],
    "answer": ["根据政策，7天内可以退货。", "保修期为1年。", "SKU12345的价格是299元。"],
}

results = evaluate(
    Dataset.from_dict(eval_data),
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
)
print(results)
```

### 评估数据的准备

评估的关键不是框架，而是**数据**。你需要：

- **50-200 个有代表性的问题**，覆盖不同类型（事实性、推理类、边界情况）
- **标准答案**（人工标注）
- **相关文档片段**（人工标注）

没有标注数据，评估指标无法计算。标注质量直接决定评估的可信度。

## 三、反事实测试（Counterfactual Testing）

2026 年最重要的评估方法不是看"检索准不准"，而是回答一个更根本的问题：**检索是否因果地改变了答案？**

### Context Ablation（上下文消融）

同一个问题，分别**有检索**和**无检索**两种情况下回答。如果两个答案一样，说明检索没起作用——这个问题 LLM 自己就能回答，检索是浪费的。

```python
def context_ablation_test(question, rag_system, llm):
    """对比有检索 vs 无检索的答案"""
    # 有检索
    answer_with_rag = rag_system.query(question)

    # 无检索（直接让 LLM 回答）
    answer_without_rag = llm.invoke(
        f"请回答以下问题，如果你不确定请说明：{question}"
    )

    # 对比两个答案
    comparison = llm.invoke(
        f"比较以下两个答案是否实质相同：\n"
        f"答案A（有检索）：{answer_with_rag}\n"
        f"答案B（无检索）：{answer_without_rag}\n"
        f"只回答 SAME 或 DIFFERENT"
    )
    return comparison.strip()
```

### Counterfactual Perturbation（反事实扰动）

把检索到的**强相关** Chunk 替换成**弱相关**或**随机** Chunk。如果答案没变，说明模型根本没用检索到的内容——它在凭训练数据回答。

```python
def counterfactual_perturbation_test(question, rag_system):
    """替换强检索结果为弱结果，观察答案是否变化"""
    # 正常检索（强 Chunk）
    strong_results = rag_system.retrieve(question, top_k=3)
    answer_strong = rag_system.generate(question, strong_results)

    # 替换为随机 Chunk
    random_results = rag_system.random_chunks(k=3)
    answer_weak = rag_system.generate(question, random_results)

    # 答案没变 → 模型没在用检索上下文
    return answer_strong, answer_weak
```

### 为什么反事实测试重要

传统指标（相似度、召回率）只能告诉你检索和好答案**相关**。反事实测试告诉你检索和好答案之间是否有**因果关系**。一个检索系统可能检索到了相关内容，但模型根本没用这些内容——这时候优化检索是白费力气，应该优化生成阶段的 Prompt 或模型。

## 四、LLM-as-judge

2026 年生产环境最常用的评估模式：用强 LLM（GPT-4、Claude）评估另一个 LLM 的输出。

**优势：**
- 比人工评估快得多、便宜得多
- 与人类判断的一致率约 85-90%（RAG 任务）
- 可以评估 Faithfulness、Answer Relevancy 等多个维度

```python
def llm_judge_eval(question, answer, context, judge_llm):
    """用 LLM 做 judge 评估"""
    prompt = f"""请评估以下 RAG 系统的输出质量。

问题：{question}
检索到的上下文：{context}
系统回答：{answer}

请从以下维度评分（1-5分）：
1. 忠实度：回答是否严格基于上下文，没有编造
2. 相关性：回答是否真正回答了问题
3. 完整性：回答是否包含了上下文中所有相关信息

输出 JSON 格式：{{"faithfulness": N, "relevancy": N, "completeness": N, "reason": "..."}}"""

    return judge_llm.invoke(prompt)
```

**局限。** LLM judge 本身也可能有偏见——倾向于给自己的"同类"打高分。建议用不同厂商的模型做 judge（比如用 Claude 评估 GPT 的输出），减少偏见。

## 五、评估数据准备

| 数据项 | 说明 | 数量建议 |
|--------|------|---------|
| 问题集 | 覆盖不同类型的有代表性问题 | 50-200 个 |
| 标准答案 | 每个问题的正确答案（人工标注） | 与问题集等量 |
| 相关文档 | 每个问题对应的相关文档片段 | 与问题集等量 |
| 边界问题 | 知识库无法回答的问题 | 10-20 个 |

问题类型分布建议：60% 事实性（"XX 是多少"），25% 推理类（"为什么 XX"），15% 边界情况（超出范围、歧义问题）。

## 六、生产环境监控

上线后持续监控，设置告警：

```python
# 生产监控指标
metrics_to_track = {
    "faithfulness": {"threshold": 0.85, "alert": "低于0.85 → 可能出现幻觉"},
    "answer_relevancy": {"threshold": 0.80, "alert": "低于0.80 → 答案跑题"},
    "retrieval_latency_p95": {"threshold": 500, "alert": "超过500ms → 用户等待过长"},
    "cost_per_query": {"threshold": 0.03, "alert": "超过$0.03 → 成本异常"},
}
```

建议每周抽样 50 条生产日志做人工评估，每月做一次完整评估报告。

## 七、常见误区

**误区 1：文档质量不重要。** 文档格式混乱、内容过时、表述模糊，再好的检索策略也救不回来。数据质量决定上限。

**误区 2：向量检索一定优于关键词检索。** 包含专有名词、产品编号的场景，BM25 往往更准。Hybrid Search 才是安全选择。

**误区 3：更大的 Chunk 一定更好。** 大 Chunk 保留上下文但引入噪声，小 Chunk 精准但可能丢失上下文。必须通过实验找到最优粒度。

**误区 4：RAG 能完全替代微调。** RAG 解决知识获取，微调解决模型行为。让模型学习特定回答风格和推理模式，RAG 做不到。

## 八、模型微调

当评估发现瓶颈在模型本身时，微调是下一步。

### 什么时候需要微调

| 组件 | 触发条件 | 预期收益 |
|------|---------|---------|
| **Embedding** | 通用模型在领域术语上匹配差，Context Recall 持续偏低 | 5-25% 提升 |
| **Reranker** | 检索结果排序不合理，相关文档排在后面 | 10-30% 提升（最高 ROI） |
| **LLM** | Faithfulness 低，模型不善于利用检索上下文 | 行为改善 |

### Embedding 微调

核心是对比学习：让语义相似的文本对距离更近，不相似的更远。

```python
from sentence_transformers import SentenceTransformer, InputExample, losses
from torch.utils.data import DataLoader

# 准备训练数据：查询 + 正样本 + 负样本
train_examples = [
    InputExample(texts=["退货流程是什么", "退货需先联系客服，填写退货申请表"], label=1.0),
    InputExample(texts=["退货流程是什么", "换货需在15天内联系客服"], label=0.0),
    # 困难负样本是关键：用"看似相关但实际不对"的文档
]

model = SentenceTransformer("BAAI/bge-large-zh")
train_dataloader = DataLoader(train_examples, shuffle=True, batch_size=16)
train_loss = losses.CosineSimilarityLoss(model)

model.fit(train_objectives=[(train_dataloader, train_loss)], epochs=3, warmup_steps=100)
```

**关键技巧：困难负样本挖掘。** 不要用完全不相关的负样本（"退货流程" vs "天气预报"），要用"看似相关但实际不对"的（"退货流程" vs "换货流程"）。这能让模型学到更精细的语义区分。

### Reranker 微调

Reranker 微调通常 ROI 最高，10-30% 的排序质量提升。

```python
from sentence_transformers import CrossEncoder

model = CrossEncoder("BAAI/bge-reranker-large")

# (query, document) → score (1=相关, 0=不相关)
train_data = [
    ("退货时限", "退货政策规定7天内可退货", 1),
    ("退货时限", "换货政策规定15天内可换货", 0),  # 困难负样本
]

model.fit(train_data, epochs=3, batch_size=16)
```

### LLM 微调

LLM 微调在 RAG 场景下让模型更好地利用检索上下文。训练数据是（问题 + 检索上下文 + 期望答案）三元组。

**LoRA 足够。** 大多数 RAG 场景用 LoRA（r=16，只微调 q_proj/v_proj）就够了，不需要全量微调。成本低、速度快、不容易过拟合。

```python
from peft import LoraConfig, get_peft_model

lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "v_proj"],
    task_type="CAUSAL_LM",
)
model = get_peft_model(base_model, lora_config)
```

### 微调 vs RAG 的权衡

| 维度 | RAG | 微调 |
|------|-----|------|
| 知识更新 | 实时（更新文档即可） | 需要重新训练 |
| 部署成本 | 需要向量数据库 | 需要 GPU 训练资源 |
| 适用场景 | 事实性知识、动态信息 | 推理模式、输出风格、领域术语 |
| 组合使用 | 可以同时用 | 微调后 + RAG 效果更好 |

最佳实践：先用 RAG 解决知识获取，再用微调解决模型行为。两者互补，不是二选一。

## 九、EU AI Act 与合规

如果 RAG 系统用于高风险场景（医疗、金融、招聘），EU AI Act 要求：

- **透明度**：用户必须知道自己在与 AI 系统交互
- **可追溯性**：每个答案必须能追溯到源文档（statement-level 引用）
- **人工监督**：建立人工审核 AI 输出的机制
- **风险管理**：定期评估和测试，记录评估结果

实现建议：每个生成的答案附带完整的引用链（答案 → Chunk → 文档 → 页码），存储查询日志用于审计。

## 延伸阅读

- [RAGAS 论文](https://arxiv.org/abs/2309.15217) — 评估框架原始论文
- [BGE Embedding 微调指南](https://huggingface.co/BAAI/bge-large-zh) — 中文 Embedding 微调
- [LoRA 论文](https://arxiv.org/abs/2106.09685) — 参数高效微调方法
- [EU AI Act](https://artificialintelligenceact.eu/) — AI 系统合规要求
- [高级专题与工程实战](advanced-topics-and-engineering.md) — 生产级部署实践
