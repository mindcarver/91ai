# 架构横评：dsh vs Claude Code vs Cursor vs Codex

> 如果你只能从这篇带走一句话，带走这句：这四个工具不是同一类东西。`dsh` 是一个开源的、全插件化的 agent 运行时（没有特权核心），Claude Code 和 Codex 是模型厂商的封闭 inner harness（内核你改不了），Cursor 是一个 IDE 集成的 agent 产品（agent 嵌在编辑器里）。选哪个取决于你要的是可组合性、开箱即用、还是编辑器原生体验。
> 这一篇用六个维度横评这四个工具的架构定位，明确区分事实和判断。

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

**DeepSeek Harness（`dsh`）**：开源 agent 运行时。MIT 许可，TypeScript/Node.js 实现，npm 包 `@deepseek-ai/dsh`。一切皆插件，没有特权核心。profile（web、headless）和 bundle 叠出插件树。当前处于 developer preview，官方明确说会有破坏兼容性的改动。

**Claude Code**：Anthropic 的封闭 agent 客户端。CLI 工具，绑定 Claude 模型。agent loop、工具签名、context 压缩策略是 Anthropic 写死的。用户通过 CLAUDE.md、skills、hooks 在外层定制。不是开源的。

**Cursor**：AI 代码编辑器。基于 VSCode fork，agent 能力嵌在编辑器里。Tab 补全、Chat、Composer、Agent 多种交互模式。绑定多种模型（Claude、GPT 等），但 agent 的行为由 Cursor 控制。不是开源的。

**OpenAI Codex**：OpenAI 的 coding agent。多种入口（CLI、App、Web、Cloud、GitHub 集成）。绑定 OpenAI 模型（GPT 系列、o 系列推理模型）。通过 AGENTS.md、Rules、Hooks、Skills 在外层定制。不是开源的。

一个关键的形态区别：`dsh` 是一个**运行时**（你往上搭产品），其他三个是**产品**（你拿来用）。`dsh` 的 Web UI 是它的一个 profile，不是它的全部；Claude Code 的 CLI 就是它的全部。

## inner vs outer harness：谁拥有内核

这个维度来自 [harness-engineering 系列](../harness-engineering/01-what-is-harness-engineering.md)的概念：harness 分 inner 和 outer 两层。

**inner harness**：模型厂商内置的、你改不了的部分。agent loop、工具签名、context 压缩策略、工具执行管线。

**outer harness**：你和团队自建的部分。CLAUDE.md、AGENTS.md、skills、hooks、CI 脚本、评测集。

四个工具在这个维度上的分布：

| 工具 | inner harness | outer harness |
|---|---|---|
| `dsh` | 不存在（全是插件） | 整个插件树 |
| Claude Code | Anthropic 写死的 agent loop、工具、压缩 | CLAUDE.md、skills、hooks |
| Cursor | Cursor 控制的 agent 行为、补全逻辑 | .cursorrules、project settings |
| Codex | OpenAI 写死的 agent loop、工具 | AGENTS.md、Rules、Hooks、Skills |

`dsh` 的独特之处是**没有 inner harness**。它的 agent loop（`dsh-agent-loop`）、工具注册表（`dsh-tools`）、context 压缩（`dsh-compaction`）都是可替换的插件。官方文档原话是"There is no privileged core to patch"。

另外三个工具的 inner harness 对用户是黑盒。你升级一个版本，agent loop 可能整个变了，你只能适应。`dsh` 的等价变更是换一个插件，你可以选择不换、或者写自己的。

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

**`dsh`**：挂一个 Cordis 插件扩展能力。插件实现 `apply(ctx, config)`，用 `ctx.tools.register()` 注册工具、`ctx.on()` 监听事件、`ctx.effect()` 注册可逆副作用。卸载时自动清理。这是代码级扩展，你写 TypeScript 插件。

**Claude Code**：通过 CLAUDE.md（项目指令）、skills（技能目录）、hooks（生命周期钩子）扩展。这些是配置级和脚本级扩展，不涉及改 agent loop。

**Cursor**：通过 .cursorrules（项目规则）、project settings 扩展。扩展能力受限于 Cursor 暴露的配置项。

**Codex**：通过 AGENTS.md（项目上下文）、Rules（规则文件）、Hooks（生命周期钩子）、Skills（技能）扩展。和 Claude Code 类似，是配置级扩展。

插件级扩展（`dsh`）和配置级扩展（其他三个）的区别是深度。配置级扩展改变的是 agent 的行为参数（用什么提示、什么规则、什么 hook 脚本）。插件级扩展改变的是 agent 的能力结构（新增一个 service、替换一个子系统、改变事件流）。

如果你想做的定制是"用不同的文件系统"、"换一个沙箱后端"、"给 telemetry 加一个自定义后端"，配置级扩展做不到，需要插件级扩展。如果你想做的是"让 agent 知道项目的编码规范"、"在提交前跑个检查"，配置级扩展就够。

## 可组合性：时空可组合性 vs 产品边界

`dsh` 基于 Cordis，同时实现了时间可组合性（运行时安全加载/卸载插件）和空间可组合性（依赖注入、context 隔离）。这让它的能力可以自由组合和替换。

其他三个工具的可组合性受限于产品边界。Claude Code 的 agent loop 是写死的，你不能"换掉 Claude Code 的 context 压缩策略"。你能做的是在外层（outer harness）加东西，不能替换 inner harness 的任何部分。

一个具体例子：远程执行。

`dsh` 把 `ctx.fs` 和 `ctx.subprocess` 都指向一个 E2B 远程沙箱，Bash、PTY、LSP 全跟着搬过去了，不需要为远程执行写一套 provider 分支。一个 provider 的替换，移动了整个产品。

Claude Code 做远程执行要靠 Docker container 或 SSH，这不是 harness 级的替换，是运行环境的替换。Codex 的 Cloud 入口提供远程执行，但那是 OpenAI 的基础设施，不是你的 provider 选择。

可组合性的代价是复杂度。`dsh` 的接缝层多、调试链长、学习曲线陡。一个行为的根因可能穿过多个插件和 waterfall。其他三个工具的调试更简单：inner harness 是黑盒，你只调试 outer harness。

## 抽象代价：复杂度 vs 开箱即用

这是所有取舍的汇总。

**`dsh` 的代价**：

- 上手门槛高。要理解 Cordis、profile、bundle、patch、接缝、waterfall 才能做深度定制。
- 调试链长。一个行为的根因可能穿过多个插件。
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

一个值得注意的趋势：`dsh` 的全插件化设计在学术上最接近 Cordis 论文描述的"时空可组合性"范式，但在产品成熟度上还在 developer preview。Claude Code、Cursor、Codex 在产品成熟度上领先，但在架构可组合性上受限。这不是谁好谁坏，是不同阶段的取舍。

## 时点与诚实声明

本文基于 2026-08-14 的公开信息。`dsh` 的架构描述基于 `deepseek-ai/deepseek-harness` `master` 分支。Claude Code、Cursor、Codex 的架构描述基于各工具的官方文档和公开技术资料。本仓库的 [harness-engineering 系列](../harness-engineering/01-what-is-harness-engineering.md)提供了 inner/outer harness 概念的学科背景。

文中的架构对比和选型建议是分析判断，不是官方表述。"模型锁定是商业决策""全插件化在产品成熟度上还在 developer preview"等判断基于公开信息和架构分析。各工具的具体功能、价格、支持模型以各自官方文档为准，这些信息随版本变化。

## 延伸阅读

- [Harness Engineering 是什么](../harness-engineering/01-what-is-harness-engineering.md)
- [Codex 工程化实战系列](../codex-engineering/README.md)
- [Claude Code 工程化系列](../claude-code-engineering/README.md)
- [DeepSeek Harness 官方仓库](https://github.com/deepseek-ai/deepseek-harness)
- [Cordis 时空可组合性论文](https://github.com/cordiverse/paper)
- [SWE-agent: Agent-Computer Interfaces](https://arxiv.org/abs/2405.15793)

上一篇：[Cordis 生态溯源：从 Koishi 到 DeepSeek Harness 的插件框架谱系](./47-cordis-lineage-koishi-plugin-framework-genealogy.md)
下一篇：[可组合性的工程哲学：DeepSeek Harness 给 Agent 时代留下什么](./49-engineering-philosophy-of-composability.md)
