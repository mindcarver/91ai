# Memvid:无抽取的逐字块 / 视频存储深度技术解析

> **证据边界：R1。** 本页属于作者运行/资料调研记录；harness、输入与原始结果尚未公开，分数和选型判断只绑定当时版本、配置、样本与协议，不能视为独立复现结论。详见[评测可复现性状态](../../reproducibility-status.md)。

> 项目地址:https://github.com/memvid/memvid 。License:Apache-2.0。约 15705 star(2026-07-03 实测)。注意:`pip install memvid` 实测拿到的是 0.1.0(v1 的 video/QR 路线),研究说的 Rust v2 在 `memvid-sdk` 包名下。本文技术细节来自源码、官方文档与本次 ollama + 中转站下的 L1 实测(含完整 138K token haystack)。

## 一、项目定位与一句话概括

Memvid 是一条"反主流"的记忆 / RAG 路线:它不做任何 LLM 事实抽取,把文本 / 文档切成块,每块编码进一个视频文件(v1 用 QR 码帧编进 MP4;v2 是 Rust 单文件 B-tree/HNSW),检索时按 BM25 + 向量相似度返回原始文本块。它的卖点是零依赖(单文件)、零 LLM(纯 chunk + embed)、面向大规模数据、值零丢失。它的局限是:没有聚合、没有时序、没有知识更新能力——它是 RAG 替代,不是真正意义上的"用户画像 / agent 记忆"。

一句话:Memvid = 一个无抽取、零依赖、把记忆编码成单文件(视频 / .mv2)的 chunk 存储 + 检索,是 RAG 的便携替代。

## 二、仓库与社区元数据

- 主仓 `memvid/memvid`,Apache-2.0,约 15705 star。注意:旧资料里出现的 `kingjulio8238/Memvid` 实际是 404(kingjulio8238 拥有的是另一个项目 Memary);canonical 是 `memvid/memvid`。
- v1:Python,QR 码 + MP4 视频(已废弃路线)。
- v2:Rust 核心(`memvid-core` crate)+ Python SDK(`memvid-sdk`)+ CLI / npm。本次 `pip install memvid` 拿到 0.1.0(v1)。
- 仓库 2025-05 创建,v2.0.x 高频迭代(140+ patch release)。

## 三、整体技术架构

**v1(本次实测的 0.1.0):video/QR 路线。**
- **Encoder**(`MemvidEncoder`):add_text/add_chunks 累积文本 → build_video 把每块编码成 QR 码帧 → ffmpeg 编成 MP4 + 一个 index.json。
- **Retriever**(`MemvidRetriever`):search(query)→ embed query → 在 index 里向量 + BM25 找 top-k 帧 → 从 MP4 解码对应帧的 QR → 还原文本块。
- embedding 自带 ONNX(BGE-small/base / nomic / gte),不走 ollama。
- 需要 ffmpeg(本次实测它通过 docker 调 ffmpeg 建视频)。

**v2(Rust,研究确认但本次未实测):**
- 单文件 `.mv2`,内含 B-tree(WAL)+ Tantivy(BM25 倒排)+ HNSW(向量)+ time index,全 embedded。
- feature-gated:lex(BM25)/ vec(HNSW+ONNX)/ clip / whisper / api_embed / temporal_track / encryption。
- embedding 自带 ONNX(api_embed 是 OpenAI-only,但 vec 用本地 ONNX)。
- QR / 视频帧已移除——v2 不再是"视频",而是 Rust 单文件存储。多数第三方博客 / MCP 教程仍描述 v1。

## 四、核心记忆模型与实现原理

Memvid 的记忆模型是"逐字块 + 双信号检索(BM25 + 向量)"。

**不抽取,存原文。** 这是最关键的差异。Mem0 / LangMem / Cognee / Graphiti 都用 LLM 把对话抽成事实 / 实体。Memvid 完全不抽——把会话 / 文档原文切块存。所以值一个不丢(原文都在),但也完全没有"压缩 / 抽象 / 关系结构"。

**双信号检索。** search(query)同时跑 BM25(query 与块的词频匹配)和向量(query embedding 与块 embedding 的相似度),融合返回 top-k。这和 Mem0 的检索融合类似(但 Mem0 在事实层面,Memvid 在原文块层面)。

**QR / 视频编码(v1)的意义。** v1 把块编码进视频是为了"极端便携 + 压缩":一个 MP4 文件就是整个记忆库,可复制 / 传输 / 流式读取。这是它最初的新颖卖点。v2 改用 Rust 单文件 `.mv2`(B-tree + HNSW),放弃了视频,但保留了"单文件、零依赖"的理念。

**temporal_track(v2 feature)。** v2 有一个 `temporal_track` feature 解析"last Tuesday"这类时间表达,时间索引在文件里——不是云门控(对比某些厂商把时序锁云端)。但 Memvid 本质仍是逐字块,没有跨块聚合 / 推理。

## 五、端到端数据流

本次实测(v1 0.1.0,完整 138K token haystack):

1. **Encoder**:`enc = MemvidEncoder()`,`enc.add_text(会话文本)`(每个 session 累积)。
2. **build_video**:`enc.build_video(video.mp4, index.json)`。内部:文本分块 → 每块 QR 编码成帧 → 通过 docker ffmpeg 编码成 MP4(实测 138K token → 549 QR 帧 → 9MB video + 586KB index,~2 分钟)。
3. **Retriever**:`ret = MemvidRetriever(video.mp4, index.json)`,`ret.search(query, top_k=5)`。内部:query embed(自带 ONNX)→ 向量 + BM25 找 top-k 帧 → 解码 QR → 返回原始文本块。
4. **下游**:把返回的文本块作 context,固定 reader 合成答案。

## 六、技术栈与依赖

- v1:Python + qrcode / opencv / ffmpeg(经 docker)+ 自带 ONNX embedder(BGE)。
- v2:Rust 1.85+ 核心(feature-gated)+ Python `memvid-sdk`(运行时只依赖 typing-extensions)+ CLI / npm。
- embedding:自带 ONNX(BGE-small/base / nomic / gte-large),不走 ollama(api_embed 是 OpenAI-only 但有 vec 本地 ONNX 替代)。
- 无外部 DB / 向量库 / 图库。

## 七、本地部署与 LLM 后端(ollama)

Memvid 的 embedding 自带 ONNX,**完全不需要 ollama 也能跑**(这是它"零依赖"的体现)。但它的 embedding 也不走 ollama——不能用统一 qwen3-embedding(embedding-gap)。

如果要 LLM 合成答案(chat / RAG),需要外接 LLM(harness 自己接 ollama / 中转站)。Memvid 本身不调 LLM 做 chat(它是存储 + 检索,不是 QA 引擎)。

## 八、MCP 集成

**无一方 MCP server。** Memvid 是库 / CLI,不是 MCP 组件。有几个第三方 MCP server 但它们 target 已废弃的 v1 API,不建议用于 v2。

## 九、云门控与商业模型

- 本地优先:Rust 核心 + lex + vec feature 全离线(BM25 + HNSW + ONNX embedding),无 API key、无云。
- memvid.dev 云:有托管产品(含优化模型 / memvidbench benchmark),需 MEMVID_API_KEY。benchmark 头条分数是通过云产品跑的,本地免费引擎复现不到。
- 核心存储 + 检索完全本地,云只是托管 / 优化。

## 十、性能与基准

官方自报(L3,通过 memvid.dev 云 + gpt-4o judge + text-embedding-3-large):总体 85.65%(Cat 1-4,排除 adversarial);分项 Single-hop 80.14% / Multi-hop 80.37% / Temporal 71.88% / World-knowledge 91.08% / Adversarial 77.80%;自称 +35% SOTA。但这是云产品 + OpenAI judge + OpenAI embedding,本地免费引擎复现不到,不可与其他厂商横比。

本次实测(L1):**冒烟 83.3%**(10/1/1,与 Mem0 并列);**选取的 LongMemEval 4 题子集 25%(1/4)**——single-session 对、multi-session 错(不会计数)、temporal 错(召回漏)、**knowledge-update 错(返回旧值 27:12 而非更新后的 25:50)**;**一个 138K token haystack 的 single-session 样本答对**(从 9MB 视频里召回 degree)。

## 十一、已知问题与失败模式

- **v1 已废弃**:pip 上的 0.1.0 是 v1(QR/video),研究说的 Rust v2 在 memvid-sdk。第三方教程多描述 v1。
- **无聚合 / 推理**:逐字块,不会"数几只猫"、不会算"间隔几天"、不会"求最新值"。本次 multi-session / temporal / knowledge-update 全败就是这原因。
- **knowledge-update 致命伤**:新旧都存,检索捞 stale。本次返回旧 27:12。
- **embedding-gap**:自带 ONNX,不走 ollama /v1/embeddings,不能用统一 qwen3-embedding。
- **api_embed 锁 OpenAI**:v2 的 api_embed feature 只支持 OpenAI embedding,无 base_url override;用本地 vec(ONNX)替代。
- **版本卫生松**:release 编号有时非单调(v2.0.157 比 v2.0.136 先发布);WAL corruption bug(#230)在 v2.0.140 才修,格式稳定性仍在成熟。

## 十二、本次实测发现(L1)

本次 Memvid(v1 0.1.0,自带 ONNX embedder):

- **冒烟 83.3%**:无抽取,值零丢失,在本次 12 题中与 Mem0(事实抽取)同分。这说明该小样本下两条路线都能答对多数题,不代表整体能力相同。
- **LongMemEval 25%**:暴露逐字块的结构性弱点——multi-session 聚合败、temporal 败、knowledge-update 败(返回旧值)。
- **一个 138K haystack 样本完成**:9MB 视频、549 QR 帧、single-session 正确召回。这只证明本次输入与配置能够完成构建和一次召回,不能据此推断总体吞吐、可扩展性或性能瓶颈所在。
- **反认知对比**:冒烟 83% → LME 25%,直观说明"小规模打平"不等于"规模上也行"。

## 十三、适用场景与选型建议

适合:需要在大规模文档 / 历史里做"找相关片段"的 RAG 检索,要零依赖(单文件可移植)、要完全离线、要值零丢失。Memvid 是"便携 RAG"的好选择——把知识库编码成一个文件,随用随读。

不适合:需要"用户画像 / agent 记忆"(无聚合 / 推理 / profile)、需要事实更新 / 时序(返回 stale)、需要语义抽象(它是原文块)。把它当 agent 的"用户记忆"用是错配——本次 LME 25% 就是这个错配的体现。

建议标签:**先试点(RAG 场景)/ 不推荐(agent 记忆场景)**。它的价值在"便携 RAG",不在"agent 记忆"。

## 十四、与同类对比

- vs **Mem0**:Mem0 是事实抽取(压缩 + 保留值 + 检索),Memvid 是逐字块(原文 + 检索)。小规模打平(83%),规模上 Mem0 在 multi/knowledge 略好(33% vs 25%,因为 Mem0 至少抽出结构化事实),但都有聚合 / 更新弱项。
- vs **Letta**:Letta 也有 file-text 路线(存原文让 agent 搜),但 Letta 是 agent 驱动(agent 自适应多轮检索),Memvid 是一次向量 + BM25 召回。Letta 冒烟 100% > Memvid 83%(agent 检索更灵活)。
- vs **Basic Memory**:都是"原文 + 检索",但 Basic Memory 是 markdown + 关键词图谱(对 NL 问句召回差,0%),Memvid 是向量 + BM25(对 NL 问句召回好,83%)。

## 附录 A:实测代码(v1 完整 haystack)

```python
from memvid import MemvidEncoder, MemvidRetriever
enc = MemvidEncoder()
for sess in sessions: enc.add_text(session_text)         # 累积原文
enc.build_video("mem.mp4", "index.json")                 # QR 帧 + ffmpeg → MP4
ret = MemvidRetriever("mem.mp4", "index.json")
ctx = ret.search("What is my frequent-flyer number?", top_k=5)  # 返回原始文本块
```

v1 的 build_video 需要 ffmpeg(本次实测它通过 docker 调)。138K token → 549 帧 → 9MB 视频,build ~2 分钟,search 秒级。

## 附录 B:Memvid 的真实定位——RAG 不是 agent 记忆

本次评测最重要的一个"定位纠偏"就是关于 Memvid。很多榜单把 Memvid 列为"agent 记忆系统",但它本质上是一个**便携 RAG**(检索增强生成的存储层),不是 agent 记忆。

证据:它无聚合(数不了几只猫)、无时序(返回 stale 旧值)、无 profile(不维护用户画像)、无矛盾消解。它的强项是"在大规模原文里找相关片段",这正是 RAG 的定义。把它当 agent 记忆用(本次 LME 25%),就像拿锤子拧螺丝——能用,但不对。

它的候选场景是:把大知识库(文档、历史对话、代码)编码成可移植的单文件,在离线 / 边缘环境做 RAG 检索。本次一个 138K 样本说明该路径可完成构建与召回,但一般化的规模、吞吐和值保真仍需要更多样本验证。如果你要的是"让 agent 记住用户的长期画像和偏好演变",Memvid 的能力模型并不匹配。

这个"定位纠偏"也适用于其他几个项目(Basic Memory 是 note/KB 不是 QA memory、Universal Memory MCP 是云代理不是本地引擎)——选型的第一步永远是搞清"这个工具到底解决什么问题",而不是看 star 数和榜单排名。

## 附录 C:v1 video/QR 路线的工程细节

本次实测的是 v1(pip memvid 0.1.0),video/QR 路线。它的工程实现值得展开:

**Encoder(build_video)。** `enc.add_text(text)` 累积文本 → 内部分块(按 chunk_size)→ 每块用 qrcode 库编码成一个 QR 码 → 渲染成一帧图像(549 块 → 549 帧)→ 用 ffmpeg(经 docker 调)把帧序列编码成 MP4 + 写一个 index.json(块号 → 帧号 + 偏移的映射)。本次 138K token → 549 帧 → 9MB MP4 + 586KB index,build 约 2 分钟(主要是 QR 生成 6 帧/秒 + ffmpeg 编码)。

**Retriever(search)。** `ret.search(query, top_k=5)`:query 经自带 ONNX embedder(BGE)算向量 → 在 index 里做向量 + BM25 找 top-k 帧号 → 从 MP4 随机读取对应帧 → 解码 QR → 还原原始文本块。search 秒级(向量召回 + QR 解码都快)。

**为什么用视频。** v1 的卖点是"把记忆库编码成一个 MP4 视频文件"——视频是通用、可压缩、可流式读取的容器。一个 MP4 就是整个记忆库,可复制 / 传输 / 在任何能解码视频的环境读。这是"便携"的极致。但代价是:build 慢(QR + ffmpeg)、检索要解码 QR(比直接读 DB 慢)、视频容器对随机访问不友好。

**v2 为什么放弃视频。** v2 改用 Rust 单文件 `.mv2`(B-tree + WAL + Tantivy BM25 + HNSW 向量 + time index,全 embedded)。这放弃了"视频"的新颖性,但换来了:更快的 build(无 QR / ffmpeg)、更快的检索(直接索引,无 QR 解码)、更稳定的存储(WAL,不依赖视频容器)。v2 是工程上的回归——"单文件 + 零依赖"的理念保留,"视频"的实现放弃。

## 附录 D:无抽取路线的边界——multi/temporal/knowledge 为什么全败

本次 LongMemEval Memvid 25%,multi-session / temporal / knowledge-update 三类全败。根因是"无抽取逐字块"的固有边界:

**multi-session 聚合败("数几件衣服")。** 逐字块存的是"对话里提到了某件衣服"的原文片段,没有结构化的"衣物列表"。要数总数,要么 reader 把所有相关片段读全 + 自己数(本次 reader 只读了 top-5,不全),要么需要预聚合(无抽取路线不做)。所以答 2 而非 3。这是无抽取 + 无聚合的固有弱点。

**temporal 败("两次参观间隔几天")。** MoMA / Met 的参观日期散落在不同会话原文里。逐字块检索按"问题 vs 块"的向量相似度,可能召回某个含 MoMA 的块但不含日期,或含日期但不是 MoMA 的。要算"间隔几天",需要:精确定位两个日期 + 计算差值。无抽取路线把"定位 + 计算"全推给 reader,而 reader 从 top-5 块里拼不全两个日期。Graphiti 的 bi-temporal 是为这类题设计的(但它在本地抽不出日期)。

**knowledge-update 败("最新成绩",返回旧 27:12)。** 逐字块新旧都存(原文里既有旧 27:12 也有新 25:50)。检索按相似度,旧的可能排前面(本次就是)。无抽取路线没有"判断哪个最新"的机制——它只存不消解。Supermemory 在这题对,正是因为它有矛盾消解。

这三类失败不是 Memvid 的 bug,是"无抽取逐字块"路线的本质边界:它强在"找相关原文片段"(single-session / 事实查找),弱在"聚合 / 推理 / 更新"。这是 RAG 的普遍边界,不是 Memvid 特有。把 Memvid 用在它擅长的场景(便携 RAG),它优秀;用在它不擅长的场景(agent 记忆),它 25%。

## 附录 E:Memvid 自报 85.65% 和实测 25% 的差距

Memvid 自报 LoCoMo 85.65%(通过 memvid.dev 云 + gpt-4o judge + text-embedding-3-large),本次实测 LongMemEval 25%。差距巨大,原因:

**benchmark 不同。** 厂商是 LoCoMo(经 memvidbench),本次是 LongMemEval。不同基准,题型 / haystack 不同。

**后端不同。** 厂商用云产品(优化模型 + OpenAI judge + OpenAI embedding text-embedding-3-large);本次用本地 v1(自带 ONNX bge + qwen reader + gpt-5.4 judge)。

**规模不同。** 厂商可能完整 haystack;本次缩减 ~9K token 子集。

**最关键:厂商的 85.65% 是云产品跑的,本地免费引擎复现不到。** memvidbench 头条分数需 MEMVID_API_KEY(memvid.dev 云)。本地 Rust 核心 / v1 pip 包是免费引擎,能力不同于云产品。

所以 85.65% 是云产品的厂商自报,25% 是本次本地引擎在选取子集上的作者运行记录。两者协议不同,都不能脱离各自版本、配置与样本做横向比较;选型时应在实际部署方案上重新验证。

这再次说明:**benchmark 数字必须连同"用什么后端 / 什么规模 / 什么 judge"一起看,否则没意义。** Memvid 的 85.65% 和 25% 都是"真的",但对"本地零依赖"的采用决策,只有 25% 相关。

## 附录 F:Memvid 在不同场景下的预期表现

把 Memvid 放进不同场景,预期表现差异巨大,这有助于判断它是否适合你:

**场景一:大规模文档 RAG(候选强项)。** 你有一个大文档库(产品手册、法规、代码库),要编码成可移植单文件做"找相关片段"。本次一个 138K 样本完成了构建与召回,可支持进一步 POC,但还不能推断更大规模下的吞吐与稳定性。

**场景二:长程对话记忆(弱项)。** 你要让 agent 记住用户长期对话,回答"我们之前聊过 X 吗""用户偏好什么"。Memvid 在这里弱——无聚合、无 profile、返回 stale。本次 LongMemEval 25% 就是这个场景。预期表现:低。

**场景三:知识更新追踪(致命弱项)。** 事实会变(预算改了、地址搬了),要反映最新。Memvid 在这里致命——新旧都存,捞 stale。knowledge-update 题返回旧 27:12。预期表现:失败。

**场景四:离线 / 边缘 RAG(强项)。** 无网络环境(边缘设备、保密环境)做 RAG。Memvid 自带 ONNX embed + 单文件,完全离线。预期表现:强。

**场景五:和 LLM agent 结合做 QA(中)。** Memvid 检索片段 + 外接 LLM 合成答案。单次事实查询 OK(single-session 对),复杂推理(多跳、计数)弱。预期表现:中等。

所以 Memvid 是一个"场景敏感"的工具——在它擅长的(便携 RAG、离线、大规模片段检索)很强,在它不擅长的(agent 记忆、更新追踪、聚合推理)很弱。选型时务必先定位你的场景属于哪类,再决定。本次评测的 25% 是"场景二/三"的数,不是 Memvid 整体能力的数。

## 附录 G:Memvid 的版本混乱与社区状态

Memvid 的版本状态比较混乱,值得记录以免踩坑:

**两个包名。** `pip install memvid`(本次实测,v1 0.1.0,video/QR)vs `pip install memvid-sdk`(研究说的 v2 Rust wrapper)。用户容易装错。

**repo 名。** canonical 是 `memvid/memvid`,但旧资料 / 教程常写 `kingjulio8238/Memvid`(404,那是另一个项目 Memary)。

**v1 vs v2 教程。** 多数第三方博客 / MCP 教程仍描述 v1(QR / 视频),v2(Rust .mv2)的资料少。

**release 卫生。** v2.0.x release 编号有时非单调(v2.0.157 比 v2.0.136 先发布);WAL corruption bug(#230)在 v2.0.140 才修——格式稳定性仍在成熟。

**社区。** 15.7k star,活跃,但版本治理 / 文档跟不上 pivot 速度。这是"快速演进的小团队项目"的典型状态——能力强但用起来要自己摸索。

所以采用 Memvid 要预期"版本混乱 + 文档滞后"——装哪个包、看哪个版本文档、是不是踩了已修的 bug,都要自己核实。这是它"零依赖 / 便携"优势的隐性成本。
