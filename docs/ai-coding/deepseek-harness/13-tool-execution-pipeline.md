# 工具执行管线：dsh 从 tool_call 到结果的七道关卡

> DeepSeek Harness 的工具调用不是"模型说要调就调"，而是要走完一条分层管线，钩子、权限、沙箱、单调守卫、审批、around 派发、结果归一化、内容终检各占一层，策略挂在机制上、机制不认识任何具体策略。
> 这一篇拆这条管线：从模型吐出一个 tool-call 块，到一条 tool/result 落进会话日志，中间经过哪些关卡、每道关卡管什么、为什么要把策略和机制分开。tools 包的源码内部是下一篇的事，这里只讲管线的概念和每层的职责。

## 一句话：工具调用要走完一条分层管线

在很多 agent 里，工具调用接近一个直接函数调用：模型说要调，harness 找到函数，跑，把结果塞回去。DeepSeek Harness 不是这样。它把一次工具调用做成一条**分层管线**：从模型吐出 tool-call 块，到一条 `tool/result` 落进会话日志，中间要过若干道关卡，每道关卡负责一个独立的关注点。

这条管线的总纲，是"机制和策略分离"。管线本身（关卡的结构、顺序、守卫）是机制；钩子、权限、沙箱、审批这些具体策略，是挂在关卡上的监听器。机制不认识任何具体策略，策略也不知道彼此存在。官方文档原话："这让钩子能跨越工具家族，而不把工具耦合到一个策略服务上。"

这条分离是管线的灵魂，后面每一层都是它的具体化。

## 管线全貌：从 tool-call 块到 tool/result

先看整条管线的骨架，把官方流程图压成文字：

```text
模型消息里出现 tool-call 块
  → 记 tool/call 事件（在执行之前就记）
  → UI pending 卡片（presentCall）
  → tools/pre-execute waterfall     （钩子、权限、沙箱）
  → 注册的单调守卫                    （拒绝或弃权）
  → ctx.approval 一次性审批           （缺席或答不出：拒绝）
  → tools/execute waterfall          （超时、重试、指标，around 派发）
  → 注册的工具 execute() body
     ↳ fs/write-intent 或 fs/edit-intent 门（仅 tool-fs 改动）
     ↳ 工具拥有的会话事件（todo/write、fs/observed、hook/*、tool/code-dispatch）
  → tools/post-execute waterfall     （接受、拦截、替换、加上下文）
  → 注册表外层归一化                   （快照抛错变成 isError）
  → ToolDefinition.finalizeContent   （最后一道纯内容不变量）
  → tools/result 同步通知             （冻结的权威结果）
  → 记 tool/result 事件（单一模型面向结果）
  → UI 完成卡片（presentResult）
```

把"关卡"数出来，大致是七层：pre-execute、单调守卫、approval、execute、post-execute、归一化、finalizeContent/result。下面逐层讲。

## 第一道：tools/pre-execute，钩子、权限、沙箱

管线第一道是一个 waterfall：`tools/pre-execute`。它是 around 中间件，监听器能改写或拦截这次调用。挂在这里的策略有三类典型关注点：**钩子（hooks）、权限（permission）、沙箱（sandbox）**。

一个 pre-execute 监听器有三种选择：

- **allow**：放行，交给下一道。
- **deny**：拒绝，工具 body 直接跳过。
- **ask**：转去问审批（路由到 `ctx.approval`）。

把这三类策略放在第一道 waterfall，是因为它们都是"这次调用要不要发生、以什么条件发生"的决策，最适合在真正执行前拦。而且是 waterfall，意味着多个监听器能层层包裹或改写，比如一个 hook 先注解、一个权限策略再判断。

## 第二道：单调守卫，只准拒绝不准放行

紧接着 pre-execute 的，是**注册的单调守卫（monotonic guards）**。它的语义很特别，文档两个字概括：**deny or abstain（拒绝或弃权）**。

单调守卫不能"放行"一个调用，它只能"拒绝"或"不表态"。这是刻意的：一个被注册的守卫代表一个 owner 的不可妥协的策略，它不能被别的监听器"覆盖放行"。架构文档说，`tools.guard()` 注册单调 owner 策略，"必须不能被重排的 owner 策略，仍然是一个注册守卫"。

守卫的身份受保护（identity protected），保证一个策略不会被冒名顶替。这条设计防止了一个常见 bug：某个宽松的插件挂个监听器把所有调用都放行，绕过了安全策略。单调守卫不允许"放行"这个动作，从根本上杜绝了这种绕过。

## 第三道：ctx.approval，一次性审批，缺席即拒

如果 pre-execute 选了 ask，就进 `ctx.approval` 这个接缝。它发一个 `approval/request` waterfall，做一次性权限决策。

`ctx.approval` 的关键安全语义是**失败关闭（fail closed）**：回答者缺席或答不出，结果是拒绝（deny）。文档原话：absent or unanswerable: deny。不是"没人管就放行"，而是"没人管就拒绝"。这在 agent 安全里是底线：一个需要审批的危险操作，如果审批服务没接上，绝不能默认放行。

审批在单调守卫之前解析（"ctx.approval resolves asks before monotonic guards"），保证一次审批的结果先到位，再过守卫。审批是一次性的（one-shot）：同一个决策不重复问。

## 第四道：tools/execute，around 派发

前面三道都是"要不要执行、什么条件下执行"。过了它们，才进真正的执行，而执行本身也被包在一个 waterfall 里：`tools/execute`。

这是个 around 中间件，包裹实际的工具 body。挂在这里的关注点是**执行期的横切关注点**：超时（timeout）、重试（retry）、指标（metrics）。这些是"执行"这个动作的包装，不是"要不要执行"的决策，所以放在 execute waterfall，不放在 pre-execute。

around 的语义意味着一个监听器可以在 body 前后做事：调 `next()` 之前启动计时器，`next()` 之后停计时器记录耗时，body 抛错时决定要不要重试。

## 第五道：工具 body 与文件门

`tools/execute` 的最内层是注册的工具 `execute()` body。这是真正干活的地方。body 里有几个值得注意的东西。

**文件门。** 只有 tool-fs 的改动会过 `fs/write-intent` 或 `fs/edit-intent` 门。文件读改前检查（read-before-edit）留在 tool-fs 之下、走 `fs/*` 事件。这把"文件系统改动"这个特殊关注点收敛到 fs 接缝，不污染通用管线。

**工具拥有的会话事件。** body 执行时可能产生若干工具拥有的会话事件：`todo/write`（todo 列表快照）、`fs/observed`（观察到的文件状态）、`hook/invoked` / `hook/result`（hook 桥接记录）、`tool/code-dispatch`（Code Mode 子调用）。这些事件是工具干活的副产物，记进会话日志。

注意 `tool/call` 在执行之前就记了（管线开头），这样即使执行中途崩了，调用本身也已落日志，重放时不会缺。

## 第六道：tools/post-execute 与归一化

body 跑完，结果回到 `tools/post-execute` waterfall。这一道的监听器能对结果做四种决策：**accept（接受）、block（拦截）、replace（替换）、add context（加上下文）**。

post-execute 是结果级的策略挂载点。比如一个结果太大，spill 策略可以在这里把它替换成一个定位符加检索提示；一个结果包含敏感信息，可以在这里拦截或改写。

紧接着 post-execute 的是**注册表外层归一化**。它的职责是把管线/结果快照的抛错统一成 isError：如果前面任何一层（守卫、审批、around 派发、post-execute）抛了错，归一化把它变成一个 isError 的结果，而不是让异常逃出管线。注册表会无损地快照候选结果，归一化在可见的 definition 的 `finalizeContent` 之前处理快照失败。这保证管线总是产出一条结构化的结果，不会因为某层抛错就半途而废。

## 第七道：finalizeContent 与 tools/result

最后两步是收尾。

**`ToolDefinition.finalizeContent`** 是工具定义自己拥有的最后一道纯内容不变量检查。它在归一化之后、tools/result 之前跑，是同步的、只检查内容。这是工具定义对"我的结果内容必须满足什么"的最后一次把关。

**`tools/result`** 是同步通知，观察的是一个不可变的、无损 JSON 的结果。文档强调它是"frozen authoritative outcome"（冻结的权威结果）。到这一步，结果已经定型，任何下游观察者（UI、telemetry、持久化）看到的都是同一个冻结的对象。

然后记一条 `tool/result` 会话事件，这是单一的模型面向结果。UI 收到 presentResult 画完成卡片。

## 附加上下文：additionalContexts FIFO

管线里还有一条独立的小机制：`additionalContexts`。工具结果可以带额外的上下文（post-execute 的 add context 决策，或工具自己产出），这些上下文进一个活跃批次的 FIFO 队列。当一个 step 的所有工具结果记完之后，这些附加上下文会作为 `user/message` 注入，排在已记录的工具结果之后。

这解释了一个现象：工具结果带回来的额外上下文（比如"文件刚被改了"的通知），不是直接塞进当前请求，而是排进 next-step 队列，等下一步带给模型。这和 inbox 那套"注入不主动唤醒、只排队"的纪律一致。

## Code Mode：把子调用也走同一条管线

Code Mode 是个值得单独看的特殊路径。它不是绕过管线，而是**把它的子调用也送进同一条管线**。

文档原话：Code Mode 把保留的 `run_code` 传输和它序列化的子调用都送进管线；子调用带着父 token、记 `tool/code-dispatch` 事件、把拒绝当作绑定式拒绝返回、并且**省略 `additionalContexts`** 以保持调用/结果相邻性。

这段话有几个要点。第一，Code Mode 不开后门，子调用（模型在代码里发起的工具调用）和普通工具调用走完全相同的七层管线，享受同样的钩子、权限、守卫、审批保护。第二，省略 additionalContexts 是刻意的：子调用的结果必须紧跟在它的调用后面，保持调用/结果相邻，中间不能被附加上下文打断。第三，拒绝是绑定式的：子调用被某道关卡拒绝，就是确定的拒绝，不会被后续层推翻。

这条设计保证了 Code Mode（让模型写代码来编排工具调用）不会成为安全绕过的漏洞。模型用代码发起的子调用，和直接发起的工具调用，受同样的保护。

## 为什么是这么多层

读完七层，自然的问题：为什么不让工具调用直接跑？这么深的管线不是徒增延迟和复杂度吗？

答案是**纵深防御和关注点分离**。每一层只管一个独立的关注点，互不知道彼此：

- pre-execute 管"钩子/权限/沙箱"这类前置策略。
- 单调守卫管"不可妥协的 owner 策略"，只准拒绝。
- approval 管"需要人批准的一次性决策"，缺席即拒。
- execute 管"超时/重试/指标"这类执行期包装。
- post-execute 管"结果要不要接受/改写/加上下文"。
- 归一化管"任何一层的抛错都变成 isError"。
- finalizeContent 管"工具定义自己的内容不变量"。

这样的分层有两个直接好处。第一，**一个策略的 bug 不会击穿其他层**。一个宽松的 hook 把 pre-execute 全放行，单调守卫该拒的还会拒；一个审批服务没接上，缺席即拒保底。第二，**新策略挂在对应的 waterfall 上就行，不改工具也不改其他策略**。想加一种新的前置检查，注册一个 pre-execute 监听器；想加一种结果改写，注册一个 post-execute 监听器。工具定义自己只关心 execute body 和 finalizeContent，不知道有多少策略围着它。

代价是真实的：一次工具调用要穿七层，延迟和调试链都变长。出问题时你要沿着管线定位是哪一层拦的。这是"策略和机制分离"这个抽象的固定成本。

权衡和接缝那篇一致：如果你做的是只在受信环境里跑、策略单一的 agent，这条管线是过度设计。但如果你要让 agent 在有多种权限策略、多种执行环境、需要审计和安全保证的场景里跑，分层管线是把每个安全关注点都钉死在它自己的层里、不依赖任何一个策略不出 bug 的唯一手段。

## 结论

DeepSeek Harness 的工具调用是一条分层管线：tool-call 块先进 tool/call 事件，然后过 tools/pre-execute（钩子/权限/沙箱）、单调守卫（只拒不放）、ctx.approval（一次性审批、缺席即拒）、tools/execute（超时/重试/指标的 around 派发）、工具 body（含 fs 门和工具拥有的会话事件）、tools/post-execute（接受/拦截/替换/加上下文）、归一化（抛错变 isError）、finalizeContent（内容终检），最后产出冻结的权威结果进 tools/result 和 tool/result 事件。管线的灵魂是机制和策略分离：机制是关卡结构，策略是挂在 waterfall 上的监听器，彼此不耦合。Code Mode 把子调用也送进同一条管线、省略 additionalContexts 保持调用/结果相邻、拒绝绑定式。这套纵深防御让每层只管一个关注点，一个策略的 bug 不会击穿其他层，代价是延迟和调试链变长。

## 延伸阅读

- [工具执行管线图（docs/tool-execution-pipeline.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-execution-pipeline.md)：管线流程图的权威来源
- [tools 子系统文档（docs/subsystems/tools.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md)：工具注册表与守卫管线
- [approval 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/approval.md)：fail closed 的审批接缝
- [sandbox 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/sandbox.md)：进程围栏
- [架构文档：Turn flow 工具部分](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：管线在 turn 流程里的位置
- [Cordis Primer：Waterfall 语义](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)：pre/execute/post-execute 三道 waterfall 的 next() 纪律

上一篇：[能力接缝：dsh 换一个 provider 等于换整个产品](./12-capability-seams-swap-provider-swap-product.md)
下一篇：[dsh tools 注册表与守卫管线源码导读](./14-tools-registry-guards-source-walkthrough.md)
