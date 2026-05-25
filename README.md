# Awesome AI Guide

<p align="center">
  <img src="./assets/awesome-ai-guide-cover.png" alt="Awesome AI Guide cover" width="100%" />
</p>

> 面向技术人的 AI 工具评测榜、实战资料库与学习路线图。

这里不只是收集 AI 资料，更关注一个更重要的问题：

> 哪些 AI 工具真的值得技术人投入时间使用？

AI 资料已经足够多，但技术人真正缺的不是更多链接，而是判断力：

- 什么工具适合真实项目
- 什么框架只是 Demo 很漂亮
- 什么资料值得系统学习
- 什么方案已经过时
- AI Coding、Agent、RAG、Workflow 应该怎么选型和落地

这个项目希望成为技术人的 AI 导航站：资料全，但不止于全。

## Project Dashboard

| 模块 | 你能获得什么 |
| --- | --- |
| AI 工具评测榜 | 判断哪些工具值得用、适合谁、风险在哪里 |
| AI 技术雷达 | 跟踪值得投入、持续观察、谨慎使用的技术方向 |
| 学习路线 | 按后端、前端、产品、AI 应用开发者规划路径 |
| 资料库 | 系统整理 AI 应用开发资料、框架、案例和方法 |
| 避坑指南 | 识别 Demo 和真实落地之间的差距 |

## Start Here

| 如果你是 | 建议入口 |
| --- | --- |
| 后端工程师 | RAG、Agent、Workflow、部署和可观测性 |
| 前端工程师 | AI Coding、AI UI、流式交互、多模态应用 |
| 产品经理 | 场景识别、工具选型、评测指标、数据闭环 |
| 创业者 | AI 产品机会、成本结构、落地案例、技术风险 |
| AI 应用开发者 | Prompt、Tool Calling、RAG、Agent、Evaluation |

## Why This Exists

如果你正在面对这些问题，这个项目会对你有帮助：

- 想选 AI 编程工具，但不知道 Cursor、Claude Code、Codex、Cline、Continue 该怎么选
- 想做 Agent，但分不清 LangGraph、AutoGen、CrewAI、OpenAI Agents SDK 的适用边界
- 想做 RAG 或企业知识库，但不知道 Dify、RAGFlow、LlamaIndex、LangChain、Haystack 的真实差异
- 想系统学习 AI 应用开发，但不知道从 Prompt、RAG、Agent、Workflow、Evaluation 哪一步开始
- 想跟上 AI 技术变化，但不想每天被碎片信息淹没

别人给你一堆链接，这里帮你建立 AI 工具判断力。

## Quick Paths

<details open>
<summary><strong>我想选 AI 编程工具</strong></summary>

看 [AI Coding 工具评测](#ai-coding-工具评测)，重点关注：

- 日常开发提效
- 项目级代码理解
- 自动重构能力
- 复杂任务执行能力
- 成本和隐私风险

</details>

<details open>
<summary><strong>我想搭 Agent</strong></summary>

看 [Agent 与 Workflow 工具评测](#agent-与-workflow-工具评测)，重点关注：

- 工具调用
- 状态管理
- 可观测性
- 可控性
- 生产可用性

</details>

<details open>
<summary><strong>我想做企业知识库或 RAG</strong></summary>

看 [RAG 与 Knowledge Base 工具评测](#rag-与-knowledge-base-工具评测)，重点关注：

- 数据接入
- 检索质量
- 评测能力
- 权限控制
- 部署和维护成本

</details>

<details open>
<summary><strong>我想系统学习 AI 应用开发</strong></summary>

看 [学习路线](#学习路线)，按角色和目标选择路线。

</details>

## AI 工具评测榜

AI 工具评测是本项目的核心栏目。

我们不会只看宣传文案、官网 Demo 或 GitHub Star，而是尽量从技术人真实使用和工程落地角度评估工具。

### 评测维度

| 维度 | 说明 |
| --- | --- |
| 使用价值 | 是否解决真实、高频、重要的问题 |
| 上手成本 | 安装、配置、文档、学习曲线是否友好 |
| 工程集成 | 是否容易接入真实项目和现有工作流 |
| 生产可用性 | 稳定性、权限、日志、监控、回滚能力 |
| 可控性 | 是否容易调试、约束行为、定位问题 |
| 成本 | 订阅成本、API 成本、部署成本、迁移成本 |
| 生态活跃度 | 社区、更新频率、插件、案例和第三方生态 |
| 风险 | 数据安全、供应商锁定、不可解释行为、长期维护风险 |

### 推荐等级

| 等级 | 含义 |
| --- | --- |
| S | 强烈推荐，值得优先投入 |
| A | 推荐，适合大多数相关场景 |
| B | 可用，但需要看具体场景 |
| C | 谨慎使用，存在明显限制 |
| D | 不建议投入，除非有特殊原因 |

### 评测模板

每个工具尽量使用统一格式：

```md
## 工具名称

**一句话结论：**
适合什么场景，不适合什么场景。

**适合：**
- 场景 1
- 场景 2
- 场景 3

**不适合：**
- 场景 1
- 场景 2

**评分：**

| 维度 | 评分 |
| --- | ---: |
| 使用价值 | 0-5 |
| 上手成本 | 0-5 |
| 工程集成 | 0-5 |
| 生产可用性 | 0-5 |
| 可控性 | 0-5 |
| 成本 | 0-5 |
| 生态活跃度 | 0-5 |
| 风险控制 | 0-5 |

**推荐等级：** S / A / B / C / D

**推荐理由：**
为什么值得或不值得使用。

**主要风险：**
真实使用中最需要注意的问题。
```

## AI Coding 工具评测

面向日常开发、代码理解、重构、测试生成、复杂任务执行等场景。

| 工具 | 定位 | 适合场景 | 状态 |
| --- | --- | --- | --- |
| Cursor | AI IDE | 日常开发、项目问答、代码生成 | 待评测 |
| [Claude Code](./docs/ai-coding/claude-code.md) | 终端 AI Coding Agent | 复杂代码任务、仓库级修改 | 资料整理中 |
| [Codex](./docs/ai-coding/openai-codex.md) | AI Coding Agent | 自动实现、调试、代码协作 | 资料整理中 |
| Cline | VS Code Agent 插件 | 本地 IDE 内的 Agent 工作流 | 待评测 |
| Continue | 开源 AI Coding 助手 | 自定义模型、本地化代码助手 | 待评测 |

## Agent 与 Workflow 工具评测

面向多步骤任务、工具调用、状态管理、业务流程自动化等场景。

| 工具 | 定位 | 适合场景 | 状态 |
| --- | --- | --- | --- |
| LangGraph | Agent 工作流框架 | 可控 Agent、复杂状态流转 | 待评测 |
| OpenAI Agents SDK | Agent 应用开发 SDK | 工具调用、Agent 编排 | 待评测 |
| AutoGen | 多 Agent 协作框架 | 多角色协作、实验型 Agent | 待评测 |
| CrewAI | 多 Agent 编排框架 | 角色化任务协作 | 待评测 |
| n8n | 工作流自动化平台 | 低代码自动化、工具集成 | 待评测 |

## RAG 与 Knowledge Base 工具评测

面向企业知识库、文档问答、检索增强生成、知识管理等场景。

| 工具 | 定位 | 适合场景 | 状态 |
| --- | --- | --- | --- |
| Dify | AI 应用开发平台 | 快速搭建 AI 应用和知识库 | 待评测 |
| RAGFlow | RAG 系统 | 文档解析、知识库问答 | 待评测 |
| LlamaIndex | 数据框架 | RAG 数据接入和索引 | 待评测 |
| LangChain | LLM 应用框架 | RAG、Chain、工具集成 | 待评测 |
| Haystack | RAG / NLP 框架 | 检索问答、生产级 NLP 应用 | 待评测 |

## 大模型 API / 部署工具评测

面向模型调用、私有化部署、本地推理、模型网关等场景。

| 工具 | 定位 | 适合场景 | 状态 |
| --- | --- | --- | --- |
| OpenAI API | 大模型 API | 通用 LLM、多模态、Agent 应用 | 待评测 |
| Anthropic API | 大模型 API | 长文本、复杂推理、代码任务 | 待评测 |
| Gemini API | 大模型 API | 多模态、长上下文、生态集成 | 待评测 |
| Ollama | 本地模型运行工具 | 本地开发、私有化实验 | 待评测 |
| vLLM | 推理服务框架 | 高吞吐模型部署 | 待评测 |

## AI 技术雷达

技术雷达用于跟踪 AI 技术生态变化，帮助判断哪些方向值得投入，哪些方向需要观察。

### 值得投入

- AI Coding
- Agentic Workflow
- RAG Evaluation
- MCP
- 企业级 AI 应用工程化

### 持续观察

- 多 Agent 协作
- AI 浏览器
- AI IDE
- 端侧模型
- 多模态 Agent

### 谨慎使用

- 没有评测闭环的 Agent Demo
- 只靠 Prompt 维护复杂业务流程
- 没有权限模型的企业知识库
- 只看 GitHub Star 的技术选型
- 无日志、无回滚、无监控的自动化 Agent

## 学习路线

### 后端工程师

推荐路线：

1. 大模型 API 基础
2. Prompt Engineering
3. RAG 基础
4. Agent / Workflow
5. Evaluation
6. 部署、监控、权限和成本控制

### 前端工程师

推荐路线：

1. AI 产品交互模式
2. AI Coding 工具
3. Chat UI 和流式输出
4. 多模态应用
5. AI 应用状态管理
6. 前端工程中的 Agent 工作流

### 产品经理 / 创业者

推荐路线：

1. AI 场景识别
2. 工具和模型选型
3. 原型验证
4. 成本估算
5. 评测指标
6. 数据闭环

### AI 应用开发者

推荐路线：

1. Prompt
2. Function Calling / Tool Calling
3. RAG
4. Agent
5. Workflow
6. Evaluation
7. Observability
8. Security

## 资料库

资料库是本项目的底座，评测和路线图会从资料库中持续沉淀。

### 基础方向

- 大模型基础
- Prompt Engineering
- Function Calling / Tool Calling
- Embedding
- RAG
- Agent
- Workflow
- Evaluation
- Fine-tuning
- 多模态

### 工程方向

- AI 应用架构
- 模型 API 接入
- 私有化部署
- 向量数据库
- 权限与安全
- 日志与可观测性
- 成本优化
- 数据闭环

### 场景方向

- AI Coding
- 企业知识库
- AI 客服
- AI 数据分析
- AI 销售助手
- AI 内容生成
- AI 自动化办公
- AI 教育应用

## 避坑指南

- RAG 不是把文档丢进向量数据库就结束
- Agent 不是工具越多越强
- Prompt 模板不能替代评测体系
- Demo 能跑不代表能上生产
- 选型不要只看 GitHub Star
- 没有日志和回放能力的 Agent 很难排查问题
- 企业知识库必须优先考虑权限、数据隔离和内容更新机制
- AI Coding 工具适合提效，但不应该绕过测试、评审和安全边界

## 更新计划

- 每周更新值得关注的 AI 工具和项目
- 每月更新 AI 工具评测榜
- 持续补充学习路线和落地案例
- 持续移除过时、低质量或失效资源
- 持续收集真实使用反馈，修正评测结论

## 如何贡献

欢迎贡献：

- AI 工具真实使用体验
- 工具评测
- 框架对比
- 高质量学习资料
- 生产落地案例
- 避坑经验
- 学习路线建议

### 推荐提交格式

提交资料或评测时，请尽量说明：

- 适合谁
- 解决什么问题
- 为什么值得推荐
- 有哪些限制或风险
- 是否有实际使用经验

### 评测贡献格式

```md
## 工具名称

**使用场景：**

**使用时间：**

**一句话结论：**

**优点：**
- 

**缺点：**
- 

**适合：**
- 

**不适合：**
- 

**是否推荐：**

**补充说明：**
```

## 项目原则

- 资料要全，但不能只追求数量
- 评测要明确，不写模糊的万能推荐
- 结论要可修正，AI 工具变化很快
- 优先真实使用体验，谨慎引用营销话术
- 面向技术人，关注工程落地和长期维护

## License

See [LICENSE](LICENSE).
