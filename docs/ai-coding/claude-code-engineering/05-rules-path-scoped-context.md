# .claude/rules：把大规则拆成按路径加载的小规则

**TL;DR：** 大型仓库不要把所有规则塞进一个 `CLAUDE.md`。用 `.claude/rules/` 按路径组织规则，可以减少上下文噪声和规则冲突。

## 问题

一个 monorepo 里，前端、后端、移动端、数据管道的规则不同。全写进根目录 `CLAUDE.md` 会出现两个问题：Claude Code 每次都读到无关规则；不同规则之间互相冲突。

## 核心机制

路径规则适合放：

- 某个 package 的测试命令。
- 某类文件的风格要求。
- 特定目录的架构边界。
- 高风险目录的修改限制。

## 示例

```md
---
paths:
  - "packages/ui/**"
---

# UI Package Rules

- Prefer existing components before creating new ones.
- Run visual tests when changing shared components.
- Do not introduce app-specific business logic here.
```

## 落地练习

挑一个规则最多的目录，把全局规则拆出 1 个 path-scoped rule：

1. 选择 `apps/web/**` 或 `packages/ui/**`。
2. 写 5-8 条只对它有效的规则。
3. 让 Claude Code 修改该目录下一个小文件，观察它是否遵循规则。

## 权衡

路径规则会增加维护点。只有当全局 `CLAUDE.md` 已经变长、变杂、变冲突时，才值得拆。
