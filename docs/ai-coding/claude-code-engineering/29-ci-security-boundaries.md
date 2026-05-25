# CI 里的安全边界：Secrets、外部 PR、权限和审批

**TL;DR：** 在 CI 里运行 Claude Code，最大风险不是生成错代码，而是权限配置错误。外部 PR、secrets、写权限和自动触发条件必须单独设计。

## 问题

CI 环境天然连接仓库、token、secrets、构建产物和部署链路。AI Agent 一旦进入 CI，就不能按普通脚本对待。

## 风险点

- 外部 PR 读取 secrets。
- token 具备过大写权限。
- Agent 自动修改 workflow。
- 评论触发命令缺少身份检查。
- 构建脚本执行不可信代码。

## 防护策略

| 风险 | 策略 |
| --- | --- |
| 外部 PR | 不提供 secrets，不给写 token |
| 写权限 | 按 job 最小化权限 |
| 自动触发 | 仅成员或白名单触发 |
| 部署 | 强制人工审批 |
| 日志 | 避免输出敏感信息 |

## 落地练习

审查一个 Claude Code GitHub Action workflow，检查：

- `permissions` 是否最小。
- 是否使用 GitHub Secrets。
- 是否限制触发来源。
- 是否允许 push。
- 是否能访问部署凭据。

## 权衡

限制越多，自动化越弱。但 CI 安全的目标不是最大化自动化，而是限制事故半径。
