# AI 指南地图

这里是 Awesome AI Guide 的内容地图。

README 负责展示项目门面；这里负责承载更完整的学习路线、工具分类、专题入口和后续扩展方向。

## 从这里开始

| 你想做什么 | 建议入口 |
| --- | --- |
| 不知道从哪里开始 | [AI 知识地图](./knowledge-map.md) |
| 按自己的身份学习 | [角色学习路径](./paths/) |
| 选择 AI 编程工具 | [AI 编程](./ai-coding/) |
| 按场景找 AI 项目 | [按场景找项目](./project-collections/by-scenario.md) |
| 寻找 AI 项目和工具 | [项目收藏](./project-collections/) |
| 系统学习 AI 应用开发 | [学习路径](#学习路径) |
| 跟踪 AI 技术趋势 | [技术雷达](#技术雷达) |
| 研究工具评测方法 | [评测体系](#评测体系) |
| 寻找后续贡献方向 | [路线图](#路线图) |

## 核心板块

| 方向 | 目标 | 状态 |
| --- | --- | --- |
| [知识地图](./knowledge-map.md) | 从身份、能力、工具、项目和风险建立总览 | 已启动 |
| [机器学习学习路径](./machine-learning/) | 从经典 ML 到深度学习到前沿方向，51 篇系列文章 | 已启动 |
| [角色学习路径](./paths/) | 前端、后端、AI 应用开发者、DevOps、产品经理和普通人的入口 | 已启动 |
| [AI 编程](./ai-coding/) | AI 编程工具、IDE、CLI agent、代码评测 | 已启动 |
| [Agent](./agent/) | Agent 框架、工作流、多 agent、工具调用 | 已启动 |
| [项目收藏](./project-collections/) | AI 项目收藏、工具分类、生态入口、专题素材池 | 已启动 |
| [AI 架构决策](./ai-architecture-decisions.md) | RAG / Fine-tune / Agent / Workflow 选型决策树 | 已启动 |
| [评测](./evaluation/) | AI、大模型、RAG、Agent、AI Coding 和安全红队评测地图 | 已启动 |
| RAG | 知识库、检索增强、向量数据库、评测 | 待建设 |
| MCP | MCP server、工具接入、权限边界、典型组合 | 待建设 |
| Workflow | n8n、Dify、LangGraph、自动化工作流 | 待建设 |
| Model API | OpenAI、Anthropic、Gemini、本地模型和部署 | 待建设 |

## AI 编程

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

新增工程专题入口：

- [Loop Engineering 专题](./ai-coding/loop-engineering/README.md) — 把 agent 从“单轮提示”升级成“持续运行控制系统”，覆盖状态文件、pattern、L0-L3 上线分级和跨工具迁移。
- [AI / 大模型 / Agent 评测专题](./evaluation/) — 统一梳理模型能力、LLM 应用、RAG、Agent、AI Coding、安全红队和生产运行评测。

## 学习路径

| 角色 | 推荐路线 |
| --- | --- |
| [前端工程师](./paths/frontend.md) | AI Coding -> AI UI -> 流式交互 -> 多模态应用 |
| [后端工程师](./paths/backend.md) | 大模型 API -> RAG -> Agent -> Evaluation -> 部署与观测 |
| [AI 应用开发者](./paths/ai-app-developer.md) | Prompt -> Tool Calling -> RAG -> Agent -> Workflow |
| [DevOps / SRE](./paths/devops.md) | AI for CI/CD -> 日志分析 -> 权限边界 -> 审计回放 |
| [产品经理](./paths/product.md) | 场景识别 -> 工具选型 -> 原型验证 -> 评测指标 |
| [普通人](./paths/everyday-user.md) | AI 对话 -> 资料整理 -> 知识管理 -> 轻量自动化 |

## 评测体系

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

## 技术雷达

| 值得投入 | 持续观察 | 谨慎使用 |
| --- | --- | --- |
| AI Coding | 多 Agent 协作 | 无评测闭环的 Agent Demo |
| Agentic Workflow | AI 浏览器 | 只靠 Prompt 维护复杂业务流程 |
| RAG Evaluation | 端侧模型 | 没有权限模型的企业知识库 |
| MCP | 多模态 Agent | 无日志、无回滚的自动化 Agent |

## 路线图

下一步建议按这个顺序建设：

1. 把 Project Collections 二次整理成按身份推荐的工具清单。
2. 完善 AI Coding 横向评测。
3. 建设 Agent 框架专题。
4. 建设 RAG 工具专题。
5. 建设 MCP 工具组合专题。
6. 建设评测模板和贡献规范。

## 贡献建议

欢迎贡献：

- 某个 AI 工具的真实使用体验
- 工具对比和横向评测
- 高质量教程和官方文档索引
- 生产落地案例
- 失败案例和避坑经验
- 安全、权限、成本相关补充
