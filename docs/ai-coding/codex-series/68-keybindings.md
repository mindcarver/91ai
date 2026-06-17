# 快捷键大全：TUI 所有按键绑定

> **TL;DR** — Codex TUI 的所有快捷键、按键绑定和自定义方法。默认键位覆盖输入、导航、审批、分屏四大类。通过 config.toml 的 `[tui.keymap]` 区块可以重新绑定任何快捷键到 10 个上下文。本文列出所有默认绑定、按场景分组，以及自定义键位的配置方法。最后给出一键可用的三套自定义方案。

---

## 1. 快捷键在 Codex 中的角色

Codex CLI 的 TUI 是一个全屏终端应用。你和它的所有交互都通过键盘完成——没有鼠标点击按钮，没有图形界面的下拉菜单。快捷键不是"锦上添花"的功能，而是你操作 Codex 的基本手段。

从源码上看，Codex 的按键处理系统基于 crossterm 库的事件循环。每次按键生成一个 `KeyEvent`，经过三层解析器匹配到对应的 action，然后触发行为。三层解析的优先级是：

1. **上下文特定绑定**（最高优先级）：比如你在 `composer` 上下文里按 Enter，优先匹配 composer 里定义的 submit 动作
2. **全局回退**：如果在当前上下文里没找到匹配的绑定，去 `global` 里找
3. **内置默认值**（最低优先级）：如果都没找到，用 Codex 硬编码的默认按键

这个三层结构意味着你可以只改某个上下文里的某个快捷键，而不影响其他上下文的行为。比如你只想改输入框里的提交键，不需要动导航区和审批区的任何绑定。

---

## 2. 快捷键分类总览

Codex TUI 的快捷键按功能分为四大区域：

| 区域 | 覆盖的操作 | 常用按键 | 对应上下文 |
|------|-----------|---------|-----------|
| 输入区 | 提交、换行、补全、编辑 | Enter, Escape, Tab, Backspace | `composer`, `chat` |
| 导航区 | 翻历史、滚动、跳转 | 方向键, PgUp/PgDn, Home/End | `chat`, `pager`, `list` |
| 审批区 | 批准、拒绝、全部批准 | Y, N, A, Shift+A | `approval` |
| 分屏区 | 切换线程、新建标签 | Ctrl+T, Ctrl+数字, [, ] | `global` |

加上 Vim 模式的三个上下文（`vim_normal`、`vim_operator`、`vim_text_object`），总共 10 个上下文。

下面按区域逐个列出所有默认绑定。

---

## 3. 输入区快捷键

输入区是你和 Codex 交流的主要区域。包括底部的单行输入框（chat）和弹出时的多行编辑器（composer）。

### 3.1 单行输入框（chat 上下文）

这是你平时打字发消息的地方。默认绑定如下：

| 按键 | 动作 | 说明 |
|------|------|------|
| `Enter` | submit | 提交当前输入 |
| `Shift+Enter` | newline | 输入换行（在多行模式中） |
| `Tab` | auto-complete | 自动补全文件名、命令名 |
| `Escape` | cancel / toggle-mode | 取消当前输入；如果有模式切换，切换模式 |
| `Ctrl+A` | move-to-start | 光标移到行首（readline 风格） |
| `Ctrl+E` | move-to-end | 光标移到行尾 |
| `Ctrl+K` | kill-to-end | 删除从光标到行尾的内容 |
| `Ctrl+U` | kill-to-start | 删除从行首到光标的内容 |
| `Ctrl+W` | delete-word-back | 删除光标前一个单词 |
| `Ctrl+L` | clear-screen | 清屏（只清视觉，不重置对话） |
| `Ctrl+C` | interrupt | 中断当前任务；空闲时退出 |
| `Up` | history-prev | 上一条历史输入 |
| `Down` | history-next | 下一条历史输入 |
| `Ctrl+O` | copy-response | 复制最近一次完成的模型输出 |
| `Alt+R` | toggle-raw | 切换原始滚动模式 |

**重点说几个容易忽略的键**：

**Tab 不只是补全，还用来排队命令**。Codex 正在执行任务时，你输入下一条指令然后按 `Tab`（不是 Enter），这条指令会被排队，等 Codex 完成当前任务后自动执行。这是第 16 篇《会话控制命令》讲过的命令排队机制。

**Escape 有双重语义**。在输入框里，它的行为取决于当前状态：
- 如果输入框里有内容，`Escape` 清空输入框
- 如果输入框是空的，`Escape` 取消当前的选择器或弹窗
- 如果正在执行任务，`Escape` 不中断任务（用 `Ctrl+C` 中断）

**Ctrl+L 和 /clear 的区别**。`Ctrl+L` 只是把终端显示的旧内容滚出视野，对话历史和线程 ID 全部保留。`/clear` 会重置整个对话。很多人搞混这两个操作，导致误删对话上下文。

### 3.2 多行编辑器（composer 上下文）

当你输入的内容比较长，或者按了某个触发多行编辑的快捷键时，Codex 会弹出多行编辑器（也叫外部编辑器）。这个编辑器的默认绑定和单行输入框有所不同：

| 按键 | 动作 | 说明 |
|------|------|------|
| `Enter` | submit | 提交（默认行为，可改为换行） |
| `Ctrl+Enter` | newline | 换行（当 Enter 设为提交时） |
| `Escape` | cancel | 取消编辑，关闭多行编辑器 |
| `Tab` | indent | 插入缩进 |
| `Shift+Tab` | outdent | 减少缩进 |
| `Backspace` | delete-back | 删除光标前字符 |
| `Delete` | delete-forward | 删除光标后字符 |
| `Ctrl+A` | select-all | 全选 |
| `Ctrl+Z` | undo | 撤销 |
| `Ctrl+Shift+Z` | redo | 重做 |

### 3.3 常见自定义：Enter 换行、Ctrl+Enter 提交

很多用户习惯 Slack/Discord 风格的输入：Enter 换行，Ctrl+Enter 发送。这是 Codex 用户最常做的一个键位调整。

在 config.toml 中：

```toml
[tui.keymap.composer]
submit = "ctrl-enter"
new_line = "enter"
```

或者在 TUI 中：

```
> /keymap composer submit=ctrl-enter
> /keymap composer newline=enter
```

改完立即生效。之后在多行编辑器里 Enter 换行，Ctrl+Enter 提交。

---

## 4. 导航区快捷键

导航区控制你在对话历史、列表选择器和分页查看器中的移动。

### 4.1 聊天区域（chat 上下文）

| 按键 | 动作 | 说明 |
|------|------|------|
| `Up` | scroll-up | 向上滚动对话 |
| `Down` | scroll-down | 向下滚动对话 |
| `PgUp` | page-up | 向上翻一页 |
| `PgDn` | page-down | 向下翻一页 |
| `Home` | scroll-to-top | 跳到对话开头 |
| `End` | scroll-to-bottom | 跳到对话末尾（最新内容） |
| `Ctrl+T` | open-transcript | 打开对话记录（完整转录） |
| `F12` | interrupt-turn | 中断当前 Agent 轮次 |

**Ctrl+T（打开对话记录）** 很实用。当对话很长，你想回顾之前某个关键讨论时，`Ctrl+T` 会打开一个完整的对话转录视图，可以搜索、滚动、定位到特定内容。

**F12（中断轮次）** 和 `Ctrl+C` 的区别：`Ctrl+C` 是中断整个任务并回到输入框；`F12`（interrupt-turn）是中断当前这一轮 Agent 的生成——相当于让模型"别说了"，但之前已经完成的部分保留。这在模型输出明显跑偏但你不想丢掉已有内容时有用。

### 4.2 列表选择器（list 上下文）

当你执行 `/resume`、`/theme`、`/model` 等命令时，会弹出列表选择器。这个上下文的默认绑定：

| 按键 | 动作 | 说明 |
|------|------|------|
| `Up` / `k` | prev | 上移一项 |
| `Down` / `j` | next | 下移一项 |
| `Enter` | select | 确认选择 |
| `Escape` | cancel | 取消，关闭选择器 |
| `Tab` | toggle | 切换当前项的勾选状态（多选列表） |
| `Space` | toggle | 同 Tab，切换勾选状态 |
| `/` | search | 进入搜索/过滤模式 |
| `Home` | first | 跳到第一项 |
| `End` | last | 跳到最后一项 |
| `PgUp` | page-up | 向上翻一页 |
| `PgDn` | page-down | 向下翻一页 |

注意列表选择器默认就支持 `j/k` 导航——不需要开 Vim 模式。这是 Codex 的一个贴心设计，即使你不用 Vim，在列表里也能用 `j/k` 快速移动。

### 4.3 分页查看器（pager 上下文）

当 Codex 输出的内容很长（比如一个大的 diff 或者完整的文件内容），会用分页查看器展示。默认绑定：

| 按键 | 动作 | 说明 |
|------|------|------|
| `Up` / `k` | scroll-up | 向上滚动一行 |
| `Down` / `j` | scroll-down | 向下滚动一行 |
| `PgUp` | page-up | 向上翻一页 |
| `PgDn` | page-down | 向下翻一页 |
| `Home` / `g` | scroll-to-top | 跳到顶部 |
| `End` / `G` | scroll-to-bottom | 跳到底部 |
| `q` / `Escape` | close | 关闭分页查看器 |
| `/` | search | 搜索文本 |
| `n` | search-next | 下一个搜索结果 |
| `N` | search-prev | 上一个搜索结果 |

分页查看器也默认支持 `j/k/g/G/q` 这些 Vim 风格的按键，不需要开启 Vim 模式。

---

## 5. 审批区快捷键

Codex 请求你批准某个操作时（比如执行一条 shell 命令、写入一个文件），会弹出审批提示。这个区域的快捷键设计得非常简洁——你只需要记住五个键。

### 5.1 审批提示（approval 上下文）

| 按键 | 动作 | 说明 |
|------|------|------|
| `y` / `Y` | approve | 批准当前操作 |
| `n` / `N` | reject | 拒绝当前操作 |
| `a` / `A` | approve-all | 批准当前及后续所有同类操作 |
| `Shift+A` | reject-all | 拒绝当前及后续所有同类操作 |
| `Escape` | cancel | 取消，回到输入框（不批准也不拒绝，暂停等待） |

**Y 和 A 的区别**：

- `Y`：只批准这一次操作。下次遇到类似操作，还会弹审批
- `A`：批准这一次，并且在当前会话内，后续所有同类操作都自动通过

举例：Codex 要执行 `npm test`。
- 按 `Y`：这次跑测试批准了。下次再跑 `npm test`，还要审批
- 按 `A`：这次跑测试批准了，之后所有 `npm test` 都自动通过

**什么时候按 A**：你信任 Codex 的操作模式后。比如你让它"跑测试并修复失败的用例"，你知道它会反复跑 `npm test`，第一次按 `A` 批准后续就不用管了。

**什么时候只按 Y**：你不确定 Codex 接下来会做什么。逐个审批给你更多控制。

**Shift+A（全部拒绝）** 用得少，但在 Codex 行为明显不对时有用——比如它开始修改你不希望它碰的目录，`Shift+A` 一次拦住所有后续同类操作。

---

## 6. 分屏和多会话快捷键

Codex TUI 支持多个 Agent 线程在同一个窗口中并发运行。管理和切换这些线程的快捷键：

| 按键 | 动作 | 说明 |
|------|------|------|
| `[` | prev-agent | 切换到上一个活跃线程 |
| `]` | next-agent | 切换到下一个活跃线程 |
| `Ctrl+T` | new-thread | 新建线程（同 open-transcript 的快捷键，上下文不同行为不同） |

**线程切换的实际体验**：

当你有多个活跃线程时（比如主线程 + 一个 `/fork` 出来的分支线程），`[` 和 `]` 在它们之间循环切换。切换后，TUI 的对话区域和输入框都切换到目标线程的上下文。底部的状态栏会更新显示当前线程的信息。

线程的状态指示器用彩色圆点表示：

| 颜色 | 状态 | 含义 |
|------|------|------|
| 绿色 | idle | 空闲，可以接受新指令 |
| 黄色 | running | 正在执行任务 |
| 红色 | awaiting-approval | 等待用户审批 |
| 灰色 | stopped | 已完成或暂停 |

你也可以用 `/agent` 命令弹出选择器来切换线程，但 `[` 和 `]` 键更快——不需要离开键盘去选。

---

## 7. Vim 模式快捷键

通过 `/vim` 命令或 `tui.vim_mode_default = true` 启用 Vim 模式后，Composer 编辑区获得 Vim 风格的模态编辑能力。

### 7.1 Vim Normal 模式（vim_normal 上下文）

Vim 模式默认激活时处于 Normal 模式。这个模式下的默认绑定：

| 按键 | 动作 | 说明 |
|------|------|------|
| `h` | move-left | 左移光标 |
| `j` | move-down | 下移光标 |
| `k` | move-up | 上移光标 |
| `l` | move-right | 右移光标 |
| `w` | word-forward | 跳到下一个单词开头 |
| `b` | word-backward | 跳到上一个单词开头 |
| `0` | line-start | 跳到行首 |
| `$` | line-end | 跳到行尾 |
| `gg` | buffer-start | 跳到编辑器开头 |
| `G` | buffer-end | 跳到编辑器末尾 |
| `i` | enter-insert | 在光标前进入插入模式 |
| `a` | enter-insert-after | 在光标后进入插入模式 |
| `A` | enter-insert-line-end | 在行尾进入插入模式 |
| `o` | open-below | 在下方新建一行并进入插入模式 |
| `O` | open-above | 在上方新建一行并进入插入模式 |
| `x` | delete-char | 删除光标处字符 |
| `dd` | delete-line | 删除整行 |
| `dw` | delete-word | 删除一个单词 |
| `yy` | yank-line | 复制整行 |
| `p` | paste-after | 在光标后粘贴 |
| `P` | paste-before | 在光标前粘贴 |
| `u` | undo | 撤销 |
| `Ctrl+R` | redo | 重做 |
| `ZZ` | save-and-submit | 保存并提交（类似 Vim 的 ZZ） |
| `Ctrl+C` | cancel | 取消编辑 |
| `v` | visual-mode | 进入字符选择模式 |
| `V` | visual-line-mode | 进入行选择模式 |

### 7.2 Vim Operator 等待模式（vim_operator 上下文）

按了 `d`、`c`、`y` 等操作符后，Codex 进入 operator 等待模式——等待你输入一个 motion 或 text object 来确定操作范围。

| 按键 | 动作 | 说明 |
|------|------|------|
| `d` | operator-delete | 等待 motion 后删除 |
| `c` | operator-change | 等待 motion 后修改（删除并进入插入模式） |
| `y` | operator-yank | 等待 motion 后复制 |
| `motion` | — | 执行 motion 后完成操作 |

示例操作链：
- `dw`：删除一个单词
- `dd`：删除整行
- `cw`：修改一个单词（删除后进入插入模式）
- `yy`：复制整行
- `d$`：删除到行尾
- `c0`：修改到行首

### 7.3 Vim 文本对象（vim_text_object 上下文）

文本对象是 Vim 的高级编辑特性，用于快速选择"一块内容"。

| 按键序列 | 选择范围 |
|---------|---------|
| `iw` | 当前单词（不含空格） |
| `aw` | 当前单词（含尾部空格） |
| `i"` | 双引号内的内容 |
| `a"` | 双引号内的内容含引号 |
| `i'` | 单引号内的内容 |
| `a'` | 单引号内的内容含引号 |
| `i(`` / `i)` | 括号内的内容 |
| `a(`` / `a)` | 括号内的内容含括号 |
| `i{`` / `i}` | 花括号内的内容 |
| `a{`` / `a}` | 花括号内的内容含花括号 |
| `i[` / `i]` | 方括号内的内容 |
| `a[` / `a]` | 方括号内的内容含方括号 |

配合操作符使用：`diw`（删除当前单词）、`ci"`（修改双引号内的内容）、`ya(`（复制括号内内容含括号）。

### 7.4 Vim 模式的局限

Codex TUI 的 Vim 模式不是完整的 Vim 实现。以下功能不支持：

- 不支持 `:ex` 命令模式（不能 `:w`、`:q`、`:%s` 等）
- 不支持宏录制（`q` + 寄存器）
- 不支持 marks（`m` + 字母）
- 不支持折叠（`zf`、`zo`、`zc`）
- 不支持窗口分割（`Ctrl+W` 系列）
- 不支持标签页（`:tabnew` 等）

这是一个"够用的 Vim 子集"。如果你需要完整的 Vim 能力来编辑长文本，更好的做法是配置外部编辑器：

```toml
[tui.keymap.global]
open_external_editor = "ctrl-e"
```

然后按 `Ctrl+E` 用你系统的 `$EDITOR`（Vim、Neovim 等）编辑内容，完成后自动回填到 Codex 输入框。

---

## 8. 自定义键位绑定

### 8.1 配置格式

快捷键自定义写在 `~/.codex/config.toml` 的 `[tui.keymap]` 区块下，按上下文分组：

```toml
[tui.keymap.global]
open_transcript = "ctrl-t"
open_external_editor = []   # 空数组 = 解除绑定

[tui.keymap.composer]
submit = ["enter", "ctrl-m"]  # 可以绑定多个键到同一个动作
new_line = "shift-enter"

[tui.keymap.chat]
interrupt_turn = "f12"

[tui.keymap.approval]
approve = "y"
approve_all = "a"

[tui.keymap.pager]
scroll_up = "ctrl-k"
scroll_down = "ctrl-j"

[tui.keymap.list]
select = "enter"
cancel = "escape"

[tui.keymap.vim_normal]
save_and_submit = "zz"
cancel = "ctrl-c"

[tui.keymap.vim_operator]
# 通常不需要改

[tui.keymap.vim_text_object]
# 通常不需要改
```

### 8.2 支持的按键名

Codex 使用规范化的按键名字符串。以下是完整的按键名列表：

**修饰键组合**：

| 格式 | 示例 |
|------|------|
| `ctrl-<key>` | `ctrl-a`、`ctrl-enter`、`ctrl-up` |
| `alt-<key>` | `alt-r`、`alt-enter`、`alt-up` |
| `shift-<key>` | `shift-tab`、`shift-enter`、`shift-a` |

**功能键**：`f1` 到 `f12`

**特殊键**：

| 按键名 | 说明 |
|--------|------|
| `enter` | 回车 |
| `escape` | Esc |
| `tab` | Tab |
| `backspace` | 退格 |
| `delete` | Delete |
| `insert` | Insert |
| `space` | 空格 |

**方向键**：

| 按键名 | 说明 |
|--------|------|
| `up` | 上 |
| `down` | 下 |
| `left` | 左 |
| `right` | 右 |

**翻页键**：

| 按键名 | 说明 |
|--------|------|
| `page-up` | 上翻页 |
| `page-down` | 下翻页 |
| `home` | Home |
| `end` | End |

**符号键**（用名称而非符号本身）：

| 按键名 | 说明 |
|--------|------|
| `minus` | - |
| `equals` | = |
| `left-bracket` | [ |
| `right-bracket` | ] |
| `backslash` | \ |
| `semicolon` | ; |
| `quote` | ' |
| `comma` | , |
| `period` | . |
| `slash` | / |

### 8.3 多键绑定

一个动作可以绑定到多个按键。用数组格式：

```toml
[tui.keymap.composer]
submit = ["enter", "ctrl-m"]  # Enter 或 Ctrl+M 都能提交
```

两个键都触发同一个动作。这在你想保留默认键的同时加一个替代键时有用。

### 8.4 解除绑定

把按键设为空数组即可解除绑定：

```toml
[tui.keymap.global]
open_external_editor = []  # 这个动作不再有任何快捷键
```

解除后，这个动作只能通过菜单或斜杠命令触发，不能通过按键触发。

### 8.5 Composer 的回退机制

Composer 上下文有一个特殊的回退规则：如果某个 action 在 `composer` 里没定义，它会去 `global` 里找同名 action。

利用这个机制，你可以把通用快捷键放在 `global` 里，只在 `composer` 里覆盖需要特殊处理的那些：

```toml
[tui.keymap.global]
copy_response = "ctrl-o"      # 全局：Ctrl+O 复制响应

[tui.keymap.composer]
# composer 里不需要重新定义 copy_response，
# 因为它会回退到 global 的定义
new_line = "shift-enter"       # composer 特有：Shift+Enter 换行
submit = "enter"               # composer 特有：Enter 提交
```

### 8.6 冲突处理

如果你把同一个按键绑到了同一个上下文的两个不同 action，Codex 会用后定义的那个。配置文件中同一表内后面的条目覆盖前面的。

如果两个上下文都对同一个按键有绑定，优先级遵循三层解析规则：当前上下文 > global > 内置默认。

建议不要跨上下文制造冲突。比如不要在 `chat` 里把 `Enter` 绑到 `scroll-down`，又在 `composer` 里把 `Enter` 绑到 `submit`——虽然技术上行得通（两个上下文各自解释），但你的大脑需要在不同场景下记住不同的行为，容易按错。

---

## 9. 常见自定义方案

下面给出三套完整的键位配置方案，可以直接复制到 `~/.codex/config.toml` 的 `[tui]` 段使用。

### 9.1 方案一：IDE 风格

适合从 VS Code / JetBrains 转过来的开发者。核心改变：Enter 换行、Ctrl+Enter 提交、Ctrl+S 保存并提交。

```toml
[tui]
vim_mode_default = false
theme = "one-dark"
status_line = ["model-with-reasoning", "context-remaining", "git-branch"]

[tui.keymap.composer]
submit = "ctrl-enter"
new_line = "enter"

[tui.keymap.chat]
submit = "ctrl-enter"
new_line = "shift-enter"

[tui.keymap.global]
open_transcript = "ctrl-t"
open_external_editor = "ctrl-e"

[tui.keymap.pager]
scroll_up = "ctrl-up"
scroll_down = "ctrl-down"
close = "escape"
```

这套方案的逻辑：
- 所有提交操作统一用 `Ctrl+Enter`，和 Slack、Discord、VS Code 的聊天面板一致
- 单行输入框里 `Shift+Enter` 换行（因为单行框里直接按 Enter 的体验已经被改了）
- 分页查看器用 `Ctrl+Up/Down` 滚动，不和主对话区的方向键冲突

### 9.2 方案二：Vim 风格

适合 Vim / Neovim 重度用户。开启 Vim 模式，调整几个常用操作到更顺手的键位。

```toml
[tui]
vim_mode_default = true
theme = "gruvbox-dark"
status_line = ["model-with-reasoning", "context-remaining"]
animations = false
show_tooltips = false

[tui.keymap.global]
open_transcript = "ctrl-t"
open_external_editor = "ctrl-e"

[tui.keymap.composer]
submit = "ctrl-enter"
new_line = "enter"

[tui.keymap.vim_normal]
save_and_submit = "zz"
cancel = "ctrl-c"
enter_insert = "i"
enter_insert_after = "a"
enter_insert_line_end = "A"
open_below = "o"
open_above = "O"

[tui.keymap.pager]
scroll_up = "k"
scroll_down = "j"
scroll_to_top = "g"
scroll_to_bottom = "G"
close = "q"

[tui.keymap.list]
prev = "k"
next = "j"
select = "enter"
cancel = "escape"

[tui.keymap.approval]
approve = "y"
reject = "n"
approve_all = "a"
```

这套方案的逻辑：
- 默认 Vim 模式，composer 编辑区用 hjkl 移动
- `ZZ` 保存并提交（经典 Vim 键位）
- Pager 和 List 也用 j/k 导行（虽然默认就支持，这里显式声明确保不被覆盖）
- 关闭动画和提示，减少视觉干扰

### 9.3 方案三：单手操作优化

适合左手在键盘、右手在鼠标的场景。把常用操作集中到键盘左半部分，减少右手离开鼠标的次数。

```toml
[tui]
vim_mode_default = false
theme = "nord"
status_line = ["model-with-reasoning", "context-remaining"]

[tui.keymap.composer]
submit = "ctrl-enter"
new_line = "enter"

[tui.keymap.chat]
interrupt_turn = "ctrl-q"
copy_response = "ctrl-w"

[tui.keymap.global]
open_transcript = "ctrl-t"
open_external_editor = "ctrl-e"

[tui.keymap.pager]
scroll_up = "ctrl-w"
scroll_down = "ctrl-s"
close = "ctrl-q"

[tui.keymap.approval]
approve = "f"
reject = "d"
approve_all = "a"
```

这套方案的逻辑：
- 所有核心操作都在 Ctrl 组合键或左手区域（Q/W/E/R/A/S/D/F）
- 审批区用 `F`（批准）和 `D`（拒绝），右手不用离开鼠标
- `Ctrl+Q` 中断，`Ctrl+W` 向上滚动，`Ctrl+S` 向下滚动——这三个键在左手舒适区
- 提交仍然用 `Ctrl+Enter`，因为 Enter 在右手区但使用频率高，值得移动一下

### 9.4 重置所有自定义

如果你想清除所有自定义键位，恢复到 Codex 的默认设置，删除 config.toml 中的整个 `[tui.keymap]` 段即可：

```toml
# 删除以下整个区块
# [tui.keymap]
# [tui.keymap.composer]
# [tui.keymap.chat]
# ...
```

保存后重启 Codex，所有键位回到默认值。

---

## 10. 快捷键速查表

以下是一个完整的速查大表，包含所有上下文的默认绑定。按上下文分组，方便打印贴在显示器旁边。

### 10.1 全局快捷键（global）

| 按键 | 动作 | 说明 |
|------|------|------|
| `Ctrl+C` | interrupt / quit | 中断任务（执行中）；退出 TUI（空闲时连续按两次） |
| `Ctrl+L` | clear-screen | 清屏（只清视觉，不重置对话） |
| `Ctrl+T` | open-transcript | 打开完整对话转录 |
| `Ctrl+E` | open-external-editor | 用外部编辑器编辑输入 |
| `Ctrl+O` | copy-response | 复制最近完成的模型输出 |
| `Alt+R` | toggle-raw | 切换原始滚动模式 |
| `[` | prev-agent | 切换到上一个 Agent 线程 |
| `]` | next-agent | 切换到下一个 Agent 线程 |

### 10.2 输入框（chat / composer）

| 按键 | 动作 | 上下文 |
|------|------|--------|
| `Enter` | submit | chat, composer |
| `Shift+Enter` | newline | composer |
| `Tab` | auto-complete / indent | chat / composer |
| `Escape` | cancel | chat, composer |
| `Ctrl+A` | move-to-start | chat |
| `Ctrl+E` | move-to-end | chat |
| `Ctrl+K` | kill-to-end | chat |
| `Ctrl+U` | kill-to-start | chat |
| `Ctrl+W` | delete-word-back | chat |
| `Up` | history-prev | chat |
| `Down` | history-next | chat |
| `Backspace` | delete-back | chat, composer |
| `Delete` | delete-forward | chat, composer |
| `Ctrl+Z` | undo | composer |
| `Ctrl+Shift+Z` | redo | composer |

### 10.3 导航

| 按键 | 动作 | 上下文 |
|------|------|--------|
| `Up` / `k` | scroll-up / prev | chat, pager, list |
| `Down` / `j` | scroll-down / next | chat, pager, list |
| `PgUp` | page-up | chat, pager, list |
| `PgDn` | page-down | chat, pager, list |
| `Home` / `g` | scroll-to-top / first | chat, pager, list |
| `End` / `G` | scroll-to-bottom / last | chat, pager, list |
| `/` | search | pager, list |
| `n` | search-next | pager |
| `N` | search-prev | pager |
| `q` / `Escape` | close | pager |
| `Enter` | select | list |
| `Space` / `Tab` | toggle | list |

### 10.4 审批（approval）

| 按键 | 动作 | 说明 |
|------|------|------|
| `Y` / `y` | approve | 批准当前操作 |
| `N` / `n` | reject | 拒绝当前操作 |
| `A` / `a` | approve-all | 批准当前及后续同类操作 |
| `Shift+A` | reject-all | 拒绝当前及后续同类操作 |
| `Escape` | cancel | 取消审批，暂停等待 |

### 10.5 Vim 模式（vim_normal）

| 按键 | 动作 |
|------|------|
| `h` / `j` / `k` / `l` | 移动光标 |
| `w` / `b` | 跳词 |
| `0` / `$` | 行首 / 行尾 |
| `gg` / `G` | 文首 / 文末 |
| `i` / `a` / `A` / `o` / `O` | 进入插入模式（不同位置） |
| `x` | 删除字符 |
| `dd` | 删除行 |
| `dw` | 删除单词 |
| `yy` | 复制行 |
| `p` / `P` | 粘贴 |
| `u` | 撤销 |
| `Ctrl+R` | 重做 |
| `ZZ` | 保存并提交 |
| `v` / `V` | 进入选择模式 |
| `Escape` | 回到 normal 模式 |

### 10.6 线程管理

| 按键 | 动作 | 说明 |
|------|------|------|
| `[` | prev-agent | 上一个线程 |
| `]` | next-agent | 下一个线程 |
| `/agent` | agent-selector | 弹出线程选择器 |
| `/fork` | fork-thread | 分叉当前线程 |
| `/side` | side-conversation | 开临时侧对话 |
| `/new` | new-thread | 新建线程 |
| `/quit` | quit | 保存并退出 |

---

## 11. 外部编辑器集成

除了 TUI 内置的编辑能力，Codex 支持用你自己的编辑器来编辑输入内容。

### 11.1 触发方式

按 `Ctrl+E`（默认绑定，可通过 `open_external_editor` 自定义），Codex 会调用系统的 `$EDITOR` 环境变量指定的编辑器。

```bash
# 设置外部编辑器为 Neovim
export EDITOR="nvim"

# 设置为 VS Code
export EDITOR="code --wait"

# 设置为 Vim
export EDITOR="vim"
```

编辑器打开后，你会看到一个临时文件，里面是当前输入框的内容。编辑完成后保存退出，Codex 自动读取文件内容并回填到输入框。

### 11.2 适用场景

- 输入很长的提示词（超过 10 行），需要仔细编辑
- 需要用到复杂的 Vim 操作（宏、正则替换等）
- 从其他文件粘贴大段内容到输入框
- 编写包含大量特殊字符的指令

### 11.3 注意事项

- 编辑器必须支持 `--wait` 模式或者同步阻塞模式。`code`（VS Code）需要加 `--wait` 参数
- 编辑器关闭后，Codex 才会继续。如果你用 VS Code 不加 `--wait`，Codex 会读到空文件
- 如果 `$EDITOR` 没设置，Codex 会尝试 `vim`，然后 `nano`，然后 `vi`

---

## 12. 常见问题

### 为什么某个快捷键不生效？

排查步骤：

1. 确认你在正确的上下文里。`Ctrl+Enter` 在 composer 里是换行（如果你自定义了），但在 chat 里可能没定义
2. 检查终端模拟器是否拦截了该按键。iTerm2 默认会拦截某些快捷键（比如 `Ctrl+Left`），需要在 iTerm2 的 Key 设置里改为"Send Escape Sequence"
3. 检查 tmux 或 screen 是否拦截。tmux 的前缀键默认是 `Ctrl+B`，可能和你的自定义冲突
4. 用 `/keymap <上下文>` 查看当前上下文的实际绑定，确认你的自定义生效了

### 在 SSH 会话里某些按键不生效？

SSH 会话的按键传输受终端模拟器和 SSH 客户端的共同影响。常见问题：

- 功能键（F1-F12）：某些 SSH 配置不传输功能键的转义序列
- Alt 组合键：取决于终端模拟器是否把 Alt 当作 Meta 键发送
- Ctrl+方向键：某些终端发送的转义序列不被 crossterm 正确解析

解决方案：用 `ctrl-` 组合键和字母键的组合代替功能键。比如用 `ctrl-q` 代替 `f12`。

### 改了快捷键后 Codex 行为异常？

删除 `[tui.keymap]` 段，重启 Codex，看问题是否消失。如果消失了，说明你的自定义有问题——可能是冲突绑定或者按键名拼写错误。逐步加回自定义配置，每次加一条，定位问题。

### Vim 模式和默认快捷键冲突吗？

Vim 模式只影响 `vim_normal`、`vim_operator`、`vim_text_object` 三个上下文。这三个上下文只在 Composer 编辑器里激活。其他区域（聊天输入框、列表选择器、审批提示）不受 Vim 模式影响。

### 可以完全禁用 Vim 模式吗？

可以。确保 `tui.vim_mode_default = false`，并且不在 TUI 里执行 `/vim` 命令。这样 Vim 相关的三个上下文永远不会激活。

---

## 延伸阅读

- [Codex CLI 官方配置参考](https://developers.openai.com/codex/config-reference) — `tui.keymap` 配置项的完整文档
- [Codex CLI 示例配置](https://developers.openai.com/codex/config-sample) — 可直接复制的键位配置模板
- [Codex TUI 源码](https://github.com/openai/codex/tree/main/codex-rs/tui) — 快捷键处理和上下文解析的实现
- [crossterm 按键事件文档](https://docs.rs/crossterm/latest/crossterm/event/struct.KeyEvent.html) — 按键事件的底层库文档
- 本系列第 21 篇：[个性化与 UI 命令](./21-cmd-ui.md) — /keymap、/vim 等命令详解
- 本系列第 25 篇：[TUI 配置](./25-config-tui.md) — config.toml 中所有 TUI 配置项详解
- 本系列第 16 篇：[会话控制命令](./16-cmd-session.md) — 线程管理和命令排队
- 本系列第 67 篇：[命令速查表](./67-command-cheatsheet.md) — 所有斜杠命令的快速参考

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
