# FastGPT 技术架构与实现原理

FastGPT 是四家里**前端体验最好、模型层最复杂**的一个。它的定位是"对话式知识问答 + 工作流编排"，中文生态成熟、检索质量高。但它的模型系统是三层叠加（aiproxy + mongo 注册表 + plugin daemon），PDF 解析还有个静默失败的坑。本文拆解它的技术栈、三层模型架构、数据流与那些隐蔽的 API 坑——所有结论来自对其 Next.js 源码（`projects/app/src/...`）、MongoDB 集合、aiproxy postgres、API 行为的一手观察。

## 一、技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端 + BFF | **Next.js（Node）** | 实测运行 `next-server (v16.2.6)`，API 路由在 `projects/app/src/pages/api/` |
| 主数据库 | **MongoDB** | 知识库、文档、切片、训练队列、模型注册全在 mongo |
| 向量库 | **PgVector**（fastgpt-pg 容器） | 存 embedding 向量 |
| 对象存储 | **MinIO** | 存上传的原始文件 |
| 缓存/队列 | **Redis** | 训练/embedding 队列 |
| 模型代理 | **aiproxy（独立 Go 服务 + 自己的 postgres）** | 路由 LLM/embedding 请求到后端（如 Ollama） |
| 插件守护 | **plugin daemon（独立进程）** | 提供 builtin 模型列表、插件运行 |
| 部署 | docker-compose，**10 个容器** | 服务最分散（app/plugin/code-sandbox/mcp-server/aiproxy/pg/mongo/redis/minio） |

FastGPT 的"服务多"源于它把模型代理（aiproxy）、插件（plugin daemon）、代码沙箱（code-sandbox）、MCP server 都拆成了独立服务。这种解耦让它扩展性强，但也让配置（一堆 token/key）非常密。

## 二、三层模型系统（FastGPT 最复杂的部分）

FastGPT 的模型管理是三层叠加，理解这三层是理解 FastGPT 的关键：

```
┌─────────────────────────────────────────────────┐
│  FastGPT app (Next.js)                          │
│    └─ global.systemModelList (从下面两处汇总)    │
└─────────────────────────────────────────────────┘
           │                         │
           ▼ pluginClient            ▼ MongoSystemModel
   ┌───────────────┐         ┌──────────────────┐
   │ plugin daemon │         │ mongo:           │
   │ (builtin 模型)│         │ system_models    │
   │ listModels()  │         │ (custom 模型/覆盖)│
   └───────────────┘         └──────────────────┘
           │
           ▼ 推理时
   ┌───────────────┐
   │ aiproxy (Go)  │ → Ollama / OpenAI / ...
   │ postgres:     │
   │  channels     │
   │  model_configs│
   └───────────────┘
```

- **plugin daemon**：提供 **builtin 模型列表**（标准目录，如 OpenAI 的 text-embedding-3-small、bge 系列，实测共 278 个 builtin 模型，默认只 2 个 active）。
- **mongo `system_models`**：存**自定义模型**或对 builtin 的覆盖。文档结构 `{model, metadata}`，metadata 是完整模型定义（type/provider/defaultToken/maxToken 等）。custom 模型带 `requestUrl` 直连后端（绕过 aiproxy）。
- **aiproxy**：实际路由推理请求的 Go 服务，有自己的 postgres（`channels`/`model_configs`/`groups` 表）。channel 定义"哪个后端提供哪些模型"。

### loadSystemModels 的合并逻辑

FastGPT 启动时 `loadSystemModels` 把三处合并：

1. 先取 plugin daemon 的 builtin 模型（`pluginClient.listModels()`）。
2. 再叠加 mongo `system_models` 里**不与 builtin 重名**的 custom 模型。
3. 默认模型（`systemDefaultModel.embedding/llm`）从 active 列表里选。

**关键坑**：custom 模型能被 `pushModel` 列出，但 `getSystemModelConfig`（实际使用时取配置）对 custom 模型直接 reject `'Custom model not data'`——**custom 模型能列出但不能用**。要让 custom 模型可用，必须配 `requestUrl` 直连后端（不经过 aiproxy/plugin 的标准路径）。这是 FastGPT 接 Ollama 自定义模型的核心机制。

## 三、数据流：从文本/PDF 到可检索

FastGPT 的灌库分"文本灌库"和"文件灌库"两条路：

```
[文本] POST /api/core/dataset/collection/create/text {datasetId, name, text, trainingType, chunkSize}
       → 创建 collection + 异步 training(embedding)
       
[文件] POST /api/core/dataset/collection/create/localFile (multipart: file + data)
       → 上传文件 → readFile worker 解析 → 切块 → training
```

`trainingType` 支持 `chunk`（按规则切）和 `qa`（用 LLM 生成 Q&A 对）。文件解析走 `readFile` worker，根据扩展名分发：

- **PDF**：默认 `readPdfByLiteParse`（`@llamaindex/liteparse` 原生二进制），失败回退 `readPdfByPdfJs`（pdfjs）。
- **docx/xlsx/pptx**：各自的 extension handler。
- **txt/md/html/csv**：原生解析。

### 异步训练队列

灌库后，chunks 进入 `dataset_trainings` 集合排队。FastGPT 有两个并发循环：

- **Parse queue**（切片）：解析文件 → 生成 training rows。
- **Vector queue**（embedding）：取 training rows → 调 embedding → 写 `dataset_datas`。

实测 Vector queue 并发上限 10（`max: 10`）。embedding 完成后 `dataset_trainings` 该条删除、`dataset_datas` 增加。检索就绪 = `trainings` 为 0。

## 四、PDF 解析的静默失败坑（LiteParse vs pdfjs）

这是 FastGPT 最隐蔽的坑，实测中卡了很久：

FastGPT 默认用 **LiteParse**（`@llamaindex/liteparse`，原生二进制 `liteparse.linux-x64-gnu.node` + `libpdfium.so`）解析 PDF。但 LiteParse 对**真实复杂 PDF**（如 SEC 合同）会报 `"PDF error: invalid PDF format"`，且**重传稳定复现**（不是偶发）。

FastGPT 内置了 **pdfjs 兜底**（`readPdfByPdfJs`），但 `readPdfFile` 的回退逻辑（`extension/pdf.ts`）只在**特定错误**下触发：

```js
LITE_PARSE_NATIVE_ERROR_PATTERNS = [
  /failed to load native module/i,
  /cannot find module ['"]@llamaindex\/liteparse-/i,
  /liteparse.*native/i, ...
]
```

注释明说："**只有部署环境不兼容导致的 native/optional dependency 错误才回退 PDF.js；PDF 内容解析失败等业务错误继续抛出，避免 fallback 掩盖真实问题。**"

所以 LiteParse 报 "invalid PDF format"（内容错误）→ **不回退**，直接抛错 → 该 PDF 解析失败。实测 39/50 份 CUAD PDF 失败，且**不报错给用户**（只在 `dataset_trainings.errorMsg` 里），灌库看着成功，实则大半文档没切出 chunk。

**解法**：禁用 LiteParse（把 `.node` 和 `libpdfium.so` 改名），让它走 "native load failed" 分支 → 自动用 pdfjs。pdfjs 是纯 JS，对复杂 PDF 更宽容（实测禁用后 50/50 解析成功）。但这是个 hack，FastGPT 没提供"强制用 pdfjs"的配置开关。

## 五、鉴权：token header 的坑

FastGPT 的 API 鉴权有个**极容易踩的坑**：

```python
# ❌ 错误：会报 514 unAuthApiKey
headers = {"Authorization": f"Bearer {user_token}"}

# ✅ 正确：user token 放 token header
headers = {"token": user_token}
```

原因在 `parseHeaderCert`（`packages/service/support/permission/auth/common.ts`）：

```js
const { cookie, token, rootkey, authorization } = req.headers;
if (authApiKey && authorization) {        // ← Authorization 走 apikey 路径
  return parseAuthorization(authorization);  // 把 user token 当 apikey 查库 → 失败 → 514
}
if (authToken && (token || cookie)) {     // ← user token 要从这里进
  return authCookieToken(cookie, token);
}
```

很多路由（如 dataset create）同时设了 `authToken: true` 和 `authApiKey: true`。如果你用 `Authorization: Bearer <user_token>`，它会优先匹配 apikey 路径，把 user token 当 apikey 去 `MongoOpenApi` 查，查不到 → **514 unAuthApiKey**。必须用 `token:` header。这个坑浪费了大量调试时间。

另外登录本身也有反爬：`preLogin`（GET 拿一次性 6 位 code，30 秒过期）+ 密码 `sha256` → `loginByPassword`。

## 六、检索：searchTest 与 top-1 限制

FastGPT 的检索端点是 `POST /api/core/dataset/searchTest`：

```json
{
  "datasetId": "...",
  "text": "查询",
  "limit": 5,           // 实测无效
  "similarity": 0.0,
  "searchMode": "embedding"  // 也支持 mixed / fullText(需建全文索引)
}
```

实测 **searchTest 恒返回 top-1**（无论 `limit=5/10`，`embedding` 模式只回 1 条 chunk）。这是"测试预览"端点的设计，真正的 top-K 检索在 chat/workflow 里。这导致横评中 FastGPT 是 top-1 口径（87.5% / 68% / 95% / 0%），与其他三家 top-5 不完全可比——但 top-1 就到这个数，反而说明其首条命中质量高。

返回的 chunk 带 `sourceName`（来源文件名）、`q`（内容）、`score`、`collectionId`。`sourceName` 可直接用于 recall 计算。

## 七、为什么 FastGPT "检索强但摩擦中等"

回到横评，FastGPT 的画像：

- **文本检索强**（TechQA 87.5% top-1、CMRC 95% top-1）——单条命中质量高。
- **PDF 解析有坑**（默认 LiteParse 失败、需禁用走 pdfjs）——这是它最需要警惕的边界。
- **无 OCR**（DocVQA 0%）。
- **延迟最低**（0.41s）——PgVector + 轻量检索链路。
- **模型层最复杂**（三层）——配置心智负担重，但跑通后体验好。

FastGPT 适合"对话式知识问答为主、要中文好、要工作流"的场景。它的痛点在 PDF（需手动解 LiteParse 坑）和模型配置复杂度（三层）。

## 八、API 自动化友好度

FastGPT 的 API 自动化摩擦**中等偏上**：

- 登录：反爬码 + sha256。
- 建库/灌库：`token` header（坑）。
- 模型配置：aiproxy channel + mongo system_models（坑：custom 模型要 requestUrl）。
- 检索：searchTest（top-1 限制）。

跑通后可重复，但初次集成要踩好几个坑（token header、aiproxy channel 类型、custom 模型 requestUrl、PDF LiteParse）。比 MaxKB 难、比 Dify 容易。

## 九、扩展性

FastGPT 的多服务架构（10 容器）让它扩展性不错——aiproxy 可独立扩、plugin daemon 可多实例、MongoDB 可副本集。但它的向量库是单 PgVector 实例（fastgpt-pg），大规模向量检索可能成瓶颈（不如 RAGFlow 的 ES 集群）。

FastGPT 的设计重心在**用户体验和工作流**（Next.js 前端 + 可视化编排），不在超大规模检索。对"几百人到几千人用、知识库几万到几十万篇"的场景，它很合适；再往上，向量库和检索链路可能需要替换。
