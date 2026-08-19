# DeepSeek Harness 架构深读系列

> 不是使用教程，是架构拆解。46 篇文章把 DeepSeek Harness（`dsh`）这个开源 agent harness 从 Cordis 范式、运行时核心、能力接缝、执行子系统，到源码导读、扩展开发、工程化门禁和横向评测，逐层讲透。

本系列面向想读懂 `dsh` 源码、写插件做二次开发、或在 Claude Code / Cursor / Codex 之外评估一个"全插件化"开源 harness 的工程师与架构师。它不重复讲"AI 会写代码"，而是回答一个具体问题：**一个把"模型之外的一切"都做成可替换插件的 agent harness，内部到底是怎么运转的、它的可组合性设计代价是什么。**

截至 2026-08-14，`deepseek-ai/deepseek-harness` 处于 developer preview，官方明确会有 compatibility-breaking changes。本系列基于此时的 `master` 分支与官方文档整理，文中的判断是架构分析的总结，不是官方功能承诺。涉及具体代码路径或事件签名时，以仓库实际版本为准。

## 系列定位

`dsh` 的核心不是"又一个大模型客户端"，而是一组被刻意设计成可替换的子系统。理解它的关键不是记住命令，而是建立三层认知：

- **Cordis 范式**：插件贡献服务、类型化事件和**可逆副作用**到一个共享 context；挂载一个插件就扩展能力，卸载时所有注册按序撤销。这是整个项目的认知前提。
- **能力接缝（Capability Seams）**：模型适配、文件系统、命令执行、沙箱、子 agent……每一项都是一个"定义 + 提供者 + 消费者"三角色的可换接缝。换一个 provider 等于换了整个产品。
- **运行时不变量**："模型可见即可重建"——任何到达模型请求的东西都必须能从会话日志重建，运行时会断言这条规矩。

这三层决定了为什么 `dsh` 值得用 46 篇来拆，也决定了本系列的阅读顺序：先 Cordis（地基），再运行时核心（心脏），再接缝与工具（扩展模型），最后是子系统深潜、源码导读和评测。

## 与《Harness Engineering》系列的关系

本仓库另有 [`harness-engineering/`](../harness-engineering/) 总论系列，讲的是 **harness engineering 这门学科**——`Agent = Model + Harness` 的心智模型、agent harness 与 eval harness 两条主线、inner/outer harness、context engineering、ACI 接口设计。那套是"学科通论"。

本系列是**具体项目拆解**：把通论里的理念，放进 `dsh` 这个真实仓库里一行行验证。它假设你已经理解 harness 是什么（若没有，先读 [`harness-engineering/01`](../harness-engineering/01-what-is-harness-engineering.md)），然后专注讲 `dsh` 怎么把"一切皆插件"落地。两套互补，不重叠。

## 阅读路径

如果只想快速建立认知，按这条主干读（10 篇）：

1. 先读 01-02，知道 `dsh` 是什么、怎么跑起来。
2. 再读 03，过 Cordis 这道认知门槛——这是后面所有篇的前提。
3. 接着读 07、09、11，理解一次对话在内部怎么流转。
4. 然后读 12（能力接缝）和 13（工具管线），这是 `dsh` 区别于"写死 agent"的核心设计。
5. 收尾读 48-49，建立横向判断。

如果想做二次开发，主干之后补 06、10、14、16（四篇源码导读）和 18（写一个 LLM 适配器）。如果关心生产落地，补 19（安全）、35-36（配置与可观测）、42（容错）。

## 篇型说明

- 📘 **概念**：讲清一个机制或设计决策（29 篇）。
- 🔍 **源码导读**：配对概念篇，带你读对应包的实现（4 篇）。
- 🛠 **实战**：hands-on，跑起来或亲手扩展（6 篇）。
- 📊 **评测 / 总结**：横向对比与工程哲学（3 篇）。

## 系列目录

> 本系列共 46 篇，全部已发布。

### 第一部分：开场（2 篇）

| # | 文章 | 重点 |
|---|------|------|
| 01 | [模型 + Harness = Agent：DeepSeek Harness 是什么](./01-model-plus-harness-what-is-dsh.md) | `dsh` 的项目定位、在 harness 谱系里的独特位置、"一切皆插件"的开场 |
| 02 | [从 0 跑起来：first run 全流程](./02-first-run-web-ui.md) | 启动 Web UI、配模型、选 workspace、跑第一个任务 |

### 第二部分：Cordis 范式与启动装配（3 篇）

| # | 文章 | 重点 |
|---|------|------|
| 03 | [从一篇论文到一棵插件树：Cordis 怎么撑起 DeepSeek Harness 的"一切皆插件"](./03-cordis-and-plugin-composition.md) | 论文两轴、五大范式（第五条是灵魂）、profile/bundle 拼装、`--dump-config` |
| 06 | [🔍 启动链源码导读：从 `npx dsh web` 到插件树挂载](./06-boot-chain-source-walkthrough.md) | app-boot / loader / cordis.yml 加载全链路（#03 的实现） |

### 第三部分：运行时核心——一次对话的流转（4 篇）

| # | 文章 | 重点 |
|---|------|------|
| 07 | [Turn 与 Step：一次对话在 agent-loop 驱动器里的完整流转](./07-turn-and-step-agent-loop.md) | step/turn 定义、事件骨架、inbox/pre-step 守门人、三态驱动器源码：kick→turn→step、deriveMessages、工具调度 |
| 09 | [会话日志：为什么"模型可见即可重建"是最硬的规矩](./09-session-log-visible-means-reconstructable.md) | deriveMessages、durable/live 事件、不变量断言、fork/resume |
| 10 | [🔍 session 包源码导读：append-only log / fork / resume](./10-session-package-source-walkthrough.md) | 会话日志的实现细节，fork/resume 怎么落地（#09 的实现） |
| 11 | [事件系统：四种派发模式与 waterfall 的短路艺术](./11-event-system-four-dispatch-modes.md) | emit/waterfall/parallel/serial、around 中间件、策略短路 |

### 第四部分：扩展模型与工具（4 篇）

| # | 文章 | 重点 |
|---|------|------|
| 12 | [能力接缝 Capability Seams：换一个 provider 等于换整个产品](./12-capability-seams-swap-provider-swap-product.md) | 三角色模型、执行世界共享、逐 seam 拆解 ★ |
| 13 | [工具执行管线：从 tool_call 到结果中间发生什么](./13-tool-execution-pipeline.md) | 七层关卡、单调守卫、approval、Code Mode |
| 14 | [🔍 tools 注册表与守卫管线源码导读](./14-tools-registry-guards-source-walkthrough.md) | tools 包内部：注册、守卫、around dispatch、finalizeContent（#13 的实现） |
| 15 | [系统提示组装与动态 Cordis](./15-system-prompt-assembly-and-dynamic-cordis.md) | prompt section 组装、typert/apiProxy、自指插件树修改 |

### 第五部分：模型适配与多模态（3 篇）

| # | 文章 | 重点 |
|---|------|------|
| 16 | [🔍 LLM 适配器抽象与 stream 契约源码导读](./16-llm-adapter-stream-contract-source-walkthrough.md) | stream/chunk/finish 契约、normalize、replay adapter |
| 17 | [多模态与 Attachment：agent 怎么"看图"](./17-multimodal-attachments.md) | ctx.attachments、provider-native content 解析 |
| 18 | [🛠 写一个 LLM 适配器：接 OpenAI 兼容模型](./18-write-an-llm-adapter.md) | adding-an-llm-adapter 实操 |

### 第六部分：执行能力深潜（7 篇）

| # | 文章 | 重点 |
|---|------|------|
| 19 | [沙箱、审批与权限三件套：agent 如何安全地动你的机器](./19-sandbox-approval-permission.md) | sandboxPolicy 单一来源、approval 失败关闭、permission presets |
| 20 | [Filesystem 接缝：fs-local / fs-sandbox / 观察策略](./20-filesystem-seam.md) | 读写编辑走 ctx.fs、按共享 sandbox mode 围栏、read-before-edit |
| 21 | [Shell / Subprocess / Terminal：命令执行的三层抽象](./21-shell-subprocess-terminal.md) | 底层坐标 / bash 执行器 / 持久 PTY 的关系与取舍 |
| 22 | [LSP 接缝：让 agent 真正"懂"代码导航](./22-lsp-code-navigation.md) | 四个归一化操作、无协议逃生舱、lsp-local 翻译 |
| 23 | [Code Runtime 与 Code Mode：模型写代码并执行](./23-code-runtime-and-code-mode.md) | ctx.codeRuntime + worker、run_code 传输、子调用走工具管线 |
| 24 | [Jobs 与 Workflow：后台任务、Ralph 与工作流编排](./24-jobs-and-workflow-ralph.md) | ctx.jobs 注册表、workflow engine、Ralph 结构化输出 |
| 25 | [Web 搜索抓取与 Skills 技能系统](./25-web-search-fetch-and-skills.md) | ctx.web 统一多 provider、ctx.skills 按需加载技能体 |

### 第七部分：上下文、记忆与规划（6 篇）

| # | 文章 | 重点 |
|---|------|------|
| 26 | [上下文压缩 Compaction：对话太长怎么给模型腾地方](./26-compaction-context-compression.md) | 无 compact 工具、事件触发、先修剪后摘要 |
| 27 | [Spill 溢出存储：超大工具结果去哪了](./27-spill-overflow-storage.md) | ctx.spillStore + spill-policy、定位符与检索提示 |
| 28 | [跨会话记忆：session-query / projection / reference](./28-cross-session-memory-query-projection-reference.md) | 全文检索、状态驱动投影 fold、冷读阶梯缓存 |
| 29 | [Plan Mode 与 Goal：agent 怎么管理目标和计划](./29-plan-mode-and-goal.md) | turn 边界 flush、/plan 命令、目标态 fold |
| 30 | [子 Agent 与多智能体：一个 agent 怎么调度另一个 agent](./30-subagents-multi-agent.md) | 六种 subagent provider、一次式与可继续委派 |
| 31 | [web-schedule：定时、提醒与 session 内自动化](./31-web-schedule-timer-automation.md) | 持久 session-local 提醒、绝对时间权威、冷热恢复 |

### 第八部分：协议与自指（3 篇）

| # | 文章 | 重点 |
|---|------|------|
| 32 | [MCP 协议在 dsh 中的位置 + mcp-memory 拆解](./32-mcp-in-dsh-and-mcp-memory.md) | dsh 怎么消费 MCP server、记忆服务器接入 |
| 33 | [ACP 协议与 acp-agent：agent 间的"通话标准"](./33-acp-protocol-acp-agent.md) | Agent Client Protocol、会话/权限/取消支持 |
| 34 | [web-cordis：会自己改插件树的自指 agent](./34-web-cordis-self-referential-agent.md) | 自指 demo、运行时修改 Cordis 树 |

### 第九部分：配置、可观测与调试（5 篇）

| # | 文章 | 重点 |
|---|------|------|
| 35 | [配置、凭证与存储三件套](./35-settings-credentials-storage.md) | settings 分层、credentials 每次解析、storage(json/sqlite) |
| 36 | [Telemetry 与可观测性：给 agent 接上 OTel 监控](./36-telemetry-observability.md) | ctx.sessionTelemetry、捕获/脱敏/上报 |
| 37 | [🛠 配置实战：用 patch 改行为 + 自定义 preset](./37-config-practice-patch-and-preset.md) | 改一行配置换掉整个子系统 |
| 38 | [🛠 排查与调试实战](./38-debugging-and-troubleshooting.md) | dump-config、invariants、telemetry 排查问题 |
| 39 | [🛠 写一个 Conversation Node（Web 自定义渲染）](./39-write-a-conversation-node.md) | ConversationNodeDefinition + keyed renderer |

### 第十部分：自动化集成与客户端（2 篇）

| # | 文章 | 重点 |
|---|------|------|
| 40 | [Python SDK、Headless 与 JSON-RPC：把 dsh 编进流水线](./40-python-sdk-headless-jsonrpc.md) | sdk/sdk-runtime、headless 一次性、benchmark 隔离 |
| 41 | [Web 客户端、Chat Nodes 与多 agent 协议](./41-web-client-chat-nodes-multi-agent-protocol.md) | clientModules 增量扫描、HMR、协议接入 |

### 第十一部分：容错、测试与性能（3 篇）

| # | 文章 | 重点 |
|---|------|------|
| 42 | [错误处理与容错哲学：一个 agent harness 怎么不崩](./42-error-handling-fault-tolerance-philosophy.md) | defensive patterns、request-error 恢复、dispose 到 quiescence |
| 43 | [测试体系：怎么测一个 agent harness](./43-testing-how-to-test-an-agent-harness.md) | fixture、replay、世界验证、资源所有权 |
| 44 | [性能与压测](./44-performance-and-stress-test.md) | Web 端 perf / stress 配置与指标 |

### 第十二部分：repo 工程硬核（2 篇）

| # | 文章 | 重点 |
|---|------|------|
| 45 | [文档即代码：用脚本自动生成图、目录和校验](./45-docs-as-code-autogen-graphs-catalogs.md) | 80+ 脚本、gen-doc-graphs、catalog 自动生成、verify-* 门禁 |
| 46 | [i18n 翻译配对与质量门禁：中英双语文档怎么不腐烂](./46-i18n-translation-pairing-and-quality-gates.md) | translation-pairing、doc-budgets、lefthook + oxlint |

### 第十三部分：评测与总结（3 篇）

| # | 文章 | 重点 |
|---|------|------|
| 47 | [Cordis 生态溯源：Koishi 与插件框架谱系](./47-cordis-lineage-koishi-plugin-framework-genealogy.md) | Cordis 从哪来、与同类框架的对比 |
| 48 | [架构横评：dsh vs Claude Code vs Cursor vs Codex](./48-architecture-comparison-dsh-vs-claude-code-cursor-codex.md) | 开源全插件化 vs 封闭、seam 抽象的代价 |
| 49 | [可组合性的工程哲学：DeepSeek Harness 给 Agent 时代留下什么](./49-engineering-philosophy-of-composability.md) | 时空可组合性落地、给跟进者的建议、系列总结 |

## 取舍说明

- **不写成使用手册**。`dsh` 是开源框架，用户文档官方已经完备；本系列的增量在架构拆解和源码理解，不在重复"怎么点按钮"。
- **源码导读与概念篇配对**。09→10、13→14、03→06、16 四组，讲完机制立刻看实现，避免概念悬空（07 已把 turn/step 概念与 agent-loop 源码合为一篇）。
- **安全深水区按需展开**。Landlock 原生沙箱、E2B 远程沙箱、凭证密钥的细节分散在 19、20、35 三篇，不单开独立专题；若后续需要可随时插篇。
- **保持时点诚实**。`dsh` 在 developer preview 阶段，事件签名、配置项、包结构会随版本变。本系列标注写作时点，涉及具体签名时以仓库实际版本为准。

## 延伸阅读

- [DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)
- [官方架构文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [Cordis 框架](https://github.com/cordiverse/cordis) 与 [《A Programming Paradigm for Spatiotemporal Composability》论文](https://github.com/cordiverse/paper)
- [Harness Engineering 是什么](../harness-engineering/01-what-is-harness-engineering.md) —— 本仓库的 harness 学科总论，建议先读
- [Codex 工程化实战系列](../codex-engineering/README.md) —— 对照一个封闭 inner harness 的工程实践
