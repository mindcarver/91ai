# 你真正要解决的是上下文搬运、验证缺失和权限失控

**TL;DR：** AI Coding 的失败通常不是“模型不会写代码”，而是上下文不完整、验证链路缺失、权限边界太宽。Claude Code 工程化的第一步，是把这三个问题显式化。

## 问题

开发者经常把报错、文件片段和需求复制给 AI，再把答案复制回项目。这个流程有三个隐患：

- 上下文搬运会丢细节。
- 生成结果没有自动验证。
- AI 一旦能执行命令，风险边界会变模糊。

Claude Code 改善了第一点，但不会自动解决后两点。它能读仓库，也可能读错重点；它能跑测试，也可能没跑对测试；它能执行 shell，也可能碰到危险命令。

## 核心机制

工程化要把三件事写进系统：

| 问题 | 对应机制 |
| --- | --- |
| 上下文搬运 | `CLAUDE.md`、rules、MCP、项目地图 |
| 验证缺失 | 测试命令、Hooks、Slash Commands、CI |
| 权限失控 | permission mode、tool allowlist、PreToolUse Hook |

## 落地练习

给仓库新增一份最小 AI 协作约定：

```md
# CLAUDE.md

## Commands
- Test: npm test
- Typecheck: npm run typecheck

## Safety
- Do not edit production secrets.
- Ask before changing database migrations.
- Run the smallest relevant test after behavior changes.
```

然后让 Claude Code 复述这些规则，并执行一个小改动。

## 权衡

规则写得越多，越容易互相冲突。第一版不要追求完整，只写会影响安全和验证的规则。上下文不是越多越好，能稳定改变行为的上下文才有价值。
