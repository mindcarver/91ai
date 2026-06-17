# Superpowers 工作流 · 三种 subagent prompt 详解

> 更新日期：2026/06

**TL;DR：** SDD 用三种 prompt 派不同的子代理。Implementer prompt 告诉子代理做什么、怎么问问题、如何自我审查。Spec Compliance Reviewer prompt 告诉子代理"不要信任 implementer 的报告，读实际代码对比 spec"。Code Quality Reviewer prompt 告诉子代理"评估代码质量，不关心 spec 合规性（已经审查过了）"。顺序固定（spec 合规性 → 代码质量），不能颠倒或合并。

## Implementer Prompt 详解

### 目的

告诉 implementer 子代理：
- 做什么（任务描述）
- 什么时候问问题
- 如何自我审查
- 如何报告状态

### 关键段落拆解

#### 1. Task Description + Context

```markdown
## Task Description

[完整任务描述]

## Context

[场景设置：这个任务在整体架构中的位置、依赖关系]
```

**为什么重要：**
- **完整性**：Implementer 不读计划文件，Controller 直接提供完整文本
- **上下文隔离**：只提供必要信息，不让 Implementer 知道其他任务

**示例：**

```markdown
## Task Description

### Task 1: Create User model

**Files:**
- Create: `src/models/user.py`
- Test: `tests/models/test_user.py`

- [ ] **Step 1: Write failing test**
...

## Context

This task creates the User model that will be used by:
- Task 2 (Password hashing) - depends on this task
- Task 3 (Login endpoint) - uses the User model

The User model should store:
- email (string)
- password_hash (string, bcrypt hashed)
```

#### 2. Before You Begin - Ask Questions

```markdown
## Before You Begin

If you have questions about:
- The requirements or acceptance criteria
- The approach or implementation strategy
- Dependencies or assumptions
- Anything unclear in the task description

**Ask them now.** Raise any concerns before starting work.
```

**为什么重要：**
- **防止猜测**：Implementer 不确定时，应该问而不是猜
- **早期解决歧义**：在开始前问清楚，避免返工

**实际例子：**

```
Implementer: 需要澄清：User 模型需要 email 验证吗？
Controller: 不需要，只存储 email 字符串
Implementer: 明白，开始实现...
```

#### 3. Your Job - 五个步骤

```markdown
## Your Job

Once you're clear on requirements:
1. Implement exactly what the task specifies
2. Write tests (following TDD if task says to)
3. Verify implementation works
4. Commit your work
5. Self-review (see below)
6. Report back
```

**为什么重要：**
- **标准化流程**：所有 implementer 遵循相同流程
- **TDD 强制**：如果任务要求 TDD，Implementer 必须遵循

#### 4. When You're in Over Your Head - 升级机制

```markdown
## When You're in Over Your Head

**STOP and escalate when:**
- The task requires architectural decisions with multiple valid approaches
- You need to understand code beyond what was provided and can't find clarity
- You feel uncertain about whether your approach is correct
- The task involves restructuring existing code in ways the plan didn't anticipate
- You've been reading file after file trying to understand the system without progress

**How to escalate:** Report back with status BLOCKED or NEEDS_CONTEXT.
```

**为什么重要：**
- **防止 bad work**：Implementer 应该报告困难，而不是硬做
- **明确的升级标准**：Implementer 知道什么时候该升级

**实际例子：**

```
Implementer: 报告：BLOCKED
  Blocker: Task 1 的实现与预期不同，我需要重构 User 模型，但这超出了当前任务范围

Controller: [评估] 需要拆分任务或重新规划
Controller: 派新的 Implementer，提供更多上下文
```

#### 5. Self-Review - 四个维度

```markdown
## Before Reporting Back: Self-Review

**Completeness:**
- Did I fully implement everything in the spec?
- Did I miss any requirements?
- Are there edge cases I didn't handle?

**Quality:**
- Is this my best work?
- Are names clear and accurate?
- Is the code clean and maintainable?

**Discipline:**
- Did I avoid overbuilding (YAGNI)?
- Did I only build what was requested?
- Did I follow existing patterns in the codebase?

**Testing:**
- Do tests actually verify behavior (not just mock behavior)?
- Did I follow TDD if required?
- Are tests comprehensive?
```

**为什么重要：**
- **第一次质量检查**：Implementer 自我审查，减少 reviewer 的负担
- **明确的审查维度**：Implementer 知道检查什么

#### 6. Report Format - 四种状态

```markdown
## Report Format

When done, report:
- **Status:** DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
- What you implemented (or what you attempted, if blocked)
- What you tested and test results
- Files changed
- Self-review findings (if any)
- Any issues or concerns
```

**为什么重要：**
- **标准化输出**：所有 implementer 用相同格式报告
- **Controller 易解析**：Controller 可以快速理解状态并决定下一步

## Spec Compliance Reviewer Prompt 详解

### 目的

告诉 spec reviewer 子代理：
- **不要信任 implementer 的报告**
- 读实际代码，对比 spec
- 检查缺失的和多余的

### 关键段落拆解

#### 1. CRITICAL: Do Not Trust the Report

```markdown
## CRITICAL: Do Not Trust the Report

The implementer finished suspiciously quickly. Their report may be incomplete,
inaccurate, or optimistic. You MUST verify everything independently.

**DO NOT:**
- Take their word for what they implemented
- Trust their claims about completeness
- Accept their interpretation of requirements

**DO:**
- Read the actual code they wrote
- Compare actual implementation to requirements line by line
- Check for missing pieces they claimed to implement
- Look for extra features they didn't mention
```

**为什么重要：**
- **独立验证**：Spec reviewer 不应该相信 implementer 的报告
- **防止欺骗（即使是无意的）**：Implementer 可能自认为完成了，但实际没有

**实际例子：**

```
Implementer 报告：DONE
  我实现了所有要求：User 模型有 email 和 password_hash 字段

Spec reviewer：读代码
Spec reviewer：❌ Issues found:
  - Missing: password_hash field (实际代码中没有这个字段)
  - Extra: email_validation field (spec 中没有，但 implementer 加了)
```

#### 2. 三个检查维度

```markdown
## Your Job

Read the implementation code and verify:

**Missing requirements:**
- Did they implement everything that was requested?
- Are there requirements they skipped or missed?
- Did they claim something works but didn't actually implement it?

**Extra/unneeded work:**
- Did they build things that weren't requested?
- Did they over-engineer or add unnecessary features?
- Did they add "nice to haves" that weren't in spec?

**Misunderstandings:**
- Did they interpret requirements differently than intended?
- Did they solve the wrong problem?
- Did they implement the right feature but wrong way?
```

**为什么重要：**
- **标准化审查维度**：所有 spec reviewer 用相同维度审查
- **双向检查**：不只是检查缺失，也检查多余（防止过度工程）

#### 3. Verify by Reading Code

```markdown
**Verify by reading code, not by trusting report.**
```

**为什么重要：**
- **核心原则**：spec reviewer 的职责是读代码，不是读报告
- **防止捷径**：spec reviewer 不能因为"implementer 说了"就跳过检查

## Code Quality Reviewer Prompt 详解

### 目的

告诉 code quality reviewer 子代理：
- **只在 spec 合规性通过后执行**
- 评估代码质量（命名、结构、测试）
- 不关心 spec 合规性（已经验证过了）

### 关键段落拆解

#### 1. Only Dispatch After Spec Compliance Passes

```markdown
**Purpose:** Verify implementation is well-built (clean, tested, maintainable)

**Only dispatch after spec compliance review passes.**
```

**为什么重要：**
- **顺序固定**：spec 合规性 → 代码质量，不能颠倒
- **职责分离**：spec reviewer 检查"做了什么"，code reviewer 检查"做得怎么样"

#### 2. Use Standard Code Review Template

```markdown
Task tool (general-purpose):
  Use template at requesting-code-review/code-reviewer.md

  DESCRIPTION: [task summary, from implementer's report]
  PLAN_OR_REQUIREMENTS: Task N from [plan-file]
  BASE_SHA: [commit before task]
  HEAD_SHA: [current commit]
```

**为什么重要：**
- **标准化输出**：所有 code reviewer 用相同格式输出
- **可追踪性**：BASE_SHA 和 HEAD_SHA 让 reviewer 知道要看什么 diff

#### 3. Additional Checks for SDD

```markdown
**In addition to standard code quality concerns, the reviewer should check:**
- Does each file have one clear responsibility with a well-defined interface?
- Are units decomposed so they can be understood and tested independently?
- Is the implementation following the file structure from the plan?
- Did this implementation create new files that are already large, or significantly grow existing files?
```

**为什么重要：**
- **SDD 特定的质量标准**：除了标准的代码质量，还检查 SDD 关心的点
- **防止文件膨胀**：如果这次改动让文件变得很大，未来会难以维护

## 为什么是这个顺序

### Spec 合规性 → 代码质量，不能颠倒

**错误顺序（代码质量 → spec 合规性）：**

```
Controller: 派 Code Quality Reviewer 先审查
Code Reviewer: 代码很漂亮，命名清晰，测试覆盖高
Code Reviewer: ✅ Approved
Controller: 派 Spec Compliance Reviewer
Spec Reviewer: ❌ Issues found: 缺失 password_hash 字段
```

**问题：**
- 浪费时间：先审查代码质量，后来发现根本没实现完整
- Code Reviewer 的时间白费了

**正确顺序（spec 合规性 → 代码质量）：**

```
Controller: 派 Spec Compliance Reviewer 先审查
Spec Reviewer: ✅ Spec compliant
Controller: 派 Code Quality Reviewer
Code Reviewer: 代码质量很好
Code Reviewer: ✅ Approved
```

**优势：**
- 第一个门控（spec 合规性）快速过滤不完整的实现
- 第二个门控（代码质量）只审查完整的实现

### 为什么不能合并

**提议：** 用一个 reviewer 同时检查 spec 合规性和代码质量。

**问题：**

1. **关注点混淆**：Spec 合规性关注"做了什么"，代码质量关注"做得怎么样"。混在一起容易遗漏。
2. **报告格式不统一**：Spec reviewer 返回"✅/❌ Issues found"，Code reviewer 返回"Strengths, Issues, Assessment"。
3. **审查循环复杂**：如果同时审查，发现问题后不知道是 spec 问题还是质量问题，难以修复。

**反例：** 如果合并审查，可能出现：

```
Reviewer: ❌ Issues found:
  - Missing: password_hash (spec 问题)
  - Naming: 'pwd_hash' not clear (quality 问题)
  - Extra: email_validation field (spec 问题)

Implementer: [需要同时修复 spec 和 quality 问题]
Implementer: [修复后重新审查]
Reviewer: [又要同时检查两个维度]
```

循环复杂，难以追踪。

**分离的优势：**

```
Spec Reviewer: ❌ Issues found:
  - Missing: password_hash
  - Extra: email_validation field

Implementer: [修复 spec 问题]
Spec Reviewer: ✅ Spec compliant

Code Reviewer: Issues (Minor): Naming 'pwd_hash' not clear
Implementer: [修复 quality 问题]
Code Reviewer: ✅ Approved
```

每轮只关注一个维度，清晰高效。

## 权衡与局限

### 开销

- **三次子代理调用**：每个任务需要 3 次子代理（implementer + 2 reviewers）
- **审查循环**：如果发现问题，需要重新审查
- **token 消耗**：每个 prompt 都很长（implementer prompt 约 800 字）

### 局限

- **不能跳过任何审查**：即使很小的改动，也必须走两阶段审查
- **顺序固定**：不能先审查代码质量，后审查 spec 合规性
- **依赖 prompt 质量**：如果 prompt 写得不清楚，子代理可能误解

### 什么时候收益 < 成本

- **单行改动**：改一行代码，两阶段审查太重
- **紧急修复**：生产环境挂了，先修复再审查
- **学习实验**：就是想试试，不需要严格审查

## 延伸阅读

- [08 - Subagent-Driven Development 整体流程](08-subagent-driven-development.md) — SDD 的整体架构和工作流程
- [subagent-driven-development 技能原文](https://github.com/obra/superpowers/blob/master/skills/subagent-driven-development/SKILL.md) — 完整的 SDD 规范
- [01 - Superpowers 入门](01-overview.md) — SDD 在整体工作流中的位置
- [06 - writing-plans 工作流](06-writing-plans.md) — 如何写 SDD 执行的计划

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
