# Headless 模式：把 Claude Code 放进脚本

**TL;DR：** Headless 模式让 Claude Code 从交互式工具变成自动化组件。适合批处理、CI、定期检查和低风险修复。

## 问题

交互式 Claude Code 适合人机协作，但很多任务适合脚本化：每日依赖检查、文档同步、Issue 分类、PR 摘要、测试失败归因。

## 适合场景

- 批量生成 changelog 草稿。
- 对 PR 做初步 review。
- 分类 issue。
- 分析 CI 失败日志。
- 检查文档链接。

## 不适合场景

- 自动部署生产。
- 自动合并 PR。
- 自动修改敏感配置。
- 无人审批的大规模重构。

## 落地练习

选择一个只读任务做 headless：

```text
读取最近 10 个 issue，按 bug/feature/docs/question 分类。
输出 JSON，不修改任何远端状态。
```

先让它只输出结果，不写回系统。

## 权衡

Headless 降低人工成本，也减少人工实时纠偏。越自动化，越需要结构化输出、权限限制和日志。
