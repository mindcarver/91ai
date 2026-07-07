# Mem0 vs Supermemory：同一套 91ai 文档跑完两轮后，我会怎么选

> TL;DR：如果你优先要“本地启动快、接入简单、查询延迟低”，Supermemory 更顺手；如果你优先要“检索路径可控、provider 可替换、命中依据更稳”，Mem0 更像工程团队会长期持有的底层。2026 年 6 月 29 日这两轮本地测试里，Mem0 在预期来源命中上更好，Supermemory 在查询延迟上明显更快。

## 一、先把测试边界说清楚

这次对比不是“谁的官网 benchmark 更高”，而是同一台机器、同一套文档、同一套 query set 的本地跑数。

测试条件：

- 数据源：`91ai/docs`
- 问题集：`eval/common/query-set.json`
- 日期：2026 年 6 月 29 日
- 两轮规模：
  - 第一轮：15 篇文档
  - 第二轮：30 篇文档

关键边界也必须讲清楚：

1. 这轮测试更接近“静态知识库检索”而不是“长期对话记忆”。
   - Mem0 的 ingest 用的是 `memory.add(... infer=False)`，相当于直接把 Markdown chunk 当检索材料入库。
   - Supermemory 用的是本地 self-hosted Memory API，把文档交给它的异步 ingestion 流水线处理。

2. 这里对比的核心是 retrieval path，不是完整聊天回答质量。
   - Mem0 脚本会可选地在检索后再调用 `gpt-5.5` 生成答案。
   - Supermemory 脚本主要记录检索结果和 citations，没有把自然语言回答生成做成强约束项。

3. 所以最可信的指标不是“answered 10/10”，而是下面这些：
   - `Avg latency`
   - `Query hit`
   - `Expected path coverage`
   - 实际 ingest 行为是否稳定

## 二、结果先看表

### 第一轮：15 篇文档

| 系统 | Avg latency | Query hit | Expected path coverage |
| --- | ---: | ---: | ---: |
| Mem0 | 1331.99 ms | 9/10 | 18/25 |
| Supermemory | 61.54 ms | 8/10 | 13/25 |

### 第二轮：30 篇文档

| 系统 | Avg latency | Query hit | Expected path coverage |
| --- | ---: | ---: | ---: |
| Mem0 | 798.56 ms | 9/10 | 16/25 |
| Supermemory | 73.82 ms | 8/10 | 12/25 |

先说最直接的结论：

- Supermemory 在查询延迟上赢得很明显
- Mem0 在预期来源路径命中上更稳
- 文档规模从 15 扩到 30 后，两边的排序没有反转

这已经足够说明两件事：它们的优势点不在同一个维度，而且这种差异和它们的架构选择高度一致。

## 三、为什么 Mem0 更容易“找对依据”

从架构上看，Mem0 更像一套可调检索内核。

它的读路径不是单路向量搜索，而是：

- semantic search 做主召回
- BM25 / keyword search 补精确匹配
- entity boost 做跨 memory 的实体增强
- 最后再做 additive fusion

这会带来一个很自然的结果：**它在“找对哪几段内容应该被当证据”这件事上更有主动控制力。**

这也能解释为什么在 `91ai/docs` 这种结构化 Markdown 知识库上，Mem0 的 `Expected path coverage` 更好。它更像一个检索工程师在设计答案依据，而不是一个黑盒 memory engine 在帮你猜。

当然，代价也摆在那儿：

- 查询路径更重
- provider 能力差异会泄漏出来
- 你需要自己处理更多配置和兼容问题

我们在这次本地跑数里就踩到了两个很典型的问题：

- OpenAI 兼容 embedder 路径实际读取 `OPENAI_API_KEY` / `OPENAI_BASE_URL`
- `Qwen/Qwen3-Embedding-8B` 需要显式设置真实维度 `4096`

换句话说，Mem0 这次胜出的不是“开箱即用体验”，而是“检索路径的可控性”。

## 四、为什么 Supermemory 会这么快

Supermemory 的快，不是偶然。

它从架构层面就在做两件事：

1. ingestion 和 retrieval 强解耦
2. 把本地引擎、embeddings、索引和图语义一起折叠进 one-binary runtime

它的 self-hosted 文档写得非常明确：

- `POST /v3/documents` 先返回 `queued`
- 后台再做 `extracting -> chunking -> embedding -> indexing`
- 搜索永远不排队，优先响应

所以它的优势是很符合预期的：**上传可以慢慢处理，但查询看起来一直像在线 API。**

这也正好解释了我们两轮实验里的现象：

- ingest 在 Windows 本地机上是“能跑通，但要等”
- final query latency 依然很好看

这是一种非常产品化的取舍。它牺牲的是写入实时性和部分可观测性，换来的是前台体验的一致性。

## 五、两者其实不是一个产品形态

这点比单项指标更重要。

### Mem0 的本质

Mem0 更像 memory orchestration layer：

- 你可以自己选 LLM、embedder、vector store
- `user_id / agent_id / run_id` 是一级作用域
- 本地 SDK、远程 client、自托管 server 共用同一套 memory 语义
- 它更适合被工程团队拿来做“自己的记忆底座”

### Supermemory 的本质

Supermemory 更像完整的 Memory API 平台：

- document、memory、profile、hybrid search 放在同一套模型里
- 本地版追求 zero-config
- 接入 SDK、browser extension、MCP、web 都尽量共用统一 contract
- 它更适合被当成“能马上接上的记忆服务”

所以这场对比，不是两个同构系统谁跑得快一点，而是两个产品哲学谁更适合你。

## 六、如果把架构差异翻译成工程选择

最实用的方式，是直接按维度看。

| 维度 | Mem0 | Supermemory |
| --- | --- | --- |
| 产品形态 | 可编排 memory 内核 | 一体化 Memory API |
| 本地启动成本 | 更高，需要理解配置和 provider | 更低，one-binary 路线 |
| 查询延迟 | 较高，但路径可控 | 很低，前台优先 |
| 检索可解释性 | 强，容易沿着召回逻辑调优 | 中等，更多依赖引擎默认策略 |
| 底层组件替换 | 强 | 弱到中 |
| 文档 ingest 语义 | 这次实测里更像手工 RAG 入库 | 原生异步记忆流水线 |
| 适合人群 | 工程团队、平台团队 | 产品团队、原型团队、想快速落地的人 |

## 七、这次结果里我最在意的两个 caveat

### 1. 这轮对比还没有完全打到“记忆系统”的上限

因为数据源是 `91ai/docs`，本质上还是静态知识文档。

这意味着：

- Mem0 最擅长的对话记忆抽取、scope 记忆复用，这次只测到了一部分
- Supermemory 的 profile、memory evolution、文档到 memory 的自然过渡，也没有在对话流里完全展开

所以它更像“memory 系统拿来做知识库时谁更顺手”，而不是“真正长期 agent memory 谁更强”的最终判决。

### 2. 不要过度解读 `answered 10/10`

这一列在现有脚本里更接近“请求成功返回了可消费结果”，不是严格意义上的“自然语言答案质量对比”。

如果你要继续把这套实验升级，我建议把重点放在：

- expected source coverage
- citation precision
- retrieval latency
- ingest completion time
- 查询扩容后的稳定性

这些指标比一句“答出来了没有”更能说明长期工程价值。

## 八、如果我是你，我会怎么选

如果你的优先级是：

- 本地先跑起来
- 少折腾配置
- 快速接到现有应用
- 先拿到低延迟 memory API

我会先选 Supermemory。

如果你的优先级是：

- 想控制 embedding、vector store、rerank 路径
- 想把 memory 做成团队长期基础设施
- 需要强 scope 隔离
- 更看重“证据命中”和可调试性

我会选 Mem0。

再说得更直白一点：

- **Supermemory 赢在产品完成度和接入体验**
- **Mem0 赢在检索工程可控性和底层掌控感**

## 九、下一轮该怎么把对比做得更像“真实记忆系统”

如果要把这次评测从“静态文档检索”升级成“长期 agent memory 对比”，我建议你下一轮这样做：

1. 保留 `91ai/docs` 作为知识库侧数据源。
2. 额外构造一批连续对话日志，专门测用户偏好、状态更新、冲突记忆和时间演化。
3. 把 retrieval 指标和 answer 指标拆开，不再混成同一列。
4. 继续把规模从 30 扩到 100、300、1000 文档，看延迟和 path coverage 怎么变化。

这样你最终得到的，不只是“谁跑得快”，而是：

- 谁更像知识库底座
- 谁更像真正的记忆系统
- 谁更适合你的 91ai 这类内容场景

## 十、最后一句话

这两套系统没有谁在所有维度都赢。

在你这次的 `91ai/docs` 本地实测里，最准确的一句话应该是：

**Mem0 更像可调的 memory retrieval engine，Supermemory 更像即插即用的 memory runtime。**

前者赢在“找得更准”，后者赢在“跑得更轻”。
