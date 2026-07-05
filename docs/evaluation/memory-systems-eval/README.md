# AI 记忆系统开源项目评测专题 · 总索引

> 2026-07-03 实测。13 个主流 AI 记忆系统开源项目 + 1 篇评测专题报告。全部结论由实测(L1)或可核实来源支撑,推断处已标注。统一本地后端(ollama)+ 公平对比协议 + 负分校验门。

> **本专题视角：实测评测与选型。** 同一批项目另有[架构解读版](../../agent/ai-app-tutorials/rag/memory-systems/README.md)，从四层记忆架构、写入/读取分离、治理 schema 等设计维度展开。两份互补——本页给你"能不能用、分数多少、坑在哪"，架构版给你"怎么设计、怎么选型、怎么评估"。

## 目录

### 评测专题(综合报告,2 万+ 字)

- [AI 记忆系统开源项目深度评测报告](overview-report.md) —— 13 项目横评:方法论、统一后端实测、LongMemEval 排名反转、负分校验六次翻案、选型矩阵。

### 项目详解(每篇 1 万+ 字,技术架构 / 实现原理 / 数据流 / 技术栈)

#### 可插拔记忆层 / 事实抽取
- [01-Mem0:可插拔事实抽取记忆层](projects/01-mem0-pluggable-memory-layer.md) —— 冒烟 83% / LME 33%。
- [05-Supermemory:单二进制混合图谱记忆](projects/05-supermemory-single-binary-hybrid-graph-memory.md) —— 冒烟 67% / **LME 50%(全场最高,唯一答对 knowledge-update)**。

#### Agent 运行时 / 自管记忆
- [02-Letta(MemGPT):agent 自管 OS 式记忆](projects/02-letta-memgpt-agent-managed-memory.md) —— **冒烟 100%(全场最高)**,glm-4.7 agent。
- [09-Hindsight:生物启发三通路记忆](projects/09-hindsight-bio-inspired-three-pathway-memory.md) —— py3.13 装不上(BLOCKED)。

#### 知识图谱 / 时序图
- [03-Zep + Graphiti:bi-temporal 知识图谱](projects/03-zep-graphiti-bi-temporal-knowledge-graph.md) —— 冒烟 50% / LME 0%(时序优势被证伪)。
- [04-Cognee:GraphRAG 知识图谱](projects/04-cognee-graphrag-knowledge-graph-memory.md) —— schema bug,双后端 BLOCKED。

#### 新颖存储路线
- [06-Memvid:无抽取逐字块 / 视频存储](projects/06-memvid-no-extraction-verbatim-block-storage.md) —— 冒烟 83% / LME 25%(便携 RAG,非 agent 记忆)。

#### 框架内置记忆模块
- [07-LangMem:LangChain 记忆模块](projects/07-langmem-langchain-memory-module.md) —— 冒烟 41.7%。
- [08-LlamaIndex Memory:框架内置记忆](projects/08-llamaindex-memory-framework-builtin-memory.md) —— API 摩擦,未得有效分。

#### MCP 记忆服务器
- [10-Basic Memory:本地优先知识图谱 MCP](projects/10-basic-memory-local-first-knowledge-graph-mcp.md) —— 作 QA memory 用 0%(note/KB 工具,定位错配)。
- [11-OpenMemory MCP:Mem0 的本地 MCP(sunset)](projects/11-openmemory-mcp-mem0-local-mcp.md) —— 引擎即 Mem0,项目停维。
- [12-Universal Memory MCP:云代理,非本地引擎(deprecated)](projects/12-universal-memory-mcp-cloud-proxy-non-local-engine.md) —— Supermemory 云的瘦代理。
- [13-Reference Memory MCP:官方知识图谱参考实现](projects/13-reference-memory-mcp-official-knowledge-graph-reference.md) —— MCP 官方模板,作起点用。

## 核心结论速览

| 场景 | 推荐 | 理由 |
| --- | --- | --- |
| 插即用、生态最大 | **Mem0** | 冒烟 83%,但自报 94% 含水分 |
| 配强模型时最强 | **Letta** | 冒烟 100%,glm-4.7 agent |
| 零依赖、扛规模、不丢值 | **Memvid** | 完整 138K haystack 召回成功 |
| 事实更新 / 矛盾消解 | **Supermemory** | LME 50%,唯一答对 knowledge-update |
| 时序图谱 | **Graphiti** | 原生 bi-temporal,但需强抽取模型 |
| 框架内置(LangChain) | **LangMem** | 冒烟 41.7%,生态原生 |
| 避开 | **Cognee / OpenMemory / Universal-MCP** | schema bug / sunset / 云代理 |

**三个头条发现:**
1. **LongMemEval 排名反转冒烟** —— 冒烟 Letta>Mem0≈Memvid>Supermemory,LME Supermemory(50%)>Mem0≈Memvid>Graphiti(0%)。小规模会骗你。
2. **厂商自报分全不可横比** —— Mem0 自报 94% / 独立复现 49%;只有统一后端重跑才可比。
3. **Cogee 换强模型证明是工具 schema bug** —— 负分校验门拦下"冤杀"。

## 评测产出位置

完整可复现产物（harness、原始数据、证据台账）规划在 `runs/2026-07-03-memory-systems-eval/` 下，**当前未入库**（产物体积较大）。如需复现：在 GitHub issue 申请，或按 [overview-report.md](overview-report.md) 描述的方法论自行重跑。

计划落盘的产物清单：
- `decision-report.md` / `findings.md` / `methodology.md` —— 决策报告、发现、方法论。
- `evidence-ledger.jsonl` —— 30 条证据台账(逐条可核)。
- `phaseB-research-results.json` —— 13 工具结构化调研数据。
- `media-pack/benchmark-results/smoke-answers/` —— 每工具的召回 / 答案 / 判分 / 得分,逐题可核。
- `harness/` —— 统一 harness(driver / finish / judge + 5 适配器),可复现。

## 字数统计

- 评测专题:21,788 字(≥ 2 万 ✓)
- 13 篇项目详解:每篇 10,017–12,239 字(各 ≥ 1 万 ✓)
- **总计:163,417 字(16.3 万字)**

## 方法论要点

本评测严格遵循 `/ai-evaluator` 方法论:对象画像推导(失败模式驱动维度提权)、公平对比协议(同输入 / 同指标 / 同 judge / 同后端)、实证四纪律(先画像后端 / 负分校验门 / 实证深度轴 / 吞吐不外推)、证据分级(L1–L5)。所有 L1 实测在统一后端(抽取 / 答题 qwen2.5:14b + embedding qwen3-embedding:4b + judge qwen2.5:14b,并用 gpt-5.4 经中转站做异族复核)下完成,全本地、零付费 key。
