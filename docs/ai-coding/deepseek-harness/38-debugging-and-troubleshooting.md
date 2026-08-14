# 排查与调试实战：一个全插件化 harness 怎么追问题

> 如果你只能从这篇带走一句话，带走这句：`dsh` 给排查问题提供了三个抓手：`--dump-config` 看实际加载了什么、运行时不变量在 agent 跑的时候守住不变契约、会话日志让一切可重建；这三个组合起来，大部分问题不需要加 print 就能定位。
> 这一篇拆排查工具链：dump-config、invariants 子系统、request-error 恢复、会话日志的调试用法，以及开发时用的 typecheck 和 type-equiv 门禁。

## 第一步永远是一句话：dump-config

`dsh` 是全插件化的，出问题的第一个怀疑对象是"你的插件树组合和你以为的不一样"。这不需要猜，跑一句：

```sh
dsh --profile web --dump-config
```

它打印实际组合后的插件树，不启动进程。你看到的每一行（id、name、config）是所有 patch 层叠完的最终结果。

排查的典型场景：

- **插件没生效。** 它在 dump 里吗？如果不在，说明你的 patch 没写对（id 拼错、insert 没被加载、patch 文件路径不对）。如果在但行为不对，看它的 config 是否被更高优先级的 patch 层覆盖了。
- **config 值不对。** dump 显示的是最终值。如果你想追到哪一层改了它，从低到高看 patch 层（bundle patch 到 profile patch 到 home patch 到 `--patch` overlay）。
- **插件加载顺序问题。** dump 按 loader 解析顺序排列。如果 A 依赖 B 提供的 service，B 必须在 A 之前出现（或者 A 用 `inject` 声明依赖，Cordis 会等 B 就位才激活 A）。

dump-config 是"没有特权核心"的排查含义：你不用猜内核藏了什么，打印出来的就是全部。

## 运行时不变量：agent 跑着的时候守住契约

dump-config 解决的是"加载时对不对"的问题。运行时的问题靠什么发现？靠运行时不变量（runtime invariants）。

`dsh-invariants`（`ctx.invariants`）是一个可配置的注册表服务。每个 workspace 包发布一个 `./invariant` companion 插件，在运行时注册检查。检查的内容是该包拥有的可观测事件或可变数据关系。

一个不变量检查发现违规时，调用 `fail(message)` 抛出 `InvariantError`：

```
invariant violated by "@deepseek-ai/dsh-session": <具体消息>
```

这个错误带稳定的 `code: 'INVARIANT'` 和归属的 `packageName`，所以违规是可以归因的，不需要注册表 import 任何产品包。

不变量检查的一个关键约定：**只能断言权威事件流或可变数据，不能断言 service 或方法是否存在。** 这是因为 service 和方法的存在属于类型系统的职责，不是运行时不变量的职责。

选择哪些包的检查生效，用配置控制：

```typescript
interface Config {
  enabled?: boolean              // 全局开关，默认 true
  package_allowlist?: string[]   // 正则源，匹配包名；空表示全部允许
  package_blocklist?: string[]   // 正则源，匹配后排除，覆盖 allowlist
}
```

正则匹配是 unanchored 的（除非你自己加 `^` 和 `$`）。无效的、空白的、重复的条目在服务启动时抛异常，不会被跳过。

`pnpm run verify-package-invariants` 做机械校验：拒绝生成的标记、未解释的空 installer、忽略 reporter 的非空 installer、错误的注册名、不完整的导出/发布/依赖/bundle 接线。这保证了每个包要么有有意义的检查，要么有一个解释为什么不需要检查的空 installer。

排查时，如果一个不变量违规了，错误消息会告诉你哪个包违反了什么契约。这是运行时的"大声失败"，比静默错误好追得多。

## agent/request-error：模型请求失败怎么办

模型请求会失败：网络断了、超时了、返回了格式错误的响应。agent loop 怎么处理？

`dsh` 用一个 `agent/request-error` waterfall 来处理请求失败。当模型请求以 error 或 aborted 结束时，agent loop 派发这个 waterfall。一个监听器可以返回 `{ kind: 'retry' }` 让 loop 重新构建请求并重试。

这个机制的好处是：**重试策略不是硬编码在 agent loop 里的，而是一个可插拔的扩展点。** 默认的重试策略由 `dsh-llm-retry` 提供，但你可以挂自己的监听器实现自定义策略（比如指数退避、切换 provider、记录到告警系统）。

排查请求失败时，看几个东西：

- **session log 里的 request/header 事件。** 它记录了请求的完整配置（provider、model、options），让你能看到实际发了什么。
- **assistant/chunk 事件。** 如果有部分 chunk 然后中断，说明流中途断了。如果一个 chunk 都没有，说明请求从没开始或立刻失败了。
- **turn/end 事件的 reason。** 如果 `kind` 是 `error`，它携带了错误消息。

## 会话日志：一切可重建

`dsh` 的会话日志是一个事件溯源的账本。原始对话从不原地修改，每个派生视图（LLM 消息历史、UI 对话、telemetry、持久化）都是从已提交日志投影出来的。

这对排查意味着什么？**agent 看到的、做过的一切，都能从会话日志重建。** 这是一个硬规矩，运行时有不变量盯着。

排查会话问题时，session log 是你的显微镜：

- **trace 数据。** `turn/start`、`step/end`、`assistant/chunk`、`todo/write`、`request/header` 这些是 trace/replay 数据。它们不影响模型可见的内容，但对调试和持久化重要。
- **tool/result。** 每个工具调用的结果都在日志里，包括 `isError` 标志。如果 agent 做了奇怪的决定，追它的工具调用历史通常能找到原因。
- **request/header。** 它记录了模型请求看到的一切：系统提示、工具 schema、路由配置。如果模型行为不对，对比 request/header 和你的预期。

会话日志可以被 fork、resume、导出。一个出问题的会话，你可以 fork 一个副本，在副本上实验，不影响原始会话。

## Telemetry：把事件流导出来看

会话日志是进程内的。如果你需要把 agent 的运行状态导出到外部系统做分析，用 telemetry 子系统。

`FULL` 模式下，每个会话事件（经过 chunk 投影和脱敏瀑布后）实时交给后端。你可以把它们导出到一个 OpenTelemetry collector，然后用 Grafana、Jaeger 或任何 OTel 兼容的工具查询。

排查时 telemetry 的用处：

- **severity 过滤。** telemetry 记录的 severity 是预映射的：error 给 `tool/result.isError`、`turn/end` 错误原因、`agent-error`。你可以只看 error 级别的事件，快速定位失败点。
- **ops 通道。** `agent-error` 和 `shutdown` 是操作信号，用于告警。如果一个会话没有 shutdown 标记，可能是崩溃了。
- **去重。** 记录可能重复（cursor-less re-adoption、SDK 重试），在 `(session.id, event.seq)` 上去重。

注意：telemetry 默认是 DISABLED 的。排查时需要显式开启 FULL 模式并配置 exporter。

## 开发时的排查工具链

如果你在改 `dsh` 的代码或写插件，有一套开发时的工具链帮你抓问题。

**typecheck 是第一道防线。**

```sh
pnpm run typecheck
```

它运行完整的 Host lib 阶段（包括生成的 Typert 合约），然后跑 Client TypeScript 检查。pre-push hook 自动跑这个。类型错误在 push 之前就被拦住。

**type-equiv 门禁防文档漂移。**

文档里粘贴的源码声明用 `ts type-equiv` 围栏标记，注册在 `scripts/type-equiv.manifest.json` 里。`pnpm run verify-type-equiv` 用 TypeScript parser 从源码提取声明，断言文档里的粘贴和源码一致。改了源码但没改文档？门禁失败。

这保证了文档里看到的类型定义和源码是 1:1 对应的，排查时不会因为文档过时而走弯路。

**build 消费 lib 输出。**

有些检查消费构建后的 `lib/` 输出。如果本地检查报奇怪的错误，先跑一遍 `pnpm run build`，确保 lib 是最新的。

**hygiene 检查包质量。**

```sh
pnpm run hygiene
```

包括 `publint`（校验包入口和构建后的 `lib/*.js` 一致）和 `verify-node-next-types`（校验构建后的声明对 NodeNext 消费者有效）。

**TODO 标记分级。**

代码里用三个标记标注已知问题：
- `FIXME`：应该阻塞新发布的问题。发布不应该带着未解决的 FIXME，除非 reviewer 明确同意。
- `TODO`：应该尽快修的问题。
- `XXX`：某天可能修的问题，优先级最低。

排查时 grep 这些标记能帮你理解代码里的已知坑。

## 常见问题和排查路径

**问题：agent 发了消息没反应。**
路径：Settings 里检查模型配置。dump-config 看 llm provider 是否加载。看 session log 的 request/header 确认请求发出去了。如果有 turn/end reason 是 error，追错误消息。确认 API key 有效（改完即生效，不用重启）。

**问题：工具调用被拒绝。**
路径：检查权限模式（`DSH_PERMISSION_MODE`）。看 session log 的 tool/result 里的 `isError` 和审批结果。如果是沙箱拒绝，看 sandbox policy 配置。

**问题：插件 HMR 后状态混乱。**
路径：确认你的插件用 `ctx.effect()` 注册副作用（卸载时自动清理）。如果你手动注册了 listener 但没用 effect，HMR 卸载时不会撤销。dump-config 确认 HMR 后的插件树状态。

**问题：不变量违规。**
路径：看 `InvariantError` 的 packageName 和 message。它告诉你哪个包的什么契约被违反了。这可能意味着你配置的组合方式不正确，或者某个 provider 实现有 bug。

**问题：性能差。**
路径：看 session log 里的 step 序列，确认 agent 没有在无意义的循环。看 compaction 事件确认上下文管理正常。如果工具调用慢，看 tool/result 的时间戳。

## 时点与诚实声明

本文基于 2026-08-14 的 `deepseek-ai/deepseek-harness` `master` 分支，主要参考 `docs/subsystems/invariants.md`、`docs/development.md`，以及架构文档的 Agent Loop、Session Log 和 Architecture Overview 部分。

文中对排查路径的建议是实践总结，不是官方文档的原文。具体的命令名（`pnpm run typecheck`、`pnpm run verify-type-equiv` 等）、门禁名称和行为以仓库 `package.json` 和 `scripts/` 实际版本为准。

## 延伸阅读

- [Runtime Invariants 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/invariants.md)
- [Development Guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md)
- [Agent Loop and Turn Flow](https://zread.ai/deepseek-ai/deepseek-harness/8-agent-loop-and-turn-flow)
- [Session Log and Events](https://zread.ai/deepseek-ai/deepseek-harness/9-session-log-and-events)
- [Defensive Patterns](https://zread.ai/deepseek-ai/deepseek-harness/20-defensive-patterns)

上一篇：[配置实战：用 patch 改行为，用 preset 做可分发的组合](./37-config-practice-patch-and-preset.md)
下一篇：[写一个 Conversation Node：在 Web 客户端做自定义渲染](./39-write-a-conversation-node.md)
