# session 包源码导读：append-only log / fork / resume

> 如果这一篇你只能带走一句话，带走这句：`dsh-session` 包把会话日志做成了一个普通类（不是 Service），append 走两道关（先 JSON 校验兼快照、再 surface 校验先验后提交），消息历史由一个逐节点的纯函数投影出来，崩溃时由一个确定性的扫描器补齐打开的 turn。
> 这一篇是源码导读，沿着上一篇讲的"只追加日志、可重建"模型，落到 `packages/core/session` 的真实代码。读完你能拿着 `surface.ts`、`json.ts`、`repair.ts` 三个文件，看清一次 append 怎么进日志、消息怎么被投影、崩溃后日志怎么被补齐。

## 这个包的形态：Session 是普通类，不是 Service

先定位 `Session` 本身。它是一个**普通类（plain class），不是 Cordis 的 Service**。这一点决定了它的创建路径：

- 活的实例通过 `ctx.sessions.create()` 创建，由调用它的 fiber 拥有。
- 离散实例通过静态方法 `Session.create(id, seed?, header?)`（种下/分叉）或 `Session.fromRestore(id, seed, header)`（从持久化恢复）创建。

为什么是普通类？因为会话日志要能被 web 客户端、持久化后端、测试等非 Cordis 环境消费，把它做成 Service 会把这些环境绑死在框架上。整个 surface 子路径（`@deepseek-ai/dsh-session/surface`）还专门保持 browser-safe，不引入任何 `node:` 模块，否则会打断 vite 打包。

`Session` 的几个核心访问器：

- `events`：返回 append-only 日志的不可变快照。这个快照会被复用到下一次 append 为止，之前返回的数组不会再增长。事件和它们的嵌套数据在接收时就深冻结，所以无论是类型断言还是普通 JavaScript 都改不了持久历史。
- `seq`：下一条事件的序号，永远等于日志长度（`seq = log.length` 连续性契约）。
- `firstLiveSeq`：本进程追加的第一条事件 seq（没有 seed 就是 0）。

`append` 是日志的唯一写入口。它走两道关：第一道是 JSON 校验兼快照，第二道是 surface 校验。下面分别看。

## append 第一道关：JSON 校验兼快照（json.ts）

文档里说 append "一次递归同时读、校验、拷贝每个嵌套值"。这个机制在 `json.ts`。核心是 `snapshotJsonValue` / `isJsonValue`：

```ts
/** 校验并在一次读取里 detach 出无损 JSON 快照。 */
export function snapshotJsonValue<T>(value: T): T | undefined {
  return walkJsonValue(value, true) as T | undefined
}
```

它把候选值走一遍，既校验又（可选地）物化出一份脱离原对象的快照。关键设计有三条。

**一次读取，校验和拷贝不分离。** 走的时候每个属性只读一次，校验通过的同时就把值写进快照。这意味着一个有状态的 getter 没法给校验喂一个值、给存储喂另一个值，因为值在一次遍历里就读定、拷贝定了。这是"日志是唯一真相源"在拷贝层面的落实。

**迭代而非递归。** 遍历用一个显式的任务栈（`tasks`），不是递归调用。所以合法的嵌套深度受可用内存限制，不受 JavaScript 调用栈限制。深度很大的合法结构不会被栈溢出误杀。

**realm 安全的原型检查。** 它不只看类型，还检查对象的原型是不是真·原生 `Object.prototype` 或 `Array.prototype`。`hasIntrinsicConstructor` 用 `Function.prototype.toString.call(constructor) === 'function Array() { [native code] }'` 验证构造器是原生的，防止伪造原型或子类（Map/Set/Date/类实例）混进来。跨 realm（多个 iframe 或 vm 上下文）也成立。

拒绝的值很明确：稀疏数组、循环引用、奇异对象（Map/Set/Date/类实例）、负零、非有限数。这些一旦放进去，JSON 往返就会失真，破坏"持久化无损"的契约。一个坏事件在这里就死，进不了日志，后端永远不会遇到它。

## append 第二道关：surface 校验，先验后提交（surface.ts）

通过 JSON 校验后，surface 事件还要过一层 surface 校验。`surface.ts` 用一个"先验后提交"（validate-then-commit）的模式：

```ts
function planSurfaceEvent(state, event, expectedSeq, events, baseSeq): SurfacePlan | undefined {
  if (event.seq !== expectedSeq) {
    throw new Error(`session event seq ${event.seq} is not contiguous; expected ${expectedSeq}`)
  }
  const surfaceOp = surfaceOpOf(event)
  if (surfaceOp === undefined) return
  if (surfaceOp === 'append') {
    assertProvenance(event, [])
    return { kind: 'append', seq: event.seq }
  }
  const range = replacementRange(state, surfaceOp)
  assertProvenance(event, range.shadowedSeqs)
  assertToolResultRewrite(event, range.shadowedSeqs, events, baseSeq)
  return { kind: 'replace', seq: event.seq, start: surfaceOp.start, end: surfaceOp.end, ...range }
}
```

`planSurfaceEvent` 把校验全做完，返回一个还没改动状态的"计划"（`SurfacePlan`），再由 `applySurfacePlan` 提交。先验后提交保证：校验失败时状态没被改坏，一次 append 要么完整生效要么完全不变。

校验查几件事：

**seq 连续。** `event.seq !== expectedSeq` 就抛错。seq 必须紧接日志末尾。

**surfaceOp 合法性。** `surfaceOpOf` 检查：surface 合格的事件类型（user/message、assistant/message、tool/result）必须带 surfaceOp；非 surface 类型禁止带 surfaceOp 或 sourceEventSeqs。乱带就抛错。

**来源证明（provenance）。** `assertProvenance` 检查 `sourceEventSeqs`：必须是数组，除了 assistant/message 不能为空，不能有重复，必须引用更早的事件（不能引用自己或之后的），而且如果是 replace，必须覆盖每一个被遮蔽的 surface 节点。这条最硬：一个 replace 想遮蔽哪些节点，就必须在 sourceEventSeqs 里把它们全列出来，少一个都不行。

**replace 范围。** `replacementRange` 要求 start 和 end 都在当前 surface 里能找到，且 start 不在 end 之后。

**tool/result 重写限制。** `assertToolResultRewrite` 限制 tool/result 的 replace 只能改写恰好一个当前节点，而且只能改 content（其他字段必须和原节点深相等）。这防止一次工具结果重写偷偷改了别的语义。

## 投影规则：deriveEventMessage

把日志投影成消息的，是一个逐节点的纯函数 `deriveEventMessage`，它是整个"可重建"的算子：

```ts
export function deriveEventMessage(event: SessionEvent): Message | null {
  switch (event.type) {
    case 'user/message': {
      return event.data
    }
    case 'assistant/message': {
      if (event.data.message.content.length === 0) return null   // 空内容跳过
      return event.data.message
    }
    case 'tool/result': {
      return event.data.message
    }
    default:
      return null   // 非 surface 事件不投影；合并扩展，无 assertNever
    }
  }
}
```

几条规则对应上一篇讲过的：user/message 原样投影；assistant/message 空内容跳过（它只是挂 usage 的壳）；tool/result 投影成消息；其他事件（turn/step 边界、chunk、log-only 记录）投影成 null。

两个细节值得记住。第一，这个 switch **故意不穷尽**，没有 `assertNever`。因为 `SessionEventMap` 是合并扩展的，插件能加新事件类型，一个插件加的变体是合法的未知值。第二，注释里专门强调：**不要在这里给注入内容重新加类型框架**（比如包一层 `<context>`）。框架是调用者负责的，投影是原样透传。一个生产者要把框架烤进 content（像 agent-instructions 包 `<system-reminder>` 那样），而不是让投影去加。这保证投影是一个纯净的透传算子。

这个函数被公开出来，是个刻意的决定：外部重建器和 dev 不变量伴生模块，用完全相同的规则投影一个日志前缀，和缓存算出来的消息不会对不上。

## 增量投影：SurfaceManager

`deriveMessages` 不每次都从头算。它用一个 `SurfaceManager` 维护增量视图：

```ts
export class SurfaceManager implements SessionSurface {
  private _state = createFoldState()   // { nodes: number[], replaceGeneration: number }
  private _lastProcessedSeq: number
  private _pendingPlan: { event; expectedSeq; plan } | undefined

  validateNext(event: SessionEvent): void {
    // ... 在不改动已提交 surface 的前提下，校验下一条候选事件
    this._pendingPlan = { event, expectedSeq, plan: planSurfaceEvent(...) }
  }

  get nodes(): readonly number[] {
    if (this._lastProcessedSeq < this.baseSeq + this.log.length - 1) this._processDelta()
    return this._state.nodes
  }
}
```

它持有 fold 状态（`nodes` 是当前 surface 的事件 seq 序列，`replaceGeneration` 是已提交的位置替换计数），但不保留替换历史。`nodes` 和 `replaceGeneration` 在访问时懒Fold新追加的事件（`_processDelta`）。

`validateNext` 是个关键方法：它在**不改动已提交 surface** 的前提下校验下一条候选事件，把计划暂存。这样 Session 的 append 能在校验通过后才让事件进日志，进日志后 SurfaceManager 的 `_processDelta` 会发现这条事件和暂存的计划对得上，直接复用已校验的计划，不重算。每个 surface 节点只在第一次见到时投影一次，之后的 `deriveMessages` 只算新增节点；只有 replace 重写（`replaceGeneration` 变化）时才重建。

`foldSurface(events)` 是完整重放的版本：从头走一遍 canonical surface fold，返回当前 nodes 和替换历史。它给那些只有存储字节、没有活对象的消费者用（比如持久化加载后重建）。

## 崩溃修复：interruptedTurnClosers（repair.ts）

会话崩在一个打开的 turn 中间怎么办？`repair.ts` 的 `interruptedTurnClosers` 解决这个。它扫描加载进来的持久化日志，返回需要追加的合成关闭事件：

```ts
export function interruptedTurnClosers(events: readonly SessionEvent[]): SessionEvent[] {
  let openTurn: number | null = null
  let openStep: number | null = null
  const pendingCalls = new Map<CallId, { step: number; callSeq?: number }>()
  for (const event of events) {
    switch (event.type) {
      case 'turn/start': openTurn = event.data.turn; openStep = null; pendingCalls.clear(); break
      case 'turn/end':   openTurn = null; openStep = null; pendingCalls.clear(); break
      case 'step/start': openStep = event.data.step; break
      case 'step/end':   pendingCalls.clear(); openStep = null; break
      case 'assistant/message':
        for (const block of event.data.message.content) {
          if (block.type === 'tool-call') pendingCalls.set(block.id, { step: event.data.step })
        }
        break
      case 'tool/call': { const entry = pendingCalls.get(event.data.callId); if (entry) entry.callSeq = event.seq; break }
      case 'tool/result': pendingCalls.delete(event.data.message.source.callId); break
      default: break
    }
  }
  const last = events.at(-1)
  if (openTurn === null || last === undefined) return []   // 平衡日志，无需补齐
  // ... 给未匹配的 call 补合成 tool/result，再补 step/end、turn/end
}
```

它用一个游标扫整条日志，追踪当前打开的 turn/step 和还没匹配到结果的工具调用（`pendingCalls`）。注意每次 turn 边界都清空 `pendingCalls`，防止更早 turn 的调用泄漏到尾部修复里。

如果扫完发现 turn 是闭合的（`openTurn === null`），返回空数组，日志本来就平衡。如果有一个打开的 turn，就生成合成事件：

**未匹配的工具调用补合成结果。** 两种情况分开处理，而且文本是精心写的：

- 调用已记录开始（有 `callSeq`）但没有持久化结果：错误码 `TOOL_OUTCOME_UNKNOWN`。文本明确警告副作用："工具调用在记录后被中断，但没有持久化结果，结果未知。判断是否重试：仅当操作是只读或幂等的才重试；如果有副作用，先核实外部状态或问用户。不要盲目重试。"
- 调用根本没到记录开始：错误码 `TOOL_NOT_STARTED`，文本是"如果仍需要就重试它"。

这两种区分是刻意的：一个可能已经执行了一半的调用（副作用未知）和一个根本没开始的调用，重试策略完全不同。修复器把这个区别做进了合成结果的文本和错误码里，让模型在 resume 后能做出正确判断。

**然后补边界。** 如果有打开的 step，补一条 `step/end`（一个 step 还开着就结束 turn 是不变量违反，必须先补 step 再补 turn）；最后补一条 `turn/end`，reason 是 `{ kind: 'interrupted' }`。这就是那个"没有任何 loop 会发射"的 `interrupted` 结束原因，只有崩溃恢复会合成它。

seq 接着日志末尾续，时间戳复用最后一条真实事件的时间。复用时间戳是为了确定性，不臆造一个"未来"时间。

## fork 和 resume：基于同一套投影

有了上面的地基，fork 和 resume 就顺理成章。

**fork。** `SessionStore.fork(source, boundary?, childSessionId?)` 做的事，在 README 里写得很精确：接受一个活的 Session 或 session id，选源事件到一个包含的 `boundary` seq 为止（默认是最后一条），要求选出来的前缀**结束在一个 turn 之外**，然后创建一个活的子会话，seed 是深拷贝的源事件前缀，带上子会话元数据（`parentSession`、`seedLength`、继承的 `cwd`）。

关键的拒绝而非裁剪：如果前缀结束在一个打开的 turn 中间，fork 抛错，不默默裁剪。文档解释，更宽的执行关系健全性归 `dsh-invariants` 插件管，不在 fork 里重复。fork 能这么干净，恰恰因为消息历史是日志的纯投影，深拷贝一段前缀当 seed，重建出的子会话和源前缀投影一模一样。

**resume。** `Session.fromRestore(id, seed, header)` 接管新鲜的持久化值：存储格式、事件信封、seq 连续性、surface 转换、header 字段都在接管的对象冻结前校验一遍。恢复后，turn 编号和派生历史从加载的日志接着算。`firstLiveSeq` 指向构造 seed 之后的位置，构造后紧接着追加一条 `session/end-seed` 标记 live 写入的起点。崩溃留下的的打开 turn 由前面的 `interruptedTurnClosers` 在加载边界补齐，保证 resume 出来的转录是 provider 合法的。

## SessionStore 的三段式发布：prepare / enter / announce

会话进 store 不是一步。`SessionStore` 把发布拆成 `prepare` / `enter` / `announce` 三步，文档专门解释了为什么拆：

```ts
prepare(id?, options?): Session   // 校验 id/cwd，构造 Session，但不进 store
enter(session): () => void        // 进 store，装发布钩子，返回 detach disposer
announce(session): void           // 发 session/created
```

为什么不让 `create` 一步到位？因为 agent 工厂要把会话生命周期折进**一个** `ctx.effect`，这样 fiber 卸载时按顺序拆掉 session 加 agent，而不是两个竞速的兄弟 effect 各拆各的。如果用两个 effect，可能先把发布钩子拆了，驱动器最后的关闭事件还没提交，事件就丢了。

所以模式是：调用者在自己的 effect 里先 `prepare`，把 `enter` 返回的 detach disposer 让给这个 effect，然后再 `announce`。这样 `session/created` 的同步抛出能把 attach 回滚而不是泄漏（先 yield disposer 再 announce，正是为了回滚安全）。`enter` 还会复查 id 是否重复，因为 prepare 和 enter 是公开的跨包原语，调用者可能在两步之间做别的（或再来一次 create），一个陈旧的 prepared session 不能覆盖同 id 的活 entry。

`flush(session)` 是唯一的持久化屏障入口，发 `session/flush` 给持久化监听者。文档强调：所有要触发持久化检查点的调用者（检查点策略、目标回合驱动、teardown 排空、读存储前自己 flush 的消费者）都必须走这里，而不是自己 dispatch 一个 `ctx.parallel('session/flush', ...)`。一个 owner，一种写法，scoped-dispatch 不变量能把它钉住。

## 这套实现的几个要点

**Session 是普通类，不是 Service。** 让日志能被非 Cordis 环境消费，surface 子路径保持 browser-safe。

**一次遍历同时校验和拷贝。** JSON 校验兼快照，每个属性只读一次，有状态 getter 没法在验证和存储之间做手脚。

**surface 先验后提交。** 校验全部通过才提交，append 原子生效。replace 必须在 sourceEventSeqs 里覆盖每一个被遮蔽的节点。

**投影是逐节点纯函数。** 故意不穷尽，合并扩展友好；不加类型框架，原样透传。

**崩溃修复确定性且区分副作用。** 已开始的调用补 "结果未知、别盲目重试"，没开始的补 "需要就重试"；时间戳复用最后的真实时间。

**fork 拒绝不裁剪。** 前缀结束在打开 turn 里就抛错，不默默裁剪。

**发布三段式。** prepare/enter/announce 把生命周期折进一个有序 effect，避免关闭事件丢失。

## 结论

`dsh-session` 把会话做成一个普通类，日志是只追加的事件序列。append 走两道关：JSON 校验兼快照（一次遍历、迭代、realm 安全、拒绝奇异值），surface 校验（先验后提交、seq 连续、provenance 覆盖被遮蔽节点、tool/result 重写只改 content）。消息历史由逐节点纯函数 `deriveEventMessage` 投影，故意不穷尽、原样透传，增量视图由 `SurfaceManager` 维护。崩溃时 `interruptedTurnClosers` 扫描日志、给未匹配调用补合成结果（区分副作用）、补 step/end 和 interrupted 的 turn/end。fork 基于同一套投影深拷贝前缀、拒绝结束在打开 turn 的前缀。发布拆成 prepare/enter/announce，把生命周期折进一个有序 effect。这套实现把上一篇的可重建模型，落成了有边界、有校验、能自愈的真实代码。

## 时点与诚实声明

本文基于 2026-08-14 的 `deepseek-ai/deepseek-harness` 仓库源码：`packages/core/session/src/surface.ts`、`packages/core/session/src/json.ts`、`packages/core/session/src/repair.ts`、该包 README 与 `docs/subsystems/session.md`。文中代码片段从上述源码裁剪保留关键控制流，函数名（`deriveEventMessage`、`SurfaceManager`、`foldSurface`、`planSurfaceEvent`/`applySurfacePlan`、`snapshotJsonValue`/`isJsonValue`、`interruptedTurnClosers`）、校验规则（seq 连续、provenance 覆盖、tool/result 只改 content、JSON 拒绝稀疏/循环/奇异/负零/非有限）、崩溃修复两态（`TOOL_OUTCOME_UNKNOWN` / `TOOL_NOT_STARTED`）与 `interrupted` turn/end、SessionStore 的 `prepare`/`enter`/`announce`/`flush`/`fork` 语义，均为源码与文档陈述的可核实事实。

`dsh` 处于 developer preview，类结构、方法签名、事件字段会随重构变。文中代码为可读性做了行级裁剪与变量省略（如 `walkJsonValue` 的任务栈细节、`SurfaceManager._processDelta` 的完整逻辑），`Session.append` 的发布钩子编排、`SessionStore.fork` 的 store 入库实现以仓库 `src/index.ts` 实际源码为准。文中"一次遍历同时校验拷贝防止有状态 getter 做手脚""fork 能干净是因为消息是日志纯投影"属对源码设计意图的分析判断，部分依据源码注释。

## 延伸阅读

- [session 包 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/README.md)：Session 模型与 API 总述
- [surface 投影源码（src/surface.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/src/surface.ts)：deriveEventMessage 与 SurfaceManager
- [JSON 校验源码（src/json.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/src/json.ts)：snapshotJsonValue 一次遍历校验兼快照
- [崩溃修复源码（src/repair.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/src/repair.ts)：interruptedTurnClosers
- [会话日志子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md)：SessionEventMap 与可重建契约
- [持久化子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/persistence.md)：会话日志如何被做持久

上一篇：[会话日志：为什么"模型可见即可重建"是最硬的规矩](./09-session-log-visible-means-reconstructable.md)
下一篇：[事件系统：四种派发模式与 waterfall 的短路艺术](./11-event-system-four-dispatch-modes.md)
