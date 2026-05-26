# Codex 不是代码补全，而是工程代理工作台

**TL;DR：** OpenAI Codex 不是"更强的 ChatGPT"，也不是"更聪明的代码补全"。它是一套围绕 Agent Loop 构建的工程代理工作台，横跨 CLI、IDE Extension、Cloud Agent 和桌面 App 四种形态。理解 Codex 的关键是理解它的执行架构——从 Prompt 构造、Responses API 推理、工具调用迭代到上下文窗口管理——而不是把它当成一个聊天界面。

## 错误心智模型和正确心智模型

大多数人第一次接触 Codex 时，会把它归类到"代码补全工具"或"更强的 ChatGPT"。这个归类在功能层面不算完全错——Codex 确实能补全代码、能聊天——但它会严重误导你对 Codex 的使用方式和工程期望。

### 三种常见错误心智模型

**错误一："更强的 ChatGPT"。** ChatGPT 是一问一答的对话系统。你输入问题，它输出回答。即使 ChatGPT 能写代码，它的执行边界也停留在文本输出。Codex 的本质区别在于它有一个 Agent Loop：接收任务，构造 Prompt，调用模型推理，执行工具（读写文件、运行命令），拿到结果，再次推理，再次执行，直到任务完成。ChatGPT 是"生成文本"，Codex 是"在受控环境中执行工程操作"。把 Codex 当成 ChatGPT 来用，等于买了一台数控机床只用来砸核桃。

**错误二："更聪明的代码补全"。** GitHub Copilot、Codeium 这类工具的核心模式是"你在编辑器里打字，它在光标位置补全"。它们的工作范围是当前文件、当前光标。Codex 的工作范围是整个仓库：它可以跨文件搜索、修改多个文件、运行测试、执行 shell 命令、连接外部 API。代码补全是单点操作，Codex 是多步骤工程流程。

**错误三："云端代码生成服务"。** Devin、Factory 这类产品强调"给一个需求，全自动生成代码"。Codex Cloud 确实有类似的异步执行能力，但 Codex 的四形态设计意味着它不只在云端运行。CLI 在你本地终端执行，IDE Extension 在你编辑器里协作，Cloud 在 OpenAI 基础设施上异步跑，App 在桌面上管理多个并行线程。把 Codex 等同于云端代码生成，会忽略它作为本地工程工具的核心价值。

### 正确心智模型：工程代理工作台

正确的理解方式是把 Codex 看作一个工程代理工作台（Engineering Agent Workbench）。这个定位包含三个关键属性：

1. **代理性（Agentic）**：Codex 不是被动等待指令的工具，而是能自主规划、执行、验证的代理。你给它一个任务描述，它自己决定读哪些文件、改哪些代码、跑哪些命令、什么时候算完成。
2. **工程性（Engineering）**：Codex 的输出不只是文本，而是真实的工程产物——代码修改、测试结果、PR、文档。它操作的是真实的文件系统和命令环境。
3. **工作台性（Workbench）**：Codex 不是一个单一功能，而是一套可配置、可扩展、可组合的工程系统。你可以通过 AGENTS.md 注入项目知识，通过 config.toml 控制行为，通过 MCP 连接外部工具，通过 Skills 封装可复用流程。

## Codex 的四形态定位

Codex 不是一个产品，而是一套产品。四种形态共享同一个核心 harness（代理循环和执行逻辑），但在交互方式、执行环境和适用场景上有本质区别。

### CLI：本地终端的 Coding Agent

Codex CLI 是整个系统的起点和核心。它在你的终端里运行，直接操作你的本地文件系统和命令环境。

```bash
# 安装
npm i -g @openai/codex

# 登录（二选一）
codex --login          # ChatGPT 订阅登录
export OPENAI_API_KEY=sk-...  # API Key 认证

# 基本使用
codex "分析 src/auth/ 目录的认证流程，找出安全问题"
codex --plan "给 auth/ 模块补充单元测试"
codex --ask "这个项目的构建流程是什么"
```

CLI 的核心特征是**贴近真实仓库**。它能直接读取你本地的文件，运行你的构建和测试命令，修改你的代码。它运行在你的沙箱环境里（macOS 用 Seatbelt，Linux 用 Landlock + seccomp），所有文件和命令操作都受安全策略控制。

CLI 适合的场景：日常开发任务、代码理解、重构迁移、测试补全、快速修改。不适合的场景：需要可视化 diff、长时间无人监督的并行任务。

### IDE Extension：编辑器内的协作代理

Codex IDE Extension 目前支持 VS Code、Cursor、Windsurf、JetBrains 等 IDE。它不是传统意义上的"补全插件"，而是把 Codex 的代理能力嵌入编辑器的工作流中。

IDE Extension 的核心价值是**减少上下文切换**。你不需要在终端和编辑器之间来回跳转。Codex 可以直接看到你当前打开的文件、选中的代码、项目的目录结构。你可以选中一段代码，让 Codex 解释、重构或补充测试，而不需要手动复制粘贴到 CLI 里。

IDE Extension 和 CLI 共享同一个 harness，但交互模式不同。CLI 是"给一个指令，等它完成"，IDE Extension 是"边写边协作"。两者可以互为补充：复杂任务用 CLI 的 Plan 模式规划，精确修改用 IDE Extension 在编辑器里操作。

### Cloud Agent：云端异步执行

Codex Cloud 把任务交给 OpenAI 的云端基础设施执行。你在 ChatGPT 界面或 Codex Cloud 界面提交任务，Codex 在云端沙箱里异步运行，完成后生成 PR 或报告结果。

Cloud Agent 的核心特征是**委派式工作**。你提交任务后可以去做别的事，Codex 在后台完成工作。它适合长时间运行的异步任务：大型重构、批量 bug 修复、跨文件修改、PR 生成。Cloud 使用 codex-1 系列模型（后来演进为 GPT-5.x-Codex 系列），这些模型针对 agentic coding 做了专门优化。

Cloud 和 CLI 的关键区别在于执行环境。Cloud 运行在 OpenAI 的基础设施上，它看到的是通过 GitHub 同步的仓库快照，不是你本地实时的文件系统。这意味着 Cloud 适合处理已经提交到 Git 的代码，不适合处理本地未提交的临时改动。

### App：桌面的多 Agent 管理中心

Codex App 是 OpenAI 在 2026 年 2 月推出的桌面应用（最初支持 macOS）。它的定位是多 agent 并行管理的工作台。

```text
Codex App 界面结构：
┌─────────────────────────────────────────────┐
│ Project A                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐     │
│  │ Thread 1 │ │ Thread 2 │ │ Thread 3 │     │
│  │ 重构 auth│ │ 补充测试 │ │ 修复 #42 │     │
│  │ ● 运行中 │ │ ✓ 完成   │ │ ● 运行中 │     │
│  └──────────┘ └──────────┘ └──────────┘     │
│                                              │
│ Project B                                    │
│  ┌──────────┐ ┌──────────┐                   │
│  │ Thread 1 │ │ Thread 2 │                   │
│  │ 文档更新 │ │ 依赖升级 │                   │
│  │ ○ 等待中 │ │ ✓ 完成   │                   │
│  └──────────┘ └──────────┘                   │
└─────────────────────────────────────────────┘
```

App 的核心价值是**并行和多任务管理**。你可以在同一个界面上管理多个项目，每个项目下有多个并行的 agent 线程。每个线程独立运行，有自己的上下文和执行状态。App 提供了 diff 查看、执行日志、审批操作等管理界面，让你同时监督多个长任务的进展。

四种形态的适用场景总结：

| 形态 | 交互模式 | 执行环境 | 适合场景 | 不适合场景 |
|------|---------|---------|---------|-----------|
| CLI | 终端交互 | 本地沙箱 | 日常开发、快速修改、脚本化、CI | 可视化 diff、多任务并行 |
| IDE Extension | 编辑器协作 | 本地沙箱 | 精确修改、边写边协作、局部改动 | 大规模异步任务、跨仓库 |
| Cloud Agent | 异步委派 | OpenAI 云端 | PR 修复、批量重构、长时间任务 | 本地未提交代码、交互调试 |
| App | 多任务管理 | 本地 + 云端 | 并行多 agent、长任务监督 | 精细编辑、底层调试 |

## Agent Loop 架构深度解析

Agent Loop 是 Codex 的核心逻辑。它负责协调用户、模型和工具之间的交互循环。理解 Agent Loop 的内部机制，是从"能用 Codex"到"理解 Codex 行为"的关键。

### 执行流：从用户输入到任务完成

一次完整的 Codex 执行流如下：

```text
┌─────────┐    ┌────────────────┐    ┌──────────────┐    ┌──────────┐
│ User     │───>│ Prompt         │───>│ Responses    │───>│ Tool     │
│ Input    │    │ Construction   │    │ API          │    │ Calls    │
└─────────┘    └────────────────┘    │ Inference    │    └──────────┘
                                     └──────────────┘           │
                                          │                     │
                                          v                     v
                                    ┌──────────┐         ┌──────────┐
                                    │ Final    │         │ Tool     │
                                    │ Response │         │ Output   │
                                    │ (结束)    │         └──────────┘
                                    └──────────┘               │
                                                               v
                                                         回到 Prompt
                                                         Construction
                                                         (追加工具输出)
```

这个循环的具体步骤：

1. **用户输入**：用户通过 CLI、IDE 或 Cloud 提交任务描述。
2. **Prompt 构造**：Codex harness 把用户输入、系统指令、工具定义、AGENTS.md 内容等组装成完整的 Prompt。
3. **Responses API 推理**：通过 HTTP POST 请求发送到 Responses API，模型进行推理。
4. **模型输出判断**：
   - 如果模型输出 assistant message（最终回复），循环结束。
   - 如果模型输出 function call（工具调用），进入步骤 5。
5. **工具执行**：Codex harness 执行工具调用（如 apply_patch 修改文件、shell_command 运行命令）。
6. **结果追加**：工具输出追加到 Prompt 中，回到步骤 3，重新推理。
7. **循环终止**：模型不再请求工具调用，输出 assistant message，一次 turn 完成。

一个 turn 内可以包含多次推理-工具调用迭代。典型的一次中等复杂度任务可能包含 5-15 次迭代。复杂任务可能达到数百次。

### SSE 流式推理

Codex 的推理过程使用 Server-Sent Events（SSE）流式传输。Responses API 返回的不是一次性 JSON 响应，而是一个 SSE 事件流，每个事件的 data 字段是带有 `type` 的 JSON 对象。

```json
// SSE 事件示例
{"type": "response.created", ...}
{"type": "response.in_progress", ...}
{"type": "response.output_item.added", "item": {"type": "reasoning", ...}}
{"type": "response.output_text.delta", "delta": "正在分析代码结构..."}
{"type": "response.output_item.done", "item": {"type": "function_call", "name": "shell", ...}}
{"type": "response.completed", ...}
```

Codex harness 消费这个 SSE 流，并将事件转换为内部对象。有两类关键事件：

- `response.output_text.delta`：用于 UI 流式显示，让用户看到 Codex 正在"思考"什么。
- `response.output_item.added` / `response.output_item.done`：用于构建下一次请求的 input。当模型输出一个 function_call 时，这个事件会被追加到后续请求的 input 中。

SSE 流式设计的好处是用户体验更好（能看到实时进展），同时 harness 可以在流式过程中就开始处理工具调用，而不需要等整个响应完成。

### 不使用 previous_response_id 的设计决策

Responses API 提供了一个 `previous_response_id` 参数，可以避免在每次请求中重新发送完整对话历史。但 Codex 明确不使用这个参数。

这个决策背后有两个原因：

**状态无关性。** 不使用 `previous_response_id` 意味着每次请求都包含完整的对话历史。这使得 Responses API 的实现方不需要在服务器端维护会话状态。对于 OpenAI 来说这简化了基础设施；对于使用第三方 Responses API 实现（如 Azure、本地 ollama）的用户来说，这保证了兼容性。

**ZDR 支持。** Zero Data Retention（ZDR）是 OpenAI 提供的企业级数据策略选项，承诺不在服务器端持久化客户数据。如果使用 `previous_response_id`，API 服务器必须存储之前的响应数据，这与 ZDR 的设计目标直接冲突。Codex 不使用 `previous_response_id`，确保 ZDR 客户户可以正常使用所有功能。

不使用 `previous_response_id` 的代价是明显的：每次请求都要发送完整对话历史，请求体大小随对话轮次呈二次增长（quadratic growth）。但 Codex 通过 Prompt 缓存来缓解这个问题——下一节会详细解释。

### Prompt 层次结构

Codex 构造的 Prompt 不是一段平坦的文本，而是一个带有角色优先级的结构化列表。理解这个层次结构对于写出有效的 AGENTS.md 和 config.toml 指令至关重要。

Responses API 的 Prompt 由以下部分按顺序组成：

```text
最终 Prompt 结构（由 Responses API 服务器决定顺序）：
┌─────────────────────────────────────────────┐
│ 1. system message（服务器控制）              │
│    - 模型级别的系统指令                      │
│    - 优先级最高                              │
├─────────────────────────────────────────────┤
│ 2. tools（客户端提供）                       │
│    - shell 工具定义                          │
│    - apply_patch 工具定义                    │
│    - MCP 工具定义                            │
│    - API 内置工具定义                        │
├─────────────────────────────────────────────┤
│ 3. instructions（客户端提供）                │
│    - Codex harness 的默认指令                │
│    - config.toml 中的 developer_instructions │
├─────────────────────────────────────────────┤
│ 4. input 序列（客户端提供）                  │
│    a. sandbox 描述 (role=developer)          │
│    b. developer_instructions (role=developer)│
│    c. AGENTS.md 内容 (role=user)             │
│    d. Skills 指令                            │
│    e. 用户消息                               │
│    f. 后续的对话历史                         │
└─────────────────────────────────────────────┘
```

角色的优先级从高到低为：`system` > `developer` > `user` > `assistant`。这意味着当不同层级的指令发生冲突时，高优先级的指令会覆盖低优先级的。例如，`instructions` 字段中的内容（system 或 developer 级别）比 `input` 中的用户消息优先级更高。

AGENTS.md 的内容在 input 序列中以 `role=user` 的身份出现。它的优先级低于 `instructions` 和 `developer` 级别的消息。这意味着你可以在 config.toml 的 `developer_instructions` 中设置一些不可被 AGENTS.md 覆盖的硬性规则。

Codex 在构造 input 序列时，AGENTS.md 的加载遵循从通用到具体的顺序：

```text
AGENTS.md 加载顺序（后面的覆盖前面的）：
1. $CODEX_HOME/AGENTS.md（全局配置）
2. $CODEX_HOME/AGENTS.override.md（全局覆盖）
3. Git 根目录/AGENTS.md（项目级）
4. 当前目录/AGENTS.md（目录级）
5. 子目录的 AGENTS.md（如果操作涉及子目录）
```

每个目录层级的 AGENTS.md 大小限制为 32 KiB。这个限制是合理的——超过 32 KiB 的上下文文件要么包含了不该让 agent 看到的冗余信息，要么需要被拆分为多个子目录级别的 AGENTS.md。

### Prompt 缓存与精确前缀匹配

Prompt 缓存是 Codex 性能优化的核心机制。缓存命中的条件是**精确前缀匹配**——新的 Prompt 必须以旧的 Prompt 作为完全相同的前缀。

```text
第一次请求的 Prompt：
[instructions | tools | sandbox_msg | agents_md | user_msg_1]
                                                        ↓ 模型推理

第二次请求的 Prompt（追加工具调用结果）：
[instructions | tools | sandbox_msg | agents_md | user_msg_1 | tool_call_1 | tool_result_1]
└────────────────── 完全相同的前缀 ──────────────────┘  ← 缓存命中！
```

前缀匹配的成功率直接取决于静态内容的排列位置。Codex 的 Prompt 构造刻意把 `instructions`、`tools`、`sandbox` 描述等静态内容放在前面，把用户消息和工具调用结果等动态内容放在后面。这种排列保证了在同一个 turn 的多次迭代中，前面的静态前缀始终不变，从而最大化缓存命中率。

以下操作会导致缓存失效（cache miss）：

| 操作 | 为什么失效 | 影响 |
|------|-----------|------|
| 修改 tools 列表 | 前缀中的 tools 部分变了 | 整个前缀失效 |
| 切换模型 | 模型相关指令在 system message 中 | 前缀从头失效 |
| 修改沙箱配置 | sandbox 描述消息变了 | 该消息之后的部分失效 |
| 修改审批模式 | 与沙箱配置在同一消息中 | 同上 |
| 修改当前工作目录 | cwd 描述在 user 消息中 | 该消息之后的部分失效 |
| MCP 工具列表变化 | tools 列表发生变化 | 整个前缀失效 |

Codex 团队在开发 MCP 支持时曾引入一个 bug：MCP 工具的枚举顺序不一致，导致每次请求的 tools 列表顺序不同，缓存全部失效。这个 bug 说明了一个工程要点——如果你的 Codex 配置导致频繁缓存失效，性能会显著下降。

对于配置变更（如审批模式改变、工作目录切换），Codex 的策略是追加新消息而不是修改旧消息：

```text
原 Prompt：[... | sandbox_msg("read-only") | ...]
审批模式改为 full-access 后：
新 Prompt：[... | sandbox_msg("read-only") | sandbox_msg("full-access") | ...]
                                                    ↑ 追加，不修改 ↑
```

这种追加策略保留了前面的前缀不变，最大化缓存命中率。代价是 Prompt 会稍长一些，但比起完全失去缓存命中的性能损失，这是值得的。

## 上下文窗口管理

每个模型都有一个上下文窗口（context window），即一次推理调用能处理的最大 token 数量。这个窗口同时包含输入和输出 token。Codex 的上下文管理策略直接影响长对话和复杂任务的成败。

### Token 预算分配

一次 Codex 推理调用的 token 预算分配大致如下：

```text
上下文窗口分配（以 200K token 为例）：
┌──────────────────────────────────────────────┐
│ 系统指令 + 工具定义          ~3-5K tokens     │  ← 固定开销
│ developer_instructions       ~0-2K tokens     │  ← config.toml
│ AGENTS.md                    ~2-8K tokens     │  ← 项目上下文
│ Skills 指令                  ~0-4K tokens     │  ← 可选
├──────────────────────────────────────────────┤
│ 对话历史（input 序列）        动态增长        │  ← 每轮迭代增长
│   - 用户消息                                  │
│   - 工具调用                                  │
│   - 工具输出（截断至 10K token）              │
│   - 模型推理输出                              │
├──────────────────────────────────────────────┤
│ 输出预留                     ~4-16K tokens    │  ← 给模型生成空间
└──────────────────────────────────────────────┘
```

从这个分配可以看出几个工程要点：

**AGENTS.md 不是越大越好。** AGENTS.md 占用的 token 来自上下文窗口的固定开销部分。一个 8K token 的 AGENTS.md 意味着对话历史少了 8K token 的空间。如果任务涉及大量工具调用迭代，很快就会触及窗口上限。这就是为什么 AGENTS.md 应该是"内容目录"而不是"百科全书"——每一条规则都应该在精简和明确之间取得平衡。

**工具输出有截断机制。** shell_command 的输出被截断为 10K token（保留头部和尾部，中间压缩）。这不是随意设定的数字——10K token 约等于 30-40KB 的文本内容，足以包含大多数命令的完整输出。但如果你的测试输出特别长（比如大量失败用例），截断可能会丢失关键信息。这时候需要在 AGENTS.md 中指导 Codex 使用管道过滤输出。

**对话历史是主要的增长来源。** 每次工具调用迭代都会在对话历史中追加推理输出和工具结果。一个复杂的重构任务可能产生 20-30 次迭代，每次迭代增加 1-3K token。如果不做上下文压缩，一个 200K token 的窗口可能在 50-80 次迭代后耗尽。

### Compaction 机制

当对话历史增长到超过 `auto_compact_limit` 阈值时，Codex 自动触发 Compaction。Compaction 的原理是用一次特殊的 API 调用，把完整的对话历史压缩为一个更紧凑的表示。

```text
Compaction 过程：
压缩前：[instructions | tools | history_1 | history_2 | ... | history_N]  → 180K tokens
                                         ↓
调用 /responses/compact 端点
                                         ↓
压缩后：[instructions | tools | compaction_summary]                        → 30K tokens
              ↑ 其中包含 encrypted_content，保留模型的潜在理解 ↑
```

Compaction 的早期实现需要用户手动调用 `/compact` 命令。后来 Responses API 增加了专用的 `/responses/compact` 端点，返回的压缩结果包含一个特殊的 `type=compaction` 项，其中有 `encrypted_content` 字段。这个加密内容保留了模型对原始对话的"潜在理解"——不是文本摘要，而是模型内部的推理状态。

Compaction 的工程意义在于它让 Codex 可以处理任意长度的任务，而不会因为上下文窗口耗尽而失败。但 Compaction 也有代价：压缩后的上下文不如原始上下文精确。对于需要精确回溯早期对话内容的任务（比如"回到第 3 步的方案 A"），Compaction 后可能丢失这种精确性。

## 模型族演进时间线

Codex 使用的模型经历了快速迭代。理解这个时间线有助于选择合适的模型和理解不同版本的能力差异。

| 时间 | 模型 | 关键特征 |
|------|------|---------|
| 2025 年 4 月 | codex-1 | Codex Cloud 的初始模型，基于强化学习训练，针对 agentic coding 优化 |
| 2025 年 9 月 | GPT-5-Codex | 基于 GPT-5 的 Codex 优化版本，使用 RLHF 训练，针对软件 agent 任务微调 |
| 2025 年 11 月 | GPT-5.1-Codex / Mini / Max | 三个变体：标准版平衡性能与成本，Mini 侧重速度和成本效率，Max 针对长时间运行任务优化 |
| 2025 年 12 月 | GPT-5.2-Codex | 编码能力的进一步提升，基准测试显示在多语言代码生成上显著进步 |
| 2026 年 2 月 | GPT-5.3-Codex | 增加自演化（self-evolution）能力，agent 可以审视和改进自己的输出 |
| 2026 年 3 月 | GPT-5.4 | 首个具备原生 computer-use 能力的通用模型，在 Codex 中同时提供编码和视觉操作能力 |
| 2026 年 4 月 | GPT-5.5 | 强调 agent 能力增强，更复杂的目标理解、工具使用和长程规划 |

模型选择策略不是"越新越好"。不同模型在推理深度、成本、速度三个维度上有不同的权衡：

```toml
# config.toml 中的模型选择示例

# 日常开发：平衡速度和质量
model = "gpt-5.3-codex"

# 快速探索、简单修改：低成本高速度
model = "gpt-5.1-codex-mini"

# 复杂重构、长任务：最强推理
model = "gpt-5.1-codex-max"

# 需要视觉理解（截图分析、UI 验证）
model = "gpt-5.4"
```

`reasoning_effort` 参数进一步控制模型在推理上投入的计算量。可选值为 `medium`、`high`、`xhigh`。推理深度越深，模型在复杂任务上的表现越好，但消耗的 token 和时间也越多。对于简单的 bug 修复，`medium` 通常足够；对于涉及多层架构理解的重构，`high` 或 `xhigh` 更合适。

## 四层能力架构

Codex 的能力可以分解为四个层次，每一层解决不同维度的问题。

```text
┌─────────────────────────────────────────────┐
│              治理层 (Governance)             │
│  沙箱 / 审批模式 / 命令策略 / 审计日志       │
├─────────────────────────────────────────────┤
│              上下文层 (Context)               │
│  AGENTS.md / config.toml / Skills           │
├─────────────────────────────────────────────┤
│              工具层 (Tools)                   │
│  apply_patch / shell_command / MCP           │
├─────────────────────────────────────────────┤
│              模型层 (Model)                   │
│  GPT-5.x-Codex / Responses API              │
└─────────────────────────────────────────────┘
```

### 模型层：推理引擎

模型层是 Codex 的推理核心。GPT-5.x-Codex 系列模型通过 Responses API 提供推理能力。这一层的职责是：理解任务、规划步骤、生成工具调用、解析工具结果、产出最终回复。

模型层的能力上限由模型本身决定——不同的模型在代码理解、长程推理、工具使用上有不同的表现。但模型层的实际表现受上下文层质量的强烈影响：同样的模型，配上好的 AGENTS.md 和清晰的指令，表现远好于裸跑。

### 工具层：执行能力

工具层决定了 Codex 能做什么。Codex 内置两个核心工具：

- **apply_patch**：通过 diff 格式修改文件。模型生成 unified diff 格式的编辑操作，harness 应用到文件系统。
- **shell_command**：执行 shell 命令。可以运行构建、测试、git 操作等任何命令行操作。

通过 MCP 可以扩展更多工具：GitHub 操作、数据库查询、浏览器自动化、文档检索等。

工具层的设计有一个重要的安全边界：**只有 Codex 内置的 shell 工具受到沙箱保护**。通过 MCP 接入的外部工具不在 Codex 的沙箱范围内，它们需要自己实现安全防护。这意味着在接入第三方 MCP server 时，安全审查的责任从 Codex 转移到了 MCP server 的提供方。

### 上下文层：项目知识注入

上下文层解决"Codex 不知道你的项目"的问题。这一层包含三个核心机制：

- **AGENTS.md**：项目常识、构建命令、编码规范、安全边界。每次会话加载，是 Codex 理解项目的基础。
- **config.toml**：模型选择、搜索模式、MCP 配置、沙箱策略、developer_instructions。是 Codex 的行为配置中心。
- **Skills**：可复用工作流封装。当一个流程反复出现（比如"PR review"、"发布准备"），可以封装为 Skill，避免每次重新描述。

上下文层的工程原则是**最小有效上下文**——注入足够的上下文让 Codex 做出正确决策，但不超过必要的量。每多一行 AGENTS.md 内容，就少一行对话历史的空间。

### 治理层：安全与控制

治理层是 Codex 工程化中最容易被忽视但最关键的一层。它包含四条防线：

**内核级沙箱。** macOS 使用 Seatbelt（macOS 的进程级安全机制），Linux 使用 Landlock + seccomp。沙箱限制了 Codex 能访问的文件路径、网络端口和系统资源。三种信任模式：read-only（只读文件系统）、workspace-write（可写工作区）、full-access（完全访问）。

**三级审批模式。** suggest（只建议不执行）、auto-edit（自动编辑文件但审批命令）、full-auto（全部自动执行）。默认模式是 auto-edit，在安全性和效率之间取得平衡。

**命令策略引擎（Rules）。** 基于 Starlark 语言的规则系统，可以定义命令级别的白名单、黑名单和审批策略。例如：允许 `git status` 和 `pnpm test`，但阻断 `rm -rf` 和 `docker rm`。

**审计日志。** 记录 Codex 的所有文件操作和命令执行。日志保存在本地，可以用于事后审查和问题追溯。

## 与 Claude Code 的哲学差异

Codex 和 Claude Code 是当前 AI Coding 领域最具代表性的两个工程代理。它们在技术架构上有相似之处（都基于 Agent Loop，都支持 MCP，都强调安全治理），但在使用哲学上有根本差异。

### Codex："委派-审查-批准"（Hands-off）

Codex 的设计哲学是**委派式工作**。你定义任务，Codex 自主执行，你审查结果。

```text
Codex 工作流：
1. 用户定义任务（可以是 Issue、PR 描述、自然语言需求）
2. Codex 自主规划执行步骤
3. Codex 独立执行（可能涉及数十次工具调用）
4. Codex 输出结果（代码修改、PR、报告）
5. 用户审查结果（diff、测试结果、日志）
6. 用户批准或拒绝
```

这种哲学的体现：

- **Cloud Agent** 是最极端的委派形式——任务在云端异步执行，你完全不在场。
- **App** 是委派的管理界面——你同时监督多个 agent 线程，但不直接参与执行。
- **CLI 的 auto 模式**——即使是本地执行，Codex 也倾向于尽量自主完成，只在关键节点请求审批。

Codex 假设用户是"管理者"角色：给出目标，审查产出，不过问过程。这种假设的合理性在于——如果你信任模型的推理能力，过程参与只会降低效率。

### Claude Code："结对编程"（Hands-on）

Claude Code 的设计哲学是**协作式工作**。你和 Claude Code 在同一个终端里实时协作，像结对编程一样。

```text
Claude Code 工作流：
1. 用户和 Claude Code 开始对话
2. Claude Code 提出方案，用户确认
3. Claude Code 执行一步，展示结果
4. 用户给出反馈，调整方向
5. Claude Code 继续执行
6. 循环直到完成
```

这种哲学的体现：

- **实时交互**：Claude Code 在执行过程中频繁与用户交互，而不是一口气跑完。
- **渐进式执行**：倾向于一步一步来，每步确认后再继续。
- **上下文共享**：用户可以随时打断、纠正、补充信息，这些信息立即影响后续执行。

Claude Code 假设用户是"协作者"角色：参与过程，实时调整，保持控制。这种假设的合理性在于——对于不确定需求或需要探索的方向，过程参与能显著提高最终产出的质量。

### 差异的工程影响

两种哲学没有绝对的优劣，但在不同的场景下有不同的适用性：

| 维度 | Codex（委派式） | Claude Code（协作式） |
|------|----------------|---------------------|
| 任务清晰度 | 适合需求明确的任务 | 适合需要探索的任务 |
| 批量能力 | 适合并行处理多个任务 | 更适合串行处理单个任务 |
| 上下文效率 | 不需要用户持续关注 | 需要用户全程参与 |
| 产出质量 | 一次产出可能不完美，依赖审查 | 渐进式改进，过程纠偏 |
| 适用规模 | 适合中大型团队分工 | 适合个人或小团队深度协作 |
| 学习成本 | 需要学习如何写好任务描述 | 需要学习如何有效交互 |
| 失败模式 | 静默偏航（跑偏了用户不知道） | 过程干扰（频繁打断降低效率） |

在实际工程中，最有效的做法可能是**双 Agent 工作流**：用 Codex 做初始实现（利用其委派式效率），用 Claude Code 做 review（利用其协作式审查能力）。或者反过来：用 Claude Code 探索方案（利用其交互式探索），确认方向后用 Codex Cloud 批量执行（利用其异步委派能力）。

## 从理解到实践

理解 Codex 是工程代理工作台而不是代码补全工具，会改变你的使用方式。以下是几个关键的实践转变：

**从"问问题"到"给任务"。** 不要问 Codex "这个函数是做什么的"，而是给它一个任务："分析 `src/auth/login.ts` 的 `handleLogin` 函数，列出所有错误处理路径，标记哪些没有对应的测试用例"。前者得到一段文字解释，后者得到可审查的工程产出。

**从"一次性对话"到"可复用流程"。** 当你发现自己第三次用类似的 prompt 让 Codex 做 PR review，是时候把它封装成 Skill 了。Skill 不只是 prompt 模板——它包含触发条件、执行步骤、参考资源和验证逻辑。

**从"手动审批每个操作"到"配置安全边界后放手"。** 不要在 auto-edit 模式下逐个审批每个命令。花时间配好沙箱策略和 Rules 规则，然后切到 full-auto 模式让 Codex 高效执行。安全来自系统设计，不是来自人工审批的频率。

**从"裸跑模型"到"注入上下文"。** 没有好的 AGENTS.md，Codex 在你的项目里就是"一个会写代码但不知道你的项目是什么的新人"。AGENTS.md 不是可选的良好实践，而是 Codex 工程化的基础设施。

Codex 的真正价值不在于它能不能写一段正确的代码——这已经是很低的要求了。它的价值在于它能不能在你的真实代码库里，在明确的安全边界内，受控地完成可审查、可测试、可回滚的软件工程任务。把 Codex 当成工程代理工作台来用，它的能力上限远超代码补全；把它当成更强的 ChatGPT 来用，你只发挥了它十分之一的价值。
