# Superpowers 原理 · git worktrees：隔离工作区

> 更新日期：2026/06

**TL;DR：** Superpowers 强制使用 git worktrees 创建隔离工作区。worktree 是 git 的原生功能，允许在同一个仓库的多个目录下同时工作。与分支不同，worktree 提供独立的文件系统，每个 worktree 有自己的工作目录和 staging area。这是多任务并行、安全实验、并发 CI 的基础。

## 为什么强制 worktree

Superpowers 在执行计划前，会问：

```
AI: Would you like me to set up an isolated worktree? It protects your current branch from changes.
```

这不是建议，是强制要求。为什么？

### 问题：直接在当前分支工作

假设你当前在 `main` 分支，有一个干净的工作区：

```bash
$ git status
On branch main
nothing to commit, working tree clean
```

这时你让 AI "加个用户登录功能"，AI 直接在 `main` 分支上工作：

1. 修改了 10 个文件
2. 写到一半，发现设计有问题
3. 想回滚，但已经修改了太多文件
4. 或者更糟：你 `git push` 到了远程 `main`

### 解决方案：worktree 隔离

如果 AI 先创建一个 worktree：

```bash
$ git worktree add .worktrees/feature-login -b feature-login
```

然后在 worktree 里工作：

1. 修改文件只在 worktree 里生效
2. `main` 分支不受影响
3. 如果写崩了，直接删除 worktree
4. 如果写好了，merge 回 `main`

## worktree vs branch

很多人会混淆 worktree 和 branch。它们完全不同。

### Branch：代码的历史轨迹

**Branch 只是一个指向 commit 的指针。**

```bash
$ git branch feature-login
```

这行命令做了什么？

1. 在 `.git/refs/heads/feature-login` 创建一个文件
2. 文件内容是当前 commit 的 SHA
3. **没有创建任何目录**

你仍然在原来的目录工作，只是 git 知道你在 `feature-login` 分支上。

### Worktree：代码的工作空间

**Worktree 是一个完整的工作目录。**

```bash
$ git worktree add .worktrees/feature-login -b feature-login
```

这行命令做了什么？

1. 在 `.worktrees/feature-login` 创建一个新目录
2. 复制 `.git` 仓库的所有对象到这个目录
3. 创建 `.git` 文件，指向主仓库
4. 检出 `feature-login` 分支的代码到这个目录

现在你有两个目录：

```text
project/              # 主目录，在 main 分支
  .git/
  src/
  tests/

.worktrees/feature-login/  # worktree，在 feature-login 分支
  .git                    # 指向主仓库的 .git
  src/
  tests/
```

**关键区别：**

- **Branch**：同一目录，切换历史指针
- **Worktree**：不同目录，各自独立工作空间

### 类比

**Branch** 就像书签：
- 标记你读到哪里了
- 可以随时跳到另一个书签
- 但书还是那本书

**Worktree** 就像复印书：
- 原书保持不变
- 每本复印书可以独立标记
- 修改复印书不影响原书

## worktree 的核心优势

### 1. 并行工作

假设你在开发 feature A，写到一半，产品经理说 feature B 更紧急。

**不用 worktree：**

```bash
# 当前在 feature-a 分支，有一堆未提交的改动
$ git status
modified:   src/feature_a.py
modified:   tests/test_feature_a.py

# 产品经理要求做 feature-b
$ git stash           # 暂存改动
$ git checkout -b feature-b
# ... 做 feature-b ...
$ git checkout feature-a
$ git stash pop      # 恢复改动
```

**用 worktree：**

```bash
# feature-a 在 .worktrees/feature-a/
cd .worktrees/feature-a
# ... 正常工作 ...

# 产品经理要求做 feature-b
$ git worktree add .worktrees/feature-b -b feature-b
cd .worktrees/feature-b
# ... 做 feature-b ...

# feature-a 不受影响
cd .worktrees/feature-a
# 继续工作 ...
```

### 2. 安全实验

你想试一个大胆的改动，不确定会不会成功。

**不用 worktree：**

```bash
# 在当前分支直接改
$ git checkout -b experiment
# ... 改动 ...
# 如果失败，手工回滚或删除分支
```

**用 worktree：**

```bash
# 创建 worktree 实验
$ git worktree add .worktrees/experiment -b experiment
cd .worktrees/experiment
# ... 大胆改动 ...

# 如果失败
$ cd ..
$ rm -rf .worktrees/experiment
$ git worktree prune
# 主目录不受影响
```

### 3. 并发 CI

CI 系统需要同时测试多个分支。

**不用 worktree：**

- 需要 3 个独立的仓库 clone
- 磁盘空间 3 倍
- 设置复杂

**用 worktree：**

```bash
# 主仓库
git clone repo.git
cd repo

# 创建 3 个 worktree
git worktree add .worktrees/test-branch-1 -b test-branch-1
git worktree add .worktrees/test-branch-2 -b test-branch-2
git worktree add .worktrees/test-branch-3 -b test-branch-3

# CI 系统可以同时测试 3 个分支
# 共享 .git 对象，节省磁盘空间
```

## Superpowers 中的 worktree 流程

### Step 0: 检测现有隔离

在创建 worktree 前，Superpowers 先检查是否已经在 worktree 中：

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)

if [ "$GIT_DIR" != "$GIT_COMMON" ]; then
  echo "Already in a worktree"
  # 跳过创建
fi
```

**为什么重要：** 防止嵌套 worktree（worktree 里再创建 worktree）。

### Step 1: 创建 worktree

```bash
$ git worktree add .worktrees/feature-login -b feature-login
```

**目录选择优先级：**

1. 用户在 CLAUDE.md 中的偏好
2. 现有项目本地目录（`.worktrees/` 或 `worktrees/`）
3. 全局目录（`~/.config/superpowers/worktrees/$project/`）
4. 默认（`.worktrees/`）

### Step 2: 项目设置

自动检测并运行项目设置：

```bash
# Node.js
if [ -f package.json ]; then
  npm install
fi

# Rust
if [ -f Cargo.toml ]; then
  cargo build
fi

# Python
if [ -f requirements.txt ]; then
  pip install -r requirements.txt
fi
```

### Step 3: 验证基线

运行测试确保环境干净：

```bash
$ npm test
# 或
$ pytest
# 或
$ cargo test
```

**如果测试失败：** 报告失败，问你是否继续。

**为什么重要：** 如果基线就有问题，后续工作无法判断是新 bug 还是原有问题。

### 完成报告

```
Worktree ready at /path/to/.worktrees/feature-login
Tests passing (45 tests, 0 failures)
Ready to implement user login
```

## 与其他系统的关系

### 与分支的关系

worktree 和 branch 是正交的：

- **Branch**：版本历史的一个轨迹
- **Worktree**：文件系统的一个工作空间

**组合：**

```bash
# 创建 branch
git branch feature-login

# 创建 worktree 并检出 branch
git worktree add .worktrees/feature-login -b feature-login
```

### 与 stash 的关系

stash 和 worktree 都可以"保存当前工作"，但方式不同：

- **Stash**：暂存当前改动到栈中，切回时恢复
- **Worktree**：创建新目录，改动留在新目录

**何时用哪个：**

- 需要快速切回 main 分支？用 stash
- 需要长时间并行工作？用 worktree
- 需要实验性改动？用 worktree

### 与 submodule 的关系

**submodule** 是嵌套仓库，**worktree** 是同一仓库的多工作区。

它们不冲突，可以同时使用：

```text
main-project/
  .git/
  src/
  lib/           # submodule
    .git/        # submodule 的独立 git 仓库
  .worktrees/
    feature-a/   # worktree（包含 submodule）
      lib/       # submodule 的引用
```

## 权衡与局限

### 开销

- **磁盘空间**：每个 worktree 复制一份工作文件（不复制 .git 对象）
- **管理复杂度**：需要记住清理 worktree
- **学习曲线**：需要理解 worktree 和 branch 的区别

### 局限

- **不支持所有 git 操作**：某些操作只能在主仓库执行
- **IDE 支持不一致**：某些 IDE 可能不识别 worktree
- **清理麻烦**：删除 worktree 需要两步（删除目录 + `git worktree prune`）

### 什么时候不用 worktree

- **单分支工作**：你只在一个分支上工作，不需要并行
- **磁盘空间紧张**：每个 worktree 占用磁盘空间
- **简单改动**：改一行配置，创建 worktree 太重

## 延伸阅读

- [08 - Subagent-Driven Development](08-subagent-driven-development.md) — worktree 创建后，如何派子代理执行任务
- [using-git-worktrees 技能原文](https://github.com/obra/superpowers/blob/master/skills/using-git-worktrees/SKILL.md) — 完整的 worktree 使用规范
- [Git 官方文档 - git worktree](https://git-scm.com/docs/git-worktree) — git worktree 的完整命令
- [01 - Superpowers 入门](01-overview.md) — worktree 在整体工作流中的位置

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
