# Claude Code 工具全书

这是一套面向查阅的 Claude Code 中文参考，共 78 篇。内容从产品形态、安装和命令，延伸到项目上下文、权限安全、真实工作流、Skills、MCP、Hooks、Subagents、CI、SDK 与团队治理。

> Claude Code 更新很快。涉及命令、模型、价格、平台能力和配置字段时，请同时核对文章中的时间边界与官方文档。这个目录解决“去哪里找”，不代表所有页面都已在同一天复核。

返回：[AI 编程总览](../README.md)

## 推荐阅读路径

- **第一次使用**：01 → 04 → 06 → 14 → 30 → 36 → 43 → 53。
- **日常查阅**：按下面七个主题直接进入，不必顺序读完。
- **团队落地**：35-50 建立配置与权限基线，59-78 再接扩展、自动化和治理。

## 一、产品认知与版本跟踪（01-05）

| # | 文章 |
| --- | --- |
| 01 | [Claude Code 到底是什么](./01-what-is-claude-code.md) |
| 02 | [Claude Code 的产品形态全景](./02-product-forms-overview.md) |
| 03 | [Claude Code 的 Agent Loop](./03-agent-loop-explained.md) |
| 04 | [Claude Code 能做什么，不能做什么](./04-what-it-can-and-cannot-do.md) |
| 05 | [Claude Code 版本和更新怎么跟踪](./05-version-tracking.md) |

## 二、安装、认证与运行入口（06-13）

| # | 文章 |
| --- | --- |
| 06 | [Claude Code 安装方式大全](./06-installation-guide.md) |
| 07 | [登录与认证](./07-authentication.md) |
| 08 | [Windows / WSL / macOS / Linux：平台差异和注意事项](./08-platform-differences.md) |
| 09 | [升级、降级和固定版本](./09-upgrade-downgrade-pin-version.md) |
| 10 | [终端配置](./10-terminal-setup.md) |
| 11 | [IDE 接入](./11-ide-integration.md) |
| 12 | [Desktop App 适合什么场景](./12-desktop-app.md) |
| 13 | [Claude Code on Web](./13-web-version.md) |

## 三、命令、会话与交互工作流（14-34）

| # | 文章 |
| --- | --- |
| 14 | [交互模式入门](./14-interactive-mode-getting-started.md) |
| 15 | [非交互模式](./15-non-interactive-mode.md) |
| 16 | [管道与 Unix 化用法](./16-pipe-and-unix-usage.md) |
| 17 | [会话继续与恢复](./17-session-continue-resume.md) |
| 18 | [认证命令](./18-auth-commands.md) |
| 19 | [Agent View 命令](./19-agent-view-commands.md) |
| 20 | [后台任务命令](./20-background-tasks.md) |
| 21 | [MCP 命令](./21-mcp-commands.md) |
| 22 | [Plugin 命令](./22-plugin-commands.md) |
| 23 | [Project Purge 命令](./23-project-purge.md) |
| 24 | [Remote Control 命令](./24-remote-control.md) |
| 25 | [CLI Flags 总览](./25-cli-flags-reference.md) |
| 26 | [输出格式与结构化结果](./26-output-formats.md) |
| 27 | [`--bare` 和脚本速度优化](./27-bare-mode-speed.md) |
| 28 | [交互模式基础操作](./28-interactive-mode-basics.md) |
| 29 | [内置 Slash Commands 地图](./29-built-in-slash-commands.md) |
| 30 | [计划优先工作流](./30-plan-first-workflow.md) |
| 31 | [`/compact` 与上下文压缩](./31-compact-context-compression.md) |
| 32 | [`/goal` 长任务模式](./32-goal-long-tasks.md) |
| 33 | [`/usage` 和成本感知](./33-usage-cost-awareness.md) |
| 34 | [自定义 Slash Commands](./34-custom-slash-commands.md) |

## 四、项目上下文、配置与安全（35-50）

| # | 文章 |
| --- | --- |
| 35 | [`.claude` 目录全景](./35-dot-claude-directory-overview.md) |
| 36 | [CLAUDE.md 怎么写](./36-how-to-write-claude-md.md) |
| 37 | [CLAUDE.local.md 与个人偏好](./37-claude-local-md.md) |
| 38 | [Rules 文件](./38-rules-files.md) |
| 39 | [Settings 文件详解](./39-settings-files.md) |
| 40 | [环境变量配置](./40-environment-variables.md) |
| 41 | [Auto Memory](./41-auto-memory.md) |
| 42 | [Debug 配置加载](./42-debug-config-loading.md) |
| 43 | [Permission Modes 全解](./43-permission-modes-explained.md) |
| 44 | [Auto Mode 原理和风险](./44-auto-mode-principles-risks.md) |
| 45 | [Fine-grained Permissions](./45-fine-grained-permissions.md) |
| 46 | [读前写限制与高风险文件](./46-read-before-write.md) |
| 47 | [Sandbox 选择](./47-sandbox-selection.md) |
| 48 | [Secrets 安全](./48-secrets-security.md) |
| 49 | [Prompt Injection 与工具投毒](./49-prompt-injection-tool-poisoning.md) |
| 50 | [企业托管设置](./50-enterprise-managed-settings.md) |

## 五、真实项目工作流（51-58）

| # | 文章 |
| --- | --- |
| 51 | [新项目快速理解](./51-new-project-onboarding.md) |
| 52 | [找代码与追调用链](./52-find-code-trace-calls.md) |
| 53 | [修 Bug 标准流程](./53-bug-fix-workflow.md) |
| 54 | [重构流程](./54-refactoring-workflow.md) |
| 55 | [补测试流程](./55-add-tests-workflow.md) |
| 56 | [写文档流程](./56-documentation-workflow.md) |
| 57 | [Git 工作流](./57-git-workflow.md) |
| 58 | [图片、截图和前端调试](./58-images-screenshots-frontend.md) |

## 六、Skills、MCP、Hooks 与 Subagents（59-66）

| # | 文章 |
| --- | --- |
| 59 | [Skills 入门](./59-skills-getting-started.md) |
| 60 | [SKILL.md 结构](./60-skill-md-structure.md) |
| 61 | [MCP 入门](./61-mcp-getting-started.md) |
| 62 | [高价值 MCP 场景](./62-high-value-mcp-scenarios.md) |
| 63 | [Hooks 入门](./63-hooks-getting-started.md) |
| 64 | [Hooks 实战](./64-hooks-practice.md) |
| 65 | [Subagents 入门](./65-subagents-getting-started.md) |
| 66 | [什么时候不用 Subagent](./66-when-not-to-use-subagent.md) |

## 七、并行、自动化、SDK 与团队治理（67-78）

| # | 文章 |
| --- | --- |
| 67 | [Agent Teams、Agent View 和 Dynamic Workflows](./67-agent-teams-view-dynamic.md) |
| 68 | [Worktrees 并行开发](./68-worktrees-parallel-development.md) |
| 69 | [Headless 模式](./69-headless-mode.md) |
| 70 | [GitHub Actions 和 GitLab CI](./70-github-actions-gitlab-ci.md) |
| 71 | [Routines 与 Scheduled Tasks](./71-routines-scheduled-tasks.md) |
| 72 | [Agent SDK 入门](./72-agent-sdk-getting-started.md) |
| 73 | [Agent SDK 高阶](./73-agent-sdk-advanced.md) |
| 74 | [Plugins](./74-plugins.md) |
| 75 | [团队推广与治理](./75-team-adoption-governance.md) |
| 76 | [成本和性能优化](./76-cost-performance-optimization.md) |
| 77 | [排错大全](./77-troubleshooting-guide.md) |
| 78 | [Claude Code 最新能力追踪方法](./78-tracking-new-features.md) |
