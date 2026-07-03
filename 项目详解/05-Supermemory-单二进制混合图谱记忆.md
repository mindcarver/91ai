# Supermemory:单二进制混合图谱记忆引擎深度技术解析

> 项目地址:https://github.com/supermemoryai/supermemory 。License:MIT。约 28120 star(2026-07-03 实测)。自托管单二进制 `supermemory-server`(v0.0.3),REST API 在 :6767。本文技术细节来自源码、官方文档与本次 ollama + 中转站下的 L1 实测。

## 一、项目定位与一句话概括

Supermemory 是一个单二进制的、可自托管的"混合记忆引擎"。它明确区分"memory"(关于用户的、随时间演变的事实,带 profile)和"RAG"(无状态文档块检索),并在一个引擎里同时跑两者。核心卖点是:LLM 驱动的事实抽取 + 矛盾 / 时序消解 + 自动遗忘(auto-forgetting)+ 自动维护的用户 profile(static 稳定事实 + dynamic 近期活动),全部在一个本地二进制里,embedding 用自带的 WASM 模型。

一句话:Supermemory = 一个单二进制的混合(事实抽取 + 图谱 + profile + RAG)记忆引擎,强在矛盾 / 时序消解。

## 二、仓库与社区元数据

- 主仓 `supermemoryai/supermemory`,MIT,约 28120 star。语言 TypeScript(turbo + bun monorepo,Node>=20)。
- 自托管:curl install 装 native binary(`supermemory-server`);SDK `npm/pip install supermemory`(HTTP client)。
- 另有 `supermemoryai/supermemory-mcp`(云 MCP 入口,deprecated)。
- 活跃(2026-07-03 仍有提交)。

## 三、整体技术架构

**核心是一个嵌入式的"graph engine"(闭源二进制)。** 这个引擎做:LLM 驱动的事实抽取、矛盾 / 时序消解(新事实进来时把旧的标失效)、auto-forgetting(过期事实自动遗忘)、profile 维护(per-user 的 static + dynamic 事实集)。它跑在本地 server 进程里,数据存本地磁盘(`./.supermemory`)。

**LLM 是 bring-your-own。** server 启动时设 `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `OPENAI_MODEL`(可指 ollama 或任何 OpenAI 兼容端点),用于摘要、上下文分块、记忆抽取。注意:**embedding 不是 LLM 提供的**——见 embedding-gap。

**Embedding 是自带的 WASM embedder。** 这是 Supermemory 最关键的"坑":embedding 不走 OPENAI_BASE_URL,而是用二进制内置的 WASM embedder(Xenova/bge-base-en-v1.5),1 个 worker 默认,可调 pool/threads/batch/RAM 上限。这意味着你**不能换 embedding 模型**(不能用 ollama 的 qwen3-embedding),横评时必须标注"embedding 不统一"。

**REST API(:6767)。** `POST /v3/documents`(add,异步,返回 queued)→ 后台 extractor LLM + embedder 处理 → `search` / `recall` / `profile` / `context` 检索。localhost 自动鉴权(server 启动时生成一个 `sm_` key,对 localhost 自动应用)。

**hybrid 检索。** 一次查询同时跑 RAG(文档块向量召回)+ personalized memory(用户记忆事实),融合返回。还有专门的 `profile()`(~50ms)返回用户 profile 摘要。

## 四、核心记忆模型与实现原理

Supermemory 的记忆模型是"混合:事实抽取 + 图谱 + profile + 时序消解"。

**memory vs RAG 的区分。** 这是它的设计哲学。RAG = 无状态的文档块检索(查文档);memory = 关于用户的、随时间演变的事实(查"用户是谁、偏好什么")。一个查询默认同时跑两者,融合返回。这比纯 RAG 或纯事实记忆更接近"agent 记忆"的真实需求。

**矛盾 / 时序消解(核心优势)。** 新事实进来时,引擎会找相关已有事实,做矛盾检测:如果新事实和旧事实矛盾(用户预算从 4500 改成 6000),引擎把旧的标为失效、新的标为有效。这是它对 Mem0(ADD-only,不消解)的根本优势。本次 LongMemEval knowledge-update 题,Supermemory 是唯一答对的工具(返回最新 25:50 而非旧 27:12)——就是这个机制生效。

**auto-forgetting。** 引擎根据时间 / 相关性自动遗忘过期事实(避免记忆库膨胀 + stale 干扰)。这是 profile 维护的一部分。

**profile 维护。** per-user 维护一个 profile,分 static(稳定事实:姓名、长期偏好)和 dynamic(近期活动)。`profile()` 调用快速返回这个摘要,供 agent 注入上下文。

**LLM 抽取。** 摄入时 extractor LLM 把内容抽成结构化记忆事实(带语义、时间),写图谱引擎。抽取质量依赖 LLM(本次用 ollama qwen2.5:14b 和 gpt-5.4 都试过)。

## 五、端到端数据流

本次实测(ollama qwen2.5:14b extractor + 自带 WASM embedder):

1. **起 server**:`OPENAI_BASE_URL=http://localhost:11434/v1 OPENAI_API_KEY=ollama OPENAI_MODEL=qwen2.5:14b supermemory-server`。首次启动下载 WASM embedder(~106MB,bge-base-en-v1.5),~25 秒后 :6767 就绪。从启动日志抓 `sm_` key 存 `.supermemory_apikey`。
2. **add**:`c.documents.add(content=会话文本, container_tags=[user], task_type="memory")` → 返回 `status="queued"`(异步)。后台:extractor LLM 抽事实 → WASM embedder 算向量 → 写图谱引擎 + 做矛盾消解。
3. **等处理完成**:`documents.list_processing()` 不可靠(返回 0 但还在队列),要轮询 `search` 直到非空(本次每 doc ~26 秒抽取)。
4. **search**:`c.search.memories(q=query, container_tag=user, limit=5, search_mode="memories")` → 返回 memory 事实(带 content)。

## 六、技术栈与依赖

- 运行时:native binary(supermemory-server,macOS arm64/x64 + Linux x64/arm64;无 Windows native,要 WSL)。
- LLM:bring-your-own(OpenAI / Anthropic / Gemini / Groq / Cloudflare / Vertex / 任何 OpenAI 兼容如 ollama)。
- Embedding:**自带 WASM embedder**(bge-base-en-v1.5),不可换。
- 存储:嵌入图谱引擎 + 本地磁盘(`./.supermemory` 或 SUPERMEMORY_DATA_DIR)。无外部 DB / 向量库 / 图库。
- SDK:TypeScript / Python HTTP client(指向 :6767)。

## 七、本地部署与 LLM 后端(ollama)

官方文档明确支持完全离线:`OPENAI_BASE_URL=http://localhost:11434/v1` + `OPENAI_API_KEY=ollama`(任意非空)+ `OPENAI_MODEL=qwen2.5:14b`(或 gpt-oss / glm)。细粒度还有 `OPENAI_FAST_MODEL`(轻任务)/ `OPENAI_TEXT_MODEL`(重文本任务)。首次启动向导也支持交互式选 OpenAI 兼容端点。

**关键 caveat(embedding-gap)**:embedding 是自带 WASM,不走 ollama /v1/embeddings。所以 qwen3-embedding 用不上。文档没有配置项换 embedder,只有本地 embedder 的调优旋钮(SUPERMEMORY_LOCAL_EMBEDDING_POOL_SIZE / WASM_THREADS / BATCH_SIZE / IDLE_TIMEOUT_MS / SUPERMEMORY_SKIP_EMBEDDING_PREWARM / SUPERMEMORY_EMBEDDING_RAM_LIMIT 默认 1GB)。

**多模态 caveat**:图片 / 视频 / 高保真 PDF 理解即使在本地二进制上也**需要 Gemini 或 Vertex key**(纯文本可用 ollama 完全离线)。

## 八、MCP 集成

- 暴露**托管 MCP server**(https://mcp.supermemory.ai/mcp,OAuth 或 Bearer sm_ key),工具 `memory`(存/忘)/ `recall`(搜)/ `context`(注入 profile)。一键安装到 Claude Desktop / Cursor / Windsurf / VS Code / Claude Code / OpenCode 等。
- 自托管二进制本身是 HTTP API(:6767),不是 MCP server——MCP 端点是云 / 平台特性。

## 九、云门控与商业模型

- 本地(免费,MIT):完整图谱引擎(事实抽取 + profile + 遗忘 + 矛盾消解)+ hybrid 检索 + 文件处理(文本 / PDF / 图片 OCR / 视频 / 代码 AST)+ 自带 embedding + bring-your-own LLM(含完全离线 ollama)+ 单 API key 鉴权。**核心能力全本地**。
- 平台 / 云(付费):Connectors(Google Drive / Gmail / Notion / OneDrive / GitHub 后台同步)、托管 MCP 端点、"优化"的专有抽取模型(长程调优)、托管规模 / 鉴权 / 角色 / 可观测性。
- 重要:**没有证据表明高级 recall 被云锁**——recall / search / 抽取都在本地特性集里。云锁的是 connectors / 优化模型 / 托管 MCP。

## 十、性能与基准

官方自报(L3):LongMemEval 81.6%(自称 #1);也自称 LoCoMo / ConvoMo #1。后续博客引用 ~85.2%(Gemini 3 Pro Preview)+ LongMemEval_s 上 95% Recall@15。但 README 没公布 judge / embedding / 版本,不可直接横比。

本次实测(L1):**冒烟 66.7%**(8 正确 / 1 部分 / 3 错);**LongMemEval 代表性子集 50%(2/4,全场最高)**——唯一答对 knowledge-update(返回最新 25:50)。这是本次评测最强的 LongMemEval 结果,直接导致排名反转(冒烟落后 → LME 领先)。

## 十一、已知问题与失败模式

- **embedding-gap(最关键)**:embedding 锁死自带 WASM(不可换 qwen3-embedding 或任何自定义 embedder)。横评公平性受影响,质量取决于 bge-base-en-v1.5(未公开评测)。
- **单租户 / 单机**:本地一个进程、一个自动生成 key、一个 org 一台机(无多成员 / 角色)。
- **异步摄入背压**:add 排队,RAM 超 SUPERMEMORY_EMBEDDING_RAM_LIMIT(默认 1GB)会暂停;WASM embedder 默认 1 worker,批量摄入慢。`list_processing()` 不可靠,要轮询 search。
- **图谱引擎闭源**:实际智能(图谱 / 抽取 pipeline)在闭源 native binary 里,行为不透明、不可 patch。
- **抽取质量随模型变**:本地用 BYO 模型(可能弱),自报分可能用专有模型(更强),差距存在。
- **多模态要云 key**:图片 / 视频需 Gemini / Vertex key。

## 十二、本次实测发现(L1)

本次 supermemory-server(ollama extractor + WASM embedder):

- **冒烟 66.7%**:抽取保留具体值(FF 号、猫名、预算 6000 都在),3 题缺值。
- **LongMemEval 50%(全场最高)**:single-session 对、multi-session 错(聚合弱项)、temporal 错、**knowledge-update 对(唯一)**——矛盾消解生效。
- **负分校验两次**:第一次 401(用占位 key,需 server 自动生成的真 sm_ key);第二次 0/12(async 没等够,list_processing 不可靠,要轮询 search)。
- **embedding-gap 确认**:实测启动日志确认 WASM bge-base,不走 ollama embedding。

## 十三、适用场景与选型建议

适合:需要"用户画像 + 事实更新消解 + RAG 一体"的自托管记忆后端,且重视"事实随时间演变的正确性"(矛盾消解)。Supermemory 在"事实会更新"的场景下是本次最强选择。单二进制部署也相对友好(比 Letta 轻比 Mem0 重一点)。

不适合:需要换 embedding 后端(锁死 WASM)、需要图谱引擎透明 / 可 patch(闭源)、需要多模态且要完全离线(图片 / 视频需云 key)、需要严格多租户(单租户)。

建议标签:**先试点 / 偏采用**(冒烟 67%、LME 50% 全场最高、矛盾消解真实有效;但 embedding 锁死 + 闭源要权衡)。如果你最在乎"事实更新的正确性"(用户改了预算 / 地址 / 偏好要正确反映最新),Supermemory 是本次评测的最佳选择。

## 十四、与同类对比

- vs **Mem0**:都是"抽取 + 检索"。Supermemory 多了 profile + 矛盾消解,所以 LME knowledge-update 赢 Mem0(对 vs 错)。Mem0 生态更大、embedding 可换、运维更轻;Supermemory 矛盾消解更强、单二进制但 embedding 锁死。
- vs **Letta**:Letta 是 agent runtime(自管记忆),Supermemory 是可插拔记忆层。Letta 冒烟 100% > Supermemory 67%(强模型 + agent 自管),但 Supermemory 矛盾消解是结构化的(优于 Letta 靠 agent 推理)。
- vs **Graphiti**:都做矛盾 / 时序消解。Supermemory 是闭源引擎(跑得通,67%/50%),Graphiti 是开源 bi-temporal(更严谨但本地丢值,50%/0%)。要透明用 Graphiti(配强模型),要开箱即用用 Supermemory。

## 附录 A:实测配置与调用

```bash
# 起 server(LLM 指 ollama;embedding 自动用自带 WASM)
OPENAI_BASE_URL=http://localhost:11434/v1 \
OPENAI_API_KEY=ollama OPENAI_MODEL=qwen2.5:14b \
supermemory-server   # 首启下载 WASM embedder ~25s,起 :6767
# 从启动日志抓 sm_ 真实 key(localhost 自动鉴权要用)
grep -oE 'sm_[A-Za-z0-9_]+' server.log | head -1 > .supermemory_apikey
```

```python
from supermemory import Supermemory
c = Supermemory(base_url="http://localhost:6767", api_key=open(".supermemory_apikey").read().strip())
c.documents.add(content="Daniel, FF XQ-7712-3309, budget updated to 6000.", container_tags=["u1"], task_type="memory")
# 异步:轮询 search 直到非空(list_processing 不可靠)
import time
for _ in range(30):
    time.sleep(10)
    if c.search.memories(q="budget", container_tag="u1", limit=5, search_mode="memories").documents: break
res = c.search.memories(q="What is the budget?", container_tag="u1", limit=5, search_mode="memories")
```

## 附录 B:为什么 Supermemory 赢了 LongMemEval

Supermemory 在 LongMemEval 拿到全场最高(50%)、且是唯一答对 knowledge-update 的工具,不是偶然。根因是它的"矛盾 / 时序消解 + auto-forgetting"机制——这个机制在抽取阶段(不是检索阶段)就把过期事实标失效,所以检索返回的是最新事实。

对比:Mem0 v3 是 ADD-only,新旧都存,检索可能捞 stale(本次 knowledge-update 返回旧 27:12);Memvid 是逐字块,新旧都存,同样捞 stale;Graphiti 有 bi-temporal 但本地抽取丢值 + 日期解析崩。只有 Supermemory 的消解在本地 ollama + WASM embedder 下也生效了。

这个发现是本次评测最有决策价值的结论之一:如果你的场景里"事实会随时间变化且必须反映最新"(用户偏好演变、状态变更、合同更新),Supermemory 的矛盾消解是真实有效的优势,值得为它接受 embedding 锁死 + 闭源的代价。反之,如果你的事实基本不变(静态知识库),Mem0 / Letta 更轻更透明。选型时把"你的事实会不会变"这个问题回答清楚,就能在 Supermemory 和 Mem0 之间做对选择。

## 附录 C:WASM embedder 与吞吐的工程细节

Supermemory 的自带 embedding 是 WASM(bge-base-en-v1.5),这部分有几个实测观察值得记录:

**为什么用 WASM embedder 而不是走 LLM provider。** Supermemory 把 embedding 做成二进制内置的 WASM 模块,而不是走 OPENAI_BASE_URL——这是为了让"embedding 不依赖外部 LLM provider",即使用 ollama 做抽取 LLM,embedding 仍由二进制自己跑(自带 WASM runtime)。好处:embedding 永远可用(不依赖 ollama 有没有 embedding 模型);坏处:不能用更强的 embedding 模型(qwen3-embedding 等),质量锁死在 bge-base-en-v1.5。

**吞吐限制。** 默认 1 个 worker、1 线程 / worker、RAM 上限 1GB(SUPERMEMORY_EMBEDDING_RAM_LIMIT)。批量摄入时,add 排队,RAM 超 1GB 会暂停(背压)。调优旋钮:SUPERMEMORY_LOCAL_EMBEDDING_POOL_SIZE(并发 worker)、WASM_THREADS、BATCH_SIZE、IDLE_TIMEOUT_MS、SUPERMEMORY_SKIP_EMBEDDING_PREWARM(跳过启动预热)。本次实测单 doc 抽取约 26 秒(LLM 抽取为主,WASM embed 不是瓶颈)。

**首次启动下载。** 首启会下载 WASM embedder 模型(~106MB),~20 秒,存 `.supermemory/models`。之后离线可用。

**多模态 caveat。** 图片 / 视频 / 高保真 PDF 的理解即使在本地二进制上也**需要 Gemini 或 Vertex key**(纯文本完全离线)。这是一个容易踩的坑——以为"本地二进制 = 完全离线",但多模态要云 key。

## 附录 D:负分校验的两次翻案(Supermemory)

本次实测 Supermemory 经历两次负分校验翻案,记录如下:

**第一次:401 Unauthorized。** 第一次跑,SDK 用占位 key `sm_local`,server 报 401 "Are you using the right API key? / Either userId or orgId not found"。根因:supermemory-server 启动时自动生成一个真实的 `sm_` key(打印在启动日志),localhost 自动鉴权要求用这个真 key(或完全不发 key,但 SDK 总会带 Authorization 头)。修复:从启动日志抓真 key 存 `.supermemory_apikey`,SDK 用它。

**第二次:0/12(异步没等够)。** 用真 key 后,add 返回 `status="queued"`(异步),然后立刻 search → 全 0。根因:Supermemory 的 add 是异步的(extractor LLM 在后台跑),`documents.list_processing()` 不可靠(返回 0 但实际还在队列)。修复:轮询 `search` 直到非空(本次每 doc ~26 秒抽取,加 15 秒余量)。

这两次翻案说明:Supermemory 的"异步摄入 + localhost 鉴权"两个机制,默认配置下都不直接工作,需要适配(真 key + 轮询等待)。这不是工具烂,是它的工程契约(异步 + 自动鉴权)需要适配器尊重。修对后 Supermemory 表现很好(67% / LME 50%)。

## 附录 E:为什么 Supermemory 的自报分(81.6%)和实测(67%/50%)不同

Supermemory 自报 LongMemEval 81.6%(自称 #1),本次实测冒烟 67%、LongMemEval 50%。差异原因:

**后端不同。** 厂商自报分很可能用"优化过的专有抽取模型"(文档说 Enterprise 用 tuned 专有模型,本地用 BYO 模型)。本次用 ollama qwen2.5:14b(BYO,弱于专有)。抽取质量直接影响记忆质量。

**embedding 不同。** 厂商可能用更强的 embedding;本次锁死 bge-base-en-v1.5。

**judge / 评测协议不同。** 厂商未公开 judge / embedding / 版本;本次用 gpt-5.4 judge + 固定 reader。

**规模不同。** 厂商可能跑完整 500 题;本次缩减子集(每题 ~9K token,3-4 题)。

这些差异叠加,67%/50%(本次)和 81.6%(厂商)的差距合理。关键不是哪个对,是它们**不可比**——只有在统一后端(同一 LLM + 同一 embedding + 同一 judge + 同一输入)下重跑,才能和其他工具横比。本次 50% 是 Supermemory 在"统一后端 + 代表性子集"下的真实表现,这是决策可用的数;81.6% 是营销数,不可用于横比。

这个对比再次印证本次评测的核心方法论:**统一后端重跑 > 厂商自报**。Supermemory 在统一后端下仍是 LongMemEval 第一(50%,唯一答对 knowledge-update),所以它的矛盾消解优势是真实的——只是绝对分数比营销低。这是"承认优势 + 不信营销数"的平衡。