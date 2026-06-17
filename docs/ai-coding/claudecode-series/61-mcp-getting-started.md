# MCP 入门：让 Claude Code 连接外部工具和数据

> 更新日期：2025/06

**TL;DR：** MCP（Model Context Protocol）是 Anthropic 推出的一个开放协议，用来让 Claude Code 连接外部工具。你装一个 MCP Server，Claude Code 就能操作 GitHub、查数据库、读 Notion——不用改 Claude Code 本身，也不用写胶水代码。配置方式是 `claude mcp add` 命令或项目根目录的 `.mcp.json` 文件。

## MCP 是什么

MCP 全称 Model Context Protocol，是 Anthropic 在 2024 年底发布的开放标准。解决的问题很简单：AI 模型被锁在自己的"笼子"里，没法直接操作你日常用的工具和数据。

没有 MCP 的时候，你想让 Claude Code 操作 GitHub，你得自己写脚本或者手动复制粘贴。有了 MCP，你装一个 GitHub 的 MCP Server，Claude Code 就能直接创建 issue、查看 PR、合并分支——像一个人坐在电脑前操作浏览器一样。

一个类比：你的电脑有 USB 接口，插键盘、鼠标、U 盘都能用，不需要为每个设备写驱动。MCP 就是 Claude Code 的"USB 接口"，MCP Server 就是"设备"。协议是标准化的，设备可以由任何人开发。

## MCP 的核心概念

### 三层架构

MCP 的架构分三层：

- **Host（宿主）**：Claude Code 本身。它是发起连接的一方，负责管理多个 MCP Client。
- **Client（客户端）**：Host 内部的组件，每个 Client 对应一个 Server，负责建立连接和翻译消息。
- **Server（服务器）**：提供具体能力的程序。可以是你本机上的一个进程，也可以是远程的一个 HTTP 服务。

它们之间用 JSON-RPC 2.0 协议通信。这个协议本身不复杂——就是发一个 JSON 请求，收到一个 JSON 响应。

### Server 暴露的三类能力

一个 MCP Server 可以暴露三种东西：

| 类型 | 作用 | 例子 |
|------|------|------|
| **Tools** | 可执行的函数，Claude 可以调用 | `search_issues`、`create_pr`、`query_database` |
| **Resources** | 数据源，Claude 可以读取 | 数据库表结构、API 文档、文件内容 |
| **Prompts** | 预设的 prompt 模板 | "帮我 review 这个 PR"的完整指令 |

实际使用中，Tools 是你接触最多的。Claude Code 发现一个 Server 有哪些 Tools 之后，会在需要的时候自动调用——你不需要手动指定用哪个 tool。

### 两种传输方式

Server 和 Client 之间有两种通信方式：

- **stdio**：Server 作为本机子进程运行，通过标准输入/输出通信。适合本地工具（比如数据库客户端、文件处理器）。
- **Streamable HTTP**：Server 是远程 HTTP 服务，Claude Code 通过网络请求访问。适合云端服务（比如 GitHub、Notion 的托管 MCP Server）。

另外还有 SSE（Server-Sent Events）和 WebSocket 两种方式，但前者是旧方案，后者还在草案阶段。新项目优先用 Streamable HTTP。

## 配置第一个 MCP Server

### 用 CLI 命令添加

最直接的方式是在终端运行 `claude mcp add`：

```bash
# 添加一个远程 HTTP 服务（以 GitHub 为例）
claude mcp add --transport http github https://api.githubcopilot.com/mcp/ \
  --header "Authorization: Bearer YOUR_GITHUB_PAT"

# 添加一个本地 stdio 服务（以 Airtable 为例）
claude mcp add --transport stdio \
  --env AIRTABLE_API_KEY=your_key_here \
  airtable -- npx -y airtable-mcp-server

# 添加一个带 Bearer token 的远程服务（以 Notion 为例）
claude mcp add --transport http notion https://mcp.notion.com/mcp
```

第一个命令里，`--transport http` 指定用 HTTP 通信，`--header` 传递认证信息。第二个命令里，`--transport stdio` 表示启动本地进程，`-- npx -y airtable-mcp-server` 是启动命令（`--` 后面的部分作为子进程命令）。

添加完成后，重启 Claude Code（或输入 `/mcp` 查看状态），新 Server 就生效了。

### 常用管理命令

```bash
# 列出所有已配置的 MCP Server
claude mcp list

# 查看某个 Server 的详细配置
claude mcp get github

# 删除一个 Server
claude mcp remove airtable

# 用 JSON 格式添加（适合复杂配置）
claude mcp add-json my-server '{"command":"node","args":["server.js"],"env":{"KEY":"value"}}'
```

### 三个配置范围

MCP 配置有三个作用范围：

| 范围 | 配置位置 | 特点 |
|------|---------|------|
| **local** | `~/.claude.json` | 当前项目私有，不影响其他人 |
| **project** | 项目根目录 `.mcp.json` | 通过 Git 共享给团队 |
| **user** | `~/.claude.json` | 所有项目通用，个人私有 |

默认是 `local`。要指定范围，加 `-s` 参数：

```bash
claude mcp add -s project --transport http shared-api https://api.example.com/mcp
```

## MCP 配置文件详解

### `.mcp.json` 文件格式

放在项目根目录的 `.mcp.json` 用于团队共享 MCP 配置。格式如下：

```json
{
  "mcpServers": {
    "database": {
      "command": "node",
      "args": ["./tools/db-server.js"],
      "env": {
        "DB_URL": "postgresql://localhost:5432/mydb"
      }
    },
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

几个要点：

- `command` + `args` 用于 stdio 类型的 Server，指定启动命令和参数。
- `type: "http"` + `url` 用于远程 HTTP Server。
- `env` 里可以设置环境变量，支持 `${VAR}` 和 `${VAR:-default}` 两种展开语法。
- 这个文件提交到 Git 后，团队成员 clone 项目就能直接用同一套 MCP 配置。

### 环境变量展开

`.mcp.json` 中可以用环境变量避免硬编码敏感信息：

```json
{
  "mcpServers": {
    "my-api": {
      "command": "node",
      "args": ["./api-server.js"],
      "env": {
        "API_KEY": "${MY_API_KEY}",
        "BASE_URL": "${API_BASE_URL:-https://default.example.com}"
      }
    }
  }
}
```

`${MY_API_KEY}` 会从运行环境中读取对应的值。`${VAR:-default}` 在变量不存在时使用默认值。这样 `.mcp.json` 可以安全提交到版本控制，每个人在自己的 `.env` 或 shell profile 里设置实际值。

## 工具审批流程

### 首次连接确认

当 Claude Code 遇到一个 project 范围的 MCP Server（来自 `.mcp.json`），会弹出审批提示：

```
This project has configured the following MCP servers:
  - database (stdio)
  - github (http)

Allow these servers to connect? [Y/n]
```

选 Yes 之后，这个 Server 被标记为"已信任"。信任信息存储在 `.claude/` 目录下，下次不会重复询问。如果 `.mcp.json` 修改了（比如新增了 Server 或改了命令），会重新触发审批。

### 在会话中管理

在 Claude Code 交互模式中，输入 `/mcp` 可以查看当前所有 Server 的状态——哪些已连接、哪些有错误、暴露了哪些 Tools。这是一个排查问题的快捷入口。

### Tool Search 机制

Claude Code 默认开启了 Tool Search：不是一次把所有 MCP Server 的所有 Tools 都塞进上下文，而是按需查找。当你的问题和某个 Tool 相关时，Claude Code 才去那个 Server 拉取 Tool 定义。这样做是为了节省上下文窗口——如果你装了十个 Server，每个暴露二十个 Tool，全部加载会吃掉大量 token。

## 调试 MCP 连接

MCP 连不上是常见问题。排查步骤：

### 1. 查看状态

```bash
# 在 Claude Code 中运行
/mcp
```

这会显示每个 Server 的连接状态。如果显示红色或错误信息，说明连接有问题。

### 2. 运行诊断

```bash
# 在 Claude Code 中运行
/doctor
```

`/doctor` 会检查 Claude Code 的安装和配置，包括 MCP 配置是否有效。

### 3. 用 debug 模式启动

```bash
claude --debug mcp
```

这会在 stderr 输出 MCP 的详细通信日志，能看到每一步请求和响应。如果某个 Server 启动失败或返回异常，日志里会有具体错误信息。

### 4. 隔离配置测试

如果你怀疑是某个 Server 配置冲突，可以用空配置启动来排除干扰：

```bash
mkdir -p /tmp/claude-clean
cd /tmp/claude-clean
CLAUDE_CONFIG_DIR=/tmp/claude-clean claude
```

这会以一个干净的配置环境启动 Claude Code，没有任何 MCP Server。确认能正常工作后，再逐个加回 Server 来定位问题。

### 5. 常见原因

- Server 启动命令写错了（路径不对、依赖没装）
- 环境变量没设置（`${API_KEY}` 展开为空）
- 远程 Server 的 URL 不可达（网络、防火墙）
- 认证 token 过期或无效
- Server 进程崩溃（检查 stderr 日志）

## 常见 MCP Server 推荐

以下是一些实际可用的 MCP Server，按场景分类：

| Server | 传输方式 | 用途 |
|--------|---------|------|
| [GitHub Copilot MCP](https://github.com/features/copilot) | HTTP | 操作 PR、Issue、代码搜索 |
| [Notion MCP](https://mcp.notion.com/mcp) | HTTP | 读写 Notion 页面和数据库 |
| [Context7](https://github.com/upstash/context7) | stdio | 查询开源库的文档和代码示例 |
| [Playwright MCP](https://github.com/anthropics/playwright-mcp) | stdio | 浏览器自动化和网页测试 |
| [PostgreSQL MCP](https://github.com/anthropics/postgres-mcp) | stdio | 查询和操作 PostgreSQL 数据库 |
| [Filesystem MCP](https://github.com/anthropics/filesystem-mcp) | stdio | 受控的文件系统访问 |

这些 Server 的安装方式大同小异——`claude mcp add` 加上对应参数就行。具体配置参考各项目的 README。

## MCP 的局限和安全考量

### 当前局限

- **不是所有工具都有 MCP Server**：生态还在建设，很多工具需要自己写 Server 或等社区开发。
- **上下文消耗**：虽然 Tool Search 能缓解，但装太多 Server 仍会增加上下文压力。建议只装项目需要的。
- **Server 稳定性**：社区开发的 Server 质量参差不齐，有些连接不稳定、响应慢。
- **不支持工具间联动**：每个 MCP Server 是独立的，不能让一个 Server 的输出直接喂给另一个 Server。Claude Code 作为中间层可以串联，但效率有限。

### 安全注意事项

- **审批机制有原因**：MCP Server 能执行真实操作（写数据库、创建 PR）。不要盲目信任来源不明的 Server。
- **环境变量别硬编码**：API Key 和 Token 放在 `.mcp.json` 里要用 `${VAR}` 语法，不要直接写明文。
- **`.mcp.json` 会进入版本控制**：确保敏感信息都用环境变量引用，而不是直接写入配置文件。
- **定期清理**：不再用的 Server 用 `claude mcp remove` 删掉，减少攻击面和不必要的上下文消耗。

## 关键要点

- MCP 是 Claude Code 连接外部工具的标准协议，架构是 Host-Client-Server，通信用 JSON-RPC 2.0。
- 配置方式两种：`claude mcp add` 命令（个人/快速）和 `.mcp.json` 文件（团队/共享）。
- Server 暴露三类能力：Tools（最常用）、Resources、Prompts。
- 传输方式两种：stdio（本地进程）和 HTTP（远程服务）。
- 排查问题的入口是 `/mcp`、`/doctor`、`claude --debug mcp`。
- 安全上注意审批确认、环境变量引用、定期清理不用的 Server。

## 延伸阅读

- [MCP 官方文档](https://modelcontextprotocol.io/) — 协议规范和 Server 开发指南
- [Claude Code MCP 文档](https://docs.anthropic.com/en/docs/claude-code/mcp) — Claude Code 中的 MCP 配置详解
- [MCP Server 仓库集合](https://github.com/modelcontextprotocol/servers) — 官方和社区的 Server 列表
- 系列第 21 篇「MCP 相关命令」 — `claude mcp` 子命令的完整参数参考

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
