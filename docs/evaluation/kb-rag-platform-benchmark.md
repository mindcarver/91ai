# 四大开源知识库平台 RAG 实测：MaxKB / RAGFlow / FastGPT / Dify

> **可复现性状态：R1（narrative-only / artifacts-not-published）。** 本文保留作者运行记录；报告所述脚本、输入快照和原始结果不在当前仓库，因此第三方目前不能仅凭本仓库复跑分数。详见[评测可复现性状态](reproducibility-status.md)。

**TL;DR：** 本文记录了作者报告的一手 RAG 平台实测。作者在同一台机器、同一个本地 Ollama（`qwen2.5:14b` + `qwen3-embedding:4b`）下，对四个开源知识库平台（MaxKB、RAGFlow、FastGPT、Dify）运行了 **4 类数据集**（英文技术文本、文本型 PDF、中文段落、扫描/图像文档）。由于原始产物未公开，以下数字和结论应视为运行记录：

- 在本次**文本类语料**（.txt / 文本 PDF / 中文）上，四家记录的召回为 80–100%，但 FastGPT top-1 与其他平台 top-5 不完全可比；
- 在本次**扫描/图像样本**和默认解析链路下，只有 RAGFlow 的 DeepDoc OCR 形成有效检索结果（76%），另外三家记录为 0–10%；
- "DeepDoc 解析最强"这句口碑**是场景、版本和配置依赖的**：本文只能确认它在本次扫描样本中的优势；
- 纯 API 自动化集成的摩擦度：**MaxKB 最低，Dify 最高**（FastGPT 居中偏上，RAGFlow 有版本回归 bug）。

整理日期：2026-07-03。文中数字为作者本机运行记录；文末列出的是原运行使用或规划公开的产物结构，这些产物当前尚未发布到本仓库。

## 一、为什么自己测，而不信榜单

开源知识库（RAG）平台的官方文档和营销页几乎都自称"支持 PDF、支持中文、支持私有化、检索又快又准"。但落到企业落地（尤其是高保密制造业、内部知识沉淀、Agent 编排），真正要回答的问题没有一个 README 会写：

- 给它**真实的复杂 PDF**（带表格、扫描件、多栏版式），它解析得出来吗？
- **中文**检索靠不靠谱？分词、切片、embedding 对中文友好吗？
- 灌库、配模型、检索这一整套，**能不能纯 API 自动化**（决定能不能进 CI/CD、能不能批量管 25 个知识库）？
- **纯内网、数据不出网**这个硬约束，到底哪家真做到？

这些问题只有把四个平台真的搭起来、灌同样的语料、问同样的问题、读它的源码和数据库才能回答。本文就是这件事的完整记录。

## 二、评测环境与公平性控制

### 2.1 硬件与服务

- **机器**：Xeon 72 核 / 62G RAM / RTX 3090 24G，单机。
- **共享后端 LLM**：原生（非容器）Ollama，`http://<host>:11434`，拉了 `qwen2.5:14b`（LLM）、`qwen3-embedding:4b`（embedding）。OpenAI 兼容端点 `/v1`。
- **四个平台**全部同机纯私有化部署，**共用同一个 Ollama**：MaxKB `:8004`、FastGPT `:8003`、Dify `:8001`、RAGFlow `:8002`。
- Docker 镜像加速已配置（1panel.live / daocloud / rat.dev），v2raya 容器 `restart=always`。

### 2.2 公平性口径

为了减少平台外因素的干扰，我们做了三项控制；但下述裁判和 top-K 协议偏差意味着它不是严格 apples-to-apples：

1. **同一个 embedding + 同一个 LLM**：四家全部接同一个 Ollama 的 `qwen3-embedding:4b` 做向量化、`qwen2.5:14b` 做答案生成与裁判，以减少模型差异。
2. **同一份语料、同一组问题**：每个数据集的 50/40 道题，四家都跑同一份，golden 答案固定。
3. **统一指标**：① 检索召回 `recall@hit%`（golden 文档是否进入 top-K）；② 回答正确性（LLM 裁判 0–5 分）；③ 延迟、索引耗时。

> ⚠️ 一条诚实声明：原计划用更强裁判模型 glm-4.7，但它**在 Ollama `/api/generate` 下对结构化打分 prompt 返回空**（推理 token 被吞），所以全程改用 `qwen2.5:14b` 兼任裁判。同族自评可能影响绝对分数，也可能影响相对排名；当前没有异族裁判或人工标注证明排名不受影响。

## 三、四个数据集：分别压哪一面

我们没有只用一个数据集（单数据集会掩盖平台在不同场景的差异），而是用了 4 个，每个压一个不同的能力面：

| 数据集 | 来源 | 形态 | 规模 | 压测什么 |
|---|---|---|---|---|
| **TechQA** | HF `nvidia/TechQA-RAG-Eval`（IBM 技术支持问答） | 英文 `.txt` | 646 篇 + 40 题 | 基础检索/回答能力（baseline） |
| **CUAD** | HF `theatticusproject/cuad` + `dvgodoy/...PDF` | **文本型 PDF**（SEC 合同，有文本层） | 50 份 + 50 题 | PDF 解析 + 表格/版式 |
| **CMRC2018** | HF `hfl/cmrc2018` | 中文段落 | 211 篇 + 40 题 | 中文检索/分词 |
| **DocVQA** | HF `nielsr/docvqa_1200_examples` | **图像/扫描文档**（无文本层） | 50 份 + 50 题 | OCR / 复杂版式（DeepDoc 主场） |

每个数据集都构建为「语料库 + 测试题（带 golden 答案与 golden 文档）」。原运行所述构建脚本当前未发布到本仓库，计划产物见文末。

## 四、结果一：TechQA（英文技术文本，baseline）

这是最"正常"的 RAG 任务：英文技术文档 + 自然语言问题。四家使用同一任务，但 FastGPT 是 top-1，其余三家是 top-5：

| 平台 | recall@hit% | 回答(0-5) | 检索延迟 | 索引耗时(646篇) |
|---|---|---|---|---|
| **MaxKB** | 90.0% | 2.9 | 0.59s | 528.7s |
| **RAGFlow** | 90.0% | 2.88 | 0.89s | **70.2s（最快）** |
| **FastGPT** | 87.5% | 2.73 | 0.41s | 245.9s |
| **Dify** | 90.0% | 2.67 | 0.38s（中位） | ~1307s（最慢） |

> FastGPT 的 87.5% 是 **top-1** 口径（它的 `/dataset/searchTest` 端点实测恒返回 top-1，无论 `limit=5/10`），其余三家是 top-5。它记录的是首条命中表现，不能与另外三家的 top-5 召回率直接排序。

**这一轮的关键观察**：在这批文本任务上，四家记录值均接近 90%，但 FastGPT 的 top-1 与其余平台 top-5 不可直接等同。工程指标记录为：RAGFlow 建库最快（70s）、Dify 检索最快（中位 0.38s）但建库最慢（多阶段 pipeline ~22 分钟）、MaxKB 较均衡。

回答分都在 2.7–2.9，主要被裁判偏严 + ~10% 未命中题拉低。我们还用中转站 gpt-5.4 对 MaxKB 做了一次对照（检索沿用本地 embedding 不变）：召回 90% 不变、回答 2.9→2.92。这个单平台、单配置对照提示该轮瓶颈更可能在检索侧，但不足以证明 RAG 的一般性天花板或其他平台更换生成模型后的表现。

## 五、结果二：CUAD（文本型 PDF）

CUAD 是 510 份真实 SEC 商业合同 PDF（带文本层，但版式复杂、有表格和条款结构），取 50 份 + 50 题。

| 平台 | CUAD PDF recall | 口径 | PDF 解析能否成功 |
|---|---|---|---|
| **Dify** | 90% | top-5 | ✅ 50/50 原生解析 |
| **MaxKB** | 84% | top-5 | ✅ 50/50（`/document/split`） |
| **RAGFlow** | 80% | top-5 | ✅ 50/50（DeepDoc，但慢 ~20min） |
| **FastGPT** | 68% | top-1 | ⚠️ 默认 LiteParse 39/50 报错，需禁用走 pdfjs |

这一轮有个**反直觉**的结果：**RAGFlow DeepDoc 在文本型 PDF 上反而最低（80%）**，Dify 最高（90%）。

原因是 CUAD 是**电子申报的文本型 PDF**（有文本层，不是扫描件）。DeepDoc 的强项是 OCR / 复杂版式 / 表格——遇到本身就有文本层的 PDF，这些强项用不上，差异就落在切片粒度和检索匹配上，而 RAGFlow 的合同切块对"找属性"类查询不如 Dify 顺手。**DeepDoc 不是万能 PDF 利器，它的优势要换扫描件/复杂版式才体现**（见第七节 DocVQA）。

另外一个重要坑：**FastGPT 默认的 PDF 解析器 `@llamaindex/liteparse`（原生二进制）对这批真实 PDF 报 "invalid PDF format"**，39/50 解析失败，重传稳定复现。FastGPT 内置了 pdfjs 兜底，但回退逻辑只在"native 加载失败"时触发、不覆盖"内容解析失败"——需要手动禁用 LiteParse native（改名 `.node`）才走 pdfjs。**对要做复杂 PDF 的场景，这是个隐蔽坑：灌库看着成功，实则大半文档没切出 chunk。**

## 六、结果三：CMRC2018（中文）

CMRC2018 是 SQuAD 式中文阅读理解，构建为 211 篇中文段落 + 40 道中文问。

| 平台 | CMRC 中文 recall | 口径 |
|---|---|---|
| **Dify** | 100% | top-5 |
| **FastGPT** | 95% | top-1 |
| **MaxKB** | 92.5% | top-5 |
| **RAGFlow** | 80% | top-5 |

在本次 CMRC2018 样本和配置下，四家记录值为 80–100%，`qwen3-embedding:4b` 在这批中文题上形成了有效召回。Dify 记录为 100%，RAGFlow 为 80%；由于 FastGPT 是 top-1、其他平台是 top-5，这些数值不构成严格的平台排名。

绝对召回高于 TechQA 轮（80–100% vs ~90%），可能与 CMRC 语料较小（211 篇）且每题答案落在单一段落有关。受 top-K 口径和同族裁判影响，本轮数值应视为运行快照，不应生成统一相对排名。

## 七、结果四：DocVQA（扫描/图像文档，DeepDoc 主场）

这是 CUAD 留下的悬案——**到底 DeepDoc 强在哪**？我们用 DocVQA（文档图像 + 视觉问答），把 50 份文档**图像**（无文本层，Pillow 包成 image-PDF）灌进四家。

| 平台 | DocVQA recall | OCR？ | 实测表现 |
|---|---|---|---|
| **RAGFlow** | **76%** | ✅ **DeepDoc OCR** | 49/50 成功 OCR 出真实文本，检索正常 |
| **Dify** | 10% | ❌ | 不 OCR，只存图片占位符（形如 `![image]` 指向内部 file-preview 路径，无 searchable 文本） |
| **FastGPT** | 0% | ❌ | **0 chunks**，pdfjs 从图像提取不出任何文本 |
| **MaxKB** | 0% | ❌ | 同样 0 chunks |

**这是本次运行中的镜像反转**：在所测文本型 PDF 上 RAGFlow 记录值最低，但在所测扫描/图像样本上记录为 76%，另外三家为 0–10%。

在本次记录的版本、默认解析链路、配置和 DocVQA 样本下，只有 RAGFlow 的 DeepDoc OCR 把无文本层图像转成了可检索文本；FastGPT/MaxKB 形成 0 chunks，Dify 只留下图片占位符。这说明 DeepDoc 在这次扫描样本中提供了关键 OCR 能力，但不能外推为所有版本、插件、配置或复杂版式上的永久结论。

对企业的直接启示：如果包含历史纸质工艺记录、扫描说明书或传真，应把 OCR 能力单列为 POC 门槛，并用自己的样本重跑。本文只能确认当次测试中 RAGFlow 的默认链路有效，不能证明其他版本或外接 OCR 方案不可用。

## 八、跨数据集综合：一张总表看清谁适合什么

| 平台 | TechQA(.txt) | CUAD(文本PDF) | CMRC(中文) | DocVQA(扫描) | 一句话定位 |
|---|---|---|---|---|---|
| **MaxKB** | 90% | 84% | 92.5% | 0% | 单容器、最易上手、文本/中文都稳，无 OCR |
| **RAGFlow** | 90% | 80% | 80% | **76%** | 本次扫描样本中默认 OCR 链路有效，但文本检索记录值不占优、吃资源 |
| **FastGPT** | 87.5%(top-1) | 68%(top-1) | 95%(top-1) | 0% | 检索/中文强，但默认 PDF 解析有坑、无 OCR |
| **Dify** | 90% | 90% | 100% | 10% | 文本/PDF/中文最稳，Agent 生态最强，但 API 自动化最重 |

**核心结论**：
1. **在本次文本样本和配置下，四家均形成较高召回记录**；FastGPT top-1 与其他 top-5 不可直接比较。
2. **DeepDoc 的表现具有场景依赖性**：本次文本型 PDF / 中文记录值不占优，扫描样本中 OCR 优势明显。
3. **是否选择 RAGFlow，应由自己的扫描/图像文档 POC 决定**，不能把这次样本结论视为永久产品属性。

## 九、部署/资源/授权（作者运行记录）

| 指标 | MaxKB | FastGPT | Dify | RAGFlow |
|---|---|---|---|---|
| 镜像总体积 | **4.6GB**（单镜像） | ~9GB | ~9GB | **~16GB**（ragflow 单镜像 12.2GB） |
| 运行容器数 | **1** | 10 | 11 | 5 |
| 部署命令 | 一条 `docker run` | CN compose | 巨大 compose+profile | CN compose+大镜像 |
| 首启到可用 | **~3 分钟** | ~5 分钟 | ~8 分钟（DB 迁移+profile 坑） | ~6 分钟（建 ES 索引） |
| License | GPL v3 | 自定义 OSL（规模门槛） | Apache 2.0 + 多租户限制 | **Apache 2.0**（最干净） |

部署踩坑（均为真实）：
- **Dify**：DB 服务全在 compose `profile` 里，必须 `--profile postgresql --profile weaviate` 才起库，否则 api 找不到 db 陷入 restart 循环；首启 DB 迁移期间 nginx/plugin_daemon 会 restart。
- **RAGFlow**：ES 镜像经镜像源曾断连卡死（手动 `docker pull` 续传解决）；登录密码需 RSA 加密（取容器内 `public.pem`）；v0.26 的 `init_llm_factory()` 被官方注释，导致厂商表空，API 自配模型受阻。
- **FastGPT**：服务多、token/key 配置密，需改 minio 端口避让。
- **MaxKB**：一条命令起，最顺。

**纯内网状态尚不能独立验证。** 作者记录为四个平台均在本机部署并共用本地 Ollama，但当前没有公开网络抓包、完整配置快照或外连日志，不足以证明运行期数据完全不出网。高保密场景仍需自行验证。

## 十、纯 API 自动化摩擦（对做 CI/CD、多知识库管理很关键）

这是本次评测最"痛"的部分，也是最有工程价值的发现。我们尝试用**纯 API**（不走 UI）完成「配模型 → 灌库 → 检索」全流程，四家的摩擦度差异巨大：

| 平台 | 模型配置路径 | 摩擦度 | 实测结论 |
|---|---|---|---|
| **MaxKB** | OpenAI 兼容接 Ollama，几条 POST | ★（最顺） | 已完整跑通，半天可集成 |
| **FastGPT** | aiproxy 通道 + mongo 模型注册 + plugin daemon | ★★★ | 登录反爬码 + aiproxy 配置链路长 |
| **RAGFlow** | v0.26 `init_llm_factory` 被注释→厂商表空 | ★★★★ | API 自配模型受阻，需手工导 DB |
| **Dify** | 模型走插件市场（install plugin→配 credentials） | ★★★★★ | 功能最全但 API 自动化成本最高 |

### 10.1 FastGPT 的三个坑（实测）

1. **登录反爬**：`preLogin` GET 拿一次性 code + 密码 `sha256` → `loginByPassword`。
2. **模型层最复杂**：aiproxy（独立 Go 服务 + 自己的 postgres）+ FastGPT 的 mongo `system_models` + plugin daemon 三层。custom 模型要走 `requestUrl` 直连 Ollama 才能用（custom 模型能列出但 `getSystemModelConfig` 会拒）。
3. **建库狂报 514 的真凶**：user token 必须放在 **`token:` HTTP header**，**不能放 `Authorization:`**——后者会被当成 apikey 走 `authOpenApiKey` 查库失败。这个坑卡了很久。

### 10.2 Dify 的连环坑（实测）

1. **密码是 base64 不是 RSA**：源码注释明说"uses Base64 encoding for obfuscation, not cryptographic encryption"。密码里的 `@` 字符会破坏 base64 解码 → "Invalid encrypted data"。
2. **所有请求强制 CSRF 双提交**：cookie 里的 `csrf_token` + `X-CSRF-Token` header 必须同时带。
3. **插件市场 identifier 不可截断**：marketplace 返回的 `latest_package_identifier` 是 88 字符（含完整 commit hash），截断会报 "plugin package not found"。
4. **新版移除了 console 的 `create_by_text`**：改走 RAG pipeline 工作流。但 **service_api（`/v1`，dataset API key 鉴权）保留了 classic 接口**，用 `create-by-text` + API key 旁路跑通。
5. hit-testing 的 query 上限 250 字符，超长直接拒。

### 10.3 RAGFlow 的版本回归

`api/db/init_data.py:144` 的 `init_llm_factory()` 在 v0.26 被官方注释掉，`llm_factories` 表未种子化 → `add_llm` 报 "factory Ollama is not allowed"。需要手工导 `conf/llm_factories.json` 或走 UI。这是版本回归 bug，不是设计如此。

### 10.4 共享 Ollama 的一次并发超时记录

作者记录在一次 RAGFlow 并发解析 + 其他平台 embedding 时，`POST /api/embed` 持续 60 秒超时，重启 `ollama serve` 后恢复。当前没有 GPU 状态、Ollama 日志或重复运行证明这是死锁，也不能仅凭一次事件确定根因。对共享 Ollama 的生产环境，可以把限并发、超时、队列和监控作为预防措施，并用本地压测确认阈值。

## 十一、多维度加权评分

针对"高保密制造企业"的权重（私有化/检索/权限权重高），量纲 1–5（5 最佳）：

| # | 维度 | 权重 | MaxKB | FastGPT | Dify | RAGFlow |
|---|---|---|---|---|---|---|
| 1 | 私有化/数据安全 | 3 | 5 | 5 | 4 | 5 |
| 2 | 检索质量 | 2.5 | 4(实测90%) | 4(实测87.5%top-1) | 4(实测90%) | 4(实测90%) |
| 3 | 回答质量 | 2 | 3 | 3 | 3 | 3 |
| 4 | 文档解析 | 1.5 | 3 | 3 | 3 | **5**（DeepDoc/OCR） |
| 5 | 权限/多租户 | 2 | 4 | 4 | 4 | 3.5 |
| 6 | 中文支持 | 1.5 | 5 | 5 | 4 | 5 |
| 7 | 性能/资源 | 1.5 | **5**（最轻） | 3.5 | 3 | 2（最重） |
| 8 | 编排/Agent | 1.5 | 4 | 4.5 | **5** | 3.5 |
| 9 | 易用性 | 1 | **5** | 3.5 | 2.5 | 2.5 |
| 10 | 社区/生态 | 1 | 3.5 | 4 | **5** | 4 |
| 11 | 授权/商用 | 1.5 | 3(GPL) | 3(OSL门槛) | 4(Apache+限) | **5**(Apache) |
| — | **加权综合** | — | **4.08** | **3.99** | **3.79** | **3.96** |

**本次加权结果：MaxKB (4.08) > FastGPT (3.99) ≈ RAGFlow (3.96) > Dify (3.79)**。由于 FastGPT 检索口径不同、裁判未经异族或人工校准，这只是当次权重下的决策草案，不是严格可比的综合排名。

> 注意：如果"文档解析/OCR"权重上调（企业有大量扫描件），RAGFlow 会上移；如果"编排/Agent"权重上调（做 25 个 Agent），Dify/FastGPT 会上移。

## 十二、分场景选型建议

1. **快速上线纯本地知识库问答**（质量/FAE/工艺知识沉淀，最高保密）→ **MaxKB**：单容器、对 Ollama 开箱即用、中文好、实测召回 90%。自用 GPL 无碍。
2. **承载多 Agent 的统一底座**（研发/良率/设备编排）→ **Dify 或 FastGPT**：Dify 编排/Agent/插件最强（但部署配置最重）；FastGPT 知识库+工作流均衡、学习曲线更平。建议 POC 二选一。
3. **文档解析要求极高 / 有扫描件**（PDF datasheet、工艺曲线、扫描件）→ **优先把 RAGFlow 纳入 POC**：本次记录中 DeepDoc/OCR 在扫描样本为 76%，其他默认链路为 0–10%。该结论绑定本次版本、配置和样本，仍需用企业文档验证。
4. **跨平台共享本地 Ollama**：作者在一台 3090 上记录了四平台共用 LLM + embedding，也记录过一次并发超时。上线前应压测并配置限流、超时和监控，不应把单次事件直接定性为必然死锁。

## 十三、局限与诚实声明

- **DocVQA/CUAD 是代理数据集**，不是真实企业 datasheet。datasheet 多为带表格的 born-digital PDF——CUAD（文本合同）和 DocVQA（扫描表单）只是侧面逼近；绝对值和相对次序都可能随版本、配置和样本改变。真实选型应使用企业自己的 datasheet 做 POC。
- **FastGPT 全程 top-1 口径**（searchTest 限制），与另三家 top-5 不完全可比，已保守标注。
- **裁判模型单一**（qwen2.5:14b 兼任，glm-4.7 在 Ollama 下无法完成结构化打分）。同族偏差可能影响分数和相对次序，尚无人工标注或异族裁判校准。
- **每个数据集只测了 40–50 题**，样本量有限；它可以提供失败线索，不足以估计稳定的平台间差异。
- 部署、资源、授权、易用性、回答、检索和文档解析结论均来自作者运行记录；当前缺少可公开逐项审计的原始日志。

## 十四、可复现性状态与计划产物

当前等级为 **R1**：`kb-benchmark/` 及下列脚本、数据快照和原始结果不在当前仓库。以下保留作者运行时记录的产物结构，不能当作已公开路径；升级清单见[评测可复现性状态](reproducibility-status.md)。

- **数据集构建**：`scripts/{build_benchmark,build_cuad,build_cmrc,build_docvqa}_benchmark.py`（分别构建 TechQA/CUAD/CMRC/DocVQA 语料+题集）
- **灌库+检索**：`scripts/{bench_maxkb,bench_ragflow_poll,bench_fastgpt,bench_dify}.py` + `scripts/{cuad_retrieve,cmrc_bench,docvqa_bench}.py` + `scripts/{dify_helper,fastgpt_helper}.py`
- **打分**：`scripts/score.py`（统一召回 + 生成 + 裁判）
- **结果**：`results/{maxkb,ragflow,fastgpt,dify}.jsonl` + `{cuad,cmrc,docvqa}_*.jsonl` + `summary.json`；若找回产物，需先区分 FastGPT top-1 与其他平台 top-5，不得默认同口径汇总。
- **证据**：`deployment_facts.md`、`config_findings.md`、`EVAL_FRAMEWORK.md`、`SUBAGENT_RUNBOOK.md`

## 写在最后

这次运行记录最大的启示不是某家的分数，而是**"DeepDoc 最强"这类口碑依赖场景、版本和配置**：它在本次文本型 PDF 样本中记录值较低，在扫描样本中则体现出 OCR 优势。RAG 平台选型应使用自己的真实文档和统一口径重跑。

后续四个单独的篇章分别拆解 MaxKB / RAGFlow / FastGPT / Dify 的技术架构、实现原理、数据流与技术栈，便于深入理解它们为什么会表现出上述差异。
