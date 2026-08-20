# Jobs 与 Workflow：后台任务与工作流编排

> 如果只能从这篇带走一句话：`dsh` 把"长跑的活"分成两个不同层次，`ctx.jobs` 是通用的后台任务注册表（管身份、归属、生命周期，bash 和子 agent 都注册在这里），`ctx.workflowEngine` 是建在上面的编排脚本引擎（模型写一段脚本，用编程逻辑扇出多个子 agent）。
> 两者共享一个纪律：失败永远走结果字段而非异常，活的生命周期边界比自身更底层，归属授权靠 owner 不靠 id 保密。

## 为什么是两个不同的东西

agent 干活时，经常有两类"不是一步就能做完"的活：

- **后台长跑任务**：起一个 `npm run dev`、跑一个长时间构建、起一个子 agent 委派任务。这些活需要一个统一的身份、归属、读取、取消、等待机制。
- **带逻辑的多 agent 编排**：根据中间结果决定下一步、并行起多个子 agent、流水线式地传递数据。这种需要一个能跑编排逻辑的引擎。

很多人会把它们揉成一个"任务系统"。`dsh` 拆成两个接缝，因为它们要的东西不同。后台任务要的是**生命周期管理**（谁起的、能不能读、怎么停、什么时候算完）；编排脚本要的是**执行逻辑**（循环、并行、流水线、按结果分支）。

有意思的是，这两个层次不是平行的：编排脚本里扇出的子 agent，本身也是注册在 `ctx.jobs` 上的后台任务。也就是说，workflow 用 jobs 做底层的任务生命周期，自己在上面加编排逻辑。

## 后台任务注册表：`ctx.jobs`

`ctx.jobs` 的服务类型是 `JobRegistry`，定义在 `packages/jobs/jobs`。它管的是"一个长跑的活从起到终"的全部生命周期。

### 身份与归属

`JobId` 是个 branded id，格式是 `<kind>-N`（比如 `bash-3`、`subagent-1`）。job kind 来自一个可合并扩展的 map，当前有两个：`bash` 和 `subagent`。注册表把每个 kind 当成不透明的 id 命名空间。

关键的安全判断：**访问控制靠 owner 授权，不靠 id 保密**。id 是可预测的（`bash-3` 谁都能猜到），所以安全边界不能建立在"别人猜不到 id"上，而要建立在"这个 job 归哪个 owner、调用方是不是那个 owner"上。授权比的是 owner 的 session id。

### 生产者契约：谁拥有什么

这是 jobs 设计的核心切分。`JobStart` 声明身份、label、可选的输出上限、owner，加一个 starter。运行时在调 `run()` 之前完成 preflight（访问校验、清理登记），调完之后提交，**之后没有可失败的步骤**。

切分是：**生产者拥有执行资源，运行时拥有身份、访问、生命周期状态。** 起一个 bash 后台进程，进程本身归 bash 执行器（生产者）管，但这个 job 的 id、谁能读它、它现在是 running 还是 completed，归 jobs 运行时管。

`JobHooks` 是运行时控制和观察生产者工作的钩子：

- `cancel(reason?)`：请求终止，必须同步、幂等、最终结算 `done`。
- `done`：一个 Promise，**在生产者释放资源之后** resolve，不只是工作完成。不许 reject（运行时把 rejection 转成 `failed`）。
- `readOutput?`：可选，消费自上次以来的输出增量。没有这个的是"只给最终输出"的 job；有这个的是流式 job。每个 job 一个消费游标。

`done` 的语义值得记住：它 resolve 的时机是"资源释放完"，不是"工作做完"。一个 job 可能工作做完了但还在清理资源，这时 `done` 还没 resolve。这保证了 await `done` 之后，生产者的资源一定释放干净了。

### 结算：先到先得

结算（settlement）是 first-wins 的：一个终态记录、释放所有等待者、一轮隔离的监听器通知，哪怕面对一个迟到的生产者结果。完成通知是**最后**发的，在记录提交、所有其他观察者都看过结算之后，因为一个 reporter 可能同步地开一个模型 turn。

这条"完成最后通知"的规矩很关键。如果完成通知先发，一个 reporter 开 turn 时可能还没看到最终记录，状态就不一致。把通知放到最后，保证 reporter 看到的是已提交的终态。

### attachController：没有控制器就不让起

`start` 在"没有挂载的 job controller 服务这个 owner"时会拒绝工作。也就是说，一个生产者不能起一个"owner 收集不了也停不了"的 job。controller 通过 `attachController(name)` 挂载，它能读和停 job，服务它注册上下文 scope 覆盖的 owner。

这条规矩把"起了一个没人管的活"的漏洞堵死了。一个 job 起来时，必然有一个 controller 能读它、停它，否则根本不让起。

并发上限方面，本地 provider 的 `maxConcurrentJobsPerOwner` 默认是 `10`，按确切 owner 数 running 加 stopping 记录，未归属的 job 共享一个桶。终态结算释放容量。

### tool-jobs 消费者

`dsh-tool-jobs` 是模型面向的消费者，它把 jobs 注册表的能力暴露成模型能用的工具（查 job 列表、读输出、停 job、等 job）。模型通过它管理自己起的后台任务。

## 工作流引擎：`ctx.workflowEngine`

`ctx.workflowEngine` 是另一个层次，定义在 `packages/workflow/workflow`。它让 agent 跑一段模型写的**编排脚本**，脚本里能起子 agent。

和 bash 一样，它**每个 context 只允许一个引擎实现**提供 `ctx.workflowEngine`，没有命名 provider 注册表（第二个引擎通过插件配置替换第一个，而不是并存）。这和 `ctx.jobs` 的多生产者、`ctx.lsp` 的多 provider 都不同，是因为引擎的语义更重，替换比并存更合理。

### 启动请求：脚本加数据

`WorkflowStartRequest` 是调用方起一次 run 时给的：

```ts
interface WorkflowStartRequest {
  script: string                  // 纯 JS 脚本体，顶层 await 可用，以 return <json> 结束
  meta: WorkflowMeta              // 身份块，纯 JSON 数据
  args?: unknown                  // 可选输入，原样暴露给脚本作为 args 全局
  subagentProvider?: string       // 可选的引擎级子 provider 覆盖
  maxTotalAgents?: number         // 可选的本次子 agent 总数上限
  parent: Agent                   // 必填，每个子 agent 归属到它
  signal?: AbortSignal
}
```

几个要点：

- **`meta` 和 `args` 是纯 JSON 数据**。引擎在跑脚本**之前**按 schema 校验 `meta`，校验不过就大声拒绝，**绝不为了拿 meta 去执行任何脚本文本**。这是个安全细节：身份块是数据，不是代码，不能靠跑脚本去获得。
- **`parent` 必填**。脚本里每个 `agent()` 起的子 agent 都归属到这个活的 parent，cwd、lineage、depth 通过子 agent 接缝传下去。
- **`script` 作为一段 async 函数体跑**，顶层 `await` 可用，以 `return <json-value>` 结束。

`meta` 里的 `phases` 只是进度词汇：`phase()` 调用匹配标题给观察者看，**不蕴含任何执行结构**。别把 phase 当成真正的执行阶段，它纯粹是给人看的进度分组。

### 结果：封闭的停止原因

`WorkflowResult` 是一次 run 的结果：

```ts
interface WorkflowResult {
  value: unknown                  // 脚本的返回值（宿主 JSON 数据），仅 completed 有意义
  stopReason: WorkflowStopReason  // completed | cancelled | error，封闭联合
  error?: string                  // 非 completed 时带失败信息
  agentsStarted: number           // 整个生命周期接受了多少 agent() 调用
}
```

`stopReason` 是封闭联合。非 completed 的原因在 `error` 里带失败信息，消费者把它映射成 `isError` 工具结果，**绝不把部分输出当成功报告**。

### 活的 run：结果永不 reject

`WorkflowRun` 是消费者在脚本执行期间持有的句柄。消费者 await `result`、可以中途 `cancel`、**必须在每条路径上 `dispose`**。

两条硬规矩：

- **`result` 永不 reject**。脚本失败 resolve 成 `stopReason: 'error'`。这和 jobs 的 `done` 不许 reject、code runtime 的错误是字段，是同一套纪律：失败走结果字段，不走异常。
- **取消是有界的**。一旦 run 被取消，它在引擎的有界 grace 内结算，哪怕脚本自己永远不结算（引擎强制结算 `cancelled`，worker-thread 引擎然后终止脚本的 worker）。所以一个 await `result` 的消费者，永远不会因为脚本卡死而被楔住。`dispose()` = cancel 加有界结算加子 agent quiescence，它绝不会挂在卡死的脚本上。

### 失败纪律：fatal 错误大声死

`WorkflowError.fatal` 是个很重要的设计。脚本里的 hook 误用（坏参数、未知或延迟的 `agent()` 选项、schema 不在结构化输出子集里、触顶、接缝启动失败、取消）会抛一个 `fatal: true` 的 `WorkflowError`。

`parallel()`/`pipeline()` 组合子对 fatal 错误是**重新抛出**，而不是把这一项映射成 `null`。为什么？因为一个拼错的选项必须让脚本大声死掉，绝不能溶解成一个看起来像普通子 agent 失败的东西。**每项的 `null` 是留给子 run 失败（非 completed 的停止原因）和普通阶段内脚本错误的**。

这条纪律区分了两种失败：脚本的 bug（fatal，该让整个脚本死）和子 agent 本身的失败（每项 null，该被容错处理）。把它们混了，要么 bug 被静默吞掉，要么子 agent 失败把整个脚本搞崩。

### agent() 经子 agent 接缝扇出

脚本里的 `agent()` 调用，经 `ctx.subagents` 扇出。每个 `agent()` 起一个子 agent，归属到 run 的 parent。`agentsStarted` 统计的是整个生命周期接受的 `agent()` 调用数。

这些子 agent 同时也是 `ctx.jobs` 上的 `subagent` kind 后台任务。这就是前面说的"workflow 用 jobs 做底层任务生命周期"：workflow 引擎负责编排逻辑，jobs 注册表负责每个子 agent 的身份、归属、生命周期。两层协作，不是替代。

### 事件：只观察，给数据快照

`workflow/*` 事件（`workflow/start`、`workflow/phase`、`workflow/log`、`workflow/agent-start`、`workflow/agent-end`、`workflow/end`）是**只观察**的 emit，携带**数据快照**：

- 每个 payload 以 `WorkflowRunInfo`（id 加 meta）开头，**永远不是活的 `WorkflowRun`**，所以订阅者拿不到 `cancel`/`dispose`。
- `workflow/end` 故意省略结果值。一个观察结果的监听器，绝不能收到调用方结果的可变别名。
- 每个 emit 是每监听器隔离的：抛错的订阅者只记日志、不传播、不会饿死后面的监听器；每个监听器收到自己的 payload 克隆，改它不会污染引擎或别的监听器。

这套隔离和子 agent 的 `subagent/start`/`subagent/end` 是镜像的。

## 结构化输出

workflow 脚本以 `return <json-value>` 结束，返回值是宿主领域的纯 JSON 数据。`WorkflowResult.value` 就是这个物质化的返回值（脚本没 return 东西时是 `null`）。

文档里还提到一个"结构化输出子集"（structured-output subset）：`agent()` 调用可以带 schema，但 schema 必须落在这个子集里，超出会触发 `fatal` 错误。这把"子 agent 返回结构化数据"约束在一个安全可校验的范围内。

`Ralph` 在仓库里对应 `packages/workflow/tool-ralph`，是 workflow engine 的一个固定 consumer，提供面向模型的 `ralph` 工具：把一个不可变的目标（objective）依次交给一连串**全新的子 agent** 执行——每轮启动一个不继承父上下文的新子 agent，以共享工作区当长期记忆，靠结构化的"交接报告"（handoff，含 continue/complete/blocked 状态、摘要、证据、后续步骤）在轮次间传递状态，报告在工作流内和消费边界做双重校验。这就是社区所说的 "Ralph 循环"（Geoffrey Huntley 推广的 Ralph Wiggum 模式：反复派全新 agent 处理同一目标，直到它自报完成）。README 特别强调 Ralph 只是普通插件，构建在 `ctx.workflowEngine` 和 `ctx.subagents` 之上，agent-loop 里没有加任何"Ralph 模式"。它要求的"一条全新结构化输出路由"落在这里：每轮经 `subagentProvider`（默认 `spawn`）启动子 agent，该 provider 必须支持结构化输出且报告 `inheritsParentContext: false`；provider 由部署配置作为 `WorkflowStartRequest.subagentProvider` 传入固定脚本，模型拿不到路由选择权。限制也诚实：完成与否靠子 agent 自报（无独立评估者）、仅前台运行、普通子 agent 失败即终止整个运行、只有轮数上限（`maxTotalAgents`）没有 token/价格/时间预算。

## 真实代码落点

- `packages/jobs/jobs/src/types.ts`：`JobStart`、`JobHooks`、`JobOutcome`、`JobSnapshot`、`JobKindMap`。
- `packages/jobs/jobs/src/index.ts`：`JobRegistry` 抽象接缝。
- `packages/jobs/jobs-local`：进程内 provider，`maxConcurrentJobsPerOwner` 默认 10。
- `packages/jobs/tool-jobs`：模型面向的消费者。
- `packages/workflow/workflow/src/types.ts`、`runtime-types.ts`：workflow 词汇表与 run 句柄。
- `packages/workflow/workflow-worker-thread`：`node:worker_threads` 引擎，每次 run 一个 worker。
- `packages/workflow/tool-workflow`：模型面向的消费者。

## 权衡与局限

**workflow 一个 context 只能有一个引擎。** 和 bash 一样，没有命名 provider 注册表。想同时跑两种不同语义的编排引擎不行，得通过配置替换。这是用"替换"换"语义一致"的取舍。

**job id 可预测，安全靠 owner。** 这要求所有访问路径都老老实实做 owner 校验。一个忘了校验的路径就是漏洞。这是把安全建立在"每次访问都授权"而不是"id 保密"上的代价。

**workflow 脚本是模型写的代码，有风险。** 和 code runtime 一样，模型写的脚本可能有害。meta 是数据不执行这点防了一部分，但脚本体本身要靠沙箱、审批、子 agent 的权限策略兜底。worker-thread 不是安全边界（回忆 code runtime 那篇，isolation 是诊断标签不是安全承诺）。

**dispose 必须在每条路径调用。** 消费者的责任。忘了 dispose 会在有界 grace 内被强制结算，但这是兜底，不是借口不管。

## 结论

`ctx.jobs` 是通用后台任务注册表，管身份（`<kind>-N`）、归属（owner 授权不靠 id 保密）、生命周期（first-wins 结算、完成最后通知、没 controller 不让起）。bash 和子 agent 都注册在它上面。`ctx.workflowEngine` 是建在上面的编排脚本引擎，模型写脚本用编程逻辑扇出子 agent，子 agent 经 `ctx.subagents` 起、在 jobs 上注册。

几个判断值得带走：两层共享"失败走结果字段不走异常"的纪律（jobs 的 done 不 reject、workflow 的 result 不 reject）；活的生命周期边界放在比自身更底层的地方（jobs 的 producer 资源、workflow 的 worker）；归属授权一律靠 owner 不靠 id 保密；workflow 的 fatal 错误大声死、每项 null 留给子失败，两者不能混。

这套分层让"一个长跑的活"和"一段带逻辑的编排"各自有干净的抽象，又能协作：workflow 编排逻辑，jobs 管底层任务生命周期，子 agent 是两者的交汇点。

## 延伸阅读

- [Background Task Runtime 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/jobs.md)：本文主要依据之一，含生产者契约与注册表语义
- [Workflow 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/workflow.md)：本文另一主要依据，含脚本、meta、run、失败纪律
- [Generic long-running tool runtime 笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-06-20-generic-long-running-tool-runtime.md)：jobs 的设计
- [Dynamic workflows 笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-07-05-dynamic-workflows.md)：workflow 的提案与理由
- [Capability Seams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)：`ctx.jobs`、`ctx.workflowEngine` 行

上一篇：[Code Runtime 与 Code Mode：模型写代码并执行](./23-code-runtime-and-code-mode.md)
下一篇：[Web 搜索抓取与 Skills 技能系统](./25-web-search-fetch-and-skills.md)
