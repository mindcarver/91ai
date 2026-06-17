# Plugin 命令：给 Claude Code 装扩展

> 更新日期：2025/06

**TL;DR：** Plugin 是 Claude Code 的扩展机制。一个 Plugin 可以打包 Skills、Agents、Hooks、MCP Server、LSP Server 等多种能力。安装和管理都通过 `/plugin` 斜杠命令或 `claude plugin` CLI 命令完成。Marketplace（插件市场）是分发渠道——官方市场自带，社区市场手动加，团队市场可以统一管理。

## 为什么这很重要

第 14 篇讲过交互模式的基本操作，第 59 篇讲了怎么自己写 Skill。但很多时候你不需要自己造轮子——别人已经写好了现成的工具，拿来就能用。

Plugin 解决的就是这个问题：**把别人封装好的能力装进你的 Claude Code**。

官方 Marketplace 里已经有二十多个插件，覆盖代码智能（LSP）、外部服务集成（GitHub、GitLab、Slack、Figma）、安全审查、开发工作流等。社区和团队也能建自己的 Marketplace 来分发插件。

不装插件，Claude Code 用内置能力也能干活。装了插件，等于多了一堆预配置的工具箱——特别是 LSP 插件，能让 Claude 在编辑代码后立刻看到类型错误，不用跑编译器。

## 核心概念

### Plugin 能装什么

一个 Plugin 是一个打包单元，可以包含以下任意组合：

| 组件 | 作用 | 示例 |
|------|------|------|
| Skills | 可复用的操作手册 | 代码审查清单、部署流程 |
| Agents | 专门化子代理 | PR 审查员、安全检查员 |
| Hooks | 事件触发的自动化脚本 | 保存时自动格式化 |
| MCP Servers | 外部服务连接 | GitHub API、数据库查询 |
| LSP Servers | 语言服务器协议连接 | TypeScript 类型检查、Python 补全 |

一个 Plugin 不需要包含所有组件。只包含一个 Skill 也行，只包含一个 MCP Server 也行。

### Marketplace 是什么

Marketplace 是 Plugin 的分发目录。类比手机上的应用商店：加了商店才能浏览里面的 App，但你还要单独选择装哪个。

```
Marketplace（商店）
├── Plugin A（包含 3 个 Skills + 1 个 Hook）
├── Plugin B（包含 1 个 MCP Server）
└── Plugin C（包含 2 个 Agents）
```

Claude Code 有三种 Marketplace：

| 类型 | 名称 | 是否需要手动添加 |
|------|------|----------------|
| 官方市场 | `claude-plugins-official` | 不需要，自动可用 |
| 社区市场 | `anthropics/claude-plugins-community` | 需要手动添加 |
| 第三方/团队市场 | 自定义 | 需要手动添加 |

### 安装范围（Scope）

Plugin 可以安装到不同范围：

| 范围 | 作用 | 配置位置 |
|------|------|---------|
| User | 所有项目通用 | 用户级设置 |
| Project | 仓库内所有协作者共享 | `.claude/settings.json` |
| Local | 仅自己在本项目使用 | `.claude/settings.local.json` |
| Managed | 管理员统一安装 | 用户无法修改 |

默认安装到 User 范围。想让整个团队都用某个 Plugin，用 Project 范围。

## 命令速查

### 交互模式命令（在 Claude Code 输入框里输入）

| 命令 | 功能 |
|------|------|
| `/plugin` | 打开插件管理器（Discover / Installed / Marketplaces 三个标签） |
| `/plugin install <name>@<marketplace>` | 安装插件 |
| `/plugin disable <name>@<marketplace>` | 禁用插件（不卸载） |
| `/plugin enable <name>@<marketplace>` | 重新启用插件 |
| `/plugin uninstall <name>@<marketplace>` | 卸载插件 |
| `/plugin marketplace add <source>` | 添加 Marketplace |
| `/plugin marketplace update <name>` | 刷新 Marketplace |
| `/plugin marketplace remove <name>` | 移除 Marketplace |
| `/plugin marketplace list` | 列出所有 Marketplace |
| `/reload-plugins` | 重载插件（安装/禁用后执行） |

### CLI 命令（在终端里输入）

```bash
# 查看所有 Marketplace
claude plugin marketplace list

# 添加 Marketplace（GitHub 简写）
claude plugin marketplace add anthropics/claude-plugins-community

# 添加 Marketplace（Git URL）
claude plugin marketplace add https://gitlab.com/company/plugins.git

# 添加 Marketplace（本地路径，测试用）
claude plugin marketplace add ./my-marketplace

# 添加到 Project 范围
claude plugin marketplace add owner/plugins --scope project

# 指定分支或标签
claude plugin marketplace add owner/plugins@v2.0

# 刷新
claude plugin marketplace update

# 移除
claude plugin marketplace remove marketplace-name

# 安装插件
claude plugin install github@claude-plugins-official

# 安装到 Project 范围
claude plugin install github@claude-plugins-official --scope project

# 卸载
claude plugin uninstall github@claude-plugins-official --scope project

# 验证本地 Marketplace
claude plugin validate .
```

## 详细用法

### 安装官方插件

官方 Marketplace 自动可用。直接装：

```
/plugin install github@claude-plugins-official
```

这会安装 GitHub 集成插件，包含预配置的 MCP Server，让 Claude 能直接操作 GitHub PR、Issue 等。

如果报错说找不到 Marketplace，先刷新：

```
/plugin marketplace update claude-plugins-official
```

或者重新添加：

```
/plugin marketplace add anthropics/claude-plugins-official
```

### 常用官方插件一览

**代码智能（LSP）——让 Claude 写完代码立刻看到类型错误：**

| 语言 | 插件名 | 需要安装的语言服务端 |
|------|--------|---------------------|
| TypeScript | `typescript-lsp` | `typescript-language-server` |
| Python | `pyright-lsp` | `pyright-langserver` |
| Rust | `rust-analyzer-lsp` | `rust-analyzer` |
| Go | `gopls-lsp` | `gopls` |
| C/C++ | `clangd-lsp` | `clangd` |
| Java | `jdtls-lsp` | `jdtls` |
| PHP | `php-lsp` | `intelephense` |
| Swift | `swift-lsp` | `sourcekit-l-lsp` |

装完 LSP 插件后，Claude 每次编辑文件，语言服务端会自动分析改动并报告错误。Claude 看到错误会在同一轮对话里修复，不用你手动跑编译。

**外部服务集成——预配置好的 MCP Server：**

| 插件 | 连接的服务 |
|------|-----------|
| `github` | GitHub（PR、Issue、代码搜索） |
| `gitlab` | GitLab |
| `figma` | Figma 设计稿 |
| `slack` | Slack 消息 |
| `notion` | Notion 文档 |
| `linear` | Linear 项目管理 |
| `sentry` | Sentry 错误监控 |
| `vercel` | Vercel 部署 |
| `firebase` | Firebase |
| `supabase` | Supabase |
| `atlassian` | Jira + Confluence |

**其他：**

| 插件 | 功能 |
|------|------|
| `security-guidance` | 自动审查每次改动的安全漏洞 |
| `commit-commands` | Git 提交、推送、创建 PR 的标准流程 |
| `pr-review-toolkit` | 专门的 PR 审查 Agent |
| `explanatory-output-style` | 让 Claude 在输出中解释实现选择 |

### 添加社区 Marketplace

社区 Marketplace 有经过 Anthropic 自动验证和安全筛查的第三方插件，需要手动添加：

```
/plugin marketplace add anthropics/claude-plugins-community
```

安装社区插件用 `claude-community` 作为 Marketplace 名称：

```
/plugin install <plugin-name>@claude-community
```

社区 Marketplace 里的每个插件都固定到特定的 commit SHA，不会悄悄变更。

### 添加第三方 Marketplace

来源支持四种：

**1. GitHub 仓库（`owner/repo` 格式）：**

```
/plugin marketplace add acme-corp/claude-plugins
```

指定分支或标签：

```
/plugin marketplace add acme-corp/claude-plugins@v2.0
```

**2. 其他 Git 托管平台（完整 URL）：**

```
/plugin marketplace add https://gitlab.com/company/plugins.git
```

SSH 地址也行：

```
/plugin marketplace add git@gitlab.com:company/plugins.git
```

指定分支（用 `#`）：

```
/plugin marketplace add https://gitlab.com/company/plugins.git#v1.0.0
```

**3. 本地路径（开发和测试用）：**

```
/plugin marketplace add ./my-marketplace
```

**4. 远程 URL（直接指向 `marketplace.json`）：**

```
/plugin marketplace add https://example.com/marketplace.json
```

注意：URL 方式只下载 `marketplace.json` 文件本身，不会下载插件文件。所以用 URL 方式的 Marketplace，插件 source 必须用 GitHub/npm 等外部地址，不能用相对路径。

### 管理已安装的插件

运行 `/plugin` 后进入交互界面，三个标签：

- **Discover**：浏览所有已添加 Marketplace 里的插件，按 Enter 安装
- **Installed**：查看已装插件，按 `f` 收藏，按 Enter 查看/启用/禁用/卸载
- **Marketplaces**：管理 Marketplace（添加、更新、移除）

安装了有依赖的插件时，Claude Code 会自动装上它依赖的其他插件。

命令行也能直接操作：

```
# 禁用但不卸载
/plugin disable github@claude-plugins-official

# 重新启用
/plugin enable github@claude-plugins-official

# 完全卸载
/plugin uninstall github@claude-plugins-official
```

### 安装后重载

安装、启用、禁用插件后，执行：

```
/reload-plugins
```

不用重启 Claude Code。重载后会显示插件数量统计：多少个 Plugin、Skill、Agent、Hook、MCP Server、LSP Server。

注意：重载有 token 开销。新加载的组件会在对话末尾追加自我介绍内容。如果插件提供了 MCP Server，重载会使缓存失效，下一轮请求的 token 成本会上升。

## 版本管理

### 版本解析规则

Claude Code 按以下顺序确定插件版本：

1. 插件自身 `plugin.json` 里的 `version` 字段
2. Marketplace 条目里的 `version` 字段
3. Git commit SHA（自动获取）

如果没设 `version`，每次新的 commit 都被视为新版本。这对内部开发中的插件来说最省事。

### 锁定版本

在 Marketplace 的插件条目里指定 `ref` 或 `sha`：

```json
{
  "name": "my-plugin",
  "source": {
    "source": "github",
    "repo": "acme-corp/my-plugin",
    "ref": "v2.0.0",
    "sha": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
  }
}
```

- `ref`：Git 分支或标签名
- `sha`：完整的 40 字符 commit SHA，最精确的锁定方式

npm 包插件用 `version` 字段：

```json
{
  "name": "my-npm-plugin",
  "source": {
    "source": "npm",
    "package": "@acme/claude-plugin",
    "version": "^2.0.0"
  }
}
```

支持 npm 版本范围语法：`2.1.0`、`^2.0.0`、`~1.5.0`。

### 自动更新

Marketplace 可以开启自动更新。开启后，Claude Code 启动时自动刷新 Marketplace 数据并更新已安装的插件到最新版本。

- 官方 Marketplace：默认开启自动更新
- 第三方和本地 Marketplace：默认关闭

通过交互界面开关：`/plugin` → Marketplaces → 选择 Marketplace → Enable/Disable auto-update。

环境变量控制：

```bash
# 完全禁用所有自动更新（包括 Claude Code 本体）
export DISABLE_AUTOUPDATER=1

# 禁用 Claude Code 自动更新，但保留插件自动更新
export DISABLE_AUTOUPDATER=1
export FORCE_AUTOUPDATE_PLUGINS=1
```

### 发布通道（Release Channel）

可以建两个 Marketplace 指向同一个仓库的不同分支，实现 stable/latest 双通道：

```json
// stable-tools/marketplace.json
{
  "plugins": [{
    "name": "code-formatter",
    "source": { "source": "github", "repo": "acme/formatter", "ref": "stable" }
  }]
}

// latest-tools/marketplace.json
{
  "plugins": [{
    "name": "code-formatter",
    "source": { "source": "github", "repo": "acme/formatter", "ref": "latest" }
  }]
}
```

然后通过 Managed Settings 把不同 Marketplace 分配给不同团队。

## 团队与企业管理

### 团队共享 Marketplace

在 `.claude/settings.json` 里配置，团队成员 trust 项目文件夹后会自动提示安装：

```json
{
  "extraKnownMarketplaces": {
    "team-tools": {
      "source": {
        "source": "github",
        "repo": "your-org/claude-plugins"
      }
    }
  }
}
```

指定默认启用的插件：

```json
{
  "enabledPlugins": {
    "formatter@team-tools": true,
    "deploy-tools@team-tools": true
  }
}
```

### Marketplace 访问控制

管理员可以用 `strictKnownMarketplaces` 限制用户能添加的 Marketplace：

```json
// 完全禁止添加新 Marketplace
{
  "strictKnownMarketplaces": []
}

// 白名单模式：只允许特定 Marketplace
{
  "strictKnownMarketplaces": [
    { "source": "github", "repo": "acme-corp/approved-plugins" },
    { "source": "hostPattern", "hostPattern": "^git\\.internal\\.com$" }
  ]
}
```

`hostPattern` 用正则匹配域名，适合 GitHub Enterprise 或自建 GitLab 的场景。

### 容器预装

CI/CD 和容器环境可以预装插件，不用运行时再克隆：

```bash
# 构建时安装到种子目录
CLAUDE_CODE_PLUGIN_CACHE_DIR=/opt/claude-seed \
  claude plugin marketplace add your-org/plugins
CLAUDE_CODE_PLUGIN_CACHE_DIR=/opt/claude-seed \
  claude plugin install my-tool@your-plugins

# 运行时指向种子目录
export CLAUDE_CODE_PLUGIN_SEED_DIR=/opt/claude-seed
```

种子目录是只读的，自动更新被禁用。多个种子目录用 `:` 分隔（Unix）或 `;`（Windows）。

## 常见问题

### `/plugin` 命令不识别

说明 Claude Code 版本太旧。更新方法：

```bash
# Homebrew
brew upgrade claude-code

# npm
npm install -g @anthropic-ai/claude-code@latest
```

更新后重启终端。

### 插件安装失败

常见原因：
- Marketplace URL 不可访问
- `.claude-plugin/marketplace.json` 文件不存在
- 私有仓库没有访问权限
- 插件 source 路径引用了 `marketplace.json` 外部的文件

### 插件装了但 Skill 没出现

清缓存重装：

```bash
rm -rf ~/.claude/plugins/cache
```

重启 Claude Code 后重新安装插件。

### 私有仓库认证失败

手动安装用的是你本地的 Git 凭证（`gh auth login`、macOS Keychain、ssh-agent）。后台自动更新不走交互式凭证，需要设置环境变量：

```bash
# GitHub
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# GitLab
export GITLAB_TOKEN=glpat-xxxxxxxxxxxx
```

### Marketplace 更新超时

默认超时 120 秒。大仓库或慢网络可能不够：

```bash
export CLAUDE_CODE_PLUGIN_GIT_TIMEOUT_MS=300000  # 5 分钟
```

### 离线环境 Marketplace 缓存丢失

默认 `git pull` 失败会清掉缓存。设置以下变量保留旧缓存：

```bash
export CLAUDE_CODE_PLUGIN_KEEP_MARKETPLACE_ON_FAILURE=1
```

### URL 方式的 Marketplace 里相对路径插件装不了

URL 方式只下载 `marketplace.json`，不下载插件文件。解决方案：把插件 source 改成 GitHub/npm 等外部地址，或者改用 Git 仓库方式添加 Marketplace。

## 关键要点

1. **Plugin 是打包单元**，能包含 Skills、Agents、Hooks、MCP Server、LSP Server 的任意组合
2. **Marketplace 是分发渠道**，官方的自带，社区和团队的要手动添加
3. **核心命令只有几个**：`/plugin install`、`/plugin enable`、`/plugin disable`、`/plugin uninstall`
4. **LSP 插件最有价值**，装了之后 Claude 编辑完代码能立刻看到类型错误
5. **版本可以不指定**，每次 commit 都是新版；也可以用 `ref`/`sha` 精确锁定
6. **团队场景**用 `.claude/settings.json` 统一配置 Marketplace 和默认插件
7. **安全提醒**：Plugin 能以你的用户权限执行任意代码，只装信任来源的插件

## 延伸阅读

- [Claude Code 官方文档：发现和安装插件](https://code.claude.com/docs/en/discover-plugins)
- [Claude Code 官方文档：创建和分发 Marketplace](https://code.claude.com/docs/en/plugin-marketplaces)
- [本系列第 14 篇：交互模式入门](14-interactive-mode-getting-started.md)——Plugin 命令在交互模式中使用
- [本系列第 29 篇：内置 Slash Commands](29-built-in-slash-commands.md)——`/plugin` 是内置命令之一
- [本系列第 59 篇：Skills 入门](59-skills-getting-started.md)——Plugin 里的 Skills 组件原理

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
