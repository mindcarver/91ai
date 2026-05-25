# Cursor 资料与项目索引

> 更新日期：2026-05-25  
> 范围：Cursor IDE、Cursor Agent、Cursor CLI、Rules、AGENTS.md、MCP、工具调用、学习资料、生态项目和评测研究。

Cursor 更适合被理解成一个 **AI-first IDE**，而不是单独的终端 coding agent。它的核心价值是把 AI 补全、项目级问答、inline edit、agent mode、rules 和 MCP 集成在同一个编辑器工作流里。

## 推荐阅读顺序

1. [Cursor docs](https://docs.cursor.com/)
2. [Cursor Rules](https://docs.cursor.com/context/rules-for-ai)
3. [Cursor Agent tools](https://docs.cursor.com/agent/tools)
4. [Cursor CLI](https://docs.cursor.com/en/cli/using)
5. [Cursor MCP](https://docs.cursor.com/context/model-context-protocol)
6. [Cursor CLI MCP](https://docs.cursor.com/cli/mcp)

## 官方资料

| 资源 | 类型 | 适合谁 | 价值 |
| --- | --- | --- | --- |
| [Cursor docs](https://docs.cursor.com/) | 官方文档 | 所有用户 | 了解 Cursor 的 IDE、Agent、Tab、Rules、MCP 和 CLI 能力。 |
| [Rules](https://docs.cursor.com/context/rules-for-ai) | 官方文档 | 团队、重度用户 | 解释 Project Rules、User Rules、AGENTS.md、`.cursorrules` 的差异。 |
| [Agent tools](https://docs.cursor.com/agent/tools) | 官方文档 | 想理解 agent 行为的人 | 了解搜索、编辑、运行命令、fetch rules、MCP 等工具调用边界。 |
| [Using Agent in CLI](https://docs.cursor.com/en/cli/using) | 官方文档 | CLI 用户 | 说明 `cursor-agent` 的 prompt、MCP、rules 和非 IDE 场景。 |
| [MCP](https://docs.cursor.com/context/model-context-protocol) | 官方文档 | 想接外部工具的人 | 通过 MCP 接入数据库、GitHub、浏览器、文档和内部工具。 |
| [CLI MCP](https://docs.cursor.com/cli/mcp) | 官方文档 | 终端用户 | 管理 CLI 中的 MCP server、列出 tools、复用 IDE 的 MCP 配置。 |

## 学习资料

| 资源 | 类型 | 价值 |
| --- | --- | --- |
| [Cursor Rules](https://docs.cursor.com/context/rules-for-ai) | 官方指南 | 最重要的 Cursor 上下文管理入口。 |
| [Cursor CLI using guide](https://docs.cursor.com/en/cli/using) | 官方指南 | 了解 Cursor 不只是在 IDE 里，也有 terminal agent 形态。 |
| [Cursor MCP docs](https://docs.cursor.com/context/model-context-protocol) | 官方指南 | 适合学习如何把 Cursor 接到外部工具。 |
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

### 3. 研究与评测

| 资源 | 类型 | 价值 |
| --- | --- | --- |
| [Comparing AI Coding Agents](https://arxiv.org/abs/2602.08915) | 论文 | 包含 Cursor 与 Codex、Claude Code、Devin、Copilot 的 PR 任务表现分析。 |
| [Configuring Agentic AI Coding Tools](https://arxiv.org/abs/2602.14690) | 论文 | 比较 Cursor、Claude Code、Codex、Gemini 等工具的配置机制。 |
| [Beyond Functional Correctness](https://arxiv.org/abs/2604.06373) | 论文 | 研究 Cursor 生成大型项目中的可维护性、复杂度、重复代码和可演化性问题。 |
| [Developer Experience with AI Coding Agents](https://arxiv.org/abs/2604.02544) | 论文 | 研究 Cursor、Cline、Claude Code 等 agent 访问文档门户时的行为特征。 |

## 使用场景分类

### 适合优先尝试

- 日常编辑器内代码补全
- 项目级问答和代码导航
- 小到中型功能开发
- 局部重构、inline edit、测试生成
- 前端 UI 修改和快速反馈
- 团队规则沉淀到 `.cursor/rules`

### 适合谨慎尝试

- 大规模自动重构
- 没有测试的核心逻辑修改
- 让 Agent 长时间无人监督运行
- 过度依赖 rules 替代代码审查
- 给 MCP server 过宽的外部工具权限

### 不建议直接交给 Cursor

- 生产数据库写操作
- 密钥、部署、权限相关高风险变更
- 无人工 review 的自动合并
- 没有回滚方案的核心架构迁移

## Cursor 核心机制对比

| 机制 | 解决什么问题 | 适合放什么 | 不适合放什么 |
| --- | --- | --- | --- |
| Cursor Tab | 快速补全 | 高频局部编辑 | 复杂任务规划 |
| Inline Edit | 小范围修改 | 局部重写、文案、类型修复 | 跨模块重构 |
| Agent | 多步骤任务 | 读代码、改文件、跑命令、调试 | 高风险无人值守任务 |
| Project Rules | 持久项目上下文 | 架构、约定、测试命令、安全边界 | 大段教程和过期说明 |
| AGENTS.md | 跨工具说明 | 通用项目规则 | Cursor 独有工作流细节 |
| MCP | 外部工具连接 | GitHub、docs、browser、DB | 不可信服务和高权限工具 |
| Cursor CLI | 终端自动化 | 脚本化、headless 任务、CI 前自查 | 需要编辑器内精细交互的任务 |

## Rules 模板

```md
# Project Rule

## Scope

- Applies to:
- Does not apply to:

## Project Context

- Stack:
- Important directories:
- Main commands:

## Coding Rules

- Follow existing patterns.
- Keep changes scoped.
- Add or update tests for behavior changes.
- Do not introduce dependencies without explanation.

## Safety

- Do not touch secrets or deployment credentials.
- Do not run destructive commands without explicit approval.
- Ask before changing database migrations or production config.
```

## 评测维度建议

| 维度 | 看什么 |
| --- | --- |
| IDE 体验 | 补全、inline edit、diff、项目导航是否顺畅 |
| Agent 能力 | 是否能跨文件完成任务并保持可审查 diff |
| Rules 稳定性 | `.cursor/rules` 和 AGENTS.md 是否被稳定遵守 |
| MCP 集成 | 外部工具接入是否可靠、安全、可调试 |
| 代码质量 | 重构质量、边界情况、测试意识 |
| 可维护性 | 是否产生重复代码、大方法、架构漂移 |
| 成本和速度 | 订阅成本、模型选择、响应速度 |

## 当前判断

Cursor 的核心优势是 **把 AI 放进开发者最常用的编辑器工作流**。它很适合日常开发提效和中小型功能实现，但评测时不能只看“能不能跑”，还要看长期可维护性、规则遵守和人工 review 成本。

核心评测问题：

> Cursor 能否在不牺牲可维护性和审查质量的前提下，稳定提升日常开发效率？
