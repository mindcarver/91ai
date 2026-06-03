# 环境变量参考：所有 CODEX_ 变量详解

> TL;DR: Codex CLI 通过环境变量控制认证、模型选择、沙箱行为、代理设置、日志级别等。本文列出所有支持的环境变量、类型、默认值和用途。环境变量的优先级低于 CLI 参数但高于 config.toml 默认值，适合 CI/CD 和容器化场景。理解环境变量的完整清单，是用好 Docker 部署、GitHub Actions 集成、多环境切换的基础。

---

## 1. 环境变量在 Codex 中的角色

Codex CLI 的配置体系有四层优先级，从高到低：

| 优先级 | 来源 | 说明 |
|--------|------|------|
| 1（最高） | CLI 参数 | `codex -m gpt-5.5 --sandbox workspace-write` |
| 2 | 环境变量 | `CODEX_MODEL=gpt-5.5` |
| 3 | config.toml | `model = "gpt-5.4"` |
| 4（最低） | 内置默认值 | 源码中的硬编码默认值 |

环境变量排在第二层。它的优势是：不需要改配置文件，不需要改命令行参数，在 shell 里 export 一下就行。这在以下场景特别有用：

- **CI/CD 流水线**：每个 job 设不同的环境变量，不改代码
- **Docker 容器**：通过 `-e` 或 `--env-file` 注入配置
- **多环境切换**：开发环境、测试环境、生产环境用不同的变量值
- **临时测试**：试一个新模型或新配置，改一下变量就行，不污染 config.toml

但也有限制。环境变量不能覆盖所有 config.toml 的字段。有些复杂结构（比如 `model_providers` 里的嵌套表、`shell_environment_policy` 的过滤规则）只能通过 TOML 文件配置。环境变量覆盖的是"高频、单值"的配置项——模型名、API Key、沙箱模式、代理地址这类东西。

从源码看，Codex 的配置加载器在解析 config.toml 之后，会检查环境变量覆盖。对应关系通常是 `CODEX_` 前缀 + 配置项名的 SCREAMING_SNAKE_CASE 形式。比如 `model` 对应 `CODEX_MODEL`，`sandbox_mode` 对应 `CODEX_SANDBOX_MODE`。

下面按功能分组，逐一列出每个环境变量。

---

## 2. 认证相关

认证是环境变量最常用的领域。在 CI/CD 和容器化场景下，API Key 几乎都是通过环境变量注入的。

### 2.1 CODEX_API_KEY

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_API_KEY` |
| 类型 | string |
| 默认值 | 无 |
| 引入版本 | v0.1.0 |
| 敏感 | 是 |

Codex CLI 最核心的环境变量。填入 OpenAI API Key，用于直接认证，跳过 ChatGPT 浏览器登录流程。

```bash
export CODEX_API_KEY="sk-proj-xxxxxxxxxxxxxxxxxxxx"
codex "解释这个函数的逻辑"
```

在 CI/CD 中的用法：

```yaml
# GitHub Actions
- name: Run Codex
  env:
    CODEX_API_KEY: ${{ secrets.CODEX_API_KEY }}
  run: codex exec --ephemeral "检查代码质量"
```

```dockerfile
# Docker
docker run -e CODEX_API_KEY="sk-proj-xxx" codex-image
```

**注意事项**：

- 不要把 key 硬编码在代码里、commit 到 git 仓库、或者写在 Dockerfile 里
- 使用平台提供的 secrets 机制（GitHub Actions secrets、GitLab CI variables、Kubernetes Secrets）
- 如果 `CODEX_API_KEY` 和 ChatGPT 登录状态同时存在，`CODEX_API_KEY` 优先
- key 以 `sk-proj-` 开头的是 project key，以 `sk-` 开头的是 legacy key

### 2.2 OPENAI_API_KEY

| 属性 | 值 |
|------|------|
| 名称 | `OPENAI_API_KEY` |
| 类型 | string |
| 默认值 | 无 |
| 引入版本 | v0.1.0 |
| 敏感 | 是 |

OpenAI SDK 的标准环境变量名。Codex 也支持读取这个变量作为 API Key。当 `CODEX_API_KEY` 未设置时，Codex 会回退到 `OPENAI_API_KEY`。

```bash
# 两种写法等价
export CODEX_API_KEY="sk-proj-xxx"
export OPENAI_API_KEY="sk-proj-xxx"
```

**优先级**：`CODEX_API_KEY` > `OPENAI_API_KEY`。

如果你同时使用 OpenAI Python SDK 和 Codex CLI，设 `OPENAI_API_KEY` 可以两者共用。如果你需要给 Codex 用一个不同的 key，用 `CODEX_API_KEY` 覆盖。

### 2.3 CODEX_HOME

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_HOME` |
| 类型 | path |
| 默认值 | `~/.codex`（Unix）、`%APPDATA%\codex`（Windows） |
| 引入版本 | v0.1.0 |
| 敏感 | 否 |

控制 Codex 的主配置目录。所有用户级文件都存在这个目录下：`config.toml`、`auth.json`、会话历史、记忆文件等。

```bash
# 把配置目录移到自定义位置
export CODEX_HOME="/data/codex-config"
codex "hello"
```

使用场景：

- **多实例部署**：同一台机器上跑多个 Codex 实例，每个用不同的 `CODEX_HOME`
- **容器化**：挂载一个持久卷作为 `CODEX_HOME`，容器重建后配置不丢
- **便携部署**：把 `CODEX_HOME` 指向 U 盘或网络存储

```bash
# Docker 中持久化配置
docker run -v /data/codex-home:/codex-home \
  -e CODEX_HOME=/codex-home \
  -e CODEX_API_KEY="sk-proj-xxx" \
  codex-image
```

**注意**：改了 `CODEX_HOME` 之后，之前的登录状态、会话历史、记忆文件都不会自动迁移。需要手动把旧目录的内容复制过去，或者重新登录。

### 2.4 CODEX_AUTH_CREDENTIALS_STORE

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_AUTH_CREDENTIALS_STORE` |
| 类型 | string（枚举） |
| 默认值 | `keyring`（macOS/Windows）、`file`（Linux 无 keyring 时） |
| 引入版本 | v0.60.0 |
| 敏感 | 否 |

控制认证凭据的存储方式。对应 config.toml 中的 `cli_auth_credentials_store`。

| 值 | 行为 |
|------|------|
| `keyring` | 使用操作系统密钥链（macOS Keychain、Windows Credential Manager、Linux Secret Service） |
| `file` | 存在 `${CODEX_HOME}/auth.json` 文件里，权限 0600 |

```bash
# CI 环境没有 keyring，用文件存储
export CODEX_AUTH_CREDENTIALS_STORE=file
```

Linux 服务器环境通常没有桌面密钥链服务（gnome-keyring 或 kwallet），Codex 会自动回退到 `file`。但如果你装了 keyring 但它坏了（比如 DBus 连不上），手动设成 `file` 可以跳过 keyring。

### 2.5 CODEX_FORCED_LOGIN_METHOD

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_FORCED_LOGIN_METHOD` |
| 类型 | string（枚举） |
| 默认值 | 无（不强制） |
| 引入版本 | v0.65.0 |
| 敏感 | 否 |

强制使用特定的登录方式。对应 config.toml 中的 `forced_login_method`。

| 值 | 行为 |
|------|------|
| `chatgpt` | 只允许 ChatGPT OAuth 登录 |
| `api-key` | 只允许 API Key 登录 |
| `device-code` | 只允许设备码登录 |

```bash
# 企业环境强制 API Key 登录
export CODEX_FORCED_LOGIN_METHOD=api-key
```

企业管理员可以在 system requirements.toml 里设这个值，防止员工用个人 ChatGPT 账号登录公司 Codex 实例。

---

## 3. 模型相关

### 3.1 CODEX_MODEL

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_MODEL` |
| 类型 | string |
| 默认值 | `gpt-5.4` |
| 引入版本 | v0.1.0 |
| 敏感 | 否 |

控制 Codex 默认使用的模型。对应 config.toml 中的 `model`。

```bash
export CODEX_MODEL=gpt-5.5
codex "重构这个模块"
```

CLI 参数 `-m` 的优先级更高：

```bash
# 环境变量说 gpt-5.5，但 -m 覆盖了
CODEX_MODEL=gpt-5.5 codex -m o4-mini "快速检查"
```

CI/CD 中的常见模式——不同任务用不同模型：

```yaml
# .github/workflows/codex.yml
jobs:
  review:
    runs-on: ubuntu-latest
    env:
      CODEX_MODEL: o4-mini       # 审查用推理模型
    steps:
      - run: codex exec "审查 PR"

  fix:
    runs-on: ubuntu-latest
    env:
      CODEX_MODEL: gpt-5.4-mini  # 修复用快速模型
    steps:
      - run: codex exec "修复 lint 错误"
```

### 3.2 CODEX_MODEL_PROVIDER

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_MODEL_PROVIDER` |
| 类型 | string |
| 默认值 | `openai` |
| 引入版本 | v0.50.0 |
| 敏感 | 否 |

选择模型提供方。对应 config.toml 中的 `model_provider`。内置 Provider 有四个：

| 值 | 说明 |
|------|------|
| `openai` | OpenAI 官方 API（默认） |
| `ollama` | Ollama 本地模型 |
| `lmstudio` | LM Studio 本地模型 |
| `amazon-bedrock` | AWS Bedrock 托管模型 |

```bash
# 切换到 Ollama 本地模型
export CODEX_MODEL_PROVIDER=ollama
export CODEX_MODEL=qwen3-235b
codex "解释这段代码"
```

如果你在 config.toml 的 `[model_providers]` 里定义了自定义 Provider（比如连到 Azure OpenAI），也通过这个变量选择。

### 3.3 CODEX_MODEL_REASONING_EFFORT

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_MODEL_REASONING_EFFORT` |
| 类型 | string（枚举） |
| 默认值 | `medium` |
| 引入版本 | v0.55.0 |
| 敏感 | 否 |

控制模型在推理上花多少算力。对应 config.toml 中的 `model_reasoning_effort`。

| 值 | 效果 | Token 消耗 | 适用场景 |
|------|------|------|------|
| `low` | 快速回答，少推理 | 低 | 简单查询、格式化 |
| `medium` | 平衡 | 中（默认） | 日常开发 |
| `high` | 深度推理 | 高 | 复杂架构、调试 |

```bash
# 做复杂调试时拉高推理强度
export CODEX_MODEL_REASONING_EFFORT=high
codex "排查这个并发 bug"
```

这个变量直接映射到 OpenAI Responses API 的 `reasoning.effort` 参数。用推理模型（o4-mini 等）时效果最明显，用普通模型（gpt-5.4 等）时影响较小。

### 3.4 CODEX_REVIEW_MODEL

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_REVIEW_MODEL` |
| 类型 | string |
| 默认值 | 跟随 `CODEX_MODEL` |
| 引入版本 | v0.58.0 |
| 敏感 | 否 |

指定 `/review` 命令使用的专用模型。对应 config.toml 中的 `review_model`。

```bash
export CODEX_MODEL=gpt-5.4           # 日常编码用 GPT-5.4
export CODEX_REVIEW_MODEL=o4-mini    # 审查用推理模型
codex
```

---

## 4. 沙箱相关

沙箱的环境变量主要在 CI/CD 和容器化场景下使用。本地交互式使用一般通过 config.toml 配置就够了。

### 4.1 CODEX_SANDBOX_MODE

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_SANDBOX_MODE` |
| 类型 | string（枚举） |
| 默认值 | `workspace-write` |
| 引入版本 | v0.1.0 |
| 敏感 | 否 |

控制沙箱的隔离级别。对应 config.toml 中的 `sandbox_mode`。详见第 29 篇沙箱全解析。

| 值 | 行为 |
|------|------|
| `read-only` | 只读，不能写任何文件 |
| `workspace-write` | 只能写工作区内的文件 |
| `danger-full-access` | 完全放开，无限制 |

```bash
# CI 中用最严格的沙箱
export CODEX_SANDBOX_MODE=read-only
codex exec "审查代码安全"

# 本地调试时放开（谨慎使用）
export CODEX_SANDBOX_MODE=danger-full-access
codex "帮我跑 npm install"
```

### 4.2 CODEX_SANDBOX_WORKSPACE_WRITE

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_SANDBOX_WORKSPACE_WRITE` |
| 类型 | string |
| 默认值 | 无 |
| 引入版本 | v0.45.0 |
| 敏感 | 否 |

当 `CODEX_SANDBOX_MODE=read-only` 时，通过这个变量额外放通某些目录的写入权限。值是逗号分隔的路径列表。

```bash
export CODEX_SANDBOX_MODE=read-only
export CODEX_SANDBOX_WORKSPACE_WRITE="/tmp/codex-build,./coverage"
codex exec "跑测试并生成覆盖率报告"
```

对应 config.toml 中的 `sandbox_workspace_write`。

### 4.3 CODEX_SANDBOX_NETWORK_ACCESS

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_SANDBOX_NETWORK_ACCESS` |
| 类型 | string（枚举） |
| 默认值 | `deny` |
| 引入版本 | v0.40.0 |
| 敏感 | 否 |

控制沙箱内进程的网络访问权限。

| 值 | 行为 |
|------|------|
| `deny` | 禁止所有出站网络（默认） |
| `allow` | 允许所有出站网络 |

```bash
# 需要 npm install 或 pip install 时放通网络
export CODEX_SANDBOX_NETWORK_ACCESS=allow
codex "安装依赖并跑测试"
```

**注意**：设成 `allow` 后，Codex 执行的任何命令都能访问外部网络。配合 `workspace-write` 沙箱使用时，要确保你信任工作区里的所有代码。

### 4.4 CODEX_SANDBOX_WRITABLE_ROOTS

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_SANDBOX_WRITABLE_ROOTS` |
| 类型 | string（逗号分隔路径） |
| 默认值 | 无 |
| 引入版本 | v0.48.0 |
| 敏感 | 否 |

在 `workspace-write` 模式下，除了工作区外额外允许写入的目录。和 `CODEX_SANDBOX_WORKSPACE_WRITE` 类似，但作用于 `workspace-write` 而不是 `read-only` 模式。

```bash
# 允许写入工作区 + 全局 node_modules
export CODEX_SANDBOX_WRITABLE_ROOTS="/usr/local/lib/node_modules"
codex "全局安装 TypeScript 并检查版本"
```

---

## 5. 网络代理

Codex 使用 OpenAI 的 Rust SDK，底层是 reqwest HTTP 客户端。这些代理变量是 HTTP 客户端层的标准配置，不是 Codex 独有的。

### 5.1 HTTP_PROXY / HTTPS_PROXY

| 属性 | 值 |
|------|------|
| 名称 | `HTTP_PROXY` / `HTTPS_PROXY` |
| 类型 | string（URL） |
| 默认值 | 无 |
| 引入版本 | v0.1.0 |
| 敏感 | 可能（如果代理需要认证） |

控制 Codex 发出的 HTTP/HTTPS 请求走哪个代理。企业网络环境常用。

```bash
export HTTPS_PROXY="http://proxy.corp.example.com:8080"
codex "hello"
```

小写的 `http_proxy` / `https_proxy` 也支持，但大写优先级更高。

如果代理需要认证：

```bash
export HTTPS_PROXY="http://user:password@proxy.corp.example.com:8080"
```

**注意**：认证信息会出现在进程环境变量里，用 `ps eww <pid>` 能看到。在生产环境中建议使用不需要认证的代理，或者用 `ALL_PROXY` 配合 netrc 文件。

### 5.2 ALL_PROXY

| 属性 | 值 |
|------|------|
| 名称 | `ALL_PROXY` |
| 类型 | string（URL） |
| 默认值 | 无 |
| 引入版本 | v0.1.0 |
| 敏感 | 可能 |

同时设置 HTTP 和 HTTPS 代理的快捷方式。`HTTP_PROXY` 和 `HTTPS_PROXY` 优先级更高——如果同时设了 `ALL_PROXY` 和 `HTTPS_PROXY`，HTTPS 请求走 `HTTPS_PROXY`。

```bash
export ALL_PROXY="socks5://proxy.example.com:1080"
codex "hello"
```

支持 HTTP 和 SOCKS5 两种协议。

### 5.3 NO_PROXY

| 属性 | 值 |
|------|------|
| 名称 | `NO_PROXY` |
| 类型 | string（逗号分隔域名） |
| 默认值 | `localhost,127.0.0.1` |
| 引入版本 | v0.1.0 |
| 敏感 | 否 |

不走代理的域名列表。通常用于企业内网服务。

```bash
export HTTPS_PROXY="http://proxy.corp.example.com:8080"
export NO_PROXY="localhost,127.0.0.1,internal.corp.example.com"
```

小写 `no_proxy` 也支持。

### 5.4 CODEX_OPENAI_BASE_URL

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_OPENAI_BASE_URL` |
| 类型 | string（URL） |
| 默认值 | `https://api.openai.com/v1` |
| 引入版本 | v0.30.0 |
| 敏感 | 否 |

覆盖 OpenAI Provider 的 API 地址。用于连接 OpenAI 的 Azure 部署、自建代理、或兼容 OpenAI API 格式的第三方服务。对应 config.toml 中的 `openai_base_url`。

```bash
# 连接 Azure OpenAI
export CODEX_OPENAI_BASE_URL="https://my-resource.openai.azure.com/openai/deployments/my-deployment"
export CODEX_API_KEY="azure-api-key"

# 连接自建代理
export CODEX_OPENAI_BASE_URL="https://ai-gateway.corp.example.com/v1"
```

**注意**：这个变量只影响 OpenAI Provider。如果你切到了 Ollama 或 Bedrock Provider，这个变量无效。

---

## 6. 执行模式

这些环境变量控制 `codex exec`（非交互模式）的行为。详见第 48 篇 exec 模式和第 50 篇 CI/CD 集成。

### 6.1 CODEX_EXEC_APPROVAL_POLICY

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_EXEC_APPROVAL_POLICY` |
| 类型 | string（枚举） |
| 默认值 | `full-auto` |
| 引入版本 | v0.20.0 |
| 敏感 | 否 |

控制 exec 模式下的审批策略。非交互模式没有人在终端前审批，这个变量决定了 Codex 自动执行时的权限边界。

| 值 | 行为 |
|------|------|
| `full-auto` | 自动执行所有操作（受沙箱约束） |
| `on-request` | 需要审批（非交互模式下会拒绝并报错） |

在 CI 中几乎总是用 `full-auto`。如果你设成 `on-request`，exec 模式会因为没人审批而失败。

```bash
export CODEX_EXEC_APPROVAL_POLICY=full-auto
codex exec "修复所有 lint 错误"
```

### 6.2 CODEX_EXEC_SANDBOX

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_EXEC_SANDBOX` |
| 类型 | string（枚举） |
| 默认值 | 跟随 `CODEX_SANDBOX_MODE` |
| 引入版本 | v0.20.0 |
| 敏感 | 否 |

专门给 exec 模式用的沙箱覆盖。如果同时设了 `CODEX_SANDBOX_MODE` 和 `CODEX_EXEC_SANDBOX`，exec 模式用后者。

```bash
# TUI 模式用 workspace-write，exec 模式用 read-only
export CODEX_SANDBOX_MODE=workspace-write
export CODEX_EXEC_SANDBOX=read-only
```

### 6.3 CODEX_EXEC_TIMEOUT

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_EXEC_TIMEOUT` |
| 类型 | int（秒） |
| 默认值 | 600（10 分钟） |
| 引入版本 | v0.35.0 |
| 敏感 | 否 |

exec 模式的超时时间。超过这个时间 Codex 会强制终止并退出。CI 流水线中特别有用——防止 Codex 陷入死循环消耗所有 CI 资源。

```bash
# 给 Codex 5 分钟做修复
export CODEX_EXEC_TIMEOUT=300
codex exec "修复构建错误"
```

### 6.4 CODEX_EXEC_MAX_TURNS

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_EXEC_MAX_TURNS` |
| 类型 | int |
| 默认值 | 30 |
| 引入版本 | v0.40.0 |
| 敏感 | 否 |

exec 模式的最大对话轮数。一轮是指一次"用户输入 → 模型回复 → 工具调用 → 工具结果"的完整循环。超过限制后 Codex 停止执行。

```bash
# 简单任务限制 10 轮就够了
export CODEX_EXEC_MAX_TURNS=10
codex exec "给这个文件加 type hints"
```

控制轮数是控制 token 消耗的有效手段。复杂任务需要多轮探索和修改，简单任务几轮就够。

---

## 7. 日志和调试

### 7.1 CODEX_LOG_LEVEL

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_LOG_LEVEL` |
| 类型 | string（枚举） |
| 默认值 | `warn` |
| 引入版本 | v0.1.0 |
| 敏感 | 否 |

控制 Codex CLI 自身的日志级别。不是模型的输出级别，是 Codex 程序本身的日志。

| 值 | 输出内容 |
|------|------|
| `off` | 不输出日志 |
| `error` | 只输出错误 |
| `warn` | 警告和错误（默认） |
| `info` | 一般信息、警告、错误 |
| `debug` | 调试信息（大量输出） |
| `trace` | 最详细，包含所有内部调用 |

```bash
# 排查问题时开 debug
export CODEX_LOG_LEVEL=debug
codex "hello" 2>codex-debug.log
```

日常使用保持 `warn` 就好。开 `debug` 或 `trace` 后日志量会非常大，每次 API 调用、文件操作、工具调用都会记录。

### 7.2 RUST_LOG

| 属性 | 值 |
|------|------|
| 名称 | `RUST_LOG` |
| 类型 | string |
| 默认值 | 无 |
| 引入版本 | v0.1.0 |
| 敏感 | 否 |

Rust 生态的标准日志变量。Codex 用 `tracing` crate 做日志，`RUST_LOG` 可以做更精细的控制——按模块设置不同的级别。

```bash
# 只看沙箱模块的 debug 日志
export RUST_LOG="codex_sandbox=debug"

# 只看配置加载的 trace 日志
export RUST_LOG="codex_config=trace"

# 多个模块
export RUST_LOG="codex_sandbox=debug,codex_config=info"
```

`RUST_LOG` 和 `CODEX_LOG_LEVEL` 同时设时，`RUST_LOG` 的优先级更高（因为它在更底层的 tracing subscriber 上）。

### 7.3 CODEX_LOG_DIR

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_LOG_DIR` |
| 类型 | path |
| 默认值 | `${CODEX_HOME}/logs` |
| 引入版本 | v0.55.0 |
| 敏感 | 否 |

日志文件的输出目录。Codex 会在后台把日志写到文件，不只是在终端输出。

```bash
export CODEX_LOG_DIR="/var/log/codex"
```

企业环境中可以把日志目录挂到集中式日志收集系统（比如 ELK、Loki）扫描的路径下。

---

## 8. MCP 相关

MCP（Model Context Protocol）服务器的配置也可以通过环境变量控制。详见第 36 篇 MCP 接入和第 37 篇 MCP 开发。

### 8.1 CODEX_MCP_SERVERS_DIR

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_MCP_SERVERS_DIR` |
| 类型 | path |
| 默认值 | `${CODEX_HOME}/mcp-servers` |
| 引入版本 | v0.50.0 |
| 敏感 | 否 |

MCP 服务器配置文件的搜索目录。Codex 会在这个目录下查找 `.json` 文件作为 MCP 服务器定义。

```bash
export CODEX_MCP_SERVERS_DIR="/opt/codex/mcp-configs"
codex "hello"
```

如果你有多个团队共用一套 MCP 服务器配置，可以把配置集中放在一个网络目录，然后通过这个变量指向它。

### 8.2 CODEX_MCP_DISABLED

| 属性 | 值 |
|------|------|
| 名称 | `CODEX_MCP_DISABLED` |
| 类型 | bool |
| 默认值 | `false` |
| 引入版本 | v0.55.0 |
| 敏感 | 否 |

禁用所有 MCP 服务器连接。设为 `true` 或 `1` 时，Codex 启动时不加载任何 MCP 服务器。

```bash
# 排查 MCP 问题时临时禁用
export CODEX_MCP_DISABLED=true
codex "hello"
```

### 8.3 MCP 服务器特定的环境变量

每个 MCP 服务器在配置 JSON 中可以声明需要的环境变量。这些不是 `CODEX_` 前缀的——它们是 MCP 服务器自己定义的。

比如一个数据库 MCP 服务器可能需要：

```bash
export DATABASE_URL="postgres://user:pass@localhost/mydb"
```

Codex 会把这些环境变量传递给 MCP 服务器的子进程。这个传递机制受 `shell_environment_policy` 控制（详见第 26 篇 Shell 配置）。

---

## 9. TUI 相关

终端 UI 的行为也可以通过环境变量控制。

### 9.1 NO_COLOR

| 属性 | 值 |
|------|------|
| 名称 | `NO_COLOR` |
| 类型 | bool |
| 默认值 | 无（彩色输出） |
| 引入版本 | v0.1.0 |
| 敏感 | 否 |

禁用彩色输出。设为任意值（即使是空字符串）都会禁用颜色。这是 [no-color.org](https://no-color.org) 标准的通用环境变量，不是 Codex 独有的。

```bash
export NO_COLOR=1
codex "hello"
```

在日志收集、重定向到文件、或色盲用户场景下有用。

### 9.2 TERM

| 属性 | 值 |
|------|------|
| 名称 | `TERM` |
| 类型 | string |
| 默认值 | 系统自动设置 |
| 引入版本 | v0.1.0 |
| 敏感 | 否 |

终端类型。影响 TUI 的渲染方式。Codex 使用 Ratatui 做 TUI 渲染，依赖 terminfo 数据库来知道终端支持哪些特性。

常见值：

| 值 | 说明 |
|------|------|
| `xterm-256color` | 大多数现代终端（推荐） |
| `screen-256color` | tmux 里 |
| `xterm-kitty` | Kitty 终端 |
| `dumb` | 无终端能力（CI 环境） |

CI/CD 环境中 `TERM` 可能是 `dumb` 或未设置。Codex 的 exec 模式不依赖 TUI，所以不影响。但如果你在 CI 中跑 TUI 模式（不推荐），需要设一下：

```bash
export TERM=xterm-256color
```

### 9.3 COLORTERM

| 属性 | 值 |
|------|------|
| 名称 | `COLORTERM` |
| 类型 | string |
| 默认值 | 系统自动设置 |
| 引入版本 | v0.1.0 |
| 敏感 | 否 |

指示终端是否支持真彩色。`truecolor` 或 `24bit` 表示支持。Codex 用它来决定用 256 色还是真彩色渲染。

### 9.4 EDITOR / VISUAL

| 属性 | 值 |
|------|------|
| 名称 | `EDITOR` / `VISUAL` |
| 类型 | string |
| 默认值 | `vi` |
| 引入版本 | v0.1.0 |
| 敏感 | 否 |

当 Codex 需要打开一个外部编辑器（比如编辑 AGENTS.md、编辑 prompt）时，使用这个变量指定的编辑器。

```bash
export EDITOR="code --wait"   # VS Code
export EDITOR="vim"           # Vim
export EDITOR="nano"          # Nano
```

`VISUAL` 的优先级高于 `EDITOR`。两个都不设时默认用 `vi`。

---

## 10. 容器化场景的环境变量配置

在 Docker 和 Kubernetes 中，环境变量是配置应用的标准方式。Codex 的环境变量设计天然适合容器化部署。

### 10.1 Docker 场景

一个完整的 Codex Docker 配置示例：

```dockerfile
FROM node:20-slim

# 安装 Codex
RUN npm install -g @openai/codex

# 创建配置目录
RUN mkdir -p /codex-home
ENV CODEX_HOME=/codex-home

# 非交互模式配置
ENV CODEX_SANDBOX_MODE=workspace-write
ENV CODEX_EXEC_APPROVAL_POLICY=full-auto
ENV CODEX_EXEC_TIMEOUT=300
ENV CODEX_LOG_LEVEL=info

WORKDIR /workspace
ENTRYPOINT ["codex", "exec"]
```

运行时注入敏感信息：

```bash
docker run \
  -e CODEX_API_KEY="sk-proj-xxx" \
  -v $(pwd):/workspace \
  codex-image \
  "检查这个项目的代码质量"
```

使用 env-file 管理非敏感配置：

```bash
# codex.env
CODEX_MODEL=gpt-5.4-mini
CODEX_SANDBOX_MODE=read-only
CODEX_EXEC_TIMEOUT=300
CODEX_LOG_LEVEL=info
CODEX_EXEC_MAX_TURNS=15
```

```bash
docker run \
  --env-file codex.env \
  -e CODEX_API_KEY="${CODEX_API_KEY}" \
  -v $(pwd):/workspace \
  codex-image \
  "生成测试用例"
```

### 10.2 Kubernetes 场景

ConfigMap 管理非敏感配置：

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: codex-config
data:
  CODEX_MODEL: "gpt-5.4-mini"
  CODEX_SANDBOX_MODE: "read-only"
  CODEX_EXEC_TIMEOUT: "600"
  CODEX_LOG_LEVEL: "info"
  CODEX_EXEC_MAX_TURNS: "30"
  CODEX_HOME: "/codex-home"
```

Secret 管理敏感信息：

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: codex-secrets
type: Opaque
stringData:
  CODEX_API_KEY: "sk-proj-xxxxxxxxxxxxxxxx"
```

Pod 配置：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: codex-job
spec:
  containers:
  - name: codex
    image: codex-image:latest
    envFrom:
    - configMapRef:
        name: codex-config
    - secretRef:
        name: codex-secrets
    volumeMounts:
    - name: workspace
      mountPath: /workspace
    - name: codex-home
      mountPath: /codex-home
  volumes:
  - name: workspace
    persistentVolumeClaim:
      claimName: workspace-pvc
  - name: codex-home
    emptyDir: {}
```

### 10.3 Docker Compose 场景

```yaml
version: "3.8"
services:
  codex:
    image: codex-image:latest
    environment:
      - CODEX_MODEL=gpt-5.4-mini
      - CODEX_SANDBOX_MODE=workspace-write
      - CODEX_EXEC_TIMEOUT=600
      - CODEX_LOG_LEVEL=info
      - CODEX_HOME=/codex-home
    env_file:
      - .codex-secrets  # 不提交到 git
    volumes:
      - ./workspace:/workspace
      - codex-home:/codex-home

volumes:
  codex-home:
```

---

## 11. 安全注意事项

环境变量是把双刃剑——用起来方便，但也容易泄露敏感信息。

### 11.1 哪些变量包含敏感信息

| 变量 | 敏感级别 | 泄露后果 |
|------|------|------|
| `CODEX_API_KEY` | 高 | 攻击者可以用你的 API 额度调用 OpenAI |
| `OPENAI_API_KEY` | 高 | 同上 |
| `HTTPS_PROXY`（含认证） | 中 | 攻击者可以用你的代理 |
| 代理 URL 中的密码 | 高 | 攻击者可以访问代理服务器 |

`CODEX_MODEL`、`CODEX_SANDBOX_MODE`、`CODEX_LOG_LEVEL` 这些不是敏感的，泄露了无所谓。

### 11.2 CI/CD 中的安全管理

原则：敏感变量只通过平台的 secrets 机制注入，永远不要出现在代码仓库里。

**GitHub Actions**：

```yaml
# 正确：用 secrets
- env:
    CODEX_API_KEY: ${{ secrets.CODEX_API_KEY }}
  run: codex exec "do something"

# 错误：硬编码
- env:
    CODEX_API_KEY: "sk-proj-xxx"  # 不要这样！
  run: codex exec "do something"
```

**GitLab CI**：

```yaml
# 在 Settings > CI/CD > Variables 中设 CODEX_API_KEY（勾选 Masked）
codex-job:
  script:
    - codex exec "do something"
  variables:
    CODEX_MODEL: "gpt-5.4-mini"  # 非敏感，可以写在这里
```

**Kubernetes**：

```bash
# 用 kubectl 创建 secret
kubectl create secret generic codex-secrets \
  --from-literal=CODEX_API_KEY='sk-proj-xxx'

# 不要把 secret 写在 YAML 文件里提交到 git
```

### 11.3 环境变量泄漏的常见途径

| 途径 | 防护方法 |
|------|------|
| 进程列表（`ps eww`） | 使用 keyring 而不是环境变量存 API Key |
| Docker inspect | 用 Docker secrets 或 Kubernetes Secrets |
| 日志输出 | 确保日志级别不是 `debug` 或 `trace` 时输出环境变量 |
| 错误报告 | Codex 的错误报告会自动过滤已知敏感变量 |
| 子进程继承 | 配置 `shell_environment_policy` 过滤敏感变量 |
| `.env` 文件提交到 git | 把 `.env` 加入 `.gitignore` |

### 11.4 环境变量 vs config.toml 的安全对比

| 维度 | 环境变量 | config.toml |
|------|------|------|
| 文件系统可见性 | `ps eww` 可见 | 文件权限 0600 保护 |
| 版本控制 | 不在 git 里 | 可能误提交 |
| 容器场景 | Docker/K8s 原生支持 | 需要挂载卷 |
| 多用户 | 每个用户/容器独立 | 共享文件系统可能冲突 |
| 审计 | 平台 secrets 有审计日志 | 文件访问有文件系统审计 |

没有绝对的安全，只有适合场景的选择。CI/CD 用环境变量 + 平台 secrets，本地用 config.toml + 文件权限，两者配合使用。

---

## 12. 环境变量完整速查表

按功能分组，所有环境变量一览。

### 认证

| 变量 | 类型 | 默认值 | 敏感 | 说明 |
|------|------|------|------|------|
| `CODEX_API_KEY` | string | 无 | 是 | OpenAI API Key |
| `OPENAI_API_KEY` | string | 无 | 是 | 备用 API Key |
| `CODEX_HOME` | path | `~/.codex` | 否 | 配置主目录 |
| `CODEX_AUTH_CREDENTIALS_STORE` | enum | `keyring` | 否 | 凭据存储方式 |
| `CODEX_FORCED_LOGIN_METHOD` | enum | 无 | 否 | 强制登录方式 |

### 模型

| 变量 | 类型 | 默认值 | 敏感 | 说明 |
|------|------|------|------|------|
| `CODEX_MODEL` | string | `gpt-5.4` | 否 | 默认模型 |
| `CODEX_MODEL_PROVIDER` | string | `openai` | 否 | 模型提供方 |
| `CODEX_MODEL_REASONING_EFFORT` | enum | `medium` | 否 | 推理强度 |
| `CODEX_REVIEW_MODEL` | string | 跟随 model | 否 | 审查专用模型 |
| `CODEX_OPENAI_BASE_URL` | url | OpenAI 默认 | 否 | OpenAI API 地址 |

### 沙箱

| 变量 | 类型 | 默认值 | 敏感 | 说明 |
|------|------|------|------|------|
| `CODEX_SANDBOX_MODE` | enum | `workspace-write` | 否 | 沙箱级别 |
| `CODEX_SANDBOX_WORKSPACE_WRITE` | paths | 无 | 否 | read-only 下的额外写入目录 |
| `CODEX_SANDBOX_NETWORK_ACCESS` | enum | `deny` | 否 | 网络访问 |
| `CODEX_SANDBOX_WRITABLE_ROOTS` | paths | 无 | 否 | workspace-write 下的额外写入目录 |

### 代理

| 变量 | 类型 | 默认值 | 敏感 | 说明 |
|------|------|------|------|------|
| `HTTP_PROXY` | url | 无 | 可能 | HTTP 代理 |
| `HTTPS_PROXY` | url | 无 | 可能 | HTTPS 代理 |
| `ALL_PROXY` | url | 无 | 可能 | 通用代理 |
| `NO_PROXY` | domains | localhost | 否 | 不走代理的域名 |

### 执行模式

| 变量 | 类型 | 默认值 | 敏感 | 说明 |
|------|------|------|------|------|
| `CODEX_EXEC_APPROVAL_POLICY` | enum | `full-auto` | 否 | exec 审批策略 |
| `CODEX_EXEC_SANDBOX` | enum | 跟随全局 | 否 | exec 沙箱覆盖 |
| `CODEX_EXEC_TIMEOUT` | int(秒) | 600 | 否 | exec 超时 |
| `CODEX_EXEC_MAX_TURNS` | int | 30 | 否 | exec 最大轮数 |

### 日志

| 变量 | 类型 | 默认值 | 敏感 | 说明 |
|------|------|------|------|------|
| `CODEX_LOG_LEVEL` | enum | `warn` | 否 | 日志级别 |
| `RUST_LOG` | string | 无 | 否 | Rust 模块级日志 |
| `CODEX_LOG_DIR` | path | `${CODEX_HOME}/logs` | 否 | 日志文件目录 |

### MCP

| 变量 | 类型 | 默认值 | 敏感 | 说明 |
|------|------|------|------|------|
| `CODEX_MCP_SERVERS_DIR` | path | `${CODEX_HOME}/mcp-servers` | 否 | MCP 服务器配置目录 |
| `CODEX_MCP_DISABLED` | bool | `false` | 否 | 禁用 MCP |

### TUI

| 变量 | 类型 | 默认值 | 敏感 | 说明 |
|------|------|------|------|------|
| `NO_COLOR` | bool | 无 | 否 | 禁用彩色 |
| `TERM` | string | 系统 | 否 | 终端类型 |
| `COLORTERM` | string | 系统 | 否 | 真彩色支持 |
| `EDITOR` | string | `vi` | 否 | 默认编辑器 |
| `VISUAL` | string | 无 | 否 | 编辑器（优先于 EDITOR） |

---

## 延伸阅读

- **第 22 篇（配置体系总览）**：环境变量在四层优先级中的位置，以及与 config.toml 的关系
- **第 23 篇（基础配置项）**：model、sandbox、approval 等核心配置项的详细说明
- **第 24 篇（模型与 Provider）**：`CODEX_OPENAI_BASE_URL`、`CODEX_MODEL_PROVIDER` 对应的 TOML 配置
- **第 26 篇（Shell 与沙箱配置）**：沙箱环境变量的底层机制和 shell 环境变量策略
- **第 29 篇（沙箱全解析）**：`CODEX_SANDBOX_MODE`、`CODEX_SANDBOX_NETWORK_ACCESS` 的深入讲解
- **第 48 篇（exec 非交互模式）**：`CODEX_EXEC_*` 系列变量的使用场景
- **第 50 篇（CI/CD 集成）**：环境变量在 GitHub Actions 和 Docker 中的实际配置方法
- **第 55 篇（企业认证）**：`CODEX_API_KEY` 和 `CODEX_FORCED_LOGIN_METHOD` 在企业场景下的管理策略
- **第 36 篇（MCP 服务器接入）**：MCP 相关环境变量的使用
- **第 66 篇（config.toml 完整参考）**：所有环境变量对应的 TOML 配置项对照
