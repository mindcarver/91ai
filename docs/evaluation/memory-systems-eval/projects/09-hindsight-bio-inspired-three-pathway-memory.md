# Hindsight(Vectorize):生物启发的三通路 agent 记忆深度技术解析

> 项目地址:https://github.com/vectorize-io/hindsight 。License:MIT。约 17900 star(2026-07-03 实测)。PyPI `hindsight-all` / `hindsight`。本文技术细节来自源码、官方文档与本次安装尝试(Python 3.13 legacy 失败)。

## 一、项目定位与一句话概括

Hindsight 是 Vectorize 团队开源的 agent 记忆系统,定位是"生物启发的记忆引擎"。它把记忆组织成三条通路(three pathways):**World**(关于世界 / 用户的事实)、**Experiences**(agent 自己的经历)、**Mental Models**(学到的抽象模式)。核心操作是 `retain()`:用 LLM 把会话抽成事实 / 实体 / 关系 / 因果链 / 时序数据,存进规范化的实体 + 关系结构,带嵌入;检索时做混合检索 + cross-encoder reranker。自报 91.4%(Gemini-3 Pro backbone,首个破 90% 的 agent 记忆系统)。

一句话:Hindsight = 生物启发的三通路(World / Experiences / Mental Models)agent 记忆,自带嵌入式 Postgres + MCP。

## 二、仓库与社区元数据

- 主仓 `vectorize-io/hindsight`,MIT,约 17900 star。
- 语言 Python(server / SDK)+ Next.js / TypeScript(Control Plane UI)。
- PyPI `hindsight-all`(含嵌入式 Postgres + 引擎,零配置)/ `hindsight`。
- 还有 Control Plane UI(Next.js)。

## 三、整体技术架构

Hindsight 的架构是"三通路记忆 + 嵌入式 Postgres + 多后端 LLM":

**三通路记忆(three pathways)。** 这是它的设计哲学:
- **World**:关于世界 / 用户的事实(谁、什么、何时、何地)。
- **Experiences**:agent 自己的经历(做了什么、结果如何)。
- **Mental Models**:从经验抽象出的模式 / 偏好 / 启发式规则。
这种分层模仿人类记忆(情景 / 语义 / 程序),比扁平事实记忆更结构化。

**retain 操作。** `retain()` 是核心摄入操作:LLM 把会话抽成事实 / 实体 / 关系 / 因果链 / 时序数据,写进规范化的实体 + 关系结构(带嵌入)。这是 LLM 驱动的结构化抽取(类似 Graphiti / Cognee 的图抽取,但分三通路)。

**嵌入式 Postgres(pg0)。** 默认带一个嵌入式 Postgres + pgvector(HNSW),零配置(`pip install hindsight-all` 就能跑,无需外部 DB)。也可用外部 Postgres。

**多后端 LLM / embed。** 支持 Ollama / OpenAI / Anthropic / Groq / Gemini / DeepSeek / z.ai / LM Studio / llama.cpp / LiteLLM;embeddings 支持 SentenceTransformers(BAAI/bge-small-en-v1.5 默认,本地)/ ONNX / TEI / OpenAI / Cohere;cross-encoder reranker(ms-marco-MiniLM-L-6-v2,本地)。

**MCP server(内置)。** `HINDSIGHT_API_MCP_ENABLED=true` 启用,把记忆暴露给 MCP 客户端。

**文件解析。** markitdown 做默认文件解析(PDF / docx 等)。

## 四、核心记忆模型与实现原理

Hindsight 的记忆模型是"三通路 + 结构化抽取 + 混合检索"。

**三通路的意义。** 区分 World(事实)/ Experiences(agent 经历)/ Mental Models(抽象模式)让记忆有层次:Mental Models 是从多次 Experience 抽象出的(类似"用户偏好早上开会"),World 是具体事实("用户叫 Daniel")。这种分层比扁平事实记忆更适合 agent 的长期学习。

**retain() 的结构化抽取。** retain 用 LLM 抽事实 / 实体 / 关系 / 因果链 / 时序,写规范化结构。这和 Graphiti / Cognee 类似(LLM 抽结构),所以也受"小模型结构化输出不稳"的影响——但 Hindsight 推荐 Gemini-3 Pro 级 backbone,自报 91.4% 是在强模型下。

**混合检索 + reranker。** 检索时:向量召回 + (可能的图遍历)+ cross-encoder reranker(ms-marco-MiniLM,本地)重排。

**本地优先。** 嵌入式 Postgres + SentenceTransformers + 本地 reranker + ollama LLM = 完全本地,几乎无云门控。

## 五、端到端数据流

(基于文档;本次未实测跑通——Python 3.13 安装失败)

1. **安装 + 起 server**:`pip install hindsight-all -U`(含嵌入式 Postgres),起 Hindsight API server(MCP 可选)。
2. **配 LLM**:`HINDSIGHT_API_LLM_PROVIDER=ollama` + `HINDSIGHT_API_LLM_MODEL=gpt-oss:20b`(自动探测 localhost:11434)。
3. **retain**:`retain(conversation)` → LLM 抽三通路事实 → 写 Postgres + pgvector。
4. **检索**:`recall(query)` → 向量 + reranker → 返回相关记忆。
5. **MCP**:客户端通过 MCP 工具调 retain / recall。

## 六、技术栈与依赖

- 嵌入式 Postgres + pgvector(HNSW)或外部 Postgres。
- LLM:多后端(ollama / OpenAI / Anthropic / Groq / Gemini / DeepSeek / z.ai / LM Studio / llama.cpp / LiteLLM)。
- embeddings:SentenceTransformers(BAAI/bge-small-en-v1.5 默认)/ ONNX / TEI / OpenAI / Cohere。
- reranker:cross-encoder ms-marco-MiniLM-L-6-v2(本地)。
- 文件解析:markitdown。
- Python 3.13+ / uv(源码开发)。

## 七、本地部署与 LLM 后端(ollama)

官方明确支持:`HINDSIGHT_API_LLM_PROVIDER=ollama` + `HINDSIGHT_API_LLM_MODEL=gpt-oss:20b`(自动探测 localhost:11434,可 `HINDSIGHT_API_LLM_BASE_URL` 覆盖)。embeddings 默认本地 SentenceTransformers(不需要 ollama)。所以 ollama 只作 LLM,embed 留本地 SentenceTransformers——这又是 embedding-gap(embed 不走统一 qwen3-embedding,但走本地 SentenceTransformers,仍本地)。

几乎无云门控:`HINDSIGHT_API_LLM_PROVIDER=ollama`(+ llamacpp/lmstudio/none)+ 本地 embed + 本地 reranker + 嵌入式 Postgres = 完全离线,无 API key。

## 八、MCP 集成

**内置 MCP server**:`HINDSIGHT_API_MCP_ENABLED=true` 启用,把记忆暴露给 MCP 客户端(retain / recall 工具)。

## 九、云门控与商业模型

**几乎无云门控**(本地用)。本地 ollama + 本地 embed + 本地 reranker + 嵌入式 Postgres 完全离线。Vectorize 的云是托管 / 规模,不是功能门控。

## 十、性能与基准

官方自报(L3):91.4% 总体准确率(backbone=Gemini-3 Pro,首个破 90% 的 agent 记忆系统)。注意这是用极强 backbone(Gemini-3 Pro)跑的,本地复现不到——换本地模型分数会低很多。

本次实测:**BLOCKED**——Python 3.13 下安装失败(error: use_2to3 is invalid),某个依赖用了已废弃的 use_2to3,和 Python 3.13 不兼容。需 Python 3.11 或 patch 才能跑。未得 L1 分。

## 十一、已知问题与失败模式

- **Python 3.13 安装失败(本次主问题)**:某依赖用 `use_2to3`(setuptools 已废弃),Python 3.13 装不上。需 py3.11 或 patch 依赖。
- **本地 retain 慢**:每 call 15-20 秒(Apple Silicon),CPU 更慢;默认阻塞(用 async_=True 非阻塞)。首次还付模型下载成本。
- **结构化抽取依赖强模型**:retain 的 LLM 抽取要可靠结构化输出,小模型不稳(同 Graphiti / Cognee)。自报 91.4% 是 Gemini-3 Pro,本地弱模型会差。
- **大模型 RAM**:gpt-oss:20b ~16GB + 嵌入式 Postgres,总需 24GB+ RAM。
- **reranker 本地**:cross-encoder 本地 rerank 加延迟。

## 十二、本次实测发现(L1 尝试)

本次 Hindsight 安装失败(Python 3.13 legacy use_2to3)。未得有效分。这是"环境不匹配"而非工具不可用——换 Python 3.11 可能跑通。文档化为 BLOCKED(py3.13)。

## 十三、适用场景与选型建议

适合:需要 agent 记忆的三通路分层(World / Experiences / Mental Models)、要本地优先(嵌入式 Postgres + 本地 embed/rerank)、能给 retain 配强模型、用 Python 3.11。

不适合:Python 3.13 环境(legacy 依赖)、只能本地弱模型(retain 抽取要强模型)、要轻量(embedded Postgres + 大模型 RAM 重)。

建议标签:**观望 / 试点**(自报 91.4% 强但 Gemini-3 Pro backbone + py3.13 装不上;需 py3.11 + 强模型验证)。

## 十四、与同类对比

- vs **Letta**:都是 agent runtime + 自带 MCP。Hindsight 嵌入式 Postgres(零配置)vs Letta docker-compose(重)。Hindsight 自报 91.4%(Gemini-3 Pro)vs Letta 74%(GPT-4o-mini)。本次 Letta 实测 100%(glm-4.7),Hindsight 没跑通。
- vs **Graphiti / Cognee**:都是结构化抽取记忆。Hindsight 三通路分层 + 本地优先 + 嵌入式 PG;Graphiti bi-temporal + 图库;Cognee GraphRAG + 本地 Kuzu。
- vs **Supermemory**:都有"矛盾消解 / 时序"能力。Supermemory 闭源图谱引擎,Hindsight 开源三通路。

## 附录 A:Hindsight 的三通路设计详解

Hindsight 的"三通路"是它最有辨识度的设计,值得展开:

**World pathway(世界 / 语义记忆)。** 关于世界和用户的事实——谁、什么、何时、何地。类似人类的语义记忆(客观知识)。例:"用户叫 Daniel""用户在 Northwind 工作"。这是最接近 Mem0 / LangMem 的"事实"层。

**Experiences pathway(情景记忆)。** agent 自己的经历——做了什么、和用户交互的结果。类似人类的情景记忆(个人经历)。例:"用户上次问我预算,我回答了 6000""我帮用户订了东京机票"。这让 agent 能回忆"我们之前怎么交互的"。

**Mental Models pathway(程序 / 抽象记忆)。** 从多次 Experience 抽象出的模式、偏好、启发式规则。类似人类的程序性记忆(技能 / 习惯)。例:"用户偏好早上开会""用户喜欢简洁回答"。这是从经验中"学习"出的高层模式。

这种分层的好处是:agent 不仅能记住事实(World),还能记住交互历史(Experiences),并从中抽象出用户模式(Mental Models)用于未来决策。这比扁平事实记忆更接近"真正长期学习的 agent 记忆"。

代价是复杂度:三通路意味着 retain 时要分别抽取 / 归类到三个通路,检索时要决定查哪个通路(或融合)。这增加了 LLM 抽取的负担(所以推荐强模型)。

## 附录 B:生物启发记忆的工程现实

Hindsight 体现了"生物启发 AI"的一个常见张力:理论优雅 vs 工程现实。

理论上,模仿人类记忆的三通路(World / Experiences / Mental Models,对应语义 / 情景 / 程序记忆)是优雅的——它让 agent 有层次化的长期学习能力,而不只是扁平事实库。这是 Hindsight 的核心卖点,也是它能在 Vectorize 横评里自报 91.4%(首个破 90%)的原因。

但工程现实是:三通路的抽取更复杂(retain 要分类到三个通路)、更依赖强模型(自报分用 Gemini-3 Pro)、本地弱模型下表现会打折(同 Graphiti / Cognee 的结构化抽取之苦)。而且本次在 Python 3.13 下连装都装不上(legacy use_2to3 依赖)——一个连主流 Python 版本兼容都没解决的项目,工程成熟度存疑。

所以 Hindsight 是一个"愿景诱人但工程未成熟"的典型。如果你愿意用 Python 3.11 + Gemini-3 Pro 级模型,它的三通路设计可能给你最好的 agent 记忆;但如果你在标准环境(Python 3.13)+ 本地模型,它装不上 + 抽取弱,不如 Letta / Mem0 可靠。建议等它的 Python 兼容和抽取稳定性成熟后再深入。这是"先观望"的典型场景——别被 91.4% 误导,那是有条件的(强 backbone)。

## 附录 C:Python 3.13 兼容失败的细节与解法

本次 Hindsight 安装失败的具体错误:`error in hindsight setup command: use_2to3 is invalid.`。这是 setuptools 的一个经典问题:

**根因。** Hindsight 的某个依赖(传递依赖)的 setup.py 用了 `use_2to3=True`(一个旧的 setuptools 参数,让 setup 时自动用 2to3 把 py2 代码转 py3)。但 setuptools >= 58(2021 年)已经移除了 `use_2to3` 支持——在 Python 3.12+ 配新 setuptools 下,装这种包会直接报 "use_2to3 is invalid"。

**影响。** 这不是 Hindsight 主包的代码问题,是它的某个老依赖没更新。但结果是:在 Python 3.13(本次环境)下,`pip install hindsight-all` 装不上。

**解法。**
1. **降 Python**:用 Python 3.11(配老 setuptools 兼容)。这是最直接的——`uv venv --python 3.11` 然后装。
2. **降 setuptools**:在装 hindsight 前先 `pip install setuptools<58`,让老 setup.py 能跑。但这可能影响其他包。
3. **patch 依赖**:找到是哪个依赖用了 use_2to3,fork 改掉。重,不实际。
4. **等官方修**:给 Hindsight 提 issue,让它更新依赖。这是长期解。

本次选了"文档化为 BLOCKED(py3.13)",没深解(因为 Python 降版本要重建 venv,且 Hindsight 即使装上,本地 retain 也慢 + 抽取要强模型,边际价值有限)。但如果你的环境是 Python 3.11 且能用强模型,Hindsight 值得一试。

这个失败说明:**"Python 版本兼容"是开源项目工程成熟度的一个硬指标。** 一个连 Python 3.13(主流版本)都装不上的项目,要么是依赖太老没维护,要么是没在 CI 里测主流版本——两种都指向"工程成熟度不足"。本次把 Hindsight 标"观望",部分就是基于这个信号。

## 附录 D:retain() 的延迟与异步

Hindsight 的 retain() 在本地慢(官方说 Apple Silicon 15-20 秒 / call,CPU 更慢),这是它的工程现实:

**为什么慢。** retain 一次做很多事:LLM 抽事实 / 实体 / 关系 / 因果链 / 时序 + 写 Postgres + 算 embedding + (可能的)reranker。多 LLM 调用 + DB 写 + embedding 累积。本地模型(qwen2.5:14b / gpt-oss:20b)推理慢,放大延迟。

**默认阻塞。** retain 默认阻塞(同步等完成)。高频 retain(每轮对话都 retain)会卡住对话。解法:`retain(..., async_=True)` 非阻塞(后台跑,不阻塞对话)。但这意味着记忆有延迟(刚说的可能要几秒后才记得)。

**首次模型下载。** 首次 retain 还付 SentenceTransformers 模型下载成本(bge-small-en / ms-marco reranker)。

**生产含义。** 实时对话场景,retain 的 15-20 秒延迟不可接受(除非 async + 容忍延迟)。批处理场景(离线把历史灌进去)可接受。这影响 Hindsight 的适用场景——它更适合"批处理 / 异步记忆",不是"实时同步记忆"。

## 附录 E:Hindsight 自报 91.4% 的条件性

Hindsight 自报 91.4%(首个破 90% 的 agent 记忆系统),这个数字很强,但高度条件性:

**backbone = Gemini-3 Pro。** 这是 Google 最强模型之一(极强推理 + 指令遵循)。retain 的抽取在这种 backbone 下质量极高。本地模型(qwen2.5:14b / gpt-oss:20b)远弱于 Gemini-3 Pro,本地 retain 质量会显著下降。

**评测协议未公开。** 用什么 benchmark(LongMemEval?DMR?)、什么 judge、什么 embedding,README 没详说。91.4% 是总体准确率,但具体条件不透明。

**三通路优势依赖强抽取。** 三通路(World / Experiences / Mental Models)的正确分类需要强 LLM 理解。弱模型可能把事实归错通路(Mental Models 抽不出抽象模式),优势打折。

所以 91.4% 是"强 backbone + 三通路设计"的联合上界。本地弱模型下,Hindsight 达不到(具体多低没测,因为装不上)。这和 Mem0 自报 94%(独立复现 49%)、Graphiti 63.8% 是同类现象——自报分都在理想条件下,本地实际更低。

决策时:**别把 91.4% 当本地能拿到的数。** 它是"如果你用 Gemini-3 Pro + Hindsight"的数。如果你用本地 ollama,Hindsight 实际多少未知(且 py3.13 装不上)。这是"先观望"的另一个理由——等它在标准环境 + 本地模型下有可复现的分数,再评估。

## 附录 F:Hindsight vs Letta(都是 agent runtime + MCP)的细致对比

Hindsight 和 Letta 都是"agent runtime + 自带 MCP + 本地优先",值得细致对比:

| 维度 | Letta | Hindsight |
| --- | --- | --- |
| 记忆模型 | agent 自管(core/archival/filesystem) | 三通路(World/Experiences/Mental Models) |
| 存储 | Postgres+pgvector(docker-compose) | 嵌入式 Postgres(pg0,零配置) |
| 抽取 | agent 自己 tool call 写(无独立抽取) | retain() LLM 抽到三通路 |
| 部署 | docker-compose(重) | pip hindsight-all(轻,但 py3.13 装不上) |
| 强模型依赖 | agent tool-calling 要强(glm-4.7/Opus) | retain 抽取要强(Gemini-3 Pro) |
| 自报分 | LoCoMo 74%(GPT-4o-mini) | 91.4%(Gemini-3 Pro) |
| 本次实测 | 冒烟 100%(glm-4.7),LME 不 scale | BLOCKED(py3.13) |
| MCP | 消费 MCP(也可被消费) | 内置 MCP server |

两者设计哲学不同:Letta 是"agent 自己管记忆(OS 式)",Hindsight 是"retain 抽到结构化三通路"。Letta 更"agent-centric"(记忆是 agent 行为的副产物),Hindsight 更"memory-centric"(记忆是独立的结构化资产)。部署上 Letta 重(docker-compose),Hindsight 轻但 py3.13 装不上。本次 Letta 实测 100%(强),Hindsight 没跑通——所以本次数据下 Letta 更可靠。但 Hindsight 的三通路设计在"强模型 + py3.11"下可能更优(待验证)。
