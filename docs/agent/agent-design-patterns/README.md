# 智能体设计模式

面向正在设计 Agent 系统的工程师，从基础工作流到生产级工程化的关键设计模式。前五篇覆盖 Agent 的目标边界、工作流结构、工具接入、记忆协作、安全评估等系统能力；第六至十九篇按工程问题解析常见的智能体架构模式。

每个模式按三个问题理解：它解决什么失控点？它会引入什么新复杂度？什么时候应该用，什么时候不该用？

> 想先看作者怎么组织这组文章的，读 [阅读说明](./00-reading-guide.md)。

## 基础篇

| 篇 | 标题 | 概括 |
| --- | --- | --- |
| 01 | [从概念到落地：智能体全景图](./01-agent-overview-concept-to-production.md) | 界定 Agent 和普通 LLM 调用的差别，以及从想法到可上线 Agent 的完整检查清单 |
| 02 | [工作流骨架：提示链、路由、并行与规划](./02-workflow-skeleton-prompt-chaining-routing-parallel-planning.md) | 最小可控 Agent 的骨架模式，以及如何组合使用 |
| 03 | [接入外部世界：工具、MCP 与知识检索](./03-external-world-tools-mcp-knowledge-retrieval.md) | Agent 如何通过工具、协议和知识检索接触外部世界 |
| 04 | [认知与协作：记忆、反思与多智能体](./04-memory-reflection-multi-agent.md) | Agent 如何跨轮次改进，以及什么时候拆分角色、怎么避免协作失控 |
| 05 | [工程化：可靠性、安全、资源与评估](./05-engineering-reliability-security-resources-eval.md) | 把 demo 变成可运营系统需要的护栏、异常处理、资源管理和评估体系 |

## 设计模式篇

经典智能体架构模式，按工程问题分组。

| 篇 | 标题 | 概括 |
| --- | --- | --- |
| 06 | [ReAct：推理与行动的循环](./06-react-reasoning-action-loop.md) | 单步推理 — Thought→Action→Observation 交替推理 |
| 07 | [Plan and Solve：先规划再执行](./07-plan-and-solve-plan-then-execute.md) | 单步推理 — Planner→Executor→Replanner 架构 |
| 08 | [并行规划：REWOO 与 LLMCompiler](./08-parallel-planning-rewoo-llmcompiler.md) | 并行规划 — 占位符和 DAG 两种并行执行方式 |
| 09 | [反思与搜索：Basic Reflection、Reflexion、LATS](./09-reflection-search-basic-reflexion-lats.md) | 反思改进 — 从单轮批改到记忆复用和多路径搜索 |
| 10 | [元认知：Self-Discover 与 Storm](./10-metacognition-self-discover-storm.md) | 元认知 — 先决定怎么思考，再执行推理或长文生成 |
| 11 | [搜索与树：Tree of Thoughts 与 Graph of Thoughts](./11-tree-of-thoughts-graph-of-thoughts.md) | 搜索与树 — 多路径探索与路径合并 |
| 12 | [自问与代码：Self-Ask 与 CodeAct](./12-self-ask-codeact.md) | 分解与精确 — 复合问题分解与代码驱动的动作 |
| 13 | [协作与对抗：Swarm/Handoff 与 Debate](./13-swarm-handoff-debate.md) | 协作与对抗 — 轻量级多 Agent 路由与多视角碰撞 |
| 14 | [组合与上下文：Agents-as-Tools 与 Context Engineering](./14-agents-as-tools-context-engineering.md) | 组合与上下文 — Agent 作为工具嵌套调用与上下文窗口管理 |
| 15 | [经典架构参考：BDI、SOAR、ACT-R 与包容架构](./15-classic-arch-bdi-soar-act-r-subsumption.md) | 经典架构 — 来自认知科学和经典 AI 的设计遗产 |
| 16 | [反模式：智能体设计的七个坑](./16-anti-patterns-seven-pitfalls.md) | 反模式 — God Agent、无限循环、工具爆炸等常见陷阱 |
| 17 | [评估与精炼：Evaluator-Optimizer 与 Iterative Refinement](./17-evaluator-optimizer-iterative-refinement.md) | 评估精炼 — 生成-评估循环与多轮自我改进 |
| 18 | [角色化协作：Crew 模式](./18-crew-role-based-collaboration.md) | 角色化协作 — 用角色定义驱动多 Agent 团队行为 |
| 19 | [深度调研：Deep Research 与自适应网络](./19-deep-research-adaptive-network.md) | 深度调研 — 多轮搜索-综合循环与动态 Agent 组网 |

## 阅读建议

- 刚接触 Agent 工程：先读 01-05 基础篇，建立目标边界、工作流、工具、记忆、安全评估的整体框架。
- 要选架构模式：直接跳到 06-19，按"它解决什么失控点"对照自己的问题。
- 准备落地：务必读 05 工程化和 16 反模式，前者管"能不能上线"，后者管"会不会翻车"。
