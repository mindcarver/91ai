# 事件系统：四种派发模式与 waterfall 的短路艺术

> Cordis 的事件有五种派发模式，每种回答一个不同的问题（广播？并发？顺序拍板？同步拍板？层层包裹改写？），其中 waterfall 是 around 中间件，调 `next()` 才往下传、不调就是短路否决，这套语义是 DeepSeek Harness 实现"拦截与策略"的全部地基。
> 这一篇拆事件派发：每种模式干什么、waterfall 的 `next()` 纪律、什么时候该短路、Harness 把哪些关键关卡挂在了哪种模式上。

## 派发模式是事件的公开契约

先立一条总则：**一个事件的派发模式，是它公开契约的一部分。** 这不是实现细节，而是这个事件能被怎么用的规定。

Cordis 源码里有个 `DispatchMode` 类型，定义了所有合法的派发模式，是封闭五值：`'emit'`、`'parallel'`、`'serial'`、`'bail'`、`'waterfall'`。

每个事件只能用它声明的那种模式派发，对应的派发方法是固定的。声明一个新事件时，要用 `@mode` 标签写明它的模式，生成的目录会拿这个声明去和实际派发点对照，保证声明和用法不漂移。所以"给一个事件选哪种派发模式"是改动事件系统时的第一个决策，不是事后随便挑的。

源码定义了五种模式。标题说"四种"，是因为 `bail` 是 `serial` 的同步孪生，两者语义几乎一样、只差一个同步异步，所以常被归在一起讲，官方 primer 的派发模式表就只列了 emit、waterfall、parallel、serial 这四种主要的。下面把五种都讲清楚，并标出 bail 和 serial 的关系。

## 一张表先看全貌

| 模式 | 派发方法 | 是否 await | 顺序 | 返回值 | 一句话 |
|---|---|---|---|---|---|
| `emit` | `ctx.emit` | 否（同步） | 注册顺序 | 无 | 广播，谁也不等，不收集返回 |
| `parallel` | `await ctx.parallel` | 是 | 并发 | 无 | 所有监听器一起跑，一起等完 |
| `serial` | `await ctx.serial` | 是 | 注册顺序 | 第一个 bail 值 | 顺序跑，谁返回非空谁获胜并停下 |
| `bail` | `ctx.bail` | 否（同步） | 注册顺序 | 第一个 bail 值 | serial 的同步版 |
| `waterfall` | `ctx.waterfall` | 否（同步） | 注册顺序 | 最外层返回值 | around 中间件，靠 `next()` 串起来 |

一个事件有没有返回值、能不能并发、能不能互相短路，全由它的模式决定。下面逐个展开，重点放在 waterfall。

## emit：同步广播，不收集返回值

`ctx.emit(name, ...args)` 是最简单的：同步派发，按注册顺序通知每个监听器，**忽略所有返回值**，连返回的 Promise 也不 await。

它适合"通知一件事发生了、不关心谁响应、不关心响应结果"的场景。DeepSeek Harness 里，`session/event`（会话事件广播）、`agent/status`（agent 状态变化）、`agent/inbox/inserted`（inbox 插入了消息）这类纯通知就用 emit。发布者不关心有多少监听器、它们干了什么，只是喊一嗓子。

注意它不 await：如果一个 emit 监听器返回 Promise，这个 Promise 不会被等。所以 emit 监听器要么是纯同步的，要么自己管自己的异步（fire-and-forget）。需要"等所有监听器都跑完"就用 parallel。

## parallel：并发跑，一起等

`await ctx.parallel(name, ...args)` 让所有监听器**并发**跑，然后一起等它们全部 settle。返回的 Promise 在所有监听器都完成后 resolve。

它适合"一件事要让多个监听器各自处理、且发布者要等它们都干完"的场景。DeepSeek Harness 里，`session/flush`（持久化检查点）就是 parallel：可能有多个持久化后端或关注者要响应，发布者要等它们都把缓冲写完才算 flush 成功。

parallel 不收集返回值、监听器之间不互相短路。每个监听器独立干活，互不影响。

## serial 和 bail：顺序跑，第一个 bail 值获胜

这两个是"拍板"模式，差别只在同步异步。

`await ctx.serial(name, ...args)` 按注册顺序 await 每个监听器，**第一个返回 bail 值（非 null、非 false、非 undefined）的监听器获胜，剩下的不再跑**。返回值就是这个 bail 值。

`ctx.bail(name, ...args)` 是 serial 的同步版：同样按顺序、同样第一个 bail 值获胜停下，只是不 await，返回类型也直接是同步的。

它们适合"一群候选里第一个能回答的就拍板、后面不用再问"的场景。比如一组策略监听器，谁先给出一个有效答案就用谁的，后面的策略不再参与。bail 值的判定是"非空"：null、false、undefined 都不算 bail，监听器返回这些等同于"我没意见，问下一个"。

DeepSeek Harness 里，`agent/turn-stopping` 是 serial：它是个收尾检查点，让监听器按顺序看一眼、表态。注意它**没有 `next()`**，这是它和 waterfall 的关键区别。serial 靠返回值短路，waterfall 靠不调 next() 短路。

## waterfall：around 中间件，这篇的主角

前四种是"通知"或"拍板"，waterfall 是另一种东西：**around 中间件（洋葱模型）**。它实现的是"层层包裹、改写、传递"。

`ctx.waterfall(name, ...args)` 派发时，最后一个参数是一个 `next` 延续函数。每个监听器收到参数加这个 `next`，它的职责是决定要不要把控制权交给下一层：

真实形态是每个监听器收到 `(...args, next)`。以 `ctx.on('demo/transform', ...)` 为例：注册一个 `async (input, next)` 监听器，里面先 `const downstream = await next()` 委托给下一层，拿到下游结果后 `return downstream.toUpperCase()`，改写后再返回。

两条核心规则，文档用两个词概括：**调 `next()` 就是委托，不调 `next()` 就是否决（veto）。**

- **调 `next()`**：把（可能已被上游改写的）控制权交给下一个监听器，最终传到最内层的内置默认行为。`next()` 的返回值是下游的结果，当前监听器可以拿到它、改它、再返回。
- **不调 `next()`**：短路。整条链下游不再执行，最内层的默认行为根本不会跑。当前监听器的返回值就是最终结果。

值通过 `next()` 的返回值向上传播。一个协作的监听器通常的做法是：改一改共享的请求或决策对象，然后 `await next()` 把它传下去；也可以整个替换掉结果，替换后下游监听器只能看到替换后的值。

waterfall 还有个 `prepend: true` 选项，让一个监听器插队到普通注册的前面，只在"必须比所有人都先跑"时才用。

官方教程给了一个很清楚的两监听器例子，能看清短路怎么发生：

两个监听器都挂在 `demo/transform` 上。监听器 1 是 `async (input, next)`，先 `const downstream = await next()`，再 `return downstream.toUpperCase()`，包一层转大写。监听器 2 同样签名，`if (input.includes('blocked')) return '** blocked **'`，命中就短路，否则 `return next()` 放行。派发两次看结果：`await ctx.waterfall('demo/transform', 'hello', async () => 'hello')` 返回 `'HELLO'`，监听器 1 调 `next` 触发监听器 2、监听器 2 也调 `next` 走到默认值 `'hello'`、回程被转大写；`await ctx.waterfall('demo/transform', 'blocked words', async () => 'blocked words')` 返回 `'** BLOCKED **'`。

第二个例子的执行路径值得走一遍：监听器 1 先跑、调 `next()`；`next()` 触发监听器 2；监听器 2 看到 `blocked`，直接返回不调 `next()`，最内层的默认函数（那个传给 `ctx.waterfall` 的回调）根本没跑；控制权回到监听器 1，它把替换后的 `** blocked **` 转大写返回。

这就是"短路的艺术"：一个在链条靠后的监听器，能通过不调 `next()` 否决掉整个默认行为，而这个否决对在它前面的监听器是透明的（前面的人只看到最终结果变了）。

## 什么时候该 veto：waterfall 的纪律

waterfall 的威力也是它的陷阱。文档把它立成一条铁律：

> **一个只是观察或注解的监听器，必须调 `next()`；不调是故意的短路。**

一个忘了写 `next()` 的日志监听器，不是个无害的 bug，它会**静默吞掉下游所有人的默认行为**。想象你在 `agent/request` 上挂了个监听器只为打日志，结果忘了 `next()`，整个 agent 就再也发不出模型请求了，因为它把你这一层的"我不委托"当成了权威决定。

这条纪律可以反过来用：对于"单一决策"型事件，短路就是设计本身。一个策略监听器在它拥有决策权时，故意返回不调 `next()` 来拍板；一个只注解或观察的监听器必须委托。两种监听器用同一套机制，靠"调不调 next"区分角色。

这也是为什么 DeepSeek Harness 反复强调 waterfall 监听器的纪律：它的能力太大（能改写、能短路），所以约束也最严（不观察就别乱挂、挂了就记得委托）。

## DeepSeek Harness 怎么用这些模式

把模式落到 Harness 的真实事件上，能看清每种模式适合什么。架构文档直接给了一张映射表：

**waterfall（around 中间件，监听器必须调 next() 委托）：**

- `agent/pre-step`：决定模型这一步看见什么。监听器可以改写消息或拒绝（不调 next 等于 veto 整个 step）。
- `agent/request`：改写发给模型的请求配置。
- `llm/stream`：包裹实际的流式请求。
- `tools/pre-execute`、`tools/execute`、`tools/post-execute`：工具执行管线的三道关卡，每道都能改写或拦截。

这些都是"可以被多个协作插件层层包裹或拦截"的决策点，所以用 waterfall。

**serial（顺序拍板，靠返回值短路，无 next）：**

- `agent/turn-stopping`：turn 收尾检查点。监听器按顺序表态，没有 `next()` 可调，靠返回值影响。

**emit（同步广播，不收集返回）：**

- `session/event`：会话事件广播，给 UI 和 SDK 看的。
- `agent/status`、`agent/inbox/*`：状态和 inbox 变化的纯通知。

观察这个映射能看出一条选型规律：**需要"层层改写一个值"用 waterfall，需要"一群候选拍板"用 serial/bail，需要"通知不关心结果"用 emit，需要"并发各干各的且要等完"用 parallel。** 模式不是随便选的，它对应着这个事件要解决的合作模式。

## @mode 契约与生成式校验

最后回到那条总则：派发模式是公开契约。它怎么被强制？

每个 harness 事件在声明时用 `@mode` 标签写明模式。生成的 Cordis 目录（每个 owning 子系统页面里那段 `cordis-surface`）会把所有事件的声明、签名、模式列出来。文档同步时有个校验，拿声明去对照实际的派发点，保证你声明的是 waterfall、派发的也用的是 `ctx.waterfall`，不会出现"声明 serial 却用 emit 派发"这种漂移。

这意味着改一个事件的模式是一件严肃的事：它会破坏所有现有监听器的契约（一个原本是 emit 的事件改成 waterfall，所有没写 `next()` 的老监听器瞬间变成 veto）。所以架构文档说"给事件选模式是改事件系统时的第一个决策"。模式定了，监听器的写法、能不能短路、有没有返回值就都定了。

## 结论

Cordis 源码定义了五种派发模式：emit 同步广播不收集返回，parallel 并发一起等，serial 顺序拍板第一个 bail 值获胜，bail 是 serial 的同步孪生，waterfall 是 around 中间件靠 `next()` 串起来。primer 把主要的四种列成表（emit/waterfall/parallel/serial），bail 因和 serial 同源常被并讲。waterfall 的灵魂是"调 next() 委托、不调 next() 否决"，这条机制让一个监听器能层层改写或短路整个默认行为，但代价是一条铁律：只观察的监听器必须调 next()，忘调会静默吞掉所有人的默认行为。DeepSeek Harness 把所有需要拦截或改写的决策点（pre-step、request、stream、tools 三关）都做成 waterfall，把收尾检查点（turn-stopping）做成 serial，把纯通知（session/event、status）做成 emit。派发模式是事件的公开契约，用 @mode 标签声明、由生成式目录校验，改模式就是破坏契约。

## 延伸阅读

- [Cordis 事件 API（docs/cordis-api/events.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-api/events.md)：派发方法与 DispatchMode 的权威定义（生成自源码）
- [Cordis Primer：Dispatch Modes 与 Waterfall 语义](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)：四模式表与 next() 纪律
- [Cordis 教程第 4 章：事件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/04-events.md)：waterfall 短路演示
- [架构文档：Events 与 Turn flow](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：Harness 事件到模式的映射
- [事件生产者/消费者图](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/event-producer-consumer.md)：每个事件的生产者与消费者
- [vendored Cordis 事件源码（vendor/cordis/src/events.ts）](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/cordis/src/events.ts)：派发实现的源头

上一篇：[会话日志：为什么"模型可见即可重建"是最硬的规矩](./09-session-log-visible-means-reconstructable.md)
下一篇：[能力接缝 Capability Seams：换一个 provider 等于换整个产品](./12-capability-seams-swap-provider-swap-product.md)
