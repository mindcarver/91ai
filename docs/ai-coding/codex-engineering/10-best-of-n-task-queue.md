# Best-of-N 与任务队列：多试选优和批量工作流

**TL;DR：** Best-of-N 策略利用模型输出的随机性，让同一任务执行多次后选最优结果，是提升 Codex 任务成功率的最直接手段。任务队列把待办事项结构化为 Codex 可逐个消费的工作流。两者结合 codex exec 的非交互式执行能力，加上 git worktree 的并行隔离机制，构成从"单次对话"到"批量工程流水线"的升级路径。本文覆盖 Best-of-N 的实现方式与成本权衡、任务队列的设计模式、worktree 并行策略、codex exec 批量执行，以及 AGENTS.md 对批量工作流的支持。

---

## 为什么需要 Best-of-N

大语言模型的生成过程本质上是概率采样。相同的 prompt，不同的采样种子，产出不同的代码。这种随机性不是缺陷，而是可以利用的特性。

实际工程中的观察数据：

| 任务类型 | 单次成功率 | Best-of-3 成功率 | 成本增幅 |
|----------|-----------|-----------------|---------|
| 简单 bug 修复 | 75-85% | 95%+ | 3x Token |
| 中等重构任务 | 50-65% | 80-90% | 3x Token |
| 复杂架构迁移 | 30-45% | 60-75% | 3x Token |
| 测试补全 | 70-80% | 90%+ | 3x Token |

数据来源是社区实践的汇总估计，不是精确的基准测试。但趋势是明确的：对于重要任务，多试几次的投入产出比显著为正。

OpenAI 官方在多个场合推荐对高价值任务使用 Best-of-N 策略。其核心论点是：模型的单次输出有质量波动，但多次采样几乎必然包含一个高质量解。问题不在于"模型能不能做对"，而在于"你是否给了它足够的机会"。

## Best-of-N 的核心机制

### 随机性的来源

模型在生成每个 token 时，从概率分布中采样。temperature 参数控制分布的"尖锐程度"：temperature 越高，低概率 token 被选中的可能性越大，输出越多样。Codex 在默认模式下使用固定的 temperature（由系统根据任务类型自动调节），但即便 temperature 较低，不同运行之间仍有差异。

这种差异意味着：

- 第一次运行可能选择方案 A（直接修改逻辑）
- 第二次运行可能选择方案 B（重构后再修改）
- 第三次运行可能选择方案 C（添加中间层）

三个方案都能完成任务，但代码质量、可维护性和测试覆盖率可能差异很大。Best-of-N 的价值在于从多个可行方案中选出最好的那个。

### N 值的选择

N 不是越大越好。经验法则：

| N 值 | 适用场景 | 成本倍数 | 推荐度 |
|------|---------|---------|-------|
| 1 | 低风险、高确定性任务（格式化、简单查询） | 1x | 默认 |
| 2 | 中等风险任务（常规 bug 修复、小重构） | 2x | 常用 |
| 3 | 高价值任务（核心逻辑修改、安全相关） | 3x | 推荐 |
| 5+ | 极高价值或极低成功率任务 | 5x+ | 谨慎使用 |

N=2 到 N=3 是性价比甜点。从 N=3 到 N=5 的边际收益通常远低于从 N=1 到 N=3。原因在于模型的输出分布不是均匀的——大多数时候有 1-2 个明显的优质解，再多采样只是增加相似的平庸结果。

## Best-of-N 的三种实现方式

### 方式一：手动多次运行

最简单的实现。在交互模式下对同一个 prompt 运行多次，人工比较结果。

```bash
# 第一次尝试
codex "重构 src/auth/login.ts，将 callback 风格改为 async/await"

# 记录结果后，在新会话中重新运行相同 prompt
codex "重构 src/auth/login.ts，将 callback 风格改为 async/await"

# 第三次尝试
codex "重构 src/auth/login.ts，将 callback 风格改为 async/await"
```

优点：零工程成本，立刻可用。缺点：需要人工启动每次运行、人工比较结果，无法规模化。适合偶尔对关键任务使用。

### 方式二：codex exec + Shell 脚本自动化

用 codex exec 的非交互模式，配合 shell 脚本实现自动化多次运行。

```bash
#!/bin/bash
# best_of_n.sh - 自动化 Best-of-N 执行脚本

PROMPT="$1"
N="${2:-3}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RESULTS_DIR="/tmp/codex-bon-${TIMESTAMP}"

mkdir -p "$RESULTS_DIR"

echo "=== Best-of-N 执行开始 ==="
echo "任务: $PROMPT"
echo "次数: $N"
echo ""

for i in $(seq 1 "$N"); do
    echo "--- 第 ${i}/${N} 次尝试 ---"
    codex exec \
        --ask-for-approval never \
        -o "${RESULTS_DIR}/run_${i}_output.md" \
        "$PROMPT" \
        > "${RESULTS_DIR}/run_${i}.log" 2>&1

    if [ $? -eq 0 ]; then
        echo "第 ${i} 次完成"
    else
        echo "第 ${i} 次失败"
    fi
done

echo ""
echo "=== 所有尝试完成 ==="
echo "结果目录: $RESULTS_DIR"
echo ""
echo "各次运行的输出文件："
ls -la "$RESULTS_DIR"/*.md 2>/dev/null
```

使用方式：

```bash
chmod +x best_of_n.sh

# 运行 3 次取最优
./best_of_n.sh "修复 src/api/handler.ts 中的错误处理，确保所有异常都有对应的 HTTP 状态码" 3

# 运行 5 次（高价值任务）
./best_of_n.sh "重构整个支付模块，将同步调用改为异步事件驱动架构" 5
```

这种方式的优点是可重复、可记录。每次运行的输出都保存到独立文件，方便事后比较。缺点是需要人工审阅结果来选出最佳方案。

### 方式三：codex exec + worktree 隔离

这是最完备的实现。每次尝试在独立的 git worktree 中运行，互不干扰，完成后可以逐个检查、挑选最佳结果并合并。

```bash
#!/bin/bash
# best_of_n_worktree.sh - worktree 隔离的 Best-of-N 执行

PROMPT="$1"
N="${2:-3}"
BRANCH_PREFIX="bon"
BASE_BRANCH=$(git branch --show-current)

echo "=== Worktree Best-of-N 执行 ==="
echo "基线分支: $BASE_BRANCH"

# 创建 N 个 worktree
for i in $(seq 1 "$N"); do
    BRANCH_NAME="${BRANCH_PREFIX}_run_${i}_$(date +%Y%m%d_%H%M%S)"
    WORKTREE_PATH=".worktrees/${BRANCH_NAME}"

    echo "创建 worktree: $WORKTREE_PATH (分支: $BRANCH_NAME)"

    git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" 2>/dev/null

    # 在 worktree 中执行 Codex
    echo "在 worktree ${i} 中执行 Codex..."
    (
        cd "$WORKTREE_PATH"
        codex exec \
            --ask-for-approval never \
            "$PROMPT"
    )

    echo "Worktree ${i} 完成"
done

echo ""
echo "=== 所有 worktree 执行完成 ==="
echo ""
echo "检查各 worktree 的 diff："
for wt in .worktrees/${BRANCH_PREFIX}_run_*; do
    echo ""
    echo "--- $(basename $wt) ---"
    (cd "$wt" && git diff --stat)
done

echo ""
echo "选择最佳结果后，用以下命令合并："
echo "  git merge <选中的分支名>"
echo ""
echo "清理未选中的 worktree："
echo "  git worktree remove .worktrees/<未选中分支名>"
echo "  git branch -d <未选中分支名>"
```

关键设计点：

1. 每个 worktree 基于同一个基线分支创建，确保起点一致
2. 每次运行在独立的文件系统中进行，避免文件锁冲突和状态污染
3. 完成后可以用 `git diff` 逐个审查每份修改
4. 选定最佳结果后合并，其余 worktree 直接丢弃

## 选择策略：如何判断哪个结果最好

Best-of-N 的核心挑战不是"生成多个结果"，而是"选出最好的那个"。选择策略直接影响 Best-of-N 的实际效果。

### 自动化筛选：验证优先

最可靠的筛选方式是自动化验证。优先级排序：

```
1. 测试通过 > 测试未通过
2. Lint 无警告 > Lint 有警告
3. Type check 通过 > Type check 未通过
4. 改动范围小 > 改动范围大
5. 无额外依赖 > 引入新依赖
```

用脚本实现自动化评分：

```bash
#!/bin/bash
# score_result.sh - 对单个 worktree 的修改进行自动化评分

WORKTREE_PATH="$1"
SCORE=0

cd "$WORKTREE_PATH" || exit 1

# 测试是否通过 (+40 分)
pnpm test > /dev/null 2>&1 && SCORE=$((SCORE + 40))
# 或其他测试命令
# go test ./... > /dev/null 2>&1 && SCORE=$((SCORE + 40))

# Lint 是否通过 (+20 分)
pnpm lint > /dev/null 2>&1 && SCORE=$((SCORE + 20))

# Type check 是否通过 (+20 分)
pnpm typecheck > /dev/null 2>&1 && SCORE=$((SCORE + 20))

# 改动行数越少越好（最多 +20 分）
CHANGED_LINES=$(git diff --shortstat | grep -oP '\d+(?= insertion)' || echo 0)
if [ "$CHANGED_LINES" -lt 50 ]; then
    SCORE=$((SCORE + 20))
elif [ "$CHANGED_LINES" -lt 100 ]; then
    SCORE=$((SCORE + 10))
fi

echo "$SCORE"
```

### 人工复核

自动化筛选只能排除明显不合格的结果。最终的选择通常需要人工判断以下维度：

| 维度 | 判断方法 | 权重 |
|------|---------|------|
| 功能正确性 | 阅读代码逻辑，确认边界条件处理 | 最高 |
| 代码风格 | 是否符合项目既有模式 | 中 |
| 可维护性 | 是否引入不必要的抽象或复杂度 | 高 |
| 测试覆盖 | 修改是否伴随相应测试更新 | 高 |
| 副作用 | 是否意外修改了不相关的文件 | 中 |

实际操作中，先用自动化筛选把 N 个结果缩减到 1-2 个候选，再人工做最终选择。这种两级筛选在 N=3 时效率最高：自动化排除 1 个不合格的，人工从剩余 2 个中选更好的那个。

## 成本考量

Best-of-N 的成本是线性的：N 次运行消耗 N 倍 Token。但成本计算不能只看 Token 消耗。

### 全成本模型

```
总成本 = N x (Token 成本 + 执行时间) + 人工审阅时间
```

具体分析：

| 成本项 | N=1 | N=3 | N=5 |
|--------|-----|-----|-----|
| Token 消耗 | 1x | 3x | 5x |
| 时钟时间（串行） | 1x | 3x | 5x |
| 时钟时间（并行） | 1x | 1x | 1x |
| 人工审阅 | 0-5 分钟 | 10-20 分钟 | 20-40 分钟 |
| 返工概率 | 较高 | 较低 | 很低 |

关键洞察：并行执行可以把时钟时间压到与 N=1 相同。真正的增量成本是 Token 和审阅时间。

### 预算控制策略

在实际项目中，不能对所有任务都使用 Best-of-N。预算控制的核心是区分任务优先级：

```markdown
# 在 AGENTS.md 中声明任务优先级策略

## Task Execution Policy
- P0 任务（核心业务逻辑、安全相关）：使用 Best-of-3
- P1 任务（常规功能开发）：使用 Best-of-2
- P2 任务（文档更新、格式调整）：单次执行
- P3 任务（探索性调研）：单次执行，Ask 模式
```

或者用更精确的成本阈值：

```bash
# 根据任务预估 Token 消耗决定 N 值
estimate_tokens() {
    # 粗略估算：文件行数 x 3（输入） + 预期输出
    local file_lines=$(wc -l < "$1")
    echo $((file_lines * 3 + 2000))
}

TASK_TOKENS=$(estimate_tokens "src/auth/login.ts")
BUDGET=50000  # 本次任务的 Token 预算

N=$((BUDGET / TASK_TOKENS))
N=$((N > 5 ? 5 : N))  # 上限为 5
N=$((N < 1 ? 1 : N))  # 下限为 1

echo "任务预估 Token: $TASK_TOKENS"
echo "Best-of-N: $N"
```

## 任务队列：从一次性到批量工作流

### 什么是任务队列

任务队列的核心思想：把待办事项结构化为 Codex 可以逐个消费的工作项列表。不再是"想到一个任务就跑一次 Codex"，而是"整理一批任务，让 Codex 按顺序处理"。

这把 Codex 从"按需工具"升级为"流水线工人"。

### 任务队列的实践方法

#### 方法一：GitHub Issue 作为任务队列

GitHub Issue 天然具备任务队列所需的全部要素：标题、描述、标签、状态、指派。用 Issue 作为任务源，Codex 从中读取并逐个处理。

工作流：

```
1. 团队创建一批 Issue，打上 "codex-task" 标签
2. 脚本遍历所有带标签的 open Issue
3. 对每个 Issue，用 codex exec 执行
4. 完成后自动关闭 Issue 并提交 PR
```

实现脚本：

```bash
#!/bin/bash
# codex_issue_queue.sh - 从 GitHub Issue 消费任务

REPO="${1:-$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')}"
LABEL="codex-task"
BRANCH_PREFIX="codex-task"

echo "从 GitHub Issue 消费 Codex 任务"
echo "仓库: $REPO"
echo ""

# 获取所有带标签的 open Issue
ISSUES=$(gh issue list \
    --repo "$REPO" \
    --label "$LABEL" \
    --state open \
    --json number,title,body \
    --limit 50)

# 逐个处理
echo "$ISSUES" | jq -c '.[]' | while read -r issue; do
    NUMBER=$(echo "$issue" | jq -r '.number')
    TITLE=$(echo "$issue" | jq -r '.title')
    BODY=$(echo "$issue" | jq -r '.body')

    echo "=== 处理 Issue #${NUMBER}: ${TITLE} ==="

    # 构造 Codex 指令
    PROMPT="完成以下任务：

## 任务标题
${TITLE}

## 任务描述
${BODY}

## 完成要求
- 确保所有现有测试通过
- 遵循项目代码风格
- 如有新功能，补充相应测试
- 完成后输出修改摘要"

    # 创建分支
    BRANCH="${BRANCH_PREFIX}-${NUMBER}"
    git checkout -b "$BRANCH" main

    # 执行 Codex
    codex exec --ask-for-approval never "$PROMPT"

    # 检查是否有修改
    if git diff --quiet; then
        echo "Issue #${NUMBER}: 无修改，跳过"
        git checkout main
        git branch -D "$BRANCH"
        continue
    fi

    # 提交
    git add -A
    git commit -m "fix(codex): resolve #${NUMBER} - ${TITLE}"

    # 推送并创建 PR
    git push origin "$BRANCH"
    gh pr create \
        --repo "$REPO" \
        --title "Resolve #${NUMBER}: ${TITLE}" \
        --body "自动生成 by Codex CLI。

Closes #${NUMBER}"

    # 回到 main 分支
    git checkout main

    echo "Issue #${NUMBER} 处理完成"
    echo ""
done

echo "=== 所有任务处理完毕 ==="
```

这个脚本的局限在于它是串行处理。对于需要并行处理的场景，需要结合后面介绍的 worktree 策略。

#### 方法二：TODO 列表作为任务队列

不需要 GitHub 的轻量级方案。用 Markdown 文件维护一个任务列表，脚本逐行消费。

```markdown
<!-- codex-tasks.md -->
# Codex 任务队列

## 待处理

- [ ] 修复 src/api/handler.ts 中的 CORS 配置错误
- [ ] 给 src/utils/validator.ts 补充边界值测试
- [ ] 重构 src/db/connection.ts 的错误处理逻辑
- [ ] 更新 README.md 中的安装步骤（需要 Node.js 20+）
- [ ] 将 src/legacy/ 目录下的 CommonJS 模块转为 ESM

## 处理中

（无）

## 已完成

（无）
```

消费脚本：

```bash
#!/bin/bash
# codex_todo_queue.sh - 从 TODO 列表消费任务

TASKS_FILE="codex-tasks.md"

# 提取第一个未完成任务
FIRST_TASK=$(grep -m1 '^\- \[ \]' "$TASKS_FILE")

if [ -z "$FIRST_TASK" ]; then
    echo "任务队列为空"
    exit 0
fi

# 提取任务描述（去掉 "- [ ] " 前缀）
TASK_DESC=$(echo "$FIRST_TASK" | sed 's/^- \[ \] //')

echo "处理任务: $TASK_DESC"

# 执行 Codex
codex exec --ask-for-approval never "$TASK_DESC"

# 更新任务状态
sed -i.bak "0,/^\- \[ \]/s/^\- \[ \]/\- [x] $(date +%Y-%m-%d)/" "$TASKS_FILE"
rm -f "${TASKS_FILE}.bak"

echo "任务完成"
```

这种方式的优点是极简、透明、无需外部依赖。缺点是缺乏状态管理的精细度（没有"处理中"状态的原子更新），不适合多人协作。

#### 方法三：结构化任务文件

介于 Issue 和 TODO 之间。每个任务一个文件，包含完整的四要素描述。

```
tasks/
  001-fix-cors.yaml
  002-validator-tests.yaml
  003-db-error-handling.yaml
```

单个任务文件的结构：

```yaml
# tasks/001-fix-cors.yaml
id: 001
title: 修复 CORS 配置错误
status: pending
priority: P1

objective: >
  修复 src/api/handler.ts 中的 CORS 配置，使前端应用能正确
  跨域访问 API 端点

context: >
  当前 CORS 配置缺少 credentials 支持，导致带 Cookie 的请求
  被浏览器拦截。相关文件：src/api/handler.ts:45-52

constraints:
  - 不要修改 CORS 中间件的加载顺序
  - 保持对 localhost:3000 的支持
  - 不要引入新的依赖

done_when:
  - curl 测试跨域请求返回正确的 Access-Control-Allow-Origin
  - 现有测试全部通过
  - pnpm lint 无新增警告

assigned: codex
```

消费脚本：

```bash
#!/bin/bash
# codex_yaml_queue.sh - 从结构化任务文件消费

TASKS_DIR="tasks"

for task_file in "$TASKS_DIR"/*.yaml; do
    STATUS=$(yq '.status' "$task_file")

    if [ "$STATUS" != "pending" ]; then
        continue
    fi

    TASK_ID=$(yq '.id' "$task_file")
    TITLE=$(yq '.title' "$task_file")
    OBJECTIVE=$(yq '.objective' "$task_file")
    CONTEXT=$(yq '.context' "$task_file")
    CONSTRAINTS=$(yq '.constraints | join("\n- ")' "$task_file")
    DONE_WHEN=$(yq '.done_when | join("\n- ")' "$task_file")

    echo "=== 任务 ${TASK_ID}: ${TITLE} ==="

    # 更新状态为处理中
    yq -i '.status = "in_progress"' "$task_file"

    # 构造完整指令
    PROMPT="## 任务：${TITLE}

### 目标
${OBJECTIVE}

### 上下文
${CONTEXT}

### 约束
- ${CONSTRAINTS}

### 完成条件
- ${DONE_WHEN}"

    # 创建任务分支
    BRANCH="task-${TASK_ID}"
    git checkout -b "$BRANCH" main

    # 执行 Codex
    if codex exec --ask-for-approval never "$PROMPT"; then
        # 验证完成条件
        ALL_PASS=true

        # 检查测试
        if ! pnpm test > /dev/null 2>&1; then
            echo "测试未通过"
            ALL_PASS=false
        fi

        # 检查 lint
        if ! pnpm lint > /dev/null 2>&1; then
            echo "Lint 未通过"
            ALL_PASS=false
        fi

        if [ "$ALL_PASS" = true ]; then
            # 提交并更新状态
            git add -A
            git commit -m "fix(task-${TASK_ID}): ${TITLE}"
            yq -i '.status = "completed"' "$task_file"
            echo "任务 ${TASK_ID} 完成"
        else
            echo "任务 ${TASK_ID} 验证失败，保留分支供人工检查"
            yq -i '.status = "needs_review"' "$task_file"
        fi
    else
        echo "任务 ${TASK_ID} 执行失败"
        yq -i '.status = "failed"' "$task_file"
    fi

    git checkout main
    echo ""
done
```

## worktree 并行策略

串行处理任务队列效率太低。git worktree 提供了在同一个仓库中并行执行多个 Codex 实例的隔离机制。

### 基本原理

git worktree 允许从同一个仓库检出多个工作目录，每个工作目录对应不同的分支。这样就可以在同一台机器上并行运行多个 Codex 实例，而不会出现文件锁冲突或状态污染。

```
repo/
  .git/
  src/              # 主工作目录（main 分支）
  .worktrees/
    task-001/       # worktree，分支 task-001
      src/
    task-002/       # worktree，分支 task-002
      src/
    task-003/       # worktree，分支 task-003
      src/
```

### 并行执行脚本

```bash
#!/bin/bash
# parallel_codex.sh - worktree 并行执行多个任务

MAX_PARALLEL="${1:-3}"  # 默认并行数
TASKS_FILE="codex-tasks.md"

# 提取所有待处理任务
TASKS=()
while IFS= read -r line; do
    TASKS+=("$line")
done < <(grep '^\- \[ \]' "$TASKS_FILE" | sed 's/^- \[ \] //')

TOTAL=${#TASKS[@]}

if [ "$TOTAL" -eq 0 ]; then
    echo "任务队列为空"
    exit 0
fi

echo "=== 并行 Codex 执行 ==="
echo "总任务数: $TOTAL"
echo "并行度: $MAX_PARALLEL"
echo ""

# 创建 worktree 目录
mkdir -p .worktrees

# 并行执行函数
run_in_worktree() {
    local INDEX=$1
    local TASK=$2
    local BRANCH="task-$(printf '%03d' "$INDEX")"
    local WORKTREE=".worktrees/${BRANCH}"

    echo "[任务 ${INDEX}] 启动: ${TASK}"

    # 创建 worktree
    git worktree add "$WORKTREE" -b "$BRANCH" 2>/dev/null || return 1

    # 在 worktree 中执行 Codex
    (
        cd "$WORKTREE" || exit 1
        codex exec --ask-for-approval never "$TASK"

        # 自动提交
        if ! git diff --quiet; then
            git add -A
            git commit -m "fix(task-${INDEX}): ${TASK}"
        fi
    )

    local EXIT_CODE=$?

    if [ $EXIT_CODE -eq 0 ]; then
        echo "[任务 ${INDEX}] 完成"
    else
        echo "[任务 ${INDEX}] 失败"
    fi

    return $EXIT_CODE
}

# 使用 GNU parallel 或 xargs 控制并行度
for i in "${!TASKS[@]}"; do
    run_in_worktree $((i + 1)) "${TASKS[$i]}" &
done

# 等待所有后台任务完成
wait

echo ""
echo "=== 所有任务执行完毕 ==="
echo ""
echo "各 worktree 修改概要："
for wt in .worktrees/task-*; do
    echo ""
    echo "--- $(basename $wt) ---"
    (cd "$wt" && git diff --stat main 2>/dev/null)
done

echo ""
echo "下一步："
echo "  1. 审查各 worktree 的修改"
echo "  2. git merge <分支名> 合并选中的任务"
echo "  3. git worktree remove .worktrees/<分支名> 清理"
```

### 并行度的选择

并行数不是越多越好。需要考虑三个瓶颈：

| 瓶颈 | 限制因素 | 建议 |
|------|---------|------|
| API 速率限制 | OpenAI API 的 RPM/TPM 限制 | 根据 API tier 设置并行数 |
| 本地资源 | CPU、内存、磁盘 IO | 不超过 CPU 核心数 |
| 上下文隔离 | 每个 Codex 实例独立加载项目 | 任务间无依赖时才并行 |

实际建议：

- API tier 1（免费/低级别）：并行 2 个
- API tier 2-3：并行 3-5 个
- API tier 4+：并行 5-10 个
- 本地开发机：通常 3-4 个

### 反模式：同一目录并行

绝不能在同一个工作目录中并行运行多个 Codex 实例。原因：

1. **文件锁冲突**：多个实例同时读写同一个文件会导致数据损坏
2. **状态污染**：实例 A 的修改会影响实例 B 的上下文
3. **git 状态混乱**：多个实例同时操作 git index 会产生不可预期的结果

```bash
# 错误做法：同一目录并行
codex exec "任务A" &
codex exec "任务B" &
codex exec "任务C" &
wait  # 三个实例互相干扰，结果不可预测

# 正确做法：每个任务一个 worktree
git worktree add .worktrees/task-a -b task-a
git worktree add .worktrees/task-b -b task-b
git worktree add .worktrees/task-c -b task-c

(cd .worktrees/task-a && codex exec "任务A") &
(cd .worktrees/task-b && codex exec "任务B") &
(cd .worktrees/task-c && codex exec "任务C") &
wait  # 每个实例在独立目录中运行
```

### 合并策略与冲突处理

并行任务完成后，需要逐个合并到主分支。合并顺序应遵循：

1. 低风险任务优先（文档、测试、格式化）
2. 高风险任务在后（核心逻辑修改、重构）
3. 有依赖关系的任务按依赖顺序合并

```bash
#!/bin/bash
# merge_tasks.sh - 按顺序合并 worktree 分支

BRANCHES=("task-001" "task-002" "task-003")
MAIN="main"

git checkout "$MAIN"

for branch in "${BRANCHES[@]}"; do
    echo "=== 合并 $branch ==="

    if git merge "$branch" --no-edit; then
        echo "$branch 合并成功"

        # 合并后运行验证
        if pnpm test && pnpm lint; then
            echo "验证通过"
        else
            echo "验证失败，回滚此合并"
            git merge --abort
            echo "$branch 保留供人工处理"
        fi
    else
        echo "合并冲突，需要人工解决"
        echo "冲突文件："
        git diff --name-only --diff-filter=U
        echo ""
        echo "手动解决步骤："
        echo "  1. 编辑冲突文件"
        echo "  2. git add <解决后的文件>"
        echo "  3. git merge --continue"
        echo "  4. 重新运行此脚本合并后续分支"
        exit 1
    fi

    echo ""
done

# 清理已合并的 worktree
for branch in "${BRANCHES[@]}"; do
    git worktree remove ".worktrees/${branch}" 2>/dev/null
    git branch -d "$branch" 2>/dev/null
done

echo "=== 所有任务合并完毕 ==="
```

冲突处理的实用建议：

- 冲突发生时不要强制合并，让脚本停止并等待人工介入
- 高频冲突说明任务划分有问题，需要重新设计任务边界
- 在任务描述中明确文件归属可以减少冲突概率

## codex exec 批量执行详解

codex exec 是实现批量工作流的核心命令。它以非交互模式运行 Codex，适合脚本化和 CI/CD 集成。

### 基本用法

```bash
# 非交互式执行单个任务
codex exec 'Review code and output report'

# 输出到文件
codex exec -o review.md 'Analyze codebase quality'

# CI/CD 中全自动执行（不需要任何人工审批）
codex exec --ask-for-approval never 'Fix lint issues'

# 指定模型
codex exec --model o4-mini 'Quick code review'

# 指定沙箱模式
codex exec --sandbox workspace-write 'Add missing type annotations'
```

### 输出格式控制

```bash
# Markdown 输出到 stdout
codex exec 'Summarize the architecture' > architecture_summary.md

# 输出到指定文件
codex exec -o report.md 'Generate security audit report'

# JSON 格式输出（用于程序消费）
codex exec --format json 'List all TODO comments in the codebase'
```

### 与管道的组合

codex exec 的输出可以与其他命令行工具组合：

```bash
# 将 Codex 输出通过邮件发送
codex exec -o daily_report.md 'Summarize all changes from the last 24 hours'
mail -s "Daily Code Report" team@example.com < daily_report.md

# 批量文件处理
for file in src/**/*.ts; do
    echo "Processing $file"
    codex exec "Review $file for potential bugs and output findings" >> review_results.md
    echo "---" >> review_results.md
done

# 与 git log 组合分析提交历史
RECENT_CHANGES=$(git log --oneline -20)
codex exec "分析以下最近的提交，识别潜在问题：${RECENT_CHANGES}"
```

### CI/CD 集成模式

```bash
# GitHub Actions 中的自动修复示例
# 在 workflow 中使用
codex exec \
    --ask-for-approval never \
    --model o4-mini \
    "检查并修复所有 lint 警告，不要改变功能逻辑"

# PR Review 自动化
DIFF=$(git diff origin/main...HEAD)
codex exec \
    --ask-for-approval never \
    "审查以下代码变更，输出结构化的 review 意见：
    ${DIFF}"
```

### exec 模式的限制

codex exec 有几个值得注意的限制：

1. **无法交互**：如果模型需要用户输入（如"是否继续？"），exec 模式会使用默认行为或直接失败
2. **无会话记忆**：每次 exec 是独立会话，不保留之前的状态
3. **超时风险**：长时间运行的任务可能因 API 超时而中断，需要合理拆分
4. **错误处理**：exec 的退出码表示执行状态，脚本中应检查退出码

```bash
# 正确的错误处理
if codex exec --ask-for-approval never "$TASK"; then
    echo "任务成功"
    git add -A && git commit -m "task completed"
else
    EXIT_CODE=$?
    echo "任务失败，退出码: $EXIT_CODE"
    echo "保留当前状态供人工检查"
    exit 1
fi
```

## AGENTS.md 对批量工作流的支持

AGENTS.md 中的规则在每次 codex exec 执行时都会被加载。合理配置 AGENTS.md 可以显著提升批量工作流的稳定性和一致性。

### 面向批量执行的 AGENTS.md 配置

```markdown
# AGENTS.md

## Project Context
- Language: TypeScript / Node.js
- Test framework: Vitest
- Package manager: pnpm

## Commands
- Install: pnpm install
- Lint: pnpm lint
- Type check: pnpm typecheck
- Test: pnpm test
- Test single file: pnpm test -- <file>
- Build: pnpm build

## Batch Execution Rules
- 每次只修改与任务直接相关的文件
- 修改代码后立即运行 pnpm test 验证
- 如果测试失败，先尝试自行修复，不要跳过
- 保持修改范围最小化，不做额外的"顺便"修改
- 如果任务描述不够明确，按最保守的方式处理
- 输出修改摘要，列出所有变更的文件和原因

## Safety Boundaries
- 不要修改 .env* 文件
- 不要修改 ci/ 目录下的配置（除非任务明确要求）
- 不要删除现有的测试用例
- 不要引入新的生产依赖（devDependencies 可以）
- 不要修改 package.json 的 version 字段
```

关键设计点：

- **Batch Execution Rules** 部分专门为非交互执行设计，覆盖了自动修复、范围控制和错误处理策略
- **Safety Boundaries** 部分防止批量执行中的越权操作
- **Commands** 部分确保 Codex 知道正确的验证命令

### 分环境的 AGENTS.md 策略

不同执行环境需要不同的规则。利用 AGENTS.md 的分层机制：

```markdown
# .codex/AGENTS.md（全局配置，所有环境共享）
## Global Rules
- Always run tests after code changes
- Follow existing code patterns
- Output a summary of all changes

---

# AGENTS.md（项目根目录，交互模式使用）
## Interactive Mode
- 如果不确定，先提问再动手
- 大范围修改前先展示计划

---

# scripts/.codex/AGENTS.md（批量脚本专用）
## Batch Mode Rules
- 不要提问，按最合理的方式处理
- 遇到无法判断的情况，跳过该任务并记录原因
- 每个任务完成后立即提交
```

## 成本预估与预算控制

批量工作流的成本需要精确预估和控制，否则可能在不知不觉中消耗大量 API 额度。

### 成本预估模型

```bash
#!/bin/bash
# estimate_cost.sh - 估算批量工作流的成本

# 假设参数
AVG_TOKENS_PER_TASK=15000   # 每个任务平均消耗的 Token 数
INPUT_PRICE_PER_M=2.50      # 输入 Token 价格（每百万 Token，USD）
OUTPUT_PRICE_PER_M=10.00    # 输出 Token 价格（每百万 Token，USD）
INPUT_RATIO=0.6             # 输入 Token 占比
OUTPUT_RATIO=0.4            # 输出 Token 占比

TASK_COUNT="$1"
N="${2:-1}"                  # Best-of-N 的 N 值

if [ -z "$TASK_COUNT" ]; then
    echo "用法: $0 <任务数> [N值]"
    exit 1
fi

TOTAL_TOKENS=$((TASK_COUNT * N * AVG_TOKENS_PER_TASK))
INPUT_TOKENS=$(echo "$TOTAL_TOKENS * $INPUT_RATIO" | bc | cut -d. -f1)
OUTPUT_TOKENS=$(echo "$TOTAL_TOKENS * $OUTPUT_RATIO" | bc | cut -d. -f1)

INPUT_COST=$(echo "scale=2; $INPUT_TOKENS * $INPUT_PRICE_PER_M / 1000000" | bc)
OUTPUT_COST=$(echo "scale=2; $OUTPUT_TOKENS * $OUTPUT_PRICE_PER_M / 1000000" | bc)
TOTAL_COST=$(echo "scale=2; $INPUT_COST + $OUTPUT_COST" | bc)

echo "=== 成本预估 ==="
echo "任务数: $TASK_COUNT"
echo "Best-of-N: $N"
echo "总 Token: $(echo "scale=0; $TOTAL_TOKENS / 1" | bc)"
echo "输入成本: \$$INPUT_COST"
echo "输出成本: \$$OUTPUT_COST"
echo "总成本: \$$TOTAL_COST"
echo ""
echo "注意: 实际成本取决于模型、prompt 长度和任务复杂度"
```

### 预算控制机制

在批量执行中实施预算上限：

```bash
#!/bin/bash
# budget_control.sh - 带预算控制的批量执行

BUDGET_LIMIT=10.00  # 美元
TASKS_FILE="codex-tasks.md"
COST_PER_TASK=0.50   # 单任务预估成本

TOTAL_TASKS=$(grep -c '^\- \[ \]' "$TASKS_FILE")
SPENT=0.00
PROCESSED=0

echo "=== 带预算控制的批量执行 ==="
echo "预算上限: \$${BUDGET_LIMIT}"
echo "待处理任务: $TOTAL_TASKS"
echo ""

while IFS= read -r task; do
    # 检查预算
    REMAINING=$(echo "$BUDGET_LIMIT - $SPENT" | bc)
    if (( $(echo "$REMAINING < $COST_PER_TASK" | bc -l) )); then
        echo "预算不足（剩余 \$$REMAINING），停止执行"
        break
    fi

    TASK_DESC=$(echo "$task" | sed 's/^- \[ \] //')
    echo "处理: $TASK_DESC"

    codex exec --ask-for-approval never "$TASK_DESC"

    SPENT=$(echo "$SPENT + $COST_PER_TASK" | bc)
    PROCESSED=$((PROCESSED + 1))

    echo "已完成: $PROCESSED / $TOTAL_TASKS，已花费: \$$SPENT"
    echo ""
done < <(grep '^\- \[ \]' "$TASKS_FILE")

echo "=== 执行完毕 ==="
echo "处理了 $PROCESSED / $TOTAL_TASKS 个任务"
echo "总花费: \$$SPENT / \$${BUDGET_LIMIT}"
```

## 完整工作流示例：Best-of-N + 任务队列 + 并行执行

把前面介绍的所有机制组合成一个完整的工程工作流。

### 场景描述

团队有一批 15 个 bug 修复任务，需要在一周内完成。要求：

- 每个任务用 Best-of-2 提高成功率
- 最多 3 个任务并行执行
- 每个任务完成后自动验证
- 总预算不超过 $30

### 工作流设计

```
┌─────────────────┐
│  GitHub Issues   │  15 个 bug 修复任务
│  (codex-task)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  任务分发器       │  每次取 3 个任务
│  (分发脚本)       │
└────────┬────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
┌──────┐┌──────┐┌──────┐
│ WT-1 ││ WT-2 ││ WT-3 │  3 个 worktree 并行
├──────┤├──────┤├──────┤
│ B-1a ││ B-2a ││ B-3a │  每个任务 Best-of-2
│ B-1b ││ B-2b ││ B-3b │
└──┬───┘└──┬───┘└──┬───┘
   │       │       │
   ▼       ▼       ▼
┌─────────────────┐
│  自动化验证       │  test + lint + typecheck
│  + 评分排序       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  逐个合并         │  低风险 → 高风险
│  + 冲突处理       │
└─────────────────┘
```

### 完整脚本

```bash
#!/bin/bash
# full_pipeline.sh - Best-of-N + 任务队列 + 并行执行的完整流水线

set -euo pipefail

# 配置
PARALLEL_JOBS=3
BEST_OF_N=2
BUDGET_LIMIT=30.00
COST_PER_EXECUTION=0.50  # 单次 codex exec 的预估成本
LABEL="codex-task"
REPO=$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')

# 状态变量
TOTAL_SPENT=0.00
TASKS_PROCESSED=0

echo "=========================================="
echo " Codex 批量工作流"
echo " 并行度: $PARALLEL_JOBS"
echo " Best-of-N: $BEST_OF_N"
echo " 预算: \$${BUDGET_LIMIT}"
echo "=========================================="
echo ""

# 获取任务列表
TASKS=$(gh issue list \
    --repo "$REPO" \
    --label "$LABEL" \
    --state open \
    --json number,title,body \
    --limit 50)

TASK_COUNT=$(echo "$TASKS" | jq 'length')
echo "发现 $TASK_COUNT 个待处理任务"
echo ""

# 处理函数
process_task() {
    local ISSUE_NUM=$1
    local TITLE=$2
    local BODY=$3
    local BRANCH_BASE="issue-${ISSUE_NUM}"

    echo "[Issue #${ISSUE_NUM}] 开始处理: ${TITLE}"

    # 检查预算
    local REMAINING=$(echo "$BUDGET_LIMIT - $TOTAL_SPENT" | bc)
    local TASK_COST=$(echo "$COST_PER_EXECUTION * $BEST_OF_N" | bc)
    if (( $(echo "$REMAINING < $TASK_COST" | bc -l) )); then
        echo "[Issue #${ISSUE_NUM}] 预算不足，跳过"
        return 1
    fi

    local BEST_SCORE=-1
    local BEST_BRANCH=""

    # Best-of-N 尝试
    for n in $(seq 1 "$BEST_OF_N"); do
        local BRANCH="${BRANCH_BASE}-run-${n}"
        local WT_PATH=".worktrees/${BRANCH}"

        echo "[Issue #${ISSUE_NUM}] 第 ${n}/${BEST_OF_N} 次尝试"

        # 创建 worktree
        git worktree add "$WT_PATH" -b "$BRANCH" 2>/dev/null || continue

        # 执行 Codex
        local PROMPT="完成以下任务：

## 任务: ${TITLE}
${BODY}

## 要求
- 确保所有测试通过（pnpm test）
- 确保 lint 通过（pnpm lint）
- 保持最小修改范围
- 输出修改摘要"

        (
            cd "$WT_PATH"
            codex exec --ask-for-approval never "$PROMPT"
        ) || true

        # 评分
        local SCORE=0
        (
            cd "$WT_PATH"

            # 测试通过 (+40)
            pnpm test > /dev/null 2>&1 && exit 40
            exit 0
        )
        SCORE=$((SCORE + $?))

        (
            cd "$WT_PATH"
            pnpm lint > /dev/null 2>&1 && exit 20
            exit 0
        )
        SCORE=$((SCORE + $?))

        (
            cd "$WT_PATH"
            pnpm typecheck > /dev/null 2>&1 && exit 20
            exit 0
        )
        SCORE=$((SCORE + $?))

        # 改动量评分
        CHANGED=$(cd "$WT_PATH" && git diff --shortstat 2>/dev/null | grep -oP '\d+(?= file)' || echo "99")
        if [ "$CHANGED" -le 3 ]; then
            SCORE=$((SCORE + 20))
        elif [ "$CHANGED" -le 10 ]; then
            SCORE=$((SCORE + 10))
        fi

        echo "[Issue #${ISSUE_NUM}] 第 ${n} 次得分: ${SCORE}/100"

        # 更新最优
        if [ "$SCORE" -gt "$BEST_SCORE" ]; then
            BEST_SCORE=$SCORE
            BEST_BRANCH="$BRANCH"
        fi
    done

    echo "[Issue #${ISSUE_NUM}] 最优分支: ${BEST_BRANCH} (得分: ${BEST_SCORE})"

    # 提交最优结果
    if [ -n "$BEST_BRANCH" ]; then
        local WT_PATH=".worktrees/${BEST_BRANCH}"
        (
            cd "$WT_PATH"
            if ! git diff --quiet; then
                git add -A
                git commit -m "fix: resolve #${ISSUE_NUM} - ${TITLE}"
                git push origin "$BEST_BRANCH" 2>/dev/null || true
            fi
        )
    fi

    # 清理非最优的 worktree
    for n in $(seq 1 "$BEST_OF_N"); do
        local BRANCH="${BRANCH_BASE}-run-${n}"
        if [ "$BRANCH" != "$BEST_BRANCH" ]; then
            git worktree remove ".worktrees/${BRANCH}" --force 2>/dev/null || true
            git branch -D "$BRANCH" 2>/dev/null || true
        fi
    done

    # 更新预算
    TOTAL_SPENT=$(echo "$TOTAL_SPENT + $COST_PER_EXECUTION * $BEST_OF_N" | bc)
    TASKS_PROCESSED=$((TASKS_PROCESSED + 1))

    echo "[Issue #${ISSUE_NUM}] 完成（已处理 ${TASKS_PROCESSED}，花费 \$${TOTAL_SPENT}）"
    echo ""

    return 0
}

# 主执行循环：每次处理 PARALLEL_JOBS 个任务
echo "$TASKS" | jq -c '.[]' | jq -s -c --argjson jobs "$PARALLEL_JOBS" '_nwise($jobs)' | while read -r batch; do
    echo "=== 新批次 ==="

    PIDS=()
    BATCH_ITEMS=()

    INDEX=0
    echo "$batch" | jq -c '.[]' | while read -r issue; do
        NUMBER=$(echo "$issue" | jq -r '.number')
        TITLE=$(echo "$issue" | jq -r '.title')
        BODY=$(echo "$issue" | jq -r '.body')

        process_task "$NUMBER" "$TITLE" "$BODY" &
        PIDS[$INDEX]=$!
        BATCH_ITEMS[$INDEX]="$NUMBER"
        INDEX=$((INDEX + 1))
    done

    # 等待当前批次完成
    for pid in "${PIDS[@]}"; do
        wait "$pid" 2>/dev/null || true
    done

    echo "批次完成"
    echo ""
done

echo "=========================================="
echo " 执行完毕"
echo " 处理任务: $TASKS_PROCESSED"
echo " 总花费: \$${TOTAL_SPENT} / \$${BUDGET_LIMIT}"
echo "=========================================="
echo ""
echo "后续步骤："
echo "  1. 审查各最优分支的修改"
echo "  2. 逐个合并到 main"
echo "  3. 清理残留的 worktree: git worktree prune"
```

## 常见问题与陷阱

### Best-of-N 的常见误区

**误区一：N 越大越好。** 实际上 N=3 之后的边际收益急剧下降。模型输出的质量分布不是均匀的，前 2-3 次采样通常已经覆盖了主要的质量区间。N>5 的场景仅限于成功率极低的复杂任务。

**误区二：Best-of-N 可以替代好的 prompt。** 错误。差的 prompt 会产生一致的差结果。N 次差结果的平均值仍然是差结果。Best-of-N 放大的不是运气，而是 prompt 的质量天花板。先优化 prompt，再用 Best-of-N 提高命中率。

**误区三：随机修改算 Best-of-N。** Best-of-N 要求每次运行面对相同的输入（相同的任务描述、相同的项目状态）。如果在两次运行之间修改了 prompt 或代码，结果不具有可比性。

### 任务队列的常见陷阱

**陷阱一：任务之间有隐式依赖。** 任务 A 修改了某个接口，任务 B 依赖该接口。并行执行时 B 可能在 A 之前完成，导致编译失败。解决方案：在任务描述中声明依赖关系，有依赖的任务串行执行。

**陷阱二：任务粒度不均。** 一个"重构整个认证模块"的任务可能消耗和十个"修复某个 lint 警告"的任务一样多的 Token。不均匀的粒度导致预算预估失准。解决方案：大任务拆分为小任务，每个任务控制在 1-3 个文件范围内。

**陷阱三：忽略 AGENTS.md 的全局影响。** AGENTS.md 中的规则对每次执行都生效。如果规则写得过于严格（如"不要修改任何测试文件"），批量修复任务会大量失败。解决方案：区分全局规则和任务特定约束，批量执行时使用宽松的全局规则。

### worktree 的常见问题

**文件系统空间。** 每个 worktree 是一份完整的工作目录拷贝（通过 git 的文件链接机制，实际磁盘占用比完整拷贝小，但仍不可忽略）。15 个 worktree 可能占用数 GB 空间。养成用完即清理的习惯。

**分支命名冲突。** 重复运行脚本时，分支名可能冲突。用时间戳或 UUID 后缀避免。

**清理遗漏。** 脚本异常退出时可能残留 worktree。定期执行 `git worktree prune` 清理失效的 worktree 引用。

## 总结

Best-of-N 和任务队列是 Codex 从"交互工具"升级为"工程系统"的两个关键机制：

- **Best-of-N** 解决"单次执行成功率不够高"的问题。核心投入是多倍的 Token 成本，核心回报是显著提升的成功率。N=2-3 是推荐的甜点。
- **任务队列** 解决"人工逐个启动太慢"的问题。核心投入是前期的任务结构化，核心回报是无人值守的批量处理能力。
- **worktree 并行** 解决"串行处理太慢"的问题。核心投入是额外的磁盘空间和合并成本，核心回报是并行度倍的吞吐提升。
- **codex exec** 是串联所有机制的执行引擎。非交互、可脚本化、可管道化。
- **AGENTS.md** 为批量执行提供一致性保障。面向批量模式的规则设计直接影响整体成功率。

这套机制组合的投入门槛不低（需要写脚本、管理 worktree、设计评分策略），但对于高频使用 Codex 的团队，长期收益显著。建议从最简单的 Best-of-2 手动执行开始，逐步升级到自动化脚本和并行流水线。

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
