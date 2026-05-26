# Preamble 与 Personality：中间输出和行为模式设计

**TL;DR：** Preamble 是 Agent Loop 中周期性注入的系统层消息，每 1-3 个执行步骤自动插入一次，用于在长会话中保持 Codex 与项目规则和任务目标的对齐。没有 Preamble，Codex 在经历十几次工具调用后容易偏离原始指令的约束条件。Personality 系统控制模型的通信风格——Friendly 模式偏对话式、解释详细、主动提问，Pragmatic 模式偏直接、简洁、行动优先。两者的组合配置构成 Codex 行为调控的精细层：Preamble 管"不忘规则"，Personality 管"怎么说话"。本文覆盖 Preamble 的注入机制、内容设计原则和 Token 成本优化，Personality 的两种模式选择策略，以及生产环境与学习场景的完整配置方案。

---

## Preamble 的本质：长会话中的规则锚点

### 什么是 Preamble

Codex 的 Agent Loop 在执行复杂任务时会经历多次迭代。一次典型的大型重构任务可能包含 15-30 个执行步骤：读取文件、分析依赖、生成修改、运行测试、修复失败、再次测试。在这些步骤之间，模型的上下文窗口不断被新信息填充——文件内容、工具输出、中间推理过程。随着上下文增长，原始指令中的约束条件和项目规则会被逐渐"稀释"。

Preamble 解决的就是这个稀释问题。它是一段系统级别的提示文本，在 Agent Loop 执行过程中周期性地重新注入到模型的输入中。每次注入相当于一个"提醒信号"，把最关键的规则和当前任务目标重新拉回模型的注意力焦点。

理解 Preamble 的关键在于它不是静态的一次性配置。AGENTS.md 在会话开始时加载一次，config.toml 在启动时读取一次，而 Preamble 是动态的、周期性的——它在执行过程中反复出现，确保模型在每一步决策时都能"看到"核心规则。

### 没有 Preamble 会发生什么

一个具体的例子。你给 Codex 一条指令：

```text
"重构 src/payment/ 目录下的所有模块，将 callback 风格的数据库操作改为
async/await。遵循以下约束：
1. 不要修改公开的函数签名
2. 每个模块改完后运行对应的测试
3. 如果测试失败，回滚该模块的修改并跳过
4. 最终输出一个修改摘要"
```

前 3-4 个模块的重构可能很顺利。模型按约束执行，每次修改后跑测试，测试失败就回滚。但到了第 7-8 个模块时，上下文已经积累了大量文件内容和工具输出。模型的注意力开始被当前正在处理的代码细节占据，原始约束的权重下降。它可能：

- 修改了一个公开函数的签名，因为"这个函数只有内部调用"——忘了约束 1
- 修改完一个复杂模块后跳过了测试直接处理下一个——忘了约束 2
- 测试失败后尝试修复而不是回滚——忘了约束 3
- 全部处理完后没有输出修改摘要——忘了约束 4

这就是典型的"长会话漂移"。不是模型能力不足，而是核心指令在上下文中被淹没。Preamble 的作用就是在每个关键节点重新注入这些约束，防止漂移发生。

### Preamble 与 AGENTS.md 的关系

Preamble 和 AGENTS.md 解决的是不同层面的问题：

| 维度 | AGENTS.md | Preamble |
|------|-----------|----------|
| 加载时机 | 会话开始时一次性加载 | Agent Loop 中周期性注入 |
| 内容定位 | 项目的完整上下文（架构、命令、规范） | 最关键的 3-5 条规则摘要 |
| 内容长度 | 可以到几百行 | 必须精简，通常 5-15 行 |
| Token 成本 | 加载一次，消耗固定 | 每次注入都消耗，频率越高成本越大 |
| 设计目标 | 让模型了解项目 | 让模型不忘规则 |

Preamble 不应该复制 AGENTS.md 的内容。它的设计原则是"摘要而非重复"——把 AGENTS.md 中最不能违反的几条规则提炼出来，用最简短的表述写入 Preamble。两者的关系像是法律法规和现场标语的关系：AGENTS.md 是完整的规章制度，Preamble 是"此处禁止烟火"的关键提醒。

---

## Preamble 配置方式

### 通过 config.toml 配置

Preamble 的主要配置入口是 `config.toml`。以下是一个完整的 Preamble 配置示例：

```toml
# .codex/config.toml

# Preamble 内容：每次注入时使用的文本
preamble = """
## 核心规则
- 每次代码修改后必须运行对应的测试
- 不要修改 .env 文件和数据库迁移文件
- 使用 pnpm 作为包管理器，不使用 npm 或 yarn
- 修改公开 API 时必须更新对应的类型定义
- 每个任务完成后输出简要的变更摘要
"""

# Preamble 注入频率：每 N 个执行步骤注入一次
# 1 = 每步都注入（最强对齐，最高 Token 成本）
# 2-3 = 推荐（平衡对齐和成本）
# 4+ = 低频注入（适合简单任务或 Token 预算有限时）
preamble_frequency = 2
```

`preamble_frequency` 的选择直接影响 Token 消耗和规则遵从度。频率越高，模型对规则的遵从度越好，但每多一次注入就多消耗一次 Preamble 的 Token 数。这个参数的设置需要根据任务复杂度和 Token 预算来权衡。

### 通过 AGENTS.md 的 Preamble 段

部分 Codex 版本支持在 AGENTS.md 中使用专门的段落来定义 Preamble 内容：

```markdown
# AGENTS.md

## Preamble

<!-- 这段内容会作为 Preamble 周期性注入 -->

- 测试命令：pnpm test
- 类型检查：pnpm typecheck
- 不要修改 .env* 文件
- 每次修改后运行相关测试

## Project Context
...
```

当 AGENTS.md 中定义了 Preamble 段时，Codex 会提取这段内容作为周期性注入的文本。这种方式的优点是 Preamble 和项目上下文在同一个文件中维护，不需要在 config.toml 和 AGENTS.md 之间跳转。缺点是 AGENTS.md 文件变大，且 Preamble 内容受 AGENTS.md 文件大小限制的约束。

两种配置方式同时存在时，config.toml 中的 `preamble` 字段优先级更高。

### 分层配置的 Preamble 策略

Preamble 也遵循 Codex 的分层配置体系。系统管理员可以在系统级 config.toml 中定义组织级的强制规则，项目级 config.toml 定义项目级的关键约束，个人级 config.toml 定义个人偏好：

```toml
# /etc/codex/config.toml —— 组织级强制规则
preamble = """
- 禁止将代码推送到非企业控制的远程仓库
- 所有网络请求必须通过企业代理
- 禁止在代码中硬编码密钥或凭据
"""
preamble_frequency = 1  # 每步注入，组织级安全要求

# 项目级 config.toml —— 项目级规则（追加到组织级之后）
# 注意：当项目级也定义了 preamble 时，行为取决于版本：
# 部分版本会拼接两层内容，部分版本用项目级覆盖
# 建议项目级只定义 AGENTS.md，不重复定义 preamble
```

实践中，组织级 Preamble 放在系统配置中强制注入，项目级关键规则放在 AGENTS.md 的 Preamble 段中，个人偏好不放 Preamble——这样分层清晰，冲突最少。

---

## Preamble 内容设计原则

### 核心原则：精简、明确、可执行

Preamble 的每一行都在消耗 Token，而且这个消耗是重复的。如果 Preamble 有 200 个 Token，频率设为 2，那么在 20 步的任务中 Preamble 总共消耗 2000 Token。如果 Preamble 扩到 500 Token，同样的任务就要消耗 5000 Token。因此 Preamble 内容的设计必须遵循"每行都有存在价值"的原则。

好的 Preamble 内容具备三个特征：

**精简**：每条规则用一句话表达，不展开解释。解释和背景信息放在 AGENTS.md 中，Preamble 只保留行为指令。

**明确**：每条规则有明确的触发条件和期望行为。"注意代码质量"不是好规则，"每次代码修改后运行 pnpm lint && pnpm typecheck"是好规则。

**可执行**：每条规则都对应一个模型可以执行的具体动作或约束。"遵循最佳实践"不可执行，"不要使用 any 类型"可执行。

### Preamble 内容的四个组成模块

一个设计良好的 Preamble 通常包含以下四个部分，按优先级排列：

**1. 核心身份（Core Identity）—— 一句话说明 Codex 在这个项目中的角色定位**

```text
你是这个 TypeScript 项目的代码代理，负责执行工程任务。
```

这看起来简单，但它设置了模型的基本行为框架。如果项目是一个 Python 数据分析项目，身份声明应该是"你是这个 Python 数据分析项目的代码代理"。如果项目有特殊的架构约束（如微服务、monorepo），也应该在身份中提及。核心身份不需要每次都改，但不同项目间的差异会让模型的行为模式有明显不同。

**2. 关键规则（Critical Rules）—— 3-5 条绝对不能违反的约束**

```text
- 使用 pnpm，不用 npm 或 yarn
- 每次修改后运行 pnpm test 确认测试通过
- 不要修改 migrations/ 目录下的文件
- 不要修改公开 API 的函数签名
- 所有新增代码必须有对应的测试
```

这些规则的选取标准是"违反后代价最高"。代价可以是：
- 构建失败（用了错误的包管理器）
- 测试全红（改了不该改的接口）
- 数据丢失（改了数据库迁移文件）
- 线上事故（改了公开 API 签名）
- 技术债累积（没有测试的新代码）

关键规则的数量控制在 3-5 条。超过 5 条，Preamble 过长，Token 成本上升，且模型对规则的遵从度会随着规则数量增加而下降——这是大语言模型的已知特性，规则越多，单条规则的遵从概率越低。

**3. 当前任务提醒（Task Reminder）—— 简短重述活跃任务的目标**

```text
当前任务：将 payment 模块从 callback 改为 async/await，不改变公开接口。
```

任务提醒帮助模型在长会话中保持对当前目标的聚焦。没有这条提醒，模型在处理到第 10 个文件时可能已经忘了最初的任务是什么，开始做与任务无关的"优化"。任务提醒应该是动态的——不同的任务需要不同的提醒内容。这要求在发起任务时同步更新 Preamble，或者在 config.toml 中使用占位符由 Codex 运行时替换。

实际操作中，最简单的方式是把任务描述的摘要写在 config.toml 的 `preamble` 字段中。每次开始新任务时更新这个字段。如果这不够灵活，可以把任务提醒放在 AGENTS.md 的 Preamble 段中，通过 Skill 或脚本在任务开始时自动更新。

**4. 反模式警告（Anti-pattern Warnings）—— 明确告知不要做什么**

```text
- 不要在修改代码时添加 TODO 注释
- 不要在测试中使用 setTimeout 或 sleep
- 不要引入新的第三方依赖
```

反模式警告针对项目中反复出现的特定问题。如果你的团队发现模型经常犯某种错误——比如总是倾向于引入新依赖而不是使用已有的工具函数——就把这个反模式写入 Preamble。这类内容应该基于实际观察和积累，不是凭想象列出的。

### 常见的 Preamble 反模式

**太长**：把整个 AGENTS.md 的内容复制到 Preamble。后果是每次注入消耗大量 Token，长任务的 Token 成本可能翻倍。Preamble 应该是 AGENTS.md 的"精华摘要"，不是全文复制。

**太通用**：写一堆放之四海而皆准的规则，比如"写出高质量的代码"、"遵循最佳实践"、"注意边界条件"。这些规则对模型的行为几乎没有影响，因为模型本来就会这么做。Preamble 的价值在于补充模型不知道的项目特定知识，而不是重复模型的训练内容。

**自相矛盾**：Preamble 中的规则与 AGENTS.md 或模型自身行为倾向冲突。例如 Preamble 写"每次修改都运行完整测试套件"，但 AGENTS.md 写"只运行相关文件的测试"。矛盾的指令会让模型在两者之间摇摆，行为不稳定。

**频繁变更**：每次执行步骤都换不同的 Preamble 内容。模型无法建立稳定的行为预期，规则的遵从度反而下降。Preamble 的内容应该在任务期间保持稳定。

### 一个完整的 Preamble 设计示例

以下是一个生产项目的 Preamble 设计，控制在 100 Token 以内：

```text
你是 TypeScript monorepo 项目的代码代理。
包管理器：pnpm。测试框架：vitest。
- 修改代码后运行 pnpm test -- <相关文件>
- 不要修改 packages/shared/ 下的公开接口
- 不要在 src/ 中引入 Node.js 特定 API（需要兼容浏览器）
- 新增函数必须包含 JSDoc 注释
- 不要使用 any 类型
```

这段 Preamble 包含了核心身份（TypeScript monorepo 代理）、关键工具提示（pnpm + vitest）、四条关键规则和一条反模式警告。总长度约 80 Token，即使频率设为 2（每两步注入一次），20 步任务的 Preamble Token 消耗也只有 800 Token，在可接受范围内。

---

## Preamble 的 Token 成本分析

### 计算模型

Preamble 的 Token 成本计算公式：

```text
总 Token 消耗 = Preamble 长度(Tokens) x 注入次数
注入次数 = floor(总执行步骤数 / preamble_frequency)
```

举例说明：

| Preamble 长度 | 频率 | 任务步骤数 | 注入次数 | Preamble 总 Token |
|---------------|------|-----------|---------|-------------------|
| 50 Token | 1 | 20 | 20 | 1,000 |
| 50 Token | 3 | 20 | 6 | 300 |
| 150 Token | 1 | 20 | 20 | 3,000 |
| 150 Token | 3 | 20 | 6 | 900 |
| 300 Token | 1 | 30 | 30 | 9,000 |
| 300 Token | 3 | 30 | 10 | 3,000 |

可以看到，Preamble 长度和频率对总 Token 消耗的影响都是线性的。在预算有限的场景下，有两个优化方向：

**减少长度**：从 300 Token 压缩到 50 Token，成本降为原来的 1/6。这意味着 Preamble 内容必须极度精炼，只保留最关键的 2-3 条规则。

**降低频率**：从每步注入改为每 3 步注入，成本降为原来的 1/3。但频率降低意味着规则遵从度的下降。对于安全敏感的项目，频率不应该低于 2。

### 成本与遵从度的权衡

Preamble 的根本目的是提高模型对关键规则的遵从度。但遵从度不是线性的——从频率 1 降到频率 2，遵从度可能只下降 5%；从频率 2 降到频率 5，遵从度可能下降 30%。这个非线性关系说明频率 2-3 是大多数场景的最佳平衡点。

以下是基于实际观察的推荐策略：

| 场景 | 推荐频率 | 推荐长度 | 理由 |
|------|---------|---------|------|
| 生产代码修改 | 1-2 | 80-120 Token | 安全面，宁可多花 Token |
| 常规功能开发 | 2-3 | 50-80 Token | 平衡成本和对齐 |
| 文档生成 | 3-4 | 30-50 Token | 不涉及代码修改，规则少 |
| CI/CD 自动化 | 2 | 50-80 Token | 无人值守，需要稳定对齐 |
| 学习与探索 | 不需要 | - | 短会话，漂移风险低 |

---

## Personality 系统：Friendly vs Pragmatic

### 什么是 Personality

Personality 是 Codex 的通信风格控制机制。它不改变模型的能力和推理过程，只改变模型与用户的交互方式——用什么语气说话、给多少解释、如何组织输出。

Personality 和 Preamble 是两个独立的配置维度。Preamble 控制"模型记住什么规则"，Personality 控制"模型怎么表达自己"。一个控制内容，一个控制形式。

在 Codex 的实现中，Personality 通过在系统提示中注入风格指令来生效。不同的 Personality 模式对应不同的指令文本，影响模型在生成响应时的风格选择。这不是简单的 temperature 或 sampling 参数调整，而是通过自然语言指令改变模型的行为偏好。

### Friendly 模式

Friendly 模式的核心特征是对话式、解释充分、主动提问。

**对话式**：模型使用更自然的语言风格，像是在和一个同事讨论问题，而不是在写技术文档。例如：

```text
Friendly 模式输出：
"我看了一下 auth/login.ts 的代码，发现了一个有意思的问题。
handleTokenExpiry 函数在处理过期 token 时确实会调用 invalidateToken()，
但它跳过了清除缓存的步骤。这可能导致用户在重新登录后仍然看到旧的
session 数据。我来修一下这个问题——在 invalidateToken() 调用之后
加上 clearCache()。你觉得这样处理合适吗？"
```

**解释充分**：模型会解释自己为什么做出某个决策，引用相关的设计原则或最佳实践。对于复杂的修改，会给出修改前后的对比和理由。

**主动提问**：当任务描述存在歧义或多种可行方案时，模型会主动向用户提问以获取更多信息，而不是凭猜测选择一个方案。

Friendly 模式适合以下场景：

- 学习和探索阶段：用户在理解代码库或探索方案，需要模型的解释来建立认知
- 不确定的需求：任务描述不够精确，需要通过对话逐步明确
- 教学和演示：向团队展示 Codex 的工作过程和推理链
- 复杂的架构决策：需要模型分析多种方案的利弊，而不是直接选一个

Friendly 模式的代价是 Token 消耗更高。每次响应都包含解释和上下文，这些内容消耗 Token 但不直接推进任务。在一个 20 步的任务中，Friendly 模式可能比 Pragmatic 模式多消耗 30-50% 的 Token。

### Pragmatic 模式

Pragmatic 模式的核心特征是直接、简洁、行动优先。

**直接**：模型直接输出执行结果，不铺垫背景、不解释原因。例如：

```text
Pragmatic 模式输出：
"已在 auth/login.ts:48 添加 clearCache() 调用。
运行 pnpm test -- auth/login.test.ts：全部通过。"
```

**简洁**：只输出与任务直接相关的信息，不展开额外分析，不主动提及与当前任务无关的观察。

**行动优先**：当存在歧义时，模型基于上下文选择最合理的方案直接执行，而不是停下来提问。只有在信息严重不足时才会请求用户输入。

Pragmatic 模式适合以下场景：

- 生产任务执行：目标明确，不需要讨论，直接做完
- CI/CD 自动化：无人值守，需要直接输出结果
- 批量操作：大量重复任务，每一步都解释会严重拖慢进度
- 高频日常使用：已经熟悉模型行为模式，不需要额外解释
- codex exec 模式：脚本化运行，输出需要结构化和可解析

Pragmatic 模式在 Token 消耗上更高效。省略的解释和铺垫直接减少了每步的输出 Token。但代价是用户对模型决策过程的理解减少——如果模型做了一个错误的选择，Pragmatic 模式下你可能不容易发现它为什么选错了。

### 两种模式的对比

| 维度 | Friendly | Pragmatic |
|------|----------|-----------|
| 输出长度 | 长（含解释和背景） | 短（只含结果） |
| 交互频率 | 高（主动提问） | 低（直接执行） |
| Token 消耗 | 较高 | 较低 |
| 适用阶段 | 探索、学习、决策 | 执行、自动化、批量 |
| 可观测性 | 高（推理链透明） | 低（只看到结果） |
| 任务速度 | 较慢（多轮对话） | 较快（少轮次完成） |
| 对任务精度的要求 | 较低（可讨论） | 较高（需要一次描述清楚） |

### Personality 的配置方式

Personality 在 config.toml 中配置：

```toml
# .codex/config.toml

# 设置默认 Personality
personality = "pragmatic"
```

也可以通过命令行参数在单次会话中覆盖：

```bash
# 使用 Friendly 模式探索代码库
codex --personality friendly "分析 auth 模块的架构设计"

# 使用 Pragmatic 模式执行修复
codex --personality pragmatic "修复 auth/login.ts 第 47 行的 token 过期处理 bug"
```

命令行参数优先于 config.toml 配置。这样可以在项目级设置默认的 Pragmatic 模式，在需要讨论时通过命令行临时切换到 Friendly 模式。

### Personality 如何影响工具使用

Personality 不只影响输出文本的风格，还会间接影响工具调用策略：

**Friendly 模式**下的工具使用倾向于"保守渐进"：

- 更多使用 Ask 模式先调研再动手
- 倾向于先读取更多文件建立全局理解
- 在修改前展示计划并等待确认
- 修改后主动运行验证并解释结果

**Pragmatic 模式**下的工具使用倾向于"高效直接"：

- 倾向于直接执行修改，跳过调研阶段
- 只读取与当前修改直接相关的文件
- 使用 Plan 模式时生成的计划更简洁
- 修改后运行验证但不解释过程，只报告结果

这种差异在单次任务中可能不明显，但在批量操作和长会话中会累积成显著的效率差异。一个 20 个文件的批量重构，Friendly 模式可能需要 40-50 步（每步都解释），Pragmatic 模式可能只需要 25-30 步。

---

## 组合配置：Preamble + Personality

### 生产配置方案

生产环境的核心需求是：稳定、高效、可预测。配置目标是用最少的 Token 消耗达到最高的规则遵从度。

```toml
# .codex/config.toml —— 生产环境配置

# Pragmatic 模式：直接执行，不解释
personality = "pragmatic"

# Preamble：精简到关键规则，80 Token 以内
preamble = """
TS monorepo 代理。pnpm + vitest。
- 修改后运行 pnpm test -- <file>
- 不改 packages/shared/ 公开接口
- 不引入新依赖
- 不用 any
- 改完输出变更摘要
"""

# 频率 2：每两步注入一次，平衡成本和对齐
preamble_frequency = 2
```

对应的 AGENTS.md 包含完整的项目上下文，但不重复 Preamble 的内容：

```markdown
# AGENTS.md

## Project Context
- TypeScript monorepo，pnpm workspaces 管理
- 主包：packages/app（前端）、packages/server（后端）、packages/shared（共享类型和工具）
- 入口文件：packages/app/src/main.ts、packages/server/src/index.ts

## Commands
- 安装依赖：pnpm install
- 代码检查：pnpm lint
- 类型检查：pnpm typecheck
- 测试（全部）：pnpm test
- 测试（单文件）：pnpm test -- <file>
- 构建：pnpm build

## Working Rules
- 新功能先在对应包的 tests/ 目录写测试
- 公开 API 变更需要同步更新 packages/shared/ 的类型定义
- 组件遵循 packages/app/src/components/ 下的目录组织规范
- 样式使用 CSS Modules，不用 styled-components

## Safety Boundaries
- 不修改 .env* 文件
- 不修改数据库迁移文件
- 不执行 pnpm publish
```

这套配置的工作方式是：

1. 会话启动时，Codex 读取完整的 AGENTS.md（约 40 行）了解项目全貌
2. 在执行过程中，Preamble 每 2 步注入一次（约 80 Token），提醒模型关键规则
3. Pragmatic 模式确保输出简洁，不浪费 Token 在解释上
4. 整体的 Token 消耗是受控的：AGENTS.md 一次性消耗 + Preamble 周期性消耗 + 精简输出

### 学习配置方案

学习和探索场景的核心需求是：可理解、可交互、可追问。配置目标是让 Codex 充分解释推理过程，帮助用户建立对代码库的理解。

```toml
# .codex/config.toml —— 学习/探索配置

# Friendly 模式：充分解释，主动提问
personality = "friendly"

# Preamble：包含更多上下文信息，允许更长
preamble = """
你是这个项目的技术导师，帮助开发者理解代码库。
- 在修改代码前先解释为什么要这样修改
- 指出修改涉及的模块和依赖关系
- 如果有多种可行方案，列出各方案的利弊
- 使用项目中的实际代码作为示例来解释概念
- 当用户的问题不够具体时，先澄清再回答
"""

# 频率 3：学习场景下漂移容忍度更高，可以降低频率
preamble_frequency = 3
```

这套配置的工作方式是：

1. Friendly 模式让模型倾向于解释、讨论和提问
2. Preamble 定义了"导师"角色，引导模型的教学行为
3. 较低的注入频率降低了 Token 成本，学习场景对规则遵从度的要求相对较低
4. 用户可以通过多轮对话深入理解代码，而不是一次性拿到修改结果

### CI/CD 自动化配置方案

CI/CD 场景是 Pragmatic 模式的极端应用——完全无人值守，输出需要结构化。

```toml
# .codex/config.toml —— CI/CD 配置

personality = "pragmatic"

preamble = """
PR review 代理。只读模式。
- 只输出结构化 findings（文件:行号:问题:建议）
- 不修改任何文件
- 不输出解释性文本
- 问题按严重程度排序：error > warning > info
"""

preamble_frequency = 2
```

这套配置确保输出可以被脚本解析——每行都是一个 finding，格式统一，没有多余的文本干扰。

---

## Preamble 和 Personality 对任务完成率的影响

### 度量方法

Preamble 和 Personality 的效果可以通过任务完成率来量化。定义三个指标：

**规则遵从率**：模型遵守 Preamble 中列出的关键规则的比例。统计方法：在每次任务执行中检查模型是否违反了 Preamble 中的任何一条规则。如果 Preamble 有 5 条规则，执行了 20 步，那么有 100 个"规则检查点"。违反次数 / 检查点总数 = 违反率，1 - 违反率 = 遵从率。

**一次性完成率**：任务在第一轮执行中就达到完成条件（Done-when）的比例。不需要人工干预、不需要返工、不需要补充指令。

**Token 效率**：每 1000 Token 产出的有效代码行数或有效变更数。有效变更是指最终被保留（未回滚、未推翻）的修改。

### 不同配置的预期效果

基于对 Codex 行为模式的观察，不同 Preamble 和 Personality 配置组合的效果预期如下：

| 配置组合 | 规则遵从率 | 一次性完成率 | Token 效率 | 适用场景 |
|---------|-----------|-------------|-----------|---------|
| Pragmatic + 精简 Preamble (50-80 Token, 频率 2) | 85-90% | 70-80% | 高 | 生产开发 |
| Pragmatic + 无 Preamble | 60-70% | 55-65% | 最高 | 简单任务 |
| Friendly + 精简 Preamble (50-80 Token, 频率 3) | 80-85% | 60-70% | 中 | 学习探索 |
| Friendly + 详细 Preamble (150-200 Token, 频率 2) | 88-93% | 65-75% | 低 | 复杂架构讨论 |
| Pragmatic + 详细 Preamble (150-200 Token, 频率 1) | 92-97% | 75-85% | 中低 | 安全敏感任务 |
| 无 Preamble + Friendly | 55-65% | 50-60% | 最低 | 闲聊式探索 |

几个值得注意的规律：

**有 Preamble 比无 Preamble 的规则遵从率平均高 20-25%**。这是 Preamble 最核心的价值。即使是 50 Token 的精简 Preamble，也能显著提升模型对关键规则的遵从度。

**Preamble 长度的影响是非线性的**。从 0 到 50 Token 的提升最大（约 20%），从 50 到 150 Token 的提升递减（约 5-8%），超过 200 Token 后几乎不再有提升，甚至可能因为规则过多导致遵从度下降。

**Personality 对规则遵从率的影响不如 Preamble 直接**，但它影响一次性完成率。Pragmatic 模式的一次性完成率通常比 Friendly 模式高 5-10%，因为 Pragmatic 模式下模型更倾向于直接执行完整任务，而不是中途停下来讨论。

### 优化策略

基于度量结果，可以制定以下优化策略：

**初始配置**：从 Pragmatic + 精简 Preamble（50-80 Token，频率 2）开始。这是大多数项目的最佳起点。

**观察阶段**：收集 20-30 个任务的执行数据，统计规则违反的具体情况。记录哪条规则被违反了，违反发生在第几步，违反时的上下文是什么。

**针对性调整**：如果发现某条规则反复被违反：
- 检查该规则的表述是否足够明确
- 考虑将该规则移到 Preamble 的更靠前位置（靠前的规则遵从度更高）
- 如果违反集中在长会话的后半段，考虑提高注入频率

**成本控制**：如果 Token 消耗超出预算：
- 优先压缩 Preamble 长度（收益最大）
- 然后考虑降低频率（从 2 降到 3）
- 最后考虑切换到 Pragmatic 模式（如果当前是 Friendly）

### 建立基准

建议每个团队在引入 Preamble 和 Personality 配置时，先建立一个简单的基准：

1. 在不配置 Preamble 的情况下，用 20 个典型任务测试 Codex 的表现，记录规则违反次数和一次完成率
2. 引入精简 Preamble（50-80 Token，频率 2），用同样的 20 个任务再测一次
3. 比较两组数据，量化 Preamble 的实际效果
4. 根据结果调整 Preamble 内容和频率

这个基准不需要复杂的工具——一个电子表格就够。关键是有意识地度量和对比，而不是凭感觉判断"Preamble 有没有用"。

---

## Preamble 设计的进阶技巧

### 动态 Preamble

在固定 Preamble 的基础上，Codex 支持通过 Skill 机制实现动态 Preamble——根据当前任务类型自动切换 Preamble 内容。

具体做法是为不同的任务类型创建不同的 Preamble 文件，通过 Skill 在任务开始时选择并注入对应的 Preamble：

```text
preambles/
  bugfix.md       -- "修复 bug 时优先保持最小变更范围，不改无关代码"
  refactor.md     -- "重构时优先保持行为等价，每步验证测试通过"
  feature.md      -- "新功能开发时优先遵循已有模式和目录结构"
  review.md       -- "代码审查时只输出 findings，不修改任何文件"
```

每个 Preamble 文件保持精简（50-80 Token），但内容针对特定任务类型优化。Skill 根据用户的指令关键词（"修复"、"重构"、"添加"、"审查"）选择对应的 Preamble。

动态 Preamble 的优势是每条规则都更贴合当前任务的上下文。一个 bug 修复任务不需要看到"新功能开发时遵循已有模式"的规则，反之亦然。这减少了规则数量，提高了每条规则的权重。

### 规则优先级排序

Preamble 中的规则排列顺序影响模型的遵从权重。排在前面的规则获得更高的注意力权重。因此，规则应该按违反后果的严重程度排序：

```text
- 不要修改 .env* 文件（违反后果：密钥泄露）
- 不要修改 migrations/ 目录（违反后果：数据丢失）
- 每次修改后运行 pnpm test（违反后果：引入未发现的 bug）
- 不使用 any 类型（违反后果：类型安全退化）
- 新增函数包含 JSDoc（违反后果：文档不完整）
```

安全相关的规则排在最前面，编码风格相关的规则排在后面。这种排列方式确保即使模型在长会话中只"记住"了 Preamble 的前两条规则，记住的也是最关键的那些。

### A/B 测试 Preamble 内容

对于高频使用的团队，值得对 Preamble 内容进行 A/B 测试。方法是将团队分成两组，每组使用不同的 Preamble 配置，在相同的任务集上比较结果：

```text
组 A（控制组）：
Preamble = "修改后运行测试，不改公开接口"

组 B（实验组）：
Preamble = "每次代码修改后立即运行 pnpm test -- <修改的文件>。
           如果测试失败，回滚修改并报告失败原因。
           不要修改 packages/shared/src/ 下以 export 开头的函数签名。"
```

记录两组在 50 个任务上的规则违反次数和一次完成率。如果实验组显著优于控制组，说明更具体的规则表述确实有效。如果差异不大，说明控制组的简短表述已经足够，不需要增加 Preamble 长度。

---

## 与其他 Codex 机制的协作

### Preamble 与 AGENTS.md 的分工

AGENTS.md 提供"知道什么"，Preamble 强调"记住什么"。一个常见的错误是把 AGENTS.md 中已有的规则原封不动地复制到 Preamble 中。正确的做法是：

- AGENTS.md 包含完整的项目上下文：架构、命令、规范、目录结构
- Preamble 只包含 AGENTS.md 中"最不能违反"的 3-5 条规则的摘要

两者互补而不是重复。模型在会话开始时读取 AGENTS.md 建立完整理解，在执行过程中通过 Preamble 周期性地收到关键规则的提醒。

### Preamble 与 Compaction 的交互

Compaction 是 Codex 在长会话中压缩上下文的机制（详见本系列第 28 篇）。当上下文接近窗口上限时，Codex 会压缩早期对话内容以腾出空间。Compaction 之后，部分 AGENTS.md 的内容可能被压缩或丢失，但 Preamble 不受影响——因为它是周期性注入的，不是一次性加载的。

这意味着 Preamble 在长会话中的重要性会随着 Compaction 次数的增加而上升。在一个经历过 2-3 次 Compaction 的长会话中，AGENTS.md 的详细内容可能已经被压缩成摘要，但 Preamble 依然保持完整。这就是为什么 Preamble 必须包含最关键规则的完整表述，而不是指向 AGENTS.md 的引用——因为 AGENTS.md 可能已经不在上下文中了。

### Preamble 与 Reasoning Effort 的配合

Reasoning Effort 控制模型的推理深度（详见本系列第 30 篇）。更高的推理深度意味着模型在内部进行更多的规划、验证和回溯。Preamble 与 Reasoning Effort 的配合策略：

- **medium + 精简 Preamble**：日常任务的标准配置。中等推理深度已经能处理大部分任务，精简 Preamble 提供基本规则提醒。
- **high + 详细 Preamble**：复杂重构或安全敏感任务。高推理深度让模型更仔细地检查每一步，详细 Preamble 确保检查标准明确。
- **xhigh + 精简 Preamble**：跨系统协调任务。极高推理深度本身已经能保证高质量，Preamble 只需提供最关键的安全边界。

Reasoning Effort 的提升不能替代 Preamble。推理深度控制的是"想多少"，Preamble 控制的是"按什么规则想"。即使是最高的推理深度，如果模型忘了"不要修改迁移文件"这个约束，它也可能在深度推理后做出违反约束的修改。

---

## 常见问题与排查

### Preamble 似乎没有效果

可能原因及排查方式：

**1. Preamble 太通用。** 如果 Preamble 写的是"注意代码质量"之类的通用表述，对模型行为几乎没有影响。检查每条规则是否具有项目特异性——去掉任何"模型本来就会做"的内容。

**2. Preamble 与其他指令冲突。** 检查 AGENTS.md、开发者指令和 Preamble 之间是否有矛盾的表述。矛盾会让模型在多个信号之间摇摆，最终忽略所有信号。

**3. 频率太低。** 如果频率设为 5 以上，Preamble 在短任务中可能只注入 1-2 次，效果不明显。尝试将频率提高到 2，观察是否改善。

**4. 规则不可执行。** "保持代码整洁"不可执行。"每次修改后运行 pnpm lint"可执行。检查规则是否包含具体的触发条件和期望行为。

### Preamble 导致 Token 超限

如果总 Token 消耗超出预期：

**1. 测量 Preamble 的实际占比。** 从会话日志中统计 Preamble 的 Token 消耗占总消耗的比例。如果超过 20%，说明 Preamble 太长或频率太高。

**2. 压缩 Preamble 内容。** 逐条审查规则，删除任何"锦上添花"的内容，只保留"没有就不行"的规则。

**3. 降低频率。** 从频率 1 降到 2 通常只带来很小的规则遵从度下降，但能省一半的 Preamble Token。

**4. 使用动态 Preamble。** 不同任务类型使用不同的精简 Preamble，避免一条 Preamble 覆盖所有场景。

### Friendly 和 Pragmatic 都不满意

Personality 是一个连续的光谱，Friendly 和 Pragmatic 是两个预设锚点。如果两个预设都不完全满意，可以通过自定义开发者指令来微调：

```toml
# 在 config.toml 中补充开发者指令
developer_instructions = """
输出风格：直接给出修改结果，不需要解释代码逻辑。
但在遇到多种可行方案时，简要列出方案名和推荐理由，不超过 3 行。
修改完成后只报告测试结果，不解释测试内容。
"""
```

这种方式在 Pragmatic 的基础上加入适度的方案讨论，形成介于 Friendly 和 Pragmatic 之间的自定义风格。关键是开发者指令要具体、可执行，不要写"中等详细程度"这类模糊描述。

---

## 小结

Preamble 和 Personality 是 Codex 行为调控的两个精细维度。Preamble 解决"长会话规则漂移"问题，通过周期性注入关键规则摘要保持模型与项目约束的对齐。Personality 解决"通信风格适配"问题，通过 Friendly 或 Pragmatic 模式让模型的输出风格匹配使用场景。

两者的配置都需要在效果和成本之间做出权衡。Preamble 的长度和频率直接影响 Token 消耗，Personality 的选择影响输出 Token 和交互轮次。合理的配置策略是从精简的 Pragmatic + 短 Preamble 开始，根据实际度量数据逐步调整——而不是一开始就追求完美的配置。

核心设计原则：Preamble 贵精不贵多，Personality 看场景不看偏好。Preamble 的每条规则都应该有"违反后果"作为存在的理由，Personality 的选择应该基于任务性质而不是个人偏好。生产任务用 Pragmatic 提高效率，学习探索用 Friendly 建立理解，两者不需要也不能混在同一个会话中。
