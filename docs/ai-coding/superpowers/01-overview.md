# Superpowers 入门：给 AI 装上一套开发方法论

> 更新日期：2026/06

**TL;DR：** Superpowers 是一套完整的 AI 编程方法论，通过可组合的技能（skills）系统强制执行"先理解、再设计、后实现"的工作流。它不让 AI 一上来就写代码，而是先通过 brainstorming 把模糊需求拆成 spec，再用 writing-plans 把 spec 拆成 2-5 分钟的小任务，最后用 subagent-driven-development 派子代理逐个执行。不是建议，是强制工作流。

## 一个完整任务跑下来长什么样

假设你让 AI "给项目加个用户登录功能"。没有 Superpowers 的 AI 可能直接开始写代码，中途发现一堆问题没问清楚。Superpowers 的流程会是这样：

**阶段 1：brainstorming（把模糊需求拆成 spec）**

AI 不会开始写代码，而是先问你：

- 用什么登录方式？邮箱密码、OAuth、还是手机号？
- 是否需要"记住我"功能？
- 密码重置流程怎么做？
- 登录失败次数要不要限制？
- session 还是 JWT？
- 前端表单需要哪些字段？

不是一股脑全问，而是一个一个问，每个问题等你的答案。问完之后，AI 会给你看设计文档，分块展示（架构、组件、数据流、错误处理），每块等你确认后再继续。最后把完整 spec 写到 `docs/superpowers/specs/2026-06-02-login-design.md` 并提交到 git。

**阶段 2：using-git-worktrees（创建隔离工作区）**

AI 会先问："需要我创建一个隔离的 worktree 吗？这会保护你当前的分支。"

你同意后，AI 创建一个 git worktree，在 `.worktrees/feature-login/` 目录下。然后运行项目设置（npm install 或 cargo build 之类），跑一遍测试确保环境干净。这些完成后才开始写计划。

**阶段 3：writing-plans（2-5 分钟一颗任务）**

AI 根据刚才的 spec 写一个实施计划，拆成小任务。比如：

```markdown
### Task 1: Create User model

**Files:**
- Create: `src/models/user.py`
- Test: `tests/models/test_user.py`

- [ ] Write failing test for User.create()
- [ ] Run test, verify it fails
- [ ] Implement minimal User.create()
- [ ] Run test, verify it passes
- [ ] Commit

### Task 2: Password hashing

**Files:**
- Modify: `src/models/user.py:45-60`
- Test: `tests/models/test_user.py`

- [ ] Write failing test for password hashing
- [ ] Run test, verify it fails
- [ ] Implement bcrypt hashing
- [ ] Run test, verify it passes
- [ ] Commit
```

每个任务都有：精确文件路径、完整代码、运行命令、预期输出。没有 "TBD"、"TODO"、"实现细节后续补充"。计划写到 `docs/superpowers/plans/2026-06-02-login-plan.md`。

**阶段 4：subagent-driven-development（派子代理逐个执行）**

AI 开始执行计划。但不是自己直接写代码，而是派一个**全新的子代理**来执行 Task 1：

- 子代理读 Task 1 的完整指令（包括代码）
- 子代理有疑问时回来问 AI（比如"User 模型需要 email 验证字段吗？"）
- AI 回答后，子代理完成任务、写测试、提交
- AI 派**另一个子代理**审查 Task 1 的产出是否符合 spec
- 审查通过后，AI 再派**第三个子代理**审查代码质量
- 两个审查都通过，Task 1 标记完成

然后进入 Task 2，重复这套流程。每个任务都是"实现者 → spec 审查者 → 质量审查者"三重把关。

AI 会连续执行所有任务，不会每做完一个就来问你"继续吗？"。只有遇到无法解决的 blocker 或真正的歧义才会停下来。整个过程可能跑几个小时，不需要你干预。

**阶段 5：test-driven-development（强制 TDD）**

每个子代理在实施时都遵循 RED-GREEN-REFACTOR：

1. 先写失败的测试
2. 跑测试确认失败
3. 写最少的代码让测试通过
4. 跑测试确认通过
5. 如果代码是在测试之前写的，删除并重写

这确保每个功能都有测试覆盖，而且测试在先、实现在后。

**阶段 6：finishing-a-development-branch（完成分支）**

所有任务完成后，AI 会：

- 跑完整测试套件
- 检查是否有遗留的问题
- 给你选项：merge 到主分支、开 PR、保持分支、还是丢弃
- 清理 worktree（如果需要）

从头到尾，你只在 brainstorming 阶段参与设计讨论，之后就在旁边看着 AI 自动完成整个功能。

## Superpowers 的核心设计

Superpowers 不是"一堆有用技能的集合"，而是一套**强制工作流系统**。

### 技能（skills）是什么

每个技能是一个独立的 YAML + Markdown 文件，定义了特定场景下的工作流。比如 `brainstorming` 技能的文件头部（frontmatter）是这样：

```yaml
---
name: brainstorming
description: "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
---
```

当 AI 检测到你要"创建新功能"或"添加行为"时，会**自动**加载这个技能并执行。不是建议，是强制。

### 技能是怎么触发的

Superpowers 的核心机制是：**AI 在任何任务之前，必须先检查是否有相关技能。如果有，必须用。**

检查逻辑是：

1. 扫描所有技能的 `description` 字段
2. 判断当前任务是否匹配任何一个描述
3. 如果匹配，加载该技能的完整内容
4. 严格按技能定义的步骤执行

比如你发消息说"我想加个搜索功能"，AI 会：

- 看到你的消息，判断这是"creating features"
- 匹配到 `brainstorming` 的 description（包含 "creating features"）
- **必须**调用 `brainstorming` 技能
- 按技能定义的流程开始问你问题

这不是 AI 的选择，是系统规则。`using-superpowers` 技能里明确写了：

> **IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.**
>
> This is not negotiable. This is not optional.

### 优先级：用户指令 > 技能 > 默认行为

如果项目有 `CLAUDE.md` 文件，里面写了"不要用 TDD"，但 Superpowers 的技能说"必须用 TDD"，这时怎么办？

答案是：**用户指令最高**。

优先级顺序是：

1. 用户的明确指令（CLAUDE.md、GEMINI.md、AGENTS.md、直接请求）
2. Superpowers 技能（覆盖默认系统行为）
3. 默认系统提示

如果 `CLAUDE.md` 写了"我们不用 TDD"，Superpowers 就不会强制 TDD。用户始终在控制。

## 与 SuperClaude/CLAUDE.md 的差别

很多人会混淆 Superpowers 和 SuperClaude 的 CLAUDE.md 系统。它们在工作层级上有本质区别：

### CLAUDE.md：你告诉 AI "我喜欢这样工作"

`CLAUDE.md` 是**用户配置层**。你在里面写项目偏好、代码风格、工具选择。比如：

```markdown
# My Project

We use:
- Python 3.11
- Black for formatting
- pytest for testing
- Conventional Commits

Please always:
- Write type hints
- Keep functions under 20 lines
- Add docstrings to public APIs
```

这是你的**个人偏好声明**。AI 会参考，但不会强制执行任何流程。

### Superpowers：一套强制开发方法论

Superpowers 是**工作流层**。它定义的是"做任何功能之前必须先设计"、"任何计划都要拆成小任务"、"所有实施都要 TDD"。

差别在三个维度：

| 维度 | CLAUDE.md | Superpowers |
|------|-----------|-------------|
| 性质 | 偏好声明 | 强制流程 |
| 灵活性 | AI 可选择性参考 | 必须严格执行 |
| 可组合性 | 单文件配置 | 可组合技能系统 |
| 典型内容 | 代码风格、工具选择、命名规范 | 工作流步骤、质量门、审查流程 |

### 它们能一起用吗？

能，而且应该一起用。Superpowers 在会话启动时会加载 `CLAUDE.md`，把项目偏好和技能系统集成。

比如 `CLAUDE.md` 说"我们用 FastAPI"，Superpowers 的 `brainstorming` 技能在设计阶段会记住这个偏好，提出的方案会基于 FastAPI。

## 适用场景

Superpowers 不是给所有场景用的。它的设计目标是**有质量要求的严肃开发**。

### 适合用的场景

- **团队协作项目**：需要统一流程、可预期的产出
- **需要高质量代码的项目**：TDD、代码审查、系统性调试强制执行
- **多人参与的仓库**：不同人用 AI 也能产出一致风格
- **复杂功能开发**：不能靠"感觉写写看"，需要系统化分解
- **需要审计轨迹的项目**：每个设计、计划、实施都有文档记录

### 不适合用的场景

- **一次性脚本**：写个 20 行的数据转换脚本，强制设计有点杀鸡用牛刀
- **快速原型**：就是想快速验证想法，不需要工程级质量
- **探索性编程**：你都不知道要做什么，先试试再说
- **简单 bug 修复**：改两行代码的事，不需要全流程

判断标准很简单：如果这个代码会长期维护、有其他开发者会参与、质量出问题会有成本，那就用 Superpowers。如果是写完就扔的脚本，直接让 AI 写就行。

## 权衡与局限

Superpowers 不是银弹。它的强制流程带来质量，但也有成本：

### 开销在哪里

- **前期时间投入**：brainstorming + writing-plans 阶段可能需要 30-60 分钟，才能开始写第一行代码
- **严格流程**：每个任务都要经过 TDD → spec 审查 → 质量审查，小改动也走完整流程
- **文档负担**：每个功能都有 design doc 和 plan 文档，仓库会多很多文件
- **学习曲线**：需要理解技能系统、工作流顺序、各个技能的边界

### 什么情况下收益 < 成本

- **单人项目 + 快速迭代**：你就是唯一开发者，自己清楚要做什么，严格流程拖慢速度
- **非常简单的改动**：改个配置文件、加个日志语句，全流程太重
- **探索性阶段**：需求还在变，设计文档频繁更新反而浪费

### 什么情况下收益 >> 成本

- **多人协作**：统一流程让不同人用 AI 产出一致风格，审查和接手更容易
- **长期维护的项目**：完整的设计和实施文档让半年后的你（或其他人）能理解每个决策
- **质量敏感的领域**：支付、安全、医疗等代码，强制审查和 TDD 值得前期投入

## 安装和入门

Superpowers 可以安装在多个 AI 编程工具上：Claude Code、Cursor、GitHub Copilot CLI、Gemini CLI、OpenCode 等。

安装方法因平台而异。Claude Code 的安装最简单：

```bash
/plugin install superpowers@claude-plugins-official
```

安装后，Superpowers 的技能会自动加载。下次你让 AI "加个用户功能"时，它会自动开始 brainstorming 流程，而不是直接写代码。

## 延伸阅读

- [Superpowers 官方仓库](https://github.com/obra/superpowers) — 完整技能列表和源码
- [02 - Skills 系统原理](02-skills-system.md) — 技能的 YAML frontmatter 如何工作、加载和触发机制
- [05 - brainstorming 工作流](05-brainstorming.md) — 如何把模糊需求拆成可执行的设计文档
- [08 - Subagent-Driven Development](08-subagent-driven-development.md) — 为什么用子代理、上下文隔离的核心思想
- [writing-plans 技能原文](https://github.com/obra/superpowers/blob/master/skills/writing-plans/SKILL.md) — 完整的计划写法规范

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
