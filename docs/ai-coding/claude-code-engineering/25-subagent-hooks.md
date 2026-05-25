# Subagent Hooks：给子代理注入上下文并收集结果

**TL;DR：** Subagent Hooks 适合管理多代理任务：启动时注入规则，结束时收集结论和审计信息。

## 问题

Subagent 拥有独立上下文，这是优点，也是管理难点。主会话的规则不一定完整进入子代理，子代理的结果也需要可追踪。

## 两个关键事件

### SubagentStart

适合注入：

- 安全规则。
- 当前任务边界。
- 输出格式。
- 禁止事项。

### SubagentStop

适合收集：

- 子代理结论。
- 使用工具。
- 修改或未修改文件。
- 未验证风险。

## 落地练习

给所有 `security-reviewer` 子代理启动时注入：

```text
You are read-only. Do not suggest speculative risks without file evidence.
Return findings with severity and exact file reference.
```

结束时记录最后一条消息和 agent 类型。

## 权衡

Subagent Hooks 不应该替代 subagent 自身 prompt。通用规则放 Hook，角色规则放 subagent 文件。
