# DeepSeek Harness 架构深读系列

> 不是使用教程，是架构拆解。48 篇文章把 DeepSeek Harness（`dsh`）这个开源 agent harness 从 Cordis 范式、运行时核心、能力接缝、执行子系统，到源码导读、扩展开发、工程化门禁、横向评测和基座实战，逐层讲透。

本系列面向想读懂 `dsh` 源码、写插件做二次开发、或在 Claude Code / Cursor / Codex 之外评估一个"全插件化"开源 harness 的工程师与架构师。它不重复讲"AI 会写代码"，而是回答一个具体问题：**一个把"模型之外的一切"都做成可替换插件的 agent harness，内部到底是怎么运转的、它的可组合性设计代价是什么。**

## 系列定位

`dsh` 的核心不是"又一个大模型客户端"，而是一组被刻意设计成可替换的子系统。理解它的关键不是记住命令，而是建立三层认知：

- **Cordis 范式**：插件贡献服务、类型化事件和**可逆副作用**到一个共享 context；挂载一个插件就扩展能力，卸载时所有注册按序撤销。这是整个项目的认知前提。
- **能力接缝（Capability Seams）**：模型适配、文件系统、命令执行、沙箱、子 agent……每一项都是一个"定义 + 提供者 + 消费者"三角色的可换接缝。换一个 provider 等于换了整个产品。
- **运行时不变量**："模型可见即可重建"——任何到达模型请求的东西都必须能从会话日志重建，运行时会断言这条规矩。

这三层决定了为什么 `dsh` 值得用 48 篇来拆，也决定了本系列的阅读顺序：先 Cordis（地基），再运行时核心（心脏），再接缝与工具（扩展模型），最后是子系统深潜、源码导读和评测。

## 与《Harness Engineering》系列的关系

本仓库另有 [`harness-engineering/`](../harness-engineering/) 总论系列，讲的是 **harness engineering 这门学科**——`Agent = Model + Harness` 的心智模型、agent harness 与 eval harness 两条主线、inner/outer harness、context engineering、ACI 接口设计。那套是"学科通论"。

本系列是**具体项目拆解**：把通论里的理念，放进 `dsh` 这个真实仓库里一行行验证。它假设你已经理解 harness 是什么（若没有，先读 [`harness-engineering/01`](../harness-engineering/01-what-is-harness-engineering.md)），然后专注讲 `dsh` 怎么把"一切皆插件"落地。两套互补，不重叠。

## 阅读路径

如果只想快速建立认知，按这条主干读（9 篇）：

1. 先读 01-02，知道 `dsh` 是什么、怎么跑起来。
2. 再读 03，过 Cordis 这道认知门槛——这是后面所有篇的前提。
3. 接着读 07、09、11，理解一次对话在内部怎么流转。
4. 然后读 12（能力接缝）和 13（工具管线），这是 `dsh` 区别于"写死 agent"的核心设计。
5. 收尾读 48（横评与哲学合为一篇），建立横向判断。

如果想做二次开发，主干之后补 06（启动链源码导读，09 已含 session 包源码）、16（LLM stream 契约）和 56（profile 与 bundle 分层）。如果关心生产落地，补 19（安全）、35-36（配置与可观测）、42（容错）。

## 篇型说明

- 📘 **概念**：讲清一个机制或设计决策。
- 🔍 **源码导读**：配对概念篇，带你读对应包的实现（06；07、09 已把概念与对应源码合为一篇）。
- 🛠 **实战**：hands-on，跑起来或亲手扩展。
- 📊 **评测 / 总结**：横向对比与工程哲学（48 已把横评与哲学收束为一篇）。

## 系列目录

> 本系列共 48 篇，全部已发布。目录按 11 个章节 + 终章组织；每篇文章仍保留独立发布单元，章节用于给读者提供更清晰的阅读路径。内容基线：官方 v0.1.7-rc.2（2026-09-24）及当期 master；涉及 2026-09 中旬重组（examples 目录移除、E2B 换 SSH、profile 体系落地）前的历史事实，各篇在正文里就地标注。

### 第 1 章：DeepSeek Harness 是什么，以及怎么第一次跑起来（2 篇）

| # | 文章 | 重点 |
|---|------|------|
| 01 | [模型 + Harness = Agent：DeepSeek Harness 是什么](./01-model-plus-harness-what-is-dsh.md) | `dsh` 的项目定位、在 harness 谱系里的独特位置、"一切皆插件"的开场 |
| 02 | [从 0 跑起来：first run 全流程](./02-first-run-web-ui.md) | 启动 Web UI、配模型、选 workspace、跑第一个任务 |

### 第 2 章：Cordis 与插件树：一切皆插件如何落地（4 篇）

| # | 文章 | 重点 |
|---|------|------|
| 03 | [从一篇论文到一棵插件树：Cordis 怎么撑起 DeepSeek Harness 的"一切皆插件"](./03-cordis-and-plugin-composition.md) | 论文两轴、五大范式（第五条是灵魂）、profile/bundle 拼装、`--dump-config` |
| 06 | [🔍 dsh 启动链源码导读：从 npx 命令到挂载完毕的插件树](./06-boot-chain-source-walkthrough.md) | app-boot / loader / cordis.yml 加载全链路（#03 的实现） |
| 47 | [dsh 的 Cordis 谱系：从 Koishi 插件框架到这个 harness](./47-cordis-lineage-koishi-plugin-framework-genealogy.md) | Cordis 从哪来、为什么 vendor、18 处本地修改、与同类插件框架的对比 |
| 56 | [dsh 的 Profile 与 Bundle 分层：一棵插件树长出五个入口](./56-profile-and-bundle-layering.md) | dsh-base 共享核心、模式束覆盖、sdk-minimal 独立树、三条分层纪律 |

### 第 3 章：一次对话如何流转：Turn、Step、Session Log 与事件系统（3 篇）

| # | 文章 | 重点 |
|---|------|------|
| 07 | [Turn 与 Step：dsh 的 agent-loop 怎么流转一次对话](./07-turn-and-step-agent-loop.md) | step/turn 定义、事件骨架、inbox/pre-step 守门人、三态驱动器源码：kick→turn→step、deriveMessages、工具调度 |
| 09 | [会话日志：dsh 为什么坚守"模型可见即可重建"（含 session 包源码导读）](./09-session-log-visible-means-reconstructable.md) | deriveMessages、durable/live 事件、不变量断言、fork/resume；append 两道关、SurfaceManager、崩溃修复源码 |
| 11 | [事件系统：dsh 的四种派发模式与 waterfall 短路](./11-event-system-four-dispatch-modes.md) | emit/waterfall/parallel/serial、around 中间件、策略短路 |

### 第 4 章：能力接缝：模型如何使用可替换的工具和上下文（3 篇）

| # | 文章 | 重点 |
|---|------|------|
| 12 | [能力接缝：dsh 换一个 provider 等于换整个产品](./12-capability-seams-swap-provider-swap-product.md) | 三角色模型、执行世界共享、逐 seam 拆解 ★ |
| 13 | [工具执行管线与守卫：dsh 从 tool_call 到结果的七道关卡](./13-tool-execution-pipeline-and-guards.md) | 七层关卡、单调守卫、approval、并发调度、Code Mode |
| 15 | [系统提示组装与动态 Cordis：dsh 让 agent 改自己的插件树](./15-system-prompt-assembly-and-dynamic-cordis.md) | prompt section 组装、动态 cordis 包与 fiber 撤销、请求头变更落日志 |

### 第 5 章：模型适配：Stream 契约与多模态（2 篇）

| # | 文章 | 重点 |
|---|------|------|
| 16 | [dsh 的 LLM 适配器与 stream 契约：把 provider 差异关在适配器一层](./16-llm-adapter-stream-contract-source-walkthrough.md) | 封闭流式契约、差异吸收、失败归一、重放 |
| 17 | [dsh 的多模态附件：模型看到的图是派生出来的](./17-multimodal-attachments.md) | 图片准入与规范化、模态门控、请求版本派生、DeepSeek Files API 投递与请求级降级 |

### 第 6 章：执行世界：agent 如何安全地读写、运行、导航和联网（10 篇）

| # | 文章 | 重点 |
|---|------|------|
| 19 | [dsh 的沙箱、审批与权限：怎么把 agent 安全地放上台真机](./19-sandbox-approval-permission.md) | sandboxPolicy 单一来源、子代理审批钉定 never、升级阶梯 bash+fs 共享、approval 失败关闭 |
| 20 | [dsh 的 Filesystem 接缝：读写编辑与观察策略](./20-filesystem-seam.md) | 读写编辑走 ctx.fs、按共享 sandbox mode 围栏、read-before-edit |
| 21 | [dsh 命令执行三层：Subprocess / Shell / Terminal](./21-shell-subprocess-terminal.md) | 底层坐标 / bash 执行器 / 持久 PTY 的关系与取舍 |
| 22 | [dsh 的 LSP 接缝：让 agent 真正"懂"代码](./22-lsp-code-navigation.md) | 四个归一化操作、stdio provider 按工作区池化、能力逐操作检查、lsp-local 翻译 |
| 23 | [dsh 的 Code Runtime 与 Code Mode：让模型写代码并执行](./23-code-runtime-and-code-mode.md) | ctx.codeRuntime + worker、run_code 传输、子调用原生并发、子调用日志纳入 spill |
| 24 | [dsh 的 Jobs 与 Workflow：后台任务和编排脚本](./24-jobs-and-workflow-ralph.md) | ctx.jobs 注册表、workflow engine、Ralph 结构化输出与默认禁用 |
| 25 | [dsh 的 Web 搜索抓取与 Skills 技能系统](./25-web-search-fetch-and-skills.md) | ctx.web 统一多 provider、ctx.skills 按需加载技能体 |
| 57 | [dsh 的浏览器与 Computer Use：agent 的第三种执行世界](./57-browser-use-and-computer-use.md) | 只存名字的注册表、三后端一接缝、Session 所有权、截图走持久附件 |
| 59 | [dsh 的 SSH 远程工作区：一次补丁搬走整个执行世界](./59-ssh-remote-workspace.md) | ctx.ssh 连接主人、三 provider 共享连接、摘要钉死、断线不重连不重放 |
| 60 | [dsh 的跨平台沙箱原语：bwrap、Landlock、Seatbelt 与 Windows ACL](./60-cross-platform-sandbox-primitives.md) | 平台候选链、full/partial 强制力申报、拒绝与运行器故障两套方言 |

### 第 7 章：从短对话到长期 Agent：上下文、记忆、计划与多智能体（7 篇）

| # | 文章 | 重点 |
|---|------|------|
| 26 | [dsh 的上下文预算：Compaction 压缩与 Spill 溢出](./26-context-budget-compaction-and-spill.md) | 无 compact 工具、事件触发、先修剪后摘要、KV 缓存复用、ctx.spillStore 定位符与检索提示 |
| 28 | [dsh 的跨会话记忆：session-query / projection / reference](./28-cross-session-memory-query-projection-reference.md) | 全文检索、状态驱动投影 fold、冷读阶梯缓存 |
| 29 | [dsh 的 Plan Mode 与 Goal：一段软引导与一个事件溯源的生命周期](./29-plan-mode-and-goal.md) | turn 边界 flush、goal 栈与模型工具、plan 投影 stateVersion 2 |
| 30 | [dsh 的子 Agent 与多智能体：怎么调度另一个 agent](./30-subagents-multi-agent.md) | 六种 subagent provider、并行委派与后台优先、审批钉定 never、实验性 Agent Teams |
| 31 | [dsh 的 web-schedule：会话内的定时、提醒与自动化](./31-web-schedule-timer-automation.md) | schedule/change v1 事件流、至少一次交付、绝对时间权威、冷热恢复 |
| 55 | [dsh 子代理模型路由：授权-选择-执行三层](./55-dsh-subagent-model-routing.md) | 精确路由白名单、会话级快照、执行器复核；能力门显式拒绝、fork 因 KV 缓存禁用选择 |
| 58 | [dsh 的 Agent Teams：mailbox、任务板与同级协作](./58-agent-teams-mailbox-task-board.md) | 隐式 Lead、排队减已投递的持久邮箱、CAS 任务板、四条设计承诺 |

### 第 8 章：协议与客户端：MCP、ACP、Headless、Web Client 与自指 Agent（6 篇）

| # | 文章 | 重点 |
|---|------|------|
| 32 | [dsh 的 MCP 客户端与记忆服务器接入手册：通用协议在 harness 里的位置](./32-mcp-in-dsh-and-mcp-memory.md) | 自动重连与稳定窗口、KV cache 前缀稳定、记忆服务器接入 |
| 33 | [dsh 的 ACP 协议与 acp-agent：agent 通话标准怎么落地](./33-acp-protocol-acp-agent.md) | Agent Client Protocol、会话/权限/取消语义、acp-agent 组合面 |
| 34 | [dsh 的 web-cordis：会改自己插件树的 agent](./34-web-cordis-self-referential-agent.md) | 四包家族、白名单门面、host.call RPC、面板全局性 |
| 39 | [🛠 dsh 的 Conversation Node：给 Web 写一个自定义渲染节点](./39-write-a-conversation-node.md) | ConversationNodeDefinition + keyed renderer、投影状态边界 |
| 40 | [dsh 的 Python SDK、Headless 与 JSON-RPC：把 agent 编进流水线](./40-python-sdk-headless-jsonrpc.md) | sdk/sdk-runtime 三平台 wheel、headless 一次性、benchmark 隔离 |
| 41 | [dsh 的 Web 客户端：Chat Nodes 与多 agent 协议](./41-web-client-chat-nodes-multi-agent-protocol.md) | clientModules 增量扫描、双 WebSocket 下行、HMR、协议接入 |

### 第 9 章：生产化工程：状态、配置、可观测、调试、容错、测试与性能（7 篇）

| # | 文章 | 重点 |
|---|------|------|
| 35 | [dsh 的配置、凭证与存储：有状态底座三件套](./35-settings-credentials-storage.md) | settings 分层、credentials 版本化与两分区、dsh-authorization 接缝、storage(json/sqlite) |
| 36 | [dsh 的 Telemetry 可观测性：怎么接 OTel 监控](./36-telemetry-observability.md) | 默认关闭与三个环境变量、ctx.sessionTelemetry、捕获/脱敏/上报 |
| 37 | [🛠 dsh 的配置实战：用 patch 改行为，用 preset 做分发组合](./37-config-practice-patch-and-preset.md) | 四个随附 preset、plugin add/remove 层栈自动维护、profiles 解析链 |
| 38 | [🛠 dsh 的排查与调试：全插件化 harness 怎么追问题](./38-debugging-and-troubleshooting.md) | dump-config、invariants、telemetry 三模式、llm/retry 事件 |
| 42 | [dsh 的错误处理与容错：这个 harness 怎么不崩](./42-error-handling-fault-tolerance-philosophy.md) | 结构化错误分类学、defensive patterns、dispose 到 quiescence、postmortem 文化 |
| 43 | [dsh 的测试体系与性能压测：怎么测一个 agent harness](./43-testing-how-to-test-an-agent-harness.md) | 五层测试、with-key 真实 API、llm-mock-server 故障注入、fast-check 属性测试、Web 压测 lane |
| 61 | [dsh 的 Inspector：给运行中的插件树配一个 DevTools](./61-inspector-devtools-for-plugin-tree.md) | Worker 收全部 CDP 状态、快照投影、Elements 里的 Cordis 树、只绑回环 |

### 第 10 章：文档即代码：自动生成、校验与双语质量门禁（2 篇）

| # | 文章 | 重点 |
|---|------|------|
| 45 | [dsh 的文档即代码：脚本生成图、目录与校验门禁](./45-docs-as-code-autogen-graphs-catalogs.md) | 128 个脚本入口、gen/verify 同源、graph-atlas 三档图、type-equiv 逐符号比对 |
| 46 | [dsh 的 i18n 翻译配对与质量门禁：双语文档怎么不腐烂](./46-i18n-translation-pairing-and-quality-gates.md) | translation-pairing、doc-budgets、translation-prompt 双向渲染、lefthook 门禁 |

### 第 11 章：把 dsh 当基座：实战与生态（1 篇）

| # | 文章 | 重点 |
|---|------|------|
| 49 | [dsh 当基座：能力审计与三条红线](./49-dsh-as-base-capability-audit.md) | 五个进入面、三块能力底座、三条红线；单用户产品可盖，多用户需自包服务层 |

### 终章：dsh 的位置：架构横评与可组合性的工程哲学（1 篇）

| # | 文章 | 重点 |
|---|------|------|
| 48 | [dsh 与 Claude Code、Cursor、Codex 的架构横评](./48-architecture-comparison-dsh-vs-claude-code-cursor-codex.md) | 多维横评、开源全插件化 vs 封闭、工程经验、给跟进者的建议、系列总结 |

## 取舍说明

- **不写成使用手册**。`dsh` 是开源框架，用户文档官方已经完备；本系列的增量在架构拆解和源码理解，不在重复"怎么点按钮"。
- **源码导读与概念篇配对**。03→06 一组保持"概念 + 源码导读"各自成篇，16 讲 LLM stream 契约与 provider 差异吸收；07（turn/step + agent-loop 源码）、09（会话日志 + session 包源码）、13（工具管线 + 守卫与注册设计）、43（测试政策 + 性能压测）已合为一篇，讲完机制立刻看实现，避免概念悬空。
- **安全深水区分层展开**。Landlock、Seatbelt、Windows ACL 的沙箱原语单开 60 篇，SSH 远程工作区单开 59 篇；凭证密钥的细节在 35 篇。早期的 E2B 远程沙箱已被官方在 0.1.6 移除，涉及它的例子都改写为 SSH 家族并就地标注。

## 延伸阅读

- [DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)
- [官方架构文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [Cordis 框架](https://github.com/cordiverse/cordis) 与 [《A Programming Paradigm for Spatiotemporal Composability》论文](https://github.com/cordiverse/paper)
- [Harness Engineering 是什么](../harness-engineering/01-what-is-harness-engineering.md) —— 本仓库的 harness 学科总论，建议先读
- [Codex 工程化实战系列](../codex-engineering/README.md) —— 对照一个封闭 inner harness 的工程实践
