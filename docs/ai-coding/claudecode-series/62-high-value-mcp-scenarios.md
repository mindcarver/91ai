# 高价值 MCP 场景：哪些集成真正值得装

> 更新日期：2025/06

**TL;DR：** 不是所有 MCP Server 都值得装。装多了吃上下文、拖速度、还要维护 token。这篇文章只讲六个经过实战验证的高价值场景：GitHub、项目管理（Linear/Jira）、数据库、日志/监控、浏览器、设计工具。每个场景说清楚它解决什么问题、怎么配置、用的时候注意什么。读完你就能判断自己的工作流该装哪些。

## 为什么这很重要

第 61 篇讲了 MCP 的原理和配置方法。但知道"怎么装"和知道"该装什么"是两回事。

MCP Server 不是越多越好。每装一个 Server，Claude Code 的上下文里就多一份 Tool 描述。装十个 Server，每个暴露二十个 Tool，光是 Tool 定义就吃掉不少 token。而且 Server 挂了、token 过期、配置冲突——这些都是维护成本。

正确的思路是：**只装那些每天都会用到的、能显著减少上下文切换的集成。**

这篇文章按场景分类，每个场景回答三个问题：

1. 它替代了什么手动操作？
2. 配置起来麻烦吗？
3. 什么人最应该装？

## GitHub MCP：代码协作的核心

### 解决什么问题

没有 MCP 的时候，你在 Claude Code 里写完代码，还得切到浏览器去创建 PR、review 代码、回复评论。来回切换打断思路，尤其是你在 debug 一个复杂问题时，刚定位到根因，切个页面回来思路就断了。

GitHub MCP 让 Claude Code 直接操作 GitHub：创建 issue、开 PR、查看 review 评论、合并分支。你的整个开发循环——写代码、测试、提交、review——都在终端里完成。

### 配置方式

GitHub 官方提供了 MCP 端点，直接用 HTTP 传输：

```bash
claude mcp add --transport http github https://api.githubcopilot.com/mcp/ \
  --header "Authorization: Bearer $GITHUB_TOKEN"
```

`GITHUB_TOKEN` 用 fine-grained personal access token，权限按需给——只给你要操作的那些 repo 的读写权限。别用 all-repo 的老式 token，风险太大。

也可以在项目的 `.mcp.json` 里配置，方便团队共享：

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      }
    }
  }
}
```

### 实际用法

配好之后，在 Claude Code 里直接说自然语言：

- "帮我把当前分支的改动提一个 PR，标题是'修复登录超时问题'"
- "这个 PR 有几条 review 评论？逐条回复"
- "搜索 organization 里所有标记为 bug 且未分配的 issue"
- "把 feature/auth 分支合并到 main，如果有冲突帮我解决"

Claude Code 会调用对应的 MCP Tool 来完成操作，你不需要记 API。

### 注意事项

- **Token 权限要精准**：给 `repo` 级别的读写，不要给 `admin` 权限。
- **大组织的 API 限流**：GitHub API 有 rate limit，频繁搜索可能触发。Claude Code 内部会处理分页，但如果你让它"列出所有 open issue"，可能一次请求就耗光配额。
- **公开 repo 谨慎操作**：Claude Code 有能力创建 issue 和评论，操作前确认目标 repo。

## 项目管理 MCP：让需求追踪回归代码

### 解决什么问题

开发者最烦的事情之一：在 IDE 里写代码，在浏览器里看需求，在 Slack 里讨论优先级，在会议里同步进度。每个工具都在不同的地方，信息散落各处。

项目管理 MCP（Linear 或 Jira）的价值在于：你在 Claude Code 里就能查看需求详情、更新状态、添加评论。不用切窗口。

Linear 的 MCP 比较轻量，适合小团队。Jira 的 MCP 功能更全，适合用 Jira 管理流程的团队。选哪个取决于你团队在用什么——不要为了用 MCP 而迁移工具。

### Linear 配置

Linear 有官方的 MCP Server，走 stdio 传输：

```bash
claude mcp add --transport stdio \
  --env LINEAR_API_KEY=lin_api_your_key \
  linear -- npx -y mcp-server-linear
```

API Key 在 Linear 的 Settings > API 页面创建。

### Jira 配置

Jira 社区有多个 MCP 实现，比较稳定的是 `@modelcontextprotocol/server-jira`：

```bash
claude mcp add --transport stdio \
  --env JIRA_BASE_URL=https://yourorg.atlassian.net \
  --env JIRA_API_TOKEN=${JIRA_TOKEN} \
  --env JIRA_EMAIL=you@example.com \
  jira -- npx -y @modelcontextprotocol/server-jira
```

Jira 的 token 用 Atlassian 的 API token，在 account settings 里生成。

### 实际用法

- "列出我名下所有状态为 In Progress 的 Linear issue"
- "把 PROJ-142 的状态改成 Done，加一条评论说明修复方案"
- "这个 sprint 还剩多少未完成的 Jira ticket？按优先级排序"
- "创建一个新 issue：用户反馈搜索结果排序异常，优先级 High"

### 注意事项

- **只读权限足够大部分场景**：如果你只是查看需求、读评论，给只读权限就行。创建和修改状态再开写权限。
- **Jira MCP 稳定性一般**：社区维护，偶尔有连接超时。Linear 的官方 Server 更稳定。
- **别把项目管理当聊天用**：Claude Code 可以帮你操作 issue，但不适合用来管理复杂的项目流程。状态流转、权限审批这些还是要在原工具里做。

## 数据库 MCP：查询和探索数据的最短路径

### 解决什么问题

日常开发中，你需要频繁查数据库：看表结构、跑几条查询验证逻辑、检查数据是否正确。传统流程是开一个数据库客户端（pgAdmin、DBeaver、DataGrip），写 SQL，看结果，然后回到代码里改。

数据库 MCP 把这个循环缩短了：在 Claude Code 里直接问"users 表有哪些字段"、"帮我查最近 7 天的注册用户数"，Claude 生成 SQL 并执行，结果直接显示在对话里。

这不是替代你的数据库客户端——复杂的查询、数据分析、DBA 操作还是在专业工具里做。但对于日常的"看一眼数据"和"验证一下逻辑"，MCP 的效率高很多。

### PostgreSQL 配置

```bash
claude mcp add --transport stdio \
  --env DATABASE_URL=${POSTGRES_URL} \
  postgres -- npx -y @modelcontextprotocol/server-postgres
```

也可以用 `uvx`（Python 的包管理器）：

```bash
claude mcp add --transport stdio \
  postgres -- uvx mcp-server-postgres postgresql://user:pass@localhost:5432/mydb
```

### SQLite 配置

SQLite 适合本地开发和嵌入式场景：

```bash
claude mcp add --transport stdio \
  sqlite -- uvx mcp-server-sqlite --db-path /path/to/your/database.db
```

### 实际用法

- "这个项目的数据库有哪些表？显示每个表的行数"
- "users 表的 schema 是什么？和 User model 的字段对得上吗"
- "帮我写一条查询：最近 30 天活跃用户数，按天分组"
- "把这条查询的结果存到 /tmp/active-users.csv"

Claude 会读取数据库 schema，生成 SQL，执行后返回结果。它还会注意安全问题——比如不会自动执行 `DELETE` 或 `DROP`，除非你明确要求。

### 注意事项

- **连接生产库要极其谨慎**：建议只连开发库和测试库。如果必须连生产库，用只读账号。
- **连接串别硬编码**：用环境变量 `${DATABASE_URL}` 引用，不要在配置文件里写明文密码。
- **查询结果可能很大**：如果表有百万行，让 Claude `LIMIT 100`。它通常会自动加，但偶尔会忘。
- **Schema 变更不要用 MCP**：建表、改字段这种结构性操作，还是用 migration 脚本，不要让 Claude 直接 `ALTER TABLE`。

## 日志和监控 MCP：故障排查的加速器

### 解决什么问题

线上出问题时，你的工作流是：收到告警 → 打开 Grafana/Datadog → 搜索日志 → 定位报错 → 回到代码找对应逻辑 → 修复 → 验证。每一步都在不同的工具里。

日志 MCP 让 Claude Code 能直接搜索和读取日志内容。你可以把"看日志"这一步直接嵌入 Claude Code 的调试流程里：报错信息自动关联到代码位置，省去手动对照的步骤。

### 可选方案

目前没有统一的"日志 MCP"，但有几个方向：

**本地日志文件**：用 Filesystem MCP 把日志目录暴露给 Claude Code。

```bash
claude mcp add --transport stdio \
  filesystem -- npx -y @modelcontextprotocol/server-filesystem /var/log/myapp
```

**Grafana Loki**：社区有 `mcp-server-loki` 实现，可以查询 Loki 日志。

**Datadog**：社区有 `mcp-server-datadog`，可以搜索日志和指标。

这些 Server 大多是社区维护的，稳定性不如官方的 GitHub 或数据库 MCP。如果你们团队有内部日志平台，更推荐自己写一个轻量 MCP Server——几十行代码就够了。

### 实际用法

- "查一下 myapp 今天的 ERROR 级别日志，提取唯一的错误消息"
- "最近一小时的请求延迟 p99 是多少？有没有异常飙升"
- "把这些错误日志和 src/handlers/ 下的代码对照，找出出问题的函数"

### 注意事项

- **日志量大的时候要限制范围**：让 Claude 加时间范围和级别过滤，不然会拉回太多数据。
- **敏感信息**：日志里可能有用户数据、API key。确认 MCP Server 的访问范围，不要把整个 `/var/log` 都暴露出去。
- **社区 Server 的成熟度**：日志类 MCP 大多还在早期阶段，遇到问题需要自己排查。

## 浏览器 MCP：测试和自动化的瑞士军刀

### 解决什么问题

前端开发中有一类任务必须用真实浏览器：验证页面渲染效果、测试交互逻辑、截图对比、填表单提交。这类任务没法用单元测试覆盖——你需要真正的 DOM、真实的渲染、用户级别的交互。

Playwright MCP 让 Claude Code 能操控浏览器：打开页面、点击元素、填表单、截图、读取页面内容。这不是让 AI 随便上网冲浪——而是在你的开发流程中插入确定性的浏览器操作。

### 配置方式

```bash
claude mcp add --transport stdio \
  playwright -- npx -y @anthropic-ai/mcp-playwright
```

Anthropic 官方维护的 Playwright MCP，稳定性有保障。

### 实际用法

- "打开 localhost:3000，截个全页面截图"
- "在登录页测试一下：输入错误的密码，检查错误提示是否显示"
- "打开这个页面，找到导航栏，验证所有链接都能正常跳转"
- "在搜索框输入'Claude Code'，提交后检查结果列表是否为空"
- "对比一下 localhost:3000 在桌面端和移动端的渲染差异"

Claude Code 会调用 Playwright 来启动浏览器、执行操作、返回结果。你可以把它当成一个能理解自然语言的 E2E 测试工具。

### 注意事项

- **Playwright 需要安装浏览器**：第一次运行会自动下载 Chromium。确保网络通畅。
- **CI 环境里需要 headless 模式**：本地开发可以弹出浏览器窗口看效果，CI 里要设置 headless。
- **不要用来做爬虫**：Playwright MCP 的设计初衷是测试和验证，不是大规模抓取。用它爬几百个页面既慢又不靠谱。
- **交互式操作有延迟**：每次浏览器操作都是真实的网络请求和渲染，比读文件慢得多。适合验证性任务，不适合批量操作。

## 设计工具 MCP：从设计稿到代码的桥梁

### 解决什么问题

前端开发最头疼的环节之一：设计师在 Figma 里画好了页面，你要对着设计稿手写 HTML/CSS。颜色、间距、字体大小，每个数值都要从 Figma 里手动抄。改版的时候又得重新对一遍。

设计工具 MCP 让 Claude Code 能读取设计文件的结构信息：组件层级、样式属性、布局参数。不用手动量间距、抄颜色值——Claude 直接从设计稿提取信息并生成对应的代码。

### 可选方案

**Figma**：社区有多个 Figma MCP 实现，比较活跃的是 `@anthropic/mcp-figma`（Anthropic 官方）和 `figma-developer-mcp`。

```bash
claude mcp add --transport stdio \
  --env FIGMA_API_KEY=${FIGMA_TOKEN} \
  figma -- npx -y @anthropic-ai/mcp-figma
```

Figma API token 在 Figma 的 Settings > Personal access tokens 里生成。

**其他设计工具**：Sketch、Adobe XD 目前没有成熟的 MCP Server。如果团队用这些工具，可以关注社区动态，或者考虑用 Figma 的 Dev Mode 做中转。

### 实际用法

- "读取这个 Figma 文件的第一页，提取主色调和字体信息"
- "把这个 Figma 组件转成 React + Tailwind 代码"
- "对比设计稿和当前实现，找出样式不一致的地方"
- "从 Figma 文件里提取所有 design token（颜色、间距、圆角），输出为 CSS 变量"

### 注意事项

- **Figma API 有速率限制**：复杂的设计文件可能需要多次请求。让 Claude 一次只读一个页面或一个组件。
- **设计稿不一定和代码结构一一对应**：设计师的 Figma 分层可能很随意，提取出来的结构需要你二次整理。
- **只读模式就够用**：大部分场景只需要读取设计信息，不需要写回 Figma。
- **自动化程度有限**：复杂的动画、响应式断点、交互状态这些，MCP 提取不了，还得靠经验。

## 选择建议：按角色推荐

不是每个人都要装全部六个。按你的角色选：

| 角色 | 推荐安装 | 可选 |
|------|---------|------|
| 全栈开发者 | GitHub、数据库 | 浏览器、日志 |
| 前端开发者 | GitHub、浏览器、设计工具 | 数据库 |
| 后端开发者 | GitHub、数据库、日志 | 项目管理 |
| DevOps / SRE | 日志、数据库 | GitHub |
| 技术负责人 | GitHub、项目管理 | 数据库 |

**一个实用原则：先装一个，用两周，确认有价值再加下一个。** 不要一口气全装上——那样你分不清哪个有用哪个是摆设。

另外，如果你发现某个场景没有现成的 MCP Server，可以自己写一个。第 61 篇提过，MCP 的协议不复杂，一个最简 Server 用 TypeScript 写大概 50 行代码。Anthropic 提供了 `@modelcontextprotocol/sdk` 包，照着模板改就行。

## 关键要点

- **只装高频使用的 MCP**。每个 Server 都有维护成本（token 消耗、连接稳定性、凭证更新）。低频操作手动做更划算。
- **GitHub MCP 是优先级最高的**。几乎所有开发者每天都在和 GitHub 交互，减少切窗口的收益最大。
- **数据库 MCP 适合"看一眼"的场景**。复杂的查询和数据分析还是用专业工具，MCP 擅长的是快速验证和探索。
- **浏览器 MCP 的核心价值是测试**。不是爬虫，不是通用浏览器——是在开发流程中插入确定性的浏览器验证步骤。
- **设计工具 MCP 还在早期**。Figma 是目前唯一成熟的选项，适合前端团队试用，但别指望完全自动化设计转代码。
- **日志 MCP 推荐自建**。社区方案不稳定，内部日志平台写一个轻量 MCP Server 更靠谱。
- **安全性**：生产数据库用只读账号，API token 用 fine-grained 权限，连接串用环境变量引用。这些是底线。

## 延伸阅读

- [MCP Server 官方仓库](https://github.com/modelcontextprotocol/servers) — 官方维护的 Server 列表和源码
- [Playwright MCP](https://github.com/anthropics/playwright-mcp) — Anthropic 官方的浏览器自动化 Server
- [PostgreSQL MCP](https://github.com/anthropics/postgres-mcp) — Anthropic 官方的数据库 Server
- [Claude Code MCP 文档](https://docs.anthropic.com/en/docs/claude-code/mcp) — MCP 配置的完整参数参考
- 系列第 61 篇「MCP 入门」 — MCP 的原理、架构和基础配置
- 系列第 63 篇「Hooks 入门」 — 用 Hook 拦截和审计 MCP 操作

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
