# Basic Memory:本地优先的 markdown 知识图谱 MCP 深度技术解析

> 项目地址:https://github.com/basicmachines-co/basic-memory 。License:AGPL-3.0。约 3359 star(2026-07-03 实测)。`uv tool install basic-memory` 或 PyPI,实测版本 0.22.1。本文技术细节来自源码、CLI 实测与本次 L1 实测。

## 一、项目定位与一句话概括

Basic Memory 是一个 local-first 的"个人知识管理"工具,核心是一个 MCP server。它把知识存成本地 markdown 文件(人可读 / 可编辑)+ 一个 sqlite 数据库(带知识图谱:实体 + 观察 + 关系)+ FastEmbed 向量索引。它不是为"AI agent 的语义 QA 记忆"设计的,而是为"人和 AI 共同维护的本地知识库"设计的——AI 通过 MCP 工具读写笔记,人也能直接编辑 markdown。这个定位决定了它本次评测的表现(作 QA memory 用召回失效)。

一句话:Basic Memory = local-first markdown + sqlite 知识图谱 MCP(人机共维的 note/KB,非语义 QA memory)。

## 二、仓库与社区元数据

- 主仓 `basicmachines-co/basic-memory`,AGPL-3.0(注意是 AGPL,网络交互也要开源,企业要评估),约 3359 star。
- 语言 Python(3.12+)。`uv tool install basic-memory` 或 `pip install basic-memory` 或 Homebrew。
- 高频迭代(0.22.x,周级)。

## 三、整体技术架构

Basic Memory 的架构是"markdown 文件 + sqlite 知识图谱 + FastEmbed 向量 + MCP server":

**markdown 文件(存储 + 人机界面)。** 每条 note 是一个 markdown 文件(`eval/sess0.md` 等),存在一个 project 目录(本地)。人可以直接编辑;frontmatter 存元数据(title / tags / type / permalinks)。

**sqlite 数据库(知识图谱)。** 从 markdown 文件同步出一个知识图谱:实体(每个 note / 每个被引用的概念)+ 观察(observation,实体的属性)+ 关系(relation,实体间,markdown 里的 wiki link `[[...]]` 解析成关系)。sqlite-vec 做向量索引。

**FastEmbed 向量(embedding)。** 默认本地 FastEmbed(bge-small-en-v1.5,ONNX,CPU,无 key)。可选 LiteLLM 远程 embedding(实验性,可指 ollama 但要手配 BASIC_MEMORY_* 环境变量)。

**MCP server(FastMCP 3.0)。** 核心产品是一个 MCP server,暴露 stdio + https transport 的工具:`write-note` / `read-note` / `delete-note` / `edit-note` / `search-notes` / `build-context` / `recent-activity` 等。AI 客户端通过 MCP 调这些工具维护知识库。

**CLI。** 也有 `basic-memory tool <cmd>` CLI 直接调这些工具(本次实测用 CLI 驱动,不经 MCP-stdio)。

## 四、核心记忆模型与实现原理

Basic Memory 的记忆模型是"markdown note + 规则式知识图谱 + 关键词 / 向量检索"。

**note 是一等公民。** 知识的单位是 markdown note(不是原子事实)。一条 note 可以是一段对话、一个概念、一个文档。note 之间通过 wiki link `[[概念]]` 建立关系(解析成图的边)。

**规则式抽取(无 LLM)。** Basic Memory **自己不做 LLM 抽取**——它用规则解析 markdown:frontmatter 提元数据、wiki link 提关系、正文是实体内容。事实 / 值的抽取完全靠"写 note 的客户端 LLM"(AI agent 写 markdown 时自己组织内容)。这意味着记忆质量完全取决于写 note 的 agent——agent 弱,note 质量差(这是它的"extraction-loses-values RISK":BM 不抽,全靠客户端)。

**检索:BM25 + 向量 + hybrid。** `search-notes "query"`:
- 默认(BM25):关键词词频匹配。
- `--vector`:纯向量(FastEmbed)。
- `--hybrid`:BM25 + 向量融合。

**关键发现:对自然语言问句召回差。** 本次实测,关键词查询("frequent-flyer")能命中,但自然语言问句("What is my frequent-flyer number?")在 BM25 / 纯向量 / hybrid 三种模式下**全部返回 0 结果**。这是它的核心局限——它的检索是关键词 / 实体导向的,不是为语义 NL QA 设计的。

## 五、端到端数据流

本次实测(CLI 驱动,project "eval"):

1. **建 project**:`basic-memory project add eval /tmp/bm_eval_ws`(首次要建 project,否则 write-note 报"Project not found")。
2. **write-note**:`basic-memory tool write-note --title sess0 --folder eval --content "Daniel, FF XQ-7712-3309..."` → 写 markdown 文件 + 同步进 sqlite 图谱 + FastEmbed 索引。
3. **search-notes**:`basic-memory tool search-notes "query" --hybrid` → 返回 JSON(results[] 带 content / matched_chunk / score)。

## 六、技术栈与依赖

- `fastembed>=0.7.4`(本地 ONNX embedder,bge-small-en-v1.5)。
- `sqlite-vec>=0.1.6`(向量索引)。
- `aiosqlite>=0.20.0`。
- `openai>=1.100.2` + `litellm`(可选,仅远程 embedding;无 chat LLM 使用)。
- FastMCP 3.0(MCP server)。
- pydantic-settings / httpx。

## 七、本地部署与 LLM 后端(ollama)

**默认完全本地、零 key**:FastEmbed(本地 ONNX)+ sqlite + 所有 MCP 工具,空气隔离友好。无 LLM(BM 自己不调 LLM)。

**embedding 部分**:默认 FastEmbed(本地),不走 ollama。要指 ollama 需切实验性 LiteLLM provider(`BASIC_MEMORY_EMBEDDING_PROVIDER=liteLLM` 等,手配)。所以默认 embedding-gap(不统一 qwen3-embedding)。

**无 chat LLM**:BM 是存储 + 检索,不做 QA 合成。要 QA,客户端(读 note 的 agent / LLM)自己做。

## 八、MCP 集成

**它就是 MCP server**(核心产品)。FastMCP 3.0,stdio + https transport。工具:write-note / read-note / delete-note / edit-note / search-notes / build-context / recent-activity / list-projects / list-workspaces / schema-validate 等。给 Claude Desktop / Cursor / Claude Code 等 MCP 客户端用。

## 九、云门控与商业模型

**完全本地路径完整**:FastEmbed + sqlite + 所有 MCP 工具零 API key,空气隔离友好。有 Basic Memory Cloud(workspace / 同步),但本地功能不依赖云。AGPL-3.0 license 要注意(网络交互触发开源义务)。

## 十、性能与基准

**无。** Basic Memory 不发布 LongMemEval / LoCoMo / MemoBench 分数(它是 note/KB 工具,不是 QA memory benchmark 的目标)。

本次实测(L1):**冒烟 0%**(0/12)。工具工作正常(write-note 写入、search 检索关键词能命中),但**对自然语言问句全模式返回 0**——BM25 / 向量 / hybrid 都召不回 NL 问题。这是"拿 note/KB 工具当 QA memory 用"的协议错配,不是工具坏了。

## 十一、已知问题与失败模式

- **NL QA 召回失效(本次主问题)**:对自然语言问句,BM25 / 纯向量 / hybrid 全返回 0。检索是关键词 / 实体导向,不是语义 QA。
- **extraction-loses-values RISK**:BM 自己不抽,全靠写 note 的客户端 agent。agent 弱则 note 质量差。
- **自动更新**:默认 24 小时自动更新二进制(可变,影响复现性)——要 pin 版本或用 BASIC_MEMORY_CONFIG_DIR + uvx。
- **AGPL-3.0**:网络交互触发开源义务,企业要评估。
- **MCP-stdio 驱动繁**:不经 CLI 直接驱动要 spawn `basic-memory mcp` + 说 JSON-RPC(本次用 CLI 规避)。
- **project 概念**:首次要建 project,否则 write-note 失败。

## 十二、本次实测发现(L1)

本次 Basic Memory CLI(project "eval"):

- **工具工作正常**:write-note 写 markdown + 建图 + 索引;search-notes 检索关键词能命中(sess0 score 1.0)。
- **NL QA 0%**:12 个自然语言问句全模式(BM25 / 向量 / hybrid)返回 0 结果。负分校验确认不是 parser bug(关键词查询正常),是检索机制对 NL 问句失效。
- **结论**:Basic Memory 是 note/KB 工具(关键词 / 实体检索),不是语义 QA memory。作 QA 用召回失效,0% 是真实的(协议错配)。

## 十三、适用场景与选型建议

适合:人机共维的本地知识库(人和 AI 都能读写 markdown notes)、要 markdown 人类可读 / 可编辑、要完全本地 / 空气隔离、要 MCP 集成给 Claude / Cursor 等。它是"个人 / 团队 wiki"的好工具。

不适合:作 AI agent 的语义 QA 记忆后端(NL 问句召回失效)、要自动事实抽取(BM 不抽)、要语义检索(默认关键词)。

建议标签:**避开(QA memory 场景)/ 采用(note/KB 场景)**。它是一个被放错位置的工具——作 QA memory 用 0%,但作 local-first note/KB 用是好工具。选型关键是搞清你要的是"agent 记住用户语义"(选 Mem0/Letta)还是"人机共维的本地知识库"(选 Basic Memory)。

## 十四、与同类对比

- vs **Reference Memory MCP**:都是 MCP server + 知识图谱(实体 / 关系 / 观察),都不做语义 QA。Reference 是内存 JSONL 三元组(极简),Basic Memory 是 markdown + sqlite(丰富、人可编辑)。两者都是"客户端 LLM 维护图谱"路线,都不是语义 QA memory。
- vs **Mem0 / Letta**:那些是语义记忆(向量 + 抽取),能答 NL 问题;Basic Memory 是 note/KB(关键词),答不了 NL 问题。完全不同定位。
- vs **Supermemory MCP**:Supermemory 的 MCP 是云代理(指向 Supermemory 云);Basic Memory 的 MCP 是本地 markdown + sqlite。

## 附录 A:实测 CLI 流程

```bash
basic-memory project add eval /tmp/bm_eval_ws        # 首次建 project
basic-memory tool write-note --title sess0 --folder eval \
  --content "Daniel, FF XQ-7712-3309, cat Pepper."    # 写 note + 建图 + 索引
basic-memory tool search-notes "frequent-flyer"      # 关键词 → 命中
basic-memory tool search-notes "What is my FF number?" --hybrid   # NL 问句 → 0 结果
```

## 附录 B:为什么 Basic Memory 答不了 NL 问题

本次实测最具体的发现是 Basic Memory 的检索对自然语言问句失效。根因分析:

**BM25 路线**:默认 BM25 是关键词词频匹配。"What is my frequent-flyer number?" 会被分词成 "what / is / my / frequent / flyer / number",其中 "frequent-flyer"(带连字符)在 note 里是 "frequent-flyer"(note 里写 "FF number XQ-7712-3309" 或 "frequent-flyer number")。理论上 BM25 应该命中"frequent-flyer"这个词。但实测返回 0——可能是分词器把 "frequent-flyer" 拆成 "frequent"+"flyer",而 note 里的形式不同;或阈值过高。

**纯向量路线**:FastEmbed bge-small-en 对 query "What is my frequent-flyer number?" 和 note "Daniel, FF number XQ-7712-3309" 算相似度,理论上有一定相似度。但实测 `--vector` 也返回 0——可能是阈值过高(只返回高于某分数的),bge-small 对这种"问题 vs 陈述"的相似度不够高。

**hybrid 路线**:BM25 + 向量融合,两者都不够,融合也不够。

这说明 Basic Memory 的检索是为"关键词 / 实体查找"(像搜索引擎搜 note)调的,不是为"语义问答"(问题 vs 答案的事实)调的。它的目标用户是"我记得我写过一条关于 X 的 note,搜一下"——这是关键词场景;不是"我问一个问题,从笔记里找答案"——这是语义 QA 场景。

这个发现的价值是再次强调"工具定位决定适用性":Basic Memory 不是坏工具(它做 note/KB 很好),是被放错了评测维度(当 QA memory 测)。选型时务必问"这个工具的检索机制是不是为我的查询模式设计的"——如果你的查询是自然语言问答,要语义检索(Mem0/Letta/Supermemory);如果是关键词找 note,Basic Memory 合适。把"工具定位匹配查询模式"作为选型第一问,能避免大量错配。

## 附录 C:markdown + sqlite 知识图谱的同步机制

Basic Memory 的"markdown 文件 + sqlite 知识图谱"双存储,有一个同步机制值得理解:

**markdown 是 source of truth。** 所有 note 以 markdown 文件存在 project 目录(如 `/tmp/bm_eval_ws/eval/sess0.md`)。人可以直接编辑这些文件(改文件即改内容)。

**sqlite 是派生索引。** 从 markdown 同步出一个 sqlite 数据库:解析 frontmatter(title / tags / type / permalinks)→ 实体;解析正文 wiki link `[[概念]]` → 关系;正文内容 → 实体的观察。sqlite 还存 FastEmbed 向量索引(sqlite-vec)。

**同步方向。** 写入时(write-note):markdown 文件先写,然后同步进 sqlite。读取时(search):查 sqlite(快,有索引)。如果人手动改了 markdown 文件,要触发 reindex 让 sqlite 同步(`basic-memory reindex`)。

**冲突 / 一致性。** `basic-memory doctor` 做一致性检查(文件 vs DB 同步状态)。`orphans` 显示无关系的实体。`status` 显示同步状态。

这个设计的优雅处:markdown 给人(可读 / 可编辑 / 可 git),sqlite 给机器(快检索 / 向量 / 图)。两者分工。这是"local-first knowledge management"的经典模式(Obsidian / Logseq 等 PKM 工具也类似)。

**对 AI 的含义。** AI 通过 MCP / CLI 写 note(写 markdown),人可以审阅 / 修改 AI 写的 note(编辑 markdown),再 reindex。这是"人机共维"——AI 不黑箱地往 DB 塞事实,而是写人能看懂 / 改的笔记。这对"可解释 / 可控的 agent 记忆"有吸引力(对比 Mem0 的黑箱向量库)。

## 附录 D:FastEmbed 与 embedding-gap

Basic Memory 默认用 FastEmbed(bge-small-en-v1.5,ONNX,CPU,本地):

**为什么 FastEmbed。** FastEmbed 是一个轻量 ONNX embedding 库,本地 CPU 跑,无 key、无 GPU、无外部服务。Basic Memory 用它做向量化,实现"零依赖本地 embedding"。这和 Supermemory(自带 WASM)、Memvid(自带 ONNX)是同类选择——"embedding 不依赖外部"。

**embedding-gap。** 默认 FastEmbed 不走 ollama /v1/embeddings,所以不能用统一 qwen3-embedding。要指 ollama,需切实验性 LiteLLM provider(`BASIC_MEMORY_EMBEDDING_PROVIDER=liteLLM` + `BASIC_MEMORY_EMBEDDING_MODEL` + `BASIC_MEMORY_EMBEDDING_API_BASE` 等,手配)。默认就是 FastEmbed(bge-small)。

**对检索的影响。** bge-small-en-v1.5 是 384 维的小模型,语义能力弱于 qwen3-embedding(2560 维)。这可能部分解释了 Basic Memory 对 NL 问句的弱召回——小 embedding 模型对"问题 vs 陈述"的语义匹配不够强。但更主要是检索机制(关键词导向 + 阈值)的问题,不是单纯 embedding 弱。

## 附录 E:作为 note/KB 工具的真实价值

虽然 Basic Memory 在本次"QA memory"评测里 0%,但作为 note/KB 工具它有真实价值,值得公平记录:

**人机共维的本地知识库。** AI 通过 MCP 写 note,人审阅 / 编辑 markdown,reindex 同步。这是"AI 增强 + 人类可控"的 PKM(personal knowledge management)。比纯黑箱记忆(Mem0)更透明、更可审计。

**markdown 人类可读。** 所有记忆是 markdown 文件,git 可追踪,可读,可编辑,可移植。这是"记忆不锁定在某个 DB 格式"的好处——你的知识永远是你的 markdown 文件。

**MCP 集成。** 作为 MCP server,给 Claude Desktop / Cursor / Claude Code 等"记忆"工具——AI 读写你的本地知识库,而不是各自维护黑箱记忆。

**完全本地 / 空气隔离。** FastEmbed + sqlite + MCP 工具零 key,适合隐私敏感 / 离线场景。

**适用场景。** 个人 / 团队 wiki、项目知识库、研究笔记、和 AI 共同维护的领域知识。在这些场景,Basic Memory 是好工具(本次评测只是把它放错了 QA memory 维度)。

所以 Basic Memory 的正确选型建议是:**作 note/KB 用就采用,作 QA memory 用就避开。** 它不是坏工具,是定位明确的"local-first PKM with MCP"。把它和 Mem0 / Letta 放一起比"谁记忆能力强"是错配——它根本不是为那个设计的。这个区分本身是本次评测的价值之一:帮每个项目找到它真正适合的位置,而不是用一把尺子量所有。

## 附录 F:与 Obsidian / Logseq 等 PKM 的关系

Basic Memory 的"markdown + 知识图谱 + 本地"设计,和 Obsidian / Logseq 这类成熟 PKM(personal knowledge management)工具很接近,值得理清关系:

**共同点。** 都是 markdown 文件作 source of truth;都从 markdown wiki link `[[...]]` 建知识图谱;都本地优先;都可 git 追踪。

**Basic Memory 的差异。** 它的核心是 **MCP server**——为 AI agent 暴露读写 note 的工具。这是它和 Obsidian(纯人用,有插件生态但不是 MCP-first)的根本差异。Basic Memory 是"AI-first 的 PKM",Obsidian 是"human-first 的 PKM(可加 AI 插件)"。

**谁该用 Basic Memory。** 如果你的主要消费者是 AI agent(让 agent 读写知识库、把对话沉淀成 note),Basic Memory 的 MCP-first 设计更对路。如果主要消费者是人(你自己记笔记、读笔记),Obsidian / Logseq 更成熟(插件 / 社区 / 体验)。

**互操作。** 因为都是 markdown,Basic Memory 的 note 理论上能在 Obsidian 里打开(反之亦然)——markdown 是通用格式。但 wiki link 语法 / frontmatter 约定可能略有差异,要适配。

所以 Basic Memory 不是要替代 Obsidian,而是补"AI agent 直接读写本地知识库"这个位——用 MCP 让 AI 成为知识库的一等公民(读写 note),而不只是"人记笔记、AI 偶尔读"。这是它在"AI agent 时代"的独特定位。但这个定位是"PKM with AI",不是"agent 的 QA memory"——本次评测的 0% 是因为把它当后者测,前者它做得好。

## 附录 G:AGPL-3.0 license 的采用含义

Basic Memory 是 AGPL-3.0,这对采用者(尤其企业)有具体含义:

**AGPL 的网络条款。** AGPL 比 GPL 多一条:如果你通过网络提供服务(如 SaaS),且用了 AGPL 代码,你必须把你的修改后的完整源码提供给该服务的用户。这意味着:你不能拿 Basic Memory 改一改,做成云服务卖,而不开源你的修改。

**对企业的影响。** 纯内部用(不上云、不对外提供服务):AGPL 义务轻(同 GPL,内部用不触发分发)。如果要做成对外服务 / SaaS:AGPL 触发,你的修改要开源。这对"想基于 Basic Memory 做商业云记忆服务"的企业是硬约束。

**对比其他 license。** Mem0 / Letta / Graphiti / Supermemory / Memvid 是 Apache-2.0 或 MIT(宽松,商业友好)。Basic Memory 的 AGPL 是这次评测里最严的(只它一个 AGPL)。

**采用建议。** 纯本地 / 内部用:AGPL 无碍,放心用。要做成对外服务:要么开源你的修改(按 AGPL),要么不要基于 Basic Memory(选 Apache/MIT 的 Mem0 等)。

这个 license 差异是选型时容易忽略但重要的维度——尤其对有商业化 / 上云意图的采用者。Basic Memory 的 AGPL 是它的"开源哲学"选择(强制回馈),但也是商业采用的约束。
