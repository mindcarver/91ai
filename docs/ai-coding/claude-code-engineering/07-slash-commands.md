# Slash Commands：把一次性提示词变成团队命令

**TL;DR：** Slash Commands 适合把高频、短流程、人工触发的任务固化下来。它减少提示词漂移，让团队用同一种方式 review、修测试、发版和写变更说明。

## 问题

如果每个人都手写“帮我 review 一下代码”，Claude Code 得到的上下文和标准会不一致。Slash Command 把这个提示词变成版本化文件，让团队共享同一套任务定义。

## 适合做成命令的任务

- `/review`：检查当前 diff。
- `/fix-test`：定位并修复失败测试。
- `/release-notes`：根据 commit 生成发布说明。
- `/explain-module`：解释某个目录的职责。

## 示例

```md
# /review

Review the current diff.

Focus on:
- correctness
- missing tests
- security risks
- behavior changes

Return findings first, ordered by severity.
```

## 落地练习

先做一个 `/review` 命令：

1. 固定 review 维度。
2. 要求“发现问题优先，不要先总结”。
3. 在 3 个真实 PR diff 上试用。
4. 把误报和漏报反馈进命令文本。

## 权衡

命令适合短流程，不适合复杂知识包。如果命令开始依赖大量背景、示例、脚本或资源，就应该升级成 Skill。
