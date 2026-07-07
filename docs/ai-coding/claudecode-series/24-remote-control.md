# Remote Control 命令

> 更新日期：2025/06

**TL;DR：** Remote Control 让你从手机、平板、或任何浏览器接管正在本地跑的 Claude Code 会话。代码不离开你的机器——手机只是个遥控器。三种启动方式：`claude remote-control`（服务器模式）、`claude --remote-control`（交互模式带远程）、会话内输入 `/remote-control`（中途开启）。连接方式是扫二维码或打开链接。

## 为什么这很重要

几种常见场景：

- 在公司启动了一个重构任务，Claude 正在改代码，你突然要下楼买杯咖啡或去开会。你想在手机上看它改到哪了、随时回答它的问题
- 晚上在家用笔记本让 Claude 跑测试，然后想去沙发上躺着。你不想端着笔记本
- 同时开多个 Claude Code 任务，想在手机上统一监控进度

以前只有两个选择：坐在电脑前守着，或者用 SSH/Tailscale 自己搭远程方案。Remote Control 就是解决这件事的——启动会话后生成 URL 和二维码，手机或浏览器打开就能操作那个会话。

关键点：Claude 始终跑在你本地机器上。你的代码、文件系统、MCP 服务器、工具配置全部在本地。远程端只是一个窗口，不是一个独立的环境。这一点跟 Claude Code on Web（跑在 Anthropic 云端）是根本性的区别。

## 核心概念

### 工作原理

Remote Control 不是"把你的终端搬到云端"，而是"给你的终端加了个远程显示器"。

技术上的流程：

1. 你在本地运行 `claude remote-control` 或 `claude --remote-control`
2. Claude Code 向 Anthropic API 发起一个 HTTPS 出站连接，注册一个远程会话
3. Anthropic 返回一个会话 URL
4. 你在手机或浏览器里打开这个 URL
5. 所有消息通过 Anthropic API 中转：手机 → API → 本地 Claude Code，反过来也一样

注意几个设计决策：

- **只发出站请求**：你的机器不开放任何入站端口。不是你在"被远程连接"，而是你在主动轮询
- **所有流量走 TLS**：跟普通 Claude Code 会话一样的传输安全
- **短时效凭证**：连接用多个短期凭证，每个凭证只做一件事，独立过期

### 跟其他远程方案的区别

Claude Code 目前有五种"不在终端前也能用"的方式：

| 方式 | 触发方式 | Claude 跑在哪 | 适合场景 |
|------|---------|--------------|---------|
| Remote Control | 在 claude.ai/code 或 Claude app 控制已有会话 | 你的机器（CLI 或 VS Code） | 正在做的事换设备继续 |
| Dispatch | 从 Claude app 发消息派任务 | 你的机器（Desktop App） | 离开工位后派新任务 |
| Channels | 从 Telegram/Discord 推消息触发 | 你的机器（CLI） | 外部事件驱动（CI 失败等） |
| Claude Code on Web | 在浏览器里直接开任务 | Anthropic 云端 | 不需要本地环境时 |
| Scheduled Tasks | 定时触发 | CLI / Desktop / 云端 | 重复性自动化任务 |

核心区别在于"Claude 跑在哪"和"你怎么触发"。Remote Control 和 Dispatch 都跑在你本地，但 Remote Control 是接管正在跑的会话，Dispatch 是从手机发起新任务。

## 使用方式

### 前提条件

- **订阅**：Pro、Max、Team、Enterprise 计划可用。API key 不行
- **认证**：需要用 claude.ai 账号登录（`/login`），不能用 `ANTHROPIC_API_KEY` 环境变量
- **工作区信任**：至少在项目目录里运行过一次 `claude` 并接受了信任对话框
- Team 和 Enterprise 计划需要管理员先在 claude.ai/admin-settings/claude-code 里打开 Remote Control 开关

### 三种启动方式

#### 方式一：服务器模式

专门用来等待远程连接的模式。在项目目录下运行：

```bash
claude remote-control
```

终端会显示一个会话 URL。按空格键可以切换显示二维码。这个模式下，终端本身不提供交互输入——它就是一个等待远程连接的服务器，显示连接状态和工具活动。

可以加参数：

| 参数 | 说明 |
|------|------|
| `--name "我的项目"` | 自定义会话标题，在 claude.ai/code 的会话列表里显示 |
| `--spawn same-dir` | 所有会话共享当前目录（默认） |
| `--spawn worktree` | 每个会话自动创建独立 git worktree |
| `--spawn session` | 单会话模式，拒绝额外的连接 |
| `--capacity 10` | 最大并发会话数，默认 32 |
| `--verbose` | 显示详细的连接和会话日志 |
| `--sandbox` | 启用文件系统和网络隔离 |

`--spawn worktree` 值得单独说一下。默认情况下多个远程会话共享同一个工作目录，如果两个会话同时改同一个文件会冲突。用 `--spawn worktree` 让每个会话自动建一个 git worktree，改动互不影响。前提是你的项目得是个 git 仓库。

#### 方式二：交互模式带远程

```bash
claude --remote-control
```

或简写：

```bash
claude --rc
```

带自定义名称：

```bash
claude --remote-control "我的项目"
```

这种方式跟服务器模式的区别：你可以在终端里继续正常交互，同时远程端也能操作。两边同步——你在终端打字，手机上能看到；在手机上发消息，终端也能看到。

这是日常最常用的方式。你在电脑前正常用 Claude Code，临时要走开时，手机接着用。

#### 方式三：会话内中途开启

如果你已经在一个 Claude Code 会话里，不想退出重新启动，直接输入：

```
/remote-control
```

或简写 `/rc`。带名称：

```
/remote-control 我的项目
```

会话历史会被完整保留，终端会显示连接 URL 和二维码。

#### VS Code 里怎么用

在 VS Code 的 Claude Code 扩展里，在输入框里输入 `/remote-control` 或 `/rc`。需要 Claude Code v2.1.79 或更新版本。

连接后输入框上方会出现一个横幅，显示连接状态。点横幅上的"Open in browser"直接打开会话。断开连接点横幅上的关闭图标，或再运行一次 `/remote-control`。

VS Code 版不支持自定义名称和二维码。

### 从其他设备连接

会话激活后，有三种连接方式：

1. **打开会话 URL**：在任何浏览器里直接访问
2. **扫二维码**：用 Claude app 扫码直接跳转到会话
3. **从会话列表找**：打开 claude.ai/code 或 Claude app 的 Code 页面，带电脑图标和绿色状态点的就是 Remote Control 会话

如果你还没装 Claude app，在 Claude Code 里输入 `/mobile`，会显示一个下载二维码（iOS 和 Android）。

### 自动开启 Remote Control

每次手动加 `--remote-control` 太麻烦？可以在配置里设置自动开启：

```
/config
```

找到"Enable Remote Control for all sessions"，设为 `true`。之后每次启动交互模式都会自动注册一个远程会话。

在 Desktop App 里也能设：Settings → Claude Code → Enable remote control by default。

注意：开了这个设置后，每个交互式 Claude Code 进程会注册一个远程会话。如果你同时跑多个实例，每个都有自己独立的会话。

### 手机推送通知

Remote Control 开启后，Claude 可以给你的手机发推送通知。典型场景：一个长时间任务跑完了，或者 Claude 遇到一个需要你拍板的决策。

设置方式：在 Claude app 的 Code 页面连接 Remote Control 会话后，推送通知自动启用。你也可以在提示里主动要求，比如"测试跑完后通知我"。

通知不到的排查：

- iOS：Focus 模式和通知摘要可能拦截推送。检查 Settings → Notifications → Claude
- Android：激进的电池优化可能延迟推送。在系统设置里把 Claude 从电池优化中排除
- 如果 `/config` 显示 "No mobile registered"：打开手机上的 Claude app 让它刷新推送令牌

## 安全考虑

### 连接安全

几个安全设计点：

- **不出站以外的端口暴露**：不开放任何入站端口，完全通过出站 HTTPS 请求轮询
- **TLS 传输加密**：所有流量都经过 Anthropic API，走 TLS 加密
- **短期凭证**：连接使用多个独立的短期凭证，每个凭证用途单一，独立过期

### 潜在风险

你的 Claude 账号是最大的攻击面。如果有人拿到了你的 claude.ai 登录状态，他就能：

- 看到你的 Remote Control 会话列表
- 连接到你的活跃会话
- 通过 Claude 在你的机器上执行操作

这意味着：

- 不要在公共设备上保持 claude.ai 登录状态
- Team/Enterprise 管理员应该仔细评估是否启用 Remote Control
- 如果你的 Claude 账号有异常活动，立刻改密码并检查活跃会话

### 什么时候不该用

- **处理敏感代码**：如果你的项目涉及高敏感数据（金融、医疗、安全工具），Remote Control 意味着多了一层暴露面——你的手机浏览器成了一个新的入口
- **不信任的网络环境**：虽然流量走 TLS，但在极度敏感的场景下，通过公共网络操作你的代码仓库仍然有风险
- **多用户共享机器**：如果你和别人共用一台开发机，Remote Control 会话可能被同机器的其他用户看到

## 实战场景

### 场景一：离开工位后继续推进

```bash
# 在公司电脑上启动
cd ~/projects/my-app
claude --remote-control "重构用户认证模块"
```

终端显示 URL 和二维码。用手机扫一下，出门。在地铁上打开 Claude app，找到带电脑图标的会话，继续发消息指挥 Claude。

回到家后，在电脑终端前坐下，对话历史完整同步。你接着在终端里输入就行。

### 场景二：多会话服务器模式

你需要同时让 Claude 做三件事：写测试、修 bug、重构。每个任务一个远程会话：

```bash
claude remote-control --name "测试+Bug+重构" --spawn worktree --capacity 3
```

`--spawn worktree` 确保三个会话的文件改动不冲突。用手机或浏览器分别连上去监控进度。

### 场景三：CI 完成后手机查看结果

在本地让 Claude 跑完一轮完整测试和代码审查，开启 Remote Control：

```bash
claude --rc "跑完所有测试并生成审查报告"
```

提示里加上"完成后通知我"。Claude 完成后会给手机推一条通知。你打开 Claude app 查看结果，确认没问题后让它提交。

### 场景四：网络中断后恢复

你正在用手机控制一个会话，笔记本合盖了。Remote Control 会自动处理这种情况——你的本地进程保持运行，等网络恢复后自动重连。在手机端你什么都不用做，等几秒就重新连上。

但如果你的机器网络断了超过大概 10 分钟，会话会超时退出。重新运行 `claude remote-control` 启动新会话。

## 已知限制

- **每个交互进程只有一个远程会话**：在非服务器模式下，一个 Claude Code 实例同一时间只能有一个远程会话。需要多个并发会话用服务器模式
- **本地进程不能关**：Remote Control 是本地进程。关掉终端、退出 VS Code、或停止 `claude` 进程，会话就结束
- **网络断开超过约 10 分钟会话超时**：需要重新启动
- **Ultraplan 会断开 Remote Control**：两者都占用 claude.ai/code 界面，同一时间只能用一个
- **部分命令只能本地用**：需要打开交互式选择器的命令（`/mcp`、`/plugin`、`/resume`）只能在本地 CLI 里跑。纯文本输出的命令（`/compact`、`/clear`、`/context`、`/usage`、`/recap`）可以在远程端用
- **API key 认证不支持**：必须用 claude.ai 账号登录

## 常见问题

**Q：Remote Control 跟 SSH 远程有什么区别？**

SSH 是给你一个远程 shell。Remote Control 是专门给 Claude Code 会话做的远程界面——你在手机上看到的是 claude.ai/code 的聊天界面，不是终端。好处是交互体验更好（支持 @ 文件补全、推送通知），坏处是只能操作 Claude Code 会话，不能做其他终端操作。

**Q：我的代码会上传到 Anthropic 服务器吗？**

会话过程中的消息和工具调用结果会通过 API 传输（跟任何 Claude Code 会话一样）。但你的项目文件不会被完整上传——Claude 只在需要时读取特定文件，文件内容作为消息的一部分传输。远程端的界面只是显示和输入，文件始终在你本地。

**Q：Team/Enterprise 管理员怎么开启？**

在 claude.ai/admin-settings/claude-code 里找到 Remote Control 开关。如果开关是灰色的，说明组织有数据保留或合规配置不兼容，需要联系 Anthropic 支持。如果错误信息提到 `disableRemoteControl`，是 IT 管理员通过托管设置禁用了。

**Q：Dispatch 和 Remote Control 我该用哪个？**

简单判断：
- **你已经在用 Claude Code 做事，想换设备继续** → Remote Control
- **你不在电脑前，想从手机派一个新任务** → Dispatch（需要 Desktop App）

**Q：报错 "Remote Control requires a claude.ai subscription" 怎么办？**

你没登录 claude.ai 账号。运行 `claude auth login` 选 claude.ai 选项。如果环境里有 `ANTHROPIC_API_KEY`，先 unset 掉——API key 不支持 Remote Control。

**Q：报错 "Remote Control requires a full-scope login token" 怎么办？**

你用了 `claude setup-token` 生成的长期 token 或 `CLAUDE_CODE_OAUTH_TOKEN` 环境变量。这些 token 只能用于推理，不能建立 Remote Control 连接。运行 `claude auth login` 用完整的会话 token 认证。

**Q：报错 "Remote credentials fetch failed" 怎么办？**

Claude Code 拿不到连接凭证。加 `--verbose` 看详细错误：

```bash
claude remote-control --verbose
```

常见原因：没登录（用 `/login`）、网络/代理阻断出站 HTTPS 请求（需要 443 端口访问 Anthropic API）、订阅过期。

## 关键要点

1. **三种启动方式**：`claude remote-control`（纯服务器模式）、`claude --rc`（交互+远程）、会话内 `/rc`（中途开启）
2. **代码不离开本地**：远程端只是个窗口，Claude 始终跑在你的机器上，文件系统、MCP、工具配置全部本地可用
3. **只出站不入站**：不开放任何端口，通过 HTTPS 轮询工作，所有流量 TLS 加密
4. **扫二维码或开链接就能连**：手机用 Claude app 扫码，电脑用浏览器打开 URL
5. **`/config` 里可以设置自动开启**：不用每次手动加 `--rc`
6. **服务器模式支持多会话**：用 `--spawn worktree` 让每个远程会话有独立的 git worktree
7. **必须用 claude.ai 账号**：API key 认证不支持 Remote Control

## 延伸阅读

- [Remote Control - Claude Code 官方文档](https://code.claude.com/docs/en/remote-control)
- [Claude Code gets remote access to live local terminals - Tessl](https://tessl.io/blog/claude-code-gets-remote-access-to-live-local-terminals/)
- 系列第 12 篇：Desktop App——Dispatch、Routines 等远程功能
- 系列第 13 篇：Claude Code on Web——云端运行，跟 Remote Control 的本地运行形成对比
- 系列第 17 篇：会话继续与恢复——`-c`、`-r` 等会话管理基础
