# 项目地图：让 Claude Code 读懂目录、命令和边界

**TL;DR：** Claude Code 需要一张项目地图：哪些目录重要、哪些命令可信、哪些文件不能碰。没有项目地图，它会用搜索猜系统结构。

## 问题

人类加入项目时，会先问“入口在哪、怎么跑、怎么测、哪些坑不要踩”。Claude Code 也需要这些信息。否则它会在仓库里反复搜索，浪费上下文，还可能误判模块边界。

## 核心机制

项目地图通常包含：

- 目录职责。
- 服务或 package 边界。
- 常用命令。
- 测试策略。
- 配置文件位置。
- 不应修改的生成文件、迁移文件、凭据文件。

## 示例结构

```md
## Project Map

- `apps/web/`: frontend app.
- `apps/api/`: backend API.
- `packages/ui/`: shared design system.
- `packages/db/`: schema and migrations.

## Boundaries

- Do not edit generated files under `dist/`.
- Ask before changing database migrations.
- Prefer package-local tests before repo-wide tests.
```

## 落地练习

让 Claude Code 先生成项目地图草稿，再由你审查：

```text
阅读仓库结构，生成一份 CLAUDE.md 项目地图草稿。
不要修改文件，只输出建议内容。
重点标出命令、目录边界、测试方式和高风险区域。
```

## 权衡

项目地图不是架构文档。它应该短、准、可执行。超过两屏的项目地图通常已经开始变成维护负担。
