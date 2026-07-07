# 让 Codex 跑命令：shell 工具、后台终端、审批与安全

> **TL;DR** — Codex 通过内置的 shell 工具在你的机器上执行命令。命令在操作系统级沙箱里运行（macOS 用 Seatbelt，Linux 用 bwrap+Landlock，Windows 用受限令牌），stdout/stderr 全部回传给模型。审批策略控制哪些命令自动跑、哪些要你确认。需要长期运行的进程（dev server、watch）可以放进后台终端，用 `/ps` 查看状态、`/stop` 收拾摊子。本文覆盖命令执行机制、审批流程、常用场景、后台终端、login shell、环境变量策略和安全的注意事项。

---

## 1. Codex 执行命令的机制

### 1.1 内置 shell 工具

Codex 内置了一个名为 `shell` 的工具（配置键：`features.shell_tool`，默认开启）。当模型认为需要执行命令来完成你的任务时，它会生成一条工具调用请求，里面包含完整的命令字符串。Codex 收到这条请求后，把命令交给沙箱层执行，然后把 stdout 和 stderr 捕获回来，塞进对话上下文，让模型继续推理。

这个流程是自动的——你只需要提出需求（比如"跑一下测试看看哪个挂了"），模型会自己决定执行什么命令。你也可以在对话中直接指定命令（比如"运行 `npm test -- --reporter=verbose`"），模型会照办。

用 `features.shell_tool = false` 可以完全关闭 shell 工具。关掉之后 Codex 只能读写文件和调用 MCP 工具，不能执行任何命令。

### 1.2 沙箱隔离

命令不在宿主环境里直接跑。Codex 为每条命令创建一个操作系统级沙箱，隔离文件系统访问和网络访问。三个平台各自有不同的实现：

| 平台 | 沙箱实现 | 辅助程序 |
|------|---------|---------|
| macOS | Apple Seatbelt（`/usr/bin/sandbox-exec`） | 系统自带 |
| Linux | Bubblewrap + seccomp + Landlock | `codex-linux-sandbox` 辅助二进制 |
| Windows | 受限令牌 + ACL + WFP 网络过滤 | 提权辅助程序 IPC |

macOS 的 Seatbelt 是 Apple 原生的进程隔离方案。Codex 会根据当前沙箱策略（`read-only` / `workspace-write` / `danger-full-access`）生成对应的 Seatbelt profile，然后通过 `sandbox-exec` 启动命令。

Linux 上用 Bubblewrap（bwrap）做文件系统隔离，搭配 seccomp 限制系统调用，Landlock 进一步细化文件访问控制。如果系统里没有 bwrap，Codex 会尝试使用自带的内置版本作为 fallback。

Windows 用受限令牌（Restricted Token）创建子进程，通过 ACL 控制文件访问，WFP（Windows Filtering Platform）过滤网络连接。

### 1.3 命令执行环境

命令的执行环境有几个关键要素：

**工作目录**：命令在你启动 Codex 时所在的目录（也就是项目根目录）下执行。如果你用 `codex exec` 运行非交互模式，工作目录就是当前 shell 的工作目录。

**环境变量**：Codex 会把环境变量传给子进程，但不是原封不动地传——它有一个环境变量策略系统（`shell_environment_policy`），后面第 6 节会详细讲。默认行为是继承所有环境变量（`inherit = "all"`），同时自动过滤掉名字里包含 KEY/SECRET/TOKEN 的变量。

**PATH**：默认继承你的 PATH。如果环境变量策略设成 `inherit = "none"`，你需要手动在 `set` 里指定 PATH，否则命令可能找不到可执行文件。

**Shell 选择**：Codex 使用系统默认的 shell（macOS/Linux 上通常是 `/bin/zsh` 或 `/bin/bash`，Windows 上是 PowerShell）。可以通过 `allow_login_shell` 控制是否以 login shell 模式启动。

### 1.4 输出捕获

命令的 stdout 和 stderr 会被完整捕获，回传给模型。模型能看到的输出有一个 token 上限（由 `tool_output_token_limit` 控制，默认 12000 tokens）。超长的输出会被截断——模型看到的是前面的部分加上一个截断标记。

带来的影响：

- 编译错误、测试失败、lint 报告这些关键信息会直接喂给模型
- 如果输出特别长（比如跑了几千行日志），后面的部分会被截断
- 你可以在对话里追问模型看完整输出，或者让模型把输出写到文件里再分析

### 1.5 超时处理

Codex 给每条命令设置了一个超时时间。如果命令在超时内没有完成，Codex 会终止它并报告超时错误给模型。

对于需要长时间运行的命令（比如 dev server、watch 进程），Codex 有专门的后台终端机制（第 4 节），不会把它们当作普通命令来处理。

---

## 2. 命令审批流程

Codex 的审批系统决定了命令是自动执行还是要你确认。配置键是 `approval_policy`，配合沙箱模式（`sandbox_mode`）一起使用。

### 2.1 三种审批模式

**`on-request`（默认）**：模型自己判断哪些命令需要你确认。对于安全的只读命令（`git status`、`git log`、`ls` 等），模型会直接执行。对于可能有副作用的命令（安装包、运行测试、启动服务），模型会请求你的确认。

**`untrusted`**：只有已知安全的只读命令会自动执行，其他所有命令都要你确认。这是最保守的模式，适合不信任项目来源的场景（比如从 GitHub 随便 clone 下来的仓库）。

**`never`**：所有命令自动执行，不弹出任何确认。风险最高，只在完全信任环境和任务的情况下使用（比如 CI/CD 管道里跑 `codex exec`）。

还有第四种：**`{ granular = { ... } }`** 细粒度模式，可以按类别控制哪些审批弹窗允许出现（`sandbox_approval`、`rules`、`mcp_elicitations`、`request_permissions`、`skill_approval`）。

### 2.2 审批时你看到什么

当 Codex 需要你审批一条命令时，TUI 会弹出一个审批面板，显示：

1. **要执行的命令**：完整的命令文本
2. **执行原因**：模型给出的理由（比如"运行测试来验证修改"）
3. **操作选项**：
   - `y` — 批准执行这一次
   - `a` — 本次会话内自动批准类似命令
   - `n` — 拒绝
   - `e` — 编辑命令后再执行

### 2.3 沙箱模式与审批的配合

`approval_policy` 和 `sandbox_mode` 是两个独立的控制维度：

- `approval_policy` 控制的是"要不要问人"
- `sandbox_mode` 控制的是"命令能在文件系统上干什么"

常见的组合：

```toml
# 日常开发：让模型决定何时询问，允许写工作区
approval_policy = "on-request"
sandbox_mode = "workspace-write"

# 审查陌生代码：所有命令都要确认，只读
approval_policy = "untrusted"
sandbox_mode = "read-only"

# CI 自动化：全自动，完全访问
approval_policy = "never"
sandbox_mode = "danger-full-access"
```

### 2.4 自动审批

如果你不想亲自审批但又不想完全放开，可以启用自动审批：

```toml
approvals_reviewer = "auto_review"

[auto_review]
policy = """
允许运行测试命令和构建命令。
拒绝任何包含 rm -rf 或 drop database 的命令。
"""
```

`auto_review` 会让一个子代理来审批命令。你可以用 `[auto_review].policy` 写自定义审批规则。企业管理员可以用 `guardian_policy_config` 从云端下发审批策略，优先级高于本地配置。

### 2.5 危险命令识别

Codex 的执行策略引擎（execpolicy）用前缀规则（`prefix_rules`）来识别危险命令。每条规则包含一个命令前缀模式和一个决策（`allow` / `prompt` / `forbidden`）。

规则来源有三层：

1. **内置规则**：Codex 自带的默认规则，识别常见的危险命令
2. **项目规则**：`.rules` 文件里的规则（项目级别）
3. **管理员规则**：`requirements.toml` 里的规则（不可覆盖）

管理员规则只能设成 `prompt` 或 `forbidden`（不能设成 `allow`），因为需求规则的设计原则是"只能加限制不能减限制"。

典型的危险命令前缀包括 `rm -rf`、`sudo`、`drop database`、`chmod 777` 等。如果你想阻止某个特定命令，可以在项目规则里加一条：

```toml
# .rules 文件中的前缀规则示例
[[rules.prefix_rules]]
decision = "forbidden"
justification = "不允许删除 node_modules"

[[rules.prefix_rules.pattern]]
token = "rm"

[[rules.prefix_rules.pattern]]
token = "-rf"

[[rules.prefix_rules.pattern]]
token = "node_modules"
```

---

## 3. 常用命令场景

### 3.1 编译构建

```bash
# Node.js / 前端项目
npm run build

# Rust 项目
cargo build --release

# Go 项目
go build ./...

# Python 项目
pip install -e .
```

构建命令是 Codex 执行频率最高的一类命令。典型工作流是：Codex 修改了代码，然后跑构建看看有没有编译错误。如果有，它会根据错误信息修复代码，再跑构建，直到通过。

**注意事项**：

- 构建可能产生大量输出。如果输出被截断，可以让 Codex 把完整日志写到文件里
- 某些构建工具（webpack、esbuild）会启动监听模式，这类命令需要用后台终端运行
- Rust 的 `cargo build` 首次编译可能很慢，后续增量编译会快很多

### 3.2 运行测试

```bash
# JavaScript / TypeScript
npm test
npm test -- --reporter=verbose
bun test

# Python
pytest tests/
pytest tests/test_auth.py -v

# Go
go test ./...
go test -run TestSpecificFunction ./pkg/...

# Rust
cargo test
cargo test --test integration
```

跑测试是 Codex 最常见的验证手段。它会先运行测试看哪些失败，然后修复代码，再跑测试确认修复有效。

**注意事项**：

- 如果测试套件很大，可以指定只跑某个文件或某个测试函数，加快反馈速度
- 集成测试可能需要数据库或其他服务，确保沙箱里有网络访问权限或本地服务在跑
- 测试覆盖率工具（`jest --coverage`、`pytest --cov`）的输出能帮模型定位未覆盖的代码路径

### 3.3 代码检查

```bash
# JavaScript / TypeScript
npx eslint src/
npx prettier --check src/

# Rust
cargo clippy -- -W clippy::all

# Go
golangci-lint run

# Python
ruff check src/
mypy src/
```

**注意事项**：

- lint 工具的输出格式通常很结构化，Codex 能直接解析并修复
- 有些 lint 规则可以自动修复（`eslint --fix`、`prettier --write`），让 Codex 跑自动修复然后验证结果
- typecheck 和 lint 是互补的：typecheck 检查类型错误，lint 检查风格和潜在问题

### 3.4 包管理

```bash
# Node.js
npm install
npm install express
npm install --save-dev jest
bun add express

# Rust
cargo add serde --features derive

# Go
go get github.com/gin-gonic/gin@latest

# Python
pip install requests
uv add pandas
```

安装包的命令会修改 `package.json`/`Cargo.toml`/`go.mod`/`pyproject.toml` 和锁文件。如果沙箱是 `workspace-write` 模式，这些写操作在沙箱内就能完成。如果是 `read-only` 模式，Codex 会请求提升权限。

**注意事项**：

- 安装包可能需要网络访问。如果沙箱默认不允许网络，需要在配置里开启：`sandbox_workspace_write.network_access = true`
- 有些包管理器（npm、pip）会从网络下载，如果网络不通，安装会失败
- `npm install` 可能产生大量日志输出，模型会关注是否有报错

### 3.5 Git 操作

```bash
# 只读命令（安全）
git status
git log --oneline -10
git diff HEAD~1
git diff --stat
git branch -a

# 写操作（需要审批）
git add .
git commit -m "feat: add auth middleware"
git checkout -b feature/auth
git push origin feature/auth
```

只读的 Git 命令在所有审批模式下都会自动执行。写操作（commit、push、checkout）通常需要你的确认。

**注意事项**：

- `git diff` 是 Codex 理解代码变更的主要手段之一。它会通过 diff 查看你做了什么修改
- `git status` 帮助模型了解当前工作区的状态
- 在 `workspace-write` 模式下，`.git/` 目录可能被设为只读，所以 `git commit` 可能需要沙箱外的权限提升

### 3.6 服务启动

```bash
# 开发服务器（需要后台运行）
npm run dev
python manage.py runserver
cargo run --bin server

# Docker 服务
docker compose up
docker compose up -d db redis
```

开发服务器、watch 进程这类命令会持续运行，不会自动退出。它们需要用后台终端来运行，否则会一直卡住。

**注意事项**：

- dev server 通常需要后台终端（第 4 节）
- Docker 命令可能需要 sudo 权限或者 Docker daemon 在运行
- 服务启动后需要等端口就绪才能测试。可以让 Codex 跑一个简单的 curl 来检查

### 3.7 数据库操作

```bash
# 安全的只读操作
psql -c "SELECT version();"
sqlite3 dev.db ".tables"

# 危险操作（会被阻止或需要审批）
psql -c "DROP TABLE users;"
redis-cli FLUSHALL
```

数据库操作需要特别注意。只读查询一般没问题，但任何修改数据库的命令都应该在你的明确审批下执行。

---

## 4. 后台终端

### 4.1 为什么需要后台终端

有些命令不会自己退出：

- 开发服务器（`npm run dev`、`python -m http.server`）
- 文件监听进程（`npm run watch`、`cargo watch`）
- 长时间运行的编译或处理任务

如果用普通 shell 工具执行这些命令，Codex 会一直等它结束，而它永远不会结束。解决方案是后台终端。

### 4.2 unified exec 工具

Codex 的后台终端能力由 `unified_exec` 工具提供（配置键：`features.unified_exec`）。这是一个基于 PTY（伪终端）的执行工具，支持前台和后台两种模式。

`unified_exec` 默认在 macOS 和 Linux 上启用，Windows 上默认关闭。它把 shell 执行和 patch 执行整合到单一的代码路径里，是 Codex 生产环境实际使用的执行引擎。

启用方式：

```toml
[features]
unified_exec = true
```

当 `unified_exec` 启用时，模型可以选择把命令放到后台终端里运行。后台终端会持续存在，Codex 会定期轮询它的输出。

### 4.3 /ps：查看后台终端

在 TUI 里输入 `/ps` 可以查看当前所有后台终端的状态和最近的输出：

```
> /ps

Background terminals:
  [1] npm run dev
    Last output:
    > dev server running at http://localhost:3000
    > ready in 1.2s

  [2] npm run test -- --watch
    Last output:
    > Tests: 42 passed, 0 failed
    > Watch mode: waiting for changes
```

每个后台终端会显示它执行的命令和最近三行非空输出，让你一眼就能看出进度。

### 4.4 /stop 和 /clean：停止后台终端

当你不再需要后台进程时：

- `/stop` — 停止当前会话的所有后台终端
- `/clean` — `/stop` 的别名，效果完全一样

```
> /stop
Stopped 2 background terminals.
```

目前 Codex 不支持停止单个后台终端——`/stop` 会一把全停。如果只想停一个，可以退出会话或等它超时。

### 4.5 超时配置

后台终端有一个轮询超时机制。如果后台终端在指定时间内没有新的输出，Codex 会认为它可能卡住了。配置键是 `background_terminal_max_timeout`，默认值 300000 毫秒（5 分钟）：

```toml
# 延长到 10 分钟
background_terminal_max_timeout = 600000
```

### 4.6 实际工作流

一个典型的开发场景：

1. 你让 Codex 启动 dev server：*"启动开发服务器"*
2. Codex 在后台终端里运行 `npm run dev`
3. 你继续给 Codex 其他任务（修改代码、跑测试等）
4. 随时用 `/ps` 检查 dev server 状态
5. 工作完成后用 `/stop` 关闭 dev server

```
你：启动开发服务器，然后把首页的标题改成"欢迎回来"

Codex：我会在后台终端启动开发服务器，然后修改首页标题。
  [后台] npm run dev → http://localhost:3000 ready

  修改 src/pages/Home.tsx：
  - <h1>Hello World</h1>
  + <h1>欢迎回来</h1>

你：/ps
后台终端：
  [1] npm run dev
    > HMR update: src/pages/Home.tsx
    > Page reloaded

你：/stop
已停止 1 个后台终端。
```

---

## 5. login shell 行为

### 5.1 什么是 login shell

login shell 和非 login shell 的区别在于 shell 启动时加载哪些配置文件：

- **login shell** 会加载 `~/.bash_profile`、`~/.zprofile`、`~/.profile` 等文件
- **非 login shell** 只加载 `~/.bashrc`、`~/.zshrc` 等文件

如果你在 `.zshrc` 或 `.bash_profile` 里定义了项目专用的环境变量（比如 `export MY_TOOLCHAIN=/opt/custom`），这些变量只有在 login shell 里才可用。

### 5.2 allow_login_shell 配置

Codex 用 `allow_login_shell` 配置键控制是否允许 login shell：

```toml
# 允许 login shell（默认）
allow_login_shell = true

# 禁止 login shell
allow_login_shell = false
```

默认值是 `true`。设成 `false` 后，所有 shell 工具都会使用非 login shell，模型发出的 `login = true` 请求会被拒绝。

### 5.3 什么时候需要 login shell

如果你的开发环境依赖 `.zshrc` 或 `.bash_profile` 里定义的东西：

- 自定义的 PATH（比如 `~/.pyenv/shims`、`~/.nvm/versions/node/v20/bin`）
- 通过 `direnv`、`asdf`、`nvm` 等版本管理工具设置的环境变量
- 公司内部的工具路径和环境变量

这些情况下需要 login shell，否则命令可能找不到正确的工具版本。

### 5.4 安全权衡

login shell 会执行你的 shell 配置文件。如果你的配置文件里有不可信的内容（比如从网上复制来的脚本），这可能带来安全风险。不过 Codex 有沙箱隔离，命令的实际文件系统访问权限仍然受沙箱策略控制。

如果你担心这个问题，可以：

1. 把 `allow_login_shell` 设成 `false`
2. 用 `shell_environment_policy.set` 手动注入需要的环境变量
3. 用 `shell_environment_policy.inherit = "all"` 让 Codex 从当前进程环境继承变量（不依赖 shell 配置文件）

---

## 6. shell 环境策略

`shell_environment_policy` 控制 Codex 把哪些环境变量传给子进程。这个机制有多个层次，按顺序处理：

### 6.1 inherit：基准继承

```toml
[shell_environment_policy]
inherit = "all"    # 继承所有环境变量（默认）
# inherit = "core"  # 只继承核心变量（PATH, HOME, USER, SHELL, TMPDIR 等）
# inherit = "none"  # 不继承任何变量，从零开始
```

- **`all`（默认）**：继承当前进程的所有环境变量。最方便，但可能泄露敏感信息。
- **`core`**：只继承一组核心变量。适合需要更严格控制的环境。
- **`none`**：什么都不继承。需要你手动指定所有需要的变量。最安全但最麻烦。

### 6.2 自动过滤

不管 `inherit` 设成什么，Codex 默认会过滤掉名字里包含 `KEY`、`SECRET`、`TOKEN` 的变量（不区分大小写）。这个行为由 `ignore_default_excludes` 控制：

```toml
[shell_environment_policy]
ignore_default_excludes = false  # 保持默认过滤（推荐）
# ignore_default_excludes = true  # 不过滤敏感变量（不推荐）
```

被过滤的变量包括 `AWS_SECRET_ACCESS_KEY`、`GITHUB_TOKEN`、`OPENAI_API_KEY` 等。这样模型的工具调用输出里就不会意外暴露你的密钥。

### 6.3 exclude：黑名单

在继承的基础上，排除匹配 glob 模式的变量：

```toml
[shell_environment_policy]
exclude = ["AWS_*", "AZURE_*", "GCP_*"]
```

模式是不区分大小写的 glob（支持 `*`、`?`、`[A-Z]`）。`AWS_*` 会匹配所有以 `AWS_` 开头的变量。

### 6.4 include_only：白名单

只保留匹配的变量，丢弃其他所有：

```toml
[shell_environment_policy]
include_only = ["PATH", "HOME", "LANG", "LC_*", "NODE_*"]
```

如果 `include_only` 非空，只有匹配的变量会保留。这是最严格的控制方式。

### 6.5 set：注入环境变量

无论前面的过滤结果如何，`set` 里的变量总会被注入，并且优先级最高：

```toml
[shell_environment_policy]
inherit = "none"
set = { PATH = "/usr/bin:/usr/local/bin", HOME = "/Users/me", NODE_ENV = "development" }
```

这在你需要给 Codex 的子进程一个完全受控的环境时很有用。

### 6.6 策略组合示例

一个实际的安全配置：

```toml
[shell_environment_policy]
inherit = "all"                    # 继承大部分变量
ignore_default_excludes = false    # 过滤掉密钥
exclude = ["AWS_*", "AZURE_*"]     # 额外排除云厂商变量
set = { NODE_ENV = "test" }        # 注入测试环境标记
```

处理顺序是：inherit 取基准 -> 默认过滤密钥 -> exclude 移除匹配项 -> include_only 保留匹配项 -> set 覆盖/注入。

### 6.7 shell_snapshot：加速重复命令

`features.shell_snapshot`（默认开启）会在首次执行命令时快照 shell 环境。后续执行命令时，Codex 可以直接使用快照，不用重新初始化 shell，加快命令启动速度。

```toml
[features]
shell_snapshot = true  # 默认值
```

快照的内容包括环境变量、PATH、shell 函数等。如果你的环境发生了变化（比如安装了新工具），可以重启 Codex 来刷新快照。

---

## 7. 安全注意事项

### 7.1 沙箱的文件系统限制

三种沙箱模式对文件系统的控制程度不同：

| 模式 | 读 | 写 | 说明 |
|------|----|----|------|
| `read-only` | 工作区可读 | 不允许写 | 最安全，只能看不能改 |
| `workspace-write` | 工作区可读 | 工作区可写 | 日常开发用，可写范围限定在项目目录内 |
| `danger-full-access` | 全盘可读 | 全盘可写 | 无任何限制，只在特殊场景下使用 |

在 `workspace-write` 模式下，你可以用 `sandbox_workspace_write.writable_roots` 添加额外的可写目录：

```toml
[sandbox_workspace_write]
writable_roots = ["/Users/me/.pyenv/shims"]
network_access = false
```

### 7.2 网络限制

默认情况下，沙箱内的命令**不能访问网络**。这是为了防止模型无意中（或被恶意提示引导）访问外部服务、泄露数据。

如果命令需要网络（`npm install`、`pip install`、`curl`、API 调用等），需要显式开启：

```toml
[sandbox_workspace_write]
network_access = true
```

或者使用更精细的网络代理功能：

```toml
[features.network_proxy]
enabled = true

[features.network_proxy.domains]
"api.openai.com" = "allow"
"registry.npmjs.org" = "allow"
"evil.example.com" = "deny"
```

### 7.3 危险命令黑名单

Codex 的 execpolicy 引擎通过前缀规则识别危险命令。内置的规则会自动标记以下类型的命令：

- 文件删除（`rm -rf`、`del /s /q`）
- 权限修改（`chmod 777`、`sudo`）
- 数据库操作（`DROP DATABASE`、`FLUSHALL`）
- 格式化磁盘（`mkfs`、`dd if=/dev/zero`）

这些命令会被标记为 `prompt`（需要确认）或 `forbidden`（直接拒绝）。

管理员可以在 `requirements.toml` 里添加额外的规则，这些规则不能被用户覆盖：

```toml
# requirements.toml
[[rules.prefix_rules]]
decision = "forbidden"
justification = "公司策略：不允许在生产环境执行数据库迁移"

[[rules.prefix_rules.pattern]]
token = "rails"

[[rules.prefix_rules.pattern]]
token = "db:migrate"
```

### 7.4 danger-full-access 的风险

`danger-full-access` 模式完全关闭沙箱。命令可以读写任何文件、访问任何网络地址。后果包括：

- 命令可以修改 `~/.ssh/` 下的密钥文件
- 命令可以读取浏览器 cookie 和保存的密码
- 命令可以访问内网服务
- 命令可以安装系统级软件

只有在以下情况下才应该使用这个模式：

1. 你在一个隔离的环境里（容器、虚拟机）
2. 你完全信任项目来源和模型的行为
3. 任务确实需要广泛的系统访问权限

### 7.5 生产数据安全

如果你在生产机器上使用 Codex：

- 永远不要用 `danger-full-access` 模式
- 用 `shell_environment_policy` 过滤掉所有包含生产数据库凭据的环境变量
- 考虑用 `requirements.toml` 禁止访问生产数据库的命令前缀
- 使用 `approval_policy = "untrusted"` 确保每条命令都经过审批

---

## 8. 常见问题

### 命令超时怎么办

如果命令执行时间超出超时限制，Codex 会终止它。解决办法：

- 把长时间运行的命令放到后台终端里
- 调大 `background_terminal_max_timeout`
- 拆分任务，让模型分步执行

### 命令输出被截断

`tool_output_token_limit` 默认 12000 tokens。如果输出超过这个限制，后面的内容会被截断。解决办法：

```toml
tool_output_token_limit = 24000  # 调大限制
```

或者让模型把输出写到文件里再分析：

```
你：把完整的测试输出写到 test-output.txt 文件里
```

### 交互式命令无法使用

像 `vim`、`top`、`less`、`ssh` 这类需要交互式终端输入的命令在 Codex 的沙箱里**无法正常使用**。Codex 的 shell 工具是面向批处理的，不支持交互式输入。

替代方案：

- 用 `cat` 代替 `less` 查看文件内容
- 用 `head -n 50` 或 `tail -n 50` 只看部分内容
- 让 Codex 直接读取文件（它有文件读取工具，不需要 cat）
- 用非交互式的 `ssh` 命令（`ssh user@host "command"`）

### 环境变量缺失

如果命令报"command not found"或缺少某个环境变量，检查：

1. `shell_environment_policy.inherit` 是否设成了 `none` 或 `core`
2. 需要的变量是否被 `exclude` 过滤掉了
3. 是否需要开启 `allow_login_shell` 来加载 shell 配置文件
4. 是否需要用 `set` 手动注入变量

### 权限不够（Permission denied）

在 `read-only` 模式下，命令尝试写文件会被拒绝。在 `workspace-write` 模式下，如果写入路径在工作区外也会被拒绝。

解决办法：

- 确认 `sandbox_mode` 设置正确
- 检查是否需要用 `writable_roots` 添加额外路径
- 如果确实需要广泛权限，考虑临时切换到 `danger-full-access`（审批时会提示）

### Windows 上的特殊问题

在 Windows 上：

- `unified_exec` 默认关闭，需要手动启用
- sandbox 有 `unelevated` 和 `elevated` 两种模式
- PowerShell 的命令语法和 bash 不同，模型会自动适配
- `/sandbox-add-read-dir` 可以给沙箱添加额外的可读目录

---

## 9. 下一步

本文覆盖了 Codex 执行命令的完整链路：从 shell 工具和沙箱机制，到审批策略、后台终端、环境变量管理和安全注意事项。

掌握这些知识后，你可以：

- 根据项目需求配置合适的沙箱和审批组合
- 用后台终端管理 dev server 等长期运行的进程
- 通过环境变量策略在便利和安全之间取得平衡
- 为团队设置 `requirements.toml` 中的安全基线

**下一篇**我们会聊 **会话管理**——如何保存和恢复会话、分支对话、在多个会话间切换，以及 `/resume`、`/fork`、`/compact` 等命令的使用技巧。

### 延伸阅读

- [Codex Configuration Reference](https://developers.openai.com/codex/config-reference) — 所有配置键的完整参考
- [Codex Advanced Configuration](https://developers.openai.com/codex/config-advanced) — 高级配置详解
- [Codex Slash Commands](https://developers.openai.com/codex/cli/slash-commands) — TUI 内置斜杠命令完整列表
- [Codex Permissions](https://developers.openai.com/codex/permissions) — 权限配置的详细文档
- [Agent Safehouse: Codex CLI Sandbox Analysis](https://agent-safehouse.dev/docs/agent-investigations/codex) — 第三方沙箱安全分析报告
