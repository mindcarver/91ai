# Subagents 的本质：独立上下文里的专家助手

**TL;DR：** Subagent 不是“更聪明的 Claude”。它的价值是独立上下文、专门提示词和工具权限。用它隔离探索、审查和测试，而不是替代主会话。

## 问题

复杂任务会污染主会话上下文。比如安全审查需要读很多文件，测试定位需要看大量日志，研究任务需要搜索大量资料。全部塞进主会话，会让后续实现变乱。

## 核心机制

Subagent 有三个关键特征：

- 独立上下文。
- 专门角色。
- 可限制工具权限。

这让它适合做“独立完成后汇报”的任务。

## 示例角色

```md
---
name: security-reviewer
description: Reviews code for security issues. Use after auth, permission, or data handling changes.
tools: Read, Grep, Glob
---

Focus on auth bypass, sensitive data exposure, injection, and unsafe defaults.
Return findings with file references and severity.
```

## 落地练习

创建一个只读 `code-reviewer` subagent。让它审查最近 diff，但不允许编辑文件。比较它和主会话 review 的差异。

## 权衡

Subagent 会增加调度成本和结果整合成本。任务越模糊，subagent 越容易输出泛泛建议。角色必须窄。
