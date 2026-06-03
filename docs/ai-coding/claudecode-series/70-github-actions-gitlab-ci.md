# GitHub Actions 和 GitLab CI

> 更新日期：2025/06

**TL;DR：** 用官方 GitHub Action 或 GitLab CI pipeline 把 Claude Code 接入代码审查流程——PR 提交后自动 review、Issue 自动分类、甚至自动提交修复。关键是用 `--permission-mode` 和 `--allowedTools` 把权限边界划清楚，用 `--max-budget-usd` 控制花钱上限。

## CI 里能做什么

Claude Code 进了 CI 之后，能干这些事：

- PR 提交后自动审查代码，把意见写到 PR 评论里
- 在 PR 评论中 `@claude` 提要求，比如 "@claude 帮我加个单元测试"
- Issue 提交后自动分类、打标签、生成修复方案
- 自动提交修复 commit（需要你开放写权限）
- 定时任务：每天跑一遍代码质量检查

做不了的事：不能替代 CI 的编译、测试、部署步骤。Claude Code 是审查和分析角色，不是 build runner。

## GitHub Actions 配置

### 官方 Action

Anthropic 提供了 `anthropics/claude-code-action@v1`，直接用：

```yaml
name: Claude Code Review
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened, assigned]

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  claude:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'issues')
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

这个配置做了三件事：

1. 监听 PR 评论和 Issue 事件
2. 只有评论中包含 `@claude` 才触发（Issue 的 opened/assigned 事件自动触发）
3. 需要 `contents: write` 权限才能让 Claude 提交修复

### 自定义 prompt

不想用默认行为，可以指定 Claude 干什么：

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    prompt: "Review this PR for security vulnerabilities and performance issues"
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    claude_args: |
      --append-system-prompt "Follow the coding standards in CLAUDE.md"
      --max-turns 10
      --model claude-sonnet-4-6
```

`claude_args` 接受所有 CLI flags，跟你在终端里用的一样。常用组合：

| Flag | CI 场景用途 |
|------|------------|
| `--model` | 指定用 sonnet 省钱或用 opus 追求质量 |
| `--max-turns` | 限制操作轮次，防止跑飞 |
| `--max-budget-usd` | 花钱上限，超过就停 |
| `--append-system-prompt` | 追加项目特定的审查规则 |
| `--allowedTools` | 限制可用工具，比如只给 Read 不给 Edit |

### 用 REVIEW.md 定制审查规则

在仓库根目录放一个 `REVIEW.md`，Claude 会自动读取里面的规则：

```markdown
# Review Rules

- Check for SQL injection in all database queries
- Flag any hardcoded secrets or API keys
- Ensure error handling follows our pattern: try/catch with custom AppError
- Reject PRs that add dependencies without updating package-lock.json
```

比 `--append-system-prompt` 更适合团队共享，因为规则跟着仓库走。

### 限定触发条件

不是所有 PR 都想让 Claude 审查。用 `paths` 过滤：

```yaml
on:
  pull_request:
    paths:
      - 'src/**'
      - 'lib/**'
    types: [opened, synchronize]

jobs:
  claude:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }
          prompt: "Review code changes for bugs and suggest improvements"
```

这样只有 `src/` 和 `lib/` 下的文件变更才触发。

## GitLab CI 配置

GitLab 没有官方 Action，需要手动安装 CLI 并配置 pipeline。

### 基础配置

```yaml
stages:
  - ai-review

claude-review:
  stage: ai-review
  image: node:24-alpine3.21
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_PIPELINE_SOURCE == "web"'
  variables:
    GIT_STRATEGY: fetch
  before_script:
    - apk update && apk add --no-cache git curl bash
    - curl -fsSL https://claude.ai/install.sh | bash
  script:
    - |
      claude -p "Review the changes in this merge request. Focus on:
        - Security vulnerabilities
        - Logic errors
        - Missing tests
        Report findings as a summary." \
        --permission-mode acceptEdits \
        --allowedTools "Bash(git diff *),Read,Edit" \
        --max-turns 5 \
        --max-budget-usd 2.00
```

这个配置在 MR 创建时触发，花最多 2 美元做审查。

### 配合 GitLab MCP Server

GitLab 官方提供了 MCP server，让 Claude 能直接调 GitLab API 写评论、创建 Issue：

```yaml
claude-with-mcp:
  stage: ai-review
  image: node:24-alpine3.21
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  variables:
    GIT_STRATEGY: fetch
  before_script:
    - apk update && apk add --no-cache git curl bash
    - curl -fsSL https://claude.ai/install.sh | bash
  script:
    - /bin/gitlab-mcp-server || true
    - |
      claude -p "Review this MR and post comments on specific lines that have issues" \
        --permission-mode acceptEdits \
        --allowedTools "Bash Read Edit Write mcp__gitlab" \
        --max-turns 8 \
        --max-budget-usd 3.00
```

`mcp__gitlab` 工具让 Claude 能通过 GitLab API 创建评论、更新 Issue 状态。需要在 CI 变量里设置 `GITLAB_TOKEN`。

### 定时代码质量检查

```yaml
claude-daily-check:
  stage: ai-review
  image: node:24-alpine3.21
  rules:
    - if: '$CI_PIPELINE_SOURCE == "schedule"'
  before_script:
    - apk update && apk add --no-cache git curl bash
    - curl -fsSL https://claude.ai/install.sh | bash
  script:
    - |
      claude -p "Analyze the codebase for:
        - Unused exports and dead code
        - Inconsistent error handling patterns
        - Missing type annotations
        Generate a report with file paths and line numbers." \
        --allowedTools "Read,Bash(grep *),Bash(find *)" \
        --max-turns 10 \
        --max-budget-usd 5.00
```

在 GitLab 的 CI/CD Schedules 里设置每天跑一次。

## PR 自动审查流程

不管 GitHub 还是 GitLab，自动审查的流程一样：

```
PR/MR 创建
  → CI 触发 Claude Code
    → Claude 读 diff 和相关文件
      → Claude 生成审查意见
        → 写评论到 PR/MR
          →（可选）提交修复 commit
```

要让 Claude 提交修复，必须给写权限。GitHub 需要 `contents: write`，GitLab 需要有 push 权限的 token。建议做法：

1. 初期只开只读权限，让 Claude 只写评论
2. 验证评论质量稳定后，再考虑开放自动修复
3. 自动修复的 PR 建议单独一个分支，不直接合入主分支

## Issue 分类

让 Claude 自动处理新 Issue：

```yaml
# GitHub Actions
on:
  issues:
    types: [opened]

jobs:
  triage:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Triage this issue:
            1. Categorize as bug, feature, question, or documentation
            2. Assign appropriate labels
            3. If it's a bug, try to reproduce and comment with findings
            4. If it's a feature, assess complexity (small/medium/large)
```

Issue 分类比代码审查省钱，因为不需要读大量代码。设置 `--max-budget-usd 0.50` 通常够了。

## 权限边界和安全

### 权限原则

CI 环境下的权限配置比本地开发更敏感，因为没有人按确认键。三条原则：

1. **最小权限**：只给 Claude 完成任务所需的最少工具
2. **明确边界**：用 `--allowedTools` 白名单，不要用 `--dangerously-skip-permissions`
3. **预算封顶**：每次调用都设 `--max-budget-usd`

### 不要用 dangerously-skip-permissions

```yaml
# 错误做法
- claude -p "fix all bugs" --dangerously-skip-permissions

# 正确做法
- claude -p "fix all bugs" --permission-mode acceptEdits --allowedTools "Read,Edit,Bash(npm test)"
```

`--dangerously-skip-permissions` 在 CI 里等于给了一个不受限的 shell。如果 Claude 被恶意 PR 内容误导（prompt injection），它可以用这个权限做任何事。

### API Key 管理

GitHub 用 repository secrets，GitLab 用 CI/CD variables：

```yaml
# GitHub
env:
  ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

# GitLab - 在 Settings > CI/CD > Variables 中添加
# 变量名: ANTHROPIC_API_KEY
# 勾选 Masked 和 Protected
```

注意事项：

- Key 必须设为 protected，只在 protected branch 上可用
- 不要把 key 写进代码或 YAML 文件
- 定期轮换 API key
- 日志里可能泄露 key，Claude 的 `--verbose` 输出要小心

### Prompt Injection 风险

PR 里的代码和评论是外部输入，Claude 会读到。攻击者可以提交包含恶意指令的 PR，诱导 Claude 执行危险操作。防御措施：

1. 只在 protected branch 上运行
2. 用 `--allowedTools` 限制工具范围
3. 不给 `Bash(rm *)`、`Bash(curl *)` 等危险命令的权限
4. 审查日志里 Claude 的实际行为

## 企业 Provider 配置

不用 Anthropic 直连 API，可以走 AWS Bedrock 或 Google Vertex：

```yaml
# AWS Bedrock
env:
  CLAUDE_CODE_USE_BEDROCK: "1"
  AWS_REGION: "us-east-1"
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

# Google Vertex
env:
  CLAUDE_CODE_USE_VERTEX: "1"
  CLOUD_ML_REGION: "us-east5"
  ANTHROPIC_VERTEX_PROJECT_ID: "your-project-id"
```

走 Bedrock/Vertex 的好处：数据不经过 Anthropic，公司内部的合规要求好满足。费用走云厂商账单，不用单独管 API key。

## 成本估算

根据官方数据和使用经验：

| 场景 | 单次成本 | 说明 |
|------|---------|------|
| Issue 分类 | $0.05-0.20 | 输入少，输出短 |
| PR 代码审查（只读） | $0.30-1.00 | 取决于 diff 大小 |
| PR 审查 + 自动修复 | $1.00-5.00 | 需要多轮工具调用 |
| 全仓库扫描 | $3.00-10.00 | 大仓库更贵 |
| 开发者日均使用 | ~$13 | 官方统计的日均值 |

省钱技巧：

- 代码审查用 `sonnet`，不要用 `opus`，价格差 5 倍
- 设置 `--max-budget-usd` 封顶
- 用 `--max-turns` 限制轮次
- 只在关键路径上触发，不要每个 PR 都跑
- 大 diff 先用 `--effort low` 做初步筛选

## 常见问题

**Q：GitHub Action 装了但 @claude 没反应？**

检查几项：
- Secret 名字是不是 `ANTHROPIC_API_KEY`（区分大小写）
- Workflow 文件在不在 `.github/workflows/` 下
- `permissions` 里有没有 `pull-requests: write` 和 `issues: write`
- PR 是不是从 fork 来的（fork PR 默认没有 secret 访问权限）

**Q：GitLab CI 里 Claude 安装失败？**

Alpine 镜像需要先装 bash 和 curl。用 `node:24-alpine3.21` 或更新版本，不要用纯 alpine。安装命令 `curl -fsSL https://claude.ai/install.sh | bash` 需要网络访问。

**Q：怎么限制只有特定目录的变更才触发审查？**

GitHub 用 `paths` 过滤（见上文）。GitLab 用 `rules:changes`：

```yaml
rules:
  - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    changes:
      - src/**/*
      - lib/**/*
```

**Q：Claude 的审查评论能直接approve PR吗？**

不能自动 approve。GitHub 的 `pull_request_review` action 需要 `APPROVE` 事件，Claude 的评论是普通评论不是 review。你可以加一个单独的 step 来处理，但不建议自动 approve——审查意见应该由人看过了再决定。

**Q：CI 里的 Claude 和本地交互模式有区别吗？**

CI 里用的是 `-p` 非交互模式，功能一样，但没有交互式确认。所以权限配置更重要——本地你可以按 N 拒绝一个操作，CI 里 Claude 会按照 `--permission-mode` 直接执行或直接跳过。

## 关键要点

- 官方 `anthropics/claude-code-action@v1` 是 GitHub 上最快的接入方式，监听 `@claude` 触发词即可
- GitLab CI 需要手动装 CLI，用 `-p` 模式跑，配合 GitLab MCP Server 实现评论交互
- 权限边界是 CI 场景下最重要的事：`--allowedTools` 白名单 + `--max-budget-usd` 封顶 + 不要用 `--dangerously-skip-permissions`
- 成本用 sonnet 模型 + 预算上限控制，Issue 分类约 $0.05-0.20，PR 审查约 $0.30-5.00
- 企业环境走 AWS Bedrock 或 Google Vertex，数据不过 Anthropic，合规压力小

## 延伸阅读

- [Claude Code GitHub Actions (官方文档)](https://code.claude.com/docs/en/github-actions) — 官方 Action 配置详解
- [Claude Code GitLab CI/CD (官方文档)](https://code.claude.com/docs/en/gitlab-ci) — GitLab 集成指南
- [anthropics/claude-code-action (GitHub)](https://github.com/anthropics/claude-code-action) — 官方 Action 源码和更新日志
- 系列第 15 篇：`claude -p` 非交互模式
- 系列第 25 篇：CLI flags 总览
- 系列第 43 篇：Permission Modes 全解
