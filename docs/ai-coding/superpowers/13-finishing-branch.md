# Superpowers 工作流 · finishing-a-development-branch：合并、PR、清理

> 更新日期：2025/06

**TL;DR：** Superpowers 把分支完成独立成一个技能，避免「写完代码就不知道下一步」的混乱。强制先验证测试再给选项，然后根据环境检测（普通仓库 vs worktree vs detached HEAD）呈现 3-4 个精确选项：合并本地、推 PR、保持分支、丢弃工作。选中后执行正确流程——合并前验证、只对某些选项清理 worktree、删除分支前先移 worktree。支持团队 Git 流程，不假设特定分支策略。

## 为什么要独立成技能

实现完成后，开发者经常卡住：「现在该干嘛？合并？推 PR？还是先放着？」Superpowers 的观察是：没有明确选项，人倾向于拖延或做出次优选择。

独立技能的价值是标准化完成流程。每次实现完成后，AI 都触发 `finishing-a-development-branch` skill，按固定流程走：验证 → 检测环境 → 呈现选项 → 执行选择 → 清理。这消除了「我忘了做什么」的摩擦，也减少了「错误合并导致 main 挂了」的灾难。

另一个价值是环境感知。Superpowers 知道你在普通仓库、git worktree、还是 detached HEAD 里工作。每种环境的清理流程不同。skill 自动检测并执行正确的清理——不会出现在 worktree 里跑 `git branch -d` 失败的情况。

## 完成流程四步

### 步骤 1：验证测试

**呈现选项前，验证测试通过：**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**如果测试失败：**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

停止。不要继续到步骤 2。

**如果测试通过：** 继续步骤 2。

这步不可跳过。Superpowers 不允许测试不通过就合并或创建 PR。你可能在实现阶段漏了测试、引入了回归、或者环境问题导致测试失败。不管什么原因，测试不通过 = 不完成。

### 步骤 2：检测环境

**呈现选项前确定工作区状态：**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
```

这决定显示哪个菜单和清理如何工作：

| 状态 | 菜单 | 清理 |
|------|------|------|
| `GIT_DIR == GIT_COMMON`（普通仓库） | 标准 4 选项 | 无 worktree 清理 |
| `GIT_DIR != GIT_COMMON`，命名分支 | 标准 4 选项 | 基于来源（见步骤 6） |
| `GIT_DIR != GIT_COMMON`，detached HEAD | 减少 3 选项（无合并） | 无清理（外部管理） |

为什么重要？git worktree 里的分支删除前要移除 worktree。detached HEAD（某些 harness 管理的工作区）不能合并本地。skill 自动检测这些状态并调整选项。

### 步骤 3：确定基分支

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

或者问：「This branch split from main - is that correct?」

Superpowers 不假设你用 main、master、还是 develop。它自动检测或询问。这是为了兼容不同的分支策略。

### 步骤 4：呈现选项

**普通仓库和命名分支 worktree——精确呈现这 4 个选项：**

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

**Detached HEAD——精确呈现这 3 个选项：**

```
Implementation complete. You're on a detached HEAD (externally managed workspace).

1. Push as new branch and create a Pull Request
2. Keep as-is (I'll handle it later)
3. Discard this work

Which option?
```

**别加解释**——保持选项简洁。

Superpowers 不问「你想怎么做？」这种开放式问题。开放式问题导致认知负担——你想 3 分钟，最后选了个后悔的。结构化选项让你快速决策。

## Merge/PR/Keep/Discard 决策树

### 选项 1：合并本地

```bash
# Get main repo root for CWD safety
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"

# Merge first — verify success before removing anything
git checkout <base-branch>
git pull
git merge <feature-branch>

# Verify tests on merged result
<test command>

# Only after merge succeeds: cleanup worktree (Step 6), then delete branch
```

然后：清理 worktree（步骤 6），然后删除分支：

```bash
git branch -d <feature-branch>
```

**什么时候选这个：**
- 小改动不需要 PR 流程
- 个人项目
- 你有 main 写权限
- 想立即合并继续工作

### 选项 2：推并创建 PR

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

**不要清理 worktree**——用户需要它活着处理 PR 反馈。

**什么时候选这个：**
- 团队项目需要代码审查
- 大改动需要讨论
- 无 main 写权限
- CI/CD 要求 PR

### 选项 3：保持原样

报告：「Keeping branch <name>. Worktree preserved at <path>.」

**不要清理 worktree。」

**什么时候选这个：**
- 还没想好怎么合并
- 等待其他分支完成
- 需要额外测试
- 团队流程要求推迟

### 选项 4：丢弃

**先确认：**
```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

等待精确确认。

如果确认：
```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
```

然后：清理 worktree（步骤 6），然后强制删除分支：
```bash
git branch -D <feature-branch>
```

**什么时候选这个：**
- 实验失败
- 走错方向
- 原型验证不通过
- 只是探索性代码

## Worktree 清理

**只对选项 1 和 4 运行。** 选项 2 和 3 总是保留 worktree。

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

**如果 `GIT_DIR == GIT_COMMON`：** 普通仓库，无 worktree 清理。完成。

**如果 worktree 路径在 `.worktrees/`、`worktrees/`、或 `~/.config/superpowers/worktrees/` 下：** Superpowers 创建了这个 worktree——我们拥有清理。

```bash
MAIN_ROOT=$(git -C "$(git rev-parse --git-common-dir)/.." rev-parse --show-toplevel)
cd "$MAIN_ROOT"
git worktree remove "$WORKTREE_PATH"
git worktree prune  # 自我修复：清理任何陈旧注册
```

**否则：** 主机环境（harness）拥有这个工作区。不要移除它。如果你的平台提供工作区退出工具，用它。否则，保留工作区在位。

**为什么这么复杂？**

git worktree 的管理归属权很重要。Superpowers 创建的 worktree（在特定目录下）由 Superpowers 清理。但 harness（比如 Cursor、Claude Code）创建的工作区由 harness 管理。AI 不应该删除它不拥有的东西。

`git worktree prune` 是自我修复——清理任何陈旧的 worktree 注册。这防止 `.git/worktrees` 里累积指向不存在目录的条目。

## 与团队 Git 流程衔接

Superpowers 不假设特定分支策略，但支持常见模式：

### GitHub Flow
```
main 永远是可部署的
feature 分支从 main 拉出
PR 到 main
审查后合并
```

Superpowers 的默认行为匹配这个：检测 main 为基分支，选项 2 创建 PR。

### GitLab Flow
```
main 是稳定
feature 分支从 main 拉出
MR 到 main
审查后合并
```

Superpowers 用 `gh pr create` 是 GitHub 特定，但流程结构兼容 GitLab MR。如果你用 GitLab，可以修改 skill 用 `glab mr create`。

### Git Flow
```
main 是生产
develop 是开发集成分支
feature 从 develop 拉出
合并回 develop
release 分支从 develop 拉出
合并回 main 和 develop
```

Superpowers 不原生支持 Git Flow（基分支检测会选错）。团队用 Git Flow 需要自定义 skill 基分支检测逻辑，或者在步骤 3 手动指定基分支。

### 分支保护规则

Superpowers 的合并前测试验证是分支保护的第一层。即使 GitHub 的保护规则允许任何人合并，Superpowers 也要求本地测试通过。这防止「本地测试挂了但我推上去看 CI 怎么说」的危险行为。

## 快速参考

| 选项 | 合并 | 推 | 保持 Worktree | 清理分支 |
|------|------|------|---------------|----------|
| 1. 合并本地 | yes | - | - | yes |
| 2. 创建 PR | - | yes | yes | - |
| 3. 保持原样 | - | - | yes | - |
| 4. 丢弃 | - | - | - | yes (强制) |

## 常见错误

**跳过测试验证**
- **问题：** 合并坏代码，创建失败 PR
- **修复：** 提供选项前总是验证测试

**开放式问题**
- **问题：** "What should I do next?" 模糊
- **修复：** 精确呈现 4 个结构化选项（或 detached HEAD 3 个）

**选项 2 清理 worktree**
- **问题：** 移除用户 PR 迭代需要的 worktree
- **修复：** 只对选项 1 和 4 清理

**删除分支前移 worktree**
- **问题：** `git branch -d` 失败因为 worktree 还引用分支
- **修复：** 先合并，移 worktree，然后删分支

**在 worktree 里跑 git worktree remove**
- **问题：** CWD 在被移除的 worktree 里时命令静默失败
- **修复：** `git worktree remove` 前总是 `cd` 到 main repo root

**清理 harness 拥有的 worktree**
- **问题：** 移除 harness 创建的 worktree 导致幻影状态
- **修复：** 只清理在 `.worktrees/`、`worktrees/`、或 `~/.config/superpowers/worktrees/` 下的 worktree

**丢弃无确认**
- **问题：** 意外删除工作
- **修复：** 要求输入 "discard" 确认

## 红旗标志

**永远不要：**
- 测试失败还继续
- 合并不验证结果测试
- 删除工作无确认
- 无明确请求就 force-push
- 移除 worktree 前不确认合并成功
- 清理你不创建的 worktree（来源检查）
- 从 worktree 里跑 `git worktree remove`

**总是：**
- 提供选项前验证测试
- 呈现菜单前检测环境
- 精确呈现 4 个选项（或 detached HEAD 3 个）
- 选项 4 要求输入确认
- 只对选项 1 和 4 清理 worktree
- worktree 移除前 `cd` 到 main repo root
- 移除后跑 `git worktree prune`

## 权衡与局限

Superpowers 的完成流程不是银弹。

**分支策略假设：** 默认假设 GitHub-style PR 流程。GitLab MR、Azure DevOps、Phabricatic 都有自己的命令行工具。团队需要自定义 skill 的 PR 创建命令。

**清理安全：** worktree 清理的来源检查（`.worktrees/`、`worktrees/`、`~/.config/superpowers/worktrees/`）是保守策略。如果你的 Superpowers 安装在不同路径，清理不会触发。需要手动清理。

**合并冲突：** 选项 1 的合并可能冲突。skill 不自动解决冲突——它要求合并成功后验证测试。如果冲突，AI 停在合并步骤，要求人工解决。

**测试验证范围：** skill 只验证测试命令的退出码，不测试覆盖率、lint、或其他质量门。团队应该扩展 skill 包含这些检查。

**detached HEAD 限制：** 在 detached HEAD（某些 harness 的临时工作区），不能合并本地。这是 Git 限制，不是 Superpowers 限制。你只能推新分支创建 PR 或丢弃。

## 延伸阅读

- [Superpowers GitHub 仓库](https://github.com/obra/superpowers) - 完整技能库和最新文档
- [finishing-a-development-branch SKILL.md](https://github.com/obra/superpowers/blob/master/skills/finishing-a-development-branch/SKILL.md) - 完成分支 skill 完整实现
- [using-git-worktrees SKILL.md](https://github.com/obra/superpowers/blob/master/skills/using-git-worktrees/SKILL.md) - Git worktree 使用和管理
- [requesting-code-review SKILL.md](https://github.com/obra/superpowers/blob/master/skills/requesting-code-review/SKILL.md) - PR 前代码审查
- [receiving-code-review SKILL.md](https://github.com/obra/superpowers/blob/master/skills/receiving-code-review/SKILL.md) - 处理 PR 反馈

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
