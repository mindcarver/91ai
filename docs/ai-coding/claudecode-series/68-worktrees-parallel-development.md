# Worktrees 并行开发

> 更新日期：2025/06

**TL;DR：** `claude --worktree feature-auth` 一行命令创建隔离工作目录。每个 worktree 有独立的文件和分支，多个 Claude Code 会话可以同时干活互不干扰。用 `.worktreeinclude` 自动复制 `.env` 等配置文件，退出时自动清理。

## 问题：一个仓库只能做一件事？

你正在用 Claude Code 做一个新功能，做到一半，线上报了个紧急 bug。你有几个选择：

- `git stash`，切分支修 bug，修完 `git stash pop`，祈祷没有冲突
- 新开一个终端，`cd` 到另一个克隆的仓库
- 手动 `git worktree add`，再 `cd` 过去

第一个方案 stash 多了容易乱。第二个方案浪费磁盘，还得手动同步。第三个方案方向对，但每次都要手动操作。

Claude Code 直接把第三个方案包成了一个参数：`--worktree`。

## Worktree 是什么

Git worktree 是同一个仓库的另一个工作目录。它和克隆仓库不同：

- 共享同一个 `.git`，提交历史完全同步
- 有自己的工作文件和分支
- 不同 worktree 可以检出不同分支，互不影响

对 Claude Code 来说，worktree 的意义是：**让多个 Claude 会话同时工作，文件改动不会打架。**

一个终端里 Claude 在开发新功能，另一个终端里另一个 Claude 在修 bug。两个会话操作的是不同的目录和分支，不会互相覆盖。

## 配置 Worktree

### 基本用法

```bash
# 终端 1：开发新功能
claude --worktree feature-auth

# 终端 2：修 bug
claude --worktree bugfix-123
```

也可以用短参数 `-w`：

```bash
claude -w feature-auth
```

worktree 默认创建在项目根目录的 `.claude/worktrees/<名称>/` 下，自动建一个叫 `worktree-<名称>` 的新分支。分支默认从远程的默认分支（`origin/HEAD`）拉出来，保证是干净的状态。

省略名称时，Claude 会自动生成一个随机名字，比如 `bright-running-fox`。

### 选择基础分支

默认行为是从远程默认分支新建，保证干净的起点。但有时候你想从当前分支创建——比如你正在一个功能分支上工作，想让子代理在当前进度上继续。

在 settings 里配置 `worktree.baseRef`：

```json
{
  "worktree": {
    "baseRef": "head"
  }
}
```

可选值只有两个：

- `fresh`（默认）：从远程默认分支新建
- `head`：从当前本地 HEAD 新建

也可以从 PR 创建 worktree：

```bash
claude --worktree "#1234"
```

这会 fetch `pull/1234/head` 并在 `.claude/worktrees/pr-1234/` 下创建工作目录。

### 用 `.worktreeinclude` 复制配置文件

worktree 是全新的 checkout，你主仓库里那些被 `.gitignore` 忽略的文件不会出现在里面。比如 `.env`、`.env.local`、`config/secrets.json`——这些文件不在 git 里，但项目跑起来缺了它们就报错。

在项目根目录创建 `.worktreeinclude` 文件，写入需要复制的文件模式：

```text
.env
.env.local
config/secrets.json
```

语法和 `.gitignore` 一样。有个重要限制：**只有同时匹配 `.worktreeinclude` 且被 gitignore 的文件才会被复制。** 已经被 git 跟踪的文件不会被复制。

这个机制对三种场景都生效：

- `--worktree` 参数创建的 worktree
- 子代理（subagent）的 worktree
- 桌面端的并行会话

### 首次使用需要信任目录

第一次在某个目录用 `--worktree` 之前，需要先运行一次 `claude` 接受工作区信任对话框。没做这一步，`--worktree` 会报错并提示你先跑一次 `claude`。

## 第一个 Worktree 工作流

场景：你正在开发一个用户认证功能，同时需要修一个支付模块的 bug。

```bash
# 终端 1：认证功能
claude --worktree feature-auth
```

Claude 会在 `.claude/worktrees/feature-auth/` 创建一个新的工作目录，切换到 `worktree-feature-auth` 分支，然后启动会话。

```bash
# 终端 2：支付 bug
claude --worktree bugfix-payment
```

同样，创建 `.claude/worktrees/bugfix-payment/`，切到 `worktree-bugfix-payment` 分支。

现在两个 Claude 会话各自在自己的目录里工作。终端 1 的 Claude 改 `src/auth/` 下的文件，终端 2 的 Claude 改 `src/payment/` 下的文件，互不干扰。

会话里也可以动态创建 worktree。直接告诉 Claude "work in a worktree"，它会用 `EnterWorktree` 工具创建。已经在一个 worktree 里时，还能直接切换到 `.claude/worktrees/` 下的另一个 worktree，之前的目录保持原样不动。

### 用完之后

在终端 1 的认证功能做完后，正常提交代码：

```bash
git add -A
git commit -m "feat: add JWT authentication"
```

然后退出 Claude 会话。退出时的行为取决于有没有改动：

- **没有未提交改动、没有未跟踪文件、没有新 commit**：worktree 和分支自动删除
- **有未提交改动或新 commit**：Claude 会提示你选择保留还是删除
- **非交互模式**（配合 `-p` 使用）：不会自动清理，需要手动 `git worktree remove`

## Worktree 的上下文管理

### CLAUDE.md 和 rules 的继承

worktree 是项目目录的一部分（在 `.claude/worktrees/` 下），所以项目根目录的 `CLAUDE.md` 和 `.claude/rules/` 下的规则文件对 worktree 里的 Claude 会话同样生效。

这意味着你不用在每个 worktree 里重复配置项目规则。不管是在主目录还是 worktree 里，Claude 读到的是同一份 `CLAUDE.md`。

### 独立的会话上下文

虽然共享配置文件，但每个 worktree 里的 Claude 会话是独立的。会话历史、对话上下文各自维护。一个会话的上下文不会影响另一个。

### 子代理也能用 worktree

让子代理在独立 worktree 里工作，避免并行编辑冲突。在对话中告诉 Claude "use worktrees for your agents"，或者给自定义子代理加配置：

```yaml
isolation: worktree
```

子代理的 worktree 在完成且没有改动时自动移除。和 `--worktree` 一样，默认从远程默认分支新建。

## 清理和回收

### 自动清理

Claude 创建的子代理和后台会话的 worktree，会在超过 `cleanupPeriodDays` 设置的天数后自动清理（前提是没有未提交改动、没有未跟踪文件、没有未推送的 commit）。

手动用 `--worktree` 创建的 worktree 不会被自动清理。

### 手动清理

列出所有 worktree：

```bash
git worktree list
```

删除指定的 worktree：

```bash
git worktree remove .claude/worktrees/feature-auth
```

同时删除分支：

```bash
git branch -d worktree-feature-auth
```

### 用 Git 直接创建 worktree

如果你需要更多控制（比如指定已有分支、或者把 worktree 放在项目外面），可以直接用 Git 命令：

```bash
# 在新分支上创建
git worktree add ../project-feature-a -b feature-a

# 检出已有分支
git worktree add ../project-bugfix bugfix-123

# 进入 worktree 启动 Claude
cd ../project-feature-a && claude
```

注意手动创建的 worktree 需要自己初始化开发环境：装依赖、配置虚拟环境等。

## 注意事项和坑

**`.worktreeinclude` 不复制被 git 跟踪的文件。** 它的工作原理是：匹配 `.worktreeinclude` 模式 + 被 gitignore 忽略 = 才会复制。如果你的配置文件已经被 git 跟踪了，放进 `.worktreeinclude` 也不会被复制。

**磁盘占用。** 每个 worktree 是完整的工作目录，大型项目开三四个 worktree 会占不少空间。记得及时清理不用的。

**子代理 worktree 的 baseRef。** 子代理 worktree 和 `--worktree` 用同样的 `baseRef` 设置。如果你把 `baseRef` 设成 `head`，子代理会从你当前的本地 HEAD 创建，这在某些场景下可能不是你想要的。

**非 Git 仓库。** Worktree 功能默认依赖 Git。SVN、Perforce 等其他版本控制系统需要配置 `WorktreeCreate` 和 `WorktreeRemove` hooks 来提供自定义的创建和清理逻辑。用了自定义 hooks 后，`.worktreeinclude` 不再生效，需要在 hook 脚本里自己处理文件复制。

**并行会话数别太多。** 每个并行会话都会消耗 API 额度。开太多同时跑容易撞上速率限制。实际操作中 2-3 个并行任务比较合理。

**worktree 里需要重新装依赖。** 新 worktree 是干净的 checkout，`node_modules`、虚拟环境这些都不存在。创建后记得跑 `npm install` 或等效命令。

## 关键要点

- `claude --worktree <名称>` 一行命令创建隔离工作目录，多个 Claude 会话并行工作互不干扰
- `.worktreeinclude` 自动复制 gitignore 的配置文件到新 worktree，语法和 `.gitignore` 一样
- 退出会话时，有改动的 worktree 会提示保留或删除，没改动的自动清理
- worktree 共享项目的 `CLAUDE.md` 和 `.claude/rules/`，不需要重复配置
- 实际使用中 2-3 个并行 worktree 比较合理，太多会撞速率限制

## 延伸阅读

- [Claude Code 官方文档：Run parallel sessions with worktrees](https://code.claude.com/docs/en/worktrees)
- [Git worktree 官方文档](https://git-scm.com/docs/git-worktree)
- [incident.io：用 Claude Code + Worktrees 加速开发](https://incident.io/blog/shipping-faster-with-claude-code-and-git-worktrees)
