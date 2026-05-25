# 第一个 MCP：GitHub Issue、PR 和代码上下文

**TL;DR：** GitHub MCP 是最适合作为第一个 MCP 的场景。它连接 issue、PR、代码和 CI，价值明确，权限也容易分级。

## 问题

开发任务通常从 GitHub 开始：issue 描述问题，PR 承载修改，CI 给出反馈。没有 MCP 时，Claude Code 只能依赖用户复制片段。

## 核心用法

GitHub MCP 可以支持：

- 读取 issue 描述。
- 搜索相关 PR。
- 查看 CI 失败。
- 分析 review comments。
- 输出修复计划。

第一阶段建议只读。

## 落地练习

设计一个 issue triage 流程：

1. 读取 issue 标题和正文。
2. 判断类型：bug、feature、docs、question。
3. 搜索相关文件。
4. 给出标签建议和下一步。
5. 标出需要人工确认的信息。

## 权限建议

| 阶段 | 权限 |
| --- | --- |
| 试用 | 只读 issue、PR、文件 |
| 稳定后 | 允许评论，不允许 push |
| 高信任 | 允许创建分支和 PR |
| 谨慎 | 自动 merge 不建议默认开启 |

## 权衡

GitHub token 权限必须最小化。尤其是外部 PR 场景，不要让 AI 获得 secrets 或写权限。
