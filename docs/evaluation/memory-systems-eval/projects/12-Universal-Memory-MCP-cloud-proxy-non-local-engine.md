# Universal Memory MCP(Supermemory MCP):云代理,不是本地引擎

> 项目地址:https://github.com/supermemoryai/supermemory-mcp 。License:MIT。约 1700 star(2026-07-03 实测)。注意 README 已标注 deprecated。本文技术细节来自源码核查与官方文档。

## 一、项目定位与一句话概括

`supermemoryai/supermemory-mcp` 这个仓库的名字("Universal Memory MCP"/"Supermemory MCP")很容易让人以为它是一个"通用的、可自托管的本地记忆 MCP server"。**实测源码后确认:它不是。** 它只是一个约 262 行的 Cloudflare Worker(TypeScript),内部代码就是 `new Supermemory({ apiKey: env.SUPERMEMORY_API_KEY })` 然后调用 Supermemory 的**云 SDK**——它是一个指向 Supermemory 云服务的瘦 MCP 代理,不是可自托管的记忆引擎。而且 README 已经标注 deprecated(MCP v1)。

一句话:Universal Memory MCP = Supermemory 云的瘦 MCP 代理(约 262 行 Cloudflare Worker),不是本地引擎,已 deprecated。

## 二、仓库与社区元数据

- 主仓 `supermemoryai/supermemory-mcp`,MIT,约 1700 star(注意:star 数会让它看起来像个正经项目,误导)。
- 语言 TypeScript(Hono + Cloudflare Worker + Durable Object)。
- **deprecated**:README banner 标注 "MCP v1 is being deprecated. Please get the latest version from app.supermemory.ai",维护版已并入 monorepo。
- 暴露两个 MCP 工具:`addToSupermemory`、`searchSupermemory`(都调云 SDK)。

## 三、整体技术架构

**它是一个 Cloudflare Worker(app.ts,约 262 行)。** 用 Hono 做 HTTP 框架,Cloudflare Durable Object 做 SSE transport 的 MCP server。核心逻辑极简:

- `addToSupermemory` 工具:调 `supermemory.cloud.documents.add(...)`。
- `searchSupermemory` 工具:调 `supermemory.cloud.search(...)`。

所有实际记忆能力(抽取 / 存储 / 检索 / 图谱)都在 **Supermemory 云**(`api.supermemory.ai`),不在本地。这个 Worker 只是把 MCP 协议翻译成 Supermemory 云的 API 调用。

**没有本地存储、没有本地 LLM、没有本地 embedding。** 它需要 `SUPERMEMORY_API_KEY`(云 key),无 key 直接 401。

## 四、核心记忆模型与实现原理

没有自己的记忆模型——记忆模型是 Supermemory 云的(参见 Supermemory 文档的混合图谱 + profile + 矛盾消解)。这个 Worker 只是云的 MCP 入口。

## 五、端到端数据流

1. **部署**(开发者):`bun install && bun run deploy`(wrangler 部署到 Cloudflare)。终端用户不需要自己部署——用官方托管的 `mcp.supermemory.ai`。
2. **配置**(终端用户):去 app.supermemory.ai 拿 `SUPERMEMORY_API_KEY`,配置 MCP 客户端指向 `https://mcp.supermemory.ai/mcp`(OAuth 或 Bearer)。
3. **使用**:MCP 客户端调 addToSupermemory / searchSupermemory → Worker → 云 SDK → Supermemory 云。

## 六、技术栈与依赖

- `@supermemory/sdk`(Supermemory TS SDK)。
- Hono(HTTP 框架)+ Cloudflare Workers + Durable Objects(SSE MCP transport)。
- wrangler(部署)。
- 无本地依赖(无 DB / 无 LLM / 无 embed)。

## 七、本地部署与 LLM 后端(ollama)

**不适用。** 这个仓库没有 OPENAI_BASE_URL / embeddings 配置,无法指向本地 ollama。本地-ollama 故事属于另一个仓库(`supermemoryai/supermemory`,那个自托管二进制,见 Supermemory 文档)。这个 MCP 仓库是云代理,本地跑起来也需要云 key(指向云)。

## 八、MCP 集成

**它就是 MCP server**(SSE transport over Cloudflare Durable Objects,通过 `muppet` 库)。这是它的唯一功能——把 Supermemory 云包成 MCP 给客户端用。

## 九、云门控与商业模型

**重度云门控。** 默认 / 唯一流程是托管 MCP at mcp.supermemory.ai,需要 Supermemory 账号 / key。即使自托管这个 Worker,也需要付费 / 云 SUPERMEMORY_API_KEY(指向云)。README 的"Self-hosting"章节也只是指向 console.supermemory.ai——没有真正的本地自托管路径。

## 十、性能与基准

仓库自报(L3):95% Recall@15,约 720 added tokens(99.4% context reduction);还提 3x token reduction on Claude / 1.75x on Codex(xAFS/SMFS)。这些都是 Supermemory 云的指标,不可与其他厂商横比。

本次实测:**不适用**(它不是本地引擎,无法在统一本地后端测)。

## 十一、已知问题与失败模式

- **不是本地引擎(最关键)**:名字误导,实际是云代理。
- **deprecated**:README 标注 MCP v1 弃用。
- **重度云门控**:无 key 401,自托管也要云 key。
- **维护模式**:README banner 指向新版本(app.supermemory.ai / monorepo)。

## 十二、本次调研发现

本次调研最重要的"修正"之一:这个被列入"主流记忆项目清单"的"Universal Memory MCP"实际上不是本地记忆引擎,而是 Supermemory 云的瘦 MCP 代理 + deprecated。把它当"本地记忆后端候选"是常见错误。

## 十三、适用场景与选型建议

适合:已经在用 Supermemory 云,想要一个 MCP 入口给 Claude / Cursor。但用官方托管的 mcp.supermemory.ai 即可,不需要这个 deprecated 仓库。

不适合:任何"本地 / 自托管记忆"需求(它不是)、任何不想被 Supermemory 云锁定的场景。

建议标签:**避开**(云代理 + deprecated + 名字误导)。如果你要 Supermemory 能力,用自托管二进制(`supermemoryai/supermemory`,见 Supermemory 文档);如果你要 Supermemory 云 + MCP,用官方托管的 mcp.supermemory.ai,不用这个 deprecated 仓库。

## 十四、与同类对比

- vs **Supermemory(自托管二进制)**:那个是真正的本地引擎(图谱 + profile + 矛盾消解,本地跑,LME 50%);这个 MCP 仓库是云代理(指向云,不是本地)。完全不同——要本地用那个,不用这个。
- vs **OpenMemory MCP**:都是 MCP server + 都在"维护模式"(OpenMemory sunset,这个 deprecated)。OpenMemory 引擎是 Mem0(本地可跑),这个引擎是 Supermemory 云(本地不可跑)。
- vs **Reference Memory MCP**:那个是真正的本地 MCP(JSONL 三元组,零依赖,本地);这个是云代理(需云 key)。要本地 MCP 用 Reference,不用这个。

## 附录 A:为什么"名字 + star"会误导

`supermemoryai/supermemory-mcp` 约 1700 star,名字叫 "Universal Memory MCP"——这两个信号合起来很容易让人(和很多第三方"awesome 记忆项目"清单)把它列为"主流本地记忆系统"。

但实测源码后真相是:262 行 Cloudflare Worker,内部 `new Supermemory({apiKey})` 调云 SDK,无任何本地能力,README 标 deprecated。star 数来自"Supermemory"品牌 + "MCP"热度,不代表它是独立的本地引擎。

这是本次评测反复强调的一个教训:**在记忆系统这个高速演进 + 营销密集的领域,"名字 + star + 第三方清单"非常不可靠,必须落到仓库源码(看 app.ts 实际调什么)和当前版本(看 README 是否 deprecated)去核实。** 否则你会把一个云代理 + deprecated 项目当成"本地记忆后端候选"认真评估,浪费时间还可能误采用。

## 附录 B:三类"不是本地引擎"的项目

本次评测发现至少三类项目"看起来像本地记忆系统但实际不是":

**类型一:云代理(MCP 入口)。** Universal Memory MCP / Supermemory MCP 就是这类——MCP server 但内部调云,本地跑也要云 key。识别方法:看源码是否 `new SomeCloud({apiKey})` + 有无本地存储 / LLM / embed 配置。

**类型二:框架内置模块(不是独立后端)。** LangMem / LlamaIndex Memory 是这类——是框架(LangChain / LlamaIndex)的组件,不是独立可插记忆后端;记忆通过 prompt 注入(chat memory)不是独立检索 API。识别方法:看是否强依赖某框架 + 记忆是"塞 prompt"还是"search 返回"。

**类型三:维护模式 / sunset。** OpenMemory MCP(sunset)/ Supermemory MCP(deprecated)/ 旧 mem0-mcp(archived)是这类——引擎可能好,但特定打包形态停维。识别方法:看 README banner / 仓库 archived 状态。

这三类都不是"坏工具",但都不是"你应该投入采用的本地记忆后端"。识别它们的价值是:把评测 / 选型精力集中到真正"本地 + 独立 + 活跃"的项目(Mem0 / Letta / Memvid / Supermemory 二进制 / Graphiti 等),避免在云代理 / 框架模块 / sunset 项目上浪费时间。本次评测花在"识别并剔除这三类"上的功夫,和花在实测真正本地工具上的功夫一样有价值——因为"知道不该选什么"和"知道该选什么"同样重要。

## 附录 C:Cloudflare Worker + Durable Object 的 MCP 实现

Universal Memory MCP 的技术栈是 Cloudflare Worker + Hono + Durable Object,这是"在边缘跑 MCP server"的一种实现方式,值得理解:

**Cloudflare Worker。** 一个在 Cloudflare 边缘网络跑的 serverless 函数(app.ts,约 262 行)。它接收 MCP 客户端的请求,翻译成 Supermemory 云 SDK 调用,返回结果。Worker 无状态(每次请求独立),冷启动快。

**Hono。** 一个轻量 HTTP 框架(类似 Express 但更快、适配边缘运行时)。Worker 用 Hono 处理 HTTP 路由。

**Durable Object(SSE transport)。** MCP 的 SSE(server-sent events)transport 需要一个持久的连接对象——Cloudflare Durable Object 提供这个(一个有状态的边缘对象,维持 SSE 连接)。`muppet` 库(MCP-over-Hono)把 MCP 协议桥接到 Hono + Durable Object。

**两个 MCP 工具。** `addToSupermemory`(调 `supermemory.cloud.documents.add`)+ `searchSupermemory`(调 `supermemory.cloud.search`)。就这么两个,都透传到云。

**部署。** 开发者 `bun install && bun run deploy`(wrangler 部署到 Cloudflare)。终端用户不部署——用官方托管的 `mcp.supermemory.ai`。

这个技术栈本身没问题(边缘 MCP 是合理的架构),问题是**它的实质是云代理**——所有能力在 Supermemory 云,Worker 只翻译。所以即使你读源码看到一个"MCP server",它不是本地记忆引擎,是云入口。这个区分(边缘 MCP server ≠ 本地记忆引擎)是本次评测想强调的——MCP server 可以是本地引擎(Reference Memory MCP)、可以是本地 note/KB(Basic Memory)、可以是 sunset 的引擎打包(OpenMemory)、也可以是云代理(这个)——名字都是"MCP server",实质天差地别。

## 附录 D:为什么"云代理 MCP"也有存在价值

虽然 Universal Memory MCP 在"本地记忆后端"评测里被剔除,但"云代理 MCP"作为一种形态本身有存在价值,公平地说:

**给云记忆一个 MCP 入口。** 如果你已经在用 Supermemory 云(或任何云记忆),你希望你的 MCP 客户端(Claude Desktop 等)能调它——云代理 MCP 就是这个入口。它让云记忆能被 MCP 生态消费。

**部署简单。** 终端用户不需要自己跑 server——指向官方托管的 mcp.supermemory.ai,配个 key 就行。比自托管本地引擎简单。

**云的能力。** Supermemory 云有优化模型、规模、Connectors 等——通过 MCP 都能用上。

**所以它的价值是"云用户的 MCP 入口",不是"本地记忆引擎"。** 问题出在:它的名字("Universal Memory MCP")和它出现在各种"本地记忆项目"清单里,让人误以为它是后者。如果你明确要"Supermemory 云 + MCP",这个仓库(或官方托管的)是对的;如果你要"本地记忆",它不对。

这个区分让 Universal Memory MCP 的定位清晰:**它是 Supermemory 云的 MCP 入口,不是本地引擎。** deprecated 是因为它被并入 monorepo / app.supermemory.ai(官方托管版),不是因为"云代理 MCP"这个形态错。形态对,具体仓库 deprecated——用官方托管的即可。

## 附录 E:如何快速识别"云代理 vs 本地引擎"

基于本次评测,给出一个快速识别"一个 MCP 记忆 server 是云代理还是本地引擎"的检查清单:

**1. 看源码的核心调用。** 云代理的核心是 `new SomeCloud({apiKey})` 然后调云 SDK(如 `supermemory.cloud.add`)。本地引擎的核心是本地存储 / 本地 LLM / 本地 embed 调用(如 `qdrant.add` / `ollama.chat`)。grep 源码看它实际调什么。

**2. 看配置项。** 云代理只有 API key 配置(指向云)。本地引擎有 base_url / LLM provider / embedder / 存储路径等丰富配置(指向本地资源)。

**3. 看能否离线。** 云代理断网就 401 / 不工作。本地引擎空气隔离能跑。

**4. 看 README 的 Self-hosting。** 云代理的 Self-hosting 章节通常"指向 console"(还是要云)。本地引擎有真正的本地部署步骤(docker / pip + 本地路径)。

**5. 看存储。** 云代理无本地存储配置(数据在云)。本地引擎有本地存储(文件 / sqlite / 本地 DB)。

用这个清单快速过 Universal Memory MCP:源码 `new Supermemory({apiKey})` 调云 ✓(云代理)、只有 SUPERMEMORY_API_KEY 配置 ✓、断网 401 ✓、Self-hosting 指向 console ✓、无本地存储 ✓——五条全中,确证是云代理。这个清单能帮你避免被"MCP server"名字误导。

## 附录 F:deprecated 的具体信号

Universal Memory MCP 的 deprecated 信号(本次实测确认):

**README banner。** "MCP v1 is being deprecated. Please get the latest version from app.supermemory.ai..."——官方明确说 v1 弃用,指向新位置。

**维护版位置。** "maintained version ... monorepo"——维护版已移到 monorepo(可能是 supermemoryai/supermemory 主仓的一个子目录),这个独立仓库(supermemory-mcp)不再维护。

**最后一次实质更新。** 仓库的提交历史显示主要是维护性更新(依赖 bump 等),无新功能开发。

**对比 OpenMemory 的 sunset。** OpenMemory 也是 sunset(让位于新 Mem0 自托管 server)。两个"记忆 + MCP"打包都在 deprecated——印证附录 F(OpenMemory)说的"包装层洗牌"。

deprecated 不等于"立即不能用"——mcp.supermemory.ai 官方托管版应该还能用。但它意味着:这个独立仓库(supermemory-mcp)不再维护,新功能 / bug 修复去 monorepo 或 app.supermemory.ai。如果你要 Supermemory 云 + MCP,用官方托管的(不要 fork 这个 deprecated 仓库);如果你要本地记忆,根本不是这个仓库。

所以 Universal Memory MCP 的最终建议不变:**避开这个 deprecated 仓库。** 要 Supermemory 云用官方托管,要本地记忆用 supermemoryai/supermemory 自托管二进制(见 Supermemory 文档)。"避开"不是因为云代理形态错,是因为这个具体仓库 deprecated + 名字误导。

## 附录 G:Supermemory 的"云 vs 本地"两条产品线

Universal Memory MCP 的混乱,部分源于 Supermemory 有"云"和"本地"两条产品线,容易混:

**Supermemory 云(SaaS)。** app.supermemory.ai,托管记忆服务(优化模型、规模、Connectors、托管 MCP at mcp.supermemory.ai)。数据在 Supermemory 基础设施。付费 / 需账号。

**Supermemory 本地(自托管二进制)。** `supermemoryai/supermemory` 仓库的 `supermemory-server` 二进制(curl install 装)。本地跑(:6767),图谱引擎 + profile + 矛盾消解 + 自带 WASM embedder + bring-your-own LLM(含 ollama 完全离线)。本次评测实测的就是这个(冒烟 67% / LME 50%)。

**两条线的 MCP。** 云的 MCP = mcp.supermemory.ai(官方托管,指向云)。本地的 MCP = 本地二进制暴露的 HTTP API(:6767),不是 MCP server(本地 MCP 端点是平台特性)。

**Universal Memory MCP(supermemory-mcp)的位置。** 它是"云的 MCP 入口"的 deprecated 版本(指向云,Cloudflare Worker)。它既不是本地引擎,也不是当前的云 MCP(当前是官方托管的 mcp.supermemory.ai)。

所以混乱来源:Supermemory 有云 + 本地两条线,各有 MCP 形态,加上 deprecated 的 supermemory-mcp,容易混。理清:
- 要 Supermemory 云 + MCP → 官方托管 mcp.supermemory.ai(不用 supermemory-mcp 这个 deprecated 仓库)。
- 要 Supermemory 本地 → supermemoryai/supermemory 自托管二进制(本地引擎,本次评测 67%/50%)。
- 不要 → supermemory-mcp(deprecated 云代理仓库)。

## 附录 H:从 Universal Memory MCP 看"开源 vs 云入口"的边界

Universal Memory MCP 引出一个有意思的边界问题:一个"开源仓库"(MIT license、GitHub 公开、有 star)和一个"云服务入口"的边界在哪?

**表面信号都像开源项目。** Universal Memory MCP 有 GitHub 仓库、MIT license、1700 star、README、代码公开。这些信号让大多数人(和"awesome 清单")把它归入"开源记忆项目"。

**实质是云入口。** 但它的代码只是调 Supermemory 云的 SDK,没有本地能力,需要云 key,自托管也要云。它是"用开源 license 包装的云服务入口"。

**这不是孤例。** 很多"开源 AI 工具"实际是"云服务的客户端 / 入口"——开源了外壳(client / MCP wrapper / SDK),核心能力在云。区分它们要看:核心能力(记忆 / 推理 / 数据)在本地还是云。

**对采用者的含义。** 看到"开源 AI 记忆项目"时,问一句"它的核心能力在本地还是云":
- 本地(Mem0 / Letta / Memvid / Supermemory 二进制 / Graphiti):能力在本地,你掌控。
- 云入口(Universal Memory MCP / 某些 SDK):能力在云,你依赖云。

这个区分比"开源不开源"更重要——开源了外壳不等于你掌控了能力。Universal Memory MCP 教训:别被"开源 + star + 名字"骗了,看核心能力在哪。

## 附录 I:本次评测对 13 个项目的"角色"最终归类

Universal Memory MCP 是最后一个值得深挖的"角色纠偏"。把本次评测 13 个项目的"角色"归类,作为收尾:

**生产级本地记忆引擎(可独立采用):** Mem0、Letta、Supermemory(二进制)、Memvid、Graphiti。这五个是"核心能力在本地、可独立部署"的真引擎,选型主要看记忆模型匹配。

**框架内置模块(绑定生态):** LangMem(LangChain)、LlamaIndex Memory(LlamaIndex)。是框架组件,不是独立后端;已用对应框架时考虑。

**sunset / deprecated(不建议新采用):** OpenMemory MCP(sunset)、Universal Memory MCP(deprecated)。引擎可能好(Mem0 / Supermemory 云),但具体打包停维。

**参考实现 / 模板(学习用):** Reference Memory MCP。MCP 官方示范,基础,作起点。

**note/KB 工具(不是 QA memory):** Basic Memory。作知识库用采用,作 QA memory 避开。

**未跑通(待验证):** Cognee(schema bug,双后端 BLOCKED)、Hindsight(py3.13 装不上)。等修。

**这个归类比"排名"更有用**——它告诉你每个项目"是什么角色、适合什么场景",而不是简单的"谁第一"。选型时按你的场景(要引擎 / 要框架组件 / 要模板 / 要 note/KB)对号入座,而不是按 star / 榜单。这是本次 13 个项目逐个深挖后,最想留给读者的"选型地图"。