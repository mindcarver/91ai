# AI / Agent 面试专题

资料更新：2026-06-30。

这个专题面向 AI 应用开发、AI Agent 工程、大模型应用算法、大模型后端和 RAG 工程岗位。它不是单纯背题库，而是把一线公司公开 JD、社区面经和本仓库已有学习路线整理成一套可复习、可自测、可讲项目的面试准备框架。

> 说明：公司考点来自公开招聘页面和社区面经归纳，不代表任何公司的官方题库。社区面经只能当趋势信号，不能当确定题库。

## 先看这几篇

| 顺序 | 文章 | 用途 |
|------|------|------|
| 1 | [一线公司 AI / Agent 面试指南](frontline-ai-agent-interview-guide.md) | 从百度、阿里、美团等公开 JD 和面经里提炼岗位能力、考点和回答框架 |
| 2 | [AI 应用开发面试题库](../ai-face.md) | 现有基础题库，覆盖 LLM、Prompt、结构化输出、RAG、Agent、工程化 |
| 3 | [上下文与记忆系统设计](../agent-workflow/context-and-memory-system-design.md) | Agent 面试里很容易被追问的 memory / context engineering |
| 4 | [AI Agent 记忆系统专题](../rag/memory-systems/README.md) | Mem0、Supermemory、Letta、Graphiti、LangMem 等长期记忆系统 |
| 5 | [RAG 评估与微调](../rag/rag-eval-and-finetuning.md) | RAG 面试里最能拉开差距的评估、反事实测试和生产监控 |

## 一线公司考点画像

从公开 JD 和社区面经看，AI / Agent 岗位正在分成三类。

| 岗位类型 | 高频能力 | 常见追问 |
|----------|----------|----------|
| AI Agent 算法 / 应用算法 | Planning、Tool Use、RAG、Memory、SFT/RL、Agent 评测 | Agent 为什么会失败？怎么提升任务成功率？SFT 和 RL 分别优化什么？ |
| AI 应用开发 / 后端 | RAG 工程、Function Calling、MCP、流式输出、任务编排、权限、安全 | 工具失败怎么重试？知识库怎么热更新？怎么防 prompt injection？ |
| 大模型算法 / 多模态算法 | Transformer、SFT、RLHF/DPO/PPO、数据构造、推理优化、多模态输入 | 为什么 decoder 要 causal mask？LoRA 参数怎么选？图片 token 怎么算？ |

## 公司线索

| 公司 / 来源 | 公开信号 | 对复习的启发 |
|-------------|----------|--------------|
| [百度 AIDU 大模型 / Agent 岗](https://talent.baidu.com/jobs/list) | JD 明确提到 Agent 设计、多智能体协作、长期记忆、ReAct、AutoGPT、CoT、RAG 与 Agent 融合、Agent 评测 | 不只会讲 RAG，还要会讲 agent loop、记忆、评测和产品落地 |
| [阿里 AI Agent 算法工程师](https://campus-talent.alibaba.com/campus/position/199903900038) | JD 强调 Agent 生命周期、SFT/RL、Planning、多步推理、RAG、工具调用、自动化评估 | 算法岗会把 Agent 工程和 post-training 一起问 |
| [阿里 算法工程师-AI Agent](https://campus-talent.alibaba.com/campus/position/199903260012) | JD 提到 Planning、Reasoning、Tool Use、Memory、RAG、DPO/PPO、多 Agent 和 runtime | 需要准备 Agent 模块拆解，以及训练/对齐如何提升执行成功率 |
| [美团大模型应用算法工程师](https://zhaopin.meituan.com/web/position/detail?highlightType=campus&jobUnionId=4215619700) | JD 提到生成式搜索、交互式对话、Agent、RAG、领域模型调优、生活服务场景落地 | 更偏“业务场景 + 搜索推荐 + RAG/Agent 落地”组合题 |
| [牛客大模型 / Agent 面经汇总](https://www.nowcoder.com/discuss/878600528970735616) | 社区面经提到多 Agent 编排、失败重试、金融安全、RAG 知识库热更新、算法题 | 面试很可能围绕项目深挖，而不是只背概念 |
| [Datawhale LLM / VLM / Agent 面试问题总结](https://github.com/datawhalechina/hello-agents/blob/main/Extra-Chapter/Extra01-%E9%9D%A2%E8%AF%95%E9%97%AE%E9%A2%98%E6%80%BB%E7%BB%93.md) | 覆盖 LLM、VLM、RLHF、Agent、RAG、评测 | 适合做查漏补缺清单 |
| [大厂大模型算法岗常考题汇总](https://github.com/yang19527/AwesomeInterview) | 汇总腾讯、美团、阿里等大模型算法岗面经 | 适合观察算法岗的 Transformer、SFT/RL、RAG 追问密度 |

## 准备优先级

### 第一优先级：项目能被深挖

你至少要准备一个可讲清楚的 AI 项目。最好包含：

- RAG：文档解析、chunk、embedding、hybrid search、rerank、citation、评估。
- Agent：planning、tool calling、memory、retry、human-in-the-loop、权限控制。
- 工程：流式输出、异步任务、日志、trace、成本、缓存、降级。
- 安全：prompt injection、工具权限、数据隔离、敏感信息处理。

面试官通常不会停在“你用了 LangChain 吗”。真正的追问是：

- 为什么这么切 chunk？
- Rerank 前后指标提升多少？
- 工具调用失败后怎么恢复？
- Agent 死循环怎么发现和停止？
- 知识库更新时线上查询会不会受影响？
- 用户要求删除记忆时系统怎么处理？

### 第二优先级：基础原理不能露怯

至少能讲清楚：

- Transformer：self-attention、causal mask、KV cache、位置编码。
- LLM 训练：pretrain、SFT、RLHF、DPO/PPO、LoRA。
- RAG：召回、排序、生成、引用、评估、反事实测试。
- Agent：ReAct、Plan-and-Execute、Reflection、Memory、Multi-Agent。
- 工具调用：Function Calling、Schema、MCP、权限、重试和幂等。

### 第三优先级：系统设计要像上线过

一线公司很看重“你是不是只做过 demo”。准备时要能回答：

- 怎么评估任务成功率？
- 怎么观测每次模型调用、检索结果和工具调用？
- 怎么做灰度、回滚、限流和降级？
- 怎么控制 token 成本和 p95 延迟？
- 怎么做权限隔离和审计？

## 复习路线

### 3 天速成

适合已经有 AI 项目，只需要面试前整理表达。

1. 第 1 天：复盘项目，画出 RAG / Agent / 工程架构图。
2. 第 2 天：刷 [AI 应用开发面试题库](../ai-face.md)，补 LLM、RAG、Agent 基础。
3. 第 3 天：按 [一线公司 AI / Agent 面试指南](frontline-ai-agent-interview-guide.md) 做 2 轮模拟面试。

### 7 天强化

适合有后端或算法基础，但 AI 项目不够扎实。

1. 第 1 天：LLM、Prompt、结构化输出。
2. 第 2 天：RAG 全链路和评估。
3. 第 3 天：Agent loop、tool calling、memory。
4. 第 4 天：Function Calling、MCP、权限和安全。
5. 第 5 天：SFT、RLHF/DPO、LoRA、模型评测。
6. 第 6 天：系统设计、成本、延迟、可观测性。
7. 第 7 天：项目模拟面 + 算法题。

### 30 天系统准备

适合准备校招、实习或转岗。

- 第 1 周：基础原理和题库。
- 第 2 周：做一个 RAG 项目，并补评估脚本。
- 第 3 周：把 RAG 升级成 Agent，加入工具、记忆和权限。
- 第 4 周：复盘项目、写简历、做模拟面试和算法题。

## 回答标准

好的回答不是背定义，而是有结构：

```text
先定义：这个东西解决什么问题。
再拆解：核心模块和链路是什么。
讲取舍：为什么不用另一个方案。
给指标：怎么评估是否有效。
讲故障：失败时怎么发现、恢复、降级。
落项目：我在项目里怎么做，结果如何。
```

如果回答 RAG，只说“检索增强生成”不够；如果回答 Agent，只说“LLM + Tools”不够；如果回答微调，只说“SFT 是监督微调”也不够。面试官真正想听的是你能不能把概念落成可运行、可评估、可维护的系统。
