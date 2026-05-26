# codex exec：非交互式批处理和脚本集成

**TL;DR：** `codex exec` 是 Codex CLI 的非交互式执行模式，专为脚本集成、CI/CD 流水线和批量自动化场景设计。与交互式 TUI 模式不同，exec 模式不需要人工确认，输出结构化可控，可以通过管道与 shell 工具链自由组合。本文系统讲解 exec 模式的参数体系、输出格式控制、shell 脚本组合模式、CI/CD 集成实践、安全注意事项，以及与 Claude Code headless 模式的横向对比，最后以一个完整的每日代码质量报告案例收尾。

## exec 模式的定位

Codex CLI 有两种核心运行形态：交互式 TUI 模式和非交互式 exec 模式。交互式模式是默认形态，启动后进入全屏终端界面，支持多轮对话、实时审批、文件预览。exec 模式是单次执行形态，接收一条 prompt，执行完毕后退出，不进入交互状态。

这两种模式不是互相替代的关系，而是面向不同场景的分工。交互式模式适合开发者坐在终端前的日常工作——写代码、调试、重构、探索代码库。exec 模式适合无人值守的自动化场景——CI 流水线中的代码审查、定时任务中的质量报告、Git hook 中的自动检查、批量处理多个仓库或目录。

### 与交互式 TUI 模式的区别

| 维度 | 交互式 TUI 模式 | exec 模式 |
|------|------------------|-----------|
| 启动方式 | `codex` | `codex exec 'prompt'` |
| 执行轮次 | 多轮对话，可持续追问 | 单轮执行，完成后退出 |
| 审批机制 | 实时人工审批每个操作 | 通过参数控制，可完全自动 |
| 输出方式 | TUI 界面内展示 | 标准输出或文件，可管道 |
| 适合场景 | 日常开发、探索、调试 | 脚本、CI/CD、批量任务 |
| 人工参与 | 必须 | 可选 |
| 错误处理 | 交互式修复 | 通过退出码和重试策略处理 |

exec 模式的核心价值在于三个字：可组合。它把 AI 代码能力变成一个标准的命令行工具，可以嵌入任何已有的自动化体系中。不需要改现有的工具链，只需要在需要 AI 判断的位置插入一条 `codex exec` 命令。

### 何时选择 exec 模式

以下场景应该优先考虑 exec 模式：

1. **重复性任务。** 每天或每次提交都要做的事，如代码风格检查、依赖安全扫描、文档同步。
2. **批量处理。** 对多个目录、多个仓库、多个文件执行同一类操作。
3. **流水线集成。** CI/CD 中需要一个 AI 步骤，如自动 review PR、生成变更日志。
4. **定时任务。** 每日代码质量报告、每周依赖更新检查。
5. **管道组合。** AI 的输出作为下一个工具的输入，形成多步骤自动化链。

以下场景不适合用 exec 模式：

1. **需要多轮探索的复杂任务。** 如定位一个深层 bug、理解一个大型架构。
2. **需要实时判断的高风险操作。** 如数据库迁移、生产环境配置修改。
3. **需要频繁人工确认的任务。** 如果每次执行都需要人看结果再决定下一步，交互式模式更合适。

## exec 模式参数体系

exec 模式的参数可以分为四类：执行控制、模型选择、输出格式和安全策略。下面逐一讲解。

### 基本执行参数

```bash
# 最基本的执行方式
codex exec 'Review the code changes in src/auth and list potential issues'
```

exec 后面跟着一个字符串参数作为 prompt。prompt 用单引号或双引号包裹。推荐用单引号，因为 prompt 中经常包含双引号（如 JSON 片段、字符串字面量），单引号避免转义。如果 prompt 本身包含单引号，可以用 `$'...'` 语法：

```bash
codex exec $'Review the function getUser\'s data and check for SQL injection'
```

### 模型选择参数

```bash
# 使用默认模型（codex-mini-latest）
codex exec 'Analyze code quality'

# 指定模型
codex exec -m gpt-5.4 'Review architecture decisions in this project'
codex exec -m o3 'Debug the race condition in worker pool'
codex exec -m gpt-4.1 'Generate migration script for database schema'
```

模型选择的原则和交互式模式一样：简单任务用 codex-mini-latest 节省成本，复杂推理用 o3 系列，需要最新能力的用 gpt-5.4。在 exec 模式中，这个决策更加重要，因为批量执行意味着成本会乘以执行次数。

以下是 exec 模式下常见任务类型的模型推荐：

| 任务类型 | 推荐模型 | 理由 |
|----------|----------|------|
| 代码风格检查 | codex-mini-latest | 规则明确，不需要深度推理 |
| Bug 分析 | o3 | 需要多步推理和因果分析 |
| 架构审查 | gpt-5.4 | 需要理解大规模上下文 |
| 文档生成 | codex-mini-latest | 结构化任务，模型要求不高 |
| 安全审计 | o3 | 需要识别复杂攻击链 |
| 依赖分析 | gpt-4.1 | 需要版本兼容性判断 |
| 测试生成 | codex-mini-latest | 模式固定，模板化程度高 |

### 输出控制参数

```bash
# 输出到文件
codex exec -o review-report.md 'Review code in src/core and generate a markdown report'

# 输出为 JSON 格式
codex exec --json 'List all functions that lack error handling'

# 同时指定 JSON 和文件输出
codex exec --json -o analysis.json 'Analyze dependency graph and output as structured data'
```

`-o` 参数将输出写入指定文件而不是标准输出。这个参数在批量执行时特别有用，每次执行的结果都保存到独立文件中，方便后续汇总或归档。

`--json` 参数改变输出格式为 JSON。默认的纯文本输出适合人阅读，JSON 输出适合机器解析。JSON 输出的结构包含执行状态、模型信息、token 使用量和实际内容，可以被 jq、python、node 等工具直接处理。

### 执行策略参数

```bash
# 全自动模式：不等待任何审批
codex exec --full-auto 'Fix all ESLint errors in src/'

# 临时环境：执行完毕后不保留任何状态
codex exec --ephemeral 'Quick analysis of code complexity'

# 无需审批模式：与 --full-auto 类似但粒度更细
codex exec --ask-for-approval never 'Fix lint issues in utils/'
```

这三个参数控制 Codex 在执行过程中的自主程度：

**--full-auto** 让 Codex 自主完成所有操作，包括文件读写和命令执行。这是 exec 模式下最常用的策略，因为在非交互式场景中，没有人坐在终端前按回车确认。但这也意味着你必须信任 prompt 的约束和 Codex 的判断。

**--ephemeral** 让 Codex 在临时环境中执行，不修改任何项目状态。适合只读分析类任务——代码审查、质量评估、架构分析。ephemeral 模式是 exec 中最安全的选择，因为它的执行结果不会对项目产生任何副作用。

**--ask-for-approval never** 等价于跳过所有审批步骤。和 --full-auto 的区别在于：--full-auto 是一个高级别开关，会同时影响审批策略和执行策略；--ask-for-approval never 只关闭审批，其他行为不变。在 exec 模式中两者效果基本相同，但 --ask-for-approval never 语义更明确，推荐优先使用。

### 完整参数速查

```bash
codex exec \
  'Your prompt here' \           # 必填：执行指令
  -m gpt-5.4 \                   # 可选：模型选择
  -o output.md \                 # 可选：输出到文件
  --full-auto \                  # 可选：全自动执行
  --ephemeral \                  # 可选：临时环境，不修改项目
  --json \                       # 可选：JSON 输出格式
  --ask-for-approval never \     # 可选：跳过审批
  --writable-root /tmp/codex \   # 可选：指定可写目录
  --approval-mode full-auto      # 可选：审批模式（与 --full-auto 等价）
```

## 输出格式控制

exec 模式的输出格式直接影响下游工具能否正确消费。三种输出格式各有适用场景。

### 纯文本输出（默认）

默认情况下，exec 模式将结果输出到标准输出，格式为纯文本：

```bash
codex exec 'Summarize the architecture of this project'
```

纯文本输出的特点：

- 直接可读，无需额外处理。
- 包含 Markdown 格式（标题、列表、代码块），适合作为报告阅读。
- 通过管道传递给 `less`、`tee` 等标准工具。
- 不适合程序化解析，因为没有固定的结构。

典型用法：

```bash
# 在终端中直接阅读
codex exec 'Explain the authentication flow' | less

# 同时显示和保存
codex exec 'Generate API documentation' | tee docs/api-generated.md

# 追加到日志
codex exec "Review commit $(git rev-parse HEAD)" >> review-log.txt
```

### JSON 输出（--json）

JSON 输出是 exec 模式与自动化工具链集成的关键。启用 `--json` 后，输出变为结构化 JSON：

```bash
codex exec --json 'List all functions without unit tests'
```

JSON 输出的典型结构：

```json
{
  "status": "success",
  "model": "codex-mini-latest",
  "prompt": "List all functions without unit tests",
  "response": "Based on the analysis, the following functions lack unit tests:\n...",
  "usage": {
    "input_tokens": 4230,
    "output_tokens": 385,
    "total_tokens": 4615
  },
  "timestamp": "2026-05-26T10:30:00Z",
  "exit_code": 0
}
```

JSON 输出的核心优势是可编程性。每个字段都可以用 jq 精确提取：

```bash
# 只提取分析内容
codex exec --json 'Analyze code complexity' | jq -r '.response'

# 提取 token 消耗用于成本追踪
codex exec --json 'Review security' | jq '.usage.total_tokens'

# 批量执行并汇总 token 消耗
total=0
for dir in src/*/; do
  tokens=$(codex exec --json "Analyze $dir" | jq '.usage.total_tokens')
  total=$((total + tokens))
done
echo "Total tokens consumed: $total"
```

### Markdown 文件输出（-o file.md）

`-o` 参数将输出重定向到文件。虽然可以和任何格式组合，但最常见的组合是输出 Markdown 文件用于人类阅读的报告：

```bash
codex exec -o reports/security-audit.md 'Perform a security audit of src/'
```

文件输出在批量场景中特别有用。每个目录、每个仓库的分析结果保存为独立文件，后续可以统一归档或对比：

```bash
# 为每个模块生成独立的审查报告
for dir in src/*/; do
  module_name=$(basename "$dir")
  codex exec -o "reports/${module_name}-review.md" \
    "Review code quality in $dir and generate a structured report with sections: overview, issues, recommendations"
done
```

### 格式选择决策

| 场景 | 推荐格式 | 理由 |
|------|----------|------|
| 终端快速查看 | 纯文本 | 无需额外处理 |
| 管道传递给其他工具 | JSON (--json) | 结构化，可用 jq 解析 |
| 生成人类报告 | Markdown (-o file.md) | 格式化好，可直接阅读 |
| CI/CD 中提取指标 | JSON (--json) | 可编程提取关键字段 |
| 归档审查记录 | Markdown (-o file.md) | 可读性和持久性兼顾 |
| 日志系统采集 | JSON (--json) | 结构化日志易检索 |

## 与 shell 脚本的组合

exec 模式的真正威力在于与 shell 脚本工具链的组合。这一节展示几种实用的组合模式。

### 批量审查多个目录

最常见的需求是对项目中的每个模块执行相同的分析：

```bash
#!/bin/bash
# batch-review.sh - 批量代码审查脚本

PROJECT_ROOT=$(git rev-parse --show-toplevel)
REPORT_DIR="$PROJECT_ROOT/reports/$(date +%Y-%m-%d)"
mkdir -p "$REPORT_DIR"

# 遍历 src 下的每个一级子目录
for dir in "$PROJECT_ROOT"/src/*/; do
  module_name=$(basename "$dir")

  echo "Reviewing module: $module_name"

  codex exec \
    -m codex-mini-latest \
    -o "$REPORT_DIR/${module_name}.md" \
    "Review code in $dir. Check for: 1) bug-prone patterns 2) missing error handling 3) performance issues 4) code style consistency. Rate overall quality from 1-10."
done

# 生成汇总
echo "Reviews completed. Individual reports in: $REPORT_DIR"
ls -la "$REPORT_DIR"
```

这个脚本的核心思路是：为每个模块生成独立报告，保持结果隔离。每个报告是一个 Markdown 文件，包含结构化的分析内容。执行完毕后可以通过脚本汇总，也可以单独查看某个模块的报告。

### 管道组合

exec 模式的标准输出可以直接通过管道传递给其他工具。这是 Unix 哲学的体现——每个工具做好一件事，通过管道组合完成复杂任务：

```bash
# 提取所有 TODO 注释并格式化
codex exec --json 'Find all TODO, FIXME, and HACK comments in the codebase. For each one, output the file path, line number, and comment text.' \
  | jq -r '.response' \
  | grep -E 'TODO|FIXME|HACK' \
  | sort \
  | uniq

# 检查依赖安全，只输出高风险项
codex exec --json 'Analyze package.json dependencies for known security vulnerabilities. Categorize each as high, medium, or low risk.' \
  | jq -r '.response' \
  | grep -A3 'high risk'

# 生成代码复杂度报告，只显示高复杂度函数
codex exec --json 'Calculate cyclomatic complexity for all functions in src/. List function name, file, and complexity score.' \
  | jq -r '.response' \
  | awk '/complexity: [0-9]+/ { if ($3 > 10) print }'
```

管道组合的威力在于可以把 AI 的自然语言分析能力与 shell 工具的精确过滤能力结合起来。AI 负责"理解"代码，shell 工具负责"筛选"和"格式化"结果。

### 条件执行

根据 exec 的退出码和输出结果决定后续操作：

```bash
#!/bin/bash
# conditional-review.sh - 条件审查脚本

# 检查是否有安全问题
result=$(codex exec --json 'Scan all source files for potential security vulnerabilities: hardcoded secrets, SQL injection, XSS, insecure random number generation. Respond with JSON: {"has_issues": true/false, "count": N, "severity": "high/medium/low"}')

has_issues=$(echo "$result" | jq -r '.response' | jq -r '.has_issues')

if [ "$has_issues" = "true" ]; then
  count=$(echo "$result" | jq -r '.response' | jq -r '.count')
  severity=$(echo "$result" | jq -r '.response' | jq -r '.severity')

  echo "WARNING: $count security issues detected (severity: $severity)"

  # 高严重度时发送通知
  if [ "$severity" = "high" ]; then
    # 发送 Slack 通知或其他告警
    echo "HIGH SEVERITY: Immediate review required" >> security-alerts.log
    exit 1
  fi
else
  echo "No security issues detected."
fi
```

### 跨仓库批量执行

在微服务架构中，经常需要对多个仓库执行统一操作：

```bash
#!/bin/bash
# multi-repo-review.sh - 多仓库批量审查

REPOS=("auth-service" "user-service" "payment-service" "notification-service" "gateway")
BASE_DIR="/path/to/repos"
REPORT_DATE=$(date +%Y-%m-%d)

for repo in "${REPOS[@]}"; do
  repo_path="$BASE_DIR/$repo"

  if [ ! -d "$repo_path" ]; then
    echo "Skipping $repo: directory not found"
    continue
  fi

  echo "Processing $repo..."

  # 切换到仓库目录执行
  (cd "$repo_path" && codex exec \
    -m codex-mini-latest \
    -o "/tmp/reports/${REPORT_DATE}-${repo}.md" \
    "Analyze code quality of this repository. Focus on: consistency of error handling, test coverage estimation, dependency freshness, and API design patterns."
  )
done

echo "All repositories processed."
```

注意跨仓库执行时的几个要点：使用子 shell `(cd ... && ...)` 避免改变当前脚本的工作目录；检查目录是否存在防止脚本中断；报告输出到统一目录便于汇总。

### 并行执行加速

串行处理多个目录时，总耗时是每个执行时间的总和。对于相互独立的任务，可以用并行执行显著缩短总耗时：

```bash
#!/bin/bash
# parallel-review.sh - 并行代码审查

MAX_PARALLEL=4
PROJECT_ROOT=$(git rev-parse --show-toplevel)
REPORT_DIR="$PROJECT_ROOT/reports/$(date +%Y-%m-%d)"
mkdir -p "$REPORT_DIR"

# 使用 GNU parallel 或 xargs 实现并行
find "$PROJECT_ROOT/src" -maxdepth 1 -mindepth 1 -type d | \
  xargs -P "$MAX_PARALLEL" -I {} bash -c '
    module_name=$(basename "{}")
    codex exec \
      -m codex-mini-latest \
      -o "'"$REPORT_DIR"'/${module_name}.md" \
      "Review code quality in {}"
  '

echo "Parallel review completed."
```

并行执行需要注意 API 速率限制。Codex 的底层 API 有每分钟请求数限制，并行度过高可能触发限速。建议 `MAX_PARALLEL` 设为 3-5，根据 API 账户等级调整。

## CI/CD 集成模式

exec 模式在 CI/CD 中的应用是把 AI 代码审查能力嵌入到已有的自动化流程中。下面展示三种典型的集成模式。

### GitHub Actions 集成

在 GitHub Actions 中使用 exec 模式，需要解决认证和权限两个问题。认证通过 GitHub Secrets 存储 API Key，权限通过配置审批策略解决：

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install Codex
        run: npm i -g @openai/codex

      - name: Get changed files
        id: changed
        run: |
          # 获取 PR 中变更的文件列表
          CHANGED_FILES=$(git diff --name-only origin/main...HEAD)
          echo "files=$CHANGED_FILES" >> "$GITHUB_OUTPUT"

      - name: Run AI review
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          codex exec \
            --json \
            --ask-for-approval never \
            -o /tmp/review-result.json \
            "Review the following changed files for bugs, security issues, and code quality:
            ${{ steps.changed.outputs.files }}
            Output a structured review with: summary, issues found, severity levels, and specific recommendations."

      - name: Post review comment
        if: always()
        run: |
          REVIEW_BODY=$(jq -r '.response' /tmp/review-result.json)

          # 使用 GitHub CLI 发布 PR 评论
          gh pr comment ${{ github.event.pull_request.number }} \
            --body "## AI Code Review

          $REVIEW_BODY

          ---
          *Generated by codex exec in CI*"
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

这个工作流的核心逻辑是：PR 创建或更新时，获取变更文件列表，让 Codex 审查这些文件，然后把审查结果作为 PR 评论发布。每一步都是标准的 CI/CD 操作，Codex exec 只是在中间提供一个 AI 分析步骤。

关键注意事项：

- `--ask-for-approval never` 在 CI 中是必要的，因为没有人工交互。
- 使用 `--json` 输出以便后续步骤解析。
- `if: always()` 确保即使 Codex 执行失败也能看到输出。
- API Key 通过 GitHub Secrets 管理，不出现在日志中。

### Git Hooks 集成

Git hooks 是另一种高频使用的集成方式。pre-commit hook 在每次提交前自动执行代码检查：

```bash
#!/bin/bash
# .git/hooks/pre-commit - 提交前自动代码质量检查

# 获取暂存区的文件
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|js|py|go)$')

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

echo "Running AI code quality check on staged files..."

# 快速检查
result=$(codex exec \
  --json \
  -m codex-mini-latest \
  --ask-for-approval never \
  "Quick review of these files for critical issues only:
  $STAGED_FILES

  Check for: syntax errors, obvious bugs, hardcoded secrets, missing imports.
  Respond with JSON: {\"pass\": true/false, \"issues\": [...]}")

pass=$(echo "$result" | jq -r '.response' | jq -r '.pass')

if [ "$pass" = "false" ]; then
  echo "AI Code Review detected issues:"
  echo "$result" | jq -r '.response' | jq -r '.issues[]'
  echo ""
  echo "Commit blocked. Fix the issues above or use --no-verify to skip."
  exit 1
fi

echo "AI Code Review passed."
exit 0
```

pre-commit hook 中的 exec 执行需要快速。几个优化策略：

1. **只检查暂存文件，不检查整个项目。** 通过 `git diff --cached` 获取变更范围。
2. **使用最快的模型。** codex-mini-latest 在简单检查上足够快。
3. **限制检查范围。** 只检查关键问题（语法错误、明显 bug、硬编码密钥），不做深度分析。
4. **设置超时。** 防止 API 响应慢导致提交卡住。

```bash
# 带超时的 pre-commit 检查
timeout 30s codex exec --json 'Quick review...' || {
  echo "AI review timed out, allowing commit"
  exit 0
}
```

超时后允许提交继续，避免因为 AI 服务不可用而阻塞开发流程。

### 定时任务集成

Cron 或其他定时调度系统中使用 exec 模式执行周期性报告：

```bash
#!/bin/bash
# daily-quality-report.sh - 每日代码质量报告

set -euo pipefail

PROJECT_ROOT="/path/to/project"
DATE=$(date +%Y-%m-%d)
REPORT_FILE="$PROJECT_ROOT/reports/daily/${DATE}.md"
mkdir -p "$(dirname "$REPORT_FILE")"

# 获取昨日变更
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d 2>/dev/null || date -v-1d +%Y-%m-%d)
CHANGES=$(git -C "$PROJECT_ROOT" log --oneline --since="$YESTERDAY" || echo "No commits")

# 执行全面质量分析
codex exec \
  -m codex-mini-latest \
  -o "$REPORT_FILE" \
  "Generate a daily code quality report for this project.

  Yesterday's commits:
  $CHANGES

  Include these sections:
  1. Summary of changes and their impact assessment
  2. Code quality metrics: complexity trends, duplication detection, test coverage estimation
  3. Security scan results: potential vulnerabilities, dependency issues
  4. Technical debt assessment: areas that need attention
  5. Recommendations: top 3 priorities for improvement

  Be concise and actionable. Focus on items that require human attention."

echo "Daily report generated: $REPORT_FILE"
```

定时任务的 cron 配置：

```cron
# 每天凌晨 2 点执行代码质量报告
0 2 * * * /path/to/scripts/daily-quality-report.sh >> /var/log/codex-daily.log 2>&1
```

## 安全注意事项

exec 模式无人值守的特性使得安全考量比交互式模式更加重要。交互式模式中，人在回路中可以随时中止错误操作。exec 模式中，一旦启动就按计划执行到底，安全防线必须前置。

### 风险分级

| 风险等级 | 操作类型 | 推荐策略 | 审批模式 |
|----------|----------|----------|----------|
| 低 | 只读分析、报告生成 | --ephemeral | 任何模式均可 |
| 低 | 代码风格修复、格式化 | --full-auto | --ask-for-approval never |
| 中 | 依赖更新、测试生成 | --full-auto + 人工复查 | 执行后人工验证 |
| 高 | 逻辑修改、配置变更 | 不建议 exec | 必须交互式确认 |
| 高 | 数据库操作、部署脚本 | 禁止 exec | 仅交互式模式 |

### --ask-for-approval never 的使用原则

`--ask-for-approval never` 等于完全信任 Codex 的判断，不给任何人工干预的机会。这个参数只应该在以下条件下使用：

1. **操作范围明确且有限。** prompt 中明确指定了处理的文件和目录，Codex 不会去动其他文件。
2. **操作可逆。** 所有修改都在 Git 管控下，可以通过 `git checkout` 或 `git revert` 回退。
3. **输出经过验证。** CI/CD 中 exec 的输出会经过后续步骤的验证（如测试运行、lint 检查）。
4. **已提交的代码。** 在 pre-commit hook 中使用时，所有修改都还未提交，可以轻松放弃。

绝对不应该使用 `--ask-for-approval never` 的场景：

- 修改数据库 schema 或迁移脚本。
- 修改 CI/CD 配置文件本身（可能影响所有后续构建）。
- 修改生产环境配置。
- 执行带有删除操作的命令。
- 处理包含敏感信息的文件（密钥、证书、PII 数据）。

### 日志和审计

所有 exec 执行都应该有日志记录。这是事后审计和问题排查的基础：

```bash
#!/bin/bash
# 带完整日志的 exec 执行

LOG_DIR="/var/log/codex-exec"
mkdir -p "$LOG_DIR"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
LOG_FILE="$LOG_DIR/exec_${TIMESTAMP}.log"

# 记录执行上下文
{
  echo "=== Codex Exec Log ==="
  echo "Timestamp: $(date -Iseconds)"
  echo "User: $(whoami)"
  echo "Directory: $(pwd)"
  echo "Command: codex exec $*"
  echo "---"
} >> "$LOG_FILE"

# 执行并记录输出
codex exec "$@" 2>&1 | tee -a "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}

{
  echo "---"
  echo "Exit code: $EXIT_CODE"
  echo "=== End ==="
} >> "$LOG_FILE"

exit $EXIT_CODE
```

### 沙箱注意事项

exec 模式下沙箱仍然有效，但行为可能和交互式模式不同。几个要点：

- `--full-auto` 模式下 Codex 会尝试执行所有操作，包括 shell 命令。沙箱限制的是文件系统访问范围，不是命令执行本身。
- `--writable-root` 参数可以指定 Codex 的写入目录。在 CI 中建议设为临时目录，避免污染工作空间。
- Linux 环境下确保 Landlock 可用（内核 5.13+），否则沙箱退化为 no-op。

```bash
# CI 环境中推荐的安全配置
codex exec \
  --full-auto \
  --writable-root /tmp/codex-work \
  -o /tmp/codex-output/result.md \
  'Analyze code quality'
```

## 与 Claude Code headless 模式对比

Codex exec 和 Claude Code 的 headless 模式（`claude -p`）在功能定位上有相似之处，都是非交互式执行，但设计哲学和能力范围有本质差异。

### 定位差异

Codex exec 是面向代码操作的执行引擎。它的核心能力是读写文件、执行命令、修改代码。exec 模式把 Codex 的完整代码操作能力开放给脚本和 CI 系统。

Claude Code headless 模式（`claude -p "prompt"`）是 Claude Code 的非交互式前端。它同样可以执行代码操作，但更侧重于通用任务的文本输出。

### 功能对比

| 维度 | Codex exec | Claude Code headless (`claude -p`) |
|------|-----------|-------------------------------------|
| 核心定位 | 代码操作执行引擎 | 通用 AI 助手 |
| 文件操作 | 原生支持，沙箱保护 | 原生支持，沙箱保护 |
| Shell 执行 | 内置支持 | 内置支持 |
| 输出格式 | 纯文本 / JSON / 文件 | 纯文本 / JSON |
| 审批控制 | --ask-for-approval / --full-auto | --allowedTools / --disallowedTools |
| 上下文管理 | 自动加载 AGENTS.md | 自动加载 CLAUDE.md |
| 工具体系 | 内置代码工具 | MCP 扩展体系 |
| 成本模型 | 按 Token 或 ChatGPT 配额 | 按 Token |
| 生态集成 | OpenAI 生态 | Anthropic 生态 |

### 选择建议

选择 Codex exec 的场景：

- 团队已经在使用 OpenAI 模型和 Codex 工作流。
- 任务以代码操作为主（修改、生成、重构）。
- 需要利用 Codex 的 AGENTS.md 上下文体系。
- 成本管理依赖 ChatGPT 订阅配额。

选择 Claude Code headless 的场景：

- 团队已经在使用 Anthropic 模型和 Claude 工作流。
- 任务需要 MCP 工具链扩展（如 Playwright、Context7）。
- 需要利用 Claude 的长上下文窗口处理大型代码库。
- 已有 Claude Code 的 CLAUDE.md 配置体系。

在混合使用两种工具的团队中，可以根据任务特性选择：代码修改类任务用 Codex exec（审批模型更适合代码操作），分析报告类任务用 Claude Code headless（长上下文更适合全面分析）。

## 实战案例：每日代码质量报告系统

这个案例展示如何用 exec 模式构建一个完整的每日代码质量报告系统。系统每天自动执行，生成结构化报告，发送给团队，并跟踪趋势。

### 系统架构

```
cron 定时触发
    |
    v
daily-report.sh (主脚本)
    |
    +-- codex exec: 变更分析
    +-- codex exec: 安全扫描
    +-- codex exec: 技术债务评估
    +-- codex exec: 测试覆盖率估算
    |
    v
汇总脚本
    |
    +-- 生成 Markdown 报告
    +-- 提取关键指标存入 CSV
    +-- 发送通知（Slack / Email）
    |
    v
归档到 reports/ 目录
```

### 完整脚本

```bash
#!/bin/bash
# daily-quality-report.sh
# 每日代码质量报告生成器
# 用法: ./daily-quality-report.sh [项目路径]

set -euo pipefail

# ---- 配置 ----
PROJECT_ROOT="${1:-$(git rev-parse --show-toplevel 2>/dev/null || echo ".")}"
DATE=$(date +%Y-%m-%d)
REPORT_DIR="$PROJECT_ROOT/reports/daily"
METRICS_DIR="$PROJECT_ROOT/reports/metrics"
mkdir -p "$REPORT_DIR" "$METRICS_DIR"

REPORT_FILE="$REPORT_DIR/${DATE}.md"
METRICS_FILE="$METRICS_DIR/quality-trends.csv"

# 模型配置：分析类任务用低成本模型
MODEL="codex-mini-latest"

# ---- 辅助函数 ----
log() {
  echo "[$(date +%H:%M:%S)] $*" >&2
}

run_codex() {
  local prompt="$1"
  local output_file="${2:-}"

  if [ -n "$output_file" ]; then
    codex exec \
      -m "$MODEL" \
      --ask-for-approval never \
      --json \
      -o "$output_file" \
      "$prompt"
  else
    codex exec \
      -m "$MODEL" \
      --ask-for-approval never \
      --json \
      "$prompt"
  fi
}

# ---- 获取上下文 ----
log "Collecting project context..."

# 获取最近 24 小时的提交
RECENT_COMMITS=$(git -C "$PROJECT_ROOT" log --oneline --since="24 hours ago" 2>/dev/null || echo "No recent commits")

# 获取活跃贡献者
ACTIVE_CONTRIBUTORS=$(git -C "$PROJECT_ROOT" shortlog -sn --since="7 days ago" 2>/dev/null || echo "Unknown")

# 获取文件变更统计
CHANGE_STATS=$(git -C "$PROJECT_ROOT" diff --stat HEAD~10..HEAD 2>/dev/null || echo "Insufficient history")

# ---- 第一阶段：变更分析 ----
log "Running change analysis..."

CHANGE_ANALYSIS=$(run_codex \
  "Analyze recent code changes in this project.

  Recent commits (last 24 hours):
  $RECENT_COMMITS

  Change statistics:
  $CHANGE_STATS

  Provide:
  1. Summary of what changed and why
  2. Impact assessment: which areas of the codebase are affected
  3. Risk level of recent changes (high/medium/low)
  4. Any patterns noticed (refactoring trend, new feature area, bug-fix cluster)")

# ---- 第二阶段：安全扫描 ----
log "Running security scan..."

SECURITY_SCAN=$(run_codex \
  "Perform a security-focused review of the codebase.

  Check for:
  1. Hardcoded secrets, API keys, or credentials
  2. SQL injection vulnerabilities
  3. Cross-site scripting (XSS) risks
  4. Insecure dependency versions
  5. Improper input validation
  6. Missing authentication or authorization checks

  For each finding, provide: file path, line range, severity (critical/high/medium/low), and remediation suggestion.
  If no issues found, explicitly state 'No security issues detected.'")

# ---- 第三阶段：技术债务评估 ----
log "Assessing technical debt..."

TECH_DEBT=$(run_codex \
  "Assess the current state of technical debt in this project.

  Evaluate:
  1. Code complexity hotspots: functions or modules that are unusually complex
  2. Duplication: areas with significant code duplication
  3. Dead code: files or functions that appear unused
  4. TODO/FIXME density: how many unresolved markers exist and their distribution
  5. Dependency freshness: are dependencies up to date
  6. Documentation coverage: how well is the code documented

  Assign an overall technical debt score from 1 (minimal) to 10 (critical).
  List top 5 areas that need attention, ranked by priority.")

# ---- 第四阶段：测试覆盖率估算 ----
log "Estimating test coverage..."

TEST_COVERAGE=$(run_codex \
  "Estimate the test coverage situation for this project.

  Analyze:
  1. Which modules have tests and which don't
  2. Test quality indicators: assertion density, edge case coverage, mock usage
  3. Critical paths that lack test coverage
  4. Test maintenance concerns: flaky tests, brittle assertions

  Provide:
  - Estimated overall test coverage percentage
  - Modules most in need of additional tests
  - Recommended testing priorities for the next sprint")

# ---- 汇总报告 ----
log "Generating report..."

cat > "$REPORT_FILE" << REPORT_HEADER
# Daily Code Quality Report

**Date**: $DATE
**Project**: $(basename "$PROJECT_ROOT")

## Overview

Active contributors this week:
$ACTIVE_CONTRIBUTORS

Recent commits:
$RECENT_COMMITS

REPORT_HEADER

# 追加各部分分析结果
echo -e "\n## Change Analysis\n" >> "$REPORT_FILE"
echo "$CHANGE_ANALYSIS" | jq -r '.response' >> "$REPORT_FILE"

echo -e "\n## Security Scan\n" >> "$REPORT_FILE"
echo "$SECURITY_SCAN" | jq -r '.response' >> "$REPORT_FILE"

echo -e "\n## Technical Debt Assessment\n" >> "$REPORT_FILE"
echo "$TECH_DEBT" | jq -r '.response' >> "$REPORT_FILE"

echo -e "\n## Test Coverage Estimation\n" >> "$REPORT_FILE"
echo "$TEST_COVERAGE" | jq -r '.response' >> "$REPORT_FILE"

# 提取关键指标
TOTAL_TOKENS=0
for result in "$CHANGE_ANALYSIS" "$SECURITY_SCAN" "$TECH_DEBT" "$TEST_COVERAGE"; do
  tokens=$(echo "$result" | jq -r '.usage.total_tokens // 0')
  TOTAL_TOKENS=$((TOTAL_TOKENS + tokens))
done

DEBT_SCORE=$(echo "$TECH_DEBT" | jq -r '.response' | grep -oE '[0-9]+(/10)' | head -1 | cut -d/ -f1 || echo "N/A")
SECURITY_ISSUES=$(echo "$SECURITY_SCAN" | jq -r '.response' | grep -ciE '(critical|high severity)' || echo "0")
TEST_COVERAGE_EST=$(echo "$TEST_COVERAGE" | jq -r '.response' | grep -oE '[0-9]+%' | head -1 || echo "N/A")

# 写入趋势数据
echo "$DATE,$DEBT_SCORE,$SECURITY_ISSUES,$TEST_COVERAGE_EST,$TOTAL_TOKENS" >> "$METRICS_FILE"

# ---- 报告尾部 ----
cat >> "$REPORT_FILE" << REPORT_FOOTER

## Metrics Summary

| Metric | Value |
|--------|-------|
| Technical Debt Score | $DEBT_SCORE / 10 |
| Security Issues (Critical/High) | $SECURITY_ISSUES |
| Estimated Test Coverage | $TEST_COVERAGE_EST |
| Total Tokens Consumed | $TOTAL_TOKENS |

## Trend Data

Historical metrics are tracked in: $METRICS_FILE

---
Report generated at $(date -Iseconds)
REPORT_FOOTER

log "Report saved to: $REPORT_FILE"
log "Metrics appended to: $METRICS_FILE"
log "Total tokens consumed: $TOTAL_TOKENS"

# ---- 可选：发送通知 ----
# 以下是一个简单的 Slack 通知示例
# if command -v curl &>/dev/null && [ -n "$SLACK_WEBHOOK_URL" ]; then
#   SUMMARY=$(head -50 "$REPORT_FILE")
#   curl -s -X POST "$SLACK_WEBHOOK_URL" \
#     -H 'Content-Type: application/json' \
#     -d "{\"text\": \"Daily Code Quality Report ($DATE)\nTechnical Debt: $DEBT_SCORE/10\nSecurity Issues: $SECURITY_ISSUES\nTest Coverage: $TEST_COVERAGE_EST\nFull report: $REPORT_FILE\"}"
# fi
```

### 趋势追踪

CSV 格式的趋势数据可以通过简单的脚本生成可视化：

```bash
#!/bin/bash
# quality-trend.sh - 查看最近 30 天的质量趋势

METRICS_FILE="reports/metrics/quality-trends.csv"

if [ ! -f "$METRICS_FILE" ]; then
  echo "No metrics data found."
  exit 1
fi

echo "Code Quality Trend (last 30 days)"
echo "=================================="
echo ""
echo "Date       | Debt Score | Security Issues | Test Coverage | Tokens"
echo "-----------|------------|-----------------|---------------|-------"

tail -30 "$METRICS_FILE" | while IFS=, read -r date debt security coverage tokens; do
  printf "%-10s | %-10s | %-15s | %-13s | %s\n" "$date" "$debt" "$security" "$coverage" "$tokens"
done

echo ""
echo "Trend analysis:"
# 简单的趋势判断
recent=$(tail -7 "$METRICS_FILE" | awk -F, '{sum+=$2; count++} END {print sum/count}')
older=$(tail -30 "$METRICS_FILE" | head -7 | awk -F, '{sum+=$2; count++} END {print sum/count}')

if [ -n "$recent" ] && [ -n "$older" ]; then
  if (( $(echo "$recent < $older" | bc -l) )); then
    echo "  Technical debt: IMPROVING (avg $recent vs $older in prior period)"
  elif (( $(echo "$recent > $older" | bc -l) )); then
    echo "  Technical debt: WORSENING (avg $recent vs $older in prior period)"
  else
    echo "  Technical debt: STABLE (avg $recent)"
  fi
fi
```

### 成本控制

每日报告系统涉及 4 次 Codex 调用，每次约消耗 3000-8000 token（取决于项目大小和 prompt 复杂度）。以 codex-mini-latest 模型计算，单次执行成本在可控范围内。

成本优化策略：

1. **增量分析。** 不每次全量扫描，只分析最近变更的文件。
2. **模型降级。** 安全扫描和技术债务评估用 codex-mini-latest 足够，不需要更强的模型。
3. **缓存结果。** 如果代码没有变更，跳过分析直接使用上次的缓存结果。
4. **频率调整。** 不是每天都必须全量执行。可以工作日每天执行变更分析和安全扫描，每周五执行一次完整的技术债务评估。

```bash
# 增量分析：只分析变更的文件
CHANGED_FILES=$(git -C "$PROJECT_ROOT" diff --name-only HEAD~1..HEAD 2>/dev/null)

if [ -z "$CHANGED_FILES" ]; then
  log "No changes since last report. Skipping analysis."
  exit 0
fi

# 只对变更文件执行分析
codex exec -m "$MODEL" -o "$REPORT_FILE" \
  "Analyze only these changed files: $CHANGED_FILES"
```

## 最佳实践总结

### exec 模式使用的十条原则

1. **先在交互式模式中调试 prompt，再迁移到 exec。** 交互式模式可以即时看到效果并调整，调试好的 prompt 再放到 exec 中批量执行。
2. **永远在 exec 中使用 --json 进行自动化。** JSON 输出可以被可靠解析，纯文本输出在自动化流程中脆弱且不可预测。
3. **批量执行前先单次测试。** 用一个目录或一个文件测试完整的执行链路，确认输出格式、退出码、文件路径都正确，再扩展到全量。
4. **设置合理的超时。** API 调用可能超时或挂起。用 `timeout` 命令包装 exec 调用，防止脚本永远阻塞。
5. **日志是生命线。** 每次执行都记录时间、prompt、模型、token 用量和退出码。出问题时这是唯一的排查依据。
6. **渐进式放开权限。** 从 --ephemeral 开始验证 prompt 效果，确认无误后升级到 --ask-for-approval never。
7. **错误处理不要吞掉异常。** `set -euo pipefail` 确保任何失败立即暴露，而不是静默继续。
8. **API Key 永远不要硬编码。** 用环境变量、CI Secrets 或 secrets manager 管理。在日志中过滤掉 Key。
9. **关注成本乘数效应。** 一次 exec 调用可能便宜，批量执行 50 个目录就是 50 倍。设置每日或每轮的 token 预算上限。
10. **定期评估 prompt 效果。** 代码库在演进，之前有效的 prompt 可能逐渐失效。定期抽查 exec 输出质量，及时调整 prompt。

### 常见问题排查

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| exec 输出为空 | prompt 太模糊或模型无法理解 | 先在交互式模式中测试同一 prompt |
| JSON 解析失败 | 模型输出了非 JSON 内容 | 检查 prompt 是否明确要求 JSON 格式 |
| 执行超时 | 项目过大或模型负载高 | 限制分析范围，增加 timeout，或换用更快模型 |
| 退出码非零 | Codex 内部错误或 API 限速 | 检查日志，添加重试逻辑 |
| 输出文件为空 | -o 路径不存在或权限不足 | 确保目录存在且有写权限 |
| 批量执行成本失控 | 缺少 token 预算控制 | 设置每次执行的 token 上限，汇总监控 |
| 沙箱报错 | Linux 内核不支持 Landlock | 升级内核到 5.13+ 或在 WSL2 中运行 |

exec 模式把 Codex 从一个交互式开发工具变成一个可编程的代码分析引擎。掌握它的参数体系、输出控制和安全策略，就能把 AI 代码能力嵌入到任何自动化流程中。从一条简单的 `codex exec 'prompt'` 开始，逐步构建适合团队工作流的自动化体系，这是 Codex 工程化使用的核心路径。
