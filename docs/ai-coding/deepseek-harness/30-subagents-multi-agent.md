# 子 Agent 与多智能体：dsh 怎么调度另一个 agent

> `ctx.subagents` 是个命名 provider 注册表，六种后端共存，把委派分成两类，**一次式**（一个可丢弃的 run，拿一个结果就 dispose）和**可继续**（一个持久子会话，带进程内 Activation，能多轮 FIFO 对话、能冷恢复、能上报给父）。
> 关键判断：可继续子 agent 的唯一队列是 Agent inbox，授权靠确切的直接父 Agent，provider 只参与首次创建、之后整个生命周期归 continuation manager。

## 为什么子 agent 是多 provider 共存

这一节回答一个结构问题：为什么这个接缝不像 bash 那样单实现，而是多个后端共存。

bash、workflow 这些接缝，大多是一个 context 一个实现。子 agent 不一样，把工作委派给另一个 agent，至少有这么多种不同的需求：

- 在同进程里起一个全新的子 agent，干完拿结果。
- 在同进程里起一个继承了父对话历史的子 agent（fork）。
- 通过 ACP 协议和一个外部 agent 进程通信。
- 把工作委派给 Codex、Claude Code 这些外部 agent 产品。
- 通过 dsh SDK 委派。

这些需求的传输机制、上下文继承、生命周期都不同，硬塞进一个 provider 就得在内部到处分支。dsh 的选择是让多个 provider 实现在一个 context 里共存，按名字注册到 `ctx.subagents`。它不学 bash 的单执行器，学的是 LLM 适配器注册表的模式。

当前六个 provider：`spawn-in-process`、`fork`、`acp`、`codex`、`claude-code`、`dsh-sdk`。模型面向的消费者有三个：`tool-subagent`（按 provider 委派）、`tool-subagent-control`（全局的 `send_message`/`interrupt_agent`/`list_agents`）、`tool-subagent-report`（子 agent 范围的 `report` 回报通道）。

## 两类能力，两种发现方式

一个 provider 的能力分两类，发现方式不同，这个差别本身就说明了两种委派的分工。

启动期能力是个静态描述符 `SubagentCapabilities`，四个布尔：`outputSchema`（结构化输出）、`depthLimit`（深度上限）、`toolFilter`（工具过滤）、`persona`（人设）。服务在一次式 run 存在之前就检查它：请求需要某个能力而 provider 不支持，就用 `UNSUPPORTED_CAPABILITY` 大声拒绝，绝不"接受了然后忽略"。这是"fail loud, no silent degradation"规矩的又一次体现。

可继续能力的发现完全不同，靠一个可选方法 `prepareContinuable` 的存在性：方法在，能力就在，用 TS 类型收窄做发现。为什么不同？因为一次式子 agent 是 provider 自己组装的，能力可以提前写成静态标志；可继续子 agent 是 continuation manager 自己组装的，provider 要表态的只剩"愿不愿意参与创建"。

## 一次式 vs 可继续：核心区分

这是整个子 agent 接缝最重要的二分。

### 一次式：一个 run，一个结果

一次式委派返回一个 `SubagentRun` 句柄：一个可丢弃的前台委派，带一个结果。消费者 await `result`，然后总是 dispose 来达到 quiescence。子 agent 失败不 reject，而是 resolve 成非 completed 的停止原因，只有无法表示的基础设施故障才 reject。一个 run 没有 steering、没有 resume。

请求由工具层从模型输入构造。必填的是 prompt 和 parent，后者提供子 agent 的 cwd、lineage 和派生深度；可选的结构化输出、深度上限、工具过滤、人设，每一项都要求 provider 有对应的能力标志，否则 start 时拒。结果 `SubagentResult` 里，`output` 是子 agent 最后一条非空助手消息的内容，`structured` 只在请求了 schema 且成功满足时才有，`stopReason` 是 completed/aborted/error/max-tokens/refusal 之一，可合并扩展。非 completed 意味着 output 可能残缺，消费者把它映射成 isError 工具结果，不把半截输出当成功。

### 可继续：持久会话加 Activation

可继续子 agent 是一个持久子 Session，带至多一个进程内的 Activation，也就是重建的子 Agent 驻留的时期。Activation 不是请求、结果、取消或 Task：它可以执行很多 FIFO turn，在它创建的后代还在跑时保持驻留。

文档给的结构很清楚：

```text
persisted Session
  -> optional live Activation
       -> one retained AgentHandle
       -> Agent inbox as the only turn FIFO
       -> zero or more owned child Activations
```

continuation manager 拥有 activation 准入、直接父授权、活的归属图、冷恢复、子优先的销毁；Agent loop 拥有所有 turn 排序和执行。没有可继续路径创建 Task 或中间的带结果包装器。

## continuation 机制详解

可继续子 agent 的生命周期由几个操作撑起：followup 送消息、interrupt 停止、report 回报，外加 manager 自己的结算通知。

### followup：路由取决于 Activation 驻留

`followup` 是唯一的续消息操作，路由只取决于 Activation 状态：

| Activation 状态 | followup 行为 |
|---|---|
| running | 在同一个 Activation 入队 |
| waiting | 唤醒同一个 Activation |
| 没有 Activation | 冷恢复一个新 Activation |

`running` 是 Agent 有活跃的准入或 turn；`waiting` 是它静默了但仍拥有至少一个没完成销毁的子 Activation；`settled` 是静默且所有子都销毁了，这时 manager 销毁 AgentHandle 移除 Activation。

**Agent inbox 是唯一队列。** 每条续消息变成一个 `Agent.followup()` FIFO turn，所以被接受的消息有唯一可观察顺序，一个 follow-up 没法重定向一个已经在进行的 turn。这避免了"两条消息交织把 turn 状态搞乱"，和 terminal 的"独占发送"是同一种考量。

### 授权：靠直接父，不靠消息来源

follow-up 的授权来自一个确切的 live Agent 工具上下文。被认证的 Agent 必须是持久子 agent 的直接父，记录在 `SessionHeader.parentSession`。`MessageSource` 和 `senderSessionId` 记录谁提供了消息，但不授予权威。

**权威来自活的直接父 Agent 对象，不是消息载荷里的字段。** 消息上写着谁发的，不等于谁有权发。这和 jobs 的"靠 owner 不靠 id 保密"、approval 的"agent-scoped 监听器"是同一类安全姿态。

### 信号只在 inbox 接受前拥有

对 startContinuable 和 followup 两个操作，调用方的 signal 只在查找、物化、准入阶段拥有，直到 inbox 接受为止。之后 manager 独立拥有 Activation：后来的调用方取消既不取消已接受的 turn，也不销毁子 agent。接缝不暴露任何 steering 操作。

这是个明确的所有权转移点：消息一旦进了 inbox，调用方就管不着了。这防止了"消息发出去之后又反悔撤回"导致的不一致。

### interrupt：唯一的公共停止

`interrupt(targetSessionId, authority)` 是唯一的公共停止。它同步授权，对活目标发 `Agent.cancel(cause, { keepInbox: true })`，不 await quiescence 就返回。Activation、未认领的 pending inbox 工作、已发布的后代都不动；已经认领进被中断 turn 的工作不重新入队。被中断的 driver 空闲后，一个唤醒的 send 恢复停着的 FIFO 队列。

授权两种：`user`（人客户端呈现的持久直接父地址）或 `ancestor`（确切的 live Agent 对象，其记录的 lineage 必须包含调用方）。不匹配的父地址或调用方在 live ancestry 之外的，`UNAUTHORIZED` 拒绝。

### report：子主动给父发消息

`reportFrom` 让一个活的可继续子 agent 把选定内容发给它的持久直接父。子 agent 本身就是权威凭证，调用方不能指定接收者。manager 从子的持久 `parentSession` 派生唯一接收者，要求那个父 Agent 是活的，把内容框成一条 `subagent-report` user 消息。

投递方式由部署的策略字段决定，两种：`quiet` 用 `Agent.inject()`，不唤醒父；`next-step` 用 `Agent.steer()`，父空闲就唤醒，父在跑就并入最近的 step 边界。两种都不结束子的 turn，也没有隐式的最终答复。

reporting 是子自己的选择，所以 manager 单独记自己的账：当一个驻留的 Activation 结算时，它给子的持久直接父发一条通知，描述这个 epoch 怎么结束的、带它最后的 assistant 内容。这条投递对所有 id 被调用方收到的子是无条件的，发生在会让父被判 settled 的归属释放之前。它的来源是个不同的 kind（`subagent-settled`），这样 transcript 永远不会把 manager 的运行时陈述呈现成子写的东西。这和 attachment、approval 的"审计与 transcript 分离"一脉相承。

## 六种 provider 的差异

六个 provider 最核心的差异是怎么创建子 agent，尤其是是否继承父上下文。`inheritsParentContext` 描述的只是对话 seeding，fork 是 true，spawn 和 acp 是 false，它不暗示继承工具、服务或权威：

- **spawn-in-process**：同进程全新子 agent，每个子拿一个新的扁平 scope，不继承父的注册。深度为父深度加一。
- **fork**：同进程，但用 `CreateAgentOptions.seed` 把父日志的一个平衡的已完成 turn 前缀喂给子会话。这个 seed 从 seq 0 连续，invariants 重放能接受，进行中的、不平衡的 turn 被排除。fork 让子看到父的已完成对话历史。
- **acp**：通过 ACP 协议和一个外部 agent 进程通信，只读 cwd，且仅当没配部署 cwd 覆盖时。
- **codex / claude-code**：委派给外部 agent 产品，是产品级 provider。
- **dsh-sdk**：通过 dsh SDK 委派。

provider 只参与首次创建：一次式的 `start`，或可继续的 `prepareContinuable`。可继续子 agent 的冷恢复根本不分发给 provider，manager fold 通用的 descriptor，通过同一个 activation-owner scope 调 `ctx.agents.resume()`，提交等待的 turn。provider 返回的 `ContinuableCreateSpec` 只带 detached 的 provider 专属创建输入，当前只有可选的父历史 seed，不带 Agent、句柄、prompt 投递、结果、销毁或 resume 操作。**provider 只贡献首次创建的数据，之后的整个生命周期归 continuation manager**，这是这个接缝的硬规矩。

## 深度与 fork seeding

这一节讲两个复用既有词汇的小机制：委派深度和 fork 的 seed。

委派深度是持久的 `SessionHeader.delegationDepth` 加上可合并扩展的运行时字段 `AgentOptions.subagentDepth`。缺省表示顶层深度零，较大的存在值权威。接缝拥有这两个字段，loop 既不设也不读，所以一个进程内子持久化父深度加一，冷恢复不能降低它，每次 start 拒绝落在安全整数域外或超过绝对 `maxDepth` cap 的派生深度。这条"深度只能增不能降"的规矩，防止子 agent 把自己降回顶层绕过深度限制。

fork seeding 同样复用既有词汇：`CreateAgentOptions.seed`，一个 `SessionEvent[]` 前缀，穿过 `AgentLoop.createAgent` 到 `ctx.sessions.prepare({ seed })`，和 `ctx.agents.resume()` 用的是同一个原语。

## 持久枚举：listChildren 与 listDescendants

枚举子 agent 是纯读操作，不加载也不 resume 任何 Agent，也不用 query service。`listChildren(parentSessionId)` 合并 live 会话存储和可选的持久化（live-preferred），候选项是持久头部带 `origin: 'subagent'` 的直接子。

每个子的 mode/label 从注册的 `subagent` 投影单元提供，走一个三级阶梯：注册表的水位缓存（活子，零日志读）、可选的投影检查点缓存（冷子，当 own-suffix seq 闸门通过时最终）、否则一次持久化 inspect 经注册表 fold。缓存是纯可选加速器：缺失或失败就静默退回权威的 refold。

`subagent/descriptor` 投影 fold 是 last-wins：子自己的 descriptor 覆盖一个 fork-seeded 祖先的。malformed 或未知版本的载荷 fold 成一个可序列化的 `null` 哨兵，当无值处理。

`listDescendants` 把同样的逻辑应用到根的完整后代树，稳定前序遍历。普通会话和一次式子仍是遍历节点，所以它们下面的可继续后代会被发现。

## 真实代码落点

- `packages/subagent/subagent/src/types.ts`、`index.ts`、`continuation.ts`：`SubagentRuntime`、`SubagentProvider`、continuation 机制。
- `packages/subagent/subagent/src/descriptor.ts`：`SubagentDescriptorData`，模式判别的持久身份。
- `packages/subagent/tool-subagent`、`tool-subagent-control`、`tool-subagent-report`：三个消费者。
- 六个 provider 包：`subagent-spawn-in-process`、`-fork`、`-acp`、`-codex`、`-claude-code`、`-dsh-sdk`。

## 权衡：这套接缝的成本和回报

成本主要压在可继续那一半。Activation 驻留状态、冷恢复、归属图、子优先销毁，这套机制比一次式 run 重得多，需要简单委派拿结果的场景，一次式 spawn 就够。provider 在首次创建之后就被隔离在外，没法在子 agent 的后续 turn 里插手，这是把生命周期集中到 manager 换来的代价。授权只认活的直接父，安全，但祖父得通过父中转。深度只能增不能降，防绕过，代价是一个设得太高的子 agent 没法事后收紧。外部 provider（codex/claude-code）把工作委派给不受 dsh 控制的产品，`inheritsParentContext` 这类描述基于 dsh 侧的契约，外部实际行为以产品为准。

回报是同一个接缝覆盖了完整的委派谱系。从同进程的一次式委派，到继承父历史的 fork，到跨协议的 ACP，到跨产品的 codex 和 claude-code，再到 dsh SDK，全部用同一套请求、结果、授权、枚举词汇。可继续那一半虽然重，但多轮对话、冷恢复、上报都落在标准机制上：队列就是 Agent inbox，恢复就是 `ctx.agents.resume()`，消息就是普通的 user message。

## 结论

`ctx.subagents` 是个多 provider 共存的命名注册表，把委派分成一次式和可继续两类：前者拿一个结果就 dispose，后者是持久子会话加进程内 Activation。可继续那一半的三条关键设计是 Agent inbox 唯一队列、授权靠活的直接父对象、provider 只贡献首次创建的数据而生命周期归 continuation manager。代价是机制的复杂度，回报是从同进程委派到跨产品、跨协议、可恢复的协作，都能用同一套词汇表达。

## 延伸阅读

- [Subagent 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md)：本文主要依据，含一次式与可继续的全部契约
- [Subagent capability seam 笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-06-21-subagent-capability-seam.md)：接缝设计理由
- [Continuable subagent conversations 笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-07-28-continuable-subagent-conversations.md)：可继续子 agent
- [Codex and Claude Code subagent backends 笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-08-04-claude-code-and-codex-subagent-backends.md)：产品级 provider 理由
- [Scoped Agent Registration](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/12-scoped-agent-registration.md)：scoped 注册与 lineage

上一篇：[Plan Mode 与 Goal：dsh 怎么管理目标和计划](./29-plan-mode-and-goal.md)
下一篇：[web-schedule：dsh 会话内的定时、提醒与自动化](./31-web-schedule-timer-automation.md)
