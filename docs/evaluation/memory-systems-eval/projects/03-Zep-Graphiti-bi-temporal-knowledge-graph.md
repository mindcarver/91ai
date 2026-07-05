# Zep + Graphiti:bi-temporal 知识图谱记忆深度技术解析

> 项目地址:Graphiti 引擎在 https://github.com/getzep/graphiti(约 28303 star,Apache-2.0);Zep 服务端在 getzep/zep。本次实测用的是 Graphiti 引擎 + FalkorDB。本文技术细节来自源码、官方文档与本次 FalkorDB + gpt-5.4 下的 L1 实测。

## 一、项目定位与一句话概括

Graphiti 是 Zep 团队开源的"实时、bi-temporal(双时序)知识图谱"引擎,专门给 AI agent 做记忆。和 Mem0 / LangMem 的事实抽取不同,Graphiti 不是把对话压成扁平的事实列表,而是把对话抽成实体 + 关系 + 边的图,而且每条边都带两个时间维度:事实本身的"有效时间"(这条事实什么时候为真)和"事件时间"(这条事实什么时候被记录进来)。这样它就能回答"用户上个月住哪""用户的预算什么时候从 4500 改成 6000"这类时序问题——这是扁平事实记忆做不到的。

一句话:Graphiti = 一个给 agent 用的、带双时序的知识图谱,把对话实时抽成带时间戳的实体-关系图。

## 二、仓库与社区元数据

- 引擎主仓 `getzep/graphiti`,Apache-2.0,约 28303 star。语言 Python。PyPI `graphiti-core`。
- Zep 服务端 `getzep/zep`(Graphiti 的托管 / 企业版形态)。
- 最新 release graphiti-core v0.29.x,活跃维护(2026-07-02 仍有提交)。
- 有 arXiv 论文(State-of-the-art Agent Memory),报告 DMR benchmark 94.8% vs MemGPT 93.4%。

## 三、整体技术架构

Graphiti 的架构是"图抽取 + 时序图存储 + 图检索":

**图抽取层。** 摄入一段 episode(会话 / 文档)时,LLM 把内容抽成实体节点 + 关系边。每条边带 `valid_at`(事实有效起点)/ `invalid_at`(事实失效点)/ `created_at`(记录时间)/ `expired_at`(逻辑过期)。这是 bi-temporal 的核心——同一个"用户住哪"关系,可以有旧边(valid_at=过去, invalid_at=改的时候)和新边(valid_at=现在)并存,检索时按时间过滤。

**图存储层。** 默认 Neo4j 5.26,或 FalkorDB 1.1.2(Redis 协议,本地常用)、Kuzu、Neptune。Graphiti 通过 driver 抽象支持多种图库。

**embedding 层。** 实体节点 + 边还会被 embed(向量),存图库或单独向量库,支持混合检索(图遍历 + 向量相似度)。

**检索层。** `search(query)` 返回 `EntityEdge`(实体边,带 fact 文本 + 时间)。可以按 group_id(用户 / 会话隔离)、center_node、时间过滤。

**cross-encoder reranker。** 默认用 OpenAI reranker 重排结果(本地用要换成 OpenAIRerankerClient 指向本地,否则 search 时会调 OpenAI 失败)。

## 四、核心记忆模型与实现原理

**bi-temporal 是核心差异点。** 普通 fact memory 存"用户预算 6000",但不知道这是什么时候的、是不是最新的、之前是多少。Graphiti 存的是一条带时间的边:{"用户-预算":6000, valid_at:2026-07-02, invalid_at:null}(当前有效),如果之后改了,旧的边 invalid_at 被设上,新边加进来。这样你能查"现在的预算"或"上周的预算"或"预算什么时候变的"。

**LLM 抽实体 + 关系。** episode 进来,LLM 输出结构化的实体 + 边(JSON,graphiti 用 pydantic 模型约束)。这要求 LLM 严格按 schema 输出——这是它在小本地模型上的主要失败点:小模型经常产出不匹配 schema 的 JSON,导致抽取 / 摄入失败。官方推荐用 `json_object` 模式(把 schema 注入 prompt)而非 `json_schema`(依赖模型严格遵守),并优先用能力强的模型。

**矛盾消解。** 新事实进来时,graphiti 会找相关的已有边,把旧的设为 invalid,新的设为 valid——这是它对"事实更新"的原生支持,比 Mem0 的 ADD-only 强。

## 五、端到端数据流

本次实测(Graphiti + FalkorDB:6390 + gpt-5.4 经中转站):

1. **建图 client**:`OpenAIGenericClient(LLMConfig(api_key, base_url, model="gpt-5.4", small_model="gpt-5.4"), structured_output_mode='json_object')` + `OpenAIEmbedder(config=OpenAIEmbedderConfig(embedding_dim=2560, embedding_model="qwen3-embedding:4b", api_key="ollama", base_url="http://localhost:11434/v1"))` + `FalkorDriver(host="localhost", port=6390)`,然后 `g = Graphiti(graph_driver=..., llm_client=..., embedder=...)`。注意 embedder 必须留本地 ollama(中转站无 embedding);LLM 用 gpt-5.4 必须用 json_object 模式。
2. **建索引**:`await g.build_indices_and_constraints()`(在图库里建约束 / 索引)。
3. **摄入**:`await g.add_episode(name, episode_body=对话文本, source_description=uid, reference_time=datetime, source=EpisodeType.message, group_id=uid)`。内部:LLM 抽实体 + 边 → embed → 写图库(带时间戳)→ 矛盾消解(把相关旧边设为 invalid)。
4. **检索**:`await g.search(query, num_results=6, group_ids=[uid])` → 返回 `EntityEdge` 列表,每条带 `.fact`(事实文本)。

## 六、技术栈与依赖

- Python 引擎 `graphiti-core`。依赖:neo4j>=5.26(或 falkordb / kuzu / neptune driver)、openai SDK、pydantic、tenacity(重试)、posthog(遥测);可选 anthropic / groq / google-genai / voyageai / sentence-transformers。
- 图库:Neo4j 5.26(默认)或 FalkorDB 1.1.2(本地常用,Redis 协议)。
- embeddings:OpenAI 兼容 / SentenceTransformers / Voyage。
- cross-encoder reranker:默认 OpenAI(ms-marco 等),本地用要换。

## 七、本地部署与 LLM 后端(ollama)

官方明确支持本地:用 `OpenAIGenericClient`(注意不是 `OpenAIClient`)指向 `http://localhost:11434/v1`,LLM 和 embedding 都指 ollama。本次实测改用 gpt-5.4 经中转站做 LLM(因为 qwen2.5:14b 结构化输出不稳),embedding 仍留 ollama qwen3-embedding——这是混合后端。

配置坑:graphiti 的 `Graphiti.__init__` 会自动创建一个 `OpenAIRerankerClient`(指向 OpenAI),如果没设 OPENAI_API_KEY / OPENAI_BASE_URL,init 就崩;设了但 ollama / 中转站无 /rerank 端点,search 时 rerank 调用会失败(被 try/except 兜住,但 rerank 实际没生效)。

## 八、MCP 集成

Graphiti 暴露一个(实验性)MCP server(mcp_server/ 子目录,HTTP transport),让 MCP 客户端能往图里加 episode / 检索。也消费外部 MCP。

## 九、云门控与商业模型

- OSS Graphiti 库 + 本地 Neo4j / FalkorDB + 本地 ollama:完全本地,无需付费 key。
- Zep 云:托管图 + 企业特性(规模 / 鉴权 / SLA),付费。
- 高级 recall 不云锁(和某些工具不同)——recall 在本地图库上跑。

## 十、性能与基准

官方自报(L3):LongMemEval 63.8%(aggregate +18.5% vs 之前方法,个别 eval +100%);arXiv 论文报告 DMR 94.8% vs MemGPT 93.4%。在独立第三方横评里,Graphiti 的 63.8% 是最高之一(对比 Mem0 自报 94% 但独立复现 49%)。

本次实测(L1,统一 gpt-5.4 reader+judge):冒烟 50%(6/12),LongMemEval 0%(3 题全错)。冒烟里抽取丢了 FF 号 / 饮食 / 偏好 / 猫数量 / 年龄,关系 / 时序结构(工作 / 预算更新 / 公寓 / 护照 / 会议)抽得好。LongMemEval temporal 题抽到了相关事实(MoMA tour / Met exhibit)但 `valid_at` 日期解析报错("Error parsing valid_at date, skipping")导致推理失败;knowledge-update 也失败。

## 十一、已知问题与失败模式

- **小本地模型抽取丢值 + 结构化输出失败**:qwen2.5:14b 经常产出不匹配 schema 的 JSON,抽取 / 摄入失败;且会丢具体值。这是本次 50% / 0% 的主因。需要强模型(Opus / GPT-5 级)。
- **需要图库**:Neo4j / FalkorDB / Kuzu,不是零依赖(FalkorDB 是最轻的 Docker 选项)。
- **日期解析脆弱**:`valid_at` 解析报错会跳过该边,bi-temporal 优势打折。
- **cross-encoder reranker 默认指 OpenAI**:本地用要换,否则 search 时失败。
- **embedding_dim 必须配对**:qwen3-embedding 是 2560 维,默认示例常假设 nomic 的 768 维,配错会写库失败。
- **摄取慢**:每条 episode 多次 LLM 调用(抽实体 / 抽边 / 矛盾消解),大 haystack 上慢。

## 十二、本次实测发现(L1)

本次 FalkorDB + gpt-5.4(经中转站)+ ollama embedding:

- **冒烟 50%**:关系 / 时序结构抽得好,具体值丢得严重。
- **LongMemEval 0%**:temporal 日期解析失败、knowledge-update 失败。
- **证伪"时序优势"假设**:理论 bi-temporal 强,但在本地 / 中等模型抽取下因日期解析脆弱没兑现。
- **配置摩擦**:reranker 默认 OpenAI、json_schema 模式 gpt-5.4 不守、FalkorDB 端口冲突(被其他 redis 占 6379/6380,要换 6390)。

## 十三、适用场景与选型建议

适合:需要真正的时序 / 关系结构(事实变更追踪、实体关系推理)、能给抽取配强模型、能运维一个图库。Graphiti 在强模型 + 时序需求下是最佳选择。

不适合:本地小模型(抽取丢值 + 结构化崩)、要零依赖、要简单事实召回(那 Mem0 更轻)。

建议标签:**先试点**(理论强,但本地 qwen / gpt-5.4 下都 50% / 0%;需强模型才兑现)。如果你需要时序,这是最专业的选择,但务必配 Opus / GPT-5 级抽取模型,否则丢值严重。

## 十四、与同类对比

- vs **Cognee**:都是知识图谱。Graphiti 重时序(bi-temporal),Cognee 重 GraphRAG + 可换 Kuzu 本地图(零外部依赖)。两者在本地小模型下都受结构化输出之苦。
- vs **Mem0**:Graphiti 是图(时序强),Mem0 是扁平事实(轻、生态大)。Mem0 冒烟 83% > Graphiti 50%(本地 qwen/gpt-5.4),但 Graphiti 时序能力是 Mem0 没有的。
- vs **Supermemory**:Supermemory 也有矛盾消解(所以 LME knowledge-update 对了),但它是闭源图谱引擎;Graphiti 是开源 bi-temporal,时序更严谨。

## 附录 A:实测可用配置(FalkorDB + gpt-5.4)

本次实测跑通的 Graphiti 配置(异步,Python):

```python
import os, asyncio
os.environ.setdefault("OPENAI_API_KEY", os.environ["ACW_API_KEY"])     # reranker client init 需要
os.environ.setdefault("OPENAI_BASE_URL", os.environ["ACW_BASE_URL"])
from graphiti_core import Graphiti
from graphiti_core.driver.falkordb_driver import FalkorDriver
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.nodes import EpisodeType
from datetime import datetime

llm = OpenAIGenericClient(
    LLMConfig(api_key=os.environ["ACW_API_KEY"], base_url=os.environ["ACW_BASE_URL"],
              model="gpt-5.4", small_model="gpt-5.4"),
    structured_output_mode="json_object")   # 关键:gpt-5.4 不守 json_schema,必须 json_object
embedder = OpenAIEmbedder(config=OpenAIEmbedderConfig(
    embedding_dim=2560, embedding_model="qwen3-embedding:4b",          # embedding 留本地 ollama
    api_key="ollama", base_url="http://localhost:11434/v1"))
g = Graphiti(graph_driver=FalkorDriver(host="localhost", port=6390),    # FalkorDB docker 在 6390
             llm_client=llm, embedder=embedder)

async def main():
    await g.build_indices_and_constraints()
    await g.add_episode(name="ep1", episode_body="User is Daniel, FF XQ-7712-3309, has cat Pepper 7yo.",
                        source_description="u1", reference_time=datetime(2026,7,3),
                        source=EpisodeType.message, group_id="u1")
    res = await g.search("cat name and age?", num_results=5, group_ids=["u1"])
    for e in res: print(e.fact)
asyncio.run(main())
```

每一行的实测教训:`structured_output_mode="json_object"`(不是默认 json_schema)是关键——中转站 gpt-5.4 不严格遵守 json_schema 约束会返回裸 JSON list,破坏 `ExtractedEntities(**resp)`;embedding 必须留本地 ollama(中转站无 embedding 模型);FalkorDB 端口要避开被占的 6379/6380(本机其他 redis 占着,换 6390);`OPENAI_API_KEY/BASE_URL` env 要设(让 reranker client init 不崩,虽然 ollama/中转站无 /rerank 端点,search 时 rerank 调用会被 except 兜住)。

## 附录 B:bi-temporal 双时序的实现细节

bi-temporal 是 Graphiti 区别于所有扁平事实记忆的核心。两个时间维度的精确含义:

**valid time(有效时间)**:事实本身在现实世界里"为真"的时间区间。`valid_at` = 起点有效,`invalid_at` = 失效点。用户 2026-01 到 2026-06 住 A,2026-06 起住 B,那么有两条边:{"住:A", valid_at:2026-01, invalid_at:2026-06} 和 {"住:B", valid_at:2026-06, invalid_at:null}。

**transaction time(事件 / 记录时间)**:这条事实被记录进图的时间(`created_at` / `expired_at`)。用户在 2026-07 告诉 agent "我一月份住 A",那么 {"住:A", valid_at:2026-01, created_at:2026-07}(事实有效时间在过去,记录时间是现在)。

这两个维度正交,支持四类查询:现在的事实(valid_at<=now<invalid_at)、某历史时刻的事实(as-of valid time)、某时刻我们知道什么(as-of transaction time)、事实何时变更(边的 valid/invalid 区间)。这是扁平事实记忆(Mem0 / LangMem)做不到的——它们的事实没有有效区间。

但 bi-temporal 的代价:抽取阶段要让 LLM 从对话里**解析出时间**并写到 `valid_at`。这一步是脆弱的——本次实测 temporal 题就栽在 `Error parsing valid_at date, skipping`(LLM 抽出的时间字符串 graphiti 解析不了)。这是 bi-temporal 在本地 / 中等模型下的主要失效点。

## 附录 C:图抽取的 schema 与结构化输出问题

Graphiti 摄入时让 LLM 输出结构化的实体 + 边(JSON,pydantic 模型约束)。这是它在小模型上的主要失败点:

**两种 structured output 模式**:`json_schema`(让模型严格遵守 schema)和 `json_object`(模型输出 JSON,graphiti 把 schema 注入 prompt)。默认是 json_schema。但很多模型(包括本次的 gpt-5.4 经中转站)不严格遵守 json_schema——会返回裸 JSON list 或缺字段,破坏 `ExtractedEntities(**resp)`。解决:切到 `json_object` 模式,让 graphiti 把 schema 写进 prompt 文字给模型显式指令。本次实测这个切换让 gpt-5.4 能跑通(但还是丢值——schema 模式解决的是"能不能产出结构化输出",不是"产出质量")。

**小模型的失败模式**:qwen2.5:14b 这类小模型会产出不匹配 schema 的 JSON(缺字段、多余字段、类型错),graphiti 用 instructor + tenacity 重试(指数退避),反复失败 → InstructorRetryException。本次 cogee 也是同样问题(graphiti 和 cogee 都用 litellm+instructor)。这就是为什么图类记忆在本地小模型下特别脆弱。

**抽取丢值**:即使结构化输出成功,LLM 抽实体 + 关系时会丢掉某些事实类型。本次 graphiti 冒烟丢了 FF 号 / 饮食 / 偏好 / 猫数量 / 年龄——这些事实被 LLM 判断为"不重要"或没被识别成实体。关系 / 时序结构(工作 / 预算 / 公寓 / 护照 / 会议)抽得好,因为它们是明确的实体-关系。这是图抽取的固有偏向:重结构,轻琐碎事实。

## 附录 D:图库选型与 FalkorDB

Graphiti 通过 driver 抽象支持多种图库:

- **Neo4j 5.26**:默认,功能最全,但重(Java,独立 server)。
- **FalkorDB 1.1.2**:Redis 协议的图库,Docker 一行起,本地常用。本次用它(端口 6390)。它用 Redis 协议,所以端口冲突要小心(本机多个 redis 占 6379/6380)。
- **Kuzu**:嵌入式本地文件图库(零 server),cognee 默认用它。
- **Neptune**:AWS 托管。

选型:本地开发用 FalkorDB(轻)或 Kuzu(更轻,嵌入式);生产用 Neo4j 或 Neptune。Graphiti 的查询在不同图库上语义一致(driver 抽象)。

## 附录 E:何时该选 Graphiti,何时不该

**该选 Graphiti**:你的记忆需求本质是"关系 + 时序"——用户 / 组织 / 事件之间的结构化关系,且事实会随时间变化(合同、地址、职务、偏好演变),你需要回答"现在 / 某时 / 何时变"这类问题。这是扁平事实记忆做不到的。而且你能给抽取配强模型(Opus / GPT-5 级,严格守 schema + 不丢值)。

**不该选 Graphiti**:你只要简单事实召回(用户叫什么、偏好什么)——Mem0 更轻、本地小模型更稳。你本地只能跑小模型——graphiti 抽取会丢值 + 结构化崩,拿不到图的优势。你怕运维图库——FalkorDB / Kuzu 已经很轻,但仍比"一个 pip 包"重。

本次实测的诚实结论:Graphiti 在"理论能力"上是最专业的时序记忆,但在"本地 / 中等模型下实际表现"上是这次评测里最差的之一(冒烟 50% / LME 0%)。这两者不矛盾——差距全在抽取模型质量。换 Opus 级抽取,graphiti 的时序 / 关系优势才能兑现。所以选型时,先把"我能给抽取配多强的模型"这个问题回答清楚,再决定要不要上 Graphiti。如果答案是"只能本地小模型",Graphiti 不是好选择,Mem0 / Letta(file-text)更合适。
