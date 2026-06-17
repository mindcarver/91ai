# AGENTS.md：把项目知识写成机器可消费的上下文

**TL;DR：** AGENTS.md 不是写给人类读的工程手册，而是写给 coding agent 的结构化上下文文件。它用 Project Context、Commands、Working Rules、Safety Boundaries 四个要素把项目常识压缩成模型可以直接消费的指令，控制在约 100 行以内，作为"内容目录"指向 docs/ 目录中的深层文档。AGENTS.md 已经是 Linux 基金会 Agentic AI Foundation 的开放标准，可被 Codex、Cursor、Copilot、Windsurf、Gemini CLI 等工具统一读取。

---

## 从 README.md 到 AGENTS.md：一个认知转换

大多数开发者第一次听说 AGENTS.md 时的直觉反应是："这不就是另一个 README 吗？"这个判断只对了一半。格式上确实都是 Markdown，但设计目标和消费对象完全不同。

README.md 写给人看。它解释项目是什么、为什么存在、怎么上手。面向的读者是一个刚 clone 仓库、准备理解项目的工程师。语言自然、结构灵活、篇幅不限，可以讲设计哲学、贴架构图、列贡献者名单。

AGENTS.md 写给模型看。它不解释"是什么"和"为什么"，只陈述"怎么做"和"不能做什么"。面向的消费者是一个即将在这个代码库里执行任务的 coding agent。语言要求精确无歧义、结构固定、篇幅严格控制，每一个 token 都有明确的信息载荷。

这个区别听起来简单，但在实践中是最大的踩坑点。很多人把 AGENTS.md 写成了第二份 README，塞满背景介绍和设计阐述，结果模型在有限的上下文窗口里读完一段项目愿景后，根本没有空间去理解真正需要的编码规范和构建命令。AGENTS.md 的核心设计原则是：**每一个字符都应该在帮助模型做出更好的决策。** 不能直接转化为模型行为的信息，就是噪声。

OpenAI Harness Engineering 团队在公开分享中反复强调一个实践：**渐进式披露（progressive disclosure）**。不要试图在 AGENTS.md 里把所有知识都写完。从小而稳定的切入点开始，只放模型每次执行任务都需要的常识。更深层的领域知识、架构决策的来龙去脉、特定模块的实现细节，放到 docs/ 目录中的专门文档里，在 AGENTS.md 中用链接指向它们。

这个实践背后的逻辑清晰：上下文窗口是稀缺资源。一个约 100 行的 AGENTS.md 大约占用 3000-5000 tokens，这在一个典型任务的上下文预算中是合理的占比。如果你写了一个 500 行的"百科全书式" AGENTS.md，它可能占用 15000+ tokens，直接挤压模型处理实际代码和任务指令的空间。更关键的是，研究表明模型对中间部分的上下文注意力最弱（lost in the middle 问题），一个过长的 AGENTS.md 中间部分的规则很可能被模型忽略。

## AGENTS.md 的标准定位

2025 年，AGENTS.md 正式成为 Linux 基金会旗下 Agentic AI Foundation 的开放标准。这意味着它不再只是 Codex 的私有配置文件，而是一个跨工具的通用规范。当前支持读取 AGENTS.md 的工具包括但不限于：

| 工具 | 加载方式 | 识别的文件名 |
|------|---------|-------------|
| OpenAI Codex CLI | 启动时自动加载 | `AGENTS.md` |
| Cursor | 内置支持 | `AGENTS.md` |
| GitHub Copilot | Workspace 配置 | `AGENTS.md` |
| Windsurf | 内置支持 | `AGENTS.md` |
| Gemini CLI | 内置支持 | `AGENTS.md` |

这个跨工具兼容性是 AGENTS.md 相对于工具特定配置文件（比如 `.cursorrules` 或 `.github/copilot-instructions.md`）的核心优势。你写一份 AGENTS.md，多个工具都能读到。这意味着团队不需要为每个 coding agent 维护一套独立的项目知识，一份 AGENTS.md 就能覆盖大部分场景。

当然，不同工具对 AGENTS.md 的解析深度和支持的语法特性可能有差异。但核心的四要素结构（Project Context、Commands、Working Rules、Safety Boundaries）是通用的，所有工具都能理解。高级特性（比如子目录级别的 AGENTS.md 分层覆盖）则需要查阅各工具的具体实现。

## 四要素写法

AGENTS.md 的核心结构由四个要素组成。这四个要素覆盖了 coding agent 在一个代码库中工作时需要的全部"常识"。下面逐个展开。

### 1. Project Context（项目上下文）

项目上下文回答一个核心问题："我正在一个什么样的代码库里工作？"

这个要素包含以下信息：

- **主要语言和框架**：让模型知道应该用什么语法风格、API 模式和生态惯例。写 "TypeScript / React / Next.js" 比只写 "JavaScript" 有用得多。
- **入口文件**：告诉模型从哪里开始理解代码流。通常是一个或几个文件路径。
- **重要目录**：标注哪些目录包含核心业务逻辑、哪些是测试、哪些是配置、哪些是生成代码。这帮助模型在搜索代码时优先关注正确的位置。
- **架构模式**：如果项目采用了特定的架构模式（如 hexagonal architecture、CQRS、monorepo），在这里简短标注。不需要解释为什么选这个模式，只需要让模型知道它的存在。

```markdown
## Project Context
- Primary language/framework: TypeScript / React 18 / Next.js 14 (App Router)
- Main entry points: src/app/page.tsx, src/app/api/
- Important directories:
  - src/app/ — pages and API routes (Next.js App Router)
  - src/components/ — shared UI components
  - src/lib/ — business logic and utilities
  - src/__tests__/ — test files (Jest + React Testing Library)
  - prisma/ — database schema and migrations
  - public/ — static assets (do not modify generated files here)
- Architecture: App Router with server components by default; client components marked with "use client"
```

注意几点实践原则：

- 路径使用项目根目录的相对路径，以 `src/` 而非 `./src/` 开头。
- 标注不要动的内容和标注要关注的内容一样重要。比如 `public/` 目录中如果有构建生成的文件，要明确说"do not modify"。
- 架构描述一句话就够。不需要解释为什么选 App Router，只需要让模型知道默认用 server component。

### 2. Commands（命令）

命令要素回答："在这个项目里，怎么安装依赖、检查代码、跑测试和构建产物？"

这是 AGENTS.md 中信息密度最高、实操价值最大的部分。很多 Codex 任务失败的根因就是模型不知道正确的构建命令。

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

几个关键的写法原则：

- **用实际命令，不要用描述**。写 `pnpm lint`，而不是"运行 ESLint 检查"。模型需要的是可以直接在 shell 中执行的字符串。
- **包含常用变体**。上面示例中不仅有 `pnpm test`，还有跑单个文件和 watch 模式的命令。这能避免模型在需要跑单个测试时自己猜测命令格式。
- **覆盖完整的开发工作流**。安装、检查、测试、构建是最基本的四步。如果你的项目还有数据库迁移、代码生成等步骤，也要写上。
- **不要假设模型知道你的包管理器**。写 `pnpm` 就写 `pnpm`，不要写 "用你喜欢的包管理器"。模型不知道你用什么包管理器，也不应该猜。

一个常见的问题是："这些命令在 package.json 里都有，为什么还要在 AGENTS.md 里重复写？"原因有两个：第一，模型需要从 package.json 的 scripts 字段中解析出正确的命令，这个解析过程本身可能出错（比如区分 dev 脚本和 build 脚本）；第二，AGENTS.md 中的命令列表明确告诉模型"这些是你应该使用的命令"，而不是让模型自己去发现和选择。

### 3. Working Rules（工作规则）

工作规则回答："在这个项目里做修改时，我应该遵循什么约束和偏好？"

```markdown
## Working Rules
- Keep changes scoped to the requested task. Do not refactor adjacent code unless asked.
- Follow existing patterns in the codebase. If existing code uses Zod for validation, use Zod. Do not introduce new libraries without explicit request.
- When modifying a component, check if it has tests. If it does, run them before and after changes.
- When adding new public APIs or modifying existing ones, update the corresponding types in src/types/.
- Prefer server components by default. Only add "use client" when browser APIs or React hooks are needed.
- Use named exports, not default exports, for consistency with existing code.
- For CSS, use Tailwind utility classes. Do not introduce CSS modules or styled-components.
```

工作规则是最需要拿捏分寸的部分。写得太多，模型被规则淹没，灵活性下降；写得太少，模型按通用偏好行事，可能与项目约定冲突。

一些实践建议：

- **只写与项目约定不符或模型默认行为可能冲突的规则**。如果项目用 Tailwind，这需要写，因为模型默认可能选择 CSS modules 或 styled-components。如果项目用 TypeScript strict mode，这可能不需要写，因为模型会从 tsconfig.json 读到。
- **每条规则应该是可观察、可验证的**。"写干净的代码"不是好规则，因为不可验证。"Use named exports, not default exports" 是好规则，因为可以在 diff 中直接检查。
- **避免模糊的价值判断**。"Prefer simplicity over complexity" 听起来正确但没有可操作性。"Do not introduce new libraries without explicit request" 是可操作的。

### 4. Safety Boundaries（安全边界）

安全边界回答："在这个项目里，有哪些东西我绝对不应该碰？"

```markdown
## Safety Boundaries
- Do not touch .env* files under any circumstances.
- Do not modify files in prisma/migrations/ without explicit request and confirmation.
- Never run `pnpm build` followed by deployment commands without explicit request.
- Never commit directly to the main branch.
- Do not modify files in public/ that are generated by the build process.
- Before modifying any file in src/lib/auth/, explain the proposed change and wait for confirmation.
- Never delete or rename exported functions/types without checking all usages first.
```

安全边界是 AGENTS.md 中最不应该省略的部分。一个没有安全边界的 AGENTS.md 等于告诉 agent "什么都可以动"，这在真实项目中是不可接受的风险。

安全边界的设计思路：

- **保护敏感文件**：环境变量、密钥文件、数据库迁移文件、生产配置。
- **保护高影响区域**：认证模块、支付逻辑、核心数据模型。这些区域的修改可能产生广泛影响。
- **防止不可逆操作**：直接推送到 main、删除数据库、执行部署。
- **设置确认门槛**：对于高风险但有时必要的操作，要求先解释再执行，而不是完全禁止。

安全边界的粒度需要根据项目阶段和信任程度调整。一个刚上手的个人项目可能只需要几条基本规则；一个多人协作的生产系统需要更细粒度的保护。

## 完整模板

把四个要素组合起来，下面是一个可直接使用的 AGENTS.md 模板。这个模板控制在约 80 行，预留了约 20 行的空间给项目特定的扩展。

```markdown
# AGENTS.md

## Project Context
- Primary language/framework: [Language] / [Framework] / [Runtime]
- Main entry points: [path/to/entry]
- Important directories:
  - [dir1/] — [purpose]
  - [dir2/] — [purpose]
  - [dir3/] — [purpose]
- Architecture: [one-line description of key architectural pattern]

## Commands
- Install: [package-manager] install
- Lint: [command]
- Type check: [command]
- Test (all): [command]
- Test (single file): [command] -- [path-pattern]
- Build: [command]
- Other: [any project-specific commands]

## Working Rules
- Keep changes scoped to the requested task.
- Follow existing patterns before introducing new abstractions.
- Update tests when public behavior changes.
- [Project-specific rule 1]
- [Project-specific rule 2]
- [Project-specific rule 3]

## Safety Boundaries
- Do not touch [sensitive files or directories].
- Ask before modifying [high-impact areas].
- Never run [dangerous commands] without explicit request.
- Never commit directly to main/master.
- [Project-specific boundary 1]

## References
- Architecture decisions: docs/architecture/
- API documentation: docs/api/
- Contributing guide: docs/contributing.md
```

最后一节 `References` 体现了"内容目录"原则：AGENTS.md 不承载完整的领域知识，而是指向包含这些知识的文档。当模型遇到需要更深层上下文的任务时，它知道去哪里找。

来看一个真实项目风格的完整示例：

```markdown
# AGENTS.md

## Project Context
- Primary language/framework: Python 3.11 / FastAPI / SQLAlchemy 2.0
- Main entry points: app/main.py (API), app/workers.py (background tasks)
- Important directories:
  - app/api/ — REST API endpoints, organized by domain
  - app/models/ — SQLAlchemy ORM models
  - app/services/ — business logic layer
  - app/schemas/ — Pydantic request/response schemas
  - tests/ — pytest test suites (unit + integration)
  - alembic/ — database migration scripts
  - docs/ — architecture decisions and API specs
- Architecture: Layered (API -> Service -> Model) with dependency injection via FastAPI Depends()

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
- Keep changes scoped to the requested task.
- Follow the layered architecture: API handlers should not contain business logic. Put logic in services/.
- Use SQLAlchemy 2.0 style (Mapped, mapped_column), not legacy Query API.
- Use Pydantic v2 model_config instead of Config class.
- When adding a new API endpoint, add corresponding test in tests/.
- Use dependency injection for database sessions (get_db) and auth (get_current_user).
- All datetime values must be timezone-aware (use datetime with UTC).

## Safety Boundaries
- Do not touch .env or .env.production files.
- Do not modify alembic/versions/ migration files that have already been applied.
- Ask before changing any model in app/models/ — schema changes need migration.
- Never run alembic upgrade head against production database without explicit request.
- Never commit directly to main.
- Do not modify files in docs/architecture/ without a corresponding ADR discussion.

## References
- Architecture decisions: docs/architecture/
- API specification: docs/api-spec.md
- Database design: docs/database-design.md
- Deployment runbook: docs/deployment.md
```

这个模板约 45 行，结构清晰，信息密度高。一个 Python/FastAPI 项目可以直接复制并根据实际情况修改。模型读完这 45 行后，对这个项目的语言、框架、目录结构、构建方式、编码约定和安全边界都有了清晰的认知。

## AGENTS.md vs CLAUDE.md

很多开发者同时使用 Codex 和 Claude Code，自然会有一个疑问：AGENTS.md 和 CLAUDE.md 是什么关系？能不能只维护一份？

先看核心差异：

| 维度 | AGENTS.md | CLAUDE.md |
|------|-----------|-----------|
| 标准归属 | Linux 基金会 Agentic AI Foundation 开放标准 | Anthropic Claude Code 特定格式 |
| 消费工具 | Codex、Cursor、Copilot、Windsurf、Gemini CLI 等多工具 | Claude Code |
| 格式约束 | 四要素结构，建议约 100 行 | 自由格式，无固定结构要求 |
| 加载机制 | 分层加载（全局 -> 仓库 -> 子目录），支持 override | 优先加载 ~/.claude/CLAUDE.md，然后项目根目录 CLAUDE.md |
| 语言建议 | 官方建议用英文标记（标题和规则用英文） | 中英文皆可，格式更灵活 |
| 跨工具可移植性 | 高，多工具统一读取 | 低，仅 Claude Code 使用 |
| 典型长度 | 50-100 行 | 不限，常见 50-200 行 |

格式差异是表面现象，更根本的差异在于**加载机制**。

AGENTS.md 的加载遵循严格的分层机制：

1. **全局级** `~/.agents.md` — 适用于所有项目的个人偏好
2. **仓库根目录** `./AGENTS.md` — 适用于当前项目的团队规则
3. **子目录级** `./src/api/AGENTS.md` — 适用于特定模块的局部规则

每一层可以 override 上一层的规则。这个分层机制让团队能够在根目录统一基础规则，同时在特定模块目录下补充局部约定。

CLAUDE.md 的加载也支持分层（全局 -> 项目级），但不支持子目录级的 override。CLAUDE.md 更像一个持续增长的"个人偏好 + 项目知识"的混合体，而 AGENTS.md 更像一个严格控制的"项目常识索引"。

实际操作建议：

- **如果你只用 Claude Code**：维护 CLAUDE.md 就够了。它的格式更灵活，可以用中文写，可以放更长的上下文。
- **如果你只用 Codex 或其他工具**：维护 AGENTS.md。
- **如果你同时用多个工具**：把核心的、跨工具通用的规则放在 AGENTS.md 里（Project Context、Commands、Safety Boundaries），把 Claude 特定的偏好（比如 Claude Code 的 skill 触发、特定的 prompt 模板）放在 CLAUDE.md 里。两份文件可以有重叠，但 AGENTS.md 应该是"最小公共集"，CLAUDE.md 是"Claude 特定扩展"。

一个值得注意的趋势是：越来越多的团队选择以 AGENTS.md 为主，因为它具有跨工具可移植性。即使当前只用 Claude Code，维护一份结构化的 AGENTS.md 也不会有额外成本，而且在未来切换或增加工具时可以直接复用。

## /init 命令：从自动生成到手动定制

Codex 提供了 `/init` 命令，可以自动生成一个基础版 AGENTS.md。这是最推荐的起步方式。

运行 `/init` 后，Codex 会扫描项目结构，读取 package.json（或 pyproject.toml、Cargo.toml 等项目配置文件），分析目录布局，然后生成一份包含基础信息的 AGENTS.md。这个自动生成的版本通常包含：

- 从项目配置中提取的语言和框架信息
- 从 scripts 字段中提取的构建命令
- 基于目录结构推断的重要路径
- 一个通用的 Working Rules 和 Safety Boundaries 框架

但这只是起点，不是终点。自动生成的 AGENTS.md 存在几个固有的局限：

第一，它无法理解项目的隐性约定。比如团队约定"所有 API handler 必须经过 auth middleware"，这不会出现在任何配置文件中，只有通过代码审查或口头约定传递。模型从代码结构中可能推断出部分约定，但推断可能不完整或不准确。

第二，它的安全边界是通用的。自动生成的版本可能只有 "不要 commit 到 main" 这种通用规则，缺少项目特定的保护，比如"不要碰支付模块"或"数据库迁移需要两人确认"。

第三，它的 Working Rules 基于通用最佳实践，不了解团队的特殊偏好。比如团队可能约定"使用 named exports 而不是 default exports"，这个偏好不会出现在任何自动化工具能读取的配置中。

所以正确的流程是：

1. 运行 `/init`，生成基础版本
2. 审查自动生成的内容，修正不准确的部分
3. 根据团队约定，补充 Working Rules
4. 根据项目风险分析，完善 Safety Boundaries
5. 在真实任务中验证，迭代修正

这个流程不应该是一次性的。AGENTS.md 应该和代码一起维护。当项目引入新的工具链、新的架构模式、新的安全要求时，AGENTS.md 应该同步更新。一个过时的 AGENTS.md 比没有 AGENTS.md 更危险，因为模型会基于错误的信息做决策。

## 八个常见错误

以下是社区实践（包括腾讯云开发者社区的整理）中反复出现的八个错误。每个错误都对应一个明确的设计原则。

### 错误一：把规则放在 prompt 里而不是 AGENTS.md 里

很多开发者习惯在每次对话的开头加上一大段项目说明："这个项目用 TypeScript，跑测试用 pnpm test，不要碰 .env 文件......"这些信息应该放在 AGENTS.md 中常驻，而不是每次手动输入。

把规则放在 prompt 里有两个问题：一是每次都要重复，浪费 tokens 和时间；二是一旦忘记加某条规则，模型就不知道这条规则的存在。AGENTS.md 的设计目的就是解决这个问题——常驻在项目上下文中，每次会话自动加载，不需要人工重复。

判断标准很简单：如果一条规则在超过 50% 的任务中都需要，它就应该在 AGENTS.md 里。只有在特定任务中才需要的临时指令，才应该放在 prompt 里。

### 错误二：不让 Codex 知道构建命令

这是一个看起来不应该犯但实际高频出现的错误。具体表现是 AGENTS.md 中的 Commands 部分为空、缺失或者写的是描述而不是实际命令。

后果很直接：模型在修改代码后不知道怎么验证。它可能猜测构建命令（猜错了就浪费时间），也可能跳过验证步骤（导致引入问题而不自知）。最坏的情况下，模型可能运行一个过时的或不存在的命令，产生误导性的错误信息。

修复方法：按照前面"Commands"一节的要求，写出完整的、可直接执行的命令列表。并且定期验证这些命令是否仍然有效（项目依赖升级后命令可能变化）。

### 错误三：写成百科全书而不是内容目录

这是本篇文章反复强调的核心原则的反面。具体表现是 AGENTS.md 长达 300-500 行，包含完整的架构设计文档、API 规范、数据库 schema、编码风格指南、团队协作流程、甚至是故障排查手册。

问题不是这些内容没有价值，而是它们不应该全部放在 AGENTS.md 里。AGENTS.md 应该像一个精心编排的目录，告诉模型"你需要了解 X 时去看 docs/X.md"，而不是自己把 X 的完整内容展开。

一个实用的检验方法：如果删除 AGENTS.md 中的某段文字后，模型在接下来 10 个典型任务中的表现没有明显下降，这段文字就不应该在这里。把它移到引用文档中，在 AGENTS.md 中只保留一个指向链接。

### 错误四：不和代码一起维护

AGENTS.md 不是一次性写完就忘的文件。它应该和代码一起演进。当项目从 Webpack 迁移到 Vite 时，AGENTS.md 中的构建命令需要同步更新。当团队引入新的 linter 规则时，Working Rules 需要补充。当新的敏感模块被添加时，Safety Boundaries 需要扩展。

一个常见的维护失败模式是：AGENTS.md 还在说"用 Jest 跑测试"，但项目半年前就已经切换到 Vitest。模型会尝试运行 `jest`，得到一个 "command not found" 的错误，然后可能自己猜测替代方案，增加出错概率。

建议把 AGENTS.md 的更新纳入代码审查的检查清单。当 PR 修改了构建工具、测试框架、目录结构或编码约定时，审查者应该同步检查 AGENTS.md 是否需要更新。

### 错误五：复制长文档内容而不是链接

和"百科全书"错误相关但不同。这个错误的具体表现是：当某个模块有专门的文档时（比如 `docs/api-design.md`），开发者在 AGENTS.md 中把该文档的核心内容复制过来，而不是简单地放一个链接。

这会导致两个问题：一是重复内容增加 AGENTS.md 的 token 成本；二是当原文档更新时，AGENTS.md 中的副本不会自动同步，造成信息不一致。

正确做法：在 AGENTS.md 中只放链接和一句简短描述。比如：

```markdown
## References
- API design principles: docs/api-design.md
- Authentication flow: docs/auth-flow.md
```

模型需要时可以读取这些文档。不需要时，这些链接几乎不占上下文空间。

### 错误六：不针对子目录放局部规则

AGENTS.md 支持子目录级别的分层覆盖。很多团队只维护根目录的 AGENTS.md，忽略了这个能力。

举一个具体场景：项目的 `src/api/` 目录有自己的编码约定（比如 API handler 的输入验证模式、错误处理格式、响应 schema 规范），这些约定在根目录的 AGENTS.md 中不适用，也不应该放在那里。正确做法是在 `src/api/AGENTS.md` 中放置这些局部规则。

```markdown
<!-- src/api/AGENTS.md -->
## Working Rules
- Every endpoint must validate input with the corresponding Pydantic schema.
- Use HTTPException with structured error codes defined in src/api/errors.py.
- All responses must use the standard envelope format defined in src/api/response.py.
- Rate-limited endpoints must use the @rate_limit decorator from src/api/decorators.py.
```

当模型在 `src/api/` 目录下工作时，它会同时加载根目录和当前目录的 AGENTS.md，局部规则会与全局规则合并（冲突时局部覆盖全局）。

### 错误七：不用 /init 先生成基线

有些开发者跳过 `/init` 步骤，从零开始手写 AGENTS.md。这不是不可以，但会错过自动分析带来的效率。

`/init` 能自动提取的信息（语言、框架、入口文件、构建命令、目录结构）是 AGENTS.md 中最容易写的部分，也是最不应该出错的部分。让工具自动生成这些内容，然后把精力集中在只有人类才能提供的部分：团队约定、安全边界、架构模式。

从零手写还有一个风险：可能遗漏关键信息。比如项目的 `package.json` 中有一个不常用的 script `test:integration`，手写时可能忘记加到 Commands 中，但 `/init` 会自动提取。

### 错误八：不在真实任务中验证

写完 AGENTS.md 后，最大的错误是假设它有效。验证是必不可少的步骤。

验证方法会在下一节详细展开，但核心思路是：让模型执行一组覆盖不同类型的真实任务，观察它的行为是否符合 AGENTS.md 中的规则。如果模型在任务中反复犯同一种错误，大概率是 AGENTS.md 中的对应规则不够清晰或存在歧义。

一个常见的验证盲区是：只验证"模型是否遵守了规则"，不验证"模型是否理解了项目结构"。后者同样重要。如果模型每次修改代码都在错误的目录中搜索文件，说明 Project Context 中的目录描述需要优化。

## 验证方法：让模型复述和执行

AGENTS.md 写完后，怎么确认它确实有效？靠感觉是不够的。以下是三种经过实践验证的方法。

### 方法一：复述测试

给模型一个简单的指令："用自己的话描述这个项目的结构、构建流程、编码规范和安全约束。"然后对比模型的回答和 AGENTS.md 的内容。

关注的不是模型能否逐字复述（它不应该逐字复述，那说明只是复制粘贴），而是它是否准确理解了核心要点。具体检查：

- **项目结构**：模型是否正确识别了主要目录的用途？是否遗漏了重要目录？
- **构建流程**：模型是否知道正确的构建命令？是否知道测试怎么跑？
- **编码规范**：模型是否理解了 Working Rules 中的关键约束？能否举例说明某条规则的含义？
- **安全边界**：模型是否清楚地知道哪些操作是被禁止的？哪些需要确认？

如果模型在某个方面的回答模糊或不准确，说明 AGENTS.md 中对应的部分需要加强。加强的方式不是加长，而是更精确。比如，如果模型不确定"用 Zod 做验证"是指所有输入还是特定类型的输入，就把规则改写得更具体："所有 API endpoint 的 request body 必须用 Zod schema 验证。"

### 方法二：渐进式任务测试

设计一组从简单到复杂的任务，逐步验证 AGENTS.md 的各个要素：

| 任务类型 | 验证的要素 | 示例任务 |
|---------|-----------|---------|
| 代码理解 | Project Context | "找到处理用户认证的核心文件，解释其工作流程" |
| 代码修改 + 验证 | Commands + Working Rules | "给 User model 添加 email 字段，跑测试确保通过" |
| 跨模块修改 | Project Context + Working Rules | "在 API 层和 Service 层同时添加日志记录" |
| 高风险操作 | Safety Boundaries | "修改数据库 schema 并创建迁移文件" |
| 新功能开发 | 全要素 | "添加一个新的 API endpoint 用于导出用户数据" |

每个任务完成后，检查以下维度：

- 模型是否在正确的位置查找和修改代码？
- 模型是否使用了正确的构建和测试命令？
- 模型是否遵守了编码规范？
- 模型是否尊重了安全边界（没有触碰不该碰的文件）？
- 模型是否遵循了项目的架构模式？

### 方法三：迭代修正循环

基于前两种方法的发现，进入迭代修正循环：

1. 执行一个任务
2. 记录模型的行为偏差
3. 分析偏差原因：是 AGENTS.md 中的规则不够清晰？还是缺少某条规则？
4. 修改 AGENTS.md 中的对应部分
5. 重新执行同类任务，验证修正效果
6. 如果偏差仍然存在，尝试换一种表述方式

这个循环可能需要 3-5 轮才能收敛。常见的修正模式：

- **模糊规则具体化**："Follow existing patterns" -> "Use Zod for input validation, following the pattern in src/api/users.py"
- **缺失规则补充**：发现模型在某个模块总是犯同一种错误，说明该模块需要局部规则
- **歧义表述消除**："Use UTC timezone" -> "All datetime objects must be timezone-aware using datetime.timezone.utc. Do not use naive datetime objects."
- **错误命令修正**：发现模型运行了不存在的命令，检查 Commands 部分是否有过时内容

一个有效的验证实践是：建立一组"回归测试任务"。每次修改 AGENTS.md 后，跑一遍这些任务，确保修改没有引入新的问题。这组任务不需要多，10-15 个覆盖核心场景就够。

## 从个人实践到团队标准化

当一个人用 AGENTS.md 用得好了，下一步是把它变成团队共享的资产。这涉及几个层面的考量。

### 版本控制

AGENTS.md 应该提交到代码仓库中，和代码一起版本控制。这意味着：

- 根目录的 AGENTS.md 是团队共识，反映的是团队级别的约定和规范
- 个人偏好（比如"我喜欢函数之间空两行"）不应该放在仓库级的 AGENTS.md 中，而应该放在全局级 `~/.agents.md` 中
- AGENTS.md 的修改应该经过代码审查，和代码修改一样对待

### 团队共建

AGENTS.md 不应该由一个人写完就定稿。它应该是团队讨论的结果。推荐流程：

1. 一个人用 `/init` 生成初始版本
2. 在团队会议上讨论 Working Rules 和 Safety Boundaries
3. 让每个团队成员审查并补充他们负责模块的局部规则
4. 确定一个维护负责人，负责合并和审查 AGENTS.md 的变更

### 与代码审查集成

把 AGENTS.md 的审查纳入 PR 流程：

- 当 PR 修改了构建工具或依赖时，检查 Commands 是否需要更新
- 当 PR 添加了新的模块或目录时，检查 Project Context 是否需要补充
- 当 PR 引入了新的编码约定时，检查 Working Rules 是否需要同步
- 当 PR 涉及安全相关的修改时，检查 Safety Boundaries 是否需要调整

### 度量效果

团队可以追踪以下指标来评估 AGENTS.md 的效果：

| 指标 | 采集方式 | 说明 |
|------|---------|------|
| 任务完成率变化 | 对比引入 AGENTS.md 前后的完成率 | 如果没有明显改善，说明规则可能无效 |
| 人工返工次数 | 记录每次任务后的人工修改次数 | 返工集中在某类规则上说明该规则需要改进 |
| 规则违反次数 | 记录模型违反 Working Rules 的频率 | 高频违反的规则要么需要加强表述，要么本身不合理 |
| 安全事件次数 | 记录模型触碰 Safety Boundaries 的次数 | 零次不一定好（可能规则太松），高频说明规则无效 |

## AGENTS.md 的边界

最后需要明确 AGENTS.md 不能做什么，避免对它寄予不切实际的期望。

**AGENTS.md 不能替代代码审查。** 它能减少低级错误（比如用错包管理器、触碰敏感文件），但不能保证生成的代码逻辑正确。模型的推理质量取决于模型本身的能力，AGENTS.md 只能在现有能力范围内优化行为。

**AGENTS.md 不能替代测试。** 它可以告诉模型"修改后跑测试"，但如果测试覆盖不足，模型仍然可能引入未被测试覆盖的 bug。测试覆盖率和 AGENTS.md 是两个独立的工程维度。

**AGENTS.md 不能替代文档。** 它是"内容目录"，指向深层文档，但不能替代深层文档本身。如果项目没有良好的文档基础，AGENTS.md 能提供的信息也有限。

**AGENTS.md 不能解决根本性的模型能力不足。** 如果模型在某个任务上反复失败，原因可能是模型本身对这个领域的理解不够，而不是你没有写好 AGENTS.md。这种情况下，需要考虑换模型、拆解任务、或者用 Skill 封装更详细的操作流程。

理解这些边界有助于把 AGENTS.md 放在正确的位置：它是项目知识管理的起点，不是终点。它解决的是"模型不知道项目常识"这个特定问题，而不是所有与 coding agent 相关的问题。用好 AGENTS.md，然后在这个基础上，逐步引入 Skills（封装可复用流程）、config.toml（控制模型行为）和 MCP（连接外部系统），构建完整的 coding agent 工程化体系。

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
