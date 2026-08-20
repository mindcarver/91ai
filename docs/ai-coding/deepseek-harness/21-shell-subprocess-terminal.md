# Shell / Subprocess / Terminal：命令执行的三层抽象

> `dsh` 把"执行命令"做成三层叠加的抽象，`ctx.subprocess` 是不带语义的底层坐标（只给原始进程事实），`ctx.shell` 在上面加出 bash 执行语义（超时、中止分类、沙箱、批输出），`ctx.terminals` 再往上加出持久交互式 PTY（就绪推断、滚动缓冲、独占发送、跨重载存活）。
> 三层各有自己的接缝和 provider，选错层就会要么累要么漏：跑一次性命令用 shell，跑协议后端用 subprocess，跑需要你来我回交互的会话用 terminal。

## 为什么命令执行要分三层

让 agent 跑命令，最朴素的想法就是 `child_process.exec(command)`。但这种"一句话跑命令"在真实场景里会立刻撞上一堆不同的需求：

- 我只想跑一条 bash 命令，拿回输出，超时杀掉，这叫"批处理"。
- 我要起一个语言服务器，和它通过 JSON-RPC 管道长期通信，这叫"协议后端"。
- 我要起一个交互式 shell，先跑几条命令，看输出，再根据输出发下一条输入，会话还得跨工具重载活着，这叫"持久交互"。

这三件事对进程的需求完全不同。批处理要的是"跑完给结果加超时"；协议后端要的是"原始管道，别给我加工，我自己解析协议"；持久交互要的是"伪终端、就绪推断、滚动缓冲、独占发送"。把它们塞进一个 API，结果就是这个 API 啥都能做但啥都做不好。

`dsh` 的做法是分三层，每层一个接缝：

| 层 | 接缝 | 服务 | 加了什么语义 |
|---|---|---|---|
| 底层坐标 | `ctx.subprocess` | `SubprocessRuntime` | 不加语义，只给原始进程事实 |
| bash 执行器 | `ctx.shell` | `ShellExecutor` | 超时、中止分类、沙箱、批输出 |
| 持久 PTY | `ctx.terminals` | `TerminalSessionService` | 就绪推断、滚动缓冲、独占发送、跨重载存活 |

下层不依赖上层，上层在下层之上叠加语义。换后端（本地、沙箱、远程）时，三层都跟着同一个执行世界走。

## 底层坐标：`ctx.subprocess`

`ctx.subprocess` 是命令执行的最底层，定义在 `packages/subprocess/subprocess`。它的关键特征是**不加任何语义**，也**不设任何默认值**。

### 完全显式的 spawn 规格

`SubprocessSpawnSpec` 把每一个配置项都写死在规格上，接缝不补默认。它有六个字段：`argv` 是只读字符串数组（`readonly string[]`），`argv[0]` 是程序，绝不在这里被 shell 解释；`cwd` 是字符串工作目录；`stdio` 是 `SubprocessStdio`，每个流的处置都显式；`graceMs` 是数字，表示终止升级的宽限期；`signal` 可选，是 `AbortSignal`，触发终止升级；`env` 可选，是 `NodeJS.ProcessEnv`，合并到擦洗过的父环境上。

"这个接缝不设默认值"是反复强调的纪律。每个处置、每个上限、每个目录都显式写在规格上，让调用方自己的配置决定它们，而不是一个隐藏的 subprocess 服务默认值。`argv` 在这一层**绝不**被 shell 解释。

stdio 的处置是按消费者需求逐流选的：

- `stdin`：`'ignore'`（接到 `/dev/null`）、`'pipe'`（暴露给调用方持续写协议）、`{ data }`（写完字节就关，批处理形态）。
- `stdout`/`stderr`：`'pipe'`（原始 Readable 给调用方解码协议，LSP 的 JSON-RPC、ACP 的 ndjson 用这个）、`'inherit'`（透传父描述符做诊断）、`collect`（有界内存收集加可选 spill 文件）。

`collect` 模式有个细节值得记住：内存上限 `maxBytes` 溢出后保留**尾部**，可选的 `spill` 把完整流写到文件。省略 `spill` 就只留内存尾部，这是诊断尾部的形态（比如语言服务器的 stderr，缓冲但不留文件）；带上 `spill` 就让完整流可恢复到上限内（bash 工具的形态）。

### 句柄：流、读器、树级终止

spawn 立即返回一个活的句柄 `SubprocessHandle`。collect 模式的读器按**整流字节偏移**读取，而且**不消费**，所以多个独立读器不会互相抢增量；piped 流归调用方。

终止是**全平台树级**的。`terminate()` 是唯一的终止动词，升级顺序 SIGTERM → `graceMs` → SIGKILL，Windows 直接强制终止。POSIX 给分离的进程组发信号，Windows 用 `taskkill /T`，所以辅助进程没法在句柄不知情的情况下存活。`waitForExit()` 等的是整棵树退出，不是直接子进程，这样消费者能在 teardown 返回前观察到还在跑的 helper。

### 结果只带退出事实

`done` 给的是 Node 的 close 事件词汇（`exitCode`、`signal`），**故意不带任何超时或取消分类**。服务在 abort 时杀进程，但从不下判断"为什么杀"。为什么？因为截止时间和原因分类是**调用方拥有的**：bash 执行器读自己拥有的截止信号来做 `timedOut`/`aborted` 的拆分。底层只给事实，策略归上层。这又是"机制和策略分开"的一条具体体现。

### 它的消费者是别的接缝

`ctx.subprocess` 的消费者不是模型面向的工具，而是**别的能力接缝和进程外后端**：bash 执行器家族用它的批量收集输出，LSP 用它的原始协议管道，PTY 后端用它的 terminal 原语，ACP 子 agent 后端用管道 ndjson 加继承的 stderr。它是执行世界的地基，几乎所有要起进程的能力都建在它上面。

这个接缝还拥有被管理的 `DSH_*` 环境命名空间、共享的凭证擦洗（`scrubbedParentEnv`）、和 `CollectedOutput` 形状。`DSH_*` 变量是 Harness 拥有的子进程事实，实现会在合并调用方显式 `env` 之前丢弃环境里的 `DSH_*`，所以一个"当前事实"只能作为显式条目进来，而一个显式的 `undefined` 墓碑会移除一个普通的环境值。

## bash 执行器：`ctx.shell`

`ctx.shell` 是中间层，定义在 `packages/shell/shell`。它回答的是"跑一条 bash 命令，拿回输出"。它坐在 subprocess 之上，加了请求/规格的拆分、超时和中止分类、沙箱集成、以及批输出形态。

### request 与 spec 的拆分

这一层把**模型/插件面向的请求**和**执行器执行的完全解析规格**分开：

- `ShellExecRequest`：`workdir`、`timeoutMs`、`stdoutMaxBytes` 都是可选的，从配置或请求策略填充。这是模型/插件面对的形状。
- `ShellExecSpec`：那些字段都变成必填，由 `ctx.shell.resolve(request)` 填好封顶。

中间隔着 `resolve()` 这一步，是仓库"包边界处显式优于隐式"规矩的体现。工具层调 `resolve()` 拿到规格，再交给 `run` 或 `start`。

注意几个字段是**可信进程内插件专用**，模型面向的 bash 工具不暴露：`stdin`（进程内插件写 hook 命令的 JSON 载荷用）、`env`（hooks 桥设 `CLAUDE_PROJECT_DIR` 之类）、`stdoutMaxBytes`（让前台消费者按自己的解析预算请求完整 stdout）。模型要 stdin 得用 shell 语法（heredoc、管道），不能直接传参数。

### 前台结果：正交结果独立报告

`ShellRunResult` 是这一层最精巧的设计。它的各个结果是**独立报告**的，八个字段：`exitCode` 是 `number | null` 的退出码；`signal` 是 `NodeJS.Signals | null` 的终止信号；`timedOut` 是布尔值，表示执行器自己的超时是首个截断原因；`aborted` 是布尔值，表示调用方的 `AbortSignal` 是首个杀掉原因；`timeoutMs` 是数字超时上限；`stdout` 和 `stderr` 都是 `CollectedOutput`；`sandbox` 可选，是 `ShellSandboxInfo`。

为什么要独立？因为**一个进程可能既超时又 exit 0**。它 trap 了信号，被杀时退出码还是 0。如果只看退出码，就会把一次被截断的运行读成干净成功。`timedOut` 和 `aborted` 互斥（一个融合的截止驱动两者，谁先触发就报谁），但它们和 `exitCode`/`signal` 是正交的。调用方永远不会把一次截断的运行误读成成功。

每个流是个 `CollectedOutput`（这个形状由 subprocess 接缝拥有，shell 重新导出）：截断时 `text` 是**尾部**，完整流溢出到一个私有文件（spill）。这和fs 的 `readBytes` 上限是同一种思路：宁可记下"丢了头部、完整在 spill 文件"，也不静默截断。

### 沙箱集成

沙箱消费的执行器通过 `ShellExecutor.sandboxMode` 暴露它配置的 mode 兜底。工具层请 `dsh-sandbox-policy` 把每个调用会话的 `sandbox/mode` 覆盖和不可变 cwd 解析成 `ShellExecRequest.sandboxPolicy`。

一次沙箱化运行报告它的 mode、保守的拒绝分类、和强制完整度。`runnerFailed` 标记命令跑之前沙箱 runner 就失败了；前台执行抛 `SANDBOX_UNAVAILABLE`，而已结算的后台进程只有它的 facts 通道。`ShellSandboxInfo` 的各项事实独立于进程退出状态报告，这样调用方能区分"命令失败"和"策略拒绝"以及"runner 故障"。这和沙箱的 `denialSignatures`/`runnerFailureRules` 是同一套区分，在这里落到了 bash 结果上。

### 后台进程

`start()` 返回一个**没有 id 也没有 owner** 的句柄 `ShellProcess`。`dsh-tool-bash` 把它适配成 `ctx.jobs.start()` 的钩子，通用的 jobs 运行时才拥有任务身份和生命周期。也就是说，shell 层不管"这是哪个 job"，它只给一个进程句柄；身份和归属是 jobs 层的事。

`done` 在进程关闭时 resolve，**永不 reject**（spawn 失败结算成 `killed`，错误在 stderr 上）。`readOutput()` 是增量消费式的：连续读不会重复输出，丢数据的读标记 `lossy` 并指向 spill 文件。一个还在跑的后台进程在它归属的组合拆除时会被停掉并等待退出；这个边界在 subprocess 接缝的销毁上，所以后台进程能扛过"只重载执行器"的 reload。

## 持久 PTY：`ctx.terminals`

`ctx.terminals` 是顶层，定义在 `packages/terminal/terminal`。它回答的是"起一个交互式会话，我来回发输入"。它在前两层之上，加了就绪推断、滚动缓冲、独占发送、跨重载存活。

### 身份与就绪

`TerminalSessionId` 是服务铸造的 branded id。可选的名字是 owner 本地的展示元数据；授权比的是**确切的归属 Agent**，不是名字或猜的 id。这是个安全细节：你不能靠猜一个 session 名字去操作别人的 PTY。

`TerminalWaitReason` 说的是一次 send 为什么把控制权还给了调用方。它和 `TerminalSessionStatus` 独立，是四个值的联合：`stdin_read`、`inferred_idle`、`timeout`、`session_exit`。

沉默或超时可能返回，而顶层 shell 还活着；`session_exit` 才表示那个 shell 退出了，不是某个前台子进程退了。这个区分很关键：一次 send 返回不等于会话结束。

### 后端与活动会话

一个后端 `TerminalBackend` 拥有某种类型 PTY 会话的启动和就绪检测。`TerminalSessionService` 只在 setup 成功**之后**才发布返回的会话，然后拥有 id 授权和清理。一个没法清理半截启动资源的后端，会用 `TerminalBackendCleanupError` 拒绝，让销毁能保留清理失败而不替换调用方的取消原因。后端会话拥有终端状态和被捕获资源的 quiescence。

### 独占发送与滚动缓冲

一个活动会话**同一时刻只接受一个 send**。这个独占语义避免了两个输入交织把终端状态搞乱。这个 send 操作暴露一个消费式输出游标（给通用后台 job 用）和一个终端结果（给前台调用方用）。`TerminalSendOperation` 有三个成员：`done` 是 `Promise<TerminalSendResult>`，在就绪、超时、取消或顶层退出后 resolve；`readOutput()` 返回 `TerminalSendRead`，消费上次调用以来产生的输出；`cancel()` 请求 SIGINT，返回布尔值，结算后返回 false。

`TerminalReadResult` 另外分页读取有界的会话滚动缓冲。这把"一次 send 的增量输出"和"会话历史滚动缓冲"分成了两个读取路径。

### 归属与持久

`TerminalSessionService` 给确切的 owner 作用域挂一个 await 的清理，拒绝外部操作，并让会话**跨后端或工具插件重载存活**。PTY 状态和原始字节留在进程本地；模型输入和有界返回输出通过既有的 `tool/call`、`tool/result`、task-result 路径持久化，而不是重复一套 PTY 会话事件。

这条"跨重载存活"是 terminal 层和 shell 层的一个重要差异。shell 的后台进程扛过"执行器重载"（边界在 subprocess 销毁）；terminal 的会话扛过"后端或工具插件重载"。两层都把生命周期边界放在比自身更底层的地方，让重载不杀掉正在进行的工作。

## 何时用哪一层

这是这一篇最实用的问题。给一个判断表：

| 你的需求 | 用哪层 | 为什么 |
|---|---|---|
| 跑一条 bash 命令，拿输出，要超时 | `ctx.shell` 的 `run` | 它给你超时、中止分类、批输出、沙箱集成 |
| 起一个后台长跑命令，轮询输出 | `ctx.shell` 的 `start` | 后台无超时，增量读，配 jobs 管身份 |
| 起一个语言服务器，JSON-RPC 长连接 | `ctx.subprocess` 的 `spawn` | 要原始管道自己解析协议，不要 bash 加工 |
| 起一个交互式 REPL，看输出再发输入 | `ctx.terminals` | 要就绪推断、滚动缓冲、独占发送、跨重载 |
| 起一个子 agent 后端，管道 ndjson | `ctx.subprocess` | 要 pipe stdin 加继承 stderr |

一个常见的错误是用 shell 跑协议后端。bash 执行器会把输出当成"批文本"收集，给你加超时、加沙箱、加截断逻辑，这些对一条 bash 命令是对的，对一个要长期对话的协议后端全是负担。协议后端要的是原始管道，那是 subprocess 的活。反过来，用 subprocess 模拟交互式终端也不行，文档明确说普通的 `spawn()` 没法重建控制终端语义，那是 `spawnTerminal` 的活，而就绪推断、prompt 检测、持久会话归属这些是 terminal 消费者的活。

## 真实代码落点

- `packages/subprocess/subprocess/src/index.ts`：`SubprocessRuntime` 抽象接缝，`spawn`、`spawnTerminal`、`resolveExecutable`。
- `packages/subprocess/subprocess-local`：本地实现，分离进程树、各处置接线、凭证擦洗、`node-pty`、平台进程检查。
- `packages/shell/shell/src/index.ts`：`ShellExecutor` 抽象，`resolve`、`run`、`start`、`sandboxMode`。
- `packages/shell/bash-local`、`bash-sandbox`：两个 provider，后者消费沙箱。
- `packages/shell/shell-env/src/index.ts`：`ctx.shellEnv`，`DSH_*` 注册表。
- `packages/terminal/terminal/src/index.ts`：`TerminalSessionService`，`ctx.terminals`。

## 权衡与局限

**三层抽象增加了理解成本。** 一个新人想"跑个命令"得先搞清楚自己要哪层。这是把不同需求分开的代价。回报是每层都能独立优化、独立替换，不会出现"给协议后端加了个超时把长连接杀了"这种互相干扰。

**subprocess 不设默认值，写起来啰嗦。** 每个处置、每个上限都要显式写。这是故意的，为了避免隐藏默认值在不同后端上行为不一致。代价是直接用 subprocess 的代码比较冗长。

**terminal 的独占发送会限制并发。** 一个会话同时只能有一个 send。这是为了状态一致性，但意味着你不能并行地往同一个 PTY 灌多个输入。

**后台进程和 PTY 会话的生命周期边界在别处。** 它们扛过哪一级 reload 取决于底层销毁边界。不理解这个边界，可能会以为重载会杀掉正在跑的后台任务，或者反过来以为不会杀。

## 结论

命令执行在 `dsh` 里是三层叠加：subprocess 是不带语义的底层坐标，只给原始进程事实和树级终止；shell 在上面加出 bash 执行语义，正交独立地报告超时、中止、退出，集成沙箱；terminal 再往上加出持久交互式 PTY，靠就绪推断、滚动缓冲、独占发送和跨重载存活支撑来回交互。

三个判断：底层只给事实不给原因分类（原因归调用方）；前台结果各项正交独立报告（防止把截断读成成功）；选层要看需求本质（批处理用 shell，协议用 subprocess，交互用 terminal）。这套分层让"执行命令"这件看似简单的事，在面对批处理、协议、交互三种截然不同的需求时，各自有干净合适的工具，而不是一个拧巴的万能 API。

## 延伸阅读

- [Subprocess 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subprocess.md)：底层坐标，spawn 规格、句柄、树级终止
- [Bash Executor 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/shell.md)：request/spec 拆分、正交结果、沙箱集成
- [Persistent PTY Sessions 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/terminal.md)：就绪推断、独占发送、跨重载存活
- [Persistent PTY Agent Note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-07-16-persistent-pty-sessions.md)：持久 PTY 的设计理由
- [Timeout deadline library Agent Note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-07-06-timeout-deadline-library.md)：超时与中止的首因分类

上一篇：[Filesystem 接缝：fs-local / fs-sandbox / 观察策略](./20-filesystem-seam.md)
下一篇：[LSP 接缝：让 agent 真正"懂"代码导航](./22-lsp-code-navigation.md)
