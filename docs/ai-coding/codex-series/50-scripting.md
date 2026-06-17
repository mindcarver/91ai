<!--
调研来源（不发布，仅记录）：
1. OpenAI Codex 源码 openai/codex — codex-rs/exec/ 非交互执行引擎
2. zread.ai/openai/codex/16-non-interactive-exec-mode — exec 模式完整参考
3. zread.ai/openai/codex/20-python-sdk — Python SDK 编程接入
4. zread.ai/openai/codex/21-typescript-sdk — TypeScript SDK 编程接入
5. zread.ai/openai/codex/22-configuration-reference — 配置参考
6. zread.ai/openai/codex/2-quick-start — 快速入门
7. zread.ai/openai/codex/1-overview — 架构概览
8. GitHub openai/codex — .github/ 目录下的 CI 配置参考
版本基准: 2026 年 6 月
-->

# 脚本化 Codex：CI/CD 集成实战

**TL;DR** 把 Codex 塞进 CI/CD 流水线的核心是 `codex exec`——非交互执行 + JSONL 输出 + 环境变量认证，三条能力组合起来就能跑在任何自动化环境里。GitHub Actions 里用 `CODEX_API_KEY` secret 做认证，`--ephemeral` 不留会话痕迹，`--json` 输出供下游解析，`--sandbox workspace-write` 在容器内做安全兜底。stdin 管道模式让 Codex 能消费任何上游命令的输出。`codex exec resume` 支持多阶段 pipeline。安全模型的黄金法则是：API key 代理 + 容器隔离 + 沙箱 + 最小权限策略。

---

## 1. 脚本化 Codex 意味着什么

前面两篇讲了 `codex exec` 的参数和自动审查。这篇把它们串起来，放到真实的 CI/CD 场景里。

"脚本化 Codex" 不是什么高深的概念。本质上就是一件事：**把 Codex 当成一个命令行工具，在脚本里调用它**。

你平时在终端里手动敲的命令：

```bash
codex exec "修复 lint 错误"
```

变成脚本里的一行：

```bash
#!/bin/bash
codex exec --ephemeral "修复 lint 错误"
```

就这么多。但当你把它放到 CI 流水线里，需要考虑的事情就多了——认证怎么做、安全问题怎么防、输出怎么处理、失败怎么重试、成本怎么控制。这篇把这些问题一个个讲清楚。

---

## 2. CI 环境的基本设置

### 2.1 安装 Codex

在 CI runner 上需要先安装 Codex。最简单的方式是用 npm：

```bash
npm install -g @openai/codex
```

或者直接下载二进制：

```bash
# Linux x64
curl -L https://github.com/openai/codex/releases/latest/download/codex-linux-x64 -o /usr/local/bin/codex
chmod +x /usr/local/bin/codex
```

npm 方式跨平台，但需要 Node.js >= 16。二进制方式零依赖，CI 镜像里预装就行。

### 2.2 认证：CODEX_API_KEY

CI 环境没有浏览器，不能用 ChatGPT 登录流程。用 API key 认证：

```bash
export CODEX_API_KEY="${{ secrets.CODEX_API_KEY }}"
```

API key 的安全管理是整个 CI 集成的安全基础。几个原则：

1. **用平台提供的 secrets 机制**：GitHub Actions 的 `secrets`，GitLab CI 的 `variables`（设为 masked），Jenkins 的 Credentials。不要硬编码在代码里
2. **最小权限原则**：如果 Codex 只做代码审查，用只读权限的 key；如果需要修改代码，用有限权限的 key
3. **定期轮换**：设置日历提醒，每 90 天换一次 key
4. **审计 key 使用**：在 OpenAI 后台查看 API 用量，监控异常消耗

### 2.3 沙箱和审批策略

CI 环境里不需要 TUI 审批（没人看）。安全靠两层：容器隔离 + Codex 沙箱。

```bash
codex exec \
  --sandbox workspace-write \
  --ephemeral \
  "你的任务"
```

`--sandbox workspace-write` 限制 Codex 只能写工作目录。`--ephemeral` 不留会话记录。

如果你在 Docker 容器里跑 Codex（推荐），容器本身就是物理隔离。出了问题销毁容器就好。

### 2.4 基础模板

一个最基础的 CI 任务模板：

```bash
#!/bin/bash
set -euo pipefail

# 1. 认证
export CODEX_API_KEY="${CODEX_API_KEY:?请设置 CODEX_API_KEY 环境变量}"

# 2. 执行
codex exec \
  --ephemeral \
  --sandbox workspace-write \
  --json \
  -o result.txt \
  "你的任务描述"

# 3. 检查结果
if [ $? -eq 0 ]; then
  echo "任务成功"
  cat result.txt
else
  echo "任务失败"
  exit 1
fi
```

`set -euo pipefail` 确保任何命令失败都立即退出。`:?` 语法在变量未设置时报错。这是 shell 脚本的基本安全措施。

---

## 3. GitHub Actions 集成

### 3.1 自动修复 lint 错误

这是一个完整的 GitHub Actions workflow——每次 PR 提交时自动让 Codex 修复 lint 错误：

```yaml
name: Auto-fix Lint Errors

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  fix-lint:
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.head_ref }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Codex
        run: npm install -g @openai/codex

      - name: Install Dependencies
        run: npm ci

      - name: Run Lint
        id: lint
        run: |
          npm run lint 2>&1 | tee lint-output.txt
        continue-on-error: true

      - name: Auto-fix with Codex
        if: steps.lint.outcome == 'failure'
        env:
          CODEX_API_KEY: ${{ secrets.CODEX_API_KEY }}
        run: |
          codex exec --ephemeral --sandbox workspace-write \
            -o fix-result.txt \
            "以下是 lint 的输出，请修复所有 lint 错误：$(cat lint-output.txt)"

      - name: Verify Fix
        if: steps.lint.outcome == 'failure'
        run: |
          npm run lint

      - name: Commit and Push Fix
        if: steps.lint.outcome == 'failure'
        run: |
          git config user.name "codex-bot"
          git config user.email "codex-bot@example.com"
          git add -A
          git diff --cached --quiet || git commit -m "fix: auto-fix lint errors"
          git push
```

这个 workflow 的流程：

1. PR 提交 → 触发
2. 跑 `npm run lint`
3. 如果 lint 失败 → 把错误输出喂给 Codex 修复
4. 修复后重新跑 lint 验证
5. 验证通过 → 自动 commit 并 push 到 PR 分支

关键点：`continue-on-error: true` 让 lint 失败不阻塞后续步骤。`if: steps.lint.outcome == 'failure'` 确保只在 lint 失败时才触发修复。

### 3.2 代码审查机器人

每次 PR 提交自动跑代码审查，把结果作为 PR 评论发出来：

```yaml
name: Code Review Bot

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Codex
        run: npm install -g @openai/codex

      - name: Run Code Review
        env:
          CODEX_API_KEY: ${{ secrets.CODEX_API_KEY }}
        run: |
          codex exec review --base origin/main \
            -o review-result.txt \
            "用中文审查，重点关注：1) 安全问题 2) 性能问题 3) 代码可维护性"

      - name: Post Review Comment
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          gh pr comment ${{ github.event.pull_request.number }} \
            --body-file review-result.txt
```

`codex exec review --base origin/main` 审查 PR 相对于 main 的所有改动。结果写到文件，然后用 `gh pr comment` 发到 PR 评论里。

`fetch-depth: 0` 确保检出完整的 Git 历史——`codex exec review --base` 需要对比分支差异。

### 3.3 生成修复补丁（不自动合并）

如果你不想让 Codex 直接改代码，可以让它生成补丁：

```yaml
name: Generate Fix Patch

on:
  issues:
    types: [labeled]

jobs:
  generate-patch:
    if: contains(github.event.label.name, 'auto-fix')
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Codex
        run: npm install -g @openai/codex

      - name: Generate Fix
        env:
          CODEX_API_KEY: ${{ secrets.CODEX_API_KEY }}
        run: |
          # 从 issue 获取描述
          issue_title="${{ github.event.issue.title }}"
          issue_body="${{ github.event.issue.body }}"

          codex exec --ephemeral --sandbox workspace-write \
            -o fix-result.txt \
            "修复以下问题：$issue_title。描述：$issue_body"

      - name: Create PR with Fix
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          branch="auto-fix-issue-${{ github.event.issue.number }}"
          git checkout -b "$branch"
          git add -A
          git diff --cached --quiet || {
            git config user.name "codex-bot"
            git config user.email "codex-bot@example.com"
            git commit -m "fix: ${{ github.event.issue.title }}"
            git push origin "$branch"
            gh pr create \
              --title "Fix: ${{ github.event.issue.title }}" \
              --body "自动修复 #${{ github.event.issue.number }}$(cat fix-result.txt)" \
              --base main \
              --head "$branch"
          }
```

给 issue 打上 `auto-fix` 标签，Codex 自动生成修复代码，创建 PR 等你审查。不直接合并到 main。

---

## 4. stdin 管道模式

`codex exec` 的 stdin 管道让它能和任何命令串联。这是 Unix 哲学的体现——每个工具做一件事，用管道组合。

### 4.1 日志分析

```bash
# 分析应用错误日志
tail -1000 /var/log/app/error.log | \
  codex exec "分析这些错误日志，找出最频繁的错误模式和根因"

# 分析 CI 失败日志
cat ci-failure-log.txt | \
  codex exec -o analysis.md "这个 CI 失败的原因是什么？给出修复步骤"
```

### 4.2 测试总结

```bash
# 分析测试报告
pytest --tb=short 2>&1 | tee test-output.txt
cat test-output.txt | \
  codex exec "总结测试结果：多少通过、多少失败、失败的原因分组"
```

### 4.3 代码库概览

```bash
# 快速了解一个项目
find src/ -name "*.ts" -type f | head -50 | \
  codex exec "根据这些文件路径，推测这个项目的架构和功能"
```

### 4.4 管道链：多工具协作

```bash
# git diff → Codex 审查 → 发送到 Slack
git diff main...HEAD | \
  codex exec --json "审查这些改动" | \
  jq -r '.[] | select(.type=="turn.completed") | .details.agent_message.text' | \
  curl -X POST "$SLACK_WEBHOOK" \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"$(cat -)\"}"
```

三步管道：git 生成 diff → Codex 审查 → 结果发到 Slack。

### 4.5 多阶段管道：分析 → 修复 → 验证

```bash
#!/bin/bash
set -euo pipefail

# 阶段 1: 分析
echo "=== 阶段 1: 分析 ==="
codex exec --json "分析代码库，找出前 3 个最需要重构的模块" > step1.jsonl
thread_id=$(jq -r 'select(.type=="thread.started") | .thread_id' step1.jsonl)
echo "Thread ID: $thread_id"

# 阶段 2: 重构
echo "=== 阶段 2: 重构 ==="
codex exec resume "$thread_id" "对第一个模块进行重构"

# 阶段 3: 验证
echo "=== 阶段 3: 验证 ==="
codex exec resume "$thread_id" \
  "运行测试确保重构没有破坏任何功能。如果有测试失败，修复它们"

echo "=== 完成 ==="
```

三个阶段共享同一个会话上下文。第一步的发现自动传递给第二步，第二步的改动传递给第三步。

---

## 5. --json 输出与下游处理

### 5.1 提取最终回复

```bash
codex exec --json "分析代码" | \
  jq -r 'select(.type=="item.completed") |
    .details | select(.agent_message) |
    .agent_message.text'
```

### 5.2 提取所有执行的命令

```bash
codex exec --json "修复 bug" | \
  jq -r 'select(.type=="item.completed") |
    .details | select(.command_execution) |
    "\(.command_execution.command) (exit: \(.command_execution.exit_code))"'
```

这行命令实时输出 Agent 执行的每一条命令和它的退出码。CI 里可以用来做操作审计。

### 5.3 提取文件变更

```bash
codex exec --json "重构代码" | \
  jq -r 'select(.type=="item.completed") |
    .details | select(.file_change) |
    .file_change.changes[] |
    "\(.kind) \(.path)"'
```

输出 Agent 修改的所有文件和变更类型（add / update / delete）。可以用来生成变更报告。

### 5.4 监控 token 消耗

```bash
codex exec --json "任务" | \
  jq 'select(.type=="turn.completed") | .usage'
```

`turn.completed` 事件包含 token 使用统计。在 CI 里你可以据此估算成本、设置阈值告警。

### 5.5 完整的 JSON 处理脚本

```python
#!/usr/bin/env python3
"""解析 Codex exec --json 输出，生成结构化报告"""

import json
import sys

commands = []
files_changed = []
errors = []
final_message = ""

for line in sys.stdin:
    event = json.loads(line.strip())
    event_type = event.get("type")

    if event_type == "item.completed":
        details = event.get("details", {})

        if "command_execution" in details:
            cmd = details["command_execution"]
            commands.append({
                "command": cmd["command"],
                "exit_code": cmd.get("exit_code"),
                "status": cmd.get("status"),
            })

        elif "file_change" in details:
            fc = details["file_change"]
            for change in fc.get("changes", []):
                files_changed.append({
                    "path": change["path"],
                    "kind": change["kind"],
                    "status": fc.get("status"),
                })

        elif "agent_message" in details:
            final_message = details["agent_message"]["text"]

    elif event_type == "error":
        errors.append(event.get("message", "unknown error"))

report = {
    "message": final_message,
    "commands_executed": len(commands),
    "files_changed": len(files_changed),
    "errors": errors,
    "command_details": commands,
    "file_details": files_changed,
}

print(json.dumps(report, indent=2, ensure_ascii=False))
```

使用方式：

```bash
codex exec --json "重构 API 模块" | python3 parse-report.py > report.json
```

---

## 6. CODEX_API_KEY 安全管理

这节值得单独展开，因为在 CI 里泄露 API key 是最常见、后果最严重的安全事故。

### 6.1 平台级管理

| CI 平台 | Secrets 存储方式 | 参考文档 |
|---------|----------------|---------|
| GitHub Actions | Settings → Secrets → Actions | GitHub 文档 |
| GitLab CI | Settings → CI/CD → Variables (masked) | GitLab 文档 |
| Jenkins | Credentials → System → Global | Jenkins 文档 |
| CircleCI | Project Settings → Environment Variables | CircleCI 文档 |
| Azure DevOps | Pipelines → Library → Variable groups | Azure 文档 |

### 6.2 代理模式

如果你的企业不允许在 CI runner 上直接放 API key，可以走代理模式：

```
CI Runner → 内部代理服务 → OpenAI API
```

代理服务持有真正的 API key，CI runner 只知道代理地址。好处：

- Key 集中管理，轮换只需要改代理服务
- 代理可以做用量限制、审计日志
- CI runner 被攻破不会泄露 key

简单的代理可以用 nginx 反向代理 + API key 注入：

```nginx
server {
    listen 443 ssl;
    server_name codex-proxy.internal;

    location /v1/ {
        proxy_pass https://api.openai.com/v1/;
        proxy_set_header Authorization "Bearer $api_key";
    }
}
```

然后设置：

```bash
export CODEX_API_KEY=""  # 不需要
export OPENAI_API_BASE="https://codex-proxy.internal/v1"
```

具体配置取决于你的 provider 设置，参见第 24 篇。

### 6.3 最低权限 API Key

在 OpenAI 后台创建 API key 时：

1. **设置用量上限**：避免误操作导致巨额账单
2. **限制模型访问**：只开放需要的模型（比如只开放 gpt-5.4-mini 做简单任务）
3. **设置 IP 白名单**：如果 CI runner 的 IP 固定，限制 key 只能从这些 IP 使用

### 6.4 Key 泄露的应急处理

如果你发现 API key 被泄露了：

1. 立即在 OpenAI 后台撤销 key
2. 查看用量日志，确认被盗用的金额
3. 生成新 key，更新所有 CI secrets
4. 排查泄露原因——是 commit 了 `.env` 文件？是日志里打印了 key？是 PR 里暴露了 secret？

---

## 7. 成本控制

在 CI 里跑 Codex 不是免费的。几个控制成本的方法。

### 7.1 用便宜的模型

```bash
# 简单任务用 mini 模型
codex exec -c model=gpt-5.4-mini "格式化代码"

# 复杂任务用旗舰模型
codex exec -c model=gpt-5.5 "重构整个认证模块"
```

GPT-5.4-mini 的成本大约是 GPT-5.5 的 1/5。大部分 CI 任务（lint 修复、格式化、简单审查）用 mini 就够了。

### 7.2 条件触发

不要每次 commit 都跑 Codex。用条件触发减少调用次数：

```yaml
# 只在特定路径变更时触发
on:
  pull_request:
    paths:
      - 'src/**'
      - 'lib/**'
```

```yaml
# 只在手动触发时运行
on:
  workflow_dispatch:
    inputs:
      task:
        description: 'Codex 任务描述'
        required: true
```

### 7.3 缓存策略

如果你有重复的任务，考虑缓存结果。比如对同一个 commit 的审查结果可以缓存：

```yaml
- name: Cache Review
  uses: actions/cache@v4
  with:
    path: review-result.txt
    key: review-${{ github.sha }}
```

同一 commit 不会重复跑审查。

### 7.4 Token 预算

用 `--json` 输出中的 token 统计来设置预算：

```bash
#!/bin/bash
MAX_TOKENS=50000

result=$(codex exec --json "你的任务")
used=$(echo "$result" | jq '[.[] | select(.type=="turn.completed") | .usage.total_tokens] | add // 0')

if [ "$used" -gt "$MAX_TOKENS" ]; then
  echo "警告：本次消耗 $used tokens，超过预算 $MAX_TOKENS"
fi
```

---

## 8. 调试 CI 中的 Codex

CI 里 Codex 出问题时，调试比本地困难得多。几个技巧：

### 8.1 保存详细日志

```bash
codex exec --json "你的任务" 2>codex-stderr.log | tee codex-output.jsonl
```

stdout 是 JSONL 事件流，stderr 是人类可读的进度信息。两边都保存，出问题时可以看。

### 8.2 在 CI 中上传 artifact

```yaml
- name: Upload Codex Logs
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: codex-logs
    path: |
      codex-output.jsonl
      codex-stderr.log
      result.txt
```

`if: always()` 确保即使前面步骤失败也上传日志。日志可以在 GitHub Actions 的 Artifacts 里下载。

### 8.3 本地复现

CI 里出问题，先在本地复现。关键是使用相同的参数：

```bash
# 在项目根目录下跑和 CI 一样的命令
export CODEX_API_KEY="你的key"
codex exec --ephemeral --sandbox workspace-write --json "你的任务"
```

如果本地能跑通但 CI 不行，检查：

- Node.js 版本是否一致
- 依赖是否安装完整（`npm ci` vs `npm install`）
- 环境变量是否一致
- Git 历史是否完整（`fetch-depth: 0`）

---

## 9. 完整的 CI 集成模式总结

把前面讲的组合起来，常见的集成模式有五种：

### 模式 1：只读分析

```bash
codex exec --sandbox read-only --ephemeral "分析代码质量"
```

最安全。Codex 只能读不能改。适合代码审查、质量分析、文档生成。

### 模式 2：自动修复 + 自动提交

```bash
codex exec --sandbox workspace-write --ephemeral "修复 lint 错误"
git add -A && git commit -m "fix: auto-fix" && git push
```

Codex 改代码，自动提交。适合 lint 修复、格式化、依赖更新。

### 模式 3：生成补丁 + 人工审查

```bash
codex exec --sandbox workspace-write "修复 issue #42"
git checkout -b fix-42 && git add -A && git commit -m "fix: #42" && git push
gh pr create --title "Fix: #42" --body "请审查"
```

Codex 改代码，但不直接合并。创建 PR 等人审查。适合 bug 修复、功能实现。

### 模式 4：多阶段 Pipeline

```bash
# 分析
thread_id=$(codex exec --json "分析" | jq -r 'select(.type=="thread.started").thread_id')
# 修复
codex exec resume "$thread_id" "修复"
# 验证
codex exec resume "$thread_id" "验证"
```

多个阶段共享上下文。适合复杂的"分析 → 实施 → 验证"流程。

### 模式 5：SDK 编程接入

```python
from openai_codex import Codex

codex = Codex()
thread = codex.start_thread()

# 分析
result = thread.turn("分析代码").wait()
# 修复
result = thread.turn("修复问题").wait()
# 获取文件变更
changes = [item for item in result.items if item.details.file_change]
```

用 Python SDK 或 TypeScript SDK 编程控制 Codex。适合复杂的自动化工作流、自定义审批逻辑、事件驱动的 Agent 编排。SDK 提供比 CLI 更细粒度的控制——你可以实时处理每个事件、中途打断 turn、动态调整审批策略。

---

## 10. 注意事项和最佳实践

**不要在 CI 里用 `--dangerously-bypass-approvals-and-sandbox`。** 除非你跑在一次性容器里并且完全理解后果。CI 环境的代码库是有价值的，一次误操作可能造成不可逆的损失。

**总是用 `--ephemeral`。** CI 里不需要保留会话记录。不积累文件、不留敏感信息。

**结果要验证。** Codex 生成的代码可能不完美。CI 里应该在 Codex 修改后自动跑测试验证。不验证就提交是危险的。

**设置超时。** Codex 有时候会卡住（模型思考太久、API 超时）。CI 里要有超时机制：

```bash
timeout 300 codex exec "你的任务" || echo "Codex 超时"
```

**监控成本。** 在 CI 里跑 Codex 是按 token 计费的。如果不监控，月底可能收到一张意外的账单。用 `--json` 输出的 token 统计做监控。

**处理幂等性。** 同样的任务跑两次可能产生不同结果（AI 的非确定性）。如果你的 CI 需要可重复的结果，考虑缓存或者用更确定性的模型。

**分支策略。** Codex 自动修改的代码应该走 PR 流程，不要直接 push 到 main。即使是自动修复，也应该有人过一遍 diff。

---

## 延伸阅读

- [Codex CLI GitHub 仓库](https://github.com/openai/codex) — 源码中 `.github/` 目录有 CI 配置参考
- [Codex Python SDK 文档](https://zread.ai/openai/codex/20-python-sdk) — 编程接入的完整 API
- [Codex TypeScript SDK 文档](https://zread.ai/openai/codex/21-typescript-sdk) — Node.js 环境的 SDK
- [Codex 非交互模式文档](https://zread.ai/openai/codex/16-non-interactive-exec-mode) — exec 模式的完整参数和事件 schema
- 上一篇：[Codex 自动审查系统](./49-auto-review.md)
- 下一篇：[GitHub Actions 集成](./51-github-actions.md)

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
