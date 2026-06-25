# codex doctor：从环境、认证、沙箱到项目命令的分层排障

## TL;DR

`codex doctor` 是排查 Codex CLI 本地问题的第一步，但不是全部。官方 CLI reference 说明它会生成诊断报告，覆盖本地安装、配置、认证、运行时、Git、终端、app-server 和线程清单问题。真实排障还要把问题分成五层：CLI 是否可用，认证是否有效，配置和 `AGENTS.md` 是否按预期加载，沙箱、审批、网络和 shell 是否允许当前动作，项目自己的依赖、lint、typecheck、test 是否能脱离 Codex 正常运行。只有分层，才能避免把项目测试失败误判成 Codex 故障，或把沙箱拒绝误判成模型不会执行。

## 读者定位

这篇适合负责团队 Codex 环境的技术负责人、平台工程师，也适合经常在 Windows、WSL、企业代理、CI runner、远程开发机和多仓库环境中使用 Codex 的开发者。你需要理解 shell、PATH、环境变量、Git、代理、证书、沙箱、审批策略和项目构建命令。本文关注排障方法，不承诺覆盖所有版本细节；涉及命令参数时，以 2026-06-22 官方 Codex CLI reference 为准。

## 问题：Codex 失败不等于模型失败

当 Codex 执行失败时，第一反应常常是“它不行”。这通常太粗。常见原因包括：CLI 没装好、PATH 指向旧版本、登录过期、API key 没注入、工作目录错了、`AGENTS.md` 没加载、沙箱禁止写文件、网络默认关闭、包管理器需要访问 registry、测试依赖本地数据库、CI runner 权限不足、Windows PowerShell 和 WSL 路径不一致。

这些问题的处理方式完全不同。认证过期需要重新登录或调整 token；沙箱拒绝需要改变权限或请求审批；项目测试失败需要修项目环境；网络被禁时要预装依赖或明确开放网络；工作目录错了要设置 `--cd`。如果你不分层，只会不断重试 prompt，最后得到更长的错误日志。

排障的目标不是让 Codex “想办法绕过去”，而是确定失败属于哪一层，给出最小修复动作。团队要能快速回答：“这是 Codex CLI 层问题、认证层问题、配置层问题、执行权限问题，还是项目自身问题？”

## 心智模型：五层故障树

建议把 Codex 排障分成五层：

```text
1. CLI 层：命令是否存在，版本是否符合团队要求。
2. 认证层：ChatGPT 登录、API key、access token、组织权限是否有效。
3. 配置层：config、profile、AGENTS.md、工作目录、项目根是否正确。
4. 执行层：沙箱、审批、网络、shell、MCP、文件权限是否允许动作。
5. 项目层：依赖、测试、构建、数据库、服务、CI 脚本是否正常。
```

`codex doctor` 主要帮助前几层。项目层仍要运行项目自己的命令验证。判断原则很直接：如果不用 Codex，直接运行同一条项目命令也失败，优先修项目环境；如果项目命令能跑，但 Codex 无法调用或无法写文件，优先查配置、沙箱和审批。

## 官方能力边界

官方 CLI reference 中，`codex doctor` 是稳定命令，作用是生成本地安装、配置、认证、运行时、Git、终端、app-server 和线程 inventory 相关的诊断报告。它不是项目构建诊断器，不会知道某个 monorepo 应该先跑 `pnpm -r build`，也不会自动修复私有 registry、数据库、企业代理或本地服务依赖。

官方安全文档还说明，本地 Codex CLI/IDE 使用操作系统级沙箱，默认网络关闭，写权限通常限制在当前工作区；审批策略决定什么时候必须停下来问人。Windows 原生运行时使用 Windows sandbox，WSL2 使用 Linux sandbox 实现。`workspace-write` 并不表示有网络，网络要通过配置打开；`danger-full-access` 放宽边界，但风险也更高。

这些边界决定了排障顺序：先确认 Codex 自身健康，再确认当前任务所需权限是否被允许，最后确认项目命令是否可运行。

## 第一步：收集最小诊断信息

遇到问题先跑：

```bash
codex doctor
codex --version
git status --short
git rev-parse --show-toplevel
```

在 PowerShell 中：

```powershell
codex doctor
codex --version
git status --short
git rev-parse --show-toplevel
```

记录当前 shell、操作系统、是否 WSL、当前目录和分支。很多“Codex 找不到文件”的问题，本质是工作目录错了；很多“命令不存在”的问题，本质是 PATH 在 GUI、PowerShell、Git Bash、WSL 和 CI 中不同。

一个排障报告可以固定四行：

```text
Environment: Windows PowerShell / WSL2 / macOS / CI runner, Codex version, current directory
Command: 实际执行的 codex 命令
Error: 最小错误输出，不贴无关日志
Judgment: CLI / auth / config / sandbox / network / project command 中的哪一类
```

这比截图有用。截图不能被搜索，也经常截不到关键上下文。

## 第二步：区分认证问题

本地交互式使用通常依赖已保存的 CLI 登录。基础命令：

```bash
codex login
codex logout
```

CI 和自动化要更谨慎。官方文档说明 `codex exec` 默认复用保存的 CLI 认证；CI 中可以提供 API key，但不要把 `OPENAI_API_KEY` 或 `CODEX_API_KEY` 作为 job 级环境变量暴露给会运行仓库代码的步骤。`CODEX_API_KEY` 只支持 `codex exec`，建议只对单次调用内联注入：

```bash
CODEX_API_KEY="$OPENAI_API_KEY" codex exec --json "Summarize repo structure"
```

GitHub Actions 场景优先使用官方 `openai/codex-action`。官方文档说明该 action 会安装 Codex CLI，在提供 API key 时启动 Responses API 代理，并按你指定的权限运行 `codex exec`。这比在普通 shell step 里手工安装 CLI 并传 key 更容易控制暴露面。

认证问题的常见表现：

- CLI 能启动，但请求失败。
- 本地能跑，CI 不能跑。
- ChatGPT 登录可用，但 API key 工作流不可用。
- access token 过期或组织权限不匹配。

处理时不要把 key 写进 prompt、日志或 `AGENTS.md`。密钥只属于环境配置，不属于任务上下文。

## 第三步：检查配置与上下文加载

Codex 的行为受工作目录、配置文件、profile、`AGENTS.md` 和项目根影响。官方 AGENTS.md 指南说明，Codex 会自动加载仓库里的 `AGENTS.md`，更靠近当前目录的文件优先。官方配置文档也说明 Codex 会从工作目录向上寻找项目配置和项目根。

排查命令：

```bash
codex --sandbox read-only "List the instruction sources you loaded and summarize active rules."
codex --cd services/payments --sandbox read-only "List active instruction sources for this directory."
```

如果团队使用 profile：

```bash
codex --profile team-default "Summarize active constraints before doing any work."
codex exec --profile ci --sandbox read-only "Check whether CI profile is active."
```

常见错误是从仓库根运行了应该在子目录运行的任务，或从子目录运行导致加载了更具体但不适合的 `AGENTS.md`。monorepo 里应在脚本中显式使用 `--cd`。

配置排障还要注意 CLI 版本。Codex 配置项会随版本演进；如果团队依赖特定参数，应在 CI 中输出 `codex --version`，并对实验性功能做版本 pin。

## 第四步：检查沙箱、审批与网络

官方文档把安全控制分为两层：沙箱模式决定技术上能做什么，审批策略决定什么时候要停下来问人。常用模式包括 `read-only`、`workspace-write` 和 `danger-full-access`。`workspace-write` 允许工作区读写，但网络默认关闭；需要网络时要配置网络访问或让 Codex 请求审批。

排障时先用只读任务确认能读：

```bash
codex exec --sandbox read-only "List repository root files. Do not edit."
```

再确认工作区写权限：

```bash
codex exec --sandbox workspace-write "Create a small temporary file under the workspace, then delete it. Report what happened."
```

不要让 Codex 在排障时写到工作区外。如果任务需要访问额外目录，用官方支持的额外目录或沙箱读权限机制，而不是直接切到高权限模式。

网络问题要分清两类：Codex 请求 OpenAI 服务失败，还是项目命令访问外部 registry 或服务失败。前者是 Codex 认证/网络问题；后者是子进程网络或企业代理问题。禁网环境下，Codex 可以读本地文件和运行本地命令，但安装依赖、访问外部文档、拉取包都会失败。不要把这种失败解释成模型不会操作。

Windows 还要关注 PowerShell、Git Bash、WSL 的差异。官方 Windows 文档说明，Windows 原生沙箱和 WSL2 使用不同实现；路径、换行、执行权限、shell profile、PATH 都可能不同。团队文档要写明推荐环境，不要让每个人在不同 shell 下得出不同结论。

## 第五步：验证项目自身命令

最后脱离 Codex 跑项目命令：

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
```

如果这些命令本身失败，先修项目环境。Codex 可以帮助分析错误，但不要把项目红灯归因于 Codex。比如数据库没启动、依赖没装、Node 版本不对、私有 registry 认证失败，都属于项目运行条件问题。

对 CI runner，确认权限和 checkout：

```bash
git status --short
git rev-parse HEAD
node --version
pnpm --version
```

如果 Codex 在 CI 中只能读不能写，检查 action sandbox 或 `codex exec --sandbox` 参数；如果它能写但不能推送或评论，检查 GitHub token 权限，不要扩大 Codex 沙箱来解决 GitHub 权限问题。

## 真实工作流案例：本地能跑，CI 里 `exec` 失败

排查顺序：

1. 在 CI 日志里记录 `codex --version`、当前目录、分支和 `git status --short`。
2. 确认是使用 `openai/codex-action` 还是手工 shell step。
3. 如果手工 shell step 使用 API key，确认 key 只注入到 `codex exec` 调用。
4. 用只读 prompt 测试最小运行：

```bash
codex exec --sandbox read-only --json "Print a one sentence repo summary"
```

5. 如果只读通过、写入失败，检查 sandbox 参数和工作区权限。
6. 如果 Codex 能运行、项目测试失败，脱离 Codex 跑同一测试命令。
7. 如果测试命令也失败，修 CI 项目环境；如果只有 Codex 调用失败，再查 Codex 配置。

这种顺序能避免一次改很多变量。

## 操作清单

- 遇到问题先跑 `codex doctor` 和 `codex --version`。
- 记录 shell、操作系统、当前目录、分支和 Git 状态。
- 区分本地登录、API key、access token 和 GitHub Action 认证。
- 不把密钥写进 prompt、日志或仓库文件。
- 显式检查 `AGENTS.md` 和 profile 是否按预期加载。
- 用 `--cd` 固定 monorepo 子项目工作目录。
- 用只读任务验证 Codex 是否能读取仓库。
- 用最小写入任务验证 workspace-write 是否生效。
- 分清 Codex 网络失败和项目子进程网络失败。
- 脱离 Codex 运行项目 lint/test/build，确认项目自身健康。

## 权衡与风险

排障需要克制。一次只验证一个假设，不要同时重装 CLI、换 token、改 profile、开放网络和改测试。根因会被多变量操作掩盖。

`doctor` 能缩小 Codex 侧问题范围，但不能理解每个项目的业务依赖。企业代理、私有 registry、本地数据库、容器服务、证书链都可能需要团队自己的 runbook。

提高权限通常能让某个命令“跑过去”，但也会扩大事故半径。不要用 `danger-full-access` 掩盖配置问题。优先修路径、依赖、沙箱例外和审批规则。

自动化排障还要控制日志。不要把完整环境变量、密钥、token、私有 URL 打进 Codex prompt 或 CI artifact。日志越详细，越要做脱敏。

## 常见误区

误区一：看到 Codex 失败就改 prompt。先判断失败层级。

误区二：把项目测试失败当 Codex 故障。脱离 Codex 跑同一命令。

误区三：用高权限模式解决所有问题。权限越高，越需要隔离和审计。

误区四：忽略工作目录。`AGENTS.md`、配置和相对路径都受工作目录影响。

误区五：CI 中全局暴露 API key。按官方建议，只对单次 Codex 调用注入，或使用官方 GitHub Action。

## 团队排障 Runbook

个人排障可以靠经验，团队排障需要 runbook。建议把下面流程放进工程手册或 `AGENTS.md` 相关章节。

```text
1. 收集环境：OS、shell、Codex version、当前目录、当前分支。
2. 跑 codex doctor，保存诊断摘要。
3. 跑只读最小任务，确认 Codex 能启动并读取仓库。
4. 跑最小写入任务，确认 workspace-write 是否生效。
5. 脱离 Codex 跑项目命令，确认项目环境是否健康。
6. 如果涉及网络，区分 Codex 服务请求和项目子进程请求。
7. 如果涉及 CI，确认 secret 注入范围和 runner 权限。
8. 给出分层判断和下一步负责人。
```

每一步只验证一个假设。不要同时改 token、改配置、换 shell、重装依赖。一次改多个变量会让根因消失，后续同类问题还会发生。

排障记录也要标准化：

```markdown
## Codex troubleshooting report

- Environment:
- Codex version:
- Command:
- Sandbox / approval:
- `codex doctor` summary:
- Minimal reproduction:
- Project command result:
- Classification:
- Next owner:
```

“Next owner” 很关键。CLI 安装问题归开发者或平台；企业代理和证书归 IT 或平台；项目测试失败归仓库维护者；权限策略归安全或研发效能。没有 owner 的排障会反复回到提问者手里。

## Windows、WSL 与远程环境

Windows 环境下，Codex 可能运行在原生 PowerShell，也可能运行在 WSL2。官方文档说明原生 Windows 使用 Windows sandbox，WSL2 使用 Linux sandbox 实现。两者路径、权限、shell profile、换行、进程隔离都不同。团队需要明确推荐环境。

如果仓库本身依赖 Linux 工具链，例如 shell 脚本、符号链接、Linux-only 构建工具，WSL2 可能更贴近 CI。如果团队主要在 Windows 原生工具链上开发，例如 .NET、PowerShell、Windows SDK，原生 Codex 更自然。不要在同一个问题里来回切换环境，否则错误输出不可比。

远程开发机也要分清“控制端”和“执行端”。你在本机发送 prompt，不代表命令在本机执行。远程环境的 PATH、凭据、Git 状态和沙箱才是事实来源。排障报告里要写命令运行在哪台机器上。

## 企业网络和证书问题

企业代理、TLS 拦截、私有 CA、registry allowlist 是 Codex 排障高频来源。症状可能是登录失败、模型请求失败、包安装失败、`curl` 成功但包管理器失败、浏览器能访问但 shell 不能访问。

处理顺序：

1. 确认 Codex CLI 自身能否请求 OpenAI 服务。
2. 确认项目包管理器能否访问 registry。
3. 确认证书链是否在当前 shell 和子进程中生效。
4. 确认沙箱是否允许网络。
5. 确认企业代理是否允许对应域名和端口。

不要把所有网络失败都归为“Codex 网络坏了”。项目子进程访问 npm、PyPI、Maven、Docker registry，和 Codex 访问 OpenAI 服务是两条链路。它们可能一个通、一个不通。

## 托管配置与本地覆盖

企业或团队可能通过托管配置限制 sandbox、网络、权限或功能开关。开发者本地 `config.toml` 不一定能覆盖这些要求。排障时要问：这是个人配置问题，还是管理员策略生效？如果管理员策略禁止某类网络或高权限模式，正确做法不是让 Codex 绕过，而是走策略变更流程。

本地 profile 也可能制造误判。一个 profile 设置了只读沙箱，另一个 profile 允许工作区写入；同一 prompt 在不同 profile 下结果不同。报告里必须写明使用的 profile。没有 profile 信息的排障，经常会在团队群里变成“我这里可以”“我这里不行”。

## 排障中的安全底线

为了排障而临时开放权限很常见，但要有边界。不要把生产 token、数据库密码、SSH key 贴给 Codex；不要让 Codex 运行会修改生产资源的命令；不要为了验证网络而访问敏感内部服务。排障时的最小复现应使用无敏感数据的命令。

如果确实需要测试外部连接，可以让 Codex 输出命令，由人审查后手动运行。尤其是数据库迁移、部署、权限变更、云资源删除这类命令，Codex 可以帮助解释和准备 runbook，不应直接执行。

## 排障的第一原则：分层，不猜

Codex 运行失败时，最差的处理方式是连续改 prompt。很多失败不在 prompt 层，而在安装、认证、网络、沙箱、项目依赖、shell、路径或企业策略。`codex doctor` 的作用是把问题先分层，避免把环境问题误判成模型问题。

可以按七层排查。第一层是 CLI 是否存在且版本正确。第二层是登录或 API key 是否可用。第三层是配置文件是否被正确加载。第四层是沙箱和审批策略是否允许当前动作。第五层是网络和代理。第六层是项目依赖和命令。第七层才是任务描述和模型行为。

如果 `codex doctor` 显示认证失败，就不要讨论 prompt；先修登录。如果沙箱禁止写文件，就不要让 Codex“再试一次”；先调整权限或缩小任务。如果项目测试脚本本身在人工运行时也失败，就不要把失败归咎于 Codex。分层能让排障变短。

## 最小复现的写法

排障报告应包含最小复现。最小复现不是完整任务，而是能触发同一错误的最短命令。比如原任务是“重构认证模块并跑所有测试”，错误是包安装失败，那么最小复现可能是 `pnpm install` 或访问 registry 的 `curl`。原任务是“修改文档并运行检查”，错误是 Bash 解析 CRLF，那么最小复现是 `bash ./scripts/check.sh all`。

最小复现要写清楚环境：操作系统、shell、工作目录、Codex 版本、sandbox、approval、profile、网络策略。没有环境信息的复现很难传给平台或安全团队。

一个好的复现报告示例：

```markdown
Command: bash ./scripts/check.sh all
Environment: Windows PowerShell invoking Git Bash
Working directory: repository root
Expected: run lint, links, badges
Actual: bash reports `pipefail\r: invalid option name`
Likely layer: repository script line endings / shell compatibility
Next safe step: run LF-normalized temp copy or fix script line endings in a dedicated change
```

这样的报告能直接指导下一步，而不是留下“检查失败”四个字。

## Windows 环境的专门检查

Windows 下排障要额外关注路径、换行和 shell。PowerShell、Git Bash、WSL2、cmd 的行为不同。路径分隔符、引号、执行策略、环境变量、文件权限和行尾都会影响结果。一个命令在 WSL2 里通过，不代表在原生 PowerShell 里通过。

建议团队为 Windows 写明确入口。例如文档仓库可以规定：“检查脚本用 Git Bash 运行；如果 CRLF 导致失败，先报告，不在同一文档任务中改脚本。”代码仓库可以规定：“Node 项目使用 PowerShell 运行 npm scripts；shell 脚本只在 WSL2 或 CI 中验证。”规则越明确，Codex 越少在环境之间来回试。

遇到路径问题时，先打印 `pwd`、`Get-Location` 或 `git rev-parse --show-toplevel`。很多失败来自不在仓库根目录运行命令。遇到权限问题时，先确认 sandbox 和 Windows ACL，而不是直接提权。遇到换行问题时，先判断是脚本文件、生成文件还是 Git 配置。

## 企业托管环境的排障边界

企业环境里，很多限制是管理员策略，而不是个人配置。比如禁止某些网络、禁止高权限沙箱、强制代理、限制插件、托管 `config.toml`。开发者本地改配置无效时，应把问题转给平台或管理员，而不是尝试绕过。

排障报告要明确策略来源：本地配置、仓库规则、组织管理配置、CI runner 配置、操作系统策略，还是网络代理。不同 owner 负责不同层。把所有问题都扔给仓库维护者，会拖慢处理。

对需要凭据的排障，保持底线。不要把 token 贴进对话，不要让 Codex 读取生产密钥，不要为了确认网络而访问敏感服务。可以让 Codex 生成检查命令，由人审查后运行，并把脱敏结果提供回来。

## 排障结果如何沉淀

同一类故障出现第二次，就应该沉淀为文档或脚本。比如 Windows 上脚本行尾失败，就写入开发指南；企业代理导致包安装失败，就写入环境准备；Codex profile 被误用，就写入 `AGENTS.md` 或团队手册。不要每次都重新调查。

沉淀内容要可执行：症状、最小复现、原因、修复、不能做什么。尤其要写“不能做什么”，例如“不要通过危险模式绕过网络策略”“不要把生产凭据传给 Codex”“不要在文档任务中顺手改检查脚本”。这些限制能防止排障变成新的风险。

## 发布前复核

排障文章发布前要检查是否把失败分类写清楚。认证失败、网络失败、沙箱失败、项目命令失败、脚本兼容失败和模型理解失败，不应混在一起。分类越清楚，读者越少用错误手段解决问题。

还要检查安全边界。排障时最容易为了省时间临时开放权限、贴出 token、访问生产服务或改动团队策略。文章应反复强调：排障可以让 Codex 生成命令和报告，但高风险动作仍要由授权人员审查后执行。排障不能成为绕过治理的入口。

## 检查口径

这篇文章的检查口径是能否缩短排障路径。读者看完后，应能把错误放进安装、认证、配置、沙箱、网络、项目命令、任务描述这几层之一，并写出最小复现。排障不是试更多权限，也不是换一句 prompt。排障是找出失败层级、交给正确 owner、留下可复用记录。

## 最后确认

排障文章还应提醒读者保留原始错误。很多人会在连续尝试中覆盖最有价值的第一现场。先保存命令、退出码、关键日志和环境摘要，再开始修复。没有原始证据，后续复盘只能猜测，团队也难以改进标准配置。

排障的目标不是让命令勉强通过，而是让失败原因以后更少出现，并能被团队复用。

## 延伸阅读

- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference)
- [Codex Non-interactive Mode](https://developers.openai.com/codex/noninteractive)
- [Agent approvals and security](https://developers.openai.com/codex/agent-approvals-security)
- [AGENTS.md 官方指南](https://developers.openai.com/codex/guides/agents-md)
- [Codex GitHub Action](https://developers.openai.com/codex/github-action)
