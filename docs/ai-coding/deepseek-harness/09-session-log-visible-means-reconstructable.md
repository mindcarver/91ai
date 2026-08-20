# 会话日志：为什么"模型可见即可重建"是最硬的规矩

> 如果这一篇你只能带走一句话，带走这句：DeepSeek Harness 的一个会话是一条只追加的事件日志，模型看到的消息历史永远是从这条日志投影出来的、从不单独存储，而"任何到达模型请求的东西都必须能从日志重建"是一条有运行时断言盯着的硬规矩。
> 这一篇先拆会话日志的心智模型：日志里有什么、消息历史怎么从它投影出来、为什么请求本身也是日志状态、那条"可重建"的规矩怎么被强制、fork 怎么在它上面成立；然后落到 `packages/core/session` 的源码，看清一次 append 怎么进日志、消息怎么被投影、崩溃后日志怎么被补齐。

## 一句话模型：会话是一条只追加的事件日志

先把模型立起来。DeepSeek Harness 里一个 `Session`，本质是一个**只追加的事件日志（append-only log）**：一个 agent 从生到死的全部交互，都被记成一条条有类型的事件（`SessionEvent`），按顺序追加。这条日志是唯一真相源（single source of truth）。

关键的一点来了：**模型看到的消息历史，是从这条日志投影出来的，从不单独存储。** 你在 UI 上看到的对话、发给模型的 messages 数组、回放出来的转录，全都是把这条日志按一套规则重新算出来的结果。重放一个会话，就是把同样的事件再投影一遍。

这和"把消息存进一个数组、每次往数组里 push"的直觉完全不同。在那里，存储的就是消息本身；在这里，存储的是事件，消息是事件的派生视图。这个区别是整套会话设计的根基，后面所有的规矩都从它长出来。

## Session 是普通类，不是 Service

先定位 `Session` 本身。它是一个**普通类（plain class），不是 Cordis 的 Service**。这一点决定了它的创建路径：

- 活的实例通过 `ctx.sessions.create()` 创建，由调用它的 fiber 拥有。
- 离散实例通过静态方法 `Session.create(id, seed?, header?)`（种下/分叉）或 `Session.fromRestore(id, seed, header)`（从持久化恢复）创建。

为什么是普通类？因为会话日志要能被 web 客户端、持久化后端、测试等非 Cordis 环境消费，把它做成 Service 会把这些环境绑死在框架上。整个 surface 子路径（`@deepseek-ai/dsh-session/surface`）还专门保持 browser-safe，不引入任何 `node:` 模块，否则会打断 vite 打包。

`Session` 的几个核心访问器：

- `events`：返回 append-only 日志的不可变快照。这个快照会被复用到下一次 append 为止，之前返回的数组不会再增长。事件和它们的嵌套数据在接收时就深冻结，所以无论是类型断言还是普通 JavaScript 都改不了持久历史。
- `seq`：下一条事件的序号，永远等于日志长度（`seq = log.length` 连续性契约）。
- `firstLiveSeq`：本进程追加的第一条事件 seq（没有 seed 就是 0）。

`append` 是日志的唯一写入口。它走两道关：第一道是 JSON 校验兼快照，第二道是 surface 校验。下面分别看。

## "模型可见即可重建"是什么意思

架构文档有一句话，是整个会话子系统的总纲：

> **Model-visible means logged.** Anything that reaches a model request must be reconstructable from the log, and a runtime invariant asserts it.

翻译过来：凡是到达模型请求的东西，都必须能从日志重建出来，而且运行时有一个不变量断言在盯着这件事。

这句话的含义比字面更深。它不只是一个"应该"，而是一条被强制的设计约束：

**第一，想给模型塞一段新上下文，不能随便塞。** 比如你想让模型看到"文件刚被改了"的通知，你不能在某个内存变量里拼一段塞进请求。你必须先产生一个新的 session 事件（一条 `user/message`，source 标成注入），把它追加进日志，然后让 deriveMessages 从日志把它投影出来。这就是为什么架构文档说"一个新的模型可见输入，需要一个 new session event：扩展 `SessionEventMap`，从日志渲染"。

**第二，这条规矩有断言盯着。** agent-loop 包带一个不变量伴生模块（invariant companion），它把"请求重建"注册进 `ctx.invariants`。loop 把每次冻结的请求记进一个进程局部的身份集合，伴生模块则要求一个活着的会话，独立地从日志重建消息边界和折叠的请求头，两边对得上才算数。直接的一次性模型调用不在契约里，哪怕调用者冻结了它或挂了 session id。

这条规矩是 DeepSeek Harness 区别于"把消息存数组的 agent"的核心。它让"模型看到的"和"日志记录的"成为同一件事，没有第二条来源。

## 日志里有什么：SessionEventMap

日志里的事件类型由一个叫 `SessionEventMap` 的接口定义，它是可合并扩展的（插件可以通过声明合并加新事件类型）。核心的事件类型有这些：

| 事件 | 记什么 |
|---|---|
| `turn/start` / `turn/end` | 一个 turn 的开闭，turn/end 带结束原因 |
| `step/start` / `step/end` | 一个 step 的开闭 |
| `user/message` | 进入模型 surface 的用户消息（直接提问、注入上下文、方向盘、目标续作） |
| `assistant/chunk` | 原始流式块，token 级回放保真 |
| `assistant/message` | 一步归总出的助手消息，带 usage |
| `tool/call` / `tool/result` | 模型请求的工具调用和它的结果 |
| `todo/write` | 整张 todo 列表的快照（last-write-wins） |
| `request/header` | 下一个请求的完整头（config + system + tools） |
| `request/context` | 路由的容量元数据，仅在路由或容量变化时记 |
| `session/end-seed` | 构造 seed 与本进程 live 写入的边界标记 |

每条事件长这样：一个 `type`、一个单调递增的 `seq`（它的值就是日志长度，保证连续）、一个 `time`（epoch 毫秒）、一个 `data`（负载）。它是一个对 `type` 的判别联合（discriminated union），所以 `switch (event.type)` 能直接收窄 `event.data`，不用类型断言。

这里有一个低调但重要的字段：`ignorable?: true`。它的语义是：如果一个读日志的人遇到一个它不认识的 `type`，并且这个事件**没有** `ignorable` 标记，它**必须拒绝重建**这个会话，而不是默默丢掉这个事件。原因是，一个不认识的必需事件，可能改变后面整段日志的解释方式。默认"必需"、漏标宁可过严，是为了防止"默默吃掉事件、续上一个残缺会话"这种最坏情况。这是个典型的"宁可错拒不可错放"的隐私式安全取向。

## 三种 surface 事件：消息历史的唯一来源

十几种事件里，只有三种会产生模型消息，叫 surface 事件（`SurfaceEventType`）：`user/message`、`assistant/message`、`tool/result`。

surface 事件比别的事件多带两个字段：

- **`surfaceOp`**：声明这条事件怎么进入有序 surface。两种值：`'append'`（追加到尾部，正常路径）和 `{ op: 'replace', start, end }`（替换 surface 上从 start 到 end 的一段，被替换的范围被遮蔽，压缩就用它）。
- **`sourceEventSeqs`**：声明这条事件引用了哪些更早的事件。比如一条 `assistant/message` 会列出构成它的那些 `assistant/chunk` 的 seq。

为什么单独拎出这三种？因为**模型消息历史只从 surface 事件的有序集合投影出来**。其他事件（turn 边界、原始 chunk、请求头）是结构性的或仅供回放的，不进消息历史。一条 `assistant/chunk` 原始流块，记在日志里用于 token 级回放保真，但在投影消息历史时被跳过，归总后的 `assistant/message` 才是权威。

这个设计的一个细节值得记住：`assistant/message` 的 `sourceEventSeqs` 可以是空数组（`[]`），表示一个已知为空的 provider 流；字段缺失则表示这条事件没记录它由哪些更早事件产生。loop 会为每次成功的模型调用写这个字段。

## deriveMessages：从日志投影出模型历史

`Session.deriveMessages()` 就是那个把日志投影成 `Message[]` 的函数。它的投影规则在文档里列得很清楚：

- `user/message` → 一条用户消息，原样带 content。
- `assistant/message` → 一条助手消息，带产生它的 provider 和 model。
- `tool/result` → 一条用户消息，里面带一个 tool-result 块。
- 注入的 `user/message`（source 不是 `'user'`）→ 一条 user 角色消息，原样带 content，按时间顺序放在它的位置。
- 其他所有事件（`turn/*`、`step/*`、插件自己的 `llm/retry` 等）→ 结构性的，不投影成消息。

两条重要规则：**原始 `assistant/chunk` 在投影时被跳过**（归总消息才是权威）；**空内容的 `assistant/message` 也被跳过**（一个 max-tokens 截断、没产生内容的 step，仍会记一条 `assistant/message` 来挂它的 usage 和 provider，但内容为空的助手回合不能进 provider 转录）。

这个投影是**有缓存且冻结**的。每个 surface 节点只在第一次见到时投影一次，之后的调用只算新增的节点，O(新节点)；只有当 surface 发生 replace 重写时才重建。返回的数组每次都是新的快照，但里面的 `Message` 对象是共享且深冻结的，复用已冻结的日志数据，所以缓存不用再深拷贝一遍，消费者也无法通过投影改写日志。

## 投影的算子：deriveEventMessage

落到代码，把日志投影成消息的是一个逐节点的纯函数 `deriveEventMessage`，它是整个"可重建"的算子：

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
```

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

## 请求也是日志状态：request/header 与 request/context

最容易漏掉的一点：**发给模型的请求本身，也是日志状态。**

每次请求的完整信封（call config 加 adapter 默认值标记、渲染好的 system prompt、组装好的 tool schema），记在一个 `request/header` 事件里。文档原话：**every conversation request is a pure function of the log**（每次会话请求都是日志的纯函数）。

`request/header` 的记账规则：

- 第一次写一条完整快照，reason 是 `initial`（或恢复时 `resume`）。
- 之后只在头变了时写一条完整快照，reason 是 `change`。
- `foldRequestHeader(events)` 取最新一条快照重建请求头。

为什么连请求头都要记进日志？因为"可重建"规矩要求"到达模型请求的一切都能从日志重建"。请求头是请求的一部分，自然也在内。这也让 KV cache 的复用判断有了依据：只要 system、tools、历史字节相同且路由没变，就是 append-only、可复用；一改就从头失效。

路由的容量元数据（context window）单独记在 `request/context` 里，**不进** `EpochHeader`。原因是 `EpochHeader` 是重建契约，被 `headerEquals` 按字段比较。容量描述的是路由，不是请求输入，如果并进去，一次容量变化会被记成请求信封的 `change`，还会把 adapter 元数据拖进 loop 的重建不变量。所以它独立记账，仅在 provider/model/容量变化时记一条。

## append 的契约：坏事件在写入点就死

事件怎么进日志？`Session.append(type, data, ...)`。它有几条硬契约，每条都服务于"日志是唯一真相源"。

**JSON 可序列化在源头强制。** 所有 `event.data` 必须能无损 JSON 序列化。`append` 在写入点就检查，遇到 BigInt、function、symbol、undefined、循环引用、Map/Set/Date 这类不可序列化的值，直接抛错。一个坏事件进不了日志，`session.events` 永远等于后端能持久化的东西。这样持久化后端就不用再担心遇到坏数据。

**热路径不阻塞 I/O。** append 是同步的、不等 I/O。持久化插件异步缓冲。事件一旦进日志，append 就算提交；观察者失败被记日志并隔离，不影响返回值，也不阻止后面的观察者看到这条已接受的事件。

**持久化不丢 chunk，seq 连续。** 持久化后端必须无损保存每条事件，包括 `assistant/chunk`。seq 必须连续，chunk 不能从规范日志里过滤掉。后端可以选自己的存储编码（JSONL 后端的打包 chunk 行就是一种编码），只要 `load` 返回的 events 和写入的完全一致。

## append 第一道关：JSON 校验兼快照（json.ts）

"一次递归同时读、校验、拷贝每个嵌套值"这条契约，机制在 `json.ts`。核心是 `snapshotJsonValue` / `isJsonValue`：

```ts
/** 校验并在一次读取里 detach 出无损 JSON 快照。 */
export function snapshotJsonValue<T>(value: T): T | undefined {
  return walkJsonValue(value, true) as T | undefined
}
```

它把候选值走一遍，既校验又（可选地）物化出一份脱离原对象的快照。关键设计有三条。

**一次读取，校验和拷贝不分离。** 走的时候每个属性只读一次，校验通过的同时就把值写进快照。这意味着一个有状态的 getter 没法给校验喂一个值、给存储喂另一个值，因为值在一次遍历里就被读定、拷贝定了。这是"日志是唯一真相源"在拷贝层面的落实。

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

## 不变量：有人在盯着这套规矩

规矩写了这么多，谁来盯？答案是 `dsh-invariants` 插件体系，以及各包自带的 invariant companion。

session 包的 invariant companion 强制核心拥有的那些关系：turn 和 step 编号、执行事件封闭性（一个 turn 封闭一次模型循环执行）、同 step 的 tool/call 和 tool/result 配对。前面提过的 agent-loop invariant companion，独立地从日志重建消息边界和请求头，和 loop 记的冻结集合对账。

声明合并扩展的事件关系，归声明它的插件管。核心不会因为一个不认识的事件就拒绝它（毕竟插件能加新事件类型）。这就是 `ignorable` 标记那条规矩的另一半：核心只管自己拥有的关系，插件事件的关系插件自己负责，遇到不认识的必需事件（没标 ignorable）就拒绝重建。

这套不变量是"可重建"规矩的执行者。规矩不是写在文档里靠人遵守，而是有代码在运行时断言。

## seed 与 live 的边界：session/end-seed

一个被"种下"的会话（resume、fork、或回放），构造时会把一批 seed 事件喂进去。这批事件来自上一次的日志，不是本进程产生的。

这里有个问题：seed 事件和本进程 live 写入的事件，在字节层面是一模一样的。怎么区分哪些是"继承来的、已经结束的生命周期"，哪些是"本进程正在写的"？

答案是 `firstLiveSeq` 字段和 `session/end-seed` 事件。`firstLiveSeq` 是本进程追加的第一条事件的 seq（没有 seed 就是 0）。构造种下后，会话会紧接着 seed 追加一条 `session/end-seed` 事件，作为它第一条 live 写入。这条事件负载为空，位置和时间就是它的全部含义。

这个边界为什么重要？因为有些事件是"开闭括号"式的，比如压缩的 `compaction/start` ... `compaction/end`。seed 历史和 live 工作字节相同，一个没闭合的 `compaction/start`，读起来分不清是"上次压缩崩在半路"还是"现在正在压缩"。有了 `session/end-seed`，边界之前没闭合的开括号，都算继承自已结束的生命周期（不管它是怎么结束的：崩了、被后续进程接手、还是从一个还在跑的父会话 fork 出来），它的 owner 可以当它死了。

注意 `session/end-seed` 的消费者要找存储历史里**最后一条**这样的标记，而不是假设它在 `firstLiveSeq` 处。因为一个已经以 `session/end-seed` 结尾的 seed 不会被重新标记，重新打开一个没动过的会话不会让它的日志变长。这个细节在并发写者场景下尤其要紧。

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

## fork 与 resume：基于同一套投影

可重建规矩的一个直接红利是 fork 特别干净。`ctx.sessions.fork(source, boundary?, childSessionId?)` 做的事：

- 接受一个活的 `Session` 对象或活的 session id 作为源。
- 选源事件到一个包含的 `boundary` seq 为止（默认是当前最后一条事件）。
- 要求选出来的前缀**结束在一个 turn 之外**（不能结束在一个打开的 turn 中间）。
- 创建一个活的子会话，seed 是深拷贝的源事件前缀，带上子会话的元数据（`parentSession`、`seedLength`、继承的 `cwd`）。

关键约束是"前缀必须结束在 turn 之外"。如果一个前缀结束在一个打开的 turn 中间，fork 会**拒绝**，而不是默默裁剪。文档解释：更宽的执行关系健全性归 `dsh-invariants` 插件和持久化修复路径管，不在 `fork()` 里重复。子 agent 的进程内 fork（`dsh-subagent-fork-in-process`）保留它自己的"已完成前缀裁剪"，因为工具时间的委派通常在父 turn 还开着时就开始了；普通的会话分支应该显式给出想要的 boundary。

fork 能这么干净，恰恰因为会话是只追加日志加可重建投影：选一段稳定前缀、深拷贝当 seed、重建出一个一模一样的子会话。如果消息历史是单独存储的，fork 就得同时拷消息数组和事件日志，还要保证两者一致，复杂度和出错面都大得多。

**resume。** `Session.fromRestore(id, seed, header)` 接管新鲜的持久化值：存储格式、事件信封、seq 连续性、surface 转换、header 字段都在接管的对象冻结前校验一遍。恢复后，turn 编号和派生历史从加载的日志接着算。`firstLiveSeq` 指向构造 seed 之后的位置，构造后紧接着追加一条 `session/end-seed` 标记 live 写入的起点。崩溃留下的打开 turn 由前面的 `interruptedTurnClosers` 在加载边界补齐，保证 resume 出来的转录是 provider 合法的。

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

## 为什么这套规矩值得

把这套规矩的成本和回报摆出来。

**成本是具体的：每一个模型可见的东西，都必须是一个事件。** 你想给模型塞段上下文，先造事件；你想改请求头，先记一条 request/header；你想加一种新的模型可见输入，得扩展 `SessionEventMap` 并从日志渲染。这比"往一个 messages 数组里 push"麻烦，纪律要求高。

**回报是，fork、resume、转录、遥测、持久化全部从同一条日志派生。** 因为消息历史是日志的纯投影，重放就是再投影一遍，fork 就是拷一段前缀，resume 就是加载日志接着投影，转录是日志的另一个投影。没有"消息数组和日志不一致"的 bug 类别，因为不存在单独的消息数组。

**回报还包括可审计。** 一个 turn 结束后，你看到的不是一段孤立的文字，而是一串有结构、有 seq、有 source 引用的事件。谁说了什么、调了哪个工具、结果是什么、请求头长什么样，全在日志里，能回放、能对账、能被不变量断言盯住。

这套规矩的本质是：**把"模型看到的"和"日志记录的"统一成同一件事，并用运行时断言保证它们不会分裂。** 这是 DeepSeek Harness 会话子系统最硬的一条规矩，也是它敢于承诺 fork/resume/重放都能干净成立的根基。

## 这套实现的几个要点

**Session 是普通类，不是 Service。** 让日志能被非 Cordis 环境消费，surface 子路径保持 browser-safe。

**一次遍历同时校验和拷贝。** JSON 校验兼快照，每个属性只读一次，有状态 getter 没法在验证和存储之间做手脚。

**surface 先验后提交。** 校验全部通过才提交，append 原子生效。replace 必须在 sourceEventSeqs 里覆盖每一个被遮蔽的节点。

**投影是逐节点纯函数。** 故意不穷尽，合并扩展友好；不加类型框架，原样透传。

**崩溃修复确定性且区分副作用。** 已开始的调用补 "结果未知、别盲目重试"，没开始的补 "需要就重试"；时间戳复用最后的真实时间。

**fork 拒绝不裁剪。** 前缀结束在打开 turn 里就抛错，不默默裁剪。

**发布三段式。** prepare/enter/announce 把生命周期折进一个有序 effect，避免关闭事件丢失。

## 结论

一个会话是一条只追加的事件日志，是唯一真相源。模型看到的消息历史是从日志投影出来的，从不单独存储，重放就是再投影。"模型可见即可重建"是一条硬规矩：任何到达模型请求的东西都必须能从日志重建，由运行时不变量断言盯住，所以新的模型可见输入必须是一个新的 session 事件。日志里只有三种 surface 事件产生消息，请求头本身也是日志状态。落到源码：append 走两道关（一次遍历校验兼快照的 JSON 关、先验后提交的 surface 关），投影由故意不穷尽的纯函数 `deriveEventMessage` 加增量 `SurfaceManager` 承担，崩溃由区分副作用的 `interruptedTurnClosers` 确定性修复，fork 拒绝结束在打开 turn 的前缀，发布拆成 prepare/enter/announce。这套规矩的代价是每个模型可见的东西都要做成事件，回报是 fork/resume/转录/遥测/持久化全部从同一条日志派生，且可被审计、被断言盯住。

## 延伸阅读

- [会话日志子系统文档（docs/subsystems/session.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md)：Session 模型与 SessionEventMap 的权威来源
- [session 包 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/README.md)：Session 模型与 API 总述
- [surface 投影源码（src/surface.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/src/surface.ts)：deriveEventMessage 与 SurfaceManager
- [JSON 校验源码（src/json.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/src/json.ts)：snapshotJsonValue 一次遍历校验兼快照
- [崩溃修复源码（src/repair.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/session/src/repair.ts)：interruptedTurnClosers
- [架构文档：Session log](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)："Model-visible means logged" 的总纲
- [持久化目录（docs/persistence-catalog.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/persistence-catalog.md)：每个持久化日志事件的负载与声明点
- [持久化子系统（docs/subsystems/persistence.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/persistence.md)：会话日志如何被做持久
- [压缩子系统（docs/subsystems/compaction.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/compaction.md)：surfaceOp replace 的主要使用者
- [不变量子系统（docs/subsystems/invariants.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/invariants.md)：盯住可重建规矩的断言体系

上一篇：[Turn 与 Step：一次对话在 agent-loop 驱动器里的完整流转](./07-turn-and-step-agent-loop.md)
下一篇：[事件系统：四种派发模式与 waterfall 的短路艺术](./11-event-system-four-dispatch-modes.md)
