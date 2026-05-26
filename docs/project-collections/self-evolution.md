# AI 自进化

自进化框架、自改进 Agent、递归优化、经验学习和多智能体协同进化项目与论文。

数量：52

## Awesome 列表与综述资源

| 名称 | 概括 | 标签 | 链接 |
| --- | --- | --- | --- |
| Awesome-Self-Evolving-Agents (EvoAgentX) - 自进化 Agent 综合资源列表，含论文、框架、工具分类 | 自进化 Agent 领域最全的 Awesome 列表，按进化树结构组织，覆盖 2023-2025 年代表性方法 | awesome-list, survey, self-evolving | [打开](https://github.com/EvoAgentX/Awesome-Self-Evolving-Agents) |
| Awesome-Self-Evolving-Agents (XMUDeepLIT) - 厦门大学团队的自进化 Agent 综述配套资源 | 厦门大学团队的综述配套仓库，包含论文、基准测试和开源项目的精选列表 | awesome-list, survey, self-evolving | [打开](https://github.com/XMUDeepLIT/Awesome-Self-Evolving-Agents) |
| Self-Evolving-Agents (CharlesQ9) - 自进化 Agent 论文追踪，含推理经济方向 | 自进化 Agent 相关论文的持续追踪仓库，包含推理经济方向的最新研究 | awesome-list, papers, reasoning | [打开](https://github.com/CharlesQ9/Self-Evolving-Agents) |
| ai-agent-papers - AI Agent 论文双周刊，含自进化方向 | 持续更新的 AI Agent 论文集，每周通过 ArXiv 搜索追踪最新研究进展 | papers, survey, agent | [打开](https://github.com/masamasa59/ai-agent-papers) |

## 自进化框架与平台

| 名称 | 概括 | 标签 | 链接 |
| --- | --- | --- | --- |
| EvoAgentX - 首个自进化 AI Agent 框架，自动化构建、评估和进化 LLM Agent 工作流 | 首个自进化 AI Agent 框架。五层模块化架构（基础组件/Agent/工作流/进化/评估），自动优化多 Agent 工作流 | framework, agent, self-evolving | [打开](https://github.com/EvoAgentX/EvoAgentX) |
| AgentEvolver (modelscope) - 高效自进化 Agent 系统，阿里达摩院出品 | 面向高效自进化 Agent 系统的开源框架，结合强化学习实现 Agent 自主进化 | agent, self-evolving, reinforcement-learning | [打开](https://github.com/modelscope/AgentEvolver) |
| GenericAgent - 自进化 Agent 框架，从 3.3K 行种子代码长出技能树 | 自进化 Agent 框架，从少量种子代码自动生成技能树，以 6 倍更少的 token 消耗实现全系统控制 | framework, agent, self-evolving | [打开](https://github.com/lsdefine/GenericAgent) |
| MemOS - 面向 LLM 和 AI Agent 的自进化记忆操作系统 | 自进化记忆操作系统，提供超持久记忆、混合检索和跨任务技能复用，节省 35.24% token | agent, memory, self-evolving | [打开](https://github.com/MemTensor/MemOS) |
| phantom - 自进化 AI 协作者，基于 Claude Agent SDK 构建 | 自进化 AI 协作者，具备持久记忆、MCP 服务器和安全凭据收集能力，基于 Claude Agent SDK | agent, self-evolving, claude | [打开](https://github.com/ghostwright/phantom) |
| lemonai - 首个全栈开源自进化通用 AI Agent | 首个全栈开源自进化通用 AI Agent，提供 Manus 和 Genspark AI 的本地替代方案 | agent, self-evolving, fullstack | [打开](https://github.com/hexdocom/lemonai) |
| EverOS - 构建和评估自进化 Agent 的长期记忆系统 | 构建和评估自进化 Agent 长期记忆的系统平台 | agent, memory, self-evolving | [打开](https://github.com/EverMind-AI/EverOS) |
| aiwaves-cn/agents - 数据驱动的自进化自主语言 Agent 框架 | 开源的数据驱动自进化自主语言 Agent 框架，专注于以数据为中心的 Agent 进化 | agent, self-evolving, data-driven | [打开](https://github.com/aiwaves-cn/agents) |
| ScienceClaw - 自进化科研 AI 同事，285 个技能，零幻觉 | 自进化科研 AI 同事，具备 285 个技能、持久记忆和零幻觉设计 | agent, self-evolving, research | [打开](https://github.com/beita6969/ScienceClaw) |
| Photo-agents - 自进化视觉 Agent，具备分层记忆和自写技能 | 自主自进化视觉 Agent，具备视觉基础的分层记忆和自写技能能力 | agent, self-evolving, vision | [打开](https://github.com/jmerelnyc/Photo-agents) |
| OpenViking - Agent 上下文文件系统，支持层级交付和自进化 | 通过文件系统范式提供 Agent 所需的上下文，支持层级上下文交付和自进化 | agent, self-evolving, context | [打开](https://github.com/volcengine/OpenViking) |
| CORAL - 多 Agent 自主自进化基础设施，支持 Claude Code/Codex/Cursor | 轻量级多 Agent 自主自进化基础设施，为自主研究设计，兼容 Claude Code、Codex、Cursor、OpenCode | agent, self-evolving, multi-agent | [打开](https://github.com/coral-research/coral) |
| dreamer - 让任何编码 Agent 具备自我改进技能的能力 | 让任何编码 Agent 具备自我改进技能的能力，从执行经验中自动提取和沉淀可复用技能 | agent, self-evolving, coding | [打开](https://github.com/luml-ai/dreamer) |
| hermes-agent - 内置学习循环的开源 AI Agent 框架 | 开源 AI Agent 框架，核心特点是内置学习循环：从经验中创建技能、使用中持续改进、跨会话保持记忆 | agent, self-evolving, learning-loop | [打开](https://github.com/NousResearch/hermes-agent) |
| meta-agent - 自我改进 Agent，从实时运行轨迹中学习和优化 | 自我改进 Agent，从实时运行轨迹中学习和优化自身行为策略 | agent, self-evolving, meta-learning | [打开](https://github.com/canvas-org/meta-agent) |
| evolver - AI Agent 进化框架，自动化 Agent 优化 | AI Agent 进化框架，自动化 Agent 行为和策略优化 | agent, self-evolving, framework | [打开](https://github.com/EvoMap/evolver) |
| QuantaAlpha - 自进化量化因子挖掘，LLM+进化策略 | 结合 LLM 智能与进化策略的量化因子自动挖掘和验证平台 | self-evolving, quantitative, finance | [打开](https://github.com/QuantaAlpha/QuantaAlpha) |

## 自进化 Agent 经典项目

| 名称 | 概括 | 标签 | 链接 |
| --- | --- | --- | --- |
| AutoGPT - 自主 AI 智能体先驱，184K Star | 自主 AI 智能体先驱，社区庞大，支持多模态任务自动化，最早展示 Agent 自主迭代能力的项目之一 | agent, autonomous, pioneer | [打开](https://github.com/Significant-Gravitas/AutoGPT) |
| letta (MemGPT) - 有状态 Agent 平台，支持高级记忆和自我改进 | 有状态 Agent 平台，支持高级记忆和自我改进的 Agent 构建，23K Star | agent, memory, self-improvement | [打开](https://github.com/letta-ai/letta) |
| generative_agents - 生成式 Agent：人类行为的交互模拟 | 生成式 Agent 交互模拟系统，Agent 具备记忆、反思和社交能力，21K Star | agent, generative, simulation | [打开](https://github.com/joonspk-research/generative_agents) |
| gpt-engineer - 代码生成 Agent 平台，55K Star | CLI 平台用于代码生成实验，通过自然语言描述自动构建代码 | agent, coding, generation | [打开](https://github.com/AntonOsika/gpt-engineer) |
| Voyager - 开放式具身 Agent，LLM 驱动的 Minecraft 探索 | 开放式具身 Agent，LLM 驱动自主探索和学习，具备技能库自动积累能力，7K Star | agent, embodied, exploration | [打开](https://github.com/MineDojo/Voyager) |
| tree-of-thought-llm - 思维树：LLM 深思问题求解 | NeurIPS 2023，LLM 深思问题求解框架，通过树状搜索实现自我评估和回溯，6K Star | reasoning, tree-search, self-evaluation | [打开](https://github.com/princeton-nlp/tree-of-thought-llm) |
| self-instruct - 自指令对齐预训练语言模型 | 通过自身生成的指令数据对齐预训练语言模型，自进化训练数据生成的开创性工作，4.6K Star | self-instruct, alignment, data-generation | [打开](https://github.com/yizhongw/self-instruct) |
| Reflexion - 语言 Agent 的言语强化学习 | NeurIPS 2023，语言 Agent 通过言语反思实现强化学习，3.2K Star | agent, reflection, reinforcement-learning | [打开](https://github.com/noahshinn/reflexion) |
| PraisonAI - 24/7 AI 工作力框架，自主自改进 Agent | 24/7 自主自改进 Agent 框架，支持记忆、RAG 和 100+ LLM，7K Star | agent, self-improvement, framework | [打开](https://github.com/MervinPraison/PraisonAI) |
| airlock - 自升级编译型 AI Agent，Go 编写 | 自升级编译型 AI Agent，半代码半 AI 架构，Go 语言实现 | agent, self-upgrading, compiled | [打开](https://github.com/airlockrun/airlock) |
| hive - 运行时自动生成拓扑结构的自组织 Agent 框架 | 运行时自动生成拓扑结构的自组织 Agent 框架，Agent 可动态重组协作关系 | framework, self-organizing, agent | [打开](https://github.com/adenhq/hive) |

## 自进化核心论文

### 综述与基础理论

| 名称 | 概括 | 标签 | 链接 |
| --- | --- | --- | --- |
| A Survey on Self-Evolution of Large Language Models | LLM 自进化综述，提出自进化概念框架，概述四阶段迭代循环过程 | survey, llm, self-evolution | [ArXiv](https://arxiv.org/abs/2406.18556) |
| A Comprehensive Survey of Self-Evolving AI Agents (2025) | 自进化 Agent 全面综述，分析进化策略在生物医学、编程和金融领域的应用 | survey, agent, self-evolving | [OpenReview](https://openreview.net/forum?id=96apU6YzSO) |
| Breaking the Reasoning Barrier: A Survey on LLM Complex Reasoning through Self-Evolution | 从自进化视角系统分析 LLM 复杂推理技术，提出数据进化、模型进化和进化策略三组件框架 | survey, reasoning, self-evolution | [ACL 2025](https://aclanthology.org/2025.findings-acl.386.pdf) |
| Model Collapse in LLM Self-Evolution | 发现多轮自进化后的模型崩塌现象，较大模型对崩塌表现出更强抵抗力 | paper, model-collapse, self-evolution | - |

### 自对弈训练 (Self-Play Training)

| 名称 | 概括 | 标签 | 链接 |
| --- | --- | --- | --- |
| SPIN - Self-Play Fine-Tuning Converts Weak Language Models to Strong | 自对弈微调方法，将弱 LLM 转化为强 LLM，无需额外人类标注数据 | self-play, fine-tuning, alignment | - |
| R-Zero - 自对弈强化学习推理 | 通过自对弈强化学习实现推理能力自我提升 | self-play, reinforcement-learning, reasoning | - |
| MAE - Multi-Agent Evolution via Self-Play | 多 Agent 自对弈进化，通过对抗性交互实现协同进化 | self-play, multi-agent, evolution | - |

### Agent 元认知与自我感知

| 名称 | 概括 | 标签 | 链接 |
| --- | --- | --- | --- |
| Symbolic Learning - 自我调整的 Agent 框架 | Agent 通过符号学习机制实现自我调整和优化 | symbolic-learning, agent, self-adjustment | - |
| SAGE - Self-Evolving Agent with Guided Evolution | 引导进化的自进化 Agent，结合外部指导和自主进化 | agent, guided-evolution, self-evolving | - |
| Gödel Agent - 自指递归自改进 Agent 框架 | 自指递归 Agent 框架，Agent 能递归地修改和改进自身 | godel, recursive, self-referential | [GitHub](https://github.com/AGI-Edgerunners/Godel-Agent) |
| SE-Agent - 自进化 Agent 系统 | 自进化 Agent 系统，从经验中持续学习和改进 | agent, self-evolving, experience-learning | - |

### 迭代自精炼 (Iterative Self-Refinement)

| 名称 | 概括 | 标签 | 链接 |
| --- | --- | --- | --- |
| Self-Refine - LLM 迭代自精炼 | LLM 通过自我反馈和迭代精炼提升输出质量 | self-refine, iterative, feedback | - |
| EVOLVE - 通过进化实现自改进 | 通过进化策略实现 Agent 自改进 | evolution, self-improvement, iterative | - |
| LATS - Language Agent Tree Search | 语言 Agent 思维树搜索，结合反思和搜索实现自改进决策 | agent, tree-search, reflection | - |

### 递归自改进 (Recursive Self-Improvement)

| 名称 | 概括 | 标签 | 链接 |
| --- | --- | --- | --- |
| RISE - Recursive Self-Improvement through Self-Evaluation | 通过自我评估实现递归自改进 | recursive, self-evaluation, improvement | - |
| LADDER - LLM 自改进通过递归问题分解 | 通过递归问题分解实现 LLM 自改进，用更简单子问题训练解决更难问题 | recursive, problem-decomposition, self-improvement | - |

### 进化提示优化 (Evolutionary Prompt Optimization)

| 名称 | 概括 | 标签 | 链接 |
| --- | --- | --- | --- |
| EvoPrompt - 基于进化算法的提示优化 | 基于进化算法自动优化提示词，无需人工调参 | prompt-optimization, evolutionary, automatic | - |
| DEEVO - 深度进化提示优化 | 深度进化方法实现提示词自动优化 | prompt-optimization, deep-evolution, automatic | - |

### 自动化 Agent 设计 (Automated Agent Design)

| 名称 | 概括 | 标签 | 链接 |
| --- | --- | --- | --- |
| ADAS - Automated Design of Agentic Systems | 自动化 Agent 系统设计，用 Agent 设计 Agent 的元优化方法 | automated-design, meta-optimization, agent | - |
| AgentTuning - Agent 微调数据集和方法 | Agent 微调数据集和方法，通过特定任务数据提升 Agent 能力 | agent-tuning, fine-tuning, dataset | [打开](https://github.com/THUNLP-MT/AgentTuning) |

### 多智能体自进化 (Multi-Agent Co-Evolution)

| 名称 | 概括 | 标签 | 链接 |
| --- | --- | --- | --- |
| EvoMAC - 多 Agent 协同进化框架 | 多 Agent 协同进化框架，通过 Agent 间竞争和合作实现群体进化 | multi-agent, co-evolution, collaborative | - |
| LatentMAS - 多智能体系统中的潜在协作机制 | ICML 2026 Spotlight，多智能体系统中的潜在协作机制 | multi-agent, latent-collaboration, icml | [打开](https://github.com/Gen-Verse/LatentMAS) |

### 经验驱动学习 (Experience-Driven Learning)

| 名称 | 概括 | 标签 | 链接 |
| --- | --- | --- | --- |
| ExpeL - 经验驱动的 LLM Agent 学习 | 经验驱动的 LLM Agent 学习框架，从成功和失败经验中提取洞察 | experience-driven, learning, agent | - |
| Trial and Error - 试错学习的 Agent 框架 | Agent 通过试错学习不断改进策略 | trial-error, learning, agent | - |
