# tools 注册表与守卫管线源码导读

> 如果这一篇你只能带走一句话，带走这句：`dsh-tools` 的 `ToolRuntime` 用五个事件（三道 waterfall 加一个 code-dispatch-log waterfall 加两个 emit）定义了上一段的工具执行管线，并暴露一个调度器符号，让 agent-loop 的并行调度器能重叠派发同时保持前后策略有序。
> 这一篇是源码导读，把上一篇讲的七层管线落到 `packages/core/tools/src/index.ts` 的真实代码。它还会对上更早讲的 agent-loop 那篇：agent-loop 的 `tool-calls.ts` 正是通过一个调度器符号调进这里的。

## ToolRuntime：注入 systemPrompt 的服务

先定位这个服务。`ToolRuntime` 是一个 Cordis Service，服务 key 是 `tools`，注入一个依赖：

```ts
export class ToolRuntime extends Service {
  static inject = ['systemPrompt']
  static Config = z.object({
    mode: z.union(['native', 'code', 'both'] as const).default('native'),
    maxParallelSubCalls: z.natural().min(1).default(10),
  })
  // ...
}
```

它注入 `systemPrompt`，因为注册表要自动把工具 schema 喂进系统提示组装。构造时挂上 `ctx.systemPrompt.tools(context => this.wireSchemas(context.scope))`，可见工具的 schema 就自动流进了每个 agent 的提示组装。这也是为什么"注册一个工具，它的 schema 自动进提示"，靠的就是这个挂载。

配置只有两项：`mode`（模型面向的呈现方式：native/code/both）和 `maxParallelSubCalls`（Code Mode 子调用并发上限，默认 10）。

## 五个事件：四个 waterfall 加两个 emit

这个包声明的事件，就是上一篇管线的扩展点。源码里每个事件都用 `@mode` 标签写明了派发模式：

```ts
declare module '@deepseek-ai/cordis' {
  interface Events {
    /** Allow, deny, or ask before dispatch. ... @mode waterfall */
    'tools/pre-execute'(this: Scoped<ToolRuntime>, exec: ToolExecution, next: () => Promise<PreToolDecision>): Promise<PreToolDecision>
    /** Around-dispatch waterfall for timeout, retry, or metrics. ... @mode waterfall */
    'tools/execute'(this: Scoped<ToolRuntime>, exec: ToolDispatchExecution, next: () => Promise<ToolExecutionResult>): Promise<ToolExecutionResult>
    /** Accept, replace, enrich, or block a normalized dispatch result. ... @mode waterfall */
    'tools/post-execute'(this: Scoped<ToolRuntime>, exec: ToolExecution, result: Readonly<ToolExecutionResult>, next: () => Promise<PostToolDecision>): Promise<PostToolDecision>
    /** Replace content in the DURABLE LOG COPY of one run_code sub-dispatch. ... @mode waterfall */
    'tools/code-dispatch-log'(this: Scoped<ToolRuntime>, dispatch: CodeDispatchLog, next: () => Promise<ContentBlock[]>): Promise<ContentBlock[]>
    /** Observe the frozen, lossless-JSON final outcome. ... @mode emit */
    'tools/result'(this: Scoped<ToolRuntime>, exec: Readonly<ToolExecution>, result: Readonly<ToolExecutionResult>): undefined
    /** A tool was registered or unregistered, or a scoped restriction changed. ... @mode emit */
    'tools/change'(): void
  }
}
```

这五个事件正好对应管线的关卡：`pre-execute`、`execute`、`post-execute` 三道 waterfall 是上一篇讲的前三道可改写关卡；`code-dispatch-log` 是 Code Mode 专用的日志副本内容替换 waterfall（spill 策略用它把超大子调用结果换成预览加定位符）；`result` 是只观察的 emit（观察冻结的最终结果）；`change` 是注册表变化通知。

注意它们都是 `Scoped<ToolRuntime>`，即 scope 过滤的：agent 作用域的监听器只收到那个 agent 的调用。这是 agent scope 机制在工具管线里的体现。`tools/result` 和 `tool/result` 不是一回事：前者是这里 live 的 emit 通知，后者是 agent-loop 事后追加的持久会话事件。

## 调度器符号：agent-loop 怎么调进来

这是连接更早那篇 agent-loop 源码导读的关键。`ToolRuntime` 暴露一个用 Symbol 做 key 的内部调度器视图：

```ts
export const TOOL_RUNTIME_SCHEDULER: unique symbol = Symbol('@deepseek-ai/dsh-tools.scheduler')

export interface ToolRuntimeScheduler {
  prepare(exec: ToolExecutionInput): Promise<ScheduledToolPreparation>
  dispatch(exec: ToolRunContext): Promise<ScheduledToolDispatch>
  finalize(exec: ToolRunContext, result: ToolExecutionResult): Promise<ToolExecutionResult>
  finish(exec: ToolRunContext, result: ToolExecutionResult): ToolExecutionResult
}

// 在 ToolRuntime 里：
readonly [TOOL_RUNTIME_SCHEDULER]: ToolRuntimeScheduler = {
  prepare: exec => this.prepareScheduledExecution(exec),
  dispatch: exec => this.dispatchScheduledExecution(exec),
  finalize: (exec, result) => this.finalizeScheduledExecution(exec, result),
  finish: (exec, result) => this.finishScheduledExecution(exec, result),
}
```

这个符号接口是给谁用的？给 agent-loop 的并行调度器。回看 agent-loop 那篇的 `tool-calls.ts`，它调度一个 step 的工具调用时，调的就是 `ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare / dispatch / finalize / finish`。

为什么要拆成四个阶段？因为 agent-loop 的并行调度器要**重叠派发，但保持前后策略有序**。`prepare` 跑有序的 pre-execute 加守卫门（决定这次调用能不能进派发），`dispatch` 只跑 around 派发加 body（可以和兄弟调用并发），`finalize` 跑 post-execute 加内容终检（按模型顺序提交结果）。这样多个调用的 `dispatch` 能并发跑，但每个调用的策略门和结果提交还是有序的。

`prepare` 的返回类型分三种：`dispatch`（进派发）、`post-result`（已有结果但要过 post-execute）、`final-result`（结果已定型跳过 post-execute）。这让一个被守卫直接拒绝、或被 pre-execute 给出既定结果的调用，不必再走完整 body。

## 决策类型：PreToolDecision 与 PostToolDecision

两道策略 waterfall 的决策，用两个判别联合表达：

```ts
export type PreToolDecision =
  | { kind: 'allow' }
  | { kind: 'deny'; reason: string }
  | { kind: 'ask'; reason?: string }

export type PostToolDecision =
  | { kind: 'accept'; content?: ContentBlock[]; value?: never; additionalContexts?: UserMessage[] }
  | { kind: 'accept'; value: JsonValue; content?: never; additionalContexts?: UserMessage[] }
  | { kind: 'block'; feedback: ContentBlock[]; additionalContexts?: UserMessage[] }
```

`PreToolDecision` 有一个刻意的设计：**没有输入改写**。注释原话："Input rewriting is excluded because arguments are already logged and presented."（输入改写被排除，因为参数已经记日志、已经展示了）。如果允许 pre-execute 改写参数，记进日志的参数和实际跑的参数就会脱节，展示给用户看的也会对不上。所以 pre-execute 只能 allow/deny/ask，不能改 args。

`PostToolDecision` 的 accept 有两种互斥形态：要么替换 content（保留 canonical value），要么替换 value（重新校验、重新渲染 content/metadata）。block 把纠正性反馈变成一个无 value 的失败结果。两种都能带 `additionalContexts`，这些上下文排进 loop 的 post-result FIFO，在工具结果之后作为 user/message 带给模型。

`ask` 由 `ctx.approval` 接缝服务（可选注入，`ctx.get('approval')`），挂上时走 `approval/request`，没挂时降级成 deny。这呼应上一篇的 fail closed。

## 单调守卫：deny-only 的设计

守卫是这个包最硬的安全机制。它的类型和语义都写得很明确：

```ts
export type ToolGuard = (execution: Readonly<ToolExecution>) => string | undefined
```

注释里那句关键："Because guards have no allow result, listener ordering cannot turn a denial back into permission."（因为守卫没有 allow 结果，监听器顺序不能把一次拒绝翻回成允许）。

守卫只返回两样东西：一个拒绝理由（string），或者 `undefined`（不表态）。它**没有"放行"这个动作**。这是上一篇讲的"单调守卫只拒不放"在代码里的实现：一个守卫能拒，但没有任何守卫或监听器能"放行"一个被拒的调用，因为放行这个动作在类型上不存在。

守卫在 `ToolLayer.guardReason` 里被串起来：

```ts
guardReason(exec: ToolExecution): string | undefined {
  for (const guard of this.guards.values()) {
    const reason = guard(exec)
    if (reason !== undefined) return reason
  }
  return undefined
}
```

第一个返回理由的守卫就拒，后面不再跑。`ctx.tools.guard(guard)` 把守卫注册进当前作用域（plain context 全局，agent.ctx 只对该 agent）。守卫在 pre-execute waterfall 之后、派发之前求值，身份受保护（identity protected），保证它代表的 owner 不可妥协策略不会被冒名绕过。

## 结果类型：成功带 value，失败不带

工具执行的结果是一个判别联合，成功和失败严格分开：

```ts
export interface ToolExecutionSuccess {
  readonly isError: false
  readonly value: JsonValue        // 执行局部，"刻意不进持久事件"
  readonly content: ContentBlock[]
  readonly error?: never
  readonly meta?: JsonValue
  readonly additionalContexts?: UserMessage[]
  readonly concludesTurn?: true    // agent loop 在提交这批成功结果后停下
}

export interface ToolExecutionFailure {
  readonly isError: true
  readonly error: ToolFailure      // 失败永远不带成功的 value
  readonly value?: never
  readonly content: ContentBlock[]
  // ...
}
```

几个要点。第一，成功的 `value` 是执行局部的 canonical JSON 值，注释明确说它"刻意不进持久事件"（deliberately omitted from durable events）。落进会话日志的是渲染后的 `content` 和可选的 `meta`，不是原始 value。这和会话日志那套"投影干净、原始保真"的双层设计一致。

第二，`concludesTurn` 只在成功结果上存在，一个组合工具（比如 Code Mode）会把嵌套调用的 concludesTurn 转发到外层结果，只有权威的嵌套成功才能结束外层 run。

第三，规范的错误码是常量：

```ts
export const TOOL_ABORTED = 'ABORTED'                          // body 已调用之后取消
export const TOOL_ABORTED_BEFORE_DISPATCH = 'ABORTED_BEFORE_DISPATCH'  // body 调用之前取消
```

加上 `ToolNotFoundError`（code `UNKNOWN_TOOL`）和 `ToolOutputError`（code `INVALID_TOOL_OUTPUT`）。这些结构化错误码让重试、沙箱、回放代码能区分"工具自己抛的错"和"未知工具""输出非法"等情况。

## 归一化与 finalizeContent：snapshotJsonValue 复用

上一篇讲"归一化把抛错变成 isError"。在代码里，它靠的是从 session 包复用过来的 `snapshotJsonValue`：

```ts
import { snapshotJsonValue } from '@deepseek-ai/dsh-session'

function snapshotToolValue(toolName: string, candidate: unknown): JsonValue {
  try {
    const detached = snapshotJsonValue(candidate)
    if (detached === undefined) throw new ToolOutputError(toolName, ['value is not lossless JSON'])
    return detached as JsonValue
  } catch (error) {
    // ... 归一化成 INVALID_TOOL_OUTPUT
  }
}
```

工具 body 返回的值，用 session 包那个一次遍历校验兼快照的函数，做无损 JSON 校验和 detach。非无损 JSON 的返回值在这里就变成结构化的 `INVALID_TOOL_OUTPUT` 失败。这是"日志是唯一真相源、一切持久数据必须无损 JSON"在工具层的延伸：工具返回的值要能进日志，就必须过无损 JSON 校验，session 包的 `snapshotJsonValue` 是同一把尺子。

`finalizeContent` 是工具定义自己的最后一道内容终检。源码里它在调用开始时被快照（`contentFinalizers` WeakMap），对每个归一化后的结果（包括绕过 post-execute 的失败）正好跑一次，只能替换 content，必须同步且 total（不能抛）。这保证不管管线哪一层出了什么结果，工具定义对自己的"模型面向内容"有最后一次同步把关。

## 注册：强制 output 声明与保留名

`register` 方法的校验体现了工具定义的硬契约：

```ts
register(definition: ToolDefinition): () => void {
  const name = definition.name
  const output = (definition as Partial<ToolDefinition>).output
  if (output === undefined || typeof output !== 'object'
    || typeof output.render !== 'function'
    || (output.presentationMeta !== undefined && typeof output.presentationMeta !== 'function')) {
    throw new TypeError(`tool "${name}" must declare output { schema, render, presentationMeta? }`)
  }
  assertSupportedJsonSchema(output.schema)
  // ... timeoutMs 正有限校验
  if (name === RUN_CODE_NAME) {
    throw new Error(`tool name "${RUN_CODE_NAME}" is reserved ...`)
  }
  return this.layers.effect(this.ctx, layer => layer.tools.insert(name, definition), { label: 'tools.register()' })
}
```

三条硬规矩：第一，**每个工具必须声明 canonical output**（`{ schema, render, presentationMeta? }`）。这是上一段"工具返回 canonical JSON 值"契约的入口：没有 output 声明，注册就拒绝。第二，`timeoutMs` 如果有，必须是正有限数（它是策略元数据，不进模型 schema）。第三，`run_code` 这个名字无条件保留，不能注册、不能遮蔽、不能限制，因为任何 agent 都可能选 Code Mode。

注册按调用 context 的 scope 落层：plain context 注册全局，`agent.ctx` 只对该 agent（遮蔽同名全局工具）。返回的 disposer 随调用 fiber 销毁。

## Code Mode：run_code 传输与 SDK 段

Code Mode 是这个包的一大块，源码里它的实现跨 `index.ts` 和 `code-mode.ts`。几个关键点：

**run_code 是保留传输，不进可过滤的注册层。** `requireCodeTransport()` 懒构造它，可见性解析器在解析完可过滤的全局/作用域层之后，只为实际呈现 code 的作用域追加它。这保证 per-agent 限制不能移除它、作用域注册不能遮蔽它。

**`code` 模式下 run_code 是唯一可直接调用的入口。** 一个没有 parent token 的模型直接调用，命名任何其他工具，在执行创建时（pre-execute 之前）就解析成 `UNKNOWN_TOOL`。拒绝消息会指明出路，告诉模型只有 `run_code` 能直接调、其他工具要从 `run_code` 程序内部调用，因为同一个提示声明了那个工具，一句干巴巴的 unknown tool 会让模型以为部署坏了。

**SDK 段（`tools:sdk`）按运行时语言生成。** 源码里有个渲染器表：

```ts
const SDK_RENDERERS: Record<string, (schemas: ToolSdkSchema[]) => string> = {
  typescript: renderToolsSdk,
  python: renderToolsSdkPy,
} satisfies Record<CodeSdkLanguage, (schemas: ToolSdkSchema[]) => string>
```

按 `ctx.codeRuntime.language` 选渲染器，没有渲染器的语言让提示组装失败。SDK 段是确定性的：字典序工具排列，工具集不变则文本字节相同（prefix-cache 友好）。

**子调用走完整管线。** `run_code` 的 dispatch bridge 把每个绑定调用按提交顺序、用原生并发契约调度（连续并发安全调用重叠到 `maxParallelSubCalls`，排他调用排空池单独跑），每个带着外层执行的 `parent` token，过完整的 pre-execute → 守卫 → execute → post-execute → result 管线。这就是上一篇说的"Code Mode 把子调用也送进同一条管线"的代码实现。子调用的 `additionalContexts` 通过外层 `ToolRunContext.deferContext` 延迟，只在父 `run_code` 结果之后追加，保持调用/结果相邻。

## 把管线和调度对上

读完这篇，回头看前面两篇，三个视角其实是同一套机制：

- **第 13 篇**讲的是管线的**概念**：七层关卡、策略与机制分离。
- **这一篇**讲的是管线的**声明**：`ToolRuntime` 用五个事件、一个调度器符号、一组决策类型把那七层落成代码。
- **第 8 篇**讲的是管线的**调度**：agent-loop 的 `tool-calls.ts` 通过 `TOOL_RUNTIME_SCHEDULER` 这个符号，把并发调度（重叠 dispatch）和有序策略（有序 prepare/finalize）拼起来。

调度器符号是连接后两篇的桥：`prepare` 跑 pre-execute 加守卫（有序），`dispatch` 跑 around 派发加 body（可并发），`finalize/finish` 跑 post-execute 加内容终检（按模型顺序提交）。agent-loop 的并行调度器之所以能让多个工具并发跑、又保证策略有序，靠的就是这个分阶段符号接口把"可重叠的"和"必须有序的"分开。

## 结论

`dsh-tools` 的 `ToolRuntime` 用五个事件定义了工具执行管线：pre-execute、execute、post-execute 三道 waterfall 是可改写关卡，code-dispatch-log 是 Code Mode 日志副本替换 waterfall，result 和 change 是 emit 通知。它暴露一个 `TOOL_RUNTIME_SCHEDULER` 符号接口（prepare/dispatch/finalize/finish），让 agent-loop 的并行调度器能重叠派发同时保持前后策略有序，这是连接 agent-loop 那篇的桥。决策类型刻意不做输入改写（参数已记日志），单调守卫只有 deny、类型上不存在 allow 所以无法被翻回。结果成功带 execution-local 的 value（不进持久事件）、失败不带 value，用从 session 包复用的 snapshotJsonValue 做归一化。注册强制 canonical output 声明、保留 run_code 名、按 scope 落层。Code Mode 的 run_code 是不进可过滤层的保留传输，子调用带 parent token 走完整管线、additionalContexts 延迟以保持调用/结果相邻。这套代码把上一篇的管线概念落成了有类型、有 scope、有调度器接口的真实实现。

## 延伸阅读

- [tools 包源码（src/index.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/src/index.ts)：ToolRuntime 服务、事件声明、调度器符号
- [tools 包 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/README.md)：API 契约与 Code Mode 细节
- [tools 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md)：生成式 cordis-surface 与事件签名
- [工具执行管线图](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-execution-pipeline.md)：管线的可视化
- [工具目录（docs/tool-catalog.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md)：内置工具的 schema 清单
- [agent-loop 的 tool-calls.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/tool-calls.ts)：通过调度器符号调进本包的并行调度器

上一篇：[工具执行管线：从 tool_call 到结果中间发生什么](./13-tool-execution-pipeline.md)
下一篇：[系统提示组装与动态 Cordis](./15-system-prompt-assembly-and-dynamic-cordis.md)
