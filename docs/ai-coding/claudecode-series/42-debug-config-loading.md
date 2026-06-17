# Debug 配置加载

> 更新日期：2025/06

**TL;DR：** Claude Code 启动时加载一堆东西——CLAUDE.md、rules、settings.json、MCP 服务器、hooks、记忆文件。出了问题不知道谁在搞鬼时，用 `/context` 看实际加载了什么，用 `/doctor` 做系统检查，用 hooks 和 MCP 的调试模式排查具体故障。这篇文章教你系统性地定位配置问题。

## 启动加载了什么

Claude Code 启动时按以下顺序加载配置（后面的可以覆盖前面的）：

1. **用户级 CLAUDE.md** — `~/.claude/CLAUDE.md`，个人全局指令
2. **用户级 settings.json** — `~/.claude/settings.json`，个人全局设置
3. **项目级 CLAUDE.md** — 项目根目录的 `CLAUDE.md` 或 `.claude/CLAUDE.md`
4. **项目级 rules** — `.claude/rules/*.md`，按 frontmatter 的 `paths` 规则匹配加载
5. **项目级 settings.json** — `.claude/settings.json`，团队共享设置
6. **本地级 settings.json** — `.claude/settings.local.json`，个人覆盖
7. **MCP 配置** — `.mcp.json`（项目级和用户级各一份）+ settings.json 里的 mcpServers
8. **Hooks 配置** — 各层级 settings.json 里的 hooks 字段
9. **环境变量** — `.env` 文件 + shell 环境变量 + settings.json 的 env 字段
10. **托管级设置** — 如果有的话，最后覆盖一切
11. **项目记忆** — `~/.claude/projects/<hash>/memory/` 下的文件

加载完成后，Claude Code 把合并后的配置注入到系统提示词里。你可以通过几种方式看到实际生效的配置。

## /context：看实际加载了什么

`/context` 是排查配置问题的第一站。运行后它会展示：

- **当前加载的 CLAUDE.md 内容**（全局 + 项目 + 本地，拼接后）
- **加载的 rules 文件**（哪些文件被加载了，哪些被过滤了）
- **settings.json 的合并结果**（权限规则、hooks、env 的最终值）
- **MCP 服务器状态**（哪些连上了，哪些失败了）
- **记忆文件内容**（MEMORY.md 和其他记忆文件）

当你怀疑"某个配置没生效"或"好像有什么东西在干扰"时，直接看 `/context` 的输出，比猜来猜去快得多。

**常见用法**：

```
/context
```

看完输出后重点检查：
- CLAUDE.md 的内容是不是你期望的？有没有被其他层级覆盖？
- allow / deny 规则的合并结果对不对？
- MCP 服务器有没有连上？失败的有没有错误信息？
- 有没有你不知道的记忆文件在干扰行为？

## /doctor：系统健康检查

`/doctor` 做更全面的系统诊断。它会检查：

- **认证状态** — API key 是否有效、是否过期
- **模型可用性** — 当前配置的模型是否可达
- **MCP 服务器连接** — 逐个 ping 已配置的 MCP 服务器
- **文件权限** — 关键目录和文件的读写权限是否正常
- **版本兼容性** — 当前 CLI 版本是否有已知问题
- **配置完整性** — settings.json 格式是否正确、必需字段是否齐全

**常见用法**：

```
/doctor
```

如果 `/doctor` 报了问题，按提示修复。大多数情况下是 MCP 服务器连接失败或 settings.json 格式错误。

## Hooks 调试

Hooks 是配置里最容易出问题的地方，因为它们是你写的 shell 命令或脚本，运行环境不一定和你预期的一致。

### 查看已注册的 hooks

在 `/context` 的输出中找到 hooks 部分，看哪些 hook 被加载了、匹配规则是什么、执行的命令是什么。

### 手动测试 hook 脚本

Hook 脚本从 stdin 接收 JSON 输入，输出到 stdout。你可以手动模拟这个流程：

```bash
# 模拟一个 PreToolUse hook 的输入
echo '{"tool_name": "Bash", "tool_input": {"command": "rm -rf /tmp/test"}}' | \
  bash .claude/hooks/pre-bash.sh
```

检查输出和退出码：
- **exit 0 + 无特殊输出** → 放行
- **exit 0 + JSON 输出 `{"decision": "block"}`** → 拦截
- **exit 2** → 拦截（旧版兼容）
- **非 0 退出码** → 出错了，Claude 会报错并停止当前操作

### 常见 hook 问题

**路径问题**：hook 命令里的路径可能和你想的不一样。Claude Code 在执行 hook 时，工作目录是项目根目录，但 `${CLAUDE_PROJECT_DIR}` 环境变量指向的才是项目路径。用绝对路径最安全。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash /absolute/path/to/hooks/pre-bash.sh"
          }
        ]
      }
    ]
  }
}
```

**权限问题**：hook 脚本需要可执行权限。

```bash
chmod +x .claude/hooks/pre-bash.sh
```

**JSON 解析问题**：hook 脚本如果用 `jq` 解析输入，确保 `jq` 已安装且在 PATH 里。Claude Code 执行 hook 时用的 PATH 可能和你的交互式 shell 不同。

**环境变量缺失**：hook 脚本里用的环境变量，在 Claude Code 的执行环境里可能不存在。可用的环境变量包括：
- `CLAUDE_PROJECT_DIR` — 项目根目录
- `CLAUDE_ENV_FILE` — 环境变量文件路径
- 标准 PATH 变量

详细的 hook 调试技巧见 [63 - Hooks 入门](63-hooks-getting-started.md)。

## MCP 调试

MCP 服务器连不上、工具找不到、调用超时——这些是 MCP 最常见的问题。

### 查看 MCP 状态

`/context` 输出中会显示每个 MCP 服务器的连接状态。如果某个服务器显示失败，查看错误信息。

### 常见 MCP 问题

**服务器启动失败**：MCP 服务器本质上是一个子进程，Claude Code 用 stdio 和它通信。启动失败常见原因：

- `command` 路径不对（比如 `npx` 不在 PATH 里）
- `args` 参数错误
- `env` 里的环境变量没设（比如 API token）
- 服务器本身有 bug，启动时崩溃了

排查方法：手动运行 MCP 服务器的启动命令，看是否正常：

```bash
# 复制 .mcp.json 里配置的 command 和 args，手动执行
npx -y @modelcontextprotocol/server-github
```

如果手动运行也失败，问题在服务器本身，不在 Claude Code。

**工具找不到**：MCP 服务器连上了，但工具列表是空的或缺少你期望的工具。可能是：
- 服务器配置不完整（比如缺少必要的 API token，工具被隐藏了）
- 服务器版本和 Claude Code 不兼容
- 工具名前缀不对（Claude Code 会给 MCP 工具加 `mcp__<server>__` 前缀）

**超时**：MCP 工具调用超时。大查询或外部 API 调用可能需要更长时间。可以检查：
- 网络连接是否正常
- MCP 服务器本身是否有超时配置
- 是否有防火墙拦截

### 临时禁用 MCP

排查时可能需要临时关掉某个 MCP 服务器看问题是否消失：

```bash
# 只启动内置工具，不加载任何 MCP
claude --no-mcp
```

或者在 `.mcp.json` 中注释掉对应的服务器配置（JSON 不支持注释，所以临时删除该条目）。

## 常见问题

### "CLAUDE.md 写了规则但 Claude 不遵守"

可能原因：
1. **文件路径不对**。项目级 CLAUDE.md 应该在项目根目录，不是 `.claude/CLAUDE.md`（两种路径都支持，但优先级不同）。
2. **被记忆覆盖了**。Claude 的自动记忆可能记了冲突的信息。
3. **写太多了**。CLAUDE.md 超过一定长度后，指令遵循率会下降。
4. **规则表述模糊**。写"用好的代码风格"不如写"所有函数加 JSDoc 注释"。

用 `/context` 查看 CLAUDE.md 实际加载的内容，确认你写的确实被加载了。

### "settings.json 改了但没生效"

1. 检查 JSON 格式是否正确（`cat settings.json | jq .`）
2. 检查是不是被更高优先级的配置覆盖了
3. 用 `/context` 看合并后的实际值
4. 某些配置项修改后需要重启 Claude Code 才生效

### "MCP 工具调用一直超时"

1. 手动运行 MCP 服务器启动命令，看是否正常
2. 检查网络连接和防火墙
3. 尝试 `claude --no-mcp` 确认问题确实在 MCP 层
4. 查看 MCP 服务器自身的日志

### "Hook 脚本执行报错"

1. 手动执行脚本，复现问题
2. 检查脚本的 shebang 行（`#!/bin/bash` 或 `#!/usr/bin/env bash`）
3. 检查脚本的执行权限（`ls -la .claude/hooks/`）
4. 确认脚本里用的命令在 Claude Code 的执行环境中都可用

## 关键要点

- `/context` 是第一排查工具，看实际加载的完整配置
- `/doctor` 做系统级健康检查
- Hooks 问题手动模拟输入输出来排查
- MCP 问题先手动运行服务器启动命令
- 配置优先级：托管 > 命令行 > 本地 > 项目 > 用户
- 环境变量优先级最高（`ANTHROPIC_MODEL` 等）

## 延伸阅读

- [39 - Settings 文件详解](39-settings-files.md) — 配置层级和优先级
- [41 - Auto Memory](41-auto-memory.md) — 记忆系统的工作方式
- [45 - Fine-grained Permissions](45-fine-grained-permissions.md) — 权限规则写法
- [61 - MCP 入门](61-mcp-getting-started.md) — MCP 服务器配置
- [63 - Hooks 入门](63-hooks-getting-started.md) — Hooks 配置和调试

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
