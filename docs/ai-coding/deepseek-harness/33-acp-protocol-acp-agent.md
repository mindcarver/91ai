# ACP 协议与 acp-agent：让 agent 之间能通话的标准

> 如果你只能从这篇带走一句话，带走这句：MCP 解决的是 agent 怎么接外部工具，ACP 解决的是 agent 怎么被另一个程序（或另一个 agent）驱动；`dsh` 同时是 ACP 的服务端和客户端，用同一条 JSON-RPC 线让 agent 变成可编程的自动化单元。
> 这一篇拆 `@deepseek-ai/dsh-acp` 这个自动化传输适配器，以及 `examples/acp-agent` 示例如何把一个可运行的 ACP server 组合起来。

## 先分清：MCP 和 ACP 解决的不是同一个问题

这两个协议名字像，范畴不同，混在一起会越读越糊涂。

**MCP（Model Context Protocol）** 解决的是 agent 怎么接外部能力。它的方向是"agent 向外要工具和数据"：一个 MCP 服务器暴露 tools、resources、prompts，agent 作为客户端去消费。目标是让工具生态可复用。

**ACP（Agent Client Protocol）** 解决的是 agent 怎么被外部驱动。它的方向是"外部程序向 agent 发任务、收结果"：一个 ACP 服务器封装了一个或多个 agent，外部客户端（编辑器、另一个 agent、CI 脚本）通过协议创建会话、发提示、拿回复。目标是让 agent 本身变成一个可调用的服务。

ACP 由 Zed 编辑器团队在 2025 年 8 月推出，社区把它叫做"AI 编码 agent 的 LSP"。LSP 让任何语言服务器能接任何编辑器，ACP 让任何编码 agent 能接任何客户端。它用 JSON-RPC 2.0，在 stdio 上传输换行分隔的消息。

一个类比：MCP 是"agent 的 USB 接口"（外设标准），ACP 是"agent 的 HTTP API"（服务标准）。`dsh` 两个都实现了。

## dsh 在 ACP 里扮演两个角色

理解 `dsh` 的 ACP 实现，先要看清它站在协议的哪一侧。答案是：两侧都站。

**服务端**（`@deepseek-ai/dsh-acp`）：`dsh` 可以把自己暴露为一个 ACP 服务器。外部客户端连上来，创建会话、发提示、收回复、取消工作。这让 `dsh` 的 agent 能被任何 ACP 兼容的客户端驱动，不限于 `dsh` 自己的 Web UI。

**客户端**（`@deepseek-ai/dsh-subagent-acp`）：`dsh` 的 agent 可以通过子 agent 机制，spawn 一个外部 ACP 服务器作为自己的子 agent。父 agent 把任务交给子 agent，子 agent 在独立的进程或沙箱里干活，完成后把结果交回来。

两侧用同一条协议线，意味着 `dsh` 的 agent 可以嵌套：一个 `dsh` agent 通过 ACP 调用另一个 `dsh` agent（或任何 ACP 兼容 agent，比如 Codex）作为子 agent。这是 `dsh` 多 agent 协作的基础设施。

本文聚焦服务端。客户端的细节在子 agent 的接缝设计里。

## dsh-acp：一个刻意做窄的自动化传输层

`dsh-acp` 的 README 第一句话给自己定了性：

> Automation-only Agent Client Protocol server over JSON-RPC stdio.

关键词是 **automation-only**（仅自动化）。这个包不是 UI 集成，不是能力接缝，而是一个**传输适配器**。它的职责是把 `dsh` 的 agent 能力翻译成 ACP 协议消息，仅此而已。

它**不暴露**的东西，和它暴露的东西一样重要：不暴露编辑器导航、对话回放、命令面板、模式切换、配置选择、elicitation（交互式表单）、reasoning（推理过程）、plans（计划）、titles（标题）、工具呈现。这些都是 Web host 和 client modules 的活，不是自动化传输的活。

源码里 `apply()` 函数做三件事：在 stdin/stdout 上打开一个 `AgentSideConnection`，注册 ACP 方法处理器，用 `ctx.agents` 驱动 agent 的创建和销毁。stdout 被协议帧独占，所以这个包不安装任何 stdout 日志器，诊断信息只能走 stderr。

## 协议方法：会话的一生

ACP 的核心是会话（session）。一个外部客户端通过 ACP 操作 `dsh` agent 的完整生命周期如下。

**`initialize`**：握手。协商协议版本，声明能力。`dsh-acp` 声明的 prompt 能力是 baseline-only：不支持 image、audio、embeddedContext。不声明 session、editor、terminal、filesystem、MCP 能力。不声明认证方法。这个握手很诚实：我只做自动化文本对话，别的别找我。

**`session/new`**：创建一个全新的 agent。需要一个绝对路径的 `cwd`（工作目录）。`additionalDirectories` 和 `mcpServers` 如果非空会被拒绝。换句话说，每个 ACP 会话拿到的是一个干净的 agent，挂在一个明确的工作目录上，不带额外目录，不带 MCP 服务器。

**`session/prompt`**：发一条提示。文本块被拼接成一条用户消息，resource link 被渲染成方括号文本引用。空提示或超出 baseline 的内容（图片、音频）被拒绝。每个会话同一时间只允许一个 in-flight 请求。调用会阻塞，直到整个 agent 变空闲（idle）才返回。

这里有个微妙的设计：prompt 的 `stopReason` 不直接对应单个 turn 的结果。`dsh` 的一个 prompt 可能触发多个 turn（模型多步思考、调用工具），ACP 的 `session/prompt` 等整个 agent 空闲后才返回。正常的平静退出报 `end_turn`；显式取消或被丢弃的 prompt 报 `cancelled`；token 上限的 turn 结束也报 `end_turn`（不报成特殊停止原因），只有相关 turn 上的模型错误才会立即拒绝 prompt。

**`session/cancel`**：取消指定会话的工作。只取消目标 agent，把它的 pending prompt 结算为 `cancelled`。未知的 session id 是空操作。

**`session/update`**：服务端通知。每当一个 committed 的 assistant/message 产生非空文本块，发一个 `agent_message_chunk`。注意是 committed message，不是 raw delta。这意味着客户端看到的不是逐 token 的流式输出，而是一段段已确认的文本。

**`session/request_permission`**：权限请求。当模型重试需要更宽的沙箱访问时，服务端向客户端发起一次性选择：`allow_once` 或 `reject_once`。客户端可以自动回答。关闭对话框或不可用的答案一律 fail closed（拒绝）。

## committed-only 输出：为什么不做逐 token 流

这是 `dsh-acp` 最反直觉的设计决策，也是理解它定位的钥匙。

大多数聊天 UI 的体验是逐 token 流式输出，你会看到文字一个字一个字蹦出来。`dsh-acp` 不做这个。它只在 message 被 committed（确认提交）后才发 `agent_message_chunk`。README 原话：

> Committed-message output intentionally trades token-by-token latency for a clean automation result.

翻译过来：**故意用逐 token 延迟换取一个干净的自动化结果。** 未提交的 provider chunk 和重试尝试不会泄漏部分文本。

为什么？因为 ACP 的消费者是程序，不是人。程序要的是"这段文字是最终答案的一部分"，不是"模型现在正在想这几个字"。如果泄漏了未确认的部分文本（比如模型中途重试、走了一条错误路径又回退），客户端拿到的是碎片化的、可能自相矛盾的内容。committed-only 保证了客户端收到的每一段文字都是模型确认过的，可以直接用于后续处理。

代价是延迟更高：客户端要等到 message 提交才能看到内容。但自动化场景不在乎延迟，在乎正确性。reasoning、工具活动这些中间过程不在线上传输，但保留在会话日志里，可以通过其他接口观察。

## 权限：一次性决策，不做持久授权

`dsh-acp` 的权限模型很克制。它通过 `session/request_permission` 向客户端提供**一次性**选择：

```typescript
options: [
  { optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' },
  { optionId: 'reject-once', name: 'Reject', kind: 'reject_once' },
]
```

注意两个细节。第一，只有 allow-once 和 reject-once，没有"永久允许"。客户端的一次同意不会变成持久授权。第二，选择只应用于那一次重试，通过正常的 tool-result 和审计路径记录。服务端不暴露权限选择器，也不持久化客户端策略。

这个设计的安全含义是：即使客户端被攻破或配置错误，一次错误的"允许"不会永久打开安全边界。每次需要提权都是一次独立决策。

源码里这个逻辑挂在 `approval/request` 事件上，通过 `ctx.on('approval/request', ...)` 注册一个 waterfall 处理器。只有当请求来自 bridge 拥有的 agent 且携带 tool call id 时才介入，否则交给 `next()` 让其他处理器决定。

## 优雅关闭：从子到父，不留孤儿

一个 ACP 连接断开时（客户端断连或 Cordis 销毁），bridge 要清理自己创建的所有 agent。这个过程比想象中复杂，因为子 agent 可能比启动它的 turn 活得更久（continuable subagents）。

`dsh-acp` 的 teardown 分四步：

1. **关闭入口**：标记 `closed`，拒绝新的 session 和 prompt。
2. **结算 pending**：把所有 in-flight 的 prompt 结算为 `cancelled`，取消所有顶层 agent。
3. **排空子 agent**：只排空属于这个连接的顶层 agent 旗下的 continuable 子 agent，从子到父（child-first）逐个销毁。这样不会有子 agent 残留在一个已经被释放的运行时上。其他前端共享同一 Context 的子 agent 不受影响。
4. **销毁顶层 agent**：并行销毁所有顶层 agent 句柄，等所有结果返回。任何一个失败都会被收集到 AggregateError 里，不让一个失败掩盖其他失败。

源码里这段逻辑由一个 memoized 的 `quiesce()` 函数实现，通过 `ctx.effect()` 注册为插件销毁副作用，同时挂在连接关闭的 promise 链上。两条路径（Cordis 销毁和传输断开）复用同一个 teardown，保证不会重复执行。

这个设计的核心原则是**精确归属**。bridge 用 branded session id 做身份检查：每条 session event 和权限请求都必须精确匹配 bridge 拥有的那个 agent 实例，不接受同 id 的冒充者。这防止了一个 agent 被 bridge 之外的途径销毁后，bridge 还在往它发消息。

## acp-agent 示例：一个可运行的组合

`examples/acp-agent` 是一个完整的可运行 ACP server 组合，用一行命令拉起：

```sh
pnpm run demo:acp          # 需要 DEEPSEEK_API_KEY
pnpm run demo:code-mode    # 同协议但用 Code Mode 工具传输
```

这个组合装载的东西很丰富：ACP app、DeepSeek 模型适配器、沙箱化的 bash 和文件系统栈、一次性审批策略、compaction（压缩）、subagents、workflows、hooks、派生的 session-query 索引、重复防护。每个 `session/new` 创建一个全新 agent，会话持久化到 JSONL。

两个工程细节值得注意：

**stdout 协议纯净化。** `@deepseek-ai/dsh-acp-demo` 不安装任何 stdout 日志器，所有诊断信息走 stderr。因为 stdout 被 ACP 的 JSON-RPC 帧独占，任何混入 stdout 的日志都会破坏协议。你在自己的组合里加 leaf 组件时，也必须用 stderr。

**会话工作区隔离。** 每个 `session/new` 提供独立的绝对 `cwd`，沙箱化的 bash 和文件系统变更针对那个 session cwd 解析 `workspace-write` 策略。所以并发会话可以使用不同的项目根目录，互不干扰。`DSH_PERMISSION_MODE` 环境变量在部署层面选择 `workspace-write` 或 `danger-full-access`。

## 权衡与局限

`dsh-acp` 的窄是刻意的，但窄意味着有边界。

**只支持全新会话。** 不支持 load、list、resume、delete、fork。每次都是 `session/new` 创建全新 agent。想恢复之前的会话？当前不行。

**只支持 baseline 提示和一个工作区。** 图片、音频、嵌入资源、非空 additional directories、MCP 服务器都会被拒绝。resource link 被拍平成文本引用，不是获取内容。

**只输出 committed 答案。** 实时进度、reasoning、工具活动、plans、titles、usage 都不在线上。如果你需要这些，得通过别的接口（比如会话日志或 telemetry）。

**连接级生命周期。** 一个连接断开会释放它的所有会话，不支持单个会话关闭。

这些局限不是 bug，是 scope。`dsh-acp` 是自动化传输层，不是全能 UI。交互式渲染和人类提问属于 Web host 和 client modules。把它当 ACP 的"自动化 API"用，而不是当聊天界面用，这些局限就都合理。

## 时点与诚实声明

本文基于 2026-08-14 的 `deepseek-ai/deepseek-harness` `master` 分支，主要参考 `packages/acp/acp/README.md`、`src/index.ts`，以及 `examples/acp-agent/README.md`。ACP 协议本身的背景参考 [Agent Client Protocol 官方站点](https://agentclientprotocol.com/) 和 [Zed 的 ACP 页面](https://zed.dev/acp)。

文中对 ACP 与 MCP 区别的描述、对 committed-only 设计动机的分析是解读结论，不是协议规范的原文。协议方法的具体行为以 `dsh-acp` 源码和 README 为准，ACP 协议本身仍在演进，方法签名可能随版本调整。

## 延伸阅读

- [Agent Client Protocol 官方站点](https://agentclientprotocol.com/)
- [Zed: Agent Client Protocol](https://zed.dev/acp)
- [ACP v1 规范概览](https://agentclientprotocol.com/protocol/v1/overview)
- [dsh-acp README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/acp/acp/README.md)
- [acp-agent 示例](https://github.com/deepseek-ai/deepseek-harness/blob/master/examples/acp-agent/README.md)
- [ACP 协议 GitHub 仓库](https://github.com/agentclientprotocol/agent-client-protocol)

上一篇：[MCP 协议在 dsh 中的位置：一个通用客户端，一份记忆服务器接入手册](./32-mcp-in-dsh-and-mcp-memory.md)
下一篇：[web-cordis：一个会改自己插件树的 agent](./34-web-cordis-self-referential-agent.md)
