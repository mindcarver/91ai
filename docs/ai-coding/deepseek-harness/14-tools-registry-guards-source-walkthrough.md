# dsh tools 注册表与守卫管线源码导读

> `dsh-tools` 的 `ToolRuntime` 用六个事件（三道 waterfall 加一个 code-dispatch-log waterfall 加两个 emit）定义了上一段的工具执行管线，并暴露一个调度器符号，让 agent-loop 的并行调度器能重叠派发同时保持前后策略有序。
> 这一篇是源码导读，把上一篇讲的七层管线落到 `packages/core/tools/src/index.ts` 的真实代码。它还会对上更早讲的 agent-loop 那篇：agent-loop 的 `tool-calls.ts` 正是通过一个调度器符号调进这里的。

## ToolRuntime：注入 systemPrompt 的服务

先定位这个服务。`ToolRuntime` 是一个继承 `Service` 的 Cordis Service，服务 key 是 `tools`。类上两个静态声明：`static inject = ['systemPrompt']` 声明注入一个依赖；`static Config` 用 zod 的 `z.object` 定义配置。

它注入 `systemPrompt`，因为注册表要自动把工具 schema 喂进系统提示组装。构造时挂上 `ctx.systemPrompt.tools(context => this.wireSchemas(context.scope))`，可见工具的 schema 就自动流进了每个 agent 的提示组装。这也是为什么"注册一个工具，它的 schema 自动进提示"，靠的就是这个挂载。

配置只有两项：`mode` 是 `z.union(['native', 'code', 'both'] as const)` 加默认值 `'native'`，决定模型面向的呈现方式（native/code/both）；`maxParallelSubCalls` 是 `z.natural().min(1).default(10)`，Code Mode 子调用并发上限，最小 1，默认 10。

## 六个事件：四个 waterfall 加两个 emit

这个包声明的事件，就是上一篇管线的扩展点。事件全部声明在 `declare module '@deepseek-ai/cordis'` 的 `interface Events` 里，每个事件的注释都用 `@mode` 标签写明了派发模式：

- `tools/pre-execute`，`@mode waterfall`，注释是"派发前 allow、deny 或 ask"。参数 `exec: ToolExecution` 加 `next`，返回 `Promise<PreToolDecision>`。
- `tools/execute`，`@mode waterfall`，注释是"around 派发层，给超时、重试或指标用"。参数 `exec: ToolDispatchExecution` 加 `next`，返回 `Promise<ToolExecutionResult>`。
- `tools/post-execute`，`@mode waterfall`，注释是"接受、替换、丰富或拦截一个归一化后的派发结果"。参数 `exec: ToolExecution`、`result: Readonly<ToolExecutionResult>` 加 `next`，返回 `Promise<PostToolDecision>`。
- `tools/code-dispatch-log`，`@mode waterfall`，注释是"替换一次 run_code 子派发那份持久日志副本里的内容"。参数 `dispatch: CodeDispatchLog` 加 `next`，返回 `Promise<ContentBlock[]>`。
- `tools/result`，`@mode emit`，注释是"观察冻结的、无损 JSON 的最终结果"。参数 `exec: Readonly<ToolExecution>`、`result: Readonly<ToolExecutionResult>`，没有 `next`，返回 `undefined`。
- `tools/change`，`@mode emit`，注释是"一个工具被注册或注销，或作用域限制变化"。无参数，返回 `void`。

这六个事件正好对应管线的关卡：`pre-execute`、`execute`、`post-execute` 三道 waterfall 是上一篇讲的前三道可改写关卡；`code-dispatch-log` 是 Code Mode 专用的日志副本内容替换 waterfall（spill 策略用它把超大子调用结果换成预览加定位符）；`result` 是只观察的 emit（观察冻结的最终结果）；`change` 是注册表变化通知。

注意它们都是 `Scoped<ToolRuntime>`，即 scope 过滤的：agent 作用域的监听器只收到那个 agent 的调用。这是 agent scope 机制在工具管线里的体现。`tools/result` 和 `tool/result` 不是一回事：前者是这里 live 的 emit 通知，后者是 agent-loop 事后追加的持久会话事件。

## 调度器符号：agent-loop 怎么调进来

这是连接更早那篇 agent-loop 源码导读的关键。`ToolRuntime` 暴露一个用 Symbol 做 key 的内部调度器视图。符号声明是 `export const TOOL_RUNTIME_SCHEDULER: unique symbol = Symbol('@deepseek-ai/dsh-tools.scheduler')`。它对应的 `ToolRuntimeScheduler` 接口有四个方法：`prepare(exec: ToolExecutionInput)` 返回 `Promise<ScheduledToolPreparation>`；`dispatch(exec: ToolRunContext)` 返回 `Promise<ScheduledToolDispatch>`；`finalize(exec: ToolRunContext, result: ToolExecutionResult)` 返回 `Promise<ToolExecutionResult>`；`finish(exec: ToolRunContext, result: ToolExecutionResult)` 同步返回 `ToolExecutionResult`。`ToolRuntime` 上有一个 `readonly [TOOL_RUNTIME_SCHEDULER]: ToolRuntimeScheduler` 属性实现这个接口，四个方法分别转发给内部的 `prepareScheduledExecution`、`dispatchScheduledExecution`、`finalizeScheduledExecution`、`finishScheduledExecution`。

这个符号接口是给谁用的？给 agent-loop 的并行调度器。回看 agent-loop 那篇的 `tool-calls.ts`，它调度一个 step 的工具调用时，调的就是 `ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare / dispatch / finalize / finish`。

为什么要拆成四个阶段？因为 agent-loop 的并行调度器要**重叠派发，但保持前后策略有序**。`prepare` 跑有序的 pre-execute 加守卫门（决定这次调用能不能进派发），`dispatch` 只跑 around 派发加 body（可以和兄弟调用并发），`finalize` 跑 post-execute 加内容终检（按模型顺序提交结果）。这样多个调用的 `dispatch` 能并发跑，但每个调用的策略门和结果提交还是有序的。

`prepare` 的返回类型分三种：`dispatch`（进派发）、`post-result`（已有结果但要过 post-execute）、`final-result`（结果已定型跳过 post-execute）。这让一个被守卫直接拒绝、或被 pre-execute 给出既定结果的调用，不必再走完整 body。

## 决策类型：PreToolDecision 与 PostToolDecision

两道策略 waterfall 的决策，用两个判别联合表达。`PreToolDecision` 有三个 `kind`：`'allow'` 不带别的字段；`'deny'` 带必填的 `reason: string`；`'ask'` 带可选的 `reason?: string`。`PostToolDecision` 的 `kind` 取值三种、形态四个：两种 `'accept'` 互斥，一种带可选 `content?: ContentBlock[]` 且 `value` 为 `never`，另一种带必填 `value: JsonValue` 且 `content` 为 `never`，两者都带可选 `additionalContexts?: UserMessage[]`；`'block'` 带必填 `feedback: ContentBlock[]` 加可选 `additionalContexts?: UserMessage[]`。

`PreToolDecision` 有一个刻意的设计：**没有输入改写**。注释原话："Input rewriting is excluded because arguments are already logged and presented."（输入改写被排除，因为参数已经记日志、已经展示了）。如果允许 pre-execute 改写参数，记进日志的参数和实际跑的参数就会脱节，展示给用户看的也会对不上。所以 pre-execute 只能 allow/deny/ask，不能改 args。

`PostToolDecision` 的 accept 有两种互斥形态：要么替换 content（保留 canonical value），要么替换 value（重新校验、重新渲染 content/metadata）。block 把纠正性反馈变成一个无 value 的失败结果。两种都能带 `additionalContexts`，这些上下文排进 loop 的 post-result FIFO，在工具结果之后作为 user/message 带给模型。

`ask` 由 `ctx.approval` 接缝服务（可选注入，`ctx.get('approval')`），挂上时走 `approval/request`，没挂时降级成 deny。这呼应上一篇的 fail closed。

## 单调守卫：deny-only 的设计

守卫是这个包最硬的安全机制。类型就一行：`ToolGuard` 是 `(execution: Readonly<ToolExecution>) => string | undefined` 的函数类型，接收只读的执行描述，返回一个字符串或 `undefined`。

注释里那句关键："Because guards have no allow result, listener ordering cannot turn a denial back into permission."（因为守卫没有 allow 结果，监听器顺序不能把一次拒绝翻回成允许）。

守卫只返回两样东西：一个拒绝理由（string），或者 `undefined`（不表态）。它**没有"放行"这个动作**。这是上一篇讲的"单调守卫只拒不放"在代码里的实现：一个守卫能拒，但没有任何守卫或监听器能"放行"一个被拒的调用，因为放行这个动作在类型上不存在。

守卫在 `ToolLayer.guardReason` 里被串起来。`guardReason(exec: ToolExecution)` 返回 `string | undefined`，实现是一个循环：遍历 `this.guards.values()`，逐个调 `guard(exec)`，遇到不是 `undefined` 的理由立刻返回它，全部守卫都不表态才返回 `undefined`。

第一个返回理由的守卫就拒，后面不再跑。`ctx.tools.guard(guard)` 把守卫注册进当前作用域（plain context 全局，agent.ctx 只对该 agent）。守卫在 pre-execute waterfall 之后、派发之前求值，身份受保护（identity protected），保证它代表的 owner 不可妥协策略不会被冒名绕过。

## 结果类型：成功带 value，失败不带

工具执行的结果是一个判别联合，成功和失败严格分开，两个 interface 的字段全部 `readonly`。`ToolExecutionSuccess`：`isError: false`；`value: JsonValue`，执行局部的 canonical 值；`content: ContentBlock[]`；`error?: never`，成功形态上不存在；`meta?: JsonValue`；`additionalContexts?: UserMessage[]`；`concludesTurn?: true`，agent loop 在提交这批成功结果后停下。`ToolExecutionFailure`：`isError: true`；`error: ToolFailure`；`value?: never`，失败永远不带成功的 value；`content: ContentBlock[]`，失败也有要展示的内容。

几个要点。第一，成功的 `value` 是执行局部的 canonical JSON 值，注释明确说它"刻意不进持久事件"（deliberately omitted from durable events）。落进会话日志的是渲染后的 `content` 和可选的 `meta`，不是原始 value。这和会话日志那套"投影干净、原始保真"的双层设计一致。

第二，`concludesTurn` 只在成功结果上存在，一个组合工具（比如 Code Mode）会把嵌套调用的 concludesTurn 转发到外层结果，只有权威的嵌套成功才能结束外层 run。

第三，规范的错误码是常量：`TOOL_ABORTED` 的值是 `'ABORTED'`，表示 body 已调用之后取消；`TOOL_ABORTED_BEFORE_DISPATCH` 的值是 `'ABORTED_BEFORE_DISPATCH'`，表示 body 调用之前取消。

加上 `ToolNotFoundError`（code `UNKNOWN_TOOL`）和 `ToolOutputError`（code `INVALID_TOOL_OUTPUT`）。这些结构化错误码让重试、沙箱、回放代码能区分"工具自己抛的错"和"未知工具""输出非法"等情况。

## 归一化与 finalizeContent：snapshotJsonValue 复用

上一篇讲"归一化把抛错变成 isError"。在代码里，它靠的是从 `@deepseek-ai/dsh-session` 包导入、复用过来的 `snapshotJsonValue`。包装函数 `snapshotToolValue(toolName: string, candidate: unknown)` 返回 `JsonValue`：try 段先调 `snapshotJsonValue(candidate)` 得到 detach 后的 `detached`，它要是 `undefined` 就抛 `new ToolOutputError(toolName, ['value is not lossless JSON'])`，否则把 `detached` 断言成 `JsonValue` 返回；catch 段把捕获到的任何 error 归一化成 `INVALID_TOOL_OUTPUT` 失败。

工具 body 返回的值，用 session 包那个一次遍历校验兼快照的函数，做无损 JSON 校验和 detach。非无损 JSON 的返回值在这里就变成结构化的 `INVALID_TOOL_OUTPUT` 失败。这是"日志是唯一真相源、一切持久数据必须无损 JSON"在工具层的延伸：工具返回的值要能进日志，就必须过无损 JSON 校验，session 包的 `snapshotJsonValue` 是同一把尺子。

`finalizeContent` 是工具定义自己的最后一道内容终检。源码里它在调用开始时被快照（`contentFinalizers` WeakMap），对每个归一化后的结果（包括绕过 post-execute 的失败）正好跑一次，只能替换 content，必须同步且 total（不能抛）。这保证不管管线哪一层出了什么结果，工具定义对自己的"模型面向内容"有最后一次同步把关。

## 注册：强制 output 声明与保留名

`register` 方法的校验体现了工具定义的硬契约。它接收 `definition: ToolDefinition`，返回一个 `() => void` 的 disposer。执行顺序：先取 `name = definition.name`，再取 `output`；`output` 是 `undefined`、不是对象、`output.render` 不是函数，或者 `output.presentationMeta` 有值但不是函数，任何一条命中就抛 `TypeError`，消息是 `tool "<name>" must declare output { schema, render, presentationMeta? }`。接着 `assertSupportedJsonSchema(output.schema)` 校验 schema，再对 `timeoutMs` 做正有限数校验。名字等于 `RUN_CODE_NAME` 就抛 `Error`，消息指明这个名字保留。全部通过后执行 `this.layers.effect(this.ctx, layer => layer.tools.insert(name, definition), { label: 'tools.register()' })`，把定义插进当前层并返回 disposer。

三条硬规矩：第一，**每个工具必须声明 canonical output**（`{ schema, render, presentationMeta? }`）。这是上一段"工具返回 canonical JSON 值"契约的入口：没有 output 声明，注册就拒绝。第二，`timeoutMs` 如果有，必须是正有限数（它是策略元数据，不进模型 schema）。第三，`run_code` 这个名字无条件保留，不能注册、不能遮蔽、不能限制，因为任何 agent 都可能选 Code Mode。

注册按调用 context 的 scope 落层：plain context 注册全局，`agent.ctx` 只对该 agent（遮蔽同名全局工具）。返回的 disposer 随调用 fiber 销毁。

## Code Mode：run_code 传输与 SDK 段

Code Mode 是这个包的一大块，源码里它的实现跨 `index.ts` 和 `code-mode.ts`。几个关键点：

**run_code 是保留传输，不进可过滤的注册层。** `requireCodeTransport()` 懒构造它，可见性解析器在解析完可过滤的全局/作用域层之后，只为实际呈现 code 的作用域追加它。这保证 per-agent 限制不能移除它、作用域注册不能遮蔽它。

**`code` 模式下 run_code 是唯一可直接调用的入口。** 一个没有 parent token 的模型直接调用，命名任何其他工具，在执行创建时（pre-execute 之前）就解析成 `UNKNOWN_TOOL`。拒绝消息会指明出路，告诉模型只有 `run_code` 能直接调、其他工具要从 `run_code` 程序内部调用，因为同一个提示声明了那个工具，一句干巴巴的 unknown tool 会让模型以为部署坏了。

**SDK 段（`tools:sdk`）按运行时语言生成。** 源码里有一张渲染器表 `SDK_RENDERERS`，类型是 `Record<string, (schemas: ToolSdkSchema[]) => string>`，目前两项：`typescript` 键对应 `renderToolsSdk`，`python` 键对应 `renderToolsSdkPy`，末尾用 `satisfies Record<CodeSdkLanguage, (schemas: ToolSdkSchema[]) => string>` 把键集收紧到 `CodeSdkLanguage`。

按 `ctx.codeRuntime.language` 选渲染器，没有渲染器的语言让提示组装失败。SDK 段是确定性的：字典序工具排列，工具集不变则文本字节相同（prefix-cache 友好）。

**子调用走完整管线。** `run_code` 的 dispatch bridge 把每个绑定调用按提交顺序、用原生并发契约调度（连续并发安全调用重叠到 `maxParallelSubCalls`，排他调用排空池单独跑），每个带着外层执行的 `parent` token，过完整的 pre-execute → 守卫 → execute → post-execute → result 管线。这就是上一篇说的"Code Mode 把子调用也送进同一条管线"的代码实现。子调用的 `additionalContexts` 通过外层 `ToolRunContext.deferContext` 延迟，只在父 `run_code` 结果之后追加，保持调用/结果相邻。

## 把管线和调度对上

读完这篇，回头看前面两篇，三个视角其实是同一套机制：

- **第 13 篇**讲的是管线的**概念**：七层关卡、策略与机制分离。
- **这一篇**讲的是管线的**声明**：`ToolRuntime` 用六个事件、一个调度器符号、一组决策类型把那七层落成代码。
- **第 8 篇**讲的是管线的**调度**：agent-loop 的 `tool-calls.ts` 通过 `TOOL_RUNTIME_SCHEDULER` 这个符号，把并发调度（重叠 dispatch）和有序策略（有序 prepare/finalize）拼起来。

调度器符号是连接后两篇的桥：`prepare` 跑 pre-execute 加守卫（有序），`dispatch` 跑 around 派发加 body（可并发），`finalize/finish` 跑 post-execute 加内容终检（按模型顺序提交）。agent-loop 的并行调度器之所以能让多个工具并发跑、又保证策略有序，靠的就是这个分阶段符号接口把"可重叠的"和"必须有序的"分开。

## 结论

`dsh-tools` 的 `ToolRuntime` 用六个事件定义了工具执行管线：pre-execute、execute、post-execute 三道 waterfall 是可改写关卡，code-dispatch-log 是 Code Mode 日志副本替换 waterfall，result 和 change 是 emit 通知。它暴露一个 `TOOL_RUNTIME_SCHEDULER` 符号接口（prepare/dispatch/finalize/finish），让 agent-loop 的并行调度器能重叠派发同时保持前后策略有序，这是连接 agent-loop 那篇的桥。决策类型刻意不做输入改写（参数已记日志），单调守卫只有 deny、类型上不存在 allow 所以无法被翻回。结果成功带 execution-local 的 value（不进持久事件）、失败不带 value，用从 session 包复用的 snapshotJsonValue 做归一化。注册强制 canonical output 声明、保留 run_code 名、按 scope 落层。Code Mode 的 run_code 是不进可过滤层的保留传输，子调用带 parent token 走完整管线、additionalContexts 延迟以保持调用/结果相邻。这套代码把上一篇的管线概念落成了有类型、有 scope、有调度器接口的真实实现。

## 延伸阅读

- [tools 包源码（src/index.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/src/index.ts)：ToolRuntime 服务、事件声明、调度器符号
- [tools 包 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/README.md)：API 契约与 Code Mode 细节
- [tools 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md)：生成式 cordis-surface 与事件签名
- [工具执行管线图](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-execution-pipeline.md)：管线的可视化
- [工具目录（docs/tool-catalog.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md)：内置工具的 schema 清单
- [agent-loop 的 tool-calls.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/tool-calls.ts)：通过调度器符号调进本包的并行调度器

上一篇：[工具执行管线：dsh 从 tool_call 到结果的七道关卡](./13-tool-execution-pipeline.md)
下一篇：[系统提示组装与动态 Cordis：dsh 让 agent 改自己的插件树](./15-system-prompt-assembly-and-dynamic-cordis.md)
