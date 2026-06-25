# Codex CLI 核心命令：从交互式修代码到可审计自动化

## TL;DR

Codex CLI 不是一个单一聊天命令，而是一组面向不同工程场景的入口。日常探索用 `codex` 进入交互式 TUI；脚本、CI、批处理用 `codex exec`；中断后继续用 `codex resume`；从已有会话分出新方向用 `codex fork`；把 Codex Cloud 任务 diff 拉到本地用 `codex apply`；排查本地安装、配置、认证、Git、终端和线程问题用 `codex doctor`；需要验证沙箱行为时用 `codex sandbox`。命令选择的重点不是记住所有参数，而是把任务放进合适的执行形态，并用沙箱、审批、工作目录和输出格式控制风险。

## 读者定位

这篇写给已经安装 Codex CLI、但团队还没有统一使用规范的开发者和技术负责人。你可能已经会运行 `codex "fix this"`，但还没有把 Codex 接入稳定的本地工作流、批量任务、CI 或审查流程。本文按 2026-06-22 官方 Codex 手册和 CLI reference 的公开能力写作；实验性命令会明确标注，不把它们写成稳定基础设施。

## 问题：命令选错，风险和成本都会变形

很多人第一次使用 Codex CLI 时，只会两种动作：打开 `codex` 聊天，或者直接给一句 prompt。这样能解决一些小问题，但很难形成工程制度。真正进入团队流程后，你会遇到更多分支：这次任务需要人边看边判断，还是能一次性执行？输出是给人读，还是给脚本解析？是否允许改文件？是否允许访问网络？要不要沿用之前会话的上下文？变更来自本地还是 Cloud 任务？

如果命令形态选错，后果很具体。把高风险代码修改放进无人值守 `exec`，可能绕过必要审批；把批量审查放进交互式 TUI，会让人守着终端等结果；在 monorepo 里忘记 `--cd`，Codex 可能加载错 `AGENTS.md` 或跑错包；需要机器消费结果时只输出自然语言，后续脚本就只能做脆弱解析。CLI 的工程价值不在“能提问”，而在为不同任务提供不同控制面。

## 心智模型：把 CLI 分成五层

可以把 Codex CLI 理解为五层：

```text
入口层：codex / codex exec
会话层：resume / fork / archive / delete
Cloud 层：cloud / apply
环境层：doctor / sandbox / login / logout / completion
治理层：config / profile / sandbox / approval / execpolicy / features
```

入口层决定人是否实时参与。`codex` 是交互式 TUI，适合探索、计划、复杂修复、需要边走边问的任务；`codex exec` 是非交互入口，适合脚本、CI、定时任务和可一次说明白的任务。

会话层管理上下文。`resume` 继续旧会话，`fork` 从旧会话复制上下文再走新方向。它们管理的是 Codex 线程，不是 Git 文件状态。文件版本仍然要靠分支、stash、commit 或 worktree 管。

Cloud 层连接远程任务。官方 CLI reference 中 `codex cloud` 属于实验性命令，可从终端浏览或提交 Cloud 任务；`codex apply` 是稳定命令，用来把 Codex Cloud 任务生成的最新 diff 应用到本地工作区。

环境层解决“为什么跑不起来”。`doctor` 输出诊断报告；`sandbox` 用 Codex 提供的沙箱运行任意命令；`login`、`logout` 管认证；`completion` 生成 shell 补全。

治理层控制默认行为。全局参数如 `--sandbox`、`--ask-for-approval`、`--cd`、`--config`、`--profile` 决定 Codex 能看到什么、能改什么、什么时候停下来问人。

## 官方命令速览

截至 2026-06-22，官方 CLI reference 中与日常工程最相关的命令如下：

| 命令 | 成熟度 | 主要用途 | 使用边界 |
|---|---|---|---|
| `codex` | stable | 打开交互式终端 UI | 适合需要人工判断和多轮调整的本地任务 |
| `codex exec` | stable | 非交互运行 Codex | 适合脚本、CI、批处理、结构化输出 |
| `codex resume` | stable | 继续旧交互式会话 | 恢复上下文，不恢复 Git 状态 |
| `codex fork` | stable | 从旧会话分叉新线程 | 适合多方案实验，仍需 Git 隔离 |
| `codex apply` | stable | 应用 Cloud 任务最新 diff | 只解决 diff 落地，不替代 review 和测试 |
| `codex doctor` | stable | 生成诊断报告 | 排查安装、配置、认证、运行时、Git、终端、线程问题 |
| `codex cloud` | experimental | 浏览或提交 Cloud 任务 | 实验性命令，脚本依赖要谨慎 |
| `codex sandbox` | experimental | 在 Codex 沙箱中运行命令 | 适合验证沙箱行为，不是日常构建入口 |
| `codex execpolicy` | experimental | 评估规则文件如何处理命令 | 适合治理和审批策略调试 |
| `codex mcp` / `plugin` | experimental | 管理 MCP 服务器和插件 | 适合扩展工具链，需额外安全评估 |

成熟度很重要。稳定命令可以写进团队主流程；实验性命令可以试点，但不要在没有版本 pin、回退方案和监控的情况下放进关键 CI。

## 详细机制：交互式 `codex`

运行 `codex` 不带子命令会进入交互式 TUI。官方文档说明它接受全局 flags 和可选 prompt 或图片附件；本地低摩擦开发常见配置是 `--sandbox workspace-write --ask-for-approval on-request`。这意味着 Codex 能在工作区内读写并运行命令，但离开工作区或需要网络时会触发审批。

适合用交互式 `codex` 的场景：

- 初次理解仓库结构。
- 复杂 bug 排查，需要看日志、读代码、试命令、再决定下一步。
- 高风险改动，需要先讨论设计边界。
- 代码审查，需要人工追问和收敛。
- 长任务中途需要人判断方向。

示例：

```bash
codex
codex "Explain the authentication flow. Do not edit files yet."
codex --cd packages/web "Find why the login test is flaky. Start with a plan."
codex --sandbox read-only "Review the current diff and list risky files."
```

交互式模式的优势是人在环内。缺点是难以脚本化，输出也更适合人读。不要把交互式会话当成 CI 步骤。

## 详细机制：`codex exec`

`codex exec` 是非交互模式入口。官方文档说明它适合 CI、预合并检查、定时任务、把命令输出交给 Codex 处理、以及需要预设沙箱和审批策略的流程。默认情况下，`codex exec` 运行在只读沙箱中；如果要允许编辑，需要显式设置 `--sandbox workspace-write`；如果要更宽权限，可以设置 `--sandbox danger-full-access`，但官方建议只在受控环境使用，例如隔离 CI runner 或容器。

基本用法：

```bash
codex exec "Summarize the repository structure and list top risks"
codex exec -o review.md "Review the current diff for bugs and missing tests"
codex exec --json "Find modules without tests" | jq
```

`--json` 会把 stdout 变成 JSON Lines 事件流，事件包括 thread、turn、item、error 等类型；适合脚本消费。如果只关心最终消息，可以用 `-o` 或 `--output-last-message` 写入文件。需要稳定字段时，可以用 `--output-schema` 要求最终回答符合 JSON Schema。

自动化里要注意认证。官方文档说明 `codex exec` 默认复用已保存的 CLI 认证；CI 中可以显式提供凭据。`CODEX_API_KEY` 只支持 `codex exec`，并建议只对单次调用内联注入，不要作为 job 级环境变量暴露给会运行仓库代码的步骤。GitHub Actions 场景优先使用官方 `openai/codex-action`，因为它会安装 CLI 并在提供 API key 时启动安全代理。

## 详细机制：`resume` 与 `fork`

`codex resume` 继续之前的交互式会话，可以指定 session，也可以恢复最近会话：

```bash
codex resume --last
codex resume 0199a213-81c0-7800-8aa1-bbab2a035a53
```

`codex fork` 从之前的交互式会话分出新线程，保留原始 transcript：

```bash
codex fork --last
codex fork 0199a213-81c0-7800-8aa1-bbab2a035a53
```

官方文档还给出 `codex exec resume` 形式，用于非交互地恢复之前上下文并追加新指令：

```bash
codex exec resume --last "Fix the race conditions you found"
```

要记住：这些命令恢复的是会话上下文、计划历史和审批信息，不保证当前工作区文件仍然和当时一致。恢复前应先看 `git status --short` 和关键文件 diff。

## 详细机制：`apply`、`cloud`、`doctor`、`sandbox`

`codex apply <TASK_ID>` 会把 Codex Cloud 任务的最新 diff 应用到本地仓库。官方 reference 明确：需要认证并有权限访问任务；如果底层 `git apply` 失败，例如冲突，命令会非零退出。`apply` 成功不代表变更正确，只代表 diff 落到了本地工作区。

```bash
git switch -c codex/apply-auth-fix
codex apply <task-id>
git diff --stat
pnpm test
```

`codex cloud` 可从终端处理 Cloud 任务。它的 `--attempts` 支持 1 到 4 次候选尝试，适合需要 Best-of-N 的 Cloud 场景。因为该命令在官方表中是 experimental，团队脚本要 pin CLI 版本并准备回退路径。

`codex doctor` 生成诊断报告，覆盖本地安装、配置、认证、运行时、Git、终端、app-server 和线程清单问题。遇到“昨天能跑，今天不能跑”时，它比盲目改 prompt 更有效。

```bash
codex doctor
codex --version
git status --short
```

`codex sandbox` 用于在 Codex 提供的 macOS、Linux 或 Windows 沙箱中运行任意命令，适合验证沙箱限制、排查权限问题。它是实验性命令，不应替代项目自己的构建系统。

## 真实工作流案例：从交互分析到批量执行

假设你要修复一个 CI 失败。第一步不要直接让 Codex 改：

```bash
codex --sandbox read-only \
  "Analyze the CI failure from the pasted log. Identify likely files and propose a minimal fix. Do not edit."
```

确认方向后，用工作区写权限执行：

```bash
codex --sandbox workspace-write --ask-for-approval on-request \
  "Implement the minimal fix. Run pnpm lint, pnpm typecheck, and the related test. Stop after three failed repair loops."
```

如果这个任务后来中断：

```bash
git status --short
codex resume --last
```

如果想试另一个方案：

```bash
git worktree add .worktrees/ci-alt -b codex/ci-alt
cd .worktrees/ci-alt
codex fork --last
```

如果你已经把这个工作流稳定下来，下一步才适合迁移到 `codex exec`：

```bash
codex exec --sandbox workspace-write -o codex-fix-report.md \
  "Fix the CI failure described in ci.log. Run pnpm lint and pnpm test -- related. Report changed files and remaining risk."
```

## 操作清单

- 需要人实时判断时用 `codex`。
- 可一次说明白、需要脚本化时用 `codex exec`。
- 继续旧上下文前用 `git status --short` 检查工作区。
- 多方案实验时用 `fork` 加 Git 分支或 worktree。
- 应用 Cloud 任务 diff 时用干净分支运行 `codex apply`。
- 环境异常先跑 `codex doctor`，不要先改 prompt。
- 自动化输出需要脚本消费时用 `--json` 或 `--output-schema`。
- monorepo 任务显式设置 `--cd`，避免加载错上下文。
- 默认从 `read-only` 或 `workspace-write` 起步，少用 `danger-full-access`。
- 对实验性命令设置版本 pin 和回退方案。

## 权衡与风险

CLI 命令越多，团队越容易形成互相冲突的习惯。建议沉淀少量 profile 或 alias：只读审查、常规开发、CI 批处理。不要让每个人随手组合高权限参数。

`codex exec` 适合自动化，但上下文不如交互式自然。架构迁移、复杂排障和需要多次业务判断的任务，应先在交互式模式调通，再抽象成非交互模板。

`resume` 会节省重新解释项目的时间，也会继承旧假设。代码、依赖、分支或需求变化后，旧会话里的结论可能过时。恢复后第一步应让 Codex 重新读取当前状态。

Cloud 和本地命令的环境不同。Cloud 任务在隔离环境里运行，本地 CLI 受本机沙箱、网络、PATH、shell 和权限影响。不要把 Cloud 通过等同于本地通过，也不要把本地通过等同于 CI 通过。

## 常见误区

误区一：把 `codex exec` 当交互式会话使用。它运行完就退出，适合明确任务，不适合边聊边改。

误区二：在 monorepo 里忽略工作目录。`--cd` 会影响项目根、`AGENTS.md` 加载、相对路径和验证命令。

误区三：把 `codex apply` 当 merge。它只是应用 Cloud diff，本地仍要 review、测试和决定是否提交。

误区四：用 `--ask-for-approval never` 消除所有摩擦。无人值守只适合受控环境和明确范围。高风险命令、生产凭据、部署、数据库和网络访问仍要保守处理。

误区五：不记录 CLI 版本。Codex 仍在迭代，命令和实验性功能可能变化。CI 和团队文档里建议记录 `codex --version`。

## 团队命令规范：把个人习惯变成共享入口

团队不应该让每个人自由组合 CLI 参数。自由组合看起来灵活，实际会带来审查困难：同一个任务，有人用只读模式，有人用工作区写权限，有人直接跳过审批，产出的 diff 和风险完全不同。更稳的方式是定义少量标准入口。

```text
只读理解：codex --sandbox read-only --ask-for-approval on-request
常规开发：codex --sandbox workspace-write --ask-for-approval on-request
只读批处理：codex exec --sandbox read-only --json
小范围修复：codex exec --sandbox workspace-write --ask-for-approval on-request
排障入口：codex doctor
Cloud diff 落地：codex apply <task-id> 后必须 git diff 和验证
```

这些入口可以写成 shell alias、PowerShell function、项目脚本或团队文档。alias 的目标不是少敲几个字符，而是减少随手使用高权限参数的概率。尤其要避免把 `danger-full-access`、`--ask-for-approval never`、`--skip-git-repo-check` 做成日常别名。它们只适合受控自动化或隔离实验。

团队还应规定命令记录格式。每个由 Codex 产生的 PR 或变更说明里，至少写明：

```markdown
## Codex run

- Surface: CLI interactive / codex exec / Cloud task
- Command shape: read-only / workspace-write / Cloud apply
- Working directory:
- Sandbox:
- Approval policy:
- Verification commands:
- Codex version:
```

这不是形式主义。很多排障需要知道当时 Codex 是从哪个目录启动、加载了哪个 `AGENTS.md`、是否有写权限、是否用过 Cloud diff。如果这些信息缺失，reviewer 只能从结果猜过程。

## 场景分层：不同阶段用不同命令

一个完整工程任务可以分成四段：理解、计划、执行、交付。每段适合的 Codex CLI 入口不同。

理解阶段只读。让 Codex 解释代码、画调用链、找风险，不应给写权限。这样即使 prompt 写得宽，也不会破坏工作区。

计划阶段仍然偏只读。你可以要求 Codex 输出涉及文件、修改策略、验证命令和风险；如果计划不清，不要进入执行。

执行阶段才给 `workspace-write`。此时 prompt 应限制文件范围和 Done-when。执行阶段不要顺手让 Codex 做无关重构。

交付阶段用 Git 和验证命令收尾。`git diff --stat`、定向测试、typecheck、报告剩余风险，都属于交付证据。交付不等于 Codex 说“完成”。

对应命令可以这样写：

```bash
codex --sandbox read-only "Understand the issue and list affected files. Do not edit."
codex --sandbox read-only "Propose a minimal implementation plan and verification commands."
codex --sandbox workspace-write --ask-for-approval on-request "Implement the approved plan only."
codex --sandbox read-only "Review the final diff for scope creep and missing tests. Do not edit."
```

把阶段拆开后，失败也更容易定位。理解错了就补上下文；计划错了就改方案；执行错了就看 diff；验证失败就看命令输出。所有动作塞进一条 prompt，失败时很难知道是哪一步坏了。

## 版本与兼容性管理

Codex CLI 处在持续迭代中，官方 reference 里也明确区分 stable、experimental、beta 等成熟度。团队脚本应把稳定命令和实验命令区别对待。稳定命令可以作为主路径；实验命令应有版本 pin、失败回退和人工复核。

建议 CI 中输出：

```bash
codex --version
codex doctor
```

如果团队依赖 `codex cloud`、`codex sandbox`、`codex execpolicy`、插件或 MCP 管理命令，应在文档里标注“以某个 Codex CLI 版本验证”。不要把实验命令写进不可替代的发布路径。实验命令适合提高效率，不适合成为唯一安全门。

版本管理还包括文档更新。每次升级 Codex CLI 后，抽样跑团队标准入口：只读审查、小范围修复、`exec --json`、`apply`、`doctor`。如果输出格式、参数或默认权限发生变化，先更新团队模板，再扩大使用。

## 命令与安全审查的关系

CLI 命令本身也应进入 review。一个 PR 如果由 `codex exec --sandbox danger-full-access --ask-for-approval never` 生成，和由 `codex --sandbox workspace-write --ask-for-approval on-request` 生成，审查强度不应一样。前者需要更严格地看是否访问了不该访问的文件、是否运行了网络命令、是否改变了生成文件或锁文件。

团队可以在 PR 模板中增加一个简单问题：

```markdown
- [ ] 本次 Codex 运行没有使用 `danger-full-access` 或跳过审批；如使用，已说明原因和隔离环境。
```

这能迫使提交者正面说明权限。不是禁止高权限，而是要求高权限有上下文、有边界、有回滚。

## 命令选择的诊断树

很多 Codex CLI 使用问题不是模型问题，而是入口选错。可以用一个诊断树决定命令。

第一问：任务是否需要修改文件？如果不需要，使用只读交互或只读 `exec`。代码解释、风险扫描、日志摘要、方案比较都属于只读任务。不要为了“方便后续可能改”提前给写权限。

第二问：任务是否需要人参与中间判断？如果需要，使用交互式 `codex`。例如架构方案、需求澄清、线上事故分析、权限策略修改，都不适合一条 `exec` 跑到底。交互式模式让人能在关键节点调整方向。

第三问：任务是否可脚本化且边界明确？如果可以，使用 `codex exec`。例如批量文档检查、PR 风险摘要、固定格式代码审查、低风险迁移建议，都适合非交互模式。此时要把输出格式、验证命令和失败处理写进 prompt 或外部任务文件。

第四问：任务是否来自远程 Codex Cloud？如果是，使用 `codex apply` 把 diff 落到本地，再跑本地验证。`apply` 不是信任动作，而是把候选补丁带回真实仓库审查。

第五问：问题是否在环境、认证或沙箱？如果是，先用 `codex doctor`。不要在认证失败时反复改 prompt，也不要在沙箱失败时直接升级到危险权限。先分类，再决定是配置、网络、项目依赖还是权限策略。

这个诊断树能避免常见误用。交互式适合判断，`exec` 适合固定流程，`apply` 适合落地远程候选，`doctor` 适合排障。把它们混在一起，会让问题变得难查。

## 命令输出如何进入工程记录

CLI 命令不是一次性聊天。只要它影响代码或文档，就应该留下记录。记录不必复杂，但要能回答四个问题：从哪里启动，给了什么权限，运行了什么验证，产物如何审查。

对交互式任务，可以在最终回答里要求 Codex 写出文件列表、验证命令和未完成项。对 `exec` 任务，可以同时保存 JSONL 事件和最终消息。对 `apply` 任务，可以保存应用前后的 `git diff --stat`。对 `doctor` 排障，可以保存环境摘要和失败分类。

团队可以把命令记录放进 PR 描述：

```markdown
## Codex CLI run

- Entry: codex exec
- Working directory: repo root
- Sandbox: workspace-write
- Approval: on-request
- Network: disabled unless command requested approval
- Verification:
  - pnpm test auth
  - pnpm typecheck
- Output artifacts:
  - codex-events.jsonl
  - codex-final.md
```

这类记录能减少 review 摩擦。reviewer 不需要询问“你怎么跑的”，可以直接判断权限是否合理、验证是否覆盖风险。

## 参数组合的风险等级

同一个命令，加不同参数，风险完全不同。`codex` 默认交互和 `codex --sandbox read-only` 风险低；`codex --sandbox workspace-write --ask-for-approval on-request` 适合多数受控修改；`codex exec --json` 适合自动化审查；`codex exec --sandbox workspace-write` 适合低风险批处理；带 `danger-full-access`、跳过审批、跳过 Git 仓库检查或长期保存高权限 profile 的组合，应进入例外流程。

团队可以把参数组合写成白名单，而不是让每个人自由组合。白名单不妨少一些：只读分析、本地受控修改、CI 只读审查、Cloud diff 落地、排障入口。其它组合需要说明原因。这样做不是限制效率，而是让高风险参数不会在日常 alias 里扩散。

参数还要和任务输入一起看。处理外部 PR、网页内容、issue 评论、未知仓库和第三方依赖时，即使本地写权限很小，也要更谨慎，因为输入本身不可信。处理内部固定模板、已审查任务和单一文档文件时，权限可以稍微宽一些。安全判断从来不是只看命令。

## 团队命令手册的维护方式

CLI 版本会变，官方文档会更新，团队脚本也会调整。命令手册不能写完就不管。建议每次升级 Codex CLI 后做一次小回归：只读解释、受控写入、`exec --json`、`apply`、`doctor`。如果输出字段、默认行为或参数说明变化，先更新手册，再推广。

手册中不要堆满所有官方参数。官方 reference 已经负责完整性，团队手册负责选择。写清楚“我们常用哪些命令，为什么这么用，哪些命令需要审批，哪些命令禁止在开发者主机运行”。这比复制命令列表更有价值。

当一个命令组合连续三次被用于同类任务，并且没有造成范围漂移，可以考虑固化为脚本或 alias。当一个命令组合造成一次严重事故，应从手册中移除或加上例外流程。命令手册应反映团队经验，而不是只反映工具能力。

## 发布前复核

CLI 指南发布前要做一次命令层面的复核。第一，看示例命令是否默认给了过高权限。高权限参数可以出现，但必须带适用条件和隔离要求。第二，看命令说明是否把交互式、非交互式、远程 diff、排障入口混成一类。第三，看自动化示例是否保存输出和验证证据。第四，看版本相关能力是否留有日期或官方链接。

这类复核能防止文档变成“命令大全”。读者真正需要的不是所有参数，而是在具体任务里选择合适入口。一个团队手册如果能让新人避开危险默认值，比复制完整 reference 更有价值。官方 reference 负责完整性，本系列负责工程判断。

## 检查口径

这篇文章的检查口径是命令能不能落到真实流程。每个命令都应回答使用场景、权限边界、失败处理和验证方式。读者不需要背参数表，但要知道什么时候用交互式，什么时候用 `exec`，什么时候先 `doctor`，什么时候把 Cloud diff 带回本地审查。缺少这个判断，命令越熟练，风险越高。

## 最后确认

命令文档还要避免一个误区：把“能运行”当成“适合运行”。同一个命令在个人实验、团队仓库、CI、云端环境里的风险不同。写文档时必须把场景写进去，让读者先判断任务边界，再复制命令。

## 延伸阅读

- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference)
- [Codex 官方文档](https://developers.openai.com/codex)
- [Codex Non-interactive Mode](https://developers.openai.com/codex/noninteractive)
- [Codex GitHub Action](https://developers.openai.com/codex/github-action)
- [Agent approvals and security](https://developers.openai.com/codex/agent-approvals-security)
