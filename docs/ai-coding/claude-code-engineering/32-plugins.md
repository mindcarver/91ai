# Plugins：打包 Commands、Agents、Skills、Hooks 和 MCP

**TL;DR：** Plugin 是 Claude Code 能力的分发单元。它适合把一套经过验证的 commands、agents、skills、hooks 和 MCP 配置分发给多个项目。

## 问题

当每个仓库都复制一份 commands、skills 和 hooks，维护会失控。Plugin 的价值是把这些能力打包、版本化、分发和升级。

## Plugin 可以包含什么

- Slash Commands。
- Subagents。
- Skills。
- Hooks。
- MCP servers。
- 配置和资源。

## 适合场景

- 公司统一代码审查流程。
- 安全团队分发审计能力。
- 平台团队分发项目初始化流程。
- 数据团队分发分析工作流。

## 落地练习

把一个稳定 Skill 和一个只读 reviewer subagent 打包成插件草案。先在两个仓库试用，记录：

- 是否安装顺利。
- 是否误触发。
- 是否和项目本地规则冲突。
- 是否容易升级。

## 权衡

Plugin 是供应链入口。第三方插件必须审计。内部插件也要有版本、变更记录和回滚方式。
