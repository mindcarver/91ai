<!--
调研来源（不发布，仅记录）：
1. OpenAI Codex 源码 openai/codex — config/src/hooks_toml.rs 钩子配置类型定义
2. OpenAI Codex 源码 openai/codex — core-skills/src/hooks.rs 钩子执行引擎
3. OpenAI Codex 源码 openai/codex — codex-core/src/agent_loop.rs Agent 循环中的钩子触发点
4. OpenAI Codex 源码 openai/codex — codex-execpolicy/src/approval.rs 审批策略与钩子交互
5. zread.ai/openai/codex/22-configuration-reference — [hooks] 配置表与事件定义
6. zread.ai/openai/codex/9-tool-system-and-execution — 工具调度中的 PreToolUse/PostToolUse 钩子
7. zread.ai/openai/codex/8-agent-loop-and-thread-management — Agent 循环中的 SessionStart/Stop 钩子
版本基准: 2026 年 6 月
-->

# Codex CLI Hooks 钩子机制：在 Agent 关键节点插入自定义逻辑

> TL;DR：Hooks 是 Codex 的事件回调系统——Agent 运行过程中经过一系列生命周期节点（会话开始、提交提示词、调用工具、压缩历史），钩子让你在这些节点执行自定义的外部命令。配置写在 `config.toml` 的 `[hooks]` 表中，每个钩子有匹配器（决定匹配哪些工具）和处理器（执行什么命令）。命令的退出码决定结果：0 放行，非 0 拦截。钩子分"托管钩子"（管理员强制，不可禁用）和"用户钩子"（可控、可禁用）两种。本文覆盖全部 9 个钩子事件、配置语法、匹配器规则，以及审计日志、输入验证等实战案例。

---

## 1. 为什么需要钩子

Codex 的 Agent 有自己的执行流程：接收你的指令，调用工具，返回结果。这个流程大部分时候运行得很好，但你可能想在某些环节插入自己的逻辑。举几个实际需求：

- **审计**：每次 Codex 执行 shell 命令时，记录命令内容到审计日志
- **安全**：阻止 Codex 执行 `rm -rf` 或 `DROP TABLE` 这类破坏性操作
- **增强**：在每次提交提示词时，自动注入当前 Git 分支信息
- **通知**：任务完成时发送 Slack 通知
- **验证**：Codex 修改文件后，自动跑 lint 检查

这些需求有一个共同点：它们不改变 Codex 的核心行为，而是在特定时机"旁听"或"拦截"。这就是钩子的定位——一个事件驱动的扩展点，不侵入 Codex 的主流程。

Codex 的钩子设计参考了 Git 的 pre-commit hook 和 GitHub Actions 的 workflow triggers。区别在于，Git 的钩子是操作系统的 shell 脚本，Codex 的钩子也是外部命令，但触发点不同——Git 的钩子在 Git 操作（commit、push）时触发，Codex 的钩子在 Agent 内部事件（工具调用、会话开始、历史压缩）时触发。

## 2. 九个钩子事件

Codex 定义了 9 个生命周期事件，覆盖了 Agent 运行的完整周期：

| 事件 | 触发时机 | 典型用途 |
|------|---------|---------|
| `SessionStart` | 新会话开始时 | 初始化环境变量、加载配置、启动监控 |
| `UserPromptSubmit` | 用户提交提示词时 | 输入过滤、提示词增强、自动注入上下文 |
| `PreToolUse` | 工具执行之前 | 审计日志、权限检查、参数校验、安全拦截 |
| `PostToolUse` | 工具执行完成之后 | 结果校验、副作用处理、通知 |
| `PermissionRequest` | 创建权限请求时 | 自定义审批逻辑 |
| `PreCompact` | 对话历史压缩之前 | 保存关键信息、生成摘要 |
| `PostCompact` | 压缩完成之后 | 验证压缩结果 |
| `SubagentStart` | 子 Agent 生成时 | 初始化子 Agent 环境 |
| `SubagentStop` | 子 Agent 完成时 | 清理子 Agent 资源 |
| `Stop` | 会话停止时 | 最终清理、生成报告 |

从使用频率看，最常用的三个是 `PreToolUse`、`PostToolUse` 和 `SessionStart`。`PreCompact` 在长对话场景中有用，其他事件更多是特殊场景需要。

## 3. 钩子配置语法

### 3.1 基本结构

钩子在 `config.toml` 的 `[hooks]` 表中配置。每个事件是一个子表，包含一个或多个匹配器组：

```toml
[hooks.PreToolUse]
[[hooks.PreToolUse]]
matcher = "shell"
hooks = [
  { type = "command", command = "/usr/local/bin/audit-log.sh" }
]

[[hooks.PreToolUse]]
matcher = "file_write"
hooks = [
  { type = "command", command = "/usr/local/bin/backup-before-write.sh" }
]
```

这段配置的含义是：

- 在 `PreToolUse` 事件中注册了两个匹配器组
- 第一组匹配所有 `shell` 工具调用，触发 `audit-log.sh`
- 第二组匹配所有 `file_write` 操作，触发 `backup-before-write.sh`

`[[hooks.PreToolUse]]` 是 TOML 的数组语法——同一个事件可以有多个匹配器组，每个组有独立的 matcher 和 hooks。

### 3.2 matcher 字段

`matcher` 字段指定这个钩子组匹配哪些工具。匹配规则基于工具名称：

| matcher 值 | 匹配范围 | 示例 |
|------------|---------|------|
| `"shell"` | 所有 shell 命令执行 | `codex run_command("ls -la")` |
| `"file_write"` | 所有文件写入操作 | `codex write_file("src/app.ts")` |
| `"file_read"` | 所有文件读取操作 | `codex read_file("src/app.ts")` |
| `"mcp__github"` | 特定 MCP 服务器的所有工具 | `mcp__github__create_issue` |
| `"mcp__github__create_issue"` | 特定的 MCP 工具 | 只匹配这个工具 |
| `"*"` | 匹配所有工具 | 通用审计 |

matcher 支持前缀匹配——`"mcp__github"` 会匹配所有以 `mcp__github` 开头的工具名（包括 `mcp__github__create_issue`、`mcp__github__list_prs` 等）。

### 3.3 钩子处理器

每个钩子项有一个 `type` 字段和一个执行定义：

```toml
hooks = [
  { type = "command", command = "/path/to/script.sh", timeout_sec = 5 }
]
```

| 字段 | 说明 |
|------|------|
| `type` | 处理器类型，目前只有 `"command"`（执行外部命令） |
| `command` | 要执行的命令路径或命令行 |
| `timeout_sec` | 超时时间（秒），超时后钩子被取消 |

钩子处理器是外部命令——Codex 通过 shell 执行它，传递事件相关的上下文信息作为参数或环境变量。命令的**退出码**决定钩子的结果：

- **退出码 0**：钩子通过，操作继续执行
- **退出码非 0**：钩子拒绝，操作被阻止（对 PreToolUse 来说，工具调用不会执行）

这意味着你的钩子脚本只需返回正确的退出码，就能实现放行或拦截。不需要复杂的协议交互。

### 3.4 多层钩子叠加

钩子可以从多个来源加载，按优先级排列：

| 来源 | 说明 | 能禁用吗 |
|------|------|---------|
| **requirements.toml** | 管理员通过 requirements.toml 配置的托管钩子 | 不能——这是安全设计 |
| **用户 config.toml** | 用户自己配置的钩子 | 可以——信任、禁用、重新启用 |
| **插件清单** | 插件 `hooks/hooks.json` 中声明的钩子 | 通过插件启用/禁用控制 |

多个来源的钩子在同一事件管道中执行。托管钩子（来自 requirements.toml）不能被用户禁用——这是企业安全场景的关键设计。管理员可以通过 `allow_managed_hooks_only = true` 强制只允许托管钩子，禁止任何其他来源的钩子配置。

### 3.5 /hooks 命令

在 TUI 中输入 `/hooks` 可以查看当前会话的所有已配置钩子。显示内容包括：

- 每个钩子的事件类型
- 匹配器规则
- 处理器命令
- 来源（托管/用户/插件）
- 启用/禁用状态

对于托管钩子，TUI 会标注"托管，不可禁用"。用户钩子可以在 TUI 中切换信任状态。

## 4. 钩子接收的事件数据

钩子命令在执行时会收到事件相关的上下文信息。这些信息通过环境变量传递：

### 4.1 PreToolUse 事件数据

当 `PreToolUse` 钩子触发时，Codex 向钩子命令传递以下信息：

```bash
# 环境变量
CODEX_HOOK_EVENT=PreToolUse
CODEX_TOOL_NAME=shell          # 工具名称
CODEX_TOOL_INPUT='{"command":"ls -la"}'  # 工具输入（JSON）
CODEX_SESSION_ID=abc123        # 会话 ID
CODEX_CWD=/path/to/project     # 工作目录
```

一个审计日志脚本的示例：

```bash
#!/bin/bash
# audit-log.sh — 记录 shell 命令审计日志

LOG_FILE="${CODEX_HOME:-$HOME/.codex}/audit.log"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# 从环境变量读取工具信息
TOOL_NAME="$CODEX_TOOL_NAME"
TOOL_INPUT="$CODEX_TOOL_INPUT"
SESSION_ID="$CODEX_SESSION_ID"
CWD="$CODEX_CWD"

# 提取实际命令（从 JSON 中解析）
ACTUAL_COMMAND=$(echo "$TOOL_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('command',''))" 2>/dev/null)

# 写入审计日志
echo "{\"timestamp\":\"$TIMESTAMP\",\"session\":\"$SESSION_ID\",\"tool\":\"$TOOL_NAME\",\"command\":\"$ACTUAL_COMMAND\",\"cwd\":\"$CWD\"}" >> "$LOG_FILE"

# 退出码 0 = 放行
exit 0
```

### 4.2 PostToolUse 事件数据

`PostToolUse` 钩子额外收到工具执行的返回结果：

```bash
CODEX_HOOK_EVENT=PostToolUse
CODEX_TOOL_NAME=shell
CODEX_TOOL_INPUT='{"command":"ls -la"}'
CODEX_TOOL_OUTPUT='{"content":[...]}'
CODEX_TOOL_IS_ERROR=false
```

可以用来做结果校验——比如检查 shell 命令的退出码是否为 0，如果不是则记录告警。

### 4.3 SessionStart 事件数据

```bash
CODEX_HOOK_EVENT=SessionStart
CODEX_SESSION_ID=abc123
CODEX_CWD=/path/to/project
CODEX_MODEL=gpt-5.4-mini
```

可以用来在会话开始时初始化环境、启动后台监控进程、记录会话开始时间。

## 5. 实战案例

### 案例一：阻止破坏性 shell 命令

场景：防止 Codex 执行危险的 shell 命令，保护生产环境。

```bash
#!/bin/bash
# block-dangerous.sh — 阻止危险命令

COMMAND=$(echo "$CODEX_TOOL_INPUT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('command',''))" 2>/dev/null)

# 危险命令黑名单
DANGEROUS_PATTERNS=(
  "rm -rf /"
  "DROP TABLE"
  "DROP DATABASE"
  "DROP SCHEMA"
  "TRUNCATE"
  "mkfs"
  "dd if="
  "> /dev/sd"
  "chmod -R 777 /"
)

for pattern in "${DANGEROUS_PATTERNS[@]}"; do
  if echo "$COMMAND" | grep -qi "$pattern"; then
    echo "BLOCKED: 命令包含危险模式: $pattern" >&2
    exit 1  # 非 0 退出码 = 拦截
  fi
done

exit 0  # 0 退出码 = 放行
```

配置：

```toml
[hooks.PreToolUse]
[[hooks.PreToolUse]]
matcher = "shell"
hooks = [
  { type = "command", command = "/usr/local/bin/block-dangerous.sh" }
]
```

当 Codex 尝试执行匹配黑名单模式的命令时，钩子返回非 0 退出码，命令被阻止。Codex 会收到一个错误信息，说明操作被钩子拦截。

### 案例二：自动注入 Git 上下文

场景：每次提交提示词时，自动在上下文中注入当前 Git 分支名和最近一次 commit 信息。

```bash
#!/bin/bash
# inject-git-context.sh — 注入 Git 上下文

if [ ! -d "$CODEX_CWD/.git" ]; then
  exit 0
fi

cd "$CODEX_CWD"

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
LAST_COMMIT=$(git log -1 --oneline 2>/dev/null)

if [ -n "$BRANCH" ]; then
  echo "当前 Git 分支: $BRANCH"
  echo "最近 commit: $LAST_COMMIT"
fi

exit 0
```

配置：

```toml
[hooks.UserPromptSubmit]
[[hooks.UserPromptSubmit]]
hooks = [
  { type = "command", command = "/usr/local/bin/inject-git-context.sh" }
]
```

钩子的 stdout 输出会作为额外的上下文注入到提示词中（通过 `AdditionalContextUserFragment` 机制）。Codex 不需要你每次手动说"当前在 feature/login 分支上"——钩子自动提供了这些信息。

### 案例三：文件修改后自动 lint

场景：Codex 每次修改代码文件后，自动运行 ESLint 检查，如果有错误就阻止操作。

```bash
#!/bin/bash
# auto-lint.sh — 文件修改后自动 lint

# 提取被修改的文件路径
FILE_PATH=$(echo "$CODEX_TOOL_INPUT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
# 文件写入工具的输入中包含 path 字段
print(data.get('path', ''))
" 2>/dev/null)

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# 只 lint JS/TS 文件
if ! echo "$FILE_PATH" | grep -qE '\.(tsx?|jsx?)$'; then
  exit 0
fi

cd "$CODEX_CWD"

# 运行 ESLint
npx eslint "$FILE_PATH" --no-warn 2>&1
RESULT=$?

if [ $RESULT -ne 0 ]; then
  echo "Lint 检查失败，文件修改被阻止" >&2
  exit 1  # 阻止写入
fi

exit 0  # 放行
```

配置：

```toml
[hooks.PreToolUse]
[[hooks.PreToolUse]]
matcher = "file_write"
hooks = [
  { type = "command", command = "/usr/local/bin/auto-lint.sh", timeout_sec = 10 }
]
```

注意这里用了 `timeout_sec = 10`。ESLint 有时候会比较慢，10 秒的超时避免钩子卡住整个会话。

### 案例四：会话通知

场景：会话结束时发送通知（比如 Slack webhook）。

```bash
#!/bin/bash
# session-stop-notify.sh — 会话结束通知

WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"
if [ -z "$WEBHOOK_URL" ]; then
  exit 0
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CWD="$CODEX_CWD"

# 统计本次会话的文件改动数（如果可能）
CHANGES=$(cd "$CWD" && git diff --stat 2>/dev/null | tail -1)

PAYLOAD=$(cat <<EOF
{
  "text": "Codex 会话结束",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Codex 会话结束*\n项目: \`$CWD\`\n时间: $TIMESTAMP\n$CHANGES"
      }
    }
  ]
}
EOF
)

curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD" "$WEBHOOK_URL" > /dev/null 2>&1

exit 0
```

配置：

```toml
[hooks.Stop]
[[hooks.Stop]]
hooks = [
  { type = "command", command = "/usr/local/bin/session-stop-notify.sh", timeout_sec = 5 }
]
```

`Stop` 事件在会话结束时触发。钩子发送一个 Slack 通知，告诉你 Codex 在哪个项目上完成了工作。

### 案例五：企业级托管钩子

场景：IT 部门要求所有 Codex 实例在会话启动时运行审计脚本，用户不能禁用。

**requirements.toml**（系统管理员部署）：

```toml
# /etc/codex/requirements.toml
allow_managed_hooks_only = true

[hooks.SessionStart]
[[hooks.SessionStart]]
hooks = [
  { type = "command", command = "/usr/local/bin/codex-audit-startup.sh", timeout_sec = 5 }
]

[hooks.PreToolUse]
[[hooks.PreToolUse]]
matcher = "shell"
hooks = [
  { type = "command", command = "/usr/local/bin/codex-audit-shell.sh", timeout_sec = 3 }
]
```

`allow_managed_hooks_only = true` 意味着用户不能在 config.toml 中添加自己的钩子——所有钩子必须来自 requirements.toml。这是最严格的安全策略。

审计脚本 `/usr/local/bin/codex-audit-startup.sh` 可以做这些事：

- 记录会话开始时间和用户身份
- 检查当前目录是否在允许的工作区范围内
- 验证沙箱策略是否合规
- 向中央日志系统发送事件

## 6. 钩子与工具调用的交互

从 Codex 的工具调度流程看，钩子在以下节点参与：

```
模型输出 FunctionCall
    │
    ▼
PreToolUse 钩子执行
    │
    ├─ 退出码 0 → 继续
    ├─ 退出码 非 0 → 阻止，返回错误给模型
    └─ 钩子修改输入 → 用修改后的输入继续
    │
    ▼
审批策略检查
    │
    ├─ auto → 直接执行
    ├─ prompt → 等待用户确认
    └─ approve → 预批准，直接执行
    │
    ▼
工具实际执行
    │
    ▼
PostToolUse 钩子执行
    │
    ▼
结果返回给模型
```

PreToolUse 钩子在审批策略**之前**执行。这意味着即使你把审批模式设为 `auto`，PreToolUse 钩子仍然能阻止工具调用。这提供了一个不受审批策略影响的安全层——托管钩子的优先级高于用户配置。

PostToolUse 钩子在工具执行**之后**触发，可以检查执行结果、记录日志、触发后续操作。但它不能改变已经执行的工具结果——工具调用是不可逆的。

## 7. 性能与最佳实践

### 钩子对性能的影响

钩子命令在 Codex 的主线程中同步执行。如果钩子脚本运行慢，会直接拖慢 Agent 的响应速度。

| 影响因素 | 建议 |
|---------|------|
| 脚本启动时间 | 用编译型语言（Go、Rust）而不是解释型语言（Python、Bash） |
| 网络请求 | 避免在钩子中做 HTTP 调用，或设置较短的超时 |
| I/O 操作 | 审计日志写文件比写数据库快 |
| 正则匹配 | 预编译正则，避免每次都重新编译 |

一个实用的优化：对于 `PreToolUse` 这种高频触发的钩子，用 `timeout_sec` 设置严格超时（3-5 秒），避免慢钩子拖慢整个会话。

### 钩子脚本的安全

钩子脚本有执行任意命令的权限（毕竟是 Codex 通过 shell 执行的）。这意味着：

- 确保钩子脚本文件不被未授权的人修改。`requirements.toml` 中的托管钩子由管理员控制，用户无法修改
- 不要在钩子脚本中存储或输出敏感信息（API Key、密码等）
- 钩子脚本的退出码决定了 Codex 的行为——确保脚本的退出码逻辑正确，避免误拦截

### 调试钩子

如果钩子没有按预期工作：

1. 先手动执行钩子命令，确认脚本能正常运行
2. 在钩子脚本中加 `echo "debug info" >> /tmp/codex-hook-debug.log` 记录执行情况
3. 用 `/hooks` 命令确认钩子是否被正确加载
4. 检查 `/debug-config` 确认钩子配置来源和合并结果

## 8. 常见问题

**钩子能改变工具的输入参数吗？**

PreToolUse 钩子可以通过 stdout 输出修改后的工具输入。Codex 会读取钩子的 stdout，如果输出是有效的 JSON，就替换工具的原始输入。这让你能在工具执行前修改参数——比如添加额外的配置选项、过滤敏感字段。

**钩子执行失败（脚本崩溃）会怎样？**

如果钩子命令因为脚本错误而异常退出（非 0 退出码），效果等同于钩子拒绝操作。Codex 会收到一个错误，工具调用被阻止。建议在钩子脚本中捕获所有可能的异常，确保正常情况下返回 0。

**多个钩子同时匹配一个事件怎么处理？**

同一事件的所有匹配钩子按顺序执行。如果任何一个返回非 0，后续钩子不再执行，操作被阻止。这类似于"与"逻辑——所有钩子都必须通过。

**能通过插件安装钩子吗？**

可以。插件的清单中可以声明 `hooks` 字段，指向 `./hooks/hooks.json` 文件。安装插件后，钩子自动注册，不需要手动在 config.toml 中配置。

## 9. 下一步

- 从案例中选一个适合你场景的钩子，配置到项目中
- 为高频操作（shell 命令、文件写入）配置 PreToolUse 钩子做审计
- 探索 PreCompact 钩子——在长对话压缩前保存关键上下文
- 阅读本系列下一篇：《Codex CLI Apps 连接器生态》

---

**延伸阅读**

- [Codex 配置参考](https://zread.ai/openai/codex/22-configuration-reference) — `[hooks]` 表全部字段和事件定义
- [Codex 工具系统](https://zread.ai/openai/codex/9-tool-system-and-execution) — PreToolUse/PostToolUse 在工具调度流程中的位置
- [Codex Agent 循环](https://zread.ai/openai/codex/8-agent-loop-and-thread-management) — SessionStart/Stop 在 Agent 循环中的触发时机
- [Codex 提示词工程](https://zread.ai/openai/codex/19-prompt-engineering-and-context) — 钩子输出如何注入到提示词上下文中
