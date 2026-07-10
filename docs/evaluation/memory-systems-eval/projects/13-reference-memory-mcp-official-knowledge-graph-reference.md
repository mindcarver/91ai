# Reference Memory MCP Server:官方实体-关系-观察知识图谱参考实现

> **证据边界：R1。** 本页属于作者运行/资料调研记录；harness、输入与原始结果尚未公开，分数和选型判断只绑定当时版本、配置、样本与协议，不能视为独立复现结论。详见[评测可复现性状态](../../reproducibility-status.md)。

> 项目地址:https://github.com/modelcontextprotocol/servers/tree/main/src/memory(server-memory 包)。License:MIT(server-memory 包);仓库整体 "Apache-2.0 for new contributions, existing code MIT"。约 86000 star(整个 servers monorepo,2026-07-03 实测)。包 `@modelcontextprotocol/server-memory`,版本 0.6.3。本文技术细节来自源码核查与官方文档。

## 一、项目定位与一句话概括

Reference Memory MCP Server 是 Model Context Protocol 官方(`modelcontextprotocol/servers` monorepo)提供的"记忆"参考实现。它的定位非常明确:**参考实现**(reference implementation),示范"如何用 MCP 协议做一个记忆 server"。它的记忆模型是经典的"实体-观察-关系"(entity-observation-relation)知识图谱,存一个内存 JSONL 文件,检索用子串匹配(无向量、无 LLM、无 embedding)。它轻量、零依赖、完全本地,但能力非常基础——是"起点模板",不是生产级记忆后端。

一句话:Reference Memory MCP = MCP 官方的实体-关系-观察知识图谱参考实现(JSONL 文件,无向量 / 无 LLM,示范用)。

## 二、仓库与社区元数据

- 代码在 `modelcontextprotocol/servers` monorepo 的 `src/memory/`(包 `@modelcontextprotocol/server-memory`)。
- License:MIT(server-memory 包);monorepo 整体 "Apache-2.0 for new contributions, existing code MIT"。
- star 约 86000(整个 servers monorepo,含很多其他 server,不能单算这一个)。
- Node / TypeScript。`npx -y @modelcontextprotocol/server-memory` 一键跑。
- MCP server name "memory-server",版本 0.6.3。

## 三、整体技术架构

**极简:内存 JSONL + MCP server(stdio)。**

**存储:JSONL 平面文件。** 默认 `memory.jsonl`(在 dist/ 旁边,可 `MEMORY_FILE_PATH` 覆盖)。一个平面 JSON 文件存所有实体 + 观察 + 关系。无 DB、无向量库、无图库、无索引。

**无 LLM、无 embedding。** server 内部**不含 LLM,不含 embedding 模型**。所以"指向 ollama"不适用——没有需要指向的东西。所有"把对话变成实体 / 观察 / 关系"的抽取工作,由**客户端**(调 MCP 的 LLM agent,如 Claude)完成。server 只负责存和查客户端给的三元组。

**检索:子串匹配。** `search_nodes(query)` 在实体名称 / 观察内容里做子串匹配(不是向量相似度,不是 BM25)。`read_graph()` 返回整个图或某实体的子图。

**MCP server(stdio)。** 用 `@modelcontextprotocol/sdk`,stdio transport。工具:create_entities / create_relations / add_observations / delete_entities / delete_relations / delete_observations / read_graph / search_nodes / open_nodes。

## 四、核心记忆模型与实现原理

Reference Memory MCP 的记忆模型是经典的"实体-观察-关系"知识图谱。

**实体(entity)。** 一个具名节点(如 "Daniel"、"Pepper"、"Northwind")。实体有 name + entityType + observations。

**观察(observation)。** 实体的属性 / 事实(如 Daniel 实体有 observation "FF number is XQ-7712-3309")。观察是自由文本字符串。

**关系(relation)。** 实体间的有向边(如 Daniel -[works_at]-> Northwind)。关系有 from + to + relationType。

这个模型简单、可解释、人可编辑(JSONL 可直接看 / 改)。它的表达力足以示范"结构化记忆",但远不如 Graphiti 的 bi-temporal 或 Cognee 的 GraphRAG 丰富。

**关键:抽取靠客户端。** server 不抽——客户端 LLM(Claude 等)负责把对话理解成实体 / 观察 / 关系,然后调 create_entities / add_observations / create_relations 写入。这和 Basic Memory 类似(BM 也不自己抽),但更极端——Reference 连 markdown 规则抽取都没有,纯靠客户端写三元组。

## 五、端到端数据流

1. **起 server**:`npx -y @modelcontextprotocol/server-memory`(stdio),或 MCP 客户端配置里指向它。
2. **客户端抽取 + 写入**:客户端 LLM(Claude)读对话,产出实体 / 观察 / 关系,调 `create_entities([...])` / `add_observations(...)` / `create_relations([...])` 写入 JSONL。
3. **检索**:客户端调 `search_nodes("Daniel")`(子串匹配)或 `read_graph()` 取子图。
4. **下游**:客户端 LLM 用取回的三元组作答。

## 六、技术栈与依赖

- `@modelcontextprotocol/sdk` ^1.26.0。
- zod(schema 校验)。
- node:fs / node:path(文件 IO)。
- devDeps:typescript / vitest / shx。
- 零运行时外部依赖(无 DB / 无 LLM / 无 embed)。

## 七、本地部署与 LLM 后端(ollama)

**完全本地、零 key、空气隔离友好。** 存储和检索全在进程内 JSONL 文件。无 API key、无云、无网络。

**ollama 不适用**:server 内无 LLM / 无 embedding,没有需要指向 ollama 的东西。LLM 是客户端(读 MCP 的 agent)的事——客户端可以用 ollama / OpenAI / 任何。

## 八、MCP 集成

**它就是 MCP server**(stdio transport,name "memory-server")。这是它的核心——示范"MCP 记忆 server 怎么写"。

## 九、云门控与商业模型

**无。** 完全本地 / 离线,无 API key,无云。这是最"干净"的本地 MCP 之一。

## 十、性能与基准

**无。** 不发布 benchmark(它是参考实现,不是生产记忆后端)。

本次评测:**未单独 L1 测**(它是参考实现,低区分度——子串匹配的简单图谱,在 LongMemEval 这类基准上表现可预期地基础)。作为 L4 调研结论归档。

## 十一、已知问题与失败模式

- **抽取靠客户端**:server 不抽,客户端 LLM 弱或漏抽则记忆不全。质量完全取决于客户端。
- **子串检索**:不是语义 / 向量检索,query 措辞要匹配实体名 / 观察文本。复杂查询能力弱。
- **无时序 / 无矛盾消解**:三元组不带时间,新旧都存,无自动消解(同 Mem0 ADD-only 的弱点,但更原始)。
- **JSONL 不 scale**:平面文件,无索引,实体多了检索慢。生产规模不适用。
- **无 embedding / 无向量召回**:不能做语义相似度检索。
- **参考实现定位**:不是生产级,功能基础。

## 十二、本次调研发现(L4)

Reference Memory MCP 是 MCP 官方的"记忆 server"示范。它的价值不在"能力"(基础),而在"规范"——它定义了"一个 MCP 记忆 server 长什么样":工具集(create_entities / add_observations / create_relations / read_graph / search_nodes)、实体-观察-关系模型、JSONL 存储。很多自建 MCP 记忆 server 都以它为模板。

本次未单独 L1 测(低区分度 + 参考实现定位)。如果测,预期表现基础(子串匹配 + 客户端抽取)。

## 十三、适用场景与选型建议

适合:学习 MCP 记忆 server 怎么写(看源码)、作为自建 MCP 记忆的起点模板(在它基础上加向量 / LLM 抽取 / 时序)、极轻量场景(几 dozen 实体的简单图谱,客户端 LLM 维护)。

不适合:生产级记忆后端(JSONL 不 scale、无向量、无抽取)、要语义检索(子串匹配)、要时序 / 矛盾消解(无)、要自动抽取(靠客户端)。

建议标签:**作为起点 / 学习用**(不适合生产)。它的正确定位是"模板"和"示范",不是"采用的生产记忆"。

## 十四、与同类对比

- vs **Basic Memory**:都是"客户端维护的知识图谱 MCP"(都不自己抽)。Basic Memory 是 markdown + sqlite(丰富、人可编辑、有 FastEmbed 向量但 NL 召回差);Reference 是 JSONL 三元组(极简、子串检索)。Reference 更轻更原始,Basic Memory 更丰富。
- vs **Graphiti / Cognee**:那些是"LLM 自动抽取的图记忆"(server 自己抽);Reference 是"客户端手动维护的图"(server 不抽)。前者能力强但依赖 LLM 抽取质量,后者简单但靠客户端。
- vs **OpenMemory / Supermemory MCP**:那些有引擎(Mem0 / Supermemory 云);Reference 无引擎(纯存储 + 子串查)。要记忆能力用那些,要 MCP 模板用 Reference。

## 附录 A:实体-观察-关系模型的数据结构

Reference Memory MCP 的 JSONL 结构(简化):

```jsonl
{"name":"Daniel","entityType":"Person","observations":["FF number is XQ-7712-3309","vegetarian, allergic to shellfish"]}
{"name":"Pepper","entityType":"Pet","observations":["7-year-old tabby cat"]}
{"name":"Northwind","entityType":"Company","observations":[]}
{"from":"Daniel","to":"Northwind","relationType":"works_at"}
{"from":"Daniel","to":"Pepper","relationType":"owns"}
```

这就是它的全部数据模型——实体的 observations 是自由文本事实,关系是有向边。检索 `search_nodes("Daniel")` 子串匹配返回 Daniel 实体 + 它的 observations;`read_graph()` 返回整个图(或过滤后)。

简单、可读、人可直接编辑 JSONL(改文件即改记忆)。这是它的优点(透明、可控)也是它的局限(无结构化查询、无向量、无 scale)。

## 附录 B:参考实现的价值——规范而非能力

Reference Memory MCP 体现了一个常被忽视的项目类型:**参考实现(reference implementation)**。

它的价值不在"它有多强的记忆能力"(实际上很基础——子串匹配 + 客户端抽取 + JSONL),而在"它示范了一个标准"。MCP 官方提供它,是为了告诉世界"一个 MCP 记忆 server 长什么样":用哪些工具(create_entities / add_observations / create_relations / read_graph / search_nodes)、用什么记忆模型(实体-观察-关系)、用什么存储(JSONL)。

这种"规范价值"对生态很重要:它让其他自建记忆 server 有一个对齐的模板(工具命名、数据模型、行为契约),促进互操作性。很多团队会 fork 它,在基础上加自己的增强(向量检索、LLM 抽取、时序、Postgres 存储)做一个生产级记忆 server。

所以正确的"采用"方式不是直接拿 Reference Memory MCP 当生产记忆(它不够强),而是把它当起点——学习它的 MCP 契约,然后按你的需求增强。这和 OpenMemory MCP(引擎即 Mem0,直接可用但 sunset)、Supermemory(开箱即用的强引擎)是不同的采用模式。

本次评测把它归为"作为起点 / 学习用",正是基于这个定位——它的低分数(预期基础)不是缺点,是它的参考实现性质决定的。把它和 Mem0 / Letta 放一起比"谁记忆能力强"是错配——它的角色是模板,不是选手。理解每个项目的"角色"(生产引擎 / 框架模块 / 云代理 / 参考实现 / note/KB 工具),是选型不踩坑的前提。这也是本次评测 13 个项目逐个深挖后最想传达的元教训:**先搞清"它是什么角色",再问"它好不好"。**

## 附录 C:九个 MCP 工具的契约细节

Reference Memory MCP 暴露九个工具,理解这个工具集契约对"自建 MCP 记忆 server"的人有参考价值:

**写入类:**
- `create_entities(entities[])`:创建实体(name + entityType + observations)。已存在的实体合并 observations。
- `create_relations(relations[])`:创建关系(from + to + relationType)。需 from / to 实体已存在。
- `add_observations(observations[])`:给已存在实体加观察(entityName + observations[])。
- `delete_entities(entityNames[])`:删实体(同时删它的关系和观察)。
- `delete_relations(relations[])`:删关系。
- `delete_observations(deletions[])`:删特定观察(entityName + observations[])。

**读取类:**
- `read_graph()`:返回整个图(或按 filter)。无参数 = 全图。
- `search_nodes(query)`:子串匹配实体名 + 观察内容,返回匹配实体。
- `open_nodes(names[])`:按名取特定实体 + 它们的观察 + 相关关系。

这个契约(define + query 实体-观察-关系图)是"知识图谱记忆"的最小完备集——你能建图、改图、查图。很多自建 MCP 记忆 server 以这个契约为起点,在上面加:向量检索(search_nodes 增强为语义)、自动抽取(让 server 自己抽,不靠客户端)、时序(关系带时间)、多租户(按 user 隔离图)。

所以这九个工具是"MCP 记忆 server 的 API 设计参考"——即使你不直接用 Reference Memory MCP(它太基础),它的工具契约值得参考。这是它"参考实现"价值的体现。

## 附录 D:子串检索的能力边界

Reference Memory MCP 的检索是子串匹配(`search_nodes(query)` 在实体名 + 观察文本里找子串)。这个机制的能力边界:

**能做。** 精确词查找(搜 "Daniel" 找到 Daniel 实体)、实体名定位(搜 "Northwind")、已知关键词的事实查找(搜 "FF" 找到含 FF 的观察)。

**不能做。** 语义相似("我的航班号" 找不到写 "frequent-flyer number" 的观察,因为没有字面重叠)、同义(查 "cat" 找不到写 "feline" 的)、模糊匹配、跨实体推理("Daniel 的猫多大了" 要先找 Daniel → 找他的 cat 关系 → 找 cat 的 age 观察,子串检索做不到这个图遍历,要 read_graph + 客户端推理)。

**对客户端的依赖。** 因为检索弱,复杂查询要靠客户端 LLM:read_graph 拿子图 → LLM 推理答案。这把"检索 + 推理"都推给客户端,server 只管存 + 子串查。这是参考实现的极简设计——把智能留给客户端,server 做最简单的存储 + 查找。

**生产含义。** 子串检索在实体多了之后(几 thousand+)会很慢(线性扫描)。生产级要加索引(实体名 hash 索引、观察全文索引)或换向量。Reference Memory MCP 没这些(平面 JSONL),所以只适合小规模。

## 附录 E:作为"自建记忆"起点的实际路径

如果你要基于 Reference Memory MCP 自建一个更强的 MCP 记忆 server,实际路径:

**Step 1:fork + 理解。** Fork modelcontextprotocol/servers 的 src/memory,理解它的九工具契约 + JSONL 存储 + 子串检索。

**Step 2:换存储。** 把 JSONL 换成 SQLite(加索引)或 Postgres(scale)。这是"让存储生产级"。

**Step 3:加向量检索。** 加 embedding + 向量索引(sqlite-vec / pgvector),把 search_nodes 从子串增强为向量 + 子串 hybrid。这是"让检索语义化"——这是 Basic Memory 已经做的。

**Step 4:(可选)加自动抽取。** 在 server 端加 LLM 抽取(把客户端给的原对话抽成实体 / 观察 / 关系),让客户端不必自己抽。这是往 Graphiti / Cognee 方向走。

**Step 5:(可选)加时序 / 多租户。** 关系带 valid_at / invalid_at(往 Graphiti bi-temporal 走);图按 user_id 隔离(多租户)。

每一步都是"在 Reference Memory MCP 基础上加一个能力"。Basic Memory 基本就是 Step 1-3 的产物(fork + markdown/sqlite + FastEmbed 向量);Graphiti 是 Step 1-5 全做了(+ 时序 + 图库 + 自动抽取)。

所以 Reference Memory MCP 是"记忆 server 的原型"——它的价值不在自己用,在作为进化的起点。本次评测把它归"起点 / 学习",正是这个意思。如果你要自建 MCP 记忆,从这里起步,比从零设计 API 契约高效。

## 附录 F:Model Context Protocol 官方的记忆定位

最后,值得理解 Model Context Protocol(MCP)官方对"记忆"的定位:

**MCP 是协议,不是实现。** MCP 定义"客户端(server 的消费者)和 server(能力提供者)怎么通信"——工具 / 资源 / prompt 的协议。记忆只是 MCP server 能提供的众多能力之一(其他还有文件系统、数据库、API、搜索等)。

**官方提供参考实现。** `modelcontextprotocol/servers` 这个 monorepo 提供一堆参考 server(file system / git / postgres / google drive / slack / memory 等),其中 memory 就是本文的 Reference Memory MCP。它们都是"示范如何用 MCP 暴露某类能力"的参考实现,不是生产级产品。

**记忆的特殊性。** 在 MCP 生态里,"记忆"是一个高频需求(AI agent 都要长期记忆),所以官方给了参考实现。但官方不提供生产级记忆引擎——生产级记忆(抽取 / 向量 / 时序 / scale)留给社区(Mem0 / Letta / Supermemory 等第三方),它们可以选择暴露 MCP 接口。

所以 Reference Memory MCP 的定位是:**MCP 官方对"记忆 server 长什么样"的最小示范**。它定义契约(九工具 + 实体-观察-关系 + JSONL),示范怎么用 MCP SDK 写一个记忆 server,但不提供生产级能力。第三方(Mem0 等)在生产级能力上可以暴露 MCP(让它们的能力被 MCP 生态消费)。

理解这个定位,就不会对 Reference Memory MCP 的"基础"失望——它本来就不是要和 Mem0 比能力,是要示范"记忆 server 的 MCP 契约"。它的低分数(预期基础)是定位决定的,不是缺陷。本次评测给它"起点 / 学习"标签,正是尊重这个定位——它是最干净的 MCP 记忆 server 原型,适合学习 / 改造,不适合直接当生产记忆。

## 附录 G:为什么"无 LLM / 无 embedding"反而是优点

Reference Memory MCP 完全不含 LLM 和 embedding,表面看是"能力弱",但在某些场景这反而是优点:

**完全确定性。** 没有 LLM = 没有非确定性。同样的输入(create_entities / search_nodes)永远返回同样的结果(子串匹配是确定性的)。这对"可审计、可重现"的记忆很重要——你永远知道库里有什么,查出来是什么,不会因为 LLM 抽取随机性而变。

**零成本 / 零延迟(LLM 部分)。** 没有 LLM 调用 = 没有 LLM 延迟和成本。create_entities / search_nodes 是纯文件 IO + 子串匹配,毫秒级,免费。

**完全离线 / 空气隔离。** 没有 LLM = 没有网络依赖。最严格的保密环境也能跑(不像 Mem0 / Letta 要调 LLM)。

**透明 / 可编辑。** JSONL 文件,人可直接看 / 改,记忆完全透明。没有黑箱抽取(对比 Mem0 的"LLM 抽成什么你说了不算")。

**可控的记忆质量。** 因为客户端 LLM 负责抽取(写三元组),你能完全控制记忆质量——用强模型抽就准,想怎么组织就怎么组织。server 不擅自"帮你抽"(也就不会抽错)。

这些优点让 Reference Memory MCP 在"需要确定性、透明、离线、可控"的场景(金融审计、医疗记录、保密环境、教学示范)有价值——即使它"能力基础"。在这些场景,Mem0 的"LLM 自动抽取"反而是缺点(非确定、黑箱、要网络)。

所以"无 LLM / 无 embedding"不是缺陷,是一种设计选择——把智能留给客户端,server 做最简单、最确定、最透明的存储 + 查找。在"把智能留给客户端"是优点的场景,Reference Memory MCP 是对的;在"要 server 自己智能"的场景,它不对。这再次印证"工具定位决定适用性"——没有绝对的好坏,只有匹配不匹配。

## 附录 H:从 Reference Memory MCP 看记忆 server 的最小要素

剥到最简,一个"记忆 server"需要的最小要素,Reference Memory MCP 都示范了:

**1. 数据模型。** 实体 + 观察 + 关系(三元组的扩展)。这是知识的最小结构化表达——比纯文本强(有结构),比图数据库简(无 schema 约束)。

**2. 写入 API。** create / add / delete 实体 / 观察 / 关系。CRUD。

**3. 查询 API。** read_graph(全图)+ search_nodes(按 query 找)。两类查询:结构化(全图)和近似(子串)。

**4. 持久化。** JSONL 文件(简单、可读、可移植)。

**5. 协议。** MCP(stdio transport)。

任何记忆 server 都需要这五个要素,区别在每个要素做得多丰富(数据模型加时序 / 向量、写入加自动抽取、查询加语义检索、持久化换 DB、协议加 SSE)。Reference Memory MCP 给出最小版本,其他项目是它的"加料版"。理解这个最小集,就理解了所有记忆 server 的骨架——这是它作为参考实现最根本的价值。
