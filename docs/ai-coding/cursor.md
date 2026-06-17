# Cursor 资料与项目索引

> 更新日期：2026-05-27  
> 范围：Cursor IDE、Cursor Agent、Cursor CLI、Background Agent、BugBot、Cursor SDK、Rules、AGENTS.md、MCP、Hooks、学习资料、生态项目和评测研究。

Cursor 更适合被理解成一个 **AI-first IDE**，而不是单独的终端 coding agent。它的核心价值是把 AI 补全、项目级问答、inline edit、agent mode、rules 和 MCP 集成在同一个编辑器工作流里。

Cursor 当前有五个执行形态：

| 形态 | 触发方式 | 适合什么 |
| --- | --- | --- |
| Tab / Autocomplete | 编辑器内自动触发 | 行级、多行补全（Cursor Sonic 模型，<100ms） |
| Agent Mode | 编辑器内 `Cmd+I` 或 Chat | 多步骤代码任务（读文件、改文件、跑命令） |
| Background Agent | Chat 内 "Run in background" | 长时间运行的复杂任务，云端沙箱异步执行 |
| Cursor CLI | 终端 `cursor-agent` | 脚本化、headless、CI 场景 |
| BugBot | GitHub PR 自动触发 | 自动 code review，发现真实 bug |

## 推荐阅读顺序

1. [Cursor docs](https://docs.cursor.com/) — 总入口
2. [Cursor Rules](https://docs.cursor.com/context/rules-for-ai) — 上下文管理最核心的机制
3. [Cursor Agent tools](https://docs.cursor.com/agent/tools) — Agent 能做什么、不能做什么
4. [Background Agent](https://docs.cursor.com/agent/background) — 异步执行模式
5. [Cursor CLI](https://docs.cursor.com/en/cli/using) — 终端 agent 形态
6. [Cursor MCP](https://docs.cursor.com/context/model-context-protocol) — 外部工具接入

## 官方资料

| 资源 | 类型 | 适合谁 | 价值 |
| --- | --- | --- | --- |
| [Cursor docs](https://docs.cursor.com/) | 官方文档 | 所有用户 | 了解 Cursor 的 IDE、Agent、Tab、Rules、MCP 和 CLI 能力。 |
| [Rules](https://docs.cursor.com/context/rules-for-ai) | 官方文档 | 团队、重度用户 | 解释 Project Rules、User Rules、AGENTS.md、`.cursorrules` 的差异和优先级。 |
| [Agent tools](https://docs.cursor.com/agent/tools) | 官方文档 | 想理解 agent 行为的人 | 了解搜索、编辑、运行命令、fetch rules、MCP 等工具调用边界。 |
| [Background Agent](https://docs.cursor.com/agent/background) | 官方文档 | 重度用户 | 异步运行复杂任务，不阻塞编辑器。 |
| [Using Agent in CLI](https://docs.cursor.com/en/cli/using) | 官方文档 | CLI 用户 | 说明 `cursor-agent` 的 prompt、MCP、rules 和非 IDE 场景。 |
| [MCP](https://docs.cursor.com/context/model-context-protocol) | 官方文档 | 想接外部工具的人 | 通过 MCP 接入数据库、GitHub、浏览器、文档和内部工具。 |
| [CLI MCP](https://docs.cursor.com/cli/mcp) | 官方文档 | 终端用户 | 管理 CLI 中的 MCP server、列出 tools、复用 IDE 的 MCP 配置。 |
| [Bug Finder](https://docs.cursor.com/agent/bug-finder) | 官方文档 | 质量工程师 | 自动扫描代码库发现潜在 bug，类似静态分析但基于模型理解。 |

## 核心机制深度解析

### Rules 体系：四层规则叠加

Cursor 的规则系统有四个来源，按优先级从高到低：

```
Project Rules (.cursor/rules/)  >  AGENTS.md  >  User Rules  >  .cursorrules (legacy)
```

| 规则类型 | 位置 | 谁能看到 | 什么时候加载 | 适合放什么 |
| --- | --- | --- | --- | --- |
| Project Rules | `.cursor/rules/*.mdc` | 项目所有贡献者 | 匹配 glob 时自动加载 | 目录级约定、测试命令、安全边界 |
| AGENTS.md | 仓库根目录 | 跨工具共享（Codex、Copilot 也读） | 始终加载 | 通用项目说明、构建命令、核心架构 |
| User Rules | Cursor 设置 | 只有自己的机器 | 始终加载 | 个人偏好、私有项目约定 |
| .cursorrules | 仓库根目录 | 项目所有贡献者 | 始终加载（legacy） | 迁移前保留的旧规则 |

Project Rules 支持 `globs` 字段控制触发条件，只在编辑匹配文件时才加载，避免无关规则污染上下文：

```yaml
---
description: React component conventions
globs: ["src/components/**/*.tsx", "src/components/**/*.ts"]
---
# React Component Rules

- Use functional components with hooks.
- Keep components under 200 lines.
- Colocate tests in __tests__/ directories.
```

**最佳实践：**
- Project Rules 按目录或文件类型拆分，每个规则控制在 50 行以内
- AGENTS.md 放跨工具通用规则（约 100 行）
- User Rules 只放个人偏好，不放入仓库
- `.cursorrules` 迁移到 Project Rules 后删除

### Agent Mode：编辑器内的多步骤执行

Cursor Agent Mode 可以执行的工具：

| 工具 | 作用 | 是否需要审批 |
| --- | --- | --- |
| file_search | 搜索项目文件 | 否 |
| read_file | 读取文件内容 | 否 |
| grep_search | 内容搜索 | 否 |
| edit_file | 修改文件（通过 diff） | 默认自动，可配置 |
| run_command | 执行 shell 命令 | 默认需要确认 |
| list_dir | 列出目录内容 | 否 |
| mcp_tool | 调用 MCP 服务器工具 | 取决于 MCP 配置 |

Agent 的执行循环和 Codex/Claude Code 类似：用户给出任务 → Agent 规划步骤 → 调用工具 → 检查结果 → 继续或完成。但 Cursor Agent 的差异在于：

- **编辑器集成**：Agent 修改的文件直接在编辑器中显示 diff，可以实时看到变更
- **自动模式**：可以配置为自动执行不需要逐步确认（类似 Codex 的 full-auto）
- **YOLO Mode**：社区俗称，让 Agent 全自动执行所有操作包括 shell 命令，风险较高

### Background Agent：云端异步执行

Background Agent 在独立的云端沙箱（Ubuntu VM）中运行，不阻塞编辑器：

- **触发方式**：在 Chat 中选择 "Run in background"，或通过 Slack / Mobile app 分配任务
- **工作方式**：克隆仓库 → 创建分支 → 实现变更 → 运行测试 → 打开 PR
- **多仓库支持**（Cursor 3.3，2026-05）：可在单个任务中跨多个仓库操作
- **自定义环境**：通过 `.cursor/Dockerfile` 配置云端 agent 的运行环境
- **治理控制**：管理员可限制允许的仓库、分支和操作类型
- **并行处理**：多个 Background Agent 可同时运行
- **移动端**：iOS 和 Android app 可监控和分配任务
- **成本**：约 $4.63/PR（简单任务），需要 Max Mode
- **注意**：代码在 Cursor 云端运行，需评估 Privacy Mode 的数据安全影响

### BugBot：自动 Code Review

BugBot 是 Cursor 的 GitHub 集成代码审查工具：

- **工作方式**：监听 PR → 分析 diff → 发现真实 bug → 在 GitHub 上留 inline 评论
- **关键指标**：70%+ 的标记在合并前被解决（Cursor 官方数据）
- **Effort 级别**：Default（标准审查）、High（更深度分析）、Custom（自定义行为）
- **Security Review**（Beta，2026-04）：专门的安全审查 agent，检查漏洞和不安全模式
- **计费**：从按座位转向按次计费（约 $1-1.50/次审查）
- **SOC 2 Type II 认证**

### Cursor Hooks：工作流拦截

Cursor 3.1+ 支持 Hooks，类似 Claude Code 的 hooks 但更轻量：

```bash
.cursor/hooks/
├── onPreEdit      # Agent 编辑文件前执行
├── onPostEdit     # Agent 编辑文件后执行
├── onPreCommit    # Git commit 前执行
└── onApprove      # 用户审批操作时执行
```

Hooks 可以做自动格式化、lint 检查、安全扫描等。目前不如 Claude Code 的 26 个 hook 点丰富，但覆盖了最常用的拦截场景。

### Cursor SDK：编程式 Agent

2026-04-29 发布的 TypeScript SDK（`@cursor/sdk`），支持三种运行模式：

| 模式 | 运行位置 | 适合场景 |
| --- | --- | --- |
| Local | 本地机器 | 开发调试 |
| Cloud | Cursor 云端 | 生产化部署 |
| Self-hosted | 自有服务器 | 数据安全敏感场景 |

### 上下文管理

Cursor 的上下文由多个来源组合，新的 Context Usage Breakdown UI 可以看到每个来源的 token 消耗：

| 来源 | 作用 | 配置方式 |
| --- | --- | --- |
| Workspace Index | 全代码库向量索引，驱动补全和 agent 上下文 | 自动构建 |
| Project Rules | 按文件类型自动加载的规则 | `.cursor/rules/*.mdc` |
| AGENTS.md | 始终加载的通用规则 | 仓库根目录 |
| @ Mentions | 手动注入特定上下文 | Chat 中 `@file`、`@docs`、`@web` 等 |
| Cursor Memories | AI 记住的项目知识（实验性） | 自动存储 |

`@` Mention 系统：`@file`（文件）、`@folder`（目录）、`@docs`（外部文档）、`@code`（代码符号）、`@web`（网络搜索）、`@diff`（未提交变更）、`@terminal`（终端输出）、`@rules`（规则文件）、`@definitions`（类型定义）。

Max Mode 扩大上下文窗口用于复杂任务，Background Agent 必须使用 Max Mode。

### Cursor CLI：终端 agent

`cursor-agent` 是 Cursor 的终端形态，支持四种模式：

```bash
# Agent 模式（默认）：自主执行，运行命令，编辑文件
cursor-agent "给 auth 模块补充单元测试"

# Plan 模式：只返回计划不执行，适合审查
cursor-agent --plan "审查 PR #42 的安全性"

# Ask 模式：问答，不修改文件
cursor-agent --ask "这个项目用的是什么测试框架"

# Shell 模式：交互式终端会话
cursor-agent --shell

# Headless 模式：CI/CD 集成
cursor-agent --headless "运行 lint 并修复所有可自动修复的问题"
```

CLI 复用 IDE 的 Rules、MCP 配置和认证，支持与 IDE 相同的模型选择（GPT-5.5 Extra High、Composer 2.5、Opus 4.7、Gemini 3.1 Pro、Grok 4.3 等）。Pro+ 及以上订阅包含 CLI 访问。

## 学习资料

| 资源 | 类型 | 价值 |
| --- | --- | --- |
| [Cursor Rules](https://docs.cursor.com/context/rules-for-ai) | 官方指南 | 最重要的 Cursor 上下文管理入口。 |
| [Cursor CLI using guide](https://docs.cursor.com/en/cli/using) | 官方指南 | 了解 Cursor 不只是在 IDE 里，也有 terminal agent 形态。 |
| [Cursor MCP docs](https://docs.cursor.com/context/model-context-protocol) | 官方指南 | 适合学习如何把 Cursor 接到外部工具。 |
| [Background Agent docs](https://docs.cursor.com/agent/background) | 官方指南 | 理解异步 agent 模式的工作原理和使用场景。 |
| [Agent Engineering 101](https://www.reddit.com/r/CursorAI/comments/1rwlkvv/agent_engineering_101_a_visual_guide_agentsmd/) | 社区讨论 | 用 AGENTS.md、Skills、MCP 的框架理解 Cursor-style agent 工作流。 |

## 生态项目与能带来的东西

### 1. Rules / AGENTS.md 工作流

| 项目 / 资源 | 定位 | 能带来什么 | 风险 / 注意点 |
| --- | --- | --- | --- |
| `.cursor/rules` | Cursor 官方规则系统 | 把团队规范、目录约束、测试命令和常用工作流沉淀成可复用上下文。 | 规则太长会污染上下文，规则过时会持续误导 agent。 |
| `AGENTS.md` | 跨工具 agent 指令文件 | Cursor 支持将其作为规则来源之一，方便和 Codex、Copilot 等工具共享项目说明。 | 不同工具解释细节可能不同，关键安全规则仍需验证。 |
| `.cursorrules` | 旧规则文件 | 老项目中常见，迁移成本低。 | Cursor 官方已标记为 legacy，建议迁移到 Project Rules。 |

### 2. MCP 与外部工具

| 组合 | 适合场景 | 风险 |
| --- | --- | --- |
| Cursor + GitHub MCP | Issue、PR、Actions、仓库上下文。 | GitHub token 权限要最小化。 |
| Cursor + Context7 / docs MCP | 获取最新框架文档，减少过时 API 幻觉。 | 仍要校验文档版本。 |
| Cursor + browser / Playwright MCP | 前端调试、截图验证、交互检查。 | 注意账号、cookies 和外部网络访问。 |
| Cursor + database MCP | schema 查询、只读数据分析。 | 优先只读账号，禁止生产写操作。 |
| Cursor + Figma MCP | 设计稿到代码的转换。 | 设计更新后生成的代码需要重新审查。 |

### 3. 研究与评测

| 资源 | 类型 | 价值 |
| --- | --- | --- |
| [Comparing AI Coding Agents](https://arxiv.org/abs/2602.08915) | 论文 | 包含 Cursor 与 Codex、Claude Code、Devin、Copilot 的 PR 任务表现分析。 |
| [Configuring Agentic AI Coding Tools](https://arxiv.org/abs/2602.14690) | 论文 | 比较 Cursor、Claude Code、Codex、Gemini 等工具的配置机制。 |
| [Beyond Functional Correctness](https://arxiv.org/abs/2604.06373) | 论文 | 研究 Cursor 生成大型项目中的可维护性、复杂度、重复代码和可演化性问题。 |
| [Developer Experience with AI Coding Agents](https://arxiv.org/abs/2604.02544) | 论文 | 研究 Cursor、Cline、Claude Code 等 agent 访问文档门户时的行为特征。 |

## Cursor 与其他 AI Coding 工具的定位差异

| 维度 | Cursor | Claude Code | Codex | Cline |
| --- | --- | --- | --- | --- |
| 形态 | AI-first IDE（VS Code fork） | 终端 CLI agent | 终端 CLI + Cloud agent | VS Code 插件 |
| 核心体验 | 编辑器内 AI 工作流 | 终端内结对编程 | 委托-审查-批准 | IDE 内 agent |
| 补全 | Cursor Sonic（<100ms） | 无 | 无 | VS Code 内置补全 |
| Agent | 编辑器内 + Background Agent | 终端内 + 后台 worktree | Cloud Agent | 编辑器内 |
| Rules | Project Rules + AGENTS.md | CLAUDE.md + hooks | AGENTS.md + Starlark Rules | .clinerules + MCP |
| Hooks | 4 个拦截点（2026-04） | 26 个 hook 拦截点 | Starlark Rules 引擎 | 无 |
| MCP | IDE + CLI + Marketplace | 终端 | 终端 + Cloud | VS Code Marketplace |
| SDK | @cursor/sdk（2026-04） | Claude Agent SDK | @openai/codex-sdk | 无 |
| JetBrains | plugin GA（2026-05） | 无 | 无 | 无 |
| Mobile | iOS + Android | 无 | 无 | 无 |
| CI/CD | cursor-agent CLI + BugBot | claude -p headless | codex exec + codex-action | 无 |
| 定价 | $0-200/月（credit 制） | $20-100/月 | ChatGPT 订阅或 API | 开源 + API 成本 |
| 适合谁 | 日常开发的绝大多数工程师 | 需要精细控制的终端重度用户 | 需要无人值守执行的团队 | 偏好开源 VS Code 生态的工程师 |

## Cursor 核心机制对比

| 机制 | 解决什么问题 | 适合放什么 | 不适合放什么 |
| --- | --- | --- | --- |
| Cursor Tab | 快速补全 | 高频局部编辑 | 复杂任务规划 |
| Inline Edit | 小范围修改 | 局部重写、文案、类型修复 | 跨模块重构 |
| Agent Mode | 多步骤任务 | 读代码、改文件、跑命令、调试 | 高风险无人值守任务 |
| Background Agent | 长时间任务 | 大规模重构、跨模块修改 | 需要实时交互的调试 |
| Project Rules | 持久项目上下文 | 架构、约定、测试命令、安全边界 | 大段教程和过期说明 |
| AGENTS.md | 跨工具说明 | 通用项目规则 | Cursor 独有工作流细节 |
| MCP | 外部工具连接 | GitHub、docs、browser、DB | 不可信服务和高权限工具 |
| Cursor CLI | 终端自动化 | 脚本化、headless 任务、CI 前自查 | 需要编辑器内精细交互的任务 |
| Bug Finder | 代码质量 | 潜在 bug 扫描、代码异味检测 | 替代完整测试套件 |

## Rules 模板

### 通用项目规则

```md
---
description: General project rules
globs:
alwaysApply: true
---

## Project Context

- Stack: TypeScript / React / Node.js
- Package manager: pnpm
- Main entry points: src/index.ts
- Important directories: src/, tests/, migrations/

## Commands

- Install: pnpm install
- Lint: pnpm lint
- Type check: pnpm typecheck
- Test: pnpm test
- Build: pnpm build

## Coding Rules

- Follow existing patterns.
- Keep changes scoped to the requested task.
- Add or update tests for public behavior changes.
- Do not introduce new dependencies without explanation.

## Safety

- Do not touch .env* files.
- Do not run destructive commands without explicit approval.
- Ask before changing database migrations.
```

### 目录级规则示例

```md
---
description: API route conventions
globs: ["src/api/**/*.ts"]
---

## API Route Rules

- All routes must have input validation (zod schema).
- All routes must return typed responses.
- Error handling uses the centralized error middleware.
- Rate limiting is configured per route in route config.
```

## 使用场景分类

### 适合优先尝试

- 日常编辑器内代码补全（Tab）
- 项目级问答和代码导航
- 小到中型功能开发（Agent Mode）
- 局部重构、inline edit、测试生成
- 前端 UI 修改和快速反馈
- 团队规则沉淀到 `.cursor/rules`
- 用 Bug Finder 做代码质量检查

### 适合谨慎尝试

- 大规模自动重构（建议用 Background Agent + 人工审查）
- 没有测试覆盖的核心逻辑修改
- YOLO Mode 全自动执行
- 过度依赖 rules 替代代码审查
- 给 MCP server 过宽的外部工具权限

### 不建议直接交给 Cursor

- 生产数据库写操作
- 密钥、部署、权限相关高风险变更
- 无人工 review 的自动合并
- 没有回滚方案的核心架构迁移

## 评测维度建议

| 维度 | 看什么 |
| --- | --- |
| IDE 体验 | 补全、inline edit、diff、项目导航是否顺畅 |
| Agent 能力 | 是否能跨文件完成任务并保持可审查 diff |
| Background Agent | 异步任务完成率、上下文同步质量 |
| Rules 稳定性 | `.cursor/rules` 和 AGENTS.md 是否被稳定遵守 |
| MCP 集成 | 外部工具接入是否可靠、安全、可调试 |
| Bug Finder | 误报率、漏报率、与静态分析工具的互补性 |
| 代码质量 | 重构质量、边界情况、测试意识 |
| 可维护性 | 是否产生重复代码、大方法、架构漂移（参考 Beyond Functional Correctness 论文） |
| 成本和速度 | 订阅成本、模型选择、响应速度 |

## 定价与模型支持

### 订阅方案

2025-06 起改为 Credit 计费制，每次模型调用按成本消耗 credit。Auto 模式在所有付费方案中无限使用。

| 方案 | 月费 | 包含 Credit | 关键功能 |
| --- | --- | --- | --- |
| Hobby | $0 | 有限 | 基础 agent、2000 次补全/月、50 次慢速高级模型请求 |
| Pro | $20/月 | $20 credit | 完整 agent、无限 Auto 模式、更多模型 |
| Pro+ | $60/月 | $60 credit | CLI 访问、更高用量、优先级 |
| Ultra | $200/月 | $200 credit | 最大用量、所有功能、优先支持 |
| Business | $40/座/月 | 按座 | 团队管理、SSO、审计日志 |
| Enterprise | 定制 | 定制 | 自托管、定制协议、专属支持 |

### 支持模型

| 模型 | 供应商 | 特点 |
| --- | --- | --- |
| GPT-5.5 | OpenAI | Extra High reasoning |
| GPT-4.1 | OpenAI | 成本优化 |
| Claude Opus 4.7 | Anthropic | 最高能力 |
| Claude Sonnet 4.7 | Anthropic | 强编码模型 |
| Gemini 3.1 Pro | Google | 最新 Google 模型 |
| Gemini 2.5 Pro | Google | 2M token 上下文窗口 |
| Grok 4 / 4.3 | xAI | 可选模型 |
| Cursor Composer-1 | Cursor | 成本优化的默认模型 |
| Cursor Composer-2 / 2.5 | Cursor | 高能力专有模型 |
| Cursor Sonic | Cursor | 自定义补全模型（<100ms） |

### 近期版本时间线

| 时间 | 版本 / 功能 | 亮点 |
| --- | --- | --- |
| 2025-06 | Credit 计费制 | 替代扁平请求限制 |
| 2025 H2 | Cursor 3.0 | 重新设计的 agent 架构 |
| 2025 H2 | Mobile apps | iOS / Android 监控 Background Agent |
| 2025 H2 | MCP Marketplace | 应用内浏览安装 MCP 服务器 |
| 2026-04 | Cursor SDK | TypeScript SDK 支持编程式 agent |
| 2026-04 | Cursor Hooks | onPreEdit / onPostEdit / onPreCommit / onApprove |
| 2026-04 | Canvases | Agent 窗口中的交互式仪表板 |
| 2026-04 | 异步多任务 | 多 agent 并行 + worktree 支持 |
| 2026-05 | Cursor 3.3 | 并行计划执行、quick-action pills |
| 2026-05 | JetBrains plugin GA | IntelliJ / PyCharm 等正式支持 |
| 2026-05 | Team Marketplace | 团队内共享 MCP 服务器和 Rules |

## 当前判断

Cursor 的核心优势是 **把 AI 放进开发者最常用的编辑器工作流**。它很适合日常开发提效和中小型功能实现，但评测时不能只看"能不能跑"，还要看长期可维护性、规则遵守和人工 review 成本。

Cursor 在 AI Coding 工具生态中的独特定位：**最低上手门槛 + 最高日常使用频率**。不需要切换到终端或学习新工具链，直接在编辑器里获得 AI 能力。这使它成为 AI Coding 的最佳入门工具，但在需要精细控制的复杂场景下，Claude Code 和 Codex 的深度配置能力更强。

核心评测问题：

> Cursor 能否在不牺牲可维护性和审查质量的前提下，稳定提升日常开发效率？

> Background Agent 和 Bug Finder 的加入，是否让 Cursor 从"编辑器提效工具"进化为"可靠的工程代理"？

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
