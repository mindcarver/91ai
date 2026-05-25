# DevOps Path

面向 DevOps、SRE、平台工程师、基础设施工程师。

核心目标：把 AI 接入开发和运维流程，同时守住权限、审计、回滚和生产安全边界。

## 推荐路线

| 阶段 | 学什么 | 产出 |
| --- | --- | --- |
| 1 | AI Coding for Ops | 用 AI 辅助脚本、配置、CI、IaC review |
| 2 | Log / Incident Summary | 日志摘要、告警归因、事件时间线 |
| 3 | Workflow Automation | 带人工确认的部署、回滚、巡检流程 |
| 4 | Tool Permissions | 只读、写操作、高风险操作分级 |
| 5 | Sandbox | 限制 shell、网络、文件、云账号权限 |
| 6 | Observability | trace、audit log、成本、延迟、失败回放 |
| 7 | Security Review | prompt injection、secret 泄露、供应链风险 |

## 先看这些专题

- [AI Coding](../ai-coding/)
- [Agent Learning Path](../agent/)
- [DevOps 与基础设施](../project-collections/devops.md)
- [安全工具](../project-collections/security.md)
- [配置与环境](../project-collections/configuration.md)

## 第一个项目

做一个 **Incident Report Summarizer**。

它应该包含：

- 输入日志、告警和人工备注。
- 生成事件时间线。
- 标出可能原因和证据。
- 给出下一步排查建议。
- 所有高风险操作只输出建议，不自动执行。

## 推荐工具方向

| 方向 | 工具类型 |
| --- | --- |
| CI/CD | GitHub Actions、代码审查 agent、变更摘要 |
| 日志分析 | log summarizer、incident assistant、trace search |
| 自动化 | workflow engine、runbook automation |
| 安全 | sandbox、secret scanning、permission boundary |
| 观测 | audit log、trace replay、cost monitoring |

## 避坑

- 不要让 AI 直接操作生产环境写权限。
- 不要把 secret、token、私有日志直接送给不受控工具。
- 不要用自然语言输出替代审计日志。
- 不要没有 rollback 设计就自动执行部署或修复。
