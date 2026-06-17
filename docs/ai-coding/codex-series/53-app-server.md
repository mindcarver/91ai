# Codex App Server 模式：远程连接与团队共享

> TL;DR：`codex app-server` 把 Codex 从本地 CLI 工具变成一个可远程访问的 WebSocket 服务。你在一台机器上启动 server，另一台机器上的 Codex TUI 通过 WebSocket 连接过来使用。支持 `ws://`、`wss://`、`unix://` 三种传输方式，提供 capability token 和 signed bearer token 两种认证模式。本文覆盖启动配置、传输方式、认证机制、远程连接、团队共享场景、SSH 隧道方案，以及安全注意事项。

---

## 1. 为什么需要 App Server 模式

Codex CLI 默认是一个本地工具——你在终端里输入命令，Codex 在同一台机器上执行文件操作和 shell 命令。大多数时候这没问题。但有些场景下，"本地"反而是个限制：

- **开发机性能不足**：你的笔记本算力有限，但团队有一台配置好的服务器
- **代码在远程机器上**：生产环境或 staging 环境的代码不允许 checkout 到本地
- **团队共享 Codex 实例**：多人共用一个 Codex server，统一管理模型配置和沙箱策略
- **SSH 远程开发**：你通过 SSH 连接到远程服务器工作，但想在本地终端看到 Codex 的 TUI 界面
- **IDE 集成**：VS Code 的 Codex 扩展就是通过 app-server 协议和 Codex 通信的

`codex app-server` 解决的核心问题是**把 Codex 的运行环境和它的交互界面解耦**。server 端负责代码执行和模型调用，client 端（TUI、SDK、IDE 扩展）负责交互。

这个模式的核心协议是 JSON-RPC v2，通过 WebSocket 传输。每个 WebSocket 连接代表一个 client 会话，server 可以同时服务多个 client。

需要提前说明：WebSocket 传输目前标记为 **experimental / unsupported**。OpenAI 明确表示不要在生产工作负载中依赖它。但对于开发环境和团队内部使用，它已经足够稳定。

## 2. 启动 App Server

### 基本启动

```bash
# WebSocket 方式（最常用）
codex app-server --listen ws://127.0.0.1:4500

# stdio 方式（默认，用于 SDK 和本地进程通信）
codex app-server --listen stdio://

# Unix socket 方式（用于本地进程间通信）
codex app-server --listen unix:///tmp/codex.sock

# 关闭监听（不暴露传输接口）
codex app-server --listen off
```

默认传输方式是 `stdio://`——通过标准输入输出交换 JSONL（newline-delimited JSON）消息。这是 SDK 使用的模式，不适合人工交互。

### WebSocket 地址格式

`--listen` 参数支持的格式：

| 格式 | 示例 | 用途 |
|------|------|------|
| `ws://IP:PORT` | `ws://127.0.0.1:4500` | 本地或局域网 WebSocket |
| `wss://IP:PORT` | `wss://192.168.1.100:4500` | TLS 加密的 WebSocket |
| `stdio://` | `stdio://`（默认） | SDK 和本地进程通信 |
| `unix://` | `unix://` 或 `unix:///path/to/sock` | Unix 域套接字 |
| `off` | `off` | 不暴露传输接口 |

绑定到 `0.0.0.0` 会监听所有网络接口，局域网内其他机器可以连接。绑定到 `127.0.0.1` 只接受本机连接。

```bash
# 只接受本机连接
codex app-server --listen ws://127.0.0.1:4500

# 接受局域网连接
codex app-server --listen ws://0.0.0.0:4500
```

### 健康检查端点

当用 `--listen ws://IP:PORT` 启动时，同一个端口还提供 HTTP 健康检查：

- `GET /readyz` — 返回 `200 OK`，表示 listener 已就绪接受连接
- `GET /healthz` — 返回 `200 OK`，但拒绝带有 `Origin` header 的请求（返回 `403`）

这些端点用于负载均衡器和监控系统的健康检查，不是给人类浏览器访问的。

### 日志控制

```bash
# 设置日志级别
RUST_LOG=debug codex app-server --listen ws://127.0.0.1:4500

# JSON 格式日志输出到 stderr
LOG_FORMAT=json codex app-server --listen ws://127.0.0.1:4500
```

## 3. 远程连接到 App Server

### 从 TUI 连接

```bash
# 在另一台机器（或同一台机器的另一个终端）连接
codex --remote ws://127.0.0.1:4500
```

连接成功后，Codex TUI 和本地使用体验完全一致。区别在于，所有文件操作和命令执行都在 server 端机器上发生。

### 连接到远程服务器

```bash
# server 端（192.168.1.100）启动
codex app-server --listen ws://0.0.0.0:4500

# client 端（你的笔记本）连接
codex --remote ws://192.168.1.100:4500
```

client 端的 Codex TUI 会通过 WebSocket 连接到 server，所有代码读写都在 server 上执行。

### Unix Socket 连接

```bash
# server 端启动 unix socket
codex app-server --listen unix:///tmp/codex.sock

# client 端通过 unix socket 连接
codex --remote unix:///tmp/codex.sock
```

Unix socket 只能在同一台机器上使用，但性能比 WebSocket over loopback 更好（绕过 TCP 栈）。适合在同一台服务器上运行多个 Codex client（比如 TUI 和 VS Code 扩展同时连接）。

### 后台运行

```bash
# 后台启动，输出重定向到日志文件
nohup codex app-server --listen ws://127.0.0.1:4500 > codex-server.log 2>&1 &
```

## 4. 认证机制

当 app-server 监听在非 localhost 的地址上时，任何知道地址和端口的人都可以尝试连接。认证机制就是为了控制谁能连上来。

### 两种认证模式

`--ws-auth` 参数指定认证模式，`--ws-token-file` 或 `--ws-shared-secret-file` 提供对应的密钥文件。

**Capability Token 模式**：

```bash
codex app-server \
  --listen ws://0.0.0.0:4500 \
  --ws-auth capability-token \
  --ws-token-file /path/to/token.txt
```

token 文件中存放一个随机字符串。client 连接时在 WebSocket 握手的 HTTP 请求中携带 `Authorization: Bearer <token>` header。

```bash
# client 端设置环境变量
export CODEX_REMOTE_TOKEN="your-token-here"
codex --remote ws://192.168.1.100:4500
```

**Signed Bearer Token 模式**：

```bash
codex app-server \
  --listen ws://0.0.0.0:4500 \
  --ws-auth signed-bearer-token \
  --ws-shared-secret-file /path/to/secret.txt
```

server 用共享密钥对 token 进行签名验证。这种方式比 capability token 更安全，因为密钥不会直接在网络中传输。

### 认证安全规则

一个重要的约束：**app-server 只在 `wss://`（TLS）或本地的 `ws://`（localhost）上接受远程认证 token**。如果你用 `ws://` 绑定到非 localhost 地址，token 会被拒绝。

这个设计的意图是防止 token 在未加密的连接上被截获。如果你确实需要在非 localhost 的 `ws://` 上使用（比如内网环境），需要评估安全风险。

```bash
# 错误：非 localhost 的 ws:// 不接受 token
codex app-server --listen ws://0.0.0.0:4500 --ws-auth capability-token --ws-token-file /path
# 连接会被拒绝，因为 ws:// 不是 localhost 且没有 TLS

# 正确：使用 wss://
codex app-server --listen wss://0.0.0.0:4500 --ws-auth capability-token --ws-token-file /path

# 正确：localhost 的 ws:// 可以使用 token
codex app-server --listen ws://127.0.0.1:4500 --ws-auth capability-token --ws-token-file /path
```

### 环境变量

client 端可以通过 `CODEX_REMOTE_TOKEN` 环境变量传递 token：

```bash
export CODEX_REMOTE_TOKEN="your-capability-token"
codex --remote wss://codex-server.example.com:4500
```

也可以写入 shell 配置文件（`~/.zshrc` 或 `~/.bashrc`）中持久化。

## 5. SSH 隧道方案

当 server 端在防火墙后面或没有公网 IP 时，SSH 隧道是最实用的方案。

### 正向隧道

在 client 端执行：

```bash
# 建立从本地 4500 端口到远程 4500 端口的隧道
ssh -L 4500:127.0.0.1:4500 user@remote-server
```

然后在另一个终端：

```bash
# server 端已经在 remote-server 上运行
# codex app-server --listen ws://127.0.0.1:4500

# client 端通过隧道连接
codex --remote ws://127.0.0.1:4500
```

SSH 隧道的好处：连接是加密的（SSH 的 TLS），server 端只需要监听 localhost，不需要暴露到公网。

### 反向隧道

让远程 server 上的 Codex 通过 SSH 反向隧道连回你的本地端口：

```bash
# 在 remote-server 上执行
ssh -R 4500:127.0.0.1:4500 user@your-laptop

# 在 your-laptop 上启动 app-server
codex app-server --listen ws://127.0.0.1:4500
```

反向隧道的适用场景较少，但在你的笔记本有公网 IP 或 NAT 穿透配置时有用。

### 隧道 + 认证组合

```bash
# server 端：localhost + capability token
codex app-server \
  --listen ws://127.0.0.1:4500 \
  --ws-auth capability-token \
  --ws-token-file /home/user/.codex/token

# client 端：SSH 隧道 + token
ssh -L 4500:127.0.0.1:4500 user@remote-server
export CODEX_REMOTE_TOKEN="your-token"
codex --remote ws://127.0.0.1:4500
```

这给了你双重保护：SSH 加密传输 + app-server 认证。

## 6. 团队共享场景

### 共享开发服务器

团队有一台共享的开发服务器（比如 `dev-server.internal:4500`），所有成员通过 WebSocket 连接：

```bash
# 管理员在 dev-server 上启动
codex app-server \
  --listen wss://0.0.0.0:4500 \
  --ws-auth signed-bearer-token \
  --ws-shared-secret-file /etc/codex/shared-secret

# 开发者 A 在笔记本上连接
export CODEX_REMOTE_TOKEN="token-for-alice"
codex --remote wss://dev-server.internal:4500

# 开发者 B 在另一台机器上连接
export CODEX_REMOTE_TOKEN="token-for-bob"
codex --remote wss://dev-server.internal:4500
```

### VS Code 扩展 + TUI 并存

app-server 支持多个 client 同时连接。你可以在同一个 server 上同时使用 VS Code Codex 扩展和终端 TUI：

```bash
# 启动 server（unix socket 模式适合本机多 client）
codex app-server --listen unix:///tmp/codex.sock

# VS Code 扩展连接到 unix socket
# （扩展配置中指定 socket 路径）

# TUI 也连接到同一个 socket
codex --remote unix:///tmp/codex.sock
```

### exec-server 模式

除了 app-server，Codex 还提供了 `exec-server` 子命令，用于在远程环境中执行 `codex exec`：

```bash
# server 端
codex exec-server --listen ws://127.0.0.1:8765

# client 端连接并执行
codex --remote ws://127.0.0.1:8765 exec "Review the latest commit"
```

exec-server 专注于非交互执行，适合 CI/CD 和自动化场景。

## 7. 协议细节

### JSON-RPC v2

app-server 使用 JSON-RPC 2.0 协议。client 发送请求，server 返回响应和通知。

请求格式：

```json
{
  "method": "thread/start",
  "id": 1,
  "params": {
    "model": "gpt-5.4",
    "config": {"model_reasoning_effort": "high"}
  }
}
```

通知格式（无 `id` 字段，不需要响应）：

```json
{
  "method": "initialized",
  "params": {}
}
```

### 初始化握手

每个连接建立后，client 必须先发送 `initialize` 请求，然后发送 `initialized` 通知。在此之前的其他请求会被拒绝：

```json
{"method": "initialize", "id": 0, "params": {"clientInfo": {"name": "my-client", "version": "1.0"}}}
{"method": "initialized", "params": {}}
```

### 背压处理

server 使用有界队列（bounded queue）处理请求。当请求量超过队列容量时，server 返回错误码 `-32001`，消息为 `"Server overloaded; retry later."`。client 应该用指数退避重试。

### 协议 Schema 导出

```bash
# 导出 TypeScript 类型定义
codex app-server generate-ts --out ./types

# 导出 JSON Schema
codex app-server generate-json-schema --out ./schemas
```

导出的 schema 和当前版本的 Codex 完全匹配，适合用于 client 端的类型检查和消息验证。

## 8. 安全注意事项

### TLS 加密

对于非 localhost 的连接，始终使用 `wss://` 而不是 `ws://`。WebSocket 传输的 JSON-RPC 消息在 `ws://` 下是明文的，任何人监听网络流量都能看到你的 prompt 和 Codex 的回复。

```bash
# 使用 TLS
codex app-server --listen wss://0.0.0.0:4500
```

TLS 证书需要你自己准备。可以用 Let's Encrypt 获取免费证书，或者用内部 CA 签发。

### 网络隔离

如果 app-server 监听在公网 IP 上，确保防火墙只对可信 IP 段开放 4500 端口。不要把 Codex server 直接暴露到公网。

```bash
# 只监听 localhost（最安全）
codex app-server --listen ws://127.0.0.1:4500

# 通过 SSH 隧道访问（推荐远程场景）
ssh -L 4500:127.0.0.1:4500 user@server
```

### Token 管理

- capability token 和 shared secret 不要提交到版本控制
- token 文件权限设为 `600`（只有 owner 可读写）
- 定期轮换 token
- 不同的团队成员使用不同的 token，便于审计和撤销

```bash
# 生成随机 token
openssl rand -hex 32 > ~/.codex/token
chmod 600 ~/.codex/token
```

### Codex Home 隔离

如果多人共享一个 app-server 实例，考虑用 `--codex-home` 指定不同的 home 目录，避免配置和缓存互相干扰：

```bash
codex app-server --listen ws://127.0.0.1:4500 --codex-home /home/alice/.codex
```

## 9. App Server vs MCP Server

Codex 提供了两种服务端模式，容易混淆：

| 维度 | app-server | MCP Server |
|------|-----------|------------|
| 命令 | `codex app-server` | `codex mcp-server` |
| 协议 | JSON-RPC v2 over WebSocket/stdio | MCP 协议 over stdio |
| 用途 | IDE 集成、远程 TUI、SDK | 供其他 AI agent 调用 Codex |
| 传输 | WebSocket、Unix socket、stdio | 仅 stdio |
| 认证 | capability token、signed bearer token | 无（本地 stdio） |
| 状态 | experimental | stable |

简单的区分：app-server 是给"人用的前端"（TUI、IDE）服务的，MCP Server 是给"其他 AI agent"服务的。

## 10. 常见问题

**WebSocket 连接被拒绝怎么办？**

检查几个点：server 是否在运行、端口是否正确、防火墙是否放行、认证 token 是否匹配。用 `curl` 测试健康检查端点：

```bash
curl http://127.0.0.1:4500/readyz
# 应返回 200 OK
```

**多个 client 同时连接会冲突吗？**

不会。每个 WebSocket 连接是独立的 client 会话，server 可以同时处理多个连接。Thread 按连接隔离——一个 client 创建的 Thread，另一个 client 看不到（除非通过 `thread_list`）。

**`--listen off` 是做什么用的？**

关闭传输接口，不接受任何外部连接。适用于 Codex 作为子进程被其他程序控制的场景，程序通过进程间通信而不是网络和 Codex 交互。

**app-server 崩溃了 Thread 数据会丢吗？**

Thread 数据持久化在磁盘上（SQLite 文件）。app-server 重启后，通过 `thread_resume` 可以恢复之前的 Thread。未完成的 Turn 在重启后会标记为中断状态。

**可以在 Docker 中运行 app-server 吗？**

可以。把 Codex CLI 安装到 Docker 镜像中，暴露 4500 端口，用 `wss://` 认证：

```dockerfile
FROM ubuntu:24.04
RUN npm install -g @openai/codex
EXPOSE 4500
CMD ["codex", "app-server", "--listen", "wss://0.0.0.0:4500", "--ws-auth", "capability-token", "--ws-token-file", "/run/secrets/codex-token"]
```

## 11. 下一步

- 在本地用 `ws://127.0.0.1:4500` 启动 app-server，用另一个终端连接体验远程模式
- 如果需要远程访问，配置 SSH 隧道作为首选方案
- 用 `generate-ts` 导出协议类型，在你自己的 client 中实现定制功能
- 阅读本系列下一篇：《Codex 管理员配置指南：团队部署与策略管控》

---

**延伸阅读**

- [codex app-server README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) — 协议、API 和生命周期文档
- [Codex CLI 子命令参考](https://developers.openai.com/codex/cli/subcommands) — app-server、exec-server、mcp-server 等全部子命令
- [Codex VS Code 扩展](https://marketplace.visualstudio.com/items?itemName=openai.chatgpt) — 基于 app-server 协议的 IDE 集成
- [WebSocket 认证最佳实践](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) — WebSocket 安全通信参考

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
