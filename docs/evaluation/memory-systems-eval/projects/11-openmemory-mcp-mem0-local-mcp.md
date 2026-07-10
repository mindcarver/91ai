# OpenMemory MCP:Mem0 的本地 MCP 形态深度技术解析

> **证据边界：R1。** 本页属于作者运行/资料调研记录；harness、输入与原始结果尚未公开，分数和选型判断只绑定当时版本、配置、样本与协议，不能视为独立复现结论。详见[评测可复现性状态](../../reproducibility-status.md)。

> 代码位置:https://github.com/mem0ai/mem0/tree/main/openmemory(mem0ai/openmemory 不是独立仓库,404)。License:Apache-2.0(随主仓,约 59967 star)。本文技术细节来自源码、官方文档与本次调研。

## 一、项目定位与一句话概括

OpenMemory MCP 是 Mem0 团队的"本地 MCP + dashboard"形态。它的引擎就是 Mem0(fact-extraction),但包了一层:FastAPI + SSE 的 MCP server(给 MCP 客户端用)+ Next.js dashboard(UI 可视化记忆)。定位是"本地优先、可自托管的 Mem0,带 MCP 接口和可视化"。但本次评测发现它正在 **sunset**(让位于新的 Mem0 自托管 server),长期支持不确定——而且它的引擎就是 Mem0,单独测 Mem0 即覆盖。

一句话:OpenMemory MCP = Mem0 引擎 + 本地 MCP server + dashboard,正在 sunset。

## 二、仓库与社区元数据

- 代码在 `mem0ai/mem0` 仓库的 `openmemory/` 子目录(注意:`mem0ai/openmemory` 不是独立仓库,404)。Apache-2.0,star 随主仓约 59967。
- 语言:Python(FastAPI MCP server)+ TypeScript / Next.js(dashboard)。
- 重要:有 **sunset 通告**,将让位于新的 Mem0 自托管 server。长期支持不确定。
- 另:`mem0ai/mem0-mcp`(旧官方 MCP)2026-03 已 archived / read-only,功能并入 OpenMemory / 官方文档。

## 三、整体技术架构

**引擎层 = Mem0。** OpenMemory 的记忆引擎就是核心 Mem0 库(mem0ai>=0.1.92):`add()` 时 LLM 抽事实、embed、存向量库;`search()` 融合语义 + BM25 + 实体检索。所以 OpenMemory 的记忆能力、记忆模型、失败模式都和 Mem0 完全一样(参见 Mem0 文档)。

**MCP server(FastAPI + SSE)。** 在 Mem0 引擎上包一层 MCP server:transport 是 SSE(`/mcp/<client>/sse/<user-id>`),把 add / search / recall 等暴露为 MCP 工具。给 Claude Desktop / Cursor 等 MCP 客户端用。

**dashboard(Next.js)。** 一个 Next.js UI(默认 3000 端口),可视化记忆(查看 / 编辑 / 删除抽取的事实)。这是 OpenMemory 相对裸 Mem0 库的附加值——给了非命令行的可视化管理。

**存储:Qdrant。** docker-compose 拉 qdrant/qdrant(6333 端口)做向量库;无本地图库。

## 四、核心记忆模型与实现原理

完全等同 Mem0(事实抽取 + 多信号检索)。参见 Mem0 文档的"核心记忆模型与实现原理"——OpenMemory 的引擎就是 Mem0,记忆模型、v3 ADD-only 算法、抽取丢值风险、多会话聚合弱项、ADD-only 矛盾不消解,全部继承。

OpenMemory 在 Mem0 之上的增值是:**MCP 接口**(让 MCP 客户端直接用)和 **dashboard**(可视化记忆)。这是"部署形态"的差异,不是"记忆能力"的差异。

## 五、端到端数据流

1. **起栈**:`curl -sL https://raw.githubusercontent.com/mem0ai/mem0/main/openmemory/run.sh | bash` 或 docker-compose(Qdrant + MCP server + dashboard)。
2. **配本地**:`api/.env` 设 `LLM_PROVIDER=ollama`、`LLM_MODEL=qwen2.5:14b`、`EMBEDDER_PROVIDER=ollama`、`EMBEDDER_MODEL=nomic-embed-text`(注意不是 qwen3-embedding)、`OLLAMA_BASE_URL=http://localhost:11434`(无 /v1,mem0 走 ollama 原生 API)。
3. **MCP 客户端连**:MCP 客户端(Claude Desktop 等)连 SSE endpoint,调 add / search 工具。
4. **或 dashboard**:浏览器开 3000,可视化看 / 编辑记忆。

## 六、技术栈与依赖

- 引擎:`mem0ai`。
- MCP server:FastAPI + SSE。
- dashboard:Next.js。
- 向量库:Qdrant(docker)。
- LLM / embed:ollama / OpenAI 等(Mem0 的 provider 体系)。

## 七、本地部署与 LLM 后端(ollama)

文档支持:`LLM_PROVIDER=ollama` + `EMBEDDER_PROVIDER=ollama` + `OLLAMA_BASE_URL`。本次调研发现的坑:`run.sh` 即使在 ollama 模式下也强制要求 OPENAI_API_KEY 非空(Issue #3445),要用占位值或直接 `make up`。默认 embedder 是 nomic-embed-text(不是 qwen3-embedding),dim 和 OpenAI 基线不同,recall 数字不会匹配厂商自报基准。

## 八、MCP 集成

**它就是 MCP server**(SSE transport),这是它的核心卖点——把 Mem0 的记忆能力通过 MCP 暴露给 Claude / Cursor 等。

## 九、云门控与商业模型

- 本地(OSS):向量存储 + 基础 add/search/recall(Qdrant)+ 事实抽取 + MCP server + dashboard,全部本地跑。
- 云(Mem0 cloud,MEM0_API_KEY):托管 graph memory、auto-reranker、异步管道等高级特性。

## 十、性能与基准

随 Mem0:厂商自报 LongMemEval 94.4%(L3,但独立 Atlan 复现 49%)。OpenMemory 本身无独立 benchmark(引擎即 Mem0)。

本次实测:**未单独 L1 测 OpenMemory**(因为引擎即 Mem0,且 sunset)。本次 Mem0 L1 冒烟 83%、LongMemEval 33%,可作为 OpenMemory 引擎能力的参考。

## 十一、已知问题与失败模式

- **sunset(最关键)**:有 sunset 通告,将让位于新 Mem0 自托管 server。长期支持不确定。不建议新项目采用。
- **引擎即 Mem0**:继承 Mem0 所有失败模式(抽取丢值、ADD-only 矛盾不消解、多会话聚合弱、吞吐杀手)。
- **run.sh 强制 OPENAI_API_KEY**:即使 ollama 也要占位(Issue #3445)。
- **默认 embedder nomic**:不是 qwen3-embedding,dim 不同,recall 不匹配基准。
- **mem0ai/openmemory 不是独立仓库**:404,代码在 mem0ai/mem0/openmemory/。容易找错。
- **旧 mem0-mcp 已 archived**:2026-03 read-only。

## 十二、本次实测发现(L4)

本次未单独 L1 测 OpenMemory(引擎即 Mem0 已测 + sunset)。作为 L4 调研结论:它是 Mem0 的本地 MCP 形态,引擎能力 = Mem0,但正在 sunset,不建议新采用。如果要在本地用 Mem0 + MCP,直接用核心 Mem0 库自托管 server 或等新的 Mem0 自托管 server。

## 十三、适用场景与选型建议

适合:已经在用 Mem0 引擎,且非要一个开箱即用的 MCP server + dashboard 不可。但鉴于 sunset,不建议新项目采用。

不适合:新项目(sunset 风险)、要长期稳定支持、要避免 Mem0 引擎弱项。

建议标签:**避开(sunset)**。引擎即 Mem0(用 Mem0 即可),项目本身停维。这是"不要为 sunset 项目投入"的典型。

## 十四、与同类对比

- vs **Mem0**:引擎完全相同。OpenMemory 多 MCP server + dashboard,但 sunset。直接用 Mem0 库 + 自托管 server 更稳。
- vs **Supermemory MCP**:Supermemory MCP 是云代理(deprecated),OpenMemory MCP 是本地(但 sunset)。两者都在"维护模式"。
- vs **Basic Memory**:Basic Memory 是活跃的本地 MCP(但 note/KB 不是 QA memory);OpenMemory 是 QA memory 引擎(Mem0)但 sunset。

## 附录 A:OpenMemory 的 sunset 含义

"sunset"在开源项目里通常意味着:维护方宣布项目进入维护模式 / 将被替代,不再积极开发新功能,可能只修关键 bug,最终可能归档。OpenMemory 的 sunset 通告指向"新的 Mem0 自托管 server"——意味着 Mem0 团队认为 OpenMemory 这条路线(FastAPI + SSE MCP + Next.js dashboard)不如新的自托管 server 形态好,要换路线。

对采用者,sunset 意味着:今天能用,但未来不会有新功能 / 改进,bug 修复可能变慢,最终可能停止。新项目不应该建立在 sunset 项目上——你应该用它的替代品(新 Mem0 自托管 server)或直接用核心 Mem0 库自己包 MCP。

这也是为什么本次评测把 OpenMemory 标"避开"而不是"先试点"——即使它的引擎(Mem0)很好,这个特定的打包形态(sunset)不值得投入。引擎能力直接用 Mem0 库获取即可。

## 附录 B:为什么"引擎即 X"的项目要单独评估包装层

OpenMemory 引出了一个有用的选型原则:当一个项目(A)的引擎就是另一个项目(B)时,要分开评估"引擎"和"包装层"。

引擎(Mem0):记忆能力、记忆模型、失败模式——这些由 Mem0 决定,L1 测 Mem0 就知道。
包装层(OpenMemory 的 MCP server + dashboard):部署形态、接口(MCP)、UI、运维、生命周期——这些是 OpenMemory 特有的,要单独评估。

OpenMemory 的引擎(Mem0)是好的(83% / 33%),但它的包装层(sunset + 强制 OPENAI_API_KEY 坑 + 默认 nomic embedder)不值得。所以正确决策是:用 Mem0 引擎(直接 `pip install mem0ai`),不用 OpenMemory 包装层。

这个原则也适用于其他"X 的 Y 形态"项目:Universal Memory MCP(Supermemory 的云 MCP 形态——引擎是 Supermemory 云,包装层是 deprecated 云代理,两者都不要)、Supermemory MCP 同理。分开看引擎和包装层,能避免"因为包装层差而错过好引擎"或"因为引擎好而采用差包装层"的两类错误。

## 附录 C:OpenMemory 的部署形态与组件

OpenMemory 不是一个单进程,而是一个 docker-compose 栈,理解它的组件有助于评估运维成本:

**Qdrant(向量库)。** docker-compose 拉 qdrant/qdrant,6333 端口。存 Mem0 抽取的事实向量。无本地图库(不像 Graphiti / Cognee)。

**MCP / API server(FastAPI + SSE)。** OpenMemory 的核心服务,暴露 MCP(SSE transport,`/mcp/<client>/sse/<user-id>`)+ REST API。工具包括 add / search / recall 等。这是"MCP 接口层"。

**dashboard(Next.js)。** 3000 端口,可视化记忆(查看 / 编辑 / 删除抽取的事实)。这是相对裸 Mem0 库的 UI 增值。

**引擎(Mem0 库)。** 上面三层都调用核心 Mem0 库(mem0ai>=0.1.92)做实际的抽取 / 存储 / 检索。

所以 OpenMemory = Mem0 引擎 + Qdrant + FastAPI/SSE MCP server + Next.js dashboard。这是一个"开箱即用的 Mem0 + MCP + UI"打包。运维成本:Qdrant + MCP server + dashboard 三个容器(docker-compose)。

对比:裸 Mem0 库是一个 pip 包(本地文件 Qdrant,无 server),最轻;OpenMemory 是三容器栈,中等;Mem0 自托管 server(新版)形态待官方明确。

## 附录 D:本地 ollama 的配置细节与坑

OpenMemory 文档支持 ollama,但有几个实测坑(来自调研):

**api/.env 配置。** `LLM_PROVIDER=ollama`、`LLM_MODEL=qwen2.5:14b`(或 llama3.1 / glm)、`EMBEDDER_PROVIDER=ollama`、`EMBEDDER_MODEL=nomic-embed-text`、`OLLAMA_BASE_URL=http://localhost:11434`(注意**无 /v1 后缀**——Mem0 的 ollama provider 走 ollama 原生 API `/api/chat`,不是 OpenAI 兼容 `/v1/chat/completions`)。

**run.sh 强制 OPENAI_API_KEY(Issue #3445)。** 即使配 ollama,run.sh 启动脚本仍检查 OPENAI_API_KEY 非空。解法:设占位值(`OPENAI_API_KEY=ollama`)或直接 `make up`(绕过 run.sh)。

**默认 embedder 是 nomic-embed-text,不是 qwen3-embedding。** 这意味着 OpenMemory 的 embedding 和本次评测的统一后端(qwen3-embedding)不同——dim 也不同(nomic 768 vs qwen 2560)。recall 数字不会匹配厂商基准(厂商用 OpenAI text-embedding-3-large)。要换 qwen3-embedding 要改 EMBEDDER_MODEL + 确保 dim 配对。

**Mem0 引擎的配置坑全继承。** Mem0 的静默 OpenAI 回退(GitHub #2030)、PostHog 遥测超时、Qdrant 并发锁——这些 Mem0 的坑,OpenMemory 全继承(因为引擎就是 Mem0)。

所以"OpenMemory 本地 ollama"不是开箱即用,要处理 run.sh 占位 key + embedder 选择 + 继承的 Mem0 坑。这和 sunset 状态叠加,进一步说明"直接用 Mem0 库更省心"。

## 附录 E:sunset 对采用者的具体影响

OpenMemory 的 sunset 不是抽象风险,有具体影响:

**无新功能。** sunset 后不会有新 feature。如果你需要的功能它现在没有(如某种检索模式、某个集成),不会有。

**bug 修复变慢 / 停止。** sunset 项目通常只修关键 bug,非关键的会积压。本次发现的 run.sh 强制 OPENAI_API_KEY 坑(Issue #3445)可能就一直不修。

**最终归档。** sunset 的终点往往是 archived(read-only,和旧 mem0-mcp 一样)。到那时连 issue 都不能提。

**迁移成本。** 如果现在采用 OpenMemory,将来要迁到"新 Mem0 自托管 server"(官方 successor)或别的——记忆数据(Qdrant 里的向量)迁移 + 接口适配,是真实成本。

**文档 / 社区萎缩。** sunset 后,新用户不进来,社区解答 / 踩坑文档停止增长。遇到问题更难找到答案。

所以对采用者,sunset 的总成本 = 当前能用 + 未来迁移成本 + 期间支持不确定。这通常超过"直接用活跃替代品(裸 Mem0 库或新自托管 server)"的成本。这就是为什么本次把 OpenMemory 标"避开"——不是它现在不能用,是它的"生命周期预期"不值得投入。

## 附录 F:从 OpenMemory 看"打包形态"的演进

OpenMemory 的 sunset 指向一个更广的现象:记忆系统的"打包形态"在快速演进,sunset 频繁。

**演进轨迹(观察)。** Mem0 生态的 MCP 形态:旧 `mem0-mcp`(archived 2026-03)→ OpenMemory(sunset,FastAPI+SSE+Next.js)→ 新"Mem0 自托管 server"(待明确)。短短时间换了三次打包形态。这反映"记忆 + MCP 的最佳打包方式"还没收敛——FastAPI+SSE vs 新协议、带 dashboard vs 不带、单容器 vs 多容器,都在试。

**对采用者的含义。** 在打包形态未收敛时,绑死某一种打包(OpenMemory)风险高(sunset)。更稳的策略:用稳定的引擎(核心 Mem0 库)+ 自己包一层薄 MCP(按需),不依赖某个可能 sunset 的打包。引擎(Mem0 记忆能力)是稳定的,包装(MCP 形态)是动荡的——把投入放在引擎上,包装自己控。

**这不是 Mem0 独有。** Supermemory 的 MCP 形态也 deprecated(supermemory-mcp → app.supermemory.ai);旧 mem0-mcp archived。整个"记忆 + MCP"领域的包装层都在洗牌。所以本次评测反复建议"用引擎,慎用包装层",是基于这个观察。

这个附录的价值是:把 OpenMemory 的 sunset 放进"包装层洗牌"的大背景,让采用者理解这不是个例,是领域常态——所以更要"重引擎、轻包装、自己控接口"。

## 附录 G:dashboard 的价值与代价

OpenMemory 相对裸 Mem0 库的主要包装增值是 Next.js dashboard(可视化记忆)。值得评估这个增值:

**dashboard 的价值。** 可视化查看抽取的事实(每条 memory 的文本、score、user_id);手动编辑 / 删除记忆(纠错);看记忆统计(数量、分布)。这对"想理解 / 控制 agent 记了什么"的用户有吸引力——记忆不再黑箱。

**dashboard 的代价。** 多一个 Next.js 容器(运维成本);多一层依赖(前端 + API);UI 开发 / 维护成本(这也是 sunset 的部分原因——维护 UI 比维护库重)。

**对比。** 裸 Mem0 库无 UI(命令行 / 代码操作记忆),轻但黑箱。OpenMemory 有 UI,透明但重。Mem0 云(app.mem0.ai)有托管的 dashboard(不占本地运维),但要云 key。

**实际取舍。** 对开发 / 调试阶段,dashboard 有用(看 agent 记了什么、纠错)。对生产部署,dashboard 可能多余(agent 自己用记忆,不需要人看 UI)。所以 OpenMemory 的 dashboard 增值主要在 dev 场景——这也是为什么它被打包成"本地 MCP + dashboard"(面向开发者本地跑),而不是"轻量生产记忆"(那是裸 Mem0 库的位)。

理解这个,就理解 OpenMemory 的目标用户:本地开发 / 调试 agent 记忆、想可视化的人。生产部署用裸库。sunset 后,这两类需求都转向新 Mem0 自托管 server(待官方明确形态)。

## 附录 H:如果一定要本地用 Mem0 + MCP,现在怎么做

鉴于 OpenMemory sunset,如果你现在就要"本地 Mem0 + MCP",实际路径:

**路径一:裸 Mem0 库 + 自己包薄 MCP。** `pip install mem0ai`,用 Mem0 的 Python 库,自己写一个薄 MCP server(用 @modelcontextprotocol/sdk 或 mcp python sdk,把 Mem0 的 add/search 包成 MCP 工具)。这是"引擎 + 自控包装"——最稳,不依赖任何 sunset 打包。代价:要自己写 ~100 行 MCP 包装代码。

**路径二:等新 Mem0 自托管 server。** 官方说 OpenMemory 让位于"新的 Mem0 自托管 server"。等它发布,直接用(应该带 MCP + 可能带 UI)。代价:等。

**路径三:用 OpenMemory(明知 sunset)。** 现在能用(docker-compose 跑),但有附录 E 的 sunset 成本。不推荐新项目。

**路径四:Mem0 云 + 托管 MCP。** 用 app.mem0.ai(云)+ 它的 MCP。代价:数据出境 + 付费。非本地。

推荐路径一(自控包装)——它最符合"重引擎、轻包装、自己控接口"的原则。Mem0 引擎(83% / 33%)是稳定的,你自己包的薄 MCP 也是你控的(不 sunset)。这比依赖一个 sunset 的 OpenMemory 打包稳得多。

这个建议体现了一个选型哲学:**当一个打包(OpenMemory)sunset 时,不要找另一个打包替代,而是直接用引擎(Mem0 库)+ 自己控包装。** 引擎是稳定的,包装是动荡的——把动荡的部分自己控,最稳。这对任何"引擎 + 包装"架构的项目都适用(Mem0 / Supermemory / 任何有官方打包 + 自定义打包的项目)。

## 附录 I:OpenMemory 留给后续评测的两点方法论遗产

尽管 OpenMemory 本身被标"避开",它给本次评测留下两点方法论遗产,值得记录:

**遗产一:标 star 数时注意"随主仓"。** OpenMemory 标 ~60k star,但那是 mem0ai/mem0 主仓的 star(它的代码在一个子目录)。这容易让人高估 OpenMemory 这个子项目的体量 / 社区。调研时要区分"主仓 star"和"子项目实际关注度"。其他"在主仓子目录"的项目(如 Reference Memory MCP 在 servers monorepo)同理——monorepo 的 star 不能单算给某一个 server。

**遗产二:sunset 项目仍有调研价值。** OpenMemory 虽 sunset,但调研它揭示了"Mem0 的官方打包演进轨迹(旧 mem0-mcp archived → OpenMemory sunset → 新自托管 server)"和"包装层洗牌"现象。这些洞察对理解整个领域有用,即使不采用 OpenMemory 本身。所以"避开采用"不等于"不值得调研"——sunset 项目是领域演进的化石,读它们能看清来龙去脉。

这两点让 OpenMemory 在评测里仍占一席之地——不是作为"可采用的工具",而是作为"方法论样本"。本次评测花在它身上的篇幅,换来了这两条可迁移的洞察。
