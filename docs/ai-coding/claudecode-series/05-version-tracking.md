# Claude Code 版本和更新怎么跟踪

> 更新日期：2025/06

**TL;DR：** `claude --version` 看版本号，`claude update` 手动更新。两个通道：stable（稳定，晚一周，跳过有问题的版本）和 latest（最新，第一时间拿到新功能）。追踪更新来源看官方 changelog、`/release-notes` 命令、npm 页面。Homebrew 按 cask 名选通道，需要手动 `brew upgrade`。遇到版本差异问题，先查通道再查 changelog。

## 版本通道：stable vs latest

Claude Code 发布走两个通道：

| 通道 | 特点 | 适合谁 |
|------|------|--------|
| stable | 比 latest 晚约一周，自动跳过有严重退化的版本 | 生产环境、团队统一部署、不想踩坑 |
| latest | 新版本发布即推送 | 想尝鲜、愿意承担小概率 bug 的个人用户 |

选通道的方式取决于你的安装方式：

- **原生安装（curl / irm）**：默认 `latest`。通过 `autoUpdatesChannel` 设置或 `/config` 命令切换。
- **Homebrew**：cask 名就是通道。`claude-code` 对应 stable，`claude-code@latest` 对应 latest。想换通道得卸掉重装。
- **npm**：没有通道概念。`npm install -g @anthropic-ai/claude-code@latest` 拉到的就是最新版。

切换通道的两种方法：

```bash
# 方法一：在 Claude Code 里用 /config 命令
# 找到 "Auto-update channel" 选项，选 stable 或 latest

# 方法二：直接改 settings.json
# "autoUpdatesChannel": "stable"
```

企业场景：管理员可以在 managed settings 里强制指定通道，团队成员改不了。这样能保证整个组织用同一个版本。

## 查看和更新

### 查看当前版本

```bash
claude --version
# 或
claude -v
```

输出就是一个版本号，比如 `1.0.33`。遇到问题排查时，第一步永远是跑这个命令确认版本。

### 手动更新

不同安装方式，更新命令不一样：

```bash
# 原生安装
claude update

# Homebrew
brew upgrade --cask claude-code        # stable 通道
brew upgrade --cask claude-code@latest  # latest 通道

# WinGet
winget upgrade Anthropic.ClaudeCode

# npm
npm install -g @anthropic-ai/claude-code@latest
```

npm 用户注意：别用 `npm update -g`。`npm update` 遵守原始安装时的 semver 范围，可能不会把你拉到真正的最新版。`npm install -g ...@latest` 才是强制拉最新的写法。

### 自动更新

原生安装默认开启后台自动更新。Claude Code 启动时检查新版本，运行中也会定期检查。下载和安装都在后台完成，下次启动生效。

想确认自动更新状态和最近一次更新的结果：

```bash
claude doctor
```

`claude doctor` 会输出安装健康检查结果，包括上次更新是否成功。

Homebrew 和 WinGet 不会自动更新。Linux 包管理器（apt、dnf、apk）也走系统更新流程，不通过 Claude Code 自身更新。

### 安装指定版本

有时候需要装某个特定版本——比如团队统一环境、CI 流水线固定版本、或者新版有 bug 要回退：

```bash
# 原生安装指定版本
curl -fsSL https://claude.ai/install.sh | sh -s -- 1.0.30

# npm 指定版本
npm install -g @anthropic-ai/claude-code@1.0.30
```

## 追踪更新的来源

想知道 Claude Code 最近加了什么功能、修了什么 bug，看这些地方：

### 1. `/release-notes` 命令

最方便。在 Claude Code 会话里直接输入：

```
/release-notes
```

弹出交互式版本选择器，选一个版本看更新说明，也能选"查看所有版本"。数据直接从官方 changelog 拉取，保证最新。

### 2. 官方 Changelog 页面

[https://code.claude.com/docs/en/whats-new](https://code.claude.com/docs/en/whats-new)

按时间线组织，列出新增功能、改进和 bug 修复。最权威的来源。

### 3. npm 页面

[https://www.npmjs.com/package/@anthropic-ai/claude-code](https://www.npmjs.com/package/@anthropic-ai/claude-code)

Versions 标签列出所有发布过的版本和发布时间。适合确认某个版本是否存在、什么时候发的。

### 4. Anthropic 官方渠道

- **Anthropic Discord** 的 `#claude-code` 频道：开发团队在上面发更新预告和重大变更说明。
- **Anthropic 博客**：重大功能发布时有配套文章。

### 5. GitHub

Claude Code 本身不开源，但 Anthropic 的 GitHub 组织下有相关仓库和 issue tracker，偶尔能找到版本相关的讨论。

## 版本差异怎么看

遇到"别人有这个功能但我这里没有"的情况，按这个顺序排查：

1. **先确认版本号**：`claude --version`。可能你确实落后了。
2. **检查通道**：如果你在 stable 通道，新功能可能要等一周才到。切 latest 可以提前拿到。
3. **查 changelog**：`/release-notes` 或官方文档，确认那个功能是哪个版本加的。
4. **强制更新**：`claude update` 或对应的更新命令，确保拿到最新。
5. **注意时差**：npm 发布时间和原生安装的可用时间可能有几小时差异。

两个常见的版本差异坑：

- **配置项改名或移除**：升级后某个设置不生效了。去 changelog 里搜那个设置名，可能已经改名或被删除。
- **MCP 协议变更**：大版本升级时 MCP 协议可能有 breaking change，导致第三方 server 连不上。看 changelog 里的迁移说明。

## 版本管理建议

- 遇到任何奇怪问题，先跑 `claude --version` 确认版本号。
- 当某个版本用得顺手时，把版本号记下来。万一升级出问题，能快速回退。
- 团队项目在 `settings.json` 里统一通道和 `minimumVersion`。
- CI/CD 环境用固定版本号 + `DISABLE_UPDATES`，保证可复现。
- 不要逢新必升。赶 deadline 时、刚出大版本社区还没反馈时，等一等。

## 关键要点

- 两个通道：stable（晚一周，跳过问题版本）和 latest（第一时间推送）。原生安装默认 latest。
- `claude --version` 看版本，`claude update` 更新，`claude doctor` 查健康状态。
- 追踪更新最方便的是 `/release-notes`，最权威的是官方文档 changelog。
- 版本差异先查通道，再查 changelog，最后强制更新。
- 团队统一部署用 managed settings 强制通道和最低版本。

## 延伸阅读

- [第 09 篇：升级、降级和固定版本](09-upgrade-downgrade-pin-version.md) -- 版本管理的完整操作指南
- [第 06 篇：安装指南](06-installation-guide.md) -- 不同安装方式的差异
- [第 08 篇：平台差异](08-platform-differences.md) -- 各平台的更新机制不同
- [Claude Code 官方 Changelog](https://code.claude.com/docs/en/whats-new) -- 版本更新记录
