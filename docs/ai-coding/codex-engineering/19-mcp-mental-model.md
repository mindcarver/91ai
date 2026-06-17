# MCP 心智模型：外部系统是工具接口不是复制粘贴

**TL;DR：** MCP（Model Context Protocol）的本质是一个标准化的工具接口协议，不是数据搬运管道。错误的认知是把 MCP 当作"让 Codex 把外部系统的数据复制过来"，正确的认知是"MCP 给 Codex 提供了一组结构化的工具，让 Codex 可以按需查询和操作外部系统"。这个认知差异直接影响你如何配置 MCP Server、如何设计工具接口、以及如何预估 Token 消耗。本文从"接口 vs 复制"这个核心区分出发，拆解 MCP 在 Codex 中的架构实现、工具抽象模型、Token 经济学、以及设计新 MCP Server 的正确思路。

---

## 两种心智模型的根本分歧

### 错误心智模型：MCP 是数据搬运工

很多人第一次接触 MCP 时，形成的心智模型是这样的：

```text
外部系统（GitHub / 数据库 / 文档库）
        |
        | "把数据复制过来"
        v
    Codex 上下文窗口
        |
        v
    模型处理全部数据
```

在这个模型下，你会自然地做出以下决策：

- 配置 MCP Server 时，尽量暴露"导出全部数据"的能力
- 期望 MCP 工具返回尽可能多的信息，"让模型看到一切"
- 工具设计倾向于返回原始数据（JSON 列表、完整文本、日志全量）
- Token 消耗失控后困惑：为什么 MCP 这么贵

这个模型的问题不在于它完全错误——MCP 确实让外部数据进入了模型上下文——而在于它把"数据进入上下文"当成了目的本身。在这种心智模型下，你会倾向于最大化数据量，而忽略了每次数据传输都有精确的 Token 成本。

### 正确心智模型：MCP 是工具接口

正确的心智模型是这样的：

```text
外部系统（GitHub / 数据库 / 文档库）
        |
        | 暴露一组命名工具（带类型参数）
        |   - list_issues(state: "open", limit: 10)
        |   - get_pr_diff(pr_number: 42)
        |   - search_docs(query: "auth middleware")
        v
    Codex Agent Loop
        |
        | 模型决策：现在需要什么信息？
        | 调用哪个工具？传什么参数？
        v
    选择性查询 → 结构化响应 → 模型处理
```

在这个模型下，MCP 不是水管，而是遥控器。Codex 不需要把整个 GitHub 仓库复制到上下文窗口中，而是在需要特定信息时调用特定工具，获取精确的结构化响应。

这个区分的实际影响体现在三个方面：

1. **工具粒度设计**：不是"给我所有 Issue"，而是"给我最近 10 个打开的 Issue"
2. **调用决策权在模型**：模型决定什么时候调用、调用几次、传什么参数
3. **每次调用都有成本**：不是免费的批量导入，而是精确计费的按需查询

### 两种模型的实际后果对比

| 维度 | 数据搬运心智模型 | 工具接口心智模型 |
|------|-----------------|-----------------|
| 工具设计倾向 | 返回尽可能多的原始数据 | 返回结构化的精确结果 |
| 调用策略 | 一次拉取全部，后续在上下文中过滤 | 按需调用，每次只取必要信息 |
| Token 消耗 | 不可控，数据量决定成本 | 可控，工具粒度决定成本 |
| 模型决策 | 被动接收数据后处理 | 主动决策查询什么、怎么查询 |
| 错误处理 | 数据拉取失败 = 全部失败 | 单个工具失败可降级继续 |
| 扩展性 | 新系统需要大规模数据适配 | 新系统暴露工具接口即可 |

---

## MCP 在 Codex 中的架构实现

### config.toml 中的 MCP 配置

MCP Server 在 Codex 中通过 `config.toml` 的 `[mcp_servers.*]` 段落配置。每个段落定义一个独立的 MCP Server 实例：

```toml
# 本地命令型 MCP Server（stdio 传输）
[mcp_servers.github]
command = "npx"
args = ["-y", "@anthropic-ai/mcp-github"]
env = { GITHUB_TOKEN = "${GITHUB_TOKEN}" }

# 另一个本地 MCP Server
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

# 远程 URL 型 MCP Server（SSE 传输）
[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
bearer_token_env_var = "FIGMA_OAUTH_TOKEN"
```

配置中的每个 `[mcp_servers.xxx]` 段落定义了一个独立的 MCP Server。段落名（`github`、`context7`、`figma`）是自定义的标识符，用于在日志和错误信息中区分不同服务。

### 两种传输模式：stdio 与 SSE

MCP 协议支持两种传输模式，对应两种不同的服务部署形态：

**stdio（标准输入输出）模式**

用于本地命令型 MCP Server。Codex 启动时会执行 `config.toml` 中指定的 `command`，通过进程的标准输入和标准输出与 MCP Server 通信。通信协议使用 JSON-RPC 格式。

```text
Codex 进程                    MCP Server 子进程
    |                              |
    | stdin: JSON-RPC request      |
    |----------------------------->|
    |                              | 处理请求，调用外部 API
    | stdout: JSON-RPC response    |
    |<-----------------------------|
    |                              |
```

stdio 模式的特点：

- MCP Server 作为 Codex 的子进程运行，生命周期由 Codex 管理
- 通信在同一台机器上完成，无网络开销
- 适合使用 npx 或本地二进制启动的 MCP Server
- MCP Server 的 stderr 输出可用于调试

**SSE（Server-Sent Events）模式**

用于远程 URL 型 MCP Server。Codex 通过 HTTP 请求与远程 MCP Server 通信，使用 SSE 实现服务端到客户端的消息推送。

```text
Codex 进程                    远程 MCP Server
    |                              |
    | HTTP POST: JSON-RPC request  |
    |----------------------------->|
    |                              | 处理请求
    | SSE: JSON-RPC response       |
    |<-----------------------------|
    |                              |
```

SSE 模式的特点：

- MCP Server 部署在远程，可以是云服务或内部基础设施
- 需要网络连通，受延迟和带宽影响
- 认证通过 `bearer_token_env_var` 配置的环境变量实现
- 适合第三方托管服务（如 Figma MCP）

### 启动时的工具发现流程

Codex 启动时会经历以下流程来注册 MCP 工具：

```text
1. 读取 config.toml 中所有 [mcp_servers.*] 配置段

2. 对每个 MCP Server：
   a. stdio 模式：执行 command，建立子进程
      SSE 模式：建立 HTTP 连接
   b. 发送 tools/list 请求（MCP 协议规定）
   c. 接收工具清单（名称、参数 schema、描述文本）

3. 将所有 MCP 工具注册到 Agent Loop 的工具表中
   MCP 工具与内置工具（apply_patch、shell_command）并列

4. 工具描述写入系统提示词
   每个工具的名称、参数定义、功能描述都占系统提示词空间

5. 模型开始接收任务时，已经知道所有可用工具
   包括内置工具和 MCP 工具
```

工具发现的关键细节：Codex 不需要在运行时猜测 MCP Server 能做什么。MCP 协议规定了 `tools/list` 端点，Server 启动后通过这个端点声明自己暴露的所有工具。这个设计意味着工具注册是一次性的——启动时发现，运行时使用。

### 工具在 Agent Loop 中的位置

MCP 工具注册后，它们在 Agent Loop 中与内置工具享有同等地位。模型在做工具调用决策时，不区分"这是内置工具"还是"这是 MCP 工具"——它只看到一组可用的工具，每个工具有名称、参数格式和功能描述。

```text
Agent Loop 单轮决策：

  可用工具列表（模型视角）
    ├── apply_patch        [内置] 编辑文件
    ├── shell_command      [内置] 执行命令
    ├── read_file          [内置] 读取文件
    ├── list_dir           [内置] 列出目录
    ├── search_files       [内置] 搜索内容
    ├── github.list_issues     [MCP] 列出 GitHub Issue
    ├── github.get_pr_diff     [MCP] 获取 PR Diff
    ├── github.create_comment  [MCP] 创建评论
    ├── context7.search_docs   [MCP] 搜索文档
    └── context7.get_page      [MCP] 获取文档页面
         |
         v
    模型根据任务需求选择工具并构造参数
```

模型在决策时只关注"哪个工具能帮我完成当前步骤"，而不关心工具的来源。这也是为什么 MCP 工具的描述质量至关重要——模型对工具的理解完全依赖于描述文本。

---

## 工具抽象：命名工具与类型参数

### 每个 MCP Server 暴露一组命名工具

MCP 的核心抽象是"工具"（tool）。每个 MCP Server 不是暴露一个混沌的数据接口，而是暴露一组命名明确、参数类型化的工具。

以 GitHub MCP Server 为例，它可能暴露以下工具：

```json
[
  {
    "name": "list_issues",
    "description": "列出 GitHub 仓库中的 Issue。支持按状态、标签、负责人过滤。返回 Issue 编号、标题、状态、标签列表、创建时间。",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": { "type": "string", "description": "仓库所有者" },
        "repo": { "type": "string", "description": "仓库名称" },
        "state": { "type": "string", "enum": ["open", "closed", "all"], "default": "open" },
        "labels": { "type": "array", "items": { "type": "string" }, "description": "按标签过滤" },
        "per_page": { "type": "integer", "default": 30, "maximum": 100 }
      },
      "required": ["owner", "repo"]
    }
  },
  {
    "name": "get_pr_diff",
    "description": "获取指定 Pull Request 的完整 diff。返回标准 unified diff 格式的文本。",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": { "type": "string" },
        "repo": { "type": "string" },
        "pull_number": { "type": "integer" }
      },
      "required": ["owner", "repo", "pull_number"]
    }
  },
  {
    "name": "create_comment",
    "description": "在 Issue 或 PR 上创建评论。需要 write 权限。",
    "inputSchema": {
      "type": "object",
      "properties": {
        "owner": { "type": "string" },
        "repo": { "type": "string" },
        "issue_number": { "type": "integer" },
        "body": { "type": "string", "description": "评论内容，支持 Markdown" }
      },
      "required": ["owner", "repo", "issue_number", "body"]
    }
  }
]
```

以 Context7 MCP Server 为例，它可能暴露以下工具：

```json
[
  {
    "name": "search_docs",
    "description": "搜索指定库或框架的官方文档。返回匹配的文档片段列表，每个片段包含标题、URL 摘要和内容摘要。",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "搜索查询" },
        "library": { "type": "string", "description": "目标库名（如 react、nextjs）" },
        "limit": { "type": "integer", "default": 5, "maximum": 10 }
      },
      "required": ["query"]
    }
  },
  {
    "name": "get_page",
    "description": "获取文档的完整页面内容。通常在 search_docs 返回结果后，根据需要获取特定页面的详细内容。",
    "inputSchema": {
      "type": "object",
      "properties": {
        "url": { "type": "string", "description": "文档页面的 URL" },
        "sections": { "type": "array", "items": { "type": "string" }, "description": "只获取指定的章节标题" }
      },
      "required": ["url"]
    }
  }
]
```

### 工具抽象的核心设计原则

从上面的例子可以看出 MCP 工具设计的几个核心原则：

**命名即意图**。`list_issues` 不是 `get_data`，不是 `fetch_github`，而是精确描述了这个工具能做什么。模型看到 `list_issues` 就知道这是列出 Issue 的工具，不需要猜测。模糊的命名会导致模型在错误场景调用工具。

**参数约束即安全边界**。`per_page` 的 `maximum: 100` 限制了一次性返回的 Issue 数量。这不是对模型能力的限制，而是对 Token 消耗的保护。如果没有这个约束，模型可能传入 `per_page: 10000`，一次性把所有 Issue 拉进上下文。

**描述即使用说明**。工具的 `description` 字段是模型理解工具行为的唯一依据。好的描述告诉模型：这个工具做什么、需要什么前置条件、返回什么格式、有什么限制。差的描述只说"获取数据"，让模型在黑暗中摸索。

**结构化响应优于原始文本**。`search_docs` 返回的是结构化的片段列表（标题 + URL + 摘要），不是把整个文档页面作为原始 HTML 返回。结构化响应让模型可以直接理解和使用数据，不需要先解析非结构化文本。

### 工具粒度：查询 vs 导出

理解工具粒度是掌握 MCP 心智模型的关键。考虑两种设计思路：

**粗粒度导出式工具**（错误方向）：

```json
{
  "name": "get_repo_data",
  "description": "获取仓库的所有数据，包括 Issue、PR、Commit、文件列表",
  "inputSchema": {
    "type": "object",
    "properties": {
      "owner": { "type": "string" },
      "repo": { "type": "string" }
    }
  }
}
```

这个工具的问题：一次调用返回的数据量不可控。一个活跃仓库可能有数千个 Issue 和 PR，全部返回会消耗大量 Token，而模型可能只需要其中 2-3 个 Issue 的信息。

**细粒度查询式工具**（正确方向）：

```json
[
  { "name": "list_issues", "支持过滤和分页" },
  { "name": "get_issue", "获取单个 Issue 详情" },
  { "name": "get_pr_diff", "获取特定 PR 的 diff" },
  { "name": "list_commits", "获取 Commit 历史" },
  { "name": "get_file_contents", "获取特定文件内容" }
]
```

细粒度工具让模型可以按需查询：先 `list_issues` 获取 Issue 列表（控制 `per_page`），再根据需要 `get_issue` 获取具体 Issue 的详情。每一步的 Token 消耗都是可控的。

这不是说工具越多越好。工具数量过多会增加系统提示词的长度（每个工具的描述都占空间），也会增加模型选择工具的难度。合理的做法是覆盖核心操作场景，每个工具的职责边界清晰，参数粒度允许精确控制返回量。

---

## 为什么"接口不是复制"很重要

### Codex 不转储整个数据库

回到核心论点：MCP 是工具接口，不是数据复制机制。Codex 不会——也不应该——通过 MCP 把外部系统的所有数据拉进上下文窗口。

考虑一个具体场景：Codex 需要了解项目中与认证相关的 Issue。如果用"数据搬运"的思路：

```text
1. 调用 get_all_issues() → 返回 2,347 个 Issue
2. 全部进入上下文窗口 → 消耗约 150,000 Token
3. 模型在上下文中搜索 "auth" → 找到 23 个相关 Issue
4. 其中只有 3 个是 Codex 真正需要的
```

如果用"工具接口"的思路：

```text
1. 调用 list_issues(labels: ["authentication"], state: "open", per_page: 10)
   → 返回 7 个匹配 Issue（约 800 Token）
2. 模型判断需要其中 3 个的详情
3. 调用 get_issue(issue_number: 142) → 约 200 Token
4. 调用 get_issue(issue_number: 89)  → 约 150 Token
5. 调用 get_issue(issue_number: 56)  → 约 180 Token
   → 总计约 1,330 Token
```

第二种方式消耗的 Token 是第一种方式的不到 1%。这不是微小的优化差异，而是两个数量级的成本差距。

### 每次 MCP 工具调用的 Token 成本结构

理解 MCP 工具调用的 Token 成本，需要拆解成本结构：

```text
单次 MCP 工具调用的 Token 消耗：

1. 系统提示词中的工具描述（固定成本）
   - 每个工具的名称、参数 schema、描述文本
   - 注册 10 个 MCP 工具约增加 2,000-5,000 Token
   - 每次请求都会发送，无论是否调用该工具

2. 工具调用的输入参数（按次成本）
   - 模型生成的参数文本
   - 通常较短，50-200 Token

3. 工具返回的响应数据（按次成本，最大变量）
   - 取决于工具的实现和参数
   - 结构化查询：100-1,000 Token
   - 列表查询：500-5,000 Token
   - 全量导出：可能超过 10,000 Token

4. 模型对响应的推理（按次成本）
   - 模型处理响应内容并决策下一步
   - 与响应数据量正相关
```

从这个成本结构可以得出两个结论：

**工具注册有固定成本**。即使你不在当前任务中调用某个 MCP 工具，它的描述仍然占据系统提示词空间。注册 20 个"也许会用到"的 MCP 工具，可能在每次请求中浪费 5,000-10,000 Token 的系统提示词空间。这就是为什么 config.toml 中应该只注册当前项目真正需要的 MCP Server。

**工具返回数据是最大变量**。一个设计良好的 MCP 工具应该让调用者（模型）能通过参数控制返回数据量。`per_page`、`limit`、`fields` 等参数不是装饰，而是 Token 成本的调节阀。

### 结构化响应优于原始文本转储

MCP 工具的返回格式直接影响模型的使用效率。对比两种返回格式：

**原始文本转储**（差）：

```text
Tool: get_issue_raw
Response (约 2,000 Token):
  {
    "id": 142,
    "node_id": "MDU6SXNzdWUxNDI=",
    "url": "https://api.github.com/repos/org/repo/issues/142",
    "repository_url": "https://api.github.com/repos/org/repo",
    "labels_url": "https://api.github.com/repos/org/repo/issues/142/labels{/name}",
    "comments_url": "https://api.github.com/repos/org/repo/issues/142/comments",
    "events_url": "https://api.github.com/repos/org/repo/issues/142/events",
    "html_url": "https://github.com/org/repo/issues/142",
    "number": 142,
    "state": "open",
    "title": "Token refresh fails when session expired",
    "body": "...(long markdown text)...",
    "user": { "login": "dev1", "id": 12345, "avatar_url": "...", ... },
    "labels": [ { "id": 1, "name": "bug", "color": "fc2929", ... }, ... ],
    "assignee": null,
    "assignees": [],
    "milestone": null,
    "locked": false,
    "active_lock_reason": null,
    "comments": 5,
    "pull_request": { "url": "...", "html_url": "...", ... },
    "closed_at": null,
    "created_at": "2026-05-20T10:30:00Z",
    "updated_at": "2026-05-25T14:20:00Z",
    ... (更多字段)
  }
```

**结构化精简响应**（好）：

```text
Tool: get_issue
Response (约 200 Token):
  {
    "number": 142,
    "title": "Token refresh fails when session expired",
    "state": "open",
    "labels": ["bug", "authentication"],
    "author": "dev1",
    "created_at": "2026-05-20",
    "comments_count": 5,
    "body_summary": "When user session expires, token refresh endpoint returns 500 instead of gracefully handling the expired session."
  }
```

两种格式传递的核心信息相同——Issue 编号、标题、状态、标签、作者、摘要。但原始格式消耗了 10 倍的 Token，多出来的部分（node_id、各种 URL、颜色代码、空数组）对模型的决策没有任何帮助。

好的 MCP 工具设计应该在服务端完成数据筛选和精简，而不是把原始 API 响应直接转储给模型。这不是偷懒省事，而是对 Token 资源的负责。

---

## 设计新 MCP Server 的正确思路

### 从问题出发，不是从数据出发

添加一个新的 MCP Server 时，最常见的错误思路是："系统 X 有哪些数据，我把它们都暴露出来。"这是数据搬运思维。

正确的思路是问两个问题：

**问题一：Codex 在执行任务时，需要向这个系统查询什么信息？**

以设计一个 Jira MCP Server 为例：

```text
Codex 可能需要查询的信息：
- 这个 sprint 有哪些待处理的 ticket？
- 某个 ticket 的详细描述和验收标准是什么？
- 哪些 ticket 被标记为阻塞状态？
- 某个 epic 下有多少未完成的 ticket？
- 最近一周有哪些 ticket 状态发生了变化？
```

**问题二：Codex 在执行任务时，需要对这个系统执行什么操作？**

```text
Codex 可能需要执行的操作：
- 创建一个新的 ticket（比如发现 bug 时自动创建）
- 更新 ticket 状态（比如 PR 合并后自动关闭）
- 添加评论（比如代码审查结果同步到 ticket）
- 关联 ticket 与 PR（建立 traceability）
```

这两个问题的答案直接决定了你需要暴露哪些工具。注意这不是"Jira 有哪些 API"的枚举，而是"Codex 的典型工作流需要什么"的推理。

### 工具设计流程

基于问题驱动的 MCP Server 设计流程：

```text
1. 枚举 Codex 与该系统的交互场景
   输出：场景列表 + 每个场景的信息需求

2. 将场景归纳为查询类和操作类
   查询类：Codex 需要获取信息（只读）
   操作类：Codex 需要改变状态（写入）

3. 为每个场景设计工具
   查询类工具：
   - 命名：动词 + 名词（list_tickets, get_ticket_detail）
   - 参数：过滤条件 + 分页控制 + 字段选择
   - 返回：结构化摘要，不是原始 API 响应

   操作类工具：
   - 命名：动词 + 名词（create_ticket, update_ticket_status）
   - 参数：必需字段 + 可选字段（减少必填项降低出错率）
   - 返回：操作结果确认（成功/失败 + 影响的资源 ID）

4. 审查工具清单
   - 是否有职责重叠的工具？合并或拆分
   - 是否缺少关键场景的工具？补充
   - 每个工具的返回量是否可控？添加 limit 参数

5. 编写工具描述
   - 描述要精确、完整、无歧义
   - 包含使用场景、参数含义、返回格式、限制条件
```

### 设计示例：内部 API 文档 MCP Server

假设你的团队有一个内部的 API 文档系统，你想让 Codex 能查询 API 定义。以下是设计过程：

**场景分析**：

```text
场景 1: Codex 需要了解某个 API 端点的请求格式
  查询：按端点路径和 HTTP 方法查找
  返回：请求参数、响应格式、状态码

场景 2: Codex 需要了解某个数据模型的定义
  查询：按模型名称查找
  返回：字段列表、类型、约束、关联关系

场景 3: Codex 需要查找所有与某个业务领域相关的 API
  查询：按标签或关键词搜索
  返回：匹配的端点列表（精简摘要）

场景 4: Codex 需要检查 API 是否有破坏性变更
  查询：对比两个版本的 API 定义
  返回：变更列表（新增/修改/删除的端点和字段）
```

**工具设计**：

```json
[
  {
    "name": "get_endpoint",
    "description": "获取指定 API 端点的完整定义，包括请求参数、响应格式、认证要求和示例。返回结构化的 API 定义，不返回原始文档页面。",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": { "type": "string", "description": "API 路径，如 /api/v1/users" },
        "method": { "type": "string", "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"] }
      },
      "required": ["path", "method"]
    }
  },
  {
    "name": "get_model",
    "description": "获取数据模型的定义，包括字段名称、类型、约束和描述。如果模型有嵌套引用，只展开一层。",
    "inputSchema": {
      "type": "object",
      "properties": {
        "name": { "type": "string", "description": "模型名称，如 User、Order" },
        "version": { "type": "string", "description": "API 版本，默认为最新" }
      },
      "required": ["name"]
    }
  },
  {
    "name": "search_apis",
    "description": "按关键词搜索 API 端点。返回匹配端点的精简列表（路径、方法、简短描述），不返回完整定义。使用 get_endpoint 获取详情。",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": { "type": "string", "description": "搜索关键词" },
        "limit": { "type": "integer", "default": 10, "maximum": 20 }
      },
      "required": ["query"]
    }
  },
  {
    "name": "diff_versions",
    "description": "对比两个 API 版本之间的差异。返回新增、修改和删除的端点列表，以及每个变更的简要说明。",
    "inputSchema": {
      "type": "object",
      "properties": {
        "from_version": { "type": "string", "description": "基准版本" },
        "to_version": { "type": "string", "description": "目标版本" },
        "endpoint_filter": { "type": "string", "description": "只检查指定路径前缀的端点" }
      },
      "required": ["from_version", "to_version"]
    }
  }
]
```

注意设计中的几个决策：

- `search_apis` 只返回摘要列表，引导模型先搜索再查询详情——两步法控制 Token 消耗
- `get_model` 限制嵌套展开层数为 1，避免一个深度嵌套的模型消耗过多 Token
- `diff_versions` 支持 `endpoint_filter` 参数，让模型可以缩小对比范围
- 每个工具的 `limit`/`maximum` 都有明确上限

---

## MCP 的局限性与成本约束

### Token 成本的三层叠加

MCP 的 Token 成本不是单点的，而是三层叠加的：

```text
第一层：工具注册成本（固定）
  - 每个 MCP Server 的每个工具都需要在系统提示词中注册
  - 包含工具名称、参数 schema、功能描述
  - 估算：每个工具约 100-300 Token
  - 10 个工具 = 1,000-3,000 Token 的固定开销
  - 每次请求都支付，无论是否调用

第二层：单次调用成本（可变）
  - 输入参数：模型生成，通常 50-200 Token
  - 响应数据：工具返回，100-10,000+ Token
  - 取决于工具设计和参数选择

第三层：推理成本（隐含）
  - 模型需要在每轮决策中考虑所有可用工具
  - 工具越多，选择的推理成本越高
  - 表现为更多的"思考"Token 消耗
  - 难以精确量化，但确实存在
```

三层叠加意味着注册 20 个 MCP 工具的 Codex 实例，即使一个 MCP 工具都没调用，也比不注册 MCP 的实例每次请求多消耗 2,000-6,000 Token。在长会话中，这个固定成本会随请求次数累积。

### 延迟：工具调用的周转时间

每次 MCP 工具调用都引入延迟。延迟的来源：

```text
模型决策调用工具          约 1-3 秒（推理时间）
    |
    v
构造调用参数              < 100ms
    |
    v
发送到 MCP Server         stdio: < 10ms, SSE: 50-500ms（网络）
    |
    v
MCP Server 处理请求       100ms - 10s（取决于外部 API）
    |
    v
返回响应                  stdio: < 10ms, SSE: 50-500ms
    |
    v
响应进入上下文窗口        < 100ms
    |
    v
模型处理响应并决策下一步  约 1-3 秒（推理时间）
    |
    v
单次 MCP 工具调用总延迟   2-15 秒
```

一个需要 5 次 MCP 工具调用的任务，仅 MCP 部分就可能消耗 10-75 秒。如果工具粒度太细（需要很多次小调用才能完成一个子任务），延迟会显著影响用户体验。

但反过来，如果工具粒度太粗（一次调用返回过多数据），虽然延迟减少了，Token 成本却增加了。工具粒度的设计需要在延迟和 Token 成本之间找平衡点。

### 错误处理：MCP 工具调用失败是常态

MCP 工具调用外部系统，外部系统随时可能失败。常见的错误场景：

```text
1. MCP Server 进程崩溃（stdio 模式）
   - Codex 会尝试重启 Server
   - 重启期间的调用会失败
   - 模型收到错误信息，需要在下一轮重试或跳过

2. 网络超时（SSE 模式）
   - 远程 MCP Server 无响应
   - Codex 有超时机制（通常 30 秒）
   - 超时后返回错误，模型决策下一步

3. 外部 API 限流
   - GitHub API 的 rate limit
   - 数据库连接池耗尽
   - 模型需要在错误信息中识别限流信号，决定等待还是跳过

4. 权限不足
   - Token 过期
   - OAuth scope 不够
   - 模型收到 403 错误，但无法自行修复权限

5. 数据格式异常
   - MCP Server 返回的数据格式与描述不符
   - 模型可能解析失败，导致后续推理出错
```

Codex 的 Agent Loop 天然具备错误恢复能力——模型收到错误信息后会在下一轮决策中调整策略。但这不意味着你可以忽略错误处理。好的 MCP 工具设计应该：

- 在错误响应中包含足够的信息让模型理解失败原因
- 区分可重试错误（超时、限流）和不可重试错误（权限不足）
- 不在错误时返回大量原始错误堆栈（浪费 Token）

### 上下文窗口压力

MCP 工具返回的数据进入 Codex 的上下文窗口。上下文窗口是有限资源：

```text
上下文窗口的竞争关系：

  系统提示词（固定）        约 3,000-5,000 Token
    - Codex 行为指令
    - 内置工具描述
    - MCP 工具描述
    - developer_instructions

  AGENTS.md（项目级）       约 2,000-10,000 Token

  对话历史（累积）          随轮次增长
    - 用户输入
    - 模型输出
    - 工具调用和返回结果

  MCP 工具返回数据（每次）  100-10,000+ Token
```

如果一个任务需要多次 MCP 工具调用，返回的数据会逐步填满上下文窗口。当上下文接近上限时，Codex 会触发自动压缩（由 `auto_compact_limit` 控制），压缩会丢失对话历史的细节。

这意味着 MCP 工具返回的数据不是免费的——它挤占了其他信息的空间。如果一次 MCP 调用返回了 5,000 Token 的数据，但模型只需要其中 500 Token 的信息，多出来的 4,500 Token 不仅浪费了调用成本，还加速了上下文压缩的触发。

---

## 从心智模型到实践原则

### 原则一：按需注册，不是全量注册

config.toml 中只注册当前项目真正需要的 MCP Server。不需要的 MCP Server 即使注释掉也比留着好——注释掉的配置不占系统提示词空间。

```toml
# 当前项目需要 GitHub 和 Context7
[mcp_servers.github]
command = "npx"
args = ["-y", "@anthropic-ai/mcp-github"]

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

# 不需要的先注释掉
# [mcp_servers.database]
# command = "npx"
# args = ["-y", "@company/mcp-database"]
```

### 原则二：工具设计从场景出发，不是从 API 出发

设计 MCP Server 时，不要枚举外部系统的 API 然后逐一暴露。而是从 Codex 的工作流出发，推理它需要哪些查询和操作，然后按需设计工具。

一个 API 丰富的外部系统可能有上百个端点，但 Codex 的典型工作流可能只需要其中 5-8 个操作。暴露 50 个工具不仅增加了系统提示词开销，还让模型在工具选择时更容易出错。

### 原则三：每个工具都应该是 Token 成本可控的

工具设计时必须有意识地控制返回数据量。具体的手段：

- 列表类工具必须有 `limit`/`per_page` 参数，且设置合理的上限
- 查询类工具应该返回结构化摘要，不是原始 API 响应
- 大型对象的嵌套引用应该限制展开深度
- 考虑提供 `fields` 参数让调用者选择需要的字段

### 原则四：工具描述是面向模型的接口文档

工具的 `description` 字段不是给人看的注释，而是给模型的接口文档。好的描述应该包含：

- 工具做什么（功能描述）
- 什么时候该用（适用场景）
- 需要什么参数（参数含义和格式）
- 返回什么格式的数据（返回结构）
- 有什么限制（速率限制、权限要求、数据范围）

差的描述让模型误用工具。好的描述让模型第一次就能正确调用。

### 原则五：两步查询优于一步导出

当不确定需要什么数据时，先调用列表/搜索类工具获取摘要，再根据摘要决定是否需要调用详情工具获取完整数据。这比一次性导出所有数据的 Token 效率高得多。

```text
两步查询模式：
  1. search_apis(query: "authentication") → 返回 5 个匹配端点的摘要
  2. get_endpoint(path: "/api/v1/auth/login", method: "POST") → 只获取需要的那个

一步导出模式：
  1. get_all_endpoints() → 返回 200 个端点的完整定义
     （其中 195 个是模型不需要的）
```

---

## 小结

MCP 的正确心智模型是"工具接口"而非"数据搬运"。这个区分不是学术性的——它直接决定了 MCP Server 的设计质量、Token 消耗水平、以及 Codex 使用外部系统的效率。

核心要点可以归纳为四条：

**MCP 暴露的是工具，不是数据。** 每个 MCP Server 通过一组命名工具与 Codex 交互。工具的粒度、命名、参数设计和返回格式，共同决定了 Codex 与外部系统的交互效率。

**模型是调用决策者。** Codex 的 Agent Loop 在每一轮推理中决定调用哪个工具、传什么参数。这个决策基于系统提示词中的工具描述和当前任务的上下文。工具描述的质量直接影响决策的准确性。

**每次调用都有精确的成本。** MCP 工具的 Token 消耗来自三个层面：工具注册的固定成本、单次调用的可变成本、以及工具数量带来的推理成本。工具设计必须有意识地控制每层成本。

**结构化查询优于批量导出。** 优先设计两步查询模式（先摘要后详情），为列表类工具设置分页参数，在服务端完成数据精简。这些不是可选的优化，而是 MCP 工程化的基本要求。

理解了这套心智模型，再配置 MCP Server、设计工具接口、排查调用问题时，你就知道该从哪个方向思考——不是"怎么把数据搬过来"，而是"Codex 需要什么样的工具来高效地与这个系统交互"。

<!-- CONTACT-START -->
<!-- Auto-generated by scripts/inject-contact.sh — 单一真实源: docs/_snippets/contact.html -->
<div align="center">

**「阿新聊 AI」同步更新，欢迎关注**

<br>

<table>
<tr>
<td align="center">📢<br><b>微信公众号</b><br>阿新聊ai</td>
<td align="center">🎵<br><b>抖音</b><br>阿新聊ai</td>
<td align="center">📕<br><b>小红书</b><br>阿新聊ai</td>
<td align="center">💬<br><b>微信</b><br>mindcarver</td>
</tr>
</table>

🌐 AI 社区 · <a href="https://91aihub.com/">91aihub.com</a>

</div>
<!-- CONTACT-END -->
