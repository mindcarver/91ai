# AI 记忆系统开源项目评测专题 · 总索引

> **可复现性状态：R1（narrative-only / artifacts-not-published）。** 本专题保留作者运行和资料调研记录；harness、输入子集和原始结果不在当前仓库，第三方目前不能仅凭本仓库复跑分数。详见[评测可复现性状态](../reproducibility-status.md)。

> 2026-07-03 记录。专题覆盖 13 个主流 AI 记忆系统项目 + 1 篇综合报告，包含作者 hands-on 结果和 L4 资料调研。部分运行使用 `gpt-5.4`、工具自带 embedding 或不同回答协议，不能概括为全部项目在完全统一后端下公平横比。

> **本专题视角：实测评测与选型。** 同一批项目另有[架构解读版](../../agent/ai-app-tutorials/rag/memory-systems/README.md)，从四层记忆架构、写入/读取分离、治理 schema 等设计维度展开。两份互补——本页给你"能不能用、分数多少、坑在哪"，架构版给你"怎么设计、怎么选型、怎么评估"。

## 目录

### 评测专题(综合报告,2 万+ 字)

- [AI 记忆系统开源项目深度评测报告](overview-report.md) —— 13 项目分析:方法论、作者运行记录、LongMemEval 缩减子集、负分校验六次翻案、选型线索。

### 项目详解(每篇 1 万+ 字,技术架构 / 实现原理 / 数据流 / 技术栈)

#### 可插拔记忆层 / 事实抽取
- [01-Mem0:可插拔事实抽取记忆层](projects/01-mem0-pluggable-memory-layer.md) —— 冒烟 83% / LME 33%。
- [05-Supermemory:单二进制混合图谱记忆](projects/05-supermemory-single-binary-hybrid-graph-memory.md) —— 冒烟 67% / **LME 缩减子集 2/4（4 个参与工具中的本次最高值）**。

#### Agent 运行时 / 自管记忆
- [02-Letta(MemGPT):agent 自管 OS 式记忆](projects/02-letta-memgpt-agent-managed-memory.md) —— agent 直接作答协议下冒烟 12/12；与其他工具“检索 → 固定 reader”协议不可直接横比。
- [09-Hindsight:生物启发三通路记忆](projects/09-hindsight-bio-inspired-three-pathway-memory.md) —— py3.13 装不上(BLOCKED)。

#### 知识图谱 / 时序图
- [03-Zep + Graphiti:bi-temporal 知识图谱](projects/03-zep-graphiti-bi-temporal-knowledge-graph.md) —— 冒烟 50% / LME 缩减子集 0/3；本次 temporal 样本未兑现时序优势。
- [04-Cognee:GraphRAG 知识图谱](projects/04-cognee-graphrag-knowledge-graph-memory.md) —— 本次版本与配置下双后端均卡在 schema 校验。

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
| 插即用、生态最大 | **Mem0** | 冒烟 83%；厂商自报 94% 与报告引用的独立复现 49% 差异大 |
| Agent 自管直接作答 | **Letta** | 不同协议下冒烟 12/12，不能与固定 reader 组直接排序 |
| 零依赖、扛规模、不丢值 | **Memvid** | 完整 138K haystack 召回成功 |
| 事实更新 / 矛盾消解试点 | **Supermemory** | 缩减子集 2/4，4 个参与工具中的本次最高值 |
| 时序图谱 | **Graphiti** | 原生 bi-temporal,但需强抽取模型 |
| 框架内置(LangChain) | **LangMem** | 冒烟 41.7%,生态原生 |
| 本次不直接采用 | **Cognee / OpenMemory / Universal-MCP** | 当次版本 schema 失败 / sunset / 云代理 |

**三个头条发现:**
1. **LongMemEval 缩减子集次序与冒烟不同** —— 仅 4 个工具参加 3–4 题缩减子集，Supermemory 以 2/4 得到本次最高值；这不是完整基准排名。
2. **厂商自报分不可直接横比** —— Mem0 自报 94% / 报告引用的独立复现 49%；需要统一输入、后端、embedding、reader、judge 和回答协议后再比较。
3. **Cognee 的当次 schema 失败未因换用 `gpt-5.4` 消失** —— 该记录只绑定本次版本、配置和错误路径。

## 评测产出位置

报告规划的 harness、原始数据和证据台账原拟放在 `runs/2026-07-03-memory-systems-eval/`，但该目录**不在当前仓库**。现有方法说明不足以保证得到相同分数；升级到可审计/可复跑状态所需产物见[状态页](../reproducibility-status.md)。

尚未公开的计划产物清单：
- `decision-report.md` / `findings.md` / `methodology.md` —— 决策报告、发现、方法论。
- `evidence-ledger.jsonl` —— 30 条证据台账(逐条可核)。
- `phaseB-research-results.json` —— 13 工具结构化调研数据。
- `media-pack/benchmark-results/smoke-answers/` —— 每工具的召回 / 答案 / 判分 / 得分,逐题可核。
- `harness/` —— driver / finish / judge + 适配器。

## 字数统计

- 评测专题:21,788 字(≥ 2 万 ✓)
- 13 篇项目详解:每篇 10,017–12,239 字(各 ≥ 1 万 ✓)
- **总计:163,417 字(16.3 万字)**

## 方法论要点

本评测以 `/ai-evaluator` 方法论组织：对象画像推导、对比协议、负分校验门、实证深度轴和证据分级(L1–L5)。作者运行以本地 `qwen2.5:14b` / `qwen3-embedding:4b` 为主要基线，但部分抽取、reader 或 judge 使用 `gpt-5.4`，Supermemory / Memvid / Basic Memory 使用各自 embedding，Letta 采用 agent 直接作答；这些结果必须按协议分组阅读。
