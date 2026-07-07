# Multi-Agent 架构

**TL;DR:** Multi-Agent 解决的是"复杂任务中不同能力、上下文、责任混在一个 Agent 里会失控"。2025 年的共识：能用 Workflow 就不上 Agent，能用单 Agent 就不上 Multi-Agent。多 Agent 带来通信成本、调度复杂度、结果冲突和 Token 增加。只有当任务确实需要多个专业视角且有清晰边界时才值得引入。

## Multi-Agent 的价值

Multi-Agent 不是把一个 Agent 拆成很多个名字，也不是为了显得系统更高级。它解决的是：**复杂任务中，不同能力、不同上下文、不同责任边界混在一个 Agent 里会变得不可控。**

单 Agent 的问题通常出在三个地方：

**职责过多。** 一个 Agent 同时做行业研究、岗位分析、方案设计、风险审查、文档写作。Prompt 越来越长，工具越来越多，判断标准互相干扰。

**上下文过重。** 复杂任务执行几十步后，历史信息、工具结果、中间结论、失败尝试都塞在同一个上下文里。模型很难分清什么是当前步骤真正需要的信号。

**责任不清。** 最终报告出错时，很难判断是哪类能力出了问题——资料收集不准？方案排序不合理？风险审查漏了关键点？

Multi-Agent 把这些混在一起的东西拆开：

- 不同 Agent 承担不同职责
- 每个 Agent 只看自己需要的上下文
- 每个 Agent 只拿自己需要的工具
- 每个 Agent 的输出可以单独检查

但 Multi-Agent 不是免费午餐。它带来通信成本、调度复杂度、结果冲突、Token 增加和更难的调试。

核心原则：

> 能用 Workflow 解决的，不要上 Agent；能用单 Agent 解决的，不要上 Multi-Agent。

## 什么时候需要 Multi-Agent

用四个问题判断：

**任务是否天然分工？** 企业 AI 诊断天然包含行业研究、流程分析、技术方案、风险审查。在真实团队里也是不同专家承担，拆成多个 Agent 有意义。

**各子任务是否需要不同工具？** 行业研究需要搜索和资料库，代码修复需要文件系统和测试命令，风险审查需要规则库。所有子任务用同一套工具 → 拆分价值降低。

**各子任务是否可以独立验收？** 每个 Agent 都能产出清晰中间结果（行业概览、岗位清单、风险清单）→ 适合拆分。输出高度耦合 → 拆开反而麻烦。

**上下文是否已经影响质量？** 单 Agent 上下文越来越长、指令越来越杂、工具选择越来越不稳定 → 拆分能降低每个调用的认知负担。

四个问题多数"是" → Multi-Agent 有架构价值。

## Orchestrator：主控 Agent

Multi-Agent 系统通常需要一个主控 Agent（Orchestrator）。它不是最懂业务的专家，是流程协调者。

四个职责：

**任务分解。** 把用户请求拆成子任务并选择合适的专家 Agent。

**依赖调度。** 决定哪些任务并行，哪些串行。行业概览和资料收集可以并行；AI 场景设计必须等待前面的结果。

**结果检查。** 检查每个 Agent 输出是否完整、符合结构、有无明显缺口。不一定做深度专业判断，但要做流程质量把关。

**整合交付。** 把多个 Agent 结果合成连贯输出，处理冲突、重复和风格不一致。

常见错误：让 Orchestrator 亲自做大量专业分析。这样它变成"一个大 Agent 加几个小助手"，又回到了职责混乱。Orchestrator 应保持管理者角色：分解、调度、校验、整合。

## 两种编排范式

### Manager 模式（中央调度）

中央 Agent 负责任务分解、分配、聚合。Worker Agent 只与 Manager 通信。

```
用户 → Manager → Worker 1
                → Worker 2
                → Worker 3
                → 汇总结果 → 用户
```

优势：集中控制、上下文一致、易于监控。
劣势：Manager 成为瓶颈、单点故障风险。

OpenAI Agents SDK 的 Manager 模式是典型实现。

### Handoffs 模式（对等转移）

Agent 间直接转交任务，附带上下文。类似客服转接——每个 Agent 都是专家。

```
用户 → Agent A（客服）→ Handoff → Agent B（技术支持）→ Handoff → Agent C（专家）
```

优势：无瓶颈、专家化、延迟低。
劣势：上下文可能丢失、难以全局监控。

OpenAI Agents SDK 的 Handoffs 机制是典型实现。CrewAI 的 delegation 也类似。

### 对比

| 维度 | Manager 模式 | Handoffs 模式 |
|------|-------------|---------------|
| 控制力 | 强（中央决策） | 弱（分散决策） |
| 瓶颈 | Manager 是瓶颈 | 无瓶颈 |
| 上下文 | 集中维护 | 转交时可能丢失 |
| 监控 | 容易 | 困难 |
| 适用 | 复杂依赖任务 | 专家转接场景 |

企业级系统通常用"Manager + 共享工作区"混合模式。关键任务由 Manager 分发和收敛，中间产物写入共享工作区。

## 专家 Agent 设计

最重要的不是取专业名字，而是定义清楚三件事：**职责、输入、输出。**

一个好的专家 Agent：

- 只负责一个明确领域
- 只接收完成任务所需的上下文
- 只拥有必要工具
- 输出格式稳定
- 能被独立评价

以行业研究 Agent 为例：职责是生成行业概览，不负责推荐 AI 方案。输入是行业名称、地区、时间范围、用途。输出是产业链结构、主要玩家、市场数据、趋势、来源。工具是公开搜索和知识库查询——不需要邮件、文件删除、代码执行。

边界不清导致两个问题：**重复劳动**和**结论冲突**。行业研究 Agent 已经在推荐 AI 方案，AI 方案 Agent 又重新做一遍行业判断，最终两边给出不同优先级。

## 通信模式

### 三种基础模式

**中心化通信。** 所有消息经过 Orchestrator，专家不直接互相对话。信息流清楚、易审计、易调度，但 Orchestrator 压力大。

**点对点通信。** Agent 直接互相询问。灵活高效，但信息流分散，容易出现 Orchestrator 不知道的隐式决策。

**共享工作区。** 所有 Agent 把结果写入共享状态或文档，按需读取。减少消息传递，适合文档型任务，但需要严格版本控制和权限边界。

### 通信协议

无论哪种模式，消息不能只是一段自由文本。至少包含：

```json
{
  "type": "task_result",
  "sender": "industry_research_agent",
  "receiver": "orchestrator",
  "task_id": "task_001",
  "input_version": "v2.1",
  "output": { ... },
  "confidence": 0.85,
  "risk_flags": [],
  "timestamp": "2025-06-15T10:30:00Z"
}
```

结构化通信的目的不是形式好看，是让系统能追踪、复现和审计。

## 协作模式

五种常见协作模式：

**流水线。** A → B → C → D，输出作为下一步输入。适合强依赖任务。LangGraph 的状态图天然支持。

**并行专家。** 多个 Agent 同时从不同角度分析同一问题，再由 Orchestrator 汇总。适合需要多视角判断的任务。

**评审。** 一个 Agent 产出，另一个专门审查。适合高风险输出。OpenAI 的 Input/Output Guardrails 是这类模式的框架级支持。

**辩论/仲裁。** 多个 Agent 对同一问题给出不同观点，通过证据比较或人工仲裁得出结论。适合不确定性高的决策，但成本高，不适合日常简单任务。

**层级委派。** 多层编排，每层有独立 Manager。适合企业级复杂流程。

选模式看任务形状。很多业务流程只需要流水线加关键节点评审，不要为了"多 Agent"强行让 Agent 互相辩论。

## 冲突解决

多个 Agent 输出冲突是正常现象。行业研究 Agent 说市场规模 5000 亿，方案 Agent 引用 8000 亿。

四层解决：

**来源优先级。** 更权威、更近、更贴近任务范围的来源优先。客户内部数据 > 公开网页；最新年报 > 旧新闻稿。

**角色优先级。** 某些 Agent 对某类问题有更高裁决权。风险审查 Agent 对安全风险有否决权，但不应该裁决市场规模。

**证据比较。** 要求冲突双方给出来源、时间、口径和推理过程，比较差异来自哪里。

**人工仲裁。** 冲突影响关键结论且系统无法自动判定 → 暂停交给人。

冲突不一定要完全消除。有时更好的做法是把冲突呈现出来：不同来源口径不同，结论置信度降低，建议后续核实。这比强行给出一个确定数字更诚实。

## 结果整合

整合不是复制粘贴到一起。至少做五件事：

1. **去重**：多个 Agent 可能重复解释同一背景
2. **对齐术语**：同一概念不要一会儿叫"工艺优化"一会儿叫"制程调参"
3. **补齐逻辑链**：行业背景、业务痛点、AI 场景、落地风险之间要能连起来
4. **标注不确定性**：哪些结论来自强证据，哪些只是推断
5. **统一交付风格**：专家输出可以各有风格，但最终报告要像一个人写的

## 主流框架对比（2025-2026）

| 维度 | LangGraph v1 | OpenAI Agents SDK | Anthropic Agent SDK | CrewAI | AutoGen v0.4 |
|------|-------------|-------------------|---------------------|--------|-------------|
| 核心抽象 | 状态图 + 节点 + 边 | Agent + Handoff + Guardrail | Agent + Tool + Hook | Role + Goal + Backstory | RoutedAgent + Runtime |
| 编排方式 | 显式状态图 | Manager/Handoffs | 父子 Agent | 流程编排 | 对话驱动 |
| 状态管理 | 内置检查点 | Pydantic 结构化 | Session 持久化 | 简单共享 | 对话历史 |
| 人机协作 | interrupt + Command | Input Guardrail | AskUserQuestion | Human input | Human-in-loop |
| 适合场景 | 复杂编排、持久化 | 快速生产部署 | 代码密集任务 | 快速原型 | 跨进程协调 |
| 学习曲线 | 陡峭 | 低 | 中等 | 平缓 | 中等 |

**选型原则：** 基于场景选框架，不是基于热度。

```
需要多 Agent？
├─ 否 → 单 Agent + 工具
│         ├─ 工具 < 20 → 原生 Tool Use
│         └─ 工具 > 100 → MCP + tool_search
├─ 是 → 任务类型？
          ├─ 固定流程 → LangGraph 状态图
          ├─ 专家转接 → OpenAI Agents SDK Handoffs
          ├─ 快速原型 → CrewAI
          ├─ 研究讨论 → AutoGen GroupChat
          └─ 代码密集 → Anthropic Agent SDK
```

## 典型架构示例

以"企业 AI 应用机会诊断"为例：

| Agent | 职责 | 工具 |
|-------|------|------|
| Orchestrator | 拆解任务、调度依赖、检查输出、整合报告 | 全局视图 |
| Industry Research | 产业链、市场、趋势、主要玩家 | 搜索、知识库 |
| Business Process | 关键业务流程、瓶颈、人工密集环节 | 搜索、文档分析 |
| Role Analyst | 岗位任务、高频重复工作 | 搜索、文档分析 |
| AI Solution | 业务痛点 → AI 场景、方案、集成方式 | 前三份结果 |
| Risk Review | 数据安全、合规、组织落地风险 | 规则库、审计清单 |
| Report Writer | 结构化结果 → 面向客户报告 | 写作工具 |

执行顺序：

```
1. Orchestrator 明确任务边界
2. Industry Research、Business Process、Role Analyst 并行
3. Orchestrator 检查三份中间结果
4. AI Solution 基于前三份结果生成场景
5. Risk Review 审查方案
6. Report Writer 生成报告
7. Orchestrator 做最终一致性检查
```

重点不是"有 7 个 Agent"，而是每个 Agent 的边界、输入、输出和验收标准都清楚。

## Multi-Agent 检查清单

- [ ] 是否真的需要多个 Agent，而不是一个 Workflow？
- [ ] 每个 Agent 的职责是否互斥？
- [ ] 每个 Agent 的输入输出是否结构化？
- [ ] Agent 之间是否有清晰依赖关系？
- [ ] 是否定义了通信协议？
- [ ] 是否有冲突解决机制？
- [ ] 是否有中间结果验收标准？
- [ ] 是否能追踪每个结论来自哪个 Agent？
- [ ] 是否限制了每个 Agent 的工具权限？
- [ ] 是否有失败、超时、重试和人工接管机制？

Multi-Agent 的成熟标志不是 Agent 数量多，而是系统在复杂协作下仍然可解释、可审计、可控制。

## 延伸阅读

- Anthropic: [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) — Orchestrator-Workers 模式
- OpenAI: [Agents SDK](https://openai.github.io/openai-agents-python/) — Handoffs 和 Guardrails
- LangGraph: [Multi-Agent Patterns](https://langchain-ai.github.io/langgraph/tutorials/multi_agent/) — 状态图编排
- CrewAI: [Agent Concepts](https://docs.crewai.com/concepts/agents) — Role/Goal/Backstory 模型
- AutoGen: [Agent Runtime](https://microsoft.github.io/autogen/) — 分布式 Agent 架构
- Galileo: [Agent Failure Modes](https://galileo.ai/blog/agent-failure-modes-guide) — 多 Agent 通信故障分类
