# Turn 与 Step：一次模型调用要走完多少道关卡

> 如果这一篇你只能带走一句话，带走这句：DeepSeek Harness 用两个时间单位组织一次对话，step 是一次模型请求加它调用的工具，turn 是零到若干个 step 组成的一轮，整条流水线由 inbox 驱动、由 agent/pre-step 这道关卡决定模型到底看见什么。
> 这一篇拆 agent 的心跳：turn 和 step 怎么定义、一个完整的 turn 走完哪些事件、输入怎么通过 inbox 唤醒驱动器、谁有权拦下或改写模型这一步看到的内容。工具执行管线和会话日志各有更深的拆解，这里只把它们放在 turn 流程里看它们的位置。

## 两个时间单位：step 和 turn

理解 DeepSeek Harness 的运行时，先要分清两个时间单位。架构文档给的定义很精确：

- **step（步）**：一次模型请求，加上模型在这一步里调用的工具。
- **turn（轮）**：零个或若干个 step。它在第一条输入被领取之前打开，在"什么都不欠"时关闭。

举个直观例子。你发一句"总结这个仓库并指出主要包"，agent 可能先调一个列目录的工具，再调几个读文件的工具，最后给出总结。这整个过程是一个 turn，但里面有不止一个 step：第一个 step 是模型决定调列目录工具（一次模型请求加那次工具调用），工具结果回来后模型可能再想一步，于是有第二个 step。一个 turn 就是这些 step 串成的链。

注意"零个 step"也是合法的 turn。后面会看到，一个被守门人拦下的 turn 可能一个 step 都不消耗，但这个 turn 仍然会被记进日志。这个细节是"模型可见即可重建"那条规矩的延伸。

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

逐段读这段流程，每个环节都藏着设计。

**领取输入**。turn 一开始，驱动器从 inbox 里领两样东西：待处理的"下一步输入"，外加一条排队中的消息。注意是"领取"（claim）不是"读取"，领走意味着从 inbox 移除，这条消息接下来就属于这个 turn。

**组装提示和工具**。系统提示的各段（身份、人格、工具说明、注入的上下文）和工具 schema 在这里拼好。每一步读的都是插件当下注册的版本。

**agent/pre-step 关卡**。这是整个流程最关键的一环，单独留一节讲。

**进入 step**。如果关卡放行，开一个 step，把消息作为 `user/message` 追加进会话，然后从会话日志投影出模型历史。投影是"模型可见即可重建"的落地点：模型这一步看到的全部历史，都是从日志算出来的，不是某个内存变量。

**请求模型**。`agent/request`（waterfall）构造发给模型的请求，`llm/stream`（waterfall）实际发起流式请求，模型逐块返回，每块产生一个 `assistant/chunk`，最后归总成一个 `assistant/message`。

**工具调用**。如果模型在这一步调了工具，产生 `tool/call`，进入工具执行管线，产出 `tool/result`。工具部分有自己的复杂度（执行模式、有界滚动池、单调守卫），那是单独一条管线，这里只要知道它夹在 `assistant/message` 和下一个判断之间。

**是否再来一个 step**。一个 step 结束后，驱动器判断：工具结果是否还需要模型再想一步（比如模型还要根据工具输出继续推理），或者 inbox 里又来了新的下一步输入。是的话，领取新输入，回到 agent/pre-step，开下一个 step。

**收尾**。当自然停下且下一步 inbox 为空，过一道 `agent/turn-stopping` 检查点；然后 `turn/end` 关闭 turn。

## inbox：输入怎么到达驱动器

输入不是直接调一个"跑模型"的函数，而是进一个 inbox。架构文档原话：输入通过同一个 inbox 到达驱动器。

inbox 的行为有个反常识的点，值得单独记住：**有些消息会立刻唤醒驱动器，但被注入的上下文不会。** 注入的上下文会排在 inbox 里等，直到另一条消息到来把它一起带上。这个设计是有意的：注入的上下文（比如一段新检索到的文档）本身不该主动触发一次模型请求，它要等一个真正的用户输入或事件把它捎上，避免 agent 被动地为了注入内容空跑一圈。

inbox 的状态变化通过一组 live 事件广播给 UI 或 SDK：`agent/inbox/spliced`（删除）、`agent/inbox/inserted`（插入了一条消息）、`agent/inbox/claimed`（领走了一条消息，带它属于哪个 turn）。这些是 live 协调事件，不是持久事实。

这条 inbox 模型解释了一个现象：你连发两条消息，agent 不是分别处理两条各跑一个 turn，而是把排队的消息一起领进同一个 turn 的某个 step。这是"claim 下一步输入外加一条排队消息"那行的实际效果。

## agent/pre-step：决定模型看见什么的守门人

整个 turn 流程里，`agent/pre-step` 是控制力最强的一道关卡。它是一个 waterfall 事件，每一步请求模型之前都会过。

它的权力有两个：

- **拒绝**。一个监听器可以决定不让这一步发生，直接拒绝。被拒绝的 turn，已经从 inbox 领走的批次保持移除状态，这个打开的 turn 一个 step 都不消耗就关闭。
- **改写放行的消息**。监听器可以改写模型这一步看到的消息。架构文档强调，这个返回的决定是权威的（authoritative）。

这里有个微妙但重要的规则：**一个只是观察或注解的监听器，包了 `next()` 就必须保留下游消息，除非它故意要替换。** 这条和 waterfall 的 `next()` 纪律一致：不调 `next()` 就是短路，调了就要么原样传递要么明确替换。方向盘（steering）和注入的上下文，走的也是这道 waterfall，只不过是在后续某次 claim 领到它们那批下一步消息之后才过。

还有一个边界情况前面提过：**一个被拒绝、或第一次放行被改写成空的 turn，仍然会作为一个消耗了零个 step 的持久 turn 关闭。** 也就是说，日志会记录"有这么一次尝试"。这保证了一次被拦下的请求不会从历史里消失，审计时能看到。

为什么把"模型看见什么"的决策权交给一个 waterfall 事件，而不是写死在驱动器里？因为这让插件能在不碰驱动器源码的前提下，插入策略：压缩插件在这里探上下文压力，权限插件在这里改写可见的工具，自定义审批逻辑在这里拦截。守门人是插件可挂载的扩展点，不是硬编码的 if。

## 没有面向模型的 compact 工具

顺着 agent/pre-step 往下，有个设计特别值得点出来，因为它纠正了一个常见误解。

很多人以为 agent 上下文太长时，是模型自己决定调一个"压缩"或"总结"工具来收缩上下文。DeepSeek Harness 不是这样。它**没有面向模型的 compact 工具**。压缩不是模型主动决定的，而是一个被动的事件驱动机制：

- 压缩插件在 `agent/pre-step` 里，在请求投影出来之前，探上下文压力。
- 它只在 `agent/request-error` 报出"规范的上下文溢出"时才介入。

两条触发里任一条满足，可选的工具结果裁剪先跑，然后再做摘要选择。恢复发生在"已关闭的失败 step 和失败 turn 关闭"之间；只有当裁剪或摘要确实推进了替换的代次，才会开一个新的重试 turn，否则原始的请求错误保持权威。

这个设计的含义是：**上下文管理是 harness 的职责，不是模型的职责。** 模型不知道自己的上下文快爆了，是 harness 的插件在守门人关卡和错误回调里感知到压力，主动收缩。这和把模型当 CPU、把 harness 当操作系统的那条主线完全一致：内存回收是操作系统的活，不是 CPU 的活。

## turn 怎么结束：turn-stopping 检查点

一个 turn 何时关闭？流程给的条件是"什么都不欠"（nothing is owed）。具体落到代码上，当自然停下且下一步 inbox 为空时，驱动器过一道 `agent/turn-stopping` 检查点。

这个事件和前面的 waterfall 不一样：它是 **serial** 模式，而且没有 `next()`。架构文档明确，`agent/pre-step`、`agent/request`、`llm/stream` 和三个 `tools/*` 事件都是 waterfall（监听器必须调 `next()` 委托），而 `agent/turn-stopping` 是 serial 且没有 `next()`。

串行、无委托，意味着它是一个纯粹的"收尾时让监听器看一眼并按顺序表态"的检查点，不是层层包裹的中间件。一个监听器可以在这里影响 turn 是否真的停（比如宣布还有事要做），但不能像 waterfall 那样改写一个会向下传的值。turn-stopping 之后就是 `turn/end`，turn 正式关闭，驱动器回到 idle。

## 两个事件域：为什么 durable 和 live 要分开

读到这里你会发现，turn 流程里的事件分成了两类，架构文档给它们划了明确的界：

- **持久会话事件**：`turn/*`、`step/*`、`user/message`、`assistant/*`、`tool/*`。这些是追加进日志的事实，通过 `session/event` 广播。它们要能在重载后存活，是重建会话的依据。
- **live agent 事件**：`agent/*`，带着一个活着的 Agent 对象，负责 inbox、step、status、request、validation、continuation。它们用来观察或拦截在飞的工作。

为什么分开？因为它们解决两个不同的问题。持久事件回答"发生了什么"，是重建和审计的来源；live 事件回答"现在在干什么、能不能插手"，是协调和拦截的入口。

文档对 SDK 用户有一条明确建议：**需要可回放的转录数据，消费 `session/event`；`agent/*` 是用于队列、状态、提示拦截、请求构造、方向盘、续作和错误的 live 协调 API。** 混淆两者是常见错误：有人想从 `agent/*` 重建历史，但 live 事件不保证持久，重建要用 session 事件。

这条区分也解释了开头那个"零 step 的 turn 仍记进日志"的设计：一次被拦下的请求，作为 live 协调它没产生 step，但作为一次"尝试过"的事实，它要落一条持久记录，所以 turn/start 和 turn/end 这些持久事件照样发生。

## 一次成功请求留下了什么

最后看一个具体的事实粒度。一次成功的模型请求，会产生一个 `assistant/message` 持久事件。文档特别说明，这个事件记录每一次成功的 provider 调用，包括没有内容的和 `max-tokens` 截断的结束。

两条相关规则：

- **空内容不进投影历史，但持久事件保留它。** 一个没有内容的 `assistant/message` 不会出现在投影给模型的历史里（避免噪音），但持久事件里保留它的 usage 和 `sourceEventSeqs`，后者列出产生它的那些 `assistant/chunk` 事件，即使是个空列表。
- **原始 chunk 保真。** 原始的 `assistant/chunk` 事件被保留，用于回放和 UI 保真。

这种"投影干净、原始保真"的双层设计，是会话日志那套机制的核心，也是"模型可见即可重建"能成立的细节基础。

## 结论

DeepSeek Harness 用 turn 和 step 两个时间单位组织对话。一个 turn 在第一条输入被领取前打开，在什么都不欠时关闭，由零到若干个 step 组成；一个 step 是一次模型请求加它调用的工具。整条流水线由一个 inbox 驱动，注入的上下文不主动唤醒、只排队等人捎带。每一步请求模型前都过 `agent/pre-step` 这道 waterfall 关卡，它有权拒绝或改写模型看见的消息，是整个运行时控制力最强的扩展点。上下文压缩不靠面向模型的工具，而靠 harness 插件在 pre-step 和 request-error 里的被动触发。所有事件分成持久会话事件和 live agent 事件两个域，前者重建、后者协调，混淆不得。理解了这套 turn/step 流程，你就拿到了 agent 运行时的主干。

## 时点与诚实声明

本文基于 2026-08-14 的 `deepseek-ai/deepseek-harness` 官方文档：架构文档 Turn flow 节、`docs/agent-lifecycle.md`（官方生成的 Mermaid 序列图与说明）。文中 turn/step 定义、事件序列（turn/start → claim → agent/pre-step → step/start → user/message → agent/request → llm/stream → assistant/chunk → assistant/message → tool/call → 工具管线 → tool/result → step/end → agent/turn-stopping → turn/end）、inbox 行为（注入上下文排队等待）、agent/pre-step 的拒绝与改写语义、零 step turn 仍持久关闭、压缩的被动触发机制（pre-step 探压 + request-error 溢出）、waterfall 与 serial 的模式归属、assistant/message 记录粒度，均来自上述官方文档，为可核实事实。

事件签名、具体字段（如 `sourceEventSeqs`）以仓库生成的 Cordis 事件目录为准，`dsh` 处于 developer preview，事件名和签名会随版本变。文中"上下文管理是 harness 职责不是模型职责""守门人是插件可挂载的扩展点而非硬编码 if"属分析判断，把官方机制连成因果解释，不是文档原话表述。工具执行管线和会话日志的内部细节在各自专篇展开，本文只描述它们在 turn 流程里的位置。

## 延伸阅读

- [架构文档：Turn flow](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：turn/step 定义与完整流程的权威来源
- [Agent Turn And Step Lifecycle 序列图](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/agent-lifecycle.md)：官方生成的 Mermaid 序列
- [事件生产者/消费者图](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/event-producer-consumer.md)：每个事件的生产者与消费者
- [Cordis Primer：Waterfall 语义](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)：agent/pre-step 等 waterfall 事件的 next() 纪律来源
- [工具执行管线文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-execution-pipeline.md)：turn 流程里 tool/call 到 tool/result 之间发生的事
- [会话日志子系统](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md)：deriveMessages 与"模型可见即可重建"

上一篇：[启动链源码导读：从 npx dsh web 到插件树挂载](./06-boot-chain-source-walkthrough.md)
下一篇：[agent-loop 驱动器源码导读](./08-agent-loop-source-walkthrough.md)
