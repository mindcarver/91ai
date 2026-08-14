# Plan Mode 与 Goal：agent 怎么管理目标和计划

> 如果只能从这篇带走一句话：`dsh` 用两个不同重量的机制管理"agent 在干什么"，`ctx.planMode` 是**软引导**（激活时往每个请求塞一段提示，模型可以不听，不强制任何限制），`ctx.goals` 是**持久的事件溯源目标生命周期**（阶段、修订号、轮次预算，靠会话日志 fold 出来）。
> 两者共享一个根基：状态都记在会话日志里、用纯 fold 恢复，都和硬性强制（沙箱、审批）分开。

## 为什么目标管理是两个机制

让 agent 管理目标，最朴素的想法是给它一个"当前目标"字段。但仔细想，"管目标"至少有两个层次不同的需求：

- **引导模型先规划再动手**：在改代码前先产出一份计划给人审。这是一种**协作姿态**，不是硬约束。模型可以不听，但它被引导着先想后做。
- **追踪一个长期目标的进展**：这个目标是什么、现在进行到哪一步（活跃、暂停、卡住、完成）、已经跑了几轮、还能跑几轮。这是**持久状态**，要跨重启恢复、要防并发改坏。

很多人会把这两个揉成一个"目标系统"。`dsh` 拆成两个，因为它们的重量和语义完全不同。Plan mode 是轻的、软的、只是个提示段；goal 是重的、持久的、有生命周期和修订号。

两者还有一个共同点：都和硬性强制分开。Plan mode 明确是"软引导"，沙箱和审批各自独立强制，不读不写 plan 状态。Goal 的强制也分两层：持久阶段回答"目标怎么了"，进程内 activation 单独回答"续跑消费者能不能再开一轮"。把引导、追踪、强制三者分开，是这一篇的主线。

## Plan Mode：`ctx.planMode`

`ctx.planMode` 的服务类型是 `PlanModeController`，定义在 `packages/plan/plan-mode`。它是个可选包，agent loop 不依赖它。

### 软引导，不是限制

文档开篇就把定性钉死：**Plan mode 是软引导。** 激活时，一个部署拥有的引导段（`plan:policy`）被放进每个模型请求。仅此而已。沙箱模式和审批策略各自独立强制限制，两者都不读也不写 plan 状态，部署分别配置它们。

这意味着 plan mode 激活，不等于"agent 不能改文件"。沙箱是不是允许写、审批是不是要问，和 plan mode 无关。Plan mode 只是在提示里加一段"你现在在规划模式，先出计划"，模型听不听、听多少，取决于模型自己。这是个非常重要的区分：**引导不等于强制**。

它贡献三样东西：`plan:policy` 提示段（顺序 50）、`exit_plan_mode` 工具、`/plan` 命令。

### 日志状态与 fold 恢复

`plan/mode`（`{ active: boolean }`）是个纯日志、整值替换的会话事件：持久、可重放、**永不进模型 transcript**。`foldPlanMode(events, end?)` 返回前缀里最后一条记录的值，没有就返回 `false`。

关键设计：**生效的状态永远是会话日志的一个纯 fold。** 没有 live mirror。所以 resume、fork、compaction 都能恢复它，UI 通过 `session/event` 观察已提交的翻转。这和 compaction 的"状态从日志投影"、goal 的"从事件 fold"是同一套思路：状态不另存，从日志派生，天然可恢复。

### turn 边界 flush：pending 选择

这是 plan mode 最精巧的部分。因为每个会话事件都被 turn 包住，一个用户选择会保持 pending，直到下一个被接受的 in-turn pre-step 在请求派生之前追加它。**一个选择永远不强制 continuation**。

`set(agent, active)` 返回四种结果：

- `committed`：turn 之间调用，立即追加（因为没有 in-turn pre-step 会跑，直到下一个 prompt 开 turn）。
- `queued`：turn 开着，选择 pending，等下一个被接受的 in-turn pre-step。
- `cancelled`：一个相反的 pending 选择被清掉了（已记录的状态已经匹配）。
- `noop`：已经在这个状态。

`get(agent)` 返回 `{ active, pending? }`：用于组装当前 step 的已记录状态，加上等着被追加的已选状态。

为什么这么讲究 turn 边界？因为 plan 状态影响每个请求的提示段。如果在请求派生到一半改状态，就会出现"这个请求一半用了旧状态一半用新"的撕裂。把追加点固定在"下一个被接受的 in-turn pre-step、请求派生之前"，保证一个请求看到的状态是自洽的。

agent 跑着的时候，唯一的追加点是一个 prepend 的 `agent/pre-step` 监听器。它观察每个提议的请求 step（包括 turn 1 step 1 和请求恢复重试），先调下游监听器，只在它们接受 step 之后才追加。prompt 录入发生在 turn 之前，没法追加 `plan/mode`，所以在 prompt 时做的选择，由那个 turn 的第一个被接受的 in-turn pre-step 追加。

追加失败不能阻塞 turn，选择保持 pending 等下一个。一个已追加的用户选择还记一条 plugin 来源的 `user/message` 通知，但**只在上次记录的请求头描述的是另一个状态时**才记，这样模型只在上下文真变了时被通知一次，绝不冗余。

一个已知限制：在 turn 最后一个被接受的 pre-step 之后做的选择，保持进程本地，如果进程在另一个被接受的 in-turn pre-step 之前退出，就丢了。这是"turn 边界 flush"的代价：选择不是立即落盘的，要等合适的追加点。

### exit 工具与 /plan 命令

`exit_plan_mode` 工具在 plan mode 不激活时也保持注册，所以进出 plan mode 只改提示段，**永不改请求的工具目录**；在 plan mode 外执行它就失败。在 plan mode 里，它要求一份以 `#` 标题开头的完整 markdown 计划，通过 user-questions 接缝呈现给人审。批准返回 `{ approved: true }`，记一个静默（不叙述）的 pending 退出，在下一个被接受的 in-turn pre-step 追加。

所以 plan 引导在 assistant 当前工具批的剩余部分仍然激活，工具结果自己报告这个转换。"继续规划"是一次失败的调用，带着用户的反馈，模型修改后再呈现。缺少交互通道、或审查期间服务重载，也会让调用失败，而不是静默留在 plan mode 里。

`/plan [off|message]` 命令：裸 `/plan` 选 plan mode；任何非空消息选它然后用 `agent.steer()` 提交文本，让它在 plan 引导下成为下一步的普通已记录用户消息；`off` 选不激活，也取消一个还没追加、还没对请求可见的 pending 进入。

## Goal：`ctx.goals`

`ctx.goals` 的服务类型是 `GoalService`，定义在 `packages/goal/goal`。它解决的是"追踪一个长期目标的持久生命周期"。

### 身份与生命周期

`GoalId` 是 branded id。调用方通过 `GoalRef`（id 加正数 revision）修改一个确切的修订；每个被接受的持久变更让 revision 加一。这是**比较并交换**（compare-and-set）语义：你要改目标，得带上你以为是当前的 revision，防并发改坏。

持久阶段回答"目标怎么了"：

```ts
type GoalPhase = 'active' | 'paused' | 'blocked' | 'complete'
```

`blocked` 是唯一一个"因为一个问题停了"的持久状态。它的策略拥有的 reason 带一个稳定的小写 kebab-case code（用于路由）和一个自由文本 explanation（给人也给模型看）。

### 持久 vs 进程内：两层分离

这是 goal 设计最重要的切分。**持久阶段回答目标怎么了，进程内 activation 单独回答续跑消费者能不能再开一轮。**

`disarm` 移除进程内的续跑授权，**不改持久目标阶段或 revision**。生命周期拥有者在卸载一个 driver 前用它；之后一个人授权的 `resume` 记录新的 activation 边。

为什么分两层？因为"目标还活着"（持久状态）和"现在这个进程能不能继续跑它"（进程内 activation）是两个问题。进程崩了重启，目标的持久阶段还在（active），但进程内 activation 没了，得显式 resume 重新 arm。这避免了"进程一恢复就自动狂跑"的不受控续跑。

`GoalView` 里的 `activation` 字段是进程内的，**永不持久化**。这和 `roundsStarted`、`createdAt` 这些从日志派生的值并列，但性质不同：派生值跨重启一致，activation 不跨。

### 从日志 fold

每个变更都是一个持久的 `goal/change` 会话事件，载荷是完整的变更后快照或一个 clear 墓碑。严格的 fold 和持久化投影只从这些事件派生生命周期状态；inbox 变更不影响目标状态。

续跑消费者给每个被接受的 user-message turn 归属一个正的、顺序的轮次号和当前 revision；只有这些被接受的 `user/message` 事件推进 `roundsStarted`。重放拒绝非正轮次、间隙、stale revision、停了的阶段、cap 溢出。

这套设计让 goal 完全由会话日志支撑：目标状态、轮次、修订，全是事件的 fold。没有独立的 goal 数据库，日志就是真相。这和 plan mode 的 `plan/mode` 事件、compaction 的状态投影一脉相承：状态从日志派生，天然可重放、可恢复。

### 操作

`GoalService` 的操作：`get`、`disarm`、`create`（完成的 goal 可被替换，其他当前阶段得 clear 或 resume）、`edit`（至少改一个字段）、`pause`、`resume`（在轮次预算还有容量时 arm 一个停了的目标，或 session-start 边后 rearm 一个活跃目标）、`complete`、`block`、`clear`（保留持久墓碑和历史）。

`create` 把调用方省略和部署选择分开：省略的轮次 cap 由服务配置内部解析。每次变更通知带被接受的操作和确切 revision；clear 省略 `goal`。服务强制确切 live agent 身份和比较并交换变更，发出隔离的 `goal/changed` 通知。

## 两者怎么协作与对比

把 plan mode 和 goal 并排看：

| | Plan Mode | Goal |
|---|---|---|
| 重量 | 轻，一个提示段 | 重，完整生命周期 |
| 强制 | 软引导，不强制 | 持久阶段加进程内 activation 两层 |
| 状态来源 | `plan/mode` 事件 fold | `goal/change` 事件 fold |
| 防并发 | 无（布尔状态） | compare-and-set revision |
| 轮次预算 | 无 | maxGoalRounds，roundsStarted |
| 进模型 transcript | 不进（提示段是部署拥有的引导） | 派生值可给模型看 |
| 与硬强制关系 | 明确分开，沙箱审批独立 | activation 与持久阶段分开 |

两者共享的根基：状态都记在会话日志里、用纯 fold 恢复、都不和硬性强制耦合。Plan mode 是"我引导模型先规划"，goal 是"我追踪一个目标的持久进展"。一个实际场景里它们可以并存：用户开 plan mode 让 agent 先出计划，计划批准后退出 plan mode，agent 在一个 goal 下执行，goal 追踪轮次和阶段。

## 真实代码落点

- `packages/plan/plan-mode/src/index.ts`：`PlanModeController`、`plan/mode` 事件、`exit_plan_mode` 工具、`/plan` 命令、`plan:policy` 段。
- `packages/goal/goal/src/types.ts`：`GoalRef`、`GoalPhase`、`GoalSnapshot`、`GoalView`、`GoalBlockReason`。
- `packages/goal/goal/src/index.ts`：`GoalService` 操作。
- `packages/goal/goal/src/domain.ts`：`goal/changed` 事件、fold 逻辑。

## 权衡与局限

**Plan mode 是软引导，模型可以无视。** 它没有强制力。如果模型在 plan mode 里还是直接动手改文件，plan mode 拦不住（沙箱和审批才拦得住）。这是把"引导"和"强制"分开的代价：引导是建议，不是锁。

**Plan mode 的 pending 选择有丢失风险。** 在 turn 最后一个 pre-step 之后做的选择，进程退出前没等到下一个 pre-step 就丢了。这是 turn 边界 flush 的固有代价。

**Goal 的 compare-and-set 增加调用复杂度。** 每次改要带 revision，stale revision 会被拒。这让并发修改变安全，但调用方得处理拒绝重试。

**Goal 完全靠日志，长目标的日志会变长。** 轮次很多的目标，`goal/change` 和被接受的 `user/message` 事件会累积。fold 的成本随日志增长。不过有持久化投影缓存缓解冷读。

**Plan mode 和 goal 都不在 agent-loop 主干里。** 它们是可选能力。一个最小化的 headless 部署可以两者都不装，agent loop 照常跑。这是"一切皆插件"在目标管理上的体现。

## 结论

`ctx.planMode` 是软引导：激活时往每个请求塞一个部署拥有的 `plan:policy` 提示段，状态是 `plan/mode` 事件的纯 fold，选择在 turn 边界的被接受 in-turn pre-step 追加，`exit_plan_mode` 要求完整计划经人审。它不强制任何限制，沙箱和审批各自独立。`ctx.goals` 是持久的事件溯源目标生命周期：compare-and-set revision、四个阶段、轮次预算、持久阶段与进程内 activation 两层分离，全部从 `goal/change` 事件 fold 出来。

几个判断值得带走：引导和强制分开，plan mode 是建议不是锁；状态都从日志 fold，plan/mode 和 goal/change 都是纯日志事件；goal 的持久阶段回答"目标怎么了"、进程内 activation 回答"能不能再跑一轮"，两层分离防止进程恢复就狂跑；turn 边界 flush 保证请求看到的状态自洽，代价是 pending 选择有丢失风险。

这套设计让"agent 管理目标和计划"这个容易做成大而全话题的事，分成了轻引导（plan mode）和重追踪（goal）两个正交机制，各自有合适的重量，又共享"日志 fold、与强制分离"的根基。

## 时点与诚实声明

本文基于 2026-08-14 的 `deepseek-ai/deepseek-harness` `master` 分支与 `docs/subsystems/plan.md`、`goal.md`。`dsh` 处于 developer preview，下列内容会随版本变：`GoalPhase` 取值、`plan:policy` 段顺序、`/plan` 命令参数、`exit_plan_mode` 的计划格式要求、`maxGoalRounds` 默认与校验规则。

文中关于"plan mode 与 goal 可并存""goal 完全由会话日志支撑、无独立数据库"的描述，前者是依据两者都是可选独立能力的合理推断，后者来自 goal 文档"backed exclusively by the owning session log"的明确陈述。`PlanModeController.set` 的四种返回值（committed/queued/cancelled/noop）及其触发条件来自文档的明确列举。turn 边界 flush 的具体 pre-step 追加机制本次未逐行核对 plan-mode 源码，标记待核实。

## 延伸阅读

- [Plan Mode 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/plan.md)：本文主要依据之一，软引导与 turn 边界 flush
- [Same-session goals 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/goal.md)：本文另一主要依据，事件溯源目标生命周期
- [Plan-specific collaboration state 笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/simplification/2026-07-22-plan-specific-collaboration-state.md)：plan mode 设计理由
- [Persisted same-session goal domain 笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-07-19-persisted-same-session-goal-domain.md)：goal 持久化与激活决策
- [Sandbox](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/sandbox.md) / [Approval](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/approval.md)：plan mode 明确分开的硬性强制

上一篇：[跨会话记忆：session-query / projection / reference](./28-cross-session-memory-query-projection-reference.md)
下一篇：[子 Agent 与多智能体：一个 agent 怎么调度另一个 agent](./30-subagents-multi-agent.md)
