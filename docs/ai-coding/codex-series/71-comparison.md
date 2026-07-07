# Codex CLI vs Claude Code vs Cursor：全面对比

> TL;DR：三个主流 AI 编程工具——OpenAI Codex CLI、Anthropic Claude Code、Cursor——各有定位。Codex CLI 是纯终端 Agent，Claude Code 是 CLI + IDE 插件混合，Cursor 是 IDE 原生集成。本文从 15 个维度对比三者的能力、价格、适用场景，帮你根据实际需求选择。没有"最好的"，只有"最适合的"。

---

## 1. 三个工具的定位差异

先说清楚各自的本质，后面所有的对比才有意义。

**Codex CLI** 是一个终端 Agent。你在终端里启动它，给它一个任务描述，它自己规划步骤、读文件、改代码、跑命令、返回结果。全程终端交互，没有图形界面。底层跑 OpenAI 的 GPT-5 系列模型。开源（github.com/openai/codex），用 Rust 写的。设计哲学是"委托执行"——你扔一个任务过去，它在沙箱里自己跑完，你审查结果。

**Claude Code** 是 Anthropic 做的编程 Agent。和 Codex CLI 一样是终端工具，但它同时也有 IDE 插件（VS Code、JetBrains）。底层跑 Claude Opus / Sonnet 系列模型。不开源，但有详细的公开文档。设计哲学偏"结对编程"——你跟它对话协作，逐步完成任务，而不是扔过去就不管了。

**Cursor** 是一个 IDE，基于 VS Code fork。它不是一个 Agent，而是一个带 AI 能力的编辑器。核心体验是 Tab 补全（逐行建议）和侧边栏对话。2025 年后加入了 Agent 模式，能跨文件编辑和执行命令，但 Agent 能力是附加的，不是核心。模型可以选——GPT 系列、Claude 系列、Cursor 自家模型都行。

三者的关系可以这样理解：

| 维度 | Codex CLI | Claude Code | Cursor |
|------|-----------|-------------|--------|
| 本质 | 终端 Agent | 终端 Agent + IDE 插件 | AI IDE |
| 核心交互 | 任务描述 → 自主执行 | 对话协作 → 逐步完成 | 编辑器内补全 + 对话 |
| 运行环境 | 终端 | 终端 + 编辑器侧边栏 | 编辑器（基于 VS Code） |
| 底层模型 | GPT-5 系列（固定） | Claude 系列（固定） | 可选（GPT / Claude / 自家） |
| 开源 | 是（Rust） | 否（Node.js） | 否 |

一个关键区分：Codex CLI 和 Claude Code 是"Agent 优先"——你描述任务，它们自己规划执行。Cursor 是"编辑器优先"——你写代码，AI 在旁边辅助。Agent 模式在 Cursor 里是后来加的，不是第一天就有的设计。

---

## 2. 核心能力对比

从 15 个维度直接对比三者的能力。"+"表示支持，"-"表示不支持或需要变通，"~"表示部分支持。

| # | 能力维度 | Codex CLI | Claude Code | Cursor |
|---|---------|-----------|-------------|--------|
| 1 | 读取本地文件 | + 原生工具 | + 原生工具 | + 通过 IDE |
| 2 | 编辑/创建文件 | + 原生工具 | + 原生工具 | + Diff 应用 |
| 3 | 执行 shell 命令 | + 沙箱内 | + 沙箱内 | + Agent 模式 |
| 4 | 网络搜索 | + 内置 web_search | + WebSearch 工具 | + 内置搜索 |
| 5 | 多文件批量编辑 | + 批量 patch | + MultiEdit | + Agent 批量修改 |
| 6 | 代码补全（Tab） | - 无编辑器集成 | + IDE 插件 | + 核心功能 |
| 7 | 内联 Chat（选中代码） | - | + IDE 插件 | + 核心功能 |
| 8 | Git 操作 | + 通过 shell | + 通过 shell + Git 工具 | + 内置 Git + Agent |
| 9 | 图片/截图输入 | + App 支持截图 | + 多模态输入 | + 截图粘贴 |
| 10 | 语音输入 | + App 支持 | - | - |
| 11 | 项目规则文件 | + AGENTS.md | + CLAUDE.md | + .cursorrules |
| 12 | 会话记忆 | + Memories 系统 | + 跨会话记忆 | + Cursor Memory |
| 13 | MCP 协议支持 | + 双向（客户端+服务器） | + 客户端 | - 不支持 MCP |
| 14 | Skills/插件系统 | + Skills + Plugins + Hooks | + Hooks + Slash Commands | + Cursor Rules |
| 15 | 远程/云端执行 | + Codex Web + Codex Cloud | - 纯本地 | + Cursor Background Agent |

几个值得展开的维度：

**多文件批量编辑**。Codex CLI 用 patch 方式——它生成一个 diff，你可以逐 chunk 审查和批准。Claude Code 有专门的 MultiEdit 工具，能同时修改多个文件的多个位置。Cursor 的 Agent 模式也能批量改文件，但审查界面不如前两者精细（主要靠 diff 视图）。

**代码补全（Tab）**。这是 Cursor 的杀手锏。你在编辑器里打字，它实时预测你接下来要写什么，Tab 接受。Codex CLI 和 Claude Code 的终端模式都没有这个能力——它们只能做"整块"的代码生成和修改，不能做逐行补全。Claude Code 的 IDE 插件有基本的补全能力，但体验不如 Cursor 打磨得成熟。

**MCP 支持**。这是 Claude Code 的强项。MCP（Model Context Protocol）生态已经积累了数百个社区服务器——连接 GitHub、数据库、Figma、Slack、Jira 等等。Codex CLI 也支持 MCP，但起步晚，兼容性需要逐一测试。Cursor 不支持 MCP，它有自己的插件/扩展体系。

**远程执行**。Codex 有云端方案（Codex Web + Codex Cloud），可以在 OpenAI 的服务器上跑任务，不占本地资源。Cursor 的 Background Agent 类似——在云端跑 Agent，完成后推结果回来。Claude Code 目前是纯本地的，没有云端执行选项。

---

## 3. 价格和计费模型对比

这是大多数人最关心的维度。三个工具的定价模型差异很大。

### 个人定价

| 项目 | Codex CLI | Claude Code | Cursor |
|------|-----------|-------------|--------|
| 免费层 | 有限体验（ChatGPT Free） | Claude Free 有基本额度 | 免费试用 14 天 |
| 入门价格 | $8/月（ChatGPT Go） | $0（Claude Free） | $0（Basic，有限） |
| 标准价格 | $20/月（ChatGPT Plus） | $20/月（Claude Pro） | $20/月（Pro） |
| 高用量 | $100/月 或 $200/月（Pro 5x/20x） | $100/月 或 $200/月（Max） | $40/月（Business） |
| API 按量付费 | 支持（OpenAI API Key） | 支持（Anthropic API Key） | 不适用（无 API） |

### 计费方式差异

三个工具的计费逻辑完全不同：

**Codex CLI**：绑定 ChatGPT 套餐。Plus 套餐每 5 小时有消息额度上限（GPT-5.5 约 15-80 条、GPT-5.4-mini 约 60-350 条）。超出后需要等额度恢复，或者切换到 API Key 按量付费。API Key 没有 5 小时窗口限制，但只能用 CLI / SDK / IDE 插件，不能用 Codex App 和 Web。

**Claude Code**：绑定 Claude 套餐。Pro 套餐有用量上限，Max 套餐（$100 或 $200）提供更高的上限。Claude 的用量计算更不透明——官方没有公布具体的消息数量上限，用户反馈是根据"请求复杂度"动态调整的。API Key 按量付费时，Claude Opus 的 token 价格比 GPT-5.5 高（输入 $15/M token vs $10/M token，输出 $75/M token vs $30/M token，截至 2026 年 6 月）。

**Cursor**：最简单。Pro 套餐 $20/月，包含 2000 次 Pro 模型补全请求（每月）。Business 套餐 $40/月，不限补全次数，加团队管理。没有 API 方案——Cursor 是编辑器，不是 SDK。

### 成本估算对比

假设你的典型工作日是这样的：写代码 4 小时（约 200 次 Tab 补全 + 30 次对话请求），让 Agent 做一个大任务（代码审查或重构，约 50 次工具调用）。

| 工具 | 月费 | 日均消耗 | 是否够用 |
|------|------|---------|---------|
| Codex CLI（Plus） | $20 | Tab 补全无，对话约 80-150 条/天 | 可能不够（5 小时窗口限制） |
| Codex CLI（API Key） | $0 + token 费用 | 看用量，约 $3-8/天 | 弹性，不担心额度 |
| Claude Code（Pro） | $20 | 动态调整，大约够日常使用 | 基本够用，偶尔触顶 |
| Claude Code（API Key） | $0 + token 费用 | 看用量，约 $5-12/天 | 弹性，但 Opus 贵 |
| Cursor（Pro） | $20 | 2000 次补全 + 对话 | 补全够用，Agent 另算 |
| Codex + Cursor 组合 | $40 | Codex 做大任务，Cursor 做补全 | 比单用任一都好 |

一个诚实建议：如果你预算有限（只愿意花 $20/月），优先考虑 Cursor Pro（日常编码体验最好）或 Claude Code Pro（Agent 能力最强但需要终端习惯）。如果你预算允许 $40-60/月，两个工具组合使用效果最好——Cursor 做日常编码 + Codex 或 Claude Code 做 Agent 任务。

---

## 4. 模型能力对比

模型是 AI 编程工具的核心。但"模型能力"不是一个单一维度——代码生成质量、推理能力、上下文理解、指令遵循，每个方面都不同。

### 基准测试对比

以下数据来自公开的编程基准测试（SWE-bench、HumanEval、MBPP）和社区实际使用反馈的综合评估。基准测试不完全代表真实体验，但提供了参考。

| 基准 | GPT-5.5 | GPT-5.4-mini | Claude Opus 4 | Claude Sonnet 4 | Cursor 自家模型 |
|------|---------|-------------|---------------|----------------|---------------|
| SWE-bench Verified | ~72% | ~58% | ~75% | ~65% | ~55% |
| HumanEval | ~95% | ~88% | ~96% | ~92% | ~85% |
| 长上下文理解 | 好 | 中等 | 优秀 | 好 | 中等 |
| 指令遵循 | 好 | 中等 | 优秀 | 好 | 中等 |

几个实际使用中的观察：

**Claude Opus 在复杂推理和长上下文处理上领先**。如果你的任务涉及理解一个大型代码库、追踪跨文件的调用链、或者需要严格遵循复杂的指令约束，Claude Opus 是目前最强的选择。Reddit 和 Twitter 上的开发者反馈中，Claude Code 用户普遍认为 Opus 在代码质量上优于 GPT-5.5。

**GPT-5.5 在速度和成本上占优**。GPT-5.5 的推理速度明显快于 Claude Opus，单次请求的 token 成本更低。如果你需要快速迭代——改一点、跑一下、再改——GPT-5.5 的响应速度体验更好。GPT-5.4-mini 更快更便宜，适合简单任务。

**Cursor 的自家模型（cursor-small）主打低延迟**。它是专门为补全场景优化的小模型，响应极快（100ms 以内），但代码质量不如大模型。Cursor Pro 用户可以在补全时用自家模型（快），在对话和 Agent 模式时用 GPT 或 Claude（好）。

**代码生成质量的实际差异**。在大多数日常编程任务（写函数、修 bug、重构）中，三个工具的差距没有基准测试显示的那么大。差距主要体现在：
- 复杂架构决策：Claude Opus > GPT-5.5 > cursor-small
- 快速原型开发：GPT-5.5 ≈ Claude Sonnet > cursor-small（但 cursor-small 更快）
- 严格遵循复杂指令：Claude Opus > GPT-5.5 >> cursor-small
- 多文件重构：Claude Opus ≈ GPT-5.5 > cursor-small（但 Agent 框架的差距比模型差距大）

---

## 5. 安全模型对比

AI 编程工具的安全模型直接影响你敢不敢让它碰你的代码。三个工具的安全哲学不同。

| 安全维度 | Codex CLI | Claude Code | Cursor |
|---------|-----------|-------------|--------|
| 沙箱机制 | OS 内核级（Seatbelt/Bubblewrap/Landlock） | 类似（Seatbelt/Bubblewrap） | 进程级隔离 |
| 沙箱默认 | workspace-write（工作区可写，外不可写） | 默认开启 | Agent 模式下有基本隔离 |
| 审批与沙箱 | untrusted / on-request / never，配合 read-only / workspace-write / danger-full-access | 默认逐步确认 | Agent 模式需确认，补全自动应用 |
| 网络控制 | 默认禁止，可精细控制域名 | 可配置 | 默认允许，控制较少 |
| 权限系统 | 权限 Profile + Starlark Rules | Hooks + 权限配置 | .cursorrules |
| 企业合规 | SSO、审计日志、SCIM、EKM | SSO、审计日志 | 团队管理、审计日志 |
| 开源可审计 | 是（Rust 源码） | 否 | 否 |

**Codex CLI 的安全模型最严格**。这不是主观评价，而是架构决定的事实：

1. **沙箱在操作系统内核层面实现**。macOS 用 Seatbelt（Apple 的系统级沙箱框架），Linux 用 Bubblewrap + Landlock + seccomp。Codex 进程在独立的命名空间里运行，物理上不能写入工作目录之外的文件。这不是一个可配置的开关，是默认行为。

2. **网络默认完全禁止**。Codex 沙箱里的进程默认不能发起任何网络请求。你需要显式启用 `network_access = true`，甚至可以用代理模式精细控制允许访问的域名。

3. **权限 Profile 系统**。你可以定义精细的文件系统和网络权限规则——哪些路径可读、可写、禁止访问。这些规则在沙箱层面生效，Codex 无法绕过。

4. **开源可审计**。沙箱的完整实现代码在 GitHub 上。你可以自己检查 Bubblewrap 的配置参数、seccomp 的过滤规则、命名空间的创建逻辑。

**Claude Code 的安全模型偏实用**。它也用 Seatbelt 和 Bubblewrap，但默认策略比 Codex 宽松。Claude Code 的安全控制主要通过 Hooks（钩子）系统实现——你可以在特定操作前后插入自定义逻辑（比如写文件前检查内容）。灵活但需要你自己写 Hook。

**Cursor 的安全模型最松**。Cursor 的核心场景是编辑器内补全和对话——代码变更直接应用到编辑器，没有沙箱隔离。Agent 模式下有基本的审批机制，但不是 OS 内核级别的。如果你对安全性要求高，不建议用 Cursor 的 Agent 模式处理敏感项目。

### 安全推荐

- **个人开发、日常项目**：三个工具都够用。Codex CLI 和 Claude Code 的安全模型明显强于 Cursor，但日常开发中你不太会触发边界情况。
- **企业环境、敏感数据**：Codex CLI > Claude Code >> Cursor。Codex 的开源特性和严格的沙箱使它成为企业安全审查的首选。
- **CI/CD 自动化**：Codex CLI（exec 模式 + 沙箱 + API Key）是最成熟的方案。Claude Code 也可以（headless 模式），但文档不如 Codex 完善。

---

## 6. 扩展生态对比

| 生态维度 | Codex CLI | Claude Code | Cursor |
|---------|-----------|-------------|--------|
| MCP 服务器 | 支持接入（客户端+服务器） | 大量社区服务器可用 | 不支持 MCP |
| Skills/技能系统 | 内置 + 自定义 + 可共享 | Slash Commands | Cursor Rules |
| Hooks/钩子 | 支持（Shell 钩子） | 支持（26 个拦截点） | 不支持 |
| 插件系统 | Plugins（可开发） | 第三方 IDE 集成 | VS Code 扩展 |
| 第三方集成 | GitHub/Slack/Linear | GitHub/Jira/各种 MCP | GitHub/GitLab |
| 社区规模 | GitHub 75K+ stars，活跃 | 社区大但工具分散 | 用户量大，社区活跃 |
| 开发者文档 | 完善（developers.openai.com） | 完善（docs.anthropic.com） | 完善（cursor.com） |

**MCP 生态是 Claude Code 最大的差异化优势**。截至 2026 年中，社区已有数百个 MCP 服务器，覆盖从 GitHub、Jira 到 Figma、数据库、Kubernetes 等场景。Claude Code 原生支持 MCP，接入一个新工具只需要几行 JSON 配置。Codex CLI 也支持 MCP，但兼容性需要逐一验证——因为 Codex 的 MCP 客户端是 Rust 实现的，和 Claude Code 的 Node.js 实现有细微差异。

**Codex CLI 的 Skills 系统更结构化**。一个 Skill 是一个打包好的指令集——包含提示词模板、工具配置、甚至可执行脚本。Skills 可以 check 进代码仓库，团队成员 clone 后自动获得。这比 Cursor Rules（纯文本指令）和 Claude Code 的 Slash Commands（提示词片段）更完整。

**Cursor 的优势在于 VS Code 扩展生态**。因为它基于 VS Code fork，所有 VS Code 扩展都能直接用。如果你依赖特定的 VS Code 扩展（调试器、语言支持、主题），Cursor 是唯一不需要妥协的选择。

---

## 7. 多 Agent 能力对比

多 Agent 是 2025-2026 年 AI 编程工具的重要发展方向——让多个 Agent 并行处理不同任务。

| Agent 维度 | Codex CLI | Claude Code | Cursor |
|-----------|-----------|-------------|--------|
| 子 Agent 派生 | subagent（并行） | Task agent（子代理） | Background Agent |
| 最大并发 | max_threads=6（默认） | 无硬性上限 | 1-3 个后台任务 |
| 上下文隔离 | 独立线程，返回摘要 | 独立上下文 | 独立 worktree |
| /fork 分叉 | + /fork 和 /side | + 分叉对话 | - |
| Agent 角色定制 | + 自定义 agent 类型 | + 自定义 persona | - |
| 目标协调 | /goal 追踪 | 无内置 | - |
| CI/CD 并行 | + SDK 批量调用 | + headless 模式 | - |

**Codex CLI 的多 Agent 方案最完整**。从配置到执行到协调都有明确的设计：
- `max_threads` 控制并发上限
- `max_depth` 控制嵌套深度（防止无限递归）
- 子 Agent 完成后只返回摘要，不污染主线程上下文
- `/goal` 追踪多 Agent 的目标对齐

**Claude Code 的子代理机制灵活**。它没有 Codex 那样的显式线程管理，但可以通过 Task agent 派生子代理执行独立任务。Claude Code 的优势在于 Hooks——你可以在子代理的生命周期中插入自定义逻辑（比如在子代理完成后自动运行测试）。

**Cursor 的 Background Agent 是后加入的功能**。它能在后台跑 Agent 任务（不阻塞编辑器），但并发能力有限，也没有目标协调机制。适合"让 AI 在后台修一个 bug"这种简单场景，不适合"同时派三个 Agent 审查代码"这种复杂场景。

---

## 8. CI/CD 集成能力对比

对于想把 AI 编程工具集成到自动化流程中的团队，这个维度很关键。

| CI/CD 维度 | Codex CLI | Claude Code | Cursor |
|-----------|-----------|-------------|--------|
| 非交互模式 | `codex exec`（成熟） | `claude -p`（headless） | 不适用 |
| SDK | Codex SDK（Node.js） | Agent SDK（Python/JS） | 不适用 |
| GitHub Actions | codex-action（官方） | 社区 action | 不适用 |
| 输出格式 | JSONL 事件流 | JSON / 文本 | 不适用 |
| 会话恢复 | `codex exec resume` | `claude --resume` | 不适用 |
| 批量任务 | SDK + 脚本 | 脚本 | 不适用 |
| 沙箱隔离 | 完整（沙箱在 CI 中更安全） | 基本隔离 | 不适用 |

**Codex CLI 在 CI/CD 场景下优势明显**。原因不是能力更强，而是设计更早、文档更完善：

1. `codex exec` 是一等公民——专门的子命令，不需要额外参数来关闭 TUI。输出是结构化的 JSONL 事件流，容易解析。
2. Codex SDK 可以在 Node.js 代码里直接调用 Agent，适合自定义的自动化脚本。
3. `codex-action` 是官方的 GitHub Action，开箱即用——在 PR 上 `@codex review this` 就能触发代码审查。
4. 沙箱在 CI 环境中提供额外安全层——即使 Agent 行为异常，CI Runner 的文件系统也有保护。

**Claude Code 的 headless 模式也能用**。`claude -p "prompt"` 可以在非交互环境里跑，但没有 Codex exec 那么多配置选项。Claude Code 的 Agent SDK 更适合构建自定义的 AI 应用，而不是纯 CI 自动化。

**Cursor 不参与 CI/CD 竞争**。它是一个编辑器，不是 SDK。如果你的自动化需求是"CI 里自动修 bug"或"PR 自动审查"，Cursor 不是正确的工具。

---

## 9. 学习曲线和上手难度

| 维度 | Codex CLI | Claude Code | Cursor |
|------|-----------|-------------|--------|
| 安装难度 | 中（npm install，需配 API Key） | 中（npm install，需配 API Key） | 低（下载安装，登录即可） |
| 界面熟悉度 | 低（TUI，需要终端习惯） | 低（TUI，需要终端习惯） | 高（VS Code 界面，无学习成本） |
| 基本使用门槛 | 中（需要理解 Agent 概念） | 中（需要理解 Agent 概念） | 低（Tab 补全，开箱即用） |
| 进阶配置复杂度 | 高（config.toml 体系庞大） | 中（JSON 配置 + CLAUDE.md） | 低（设置面板 + .cursorrules） |
| 文档完整度 | 高（本系列 72 篇 + 官方文档） | 高（官方文档 + 社区资源） | 中（官方文档为主） |
| 概念数量 | 多（沙箱、Profile、MCP、Skills、Hooks...） | 多（Hooks、MCP、Memory、Personas...） | 少（补全、对话、Agent 模式） |

**Cursor 的上手门槛最低**。如果你用 VS Code，切换到 Cursor 几乎没有学习成本。安装后打开项目，Tab 补全自动启用，侧边栏对话直接可用。5 分钟内就能感受到价值。

**Codex CLI 和 Claude Code 的上手门槛类似**。两者都需要终端习惯和 Agent 概念理解。第一次用的人常见的问题是："我应该给 Agent 多大的自由度？"——这需要实际使用几次才能建立直觉。Codex CLI 的配置体系更复杂（config.toml 有几十个配置项），但也更精细。Claude Code 的 CLAUDE.md 概念更直观——在项目根目录写一个 Markdown 文件就行。

**进阶使用的学习曲线**：Codex CLI > Claude Code > Cursor。Codex 的进阶功能（多 Agent、沙箱配置、MCP 开发、Skills 开发）需要理解更多概念。本系列 72 篇文章的存在本身就说明了 Codex 的学习深度。

---

## 10. 适用场景推荐表

直接说"什么场景用什么工具"。

| 场景 | 推荐工具 | 理由 |
|------|---------|------|
| 日常写代码（Web/后端） | Cursor | Tab 补全体验最好，编辑器内对话方便 |
| 终端环境（SSH/服务器） | Codex CLI 或 Claude Code | 只有两个工具有终端 Agent |
| 大型重构（跨文件/模块） | Claude Code 或 Codex CLI | Agent 能力强，多文件编辑可靠 |
| 代码审查 | Codex CLI | exec 模式 + 沙箱 + GitHub Action 集成 |
| 修 Bug | 三个都行 | Cursor 看上下文快，Agent 模式修复杂 bug |
| CI/CD 自动化 | Codex CLI | exec 模式 + SDK + Action 最成熟 |
| 学习新项目/代码库 | Claude Code 或 Codex CLI | Agent 可以深入探索整个代码库 |
| 写测试 | Claude Code 或 Codex CLI | Agent 能跨文件理解代码逻辑，生成针对性测试 |
| DevOps/基础设施 | Codex CLI | 终端原生、沙箱安全、shell 命令可靠 |
| 前端 UI 开发 | Cursor | 实时预览 + Tab 补全 + 设计稿集成 |
| 企业合规环境 | Codex CLI | 开源可审计、严格沙箱、SSO/SCIM/EKM |
| 团队协作 | Cursor（日常）+ Codex CLI（Agent） | 互补方案 |
| 一次性脚本 | Claude Code 或 Codex CLI | 描述需求，Agent 直接生成 |
| 移动端/轻量设备 | Codex Web（浏览器版） | 不需要本地安装 |

### 按角色推荐

| 角色 | 主力工具 | 辅助工具 | 理由 |
|------|---------|---------|------|
| 前端工程师 | Cursor | Claude Code IDE 插件 | Tab 补全 + UI 预览是日常刚需 |
| 后端工程师 | Codex CLI | Cursor | 终端工作流 + Agent 任务 |
| DevOps 工程师 | Codex CLI | Claude Code | 纯终端环境，需要可靠的 shell 执行 |
| 技术负责人 | Codex App + Cursor | Claude Code | 多任务管理 + 代码审查 |
| 数据科学家 | Cursor | Codex CLI | Jupyter 集成 + Tab 补全 |
| 全栈工程师 | 三个都用 | — | 不同场景用不同工具 |

---

## 11. 可以一起用吗

可以，而且推荐这样做。

三个工具不是互斥的。很多开发者日常使用的是 Cursor + Codex CLI 或 Cursor + Claude Code 的组合。具体怎么组合：

### 组合一：Cursor（日常编码）+ Codex CLI（Agent 任务）

这是目前最常见的组合。Cursor 负责日常编码——Tab 补全、侧边栏对话、实时预览。Codex CLI 负责大任务——重构、审查、自动化。

实际操作：

- 你在 Cursor 里写代码，遇到问题在侧边栏问 Cursor
- 需要做一个大改动时，开终端跑 `codex "重构用户认证模块，从 JWT 迁移到 session"`
- Codex 在沙箱里改完，你审查 diff，确认后切回 Cursor 继续工作

月成本：$20（Cursor Pro）+ $20（ChatGPT Plus）= $40/月。

### 组合二：Cursor（日常编码）+ Claude Code（Agent 任务）

和上面的组合类似，只是把 Codex CLI 换成 Claude Code。

Claude Code 的优势是 MCP 生态——如果你需要连接 GitHub、Jira、数据库等外部工具，Claude Code 的 MCP 集成更成熟。Claude Code 的代码质量在社区反馈中也略好于 Codex。

月成本：$20（Cursor Pro）+ $20（Claude Pro）= $40/月。

### 组合三：Codex CLI + Claude Code（双 Agent）

不推荐作为日常方案，但在特定场景下有用——比如你想对比两个 Agent 的代码质量，或者一个 Agent 的输出给另一个 Agent 审查。

注意：两个工具同时运行时，文件系统可能产生冲突。建议用不同的 git branch 或 worktree。

### 切换策略

如果你不想同时订阅两个服务，可以这样切换：

- **按任务切换**：简单任务用 Cursor（补全快），复杂任务用 Codex CLI 或 Claude Code（Agent 强）
- **按模型切换**：需要 Claude Opus 的推理能力时用 Claude Code，需要 GPT-5.5 的速度时用 Codex
- **按环境切换**：在编辑器里用 Cursor/IDE 插件，在终端/SSH 里用 CLI 工具

---

## 12. 选择决策树

最后用一个决策树帮你快速选择：

```
你的主要工作环境是什么？
├── 编辑器（VS Code/JetBrains）
│   ├── 主要需求是 Tab 补全和编辑器内对话？→ Cursor
│   ├── 主要需求是 Agent 模式做复杂任务？→ Claude Code IDE 插件 或 Codex IDE 插件
│   └── 两个都要？→ Cursor（补全）+ Codex/Claude IDE 插件（Agent）
│
├── 终端（SSH/tmux/Vim）
│   ├── 需要最强的安全隔离？→ Codex CLI
│   ├── 需要最好的代码质量？→ Claude Code
│   ├── 需要最快的响应速度？→ Codex CLI（GPT-5.4-mini）
│   └── 需要最丰富的 MCP 生态？→ Claude Code
│
├── CI/CD 自动化
│   ├── GitHub Actions 集成？→ Codex CLI（codex-action）
│   ├── 自定义脚本？→ Codex CLI（exec 模式）或 Claude Code（headless）
│   └── 需要开源可审计？→ Codex CLI
│
└── 团队/企业管理
    ├── 需要严格的安全合规？→ Codex CLI（Enterprise）
    ├── 需要统一 IDE 体验？→ Cursor Business + Codex IDE 插件
    └── 需要自定义工具集成？→ Claude Code（MCP 生态）+ Codex CLI（Skills）
```

### 一句话总结

- **Cursor**：你要的是一个更好用的编辑器，AI 能力是加分项。
- **Codex CLI**：你要的是一个能在终端里跑的编程 Agent，安全性和 CI 集成是刚需。
- **Claude Code**：你要的是代码质量最好的编程 Agent，MCP 生态和灵活性是加分项。
- **组合使用**：大多数专业开发者的最终选择。

---

## 延伸阅读

- [第 01 篇：Codex 是什么](01-what-is-codex.md) — Codex 四种形态的完整介绍，包含与其他工具的初步对比
- [第 29 篇：沙箱机制全解析](29-sandbox.md) — Codex 沙箱的底层实现细节，理解安全模型的硬件基础
- [第 36 篇：MCP 服务器接入](36-mcp-server.md) — Codex 的 MCP 客户端/服务器双向架构
- [第 43 篇：多 Agent 协作总览](43-multi-agent.md) — Codex 的子代理系统和并行执行
- [第 48 篇：exec 非交互模式](48-exec-mode.md) — Codex 在 CI/CD 中的核心用法
- [Codex CLI GitHub 仓库](https://github.com/openai/codex) — 开源源码，可直接审查沙箱实现
- [Claude Code 官方文档](https://docs.anthropic.com/en/docs/claude-code) — Anthropic 的 Claude Code 完整文档
- [Cursor 官方文档](https://cursor.com/docs) — Cursor IDE 的功能文档和配置指南
