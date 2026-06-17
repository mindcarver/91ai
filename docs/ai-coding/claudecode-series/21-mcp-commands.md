# MCP 命令：管理 Claude Code 的外部工具连接

> 更新日期：2025/06

**TL;DR：** `claude mcp list` 看所有 server，`claude mcp add` 加 server，`claude mcp get` 看详情，`claude mcp remove` 删 server。交互模式里 `/mcp` 看 server 状态。三种传输方式：stdio（本地进程）、http（远程 API，推荐）、sse（旧方案，逐步弃用）。MCP server 要经过审批才能用，`allowedTools` 控制哪些工具免确认。

## 为什么这很重要

第 04 篇讲过 Claude Code 不能直接访问你的数据库、GitHub、Slack。MCP（Model Context Protocol）就是解决这个问题的——让 Claude Code 连接外部服务，拿到更多上下文和操作能力。

但连接外部服务意味着权限和安全问题。你需要知道怎么加 server、怎么管 server、出了问题怎么排查。这就是本篇的内容。

## 核心概念

### MCP Server 是什么

MCP Server 是一个提供工具（tools）的服务。Claude Code 连上它之后，就能调用它提供的工具。

举个例子：你加了一个 GitHub MCP Server，Claude Code 就能读取你的 repo 列表、查看 PR 和 issue、创建分支、提交 PR。

每个 server 提供一组工具。工具的命名规则是 `mcp__{server名}__{工具名}`，比如 `mcp__github__list_prs`。

### 三种传输方式

| 传输 | 用途 | 现状 |
|------|------|------|
| stdio | 本地启动一个子进程 | 当前方案 |
| http | 连接远程 HTTP API | 当前推荐 |
| sse | 旧的远程连接方式 | 弃用中 |

http 是远程连接的推荐方式。sse 还能用，但官方已标记为弃用，新项目不要用它。

### 作用范围（Scope）

一个 MCP Server 可以加到不同范围：

| 范围 | 生效对象 | 配置位置 |
|------|---------|---------|
| local | 仅当前项目、仅你自己 | `.claude/settings.local.json` |
| project | 当前仓库所有协作者 | `.mcp.json`（仓库根目录） |
| user | 你所有项目 | 用户级设置 |

默认是 local。想让整个团队共享一个 server 配置，用 project 范围。

project 范围的配置必须放在仓库根目录的 `.mcp.json` 文件里，不是 `.claude/` 目录下，也不是 `settings.json` 里。放错位置 server 不会被加载。

### 工具审批

加了 server 不等于 Claude 可以随便调它的工具。默认情况下，每次调用工具 Claude Code 都会问你"允许吗？"。

如果你信任某个 server 的所有工具，可以在 `allowedTools` 里配置免确认：

```json
{
  "allowedTools": [
    "mcp__github__*",           // github server 所有工具免确认
    "mcp__db__query",           // 只免确认 db server 的 query 工具
    "mcp__slack__send_message"  // 只免确认 slack 的发消息工具
  ]
}
```

通配符 `*` 表示该 server 的全部工具。按需放开，不要全部免确认。

## 命令速查

| 命令 | 作用 |
|------|------|
| `claude mcp list` | 列出所有已配置的 server |
| `claude mcp get <name>` | 查看某个 server 的详细配置 |
| `claude mcp add --transport <type> <name> <url或command>` | 添加 server |
| `claude mcp add-json <name> '<json>'` | 用 JSON 配置添加 server |
| `claude mcp remove <name>` | 删除 server |
| `/mcp`（交互模式） | 查看 server 连接状态 |

## 详细用法

### 添加远程 HTTP Server

最常见的场景——连接一个云端的 MCP 服务：

```bash
# 基本语法
claude mcp add --transport http <名称> <URL>

# 连接 Stripe
claude mcp add --transport http stripe https://mcp.stripe.com

# 连接 Notion
claude mcp add --transport http notion https://mcp.notion.com/mcp

# 带认证头（GitHub 为例）
claude mcp add --transport http github https://api.githubcopilot.com/mcp/ \
  --header "Authorization: Bearer YOUR_GITHUB_PAT"

# 指定范围（project 级别，团队共享）
claude mcp add --transport http stripe --scope project https://mcp.stripe.com

# 指定范围（user 级别，所有项目通用）
claude mcp add --transport http hubspot --scope user https://mcp.hubspot.com/anthropic
```

### 添加本地 Stdio Server

本地启动一个进程作为 server：

```bash
# 基本语法
claude mcp add --transport stdio <名称> -- <命令> [参数...]

# 文件系统 server
claude mcp add --transport stdio filesystem -- \
  npx -y @modelcontextprotocol/server-filesystem /Users/me/projects

# 带环境变量
claude mcp add --transport stdio --env AIRTABLE_API_KEY=YOUR_KEY airtable -- \
  npx -y airtable-mcp-server
```

注意 `--` 分隔符。它把 MCP 命令的参数和要执行的子进程命令隔开。没有这个分隔符，参数会被 `claude mcp add` 自己解析，命令就跑不起来。

### 用 JSON 添加（复杂配置）

参数比较多，一行写不下时，用 `add-json`：

```bash
# HTTP server 带自定义头
claude mcp add-json my-server '{
  "type": "http",
  "url": "https://mcp.example.com/mcp",
  "headers": {"Authorization": "Bearer token"}
}'

# Stdio server 带环境变量和参数
claude mcp add-json local-tool '{
  "type": "stdio",
  "command": "/path/to/server",
  "args": ["--config", "prod"],
  "env": {"CACHE_DIR": "/tmp"}
}'

# 带 OAuth 凭据
claude mcp add-json my-oauth '{
  "type": "http",
  "url": "https://mcp.example.com/mcp",
  "oauth": {"clientId": "xxx", "callbackPort": 8080}
}' --client-secret
```

### 在 .mcp.json 里配置（项目级共享）

在仓库根目录创建 `.mcp.json`，所有克隆了这个仓库的人都会自动加载这些 server：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/projects"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "remote-api": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    }
  }
}
```

环境变量用 `${VAR_NAME}` 引用，Claude Code 启动时从 shell 环境里读取实际值。也支持 `${VAR_NAME:-default}` 语法，变量不存在时用默认值。这样 `.mcp.json` 可以安全提交到版本控制，每个人在自己的 shell 里设实际值。

### 查看、检查和删除

```bash
# 列出所有 server
claude mcp list

# 看某个 server 的详细配置
claude mcp get github

# 删除一个 server
claude mcp remove github
```

交互模式里输入 `/mcp`，能看到所有 server 的连接状态——是否在线、提供了哪些工具、有没有报错。

## 排错

### Server 加载不出来

最常见的坑，按顺序查：

1. **配置文件位置错了**。project 级配置必须放仓库根目录的 `.mcp.json`，不是 `.claude/settings.json`。`settings.json` 不支持 `mcpServers` 键。
2. **server 名字冲突**。两个同名的 server 只有第一个会加载。`claude mcp list` 看看有没有重复。
3. **环境变量没设**。配置里引用了 `${GITHUB_TOKEN}` 但 shell 里没有这个变量，server 启动不了。
4. **网络问题**。远程 server 连不上。`/mcp` 看状态是不是报错。手动 `curl` 一下 URL 确认能不能通。
5. **stdio server 的命令不存在**。比如 `npx -y some-package` 但 package 名写错了，或者 npm registry 访问不了。
6. **认证 token 过期**。Bearer token 或 OAuth 凭据失效，server 拒绝连接。

### 工具调不了

Server 显示在线，但 Claude 不调用它的工具：

1. **没有审批**。检查 `allowedTools` 里有没有包含这个 server 的工具。如果你拒绝了审批弹窗，工具不会被调用。
2. **工具名写错了**。工具名格式是 `mcp__{server}__{tool}`，注意是双下划线。

### 调试模式

启动时加 `--debug` 标志，输出更详细的 server 加载日志：

```bash
claude --debug
```

stderr 里会输出 MCP server 的初始化过程、连接状态、注册的工具列表。也可以只看 MCP 相关日志：

```bash
claude --debug "mcp"
```

### 隔离测试

怀疑是某个 server 配置冲突，用干净环境排除干扰：

```bash
mkdir -p /tmp/claude-clean
cd /tmp/claude-clean
CLAUDE_CONFIG_DIR=/tmp/claude-clean claude
```

这样启动不带任何 MCP 配置。确认能正常工作后，再逐个加回 server 定位问题。

### 企业管理

企业管理员可以在 managed settings 里强制指定允许的 server：

```json
{
  "allowManagedMcpServersOnly": true,
  "allowedMcpServers": [
    { "serverUrl": "https://api.githubcopilot.com/*" },
    { "serverUrl": "https://*.internal.example.com/*" }
  ]
}
```

开了 `allowManagedMcpServersOnly` 之后，用户自己加的 server 会被忽略，只加载管理员白名单里的。

## 关键要点

- `claude mcp add/remove/list/get` 四个命令覆盖日常操作，`/mcp` 在交互模式里看状态。
- 三种传输方式：stdio（本地进程）、http（远程 API，推荐）、sse（旧方案，弃用中）。
- project 级配置放 `.mcp.json`（仓库根目录），不是 `.claude/` 下。
- `allowedTools` 控制免确认范围，用 `mcp__servername__*` 通配。
- 排错三板斧：检查配置文件位置、检查环境变量、`--debug` 看日志。

## 延伸阅读

- [第 61 篇：MCP 入门](61-mcp-getting-started.md) -- MCP 的概念和第一个 server 配置
- [第 62 篇：高价值 MCP 场景](62-high-value-mcp-scenarios.md) -- 实际工作中 MCP 的典型用法
- [第 22 篇：Plugin 命令](22-plugin-commands.md) -- Plugin 也可以打包 MCP Server
- [Claude Code 官方 MCP 文档](https://code.claude.com/docs/en/mcp) -- MCP 的完整配置参考

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
