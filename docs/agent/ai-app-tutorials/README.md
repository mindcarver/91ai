# AI 应用技术文档

AI 应用开发相关技术文档，覆盖基础原理、工程实践、架构设计、行业方案和商业化交付。

---

## 推荐阅读顺序

这套文档不是按文件夹机械阅读，而是按"先理解全局，再掌握核心能力，最后进入工程化和交付"来读。

| 顺序 | 模块 | 为什么先读它 |
|------|------|-------------|
| 1 | AI 基础认知 | 先建立全局地图，知道 LLM、RAG、Workflow、Agent、Function Calling 分别解决什么问题 |
| 2 | Prompt 工程 | 掌握和模型沟通的基本方法，这是所有 AI 应用的入口能力 |
| 3 | RAG 与知识库 | 解决模型不知道、知识不新、企业私有知识无法直接回答的问题 |
| 4 | Agent 与工作流 | 学会把模型、工具、状态、人工审核组合成可控流程 |
| 5 | 智能体设计模式 | 用设计模式视角理解 Agent 系统，不停留在零散技巧 |
| 6 | 工程化与运维 | 把 Demo 变成可上线系统，补齐评估、观测、安全、成本、部署 |
| 7 | 行业方案设计 | 学会把技术能力转译成行业问题、岗位问题和业务流程问题 |
| 8 | 商业化与交付 | 学会包装、报价、访谈、交付和获客 |
| 9 | 综合项目实战 | 用一个完整项目把前面的知识串起来 |
| 10 | 模型层补充 | 需要深入理解训练和微调时再读，不建议一开始就陷进去 |

如果时间有限，最小阅读路径是：

1. AI 应用开发全景地图
2. AI 应用类型地图
3. Prompt 工程
4. 结构化输出
5. RAG 原理与架构
6. Workflow 基础
7. Agent 基础认知
8. Eval 评估体系
9. AI 应用工程架构
10. 项目 PRD

---

## 目录结构

### AI 基础认知

建立对 AI 应用开发的全局视角，理解 LLM 工作原理和核心概念。

| 文章 | 内容 |
|------|------|
| [AI 应用开发全景地图](ai-basics/ai-app-dev-landscape.md) | AI 应用开发的分层架构，从模型层到应用层到交付层的全景视图 |
| [AI 应用类型地图](ai-basics/ai-app-types-map.md) | Chatbot、RAG、Workflow、Agent 等应用类型的边界和选择依据 |
| [LLM 原理压缩理解](ai-basics/llm-principles-compressed.md) | 大语言模型工作原理：Token、Context Window、Embedding、Attention、训练阶段、推理过程、幻觉 |
| [模型选择与模型路由](ai-basics/model-selection-and-routing.md) | 不同模型的特性对比、选型依据、模型路由策略 |
| [Function Calling 基础](ai-basics/function-calling-basics.md) | Function Calling 的原理、协议格式、调用流程和工程实践 |

### Prompt 工程

Prompt 设计方法论、结构化输出、契约规范和模板治理。这个专题建议按下面顺序读，不建议跳读。

| 阅读顺序 | 文章 | 主要讲什么 | 读完应该掌握什么 |
|----------|------|------------|------------------|
| 1 | [Prompt 工程](prompt-engineering/prompt-engineering.md) | Prompt 的基础方法，包括 System/User Prompt、Role/Task/Context/Constraint、Few-shot、高级策略，以及 Prompt 与 RAG、Tool、Workflow 的边界 | 能把一个模糊请求改写成结构清晰、边界明确、可执行的 Prompt |
| 2 | [结构化输出](prompt-engineering/structured-output.md) | JSON Mode、JSON Schema、Pydantic、字段校验、失败重试、降级处理、安全边界和下游衔接 | 能让模型输出被程序稳定解析、校验、入库和传给后续流程 |
| 3 | [Prompt-Contract](prompt-engineering/prompt-contract.md) | 把 Prompt 当成接口契约，定义输入、输出、边界、质量标准、版本、评估闭环和生命周期 | 能为关键 Prompt 写出可评审、可测试、可回滚的契约文档 |
| 4 | [Prompt 模板库建设](prompt-engineering/prompt-template-library.md) | Prompt 的分类、命名、参数、版本、测试样例、评分、回归测试、治理和废弃机制 | 能把零散 Prompt 管理成可复用、可维护、可协作的模板库 |

四篇之间的关系：

- `Prompt 工程` 解决"怎么写好一个 Prompt"。
- `结构化输出` 解决"怎么让输出能被系统稳定消费"。
- `Prompt-Contract` 解决"怎么把 Prompt 变成可评审的接口契约"。
- `Prompt 模板库建设` 解决"怎么把很多 Prompt 变成团队资产"。

### RAG 与知识库

检索增强生成系统的完整链路，从文档处理到向量检索到质量优化再到进阶实战。按数据管线顺序组织，前 6 篇覆盖基础链路，后续专题补充 Agentic RAG、评估、工程化和长期记忆系统。

| 阅读顺序 | 文章 | 内容 |
|----------|------|------|
| 1 | [RAG 原理与架构](rag/rag-principles-and-architecture.md) | RAG 的定义、解决的四大问题、离线/在线两阶段流程、七种架构演进、RAG vs 微调选型 |
| 2 | [文档解析与清洗](rag/document-parsing-and-cleaning.md) | 多格式文档解析（PDF/Markdown/Word/Excel/HTML）、文本清洗五原则、结构信息与元数据提取 |
| 3 | [Chunking 切分策略](rag/chunking-strategies.md) | 文本切分方法：固定长度、语义切分、递归切分、上下文增强切分、Late Chunking 新方法 |
| 4 | [Embedding 与向量数据库](rag/embedding-and-vector-db.md) | 向量化原理、Embedding 模型选择（Cohere/OpenAI/BGE/Qwen）、向量数据库对比 |
| 5 | [RAG 问答链路 v1](rag/rag-qa-pipeline-v1.md) | 最小 RAG 系统的完整实现链路、流式/非流式输出、错误处理 |
| 6 | [检索策略与查询优化](rag/rag-optimization.md) | 可组合多阶段检索、Query Rewrite、HyDE、Hybrid Search、Rerank、Context Compression |
| 7 | [Agentic RAG](rag/agentic-rag.md) | A-RAG 自主策略选择、Self-RAG 反思令牌、Corrective RAG 三路分支、LangGraph 实现、框架选型 |
| 8 | [RAG 评估与微调](rag/rag-eval-and-finetuning.md) | RAGAS 四指标评估、反事实测试、LLM-as-judge、生产监控告警、Embedding/Reranker/LLM 微调策略 |
| 9 | [高级专题与工程实战](rag/advanced-topics-and-engineering.md) | GraphRAG（知识图谱增强检索）、Text-to-SQL、多模态 RAG、12 个痛点及方案、生产框架选型、成本分析 |
| 10 | [AI Agent 记忆系统专题](rag/memory-systems/README.md) | Mem0、Supermemory、Letta、Graphiti、Cognee、LangMem 等项目，长期记忆论文、实战路线和评测方法 |

阅读建议：

- **入门路径（1-2 天）**：RAG 原理与架构 → RAG 问答链路 v1
- **工程落地（3-5 天）**：按阅读顺序 1→6 逐篇学习
- **效果优化（2-3 天）**：RAG 评估与微调 → 检索策略中的高级技巧
- **前沿探索（按需）**：Agentic RAG → 高级专题与工程实战 → AI Agent 记忆系统专题

### Agent 与工作流

从可控工作流到自主 Agent 的设计方法。

| 文章 | 内容 |
|------|------|
| [Workflow 基础](agent-workflow/workflow-basics.md) | 工作流的基本模式：链式、并行、条件分支、循环 |
| [Agent 基础认知](agent-workflow/agent-fundamentals.md) | Agent 的定义、核心组件、执行循环、与 Chatbot/Workflow 的区别 |
| [Tool Calling 深入](agent-workflow/tool-calling-deep-dive.md) | 工具调用的设计模式、参数规范、错误处理 |
| [Human-in-the-loop 与 Agent 可控性](agent-workflow/human-in-the-loop-and-agent-control.md) | 人工审核节点、Agent 可控性设计、中断与恢复机制 |
| [上下文与记忆系统设计](agent-workflow/context-and-memory-system-design.md) | 短期记忆、长期记忆、会话摘要、跨轮次状态管理 |
| [Multi-Agent 架构](agent-workflow/multi-agent-architecture.md) | 多智能体协作模式、角色拆分、通信机制、协作边界 |
| [Agent 安全与失败模式](agent-workflow/agent-security-and-failure-modes.md) | Agent 失败模式分析、安全防护机制、护栏设计 |

### 智能体设计模式

面向工程落地的 Agent 设计模式专题。基础篇（01-05）覆盖系统能力，设计模式篇（06-10）按工程问题合并解析经典智能体架构。

#### 基础篇

| 文章 | 内容 |
|------|------|
| [01 - 从概念到落地：智能体全景图](../agent-design-patterns/01-agent-overview-concept-to-production.md) | Agent 与普通 LLM 调用的区别，从想法到可上线 Agent 的检查清单 |
| [02 - 工作流骨架：提示链、路由、并行与规划](../agent-design-patterns/02-workflow-skeleton-prompt-chaining-routing-parallel-planning.md) | 最小可控 Agent 的骨架模式及其组合方法 |
| [03 - 接入外部世界：工具、MCP 与知识检索](../agent-design-patterns/03-external-world-tools-mcp-knowledge-retrieval.md) | Agent 通过工具、协议和知识检索接触外部世界的方式 |
| [04 - 认知与协作：记忆、反思与多智能体](../agent-design-patterns/04-memory-reflection-multi-agent.md) | Agent 跨轮次改进、角色拆分、协作防失控 |
| [05 - 工程化：可靠性、安全、资源与评估](../agent-design-patterns/05-engineering-reliability-security-resources-eval.md) | 从 Demo 到可运营系统需要的护栏、异常处理和评估体系 |

#### 设计模式篇

经典智能体架构模式，按五组工程问题组织。每组按三个问题理解：它解决什么失控点？它会引入什么新复杂度？什么时候应该用，什么时候不该用？

| 类别 | 文章 | 核心机制 |
|------|------|----------|
| 单步推理 | [06 - ReAct：推理与行动的循环](../agent-design-patterns/06-react-reasoning-action-loop.md) | Thought→Action→Observation 交替推理，边想边做 |
| 单步推理 | [07 - Plan and Solve：先规划再执行](../agent-design-patterns/07-plan-and-solve-plan-then-execute.md) | Planner→Executor→Replanner 三阶段，全局视野、可审查 |
| 并行规划 | [08 - 并行规划：REWOO 与 LLMCompiler](../agent-design-patterns/08-parallel-planning-rewoo-llmcompiler.md) | 占位符和 DAG 两种并行执行方式，减少不必要等待 |
| 反思改进 | [09 - 反思与搜索：Basic Reflection、Reflexion、LATS](../agent-design-patterns/09-reflection-search-basic-reflexion-lats.md) | 从单轮批改到记忆复用和多路径搜索 |
| 元认知 | [10 - 元认知：Self-Discover 与 Storm](../agent-design-patterns/10-metacognition-self-discover-storm.md) | 先决定怎么思考，再执行推理或长文生成 |

### 工程化与运维

AI 应用从原型到生产所需的工程能力。

| 文章 | 内容 |
|------|------|
| [AI 应用工程架构](engineering-ops/ai-app-engineering-architecture.md) | 从 Demo 到可维护系统的分层边界：API、服务、模型网关、RAG、Agent、Eval、数据层 |
| [Prompt 管理系统](engineering-ops/prompt-management-system.md) | 把 Prompt 当成代码接口管理：ID、版本、Schema、测试集、灰度和回滚 |
| [Eval 评估体系](engineering-ops/eval-system.md) | 用数据集、grader、报告和失败样本回流，持续判断 AI 系统有没有退化 |
| [可观测性与调试](engineering-ops/observability-and-debugging.md) | 用 Trace 串起输入、检索、Prompt、模型、工具、成本和质量反馈 |
| [安全与权限系统](engineering-ops/security-and-permission-system.md) | 在身份、检索、上下文、工具、输出和审计六层建立 AI 安全边界 |
| [成本与性能优化](engineering-ops/cost-and-performance-optimization.md) | 同时优化账单和延迟：上下文压缩、模型路由、缓存、并行和流式输出 |
| [AI 应用运行时工程](engineering-ops/ai-runtime-streaming-async-hot-update.md) | 流式输出、异步任务、幂等重试、知识库热更新和面试常见系统设计题 |
| [部署与上线](engineering-ops/deployment-and-launch.md) | 上线前补齐容器化、配置密钥、持久化、健康检查、Eval 门禁、灰度和回滚 |

### 行业方案设计

将 AI 技术能力转化为行业解决方案的方法论和实践。

| 文章 | 内容 |
|------|------|
| [行业拆解方法论](industry-solutions/industry-decomposition-methodology.md) | 行业分析框架：如何拆解一个行业的价值链和关键环节 |
| [岗位拆解方法](industry-solutions/role-decomposition-method.md) | 岗位分析：识别 AI 可介入的关键工作流程 |
| [流程拆解方法](industry-solutions/process-decomposition-method.md) | 业务流程拆解：找到 AI 自动化的切入点 |
| [AI 机会评分模型](industry-solutions/ai-opportunity-scoring-model.md) | AI 应用机会的评估和优先级排序框架 |
| [制造业与企业服务方案](industry-solutions/manufacturing-and-enterprise-service-solutions.md) | 制造业和企业服务领域的 AI 应用方案案例 |
| [半导体行业深度方案](industry-solutions/semiconductor-industry-deep-dive.md) | 半导体行业 AI 应用的深度方案设计 |

### 商业化与交付

AI 项目的商业化包装和交付能力。

| 文章 | 内容 |
|------|------|
| [个人定位设计](business-delivery/personal-positioning-design.md) | AI 顾问/工程师的个人定位和差异化策略 |
| [产品包设计](business-delivery/product-package-design.md) | AI 服务的产品化包装：从单一服务到分层产品体系 |
| [报价与销售体系](business-delivery/pricing-and-sales-system.md) | AI 项目的定价方法、报价策略和销售流程 |
| [客户访谈与需求诊断](business-delivery/customer-interview-and-need-discovery.md) | 客户需求挖掘、问题诊断、方案匹配的方法 |
| [交付 SOP](business-delivery/delivery-sop.md) | AI 项目从启动到验收的标准化交付流程 |
| [内容获客系统](business-delivery/content-lead-generation-system.md) | 通过内容输出获取客户的方法和执行框架 |

### 综合项目实战

一个完整 AI 项目的全流程实践。

| 文章 | 内容 |
|------|------|
| [项目 PRD](projects/project-prd.md) | AI 项目的需求文档、功能定义和技术方案 |
| [项目后端开发](projects/project-backend-development.md) | 后端架构、API 设计、模型调用、RAG 集成 |
| [项目前端与报告页](projects/project-frontend-and-report-page.md) | 前端架构、报告页面设计、交互实现 |
| [项目 Agent 集成](projects/project-agent-integration.md) | Agent 工作流集成、工具调用、状态管理 |
| [项目测试与优化](projects/project-testing-and-optimization.md) | 功能测试、性能测试、质量优化 |
| [作品集与客户提案](projects/portfolio-and-client-proposal.md) | 项目成果的包装、演示材料、客户提案 |
| [项目验收与专家包装](projects/project-acceptance-and-expert-packaging.md) | 项目验收标准、交付物清单、专业形象包装 |

### 模型层补充

模型训练和微调的底层知识，适合需要深入理解模型能力的场景。

| 文章 | 内容 |
|------|------|
| [训练全景与模型进化路线](model-layer/training-landscape-and-model-evolution.md) | 模型训练的完整流程、主流模型的技术路线演进 |
| [SFT 与训练数据构造](model-layer/sft-and-training-data-construction.md) | 监督微调的方法和训练数据的构造策略 |
| [后训练、偏好对齐与 LoRA](model-layer/post-training-alignment-and-lora.md) | 面试高频的 RLHF、DPO、PPO、LoRA、QLoRA 关系和 Agent 场景选型 |

---

## 其他资源

- [AI / Agent 面试专题](interview/README.md) — 面向一线公司 AI / Agent 岗位，整理公开 JD、社区面经、高频考点、项目深挖和复习路线
- [面试题库](ai-face.md) — 覆盖基础概念、工程实践、架构设计、商业化的基础面试参考
- [脑图目录](./mind-maps/) — 各主题的 Excalidraw 思维导图
