# OpenAI Codex 工程化实战系列

> 工程实践参考，不是功能清单。39 篇文章覆盖 Codex 从单人使用、CLI 命令、权限安全、Web/Cloud/App 委派，到 Skills、Subagents、SDK 和团队落地的完整路径。

本系列面向已经开始使用 OpenAI Codex 的工程师和技术负责人。目标不是重复讲“AI 会写代码”，而是回答一个更具体的问题：如何让 Codex 在真实仓库里受控、可验证、可复用地完成工程任务。

截至 2026-06-22，OpenAI 官方 Codex 文档已经覆盖 App、IDE、CLI、Web、GitHub/Slack/Linear 集成、配置、Rules、Hooks、AGENTS.md、Skills、Subagents、Non-interactive Mode、Codex SDK 和 GitHub Action 等模块。本系列围绕这些 Codex 自身能力展开，MCP 不再作为独立主线。

## 系列定位

Codex 工程化的核心不是“更会写提示词”，而是把一次性对话改造成工程系统：

- **入口选择**：CLI、App、Web、Cloud 和 GitHub 工作流分别适合不同任务。
- **上下文管理**：AGENTS.md、任务说明、Rules、Hooks 和 Skills 共同决定 Codex 能不能理解项目。
- **受控执行**：审批模式、沙箱、网络权限、`--yolo` 边界和验证命令决定风险上限。
- **自动化落地**：`codex exec`、GitHub Action、Automations、Subagents 和 SDK 让 Codex 从个人工具变成团队能力。

## 阅读路径

如果只想快速落地，建议按这条路径读：

1. 先读 00-02，确定自己该用哪个 Codex 入口。
2. 再读 03-08，把项目上下文、任务说明和验证闭环搭起来。
3. 接着读 10-23，掌握 CLI、配置、沙箱、网络和安全边界。
4. 如果要委派任务，读 24-30。
5. 如果要团队复用和平台化，读 31-38。

## 系列目录

### 第一部分：定位、上下文与任务工程

| # | 文章 | 重点 |
|---|------|------|
| 00 | [Codex 不是代码补全，而是工程代理工作台](./00-codex-as-engineering-workbench.md) | Codex 的工程定位、入口形态和受控执行心智模型 |
| 01 | [Codex CLI / App / Web / Cloud 怎么选](./01-codex-entrypoints-cli-app-web-cloud.md) | 多入口选择、适用场景和风险边界 |
| 02 | [安装、认证和审批模式：从第一次运行到安全基线](./02-setup-auth-approval-modes.md) | 登录、API Key、审批、沙箱和网络权限基线 |
| 03 | [AGENTS.md：把项目知识写成 Codex 能执行的上下文](./03-agents-md-project-context.md) | 项目结构、命令、规则和安全边界如何写入上下文 |
| 04 | [AGENTS.md 分层机制：monorepo 和子目录规则怎么写](./04-agents-md-layered-inheritance.md) | 全局、仓库、子目录规则的继承与覆盖 |
| 05 | [任务描述四要素：Goal、Context、Constraints、Done-when](./05-task-brief-four-elements.md) | 把需求改写成 Codex 可执行任务单 |
| 06 | [常用工作流模板：理解代码、重构、补测试和性能优化](./06-common-workflow-templates.md) | 高频工程任务的提示模板和验收方式 |
| 07 | [Ask / Plan / Execute：让 Codex 先想清楚再动手](./07-ask-plan-progressive-strategy.md) | 从只读调研到计划再到执行的授权节奏 |
| 08 | [验证循环：让 Codex 自己跑 lint、test、typecheck](./08-verification-loop.md) | 让 Codex 用命令闭环验证自己的修改 |
| 09 | [Best-of-N 与任务队列：多试选优和批量工作流](./09-best-of-n-task-queue.md) | 多候选方案、任务队列和批量执行策略 |

### 第二部分：CLI 命令与工具执行

| # | 文章 | 重点 |
|---|------|------|
| 10 | [Codex CLI 核心命令完整指南](./10-codex-cli-core-commands.md) | `codex`、`exec`、`resume`、`fork`、`apply`、`doctor`、`sandbox` 的使用边界 |
| 11 | [`codex exec`：非交互式批处理和脚本集成](./11-codex-exec-batch-mode.md) | 脚本化、CI、JSONL 输出和结构化结果 |
| 12 | [`codex resume` 和 `fork`：长任务、中断和多方案实验](./12-codex-resume-fork.md) | 长任务恢复、多方案分叉和版本控制边界 |
| 13 | [`codex apply`：把 patch 安全落到真实仓库](./13-codex-apply-patch-workflow.md) | 补丁落地、审查、验证和回滚准备 |
| 14 | [`codex doctor`：排查环境、认证和执行失败](./14-codex-doctor-troubleshooting.md) | CLI、认证、配置、沙箱和网络问题排查 |
| 15 | [Codex 工具体系总览：apply_patch、shell 和并行调用](./15-tool-system-overview.md) | 文件编辑、命令执行和工具权限的整体模型 |
| 16 | [shell_command 与工具响应截断：命令执行和上下文管理](./16-shell-command-response-truncation.md) | 输出截断、上下文预算和命令结果读取策略 |
| 17 | [并行工具调用：批量读取、搜索和验证怎么提速](./17-parallel-tool-calls.md) | 适合并行的工具调用，以及必须串行的场景 |

### 第三部分：配置、安全与网络边界

| # | 文章 | 重点 |
|---|------|------|
| 18 | [config.toml：Codex 的项目级配置中心](./18-config-toml.md) | 模型、审批、沙箱、网络和团队共享配置 |
| 19 | [Profile 配置与 Rules 系统：命名预设和命令策略](./19-profile-rules-system.md) | 命名 profile、命令策略和场景化配置 |
| 20 | [Hooks：把检查、格式化和安全动作接进 Codex 流程](./20-hooks-engineering-workflow.md) | 在 Codex 生命周期中接入检查、日志和策略动作 |
| 21 | [沙箱机制：read-only、workspace-write、danger-full-access 怎么选](./21-sandbox-kernel-isolation.md) | 三种沙箱级别和任务风险匹配 |
| 22 | [不要乱用 `--yolo`：Codex 高危模式的真实边界](./22-yolo-dangerous-mode.md) | 高权限模式的适用环境和隔离要求 |
| 23 | [Web Search 与网络控制：搜索模式、联网和安全边界](./23-websearch-network-control.md) | 搜索、联网、allowlist 和外部依赖访问 |

### 第四部分：Web、Cloud、App 与 GitHub 委派

| # | 文章 | 重点 |
|---|------|------|
| 24 | [Codex Web：把聊天请求改造成可审查工程任务](./24-codex-web-task-delegation.md) | Web 任务单、验收标准和异步委派 |
| 25 | [Codex Cloud 环境：让云端任务真的跑得起来](./25-codex-cloud-environment.md) | setup、依赖、网络、secrets 和测试契约 |
| 26 | [Codex App：多 Agent 并行工作台怎么用](./26-codex-app-parallel-workbench.md) | 多任务、多线程和并行候选方案 |
| 27 | [Worktrees：多分支、多 Agent 并行开发怎么不互相污染](./27-codex-worktrees.md) | worktree 隔离、分支策略和并行开发边界 |
| 28 | [Codex GitHub 工作流：从 Issue 到 PR 的受控闭环](./28-codex-github-pr-workflow.md) | Issue、review、修复请求、PR 和人工合并 |
| 29 | [GitHub Actions 集成：PR Review 和自动修复](./29-github-actions-integration.md) | `openai/codex-action` 的 review/fix 工作流 |
| 30 | [codex-action 安全边界：Secrets、外部 PR 和权限控制](./30-codex-action-security.md) | CI 权限、外部贡献者、runner 和 secret 风险 |

### 第五部分：复用、平台化与团队落地

| # | 文章 | 重点 |
|---|------|------|
| 31 | [Skills 入门：什么时候该创建可复用技能](./31-skills-introduction.md) | 从 prompt、AGENTS.md 到 Skill 的升级信号 |
| 32 | [Skill 文件结构：触发描述、条件匹配和资源组织](./32-skill-file-structure.md) | SKILL.md、触发条件、资源拆分和边界描述 |
| 33 | [Skill 评测：欠触发、误触发和执行失败怎么修](./33-skill-evaluation-debugging.md) | Skill 调试、正反例和失败分类 |
| 34 | [Automations：重复任务如何从手动 Prompt 变成自动运行](./34-automations-scheduled-skills.md) | 稳定流程的定时化和自动化边界 |
| 35 | [Subagents：什么时候拆分多个专业代理](./35-codex-subagents.md) | 多代理拆分、主代理汇总和成本控制 |
| 36 | [Reasoning Effort 与模型选择：推理深度、速度和成本权衡](./36-reasoning-effort-model-selection.md) | 模型、推理深度、任务风险和成本 |
| 37 | [Codex SDK：把 Codex 能力嵌入内部平台](./37-codex-sdk-platform.md) | thread、异步任务、审计、权限和平台化集成 |
| 38 | [团队落地 Codex：权限、规范、成本、评估和推广路线](./38-team-adoption-strategy.md) | 从个人试用到团队治理的落地路线 |

## 取舍说明

- 本系列不保留独立工具对比文章。对比内容容易变成工具排名，实际价值不如聚焦 Codex 自身工作流。
- MCP 不作为独立模块。它是通用工具连接能力，不是 Codex 系列最应该突出的差异点。
- 底层 Agent Loop、Compaction、Preamble 等主题不再单独成篇。相关内容合并到 CLI、工具执行、模型选择和 SDK 文章里，避免把系列写成内部机制百科。

## 延伸阅读

- [OpenAI Codex 官方文档](https://developers.openai.com/codex)
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference)
- [AGENTS.md 官方指南](https://developers.openai.com/codex/guides/agents-md)
- [Codex GitHub Action](https://developers.openai.com/codex/github-action)
- [OpenAI Codex 资料与项目索引](../openai-codex.md)

## 2026-07-22 增补专题

以下文章记录 2026 年新增或发生明显变化的 Codex 工程能力。原有 00-38 篇保持不变。

| # | 文章 | 重点 |
|---|------|------|
| 39 | [Thread History、Memory 与迁移导入](./39-thread-history-memory-import.md) | 任务恢复；持久名称；Memory；从 Claude Code 和 Cursor 导入 |
| 40 | [Multi-agent V2：角色、模型和并发怎么配置](./40-multi-agent-v2.md) | 每 Agent 模型；推理深度；角色；并发和导航 |
| 41 | [Goal 模式：长期任务如何持续推进](./41-goal-mode-long-running.md) | 目标状态；暂停恢复；长任务限制 |
| 42 | [Codex App 的浏览器、Review 与可视化工作流](./42-app-browser-review-visualization.md) | Browser；Computer Use；PR Chat；Sites；可视化 |
| 43 | [Remote Handoff：本地任务如何交给远端继续](./43-remote-handoff.md) | 环境交接；远端执行；恢复和验证 |
| 44 | [Hooks 信任生命周期：从事件触发到项目审核](./44-hooks-trust-lifecycle.md) | 当前事件模型；hash trust；managed hooks |
| 45 | [Skills、Plugins 与 Record & Replay](./45-skills-plugins-record-replay.md) | 能力复用；插件分发；执行记录和回放 |
| 46 | [App Server：用 JSON-RPC 构建 Codex 客户端](./46-app-server-json-rpc.md) | App Server；线程生命周期；自定义集成 |
| 47 | [Codex MCP Server 与 OpenAI Agents SDK](./47-mcp-server-agents-sdk.md) | MCP Server；SDK 编排；责任边界 |
| 48 | [Auto-review 与审批链：自动审查如何受控落地](./48-auto-review-approval-chain.md) | 风险分级；审批；自动审查；人类责任 |
| 49 | [Codex Security：沙箱、凭据和网络边界](./49-codex-security.md) | Sandbox；审批；凭据隔离；企业治理 |
