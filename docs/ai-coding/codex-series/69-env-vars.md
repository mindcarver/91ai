# 环境变量参考：Codex 稳定公开变量

> TL;DR：Codex 的长期配置应优先写在 `config.toml`，环境变量主要用于 shell 级临时覆盖、自动化凭据、安装器行为和诊断日志。不要把 `CODEX_MODEL`、`CODEX_SANDBOX_MODE`、`CODEX_EXEC_APPROVAL_POLICY` 这类未在官方稳定列表中记录的名字当成可靠配置入口；模型、沙箱和审批策略用 CLI 参数或 `config.toml` 配置。

---

## 1. 环境变量适合做什么

环境变量不是 Codex 的完整配置系统。它们适合三类场景：

- **临时运行上下文**：本次 shell 或 CI job 使用不同的 Codex home、SQLite 状态目录或证书。
- **自动化凭据**：给一次 `codex exec` 注入 API Key，或给受信任自动化提供 access token。
- **安装与诊断**：静默安装、改变安装目录、打开 Rust 日志。

模型、审批策略、沙箱模式、Provider、MCP、Hooks、Skills、Web search 等长期配置，优先使用：

```toml
# ~/.codex/config.toml
model = "gpt-5.5"
sandbox_mode = "workspace-write"
approval_policy = "on-request"
```

一次性运行则用 CLI 参数：

```bash
codex -m gpt-5.5 --sandbox workspace-write --ask-for-approval on-request
codex exec --sandbox workspace-write "修复失败的测试"
```

## 2. 状态目录

### CODEX_HOME

| 属性 | 值 |
| --- | --- |
| 默认值 | `~/.codex` |
| 适用范围 | CLI、IDE extension、app-server、安装器 |
| 作用 | 设置 Codex 状态根目录 |

`CODEX_HOME` 控制 Codex 的用户级状态位置，包括配置、认证、日志、会话、Skills 和 standalone package metadata。

```bash
mkdir -p /data/codex-home
export CODEX_HOME=/data/codex-home
codex "hello"
```

注意：如果设置了 `CODEX_HOME`，目录需要已经存在。改动后，原来的登录状态和会话历史不会自动迁移。

### CODEX_SQLITE_HOME

| 属性 | 值 |
| --- | --- |
| 默认值 | 跟随 `CODEX_HOME` |
| 适用范围 | CLI、app-server state |
| 作用 | 设置 SQLite 状态存储目录 |

`CODEX_SQLITE_HOME` 用于把 SQLite-backed state 放到不同位置。`sqlite_home` 配置项优先级高于这个环境变量；相对路径会从当前工作目录解析。

```bash
mkdir -p /data/codex-sqlite
export CODEX_SQLITE_HOME=/data/codex-sqlite
codex
```

## 3. 安装器变量

这些变量用于官方 standalone 安装脚本：

- `https://chatgpt.com/codex/install.sh`
- `https://chatgpt.com/codex/install.ps1`

### CODEX_NON_INTERACTIVE

| 属性 | 值 |
| --- | --- |
| 默认值 | `false` |
| 取值 | `1`、`true`、`yes` 可视为启用 |
| 作用 | 跳过安装器交互提示 |

用于脚本化安装或升级。它会采用安装器默认回答，因此适合 unattended install，不适合第一次交互式排错。

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh
```

PowerShell：

```powershell
$env:CODEX_NON_INTERACTIVE=1; irm https://chatgpt.com/codex/install.ps1 | iex
```

### CODEX_INSTALL_DIR

| 属性 | 值 |
| --- | --- |
| macOS/Linux 默认值 | `~/.local/bin` |
| Windows 默认值 | `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin` |
| 作用 | 改变可执行的 `codex` 命令安装位置 |

```bash
export CODEX_INSTALL_DIR="$HOME/bin"
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

standalone package cache 仍然位于 `CODEX_HOME/packages/standalone`。

## 4. 认证与网络

### CODEX_API_KEY

| 属性 | 值 |
| --- | --- |
| 适用范围 | `codex exec` |
| 敏感 | 是 |
| 作用 | 为一次非交互运行提供 API Key |

`CODEX_API_KEY` 只支持 `codex exec`。不要把它设成 job 级环境变量后再运行仓库里的构建脚本、测试或依赖生命周期脚本，因为这些脚本可能读取环境变量。

推荐做法是只在单次命令内注入：

```bash
CODEX_API_KEY="$OPENAI_API_KEY" codex exec --json "检查这个 PR 的风险点"
```

在 GitHub Actions 里，优先使用官方 `openai/codex-action`，而不是自己安装 CLI 并把 API Key 暴露给整个 job。

### CODEX_ACCESS_TOKEN

| 属性 | 值 |
| --- | --- |
| 适用范围 | CLI、app-server、受信任自动化 |
| 敏感 | 是 |
| 作用 | 提供 ChatGPT 或 Codex access token |

如果要持久化登录，把 token 通过管道传给登录命令：

```bash
printf '%s' "$CODEX_ACCESS_TOKEN" | codex login --with-access-token
```

如果不想把凭据写入机器上的认证存储，可以只在受信任自动化环境中临时设置 `CODEX_ACCESS_TOKEN`。

### CODEX_CA_CERTIFICATE

| 属性 | 值 |
| --- | --- |
| 适用范围 | HTTPS、登录、WebSocket clients |
| 作用 | 指向 PEM 格式 CA bundle |
| 优先级 | 高于 `SSL_CERT_FILE` |

企业网络有 TLS inspection 或私有根证书时使用：

```bash
export CODEX_CA_CERTIFICATE=/path/to/corporate-root-ca.pem
codex login
```

### SSL_CERT_FILE

| 属性 | 值 |
| --- | --- |
| 适用范围 | HTTPS、登录、WebSocket clients |
| 作用 | `CODEX_CA_CERTIFICATE` 未设置时的备用 PEM CA bundle |

```bash
export SSL_CERT_FILE=/path/to/ca-bundle.pem
codex login
```

## 5. 诊断变量

### RUST_LOG

| 属性 | 值 |
| --- | --- |
| 适用范围 | CLI、app-server |
| 常见取值 | `error`、`warn`、`info`、`debug`、`trace` |
| 作用 | 控制 Rust 日志过滤和详细程度 |

交互式 CLI 默认不会写明文 TUI 日志。需要排错时，显式设置 `log_dir`：

```bash
RUST_LOG=debug codex -c log_dir=./.codex-log
tail -F ./.codex-log/codex-tui.log
```

也可以使用更细的 Rust logging filter：

```bash
RUST_LOG=codex_core=debug,codex_tui=debug codex -c log_dir=./.codex-log
```

`codex exec` 非交互模式会把消息内联打印，而不是写单独的 TUI log 文件。

## 6. 常见误区

### 误区一：用环境变量切模型

不要依赖未公开稳定的 `CODEX_MODEL` 之类变量。用 CLI 参数或配置文件：

```bash
codex -m gpt-5.5 "修复这个 bug"
codex exec -m gpt-5.4-mini "总结测试失败原因"
```

```toml
model = "gpt-5.5"
```

### 误区二：用环境变量切沙箱或审批策略

不要依赖 `CODEX_SANDBOX_MODE`、`CODEX_EXEC_APPROVAL_POLICY` 这类未在官方稳定环境变量列表中记录的变量。用明确参数：

```bash
codex --sandbox workspace-write --ask-for-approval on-request
codex exec --sandbox workspace-write "运行测试并修复失败项"
```

`codex exec --full-auto` 仍作为兼容参数存在，但官方已标为 deprecated；新脚本应显式设置 `--sandbox workspace-write` 或更严格的权限。

### 误区三：把 CODEX_API_KEY 放进整个 CI job

不建议这样做：

```yaml
env:
  CODEX_API_KEY: ${{ secrets.CODEX_API_KEY }}
steps:
  - run: npm test
  - run: codex exec "修复测试"
```

仓库代码、测试脚本、依赖安装脚本都可能读取 job 环境变量。更好的方式是只在 `codex exec` 那一步注入，或使用 `openai/codex-action`。

### 误区四：把 Provider 自定义 Key 当成固定 CODEX_ 变量

自定义 Provider 的密钥变量名由 `env_key` 决定，不是固定的 Codex 环境变量：

```toml
[model_providers.my_gateway]
name = "my-gateway"
base_url = "https://gateway.example.com/v1"
env_key = "MY_GATEWAY_API_KEY"
```

然后在 shell 中设置：

```bash
export MY_GATEWAY_API_KEY="..."
```

## 7. 速查表

| 变量 | 用途 | 敏感 | 推荐场景 |
| --- | --- | --- | --- |
| `CODEX_HOME` | Codex 状态根目录 | 否 | 多实例、容器、隔离配置 |
| `CODEX_SQLITE_HOME` | SQLite 状态目录 | 否 | 状态存储分离 |
| `CODEX_NON_INTERACTIVE` | 安装器跳过提示 | 否 | unattended install |
| `CODEX_INSTALL_DIR` | 改变 `codex` 命令安装目录 | 否 | 自定义 PATH 布局 |
| `CODEX_API_KEY` | 单次 `codex exec` API Key | 是 | CI 或脚本化非交互运行 |
| `CODEX_ACCESS_TOKEN` | ChatGPT/Codex access token | 是 | 受信任自动化、企业身份 |
| `CODEX_CA_CERTIFICATE` | 自定义 CA bundle | 否 | 企业 TLS inspection |
| `SSL_CERT_FILE` | 备用 CA bundle | 否 | 通用 TLS 配置 |
| `RUST_LOG` | Rust 日志级别 | 否 | 排错和诊断 |

## 延伸阅读

- [Codex 官方文档：Environment variables](https://developers.openai.com/codex/environment-variables) — 稳定公开环境变量列表
- [Codex 官方文档：Non-interactive mode](https://developers.openai.com/codex/noninteractive) — `codex exec`、API Key 注入和 CI 安全建议
- [Codex 官方文档：Config basics](https://developers.openai.com/codex/config-basic) — `config.toml` 基础配置
- [Codex 官方文档：Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security) — 沙箱、审批和网络安全
- [第 48 篇：exec 非交互模式](./48-exec-mode.md)
- [第 66 篇：config.toml 完整参考](./66-config-reference.md)

*本文以 OpenAI Codex 官方 Environment variables 与 Non-interactive mode 文档为基准。Codex 更新频繁，新增变量时应优先回到官方稳定列表确认。*

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
