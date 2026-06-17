# GitHub MCP 与文档 MCP：Issue、PR 和实时文档检索

**TL;DR：** GitHub MCP 和 Context7 是 Codex 工程化中优先级最高的两个 MCP 集成。前者让模型直接操作 Issue、PR 和代码搜索，消除了在终端和浏览器之间反复切换的低效循环；后者提供版本精确的实时文档，解决模型训练数据对快速迭代库的过时问题。Figma MCP 补充了设计到代码的链路。三个 MCP 服务器的配置、Token 成本控制和工作流组合策略是本文的核心内容。

---

## 为什么 GitHub 和文档是最先接入的两个 MCP

Codex 默认只能操作本地文件和 shell 命令。但工程师的日常工作大量发生在 GitHub 上——查看 Issue、审查 PR、搜索代码、追踪 CI 状态。没有 GitHub MCP，这些操作只能靠人工在浏览器中完成，然后把结果复制粘贴给 Codex。这不是效率问题，是流程断裂问题：模型无法自主获取完整的任务上下文。

文档 MCP 解决的是另一个问题。Codex 的知识来自训练数据，而训练数据有截止日期。对于快速迭代的库（如 Next.js、React Router、Tailwind CSS），API 和最佳实践可能在几个月内发生根本性变化。模型使用过时的 API 生成代码，运行时才暴露错误，调试成本远高于提前查文档的成本。Context7 通过实时检索官方文档，把"模型以为的 API"校准为"实际可用的 API"。

两者的优先级高于其他 MCP 服务器（数据库、监控、部署），原因是：

1. **使用频率最高**：几乎每个编码任务都需要查文档，多数协作任务涉及 GitHub
2. **数据来源稳定**：GitHub API 和开源文档都有成熟的访问接口
3. **Token 成本可控**：单次调用的返回量可以通过参数限制
4. **安装配置简单**：不依赖内部基础设施，npm 包即装即用

---

## GitHub MCP Server

GitHub 现在提供官方的 MCP Server（`github/github-mcp-server`），替代了早期社区维护的 `@modelcontextprotocol/server-github`。官方版本用 Go 编写，支持 Docker 部署和本地二进制两种运行模式，工具覆盖范围更广，维护也更积极。

### 安装和 config.toml 配置

GitHub MCP Server 支持两种部署方式：Docker 容器和本地二进制。

Docker 方式（推荐）：

```toml
# .codex/config.toml

[mcp_servers.github]
command = "docker"
args = [
  "run", "-i", "--rm",
  "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
  "ghcr.io/github/github-mcp-server"
]
env = { GITHUB_PERSONAL_ACCESS_TOKEN = "" }
```

本地二进制方式（不需要 Docker）：

```toml
# .codex/config.toml

[mcp_servers.github]
command = "/path/to/github-mcp-server"
args = ["stdio"]
env = { GITHUB_PERSONAL_ACCESS_TOKEN = "" }
```

`GITHUB_PERSONAL_ACCESS_TOKEN` 环境变量是认证的唯一方式。Token 不应该硬编码在 config.toml 中。正确的做法是将 Token 存储在 shell 环境变量中，让 Codex 在启动 MCP 进程时自动注入：

```bash
# 在 ~/.zshrc 或 ~/.bashrc 中设置
export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
```

`env = { GITHUB_PERSONAL_ACCESS_TOKEN = "" }` 中的空字符串含义是"从运行时环境中读取同名的环境变量"。这是 Codex 的 MCP 环境变量传递机制，不是配置错误。

### Token 权限控制

GitHub Personal Access Token 的 scope 决定了 MCP 工具能执行哪些操作。最小权限原则在这里同样适用：

| 使用场景 | 需要的 Scope | 说明 |
|---------|-------------|------|
| 读取公开仓库代码 | `public_repo` | 只读访问公开仓库 |
| 读取私有仓库代码 | `repo` | 完整的仓库读取权限 |
| Issue 和 PR 操作 | `repo` | 创建、更新、评论 |
| GitHub Actions | `repo` | 查看 CI 状态和日志 |
| 安全扫描结果 | `security_events` | Code scanning 和 Dependabot |
| 组织团队信息 | `read:org` | 团队成员和权限查询 |
| 通知管理 | `notifications` | 读取和管理通知 |

建议使用 Fine-grained Personal Access Token（细粒度令牌），可以限制到特定仓库和特定权限，比 Classic Token 的安全范围更精确。

### Toolset 机制

GitHub MCP Server 引入了 Toolset 概念，允许按功能组启用或禁用工具。这不仅仅是功能开关，更是控制上下文窗口消耗的关键机制——每个工具的名称和描述都会占用系统提示词的 Token。

```toml
# 只启用需要的 toolset，减少工具发现开销
[mcp_servers.github]
command = "docker"
args = [
  "run", "-i", "--rm",
  "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
  "-e", "GITHUB_TOOLSETS=repos,issues,pull_requests",
  "ghcr.io/github/github-mcp-server"
]
env = { GITHUB_PERSONAL_ACCESS_TOKEN = "" }
```

默认启用的 toolset 包括 `context`、`repos`、`issues`、`pull_requests` 和 `users`。如果不需要 Issue 和 PR 的写入能力，可以进一步用 `--read-only` 标志限制为只读模式：

```toml
# 只读模式：安全审计场景
[mcp_servers.github-readonly]
command = "docker"
args = [
  "run", "-i", "--rm",
  "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
  "-e", "GITHUB_READ_ONLY=1",
  "ghcr.io/github/github-mcp-server"
]
env = { GITHUB_PERSONAL_ACCESS_TOKEN = "" }
```

### 核心工具详解

GitHub MCP Server 提供的工具按 toolset 分组。以下是最常用的工具及其适用场景：

**Issue 相关工具**

| 工具名 | 功能 | 典型用途 |
|--------|------|---------|
| `list_issues` | 列出仓库的 Issue，支持按状态、标签、时间过滤 | Issue 分诊、待办列表 |
| `issue_read` | 读取 Issue 详情（`method: get`）、评论（`get_comments`）、子 Issue（`get_sub_issues`） | 理解 Issue 上下文 |
| `issue_write` | 创建或更新 Issue | 自动创建 Issue |
| `search_issues` | 跨仓库搜索 Issue | 关联问题查找 |
| `add_issue_comment` | 在 Issue 下添加评论 | 反馈调查结果 |

`issue_read` 是一个多功能工具，通过 `method` 参数区分不同操作。获取 Issue 详情用 `get`，获取评论用 `get_comments`，获取标签用 `get_labels`。这种设计减少了工具数量，但需要模型正确选择 method 参数。

**Pull Request 相关工具**

| 工具名 | 功能 | 典型用途 |
|--------|------|---------|
| `list_pull_requests` | 列出仓库的 PR，支持按状态、分支过滤 | PR 列表概览 |
| `pull_request_read` | 读取 PR 详情（`get`）、diff（`get_diff`）、CI 状态（`get_status`）、文件列表（`get_files`）、审查评论（`get_review_comments`）、审查记录（`get_reviews`） | PR 审查的核心工具 |
| `pull_request_review_write` | 创建、提交审查；解决审查线程 | 提交审查结果 |
| `create_pull_request` | 创建新 PR | 自动创建 PR |
| `search_pull_requests` | 跨仓库搜索 PR | 关联 PR 查找 |
| `merge_pull_request` | 合并 PR | 自动合并低风险 PR |

`pull_request_read` 是 Token 消耗最大的工具之一，尤其是 `get_diff` 方法。一个修改了 50 个文件的大型 PR，diff 内容可能达到数万 Token。使用时需要注意控制范围：

```text
# 差：获取整个 PR 的 diff（可能巨大）
pull_request_read(method="get_diff", owner="org", repo="repo", pullNumber=123)

# 好：先获取文件列表，再选择性地查看关键文件的 diff
pull_request_read(method="get_files", owner="org", repo="repo", pullNumber=123)
# 根据文件列表判断哪些文件需要深入审查
pull_request_read(method="get_diff", owner="org", repo="repo", pullNumber=123)
# 或者直接获取特定文件的完整内容
get_file_contents(owner="org", repo="repo", path="src/auth/login.ts")
```

**仓库和代码搜索工具**

| 工具名 | 功能 | 典型用途 |
|--------|------|---------|
| `get_file_contents` | 获取文件或目录内容 | 查看源码 |
| `search_code` | 跨仓库代码搜索（支持 GitHub 搜索语法） | 查找实现模式、API 使用示例 |
| `search_repositories` | 搜索仓库 | 项目调研 |
| `get_repository_tree` | 获取仓库目录树 | 了解项目结构 |
| `list_commits` | 列出分支的提交历史 | 追踪变更 |

`search_code` 是一个被低估的工具。它支持 GitHub 的完整搜索语法，可以执行跨仓库的代码模式搜索：

```text
# 在组织中搜索所有使用已废弃 API 的代码
search_code(query="deprecated_func language:typescript org:mycompany")

# 查找特定文件的引用
search_code(query="import.*auth/login repo:myorg/myrepo")

# 搜索特定错误模式的处理方式
search_code(query="catch.*TimeoutError language:go")
```

### 常见工作流

**工作流一：PR Review**

这是 GitHub MCP 最高频的使用场景。模型通过 MCP 获取 PR 的完整上下文，执行结构化的审查流程。

```text
步骤 1: pull_request_read(method="get")
  获取 PR 标题、描述、变更范围

步骤 2: pull_request_read(method="get_files")
  获取变更文件列表，判断审查优先级

步骤 3: pull_request_read(method="get_diff")
  获取关键文件的 diff（注意 Token 消耗）

步骤 4: get_file_contents（对关键文件获取完整上下文）
  diff 只显示变更部分，完整文件有助于理解上下文

步骤 5: pull_request_read(method="get_status")
  检查 CI 是否通过

步骤 6: pull_request_read(method="get_review_comments")
  查看已有的审查评论，避免重复

步骤 7: pull_request_review_write(method="create")
  提交审查意见
```

一次完整的 PR Review 可能消耗 10,000-30,000 Token，取决于 PR 的大小。对于超大 PR（100+ 文件），建议分批审查，或只审查架构层面的变更文件。

**工作流二：Issue 分诊**

每天早晨用 Codex 扫描新 Issue，自动分类和初步分析：

```text
步骤 1: list_issues(state="open", since="2026-05-25")
  获取最近创建的 Issue

步骤 2: 对每个 Issue 调用 issue_read(method="get")
  读取完整内容和标签

步骤 3: issue_read(method="get_comments")
  查看已有讨论

步骤 4: 基于内容自动判断：
  - Bug 报告 / 功能请求 / 文档问题
  - 优先级评估（P0-P3）
  - 涉及的模块

步骤 5: issue_write(method="update", labels=["bug", "P2"])
  添加标签和初步分析评论
```

**工作流三：跨仓库代码搜索**

当需要了解一个 API 在多个微服务中的使用方式时：

```text
search_code(query="UserService.GetProfile language:go org:myorg")

# 返回结果包含每个匹配的文件路径和代码片段
# 模型可以分析调用模式、参数传递方式和错误处理策略
```

### Token 成本控制

GitHub MCP 的 Token 消耗集中在三个环节：

1. **工具描述**：每个工具的名称和参数定义占用系统提示词空间。GitHub MCP 注册的默认工具约 20 个，工具描述约消耗 3,000-5,000 Token。通过 `GITHUB_TOOLSETS` 环境变量只启用需要的 toolset 可以减少这部分开销。

2. **API 返回数据**：GitHub API 返回的 JSON 数据包含大量元信息（URL、ID、时间戳、用户信息等），这些信息大部分不是模型做判断所需要的。MCP Server 会对返回数据进行一定程度的精简，但大型 PR 的 diff 仍然可能产生大量 Token。

3. **多轮对话累积**：一个复杂工作流（如完整的 PR Review）需要调用 5-8 次工具，每次返回的结果都累积在上下文窗口中。在 128K Token 的上下文窗口中，一次完整的审查会话可能消耗 10%-20% 的窗口空间。

控制策略：

| 策略 | 效果 | 适用场景 |
|------|------|---------|
| 限制 toolset | 减少 2,000-3,000 Token 的系统提示词开销 | 只需要特定功能的场景 |
| 只读模式 | 移除所有写入工具的描述 | 审查和分析场景 |
| 分批审查 | 单次只处理部分文件 | 大型 PR |
| 使用 `get_files` 代替 `get_diff` | 只获取文件列表而非完整 diff | 初步评估阶段 |
| 设置 `perPage` 参数 | 控制列表类工具的返回数量 | Issue 列表、评论列表 |

---

## Context7 MCP：实时文档检索

### Context7 解决什么问题

Codex 的代码生成质量很大程度上依赖于它对所用库和框架的了解程度。这种了解来自训练数据。问题是，训练数据是静止的，而库和框架在持续更新。

具体表现为：

- **API 签名变化**：库升级后函数参数可能改变，模型仍然按旧签名生成代码
- **废弃警告**：旧 API 被标记为废弃但仍然可用，模型会继续使用它们
- **新功能缺失**：新版本引入的更优 API 不在训练数据中，模型无法利用
- **配置语法变化**：构建工具和框架的配置格式在版本间可能不兼容

以 Next.js 为例，从 App Router 引入（13.x）到 Server Actions 稳定（14.x）再到 Turbopack 默认启用（15.x），API 和最佳实践在每个次版本都有显著变化。Codex 如果没有实时文档，很可能生成 12.x Pages Router 风格的代码。

Context7 的核心功能是在模型推理时实时查询库的官方文档。它维护了一个文档索引，覆盖主流库和框架，并跟踪版本变化。模型通过两步调用来获取文档：先解析库的名称为 Context7 的内部 ID，再根据 ID 获取文档内容。

### 安装和 config.toml 配置

```toml
# .codex/config.toml

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
```

Context7 不需要认证 Token。它通过 Upstash 的公开 API 提供文档检索服务，免费使用，但有速率限制。对于团队级的高频使用，可能需要关注其用量策略。

### 核心工具

Context7 提供两个核心工具，必须按顺序调用：

**`resolve-library-id`**

将用户提供的库名称解析为 Context7 内部的库 ID。这一步是必需的，因为同一个库可能有多个注册名称和版本变体。

```text
resolve-library-id(query="Next.js App Router")
# 返回：
# {
#   "libraryId": "/vercel/next.js",
#   "name": "Next.js",
#   "description": "The React Framework for the Web"
# }
```

`query` 参数应该包含尽可能多的上下文信息。只传 "next" 会得到模糊的匹配结果，传 "Next.js App Router server components" 能得到更精确的定位。

**`get-library-docs`**

根据解析出的库 ID 获取文档内容。支持按主题过滤。

```text
get-library-docs(
  libraryId="/vercel/next.js",
  topic="server actions"
)
# 返回 Server Actions 的官方文档片段，包含代码示例和注意事项
```

`topic` 参数是可选的，但不传会导致返回大量通用文档。明确指定 topic 可以显著减少返回量，降低 Token 消耗。

### 什么时候使用 Context7

Context7 不是每次编码都需要的。以下场景是它的主要使用时机：

**场景一：框架特定的 API 查询**

当你不确定某个框架 API 的精确签名或行为时：

```text
# 用户任务：在 Next.js 中实现一个 Server Action
# 模型判断：需要确认 Server Actions 的最新语法
# 调用 Context7：resolve-library-id("Next.js") → get-library-docs("/vercel/next.js", "server actions")
# 结果：获取最新的 Server Actions 文档，确认语法和约束
```

**场景二：版本特定的行为确认**

当你知道某个功能在不同版本间有行为差异时：

```text
# 用户任务：使用 React 19 的 use() hook
# 模型判断：use() hook 是 React 19 新增的，训练数据可能不完整
# 调用 Context7：resolve-library-id("React") → get-library-docs("/facebook/react", "use hook")
# 结果：确认 use() 的精确用法和限制
```

**场景三：配置语法确认**

构建工具的配置语法经常变化，Context7 可以快速验证：

```text
# 用户任务：配置 Vite 的 SSR 选项
# 模型判断：Vite 配置在不同版本间有调整
# 调用 Context7：resolve-library-id("Vite") → get-library-docs("/vitejs/vite", "ssr config")
# 结果：获取当前版本的 SSR 配置文档
```

### Context7 的局限性

Context7 不是万能的文档解决方案。它的局限性包括：

- **覆盖范围**：只索引了主流库和框架。小众库或内部库不在覆盖范围内
- **文档质量**：返回的是官方文档的片段，不包含社区经验、踩坑记录和最佳实践
- **实时性**：文档更新有延迟，通常在库发布新版本后的几天内同步
- **Token 消耗**：返回的文档片段可能较长，需要控制 topic 参数的精度

对于 Context7 覆盖不到的库，可以退回到 `web_search = "live"` 模式，通过 Codex 的内置搜索获取最新信息。

---

## Figma MCP：设计到代码的桥接

### Figma MCP 的定位

Figma MCP 的核心价值是将设计稿的结构化元数据暴露给模型——组件层级、设计 Token（颜色、间距、排版）、布局约束、组件映射关系。这些信息比截图更精确，比手动标注更高效。

Figma MCP 提供两种部署模式：

- **Desktop MCP Server**：本地运行，直接与 Figma Desktop App 通信。支持选中元素后实时获取上下文
- **Remote MCP Server**：通过 HTTP 端点 `https://mcp.figma.com/mcp` 访问，需要 OAuth 认证

### 安装和配置

Remote MCP Server 配置：

```toml
# .codex/config.toml

[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
bearer_token_env_var = "FIGMA_OAUTH_TOKEN"
```

Desktop MCP Server 配置（需要 Figma Desktop App 运行）：

```toml
# .codex/config.toml

[mcp_servers.figma]
command = "npx"
args = ["-y", "@anthropic-ai/mcp-figma"]
```

认证方式取决于部署模式。Remote 模式需要 OAuth token，通过 `FIGMA_OAUTH_TOKEN` 环境变量传递。Desktop 模式通过本地 IPC 与 Figma App 通信，不需要额外认证。

### 核心工具

Figma MCP 提供的工具围绕"设计上下文获取"和"设计到代码映射"两个核心场景：

**设计上下文获取**

| 工具名 | 功能 | 适用场景 |
|--------|------|---------|
| `get_metadata` | 获取选中元素的稀疏 XML 表示（ID、名称、类型、位置、大小） | 大型设计稿的初步探索 |
| `get_design_context` | 获取图层或选区的详细设计上下文，默认输出 React + Tailwind | 设计到代码的核心工具 |
| `get_variable_defs` | 获取选区中使用的变量和样式（颜色、间距、排版） | 提取设计 Token |
| `get_screenshot` | 对选区截图 | 保留视觉布局参考 |
| `get_code_connect_map` | 获取 Figma 组件到代码组件的映射关系 | 组件复用 |

**设计系统交互**

| 工具名 | 功能 | 适用场景 |
|--------|------|---------|
| `search_design_system` | 在设计库中搜索匹配的组件、变量和样式 | 查找可复用的设计元素 |
| `get_libraries` | 获取当前文件关联的设计库 | 了解可用的设计系统 |
| `add_code_connect_map` | 添加 Figma 节点到代码组件的映射 | 建立设计到代码的对应关系 |

### 典型工作流

**设计 Token 提取**

```text
步骤 1: get_metadata()
  获取设计稿的页面结构

步骤 2: get_variable_defs()
  提取使用的颜色、间距、排版变量

步骤 3: 将变量转换为代码中的 design token 定义
  # 生成 CSS 变量或 Tailwind 配置
```

**组件代码生成**

```text
步骤 1: get_metadata()
  了解组件层级结构

步骤 2: get_design_context()
  获取选中组件的详细设计信息

步骤 3: get_code_connect_map()
  检查是否有已映射的代码组件

步骤 4: get_variable_defs()
  获取使用的 Token 值

步骤 5: 基于以上信息生成组件代码
  # 使用精确的 Token 值而非近似值
```

### Figma MCP 的实际使用建议

Figma MCP 的 Token 消耗通常高于其他 MCP 服务器。`get_design_context` 返回的 XML/JSON 结构可能非常详细，一个复杂组件的设计上下文可能消耗数千 Token。建议的使用策略：

1. **先用 `get_metadata` 做初步探索**，只获取名称和位置，避免一次性拉取所有细节
2. **对需要深入的特定组件调用 `get_design_context`**，而不是对整个页面
3. **利用 `get_code_connect_map` 复用已有组件**，减少从零生成代码的量
4. **关闭 `get_screenshot`**（如果 Token 预算紧张），截图的视觉信息可以由结构化数据替代

---

## 多 MCP 服务器组合策略

### 优先级排序

当项目中同时配置了多个 MCP 服务器时，需要明确优先级，避免模型在工具选择上产生混乱：

| 优先级 | MCP 服务器 | 理由 |
|--------|-----------|------|
| 1 | GitHub | 覆盖最广的日常操作：代码、Issue、PR、CI |
| 2 | Context7 | 解决 API 过时问题，按需使用 |
| 3 | Figma | 特定场景（设计到代码），不是每次都需要 |

### Token 预算分配

在 128K Token 的上下文窗口中，MCP 相关的 Token 消耗需要预留空间：

| 消耗项 | 估计 Token 量 | 说明 |
|--------|-------------|------|
| 系统提示词（基础） | 2,000-3,000 | Codex 内置的工具定义和指令 |
| MCP 工具描述 | 每个服务器 2,000-5,000 | 所有注册工具的名称、参数和描述 |
| AGENTS.md | 1,000-5,000 | 项目上下文（受 `project_doc_max_bytes` 限制） |
| 对话历史 | 随轮次累积 | 之前的工具调用和结果 |
| 模型推理空间 | 至少 4,000-8,000 | 模型生成回复需要的空间 |

三个 MCP 服务器全部注册时，仅工具描述就可能消耗 10,000-15,000 Token，加上 AGENTS.md 和基础系统提示词，固定开销约为 15,000-25,000 Token。在 128K 窗口中约占 12%-20%。剩余空间用于对话历史和工具返回数据。

**预算控制策略**：

1. **按项目类型选择性注册**：后端项目不需要 Figma MCP，设计系统项目可能三个都需要
2. **利用 config.toml 的分层机制**：用户级配置注册所有 MCP，项目级配置按需覆盖或禁用
3. **利用 GitHub 的 toolset 机制**：只启用当前项目需要的 toolset
4. **监控实际消耗**：如果会话频繁触发 auto_compact，说明 MCP 返回数据量过大

### 工具发现开销管理

每个 MCP 服务器在 Codex 启动时会经过一个发现阶段：Codex 启动 MCP 进程，获取其提供的工具列表。这个过程有两个开销：

1. **启动时间**：每个 MCP 进程的初始化需要时间。三个 MCP 服务器可能增加 5-15 秒的启动延迟
2. **系统提示词空间**：每个工具的描述都进入系统提示词

管理方式：

```toml
# 方式一：通过 Profile 控制哪些 MCP 被激活
[profiles.frontend]
# 前端 Profile 需要 Figma
[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
bearer_token_env_var = "FIGMA_OAUTH_TOKEN"

[profiles.backend]
# 后端 Profile 不需要 Figma，不配置即可
# 只配置 GitHub 和 Context7
[mcp_servers.github]
command = "docker"
args = ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN", "ghcr.io/github/github-mcp-server"]
env = { GITHUB_PERSONAL_ACCESS_TOKEN = "" }

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
```

不过要注意，Codex 的 Profile 机制目前不支持选择性启用 MCP 服务器。Profile 切换的是模型和沙箱等行为参数，MCP 配置是全局的。如果需要按项目控制 MCP 注册，应该在不同项目的 `.codex/config.toml` 中分别配置。

### 多 MCP 协作的工作流

三个 MCP 服务器组合使用的典型工作流：

**工作流：根据 Figma 设计实现新页面，创建 PR，并确保代码符合最新 API**

```text
阶段一：获取设计规范
  1. figma.get_metadata() → 了解页面结构
  2. figma.get_design_context() → 获取组件细节
  3. figma.get_variable_defs() → 提取设计 Token

阶段二：确认框架 API
  4. context7.resolve-library-id(query="Next.js App Router")
  5. context7.get-library-docs(libraryId="/vercel/next.js", topic="page routing")
  → 确认路由配置的最新写法

阶段三：代码实现（Codex 内置工具）
  6. apply_patch → 创建页面组件文件
  7. apply_patch → 创建样式文件
  8. shell_command("pnpm test") → 运行测试

阶段四：提交和审查
  9. github.create_pull_request() → 创建 PR
  10. github.pull_request_read(method="get_diff") → 验证 PR 内容
```

这个工作流涉及三个 MCP 服务器，但不是每个阶段都同时使用所有服务器。阶段一和阶段二可以并行执行（设计获取和文档查询互不依赖），阶段三和阶段四是串行的。

---

## 完整 config.toml 示例

以下是一个配置了三个 MCP 服务器的完整项目级 config.toml：

```toml
# .codex/config.toml
# 项目：my-saas-app
# MCP 集成：GitHub + Context7 + Figma

## -- 模型 --

model = "gpt-5.2-codex"

## -- 项目文档 --

project_doc_fallback_filenames = ["CONTRIBUTING.md"]
project_doc_max_bytes = 32768

## -- 搜索 --

web_search = "cached"

## -- 上下文管理 --

# MCP 返回数据会占用上下文空间，适当调高压缩阈值
auto_compact_limit = 100000

## -- 安全 --

sandbox_mode = "workspace-write"
approval_mode = "auto-edit"

## -- MCP 服务器 --

# GitHub MCP：使用官方 Docker 镜像
# 只启用 repos、issues、pull_requests 三个 toolset
# 减少工具描述对系统提示词的占用
[mcp_servers.github]
command = "docker"
args = [
  "run", "-i", "--rm",
  "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
  "-e", "GITHUB_TOOLSETS=repos,issues,pull_requests",
  "ghcr.io/github/github-mcp-server"
]
env = { GITHUB_PERSONAL_ACCESS_TOKEN = "" }

# Context7：实时文档检索
# 无需认证，npm 包即装即用
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

# Figma：设计到代码（仅前端项目需要）
# Remote 模式需要 OAuth Token
[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
bearer_token_env_var = "FIGMA_OAUTH_TOKEN"

## -- Profile 预设 --

[profiles.dev]
model = "o4-mini"
approval_mode = "auto-edit"

[profiles.review]
model = "o3"
sandbox_mode = "read-only"
developer_instructions = "只做分析和报告，不修改任何文件。"

[profiles.design]
model = "gpt-5.2-codex"
developer_instructions = "基于 Figma 设计稿生成代码。优先使用设计系统中已有的组件。"
```

### 环境变量设置

```bash
# ~/.zshrc 或 ~/.bashrc

# GitHub Personal Access Token
# Fine-grained token，限制到特定仓库
# Scope: repo, read:org
export GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx

# Figma OAuth Token（仅前端开发者需要）
export FIGMA_OAUTH_TOKEN=figd_xxxxxxxxxxxxxxxxxxxx

# 验证环境变量是否设置
echo "GitHub: ${GITHUB_PERSONAL_ACCESS_TOKEN:0:10}..."
echo "Figma: ${FIGMA_OAUTH_TOKEN:0:10}..."
```

### 验证 MCP 服务是否正常

```bash
# 验证 GitHub MCP
docker run -i --rm \
  -e GITHUB_PERSONAL_ACCESS_TOKEN=$GITHUB_PERSONAL_ACCESS_TOKEN \
  ghcr.io/github/github-mcp-server tool-search "issue" --max-results 3
# 如果返回工具列表，说明 GitHub MCP 配置正确

# 验证 Context7 MCP
npx -y @upstash/context7-mcp
# 如果没有报错并启动了进程，说明 Context7 配置正确

# 验证 Figma MCP（Remote 模式）
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $FIGMA_OAUTH_TOKEN" \
  https://mcp.figma.com/mcp
# 如果返回 200 或 405（方法不允许），说明连接正常
```

---

## 小结

GitHub MCP 和 Context7 是 Codex 工程化的基础设施级集成。GitHub MCP 让模型从"只能操作本地文件"升级为"能参与完整的 GitHub 协作流程"——读 Issue、审查 PR、搜索代码、检查 CI。Context7 让模型从"依赖可能过时的训练知识"升级为"能查询版本精确的官方文档"。Figma MCP 补充了设计到代码的链路，把设计 Token 和组件结构作为精确输入而非视觉猜测。

三个 MCP 服务器的共同管理原则是：最小注册、按需调用、控制返回量。注册的工具越少，系统提示词的固定开销越低；调用的精度越高，Token 浪费越少；返回数据的大小直接影响上下文窗口的使用寿命。

config.toml 中 MCP 配置的分层机制允许团队在项目级统一配置，个人在用户级覆盖偏好。GitHub 的 toolset 机制和只读模式提供了更细粒度的控制。合理的配置组合不是一次性决定的，而是在实际使用中根据 Token 消耗和工作流效率持续调整的结果。

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
