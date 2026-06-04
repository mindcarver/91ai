# Codex CLI 完全指南系列

这个目录收录 Codex CLI 的完整学习资料，共 72 篇。内容从安装、认证、第一次对话开始，逐步进入命令、配置、安全、扩展、多 Agent、自动化、企业部署和真实工程工作流。

如果只是想快速上手，优先读第 01-15 篇。如果要在团队里落地，重点读第 22-35 篇和第 54-58 篇。如果要把 Codex 放进 CI/CD 或内部平台，重点读第 48-53 篇。

## 阅读路径

| 目标 | 推荐文章 |
| --- | --- |
| 快速上手 | [01](./01-what-is-codex.md)、[02](./02-install-guide.md)、[03](./03-authentication.md)、[04](./04-first-conversation.md)、[05](./05-approval-modes.md) |
| 日常开发 | [07](./07-read-code.md)、[08](./08-edit-code.md)、[09](./09-run-commands.md)、[10](./10-session-management.md)、[11](./11-context-management.md)、[12](./12-code-review.md) |
| 命令参考 | [16](./16-cmd-session.md)、[17](./17-cmd-model.md)、[18](./18-cmd-permissions.md)、[19](./19-cmd-info.md)、[20](./20-tool-integration-commands.md)、[21](./21-cmd-ui.md)、[67](./67-command-cheatsheet.md) |
| 配置与安全 | [22](./22-config-overview.md)、[23](./23-config-basic.md)、[24](./24-config-provider.md)、[25](./25-config-tui.md)、[26](./26-shell-and-sandbox-config.md)、[27](./27-config-profiles.md)、[28](./28-agents-md.md)、[29](./29-sandbox.md)、[30](./30-approval-policy.md)、[35](./35-security-checklist.md) |
| 扩展能力 | [36](./36-mcp-server.md)、[37](./37-mcp-dev.md)、[38](./38-skills-dev.md)、[39](./39-hooks.md)、[40](./40-apps.md)、[41](./41-plugins.md)、[42](./42-memories.md) |
| 自动化与平台 | [48](./48-exec-mode.md)、[49](./49-auto-review.md)、[50](./50-scripting.md)、[51](./51-github-actions.md)、[52](./52-sdk.md)、[53](./53-app-server.md) |
| 企业治理 | [54](./54-admin.md)、[55](./55-enterprise-auth.md)、[56](./56-windows.md)、[57](./57-otel.md)、[58](./58-compliance.md) |
| 真实工作流 | [59](./59-prompt-engineering.md)、[60](./60-workflow-bugfix.md)、[61](./61-workflow-refactor.md)、[62](./62-workflow-testing.md)、[63](./63-workflow-debugging.md)、[64](./64-parallel-agents.md)、[65](./65-migration.md) |

## 目录

### 第一季：入门篇

| # | 文章 | 主题 |
| --- | --- | --- |
| 01 | [Codex 是什么：四种形态全介绍](./01-what-is-codex.md) | CLI、App、IDE、Web 四种形态与适用场景 |
| 02 | [Codex CLI 安装全平台指南](./02-install-guide.md) | macOS、Linux、Windows、Node.js、二进制安装 |
| 03 | [首次登录与认证配置](./03-authentication.md) | ChatGPT 登录、API Key、凭据存储与排错 |
| 04 | [第一次和 Codex 对话](./04-first-conversation.md) | 启动 TUI、写提示词、查看改动和退出 |
| 05 | [三种审批模式详解](./05-approval-modes.md) | Auto、Read-only、Full Access 的选择与风险 |
| 06 | [模型选择与切换](./06-model-selection.md) | 模型、推理强度、质量和成本取舍 |

### 第二季：基础操作篇

| # | 文章 | 主题 |
| --- | --- | --- |
| 07 | [让 Codex 读你的代码](./07-read-code.md) | 文件读取、上下文注入、图片输入 |
| 08 | [让 Codex 改你的代码](./08-edit-code.md) | 文件编辑、patch、diff 审查与回滚 |
| 09 | [让 Codex 跑命令](./09-run-commands.md) | shell 工具、后台终端、审批与安全 |
| 10 | [会话管理：开始、继续、分叉](./10-session-management.md) | `/new`、`/resume`、`/fork`、会话历史 |
| 11 | [上下文管理：别让对话太长](./11-context-management.md) | `/compact`、token 预算和上下文压缩 |
| 12 | [代码审查：/review 和 /diff](./12-code-review.md) | 人工审查、自动审查和 CI 审查 |
| 13 | [规划模式：/plan](./13-plan-mode.md) | 先规划再执行的工作流 |
| 14 | [目标追踪：/goal](./14-goal-tracking.md) | 长任务目标追踪和状态管理 |
| 15 | [网络搜索：让 Codex 上网查资料](./15-web-search.md) | Web search、代理、网络边界 |

### 第三季：斜杠命令参考篇

| # | 文章 | 主题 |
| --- | --- | --- |
| 16 | [会话控制类命令](./16-cmd-session.md) | `/clear`、`/new`、`/resume`、`/fork`、`/side`、`/quit` |
| 17 | [模型与推理类命令](./17-cmd-model.md) | `/model`、`/fast`、`/personality`、`/plan`、`/goal` |
| 18 | [权限与安全类命令](./18-cmd-permissions.md) | `/permissions`、`/approve`、`/mcp`、`/sandbox` |
| 19 | [信息查看类命令](./19-cmd-info.md) | `/status`、`/diff`、`/compact`、`/copy`、`/raw`、`/debug-config` |
| 20 | [工具与集成类命令](./20-tool-integration-commands.md) | `/skills`、`/apps`、`/plugins`、`/hooks`、`/agent`、`/ide`、`/mention` |
| 21 | [个性化与 UI 类命令](./21-cmd-ui.md) | `/theme`、`/keymap`、`/statusline`、`/vim`、`/init`、`/memories` |

### 第四季：配置篇

| # | 文章 | 主题 |
| --- | --- | --- |
| 22 | [配置文件体系总览](./22-config-overview.md) | 四层加载优先级、合并规则和信任边界 |
| 23 | [基础配置项](./23-config-basic.md) | model、sandbox、features、history、web search |
| 24 | [模型与 Provider 配置](./24-config-provider.md) | 自定义 Provider、API Key、OAuth、企业网关 |
| 25 | [TUI 界面配置](./25-config-tui.md) | 主题、快捷键、状态栏、外部编辑器 |
| 26 | [Shell 与沙箱配置](./26-shell-and-sandbox-config.md) | shell 环境、环境变量继承、沙箱参数 |
| 27 | [Profile 配置](./27-config-profiles.md) | 多环境切换、项目覆盖、权限分层 |
| 28 | [AGENTS.md 项目指令文件](./28-agents-md.md) | 项目上下文、团队规则和分层继承 |

### 第五季：安全篇

| # | 文章 | 主题 |
| --- | --- | --- |
| 29 | [沙箱机制全解析](./29-sandbox.md) | macOS、Linux、Windows 沙箱实现 |
| 30 | [审批策略详解](./30-approval-policy.md) | approval policy、命令规则和策略分发 |
| 31 | [自动审核与权限持久化](./31-auto-approve.md) | auto review、permissions.toml、审批记忆 |
| 32 | [权限 Profile 机制](./32-permission-profiles.md) | `[permissions]`、继承、路径与网络规则 |
| 33 | [网络安全与隔离](./33-network-security.md) | 网络通道、搜索工具、代理和隔离策略 |
| 34 | [requirements.txt 与依赖安全](./34-dependencies.md) | 依赖投毒、锁文件、安装脚本和供应链风险 |
| 35 | [安全最佳实践清单](./35-security-checklist.md) | 账号、沙箱、审批、依赖、CI 和团队检查清单 |

### 第六季：扩展篇

| # | 文章 | 主题 |
| --- | --- | --- |
| 36 | [MCP 服务器接入](./36-mcp-server.md) | MCP 配置、工具白名单、OAuth 和安全边界 |
| 37 | [MCP 工具开发实战](./37-mcp-dev.md) | Python、TypeScript MCP Server 开发 |
| 38 | [Skills 技能开发](./38-skills-dev.md) | 技能结构、触发条件、团队复用 |
| 39 | [Hooks 钩子机制](./39-hooks.md) | PreToolUse、PostToolUse、审计与拦截 |
| 40 | [Apps 连接器生态](./40-apps.md) | GitHub、Linear、Notion 等标准连接器 |
| 41 | [Plugins 插件开发](./41-plugins.md) | 插件结构、市场、分发和版本管理 |
| 42 | [Memories 记忆系统](./42-memories.md) | 用户偏好、项目记忆和隐私边界 |

### 第七季：多 Agent 篇

| # | 文章 | 主题 |
| --- | --- | --- |
| 43 | [多 Agent 协作总览](./43-multi-agent.md) | 子代理、并行探索、协调方式 |
| 44 | [自定义 Agent 角色](./44-custom-agent.md) | 角色配置、能力边界和团队模板 |
| 45 | [/fork 与 /side 分叉对话](./45-fork-side.md) | 分叉探索、临时线程和方案对比 |
| 46 | [/goal 多 Agent 目标协调](./46-multi-agent-goal.md) | 多线程目标同步和长任务治理 |
| 47 | [执行策略](./47-exec-policy.md) | execution policy、规则匹配和审批决策 |

### 第八季：自动化篇

| # | 文章 | 主题 |
| --- | --- | --- |
| 48 | [exec 非交互模式](./48-exec-mode.md) | 批处理、JSONL、恢复会话和 CI 参数 |
| 49 | [review 自动审查](./49-auto-review.md) | Agent 审查 Agent、guardian 和风险拦截 |
| 50 | [脚本化 Codex](./50-scripting.md) | Shell、CI/CD、批处理和自动化模板 |
| 51 | [GitHub Actions 集成](./51-github-actions.md) | PR 审查、迁移任务和安全策略 |
| 52 | [Codex SDK 编程接入](./52-sdk.md) | Python SDK、事件流、审批回调 |
| 53 | [App Server 模式](./53-app-server.md) | 远程连接、团队共享和协议细节 |

### 第九季：企业篇

| # | 文章 | 主题 |
| --- | --- | --- |
| 54 | [管理员配置指南](./54-admin.md) | 组织策略、系统配置、模型和网络限制 |
| 55 | [企业认证与 SSO](./55-enterprise-auth.md) | 身份集成、短期凭据、密钥管理 |
| 56 | [Windows 部署专题](./56-windows.md) | Windows 环境、路径、权限和企业部署 |
| 57 | [OpenTelemetry 可观测性](./57-otel.md) | traces、metrics、logs 和团队监控 |
| 58 | [安全插件与合规](./58-compliance.md) | 合规策略、审计和安全插件 |

### 第十季：实战篇

| # | 文章 | 主题 |
| --- | --- | --- |
| 59 | [提示工程：让 Codex 听懂你](./59-prompt-engineering.md) | 任务拆解、约束表达和验证提示词 |
| 60 | [真实工作流：修 Bug 全流程](./60-workflow-bugfix.md) | 复现、定位、修复、验证 |
| 61 | [真实工作流：重构大型项目](./61-workflow-refactor.md) | 大型重构的分阶段执行 |
| 62 | [真实工作流：写测试全覆盖](./62-workflow-testing.md) | 测试补齐、覆盖率和失败分析 |
| 63 | [真实工作流：调试复杂问题](./63-workflow-debugging.md) | 日志、性能、内存、竞态和跨服务调试 |
| 64 | [多 Agent 并行实战](./64-parallel-agents.md) | 并行探索、分工和结果合并 |
| 65 | [大规模迁移实战](./65-migration.md) | 框架升级、语言迁移和回归策略 |

### 第十一季：附录篇

| # | 文章 | 主题 |
| --- | --- | --- |
| 66 | [config.toml 完整参考](./66-config-reference.md) | 配置项字典、默认值和示例 |
| 67 | [命令速查表](./67-command-cheatsheet.md) | 所有斜杠命令与 exec 参数 |
| 68 | [快捷键大全](./68-keybindings.md) | 默认快捷键、自定义键位、Vim 模式 |
| 69 | [环境变量参考](./69-env-vars.md) | 环境变量覆盖、认证、代理和观测性 |
| 70 | [常见问题 FAQ](./70-faq.md) | 安装、认证、配置、安全、性能和企业问题 |
| 71 | [Codex vs Claude Code vs Cursor 全面对比](./71-comparison.md) | 选型维度、差异和适用场景 |
| 72 | [进阶学习路线与资源推荐](./72-learning-path.md) | 学习顺序、资源和练习路径 |

## 维护说明
- 涉及模型、价格、认证、企业策略和外部集成的内容变化较快，更新时优先使用 OpenAI 官方文档或源码作为依据。
- 新增文章应继续使用编号加 kebab-case 的文件名，并在本页补充入口。
