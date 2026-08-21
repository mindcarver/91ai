# 事件系统：dsh 的四种派发模式与 waterfall 短路

> Cordis 的事件有五种派发模式，每种回答一个不同的合作问题：广播、并发、顺序拍板、同步拍板、层层包裹改写。其中 waterfall 是 around 中间件，调 `next()` 才往下传、不调就是短路否决，这套语义是 dsh 实现"拦截与策略"的全部地基。
> 这一篇拆事件派发：每种模式干什么、waterfall 的 `next()` 纪律、什么时候该短路、Harness 把哪些关键关卡挂在了哪种模式上。

## 派发模式是事件的公开契约

先立一条总则：**一个事件的派发模式，是它公开契约的一部分。** 这不是实现细节，是这个事件能被怎么用的规定。

Cordis 源码里有个 `DispatchMode` 类型，定义所有合法的派发模式，是封闭五值：`'emit'`、`'parallel'`、`'serial'`、`'bail'`、`'waterfall'`。每个事件只能用它声明的那种模式派发，对应的派发方法是固定的。声明一个新事件时，用 `@mode` 标签写明模式，生成的目录会拿声明去对照实际的派发点，保证两者不漂移。所以"给事件选哪种模式"是改动事件系统时的第一个决策，不是事后随便挑的。

标题说"四种"，是因为 `bail` 是 `serial` 的同步孪生，语义几乎一样、只差同步异步，官方 primer 的派发模式表就只列 emit、waterfall、parallel、serial 四种主要的。下面五种都讲，并标出 bail 和 serial 的关系。

## 一张表先看全貌

| 模式 | 派发方法 | 是否 await | 顺序 | 返回值 | 一句话 |
|---|---|---|---|---|---|
| `emit` | `ctx.emit` | 否（同步） | 注册顺序 | 无 | 广播，谁也不等，不收集返回 |
| `parallel` | `await ctx.parallel` | 是 | 并发 | 无 | 所有监听器一起跑，一起等完 |
| `serial` | `await ctx.serial` | 是 | 注册顺序 | 第一个非空返回值 | 顺序跑，谁返回非空谁获胜并停下 |
| `bail` | `ctx.bail` | 否（同步） | 注册顺序 | 第一个非空返回值 | serial 的同步版 |
| `waterfall` | `ctx.waterfall` | 否（同步） | 注册顺序 | 最外层返回值 | around 中间件，靠 `next()` 串起来 |

一个事件有没有返回值、能不能并发、能不能互相短路，全由它的模式决定。

表格里 waterfall 的"同步"要说明一下：派发本身是同步的，`ctx.waterfall` 不帮你 await；但监听器可以是 async 函数，`next()` 和整个派发的返回值因此可能是 Promise，要由调用方自己 await。下面的例子里你会看到 `await ctx.waterfall(...)` 的写法。下面逐个展开，重点放在 waterfall。

## emit：同步广播，不收集返回值

`ctx.emit(name, ...args)` 按注册顺序同步通知每个监听器，**忽略所有返回值**，连返回的 Promise 也不 await。

它适合"通知一件事发生了，不关心谁响应、不关心响应结果"的场景。dsh 里，`session/event`（会话事件广播）、`agent/status`（agent 状态变化）、`agent/inbox/inserted`（inbox 插入了消息）这类纯通知就用 emit。发布者只是喊一嗓子。

因为它不 await，emit 监听器要么是纯同步的，要么自己管自己的异步（fire-and-forget）。需要"等所有监听器都跑完"就用 parallel。

## parallel：并发跑，一起等

`await ctx.parallel(name, ...args)` 让所有监听器并发跑，返回的 Promise 在它们全部完成后 resolve。

它适合"一件事要让多个监听器各自处理，且发布者要等它们都干完"的场景。dsh 里，`session/flush`（持久化检查点）就是 parallel：可能有多个持久化后端要响应，发布者要等它们都把缓冲写完，flush 才算成功。

parallel 不收集返回值，监听器之间也不互相短路，各干各的。

## serial 和 bail：顺序跑，第一个非空值获胜

这两个是"拍板"模式，差别只在同步异步。

`await ctx.serial(name, ...args)` 按注册顺序 await 每个监听器，**第一个返回非空值（非 null、非 false、非 undefined）的监听器获胜，剩下的不再跑**，返回值就是这个值。`ctx.bail` 是它的同步版：同样按顺序、同样第一个非空值获胜停下，只是不 await。

它们适合"一群候选里第一个能回答的就拍板，后面不用再问"。比如一组策略监听器，谁先给出有效答案就用谁的，后面的不再参与。空返回的语义是"我没意见，问下一个"。

dsh 里，`agent/turn-stopping` 是 serial：turn 收尾检查点，监听器按顺序看一眼、表态。注意它没有 `next()`，这是它和 waterfall 的关键区别。serial 靠返回值短路，waterfall 靠不调 next() 短路。

## waterfall：around 中间件，这篇的主角

前四种是"通知"或"拍板"，waterfall 是另一种东西：**around 中间件，洋葱模型**，实现"层层包裹、改写、传递"。

每个 waterfall 监听器收到 `(...args, next)`：事件参数，加一个 `next` 延续函数。它的职责是决定要不要把控制权交给下一层。两条核心规则，文档用两个词概括：**调 `next()` 就是委托，不调 `next()` 就是否决（veto）。**

- 调 `next()`：把（可能已被上游改写的）控制权交给下一个监听器，最终传到最内层的默认行为。`next()` 的返回值是下游结果，当前监听器可以拿到它、改它、再返回。
- 不调 `next()`：短路。下游整条链不再执行，最内层的默认行为根本不跑，当前监听器的返回值就是最终结果。

值通过 `next()` 的返回值向上传播。协作的监听器通常改一改共享的请求或决策对象，然后 `await next()` 传下去；也可以整个替换结果，替换后下游监听器只能看到替换后的值。还有个 `prepend: true` 选项，让监听器插队到普通注册的前面，只在"必须比所有人都先跑"时才用。

官方教程的两监听器例子最能看清短路怎么发生。两个监听器都挂在 `demo/transform` 上。监听器 1 的做法是先 `await next()` 拿下游结果，再转成大写返回，等于在回程包一层。监听器 2 检查输入，包含 `blocked` 就直接返回 `'** blocked **'`（不调 next，短路），否则 `return next()` 放行。派发两次：

- `await ctx.waterfall('demo/transform', 'hello', async () => 'hello')` 返回 `'HELLO'`。
- `await ctx.waterfall('demo/transform', 'blocked words', async () => 'blocked words')` 返回 `'** BLOCKED **'`。

第一次没什么意外：两个监听器都委托，最内层的默认回调返回 `'hello'`，回程被监听器 1 转成大写。第二次值得走一遍：监听器 1 先跑、调 `next()`；`next()` 触发监听器 2；监听器 2 看到 `blocked`，直接返回、不调 `next()`，最内层的默认回调根本没跑；控制权回到监听器 1，它把替换后的 `** blocked **` 转成大写返回。

这就是短路的艺术：一个在链条靠后的监听器，能通过不调 `next()` 否决掉整个默认行为，而这个否决对它前面的监听器是透明的，前面的人只看到最终结果变了。

## 什么时候该 veto：waterfall 的纪律

waterfall 的威力也是它的陷阱。文档把它立成一条铁律：

> **一个只是观察或注解的监听器，必须调 `next()`；不调是故意的短路。**

一个忘了写 `next()` 的日志监听器不是无害的 bug，它会**静默吞掉下游所有人的默认行为**。想象你在 `agent/request` 上挂了个监听器只为打日志，忘了 `next()`，整个 agent 就再也发不出模型请求了：链条把你这一层的"我不委托"当成了权威决定。

这条纪律可以反过来用。对"单一决策"型事件，短路就是设计本身：一个策略监听器在它拥有决策权时，故意不调 `next()` 拍板；一个只观察的监听器必须委托。两种角色用同一套机制，靠"调不调 next"区分。

这也是 dsh 反复强调 waterfall 监听器纪律的原因：它的能力太大（能改写、能短路），约束也最严（只观察就别乱挂，挂了就记得委托）。

## dsh 怎么用这些模式

把模式落到真实事件上，能看清每种模式适合什么。架构文档给的映射：

waterfall（around 中间件，监听器必须调 next() 委托）：

- `agent/pre-step`：决定模型这一步看见什么，可改写消息或拒绝。
- `agent/request`：改写发给模型的请求配置。
- `llm/stream`：包裹实际的流式请求。
- `tools/pre-execute`、`tools/execute`、`tools/post-execute`：工具执行管线的三道关卡，每道都能改写或拦截。

这些都是"可以被多个协作插件层层包裹或拦截"的决策点，所以用 waterfall。

serial（顺序拍板，靠返回值短路，无 next）：

- `agent/turn-stopping`：turn 收尾检查点。

emit（同步广播，不收集返回）：

- `session/event`：会话事件广播，给 UI 和 SDK 看的。
- `agent/status`、`agent/inbox/*`：状态和 inbox 变化的纯通知。

看这张映射能总结出一条选型规律：需要层层改写一个值，用 waterfall；需要一群候选拍板，用 serial 或 bail；需要通知但不关心结果，用 emit；需要并发各干各的且要等完，用 parallel。模式不是随便选的，它对应这个事件要解决的合作模式。

## @mode 契约与生成式校验

最后回到那条总则：派发模式是公开契约，它怎么被强制？

每个 harness 事件在声明时用 `@mode` 标签写明模式。生成的 Cordis 目录（每个 owning 子系统页面里那段 `cordis-surface`）列出所有事件的声明、签名、模式；文档同步时有个校验，拿声明对照实际派发点，保证声明 waterfall 的事件确用 `ctx.waterfall` 派发，不会出现"声明 serial 却用 emit 派发"的漂移。

所以改一个事件的模式是严肃的事：它破坏所有现有监听器的契约。一个原本是 emit 的事件改成 waterfall，所有没写 `next()` 的老监听器瞬间变成 veto。模式定了，监听器的写法、能不能短路、有没有返回值就都定了。

## 结论

五种模式各管一种合作方式：emit 广播、parallel 并发等完、serial 和 bail 顺序拍板、waterfall 层层包裹。waterfall 的灵魂是"调 next() 委托、不调 next() 否决"，代价是一条铁律：只观察的监听器必须调 next()，忘调会静默吞掉所有人的默认行为。dsh 把拦截与改写的决策点（pre-step、request、stream、tools 三关）都做成 waterfall，把收尾检查点做成 serial，把纯通知做成 emit；模式是公开契约，@mode 声明、生成式目录校验，改模式就是破坏契约。

## 延伸阅读

- [Cordis 事件 API（docs/cordis-api/events.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-api/events.md)：派发方法与 DispatchMode 的权威定义（生成自源码）
- [Cordis Primer：Dispatch Modes 与 Waterfall 语义](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)：四模式表与 next() 纪律
- [Cordis 教程第 4 章：事件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/04-events.md)：waterfall 短路演示
- [架构文档：Events 与 Turn flow](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：Harness 事件到模式的映射
- [事件生产者/消费者图](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/event-producer-consumer.md)：每个事件的生产者与消费者
- [vendored Cordis 事件源码（vendor/cordis/src/events.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis/src/events.ts)：派发实现的源头

上一篇：[会话日志：dsh 为什么坚守"模型可见即可重建"](./09-session-log-visible-means-reconstructable.md)
下一篇：[能力接缝：dsh 换一个 provider 等于换整个产品](./12-capability-seams-swap-provider-swap-product.md)
