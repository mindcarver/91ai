# AI 工具集成实战：在 Claude Code、Cursor、Copilot 中使用 OpenSpec

> 更新日期：2026/06

**TL;DR：** OpenSpec 支持 25+ AI 编程工具，集成原理是为每个工具生成对应的 skill/command 文件。Claude Code 用 `.claude/skills/`、Cursor 用 `.cursor/rules/`、GitHub Copilot 用 `.github/prompts/`。命令语法在不同工具间略有差异（冒号 vs 连字符）。多工具切换只需一行 `openspec update`。本文逐个工具拆解集成细节、命令映射、实际操作步骤、常见问题排查，最后演示如何用两个不同工具完成同一个功能。

---

## 集成原理：OpenSpec 怎么让不同工具"听懂"同一套命令

OpenSpec 不自己执行命令。它的工作是生成一套文件，让各种 AI 编程工具理解 OpenSpec 的概念和操作方式。

具体来说，`openspec init --tools <tool>` 做了两件事：

1. 创建 `openspec/` 目录结构（`specs/`、`changes/`、`config.yaml`）
2. 在目标工具的配置目录下生成 skill/command 文件

这些 skill 文件的内容是 Markdown 格式的指令，告诉 AI 工具：

- OpenSpec 的目录结构是什么
- 各个命令（propose、apply、sync、archive）应该做什么
- Delta Spec 的格式规范
- 如何读取 `project.md` 获取项目上下文
- 如何读取 `AGENTS.md` 获取行为指引

不同工具对"指令文件"的存放位置和格式要求不同，OpenSpec 针对每种工具生成了对应格式的文件。但 spec 文件本身（`openspec/specs/` 和 `openspec/changes/`）是工具无关的——它们只是 Markdown。

### 文件生成映射表

| 工具 | 指令文件位置 | 文件格式 |
|------|------------|---------|
| Claude Code | `.claude/skills/openspec-*.md` | Markdown skill 文件 |
| Cursor | `.cursor/rules/openspec-*.mdc` | MDC 格式（Markdown + metadata） |
| Windsurf | `.windsurf/rules/openspec-*.mdc` | MDC 格式 |
| GitHub Copilot | `.github/prompts/openspec-*.prompt.md` | Prompt Markdown 文件 |
| Codex CLI | skill 文件 | Markdown |
| Gemini CLI | skill 文件 | Markdown |
| OpenCode | skill 文件 | Markdown |
| Cline | skill 文件 | Markdown |
| Kimi CLI | skill 文件 | Markdown |
| Trae | skill 文件 | Markdown |

### 命令语法差异

不同工具的 slash command 语法不同。有的用冒号分隔，有的用连字符：

| 工具 | propose 命令 | apply 命令 | archive 命令 |
|------|-------------|-----------|-------------|
| Claude Code | `/opsx:propose` | `/opsx:apply` | `/opsx:archive` |
| Cursor | `/opsx-propose` | `/opsx-apply` | `/opsx-archive` |
| Windsurf | `/opsx-propose` | `/opsx-apply` | `/opsx-archive` |
| GitHub Copilot | `/opsx-propose` | `/opsx-apply` | `/opsx-archive` |
| Codex CLI | `/opsx:propose` | `/opsx:apply` | `/opsx:archive` |
| OpenCode | `/opsx:propose` | `/opsx:apply` | `/opsx:archive` |
| Gemini CLI | skill 调用（无前缀） | skill 调用 | skill 调用 |
| Cline | skill 调用（无前缀） | skill 调用 | skill 调用 |
| Kimi CLI | `/skill:openspec-propose` | `/skill:openspec-apply` | `/skill:openspec-archive` |
| Trae | `/openspec-propose` | `/openspec-apply` | `/openspec-archive` |

语法差异的原因是各工具对 slash command 的解析规则不同。Claude Code 和 Codex CLI 支持冒号参数语法，Cursor 和 Copilot 用连字符分隔，Gemini CLI 和 Cline 通过 skill 系统调用而非 slash command，Kimi CLI 和 Trae 有自己的命名规范。

这些差异不影响 spec 文件本身。不管你用什么工具发起 propose，生成的 proposal.md、delta spec、design.md、tasks.md 格式完全一样。

---

## Claude Code 集成详解

Claude Code 是 Anthropic 官方的终端 AI 编程工具。OpenSpec 对 Claude Code 的支持最成熟，命令语法也最直观。

### 初始化

```bash
cd your-project
openspec init --tools claude-code
```

这会在项目根目录生成以下结构：

```
your-project/
├── .claude/
│   └── skills/
│       ├── openspec-propose.md
│       ├── openspec-apply.md
│       ├── openspec-sync.md
│       ├── openspec-archive.md
│       ├── opensexplore.md
│       ├── openspec-verify.md
│       ├── openspec-onboard.md
│       └── ...
├── openspec/
│   ├── project.md
│   ├── AGENTS.md
│   ├── specs/
│   └── changes/
└── src/
```

`.claude/skills/` 目录下的每个文件对应一个 OpenSpec 工作流命令。Claude Code 在启动时会自动加载这个目录下的所有 skill 文件。

### 命令使用

在 Claude Code 终端中直接输入：

```text
# 发起一个变更
/opsx:propose add-search-feature

# 实现代码
/opsx:apply

# 验证实现
/opsx:verify

# 同步 spec
/opsx:sync

# 归档变更
/opsx:archive
```

Claude Code 的 slash command 支持冒号后接参数。`/opsx:propose add-search-feature` 中的 `add-search-feature` 会作为变更名称传递给 AI。

### 实战操作流程

假设你要给项目加一个全文搜索功能。

**第一步：发起变更**

```text
> /opsx:propose add-fulltext-search
```

Claude Code 会：

1. 读取 `openspec/project.md` 获取项目上下文（技术栈、架构约定）
2. 读取 `openspec/AGENTS.md` 获取行为指引
3. 读取相关的现有 spec（如果有 `specs/search/spec.md`，说明之前有搜索相关的规范）
4. 创建 `openspec/changes/add-fulltext-search/` 目录
5. 生成 `proposal.md`（动机和范围）
6. 生成 `specs/search/spec.md`（Delta Spec：ADDED 全文搜索需求）
7. 生成 `design.md`（技术方案）
8. 生成 `tasks.md`（实现清单）

**第二步：审查**

打开生成的文件检查。重点关注 `proposal.md` 的 Scope 部分——确认 In scope 和 Out of scope 符合你的预期。如果 AI 生成的范围太大或太小，直接编辑修改。

**第三步：实现**

```text
> /opsx:apply
```

Claude Code 会按 `tasks.md` 的清单逐步实现代码，每完成一项打勾。

**第四步：验证（可选但推荐）**

```text
> /opsx:verify
```

检查实现是否和 spec 一致。

**第五步：归档**

```text
> /opsx:archive
```

Delta Spec 合并进主 spec，变更文件夹移入 archive/。

### 扩展命令

如果你使用 custom profile，还有这些命令：

```text
/opsx:explore       # 让 AI 读旧代码、理解行为、讨论改进方案
/opsx:onboard       # 引导式教程，扫描代码库找改进点
/opsx:continue      # 逐步创建 artifact（不是一次全部生成）
/opsx:new           # 创建空的变更文件夹
/opsx:ff            # 快速流程（简化版 propose）
/opsx:bulk-archive  # 批量归档多个并行变更
```

### 注意事项

- `.claude/skills/` 下的文件由 OpenSpec 自动管理，一般不需要手动编辑。如果手动改了，下次 `openspec update` 会被覆盖
- `AGENTS.md` 也是自动生成的，不要手动改
- `project.md` 是你唯一需要（也应该）手动填写的文件

---

## Cursor 集成详解

Cursor 是目前使用最广泛的 AI IDE 之一。OpenSpec 通过 Cursor 的 rules 系统集成。

### 初始化

```bash
cd your-project
openspec init --tools cursor
```

生成的文件：

```
your-project/
├── .cursor/
│   └── rules/
│       ├── openspec-propose.mdc
│       ├── openspec-apply.mdc
│       ├── openspec-sync.mdc
│       ├── openspec-archive.mdc
│       └── ...
├── openspec/
│   ├── project.md
│   ├── AGENTS.md
│   ├── specs/
│   └── changes/
└── src/
```

### 命令使用

Cursor 的 Agent 模式下，在聊天框输入：

```text
/opsx-propose add-search-feature
```

注意连字符而不是冒号。这是 Cursor 对 slash command 的解析要求。

### MDC 文件格式

Cursor 使用 `.mdc`（Markdown Configuration）格式存放规则文件。一个典型的 `openspec-propose.mdc` 文件结构：

```yaml
---
description: OpenSpec propose command - create a change proposal
globs:
alwaysApply: false
---

# OpenSpec: Propose

You are executing the OpenSpec propose workflow...

（详细的指令内容）
```

`alwaysApply: false` 意味着这条规则不会自动生效，只在用户通过 slash command 调用时才激活。这是正确的行为——不需要每次对话都触发 propose 流程。

### Cursor Agent 模式的注意事项

Cursor 有两种 AI 交互模式：Chat（普通对话）和 Agent（自动执行）。

- **Chat 模式**：可以输入 `/opsx-propose`，AI 会给出指令但不自动创建文件。你需要手动确认每一步
- **Agent 模式**：AI 会自动创建文件、编辑代码。推荐在 Agent 模式下使用 OpenSpec 命令

Agent 模式下 AI 的执行范围取决于你在 Cursor 设置中配置的 "allowed tools"。确保以下工具被允许：

- File creation and editing
- Terminal commands（用于运行 `openspec validate` 等 CLI 命令）
- Codebase search（用于让 AI 理解现有代码结构）

### Cursor 的 Context Window 考量

Cursor 的 Agent 模式在处理大型变更时可能遇到上下文窗口限制。OpenSpec 的 spec 文件本身就是上下文管理的一部分——AI 不需要重新理解整个代码库，只需要读取相关的 spec 文件。

但如果你的 `changes/` 目录中有多个并行变更，Agent 模式可能会读取不必要的文件。建议在 Cursor 中使用 `.cursorignore` 文件排除 archive 目录：

```text
# .cursorignore
openspec/changes/archive/
```

这能减少 Agent 读取的无关文件数量，把上下文窗口留给更有价值的内容。

### Cursor 中的 rules 文件数量

如果你的项目已经有其他 Cursor rules（比如代码风格规范、架构约定），OpenSpec 生成的 rules 文件会和它们共存。没有冲突——Cursor 会根据 slash command 选择性地激活对应的 rule。

但如果 rules 文件总数超过 10 个，可能会影响 Cursor 的上下文使用效率。OpenSpec 默认生成的规则文件数量取决于你的 profile：

- Core profile：5 个文件（propose、explore、apply、sync、archive）
- Custom profile：12 个文件（包含所有扩展命令）

对于大多数项目，Core profile 的 5 个文件就够了。

---

## GitHub Copilot 集成详解

GitHub Copilot 的集成方式和前两个工具有明显区别，主要是文件存放位置和支持环境的限制。

### 初始化

```bash
cd your-project
openspec init --tools github-copilot
```

生成的文件：

```
your-project/
├── .github/
│   └── prompts/
│       ├── openspec-propose.prompt.md
│       ├── openspec-apply.prompt.md
│       ├── openspec-sync.prompt.md
│       ├── openspec-archive.prompt.md
│       └── ...
├── openspec/
│   ├── project.md
│   ├── AGENTS.md
│   ├── specs/
│   └── changes/
└── src/
```

### 命令使用

在 VS Code 中打开 GitHub Copilot Chat，输入：

```text
/opsx-propose add-search-feature
```

### IDE 限制

这是一个需要特别强调的限制：**`.github/prompts/*.prompt.md` 只在 IDE 扩展中可用，Copilot CLI 不支持自定义 prompt 文件。**

具体来说：

| 环境 | 是否支持 OpenSpec 命令 |
|------|----------------------|
| VS Code Copilot Chat | 支持 |
| JetBrains IDE Copilot Chat | 支持 |
| Visual Studio Copilot Chat | 支持 |
| Copilot CLI（终端） | 不支持自定义 prompt 文件 |
| GitHub.com 网页版 Copilot | 不支持 |

如果你习惯在终端里用 `gh copilot` 命令，OpenSpec 的 slash command 在那里不会生效。你需要在 VS Code、JetBrains 或 Visual Studio 的 Copilot Chat 面板中使用。

### 为什么有这个限制

Copilot CLI 的 prompt 系统和 IDE 扩展的 prompt 系统是两套不同的机制。`.github/prompts/` 目录下的 prompt 文件是 IDE 扩展的功能，CLI 工具读取不了。

如果你需要在 Copilot CLI 中使用 OpenSpec，替代方案是手动在对话中粘贴 spec 文件内容，或者在 CLI 的配置文件中手动添加 OpenSpec 的指令。但这种方式不如 IDE 扩展方便。

### Copilot 中的 @workspace 引用

GitHub Copilot 支持 `@workspace` 参与者，它可以让 Copilot 搜索整个工作区来回答问题。OpenSpec 的 spec 文件天然支持这种模式：

```text
@workspace /opsx-propose add-search-feature
```

Copilot 会搜索 `openspec/` 目录下的所有文件来获取上下文。如果你的 spec 文件组织得当（按领域分目录、每个 spec 聚焦一个领域），Copilot 能精准地找到相关上下文。

### VS Code 中的操作建议

在 VS Code 中使用 Copilot + OpenSpec 时，几个实用建议：

1. **在对话开始时让 Copilot 读 `project.md`**。虽然 prompt 文件已经包含了相关指令，但显式提醒 Copilot 读取项目上下文能提高准确度

2. **使用 `#file:` 引用特定 spec**。当你想要修改某个已有模块时，可以用 `#file:openspec/specs/auth/spec.md` 让 Copilot 直接读取相关 spec

3. **拆分大任务**。Copilot 的 Agent 模式在处理超过 10 个子任务的 tasks.md 时表现下降。如果任务很多，建议拆成多个 change

---

## 其他工具概览

除了上面详细介绍的三个工具，OpenSpec 还支持以下工具。它们的集成原理相同——生成 skill/command 文件到对应目录——但各有细节差异。

### Windsurf

Windsurf（前身为 Codeium 的 AI IDE）的集成和 Cursor 几乎一样：

- 文件位置：`.windsurf/rules/openspec-*.mdc`
- 命令格式：`/opsx-propose`（连字符）
- MDC 格式与 Cursor 相同

如果你同时用 Cursor 和 Windsurf，可以同时初始化两个工具：

```bash
openspec init --tools cursor,windsurf
```

两个工具的 rules 文件互不干扰，spec 文件共享同一份。

### Codex CLI

Codex CLI 是 OpenAI 的终端 AI 编程工具：

- 命令格式：`/opsx:propose`（冒号，和 Claude Code 一样）
- Skill 文件由 OpenSpec 自动管理
- 终端环境，和 Claude Code 的使用体验类似

Codex CLI 的一个特点是对 GPT 系列模型的支持更好。如果你用 Codex CLI，推荐使用 GPT-5 级别的模型来生成高质量的 spec。

### Gemini CLI

Google 的 Gemini CLI 通过 skill 系统集成：

- 没有传统的 slash command 前缀
- 通过 skill 调用触发 OpenSpec 工作流
- Skill 文件由 OpenSpec 自动生成

Gemini CLI 的上下文窗口较大（Gemini 2.5 Pro 支持 1M token），在处理大型 spec 文件时有优势。

### OpenCode

OpenCode 是一个开源的 AI 编程终端工具：

- 命令格式：`/opsx:propose`（冒号）
- 支持多种模型后端
- Skill 文件由 OpenSpec 自动管理

### Cline

Cline 是 VS Code 扩展形式的 AI 编程工具：

- 通过 skill 系统调用，没有显式的 slash command
- OpenSpec 的 skill 文件会在 Cline 启动时自动加载
- 操作方式更接近"对话中触发"而非"输入命令"

### Kimi CLI

Kimi CLI（月之暗面推出的终端工具）：

- 命令格式：`/skill:openspec-propose`（skill 前缀）
- 文件位置：skill 文件由 OpenSpec 自动管理
- 对中文场景的支持较好

### Trae

Trae（字节跳动推出的 AI IDE）：

- 命令格式：`/openspec-propose`（openspec 前缀，无 opsx 缩写）
- 集成方式和其他 AI IDE 类似

---

## 多工具切换场景

现实中很多开发者不只使用一个 AI 编程工具。白天在公司用 Cursor（IDE 环境方便），晚上在家用 Claude Code（终端灵活），周末可能试试 Gemini CLI（大上下文窗口）。

OpenSpec 的设计天然支持这种多工具切换。

### 设置多工具支持

初始化时指定多个工具：

```bash
openspec init --tools claude-code,cursor
```

这会同时生成两套 skill/command 文件：

```
your-project/
├── .claude/skills/
│   ├── openspec-propose.md
│   └── ...
├── .cursor/rules/
│   ├── openspec-propose.mdc
│   └── ...
├── openspec/
│   ├── project.md
│   ├── AGENTS.md
│   ├── specs/
│   └── changes/
└── src/
```

两套指令文件指向同一套 spec 文件。

### 切换操作

今天用 Cursor 做了一半，明天用 Claude Code 继续：

1. 在 Cursor 中完成了 propose 和部分 apply
2. commit 你的代码和 `openspec/changes/add-search/` 目录
3. 第二天打开 Claude Code
4. 输入 `/opsx:apply` 继续——Claude Code 会读取 `changes/add-search/` 的 tasks.md，看到哪些任务已完成，从未完成的任务继续

不需要任何额外操作。spec 文件是工具无关的 Markdown，任何工具都能读取。

### 添加新工具

项目中已经有了 Claude Code 的配置，想加 Cursor：

```bash
openspec init --tools cursor
```

OpenSpec 会检测到已有的 `openspec/` 目录，只新增 Cursor 的 rules 文件，不影响已有数据。

### 更新所有工具的 skill 文件

OpenSpec 版本更新后，用一行命令刷新所有工具的 skill 文件：

```bash
openspec update
```

这会重新生成所有已配置工具的 skill/command 文件，确保它们使用最新版本的指令内容。

---

## 常见问题排查

### 命令不识别

输入 `/opsx:propose` 或 `/opsx-propose` 后，AI 工具没有任何反应或报错"未知命令"。

**原因**：skill/command 文件没有被工具正确加载。

**排查步骤**：

1. 确认初始化时指定了正确的工具名称。工具名称是区分大小写的：
   - `claude-code`（不是 `claudecode` 或 `Claude-Code`）
   - `cursor`（不是 `Cursor`）
   - `github-copilot`（不是 `copilot` 或 `github_cilot`）

2. 确认文件存在于正确位置：

```bash
# Claude Code
ls .claude/skills/openspec-*.md

# Cursor
ls .cursor/rules/openspec-*.mdc

# GitHub Copilot
ls .github/prompts/openspec-*.prompt.md
```

3. 如果文件不存在，重新初始化：

```bash
openspec init --tools claude-code
```

4. 对于 Cursor 和 Windsurf，确认 `.mdc` 文件的 frontmatter 格式正确。如果 frontmatter 被意外修改，工具可能不加载

### Skill 文件没生成

`openspec init` 运行后没有报错，但对应目录下没有文件。

**排查步骤**：

1. 检查你是否有目录写权限：

```bash
# 测试 Claude Code 目录
touch .claude/skills/test.md && rm .claude/skills/test.md

# 测试 Cursor 目录
touch .cursor/rules/test.mdc && rm .cursor/rules/test.mdc
```

2. 检查 OpenSpec 版本：

```bash
openspec --version
```

确保使用最新版本。某些旧版本不支持特定工具。

3. 查看 OpenSpec 的 verbose 输出：

```bash
openspec init --tools cursor --verbose
```

verbose 模式会输出详细的生成过程，包括每个文件的创建状态。

### 工具升级后命令失效

AI 编程工具自身升级后，slash command 不再工作。

**原因**：工具升级可能改变了 command 文件的格式要求或加载方式。

**解决方法**：

```bash
openspec update
```

这会用最新版本的指令模板重新生成所有 skill/command 文件。

如果 `openspec update` 后仍然不工作，检查工具的 changelog。有些工具升级会改变 rules 文件的存放位置或格式。

### AI 不遵循 spec 指令

AI 工具识别了命令，但执行结果不符合 OpenSpec 规范——比如 Delta Spec 没有 ADDED/MODIFIED/REMOVED 标记，或者 proposal 缺少 Scope 部分。

**原因**：AI 模型的指令遵循能力不够。

**排查步骤**：

1. 确认使用的是推荐级别的模型。OpenSpec 推荐使用高推理能力的模型（Claude Opus 4.5+、GPT-5+级别）
2. 检查 `openspec/project.md` 是否填写了项目上下文。如果 `project.md` 是空的，AI 缺少关键上下文
3. 检查 `openspec/AGENTS.md` 是否存在。这个文件由 OpenSpec 自动维护，如果被手动删除或清空，AI 的行为指引会丢失
4. 尝试手动在对话中提醒 AI："请读取 openspec/AGENTS.md 获取行为指引"

### 多工具的 skill 文件冲突

同时使用 Cursor 和 Claude Code 时，两者的指令文件对同一命令的描述不一致。

**原因**：两个工具生成的 skill 文件应该是完全一致的（只是格式适配不同），但如果在不同时间点生成（比如中间 OpenSpec 更了版本），可能出现不一致。

**解决方法**：

```bash
openspec update
```

一次性刷新所有工具的 skill 文件，确保一致。

### Spec 文件编码问题

某些工具（特别是 Kimi CLI、Trae 等中文环境工具）生成的 spec 文件可能有编码问题——比如 UTF-8 BOM、奇怪的换行符。

**排查方法**：

```bash
# 检查文件编码
file openspec/specs/auth/spec.md

# 如果有 BOM，移除它
sed -i '1s/^\xEF\xBB\xBF//' openspec/specs/auth/spec.md
```

OpenSpec 的合并引擎期望文件是 UTF-8 无 BOM 编码。BOM 可能导致解析失败。

---

## 实战：一个功能用两个不同工具完成

用一个真实的例子演示多工具工作流。假设你要给一个 React 应用添加"用户偏好设置"功能，功能涉及前端和后端。

### 场景描述

- 功能：用户可以设置界面语言、时区、通知偏好
- 前端：React + TypeScript
- 后端：Node.js + Express + PostgreSQL
- 你的工作方式：白天在公司用 Cursor，晚上在家用 Claude Code

### 第一步：用 Cursor 发起变更

早上到公司，打开 Cursor：

```text
/opsx-propose add-user-preferences
```

Cursor 生成了变更文件：

```
openspec/changes/add-user-preferences/
├── proposal.md       # 动机：用户需要个性化设置
├── specs/
│   ├── user-settings/spec.md    # Delta Spec
│   └── api/spec.md              # API 变更
├── design.md         # 技术方案
└── tasks.md          # 实现清单
```

tasks.md 的内容：

```markdown
# Tasks

## 1. Backend API
- [ ] 1.1 Create UserSettings model and migration
- [ ] 1.2 Create GET /api/user/settings endpoint
- [ ] 1.3 Create PUT /api/user/settings endpoint
- [ ] 1.4 Add input validation

## 2. Frontend
- [ ] 2.1 Create SettingsPage component
- [ ] 2.2 Create useUserSettings hook
- [ ] 2.3 Add language selector
- [ ] 2.4 Add timezone selector
- [ ] 2.5 Add notification preferences

## 3. Integration
- [ ] 3.1 Wire up frontend to backend API
- [ ] 3.2 Add loading and error states
- [ ] 3.3 Test end-to-end flow
```

### 第二步：用 Cursor 完成后端

在 Cursor 中开始 apply：

```text
/opsx-apply
```

Cursor 完成了后端部分（1.1 - 1.4）：

```markdown
## 1. Backend API
- [x] 1.1 Create UserSettings model and migration
- [x] 1.2 Create GET /api/user/settings endpoint
- [x] 1.3 Create PUT /api/user/settings endpoint
- [x] 1.4 Add input validation

## 2. Frontend
- [ ] 2.1 Create SettingsPage component
- [ ] 2.2 Create useUserSettings hook
...
```

现在 commit 代码和 spec 变更：

```bash
git add .
git commit -m "feat: add user preferences API endpoints (backend)

- UserSettings model with language, timezone, notifications
- GET/PUT /api/user/settings endpoints
- Input validation for all fields

OpenSpec change: add-user-preferences (4/10 tasks complete)"
```

### 第三步：回家后用 Claude Code 继续前端

晚上回家，打开终端里的 Claude Code：

```text
/opsx:apply
```

Claude Code 读取了 `openspec/changes/add-user-preferences/tasks.md`，看到任务 1.1-1.4 已完成，从 2.1 开始继续。

Claude Code 完成了前端部分（2.1 - 2.5）和集成部分（3.1 - 3.3）：

```markdown
## 2. Frontend
- [x] 2.1 Create SettingsPage component
- [x] 2.2 Create useUserSettings hook
- [x] 2.3 Add language selector
- [x] 2.4 Add timezone selector
- [x] 2.5 Add notification preferences

## 3. Integration
- [x] 3.1 Wire up frontend to backend API
- [x] 3.2 Add loading and error states
- [x] 3.3 Test end-to-end flow
```

### 第四步：用 Claude Code 归档

所有任务完成后：

```text
/opsx:verify
```

Claude Code 检查实现是否和 spec 一致。确认没问题后：

```text
/opsx:archive
```

Delta Spec 合并进主 spec，变更归档。

### 关键点回顾

这个例子展示了几个要点：

1. **Spec 文件是共享的**。Cursor 生成的 spec 文件，Claude Code 能直接读取和理解
2. **Tasks.md 是协作的桥梁**。已完成的任务标记为 `[x]`，任何工具都能看到进度
3. **不需要额外配置**。两个工具各自有自己的 skill 文件，但操作同一套 spec 数据
4. **工具切换零成本**。不需要导出/导入任何数据，只需要 commit 和 pull

### 如果两个工具对同一个 spec 的理解不一致怎么办

这种情况确实会出现。比如 Cursor 生成的 `design.md` 里选择了 Zustand 做状态管理，但 Claude Code 在 apply 时更习惯用 React Context。

处理方式：

1. **以 design.md 为准**。design.md 是变更的技术方案，两个工具都应该遵循它
2. **如果确实需要改方案**，更新 design.md，确保所有工具读到的是最新版本
3. **commit 频繁**。每次切换工具前 commit 当前状态，这样即使出问题也能回滚

---

## 工具选择建议

不同的使用场景适合不同的工具。这不是绝对的，但有一些经验性的建议：

### 按 AI 编程工具选

| 场景 | 推荐工具 | 原因 |
|------|---------|------|
| 终端工作流、偏好命令行 | Claude Code、Codex CLI | 终端原生，命令语法直观 |
| IDE 开发、需要可视化 | Cursor、Windsurf | IDE 集成，文件操作方便 |
| 企业环境、用 GitHub 生态 | GitHub Copilot | 和 GitHub Actions、PR 集成好 |
| 大型代码库、需要大上下文 | Gemini CLI | 1M token 上下文窗口 |
| 中文环境 | Kimi CLI、Trae | 对中文理解和生成质量好 |

### 按项目阶段选

| 项目阶段 | 推荐做法 |
|---------|---------|
| 初始化 OpenSpec | 任何一个工具都行，差异只在 skill 文件格式 |
| 复杂 propose（涉及多个模块） | Claude Code（推理能力强，spec 质量高） |
| 日常 apply 和迭代 | Cursor（IDE 环境操作方便） |
| Code review | GitHub Copilot（和 GitHub PR 集成好） |
| Brownfield 探索 | Claude Code（`/opsx:explore` 在终端里效率高） |

### 按团队习惯选

如果团队统一使用一个工具，就选那个工具。OpenSpec 的价值不在于工具选择，而在于 spec 驱动的工作流。选团队最顺手的工具就行，spec 文件在所有工具间通用。

---

## 总结

OpenSpec 的多工具支持是它和竞品（Kiro、Spec Kit）的核心区别之一。Kiro 锁定自己的 IDE，Spec Kit 虽然跨工具但流程更重。OpenSpec 的做法是生成轻量的 skill 文件，让每个工具用自己的方式理解同一套 spec。

实际操作中需要注意的点：

- 命令语法有差异（冒号 vs 连字符），不要搞混
- GitHub Copilot 不支持 CLI 环境的 prompt 文件，只能在 IDE 中使用
- 多工具切换靠频繁 commit 保障数据安全
- `openspec update` 是解决大部分集成问题的第一步

工具会变，spec 不应该跟着工具走。今天 Cursor 最流行，明天可能换成了别的。你的 spec 文件应该是项目的一部分，不是工具的一部分。
