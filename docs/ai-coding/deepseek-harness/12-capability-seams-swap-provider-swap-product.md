# 能力接缝 Capability Seams：换一个 provider 等于换整个产品

> 如果这一篇你只能带走一句话，带走这句：DeepSeek Harness 把每个能力都做成一个有三个角色（定义、提供者、消费者）的可替换接缝，而文件系统和子进程共享同一个"执行世界"，所以把这两个接缝指向一个远程沙箱，Bash、终端、LSP、子 agent 就全都跟着搬过去了，不用为远程执行单独写一套分支。
> 这是整个系列最值钱的一个概念。这一篇把"接缝"说准，拆解它怎么靠"共享执行世界"实现"换一个 provider 等于换整个产品"，再逐个过一遍最重要的几个接缝。

## 先把"接缝"这个词说准

很多项目说自己是"插件化"，但它们的插件只能在外围加点东西，换不掉核心能力。DeepSeek Harness 的"接缝（capability seam）"不是这个意思。一个接缝是一个**可以被整体替换的能力**，它有三个角色，缺一不可：

- **Service Definition（服务定义）**：声明这个能力的接口。比如"文件系统读写"长什么样。
- **Service Provider（服务提供者）**：实现这个接口。比如本地实现、沙箱实现、远程实现。
- **Consumer（消费者）**：使用这个能力，通常是模型面向的工具。

架构文档有一句关键的话：**一个角色单独存在不构成接缝；增加一个能力，意味着三个角色都要设计。** 这条规矩排除了"只写了个定义没人实现"或"只有实现没有消费者"的半成品。一个能力真正落地，必须是定义、提供者、消费者三件齐备。

还有一条容易混的：**不是每个 `ctx.*` 都是接缝。** 官方的能力图把所有服务分成三类。读那张大表会发现，`Role` 列有三个值：

- **`seam`（接缝）**：可替换的能力，有多个 provider 实现。这才是"接缝"。
- **`core`（核心脊柱）**：不可替换的脊柱服务，单一 owner，没有 swappable 实现。
- **`bundle`（组合点）**：组合点。整个 harness 里只有一个：`ctx.agentLoop`，那个具体的 loop 驱动器。

`ctx.sessions`（会话存储）、`ctx.tools`（工具注册表）、`ctx.systemPrompt`（提示组装）、`ctx.agents`（agent 服务）这些是 `core`，它们是脊柱，不被设计成可替换的。`ctx.fs`、`ctx.llm`、`ctx.shell`、`ctx.subprocess` 这些才是 `seam`。搞清这个分类，才不会误以为"所有服务都能换"。

## 灵魂命题：文件系统和子进程共享同一个执行世界

这是整个接缝设计最值钱的一条洞察，也是标题"换一个 provider 等于换整个产品"的来源。

架构文档原话：

> Filesystem and subprocess providers share one execution world, so pointing them at a remote sandbox moves Bash, PTY, and LSP with them, with no provider forks.

拆开看这句话凭什么成立。看 `ctx.subprocess` 这个接缝的消费者清单：`bash-local`、`bash-sandbox`、`terminal-bash`、`lsp-stdio`、`subagent-acp`、`subagent-codex`、`subagent-claude-code`。也就是说，bash 执行器、PTY 终端后端、LSP 宿主、还有三个进程外的子 agent 后端（ACP、Codex、Claude Code），**全都通过 `ctx.subprocess` 来 spawn 子进程**。

再看 `ctx.fs` 的实现：`fs-local`、`fs-sandbox`、`fs-e2b`（远程 E2B）。`ctx.subprocess` 的实现：`subprocess-local`、`subprocess-e2b`。这两个接缝都有 E2B 远程实现，而它们都消费同一个 `ctx.e2b`（core 服务），后者"拥有一个共享的 E2B SDK 句柄、远程工作目录、和最终的沙箱处置，让两个基础 E2B provider 住在同一个 Linux 运行时里"。

把这两件事拼起来：当你把 `ctx.fs` 换成 `fs-e2b`、把 `ctx.subprocess` 换成 `subprocess-e2b`，文件操作在远程 E2B 沙箱里发生，所有子进程也在那个同一个 Linux 运行时里 spawn。因为 bash、终端、LSP、进程外子 agent 全走 `ctx.subprocess`，它们就全都跟着搬到远程沙箱了。**你换的是两个 provider，移动的是整个执行世界。**

这就是"换一个 provider 等于换整个产品"的字面含义。没有这套共享执行世界的设计，你要做远程执行，就得为 bash、终端、LSP、子 agent 各写一套远程 provider 分支，工作量爆炸，而且它们之间还可能不一致（文件在远程、命令在本地）。共享执行世界让一次替换搬运一切，且天然一致。

## 逐个接缝拆

把几个最重要的接缝逐个过一遍，看清它们的三个角色。

### ctx.llm：模型适配

`ctx.llm` 是模型适配器注册表。owner 是 `llm` 包，provider 实现有三个：`llm-deepseek`（DeepSeek 自家）、`llm-pi-ai`（另一个提供商）、`llm-replay`（测试用回放）。消费者是 `agent-loop` 和 `compaction-basic`。

它的契约是 provider 中立的 stream 服务：adapter 注册自己的 provider 实现，loop 和压缩插件调的是那个 provider 中立的 stream 接口，不 import 具体实现。所以换模型 provider，就是换一个 `ctx.llm` 的实现，loop 和压缩一行不改。这也解释了为什么改完模型 key 立即生效：凭证（`ctx.credentials`）每次操作解析，换 provider 是一次 context 变化，反应式依赖把新 provider 接到所有消费者上。

### ctx.fs：文件系统

`ctx.fs` 是文件系统 provider 接缝。实现有三个：`fs-local`（本地）、`fs-sandbox`（沙箱围栏）、`fs-e2b`（远程）。消费者是 `tool-fs`（模型面向的文件工具）。还有个伴生插件 `fs-observation-policy`，通过 `fs/*` 事件门贡献观察状态检查。

`tool-fs` 的读、写、编辑都通过 `ctx.fs` 执行；`fs-sandbox` 按共享的沙箱模式给写操作加围栏。所以"agent 能动哪些文件"是被这个接缝 + 沙箱策略显式管理的边界，不是"当前目录随便扫"。

### ctx.shell：命令执行

`ctx.shell` 是 bash 执行器接缝。实现有三个：`bash-local`、`bash-sandbox`、`pwsh-local`（Windows PowerShell）。消费者是 `tool-bash`、`tool-pwsh`、还有 `hooks-claude-code` 和 `hooks-codex`（hook 桥接）。

模型面向的 shell 工具消费这个接缝；沙箱的、远程的、PowerShell 的执行器可以替换 `bash-local` 而不碰这些工具。这也是为什么 Windows 上 bash 没 runner 时，base bundle 能按平台挂 pwsh 栈、禁用 bash 栈，工具层无感。

### ctx.subprocess：执行世界的枢纽

`ctx.subprocess` 是上面那个"共享执行世界"的枢纽，值得单独强调。它的消费者清单最长：`bash-local`、`bash-sandbox`、`terminal-bash`、`lsp-stdio`、`subagent-acp`、`subagent-codex`、`subagent-claude-code`。

文档原话：bash 执行器、PTY shell 后端、LSP 宿主、进程外的 ACP/Codex/Claude Code 子 agent 后端，**都通过 `ctx.subprocess` spawn**；这个服务拥有进程坐标、树/会话生命周期、stdio 处置、终端机制、和 kill 升级。

把 `ctx.subprocess` 换成 `subprocess-e2b`，所有这些 spawn 都去远程。这是接缝设计回报最直观的一个。

### ctx.sandbox 与 ctx.sandboxPolicy：进程围栏

`ctx.sandbox` 是进程沙箱接缝，实现 `sandbox-local`，消费者 `bash-sandbox`、`terminal-bash`。契约很特别：**消费者把"自己正要 spawn 的那个 argv"交给沙箱**，同世界的后端在每次调用策略下把它包起来，并报告执行情况。

`ctx.sandboxPolicy` 是 core 脚柱服务（不是接缝），是部署默认模式加 workspace root 的唯一归属。只有沙箱化执行器和 provider 读它。bash 和 fs 两个强制家族都读它，**这样 bash 和 fs 不能围到不同的 root**。这条一致性约束很关键：如果 bash 围一个 root、fs 围另一个，沙箱就漏了。

### ctx.web：联网

`ctx.web` 是联网接缝，实现有四个：`web-search-exa`、`web-search-perplexity`、`web-search-deepseek`（三个搜索 provider）、`web-fetch-http`（抓取）。消费者是 `tool-web`。

搜索和抓取的 provider 都注册进同一个 `ctx.web` 接缝；`tool-web` 拥有稳定的模型面向名字。换搜索后端，工具层不变。

### ctx.lsp：语言服务器

`ctx.lsp` 是语言服务器导航接缝，实现 `lsp-local`，消费者 `tool-lsp`。契约有个硬约束：**它只提供恰好四个标准化操作，没有协议逃生口**。一个后端必须把请求翻译成这四个标准化操作，没有"直接走原始 LSP 协议"的后门。

这个设计保证了不同 LSP 后端的行为一致：消费者永远只看到那四个操作，不管后端是怎么实现的。

### ctx.subagents：从子 agent 到另一个产品里的委派

`ctx.subagents` 是子 agent 接缝，它的 provider 实现最能体现"换 provider 换形态"：`subagent-spawn-in-process`、`subagent-fork-in-process`（进程内）、`subagent-acp`、`subagent-codex`、`subagent-claude-code`（进程外，委派到别的产品）、`subagent-dsh-sdk`。

文档原话：子 agent provider 在一个接口背后差异巨大，从一个全新的子 agent 到在另一个产品里的一次委派 turn。这就是接缝的威力：消费者（`tool-subagent` 等）用同一个接口，背后可以是进程内 spawn，也可以是把任务委派给 Codex 或 Claude Code 这种完全不同的产品。

### ctx.approval 与 ctx.permissionPresets：默认失败关闭

`ctx.approval` 是审批接缝，实现有 `acp`，消费者 `tools` 和 `tool-bash`。契约是一次性权限决策，通过 `approval/request` 这个 waterfall 派发；回答者是监听器（ACP 桥接为自己的 agent 作答）。关键的安全语义：**回答者缺席时，失败关闭到 `unavailable`**（fail closed）。不是"没人管就放行"，而是"没人管就拒绝"。

`ctx.permissionPresets` 是 core 脚柱，是面向用户的预设表（`workspace-write` / `danger-full-access`），把沙箱模式和审批策略两个旋钮打包。一次切换写一条 `permission/preset` 事件，同步到两个旋钮事件。

## 换一个 provider 等于换整个产品：一个具体推演

把上面的拼起来，做一个具体推演，看清"换 provider 换产品"到底怎么发生。

**场景一：从本地执行切到远程 E2B 沙箱。** 把 `ctx.fs` 换成 `fs-e2b`，把 `ctx.subprocess` 换成 `subprocess-e2b`，两个都消费共享的 `ctx.e2b`。结果：文件读写发生在远程沙箱，bash（它走 subprocess）、终端（走 subprocess）、LSP（走 subprocess）、进程外子 agent（走 subprocess）全在同一个远程 Linux 运行时里 spawn。你换的是两个 provider，整个执行世界搬过去了，工具层一行没改。

**场景二：换模型。** 把 `ctx.llm` 的实现从 `llm-deepseek` 换成另一个 OpenAI 兼容适配器。loop 和压缩调的是 provider 中立的 stream 接口，模型层整个换了，agent 的驱动逻辑不变。

**场景三：换子 agent 形态。** 把 `ctx.subagents` 从进程内 spawn 换成 `subagent-claude-code`。同一个 `tool-subagent` 接口，背后从"开一个新子 agent"变成"在 Claude Code 里委派一次 turn"。

这三个场景的共同点：**消费者代码不变，换的是 provider，变的是整个产品形态。** 这不是"换了个配置项"那种小改，而是执行位置、模型、协作形态这种产品级的变化，都通过换 provider 完成。这就是接缝设计的回报。

## 接缝 vs 核心脊柱：别把所有服务都当接缝

读完上面的推演，容易产生一个误解："那 harness 里所有服务都能换？" 不能。这又回到那个三分法。

**接缝（seam）是可替换的**：`ctx.llm`、`ctx.fs`、`ctx.shell`、`ctx.subprocess`、`ctx.sandbox`、`ctx.web`、`ctx.lsp`、`ctx.subagents`、`ctx.approval`、`ctx.sessionPersistence`、`ctx.settings`、`ctx.credentials` 等等。它们有多个 provider 实现，换 provider 是常态。

**核心脊柱（core）是不可替换的**：`ctx.sessions`、`ctx.tools`、`ctx.systemPrompt`、`ctx.agents`、`ctx.invariants`、`ctx.sandboxPolicy`、`ctx.permissionPresets` 等等。它们是单一 owner 的脊柱服务，整个 harness 依赖它们的稳定行为，不被设计成可替换。

**组合点（bundle）只有一个**：`ctx.agentLoop`，那个具体的 loop 驱动器。扩展包依赖的是 `dsh-agent` 的事件和服务，不依赖这个包。

这个区分的实用价值在于：它告诉你"什么能换、什么不能换"。想换模型、换执行环境、换搜索后端，那是换接缝的 provider，欢迎。想换会话日志模型、换工具注册表，那是动核心脊柱，不是设计意图里的替换，得改源码。

## 代价与回报

接缝设计的好处讲了很多，代价也要讲清楚，否则就是软文。

**回报是从"一个产品"变成"一族可组合的产品"。** 同一套消费者代码（工具、loop、压缩），靠换不同的 provider 组合，能拼出本地 agent、远程沙箱 agent、委派到别的产品的 agent、不同模型的 agent。这是接缝设计的核心红利。

**代价是抽象层多、调试链长。** 一个工具调用从模型发出，要穿过接缝、provider、事件若干层。能力图本身就有几十个服务、上百条边，出问题时定位要沿着接缝和 provider 走。DeepSeek Harness 自己的文档承认这套架构的代价之一就是抽象层多、调试复杂。

**代价还有三角色齐备的纪律。** 增加一个能力不是写个函数，而是要设计定义、提供者、消费者三件，还要保证它们契合约定的接缝语义（比如 LSP 只能四个操作、sandbox 要接收 argv、approval 缺席要 fail closed）。这是有门槛的工程纪律。

权衡的结论是：如果你做的 agent 只在一种环境里跑、只配一个模型，接缝是过度设计。但如果你要的是"一套代码、多种执行环境、多种模型、多种协作形态"，接缝就是把变化点收敛到 provider 替换的唯一手段。DeepSeek Harness 选这条路，赌的就是 agent 这个场景值得为可组合性付抽象的代价。

## 结论

能力接缝是 DeepSeek Harness 把每个能力做成可替换的设计：一个接缝有三个角色（定义、提供者、消费者），缺一不构成接缝，增加能力要三件齐备。不是所有服务都是接缝，官方把服务分成 seam（可替换）、core（脊柱不可换）、bundle（组合点，仅 agentLoop）。接缝设计最值钱的洞察是文件系统和子进程共享同一个执行世界：bash、终端、LSP、进程外子 agent 全走 ctx.subprocess，把 fs 和 subprocess 指向远程沙箱，整个执行世界一起搬，不用为远程执行写分支。逐个接缝看，ctx.llm 换模型、ctx.subprocess 换执行位置、ctx.subagents 从子 agent 换到委派到别的产品，换的都是 provider、变的是产品形态。回报是从一个产品变成一族可组合产品，代价是抽象层多、调试链长、三角色纪律严。

## 延伸阅读

- [能力接缝图与服务表（docs/capability-seams.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)：所有 seam/core/bundle 服务的权威清单
- [架构文档：Capability seams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：三角色与共享执行世界的总述
- [架构文档：Where new behavior goes](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：新增能力映射到哪个接缝
- [子系统：subprocess](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subprocess.md)：执行世界枢纽
- [子系统：sandbox 与 sandbox-policy](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/sandbox.md)：进程围栏与一致性
- [子系统：approval 与 permission-presets](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/approval.md)：fail closed 的权限决策

上一篇：[事件系统：四种派发模式与 waterfall 的短路艺术](./11-event-system-four-dispatch-modes.md)
下一篇：[工具执行管线：从 tool_call 到结果中间发生什么](./13-tool-execution-pipeline.md)
