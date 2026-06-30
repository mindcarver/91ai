# 一线公司 AI / Agent 面试指南

资料更新：2026-06-30。

这篇面向百度、阿里、美团、腾讯、字节等一线互联网公司的 AI / Agent 相关岗位。重点不是罗列几百道题，而是把真实面试常见追问整理成可准备的能力地图。

公开 JD 和社区面经共同指向一个趋势：AI / Agent 面试已经从“会不会调大模型 API”转向“能不能把模型、检索、工具、记忆、评估、安全和业务场景做成系统”。

## 一、岗位到底在考什么

### 1. AI Agent 算法岗

这类岗位更像“Agent 能力优化 + 模型训练/对齐 + 评测”。公开 JD 里经常出现：

- Planning / Reasoning / Tool Use
- 长短期 Memory
- RAG 增强
- SFT、RL、DPO、PPO
- Agent runtime / framework
- 多 Agent 协作
- 自动化评估

对应面试问题：

1. ReAct 和 Plan-and-Execute 的区别是什么？
2. Agent 失败通常分哪几类？怎么评估任务成功率？
3. Tool Use 能力是靠 prompt、SFT 还是 RL 提升？
4. 为什么 SFT 后还要 RL 或 DPO？
5. 长期记忆如何避免污染？
6. 多 Agent 协作为什么可能更差？
7. 怎么设计一个 Agent benchmark？

### 2. AI 应用开发 / AI 后端岗

这类岗位更看重“能不能上线”。公开招聘和社区面经里常见：

- RAG 项目深挖
- Function Calling / MCP
- SSE / WebSocket 流式输出
- 工具调用失败重试
- 权限、幂等、安全
- 知识库热更新
- 成本和延迟优化

对应面试问题：

1. RAG 从文档到答案完整链路怎么设计？
2. 知识库更新时怎么不停服？
3. 工具调用失败、超时、部分成功怎么办？
4. Agent 调支付、发消息、删数据时怎么做权限控制？
5. Prompt injection 怎么防？
6. 怎么记录 trace，定位一次错误回答的根因？
7. p95 延迟太高时怎么优化？

### 3. 大模型算法岗

这类岗位更偏模型底层和训练。常见考点：

- Transformer 原理
- Attention / causal mask / KV cache
- SFT / RLHF / DPO / PPO
- LoRA / QLoRA
- 数据构造和质量控制
- 推理加速和量化
- 多模态输入和 token 化

对应面试问题：

1. Scaled dot-product attention 为什么要除以 `sqrt(d_k)`？
2. Decoder 为什么需要 causal mask？
3. KV cache 为什么能加速推理？代价是什么？
4. LoRA 的 rank、alpha 怎么影响效果？
5. SFT、RLHF、DPO 分别解决什么问题？
6. 为什么很多系统是 SFT then RL，而不是只做 RL？
7. 训练数据质量怎么评估？

## 二、高频题库

### Agent

**Q1：Agent 和 Workflow 的区别是什么？**

回答框架：

- Workflow 是预定义流程，确定性强，适合标准任务。
- Agent 是运行时决策，能根据观察结果调整计划，适合开放任务。
- 工程上不是二选一。生产系统常用 workflow 管住边界，用 agent 处理局部不确定性。
- 风险：Agent 更容易死循环、越权、成本失控，所以需要 step limit、预算、权限和 human-in-the-loop。

**Q2：ReAct 为什么有效？它的缺点是什么？**

回答框架：

- ReAct 把 reasoning 和 action 交替，让模型边观察边修正。
- 优点是简单、可解释、适合工具调用。
- 缺点是串行、慢、容易受错误 observation 影响，长任务会累积误差。
- 复杂任务可用 Plan-and-Execute、Reflection、LATS 或图式工作流补强。

**Q3：Agent 失败怎么处理？**

按失败类型回答：

- 规划失败：目标拆错，增加 planner review 或任务模板。
- 工具失败：超时、参数错、权限错，做 schema 校验、重试、降级。
- 记忆失败：召回错、过期、冲突，做 source/time/status 管理。
- 安全失败：越权或 prompt injection，做工具白名单、审批、隔离上下文。
- 停止失败：死循环，做最大步数、预算、重复动作检测。

**Q4：多 Agent 为什么不是越多越好？**

回答要点：

- 每个 Agent 都有独立上下文和调用成本。
- 协作会引入通信、对齐、冲突解决和结果汇总成本。
- 多 Agent 适合角色天然分工、信息可并行处理、输出可合并的任务。
- 对简单任务，单 Agent + 清晰 workflow 更稳。

### RAG

**Q5：RAG 的完整链路是什么？**

按离线和在线拆：

- 离线：解析、清洗、chunk、embedding、索引、元数据。
- 在线：query rewrite、召回、过滤、rerank、压缩、生成、引用验证。
- 生产：评估、监控、热更新、权限过滤、反馈回流。

**Q6：RAG 最难的地方是什么？**

不要只回答“chunk”。更完整的答案：

- 文档质量和结构解析决定上限。
- 检索召回决定有没有证据。
- rerank 和 compression 决定上下文质量。
- 生成阶段要避免把无关上下文编成答案。
- 评估阶段要区分 retrieval failure 和 generation failure。

**Q7：知识库怎么热更新？**

回答框架：

- 新旧索引并行：新索引构建完成后原子切换。
- 增量更新：按文档版本、hash、更新时间更新 chunk。
- 查询隔离：读路径不阻塞写路径。
- 回滚机制：保留旧索引版本。
- 观测指标：索引完成率、失败队列、召回覆盖率、延迟。

**Q8：怎么评估 RAG？**

至少分四层：

- 检索：recall@k、MRR、nDCG、context recall。
- 排序：rerank 前后命中率、citation precision。
- 生成：faithfulness、answer relevancy、groundedness。
- 生产：p95 latency、cost/query、empty retrieval rate、用户反馈。

### Function Calling / MCP

**Q9：Function Calling 的关键设计点是什么？**

回答要点：

- 工具 schema 要窄：参数明确、枚举清晰、不要给大而全工具。
- 工具描述要写能力边界，而不只是函数名。
- 参数要做服务端校验，不能信模型输出。
- 工具调用要有权限、幂等、超时、重试、审计。
- 高风险工具要 human-in-the-loop。

**Q10：MCP 解决什么问题？**

回答框架：

- MCP 把工具、资源、提示模板的暴露方式标准化。
- 让不同客户端能用统一协议发现和调用外部能力。
- 它解决的是“连接标准化”，不是自动解决权限、安全和质量。
- 真正上线仍要做工具白名单、最小权限、审计和隔离。

**Q11：工具调用失败怎么重试？**

按错误类型：

- 参数错误：把校验错误反馈给模型修正。
- 网络超时：指数退避 + jitter。
- 业务失败：不要盲目重试，先判断是否可重入。
- 部分成功：需要事务、补偿或人工确认。
- 高风险动作：默认不自动重试，防止重复扣款、重复发送、重复删除。

### Memory / Context

**Q12：记忆和 RAG 有什么区别？**

回答要点：

- RAG 主要检索外部知识，关注事实证据。
- Memory 保存跨会话偏好、状态、经验和决策。
- 记忆需要写入、更新、遗忘、冲突处理和权限治理。
- 向量检索可以作为 memory retrieval 的一部分，但不是完整 memory system。

**Q13：长期记忆怎么避免污染？**

回答框架：

- 写入前：只写高价值、已确认、可复用信息。
- 写入时：加 source、scope、time、confidence、ttl、status。
- 读取时：按任务相关性和时间过滤。
- 冲突时：新记忆不一定直接覆盖旧记忆，要保留证据。
- 删除时：用户要求删除必须不可再召回。

**Q14：长上下文模型来了，还需要记忆吗？**

回答要点：

- 长上下文解决容量，不解决相关性、成本、隐私、冲突和遗忘。
- 记忆系统的目标不是“放更多”，而是“放对、放少、可追溯”。
- 大窗口适合临时读取大量材料，长期记忆适合跨任务复用稳定信息。

### LLM Training / Evaluation

**Q15：SFT、RLHF、DPO 的区别？**

回答框架：

- SFT 学会按示范回答，提升格式、任务跟随和基础能力。
- RLHF 用 reward model 和 PPO 之类方法优化偏好，但流程复杂。
- DPO 直接用偏好对优化模型，不显式训练 reward model，工程上更简洁。
- Agent 场景里，SFT 常用于工具调用格式和轨迹模仿，RL/DPO 更偏提升成功率和偏好对齐。

**Q16：LoRA 参数怎么影响效果？**

回答要点：

- rank 决定可学习增量的容量，太低学不动，太高更贵也更易过拟合。
- alpha 控制 LoRA 增量缩放，太强可能破坏基座能力，太弱效果不明显。
- target modules 决定改哪些层，常见是 attention 和 MLP 相关线性层。
- 需要用验证集、任务指标和人工样本一起判断。

**Q17：Agent 评测怎么做？**

分层回答：

- 任务结果：success rate、pass@k、人工验收。
- 轨迹质量：步数、无效工具调用、重复动作、错误恢复。
- 成本延迟：tokens、tool calls、wall time、p95。
- 安全：越权调用率、敏感信息泄露、prompt injection 通过率。
- 稳定性：同一任务多次运行方差。

## 三、项目深挖准备模板

面试前把你的项目按这个结构写一页。

```text
项目背景：
  用户是谁，业务问题是什么，为什么不用普通搜索/规则系统。

系统架构：
  输入 -> RAG/Agent/Workflow -> 工具/数据库 -> 输出。

关键技术：
  文档解析、chunk、embedding、rerank、tool calling、memory、eval。

难点和取舍：
  选型 A vs B，为什么这么做，放弃了什么。

指标：
  准确率、召回率、成功率、延迟、成本、人工反馈。

故障案例：
  一次失败如何定位，最后怎么修。

安全边界：
  权限、审计、敏感信息、人工审核。
```

如果讲不出指标，就讲“我会怎么补指标”。但不要假装已有数据。

## 四、公司风格准备

### 百度

公开 JD 对 Agent 的表述比较完整：感知-决策-执行闭环、多智能体、长期记忆、ReAct、AutoGPT、CoT、RAG 与 Agent 融合、Agent 评测。

准备重点：

- Agent 架构设计。
- 搜索、文库、办公等场景里的 RAG + Agent。
- 长期记忆和评测体系。
- 代码生成、工具调用和反思机制。

### 阿里

公开 JD 更强调算法和训练：Agent 生命周期、SFT/RL、Planning、多步推理、RAG、工具调用、数据问答、自动化评估。

准备重点：

- Transformer / SFT / RLHF / DPO / PPO。
- Agent 能力如何通过训练提升。
- Qwen / Llama / DeepSeek 等模型二次开发经验。
- Paper -> Code -> Solution 的转化能力。

### 美团

公开 JD 和社区面经都更贴近业务落地：生成式搜索、交互式对话、Agent、RAG、领域模型调优、生活服务场景。

准备重点：

- 搜索推荐 + RAG 的结合。
- 业务场景里的指标：转化、召回、点击、满意度、延迟。
- 领域知识库更新和数据质量。
- 工程稳定性和线上效果。

### 腾讯 / 字节等

社区面经里常见项目深挖、工具调用、RAG 优化、Agent 系统设计、后端基础和算法题混合考。

准备重点：

- 项目能不能讲到工程细节。
- 工具调用和权限边界。
- Redis、并发、网络、后端基础。
- 基础算法题不要完全丢。

## 五、面试前自测清单

能稳定回答下面 20 个问题，基本不会在 AI / Agent 方向露怯。

1. 你的项目为什么需要大模型？
2. 为什么是 RAG，不是微调？
3. chunk 怎么切，怎么评估切得好不好？
4. embedding 模型怎么选？
5. 为什么需要 rerank？
6. RAG 幻觉怎么定位？
7. Agent 和 workflow 的边界在哪里？
8. ReAct 的优缺点是什么？
9. tool schema 怎么设计？
10. 工具调用失败怎么恢复？
11. 高风险工具怎么做审批？
12. memory 写入规则是什么？
13. 长期记忆怎么删除和过期？
14. 多 Agent 什么时候值得用？
15. 怎么评估 Agent 成功率？
16. SFT、RLHF、DPO 分别解决什么问题？
17. LoRA rank / alpha 怎么选？
18. KV cache 的作用和代价是什么？
19. 线上 p95 延迟高怎么优化？
20. prompt injection 怎么防？

## 六、最后的准备建议

一线公司面试最怕两种答案：

- 只会讲概念，不会讲工程。
- 只会讲项目流程，不懂底层原理。

最稳的策略是准备一个“可深挖项目”，再用基础题库补齐底层原理。面试官追问 RAG，就能从 chunk 讲到 rerank 和评估；追问 Agent，就能从 ReAct 讲到 tool retry、memory、权限和 trace；追问模型训练，就能从 SFT 讲到 DPO、LoRA 和数据质量。

真正有竞争力的候选人，不是“知道很多名词”，而是能解释每个模块为什么存在、怎么失败、怎么评估、怎么上线。
