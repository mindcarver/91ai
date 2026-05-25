# Hooks 入门：事件驱动的自动化和审计

**TL;DR：** Hooks 是 Claude Code 的确定性控制层。模型负责推理，Hooks 负责在固定事件上记录、拦截、提醒和验证。

## 问题

只靠提示词约束 AI 不够稳定。你可以告诉 Claude Code 不要改 `.env`，但更可靠的做法是在工具执行前拦截危险写入。

## 常见事件

- `PreToolUse`：工具执行前。
- `PostToolUse`：工具成功后。
- `PostToolUseFailure`：工具失败后。
- `Notification`：需要权限或空闲提醒。
- `SubagentStart` / `SubagentStop`：子代理开始和结束。
- `Stop`：主会话结束。

## 三类 Hook

| 类型 | 用途 |
| --- | --- |
| 记录 | 保存命令、文件修改、结果 |
| 提示 | 注入额外上下文或提醒 |
| 阻断 | 拦截高风险操作 |

## 落地练习

先做一个记录型 Hook：每次 Claude Code 结束时，记录本轮修改文件、执行命令和验证结果。

## 权衡

Hook 是代码，不是魔法。它会失败、阻塞、误判。越靠近阻断逻辑，越要保持小而确定。
