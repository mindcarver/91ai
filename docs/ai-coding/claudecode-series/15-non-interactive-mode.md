# Claude Code 非交互模式

> 更新日期：2025/06

**TL;DR：** `claude -p "你的问题"` 让 Claude Code 像普通命令行工具一样工作——收到 prompt，处理后把结果写到 stdout，然后退出。可以接管道输入、选择输出格式、通过退出码判断成败，是脚本化和自动化场景的基础。

## `-p` 参数基础

### 基本语法

`-p` 是 `--print` 的缩写。加上这个标志后，Claude Code 不进入交互模式，而是：

1. 接收你的 prompt
2. 处理请求（可能会调用工具读文件、搜索代码等）
3. 把最终结果写到 stdout
4. 退出

```bash
claude -p "这个项目的入口文件在哪？"
```

输出直接打到终端。可以重定向到文件：

```bash
claude -p "列出 src/ 下所有未使用的导出函数" > unused-exports.txt
```

### 和交互模式的区别

`claude -p` 的工作方式跟交互模式有一个关键差异：**它处理完就退出，不会等你的后续输入**。

| 行为 | 交互模式 (`claude`) | 非交互模式 (`claude -p`) |
|------|---------------------|--------------------------|
| 输入方式 | 终端里持续对话 | 命令行参数 + 可选 stdin |
| 输出位置 | 终端内显示 | stdout |
| 执行完 | 等下一次输入 | 退出进程 |
| 返回退出码 | 否 | 是（0=成功，非零=失败） |
| 适合场景 | 日常开发、探索、调试 | 脚本、CI、批处理 |

### 启动时带上工具权限

`-p` 模式下没有交互式权限确认，所以需要提前声明允许 Claude 用哪些工具：

```bash
claude -p "跑测试并修复失败的用例" --allowedTools "Bash,Read,Edit"
```

`--allowedTools` 用逗号分隔工具名。如果不加这个参数，Claude 遇到需要权限的操作会直接失败。

也可以用权限模式来批量设置：

```bash
claude -p "应用 lint 修复" --permission-mode acceptEdits
```

`acceptEdits` 允许文件编辑和常见文件系统命令（mkdir、touch 等），其他 shell 命令仍需 `--allowedTools`。

## 管道输入

`-p` 模式接受 stdin 输入。这意味着你可以把任何命令的输出管道给 Claude，它不需要 Bash 权限就能看到这些内容。

### 基本管道

```bash
cat build-error.txt | claude -p "解释这个构建错误的根因"
```

管道数据会作为 prompt 的附加上下文。Claude 会同时看到你的问题和 stdin 传入的内容。

### 分析 git diff

这是最常见的管道用法之一——让 Claude 审查代码变更：

```bash
git diff main | claude -p "检查这个 diff 里的拼写错误，对每个错误报告文件名:行号和问题"
```

不需要给 Claude Bash 权限去跑 `git diff`，因为数据已经通过管道传进去了。

### 在 package.json 中使用

把 Claude 作为项目级的 lint 工具：

```json
{
  "scripts": {
    "lint:claude": "git diff main | claude -p \"你是一个拼写检查器。对 diff 中的每个拼写错误，报告文件名:行号，下一行写问题。不要输出其他内容。\""
  }
}
```

用 `npm run lint:claude` 执行。转义的双引号让脚本跨平台兼容。

### 分析日志

```bash
tail -100 /var/log/app.log | claude -p "找出这段日志里的异常模式"
```

## 输出格式

用 `--output-format` 控制返回内容的格式。三种选项各有适用场景：

### text（默认）

纯文本输出。适合直接阅读或简单脚本。

```bash
claude -p "总结这个项目的架构" --output-format text
```

输出就是 Claude 的回复文本，没有额外包装。

### json

结构化 JSON。包含回复文本、会话 ID、成本信息等元数据。

```bash
claude -p "总结这个项目" --output-format json
```

输出示例（简化）：

```json
{
  "result": "这是一个基于 Next.js 的电商项目，使用 Prisma ORM...",
  "session_id": "abc123-def456",
  "total_cost_usd": 0.042,
  "model": "claude-sonnet-4-6"
}
```

文本内容在 `result` 字段里。用 `jq` 提取：

```bash
claude -p "总结这个项目" --output-format json | jq -r '.result'
```

`json` 格式的几个用途：

- 用 `jq` 提取特定字段做后续处理
- 通过 `total_cost_usd` 跟踪每次调用的花费
- 拿到 `session_id` 后用 `--resume` 继续对话

### stream-json

换行分隔的 JSON 流。每行是一个独立的事件对象，适合实时处理长输出。

```bash
claude -p "写一个 Python 排序算法教程" --output-format stream-json --verbose --include-partial-messages
```

用 `jq` 过滤出文本内容，实现流式显示：

```bash
claude -p "写一首诗" --output-format stream-json --verbose --include-partial-messages | \
  jq -rj 'select(.type == "stream_event" and .event.delta.type? == "text_delta") | .event.delta.text'
```

流中包含多种事件类型：

| 事件 | 说明 |
|------|------|
| `system/init` | 会话开始，报告模型、工具、插件等元信息 |
| `stream_event` | 内容生成事件，包含文本增量 |
| `system/api_retry` | API 重试事件，包含重试次数和延迟 |

### 结构化输出（`--json-schema`）

`--output-format json` 配合 `--json-schema` 可以约束 Claude 返回符合特定 JSON Schema 的结构：

```bash
claude -p "提取 auth.py 中的主要函数名" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}'
```

返回结果中，结构化数据在 `structured_output` 字段里。

### 三种格式的选择

| 场景 | 推荐格式 | 原因 |
|------|---------|------|
| 快速提问、直接看结果 | text | 简单直接 |
| 脚本需要解析结果或跟踪成本 | json | 结构化，有元数据 |
| 长输出需要实时处理 | stream-json | 逐事件流式返回 |
| 需要特定 JSON 结构 | json + json-schema | 约束输出格式 |

## 退出码

`claude -p` 执行完后返回退出码，脚本可以据此判断成功或失败：

| 退出码 | 含义 |
|--------|------|
| 0 | 成功完成 |
| 1 | 出错（API 错误、工具失败、超过轮次限制等） |
| 2 | 被 hook 阻断 |

脚本中的用法：

```bash
#!/bin/bash
result=$(claude -p "检查 src/ 下是否有未处理的 TODO" --output-format json)

if [ $? -eq 0 ]; then
  echo "检查完成"
  echo "$result" | jq -r '.result'
else
  echo "Claude 执行失败，退出码: $?" >&2
  exit 1
fi
```

用 `||` 做错误处理更简洁：

```bash
claude -p "跑测试" --allowedTools "Bash,Read,Edit" || { echo "测试执行失败"; exit 1; }
```

## 脚本集成模式

### 模式 1：代码审查钩子

在 git pre-commit 或 CI 里自动审查代码：

```bash
#!/bin/bash
# review.sh - 对比 main 分支的 diff，检查安全问题
git diff main | claude -p \
  --append-system-prompt "你是一名安全工程师，专注审查安全漏洞。" \
  --output-format json \
  "审查这个 diff 中的安全风险"
```

### 模式 2：构建失败诊断

CI 构建失败时，把日志丢给 Claude 分析：

```bash
#!/bin/bash
# diagnose.sh - 分析构建日志
cat build-error.txt | claude -p "简洁地解释这个构建错误的根因和修复建议" > diagnosis.txt
echo "诊断结果已写入 diagnosis.txt"
```

### 模式 3：多轮对话

用 `--continue` 和 `--resume` 在脚本中实现多轮对话：

```bash
#!/bin/bash
# 第一轮：初始审查
claude -p "审查代码库中的性能问题"

# 第二轮：深入数据库查询
claude -p "重点看数据库查询部分" --continue

# 第三轮：生成总结
claude -p "生成所有发现的总结报告" --continue
```

如果需要更精确地控制对话，用 session ID：

```bash
#!/bin/bash
session_id=$(claude -p "开始审查" --output-format json | jq -r '.session_id')
echo "会话 ID: $session_id"

claude -p "继续审查" --resume "$session_id"
claude -p "生成总结" --resume "$session_id"
```

### 模式 4：`--bare` 加速启动

`--bare` 跳过 hooks、skills、plugins、MCP 服务器和 CLAUDE.md 的自动发现，加快启动速度。CI 和脚本环境推荐使用，因为每台机器上的本地配置不会影响结果：

```bash
claude --bare -p "总结这个文件" --allowedTools "Read"
```

裸模式下 Claude 仍可用 Bash、Read、Edit 工具。其他上下文通过标志手动传入：

```bash
claude --bare -p "审查安全漏洞" \
  --append-system-prompt "你是一名安全工程师" \
  --allowedTools "Read" \
  --output-format json
```

注意：裸模式跳过 OAuth 和钥匙链读取，认证必须通过 `ANTHROPIC_API_KEY` 环境变量提供。

### 模式 5：PR 自动审查

结合 GitHub CLI 使用：

```bash
#!/bin/bash
# pr-review.sh - 审查指定的 PR
PR_NUM=$1

gh pr diff "$PR_NUM" | claude -p \
  --append-system-prompt "你是一名安全工程师，审查安全漏洞。" \
  --output-format json \
  "审查这个 PR 的安全风险"
```

### 控制执行边界

几个有用的限制参数：

```bash
claude -p "重构 auth 模块" \
  --allowedTools "Read,Edit,Bash" \
  --max-turns 5 \
  --max-budget-usd 1.00
```

- `--max-turns`：限制最大轮次，超过则报错退出
- `--max-budget-usd`：限制最大花费（美元），超过则停止

## 与交互模式的选择

不是所有场景都适合 `-p`。选择依据：

**用 `-p` 的场景**：

- CI/CD 管道中的自动审查、自动修复
- 脚本中的批处理任务
- 一次性提问，不需要跟进
- 需要机器可读的输出

**用交互模式的场景**：

- 日常开发中边改边聊
- 需要频繁调整方向的任务
- 探索性分析，不知道下一步问什么
- 需要查看工具调用的中间过程

一个常见的模式是：先用交互模式摸索清楚需求和方案，确认可行后，再用 `-p` 把流程固化成脚本。

## 常见问题

**Q：`-p` 模式下 Claude 能编辑文件吗？**

能。加上 `--allowedTools "Edit"` 或 `--permission-mode acceptEdits`。但建议只在明确需要时开放写权限，只读任务给 `Read` 就够了。

**Q：管道输入有大小限制吗？**

没有硬性限制，但过大的输入会消耗更多 token。对于大文件，考虑用 `head` 或 `tail` 截取关键部分，或者让 Claude 用 `Read` 工具直接读文件（需要给 Read 权限）。

**Q：`-p` 模式会保存会话吗？**

默认会保存。可以用 `--resume` 继续某个 `-p` 会话。如果不需要保存（比如一次性脚本），加 `--no-session-persistence`。

**Q：`--bare` 和普通 `-p` 的结果会不一样吗？**

可能不一样。`--bare` 不加载 CLAUDE.md、hooks、skills 等本地上下文。如果项目有 CLAUDE.md 定义了编码规范，`--bare` 模式下 Claude 不知道这些规范。CI 环境用 `--bare` 是合理的，因为要保证一致性。

**Q：怎么调试 `-p` 脚本？**

加 `--verbose` 看详细输出：

```bash
claude -p "你的问题" --verbose --output-format stream-json
```

也可以用 `--debug` 启用调试日志：

```bash
claude -p "你的问题" --debug --debug-file /tmp/claude-debug.log
```

## 关键要点

1. **`claude -p "问题"` 是非交互模式的入口**：问完就走，结果写 stdout，退出码标明成败
2. **管道输入让数据传递更安全**：`cat file | claude -p` 不需要给 Claude 文件系统权限
3. **三种输出格式覆盖不同需求**：text 给人看，json 给脚本解析，stream-json 给实时处理
4. **`--allowedTools` 是必需品**：非交互模式没有权限确认弹窗，不声明工具权限会导致操作失败
5. **`--bare` 适合 CI**：跳过本地配置，保证脚本在不同机器上行为一致

## 延伸阅读

- [Run Claude Code programmatically - Claude Code 官方文档](https://code.claude.com/docs/en/headless)
- [CLI reference - Claude Code 官方文档](https://code.claude.com/docs/en/cli-reference)
- 系列第 14 篇：Claude Code 交互模式入门
- 系列第 16 篇：管道与 Unix 化用法
- 系列第 26 篇：输出格式与结构化结果
- 系列第 27 篇：`--bare` 和脚本速度优化
- 系列第 69 篇：Headless 模式
