# Settings 文件详解

> 更新日期：2025/06

**TL;DR：** Claude Code 的设置分四层：用户级（`~/.claude/settings.json`）、项目级（`.claude/settings.json`）、本地级（`.claude/settings.local.json`）、托管级（管理员下发）。托管级最高，谁也覆盖不了；本地级用来放个人偏好的覆盖；项目级提交到 git 团队共享。搞清优先级，就不会被"我明明配了怎么不生效"搞疯。

## 四层配置

### 1. 用户级：`~/.claude/settings.json`

在你的 home 目录下，跨所有项目生效。适合放个人工具偏好、常用的 MCP 服务器、你习惯的权限模式。

```json
{
  "permissions": {
    "allow": [
      "Bash(git log*)",
      "Bash(git diff*)"
    ],
    "defaultMode": "acceptEdits"
  },
  "env": {
    "EDITOR": "vim"
  }
}
```

这个文件只影响你自己，不会进入 git，不影响团队。适合放：
- 你偏好的权限默认模式
- 你个人的 MCP 服务器（比如本地数据库连接）
- 你常用的环境变量

### 2. 项目级：`.claude/settings.json`

在项目根目录的 `.claude/` 下，提交到 git，团队共享。适合放项目统一的权限规则、hooks、MCP 配置。

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run test*)",
      "Bash(npm run lint*)",
      "Bash(npm run build*)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)",
      "Read(./secrets/**)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/pre-bash.sh"
          }
        ]
      }
    ]
  }
}
```

这个文件进 git，所以只放团队通用的配置。不要把个人偏好或敏感信息放这里。

### 3. 本地级：`.claude/settings.local.json`

也在项目根目录的 `.claude/` 下，但 Claude Code 自动把它加入 `.gitignore`。适合放个人的覆盖配置——你自己的 MCP 服务器、你调试用的环境变量、你觉得烦的权限提示的 allow 规则。

```json
{
  "permissions": {
    "allow": [
      "Bash(docker*)",
      "Bash(kubectl*)"
    ]
  },
  "env": {
    "DATABASE_URL": "postgres://localhost:5432/myapp_dev"
  }
}
```

本地级存在的意义：你可以在项目统一配置的基础上，加自己的东西，不影响其他人。运行 `claude init-settings` 或在 Claude Code 里通过权限提示选择"Save to local settings"时，会自动创建这个文件。

### 4. 托管级：Managed Settings

企业管理员通过 Anthropic 管理后台、MDM 或系统级文件下发的配置。优先级最高，下面三层都覆盖不了。

```
优先级从高到低：
托管级 > 命令行参数 > 本地级 > 项目级 > 用户级
```

托管级配置的详细说明见 [50 - 企业托管设置](50-enterprise-managed-settings.md)。

## 优先级规则

同一配置项在不同层级都设了值，谁生效？规则很简单：

**托管级说了算。** 托管层定义了的键，下面所有层级对该键的值都被覆盖。用户改自己的 `settings.json` 也没用。

**托管级没定义的键，高优先级覆盖低优先级。** 顺序是：

```
命令行参数 > 本地级 > 项目级 > 用户级
```

**数组类型的字段（如 `permissions.allow`）是合并，不是覆盖。** 每一层的 allow 规则会叠加生效，不会因为项目级设了 allow 就丢掉用户级的。deny 同理。

举个具体例子：

```json
// ~/.claude/settings.json（用户级）
{
  "permissions": {
    "allow": ["Bash(git log*)"]
  }
}

// .claude/settings.json（项目级）
{
  "permissions": {
    "allow": ["Bash(npm run test*)"]
  }
}

// 最终生效：两条规则都生效
// allow = ["Bash(git log*)", "Bash(npm run test*)"]
```

但如果同一层级里 allow 和 deny 冲突了（比如一条 allow 了一条，另一条 deny 了同一条），deny 优先。

## 常用配置项

### 权限控制

```json
{
  "permissions": {
    "allow": [
      "Read",
      "Grep",
      "LS",
      "Bash(npm run test*)",
      "Bash(npm run lint*)",
      "mcp__github__*"
    ],
    "deny": [
      "Bash(rm -rf*)",
      "Bash(curl*|*sh)",
      "Read(./.env)",
      "Read(./.env.*)"
    ],
    "defaultMode": "acceptEdits"
  }
}
```

详细写法见 [45 - Fine-grained Permissions](45-fine-grained-permissions.md)。

### 环境变量

```json
{
  "env": {
    "NODE_ENV": "development",
    "DATABASE_URL": "postgres://localhost:5432/dev"
  }
}
```

通过 `env` 字段设置的环境变量，效果等同 `export`。但注意：敏感值不要放项目级 `settings.json`（会进 git），放本地级或环境变量文件。

### MCP 服务器

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

MCP 配置也可以写在根目录的 `.mcp.json` 里。两种方式效果一样，但 `.mcp.json` 是专门为 MCP 设计的格式，项目级和用户级各一份。`settings.json` 里的 `mcpServers` 字段是另一种写法。

### Hooks

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/pre-bash.sh"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write $CLAUDE_FILE_PATH"
          }
        ]
      }
    ]
  }
}
```

详细写法见 [63 - Hooks 入门](63-hooks-getting-started.md)。

### 模型和推理

```json
{
  "model": "claude-sonnet-4-6",
  "smallModel": "claude-haiku-4-5",
  "effortLevel": "medium"
}
```

- `model`：默认使用的主模型
- `smallModel`：子 agent 用的模型（省 token）
- `effortLevel`：推理深度，`low` / `medium` / `high`

### Sandbox

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "network": {
      "allowedDomains": ["github.com", "registry.npmjs.org"]
    }
  }
}
```

详细配置见 [47 - Sandbox 选择](47-sandbox-selection.md)。

## 常见问题

### "配了但没生效"

三步排查：

1. **文件路径对不对？** 用户级是 `~/.claude/settings.json`，项目级是 `.claude/settings.json`（注意前面的点号目录），本地级是 `.claude/settings.local.json`。
2. **JSON 格式对不对？** 写错一个逗号整个文件就废了。用 `jq` 验证：`cat settings.json | jq .`
3. **是不是被更高优先级覆盖了？** 在 Claude Code 里运行 `/context`，看实际加载的配置。

### "settings.json 和 .mcp.json 的 MCP 配置冲突"

两者独立生效，合并处理。同一个服务器名在两边都配了，`.mcp.json` 优先。建议把 MCP 配置统一放在 `.mcp.json`，`settings.json` 里的 `mcpServers` 字段只在需要程序化生成或和权限规则捆绑时用。

### "怎么让团队所有人都用同一套权限规则"

放在项目级的 `.claude/settings.json` 里，提交到 git。但注意：用户级和本地级的配置会叠加在上面。如果你需要强制覆盖（用户改不了），那得用托管级。详见 [50 - 企业托管设置](50-enterprise-managed-settings.md)。

### "本地级文件怎么创建"

三种方式：
1. 手动创建 `.claude/settings.local.json`
2. 在 Claude Code 的权限提示里选择"Save to local settings"
3. 运行 `claude init-settings`

创建后 Claude Code 会自动把它加入 `.gitignore`。

## 关键要点

- 四层配置：用户级 > 项目级 > 本地级 > 托管级（托管最高）
- 数组类型字段（allow / deny）是合并，标量类型是覆盖
- deny 优先于 allow
- 敏感信息不要放项目级（会进 git），放本地级或环境变量
- 项目级 `.claude/settings.json` 是团队共享配置的核心文件
- `/context` 命令可以查看实际加载的完整配置

## 延伸阅读

- [35 - `.claude` 目录全景](35-dot-claude-directory-overview.md) — 目录结构和文件定位
- [40 - 环境变量配置](40-environment-variables.md) — 另一种配置层
- [43 - Permission Modes 全解](43-permission-modes-explained.md) — 权限模式详解
- [45 - Fine-grained Permissions](45-fine-grained-permissions.md) — 权限规则写法
- [50 - 企业托管设置](50-enterprise-managed-settings.md) — 托管层详解
- [63 - Hooks 入门](63-hooks-getting-started.md) — Hooks 配置

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
