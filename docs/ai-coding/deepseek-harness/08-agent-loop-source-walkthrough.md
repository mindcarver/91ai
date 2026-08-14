# agent-loop 驱动器源码导读

> 如果这一篇你只能带走一句话，带走这句：整个 DeepSeek Harness 里只有一个包装着"具体 loop 逻辑"，就是 `dsh-agent-loop`，它的驱动器是一个三状态机（idle/maintenance/running），靠一个 `kick → turn → step` 的循环把 inbox 里的输入变成模型请求，每一步的请求都从会话日志现算出来。
> 这一篇是源码导读，沿着上一段讲的 turn/step 概念，落到 `packages/core/agent-loop` 的真实代码。读完后你应当能拿着 `agent.ts`、`tool-calls.ts`、`index.ts` 这三个文件，从一条用户消息追到一次工具结果落进日志。

## 整个 harness 里唯一的"具体 loop"

先定位这个包的位置。README 一句话定调：**THE concrete agent plugin and loop driver**。它是整个 harness 里唯一装着具体循环逻辑的包，其他一切都是抽象服务或挂在扩展点上的插件。

它的入口是 `src/index.ts` 里的 `AgentLoop` 类：

```ts
export class AgentLoop extends Service implements AgentFactory {
  static inject = ['agents', 'sessions', 'llm', 'tools', 'systemPrompt']
  // ...
}
```

两件事一眼看出它的角色。第一，它注入了五个核心服务：`agents`、`sessions`、`llm`、`tools`、`systemPrompt`。一个能跑的 agent 需要的全部依赖都在这里。第二，它实现 `AgentFactory` 接口，并在构造时把自己注册成工厂：

```ts
ctx.effect(() => ctx.agents.setFactory(this), 'agentLoop.setFactory()')
```

所以别的插件创建或恢复 agent，走的是 `ctx.agents.create(...)`，背后就是这个工厂。真正的驱动器类 `ReactLoopAgent` 是包私有的，外部碰不到它的内部，只能通过 `ctx.agents` 和事件来观察。

这个包导出的只是插件、服务、配置三件契约，导出表里没有 `./src/*` 的逃生口。这是一条刻意的边界：所有可观察的行为都通过 session 事件和 `agent/*` 事件暴露，驱动器内部不留后门。

## 三个 phase：idle / maintenance / running

驱动器的状态用一个 `Phase` 类型表达，这是理解整个循环的钥匙：

```ts
type Phase =
  | { kind: 'idle'; lastTurn: number }
  | { kind: 'maintenance'; abort: AbortController; lastTurn: number; wakeRequested: boolean }
  | { kind: 'running'; abort: AbortController; turn: number; step: number; wakeRequested: boolean }
```

三种状态：

- **idle**：没有工作在跑。记录上一次的 turn 号。
- **maintenance**：在做不需要模型的工作（比如压缩），独占驱动器，不能同时跑 turn。
- **running**：正在跑一个 turn，记录当前 turn 号、step 号，以及一个属于这个 turn 的 AbortController。

对外暴露的 `status` 只有两值：`idle` 和 `running`，maintenance 算 idle。每次切状态用 `setPhase`，它在状态切换时广播 `agent/status`：

```ts
get status(): AgentStatus {
  return this.phase.kind === 'idle' || this.phase.kind === 'maintenance' ? 'idle' : 'running'
}
private setPhase(next: Phase): void {
  const previousStatus = this.status
  this.phase = next
  const status = this.status
  if (status !== previousStatus) this.dispatch.emit('agent/status', { status })
}
```

注意 `wakeRequested` 这个字段，它在 maintenance 和 running 两个状态里都有。它是一个"唤醒锁存"：当驱动器正忙（maintenance 或被取消的 running）时来了唤醒输入，没法立刻处理，就记下"醒来后要再跑一次"，等驱动器收敛回 idle 时再 replay。后面讲取消时还会再碰到它。

## 统一的 send()：followup / steer / inject 怎么映射

输入怎么进 inbox？驱动器暴露的 `followup`、`steer`、`inject` 三个方法，背后是同一个 `send()` 原语，按"目标队列 × 是否唤醒"两个维度区分：

```ts
send(message: UserMessage, target: InboxTarget, wakeup: boolean): void {
  const wakingAfterAbort = wakeup && this.phase.kind !== 'idle' && this.phase.abort.signal.aborted
  const resolvedTarget = wakingAfterAbort ? 'next-turn' : target
  this.inbox.splice(resolvedTarget, Infinity, 0, [message])
  if (wakeup) this.wakeDriver(wakingAfterAbort)
}

followup(input) { this.send(input, 'next-turn', true) }
steer(input)    { this.send(input, 'next-step', true) }
inject(input)   { this.send(input, 'next-step', false) }
```

三种语义清清楚楚：`followup` 进 next-turn 队列并唤醒（这是普通用户消息）；`steer` 进 next-step 队列并唤醒（方向盘，想插进下一步）；`inject` 进 next-step 队列但不唤醒（注入的上下文，等人捎带）。这正好对应上一段讲过的 inbox 行为：注入不主动唤醒，只排队。

`wakingAfterAbort` 这一行处理一个边角：一条唤醒输入赶上一个正在被取消的活动，它不能并入那个活动，所以改投到 next-turn 队列，等下一个 turn 再处理。这个判断在插入 inbox 之前完成，避免一个重入的取消回调改写它的归类。

## 驱动器主干：kick → turn → step

唤醒后驱动器进入 running，跑一个 `kick`：

```ts
private async kick(): Promise<void> {
  try {
    while (await this.turn()) {}   // 跑 turn，直到没有下一个 turn
  } catch {
    // 失败和取消在 driver 边界兜住
  } finally {
    if (this.phase.kind === 'running') {
      const { turn, wakeRequested } = this.phase
      this.setPhase({ kind: 'idle', lastTurn: turn })
      if (wakeRequested && this.inbox.hasPending) this.wakeDriver()
    }
  }
}
```

`kick` 是个 `while (await this.turn())` 循环。`turn()` 返回布尔，true 表示还有下一个 turn 要跑（inbox 又有货了），false 表示这次驱动收敛。`finally` 里如果锁存了唤醒请求且 inbox 还有货，就再唤一次自己。所有失败和取消都在这个边界被吞掉，不让它们逃出驱动器。

`turn()` 是一条 turn 的完整骨架，裁剪后的主干：

```ts
private async turn(): Promise<boolean> {
  const phase = this.phase
  const { signal } = phase.abort
  const turn = phase.turn + 1
  this.session.append('turn/start', { turn })
  phase.turn = turn
  let turnEnds: TurnEndReason | null = null
  let target: InboxTarget = 'next-turn'
  try {
    while (true) {
      signal.throwIfAborted()
      const step = phase.step + 1
      const decision = await this.preStep(target, { turn, step })
      if (decision.kind === 'reject') { turnEnds = { kind: 'blocked' }; return false }
      if (turnEnds && decision.messages.length === 0) break
      if (phase.step === 0 && decision.messages.length === 0) { turnEnds = { kind: 'completed' }; return false }
      this.session.append('step/start', { turn, step })
      phase.step = step
      try {
        for (const message of decision.messages) this.session.append('user/message', message, { surfaceOp: 'append' })
        const stepEnd = await this.step(decision.assembly)
        if (turnEnds === null || turnEnds.kind !== 'max-tokens') turnEnds = stepEnd
      } finally {
        this.session.append('step/end', { turn, step })
      }
      if (turnEnds && this.inbox.nextStep.length === 0) {
        await this.dispatch.serial('agent/turn-stopping', { turn, signal })
      }
      if (turnEnds && this.inbox.nextStep.length === 0) break
      target = 'next-step'
    }
  } finally {
    this.session.append('turn/end', { turn, reason: turnEnds! })
  }
  if (!this.inbox.hasPending) return false
  phase.abort = new AbortController()
  phase.wakeRequested = false
  phase.step = 0
  return true
}
```

逐段对应上一段讲的 turn 流程：

- `turn/start` 开 turn，记下 turn 号。
- 循环里每个 step：先 `preStep` 领取输入并过 `agent/pre-step` 关卡。
- 如果关卡拒绝（`reject`），turn 以 `blocked` 结束，返回 false（一个不消耗 step 的 turn）。
- 如果第一个 step 的消息被改写成空（`phase.step === 0 && messages.length === 0`），turn 以 `completed` 结束，同样零 step。
- 否则 `step/start`，把消息作为 `user/message` 追加，跑 `step()`，`step/end`。
- 每跑完一个 step 判断：自然停下且 next-step 队列空，就过 `agent/turn-stopping` 这个 serial 检查点，然后 break。
- `turn/end` 永远写一条，带上结束原因（blocked / completed / max-tokens / aborted / error）。
- 最后如果 inbox 还有货，换一个新的 AbortController，重置 step 计数，返回 true 让 `kick` 再跑一个 turn。

注意 `max-tokens` 是"粘"的：注释里写明，一旦某个 step 撞了输出上限，后面正常完成的 step 不能把 turn 结果降级回 completed。所以判断是 `turnEnds === null || turnEnds.kind !== 'max-tokens'` 才接受新的 step 结果。

## claim 在哪里发生：preStep

领取输入和过守门人，都在 `preStep` 里：

```ts
private async preStep(target: InboxTarget, position: { turn: number; step: number }): Promise<PreparedStep> {
  const signal = this.phase.abort.signal
  const claimed = this.inbox.claim(target, position.turn)   // 领取 inbox
  const assembly = await this.loopCtx.systemPrompt.assemble(assembleContextFor(this, signal))
  signal.throwIfAborted()
  const sections = renderContextSections(assembly)
  const context = this.runtimeContext.project(joinContextSections(sections), sections)
  const decision = await this.dispatch.waterfall(
    'agent/pre-step', { messages: claimed, ...position, signal },
    (): Promise<PreStepDecision> => Promise.resolve({
      kind: 'enter',
      messages: context === undefined ? claimed : [...claimed, context],
    }),
  )
  signal.throwIfAborted()
  return decision.kind === 'reject' ? decision : { ...decision, assembly }
}
```

`claim` 是关键一步：它按 target 从对应队列领走一批消息。turn 开始时 target 是 `next-turn`，会领 next-step 输入外加一条 next-turn 提示（对应架构文档"claim 下一步输入外加一条排队消息"）；step 之间 target 是 `next-step`，只领 next-step 输入。

然后组装系统提示、投影运行时上下文，把投出来的上下文拼到 claimed 消息后面。最后过 `agent/pre-step` waterfall，默认放行（enter），监听器可以拒绝或改写。注意默认放行的消息里，如果运行时上下文非空，它是 `[...claimed, context]`，把上下文作为额外消息带上。每个 `signal.throwIfAborted()` 都在关键 await 之后检查取消，保证取消能及时生效。

## 一次模型请求：step 与 deriveMessages

`step()` 是一次模型请求的全部。裁剪后的主干：

```ts
private async step(assembly: PromptAssembly): Promise<StepEndReason | null> {
  const { turn, step, abort: { signal } } = this.phase
  const system = renderPrompt(assembly)
  while (true) {
    const { request, preparedCall } = await this.buildRequest(
      turn, step, assembly.tools, system, this.session.deriveMessages(), signal,   // deriveMessages
    )
    const assembler = new BlockAssembler()
    const chunkSeqs: number[] = []
    const stream = preparedCall?.stream(request) ?? this.loopCtx.llm.stream(request)
    for await (const chunk of stream) {
      signal.throwIfAborted()
      chunkSeqs.push(this.session.append('assistant/chunk', { turn, step, chunk }).seq)
      assembler.push(chunk)
    }
    const finish = assembler.finish
    if (finish.kind === 'error' || finish.kind === 'aborted') {
      const action = await this.dispatch.waterfall('agent/request-error', { turn, step, provider: request.provider, failure: finish.failure, retryPolicy: preparedCall?.retryPolicy, signal },
        () => Promise.resolve<RequestErrorAction>(undefined))
      if (action?.kind !== 'retry') throw new LlmError(finish.failure.message, finish.failure.code, finish.failure)
      continue   // 重试，回到 while 开头
    }
    const message = createAssistantMessage({ content: assembler.blocks(), source: { provider: request.provider, model: request.model } })
    this.session.append('assistant/message', { turn, step, message, ...assembler.usage }, { surfaceOp: 'append', sourceEventSeqs: chunkSeqs })
    if (finish.kind === 'max-tokens') return { kind: 'max-tokens' }
    const toolCalls = message.content.filter(block => block.type === 'tool-call')
    if (toolCalls.length === 0) return { kind: 'completed' }
    const { concluded } = await executeToolCalls(this.loopCtx, turn, step, toolCalls, signal,
      context => this.inbox.splice('next-step', this.inbox.nextStep.length, 0, [context]))
    return concluded ? { kind: 'completed' } : null
  }
}
```

几个要点：

- **`this.session.deriveMessages()`** 是请求的真相来源。每一步模型看到的历史，都是从会话日志现算出来的，不是某个内存变量。这是"模型可见即可重建"在代码里的落点。
- **流式逐块记日志**。每个 `assistant/chunk` 都进日志并记下 seq，最后 `assistant/message` 用 `sourceEventSeqs: chunkSeqs` 把它依赖的 chunk 串起来。空内容不进投影历史，但消息事件保留 usage 和（可能是空的）seq 列表。
- **失败走 `agent/request-error` waterfall**。错误或被中止的 finish，过这个 waterfall 请求恢复动作；只有返回 `{ kind: 'retry' }` 才 `continue` 重试，否则抛出 `LlmError`。
- **工具结果可以产生额外上下文**。`executeToolCalls` 的最后一个参数是个 acceptor：工具返回的 `additionalContexts` 被 splice 进 next-step 队列，等下一步带给模型。
- **concluded 短路**。如果某次工具结果带 `concludesTurn`，step 直接返回 completed，turn 收尾。

## 请求怎么冻结和记账：buildRequest

`step` 里调的 `buildRequest` 是请求的组装和记账。关键几步：

```ts
const proposedConfig = await this.dispatch.waterfall(
  'agent/request', { turn, step, signal },
  () => Promise.resolve(seedConfig),
)
// ...
preparedCall = await this.loopCtx.llm.prepareCall(proposedConfig, signal)
config = preparedCall.config
// ...
const header = canonicalHeader({ config, ...preparedCall === undefined ? {} : { adapterDefaults: preparedCall.adapterDefaults }, ...system ? { system } : {}, ...tools.length > 0 ? { tools } : {} })
if (!this.requestHeaderLogged) {
  this.session.append('request/header', { header, reason: baseline === undefined ? 'initial' : 'resume' })
  this.requestHeaderLogged = true
} else if (baseline === undefined || !headerEquals(baseline, header)) {
  this.session.append('request/header', { header, reason: 'change' })
}
```

`agent/request` waterfall 让插件有机会改写请求配置（默认是 seedConfig）。然后 `ctx.llm.prepareCall()` 校验 adapter 字段、物化 reasoning-effort 和 output-token 默认值。返回的 `preparedCall` 绑定了解析默认值的那个 adapter 注册，跨异步解析、header 记账、最终派发都保持同一个 adapter，所以 HMR 不会把一个 adapter 的能力结果混进另一个 adapter 的请求。

请求头（`request/header`）按需记账：第一次写 `initial`（或恢复时写 `resume`），之后只在 header 变了时写 `change`。这个 header 是请求前缀的规范记录，用来判断 KV cache 能不能复用：只要 system、tools、历史字节相同且路由没变，就是 append-only、可复用；一改就从头失效。

`seedConfig` 里有个细节叫"adapter-default marker"：上一步从 header 里标记了哪些字段是 adapter 算出来的默认值（`adapterDefaults`），`requestProposal()` 在下一次提议前把这些标记字段删掉，让当前路由重新算自己的默认值；没标记的显式设置跨 step 和路由变更保留。这保证换路由不会带错上一路由的默认值。

## 工具调度：barrier 与滚动池

`step` 里的 `executeToolCalls` 在 `tool-calls.ts`，它调度一个 step 内的工具调用。核心规则在文件顶部注释里写明：**排他调用构成 barrier，并行调用用有界滚动池，且在启动前重新分类。**

主循环按"执行模式"把调用分成组：

```ts
while (next < planned.length) {
  const first = planned[next]!
  const mode = ctx.tools.executionMode(first.exec).kind
  const group = mode === 'parallel' ? planned.slice(next) : [first]   // 排他单独成组，并行整批成组
  const outcome = await runGroup(ctx, turn, step, group, mode, signal, acceptContext)
  next += outcome.consumed
  concluded ||= outcome.concluded
  if (outcome.aborted) {
    for (const call of planned.slice(next)) appendSkippedToolCall(session, turn, step, call.block)
    return { concluded }
  }
}
```

第一个调用的模式决定这一组怎么跑：排他调用单独成一个 barrier（`group = [first]`），并行调用把后面所有调用整批放一起（`planned.slice(next)`）。

`runGroup` 里管一个有界滚动池（`inFlight`），并行度上限是 `maxParallelToolCalls`（默认 10，1 就是串行）。关键纪律有三条，都体现在代码里：

**重新分类。** 并行组里，每启动下一个调用前都重新读它的模式：

```ts
if (nextToStart > 0 && mode === 'parallel'
  && ctx.tools.executionMode(nextCall.exec).kind !== 'parallel') break
```

注册表可能在途中变化，把一个原本并行的调用变成排他的，这时就停下，让排他调用作为下一个 barrier 等当前池排空再跑。

**结果按模型顺序提交。** `commitReady` 只在连续的、按模型给出顺序的 slot 就绪时往前推进：

```ts
const commitReady = async (): Promise<void> => {
  while (committed < group.length) {
    const slot = slots[committed]
    if (slot === undefined) break   // 不连续就停，等前面的就绪
    // ... finalize/finish，appendToolResult
    committed++
  }
}
```

调度可以并发（dispatch/body 重叠），但策略、持久结果、结果上下文保持模型顺序。也就是说，工具可以乱序完成，但落进日志的结果和给模型看的顺序，还是模型给出的顺序。

**取消合成结果。** 如果 signal 被中止，已启动的调用排空并提交，没启动的调用每个补一个合成结果：

```ts
if (aborted) {
  for (const call of group.slice(started)) appendSkippedToolCall(session, turn, step, call.block)
  return { consumed: group.length, aborted: true, concluded }
}
```

`appendSkippedToolCall` 给每个没分发的调用补一对 `tool/call` + `tool/result`，错误码是 `ABORTED_BEFORE_DISPATCH`，结果文本是 "Error: tool call aborted before dispatch"。这样重放时历史一致，不会因为取消而缺结果。

## 失败和取消：在哪一层兜住

读完主干，回头看失败和取消的边界，这是驱动器最硬的部分。

**插件失败只结束当前 turn，不结束 loop。** README 原话：最终 adapter 选择、派发、迭代失败以 terminal error 或 aborted finish 从 `ctx.llm` 进来，进 `agent/request-error`；中间件、结果处理、工具和其他扩展失败仍然抛出，直接关闭 turn。一个处理监听器返回 `{ kind: 'retry' }` 就重试，没处理的失败是 terminal。

**取消走一个信号。** `cancel()` 清掉 inbox（除非 `keepInbox`），协作地 abort 当前 turn 的信号：

```ts
cancel(cause: AgentCancelCause, options: CancelOptions = {}): void {
  if (!options.keepInbox) {
    this.inbox.clear()
    if (this.phase.kind !== 'idle') this.phase.wakeRequested = false
  }
  if (this.phase.kind !== 'idle') this.phase.abort.abort(cause)
}
```

idle 时的取消是个 no-op。`turn()` 的 catch 检测到 `signal.aborted`，把 turnEnds 记成 `{ kind: 'aborted', reason }`，turn/end 仍然写一条。取消原因改变的是报告，不是结果上下文怎么 finalize。

**唤醒锁存。** 前面提过 `wakeRequested`。一条唤醒输入在 abort 之后但活动还没收敛到 idle 时到达，会被锁存，在驱动器自己的收敛边界 replay，不需要再发一次唤醒。但 `disposed` 类型的取消从不锁存，保证 teardown 不会等一个模型 turn。这条竞态合约是源码里大段注释专门处理的。

## 这套驱动器的设计要点

把代码压成几条要记住的设计：

**每一步的请求都从日志现算。** `deriveMessages()` 在每个 step 调一次，模型历史永远是日志的投影，不是缓存。

**并发调度，顺序提交。** 工具可以并行跑（有界滚动池），但结果和上下文按模型顺序落日志。

**adapter 默认值带标记。** 标记的默认值每次重新算，没标记的显式设置保留，换路由不串味。

**turn-stopping 是 serial 无 next()。** 和 pre-step/request 的 waterfall 不同，它是纯粹的收尾检查点。

**失败在驱动器边界兜住。** `kick` 的 try/catch 吞掉一切，不让单个 turn 的失败杀死整个 loop。

**取消用合成结果保持重放一致。** 没分发的工具调用补 `ABORTED_BEFORE_DISPATCH`，历史不缺。

**phase 是单一状态机。** idle/maintenance/running 三态管理所有并发，`wakeRequested` 处理忙时唤醒。

## 结论

`dsh-agent-loop` 是 harness 里唯一装着具体循环逻辑的包。它的驱动器 `ReactLoopAgent` 是一个三状态机，`kick` 循环跑 turn，`turn` 循环跑 step，每一步先 claim inbox、过 `agent/pre-step` 守门人，再用 `deriveMessages()` 从会话日志现算请求，过 `agent/request` 组装、`prepareCall` 绑定 adapter，流式记 `assistant/chunk`，归总成 `assistant/message`，工具走 `executeToolCalls` 的 barrier 与有界滚动池调度，结果按模型顺序提交。失败在驱动器边界兜住，取消用合成结果保持重放一致。这套代码把上一段讲的 turn/step 概念，落成了可读、有边界的真实驱动器。

## 时点与诚实声明

本文基于 2026-08-14 的 `deepseek-ai/deepseek-harness` 仓库源码：`packages/core/agent-loop/src/agent.ts`、`packages/core/agent-loop/src/tool-calls.ts`、`packages/core/agent-loop/src/index.ts`、`packages/core/agent-loop/src/constants.ts` 及该包 README。文中代码片段从上述文件裁剪保留关键控制流，类名（`AgentLoop`、`ReactLoopAgent`）、`Phase` 状态机三态、`send`/`followup`/`steer`/`inject` 映射、`kick → turn → step` 循环、`inbox.claim`、`deriveMessages`、`agent/pre-step`/`agent/request`/`agent/request-error` waterfall、`request/header` 的 initial/resume/change 记账、`maxParallelToolCalls` 默认 10、`ABORTED_BEFORE_DISPATCH` 合成结果、`wakeRequested` 锁存，均为源码与 README 陈述的可核实事实。

`dsh` 处于 developer preview，类名、方法签名、事件字段会随重构变。文中代码为可读性做了行级裁剪、注释精简与变量省略（如 `turnEnds` 的部分判断、`buildRequest` 的 seedConfig 细节），完整逻辑以仓库源码为准。"并发调度顺序提交""adapter 默认值带标记防串味""失败在驱动器边界兜住"属对源码设计意图的分析判断，部分依据源码注释。

## 延伸阅读

- [agent-loop 包 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md)：驱动器服务契约与 loop 生命周期总述
- [驱动器核心源码（src/agent.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/agent.ts)：ReactLoopAgent 三状态机与 kick/turn/step
- [工具调度源码（src/tool-calls.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/tool-calls.ts)：barrier 与有界滚动池
- [工厂与生命周期源码（src/index.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/index.ts)：AgentLoop 工厂与 create/resume/teardown
- [agent 服务文档（packages/core/agent）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent/README.md)：Agent 接口与 initiator scope
- [架构文档：Turn flow](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：turn/step 流程的权威总述

上一篇：[Turn 与 Step：一次模型调用要走完多少道关卡](./07-turn-and-step-lifecycle.md)
下一篇：[会话日志：为什么"模型可见即可重建"是最硬的规矩](./09-session-log-visible-means-reconstructable.md)
