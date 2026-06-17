# 开源项目全景：从 eval harness 到 agent harness

> 上一篇讲了 harness 是什么，这一篇看它在真实项目里长什么样。
> 按 agent harness（干活）和 eval harness（打分）两条主线，加上编排框架、可观测、沙箱，盘点这个领域值得读、值得用的开源项目，最后提炼跨项目共性的设计模式。

star 量为 2026/06 大致量级，部分项目增长快，以仓库实时数据为准。

## 一、代码评测 harness（eval harness）

这一类的核心命题：怎么客观、可复现、抗作弊地衡量模型能力。评分函数是它们的灵魂。

- **[SWE-bench](https://github.com/swe-bench/SWE-bench)**（15k+）— 用真实 GitHub issue 评测 agent 修 bug 能力。定义了"任务即 issue → 产出 patch → 用仓库自带测试当评分器"的闭环，Docker 化 checkout + FAIL_TO_PASS / PASS_TO_PASS 测试做客观打分，是 agent eval 的黄金标准。绕不开它，也绕不开对它的争议（03 篇）。
- **[lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness)**（8k+，EleutherAI）— 通用 LLM 评测框架，覆盖数百个学术基准。把"模型 wrapper / task / metric"做成可插拔三段式，加一个基准只要写一个 task 类，是单轮评测 harness 的工程范式教科书。
- **[OpenCompass](https://github.com/open-compass/opencompass)**（5k+，上海 AI Lab）— 多模型、100+ 数据集评测平台。把"配置 + 任务切分 + 分布式调度"做成可跑的平台，内置 LLM-as-judge、多模态。中文学术/工业评测事实标准之一。
- **[bigcode-evaluation-harness](https://github.com/bigcode-project/bigcode-evaluation-harness)**（1k+）— 专评代码生成模型，含 HumanEvalPack / MBPP / MultiPL-E。演示了"一套 harness 多任务多语言"的扩展方式。
- **[human-eval](https://github.com/openai/human-eval)**（2.5k+，OpenAI）— 随 Codex 发布的 164 题 Python 评测 + pass@k。极简到"problem → completion → 跑单测数通过率"三层，是所有代码 harness 的最小可行原型，仓库虽冻结但仍是理解 pass@k 的起点。

## 二、Agent / coding agent harness（脚手架）

这一类的核心命题：怎么让模型在多步任务里保持可靠。读这些项目的源码是学 harness engineering 最快的方式。

- **[OpenHands](https://github.com/All-Hands-AI/OpenHands)**（76k+，原 OpenDevin）— 开源、模型无关的云上编码 agent 平台。把整套 agent 抽成可组合的 SDK（事件循环 + Action/Observation + 运行时容器），事件驱动的轨迹可回放。开源 coding agent 里 harness 最完整的实现。
- **[SWE-agent](https://github.com/SWE-agent/SWE-agent)**（16k+，Princeton NLP）— 定义 ACI（Agent-Computer Interface）的 issue 修复 agent。核心贡献是为 LLM 量身定做文件查看/编辑/搜索命令，证明"接口设计本身就是 harness 工程"。与 SWE-bench 形成 agent + eval 配对。
- **[Aider](https://github.com/aider-ai/Aider)**（46k+）— 终端结对编程，深度集成 Git 的 diff 编辑循环。把"编辑循环 + 自动 commit + repo map（树形代码索引喂长上下文）+ 多种 edit 格式（whole/edit/udiff）"打磨成生产级，是 long-context harness 的典范。
- **[Cline](https://github.com/cline/cline)**（63k+）— 开源 VS Code 自主编码 agent，已升级为 SDK。Plan/Act 双模式 + MCP 工具 + 可视 diff 审批，把"人在 loop 里"做成 diff 审批的反馈闭环，是 agent harness UX 工程的范本。
- **[Roo Code](https://github.com/RooCodeInc/Roo-Code)**（14k+，Cline fork）— 在 Cline 单 agent 基础上加"mode = 一组 system prompt + 工具白名单"，演示如何用配置而非代码扩展 agent 行为。对照 Cline 学习演化路径。
- **[Goose](https://github.com/block/goose)**（10k+，Block）— 本地通用 AI agent，70+ 扩展，不止写代码。以 extension（类 MCP 工具）+ session 持久化为核心，是"可插拔工具平台"式通用 agent harness 的代表。
- **[Plandex](https://github.com/plandex-ai/plandex)**（10k+）— 为大型多文件任务设计的终端 agent。把"plan（context + 对话 + 模型设置）整体版本化，支持 branch / rollback"做进 harness 核心——把 agent 状态当 Git 对象管理。
- **[Continue](https://github.com/continuedev/continue)**（26k+，已被 Cursor 收购，仓库冻结）— 开源 Copilot 替代品，把 autocomplete / chat / agent 三模式做进同一 harness，provider 抽象干净。研究 IDE 级多模式抽象有价值，但新项目建议参考 Cline/Roo。

## 三、Agent 编排/构建框架（搭 harness 的积木）

不直接是 agent，而是你拿来搭 harness 的框架。选哪个，很大程度上决定你的 harness 长什么样。

- **[LangGraph](https://github.com/langchain-ai/langgraph)**（20k+）— 低层级、图结构的长时程有状态 agent 编排。把 agent 逻辑建模成显式状态图（节点 + 边 + checkpointing），支持持久化执行、流式、human-in-the-loop 中断恢复。生产级状态机式编排首选。
- **[AutoGen](https://github.com/microsoft/autogen)**（40k+，微软）— 事件驱动多 agent 对话框架。把多 agent 协作建模成"事件 + actor 消息总线"，AutoGen Studio 提供可视化调试。多 agent 协作 + 事件驱动架构的参考。
- **[CrewAI](https://github.com/crewAIInc/crewAI)**（30k+ 量级）— 以"角色 + 任务 + crew"组织多 agent。把 agent 抽成 role/goal/backstory + task + process，上手最快，是声明式 agent 编排的范本。
- **[smolagents](https://github.com/huggingface/smolagents)**（15k+，Hugging Face）— 极简 agent 库，核心逻辑约 1000 行，主打"用代码思考"（agent 写 Python 调工具而非 JSON tool-call）。最短 harness 能跑通，是读码理解 agent loop 本质的最佳起点。
- **[Pydantic AI](https://github.com/pydantic/pydantic-ai)**（10k+）— 类型安全的 agent 框架，用 Pydantic 模型约束 LLM 输出与工具签名。把"结构化输出 schema + 依赖注入 + 工具类型签名"做进 harness，让大量 bug 在编译期暴露。
- **[LlamaIndex](https://github.com/run-llama/llama_index)**（40k+）— 从 RAG 演化的 agent 应用框架，含 Workflows 和 AgentRunner。强项在 agentic RAG 的 harness 组装（数据连接器 + 索引 + 检索 + 工具调用一条龙）。

## 四、评测与可观测工具

agent 跑起来后，你得能"看见"它——trace 每一步、把轨迹沉淀成 eval 数据。这一类是连接 agent harness 和 eval harness 的桥梁。

- **LangSmith**（LangChain 官方，SaaS）— agent/LLM 全链路 tracing + 评测平台。把每次请求的每一步（LLM 调用、工具调用、子链）记录成可回放 trace，配套 dataset + eval。"trace → dataset → eval → 对比实验"闭环的母版。https://www.langchain.com/langsmith
- **[Langfuse](https://github.com/langfuse/langfuse)**（10k+）— 开源 LLM 工程平台，tracing + eval + prompt 管理，可自托管。OpenTelemetry 兼容，把 observability 和 eval 合一。数据不出门的首选。
- **[Phoenix](https://github.com/Arize-ai/phoenix)**（10k+，Arize）— 开源 AI 可观测 + 评测，推动 vendor-neutral 的 `gen_ai.*` 语义约定。重视开放 trace 标准、跨工具可移植。
- **[Autoevals](https://github.com/braintrustdata/autoevals)**（1k+，Braintrust 开源的评分库）— 把 fact-check / safety / 文本主观评分做成可复用的 model-graded eval 组件，平台侧把 eval 存为不可变 experiment snapshot。LLM-as-judge 组件库可直接拿来用。
- **[Helicone](https://github.com/Helicone/helicone)**（3k+）— 开源 LLM 可观测，靠"改一行 base URL"做代理网关抓全部请求。演示了零代码改动接 observability 的最快路径。
- **[Promptfoo](https://github.com/promptfoo/promptfoo)**（21k+，2026 年被 OpenAI 收购但仍开源）— CLI 形式的 prompt/模型评测 + 红队测试。YAML 配置驱动评测矩阵（prompt × 模型 × 测试 × 断言），原生支持 CI/CD，是"评测即测试"的落地范本。注意被收购后非 OpenAI 模型场景需评估中立性。
- **[Inspect AI](https://github.com/UKGovernmentBEIS/inspect_ai)**（UK AISI 官方）— 学术界与政府机构认可的 open-source eval 框架。eval = Task（dataset）+ Solver（生成答案）+ Scorer（打分）三元组，是 eval harness 的标准实现，支持 coding/agentic/reasoning。教程见 https://inspect.aisi.org.uk/

## 五、沙箱 / 执行环境

凡是让 agent 跑代码的 harness，都要在"隔离强度 vs 启动延迟"上做取舍。

- **[E2B](https://github.com/e2b-dev/E2B)**（5k+）— 开源云沙箱，用 firecracker microVM 做毫秒级冷启隔离。Python/JS SDK 把"agent 生成代码 → 沙箱执行 → 取结果"做成一行调用，是 agent 执行脚手架的事实标准之一。
- **[Daytona](https://github.com/daytonaio/daytona)**（快速增长）— 开源、亚 90ms 启动的安全沙箱，每个沙箱是"完整计算机"（独立内核/文件系统/网络栈）。需要"整台机器"级隔离的 agent 执行环境可选。
- **Docker-in-agent / Jupyter 方案**（生态惯例，非单一仓库）— 很多 harness（OpenHands、SWE-agent、mini-swe-agent）直接用 Docker 容器或 Jupyter kernel 当执行后端，不依赖独立沙箱项目。轻量优先用 Jupyter，隔离优先用容器/microVM。代表：[mini-swe-agent](https://github.com/SWE-agent/mini-swe-agent) 用 subprocess.run，换 docker exec 即可沙箱化。
- 另有 Microsandbox（Rust 自托管 microVM，硬件级隔离）等自托管方案，适合数据合规要求高的团队。

## 跨项目共性设计模式

把这 30 多个项目放一起看，能提炼出贯穿全领域的几条设计模式——这才是值得带走的部分。

**1. 主循环 = 观察 → 思考 → 行动 → 观察（ReAct 变体）。** 几乎所有 agent harness 都收敛到"LLM 决策 → 工具执行 → 结果回灌"的循环。差异只在循环的显式化程度：smolagents 压到 1000 行，LangGraph 显式画成状态图，OpenHands 用事件流抽象。理解这条主循环是 harness 工程的第一性原理。

**2. 评分函数是 eval harness 的心脏。** SWE-bench 的 FAIL_TO_PASS、HumanEval 的 pass@k、Promptfoo 的 YAML 断言、Autoevals 的 model-graded——核心都是"把产出映射成可比数字"。评分函数客观、可执行、抗作弊的程度，决定 eval harness 的价值上限。

**3. 沙箱隔离是 agent harness 的安全底线。** Jupyter（轻、不强隔离）→ Docker（平衡）→ microVM（最强且快），这条权衡轴贯穿整个沙箱子方向。

**4. 轨迹回放与数据飞轮。** LangSmith / Langfuse / Phoenix / Braintrust 都把"每次运行的完整轨迹"存成一等公民：一是 debug（observability），二是把轨迹沉淀成 eval dataset。这条"生产轨迹反哺评测"的飞轮，是连接 agent harness 和 eval harness 的桥梁。

**5. 接口设计本身就是 harness 工程（ACI 思想）。** SWE-agent 的 ACI、Pydantic AI 的类型化工具签名、Cline 的 MCP 工具、lm-eval-harness 的 task 抽象——核心贡献都是"给 LLM 设计了什么接口"，而非"跑得多快"。接口越为 LLM 量身定做，agent 表现越好。

**6. 状态可持久化与可恢复。** LangGraph 的 checkpoint、Plandex 的 plan 版本控制、OpenHands 的事件回放、Cline 的 diff 审批中断恢复——生产级 harness 普遍把"状态可序列化、可分叉、可回滚"做成一等能力。长任务没这条，只是玩具。

**7. 评测即测试，渗透进 CI。** Promptfoo 的 GitHub Action、Braintrust 的 CI eval、OpenCompass 的任务调度——越来越多 harness 把 LLM/prompt 评测当软件测试跑进 CI/CD。这是 eval harness 从"离线研究工具"走向"工程基础设施"的标志。

**8. 开源 → 商业化的高频路径。** Continue 被 Cursor 收购、Promptfoo 被 OpenAI 收购——选型时除了技术指标，还要看项目治理与中立性。自托管优先（Langfuse、Helicone、Phoenix）和被收购但仍开源（Promptfoo）是两类典型形态。

## 小结

如果你的目标是**读懂 harness**，按这个顺序读源码：mini-swe-agent（100 行看主循环）→ smolagents（1000 行看完整 agent）→ Aider（看生产级 edit/repo map）→ OpenHands（看事件驱动 + 沙箱 + 可组合 SDK）。

如果你的目标是**搭 harness**，按这个顺序选：先手搓一个最小 loop（05 篇）→ 需要状态机和恢复就上 LangGraph → 需要多 agent 编排再考虑 CrewAI/AutoGen → 需要评测就接 Langfuse/Phoenix + 自己写评分函数。

下一篇：[03 评测 harness 与 SWE-bench 的三连争议](./03-eval-harness-and-swe-bench.md)，深入评分函数怎么设计、为什么 SWE-bench 排行榜不能全信。

<!-- CONTACT-START -->
<!-- Auto-generated by scripts/inject-contact.sh — 单一真实源: docs/_snippets/contact.html -->
<div align="center">

**「阿新聊 AI」同步更新，欢迎关注**

<br>

<table>
<tr>
<td align="center">📢<br><b>微信公众号</b><br>阿新聊ai</td>
<td align="center">🎵<br><b>抖音</b><br>阿新聊ai</td>
<td align="center">📕<br><b>小红书</b><br>阿新聊ai</td>
<td align="center">💬<br><b>微信</b><br>mindcarver</td>
</tr>
</table>

🌐 AI 社区 · <a href="https://91aihub.com/">91aihub.com</a>

</div>
<!-- CONTACT-END -->
