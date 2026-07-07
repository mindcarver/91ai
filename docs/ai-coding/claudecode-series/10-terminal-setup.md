# 终端配置：让 Claude Code 用着更顺手

> 更新日期：2025/06

**TL;DR：** Claude Code 在任何终端里都能跑，但配好 Shift+Enter 换行、通知提醒、Vim 编辑模式这几项后，体验差别很大。本文按「遇到什么问题就调什么」的方式组织，不需要一次性全配。

## 推荐终端

Claude Code 不挑终端，但不同终端对快捷键的支持程度不一样。核心差异在于 Shift+Enter 换行是否开箱即用。

**开箱即用（不需要额外配置）**：iTerm2、WezTerm、Ghostty、Kitty、Warp、Apple Terminal、Windows Terminal。

**需要跑一次 `/terminal-setup`**：VS Code 集成终端、Cursor、Alacritty、Zed。

**不支持 Shift+Enter**：gnome-terminal、JetBrains IDE 内置终端（PyCharm、Android Studio 等）。在这些终端里用 `Ctrl+J` 或 `\` + 回车代替。

选终端的原则很简单：如果你现在用的终端没出问题，就不用换。如果经常遇到快捷键不生效或显示闪烁，再对照上面的列表换一个。

## 输入和编辑配置

### 多行输入

Claude Code 里按回车是发送消息。想在消息里换行，有以下方式：

| 方式 | 操作 | 适用场景 |
|------|------|---------|
| 反斜杠转义 | `\` + 回车 | 所有终端通用，最保险 |
| Shift+Enter | 直接按 | iTerm2 等原生支持的终端 |
| Ctrl+J | 直接按 | 所有终端通用 |
| Option+Enter | macOS 需先开 Option as Meta | 习惯 Mac 键位的用户 |
| 粘贴 | 直接粘贴多行文本 | 贴代码或日志 |

对于 VS Code、Alacritty、Zed 这类终端，在 Claude Code 里运行一次 `/terminal-setup` 就能启用 Shift+Enter。这个命令会修改终端的配置文件，运行时要在宿主终端里跑，不要在 tmux 或 screen 里面跑——否则它改的是错误的配置文件。

`/terminal-setup` 在 VS Code 和 Cursor 里还会顺带做两件事：关掉 GPU 加速（防止终端里出乱码）和调低鼠标滚轮灵敏度（让全屏模式下滚动更顺滑）。如果之后想恢复 GPU 加速，在 VS Code 设置里把 `terminal.integrated.gpuAcceleration` 改回 `"auto"` 就行。

### Option as Meta（macOS）

macOS 上有些快捷键用到 Option 键（比如 Option+Enter 换行、Option+P 切模型），但多数终端默认不把 Option 当修饰键。需要手动开一下：

**Apple Terminal**：设置 → 描述文件 → 键盘 → 勾选「Use Option as Meta Key」。如果你在首次启动 Claude Code 时接受了配置提示，这个已经帮你开了。

**iTerm2**：设置 → Profiles → Keys → General → 把 Left Option 和 Right Option 都改成 `Esc+`。运行 `/terminal-setup` 还会自动开启剪贴板访问，让 `/copy` 命令能写到系统剪贴板。改完需要重启 iTerm2。

**VS Code**：在设置里加上 `"terminal.integrated.macOptionIsMeta": true`。

### Vim 编辑模式

如果你习惯 Vim 键位，可以在输入框里开启 Vim 模式。两种方式：

1. 在 Claude Code 里输入 `/config`，选 Editor mode，改成 `vim`
2. 或者在 `~/.claude/settings.json` 里加：

```json
{
  "editorMode": "vim"
}
```

开启后，输入框支持常用的 NORMAL 和 VISUAL 模式操作：`hjkl` 移动、`v`/`V` 选择、`d`/`c`/`y` 配合文本对象。但有一点和标准 Vim 不同：在 INSERT 模式下按回车是发送消息，不是换行。要换行用 NORMAL 模式下的 `o`/`O`，或者 `Ctrl+J`。

Vim 模式下，Esc 键用来切换 INSERT 和 NORMAL 模式，不会触发取消操作。大多数 Ctrl+快捷键仍然正常工作。在 NORMAL 模式下按 `?` 可以看到帮助。

想关掉 Vim 模式，回到 `/config` 把 Editor mode 改回 `normal`。

## 快捷键参考

日常最常用的快捷键，按使用频率排序：

| 快捷键 | 作用 |
|--------|------|
| 回车 | 发送消息 |
| Ctrl + C | 中断当前操作；没有操作时清空输入 |
| Ctrl + D | 退出 Claude Code |
| Esc | 打断 Claude 正在进行的回复 |
| Esc + Esc | 输入有内容时清空输入；输入为空时打开历史会话菜单 |
| Ctrl + O | 打开详细日志视图，看工具调用过程 |
| Ctrl + L | 重绘屏幕（显示乱掉时用） |
| Ctrl + R | 搜索历史输入 |
| Shift + Tab | 切换权限模式 |
| Tab | 接受灰色的自动建议 |

想自定义快捷键绑定，编辑 `~/.claude/keybindings.json`。详细的 keybindings 配置见官方文档的 [Keybindings](https://code.claude.com/docs/en/keybindings) 页面。

## 通知提醒

Claude Code 执行一个长任务时，你可能切到别的窗口干活。配好通知后，它完成时会提醒你回来。

### 默认行为

默认情况下，只有 Ghostty、Kitty、iTerm2 会收到桌面通知。其他终端什么都不提示。

### 开启终端铃声

最通用的方式：在 Claude Code 里运行 `/config`，找到 Notifications，改成 `terminal_bell`。这样任何终端都会在任务完成时响铃。

或者手动在 `~/.claude/settings.json` 里设置：

```json
{
  "preferredNotifChannel": "terminal_bell"
}
```

### 自定义声音（macOS）

想要更明确的提示音，可以用 hooks 配置一个通知命令：

```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          { "type": "command", "command": "afplay /System/Library/Sounds/Glass.aiff" }
        ]
      }
    ]
  }
}
```

这段配置放在 `~/.claude/settings.json` 里。macOS 系统自带的音效文件在 `/System/Library/Sounds/` 目录下，可以换成你喜欢的，比如 `Ping.aiff`、`Hero.aiff`。

Linux 和 Windows 也可以用类似的思路配置，换成各自系统的通知命令就行。

## tmux 兼容

在 tmux 里用 Claude Code 时，两个东西会坏：Shift+Enter 不能换行（变成直接发送），桌面通知和进度条传不到外层终端。

解决方法是在 `~/.tmux.conf` 里加三行：

```bash
set -g allow-passthrough on
set -s extended-keys on
set -as terminal-features 'xterm*:extkeys'
```

然后让配置生效：

```bash
tmux source-file ~/.tmux.conf
```

- `allow-passthrough` 让通知和进度条穿透 tmux 到达外层终端
- `extended-keys` 和 `terminal-features` 让 tmux 区分 Shift+Enter 和普通回车

这三行只影响 tmux 的行为，不会改动 Claude Code 本身的配置。

## 主题和外观

### 切换主题

Claude Code 的主题颜色可以跟终端匹配。在 Claude Code 里输入 `/theme` 或者在 `/config` 里的主题选择器里选。

选 `auto` 会自动检测你的终端是浅色还是深色背景，跟着变化。Claude Code 的主题不会改变终端本身的配色方案——那个由终端应用自己控制。

### 自定义主题

内置主题不满足的话，可以自己做。在 `/theme` 里选「New custom theme...」可以交互式创建，或者直接在 `~/.claude/themes/` 目录下写 JSON 文件：

```json
{
  "name": "Dracula",
  "base": "dark",
  "overrides": {
    "claude": "#bd93f9",
    "error": "#ff5555",
    "success": "#50fa7b"
  }
}
```

- `name`：在 `/theme` 里显示的名字
- `base`：基于哪个内置主题，可选 `dark`、`light`、`dark-daltonized`（色盲友好）、`light-daltonized`、`dark-ansi`、`light-ansi`
- `overrides`：覆盖的颜色 token，没写的用 base 里的值

常用的颜色 token：`claude`（品牌色/加载动画）、`text`（正文）、`error`、`success`、`warning`、`diffAdded`/`diffRemoved`（代码差异）、`promptBorder`（输入框边框）、`planMode`（计划模式标识）。完整的 token 列表在 `/theme` 的交互式编辑器里能看到，有实时预览。

颜色值支持 `#rrggbb`、`#rgb`、`rgb(r,g,b)`、`ansi256(n)` 和 ANSI 颜色名。写错了不会崩，会自动忽略。

`~/.claude/themes/` 目录下的文件被 Claude Code 实时监听，编辑后不用重启就能生效。

### 显示闪烁或滚动跳变

如果 Claude Code 运行时画面闪烁或者滚动位置乱跳，切到全屏渲染模式：

```bash
claude  # 先正常启动
# 在 Claude Code 里输入：
/tui fullscreen
```

全屏渲染模式用终端保留的全屏画布来绘制，不会往滚动缓冲区追加内容，内存占用也更稳定。想默认就用全屏模式，设置环境变量：

```bash
export CLAUDE_CODE_NO_FLICKER=1
```

## 关键要点

- Shift+Enter 不生效时，优先试 `\` + 回车或 `Ctrl+J`，所有终端通用
- macOS 用户记得开 Option as Meta，不然带 Option 键的快捷键全部失效
- 在 tmux 里用 Claude Code，必须加那三行 tmux 配置
- 通知很重要——跑长任务时配好 `terminal_bell` 或声音提醒，不用一直盯着终端
- Vim 模式适合 Vim 用户，但注意回车行为和标准 Vim 不同
- 主题用 `/theme` 调，选 `auto` 省心；自定义主题写到 `~/.claude/themes/` 目录下

## 延伸阅读

- [系列第 06 篇：安装方式大全](06-installation-guide.md) — 安装时的终端要求
- [系列第 14 篇：交互模式入门](14-interactive-mode-getting-started.md) — 交互模式的完整操作指南
- [Claude Code 官方终端配置文档](https://code.claude.com/docs/en/terminal-config)
- [Claude Code Keybindings 文档](https://code.claude.com/docs/en/keybindings)
- [450+ iTerm2 配色方案](https://github.com/mbadolato/iterm2-color-schemes)
