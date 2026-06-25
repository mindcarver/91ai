# AI 编程

AI Coding 是当前最值得持续跟踪的 AI 应用方向之一。

这个分区关注的不只是“代码生成”，而是 AI 工具如何进入真实软件工程流程：读代码、改代码、跑测试、做 review、接外部工具、沉淀团队规则、控制权限和风险。

## 工具总览

| 工具 | 定位 | 难度 | 费用 | 适合谁 | 就绪度 | 专题 |
| --- | --- | --- | --- | --- | --- | --- |
| Claude Code | 终端 AI Coding Agent | 中 | 付费 | 后端/DevOps/重度终端 | 生产可用 | [查看](./claude-code.md) |
| OpenAI Codex | AI Coding Agent | 中 | 付费 | 全栈/GitHub 用户 | 生产可用 | [查看](./openai-codex.md) |
| Cursor | AI IDE | 低 | 付费 | 全栈/IDE 用户 | 生产可用 | [查看](./cursor.md) |
| Cline | VS Code Agent 插件 | 中 | 按 API 用量 | 前端/VS Code/MCP 用户 | 生产可用 | [查看](./cline.md) |
| Continue | 开源 AI Coding 助手 | 高 | 免费 | 团队/开源偏好/CI | 生产可用 | [查看](./continue.md) |
| Gemini CLI | 终端 AI Coding Agent | 中 | 免费额度 | 全栈/Google 生态 | 快速迭代中 | [查看](./gemini-cli.md) |

## 工程化实战系列

几个独立的深度系列，分别覆盖 Claude Code、OpenAI Codex 和相关工程化方法。它们不是功能清单，而是真实项目中的机制解析、配置指南和工作流沉淀。

此外新增一份可复用的 skill 实战评测协议（先实战再结论）：

- [Skill 实战评测协议](./skill-realworld-evaluation-protocol.md)

### Claude Code 系列

| 系列 | 适合谁 | 内容 |
| --- | --- | --- |
| [Claude Code 工程化学习路径](./claude-code-engineering-learning-path.md) | 想系统学习 Claude Code 工程化的人 | 从 CLAUDE.md、Skills、Subagents、Hooks、MCP 到 Headless、Agent SDK、Plugins 的 32 讲路线。 |
| [Claude Code 工程化实战系列](./claude-code-engineering/) | 想逐篇阅读和沉淀团队材料的人 | 34 篇独立文章，覆盖个人使用、工作流沉淀、Subagents、MCP、Hooks、CI/CD、SDK、Plugins 和组织治理。 |
| [Claude Code 工具全书](./claudecode-series/) | 想全面了解 Claude Code 各方面能力的人 | 78 篇独立文章，覆盖安装、CLI 命令、交互模式、配置、权限安全、日常开发工作流、Skills/MCP/Hooks/Subagents、并行开发、Headless/CI/SDK、团队治理和排错。 |

### Codex 系列

| 系列 | 适合谁 | 内容 |
| --- | --- | --- |
| [Codex CLI 完全指南系列](./codex-series/) | 想从安装到企业部署完整掌握 Codex CLI 的人 | 72 篇独立文章，覆盖安装、认证、命令、配置、安全、MCP/Skills/Hooks/Apps/Plugins、多 Agent、exec/CI/SDK、企业治理、真实工作流和附录参考。 |
| [Codex 工程化实战系列](./codex-engineering/) | 想系统掌握 Codex 工程化实践的人 | 39 篇独立文章 + 系列总览，覆盖 CLI/App/Web/Cloud 入口、AGENTS.md、沙箱隔离、Rules、Hooks、codex exec、GitHub Actions、Skills、Subagents、SDK 和团队治理。 |

### Superpowers 系列

基于 [obra/superpowers](https://github.com/obra/superpowers) 的 18 篇工程化解构。从 skill 系统原理、CSO 检索优化、四件套边界，到 brainstorming / writing-plans / Subagent-Driven Development / TDD / systematic-debugging 的核心工作流，再到模型成本、并行 subagent、跨平台落地与边界避坑。适合想用 superpowers 把 AI 编码变成可治理工程系统的团队。

| # | 文章 | 主题 |
| --- | --- | --- |
| — | [Superpowers 系列总览](./superpowers/README.md) | 18 篇导读、阅读路径、来源说明 |
| 01 | [Superpowers 入门：给 AI 装上一套开发方法论](./superpowers/01-overview.md) | 整体导览、完整任务生命周期、与 SuperClaude/CLAUDE.md 的差别 |
| 02 | [Skills 系统是什么](./superpowers/02-skills-system.md) | skill 物理形态、加载与触发、与 slash command 的本质区别 |
| 03 | [description 字段与 CSO](./superpowers/03-description-cso.md) | description 反直觉写法、obra 实验数据、关键词覆盖 |
| 04 | [hooks / CLAUDE.md / skill / slash command 的边界](./superpowers/04-hooks-md-skill-command-boundary.md) | 四件套各自能干什么、组合使用模式 |
| 05 | [brainstorming：把模糊需求拆成 spec](./superpowers/05-brainstorming.md) | 苏格拉底式追问、分段确认设计、spec 文档结构 |
| 06 | [writing-plans：2-5 分钟一颗任务](./superpowers/06-writing-plans.md) | 颗粒度原则、任务要素、真实计划逐行解读 |
| 07 | [git worktrees：隔离工作区](./superpowers/07-git-worktrees.md) | 为什么强制 worktree、与 branch 的差别、并行基础 |
| 08 | [Subagent-Driven Development 整体流程](./superpowers/08-subagent-driven-development.md) | 控制器 vs 三角色、上下文隔离、四种状态处理 |
| 09 | [三种 subagent prompt 详解](./superpowers/09-subagent-prompts.md) | implementer / spec-reviewer / code-quality-reviewer 逐段拆解 |
| 10 | [TDD 是怎么被严格执行的](./superpowers/10-tdd-enforcement.md) | RED-GREEN-REFACTOR 执行细节、Iron Law、rationalization 表 |
| 11 | [systematic-debugging 根因分析四阶段](./superpowers/11-systematic-debugging.md) | root-cause-tracing / defense-in-depth / condition-based-waiting |
| 12 | [verification-before-completion 与 code review](./superpowers/12-verification-and-code-review.md) | 完成独立成段、双段 review、Critical issue 阻断 |
| 13 | [finishing-a-development-branch：合并、PR、清理](./superpowers/13-finishing-branch.md) | 四选项决策树、worktree 清理、团队 Git 衔接 |
| 14 | [模型选择与成本控制](./superpowers/14-model-selection-cost.md) | 各角色模型档位、任务复杂度信号、token 实测 |
| 15 | [dispatching-parallel-agents：并行 subagent](./superpowers/15-dispatching-parallel-agents.md) | 何时能并行、避免冲突、与 SDD 组合 |
| 16 | [用 TDD 写一个自己的 skill](./superpowers/16-writing-skills.md) | writing-skills 元技巧、pressure scenario、堵 rationalization |
| 17 | [跨平台：在 Cursor / Codex / Copilot / Gemini 上跑起来](./superpowers/17-cross-platform.md) | 8 平台安装差异、工具名映射、功能失效点 |
| 18 | [边界、避坑与最佳实践](./superpowers/18-boundaries-pitfalls.md) | 不擅长场景、token 代价、踩坑、何时只用一两个 skill |

### OpenSpec 系列

Spec-Driven Development 框架的完整中文指南，从入门到实战。覆盖工作流、Delta Spec、自定义 Schema、AI 工具集成、Brownfield 引入、CI/CD 和团队协作。

| # | 文章 | 主题 |
| --- | --- | --- |
| — | [OpenSpec 总览](./openspec/openspec.md) | 5 分钟了解 OpenSpec 是什么、怎么用、跟其他方案比怎么样 |
| 01 | [Vibe Coding 的终结者？](./openspec/01-introduction.md) | Vibe Coding 11 个问题、SDD 演进、OpenSpec 定位与对比 |
| 02 | [核心概念全解](./openspec/02-core-concepts.md) | Specs、Changes、Deltas、Archive、四大哲学原则 |
| 03 | [OPSX 工作流完全指南](./openspec/03-opsx-workflow.md) | propose 到 archive 每一步、core vs expanded 模式、完整实战 |
| 04 | [Delta Spec 深度解析](./openspec/04-delta-spec.md) | 增量规范写法、合并机制、并行变更与冲突处理 |
| 05 | [自定义 Schema 与工作流定制](./openspec/05-custom-schemas.md) | config.yaml、自定义 schema、Fork、社区扩展、三个实战示例 |
| 06 | [AI 工具集成实战](./openspec/06-ai-tool-integration.md) | Claude Code、Cursor、Copilot 集成详解、多工具切换 |
| 07 | [Brownfield 项目实战](./openspec/07-brownfield-practice.md) | 已有代码库引入 OpenSpec、explore/onboard 实战、渐进策略 |
| 08 | [Workspace 与多仓库协作](./openspec/08-workspace-multi-repo.md) | 多仓库和大 monorepo 的协调层、context store、initiative |
| 09 | [进阶实践](./openspec/09-advanced-practices.md) | CI/CD 集成、Code Review、团队纪律、避坑指南 |
| 10 | [实战复盘](./openspec/10-retrospective.md) | 三个真实项目的数据：个人博客、SaaS 后台、订单系统 |

### Harness 工程专题

围绕「harness」（让大模型真正干活的工程层）的 6 篇专题。核心心智模型是 **Agent = Model + Harness**——模型只是 CPU，harness 才是决定 agent 上限的操作系统。从概念定义、开源项目全景、SWE-bench 评测争议，到多 agent 与 Bitter Lesson 的论战，再到从 60 行手搓 agent 的实战学习路径。适合想理解 AI coding agent 为什么能干活、以及怎么自己造一个的开发者。

| # | 文章 | 主题 |
| --- | --- | --- |
| — | [Harness Engineering 专题总览](./harness-engineering/README.md) | 什么是 harness、核心命题、五大共识与三大争议、阅读路径 |
| 01 | [Harness Engineering 是什么](./harness-engineering/01-what-is-harness-engineering.md) | 定义、inner/outer harness、agent harness vs eval harness、context engineering、ACI |
| 02 | [开源项目全景](./harness-engineering/02-open-source-landscape.md) | eval/agent harness、编排框架、可观测、沙箱五大类 + 共性设计模式 |
| 03 | [评测 Harness 与 SWE-bench 三连争议](./harness-engineering/03-eval-harness-and-swe-bench.md) | 评分函数、contamination、SWE-bench 争议、LLM-as-judge、Hamel 路线 |
| 04 | [趋势与争议](./harness-engineering/04-trends-and-debates.md) | 多 vs 单 agent、Bitter Lesson 与 harness 寿命、harness 技术债 |
| 05 | [实战与学习路径](./harness-engineering/05-tutorials-and-learning-path.md) | 手搓 agent/eval harness、公开课、starter、5 步学习路径 |

### Claude Code 与 Codex 工程化系列的关系

两个系列独立阅读，但互为参照。核心差异：

| 维度 | Claude Code 系列 | Codex 系列 |
| --- | --- | --- |
| 指令系统 | CLAUDE.md（深度集成） | AGENTS.md（跨工具通用） |
| 安全模型 | 26 个 Hook 拦截点 | 内核级沙箱 + Starlark Rules |
| 执行哲学 | 结对编程（hand-on） | 委托-审查-批准（hands-off） |
| CI/CD | claude -p（headless） | codex exec + codex-action |
| 选型参考 | [Codex 工程化实战系列](./codex-engineering/) | 同上 |

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

## Vibe Coding 实战

工具评测帮你选工具，工程化系列帮你深度用工具，**Vibe Coding 实战帮你从零做项目**。 → [Vibe Coding 实战方法](./vibe-coding.md)

| 文章 | 回答的问题 |
| --- | --- |
| [实战：落地页](./vibe-coding-landing-page.md) | 怎么用 AI 做一个前端落地页 |
| [实战：CLI 工具](./vibe-coding-cli-tool.md) | 怎么用 AI 做一个命令行工具 |
| [从原型到可维护](./vibe-coding-from-prototype.md) | 原型做完了，怎么变成能长期维护的代码 |

## 当前判断

- Claude Code 和 Codex 更偏 agentic software engineering。各有偏重：Claude Code 偏 hands-on 结对编程，Codex 偏 hands-off 委托执行。
- Cursor 更偏 AI-first IDE 和日常开发效率。适合把 AI 放进编辑器工作流。
- Cline 更偏开源 IDE agent 与 MCP-first 工作流。
- Continue 更偏可配置、可版本化、可 CI 化的团队 AI checks。
- Gemini CLI 技术设计值得研究，但需关注迁移到 Antigravity CLI 的风险。

## 后续工作

1. 设计同任务横向评测任务集。
2. 固定工具版本、模型、预算、运行次数和上下文。
3. 记录 diff、测试结果、耗时、成本、人工修正量和越权行为。
4. 形成 `AI 编程基准测试` 独立文档。
