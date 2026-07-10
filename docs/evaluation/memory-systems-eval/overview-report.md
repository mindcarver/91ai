# AI 记忆系统开源项目深度评测报告

> **可复现性状态：R1（narrative-only / artifacts-not-published）。** 本文保留作者运行和资料调研记录；harness、输入子集与原始 context / answer / judge / score 不在当前仓库，第三方目前不能仅凭本仓库复跑分数。详见[评测可复现性状态](../reproducibility-status.md)。

> 评测时间:2026 年 7 月 3 日。评测对象:13 个主流 AI 记忆系统开源项目。报告包含作者 hands-on 结果、LongMemEval 缩减子集和 L4 资料调研；部分运行存在 LLM、embedding 或回答协议差异，推断与限制在正文中标注。

---

## 一、评测背景与目标

大语言模型(LLM)本身是无状态的:每一次推理只看见当前上下文窗口里的内容。一旦对话超过窗口、或会话结束,模型就"忘记"了一切。为了让 AI agent 真正具备"长期记忆",近两年涌现出一大批开源记忆系统项目。它们都自称"记忆层""长期记忆""agent 记忆",但底层存的"记忆"形状、抽取方式、检索机制、部署成本差异极大。

本次评测的真实问题是:作为 AI agent / Claude Code / 自建 agent 的**记忆后端**,这十几个项目里到底哪个值得采用、哪个只够试点、哪个应该避开?每个项目各自适合什么场景?厂商自报的 benchmark 数字能不能信?

为了回答这些问题,我们不能只读 README。`/ai-evaluator` 方法要求选型判断至少包含 hands-on 验证;只读 README / issue / 源码属于 L4 调研。本文进一步区分证据来源和仓库可复现性:作者 L1 运行可以形成试点线索,但在原始产物未公开、第三方未复跑前,不能单独支撑"现在就采用"。

本次评测最终对其中 8 个项目记录了不同深度的 L1 作者实测证据，对其余 5 个项目（受部署 / Python 版本 / API 摩擦所阻）保留 L4 调研证据。L1 描述证据来源，不代表当前仓库已经发布可复跑产物；不同 L1 运行也不都满足同一协议。

## 二、评测对象清单与初筛修正

本次评测的 13 个对象,来自对 2026 年主流记忆项目清单的检索与人工筛选,涵盖可插拔记忆层、完整 agent 运行时、知识图谱 / 时序图、框架内置记忆模块、MCP 记忆服务器、新颖存储路线六大类。完整清单为:Mem0、Letta(前身 MemGPT)、Zep + Graphiti、Cognee、LangMem、LlamaIndex Memory、Basic Memory、OpenMemory MCP、Reference Memory MCP Server、Universal Memory MCP、Hindsight、Memvid、Supermemory。

在 L4 调研阶段,我们用并行 fan-out 的方式对 13 个项目逐一核查了官方仓库、star 数、license、最近提交、架构、install 命令、依赖、本地 LLM 支持、MCP 支持、云门控、自报 benchmark、已知 issue。这一轮调研本身就纠正了三处对"主流清单"的常见误读,这三处修正对所有后续选型都有价值:

**修正一:"Universal Memory MCP" 不是一个独立的本地记忆系统。** `supermemoryai/supermemory-mcp`(约 1.7k star)实际上只是一个约 262 行的 Cloudflare Worker,其内部代码就是 `new Supermemory({ apiKey: env.SUPERMEMORY_API_KEY })` 然后调用 Supermemory 的云 SDK;它没有 OPENAI_BASE_URL / embedding 配置项,无法指向本地 ollama;其 README 已经标注"MCP v1 is being deprecated"。也就是说,它本质是 Supermemory 云服务的一个 MCP 入口,而不是可自托管的记忆引擎。把它当作"本地记忆后端"候选是一个常见错误。

**修正二:Memvid 已经 pivot,v1 的前提过时。** 很多人对 Memvid 的印象停留在"把记忆编码成 QR 码 / MP4 视频以极大压缩存储"——这是 v1 方案。当前 `memvid/memvid` 仓库的 v2 已经把核心重写为 Rust 单文件 B-tree / WAL / HNSW 存储(`.mv2` 文件),QR / 视频帧已经移除。注意:我们 `pip install memvid` 实测拿到的是 0.1.0 版,仍然是 v1 的 video/QR 路线(`build_video` 接口);研究说的 Rust v2 在 `memvid-sdk` 这个包名下。多数第三方博客和 MCP 教程仍在描述 v1。

**修正三:OpenMemory MCP 正在 sunset。** `mem0ai/mem0` 仓库下的 openmemory 子目录虽然有随主仓的高 star 数,但项目本身有 sunset 通告,将让位于新的 Mem0 自托管 server;而且它的引擎就是 Mem0——单独测 Mem0 即覆盖了它。

这三处修正说明:在记忆系统这个高速演进的领域,"名字 + star 数"非常不可靠,必须落到仓库源码和当前版本去核实。

## 三、评测方法论

为了降低横评误差,本次评测设计了一套方法论,核心由五部分组成:对象画像推导、加权评分量表、公平对比协议、实证评测四纪律、证据分级。当前公开的是方法和结果叙述，不是可由第三方直接执行的复现包。

### 3.1 对象画像推导(维度跟着风险走)

记忆项目不套用通用清单,而是先做"失败模式"推导:如果一个记忆系统出问题,会怎么伤害用户?前三类风险是——返回过期或错误事实(可靠性)、跨用户 / 租户泄露隐私事实(安全隐私)、重复 embedding / 海量抽取导致成本失控(成本)。把这三类风险映射到七个核心维度上,并对它们提权:可靠性与成熟度、安全隐私与可控、成本与见效速度分别从默认权重上调,差异化并入。最终调整后的权重为:决策契合 13、能力证据 20、工作流整合 15、可靠性与成熟度 20、成本与见效速度 13、安全隐私与可控 19,合计 100。同时新增一条专属维度"记忆模型"(事实抽取 / 段落向量 / 画像 / 知识图谱 / 文件 / 视频),因为记忆形状直接决定适用场景,而这是七维量表盖不住的。

### 3.2 公平对比协议(同输入、同指标、同 judge、同后端)

横向比多个候选时,理想的 apples-to-apples 底线是:所有候选跑同一个输入集(自建冒烟集 + LongMemEval 子集)、同一指标定义(recall / answer 正确率)、同一个 judge(固定模型 + 固定 prompt)、同一个后端(固定同一个 LLM 和 embedding)、同一台机器同一版本、多次取方差。厂商自报分数一律标 L3,不与 L1 作者实测分数放同一行直接横比。

作者运行以抽取 / 答题 LLM = qwen2.5:14b(本地 ollama)、embedding = qwen3-embedding:4b、judge = qwen2.5:14b 作为主要基线，但没有覆盖所有结果：部分抽取、reader 或 judge 使用中转站 gpt-5.4；Supermemory、Memvid、Basic Memory 无法使用统一 embedding；Letta 由 agent 直接作答，而其他多数工具走“检索 → 固定 reader”。因此这些分数只能在各自协议内解释，不能声称所有工具在完全相同后端下被比较。

### 3.3 实证评测四纪律(防自欺,比分数更重要)

实证评测最大的风险不是"测不准",而是测出一个看起来合理、实则错误的数字并据此决策。本次评测全程遵守四条纪律:

**纪律一:先画像后端,再测任何工具。** 动手前先用最小请求刻画后端、摸清约束。这些约束会预先决定哪些工具能跑、哪些要绕、哪些会死。当多个工具撞同一堵墙(都缺 embedding、都被某模型截断),后端就是首要发现,要尽早作为元结论提出。本次评测的后端元结论是:中转站(aicodewith relay)无 embedding 模型(embedding 必须留本地 ollama);glm-4.7-flash 是推理模型(20 token 全花在 thinking 上,做 judge 会反复超时,改用非推理 qwen2.5);LongMemEval 每题 haystack 中位约 140K token / 490 条消息,是吞吐杀手。

**纪律二:负分校验门——0 分先怀疑配置。** 记录任何"0 分 / 召回为空 / 任务失败 / 受阻"结论之前,必须先穷尽配置 / API 用法 / ingest 路径排查,并直接查看工具实际存储 / 返回了什么。负数永远比正数更可疑——它可能是你的配置错误而不是工具烂。一个错误的 L1(配置失误导致的 0 分)比没有数据更坏,因为它会冤杀一个本来合格的工具。本次评测中,负分校验门至少拦下了六次冤杀(详见第六节)。

**纪律三:实证深度轴——别把冒烟当权威。** L1–L5 衡量来源可信度,不衡量深度。对实证结果再分一轴:冒烟(管线通不通)、代表性(小基准子集)、权威(完整权威基准)。简单召回是冒烟测试,不是选型依据;工具间的真实分歧要上代表性或权威基准才看得见。

**纪律四:吞吐不外推 + 自动化反噬。** 吞吐 / 成本必须在真实负载下测,不能拿 toy 数据外推;评测期间任何会重置服务 / 清数据 / 自动重启的脚本都是数据完整性风险。

### 3.4 证据分级

报告里的 L1–L5 标记描述证据来源:L1(作者自己 install + 跑 benchmark / 案例集)、L2(独立第三方复现)、L3(厂商自报)、L4(README / issue 等资料调研)、L5(推断)。由于当前仓库仍是 R1、L1 原始证据未发布，报告中的 L1 不等于第三方已验证，也不足以单独支持生产采用。

## 四、评测环境

作者记录的运行环境是一台 Linux(6.17 内核)机器:Python 3.13.11(miniconda)+ uv + pip,Node v24,Docker 29.2.1,ollama 本地已加载多个模型(qwen3-embedding:4b、qwen2.5:14b、qwen2.5-32b-fast、glm-4.7、glm-4.7-flash、qwen3.5-flash 等),磁盘 1.3T 可用,内存 62G。网络对 PyPI / GitHub / HuggingFace / raw.githubusercontent 均可达。这是环境记录；缺少完整依赖和工具版本锁定，当前不足以保证复现。

第二后端是用户提供的 OpenAI 兼容中转站(api.aicodewith.com),默认模型 gpt-5.4,用于 LongMemEval 代表性子集的 reader / judge,以及部分工具在 gpt-5.4 下的重测。中转站确认可用模型包括 gpt-5.4、gpt-5.5、claude-haiku-4-5、claude-opus-4-6、claude-sonnet-4-6、glm-5、glm-4.7、qwen3.5-397b 等共 49 个;gpt-5.4 支持 `response_format: json_object`,单次调用约 2.87 秒。中转站**没有 embedding 模型**(请求 text-embedding-3-small 返回"模型不存在"),所以即便切到 gpt-5.4 做 LLM,embedding 仍必须留在本地 ollama(qwen3-embedding:4b)——这是混合后端,已在相关结论里标注。

值得专门记录的一条后端发现:glm-4.7-flash 是**推理模型**。用 "say OK" + max_tokens=20 探测,它会把这 20 个 token 全部花在内部 thinking 上、可见 content 为空。让它当 LLM-as-judge,每条调用触发长推理链、反复 300 秒超时,12 题判好几个小时。这是本次评测里一个非常具体、可复用的坑:做本地快速 judge / 分类,要用非推理 instruct 模型(qwen2.5:14b 等),不要用 glm-4.7-flash / qwen3.5-flash 这类推理模型。

## 五、实测结果之一:冒烟测试(主要基线 qwen2.5:14b)

冒烟测试集是自建的、独立于任何厂商的 3 会话 / 12 个查询,覆盖四类经典失败模式:抽取丢值、多会话聚合、时序更新、偏好。多数工具采用:reset → 摄入 3 个会话 → 检索 → 固定 reader(qwen2.5:14b)合成答案 → 固定 judge(qwen2.5:14b)判分；但 Letta 由 agent 直接作答，部分工具也使用自带 embedding 或不同抽取模型。冒烟的本质是验证"管线没坏 + 基本能力在",区分度低,不是严格选型排名。

作者运行后的冒烟记分板如下。harness 与原始结果当前未发布；Letta、embedding 不统一工具与固定 reader 组不能严格横比:

| 工具 | 冒烟准确率 | C/P/W | 记忆模型 | 关键观察 |
| --- | ---: | --- | --- | --- |
| Letta(MemGPT) | 100.0% | 12/0/0 | agent 自管(file-text) | agent + glm-4.7 直接作答;协议不同,不可直接排名 |
| Mem0 | 83.3% | 10/1/1 | 事实抽取 | 抽取保留具体值;1 题日期混淆 |
| Memvid | 83.3% | 10/1/1 | 逐字块(无抽取) | 值零丢失,与 Mem0 并列 |
| Supermemory | 66.7% | 8/1/3 | 混合图谱 | embedding 锁死自带 WASM |
| Graphiti | 50.0% | 6/0/6 | 知识图谱 | 抽取丢值:FF 号 / 饮食 / 偏好全丢 |
| LangMem | 41.7% | 5/0/7 | 事实抽取(框架) | 存泛化 memory,具体值不如 Mem0 直接 |
| Basic Memory | 0.0% | 0/0/12 | 关键词图谱 | NL 问句全模式返回 0,非语义 QA 工具 |
| Cognee | BLOCKED | – | 知识图谱 | 结构化输出崩(详见第七节) |

以下是报告保留的几条具体作者运行记录；原始结果未公开，应按 R1 边界解读。

**Letta 在 agent 直接作答协议下记录为 12/12。** 我们用 docker-compose 起了 pgvector + letta_server,用 letta-client 创建 agent(model = ollama/glm-4.7:latest,embedding = ollama/qwen3-embedding:4b),把 3 个会话逐条消息发给 agent(agent 自行通过 tool call 把事实写入 core memory / archival memory),再让 agent 直接回答 12 个问题。该运行答对了频繁乘客号、猫、预算更新、护照、地址、会议日期和出行偏好等问题。其他工具多数走"检索 → 固定 reader 合成答案",因此 Letta 的 12/12 只能描述其自身协议下的运行结果，不能据此断言它在全部工具中最强。

**Mem0 与 Memvid 在小规模上并列 83.3%,但原因完全不同。** Mem0 是事实抽取型,它的 v3 算法在 `add(messages)` 时让抽取 LLM 做一次"只 ADD 不 UPDATE/DELETE"的抽取,把对话蒸馏成原子自然语言事实(例如"User's name is Daniel Okafor and his frequent-flyer number is XQ-7712-3309")再 embed 入库;检索时融合语义、BM25、实体三路信号。它能保留具体值,只有 1 题(会议日期 11/12-15 与到达日 11/11)因抽取时把两个相邻日期轻微混淆而失分。Memvid 完全是另一条路线:它根本不做事实抽取,把会话原文切成块、编码进一个视频 / 索引文件,检索时按相似度返回原始文本块。因为没有抽取这一步,具体值一个不丢,所以小规模上它和 Mem0 打平。这个"打平"非常重要——它恰恰说明冒烟测试区分度低,严肃选型必须上更大规模基准(见第六节)。

**Graphiti 在本次配置下的冒烟记录为 50%。** Graphiti(Zep 的引擎)是 bi-temporal 知识图谱,摄入时 LLM 把会话抽成实体 + 关系 + 边,带有效时间。作者记录在 FalkorDB(端口 6390)上用 gpt-5.4 经中转站抽取时,结果保留了部分关系 / 时序事实,但遗漏了频繁乘客号、饮食限制、猫的数量等值。这只提示当次模型、版本和配置的抽取可能丢值，不足以证明图谱路线或其他配置会系统性失败。

**Basic Memory 0% 不是工具坏了,而是协议不匹配。** Basic Memory 是一个 local-first 的 markdown + sqlite 知识图谱 MCP 工具,核心是 note(笔记)+ 规则式实体 / 关系抽取 + FastEmbed(bge-small-en-v1.5,ONNX,本地)向量。它本身工作完全正常:write-note 写入 markdown 文件并自动建图建索引,search-notes 能检索。但它的检索是关键词 / 实体导向的——关键词查询"frequent-flyer"能命中,而自然语言问句"What is my frequent-flyer number?"在 BM25、纯向量、hybrid 三种模式下全部返回 0 结果。也就是说,它不是一个语义 NL-QA 记忆后端,用它来回答自然语言问题,召回基本失效。这条 0% 是真实的(协议下确实召不回),但部分源于"拿一个 note / KB 工具当 QA memory 用"的错配——这一点必须如实说明,而不是简单说"Basic Memory 很差"。

**Cognee 在本次版本与配置下因 schema 校验失败而 BLOCKED。** 换用 `gpt-5.4` 后失败仍存在，但这不足以证明其他版本、提示或后端也会失败，详见第七节的记录。

## 六、实测结果之二:LongMemEval 缩减子集

冒烟低区分度,严肃选型必须上权威基准。本次用的是 LongMemEval——它是长程对话记忆领域的权威基准,500 题,每题带一个巨大的"草堆"(haystack)对话历史(中位约 140K token / 490 条消息 / 45 个会话),考单会话 / 多会话 recall、时间推理、知识更新、矛盾消解等能力。

作者记录称,Mem0 在一道约 9K token 的缩减题上 20 分钟未完成,因此没有尝试完整 500 题 × 140K token × 多工具运行。本次改用**作者选取的缩减子集**:每题从完整 haystack 里取含答案的 session + 干扰 session,控制到约 9K token,每工具跑 3–4 题,reader / judge 用 gpt-5.4。当前未公开样本 ID、抽样 seed 或子集文件，无法证明该子集具有代表性。它比 12 题冒烟引入了更长上下文和更多任务类型,但仍非完整 500 题基准，结论只能用于生成后续 POC 假设。

LongMemEval 缩减子集的结果如下(reader + judge 使用 gpt-5.4,但工具 embedding、抽取和参与题数并不完全统一):

| 工具 | single-session | multi-session | temporal | knowledge-update | LongMemEval |
| --- | :---: | :---: | :---: | :---: | ---: |
| Supermemory | ✓ | ✗ | ✗ | ✓ | 2/4 = 50% |
| Mem0 | ✓ | ✗ | (跳过) | ✗ | 1/3 ≈ 33% |
| Memvid | ✓ | ✗ | ✗ | ✗ | 1/4 = 25% |
| Graphiti | ✗ | – | ✗ | ✗ | 0/3 = 0% |

这个缩减子集给出一个值得继续验证的观察:**4 个参与工具的结果次序与冒烟不同**。

- 冒烟结果:Mem0 = Memvid(83%)> Supermemory(67%)> Graphiti(50%)
- LongMemEval 缩减子集结果:**Supermemory(2/4)> Mem0(1/3)≈Memvid(1/4)> Graphiti(0/3)**

Supermemory 在参加该缩减子集的 4 个工具中以 2/4 得到本次最高值,并且是这 4 个工具中唯一答对 knowledge-update 题的工具。那道题问"我慈善 5K 跑的个人最好成绩",对话里这个成绩从 27:12 更新为 25:50。该样本提示 Supermemory 的矛盾 / 时序消解值得继续验证；但 2/4 不能代表完整 LongMemEval，也不能外推为 13 个项目中的总体第一。

第二个一致观察是:**本次参加 multi-session 聚合题的工具均未答对**。那道题要数"我要取 / 退几件衣服",正解 3。该样本提示原子事实 / 段落记忆在计数、求和等跨会话聚合任务上可能存在弱点，但单题不足以证明所有同类系统都会失败。

第三个观察是:**Graphiti 的时序优势没有在本次 temporal 样本中兑现**。题目问"两次参观博物馆间隔几天",Graphiti 抽到了相关事实,但 `valid_at` 日期解析报错("Error parsing valid_at date, skipping"),导致日期推理失败。这暴露了当次配置下抽取和日期解析的脆弱性，不能由单题外推为其时序能力被普遍证伪。

作者还记录了一个 Memvid **138K token haystack** single-session 样本(54 个 session → 549 个 QR 帧 → 9MB 视频 + 586KB 索引)，该题答对。这个单样本表明当次路径可以完成一次大上下文编码与检索，但没有重复运行、吞吐数据或其他大样本，不足以判断瓶颈位置或一般化的 multi / temporal / knowledge-update 能力。

## 七、负分校验门:六次拦下的冤杀

负分数(0 分 / 空召回 / 受阻)永远比正数更可疑。本次评测至少拦下了六次"配置错误伪装成工具烂"的冤杀,每一次都通过"直接看工具实际存了什么 / 返回了什么"才翻盘。这些案例本身是评测可信度的关键,也极有参考价值。

**冤杀一:Mem0 的 search API 签名变更。** 第一次跑 Mem0 冒烟,12 题全 0、召回全空。但 adapter 日志显示 3 个会话都"成功摄入"。直接进诊断脚本调 `m.get_all()` 发现事实**全部存进去了**(FF 号、猫名、预算都在)。再调 `m.search(query, user_id=...)`,抛 `ValueError: Top-level entity parameters frozenset({'user_id'}) are not supported in search(). Use filters={'user_id': '...'} instead.`。原来 Mem0 2.0.11 把 `search()` 的顶层 `user_id` 参数移除了,必须用 `filters={"user_id": ...}`。我们用了旧签名,每次 search 抛异常被 try/except 吞成空召回。改成 `filters=` 后立刻 83.3%。一个 API 版本变更差点冤杀 Mem0。

**冤杀二:Cogee 缺 transformers 依赖 + 缺 HF tokenizer 配置。** Cogee 在 ollama 后端下 cognify 反复失败,日志层层套娃:先是 LLM 连接测试 30 秒超时(需 `COGNEE_SKIP_CONNECTION_TEST=true` 绕过);然后首次迁移报错(它"下次调用自动重试",要调两次);然后 `ModuleNotFoundError: No module named 'transformers'`(ollama embedding 需要 HF tokenizer,不在默认 extra 里);装上 transformers 后又 `OSError: None is not a valid HF model`(缺 `HUGGINGFACE_TOKENIZER` 环境变量);最后终于进到 cognify,卡在 `InstructorRetryException`——qwen2.5:14b 经 litellm+instructor 的结构化输出反复失败(8/16/32 秒指数退避)。这是 Cogee 在本地 ollama 下叠加了六层配置摩擦。

**冤杀三(关键):Cognee 的当次 schema 失败在换用 `gpt-5.4` 后仍存在。** 为区分"本地模型太弱"和工具流水线问题,作者记录了一次 `gpt-5.4` 重跑:抽取阶段得到了预期事实,但 cognify 仍报 `pydantic validation error: SummarizedContent.summary Field required`(9 次 / 3 轮 InstructorRetryException)。这说明更强的模型没有解决本次版本和配置下的 schema 契约失败;由于原始日志与版本锁定未公开,不能外推为所有 Cognee 版本或所有 LLM 都会失败。

**冤杀四:Mem0 LongMemEval 的 PostHog 遥测超时。** Mem0 在 LongMemEval 子集上"全 0",但 context 文件空。查 adapter 日志,卡在大量 `ReadTimeoutError: HTTPSConnectionPool(host='us.i.posthog.com')`(SSL 握手超时)——Mem0 的 PostHog 遥测在本机网络不通 posthog.com,反复阻塞。叠加多次 qdrant 本地存储并发锁。在 adapter 里禁掉 PostHog(`POSTHOG_DISABLED=1` + monkeypatch `posthog.capture`)+ 清干净 qdrant 状态后,Mem0 立刻抽出了 20 条事实(含答案),single-session 题答对。表面 0/4 是遥测超时假阴性。

**冤杀五:Supermemory 的 API key + 异步等待。** Supermemory 第一次跑也是全 0——401 Unauthorized("Are you using the right API key?")。原来 supermemory-server 启动时会自动生成一个真实的 `sm_...` key(打印在启动日志里),localhost 自动鉴权要求用这个真 key(或完全不发 key),而 SDK 默认会带 Authorization 头。从日志抓出真 key 后通了;但接着又全 0——因为 Supermemory 的 add 是异步的(返回 `status='queued'`,extractor LLM 在后台跑),`documents.list_processing()` 又不可靠(返回 0 但实际还在队列),adapter 在处理完成前就 search 了。改成"轮询 search 直到非空"的等待逻辑后,Supermemory 正常产出。

**冤杀六:LangMem 的 langgraph search API 变更。** LangMem 第一次跑 12 题 search 全失败:`BaseStore.search() got an unexpected keyword argument 'namespace'`。langgraph 新版把 `search(namespace=...)` 改成了 `search(namespace_prefix=..., /, *, query=...)`(位置参数)。改对之后 LangMem 才正常(最终 41.7%)。

这六次说明:评测的可信度,很大程度上取决于你愿不愿意在看到 0 分时停下来、打开工具的存储看看它到底存了什么、读一读源码确认 API 签名。否则你会得出 Mem0 / Cogee / Supermemory / LangMem "都很烂"这种完全错误的结论。

## 八、关键发现汇总

以下是从作者运行与资料调研中提炼的选型假设。由于当前为 R1、样本小且协议不完全一致，这些不是已被独立复现的通用规律。

**假设一:记忆模型影响适用性,单一分数不足以选型。** 逐字块型倾向保留原文，但本身不提供聚合、时序更新或推理；事实抽取型依赖抽取模型和更新协议；知识图谱型提供关系 / 时序结构，但当次 Graphiti / Cognee 记录暴露了抽取和 schema 契约摩擦；混合 profile 或 agent 自管路线则带来不同的 embedding、闭源组件或运维成本。这些差异应用真实业务数据重新验证。

**发现二:embedding-gap 是横评最大约束。** Supermemory、Memvid、Basic Memory 三者把 embedding 锁死在自带 embedder(Supermemory=WASM bge-base、Memvid=ONNX BGE、Basic Memory=FastEmbed bge-small),无法指向 ollama `/v1/embeddings`,不能用统一 qwen3-embedding。横评它们时必须标注"embedding 不统一"。更广义地,选型第一步要验证"能否完全本地、能否换 embedding 后端",而不是看名字和 star 数。

**发现三:厂商自报 benchmark 全部 L3、不可横比。** 厂商自报分数差异巨大且都自称第一:Mem0 94.4%(但报告引用的独立 Atlan 复现为 49.0%)、Supermemory 81.6%、Hindsight 91.4%(backbone=Gemini-3 Pro)、Memvid 85.65%、Cogee 约 80.3%、Letta 74.0%、Graphiti 63.8%。这些数字用了不同的 judge、embedding、版本或专有模型,完全不可直接横比。本次作者运行减少了部分后端差异，但仍存在 gpt-5.4、工具自带 embedding 和 Letta 直接作答等协议偏差，因此也不能把所有 L1 数字视为严格可比。

**假设四:后端和运行环境会显著影响观测结果。** 作者记录中，禁用 PostHog 超时与清理本地状态后 Mem0 从空结果恢复，judge 从 `glm-4.7-flash` 换到 `qwen2.5` 后不再超时，而 Cognee 换用 `gpt-5.4` 后仍停在当次 schema 校验。这些案例说明必须区分后端、配置、协议和工具行为，但不支持“后端永远比工具更重要”或“某个工具在所有版本都有 bug”。

**发现五:小规模结果容易误导。** 冒烟里 Mem0 = Memvid、Supermemory 较低;4 个工具参加的 LongMemEval 缩减子集中，Supermemory 以 2/4 得到本次最高值。这个变化说明需要更大样本继续验证，不能用任一小规模结果直接定型。

## 九、选型建议矩阵

基于以上全部证据,给出按场景的选型建议(每条都标了证据级别):

- **要"插即用、生态最大、文档最全"** → Mem0(本次冒烟记录 83%;厂商自报 94% 与报告引用的独立复现 49% 差异大;本次本地路线跑通)。
- **要"agent 自管并直接作答"** → Letta(该协议下冒烟 12/12;与固定 reader 组不可直接横比;代价是 pgvector compose 运维,且 agent 路线不 scale 到大 haystack)。
- **要"零依赖、全本地、不丢值、能扛 140K 规模"** → Memvid(L1 冒烟 83%、完整 138K haystack 召回成功;但无聚合 / 时序 / 更新能力,是 RAG 替代)。
- **要"单二进制、自托管、profile + RAG 一体、验证事实更新"** → Supermemory(冒烟 67%;在 4 个工具参加的 LongMemEval 缩减子集中为 2/4,并答对该次 knowledge-update 样本;embedding 锁死自带 WASM 不可换)。
- **要"时序图谱、事实变更追踪"** → Graphiti / Zep(原生 bi-temporal;但本地小模型抽取丢值严重,需强 LLM + FalkorDB / Neo4j;本次 L1 仅 50%、LME 0%)。
- **要"框架内置(已用 LangChain 生态)"** → LangMem(L1 冒烟 41.7%;行为同事实抽取类;版本冲突需注意)。
- **本次不直接采用** → Cognee(当次版本与配置下双后端都停在 schema 校验)、Universal Memory MCP(报告记录为 Supermemory 云代理 + deprecated)、OpenMemory MCP(报告记录为 sunset,引擎即 Mem0)。这些判断均需重新核验当前版本。
- **特定场景** → Basic Memory(本地优先 note / KB,关键词图谱;非语义 QA 记忆,作 QA 用召回失效)、Reference Memory MCP(官方实体-关系-观察参考实现,适合自建 MCP 记忆的起点模板)、Hindsight(自报 91.4% 但 Python 3.13 下因 legacy `use_2to3` 装不上,需 py3.11)、LlamaIndex Memory(框架内置,本版本 FactExtraction / VectorMemoryBlock 在我们环境未产出可检索内容,API 摩擦)。

## 十、风险与未知

本评测的结论有以下边界,使用时务必注意:

第一,LongMemEval 是缩减版(每题约 9K token,非完整 140K;每工具 3–4 题),所以所有 LongMemEval 结论是"先试点"级而非"完整权威基准"级。完整 500 题 × 140K 在本地对抽取类工具不可行(实测 Mem0 单题 dedup 即卡 20 分钟)。

第二,reader(gpt-5.4)偶有幻觉——context 里没有答案时它有时仍会作答(memvid LME single-session 的"对"部分靠 reader 猜中)。这会轻微抬高分数,是"memory + 固定 reader"协议的固有 caveat。

第三,本次本地 qwen2.5:14b 在 Cognee、Graphiti 的结构化抽取上存在限制;换用更强模型改善了 Cognee 的抽取阶段,但没有消除当次 schema 校验失败。这些 BLOCKED / 低分都只绑定当次版本、配置和运行记录，不能直接外推到其他模型或新版本。

第四,各项目证据深度不均。Letta 的 L1 来自不同的 agent 直接作答协议;LlamaIndex、Hindsight、Basic Memory 的 hands-on 记录分别止于 API 摩擦、安装失败和该协议下 0%;Zep 服务端及部分 MCP 项目仍主要由 L4 资料调研支撑。

第五,本评测规划的 harness(适配器、driver、finish、judge)、原始 context / answers / score、证据台账和研究结构化数据原拟放在 `runs/2026-07-03-memory-systems-eval/`,但该目录**不在当前仓库**。现有方法描述不足以保证得到相同分数，第三方也无法在当前仓库中回查原始证据。

## 十一、最终结论

这是一次包含作者 hands-on 运行、缩减子集和负分校验门的评测记录。它的主要价值不是给出"谁第一",而是提出三条需要继续验证的线索:第一,冒烟与缩减子集可能给出不同次序;第二,厂商自报分数因协议差异不可直接横比;第三,"工具问题"和"配置 / 协议不匹配"必须区分。当前结果同样存在后端和回答协议偏差，不能免于这条约束。

如果只能记一句话:**别信任何单一来源的 benchmark 数字,在你自己的真实数据 + 统一协议上重跑一遍,再做采用决策。** 本报告目前只公开了叙述，harness 和原始证据尚未进入仓库。

---

## 十二、评分卡与加权(对象画像推导后的权重)

对象画像推导要求:以默认七维权重为起点,把"如果出问题会怎么伤害用户"的前三大失败模式落到维度上并提权。对记忆项目,三大失败模式是:F1 返回过期或错误事实(→ 可靠性提权)、F2 跨用户 / 租户泄露隐私事实(→ 安全隐私提权)、F3 重复 embedding / 海量抽取致成本失控(→ 成本提权)。从"差异化"里让出分数补给这三类。调整后权重为:决策契合 13、能力证据 20、工作流整合 15、可靠性与成熟度 20、成本与见效速度 13、安全隐私与可控 19,合计 100(差异化并入)。

对取得不同深度 L1 作者实测的工具,给出当次加权评分卡(每维 0–5 分)。由于产物未公开且协议不完全一致，这张表用于生成 POC 假设，不表示“现在就能用”或严格排名:

| 维度(权重) | Letta | Mem0 | Memvid | Supermemory | Graphiti | LangMem | Basic Memory |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 决策契合(13) | 5 | 5 | 3 | 4 | 4 | 3 | 2 |
| 能力证据(20) | 4 | 4 | 3 | 3 | 3 | 3 | 2 |
| 工作流整合(15) | 3 | 5 | 4 | 4 | 3 | 3 | 3 |
| 可靠性与成熟度(20) | 4 | 4 | 3 | 3 | 3 | 3 | 3 |
| 成本与见效速度(13) | 3 | 5 | 5 | 4 | 3 | 3 | 4 |
| 安全隐私与可控(19) | 4 | 4 | 5 | 3 | 4 | 4 | 5 |

Cogee 因该次 schema 校验失败在所有维度上被压低(加权约 42/100),不列入上表。低置信度的 4 分和高置信度的 4 分不一样；Letta 的分数来自不同的 agent 直接作答协议，Basic Memory 的多数判断由 L4 资料支撑，二者都不应脱离证据边界解读。

## 十三、厂商自报 benchmark 解构(为什么全部不可横比)

下表把调研到的厂商自报分数集中呈现,并标注它们为什么不能直接横比:

| 工具 | 自报分 | backbone | judge | embedding | 可比性 |
| --- | --- | --- | --- | --- | --- |
| Mem0 | LongMemEval 93.4(v3) | 未公开 | 未公开 | 未公开 | 独立 Atlan 复现仅 49.0%,差近一倍 |
| Hindsight | 91.4% | Gemini-3 Pro | 未公开 | 未公开 | backbone 极强,本地复现不到 |
| Memvid | 85.65% | 未公开 | gpt-4o + gpt-4o-mini | text-embedding-3-large | 需 memvid.dev 云 key,非本地引擎 |
| Supermemory | 81.6% | 未公开 | 未公开 | 自带 WASM | 无 judge / embedding / 版本公开 |
| Cogee | LoCoMo ~80.3% | 未公开 | DeepEval / Human-LLM | 未公开 | 方法论非标准 LongMemEval |
| Letta | LoCoMo 74.0% | GPT-4o-mini | agent 迭代检索 | 未公开 | filesystem 方案,非 atomic-fact 系统 |
| Graphiti | LongMemEval 63.8% | 未公开 | 未公开 | 未公开 | 独立复现里最高之一 |

每一行的 backbone / judge / embedding / 版本都不一样,有的还含专有模型或必须走云。这就是为什么任何"X 是 LongMemEval 第一"的营销话术都不构成采用依据。本次作者运行也存在不同 embedding 和后端；它只显示 Supermemory 在 4 个工具参加的 3–4 题缩减子集中以 2/4 得到本次最高值，不能称为完整 LongMemEval 排名反转。

## 十四、记忆模型分类深析

理解记忆系统,第一件事是搞清它底层存的"记忆"是什么形状。本次评测把 13 个项目归为六类记忆模型,每一类的失败模式截然不同。

**逐字块 / 段落向量型(Memvid)。** 不做事实抽取,把会话 / 文档切块后检索原始文本。这种路线可以减少抽取阶段丢值，但聚合、时序更新和推理需要额外层。作者记录 Memvid 冒烟为 83%、一道 138K token single-session 题答对、缩减子集为 1/4；这些样本提示了路线边界，但不足以证明其在其他规模和任务下的一般表现。

**事实抽取型(Mem0、LangMem、OpenMemory)。** 摄入时让抽取 LLM 把对话蒸馏成原子自然语言事实,再入库检索。这可以压缩上下文，也会把质量上限绑定到抽取 LLM、更新规则和 reader。本次 Mem0 冒烟记录为 83%、LangMem 为 41.7%，且一道 Mem0 多会话聚合题未答对；单题只能作为需要增加聚合测试的信号。

**知识图谱型(Graphiti、Cognee)。** 摄入时 LLM 抽取实体、关系和时间信息，存入图数据库后检索。它提供结构化与可解释性，也对抽取模型、schema 契约和图库运维提出额外要求。本次 Graphiti 冒烟记录为 50%、缩减子集为 0/3，Cognee 在当次版本和配置下 BLOCKED；这些都不能外推为该类架构的固有结论。

**混合 profile + 图型(Supermemory)。** 摄入时 LLM 抽事实 + 维护用户 profile(static 稳定事实 + dynamic 近期活动)+ 矛盾 / 时序消解 + auto-forgetting,检索是 hybrid(RAG 文档块 + 个性化记忆事实)。优点:在本次 knowledge-update 样本中返回了更新值、单二进制自托管。缺点:embedding 锁死自带 WASM 不可换、图引擎闭源二进制。本次冒烟为 67%;在 4 个工具参加的 LongMemEval 缩减子集中为 2/4。

**agent 自管型 / file-text(Letta)。** 不做独立抽取流水线,把记忆当成操作系统的内存层次(core memory 在上下文里 / archival 向量库 / recall 历史),由 agent 自己通过 tool call 决定往核心记忆写什么、从 archival 检索什么;filesystem 路线直接把原始文件挂给 agent,grep / search_files。优点:原文 / 自管路线减少抽取丢值;本次 agent 直接作答协议为 12/12。缺点:运维重(pgvector)、tool-calling 依赖强模型、agent 路线在大 haystack 上有吞吐压力;该结果不能和固定 reader 组直接排序。

**关键词 / 实体图谱 note 型(Basic Memory、Reference MCP)。** 不做语义抽取,要么由客户端 LLM 手写 markdown 笔记(Basic Memory),要么由客户端维护实体-关系-观察三元组(Reference MCP),检索靠关键词 / 子串 / 规则式图。优点:零 LLM 依赖、完全本地、可解释。缺点:不是语义 QA——对自然语言问句召回差(Basic Memory 全 0)、客户端 LLM 弱则记忆质量差。

选型的第一问应该是:我要哪种形状的记忆?要"记住用户长期画像并能处理事实更新",混合 profile + 图或 agent 自管更合适;要"在大量文档里找片段",逐字块或 RAG 更合适;要"结构化关系 + 时序",知识图谱——但务必配强抽取模型。

## 十五、可复现性附录

当前等级为 **R1**：报告规划的 `runs/2026-07-03-memory-systems-eval/` 目录不在当前仓库，以下仅是作者记录的计划产物结构，不是可访问路径。现有正文不足以保证第三方得到相同分数；升级要求见[评测可复现性状态](../reproducibility-status.md)。

尚未公开的计划产物清单：

- `harness/`:统一 harness。`driver.py`(跑适配器 + 合成 + 判分的 orchestrator)、`finish.py`(可靠的合成 + 判分,替代 driver 偶发的尾部)、`judge.py`(固定 LLM-as-judge,带重试 + 中转站鉴权)、`adapters/run_<tool>.py`(每个工具一个适配器,实现统一的 ingest + search 契约)。
- `media-pack/benchmark-results/smoke_12facts.json`:自建冒烟集(3 会话 / 12 查询,带预期答案 + 失败模式标签)。
- `media-pack/benchmark-results/longmemeval_s.json`:从 HuggingFace 拉取的 LongMemEval 官方数据。
- `media-pack/benchmark-results/lme-subset/`:缩减 haystack 子集 + 完整 138K haystack 子集。
- `media-pack/benchmark-results/smoke-answers/<tool>.{context,answers,judge,score}.json`:每个工具的召回 / 答案 / 判分 / 得分,可逐题核对。
- `evidence-ledger.jsonl`:30 条证据台账,每条含来源类型 / 日期 / 论断 / 置信度 / 素材类型 / 标签 / 保密级别。
- `phaseB-research-results.json`:13 工具的结构化调研数据(架构 / 记忆模型 / 持久化 / 依赖 / install / ollama 支持 / MCP / 云门控 / 自报 benchmark / 已知 issue)。
- `methodology.md` / `brief.md` / `findings.md` / `decision-report.md`:方法论、简报、发现、决策报告。

待上述产物发布后，复跑还需要完整的工具版本、依赖锁定、脱敏配置、实际子集标识和协议元数据。只有在这些条件具备后，才能验证 `context.jsonl` / `answers.jsonl` / `judge.jsonl` 并重算报告分数；当前仓库尚不满足这一条件。
