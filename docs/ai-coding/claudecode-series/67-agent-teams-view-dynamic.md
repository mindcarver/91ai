# Agent Teams、Agent View 和 Dynamic Workflows

> 更新日期：2025/06

**TL;DR：** Claude Code 有三种方式让多个 Claude 实例并行干活——Agent Teams（团队协作）、Agent View（调度看板）、Dynamic Workflows（脚本化编排）。它们的区别不在"能不能并行"，而在"谁持有执行计划、谁做决策、能跑多大规模"。本文拆解每种模式的机制、配置、适用场景和局限。

## 为什么需要并行编排

单个 Claude Code 会话在同一时刻只能做一件事。当你面对"同时审查 10 个 PR"、"给 20 个文件做相同重构"、"先调研再分析再实现"这类任务时，串行执行既慢又浪费上下文。

Claude Code 逐步引入了三种并行方案，各有侧重：

- **Agent Teams**：多个 Claude 实例组成团队，由 lead 协调分工
- **Agent View**：后台会话的统一看板，用于调度和监控
- **Dynamic Workflows**：Claude 自动生成 JS 编排脚本，驱动数十到数百个 subagent 并行执行

## Agent Teams：团队协作模式

### 工作机制

Agent Teams 由一个 lead 会话和多个 teammate 会话组成。Lead 维护一份共享任务列表，把任务分配给各 teammate。Teammate 之间通过 mailbox 收发消息，不直接共享文件系统。

架构示意：

```
Lead Session
├── 维护任务列表（todo list）
├── 分配任务给 teammate
├── 收集结果，汇总给用户
│
├── Teammate A（独立 Claude Code 实例）
│   ├── 独立上下文
│   └── Mailbox 接收 lead 消息
│
├── Teammate B
│   └── ...
```

### 配置与使用

需要开启实验功能标志：

```bash
# 设置环境变量启用 Agent Teams
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# 在 Claude Code 交互模式中创建团队
# lead 会话会自动拉起 teammate
```

Team 可以在两种显示模式下运行：

- **In-process**：teammate 在同一终端窗口内，通过状态栏切换查看
- **Split-pane**：配合 tmux 或 iTerm2 分屏，每个 teammate 占一个 pane，实时可见

### 适用场景

- 多个文件需要独立修改，且每个修改需要独立推理
- 同一个问题想尝试多种方案（竞争假设），最后比较结果
- 代码审查时每人负责不同模块

### 局限

- 实验功能，接口可能变化
- 同一时间只能有一个 team
- 不支持嵌套团队（teammate 不能再建 team）
- 推荐 teammate 数量 3-5 个，超过 5 个协调成本急剧上升
- 每个 teammate 独立消耗 token，3 个 teammate 的费用约为单会话的 3 倍
- 多个 teammate 修改同一文件可能冲突

## Agent View：会话调度看板

### 工作机制

Agent View（v2.1.139+）是一个统一的管理界面，用于查看、调度和管理后台 Claude Code 会话。它的核心组件是 supervisor 进程——一个独立于终端的后台守护进程，负责维持所有 detached session 的生命周期。

会话状态流转：

```
Dispatched → Working → Needs Input → (用户回复) → Working → Completed
                     → Idle (等待任务)
                     → Failed / Stopped
```

### 配置与使用

```bash
# 打开 Agent View 看板
claude agents

# 从看板中 dispatch 新会话
# 按 d 键 → 输入任务描述 → 选择是否使用 worktree 隔离

# 从当前会话派发后台任务
# 在交互模式中使用 /background 命令
/background 分析 src/ 下所有模块的依赖关系

# Shell 命令管理后台会话
claude attach <session-id>   # 接管一个后台会话
claude stop <session-id>     # 停止
claude logs <session-id>     # 查看日志
claude respawn               # 恢复 orphaned session
claude rm <session-id>       # 删除
```

键盘快捷键（Agent View 内）：

| 按键 | 功能 |
|------|------|
| `d` | 派发新任务 |
| `p` | 查看会话输出（peek） |
| `r` | 回复需要输入的会话 |
| `a` | 接管会话（attach） |
| `s` | 停止会话 |
| `q` | 退出看板 |

Worktree 隔离：派发任务时可以选择创建 git worktree，这样后台会话的文件修改完全隔离在独立分支上，不影响主工作区。

### 适用场景

- 长时间运行的任务（全项目扫描、大规模重构）需要放到后台
- 同时跟踪多个独立任务的进度
- 需要在任务运行中途查看输出或提供输入

### 局限

- supervisor 进程需要保持运行，系统重启后需要手动恢复
- 后台会话的上下文不会自动同步给主会话
- Worktree 隔离意味着后台修改需要手动合并回主分支
- 会话数量没有硬限制，但每个会话都消耗独立的 API 配额

## Dynamic Workflows：脚本化编排

### 工作机制

Dynamic Workflows（v2.1.154+）的核心思路是：Claude 为你的任务生成一份 JavaScript 编排脚本，由后台运行时执行。这份脚本描述了"先做什么、后做什么、哪些可以并行、每个步骤的参数是什么"。

与 Teams 和 View 的根本区别：**计划被外化为可执行代码，而不是存在 Claude 的推理过程中。** 这意味着执行过程不依赖 Claude 逐轮决策，运行时可以按脚本自动推进。

规模参数：

- 最多 16 个并发 agent
- 单次运行最多 1,000 个 subagent
- 适合需要几十到数百个并行子任务的大规模操作

### 触发方式

```bash
# 方式 1：在提示中使用 ultracode 关键词
# 在交互模式中输入包含 "ultracode" 的提示
用 ultracode 方式对 src/ 下所有文件做类型安全检查

# 方式 2：设置 effort 级别
/effort ultracode

# 方式 3：某些内置技能会自动触发 workflow
# 如 /deep-research 会使用 workflow 模式
```

执行流程：

```
用户提交任务
→ Claude 生成 JS 编排脚本
→ 用户审批方案（可查看脚本内容）
→ 后台运行时开始执行
→ /workflows 查看进度
→ 执行完毕，结果汇总返回
```

### 监控与复用

```bash
# 查看正在运行的 workflow 进度
/workflows

# 脚本自动保存到项目目录
ls .claude/workflows/
# 可以查看、修改、复用之前生成的脚本
```

### 适用场景

- 大规模代码库操作（全量重命名、批量迁移、统一风格调整）
- 需要高度并行的任务（对每个文件做独立分析/修改）
- 可重复的流程（生成的脚本可以保存后再次运行）

### 局限

- 运行中不支持用户中途输入——一旦启动就跑到底
- 16 并发 / 1000 总量的硬限制
- 脚本在 Claude Code 进程内执行，不能直接调用外部 API（需要通过 bash 工具）
- Token 消耗可能很高（数十个 subagent 并行）
- 目前生成的脚本是 JavaScript，对不熟悉 JS 的用户有阅读门槛
- 编排质量取决于 Claude 对任务的理解，复杂依赖关系可能编排失误

## 三种模式对比

| 维度 | Agent Teams | Agent View | Dynamic Workflows |
|------|-------------|------------|-------------------|
| 谁持有计划 | Lead 实例实时决策 | 各会话独立决策 | JS 脚本（代码持有计划） |
| 并行规模 | 3-5 个 teammate | 取决于手动派发数量 | 数十到数百个 subagent |
| 中途交互 | 支持（mailbox） | 支持（reply/attach） | 不支持（跑完才算） |
| 文件隔离 | 需手动 worktree | 可选 worktree | 每个 subagent 独立 |
| 配置门槛 | 环境变量 + 拆分窗口 | `claude agents` 命令 | ultracode 关键词触发 |
| 最低版本 | 实验功能 | v2.1.139 | v2.1.154 |
| Token 成本 | 中（3-5x 单会话） | 取决于会话数 | 高（可能数十个 subagent） |
| 适合任务类型 | 需要协调的并行任务 | 长任务后台管理 | 大规模批量操作 |

## 怎么选

选哪种模式，取决于三个问题：

**1. 任务是否需要你中途参与？**

需要→Agent Teams 或 Agent View。Workflows 一旦启动不接受输入。

**2. 并行规模有多大？**

3-5 个并行任务→Agent Teams。后台挂几个长任务→Agent View。几十到上百个→Dynamic Workflows。

**3. 任务是否有复杂依赖？**

独立子任务→三种都行。有先后顺序和条件分支→Dynamic Workflows（脚本描述依赖）。需要实时协商→Agent Teams（mailbox 通信）。

一个常见的组合策略：用 Agent View 做日常的后台任务管理，遇到大规模批量操作时切到 Dynamic Workflows，需要多角色协作时开启 Agent Teams。

## 关键要点

1. **三者的核心区别是"计划在哪里"**：Teams 在 lead 的推理中，View 没有统一计划，Workflows 在 JS 脚本里
2. **Teams 适合需要协调的中等规模并行**，推荐 3-5 个 teammate，超过 5 个协调效率下降
3. **Agent View 是后台会话的管理工具**，不是编排引擎，它的价值是让你看到和管理正在运行的任务
4. **Workflows 适合大规模批量操作**，但执行中不接受输入，适合"定好方案后全自动跑"的场景
5. **三种模式的 token 成本差异大**：Teams 是线性增长，Workflows 可能是指数级，使用前评估任务规模
6. **都是相对新的功能**：Teams 是实验功能，View 和 Workflows 分别在 v2.1.139 和 v2.1.154 引入，接口和行为可能还在调整

## 延伸阅读

- [Agent Teams - Claude Code 官方文档](https://code.claude.com/docs/en/agent-teams)
- [Agent View - Claude Code 官方文档](https://code.claude.com/docs/en/agent-view)
- [Workflows - Claude Code 官方文档](https://code.claude.com/docs/en/workflows)
- 系列第 65 篇：Subagents 入门（理解单会话内的子代理机制）
- 系列第 29 篇：内置 Slash Commands 地图（`/background`、`/workflows` 等命令参考）
