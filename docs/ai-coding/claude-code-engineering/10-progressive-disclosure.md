# 渐进式披露：避免 Skill 一次塞爆上下文

**TL;DR：** Skill 不应该一次加载所有知识。先给 Claude Code 总流程，只在需要时读取模板、脚本和参考资料，这就是渐进式披露。

## 问题

复杂 Skill 往往包含长模板、示例、检查清单和脚本说明。如果这些内容每次都进入上下文，会浪费 token，也会干扰模型判断。

## 核心机制

渐进式披露的原则：

- `SKILL.md` 只放任务流程和路由。
- 大模板放 `templates/`。
- 示例放 `examples/`。
- 脚本放 `scripts/`。
- 需要时再读取具体文件。

## 目录示例

```txt
skills/release-notes/
  SKILL.md
  templates/
    changelog.md
  examples/
    good-release-note.md
  scripts/
    collect_commits.js
```

## 落地练习

把一个超过 150 行的 Skill 拆成：

- 50 行以内的 `SKILL.md`。
- 一个模板文件。
- 一个示例文件。
- 一个可选脚本。

然后测试 Claude Code 是否只在需要时读取额外文件。

## 权衡

拆分会增加文件数量。只有当 Skill 内容开始影响触发、速度或一致性时，渐进式披露才有明显收益。
