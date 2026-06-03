# 登录与认证

> 更新日期：2025/06

## TL;DR

Claude Code 有六种认证方式，按优先级从高到低：云厂商代理（Bedrock/Vertex）→ `ANTHROPIC_AUTH_TOKEN` → `ANTHROPIC_API_KEY` → `apiKeyHelper` → `CLAUDE_CODE_OAUTH_TOKEN` → 订阅 OAuth。大多数开发者用 `claude` 登录 Claude 账号即可；企业用户走 Bedrock 或 Vertex；CI/CD 管道用 `claude setup-token` 生成长期 token。

## 认证方式一览

| 方式 | 环境变量 / 命令 | 适合谁 | 费用来源 |
|------|-----------------|--------|----------|
| Claude 订阅登录 | `claude` → 浏览器 OAuth | 个人开发者、小团队 | Pro/Max/Team 月费 |
| API Key | `ANTHROPIC_API_KEY` | 有 Console 账号的开发者 | API 按量计费 |
| Bearer Token | `ANTHROPIC_AUTH_TOKEN` | LLM 网关 / 代理场景 | 取决于后端 |
| OAuth Token（CI） | `CLAUDE_CODE_OAUTH_TOKEN` | CI/CD 自动化 | 绑定订阅计划 |
| Amazon Bedrock | `CLAUDE_CODE_USE_BEDROCK=1` | AWS 企业客户 | AWS 账单 |
| Google Vertex AI | `CLAUDE_CODE_USE_VERTEX=1` | GCP 企业客户 | GCP 账单 |
| Microsoft Foundry | `CLAUDE_CODE_USE_FOUNDRY=1` | Azure 企业客户 | Azure 账单 |

## Claude 订阅登录

这是最直接的方式。终端运行 `claude`，首次启动会弹出浏览器完成 OAuth 授权，授权后凭证自动存储到本地。之后每次启动会自动读取已存储的凭证，不需要重复登录。

订阅等级决定用量上限：

- **Pro**（$20/月）：基础额度，适合日常开发、写脚本、改小项目
- **Max**（$100/月 或 $200/月）：更高额度，适合重度用户、大型项目重构、长时间 agent 任务
- **Team**（$25/席位/月）：团队共享，管理员集中管理成员和用量，支持集中计费
- **Enterprise**：按需定价，支持 SSO 和域名捕获，适合有合规要求的企业

登录后用 `/status` 查看当前认证状态和订阅类型。换号用 `/logout` 再重新 `/login`。如果在公司电脑和个人电脑上切换使用，两台机器可以分别登录不同账号，互不影响——凭证是本地的。

一个容易忽略的细节：Team 计划有 $150/席位的 Premium 档位，可以解锁更高的 API 调用额度。如果你的团队用量较大，管理员可能需要升级到这个档位。

## API Key 登录

在 [Anthropic Console](https://console.anthropic.com/) 创建 API Key，然后通过环境变量传入：

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
claude
```

也可以写进 `.env` 或 shell 配置文件（`~/.bashrc`、`~/.zshrc`）。注意不要把 key 提交到 Git 仓库——加进 `.gitignore`。团队项目里建议用 `direnv` 或 `dotenv` 管理环境变量，避免 key 泄露到版本历史。

API Key 走按量计费，和订阅的固定月费互不影响。如果你同时设了订阅登录和 API Key，Claude Code 会优先用 API Key（优先级更高）。想切回订阅登录，`unset ANTHROPIC_API_KEY` 再重启即可。

另一个容易混淆的变量是 `ANTHROPIC_AUTH_TOKEN`。它和 API Key 的区别在于：API Key 用在请求头 `x-api-key` 里，而 Auth Token 用在 `Authorization: Bearer` 头里。如果你的组织通过 LLM 网关（比如 LiteLLM、OpenRouter）代理请求，网关通常要求 Bearer Token，这时设 `ANTHROPIC_AUTH_TOKEN` 而不是 `ANTHROPIC_API_KEY`。

如果你需要自定义 API 端点（比如指向自建代理），用 `ANTHROPIC_BASE_URL` 指定地址：

```bash
export ANTHROPIC_BASE_URL="https://your-proxy.example.com/v1"
export ANTHROPIC_API_KEY="sk-ant-..."
```

## SSO / 企业登录

Claude for Enterprise 支持通过 SAML 或 OIDC 接入企业 IdP（如 Okta、Azure AD、OneLogin）。管理员在 Anthropic 后台配置好 SSO 连接后，团队成员用企业邮箱登录即可，不需要单独注册 Anthropic 账号。登录流程和普通订阅登录一样——终端运行 `claude`，浏览器弹出后用企业账号完成 SSO 认证。

域名捕获（Domain Capture）功能允许管理员自动接管某个域名下所有用户的账号归属权。启用后，该域名的新注册用户会自动归入企业管理，已有用户下次登录时也会被纳入。这确保企业数据不外泄，员工离职后管理员可以回收账号。

企业用户如果不想让流量经过 Anthropic 直连，可以走下一节的云厂商通道。云厂商通道的另一个好处是账单合并——不用单独向 Anthropic 付款，所有费用走 AWS/GCP/Azure 的月度账单。

## 第三方 Provider

### Amazon Bedrock

```bash
export CLAUDE_CODE_USE_BEDROCK=1
claude
```

需要先在 AWS 控制台开通 Bedrock 并申请 Claude 模型访问权限。模型访问通常需要 1-2 个工作日审批，建议提前申请。认证走 AWS 标准流程（IAM Role、Access Key、或者 `aws sso login`）。在 EC2 上跑 Claude Code 的话，推荐用 IAM Role 挂载权限，不需要硬编码 Access Key。

相关环境变量：

- `ANTHROPIC_MODEL`：指定模型 ID（如 `anthropic.claude-sonnet-4-20250514`）
- `AWS_REGION`：指定区域（默认 `us-east-1`，Bedrock 支持的区域有限，参见 AWS 文档）
- `AWS_PROFILE`：指定 AWS credential profile（多账号场景下有用）

Bedrock 的优势在于数据不离开 AWS 基础设施，适合对数据主权有要求的企业。费用走 AWS 月度账单，可以用 AWS 预算和成本告警来管控。

### Google Vertex AI

```bash
export CLAUDE_CODE_USE_VERTEX=1
claude
```

需要 GCP 项目已启用 Vertex AI API，且已完成 Claude 模型的访问申请。认证走 `gcloud auth application-default login` 或 Service Account。在 GCE / Cloud Run 上运行时，Service Account 会自动挂载，不需要额外配置。

相关环境变量：

- `ANTHROPIC_MODEL`：指定模型（如 `claude-sonnet-4@20250514`）
- `CLOUD_ML_REGION`：指定区域（默认 `us-east5`，部分区域可能不支持所有模型）
- `ANTHROPIC_VERTEX_PROJECT_ID`：GCP 项目 ID（必填）

和 Bedrock 类似，Vertex 的数据留在 GCP 基础设施内，费用走 GCP 月度账单。如果你已经用了 GCP 的其他 AI 服务（比如 Gemini），把 Claude 也放在 Vertex 上管理会比较统一。

### Microsoft Foundry

```bash
export CLAUDE_CODE_USE_FOUNDRY=1
claude
```

走 Azure 认证，模型通过 Azure AI Foundry 调用。适合已深度绑定 Azure 生态的企业。

## 认证状态管理

### 查看当前认证

```bash
claude /status
```

显示当前使用的认证方式、订阅类型、模型信息。

### 切换认证方式

改变环境变量后重启 `claude` 即可切换。优先级规则：

1. 云厂商标记（`CLAUDE_CODE_USE_BEDROCK` 等）最高
2. `ANTHROPIC_AUTH_TOKEN`（Bearer Token）
3. `ANTHROPIC_API_KEY`
4. `apiKeyHelper`（动态凭证刷新）
5. `CLAUDE_CODE_OAUTH_TOKEN`（CI token）
6. 订阅 OAuth 最低

### CI/CD 长期 Token

```bash
claude setup-token
```

生成有效期约 1 年的 OAuth token，写入 `CLAUDE_CODE_OAUTH_TOKEN` 环境变量。适合 GitHub Actions、GitLab CI 等自动化场景，避免在流水线里暴露 API Key。

实际操作流程：在本地终端运行 `claude setup-token`，按提示完成认证后，终端会输出一段 token 字符串。把这段 token 存到 CI 平台的 Secrets 里（比如 GitHub Repository Secrets），在 workflow 文件里设为环境变量：

```yaml
env:
  CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
```

token 过期后重新运行一次 `claude setup-token`，更新 CI 平台的 Secret 即可。

### 动态凭证（apiKeyHelper）

如果企业的凭证会定期轮换，可以通过配置 `apiKeyHelper` 指定一个脚本，Claude Code 每隔 5 分钟或在收到 401 响应时自动调用该脚本刷新凭证。

### 凭证存储位置

| 系统 | 路径 |
|------|------|
| macOS | Keychain（系统钥匙串） |
| Linux | `~/.claude/.credentials.json`（权限 0600） |
| Windows | `%USERPROFILE%\.claude\.credentials.json` |

用 `CLAUDE_CONFIG_DIR` 可以自定义配置目录。

## 常见认证问题

### 1. WSL2 / SSH / 容器里无法打开浏览器

无头环境下浏览器弹不出来。终端会提示两种选择：按 `c` 复制授权链接到剪贴板，或者手动复制。在宿主机或任何有浏览器的机器上打开链接，完成授权后会得到一串 code，粘贴回终端即可。

### 2. 同时设了多个环境变量，不确定用的哪个

运行 `/status` 查看，或者逐一排查：`echo $ANTHROPIC_API_KEY`、`echo $CLAUDE_CODE_USE_BEDROCK`。高优先级的会覆盖低优先级。

### 3. API Key 报 401

检查几件事：key 是否还在 Console 里显示为 Active（有可能被撤销了）、复制时是否带上了多余字符（空格、换行、引号）、环境变量里是否有拼写错误。用 `echo "$ANTHROPIC_API_KEY"` 确认实际值。如果 key 是从密码管理器复制的，注意有些管理器会在末尾加换行。

### 4. Bedrock / Vertex 报权限不足

确认三件事：模型访问已申请通过、区域支持该模型、IAM / Service Account 有正确的调用权限。Bedrock 的模型访问通常需要单独申请。

### 5. Token 过期后怎么续期

订阅 OAuth 会自动刷新。API Key 不会过期（除非手动撤销）。CI Token 过期后重新运行 `claude setup-token`。`apiKeyHelper` 会自动刷新。

## 关键要点

- 六种认证方式有严格优先级，云厂商标记 > Bearer Token > API Key > apiKeyHelper > CI Token > 订阅 OAuth
- 个人开发者用订阅登录最省事，企业走 Bedrock 或 Vertex 合规且账单可控
- CI/CD 用 `claude setup-token` 生成 1 年有效期的 token，别把 API Key 写进流水线配置
- 凭证文件权限必须是 0600（仅用户可读写），Linux 上安装后检查一下
- `/status` 是排查认证问题的第一命令

## 延伸阅读

- [Claude Code 官方认证文档](https://code.claude.com/docs/en/authentication)
- [Bedrock / Vertex 企业部署对比](https://code.claude.com/docs/en/bedrock-vertex)
- [Anthropic Console API Key 管理](https://console.anthropic.com/)
- 系列下一篇：[08 - Windows/WSL/macOS/Linux 多平台安装](08-platform-differences.md)
