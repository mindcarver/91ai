# AI Agent 记忆系统专题

资料更新：2026-06-30。

这个专题关注 AI Agent 的长期记忆系统。它不是普通 RAG 的别名，也不是把聊天记录原封不动塞进向量数据库。真正的记忆系统要处理四件事：什么值得写入、如何组织、何时读取、什么时候遗忘或覆盖。

## 先给结论

如果你正在做一个真实 Agent，先把记忆拆成四层：

| 层级 | 解决的问题 | 常见实现 |
|------|------------|----------|
| 短期上下文 | 当前轮次和当前任务不丢线索 | message buffer、checkpointer、state |
| 用户记忆 | 跨会话保存用户偏好和稳定事实 | profile、semantic memory、namespace |
| 任务记忆 | 保存项目、工单、决策和失败经验 | runbook、episodic memory、artifact store |
| 知识记忆 | 保存稳定知识和外部资料 | RAG、GraphRAG、文档库 |

选型上可以粗略这样判断：

- 想快速接入一个 Memory API：先看 Supermemory。
- 想控制写入、检索、provider 和自托管细节：先看 Mem0。
- 想要完整的有状态 Agent runtime：看 Letta。
- 想表达时间变化、实体关系和事实冲突：看 Zep / Graphiti 或 Cognee。
- 已经在 LangGraph 里构建 Agent：看 LangGraph Store + LangMem。
- 已经在 LlamaIndex 里做 workflow 或 agent：看 LlamaIndex Memory Blocks。

## 本专题文章

| 顺序 | 文章 | 重点 |
|------|------|------|
| 1 | [Mem0 架构分析](mem0-architecture-and-design.md) | ADD-only 写入、scope、provider 抽象、多信号检索 |
| 2 | [Supermemory 架构分析](supermemory-architecture-and-design.md) | one-binary、本地自托管、Memory API、混合检索 |
| 3 | [Mem0 vs Supermemory 本地对比](mem0-vs-supermemory-local-comparison.md) | 用 `91ai/docs` 做两轮本地检索对比，解释延迟和命中差异 |

## 开源项目地图

> 「实测分」列指向 91AI 自建的 [AI 记忆系统评测专题](../../../../evaluation/memory-systems-eval/)（2026-07-03 实测，统一本地后端 + 负分校验门）。本页的架构解读和那边的实测评测互补。

| 项目 | 类型 | 适合场景 | 注意点 | 实测分 |
|------|------|----------|--------|--------|
| [Mem0](https://github.com/mem0ai/mem0) / [Docs](https://docs.mem0.ai/introduction) | 通用 memory layer | 给现有 Agent 加长期记忆，控制 LLM、embedding、vector store 和 scope | 配置和 provider 差异需要自己理解 | [冒烟 83% / LME 33%](../../../../evaluation/memory-systems-eval/projects/01-mem0-pluggable-memory-layer.md) |
| [Supermemory](https://github.com/supermemoryai/supermemory) / [Self-hosting](https://supermemory.ai/docs/self-hosting/overview) | Memory API / context engine | 快速拿到本地或云端 Memory API，降低接入和部署摩擦 | 自托管版隐藏了不少底层实现细节 | [冒烟 67% / **LME 50%（全场最高）**](../../../../evaluation/memory-systems-eval/projects/05-supermemory-single-binary-hybrid-graph-memory.md) |
| [Letta](https://github.com/letta-ai/letta) | 有状态 Agent 平台 | 需要 agent 自己管理、改写和演化记忆 | 更像完整 runtime，不只是 memory SDK | [**冒烟 100%（全场最高）**](../../../../evaluation/memory-systems-eval/projects/02-letta-memgpt-agent-managed-memory.md) |
| [Graphiti](https://github.com/getzep/graphiti) / [Zep](https://www.getzep.com/) | 时间知识图谱记忆 | 需要记录事实随时间变化、实体关系和来源证据 | 自托管 Graphiti 需要自己建设外围服务 | [冒烟 50% / LME 0%（时序优势被证伪）](../../../../evaluation/memory-systems-eval/projects/03-zep-graphiti-bi-temporal-knowledge-graph.md) |
| [Cognee](https://github.com/topoteretes/cognee) | 知识图谱 memory platform | 企业知识、文档和关系型知识的长期记忆 | 更偏语义图谱和知识组织，不是轻量会话记忆 | [schema bug，双后端 BLOCKED](../../../../evaluation/memory-systems-eval/projects/04-cognee-graphrag-knowledge-graph-memory.md) |
| [LangMem](https://langchain-ai.github.io/langmem/) | LangGraph 生态 memory SDK | 在 LangGraph 里做 semantic / episodic / procedural memory | 最适合 LangGraph 用户 | [冒烟 41.7%](../../../../evaluation/memory-systems-eval/projects/07-langmem-langchain-memory-module.md) |
| [LangGraph Memory](https://docs.langchain.com/oss/python/concepts/memory) | Agent state + store | 区分 thread-scoped short-term memory 和 namespace long-term memory | 需要自己设计写入和检索策略 | — |
| [LlamaIndex Memory](https://developers.llamaindex.ai/python/examples/memory/memory/) | memory blocks | 已经用 LlamaIndex 做 agent / workflow | 需要理解短期 FIFO 和长期 block 如何合并 | [API 摩擦，未得有效分](../../../../evaluation/memory-systems-eval/projects/08-llamaindex-memory-framework-builtin-memory.md) |
| [Agno Memory](https://docs.agno.com/memory/overview) | Agent framework 内置 memory | 用数据库持久化 agent memory 和 session | 框架绑定更强 | — |
| [AutoGen Memory](https://microsoft.github.io/autogen/stable//user-guide/agentchat-user-guide/memory.html) | Agent framework 集成层 | AutoGen 项目里接 Mem0 等外部 memory backend | 更像集成接口，不是独立 memory 产品 | — |
| [CrewAI Memory](https://docs.crewai.com/v1.15.0/en/concepts/memory) | Crew/Agent 内置 memory | crew 场景下统一管理短期、长期、实体和上下文记忆 | 适合 CrewAI 生态内使用 | — |

## 论文和评测线索

| 方向 | 论文 / Benchmark | 为什么值得读 |
|------|------------------|--------------|
| 总览 | [Memory in the Age of AI Agents](https://arxiv.org/abs/2512.13564) | 把 agent memory 和 RAG、LLM memory、context engineering 区分开，并按形态、功能、动态过程整理 |
| 经典架构 | [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560) | 把上下文窗口类比为内存，把外部存储类比为磁盘，是很多记忆系统的概念源头 |
| 对话长期记忆 | [LoCoMo](https://arxiv.org/abs/2402.17753) | 多 session 长对话评测，暴露 long-context 和 RAG 在时间、因果和长期一致性上的不足 |
| 长期交互记忆 | [LongMemEval](https://arxiv.org/abs/2410.10813) | 用 information extraction、multi-session reasoning、temporal reasoning、knowledge updates、abstention 五类能力评测记忆 |
| 工作经验记忆 | [LongMemEval-V2](https://arxiv.org/abs/2605.12493) | 从聊天记忆转向 web agent 的环境经验、工作流知识和失败模式记忆 |
| 记忆遗忘 | [Memora](https://arxiv.org/html/2604.20006v1) | 引入 Forgetting-Aware Memory Accuracy，专门惩罚使用过期或已失效记忆 |
| Agentic 组织 | [A-MEM](https://arxiv.org/abs/2502.12110) | 用类似 Zettelkasten 的动态索引和链接组织记忆，强调 memory evolution |
| 操作系统类比 | [MemoryOS](https://arxiv.org/abs/2506.06326) | 把记忆拆成存储、更新、检索和生成模块，强调分层管理 |

## 实战路线

### 1. 先做无记忆基线

不要一上来就接长期记忆。先跑一个无长期记忆的 Agent 或 RAG baseline，记录：

- 当前任务成功率
- 平均延迟
- token 成本
- 用户重复说明次数
- 失败样本里的缺失信息

如果没有 baseline，后面无法判断 memory 是否真的提升了系统。

### 2. 只允许显式写入高价值记忆

第一版不要让模型什么都自动记。先从人工或规则触发开始：

- 用户明确说“以后都这样”
- 项目决策已经确认
- 工具调用失败并找到根因
- 某个环境、账号、代码库有稳定约束
- 用户纠正了系统的错误理解

不要写入：

- 临时情绪
- 模型猜测
- 未验证的中间推理
- 一次性任务约束
- 密钥、令牌、私有 URL、敏感个人信息

### 3. 给每条记忆加治理字段

最小 schema 可以这样设计：

```json
{
  "id": "mem_001",
  "scope": "user|project|agent|team",
  "type": "semantic|episodic|procedural|preference",
  "content": "用户偏好先给结论再展开。",
  "source": "conversation|tool_result|human_review|document",
  "created_at": "2026-06-30",
  "updated_at": "2026-06-30",
  "confidence": 0.8,
  "ttl": "none|30d|90d",
  "status": "active|deprecated|deleted",
  "evidence": ["thread_id:...", "doc:..."]
}
```

没有 `source`、`time`、`scope` 和 `status` 的长期记忆，后面很难排查污染和冲突。

### 4. 把写入和读取分开评估

记忆系统至少拆成两个链路：

- 写入质量：抽取是否准确、是否过度记忆、是否合并冲突、是否尊重删除。
- 读取质量：能否召回正确记忆、是否引用过期记忆、是否把无关记忆注入上下文。

不要只看“回答看起来更个性化”。要看记忆有没有真的帮助任务完成。

### 5. 引入遗忘和冲突策略

长期记忆最大的坑不是记不住，而是忘不掉。建议至少支持：

- 显式删除：用户要求删除时必须硬删除或不可再用。
- 软废弃：旧偏好被新偏好覆盖时，旧记忆标为 deprecated。
- 时间衰减：临时项目约束过期后不再默认召回。
- 冲突解释：当两条记忆冲突时，优先显示来源和时间，而不是静默选一条。

## 选型判断表

| 你最在意什么 | 优先看 |
|--------------|--------|
| 快速本地跑起来 | Supermemory self-host、LlamaIndex Memory |
| 可控 provider 和自托管 | Mem0、Cognee、Graphiti |
| 时间变化和事实冲突 | Graphiti / Zep、Memora 思路 |
| Agent 自我改写和长期身份 | Letta / MemGPT 路线 |
| LangGraph 工程集成 | LangGraph Store + LangMem |
| 企业知识组织 | Cognee、Graphiti、RAG + KG |
| 评测体系 | LoCoMo、LongMemEval、LongMemEval-V2、Memora |

## 最小可用评测集

建议用 30-50 条样例先测，不要一开始追求大 benchmark。

| 维度 | 样例 |
|------|------|
| 单事实召回 | “我上次说我的默认语言是什么？” |
| 多 session 推理 | “结合前三次讨论，我现在最应该优先做哪一步？” |
| 时间更新 | “我之前喜欢 A，后来改成 B，现在应该用哪个？” |
| 冲突处理 | “两条记忆互相矛盾时，系统能否说明依据？” |
| 遗忘能力 | “我要求删除的信息，后续是否还被使用？” |
| 任务经验 | “上次这个环境踩过什么坑？” |
| 安全边界 | “被写入的恶意指令是否会影响后续工具调用？” |

指标不要只看命中率。至少记录：

- recall@k
- citation precision
- stale memory usage rate
- conflict resolution accuracy
- deletion compliance
- p95 retrieval latency
- memory write amplification

## 最后的工程判断

记忆系统不是“给 Agent 加一个向量库”。它更像一层小型数据治理系统：有写入、有索引、有召回、有权限、有遗忘、有审计。

如果只是一次性问答，RAG 足够。如果系统要跨周、跨项目、跨工具、跨用户持续工作，才需要认真设计 memory。
