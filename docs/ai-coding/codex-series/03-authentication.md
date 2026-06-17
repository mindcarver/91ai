# Codex CLI 首次登录与认证配置：ChatGPT 账号、API Key、企业 SSO 全搞定

> TL;DR: Codex CLI 有两条认证路径——ChatGPT 账号登录和 API Key。个人开发用 ChatGPT 登录，走订阅套餐的额度；CI/CD 自动化用 API Key，按 token 付费。企业用户还能走 SSO + access token。凭据存在 `~/.codex/auth.json` 或系统 keyring 里。本文覆盖全部认证方式的配置流程、套餐差异、安全注意事项和常见报错排查。

---

## 1. Codex 认证体系概览

Codex CLI 连接 OpenAI 模型时需要身份验证。它支持两条独立的认证路径，对应不同的使用场景和计费模型。理解这两条路径的区别，是正确配置 Codex 的第一步。

**ChatGPT 账号登录（OAuth 浏览器授权）**

这是默认路径。首次运行 `codex` 时，如果本地没有有效凭据，CLI 会自动发起 ChatGPT OAuth 流程。终端打印一个 URL，系统默认浏览器弹出 OpenAI 授权页面。你用 ChatGPT 账号登录并授权后，浏览器把 access token 通过 `localhost` 回调传回给 CLI。整条链路走的是标准 OAuth 2.0 授权码流程。

费用方面，ChatGPT 登录使用的是你的 ChatGPT 订阅套餐额度（Free/Plus/Pro/Business/Enterprise）。月费已经包含了 Codex 的使用额度，不需要额外付款。适合日常交互式使用——坐在终端前写代码、调试、做代码审查。

**API Key 认证**

从 platform.openai.com 获取的 API Key，直接写入环境变量或通过 `codex login --with-api-key` 注入。费用按 token 用量从你的 OpenAI Platform 账户扣款，走标准 API 费率。没有 5 小时窗口的消息数限制，只有账户余额和 RPM/TPM（每分钟请求数/令牌数）的约束。适合 CI/CD pipeline、cron job、GitHub Actions 等无人值守场景。

为什么要有两条？因为使用场景完全不同。人在终端前写代码，用 ChatGPT 登录方便，套餐额度已经付过钱了；机器在 CI 里跑任务，没有浏览器，用 API Key 直连更合理。两条路径也决定了数据管控策略：ChatGPT 登录走 workspace 权限和 RBAC，API Key 走 API 组织的保留和数据共享设置。

认证信息缓存在本地，Codex 下次启动时自动复用。CLI 和 IDE 扩展共享同一份凭据缓存，任一端登出后另一端也需要重新登录。活跃会话期间，ChatGPT 的 token 会自动续期，不需要反复浏览器授权。

---

## 2. ChatGPT 账号登录：完整流程

### 2.1 首次运行

在终端输入：

```bash
codex
```

如果 CLI 检测不到有效凭据，它会自动启动登录流程。你会看到类似这样的提示：

```
No credentials found. Launching browser for ChatGPT login...
Opening https://auth.openai.com/authorize?... in your browser
```

浏览器弹出 OpenAI 授权页面。用你的 ChatGPT 账号完成认证。支持多种登录方式：邮箱+密码、Google 账号、Microsoft 账号、Apple ID。如果你的组织配置了 SSO，登录页面会自动跳转到企业的 IdP（身份提供方）。

授权完成后，浏览器跳转回 `localhost:1455`（CLI 启动的本地 HTTP 回调服务器），CLI 从回调请求中拿到 access token，写入凭据缓存。终端显示：

```
Login successful. Signed in as user@example.com.
```

整个过程通常在几秒钟内完成。如果你的默认浏览器不在当前图形环境中（比如通过 SSH 的 X11 转发），可以手动复制终端打印的 URL 到有浏览器的设备上打开。

### 2.2 手动登录

如果你之前登出过，想切换账号，或者凭据过期需要刷新：

```bash
codex login
```

不带任何参数时，效果和首次运行一样——打开浏览器走 OAuth 流程。登录成功后，新的凭据覆盖旧的缓存。

`codex login` 还有一个常被忽略的用途：当你同时安装了 Codex CLI 和 IDE 扩展时，在 CLI 端登录后，IDE 扩展也能直接使用这份凭据，不需要单独配置。

### 2.3 查看认证状态

```bash
codex login status
```

预期输出：

```
Auth mode: chatgpt
Logged in: yes
Account: user@example.com
```

`codex login status` 在已登录时退出码为 0，未登录时非 0。这让它适合用在 shell 脚本里做前置检查：

```bash
# 在脚本中检查登录状态
if ! codex login status; then
    echo "Codex 未登录，正在启动登录流程..."
    codex login
fi
```

这个退出码设计遵循 Unix 惯例——0 表示成功（已登录），非 0 表示失败（未登录），方便和 `if`、`while`、`&&`、`||` 组合使用。

### 2.4 无浏览器环境：Device Code 流程

在远程服务器、Docker 容器、CI runner 里没有图形界面和浏览器怎么办？Codex 提供了 device code 认证（beta）：

```bash
codex login --device-auth
```

输出类似：

```
To sign in, use a browser to open:

  https://auth.openai.com/device

And enter the code: XXXX-XXXX

Waiting for authorization...
```

在任意有浏览器的设备上打开这个链接——可以是你的笔记本、手机、平板。登录 ChatGPT 账号，输入终端显示的一次性代码，点确认授权。CLI 端自动收到 token，无需任何网络回调。

这个流程的底层是 OAuth 2.0 Device Authorization Grant（RFC 8628），专为输入受限设备设计。CLI 定期轮询 OpenAI 的 token endpoint，一旦你在浏览器端完成授权，CLI 就能拿到 token。

注意前提条件：device code 登录需要先在 ChatGPT 安全设置（个人账号）或 workspace 权限（workspace 管理员）里启用 device code 登录选项。如果服务端没有开启，`--device-auth` 会自动回退到标准浏览器登录流程。

### 2.5 无浏览器环境的备选方案

如果 device code 也不行（比如网络完全隔离，或者 OpenAI 的 device endpoint 被防火墙拦截），还有两个备选方案：

**方法一：在有浏览器的机器上登录，然后复制 auth 缓存**

这个方案的核心思路是：在一台有浏览器的机器上完成 OAuth 流程，然后把凭据文件传输到无头机器上。

```bash
# 步骤 1：在本地机器（有浏览器）上登录
codex login

# 步骤 2：确认缓存文件已生成
ls -la ~/.codex/auth.json

# 步骤 3：通过 SSH 复制到远程机器
ssh user@remote 'mkdir -p ~/.codex'
scp ~/.codex/auth.json user@remote:~/.codex/auth.json
```

也可以用一条命令完成，不需要 scp：

```bash
ssh user@remote 'mkdir -p ~/.codex && cat > ~/.codex/auth.json' < ~/.codex/auth.json
```

如果是 Docker 容器：

```bash
CONTAINER_HOME=$(docker exec MY_CONTAINER printenv HOME)
docker exec MY_CONTAINER mkdir -p "$CONTAINER_HOME/.codex"
docker cp ~/.codex/auth.json MY_CONTAINER:"$CONTAINER_HOME/.codex/auth.json"
```

`auth.json` 包含 access token 和 refresh token，要当密码一样对待。不要提交到 git，不要贴到工单里，不要放在世界可读的目录上。

这里有一个重要的限制：OAuth refresh token 是单次使用的。当远程机器上的 Codex 实例刷新了 token，你本地的 `auth.json` 副本就失效了。所以这种方案适合单台远程机器，不适合把同一份 `auth.json` 复制到多台机器。

**方法二：SSH 端口转发**

如果你的本地机器能 SSH 到远程机器，可以通过隧道把远程的回调端口转发到本地：

```bash
# 从本地机器启动端口转发
ssh -L 1455:localhost:1455 user@remote

# 在这个 SSH 会话里运行
codex login
```

CLI 会在远程机器的 `localhost:1455` 上启动回调服务器。SSH 隧道把这个端口转发到你本地机器的 `localhost:1455`。浏览器在本地打开，授权完成后回调到 `localhost:1455`，通过隧道传回远程机器的 CLI。

这个方案比复制文件更干净——不需要处理 token 刷新失效的问题，但需要 SSH 连接保持稳定。

### 2.6 Access Token 登录

除了标准的浏览器 OAuth 流程，Codex 还支持 access token 直接注入。这在企业自动化场景中特别有用：

```bash
printenv CODEX_ACCESS_TOKEN | codex login --with-access-token
```

Access token 的来源有两种：

- **ChatGPT Enterprise workspace**：管理员授权成员创建 Codex access token，走 workspace 的权限和企业管控策略。适合可信脚本、调度器、私有 CI runner。
- **自定义 provider 的 bearer token**：在 config.toml 中配置 `model_providers` 时，可以用 access token 作为 bearer token 认证。

access token 登录和 API Key 登录的区别在于：access token 走的是 ChatGPT workspace 的权限体系，能使用企业级功能（Codex Cloud、workspace 策略、RBAC 等），而 API Key 走的是 API 组织的设置，功能受限。

### 2.7 各套餐权益差异

Codex 包含在所有 ChatGPT 套餐中，但可用额度和模型范围不同。了解这些差异有助于选择合适的认证方式和套餐。

| 套餐 | 月费 | Codex 额度 | 可用模型 | 特殊说明 |
|------|------|-----------|---------|---------|
| Free | $0 | 有限额度 | 基础模型 | 适合体验和轻量使用 |
| Go | 按量付费 | 有限额度 | 基础模型 | 弹性计费 |
| Plus | $20/月 | 中等额度 | 全部模型 | 包含 Codex Web + CLI |
| Pro | $200/月 | 10x Plus 额度 | 全部模型 | 额度用完可购买额外 credit |
| Business | $25-30/用户/月 | 按需付费 | 全部模型 | 团队管理，无固定 Codex 席位 |
| Enterprise | 定制 | 自定义 | 全部模型 | SSO + 合规 + 管控 |

套餐额度以"每 5 小时窗口的消息数"计量。这个窗口是滑动窗口，不是固定时段。达到限制后，Codex 会提示你等待额度重置或切换到 API Key 模式继续使用。

Pro 套餐用户（包括 Pro 5x 和 20x）额度用完后可以购买额外 credit 额度，不需要升级套餐。Business 套餐支持 Codex 席位的按需付费模式，没有固定的月度席位费用，也没有最低席位数量要求。

### 2.8 MFA 要求

Codex Cloud 直接访问你的代码库，安全要求比其他 ChatGPT 功能更高。使用 Codex Cloud 时必须启用多因素认证（MFA）。规则如下：

- **邮箱+密码登录**：必须设置 MFA 才能访问 Codex Cloud。登录 ChatGPT 的安全设置页面，在 "Multi-factor authentication" 下开启。
- **社交登录（Google/Microsoft/Apple）**：不强制 MFA，但建议在社交账号服务商一侧开启两步验证。
- **SSO 登录**：由组织的 SSO 管理员统一执行 MFA 策略，个人不需要单独设置。
- **混合登录**：如果你的账号同时支持邮箱密码和社交登录，只要邮箱密码是选项之一，就必须先设好 MFA，即使你平时用社交账号登录。

MFA 只在使用 Codex Cloud 时强制要求。纯本地使用 Codex CLI（不连接 Cloud）不受此限制，但仍然建议开启 MFA 以保护账号安全。

---

## 3. API Key 认证

### 3.1 获取 API Key

从 OpenAI Platform 获取 API Key 的步骤：

1. 打开 [platform.openai.com](https://platform.openai.com)，用你的 OpenAI 账号登录（注意这和 ChatGPT 账号是同一套凭证，但页面不同）。
2. 点击左侧导航栏的 "API Keys"，或直接访问 [platform.openai.com/api-keys](https://platform.openai.com/api-keys)。
3. 点击 "Create new secret key" 按钮。
4. 给 key 起个名字（比如 "codex-cli-ci"），方便日后管理。
5. 复制生成的 key。它以 `sk-` 开头，是一串长字符串。这个值只显示一次，关闭对话框后无法再看到。

如果你已经有 API Key 但忘了，只能删除旧 key 重新创建。OpenAI 不会存储原始 key 值，只保存 key 的哈希摘要。

API Key 需要绑一张信用卡到 OpenAI Platform 账户，并且账户里有余额或设置了自动充值。新注册的 OpenAI 账户可能有少量免费额度，但通常不够长时间使用。

### 3.2 配置方式

**方式一：环境变量（推荐，适合 CI/CD）**

```bash
# macOS/Linux（zsh/bash）
export OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxx"

# 写入 shell 配置文件，永久生效
echo 'export OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxx"' >> ~/.zshrc
source ~/.zshrc

# Windows PowerShell
$env:OPENAI_API_KEY = "sk-xxxxxxxxxxxxxxxxxxxx"
```

Codex 会自动检测 `OPENAI_API_KEY` 环境变量。设好之后直接运行：

```bash
codex
```

不需要 `codex login`。CLI 检测到环境变量后自动使用 API Key 认证。

**方式二：通过 login 命令注入**

```bash
printenv OPENAI_API_KEY | codex login --with-api-key
```

这会把 API Key 写入凭据缓存（`auth.json` 或 keyring）。之后即使环境变量被删除，CLI 也能从缓存中读取。适合不想在 `.zshrc` 里明文存储 key 的场景。

**方式三：config.toml 中配置自定义 provider**

如果你用的不是 OpenAI 官方 API，而是走代理、中转服务或其他 OpenAI 兼容的 provider（如 Azure OpenAI），可以在 `~/.codex/config.toml` 里配置：

```toml
model_provider = "my-provider"

[model_providers.my-provider]
name = "My Provider"
base_url = "https://api.my-provider.com/v1"
env_key = "MY_PROVIDER_API_KEY"
```

然后在环境变量里设好对应的 key：

```bash
export MY_PROVIDER_API_KEY="your-key-here"
```

`env_key` 指定的是环境变量名，不是 key 值本身。Codex 运行时从这个环境变量读取实际的 API Key。

对于需要 OpenAI 认证的代理（比如 LLM proxy），可以用：

```toml
[model_providers.proxy]
name = "OpenAI Proxy"
base_url = "https://proxy.example.com/v1"
requires_openai_auth = true
```

设了 `requires_openai_auth = true` 后，Codex 会用你当前的 OpenAI 认证（ChatGPT 登录或 API Key）去请求这个 provider。此时 `env_key` 设置会被忽略。

如果 provider 不需要认证（比如本地 Ollama），两个都不用设：

```toml
[model_providers.local]
name = "Ollama"
base_url = "http://localhost:11434/v1"
```

### 3.3 API Key 的限制

API Key 认证只支持本地 Codex 工作流。以下功能不可用或受限：

- **Codex Cloud（云端任务执行）**—— 必须用 ChatGPT 登录。Cloud 需要 workspace 上下文来管理环境和权限。
- **ChatGPT App 和 Web 端的 Codex 功能**—— API Key 和 ChatGPT 前端是独立的体系。
- **依赖 ChatGPT workspace 访问的功能**—— 团队共享项目、workspace 策略、协作功能等都需要 workspace 上下文。
- **企业级数据管控和合规特性**—— SSO、数据保留策略、审计日志等都绑定在 ChatGPT workspace 上。

简单说，API Key 给你的是纯粹的模型调用能力。所有需要"ChatGPT 账号上下文"的功能都不走 API Key。

### 3.4 API Key 计费方式

按 token 用量从 OpenAI Platform 账户扣费。不同模型费率不同，具体价格参考 [OpenAI API Pricing](https://openai.com/api/pricing/) 页面。一般来说，输入 token 和输出 token 的价格不同，推理模型（如 o 系列）比基础模型更贵。

和 ChatGPT 套餐的完整对比：

| 维度 | ChatGPT 登录 | API Key |
|------|-------------|---------|
| 费用模型 | 包含在套餐月费中，额度内无额外费用 | 按 token 单独计费，用多少扣多少 |
| 额度限制 | 套餐固定额度 + 5 小时窗口限制 | 无窗口限制，只受账户余额和 RPM/TPM 约束 |
| 适用场景 | 交互式终端使用、日常开发 | CI/CD、自动化脚本、批量任务 |
| 云端功能 | 全部可用 | 受限或不可用 |
| 模型范围 | 受套餐约束 | 受 API 账户权限约束，通常更灵活 |
| 数据策略 | 走 ChatGPT workspace 设置（企业可管控） | 走 API 组织设置 |
| 速率限制 | 消息数/5 小时（滑动窗口） | RPM（请求数/分钟）、TPM（令牌数/分钟） |
| 团队协作 | 支持 workspace 共享 | 不支持 |

一个常见的策略是：日常开发用 ChatGPT Plus/Pro 登录，额度用完后临时切 API Key 继续工作，避免等待 5 小时窗口重置。

---

## 4. 企业 SSO 登录与管控

### 4.1 企业 SSO 流程

ChatGPT Business 和 Enterprise 工作区使用 SAML SSO 做身份联合。企业用户的登录流程在终端侧和普通 ChatGPT 登录完全一样——`codex login` 打开浏览器。区别在于授权页面走的是企业的 IdP（Identity Provider），比如 Okta、Azure AD、OneLogin、Google Workspace 等。

流程是：CLI 发起 OAuth -> OpenAI 认证服务检测到你的邮箱属于企业 workspace -> 重定向到企业 IdP -> 在 IdP 完成 SAML 认证 -> IdP 回调 OpenAI -> OpenAI 签发 token 给 CLI。

登录成功后，Codex 自动获取该 workspace 的权限和策略配置。这些策略决定了你可以用哪些模型、能访问哪些功能、数据保留策略等。

### 4.2 管理员强制登录方式

企业管理员可以在托管配置（`requirements.toml`）中限制允许的认证方式。这个配置是管理员级别的，用户无法通过本地 `config.toml` 覆盖。

```toml
# requirements.toml

# 强制使用 ChatGPT 登录（禁用 API Key）
forced_login_method = "chatgpt"

# 或者反过来，只允许 API Key
forced_login_method = "api"
```

如果当前凭据和配置的限制不匹配——比如策略要求 ChatGPT 登录，但你用的是 API Key——Codex 会自动登出当前用户并退出进程。这个行为是即时的，不需要用户确认。

`forced_login_method` 通常通过 managed configuration 下发，而不是写在用户的本地配置文件里。ChatGPT Business 和 Enterprise 还支持 cloud-fetched requirements，管理员在 ChatGPT 后台配置后，Codex 在启动时自动拉取。

### 4.3 限制 Workspace

在大型组织中，员工可能同时有个人 ChatGPT 账号和企业 workspace 账号。管理员可以限制 Codex 只接受特定 workspace 的登录：

```toml
forced_chatgpt_workspace_id = "00000000-0000-0000-0000-000000000000"
```

把 UUID 替换为实际的 workspace ID（在 ChatGPT Enterprise 管理后台可以找到）。这防止了员工用个人 ChatGPT 账号登录 Codex、绕过企业数据策略的情况。如果登录的账号不属于指定 workspace，Codex 会拒绝这次登录。

`forced_login_method` 和 `forced_chatgpt_workspace_id` 可以组合使用：

```toml
forced_login_method = "chatgpt"
forced_chatgpt_workspace_id = "12345678-1234-1234-1234-123456789abc"
```

这样配置的效果是：必须用 ChatGPT 账号登录，且必须属于指定的企业 workspace。

### 4.4 Access Token 用于企业自动化

ChatGPT Enterprise 的管理员可以授权特定成员创建 Codex access token。这些 token 专门用于非交互式场景：

- 可信的内部部署脚本
- 定时任务调度器（cron、Airflow）
- 私有 CI runner（GitLab Runner、Jenkins Agent）
- 任何需要 ChatGPT workspace 访问权限但无法打开浏览器的场景

Access token 和 Platform API Key 的核心区别：

| 维度 | Access Token | API Key |
|------|-------------|---------|
| 来源 | ChatGPT Enterprise 后台生成 | OpenAI Platform 后台生成 |
| 权限体系 | ChatGPT workspace RBAC | API 组织权限 |
| 数据策略 | workspace 级别的保留和驻留设置 | API 组织的数据共享设置 |
| 云端功能 | 可用 | 受限 |
| 过期和轮换 | 支持管理员吊销和定期轮换 | 支持手动吊销 |

获取方式：管理员在 ChatGPT Enterprise 管理后台为特定成员开启 Codex access token 权限后，成员通过 ChatGPT 界面生成 token。生成的 token 值需要妥善保存，之后无法再次查看。

使用方式：

```bash
printenv CODEX_ACCESS_TOKEN | codex login --with-access-token
```

管理员可以设置 token 的过期时间、使用范围，也可以在员工离职时一键吊销所有 token。

### 4.5 企业 TLS 代理

很多企业网络使用 TLS 中间人代理（MITM proxy）来检查加密流量。这会导致 Codex 的 HTTPS 请求因为证书链不完整而失败。解决方法是告诉 Codex 信任企业根 CA 证书：

```bash
export CODEX_CA_CERTIFICATE=/path/to/corporate-root-ca.pem
codex login
```

如果 `CODEX_CA_CERTIFICATE` 没设，Codex 会回退到 `SSL_CERT_FILE` 环境变量。这个设置对登录流程、正常 HTTPS 请求、WebSocket 连接都生效。

把 CA 证书路径写入 shell 配置文件可以一劳永逸：

```bash
echo 'export CODEX_CA_CERTIFICATE=/etc/ssl/certs/corporate-root-ca.pem' >> ~/.zshrc
```

### 4.6 自定义 provider 的认证

企业在 config.toml 中定义自定义 provider 时，有三种认证方式可选：

```toml
# 方式一：使用 OpenAI 认证（适用于 LLM 代理）
[model_providers.proxy]
base_url = "https://llm-proxy.internal/v1"
requires_openai_auth = true

# 方式二：使用环境变量中的 API Key
[model_providers.internal]
base_url = "https://internal-model.internal/v1"
env_key = "INTERNAL_MODEL_API_KEY"

# 方式三：命令生成 bearer token（适用于短期 token）
[model_providers.cloud]
base_url = "https://cloud-model.example.com/v1"
[model_providers.cloud.auth]
command = "aws"
args = ["sso", "get-token", "--profile", "dev"]
timeout_ms = 5000
refresh_interval_ms = 300000
```

方式三的 `auth` 表适合 token 有效期短、需要定期刷新的场景。Codex 会执行指定的命令获取 bearer token，并在 token 快过期时自动重新执行命令刷新。`timeout_ms` 控制单次命令执行的超时时间，`refresh_interval_ms` 控制自动刷新的间隔。

---

## 5. 认证信息存储与安全

### 5.1 存储方式选择

Codex 通过 `cli_auth_credentials_store` 配置项控制凭据存储位置。这个选项在 `~/.codex/config.toml` 中设置：

```toml
# ~/.codex/config.toml

# file: 存到 auth.json 文件（明文 JSON）
# keyring: 存到操作系统钥匙串（加密）
# auto: 优先用 keyring，不可用时回退到 file（默认值）
cli_auth_credentials_store = "auto"
```

三种模式的工作方式：

**file** —— 凭据存储在 `~/.codex/auth.json`（或 `$CODEX_HOME/auth.json`）中。这是纯文本 JSON 文件，包含 access token 和 refresh token。优点是简单透明，容易在机器之间迁移。缺点是明文存储，任何有文件读权限的人都能看到 token。

**keyring** —— 凭据存储到操作系统自带的凭据管理器：
- macOS: Keychain Access（存储在登录钥匙串中）
- Linux: Secret Service API（GNOME Keyring / KDE Wallet）
- Windows: Windows Credential Manager

优点是 token 加密存储，不会以明文文件形式落盘。缺点是依赖桌面环境的 keyring 服务，在无头环境（headless server、Docker 容器、CI runner）中通常不可用。

**auto** —— 默认值。Codex 先尝试 keyring，如果系统没有 keyring 服务（比如 SSH 进 Linux 服务器），自动回退到 file 模式。这是最省心的选择。

### 5.2 auth.json 文件详解

位置：`$CODEX_HOME/auth.json`，默认即 `~/.codex/auth.json`。

文件内容是 JSON 格式，包含认证类型、access token、refresh token、过期时间等信息。这个文件就是你的登录凭据，必须严格保护：

- 确保 `.gitignore` 里有 `.codex/` 条目，防止意外提交
- 不要粘贴到 GitHub issue、Jira 工单或 Slack 聊天里
- 不要放在共享 NFS、世界可读的 `/tmp`、或者其他用户能读取的目录上
- `chmod 600 ~/.codex/auth.json` 限制文件权限

ChatGPT 登录的 token 会自动刷新。Codex 在你使用过程中，token 过期前会自动用 refresh token 换取新的 access token，所以活跃会话通常不需要重新走浏览器登录流程。这个刷新过程对你完全透明，不需要手动干预。

### 5.3 Keyring 的优劣势详细分析

**优势**：

- token 加密存储在系统级凭据管理器里，即使有人读取了 keyring 的数据库文件，没有登录密码也解密不了
- 不会以明文文件形式存在磁盘上，`ls ~/.codex/` 下不会有 `auth.json` 文件
- macOS Keychain 支持跨设备同步（iCloud Keychain），换机器后凭据自动同步
- 安全性由操作系统保障，经过了多年的安全审计

**劣势**：

- Linux 服务器上通常没有 GUI keyring 服务。headless 环境下 keyring 守护进程不会自动启动，Codex 回退到 file 模式
- SSH 会话里 keyring 可能无法解锁——特别是没有 `DISPLAY` 环境变量或 D-Bus session 时
- Docker 容器里默认没有 keyring 服务，需要额外安装和配置 `dbus` + `gnome-keyring`
- CI/CD 环境（GitHub Actions、GitLab CI）里 keyring 不可用

在 CI/CD 或无头环境中，直接用 API Key（环境变量方式）是最省事的方案，不需要处理 keyring 兼容性问题。

### 5.4 登出流程

```bash
codex logout
```

这会删除所有存储的凭据——包括 ChatGPT OAuth token 和 API Key 缓存。无论你当前用的是哪种认证方式，`codex logout` 一视同仁地清除。

CLI 和 IDE 扩展共享凭据存储，从任一端登出后，另一端的凭据也会失效。下次使用时需要重新登录。

登出不会删除 `config.toml`、session 历史和其他配置文件，只清除认证信息。

### 5.5 共享机器的安全注意事项

在共享开发机、跳板机、或者多人使用的 CI runner 上，需要额外注意凭据安全：

1. **优先用 keyring 模式**。`cli_auth_credentials_store = "keyring"` 避免 token 以明文文件形式存在。每个用户的 keyring 只有自己的登录密码能解锁。

2. **用 CODEX_HOME 隔离**。设置 `CODEX_HOME` 到你的 home 目录下，和其他人的 Codex 数据分开：
   ```bash
   export CODEX_HOME=~/.codex-$(whoami)
   ```

3. **登出时确认清理**。`codex logout` 后检查 `~/.codex/auth.json` 是否已删除（如果是 file 模式的话）。养成用完即登出的习惯。

4. **离职流程**。如果有人离职，管理员可以在 ChatGPT Enterprise 后台直接吊销其所有 session 和 access token。本地缓存的 token 会因为服务端失效而自动不可用。

5. **Docker 容器里避免用 ChatGPT 登录**。容器销毁后 token 泄露风险更高。在容器里优先用 API Key 环境变量方式。

---

## 6. 常见认证问题排查

### "Authentication failed"

这个报错范围比较广，可能的原因：

- **Token 过期且自动刷新失败**：长时间（几天或几周）没有使用 Codex，refresh token 也过期了。解决：`codex logout && codex login` 重新走浏览器授权。
- **网络问题导致 OAuth 回调未到达**：防火墙拦截了 `localhost:1455` 的回调请求，或者浏览器没有正确跳转。解决：尝试 device code 方式 `codex login --device-auth`。
- **账号被停用或套餐过期**：ChatGPT 订阅到期或被取消。解决：检查 chatgpt.com 上的订阅状态。

排查步骤：

```bash
# 1. 重新登录
codex logout
codex login

# 2. 如果问题持续，检查登录日志
cat ~/.codex/log/codex-login.log

# 3. 跑完整诊断
codex doctor
```

`codex-login.log` 是 `codex login` 命令专用的日志文件，包含浏览器登录和 device code 流程的详细日志，包括网络请求、token 交换、错误码等。向 OpenAI 支持提交工单时，这个日志是重要的诊断信息。

### "Rate limit exceeded"

套餐额度用完了。Codex 的 ChatGPT 登录走的是每 5 小时窗口的消息配额。这个窗口是滑动的——不是"北京时间 0-5 点"这种固定时段，而是从你第一条消息开始算 5 小时。

解决方式（按优先级排序）：

1. **等待额度窗口重置**。最省事，等之前的消息移出 5 小时窗口后自动恢复。
2. **切换到 API Key 继续工作**。设好 `OPENAI_API_KEY` 环境变量，Codex 自动切换到 API Key 认证。按 token 付费，没有消息数限制。
3. **购买额外 credit**。Pro 套餐支持在额度用完后购买额外 credit。
4. **升级到更高额度套餐**。如果经常撞限，考虑从 Plus 升级到 Pro。

### "Model not available"

你的套餐不支持当前选择的模型。Free 和 Go 套餐只能用基础模型（如 gpt-4.1-mini），Plus 及以上才能用全部模型。

排查：

```bash
# 查看当前可用的模型列表
codex debug models

# 只看内置模型目录（不联网刷新）
codex debug models --bundled
```

然后切换到套餐支持的模型：

```bash
codex --model gpt-4.1-mini
```

或者在 config.toml 里永久设置默认模型：

```toml
model = "gpt-4.1-mini"
```

### API Key 格式错误

OpenAI API Key 以 `sk-` 开头，后面是一串字母数字字符。常见问题：

- **多了空格或换行符**：用 `echo $OPENAI_API_KEY | cat -A` 检查，正常输出不应该有 `^M`（回车）或 `$` 前有空格。
- **复制不完整**：确认 key 以 `sk-` 开头，长度通常在 50 个字符以上。
- **key 过期或被吊销**：到 platform.openai.com/api-keys 检查 key 的状态。如果 key 被删除了，只能重新创建。
- **引号问题**：shell 里的值如果包含特殊字符，需要用双引号包裹。确保 `export OPENAI_API_KEY="sk-..."` 的引号是成对的。

### 代理/中转导致的认证失败

如果你通过 `openai_base_url` 或自定义 provider 走代理：

```toml
# ~/.codex/config.toml
openai_base_url = "https://my-proxy.example.com/v1"
```

需要确认代理服务器正确转发 `Authorization` header。有些反向代理（Nginx、Cloudflare）默认会剥离或修改 `Authorization` header，需要在代理配置中显式允许。

如果是企业 TLS 代理导致 SSL 握手失败：

```bash
export CODEX_CA_CERTIFICATE=/path/to/corporate-root-ca.pem
```

也可以设置通用的 SSL 证书路径作为后备：

```bash
export SSL_CERT_FILE=/path/to/corporate-root-ca.pem
```

### 多账号切换

Codex 同一时间只维护一份凭据。如果你有多个 ChatGPT 账号（个人 + 公司），切换方法：

```bash
# 登出当前账号
codex logout

# 登录新账号
codex login
```

如果需要频繁切换，推荐用 `--profile` 方案：

```bash
# 创建两个 profile
# ~/.codex/personal.config.toml
model = "gpt-4.1-mini"

# ~/.codex/work.config.toml
model = "gpt-5.4"
```

然后分别登录：

```bash
# 登录个人账号
codex --profile personal

# 登录工作账号
codex --profile work
```

注意：`--profile` 只影响配置（模型、沙箱等），不隔离认证信息。如果两个 profile 需要不同的认证方式（比如一个用 ChatGPT 登录，一个用 API Key），需要配合 `CODEX_HOME` 环境变量做完整隔离。

### 用 codex doctor 全面诊断

遇到不明认证问题，先跑完整诊断：

```bash
codex doctor
```

输出覆盖以下检查项：

- 安装状态（二进制版本、路径）
- 配置文件解析（config.toml 语法、字段有效性）
- 认证状态（凭据是否存在、是否过期）
- 运行时环境（shell、终端、OS）
- Git 状态（仓库、远程 URL）
- App server 和 thread inventory

```bash
# 生成 JSON 格式的诊断报告（提交工单时有用）
codex doctor --json

# 只看摘要
codex doctor --summary
```

---

## 7. 多环境认证策略

### 7.1 开发机：ChatGPT 登录

日常开发用 ChatGPT 账号登录，走套餐额度，成本固定：

```bash
codex login
# 浏览器授权，一次完成
# 活跃使用期间 token 自动续期，不需要反复登录
```

推荐配合 keyring 存储模式，避免明文 token 落盘：

```toml
# ~/.codex/config.toml
cli_auth_credentials_store = "keyring"
```

### 7.2 CI/CD：API Key

自动化流水线用 API Key，按量付费，没有 5 小时窗口限制：

```yaml
# GitHub Actions 示例
jobs:
  lint-fix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Codex
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          codex exec --sandbox workspace-write \
            "Fix all ESLint errors in src/ without changing behavior"
```

API Key 存在 GitHub Secrets 里，不暴露在代码或日志中。Codex 自动检测到 `OPENAI_API_KEY` 环境变量，跳过交互式登录。

OpenAI 官方建议不要在不受信任或公开环境里运行 Codex。即使是 CI 环境，也要确保 runner 是私有的（private runner），不要在公开的 GitHub Actions runner 上跑。

### 7.3 不同项目用不同 Profile

如果不同项目需要不同的模型、provider 或配置，用 profile 做隔离：

```bash
# ~/.codex/work.config.toml
model = "gpt-5.4"
cli_auth_credentials_store = "keyring"

# ~/.codex/personal.config.toml
model = "gpt-4.1-mini"
cli_auth_credentials_store = "file"
```

启动时指定 profile：

```bash
codex --profile work
codex --profile personal
```

Profile 文件放在 `$CODEX_HOME/` 目录下，命名为 `<profile-name>.config.toml`。Codex 会把 profile 的配置叠加在基础 `config.toml` 之上。

### 7.4 CODEX_HOME 环境变量完整隔离

`CODEX_HOME` 控制 Codex 的配置和缓存根目录。默认是 `~/.codex`。修改它可以让不同项目、不同团队使用完全独立的 Codex 环境：

```bash
# 项目 A 使用独立环境
export CODEX_HOME=~/.codex-project-a
mkdir -p "$CODEX_HOME"
printenv PROJECT_A_KEY | codex login --with-api-key

# 项目 B 使用另一个独立环境
export CODEX_HOME=~/.codex-project-b
mkdir -p "$CODEX_HOME"
printenv PROJECT_B_KEY | codex login --with-api-key
```

每个 `CODEX_HOME` 下有独立的 `auth.json`（凭据）、`config.toml`（配置）、`log/`（日志）和 session 历史。切换项目只需要切换环境变量。

不过要注意前面提到的限制：ChatGPT OAuth 登录的 refresh token 是单次使用的。如果同一份 `auth.json` 被复制到多个 `CODEX_HOME`，当其中一个 Codex 实例刷新了 token，其他副本就失效了。所以这种隔离方案更适合 API Key 场景，不适合 ChatGPT 登录凭据的多处共享。

---

## 8. 下一步

认证配好之后，就可以开始和 Codex 对话了。下一篇会覆盖：

- 第一次对话：启动交互模式、发送指令、查看执行结果
- 沙箱模式选择：read-only、workspace-write、danger-full-access 的区别和适用场景
- 常用斜杠命令速查：`/status`、`/clear`、`/review`、`/raw`、`/vim`

**延伸阅读：**

- [Codex Authentication 官方文档](https://developers.openai.com/codex/auth) — 认证方式的完整参考
- [Codex CLI 命令行参考](https://developers.openai.com/codex/cli/reference) — 所有命令和参数详解
- [Codex 配置参考](https://developers.openai.com/codex/config-reference) — config.toml 和 requirements.toml 全字段说明
- [Codex Access Tokens 文档](https://developers.openai.com/codex/authentication/access-tokens) — 企业 access token 的创建、轮换和吊销
- [系列上一篇：安装与环境搭建](./02-install-guide.md)

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
