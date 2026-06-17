# Hooks 实战

> 更新日期：2025/06

**TL;DR：** 上一篇讲了 Hooks 的原理和配置结构，这篇直接上手。五个实战场景：阻断危险命令、自动格式化、测试钩子、桌面通知、审计日志。每个场景都给出可复制的配置和脚本，改改路径就能用。

## 为什么这很重要

上一篇 [Hooks 入门](./63-hooks-getting-started.md) 你已经知道了 Hook 的配置结构、五类事件、输入输出的 JSON 格式。但知道语法和写出能用的 Hook 之间隔着一道坎——你需要知道什么场景该用什么 Hook、脚本怎么写才稳、边界条件怎么处理。

这篇就是填这道坎的。五个场景都是日常开发中高频出现的需求，每个都经过实际使用验证。你可以挑自己需要的直接拿走，也可以组合起来搭建一套完整的自动化体系。

## 阻断危险命令

这是最刚需的 Hook。Claude Code 执行 Bash 命令时，你不可能每次都盯着看。与其事后补救，不如事前拦截。

### 基础版：黑名单模式

在 `.claude/settings.json` 中配置：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/block-dangerous.sh"
          }
        ]
      }
    ]
  }
}
```

创建 `.claude/hooks/block-dangerous.sh`：

```bash
#!/bin/bash
set -euo pipefail

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# 危险模式列表
dangerous_patterns=(
  'rm\s+-rf\s+/'
  'rm\s+-rf\s+~'
  'rm\s+-rf\s+\*'
  'DROP\s+TABLE'
  'DROP\s+DATABASE'
  'git\s+push\s+--force'
  'git\s+reset\s+--hard'
  'chmod\s+-R\s+777\s+/'
  ':\(\)\{.*\}:'          # fork bomb
  'dd\s+if=.*of=/dev/'
  'mkfs\.'
  '> /dev/sd'
)

for pattern in "${dangerous_patterns[@]}"; do
  if echo "$command" | grep -qE "$pattern"; then
    echo "{\"decision\": \"block\", \"reason\": \"命令匹配危险模式: $pattern\"}"
    exit 0
  fi
done

# 放行：不输出任何内容
```

```bash
chmod +x .claude/hooks/block-dangerous.sh
```

这个脚本的工作方式：从 stdin 读 JSON，提取命令字段，逐一匹配危险模式。匹配到就返回阻断决策，没匹配到就不输出（等同于放行）。

### 进阶版：白名单 + 审批

黑名单永远有遗漏。对安全要求更高的项目，可以用白名单模式——只有明确允许的命令才放行，其他全部拦截：

```bash
#!/bin/bash
set -euo pipefail

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# 允许的命令前缀
allowed_prefixes=(
  'git status'
  'git diff'
  'git log'
  'git branch'
  'git add'
  'git commit'
  'ls'
  'cat'
  'head'
  'tail'
  'grep'
  'find'
  'npm test'
  'npm run lint'
  'npx prettier'
  'python'
  'node'
  'echo'
  'mkdir'
  'cp'
  'mv'
)

for prefix in "${allowed_prefixes[@]}"; do
  if [[ "$command" == "$prefix"* ]]; then
    # 匹配白名单，放行
    exit 0
  fi
done

# 不在白名单，交给用户确认
echo "{\"decision\": \"block\", \"reason\": \"命令不在白名单中: $command\"}"
```

白名单模式比较极端，适合生产环境或代码仓库的 CI 环节。日常开发用黑名单就够了。

### 用 if 字段精确匹配

不需要对所有 Bash 命令都跑脚本，`if` 字段可以在 matcher 之后再做一轮过滤：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(rm *)",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh"
          },
          {
            "type": "command",
            "if": "Bash(git push*)",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/block-force-push.sh"
          }
        ]
      }
    ]
  }
}
```

`if` 字段省了对所有 Bash 命令生效，写了就只匹配特定模式。这样做的好处是减少不必要的脚本执行，响应更快。

## 自动格式化

Claude 写的代码逻辑没问题，但格式不一定符合你的项目规范。PostToolUse Hook 可以在文件写入后自动跑格式化工具。

### Prettier 自动格式化

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "file=$(cat | jq -r '.tool_input.file_path // empty'); if [ -n \"$file\" ] && [ -f \"$file\" ]; then case \"$file\" in *.js|*.ts|*.jsx|*.tsx|*.json|*.css|*.md) npx prettier --write \"$file\" 2>/dev/null || true ;; esac; fi"
          }
        ]
      }
    ]
  }
}
```

这个一行命令做了几件事：从 stdin 读 JSON 提取文件路径，判断文件是否存在，根据扩展名决定是否格式化。`2>/dev/null || true` 确保格式化失败不会阻断流程。

### 分脚本版（更可维护）

一行命令长了不好维护。写成独立脚本：

`.claude/hooks/format.sh`：

```bash
#!/bin/bash
set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

# 没有文件路径就跳过
[ -z "$file_path" ] && exit 0
[ ! -f "$file_path" ] && exit 0

# 根据文件类型选择格式化工具
case "$file_path" in
  *.js|*.ts|*.jsx|*.tsx|*.json|*.css|*.scss|*.md)
    npx prettier --write "$file_path" 2>/dev/null || true
    ;;
  *.py)
    python3 -m black "$file_path" 2>/dev/null || true
    python3 -m isort "$file_path" 2>/dev/null || true
    ;;
  *.go)
    goreturns -w "$file_path" 2>/dev/null || true
    ;;
  *.rs)
    rustfmt "$file_path" 2>/dev/null || true
    ;;
esac
```

配置改成：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/format.sh"
          }
        ]
      }
    ]
  }
}
```

分脚本的好处：可以单独测试、可以加注释、多人协作时好理解。

### 加上 lint 检查

格式化之后顺便跑一下 lint，有问题就提醒 Claude 修复：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/format.sh"
          },
          {
            "type": "command",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/lint-check.sh"
          }
        ]
      }
    ]
  }
}
```

`.claude/hooks/lint-check.sh`：

```bash
#!/bin/bash
set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

[ -z "$file_path" ] && exit 0
[ ! -f "$file_path" ] && exit 0

case "$file_path" in
  *.js|*.ts|*.jsx|*.tsx)
    npx eslint "$file_path" --format compact 2>/dev/null | head -20
    ;;
  *.py)
    python3 -m flake8 "$file_path" 2>/dev/null | head -20
    ;;
esac

# lint 结果通过 stderr 传递给 Claude，不阻断流程
# 非零 exit code 会被当作非阻断性错误
```

注意这里没有返回 `decision: "block"`。lint 的输出会作为提示信息传递给 Claude，但不会阻断后续操作。如果你想严格到 lint 不过就不让继续，可以加上阻断逻辑。

## 测试钩子

让 Claude 在写完代码后自动跑测试，确保改动不会破坏现有功能。

### 文件变更后自动跑相关测试

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/auto-test.sh"
          }
        ]
      }
    ]
  }
}
```

`.claude/hooks/auto-test.sh`：

```bash
#!/bin/bash
set -euo pipefail

input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path // empty')

[ -z "$file_path" ] && exit 0
[ ! -f "$file_path" ] && exit 0

# 推断测试文件路径
test_file=""

case "$file_path" in
  src/**/*.ts)
    # src/utils/format.ts -> tests/utils/format.test.ts
    test_file="tests/${file_path#src/}"
    test_file="${test_file%.ts}.test.ts"
    ;;
  lib/**/*.py)
    # lib/auth/user.py -> tests/auth/test_user.py
    test_file="tests/${file_path#lib/}"
    test_file="$(dirname "$test_file")/test_$(basename "$test_file")"
    ;;
esac

# 没找到对应测试文件就跳过
[ -z "$test_file" ] && exit 0
[ ! -f "$test_file" ] && exit 0

# 跑测试，10 秒超时
case "$file_path" in
  *.ts)
    npx vitest run "$test_file" --reporter=verbose 2>&1 | head -30
    ;;
  *.py)
    timeout 10 python3 -m pytest "$test_file" -v 2>&1 | head -30
    ;;
esac
```

这个脚本根据修改的文件路径推断对应的测试文件。找到了就跑，找不到就跳过。不会因为缺少测试而阻断流程。

### 提交前跑全量测试

用 PreToolUse 拦截 git commit，跑完测试再放行：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(git commit*)",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/pre-commit-test.sh"
          }
        ]
      }
    ]
  }
}
```

`.claude/hooks/pre-commit-test.sh`：

```bash
#!/bin/bash
set -euo pipefail

# 跑测试
if ! npx vitest run 2>&1; then
  echo "{\"decision\": \"block\", \"reason\": \"测试未通过，请先修复失败的测试再提交\"}"
  exit 0
fi

# 跑类型检查（TypeScript 项目）
if ! npx tsc --noEmit 2>&1; then
  echo "{\"decision\": \"block\", \"reason\": \"类型检查未通过，请先修复类型错误再提交\"}"
  exit 0
fi

# 都通过，放行
```

这个 Hook 在 `git commit` 前触发。测试不过或类型检查不过就阻断提交。比 CI 跑完才发现问题快得多。

### 用 Stop Hook 做最终验证

Stop Hook 在 Claude 认为任务完成准备停止时触发。你可以用它确保 Claude 真的完成了所有工作：

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/stop-check.sh"
          }
        ]
      }
    ]
  }
}
```

`.claude/hooks/stop-check.sh`：

```bash
#!/bin/bash
set -euo pipefail

# 跑一遍测试
if ! npx vitest run 2>&1; then
  echo "{\"decision\": \"block\", \"reason\": \"测试仍有失败，请继续修复\"}"
  exit 0
fi

# 检查有没有遗留的 TODO
todo_count=$(grep -r "TODO\|FIXME\|HACK" src/ --include="*.ts" -l 2>/dev/null | wc -l)
if [ "$todo_count" -gt 0 ]; then
  # 不阻断，只是提醒
  echo "{\"additionalContext\": \"代码中仍有 $todo_count 个 TODO/FIXME 标记，确认这些是有意保留的吗？\"}"
  exit 0
fi
```

测试没过就阻断（Claude 继续修复），有 TODO 但不阻断（只是提醒确认）。

## 通知集成

Claude Code 跑一个耗时任务，你不想一直盯着终端。通知 Hook 让你在任务完成、需要确认或出错时收到系统通知。

### macOS 桌面通知

在 `~/.claude/settings.json`（全局配置）中添加：

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code 需要你的关注\" with title \"Claude Code\" sound name \"default\"'"
          }
        ]
      }
    ]
  }
}
```

`osascript` 是 macOS 自带的脚本执行工具，不需要额外安装。`sound name "default"` 会播放系统默认通知音。

### Linux 桌面通知

```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "notify-send 'Claude Code' 'Claude Code 需要你的关注' --icon=utilities-terminal"
          }
        ]
      }
    ]
  }
}
```

需要安装 `libnotify`：`sudo apt install libnotify-bin`。

### 任务完成通知（Stop Hook）

Notification Hook 只在 Claude 需要用户交互时触发。如果你想在一个长任务跑完时收到通知，用 Stop Hook：

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code 任务完成\" with title \"任务结束\" sound name \"Glass\"'"
          }
        ]
      }
    ]
  }
}
```

这样你让 Claude 跑一个大规模重构，然后切去干别的事，完成后系统通知会弹出来。

### Slack 通知

团队协作场景下，把通知推到 Slack 比桌面通知更实用：

```bash
#!/bin/bash
# .claude/hooks/slack-notify.sh
set -euo pipefail

input=$(cat)
event=$(echo "$input" | jq -r '.hook_event_name // empty')
session_id=$(echo "$input" | jq -r '.session_id // empty')

# 截取前 50 字符作为摘要
message="Claude Code 事件: $event (会话: ${session_id:0:8})"

curl -s -X POST "$SLACK_WEBHOOK_URL" \
  -H 'Content-type: application/json' \
  -d "{\"text\": \"$message\"}" > /dev/null 2>&1 || true
```

配置中引用环境变量 `SLACK_WEBHOOK_URL`，别把 webhook 地址硬编码到脚本里：

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/slack-notify.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

`"async": true` 让通知在后台发送，不阻塞 Claude 的停止流程。

## 审计日志

记录 Claude Code 的每一个操作，用于事后审查、问题追溯或合规要求。

### 基础命令日志

记录所有 Bash 命令到文件：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '\"[\" + (.tool_input.command // \"\") + \"] exit:\" + (.tool_result.exitCode // \"0\" | tostring) ' >> ~/.claude/command-log.txt"
          }
        ]
      }
    ]
  }
}
```

日志格式：`[ls -la src/] exit:0`。简单但实用。

### 结构化审计日志

如果要做正式的审计，用 JSON Lines 格式记录完整信息：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/audit-log.sh",
            "async": true
          }
        ]
      }
    ]
  }
}
```

`.claude/hooks/audit-log.sh`：

```bash
#!/bin/bash
set -euo pipefail

input=$(cat)

# 构建日志条目
log_entry=$(echo "$input" | jq '{
  timestamp: (now | todate),
  session_id: .session_id,
  event: .hook_event_name,
  tool: .tool_name,
  command: (.tool_input.command // null),
  file_path: (.tool_input.file_path // null),
  exit_code: (.tool_result.exitCode // null),
  success: ((.tool_result.exitCode // "0") == "0")
}')

# 写入日志文件（按日期分割）
log_dir="${CLAUDE_PROJECT_DIR}/.claude/audit-logs"
mkdir -p "$log_dir"
log_file="$log_dir/$(date +%Y-%m-%d).jsonl"

echo "$log_entry" >> "$log_file"
```

日志条目示例：

```json
{
  "timestamp": "2025-06-15T14:32:01Z",
  "session_id": "abc123def456",
  "event": "PostToolUse",
  "tool": "Bash",
  "command": "npm test",
  "file_path": null,
  "exit_code": "0",
  "success": true
}
```

`"async": true` 确保日志记录不影响主流程性能。

### 日志清理

审计日志会随时间膨胀。加个定时清理：

```bash
# 清理 30 天前的审计日志
find .claude/audit-logs/ -name "*.jsonl" -mtime +30 -delete
```

可以在 cron 或项目 CI 中跑这个命令。

### 查询审计日志

几个实用的 jq 查询：

```bash
# 查看今天所有失败的命令
cat .claude/audit-logs/$(date +%Y-%m-%d).jsonl | jq 'select(.success == false)'

# 统计各工具使用次数
cat .claude/audit-logs/*.jsonl | jq '.tool' | sort | uniq -c | sort -rn

# 查看某个会话的所有操作
cat .claude/audit-logs/*.jsonl | jq 'select(.session_id == "abc123")'

# 找出所有修改过的文件
cat .claude/audit-logs/*.jsonl | jq -r 'select(.file_path != null) | .file_path' | sort -u
```

## 把它们组合起来

五个场景可以组合成一套完整的 Hook 体系。把以下配置放在 `.claude/settings.json` 中：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/block-dangerous.sh"
          },
          {
            "type": "command",
            "if": "Bash(git commit*)",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/pre-commit-test.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/format.sh"
          }
        ]
      },
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/audit-log.sh",
            "async": true
          }
        ]
      }
    ],
    "Notification": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code 需要关注\" with title \"Claude Code\"'"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "sh ${CLAUDE_PROJECT_DIR}/.claude/hooks/stop-check.sh"
          },
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude Code 任务完成\" with title \"任务结束\"'"
          }
        ]
      }
    ]
  }
}
```

这套配置实现了：

- 所有 Bash 命令先过危险命令检查
- git commit 前跑测试和类型检查
- 文件写入后自动格式化
- 所有工具调用记录到审计日志
- 需要用户交互时弹桌面通知
- 任务完成时弹通知并做最终检查

## 常见坑

**脚本路径用 `${CLAUDE_PROJECT_DIR}` 而不是相对路径。** Hook 的执行目录不一定是你想的位置，用这个环境变量确保路径正确。

**`set -euo pipefail` 加上。** 脚本里任何一行出错就停下来，避免静默失败导致误放行危险操作。

**PostToolUse 的格式化用 `|| true` 收尾。** 格式化工具不存在或文件格式有语法错误时不应阻断主流程。

**审计日志加 `"async": true`。** 日志写入不需要阻塞 Claude 的操作。同步写日志在高频操作时会明显拖慢速度。

**不要在 Hook 脚本里用 `exit 1`。** Exit code 1 是非阻断性错误，只会记个警告。要阻断必须用 `exit 2` 或返回包含 `decision: "block"` 的 JSON。

**先在测试环境验证。** Hook 配错了不会报错提示你——它只会静默失败或者做你意想不到的事。建议先在非关键项目上跑一段时间再推广。

## 关键要点

- 五个高频场景：阻断危险命令（PreToolUse）、自动格式化（PostToolUse）、测试钩子（PreToolUse + Stop）、通知（Notification + Stop）、审计日志（PostToolUse async）
- 黑名单适合日常开发，白名单适合生产环境。`if` 字段可以减少不必要的脚本执行
- 格式化和 lint 检查放 PostToolUse，跑在文件写入后。测试验证可以放 PreToolUse（拦截提交）或 Stop（最终检查）
- 通知 Hook 分两种：Notification 是 Claude 需要你操作时触发，Stop 是任务完成时触发
- 审计日志用 JSONL 格式、按日期分文件、async 写入。定期清理避免膨胀
- 组合使用时注意执行顺序：同一 matcher 组内的 Hook 按配置顺序依次执行

## 延伸阅读

- [Hooks 入门](./63-hooks-getting-started.md) —— Hook 的原理、配置结构、五类事件详解
- [Hooks 官方文档](https://docs.anthropic.com/en/docs/claude-code/hooks) —— 完整的 Hook API 参考
- [Hooks 实用指南](https://docs.anthropic.com/en/docs/claude-code/hooks-guide) —— 官方的通知、格式化案例
- [Settings 详解](./39-settings-files.md) —— Hook 配置所在的 settings.json 完整说明
- [权限模式](./43-permission-modes-explained.md) —— 权限系统和 Hook 的分工与协作

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
