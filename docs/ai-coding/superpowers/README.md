# Superpowers 原理与工程实战系列

> 18 篇文章，从 skill 系统原理到 subagent-driven development，再到跨平台落地与避坑。
> 不是营销教程，而是基于 [obra/superpowers](https://github.com/obra/superpowers) 仓库的工程化解构。

本系列面向已经在用 Claude Code / Cursor / Codex 等 AI 编码工具，但想让 AI 真正"按工程化的方式干活"的开发者。Superpowers 不是一个工具集合，而是一套被 Anthropic 官方 plugin marketplace 收录的开发方法论插件包——它把 brainstorm → plan → 实施 → review → 收尾的完整软件工程流程，强制嵌入了 AI agent 的工作方式里。

## 系列结构

- **入门（1 篇）**：建立全景认知
- **原理篇（3 篇）**：Skills 系统、description 字段、四件套边界
- **核心工作流（9 篇）**：brainstorming / writing-plans / worktrees / SDD / TDD / debugging / verification / finishing
- **扩展与定制（3 篇）**：模型成本 / 并行 subagent / 写自家 skill
- **落地篇（2 篇）**：跨平台 + 边界避坑

## 系列目录

### 入门

| # | 标题 | 核心议题 |
|---|------|----------|
| 01 | [Superpowers 入门：给 AI 装上一套开发方法论](./01-overview.md) | 整体导览，一个完整任务跑下来长什么样 |

### 原理篇

| # | 标题 | 核心议题 |
|---|------|----------|
| 02 | [Skills 系统是什么](./02-skills-system.md) | skill 的物理形态、加载与触发、与 slash command 的差别 |
| 03 | [description 字段与 CSO](./03-description-cso.md) | description 反直觉写法、obra 实验数据、关键词覆盖 |
| 04 | [hooks / CLAUDE.md / skill / slash command 的边界](./04-hooks-md-skill-command-boundary.md) | 四件套各自能干什么、组合使用模式 |

### 核心工作流

| # | 标题 | 核心议题 |
|---|------|----------|
| 05 | [brainstorming：把模糊需求拆成 spec](./05-brainstorming.md) | 苏格拉底式追问、分段确认、spec 文档结构 |
| 06 | [writing-plans：2-5 分钟一颗任务](./06-writing-plans.md) | 颗粒度原则、任务要素、真实计划逐行解读 |
| 07 | [git worktrees：隔离工作区](./07-git-worktrees.md) | 为什么强制 worktree、与 branch 的差别、并行基础 |
| 08 | [Subagent-Driven Development 整体流程](./08-subagent-driven-development.md) | 控制器 vs 三角色、上下文隔离、四种状态处理 |
| 09 | [三种 subagent prompt 详解](./09-subagent-prompts.md) | implementer / spec-reviewer / code-quality-reviewer 逐段拆解 |
| 10 | [TDD 是怎么被严格执行的](./10-tdd-enforcement.md) | RED-GREEN-REFACTOR、Iron Law、testing-anti-patterns |
| 11 | [systematic-debugging 根因分析四阶段](./11-systematic-debugging.md) | root-cause-tracing / defense-in-depth / condition-based-waiting |
| 12 | [verification-before-completion 与 code review](./12-verification-and-code-review.md) | 完成独立成段、双段 review、Critical issue 阻断 |
| 13 | [finishing-a-development-branch：合并、PR、清理](./13-finishing-branch.md) | 四选项决策树、worktree 清理、团队 Git 衔接 |

### 扩展与定制

| # | 标题 | 核心议题 |
|---|------|----------|
| 14 | [模型选择与成本控制](./14-model-selection-cost.md) | 各角色模型档位、任务复杂度信号、token 实测 |
| 15 | [dispatching-parallel-agents：并行 subagent](./15-dispatching-parallel-agents.md) | 何时能并行、避免冲突、与 SDD 组合 |
| 16 | [用 TDD 写一个自己的 skill](./16-writing-skills.md) | writing-skills 元技巧、pressure scenario、堵 rationalization |

### 落地篇

| # | 标题 | 核心议题 |
|---|------|----------|
| 17 | [跨平台：在 Cursor / Codex / Copilot / Gemini 上跑起来](./17-cross-platform.md) | 8 平台安装差异、工具名映射、功能失效点 |
| 18 | [边界、避坑与最佳实践](./18-boundaries-pitfalls.md) | 不擅长场景、token 代价、常见踩坑、何时只用一两个 skill |

## 阅读路径

- **完全新手**：01 → 02 → 05 → 06 → 08 → 18
- **想直接用**：01 → 05 → 06 → 08 → 17
- **想造自家 skill**：01 → 02 → 03 → 10 → 16
- **想跨平台落地**：01 → 02 → 04 → 17 → 18

## 来源

- 仓库：[obra/superpowers](https://github.com/obra/superpowers)
- 作者：Jesse Vincent（[blog.fsck.com](https://blog.fsck.com) / [Prime Radiant](https://primeradiant.com)）
- 原始发布文章：[Superpowers: A methodology plugin for coding agents](https://blog.fsck.com/2025/10/09/superpowers/)
