# GitHub Actions：PR Review、Issue Triage 和简单修复

**TL;DR：** GitHub Actions 让 Claude Code 进入协作流程。第一批场景应该是 review、triage、摘要和低风险修复，不是自动合并。

## 问题

团队协作发生在 PR 和 issue 里。如果 Claude Code 只在本地终端使用，它的结果难以进入标准流程。GitHub Actions 可以把它接到 review 和 CI。

## 推荐场景

- PR 摘要。
- 初步代码审查。
- Issue 分类。
- 文档修复。
- 测试失败分析。

## 权限策略

| 场景 | 权限 |
| --- | --- |
| PR 摘要 | 只读 |
| Review comment | 读代码 + 写评论 |
| 简单修复 | 创建分支 + PR |
| 自动合并 | 默认不建议 |

## 落地练习

先做 `@claude review`：

1. 只在成员触发时运行。
2. 不暴露 secrets 给外部 PR。
3. 限制最大轮数。
4. 只评论，不提交。

## 权衡

CI 里的 Agent 输出会被团队当成“半正式意见”。必须明确它是辅助 review，不是最终审批。
