# 环境变量配置

> 更新日期：2025/06

**TL;DR：** 环境变量是 Claude Code 最灵活的配置层——切换模型、走代理、关遥测、调超时，全靠它。和 settings.json 配合使用时，搞清楚优先级就不会踩坑。

## 为什么这很重要

上一篇文章讲了 settings.json 的四个层级（全局 / 项目 / 本地 / managed），这些是"写进文件、长期生效"的配置。但有些东西不适合写进文件：

- API key 不该提交到 git
- 临时切模型只想当前终端生效
- CI 环境和本地环境的网络配置完全不同
- 企业代理和本地开发的代理地址不同

环境变量解决的就是这类问题：不碰文件、按需覆盖、进程隔离。

Claude Code 有 150+ 个环境变量。大部分你不需要知道，本文只整理实际会用到的那部分，按场景分组。

## 环境变量速查

设置方式三种，效果一样：

```bash
# 1. 启动时临时设置
ANTHROPIC_MODEL=opus claude

# 2. 写进 shell 配置（~/.zshrc / ~/.bashrc），每次生效
export ANTHROPIC_MODEL=opus

# 3. 通过 settings.json 的 env 字段设置（见第 39 篇）
# 适合项目级或团队级的固定变量
```

## 模型和推理相关

这部分变量控制 Claude Code 用什么模型、怎么推理。

### 选择模型

| 变量 | 作用 | 示例 |
|------|------|------|
| `ANTHROPIC_MODEL` | 设置当前会话使用的模型 | `opus`, `claude-sonnet-4-6` |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | 覆盖 `opus` 别名对应的实际模型 | `claude-opus-4-8` |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | 覆盖 `sonnet` 别名对应的实际模型 | `claude-sonnet-4-6` |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | 覆盖 `haiku` 别名对应的实际模型 | `claude-haiku-4-5` |
| `CLAUDE_CODE_SUBAGENT_MODEL` | 子 agent 使用的模型，设 `inherit` 继承主会话 | `sonnet`, `inherit` |

```bash
# 当前终端用 Opus
ANTHROPIC_MODEL=opus claude

# 把 sonnet 别名钉到指定版本（不会随系统更新变动）
export ANTHROPIC_DEFAULT_SONNET_MODEL=claude-sonnet-4-6

# 子 agent 一律用 haiku（省 token）
export CLAUDE_CODE_SUBAGENT_MODEL=haiku
```

`ANTHROPIC_MODEL` 和 `/model` 命令的区别：`ANTHROPIC_MODEL` 只影响启动时的那一会话，不会持久化。`/model` 里的 Enter 会保存到 settings.json 影响后续会话（项目/managed settings 优先的情况除外）。

### 推理深度

| 变量 | 作用 | 可选值 |
|------|------|--------|
| `CLAUDE_CODE_EFFORT_LEVEL` | 设置推理深度，优先级最高 | `low`, `medium`, `high`, `xhigh`, `max`, `auto` |
| `MAX_THINKING_TOKENS` | 思考 token 预算上限，设 `0` 关闭思考 | 数字 |
| `CLAUDE_CODE_DISABLE_THINKING` | 强制关闭扩展思考 | `1` |

```bash
# 临时用最高推理
CLAUDE_CODE_EFFORT_LEVEL=max claude -p "分析这段架构的问题"

# 关闭思考（省 token，但回答质量会下降）
export CLAUDE_CODE_DISABLE_THINKING=1
```

`CLAUDE_CODE_EFFORT_LEVEL` 的优先级高于 `/effort` 命令和 settings.json 里的 `effortLevel`。设了环境变量，其他都不好使。

### 输出和上下文

| 变量 | 作用 | 默认值 |
|------|------|--------|
| `CLAUDE_CODE_MAX_OUTPUT_TOKENS` | 单次回复最大 token 数 | 模型默认值 |
| `CLAUDE_CODE_MAX_TURNS` | agent 最大轮次（同 `--max-turns`） | 无限 |
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | 覆盖上下文窗口大小（需同时设 `DISABLE_COMPACT`） | 模型默认值 |
| `CLAUDE_CODE_MAX_RETRIES` | API 请求失败重试次数 | 10 |

```bash
# CI 里限制轮次，防止跑飞
CLAUDE_CODE_MAX_TURNS=5 claude -p "修复 lint 错误"
```

### 自定义模型选项

通过网关或代理接入非标准模型时用：

| 变量 | 作用 |
|------|------|
| `ANTHROPIC_CUSTOM_MODEL_OPTION` | 在 `/model` 选择器里添加一个自定义模型 |
| `ANTHROPIC_CUSTOM_MODEL_OPTION_NAME` | 自定义模型的显示名 |
| `ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION` | 自定义模型的描述 |

```bash
export ANTHROPIC_CUSTOM_MODEL_OPTION="my-gateway/claude-opus-4-7"
export ANTHROPIC_CUSTOM_MODEL_OPTION_NAME="Opus via Gateway"
export ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION="通过内部网关路由的 Opus"
```

## 认证和 Provider

这部分决定 Claude Code 连哪个 API、用什么身份。

### API Key

| 变量 | 作用 |
|------|------|
| `ANTHROPIC_API_KEY` | API 密钥，设了会覆盖订阅登录 |
| `ANTHROPIC_AUTH_TOKEN` | 自定义 Authorization header（自动加 `Bearer` 前缀） |

**注意**：设了 `ANTHROPIC_API_KEY`，即使在交互模式下登录了 Max/Pro 订阅，API key 也会优先使用（非交互模式下直接覆盖，交互模式下会提示一次确认）。想切回订阅：`unset ANTHROPIC_API_KEY`。

### 第三方 Provider

| 变量 | 作用 |
|------|------|
| `CLAUDE_CODE_USE_BEDROCK` | 设为 `1` 使用 Amazon Bedrock |
| `CLAUDE_CODE_USE_VERTEX` | 设为 `1` 使用 Google Vertex AI |
| `CLAUDE_CODE_USE_FOUNDRY` | 设为 `1` 使用 Microsoft Foundry |
| `CLAUDE_CODE_USE_ANTHROPIC_AWS` | 设为 `1` 使用 Claude Platform on AWS |

### Provider 端点覆盖

| 变量 | 作用 |
|------|------|
| `ANTHROPIC_BASE_URL` | 覆盖 Anthropic API 端点，走代理/网关时用 |
| `ANTHROPIC_BEDROCK_BASE_URL` | 覆盖 Bedrock 端点 |
| `ANTHROPIC_VERTEX_BASE_URL` | 覆盖 Vertex AI 端点 |
| `ANTHROPIC_FOUNDRY_BASE_URL` | 覆盖 Foundry 端点 |
| `ANTHROPIC_AWS_BASE_URL` | 覆盖 Claude Platform on AWS 端点 |

```bash
# 通过代理服务器连接
export ANTHROPIC_BASE_URL=https://my-proxy.example.com/v1
export ANTHROPIC_API_KEY=sk-ant-xxx

# Bedrock 环境
export CLAUDE_CODE_USE_BEDROCK=1
export ANTHROPIC_DEFAULT_OPUS_MODEL=us.anthropic.claude-opus-4-8
```

Provider 的 pinned model 配置要配合 `ANTHROPIC_DEFAULT_*_MODEL` 使用。Bedrock 要用 inference profile ARN，Vertex 用 version name，Foundry 用 deployment name。

### 跳过认证

当你用 LLM 网关代签请求时：

```bash
export CLAUDE_CODE_SKIP_BEDROCK_AUTH=1     # 跳过 Bedrock 的 AWS 认证
export CLAUDE_CODE_SKIP_VERTEX_AUTH=1      # 跳过 Vertex 的 Google 认证
export CLAUDE_CODE_SKIP_FOUNDRY_AUTH=1     # 跳过 Foundry 的 Azure 认证
```

## 网络和代理

企业环境和特殊网络下的常用配置。

| 变量 | 作用 |
|------|------|
| `HTTP_PROXY` | HTTP 代理地址 |
| `HTTPS_PROXY` | HTTPS 代理地址 |
| `NO_PROXY` | 不走代理的域名列表 |
| `API_TIMEOUT_MS` | API 请求超时（默认 600000，即 10 分钟） |
| `CLAUDE_CODE_PROXY_RESOLVES_HOSTS` | 设为 `1` 让代理做 DNS 解析 |

```bash
# 企业代理
export HTTPS_PROXY=http://proxy.corp.example.com:8080
export NO_PROXY=localhost,127.0.0.1,internal.corp.example.com

# 网络慢，加大超时
export API_TIMEOUT_MS=900000
```

### TLS 和证书

| 变量 | 作用 |
|------|------|
| `CLAUDE_CODE_CERT_STORE` | CA 证书来源，默认 `bundled,system` |
| `CLAUDE_CODE_CLIENT_CERT` | mTLS 客户端证书路径 |
| `CLAUDE_CODE_CLIENT_KEY` | mTLS 客户端私钥路径 |

```bash
# 企业自签证书
export CLAUDE_CODE_CERT_STORE=system

# mTLS 认证
export CLAUDE_CODE_CLIENT_CERT=/path/to/cert.pem
export CLAUDE_CODE_CLIENT_KEY=/path/to/key.pem
```

## 路径和目录

控制 Claude Code 的文件系统行为。

| 变量 | 作用 | 默认值 |
|------|------|--------|
| `CLAUDE_CONFIG_DIR` | 配置目录 | `~/.claude` |
| `CLAUDE_CODE_TMPDIR` | 临时文件目录 | `/tmp`（macOS），`os.tmpdir()`（Linux/Windows） |
| `CLAUDE_ENV_FILE` | 每次 Bash 命令前加载的脚本文件路径 | — |

```bash
# 多账号并行：不同配置目录
alias claude-work='CLAUDE_CONFIG_DIR=~/.claude-work claude'
alias claude-personal='CLAUDE_CONFIG_DIR=~/.claude-personal claude'

# CI 环境把临时文件放指定位置
export CLAUDE_CODE_TMPDIR=/build/tmp
```

`CLAUDE_CONFIG_DIR` 是一个很实用的变量。改了它，settings、credentials、session history、plugins 全部跟着走。多账号并行时特别好用。

### Bash 命令控制

| 变量 | 作用 | 默认值 |
|------|------|--------|
| `BASH_DEFAULT_TIMEOUT_MS` | Bash 命令默认超时 | 120000（2 分钟） |
| `BASH_MAX_TIMEOUT_MS` | Bash 命令最大超时 | 600000（10 分钟） |
| `BASH_MAX_OUTPUT_LENGTH` | Bash 输出截断长度 | — |

```bash
# CI 里加长超时，编译慢的项目
export BASH_DEFAULT_TIMEOUT_MS=300000
export BASH_MAX_TIMEOUT_MS=1200000
```

## 遥测和调试

控制 Claude Code 发不发送数据、调试信息写哪。

### 遥测控制

| 变量 | 作用 |
|------|------|
| `DISABLE_TELEMETRY` | 设为 `1` 关闭遥测 |
| `DO_NOT_TRACK` | 同上，设 `1` 关闭遥测（跨工具惯例） |
| `DISABLE_ERROR_REPORTING` | 设为 `1` 关闭 Sentry 错误上报 |
| `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` | 一次性关闭遥测 + 自动更新 + 反馈 + 错误上报 |

```bash
# 完全静默
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

企业环境对数据外发有合规要求的，推荐直接设 `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`。

### 调试

| 变量 | 作用 |
|------|------|
| `DEBUG` | 设为 `1` 开启调试日志 |
| `CLAUDE_CODE_DEBUG_LOGS_DIR` | 调试日志文件路径（默认 `~/.claude/debug/<session-id>.txt`） |
| `CLAUDE_CODE_DEBUG_LOG_LEVEL` | 日志级别：`verbose`, `debug`, `info`, `warn`, `error` |

```bash
# 排查问题时开调试
DEBUG=1 claude

# 只看关键日志
export CLAUDE_CODE_DEBUG_LOG_LEVEL=warn
```

注意 `DEBUG=1` 只认这几个值：`1`, `true`, `yes`, `on`。像 `DEBUG=express:*` 这种给其他工具用的命名空间格式不会触发 Claude Code 的调试模式。

### OpenTelemetry

| 变量 | 作用 |
|------|------|
| `CLAUDE_CODE_ENABLE_TELEMETRY` | 设为 `1` 启用 OTel 数据收集 |
| `OTEL_LOG_USER_PROMPTS` | 设为 `1` 在 OTel 日志里记录用户 prompt |
| `OTEL_LOG_TOOL_CONTENT` | 设为 `1` 记录工具输入输出内容 |

OTel 默认不记录用户 prompt 和工具内容（保护敏感数据）。需要时手动打开。

## 功能开关

按需开关特定功能。

| 变量 | 作用 |
|------|------|
| `DISABLE_AUTOUPDATER` | 关闭自动更新（手动 `claude update` 仍可用） |
| `DISABLE_UPDATES` | 完全禁止更新（比上面更严格） |
| `DISABLE_PROMPT_CACHING` | 关闭所有模型的 prompt 缓存 |
| `CLAUDE_CODE_DISABLE_1M_CONTEXT` | 禁用 1M 上下文窗口 |
| `CLAUDE_CODE_DISABLE_AGENT_VIEW` | 关闭后台 agent 和 agent view |
| `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING` | 关闭文件检查点（`/rewind` 不可用） |
| `CLAUDE_CODE_DISABLE_AUTO_MEMORY` | 关闭自动记忆 |

```bash
# 企业环境：禁止自动更新，统一分发版本
export DISABLE_UPDATES=1

# 关闭 1M 上下文（合规要求）
export CLAUDE_CODE_DISABLE_1M_CONTEXT=1

# 禁用后台 agent（只需要简单交互）
export CLAUDE_CODE_DISABLE_AGENT_VIEW=1
```

### Prompt 缓存控制

| 变量 | 作用 |
|------|------|
| `DISABLE_PROMPT_CACHING` | 全部关闭 |
| `DISABLE_PROMPT_CACHING_HAIKU` | 只关 Haiku 的 |
| `DISABLE_PROMPT_CACHING_SONNET` | 只关 Sonnet 的 |
| `DISABLE_PROMPT_CACHING_OPUS` | 只关 Opus 的 |
| `ENABLE_PROMPT_CACHING_1H` | 缓存 TTL 从 5 分钟提到 1 小时 |

`ENABLE_PROMPT_CACHING_1H` 适合长时间反复调用同一 system prompt 的场景（CI/CD、批量处理）。注意 1 小时缓存写入费用更高。

## 子进程和环境隔离

控制 Claude Code 启动的子进程能拿到什么环境。

| 变量 | 作用 |
|------|------|
| `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` | 设为 `1` 从子进程环境中剥离 API key 和云凭证 |
| `CLAUDE_CODE_MCP_ALLOWLIST_ENV` | 设为 `1` 让 stdio MCP 服务器只拿到安全基线环境 + 配置的 env |
| `CLAUDECODE` | 子进程里自动设为 `1`，用于检测是否在 Claude Code 子进程内运行 |

```bash
# 安全加固：子进程拿不到敏感凭证
export CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1
```

`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB` 是安全敏感环境的重要配置。开了之后，Bash 工具、hooks、MCP stdio 服务器这些子进程都看不到 `ANTHROPIC_API_KEY` 等凭证。主进程仍然保留凭证用于 API 调用，但子进程拿不到，降低 prompt 注入攻击窃取密钥的风险。

## 覆盖优先级

理解优先级，才能不踩坑。从高到低：

```
1. CLI flags（--model, --effort 等）
2. 环境变量（ANTHROPIC_MODEL, CLAUDE_CODE_EFFORT_LEVEL 等）
3. 交互命令（/model, /effort 保存到 user settings）
4. 项目 settings.json（.claude/settings.json）
5. 用户 settings.json（~/.claude/settings.json）
6. Managed settings（企业管理员配置）
7. 系统默认值
```

几个容易搞混的情况：

**API key 优先级**：`ANTHROPIC_API_KEY` 环境变量 > 订阅登录。设了 key 就不会走订阅。想切回订阅必须 unset。

**模型优先级**：`--model` flag > `ANTHROPIC_MODEL` 环境变量 > settings.json 的 `model` 字段。但 `ANTHROPIC_DEFAULT_*_MODEL` 是另一回事——它不是直接选模型，而是控制别名解析到哪个实际模型。

**effort 优先级**：`CLAUDE_CODE_EFFORT_LEVEL` 环境变量 > `/effort` 命令 > settings.json 的 `effortLevel`。环境变量一旦设了，其他都无效。

**provider 路由**：`CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST` 设了之后，settings.json 里的 provider 选择、endpoint、认证变量全部被忽略。这是宿主平台（比如云 IDE 嵌入 Claude Code）用来防止用户绕过路由的。

### settings.json 的 env 字段

settings.json 里有个 `env` 字段，也可以设置环境变量：

```json
{
  "env": {
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-5",
    "DISABLE_TELEMETRY": "1"
  }
}
```

这和直接 export 的区别：`env` 字段跟着 settings 层级走（全局/项目/本地/managed），适合固定配置。shell 里的 export 适合临时覆盖。

两者同时存在时，shell 环境变量优先于 `env` 字段。

## 实战场景

### 场景 1：CI/CD 环境基础配置

```bash
# .gitlab-ci.yml 或 GitHub Actions 的 env
export ANTHROPIC_API_KEY=${{ secrets.ANTHROPIC_API_KEY }}
export CLAUDE_CODE_MAX_TURNS=5
export DISABLE_TELEMETRY=1
export DISABLE_AUTOUPDATER=1
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

### 场景 2：企业代理 + Bedrock

```bash
export CLAUDE_CODE_USE_BEDROCK=1
export ANTHROPIC_DEFAULT_SONNET_MODEL=us.anthropic.claude-sonnet-4-6
export ANTHROPIC_DEFAULT_OPUS_MODEL=us.anthropic.claude-opus-4-8
export HTTPS_PROXY=http://proxy.corp.example.com:8080
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
```

### 场景 3：本地开发多账号

```bash
# ~/.zshrc
alias claude-work='CLAUDE_CONFIG_DIR=~/.claude-work claude'
alias claude-personal='CLAUDE_CONFIG_DIR=~/.claude-personal claude'
```

### 场景 4：安全加固

```bash
# 子进程看不到凭证，降低 prompt 注入风险
export CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1
# MCP 服务器拿不到完整 shell 环境
export CLAUDE_CODE_MCP_ALLOWLIST_ENV=1
```

## 关键要点

- 环境变量适合临时覆盖、敏感配置、CI/CD 和多账号场景，不适合持久配置（用 settings.json）
- `ANTHROPIC_API_KEY` 设了就走 API key，不管订阅登录——这是最常见的"为什么我还在扣 API 额度"的原因
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` 一行解决企业合规的数据外发问题
- 优先级：CLI flags > 环境变量 > settings.json > 系统默认
- `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` 是安全敏感环境必开的选项
- Provider 切换用 `CLAUDE_CODE_USE_BEDROCK` / `USE_VERTEX` / `USE_FOUNDRY`，别混着用 `ANTHROPIC_BASE_URL`

## 延伸阅读

- [Environment variables - Claude Code 官方文档](https://code.claude.com/docs/en/env-vars) — 完整的环境变量参考，150+ 个变量
- [Model configuration - Claude Code 官方文档](https://code.claude.com/docs/en/model-config) — 模型别名、pinned model、effort level 的详细说明
- [Network configuration - Claude Code 官方文档](https://code.claude.com/docs/en/network-config) — 企业网络和代理配置
- 本系列第 39 篇《Settings 文件》— settings.json 四层结构和 env 字段
