# 趋势与争议：多 agent、Bitter Lesson 与 harness 寿命

> 前三篇讲的是 harness engineering 的"实然"——它是什么、有哪些项目、评测怎么做。这一篇讲"应然"层面还没定论的几场论战：该用多 agent 还是单 agent？手工写的脚手架会不会终将被淘汰？harness 到底是资产还是债务？
> 这些问题没有标准答案，但知道战线在哪，能直接影响你的选型和架构决策。

## 争议一：多 agent 还是单 agent

这是 2024-2025 年 agent 架构最激烈的一场论战，对立双方都是一线实战团队。

**反方：Cognition（Devin 团队）。** [Don't Build Multi-Agents](https://cognition.ai/blog/dont-build-multi-agents) 的核心论点很直接：多 agent 会导致 context 碎片化——每个 agent 只看到任务的一部分，信息在交接中丢失，严重损害可靠性。他们主张单线程线性架构：一个 agent 贯穿始终，持有完整 context。他们的底层判断是"context engineering 是 agent 工程的头号工作"，任何切碎 context 的设计都是在自找麻烦。

**正方：Anthropic。** Anthropic 力推"精心编排的多 agent"（carefully orchestrated multi-agent），认为在合适拓扑下，多个 agent 各司其职能处理单 agent 难以招架的复杂任务。Building Effective Agents 里的 orchestrator-workers 模式就是这种思路的体现。

**结局（暂时）：Cognition 部分让步。** 大约 10 个月后，Cognition 发了 [Multi-Agents: What's Actually Working](https://cognition.ai/blog/multi-agents-working)，承认"一类窄范围的多 agent 系统确实有效"——前提是 agent 贡献智能、而系统保持连贯的 context 流。

**工程判断。** 这场争论的本质不是"多好还是单好"，而是**拓扑必须匹配任务**。关键问题是 context 能否连贯流转：

- 任务可线性拆解、强依赖前序结果 → 单 agent / 线性 workflow 更稳
- 任务有天然可并行的独立子任务（如多文件批量重构） → 多 agent / parallelization 有收益
- 一旦 agent 之间需要频繁、复杂的状态同步，多 agent 的协调成本往往吃掉收益

务实建议：从单 agent 起步，遇到真实的并行/委派瓶颈再上多 agent，且优先用"agent 贡献智能 + 系统保 context 连贯"这种被验证有效的窄模式，而不是一上来就堆复杂的多 agent 拓扑。

## 争议二：Harness 与 Bitter Lesson

这是最具哲学张力的一条，关乎 harness engineering 作为一门学科"能活多久"。

**起手：Sutton 的 Bitter Lesson。** Rich Sutton 的经典论断是：在 AI 历史上，依赖"算力 + 学习"的通用方法，最终都击败了依赖"人类先验知识/手工结构"的方法。越想用人类的聪明去帮 AI，越容易被规模化学习碾压。

**套用到 harness。** Hugo Bowne 在 [Agent Harness and the Bitter Lesson Revisited](https://hugobowne.substack.com/p/ai-agent-harness-3-principles-for) 里直接把这个论断搬过来：人类手工设计的脚手架（更多人类先验结构），很可能违背 bitter lesson，终将被可规模化的学习方法取代。业界一种代表性的精炼表述是——"如果你的 agent harness 主要靠堆叠更多人类编写的结构来扩展，那它大概率在对抗 Bitter Lesson。"

**反证：当下 harness 仍是最大杠杆。** 但在 2026 年的现实中，bitter lesson 还没兑现到 harness 这一层。OpenAI 的 [Harness Engineering](https://openai.com/index/harness-engineering/) 文章和 mini-swe-agent 的成功都表明：**精心设计的 harness，仍是当下放大模型能力的最有效手段**。模型还没强到"随便套个壳就能干所有事"。

**怎么调和这个张力。** 最清醒的定位可能是这句：**harness engineering 是一门"明知终局会被学习方法取代、但当下必须做好"的过渡性工程学科。** 你不能因为"未来 harness 可能消失"就在今天摆烂——在模型跃迁到那个临界点之前，差 harness 和好 harness 的产出差距是实打实的。但你也不该把手工脚手架当成永恒资产去过度投资。

## 争议三：Harness 是资产还是债务

Lee Hanchung（Han, Not Solo）给出了最尖锐（也最有启发性）的视角：[harness 不是资产，是带保质期的技术债](https://leehanchung.github.io/blogs/2026/05/08/hidden-technical-debt-agent-harness/)。

他的论证有两层：

1. **harness 中大部分代码，是 agent 自己在运行时可编辑的。** 你的 CLAUDE.md、skills、工作流约定，agent 会读、会改、会绕过。这意味着 harness 的"所有权"是模糊的——它既是你的，也是 agent 的。
2. **inner harness 最容易被下一次模型发布淘汰。** 他举了个实证例子：Opus 4.6 的发布，让一整层原来用来对抗模型短板的"sprint"脚手架变得多余。你辛辛苦苦补的窟窿，模型一升级就白补了。

这直接呼应了 01 篇的 inner/outer harness 划分，并给出了一个实操结论：**把工程投入押在 outer harness（CLAUDE.md、skills、hooks、评测集、工作流）上，少押在试图手工补 inner harness 的窟窿上。** outer harness 跨模型版本可迁移，inner harness 的努力随时归零。

这条观点之所以有价值，是因为它纠正了另一种倾向：很多人在用 agent 时，花大量精力去"调教"工具的内置行为（试图改 inner harness），而不是沉淀可复用的 outer harness。前者是消耗战，后者是积累战。

## 术语出圈史：harness engineering 怎么成了一门学科

把时间线拉直，这个词是怎么从圈内黑话变成独立学科的：

- **2024 年底**：[Anthropic 的 Building Effective Agents](https://www.anthropic.com/research/building-effective-agents) 播下概念种子，奠定"simple first"哲学和 workflow/agent 的区分。这篇文章被后续几乎所有 harness 文章引用。
- **2025 年**：两件事让主题升温。一是 context engineering 取代 prompt engineering 成为显学（Philipp Schmid 的定义、LangChain 和 Anthropic 的工程文）；二是 SWE-bench 的三连争议（见 03 篇）让"eval harness 质量"进入主流视野。
- **2026 年初**：[OpenAI 的 Harness Engineering](https://openai.com/index/harness-engineering/) 让术语正式"出圈"——这是被普遍认为让"harness engineering"一词进入大众视野的文章。随后 Martin Fowler 站点的 [Harness engineering for coding agent users](https://martinfowler.com/articles/harness-engineering.html)、HumanLayer 的 [Skill Issue](https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents/)、Han Not Solo 的技术债文，把工程实践逐步体系化。
- **2026 年中（当下）**：harness engineering 已被普遍承认为一门独立工程学科。核心方法论共识（harness 决定上限、简单优先、context 为王、ACI、评测必须工程化）基本成型，但多 agent 架构、harness 寿命、eval 可信度三大争议仍在持续。

## 容易被忽略的一面：harness 的安全与可控

能力之外，harness 还有一层常被低估的维度：**怎么让一个会自主行动的系统不闯祸。**

Simon Willison 的定义既精确又带警示意味：[agent 本质是"a LLM wrecking its environment in a loop"——一个在循环里不断折腾环境的 LLM](https://simonwillison.net/2025/Sep/30/designing-agentic-loops/)。它的另一面定义更克制：["An LLM agent runs tools in a loop to achieve a goal"](https://simonwillison.net/2025/Sep/18/agents/)。两个定义的张力点出 harness 设计的一个核心机制——**批准门控（approval gate）**：在 agent 执行破坏性操作（删文件、跑命令、发请求）前，要不要、怎么要人类的批准。Claude Code 的默认请求批准、Cline 的可视 diff 审批，都是这层机制的体现。

HumanLayer 的 [Skill Issue](https://www.humanlayer.dev/blog/skill-issue-harness-engineering-for-coding-agents/) 把这层推向更工程化的方向：把 harness engineering 定义为"利用 coding agent 的配置点提升输出质量的艺术与科学"，强调 skill、AGENTS.md、hooks 这些**配置面**的工程化。这代表了 2026 年的新趋势——harness engineering 不再只是"写 agent loop 的代码"，也包括"把 agent 的可配置面管起来"的运维/治理工作。这也是本仓库 Claude Code / Codex 工程化系列一直在讲的内容（CLAUDE.md、AGENTS.md、hooks、skills），它们正是 outer harness 的具体形态。

## 小结

四条判断，作为这一篇的收尾：

1. **多 agent vs 单 agent，看任务拓扑。** 从单 agent 起步，遇到真实并行瓶颈再上，且优先用被验证的窄模式。
2. **Harness 现在是杠杆，但不是永恒资产。** 精心设计它，但别把它当不动产——模型跃迁时该重写就重写。
3. **押注 outer harness，少补 inner harness 窟窿。** 跨版本可迁移的沉淀，比对抗模型短板的临时补丁值钱。
4. **harness 不只是能力层，也是治理层。** 批准门控、配置面工程、安全边界，和能力同等重要。

下一篇：[05 实战与学习路径](./05-tutorials-and-learning-path.md)，从 60 行手搓一个 agent 开始，给一条可执行的学习路线。
