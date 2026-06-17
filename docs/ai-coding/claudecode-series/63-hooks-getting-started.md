# Hooks 入门：用确定性逻辑拦截和增强 AI 行为

> 更新日期：2025/06

**TL;DR：** Hooks 让你在 Claude Code 的工具调用前后插入自己的 shell 命令、HTTP 请求或 LLM 提示。你可以用它阻断危险操作、自动格式化代码、在会话恢复时重新注入上下文。配置写在 `settings.json` 的 `hooks` 字段里，通过 JSON 做输入输出，靠 exit code 控制流程走向。

## Hook 是什么（用大白话说）

想象你在快递站寄包裹。每次寄出前，工作人员检查一下物品是否合规——这是 PreToolUse。寄出后，自动给你发一条短信通知——这是 PostToolUse。如果你寄的是违禁品，直接拦下——exit code 2。

Hook 就是这样一层你自定义的拦截逻辑，插在 Claude Code 的关键生命周期节点上。它不是 AI 判断，是你写的确定性规则。AI 说"我要执行 `rm -rf /tmp`"，你的 Hook 说"不行"，这件事就到此为止。

和 [Settings](./39-settings-files.md) 的权限系统不同：权限系统只能 allow/deny，Hook 能做更复杂的事——检查参数内容、调用外部 API、跑一段脚本，甚至让另一个 LLM 来判断该不该放行。

## 五类 Hook 一览

| Hook 事件 | 触发时机 | 典型用途 |
|-----------|---------|---------|
| `PreToolUse` | 工具执行前 | 拦截危险命令、记录审计日志 |
| `PostToolUse` | 工具执行后 | 自动格式化、发送通知 |
| `Stop` | Claude 即将停止时 | 检查任务是否真的完成 |
| `SessionStart` | 新会话或上下文压缩后恢复 | 重新注入项目规范 |
| `MessageDisplay` | 消息展示给用户前 | 过滤敏感信息、格式化输出 |

## 第一个 Hook：阻断危险命令

在项目根目录的 `.claude/settings.json` 中添加：

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
# 从 stdin 读取 JSON 输入
input=$(cat)
tool_input=$(echo "$input" | jq -r '.tool_input.command // empty')

# 检查是否包含危险命令
if echo "$tool_input" | grep -qE 'rm\s+-rf\s+/'; then
  # 输出 JSON 阻断结果
  echo "{\"decision\": \"block\", \"reason\": \"不允许执行 rm -rf / 根目录删除\"}"
  exit 0
fi

# 不输出任何内容 = 放行
```

```bash
chmod +x .claude/hooks/block-dangerous.sh
```

这个 Hook 在每次 Bash 工具调用前执行。脚本从 stdin 读 JSON，检查命令内容，匹配到危险模式就返回阻断决策。不输出任何内容或输出不含 `decision` 字段的 JSON 表示放行。

## Hook 的配置结构

Hook 配置是三层嵌套：

```
hook 事件 (PreToolUse)
  └── matcher 组 (matcher: "Bash")
        └── hook 处理器 (type: command, command: "...")
```

完整示例：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write",
            "timeout": 10000
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 /path/to/audit-log.py"
          }
        ]
      }
    ]
  }
}
```

**matcher 的写法：**

- 精确匹配：`"Bash"` —— 只匹配 Bash 工具
- 多个工具：`"Edit|Write"` —— 匹配 Edit 或 Write
- 正则表达式：`"^(Bash|Edit)"` —— 以 Bash 或 Edit 开头的工具名
- 通配符：省略 matcher 或写 `"*"` —— 匹配所有工具

**`if` 字段：** 在 matcher 匹配后做更细的过滤。语法和权限规则一样：

```json
{
  "matcher": "Bash",
  "hooks": [
    {
      "type": "command",
      "if": "Bash(rm *)",
      "command": "sh .claude/hooks/block-rm.sh"
    }
  ]
}
```

`matcher: "Bash"` 先粗筛，`if: "Bash(rm *)"` 再细筛出包含 `rm` 的 Bash 命令。

## 五类 Hook 详解

### PreToolUse：工具执行前

最常见的 Hook。能做三件事：放行、阻断、附加上下文。

**阻断：**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.command' | grep -q 'DROP TABLE' && echo '{\"decision\": \"block\", \"reason\": \"禁止执行 DROP TABLE\"}' || true"
          }
        ]
      }
    ]
  }
}
```

**附加上下文（不阻断，给 Claude 额外提醒）：**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"additionalContext\": \"注意：本项目使用 tab 缩进，不要用空格\"}'"
          }
        ]
      }
    ]
  }
}
```

`additionalContext` 会作为系统提醒注入到 Claude 的上下文中，但不会阻断工具执行。

**用 prompt 类型让 LLM 判断：**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "检查这条命令是否安全。如果涉及删除文件或修改系统配置，返回 {\"decision\": \"block\", \"reason\": \"原因\"}。否则返回 {\"ok\": true}。"
          }
        ]
      }
    ]
  }
}
```

`type: "prompt"` 会把工具信息发送给另一个 LLM 来做判断。适合规则难以覆盖的场景，但会增加延迟和 token 消耗。

### PostToolUse：工具执行后

工具执行完成后触发，拿到的输入包含工具的执行结果。

**自动格式化：**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

**阻断执行结果（发现问题时阻止继续）：**

PostToolUse 也可以返回 `decision: "block"`，此时工具已执行但后续流程会被阻断：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "input=$(cat); exit_code=$(echo \"$input\" | jq -r '.tool_result.exitCode // 0'); if [ \"$exit_code\" -ne 0 ]; then echo '{\"decision\": \"block\", \"reason\": \"命令执行失败，需要修复\"}'; fi"
          }
        ]
      }
    ]
  }
}
```

### Stop：Claude 即将停止时

Claude 认为自己完成了任务准备停止时触发。适合做最终检查。

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "检查对话历史，确认用户要求的所有任务都已完成。如果有遗漏，返回 {\"decision\": \"block\", \"reason\": \"还有哪些任务未完成\"}。如果都完成了，返回 {\"ok\": true}。"
          }
        ]
      }
    ]
  }
}
```

Stop hook 返回 `decision: "block"` 会让 Claude 继续工作而不是停止。搭配 `type: "prompt"` 效果最好，因为判断任务是否完成需要理解上下文。

### SessionStart：会话开始或恢复

两个触发场景：新会话启动、上下文压缩（compact）后恢复。第二个场景更实用——上下文压缩会丢失很多信息，你可以在这里补回来。

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "echo '{\"additionalContext\": \"项目规范：使用 Bun 而非 npm。提交前运行 bun test。分支名用 feat/ 前缀。\"}'"
          }
        ]
      }
    ]
  }
}
```

`matcher: "compact"` 只在上下文压缩恢复时触发。省略 matcher 则新会话也会触发。

### MessageDisplay：消息展示前

在消息显示给用户前触发，可以修改展示内容。适合过滤敏感信息。

```json
{
  "hooks": {
    "MessageDisplay": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "cat | jq '.displayContent.message.content' | sed 's/sk-[a-zA-Z0-9]*/sk-***REDACTED***/g' | jq -R '{\"displayContent\": {\"message\": {\"content\": .}}}'"
          }
        ]
      }
    ]
  }
}
```

这个 Hook 会把展示内容中的 API key 模式替换为 `***REDACTED***`。

## Hook 的输入输出

所有 Hook 通过 stdin 接收 JSON，通过 stdout 返回 JSON。

**输入（stdin）结构：**

```json
{
  "session_id": "abc123",
  "tool_name": "Bash",
  "tool_input": {
    "command": "ls -la"
  },
  "hook_event_name": "PreToolUse"
}
```

PostToolUse 的输入额外包含 `tool_result` 字段，里面有工具的执行结果。

**输出（stdout）结构：**

```json
{
  "decision": "block",
  "reason": "不允许的操作"
}
```

或者只提供附加上下文：

```json
{
  "additionalContext": "提醒信息"
}
```

什么都不输出（stdout 为空）等于放行。

**Exit code 含义：**

| Exit Code | 含义 | 效果 |
|-----------|------|------|
| 0 | 正常 | 按输出 JSON 的 decision 字段处理 |
| 2 | 阻断性错误 | 等同于 `decision: "block"` |
| 其他 | 非阻断性错误 | 记录警告，继续执行 |

**超时：** 默认 60 秒超时。可以在配置中用 `"timeout": 10000` 指定（单位毫秒）。

**异步执行：** 加 `"async": true` 让 Hook 在后台运行，不阻塞主流程。适合通知、日志等不需要等待结果的场景。

## 常见问题

**Hook 脚本没有执行？**

检查三件事：脚本有没有执行权限（`chmod +x`）、路径对不对（用 `${CLAUDE_PROJECT_DIR}` 做相对路径）、JSON 输出格式是否合法。Hook 执行失败不会显示在界面里，需要手动调试。

**PreToolUse 和权限系统谁先生效？**

权限系统先生效。如果权限已经 deny 了，Hook 不会触发。

**Hook 能修改工具参数吗？**

不能。Hook 只能放行或阻断，不能改写工具的输入参数。

**多个 matcher 组同时匹配怎么办？**

按配置顺序依次执行，任何一个返回 `decision: "block"` 就阻断。

**`type: "prompt"` 和 `type: "command"` 怎么选？**

规则明确、能写成脚本判断的用 `command`。需要理解语义、判断意图的用 `prompt`。`command` 快且确定，`prompt` 慢但灵活。

## 关键要点

- Hook 是你写的确定性逻辑，不是 AI 的猜测。它比权限系统灵活，比手动审查可靠
- 三层配置：hook 事件 → matcher 组 → hook 处理器。matcher 粗筛工具名，`if` 细筛参数
- 五类事件覆盖完整生命周期：调用前（Pre）、调用后（Post）、停止时（Stop）、会话开始（SessionStart）、展示时（MessageDisplay）
- stdin JSON 输入、stdout JSON 输出、exit code 控制流程。stdout 为空 = 放行
- `type: "command"` 执行 shell 命令，`type: "prompt"` 调用 LLM 判断，`type: "http"` 发 HTTP 请求
- 配置写在 settings.json 中，支持全局（`~/.claude/settings.json`）和项目级（`.claude/settings.json`）

## 延伸阅读

- [Hooks 官方文档](https://docs.anthropic.com/en/docs/claude-code/hooks) —— 完整的事件列表和 JSON schema
- [Hooks 实用指南](https://docs.anthropic.com/en/docs/claude-code/hooks-guide) —— 通知、格式化、阻断等实际案例
- [Settings 详解](./39-settings-files.md) —— Hook 配置所在的 settings.json 完整说明
- [权限模式](./43-permission-modes-explained.md) —— 理解权限系统和 Hook 的分工

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
