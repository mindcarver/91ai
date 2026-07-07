# Agent View 命令
> 更新日期：2025/06

**TL;DR:** `claude agents` 打开一个终端内的任务调度面板，你可以在一个屏幕上同时派发和监控多个后台 Claude Code 会话。后台会话跑在自己的 git worktree 里，不会互相踩脚，适合多任务并行开发。

## 为什么这很重要

单个 Claude Code 会话一次只能做一件事。如果你让它重构认证模块，你就得等它干完才能让它去补测试。用 Agent View，你可以同时派五个任务出去——一个重构、一个补测试、一个写文档、一个查 bug、一个做 code review——然后坐在一个面板前统一看进度。

这改变的不是 Claude 本身的能力，而是你用 Claude 的方式：从"排队等"变成"并行干"。

## 核心概念

### 后台会话（Background Session）

一个完整的 Claude Code 会话，但没有绑定的终端。它在后台运行，有自己的对话上下文、自己的 git worktree（隔离的工作目录）、自己的状态。你可以随时 attach 进去看它做了什么，也可以随时 detach 出来继续干别的。

### Agent View 面板

终端里的全屏 TUI 界面。每一行是一个后台会话，显示状态图标、会话名、当前正在做的事、运行时长。你可以用键盘快捷键来管理所有会话。

### Supervisor 进程

一个用户级别的后台进程（per-user daemon），负责管理你的所有后台会话。它自动启动、自动更新，你不需要手动管它。会话状态持久化在 `~/.claude/jobs/<id>/state.json`。

### Git Worktree 隔离

每个后台会话自动创建一个独立的 git worktree，放在 `.claude/worktrees/` 下。这意味着多个会话可以同时修改同一个项目的不同部分，不会产生文件冲突。

## 命令速查

| 命令 | 作用 |
|------|------|
| `claude agents` | 打开 Agent View 面板 |
| `claude agents --cwd <path>` | 打开限定到指定项目目录的面板 |
| `claude --bg` | 从 shell 直接派发后台任务 |
| `claude attach <id>` | 附加到指定后台会话 |
| `claude logs <id>` | 查看会话日志 |
| `claude stop <id>` | 停止后台会话 |
| `claude respawn <id>` | 重新启动已停止的会话 |
| `claude rm <id>` | 删除会话记录 |
| `claude daemon status` | 查看 supervisor 进程状态 |

面板内快捷键：

| 快捷键 | 作用 |
|--------|------|
| `Space` | 预览（peek）会话详情 |
| `Enter` / `→` | 附加（attach）到会话 |
| `←` | 从会话 detach 回面板 |
| `Ctrl+X` | 停止或删除会话 |
| `Ctrl+T` | 置顶/取消置顶 |
| `Ctrl+R` | 重命名会话 |
| `Ctrl+S` | 展开/折叠分组 |

## 详细用法

### 打开面板

```bash
# 直接打开
claude agents

# 限定到特定项目目录（只显示该项目的会话）
claude agents --cwd ~/projects/my-app
```

面板打开后你会看到一个列表，每一行是一个会话。

### 状态图标含义

会话状态通过图标形状和颜色传达信息：

**图标形状：**
- `✻` 或 `✽`：进程还活着，正在跑
- `∙`：进程已退出，可以 reattach
- `✢`：`/loop` 模式下的休眠状态

**颜色/状态：**
- 动画图标 + 旋转：Working（正在干活）
- 黄色：Needs input（等你回复问题）
- 暗淡：Idle（闲着）
- 绿色：Completed（干完了）
- 红色：Failed（挂了）
- 灰色：Stopped（被停了）

### 派发任务的三种方式

**方式一：在 Agent View 里直接派**

在面板底部的输入框里打字，回车即可派发新任务。支持加参数：

```
--permission-mode auto --model sonnet 重构 auth 模块
```

**方式二：在已有会话里用 /bg**

在一个正常的 Claude Code 会话里：

```
/bg 重构 auth 模块，完成后跑一遍测试
```

当前对话会被推到后台继续执行。

**方式三：从 shell 直接派**

```bash
# 基本用法
claude --bg "给所有 API endpoint 补集成测试"

# 指定权限模式
claude --bg --permission-mode auto "重构 src/utils 下所有文件的错误处理"

# 指定模型和 effort
claude --bg --model sonnet --effort high "对整个项目做 code review"
```

### 监控会话

面板中每行的摘要由 Haiku 级别的模型生成，每 15 秒刷新一次（会话活跃时）。你能实时看到每个 agent 在干什么。

**过滤：**

在面板输入框里用前缀过滤：

- `a:auth` — 按会话名过滤
- `s:working` — 按状态过滤
- `#42` 或 PR URL — 按 PR 编号过滤

### 附加和交互

当会话状态变成"Needs input"（黄色），说明 agent 在问你问题。这时候：

1. 按 `Enter` 或 `→` attach 进去
2. 回答问题
3. 按 `←` detach 回面板

### 分组管理

用 `Ctrl+S` 展开/折叠分组。用 `Ctrl+T` 置顶重要任务。用 `Ctrl+R` 给任务起个有意义的名字，别留默认的 UUID。

### 查看日志

如果不想进面板，直接在 shell 里看某个会话的输出：

```bash
claude logs abc123
```

### PR 状态标签

如果后台会话创建了 PR，面板行右侧会显示颜色编码的 PR 状态：

- 黄色：Open / Draft
- 绿色：Merged
- 紫色：Closed
- 灰色：Unknown

## 实战场景

### 场景一：多特性并行开发

你手上有三个特性要同时推进：

```bash
# 派发三个后台任务
claude --bg "实现用户收藏功能，包含 API、前端组件和测试" 
claude --bg "给搜索接口加缓存层，用 Redis"
claude --bg "重构通知系统，把 WebSocket 换成 SSE"

# 打开面板统一监控
claude agents
```

三个任务各自在独立的 worktree 里工作，互不干扰。哪个需要你回答问题，面板会标黄提示你。

### 场景二：CI 失败批量修复

CI 跑挂了，10 个测试失败：

```bash
# 按模块分批派发
claude --bg "修复 tests/auth/ 下所有失败的测试"
claude --bg "修复 tests/api/ 下所有失败的测试"  
claude --bg "修复 tests/utils/ 下所有失败的测试"

# 打开面板，看到哪个先完成就先 review 哪个
claude agents
```

### 场景三：代码审查 + 文档同步

刚合了一个大 PR，需要做善后：

```bash
claude --bg "检查最近 10 个 commit 的代码质量，列出问题"
claude --bg "根据最新的 API 变更更新文档"
claude --bg "补齐 src/new-module/ 下的单元测试，覆盖率目标 80%"
```

### 场景四：用面板做统一指挥

早上开始工作，打开面板：

```
claude agents
```

在面板底部输入框里：

```
--permission-mode auto 把昨天的 PR #42 的 review 意见全部修掉
```

然后 `Ctrl+S` 展开分组看看昨天跑了一夜的任务状态。某个完成了，`Enter` 进去看结果，满意就 `←` 出来继续看别的。

## 跟其他多 Agent 方案的区别

Claude Code 有几种多 Agent 模式，别搞混了：

| 方案 | 适用场景 | 特点 |
|------|---------|------|
| **Subagents** | 单会话内拆子任务 | 在一个会话内派工人，共享上下文 |
| **Agent View** | 多任务并行、需要隔离 | 每个任务独立 worktree，独立上下文 |
| **Agent Teams** | 需要协作的复杂任务 | 多个 agent 共享任务列表，有协调机制 |
| **Dynamic Workflows** | 固定流水线式任务 | 脚本化的多 subagent 编排 |

简单说：要隔离用 Agent View，要协作用 Agent Teams，要自动化用 Dynamic Workflows，单任务拆子步骤用 Subagents。

## 关键要点

- `claude agents` 是 Agent View 的入口命令，需要 v2.1.139+ 版本
- 每个后台会话有独立的 git worktree，多个任务不会互相踩文件
- Supervisor 进程自动管理所有后台会话的生命周期
- 三种派发方式：面板输入框、会话内 `/bg`、shell 里 `claude --bg`
- 面板里用键盘管理一切，`Enter` 进、`←` 出、`Space` 看、`Ctrl+X` 停
- 过滤用 `a:<名字>`、`s:<状态>`、`#<PR号>` 前缀
- 状态持久化在 `~/.claude/jobs/`，关掉终端不影响后台任务
- `--cwd` 可以把面板限定到特定项目目录

## 延伸阅读

- [第 17 篇：Session Continue 与 Resume](17-session-continue-resume.md) — 单会话的恢复机制
- [第 20 篇：Background Tasks](20-background-tasks.md) — 后台任务的底层机制
- [第 65 篇：Subagents 入门](65-subagents-getting-started.md) — 单会话内的子任务派发
- [第 67 篇：Agent Teams 与 Dynamic Workflows](67-agent-teams-view-dynamic.md) — 多 Agent 协作方案
- [第 68 篇：Worktrees 并行开发](68-worktrees-parallel-development.md) — Git Worktree 的原理与用法
