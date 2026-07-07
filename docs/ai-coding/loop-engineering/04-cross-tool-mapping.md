# 跨工具迁移：Claude Code、Codex、Cursor 怎么落地

> loop engineering 最容易被误解的一点，是大家以为它只属于某一个产品。
> 实际上，真正可迁移的是能力组合，不是产品名字。

## 先讲结论

如果你已经理解前两篇内容，跨工具迁移时最该坚持的不是“这个工具有没有同名功能”，而是下面四件事：

1. **skill / 指令资产是否可复用**
2. **状态文件是否跨会话稳定**
3. **maker / checker 是否能分离**
4. **调度和外部连接能否形成闭环**

只要这四层在，loop 大概率能迁移；只追工具 UI 和命令表，迁移常常会失败。

## 一张能力映射表

基于源仓库的 primitives matrix，可以把常见 agent 环境简化映射成下面这样：

| Loop 能力 | Claude Code | Codex | Cursor |
| --- | --- | --- | --- |
| 调度 / 自动化 | `/loop`、scheduled tasks、GitHub Actions、cron | Automations、项目级 cadence、云端环境 | Automations、Cloud Agent、外部 cron / webhook |
| 持久项目知识 | `SKILL.md`、`CLAUDE.md` | Skills、`AGENTS.md` | `.cursor/rules/`、skills、`AGENTS.md` |
| 隔离执行 | `git worktree`、subagent worktree | 内建 worktree / 线程隔离 | Git worktree、独立 Agent 任务 |
| maker / checker | task subagents、reviewer agent | subagents、自定义 agent、独立验证线程 | review mode、多 agent、Cloud Agent 二次复核 |
| 外部系统连接 | MCP、plugins | connectors、MCP、plugins | MCP、GitHub / Linear / Slack 集成 |
| 状态骨架 | `STATE.md`、项目文件、外部工单 | `STATE.md`、Markdown、Linear、连接器 | `STATE.md`、rules、memories、外部看板 |

你会发现，产品名虽然不同，但真正关键的原语差不多都存在。

## 一、Claude Code：最适合把 loop 落在仓库纪律里

Claude Code 的优势在于它天然适合把 loop 织进项目规范中：

- `CLAUDE.md` 适合放全局边界
- `SKILL.md` 适合放 triage / verifier / action skill
- subagents 适合 maker / checker 分工
- hooks 和 headless/CI 适合补充自动化入口

一个典型落地方式是：

1. 用 `CLAUDE.md` 定义测试命令、denylist、审批边界
2. 用 `SKILL.md` 写 `loop-triage` 和 `loop-verifier`
3. 用 `STATE.md` 记录高优先级项和最近动作
4. 先用 `/loop 1d` 或 GitHub Actions 跑 L1
5. 后续再在 worktree 里引入小修复

Claude Code 这类环境很适合那些已经把项目规则文档化、并愿意长期维护 skill 资产的团队。

## 二、Codex：最适合把 loop 做成“自动化 + 技能 + 线程管理”的工作台

Codex 这边最关键的是三层：

- **Automations**：定义 cadence、项目环境和触发方式
- **Skills / AGENTS.md**：定义稳定任务说明和仓库协作边界
- **Subagents / worktree / connectors**：把执行、验证和外部系统连接起来

它适合的迁移姿势一般是：

1. 把 loop 目标写进 skill 或 `AGENTS.md`
2. 用 Automation 让任务按 cadence 跑起来
3. 用 state 文件或 Linear 记录结果
4. 用 verifier agent 检查 stop condition
5. 对需要外部动作的路径加 connector 权限控制

Codex 的优势不是“更会写 loop”，而是它已经提供了一套比较自然的长期任务运行面板，所以适合把 loop 做成项目层面的持续自动化。

## 三、Cursor：最适合把 loop 和编辑器工作流粘在一起

Cursor 没有必要完全照抄 CLI agent 的落地方式。它更自然的迁移路径通常是：

- rules 管长期上下文
- skills 或 agent 模板管专门任务
- Automations / Cloud Agent 管调度
- review 模式或第二个 agent 管 verifier
- Git worktree 管隔离

它特别适合这些场景：

- 团队主工作台本来就在 IDE
- loop 更多是“协助型”，而不是重度无人值守
- 想把 triage、review、轻量修复嵌进日常开发，而不是单独维护一整套 CLI 操作流

换句话说，Cursor 更像“编辑器内 loop”，而不是“独立运维系统”。

## 四、工具迁移时，最不该迁移的是什么

很多人迁移失败，是因为把不该复制的东西复制过去了。

最常见的坑有三个：

### 1. 复制命令，不复制结构

比如把某个工具里的 `/loop 1d` 机械换成另一个工具的 automation，却没有补 state、verifier 和 handoff 规则。

这类迁移只复制了表层入口，没有复制 loop 本体。

### 2. 复制提示词，不复制状态协议

如果 `STATE.md` 的字段、优先级分层、最后运行时间、watch list 都没被带过去，那么 loop 跨工具后几乎一定会失忆。

### 3. 复制“自动修复”，不复制安全护栏

有人会直接抄别人的 dependency sweeper 或 PR babysitter 行为，却不抄：

- denylist
- worktree
- verifier
- max attempts
- kill switch

结果就是最危险的部分被完整复制，而最重要的保护层被漏掉。

## 一个推荐迁移顺序

如果你要把同一条 loop 从 A 工具迁到 B 工具，我建议按这个顺序：

1. **先迁 skill 语义**
2. **再迁 state schema**
3. **再迁 verifier split**
4. **再迁 scheduling**
5. **最后才迁写权限动作**

这样做的原因是：

- skill 语义决定这条 loop 到底在干什么
- state schema 决定它怎么跨时间连续
- verifier split 决定它是否还能自我约束
- scheduling 决定运行节奏
- 写权限动作风险最高，应该最后再开

## 一个工具无关的最小模板

不管你在 Claude Code、Codex 还是 Cursor 里做，下面这几样最好都先准备好：

- 一个 `STATE.md`
- 一个 triage skill
- 一个 verifier 说明
- 一个 cadence
- 一个 denylist
- 一个 kill switch

如果连这几样都没有，谈“迁移 loop”通常还太早。

## 什么时候不该硬迁

有些 loop 在原工具里能跑，不代表值得迁到另一个工具里。

例如：

- 严重依赖某平台独有自动化入口
- 严重依赖某平台的权限模型或云环境
- 团队根本不在那个工作台里协作

这时更好的策略往往不是迁移，而是保留一个主运行面，再把结果同步到其他工具。

## 当前最实用的迁移原则

一句话总结就是：

**迁移 loop 时，迁“能力协议”，不要迁“产品皮肤”。**

能力协议包括：

- triage 规则
- state schema
- maker / checker 分工
- 节奏
- 风险边界

只要这些能保住，底层工具换了，loop 仍然是同一条 loop。

## 延伸阅读

- [五个构件与状态中枢](./02-five-primitives-and-state.md)
- [模式库与上线分级](./03-patterns-and-rollout-levels.md)
- [风险、成本与反模式](./05-risks-costs-and-anti-patterns.md)

下一篇：[05 风险、成本与反模式](./05-risks-costs-and-anti-patterns.md)
