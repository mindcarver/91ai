<!--
调研来源（不发布，仅记录）：
1. Codex CLI 源码 tui/src/bottom_pane/status_line_setup.rs — StatusLineItem 枚举定义
2. Codex CLI 源码 tui/tooltips.txt — TUI 提示文案
3. Codex CLI 官方配置参考 https://developers.openai.com/codex/config-reference — TUI 相关字段
4. Codex CLI 示例配置 https://developers.openai.com/codex/config-sample — [tui] 配置段
5. zread.ai/openai/codex/14-terminal-ui-tui — TUI 模块组织与快捷键映射系统
6. Codex CLI 源码 codex-rs/config/src/types.rs — TUI 配置类型定义
7. Codex CLI 源码 codex-rs/tui/src/bottom_pane/mod.rs — 快捷键三层解析优先级
版本基准: 2026 年 6 月，Codex CLI v0.75.0
-->

# Codex CLI TUI 界面配置：主题、快捷键、状态栏与通知

> **TL;DR**：Codex CLI 的 TUI 不只是个黑底白字的终端界面——你可以通过 `[tui]` 配置段深度定制它的外观和交互。这篇文章覆盖全部 TUI 配置项：主题（`tui.theme`）控制语法高亮配色、快捷键（`tui.keymap`）支持 10 个上下文的按键重映射、状态栏（`tui.status_line`）有 23 种可显示的信息项、终端标题（`tui.terminal_title`）让你在任务栏一眼找到 Codex 窗口、通知系统（`tui.notifications`）支持桌面推送、Vim 模式让 h/j/k/l 爱好者舒适操作。此外还有动画开关、原始输出模式、备用屏幕等细节配置。文末给出三套实战配置模板，可以直接复制到 `~/.codex/config.toml` 里用。

---

## 1. TUI 定制化概览

先用一个思维实验热身：假设你每天用 Codex CLI 工作 6 小时，这意味着你每天盯着这个终端界面 6 小时。如果默认的配色方案让你的眼睛不舒服，默认的快捷键让你的手指别扭，默认的状态栏信息对你来说是噪音——这 6 小时里你都在忍受而不是享受。

这就是 TUI 配置存在的意义。Codex 的 TUI 基于 Ratatui 构建，它的 `[tui]` 配置段让你能从以下几个方面定制界面：

| 配置项 | 作用 | 默认值 |
|--------|------|--------|
| `theme` | 语法高亮主题 | 自动检测终端配色 |
| `keymap` | 快捷键绑定 | 内置默认映射 |
| `status_line` | 底部状态栏内容 | `["model-with-reasoning", "context-remaining", "current-dir"]` |
| `terminal_title` | 终端窗口/标签页标题 | `["spinner", "project"]` |
| `vim_mode_default` | 默认启用 Vim 模式 | `false` |
| `notifications` | 桌面通知 | `true` |
| `notification_method` | 通知方式 | `"auto"` |
| `notification_condition` | 通知触发条件 | `"unfocused"` |
| `animations` | 动画效果 | `true` |
| `show_tooltips` | 欢迎页提示 | `true` |
| `raw_output_mode` | 原始输出模式 | `false` |
| `alternate_screen` | 备用屏幕 | `"auto"` |

这些配置全部写在 `~/.codex/config.toml` 的 `[tui]` 段里。项目级的 `.codex/config.toml` 也可以写 TUI 配置，但注意通知相关的字段（`notifications`、`notify`）在项目级配置中会被忽略——它们只能在用户级配置中设置。

接下来逐个拆解。

---

## 2. 主题系统（`/theme` 与 `tui.theme`）

### 2.1 主题控制的是什么

先说清楚一个容易混淆的点：`tui.theme` 控制的是**代码语法高亮的配色**，不是整个 TUI 的 UI 配色（比如背景色、边框色、按钮色）。

具体来说，当 Codex 在 TUI 里展示代码块、diff 输出、文件内容时，它会用 theme 里定义的颜色来给关键词、字符串、注释、类型名等着色。这和你用 VS Code 或者 Sublime Text 时选主题是一个概念。

### 2.2 怎么选主题

两种方式：

**方式一：在 TUI 里实时预览**

在 Codex TUI 里输入 `/theme`，会打开一个主题浏览器。你可以实时预览每个主题的效果，选中后自动保存到 `config.toml`。这是最推荐的方式——因为你可以直接看到效果。

**方式二：手动写入配置**

```toml
[tui]
theme = "catppuccin-mocha"
```

主题名称用 kebab-case。内置了一堆常用主题，比如 `catppuccin-mocha`、`dracula`、`nord`、`solarized-dark`、`gruvbox-dark` 等等。

### 2.3 自定义主题

如果内置主题都不满意，你可以自己写 `.tmTheme` 格式的主题文件，放到 `$CODEX_HOME/themes/` 目录下（通常是 `~/.codex/themes/`）。`.tmTheme` 是 TextMate 主题格式，基本上所有现代编辑器和终端工具都支持这个格式。

一个最小化的 `.tmTheme` 文件结构长这样：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>name</key>
    <string>My Custom Theme</string>
    <key>settings</key>
    <array>
        <dict>
            <key>settings</key>
            <dict>
                <key>background</key>
                <string>#1a1b26</string>
                <key>foreground</key>
                <string>#a9b1d6</string>
            </dict>
        </dict>
        <dict>
            <key>name</key>
            <string>Keyword</string>
            <key>scope</key>
            <string>keyword</string>
            <key>settings</key>
            <dict>
                <key>foreground</key>
                <string>#bb9af7</string>
            </dict>
        </dict>
    </array>
</dict>
</plist>
```

把这个文件存为 `~/.codex/themes/my-custom.tmTheme`，然后在配置里写 `theme = "my-custom"` 就能用了。

### 2.4 一个注意点

目前主题只影响语法高亮，不影响 TUI 的 UI 元素颜色（比如状态栏、边框、按钮）。如果你想改变整个界面的配色，目前还没有官方支持的配置项。社区里有相关讨论（GitHub issue #21130），但截至 2026 年中还没有实现。

---

## 3. 快捷键系统（`tui.keymap`）

### 3.1 设计思路

Codex TUI 的快捷键系统有一个很实用的设计：**上下文感知**。

什么意思？你在编辑器里按 `Enter` 是换行，在聊天列表里按 `Enter` 是选中——同一个按键在不同上下文下有不同的行为。这需要快捷键系统知道"当前在哪个上下文"。

从源码看，TUI 实现了三层解析优先级：

1. **上下文特定绑定**（优先级最高）：比如在 `composer` 上下文中定义的绑定
2. **全局回退**：如果在当前上下文里没找到匹配的绑定，就去 `global` 里找
3. **内置默认值**（优先级最低）：如果都没找到，用 Codex 内置的默认按键

这意味着你可以只改某个上下文里的某个快捷键，而不影响其他上下文。

### 3.2 支持的上下文

Codex 的快捷键上下文一共有 10 个：

| 上下文 | 用途 |
|--------|------|
| `global` | 全局快捷键，所有上下文的回退 |
| `chat` | 聊天区域——浏览对话历史、中断 Agent 轮次 |
| `composer` | 输入框——写消息、附加文件、提交 |
| `editor` | 多行编辑器——编辑长文本 |
| `vim_normal` | Vim 普通模式——h/j/k/l 移动 |
| `vim_operator` | Vim 操作符模式——d、c、y 等待 motion |
| `vim_text_object` | Vim 文本对象——iw、i" 等 |
| `pager` | 分页器——浏览长输出 |
| `list` | 列表——选择项目、浏览历史 |
| `approval` | 审批提示——批准或拒绝命令执行 |

### 3.3 配置语法

快捷键配置写在 `[tui.keymap]` 下，按上下文分组：

```toml
[tui.keymap.global]
open_transcript = "ctrl-t"
open_external_editor = []   # 空数组 = 解除绑定

[tui.keymap.composer]
submit = ["enter", "ctrl-m"]  # 可以绑定多个键

[tui.keymap.chat]
interrupt_turn = "f12"
```

按键名称使用规范化的字符串，常见的有：

- 修饰键组合：`ctrl-a`、`alt-enter`、`shift-tab`
- 功能键：`f1` 到 `f12`
- 特殊键：`enter`、`escape`、`tab`、`backspace`、`delete`
- 方向键：`up`、`down`、`left`、`right`
- 翻页键：`page-up`、`page-down`、`home`、`end`
- 符号键：`minus`（减号）、`equals`（等号）、`space`

### 3.4 解除绑定

如果你想禁用某个快捷键，把它设为空数组：

```toml
[tui.keymap.global]
open_external_editor = []  # 这个快捷键被完全禁用了
```

这比注释掉更明确——它告诉 Codex "我就是要禁用这个功能"，而不是"我没配置这个功能"。

### 3.5 Composer 的回退机制

Composer 上下文有一个特殊的回退规则：如果某个 action 在 `composer` 里没定义，它会去 `global` 里找同名 action。所以你可以把一些通用的快捷键放在 `global` 里，只在 `composer` 里覆盖需要特殊处理的那些。

举个例子：

```toml
[tui.keymap.global]
copy_response = "ctrl-o"      # 全局：Ctrl+O 复制响应

[tui.keymap.composer]
# composer 里不需要覆盖 copy_response，
# 因为它会回退到 global 的定义
new_line = "shift-enter"       # composer 特有：Shift+Enter 换行
submit = "enter"               # composer 特有：Enter 提交
```

### 3.6 使用 `/keymap` 命令

除了在配置文件里写快捷键，你还可以在 TUI 里用 `/keymap` 命令动态查看和修改快捷键。`/keymap add` 可以交互式地添加新绑定。不过这种修改只在当前会话有效，要持久化还是得写进 `config.toml`。

---

## 4. 状态栏配置（`tui.status_line`）

### 4.1 状态栏在哪

状态栏是 TUI 底部的一行信息条。默认情况下它显示三样东西：当前模型（含推理等级）、上下文窗口剩余百分比、当前工作目录。

### 4.2 可用的状态栏项

Codex 的状态栏支持 23 种信息项。来源是源码里 `StatusLineItem` 枚举的定义，每一项都有一个 kebab-case 的标识符和一段描述。

| 标识符 | 含义 | 不可用时的行为 |
|--------|------|---------------|
| `model` | 当前模型名称 | 始终显示 |
| `model-with-reasoning` | 当前模型名称 + 推理等级 | 始终显示 |
| `current-dir` | 当前工作目录 | 始终显示 |
| `project` 或 `project-root` | 项目名称 | 无项目时省略 |
| `git-branch` | 当前 Git 分支 | 不在 Git 仓库时省略 |
| `pull-request-number` | 当前分支的 PR 编号 | 无 PR 时省略 |
| `branch-changes` | 相对于默认分支的提交变更 | 不可用时省略 |
| `status` 或 `run-state` | 运行状态（Ready/Working/Thinking） | 始终显示 |
| `permissions` | 当前权限配置 | 始终显示 |
| `approval` 或 `approval-mode` | 当前审批模式 | 始终显示 |
| `context-remaining` | 上下文窗口剩余百分比 | 未知时省略 |
| `context-used` 或 `context-usage` | 上下文窗口使用百分比 | 未知时省略 |
| `context-window-size` | 上下文窗口总大小（token 数） | 未知时省略 |
| `five-hour-limit` | 5 小时用量限制剩余 | 不可用时省略 |
| `weekly-limit` | 周用量限制剩余 | 不可用时省略 |
| `codex-version` | Codex 版本号 | 始终显示 |
| `used-tokens` | 会话已用 token 总数 | 为零时省略 |
| `total-input-tokens` | 会话输入 token 总数 | 始终显示 |
| `total-output-tokens` | 会话输出 token 总数 | 始终显示 |
| `session-id` 或 `thread-id` | 当前会话标识符 | 线程启动前省略 |
| `fast-mode` | 是否处于 Fast 模式 | 始终显示 |
| `raw-output` | 是否处于原始输出模式 | 始终显示 |
| `thread-title` | 当前线程标题或标识符 | 未命名前省略 |
| `task-progress` | 当前任务进度 | 不可用时省略 |

注意"不可用时省略"这个设计。状态栏不会显示无意义的信息——比如你不在 Git 仓库里，`git-branch` 就自动隐藏，不会占着位置显示一个 "N/A"。

### 4.3 配置方式

```toml
[tui]
status_line = ["model-with-reasoning", "context-remaining", "git-branch", "approval"]
```

顺序很重要——信息项按数组顺序从左到右排列。

如果你想完全隐藏状态栏：

```toml
[tui]
status_line = []
```

设为空数组就完全隐藏了。也可以设为 `null`（在 TOML 里写 `status_line = null` 或不设这个键），效果一样——不显示状态栏。

### 4.4 使用 `/statusline` 命令

和主题一样，状态栏也可以在 TUI 里用 `/statusline` 命令交互式配置。你可以实时看到增删某个信息项的效果，满意了再手动同步到 `config.toml`。

### 4.5 实用建议

状态栏的空间是有限的。如果你塞了太多信息项，终端窗口窄的时候会被截断。建议只放你真正需要实时关注的 3-5 个项。

对于日常编码，推荐这个组合：

```toml
status_line = ["model-with-reasoning", "context-remaining", "git-branch"]
```

如果你在做成本敏感的工作，加上 token 计数：

```toml
status_line = ["model", "context-remaining", "used-tokens", "git-branch"]
```

---

## 5. 终端标题（`tui.terminal_title`）

### 5.1 为什么终端标题有用

如果你同时开着十几个终端标签页（这很常见），每个标签页的标题都是 "bash" 或者 "zsh"，找 Codex 的标签页就很痛苦。

`tui.terminal_title` 让你控制 Codex 运行时终端标签页显示的标题内容。这样你在任务栏或者标签栏就能一眼认出哪个是 Codex。

### 5.2 可用的标题项

| 标识符 | 含义 |
|--------|------|
| `app-name` | 应用名称（"Codex"） |
| `project` | 当前项目名称 |
| `spinner` | 动态状态指示器（旋转/脉冲动画） |
| `status` | 运行状态文字（Ready/Working/Thinking） |
| `thread` | 当前线程标题或标识符 |
| `git-branch` | 当前 Git 分支 |
| `model` | 当前模型名称 |
| `task-progress` | 当前任务进度 |

### 5.3 配置方式

默认值是 `["spinner", "project"]`——一个动态的状态指示器加项目名称。

```toml
[tui]
# 完整信息：状态动画 + 项目 + 分支 + 模型
terminal_title = ["spinner", "project", "git-branch", "model"]
```

标题项也是按顺序拼接的。显示效果类似：

```
⠋ my-project (main) gpt-5.5
```

如果你不想让 Codex 修改终端标题（比如你用 tmux 自己管理标题）：

```toml
[tui]
terminal_title = []
```

### 5.4 WSL 注意事项

如果你在 Windows 的 WSL 里跑 Codex，终端标题的更新可能不如原生 Linux 或 macOS 那么可靠。这取决于你用的 Windows Terminal 版本和配置。Codex 在检测到 WSL 环境时会自动回退到 Windows 原生的 toast 通知。

---

## 6. Vim 模式（`tui.vim_mode_default`）

### 6.1 这是给谁用的

如果你不知道 Vim 是什么，或者你从来没有在终端里用 h/j/k/l 移动光标的习惯，这个配置对你没用，跳过就好。

但如果你是一个 Vim 用户——哪怕只是轻度用户——这个功能值得了解。Codex TUI 的输入框（composer）支持 Vim 风格的模态编辑：普通模式用 h/j/k/l 移动、i 进入插入模式、x 删除字符、dd 删除行等等。

### 6.2 配置方式

```toml
[tui]
vim_mode_default = true
```

设为 `true` 后，每次启动 Codex TUI，composer 默认就处于 Vim 普通模式。你需要按 `i` 进入插入模式才能打字。

如果你不想每次都这样，设为 `false`（默认值），但在某个会话里想临时切换，可以输入 `/vim` 命令。

### 6.3 Vim 相关的快捷键上下文

Vim 模式激活后，快捷键系统会识别三个额外的上下文：

- `vim_normal`：普通模式下的按键映射（移动、删除、粘贴等）
- `vim_operator`：操作符等待模式（按 `d` 之后等待 motion）
- `vim_text_object`：文本对象选择（`iw`、`i"`、`a(` 等）

你可以在这些上下文里自定义快捷键。比如你想在普通模式下用 `s` 代替 `i` 进入插入模式：

```toml
[tui.keymap.vim_normal]
enter_insert = "s"
```

不过说实话，除非你对 Vim 的键位有非常特定的偏好，否则内置的默认映射已经够用了。

---

## 7. 通知系统（`tui.notifications`）

### 7.1 为什么需要通知

Codex 执行一个长任务可能要几分钟甚至十几分钟。你不会一直盯着终端看——你可能切到浏览器查资料、去 Slack 回消息、或者泡杯咖啡。这时候你需要 Codex 在任务完成或者需要审批时提醒你。

这就是通知系统的作用。

### 7.2 三个配置项

通知系统由三个配置项协同工作：

**`tui.notifications`**——开关和过滤

```toml
[tui]
# 方式一：全部开启或关闭
notifications = true    # 开启所有通知
notifications = false   # 关闭所有通知

# 方式二：只接收特定类型的通知
notifications = ["agent-turn-complete", "approval-requested"]
```

支持的事件类型包括 `agent-turn-complete`（Agent 完成一轮操作）和 `approval-requested`（需要审批）等。你可以只开启你关心的类型。

**`tui.notification_method`**——通知方式

| 值 | 含义 |
|----|------|
| `"auto"` | 自动检测（默认值） |
| `"osc9"` | 使用 OSC 9 转义序列 |
| `"bel"` | 终端响铃 |

`"auto"` 模式下，Codex 会尝试检测你的终端是否支持 OSC 9（一种通过终端转义序列发送桌面通知的标准）。支持的话就用 OSC 9，不支持就回退到 BEL（终端响铃）。

在 iTerm2、WezTerm、Kitty 等现代终端里，OSC 9 通常能正常工作，触发 macOS 的原生通知中心弹窗。但在某些终端（比如老版本的 Terminal.app 或者某些 SSH 会话）里，OSC 9 不支持，Codex 会自动回退。

**`tui.notification_condition`**——触发条件

| 值 | 含义 |
|----|------|
| `"unfocused"` | 只在终端窗口不在前台时通知（默认值） |
| `"always"` | 不管终端是否在前台都通知 |

默认的 `"unfocused"` 很合理——你正在看 Codex 的输出时不需要通知打扰你，切走之后才需要提醒。但如果你有时候虽然在 Codex 窗口，但注意力在别的显示器上，`"always"` 可能更适合你。

### 7.3 与 `notify` 的关系

除了 `[tui]` 里的通知配置，Codex 还有一个顶层的 `notify` 配置项，它定义一个外部通知命令：

```toml
# 顶层配置，不在 [tui] 里
notify = ["terminal-notifier", "-title", "Codex", "-sound", "default"]
```

`notify` 和 `tui.notifications` 是两套独立的系统：
- `tui.notifications` 是 TUI 内建的终端通知（通过 OSC 9 或 BEL）
- `notify` 是调用外部程序发通知（比如 macOS 的 `terminal-notifier`）

两套系统可以同时启用。如果你想要更丰富的通知体验（比如带声音、带图标），就配置 `notify`。如果只是简单提醒，`tui.notifications` 就够了。

### 7.4 macOS 上的实际体验

在 macOS 上，用 iTerm2 或 WezTerm 时：

1. `tui.notifications = true` + `notification_method = "auto"` 通常就能触发系统通知
2. 如果不生效，试试安装 `terminal-notifier`（`brew install terminal-notifier`），然后在顶层配置里加 `notify = ["terminal-notifier", "Codex"]`
3. 确保系统偏好设置里允许终端发送通知

---

## 8. 其他 TUI 配置

### 8.1 动画开关（`tui.animations`）

```toml
[tui]
animations = false
```

默认开启。控制欢迎屏动画、spinner（旋转加载指示器）、shimmer（微光效果）等视觉动画。

什么时候需要关掉？如果你：
- 使用屏幕阅读器——动画会干扰屏幕阅读器的工作
- 通过慢速 SSH 连接——动画会加重传输负担
- 个人的视觉偏好——就是不喜欢动来动去的东西

关闭动画后 spinner 会变成静态的文字指示（比如 "[Working]"）。

### 8.2 提示开关（`tui.show_tooltips`）

```toml
[tui]
show_tooltips = false
```

默认开启。控制在欢迎屏幕上显示那些启动提示（"用 /compact 压缩对话"、"按 Tab 排队消息"之类的小技巧）。

如果你已经是老用户了，这些提示对你来说就是噪音。关掉它。

### 8.3 原始输出模式（`tui.raw_output_mode`）

```toml
[tui]
raw_output_mode = true
```

默认关闭。开启后 TUI 以"原始回滚"模式启动。

原始输出模式有什么用？正常模式下，Codex 的输出是经过渲染的——代码块有语法高亮、diff 有颜色标记、Markdown 有格式化。这些都很好看，但如果你需要**复制输出到剪贴板**，渲染后的内容可能包含 ANSI 转义码，粘贴到别的地方会乱码。

原始输出模式关闭渲染，直接显示纯文本。这样你可以舒服地选择和复制。

你可以在运行时用 `/raw` 命令或 `alt-r` 快捷键临时切换，不需要重启 Codex。

### 8.4 备用屏幕（`tui.alternate_screen`）

```toml
[tui]
alternate_screen = "auto"   # 默认
```

| 值 | 含义 |
|----|------|
| `"auto"` | 自动判断——在 Zellij 里不用备用屏幕，其他终端用 |
| `"always"` | 总是使用备用屏幕 |
| `"never"` | 从不使用备用屏幕 |

备用屏幕是什么？终端里有一种机制叫"备用屏幕缓冲区"（alternate screen buffer）。当你打开 `vim`、`less` 或者 `htop` 时，终端会切换到备用屏幕，退出时切回主屏幕——主屏幕上之前的输出完好无损。Codex TUI 也用这个机制。

为什么在 Zellij 里默认不用？因为 Zellij 本身有自己的滚动回溯管理，如果 Codex 再用备用屏幕，会导致 Zellij 的滚动回溯功能失效——你看不到之前 Codex 输出的内容。

如果你不用 Zellij，保持 `"auto"` 就行。如果你发现退出 Codex 后之前的终端输出不见了，试试设成 `"never"`。

---

## 9. 三个实战配置场景

### 场景一：Vim 老手的高效配置

适合重度 Vim 用户，追求键盘效率和最小视觉干扰。

```toml
[tui]
# 暗色主题，对眼睛友好
theme = "catppuccin-mocha"

# 默认启用 Vim 模式
vim_mode_default = true

# 关闭动画和提示，减少视觉干扰
animations = false
show_tooltips = false

# 精简状态栏：只要模型和上下文信息
status_line = ["model-with-reasoning", "context-remaining"]

# 终端标题显示分支，方便在标签页间切换
terminal_title = ["spinner", "git-branch"]

# 只在切走时通知，审批请求必须通知
notifications = ["agent-turn-complete", "approval-requested"]
notification_condition = "unfocused"

[tui.keymap.global]
# 用 Ctrl+T 打开对话记录
open_transcript = "ctrl-t"

[tui.keymap.vim_normal]
# 用 s 进入插入模式（和 Vim 的默认行为一致）
enter_insert = "s"

[tui.keymap.chat]
# 用 F12 中断当前轮次
interrupt_turn = "f12"
```

### 场景二：全信息监控的工作台配置

适合需要时刻关注资源使用情况的重度用户——你可能同时开多个 Codex 会话，需要精确控制 token 消耗。

```toml
[tui]
# 经典暗色主题
theme = "gruvbox-dark"

# 详细状态栏：模型 + 上下文 + token 计数 + Git + 审批模式 + 版本
status_line = [
    "model-with-reasoning",
    "context-remaining",
    "used-tokens",
    "git-branch",
    "approval-mode",
    "codex-version"
]

# 详细的终端标题
terminal_title = ["spinner", "project", "git-branch", "model", "task-progress"]

# 总是通知
notifications = true
notification_condition = "always"
notification_method = "auto"

# 保持动画和提示
animations = true
show_tooltips = true

# 原始输出模式，方便复制
raw_output_mode = false

[tui.keymap.global]
open_transcript = "ctrl-t"

[tui.keymap.composer]
# Ctrl+M 也可以提交
submit = ["enter", "ctrl-m"]
```

### 场景三：极简远程 SSH 配置

适合通过 SSH 连到远程服务器使用 Codex 的场景。远程终端通常带宽有限、延迟较高、功能支持不完整。

```toml
[tui]
# 不设主题，用终端默认配色
# theme = ""  # 留空即使用终端默认

# 关闭所有动画，减少传输量
animations = false
show_tooltips = false

# 最小状态栏
status_line = ["model", "context-remaining"]

# 关闭终端标题修改（某些 SSH 终端不支持）
terminal_title = []

# 通知用 BEL（最通用的方式）
notifications = true
notification_method = "bel"
notification_condition = "unfocused"

# 关闭备用屏幕，保留滚动回溯
alternate_screen = "never"

# 开启原始输出模式，方便在远程终端里选择复制
raw_output_mode = true
```

---

## 延伸阅读

- [Codex CLI 官方配置参考](https://developers.openai.com/codex/config-reference) —— 全部 `config.toml` 字段的完整文档
- [Codex CLI 示例配置](https://developers.openai.com/codex/config-sample) —— 可直接复制的配置模板
- [本系列第 22 篇：配置文件体系总览](./22-config-overview.md) —— 四层配置加载优先级的详细解析
- [本系列第 24 篇：Provider 配置](./24-config-provider.md) —— 模型提供商的配置方法
- [本系列第 27 篇：Profile 配置](./27-config-profiles.md) —— 用配置文件切换不同工作环境
- [Codex TUI 源码](https://github.com/openai/codex/tree/main/codex-rs/tui) —— 80+ 个源模块的 TUI crate
