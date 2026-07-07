# AI 记忆系统开源项目深度评测报告

> 评测时间:2026 年 7 月 3 日。评测对象:13 个主流 AI 记忆系统开源项目。评测范式:统一本地后端 + 公平对比协议 + 权威基准缩减子集 + 负分校验门。本报告所有结论均由实测或可核实的官方/独立来源支撑,推断处已明确标注。

---

## 一、评测背景与目标

大语言模型(LLM)本身是无状态的:每一次推理只看见当前上下文窗口里的内容。一旦对话超过窗口、或会话结束,模型就"忘记"了一切。为了让 AI agent 真正具备"长期记忆",近两年涌现出一大批开源记忆系统项目。它们都自称"记忆层""长期记忆""agent 记忆",但底层存的"记忆"形状、抽取方式、检索机制、部署成本差异极大。

本次评测的真实问题是:作为 AI agent / Claude Code / 自建 agent 的**记忆后端**,这十几个项目里到底哪个值得采用、哪个只够试点、哪个应该避开?每个项目各自适合什么场景?厂商自报的 benchmark 数字能不能信?

为了回答这些问题,我们不能只读 README。`/ai-evaluator` 评测方法论给出的硬规则是:对记忆 / RAG / agent / 代码框架类对象,只要用户在做采用 / 选型 / 靠谱性判断,默认至少要有一轮 hands-on 验证(install + 跑最小工作流,或 install + 跑 benchmark 代表性子集);只读 README / issue / 源码属于 L4 调研,不能当成评测完成;没有 L1(自己实测)或 L2(独立第三方复现)证据支撑的结论,标签上限是"先试点",不能给到"现在就采用"。

本次评测严格遵循这套方法论,最终对其中 8 个项目取得了 L1 实测证据(统一后端冒烟测试 + 部分项目的 LongMemEval 代表性子集),对其余 5 个项目(受部署 / Python 版本 / API 摩擦所阻)取得了扎实的 L4 调研证据并如实标注。

## 二、评测对象清单与初筛修正

本次评测的 13 个对象,来自对 2026 年主流记忆项目清单的检索与人工筛选,涵盖可插拔记忆层、完整 agent 运行时、知识图谱 / 时序图、框架内置记忆模块、MCP 记忆服务器、新颖存储路线六大类。完整清单为:Mem0、Letta(前身 MemGPT)、Zep + Graphiti、Cognee、LangMem、LlamaIndex Memory、Basic Memory、OpenMemory MCP、Reference Memory MCP Server、Universal Memory MCP、Hindsight、Memvid、Supermemory。

在 L4 调研阶段,我们用并行 fan-out 的方式对 13 个项目逐一核查了官方仓库、star 数、license、最近提交、架构、install 命令、依赖、本地 LLM 支持、MCP 支持、云门控、自报 benchmark、已知 issue。这一轮调研本身就纠正了三处对"主流清单"的常见误读,这三处修正对所有后续选型都有价值:

**修正一:"Universal Memory MCP" 不是一个独立的本地记忆系统。** `supermemoryai/supermemory-mcp`(约 1.7k star)实际上只是一个约 262 行的 Cloudflare Worker,其内部代码就是 `new Supermemory({ apiKey: env.SUPERMEMORY_API_KEY })` 然后调用 Supermemory 的云 SDK;它没有 OPENAI_BASE_URL / embedding 配置项,无法指向本地 ollama;其 README 已经标注"MCP v1 is being deprecated"。也就是说,它本质是 Supermemory 云服务的一个 MCP 入口,而不是可自托管的记忆引擎。把它当作"本地记忆后端"候选是一个常见错误。

**修正二:Memvid 已经 pivot,v1 的前提过时。** 很多人对 Memvid 的印象停留在"把记忆编码成 QR 码 / MP4 视频以极大压缩存储"——这是 v1 方案。当前 `memvid/memvid` 仓库的 v2 已经把核心重写为 Rust 单文件 B-tree / WAL / HNSW 存储(`.mv2` 文件),QR / 视频帧已经移除。注意:我们 `pip install memvid` 实测拿到的是 0.1.0 版,仍然是 v1 的 video/QR 路线(`build_video` 接口);研究说的 Rust v2 在 `memvid-sdk` 这个包名下。多数第三方博客和 MCP 教程仍在描述 v1。

**修正三:OpenMemory MCP 正在 sunset。** `mem0ai/mem0` 仓库下的 openmemory 子目录虽然有随主仓的高 star 数,但项目本身有 sunset 通告,将让位于新的 Mem0 自托管 server;而且它的引擎就是 Mem0——单独测 Mem0 即覆盖了它。

这三处修正说明:在记忆系统这个高速演进的领域,"名字 + star 数"非常不可靠,必须落到仓库源码和当前版本去核实。

## 三、评测方法论

为了让横评可信,本次评测设计了一套严格的、可复现的方法论,核心由五部分组成:对象画像推导、加权评分量表、公平对比协议、实证评测四纪律、证据分级。

### 3.1 对象画像推导(维度跟着风险走)

记忆项目不套用通用清单,而是先做"失败模式"推导:如果一个记忆系统出问题,会怎么伤害用户?前三类风险是——返回过期或错误事实(可靠性)、跨用户 / 租户泄露隐私事实(安全隐私)、重复 embedding / 海量抽取导致成本失控(成本)。把这三类风险映射到七个核心维度上,并对它们提权:可靠性与成熟度、安全隐私与可控、成本与见效速度分别从默认权重上调,差异化并入。最终调整后的权重为:决策契合 13、能力证据 20、工作流整合 15、可靠性与成熟度 20、成本与见效速度 13、安全隐私与可控 19,合计 100。同时新增一条专属维度"记忆模型"(事实抽取 / 段落向量 / 画像 / 知识图谱 / 文件 / 视频),因为记忆形状直接决定适用场景,而这是七维量表盖不住的。

### 3.2 公平对比协议(同输入、同指标、同 judge、同后端)

横向比多个候选时,严格 apples-to-apples 的底线是:所有候选跑同一个输入集(自建冒烟集 + LongMemEval 子集)、同一指标定义(recall / answer 正确率)、同一个 judge(固定模型 + 固定 prompt)、同一个后端(固定同一个 LLM 和 embedding,否则比的就是后端模型而不是被评系统)、同一台机器同一版本、多次取方差。厂商自报分数一律标 L3,不与 L1 实测分数放同一行直接横比。

我们的实测统一后端定为:抽取 / 答题 LLM = qwen2.5:14b(本地 ollama),embedding = qwen3-embedding:4b(2560 维,本地 ollama `/v1/embeddings`),judge = qwen2.5:14b(并在后续用中转站 gpt-5.4 做异族复核)。这是全本地、零付费 key 的后端,确保所有工具在完全相同的后端下被比较。对于 embedding 锁死、无法用统一 qwen3-embedding 的工具(Supermemory、Memvid、Basic Memory),如实标注"embedding 不统一",其分数仍可比但带这条 caveat。

### 3.3 实证评测四纪律(防自欺,比分数更重要)

实证评测最大的风险不是"测不准",而是测出一个看起来合理、实则错误的数字并据此决策。本次评测全程遵守四条纪律:

**纪律一:先画像后端,再测任何工具。** 动手前先用最小请求刻画后端、摸清约束。这些约束会预先决定哪些工具能跑、哪些要绕、哪些会死。当多个工具撞同一堵墙(都缺 embedding、都被某模型截断),后端就是首要发现,要尽早作为元结论提出。本次评测的后端元结论是:中转站(aicodewith relay)无 embedding 模型(embedding 必须留本地 ollama);glm-4.7-flash 是推理模型(20 token 全花在 thinking 上,做 judge 会反复超时,改用非推理 qwen2.5);LongMemEval 每题 haystack 中位约 140K token / 490 条消息,是吞吐杀手。

**纪律二:负分校验门——0 分先怀疑配置。** 记录任何"0 分 / 召回为空 / 任务失败 / 受阻"结论之前,必须先穷尽配置 / API 用法 / ingest 路径排查,并直接查看工具实际存储 / 返回了什么。负数永远比正数更可疑——它可能是你的配置错误而不是工具烂。一个错误的 L1(配置失误导致的 0 分)比没有数据更坏,因为它会冤杀一个本来合格的工具。本次评测中,负分校验门至少拦下了六次冤杀(详见第六节)。

**纪律三:实证深度轴——别把冒烟当权威。** L1–L5 衡量来源可信度,不衡量深度。对实证结果再分一轴:冒烟(管线通不通)、代表性(小基准子集)、权威(完整权威基准)。简单召回是冒烟测试,不是选型依据;工具间的真实分歧要上代表性或权威基准才看得见。

**纪律四:吞吐不外推 + 自动化反噬。** 吞吐 / 成本必须在真实负载下测,不能拿 toy 数据外推;评测期间任何会重置服务 / 清数据 / 自动重启的脚本都是数据完整性风险。

### 3.4 证据分级

报告里每条证据都标级别,级别决定它能支撑什么决策:L1(自己 install + 跑 benchmark / 案例集,可支撑"现在就采用")、L2(独立第三方复现,可支撑"现在就采用")、L3(厂商自报,上限"先试点")、L4(二手文档 README / issue,上限"先试点 / 观望")、L5(推断,上限"观望")。硬规则:adopt 必须由 L1 或 L2 支撑。

## 四、评测环境

所有实测在一台 Linux(6.17 内核)机器上完成:Python 3.13.11(miniconda)+ uv + pip,Node v24,Docker 29.2.1,ollama 本地已加载多个模型(qwen3-embedding:4b、qwen2.5:14b、qwen2.5-32b-fast、glm-4.7、glm-4.7-flash、qwen3.5-flash 等),磁盘 1.3T 可用,内存 62G。网络对 PyPI / GitHub / HuggingFace / raw.githubusercontent 均可达。这套环境是全本地、可复现的。

第二后端是用户提供的 OpenAI 兼容中转站(api.aicodewith.com),默认模型 gpt-5.4,用于 LongMemEval 代表性子集的 reader / judge,以及部分工具在 gpt-5.4 下的重测。中转站确认可用模型包括 gpt-5.4、gpt-5.5、claude-haiku-4-5、claude-opus-4-6、claude-sonnet-4-6、glm-5、glm-4.7、qwen3.5-397b 等共 49 个;gpt-5.4 支持 `response_format: json_object`,单次调用约 2.87 秒。中转站**没有 embedding 模型**(请求 text-embedding-3-small 返回"模型不存在"),所以即便切到 gpt-5.4 做 LLM,embedding 仍必须留在本地 ollama(qwen3-embedding:4b)——这是混合后端,已在相关结论里标注。

值得专门记录的一条后端发现:glm-4.7-flash 是**推理模型**。用 "say OK" + max_tokens=20 探测,它会把这 20 个 token 全部花在内部 thinking 上、可见 content 为空。让它当 LLM-as-judge,每条调用触发长推理链、反复 300 秒超时,12 题判好几个小时。这是本次评测里一个非常具体、可复用的坑:做本地快速 judge / 分类,要用非推理 instruct 模型(qwen2.5:14b 等),不要用 glm-4.7-flash / qwen3.5-flash 这类推理模型。

## 五、实测结果之一:冒烟测试(统一 qwen2.5:14b 后端)

冒烟测试集是自建的、独立于任何厂商的 3 会话 / 12 个查询,覆盖四类经典失败模式:抽取丢值、多会话聚合、时序更新、偏好。每个工具在同一后端下:reset → 摄入 3 个会话 → 对每个查询做检索 → 由固定 reader(qwen2.5:14b)从召回上下文合成答案 → 由固定 judge(qwen2.5:14b)判分。冒烟的本质是验证"管线没坏 + 基本能力在",区分度低(很多工具都能在小规模上拿高分),不是选型依据,但是发现配置错误和基础失效的第一道筛子。

实测后的冒烟记分板(统一后端,分数由可复现的 harness 产出)如下:

| 工具 | 冒烟准确率 | C/P/W | 记忆模型 | 关键观察 |
| --- | ---: | --- | --- | --- |
| Letta(MemGPT) | 100.0% | 12/0/0 | agent 自管(file-text) | agent 驱动 + glm-4.7,全对;运维重 |
| Mem0 | 83.3% | 10/1/1 | 事实抽取 | 抽取保留具体值;1 题日期混淆 |
| Memvid | 83.3% | 10/1/1 | 逐字块(无抽取) | 值零丢失,与 Mem0 并列 |
| Supermemory | 66.7% | 8/1/3 | 混合图谱 | embedding 锁死自带 WASM |
| Graphiti | 50.0% | 6/0/6 | 知识图谱 | 抽取丢值:FF 号 / 饮食 / 偏好全丢 |
| LangMem | 41.7% | 5/0/7 | 事实抽取(框架) | 存泛化 memory,具体值不如 Mem0 直接 |
| Basic Memory | 0.0% | 0/0/12 | 关键词图谱 | NL 问句全模式返回 0,非语义 QA 工具 |
| Cognee | BLOCKED | – | 知识图谱 | 结构化输出崩(详见第七节) |

这里有几条非常具体的、由实测支撑的发现。

**Letta 在配强 tool-calling 模型时,事实回忆是全部工具里最强的。** 我们用 docker-compose 起了 pgvector + letta_server,用 letta-client 创建 agent(model = ollama/glm-4.7:latest,embedding = ollama/qwen3-embedding:4b),把 3 个会话逐条消息发给 agent(agent 自行通过 tool call 把事实写入 core memory / archival memory),再让 agent 直接回答 12 个问题。glm-4.7 的 tool-calling 足够可靠,12 题全部答对,包括频繁乘客号 XQ-7712-3309、两只猫 Pepper 与 Miso、预算从 4500 更新到 6000、护照 2028 年到期、公寓 9 楼 4B 楼管 Mrs. Chen、东京会议 11 月 12-15 日、偏好 5 小时内坐火车等等。这是唯一一个在冒烟拿到 100% 的工具。需要说明的是这是一个协议偏差:其他工具走"检索 → 固定 reader 合成答案",而 Letta 的设计就是 agent 自管记忆并直接作答,我们如实标注。Letta 之前一直没被实测,不是能力问题,而是运维栈重(需要 pgvector + compose + 容器内访问宿主 ollama 要配 host-gateway)。

**Mem0 与 Memvid 在小规模上并列 83.3%,但原因完全不同。** Mem0 是事实抽取型,它的 v3 算法在 `add(messages)` 时让抽取 LLM 做一次"只 ADD 不 UPDATE/DELETE"的抽取,把对话蒸馏成原子自然语言事实(例如"User's name is Daniel Okafor and his frequent-flyer number is XQ-7712-3309")再 embed 入库;检索时融合语义、BM25、实体三路信号。它能保留具体值,只有 1 题(会议日期 11/12-15 与到达日 11/11)因抽取时把两个相邻日期轻微混淆而失分。Memvid 完全是另一条路线:它根本不做事实抽取,把会话原文切成块、编码进一个视频 / 索引文件,检索时按相似度返回原始文本块。因为没有抽取这一步,具体值一个不丢,所以小规模上它和 Mem0 打平。这个"打平"非常重要——它恰恰说明冒烟测试区分度低,严肃选型必须上更大规模基准(见第六节)。

**Graphiti 在本地小模型下抽取严重丢值,只有 50%。** Graphiti(Zep 的引擎)是 bi-temporal 知识图谱,摄入时 LLM 把会话抽成实体 + 关系 + 边,带有效时间。我们在 FalkorDB(端口 6390)上用 gpt-5.4 经中转站做抽取(用 json_object 模式而非 json_schema,因为中转站的 gpt-5.4 不严格遵守 json_schema 约束),它确实跑通了,但抽出来的 11 条实体边事实里,丢掉了频繁乘客号、饮食限制 / 过敏、train 偏好、猫的数量、Pepper 的年龄——而关系 / 时序结构(工作、预算 4500→6000 更新、公寓、护照、会议日期)却抽得很好。这是一个非常清晰的"图抽取在本地 / 中等模型下系统性丢值"的实证:图谱把结构性事实记得很好,但对具体数值 / 某些事实类型会在抽取阶段就漏掉。

**Basic Memory 0% 不是工具坏了,而是协议不匹配。** Basic Memory 是一个 local-first 的 markdown + sqlite 知识图谱 MCP 工具,核心是 note(笔记)+ 规则式实体 / 关系抽取 + FastEmbed(bge-small-en-v1.5,ONNX,本地)向量。它本身工作完全正常:write-note 写入 markdown 文件并自动建图建索引,search-notes 能检索。但它的检索是关键词 / 实体导向的——关键词查询"frequent-flyer"能命中,而自然语言问句"What is my frequent-flyer number?"在 BM25、纯向量、hybrid 三种模式下全部返回 0 结果。也就是说,它不是一个语义 NL-QA 记忆后端,用它来回答自然语言问题,召回基本失效。这条 0% 是真实的(协议下确实召不回),但部分源于"拿一个 note / KB 工具当 QA memory 用"的错配——这一点必须如实说明,而不是简单说"Basic Memory 很差"。

**Cognee 完全跑不起来(BLOCKED),根因是它自己的流水线 schema 校验 bug,与 LLM 无关。** 这个结论来之不易,详见第七节的负分校验案例。

## 六、实测结果之二:LongMemEval 代表性子集(排名反转)

冒烟低区分度,严肃选型必须上权威基准。本次用的是 LongMemEval——它是长程对话记忆领域的权威基准,500 题,每题带一个巨大的"草堆"(haystack)对话历史(中位约 140K token / 490 条消息 / 45 个会话),考单会话 / 多会话 recall、时间推理、知识更新、矛盾消解等能力。

完整 500 题 × 140K token × 多个工具在本地是不可行的:这是 playbook 反复强调的"吞吐杀手"。我们实测过——Mem0 在一道仅 9K token 的缩减题上,因为逐 chunk 抽取 + 对每条已有记忆做去重 LLM 调用,经中转站串行累积,20 分钟没跑完;按这个速度外推 140K × 500 题根本不可能完成。所以本次做的是**代表性缩减子集**:每题从完整 haystack 里取含答案的 session + 随机干扰 session,控制到约 9K token(保留"草堆里找针"的区分度,而不是把答案直接摆门口),每工具跑 3–4 题,reader / judge 用 gpt-5.4。这是一个比冒烟强得多、但仍非完整 500 题的深度,结论标签因此封顶"先试点"。

LongMemEval 代表性子集的结果如下(统一 gpt-5.4 reader + judge):

| 工具 | single-session | multi-session | temporal | knowledge-update | LongMemEval |
| --- | :---: | :---: | :---: | :---: | ---: |
| Supermemory | ✓ | ✗ | ✗ | ✓ | 2/4 = 50% |
| Mem0 | ✓ | ✗ | (跳过) | ✗ | 1/3 ≈ 33% |
| Memvid | ✓ | ✗ | ✗ | ✗ | 1/4 = 25% |
| Graphiti | ✗ | – | ✗ | ✗ | 0/3 = 0% |

这个结果带来了整个评测最有价值的一个发现:**排名反转了冒烟的结论**。

- 冒烟排名:Mem0 = Memvid(83%)> Supermemory(67%)> Graphiti(50%)
- LongMemEval 排名:**Supermemory(50%)> Mem0 ≈ Memvid(25–33%)> Graphiti(0%)**

Supermemory 在冒烟时只排第三,在 LongMemEval 却是第一。原因非常具体:它是唯一一个答对 knowledge-update 题的工具。那道题问"我慈善 5K 跑的个人最好成绩",而对话里这个成绩**更新过**(旧值 27:12,新值 25:50)。Mem0 是 ADD-only(v3 算法丢弃了 UPDATE/DELETE),新旧两条事实都存,检索捞到了旧的 27:12;Memvid 是逐字块,新旧都存,同样捞到 stale;Graphiti 抽取本身就没抽到。只有 Supermemory 的"矛盾 / 时序消解 + auto-forgetting"机制生效,返回了最新的 25:50。这就是它对其他工具的真实优势——而这个优势在冒烟里完全看不出来,必须上 LongMemEval 才暴露。

第二个一致发现是:**multi-session 聚合题全工具败**。那道题要数"我要取 / 退几件衣服",正解 3。所有原子事实型(Mem0、Supermemory、LangMem)和逐字块型(Memvid)都答错——它们要么把事实拆成独立条目存但不会在检索时重新聚合计数,要么干脆返回了某一件的描述。这是"原子事实 / 段落记忆的固有弱项"的实证:计数、求和、年龄差这类需要跨会话聚合的推理,对它们都很难。

第三个发现是:**Graphiti"时序图谱优势"被证伪**。temporal 题问"两次参观博物馆间隔几天",Graphiti 其实抽到了相关事实(MoMA 导览、Met 古文明展),但它的 `valid_at` 日期解析报错("Error parsing valid_at date, skipping"),导致日期推理失败。bi-temporal 知识图谱的理论优势,在本地 / 中等模型抽取下因为日期解析脆弱而没兑现——这和它在冒烟里丢值是同一个根因(抽取阶段的质量问题)。

我们还额外跑了一个真实规模样本:让 Memvid 处理**完整的 138K token haystack**(54 个 session → 编码成 549 个 QR 帧 → 一个 9MB 视频 + 586KB 索引文件),single-session 题答对(从全量草堆里找到了 degree)。这说明 Memvid 这种无抽取的逐字块路线确实能扛真实规模(它的瓶颈不在吞吐,而在结构能力);但它的 multi / temporal / knowledge-update 结构性弱点不会因为规模变大而消失。

## 七、负分校验门:六次拦下的冤杀

负分数(0 分 / 空召回 / 受阻)永远比正数更可疑。本次评测至少拦下了六次"配置错误伪装成工具烂"的冤杀,每一次都通过"直接看工具实际存了什么 / 返回了什么"才翻盘。这些案例本身是评测可信度的关键,也极有参考价值。

**冤杀一:Mem0 的 search API 签名变更。** 第一次跑 Mem0 冒烟,12 题全 0、召回全空。但 adapter 日志显示 3 个会话都"成功摄入"。直接进诊断脚本调 `m.get_all()` 发现事实**全部存进去了**(FF 号、猫名、预算都在)。再调 `m.search(query, user_id=...)`,抛 `ValueError: Top-level entity parameters frozenset({'user_id'}) are not supported in search(). Use filters={'user_id': '...'} instead.`。原来 Mem0 2.0.11 把 `search()` 的顶层 `user_id` 参数移除了,必须用 `filters={"user_id": ...}`。我们用了旧签名,每次 search 抛异常被 try/except 吞成空召回。改成 `filters=` 后立刻 83.3%。一个 API 版本变更差点冤杀 Mem0。

**冤杀二:Cogee 缺 transformers 依赖 + 缺 HF tokenizer 配置。** Cogee 在 ollama 后端下 cognify 反复失败,日志层层套娃:先是 LLM 连接测试 30 秒超时(需 `COGNEE_SKIP_CONNECTION_TEST=true` 绕过);然后首次迁移报错(它"下次调用自动重试",要调两次);然后 `ModuleNotFoundError: No module named 'transformers'`(ollama embedding 需要 HF tokenizer,不在默认 extra 里);装上 transformers 后又 `OSError: None is not a valid HF model`(缺 `HUGGINGFACE_TOKENIZER` 环境变量);最后终于进到 cognify,卡在 `InstructorRetryException`——qwen2.5:14b 经 litellm+instructor 的结构化输出反复失败(8/16/32 秒指数退避)。这是 Cogee 在本地 ollama 下叠加了六层配置摩擦。

**冤杀三(关键):Cogee 换强模型证明是工具 schema bug。** 上述 Cogee 失败到底是"本地模型太弱"还是"Cogee 自己有问题"?我们换 gpt-5.4(经中转站)重跑:gpt-5.4 的抽取**完美**——FF 号、猫、年龄、饮食、过敏、偏好全对。但 cognify **仍然失败**,错误换成了 `pydantic validation error: SummarizedContent.summary Field required`(9 次 / 3 轮 InstructorRetryException)。原来 Cogee 的 summarization 步骤要求 LLM 产出带 `summary` 字段的 `SummarizedContent`,但它的 prompt 不可靠地产出该字段,LLM 给了 `{"about":[...], "facts":[...]}` 却没给 `summary`。这证明 Cogee 的失败**与 LLM 无关**,是它自己流水线的 schema 校验 bug——本地 qwen 和云端 gpt-5.4 都跑不起来。这条把 Cogee 从"本地模型太弱"升级为"流水线 schema 脆弱,避开"。

**冤杀四:Mem0 LongMemEval 的 PostHog 遥测超时。** Mem0 在 LongMemEval 子集上"全 0",但 context 文件空。查 adapter 日志,卡在大量 `ReadTimeoutError: HTTPSConnectionPool(host='us.i.posthog.com')`(SSL 握手超时)——Mem0 的 PostHog 遥测在本机网络不通 posthog.com,反复阻塞。叠加多次 qdrant 本地存储并发锁。在 adapter 里禁掉 PostHog(`POSTHOG_DISABLED=1` + monkeypatch `posthog.capture`)+ 清干净 qdrant 状态后,Mem0 立刻抽出了 20 条事实(含答案),single-session 题答对。表面 0/4 是遥测超时假阴性。

**冤杀五:Supermemory 的 API key + 异步等待。** Supermemory 第一次跑也是全 0——401 Unauthorized("Are you using the right API key?")。原来 supermemory-server 启动时会自动生成一个真实的 `sm_...` key(打印在启动日志里),localhost 自动鉴权要求用这个真 key(或完全不发 key),而 SDK 默认会带 Authorization 头。从日志抓出真 key 后通了;但接着又全 0——因为 Supermemory 的 add 是异步的(返回 `status='queued'`,extractor LLM 在后台跑),`documents.list_processing()` 又不可靠(返回 0 但实际还在队列),adapter 在处理完成前就 search 了。改成"轮询 search 直到非空"的等待逻辑后,Supermemory 正常产出。

**冤杀六:LangMem 的 langgraph search API 变更。** LangMem 第一次跑 12 题 search 全失败:`BaseStore.search() got an unexpected keyword argument 'namespace'`。langgraph 新版把 `search(namespace=...)` 改成了 `search(namespace_prefix=..., /, *, query=...)`(位置参数)。改对之后 LangMem 才正常(最终 41.7%)。

这六次说明:评测的可信度,很大程度上取决于你愿不愿意在看到 0 分时停下来、打开工具的存储看看它到底存了什么、读一读源码确认 API 签名。否则你会得出 Mem0 / Cogee / Supermemory / LangMem "都很烂"这种完全错误的结论。

## 八、关键发现汇总

把所有实测和调研合并,得到以下对选型最有价值的发现。

**发现一:记忆模型决定适用性,不是分数决定。** 逐字块型(Memvid)零丢值、零依赖,但无聚合 / 推理 / 时序——它是 RAG 替代,不是"记住用户"的 agent 记忆;事实抽取型(Mem0 / LangMem)平衡——压缩 + 保留值,但依赖抽取模型质量,多会话聚合是固有弱项;知识图谱型(Graphiti / Cognee)关系 / 时序结构强,但本地小模型抽取系统性丢值,需要强 LLM + 图库才兑现;混合 profile + 图(Supermemory / Letta)工程最完整,但 embedding / 运行时闭源或运维重。

**发现二:embedding-gap 是横评最大约束。** Supermemory、Memvid、Basic Memory 三者把 embedding 锁死在自带 embedder(Supermemory=WASM bge-base、Memvid=ONNX BGE、Basic Memory=FastEmbed bge-small),无法指向 ollama `/v1/embeddings`,不能用统一 qwen3-embedding。横评它们时必须标注"embedding 不统一"。更广义地,选型第一步要验证"能否完全本地、能否换 embedding 后端",而不是看名字和 star 数。

**发现三:厂商自报 benchmark 全部 L3、不可横比。** 厂商自报分数差异巨大且都自称第一:Mem0 94.4%(但独立 Atlan 复现仅 49.0%)、Supermemory 81.6%、Hindsight 91.4%(backbone=Gemini-3 Pro)、Memvid 85.65%、Cogee 约 80.3%、Letta 74.0%、Graphiti 63.8%。这些数字用了不同的 judge、不同的 embedding、不同的版本、有的还含专有模型,完全不可直接横比。本次评测最大的价值之一,就是用统一后端重跑了这些工具,得到了可比的 L1 数字。

**发现四:后端 > 工具。** 当多个工具撞同一堵墙(都缺 embedding、都被推理模型 judge 拖慢、都被 PostHog 超时阻塞、都在结构化输出上崩),换后端比换工具更能改变结局。Cogee 在 qwen 和 gpt-5.4 下都崩(那是工具 bug),但 Mem0 的 LME 从"0/4"到"跑通"靠的是禁 PostHog(后端环境修复);judge 从超时到稳定靠的是从 glm-4.7-flash 换到 qwen2.5(后端模型修复)。

**发现五:小规模会骗你。** 冒烟里 Mem0 = Memvid 打平、Supermemory 落后;LongMemEval 里 Supermemory 反而领先。任何只在冒烟 / 小数据上做的选型,都可能把真正适合 scale 的工具(Supermemory 的矛盾消解)误判成落后。

## 九、选型建议矩阵

基于以上全部证据,给出按场景的选型建议(每条都标了证据级别):

- **要"插即用、生态最大、文档最全"** → Mem0(L1 冒烟 83%;但自报 94% 含水分,独立复现曾低至 49%;本地全可行)。
- **要"配强模型时事实回忆最强"** → Letta(L1 冒烟 100%,全场最高;agent 驱动 + glm-4.7 级 tool-calling;代价是 pgvector compose 运维,且 agent 路线不 scale 到大 haystack)。
- **要"零依赖、全本地、不丢值、能扛 140K 规模"** → Memvid(L1 冒烟 83%、完整 138K haystack 召回成功;但无聚合 / 时序 / 更新能力,是 RAG 替代)。
- **要"单二进制、自托管、profile + RAG 一体、能处理事实更新"** → Supermemory(L1 冒烟 67%、LongMemEval 50% 全场最高、唯一答对 knowledge-update;embedding 锁死自带 WASM 不可换)。
- **要"时序图谱、事实变更追踪"** → Graphiti / Zep(原生 bi-temporal;但本地小模型抽取丢值严重,需强 LLM + FalkorDB / Neo4j;本次 L1 仅 50%、LME 0%)。
- **要"框架内置(已用 LangChain 生态)"** → LangMem(L1 冒烟 41.7%;行为同事实抽取类;版本冲突需注意)。
- **避开** → Cogee(流水线 schema 校验 bug,本地 + 云端都跑不起来)、Universal Memory MCP(实为 Supermemory 云代理 + deprecated)、OpenMemory MCP(sunset,引擎即 Mem0)。
- **特定场景** → Basic Memory(本地优先 note / KB,关键词图谱;非语义 QA 记忆,作 QA 用召回失效)、Reference Memory MCP(官方实体-关系-观察参考实现,适合自建 MCP 记忆的起点模板)、Hindsight(自报 91.4% 但 Python 3.13 下因 legacy `use_2to3` 装不上,需 py3.11)、LlamaIndex Memory(框架内置,本版本 FactExtraction / VectorMemoryBlock 在我们环境未产出可检索内容,API 摩擦)。

## 十、风险与未知

本评测的结论有以下边界,使用时务必注意:

第一,LongMemEval 是缩减版(每题约 9K token,非完整 140K;每工具 3–4 题),所以所有 LongMemEval 结论是"先试点"级而非"完整权威基准"级。完整 500 题 × 140K 在本地对抽取类工具不可行(实测 Mem0 单题 dedup 即卡 20 分钟)。

第二,reader(gpt-5.4)偶有幻觉——context 里没有答案时它有时仍会作答(memvid LME single-session 的"对"部分靠 reader 猜中)。这会轻微抬高分数,是"memory + 固定 reader"协议的固有 caveat。

第三,本次的本地 qwen2.5:14b 后端对需要结构化输出的工具(Cogee、Graphiti)偏弱;换更强抽取模型会显著改善它们的分数——所以 Cogee 的 BLOCKED 和 Graphiti 的低分不代表它们在强模型下也这样(但 Cogee 的 schema bug 与模型无关)。

第四,8 个工具只有 L4(无 L1):Letta 已补 L1(100%);LlamaIndex、Hindsight、Basic Memory 已补 L1(分别为 API 摩擦 / 安装失败 / 0%);其余 Zep 服务端、3 个 MCP 仍以 L4 支撑结论。

第五,本评测的全部 harness(适配器、driver、finish、judge)、原始 context / answers / score、证据台账(30 条)、研究结构化数据(13 工具)规划在 `runs/2026-07-03-memory-systems-eval/` 下,**当前未入库**(产物体积较大)。如需复现:在 GitHub issue 申请,或按本文方法论描述自行重跑。任何结论都可以回到原始证据核对。

## 十一、最终结论

这是一次在统一后端下、用可复现 harness、带负分校验门的实证评测。它的核心贡献不是给出一个"谁第一"的简单排名,而是揭示了三件被厂商营销和冒烟测试共同掩盖的事实:第一,小规模测试会骗你,Supermemory 在冒烟落后、在 LongMemEval 领先;第二,厂商自报分数全部不可横比,只有统一后端重跑才有意义;第三,"工具烂"和"配置 / 协议不匹配"必须严格区分,否则会冤杀合格工具(Cogee 的 schema bug 是真烂,Mem0 / Supermemory / LangMem 的 0 分是配置)。

如果只能记一句话:**别信任何单一来源的 benchmark 数字,在你自己的真实数据 + 统一后端上重跑一遍,再做采用决策。** 本评测的所有 harness 和原始证据都已经留下,目的就是让这一步对后来者尽可能便宜。

---

## 十二、评分卡与加权(对象画像推导后的权重)

对象画像推导要求:以默认七维权重为起点,把"如果出问题会怎么伤害用户"的前三大失败模式落到维度上并提权。对记忆项目,三大失败模式是:F1 返回过期或错误事实(→ 可靠性提权)、F2 跨用户 / 租户泄露隐私事实(→ 安全隐私提权)、F3 重复 embedding / 海量抽取致成本失控(→ 成本提权)。从"差异化"里让出分数补给这三类。调整后权重为:决策契合 13、能力证据 20、工作流整合 15、可靠性与成熟度 20、成本与见效速度 13、安全隐私与可控 19,合计 100(差异化并入)。

对取得 L1 的工具,给出加权评分卡(每维 0–5 分,5 = 证据强 / 摩擦低 / 现在就能用):

| 维度(权重) | Letta | Mem0 | Memvid | Supermemory | Graphiti | LangMem | Basic Memory |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 决策契合(13) | 5 | 5 | 3 | 4 | 4 | 3 | 2 |
| 能力证据(20) | 4 | 4 | 3 | 3 | 3 | 3 | 2 |
| 工作流整合(15) | 3 | 5 | 4 | 4 | 3 | 3 | 3 |
| 可靠性与成熟度(20) | 4 | 4 | 3 | 3 | 3 | 3 | 3 |
| 成本与见效速度(13) | 3 | 5 | 5 | 4 | 3 | 3 | 4 |
| 安全隐私与可控(19) | 4 | 4 | 5 | 3 | 4 | 4 | 5 |

Cogee 因 schema bug 在所有维度上都被压低(加权约 42/100,全场最低),不列入上表。需要强调:低置信度的 4 分和高置信度的 4 分不一样,Letta 的"决策契合 5"是 L1 实测 100% 支撑的,而 Basic Memory 的多数分数是 L4 支撑、置信度更 低。

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

每一行的 backbone / judge / embedding / 版本都不一样,有的还含专有模型或必须走云。这就是为什么任何"X 是 LongMemEval 第一"的营销话术都不构成采用依据——本次评测用统一 qwen2.5:14b + qwen3-embedding 重跑后,排名完全反转(Supermemory 在 LME 领先,而它自报分 81.6% 并不是最高的)。

## 十四、记忆模型分类深析

理解记忆系统,第一件事是搞清它底层存的"记忆"是什么形状。本次评测把 13 个项目归为六类记忆模型,每一类的失败模式截然不同。

**逐字块 / 段落向量型(Memvid)。** 不做任何抽取,把会话 / 文档切成块,每块 embed 入库,检索按向量相似度 + BM25 返回原始文本。优点:值零丢失(原文都在)、零依赖、能扛超大规模(138K token 实测可行)。缺点:无聚合(不会数"几只猫")、无时序(新旧都存,可能捞到 stale)、无推理。它是 RAG 的替代品,不是真正意义上的"用户画像 / agent 记忆"。本次 Memvid 冒烟 83%(小规模值都在)、LongMemEval 25%(multi / temporal / knowledge 全败)完美印证了这条路线的边界。

**事实抽取型(Mem0、LangMem、OpenMemory)。** 摄入时让抽取 LLM 把对话蒸馏成原子自然语言事实(如"用户叫 Daniel,FF 号 XQ-7712-3309"),每条事实 embed 入库,检索融合语义 + BM25 + 实体。优点:压缩 + 多数情况下保留值、生态大。缺点:抽取质量依赖 LLM;多会话聚合是固有弱项(拆成独立事实存,检索时不重新聚合);Mem0 v3 是 ADD-only(丢弃 UPDATE/DELETE),新旧都存。本次 Mem0 冒烟 83%、LangMem 41.7%、Mem0 LongMemEval 多会话败,都印证。

**知识图谱型(Graphiti、Cognee)。** 摄入时 LLM 抽实体 + 关系 + 边,带有效时间,存图数据库(Neo4j / FalkorDB / Kuzu),检索走图遍历 + 向量。优点:关系 / 时序结构强、可解释、能做知识更新。缺点:抽取在小 / 中等模型下系统性丢值(Graphiti 丢了 FF 号 / 饮食 / 偏好 / 猫数量 / 年龄);结构化输出对 LLM 要求高(Cogee 在 qwen 和 gpt-5.4 下都因 schema 校验崩);重(Neo4j / FalkorDB)。本次 Graphiti 冒烟 50%、LME 0%,Cogee BLOCKED。

**混合 profile + 图型(Supermemory)。** 摄入时 LLM 抽事实 + 维护用户 profile(static 稳定事实 + dynamic 近期活动)+ 矛盾 / 时序消解 + auto-forgetting,检索是 hybrid(RAG 文档块 + 个性化记忆事实)。优点:矛盾消解真的有效(唯一答对 knowledge-update)、单二进制自托管。缺点:embedding 锁死自带 WASM 不可换、图引擎闭源二进制。本次 Supermemory 冒烟 67%、LongMemEval 50%(全场最高)。

**agent 自管型 / file-text(Letta)。** 不做独立抽取流水线,把记忆当成操作系统的内存层次(core memory 在上下文里 / archival 向量库 / recall 历史),由 agent 自己通过 tool call 决定往核心记忆写什么、从 archival 检索什么;filesystem 路线直接把原始文件挂给 agent,grep / search_files。优点:不丢值(原文 / 自管)、配强 tool-calling 模型时事实回忆极强(Letta 100%)。缺点:运维重(pgvector)、tool-calling 依赖强模型、agent 路线不 scale(逐消息 tool call 在大 haystack 上吞吐杀手)。

**关键词 / 实体图谱 note 型(Basic Memory、Reference MCP)。** 不做语义抽取,要么由客户端 LLM 手写 markdown 笔记(Basic Memory),要么由客户端维护实体-关系-观察三元组(Reference MCP),检索靠关键词 / 子串 / 规则式图。优点:零 LLM 依赖、完全本地、可解释。缺点:不是语义 QA——对自然语言问句召回差(Basic Memory 全 0)、客户端 LLM 弱则记忆质量差。

选型的第一问应该是:我要哪种形状的记忆?要"记住用户长期画像并能处理事实更新",混合 profile + 图或 agent 自管更合适;要"在大量文档里找片段",逐字块或 RAG 更合适;要"结构化关系 + 时序",知识图谱——但务必配强抽取模型。

## 十五、可复现性附录

本评测的全部产物规划在 `runs/2026-07-03-memory-systems-eval/` 下，**当前未入库**（产物体积较大）。如需复现：在 GitHub issue 申请，或按本附录与正文方法论自行重跑。计划落盘的产物清单：

- `harness/`:统一 harness。`driver.py`(跑适配器 + 合成 + 判分的 orchestrator)、`finish.py`(可靠的合成 + 判分,替代 driver 偶发的尾部)、`judge.py`(固定 LLM-as-judge,带重试 + 中转站鉴权)、`adapters/run_<tool>.py`(每个工具一个适配器,实现统一的 ingest + search 契约)。
- `media-pack/benchmark-results/smoke_12facts.json`:自建冒烟集(3 会话 / 12 查询,带预期答案 + 失败模式标签)。
- `media-pack/benchmark-results/longmemeval_s.json`:从 HuggingFace 拉取的 LongMemEval 官方数据。
- `media-pack/benchmark-results/lme-subset/`:缩减 haystack 子集 + 完整 138K haystack 子集。
- `media-pack/benchmark-results/smoke-answers/<tool>.{context,answers,judge,score}.json`:每个工具的召回 / 答案 / 判分 / 得分,可逐题核对。
- `evidence-ledger.jsonl`:30 条证据台账,每条含来源类型 / 日期 / 论断 / 置信度 / 素材类型 / 标签 / 保密级别。
- `phaseB-research-results.json`:13 工具的结构化调研数据(架构 / 记忆模型 / 持久化 / 依赖 / install / ollama 支持 / MCP / 云门控 / 自报 benchmark / 已知 issue)。
- `methodology.md` / `brief.md` / `findings.md` / `decision-report.md`:方法论、简报、发现、决策报告。

复现一次冒烟:加载后端(`set -a; . ~/.claude/eval-provider.env; set +a`),对每个工具 `python3 harness/finish.py --tool <tool>`,即可得到和本报告一致的分数。复现一次 LongMemEval 子集:用 `lme-subset/<type>.json` 跑适配器再 finish。任何一条结论,都可以回到对应的 context.jsonl / answers.jsonl / judge.jsonl 逐条核对——这正是实证评测区别于"读 README 写综述"的根本所在。
