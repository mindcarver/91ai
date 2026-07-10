# Letta(MemGPT):agent 自管的 OS 式记忆深度技术解析

> **证据边界：R1。** 本页属于作者运行/资料调研记录；harness、输入与原始结果尚未公开，分数和选型判断只绑定当时版本、配置、样本与协议，不能视为独立复现结论。详见[评测可复现性状态](../../reproducibility-status.md)。

> 项目地址:https://github.com/letta-ai/letta 。License:Apache-2.0。约 23626 star(2026-07-03 实测)。前身是 MemGPT。PyPI 包 `letta`(server)和 `letta-client`(SDK),实测 server 版本 0.16.8。本文技术细节来自源码、官方文档与本次 docker-compose + ollama 下的 L1 实测。

## 一、项目定位与一句话概括

Letta 是一个"完整的有状态 agent 运行时",它的核心思想来自 MemGPT:把 LLM 当成操作系统,让它自己管理一个分层的"内存"。和 Mem0 / LangMem 那种"独立记忆服务"不同,Letta 不只是记忆后端——它本身就是一个 agent server:你创建 agent、给 agent 配记忆块和工具、往 agent 发消息,agent 自己(通过 tool call)决定往核心记忆写什么、从 archival 检索什么、调用什么外部工具。记忆是这个 agent 的一部分,由 agent 自己管。

一句话:Letta = 一个 agent runtime,其中记忆不是被外部流水线抽取的,而是被 agent 自己通过 tool call 管理的 OS 式内存层次。

## 二、仓库与社区元数据

- 主仓 `letta-ai/letta`,Apache-2.0,约 23626 star。
- 语言:Python(OSS server)+ TypeScript / Node(Letta Code CLI)。
- PyPI `letta`(server,0.16.8)、`letta-client`(Python / Node SDK)。还有 `@letta-ai/letta-code`(本地 CLI agent,npm)。
- 2024-08 起持续高频发布(140+ 个 release)。

## 三、整体技术架构

Letta 的架构是一个完整的 agent server,核心组件:

**Server(REST + SSE)。** FastAPI server,默认端口 8283(还有 8083 用于 ADE UI)。提供 agent 的 CRUD、消息、记忆块、archival、工具、sources(files)等 REST 接口,以及 SSE 流式消息。状态存在 Postgres + pgvector(通过 SQLAlchemy + Alembic 迁移)。

**Agent state(核心)。** 一个 agent 携带:配置(model + embedding + tools)、记忆块(memory blocks,核心记忆)、消息历史(recall memory)、archival memory(向量库)、以及沙箱工具执行环境。

**记忆的三层(MemGPT OS 式)。** 这是最有辨识度的设计:
- **核心记忆(core memory)**:在 LLM 上下文里的记忆块(如 persona 块 = agent 的人设、human 块 = 关于用户的事实)。这些块的内容就在每次推理的 system prompt 里。
- **archival memory**:向量库,存大量不常驻上下文的事实 / 文档,按需检索。
- **recall memory**:消息历史(可检索)。

**工具与沙箱。** agent 可以调用工具:记忆管理工具(`core_memory_append` / `core_memory_replace` / `archival_memory_insert` / `archival_memory_search`)、外部工具(自定义 function tools、MCP tools)、以及沙箱里跑的代码 / shell(Docker 沙箱)。

**Letta Filesystem(filesystem memory)。** 这是 Letta 现在主推的记忆路线:把原始文本 / 文件挂给 agent(自动 embed),agent 用 `grep` / `search_files` / `open` / `close` 这些文件工具自己检索。它不做独立的事实抽取流水线,直接存原文让 agent 搜——这避免了抽取丢值,也是它在 LoCoMo 上自报 74%(超过 Mem0 graph 的 68.5%)的原因。

## 四、核心记忆模型与实现原理

Letta 的记忆模型可以叫"agent 自管的 file-text / 分层内存"。关键原理:

**记忆由 agent 自己改,不是外部抽取。** 传统记忆系统(Mem0 等)是:外部流水线抽事实 → 存。Letta 是:把记忆管理工具暴露给 agent,agent 在对话过程中自己决定"这条信息值得记 → 调 core_memory_append 写进 human 块"或"调 archival_memory_insert 存进向量库"。agent 的 LLM 通过 tool call 完成记忆的读写。这意味着记忆质量高度依赖 agent LLM 的 tool-calling 可靠性——模型弱,会漏调 / 误调工具,记忆静默退化。

**核心记忆在上下文里。** persona 块和 human 块的内容直接拼在 system prompt 里,所以 agent 每次推理都能看见它们(代价是占上下文 token)。这适合"稳定的、高优先级的事实"。

**Archival 用向量检索。** 大量低优先级事实存 archival(向量库),agent 需要时调 `archival_memory_search(query)` 取回。Letta 的向量检索通过 OpenAI 兼容的 `/v1/embeddings` 端点(默认 OpenAI,可指 ollama)。

**Filesystem = 不抽取。** filesystem 路线把原始文件挂给 agent,agent 用文件工具(grep / search_files)按需检索。没有抽取这一步,所以值不丢。Letta 官方博客说这个简单方案在 LoCoMo 上 74%,超过专门的记忆框架——一个反认知的结论:"有时候直接存原文让 agent 搜,比精心设计的事实抽取更好"。

## 五、端到端数据流

以本次实测为例(docker-compose pgvector + letta_server,ollama glm-4.7 agent):

1. **起 server**:`docker compose up`(pgvector + letta_server,容器内访问宿主 ollama 需配 `host.docker.internal:host-gateway`,OLLAMA_BASE_URL=http://host.docker.internal:11434/v1)。server 起 8283,health 返回 307(正常重定向)。
2. **创建 agent**:`c.agents.create(name=..., memory_blocks=[{"label":"human","value":""},{"label":"persona","value":"..."}], model="ollama/glm-4.7:latest", embedding="ollama/qwen3-embedding:4b")`。注意 model 必须是 `provider/model-name` 格式(如 `ollama/glm-4.7:latest`)。
3. **摄入对话**:`c.agents.messages.create(agent_id, messages=[{role,content}...])`。每条消息进来,agent 的 LLM 推理:可能调 `core_memory_append` 把用户事实写进 human 块、可能调 `archival_memory_insert` 存进向量库、可能直接回复。这一步是 agent 自治的,可能有多轮 tool call。
4. **查询**:`c.agents.messages.create(agent_id, messages=[{"role":"user","content":"What is my frequent-flyer number?"}])`。agent 推理:从 human 块(在上下文里)直接读到 FF 号,或调 `archival_memory_search` 去向量库找,然后回复。
5. **响应**:返回 messages 列表,找到 assistant 消息(content 可能是 text block 列表,取 type=="text" 的)。

## 六、技术栈与依赖

- server:Python,SQLAlchemy[asyncio] + Alembic + pgvector + FastAPI + openai[realtime] + anthropic + llama-index-embeddings-openai(它用 llama-index 的 OpenAI embedding 客户端走 /v1/embeddings)+ Docker SDK(沙箱工具执行)+ Pydantic。
- 存储:Postgres + pgvector(SQLAlchemy/Alembic 迁移,Docker 镜像挂 `~/.letta/.persist/pgdata`)。SQLite 可作本地 dev 回退。
- embeddings:走 OpenAI 兼容 `/v1/embeddings`(llama-index-embeddings-openai),指 ollama 时用 ollama 的 embedding 模型。
- Letta Code CLI:Node / TypeScript。

## 七、本地部署与 LLM 后端(ollama)

Letta 完全 model-agnostic,官方文档明确支持 ollama:docker server 设 `OLLAMA_BASE_URL=http://localhost:11434/v1`(Linux 用 `--network host` 或配 host-gateway,容器内 localhost 不是宿主)。LM Studio 也支持(LMSTUDIO_BASE_URL)。同一个 OpenAI 兼容端点既服务 chat 又服务 embedding,所以 ollama 一个 qwen2.5 + 一个 embedding 模型(nomic-embed-text / qwen3-embedding)就能本地跑全链路。

关键坑:**必须同时配 chat 模型和 embedding 模型都指向本地**,只配一个会让没配的那个静默回退到 OpenAI。本次实测,glm-4.7:latest 作 agent LLM(tool-calling 比 qwen2.5:14b 强得多)+ qwen3-embedding:4b 作 embedding,跑通且效果极好。

## 八、MCP 集成

Letta 是 MCP **消费者**:可以把一个外部 MCP server 作为"MCP tools"挂到 agent 上(agent 通过 MCP 协议调外部工具)。它区分 server tools(Letta 沙箱里跑)、client tools(调用方环境跑)、MCP tools(外部 MCP server)。官方 2025 初就支持 MCP。Letta 自己也有社区做的 MCP server 包,但一方主要还是 MCP 消费者。注册 MCP server 时支持自定义 headers(包括自动 agent_id)。

## 九、云门控与商业模型

- OSS / 自托管:功能完整——agent runtime、完整 MemGPT 记忆层次、archival / 向量召回、filesystem memory、沙箱工具、ADE UI,全部本地跑,无需账号。本地模型(ollama / LM Studio)同时支持 LLM 和 embedding。
- 付费 / 云(Constellation):chat.letta.com、托管 hosting、远程 / 可扩展 infra、Letta Cloud API key(LETTA_API_KEY),app.letta.com 是计费的。模型本身(OpenAI / Anthropic)的费用自负,用本地 ollama 可避免所有付费 LLM / embedding key。
- 没有证据表明高级 recall 被云锁(和 Zep 不同)——recall 在本地 pgvector 上跑。

## 十、性能与基准

官方自报(L3,2025-08 博客):LoCoMo(长程对话检索 QA)74.0%,用 Letta Filesystem 方案 + GPT-4o-mini,超过 Mem0 graph 的 68.5%。注意这是 agent 驱动的迭代文件检索,和 Mem0 那种 atomic-fact 系统不完全 apples-to-apples。

本次实测(L1,协议偏差——Letta 由 agent 直接回答,不是固定 reader):冒烟 12/12 = 100%。这只说明该直接回答协议下的 12 题全部答对,不能与固定 reader 组做横向排名。LongMemEval 未跑通——agent 逐消息 tool call 在 9K+ token 多会话 haystack 上太慢,首题只摄入 1 个 session 就 600s 超时。

## 十一、已知问题与失败模式

- **运维栈重**:需要 Postgres + pgvector(docker-compose,还要 Redis 相关依赖),不是单二进制 / 单 pip 包。独立 `docker run letta/letta` 会卡在"Waiting for Redis"。容器内访问宿主 ollama 要配 host-gateway(不是 localhost)。
- **tool-calling 依赖强模型**:整个记忆模型依赖 agent LLM 可靠调记忆工具;小本地模型(qwen2.5 / glm 小杯)会漏调 / 误调,记忆静默退化。官方推荐 Opus 4.5 / GPT-5.2 级。本次用 glm-4.7 表现很好。
- **不 scale 到大 haystack**:agent 逐消息处理 + tool call,在 LongMemEval 规模(140K token)上吞吐杀手。本次实测 9K token 单题就超时。
- **无原生时序 / 聚合 API**:核心记忆是文本块,时序过滤 / 跨会话计数要靠 agent 自己读文本推理,不是结构化查询。
- **embedding-gap 历史**:历史上 Letta 默认 OpenAI / HF embedding,原生 ollama embedding 是社区长期请求(cpack/MemGPT#1369),老教程可能踩坑。

## 十二、本次实测发现(L1)

本次 docker-compose(pgvector + letta_server)+ letta-client + ollama glm-4.7:

- **冒烟 100%(12/12)**:在 agent 直接回答协议下 12 题全对;由于协议不同,不参与固定 reader 组排名。
- **运维门槛真实**:要拉 compose.yaml + init.sql + nginx.conf,建 .env,配 host-gateway,起 pgvector + letta_server。比 Mem0 / Memvid 重得多。
- **LongMemEval 不可行**:agent 路线在大 haystack 上吞吐杀手,首题超时。

## 十三、适用场景与选型建议

适合:需要一个完整有状态 agent runtime(不只是记忆),且能给 agent 配一个 tool-calling 强的模型(glm-4.7 / Opus / GPT-5 级)。Letta 的 file-text 路线在小到中等规模的事实回忆上极强(本次 100%)。

不适合:运维要轻(它重)、要在 LongMemEval 规模大 haystack 上批量摄入(agent 路线太慢)、要纯记忆后端不要 agent runtime(那是 Mem0 的定位)。

建议标签:**先试点 / 单机采用**(冒烟 100% 强,但运维重 + LME 不 scale,采用前确认你的规模和运维预算)。如果用,务必配强 tool-calling 模型,否则 agent 会漏写记忆。

## 十四、与同类对比

- vs **Mem0**:Letta 是 agent runtime(自管记忆),Mem0 是可插拔记忆层(外部抽取)。Letta 冒烟 100% > Mem0 83%(配强模型时),但 Mem0 运维轻、可插任意框架、scale 更好。
- vs **Hindsight**:都是 agent runtime,都自带 MCP。Hindsight 嵌入式 Postgres(零配置),Letta 要 docker-compose;Hindsight 自报 91.4%(Gemini-3 Pro),Letta 自报 74%(GPT-4o-mini)。
- vs **Cognee / Graphiti**:那些是图记忆(外部抽取建图),Letta 是 agent 自管文本 / 文件。Letta 不丢值(file-text),图类在本地小模型下丢值重。

## 附录 A:实测可用的部署与调用代码

本次实测用 docker-compose 起 Letta 栈,核心步骤(已跑通):

```bash
# compose.yaml 关键:letta_db(pgvector)+ letta_server
# letta_server 必须加 extra_hosts 让容器内访问宿主 ollama
#   extra_hosts: ["host.docker.internal:host-gateway"]
# .env:
#   OLLAMA_BASE_URL=http://host.docker.internal:11434/v1
#   OPENAI_API_KEY=ollama
docker compose up -d letta_db letta_server   # 等 pgvector healthy,server 起 :8283
```

```python
from letta_client import Letta
c = Letta(base_url="http://localhost:8283", timeout=300)
# model 必须是 provider/model-name 格式;embedding 单独配
agent = c.agents.create(
    name="my_agent",
    memory_blocks=[
        {"label": "human", "value": ""},                       # 核心记忆:关于用户
        {"label": "persona", "value": "You remember facts and answer from memory."},
    ],
    model="ollama/glm-4.7:latest",          # agent LLM(tool-calling 要强)
    embedding="ollama/qwen3-embedding:4b",  # archival 向量库的 embedder
)
# 摄入:每条消息进来,agent 自行 tool call 写记忆
c.agents.messages.create(agent_id=agent.id,
    messages=[{"role":"user","content":"I'm Daniel, FF number XQ-7712-3309."},
              {"role":"assistant","content":"Noted your FF number."}])
# 查询:agent 从核心记忆 / archival 检索后回复
resp = c.agents.messages.create(agent_id=agent.id,
    messages=[{"role":"user","content":"What is my frequent-flyer number?"}])
# 解析 assistant 文本(content 可能是 [{type:text,text:...}] 的 block 列表)
for msg in reversed(resp.messages):
    if "assistant" in (msg.message_type or "").lower():
        ans = msg.content if isinstance(msg.content, str) else \
              " ".join(b["text"] for b in msg.content if isinstance(b,dict) and b.get("type")=="text")
        break
```

这段代码每一处都有实测教训:`model` 必须是 `provider/model-name`(写裸 `glm-4.7:latest` 会报 INVALID_ARGUMENT);容器内访问宿主 ollama 必须 `host.docker.internal`(配 host-gateway),写 `localhost` 指向容器自己不通;agent 的回复 content 是 block 列表不是纯字符串,要正确解析。

## 附录 B:MemGPT OS 式记忆层次的实现细节

Letta 的记忆层次是它最核心的设计,理解每一层的实现:

**core memory(核心记忆)**:存 agent state 里的 memory blocks(persona / human / 自定义)。每次推理,这些块的当前内容被拼进 system prompt。agent 通过 `core_memory_append` / `core_memory_replace` 工具改它们。优点:agent 每次都能看见(在上下文里);缺点:占 token,所以只放高优先级 / 稳定事实。human 块典型存"用户叫 Daniel,素食,FF 号 XQ-7712-3309"这类。

**archival memory**:向量库(pgvector)。agent 通过 `archival_memory_insert` 存、`archival_memory_search(query)` 检索。存大量低优先级事实 / 文档。检索通过 OpenAI 兼容 /v1/embeddings(指 ollama 时用 ollama embedding 模型)。优点:不占上下文、能存海量;缺点:检索是近似的(top-k 向量召回),可能漏。

**recall memory**:消息历史。可检索(也走向量或全文)。

**memory blocks 的动态性**:核心记忆是动态的——agent 在对话中自己决定往里写什么。本次实测 glm-4.7 把用户的事实(FF 号、猫、工作等)都正确写进了 human 块,所以查询时能从上下文直接答(100%)。如果 agent LLM 漏调 core_memory_append,事实就没被记下来——这是 Letta 记忆质量完全依赖 agent LLM tool-coding 可靠性的根本原因。

## 附录 C:filesystem memory 为什么赢过事实抽取

Letta 官方博客一个反认知结论:把对话历史直接存成文件挂给 agent,让 agent 用 grep / search_files 检索,在 LoCoMo 上拿 74%,超过 Mem0 graph 的 68.5%。为什么这个"原始"方案能赢?

**不丢值**:文件存的是原文,具体数值 / 时间戳 / ID 一个不丢。事实抽取(Mem0 v3)会把对话抽象成自然语言句子,丢值是固有风险。filesystem 路线没有这个损失。

**agent 自适应检索**:agent 看到问题后,自己决定怎么搜(grep 关键词、search_files 向量、open 读特定文件),可以多轮迭代检索。这比"一次向量召回 top-k"灵活——尤其对需要跨多个位置拼答案的问题。

**上下文压缩**:文件本身不占 agent 上下文,只有检索回来的片段占。agent 可以在大量历史里按需取用。

代价:agent 每次查询要多轮 tool call(慢),且依赖 agent LLM 的检索决策能力。本次实测 glm-4.7 在小规模冒烟上表现极好(100%),但 LongMemEval 大 haystack 上 agent 逐消息处理 + 多轮检索太慢(超时)——filesystem 路线的优势在"质量"不在"吞吐"。

## 附录 D:运维栈的真实复杂度

Letta 的运维成本明显高于 Mem0 / Memvid,这是它"采用"的主要摩擦:

- **Postgres + pgvector**:必须有一个 Postgres(带 pgvector 扩展)做 state + 向量库。docker-compose 用 ankane/pgvector 镜像,需要 init.sql 创建扩展。
- **(历史上)Redis**:旧版 / 某些配置需要 Redis 做消息队列。独立 `docker run letta/letta` 会卡在"Waiting for Redis"。新版 compose 可能已去 Redis,但要看版本。
- **nginx(可选)**:compose 第三个服务是 nginx 代理(80 端口),自托管 dev 可跳过,直接打 8283。
- **迁移**:Alembic 管 Postgres schema 迁移,首启会跑迁移。
- **沙箱**:agent 的代码 / shell 工具在 Docker 沙箱里跑(需要 Docker)。
- **容器网络**:容器内访问宿主 ollama 要 host-gateway,这是 Linux 上最常见的踩坑点。

这套栈相比 Mem0(一个 pip 包 + qdrant 本地文件)或 Memvid(一个 pip 包 + 单文件),重得多。但换回来的是完整 agent runtime(不只是记忆)+ 沙箱工具执行 + ADE UI。

## 附录 E:适用边界与失败模式补充

- **规模天花板**:agent 路线(逐消息 tool call)在 LongMemEval 140K token 大 haystack 上吞吐杀手。本次实测 9K token 单题就超时。如果你的场景是"一次性灌入海量历史然后查",Letta 不是好选择(那是 Mem0 / Memvid 的场景)。如果你是"持续对话、agent 边聊边记",Letta 强。
- **模型依赖**:整个记忆质量押在 agent LLM 的 tool-calling 上。glm-4.7 / Opus / GPT-5 级可靠;qwen2.5:14b 这类小模型会漏调 / 误调工具,记忆静默退化。官方明确推荐 Opus 4.5 / GPT-5.2。
- **无结构化时序查询**:核心记忆是文本块,时序过滤 / 跨会话计数要靠 agent 读文本推理,不是结构化查询(这点不如 Graphiti 的 bi-temporal)。
- **配置完整性**:必须同时配 chat 模型 + embedding 模型都指本地,只配一个会静默回退 OpenAI。
- **记忆治理弱**:agent 自己写记忆,没有自动去重 / 过期 / 矛盾消解(核心记忆块会越写越长,需要 agent 自己 core_memory_replace 整理或靠 compaction 机制)。

这些边界说明 Letta 值得在"中等规模持续对话 + 强模型 + 需要 agent runtime 不只是记忆"的场景做 POC。本次 agent 直接回答协议记录为 12/12,但不支持据此判断它在跨工具比较中最强。
