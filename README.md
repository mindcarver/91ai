<p align="center">
  <img src="./assets/awesome-ai-guide-cover.png" alt="Awesome AI Guide cover" width="100%" />
</p>

<h1 align="center">Awesome AI Guide</h1>

<p align="center">
  面向技术人的 AI 工具评测、实战资料库与学习路线图
</p>

<p align="center">
  <a href="#featured">Featured</a> ·
  <a href="#ai-coding">AI Coding</a> ·
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

## Featured

| 专题 | 内容 | 状态 |
| --- | --- | --- |
| [Claude Code](./docs/ai-coding/claude-code.md) | 官方资料、生态项目、CLAUDE.md、hooks、subagents、MCP、GitHub Actions、评测维度 | 资料整理中 |
| [OpenAI Codex](./docs/ai-coding/openai-codex.md) | 官方资料、生态项目、AGENTS.md、Codex Action、MCP、横向评测资料 | 资料整理中 |

## AI Coding

| 工具 | 定位 | 入口 |
| --- | --- | --- |
| [Claude Code](./docs/ai-coding/claude-code.md) | 终端 AI Coding Agent | 已整理 |
| [OpenAI Codex](./docs/ai-coding/openai-codex.md) | AI Coding Agent | 已整理 |
| Cursor | AI IDE | 待整理 |
| Cline | VS Code Agent 插件 | 待整理 |
| Continue | 开源 AI Coding 助手 | 待整理 |
| Gemini CLI | 终端 AI Coding Agent | 待整理 |

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
| 后端工程师 | 大模型 API → RAG → Agent → Evaluation → 部署与观测 |
| 前端工程师 | AI Coding → AI UI → 流式交互 → 多模态应用 |
| AI 应用开发者 | Prompt → Tool Calling → RAG → Agent → Workflow |
| 产品经理 | 场景识别 → 工具选型 → 原型验证 → 评测指标 |
| 创业者 | AI 产品机会 → 成本结构 → 落地案例 → 技术风险 |

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
