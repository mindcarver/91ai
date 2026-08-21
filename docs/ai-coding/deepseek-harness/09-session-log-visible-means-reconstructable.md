# 会话日志：dsh 为什么坚守"模型可见即可重建"

> dsh 的一个会话是一条只追加的事件日志，模型看到的消息历史永远从这条日志投影出来、从不单独存储，而"任何到达模型请求的东西都必须能从日志重建"是一条有运行时断言盯着的硬规矩。
> 这一篇先立心智模型：日志里有什么、消息历史怎么投影出来、为什么请求本身也是日志状态、那条"可重建"的规矩怎么被强制、fork 怎么在它上面成立；然后落到 `packages/core/session` 的源码，看一次 append 怎么进日志、崩溃后日志怎么补齐。

## 一句话模型：会话是一条只追加的事件日志

先把模型立起来。dsh 里一个 `Session`，本质是一个**只追加的事件日志（append-only log）**：一个 agent 从生到死的全部交互，都记成一条条有类型的事件（`SessionEvent`），按顺序追加。这条日志是唯一真相源（single source of truth）。

关键的一点：**模型看到的消息历史，是从这条日志投影出来的，从不单独存储。** 你在 UI 上看到的对话、发给模型的 messages 数组、回放出来的转录，全都是把这条日志按一套规则重新算出来的结果。重放一个会话，就是把同样的事件再投影一遍。

这和"把消息存进一个数组、每次往里 push"的直觉完全不同。那里，存储的就是消息本身；这里，存储的是事件，消息是事件的派生视图。这个区别是整套会话设计的根基，后面所有的规矩都从它长出来。

## Session 是普通类，不是 Service

先定位 `Session` 本身。它是一个**普通类（plain class），不是 Cordis 的 Service**，这决定了它的创建路径：

- 活的实例通过 `ctx.sessions.create()` 创建，由调用它的 fiber 拥有。
- 离散实例通过静态方法 `Session.create(id, seed?, header?)`（种下/分叉）或 `Session.fromRestore(id, seed, header)`（从持久化恢复）创建。

为什么是普通类？因为会话日志要能被 web 客户端、持久化后端、测试这些非 Cordis 环境消费，做成 Service 会把这些环境绑死在框架上。整个 surface 子路径（`@deepseek-ai/dsh-session/surface`）还专门保持 browser-safe，不引入任何 `node:` 模块，否则会打断 vite 打包。

`Session` 的几个核心访问器：

- `events`：返回 append-only 日志的不可变快照，复用到下一次 append 为止。事件和嵌套数据在接收时就深冻结，无论类型断言还是普通 JavaScript 都改不了持久历史。
- `seq`：下一条事件的序号，永远等于日志长度（`seq = log.length` 连续性契约）。
- `firstLiveSeq`：本进程追加的第一条事件 seq（没有 seed 就是 0）。

## "模型可见即可重建"是什么意思

架构文档有一句话，是整个会话子系统的总纲：

> **Model-visible means logged.** Anything that reaches a model request must be reconstructable from the log, and a runtime invariant asserts it.

凡是到达模型请求的东西，都必须能从日志重建，而且运行时有不变量断言盯着。这不是一条"应该"，是被强制的约束，落在两件事上。

先看"给模型塞上下文"这件事的正路。你想让模型看到"文件刚被改了"的通知，不能在某个内存变量里拼一段塞进请求；必须先产生一个新的 session 事件（一条 `user/message`，source 标成注入），追加进日志，让 deriveMessages 把它投影出来。所以架构文档说，一个新的模型可见输入需要一个 new session event：扩展 `SessionEventMap`，从日志渲染。

再看断言。agent-loop 包带一个不变量伴生模块（invariant companion），把"请求重建"注册进 `ctx.invariants`：loop 把每次冻结的请求记进一个进程局部的身份集合，伴生模块要求一个活着的会话，独立地从日志重建消息边界和折叠的请求头，两边对得上才算数。直接的一次性模型调用不在契约里，哪怕调用者冻结了它或挂了 session id。

这条规矩让"模型看到的"和"日志记录的"成为同一件事，没有第二条来源。

## 日志里有什么：SessionEventMap

日志里的事件类型由 `SessionEventMap` 接口定义，它是可合并扩展的：插件通过声明合并加新事件类型。核心的事件类型有这些：

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

每条事件长这样：一个 `type`、一个单调递增的 `seq`（值就是日志长度，保证连续）、一个 `time`（epoch 毫秒）、一个 `data`（负载）。它是对 `type` 的判别联合（discriminated union），`switch (event.type)` 能直接收窄 `event.data`，不用类型断言。

还有一个低调但重要的字段：`ignorable?: true`。读日志的人遇到一个不认识的 `type`，如果这个事件没带 `ignorable` 标记，就必须拒绝重建整个会话，而不是默默丢掉这个事件。因为一个不认识的必需事件，可能改变后面整段日志的解释方式。默认"必需"、漏标宁可过严，是 fail-closed 的取向：宁可错拒，不可错放，防止"默默吃掉事件、续上一个残缺会话"这种最坏情况。

## 三种 surface 事件：消息历史的唯一来源

十几种事件里，只有三种会产生模型消息，叫 surface 事件（`SurfaceEventType`）：`user/message`、`assistant/message`、`tool/result`。

surface 事件比别的事件多带两个字段：

- **`surfaceOp`**：声明这条事件怎么进入有序 surface。两种值：`'append'`（追加到尾部，正常路径）和 `{ op: 'replace', start, end }`（替换 surface 上从 start 到 end 的一段，被替换的范围被遮蔽，压缩就用它）。
- **`sourceEventSeqs`**：声明这条事件引用了哪些更早的事件。比如一条 `assistant/message` 会列出构成它的那些 `assistant/chunk` 的 seq。

为什么单独拎出这三种？因为**模型消息历史只从 surface 事件的有序集合投影出来**。其他事件（turn 边界、原始 chunk、请求头）是结构性的或仅供回放的，不进消息历史。一条 `assistant/chunk` 原始流块记在日志里用于 token 级回放保真，但投影消息历史时被跳过，归总后的 `assistant/message` 才是权威。

一个细节：`assistant/message` 的 `sourceEventSeqs` 可以是空数组（`[]`），表示一个已知为空的 provider 流；字段缺失则表示这条事件没记录它由哪些更早事件产生。loop 会为每次成功的模型调用写这个字段。

## deriveMessages：从日志投影出模型历史

`Session.deriveMessages()` 就是那个把日志投影成 `Message[]` 的函数。投影规则在文档里列得很清楚：

- `user/message` → 一条用户消息，原样带 content。
- `assistant/message` → 一条助手消息，带产生它的 provider 和 model。
- `tool/result` → 一条用户消息，里面带一个 tool-result 块。
- 注入的 `user/message`（source 不是 `'user'`）→ 一条 user 角色消息，原样带 content，按时间顺序放在它的位置。
- 其他所有事件（`turn/*`、`step/*`、插件自己的 `llm/retry` 等）→ 结构性的，不投影成消息。

两条跳过规则：**原始 `assistant/chunk` 不投影**（归总消息才是权威）；**空内容的 `assistant/message` 也不投影**（一个 max-tokens 截断、没产生内容的 step，仍会记一条 `assistant/message` 来挂它的 usage 和 provider，但空内容的助手回合不能进 provider 转录）。

这个投影是增量且冻结的，实现下一节的 SurfaceManager 会讲。从消费者视角看，效果是：返回的数组每次都是新快照，但里面的 `Message` 对象共享自已冻结的日志数据，消费者拿到投影也改写不了日志。

## 投影的算子：deriveEventMessage

落到源码，把单条事件投影成消息的是一个纯函数 `deriveEventMessage(event): Message | null`，按 `event.type` 分派：`user/message` 原样透传；`assistant/message` 空内容返回 null，否则返回归总消息；`tool/result` 返回它的消息；其他类型返回 null，不投影。

两个细节。第一，这个 switch **故意不穷尽**，没有 `assertNever`。因为 `SessionEventMap` 是合并扩展的，插件能加新事件类型，一个插件加的变体是合法的未知值。第二，注释里专门强调：**不要在这里给注入内容重新加类型框架**（比如包一层 `<context>`）。框架是调用者负责的，投影是原样透传；一个生产者要把框架烤进 content（像 agent-instructions 包 `<system-reminder>` 那样），而不是让投影去加。这保证投影是一个纯净的透传算子。

这个函数被公开出来是刻意的：外部重建器和 dev 不变量伴生模块，用完全相同的规则投影一个日志前缀，和缓存算出来的消息不会对不上。

## 增量投影：SurfaceManager

`deriveMessages` 不每次从头算，靠一个 `SurfaceManager` 维护增量视图，核心思路是"先验后提交"。

append 一条候选事件前，Session 先让 SurfaceManager 校验它：算出这条事件如果进日志会对 surface 产生什么改动，把结果存成一个"计划"，但不碰已提交的状态。校验通过、事件真的进日志后，增量处理发现这条事件和暂存的计划对得上，直接复用，不重算。校验失败，状态一点没动。

surface 本身也是惰性的：`nodes`（当前 surface 的事件 seq 序列）只在被访问时才处理新追加的事件。所以每个 surface 节点只在第一次见到时投影一次，之后的 `deriveMessages` 只算新增节点；只有 replace 重写发生时才整体重建。它不保留替换历史，只记一个替换代次计数（`replaceGeneration`，每次提交重写加一）。

还有一个完整重放的版本 `foldSurface(events)`：从头走一遍规范折叠，返回当前节点和替换历史。它给那些只有存储字节、没有活对象的消费者用，比如持久化加载后的重建。

## 请求也是日志状态：request/header 与 request/context

最容易漏掉的一点：**发给模型的请求本身，也是日志状态。** 每次请求的完整信封（call config 加 adapter 默认值标记、渲染好的 system prompt、组装好的 tool schema），记在一个 `request/header` 事件里。文档原话：every conversation request is a pure function of the log（每次会话请求都是日志的纯函数）。

记账规则三条：第一次写一条完整快照，reason 是 `initial`（恢复时是 `resume`）；之后只在头变了时写一条完整快照，reason 是 `change`；重建时 `foldRequestHeader(events)` 取最新一条快照。

为什么连请求头都要记进日志？因为"到达模型请求的一切都能从日志重建"，请求头是请求的一部分，自然在内。顺带的红利是 KV cache 复用判断有了依据：只要 system、tools、历史字节相同且路由没变，就是 append-only、可复用；一改就从头失效。

路由的容量元数据（context window）单独记在 `request/context` 里，不进 `EpochHeader`（请求头的重建契约类型）。原因：请求头被 `headerEquals` 按字段比较，容量描述的是路由，不是请求输入。并进去的话，一次容量变化会被记成请求信封的 `change`，还会把 adapter 元数据拖进 loop 的重建不变量。所以它独立记账，仅在 provider/model/容量变化时记一条。

## append 的契约：坏事件在写入点就死

事件怎么进日志？`Session.append(type, data, ...)`，它是日志的唯一写入口，内部走两道关（下两节）。先看三条硬契约，每条都服务于"日志是唯一真相源"。

JSON 可序列化在源头强制。所有 `event.data` 必须能无损 JSON 序列化，append 在写入点就检查，遇到 BigInt、function、symbol、undefined、循环引用、Map/Set/Date 这类不可序列化的值直接抛错。一个坏事件进不了日志，`session.events` 永远等于后端能持久化的东西，持久化后端不用再担心遇到坏数据。

热路径不阻塞 I/O。append 是同步的、不等 I/O，持久化插件异步缓冲。事件一旦进日志，append 就算提交；观察者失败被记日志并隔离，不影响返回值，也不阻止后面的观察者看到这条已接受的事件。

持久化不丢 chunk，seq 连续。后端必须无损保存每条事件，包括 `assistant/chunk`；seq 必须连续，chunk 不能从规范日志里过滤掉。后端可以选自己的存储编码（JSONL 后端的打包 chunk 行就是一种编码），只要 `load` 返回的 events 和写入的完全一致。

## 第一道关：一次遍历，校验兼快照（json.ts）

第一道关的机制在 `json.ts`，核心是 `snapshotJsonValue` / `isJsonValue`：一次遍历，同时读、校验、拷贝每个嵌套值。三条设计。

一次读取，校验和拷贝不分离。遍历时每个属性只读一次，校验通过的同时就把值写进快照。这意味着一个有状态的 getter 没法给校验喂一个值、给存储喂另一个值，因为值在一次遍历里就被读定、拷贝定了。这是"日志是唯一真相源"在拷贝层面的落实。

迭代而非递归。遍历用显式任务栈，不用递归调用。合法的嵌套深度受可用内存限制，不受 JavaScript 调用栈限制，深度很大的合法结构不会被栈溢出误杀。

realm 安全的原型检查。不只看类型，还检查对象的原型是不是真的原生 `Object.prototype` 或 `Array.prototype`，构造器是不是原生的，防止伪造原型或子类（Map/Set/Date/类实例）混进来，跨 realm（多个 iframe 或 vm 上下文）也成立。

拒绝的值很明确：稀疏数组、循环引用、奇异对象、负零、非有限数。这些一旦放进日志，JSON 往返就会失真，破坏"持久化无损"的契约。一个坏事件在这里就死，后端永远不会遇到它。

## 第二道关：surface 校验，先验后提交（surface.ts）

通过 JSON 校验后，surface 事件还要过第二道关：surface 校验。`surface.ts` 用"先验后提交"（validate-then-commit）的模式：校验逻辑装在一个纯函数里，算出这条事件会怎么改动 surface，返回一个还没生效的"计划"（`SurfacePlan`）；校验失败就抛错，此时状态没被碰过。事件真要进日志时，另一个函数把计划提交。所以一次 append 要么完整生效，要么完全不变。

校验查五件事。

seq 连续。`event.seq` 必须紧接日志末尾，不连续就抛错。

surfaceOp 合法性。surface 事件（user/message、assistant/message、tool/result）必须带 surfaceOp；非 surface 类型禁止带 surfaceOp 或 sourceEventSeqs。乱带就抛错。

来源证明（provenance）。`sourceEventSeqs` 必须是数组，除了 assistant/message 不能为空、不能有重复、必须引用更早的事件（不能引用自己或之后的）；如果是 replace，必须覆盖每一个被遮蔽的 surface 节点。这条最硬：一个 replace 想遮蔽哪些节点，就必须在 sourceEventSeqs 里把它们全列出来，少一个都不行。

replace 范围。start 和 end 都要在当前 surface 里能找到，start 不能在 end 之后。

tool/result 重写限制。tool/result 的 replace 只能改写恰好一个当前节点，而且只能改 content，其他字段必须和原节点深相等。防止一次工具结果重写偷偷改了别的语义。

## 不变量：有人在盯着这套规矩

规矩写了这么多，谁来盯？答案是 `dsh-invariants` 插件体系，以及各包自带的 invariant companion。

session 包的 companion 强制核心拥有的那些关系：turn 和 step 编号、执行事件封闭性（一个 turn 封闭一次模型循环执行）、同 step 的 tool/call 和 tool/result 配对。前面提过的 agent-loop companion，独立地从日志重建消息边界和请求头，和 loop 记的冻结集合对账。

声明合并扩展的事件关系，归声明它的插件管。核心不会因为一个不认识的事件就拒绝它（毕竟插件能加新事件类型）。这就是 `ignorable` 标记那条规矩的另一半：核心只管自己拥有的关系，插件事件的关系插件自己负责，遇到不认识的必需事件（没标 ignorable）就拒绝重建。

这套不变量是"可重建"规矩的执行者。规矩不是写在文档里靠人遵守，而是有代码在运行时断言。

## seed 与 live 的边界：session/end-seed

一个被"种下"的会话（resume、fork、或回放），构造时会把一批 seed 事件喂进去。这批事件来自上一次的日志，不是本进程产生的。问题来了：seed 事件和本进程 live 写入的事件，字节层面一模一样，怎么区分哪些是"继承来的、已经结束的生命周期"，哪些是"本进程正在写的"？

答案是 `firstLiveSeq` 字段加 `session/end-seed` 事件。构造种下后，会话紧接着 seed 追加一条 `session/end-seed`，作为它第一条 live 写入。这条事件负载为空，位置和时间就是它的全部含义。

这个边界为什么重要？有些事件是"开闭括号"式的，比如压缩的 `compaction/start` ... `compaction/end`。一个没闭合的 `compaction/start`，读起来分不清是"上次压缩崩在半路"还是"现在正在压缩"。有了 `session/end-seed`，边界之前没闭合的开括号都算继承自已结束的生命周期，不管它是怎么结束的：崩了、被后续进程接手、还是从一个还在跑的父会话 fork 出来，它的 owner 可以当它死了。

还有一个细节：消费者要找存储历史里**最后一条** `session/end-seed`，不能假设它在 `firstLiveSeq` 处。因为一个已经以 `session/end-seed` 结尾的 seed 不会被重新标记，重新打开一个没动过的会话不会让它的日志变长。这个细节在并发写者场景下尤其要紧。

## 崩溃修复：interruptedTurnClosers（repair.ts）

会话崩在一个打开的 turn 中间怎么办？`repair.ts` 的 `interruptedTurnClosers` 扫描加载进来的持久化日志，返回需要追加的合成关闭事件。它是个单遍扫描，边扫边记三个状态：当前打开的 turn、当前打开的 step、还没匹配到结果的工具调用表。每类事件对状态的影响：

| 事件 | 对状态的影响 |
|---|---|
| `turn/start` | 记下打开的 turn，清空调用表 |
| `turn/end` | 关闭 turn 和 step，清空调用表 |
| `step/start` | 记下打开的 step |
| `step/end` | 关闭 step，清空调用表 |
| `assistant/message` | 消息里每个 tool-call 块进调用表 |
| `tool/call` | 给调用表里对应条目记下 seq |
| `tool/result` | 从调用表里删掉对应条目 |

每次 turn 边界都清空调用表，防止更早 turn 的调用泄漏到尾部修复里。扫完时如果没有打开的 turn（或日志为空），日志本来就平衡，返回空数组；否则开始补。

未匹配的工具调用补合成结果，两种情况分开处理，文本是精心写的。调用已记录开始（有 `tool/call`）但没有持久化结果的，错误码 `TOOL_OUTCOME_UNKNOWN`，文本明确警告副作用：工具调用在记录后被中断，结果未知；仅当操作是只读或幂等的才重试，如果有副作用，先核实外部状态或问用户，不要盲目重试。调用根本没到记录开始的，错误码 `TOOL_NOT_STARTED`，文本是"如果仍需要就重试它"。这个区分是刻意的：一个可能执行了一半的调用和一个根本没开始的调用，重试策略完全不同，修复器把这个区别做进错误码和文本，让模型在 resume 后能做出正确判断。

然后补边界。有打开的 step 就先补一条 `step/end`（turn 开着而 step 没关是不变量违反，必须先关 step 再关 turn）；最后补一条 `turn/end`，reason 是 `{ kind: 'interrupted' }`。这个 `interrupted` 结束原因没有任何 loop 会发射，只有崩溃恢复会合成它。seq 接着日志末尾续，时间戳复用最后一条真实事件的时间，复用是为了确定性，不臆造一个"未来"时间。

## fork 与 resume：基于同一套投影

可重建规矩的一个直接红利是 fork 特别干净。`ctx.sessions.fork(source, boundary?, childSessionId?)` 做的事：

- 接受一个活的 `Session` 对象或活的 session id 作为源。
- 选源事件到一个包含的 `boundary` seq 为止（默认是当前最后一条事件）。
- 要求选出来的前缀**结束在一个 turn 之外**（不能结束在一个打开的 turn 中间）。
- 创建一个活的子会话，seed 是深拷贝的源事件前缀，带上子会话的元数据（`parentSession`、`seedLength`、继承的 `cwd`）。

关键约束是"前缀必须结束在 turn 之外"。如果一个前缀结束在打开的 turn 中间，fork 会拒绝，而不是默默裁剪。文档的解释：更宽的执行关系健全性归 `dsh-invariants` 插件和持久化修复路径管，不在 `fork()` 里重复。子 agent 的进程内 fork（`dsh-subagent-fork-in-process`）保留它自己的"已完成前缀裁剪"，因为工具时间的委派通常在父 turn 还开着时就开始了；普通的会话分支应该显式给出想要的 boundary。

fork 能这么干净，恰恰因为会话是只追加日志加可重建投影：选一段稳定前缀、深拷贝当 seed、重建出一个一模一样的子会话。如果消息历史是单独存储的，fork 就得同时拷消息数组和事件日志，还要保证两者一致，复杂度和出错面都大得多。

resume 走同一套地基。`Session.fromRestore(id, seed, header)` 接管新鲜的持久化值：存储格式、事件信封、seq 连续性、surface 转换、header 字段，都在接管的对象冻结前校验一遍。恢复后，turn 编号和派生历史从加载的日志接着算；`firstLiveSeq` 指向构造 seed 之后的位置，构造后紧接着追加一条 `session/end-seed` 标记 live 写入的起点。崩溃留下的打开 turn 由 `interruptedTurnClosers` 在加载边界补齐，保证 resume 出来的转录是 provider 合法的。

## SessionStore 的三段式发布：prepare / enter / announce

会话进 store 不是一步。`SessionStore` 把发布拆成三步：`prepare` 校验并构造但不进 store；`enter` 进 store、装发布钩子、返回 detach disposer；`announce` 发 `session/created`。

为什么不让 create 一步到位？因为 agent 工厂要把会话生命周期折进**一个** `ctx.effect`：fiber 卸载时按顺序拆掉 session 加 agent，而不是两个竞速的兄弟 effect 各拆各的。README 给的理由很具体：dsh-agent-loop 用这个拆分，让 loop 最后的 flush 排在 session detach 之前。如果用两个 effect，可能发布钩子先被拆了，驱动器最后的关闭事件还没提交，事件就丢了。

所以模式是：调用者在自己的 effect 里先 `prepare`，把 `enter` 返回的 detach disposer 让给这个 effect，然后再 `announce`。这样 `session/created` 的同步抛出能把 attach 回滚而不是泄漏。`enter` 还会复查 id 是否重复，因为 prepare 和 enter 是公开的跨包原语，调用者可能在两步之间做别的，一个陈旧的 prepared session 不能覆盖同 id 的活 entry。

`flush(session)` 是唯一的持久化屏障入口，发 `session/flush` 给持久化监听者。所有要触发持久化检查点的调用者（检查点策略、目标回合驱动、teardown 排空、读存储前自己 flush 的消费者）都必须走这里，而不是自己 dispatch 一个 `ctx.parallel('session/flush', ...)`。一个 owner，一种写法，scoped-dispatch 不变量能把它钉住。

## 权衡：这套规矩的成本和回报

成本是具体的：每一个模型可见的东西，都必须是一个事件。想让模型看到段上下文，先造事件；想改请求头，先记一条 request/header；想加一种新的模型可见输入，得扩展 `SessionEventMap` 并从日志渲染。这比"往一个 messages 数组里 push"麻烦，纪律要求高。

回报是 fork、resume、转录、遥测、持久化全部从同一条日志派生。消息历史是日志的纯投影，重放就是再投影一遍，fork 就是拷一段前缀，resume 就是加载日志接着投影，转录是日志的另一个投影。"消息数组和日志不一致"这个 bug 类别不存在，因为不存在单独的消息数组。审计也顺带成立：一个 turn 结束后，你看到的不是一段孤立的文字，而是一串有结构、有 seq、有 source 引用的事件，谁说了什么、调了哪个工具、请求头长什么样，全在日志里，能回放、能对账、能被不变量断言盯住。

一句话总结这套规矩的本质：把"模型看到的"和"日志记录的"统一成同一件事，并用运行时断言保证它们不会分裂。这是 fork、resume、重放敢于承诺干净成立的根基。

## 结论

一个会话是一条只追加的事件日志，是唯一真相源；模型看到的消息历史从它投影，从不单独存储。"模型可见即可重建"是硬规矩，有不变量断言盯着，所以新的模型可见输入必须是一个新的 session 事件，连请求头也是日志状态。append 走两道关（一次遍历校验兼快照的 JSON 关、先验后提交的 surface 关），坏事件在写入点就死；投影由故意不穷尽的纯函数 `deriveEventMessage` 加增量的 `SurfaceManager` 承担；崩溃由区分"结果未知"和"没开始"的 `interruptedTurnClosers` 确定性修复；fork 拒绝结束在打开 turn 里的前缀；发布拆成 prepare/enter/announce 保住关闭事件。代价是每个模型可见的东西都要做成事件，回报是一切派生视图从同一条日志算出。

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

上一篇：[Turn 与 Step：dsh 的 agent-loop 怎么流转一次对话](./07-turn-and-step-agent-loop.md)
下一篇：[事件系统：dsh 的四种派发模式与 waterfall 短路](./11-event-system-four-dispatch-modes.md)
