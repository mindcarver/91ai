<!--
调研来源（不发布，仅记录）：
1. OpenAI 官方文档 developers.openai.com/codex/concepts/memories — Memories 概念与配置
2. OpenAI Codex 源码 openai/codex — codex-rs/memories/ 记忆模块实现
3. OpenAI 官方文档 developers.openai.com/codex/config-reference — memories.* 配置项完整参考
4. OpenAI 官方文档 developers.openai.com/codex/cli/slash-commands — /memories 命令
版本基准: 2026 年 6 月
-->

# Codex CLI Memories 记忆系统：让 Codex 记住你的项目偏好

> TL;DR：Memories 是 Codex 的跨会话知识保留机制。每次会话结束后，Codex 可以从对话中提取关键信息（项目约定、技术决策、用户偏好），合并到全局记忆库。下次开新会话时，这些记忆会被注入上下文，让 Codex 不需要你重复解释"我们项目用 TypeScript 严格模式、测试用 Vitest、提交信息用中文"。默认关闭，需要 `features.memories = true` 启用。用 `/memories` 命令可以在会话中随时开关。

---

## 1. 记忆系统解决什么问题

用 Codex 做过几个项目的开发者大概都遇到过这种场景：

你在项目 A 里花了一周时间，反复告诉 Codex"我们的代码风格是 X、数据库用 Y、部署流程是 Z"。到了项目 B，一切归零，你又得从头解释一遍。甚至在同一个项目里，开一个新的 CLI 会话，Codex 也完全不记得上次你们讨论过的技术决策。

这个问题的根源是：**Codex 的每次会话都是独立的**。会话结束后，对话历史不会自动影响下次会话的行为。AGENTS.md 解决了一部分问题（项目级指令持久化），但它需要你手动编写和维护。你不可能在 AGENTS.md 里记录每一次技术讨论的结论。

记忆系统填补了这个空白。它做三件事：

1. **提取**：会话结束后，从对话中提取有价值的信息
2. **合并**：把新提取的信息整合到全局记忆库，去重和更新
3. **注入**：下次会话开始时，把相关的记忆注入到上下文中

用日常类比：AGENTS.md 是你写在白板上的项目规范（所有人都能看到，但你得自己写）。Memories 是 Codex 自己的笔记本——它会自动把重要信息记下来，下次遇到类似场景时翻出来看。

## 2. 记忆系统工作原理

### 三个阶段

记忆系统的运转分三个阶段，对应三个不同的模型调用：

**阶段一：提取（Extract）**

当一次会话（Codex 内部叫 rollout）结束并进入空闲状态后，Codex 会用一个单独的模型调用来分析这次对话。提取模型的任务是：这次对话里有没有值得记住的东西？

值得记住的信息包括：
- 用户明确表达的项目偏好（"我们不用 Jest，用 Vitest"）
- 技术决策和理由（"选 MongoDB 而不是 PostgreSQL 是因为需要灵活的 schema"）
- 用户纠正过的错误行为（"不要用 `any` 类型"）
- 项目特定的约定（"API 路由统一用 kebab-case"）

提取结果是一条条独立的记忆条目（raw memory），每条包含内容摘要和来源会话 ID。

**阶段二：合并（Consolidation）**

原始记忆条目会随着时间积累。当积累到一定程度，或者在特定时机（如启动时），Codex 会用另一个模型调用来合并记忆。合并做的事情：
- 去掉重复或矛盾的条目
- 合并相关联的信息为更完整的条目
- 更新已过时的信息
- 删除太久没用的记忆

合并后生成的是全局记忆（consolidated memory），这是注入阶段实际使用的内容。

**阶段三：注入（Injection）**

每次新会话启动时，Codex 会从全局记忆库中选取相关的记忆，注入到会话的上下文中。选取标准包括记忆的最近使用时间、与当前项目的相关性等。

注入发生在 AGENTS.md 处理之后。也就是说，记忆的优先级低于 AGENTS.md——如果两者冲突，AGENTS.md 的指令优先。

### 触发时机

| 阶段 | 何时触发 | 用什么模型 |
|------|---------|-----------|
| 提取 | 会话空闲超过 `min_rollout_idle_hours`（默认 6 小时）后 | `memories.extract_model` 或默认模型 |
| 合并 | Codex 启动时，扫描空闲会话 | `memories.consolidation_model` 或默认模型 |
| 注入 | 每次新会话开始时 | 不需要额外调用，直接注入 |

## 3. 启用记忆系统

### 前提条件

记忆系统默认关闭。你需要在 `config.toml` 中显式启用：

```toml
[features]
memories = true
```

启用后，Codex 会在后续会话中开始提取和合并记忆。注意：**启用之前的会话不会被追溯提取**——记忆只对启用后的新会话生效。

### /memories 命令

启用后，你可以在 TUI 中用 `/memories` 随时调整：

```
> /memories
```

Codex 会让你选择：

1. **使用现有记忆**：`memories.use_memories = true`，注入已有记忆到当前会话
2. **生成新记忆**：`memories.generate_memories = true`，从当前会话提取记忆
3. **两者都关**：停止记忆的注入和生成

这个命令不需要重启 Codex，立即生效。

## 4. 配置项详解

所有记忆相关的配置项都在 `config.toml` 的 `[memories]` 段下。

### 基础开关

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `features.memories` | `false` | 总开关，必须显式启用 |
| `memories.use_memories` | `true` | 注入已有记忆到新会话 |
| `memories.generate_memories` | `true` | 从新会话中提取记忆 |

注意逻辑：`features.memories` 是功能开关，`memories.use_memories` 和 `memories.generate_memories` 是行为开关。如果 `features.memories = false`，后面两个开关都不起作用。

### 模型选择

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `memories.extract_model` | 未设置 | 提取阶段使用的模型（不设则用会话模型） |
| `memories.consolidation_model` | 未设置 | 合并阶段使用的模型（不设则用会话模型） |

为什么要单独设置模型？因为提取和合并是后台操作，不需要用最强的模型。很多开发者会设一个更便宜的模型来处理记忆，省 token：

```toml
[memories]
extract_model = "gpt-5.4-mini"
consolidation_model = "gpt-5.4-mini"
```

### 容量控制

| 配置项 | 默认值 | 范围 | 说明 |
|--------|--------|------|------|
| `max_raw_memories_for_consolidation` | 256 | 1–4096 | 合并时最多处理的原始记忆条目数 |
| `max_rollout_age_days` | 30 | 0–90 | 最多提取多少天前的会话 |
| `max_rollouts_per_startup` | 16 | 1–128 | 每次启动最多处理多少个候选会话 |
| `max_unused_days` | 30 | 0–365 | 多久没用过的记忆会被清理 |

这些参数控制记忆的生命周期。默认值适合大多数场景。如果你发现记忆太占 token，可以降低 `max_raw_memories_for_consolidation` 或缩短 `max_unused_days`。

### 提取条件

| 配置项 | 默认值 | 范围 | 说明 |
|--------|--------|------|------|
| `min_rollout_idle_hours` | 6 | 1–48 | 会话空闲多久后才会被提取 |
| `min_rate_limit_remaining_percent` | 25 | 0–100 | API 速率限制剩余百分比低于此值时不提取 |

`min_rollout_idle_hours` 设为 6 意味着：你关掉一个会话后，Codex 会等 6 小时才提取。这个设计是为了避免在活跃开发期间频繁触发提取——你可能随时回来继续这个会话。

`min_rate_limit_remaining_percent` 是一个保护机制。记忆提取需要额外的 API 调用。如果你的 API 配额快用完了，Codex 会跳过提取，优先保证你的正常使用。

### 外部上下文过滤

```toml
[memories]
disable_on_external_context = true
```

设为 `true` 时，使用了 MCP 工具调用、Web 搜索或工具搜索的会话不会生成记忆。理由是这些会话包含了外部信息，提取出的记忆可能不准确或者过时。

## 5. 记忆的生命周期

一个记忆从产生到消亡的完整路径：

```
会话结束
  ↓
空闲 6 小时（min_rollout_idle_hours）
  ↓
启动时检查：会话年龄 ≤ 30 天（max_rollout_age_days）
  ↓
API 配额 ≥ 25%（min_rate_limit_remaining_percent）
  ↓
提取模型分析对话 → 生成 raw memory
  ↓
等待合并（启动时或积累到阈值时）
  ↓
合并模型去重整合 → 生成 consolidated memory
  ↓
新会话开始 → 注入相关记忆
  ↓
30 天未被使用（max_unused_days）→ 标记为不活跃
  ↓
下次合并时清理
```

几个关键时间节点：
- **6 小时**：会话必须空闲这么久才会被考虑提取
- **30 天**：超过这个年龄的会话不再提取，超过这个年龄未使用的记忆会被清理
- **16 个**：每次启动最多处理 16 个候选会话

## 6. 记忆与上下文的关系

记忆注入到上下文时，它占的是上下文窗口的一部分。这意味着：

1. **记忆和对话历史、AGENTS.md、工具输出共享同一个窗口**——记忆太多会挤压其他内容
2. **记忆的优先级低于 AGENTS.md**——如果两者冲突，以 AGENTS.md 为准
3. **记忆会被 compaction 处理**——如果触发了 `/compact` 或自动压缩，记忆摘要也可能被压缩

所以记忆不是越多越好。好的记忆是精炼的、准确的、项目相关的。这也是为什么合并阶段很重要——它把零散的原始记忆整合为更紧凑的条目。

### 记忆 vs AGENTS.md vs developer_instructions

| 维度 | AGENTS.md | Memories | developer_instructions |
|------|-----------|----------|----------------------|
| 谁写的 | 开发者手动编写 | Codex 自动提取 | 开发者在 config.toml 中设置 |
| 作用范围 | 项目级 | 全局跨项目 | 用户级 |
| 更新方式 | 手动编辑 | 自动提取+合并 | 手动编辑 config.toml |
| 优先级 | 最高 | 中（低于 AGENTS.md） | 取决于配置层级 |
| 内容类型 | 明确的规范和约定 | 隐式的偏好和决策 | 额外的开发者指令 |
| 适合记录 | 代码风格、目录结构、技术栈 | 用户偏好、技术决策、历史教训 | 临时指令、实验性配置 |

三者互补，不冲突。一个推荐的使用方式：
- **AGENTS.md**：写项目硬性规范（"这个项目用 Python 3.12、用 Ruff 做格式化"）
- **Memories**：让 Codex 自己记住你的软性偏好（"我偏好函数式写法"、"命名要有意义"）
- **developer_instructions**：临时的、实验性的指令

## 7. 最佳实践

### 什么时候该用记忆

- 你在多个项目中有个人编码偏好，不想每次都重复
- 你和 Codex 在一个项目上长期协作，有很多技术决策需要保留
- 你希望 Codex 从你的纠正中学习（"不要用 var，用 const"）

### 什么时候不该用记忆

- 你只用 Codex 做一次性任务（记忆没有积累价值）
- 你对 API 配额很敏感（记忆的提取和合并需要额外的 API 调用）
- 你的项目规范已经很完善地写在 AGENTS.md 里了（记忆不会带来额外收益）

### 推荐配置

个人开发者：

```toml
[features]
memories = true

[memories]
extract_model = "gpt-5.4-mini"
consolidation_model = "gpt-5.4-mini"
max_raw_memories_for_consolidation = 128
max_unused_days = 14
```

用便宜的模型处理记忆，保持较小的记忆库，两周没用过的就清理。

团队项目：

```toml
[features]
memories = true

[memories]
disable_on_external_context = true
max_raw_memories_for_consolidation = 64
min_rollout_idle_hours = 12
```

外部上下文的会话不提取（避免不准确的信息），等更长时间再提取（确保会话真的结束了），保持较小的记忆库。

## 8. 常见问题

### 记忆不生效怎么办？

检查清单：
1. `features.memories = true` 是否在 config.toml 中设置
2. `memories.use_memories` 是否为 `true`（默认是，但 /memories 可能关掉了）
3. 会话是否空闲超过 `min_rollout_idle_hours`
4. 用 `/status` 查看 token 用量，确认 API 配额是否足够
5. 用 `/debug-config` 确认配置层级没有覆盖你的设置

### 记忆占太多 token 怎么办？

降低 `max_raw_memories_for_consolidation` 和缩短 `max_unused_days`。你也可以在 config.toml 中设置 `tool_output_token_limit` 来限制单次工具输出的 token 上限，间接影响记忆的大小。

### 记忆不准确怎么办？

记忆是自动提取的，不可能 100% 准确。如果某条记忆有问题：
- 在新会话中直接告诉 Codex "之前记忆中的 X 是不对的，应该是 Y"——这次纠正会被提取为新记忆，在合并时更新旧的
- 如果问题严重，可以关闭 `memories.generate_memories`，只保留 `memories.use_memories`，这样已有记忆继续使用但不生成新的

### 记忆和 Chronicle 是什么关系？

Codex 还有一个 Chronicle 功能（在官方文档的导航中可以看到）。Chronicle 是更高级的记忆机制，侧重于长期的知识图谱构建。Memories 是基础的文本级记忆提取。两者可以共存，但 Chronicle 目前还在开发中，具体功能以官方文档为准。

---

## 延伸阅读

- [第 28 篇：AGENTS.md 项目指令文件](28-agents-md.md) — 项目级的持久化指令，和记忆互补
- [第 21 篇：个性化与 UI 命令](21-cmd-ui.md) — /memories 命令的详细用法
- [第 11 篇：上下文管理](11-context-management.md) — /compact 和 token 预算管理
- [第 22 篇：配置文件体系总览](22-config-overview.md) — config.toml 的加载优先级
- [OpenAI 官方文档：Memories](https://developers.openai.com/codex/concepts/memories) — 最新官方说明

<!-- CONTACT-START -->
<!-- Auto-generated by scripts/inject-contact.sh — 单一真实源: docs/_snippets/contact.html -->
<div align="center">

**「阿新聊 AI」同步更新，欢迎关注**

<br>

<table>
<tr>
<td align="center">📢<br><b>微信公众号</b><br>阿新聊ai</td>
<td align="center">🎵<br><b>抖音</b><br>阿新聊ai</td>
<td align="center">📕<br><b>小红书</b><br>阿新聊ai</td>
<td align="center">💬<br><b>微信</b><br>mindcarver</td>
</tr>
</table>

🌐 AI 社区 · <a href="https://91aihub.com/">91aihub.com</a>

</div>
<!-- CONTACT-END -->
