# Codex 线程历史与 Memory：恢复任务和迁移旧 Agent 的边界

## TL;DR

Codex 的 Thread History、持久名称、Memory 和导入功能解决的是四类问题。线程历史保存可恢复的工作记录，名称帮助人找到线程，Memory 从旧工作中提炼可复用信息，Import 把受支持的外部 Agent 设置和近期会话带进 ChatGPT 桌面应用。它们互相配合，却不能互相替代。

截至 2026-07-22，App Server 的分页线程历史仍是实验性接口，Codex 本地 Memory 也被 `codex-cli 0.144.5` 标为 experimental。官方 Import 页面支持 Claude Code 和 Claude Cowork，没有列出 Cursor。Cursor 规则和聊天只能按文末的人工路径迁移，不能写成官方一键导入。

## 读者定位

本文面向已经使用 Codex CLI、IDE 或桌面应用处理多天任务的中级开发者。你需要知道 Git 工作区、`AGENTS.md` 和 `config.toml` 的用途。文中讲清状态边界与迁移方法，不把实验接口包装成稳定功能。

资料基线：2026-07-22。命令帮助在 `codex-cli 0.144.5` 上核对；产品行为来自 OpenAI 官方文档、官方仓库 App Server 协议和公开 issue。除命令帮助外，本文没有对所有界面流程做端到端复现。

## 先分清四个盒子

可以把一个长期开发任务想成搬家时的四个盒子。

聊天记录装的是过程。你问过什么，Codex 做过什么，工具返回了什么，都属于线程历史。

盒子标签是线程名称。标签方便搜索和恢复，但它不是数据库主键。App Server 文档明确说明，线程名称不要求唯一；按名称查找时，Codex 选最近更新的同名线程。

随身卡片是 Memory。它不会复制完整聊天，而是在符合条件的旧会话空闲后提炼偏好、技术栈、仓库惯例和反复出现的工作方式。

导入清单负责把另一套 Agent 的设置与近期工作映射到 Codex。它不会删除原工具的数据，也不保证每种来源都受支持。

混淆这四层会产生很具体的错误。把 Memory 当完整历史，会找不到某条命令输出。把线程恢复当环境恢复，会忽略分支、依赖和凭据已经变化。把导入当格式无损转换，会误以为所有 hook、MCP 授权和会话都能原样运行。

## Thread History 怎样恢复任务

稳定的用户入口是恢复、分叉、归档和取消归档。下面这些命令来自本机 CLI 帮助，可以直接验证：

```bash
codex resume --all
codex resume --last
codex fork --last
codex archive <SESSION_ID_OR_NAME>
codex unarchive <SESSION_ID_OR_NAME>
```

`resume` 在原线程继续追加工作。`fork` 复制已有历史并创建新线程，适合保留原决策同时探索另一条实现路径。归档只是把线程移出默认列表；`delete` 是永久删除，不能拿它当清理界面的快捷方式。

App Server 提供更细的能力。`thread/list` 可按创建时间、更新时间、最近交互时间、工作目录和搜索词分页；`thread/read` 能只读元数据；`thread/resume` 恢复后继续追加 turn。实验性的 `historyMode: "paginated"`、`thread/turns/list` 和 `thread/items/list` 把大线程拆成可分页的持久投影，客户端不必每次重建整段历史。

这套机制缓解了长线程加载成本，却没有消除上下文上限。公开 issue `#24230` 报告过长线程远程压缩触发 `context_length_exceeded`，导致恢复困难。那是特定版本的用户报告，不代表所有安装都会复现；它说明了一个可靠性边界：磁盘里有历史，不等于模型能在一次请求里重新读完全部历史。

恢复后先做状态核验，比直接说「继续」更稳：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
```

再核对未完成目标、最后一次已观察到的命令结果、待确认问题和当前验证命令。线程提供线索，工作区才是当前事实。

## 持久名称为什么不能承担身份语义

App Server 的 `thread/name/set` 可以给已加载线程或磁盘中的 rollout 设置用户可见名称。名称会持久化，也能被 CLI 的 `resume`、`archive`、`delete` 等入口使用。

名称不唯一，所以团队不要把 `release-fix` 当不可变 ID。更合适的命名带仓库、目标和日期，例如 `payments-retry-audit-20260722`。真正需要自动化定位时记录线程 UUID；名称只服务人类导航。

公开 issue `#17354` 曾报告桌面应用看不到最近历史，但对应 JSONL 仍在 `~/.codex/sessions/`。这类报告提醒我们，列表渲染、线程索引和底层 rollout 是不同层。不要看到侧栏缺项就立刻复制、改写或删除 `~/.codex`。先升级客户端、用 `codex resume --all` 检查，再备份状态目录并按官方排障路径处理。

## Memory 是召回层，不是规则层

官方文档给出的边界很清楚：ChatGPT Web 使用 ChatGPT Memory，本地 Codex 客户端使用单独的本地 Memory 存储。IDE 扩展连接哪个 Codex host，就使用哪个 host 的本地 Memory。

在支持的版本中，可用 `/memories` 控制当前会话能否读取已有 Memory，以及它是否能成为未来 Memory 的输入。Memory 文件默认位于 `~/.codex/memories/`。后台生成会跳过仍活跃或太短的会话，临近用量上限时也可能暂不运行，所以关闭聊天后看不到立刻更新是正常机制，不是必然故障。

一个可审查的实验配置如下：

```toml
[features]
memories = true

[memories]
generate_memories = true
use_memories = true
disable_on_external_context = true
```

`disable_on_external_context = true` 会把使用过 MCP、Web Search 或 Tool Search 等外部上下文的聊天排除在 Memory 生成输入之外。它降低把外部或敏感上下文固化进本地 Memory 的概率，代价是可提炼会话变少。

必须始终生效的构建命令、安全边界和提交规范应写进仓库的 `AGENTS.md` 或版本化文档。Memory 可能延迟、被关闭、被重置，也可能不适用于另一台 host。把强制规则只放 Memory，相当于把构建门禁写在一张可能没带上的便签里。

## 从 Claude Code 导入时，究竟搬了什么

ChatGPT 桌面应用的官方入口是 Settings > Import。页面当前列出 Claude Code 和 Claude Cowork。可选择的对象包括用户级与项目级指令、设置、Skills、Plugins、现有项目目录、最近 30 天聊天、MCP 配置、Hooks、Slash Commands 和 Subagents。目标会被映射为 `AGENTS.md`、`config.toml`、Codex Skills、Plugins 或 Codex agents 等对应结构。

导入不会修改或删除原 Claude 设置。它也不会替你完成外部授权。导入结束后仍需检查需要重新认证的 plugin 或 connection，并逐项核对权限。

一套风险较低的迁移顺序是：

1. 在 Git 仓库中提交或备份现有指令文件，记录当前 Claude Code 配置来源。
2. 先导入项目、指令和少量近期聊天，不要一次启用所有外部工具。
3. 打开生成的 `AGENTS.md`、`config.toml` 和 agent 文件，检查路径、命令、环境变量名与权限。
4. 重新授权 MCP 与 plugin，拒绝把密钥直接写进仓库文件。
5. 在只读或 workspace-write 沙箱中运行一个小任务，确认指令加载和工具边界。

这里不能承诺语义无损。Claude Code 的 hook 生命周期、权限模型和子代理配置与 Codex 不完全相同。导入完成只是转换结束，验证通过才算迁移完成。

## Cursor 目前只能人工迁移

OpenAI Import 页面截至资料基线没有列出 Cursor。Cursor 官方文档说明，项目规则位于 `.cursor/rules/`，旧 `.cursorrules` 已弃用；聊天历史保存在本机 SQLite，保留聊天的官方方式是导出 Markdown。Cursor CLI 自己可以 `resume` 旧线程，但那不是 Codex 线程。

因此，Cursor 迁移应拆成两件事。

规则迁移需要人工阅读 `.cursor/rules/*.mdc`，把始终适用的仓库规则改写进 `AGENTS.md`，把按任务触发的流程改成 Codex Skill。MDC 的 glob、自动附加和 Agent Requested 语义不能直接复制成普通 Markdown 后假设行为相同。

会话迁移先从 Cursor 导出 Markdown，再把它当参考资料交给新 Codex 线程，并写一份明确的恢复说明：目标、已完成工作、当前分支、未解决问题、最后验证结果。它不会成为带原始 turn、工具事件和可恢复状态的 Codex Thread History。

Cursor 的 `.cursor/mcp.json` 与 Codex 的 MCP 配置字段也不同。迁移时逐个重建 server，重新处理 OAuth 或环境变量，不要机械复制包含 token 的 JSON。

## 权衡与局限

Thread History 提高连续性，也会积累体积、旧假设和敏感工具输出。分页历史改善客户端加载，不保证模型能重新吸收全部上下文。

Memory 减少重复说明，却带来延迟与来源追踪问题。团队规范仍需版本控制。使用外部上下文的仓库可以开启排除开关，但要接受召回覆盖下降。

官方 Import 节省配置转换时间，覆盖范围受来源、版本和授权状态限制。Claude Code 当前有正式入口，Cursor 没有。把 Cursor 手工导出 Markdown 写成「会话已导入」会误导读者，因为它只迁移了可读材料，没有迁移可执行的线程状态。

任务恢复的最低验收标准不是聊天能打开，而是仓库路径、分支、HEAD、未提交改动、权限、依赖和验证命令全部重新核对。完成这些检查后，历史才从档案变回可继续工作的上下文。

## 延伸阅读

- [OpenAI：Import from another agent](https://learn.chatgpt.com/docs/import)
- [OpenAI：Memories](https://learn.chatgpt.com/docs/customization/memories)
- [OpenAI Codex App Server 协议](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [OpenAI Codex issue #17354：桌面端线程历史显示异常](https://github.com/openai/codex/issues/17354)
- [Cursor：Chat History](https://docs.cursor.com/en/agent/chat/history)
