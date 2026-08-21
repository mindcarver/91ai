# 架构横评与可组合性的工程哲学：dsh vs Claude Code vs Cursor vs Codex

> 这四个工具不是同一类东西。`dsh` 是一个开源的、全插件化的 agent 运行时（没有特权核心），Claude Code 和 Codex 是模型厂商的封闭 inner harness（内核你改不了），Cursor 是一个 IDE 集成的 agent 产品（agent 嵌在编辑器里）。`dsh` 用 Cordis 的时空可组合性把"一切皆插件"从口号变成了有运行时保证的工程事实，代价是复杂度暴露给用户，回报是一个 agent harness 能像操作系统组件一样被替换、组合、二次开发。
> 这一篇先按六个维度横评四个工具的架构定位（明确区分事实和判断），再回到最根本的问题收束整个系列：可组合性值不值得付出复杂度的代价，`dsh` 的工程实践给了什么启示，给跟进者什么建议。

## 比较的维度

先说清楚比什么、不比什么。

不比的是：功能清单（谁能做什么任务）、模型能力（谁的模型更聪明）、benchmarks 分数（谁在 SWE-bench 上更高）。这些随版本剧烈变化，而且依赖太多外部因素。

比的是六个架构维度：

1. **架构定位**：这个工具本质上是什么
2. **内核归属**：inner harness 谁拥有
3. **模型锁定**：锁不锁模型
4. **扩展方式**：怎么扩展能力
5. **可组合性**：能力能不能组合和替换
6. **抽象代价**：复杂度和开箱即用的取舍

这些维度决定了一个工具适合谁、不适合谁，比功能清单更有预测力。

## 架构定位：四种不同形态

先看事实层面的形态差异。

- **DeepSeek Harness（`dsh`）**：开源 agent 运行时。MIT 许可，TypeScript/Node.js 实现，npm 包 `@deepseek-ai/dsh`。一切皆插件，没有特权核心。profile（web、headless）和 bundle 叠出插件树。当前处于 developer preview，官方明确说会有破坏兼容性的改动。
- **Claude Code**：Anthropic 的封闭 agent 客户端。CLI 工具，绑定 Claude 模型。agent loop、工具签名、context 压缩策略是 Anthropic 写死的。用户通过 CLAUDE.md、skills、hooks 在外层定制。不是开源的。
- **Cursor**：AI 代码编辑器。基于 VSCode fork，agent 能力嵌在编辑器里。Tab 补全、Chat、Composer、Agent 多种交互模式。绑定多种模型（Claude、GPT 等），但 agent 的行为由 Cursor 控制。不是开源的。
- **OpenAI Codex**：OpenAI 的 coding agent。多种入口（CLI、App、Web、Cloud、GitHub 集成）。绑定 OpenAI 模型（GPT 系列、o 系列推理模型）。通过 AGENTS.md、Rules、Hooks、Skills 在外层定制。不是开源的。

一个关键的形态区别：`dsh` 是一个**运行时**（你往上搭产品），其他三个是**产品**（你拿来用）。`dsh` 的 Web UI 是它的一个 profile，不是它的全部；Claude Code 的 CLI 就是它的全部。

## inner vs outer harness：谁拥有内核

这个维度来自 [harness-engineering 系列](../harness-engineering/01-what-is-harness-engineering.md)的概念：harness 分 inner 和 outer 两层。

- **inner harness**：模型厂商内置的、你改不了的部分。agent loop、工具签名、context 压缩策略、工具执行管线。
- **outer harness**：你和团队自建的部分。CLAUDE.md、AGENTS.md、skills、hooks、CI 脚本、评测集。

四个工具在这个维度上的分布：

| 工具 | inner harness | outer harness |
|---|---|---|
| `dsh` | 不存在（全是插件） | 整个插件树 |
| Claude Code | Anthropic 写死的 agent loop、工具、压缩 | CLAUDE.md、skills、hooks |
| Cursor | Cursor 控制的 agent 行为、补全逻辑 | .cursorrules、project settings |
| Codex | OpenAI 写死的 agent loop、工具 | AGENTS.md、Rules、Hooks、Skills |

`dsh` 的独特之处是**没有 inner harness**。它的 agent loop（`dsh-agent-loop`）、工具注册表（`dsh-tools`）、context 压缩（`dsh-compaction`）都是可替换的插件。官方文档原话是 "There is no privileged core to patch"。

另外三个工具的 inner harness 对用户是黑盒。你升级一个版本，agent loop 可能整个变了，你只能适应。`dsh` 的等价变更是换一个插件，你可以选择不换、或者写自己的。

这意味着在大多数 agent 生态里，agent 的核心基础设施（agent loop、工具注册表、context 压缩、工具执行管线、沙箱策略）由少数几个厂商黑盒提供：你能用，但不能改、不能审计、不能组合。`dsh` 提供了另一种可能，把这些核心基础设施全部做成可替换的插件。不是外层扩展，是内核本身可组合，连 agent loop 都是一个插件。这不是一个产品决策，是一个工程哲学判断。

## 模型锁定：锁不锁模型

| 工具 | 模型 | 能换吗 |
|---|---|---|
| `dsh` | 默认 DeepSeek，但不锁 | 能，`ctx.llm` 是接缝，任何 OpenAI 兼容端点 |
| Claude Code | Claude | 不能，Anthropic 只服务 Claude |
| Cursor | Claude、GPT、Gemini 等 | 能在支持的模型间切换，不能加 Cursor 不支持的 |
| Codex | OpenAI 模型 | 不能，OpenAI 只服务自己的模型 |

`dsh` 的模型适配是一个叫 `ctx.llm` 的接缝。官方实现了 `llm-deepseek`、`llm-pi-ai`（另一个提供商）、`llm-replay`（测试用回放）。因为是接缝，你可以挂任何 OpenAI 兼容的模型适配器。

Claude Code 和 Codex 的模型锁定是刻意的商业决策：模型厂商的客户端只服务自家模型。Cursor 的多模型支持是产品策略，但限于它集成的那些。

`dsh` 不锁模型是一个生态判断：与其做一个锁死自家模型的封闭产品，不如做一个谁都能往里塞 provider 的开放 harness。

## 扩展方式：插件 vs 配置

这是四个工具差异最大的维度。

- **`dsh`**：挂一个 Cordis 插件扩展能力。插件实现 `apply(ctx, config)`，用 `ctx.tools.register()` 注册工具、`ctx.on()` 监听事件、`ctx.effect()` 注册可逆副作用。卸载时自动清理。这是代码级扩展，你写 TypeScript 插件。
- **Claude Code**：通过 CLAUDE.md（项目指令）、skills（技能目录）、hooks（生命周期钩子）扩展。这些是配置级和脚本级扩展，不涉及改 agent loop。
- **Cursor**：通过 .cursorrules（项目规则）、project settings 扩展。扩展能力受限于 Cursor 暴露的配置项。
- **Codex**：通过 AGENTS.md（项目上下文）、Rules（规则文件）、Hooks（生命周期钩子）、Skills（技能）扩展。和 Claude Code 类似，是配置级扩展。

插件级扩展（`dsh`）和配置级扩展（其他三个）的区别是深度。配置级扩展改变的是 agent 的行为参数（用什么提示、什么规则、什么 hook 脚本）。插件级扩展改变的是 agent 的能力结构（新增一个 service、替换一个子系统、改变事件流）。

如果你想做的定制是"用不同的文件系统"、"换一个沙箱后端"、"给 telemetry 加一个自定义后端"，配置级扩展做不到，需要插件级扩展。如果你想做的是"让 agent 知道项目的编码规范"、"在提交前跑个检查"，配置级扩展就够。

## 可组合性：时空可组合性 vs 产品边界

`dsh` 基于 Cordis，同时实现了时间可组合性（运行时安全加载/卸载插件）和空间可组合性（依赖注入、context 隔离）。这让它的能力可以自由组合和替换。

其他三个工具的可组合性受限于产品边界。Claude Code 的 agent loop 是写死的，你不能"换掉 Claude Code 的 context 压缩策略"。你能做的是在外层（outer harness）加东西，不能替换 inner harness 的任何部分。

一个具体例子：远程执行。

`dsh` 把 `ctx.fs` 和 `ctx.subprocess` 都指向一个 E2B 远程沙箱，Bash、PTY、LSP 全跟着搬过去了，不需要为远程执行写一套 provider 分支。一个 provider 的替换，移动了整个产品。

Claude Code 做远程执行要靠 Docker container 或 SSH，这不是 harness 级的替换，是运行环境的替换。Codex 的 Cloud 入口提供远程执行，但那是 OpenAI 的基础设施，不是你的 provider 选择。

## 抽象代价：复杂度 vs 开箱即用

这是所有取舍的汇总。

**`dsh` 的代价**：

- 上手门槛高。要理解 Cordis、profile、bundle、patch、接缝、waterfall 才能做深度定制。
- 调试链长。一个行为的根因可能穿过多个插件。MCP 工具为什么不生效？可能是 patch 没写对、可能是 serverName 冲突、可能是重连预算耗尽。dump-config 帮你看加载状态，invariants 帮你抓运行时违规，但调试仍然比封闭 harness 更费力。
- developer preview 阶段。API 不稳定，会有破坏兼容性的改动。
- 自带 UI 相对简单。Web UI 是一个 profile，不是像 Cursor 那样打磨过的编辑器体验。

**`dsh` 的回报**：

- 可组合。任何子系统能替换、能组合。
- 可二次开发。你可以在 `dsh` 基础上搭自己的产品。
- 不锁模型。挂任何 OpenAI 兼容端点。
- 全开源。框架层（Cordis）也 vendor 了，完全可审计。

**Claude Code / Cursor / Codex 的代价**：

- 内核不可改。inner harness 是黑盒。
- 模型锁定（Claude Code、Codex）。
- 可组合性受限于产品暴露的扩展点。

**Claude Code / Cursor / Codex 的回报**：

- 开箱即用。装了就能用，不用理解插件框架。
- 体验打磨。编辑器集成、UI 交互、错误恢复都经过大量用户验证。
- 模型深度优化。inner harness 针对特定模型调优（Claude Code 针对 Claude，Codex 针对 OpenAI 模型）。

要强调的是，`dsh` 这些代价是结构性的，不是"等版本迭代就好了"。一个全插件化的系统天然比一个封闭系统更复杂，因为它的复杂度暴露给了用户。这是可组合性的税：复杂度的税在前期交（学习、调试、迁移），可组合性的回报在后期收（二次开发、生态、定制）。这是 infrastructure 类项目的典型取舍。

## 什么时候选什么

给出有判断的建议。

**选 `dsh` 如果**：

- 你要搭自己的 agent 产品，需要一个可组合的运行时做底座。
- 你要用 DeepSeek 模型但不想被锁死，需要随时换 provider 的能力。
- 你要替换某个子系统（远程沙箱、自定义 telemetry 后端、自定义审批流程）。
- 你是研究者，想实验不同的 harness 设计对 agent 行为的影响。

**选 Claude Code 如果**：

- 你用 Claude 模型，想要一个打磨好的命令行 agent。
- 你的定制需求在项目指令（CLAUDE.md）、技能、钩子层面。
- 你不想维护基础设施，厂商全托管。

**选 Cursor 如果**：

- 你要编辑器原生的 AI 编码体验（Tab 补全、inline edit）。
- 你想在多个模型间切换，但不需要自己写 provider。
- 你的工作流和编辑器深度绑定。

**选 Codex 如果**：

- 你用 OpenAI 模型，想要多入口（CLI、Web、Cloud、GitHub）的 agent。
- 你的团队已经在 OpenAI 生态里。
- 你需要 GitHub Action 集成做 CI/CD 自动化。

还有个趋势判断：`dsh` 的全插件化设计在学术上最接近 Cordis 论文描述的"时空可组合性"范式，但在产品成熟度上还在 developer preview。Claude Code、Cursor、Codex 在产品成熟度上领先，但在架构可组合性上受限。这不是谁好谁坏，是不同阶段的取舍。

## 时空可组合性：从口号到工程事实

横评之后收束整个系列。Cordis 论文形式化了两个正交属性：时间可组合性（运行时安全加载/卸载插件）和空间可组合性（依赖注入、context 隔离）。大部分插件框架做到空间，做不到时间。Cordis 用 effect tracking 和 coeffect resolution 同时做到两个。`dsh` 把这个范式落地到了一个两百多个包的 agent harness 里。落地意味着三件事：

- **注册是可逆副作用。** 注册一个工具、一段 prompt、一个监听器，都是 `ctx.effect()` 或 `ctx.on()` 产生的副作用。插件卸载时按序撤销。这不是"卸载时手动清理"的约定，是框架的运行时保证。每个 registry 都有 HMR 安全测试验证它。
- **依赖是声明的，不是手写的。** 插件用 `inject` 声明它需要什么 service，Cordis 等依赖就位才激活。加载顺序由需求决定，不用手写 boot 序列。这让 50 多个插件能正确组合，不需要人肉排依赖。
- **一个 provider 的替换移动整个产品。** 上面 E2B 的例子就是这条能力的直接展示：换两个 provider，整个执行世界跟着搬。

这三个能力合在一起，让"换一个子系统"从"fork 源码改代码"变成了"卸载旧插件挂载新插件"。运行时上下文干净，不留垃圾。

## 回报的另一半：协议与自指

上面代价/回报清单里的四条回报（可组合、可二次开发、不锁模型、可审计）之外，还有两条容易被低估。

- **协议标准化。** `dsh` 支持 MCP（接外部工具）和 ACP（被外部驱动）。两个协议都是开放标准。这意味着 `dsh` 的生态不只是它自己的插件，还包括所有 MCP 兼容的工具服务器和所有 ACP 兼容的客户端。
- **自指能力。** web-cordis 示例展示了 agent 在运行时修改自己的插件树。这是"一切皆插件"的终极推论：如果连 agent loop 都是插件，agent 自己就能编辑这个插件组合。

## 七条工程经验

从 `dsh` 的代码和文档里提炼七条可迁移的工程经验。

1. **注册是可逆副作用，不是手写清理。** 让框架追踪副作用，卸载时自动撤销。不要依赖开发者记得在 dispose 里手动清理每个 listener 和 timer。这是 Cordis effect tracking 的核心思想。
2. **能力用接缝，不用 import。** 声明 Service Definition，让 provider 实现，让 consumer 注入。不要 `import { shell } from './shell'`，用 `ctx.shell.run()`。这让 provider 可替换，也让依赖关系显式。
3. **错误恢复用事件，不用硬编码。** 模型请求失败时派发 waterfall，让监听器决定是否重试。不要在 agent loop 里写死重试逻辑。这让重试策略可插拔。
4. **外部世界不可靠是常态。** 为每种不可靠设计具体规则：正交结果独立报告、双侧公共契约归一化、异步状态不和同步状态混淆、销毁到达平静而非请求、回调异常在 dispatcher 里 contain、不给不可信输出环境变量、链接形路径走 unlink。
5. **文档是构建产物。** 从源码生成文档，用门禁验证一致性。文档和代码的任何不一致都让 CI 失败。这比靠人肉 review 维护文档可行得多。
6. **测试要测真实入口路径。** 不要只测手建的 `ctx.plugin(...)`，要通过 Loader 启动真实组合。mock 只 mock 昂贵边界，下游用真实实现。"单测全绿但产品是坏的"这一类 bug 只有真实入口测试能抓。
7. **热更新不是重启。** settings 的 `watch()`、credentials 的每次解析、storage 的写入链、Cordis 的 HMR，都做到了"改了不用重启"。这是全插件化架构对用户感知的直接回报。

## 给跟进者的建议

如果你打算在 `dsh` 上做二次开发，或者借鉴它的架构做自己的 agent harness，几条建议。

- **先过 Cordis 门槛。** 理解 fiber、effect、waterfall、service、inject 是读任何 `dsh` 源码的前提。跳过这一步直接读子系统源码，大概率卡在"为什么注册一个函数就能扩展能力"上。
- **用 dump-config 而不是猜。** 改配置前先 `dsh --profile web --dump-config`，看实际加载了什么。出了问题先确认插件树组合是否和你以为的一致。
- **从 examples 开始。** 仓库的 `examples/` 目录有 headless、jsonrpc-agent、acp-agent、mcp-memory、web-cordis 等可运行示例。先跑通一个，理解整个链路，再往深走。
- **注意 developer preview 的不稳定性。** API 会变。做二次开发时要预留迁移成本，不要在 API 不稳定的阶段做太深的定制。
- **区分 dsh 和 Cordis。** `dsh` 是 agent harness，Cordis 是它的底层框架。如果你觉得 `dsh` 太重，可以只用 Cordis 搭自己的东西。Cordis 的时空可组合性对任何需要插件化的系统都适用，不限于 agent。
- **关注 MCP 和 ACP 生态。** `dsh` 支持这两个开放协议。如果这两个协议的生态成熟了，`dsh` 的价值会因为生态网络效应放大。如果协议生态没起来，`dsh` 的开放性优势会打折扣。

## 这个系列拆了什么

这个系列把 `dsh` 从 Cordis 范式、运行时核心、能力接缝、执行子系统，到源码导读、扩展开发、工程化门禁和横向评测，逐层拆了一遍。

这些拆解的共同主题是：**一个全插件化的 agent harness 在工程上长什么样。** 不是理念，是具体的机制、代码、测试、文档、配置。每一个子系统都有独立的设计判断，这些判断加在一起构成了一个完整的工程实践。

`dsh` 不是唯一答案。封闭 harness（Claude Code、Codex）在产品成熟度上领先，在开箱即用上更好。但 `dsh` 提供了一种不同的可能：agent 的核心基础设施可以是开放的、可组合的、可审计的。这个可能是否值得追求，取决于 agent 时代的基础设施最终由少数厂商黑盒提供，还是由开放的、可组合的生态提供。

`dsh` 选择了后者。这个系列就是拆解这个选择的工程含义。

## 延伸阅读

- [DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)
- [官方架构文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [Cordis 时空可组合性论文](https://github.com/cordiverse/paper)
- [Harness Engineering 是什么](../harness-engineering/01-what-is-harness-engineering.md)
- [Codex 工程化实战系列](../codex-engineering/README.md)
- [Claude Code 工程化系列](../claude-code-engineering/README.md)
- [SWE-agent: Agent-Computer Interfaces](https://arxiv.org/abs/2405.15793)

上一篇：[Cordis 生态溯源：从 Koishi 到 DeepSeek Harness 的插件框架谱系](./47-cordis-lineage-koishi-plugin-framework-genealogy.md)
下一篇：系列完结
