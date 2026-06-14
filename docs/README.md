# AI Guide Map

这里是 Awesome AI Guide 的内容地图。

README 负责展示项目门面；这里负责承载更完整的学习路线、工具分类、专题入口和后续扩展方向。

## Start Here

| 你想做什么 | 建议入口 |
| --- | --- |
| 不知道从哪里开始 | [AI Knowledge Map](./knowledge-map.md) |
| 按自己的身份学习 | [Role Learning Paths](./paths/) |
| 选择 AI 编程工具 | [AI Coding](./ai-coding/) |
| 按场景找 AI 项目 | [Project Collections by Scenario](./project-collections/by-scenario.md) |
| 寻找 AI 项目和工具 | [Project Collections](./project-collections/) |
| 系统学习 AI 应用开发 | [Learning Paths](#learning-paths) |
| 跟踪 AI 技术趋势 | [Technology Radar](#technology-radar) |
| 研究工具评测方法 | [Evaluation System](#evaluation-system) |
| 寻找后续贡献方向 | [Roadmap](#roadmap) |

## Core Areas

| 方向 | 目标 | 状态 |
| --- | --- | --- |
| [Knowledge Map](./knowledge-map.md) | 从身份、能力、工具、项目和风险建立总览 | 已启动 |
| [Machine Learning Path](./machine-learning/) | 从经典 ML 到深度学习到前沿方向，51 篇系列文章 | 已启动 |
| [Role Learning Paths](./paths/) | 前端、后端、AI 应用开发者、DevOps、产品经理和普通人的入口 | 已启动 |
| [AI Coding](./ai-coding/) | AI 编程工具、IDE、CLI agent、代码评测 | 已启动 |
| [Agent](./agent/) | Agent 框架、工作流、多 agent、工具调用 | 已启动 |
| [Project Collections](./project-collections/) | AI 项目收藏、工具分类、生态入口、专题素材池 | 已启动 |
| [AI 架构决策](./ai-architecture-decisions.md) | RAG / Fine-tune / Agent / Workflow 选型决策树 | 已启动 |
| RAG | 知识库、检索增强、向量数据库、评测 | 待建设 |
| MCP | MCP server、工具接入、权限边界、典型组合 | 待建设 |
| Workflow | n8n、Dify、LangGraph、自动化工作流 | 待建设 |
| Model API | OpenAI、Anthropic、Gemini、本地模型和部署 | 待建设 |
| Evaluation | 工具评测、模型评测、任务基准、失败模式 | 待建设 |

## AI Coding

AI Coding 是当前优先建设方向。

| 工具 | 定位 | 难度 | 费用 | 适合谁 | 专题 |
| --- | --- | --- | --- | --- | --- |
| Claude Code | 终端 AI Coding Agent | 中 | 付费 | 后端/DevOps/重度终端 | [查看](./ai-coding/claude-code.md) |
| OpenAI Codex | AI Coding Agent | 中 | 付费 | 全栈/GitHub 用户 | [查看](./ai-coding/openai-codex.md) |
| Cursor | AI IDE | 低 | 付费 | 全栈/IDE 用户 | [查看](./ai-coding/cursor.md) |
| Cline | VS Code Agent 插件 | 中 | 按 API 用量 | 前端/VS Code/MCP 用户 | [查看](./ai-coding/cline.md) |
| Continue | 开源 AI Coding 助手 | 高 | 免费 | 团队/开源偏好/CI | [查看](./ai-coding/continue.md) |
| Gemini CLI | 终端 AI Coding Agent | 中 | 免费额度 | 全栈/Google 生态 | [查看](./ai-coding/gemini-cli.md) |
| Skill 实战评测协议 | 先实战再结论的可复用评测流程 | 低 | 免费 | 工具评测/内容创作者 | [查看](./ai-coding/skill-realworld-evaluation-protocol.md) |

## Learning Paths

| 角色 | 推荐路线 |
| --- | --- |
| [前端工程师](./paths/frontend.md) | AI Coding -> AI UI -> 流式交互 -> 多模态应用 |
| [后端工程师](./paths/backend.md) | 大模型 API -> RAG -> Agent -> Evaluation -> 部署与观测 |
| [AI 应用开发者](./paths/ai-app-developer.md) | Prompt -> Tool Calling -> RAG -> Agent -> Workflow |
| [DevOps / SRE](./paths/devops.md) | AI for CI/CD -> 日志分析 -> 权限边界 -> 审计回放 |
| [产品经理](./paths/product.md) | 场景识别 -> 工具选型 -> 原型验证 -> 评测指标 |
| [普通人](./paths/everyday-user.md) | AI 对话 -> 资料整理 -> 知识管理 -> 轻量自动化 |

## Evaluation System

工具评测不只看“能不能跑”，而是关注真实工程价值。

| 维度 | 看什么 |
| --- | --- |
| 使用价值 | 是否解决真实、高频、重要的问题 |
| 上手成本 | 安装、配置、文档、学习曲线 |
| 工程集成 | 是否容易接入真实项目和现有工作流 |
| 生产可用性 | 稳定性、权限、日志、监控、回滚 |
| 可控性 | 是否容易调试、约束行为、定位问题 |
| 成本 | 订阅成本、API 成本、部署成本、迁移成本 |
| 风险 | 数据安全、供应商锁定、不可解释行为 |

## Technology Radar

| 值得投入 | 持续观察 | 谨慎使用 |
| --- | --- | --- |
| AI Coding | 多 Agent 协作 | 无评测闭环的 Agent Demo |
| Agentic Workflow | AI 浏览器 | 只靠 Prompt 维护复杂业务流程 |
| RAG Evaluation | 端侧模型 | 没有权限模型的企业知识库 |
| MCP | 多模态 Agent | 无日志、无回滚的自动化 Agent |

## Roadmap

下一步建议按这个顺序建设：

1. 把 Project Collections 二次整理成按身份推荐的工具清单。
2. 完善 AI Coding 横向评测。
3. 建设 Agent 框架专题。
4. 建设 RAG 工具专题。
5. 建设 MCP 工具组合专题。
6. 建设评测模板和贡献规范。

## Contribution Ideas

欢迎贡献：

- 某个 AI 工具的真实使用体验
- 工具对比和横向评测
- 高质量教程和官方文档索引
- 生产落地案例
- 失败案例和避坑经验
- 安全、权限、成本相关补充
