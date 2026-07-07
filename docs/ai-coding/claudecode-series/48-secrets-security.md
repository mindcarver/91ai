# Secrets 安全

> 更新日期：2025/06

**TL;DR：** Claude Code 能读你项目里的所有文件，包括 `.env`。它会自动加载 `.env` 到内存里，不需要你同意。子进程能继承你的 shell 环境变量，日志文件里可能留下敏感信息。这篇文章讲怎么用 deny 规则挡住不该读的文件、用 `SUBPROCESS_ENV_SCRUB` 剥离子进程凭据、管好 MCP 配置里的 key、以及在 CI 里安全地传递 secret。

## 为什么 Secrets 管理很重要

Claude Code 有三个特性，每个都跟 secrets 泄露直接相关：

1. **它读文件**——默认情况下，项目目录里的任何文件它都能读，包括 `.env`、`credentials.json`、`id_rsa`。它不会先问你"我能读这个吗"。用 Knostic 的说法：如果一个文件没有被明确 deny，它就是可访问的。

2. **它跑命令**——它 spawn 出来的子进程继承你的 shell 环境。如果你 shell 里 `export` 了 `AWS_SECRET_ACCESS_KEY`，Claude 跑的每一个 bash 命令都能看到。

3. **它记录对话**——每次会话的完整 transcript 存在 `~/.claude/` 下，包括所有文件内容和命令输出。如果你让 Claude 读了一个包含 API key 的配置文件，那个 key 就在 transcript 里了。

这三条加在一起，意味着你的 secret 有三条泄露路径：被模型读到、被子进程读到、被日志记录下来。下面逐个解决。

## Claude Code 接触 Secrets 的场景

先搞清楚 secret 藏在哪里，才能知道 Claude 能从哪里碰到它：

- **`.env` 文件**——Claude Code 使用 dotenv 机制，会自动加载 `.env`、`.env.local`、`.env.production` 等变体到运行时内存。这是最大的暴露面。
- **配置文件**——`.mcp.json`、`settings.json`、`docker-compose.yml` 里经常硬编码数据库 URL 和 API key。
- **云凭据文件**——`~/.aws/credentials`、`~/.gcp/keyfile.json`、`~/.ssh/id_rsa` 等。如果 Claude 能访问你的 home 目录（通过 `--add-dir` 或 `additionalDirectories`），这些也在射程内。
- **代码中的硬编码**——测试文件、示例代码里直接写死的 token。
- **日志输出**——Claude 跑命令时，命令的 stdout/stderr 会出现在对话中。如果命令输出了 secret（比如 `printenv`），它就被记录了。
- **CLAUDE.md 和 MEMORY.md**——这些文件是纯文本，没有访问控制。有人习惯把数据库连接串写在里面方便 Claude 理解项目结构。

## 环境变量的正确用法

### 哪些环境变量会被 Claude Code 读取

Claude Code 本身需要一些环境变量来工作：

- `ANTHROPIC_API_KEY`——API 认证。这个 key 会作为请求头发给 Anthropic，不进入对话上下文。
- `ANTHROPIC_BASE_URL`——API 代理地址。
- `CLAUDE_CODE_USE_BEDROCK`、`CLAUDE_CODE_USE_VERTEX`——云 provider 开关。

这些是 Claude Code 自身的运行配置，不是你项目的 secret。问题出在你项目的环境变量上。

### 错误做法 vs 正确做法

**错误：把项目 secret 放在 `.env` 文件里，不设防。**

```bash
# .env — Claude 会自动读到这个文件
DATABASE_URL=postgres://admin:s3cret@prod-db.example.com:5432/myapp
STRIPE_SECRET_KEY=sk_live_abc123...
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG...
```

Claude Code 启动时会自动加载这些值到进程内存。你不需要做任何操作，它就拿到了。

**正确：用 deny 规则阻止 Claude 读取。**

在 `.claude/settings.json` 或 `~/.claude/settings.json` 里：

```json
{
  "permissions": {
    "deny": [
      "Read(.env*)",
      "Read(./secrets/**)",
      "Read(./**/credentials.json)",
      "Read(./**/serviceAccountKey.json)"
    ]
  }
}
```

这告诉 Claude Code：永远不要读取匹配这些模式的文件。即使 Claude 想读，也会被拦住。

**正确：把 `.env` 移到项目目录外。**

```bash
# 不要放在项目根目录
# mv .env ~/.secrets/myproject.env

# 用符号链接的方式给应用用（Claude 不会读符号链接的目标）
# ln -s ~/.secrets/myproject.env .env
```

但这只是减少暴露面，不能完全消除。deny 规则更可靠。

### 子进程环境剥离

即使你阻止了 Claude 读文件，它 spawn 的 bash 子进程仍然能看到你的 shell 环境变量。比如你的 shell 里 export 了 `AWS_SECRET_ACCESS_KEY`，Claude 跑 `env` 命令就能拿到。

设置环境变量 `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1`：

```bash
# 在启动 Claude Code 之前
export CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1
claude
```

这会从子进程环境中剥离以下变量：

- 所有 `ANTHROPIC_*` 变量
- `AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN` 等 AWS 凭据
- Google Cloud 和 Azure 的认证变量

父进程（Claude Code 本身）仍然保留这些凭据用于发 API 请求，但子进程拿不到了。在 Linux 上，这还会把 bash 子进程放到隔离的 PID namespace 里，防止通过 `/proc` 读取宿主进程的环境变量。

这个变量对 CI 环境尤其重要。GitHub Actions、GitLab CI 都是通过环境变量注入 secret 的，如果不剥离，Claude 跑的任何命令都能看到。

## MCP Server 凭据管理

MCP server 的配置文件 `.mcp.json` 是另一个常见的 secret 泄露点。

### 问题所在

MCP server 经常需要 API key 来工作。很多教程教你在配置里直接写：

```json
// .mcp.json — 不要这样做
{
  "mcpServers": {
    "my-api": {
      "command": "node",
      "args": ["server.js"],
      "env": {
        "API_KEY": "sk-live-abc123..."
      }
    }
  }
}
```

这个文件在项目根目录，Claude Code 会读它。你的 API key 就这样进入了 Claude 的上下文窗口。

### 解决方案：引用环境变量

不要硬编码，用环境变量引用：

```json
// .mcp.json
{
  "mcpServers": {
    "my-api": {
      "command": "node",
      "args": ["server.js"],
      "env": {
        "API_KEY": "${MY_API_KEY}"
      }
    }
  }
}
```

然后在启动 Claude 之前在 shell 里 export：

```bash
export MY_API_KEY=sk-live-abc123...
claude
```

这样 `.mcp.json` 文件里没有明文 secret，Claude 读到的是 `${MY_API_KEY}` 这个占位符。

### 限制 MCP Server 的环境继承

默认情况下，stdio 类型的 MCP server 会继承你的完整 shell 环境。如果你的 shell 里有一堆 secret，MCP server 也能看到。

设置 `CLAUDE_CODE_MCP_ALLOWLIST_ENV=1`：

```bash
export CLAUDE_CODE_MCP_ALLOWLIST_ENV=1
```

这样 MCP server 启动时只拿到一个干净的基础环境，加上你在 `.mcp.json` 的 `env` 字段里显式声明的变量。不再继承你的整个 shell。

### 审查 MCP Server 的权限

参考 [43 - Permission Modes 全解](43-permission-modes-explained.md)，你应该只启用你信任的 MCP server。一个恶意的 MCP server 可以读取你传给它的所有数据。如果你在 MCP server 的配置里放了 secret，这个 server 的开发者（或入侵了这个 server 的人）理论上能拿到。

在 managed-settings.json 里显式启用白名单：

```json
{
  "enabledMcpjsonServers": ["github", "filesystem"]
}
```

不要用 `enableAllProjectMcpServers: true`。

## CI/CD 中的 Secrets

在 CI 环境里用 Claude Code（比如 [70 - GitHub Actions & GitLab CI](70-github-actions-gitlab-ci.md)），secrets 管理更敏感，因为整个流程是自动化的，没有人站在旁边审批每一步。

### GitHub Actions

GitHub 的 secret 通过 `secrets.*` context 注入，最终变成环境变量。Claude Code 的非交互模式（`claude -p`）会运行这些环境变量所在的命令。

**关键配置：**

```yaml
# .github/workflows/claude-code.yml
env:
  CLAUDE_CODE_SUBPROCESS_ENV_SCRUB: "1"   # 剥离子进程凭据
  CLAUDE_CODE_SKIP_PROMPT_HISTORY: "1"     # 不写 transcript 到磁盘
```

`CLAUDE_CODE_SKIP_PROMPT_HISTORY=1` 让这次会话不出现在 `--resume`、`--continue` 或上下箭头历史里。对于 CI 里处理 secret 的场景，这是必要的。

不要把 secret 放在 `env` 配置块里传给 Claude：

```yaml
# 错误——这些会出现在 Claude 的环境里
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

如果 Claude 跑 `printenv` 或者脚本里有日志输出，secret 就暴露在 CI 的日志里了。应该只在需要的步骤里注入，并且配合 `SUBPROCESS_ENV_SCRUB` 使用。

### Docker 和容器

如果你在 Docker 容器里跑 Claude Code（推荐做法），用 `--env-file` 而不是在 Dockerfile 里写 secret：

```bash
# 错误——secret 烤进镜像了
# Dockerfile 里写 ENV STRIPE_KEY=sk_live_xxx

# 正确——运行时注入
docker run --env-file ./secrets.env claude-code-image
```

`CLAUDE_CONFIG_DIR` 可以用来隔离不同项目的 Claude 配置：

```bash
docker run -e CLAUDE_CONFIG_DIR=/app/.claude claude-code-image
```

## 日志和对话记录中的泄露

### Transcript 文件

Claude Code 的对话记录存在 `~/.claude/projects/` 下。每个会话一个文件，包含完整的对话内容，包括 Claude 读到的文件内容和命令输出。

如果你的 API key 出现在对话中（比如 Claude 读了一个配置文件），它就在 transcript 里了。

**控制保留时间：**

在 managed-settings.json 里设置：

```json
{
  "cleanupPeriodDays": 7
}
```

默认值可能很长。对于处理敏感信息的项目，设为 7-14 天。过期的 transcript 会被自动删除。

**禁止写入 transcript：**

对于临时性的敏感操作，设置 `CLAUDE_CODE_SKIP_PROMPT_HISTORY=1`。这次会话不会被记录到磁盘。

### Debug 日志

如果你用 `--debug` 或 `DEBUG=1` 启动了 Claude Code，debug 日志写在 `~/.claude/debug/<session-id>.txt`。这些日志包含更详细的信息，包括 API 请求和响应。

Debug 日志不会被自动清理。用完后手动删除：

```bash
rm -rf ~/.claude/debug/
```

### 分享对话时的泄露

Claude Code 有时会提示你"与 Anthropic 分享会话"。如果你点了同意，完整的 transcript 会被发送。确保在分享前检查 transcript 里有没有敏感信息。

社区已经提出了 [transcript 脱敏功能的需求](https://github.com/anthropics/claude-code/issues/57772)，但截至本文写作时还没有内置的脱敏选项。

## 脱敏和最小暴露原则

核心思路只有一个：**给 Claude Code 它需要的最小权限，让它只看到它需要看到的东西。**

### 文件级别的隔离

```json
// .claude/settings.json
{
  "permissions": {
    "deny": [
      "Read(.env*)",
      "Read(./secrets/**)",
      "Read(./**/*.pem)",
      "Read(./**/*.key)",
      "Read(./**/credentials.json)",
      "Read(./**/serviceAccountKey.json)",
      "Bash(printenv:*)",
      "Bash(env:*)"
    ]
  }
}
```

最后两条——禁止 `printenv` 和 `env`——经常被忽略。即使你剥离了环境变量，如果有人（或 prompt injection）让 Claude 跑 `printenv`，所有还在环境里的变量都会输出到对话中。

### 网络级别的隔离

如果你的 Claude Code 通过代理（`ANTHROPIC_BASE_URL`）连接，禁止它直接访问外网：

```json
{
  "permissions": {
    "deny": [
      "WebFetch",
      "Bash(curl:*)",
      "Bash(wget:*)"
    ]
  }
}
```

这阻止了 prompt injection 通过 `curl` 把你的 secret 发送到攻击者服务器的路径。

### 用 CLAUDE.md 告诉 Claude 不要碰 secret

在项目的 `CLAUDE.md` 里加上一条规则：

```markdown
# 项目规则

- 不要读取 .env 文件、secrets/ 目录、或任何包含凭据的文件
- 如果需要数据库连接信息，使用环境变量占位符而不是实际值
- 不要在输出中打印 API key、token、密码等敏感信息
```

这不是硬性限制（Claude 可以忽略 CLAUDE.md 的指令），但配合 deny 规则使用时，形成了双重防护。

## 安全检查清单

对照这个清单检查你的 Claude Code 配置：

- [ ] `.env` 文件在 deny 规则里（`Read(.env*)`）
- [ ] `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` 已设置
- [ ] `.mcp.json` 里没有明文 secret（用 `${VAR}` 占位符）
- [ ] `CLAUDE_CODE_MCP_ALLOWLIST_ENV=1` 已设置（限制 MCP server 环境继承）
- [ ] `cleanupPeriodDays` 设为 7-14 天
- [ ] `CLAUDE_CODE_SKIP_PROMPT_HISTORY=1` 在 CI 里已设置
- [ ] `Bash(printenv:*)` 和 `Bash(env:*)` 在 deny 规则里
- [ ] `WebFetch` 和 `Bash(curl:*)` 在 deny 规则里（或你确认需要网络访问）
- [ ] MCP server 只启用你审查过的（不用 `enableAllProjectMcpServers`）
- [ ] SSH key 和云凭据文件不在 Claude 的工作目录或 `additionalDirectories` 里

## 关键要点

1. Claude Code 自动加载 `.env` 文件，不需要你同意。如果你有 secret 在 `.env` 里，用 deny 规则挡住。
2. 子进程继承你的 shell 环境。用 `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` 剥离凭据。
3. MCP 配置文件里的 secret 用环境变量引用，不要硬编码。
4. 对话记录是明文文件。控制保留时间，敏感会话用 `SKIP_PROMPT_HISTORY`。
5. 在 CI 里同时开 `SUBPROCESS_ENV_SCRUB` 和 `SKIP_PROMPT_HISTORY`。
6. deny 规则是你唯一的硬性防线。CLAUDE.md 里的规则是软性的，不能替代 deny。

## 延伸阅读

- [43 - Permission Modes 全解](43-permission-modes-explained.md)——deny 规则的完整语法和权限体系
- [70 - GitHub Actions & GitLab CI](70-github-actions-gitlab-ci.md)——CI 环境中的 Claude Code 配置
- [Claude Code 官方环境变量文档](https://code.claude.com/docs/en/env-vars)——所有环境变量的完整参考
- [Claude Code 安全最佳实践 (Backslash Security)](https://www.backslash.security/blog/claude-code-security-best-practices)——威胁模型和配置建议
- [Claude Code 自动加载 .env 的问题 (Knostic)](https://www.knostic.ai/blog/claude-loads-secrets-without-permission)——问题的详细分析
- [sensitive-canary 工具](https://dev.to/chataclaw/stop-claude-code-from-leaking-your-secrets-introducing-sensitive-canary-826)——用 hook 在每次 prompt 提交前扫描 secret
