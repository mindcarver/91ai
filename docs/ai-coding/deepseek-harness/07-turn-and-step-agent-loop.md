# Turn 与 Step：dsh 的 agent-loop 怎么流转一次对话

> dsh 用两个单位丈量对话：turn 从领到输入开始，到"什么都不欠"时结束；step 是其中一次模型请求加上它触发的工具调用。驱动这套流转的是 dsh-agent-loop，整个 harness 里唯一装着具体循环逻辑的包。
> 这一篇先建立 turn/step 的事件骨架（输入怎么进 inbox、守门人怎么拦、turn 怎么收尾），再进 `packages/core/agent-loop` 的源码，从一条用户消息追到一次工具结果落进日志。文中代码与行为基于 2026-08-14 的仓库 `master` 分支。工具执行管线和会话日志另有专篇，这里只看它们在驱动器里的位置。

## 先分清两个单位：step 和 turn

架构文档给了两个精确的定义：

- **step（步）**：一次模型请求，加上模型在这一步里调用的工具。
- **turn（轮）**：零个或若干个 step。它在第一条输入被领取之前打开，在"什么都不欠"时关闭。

用一个例子把两个单位分开。你发一句"总结这个仓库并指出主要包"，agent 先调列目录的工具，再调几个读文件的工具，最后给出总结。整个过程是一个 turn。但模型不是一次想完的：第一个 step 里它决定调列目录工具，一次请求加一次工具调用；工具结果回来，它再想一步，于是有第二个 step。turn 就是这些 step 串成的链。

还有个容易漏掉的细节：零个 step 也是合法的 turn。一个被守门人拦下的 turn 可能一次模型都不请求，但它照样记进日志。为什么这样设计，讲到 pre-step 那一节就清楚了。

## 驱动器：harness 里唯一的具体循环

README 一句话给这个包定了性：THE concrete agent plugin and loop driver。整个 harness 里只有它装着具体的循环逻辑，其他一切都是抽象服务或挂在扩展点上的插件。想加新行为，写插件，不改这里。

它对外的身份是 `src/index.ts` 里的 `AgentLoop` 类，做两件事。一是注入五个服务：`agents`、`sessions`、`llm`、`tools`、`systemPrompt`，一个能跑的 agent 需要的全部依赖都在这张清单上。二是实现 `AgentFactory` 接口，构造时把自己注册成工厂。别的插件创建或恢复 agent，调 `ctx.agents.create(...)`，接住请求的就是它。

真正干活的驱动器类 `ReactLoopAgent` 是包私有的，外部碰不到，只能通过 `ctx.agents` 和事件观察它。包的导出表里也没有 `./src/*` 的逃生口。这是一条刻意的边界：所有可观察的行为都走 session 事件和 `agent/*` 事件，驱动器内部不留后门。

## 三个状态：idle、maintenance、running

驱动器用 `Phase` 类型管住自己，三个分支：

- **idle**：没活在跑，记着上一个 turn 的编号。
- **running**：正在跑一个 turn，记着当前 turn 号和 step 号，握着一个属于这个 turn 的 AbortController。
- **maintenance**：在做不需要模型的工作（比如上下文压缩），独占驱动器，不能和 turn 同时跑。

对外暴露的 `status` 只有两值，maintenance 算 idle。所以一次内部的压缩动作在 UI 上不可见，用户只看到 agent 空闲片刻后继续。状态切换走私有的 `setPhase()`，新旧 status 不同就广播一条 `agent/status`。

`running` 和 `maintenance` 两个分支里都有一个 `wakeRequested` 字段，值得单独记住。它是个唤醒锁存：驱动器正忙时来了唤醒输入，没法立刻处理，就先记下"醒来后再跑一次"，等收敛回 idle 时补跑。像你正埋头写代码时有人来找，先在便签上记一笔，忙完再处理。后面讲取消的时候它会再出场。

## 输入都进 inbox：三种递话方式

输入不直接触发模型请求，而是先放进一个 inbox。驱动器暴露三个方法，背后是同一个 `send()` 原语，差别只在两个参数：进哪个队列，要不要唤醒。

| 方法 | 进哪个队列 | 唤醒驱动器 | 语义 |
|------|-----------|-----------|------|
| `followup(input)` | next-turn | 唤醒 | 普通用户消息，锚定下一个 turn |
| `steer(input)` | next-step | 唤醒 | 方向盘，插进正在跑的 turn 的下一步 |
| `inject(input)` | next-step | 不唤醒 | 注入的上下文，等人捎带 |

inject 不唤醒这一点反常识：**注入的上下文不会自己触发一次模型请求**。它在 inbox 里排队，直到一条唤醒输入（followup 或 steer）把它捎上。设计是有意的：一段新检索到的文档不该让 agent 空跑一圈，它要等一个真正的用户输入或事件。README 的原话是，idle injection waits until follow-up or steering wakes the driver。

领取的时刻也讲顺序。turn 开始时，驱动器一次性领取"待处理的 next-step 输入，外加一条 next-turn 队列里排队的消息"；step 之间只领 next-step 输入。所以你趁 agent 干活时插的方向盘消息会进当前 turn 的下一个 step，而一条排队的用户消息要等下一个 turn 开始才被领走。这也兑现了 inject 的"等人捎带"：注入的上下文躺在 next-step 队列里，下一条 followup 到来时，turn 开始的这次领取会把它和用户消息一起带进第一个 step。注意领取是 claim 不是读取，领走即从 inbox 删除，这条消息从此属于这个 turn。

`send()` 里还有一个边角判断：一条唤醒输入如果赶上一个正在被取消的活动，它不能并进去，就改投 next-turn 队列，等下一个 turn 再处理。这个判断在消息进 inbox 之前完成，免得一个取消回调回过头改它的归类。

## 一个 turn 的骨架

把一个 turn 从开到关的事件列出来，是理解整个运行时最直接的方式。架构文档给的流程长这样：

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

逐段看，每一段都藏着一个设计决定。

领取输入。就是上一节说的 claim：turn 开始领"下一步输入加一条排队消息"，step 之间只领下一步输入。

组装提示和工具。系统提示的各段（身份、人格、工具说明、注入的上下文）和工具 schema 在这里拼好，每一步读的都是插件当下注册的版本，热重载后的变化下一步就能生效。

过 agent/pre-step 关卡。整个流程里控制力最强的一环，后面单独一节讲。

进 step。关卡放行后，把消息作为 `user/message` 追加进会话，然后从会话日志投影出模型历史。"投影"两个字是关键：模型这一步看到的全部历史都是从日志算出来的，不存在另一份内存副本。

请求模型。`agent/request` 构造请求，`llm/stream` 发起流式调用，模型逐块返回，每块产生一个 `assistant/chunk`，最后归总成一条 `assistant/message`。

执行工具。模型调了工具就产生 `tool/call`，进工具执行管线，产出 `tool/result`。管线内部另有专篇，在本篇的流程里，它夹在 `assistant/message` 和下一个判断之间。

判断要不要再来一个 step。工具结果还需要模型再想一步，或者 inbox 里又来了新的下一步输入，就领取新输入，回到关卡，开下一个 step。

收尾。自然停下且 next-step 队列空，过一道 `agent/turn-stopping` 检查点，然后 `turn/end` 关闭 turn。

## 实现走读：kick → turn → step

落到代码，三个函数正好嵌套：`kick()` 跑 turn 直到没有下一个，`turn()` 跑完一个 turn 的所有 step，`step()` 完成一次模型请求。

`kick()` 很短，就三件事。try 里一个 `while (await this.turn())`：turn 返回 true 表示 inbox 又有货，接着跑下一个 turn；返回 false 表示驱动收敛。catch 块是空的，失败和取消都在这个边界被吞掉，单个 turn 的失败杀不死整个 loop。finally 里把状态收回 idle，如果锁存过唤醒请求且 inbox 还有货，就再唤一次自己。

`turn()` 是骨架的代码版，按顺序做六件事：

1. 写 `turn/start`，turn 编号加一，取当前 turn 的取消信号。
2. 进 step 循环。每轮先查取消，然后调 `preStep()` 领输入、过守门人。
3. 守门人拒绝，turn 以 `blocked` 结束；第一个 step 的消息被改写成空，以 `completed` 结束。两条路径都不消耗 step，这就是"零 step 的 turn"在代码里的落点。后续某个 step 的消息被改写成空，直接退出循环。
4. 放行就写 `step/start`，把消息逐条追加为 `user/message`，调 `step()` 跑模型，无论成败补一条 `step/end`。
5. 每跑完一个 step 判断：自然停下且 next-step 队列空，先过 `agent/turn-stopping` 检查点，再判一次同样的条件，仍然成立才退出循环。判两次是因为检查点本身是一次 await，期间 inbox 可能进来新的输入。
6. 写 `turn/end`，永远写，带上结束原因。inbox 还有货就换一个新的 AbortController、重置 step 计数，返回 true 让 kick 再跑一个 turn。

有个细节叫 max-tokens 粘性：一旦某个 step 撞了输出上限，turn 的结束原因就定成 `max-tokens`，后面正常完成的 step 不能把它降级回 `completed`。代码里体现为，只有当前还没定论、或者已定的不是 `max-tokens` 时，才接受新的 step 结果。

`agent/turn-stopping` 这个检查点和前面的关卡不一样：它是 serial 模式，没有 `next()`。waterfall 要求监听器调 `next()` 把值往下传，serial 无委托意味着它只是收尾时让监听器按顺序看一眼的检查点，不是层层包裹的中间件。一个监听器可以在这里影响 turn 停不停，但不能像 waterfall 那样改写一个往下传的值。

## 守门人：agent/pre-step

每一步请求模型之前都要过 `agent/pre-step` 这道 waterfall 关卡，领输入也发生在这一步的 `preStep()` 里。它按顺序做六件事：

1. 取当前 turn 的取消信号。
2. 从 inbox 领走一批消息（claim，规则上一节讲过）。
3. 组装系统提示。
4. 渲染各段上下文，投影出运行时上下文。
5. 派发 `agent/pre-step` waterfall，把领到的消息交过去。默认回调是放行；运行时上下文非空时，放行的消息是领到的消息加上这段上下文。
6. 再查一次取消信号，把结果带回给 `turn()`。

每个关键 await 之后都查一次取消，所以取消能及时生效，不会拖到下一个 step。

守门人的权力有两个。

拒绝：一个监听器可以决定这一步不发生。被拒的 turn 里已经领走的批次保持移除状态，一个 step 不消耗就关闭，对应 `turn()` 里的 `blocked` 路径。领取之后才进来的输入不受影响，继续排队。

改写：监听器可以改写模型这一步看到的消息。架构文档强调这个返回值是权威的（authoritative），模型看到什么由这里说了算。

waterfall 有条纪律：一个只是观察或注解的监听器，包了 `next()` 就必须保留下游消息，除非它故意要替换。不调 `next()` 就是短路。方向盘和注入的上下文走的也是这道关卡，在后续某次 claim 领到它们那批消息之后。

为什么把"模型看见什么"的决策权交给一个事件，而不是写死在驱动器里？这层因果是我的归纳，文档没有直说，但机制摆在那里：压缩插件在这里探上下文压力，权限插件在这里改写可见的工具，自定义审批逻辑在这里拦截。守门人是插件的挂载点，不是硬编码的 if。

## 一次模型请求：step()

`step()` 是一次模型请求的全部，内部是一个带重试的循环。主干四段。

组请求。`buildRequest()` 把系统提示、工具 schema 和 `deriveMessages()` 算出的历史拼成请求。`deriveMessages()` 每一步都从会话日志现算，这是"模型可见即可重建"在代码里的落点：模型历史永远是日志的投影，不是缓存，不存在两份真相。

流式记账。请求发出去后逐块消费流：每块先查取消，然后写一条 `assistant/chunk` 进日志、记下它的序号，同时喂给 BlockAssembler 归块。流结束，归总出一条 `assistant/message` 落日志，用 `sourceEventSeqs` 把它依赖的那些 chunk 串起来。

这里藏着一个双层设计：投影干净，原始保真。`assistant/message` 记录每一次成功的 provider 调用，包括空内容的和被 max-tokens 截断的；空内容不进投影历史（不污染模型上下文），但持久事件保留它的 usage 和 chunk 依赖，原始 chunk 全部保真保留，供回放和 UI 用。

失败重试。错误或被中止的流先过 `agent/request-error` waterfall 问一圈恢复动作，只有监听器返回 `{ kind: 'retry' }` 才回到循环开头重来，否则抛出 `LlmError` 交给上层。

执行工具。从消息里过滤出工具调用，交给 `executeToolCalls()`。工具返回的附加上下文被塞进 next-step 队列，等下一步带给模型。如果某个工具结果宣布这个 turn 可以收了（`concludesTurn`），step 直接返回 completed，turn 提前收尾。模型没调任何工具也返回 completed；返回 null 表示"还要再想一步"，交给外层判断。

## 请求组装与记账

`step()` 调的 `buildRequest()` 管请求的组装和记账，有三件事。

插件可以改写请求。`agent/request` 是一道 waterfall，监听器可以改提议的配置，连缺的 provider/model 对都可以在这里补上，默认值就是种子配置。

adapter 全程绑定。配置定下来后走 `ctx.llm.prepareCall()`：校验 adapter 字段，物化 reasoning-effort 和输出 token 的默认值。返回的 preparedCall 绑定了解析默认值时的那个 adapter 注册，从异步解析、header 记账到最终派发保持同一个 adapter。所以热重载换掉一个 provider 的时刻，不会把旧 adapter 的能力结果混进新 adapter 的请求。

请求头按需记账。header 是请求前缀的规范记录，也是 KV cache 复用判断的依据。第一次写 `request/header` 记 `initial`（恢复会话记 `resume`），之后只在 header 变了时记 `change`，字节相同就不记，日志里没有冗余条目。

header 还带一组 marker，标出哪些字段是 adapter 算出来的默认值。下一次提议前，被标记的字段先删掉，让当前路由重新算自己的默认值；没标记的显式设置跨 step 和路由变更保留。这保证换路由不会带错上一路由的默认值。

## 工具调度：barrier、滚动池、按序提交

`executeToolCalls()` 在 `tool-calls.ts`，调度一个 step 内的工具调用。规则写在文件顶部注释里：排他调用构成 barrier，并行调用用有界滚动池，启动前重新分类。

调度按模型给出的顺序扫调用列表。遇到排他调用，它单独成一个 barrier，独占执行；遇到并行调用，把后面连续的并行调用整批划成一组，放进一个滚动池。池子的并行度上限是 `maxParallelToolCalls`，默认 10，设成 1 就是完全串行。

三条纪律撑住这个调度器。

启动前重新分类。注册表可能在执行途中变化，把一个原本并行的调用变成排他的。所以池子里每启动下一个调用前，都重新查一遍它的执行模式，发现不并行就停手，让它作为下一个 barrier 等当前池排空再跑。

结果按模型顺序提交。工具可以乱序完成，但落日志的结果和给模型看的顺序，还是模型给出的顺序。调度可以并发（派发和 body 重叠），策略、持久结果、结果上下文保持模型顺序。

取消补合成结果。取消发生时，已启动的调用排空并提交；没启动的每个补一对 `tool/call` + `tool/result`，错误码 `ABORTED_BEFORE_DISPATCH`，结果文本是固定的 "Error: tool call aborted before dispatch"。重放时历史一致，不会因为取消而缺结果。

## 压缩不在模型手里

顺着守门人往下，有个设计特别纠正常见误解。很多人以为上下文太长时，是模型自己决定调一个"压缩"或"总结"工具来收缩上下文。dsh 不是这样，它没有面向模型的 compact 工具，压缩是被动触发的事件驱动机制：

- 压缩插件在 `agent/pre-step` 里、请求投影出来之前，探上下文压力。
- 或者，`agent/request-error` 报出规范的上下文溢出时它才介入。

任一条满足，可选的工具结果裁剪先跑，然后再做摘要选择。恢复发生在"已关闭的失败 step"和"失败 turn 关闭"之间；只有当裁剪或摘要确实推进了替换的代次，才会开一个新的重试 turn，否则原始的请求错误保持权威。

驱动器侧的承载就是 maintenance 状态：压缩这种不需要模型的工作独占驱动器，不能同时跑 turn。对外 status 上 maintenance 算 idle，UI 看不到收缩动作，只看到 agent 空闲片刻后继续。

这个设计的含义，我的归纳是：上下文管理是 harness 的职责，不是模型的职责。模型不知道自己的上下文快爆了，是插件在守门人关卡和错误回调里感知压力、主动收缩。这和"把模型当 CPU、把 harness 当操作系统"那条主线一致：内存回收是操作系统的活，不是 CPU 的。

## 失败和取消在哪层兜住

失败分两种下场。最终 adapter 选择、派发、迭代失败以 terminal error 或 aborted finish 从 `ctx.llm` 进来，走 `agent/request-error`，有监听器返回 retry 就重试，没处理的失败是 terminal；中间件、结果处理、工具这些扩展失败直接抛出，关闭当前 turn。但无论哪种，loop 本身不死：`kick()` 的空 catch 把失败兜在驱动器边界，下一个唤醒照常开工。

取消走一个信号。`cancel(cause)` 先清 inbox（除非传了 `keepInbox`），再协作地 abort 当前 turn 的信号；idle 时的取消是 no-op。`turn()` 检测到 aborted，把结束原因记成 `aborted`，`turn/end` 照样写一条。取消原因改变的是报告，不是结果上下文怎么收尾。

最后是唤醒锁存的竞态合约，源码里有大段注释专门处理它。一条唤醒输入在 abort 之后、活动还没收敛到 idle 时到达，会被 `wakeRequested` 锁存，在驱动器自己的收敛边界补跑，不需要再发一次唤醒。但 `disposed` 类型的取消从不锁存，保证 teardown 不会傻等一个模型 turn。

## 两类事件：durable 与 live

读到这里，turn 流程里的事件其实分成了两类，架构文档划了明确的界。

持久会话事件：`turn/*`、`step/*`、`user/message`、`assistant/*`、`tool/*`。这些是追加进日志的事实，通过 `session/event` 广播，重载后存活，是重建会话的依据。

live agent 事件：`agent/*`。这些带着一个活着的 Agent 对象，覆盖 inbox、status、请求构造、方向盘、续作和错误，用来观察或拦截正在进行的工作。

为什么分开？两类事件回答不同的问题。持久事件回答"发生了什么"，是重建和审计的来源；live 事件回答"现在在干什么、能不能插手"，是协调和拦截的入口。文档对 SDK 用户的建议也很直白：要可回放的转录数据，消费 `session/event`；`agent/*` 是 live 协调 API。混淆两者是常见错误，有人想从 `agent/*` 重建历史，但 live 事件不保证持久。

这条区分也解释了零 step 的 turn 为什么仍记日志：一次被拦下的请求，作为 live 协调它没产生 step，但作为一次"尝试过"的事实，它要落一条持久记录，所以 `turn/start` 和 `turn/end` 照写。

## 结论

压成一句话：dsh 的对话流转就是"领输入、过守门人、从日志现算历史、请求模型、跑工具、判断还欠不欠"，turn 管从交办到交差，step 管想一次加干一次，三态状态机保证同一时刻只有一件事占着驱动器。

细看之后值得带走的是几处分寸。模型历史每步从日志现算、不做缓存，"模型可见即可重建"才立得住。工具乱序完成但按模型顺序提交，重放才是确定的。压缩不交给模型，插件在守门人和错误回调里被动触发，模型因此不用管自己的内存。失败在驱动器边界兜住，取消用合成结果补齐，loop 不死，日志不缺。

拿着 `agent.ts`、`tool-calls.ts`、`index.ts` 三个文件，你可以从一条用户消息一路追到一次工具结果落进日志。

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

上一篇：[dsh 启动链源码导读：从 npx 命令到挂载完毕的插件树](./06-boot-chain-source-walkthrough.md)
下一篇：[会话日志：dsh 为什么坚守"模型可见即可重建"](./09-session-log-visible-means-reconstructable.md)
