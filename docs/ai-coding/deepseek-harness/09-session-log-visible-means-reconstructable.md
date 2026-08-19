# 会话日志：为什么"模型可见即可重建"是最硬的规矩

> 如果这一篇你只能带走一句话，带走这句：DeepSeek Harness 的一个会话是一条只追加的事件日志，模型看到的消息历史永远是从这条日志投影出来的、从不单独存储，而"任何到达模型请求的东西都必须能从日志重建"是一条有运行时断言盯着的硬规矩。
> 这一篇拆会话日志的心智模型：日志里有什么、消息历史怎么从它投影出来、为什么请求本身也是日志状态、那条"可重建"的规矩怎么被强制、fork 怎么在它上面成立。源码层面的 append、surface 投影、fork 落地是下一篇的事。

## 一句话模型：会话是一条只追加的事件日志

先把模型立起来。DeepSeek Harness 里一个 `Session`，本质是一个**只追加的事件日志（append-only log）**：一个 agent 从生到死的全部交互，都被记成一条条有类型的事件（`SessionEvent`），按顺序追加。这条日志是唯一真相源（single source of truth）。

关键的一点来了：**模型看到的消息历史，是从这条日志投影出来的，从不单独存储。** 你在 UI 上看到的对话、发给模型的 messages 数组、回放出来的转录，全都是把这条日志按一套规则重新算出来的结果。重放一个会话，就是把同样的事件再投影一遍。

这和"把消息存进一个数组、每次往数组里 push"的直觉完全不同。在那里，存储的就是消息本身；在这里，存储的是事件，消息是事件的派生视图。这个区别是整套会话设计的根基，后面所有的规矩都从它长出来。

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

`deriveEventMessage(event)` 是那个逐节点的纯函数，被公开出来。这是个刻意的决定：外部重建器（比如那个 dev 不变量伴生模块）用完全相同的规则投影一个日志前缀，和缓存不会对不上。

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

**一次递归同时读、校验、拷贝。** 一个有状态的 getter 没法给校验喂一个值、给存储喂另一个值，因为值在一次递归里就被读定、拷贝定了。

**热路径不阻塞 I/O。** append 是同步的、不等 I/O。持久化插件异步缓冲。事件一旦进日志，append 就算提交；观察者失败被记日志并隔离，不影响返回值，也不阻止后面的观察者看到这条已接受的事件。

**持久化不丢 chunk，seq 连续。** 持久化后端必须无损保存每条事件，包括 `assistant/chunk`。seq 必须连续，chunk 不能从规范日志里过滤掉。后端可以选自己的存储编码（JSONL 后端的打包 chunk 行就是一种编码），只要 `load` 返回的 events 和写入的完全一致。

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

## fork：从一个稳定位置分叉

可重建规矩的一个直接红利是 fork 特别干净。`ctx.sessions.fork(source, boundary?, childSessionId?)` 做的事：

- 接受一个活的 `Session` 对象或活 的 session id 作为源。
- 选源事件到一个包含的 `boundary` seq 为止（默认是当前最后一条事件）。
- 要求选出来的前缀**结束在一个 turn 之外**（不能结束在一个打开的 turn 中间）。
- 创建一个活的子会话，seed 是深拷贝的源事件前缀，带上子会话的元数据（`parentSession`、`seedLength`、继承的 `cwd`）。

关键约束是"前缀必须结束在 turn 之外"。如果一个前缀结束在一个打开的 turn 中间，fork 会**拒绝**，而不是默默裁剪。文档解释：更宽的执行关系健全性归 `dsh-invariants` 插件和持久化修复路径管，不在 `fork()` 里重复。子 agent 的进程内 fork（`dsh-subagent-fork-in-process`）保留它自己的"已完成前缀裁剪"，因为工具时间的委派通常在父 turn 还开着时就开始了；普通的会话分支应该显式给出想要的 boundary。

fork 能这么干净，恰恰因为会话是只追加日志加可重建投影：选一段稳定前缀、深拷贝当 seed、重建出一个一模一样的子会话。如果消息历史是单独存储的，fork 就得同时拷消息数组和事件日志，还要保证两者一致，复杂度和出错面都大得多。

## 为什么这套规矩值得

把这套规矩的成本和回报摆出来。

**成本是具体的：每一个模型可见的东西，都必须是一个事件。** 你想给模型塞段上下文，先造事件；你想改请求头，先记一条 request/header；你想加一种新的模型可见输入，得扩展 `SessionEventMap` 并从日志渲染。这比"往一个 messages 数组里 push"麻烦，纪律要求高。

**回报是，fork、resume、转录、遥测、持久化全部从同一条日志派生。** 因为消息历史是日志的纯投影，重放就是再投影一遍，fork 就是拷一段前缀，resume 就是加载日志接着投影，转录是日志的另一个投影。没有"消息数组和日志不一致"的 bug 类别，因为不存在单独的消息数组。

**回报还包括可审计。** 一个 turn 结束后，你看到的不是一段孤立的文字，而是一串有结构、有 seq、有 source 引用的事件。谁说了什么、调了哪个工具、结果是什么、请求头长什么样，全在日志里，能回放、能对账、能被不变量断言盯住。

这套规矩的本质是：**把"模型看到的"和"日志记录的"统一成同一件事，并用运行时断言保证它们不会分裂。** 这是 DeepSeek Harness 会话子系统最硬的一条规矩，也是它敢于承诺 fork/resume/重放都能干净成立的根基。

## 结论

一个会话是一条只追加的事件日志，是唯一真相源。模型看到的消息历史是从日志投影出来的，从不单独存储，重放就是再投影。"模型可见即可重建"是一条硬规矩：任何到达模型请求的东西都必须能从日志重建，由运行时不变量断言盯住，所以新的模型可见输入必须是一个新的 session 事件。日志里只有三种 surface 事件产生消息，请求头本身也是日志状态。append 在写入点强制 JSON 可序列化，坏事件进不了日志。seed 和 live 的边界用 `session/end-seed` 标记，fork 要求前缀结束在 turn 之外。这套规矩的代价是每个模型可见的东西都要做成事件，回报是 fork/resume/转录/遥测/持久化全部从同一条日志派生，且可被审计、被断言盯住。

## 时点与诚实声明

本文基于 2026-08-14 的 `deepseek-ai/deepseek-harness` 官方文档：架构文档 Session log 节、`docs/subsystems/session.md`。文中 Session 的 append-only 事件日志模型、SessionEventMap 事件清单、SessionEvent 的判别联合与 `seq = log.length` 连续性、`ignorable` 标记语义、三种 surface 事件（user/message、assistant/message、tool/result）与 surfaceOp/sourceEventSeqs、deriveMessages 投影规则（chunk 跳过、空内容跳过）、request/header 的 initial/resume/change 记账与 request/context 分离、append 的 JSON 序列化源头强制与热路径不阻塞、持久化不丢 chunk、invariant companion、firstLiveSeq/session/end-seed 边界、fork 的 boundary 与"前缀结束在 turn 之外"约束，均来自上述官方文档，为可核实事实。

事件签名、字段细节（如 EpochHeader、SurfaceFoldResult 的字段）以仓库生成的类型与持久化目录为准，`dsh` 处于 developer preview，事件类型、格式版本会随版本变。文中"可重建规矩是区别于把消息存数组的 agent 的核心""fork 之所以干净是因为只追加日志加可重建投影"属分析判断，把官方机制连成因果解释，不是文档原话表述。源码层面的 append、surface 投影、fork 落地实现，以仓库 `packages/core/session/` 实际源码为准。

## 延伸阅读

- [会话日志子系统文档（docs/subsystems/session.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md)：Session 模型与 SessionEventMap 的权威来源
- [架构文档：Session log](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)："Model-visible means logged" 的总纲
- [持久化目录（docs/persistence-catalog.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/persistence-catalog.md)：每个持久化日志事件的负载与声明点
- [持久化子系统（docs/subsystems/persistence.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/persistence.md)：会话日志如何被做持久
- [压缩子系统（docs/subsystems/compaction.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/compaction.md)：surfaceOp replace 的主要使用者
- [不变量子系统（docs/subsystems/invariants.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/invariants.md)：盯住可重建规矩的断言体系

上一篇：[Turn 与 Step：一次对话在 agent-loop 驱动器里的完整流转](./07-turn-and-step-agent-loop.md)
下一篇：[session 包源码导读：append-only log / fork / resume](./10-session-package-source-walkthrough.md)
