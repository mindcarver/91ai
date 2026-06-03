# Plugins

> 更新日期：2025/06

**TL;DR：** Plugin 是 Claude Code 的打包分发单元。一个插件目录里可以包含 Skills、Agents、Hooks、MCP Servers、LSP Servers、Monitors 等组件，其他人一条 `claude plugin install` 就能装上用。Marketplace 不是集中式商店，而是任何人都能托管的 git 仓库。读完这篇你会知道怎么创建插件、发布到团队、管理版本和安全。

## 什么时候需要 Plugin

你写了一个 Skill，帮团队自动生成 PR 描述。用了一周觉得不错，想推给隔壁组。你发了消息：

> 把 `~/.claude/skills/pr-summary/` 复制到你的机器，再装一下 `mcp-server-git`，然后在 `.claude/settings.json` 里加个 hook……

隔壁组的人看到第三步就不想装了。

Plugin 解决的就是这个问题。你把 Skill + MCP Server + Hook 打包成一个目录，发到 git 仓库，别人一条命令装完：

```bash
claude plugin install github.com/your-org/pr-summary-plugin
```

装完就能用，不需要手动配任何东西。

但如果你只是自己用，或者团队就两三个人直接共享文件就够了，那不需要折腾 Plugin。Plugin 的价值在分发——当你的受众是"不熟悉你内部工具的人"时，它才有意义。

## 一个 Plugin 里能装什么

Plugin 目录下面可以放这些组件：

- **Skills**：操作手册（详见第 59 篇），放在 `skills/` 目录下
- **Agents**：自定义代理配置，放在 `agents/` 目录下
- **Hooks**：事件钩子（详见第 63 篇），放在 `hooks/` 目录下
- **MCP Servers**：外部工具服务，在配置里声明
- **LSP Servers**：代码智能服务，通过 `.lsp.json` 配置
- **Monitors**：后台常驻进程，插件激活时自动启动

不是每个插件都需要全部组件。一个只包含一个 Skill 的插件完全合法。但当你需要 Skill + 依赖的 MCP Server 打包分发时，Plugin 是唯一的方式。

## 目录结构和 plugin.json

一个插件的最低要求是一个包含 `plugin.json` 的目录：

```
my-plugin/
├── .claude-plugin/
│   └── plugin.json     # 插件清单（必需）
├── skills/
│   └── my-skill/
│       └── SKILL.md
├── hooks/
│   └── my-hook.json
└── README.md
```

`plugin.json` 是插件的核心，告诉 Claude Code 这个插件叫什么、有什么组件、需要什么依赖：

```json
{
  "name": "pr-summary",
  "version": "1.2.0",
  "description": "自动生成 PR 描述，标记变更风险",
  "components": {
    "skills": ["skills/"],
    "hooks": ["hooks/"]
  },
  "dependencies": {
    "claude-code": ">=1.0.0"
  }
}
```

几个关键字段：

- `name`：插件名称，同时作为命名空间。装完后 Skill 的调用方式变成 `/pr-summary:skill-name`
- `version`：语义化版本号，用于版本解析和更新检查
- `components`：指向各组件目录的路径
- `dependencies`：可选，声明对 Claude Code 版本或其他插件的依赖
- `userConfig`：可选，定义用户需要填写的配置项

### userConfig：让用户配置自己的值

有些插件需要用户提供配置——API 地址、项目 ID、偏好设置。用 `userConfig` 声明：

```json
{
  "userConfig": {
    "apiEndpoint": {
      "type": "string",
      "description": "你的内部 API 地址",
      "default": "https://api.example.com"
    },
    "projectId": {
      "type": "string",
      "description": "项目 ID"
    },
    "verbose": {
      "type": "boolean",
      "default": false
    }
  }
}
```

支持的类型：`string`、`number`、`boolean`、`directory`、`file`。用户安装插件后通过 `claude plugin config` 填写。敏感值（比如 token）会存到系统 keychain，不会明文写在配置文件里。

## 创建第一个 Plugin

从零开始，把之前写的 PR 总结 Skill 打包成插件。

### 步骤 1：初始化

```bash
claude plugin init pr-summary-plugin
```

这会创建目录结构和模板 `plugin.json`。

### 步骤 2：放入组件

把现有的 Skill 文件复制进去：

```bash
cp -r ~/.claude/skills/pr-summary/ pr-summary-plugin/skills/pr-summary/
```

### 步骤 3：编辑 plugin.json

```json
{
  "name": "pr-summary",
  "version": "1.0.0",
  "description": "自动生成 PR 描述并标记风险",
  "components": {
    "skills": ["skills/"]
  }
}
```

### 步骤 4：本地验证

```bash
claude plugin validate ./pr-summary-plugin
```

这个命令会检查 `plugin.json` 格式、组件路径是否存在、命名是否规范。通过后再发布。

### 步骤 5：提交到 git

```bash
cd pr-summary-plugin
git init && git add . && git commit -m "init pr-summary plugin"
git remote add origin github.com/your-org/pr-summary-plugin.git
git push -u origin main
```

不是必须推到 GitHub，任何可访问的 git 仓库都行。但对于团队分发，GitHub 最方便。

## 安装和管理

### 安装插件

```bash
# 从 GitHub 仓库安装
claude plugin install github.com/your-org/pr-summary-plugin

# 从 git URL 安装
claude plugin install https://github.com/your-org/pr-summary-plugin.git

# 从本地路径安装（开发调试用）
claude plugin install ./pr-summary-plugin
```

安装后插件会被缓存到 `~/.claude/plugins/cache/` 目录下。默认不会自动启用——需要显式 enable：

```bash
claude plugin enable pr-summary
```

### 日常管理命令

```bash
# 查看已安装的插件
claude plugin list

# 查看某个插件的详情
claude plugin details pr-summary

# 禁用插件（不卸载）
claude plugin disable pr-summary

# 更新到最新版本
claude plugin update pr-summary

# 卸载
claude plugin uninstall pr-summary
```

### 命名空间

安装后，插件内的组件会带上插件名前缀。比如插件 `pr-summary` 里有一个 Skill 叫 `summarize`，调用方式是：

```
/pr-summary:summarize
```

这避免了不同插件之间的命名冲突。两个插件都可以有 `summarize` Skill，不会打架。

## 发布和分发

### Marketplace：不是 App Store

Claude Code 的 Marketplace 不是一个集中式商店。它就是一个 git 仓库，里面有一个索引文件列出可用的插件。

任何人都能创建 Marketplace。Anthropic 官方运行两个：

- `claude-plugins-official`：官方维护的插件
- `claude-community`：社区贡献的插件

注册 Marketplace：

```bash
claude plugin market add github.com/your-org/your-marketplace
```

注册后，别人就能通过 marketplace 搜索和安装你的插件：

```bash
claude plugin install pr-summary --marketplace your-marketplace
```

### 发布流程

1. 把插件推到 git 仓库
2. 在你的 marketplace 仓库的索引文件里添加插件条目
3. 索引里包含插件名称、git 地址、版本号、描述
4. 其他人注册你的 marketplace 后就能安装

你也可以不用 marketplace，直接把 git 地址给对方，对方用 `claude plugin install <git-url>` 安装。Marketplace 的好处是集中发现和管理，但不是必须的。

### 用 git-subdir 做多插件仓库

如果你有多个小插件，不想每个都建一个仓库，可以用 subdirectory 方式：

```bash
claude plugin install github.com/your-org/all-plugins --subdir plugins/pr-summary
```

Claude Code 会用 sparse checkout 只拉取指定子目录，不浪费磁盘和带宽。

## 版本管理

### 版本解析优先级

三个地方可以声明版本号，优先级从高到低：

1. `plugin.json` 里的 `version` 字段
2. Marketplace 索引里的版本号
3. 都没有时，使用 git commit SHA

更新检查用 `plugin.json` 的版本号做比较。如果你在 marketplace 索引里写了 `1.2.0`，但 `plugin.json` 写的是 `1.1.0`，系统认的是 `plugin.json` 里的 `1.1.0`。

### 依赖约束

`dependencies` 字段支持 semver 范围：

```json
{
  "dependencies": {
    "claude-code": ">=1.0.0 <3.0.0",
    "my-other-plugin": "^2.0.0"
  }
}
```

安装时会检查依赖是否满足。不满足会报错，不会静默安装一个跑不起来的插件。

### 缓存和清理

插件缓存在 `~/.claude/plugins/cache/`。更新后旧版本不会被立即删除——万一新版本有问题你可以回滚。超过 7 天没人用的旧版本会被自动清理。手动清理用：

```bash
claude plugin prune
```

### 用 Release Channels 做多版本分发

同一个插件仓库可以对应多个 marketplace，每个 marketplace 指向不同的 git ref（分支或 tag）。比如：

- `stable` marketplace → 指向 `main` 分支
- `beta` marketplace → 指向 `develop` 分支
- `canary` marketplace → 指向某个 commit SHA

用户选择注册哪个 marketplace，就装到哪个版本。

## 安全：必须说清楚的限制

Plugin 能做的事情很多——执行 shell 命令、启动后台进程、访问文件系统。所以安全模型需要认真对待。

### 信任模型

- **用户级插件**（`~/.claude/settings.json`）：安装后自动信任。你自己装的，你负责。
- **项目级插件**（`.claude/settings.json`）：第一次使用时会弹出信任确认。因为项目级配置可以被别人提交到 git，你可能不知道仓库里加了什么插件。

如果插件包含 Hooks 或 MCP Servers，Claude Code 会明确提示这些组件有执行权限，让你确认。

### 管理员控制

企业环境里，管理员可以在全局 settings 里配置：

```json
{
  "strictKnownMarketplaces": true,
  "blockedMarketplaces": ["sketchy-marketplace"]
}
```

- `strictKnownMarketplaces`：设为 `true` 后，只允许从已知的 marketplace 安装插件，不能直接用 git URL 安装
- `blockedMarketplaces`：黑名单，阻止特定 marketplace

这些设置通常由 IT 部门放在 `/etc/claude/settings.json` 或 MDM 管理的配置文件里。

### 环境变量

插件运行时可以访问三个环境变量：

- `${CLAUDE_PLUGIN_ROOT}`：插件自身的安装路径
- `${CLAUDE_PLUGIN_DATA}`：插件的数据目录，放运行时产生的文件
- `${CLAUDE_PROJECT_DIR}`：当前项目的根目录

通过这些变量，插件可以安全地定位自己的文件，不需要硬编码路径。

### CI/CD 场景

在容器或 CI 环境中预装插件，用环境变量控制：

```bash
export CLAUDE_CODE_PLUGIN_SEED_DIR=/opt/claude-plugins
export CLAUDE_CODE_PLUGIN_CACHE_DIR=/cache/claude-plugins
```

Dockerfile 里可以先装好插件，容器启动时直接可用。

## 关键要点

- Plugin 是打包分发的单位，不是日常使用的单位。自己用 Skill 就够了，需要分发给别人才考虑 Plugin
- 一个 Plugin 可以包含 Skills、Agents、Hooks、MCP Servers、Monitors 等多种组件
- `plugin.json` 是核心配置文件，声明组件路径、版本、依赖和用户配置
- Marketplace 是去中心化的——就是一个 git 索引仓库，任何人都能建
- 命名空间机制（`/plugin-name:skill-name`）避免不同插件之间的冲突
- 安全模型分用户级和项目级，企业环境有管理员控制选项
- 版本遵循 semver，缓存自动清理，支持 release channels 做多版本分发

## 进一步阅读

- [Claude Code 官方插件文档](https://code.claude.com/docs/en/plugins)——完整的 plugin.json 字段参考
- [Plugin Reference](https://code.claude.com/docs/en/plugins-reference)——CLI 命令和环境变量详细说明
- [Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)——如何创建和管理 Marketplace
- 第 59 篇：Skills 入门——理解 Skill 是学习 Plugin 的前提
- 第 63 篇：Hooks 入门——Plugin 中常用的自动化触发机制
