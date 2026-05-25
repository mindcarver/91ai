# CLAUDE.md：把团队规则写成机器可用上下文

**TL;DR：** `CLAUDE.md` 是写给 Claude Code 的项目说明书。它不应该复制 README，而应该记录会影响 AI 行为的规则：命令、风格、架构边界、测试期望和安全限制。

## 问题

人类开发者能从经验里记住团队偏好：用 pnpm，不用 npm；改 API 要更新契约测试；生产配置不能随便动。Claude Code 每次会话都需要重新获得这些规则。`CLAUDE.md` 就是把隐性团队知识显性化。

## 核心机制

一个有效的 `CLAUDE.md` 应该包含：

- 项目用途和技术栈。
- 安装、测试、构建命令。
- 修改规则。
- 安全边界。
- 验证期望。
- 常见失败处理。

## 推荐模板

```md
# CLAUDE.md

## Commands
- Install: pnpm install
- Test: pnpm test
- Typecheck: pnpm typecheck

## Working Rules
- Keep diffs small.
- Reuse existing helpers before adding new abstractions.
- Update docs when public behavior changes.

## Safety
- Do not edit `.env*`.
- Ask before changing migrations.
- Never run deployment commands without explicit request.
```

## 落地练习

把现有 README 中“人类说明”提炼成“AI 操作规则”。不要超过 120 行。写完后让 Claude Code 用自己的话复述，并指出哪些规则仍然模糊。

## 权衡

`CLAUDE.md` 不是强制策略，它只是上下文。真正需要强制的规则应该进入 Hooks、CI 或权限配置。
