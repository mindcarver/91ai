# dsh Web 客户端：Chat Nodes 与多 agent 协议

> `dsh` 的 Web 客户端是 Host（Node.js）和 Client（浏览器）两半插件图，中间用一条 wire 协议（`window.__DSH_BOOT__`）和一个 HTTP carrier 连起来，两半各自有完整的插件生命周期，不是"后端渲染前端"的单体。
> 这一篇拆 Client Modules 怎么扫描和组装浏览器插件、Web Server 怎么做 HTTP carrier、HMR 怎么热更新、以及 Host-Client 之间的 RPC 协议。

## 两半插件图：Host 和 Client

理解 `dsh` Web 客户端的第一件事：它不是传统的"后端渲染前端"，而是两半独立的插件图，各自有完整的生命周期。

Host 半跑在 Node.js 进程里：所有 agent 能力、模型适配器、工具、会话、沙箱、审批，这是 `dsh` 的主体，跑在服务器或本地进程里。Client 半跑在浏览器里：UI 组件、Conversation Node 渲染器、交互逻辑，是一组独立的 Cordis 插件，在浏览器里加载和激活。

两半通过 HTTP（Web Server 提供的 carrier）和一条 wire 协议连接。Host 不渲染 HTML 模板，Client 不直接调 agent 能力，中间隔着一个 API gateway。

这种分层是刻意的。Host 的 TypeScript 项目和 Client 的 TypeScript 项目是两个独立的 aggregate（`tsconfig.host.json` 和 `tsconfig.client.json`），因为两边在同一个 Context 接口 key 下 declaration-merge 了不同的 service，一个 program 同时看到两边的 merge 会报碰撞。这个碰撞只存在于 `ts.Program` 内部，模块解析不会触发它。

## Client Modules：浏览器插件表

`ctx.clientModules`（`ClientModuleRegistry`）是连接两半的关键服务，做四件事：

1. 扫描：增量扫描 Host Loader 的条目，找出声明了 `dsh.client` 的包。
2. 组装：把扫描到的条目组装成 `WebBootGraph`。
3. 服务：把每个包的浏览器 bundle 服务在 `/plugins/<id>/client.js`。
4. 注入：tap index 渲染，把 boot manifest 注入 HTML。

一个包通过在 `package.json` 里声明 `dsh.client`（`platform: 'web'`，可选 `inject` 依赖边，可选 `immediately` 预取标记）加入这个表，并在 `exports["./client"]` 导出构建后的 bundle。

### 增量扫描

扫描是按包增量的，没有全量重扫代码路径。每次 cordis 的 `internal/plugin` 事件（fiber 构造或销毁）标记那个 fiber 的条目名为 dirty，一个 microtask flush 把每个 dirty 名字和 live loader 条目对账。

激活 pass 用所有当前条目种子同一个 dirty set 并同步 flush，所以首次扫描和稳态共享一个实现，只是失败姿态相反。激活时，一个畸形声明或缺失 bundle 聚合成一个 `AggregateError` 列出所有坏包：fiber 失败，boot 的 fail-loud sweep 报告它。稳态时，一个坏包只 warn，不影响其他包。

包元数据（包括"不是 client 包"的否定判定）按名缓存且永不过期：插件集变更在重启时生效。

## wire 协议：window.__DSH_BOOT__

浏览器怎么知道要加载哪些插件？通过 Host 注入的 boot graph。

Host 把 `WebBootGraph` 作为 `<head>` 里的第一个 script 注入，赋给 `window.__DSH_BOOT__`。图里每个条目（`WebBootEntry`）描述一个包：包名 `id`、bundle endpoint `url`、内容哈希 `rev`，外加两条可选信息，`inject` 依赖边（信息性）和 `immediately` 预取标记。外层的 `WebBootGraph` 自己带一个 `rev` 和一份 `entries` 列表。

rev 是这套协议的缓存一致性锚。每行的 rev 是 bundle 的内容哈希，搭在 URL 上做 cache-busting（`/plugins/<id>/client.js?rev=<rev>`）；图的 rev 哈希所有组合的行，任何一行变化都改变它。`immediately` 标记的行在 module-face boot 期间预取和执行（只注册 factory）；lazy 行在首次 import 时获取。

`<` 被转义，所以插件控制的字符串不能逃出 script 元素。一个没有有效 manifest 的页面无法 boot，浏览器侧 parser 在缺失或畸形的 graph 上大声抛异常。

这个 wire 协议是 Host 和 Client 之间的单一真相源。Host 半和 Client 半产出同样形状的 `WebBootEntry`，不存在第二种格式。

## Web Server：HTTP carrier

`ctx.webServer`（`dsh-host-webserver`）是浏览器的 HTTP carrier。它是一个单一的 `node:http` 插件，提供命名路由注册表、index.html 转换回调和单个 fallback handler。

**它不知道任何 harness 概念。** 每个功能路由（`/api` bridge、plugin bundles、HMR event stream）都由另一个插件注册，Web Server 只提供 carrier。

路由匹配顺序固定：exact 表先，然后最长匹配的 prefix，然后注册的 fallback。注册顺序不影响请求，因为命名路由被组合成不相交的。

`Config` 很小：`host` 只接受 `127.0.0.1`（默认，loopback）和 `0.0.0.0`（刻意的网络暴露），`port` 传 `0` 请求 OS 分配。没有 TLS、认证或 origin policy，所以非 loopback 绑定会把服务器暴露给那个网络。

`tapIndex(transform)` 注册一个纯 html-to-html 转换，应用于每个 index 响应（`/` 和每个 SPA fallback），按注册顺序执行。Client Modules 用它注入 boot manifest。

shipped Web 组合用 `dsh-host-frontend-static` 占据 fallback 座位：SPA dist server，non-GET/HEAD 返 405，dist root 外的遍历返 403，任何 miss fallback 到 `index.html` 返 200（SPA routing）。

## HMR：开发时的热更新

开发时，`dsh-client-hmr` 是 registry 的 watch driver。

它的 Node 半从同步捕获的基线 stat-poll 每个图行的 bundle。检测到变化时调用 `rebuilt(id)`，通过 `onGraphChanged` 重新同步 watch set，并通过 SSE 把 rev 变更广播到浏览器半。

`rebuilt(id)` 是 bundle 内容到达图的唯一入口：它重新哈希文件，只有真正的 rev 变化才重组图并通知。`onRebuilt` 在每个变化的 bundle 时触发，带新 rev；`onGraphChanged` 在任何重组图的 flush 后触发，是 pull 模型，监听器重新读 `graph()`。生产图完全省略 HMR 行，module host 自己从不 watch 文件。

效果是开发时改一个 client 插件的代码，浏览器自动拿到新 bundle，不用手动刷新。背后是 stat-poll（不是 fs.watch，避免跨平台不一致）加 SSE 推送。

## Host-Client RPC 协议

浏览器怎么调 Host 的能力？通过 API gateway 和 `@Remote` 装饰器。

业务 service 在 Host 上用 `@Remote` 或 `@RemoteScope` 声明可调用方法。Host 构建生成 Host-for-Client 类型和 runtime 贡献，Client 的 `api-remotes` 组合加载这些贡献，在 `ctx.remote` 和 scoped `agentCtx.remote` 命名空间下暴露。

这套机制是类型安全的：Host 声明的方法签名通过构建时生成的类型到达 Client，Client 调用时 TypeScript 检查参数类型。运行时通过 `/api` bridge 的 JSON-RPC 消息通信。

`api/remotes` 是仓库里唯一一个 split Host 和 Client tsconfig 的包。它的 Host 条目必须参与 Host Typert 图，而 Client 条目 import 的 `/remote` 声明需要 Host tsdown 先生成。这个 split 是刻意的，但官方文档明确说不要把这种结构复制到其他包。

非浏览器场景不走这条路。Electron 通过 `file://` 加载构建文件，通过 IPC bridge 发 fetch 请求，不用 Web Server。Python SDK 通过 JSON-RPC stdio 和 runtime 通信，不用 HTTP。

## Chat Nodes 在这个架构里的位置

Conversation Node 是 Client 半的插件。一个 Node 的 Definition 和 React renderer 都在 client 包里，通过 `ctx.conversationEvents.register()` 和 `ctx.slots.register()` 注册到 Client 的插件图。

Host 半只负责产生 session 事件，Node 的 match/start/update/buildViewNode 逻辑全在浏览器里跑。**这是两半分工的体现：Host 拥有事件真相，Client 拥有渲染逻辑。**

一个 client 包要贡献 Chat Node，需要三步：在 `package.json` 声明 `dsh.client`，让它进入 Client Modules 扫描；在 `exports["./client"]` 导出构建后的 bundle；在 bundle 的 `apply` 里注册 Definition 和 renderer。之后 Client Modules 把它组装进 boot graph，浏览器加载它，它注册自己的 Node 和 renderer。整个过程不需要改 Host 的任何代码。

## 多 agent 协议在这个架构里

Web 客户端天然支持多 agent 场景。Host 可以同时持有多个 agent（root agent、subagent、后台 job），每个 agent 有独立的 session 和 scope。

Client 通过 API gateway 拿到所有 agent 的状态和事件。Conversation Node 的 scope 机制让不同 agent 的对话渲染在不同的视图区域。subagent 的生命周期和 session 事件通过 `RunResult.notifications` 和 `on_notification` 到达客户端，按 wire 顺序。

ACP server（另有专篇）是另一种多 agent 协议入口，让外部程序通过 JSON-RPC 创建和驱动 agent。Web 客户端和 ACP server 可以共存：Web 给人用，ACP 给程序用，两者共享同一个 Host 进程和 agent 组合。

## 权衡与局限

两半分离是有价签的。一个完整的 client 贡献要同时理解 Host 和 Client 的插件图、wire 协议、RPC 机制，涉及跨进程的类型同步和构建顺序依赖。

wire 协议是 boot 级别的。`window.__DSH_BOOT__` 在页面加载时注入一次，Host 组合在页面加载后变了（HMR 加了新插件），需要重新加载页面才能拿到新 manifest。HMR 的 SSE 机制处理 bundle 内容变化，但不处理 manifest 结构变化。

Web Server 没有安全层：没有 TLS、认证、origin policy，非 loopback 部署需要自己在前面放反向代理做这些。`dsh-client-connection` 的 `trustedHosts` 做了一层 Host header 校验，但不是完整的安全方案。

stat-poll 不是实时的，HMR 默认 500ms 间隔，bundle 变更的检测有几百毫秒延迟。这是跨平台一致性的代价。

Typert Remote 是 build-time 产物。改了 Host 的 `@Remote` 方法签名，需要重新 build 才能在 Client 侧看到类型变化。公开的 `typecheck`、`lint`、`doc-typecheck` 命令会先生成这些产物。

## 结论

Web 客户端是两半独立的 Cordis 插件图：Client Modules 扫描 `dsh.client` 声明并组装 `window.__DSH_BOOT__`，Web Server 只当一个不知道 harness 概念的 HTTP carrier，Chat Node 的定义和渲染全在浏览器侧。Host 产生事件，Client 消费事件，多 agent 场景靠 scope 和 API gateway 表达。代价是贡献一个 client 插件要跨两半的构建与类型链，回报是 UI 的演进不惊动 Host。

## 延伸阅读

- [Client Modules 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/client-modules.md)
- [HTTP Server 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/web-server.md)
- [API Gateway 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/api-gateway.md)
- [GUI Layering and RPC Protocol Agent Note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-07-19-gui-layering-and-rpc-protocol.md)
- [API Remotes README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/remotes/README.md)

上一篇：[Python SDK、Headless 与 JSON-RPC：把 dsh 编进流水线](./40-python-sdk-headless-jsonrpc.md)
下一篇：[错误处理与容错哲学：dsh 这个 harness 怎么不崩](./42-error-handling-fault-tolerance-philosophy.md)
