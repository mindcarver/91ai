<!--
调研来源（不发布，仅记录）：
1. OpenAI 官方 AGENTS.md 指南: https://developers.openai.com/codex/guides/agents-md
2. OpenAI Codex 源码 openai/codex — config_toml.rs 配置解析逻辑
3. OpenAI Codex 源码 openai/codex — types.rs agents 配置块类型定义
4. zread.ai/openai/codex/19-prompt-engineering-and-context — AGENTS.md 集成与提示词分层
5. zread.ai/openai/codex/22-configuration-reference — 配置键参考
6. zread.ai/openai/codex/11-skills-framework — 技能框架与项目根标记
7. OpenAI "How OpenAI uses Codex" PDF — OpenAI 内部 AGENTS.md 实践
8. Linux 基金会 Agentic AI Foundation AGENTS.md 规范
版本基准: 2026 年 6 月
-->

# Codex CLI AGENTS.md：项目指令文件详解

> **TL;DR** — AGENTS.md 是 Codex 的项目级指令文件，告诉 Codex 这个项目用什么语言、怎么跑测试、哪些文件不能碰。Codex 每次启动都会自动扫描它，从全局到目录分层加载。写好 AGENTS.md 的效果很直接：Codex 不再猜你的包管理器、不再碰你的 .env 文件、不再用错的测试命令。这篇从"解决什么问题"讲到"多项目配置实战"，覆盖 `/init` 脚手架、分层继承、agents 角色配置、developer_instructions 注入等完整机制。

---

## 1. AGENTS.md 解决什么问题

你用 Codex 干过几件事之后，大概率会碰到一个重复出现的情况：每次给 Codex 下任务之前，你都要先交代一堆"项目常识"。

"这个项目用 TypeScript，测试跑 pnpm test，不要碰 .env 文件，修改代码后要跑 lint……"

这些话你说一遍两遍还行，说十遍就烦了。而且总有漏说的时候——某次忘了提醒"别碰 .env"，Codex 就把环境变量文件改了。或者忘了说测试命令，Codex 自己猜了一个 `npm test`，但你的项目用的是 pnpm，猜错了。

AGENTS.md 解决的就是这个重复交代的问题。它是一个放在项目目录里的 Markdown 文件，Codex 每次启动都会自动读取。你在里面写清楚项目的语言、框架、构建命令、编码规范、安全边界，Codex 就不需要你每次再重复了。

这不是一个新概念。如果你用过 Claude Code，它有 CLAUDE.md；用过 Cursor，它有 .cursorrules。AGENTS.md 的不同之处在于：它是 Linux 基金会 Agentic AI Foundation 的开放标准，不只是 Codex 专用——Cursor、GitHub Copilot、Windsurf、Gemini CLI 都能读它。你写一份 AGENTS.md，多个工具都能消费。

但具体到 Codex CLI，AGENTS.md 有一些独有的机制值得单独讲透：五级分层加载、override 文件、fallback 文件名、项目根标记发现、大小限制截断、以及和 agents 角色配置的配合。这些机制组合起来，比"写个 Markdown 文件"要复杂不少。

下面从基础到进阶，把 AGENTS.md 的完整用法讲清楚。

## 2. AGENTS.md 基础

### /init 生成脚手架

Codex 提供了 `/init` 命令，帮你快速生成一个基础版 AGENTS.md。

在 Codex TUI 里输入 `/init`，它会扫描你的项目结构——读 package.json（或 pyproject.toml、Cargo.toml 等项目配置文件），分析目录布局，然后生成一份包含基础信息的 AGENTS.md。

自动生成的内容通常包括：

- 从项目配置中提取的语言和框架
- 从 scripts 字段中提取的构建、测试、lint 命令
- 基于目录结构推断的入口文件和重要路径
- 一个通用的 Working Rules 和 Safety Boundaries 框架

举个例子，如果你有一个 TypeScript + Next.js 项目，`/init` 可能生成这样的内容：

```markdown
# AGENTS.md

## Project Context
- Primary language/framework: TypeScript / Next.js 14
- Main entry points: src/app/page.tsx
- Important directories:
  - src/app/ — pages and API routes
  - src/components/ — shared UI components
  - src/lib/ — business logic and utilities

## Commands
- Install: npm install
- Lint: npm run lint
- Test: npm test
- Build: npm run build

## Working Rules
- Keep changes scoped to the requested task.
- Follow existing patterns in the codebase.
- Update tests when public behavior changes.

## Safety Boundaries
- Do not touch .env* files.
- Never commit directly to main.
```

这只是一个起点。`/init` 能帮你省掉最机械的部分——从配置文件里提取命令和语言信息。但它做不了三件事：

1. **团队隐性约定**。"API handler 必须经过 auth middleware"这条规则不会出现在任何配置文件里，Codex 扫不出来。
2. **项目特定的安全边界**。"不要碰支付模块"这种规则，只有人知道。
3. **个人编码偏好**。"使用 named exports"这种风格选择，工具推断不出来。

所以正确的流程是：`/init` 生成骨架 → 你审查并修正 → 补充团队约定 → 完善安全边界 → 在实际任务中验证和迭代。

### 文件位置与发现机制

AGENTS.md 不是放在某个固定路径就行。Codex 有一套发现机制来决定"去哪里找"和"优先读哪个"。

首先，Codex 需要确定项目根目录在哪。它从当前工作目录（CWD）开始，向上逐级搜索，直到找到 `project_root_markers` 中列出的文件或目录。默认的标记只有一个：`.git`。

```toml
# config.toml
project_root_markers = [".git"]
```

如果你的项目不在 Git 仓库里（比如一个全新的目录），你可以添加其他标记：

```toml
project_root_markers = [".git", "package.json", "pyproject.toml"]
```

如果你把 `project_root_markers` 设成空数组 `[]`，Codex 就不会向上搜索父目录，只看当前目录。

找到项目根之后，Codex 的加载顺序是这样的：

1. **全局级**：`~/.codex/` 目录下的 `AGENTS.md`（或 `AGENTS.override.md`）。对所有项目生效。
2. **项目级**：从项目根目录开始，向下到 CWD，每个目录都检查是否有 AGENTS.md。
3. **合并顺序**：从根到叶依次拼接，靠近 CWD 的文件排在后面，优先级更高。

具体来说，假设你的 CWD 是 `repo/frontend/src/components/`，Codex 会依次检查：

```
~/.codex/AGENTS.md                          ← 全局级
repo/AGENTS.md                              ← 项目根
repo/frontend/AGENTS.md                     ← 前端目录
repo/frontend/src/AGENTS.md                 ← src 目录
repo/frontend/src/components/AGENTS.md     ← 当前目录
```

这些文件不是覆盖关系，而是追加关系——所有文件的内容都会拼接到一起发给模型。靠近 CWD 的排在后面，如果两层的规则冲突，后面的（靠近 CWD 的）因为位置更靠后，模型会更关注它。

还有一个特殊文件：`AGENTS.override.md`。如果某个目录下同时有 `AGENTS.md` 和 `AGENTS.override.md`，只有 override 文件会被加载，`AGENTS.md` 被忽略。这是全量替换，不是部分覆盖。所以 override 文件需要包含该目录需要的全部规则，不能只写覆盖的部分。

### 备选文件名

如果你的团队已经有一个叫 `TEAM_GUIDE.md` 的开发指南文档，不想重命名为 `AGENTS.md`，可以通过 `project_doc_fallback_filenames` 配置来适配。

```toml
# config.toml
project_doc_fallback_filenames = ["TEAM_GUIDE.md", ".agents.md"]
```

配置之后，Codex 在每个目录中的查找顺序变成：

```
1. AGENTS.override.md   ← 最高优先级
2. AGENTS.md            ← 标准
3. TEAM_GUIDE.md        ← 第一备选
4. .agents.md           ← 第二备选
```

找到一个就停止，不会叠加多个备选文件。默认情况下 `project_doc_fallback_filenames` 为空数组，也就是说只认 `AGENTS.md` 和 `AGENTS.override.md`。

这个机制的价值在于向后兼容。很多团队在 Codex 出现之前就已经有了开发指南文档，fallback 让他们不需要改名就能直接用。

## 3. AGENTS.md 内容结构

### 推荐的章节

AGENTS.md 没有强制的格式要求，但 Codex 官方推荐四个核心章节。这不是为了好看，而是为了让模型的注意力集中在有信息量的内容上。

| 章节 | 回答什么问题 | 必须有吗 |
|------|-------------|---------|
| Project Context | "我在一个什么代码库里？" | 建议有 |
| Commands | "怎么构建、测试、检查？" | 必须有 |
| Working Rules | "编码时遵守什么约束？" | 建议有 |
| Safety Boundaries | "哪些东西绝对不能碰？" | 必须有 |

Commands 和 Safety Boundaries 是信息密度最高的两个。没有 Commands，Codex 不知道怎么验证自己的修改；没有 Safety Boundaries，Codex 什么都敢碰。

**Project Context** 的典型写法：

```markdown
## Project Context
- Primary language/framework: Python 3.11 / FastAPI / SQLAlchemy 2.0
- Main entry points: app/main.py (API), app/workers.py (background tasks)
- Important directories:
  - app/api/ — REST API endpoints
  - app/models/ — SQLAlchemy ORM models
  - app/services/ — business logic layer
  - tests/ — pytest test suites
  - alembic/ — database migration scripts
- Architecture: Layered (API -> Service -> Model)
```

注意几个要点：路径用项目根目录的相对路径（`src/app/` 而非 `./src/app/`），标注"不要动"的内容和标注"要关注"的内容一样重要，架构描述一句话就够。

**Commands** 的典型写法：

```markdown
## Commands
- Install: pnpm install
- Lint: pnpm lint
- Type check: pnpm typecheck
- Test (all): pnpm test
- Test (single file): pnpm test -- src/__tests__/auth.test.ts
- Test (watch): pnpm test -- --watch
- Build: pnpm build
- Database migrate: pnpm prisma migrate dev
- Database generate: pnpm prisma generate
```

关键原则：写实际命令，不写描述。`pnpm test` 而不是"运行测试"。包含常用变体（全部测试、单个文件、watch 模式）。不要假设模型知道你用哪个包管理器。

**Working Rules** 的典型写法：

```markdown
## Working Rules
- Keep changes scoped to the requested task. Do not refactor adjacent code unless asked.
- Follow existing patterns. If the codebase uses Zod for validation, use Zod.
- When modifying a component, check if it has tests and run them before/after changes.
- Use named exports, not default exports.
- For CSS, use Tailwind utility classes. Do not introduce CSS modules.
```

写规则的核心原则：只写和项目约定不一致的、或者模型默认行为可能出错的部分。"写干净的代码"不是好规则（不可验证）。"Use named exports, not default exports" 是好规则（可以在 diff 里检查）。

**Safety Boundaries** 的典型写法：

```markdown
## Safety Boundaries
- Do not touch .env* files under any circumstances.
- Do not modify files in prisma/migrations/ without explicit request.
- Never commit directly to main branch.
- Before modifying anything in src/lib/auth/, explain proposed changes and wait for confirmation.
- Never delete or rename exported functions without checking all usages first.
```

这个章节是 AGENTS.md 中最不该省略的。一个没有安全边界的 AGENTS.md 等于告诉 Codex "什么都可以动"。

### 常见指令类型

除了四个核心章节，AGENTS.md 还可以包含一些辅助内容：

- **References（引用）**：指向更详细的文档。"API 规范见 docs/api-design.md"。让 AGENTS.md 做内容目录，不做百科全书。
- **Specific rules for specific scenarios**：比如"PR 需要同时更新类型定义"。
- **Dependencies instructions**：比如"新增依赖必须经过确认"。

但记住一个原则：AGENTS.md 的总长度应该控制在 100 行以内。超过了，说明你塞了太多不属于"项目常识"的内容。

### 大小限制

Codex 对 AGENTS.md 有大小限制。默认是 32 KiB（32768 字节），最大可以配置到 64 KiB（65536 字节）。

```toml
# config.toml
project_doc_max_bytes = 32768  # 默认值
```

超过限制的文件会被**静默截断**——不报错，但不加载超出部分的内容。这是一个隐蔽的失败模式：你写了 500 行 AGENTS.md，超过了 32 KiB，Codex 装作什么都没看到，你以为规则没生效，其实是文件被截断了。

检查方法：

```bash
wc -c AGENTS.md
```

如果超过 32768，要么精简内容，要么在 config.toml 中调大 `project_doc_max_bytes`。但在调大之前先想想：500 行的 AGENTS.md，模型真的能消化吗？研究显示模型对上下文中间部分的注意力最弱（lost in the middle 问题），过长的文件中间部分大概率被忽略。

## 4. 层级与优先级

### 用户 config.toml vs AGENTS.md

这两者是不同层面的配置。config.toml 控制 Codex 的运行时行为（用哪个模型、沙箱怎么配、MCP 接入什么服务），AGENTS.md 提供项目领域的上下文知识（用什么语言、怎么跑构建、哪些文件不能碰）。

有一个容易混淆的点：config.toml 里也有 `developer_instructions` 字段，可以注入自定义指令。它和 AGENTS.md 的区别是什么？

`developer_instructions` 是 config.toml 中的字符串字段，内容会作为开发者角色的消息注入到对话中。适合放简短的、跨项目通用的指令，比如"代码注释用中文"。

```toml
# config.toml
developer_instructions = "代码注释使用中文，变量命名使用 camelCase"
```

AGENTS.md 是独立的 Markdown 文件，支持更复杂的结构（多章节、代码块、列表），适合放项目特定的上下文。它通过分层机制加载，可以在不同目录有不同内容。

两者的优先级：直接来自 prompt 的系统/开发者/用户指令始终覆盖 AGENTS.md 指令。也就是说，如果你在对话中明确说了"用 CSS modules"，这条指令会覆盖 AGENTS.md 中"用 Tailwind"的规则。

### model_instructions_file 替代

config.toml 中有一个比较特殊的字段 `model_instructions_file`，它指向一个文件路径，该文件的内容会替换 Codex 内置的系统指令。

```toml
# config.toml
model_instructions_file = "./my-custom-instructions.md"
```

这个字段**强烈不建议使用**。官方文档明确说：偏离官方指令极有可能导致性能下降。内置指令是 OpenAI 针对 Codex 的 agent loop 精心调校的，你自己写的指令大概率不如官方的好。

如果你确实需要额外的指令，用 AGENTS.md 或 `developer_instructions` 就够了。只有在你非常清楚自己在做什么、且有充分理由要完全替换系统指令时，才考虑 `model_instructions_file`。

### child_agents_md 层级

当 `child_agents_md` 功能标志启用时，Codex 会在所有 AGENTS.md 内容之后追加一条分层指导消息。这条消息告诉模型：

- 每个 AGENTS.md 文件的作用域是其所在文件夹为根的整个目录树
- 指令适用于该作用域内的所有文件
- 发生冲突时，嵌套更深的文件优先

这个机制的效果是让模型更清楚地理解分层规则，而不是把所有层的内容一股脑地当作"平级"信息。你在根目录写了"测试用 Vitest"，前端子目录写了"组件测试用 Testing Library"，模型能正确判断出在 `frontend/src/components/` 下工作时应该遵循后者的规则。

## 5. 多项目 AGENTS.md

### monorepo 场景

monorepo 是 AGENTS.md 分层机制发挥最大价值的场景。典型的 monorepo 结构：

```
repo/
  AGENTS.md                    ← 全项目共享（命令、架构、安全）
  frontend/
    AGENTS.md                  ← 前端专属（框架、样式、测试）
    src/
      components/
        AGENTS.md              ← 组件规范
      hooks/
        AGENTS.md              ← Hooks 规范
  backend/
    AGENTS.md                  ← 后端专属（API 规范、数据库）
    src/
      routes/
        AGENTS.md              ← 路由规范
      repositories/
        AGENTS.md              ← 数据访问规范
```

每层只写该层特有的规则。根目录写全项目通用的命令和架构约束，前端目录写 React/Next.js 特定的规则，组件目录写组件命名和测试策略。

当 Codex 在 `frontend/src/components/` 下工作时，它加载的上下文是这四层的合并：

| 层级 | 文件 | 职责 |
|------|------|------|
| 1 | `frontend/src/components/AGENTS.md` | 组件命名、Props 规范 |
| 2 | `frontend/AGENTS.md` | 前端技术栈、样式约定 |
| 3 | `repo/AGENTS.md` | 全项目命令、架构概览 |
| 4 | `~/.codex/AGENTS.md` | 个人偏好 |

### 子目录 AGENTS.md

子目录 AGENTS.md 的判断标准很简单：如果一条规则只在特定模块下有意义，它就该放在那个模块的 AGENTS.md 里，而不是根目录。

举个例子，"API handler 的输入验证必须用 Zod schema"这条规则只对 `src/api/` 目录有意义。放在根目录 AGENTS.md 里，Codex 在改前端组件时也会看到这条规则，白白浪费上下文空间。放在 `src/api/AGENTS.md` 里，只有当 Codex 在 api 目录下工作时才会加载。

一个实用的原则：每条规则只出现在能覆盖它所需范围的最底层。根目录 AGENTS.md 控制在 15-30 行。子目录 AGENTS.md 控制在 10-20 行。所有层级加起来不超过 100 行。

## 6. developer_instructions 补充

除了 AGENTS.md，config.toml 中的 `developer_instructions` 是另一种注入项目知识的方式。它适合放短小精悍的、跨项目通用的指令。

```toml
# ~/.codex/config.toml
developer_instructions = "代码注释使用中文。Git commit message 使用英文。优先使用函数式风格。"
```

这个字段的特点是：

- 它是 config.toml 的一部分，随配置一起加载，不需要额外的文件
- 它作为开发者角色的消息注入，语义上比 AGENTS.md 的"项目文档"更接近"系统指令"
- 适合放 1-2 行的个人偏好，不适合放复杂的多章节内容

如果你需要更长的、结构化的项目指令，用 AGENTS.md。如果你只需要在 config.toml 里加一行"注释用中文"，`developer_instructions` 就够了。

两者可以共存，不冲突。`developer_instructions` 的优先级更高，会覆盖 AGENTS.md 中的冲突规则。

## 7. agents 配置块

AGENTS.md 是给 Codex 的"项目知识"。config.toml 中的 `[agents]` 配置块是给 Codex 的"角色管理"。它们解决不同层面的问题，但在多 agent 场景下有配合关系。

### 自定义 Agent 角色

在 config.toml 中，你可以定义自定义的 agent 角色：

```toml
# config.toml

[agents]
max_threads = 6
max_depth = 1
job_max_runtime_seconds = 300

[agents.researcher]
description = "Research-focused role for codebase investigation."
config_file = "./agents/researcher.toml"
nickname_candidates = ["Herodotus", "Ibn Battuta"]

[agents.reviewer]
description = "Code review specialist."
config_file = "./agents/reviewer.toml"
nickname_candidates = ["Sherlock", "Poirot"]
```

每个角色有三个核心属性：

- **description**：描述这个角色做什么。面向用户，在 `/agent` 命令的选择器中显示。
- **config_file**：角色专用的 TOML 配置文件路径（相对于定义它的 config.toml）。这个配置文件可以为该角色指定不同的模型、沙箱设置、审批策略。
- **nickname_candidates**：当使用这个角色的 agent 被创建时，从候选昵称池中随机选一个名字显示在 TUI 中。

角色专用配置文件的写法和普通 config.toml 一样，只是覆盖该角色的特定设置：

```toml
# agents/researcher.toml

model = "o4-mini"
approval_policy = "on-failure"
sandbox = "read-only"

[agents.researcher]
description = "Deep codebase investigation, no writes."
```

这意味着当你启动一个 researcher 角色的 agent 时，它会用轻量模型、只读沙箱、失败时才审批。而默认角色可能用的是 o3 模型、写沙箱、从不审批。两者互不干扰。

### 嵌套深度与并发

`[agents]` 顶层的三个参数控制多 agent 的全局行为：

```toml
[agents]
max_threads = 6       # 最大并发 agent 线程数
max_depth = 1         # agent 嵌套深度限制
job_max_runtime_seconds = 300  # 默认 worker 超时时间（秒）
```

**max_threads** 控制同一时间最多能跑多少个 agent。默认无限制（不设置就不限制），但建议设一个合理的值防止资源耗尽。6 是一个在大多数开发机器上安全的默认值。

**max_depth** 控制 agent 的嵌套层数。深度为 1 意味着主 agent 可以启动子 agent，但子 agent 不能再启动孙 agent。深度为 2 允许三层。默认值为 1。

为什么要限制嵌套深度？因为嵌套 agent 会指数级增长资源消耗和复杂度。一个三层嵌套的 agent 树，如果每层启动 3 个子 agent，就是 3^3 = 27 个 agent 同时运行。大多数场景下，两层就足够了。

**job_max_runtime_seconds** 是每个 worker agent 的默认超时时间。如果一个子 agent 运行超过这个时间（单位：秒），会被自动终止。默认 300 秒（5 分钟）。对于简单任务够用，对于复杂任务可能需要调大。

### agents 和 AGENTS.md 的配合

自定义 agent 角色和 AGENTS.md 可以很好地配合。一个常见的模式是：

- 根目录 AGENTS.md 定义全项目的基本规则（命令、安全边界）
- 不同角色的 agent 配置文件（如 `agents/researcher.toml`）定义该角色专用的模型和沙箱设置
- 子目录 AGENTS.md 为不同模块提供特定的编码规范

当 researcher 角色的 agent 在 `backend/src/routes/` 目录下工作时，它会同时受到三层约束：全局 AGENTS.md 的基本规则、`backend/` 和 `src/routes/` 的局部规则、researcher 角色的只读沙箱限制。

## 8. AGENTS.md 实战

### 场景一：TypeScript 项目的 AGENTS.md

假设你有一个 Next.js 前端项目，项目结构如下：

```
my-nextjs-app/
  package.json
  tsconfig.json
  tailwind.config.ts
  next.config.ts
  src/
    app/           ← Next.js App Router 页面
    components/    ← 可复用 UI 组件
    lib/           ← 工具函数和共享逻辑
    __tests__/    ← 测试文件
  public/          ← 静态资源
  prisma/          ← 数据库 schema
```

推荐的根目录 AGENTS.md：

```markdown
# AGENTS.md

## Project Context
- Primary language/framework: TypeScript / React 18 / Next.js 14 (App Router)
- Main entry points: src/app/page.tsx, src/app/layout.tsx
- Important directories:
  - src/app/ — pages and API routes (App Router)
  - src/components/ — shared UI components
  - src/lib/ — business logic and utilities
  - src/__tests__/ — test files (Jest + React Testing Library)
  - prisma/ — database schema and migrations
  - public/ — static assets (do not modify generated files)

## Commands
- Install: pnpm install
- Lint: pnpm lint
- Type check: pnpm typecheck
- Test (all): pnpm test
- Test (single file): pnpm test -- src/__tests__/auth.test.ts
- Build: pnpm build
- Database migrate: pnpm prisma migrate dev
- Database generate: pnpm prisma generate

## Working Rules
- Keep changes scoped to the requested task. Do not refactor adjacent code.
- Follow existing patterns. Use Zod for validation if the codebase uses it.
- When modifying a component, run its tests before and after changes.
- Prefer server components by default. Only add "use client" when necessary.
- Use named exports, not default exports.
- For CSS, use Tailwind utility classes. Do not introduce CSS modules.

## Safety Boundaries
- Do not touch .env* files.
- Do not modify prisma/migrations/ without explicit request.
- Never commit directly to main.
- Do not modify generated files in public/.
- Ask before changing anything in src/lib/auth/.

## References
- Architecture decisions: docs/architecture/
- API documentation: docs/api/
```

大约 45 行，信息密度高，没有废话。模型读完之后对这个项目的全部必要信息都有了认知。

### 场景二：Python 项目的 AGENTS.md

假设你有一个 FastAPI + SQLAlchemy 的后端项目：

```markdown
# AGENTS.md

## Project Context
- Primary language/framework: Python 3.11 / FastAPI / SQLAlchemy 2.0
- Main entry points: app/main.py (API server), app/workers.py (background tasks)
- Important directories:
  - app/api/ — REST API endpoints, organized by domain
  - app/models/ — SQLAlchemy ORM models
  - app/services/ — business logic layer
  - app/schemas/ — Pydantic request/response schemas
  - tests/ — pytest test suites
  - alembic/ — database migration scripts
  - docs/ — architecture and API documentation

## Commands
- Install: poetry install
- Lint: ruff check . && ruff format --check .
- Type check: mypy app/
- Test (all): pytest tests/
- Test (single file): pytest tests/test_auth.py
- Test (with coverage): pytest --cov=app tests/
- Database migrate: alembic revision --autogenerate -m "description"
- Database upgrade: alembic upgrade head
- Run dev server: uvicorn app.main:app --reload

## Working Rules
- Follow the layered architecture: API handlers in app/api/, logic in app/services/.
- Use SQLAlchemy 2.0 style (Mapped, mapped_column), not legacy Query API.
- Use Pydantic v2 model_config, not Config class.
- When adding an API endpoint, add tests in tests/.
- All datetime values must be timezone-aware (UTC).

## Safety Boundaries
- Do not touch .env or .env.production files.
- Do not modify alembic/versions/ migration files that have been applied.
- Ask before changing any model in app/models/ — schema changes need migration.
- Never run alembic upgrade head against production without explicit request.
- Never commit directly to main.

## References
- Architecture decisions: docs/architecture/
- API specification: docs/api-spec.md
- Database design: docs/database-design.md
```

### 场景三：monorepo 的多层级配置

假设你有一个前后端分离的 monorepo，用 pnpm workspaces 管理：

**根目录 AGENTS.md**（全项目共享，约 20 行）：

```markdown
# AGENTS.md

## Project Context
- Monorepo managed by pnpm workspaces
- Primary language: TypeScript
- Package manager: pnpm (not npm, not yarn)

## Commands
- Install all: pnpm install
- Build all: pnpm build
- Test all: pnpm test
- Lint all: pnpm lint
- Type check: pnpm typecheck

## Architecture
- apps/web — Next.js frontend application
- apps/api — Express API service
- packages/shared — shared types and utilities
- packages/ui — shared UI component library

## Safety Boundaries
- Do not touch .env* files.
- Do not modify database migration files without explicit request.
- Never commit directly to main.
```

**apps/web/AGENTS.md**（前端专属，约 15 行）：

```markdown
# AGENTS.md — apps/web

## Tech Stack
- Next.js 14 (App Router)
- React 18
- Tailwind CSS
- Vitest + Testing Library

## Commands
- Dev: pnpm --filter web dev
- Build: pnpm --filter web build
- Test: pnpm --filter web test

## Working Rules
- Pages go in app/, reusable components in src/components/.
- Server components by default; add "use client" only when needed.
- API calls go through src/lib/api/, not raw fetch in components.
```

**apps/api/AGENTS.md**（后端专属，约 15 行）：

```markdown
# AGENTS.md — apps/api

## Tech Stack
- Express.js
- Prisma ORM
- PostgreSQL

## Commands
- Dev: pnpm --filter api dev
- Build: pnpm --filter api build
- Test: pnpm --filter api test

## Working Rules
- RESTful endpoints, resource names in plural.
- Input validation with Zod schemas.
- Error responses use standard HTTP status codes.
- New fields require prisma migrate dev migration.
```

三层加起来约 50 行。不重复，不冲突，各司其职。Codex 在 `apps/web/` 下工作时加载全局 + 前端两层，在 `apps/api/` 下工作时加载全局 + 后端两层。

## 八个常见错误

1. **把项目规则写在 prompt 里而不是 AGENTS.md 里**。每次重复输入规则，既浪费 token 又容易漏。判断标准：如果一条规则在超过 50% 的任务中都需要，它就该在 AGENTS.md 里。

2. **Commands 部分写描述不写实际命令**。写了"运行 lint 检查"而不是 `pnpm lint`，模型还是要猜。写模型可以直接在 shell 中执行的字符串。

3. **AGENTS.md 写成 300-500 行的百科全书**。项目介绍、架构设计文档、API 规范、数据库 schema 全塞进去。上下文窗口被挤占，中间部分大概率被模型忽略。控制在 100 行以内，用链接指向深层文档。

4. **不和代码一起维护**。AGENTS.md 还在说"用 Jest"，但项目半年前已经切到 Vitest。模型尝试运行不存在的命令，浪费一轮交互。

5. **各层重复写相同内容**。根目录写了"用 pnpm install"，前端目录又写了一遍，组件目录还写了一遍。三层重复，浪费上下文。每条规则只出现在能覆盖它所需范围的最底层。

6. **不用 /init 先生成基线**。从零手写容易遗漏 package.json 中不常用的 script。让工具自动提取机械部分，你专注于只有人类才能提供的约定和边界。

7. **不在真实任务中验证**。写完 AGENTS.md 就以为完成了。应该让 Codex 执行几组覆盖不同要素的任务，观察行为是否符合预期。

8. **文件超过大小限制不自知**。32 KiB 限制的截断是静默的——不报错，只是不加载。定期检查 `wc -c AGENTS.md`。

## 诊断速查

当 AGENTS.md "不生效"时，按以下顺序排查：

```
1. Codex 是否加载了文件？
   → codex --ask "列出你加载的所有 AGENTS.md 规则"

2. 文件是否超过大小限制？
   → wc -c path/to/AGENTS.md
   → 超过 32768 就被截断

3. 是否被 override 覆盖？
   → 检查同目录下是否有 AGENTS.override.md

4. CWD 是否正确？
   → Codex 从 CWD 开始向上查找
   → 确认你在正确的目录下启动

5. 规则之间是否有冲突？
   → 近 CWD 的优先级更高
   → 高优先级的覆盖低优先级的

6. 配置项是否正确？
   → project_doc_fallback_filenames 拼写对吗
   → project_root_markers 是否为空数组
   → 重启 Codex 让配置生效
```

## AGENTS.md vs CLAUDE.md

很多开发者同时用 Codex 和 Claude Code，想知道能不能只维护一份。

核心差异：

| 维度 | AGENTS.md | CLAUDE.md |
|------|-----------|-----------|
| 标准归属 | Linux 基金会开放标准 | Anthropic 私有格式 |
| 消费工具 | Codex、Cursor、Copilot 等 | 仅 Claude Code |
| 加载机制 | 五级分层，支持 override | 两级（全局 + 项目） |
| 备选文件名 | 支持 fallback 列表 | 不支持 |
| 大小限制 | 32 KiB 默认 | 无硬限制 |
| 跨工具移植 | 高 | 低 |

实际建议：如果你同时用多个工具，以 AGENTS.md 为主——它是"最小公共集"。把核心规则放在 AGENTS.md 里（Commands、Safety Boundaries、Project Context），把 Claude Code 特定的偏好放在 CLAUDE.md 里。两者可以有重叠，但 AGENTS.md 是共享基础，CLAUDE.md 是特定扩展。

## 延伸阅读

- [AGENTS.md 官方指南](https://developers.openai.com/codex/guides/agents-md) — OpenAI 的官方 AGENTS.md 文档，涵盖全局、仓库、子目录三层配置和 override 机制
- [How OpenAI uses Codex](https://cdn.openai.com/pdf/6a2631dc-783e-479b-b1a4-af0cfbd38630/how-openai-uses-codex.pdf) — OpenAI 内部如何使用 Codex 和维护 AGENTS.md 的实践分享
- [AGENTS.md 开放标准](https://agents.md) — Linux 基金会 Agentic AI Foundation 的 AGENTS.md 规范网站
- [Codex 配置参考（本系列）](22-config-overview.md) — config.toml 的分层加载机制和全部配置键
- [Codex 多 Agent 协作（本系列）](codex-todo.md) — agents 配置块和多线程 agent 的使用方法（计划中）
