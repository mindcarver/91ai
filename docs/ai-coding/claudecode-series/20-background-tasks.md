# 后台任务命令

> 更新日期：2025/06

**TL;DR：** `claude --bg` 把任务甩到后台跑，`claude agents` 看所有后台会话的状态，`claude logs` 看输出，`claude attach` 接管回来，`claude stop` 停掉。后台任务跑在一个独立进程（daemon）里，不会因为你关了终端就消失。本篇讲清楚这些命令怎么用、后台会话的生命周期是什么、哪些场景适合后台执行。

## 为什么这很重要

你在 Claude Code 里跑一个全项目重构，跑了十分钟还没结束。这十分钟里你的终端被占着，什么都干不了。

或者你用 Claude Code 做 code review，同时想让它跑测试。两个任务都很耗时，串行跑等于双倍等待。

后台任务解决的就是这个问题：**把耗时任务放到独立进程中运行，你的终端继续干别的事。** 你可以随时查看任务进度、查看输出、中途接管、或者停掉不需要的任务。

这不是简单的 `&` 后台运行。Claude Code 后台任务有自己的守护进程（daemon）、完整的会话生命周期管理、日志系统、和一套专门的命令来操控。

## 核心概念

### 后台 Daemon

Claude Code 在后台运行一个持久进程叫 daemon。它负责管理所有后台会话的生命周期。即使你关掉终端窗口，daemon 仍然在运行，后台任务继续执行。

Daemon 的存在意味着：
- 后台会话不会因为终端关闭而中断
- 多个后台会话共享同一个 daemon 进程
- 你可以随时通过命令查看和管理后台会话

如果不想启用后台任务，可以设置环境变量：

```bash
export CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1
```

### 会话生命周期

一个后台会话从创建到结束，经历这些状态：

```
dispatched → working → idle → (wake) → working → completed
                     → needs_input → (用户回复) → working
                     → failed
                     → stopped
```

几个关键状态：

- **dispatched**：任务已提交，等待 daemon 分配资源
- **working**：正在执行，Claude 在干活
- **idle**：任务执行完了，会话处于空闲，等待新任务
- **needs_input**：Claude 需要你确认权限或回答问题
- **stopped**：手动停止
- **failed**：执行出错

idle 状态的会话不会自动销毁。你可以继续给它发新任务，或者手动清理。

### Pinned Sessions

后台会话默认在空闲一段时间后会自动退出。如果你希望某个会话长期驻留（比如持续监控代码变更），可以用 **pinned session**。

在 Agent View 里按 `Ctrl+T` 可以 pin 住一个会话。Pinned 会话：
- 空闲时不会被自动回收
- Claude Code 更新后自动恢复
- 适合作为长期运行的工作节点

## 命令速查

| 命令 | 作用 |
|------|------|
| `claude --bg` | 以后台模式启动新会话 |
| `claude --bg --exec '命令'` | 把 shell 命令作为后台任务执行 |
| `claude agents` | 打开 Agent View，查看所有后台会话 |
| `claude attach <id>` | 接管一个后台会话（变回前台） |
| `claude logs <id>` | 查看后台会话的输出日志 |
| `claude stop <id>` | 停止一个后台会话 |
| `claude rm <id>` | 删除一个后台会话 |
| `claude respawn <id>` | 重新启动一个已停止的会话 |
| `/bg` | 在交互模式中把当前任务转后台 |
| `Ctrl+B` | 统一快捷键：bash 命令和 agent 都可后台化 |

## 详细用法

### 1. 启动后台会话

**方式一：直接以后台模式启动**

```bash
# 启动一个后台会话，输入任务描述
claude --bg

# 带上初始任务直接启动
claude --bg -p "分析 src/ 下所有模块的依赖关系"
```

**方式二：在交互模式中把当前任务转后台**

正在交互模式中执行任务时，输入 `/bg` 可以把当前会话转成后台运行：

```
> 帮我重构整个 auth 模块
# 任务开始执行后...
> /bg
# 任务被转成后台，终端恢复可用
```

**方式三：执行 shell 命令作为后台任务**

```bash
# 跑一个 shell 命令，输出作为后台任务
claude --bg --exec 'find . -name "*.test.ts" | head -20'
```

**方式四：Agent View 里派发**

```bash
# 打开 Agent View
claude agents

# 按 d 键，输入任务描述，选择是否用 worktree 隔离
# 回车后任务进入 dispatched 状态
```

### 2. 查看后台会话

```bash
# 打开 Agent View 看板
claude agents
```

Agent View 里你能看到：
- 所有后台会话的 ID、状态、运行时间
- 每个会话的当前任务描述
- 需要输入的会话会标黄提示

Agent View 内的快捷键：

| 按键 | 功能 |
|------|------|
| `d` | 派发新任务 |
| `p` | 预览会话输出（peek） |
| `r` | 回复需要输入的会话 |
| `a` | 接管会话（attach） |
| `s` | 停止会话 |
| `Ctrl+T` | Pin/Unpin 会话 |
| `q` | 退出看板 |

### 3. 查看日志

```bash
# 查看某个后台会话的完整输出
claude logs abc123

# 只看最近 50 行
claude logs abc123 --tail 50
```

日志显示的是后台会话的所有输出——Claude 的回复、执行的命令、文件操作的记录。排查后台任务出错时最有用。

### 4. 接管后台会话

```bash
# 把后台会话拉回前台，变成交互模式
claude attach abc123
```

attach 之后，你就像直接在跟这个会话对话一样。可以继续给任务、回答权限确认、或者做任何交互操作。

在 Agent View 里也可以按 `a` 键来 attach。

### 5. 停止和清理

```bash
# 停止一个正在运行的后台会话
claude stop abc123

# 删除一个已停止的会话（清理资源）
claude rm abc123

# 重新启动一个已停止的会话
claude respawn abc123
```

`stop` 和 `rm` 的区别：stop 只是暂停，会话还在；rm 是彻底删除，释放所有资源。

### 6. Detach（从前台退回后台）

当你 attach 了一个后台会话后，想退回让它继续在后台跑：

- 按 `←`（左箭头）：正常 detach
- 按 `←←`（快速按两次左箭头）：强制 detach

detach 后会话回到后台继续执行，你的终端恢复自由。

### 7. Ctrl+B：统一后台化快捷键

`Ctrl+B` 是一个通用快捷键，在交互模式中随时可用：

- 如果光标在输入框且有内容：把当前 bash 命令作为后台任务执行
- 如果有活跃的 agent 任务：把 agent 任务转后台

一个快捷键覆盖两种后台化场景，不用记两套操作。

## 实战场景

### 场景一：长时间代码分析放后台

你要分析整个代码库的架构问题，这个任务可能跑十几分钟：

```bash
# 启动后台分析
claude --bg -p "分析这个项目的整体架构，列出所有模块之间的依赖关系图，标注循环依赖"

# 继续在终端做其他事
# ...

# 想看看分析进度
claude agents
# 在 Agent View 里按 p 预览输出

# 分析完了，拉回前台看完整结果
claude attach abc123
```

### 场景二：并行跑多个独立任务

你同时需要做三件事：写测试、修 bug、重构某个模块：

```bash
# 启动第一个后台任务
claude --bg -p "给 auth 模块写单元测试，覆盖所有公开接口"

# 启动第二个
claude --bg -p "修复 issue #42 的边界条件问题"

# 第三个在当前终端做
claude
> 重构 utils.ts，把所有日期相关函数抽到 date-utils.ts
```

三个任务同时跑，互不干扰。注意每个后台任务都独立消耗 API 配额。

### 场景三：后台任务需要你确认权限

后台任务跑到一半遇到权限问题（比如要写一个新文件），会进入 needs_input 状态：

```bash
# 查看 Agent View，发现一个会话标黄了
claude agents
# 按 r 键回复，确认权限

# 或者直接 attach 过去处理
claude attach abc123
# 处理完权限确认后，按 ← detach 回后台
```

### 场景四：用 Worktree 隔离后台任务的文件修改

后台任务要改文件，但你不想影响当前工作区：

```bash
# 在 Agent View 里派发任务时选择 worktree 隔离
claude agents
# 按 d → 输入任务 → 选择 "Create worktree"

# 后台任务在独立的 git worktree 里修改文件
# 完成后你可以手动合并那个分支
git merge worktree-branch-name
```

### 场景五：Pinned Session 做持续监控

你想让一个 Claude 会话持续监控代码变更并自动审查：

```bash
# 启动后台会话
claude --bg -p "监控 git stash 和未提交的变更，对每次变更做代码审查"

# 在 Agent View 里 pin 住它
claude agents
# 选中该会话，按 Ctrl+T
```

Pinned 会话在空闲时不会被回收，适合做这种长期运行的任务。

## 与其他功能的协作

后台任务不是孤立的功能，它和 Claude Code 的其他能力有交叉：

| 关联功能 | 关系 |
|----------|------|
| Agent View（第 67 篇） | Agent View 是后台会话的管理界面，本篇的命令是底层操作 |
| Subagents（第 65 篇） | Subagent 是会话内的子代理，后台任务是独立进程，级别不同 |
| Headless 模式（第 69 篇） | Headless 是无交互执行，后台任务是后台执行，可以叠加使用 |
| Worktree（第 68 篇） | 后台任务可选 worktree 隔离，避免文件冲突 |
| Dynamic Workflows | Workflows 自动编排大量 subagent，底层也使用后台执行机制 |

## 关键要点

1. **后台任务的核心是 daemon 进程**：它独立于终端，管理所有后台会话的生命周期
2. **生命周期是 dispatched → working → idle → completed/failed/stopped**：理解状态流转才知道什么时候该用什么命令
3. **`claude agents` 是看板，`claude attach/logs/stop/rm` 是操作命令**：看板负责查看，命令负责操控
4. **`/bg` 和 `Ctrl+B` 是两种"转后台"的快捷方式**：`/bg` 在交互模式中用，`Ctrl+B` 通用但场景不同
5. **Pinned sessions 适合长期驻留**：空闲不回收，更新后自动恢复
6. **每个后台会话独立消耗 API 配额**：并行跑 3 个任务 = 3 倍 token 消耗，用之前算好成本
7. **Worktree 隔离是可选的文件保护**：后台任务要改文件时建议开启，避免冲突
8. **`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` 可以完全禁用后台功能**：不需要时关掉，减少资源占用

## 延伸阅读

- [Background Tasks - Claude Code 官方文档](https://docs.anthropic.com/en/docs/claude-code/background-tasks)
- [Agent View - Claude Code 官方文档](https://docs.anthropic.com/en/docs/claude-code/agent-view)
- 系列第 67 篇：Agent Teams、Agent View 和 Dynamic Workflows（并行编排全景）
- 系列第 65 篇：Subagents 入门（会话内子代理机制）
- 系列第 69 篇：Headless 模式（无交互自动化执行）
- 系列第 25 篇：CLI Flags 总览（`--bg` 等 flag 参考）

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
