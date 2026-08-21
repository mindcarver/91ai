# 工具执行管线：dsh 从 tool_call 到结果的七道关卡

> DeepSeek Harness 的工具调用不是"模型说要调就调"，而是要走完一条分层管线，钩子、权限、沙箱、单调守卫、审批、around 派发、结果归一化、内容终检各占一层，策略挂在机制上、机制不认识任何具体策略。
> 这一篇拆这条管线：从模型吐出一个 tool-call 块，到一条 tool/result 落进会话日志，中间经过哪些关卡、每道关卡管什么、为什么要把策略和机制分开。tools 包的源码内部是下一篇的事，这里只讲管线的概念和每层的职责。

## 一句话：工具调用要走完一条分层管线

在很多 agent 里，工具调用接近一个直接函数调用：模型说要调，harness 找到函数，跑，把结果塞回去。DeepSeek Harness 不是这样。它把一次工具调用做成一条分层管线：从模型吐出 tool-call 块，到一条 `tool/result` 落进会话日志，中间要过若干道关卡，每道关卡负责一个独立的关注点。

这条管线的总纲，是**机制和策略分离**。管线本身（关卡的结构、顺序、守卫）是机制；钩子、权限、沙箱、审批这些具体策略，是挂在关卡上的监听器。机制不认识任何具体策略，策略也不知道彼此存在。官方文档的原话是：这让钩子能跨越工具家族，而不把工具耦合到一个策略服务上。

后面每一层都是这条分离的具体化。

## 管线全貌：从 tool-call 块到 tool/result

先看整条管线的骨架，把官方流程图压成文字：

```text
模型消息里出现 tool-call 块
  → 记 tool/call 事件（在执行之前就记）
  → UI pending 卡片（presentCall）
  → tools/pre-execute waterfall     （钩子、权限、沙箱）
     ask 分支先过 ctx.approval 一次性审批（缺席或答不出：拒绝）
  → 注册的单调守卫                    （拒绝或弃权）
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

把关卡数出来，大致是七层：pre-execute、approval、单调守卫、execute、post-execute、归一化、finalizeContent/result。下面逐层讲。

## 第一道：tools/pre-execute，钩子、权限、沙箱

第一道 waterfall 管的是"这次调用要不要发生、以什么条件发生"。挂在这里的策略有三类典型关注点：钩子（hooks）、权限（permission）、沙箱（sandbox）。

一个 pre-execute 监听器有三种选择：allow 放行，交给下一道；deny 拒绝，工具 body 直接跳过；ask 转去问审批，路由到 `ctx.approval`。

三类策略都放在第一道，是因为它们都是执行前的决策，最适合在真正跑代码之前拦下来。而它是个 waterfall，多个监听器能层层包裹或改写：一个 hook 先注解，一个权限策略再判断。

## 第二道：ctx.approval，一次性审批，缺席即拒

pre-execute 选了 ask 的调用，先进 `ctx.approval` 这个接缝。它发一个 `approval/request` waterfall，做一次性权限决策，同一个决策不重复问。

它的关键安全语义是**失败关闭（fail closed）**：回答者缺席或答不出，结果是拒绝。文档原话：absent or unanswerable: deny。不是"没人管就放行"，而是"没人管就拒绝"。一个需要审批的危险操作，如果审批服务没接上，绝不能默认放行，这是 agent 安全的底线。

文档还明确了一条顺序：ctx.approval resolves asks before monotonic guards，审批在单调守卫之前解析，保证一次审批的结果先到位，守卫再表态。

## 第三道：单调守卫，只准拒绝不准放行

放行的调用（走了 ask 的，此时审批已通过）接下来过注册的单调守卫（monotonic guards），语义用文档的两个字概括：deny or abstain，拒绝或弃权。

守卫不能"放行"一个调用，只能拒绝或不表态。这是刻意的：一个被注册的守卫代表一个 owner 的不可妥协策略，不能被别的监听器覆盖放行。架构文档说，`tools.guard()` 注册的是必须不能被重排的 owner 策略，仍然是一个注册守卫。

守卫的身份受保护（identity protected），一个策略不会被冒名顶替。这条设计堵死了一个常见 bug：某个宽松的插件挂个监听器把所有调用都放行，绕过安全策略。单调守卫根本没有"放行"这个动作，这种绕过从根上不存在。

## 第四道：tools/execute，around 派发

前三道都在决定"要不要执行、什么条件下执行"。过了它们才进真正的执行，而执行本身也包在一个 waterfall 里：`tools/execute`。

这是 around 中间件，包裹实际的工具 body，挂在这里的是执行期的横切关注点：超时、重试、指标。它们是"执行"这个动作的包装，不是"要不要执行"的决策，所以放这道，不放 pre-execute。

around 的语义让监听器能在 body 前后做事：调 `next()` 之前启动计时器，`next()` 之后停表记录耗时，body 抛错时决定要不要重试。

## 第五道：工具 body 与文件门

`tools/execute` 的最内层是注册的工具 `execute()` body，真正干活的地方。body 里有两类东西值得点出。

文件门。只有 tool-fs 的改动会过 `fs/write-intent` 或 `fs/edit-intent` 门；文件读改前检查（read-before-edit）留在 tool-fs 之下、走 `fs/*` 事件。这把"文件系统改动"这个特殊关注点收敛到 fs 接缝，不污染通用管线。

工具拥有的会话事件。body 执行时可能顺手产生若干会话事件：`todo/write`（todo 列表快照）、`fs/observed`（观察到的文件状态）、`hook/invoked` / `hook/result`（hook 桥接记录）、`tool/code-dispatch`（Code Mode 子调用）。它们是工具干活的副产物，记进会话日志。

还有一个时序值得记住：`tool/call` 在执行之前就记了（管线开头）。这样即使执行中途崩了，调用本身也已落日志，重放时不会缺。

## 第六道：tools/post-execute 与归一化

body 跑完，结果回到 `tools/post-execute` waterfall。这一道的监听器能对结果做四种决策：接受（accept）、拦截（block）、替换（replace）、加上下文（add context）。

post-execute 是结果级的策略挂载点。一个结果太大，spill 策略可以在这里把它替换成一个定位符加检索提示；一个结果包含敏感信息，可以在这里拦截或改写。

紧接着的是注册表外层归一化。前面任何一层（守卫、审批、around 派发、post-execute）抛了错，归一化都把它变成一个 isError 的结果，不让异常逃出管线。注册表会先无损地快照候选结果，在可见 definition 的 `finalizeContent` 之前处理快照失败。所以管线总是产出一条结构化的结果，不会因为某层抛错就半途而废。

## 第七道：finalizeContent 与 tools/result

最后两步是收尾。

`ToolDefinition.finalizeContent` 是工具定义自己拥有的最后一道纯内容不变量检查，在归一化之后、tools/result 之前跑，同步、只看内容。这是工具定义对"我的结果内容必须满足什么"的最后一次把关。

`tools/result` 是同步通知，观察一个不可变的、无损 JSON 的结果，文档说它是 frozen authoritative outcome（冻结的权威结果）。到这一步结果已经定型，任何下游观察者（UI、telemetry、持久化）看到的都是同一个冻结对象。

然后记一条 `tool/result` 会话事件，这是单一的模型面向结果；UI 收到 presentResult 画完成卡片。

## 附加上下文：additionalContexts FIFO

管线里还有一条独立的小机制：`additionalContexts`。工具结果可以带额外的上下文（post-execute 的 add context 决策，或工具自己产出），这些上下文进一个活跃批次的 FIFO 队列。当一个 step 的所有工具结果记完之后，它们作为 `user/message` 注入，排在已记录的工具结果之后。

这解释了一个现象：工具结果带回来的额外上下文（比如"文件刚被改了"的通知），不是直接塞进当前请求，而是排进 next-step 队列，等下一步带给模型。这和 inbox 那套"注入不主动唤醒、只排队"的纪律一致。

## Code Mode：把子调用也走同一条管线

Code Mode 是个特殊的路径，值得单独看。它不是绕过管线，而是把它的子调用也送进同一条管线。文档原话：Code Mode 把保留的 `run_code` 传输和它序列化的子调用都送进管线；子调用带着父 token、记 `tool/code-dispatch` 事件、把拒绝当作绑定式拒绝返回、并且省略 `additionalContexts` 以保持调用/结果相邻性。

这段话有三个要点。第一，Code Mode 不开后门：模型在代码里发起的子调用，和直接发起的工具调用走完全相同的七层管线，享受同样的钩子、权限、守卫、审批保护。第二，省略 additionalContexts 是刻意的，子调用的结果必须紧跟在它的调用后面，中间不能被附加上下文打断。第三，拒绝是绑定式的：子调用被某道关卡拒绝，就是确定的拒绝，不会被后续层推翻。

这条设计保证 Code Mode（让模型写代码来编排工具调用）不会成为安全绕过的漏洞。

## 权衡：为什么是这么多层

读完七层，自然的问题：为什么不让工具调用直接跑？这么深的管线不是徒增延迟和复杂度吗？

答案是纵深防御加关注点分离。每层只管一个独立的关注点，互不知道彼此：pre-execute 管前置策略，单调守卫管不可妥协的 owner 策略，approval 管需要人批准的一次性决策，execute 管执行期包装，post-execute 管结果的接受与改写，归一化管抛错收敛，finalizeContent 管工具定义自己的内容不变量。

好处有两个。**一个策略的 bug 不会击穿其他层**：一个宽松的 hook 把 pre-execute 全放行，单调守卫该拒的还会拒；一个审批服务没接上，缺席即拒保底。新策略就挂在对应的 waterfall 上，不改工具也不改其他策略：想加一种前置检查，注册一个 pre-execute 监听器；想加一种结果改写，注册一个 post-execute 监听器。工具定义自己只关心 execute body 和 finalizeContent，不知道有多少策略围着它。

代价是真实的：一次工具调用要穿七层，延迟和调试链都变长，出问题时你要沿着管线定位是哪一层拦的。这是"策略和机制分离"这个抽象的固定成本。如果你做的 agent 只在受信环境里跑、策略单一，这条管线是过度设计；但如果它要在多种权限策略、多种执行环境、需要审计和安全保证的场景里跑，分层管线是把每个安全关注点钉死在它自己的层里、不依赖任何一个策略不出 bug 的手段。

## 结论

dsh 把一次工具调用做成七层管线：pre-execute 问该不该发生，approval 对 ask 缺席即拒，单调守卫只拒不放，execute 包住执行，post-execute 处置结果，归一化兜住抛错，finalizeContent 终检内容，最后产出冻结的权威结果。灵魂是机制和策略分离：机制是关卡结构，策略是挂在 waterfall 上的监听器，彼此不耦合，所以一个策略出 bug 不会击穿其他层。代价是延迟和调试链变长，换来的是纵深防御。

## 延伸阅读

- [工具执行管线图（docs/tool-execution-pipeline.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-execution-pipeline.md)：管线流程图的权威来源
- [tools 子系统文档（docs/subsystems/tools.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/tools.md)：工具注册表与守卫管线
- [approval 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/approval.md)：fail closed 的审批接缝
- [sandbox 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/sandbox.md)：进程围栏
- [架构文档：Turn flow 工具部分](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：管线在 turn 流程里的位置
- [Cordis Primer：Waterfall 语义](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)：pre/execute/post-execute 三道 waterfall 的 next() 纪律

上一篇：[能力接缝：dsh 换一个 provider 等于换整个产品](./12-capability-seams-swap-provider-swap-product.md)
下一篇：[dsh tools 注册表与守卫管线源码导读](./14-tools-registry-guards-source-walkthrough.md)
