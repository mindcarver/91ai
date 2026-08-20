# 错误处理与容错哲学：一个 agent harness 怎么不崩

> 如果你只能从这篇带走一句话，带走这句：`dsh` 的防御式模式不是理论框架，是七条从真实 bug 里长出来的规则，每条规则对应一类曾经确实发布过或差点发布过的缺陷，规则本身就是为了防止它再次发生。
> 这一篇拆 `docs/defensive-patterns.md` 的七条模式加 `agent/request-error` 恢复机制，看一个全插件化的 agent harness 怎么在不信任外部世界的前提下保持不崩。

## 防御式模式是什么

`docs/defensive-patterns.md` 的开头一句话定了性：

> Hard-won bug-class rules: each pattern below is a class of defect that actually shipped or nearly shipped here, stated as the rule that prevents its recurrence.

这不是理论框架。每一条模式都对应一类曾经确实发布过或差点发布过的 bug。规则本身是"为了防止它再次发生"而提炼的。写生命周期、并发、子进程或销毁代码之前，应该先读这些规则。

这个定位很重要。它意味着这些模式不是"最佳实践"的泛泛而谈，而是具体的、有故事背景的、有失败案例支撑的工程纪律。

## 正交结果独立报告

第一条模式解决的是"一个结果可以同时是好几个状态"的问题。

一个进程可以超时**同时**退出码是 0，因为它 trap 了信号。如果你把 `timedOut` 标志嵌在 `exitCode` 的分支里，调用方会读到一次被截断的运行当成干净的成功。

规则：把每个独立的事实（`timedOut`、`signal`、`exitCode`）放在自己的字段上报告。不要把一个标志的报告嵌在另一个的分支里。

这条规则的本质是：**结果之间可能正交，不要假设它们互斥。** 一个工具调用可以同时"成功了"和"超时了"，一次模型请求可以同时"完成了"和"被取消了"。让调用方看到全部独立事实，由它决定怎么解读。

## 双侧公共契约

第二条解决的是"同一个结果有多种表达方式"的问题。

`LlmAdapter.stream()` 的实现可以 throw，也可以 emit `finish {kind:'error'|'aborted'}`。但 `LlmRuntime.stream()` 只通过 terminal finish chunk 暴露模型请求失败。middleware 和 consumer 的 defect 保持 thrown。

规则：当实现收到一个结果的多种表达时，在返回公共 API 之前归一化它们。文档在类型定义的地方声明归一化后的契约。通过真实 consumer 练习每个来源形式。

为什么这么严格？因为如果消费者不知道一个 caught exception 来自 provider、wrapper、chunk logging 还是它自己的 assembly，它就得猜。猜错了就是 bug。

## 异步状态不是同步状态

第三条是 agent harness 里最容易踩的坑。

`agent.followup()` 没有 per-message 的完成或结果。一个后台 job 的完成和 turn 边界竞争。`reader.close()` 在 EOF 和 disposal 时都会触发。

规则：永远不要把 `agent/status` 或 `whenIdle()` 当成一次 follow-up 的结果。几个排队的 follow-up、steering 和注入的工作可能共享一个 `running` interval，而取消或销毁可以丢弃未启动的 item。

一个真正拥有一次运行的自动化调用方必须**显式定义自己的 interval**，比如从它的 message 的 durable inbox receipt 到下一个 whole-agent `idle`，把任何选定的输出描述为 interval 级别的，而不是因果归因到那条 message。

这个规则双向切割：如果等待的 transition 永远不会发生，wait 就挂住了。所以要显式处理"没有东西可等"的分支。

这条模式解释了为什么 ACP server（33 篇）的 `session/prompt` 要等 whole-agent idle 才返回，而不是等"那条 prompt 对应的 turn"：因为 agent 状态是异步的、共享的，不存在"那条 prompt 的结果"这种东西。

## 销毁要到达平静，不只是请求

第四条解决销毁时的孤儿问题。

一个只发 kill/abort 但在 work 停下之前就返回的 teardown 会留下孤儿。正确做法：

1. 让 cleanup 是 async 的，await 子进程的退出（kill 后 await `done`）
2. 在 kill 之前关闭 listener/notification 注册表，让迟到的 completion 保持沉默

这条在 `dsh-acp` 的 teardown（33 篇拆过）里直接体现了：先关闭入口、结算 pending、从子到父排空 continuable subagent、最后并行销毁顶层 agent 并等所有结果。

`dsh-host-webserver` 的 disposal 也体现了这条：它 pair `close()` 和 `closeAllConnections()`，因为一个 handler 可能 hold 它的 response 打开（SSE），这样的连接不会自己结束。没有 force-close，teardown 会挂住。

## 回调异常在 dispatcher 里 contain

第五条是事件驱动系统的核心纪律。

一个用户提供的 listener 抛了异常，不应该 reject 它运行的那个 promise，也不应该饿死它后面的 listener。

规则：在 dispatch 循环外面包 try/catch 并 log。一个坏的 subscriber 永远不破坏核心生命周期。

`dsh` 的事件系统大量依赖这条。`settings/updated` 的监听器失败被 contain 和 log。`credentials/updated` 同样。`session-telemetry/record` 瀑布里抛异常的监听器在 coordinator 的 contain 内丢弃那一条记录（fail-closed）。ACP 的 `session/update` 通知失败被 catch 和 warn。

注意一个例外：`INVARIANT` 编码的失败在所有 listener 跑完后 rethrow。这是运行时不变量的特殊待遇，让契约违规穿透到调用方。但这个 rethrow 只从同步 listener 到达 emitter，所以 invariant 检查不能是 async 函数。

## 不给不可信输出环境变量和可预测路径

第六条是安全防御。

spawned 命令拿到一个清洗过的 env：drop `*KEY*`/`*SECRET*`/`*TOKEN*`/`*PASSWORD`。这样 harness 凭证不会泄漏到 output、env 或 spill 文件里。

temp/spill 文件用私有（0700）目录、随机名字和独占的 owner-only 打开（`'wx'`、`0o600`）。可预测的 world-readable 路径邀请 symlink race 和信息泄露。

这条在 MCP client（32 篇）里也体现了：stdio 方式启动子进程时，桥接插件清洗环境变量，移除所有名字看起来像凭证的环境变量和所有 `DSH_*` 开头的变量。

这条规则的本质是：**不可信输出（命令输出、子进程、外部 MCP server）不应该拿到它能利用的东西。** 环境变量里的凭证、可预测的临时文件路径，这些都是攻击面。

## 链接形路径要 unlink 不 rm

第七条解决文件系统销毁的正确性。

一个可能是 symlink 或 Windows junction 的路径，要用 `lstatSync().isSymbolicLink()` 检查后 `unlinkSync` 删除。unlink 只删除链接本身，拒绝真实目录，所以它永远不会跟着链接进入它的目标。

Windows 的 `rmSync(link)` 在 junction 上抛 `ERR_FS_EISDIR`。递归删除可能穿过 junction 进入它的目标，把目标目录的东西也删了。这是真实的数据丢失风险。

规则：为已知是真实目录的情况保留递归 `rmSync`。可能包含链接的路径走 lstat 加 unlink。

## request-error 恢复

除了七条静态防御模式，agent loop 还有一个动态错误恢复机制。

模型请求会失败：网络断了、超时了、返回格式错误。agent loop 不在失败时直接崩，而是派发 `agent/request-error` waterfall。

一个监听器可以返回 `{ kind: 'retry' }` 让 loop 重新构建请求并重试。这个机制让重试策略变成可插拔的扩展点：默认策略由 `dsh-llm-retry` 提供，你可以挂自己的监听器实现自定义策略（指数退避、切换 provider、记录到告警系统）。

如果没有监听器返回 retry，loop 抛出 `LlmError`，turn 以 error reason 结束。这个错误进入会话日志，可以通过 telemetry 观测。

这个设计和上面的防御式模式配合：request-error 是"模型请求层面"的错误恢复，防御式模式是"系统层面"的错误预防。两层叠加让 agent harness 在不可靠的外部世界里保持韧性。

## 这些模式背后的哲学

七条模式加 request-error 恢复，背后是一个共同的哲学判断：**外部世界不可靠是常态，harness 要在不崩的前提下优雅降级。**

- 进程会 trap 信号然后退出 0（正交结果）
- 实现会以多种方式表达同一个失败（双侧契约）
- 异步状态和同步状态不一样（async 不是 sync）
- 销毁不等于请求销毁（到达平静）
- 用户代码会抛异常（contain）
- 外部进程会利用你的环境（清洗）
- 文件系统有链接（unlink）

每一条都是"外部世界不可靠"的一个具体表现。`dsh` 的做法不是假设外部世界是好的，而是为每种不可靠设计一个具体的应对规则。这些规则是防御性的，不是进攻性的：它们不试图修复外部世界，只确保 harness 自己不被拖下水。

这个哲学和 `dsh` "一切皆插件"的架构选择是一致的。如果你把每个子系统都做成可替换的插件，你就必须假设每个插件都可能是坏的。防御式模式是这种假设在错误处理层面的落地。

## 延伸阅读

- [Defensive Patterns 全文](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/defensive-patterns.md)
- [Testing（测试侧对应模式）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.md)
- [Agent Loop and Turn Flow](https://zread.ai/deepseek-ai/deepseek-harness/8-agent-loop-and-turn-flow)
- [Postmortem: ACP Default Export](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/postmortem/0001-acp-default-export-drops-inject.md)

上一篇：[Web 客户端、Chat Nodes 与多 agent 协议](./41-web-client-chat-nodes-multi-agent-protocol.md)
下一篇：[测试体系：怎么测一个 agent harness](./43-testing-how-to-test-an-agent-harness.md)
