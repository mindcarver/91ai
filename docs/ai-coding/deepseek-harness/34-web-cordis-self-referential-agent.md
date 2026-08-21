# web-cordis：dsh 里会改自己插件树的 agent

> `web-cordis` 让 agent 在运行时往自己的 Cordis 进程里挂载模型写的插件，inspect 当前活着的插件树，跑起来，停掉，卸掉，全程不碰磁盘、不重启进程、不改任何配置文件。
> 这一篇拆 `@deepseek-ai/dsh-tool-cordis` 的五个自指工具和它背后的 `@deepseek-ai/dsh-cordis-host-runner` 运行器，看一个 agent 怎么变成自己架构的编辑者。

## 什么是"自指"：agent 改自己的插件树

先把这个概念说清楚，因为它听起来像递归玄学，落到工程上其实很具体。

`dsh` 的一切能力都是 Cordis 插件挂上去的：模型适配器、工具注册表、会话日志、agent loop，全是插件。正常情况下，你改插件树的方式是编辑 `cordis.yml`，重启进程。这是"开发时"的扩展。

`web-cordis` 示例展示的是另一种可能：agent 在运行时，通过工具调用，直接往当前进程的内存里挂载一个新插件。这个插件是模型自己写的代码，挂上去之后立刻活起来，可以注册工具、注册 prompt 片段、监听事件，就像任何正常插件一样。不需要重启，不需要改文件，不需要装包。

这就是"自指"（self-referential）的意思：agent 在修改自己的运行时结构。它的插件树不再是启动时固定的，而是 agent 在对话过程中可以动态编辑的活东西。

这不是一个玩具。它展示了 Cordis"一切皆插件"架构的终极推论：如果连 agent loop 都是插件，那 agent 自己就能编辑这个插件组合。能做到这一点，是因为 Cordis 的注册是可逆副作用，挂载和卸载都是干净的运行时操作。

## 两个包，一个负责工具，一个负责运行

这套功能拆成两个包，分工明确。

**`@deepseek-ai/dsh-tool-cordis`**：五个模型可见的工具（`cordis_inspect`、`cordis_define`、`cordis_run`、`cordis_stop`、`cordis_undefine`）。它只负责把模型意图翻译成对运行器的调用，自己不持有任何状态，不跑任何代码。

**`@deepseek-ai/dsh-cordis-host-runner`**：真正干活的运行器，提供为 `ctx.dynamicCordisRunner` 服务。它持有定义注册表、vm 沙箱、fiber 生命周期、invoke 处理器表。没有这个运行器，五个工具不会激活（`tool-cordis` 的 `inject` 声明了 `dynamicCordisRunner`，缺了就不启动）。

这个分工遵循 `dsh` 的一贯模式：工具是薄壳，能力是服务。工具负责对模型暴露，服务负责持有机制。

挂载方式是在 `cordis.yml` 的 patch 层里插一个 `insert` 块，块里两个条目：`id` 为 `cordis-host-runner`、`name` 为 `@deepseek-ai/dsh-cordis-host-runner` 的运行器，和 `id` 为 `tool-cordis`、`name` 为 `@deepseek-ai/dsh-tool-cordis` 的工具包。跑起来用一行 `pnpm run demo:cordis`，需要 `DEEPSEEK_API_KEY`。这个 demo 默认起在 3081 端口（避开 3080），因为它是一个 patch overlay 叠在 web profile 上。

## 五个工具的生命周期

模型操作动态插件包的完整生命周期由五个动词覆盖。

**`cordis_inspect`**：只读报告。扫描当前进程里的 services、所有活着的 plugin fiber、已注册的工具、当前会话的动态包。可以指定 `what: "api"` 看某个 service 的完整方法签名，`what: "events"` 看事件契约，`what: "client"` 看浏览器端可以贡献 UI 的 slot 接口。这是模型的"眼睛"，让它知道当前运行时长什么样。

**`cordis_define`**：记录一个包定义。模型提交包名、用途、host 半边代码（在服务端跑的）和可选的 client 半边代码（在浏览器跑的）。两个半边都会先做语法检查（编译但不运行），通不过就拒绝，连 id 都不发。通过后拿到一个 `dyn-<n>` 的 id。注意：**define 只记录，不运行。** 模型在对话里看到一张卡片，上面有启动按钮。

**`cordis_run`**：真正让包活起来。host 半边在 vm 沙箱里求值，在 `cordis-dynamic` group fiber 下运行。如果包有 client 半边，这一步变成一个需要人确认的往返：发出 `cordis/request-run` 事件，挂起，等一个打开的浏览器页面允许或拒绝。第一个回答赢。重复 run 一个已经在跑的包不报错，而是重新投递当前活的版本，页面刷新后就是这样拿回包的。

**`cordis_stop`**：停掉一个运行中的包。丢弃处理器、把 host 半边的 fiber 销毁到平静（quiescence）、广播 retract 通知。定义保留，可以再跑。

**`cordis_undefine`**：如果还在跑就先停，然后忘掉定义。卡片留在对话里作为未加载的记录。

这五个动词覆盖了"定义、运行、停止、卸载"的完整循环，加上 inspect 的只读观察。

## 关键设计：define 不运行，run 才有效果

这个两阶段设计是整个功能的安全骨架。

`define` 阶段只做三件事：检查元数据、对两个半边做语法检查（编译不运行）、发一个 id。没有任何副作用需要回滚。如果代码语法不对，在 id 存在之前就被拒绝了。这意味着对话历史里不会出现一个"定义了但坏了"的幽灵包。

`run` 阶段才产生效果。host 半边在沙箱里求值，client 半边（如果有）走人工确认往返。所有真正有副作用的操作都挂在 run 上，这让停掉一个包（stop）变得干净：只要回退 run 时的注册，不需要管 define。

这个设计还有一个后果：运行中的包如果注册了工具、prompt 片段或监听器，会改变后续请求。`cordis_stop` 和 `cordis_undefine` 在平静后移除这些贡献。所以一个动态包的生命周期和它对模型行为的影响是完全对齐的：跑起来才影响，停下来就消失。

## 浏览器半边：一个人确认的往返

一个动态包可以有两半：host 半边在 `dsh` 服务端跑，client 半边在浏览器里跑。这种"双面"包需要一个特殊的加载流程。

当模型调用 `cordis_run` 跑一个有 client 半边的包时，运行器不会直接把代码推给浏览器。它发出 `cordis/request-run` 事件，只带元数据（requestId、agentId、包 id、名称、用途），绝不带代码，然后挂起。

一个打开的浏览器页面收到这个事件，显示一个确认界面。人点了允许，页面通过 `runHostHalf` 先在服务端跑 host 半边（如果 host 半边失败，短路，浏览器半边不会加载），然后通过 `getClientCode` 拿到 client 半边的源码去加载。**代码只通过 `getClientCode` 这条路到达浏览器，永远不搭事件通知的便车。**

第一个回答赢。其他页面收到 `cordis/request-run-resolved` 后丢掉待处理的确认界面。如果回答了一个已经被取代的 revision，会被拒绝（`accepted: false`），请求继续挂起。

为什么这么谨慎？因为代码是执行物，元数据是展示物。把两者混在一条通道里，等于让事件通道变成代码注入通道。`dsh` 选择把它们物理隔离：事件只带元数据，代码只走显式的 `getClientCode` 调用。

## 信任立场：vm 沙箱不是安全边界

这是整个功能最重要的一句话，README 反复强调：

> The sandbox isolates globals but is not a security boundary.

host 半边代码在 `node:vm` 沙箱里跑。Node 的全局变量被移除或重定向到 Cordis 服务：`ctx.fs`（文件系统）、`ctx.web`（联网）、`ctx.bash`（命令执行）、定时器助手。写到 `globalThis` 的操作留在沙箱局部。

但这不是安全沙箱。host 领域的助手函数在沙箱全局上是可达的，包代码可以借此到达 Node。README 原话是：

> Treat this toolset like bash access.

加载这个工具集，等于给 agent 一个 bash 工具。它不是安全边界，是对诚实代码的隔离。你不会拿它跑不受信任的代码。

这个信任立场解释了为什么 demo 的 `cordis.yml` 里有这句注释：

> Temporary Plugin code can reach every injected live capability; treat this deployment like shell access, not as a security boundary.

## 会话隔离与内存真相

动态包的生命周期有两个关键属性。

**会话作用域。** 一个包只在定义它的那个会话里可见和可控。`inventory`（全局列表）能看到所有会话的包（因为运行控制面是全局的），但每个操作动词都会检查所有权。另一个会话定义的包，对你来说读出来是不存在，不是禁止。这防止了跨会话泄漏。

**进程内存是唯一真相。** 注册表是进程内存，没有持久化。会话日志只记录 define 调用的元数据，不记录代码。所以进程重启后，所有动态包都消失了。一张卡片上的 id 如果不再对应任何定义，inspect 会如实说"定义不存在"，不会假装还能跑。

这意味着动态包是实验性的、临时的。如果你想把一个实验固化下来，README 的指引是：让 agent 把它实现成一个正常的本地、项目或仓库插件，走常规的开发流程。动态包不是插件的替代品，是插件的草稿纸。

## 生成的目录：让模型读到正确的 API

`cordis_inspect` 之所以能让模型理解当前运行时，靠的是两个编译时生成的目录。

**`api-catalog.ts`**：仓库里所有 Cordis 声明的投影。方法签名、源码 JSDoc、harness 事件的派发模式、类型形状，全部由 AST 遍历生成。它和 `docs/subsystems` 的渲染用的是同一次 AST 遍历，所以模型读到的和文档渲染的不会分叉。用 `pnpm run gen-cordis-api` 重新生成，`pnpm run verify-cordis-api` 做新鲜度门禁。

**`client-catalog.ts`**：浏览器半边可以贡献 UI 的 slot 接口。由 `scripts/gen-client-catalog.ts` 从所有 `SlotMap` 声明合并和 `slots.register` 调用点的词法扫描生成。它告诉模型：浏览器端有哪些座位可以坐，每个座位的 props 是什么，谁已经占了。

这两个目录是编译时事实，不是运行时反射。模型读到的 API 列表和仓库代码是完全同步的，因为它是从代码生成的。一个新声明的 key 如果没进目录，门禁会失败，而不是悄悄让模型去 inject 一个永远到不了的 service。

这里有一个有意识的筛选判断：**只把 host 半边能到达的 key 暴露给模型。** `src/curation.ts` 把每个 ctx key 分成三类：`injectable`（可注入）、`not-a-service`（不是服务）、`other-face`（另一面，比如浏览器端的 service）。只有 `injectable` 进入报告。命名一个包代码够不到的 key，等于打一个打不通的电话，模型不该看到。

## 权衡：草稿纸的边界

这套功能的边界，用之前要讲清楚。

run 的回执不等于渲染成功。`run` 在页面加载了 client 半边后就返回了，React 渲染在之后发生，一个组件抛的异常不会出现在 run 的回执里。渲染失败走 `reportRenderFailure` 异步报告，用 `cordis_inspect what:"temporary"` 读回来，run 结果会说明这一点，而不是暗示成功。有 client 半边的包在没有页面的部署里（headless、ACP）会一直挂起，直到发起的 turn 被取消，因为转发的事件不报告谁收到了它；挂起的 run 也没有超时，无人值守的自动化用不了这类包。`vmTimeoutMs`（默认 5000ms）只约束 host 半边的同步执行，一个 async 的 host 半边体逃逸这个限制，和工具集的协作式信任立场一致。包代码不能注册自定义销毁器，ctx facade 不暴露 `effect()`，支持的清理路径只有 `on`/`provide`/`tools.register`，这是有意的限制，自定义销毁器会让卸载语义不可控。

换来的是插件实验的零摩擦：不动磁盘、不重启、不装包，一个想法从对话到运行只有一次工具调用的距离。

## 结论

这套功能把 Cordis"一切皆插件"推到终点：agent 用五个工具在运行时编辑自己的插件树，define 只记录、run 才生效，代码进浏览器只走显式的拉取通道，进程内存是唯一真相，重启即清零。信任立场要记牢：vm 沙箱不是安全边界，加载这套工具集等于给 agent 一个 bash。它是插件的草稿纸，不是插件的替代品，想把实验固化就走常规开发流程。

## 延伸阅读

- [tool-cordis README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/tool-cordis/README.md)
- [cordis-host-runner README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/cordis-host-runner/README.md)
- [web-cordis 示例](https://github.com/deepseek-ai/deepseek-harness/blob/master/examples/web-cordis/README.md)
- [自指工具集 Agent Note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md)
- [工具目录（generated）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md)

上一篇：[ACP 协议与 acp-agent：dsh 的 agent 通话标准](./33-acp-protocol-acp-agent.md)
下一篇：[配置、凭证与存储：dsh 的有状态底座三件套](./35-settings-credentials-storage.md)
