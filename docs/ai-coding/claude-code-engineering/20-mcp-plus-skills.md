# MCP + Skill：让工具按团队 SOP 被正确使用

**TL;DR：** MCP 给 Claude Code 工具，Skill 给 Claude Code 方法。两者结合，才能让 AI 按团队 SOP 使用外部系统。

## 问题

只接 MCP 后，Claude Code 知道“有哪些工具”，但不知道“团队希望怎么用”。例如它能访问 Linear，但不知道新建任务时必须填哪些字段、如何关联 release、什么时候需要 owner 确认。

## 分工

| 机制 | 职责 |
| --- | --- |
| MCP | 暴露工具和数据 |
| Skill | 描述流程、参数、失败处理和验收标准 |

## 示例

一个 incident Skill 可以规定：

1. 从监控 MCP 读取异常。
2. 从 GitHub MCP 查最近部署。
3. 生成时间线。
4. 给出假设和证据。
5. 不自动执行回滚，只输出建议。

## 落地练习

给一个只读 GitHub MCP 写一个 `issue-triage` Skill。要求 Skill 明确：

- 读取哪些字段。
- 如何分类。
- 什么时候需要人工确认。
- 输出格式。

## 权衡

MCP + Skill 会让能力更强，也会让供应链更复杂。Skill 应该记录依赖了哪些 MCP server 和工具权限。
