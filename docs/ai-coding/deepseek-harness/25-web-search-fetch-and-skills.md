# Web 搜索抓取与 Skills 技能系统

> `ctx.web` 和 `ctx.skills` 是两个共享同一设计哲学的能力接缝，都把多个 provider 合并成一张模型面向的稳定表面，换 provider 不改模型怎么问，模型面向的名字、schema、展示全集中在单个 consumer 里。
> `ctx.web` 把搜索和抓取合成一个能力、按调用时选 provider；`ctx.skills` 把多来源技能按层合并、按需加载正文，连模型可见的技能目录都是动态注入的会话历史。

## 两个接缝，一个主题

这篇把 web 和 skills 放一起讲，不是因为它们功能相近（一个联网、一个管指令），而是因为它们共享同一个架构主题：**多 provider，一张模型表面**。

很多系统接多个搜索引擎、多个技能来源时，会把每个 provider 的差异泄漏到模型那一层，于是模型得知道"我在用 Exa 还是 Perplexity"，技能目录也跟着来源变。`dsh` 的做法相反：provider 注册的是能力，模型面向的名字、schema、提示引导、展示全部集中在一个 consumer 包里。换搜索 provider，模型怎么问不变；换技能来源，模型看到的目录格式不变。

下面分别拆。

## Web 接缝：`ctx.web`

`ctx.web` 的服务类型是 `WebRuntime`，定义在 `packages/web/web`。它是一个可选能力，不在 agent-loop 主干里。它在一个接缝上放**两个操作**：搜索（search）和抓取（fetch）。

### 为什么一个能力有两个操作

搜索和抓取不共享请求 schema，也不共享业务逻辑。但它们被故意做成同一个 `ctx.web` 中间层，因为它们共享：一个 provider 选择策略 owner、一套 abort/error 词汇、一个面向产品的"这个 harness 怎么联网"配置 API。

代价是服务上有成对的 `searchX`/`fetchX` 方法。文档明确说：这种平行是**故意的，不是漏了抽象**。硬把它们抽成一个泛型方法，反而会把两个本不同的东西拧巴到一起。

provider 注册的是**能力**（一个 `WebSearchProvider` 或 `WebFetchProvider`），不是工具。模型面向的 `web_search`/`web_fetch` 工具名、schema、提示、展示，全在单个 `dsh-tool-web` consumer 里。当前搜索 provider 有 exa、perplexity、deepseek 三个，抓取 provider 有 `web-fetch-http`。

### 搜索：query 进，引用出

模型面向的工具参数就一个 `query`。`maxResults` 是 consumer 拥有的上限（`dsh-tool-web` 的 `searchMaxResults` 配置，默认 `8`），穿过接缝，在回来的路上强制：如果 provider 多返回了，接缝截断 `sources[]` 并置 `truncated`。

搜索结果是 `WebSearchResult`，三个字段：`content` 是可选字符串，放 provider 生成的答案或摘要；`sources` 是 `readonly WebSearchSource[]`，可引用来源，已截断到 `maxResults`；`truncated` 是布尔，接缝为守 `maxResults` 砍了来源时为 `true`。

Exa 和 DeepSeek 不返回 `content`，Perplexity 返回生成的答案。`WebSearchSource` 里只有 `url` 必填，`title`、`snippet`、`publishedAt` 都可选，因为不是每个 provider 都返回它们。文档有句话很到位：**强迫适配器编造这些字段，会让接缝撒谎**（Perplexity 的引用可能只有 URL）。`dsh-tool-web` 渲染时用 `title ?? hostname(url)` 兜底。

### 抓取：URL 进，资源出

`WebFetchRequest` 就一个 `url`。它**故意省略** timeout、format、prompt、extraction 这些控制：取消是直接执行参数，展示和更高层的 LLM 关注点不属于安全抓取。

一个反常识的点：**HTTP 状态是抓取到的资源状态的一部分，不自动算失败**。一个成功的网络抓取拿到 `404` 或 `500`，返回的是一个带状态码和有界解码 body 的 `WebFetchResult`，不是错误。`url` 是允许重定向后的最终 URL。`WebError` 留给"没法安全抓取或表示资源"的失败。

body 是个封闭判别联合（`html` 或 `text`），由 `dsh-web` 拥有：provider 解码 kind，`dsh-tool-web` 渲染。加一个新 kind 是跨已知包的协调变更，不是插件扩展，消费者用 `default: assertNever(...)` 收尾，加了不处理就编译失败。这和 stream 契约、LSP 操作的封闭联合是同一套路。

### provider 可用性：本地检查，不打网络

一个 provider 的 `available()` 是个**廉价的本地检查**（凭证在不在、配置能不能解析），**绝不打网络**。它是执行时选择的输入，不是健康系统。`search()`/`fetch()` 读它来挑一个能用的 provider，选不出来就抛结构化的 `WebError`。

### 选择：调用时解析，与顺序无关

选择在调用时解析，永远不依赖注册、配置或 HMR 顺序：

- 配置了 id 且注册且可用 → 那个 provider。
- 配置了 id 但没注册 → `WEB_PROVIDER_CONFIGURED_MISSING`。
- 配置了 id 注册了但不可用 → `WEB_PROVIDER_CONFIGURED_UNAVAILABLE`。
- 没配 id，恰好一个可用 → 那个。
- 没配 id，多个可用 → `WEB_PROVIDER_AMBIGUOUS`（不是先到先得）。
- 没配 id，没有可用 → `WEB_PROVIDER_UNAVAILABLE`。

注意"多个可用且没配 id"是 `AMBIGUOUS` 而不是 first-wins。这是个明确选择：歧义要大声报错，不能默默挑一个，否则行为不可预测。

### 错误：开放的 code

`WebError` 的 `code` 是个**开放字符串**，不是封闭联合（和 `LlmError`、`SubagentError` 一样）。一个 provider 可以抛自己的 code，不用改 `dsh-web`，消费者必须容忍未知 code。

code 按拥有者分。接缝中立的 code 由共享的 `WebRuntime` 契约抛：`WEB_PROVIDER_UNAVAILABLE`、`WEB_PROVIDER_CONFIGURED_MISSING`、`WEB_PROVIDER_CONFIGURED_UNAVAILABLE`、`WEB_PROVIDER_AMBIGUOUS`、`WEB_DUPLICATE_PROVIDER`（注册时编程错误，类比 `DUPLICATE_ADAPTER`）、`WEB_ABORTED`、`WEB_PROVIDER_ERROR`（provider 自己失败经接缝抛出的兜底，含网络/传输失败如 DNS、连接拒绝、TLS）。抓取传输的 code 由 `web-fetch-http` 实现拥有，别的抓取后端不必抛它们：`WEB_INVALID_URL`、`WEB_BLOCKED_URL`、`WEB_REDIRECT_BLOCKED`、`WEB_FETCH_TOO_LARGE`、`WEB_FETCH_TIMEOUT`、`WEB_UNSUPPORTED_CONTENT_TYPE`。

### 抓取安全

本地抓取后端只接受 HTTP(S)，拒绝凭证，对重定向、字节、字符、时间都设上限，对每个同源重定向跳重新校验，然后解码 body。展示归工具。

一个重要的安全提示：**本地后端不拦截私网目标**。所以别在能触达敏感内部服务的环境里开 `web_fetch`。这是把"抓取能力"和"网络安全策略"分开的后果：接缝只管安全抓取，不管你的网络拓扑里哪些是禁区。

## Skills 接缝：`ctx.skills`

`ctx.skills` 的服务类型是 `SkillRegistry`，定义在 `packages/skill/skill`。技能是可选的**指令**，不是会话事件。它的家族有四个包：Service Definition（`dsh-skill`）、本地 provider（`dsh-skill-filesystem`）、可选的打包徽章 provider（`dsh-skill-badge`）、Consumer（`dsh-tool-skill`）。

### 分层注册表

`ctx.skills` 是个 host 加 per-scope 的分层注册表，沿用了工具注册表在 `dsh-scope` 上建立的形状。一条注册落在它调用上下文 scope 的层里：host 行和仓库插件落进全局层，一个被 agent preset 挂载的插件落进那个 preset 的层。一次读把全局层和观察 scope 的链合并：**最近的层对一个重名技能直接赢**，rank 顺序只在同一层内决定重名。

这个分层是"scoped agent registration"主题的应用：同一个进程里两个 agent 可以用不同的技能集，因为它们各自的 scope 链不同。重命名一个 scope（比如空白会话重组）对下一次读可见，不需要注册表变更。

provider 注册是同步的（在 `apply()` 里），远程初始化和发现放在 await 的 `list()` 里。`SkillProvider` 有 `name`、`list(options)`（返回候选数组或显式 observation）、`get(candidate, options)`（加载完整技能正文）。

`SkillProviderObservation` 让一个 provider 暴露"还能直接加载的候选"，同时报告"这次发现不是权威的"（`complete: false`）。这处理了远程技能源暂时连不上的情况：还能用已知的候选，但不缓存。

### 本地发现优先级

本地 provider 按 rank 顺序扫根：

| Rank | 来源 | 根 |
|---|---|---|
| 100 | project-dsh | `<projectRoot>/.dsh/skills` |
| 200 | project-agents | `<projectRoot>/.agents/skills` |
| 300 | custom | `Config.customSkillDirs` |
| 400 | user-dsh | `<dshHome>/skills` |
| 500 | user-agents | `<agentsHome>/skills` |
| 600 | bundled | `Config.bundledSkillDir` |

项目根是最近的含 `.git` 的祖先目录；没有就用当前 cwd。当 `ctx.fs` 可用时，git 根的遍历通过文件系统服务探测 `.git`，这样远程或沙箱工作区不会退回到宿主文件系统边界。这条和前面 fs 接缝的"共享执行世界"是连着的：技能发现也跟着执行世界走。

技能名是 kebab-case，本地 provider 接受目录 bundle（`<name>/SKILL.md`）和扁平 Markdown（`<name>.md`）。不支持嵌套递归的 `**/SKILL.md` 发现。

### 调用策略：两个独立开关

`SkillInvocationPolicy` 把两个独立的调用控制归一成正布尔：

`modelInvocable` 决定模型面向的目录和加载器是否包含这个技能，`userInvocable` 决定人类命令目录和加载器是否包含。

`ctx.skills.list()` 保留全部四种组合：纯模型技能、纯用户技能、两者都行、两者都不（只能通过受信任的 `ctx.skills.get()` 调用方访问）。本地 provider 读 frontmatter 的 `disable-model-invocation` 和 `user-invocable` 键，省略的默认 `true`，把每个解析出的技能投影成这个归一策略。

### 三种形态：摘要、候选、完整定义

- `SkillSummary`：注册表的调用中立摘要。模型会话目录只用 `name` 和 `description`，永远不用正文或绝对路径。
- `SkillCandidate`：provider 到注册表的形状，带 `rank`（低 rank 赢重名）、`locator`（不透明的 provider 句柄，注册表只存着还回去）、可选 `path`/`metadata`。
- `SkillDefinition`：`ctx.skills.get()` 返回的完整解析结果，带 `content`（markdown 正文）、可选 `path`/`metadata`/`resourceBase`。

一个关键设计：**完整定义不被注册表缓存**。每次 `get()` 都用选中的候选调赢的 provider，本地 provider 会重读当前正文。这意味着技能正文改了，下次调用立刻生效，不用刷新缓存。代价是每次加载都要读；回报是永远拿到最新正文。

### 会话目录：动态注入的会话历史

这是 skills 最有意思的部分。`dsh-tool-skill` 在一个活会话首次观察到非空完整视图时，在第一个 `agent/pre-step` 注入一条持久的 user 角色 `<system-reminder>`。目录里只有排序后的 `name` 和 XML 转义的 `description`，**不含正文、路径、来源、provider、路由提示**。

每个后续模型步之前，consumer 算出 `<available_skills>` 标签之间渲染条目的 digest。digest 变了，就通过 `agent.inject()` 追加一条持久的全量替换；删光所有技能就追加一条显式的空替换。不完整的快照保留上一次好的模型视图。**这些目录消息是会话历史，不是 World State。**

`skill({ name })` 工具：校验 kebab-case 名字，在调用中立目录里找摘要，除非 `isModelInvocable` 允许否则加载前就拒绝，然后为调用方 cwd 重读完整定义，返回前再查一次策略，返回带 `<skill_content>`、`<skill_resources>`、`<skill_instructions>` 的工具结果。

一个优雅的细节：**只改正文不改目录的编辑，会改变后续工具调用，但不产生目录消息，也不改写之前的工具结果。** 因为正文不缓存，每次 `get()` 重读，正文一改下次调用就拿到新的；而目录消息只在 name/description 变化时才发。这把"技能可用性变化"和"技能正文变化"分成了两个不同频率的通知。

`skills/change` 事件是个不带 diff 的未过滤失效通知：消费者用自己的查找选项重新拉目录。监听器失败被隔离，不能否决注册表变更。

## 两个接缝的共同主题

把 web 和 skills 并排看，几个共同模式清晰起来：

**provider 注册能力，不是工具。** web provider 注册的是搜索或抓取能力，技能 provider 注册的是技能来源。模型面向的工具（`web_search`、`skill`）在 consumer 里，provider 不决定模型看到什么。

**换 provider 不改模型表面。** 换搜索 provider，`web_search` 的参数不变；换技能来源，`skill` 工具不变。模型永远面对同一张稳定表面，provider 的差异藏在接缝后面。

**consumer 拥有模型面向的一切。** 名字、schema、提示引导、展示，全在 `dsh-tool-web` 和 `dsh-tool-skill` 里。这让 provider 实现和模型接口解耦。

**选择/合并在调用时做，不依赖顺序。** web 的 provider 选择在调用时解析；skills 的层合并在读时做。都不依赖注册顺序或 HMR 顺序。

## 真实代码落点

- `packages/web/web/src/types.ts`、`index.ts`：`WebRuntime`、搜索/抓取类型、选择规则。
- `packages/web/web-search-exa`、`web-search-perplexity`、`web-search-deepseek`：三个搜索 provider。
- `packages/web/web-fetch-http`：抓取 provider，拥有抓取传输错误码。
- `packages/web/tool-web`：`web_search`/`web_fetch` 工具 consumer。
- `packages/skill/skill/src/index.ts`：`SkillRegistry`，分层合并。
- `packages/skill/skill-filesystem`：本地 provider，rank 扫描、Chokidar 监听。
- `packages/skill/tool-skill`：`skill` 工具 consumer，会话目录注入。

## 权衡与局限

**web 的两个操作平行方法是代价。** 不抽成泛型是为了不拧巴，但 API 表面上确实有成对方法。这是用 API 对称换语义清晰。

**web 多 provider 没配 id 是 AMBIGUOUS 不是 first-wins。** 这要求部署方显式配 provider，否则报错。对懒人是个小麻烦，但对行为可预测是必要的。

**web_fetch 不拦私网。** 安全长在部署方配网络安全策略，不在接缝。这是能力边界的清晰划分，但意味着开 web_fetch 前要评估网络可达性。

**skills 完整定义不缓存，每次重读。** 正文永远最新，但高频加载有读开销。对绝大多数场景可接受。

**skills 目录是会话历史不是 World State。** 压缩可能藏掉历史目录消息，下次完整快照会重建。这意味着技能目录在超长会话里有重建成本。

## 结论

`ctx.web` 把搜索和抓取合成一个能力，按调用时选 provider，HTTP 状态是资源状态不是失败，错误 code 开放分拥。`ctx.skills` 是分层注册表，按层合并多来源技能，按需重读正文，会话目录是动态注入的会话历史。

两个接缝共享一个主题：多 provider 合并成一张模型面向的稳定表面，换 provider 不改模型怎么问，模型面向的一切集中在 consumer。几个判断：web 的多 provider 没配 id 报 AMBIGUOUS 而不是默默挑一个；抓取的非 2xx 是结果不是错误；技能正文不缓存所以永远最新；技能目录消息是会话历史，只改正文不产生目录消息。

这套设计让"接哪个搜索引擎""技能从哪来"成为部署方的配置选择，对模型完全透明。provider 的多与少、来源的远与近，都不污染模型接口。这就是接缝抽象在联网和技能这两个最容易泄漏差异的地方，又一次收得干净。

## 延伸阅读

- [Web Access 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web.md)：本文主要依据之一，含搜索/抓取契约与选择规则
- [Skills 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md)：本文另一主要依据，含分层注册表与会话目录
- [Web capability seam 笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md)：web 接缝的设计
- [Capability Seams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)：`ctx.web`、`ctx.skills` 行
- [Scoped Agent Registration](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/12-scoped-agent-registration.md)：skills 分层注册表的 scope 基础

上一篇：[Jobs 与 Workflow：后台任务与工作流编排](./24-jobs-and-workflow-ralph.md)
下一篇：[上下文预算：Compaction 压缩与 Spill 溢出](./26-context-budget-compaction-and-spill.md)
