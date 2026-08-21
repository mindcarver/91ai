# dsh tools 注册表与守卫管线源码导读

> `dsh-tools` 的 `ToolRuntime` 用六个事件（三道 waterfall 加一个 code-dispatch-log waterfall 加两个 emit）定义了上一段的工具执行管线，并暴露一个调度器符号，让 agent-loop 的并行调度器能重叠派发同时保持前后策略有序。
> 这一篇是源码导读，把上一篇讲的七层管线落到 `packages/core/tools/src/index.ts` 的真实代码。它还会对上更早讲的 agent-loop 那篇：agent-loop 的 `tool-calls.ts` 正是通过一个调度器符号调进这里的。

## ToolRuntime：注入 systemPrompt 的服务

`dsh-tools` 对外的身份是一个 Cordis 服务：`ToolRuntime`，服务 key 是 `tools`。它静态注入 `systemPrompt`，因为注册表要自动把工具 schema 喂进系统提示组装。构造时挂上 `ctx.systemPrompt.tools(...)`，可见工具的 schema 就自动流进每个 agent 的提示组装。"注册一个工具，它的 schema 自动进提示"靠的就是这个挂载，插件不需要再做任何额外动作。

配置只有两项。`mode` 决定模型面向的呈现方式，取值 native、code、both，默认 native；`maxParallelSubCalls` 是 Code Mode 子调用的并发上限，最小 1，默认 10，设成 1 就退回串行。

## 六个事件：管线的扩展点

这个包声明的事件就是上一篇管线的扩展点，全部声明在 cordis 的 `Events` 接口里，每个事件的注释用 `@mode` 标签写明派发模式：

| 事件 | 模式 | 管什么 |
|------|------|--------|
| `tools/pre-execute` | waterfall | 派发前的 allow、deny 或 ask 门 |
| `tools/execute` | waterfall | around 派发层，给超时、重试或指标插件用 |
| `tools/post-execute` | waterfall | 接受、替换、丰富或拦截归一化后的结果 |
| `tools/code-dispatch-log` | waterfall | 替换 Code Mode 子派发的持久日志副本内容 |
| `tools/result` | emit | 观察冻结的、无损 JSON 的最终结果 |
| `tools/change` | emit | 工具注册、注销或可见性变化的通知 |

三道策略 waterfall 对应管线里可改写的关卡。`code-dispatch-log` 是 Code Mode 专用的日志副本替换点，spill 策略用它把超大的子调用结果换成预览加定位符。两个 emit 只观察，不改动任何东西。

两个容易混的点。这些事件都是 scope 过滤的（`Scoped<ToolRuntime>`），agent 作用域的监听器只收到那个 agent 的调用。`tools/result` 和 `tool/result` 也不是一回事：前者是这里 live 的 emit 通知，后者是 agent-loop 事后追加的持久会话事件。

## 调度器符号：agent-loop 怎么调进来

注册表还暴露一个用 Symbol 做 key 的内部视图 `TOOL_RUNTIME_SCHEDULER`，四个方法：`prepare`、`dispatch`、`finalize`、`finish`。它是给 agent-loop 的并行调度器用的：那边的 `tool-calls.ts` 调度一个 step 的工具调用时，调的就是这四个方法。

为什么要拆成四个阶段？因为 agent-loop 要重叠派发，但保持前后策略有序。`prepare` 跑有序的 pre-execute 加守卫门，决定这次调用能不能进派发；`dispatch` 只跑 around 派发加工具 body，可以和兄弟调用并发；`finalize` 跑 post-execute 加内容终检，结果按模型顺序提交。多个调用的 `dispatch` 并发跑，每个调用的策略门和结果提交仍然有序。把"可重叠的"和"必须有序的"拆进不同阶段，就是这套接口的全部意图。

`prepare` 的返回分三种：`dispatch` 表示进派发；`post-result` 表示已有结果但要过 post-execute；`final-result` 表示结果已定型、跳过 post-execute。一个被守卫拒绝、或被 pre-execute 给出既定结果的调用，不必再走完整的 body。

## 决策类型：能改什么，不能改什么

两道策略 waterfall 的决策用两个判别联合表达。`PreToolDecision` 三种：allow 放行；deny 带必填理由拒绝；ask 请求人工审批。`PostToolDecision` 两种取向：accept 可以替换 content（保留 canonical value）或替换 value（重新校验、重新渲染 content 和 metadata），两者互斥，都能附带 `additionalContexts`；block 把纠正性反馈变成一个无 value 的失败结果。

`PreToolDecision` 有一个刻意的设计：**没有输入改写**。注释原话："Input rewriting is excluded because arguments are already logged and presented."（输入改写被排除，因为参数已经记日志、已经展示了）。如果允许 pre-execute 改写参数，记进日志的参数和实际跑的参数就会脱节，展示给用户看的也会对不上。所以 pre-execute 只能 allow、deny、ask，不能改 args。

accept 附带的 `additionalContexts` 排进 loop 的 post-result FIFO，在工具结果之后作为 user/message 带给模型。`ask` 由 `ctx.approval` 接缝服务处理：它是可选注入的，挂上时走 `approval/request`，没挂时降级成 deny。这是上一篇讲过的 fail closed。

## 单调守卫：deny-only 的设计

守卫是这个包最硬的安全机制。类型就一行：接收只读的执行描述，返回一个拒绝理由，或者 undefined 表示不表态。

注释里那句关键："Because guards have no allow result, listener ordering cannot turn a denial back into permission."（守卫没有 allow 结果，监听器顺序不能把一次拒绝翻回成允许）。

守卫**没有"放行"这个动作**。一个守卫能拒，但没有任何守卫或监听器能"放行"一个被拒的调用，因为放行这个动作在类型上不存在。这就是"单调守卫只拒不放"的代码落点。

求值也讲纪律。`guardReason()` 串起当前作用域注册的所有守卫，第一个返回理由的守卫就拒，后面不再跑。守卫在 pre-execute waterfall 之后、派发之前求值，身份受保护，保证它代表的 owner 不可妥协策略不会被冒名绕过。`ctx.tools.guard()` 在当前作用域注册：plain context 全局，`agent.ctx` 只对该 agent。

## 结果类型：成功带 value，失败不带

工具执行的结果是一个判别联合，成功和失败严格分开，字段全部只读。成功带 execution-local 的 canonical `value`、渲染后的 `content`、可选的 `meta` 和 `additionalContexts`，还可以带 `concludesTurn` 声明这批成功结果提交后 turn 可以收。失败带结构化的 `error` 和要展示的 `content`，永远不带 value。

三个要点。

`value` 不进持久事件，注释明确说它"刻意不进"（deliberately omitted from durable events）。落进会话日志的是渲染后的 content 和可选 meta，不是原始 value。这和会话日志那套"投影干净、原始保真"的双层设计一致。

`concludesTurn` 只在成功结果上存在。一个组合工具（比如 Code Mode）会把嵌套调用的 concludesTurn 转发到外层结果，只有权威的嵌套成功才能结束外层 run。

错误码是规范常量。`ABORTED` 表示 body 已调用之后取消，`ABORTED_BEFORE_DISPATCH` 表示 body 调用之前取消；加上 `UNKNOWN_TOOL` 和 `INVALID_TOOL_OUTPUT`，重试、沙箱、回放代码能区分"工具自己抛的错"和"未知工具""输出非法"。

## 归一化：session 包的同一把尺子

上一篇讲"归一化把抛错变成 isError"，代码里靠的是从 `@deepseek-ai/dsh-session` 复用过来的 `snapshotJsonValue`，外面包了一层 `snapshotToolValue()`。工具 body 返回的值，用 session 包那个一次遍历校验兼快照的函数做无损 JSON 校验和 detach；非无损 JSON 的返回值在这里变成结构化的 `INVALID_TOOL_OUTPUT` 失败。这是"一切持久数据必须无损 JSON"在工具层的延伸：工具返回的值要能进日志，就必须过同一把尺子。

`finalizeContent` 是工具定义自己的最后一道内容终检。它在调用开始时被快照，对每个归一化后的结果（包括绕过 post-execute 的失败）正好跑一次，只能替换 content，必须同步且 total（不能抛）。不管管线哪一层出了什么结果，工具定义对自己的模型面向内容有最后一次把关。

## 注册：三条硬规矩

`register()` 接收工具定义，返回一个 disposer。入口校验把三条硬规矩钉死。

每个工具必须声明 canonical output，即 `{ schema, render, presentationMeta? }` 三件套。这是"工具返回 canonical JSON 值"契约的入口：缺 output、render 不是函数，注册直接拒绝。`timeoutMs` 如果有，必须是正有限数；它是策略元数据，不进模型 schema。`run_code` 这个名字无条件保留，不能注册、不能遮蔽、不能限制，因为任何 agent 都可能选 Code Mode。

注册按调用 context 的 scope 落层：plain context 注册全局，`agent.ctx` 只对该 agent，可遮蔽同名全局工具。返回的 disposer 随调用 fiber 销毁。

## Code Mode：run_code 传输与 SDK 段

Code Mode 是这个包的一大块，实现跨 `index.ts` 和 `code-mode.ts`，四个关键点。

run_code 是保留传输，不进可过滤的注册层。`requireCodeTransport()` 懒构造它，可见性解析器在解析完全局和作用域层之后，只为实际呈现 code 的作用域追加它。per-agent 限制移除不了它，作用域注册遮蔽不了它。

`code` 模式下 run_code 是唯一可直接调用的入口。一个没有 parent token 的模型直接调用、命名任何其他工具，在执行创建时（pre-execute 之前）就解析成 `UNKNOWN_TOOL`，守卫和审批根本看不到这个调用。拒绝消息会指明出路：只有 run_code 能直接调，其他工具要从 run_code 程序内部调用。因为同一个提示声明了那个工具，一句干巴巴的 unknown tool 会让模型以为部署坏了。

SDK 段按运行时语言生成。渲染器表目前两项：typescript 和 python，按 `ctx.codeRuntime.language` 选；没有渲染器的语言让提示组装失败。SDK 段是确定性的：字典序工具排列，工具集不变则文本字节相同，prefix-cache 友好。

子调用走完整管线。run_code 的 dispatch bridge 把每个绑定调用按提交顺序、用原生并发契约调度（连续并发安全调用重叠到 maxParallelSubCalls，排他调用排空池单独跑），每个带着外层执行的 parent token，过完整的 pre-execute 到 result 管线。子调用的 `additionalContexts` 通过 `deferContext` 延迟，只在父 run_code 结果之后追加，保持调用和结果相邻。

## 权衡：这套实现的成本和回报

成本是注册表把很多约定做成了硬类型。决策联合排除了输入改写，守卫没有 allow，注册强制 output 声明，result 的 value 不进持久事件：每一处都在收窄插件能做的事。想改参数、想翻案、想省一个 render 函数，都没有口子。

回报是顺序和真实性不用靠自觉。守卫的单调性让监听器顺序无关紧要；参数不可改写让日志、展示、执行三者永远一致；canonical value 有 output schema 兜底，进日志的东西都是无损 JSON；调度器符号把"可并发的 body"和"必须有序的策略"拆开，agent-loop 才敢让工具并发跑。上一篇的七层管线不是文档上的约定，而是这些类型和事件在代码里钉住的事实。

## 结论

`ToolRuntime` 用六个事件把七层管线落成代码：三道 waterfall 是可改写关卡，code-dispatch-log 管 Code Mode 的日志副本，两个 emit 只观察。`TOOL_RUNTIME_SCHEDULER` 把调度拆成 prepare、dispatch、finalize 几段，让 agent-loop 能重叠派发同时保持策略有序。最硬的两处设计是单调守卫（类型上没有 allow，拒绝无法被翻回）和决策类型不提供输入改写（参数已记日志）。注册强制 canonical output 声明，Code Mode 的 run_code 是不可移除的保留传输，子调用带 parent token 走完整管线。

## 延伸阅读

- [tools 包源码（src/index.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/src/index.ts)：ToolRuntime 服务、事件声明、调度器符号
- [tools 包 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/README.md)：API 契约与 Code Mode 细节
- [tools 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md)：生成式 cordis-surface 与事件签名
- [工具执行管线图](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-execution-pipeline.md)：管线的可视化
- [工具目录（docs/tool-catalog.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md)：内置工具的 schema 清单
- [agent-loop 的 tool-calls.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/tool-calls.ts)：通过调度器符号调进本包的并行调度器

上一篇：[工具执行管线：dsh 从 tool_call 到结果的七道关卡](./13-tool-execution-pipeline.md)
下一篇：[系统提示组装与动态 Cordis：dsh 让 agent 改自己的插件树](./15-system-prompt-assembly-and-dynamic-cordis.md)
