# Agent SDK：把 Claude Code 能力嵌进内部平台

**TL;DR：** Agent SDK 适合把 Claude Code 的 agent loop、工具、MCP、Hooks 和 Subagents 嵌进内部系统。不要在单仓库个人使用阶段过早上 SDK。

## 问题

本地 Claude Code 适合个人和小团队。但当组织想把能力接入内部平台、工单系统、代码门户或自动化服务时，需要程序化控制。

## 适合 SDK 的场景

- 内部代码助理平台。
- 工单自动分析。
- 批量仓库迁移。
- 标准化 PR review 服务。
- 带审计和权限的企业 Agent。

## 你需要设计什么

- 输入来源。
- 工具权限。
- 模型和成本。
- 日志和审计。
- 人工确认。
- 失败重试。
- 输出格式。

## 落地练习

先不要做完整平台。做一个“只读 PR 分析服务”：

1. 输入 PR URL。
2. 调用 Claude Code 分析 diff。
3. 输出结构化 findings。
4. 不写评论，不改代码。

## 权衡

SDK 增加工程复杂度。只有当本地 workflow 已经验证有效，并且多个团队需要复用时，才值得平台化。
