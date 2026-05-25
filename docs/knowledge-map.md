# AI Knowledge Map

这张知识地图把 Awesome AI Guide 的内容从“目录”转成“学习导航”。

目标不是让读者收藏更多链接，而是帮助不同身份的人判断：自己该学什么、先做什么、哪些工具值得投入、哪些风险必须避开。

## 一张总图

```txt
身份入口
  -> 前端 / 后端 / AI 应用开发者 / DevOps / 产品 / 普通人
  -> 对应能力
  -> 推荐工具
  -> 第一个项目
  -> 评测与风险边界
```

## 核心图谱

| 图谱 | 解决的问题 | 当前入口 |
| --- | --- | --- |
| 身份路线图 | 我是谁，我应该先学什么 | [Role Learning Paths](./paths/) |
| AI Coding 图谱 | 哪些工具能进入真实开发流程 | [AI Coding](./ai-coding/) |
| Agent 学习图谱 | 如何从 API 走到可上线 Agent | [Agent Learning Path](./agent/) |
| 项目生态图谱 | 有哪些可研究、可试用、可二次整理的项目 | [Project Collections](./project-collections/) |
| 评测图谱 | 如何判断工具和方案是否真的可用 | [Evaluation System](./README.md#evaluation-system) |
| 技术雷达 | 哪些方向值得投入、观察或谨慎使用 | [Technology Radar](./README.md#technology-radar) |

## 身份到能力

| 身份 | 第一优先级 | 第二优先级 | 不宜过早投入 |
| --- | --- | --- | --- |
| 前端工程师 | AI Coding、AI UI、流式交互 | 多模态 UI、设计到代码 | 自建复杂 Agent 平台 |
| 后端工程师 | Model API、Tool Calling、RAG | Agent、Evaluation、部署观测 | 没有评测的多 Agent |
| AI 应用开发者 | Prompt、工具调用、Workflow | RAG、Agent Loop、安全 | 只靠 Prompt 维护业务流程 |
| DevOps / SRE | AI for CI/CD、日志分析、权限 | Incident Agent、沙箱、审计 | 自动写生产环境 |
| 产品经理 | 场景识别、原型验证、指标 | 工具选型、成本结构、风险 | 把 Demo 当生产方案 |
| 普通人 | AI 工作流、知识管理、自动化 | 隐私边界、工具组合 | 托管敏感账号和数据 |

## 能力到专题

| 能力 | 应该看的专题 | 最小产出 |
| --- | --- | --- |
| AI 编程 | [AI Coding](./ai-coding/) | 用同一个任务比较 2-3 个工具 |
| Agent 基础 | [Agent Learning Path](./agent/) | GitHub Issue Triage Agent |
| 项目选型 | [Project Collections](./project-collections/) | 按场景挑出 5 个候选项目 |
| RAG | Agent Stage 6、Project Collections | 一个带引用的文档问答原型 |
| MCP / 工具接入 | Agent Stage 2、安全资料 | 一张工具权限表 |
| Workflow | Agent Stage 3 | 一个带人工确认节点的流程 |
| Evaluation | Agent Stage 7、AI Coding 评测维度 | 20 条回归用例 |
| Safety | Agent Stage 8、AI Coding 安全模板 | 最小权限和高风险操作规则 |

## 第一个项目矩阵

| 身份 | 推荐第一个项目 | 为什么适合 |
| --- | --- | --- |
| 前端工程师 | Streaming AI UI Demo | 覆盖 AI 交互、加载状态、错误恢复和用户体验 |
| 后端工程师 | 文档 RAG API | 覆盖模型 API、检索、引用、缓存和日志 |
| AI 应用开发者 | GitHub Issue Triage Agent | 覆盖结构化输出、工具调用、RAG、评测和权限 |
| DevOps / SRE | Incident Report Summarizer | 覆盖日志摘要、时间线、风险分级和人工确认 |
| 产品经理 | AI Feature Evaluation Sheet | 覆盖场景、用户、指标、成本和风险判断 |
| 普通人 | Personal Knowledge Workflow | 覆盖资料整理、搜索、总结和隐私边界 |

## 内容建设优先级

1. 先建设身份路线，因为它决定读者能不能快速进入。
2. 再把项目集合转成按身份推荐的工具清单。
3. 然后补齐 RAG、MCP、Workflow、Evaluation 四条硬核专题。
4. 最后做统一评测模板和可复现实战项目。

## 判断原则

- 先角色，后工具。
- 先项目，后概念。
- 先评测，后推荐。
- 先权限边界，后自动化。
- 先能稳定完成小任务，再谈复杂 Agent。
