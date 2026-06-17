# OpenAI Codex 资料与项目索引

> 更新日期：2026-05-25  
> 范围：OpenAI Codex、Codex CLI、Codex IDE、Codex Cloud、Codex App、Codex SDK / Action / MCP，以及围绕 Codex CLI 的学习资料和社区项目。

Codex 不应该只被理解成一个“写代码工具”。从当前生态看，它更像一套面向软件工程的 agent 工作台：

- **CLI**：本地终端里的 coding agent，适合读代码、改代码、跑测试、做小到中型任务。
- **IDE Extension**：在 VS Code、Cursor、Windsurf、JetBrains 等 IDE 里和 Codex 协作。
- **Cloud / Web**：把较长任务交给云端执行，适合异步开发、修 bug、开 PR、跑验证。
- **App**：桌面工作台，适合并行管理多个 agent 线程、查看 diff、跟踪长任务。
- **GitHub / CI**：通过 GitHub 集成或 Action，把 Codex 放进 PR review、自动修复和流水线。
- **SDK / MCP / Plugins / Skills**：把 Codex 扩展成可编排、可自动化、可接入工具链的工程系统。

## 推荐阅读顺序

如果你刚开始了解 Codex，建议按这个顺序看：

1. [Codex CLI 官方文档](https://developers.openai.com/codex/cli)
2. [OpenAI Codex 官方介绍](https://openai.com/index/introducing-codex/)
3. [Codex IDE 官方文档](https://developers.openai.com/codex/ide)
4. [Codex use cases](https://developers.openai.com/codex/explore/)
5. [AGENTS.md 官方指南](https://developers.openai.com/codex/guides/agents-md)
6. [openai/codex GitHub 仓库](https://github.com/openai/codex)
7. [Codex changelog](https://developers.openai.com/codex/changelog)

## 官方资料

| 资源 | 类型 | 适合谁 | 价值 |
| --- | --- | --- | --- |
| [Codex CLI](https://developers.openai.com/codex/cli) | 官方文档 | 所有 Codex 用户 | 安装、登录、升级、CLI 基础能力、审批模式、MCP、脚本化等入口 |
| [Codex IDE](https://developers.openai.com/codex/ide) | 官方文档 | IDE 用户 | 在 VS Code、Cursor、Windsurf、JetBrains 里使用 Codex，并把本地任务和 Cloud 任务串起来 |
| [Codex Cloud / Web](https://developers.openai.com/codex/cloud) | 官方文档 | 想做异步开发的人 | 了解云端任务、环境、网络访问、GitHub 集成和远程执行边界 |
| [Codex use cases](https://developers.openai.com/codex/explore/) | 官方案例库 | 想找落地场景的人 | 官方整理了前端、原生开发、生产系统、知识工作、自动化等场景，可以直接转成项目任务模板 |
| [AGENTS.md 官方指南](https://developers.openai.com/codex/guides/agents-md) | 官方指南 | 想稳定使用 Codex 的团队 | 定义全局、仓库级、目录级指令，让 Codex 知道项目规范、测试命令和协作边界 |
| [Codex changelog](https://developers.openai.com/codex/changelog) | 官方更新记录 | 重度用户 | 跟踪 CLI、App、IDE、Cloud 的能力变化，避免教程过时 |
| [Code generation guide](https://developers.openai.com/api/docs/guides/code-generation) | 官方 API 文档 | API 用户 | 解释 Codex 和代码生成模型在 API 场景下的关系 |
| [Introducing Codex](https://openai.com/index/introducing-codex/) | 官方发布文章 | 初学者、决策者 | 了解 Codex 的产品定位、Cloud agent、codex-1 / codex-mini 等背景 |
| [Introducing upgrades to Codex](https://openai.com/index/introducing-upgrades-to-codex/) | 官方发布文章 | 想了解产品演进的人 | 了解 IDE extension、GitHub 集成、Cloud 执行、code review、安全沙箱等升级 |
| [Unrolling the Codex agent loop](https://openai.com/index/unrolling-the-codex-agent-loop/) | 官方技术文章 | 高阶用户、工具开发者 | 理解 Codex 的 agent loop、harness、执行逻辑和架构思路 |

## 官方项目

| 项目 | 类型 | 能带来什么 |
| --- | --- | --- |
| [openai/codex](https://github.com/openai/codex) | 官方开源 CLI | Codex CLI 的核心仓库。适合学习终端 coding agent 的架构、权限模型、TUI、MCP、SDK、sandbox、配置系统。 |
| [openai/codex-action](https://github.com/openai/codex-action) | GitHub Action | 把 Codex 放进 GitHub Actions。适合做 PR review bot、自动修复、CI 中的代码检查，同时能控制 runner 权限。 |
| [GitHub Docs: OpenAI Codex](https://docs.github.com/en/copilot/concepts/agents/openai-codex) | GitHub 集成说明 | 了解 Codex 在 GitHub Copilot 体系里的接入方式、可用计划、VS Code extension、可选模型。 |

## 学习资料

### 入门教程

| 资源 | 语言 | 价值 |
| --- | --- | --- |
| [OpenAI Codex CLI Tutorial - DataCamp](https://www.datacamp.com/tutorial/open-ai-codex-cli-tutorial) | 英文 | 偏上手教程，适合第一次安装、跑 demo、理解 CLI 使用流程。 |
| [OpenAI Codex CLI: Setup, Configuration, and Custom Instructions](https://localskills.sh/blog/codex-cli-guide) | 英文 | 聚焦 Codex CLI 配置和 custom instructions，适合想把 Codex 放进日常开发流程的人。 |
| [AGENTS.md for OpenAI Codex: Complete Setup and Configuration Guide](https://thepromptshelf.dev/blog/agents-md-codex-setup-guide-2026) | 英文 | 专门讲 AGENTS.md，适合团队沉淀项目规范、测试命令、风格约束。 |
| [Codex CLI - The Agentic Developer's Playbook](https://sahaavi.github.io/agentic-playbook/foundation/project-memory/codex-cli.html) | 英文 | 从 agentic developer 的角度理解 Codex CLI、项目记忆和配置机制。 |
| [OpenAI Codex 中文教程](https://aiworkflowtutorials.com/docs/codex) | 中文 | 基于官方资料整理的中文教程，适合中文用户快速建立整体概念。 |
| [OpenAI Codex CLI - LuoLuo Wiki](https://luoluo.help/docs/ai-tools/codex) | 中文 | 中文 Codex CLI 教程，适合入门和命令速查。 |

### 进阶学习

| 资源 | 类型 | 价值 |
| --- | --- | --- |
| [How OpenAI uses Codex](https://cdn.openai.com/pdf/6a2631dc-783e-479b-b1a4-af0cfbd38630/how-openai-uses-codex.pdf) | 官方 PDF | 了解 OpenAI 内部如何用 Codex 做 PR review、维护 AGENTS.md、处理工程任务。 |
| [Codex changelog](https://developers.openai.com/codex/changelog) | 更新记录 | 对重度用户很重要，Codex 变化很快，很多第三方教程会过时。 |
| [GitHub topic: codex-cli](https://github.com/topics/codex-cli) | 生态索引 | 发现 Codex CLI 相关项目、技能库、插件、wrapper 和工具链。 |

## 生态项目与能带来的东西

### 1. 工作流增强

| 项目 | 定位 | 能带来什么 | 风险 / 注意点 |
| --- | --- | --- | --- |
| [wshobson/agents](https://github.com/wshobson/agents) | 多 agent harness 插件市场 | 提供 agents、skills、commands、orchestrators，可生成 Codex CLI 可用的 `.codex/skills/`、`.codex/agents/`、`AGENTS.md` 等结构。适合把 Codex 从“单次对话工具”变成“有角色、有技能、有流程的工作台”。 | 内容多，需要筛选；团队使用前要审核每个技能的指令边界。 |
| [sickn33/antigravity-awesome-skills](https://github.com/sickn33/antigravity-awesome-skills) | 大规模 agent skill 库 | 提供大量可安装技能、bundles、workflows，并支持 Codex CLI。适合快速补齐测试、调试、安全、产品、增长等任务模板。 | 技能质量参差，需要建立评测和准入规则。 |
| [codex-yolo/codex-yolo](https://github.com/codex-yolo/codex-yolo) | tmux 并行 Codex agent 自动审批 | 可以同时跑多个 Codex CLI agent，并在不关闭 OS sandbox 的情况下自动处理审批提示。适合个人高强度并行任务。 | 自动审批天然有风险，不建议直接用于敏感仓库或生产凭据环境。 |

### 2. 客户端与远程控制

| 项目 | 定位 | 能带来什么 | 风险 / 注意点 |
| --- | --- | --- | --- |
| [slopus/happy](https://github.com/slopus/happy) | Codex / Claude Code 的移动端和 Web 客户端 | 可以从手机或 Web 查看 Codex 进展、处理权限请求、切换设备，并强调端到端加密。适合“离开电脑也想盯 agent”的场景。 | 需要理解其远程控制和加密模型；团队使用前要检查代码与部署方式。 |
| [Agent Sessions](https://www.reddit.com/r/codex/comments/1sboz7z/agent_sessions_now_tracks_subagents_and_custom/) | 本地 Codex 会话索引工具 | 可用于搜索、浏览、恢复 Codex CLI 会话，适合重度用户管理大量 agent 线程。 | 目前主要从社区帖子发现，成熟度需要进一步验证。 |

### 3. 认证、账号与运行管理

| 项目 | 定位 | 能带来什么 | 风险 / 注意点 |
| --- | --- | --- | --- |
| [ndycode/codex-multi-auth](https://github.com/ndycode/codex-multi-auth) | Codex CLI 多账号 OAuth 管理器 | 支持账号切换、健康检查、诊断、恢复、项目级账号状态。适合多账号或多项目切换的个人工作流。 | 非官方项目，涉及 OAuth 凭据，本地安全边界要认真审查。 |

### 4. API / MCP / 集成层

| 项目 | 定位 | 能带来什么 | 风险 / 注意点 |
| --- | --- | --- | --- |
| [circlemouth/Codex-Wrapper](https://github.com/circlemouth/Codex-Wrapper) | Codex CLI 的 FastAPI wrapper | 把 Codex CLI 包成 OpenAI-compatible API，暴露 `/v1/chat/completions`、`/v1/models`，适合把 Codex 接入已有服务或内部工具。 | Wrapper 模式要特别注意认证、权限、并发、隔离和日志。 |
| [tuannvm/codex-mcp-server](https://github.com/tuannvm/codex-mcp-server) | Codex CLI 的 MCP server wrapper | 让 Claude Code 等 MCP client 调用 Codex 能力，适合跨 agent 协作和工具编排。 | 需要明确谁控制谁、权限怎么传递、失败怎么回滚。 |
| [openai/codex-action](https://github.com/openai/codex-action) | 官方 GitHub Action | 在 CI 中运行 Codex，适合 PR review、自动检查、自动生成修复建议。 | CI 环境里要控制 secret、网络、sandbox、sudo 权限和输出范围。 |
| [GitHub MCP Server](https://github.com/github/github-mcp-server) | GitHub 官方 MCP Server | 让 Codex 等 MCP host 访问 GitHub 仓库、Issue、PR、Actions 等上下文。适合把代码任务和 GitHub 工作流串起来。 | 权限范围要最小化，尤其是写 Issue、写 PR、操作 Actions 的能力。 |

### 5. Fork 与实验性变体

| 项目 | 定位 | 能带来什么 | 风险 / 注意点 |
| --- | --- | --- | --- |
| [Loongphy/codext](https://github.com/Loongphy/codext) | Codex CLI 的个人化 fork | 在 TUI、状态栏、复制、账号切换等 DX 上做实验，适合观察社区对 Codex CLI 体验的改进方向。 | 个人项目，不应替代官方 CLI 作为生产默认工具。 |
| [Agents2AgentsAI/ata](https://github.com/Agents2AgentsAI/ata/) | 基于 Codex CLI fork 的研究 agent | 把 Codex CLI 扩展到论文搜索、PDF 阅读、引用图谱、研究报告生成等场景。适合观察 Codex 架构如何迁移到非代码研究任务。 | 主要从社区发布发现，需进一步验证维护状态和安全边界。 |

## 研究与评测资料

| 资源 | 类型 | 价值 |
| --- | --- | --- |
| [AIDev: Studying AI Coding Agents on GitHub](https://arxiv.org/abs/2602.09185) | 论文 / 数据集 | 研究 OpenAI Codex、Devin、GitHub Copilot、Cursor、Claude Code 等 agent 生成 PR 的真实数据，可用于理解 agentic coding 生态。 |
| [Evaluating AGENTS.md](https://arxiv.org/abs/2602.11988) | 论文 | 研究仓库级上下文文件对 coding agent 是否有帮助，适合评估 AGENTS.md 的真实价值。 |
| [Configuring Agentic AI Coding Tools](https://arxiv.org/abs/2602.14690) | 论文 | 分析 Codex、Claude Code、Cursor、Gemini 等 agentic coding 工具的配置机制。 |
| [Evaluation of OpenAI Codex for HPC Parallel Programming Models Kernel Generation](https://arxiv.org/abs/2306.15121) | 论文 | 早期 Codex / Copilot 在 HPC kernel 生成上的评估，可作为历史能力对比。 |
| [Automatic Program Repair with OpenAI's Codex](https://arxiv.org/abs/2111.03922) | 论文 | 早期 Codex 在自动程序修复上的研究，适合理解代码生成模型的能力演化。 |

## 使用场景分类

### 适合优先尝试

- 读懂陌生代码库
- 小到中型功能开发
- 重构和迁移
- 写测试、补测试覆盖
- PR review
- 文档更新
- 前端页面按截图或设计稿实现
- 生成评测脚本和回归检查

### 适合谨慎尝试

- 大规模自动重构
- 涉及生产数据库、密钥、部署权限的任务
- 自动合并 PR
- 没有测试覆盖的核心业务逻辑修改
- 长时间无人看管的全自动任务
- 自动审批所有命令和网络访问

### 不建议直接交给 Codex

- 高风险权限操作
- 涉及真实用户数据的批量修改
- 没有回滚方案的生产变更
- 法务、安全、财务等高风险判断
- 需要明确责任归属的最终决策

## 评测维度建议

后续评测 Codex 时，建议从这些维度打分：

| 维度 | 看什么 |
| --- | --- |
| 使用价值 | 是否真的能完成开发任务，而不是只会解释代码 |
| 上手成本 | 安装、登录、配置、IDE 接入是否顺畅 |
| 代码理解 | 是否能跨文件、跨模块理解项目 |
| 修改质量 | 代码风格、边界情况、错误处理、类型安全 |
| 测试意识 | 是否会主动运行测试、补测试、处理失败 |
| 可控性 | 审批、sandbox、权限、回滚、diff 是否清晰 |
| 上下文管理 | AGENTS.md、项目记忆、子目录规则是否稳定 |
| 并行能力 | 多任务、多 agent、Cloud / App / CLI 协作 |
| 集成能力 | GitHub、MCP、CI、IDE、脚本化能力 |
| 安全风险 | secret、网络、文件写入、命令执行、供应链风险 |

## 当前判断

Codex 最值得关注的地方不是“代码生成”，而是它正在把 AI Coding 从聊天框推进到完整工程工作流：

- 本地 CLI 负责贴近真实仓库。
- IDE extension 负责减少上下文切换。
- Cloud / GitHub 负责异步任务和 PR 流程。
- App 负责并行管理多个 agent 线程。
- AGENTS.md、Skills、MCP、Action 负责把经验沉淀成可复用工作流。

因此，Codex 适合放在 AI Coding 工具评测的高优先级位置。它的核心评测问题应该是：

> Codex 能否在真实代码库里稳定完成可审查、可测试、可回滚的软件工程任务？

## 补充调研结果

### Codex 与 Claude Code、Cursor、Cline、Gemini CLI 的横向评测

目前没有找到一个同时覆盖 **Codex、Claude Code、Cursor、Cline、Gemini CLI** 且公开完整任务集、评分规则、原始输出的高质量同任务评测。可参考资料如下：

| 资源 | 覆盖范围 | 能带来什么 | 注意点 |
| --- | --- | --- | --- |
| [CCBench](https://ccbench.org/) | Codex CLI、Claude Code、Gemini CLI 等 | 用真实小型代码库任务评估 coding agents，适合作为横向评测的参考基线。 | 未必覆盖 Cline；需要看具体版本、模型和任务集。 |
| [AIDev: Studying AI Coding Agents on GitHub](https://arxiv.org/abs/2602.09185) | Codex、Claude Code、Cursor、Devin、Copilot 等 | 基于 GitHub 上 agent 生成 PR 的数据集，适合研究真实世界 agentic coding 行为。 | 更偏数据集和行为研究，不是手工同任务评测。 |
| [Comparing AI Coding Agents: A Task-Stratified Analysis of Pull Request Acceptance](https://arxiv.org/abs/2602.08915) | Codex、Claude Code、Cursor、Devin、Copilot | 按 PR 任务类型分析接受率，能帮助判断不同 agent 在 fix、feature、docs 等任务上的差异。 | 不覆盖 Cline 和 Gemini CLI。 |
| [Engineering Pitfalls in AI Coding Tools](https://arxiv.org/abs/2603.20847) | Claude Code、Codex、Gemini CLI | 研究 coding agents 生成代码中的工程缺陷，适合补充“失败模式”视角。 | 不覆盖 Cursor 和 Cline。 |
| [AI-Generated Code Is Not Reproducible Yet](https://arxiv.org/abs/2512.22387) | Claude Code、Codex、Gemini | 研究依赖缺口和可复现性问题，适合评测 agent 生成项目是否能真实跑起来。 | 更关注可复现性，不是综合能力排名。 |
| [Overeager Coding Agents](https://arxiv.org/abs/2605.18583) | Claude Code、OpenHands、Codex CLI、Gemini CLI | 评估 coding agents 在良性任务中越权执行的倾向。 | 适合安全评测，不适合直接做能力排名。 |

当前结论：

- 横向评测应该自己设计一套可复现任务，不建议直接采用第三方榜单结论。
- 评测任务要覆盖：bug fix、测试补全、重构、文档更新、前端 UI、依赖升级、CI 失败修复。
- 每个工具应固定模型、版本、上下文、预算、允许命令、运行次数，并保留 diff、日志和测试结果。
- Cline 相关的高质量公开基准较少，后续需要单独补充。

### Codex CLI / IDE / App / Cloud 的场景边界

| 形态 | 适合场景 | 不适合场景 | 参考资料 |
| --- | --- | --- | --- |
| CLI | 本地仓库任务、快速修改、跑测试、脚本化、CI 前自查 | 需要可视化 diff、多任务总览、长时间并行监督 | [Codex CLI](https://developers.openai.com/codex/cli) |
| IDE Extension | 日常编码、边写边问、局部改动、编辑器内协作 | 大量异步任务、跨仓库管理、复杂云端执行 | [Codex IDE](https://developers.openai.com/codex/ide) |
| App | 多 agent 并行、长任务监督、任务面板、跨工作区管理 | 替代 IDE 精细编辑、低层命令调试 | [Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/) |
| Cloud / Web | 异步任务、PR 修复、云端隔离执行、GitHub 任务委派 | 需要访问本地未提交上下文、敏感私有环境、强交互调试 | [Codex Cloud](https://developers.openai.com/codex/cloud) |
| GitHub / CI | PR review、自动检查、自动修复建议、流水线集成 | 无权限边界的自动合并、带敏感 secret 的不受信输入 | [Codex upgrades](https://openai.com/index/introducing-upgrades-to-codex/), [codex-action](https://github.com/openai/codex-action) |

一句话判断：

- **CLI** 贴近本地工程。
- **IDE** 贴近日常编辑。
- **App** 适合监督多个 agent。
- **Cloud** 适合异步委派。
- **GitHub / CI** 适合把 Codex 放进 review 和自动化流程。

### AGENTS.md 最佳实践模板

可参考资料：

- [AGENTS.md 官方指南](https://developers.openai.com/codex/guides/agents-md)
- [openai/codex 自身的 AGENTS.md](https://github.com/openai/codex/blob/main/AGENTS.md)
- [AGENTS.md best practices - agentexperience.ax](https://agentexperience.ax/concepts/agents-md/)
- [AGENTS.md Best Practices for Teams](https://www.directiveops.dev/blog/agents-md-best-practices)
- [Evaluating AGENTS.md](https://arxiv.org/abs/2602.11988)
- [On the Impact of AGENTS.md Files](https://arxiv.org/abs/2601.20404)

建议原则：

- 保持短而准，不要把工程手册全文塞进去。
- 写 agent 无法安全推断的信息：测试命令、构建命令、目录边界、风险操作、提交规范。
- 和代码一起维护。构建流程、测试命令、目录结构变化时，同步更新 AGENTS.md。
- 链接详细文档，不复制长文档。
- 针对子目录放局部 AGENTS.md，用范围而不是大而全的全局文件解决上下文问题。

推荐模板：

```md
# AGENTS.md

## Project Context

- This repository is ...
- Primary language/framework:
- Main entry points:
- Important directories:

## Commands

- Install:
- Lint:
- Type check:
- Test:
- Build:

## Working Rules

- Keep changes scoped to the requested task.
- Prefer existing patterns and local helper APIs.
- Do not introduce new dependencies without explaining why.
- Update documentation when behavior or public APIs change.

## Testing Expectations

- Run the smallest relevant test first.
- Add or update tests when changing behavior.
- If tests cannot be run, explain why and list the unverified risk.

## Safety Boundaries

- Do not touch production secrets, credentials, tokens, or deployment configs.
- Do not run destructive commands unless explicitly requested.
- Do not modify generated files unless the generation source is also updated.

## Review Checklist

- Summary of changes
- Tests run
- Known risks
- Files that need human attention
```

### Codex 用于 PR review 的真实案例

公开可验证资料：

| 资源 | 能带来什么 | 注意点 |
| --- | --- | --- |
| [Introducing upgrades to Codex](https://openai.com/index/introducing-upgrades-to-codex/) | OpenAI 官方提到 Codex 可自动 review PR，且 OpenAI 内部大规模用于 PR review。 | 公开文章不会提供完整内部 PR 样本。 |
| [openai/codex-action](https://github.com/openai/codex-action) | 官方提供用 GitHub Actions 自建 review workflow 的示例。 | 需要自己配置权限、secret 和触发条件。 |
| [From Industry Claims to Empirical Reality](https://arxiv.org/abs/2604.03196) | 研究 code review agents 在 PR 中的实际表现。 | 不是 Codex 官方案例，但适合做评测背景。 |
| [Reliability of AI Bots Footprints in GitHub Actions CI/CD Workflows](https://arxiv.org/abs/2604.18334) | 分析 AI bot 生成 PR 触发 CI/CD 的可靠性问题。 | 适合补充“PR review 不能替代 CI”的判断。 |

当前结论：

- Codex PR review 可以作为第一道自动检查，但不应该替代人工 review。
- 更合理的定位是：提前发现明显 bug、遗漏测试、风险变更、文档不一致、可维护性问题。
- 真实落地时要保留：Codex comment、diff、测试结果、人工处理结果，后续才能形成评测数据集。

### Codex Action 在 GitHub Actions 中的安全配置模板

可参考资料：

- [openai/codex-action](https://github.com/openai/codex-action)
- [codex-action security.md](https://github.com/openai/codex-action/blob/main/docs/security.md)
- [GitHub Actions secrets docs](https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-guides/using-secrets-in-github-actions)

基础模板：

```yaml
name: Codex PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: write

jobs:
  codex-review:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest

    steps:
      - name: Checkout pull request
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: Run Codex review
        uses: openai/codex-action@v1
        with:
          openai-api-key: ${{ secrets.OPENAI_API_KEY }}
          prompt: |
            Review this pull request for:
            - correctness bugs
            - missing tests
            - security risks
            - breaking changes
            - unclear behavior

            Do not make changes. Return concise findings with file references.
```

安全注意：

- 默认先只做 read/review，不自动 push 修复。
- 不要在不受信 PR 上使用高权限 `pull_request_target` 执行代码。
- `permissions` 要最小化，能读就不要写，能评论就不要给 contents write。
- 不要把 secret 拼进 prompt、日志或命令行输出。
- 对 fork PR、外部贡献者 PR、自动生成 PR 使用更严格策略。
- 让 Codex Action 尽量作为 job 的最后一步运行，减少它影响后续 action 的机会。

### Codex + MCP 的典型工具组合

| 组合 | 适合场景 | 参考资料 | 风险 |
| --- | --- | --- | --- |
| Codex + GitHub MCP Server | 读 Issue、PR、Actions、仓库上下文，辅助修复和 review。 | [GitHub MCP Server for Codex](https://github.com/github/github-mcp-server/blob/main/docs/installation-guides/install-codex.md), [GitHub Docs](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/set-up-the-github-mcp-server) | GitHub token 权限要最小化。 |
| Codex + filesystem / repo index MCP | 为大仓库提供更好的代码检索和上下文索引。 | [GitMCP for openai/codex](https://gitmcp.io/openai/codex) | 索引范围不要包含 secret、隐私数据、构建产物。 |
| Codex + Context7 / docs MCP | 获取框架和库的最新文档，减少过时 API 幻觉。 | [Context7](https://github.com/upstash/context7) | 需要校验文档版本和来源。 |
| Codex + Playwright / browser MCP | 做前端视觉检查、交互回归、截图验证。 | [OpenAI Agents SDK MCP guide](https://openai.github.io/openai-agents-js/guides/mcp/) | 浏览器自动化可能访问外部站点，注意网络和凭据。 |
| Codex as MCP tool | 让 Claude Code、Cursor、Windsurf 等 MCP client 调用 Codex CLI。 | [tuannvm/codex-mcp-server](https://github.com/tuannvm/codex-mcp-server) | 要明确主控 agent、权限传递、失败回滚。 |

当前判断：

- 最稳的第一组 MCP 是 **GitHub + 文档检索 + 浏览器验证**。
- 不建议一开始接太多 MCP server。工具越多，权限面、prompt injection 面和调试成本越高。
- MCP server 应按生产依赖审查：来源、权限、更新频率、日志、secret 处理、失败行为。

### Codex 中文资料质量筛选

目前找到的中文资料不算多，质量差异较大。建议优先收录“基于官方资料、有更新时间、能说明版本边界”的内容。

| 资源 | 类型 | 价值 | 判断 |
| --- | --- | --- | --- |
| [OpenAI Codex 中文教程](https://aiworkflowtutorials.com/docs/codex) | 中文教程 | 覆盖 App、IDE、CLI、Cloud 和安全边界，适合中文用户建立整体概念。 | 可收录 |
| [OpenAI Codex CLI - LuoLuo Wiki](https://luoluo.help/docs/ai-tools/codex) | 中文教程 | 偏入门和命令速查。 | 可收录，但需定期检查是否过时 |
| [Codex CLI CI 权限排查](https://www.boluoblog.com/coding/codex-cli-ci-github-actions-permission-2026/) | 中文文章 | 聚焦 GitHub Actions 权限、安全和 CI 使用。 | 可作为安全补充 |
| 中文百科 / 简短新闻 | 简介 | 适合了解历史背景。 | 不建议作为核心学习资料 |
| 低质量搬运文 | 教程 / 资讯 | 往往版本过时、缺少实操验证。 | 不建议收录 |

筛选标准：

- 是否标注更新时间。
- 是否区分 Codex CLI、IDE、App、Cloud。
- 是否引用官方文档或 GitHub 仓库。
- 是否说明审批模式、sandbox、secret、GitHub 权限等安全边界。
- 是否有真实命令、配置、失败处理，而不是只复述产品介绍。

<!-- CONTACT-START -->
<!-- Auto-generated by scripts/inject-contact.sh — 单一真实源: docs/_snippets/contact.html -->
<div align="center">

**「阿新聊 AI」同步更新，欢迎关注**

<br>

<table>
<tr>
<td align="center">📢<br><b>微信公众号</b><br>阿新聊ai</td>
<td align="center">🎵<br><b>抖音</b><br>阿新聊ai</td>
<td align="center">📕<br><b>小红书</b><br>阿新聊ai</td>
<td align="center">💬<br><b>微信</b><br>mindcarver</td>
</tr>
</table>

🌐 AI 社区 · <a href="https://91aihub.com/">91aihub.com</a>

</div>
<!-- CONTACT-END -->
