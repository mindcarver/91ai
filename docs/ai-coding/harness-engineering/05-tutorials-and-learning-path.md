# 实战与学习路径：从 60 行手搓到跑通 SWE-bench

> 前四篇都在讲"为什么"和"是什么"，这一篇讲"怎么做"。
> 给你一条从零开始、每一步都可执行的学习路径：先亲手搓一个能跑的 agent loop 祛魅，再理解组件，再加工具配 eval，最后跑通一个真实 benchmark 的切片。中间穿插公开课和 talk 补理论。

## 第一课：先祛魅——亲手跑通一个 agent

学 harness engineering 最大的障碍不是技术，是"神秘感"。很多人觉得 agent 是某种黑魔法，其实它就是**一个 while 循环 + LLM + 几个工具**。亲手搓一遍，这个神秘感就碎了，后面所有概念都会变得理所当然。

从这两条最短路径里选一条起步：

- **[minimal-agent-tutorial](https://github.com/SWE-agent/minimal-agent-tutorial)**（SWE-agent 团队官方，配套在线教程 https://minimal-agent.com/ ）— 从零搭一个约 60 行 Python 的终端 agent，比任何项目都短、都循序渐进。完全没搭过 agent 的人，从这里开始。
- **[mini-coding-agent](https://github.com/rasbt/mini-coding-agent)**（Sebastian Raschka）— 刻意写得"极简、可读"而非高性能，系统拆解 agent loop、工具注册、shell 执行、文件编辑、code search。配套文章 [Components of a Coding Agent](https://magazine.sebastianraschka.com/p/components-of-a-coding-agent) 当教科书读。

跑通之后做一件事：改 system prompt，观察 agent 行为怎么变。这步建立的直觉（harness 没有魔法，行为由你写的代码决定）是整个学科的基石。

## 第二课：理解组件——读源码做"减法"

会跑之后，要理解"每个零件为什么存在"。方法不是读文档，是**做减法**：把 mini-coding-agent 的每个工具函数（read / edit / search / bash）逐个注释掉，看 agent 在哪一步崩。

你会亲手验证 01 篇的核心论断：**工具集设计 = harness 设计的一半**。少一个工具，agent 就卡在某类任务上；工具签名设计得糟，agent 就频繁犯错。

如果想要更接近生产级的视角，读 [Geoffrey Huntley 的 workshop](https://ghuntley.com/agent/)——他的核心论点是"coding agent 就是约 300 行代码跑在一个 loop 里不断喂 LLM token"，用 Go 从零搭，逐步加 5 个原语工具，把 context window 分配、agentic vs oracle 模型选型讲透。另有 Damian De Masí 的 [Build Your Own Agent](https://www.damiandemasi.com/projects/build-your-own-agent)（TypeScript，Claude Code 风格）和 appsoftware 的 [Building a (Bad) Local AI Coding Agent from Scratch](https://www.appsoftware.com/blog/building-a-bad-local-ai-coding-agent-harness-from-scratch)（纯 Node.js，刻意不用任何框架，"没有魔法"）可供选择。

## 第三课：自己造 eval——让 agent 可被衡量

这一步很多教程跳过，但它才是 harness engineering 真正的分水岭：**你不能可靠地改进一个你看不见的东西。** 搭完 agent，立刻给它配 eval。

理论的必读是 Hamel Husain 的两篇（也是整个 eval 实战派最有影响力的声音）：

- [LLM Evals: Everything You Need to Know](https://hamel.dev/blog/posts/evals-faq/) — eval 世界观的总入口，主张"把 70-80% 时间花在 error analysis 而不是写 test"。
- [Using LLM-as-a-Judge For Evaluation](https://hamel.dev/blog/posts/llm-judge/) — 手把手教 LLM 当裁判怎么用、什么时候该信。

更系统的训练：Hamel & Shreya Shankar 的 [AI Evals For Engineers & PMs 课程](https://maven.com/parlance-labs/evals)（付费，但课程主页有免费章节预览），以及 [Anthropic 的 agent eval 方法论](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)（官方工程视角，更偏规模化）。想要一个能直接拿来改的 eval harness 实现，学 [Inspect AI](https://inspect.aisi.org.uk/)（UK AISI 官方）：它的 eval = Task + Solver + Scorer 三元组就是 eval harness 的标准骨架。Datadog 的 [Offline evaluation for AI agents](https://www.datadoghq.com/blog/offline-llm-evaluations/) 则把"离线 eval = agent 的单元测试"这个工程定位讲得很直白。

实操最小闭环：给你的 agent 准备 5-10 个简单任务（修一个 bug、写一个函数并跑测试），用 Hamel 的 code-based eval（测试通过与否）当评分函数。**加工具 → 跑 eval → 看分数**这个循环，就是 harness engineering 的日常。

## 第四课：补理论——公开课与 talk

实操打底后，用公开课补系统性理论：

- **[Berkeley LLM Agents MOOC](http://rdi.berkeley.edu/llm-agents/f24)**（UC Berkeley RDI，免费视频 + 讲义）— 目前最系统的 agent 公开课，从 LLM 基础讲到 agent 架构、工具使用、多 agent、评估与部署。挑"agent 架构""工具使用""评估"几章看即可。
- **[Stanford CS25: Transformers United](https://web.stanford.edu/class/cs25/)**（seminar，主讲含 Hinton、Vaswani）— Transformer 领域顶会级 seminar，有直接覆盖 agentic AI 的单讲。适合理解"为什么 harness 设计能让模型表现差几倍"的底层原理。
- **Princeton SWE-agent 生态讲座** — 从 SWE-bench（出题）到 SWE-agent（跑）到 SWE-smith（造训练数据 + trajectory）的完整闭环，由原作者讲。Weaviate Podcast 的 "SWE-bench with John Yang and Carlos Jimenez" 是好入口。

会议 talk 里几个值得看：NeurIPS 2024 的 [SWE-Bench Authors Reflect on the State of LLM Agents](https://www.youtube.com/watch?v=bivZWNQHRfE)（作者团队谈 benchmark 取舍与当前 agent 真实水平）、Hamel Husain 与 Emil Sedgh 的领域 eval 构建 talk、JetBrains 的 Practical AI Coding Agent Evaluation（IDE 厂商视角的工程化踩坑）。

## 第五课：进阶——跑通 SWE-bench 的一个小切片

理论补完，回到实战。用 [mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent)（约 100 行、SWE-bench Verified 上 74%+）在 SWE-bench Verified 上跑 10-20 个 instance（控制成本），然后用它自带的 [trajectory browser](https://swe-agent.com/latest/usage/trajectories/) 分析失败的 case：

- 是 prompt 问题？
- 是工具问题？
- 是模型问题？

这一步把"agent harness + eval harness + trajectory 数据分析"三件事串起来——你就具备了独立做 harness engineering 的能力。mini-swe-agent 是这条路上最值得 fork 的标杆教学项目：它只有一个工具（bash）、完全线性 history（trajectory 天然适合调试和微调）、用 subprocess.run 让每步独立（换 docker exec 即可沙箱化）。

## 可跑的 starter / 模板仓库速查

拿来就能改的轻量项目：

- **[mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent)** — 100 行标杆，学完能改造成自己的 agent。
- **[smolagents](https://github.com/huggingface/smolagents)**（Hugging Face）— 约 1000 行框架，主打"think in code"，适合从"手搓"过渡到"用框架搭 harness"。
- **[smol-ai/developer](https://github.com/smol-ai/developer)** — 早期极简 coding agent 鼻祖（2023），理解 prompt → 工具 → 文件读写的最朴素循环仍有教学价值。
- **[awesome-harness-engineering](https://github.com/ai-boost/awesome-harness-engineering)** — 持续更新的策展清单，分 tools / patterns / evals / memory / MCP / permissions / observability / orchestration，适合当书签发现新资源。

## 一条完整的学习路径（5 步，约 3-5 周）

把上面五课串成一条可执行路线：

| 步骤 | 做什么 | 用什么 | 预计时间 |
|------|--------|--------|----------|
| 1 | 祛魅：跑通一个 60 行 agent，改 prompt 看行为变化 | minimal-agent-tutorial | 半天 |
| 2 | 理解组件：读源码，注释工具做减法，看 agent 在哪崩 | mini-coding-agent + Raschka 文章 | 1-2 天 |
| 3 | 造 eval：加一个自己的工具，配 5-10 个任务的 code-based eval | mini-swe-agent + Hamel evals-faq | 2-3 天 |
| 4 | 补理论：挑 agent 架构/工具/评估章节 + Hamel eval 两篇 | Berkeley MOOC + Hamel 博客 | 1-2 周 |
| 5 | 进阶：跑 SWE-bench Verified 小切片，分析失败 trajectory | mini-swe-agent + trajectory browser | 约 1 周 |

偏工程落地而非研究的读者，第 4 步可换成 Geoffrey Huntley workshop + Inspect AI Tutorial，更贴近生产。

## 小结

harness engineering 不是读出来的，是搓出来的。整个领域的最佳学习方式就一句话：**先手搓一个最小的能跑的 agent，然后不停地给它加工具、配 eval、分析 trajectory，直到你彻底祛魅。** 当你不再觉得 agent 是黑魔法，而是能清晰说出"这个 agent 卡在这一步是因为 context 里缺了 X / 工具签名没设计好 / 评分函数有漏洞"——你就入门了。

下一篇：[06 参考资源与延伸阅读](./06-references-and-extended-reading.md)，把这个专题依赖的综合资源（课程 / 开放指南 / 精选清单）、一手 canonical 博客与中文实战资料集中索引，方便长期收藏与回溯。

回到 [系列总览](./README.md)，或继续读本仓库的 [Claude Code](../claude-code.md) / [Codex](../openai-codex.md) 工程化系列，看 outer harness 在具体工具里怎么落地。
