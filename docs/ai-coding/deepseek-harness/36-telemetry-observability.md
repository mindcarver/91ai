# Telemetry 与可观测性：给 agent 接上 OTel 监控

> `dsh` 的 telemetry 子系统有一条硬边界叫"止于 emit()"，harness 负责捕获和投影会话事件，批处理、重试、排队、丢包策略全归上报 SDK 管，两者泾渭分明。
> 这一篇拆 `ctx.sessionTelemetry` 接缝（`dsh-session-telemetry`）和它的 OpenTelemetry provider（`dsh-session-telemetry-otel`），看一个 agent harness 怎么把内部事件流变成外部可观测的监控数据。

## 为什么 agent harness 需要独立的可观测性

一个 agent 在跑的时候，内部发生了什么？模型请求了几次、每次多少 token、工具调了什么、命令输出了什么、哪个 step 出错了、上下文什么时候压缩了。这些信息都在会话日志（session log）里，但会话日志是给 agent 自己用的：它要从中投影出模型可见的历史、UI 渲染的对话、可 fork/resume 的状态。

可观测性的需求不同。你需要的是把 agent 的运行状态导出到外部系统：一个 OpenTelemetry collector、一个日志聚合服务、一个告警系统。你需要知道生产环境的 agent 有没有在反复失败，token 消耗趋势怎样，哪些会话跑得最久。

这就是 telemetry 子系统存在的理由。它不参与 agent loop，不影响模型请求，只做一件事：把会话事件的副本交给一个上报后端。

## 接缝拆分：capture coordinator 和 OTel provider

遵循 `dsh` 的能力接缝模式，telemetry 拆成两个角色。

**Service Definition 和捕获协调器**（`dsh-session-telemetry`，`ctx.sessionTelemetry`）：拥有捕获点、固定 chunk 投影、`session-telemetry/record` 脱敏瀑布、移交游标、最小后端契约。它定义了"捕获什么、怎么投影、怎么脱敏、怎么交给后端"。

**Service Provider**（`dsh-session-telemetry-otel`）：部署加载的唯一入口。它是 OpenTelemetry JS SDK 的 log pipeline（`LoggerProvider` 到 `BatchLogRecordProcessor` 到 OTLP/HTTP log exporter），原封不动地组合。

这种拆分意味着：如果你不想用 OpenTelemetry，可以写自己的 backend（比如直接写文件、发到 Datadog、推到自研监控），只要实现 `SessionTelemetrySink` 接口。捕获逻辑是复用的，上报通道是可替换的。

## 边界公理：止于 emit()

这是整个子系统最重要的设计原则，README 反复强调：

> The harness's aspect ends at `emit()`; batching, retry, queueing, and loss policy belong to the reporting SDK.

翻译过来：**harness 的职责到调用 `emit(record)` 就结束了。** 后面的批处理、重试、排队、丢包策略，全是上报 SDK 的事。

`emit()` 的契约很严格：**必须是非阻塞入队**。因为协调器在 `session/event` 热路径上同步调用它，任何比队列 push 慢的操作都会拖累 agent loop。如果 `emit()` 抛异常，协调器会 contain 并记录，异常永远不 reach 到 loop。

这个边界定义了 `dsh` 和上报 SDK 的分工。`dsh` 保证捕获完整、投影正确、脱敏到位。SDK 保证可靠投递。两者不互相越界。

## 三种模式：FULL / FEEDBACK_ONLY / DISABLED

OTel backend 有三种模式，控制什么数据什么时候离开进程。

**`FULL`**：每个投影后的记录（包括生命周期 ops 记录）立即交给 OTel SDK。agent 一边跑，事件一边流出去。适合持续监控的生产部署。

**`FEEDBACK_ONLY`**：只有在用户主动记录反馈（`feedback/record` 事件）时，才把规范会话日志的未释放前缀回放、投影、脱敏后交给后端。没有反馈事件就什么都不发。适合"只在用户主动提交问题时才共享会话数据"的场景。

**`DISABLED`**（默认）：不构造 coordinator、provider、processor、exporter。没有记录离开进程。一个 `feedback/record` 会记录"telemetry 已禁用，反馈保留在本地"。这是安全默认值。

配置方式是标准的插件条目：`id` 填 `sessionTelemetry-otel`，`name` 填 `@deepseek-ai/dsh-session-sessionTelemetry-otel`，`config.mode` 设为 `FULL`，`config.exporter.url` 指向 collector 端点（如 `https://collector.example.com/v1/logs`），`config.exporter.headers.authorization` 用 `Bearer ${process.env.OTLP_TOKEN}` 的 JS 插值从环境变量取 token。

授权是正向的、fail-closed 的。未知 mode 在读取传输配置之前就失败。只有 `FULL` 接受直接的 `ctx.sessionTelemetry.emit()` 调用。`FEEDBACK_ONLY` 把 consent 限定为已经存储在会话事件里的那个确切的 `feedback/record` 对象，独立发出的 bus 值会被忽略。`DISABLED` 即使配置了 exporter 选项也不构造 SDK pipeline。

## 固定 chunk 投影：只发第一个 chunk

模型流式输出会产生大量 `assistant/chunk` 事件，一个 turn 可能几十上百个 chunk。如果全发出去，token 体积爆炸。

`dsh` 的解法是**固定 chunk 投影**：每个 `(turn, step)` 只发第一个 `assistant/chunk`，其余在捕获时丢弃。

为什么留第一个？因为它是"流已启动"的信号。有了 `step/start` 加首个 chunk 的存在，加上 `assistant/message` 的存在和 `turn/end` 的原因，接收方可以区分"请求从没开始"和"流中途断了"，不需要全部 chunk 体积。time-to-first-token 也可以算出来。

这个设计有一个直接后果：**线上的 seq 间隙是常态，不是丢包信号。** 接收方看到 seq 从 5 跳到 8，不能假设 6 和 7 丢了，它们可能只是被 chunk 投影丢弃了。其他所有事件类型（包括这个包从没听过的插件合并事件）完整通过。

## 脱敏瀑布：零内置规则

每条记录在投影后、emit 前，穿过 `session-telemetry/record` 瀑布。这是 Service Definition 的脱敏扩展点。

关键设计：**这个包不内置任何脱敏规则。** 最内层的 `next()` 原样传回记录。没有监听器挂上去时，记录按捕获原样到达后端。

这意味着**导出的数据和部署挂载的规则一样干净**。如果没有任何规则，记录原样离开进程，包括文件内容或命令输出里嵌入的凭证。部署方自己负责挂载规则。

瀑布的语义遵循 Cordis 标准：监听器通过转换 `next()` 的返回值来叠加；不带 `next()` 返回就替换下面所有层；抛异常的监听器在协调器的 contain 内丢弃那一条记录（fail-closed），永远不影响 agent loop。

脱敏只作用于导出副本。规范会话日志从不被重写。

## 尽力而为交付和去重

telemetry 的交付是**尽力而为**（best-effort）。协调器维护一个 `WeakMap<Session, seq>` 标记每个会话已移交的最高 seq。注意：是"已移交"，不是"已交付"。

后果很明确：

- **记录可能丢。** 会话在 reload 窗口里被销毁无法重新 adopt，崩溃时 backend 队列里的东西丢失。一个持久 outbox（spool、per-sink 游标、at-least-once）被推迟到有部署提出 crash-loss 需求时。
- **记录可能重复。** cursor-less 的重新 adopt、SDK 重试都可能产生重复。所以接收方在 `(session.id, event.seq)` 上去重。
- **resume 不回填。** 一个 resume 不会回填前一个进程未能交付的记录。需要回填的部署需要那个被推迟的 outbox。

这个 cursor 是对"注册是可逆副作用"原则的一个刻意窄例外：条目随会话消亡，值是单调水位，丢失它从来不是错误。

## 两个通道：ledger 和 ops

记录分两个通道，后端在两个独立的 instrumentation scope 下保持它们分开。

**ledger 通道**：会话日志的镜像。和 session log 事件一一对应，携带 `session.id`、`event.type`、`event.seq` 作为身份属性。这些是可以去重、可以求和的条目。

**ops 通道**：操作信号。只有两个信号：`agent-error`（agent 级错误）和 `shutdown`（会话或进程终止）。它们**故意省略** `event.seq` 和 `event.type`，这样它们永远不会被误认为 ledger 行。ops 记录是用来告警的信号，不是用来求和的条目，它们容忍重复。

severity 在捕获时预映射，让接收方零配置就能告警：`error` 给那些自身 outcome flag 表示出错的事件（tool-result 的 `isError`、`turn/end` 的错误原因）和 `agent-error` 操作记录；其他默认 `info`；`warn` 留给 `session-telemetry/record` 策略和 backend 使用。

## 什么会离开你的机器

这个问题的答案取决于模式。在 `FULL` 和 `FEEDBACK_ONLY` 下，记录携带完整的 `event.data` 作为 `session-telemetry/record` 瀑布返回的内容：

- 用户和 assistant 的消息内容
- 工具参数和结果（命令输出、文件内容）
- 完整的系统提示和工具 schema（`request/header`）
- todo 文本、compaction 摘要、hook 的 stderrSummary、反馈文本
- 会话的 `cwd`（一个本地路径）

这就是全部。API key 不在其中：适配器的 API key 是构造参数，不是会话事件，所以它们在结构上不存在于日志里，因而也不在 telemetry 里。这是凭证子系统（每次解析、不缓存）和 telemetry 子系统协作的结果：凭证天生不进事件流。

但其他敏感信息（文件内容里的密码、命令输出里的 token）**会**在记录里，除非部署挂载了脱敏规则。`dsh` 不替你做这个决定。它提供了 `session-telemetry/record` 瀑布作为扩展点，但规则由部署自己写。

## 共享披露

mounted backend 通过必选的 `sharing` 成员向人类可见的确认界面（`/feedback` 命令）披露当前策略：`full` 是每个事件实时移交，`feedback-only` 是只在反馈触发时回放前缀，`disabled` 是不移交任何东西。

消费者只有在没有任何 telemetry 服务 mounted 时才显示"未配置"。披露声明的是当前策略，不保证交付。移交是非阻塞入队，批处理、重试、丢包策略归 backend SDK。

这个设计让 `/feedback` 命令的确认文本能诚实告诉用户："你的会话数据将以 full 模式共享"或"不会共享任何数据"，而不是一个含糊的"可能共享"。

## OTel 管道的工程细节

`FULL` 和 `FEEDBACK_ONLY` 组合 OTel JS SDK 原样使用：

```
LoggerProvider → BatchLogRecordProcessor → OTLP/HTTP log exporter
```

ledger 记录在 `@deepseek-ai/dsh-session-sessionTelemetry-otel` scope 下，ops 记录在 `.../ops` scope 下。Resource identity 包含 `service.name`/`service.version` 加上这个包生成的匿名 `user.id`（`$DSH_HOME/.anonymous-user-id`，首次使用时创建的随机 UUID，删文件即重置），每个导出批次携带一次而不是每条记录携带。

backend 不实现 `flush()`。批处理器拥有常规刷新。shutdown 时 OTel 在 processor 的 `exportTimeoutMillis` 约束下等 `exporter.forceFlush()`，如果传输 promise 不结算，这个包在 `shutdownTimeoutMillis`（默认 3000ms）处放弃等待。这个 deadline 不能取消 SDK 传输，所以进程退出时仍 pending 的记录可能丢失。

## 权衡与局限

**尽力而为交付。** 没有 durable outbox。崩溃时队列里的东西丢。需要 crash-recovery 的部署要等 outbox 特性。

**零内置脱敏。** 没有规则时，原始捕获副本离开进程，包括凭证。部署负责自己的规则集。这不是疏忽，是刻意的：脱敏规则因部署而异，`dsh` 不替你猜。

**按需脱敏用当前状态。** `FEEDBACK_ONLY` 不保留 telemetry 副本。一个后来的 `captureSession()` 用当前挂载的规则深度复制和脱敏未捕获事件的当前值。没有捕获时的 telemetry 快照或持久的 pre-capture spool。所以反馈前改了策略，会影响那次回放导出的内容。

**上游实验性。** `@opentelemetry/sdk-logs` 仍从上游实验树发布。SDK API churn 只影响这里，不影响接缝契约。

**反馈时崩溃不上传。** `FEEDBACK_ONLY` 在反馈前不保留 telemetry 副本。反馈前崩溃什么都不上传。

## 延伸阅读

- [Session Telemetry 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session-telemetry.md)
- [session-telemetry README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-telemetry/README.md)
- [session-telemetry-otel README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/session/session-telemetry-otel/README.md)
- [Telemetry Revival Agent Note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-07-23-session-telemetry-otel-revival.md)
- [OpenTelemetry 官方文档](https://opentelemetry.io/docs/)

上一篇：[配置、凭证与存储三件套：agent harness 的有状态底座](./35-settings-credentials-storage.md)
下一篇：[配置实战：用 patch 改行为，用 preset 做可分发的组合](./37-config-practice-patch-and-preset.md)
