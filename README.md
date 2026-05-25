<p align="center">
  <img src="./assets/awesome-ai-guide-cover.png" alt="Awesome AI Guide cover" width="100%" />
</p>

<h1 align="center">Awesome AI Guide</h1>

<p align="center">
  面向技术人的 AI 工具评测、实战资料库与学习路线图
</p>

<p align="center">
  <a href="#featured">Featured</a> ·
  <a href="./docs/">Explore</a> ·
  <a href="./docs/paths/">Role Paths</a> ·
  <a href="#ai-coding">AI Coding</a> ·
  <a href="./docs/project-collections/">Project Collections</a> ·
  <a href="#learning-paths">Learning Paths</a> ·
  <a href="#principles">Principles</a>
</p>

---

## Why

AI 资料已经足够多，真正缺的是判断力。

这个项目关注：

- 哪些 AI 工具真的值得技术人投入时间使用
- 哪些资料值得系统学习
- 哪些方案适合真实项目落地
- 哪些 Demo 很漂亮，但不适合生产环境

别人给你一堆链接，这里帮你建立 AI 技术判断力。

## Explore

| 入口 | 内容 |
| --- | --- |
| [AI Guide Map](./docs/) | 项目内容地图、学习路线、技术雷达和后续 Roadmap |
| [AI Knowledge Map](./docs/knowledge-map.md) | 从身份、能力、工具、项目和风险串起完整学习图谱 |
| [Role Learning Paths](./docs/paths/) | 前端、后端、AI 应用开发者、DevOps、产品经理和普通人的学习入口 |
| [AI Coding](./docs/ai-coding/) | Claude Code、Codex、Cursor、Cline、Continue、Gemini CLI |
| [Agent Learning Path](./docs/agent/) | 从 LLM API 到可评测、可上线 Agent 系统的学习路线 |
| [Project Collections](./docs/project-collections/) | AI 项目、Agent 框架、开发者工具、MCP 集成和垂直应用收藏 |

## Featured

| 专题 | 内容 | 状态 |
| --- | --- | --- |
| [Role Learning Paths](./docs/paths/) | 面向前端、后端、AI 应用开发者、DevOps、产品经理和普通人的学习路线 | 已启动 |
| [AI Knowledge Map](./docs/knowledge-map.md) | 把身份、能力、工具、项目、评测和安全边界串成总图 | 已启动 |
| [Claude Code](./docs/ai-coding/claude-code.md) | 官方资料、生态项目、CLAUDE.md、hooks、subagents、MCP、GitHub Actions、评测维度 | 资料整理中 |
| [OpenAI Codex](./docs/ai-coding/openai-codex.md) | 官方资料、生态项目、AGENTS.md、Codex Action、MCP、横向评测资料 | 资料整理中 |
| [Project Collections](./docs/project-collections/) | 443 个 AI 项目与能力条目，按 Agent、AI Coding、MCP、工作流、金融、设计等方向分类 | 持续扩充 |

## AI Coding

| 工具 | 定位 | 入口 |
| --- | --- | --- |
| [Claude Code](./docs/ai-coding/claude-code.md) | 终端 AI Coding Agent | 已整理 |
| [OpenAI Codex](./docs/ai-coding/openai-codex.md) | AI Coding Agent | 已整理 |
| [Cursor](./docs/ai-coding/cursor.md) | AI IDE | 已整理 |
| [Cline](./docs/ai-coding/cline.md) | VS Code Agent 插件 | 已整理 |
| [Continue](./docs/ai-coding/continue.md) | 开源 AI Coding 助手 | 已整理 |
| [Gemini CLI](./docs/ai-coding/gemini-cli.md) | 终端 AI Coding Agent | 已整理 |

## Evaluation

每个工具会尽量从真实工程角度评估，而不是只看官网 Demo 或 GitHub Star。

| 维度 | 看什么 |
| --- | --- |
| 使用价值 | 是否解决真实、高频、重要的问题 |
| 上手成本 | 安装、配置、文档、学习曲线 |
| 工程集成 | 是否容易接入真实项目和现有工作流 |
| 生产可用性 | 稳定性、权限、日志、监控、回滚 |
| 可控性 | 是否容易调试、约束行为、定位问题 |
| 成本 | 订阅成本、API 成本、部署成本、迁移成本 |
| 风险 | 数据安全、供应商锁定、不可解释行为 |

## Learning Paths

| 角色 | 推荐路线 |
| --- | --- |
| [前端工程师](./docs/paths/frontend.md) | AI Coding → AI UI → 流式交互 → 多模态应用 |
| [后端工程师](./docs/paths/backend.md) | 大模型 API → RAG → Agent → Evaluation → 部署与观测 |
| [AI 应用开发者](./docs/paths/ai-app-developer.md) | Prompt → Tool Calling → RAG → Agent → Workflow |
| [DevOps / SRE](./docs/paths/devops.md) | AI for CI/CD → 日志分析 → 权限边界 → 审计回放 |
| [产品经理](./docs/paths/product.md) | 场景识别 → 工具选型 → 原型验证 → 评测指标 |
| [普通人](./docs/paths/everyday-user.md) | AI 对话 → 资料整理 → 知识管理 → 轻量自动化 |

## Radar

| 值得投入 | 持续观察 | 谨慎使用 |
| --- | --- | --- |
| AI Coding | 多 Agent 协作 | 无评测闭环的 Agent Demo |
| Agentic Workflow | AI 浏览器 | 只靠 Prompt 维护复杂业务流程 |
| RAG Evaluation | 端侧模型 | 没有权限模型的企业知识库 |
| MCP | 多模态 Agent | 无日志、无回滚的自动化 Agent |

## Principles

- 资料要全，但不只追求数量。
- 评测要明确，不写模糊的万能推荐。
- 优先真实使用体验，谨慎引用营销话术。
- 关注工程落地、长期维护、安全边界和成本。
- 过时、低质量或失效资料会被移除或标记。

## Contributing

欢迎贡献：

- AI 工具真实使用体验
- 工具评测和框架对比
- 高质量学习资料
- 生产落地案例
- 避坑经验和安全边界

提交内容请尽量说明：适合谁、解决什么问题、为什么值得推荐、有哪些限制或风险。

## License

See [LICENSE](LICENSE).
