# AI / 大模型 / Agent 评测专题

**TL;DR：** AI 评测不能只看模型榜单。真正有用的评测要同时回答五个问题：模型会不会、系统稳不稳、工具调得准不准、结果能不能被证据支撑、上线后是否安全可控。这个专题把 AI、大模型、RAG、Agent、AI Coding 和安全红队评测放在一张地图里，帮助你判断该测什么、用什么框架、怎么把评测做成持续回归。

整理日期：2026-06-30。模型榜单和工具能力变化很快，具体分数不要长期复用，评测方法和维度更值得沉淀。

## 先给结论：可以做哪些评测内容

| 层级 | 评测对象 | 核心问题 | 典型指标 |
|------|----------|----------|----------|
| 模型能力评测 | 基座模型、推理模型、代码模型、多模态模型 | 模型本身会什么 | 知识、数学、推理、代码、长上下文、多语言、多模态 |
| LLM 应用评测 | Prompt、结构化输出、聊天助手、摘要、分类 | 同一个系统版本是否退化 | 格式通过率、事实性、一致性、成本、延迟、失败率 |
| RAG 评测 | 知识库、检索链路、引用回答 | 找得对不对，答得有没有依据 | context precision、recall、faithfulness、citation、权限过滤 |
| Agent 评测 | 工具调用、浏览器任务、工作流、多轮任务 | 是否能完成真实任务 | task success、tool accuracy、trajectory、recovery、step cost |
| AI Coding 评测 | 编程模型、CLI Agent、IDE Agent | 能不能改真实仓库 | issue resolve、测试通过、diff 质量、越权操作、review 成本 |
| 安全红队评测 | 模型与应用的风险边界 | 会不会被诱导、越权或泄露 | jailbreak 成功率、拒答稳健性、prompt injection、PII 泄露 |
| 生产运行评测 | 已上线 AI 系统 | 线上是否稳定变好 | trace 覆盖率、漂移、人工复核一致率、p95 延迟、单位任务成本 |

一个好的评测专题不应该只收集榜单，而要沉淀三类资产：

1. **评测地图**：不同类型 AI 系统应该测哪些维度。
2. **评测框架索引**：哪些开源项目、论文和工具能复用。
3. **91ai 自建协议**：面向真实工具、真实项目、真实任务的可复现评测模板。

## 一、模型能力评测

模型能力评测适合回答“这个模型作为底座强不强”。它不等于应用质量评测，但能帮助做模型初筛。

| 方向 | 评测什么 | 可参考项目 |
|------|----------|------------|
| 通用能力 | 知识、推理、数学、常识、多任务 | [HELM](https://crfm.stanford.edu/helm/latest/)、[lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness)、[Open LLM Leaderboard](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard)、[MMLU](https://arxiv.org/abs/2009.03300) |
| 人类偏好 | 对话质量、写作、帮助性、综合体验 | [LMArena](https://lmarena.ai/leaderboard) |
| 代码能力 | 函数补全、代码生成、仓库级修复 | [HumanEval](https://github.com/openai/human-eval)、[BigCodeBench](https://bigcode-bench.github.io/)、[SWE-bench](https://www.swebench.com/) |
| 自建模型回归 | 模型版本切换后的私有任务表现 | [OpenAI Evals](https://github.com/openai/evals)、[simple-evals](https://github.com/openai/simple-evals)、[Inspect](https://inspect.aisi.org.uk/) |

使用建议：

- 用公开 benchmark 做模型初筛，不要把公开榜单当成业务结论。
- 对业务场景建私有 eval，因为公开题很难覆盖你的真实输入、约束和风险。
- 分开看能力、成本、延迟和稳定性。能力强但太慢、太贵、格式不稳，应用里仍可能不可用。

## 二、LLM 应用评测

LLM 应用评测关注的是完整系统，不是模型裸输出。它适合回答“这个 AI 功能能不能上线、改版后有没有退化”。

| 评测内容 | 看什么 | 适合工具 |
|----------|--------|----------|
| Prompt 回归 | 同一批样本在 prompt 变更后是否退化 | [Promptfoo](https://www.promptfoo.dev/docs/intro/)、[OpenAI Evals](https://github.com/openai/evals) |
| 输出格式 | JSON Schema、字段完整性、非法值、解析失败率 | 规则检查、代码 grader、DeepEval |
| 事实性与完整性 | 是否回答正确、是否覆盖必须点 | [DeepEval](https://deepeval.com/docs/getting-started)、LLM-as-judge、人工抽样 |
| 多轮对话 | 记忆是否正确、上下文是否污染、是否跑题 | LangSmith、Phoenix、TruLens |
| 版本对比 | 模型、prompt、检索策略、工具版本谁更好 | [Phoenix](https://arize.com/docs/phoenix)、[LangSmith Evaluation](https://docs.smith.langchain.com/evaluation)、[TruLens](https://www.trulens.org/) |

关键原则：

- 评测输入要来自真实用户、历史失败、边界样本和高风险样本。
- 报告要按标签拆分，不要只看平均分。
- LLM-as-judge 必须用人工标注样本校准，否则它只是另一个不稳定模型。

## 三、RAG 评测

RAG 评测要拆成“检索是否正确”和“回答是否基于检索”两段。很多 RAG 问题不是模型差，而是文档解析、切分、检索、rerank 或权限过滤出了问题。

| 维度 | 问题 | 指标 |
|------|------|------|
| 检索召回 | 正确资料有没有被找出来 | context recall、hit rate、MRR |
| 检索精度 | 找出来的资料是否相关 | context precision、noise sensitivity |
| 答案忠实度 | 回答是否被上下文支持 | faithfulness、groundedness |
| 引用质量 | 引用是否存在、可访问、能支撑结论 | citation accuracy、source coverage |
| 权限安全 | 是否检索或输出无权限资料 | permission violation count |
| 知识更新 | 新资料是否及时生效，删除是否生效 | freshness、delete propagation |

可参考：

- [Ragas](https://docs.ragas.io/)：覆盖 RAG、Agent、工具调用、自然语言比较等指标，适合快速建立系统化评测。
- [TruLens](https://www.trulens.org/)：强调 tracing + eval，适合观察 retrieved context、tool calls、plans 等执行流。
- [Phoenix](https://arize.com/docs/phoenix)：适合把 traces、evals、datasets、experiments 放到一个调试和迭代工作流里。
- 91ai 已有文档：[RAG 评估与微调](../agent/ai-app-tutorials/rag/rag-eval-and-finetuning.md)。

### 91ai 实测专题：四大开源知识库平台 RAG 横评

同一台机器、同一个本地 Ollama 下，把 MaxKB / RAGFlow / FastGPT / Dify 四个开源知识库平台纯私有化部署，跑过 4 个不同形态的数据集（英文技术文本、文本型 PDF、中文段落、扫描/图像文档），全部一手实测、可复现：

- [四大开源知识库平台 RAG 实测横评](kb-rag-platform-benchmark.md)：主报告，含 4 数据集 × 4 平台召回矩阵、多维评分、纯 API 自动化摩擦、共享 Ollama 并发死锁等工程发现。
- [MaxKB 技术架构与实现原理](maxkb-architecture.md)：单容器 + PostgreSQL/pgvector 混合检索、split→batch_create 数据流。
- [RAGFlow 技术架构与实现原理](ragflow-architecture.md)：DeepDoc（OCR/版式/表格）+ ES/Infinity 多服务架构、task_executor pipeline。
- [FastGPT 技术架构与实现原理](fastgpt-architecture.md)：Next.js + MongoDB + 三层模型系统（aiproxy/plugin/mongo）、LiteParse 与 pdfjs 的 PDF 解析坑。
- [Dify 技术架构与实现原理](dify-architecture.md)：Flask + 插件市场 + 新一代 RAG pipeline、base64 密码与 CSRF 鉴权连环坑。

核心结论：文本类场景四家都够用（Dify 最稳），扫描/图像文档只有 RAGFlow（DeepDoc OCR）可用；纯 API 自动化摩擦度 MaxKB 最低、Dify 最高。

### 91ai 实测专题：AI 记忆系统开源项目评测

13 个主流 AI 记忆系统开源项目（Mem0 / Supermemory / Letta / Zep+Graphiti / Cognee / Memvid / LangMem / LlamaIndex / Hindsight / Basic Memory / OpenMemory / Universal Memory / Reference Memory MCP），统一本地后端（ollama）+ 公平对比协议 + 负分校验门，全部一手实测：

- [AI 记忆系统评测专题总览](./memory-systems-eval/)：总索引，含选型矩阵、核心结论速览、三个头条发现（LongMemEval 排名反转、厂商自报分全不可横比、Cognee schema bug）。
- [13 篇项目逐一详解](./memory-systems-eval/)：每篇 1 万+ 字，覆盖技术架构、实现原理、数据流、实测分数与坑。

视角分工：本专题给"能不能用、分数多少、坑在哪"；同一批项目另有[架构解读版](../agent/ai-app-tutorials/rag/memory-systems/README.md)给"怎么设计、怎么选型、怎么评估"。

## 四、Agent 评测

Agent 评测不能只看最终答案。Agent 的核心风险在过程：工具选错、参数错、重复调用、失败不恢复、越权操作、成本失控。

| 维度 | 评测问题 |
|------|----------|
| Task success | 最终任务是否完成，完成定义是否清晰 |
| Tool selection | 是否选择了正确工具，是否该不用工具却用了工具 |
| Argument correctness | 工具参数是否正确、完整、符合 schema |
| Trajectory quality | 中间步骤是否合理，有没有绕远、循环、幻觉观察 |
| Recovery | 工具失败、超时、返回空结果后能否恢复 |
| Human control | 高风险操作是否请求人工确认 |
| Cost / latency | 工具调用次数、token、耗时是否可接受 |
| Safety | 是否泄露、越权、误写生产系统 |

可参考基准：

| 项目 | 适合看什么 |
|------|------------|
| [AgentBench](https://github.com/THUDM/AgentBench) | 操作系统、数据库、知识图谱、网页购物、网页浏览等多环境 Agent 任务 |
| [GAIA](https://huggingface.co/spaces/gaia-benchmark/leaderboard) | 面向通用 AI 助手的复杂现实任务 |
| [WebArena](https://webarena.dev/) | Web 浏览和交互式任务 |
| [Mind2Web](https://github.com/OSU-NLP-Group/Mind2Web) | 通用 Web Agent 的跨网站任务 |
| [ToolBench](https://github.com/OpenBMB/ToolBench) | 工具学习、工具调用和 API 使用能力 |
| [SWE-bench](https://www.swebench.com/) | 代码 Agent 解决真实 GitHub issue 的能力 |

91ai 自建 Agent 评测应该优先做这些任务：

1. GitHub issue triage：读 issue、分类、找相关文件、给修复建议。
2. 文档 RAG agent：检索资料、引用来源、判断资料不足。
3. 客服工单 agent：多轮澄清、查知识库、生成结构化处理结果。
4. 数据分析 agent：读表、写查询、解释结果、标注不确定性。
5. 自动化 workflow agent：需要工具调用、人工确认、失败恢复。

## 五、AI Coding 评测

AI Coding 评测是 Agent 评测里最容易做实战验证的一类，因为结果可以用测试、diff、review 和仓库状态检查。

| 维度 | 具体看什么 |
|------|------------|
| 任务完成 | 是否真正解决 issue，而不是只改表面 |
| 测试通过 | 是否补测试，是否跑对测试 |
| Diff 质量 | 改动是否小而聚焦，是否引入无关重构 |
| 代码理解 | 是否读对入口、依赖、边界条件 |
| 安全边界 | 是否读取密钥、改危险文件、执行高风险命令 |
| 协作质量 | 是否能解释取舍、列出未跑检查和残余风险 |

可参考：

- [SWE-bench](https://github.com/SWE-bench/SWE-bench)：真实 GitHub issue 级别的软件工程任务。
- [BigCodeBench](https://github.com/bigcode-project/bigcodebench)：更偏代码生成能力和真实函数级任务。
- [HumanEval](https://github.com/openai/human-eval)：经典函数级代码生成评测，适合作为基础能力参考。
- 91ai 已有文档：[Skill 实战评测协议](../ai-coding/skill-realworld-evaluation-protocol.md)。

## 六、安全与红队评测

安全评测要覆盖模型、Prompt、RAG、工具权限和运行环境。越接近生产系统，越不能只问“模型会不会拒答”。

| 风险 | 测什么 |
|------|--------|
| Jailbreak | 是否被诱导输出禁止内容 |
| Prompt injection | 外部文档、网页、工具结果能否覆盖系统指令 |
| 数据泄露 | 是否泄露系统提示词、密钥、PII、其他租户数据 |
| 工具越权 | 是否调用了不该调用的写操作或高权限工具 |
| 拒答过度 | 是否把正常请求错误拒绝 |
| 不安全建议 | 医疗、法律、金融、安全相关建议是否越界 |

可参考：

- [HarmBench](https://github.com/centerforaisafety/HarmBench)：自动红队和拒答稳健性的标准化评测框架。
- [SafetyBench](https://github.com/thu-coai/SafetyBench)：大模型安全能力评测。
- [Inspect](https://inspect.aisi.org.uk/)：AI Safety Institute 的评测框架，覆盖 scoring、agents、tools 等组件。
- 91ai 已有文档：[Agent 安全与失败模式](../agent/ai-app-tutorials/agent-workflow/agent-security-and-failure-modes.md)。

## 七、生产运行评测

上线后的评测比离线 benchmark 更重要。生产评测不是每天手工问模型，而是把真实流量、trace、人工反馈和失败样本接入回归系统。

最小生产评测闭环：

```text
线上请求
  -> Trace 记录输入、检索、Prompt、模型、工具、输出
  -> 抽样进入人工/模型评分
  -> 失败样本打标签
  -> 回流到离线 eval dataset
  -> 下一次发布前作为回归门禁
```

必须跟踪：

- 任务成功率；
- 高风险样本通过率；
- 幻觉和引用错误；
- 权限泄露；
- 用户纠错率；
- 人工接管率；
- p50 / p95 延迟；
- 单次任务成本；
- 模型评分和人工评分一致率。

## 评测工具选型

| 你要做什么 | 优先选 |
|------------|--------|
| 快速跑公开模型能力基准 | lm-evaluation-harness、HELM、Open LLM Leaderboard |
| 做 OpenAI / API 模型私有回归 | OpenAI Evals、simple-evals、Promptfoo |
| 做 RAG 指标 | Ragas、TruLens、Phoenix |
| 做 Agent trace 和实验对比 | LangSmith、Phoenix、TruLens、DeepEval |
| 做 AI Coding / 仓库级任务 | SWE-bench、自建真实仓库任务集 |
| 做安全红队 | HarmBench、SafetyBench、Inspect |
| 做团队自己的上线门禁 | 小型私有 dataset + rules grader + LLM judge + 人工抽样 |

## 91ai 后续可以沉淀的专题资产

这个专题建议后续拆成 6 个子专题：

| 子专题 | 目标产出 |
|--------|----------|
| 模型榜单与 benchmark 解读 | 解释 HELM、MMLU、LMArena、SWE-bench 等榜单怎么读、怎么误读 |
| LLM 应用 Eval 实战 | 从 50 条样本开始搭建 prompt / app 回归测试 |
| RAG 评测实战 | 文档解析、检索、引用、faithfulness、权限的完整测试集 |
| Agent 评测实战 | tool call、trajectory、recovery、cost、human-in-the-loop 的评测模板 |
| AI Coding 工具横评 | Claude Code、Codex、Cursor、Cline、Gemini CLI 的同任务实战评测 |
| AI 安全红队模板 | prompt injection、jailbreak、数据泄露、工具越权的测试用例库 |

优先级建议：

1. 先做 **LLM 应用 Eval 实战**，因为它能复用到所有 AI 应用。
2. 再做 **RAG 评测实战**，这是企业知识库最容易踩坑的地方。
3. 然后做 **Agent 评测实战**，重点看工具调用轨迹和失败恢复。
4. 最后做 **AI Coding 工具横评** 和 **安全红队模板**，需要更强的任务设计和证据留存。

## 最小自建评测模板

```json
{
  "id": "agent-tool-001",
  "task": "根据客户问题查询知识库并生成工单处理建议",
  "input": "客户说发票金额和合同金额不一致，应该怎么处理？",
  "context": {
    "user_role": "support",
    "tenant_id": "demo"
  },
  "expected": {
    "must_use_tools": ["search_policy"],
    "must_include": ["核对合同金额", "核对发票金额", "升级财务复核"],
    "must_not_include": ["其他客户合同信息"],
    "citation_required": true
  },
  "tags": ["rag", "agent", "permission", "finance"],
  "risk": "high",
  "graders": ["tool_call", "citation", "coverage", "permission", "cost"]
}
```

最小通过规则：

```text
高风险样本通过率 = 100%
权限泄露 = 0
工具参数错误率 <= 2%
引用错误率 <= 5%
结构化输出通过率 >= 99%
p95 延迟 <= 业务 SLA
平均成本不超过 baseline 20%
```

## 和现有 91ai 文档的关系

- [Eval 评估体系](../agent/ai-app-tutorials/engineering-ops/eval-system.md)：讲如何把 AI 质量做成回归测试。
- [RAG 评估与微调](../agent/ai-app-tutorials/rag/rag-eval-and-finetuning.md)：专门讲 RAG 评估指标和优化闭环。
- [AI Agent 记忆系统专题](../agent/ai-app-tutorials/rag/memory-systems/README.md)：包含长期记忆系统的评测方法和项目对比。
- [AI 记忆系统评测专题](./memory-systems-eval/)：13 个开源记忆项目实测横评（冒烟 + LongMemEval + 负分校验门），是上面架构专题的实测补充。
- [AI / Agent 面试专题](../agent/ai-app-tutorials/interview/README.md)：评测也是一线 AI 应用岗和 Agent 岗的高频追问点。

## 核心判断

评测不是为了证明模型“很强”，而是为了决定系统“能不能交付”。公开 benchmark 适合初筛，自建 eval 才能决定上线。对 91ai 来说，最有价值的方向不是再复制一个榜单，而是沉淀可复现的真实任务评测：有任务、有输入、有日志、有失败样本、有成本、有结论。
