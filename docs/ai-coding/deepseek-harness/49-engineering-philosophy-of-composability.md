# 可组合性的工程哲学：DeepSeek Harness 给 Agent 时代留下什么

> 如果你只能从整个系列带走一句话，带走这句：`dsh` 用 Cordis 的时空可组合性把"一切皆插件"从口号变成了有运行时保证的工程事实，代价是复杂度暴露给用户，回报是一个 agent harness 能像操作系统组件一样被替换、组合、二次开发，这是 agent 时代基础设施的一种可能形态。
> 这一篇是系列的收束。回到最根本的问题：可组合性值不值得付出复杂度的代价？`dsh` 的工程实践给了什么启示？给跟进者什么建议？

## 从一个判断开始

Agent = Model + Harness。模型是 CPU，harness 是操作系统。

但 2026 年的 agent 生态有一个结构性问题：**大多数 harness 是封闭的**。Claude Code 的 inner harness 是 Anthropic 写死的。Codex 的 inner harness 是 OpenAI 写死的。Cursor 的 agent 行为是 Cursor 控制的。用户只能在外层（CLAUDE.md、AGENTS.md、skills、hooks）做 outer harness 定制，改不了内核。

这意味着 agent 的核心基础设施（agent loop、工具注册表、context 压缩、工具执行管线、沙箱策略）由少数几个厂商黑盒提供。你能用，但不能改、不能审计、不能组合。

`dsh` 提供了另一种可能：**把这些核心基础设施全部做成可替换的插件**。不是外层扩展，是内核本身可组合。连 agent loop 都是一个插件。

这不是一个产品决策，是一个工程哲学判断。

## 时空可组合性：从口号到工程事实

Cordis 论文形式化了两个正交属性：时间可组合性（运行时安全加载/卸载插件）和空间可组合性（依赖注入、context 隔离）。大部分插件框架做到空间，做不到时间。Cordis 用 effect tracking 和 coeffect resolution 同时做到两个。

`dsh` 把这个范式落地到了一个 221 个包的 agent harness 里。落地意味着什么？

**注册是可逆副作用。** 注册一个工具、一段 prompt、一个监听器，都是 `ctx.effect()` 或 `ctx.on()` 产生的副作用。插件卸载时按序撤销。这不是"卸载时手动清理"的约定，是框架的运行时保证。每个 registry 都有 HMR 安全测试验证它。

**依赖是声明的，不是手写的。** 插件用 `inject` 声明它需要什么 service，Cordis 等依赖就位才激活。加载顺序由需求决定，不用手写 boot 序列。这让 50 多个插件能正确组合，不需要人肉排依赖。

**一个 provider 的替换移动整个产品。** 文件系统和子进程共享同一个"执行世界"。把 `ctx.fs` 和 `ctx.subprocess` 都指向远程 E2B 沙箱，Bash、PTY、LSP 全跟着搬。不需要为远程执行写一套 provider 分支。

这三个能力合在一起，让"换一个子系统"从"fork 源码改代码"变成了"卸载旧插件挂载新插件"。运行时上下文干净，不留垃圾。

## 可组合性的代价

不回避代价。`dsh` 的全插件化不是免费的。

**抽象层多。** 一个行为从用户输入到模型请求，穿过 inbox、agent-loop、pre-step waterfall、request waterfall、llm/stream waterfall、tool execution pipeline 的七层关卡。每一层都是插件化的扩展点，每一层都可能被 waterfall 监听器拦截或修改。理解一条请求的完整路径需要追踪多个插件和事件。

**调试链长。** 一个行为的根因可能穿过多个插件。MCP 工具为什么不生效？可能是 patch 没写对、可能是 serverName 冲突、可能是重连预算耗尽、可能是脱敏瀑布丢了记录。每个问题都需要理解对应的子系统。dump-config 帮你看加载状态，invariants 帮你抓运行时违规，但调试仍然比封闭 harness 更费力。

**学习曲线陡。** 要做深度定制，需要理解 Cordis 的 fiber 生命周期、effect tracking、waterfall 语义、能力接缝模式、profile/bundle/patch 层叠。这是一个有门槛的系统，不是装了就能深度用的工具。

**API 不稳定。** `dsh` 在 developer preview，官方明确说会有破坏兼容性的改动。包名、事件签名、配置项、bundle/profile 模板都可能变。这在早期是不可避免的，但意味着投入需要跟着迁移。

这些代价是结构性的，不是"等版本迭代就好了"的。一个全插件化的系统天然比一个封闭系统更复杂，因为它的复杂度暴露给了用户。这是可组合性的税。

## 回报是什么

交了税，换回什么？

**可二次开发。** 你可以在 `dsh` 基础上搭自己的产品。挂自己的模型 provider、自己的沙箱后端、自己的 telemetry 后端、自己的 UI。不需要 fork 内核，挂插件就行。这让 `dsh` 更像一个"agent 操作系统"而不是"agent 应用"。

**可审计。** 整个框架层（Cordis）vendor 在仓库里，源码可读。每个插件的行为、每个事件的派发、每个副作用的注册和撤销，都可以在源码里追到。封闭 harness 做不到这一点。

**可组合。** 任何子系统能替换。想用 E2B 沙箱？换 provider。想用自定义 telemetry 后端？写一个 backend 实现 `SessionTelemetrySink`。想给 agent 加一个新的能力接缝？声明 Service Definition、实现 provider、写 consumer。

**协议标准化。** `dsh` 支持 MCP（接外部工具）和 ACP（被外部驱动）。两个协议都是开放标准。这意味着 `dsh` 的生态不只是它自己的插件，还包括所有 MCP 兼容的工具服务器和所有 ACP 兼容的客户端。

**自指能力。** web-cordis 示例展示了 agent 在运行时修改自己的插件树。这是"一切皆插件"的终极推论：如果连 agent loop 都是插件，agent 自己就能编辑这个插件组合。

这些回报的共同特征是**长期价值**。复杂度的税在前期交（学习、调试、迁移），可组合性的回报在后期收（二次开发、生态、定制）。这是 infrastructure 类项目的典型取舍。

## 七条工程经验

从 `dsh` 的代码和文档里提炼七条可迁移的工程经验。

**1. 注册是可逆副作用，不是手写清理。** 让框架追踪副作用，卸载时自动撤销。不要依赖开发者记得在 dispose 里手动清理每个 listener 和 timer。这是 Cordis effect tracking 的核心思想。

**2. 能力用接缝，不用 import。** 声明 Service Definition，让 provider 实现，让 consumer 注入。不要 `import { shell } from './shell'`，用 `ctx.shell.run()`。这让 provider 可替换，也让依赖关系显式。

**3. 错误恢复用事件，不用硬编码。** 模型请求失败时派发 waterfall，让监听器决定是否重试。不要在 agent loop 里写死重试逻辑。这让重试策略可插拔。

**4. 外部世界不可靠是常态。** 为每种不可靠设计具体规则：正交结果独立报告、双侧公共契约归一化、异步状态不和同步状态混淆、销毁到达平静而非请求、回调异常在 dispatcher 里 contain、不给不可信输出环境变量、链接形路径走 unlink。

**5. 文档是构建产物。** 从源码生成文档，用门禁验证一致性。文档和代码的任何不一致都让 CI 失败。这比靠人肉 review 维护文档可行得多。

**6. 测试要测真实入口路径。** 不要只测手建的 `ctx.plugin(...)`，要通过 Loader 启动真实组合。mock 只 mock 昂贵边界，下游用真实实现。"单测全绿但产品是坏的"这一类 bug 只有真实入口测试能抓。

**7. 热更新不是重启。** settings 的 `watch()`、credentials 的每次解析、storage 的写入链、Cordis 的 HMR，都做到了"改了不用重启"。这是全插件化架构对用户感知的直接回报。

## 给跟进者的建议

如果你打算在 `dsh` 上做二次开发，或者借鉴它的架构做自己的 agent harness，几条建议。

**先过 Cordis 门槛。** 理解 fiber、effect、waterfall、service、inject 是读任何 `dsh` 源码的前提。跳过这一步直接读子系统源码，大概率卡在"为什么注册一个函数就能扩展能力"上。

**用 dump-config 而不是猜。** 改配置前先 `dsh --profile web --dump-config`，看实际加载了什么。出了问题先确认插件树组合是否和你以为的一致。

**从 examples 开始。** 仓库的 `examples/` 目录有 headless、jsonrpc-agent、acp-agent、mcp-memory、web-cordis 等可运行示例。先跑通一个，理解整个链路，再往深走。

**注意 developer preview 的不稳定性。** API 会变。做二次开发时要预留迁移成本，不要在 API 不稳定的阶段做太深的定制。

**区分 dsh 和 Cordis。** `dsh` 是 agent harness，Cordis 是它的底层框架。如果你觉得 `dsh` 太重，可以只用 Cordis 搭自己的东西。Cordis 的时空可组合性对任何需要插件化的系统都适用，不限于 agent。

**关注 MCP 和 ACP 生态。** `dsh` 支持这两个开放协议。如果这两个协议的生态成熟了，`dsh` 的价值会因为生态网络效应放大。如果协议生态没起来，`dsh` 的开放性优势会打折扣。

## 这个系列拆了什么

18 篇文章拆了 `dsh` 的协议接入（MCP、ACP、自指 agent）、有状态底座（配置、凭证、存储、telemetry）、工程实践（配置实战、调试、Conversation Node、Python SDK、Web 客户端）、质量保障（容错、测试、性能、docs-as-code、i18n）、生态溯源（Cordis 谱系）、横向对比（dsh vs Claude Code vs Cursor vs Codex）。

这些拆解的共同主题是：**一个全插件化的 agent harness 在工程上长什么样。** 不是理念，是具体的机制、代码、测试、文档、配置。每一个子系统都有独立的设计判断，这些判断加在一起构成了一个完整的工程实践。

`dsh` 不是唯一答案。封闭 harness（Claude Code、Codex）在产品成熟度上领先，在开箱即用上更好。但 `dsh` 提供了一种不同的可能：agent 的核心基础设施可以是开放的、可组合的、可审计的。这个可能是否值得追求，取决于 agent 时代的基础设施最终由少数厂商黑盒提供，还是由开放的、可组合的生态提供。

`dsh` 选择了后者。这个系列就是拆解这个选择的工程含义。

## 延伸阅读

- [DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)
- [官方架构文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [Cordis 时空可组合性论文](https://github.com/cordiverse/paper)
- [Harness Engineering 是什么](../harness-engineering/01-what-is-harness-engineering.md)
- [架构横评：dsh vs Claude Code vs Cursor vs Codex](./48-architecture-comparison-dsh-vs-claude-code-cursor-codex.md)

上一篇：[架构横评：dsh vs Claude Code vs Cursor vs Codex](./48-architecture-comparison-dsh-vs-claude-code-cursor-codex.md)
下一篇：系列完结
