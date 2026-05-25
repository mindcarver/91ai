# Claude Code 工程化实战系列

这个系列参考《Claude Code 工程化实战》的能力范围，但按 Awesome AI Guide 的写法重新组织：更强调开发者自学、团队落地、权限治理和可验证交付。

推荐先读 [Claude Code 工程化学习路径](../claude-code-engineering-learning-path.md)，再按模块阅读下面 33 篇文章。

## 系列目录

### 开篇：先建立正确问题

1. [Claude Code 不是代码补全，而是工程代理运行时](./00-claude-code-as-agent-runtime.md)
2. [你真正要解决的是上下文搬运、验证缺失和权限失控](./01-context-validation-permission.md)

### 第一模块：单人可用

3. [安装、登录、权限模式和第一个真实仓库任务](./02-setup-permission-first-repo-task.md)
4. [项目地图：让 Claude Code 读懂目录、命令和边界](./03-project-map.md)
5. [CLAUDE.md：把团队规则写成机器可用上下文](./04-claude-md-project-memory.md)
6. [.claude/rules：把大规则拆成按路径加载的小规则](./05-rules-path-scoped-context.md)
7. [常用工作流：解释代码、修 Bug、补测试、写文档](./06-common-workflows.md)

### 第二模块：把重复任务变成能力

8. [Slash Commands：把一次性提示词变成团队命令](./07-slash-commands.md)
9. [Skills 入门：什么时候该从命令升级为 Skill](./08-skills-from-command-to-capability.md)
10. [SKILL.md 结构：触发描述、步骤、资源和脚本](./09-skill-md-structure.md)
11. [渐进式披露：避免 Skill 一次塞爆上下文](./10-progressive-disclosure.md)
12. [Skill 评测：欠触发、误触发和执行失败怎么修](./11-skill-evaluation.md)

### 第三模块：复杂任务拆解

13. [Subagents 的本质：独立上下文里的专家助手](./12-subagents-mental-model.md)
14. [三类高价值 Subagent：探索、审查、测试](./13-high-value-subagents.md)
15. [工具权限：只读审计代理为什么不能有写权限](./14-subagent-tool-permissions.md)
16. [并行探索：让多个代理独立研究再汇总](./15-parallel-exploration.md)
17. [不该用 Subagent 的场景：共享细节和连续编辑](./16-when-not-to-use-subagents.md)

### 第四模块：连接外部世界

18. [MCP 心智模型：外部系统不是复制粘贴，而是工具接口](./17-mcp-mental-model.md)
19. [第一个 MCP：GitHub Issue、PR 和代码上下文](./18-github-mcp.md)
20. [数据库、监控和设计系统：高价值 MCP 场景](./19-high-value-mcp-scenarios.md)
21. [MCP + Skill：让工具按团队 SOP 被正确使用](./20-mcp-plus-skills.md)
22. [MCP 风险：Token、越权、工具投毒和提示注入](./21-mcp-risks.md)

### 第五模块：确定性治理

23. [Hooks 入门：事件驱动的自动化和审计](./22-hooks-introduction.md)
24. [PreToolUse：阻断危险命令和高风险文件写入](./23-pretooluse-guardrails.md)
25. [PostToolUse / Stop：自动格式化、测试和结果记录](./24-posttooluse-stop-verification.md)
26. [Subagent Hooks：给子代理注入上下文并收集结果](./25-subagent-hooks.md)
27. [Hook 设计原则：小、确定、可解释、可回滚](./26-hook-design-principles.md)

### 第六模块：Headless 与 CI/CD

28. [Headless 模式：把 Claude Code 放进脚本](./27-headless-mode.md)
29. [GitHub Actions：PR Review、Issue Triage 和简单修复](./28-github-actions.md)
30. [CI 里的安全边界：Secrets、外部 PR、权限和审批](./29-ci-security-boundaries.md)
31. [结构化输出：让 Agent 结果能被机器继续处理](./30-structured-output.md)

### 第七模块：平台化和分发

32. [Agent SDK：把 Claude Code 能力嵌进内部平台](./31-agent-sdk.md)
33. [Plugins：打包 Commands、Agents、Skills、Hooks 和 MCP](./32-plugins.md)
34. [组织级治理：版本、审计、评测、禁用和升级策略](./33-organization-governance.md)
