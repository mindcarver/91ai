# Cognee:GraphRAG 式知识图谱记忆深度技术解析

> 项目地址:https://github.com/topoteretes/cognee 。License:Apache-2.0。约 26639 star(2026-07-03 实测)。PyPI `cognee`,实测版本 1.2.2。本文技术细节来自源码核查、官方文档与本次 ollama + gpt-5.4 下的 L1 实测(含两次负分校验翻案)。

## 一、项目定位与一句话概括

Cognee 是一个 pipeline 式的 GraphRAG 记忆引擎。它的定位是:把数据(支持 30+ 种格式:文本 / PDF / 图片 OCR / 代码 AST / 视频转写等)摄入成 dataset,然后用 `cognify()` 把数据加工成知识图谱(实体 + 关系)+ 向量,支持 GraphRAG 式检索(图遍历 + 向量)。它强调"把记忆当成知识工程":不是简单地存事实,而是构建可推理的知识结构。

一句话:Cognee = 一个 pipeline 式 GraphRAG 引擎,用 LLM 把数据加工成知识图谱 + 向量,支持图增强的检索增强生成。

## 二、仓库与社区元数据

- 主仓 `topoteretes/cognee`,Apache-2.0,约 26639 star。
- 语言:Python(3.10–3.14);还有 TypeScript 客户端 `@cognee/cognee-ts`。
- PyPI `cognee` 1.2.2。
- 官方有 MCP server(`cognee-mcp` 子目录),有 cognee.ai 云。

## 三、整体技术架构

Cognee 的架构是"三层可插拔 + pipeline 加工":

**数据摄入层(add)。** `cognee.add(data, dataset_name)` 把数据(文本 / 二进制 / DataItem)加入 dataset。支持 30+ 种 loader(文本、PDF、图片 OCR、代码 AST、视频转写等)。

**加工层(cognify)。** 这是核心。`cognee.cognify([dataset])` 触发 pipeline:数据 → 分块(TextChunker)→ LLM 抽实体 + 关系(SummarizedContent / KnowledgeGraph pydantic 模型约束)→ 写图库(实体节点 + 关系边)→ embed → 写向量库。pipeline 是异步的、可配置的(chunk_size、chunks_per_batch、graph_model、chunker 等)。

**存储层(三层可插拔)。** 图库默认 Kuzu(本地文件,零外部依赖;也支持 Neo4j / Memgraph / FalkorDB);向量库默认 LanceDB(本地文件;也支持 Qdrant / Weaviate / Milvus 等);关系库默认 SQLite(本地;也支持 Postgres)。三层都本地默认,意味着零外部依赖就能跑(这是它相对 Graphiti 的运维优势)。

**检索层(search)。** `cognee.search(query, query_type=SearchType.GRAPH_COMPLETION)` 默认做 GraphRAG:图检索(找相关实体 / 边)+ 向量检索 → 拼 context → LLM 合成答案。支持 `only_context=True` 只返回召回的图 + 向量上下文(不合成,本次实测用这个,接固定 reader)。

**LLM / embedding 路由层。** 用 litellm + instructor 做 LLM 路由和结构化输出抽取;embedder 支持 ollama / openai_compatible / fastembed / sentence-transformers 等。

## 四、核心记忆模型与实现原理

Cognee 的记忆模型是"知识图谱 + 向量的 GraphRAG"。关键原理:

**cognify 是知识工程,不是简单抽取。** cognify 不只是抽事实,而是构建一个结构化的知识图:实体节点(人 / 地 / 物 / 概念)+ 关系边(实体间关系,带类型)。比如对话"Daniel 有猫 Pepper,Daniel 在 Northwind 工作",cognify 产出节点[Daniel, Pepper, Northwind]+ 边[Daniel-owns-Pepper, Daniel-works_at-Northwind]。这和 Graphiti 类似(都是图),但 cognee 更强调 GraphRAG(图增强检索),Graphiti 更强调 bi-temporal 时序。

**结构化输出是核心,也是阿喀琉斯之踵。** cognify 用 instructor + litellm 让 LLM 产出严格匹配 pydantic schema 的结构化输出(SummarizedContent / KnowledgeGraph)。schema 严格意味着:LLM 必须按字段产出(如 SummarizedContent 必须有 summary 字段)。这一步对小 / 中等模型是重灾区——产出不匹配 schema → instructor 重试(指数退避)→ 反复失败 → InstructorRetryException。

**分块 + 批处理。** TextChunker 把数据分块,按 chunks_per_batch 批处理。chunk_size / overlap 影响抽取质量。

## 五、端到端数据流

以本次实测(ollama qwen2.5:14b,最终切 gpt-5.4)为例:

1. **配置**(env):`LLM_PROVIDER`/`LLM_MODEL`/`LLM_ENDPOINT`/`LLM_API_KEY`、`EMBEDDING_PROVIDER`/`EMBEDDING_MODEL`/`EMBEDDING_DIMENSIONS`、`VECTOR_DB_PROVIDER`(默认 lancedb)、`GRAPH_DB_PROVIDER`(默认 kuzu)、`COGNEE_SKIP_CONNECTION_TEST=true`(跳过启动时 LLM 连接测试)、`HUGGINGFACE_TOKENIZER`(ollama embedding 需要的 HF tokenizer 名)。
2. **add**:`await cognee.add("Daniel has cat Pepper, 7yo. FF XQ-7712-3309.", dataset_name="d")`。
3. **cognify**:`await cognee.cognify(["d"])`。内部:分块 → LLM 抽实体 + 关系 → 写 Kuzu 图 → embed → 写 LanceDB 向量。首次会跑 migration(可能要调两次 cognify——首次记录 migration 错,二次完成)。
4. **search**:`await cognee.search(query_text="cat name?", only_context=True, top_k=8)` → 返回图 + 向量召回的上下文。

## 六、技术栈与依赖

- 核心:litellm(LLM/embedding 路由)、instructor(结构化输出抽取)、openai SDK、pydantic。
- 图库:Kuzu 默认(本地文件);Neo4j / Memgraph / FalkorDB 可选。
- 向量库:LanceDB 默认(本地文件);Qdrant / Weaviate / Milvus 等。
- 关系库:SQLite 默认;Postgres 可选。
- ollama 支持:需要 `pip install cognee[ollama]`(拉 transformers,因为 ollama embedding 要 HF tokenizer)。

## 七、本地部署与 LLM 后端(ollama)

官方明确支持本地 ollama(LLM + embedding)。但本次实测在 ollama 下叠加了六层配置摩擦(详见已知问题),最终在 gpt-5.4 下又撞上 schema 校验 bug。这是一个"文档说支持,实测很难跑通"的典型。

配置坑汇总:`COGNEE_SKIP_CONNECTION_TEST=true`(ollama 慢,30 秒连接测试会超时);`pip install cognee[ollama]`(transformers 不在默认 extra);`HUGGINGFACE_TOKENIZER=Qwen/Qwen3-0.6B`(ollama embedder 需要匹配的 HF tokenizer 名,不设会 `OSError: None is not a valid HF model`);首次 cognify 要调两次(migration 重试语义);`LLM_API_KEY` 必须非空占位(否则 LLMAPIKeyNotSetError);两个 provider(LLM + embedding)必须都显式设,只设一个会静默回退 OpenAI(Issue #3383)。

## 八、MCP 集成

Cognee 暴露官方 MCP server(`cognee-mcp` 子目录),工具包括 cognify(文本 → 知识图)、search(图检索)等。让 MCP 客户端能往 cognee 灌数据 / 查图。

## 九、云门控与商业模型

- OSS:存储 + 基础召回 + 图构建完全本地(ollama + fastembed/ollama embedding,无需付费 key)。
- 云(cognee.ai):托管、企业特性、可能含优化过的抽取模型。本地数据不强制上云。

## 十、性能与基准

官方自报(L3):LoCoMo 约 80.3% 准确率(1986 QA pairs,自报在 agentmemorybenchmark.ai)。官方研究页报告 HotPotQA / BEAM 用 Human-LLM Correctness / DeepEval Correctness / F1 / Exact Match,方法论和标准 LongMemEval 不同,不可直接横比。

本次实测(L1):**BLOCKED**——ollama 下六层摩擦 + 结构化输出崩;gpt-5.4 下抽取完美但 cognify 仍崩于 `SummarizedContent.summary Field required`。两次都拿不到有效分。

## 十一、已知问题与失败模式

**这是本次评测里问题最严重的工具。**

- **六层配置摩擦(ollama)**:连接测试超时、migration 重试、缺 transformers、缺 HF tokenizer、API key 占位、provider 静默回退。每一层都要单独排查。
- **SummarizedContent schema bug(与模型无关)**:这是最关键的发现。cognify 的 summarization 步骤要求 LLM 产出带 `summary` 字段的 `SummarizedContent`,但 prompt 不可靠地产出该字段——即使 gpt-5.4(抽取完美,FF 号 / 猫 / 年龄 / 饮食 / 过敏 / 偏好全对),也只产出 `{"about":[...], "facts":[...]}` 不给 `summary`,触发 pydantic 校验错 9 次 / 3 轮 InstructorRetryException。这证明 cogee 的失败**与 LLM 无关**,是它自己流水线的 schema 校验 bug——本地 qwen 和云端 gpt-5.4 都跑不起来。
- **migration 系统**:状态会因反复 prune/add 不同 dataset 混乱(MigrationError: database migration failed)。
- **遥测**:PostHog(同 Mem0,本机网络不通会超时)。
- **删除 API 变更**:`cognee.delete_data` 在 1.2.2 不存在(API 变更未跟进文档)。

## 十二、本次实测发现(L1 尝试)

本次对 cogee 做了最深入的负分校验(两次翻案):

- **第一次(ollama)**:六层摩擦,最终 InstructorRetryException(qwen2.5:14b 结构化输出崩)。表面是"本地模型太弱"。
- **第二次(gpt-5.4)**:换强模型,抽取完美,但 cognify 仍崩于 SummarizedContent schema。翻案:不是模型问题,是 cogee 自己的 schema bug。
- **结论升级**:cogee 从"本地模型太弱"升级为"流水线 schema 校验脆弱,与 LLM 无关"。本地 + 云端都跑不起来 → 避开,直到这个 schema bug 被修。

这是负分校验门最有价值的一次应用——如果没有"换强模型"这一步,我们会错误地结论"cogee 在本地太弱,换强模型可能行";实测证明换强模型也不行,问题在工具本身。

## 十三、适用场景与选型建议

理论适合:需要 GraphRAG(知识图谱 + 向量增强检索)、要本地零外部依赖(Kuzu + LanceDB + SQLite 全本地)、要支持多种数据格式(PDF / 图片 / 代码 / 视频)。cogee 的定位(把记忆当知识工程)在"企业知识库"场景有吸引力。

但本次实测结论是:**避开,直到 schema bug 被修**。一个在本地 qwen 和云端 gpt-5.4 下都跑不起 cognify 的工具,不能用于生产。如果你需要 GraphRAG,考虑 Graphiti(更成熟,但要图库)或 Supermemory(闭源但跑得通)。

建议标签:**暂时避开**(schema bug,双后端均 BLOCKED)。关注其后续版本是否修复 SummarizedContent 校验。

## 十四、与同类对比

- vs **Graphiti**:都是知识图谱。Graphiti 重 bi-temporal 时序(需要 Neo4j/FalkorDB);cognee 重 GraphRAG + 本地零依赖(Kuzu/LanceDB/SQLite)。Graphiti 能跑通(50%),cogee 跑不通(schema bug)。
- vs **Mem0**:Mem0 是扁平事实抽取(轻、跑得通、83%);cogee 是图抽取(重、跑不通)。如果你的场景不需要图结构,Mem0 远更可靠。
- vs **Supermemory**:Supermemory 也是混合图谱(跑得通,67%/LME 50%);cogee 是开源图谱但跑不通。

## 附录 A:实测配置与负分校验脚本

```python
import os
os.environ.update(dict(
    LLM_PROVIDER="openai", LLM_MODEL="gpt-5.4",
    LLM_ENDPOINT="https://api.aicodewith.com/v1", LLM_API_KEY=os.environ["ACW_API_KEY"],
    EMBEDDING_PROVIDER="ollama", EMBEDDING_MODEL="qwen3-embedding:4b",
    EMBEDDING_DIMENSIONS="2560", EMBEDDING_ENDPOINT="http://localhost:11434",
    VECTOR_DB_PROVIDER="lancedb", GRAPH_DB_PROVIDER="kuzu",
    COGNEE_SKIP_CONNECTION_TEST="true", HUGGINGFACE_TOKENIZER="Qwen/Qwen3-0.6B",
))
import cognee, asyncio
async def t():
    await cognee.add("Daniel has cat Pepper, 7yo. FF XQ-7712-3309.", dataset_name="cfg")
    for attempt in range(4):                      # cognify 首次可能 migration 报错,要重试
        try:
            await cognee.cognify(["cfg"]); print("OK"); break
        except Exception as e: print(type(e).__name__, str(e)[:120])
    r = await cognee.search(query_text="cat name?", only_context=True, top_k=5)
asyncio.run(t())
```

这段配置是六层摩擦排查后的"最小可用"配置。但仍会在 cognify 撞上 SummarizedContent schema bug。负分校验的关键是:不要停在"qwen 太弱",换 gpt-5.4 再试——如果强模型也崩,问题在工具。

## 附录 B:Cogee 的设计意图与现状的落差

Cogee 的设计意图是好的:把记忆当成知识工程,用 pipeline 把多格式数据加工成可推理的知识图谱,三层存储全本地零依赖,还自带 MCP server。它在"愿景"层面是这次评测里最有想象力的之一。

但"愿景好"和"能用"是两回事。本次实测暴露的是一个工程成熟度问题:六层配置摩擦(文档没说清)、API 变更未跟进文档(delete_data)、migration 状态脆弱、以及最致命的 SummarizedContent schema 校验 bug。后者尤其关键——它不是配置问题(配置都能解),是 pipeline 里某一步的 prompt 不可靠地产出 schema 要求的字段,而 instructor 的重试机制只会反复撞同一堵墙。

这个落差说明:对一个"用 LLM 做严格结构化抽取"的工具,抽取 prompt + schema 设计的健壮性,比 LLM 本身的能力更重要。cogee 在这个点上没扛住。如果后续版本修复了 schema 校验(让 prompt 可靠产出 summary 字段,或放宽 schema),cogee 的"本地零依赖 GraphRAG"定位仍有价值。但截至 1.2.2,它是这次评测里唯一一个"双后端都 BLOCKED"的工具。

## 附录 C:六层配置摩擦的逐层排查记录

本次实测对 cogee 做了最深入的负分校验,六层摩擦的每一层都是"看到错误 → 排查 → 修复 → 进下一层"。完整记录对任何想本地跑 cogee 的人都有参考价值:

**第一层:LLM 连接测试超时。** cogee 启动 cognify 前会调 `test_llm_connection()` 做一次 30 秒的 LLM 连通测试。ollama 在模型冷启动时 30 秒可能不够 → `TimeoutError: LLM connection test timed out after 30s`。修复:`COGNEE_SKIP_CONNECTION_TEST=true`(官方提示里有这个 bypass)。

**第二层:migration 报错。** 第一次 cognify 会跑 DB migration。首次会记录一个 migration 错(`Migrations FAILED for 1 database`),然后 `MigrationError: Write aborted`。cogee 的语义是"下次调用自动重试"——所以 cognify 要调两次(第一次触发 + 记录,第二次完成)。这很反直觉,文档没明说。

**第三层:缺 transformers。** 进到 cognify 后,ollama embedder 需要 HF tokenizer 做精确分块,但 `transformers` 不在 cogee 默认依赖里(要 `pip install cognee[ollama]`)。`ModuleNotFoundError: No module named 'transformers'`。修复:装 transformers。

**第四层:缺 HUGGINGFACE_TOKENIZER。** 装了 transformers 后,`OSError: None is not a local folder and is not a valid model identifier listed on huggingface.co`。cogee 的 ollama embedder 需要 `HUGGINGFACE_TOKENIZER` 环境变量指定一个 HF tokenizer 名(默认 None → OSError)。修复:`HUGGINGFACE_TOKENIZER=Qwen/Qwen3-0.6B`(任意有效 tokenizer 即可,只用于分块计数)。

**第五层:API key 占位。** `LLMAPIKeyNotSetError`——cogee 要求 LLM_API_KEY 非空(即使是本地 ollama)。修复:`LLM_API_KEY=ollama`(占位)。

**第六层(致命):结构化输出崩。** 全部前五层修复后,cognify 终于跑到 LLM 抽取,但 `InstructorRetryException`——qwen2.5:14b 经 litellm+instructor 的结构化输出反复失败(8/16/32 秒退避)。换 gpt-5.4 后变成 `SummarizedContent.summary Field required`(见附录 B)。这是 cogee 的 schema 设计问题,不是配置能解的。

这六层里前五层是"配置摩擦"(可解,但文档没说清),第六层是"工具 bug"(不可解,等官方修)。本次评测的价值在于区分了这两类——否则会把第六层误判成"本地模型太弱"。

## 附录 D:cognify pipeline 的步骤拆解

理解 cognify 为什么在 schema 上崩,需要看它的 pipeline 步骤:

1. **chunking**:TextChunker 把数据分块(用 HUGGINGFACE_TOKENIZER 做精确 token 计数)。
2. **entity + relation extraction**:每块送 LLM,产出实体节点 + 关系边(litellm+instructor 约束成 KnowledgeGraph pydantic 模型)。这一步在 qwen2.5:14b 上不稳(产出不匹配 schema 的 JSON → InstructorRetryException)。
3. **summarization**:把抽取的实体 / 关系汇总成 `SummarizedContent`(pydantic 模型,要求 `summary` 字段 + `about` 分类 + `facts` 列表)。**这一步在 gpt-5.4 上崩**——LLM 产出 `{"about":[...],"facts":[...]}` 但不给 `summary` 字段 → pydantic 校验错。
4. **graph write**:把实体 / 关系写图库(Kuzu 默认)。
5. **embed + vector write**:把实体 / 块 embed 写向量库(LanceDB 默认)。

第三步(summarization)的 schema 要求 `summary` 字段,但它的 prompt 没有强约束 LLM 必须产出该字段。instructor 的重试机制只会让 LLM 重试(但 LLM 每次都产出同样缺 summary 的结构)→ 死循环。修复需要改 cogee 的 prompt(强制要求 summary)或放宽 schema(让 summary 可选)——这是官方要做的,用户侧绕不过。

这个 pipeline 拆解说明:即使是一个设计良好的 GraphRAG pipeline,某一个步骤的 prompt + schema 不健壮,整个 pipeline 就卡死。这是"用 LLM 做严格结构化抽取"类工具(Graphiti / Cognee / 任何 instructor 驱动的)的共同风险点——选型时要关注它们的 schema 健壮性,不只看架构图漂不漂亮。
