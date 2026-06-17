# Codex CLI 安装全平台指南：macOS / Linux / Windows 一网打尽

**TL;DR：** Codex CLI 支持 macOS 12+、Ubuntu 20.04+、Windows 11（含 WSL2）三个平台。macOS/Linux 推荐一键脚本 `curl -fsSL https://chatgpt.com/codex/install.sh | sh`，Windows 推荐 PowerShell 脚本或 WSL2 内安装。也支持 `npm install -g @openai/codex`、Homebrew、手动下载二进制等方式。本文按平台逐一讲解，遇到问题可以直接跳到第七节排查。

## 1. 安装前的准备

花 5 分钟检查环境，比花 50 分钟排查安装失败划算。下面逐项过一遍。

### 系统要求

| 项目 | 最低要求 | 说明 |
|------|----------|------|
| macOS | 12 Monterey 及以上 | Apple Silicon（M1/M2/M3/M4）和 Intel 均可 |
| Linux | Ubuntu 20.04+ / Debian 10+ | x86_64 和 arm64 二进制分开提供 |
| Windows | Windows 11（推荐）/ Windows 10 1809+（能用但不可靠） | 原生沙箱或 WSL2 两种路径 |
| 内存 | 4 GB 最低，8 GB 推荐 | Codex 本身不占太多内存，但跑项目编译/测试时需要余量 |
| 磁盘 | 约 50 MB | 二进制文件很小，RSS 阶段 2025 年 5 月统计约 12 MB |
| Git | 2.23+（可选） | Codex 内置了 PR 辅助功能，依赖 Git |
| Node.js | 16+（仅 npm 安装方式需要） | 用一键脚本或手动下载二进制则不需要 |

一个容易忽略的点：Windows 10 的旧版本（1809 之前）缺少 ConPTY 支持，终端渲染会有问题。如果你在 Windows 10 上装，先确认版本号。

```powershell
# PowerShell 里检查 Windows 版本
[System.Environment]::OSVersion.Version
# 输出类似：Major 10, Minor 0, Build 19045
# Build 17763 对应 1809，低于这个数就该升级了
```

### 网络要求

Codex CLI 的安装脚本和二进制托管在 `chatgpt.com` 域名下。国内直连这个域名可能会遇到超时或重置。如果你在国内，有三种处理方式：

1. **HTTP 代理**：在终端设置 `https_proxy` 环境变量
   ```bash
   export https_proxy=http://127.0.0.1:7890
   ```
2. **npm 方式配合镜像**：用 npm 安装时，npm 会从 npmjs.org 拉包，国内一般能通（包本身是 shim，会再去 chatgpt.com 下载 Rust 二进制，这一步还是需要代理）
3. **手动下载 GitHub Release**：GitHub Release 页面的二进制在国内访问通常比 chatgpt.com 稳定，可以作为备选

### 账号准备

Codex 没有独立订阅，用 ChatGPT 账号登录即可。支持以下套餐：

- ChatGPT Plus（$20/月）
- ChatGPT Pro（$200/月）
- ChatGPT Business
- ChatGPT Edu
- ChatGPT Enterprise

也可以用 OpenAI API Key 作为身份验证方式，但这需要额外配置（设置 `OPENAI_API_KEY` 环境变量）。首次运行 `codex` 时会弹出登录提示，选"Sign in with ChatGPT"就行。

### 前置环境检查

打开你的终端，跑下面几条命令确认环境：

```bash
# 检查终端本身能不能用
echo "Terminal OK"

# 检查 git（可选但推荐）
git --version
# 预期输出类似：git version 2.47.0

# 检查 Node.js（仅 npm 安装方式需要）
node --version
# 预期输出类似：v22.4.0
# 如果低于 v16，需要先升级 Node.js
```

macOS 用户：Terminal.app 在 `/Applications/Utilities/Terminal.app`，或者用 iTerm2、Warp、Alacritty 都行。Linux 用户：随便一个 shell 都可以。Windows 用户：PowerShell 7 推荐，Windows Terminal 也行。

确认完这些，进入你对应平台的安装章节。

## 2. macOS 安装

macOS 上有四种安装方式。选哪个？用下面这个决策树：

- 你装了 Homebrew 并且习惯用它管理软件 → 方式二
- 你装了 Node.js 并且常用 npm → 方式三
- 你想最快装上，不折腾 → 方式一
- 以上都不想用，或者网络环境访问 chatgpt.com 有问题 → 方式四

### 方式一：官方一键脚本（推荐）

打开终端，粘贴这一行：

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

这条命令做了几件事：

1. 用 `curl` 从 `chatgpt.com/codex/install.sh` 下载安装脚本（`-fsSL` 四个 flag 分别表示静默模式、跟随重定向、显示错误、SSL 校验）
2. 通过管道 `|` 把脚本内容传给 `sh` 执行
3. 脚本检测你的 CPU 架构（Apple Silicon 是 `aarch64`，Intel 是 `x86_64`）
4. 下载对应的预编译 Rust 二进制文件
5. 把二进制文件放到 `~/.codex/bin/` 目录（如果该目录不存在则创建）
6. 尝试把 `~/.codex/bin` 加到你的 `PATH` 里（修改 `~/.zshrc` 或 `~/.bash_profile`）
7. 打印安装结果

Apple Silicon 和 Intel Mac 自动区分，你不用手动选择架构。脚本通过 `uname -m` 判断，M1/M2/M3/M4 返回 `arm64`，Intel 返回 `x86_64`。

如果你在写自动化部署脚本、CI/CD pipeline，或者不想在安装过程中看到交互提示，可以设置非交互模式：

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | CODEX_NON_INTERACTIVE=1 sh
```

`CODEX_NON_INTERACTIVE=1` 会跳过所有交互式确认（比如"是否添加到 PATH"的提示），全程静默执行。

安装完成后，新开一个终端窗口（或者 `source ~/.zshrc`），然后验证：

```bash
codex --version
# 预期输出类似：codex 0.116.0

which codex
# 预期输出：/Users/你的用户名/.codex/bin/codex
```

升级也是同一条命令——重新跑一遍安装脚本，它会覆盖旧版本：

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

### 方式二：Homebrew

如果你已经在用 Homebrew 管理软件，这一条命令搞定：

```bash
brew install --cask codex
```

注意 `--cask` 参数。Codex 在 Homebrew 里以 cask 形式分发，不是 formula。cask 通常用于预编译二进制，formula 用于从源码编译。这也意味着 `brew upgrade codex` 会更新到最新 cask 版本。

一个细节：Homebrew 的 cask 版本发布通常比 npm 版本滞后几天。如果你想第一时间拿到更新，用方式一或方式三。

验证方式同上：

```bash
codex --version
which codex
```

### 方式三：npm 全局安装

需要先有 Node.js（16+）。如果你还没装 Node，推荐用 nvm 或 fnm 管理：

```bash
# 用 nvm 安装最新 LTS 版本的 Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.zshrc
nvm install --lts
```

Node.js 就绪后，全局安装 Codex：

```bash
npm install -g @openai/codex
```

npm 包 `@openai/codex` 的本质是一个 JavaScript 入口文件（`bin/codex.js`）。它做的事情是：检测你的平台（`process.platform`）和架构（`process.arch`），然后下载对应的预编译 Rust 二进制。你最终跑的还是 Rust 编译的原生二进制，Node.js 只充当安装引导的角色。

这也意味着 npm 安装方式有一个坑：如果你用了 `--no-optional` flag，平台特定的可选依赖包（比如 `@openai/codex-darwin-arm64`）会被跳过，导致二进制下载失败。所以**不要**这样写：

```bash
# 错误：会跳过平台二进制
npm install -g @openai/codex --no-optional
```

验证：

```bash
codex --version
```

升级就是重新跑 `npm install -g @openai/codex`，npm 会拉取最新版本。

### 方式四：手动下载 GitHub Release

适合网络受限、或者想精确控制安装位置的场景。

第一步，去 GitHub Release 页面：

```
https://github.com/openai/codex/releases/latest
```

页面底部 Assets 列表里找对应的压缩包：

| CPU 架构 | 文件名 |
|----------|--------|
| Apple Silicon（M1/M2/M3/M4） | `codex-aarch64-apple-darwin.tar.gz` |
| Intel | `codex-x86_64-apple-darwin.tar.gz` |

下载后解压、重命名、赋权、移动到 PATH：

```bash
# 假设下载到了 ~/Downloads 目录
cd ~/Downloads

# 解压（以 Apple Silicon 为例）
tar xzf codex-aarch64-apple-darwin.tar.gz

# 解压出来的文件名带平台后缀，重命名为 codex
mv codex-aarch64-apple-darwin codex

# 添加可执行权限
chmod +x codex

# 移动到一个在 PATH 里的目录
# 选项 1：放到 /usr/local/bin（需要 sudo）
sudo mv codex /usr/local/bin/

# 选项 2：放到用户级 bin 目录（不需要 sudo）
mkdir -p ~/.local/bin
mv codex ~/.local/bin/
# 然后确保 ~/.local/bin 在 PATH 里
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

验证：

```bash
codex --version
# 预期输出类似：codex 0.116.0
```

手动安装的升级方式：回到 GitHub Release 页面，下载新版压缩包，重复上述步骤覆盖旧文件。

### macOS 安装小结

| 方式 | 优点 | 缺点 |
|------|------|------|
| 一键脚本 | 最快，自动检测架构 | 需要能访问 chatgpt.com |
| Homebrew | 统一管理，升级方便 | 版本发布滞后几天 |
| npm | 跨平台一致，CI/CD 友好 | 需要 Node.js 环境 |
| 手动下载 | 不依赖特定包管理器 | 升级要手动重复步骤 |

## 3. Linux 安装

Linux 上的安装方式和 macOS 大同小异，区别在于二进制文件不同，以及一些 Linux 特有的注意事项。

### 四种安装方式

和 macOS 完全一致的四种方式，命令也一样：

**一键脚本：**

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

**npm：**

```bash
npm install -g @openai/codex
```

**手动下载 GitHub Release：**

Linux 二进制文件用 musl libc 静态链接，不依赖系统 glibc 版本。文件名：

| 架构 | 文件名 |
|------|--------|
| x86_64（常见服务器和桌面） | `codex-x86_64-unknown-linux-musl.tar.gz` |
| arm64（ARM 服务器、树莓派 5 等） | `codex-aarch64-unknown-linux-musl.tar.gz` |

安装步骤和 macOS 手动安装一样：下载 → 解压 → 重命名 → `chmod +x` → 移到 PATH。

**Debian/Ubuntu 的 apt？** 截至目前（2026 年 6 月），Codex 没有官方 apt 仓库。如果你看到网上有人用 `apt install codex`，那个装的是别的同名包，不是 OpenAI 的 Codex。

### musl vs glibc

Codex 的 Linux 二进制用 `*-unknown-linux-musl` 命名，表示它们用 musl libc 静态编译。这样做的好处是不挑发行版——Ubuntu 20.04、Debian 10、Fedora、Arch、Alpine 都能直接跑，不用担心 glibc 版本不兼容。

如果你之前遇到过 `/lib/x86_64-linux-gnu/libc.so.6: version 'GLIBC_2.34' not found` 这类报错，musl 二进制能彻底避开这个问题。

### WSL2 上的安装

如果你在 Windows 上用 WSL2，Codex 应该装在 WSL2 里面，而不是 Windows 侧。原因：

1. WSL2 内部就是 Linux，沙箱实现用的是 Bubblewrap + Landlock，功能完整
2. 直接在 Windows 侧装 Codex 也能跑，但沙箱用的是 Windows 受限令牌方式，两者的隔离机制不同
3. 你的项目代码如果在 WSL2 的文件系统里（`/home/用户名/...`），从 WSL2 内部访问更快；如果放在 `/mnt/c/...`（Windows 挂载路径），I/O 性能会明显下降

WSL2 安装步骤：

```bash
# 在 Windows PowerShell（管理员）里安装 WSL2
wsl --install

# 重启后，打开 WSL2 终端
# 在 WSL2 里安装 Codex
curl -fsSL https://chatgpt.com/codex/install.sh | sh

# 验证
codex --version
```

### Linux 常见问题

**权限问题：** 如果你把 `codex` 二进制放到 `/usr/local/bin` 需要 sudo。放到 `~/.local/bin` 则不需要。检查你的用户对该目录是否有写权限。

**PATH 配置：** 不同 shell 的配置文件不同。Bash 用 `~/.bashrc` 或 `~/.bash_profile`，Zsh 用 `~/.zshrc`，Fish 用 `~/.config/fish/config.fish`。安装脚本会尝试自动修改，但如果没生效，手动加一行：

```bash
# Bash
echo 'export PATH="$HOME/.codex/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Zsh
echo 'export PATH="$HOME/.codex/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Bubblewrap 依赖：** Codex 的 Linux 沙箱依赖 `bwrap`（Bubblewrap）命令。大多数桌面发行版默认没有安装。如果沙箱相关功能报错：

```bash
# Ubuntu/Debian
sudo apt install bubblewrap

# Fedora
sudo dnf install bubblewrap

# Arch
sudo pacman -S bubblewrap
```

一键脚本安装不会自动装这个依赖，需要你手动装。

## 4. Windows 安装

Windows 是 Codex 支持的三个平台中配置选项最多的一个。你面临两个选择：原生运行还是 WSL2 运行。两种路径都行，各有适用场景。

### 先决定：原生还是 WSL2

| 对比项 | Windows 原生 | WSL2 |
|--------|-------------|------|
| 安装复杂度 | 低（一条 PowerShell 命令） | 中（先装 WSL2，再装 Codex） |
| 沙箱实现 | Windows 受限令牌 + ACL + WFP 过滤 | Bubblewrap（和 Linux 一致） |
| 终端 | PowerShell / Windows Terminal | WSL2 内的 Bash/Zsh |
| 性能 | 原生性能 | 接近原生（项目放 WSL2 文件系统内时） |
| 适用场景 | Windows 为主力开发环境 | 需要 Linux 工具链的项目 |

OpenAI 官方推荐：优先用原生方式跑。WSL2 适合你的工作流已经跑在 WSL2 里、或者项目依赖 Linux 原生工具的场景。

还有一个版本限制：Windows 11 是官方推荐平台。Windows 10 1809+ 勉强能用，但 ConPTY 支持不完善，可能遇到渲染问题。Windows 10 旧版本不推荐。

### 方式一：PowerShell 脚本（推荐，原生 Windows）

打开 PowerShell（不需要管理员权限），粘贴：

```powershell
powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"
```

拆解这条命令：

- `powershell -ExecutionPolicy ByPass`：临时绕过执行策略限制。Windows 默认不允许运行远程脚本，`ByPass` 临时允许
- `-c "..."`：执行引号内的命令
- `irm`：`Invoke-RestMethod` 的缩写，从 URL 下载脚本内容
- `| iex`：管道传给 `Invoke-Expression` 执行下载的脚本

脚本会下载对应架构的 Windows 二进制，放到 `%USERPROFILE%\.codex\bin\` 目录，并尝试把该目录加到用户的 `PATH` 环境变量。

验证（新开一个 PowerShell 窗口）：

```powershell
codex --version
# 预期输出类似：codex 0.116.0

Get-Command codex
# 预期输出类似：C:\Users\你的用户名\.codex\bin\codex.exe
```

升级：重新跑同一条安装命令。

### 方式二：npm（原生 Windows）

和 macOS/Linux 一样，前提是有 Node.js 16+。Windows 上安装 Node.js 最快的方式：

```powershell
# 用 winget 安装 Node.js LTS
winget install OpenJS.NodeJS.LTS

# 安装完后重新打开 PowerShell
node --version
# 预期输出类似：v22.4.0
```

然后全局安装 Codex：

```powershell
npm install -g @openai/codex
```

npm 在 Windows 上的行为和 macOS/Linux 一致：下载平台特定的 Rust 二进制。Windows x64 对应的包是 `@openai/codex-win32-x64`，ARM64 对应 `@openai/codex-win32-arm64`。

### Windows 沙箱模式

如果你选择原生运行（不用 WSL2），Codex 在 Windows 上提供两种沙箱模式，在 `config.toml` 里配置：

```toml
[windows]
sandbox = "elevated"  # 或 "unelevated"
```

**elevated 模式**（推荐）：使用低权限沙箱用户、文件系统权限边界、防火墙规则。首次启动时需要你批准 UAC（用户账户控制）弹窗，让 Codex 创建沙箱用户和配置防火墙规则。隔离强度最高。

**unelevated 模式**（备选）：不创建独立沙箱用户，用受限令牌从你的当前用户派生。隔离强度低一些，但不需要管理员权限。如果你的电脑被企业策略管控、UAC 弹窗被 IT 部门禁止了，用这个模式。

选择原则：能用 `elevated` 就用 `elevated`，不行再降级到 `unelevated`。

### WSL2 安装步骤（如果你选择 WSL2）

**第一步：安装 WSL2**

在 PowerShell（管理员模式）里运行：

```powershell
wsl --install
```

这条命令会启用 Windows 的 WSL 功能，下载并安装默认的 Linux 发行版（通常是 Ubuntu）。安装完后需要重启电脑。

**第二步：在 WSL2 内安装 Codex**

重启后打开 WSL2 终端（Windows Terminal 里选 Ubuntu 标签，或在开始菜单搜"Ubuntu"），然后按 Linux 方式安装：

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

**第三步：确认项目位置**

在 WSL2 里工作时，把项目放在 Linux 文件系统内（`~/code/...`），不要放在 `/mnt/c/...`。后者是 Windows 磁盘的挂载路径，I/O 性能会差很多。

```bash
# 推荐
mkdir -p ~/code && cd ~/code
git clone https://github.com/your/repo.git

# 不推荐（慢）
cd /mnt/c/Users/你的用户名/projects/
```

**第四步：配置 Windows Terminal**

如果你用 Windows Terminal，可以配置默认启动 WSL2。打开设置 → 配置文件 → 把 Ubuntu 设为默认。这样每次打开终端就自动进入 WSL2 环境。

### Windows 常见问题

**执行策略阻止脚本运行：** 如果你看到 `UnauthorizedAccess` 报错，说明 PowerShell 执行策略不允许运行脚本。安装命令已经用了 `-ExecutionPolicy ByPass` 绕过，但如果你单独下载了 `.ps1` 脚本想手动跑，需要先改策略：

```powershell
# 查看当前策略
Get-ExecutionPolicy

# 改为允许本地脚本
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**PATH 没生效：** Windows 修改 `PATH` 后，已经打开的 PowerShell/CMD 窗口不会自动刷新。关闭所有终端窗口，重新打开一个，或者注销再登录。

**中文用户名路径问题：** 如果你的 Windows 用户名包含中文字符，`%USERPROFILE%` 路径里会有中文。Codex 本身支持中文路径，但某些依赖工具可能不认。如果遇到奇怪的路径问题，试试把 `codex.exe` 移到一个纯英文路径下（比如 `C:\Tools\codex\`），然后手动把这个路径加到 PATH。

**杀毒软件拦截：** Windows Defender 或第三方杀毒软件可能会把刚下载的 `codex.exe` 当作未知程序拦截。如果你看到"已阻止运行"的提示，手动允许即可。在 Windows Defender 里：设置 → 更新和安全 → Windows 安全中心 → 病毒和威胁防护 → 保护历史记录 → 找到被拦截的项 → 允许。

**SmartScreen 拦截：** 首次运行 `codex.exe` 可能触发 Windows SmartScreen 的"Windows 已保护你的电脑"提示。点"更多信息" → "仍要运行"。

## 5. npm 安装方式详解

npm 方式在三个平台上命令完全一致，单独拿出来讲清楚它的机制。

### 前置条件

需要 Node.js 16 或更高版本。检查方式：

```bash
node --version
# 如果输出 v16.x.x 或更高，OK
# 如果输出 v14.x.x 或更低，需要升级
```

如果没有 Node.js，推荐用版本管理器安装（nvm、fnm、Volta 都行），避免用系统包管理器装出过时版本。

### 安装命令

```bash
npm install -g @openai/codex
```

`-g` 表示全局安装，装完后 `codex` 命令在任意目录都能用。

### npm 包做了什么

`@openai/codex` 这个 npm 包的核心文件是 `bin/codex.js`，大概 200 行 JavaScript 代码。它的工作流程：

1. 读取 `process.platform`（`darwin`、`linux`、`win32`）和 `process.arch`（`x64`、`arm64`）
2. 映射到对应的平台包名，比如 macOS ARM64 对应 `@openai/codex-darwin-arm64`
3. 在这些平台包里找到预编译的 Rust 二进制
4. 执行这个二进制，把命令行参数透传过去

所以你通过 npm 装的 Codex，跑的 100% 是 Rust 编译的原生代码，不是 JavaScript 模拟的。Node.js 只是"快递员"，负责把二进制送到你的机器上。

### 平台包对应表

| 系统 | 架构 | npm 包名 |
|------|------|----------|
| macOS | ARM64（M 系列） | `@openai/codex-darwin-arm64` |
| macOS | x64（Intel） | `@openai/codex-darwin-x64` |
| Linux | x64 | `@openai/codex-linux-x64` |
| Linux | ARM64 | `@openai/codex-linux-arm64` |
| Windows | x64 | `@openai/codex-win32-x64` |
| Windows | ARM64 | `@openai/codex-win32-arm64` |

这些包都是 `optionalDependencies`，npm 会根据你的平台自动装对应的那一个。

### npm 方式的优劣

**优点：**
- 跨平台命令一致，写文档和 CI 脚本时不用区分
- `npm update -g @openai/codex` 一条命令升级
- 和前端项目的工具链统一管理

**缺点：**
- 需要 Node.js 环境（对于纯 Python/Rust/Go 项目来说是额外依赖）
- 安装时如果用了 `--no-optional`，会跳过平台二进制导致安装失败
- 在网络受限环境下，npm registry 和二进制下载是两个不同的请求，两个都可能出问题

## 6. 验证安装成功

不管你用了哪种安装方式，验证步骤一样。

### 检查版本

```bash
codex --version
```

预期输出类似：

```
codex 0.116.0
```

如果你看到版本号，说明二进制下载成功、PATH 配置正确、可执行权限都没问题。

### 检查安装位置

```bash
# macOS/Linux
which codex

# Windows PowerShell
Get-Command codex
```

输出应该指向你安装时选择的目录，比如：

- 一键脚本安装：`/Users/xxx/.codex/bin/codex`
- Homebrew 安装：`/opt/homebrew/bin/codex`（Apple Silicon）或 `/usr/local/bin/codex`（Intel）
- npm 安装：npm 全局 bin 目录下
- 手动安装：你放的那个目录

### 查看帮助信息

```bash
codex --help
```

这会列出所有可用的子命令和选项。主要的有：

- `codex`：启动交互式 TUI
- `codex exec "你的指令"`：非交互模式，直接执行一条指令
- `codex sandbox "命令"`：在沙箱内运行指定命令
- `codex app`：启动桌面 App 模式

### 首次运行

```bash
codex
```

第一次运行时，Codex 会显示登录提示。你有两个选择：

1. **Sign in with ChatGPT**：浏览器打开 OpenAI 登录页，用你的 ChatGPT Plus/Pro/Business/Enterprise 账号登录，授权后回到终端。整个过程和 `gh auth login` 类似。
2. **Use API Key**：如果你有 OpenAI API Key，可以先设置环境变量：

   ```bash
   export OPENAI_API_KEY="sk-..."
   ```

   然后运行 `codex`，它会自动检测到 Key 并跳过登录流程。

### 升级

不同安装方式的升级命令：

| 安装方式 | 升级命令 |
|----------|----------|
| 一键脚本 | `curl -fsSL https://chatgpt.com/codex/install.sh \| sh` |
| Homebrew | `brew upgrade --cask codex` |
| npm | `npm update -g @openai/codex` |
| 手动下载 | 重新下载新版二进制覆盖旧文件 |

## 7. 常见安装问题排查

按报错信息对号入座。

### "command not found: codex"

**原因：** 终端找不到 `codex` 命令，PATH 没配好。

**排查步骤：**

```bash
# 1. 确认二进制文件存在
ls ~/.codex/bin/codex          # 一键脚本安装
ls /usr/local/bin/codex         # 手动安装
ls ~/.local/bin/codex           # 手动安装（用户级）

# 2. 确认该目录在 PATH 里
echo $PATH | tr ':' '\n' | grep codex
# 如果没有输出，说明 PATH 没配好

# 3. 手动加到 PATH
echo 'export PATH="$HOME/.codex/bin:$PATH"' >> ~/.zshrc   # Zsh
echo 'export PATH="$HOME/.codex/bin:$PATH"' >> ~/.bashrc  # Bash
source ~/.zshrc  # 或 source ~/.bashrc
```

**Windows 上：** 关闭所有 PowerShell/CMD 窗口重新打开。Windows 的 PATH 环境变量修改后需要新进程才能读到。

### "Permission denied"

**原因：** 二进制文件没有可执行权限。

```bash
# 检查权限
ls -la ~/.codex/bin/codex
# 输出类似：-rw-r--r-- 1 user staff 12M ... codex
# 注意第一个 - 后面没有 x

# 加上可执行权限
chmod +x ~/.codex/bin/codex

# 再次验证
codex --version
```

### 网络超时 / 下载失败

**现象：** `curl` 报 `Connection timed out`，或者 npm 报 `ETIMEDOUT`。

**解决：**

```bash
# 检查能不能访问 chatgpt.com
curl -I https://chatgpt.com/codex/install.sh
# 如果超时，需要配置代理

# 设置代理后重试
export https_proxy=http://127.0.0.1:7890
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

如果代理也不行，换 GitHub Release 手动下载方式。

### "Node.js version too old" 或 npm 安装失败

**原因：** Node.js 版本低于 16。

```bash
node --version
# 如果低于 v16

# 用 nvm 安装新版本
nvm install --lts
nvm use --lts
node --version  # 确认版本

# 重新安装 Codex
npm install -g @openai/codex
```

如果你不想装 Node.js，用一键脚本或手动下载二进制，完全不需要 Node.js。

### macOS "cannot be opened because the developer cannot be verified"

**原因：** macOS Gatekeeper 拦截了未签名的第三方二进制。

**解决方式一：** 右键点击 `codex` 二进制 → 选择"打开" → 在弹窗里点"打开"确认。macOS 会记住你的选择，后续不会再次拦截。

**解决方式二：** 用 `xattr` 命令移除隔离属性：

```bash
xattr -d com.apple.quarantine ~/.codex/bin/codex
```

这条命令移除 macOS 给从网络下载的文件添加的 `com.apple.quarantine` 扩展属性，之后 Gatekeeper 就不会再拦截了。

### Windows SmartScreen 拦截

首次运行 `codex.exe`，Windows 可能弹出蓝色窗口："Windows 已保护你的电脑"。

点击"更多信息" → 出现"仍要运行"按钮 → 点击即可。这是 Windows 对未签名可执行文件的标准行为，不影响后续使用。

### 安装成功但 codex 没反应

**现象：** `codex --version` 有输出，但直接运行 `codex` 后终端卡住或立刻退出。

**排查：**

1. **重启 shell**：关闭终端窗口重新打开，确保 PATH 和环境变量刷新
2. **检查终端类型**：Codex 的 TUI 需要 terminal 支持。某些 minimalist 终端（比如很老版本的 Windows CMD）可能不兼容。换 Windows Terminal、iTerm2、Alacritty 试试
3. **看日志**：

   ```bash
   codex -c log_dir=./.codex-log
   # 然后
   tail -F ./.codex-log/codex-tui.log
   ```

   日志文件会显示启动过程中的错误信息
4. **API Key 问题**：如果设置了 `OPENAI_API_KEY` 但 Key 无效或过期，Codex 启动后可能静默退出。确认 Key 是否有效：

   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY" | head -20
   ```

   如果返回 401，说明 Key 过期了

### macOS 升级后 codex 失效

**原因：** macOS 大版本升级有时会重置 PATH 或清空 `/usr/local/bin`。

**解决：** 重新跑安装脚本，或者确认 `~/.codex/bin` 还在 PATH 里。

### Bubblewrap 相关错误（Linux）

**现象：** Codex 启动后沙箱相关报错，比如 `bwrap: execvp ... No such file or directory`。

**解决：** 安装 Bubblewrap：

```bash
# Ubuntu/Debian
sudo apt install bubblewrap

# Fedora
sudo dnf install bubblewrap

# Arch
sudo pacman -S bubblewrap
```

## 8. 下一步

到这里，`codex --version` 能正常输出版本号，说明安装完成。

接下来要做的是第一次登录并跑起来。本系列第 03 篇会讲 Codex 的认证方式、首次运行配置、config.toml 的关键参数，以及如何用 `AGENTS.md` 给 Codex 立规矩。

如果你已经装好了，想先自己摸索，可以跑这两条命令试水：

```bash
# 在任意项目目录里启动交互模式
cd 你的项目目录
codex

# 或者直接让 Codex 解释当前项目
codex exec "解释一下这个项目的结构和主要功能"
```

### 延伸阅读

- [Codex CLI 官方文档](https://developers.openai.com/codex/cli) — 安装、配置、使用完整参考
- [GitHub 仓库 openai/codex](https://github.com/openai/codex) — 源码、Release 下载、Issue 追踪
- [Codex Windows 设置指南](https://developers.openai.com/codex/windows) — Windows 原生沙箱和 WSL2 详细配置
- [Codex 沙箱安全文档](https://developers.openai.com/codex/concepts/sandboxing) — Seatbelt / Bubblewrap / Windows 受限令牌的技术细节
- [Codex 认证文档](https://developers.openai.com/codex/auth) — ChatGPT 登录和 API Key 配置

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
