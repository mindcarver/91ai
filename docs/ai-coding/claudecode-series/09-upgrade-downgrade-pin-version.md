# 升级、降级和固定版本：管理 Claude Code 的版本

> 更新日期：2025/06

**TL;DR：** 原生安装的用户大部分时候不用管版本——后台自动更新。想控制节奏，可以切到 stable 通道（晚一周，跳过有问题的版本）。需要降级或锁版本，有 `minimumVersion`、原生安装脚本指定版本号、npm `@版本号` 三条路。Homebrew 和 WinGet 用户需要手动触发更新。

## 升级到最新版

不同安装方式，升级命令不一样。

### 原生安装（curl / irm）

原生安装默认开启了后台自动更新。Claude Code 启动时会检查新版本，运行中也会定期检查，下载和安装都在后台完成，下次启动时生效。

如果你想立刻更新，不等后台检查：

```bash
claude update
```

想看看最近一次更新有没有成功：

```bash
claude doctor
```

`claude doctor` 的输出里会告诉你上次更新的结果。

### Homebrew

Homebrew 安装不会自动更新，需要你手动跑：

```bash
# 如果你装的是稳定版
brew upgrade --cask claude-code

# 如果你装的是滚动更新版
brew upgrade --cask claude-code@latest
```

两个 cask 对应两个更新通道，`claude-code` 跟 stable，`claude-code@latest` 跟 latest。如果你不确定自己装的是哪个，跑一下 `brew list --cask | grep claude` 看看。

### WinGet

```powershell
winget upgrade Anthropic.ClaudeCode
```

WinGet 没有通道选择，只有一个包。

### Linux 包管理器

用 apt、dnf、apk 装的，走系统更新流程：

```bash
# apt
sudo apt update && sudo apt upgrade claude-code

# dnf
sudo dnf upgrade claude-code

# apk
apk update && apk upgrade claude-code
```

这些包管理器安装的版本不会通过 Claude Code 自身更新，完全依赖你的系统更新节奏。

### npm

```bash
npm install -g @anthropic-ai/claude-code@latest
```

注意别用 `npm update -g`。`npm update` 会遵守原始安装时的 semver 范围，可能不会把你拉到真正的最新版。`npm install -g ...@latest` 才是强制拉最新的写法。

## Stable vs Latest 通道

Claude Code 有两个发布通道：

| 通道 | 更新频率 | 适合谁 |
|------|----------|--------|
| **latest**（默认） | 新版本发布即推送 | 想第一时间用新功能的人 |
| **stable** | 比 latest 晚约一周，跳过有重大回退的版本 | 追求稳定、不想踩坑的人 |

### 怎么切换

在 Claude Code 里用 `/config` 命令，找到 "Auto-update channel" 选项，改成 `stable` 或 `latest`。

或者直接改 `settings.json`：

```json
{
  "autoUpdatesChannel": "stable"
}
```

改成 stable 后，后台自动更新和 `claude update` 都只会拉 stable 通道的版本。

**Homebrew 用户注意**：Homebrew 不走这个设置。你选哪个 cask 就是哪个通道——`claude-code` 是 stable，`claude-code@latest` 是 latest。想换通道，卸掉重装另一个 cask。

**企业场景**：管理员可以在 managed settings 里强制指定通道，用户改不了。

## 降级到特定版本

为什么要降级？最常见的原因是新版本出了 bug，影响了你的工作流。或者某个 MCP 服务器和新版本不兼容。

### 原生安装降级

用安装脚本指定版本号：

```bash
# macOS / Linux / WSL
curl -fsSL https://claude.ai/install.sh | bash -s 2.1.89

# Windows PowerShell
& ([scriptblock]::Create((irm https://claude.ai/install.ps1))) 2.1.89

# Windows CMD
curl -fsSL https://claude.ai/install.cmd -o install.cmd && install.cmd 2.1.89 && del install.cmd
```

版本号格式是 `主.次.补丁`，比如 `2.1.89`。可以去 [npm 页面](https://www.npmjs.com/package/@anthropic-ai/claude-code) 查历史版本列表。

### npm 安装降级

```bash
npm install -g @anthropic-ai/claude-code@2.1.89
```

如果 npm 全局目录没有写权限，前面加 `sudo`。但更推荐用 nvm 管理 Node.js，避免权限问题。

一个常见坑：如果你是 Homebrew 安装的，但后来又用 npm 装了一次，可能会出现两个 `claude`。降级前先确认你在用的是哪个：

```bash
which claude
```

### 降级后会发生什么

只有二进制文件被替换。以下内容完全不受影响：

- `~/.claude/settings.json`（你的设置）
- `~/.claude/projects/`（项目数据）
- API 密钥和认证信息
- MCP 服务器配置
- 历史记录和待办

降级完跑一下验证：

```bash
claude --version
claude --help
```

## 固定版本

有时候你需要"锁死"在某个版本上，比如：

- 团队统一版本，避免不同人用不同版本产生差异
- 某个版本经过验证，不想被意外更新
- CI/CD 环境需要可复现的版本

### 方法一：minimumVersion

`minimumVersion` 是一个"地板"设置。自动更新和 `claude update` 都不会安装低于这个版本号的版本。

```json
{
  "autoUpdatesChannel": "stable",
  "minimumVersion": "2.1.100"
}
```

注意：`minimumVersion` 是地板，不是天花板。它防止降级，但不阻止升级。如果你需要完全锁死在某个版本，看方法二。

一个细节：在 `/config` 里从 latest 切到 stable 时，如果你当前版本比 stable 最新版还新，系统会问你要留在当前版本还是允许降级。选"留在当前版本"会自动设置 `minimumVersion`。

### 方法二：关闭自动更新

```json
{
  "env": {
    "DISABLE_AUTOUPDATER": "1"
  }
}
```

`DISABLE_AUTOUPDATER` 只关掉后台自动检查，`claude update` 手动更新仍然可用。

如果你想彻底禁止一切更新（包括手动），用 `DISABLE_UPDATES`：

```json
{
  "env": {
    "DISABLE_UPDATES": "1"
  }
}
```

企业内部分发场景下，`DISABLE_UPDATES` 比较实用——你控制版本，用户不能自己升级。

### 方法三：安装时指定版本

原生安装时直接装指定版本，安装脚本会把它当成默认版本：

```bash
curl -fsSL https://claude.ai/install.sh | bash -s 2.1.89
```

再配合 `DISABLE_AUTOUPDATER` 或 `DISABLE_UPDATES`，版本就锁住了。

### Homebrew 用户锁版本

Homebrew 的 cask 机制不直接支持锁版本。两个办法：

1. 切到 npm 安装，用 npm 的 `@版本号` 语法固定
2. 关掉自动更新，手动控制在哪个版本

GitHub 上有人写了[一个脚本](https://gist.github.com/marceldarvas/9e10fd41d608bdb1ba277b7f989b4763)，可以绕过 Homebrew 用 npm 锁版本，需要的时候再切回来。

## 版本管理最佳实践

### 什么时候该升

- 安全修复发布时——这类更新通常不引入行为变化
- 你遇到了已知 bug，而新版修复了它
- 新版本包含你需要的功能

### 什么时候该等

- 正在赶 deadline，版本更新不是当务之急
- 新版本刚出，社区还没反馈——等一两天看看 Reddit 或 GitHub Issues
- 你用的是 stable 通道，已经在替你过滤了，不用额外担心

### 实用建议

- 跑 `claude --version` 是第一步。不管遇到什么奇怪问题，先确认版本号
- 记录你的工作版本。当某个版本用得顺手时，把版本号记下来。万一升级出问题，你能快速回退
- 团队项目在 `settings.json` 里统一通道和 `minimumVersion`
- CI/CD 环境用 `DISABLE_UPDATES` + 固定版本号，保证可复现

## 常见问题

**Q：降级后，原来的配置会丢吗？**

不会。版本切换只替换二进制文件，`~/.claude/` 下的所有设置、项目数据、认证信息都不受影响。

**Q：`claude update` 报权限错误怎么办？**

npm 全局安装可能遇到这个问题。两个解法：用 nvm 管理 Node.js（推荐），或者修复 npm 全局目录权限。原生安装不会有这个问题。

**Q：Homebrew 的 `claude-code` 和 `claude-code@latest` 能同时装吗？**

不能。卸掉一个再装另一个。

**Q：怎么查所有历史版本？**

去 [npm 上的 @anthropic-ai/claude-code 页面](https://www.npmjs.com/package/@anthropic-ai/claude-code)，"Versions" 标签下列出了所有发布过的版本。

**Q：stable 通道的版本一定比 latest 旧吗？**

不一定。如果某个 latest 版本没有重大回退，stable 可能和 latest 相同。stable 的意义是跳过有问题的版本，不是故意延迟。

## 关键要点

- **原生安装自带自动更新**，大部分情况不用手动干预
- **stable 通道**比 latest 晚约一周，自动跳过有回退的版本，适合不想折腾的人
- **降级**用安装脚本加版本号：`bash -s 2.1.89`，或 npm 的 `@版本号`
- **锁版本**三条路：`minimumVersion` 防降级、`DISABLE_AUTOUPDATER` 关自动更新、`DISABLE_UPDATES` 禁止一切更新
- **换版本不影响配置**：设置、项目、认证都在 `~/.claude/` 里，二进制文件换了它们不会动

## 延伸阅读

- [Claude Code 官方安装与更新文档](https://code.claude.com/docs/en/setup)
- [Claude Code 安装方式大全](./06-installation-guide.md)
- [npm 上的版本列表](https://www.npmjs.com/package/@anthropic-ai/claude-code)
- [Claude Code 到底是什么](./01-what-is-claude-code.md)

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
