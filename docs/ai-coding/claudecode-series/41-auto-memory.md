# Auto Memory

> 更新日期：2025/06

**TL;DR：** Claude Code 会自动把项目中发现的有用信息保存到记忆文件里。这些记忆存在 `~/.claude/projects/<project>/memory/` 下面，下次打开同一项目时自动加载。你不需要手动管理——但知道它存了什么、存在哪、怎么清理，能帮你避免记忆过期或冲突的问题。

## 记忆系统怎么工作

Claude Code 的记忆不是一个功能开关，而是一组自动化的行为：

1. **会话中**，Claude 发现了可能对未来有用的信息（你的项目用什么框架、测试怎么跑、数据库用什么），会自动写入记忆文件。
2. **下次会话启动**时，Claude 从记忆文件中读取之前积累的知识，作为上下文的一部分加载。
3. 加载的记忆会和 CLAUDE.md、rules 一起构成项目的完整上下文。

记忆文件的位置：

```
~/.claude/
  projects/
    <project-hash>/
      memory/
        MEMORY.md              # 入口文件，自动加载
        frontend-conventions.md  # 按主题拆分的记忆文件
        database-schema.md
        api-patterns.md
```

`<project-hash>` 是项目路径的哈希值。不同项目有各自的记忆目录，互不干扰。

## 记忆类型

### 项目记忆（Project Memory）

存在 `~/.claude/projects/<project>/memory/` 下。最常用的类型，记录的是 Claude 在和你交互过程中发现的、特定于这个项目的事实：

- 项目用 React 18 + TypeScript + Vite
- 测试用 vitest，跑单文件用 `vitest run path/to/file`
- API 路由在 `src/routes/` 下，每个文件导出一个 router
- 数据库用 Prisma，schema 在 `prisma/schema.prisma`
- CI 用的 GitHub Actions，配置在 `.github/workflows/`
- 团队约定 commit message 用 conventional commits

这些信息你不一定要写进 CLAUDE.md（CLAUDE.md 放的是"规则"，记忆放的是"发现的事实"），但 Claude 知道后能更快进入状态。

### 用户偏好记忆

跨项目的个人偏好。比如：

- 你喜欢用 pnpm 不用 npm
- 你偏好函数式写法
- 你习惯用 `feat` / `fix` 做 commit 前缀
- 你喜欢详细的代码注释

这类偏好会体现在 Claude 对不同项目的处理中。如果它发现你在多个项目里都做了同样的选择，就可能记录下来。

### 历史经验

Claude 在调试过程中积累的经验。比如：

- 这个项目的 Redis 连接偶尔超时，是因为本地 Docker 默认内存太小
- `npm run build` 偶尔失败，重试一次就好
- 这个 monorepo 里改了 package A，需要手动 rebuild package B

这类"踩过的坑"的记忆，能避免 Claude 在同一个地方重复浪费时间。

## 记住什么

Claude 自动判断什么值得记。但核心逻辑是：

**记**：
- 项目的工具链和依赖版本（框架、构建工具、测试框架）
- 项目特有的目录结构和文件约定
- 发现的 bug 模式和解决方案
- 用户反复强调的偏好
- 和 CLAUDE.md 规则不一致但实际在用的约定

**不记**：
- 一次性的调试过程（除非发现了反复出现的模式）
- 临时文件路径或临时变量
- 已经在 CLAUDE.md 里写过的规则（不重复）
- 敏感信息（理论上不应该，但需要验证）

## 查看和编辑记忆

### /memory 命令

在 Claude Code 会话中输入 `/memory`，可以查看当前项目的记忆内容。这个命令会展示已保存的记忆文件列表和主要内容。

### 手动编辑

记忆文件就是普通的 Markdown 文件，你可以直接用任何编辑器打开修改：

```bash
# 查看你的项目记忆目录
ls ~/.claude/projects/*/memory/

# 编辑某个记忆文件
vim ~/.claude/projects/<hash>/memory/MEMORY.md
```

直接编辑的好处：你可以删掉过时的记忆、修正错误的记录、补充 Claude 遗漏的信息。

### 用自然语言编辑

你也可以直接跟 Claude 说：

```
"记住这个项目用 React 19，不是 18"
"忘掉之前关于数据库的那个记忆，我们已经换用 MongoDB 了"
"记住：这个项目的 API 前缀是 /api/v2"
```

Claude 会自动更新对应的记忆文件。

## 清理和排错

### 记忆过期了

项目重构了目录结构、换了框架、改了工具链，但 Claude 还在用旧记忆。表现是它反复提到不存在的文件路径、用过时的命令。

解决方法：

1. 用 `/memory` 查看当前记忆
2. 找到过时的条目，手动编辑或让 Claude 删除
3. 严重的可以直接清空记忆目录重新来

```bash
# 清空某个项目的全部记忆（谨慎操作）
rm -rf ~/.claude/projects/<hash>/memory/
```

### 记忆太多影响性能

记忆文件和 CLAUDE.md 一样会占用上下文窗口。如果记忆文件积累了很多，但大部分对当前任务没用，可以考虑：

- 手动清理不重要的记忆
- 把通用的、稳定的记忆"升级"到 CLAUDE.md 的 rules 里（这样可以从按需加载机制受益）
- 用 `/compact` 命令压缩上下文，但注意 compact 不会丢记忆，它只是压缩对话历史

### 记忆冲突

两个来源的信息打架：CLAUDE.md 说用 npm，记忆里记着你用 pnpm。Claude 会优先遵循 CLAUDE.md 的指令，但可能表现不一致。

解决方法：以 CLAUDE.md 为准，删掉冲突的记忆条目。规则层级是：托管 > CLAUDE.md > rules > 记忆。

### 关闭自动记忆

如果你不想让 Claude 自动保存记忆（比如在临时项目或敏感项目中）：

```bash
export CLAUDE_CODE_DISABLE_AUTO_MEMORY=1
```

设了这个环境变量，Claude 就不会在会话中自动写入记忆文件。但你仍然可以手动创建记忆文件让 Claude 读取。

## 记忆和 CLAUDE.md 的分工

很多人搞不清什么时候该用 CLAUDE.md，什么时候依赖记忆。简单区分：

| 维度 | CLAUDE.md | Auto Memory |
|------|-----------|-------------|
| 谁写的 | 你写的 | Claude 写的 |
| 内容性质 | 规则、约束、命令 | 事实、发现、偏好 |
| 粒度 | 精确控制 | 自动判断 |
| 进 git | 项目级 CLAUDE.md 进 | 不进（存在 home 目录） |
| 优先级 | 高 | 低 |
| 适合放 | "不要做 X"、"测试用命令 Y" | "这个项目用了 X 框架"、"用户偏好 Y" |

**经验法则**：如果你需要 Claude 严格遵守一条规则，写进 CLAUDE.md。如果你只是希望 Claude "知道"一个事实，让它自己记就行。

## 关键要点

- 记忆存在 `~/.claude/projects/<project-hash>/memory/` 下，不进 git
- Claude 自动判断什么值得记，你也可以手动编辑或用自然语言指示
- 记忆过时了比没有记忆更糟糕——定期检查，及时清理
- CLAUDE.md 和记忆冲突时，CLAUDE.md 优先
- `/memory` 命令查看当前记忆内容
- `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` 关闭自动记忆

## 延伸阅读

- [35 - `.claude` 目录全景](35-dot-claude-directory-overview.md) — 记忆文件在整体目录结构中的位置
- [36 - CLAUDE.md 怎么写](36-how-to-write-claude-md.md) — 和记忆互补的指令文件写法
- [39 - Settings 文件详解](39-settings-files.md) — 另一种持久化配置的方式
- [42 - Debug 配置加载](42-debug-config-loading.md) — 排查记忆是否正确加载
