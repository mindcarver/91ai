# OpenSpec 核心概念全解：Specs、Changes、Deltas 与 Archive

> 更新日期：2026/06

## 一句话总结

OpenSpec 是一个面向 AI 编码助手（Claude Code、Cursor、GitHub Copilot 等）的规范驱动开发（Spec-Driven Development, SDD）框架。它的核心思路是：在 AI 写代码之前，先用结构化的 Markdown 文档把"做什么"和"怎么做"写清楚。项目状态分成两块——`specs/` 记录系统当前行为（真相源），`changes/` 记录拟议的变更（每个变更一个文件夹）。变更用 Delta Spec 描述差异（ADDED/MODIFIED/REMOVED），完成后归档时自动合并到主 spec。四大哲学原则（流动不僵化、迭代不瀑布、简单不复杂、棕地优先）贯穿整个设计。

## 为什么这很重要

用 AI 写代码的人都有一个共同的痛点：你说"加个暗色模式"，AI 不光改了 CSS 变量，还加了个切换按钮，顺手把布局重构了一遍。更糟糕的是，下一次对话上下文全没了，AI 从头猜你的意图。

这个问题的根源不是 AI 能力不够，而是需求和实现之间没有书面契约。聊天记录不是契约——它会被清空、会超出上下文窗口、会被不同工具的会话隔离。

OpenSpec 解决的正是这个问题：在 AI 开始写代码之前，先产出一份规范文档，人和 AI 都围绕这份文档工作。文档存在文件系统里，跟着 Git 走，不依赖任何特定工具的上下文窗口。

这不是在讨论"写文档重不重要"的哲学问题。这是具体的工程问题：没有持久化的规范，AI 助手每次新对话都在重新猜你的系统长什么样。有了 `openspec/specs/` 目录，AI 读文件就知道。

## 四大哲学原则

OpenSpec 的 README 里写了四句话，看起来简单，但每一条都是针对传统规范系统的痛点设计的。

### 流动不僵化（Fluid Not Rigid）

传统规范系统有严格的阶段门控（phase gate）：先写计划，再实现，最后收工。一旦进入实现阶段，就不能回头改计划了。

OpenSpec 没有这种限制。你可以随时修改任何一个 artifact。`proposal.md` 写了一半发现方向不对？直接改。实现到一半发现 `design.md` 的方案行不通？更新 design 然后继续。没有任何门控机制会阻止你回头。

这反映在命令设计上：`/opsx:propose` 生成所有 artifact，但你随时可以手动编辑任何文件。`/opsx:continue` 是逐个生成 artifact，每生成一个你都可以审核修改后再继续。工具把权力交给你，而不是把你锁在流程里。

### 迭代不瀑布（Iterative Not Waterfall）

瀑布模型假设需求是稳定的——写完就不变了。现实是需求经常变。你以为最好的方案，看到代码之后可能发现行不通。

OpenSpec 拥抱这种变化。它的 Delta Spec 机制让你描述"什么变了"而不是"全部重写一遍"。Spec 文件随着每次 archive 逐步增长，形成系统的行为文档。每次变更只增量更新，不需要推翻重来。

这一点在命令层面也有体现：`/opsx:explore` 让你在提交变更之前先和 AI 讨论思路；`/opsx:continue` 让你一个 artifact 一个 artifact 地推进，随时调整方向。

### 简单不复杂（Easy Not Complex）

有些规范框架需要大量配置、固定格式、重量级流程。OpenSpec 的态度是：`npm install -g @fission-ai/openspec@latest`，然后 `openspec init`，30 秒内开始工作。不需要 API Key，不需要额外服务，不需要学习新的格式（除了 Markdown）。

默认的 `spec-driven` schema 包含四个 artifact（proposal、specs、design、tasks），够大多数场景用。如果不需要某些 artifact，直接跳过就行。如果你有特殊需求，可以通过自定义 schema 扩展，但扩展不是强制的。

`config.yaml` 的设计也遵循这个原则：大部分项目只需要设置 schema 名称和一段 context 描述。per-artifact 的 rules 是可选的。

### 棕地优先（Brownfield-First）

大多数软件工作不是从零开始建新系统，而是修改已有的系统。OpenSpec 的 Delta Spec 机制就是为棕地项目设计的——它让你描述"当前行为的变更"，而不是"完整的新系统行为"。

`/opsx:onboard` 命令更是直接针对棕地场景：它让 AI 扫描已有代码库，自动生成初始 spec。你不需要手写一份完整的系统规范，从第一个变更开始就行。

与之对比，GitHub 的 Spec Kit 更偏向全量文档重写，Kiro 则锁定在特定的 IDE 和模型上。OpenSpec 的棕地优先意味着你可以在任何已有项目上立刻开始使用。

## 项目目录结构详解

`openspec init` 之后，你的项目根目录下会出现一个 `openspec/` 目录：

```
your-project/
├── openspec/
│   ├── specs/              # 真相源：系统当前行为的规范
│   │   ├── auth/
│   │   │   └── spec.md     # 认证模块的行为规范
│   │   ├── payments/
│   │   │   └── spec.md     # 支付模块的行为规范
│   │   └── ui/
│   │       └── spec.md     # UI 模块的行为规范
│   ├── changes/            # 变更区：进行中的修改
│   │   ├── add-dark-mode/  # 一个进行中的变更
│   │   │   ├── proposal.md
│   │   │   ├── design.md
│   │   │   ├── tasks.md
│   │   │   └── specs/      # Delta specs
│   │   │       └── ui/
│   │   │           └── spec.md
│   │   └── archive/        # 已完成的变更归档
│   │       ├── 2026-01-20-add-dark-mode/
│   │       └── 2026-01-22-fix-login-redirect/
│   ├── config.yaml         # 项目配置
│   └── schemas/            # 自定义 schema（可选）
│       └── my-workflow/
│           ├── schema.yaml
│           └── templates/
├── src/
└── ...
```

### specs/：真相源

`specs/` 目录是系统的行为真相源（Source of Truth）。它描述系统**当前**的行为——不是你想要的行为，不是计划中的行为，而是系统**现在**表现出来的行为。

按领域（domain）组织 spec 文件是推荐做法。常见的组织方式：

- 按功能区域：`auth/`、`payments/`、`search/`
- 按组件：`api/`、`frontend/`、`workers/`
- 按限界上下文：`ordering/`、`fulfillment/`、`inventory/`

选择哪种组织方式取决于你的项目。关键是让每个 spec 聚焦一个领域，不要把整个系统塞进一个文件里。

### changes/：变更区

`changes/` 目录存放所有进行中的变更。每个变更是一个独立的文件夹，包含该变更的所有 artifact 和 delta spec。

变更区的设计解决了两个问题：

1. **并行工作**。你可以同时有多个进行中的变更（`add-dark-mode/` 和 `fix-login-bug/`），互不干扰。每个变更只描述自己关心的行为变化。
2. **审查友好**。审查一个变更只需要打开对应的文件夹，看 proposal、design、delta spec，不需要翻遍整个 specs 目录。

### config.yaml：项目配置

`config.yaml` 是项目级别的配置文件，控制 OpenSpec 在这个项目中的行为。

```yaml
# openspec/config.yaml
schema: spec-driven        # 默认使用的 schema

context: |                 # 项目上下文，AI 生成 artifact 时会读取
  Tech stack: TypeScript, React, Node.js, PostgreSQL
  API style: RESTful
  Testing: Jest + React Testing Library

rules:                     # 针对特定 artifact 的规则
  proposal:
    - Include rollback plan
    - Identify affected teams
  specs:
    - Use Given/When/Then format
    - Reference existing patterns before inventing new ones
```

Schema 的解析顺序（优先级从高到低）：

1. CLI 参数：`--schema <name>`
2. 变更元数据：`.openspec.yaml` 中的设置
3. 项目配置：`config.yaml` 中的设置
4. 默认值：`spec-driven`

`context` 字段会注入到所有 artifact 的生成过程中。`rules` 只注入到匹配的 artifact 类型。这意味着你可以在 `context` 里写通用信息（技术栈、约定），在 `rules` 里写特定要求（proposal 必须包含回滚计划）。

## Spec 文件格式详解

一个 spec 文件描述一个领域的行为规范。格式由三个层次组成：Purpose（领域描述）、Requirements（需求）、Scenarios（场景）。

```markdown
# Auth Specification

## Purpose
Authentication and session management for the application.

## Requirements

### Requirement: User Authentication
The system SHALL issue a JWT token upon successful login.

#### Scenario: Valid credentials
- GIVEN a user with valid credentials
- WHEN the user submits login form
- THEN a JWT token is returned
- AND the user is redirected to dashboard

#### Scenario: Invalid credentials
- GIVEN invalid credentials
- WHEN the user submits login form
- THEN an error message is displayed
- AND no token is issued

### Requirement: Session Expiration
The system MUST expire sessions after 30 minutes of inactivity.

#### Scenario: Idle timeout
- GIVEN an authenticated session
- WHEN 30 minutes pass without activity
- THEN the session is invalidated
- AND the user must re-authenticate
```

### Purpose 部分

`## Purpose` 是一段简短的领域描述，告诉读者（人或者 AI）这个 spec 覆盖什么范围。好的 Purpose 应该在一两句话内说清楚，比如"认证和会话管理"或"支付流程，包括创建订单、处理支付、退款"。

### Requirements 部分

`### Requirement: <名称>` 是具体的行为需求。每个需求声明系统**应该做什么**，但不涉及怎么做。

关键原则：需求描述的是外部可观察的行为。如果改变了内部实现（比如从 Redux 换成 Context API）但外部行为不变，那就不需要改 spec。反过来，如果改了外部行为（比如 session 超时从 30 分钟变成 15 分钟），就必须更新 spec。

### RFC 2119 关键词

OpenSpec 使用 RFC 2119 定义的四个关键词来表达需求强度：

| 关键词 | 含义 | 使用场景 |
|--------|------|----------|
| **MUST** / **SHALL** | 绝对要求，没有例外 | 安全相关、数据完整性 |
| **SHOULD** | 推荐，但可以有合理例外 | 性能优化、用户体验改进 |
| **MAY** | 可选 | 附加功能、便利性特性 |

这些关键词不是装饰。它们直接影响 AI 生成代码时的行为。`MUST` 意味着必须实现，AI 不会跳过。`SHOULD` 意味着如果有技术障碍可以跳过。`MAY` 意味着可以不做。

### Scenarios（场景）

`#### Scenario: <名称>` 用 GIVEN/WHEN/THEN 格式描述需求的具体场景。每个场景应该可以直接翻译成测试用例。

好的场景标准：
- 可测试：你能写一个自动化测试来验证它
- 覆盖正常路径和边界情况
- 足够具体，不模糊

上面的"Valid credentials"和"Invalid credentials"就是一对好例子：一个覆盖正常路径，一个覆盖异常路径。

### Spec 不是什么

Spec 是行为契约，不是实现计划。以下内容**不应该**出现在 spec 中：

- 内部的类名/函数名
- 具体用什么库或框架
- 逐步的实现步骤
- 详细的执行计划

这些内容应该放在 `design.md` 或 `tasks.md` 中。判断标准：如果改变了实现方式但外部行为不变，那它就不属于 spec。

### 轻量级 vs 完整 Spec

OpenSpec 支持两个层次的规范严格度：

**轻量级（默认）**：简短的行为描述、清晰的范围和非目标、几个具体的验收检查。适用于大多数变更。

**完整级**：跨团队或跨仓库的变更、API/契约变更、迁移、安全/隐私相关变更。适用于高变更成本的场景。

大部分变更应该使用轻量级。完整级只在变更成本高、模糊性会导致昂贵返工时使用。

## Delta Spec 三种标记详解

Delta Spec 是 OpenSpec 最核心的概念。它不是重写整个 spec，而是描述"什么变了"——类似于 Git diff，但作用于行为规范而不是代码。

Delta Spec 有三种标记：`ADDED`、`MODIFIED`、`REMOVED`。

### ADDED：新增行为

`## ADDED Requirements` 标记系统新增的行为。归档时，这些需求会被追加到对应的主 spec 文件中。

完整示例：

```markdown
# Delta for Auth

## ADDED Requirements

### Requirement: Two-Factor Authentication
The system MUST support TOTP-based two-factor authentication.

#### Scenario: 2FA enrollment
- GIVEN a user without 2FA enabled
- WHEN the user enables 2FA in settings
- THEN a QR code is displayed for authenticator app setup
- AND the user must verify with a code before activation

#### Scenario: 2FA login
- GIVEN a user with 2FA enabled
- WHEN the user submits valid credentials
- THEN an OTP challenge is presented
- AND login completes only after valid OTP

#### Scenario: 2FA bypass for recovery
- GIVEN a user with 2FA enabled who has lost their device
- WHEN the user requests a recovery code
- THEN a one-time recovery code is sent to the registered email
- AND the user can reset 2FA settings after verifying the code
```

ADDED 用的场景：给系统加新功能、新增 API 端点、新增用户交互流程。

### MODIFIED：修改已有行为

`## MODIFIED Requirements` 标记已有行为的变更。归档时，这些需求会替换主 spec 中同名的 Requirement。

完整示例：

```markdown
# Delta for Auth

## MODIFIED Requirements

### Requirement: Session Expiration
The system MUST expire sessions after 15 minutes of inactivity.
(Previously: 30 minutes)

#### Scenario: Idle timeout
- GIVEN an authenticated session
- WHEN 15 minutes pass without activity
- THEN the session is invalidated
- AND the user must re-authenticate

#### Scenario: Activity resets timer
- GIVEN an authenticated session with 10 minutes of idle time
- WHEN the user performs any action
- THEN the idle timer resets to 0
- AND the session remains valid for another 15 minutes
```

注意括号里的 `(Previously: 30 minutes)`。这是一个好习惯——标注变更前的值，让审查者一眼看到改了什么。

MODIFIED 用的场景：改变超时时间、修改错误处理策略、调整业务规则。

### REMOVED：移除行为

`## REMOVED Requirements` 标记被废弃的行为。归档时，这些需求会从主 spec 中删除。

完整示例：

```markdown
# Delta for Auth

## REMOVED Requirements

### Requirement: Remember Me
(Deprecated in favor of 2FA. Users should re-authenticate each session
for security reasons. The "Remember Me" checkbox will be removed from
the login form.)

### Requirement: Session Extension on Activity
(Replaced by the updated Session Expiration requirement which includes
automatic timer reset.)
```

REMOVED 部分建议写清楚为什么移除。这不仅是给 AI 看的，更是给未来的团队成员看的——"为什么这个功能没了"。

REMOVED 用的场景：废弃旧功能、用新方案替代旧方案、删除不再需要的 API。

### 为什么 Delta 比全量重写好

三个原因：

**1. 清晰度**。Delta 展示的是变化本身。读一个完整的 spec，你得在脑子里和当前版本做 diff。读 Delta，变化一目了然。

**2. 冲突避免**。两个并行的变更可以各自修改同一个 spec 文件的不同 Requirement，不会冲突。如果用全量重写，后合并的那个必须处理前一个引入的所有变化。

**3. 棕地适配**。大多数软件工作是修改已有系统。Delta 让修改成为一等公民，而不是事后才考虑的事。

举个例子：你同时在做一个"加 2FA"的变更和一个"改 session 超时"的变更。两个变更都涉及 `auth/spec.md`，但"加 2FA"是 ADDED 一个新 Requirement，"改 session 超时"是 MODIFIED 另一个 Requirement。两者互不冲突，可以并行开发，先后归档。

## Change 的四个 Artifact 详解

每个 Change 文件夹包含最多四个 artifact。它们之间有依赖关系，形成一个有向无环图（DAG）。

```
proposal ──────► specs ──────► design ──────► tasks ──────► implement
    │               │             │              │
   why            what           how          steps
 + scope        changes       approach      to take
```

对应的依赖关系图：

```
                    proposal
                   (root node)
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
      specs                       design
   (requires:                  (requires:
    proposal)                   proposal)
         │                           │
         └─────────────┬─────────────┘
                       │
                       ▼
                    tasks
                (requires:
                specs, design)
```

依赖关系是使能（enabler）关系，不是门控（gate）关系。它们告诉你"创建 X 之前需要先有 Y"，但不强制你必须按顺序创建。你可以跳过 design，也可以先做 specs 再做 design。

### proposal.md：为什么做这个变更

Proposal 回答三个问题：为什么做（Intent）、范围是什么（Scope）、大致怎么做（Approach）。

```markdown
# Proposal: Add Dark Mode

## Intent
Users have requested a dark mode option to reduce eye strain
during nighttime usage and match system preferences.

## Scope
In scope:
- Theme toggle in settings
- System preference detection
- Persist preference in localStorage

Out of scope:
- Custom color themes (future work)
- Per-page theme overrides

## Approach
Use CSS custom properties for theming with a React context
for state management. Detect system preference on first load,
allow manual override.
```

`## Scope` 部分特别重要。它明确列出了"in scope"和"out of scope"。写清楚"不做什么"能有效防止 AI "顺手"多做一堆你没要求的东西。实践中，很多 AI 编码助手的问题不是做得太少，而是做得太多。明确的 scope 边界是约束 AI 行为的关键手段。

什么时候更新 proposal：范围变了（扩大或缩小）、意图更清晰了、方案发生了根本性改变。

### specs/：Delta Specs

Delta specs 描述系统行为的变化。每个变更的 `specs/` 目录结构与主 `openspec/specs/` 对应——如果主 spec 有 `auth/spec.md`，变更的 delta spec 也放在 `specs/auth/spec.md`，内容用 ADDED/MODIFIED/REMOVED 标记。

这部分在上面"Delta Spec 三种标记详解"中已经详细介绍。

### design.md：技术方案

Design 回答"怎么做"。它包含技术方案和架构决策，但不包含具体的实现步骤。

````markdown
# Design: Add Dark Mode

## Technical Approach
Theme state managed via React Context to avoid prop drilling.
CSS custom properties enable runtime switching without class toggling.

## Architecture Decisions

### Decision: Context over Redux
Using React Context for theme state because:
- Simple binary state (light/dark)
- No complex state transitions
- Avoids adding Redux dependency

### Decision: CSS Custom Properties
Using CSS variables instead of CSS-in-JS because:
- Works with existing stylesheet
- No runtime overhead
- Browser-native solution

## Data Flow
```
ThemeProvider (context)
       │
       ▼
ThemeToggle ◄──► localStorage
       │
       ▼
CSS Variables (applied to :root)
```

## File Changes
- `src/contexts/ThemeContext.tsx` (new)
- `src/components/ThemeToggle.tsx` (new)
- `src/styles/globals.css` (modified)
````

Design 阶段的价值经常被低估。实践中有不少情况，写 design 的时候发现"这个方案行不通"，然后换了一个方案。这比写完代码再发现方案有问题要省钱得多。

什么时候更新 design：实现过程中发现方案行不通、发现了更好的方案、依赖或约束条件变了。

### tasks.md：实现检查清单

Tasks 是具体的实现步骤，带 checkbox 的检查清单。

```markdown
# Tasks

## 1. Theme Infrastructure
- [ ] 1.1 Create ThemeContext with light/dark state
- [ ] 1.2 Add CSS custom properties for colors
- [ ] 1.3 Implement localStorage persistence
- [ ] 1.4 Add system preference detection

## 2. UI Components
- [ ] 2.1 Create ThemeToggle component
- [ ] 2.2 Add toggle to settings page
- [ ] 2.3 Update Header to include quick toggle

## 3. Styling
- [ ] 3.1 Define dark theme color palette
- [ ] 3.2 Update components to use CSS variables
- [ ] 3.3 Test contrast ratios for accessibility
```

`/opsx:apply` 命令会按这个清单逐条执行，完成一条就打勾 `[x]`。如果中断了，下次可以从上次的位置继续。

Tasks 的最佳实践：
- 相关任务分组放在同一个标题下
- 使用层级编号（1.1, 1.2, 1.3）
- 每个任务小到可以在一次会话内完成
- 完成后打勾

### Artifact 之间的依赖关系

用表格总结四个 artifact 的关系：

| Artifact | 回答的问题 | 依赖 | 产出物 |
|----------|-----------|------|--------|
| proposal.md | 为什么做？范围？ | 无（根节点） | 动机、范围、方案概述 |
| specs/ | 行为变化是什么？ | proposal | Delta Spec（ADDED/MODIFIED/REMOVED） |
| design.md | 技术上怎么做？ | proposal | 架构决策、数据流、文件变更列表 |
| tasks.md | 具体步骤？ | specs + design | 带 checkbox 的实现清单 |

注意 specs 和 design 都只依赖 proposal，互相不依赖。这意味着它们理论上可以并行创建。tasks 同时依赖 specs 和 design，所以放在最后。

## Archive 机制详解

Archive 是 OpenSpec 工作流的终点站。它做两件事：合并 delta spec 到主 spec，然后把变更文件夹移到归档目录。

### 归档前后的目录变化

归档前：

```
openspec/
├── specs/
│   └── auth/
│       └── spec.md              ← 主 spec（不包含 2FA）
└── changes/
    └── add-2fa/
        ├── proposal.md
        ├── design.md
        ├── tasks.md
        └── specs/
            └── auth/
                └── spec.md      ← Delta spec（包含 2FA 的变更）
```

归档后：

```
openspec/
├── specs/
│   └── auth/
│       └── spec.md              ← 主 spec（已合并 2FA 需求）
└── changes/
    └── archive/
        └── 2026-01-24-add-2fa/  ← 归档目录（完整保留）
            ├── proposal.md
            ├── design.md
            ├── tasks.md
            └── specs/
                └── auth/
                    └── spec.md
```

### 合并过程详解

合并按以下规则处理 Delta Spec 的三个部分：

1. **ADDED Requirements**：追加到对应主 spec 的 `## Requirements` 部分末尾。如果主 spec 中已有同名 Requirement，则跳过（不覆盖）。

2. **MODIFIED Requirements**：在主 spec 中找到同名 Requirement，整个替换。包括该 Requirement 下的所有 Scenario。

3. **REMOVED Requirements**：从主 spec 中删除同名 Requirement 及其所有 Scenario。

合并逻辑不是简单的文本拼接。OpenSpec 解析 Markdown 结构，按 Requirement 名称匹配，然后进行结构化的增删改操作。这保证了合并的准确性。

### 归档目录结构

归档目录以日期前缀命名，便于按时间排序和查找：

```
openspec/changes/archive/
├── 2026-01-20-add-dark-mode/
├── 2026-01-22-fix-login-redirect/
├── 2026-02-05-implement-2fa/
└── 2026-03-15-optimize-db-queries/
```

每个归档目录完整保留了该变更的所有 artifact。你可以随时回头看任何一次变更的完整上下文：为什么做（proposal）、怎么做的（design）、做了什么（tasks）、行为变化（delta spec）。

### 审计链

Archive 形成了一条隐式的审计链。主 spec 文件的每一个 Requirement 都有来源——要么是初始 spec，要么是某次归档的 ADDED。你可以通过以下方式追踪：

1. 在主 spec 中找到一个 Requirement
2. 到 `archive/` 目录搜索包含同名 Requirement 的 delta spec
3. 阅读该变更的 `proposal.md` 了解动机
4. 阅读 `design.md` 了解技术方案
5. 阅读 `tasks.md` 了解具体执行

这不是 OpenSpec 的显式功能（没有"追溯"命令），但归档结构天然支持这种追踪。

### 批量归档

当有多个已完成的变更需要归档时，用 `/opsx:bulk-archive`。它会：

1. 列出所有已完成的变更
2. 检测变更之间的 spec 冲突（两个变更修改了同一个 spec 文件）
3. 按创建时间顺序归档
4. 处理冲突时检查实际代码实现来决定最终结果

```text
You: /opsx:bulk-archive

AI:  Found 3 completed changes:
     - add-dark-mode (8/8 tasks complete)
     - fix-login-redirect (3/3 tasks complete)
     - update-footer (2/2 tasks complete)

     Checking for spec conflicts...
     ⚠ add-dark-mode and update-footer both touch specs/ui/

     Inspecting codebase to resolve...
     Both changes are implemented. Will merge in chronological order:
     1. add-dark-mode (created Jan 20)
     2. update-footer (created Jan 22)

     Archive all 3 changes?
```

## Schema 机制详解

Schema 定义了一个工作流中包含哪些 artifact 以及它们之间的依赖关系。可以把它理解为"工作流蓝图"。

### 内置 Schema

OpenSpec 默认提供 `spec-driven` schema，定义了标准的四 artifact 流程：

```yaml
# 内置 spec-driven schema
name: spec-driven
artifacts:
  - id: proposal
    generates: proposal.md
    requires: []

  - id: specs
    generates: specs/**/*.md
    requires: [proposal]

  - id: design
    generates: design.md
    requires: [proposal]

  - id: tasks
    generates: tasks.md
    requires: [specs, design]
```

`generates` 字段支持 glob 模式（如 `specs/**/*.md`），表示这个 artifact 会生成多个文件。

`requires` 字段定义了依赖关系。空数组 `[]` 表示没有依赖，可以作为第一个创建的 artifact。

### Artifact 依赖图定义

依赖图是一个 DAG（有向无环图）。`/opsx:continue` 命令利用这个图来决定"下一个可以创建的 artifact"：

- 所有 `requires` 已满足的 artifact 标记为"ready"
- 还有未满足依赖的标记为"blocked"
- 每次只创建一个 ready 的 artifact

在 spec-driven schema 中，创建 proposal 之后，specs 和 design 同时变为 ready（都只依赖 proposal）。创建了 specs 之后，如果 design 也已完成，tasks 就变为 ready。

### 自定义 Schema

当内置 schema 不满足需求时，可以创建自定义 schema：

```bash
# 从零创建
openspec schema init research-first

# 基于内置 schema 派生
openspec schema fork spec-driven my-workflow
```

创建后会在 `openspec/schemas/` 目录下生成 schema 定义和模板：

```
openspec/schemas/my-workflow/
├── schema.yaml           # 工作流定义
└── templates/
    ├── proposal.md       # Proposal 模板
    ├── spec.md           # Spec 模板
    ├── design.md         # Design 模板
    └── tasks.md          # Tasks 模板
```

一个更精简的自定义 schema 示例——只做研究和任务，跳过 spec 和 design：

```yaml
# openspec/schemas/rapid/schema.yaml
name: rapid
version: 1
description: 快速迭代工作流，最小开销

artifacts:
  - id: proposal
    generates: proposal.md
    description: 简短提案
    template: proposal.md
    instruction: |
      创建一份简短的变更提案。
      聚焦于"做什么"和"为什么"，跳过详细 spec。
    requires: []

  - id: tasks
    generates: tasks.md
    description: 实现检查清单
    template: tasks.md
    requires: [proposal]

apply:
  requires: [tasks]
  tracks: tasks.md
```

使用自定义 schema：

```bash
# 命令行指定
openspec new change feature --schema rapid

# 或者在 config.yaml 中设置默认
schema: rapid
```

验证自定义 schema：

```bash
openspec schema validate my-workflow
```

这个命令检查 YAML 语法是否正确、所有引用的模板文件是否存在、依赖关系是否有环、artifact ID 是否合法。

### Schema 解析顺序

当 OpenSpec 需要确定使用哪个 schema 时，按以下顺序查找：

1. CLI 参数：`--schema <name>`
2. 变更元数据：`.openspec.yaml` 中的设置
3. 项目配置：`openspec/config.yaml` 中的设置
4. 用户目录：`~/.local/share/openspec/schemas/`（跨项目共享）
5. 内置默认：`spec-driven`

查看当前解析结果：

```bash
openspec schema which my-workflow
openspec schema which --all
```

输出会显示 schema 的来源（project/user/package）和路径。

### 社区 Schema

OpenSpec 支持社区维护的 schema，通过独立仓库分发。比如 `superpowers-bridge` schema 集成了 OpenSpec 的 artifact 治理和 obra/superpowers 的执行技能（头脑风暴、TDD、代码审查等）。社区 schema 不打包在 OpenSpec 核心包里，需要手动安装到项目的 `openspec/schemas/` 目录。

## 与传统文档方式的对比

### Delta Spec vs 全量重写

| 维度 | 全量重写 | Delta Spec |
|------|---------|------------|
| 变更可见性 | 需要对比新旧版本 | 直接看到变化 |
| 并行开发 | 两个变更改同一文件必须串行 | 改不同 Requirement 可以并行 |
| 棕地适配 | 每次都要写完整的系统描述 | 只写变化的部分 |
| 审查效率 | 审查者需要理解整个 spec | 只关注变化部分 |
| 维护成本 | spec 越长，每次重写越痛苦 | 增量更新，成本恒定 |

### OpenSpec vs 其他规范工具

| 维度 | OpenSpec | Spec Kit (GitHub) | Kiro (AWS) |
|------|---------|-------------------|------------|
| 哲学 | 轻量、流动 | 完整但重量级 | 强大但 IDE 锁定 |
| 阶段控制 | 无门控 | 严格阶段门控 | 锁定特定模型 |
| 棕地支持 | 原生支持（delta spec、onboard） | 需要全量重写 | 有限 |
| 工具锁定 | 29+ 工具 | GitHub 生态 | Kiro IDE |
| 格式 | Markdown + Git | Markdown + Python | 内置格式 |
| 安装门槛 | npm install -g | 需要 Python 环境 | 需要 Kiro IDE |

### OpenSpec vs "无规范"模式

| 维度 | 无规范（直接让 AI 写代码） | OpenSpec |
|------|--------------------------|---------|
| 跨会话持久性 | 聊天记录清空后丢失 | spec 文件存在文件系统里 |
| AI 行为可预测性 | 低（AI 靠猜） | 高（AI 按规范执行） |
| 范围控制 | 不可控（AI 可能多做） | 明确（scope + tasks） |
| 审查方式 | 只能审查代码 | 可以审查行为规范 |
| 额外成本 | 无 | 多一步 propose 流程 |

额外成本是多了一步 propose。对于改一行 CSS、修一个 typo 这种场景，直接做就好，不需要走 propose 流程。但对于任何涉及多个文件、多个功能的变更，propose 的成本远低于返工的成本。

## 权衡与局限

### 适用场景

- 中大型功能开发（涉及多个文件和模块）
- 团队协作（需要审查彼此的工作）
- 长期项目（需要跨会话保持上下文）
- 棕地项目（在已有代码基础上做变更）
- 多 AI 工具协作（在不同工具间保持一致的规范）

### 不适用场景

- 单行修改（改个 typo、调个颜色值）
- 紧急 hotfix（没时间走 propose 流程）
- 实验性代码（还在探索阶段，连需求都不确定）
- 非常小的项目（一个人维护的脚本）

### 已知局限

1. **依赖 AI 质量**。spec 和 artifact 的质量取决于 AI 模型的能力。低质量模型可能生成模糊或错误的 spec。OpenSpec 官方推荐使用高推理能力的模型。

2. **Markdown 结构解析**。合并 delta spec 依赖 Markdown 标题层级解析。如果你的 spec 文件格式不规范（比如 h3 和 h4 混用、标题里加特殊字符），合并可能出现意外。

3. **没有显式冲突检测**。两个并行变更修改同一个 Requirement 时，归档的合并顺序决定最终结果。后归档的变更会覆盖先归档的变更对同一 Requirement 的修改。`/opsx:bulk-archive` 会检测这种情况，但手动逐个归档时需要注意。

4. **学习曲线**。虽然是"简单不复杂"，但对于从未接触过规范驱动开发的团队，仍然需要理解 spec/delta/archive 这些概念。`/opsx:onboard` 命令可以帮助新用户上手。

5. **Artifact 一致性**。如果你在实现过程中手动修改了 `tasks.md`（加了一个新任务），但没有更新 `specs/` 或 `design.md`，artifact 之间可能出现不一致。`/opsx:verify` 可以检测这种不一致，但它不是强制执行的。

## 源码解析：核心引擎如何工作

理解 OpenSpec 的内部机制，能帮你避免合并失败、写出更规范的 Delta Spec。以下基于 GitHub 仓库的源码分析。

### Delta Spec 解析器（src/core/parsers/requirement-blocks.ts）

这是 OpenSpec 最底层的解析模块。它负责把 Delta Spec 的 Markdown 文本解析成结构化数据。

**Requirement Block 的结构**：

```typescript
export interface RequirementBlock {
  headerLine: string;  // 例如 '### Requirement: Something'
  name: string;        // 例如 'Something'
  raw: string;         // 完整的块内容，包括 headerLine 和后续内容
}
```

解析过程分三步：

1. **分割顶级 section**：`splitTopLevelSections()` 按 `## ` 标题分割 Markdown，提取出 "ADDED Requirements"、"MODIFIED Requirements"、"REMOVED Requirements"、"RENAMED Requirements" 四个 section 的内容。搜索是大小写不敏感的（`getSectionCaseInsensitive`），所以 "Added Requirements" 和 "ADDED REQUIREMENTS" 都能识别。

2. **解析每个 section 中的 Requirement Block**：`parseRequirementBlocksFromSection()` 在 section 内容中寻找 `### Requirement:` 开头的行，然后把从该行到下一个 `### Requirement:` 或 `## ` 之间的所有内容收集为一个 RequirementBlock。

3. **处理 REMOVED 和 RENAMED 的特殊格式**：
   - REMOVED 支持两种格式：标准的 `### Requirement:` 标题，或者 `- \`### Requirement: Name\`` 的 bullet list 格式
   - RENAMED 使用 `FROM:` 和 `TO:` 键值对来指定重命名方向

**名称归一化**：`normalizeRequirementName()` 只做了 `trim()`——去掉前后空格。这意味着 `### Requirement: Session Timeout` 和 `### Requirement:  Session Timeout ` 会被匹配，但 `### Requirement: Session Expiration` 不会和 `### Requirement: Session Timeout` 匹配。标题的文本必须精确对应。

### Spec 合并引擎（src/core/specs-apply.ts）

合并引擎在 archive 和 sync 时被调用。它从 Delta Spec 的结构化数据出发，对主 spec 进行增删改操作。

**核心流程**（`buildUpdatedSpec()` 函数）：

```
1. 解析 Delta Spec → DeltaPlan { added, modified, removed, renamed }
2. 预验证（重复检查、跨 section 冲突检查）
3. 加载主 spec → 用 extractRequirementsSection() 提取 Requirements 部分
4. 按顺序执行操作：RENAMED → REMOVED → MODIFIED → ADDED
5. 保持原有 requirement 的出现顺序，新增的追加到末尾
6. 重新组装 Markdown 文件
```

**操作顺序为什么是 RENAMED → REMOVED → MODIFIED → ADDED**：

先改名，确保后续操作引用新名称。然后删除，减少需要处理的数据量。接着修改，在已有的位置上替换内容。最后新增，追加到末尾。这个顺序保证了每一步操作基于前一步完成后的状态。

**关键验证规则**：

从源码中可以看到合并引擎的严格检查：

| 规则 | 错误信息 |
|------|---------|
| 同一 section 内不能有重复的 requirement | `duplicate requirement in ADDED for header "..."` |
| 同一 requirement 不能同时出现在 ADDED 和 MODIFIED | `requirement present in both MODIFIED and ADDED` |
| 同一 requirement 不能同时出现在 MODIFIED 和 REMOVED | `requirement present in both MODIFIED and REMOVED` |
| 同一 requirement 不能同时出现在 ADDED 和 REMOVED | `requirement present in both ADDED and REMOVED` |
| MODIFIED 必须引用 RENAMED 后的新名称 | `MODIFIED must reference the NEW header` |
| RENAMED TO 不能和 ADDED 冲突 | `RENAMED TO header collides with ADDED` |
| 新 spec 不允许 MODIFIED 和 RENAMED | `only ADDED requirements are allowed for new specs` |
| MODIFIED 的 requirement 必须在主 spec 中存在 | `MODIFIED failed for header "..." - not found` |
| ADDED 的 requirement 不能在主 spec 中已存在 | `ADDED failed for header "..." - already exists` |

**理解这些规则的实用价值**：当你遇到 archive 失败时，知道哪条规则被违反了就能快速修复。比如最常见的错误是 MODIFIED 一个不存在于主 spec 中的 requirement——通常是因为 Delta Spec 中的标题拼写和主 spec 不一致。

### 验证器（src/core/validation/validator.ts）

`openspec validate` 命令的背后是 `Validator` 类。它有两层验证：

**结构验证**（Zod Schema）：检查 spec 文件是否有 `## Purpose` 和 `## Requirements` section，检查 change 文件是否有 `## Why` 和 `## What Changes` section。

**规则验证**（applySpecRules / applyChangeRules）：更细致的检查：

| 规则 | 级别 | 说明 |
|------|------|------|
| Purpose 太短（< MIN_PURPOSE_LENGTH） | WARNING | 领域描述不够详细 |
| Requirement 文本太长 | INFO | 可能包含实现细节 |
| Requirement 没有 Scenario | WARNING | 缺少验收标准 |
| ADDED/MODIFIED 的 Requirement 没有 SHALL 或 MUST | ERROR | 缺少 RFC 2119 关键词 |
| ADDED/MODIFIED 的 Requirement 没有至少一个 Scenario | ERROR | 场景是必须的 |
| REMOVED 的 Requirement 名称重复 | ERROR | 同一 section 内不能重复 |

**关于 SHALL/MUST 检查**：源码中 `containsShallOrMust()` 使用正则 `/\b(SHALL|MUST)\b/` 检查。这意味着 "The system SHALL..." 和 "The system MUST..." 都能通过，但 "should" 或 "may" 不会。对于 ADDED 和 MODIFIED 的 requirement，SHALL 或 MUST 是强制性的——这是 spec 作为行为契约的核心保障。

**验证的 strictMode**：默认情况下（strictMode = false），只有 ERROR 级别的问题会导致验证失败，WARNING 和 INFO 不阻塞。启用 strictMode 后，WARNING 也会导致失败。`openspec validate` 默认不使用 strictMode。

### Profile 系统（src/core/profiles.ts）

Profile 控制哪些工作流命令可用。源码非常简洁：

```typescript
// Core profile（默认）
export const CORE_WORKFLOWS = ['propose', 'explore', 'apply', 'sync', 'archive'];

// 全部可用命令
export const ALL_WORKFLOWS = [
  'propose', 'explore', 'new', 'continue', 'apply', 'ff',
  'sync', 'archive', 'bulk-archive', 'verify', 'onboard',
];
```

Core profile 5 个命令覆盖了最常见的开发流程。扩展命令（new、continue、ff、verify、bulk-archive、onboard）在 custom profile 中解锁。

`getProfileWorkflows()` 函数决定哪些命令被生成。当你运行 `openspec init` 或 `openspec update` 时，只有 profile 包含的工作流会生成对应的 skill 文件和命令文件。

**这意味着切换 profile 不影响已有的 spec 和 change**——它只影响 AI 工具中可用的 slash command。你的所有数据都是安全的。

## Spec 写作实战指南

理论讲完了。下面是一些从实践中总结的 spec 写作技巧。

### 如何写好 Requirement

**好**：

```markdown
### Requirement: Password Reset
The system SHALL send a password reset link to the user's registered email
when requested. The link MUST expire after 1 hour and be usable only once.

#### Scenario: Successful password reset
- GIVEN a user with a registered email "user@example.com"
- WHEN the user clicks "Forgot Password" and enters their email
- THEN a reset link is sent to "user@example.com"
- AND the link expires after 1 hour
- AND the link cannot be used more than once
```

**坏**：

```markdown
### Requirement: Password Reset
Users should be able to reset their password if they forget it.
```

区别在于：好的 requirement 用了 SHALL/MUST 声明约束、有具体的业务规则（1小时过期、一次性）、有可验证的 scenario。坏的 requirement 只是模糊地描述了意图，AI 无法从中推导出精确的实现。

### 如何写好 Scenario

Scenario 应该像测试用例一样精确。每个 scenario 至少包含 GIVEN（前置条件）、WHEN（触发动作）、THEN（期望结果）。

**覆盖正常路径和异常路径**：

```markdown
#### Scenario: Successful login (正常路径)
- GIVEN a registered user with email "test@example.com" and password "ValidPass123"
- WHEN the user submits the login form with these credentials
- THEN the user is redirected to the dashboard
- AND a session token is issued

#### Scenario: Wrong password (异常路径)
- GIVEN a registered user with email "test@example.com"
- WHEN the user submits the login form with password "WrongPass"
- THEN an error message "Invalid credentials" is displayed
- AND no session token is issued

#### Scenario: Account locked (边界情况)
- GIVEN a user who has failed login 5 times in the last 15 minutes
- WHEN the user submits the login form with any credentials
- THEN an error message "Account temporarily locked" is displayed
- AND the account is locked for 30 minutes
```

三个 scenario 覆盖了正常路径、异常路径和边界情况。verify 命令会检查每个 scenario 是否有对应的实现和测试。

### 如何写好 Proposal 的 Scope

Scope 是约束 AI 行为的关键。明确列出"不做什么"比列出"做什么"更重要：

```markdown
## Scope
In scope:
- Theme toggle in settings page header
- System preference detection (prefers-color-scheme)
- Persist preference in localStorage

Out of scope:
- Custom color themes (future work, tracked in #123)
- Per-page theme overrides
- Theme scheduling (light during day, dark at night)
- SSR theme flash prevention (will handle in separate change)
```

"Out of scope" 列得越清楚，AI 越不容易"顺手多做"。没有明确 out of scope 的 proposal，AI 可能会自作主张加入 SSR flash prevention、主题编辑器等你没有要求的功能。

### 第四种 Delta 操作：RENAMED

大多数人只知道 ADDED、MODIFIED、REMOVED。但源码中还有第四种：**RENAMED**。它用于需求范围扩大或缩小需要重命名时。

格式：

```markdown
## RENAMED Requirements

### Requirement: Multi-Channel Authentication
- FROM: `### Requirement: Email Authentication`
- TO: `### Requirement: Multi-Channel Authentication`
```

合并时的处理逻辑：在主 spec 的 nameToBlock 映射中，删除旧的 key（Email Authentication），添加新的 key（Multi-Channel Authentication）。后续的 MODIFIED 操作必须引用新名称（Multi-Channel Authentication），不能引用旧名称。

这个操作的存在原因：当你发现一个 requirement 的范围扩大了，比如原来只支持邮箱登录，现在要支持手机号和邮箱登录。如果直接 ADDED 一个新的"手机号登录"，MODIFIED "邮箱登录"来加手机号字段，会导致两个独立的 requirement 描述同一个登录流程。用 RENAMED 把"邮箱登录"改成"多渠道登录"，然后在 MODIFIED 中扩展内容，语义更清晰。

### Spec 格式的渐进式严格度

OpenSpec 不要求所有 spec 都用相同级别的严格度。从 validator.ts 源码可以看到，验证分为三级：

**ERROR（阻塞 archive）**：结构错误、缺少必要元素、逻辑矛盾。例如 ADDED 的 requirement 没有 SHALL/MUST、同一个 requirement 出现在 ADDED 和 REMOVED 中、Delta Spec 没有任何操作。

**WARNING（不阻塞 archive）**：可能的质量问题。例如 Purpose 太短（不到 10 个字符）、Requirement 没有 Scenario、Delta 描述太简短。这些是建议修复但不强制的问题。

**INFO（信息性提示）**：代码风格建议。例如 Requirement 文本超过最大长度限制，可能包含了实现细节而非行为描述。

大多数场景用 WARNING 级别的严格度就够了。只有在关键系统（金融、医疗、安全）中才需要考虑 strictMode，把 WARNING 也视为 ERROR。

### Spec 与测试的关系

OpenSpec 的 Scenario（GIVEN/WHEN/THEN）看起来很像 BDD（Behavior-Driven Development）的测试用例，但 OpenSpec 不自动生成测试。这是有意为之的设计决策。

Spec 是**行为合约**（contract），不是**测试计划**（test plan）。合约告诉你"结果应该是什么"，但不规定"怎么验证"。你可以根据 Scenario 写自动化测试，但写不写、用什么框架、怎么组织测试代码——是你的事。

`/opsx:verify` 会检查 Scenario 是否有测试覆盖（如果没有会发 WARNING），但它不执行测试。这种设计让 OpenSpec 保持轻量——不需要绑定特定的测试框架或 CI 流程。

### Spec 的演化模式

一个 spec 文件随时间的演化遵循固定模式：

```
1. 初始创建：第一个 change 的 ADDED requirements 创建 spec 骨架
2. 逐步增长：后续 change 通过 ADDED 追加新的 requirements
3. 行为修正：MODIFIED 调整已有 requirements 的参数或规则
4. 废弃清理：REMOVED 删除过时的 requirements
5. 范围调整：RENAMED 重新定义需求的边界
```

每次 archive 都是一次演化。主 spec 文件记录的是系统的"当前状态"——不是历史，不是计划，而是"现在系统实际表现出来的行为"。这正是 Source of Truth 的含义。

### 如何处理大型 spec

当一个领域的 spec 文件变得很长（超过 300 行），有几种策略：

**拆分子领域**：把 `auth/spec.md` 拆成 `auth-login/spec.md` 和 `auth-session/spec.md`。OpenSpec 按目录组织 spec，不限制目录层级。

**使用 Purpose 控制范围**：在 `## Purpose` 中明确这个 spec 的边界。"认证和会话管理"比"所有和用户相关的东西"更好。

**定期清理**：用 REMOVED 删除已废弃的 requirements。过时的 spec 比没有 spec 更危险。

### Artifact 依赖图在运行时的行为

当你使用 `/opsx:continue` 命令时，OpenSpec 的 `ArtifactGraph` 类会计算当前可以创建的 artifact：

```typescript
getNextArtifacts(completed: CompletedSet): string[] {
  const ready: string[] = [];
  for (const artifact of this.artifacts.values()) {
    if (completed.has(artifact.id)) continue;  // 已完成
    const allDepsCompleted = artifact.requires.every(req => completed.has(req));
    if (allDepsCompleted) ready.push(artifact.id);
  }
  return ready.sort();  // 排序保证确定性
}
```

在 `spec-driven` schema 中，创建 proposal 后，`specs` 和 `design` 同时变为 ready（都只依赖 proposal）。你可以选择先创建哪个。如果你先创建了 `specs`，`design` 仍然是 ready 的（它不依赖 specs），但 `tasks` 还是被阻塞的（它依赖 specs 和 design）。只有当 specs 和 design 都完成后，tasks 才会解锁。

`getBlocked()` 方法返回被阻塞的 artifact 及其未满足的依赖：

Architecture Decisions 部分不要只写"用了什么技术"，要写"为什么选这个而不选那个"：

```markdown
### Decision: React Context over Zustand
Using React Context for theme state because:
- Only two states (light/dark), no complex state transitions
- No need for devtools or middleware
- Zero additional dependency
- Theme state is global but simple

Rejected alternatives:
- Zustand: Overkill for binary state, adds 3KB bundle
- CSS-only with media query: Can't persist user preference
- URL parameter: Loses state on navigation
```

这种写法的好处是：三个月后你回头看 design.md，能立刻理解当时为什么做这个选择。如果需要推翻这个决策，也有清晰的论据可以反驳。

## 常见问题与排错

### Archive 失败："MODIFIED failed for header ... - not found"

这是最常见的错误。原因：Delta Spec 中的 requirement 标题和主 spec 中的标题不一致。

排查方法：

1. 打开主 spec 文件（`openspec/specs/<domain>/spec.md`）
2. 找到你要修改的 requirement，复制其 `### Requirement:` 后面的完整标题
3. 确保 Delta Spec 的 `### Requirement:` 后面的标题完全一致（包括空格）

### Validate 失败："No delta sections found"

Delta Spec 文件中没有 `## ADDED Requirements` 等 section 标题。

排查方法：

1. 确认 Delta Spec 文件中有 `## ADDED Requirements`、`## MODIFIED Requirements`、`## REMOVED Requirements` 或 `## RENAMED Requirements` 标题
2. 确认标题使用的是 `## `（两个井号），不是 `### ` 或 `# `
3. 标题文字必须精确匹配（"ADDED Requirements" 而非 "Added" 或 "NEW"）

### Validate 失败："ADDED must contain SHALL or MUST"

Delta Spec 中 ADDED 的 requirement 文本缺少 RFC 2119 关键词。

这是强制性要求。从 validator.ts 源码可以看到，`containsShallOrMust()` 使用正则 `/\b(SHALL|MUST)\b/` 检查。修改 Delta Spec，在 requirement 文本中加入 "SHALL" 或 "MUST"：

```markdown
### Requirement: Search
The system SHALL provide full-text search across all published articles.
```

### Spec 结构问题："Spec must have a Purpose section"

主 spec 文件缺少 `## Purpose` 或 `## Requirements` section。这是因为文件被手动编辑破坏了结构。

排查方法：

1. 确认 spec 文件包含 `## Purpose` section（至少一个字符）
2. 确认 spec 文件包含 `## Requirements` section
3. 运行 `openspec validate <spec-name>` 查看具体错误

## 延伸阅读

- [OpenSpec 官方仓库](https://github.com/Fission-AI/OpenSpec) — 源码、issue、贡献指南
- [OpenSpec Concepts 文档](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md) — 核心概念官方详解
- [OpenSpec Commands 文档](https://github.com/Fission-AI/OpenSpec/blob/main/docs/commands.md) — 完整命令参考
- [OpenSpec Customization 文档](https://github.com/Fission-AI/OpenSpec/blob/main/docs/customization.md) — 自定义 schema 和配置
- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) — MUST/SHALL/SHOULD/MAY 关键词的正式定义
- [OpenSpec Workflows 文档](https://github.com/Fission-AI/OpenSpec/blob/main/docs/workflows.md) — 工作流模式和实践
