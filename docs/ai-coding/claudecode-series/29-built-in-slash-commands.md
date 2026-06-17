# Claude Code 内置 Slash Commands 地图

> 更新日期：2025/06

**TL;DR：** 在交互模式输入框里按 `/`，会出现所有可用命令。这些命令按功能分成几类——管会话的、切模型的、调配置的、跑任务的。本文把每个命令干什么、什么时候用、怎么用参数，全部列出来。

## Slash Commands 是什么

在 Claude Code 交互模式中，输入以 `/` 开头的文字会触发预设命令。这和在终端里输入 `git` 开头的命令是一个道理——斜杠是触发器，后面跟的是命令名。

输入 `/` 后会弹出命令列表，继续输入字母可以过滤。比如输入 `/co` 会同时匹配到 `/compact`、`/config`、`/context`、`/copy`、`/cost`。

### 内置命令 vs 自定义命令 vs 技能

| 类型 | 来源 | 特点 |
|------|------|------|
| 内置命令 | CLI 硬编码 | 行为由代码控制，不能修改 |
| 技能（Skills） | `.claude/skills/` 目录下的 `.md` 文件 | prompt 驱动，可以自建和修改 |
| 捆绑技能（Bundled Skills） | 随 Claude Code 安装自带 | 本质是技能，但由官方维护 |

捆绑技能包括 `/batch`、`/loop`、`/debug`、`/simplify`、`/claude-api`、`/code-review`、`/run`、`/verify` 等。它们和内置命令的区别是：内置命令直接执行固定逻辑，技能则是给 Claude 一段详细的指令让它用工具完成工作。

## 完整命令列表

### 会话控制类

管理对话本身的命令——清空、压缩、恢复、分支。

| 命令 | 功能 | 适用场景 |
|------|------|---------|
| `/clear [name]` | 清空上下文，开始新对话。旧对话可在 `/resume` 中找到 | 上下文太乱或要切话题 |
| `/compact [指令]` | 压缩对话历史，释放上下文空间。可附带压缩指令 | 上下文快满但不想丢掉当前对话 |
| `/resume [session]` | 恢复之前的对话。不带参数打开选择器 | 继续昨天的工作 |
| `/fork [name]` | 在当前节点分叉对话，保留原始对话 | 想试不同方案但不影响主线 |
| `/rewind` | 回溯对话和/或代码到之前的某个节点 | Claude 改坏了东西 |
| `/export [filename]` | 导出对话为纯文本 | 存档或分享 |
| `/rename [name]` | 重命名当前会话 | 管理多个并行会话 |
| `/recap` | 生成当前会话的一句话摘要 | 回来后快速回忆上下文 |
| `/btw <问题>` | 问一个旁路问题，不加入对话历史 | Claude 正在工作时问个别的 |

别名说明：`/clear` = `/reset` = `/new`；`/resume` = `/continue`；`/fork` = `/branch`；`/rewind` = `/checkpoint` = `/undo`。

### 模型与推理类

控制 Claude 用哪个模型、花多少力气思考。

| 命令 | 功能 | 适用场景 |
|------|------|---------|
| `/model [模型]` | 切换模型并保存为默认。不带参数打开选择器 | 切到 Opus 处理难题，或切 Sonnet 省钱 |
| `/effort [级别]` | 设置推理努力程度：`low`、`medium`、`high`、`xhigh`、`max` | 简单问题用 low，架构决策用 high |
| `/fast [on\|off]` | 开关快速模式（Opus 4.6 和 4.7） | 想要更快的输出速度 |

`/effort` 的级别说明：

- `low`：快速回答，不深入思考。适合格式化、简单查询
- `medium`：平衡模式
- `high`：默认级别。大多数开发任务够用
- `xhigh`：Opus 4.7 专属。复杂重构、架构设计
- `max`：仅当前会话生效。最深度思考
- `ultracode`：`xhigh` 推理 + 自动工作流编排

`low`、`medium`、`high` 会跨会话持久化；`max` 和 `ultracode` 仅当前会话生效。

不带参数运行 `/effort` 会打开一个交互式滑块，用左右箭头选择，回车确认。

### 上下文与配置类

查看状态、管理权限、诊断问题。

| 命令 | 功能 | 适用场景 |
|------|------|---------|
| `/context [all]` | 用彩色网格可视化当前上下文用量 | 看看上下文还剩多少 |
| `/cost` | 显示 token 用量和费用统计 | 关注花费 |
| `/usage` | 显示用量限额、速率限制状态（`/cost` 和 `/stats` 是它的别名） | 查看计划额度 |
| `/doctor` | 诊断 Claude Code 安装和配置 | 遇到问题时先跑这个 |
| `/permissions` | 管理工具权限（允许、询问、拒绝规则） | 配置哪些操作自动通过 |
| `/config` | 打开设置界面（主题、模型、输出风格） | 调偏好 |
| `/status` | 显示版本、模型、账户、连接状态 | 检查当前状态 |
| `/init` | 在项目中创建 `CLAUDE.md` | 新项目初始化 |
| `/memory` | 编辑 CLAUDE.md 记忆文件、开关自动记忆 | 管理持久化知识 |
| `/mcp` | 管理 MCP 服务器连接和 OAuth | 配置外部工具集成 |
| `/hooks` | 查看工具事件的钩子配置 | 了解自动化规则 |

### 任务与工作流类

设定目标、循环执行、批量操作。

| 命令 | 功能 | 适用场景 |
|------|------|---------|
| `/goal [条件\|clear]` | 设定目标：Claude 持续工作直到条件满足 | 让 Claude 自己跑完一个任务链 |
| `/loop [间隔] <提示>` | 循环执行提示。可设定间隔（如 `5m`） | 轮询部署状态、定期检查 |
| `/plan [描述]` | 进入计划模式 | 先看方案再动手 |
| `/diff` | 打开交互式 diff 查看器 | 查看未提交的改动 |
| `/tasks` | 列出和管理后台任务 | 查看后台运行的任务 |
| `/background [提示]` | 把当前会话切到后台运行 | 腾出终端做别的事 |
| `/stop` | 停止当前后台会话 | 后台任务完成时 |
| `/workflows` | 打开工作流进度视图 | 监控工作流 |

### 代码审查与质量类

| 命令 | 功能 | 适用场景 |
|------|------|---------|
| `/code-review` | 审查当前 diff 的正确性和代码质量 | 提交前检查 |
| `/review [PR]` | 在本地审查 pull request | PR 审查 |
| `/security-review` | 分析当前分支的改动中的安全风险 | 安全审计 |
| `/simplify [目标]` | 审查代码的简化机会并自动修复 | 代码清理 |

### 集成与账户类

| 命令 | 功能 | 适用场景 |
|------|------|---------|
| `/login` | 登录 Anthropic 账户 | 首次使用 |
| `/logout` | 登出 | 切账户 |
| `/ide` | 管理 IDE 集成（VS Code、JetBrains） | 连接编辑器 |
| `/install-github-app` | 安装 Claude GitHub Actions 应用 | CI 集成 |
| `/desktop` | 在 Claude Code Desktop 应用中继续当前会话 | 想用 GUI 时 |
| `/voice` | 开关语音输入 | 不想打字 |

### 其他实用命令

| 命令 | 功能 |
|------|------|
| `/help` | 显示所有可用命令及描述 |
| `/add-dir <路径>` | 添加额外的工作目录到当前会话 |
| `/copy [N]` | 复制最近一条回复到剪贴板。`N` 表示倒数第几条 |
| `/skills` | 列出所有可用技能 |
| `/release-notes` | 查看版本更新日志 |
| `/theme` | 切换颜色主题（支持亮/暗/色盲模式） |
| `/color [颜色]` | 设置提示栏颜色（red、blue、green 等） |
| `/vim` | 已移除（v2.1.92）。现在用 `/config` 里的 Editor mode |
| `/exit` | 退出 CLI。别名：`/quit` |

## 常用命令详解

### `/compact` -- 上下文不够用时救急

长对话中上下文会逐渐占满。`/compact` 把之前的对话压缩成摘要，释放空间。

```bash
# 基本用法：压缩当前对话
/compact

# 带指令的压缩：告诉它重点关注什么
/compact 重点保留 auth 模块相关的讨论和决策
```

压缩后你会看到一条摘要，概述了被压缩掉的内容。对话可以继续，但早期细节可能丢失。

什么时候该用：
- Claude 提示上下文快满了
- 感觉回复质量下降（可能是上下文太杂）
- 想继续当前话题但不需要前面的细节

### `/clear` -- 完全重新开始

和 `/compact` 不同，`/clear` 是彻底清空上下文，从零开始。旧对话不会丢，可以用 `/resume` 找回来。

```bash
# 清空当前对话，开始新的
/clear

# 清空并给旧对话起个名字，方便以后找
/clear auth-模块讨论
```

### `/model` -- 切换模型

```bash
# 打开模型选择器
/model

# 直接切换到指定模型
/model sonnet
/model opus
```

选择器里按 `s` 可以仅切换当前会话的模型（不改默认）。切换时如果对话已有历史内容，会提示确认——因为切换后下一轮回复会重读全部历史，丢失缓存的上下文。

常见搭配：日常编码用 Sonnet（快且便宜），架构设计和复杂调试用 Opus。

### `/effort` -- 控制推理深度

```bash
# 快速回答简单问题
/effort low

# 复杂问题用更多推理
/effort high

# 打开交互式滑块
/effort
```

这个命令立刻生效，不需要等当前回复完成。合理的 effort 设置能同时节省时间和费用。

### `/doctor` -- 出问题时先跑这个

```bash
/doctor
```

会检查 Claude Code 的安装状态、配置文件、网络连接等。如果发现问题，会显示状态图标，按 `f` 可以让 Claude 自动修复。

遇到以下情况时运行 `/doctor`：
- Claude Code 无法启动
- 连接不上 API
- MCP 服务器连接失败
- 升级后行为异常

### `/permissions` -- 减少确认弹窗

```bash
/permissions
```

打开一个交互式界面，可以按范围（用户/项目/本地）查看和管理权限规则。

常见操作：
- 把常用的只读 bash 命令加入允许列表
- 拒绝某些危险操作
- 查看自动模式下被拒绝的操作记录

如果你频繁确认相同的操作（比如 `npm test`），把它加入允许列表能省很多时间。也可以用 `/fewer-permission-prompts` 技能自动扫描历史记录并生成推荐列表。

## 关键要点

1. **输入 `/` 就能看到所有命令**：不用背，随时查。继续输入字母可以过滤
2. **`/compact` 和 `/clear` 的区别**：`/compact` 压缩对话继续用，`/clear` 彻底清空从零开始
3. **`/effort` 影响费用和速度**：简单问题用 `low`，复杂问题用 `high`，合理搭配能省钱
4. **出问题先跑 `/doctor`**：它检查安装、配置、网络，还能自动修复部分问题
5. **内置命令和技能是两回事**：内置命令行为固定，技能是 prompt 驱动的，可以自己写
6. **很多命令有别名**：`/clear` = `/new`、`/resume` = `/continue`、`/cost` = `/usage`，不用纠结用哪个

## 延伸阅读

- [Commands - Claude Code 官方文档](https://code.claude.com/docs/en/commands)（最权威的命令参考）
- 系列第 14 篇：交互模式入门（三个前缀符号和基本操作）
- 系列第 28 篇：交互模式基础操作（快捷键、Vim 模式、语音输入）
- [Claude Code CLI Cheatsheet - Shipyard](https://shipyard.build/blog/claude-code-cheat-sheet/)

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
