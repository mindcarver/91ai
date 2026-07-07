# LangMem:LangChain 生态的记忆模块深度技术解析

> 项目地址:https://github.com/langchain-ai/langmem 。License:MIT。约 1535 star(2026-07-03 实测)。PyPI `langmem`,实测版本 0.0.30。本文技术细节来自源码、官方文档与本次 ollama 下的 L1 实测。

## 一、项目定位与一句话概括

LangMem 是 LangChain / LangGraph 团队官方出品的"记忆模块",定位是给 LangGraph agent 加长期记忆。它不是独立服务(像 Mem0),而是 LangGraph 生态里的一个组件:用 trustcall 做带 schema 约束的事实抽取,存到 LangGraph 的 BaseStore(InMemoryStore 本地或 Postgres),提供记忆管理 / 检索 / 用户画像 / prompt 优化等工厂函数。如果你已经在用 LangGraph,LangMem 是最低成本的"加记忆"方式。

一句话:LangMem = LangGraph 生态的记忆模块,用 trustcall 抽取事实存 BaseStore。

## 二、仓库与社区元数据

- 主仓 `langchain-ai/langmem`,MIT,约 1535 star(规模比 Mem0 / Letta 小得多)。
- 语言 Python(>=3.10)。PyPI `langmem` 0.0.30。
- 活跃但偏慢(2025 年中后更新频率下降,季度级)。
- 依赖 LangChain / LangGraph 生态(langchain / langchain-core / langgraph 严格版本约束)。

## 三、整体技术架构

LangMem 的架构是"LangGraph 组件 + 工厂函数 + BaseStore":

**BaseStore(存储抽象)。** LangGraph 的 BaseStore 接口:InMemoryStore(进程内,带向量索引,本地开发)或 AsyncPostgresStore(生产)。LangMem 把记忆存这里,不自带存储。

**工厂函数(核心 API)。** LangMem 提供几个 create_* 工厂:
- `create_memory_manager(model, schemas, instructions)`:返回一个 Runnable,从对话 trajectory 抽取记忆(用 schema 约束)。
- `create_memory_store_manager(model, store, namespace)`:把抽取的记忆写入 BaseStore。
- `create_manage_memory_tool(namespace, store)` / `create_search_memory_tool(namespace, store)`:把记忆管理 / 检索做成 LangGraph agent 可调用的工具。
- `create_multi_prompt_optimizer` / `create_prompt_optimizer`:基于记忆优化 prompt。

**抽取层(trustcall)。** 用 trustcall 做带 schema 约束的抽取——LLM 按定义好的 Memory schema 产出结构化记忆。schema 可以自定义(默认是自由文本 Memory)。

**检索层。** `store.search(namespace_prefix, query=..., limit=...)` 做向量检索(BaseStore 的 index 配 dims + embed 函数)。

## 四、核心记忆模型与实现原理

LangMem 的记忆模型是"schema 约束的事实抽取 + 向量检索"。

**trustcall schema 抽取。** `create_memory_store_manager(model, store, namespace=("memories","{user_id}"))` 创建的 manager,invoke `{"messages":[...]}` 时,trustcall 让 LLM 按定义的 schema 产出记忆(默认 schema 是自由文本)。抽取有多阶段(extract → compare & update → synthesize,见 manager 的长 instructions),所以一次 invoke 可能多个 LLM 调用,慢。

**namespace 隔离。** 记忆按 namespace 元组组织(如 ("memories", user_id)),`store.search` 按 namespace_prefix 过滤。这是它的多租户隔离。

**BaseStore 向量检索。** InMemoryStore 配 `index={"dims":2560, "embed": embed_fn, "fields":["text"]}`。embed_fn 是把文本转向量的 callable(用 langchain_openai.OpenAIEmbeddings 指向 ollama / OpenAI)。search(query) 算 query 向量 + 按相似度召回。

**自由文本 schema 的丢值风险。** 默认 Memory schema 存自由文本(如 "[IMPORTANT] User prefers..."),具体数值 / 时间戳 / ID 可能被抽象掉。本次实测 LangMem 冒烟 41.7%,部分原因就是抽取产出的记忆偏"泛化 profile"而非"精确值"。

## 五、端到端数据流

本次实测(ollama qwen2.5:14b + qwen3-embedding):

1. **配 embed**:`embed_lc = OpenAIEmbeddings(model="qwen3-embedding:4b", base_url="http://localhost:11434/v1", api_key="ollama", check_embedding_ctx_length=False)`,`store = InMemoryStore(index={"dims":2560, "embed": lambda t: embed_lc.embed_documents(list(t)), "fields":["text"]})`。
2. **建 manager**:`llm = ChatOpenAI(model="qwen2.5:14b", base_url=ollama, api_key=ACW_KEY)`,`mgr = create_memory_store_manager(llm, store=store, namespace=("memories", user))`。
3. **摄入**:每个 session,`mgr.invoke({"messages": traj})`(traj = role/content 列表)。manager 多阶段抽取 → 写 store。
4. **检索**:每个 query,`store.search(("memories", user), query=q, limit=5)` → 返回 SearchItem 列表(带 .value)。
5. **下游**:把 .value 作 context,固定 reader 合成。

## 六、技术栈与依赖

- `langmem` + `langgraph`(>=0.6,<2)+ `langchain`(>=0.3.15)+ `langchain-core`(>=0.3.46)+ `langchain-openai` / `langchain-anthropic`。
- 存储:LangGraph BaseStore(InMemoryStore 本地 / AsyncPostgresStore 生产)。
- LLM / embed:走 LangChain 的 ChatOpenAI / OpenAIEmbeddings(可指 ollama)。
- 抽取:trustcall(schema 约束)。

## 七、本地部署与 LLM 后端(ollama)

官方默认 Anthropic,但本地 ollama 完全可行(非一键,要手配两处):
- **LLM**:不传字符串模型名,传 `ChatOpenAI` 实例:`ChatOpenAI(model="qwen2.5:14b", base_url="http://localhost:11434/v1", api_key="ollama")`。
- **embedding**:`OpenAIEmbeddings(model="qwen3-embedding:4b", base_url="http://localhost:11434/v1", api_key="ollama")`,注意 store index 的 dims 要和 embedder 维度一致(qwen3-embedding 2560)。

核心记忆 / 抽取 / 检索 / 画像 / prompt 优化都本地可行,只要供本地 LLM + 本地 embedder。无 API key 强制。

## 八、MCP 集成

**无。** LangMem 不暴露 MCP server,也不消费 MCP(grep "mcp" 全仓无)。它是 LangGraph 组件,不是 MCP 组件。

## 九、云门控与商业模型

- OSS:核心抽取 / 检索 / 画像 / prompt 优化全本地(供本地 LLM + embedder),无 API key 强制。
- LangSmith / LangGraph 平台:LangChain 的托管 / 可观测,但那是 LangChain 平台特性,不是 LangMem 本身云门控。

## 十、性能与基准

**无。** LangMem 仓库不发布任何 LongMemEval / LoCoMo / MemoBench 分数(grep 无 evals)。这是它和 Mem0 / Letta / Graphiti 的一个差异——没有官方 benchmark 可参考。

本次实测(L1):**冒烟 41.7%**(5 正确 / 7 错)。store 存了 9 条记忆,抽取工作,但产出偏泛化 profile(具体值不如 Mem0 直接);multi-session / temporal 败(同事实抽取类弱项)。

## 十一、已知问题与失败模式

- **版本冲突地雷**:langgraph 1.x / langchain-core 1.x 可能和 langgraph<2 的 pin 冲突,要早 pin 到已知好的组合。
- **抽取丢值**:默认自由文本 schema 会抽象掉具体数值 / ID。
- **多阶段抽取慢**:manager 的 extract→compare→synthesize 多个 LLM 调用,慢(本次单 session 几十秒)。
- **API 变更**:langgraph BaseStore 的 search API 在新版从 `namespace=` 改成 `namespace_prefix=`(位置参数),旧代码会 `TypeError`。本次实测就是这个坑(search 全失败,改对后 41.7%)。
- **无 benchmark**:没有官方分数可参考,只能自己测。
- **规模小**:1535 star,社区 / 更新节奏比头部项目弱。

## 十二、本次实测发现(L1)

本次 LangMem + ollama:

- **冒烟 41.7%**:抽取工作但偏泛化,具体值不如 Mem0 直接(83%)。
- **负分校验**:第一次 search 全失败(`BaseStore.search() got an unexpected keyword argument 'namespace'`),是 langgraph 新版 search 用 `namespace_prefix` 位置参数。改对后正常。
- **同 fact-extraction 类弱项**:multi-session / temporal 败(和 Mem0 一样)。

## 十三、适用场景与选型建议

适合:已经在用 LangGraph / LangChain 生态,想最低成本加长期记忆。LangMem 是这个生态的原生选择,集成摩擦最小。

不适合:不在 LangChain 生态(集成成本高)、要严格值保留(默认 schema 会丢值)、要官方 benchmark 支撑(无)。

建议标签:**观望 / 试点(已用 LangChain 时)**。社区小、无 benchmark、抽取不如 Mem0,但生态原生。如果已用 LangGraph,值得试点;否则 Mem0 更通用。

## 十四、与同类对比

- vs **Mem0**:都是事实抽取。Mem0 独立服务 + 生态大 + 83%;LangMem 是 LangGraph 模块 + 1535 star + 41.7%。不在 LangChain 生态选 Mem0。
- vs **LlamaIndex Memory**:都是框架内置记忆模块(LangMem for LangChain,LlamaIndex Memory for LlamaIndex)。都 API 摩擦偏多,行为同 fact-extraction 类。

## 附录 A:实测代码与 API 变更坑

```python
from langgraph.store.memory import InMemoryStore
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langmem import create_memory_store_manager

el = OpenAIEmbeddings(model="qwen3-embedding:4b", base_url="http://localhost:11434/v1",
                      api_key="ollama", check_embedding_ctx_length=False)
store = InMemoryStore(index={"dims":2560, "embed": lambda t: el.embed_documents(list(t)), "fields":["text"]})
llm = ChatOpenAI(model="qwen2.5:14b", base_url="http://localhost:11434/v1", api_key="ollama")
mgr = create_memory_store_manager(llm, store=store, namespace=("memories","u1"))
mgr.invoke({"messages":[{"role":"user","content":"I'm Daniel, FF XQ-7712-3309."}]})
# 注意 langgraph 新版:search 用 namespace_prefix 位置参数,不是 namespace=
items = store.search(("memories","u1"), query="FF number", limit=5)
```

`store.search(("memories","u1"), ...)` 的第一个位置参数是 namespace_prefix(元组),不是关键字 `namespace=`。这是 langgraph 新版 breaking change,本次实测第一版踩坑(search 全 TypeError)。

## 附录 B:LangMem 的定位——生态绑定 vs 通用性

LangMem 体现了"框架内置组件"和"通用独立服务"的取舍。

LangMem 的优势是生态原生:如果你已经在 LangGraph 里造 agent,LangMem 的 create_manage_memory_tool / create_search_memory_tool 能直接作为 agent 工具挂上去,namespace / store / 检索都和 LangGraph 原生对齐,集成摩擦最小。trustcall 的 schema 约束也让你能定义精确的记忆 schema(比如自定义一个带 user_id / timestamp / confidence 的 schema,而不是默认自由文本)。

但生态绑定的代价是通用性差:不在 LangChain 生态的人用 LangMem 要拉一整套 langchain + langgraph + langchain-core + langchain-openai(版本约束严格,容易冲突),远不如 Mem0 一个 pip 包 + 任何框架可插。另外 LangMem 没有官方 benchmark(不像 Mem0 / Letta / Graphiti 都自报分数),社区也小(1535 star vs Mem0 60k),成熟度 / 文档 / 踩坑解答都弱一些。

所以 LangMem 的真实定位是"LangGraph 用户的记忆默认选项",不是"通用记忆后端"。本次把它和 Mem0 放一起比(都事实抽取类),LangMem 41.7% < Mem0 83%,差距主要在抽取质量(默认 schema 偏泛化)和生态成熟度。如果你在 LangGraph 里且愿意自定义 schema 调优,LangMem 可能能调得更好;但开箱即用,Mem0 更强。

## 附录 C:trustcall 抽取的多阶段机制

LangMem 的 `create_memory_store_manager` 用 trustcall 做带 schema 约束的抽取,这个抽取是多阶段的(manager 的长 instructions 暴露了这一点):

**阶段一:Extract & Contextualize(抽取与语境化)。** 识别对话里的"essential facts, relationships, preferences, reasoning procedures, context"。对不确定信息用置信度(p(x))标注,必要时引用支持信息。这是"识别要记什么"。

**阶段二:Compare & Update(比较与更新)。** 关注"和已有记忆偏离的新信息"。整合 / 压缩冗余记忆(保持信息密度);按可靠性和时效性加强;移除错误 / 冗余记忆(保持内部一致)。这是"和已有记忆融合"——意味着 LangMem 会做 UPDATE/DELETE(不像 Mem0 v3 的 ADD-only),抽取更聪明但也更贵(要拉已有记忆进上下文比对)。

**阶段三:Synthesize & Reason(综合与推理)。** 用演绎 / 归纳 / 溯因推出"关于用户 / agent / 环境能得出什么结论";识别"模式、关系、原则";做"泛化"。用概率置信度限定结论。

这三个阶段意味着一次 `mgr.invoke({"messages":[...]})` 可能有多个 LLM 调用(extract + compare + synthesize),所以慢(本次单 session 几十秒)。这也是 LangMem 的设计哲学:把"记忆抽取"当成一个深思熟虑的推理过程,而不是简单的"抽事实"。代价是延迟和成本。

**schema 的双刃剑。** trustcall 的 schema 约束让你能定义精确的记忆结构(自定义 pydantic 模型,带字段),比 Mem0 的自由文本事实更结构化。但默认的 Memory schema 是自由文本(存 "[IMPORTANT] User prefers..."),所以开箱即用偏泛化(本次 41.7% 的部分原因)。自定义一个带精确字段(name / value / timestamp / confidence)的 schema 能改善,但要写 pydantic 模型 + 调 prompt——这是 LangMem 的"调优空间",也是它的"开箱弱"。

## 附录 D:为什么 LangMem 比 Mem0 弱(41.7% vs 83%)

本次实测 LangMem 41.7% < Mem0 83%,差距显著。根因分析:

**默认 schema 偏泛化。** LangMem 默认 Memory schema 存自由文本 profile(如 "[IMPORTANT] User prefers concise answers"),倾向记录"抽象偏好 / 模式"而非"精确值"(FF 号、猫名、预算)。Mem0 v3 的抽取 prompt 更倾向"保留具体事实值"。所以 LangMem 召回的是泛化记忆,Mem0 召回的是精确事实——精确事实更能直接回答"FF 号是多少"这类问题。

**多阶段抽取的累积误差。** LangMem 的三阶段(extract→compare→synthesize)每阶段都可能"重新解读"信息,synthesize 阶段尤其会把具体值抽象成模式。Mem0 的单次 ADD-only 抽取更直接保留原信息。

**生态 / 成熟度。** LangMem 1535 star、无 benchmark、季度更新;Mem0 60k star、有 memory-benchmarks、持续高频。Mem0 的抽取 prompt 经过更多迭代调优。

**但 LangMem 不是没救。** 如果自定义一个精确 schema(强约束存 name=value 这类结构化事实)+ 调 prompt 偏向保留值,LangMem 可能追上 Mem0。trustcall 的 schema 约束给了这个调优空间(Mem0 没有 schema 约束,是自由文本)。所以差距更多是"开箱默认"而非"能力上限"。

这个对比说明:**同属"事实抽取类"的工具,抽取 prompt + schema 的默认设计差异,直接决定开箱分数。** Mem0 默认偏精确值(83%),LangMem 默认偏泛化(41.7%)。选型时如果不打算深度调优,选默认强的(Mem0);如果愿意调优且在 LangGraph 里,LangMem 的 schema 约束可能给你更可控的记忆结构。

## 附录 E:LangMem 的版本冲突地雷

LangMem 依赖 LangChain / LangGraph 生态,版本约束严格(`langgraph>=0.6,<2`、`langchain>=0.3.15`、`langchain-core>=0.3.46`)。但 LangChain 生态在快速演进(langgraph 1.x / langchain-core 1.x 已出),和 langgraph<2 的 pin 可能冲突。

本次实测安装时 resolved 通过(uv 解析),但生产环境可能踩雷:如果项目里已有 langgraph 1.x(为别的 LangChain 组件),装 LangMem 可能 downgrade 或冲突。建议早 pin 到已知好的组合,在隔离 venv 里跑(uv venv 隔离)。

这是"框架内置模块"的通病——它绑定一个快速演进的框架(LangChain),版本治理成本转嫁到用户。Mem0(独立库,依赖少得多)没这个问题。所以"轻依赖"也是 Mem0 相对 LangMem 的一个隐含优势,即使不算抽取质量。
