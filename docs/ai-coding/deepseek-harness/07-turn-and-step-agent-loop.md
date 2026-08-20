# Turn 与 Step：一次对话在 agent-loop 驱动器里的完整流转

> 如果这一篇你只能带走一句话，带走这句：dsh 用 turn 和 step 两个时间单位组织对话，而驱动这套流转的，是整个 harness 里唯一装着具体循环逻辑的包 dsh-agent-loop，一个三状态机，靠 kick → turn → step 的循环把 inbox 里的输入变成模型请求，每一步的模型历史都从会话日志现算。
> 这一篇把概念和源码合成一条线：先建立 turn/step 的事件骨架（输入怎么进 inbox、守门人怎么拦、turn 怎么收尾），再落到 `packages/core/agent-loop` 的真实代码，从一条用户消息追到一次工具结果落进日志。文中代码与行为基于 2026-08-14 的仓库 `master` 分支。工具执行管线和会话日志另有专篇，这里只看它们在驱动器里的位置。

## 两个时间单位：step 和 turn

理解 DeepSeek Harness 的运行时，先要分清两个时间单位。架构文档给的定义很精确：

- **step（步）**：一次模型请求，加上模型在这一步里调用的工具。
- **turn（轮）**：零个或若干个 step。它在第一条输入被领取之前打开，在"什么都不欠"时关闭。

举个直观例子。你发一句"总结这个仓库并指出主要包"，agent 可能先调一个列目录的工具，再调几个读文件的工具，最后给出总结。这整个过程是一个 turn，但里面有不止一个 step：第一个 step 是模型决定调列目录工具（一次模型请求加那次工具调用），工具结果回来后模型可能再想一步，于是有第二个 step。一个 turn 就是这些 step 串成的链。

注意"零个 step"也是合法的 turn。一个被守门人拦下的 turn 可能一个 step 都不消耗，但这个 turn 仍然会被记进日志。这个细节是"模型可见即可重建"那条规矩的延伸，后面会在代码里看到它的两条触发路径。

## 唯一的"具体 loop"：dsh-agent-loop

概念有了着落处。README 一句话定调：这个包是 THE concrete agent plugin and loop driver，整个 harness 里唯一装着具体循环逻辑的包，其他一切都是抽象服务或挂在扩展点上的插件。

它的入口是 `src/index.ts` 里的 `AgentLoop` 类：

```ts
export class AgentLoop extends Service implements AgentFactory {
  static inject = ['agents', 'sessions', 'llm', 'tools', 'systemPrompt']
  // ...
}
```

两件事一眼看出它的角色。第一，它注入了五个核心服务：`agents`、`sessions`、`llm`、`tools`、`systemPrompt`，一个能跑的 agent 需要的全部依赖都在这里。第二，它实现 `AgentFactory` 接口，并在构造时把自己注册成工厂：

```ts
ctx.effect(() => ctx.agents.setFactory(this), 'agentLoop.setFactory()')
```

所以别的插件创建或恢复 agent，走的是 `ctx.agents.create(...)`，背后就是这个工厂。真正的驱动器类 `ReactLoopAgent` 是包私有的，外部碰不到它的内部，只能通过 `ctx.agents` 和事件来观察。这个包导出的只是插件、服务、配置三件契约，导出表里没有 `./src/*` 的逃生口。这是一条刻意的边界：所有可观察的行为都通过 session 事件和 `agent/*` 事件暴露，驱动器内部不留后门。

## 三态驱动器：idle / maintenance / running

驱动器的状态用一个 `Phase` 类型表达，这是理解整个循环的钥匙：

```ts
type Phase =
  | { kind: 'idle'; lastTurn: number }
  | { kind: 'maintenance'; abort: AbortController; lastTurn: number; wakeRequested: boolean }
  | { kind: 'running'; abort: AbortController; turn: number; step: number; wakeRequested: boolean }
```

三种状态：idle 是没有工作在跑，记录上一次的 turn 号；maintenance 是在做不需要模型的工作（比如压缩），独占驱动器，不能同时跑 turn；running 是正在跑一个 turn，记录当前 turn 号、step 号，以及一个属于这个 turn 的 AbortController。

对外暴露的 `status` 只有两值，maintenance 算 idle：

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

记住 `wakeRequested` 这个字段，它在 maintenance 和 running 两个状态里都有。它是一个"唤醒锁存"：当驱动器正忙（maintenance 或被取消的 running）时来了唤醒输入，没法立刻处理，就记下"醒来后要再跑一次"，等驱动器收敛回 idle 时再 replay。后面讲取消时它会再出场。

## 输入怎么进来：inbox 与三种 send 语义

输入不是直接调一个"跑模型"的函数，而是进一个 inbox。驱动器暴露的 `followup`、`steer`、`inject` 三个方法，背后是同一个 `send()` 原语，按"目标队列 × 是否唤醒"两个维度区分：

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

三种语义清清楚楚：`followup` 进 next-turn 队列并唤醒，这是普通用户消息；`steer` 进 next-step 队列并唤醒，这是方向盘，想插进下一步；`inject` 进 next-step 队列但不唤醒，这是注入的上下文，等人捎带。

inject 不唤醒这一点有个反常识的意味：**注入的上下文不会主动触发一次模型请求，它排在 inbox 里等，直到另一条消息到来把它一起带上。** 这个设计是有意的：一段新检索到的文档本身不该让 agent 空跑一圈，它要等一个真正的用户输入或事件把它捎上。架构文档对 inbox 行为的原话是，输入通过同一个 inbox 到达驱动器。

inbox 的状态变化通过一组 live 事件广播给 UI 或 SDK：`agent/inbox/spliced`（删除）、`agent/inbox/inserted`（插入了一条消息）、`agent/inbox/claimed`（领走了一条消息，带它属于哪个 turn）。这些是 live 协调事件，不是持久事实。

这条 inbox 模型解释了一个日常现象：你连发两条消息，agent 不是分别处理两条各跑一个 turn，而是把排队的消息一起领进同一个 turn 的某个 step。这是"claim 下一步输入外加一条排队消息"的实际效果，下一段代码里能看到 claim 的位置。

`send()` 里还有一个边角处理：`wakingAfterAbort` 判断一条唤醒输入赶上一个正在被取消的活动，它不能并入那个活动，所以改投到 next-turn 队列，等下一个 turn 再处理。这个判断在插入 inbox 之前完成，避免一个重入的取消回调改写它的归类。

## 一条 turn 的完整骨架

把一个 turn 从开到关的事件列出来，是理解整个运行时最直接的方式。架构文档给了一段流程，这里逐段拆：

```text
turn/start
  领取待处理的下一步输入，外加一条排队的消息
  组装系统提示和工具 schema
  -> agent/pre-step            （waterfall 关卡：拒绝 或 放行(消息)）
     被拒绝，或第一次放行被改写成空 -> 关闭 turn，不消耗 step
     step/start
     把放行的消息作为 user/message 追加
     从日志投影出模型历史
     agent/request -> llm/stream -> assistant/chunk* -> assistant/message
     tool/call* -> 工具执行管线 -> tool/result*
     step/end
     工具结果还要模型再想一步，或下一步输入到了 -> 领取 -> 下一个 step
  -> agent/turn-stopping       （serial 检查点）
turn/end
```

逐段读，每个环节都藏着设计。

领取输入。turn 一开始，驱动器从 inbox 里领两样东西：待处理的"下一步输入"，外加一条排队中的消息。注意是"领取"（claim）不是"读取"，领走意味着从 inbox 移除，这条消息接下来就属于这个 turn。

组装提示和工具。系统提示的各段（身份、人格、工具说明、注入的上下文）和工具 schema 在这里拼好，每一步读的都是插件当下注册的版本。

agent/pre-step 关卡。整个流程最关键的一环，单独一节讲。

进入 step。如果关卡放行，开一个 step，把消息作为 `user/message` 追加进会话，然后从会话日志投影出模型历史。投影是"模型可见即可重建"的落地点：模型这一步看到的全部历史，都是从日志算出来的，不是某个内存变量。

请求模型。`agent/request`（waterfall）构造发给模型的请求，`llm/stream`（waterfall）实际发起流式请求，模型逐块返回，每块产生一个 `assistant/chunk`，最后归总成一个 `assistant/message`。

工具调用。如果模型在这一步调了工具，产生 `tool/call`，进入工具执行管线，产出 `tool/result`。工具部分有自己的复杂度（执行模式、有界滚动池、单调守卫），这里只要知道它夹在 `assistant/message` 和下一个判断之间。

是否再来一个 step。一个 step 结束后，驱动器判断：工具结果是否还需要模型再想一步，或者 inbox 里又来了新的下一步输入。是的话，领取新输入，回到 agent/pre-step，开下一个 step。

收尾。当自然停下且下一步 inbox 为空，过一道 `agent/turn-stopping` 检查点，然后 `turn/end` 关闭 turn。

## 落到代码：kick → turn → step

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

`turn()` 是一条 turn 的完整骨架，正好和上面那段事件流程逐行对上：

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

逐段对应：`turn/start` 开 turn 记号；循环里每个 step 先过 `preStep`（领取输入加守门人，下一节展开）；拒绝则 turn 以 `blocked` 结束，第一个 step 的消息被改写成空则以 `completed` 结束，这两条就是"零 step 的 turn"在代码里的落点，而且 `turn/end` 永远写一条，带上结束原因；否则 `step/start`、追加 `user/message`、跑 `step()`、`step/end`；每跑完一个 step 判断自然停下且 next-step 队列空，就过 `agent/turn-stopping` 这个 serial 检查点再 break；最后 inbox 还有货就换一个新的 AbortController、重置 step 计数，返回 true 让 `kick` 再跑一个 turn。

注意 `max-tokens` 是"粘"的：注释里写明，一旦某个 step 撞了输出上限，后面正常完成的 step 不能把 turn 结果降级回 completed。所以判断是 `turnEnds === null || turnEnds.kind !== 'max-tokens'` 才接受新的 step 结果。

## 守门人：agent/pre-step 与 preStep()

整个 turn 流程里，`agent/pre-step` 是控制力最强的一道关卡。它是一个 waterfall 事件，每一步请求模型之前都会过。领取输入和过守门人，都在 `preStep` 里：

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

`claim` 按目标从对应队列领走一批消息：turn 开始时 target 是 `next-turn`，会领 next-step 输入外加一条 next-turn 提示（就是骨架里"claim 下一步输入外加一条排队消息"那行）；step 之间 target 是 `next-step`，只领 next-step 输入。然后组装系统提示、投影运行时上下文，最后过 `agent/pre-step` waterfall。默认放行（enter），如果运行时上下文非空，放行的消息是 `[...claimed, context]`，把上下文作为额外消息带上。每个 `signal.throwIfAborted()` 都在关键 await 之后检查取消，保证取消能及时生效。

守门人的权力有两个。拒绝：一个监听器可以决定不让这一步发生，被拒绝的 turn 已从 inbox 领走的批次保持移除状态，一个 step 都不消耗就关闭，对应代码里的 `blocked` 路径。改写放行的消息：监听器可以改写模型这一步看到的消息，架构文档强调这个返回的决定是权威的（authoritative）。

这里有条和 waterfall 纪律一致的铁律：一个只是观察或注解的监听器，包了 `next()` 就必须保留下游消息，除非它故意要替换。不调 `next()` 就是短路，调了就要么原样传递要么明确替换。方向盘（steering）和注入的上下文走的也是这道 waterfall，只不过是在后续某次 claim 领到它们那批消息之后才过。

为什么把"模型看见什么"的决策权交给一个 waterfall 事件，而不是写死在驱动器里？这层因果是我的归纳，文档没有直接这么说，但机制摆在那里：压缩插件在这里探上下文压力，权限插件在这里改写可见的工具，自定义审批逻辑在这里拦截。守门人是插件可挂载的扩展点，不是硬编码的 if。

## 一次模型请求：step() 与 deriveMessages()

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

几个要点，每一条都值得停下来看：

- `this.session.deriveMessages()` 是请求的真相来源。每一步模型看到的历史，都是从会话日志现算出来的，不是某个内存变量。这是"模型可见即可重建"在代码里的落点。
- 流式逐块记日志。每个 `assistant/chunk` 都进日志并记下 seq，最后 `assistant/message` 用 `sourceEventSeqs: chunkSeqs` 把它依赖的 chunk 串起来。文档特别说明，`assistant/message` 记录每一次成功的 provider 调用，包括没有内容的和 `max-tokens` 截断的结束；空内容不进投影历史（避免噪音），但持久事件保留它的 usage 和 `sourceEventSeqs`，即使是个空列表。原始 chunk 保真保留，用于回放和 UI。这种"投影干净、原始保真"的双层设计，是会话日志那套机制的核心。
- 失败走 `agent/request-error` waterfall。错误或被中止的 finish，过这个 waterfall 请求恢复动作，只有返回 `{ kind: 'retry' }` 才 `continue` 重试，否则抛出 `LlmError`。
- 工具结果可以产生额外上下文。`executeToolCalls` 的最后一个参数是个 acceptor：工具返回的 `additionalContexts` 被 splice 进 next-step 队列，等下一步带给模型。
- concluded 短路。如果某次工具结果带 `concludesTurn`，step 直接返回 completed，turn 收尾。

## 请求的冻结与记账：agent/request 与 request/header

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

`agent/request` waterfall 让插件有机会改写请求配置（默认是 seedConfig）。然后 `ctx.llm.prepareCall()` 校验 adapter 字段、物化 reasoning-effort 和 output-token 默认值。返回的 `preparedCall` 绑定了解析默认值的那个 adapter 注册，跨异步解析、header 记账、最终派发都保持同一个 adapter，所以 HMR 换掉一个 provider 的时刻，不会把旧 adapter 的能力结果混进新 adapter 的请求。

请求头按需记账：第一次写 `initial`（或恢复时写 `resume`），之后只在 header 变了时写 `change`。这个 header 是请求前缀的规范记录，也是 KV cache 复用判断的依据（那条"字节相同且路由没变即可复用"的完整记账规则，见 09 篇）。

`seedConfig` 里有个细节叫 adapter-default marker：上一步从 header 里标记了哪些字段是 adapter 算出来的默认值，`requestProposal()` 在下一次提议前把这些标记字段删掉，让当前路由重新算自己的默认值；没标记的显式设置跨 step 和路由变更保留。这保证换路由不会带错上一路由的默认值。

## 工具调度：barrier 与有界滚动池

`step` 里的 `executeToolCalls` 在 `tool-calls.ts`，它调度一个 step 内的工具调用。核心规则在文件顶部注释里写明：排他调用构成 barrier，并行调用用有界滚动池，且在启动前重新分类。

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

第一个调用的模式决定这一组怎么跑：排他调用单独成一个 barrier，并行调用把后面所有调用整批放一起。`runGroup` 里管一个有界滚动池，并行度上限是 `maxParallelToolCalls`（默认 10，1 就是串行）。关键纪律有三条。

重新分类。并行组里，每启动下一个调用前都重新读它的模式：

```ts
if (nextToStart > 0 && mode === 'parallel'
  && ctx.tools.executionMode(nextCall.exec).kind !== 'parallel') break
```

注册表可能在途中变化，把一个原本并行的调用变成排他的，这时就停下，让排他调用作为下一个 barrier 等当前池排空再跑。

结果按模型顺序提交。`commitReady` 只在连续的、按模型给出顺序的 slot 就绪时往前推进：

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

调度可以并发（dispatch/body 重叠），但策略、持久结果、结果上下文保持模型顺序。工具可以乱序完成，但落进日志的结果和给模型看的顺序，还是模型给出的顺序。

取消合成结果。如果 signal 被中止，已启动的调用排空并提交，没启动的调用每个补一对 `tool/call` + `tool/result`，错误码 `ABORTED_BEFORE_DISPATCH`，结果文本 "Error: tool call aborted before dispatch"。这样重放时历史一致，不会因为取消而缺结果。

## 收尾：turn-stopping 检查点

一个 turn 何时关闭？流程给的条件是"什么都不欠"（nothing is owed）。落到代码上，就是 `turn()` 里那两行：自然停下（`turnEnds` 非空）且 next-step 队列空时，`await this.dispatch.serial('agent/turn-stopping', ...)`，然后 break。

这个事件和前面的 waterfall 不一样：它是 serial 模式，而且没有 `next()`。架构文档明确，`agent/pre-step`、`agent/request`、`llm/stream` 和三个 `tools/*` 事件都是 waterfall（监听器必须调 `next()` 委托），而 `agent/turn-stopping` 是 serial 且没有 `next()`。串行、无委托，意味着它是一个纯粹的"收尾时让监听器按顺序看一眼并表态"的检查点，不是层层包裹的中间件。一个监听器可以在这里影响 turn 是否真的停（比如宣布还有事要做），但不能像 waterfall 那样改写一个会向下传的值。turn-stopping 之后就是 `turn/end`，turn 正式关闭，驱动器回到 idle。

## 压缩不在模型手里：maintenance 与被动触发

顺着 pre-step 往下，有个设计特别能纠正常见误解。很多人以为 agent 上下文太长时，是模型自己决定调一个"压缩"或"总结"工具来收缩上下文。dsh 不是这样，它没有面向模型的 compact 工具。压缩不是模型主动决定的，而是一个被动的事件驱动机制：

- 压缩插件在 `agent/pre-step` 里，在请求投影出来之前，探上下文压力。
- 它只在 `agent/request-error` 报出"规范的上下文溢出"时才介入。

两条触发里任一条满足，可选的工具结果裁剪先跑，然后再做摘要选择。恢复发生在"已关闭的失败 step 和失败 turn 关闭"之间；只有当裁剪或摘要确实推进了替换的代次，才会开一个新的重试 turn，否则原始的请求错误保持权威。

驱动器侧怎么承载压缩？就是三态里的 maintenance：做不需要模型的工作时独占驱动器，不能同时跑 turn。对外 status 上 maintenance 算 idle，UI 看不到一次内部的收缩动作，只看到 agent 空闲片刻后继续。

这个设计的含义，我的归纳是：上下文管理是 harness 的职责，不是模型的职责。模型不知道自己的上下文快爆了，是 harness 的插件在守门人关卡和错误回调里感知到压力，主动收缩。这和把模型当 CPU、把 harness 当操作系统的那条主线一致：内存回收是操作系统的活，不是 CPU 的活。

## 失败和取消：在哪一层兜住

读完主干，回头看失败和取消的边界，这是驱动器最硬的部分。

插件失败只结束当前 turn，不结束 loop。包 README 的原话：最终 adapter 选择、派发、迭代失败以 terminal error 或 aborted finish 从 `ctx.llm` 进来，进 `agent/request-error`；中间件、结果处理、工具和其他扩展失败仍然抛出，直接关闭 turn。一个处理监听器返回 `{ kind: 'retry' }` 就重试，没处理的失败是 terminal。

取消走一个信号。`cancel()` 清掉 inbox（除非 `keepInbox`），协作地 abort 当前 turn 的信号：

```ts
cancel(cause: AgentCancelCause, options: CancelOptions = {}): void {
  if (!options.keepInbox) {
    this.inbox.clear()
    if (this.phase.kind !== 'idle') this.phase.wakeRequested = false
  }
  if (this.phase.kind !== 'idle') this.phase.abort.abort(cause)
}
```

idle 时的取消是个 no-op。`turn()` 检测到 `signal.aborted`，把 turnEnds 记成 `{ kind: 'aborted', reason }`，`turn/end` 仍然写一条。取消原因改变的是报告，不是结果上下文怎么 finalize。

唤醒锁存。一条唤醒输入在 abort 之后但活动还没收敛到 idle 时到达，会被 `wakeRequested` 锁存，在驱动器自己的收敛边界 replay，不需要再发一次唤醒。但 `disposed` 类型的取消从不锁存，保证 teardown 不会等一个模型 turn。这条竞态合约是源码里大段注释专门处理的。

## 两个事件域：durable 与 live

读到这里你会发现，turn 流程里的事件分成了两类，架构文档给它们划了明确的界：

- 持久会话事件：`turn/*`、`step/*`、`user/message`、`assistant/*`、`tool/*`。这些是追加进日志的事实，通过 `session/event` 广播，要能在重载后存活，是重建会话的依据。
- live agent 事件：`agent/*`，带着一个活着的 Agent 对象，负责 inbox、step、status、request、validation、continuation，用来观察或拦截在飞的工作。

为什么分开？因为它们解决两个不同的问题。持久事件回答"发生了什么"，是重建和审计的来源；live 事件回答"现在在干什么、能不能插手"，是协调和拦截的入口。

文档对 SDK 用户有一条明确建议：需要可回放的转录数据，消费 `session/event`；`agent/*` 是用于队列、状态、提示拦截、请求构造、方向盘、续作和错误的 live 协调 API。混淆两者是常见错误：有人想从 `agent/*` 重建历史，但 live 事件不保证持久，重建要用 session 事件。

这条区分也解释了"零 step 的 turn 仍记进日志"：一次被拦下的请求，作为 live 协调它没产生 step，但作为一次"尝试过"的事实，它要落一条持久记录，所以 `turn/start` 和 `turn/end` 这些持久事件照样发生，你在代码里也看到了 `turn/end` 是无条件写的。

## 这套驱动器的设计要点

把概念和代码压成几条要记住的设计：

**每一步的请求都从日志现算。** `deriveMessages()` 在每个 step 调一次，模型历史永远是日志的投影，不是缓存。

**并发调度，顺序提交。** 工具可以并行跑（有界滚动池，默认上限 10），但结果和上下文按模型顺序落日志。

**adapter 默认值带标记。** 标记的默认值每次重新算，没标记的显式设置保留，换路由不串味。

**turn-stopping 是 serial 无 next()。** 和 pre-step/request 的 waterfall 不同，它是纯粹的收尾检查点。

**失败在驱动器边界兜住。** `kick` 的 try/catch 吞掉一切，单个 turn 的失败不杀死整个 loop。

**取消用合成结果保持重放一致。** 没分发的工具调用补 `ABORTED_BEFORE_DISPATCH`，历史不缺。

**phase 是单一状态机。** idle/maintenance/running 三态管理所有并发，`wakeRequested` 处理忙时唤醒，`disposed` 取消不锁存。

## 结论

dsh 用 turn 和 step 两个时间单位组织对话：turn 在第一条输入被领取前打开、在什么都不欠时关闭，由零到若干个 step 组成；step 是一次模型请求加它调用的工具。驱动这一切的是 `dsh-agent-loop`，harness 里唯一装着具体循环逻辑的包：`AgentLoop` 注册成工厂，私有驱动器 `ReactLoopAgent` 用三态状态机跑 `kick → turn → step` 循环。每一步先 claim inbox、过 `agent/pre-step` 守门人（可拒绝、可改写，零 step 的 turn 也持久关闭），再用 `deriveMessages()` 从日志现算请求，过 `agent/request` 组装、`prepareCall` 绑定 adapter，流式记 `assistant/chunk` 并归总成 `assistant/message`；工具走 barrier 与有界滚动池调度，乱序完成、按模型顺序提交；压缩不靠模型，靠插件在 pre-step 探压和 request-error 溢出时被动触发，跑在独占的 maintenance 状态里。失败在驱动器边界兜住，取消用合成结果保持重放一致，事件分成 durable 和 live 两个域，前者重建、后者协调。拿着 `agent.ts`、`tool-calls.ts`、`index.ts` 三个文件，你可以从一条用户消息一路追到一次工具结果落进日志。

## 延伸阅读

- [架构文档：Turn flow](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：turn/step 定义与完整流程的权威来源
- [agent-loop 包 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md)：驱动器服务契约与 loop 生命周期总述
- [驱动器核心源码（src/agent.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/agent.ts)：ReactLoopAgent 三状态机与 kick/turn/step
- [工具调度源码（src/tool-calls.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/tool-calls.ts)：barrier 与有界滚动池
- [工厂与生命周期源码（src/index.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/src/index.ts)：AgentLoop 工厂与 create/resume/teardown
- [Agent Turn And Step Lifecycle 序列图](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/agent-lifecycle.md)：官方生成的 Mermaid 序列
- [事件生产者/消费者图](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/event-producer-consumer.md)：每个事件的生产者与消费者
- [Cordis Primer：Waterfall 语义](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)：agent/pre-step 等 waterfall 事件的 next() 纪律来源
- [工具执行管线文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-execution-pipeline.md)：tool/call 到 tool/result 之间发生的事
- [会话日志子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md)：deriveMessages 与"模型可见即可重建"

上一篇：[启动链源码导读：从 npx dsh web 到插件树挂载](./06-boot-chain-source-walkthrough.md)
下一篇：[会话日志：为什么"模型可见即可重建"是最硬的规矩](./09-session-log-visible-means-reconstructable.md)
