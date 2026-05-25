# MCP 心智模型：外部系统不是复制粘贴，而是工具接口

**TL;DR：** MCP 让 Claude Code 直接访问外部系统。它解决的是“把外部状态复制进聊天”的问题，但同时引入权限和数据边界。

## 问题

没有 MCP 时，开发者经常复制 GitHub issue、监控日志、设计稿说明、数据库查询结果给 AI。复制过程会丢上下文，也无法让 AI 继续操作原系统。

## 核心机制

MCP server 把外部系统暴露成工具。Claude Code 可以：

- 读取 issue。
- 查询 PR。
- 访问文档。
- 搜索监控数据。
- 调用内部 API。

## 好场景

- GitHub issue triage。
- Sentry 错误分析。
- Linear/Jira 需求读取。
- Figma 设计信息读取。
- 内部文档搜索。

## 落地练习

先接一个只读 MCP，不要从数据库写操作开始。让 Claude Code 完成：

```text
读取这个 issue，找出相关代码位置，提出修复计划。
不要修改文件。
```

## 权衡

MCP 让 AI 更有用，也让风险更真实。工具权限、输出大小、敏感数据和 prompt injection 都必须纳入设计。
