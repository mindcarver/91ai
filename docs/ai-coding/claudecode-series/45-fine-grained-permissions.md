# Fine-grained Permissions

> 更新日期：2025/06

**TL;DR：** Claude Code 的权限不只是"允许"或"拒绝"那么简单。你可以精确到"允许 `npm run test` 但拒绝 `npm run deploy`"、"允许读 src 目录但拒绝读 .env"、"允许 MCP 服务器 A 的工具但拒绝服务器 B 的"。规则写在 settings.json 的 `permissions.allow` 和 `permissions.deny` 里，支持通配符，deny 永远优先于 allow。

## 规则写法

权限规则是一个字符串，格式是 `Tool` 或 `Tool(pattern)`。没有 pattern 表示匹配该工具的所有用法，有 pattern 表示只匹配符合 pattern 的用法。

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Grep",
      "Bash(npm run test*)",
      "Bash(git status*)",
      "mcp__github__*"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(curl *)",
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)"
    ]
  }
}
```

规则可以写在四层配置的任何一层：用户级 `~/.claude/settings.json`、项目级 `.claude/settings.json`、本地级 `.claude/settings.local.json`、托管级。各层的 allow 规则会合并，deny 规则也会合并，但 deny 永远优先。

### 通配符语法

| 模式 | 含义 | 示例 |
|------|------|------|
| `*` | 匹配任意字符序列 | `Bash(npm run *)` 匹配所有 npm run 子命令 |
| 无 pattern | 匹配该工具的全部操作 | `Read` 匹配所有文件读取 |
| 具体值 | 精确匹配 | `Bash(git status)` 只匹配 `git status` |

通配符匹配的是工具的输入参数。对 `Bash` 来说匹配的是命令字符串，对 `Read` 来说匹配的是文件路径，对 MCP 工具来说匹配的是工具名。

### 工具名列表

常用工具名：

| 工具名 | 用途 |
|--------|------|
| `Read` | 读取文件 |
| `Write` | 写入/创建文件 |
| `Edit` | 编辑文件（字符串替换） |
| `Bash` | 执行 shell 命令 |
| `Grep` | 搜索文件内容 |
| `LS` | 列出目录 |
| `mcp__<server>__<tool>` | MCP 服务器提供的工具 |

## 工具级控制

### 允许只读操作

最常见的配置：只允许读和搜索，不允许写和执行。

```json
{
  "permissions": {
    "allow": ["Read", "Grep", "LS"],
    "deny": ["Write", "Edit", "Bash"]
  }
}
```

适合用在代码审查、文档阅读等场景。但注意：完全禁止 Bash 意味着 Claude 连 `git log` 都跑不了。

### 允许特定 Bash 命令

不用全部放开，也不用到全部禁止。用通配符精确控制：

```json
{
  "permissions": {
    "allow": [
      "Bash(git status*)",
      "Bash(git log*)",
      "Bash(git diff*)",
      "Bash(npm run test*)",
      "Bash(npm run lint*)"
    ],
    "deny": [
      "Bash(git push*)",
      "Bash(npm run deploy*)"
    ]
  }
}
```

通配符 `*` 匹配命令后面的所有字符。`Bash(npm run test*)` 会匹配 `npm run test`、`npm run test:unit`、`npm run test -- --watch` 等等。

### 阻止危险的 Bash 命令

```json
{
  "permissions": {
    "deny": [
      "Bash(rm -rf *)",
      "Bash(curl *| *sh)",
      "Bash(wget *)",
      "Bash(sudo *)",
      "Bash(chmod 777 *)",
      "Bash(> /etc/*)",
      "Bash(mkfs *)"
    ]
  }
}
```

这些规则单独放在 deny 里就够了——不需要在 allow 里再加什么。deny 规则独立生效，不依赖 allow 列表。

## 路径级控制

### 保护敏感文件

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)",
      "Read(./credentials/**)",
      "Read(./**/id_rsa)",
      "Read(./**/id_ed25519)",
      "Write(./.env*)",
      "Write(./secrets/**)"
    ]
  }
}
```

路径匹配规则：

- `./` 开头表示相对于项目根目录
- `*` 匹配文件名中的任意字符
- `**` 匹配任意层级的目录
- `./secrets/**` 匹配 secrets 目录下的所有文件

### 限制写入范围

只允许写入特定目录，防止 Claude 意外修改关键配置：

```json
{
  "permissions": {
    "allow": [
      "Write(./src/**)",
      "Write(./tests/**)",
      "Edit(./src/**)",
      "Edit(./tests/**)"
    ],
    "deny": [
      "Write(./**/package.json)",
      "Write(./**/tsconfig.json)",
      "Write(./.github/**)",
      "Write(./Dockerfile*)"
    ]
  }
}
```

## 命令级控制

### 命令行参数

临时会话级别的权限调整：

```bash
# 允许特定工具
claude --allowedTools "Read,Grep,Bash(npm test)"

# 禁止特定工具
claude --disallowedTools "Write,Bash(rm *)"
```

注意：`--allowedTools` 无法覆盖任何层级的 deny 规则。`--disallowedTools` 可以在已有 deny 基础上额外添加限制。

### 插件和命令中的 allowed-tools

在自定义命令的 frontmatter 里声明该命令需要用到的工具：

```markdown
---
description: "Run tests and show coverage"
allowed-tools: ["Bash(npm test*)", "Read"]
---

# Test Command

Run the test suite and analyze results...
```

`allowed-tools` 限制了这个命令执行期间可用的工具范围。写法示例：

```yaml
allowed-tools: Read, Grep                           # 只读
allowed-tools: Bash(git:*), Read                    # git 命令 + 读
allowed-tools: Bash(git status:*), Bash(git diff:*) # 精确到子命令
allowed-tools: "*"                                  # 全部允许（慎用）
```

## MCP 控制

### 按服务器限制

MCP 工具的名称格式是 `mcp__<server>__<tool>`。用通配符可以按服务器粒度控制：

```json
{
  "permissions": {
    "allow": [
      "mcp__github__*",
      "mcp__context7__*"
    ],
    "deny": [
      "mcp__admin__*",
      "mcp__database__write_*"
    ]
  }
}
```

- `mcp__github__*` 允许 GitHub MCP 服务器的所有工具
- `mcp__database__write_*` 只禁止数据库 MCP 的写操作工具

### 按具体工具限制

更精确的控制——只允许特定工具：

```json
{
  "permissions": {
    "allow": [
      "mcp__github__list_repos",
      "mcp__github__create_issue",
      "mcp__github__search_code"
    ],
    "deny": [
      "mcp__github__delete_repo",
      "mcp__github__admin_*"
    ]
  }
}
```

### 托管级 MCP 白名单

企业管理员可以限制只允许特定的 MCP 服务器：

```json
{
  "allowManagedMcpServersOnly": true,
  "allowedMcpServers": [
    { "serverUrl": "https://api.githubcopilot.com/*" },
    { "serverUrl": "https://*.internal.example.com/*" }
  ]
}
```

`allowManagedMcpServersOnly: true` 意味着用户和项目配置里的 MCP 服务器全部被忽略，只有托管级白名单里的才能用。

## 最小权限实践

### 原则

给 Claude 最少刚好够用的权限。不是因为你信不过 Claude，而是因为：

1. **减少意外操作的风险**。权限越少，出错的爆炸半径越小。
2. **减少权限提示的打扰**。提前 allow 了需要的操作，就不会反复弹确认框。
3. **让意图更明确**。权限规则本身就是一种文档——"这个项目只应该动这些文件"。

### 渐进式配置

不要一上来就写完美的权限配置。先从宽松开始，逐步收紧：

1. **第一周**：用默认模式，观察 Claude 实际用了哪些工具和命令
2. **第二周**：把常用的操作加入 allow，把明显危险的操作加入 deny
3. **第三周**：收紧到最小权限——只 allow 必要的操作

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Grep",
      "LS",
      "Bash(git *)",
      "Bash(npm run *)",
      "Bash(cargo *)",
      "Edit(./src/**)",
      "Edit(./tests/**)"
    ],
    "deny": [
      "Bash(rm -rf *)",
      "Bash(curl *)",
      "Read(./.env*)",
      "Write(./.env*)",
      "Write(./package.json)"
    ]
  }
}
```

### 按场景的权限模板

**纯分析/审查**：
```json
{
  "permissions": {
    "allow": ["Read", "Grep", "LS", "Bash(git log*)", "Bash(git diff*)"],
    "deny": ["Write", "Edit", "Bash(git push*)"]
  }
}
```

**前端开发**：
```json
{
  "permissions": {
    "allow": ["Read", "Grep", "Edit", "Write(./src/**)", "Bash(npm run *)"],
    "deny": ["Write(./package.json)", "Write(./.env*)"]
  }
}
```

**后端开发**：
```json
{
  "permissions": {
    "allow": ["Read", "Grep", "Edit", "Bash(cargo *)", "Bash(docker *)"],
    "deny": ["Bash(docker rm *)", "Bash(docker system prune*)"]
  }
}
```

## 常见问题

### "allow 了但不生效，还是弹确认框"

检查几件事：
1. 通配符写法对不对？`Bash(npm run test)` 和 `Bash(npm run test*)` 不一样，前者只匹配精确命令
2. 是不是被更高优先级的配置覆盖了
3. 工具名大小写对不对？`read` 和 `Read` 不一样

### "deny 了但 Claude 还是执行了"

确认 deny 规则的位置。如果是写在用户级，但项目级有 allow，结果取决于具体实现——但一般来说 deny 优先。用 `/context` 确认实际加载的规则。

### "怎么临时放开一个被 deny 的操作"

临时放开的方法：
1. 用 `--allowedTools` 命令行参数（但无法覆盖 deny）
2. 在 settings.json 里注释掉对应的 deny 规则
3. 如果是托管级 deny，用户无法覆盖，只能找管理员

### "MCP 工具名怎么查"

在 Claude Code 里输入 `/context`，看 MCP 服务器提供的工具列表。工具名的格式是 `mcp__<server>__<tool>`，中间是双下划线。

## 关键要点

- 权限规则格式：`Tool` 或 `Tool(pattern)`，支持 `*` 和 `**` 通配符
- deny 规则从任何层级都优先于 allow，无法被覆盖（托管级 deny 连命令行参数都覆盖不了）
- 四层配置的 allow/deny 是合并关系，不是替换
- 路径控制用 `./` 开头表示项目根目录，`**` 匹配多层目录
- MCP 工具名格式 `mcp__<server>__<tool>`，可以用 `*` 通配整个服务器
- 最小权限不是一步到位的，从宽松开始逐步收紧

## 延伸阅读

- [39 - Settings 文件详解](39-settings-files.md) — 配置层级和优先级
- [43 - Permission Modes 全解](43-permission-modes-explained.md) — 权限模式详解
- [42 - Debug 配置加载](42-debug-config-loading.md) — 用 /context 排查权限问题
- [61 - MCP 入门](61-mcp-getting-started.md) — MCP 服务器配置
- [63 - Hooks 入门](63-hooks-getting-started.md) — 用 hooks 实现更复杂的权限逻辑
