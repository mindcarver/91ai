# 沙箱、审批与权限三件套：agent 如何安全地动你的机器

> `dsh` 把"agent 能动你的机器"这件事拆成三个互相独立、各自 fail-closed 的开关，沙箱管文件效果、审批管单次动作放行、预设把它们打包成名字，三者没有谁能替代谁，也没有谁在"差不多安全"时偷偷放行。
> 最反常识的一条：沙箱的强制力是一个**被报告的事实**（full 或 partial），不是一个承诺，partial 的时候消费者必须拒绝或明示，绝不假装它是 full。

## 为什么是三件套，不是一个大开关

让 agent 安全地操作真实机器，粗看是一个问题："别让它干坏事"。但细想这是三个完全不同的问题：

- **它能碰哪些文件？** 这是文件效果的边界。一个 `rm -rf /` 该不该被拦，取决于它写在不在允许范围内，不取决于你当时在不在电脑前。
- **这一个具体动作，现在能不能放行？** 这是单次决策。哪怕动作本身在允许范围内，你也可能想在它执行前看一眼、点个头。
- **上面两个的组合，叫什么名字？** 这是给用户的便捷。用户不想每次分别调两个开关，想选一个"只读模式"或"全权模式"。

很多人会把这三个揉成一个"权限"概念，结果是逻辑纠缠：调了沙箱模式以为也改了审批，或者审批拒绝了却以为沙箱也收紧了。`dsh` 把它们拆成三个独立子系统，各自有自己的接缝、自己的事件、自己的 fail-closed 语义，再用一个很薄的预设层把前两个打包成名字。

这条拆分的关键纪律是：**预设层不拥有任何强制力**。执行、提示、回放读的都是底层两个开关的折叠值，预设切换只是记录意图、再写穿到每个开关自己的 setter。预设坏了，底层开关照常工作。

## 沙箱：`ctx.sandbox` 与 `ctx.sandboxPolicy`

沙箱接缝回答"能碰哪些文件"。它由两个服务组成：`ctx.sandboxPolicy` 负责解析策略，`ctx.sandbox` 负责把 argv 包进围栏。

### 三个模式，只管文件

`SandboxMode` 只有三个值：`read-only`、`workspace-write`、`danger-full-access`，而且**只管文件系统效果**，不管网络、不管进程可见性。

- `read-only`：要求后端拒绝写。POSIX 后端额外开 shell 需要的 `/dev/null` 接收端；Windows ACL 后端不开任何可写根，并报告 partial 强制。
- `workspace-write`：允许写工作区根目录下面，加后端承诺的临时区。
- `danger-full-access`：绕过围栏。

关键的一条：只有前两个模式会送到 provider。一个 `danger-full-access` 的消费者直接 spawn 它原来的 argv，根本不调 `ctx.sandbox`。也就是说，"完全放权"不是一个被围栏放行的模式，而是压根不进围栏。

### 强制力是被报告的事实

这是整个沙箱设计最反常识、也最重要的一点。`SandboxEnforcement` 只有两个值：`full` 和 `partial`。

`full` 表示后端能管住这个模式承诺的全部文件效果。`partial` 表示当前后端或老内核 ABI 只能管住一部分。当前的 partial 场景包括老的 Landlock ABI，以及 Windows ACL 后端的 Everyone/硬链接边界。

为什么要把"强制得不完整"显式报出来？因为**沙箱不是承诺，是事实**。如果一个消费者需要绝对边界（比如它要跑一段可能删东西的代码），拿到 `partial` 就不能假装它是 `full`，必须拒绝或明示给用户。假装 partial 是 full，就是埋一个"以为挡住了其实没挡住"的雷。

### 策略按调用解析，不是写死在 provider 上

完整的执行策略是 `SandboxExecutionPolicy`，包含 mode、workspaceRoot、sessionId。`ctx.sandboxPolicy.resolve()` 每次调用都解析一次，优先级是：

1. 显式批准的 mode 覆盖（approved retry 时传入），最高优先。
2. 会话日志里最后一条 `sandbox/mode` 事件。
3. 部署默认值。

为什么按调用解析？因为**两个消费者可能在同一瞬间用不同策略围栏**。比如 bash 在 `read-only` 下跑，同时一个被围栏的子 agent 需要它的状态目录可写。如果策略写死在 provider 上，就得改 provider 状态，并发就乱了。按调用携带策略，provider 永远拿到一个完全指定的策略，不用做默认推断。

只有被围栏的执行（前两个模式）才会到达 `ctx.sandbox`。一个批准的"提权重试"是一次新调用，带着更宽的策略，不改 provider 状态。

### confine：要么返回围栏 argv，要么 fail-closed

`ctx.sandbox.confine(argv, policy)` 返回一个 `ConfinedArgv`（替换用的 argv 加强制事实），或者抛 `SandboxUnavailableError`（code `SANDBOX_UNAVAILABLE`）。文档原话：**静默的未围栏直通，对一个被围栏的策略永远不合法。**

注意 `argv` 参数是调用方要 spawn 的**确切 argv**（程序加参数），不是 shell 字符串。一个 shell 形态的消费者传的是 `['bash', '-c', command]`。这个区分很重要，因为围栏包的是"实际要执行的进程"，不是"一段 shell 文本"。

### 两种 stderr 分类，别搞混

`ConfinedArgv` 带着两套正交的 stderr 分类器，这是排查沙箱问题时最容易混的地方：

- **`denialSignatures`**：被围栏的命令被挡住了。这表示**沙箱正常工作**，挡了该挡的。bwrap 的只读 bind 下报 EROFS 文本，Landlock 下报 EACCES，Seatbelt 下报 EPERM。每个后端的"拒绝方言"不同，消费者只匹配当前后端产生的这些签名，不用跨后端的并集。
- **`runnerFailureRules`**：沙箱 runner 自己拒绝或失败了，**命令根本没跑**。消费者要先检查这个，把它当成基础设施故障报出来，而不是普通任务失败。

区分这两者的意义：denial 是沙箱在正确工作（挡住了越界操作），runner failure 是沙箱本身坏了（命令没执行）。把它们混为一谈，就会出现"沙箱正常挡住了危险操作，却被当成命令执行失败"的误判。

后端方面，`dsh-sandbox-local` 提供 Linux 的 bwrap/Landlock、macOS 的 Seatbelt、Windows 的 ACL restricted-token。注意：容器、microVM、远程执行是**整个能力接缝的兄弟实现**，不是 `ctx.sandbox` 的 provider。这是接缝设计的体现：远程执行替换的是一整族能力，不是给本地沙箱挂个远程 provider。

## 审批：`ctx.approval`

审批接缝回答"这一个具体动作，现在能不能放行"。它由 `packages/interaction/user-approval` 提供，服务是 `ctx.approval`。

### 闭合的结果，只有一种放行

`ApprovalOutcome` 是闭合的，而且 fail-closed，四个值：`allowed-once`、`rejected`、`cancelled`、`unavailable`。

`allowed-once` 是唯一的放行，而且只对"被问到的这一个动作"有效，不延续到下一次。调用方在 `rejected`、`cancelled`、`unavailable` 三种情况下都拒绝执行。

`unavailable` 这一条是 fail-closed 的灵魂：一个缺失的、不归属自己的、抛错的、或返回非词汇值的 answerer，都归一成 `unavailable`，而不是打开闸门。换句话说，**审批系统坏了，默认是拒绝，不是放行**。

### 两种策略

`ApprovalPolicy` 决定在交互式 answerer 跑之前发生什么，只有 `ask` 和 `never` 两个值。

- `ask`（默认）：委托给组合的 answerer 链。没 compose 任何 answerer 时，链落空到 fail-closed 的 `unavailable`。
- `never`：不问任何人，每次 ask 确定性地返回 `rejected`。这是严格的 headless 姿态（CI、无人值守运行），也是唯一一个"不问就知道结果"的策略。

`never` 在服务内部、waterfall 分发**之前**强制。这意味着即使后面有人用 `prepend` 注册了一个 answerer 想绕过，也绕不过 `never`。安全策略的优先级高于扩展点。

### 必须在打开的 turn 里

`ctx.approval.request(req)` 要求请求的会话处于一个打开的 turn 之内。为什么？因为审计事件对（`approval/asked` 和 `approval/decided`）必须被持久日志的 commit/replay 边界包住。一个空闲的 ask 在追加任何东西之前就直接拒绝。如果一个失败阻止了任一审计事件提交，请求照样拒绝，因为返回一个没记进日志的决策会破坏审计对。

`ApprovalRequest` 有个细节值得注意：它**故意不携带工具参数**。它带 `callId`，把提示挂到已经流式呈现过的 tool call 上，而不是渲染第二份可能漂移的参数副本。agent、toolName、callId、reason、signal，就这些。

审计事件是**纯日志**，不进模型 transcript。模型看到的，是调用方派生出来的工具结果，加上当前的 runtime-context 快照。这把"给人看的审计"和"给模型看的上下文"分开了。

## 权限预设：`ctx.permissionPresets`

预设层是最薄的一层。`packages/interaction/permission-presets` 的 `ctx.permissionPresets` 把沙箱模式和审批策略这两个独立开关，打包成客户端能作为一个 Permissions 选择器展示的命名预设。

### 它不拥有任何强制力

这是理解预设层的关键。文档原话：它是一个可选能力，不是 agent-loop 主干的一部分，**不拥有任何强制**。执行、提示叙述、回放读的都是底层两个开关的折叠值。预设切换只是记录意图，再写穿到每个开关自己的 setter。

切换一个预设时，`set()` 先解析预设名（未知名字抛错），追加一条纯日志的 `permission/preset` 事件，然后**只有当某个开关的有效值真的变了**，才通过它自己的 setter 写穿（沙箱走 `setSandboxMode`，审批走 `setApprovalPolicy`）。选择事件在同一 turn 里先于开关事件，重复选择当前有效预设则什么都不追加。

### 默认两个预设，custom 是派生的

默认表里只有两个预设：

| 预设名 | 沙箱模式 | 审批策略 |
|---|---|---|
| `workspace-write` | `workspace-write` | `ask` |
| `danger-full-access` | `danger-full-access` | `never` |

`custom` 是个特殊值：它是**派生的**，不是表里的一项。当两个开关的组合不匹配任何预设时，`current()` 返回 `custom`。客户端可以把 `custom` 当成当前值展示，但它永远不能是切换目标，也不会出现在事件载荷里。这处理了一个情况：用户手动调了某个底层开关，组合就脱离了任何命名预设，这时 UI 显示 `custom` 而不是假装还在某个预设里。

预设服务要求一个能围栏的 `ctx.shell` executor 和 `ctx.approval`，配置错误在插件加载时就失败：表里有一项叫 `custom` 会抛（名字保留），在一个不围栏的 bash executor 上组合会抛（因为预设打包的是沙箱模式）。**早失败**好过运行期静默错乱。

## 三件套怎么协作

把一次有副作用的工具调用从头串一遍：

1. agent 决定调一个工具（比如 bash 跑条命令）。
2. 工具层调 `ctx.sandboxPolicy.resolve()`，拿到这次调用的沙箱策略（mode、workspaceRoot）。
3. 如果 mode 不是 `danger-full-access`，工具层调 `ctx.sandbox.confine(argv, policy)`，拿到围栏 argv 或 `SandboxUnavailableError`。fail-closed：拿不到围栏就不跑。
4. 同时，工具层调 `ctx.approval.request(...)` 问这一个动作能不能放行。审批服务应用会话策略，必要时走 answerer 链，返回闭合结果。只有 `allowed-once` 才继续。
5. 执行后，stderr 先按 `runnerFailureRules` 判沙箱故障，再按 `denialSignatures` 判拒绝，最后才当成普通任务结果。

预设层在这一切里不直接出场。它只在用户切换预设时，把意图翻译成两个开关的 setter 调用。真正的强制全在沙箱和审批两个子系统里。

贯穿全程的 defensive 模式可以总结成几条：fail-closed（坏了就拒绝，不放行）；强制是报告事实（partial 必须被看见，不能假装 full）；静默直通非法（被围栏的策略永远不能未围栏偷偷跑）；审计与 transcript 分离（给人看的审计不污染给模型看的上下文）；安全策略优先于扩展点（`never` 在 waterfall 之前强制，prepend 绕不过）；配置错误早失败（插件加载时就抛，不拖到运行期）。

## 权衡与局限

**沙箱只管文件，不管网络和进程可见性。** 一个 `curl` 把数据外发，或者一个 `ps` 看到别的进程，沙箱不管。要管这些得靠别的机制。把范围明确收窄到文件效果，是为了让"沙箱能不能挡住"这个问题有确定答案，而不是个什么都想管、什么都管不全的大杂烩。

**partial 强制是真实存在的。** 老内核 ABI、Windows ACL 的边界，意味着"沙箱"在某些平台上不能给出 full 承诺。`dsh` 选择把这个事实暴露出来，而不是隐瞒。代价是消费者得多写一段"拿到 partial 要不要继续"的判断；回报是不会有人误以为挡住了其实没挡住。

**审批是单次的。** `allowed-once` 只对被问的那个动作有效。agent 下次做类似的事，还得再问。这故意拒绝了"批准一次，以后这类都自动放行"的便利，因为那会悄悄扩大攻击面。

**预设层很薄，别指望它做强制。** 它只是个打包。如果你直接调底层开关，预设就显示 `custom`，但强制仍然有效。想靠"锁住预设选择器"来保证安全是错的，要锁就锁底层两个开关。

## 结论

沙箱、审批、权限预设是三个独立维度，各自 fail-closed。沙箱管文件效果，把强制力当成 full 或 partial 的报告事实，绝不静默直通；审批管单次动作放行，结果闭合到只有 `allowed-once` 一种放行，系统坏了默认拒绝；预设层只打包前两者，不拥有强制，强制永远在底层两个开关里。

这套拆分的价值在于：每个子系统都能独立推理、独立测试、独立替换。你换一个沙箱后端（比如上 microVM），不动审批逻辑；你换一个审批 answerer（比如接 ACP 的机器决策），不动沙箱。而 fail-closed 和"强制是事实不是承诺"这两条贯穿性纪律，保证了无论怎么换，安全底线都不会被一个 bug 或一个 partial 强制悄悄击穿。

## 延伸阅读

- [Process Sandbox 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/sandbox.md)：沙箱模式、强制事实、confine 契约
- [User Approval 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/approval.md)：闭合结果、ask/never 策略、审计对
- [Permission Presets 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/permission-presets.md)：预设打包、custom 派生态、写穿 setter
- [Defensive Patterns](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/defensive-patterns.md)：跨子系统的防御性设计条目
- [Sandbox switching 设计笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-07-06-sandbox.md)：沙箱切换的设计理由

上一篇：[🛠 写一个 LLM 适配器：接 OpenAI 兼容端点](./18-write-an-llm-adapter.md)
下一篇：[Filesystem 接缝：fs-local / fs-sandbox / 观察策略](./20-filesystem-seam.md)
