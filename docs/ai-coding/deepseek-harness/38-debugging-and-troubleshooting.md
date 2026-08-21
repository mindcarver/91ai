# 排查与调试：dsh 这个全插件化 harness 怎么追问题

> `dsh` 给排查问题提供了三个抓手：`--dump-config` 看实际加载了什么、运行时不变量在 agent 跑的时候守住不变契约、会话日志让一切可重建；这三个组合起来，大部分问题不需要加 print 就能定位。
> 这一篇拆排查工具链：dump-config、invariants 子系统、request-error 恢复、会话日志的调试用法，以及开发时用的 typecheck 和 type-equiv 门禁。

## 第一步永远是一句话：dump-config

`dsh` 是全插件化的，出问题的第一个怀疑对象是"你的插件树组合和你以为的不一样"。这不需要猜，跑一句 `dsh --profile web --dump-config`，它打印实际组合后的插件树，不启动进程。你看到的每一行（id、name、config）是所有 patch 层叠完的最终结果。

排查的典型场景：

- 插件没生效。先看它在不在 dump 里。不在，说明 patch 没写对（id 拼错、insert 没被加载、patch 文件路径不对）；在但行为不对，看它的 config 是否被更高优先级的 patch 层覆盖了。
- config 值不对。dump 显示的是最终值。想追到哪一层改了它，从低到高看 patch 层：bundle patch、profile patch、home patch、`--patch` overlay。
- 插件加载顺序问题。dump 按 loader 解析顺序排列。如果 A 依赖 B 提供的 service，B 必须在 A 之前出现，或者 A 用 `inject` 声明依赖，Cordis 会等 B 就位才激活 A。

dump-config 是"没有特权核心"的排查含义：你不用猜内核藏了什么，打印出来的就是全部。

## 运行时不变量：agent 跑着的时候守住契约

dump-config 解决的是"加载时对不对"的问题。运行时的问题靠什么发现？靠运行时不变量（runtime invariants）。

`dsh-invariants`（`ctx.invariants`）是一个可配置的注册表服务。每个 workspace 包发布一个 `./invariant` companion 插件，在运行时注册检查，检查的内容是该包拥有的可观测事件或可变数据关系。

一个不变量检查发现违规时，调用 `fail(message)` 抛出 `InvariantError`：

```
invariant violated by "@deepseek-ai/dsh-session": <具体消息>
```

这个错误带稳定的 `code: 'INVARIANT'` 和归属的 `packageName`，所以违规可以归因，注册表不需要 import 任何产品包。

不变量检查有一个关键约定：**只能断言权威事件流或可变数据，不能断言 service 或方法是否存在**。service 和方法的存在属于类型系统的职责，不是运行时不变量的职责。

哪些包的检查生效，用配置控制。`enabled` 是全局开关，默认开；`package_allowlist` 和 `package_blocklist` 都是正则源，前者匹配包名（空表示全部允许），后者匹配后排除，优先级覆盖 allowlist。正则匹配是 unanchored 的，除非你自己加 `^` 和 `$`。无效的、空白的、重复的条目在服务启动时抛异常，不会被跳过。

`pnpm run verify-package-invariants` 做机械校验：拒绝生成的标记、未解释的空 installer、忽略 reporter 的非空 installer、错误的注册名、不完整的导出/发布/依赖/bundle 接线。这保证每个包要么有有意义的检查，要么有一个解释为什么不需要检查的空 installer。

排查时，如果一个不变量违规了，错误消息会告诉你哪个包违反了什么契约。这是运行时的"大声失败"，比静默错误好追得多。

## agent/request-error：模型请求失败怎么办

模型请求会失败：网络断了、超时了、返回了格式错误的响应。agent loop 怎么处理？

`dsh` 用一个 `agent/request-error` waterfall 来处理请求失败。当模型请求以 error 或 aborted 结束时，agent loop 派发这个 waterfall。一个监听器可以返回 `{ kind: 'retry' }` 让 loop 重新构建请求并重试。

这个机制的好处是重试策略不是硬编码在 agent loop 里的，而是一个可插拔的扩展点。默认的重试策略由 `dsh-llm-retry` 提供，但你可以挂自己的监听器实现自定义策略（比如指数退避、切换 provider、记录到告警系统）。

排查请求失败时，看几个东西：

- session log 里的 `request/header` 事件。它记录了请求的完整配置（provider、model、options），让你能看到实际发了什么。
- `assistant/chunk` 事件。如果有部分 chunk 然后中断，说明流中途断了；一个 chunk 都没有，说明请求从没开始或立刻失败了。
- `turn/end` 事件的 reason。如果 `kind` 是 `error`，它携带了错误消息。

## 会话日志：一切可重建

`dsh` 的会话日志是一个事件溯源的账本。原始对话从不原地修改，每个派生视图（LLM 消息历史、UI 对话、telemetry、持久化）都是从已提交日志投影出来的。

这对排查意味着：**agent 看到的、做过的一切，都能从会话日志重建**。这是一个硬规矩，运行时有不变量盯着。

排查会话问题时，session log 是你的显微镜：

- trace 数据。`turn/start`、`step/end`、`assistant/chunk`、`todo/write`、`request/header` 这些是 trace/replay 数据，不影响模型可见的内容，但对调试和持久化重要。
- `tool/result`。每个工具调用的结果都在日志里，包括 `isError` 标志。如果 agent 做了奇怪的决定，追它的工具调用历史通常能找到原因。
- `request/header`。它记录了模型请求看到的一切：系统提示、工具 schema、路由配置。如果模型行为不对，对比 request/header 和你的预期。

会话日志可以被 fork、resume、导出。一个出问题的会话，你可以 fork 一个副本，在副本上实验，不影响原始会话。

## Telemetry：把事件流导出来看

会话日志是进程内的。如果你需要把 agent 的运行状态导出到外部系统做分析，用 telemetry 子系统：`FULL` 模式下每个会话事件（经过 chunk 投影和脱敏瀑布后）实时交给后端，可以导出到 OpenTelemetry collector 再用 Grafana、Jaeger 查询。

排查时最有用的两点：severity 是预映射的（error 对应 `tool/result.isError`、`turn/end` 错误原因、`agent-error`），可以只看 error 级别快速定位失败点；`agent-error` 和 `shutdown` 是操作告警信号，一个会话没有 shutdown 标记可能是崩了。注意 telemetry 默认 DISABLED，排查时需要显式开启 FULL 模式并配置 exporter。完整的三模式语义、脱敏瀑布和去重键见 [36 篇](./36-telemetry-observability.md)。

## 开发时的排查工具链

如果你在改 `dsh` 的代码或写插件，有一套开发时的工具链帮你抓问题。

typecheck 是第一道防线。跑 `pnpm run typecheck`，它先运行完整的 Host lib 阶段（包括生成的 Typert 合约），再跑 Client TypeScript 检查；pre-push hook 自动跑这个，类型错误在 push 之前就被拦住。

type-equiv 门禁防文档漂移。文档里粘贴的源码声明用 `ts type-equiv` 围栏标记，注册在 `scripts/type-equiv.manifest.json` 里；`pnpm run verify-type-equiv` 用 TypeScript parser 从源码提取声明，断言文档里的粘贴和源码一致。改了源码但没改文档，门禁失败。这保证文档里看到的类型定义和源码 1:1 对应，排查时不会因为文档过时而走弯路。

有些检查消费构建后的 `lib/` 输出。本地检查报奇怪的错误时，先跑一遍 `pnpm run build`，确保 lib 是最新的。

`pnpm run hygiene` 检查包质量，包括 `publint`（校验包入口和构建后的 `lib/*.js` 一致）和 `verify-node-next-types`（校验构建后的声明对 NodeNext 消费者有效）。

代码里用三个标记标注已知问题，按紧急程度分级：`FIXME` 是应该阻塞新发布的问题，发布不应该带着未解决的 FIXME，除非 reviewer 明确同意；`TODO` 是应该尽快修的问题；`XXX` 是某天可能修的问题，优先级最低。排查时 grep 这些标记能帮你理解代码里的已知坑。

## 常见问题和排查路径

- agent 发了消息没反应：Settings 里检查模型配置。dump-config 看 llm provider 是否加载。看 session log 的 request/header 确认请求发出去了。如果有 turn/end reason 是 error，追错误消息。确认 API key 有效（改完即生效，不用重启）。
- 工具调用被拒绝：检查权限模式（`DSH_PERMISSION_MODE`）。看 session log 的 tool/result 里的 `isError` 和审批结果。如果是沙箱拒绝，看 sandbox policy 配置。
- 插件 HMR 后状态混乱：确认你的插件用 `ctx.effect()` 注册副作用（卸载时自动清理）。如果你手动注册了 listener 但没用 effect，HMR 卸载时不会撤销。dump-config 确认 HMR 后的插件树状态。
- 不变量违规：看 `InvariantError` 的 packageName 和 message，它告诉你哪个包的什么契约被违反了。这可能意味着你配置的组合方式不正确，或者某个 provider 实现有 bug。
- 性能差：看 session log 里的 step 序列，确认 agent 没有在无意义的循环。看 compaction 事件确认上下文管理正常。如果工具调用慢，看 tool/result 的时间戳。

## 结论

排查 dsh 的顺序可以从三个抓手推出来：先 dump-config 确认加载时的插件树，再靠运行时不变量和会话日志追运行时的事实。这个体系的前提是"没有特权核心"加"一切可重建"：问题不在你猜不到的内核里，而在打印得出来、重建得出来的日志和事件里。开发侧的 typecheck、type-equiv、hygiene 门禁把另一类问题（类型漂移、文档漂移、包质量）挡在 push 之前。

## 延伸阅读

- [Runtime Invariants 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/invariants.md)
- [Development Guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md)
- [Agent Loop and Turn Flow](https://zread.ai/deepseek-ai/deepseek-harness/8-agent-loop-and-turn-flow)
- [Session Log and Events](https://zread.ai/deepseek-ai/deepseek-harness/9-session-log-and-events)
- [Defensive Patterns](https://zread.ai/deepseek-ai/deepseek-harness/20-defensive-patterns)

上一篇：[配置实战：dsh 用 patch 改行为，用 preset 做分发组合](./37-config-practice-patch-and-preset.md)
下一篇：[给 dsh 写一个 Conversation Node：Web 自定义渲染](./39-write-a-conversation-node.md)
