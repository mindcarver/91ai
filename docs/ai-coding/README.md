# AI Coding

AI Coding 是当前最值得持续跟踪的 AI 应用方向之一。

这个分区关注的不只是“代码生成”，而是 AI 工具如何进入真实软件工程流程：读代码、改代码、跑测试、做 review、接外部工具、沉淀团队规则、控制权限和风险。

## Tools

| 工具 | 定位 | 适合场景 | 专题 |
| --- | --- | --- | --- |
| Claude Code | 终端 AI Coding Agent | 复杂代码任务、仓库级修改、hooks、subagents、MCP | [查看](./claude-code.md) |
| OpenAI Codex | AI Coding Agent | 自动实现、调试、代码协作、GitHub Action、MCP | [查看](./openai-codex.md) |
| Cursor | AI IDE | 日常开发、项目问答、inline edit、rules、MCP | [查看](./cursor.md) |
| Cline | VS Code Agent 插件 | IDE 内 agent、命令审批、checkpoints、MCP marketplace | [查看](./cline.md) |
| Continue | 开源 AI Coding 助手 | 可配置模型、source-controlled AI checks、团队规则 | [查看](./continue.md) |
| Gemini CLI | 终端 AI Coding Agent | 开源 CLI、GitHub Actions、sandbox、extensions | [查看](./gemini-cli.md) |

## 工程化实战系列

两个独立的深度系列，分别针对 Claude Code 和 OpenAI Codex 的工程化实践。不是教程，而是真实项目中的机制解析和配置指南。

### Claude Code 系列

| 系列 | 适合谁 | 内容 |
| --- | --- | --- |
| [Claude Code 工程化学习路径](./claude-code-engineering-learning-path.md) | 想系统学习 Claude Code 工程化的人 | 从 CLAUDE.md、Skills、Subagents、Hooks、MCP 到 Headless、Agent SDK、Plugins 的 32 讲路线。 |
| [Claude Code 工程化实战系列](./claude-code-engineering/) | 想逐篇阅读和沉淀团队材料的人 | 34 篇独立文章，覆盖个人使用、工作流沉淀、Subagents、MCP、Hooks、CI/CD、SDK、Plugins 和组织治理。 |

### Codex 系列

| 系列 | 适合谁 | 内容 |
| --- | --- | --- |
| [Codex 工程化实战系列](./codex-engineering/) | 想系统掌握 Codex 工程化实践的人 | 38 篇独立文章 + 系列总览，覆盖 AGENTS.md、沙箱隔离、Starlark Rules、MCP 安全、Agent Loop 架构、codex exec、GitHub Actions、SDK 和团队治理。 |

### 两个系列的关系

两个系列独立阅读，但互为参照。核心差异：

| 维度 | Claude Code 系列 | Codex 系列 |
| --- | --- | --- |
| 指令系统 | CLAUDE.md（深度集成） | AGENTS.md（跨工具通用） |
| 安全模型 | 26 个 Hook 拦截点 | 内核级沙箱 + Starlark Rules |
| 执行哲学 | 结对编程（hand-on） | 委托-审查-批准（hands-off） |
| CI/CD | claude -p（headless） | codex exec + codex-action |
| 选型参考 | [Codex vs Claude Code](./codex-engineering/37-codex-vs-claude-code.md) | 同上 |

## 横向对比

AI Coding 工具之间的选型不应只看功能列表，而要看具体任务类型、团队规模和安全要求。

| 维度 | 关键问题 |
| --- | --- |
| 代码理解 | 能否跨文件、跨模块理解项目 |
| 修改质量 | 是否保持代码风格、边界情况和类型安全 |
| 测试意识 | 是否主动运行测试、补测试、解释失败 |
| 可控性 | 权限、diff、回滚、审批是否清晰 |
| 上下文管理 | rules、AGENTS.md、CLAUDE.md、memory 是否稳定 |
| 集成能力 | GitHub、MCP、CI、IDE、CLI 是否顺畅 |
| 安全风险 | secrets、shell、网络、MCP、CI token 是否可控 |
| 成本 | 订阅、API、token、运行时间和迁移成本 |

## Current Notes

- Claude Code 和 Codex 更偏 agentic software engineering。各有偏重：Claude Code 偏 hands-on 结对编程，Codex 偏 hands-off 委托执行。
- Cursor 更偏 AI-first IDE 和日常开发效率。适合把 AI 放进编辑器工作流。
- Cline 更偏开源 IDE agent 与 MCP-first 工作流。
- Continue 更偏可配置、可版本化、可 CI 化的团队 AI checks。
- Gemini CLI 技术设计值得研究，但需关注迁移到 Antigravity CLI 的风险。

## Next Work

1. 设计同任务横向评测任务集。
2. 固定工具版本、模型、预算、运行次数和上下文。
3. 记录 diff、测试结果、耗时、成本、人工修正量和越权行为。
4. 形成 `AI Coding Benchmark` 独立文档。
