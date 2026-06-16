# Harness Engineering 专题：让大模型真正干活的工程学

> 6 篇文章（1 篇总览 + 5 篇正文），从「什么是 harness」讲到开源项目全景、评测争议、趋势论战与实战学习路径。
> 不是工具推荐清单，而是把「模型之外、决定 agent 上限的那层工程」讲清楚。

## 这个专题在讲什么

**一句话：Agent = Model + Harness。模型只是 CPU，harness 才是让 agent 真正干活的操作系统。**

"Harness"（挽具 / 脚手架）指围绕大模型构建的全部工程层——工具调用循环、上下文管理、沙箱执行、状态持久化、评分函数。同一个模型，套上不同的 harness，表现可以差出几倍；Claude Code、OpenHands、Aider 这些 coding agent 之所以能干活，靠的不是模型本身，而是各自打磨多年的 harness。

"harness engineering" 就是把这件事当作一门独立的工程学科来做。它 2024 年底被 Anthropic 的《Building Effective Agents》播下种子，2025 年随着 context engineering 和 SWE-bench 争议进入主流，2026 年初被 OpenAI 的同名文章正式"出圈"，目前方法论仍在快速演化，但几条共识已经成型。

本专题面向两类人：

- **用 agent 干活的人**——理解 harness，才能理解为什么 Claude Code 要你配 CLAUDE.md、为什么 Aider 的 edit format 重要、为什么"换个 prompt 就能涨点"背后其实是 harness 工程。
- **自己搭/评测 agent 的人**——理解 harness，才能从零手搓一个能跑的 agent loop，才能判断 SWE-bench 排行榜到底能不能信。

## 系列结构

- **总览（本篇）**：建立全景认知、核心命题与术语
- **概念篇（1 篇）**：harness 到底是什么、agent harness 与 eval harness 的二分、context engineering、ACI
- **开源项目篇（1 篇）**：五大类项目全景盘点 + 跨项目共性设计模式
- **评测篇（1 篇）**：评分函数、contamination、SWE-bench 三连争议、LLM-as-judge、Hamel 实用主义路线
- **趋势与争议篇（1 篇）**：多 agent vs 单 agent、bitter lesson 与 harness 寿命、harness 作为技术债、术语出圈史
- **实战与学习路径篇（1 篇）**：手搓 agent/eval harness、公开课、talk、starter 仓库、5 步可执行学习路径

## 核心命题速览

读完整个系列，你应该能内化下面这些判断。

### 五条共识

1. **Harness 决定模型上限。** 从 Anthropic 长程 harness 文、mini-swe-agent 的 100 行奇迹，到 OpenHands / Cline 的架构复盘，一线团队的结论高度一致：你的架构是瓶颈，不是你的模型。
2. **简单优先，复杂度按需增加。** Anthropic 的"find the simplest solution possible"、Cognition 的"单线程优于多 agent"、mini-swe-agent 的极简主义，指向同一个直觉——过度工程化的 harness 往往拖累表现。
3. **Context engineering 是 harness 的核心子学科。** "在正确的时间、以正确的格式，提供正确的信息与工具"——它已经取代 prompt engineering，成为 agent 时代最值钱的技能。
4. **接口设计本身就是 harness 工程（ACI 思想）。** 为 LLM 量身定做的接口，比沿用人类 API 效果好得多。这是 harness 区别于普通后端开发的关键认知。
5. **评测必须工程化。** 你不能可靠地改进一个你看不见的东西。eval harness 不是可选的研究工具，而是 agent 工程的"单元测试"。

### 三大争议（没有标准答案，但值得知道战线在哪）

1. **多 agent vs 单 agent。** Cognition（Devin）公开反对多 agent，Anthropic 力推"精心编排的多 agent"。10 个月后 Cognition 部分让步——仍是开放问题。
2. **评测可信度。** SWE-bench 排行榜到底能不能信？contamination（数据污染）有多严重？三方论文（Illusion、UTBoost）给了"不能全信"的实证。
3. **Harness 与 Bitter Lesson 的关系。** 手工设计的脚手架会不会终将被可规模化的学习方法取代？——这是最具哲学张力的一条：harness engineering 可能是一门"明知会被淘汰、但当下必须做好"的过渡性学科。

## 系列目录

| # | 标题 | 核心议题 |
|---|------|----------|
| 01 | [Harness Engineering 是什么](./01-what-is-harness-engineering.md) | 定义、inner/outer harness、agent harness vs eval harness、context engineering、ACI、simple-first |
| 02 | [开源项目全景：从 eval harness 到 agent harness](./02-open-source-landscape.md) | 五大类项目盘点 + 跨项目共性设计模式 |
| 03 | [评测 Harness 与 SWE-bench 的三连争议](./03-eval-harness-and-swe-bench.md) | 评分函数、contamination、SWE-bench 争议、LLM-as-judge、Hamel 路线 |
| 04 | [趋势与争议：多 agent、Bitter Lesson 与 harness 寿命](./04-trends-and-debates.md) | 多 vs 单 agent、harness 技术债、术语出圈史 |
| 05 | [实战与学习路径：从 60 行手搓到跑通 SWE-bench](./05-tutorials-and-learning-path.md) | 手搓 agent/eval harness、公开课、talk、starter、5 步路径 |

## 阅读路径

- **只想搞懂概念（10 分钟）**：本篇 → 01
- **要选型 / 看有哪些轮子**：本篇 → 02
- **要做评测 / 不信排行榜**：本篇 → 03
- **要动手做**：本篇 → 01 → 05
- **完整通读**：按 01 → 05 顺序

## 术语速查

| 术语 | 含义 |
|------|------|
| **Harness** | 围绕模型构建的工程层：工具循环、上下文、沙箱、状态、评分 |
| **Agent harness** | 把 LLM 包装成自主完成任务系统的代码（如 Claude Code、Aider） |
| **Eval harness** | 给模型出题、打分、做基准的框架（如 SWE-bench、lm-eval-harness） |
| **ACI** | Agent-Computer Interface，专为 LLM 设计的人机接口 |
| **Context engineering** | 推理过程中策展与维护最优 token 集合的工程，prompt engineering 的上位替代 |
| **Trajectory** | agent 一次运行的完整轨迹（消息 + 工具调用 + 结果），可回放、可微调 |
| **Contamination** | 评测数据泄漏进训练集，导致分数虚高 |
| **Inner / Outer harness** | 模型厂商内置的 harness / 团队自建的 harness |

## 关于这个专题

本专题的素材来自三个方向的并行调研：开源项目、博客与论文、教程与课程。所有外部链接在 2026/06 经过可达性校验（个别社交媒体链接因平台特性可能失效）。文中尽量引用一手 canonical 来源（Anthropic / OpenAI / Princeton NLP / arXiv / 项目作者本人），少用二手转述。

这层的工程演化极快——本专题是 2026 年中的快照，半年后部分判断可能需要修正。但核心命题（harness 决定上限、简单优先、context 为王、评测必须工程化）短期内不会动摇。

> 如果你是从 Claude Code / Codex 系列过来的：那些系列讲的是"怎么用好某个 agent"，这个专题讲的是"为什么这些 agent 能干活、以及怎么造一个"。两者互补。
