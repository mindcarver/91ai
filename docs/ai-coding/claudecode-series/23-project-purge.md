# Project Purge 命令

> 更新日期：2025/06

**TL;DR：** `claude project purge` 是 Claude Code 的本地数据清理命令。它能删除指定项目的会话记录（transcripts）、自动记忆、调试日志、文件快照和提示历史。用 `--dry-run` 先预览，确认后再删。默认情况下，30 天前的旧数据会在启动时自动清理，purge 是手动、精确、按项目清理的方式。

## 为什么这很重要

第 17 篇讲了会话继续与恢复——你用 `claude -c` 和 `claude -r` 能找回过去的对话。但保存是有代价的：Claude Code 把你所有的对话内容、工具调用结果、文件变更快照都写在本地磁盘上，而且是明文存储。

时间一长，几个实际问题会冒出来：

1. **磁盘空间**：每个会话的 transcript 是一个 JSONL 文件，里面包含完整的消息、工具调用和结果。活跃项目积累几百 MB 不稀奇。
2. **安全风险**：transcript 是明文的。如果 Claude 读过 `.env` 文件或命令输出过密钥，这些值会原样写进 JSONL 文件。OS 文件权限是唯一的保护层。
3. **旧项目残留**：你三个月前实验完的项目，它的 transcript 和 file-history 还在 `~/.claude/` 里躺着，不会自动消失（除非超过 `cleanupPeriodDays`）。

`claude project purge` 就是针对这些问题的清理工具。

## Claude Code 存了什么

在讲命令之前，先搞清楚 `~/.claude/` 下面都有什么。了解数据在哪，才知道 purge 删的是什么。

### 自动清理的数据（默认 30 天）

Claude Code 每次启动时，会扫描以下路径，把超过 `cleanupPeriodDays`（默认 30 天）的文件删掉：

| 路径（`~/.claude/` 下） | 内容 |
|---|---|
| `projects/<project>/<session>.jsonl` | 完整的对话记录：每条消息、工具调用、工具结果 |
| `projects/<project>/<session>/subagents/` | 子代理的对话记录，随父会话一起清理 |
| `projects/<project>/<session>/tool-results/` | 大型工具输出的溢出文件 |
| `file-history/<session>/` | Claude 修改文件前的快照，用于检查点恢复 |
| `plans/` | Plan 模式生成的计划文件 |
| `debug/` | 调试日志（`--debug` 或 `/debug` 触发时才写） |
| `paste-cache/`、`image-cache/` | 大段粘贴文本和附件图片的缓存 |
| `session-env/` | 每个会话的环境元数据 |
| `tasks/` | 每个会话的任务列表 |
| `shell-snapshots/` | Bash 工具捕获的 shell 环境，正常退出时自动删除 |
| `backups/` | `~/.claude.json` 迁移前的时间戳备份 |
| `todos/`、`statsig/`、`logs/` | 旧版本的遗留目录，已不再写入 |

注意：`cleanupPeriodDays` 控制的是上面的自动清理。默认 30 天意味着超过一个月的 transcript 会在某次启动时被清理掉。

### 不会自动清理的数据

以下数据没有过期机制，会一直保留直到你手动删除：

| 路径（`~/.claude/` 下） | 内容 |
|---|---|
| `history.jsonl` | 你输入过的每条 prompt，带时间戳和项目路径。用于上箭头回忆 |
| `stats-cache.json` | 聚合的 token 和费用统计，`/usage` 命令显示的数据来源 |
| `remote-settings.json` | 企业级远程设置的本地缓存，下次启动会重新拉取 |
| `projects/<project>/memory/` | 自动记忆：Claude 跨会话写给自己的笔记 |

### 安全注意事项

transcript 和 history 是**明文存储**的，没有加密。如果 Claude 通过工具读取了 `.env` 文件或命令输出了凭证，这些值会完整写入 `projects/<project>/<session>.jsonl`。

降低暴露风险的做法：

- 调低 `cleanupPeriodDays`，缩短 transcript 保留时间
- 设置环境变量 `CLAUDE_CODE_SKIP_PROMPT_HISTORY` 跳过 transcript 和 prompt 历史的写入
- 非交互模式下用 `--no-session-persistence` 参数（配合 `-p` 使用）
- 用权限规则禁止读取凭证文件

## 命令详解

### 基本语法

```bash
claude project purge [path] [flags]
```

- `path`：目标项目的路径。省略则进入交互式选择，从列表里挑项目。
- 不带 `path` 也不带 `--all`：弹出交互式列表让你选。

### 核心功能

`claude project purge` 对指定项目执行以下清理：

1. **Transcripts 和自动记忆**：`projects/` 下属于该项目的会话记录和 auto memory
2. **任务列表**：`tasks/` 下属于该项目会话的条目
3. **调试日志**：`debug/` 下属于该项目会话的条目
4. **文件编辑历史**：`file-history/` 下属于该项目会话的快照
5. **Prompt 历史**：`history.jsonl` 中属于该项目的行
6. **项目配置条目**：`~/.claude.json` 中该项目的记录

命令会打印完整的删除计划，逐项列出要删什么，确认后才执行。

### 参数和标志

| 标志 | 说明 |
|---|---|
| `[path]` | 指定项目路径。如 `~/work/my-repo` |
| `--dry-run` | 只预览要删什么，不实际删除 |
| `-y`、`--yes` | 跳过确认提示，直接执行。适合脚本用 |
| `-i` | 逐项确认。每个要删的条目都会问你一遍 |
| `--all` | 不传 path，直接清理所有项目的数据 |

### 使用示例

**预览某个项目要清理的内容：**

```bash
claude project purge ~/work/my-repo --dry-run
```

这是最推荐的用法。先看清楚要删什么，再决定要不要动手。

**确认后清理指定项目：**

```bash
claude project purge ~/work/my-repo
```

不带 `--dry-run`，命令会列出删除计划并要求确认。

**交互式选择项目：**

```bash
claude project purge
```

不传路径，会弹出项目列表让你选。

**跳过确认（脚本场景）：**

```bash
claude project purge ~/work/my-repo --yes
```

适合 CI/CD 或清理脚本，不需要人工确认。

**逐项确认：**

```bash
claude project purge ~/work/my-repo -i
```

每个文件/条目单独问你，比一次性全部确认更谨慎。

**清理所有项目：**

```bash
claude project purge --all
```

注意：`--all` 会直接删除整个 `history.jsonl` 文件（而不是逐行过滤），效果比单独清理更彻底。

### 不清理的内容

`claude project purge` 故意跳过以下内容：

- **`shell-snapshots/`**：不是按项目划分的
- **`backups/`**：`~/.claude.json` 的备份，不是项目级数据
- **`~/.claude.json`**：认证和应用状态
- **`~/.claude/settings.json`**：你的配置
- **`~/.claude/plugins/`**：已安装的插件

命令会在输出中提示这些被跳过的内容。

### 退出状态

- **0**：清理成功（或 `--dry-run` 正常预览）
- **1**：没有找到匹配指定路径的状态数据

## 安全清理指南

### 日常维护

如果你同时活跃多个项目，建议定期跑一次：

```bash
# 先预览所有项目
claude project purge --dry-run

# 确认后清理
claude project purge --all
```

或者只清理已经不做的旧项目：

```bash
claude project purge ~/archive/old-experiment --dry-run
```

### 处理凭证泄露

如果你在某个会话中让 Claude 读过包含密钥的文件，最稳妥的做法：

1. 立即轮换（rotate）受影响的凭证
2. 清理该项目的 transcript：

```bash
claude project purge ~/work/affected-project
```

3. 把 `cleanupPeriodDays` 调低（比如 7 天），减少未来的暴露窗口

在 `settings.json` 里设置：

```json
{
  "cleanupPeriodDays": 7
}
```

### 彻底禁用 transcript 写入

如果你处理的都是敏感项目，不想留任何本地记录：

```bash
# 环境变量方式
export CLAUDE_CODE_SKIP_PROMPT_HISTORY=1

# 或非交互模式
claude -p "分析这段代码" --no-session-persistence
```

注意：禁用 transcript 意味着你不能用 `-c` 和 `-r` 恢复会话，也没有上箭头 prompt 回忆。这是一个权衡。

### 手动清理

`claude project purge` 是官方推荐的方式，但你也可以直接删 `~/.claude/` 下的文件。下面是各路径删了之后你失去什么：

| 删除的路径 | 失去什么 |
|---|---|
| `~/.claude/projects/` | 所有会话的 `-c`、`-r`、`/rewind` 能力 |
| `~/.claude/history.jsonl` | 上箭头 prompt 回忆 |
| `~/.claude/file-history/` | 过去会话的检查点恢复 |
| `~/.claude/stats-cache.json` | `/usage` 显示的历史统计 |
| `~/.claude/debug/`、`plans/`、`paste-cache/` 等 | 没有用户可见的影响 |

**不要删的东西**：`~/.claude.json`（认证状态）、`~/.claude/settings.json`（你的配置）、`~/.claude/plugins/`（已安装的插件）。删了这些会导致 Claude Code 无法正常工作。

## 常见问题

### purge 之后，`-c` 和 `-r` 还能用吗？

被 purge 的会话不能用了。但 purge 之后新产生的会话不受影响，照常能用 `-c` 和 `-r`。

### `cleanupPeriodDays` 和 purge 是什么关系？

两者独立。`cleanupPeriodDays` 是启动时自动清理超过指定天数的数据，purge 是手动命令按项目清理。`cleanupPeriodDays` 默认 30 天，可以通过 settings 修改。

一个常见踩坑：把 `cleanupPeriodDays` 设成 `0` 会**静默禁用所有 transcript 的持久化**，你不会收到任何警告。有人用了几个月才发现最早的 transcript 只剩最近几天的——因为设了 0 之后旧 transcript 在启动时被清掉了。

### purge 会影响其他项目吗？

不会。指定路径的 purge 只清理该项目的数据。`--all` 才会影响所有项目。

### purge 会删除我的 CLAUDE.md 和 settings.json 吗？

不会。purge 只删应用数据（transcript、history、file-history 等），不动你写的配置文件。

### 如何查看 `~/.claude/` 占了多少磁盘？

```bash
du -sh ~/.claude/
du -sh ~/.claude/projects/
```

如果 `projects/` 目录特别大，说明 transcript 积累了太多，该 purge 了。

## 关键要点

1. **`claude project purge` 按项目清理本地数据**：transcript、auto memory、任务列表、调试日志、文件快照、prompt 历史。不影响配置文件。
2. **先用 `--dry-run` 预览**：养成习惯，先看后删。
3. **transcript 是明文的**：如果处理敏感信息，注意清理策略。调低 `cleanupPeriodDays` 或设置 `CLAUDE_CODE_SKIP_PROMPT_HISTORY`。
4. **`cleanupPeriodDays` 默认 30 天**：超过 30 天的旧数据在启动时自动清理。设成 `0` 会禁用 transcript 持久化，谨慎操作。
5. **`--all` 清理所有项目**：适合定期维护时一次性清理。它直接删除 `history.jsonl`，比按项目清理更彻底。
6. **不要删 `~/.claude.json`、`settings.json`、`plugins/`**：这些是认证和配置，删了 Claude Code 用不了。

## 延伸阅读

- [第 17 篇：会话继续与恢复](./17-session-continue-resume.md) — transcript 存在的意义就是让 `-c` 和 `-r` 工作
- [第 35 篇：`.claude` 目录全景](./35-dot-claude-directory-overview.md) — 完整的目录结构和各文件用途
- [Claude Code 官方文档：Explore the .claude directory](https://code.claude.com/docs/en/claude-directory) — 应用数据存储和清理的权威说明
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference) — `claude project purge` 的完整参数说明

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
