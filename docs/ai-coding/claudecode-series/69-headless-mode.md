# Headless 模式

> 更新日期：2025/06

**TL;DR：** Headless 模式让 Claude Code 变成一个可以塞进脚本和流水线的命令行工具——没有交互界面，接收输入、处理、输出结果、退出。配合 `--bare`、`--allowedTools`、`--output-format json` 和 `--max-turns`，你可以在 CI/CD、定时任务、批处理脚本中自动调度 Claude，而不需要人坐在终端前。

## Headless 是什么

Headless 模式的本质是"无头运行"——就像浏览器有 headless 模式一样，Claude Code 也可以在不启动交互界面的情况下运行。

如果你读过第 15 篇（非交互模式），已经知道 `claude -p "问题"` 的基本用法。Headless 模式跟 `-p` 其实是同一回事：`-p`（即 `--print`）就是启动 headless 的标志。本篇不重复基础语法，而是聚焦在怎么把 headless Claude 塞进真实的自动化场景——批处理脚本、CI/CD 流水线、定时任务。

类比一下：交互模式像打电话，你一句我一句；headless 模式像发邮件，你写好内容发过去，对方处理完把结果发回来，整个过程不需要你等着。

## 三种运行方式对比

| 维度 | 交互模式 | `-p` 非交互模式 | Headless 自动化 |
|------|---------|----------------|----------------|
| 启动命令 | `claude` | `claude -p "问题"` | `claude -p "任务" --bare --output-format json` |
| 有交互界面 | 有 | 无 | 无 |
| 输入来源 | 键盘实时输入 | 命令行参数 + stdin | 脚本传入 / 管道 / CI 触发 |
| 输出位置 | 终端内 | stdout | stdout（可重定向） |
| 执行完 | 等下一次输入 | 退出 | 退出并返回退出码 |
| 适合场景 | 日常开发 | 快速提问 | 批处理、CI、定时任务 |
| 典型标志 | 无 | `-p` | `-p --bare --allowedTools --output-format json` |

三者的核心区别在于"人的参与程度"。交互模式需要你全程盯着；`-p` 基础用法适合手动跑一次；headless 自动化则完全不需要人，适合跑在服务器上。

## 基本用法

### 启动与输入输出

最基础的 headless 调用：

```bash
claude -p "检查 src/ 下有没有 console.log 残留"
```

输出打到 stdout，执行完进程退出。可以重定向：

```bash
claude -p "检查 src/ 下有没有 console.log 残留" > check-result.txt
```

管道输入也行：

```bash
git diff main | claude -p "审查这个 diff 里的安全问题"
```

### 退出码

Headless 模式返回退出码，脚本可以据此分支处理：

| 退出码 | 含义 |
|--------|------|
| 0 | 成功 |
| 1 | 出错（API 错误、工具失败、超过轮次限制） |
| 2 | 被 hook 阻断 |

```bash
#!/bin/bash
if claude -p "检查代码中的安全漏洞" --output-format json > result.json; then
  echo "检查完成"
else
  echo "检查失败，退出码: $?" >&2
  exit 1
fi
```

### `--bare` 加速启动

`--bare` 跳过 hooks、skills、plugins、MCP 服务器和 CLAUDE.md 的加载。CI 环境和纯脚本场景推荐用，好处有两个：启动更快、行为可复现（不受本地配置干扰）。

```bash
claude --bare -p "审查这个文件的安全问题" --allowedTools "Read"
```

注意：`--bare` 跳过 OAuth 和钥匙链读取，认证必须通过 `ANTHROPIC_API_KEY` 环境变量提供。

### 控制执行边界

几个限制参数防止 headless 任务跑飞：

```bash
claude -p "重构 auth 模块" \
  --allowedTools "Read,Edit,Bash" \
  --max-turns 5 \
  --max-budget-usd 1.00
```

- `--max-turns 5`：最多跑 5 轮工具调用，超过就停
- `--max-budget-usd 1.00`：花费上限 1 美元，超过就停
- `--allowedTools`：限制可用工具，不给不必要的权限

## 批处理模式

### 多文件批量处理

对目录下所有同类文件执行相同操作：

```bash
#!/bin/bash
# batch-jsdoc.sh - 给所有 TS 文件加 JSDoc 注释
for file in src/**/*.ts; do
  echo "处理: $file"
  claude -p "给 @$file 里的公开函数加 JSDoc 注释，不要改逻辑" \
    --allowedTools "Read,Edit" \
    --max-turns 3
done
```

`@$file` 是 Claude Code 的文件引用语法，让 Claude 直接读取文件内容，不需要通过管道传入。

### 批量迁移

把 JS 文件迁移到 TS：

```bash
#!/bin/bash
# migrate-to-ts.sh
for file in $(find src -name "*.js" -not -path "*/node_modules/*"); do
  ts_file="${file%.js}.ts"
  echo "迁移: $file -> $ts_file"
  claude -p "把这个 JS 文件转成 TypeScript，加类型注解: @$file" \
    --allowedTools "Read,Write" \
    --max-turns 2 \
    --output-format json | jq -r '.result'
done
```

### 结果收集

批处理时用 JSON 格式收集所有结果：

```bash
#!/bin/bash
# batch-review.sh - 审查所有变更文件，汇总结果
echo "[" > reviews.json
first=true

for file in $(git diff --name-only main); do
  if [ "$first" = true ]; then
    first=false
  else
    echo "," >> reviews.json
  fi
  
  result=$(claude -p "审查 @$file 的代码质量，报告问题" \
    --bare \
    --allowedTools "Read" \
    --output-format json \
    --max-turns 2)
  
  echo "$result" >> reviews.json
done

echo "]" >> reviews.json
echo "审查结果已写入 reviews.json"
```

### 配合 xargs 并行处理

`xargs` 可以并行启动多个 Claude 实例：

```bash
find src -name "*.py" | xargs -P 3 -I {} claude -p \
  "检查 @{} 是否有类型注解，给出改进建议" \
  --allowedTools "Read" \
  --max-turns 1
```

`-P 3` 表示最多 3 个并行实例。注意并行数受 API 速率限制和成本预算约束。

## 与 CI/CD 集成

### GitHub Actions 基本配置

```yaml
# .github/workflows/claude-review.yml
name: Claude Code Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Install Claude Code
        run: npm install -g @anthropic-ai/claude-code

      - name: Get changed files
        id: changed
        run: |
          files=$(git diff --name-only origin/main...HEAD)
          echo "files=$files" >> $GITHUB_OUTPUT

      - name: Claude Review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude -p "审查这些文件的变更：${{ steps.changed.outputs.files }}
          检查以下问题：
          1. 潜在 bug
          2. 安全风险
          3. 性能问题
          用中文回复。" \
            --bare \
            --allowedTools "Read" \
            --output-format json > review.json

      - name: Post Review Comment
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const review = JSON.parse(fs.readFileSync('review.json', 'utf8'));
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## Claude Code Review\n\n${review.result}`
            });
```

### 定时安全审计

每周一凌晨跑一次安全扫描：

```yaml
# .github/workflows/security-audit.yml
name: Weekly Security Audit
on:
  schedule:
    - cron: '0 2 * * 1'

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @anthropic-ai/claude-code

      - name: Security Audit
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude -p "对这个项目做安全审计：
          1. 扫描依赖中的已知漏洞
          2. 检查危险代码模式（eval、innerHTML、SQL 拼接）
          3. 识别可能泄露的 secret
          生成带优先级的报告。" \
            --bare \
            --allowedTools "Read,Grep,Glob" \
            --max-turns 5 \
            --output-format json > security-report.json

      - uses: actions/upload-artifact@v4
        with:
          name: security-report
          path: security-report.json
```

### 不阻塞流水线的错误处理

CI 里 Claude 失败不应该直接阻断构建：

```bash
#!/bin/bash
set -e
if ! claude -p "检查代码风格" --output-format json > style-result.json; then
  echo "Claude 检查失败，降级为跳过" >&2
  echo '{"result": "检查跳过"}' > style-result.json
fi
# 继续后续步骤
```

## 安全考量

### 权限最小化

Headless 模式没有交互式权限确认，所以工具权限的控制格外重要。原则：**只给任务需要的最小权限**。

```bash
# 只读分析——不给写权限
claude -p "分析代码复杂度" --allowedTools "Read,Grep,Glob"

# 需要修改文件——限制工具范围
claude -p "修复 lint 错误" --allowedTools "Read,Edit"

# 需要跑命令——要格外谨慎
claude -p "运行测试并修复失败" --allowedTools "Read,Edit,Bash"
```

`--dangerously-skip-permissions` 会跳过所有权限检查，只在隔离的 CI 容器中使用，不要在日常脚本里用。

### Secrets 管理

```bash
# 错误：把 API key 写在脚本里
claude -p "..." --some-flag "sk-ant-xxxxx"

# 正确：通过环境变量传入
export ANTHROPIC_API_KEY=$(cat ~/.claude-api-key)
claude -p "..." --bare
```

CI 里用平台提供的 secrets 功能（如 GitHub Actions 的 `secrets.ANTHROPIC_API_KEY`），不要硬编码。

### 成本控制

每次 headless 调用都有成本。几个控制手段：

- `--max-turns`：限制轮次，简单任务设 1-3 轮
- `--max-budget-usd`：设花费上限
- `--bare`：跳过不必要上下文，减少 token 消耗
- 条件触发：CI 里只对非 draft PR 运行审查

```yaml
jobs:
  review:
    if: github.event.pull_request.draft == false
```

粗略估算几个常见任务的 token 消耗：

| 任务类型 | 大约 token 数 | 大约成本 |
|---------|-------------|---------|
| 单文件代码审查 | ~5,000 | ~$0.02 |
| 测试生成 | ~15,000 | ~$0.05 |
| 全项目安全审计 | ~30,000-50,000 | ~$0.10-0.15 |

实际成本取决于代码量、模型和工具调用次数。

## 实用脚本示例

### 1. 自动生成 Changelog

```bash
#!/bin/bash
# changelog.sh - 从 git 提交记录生成 Changelog
VERSION=${1:?"用法: ./changelog.sh <version>"}
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null)

if [ -z "$LAST_TAG" ]; then
  COMMITS=$(git log --pretty=format:"- %s")
else
  COMMITS=$(git log --pretty=format:"- %s" "$LAST_TAG"..HEAD)
fi

echo "$COMMITS" | claude -p \
  "根据以下提交记录生成 Changelog，版本号 $VERSION。
按这些分类：新增、变更、修复、移除。
格式简洁，面向用户。" \
  --bare \
  --max-turns 1 > "CHANGELOG_${VERSION}.md"

echo "已生成 CHANGELOG_${VERSION}.md"
```

### 2. PR 自动审查

```bash
#!/bin/bash
# pr-review.sh - 审查指定 PR
PR_NUM=${1:?"用法: ./pr-review.sh <PR号>"}

gh pr diff "$PR_NUM" | claude -p \
  "你是代码审查员。审查这个 PR 的变更，检查：
1. 逻辑错误
2. 安全风险
3. 性能问题
4. 测试覆盖是否充分
用简洁的要点回复。" \
  --bare \
  --allowedTools "Read" \
  --output-format json | jq -r '.result'
```

### 3. 日志异常检测

```bash
#!/bin/bash
# log-monitor.sh - 分析最近的日志异常
LOG_FILE=${1:-"/var/log/app.log"}
LINES=${2:-"200"}

tail -n "$LINES" "$LOG_FILE" | claude -p \
  "分析这段日志，找出异常模式。
报告：错误类型、出现频率、可能的原因。" \
  --bare \
  --max-turns 1
```

### 4. 定时跑批（配合 cron）

```bash
#!/bin/bash
# nightly-check.sh - 每晚跑一次代码健康检查
# crontab: 0 2 * * * /path/to/nightly-check.sh

REPORT_FILE="/tmp/claude-nightly-$(date +%Y%m%d).md"

claude -p "对项目做全面检查：
1. 有没有未处理的 TODO 或 FIXME
2. 有没有大函数（超过 50 行）
3. 有没有未使用的导出
4. 依赖有没有安全公告
生成报告。" \
  --bare \
  --allowedTools "Read,Grep,Glob" \
  --max-turns 5 \
  --max-budget-usd 0.50 > "$REPORT_FILE"

# 发送报告
mail -s "代码健康报告 $(date +%Y-%m-%d)" dev-team@example.com < "$REPORT_FILE"
```

### 5. 多文件批量加注释

```bash
#!/bin/bash
# batch-comments.sh - 给指定目录下的文件加文档注释
DIR=${1:-"src"}

find "$DIR" -name "*.ts" -not -path "*/node_modules/*" | while read -r file; do
  echo "处理: $file"
  claude -p "给 @$file 的公开 API 加 TSDoc 注释，不改逻辑和类型" \
    --allowedTools "Read,Edit" \
    --max-turns 2
done
```

## 常见问题

**Q：Headless 模式和 `-p` 有什么区别？**

没有区别。`-p`（`--print`）就是 headless 模式的启动标志。本篇说"headless"时，指的就是带 `-p` 的自动化用法，区别于手动跑一次 `-p` 的场景。

**Q：Headless 模式下 Claude 能编辑文件、跑命令吗？**

能，但需要通过 `--allowedTools` 显式授权。不加这个参数，Claude 遇到需要权限的操作会直接失败。

**Q：并行跑多个 headless Claude 实例有问题吗？**

技术上没问题，每个 `claude -p` 是独立进程。但要注意两点：API 速率限制（同时请求太多会被限流）和成本叠加（5 个并行实例 = 5 倍花费）。建议并行数控制在 3-5 个以内。

**Q：`--bare` 和普通 headless 有什么区别？**

`--bare` 跳过 CLAUDE.md、hooks、skills、MCP 服务器的加载。CI 环境推荐用 `--bare` 保证行为一致。如果项目的 CLAUDE.md 里定义了编码规范，`--bare` 模式下 Claude 不知道这些规范——这时需要用 `--append-system-prompt` 手动传入。

**Q：怎么调试 headless 脚本？**

加 `--verbose` 看详细过程：

```bash
claude -p "你的任务" --verbose --output-format stream-json
```

或用 `--debug` 写日志文件：

```bash
claude -p "你的任务" --debug --debug-file /tmp/claude-debug.log
```

**Q：headless 模式的会话能恢复吗？**

能。用 `--output-format json` 拿到 `session_id`，之后用 `--resume` 继续：

```bash
SESSION=$(claude -p "初始分析" --output-format json | jq -r '.session_id')
claude -p "继续深入分析" --resume "$SESSION"
```

## 关键要点

1. **Headless 就是 `-p` 的自动化用法**：没有交互界面，prompt 进、结果出、进程退出
2. **`--bare` 是 CI 场景的好搭档**：跳过本地配置，保证可复现性
3. **权限控制是安全核心**：用 `--allowedTools` 给最小权限，不要在生产脚本里用 `--dangerously-skip-permissions`
4. **成本需要显式控制**：`--max-turns` 和 `--max-budget-usd` 防止任务跑飞
5. **退出码让脚本可以做分支处理**：0 成功、1 失败、2 被 hook 阻断
6. **批处理时控制并行度**：3-5 个并行实例是合理的起点

## 延伸阅读

- [Run Claude Code programmatically - Claude Code 官方文档](https://code.claude.com/docs/en/headless)
- [Common Workflows - Claude Code 官方文档](https://code.claude.com/docs/en/common-workflows)
- 系列第 15 篇：Claude Code 非交互模式（`-p` 基础语法详解）
- 系列第 25 篇：CLI 标志参考
- 系列第 43 篇：权限模式详解

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
