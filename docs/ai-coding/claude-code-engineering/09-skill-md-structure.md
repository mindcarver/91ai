# SKILL.md 结构：触发描述、步骤、资源和脚本

**TL;DR：** 一个好的 `SKILL.md` 不是长提示词，而是“什么时候用、按什么步骤做、用哪些资源、如何验证”的小型操作手册。

## 问题

很多 Skill 失败不是因为内容不够，而是因为触发描述模糊、步骤不可执行、边界不清。Claude Code 需要明确知道：这个 Skill 解决什么任务，不解决什么任务。

## 推荐结构

```md
---
name: pr-review
description: Review a pull request diff for correctness, tests, security, and maintainability.
---

# PR Review Skill

## Use When
- User asks for code review.
- Current task involves checking a diff.

## Do Not Use When
- User asks to implement changes directly.

## Steps
1. Read current diff.
2. Identify behavior changes.
3. Check tests.
4. Report findings first.

## Output
- Findings ordered by severity.
- Open questions.
- Verification gaps.
```

## 落地练习

写一个 `bug-triage` Skill，要求它只做诊断，不直接改代码。试着让 Claude Code 在“修复 bug”和“分析 bug”两类请求中触发或不触发。

## 权衡

Skill 的 description 越宽，越容易误触发。越窄，越容易欠触发。上线前要用 10 条真实请求测试触发边界。
