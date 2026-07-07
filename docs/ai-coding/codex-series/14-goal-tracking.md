<!--
调研来源（不发布，仅记录）：
1. GitHub 仓库 openai/codex: codex-rs/tui/src/slash_command.rs — /goal 命令枚举定义
2. GitHub 仓库 openai/codex: codex-rs/core/src/session/session.rs — GoalRuntime 状态管理
3. Zread: openai/codex Terminal UI (TUI) — /goal 斜杠命令描述和多 agent 支持
4. Zread: openai/codex Agent Loop and Thread Management — goal_runtime 字段与 turn 循环
5. Zread: openai/codex Prompt Engineering and Context — GoalContext 注入层
6. Zread: openai/codex Latest Updates — Goal accounting after resume (commit 823381e)
7. Zread: openai/codex About Contributors — Eric Traut 创建 /goal 命令
8. Zread: openai/codex Configuration Reference — [agents] max_depth / max_threads 配置
版本基准: 2026 年 6 月
-->

# Codex CLI 目标追踪：/goal 让长任务不偏航

> **TL;DR** — `/goal` 是 Codex CLI 内置的任务锚点命令。它让你设定一个目标文本，Codex 会在后续每一轮对话中持续看到这个目标，不会因为上下文太长而"忘记"你要做什么。`/goal` 支持设置、查看、暂停、恢复和清除五种操作，目标最长 4000 字符，超过这个长度可以把详细指令写到文件里再让 goal 指向那个文件。在多 Agent 场景下，目标会随线程传递给子 agent。本文从"为什么需要目标追踪"讲起，覆盖基本用法、结构限制、多 Agent 配合、三个实战工作流和几个容易踩的坑。

---

## 1. 为什么需要目标追踪

先说一个几乎所有 Codex 用户都经历过的场景。

你让 Codex "把认证模块从 JWT 迁移到 session-based"。Codex 开始改代码，先改了 `auth.ts`，然后改了中间件 `auth-middleware.ts`，接着去调路由层。改到第五个文件的时候，它突然开始修一个之前发现的类型错误——你觉得也行，顺带修了就修了。结果修类型错误的过程中又发现了一个导入路径的问题，又去改那个。等 Codex 停下来，你一看 `/diff`：改了 17 个文件，但核心的认证迁移才做了一半，后半段全是"顺手"改的东西。

这就是经典的**目标漂移（goal drift）**。Codex 不是故意的——它本质上是一个接一个 turn 地生成回复，每一轮它都在"根据上下文中最相关的内容"做下一步操作。随着对话越来越长，最早的那句"把认证从 JWT 迁移到 session"会被淹没在十几轮工具调用和代码修改的细节中。Codex 的注意力自然会被最近几轮的内容吸引走。

这个问题的根源在于 LLM 的上下文窗口机制。对话历史是一个扁平的消息列表，没有"这条消息比那条消息重要"的优先级标记。你说了三次"重点是认证迁移"也没用——在模型的视角里，这三条指令和后面"把那个类型修一下"是同等权重的消息。

`/goal` 解决的就是这个问题。它把你的目标从"对话历史中的一条消息"提升为"持久化的上下文注入"。

### 技术原理

从源码层面看，`/goal` 的目标文本被存储在 `Session` 结构体的 `goal_runtime` 字段中，类型是 `GoalRuntimeState`。每次 Codex 构建模型可见的 prompt 时，目标文本会通过 `GoalContext` 注入到用户消息层（`user` 层级）。

```
System Prompt
  └─ base instructions（模型身份、行为约束）
User Context（每一轮都会注入）
  ├─ AGENTS.md 内容
  ├─ SkillInstructions / PluginInstructions
  ├─ GoalContext  ← /goal 设置的目标文本就在这里
  └─ 当前对话历史
```

关键点：`GoalContext` 不在对话历史里，而是在**每一轮都会重新注入的上下文片段**中。这意味着不管对话进行了 5 轮还是 50 轮，目标文本始终出现在 prompt 中。模型不需要从长对话历史里"回忆"你的目标——它每轮都能直接看到。

还有一个细节值得注意：Codex 团队花了专门的精力修复目标在线程恢复时的状态丢失问题。2026 年 5 月，jif-oai 提交了一个 commit（`823381e`），把线程恢复时的目标状态重建逻辑移到了 `GoalRuntimeHandle::restore_after_resume()` 中。之前的实现会导致一个微妙的问题：如果你设了 `/goal`，然后退出 Codex，再通过 `codex resume` 恢复会话，目标追踪的计时器（比如 idle time 统计）会丢失。修复后，目标状态会从持久化的线程数据中正确恢复。

### 和直接写在 AGENTS.md 里的区别

有人会问：把目标写在 AGENTS.md 里不也行吗？干嘛还要 `/goal`？

区别主要有三个：

1. **生命周期不同**。AGENTS.md 是项目级别的持久配置，所有会话共享。`/goal` 是会话级别的，只在当前对话中生效。你上午做认证迁移设一个目标，下午做测试覆盖设另一个目标，互不干扰
2. **可动态调整**。AGENTS.md 改了要手动保存文件，而且影响所有会话。`/goal` 一条命令就能暂停、恢复或清除，不会牵连其他东西
3. **目的不同**。AGENTS.md 写的是"这个项目应该怎么开发"的全局规则，比如"使用 pnpm 不用 npm""测试用 vitest"。`/goal` 写的是"这次对话要完成什么具体任务"，比如"把所有 REST 端点迁移到 tRPC"

两者是互补关系，不是替代关系。AGENTS.md 定义全局规则，`/goal` 定义当前任务的具体目标。

---

## 2. /goal 基本用法

### 设置目标

在 Codex CLI 的 TUI 界面中，输入 `/goal` 加一个空格，后面跟上你的目标描述：

```
> /goal 把认证模块从 JWT 迁移到 session-based，保持所有现有测试通过
```

Codex 收到这条命令后，会把目标文本存储到当前的会话状态中，并在状态栏（statusline）显示一个目标指示器，让你知道"当前有活跃的目标"。

目标描述的核心要求是**具体且可验证**。上面这个例子满足了这个标准——你事后可以跑一遍测试来判断目标有没有达成。如果你写一个模糊的"改善认证安全性"，Codex 和你都没法判断什么时候算"完成了"。

### 查看当前目标

只输入 `/goal` 不带任何参数，Codex 会显示当前设置的目标文本：

```
> /goal

当前目标：
把认证模块从 JWT 迁移到 session-based，保持所有现有测试通过
```

这个功能在你进入一个已经设置了目标的会话（比如从 resume 恢复后），或者对话太长你已经忘了自己设了什么目标时特别有用。

### 暂停目标

当你需要临时切换方向——比如改着改着发现需要先处理一个紧急 bug——可以用暂停：

```
> /goal pause
```

暂停后，目标文本不再注入到 prompt 中。Codex 的注意力不再受目标文本牵引，可以自由地处理其他任务。但目标本身没有被删除，随时可以恢复。

### 恢复目标

```
> /goal resume
```

恢复后，目标文本重新注入到 prompt 中，Codex 回到"受目标引导"的状态。

### 清除目标

```
> /goal clear
```

目标被彻底删除，不可恢复。需要重新用 `/goal <描述>` 设定新目标。

### 命令速查

| 命令 | 作用 | 目标状态变化 |
|------|------|-------------|
| `/goal <text>` | 设置目标 | 创建新目标（覆盖旧目标） |
| `/goal` | 查看当前目标 | 无变化 |
| `/goal pause` | 暂停目标 | 目标保留但不再注入 prompt |
| `/goal resume` | 恢复目标 | 目标重新注入 prompt |
| `/goal clear` | 清除目标 | 目标被删除 |

注意 `/goal` 和 `/goal pause` 是两个完全不同的操作。不带参数是"查看"，带 `pause` 是"暂停"。

---

## 3. 目标的结构与限制

### 字符限制与最佳实践

目标文本最长 4000 字符。这不是一个随意的数字——它对应 Codex 上下文注入机制中 `GoalContext` 片段的大小上限。超过这个长度，Codex 会拒绝设置并给出提示。

4000 字符看起来很多，但如果你想把目标写得非常详细（包括背景说明、技术约束、验收标准、注意事项），很容易超。实际使用中，一个写得好的目标通常在 200-800 字符之间。

好的目标描述包含三个要素：

1. **做什么**：具体的任务描述
2. **约束条件**：不能破坏什么、必须兼容什么
3. **完成标准**：怎么判断做完了

```
# 好的目标示例（约 120 字符）
/goal 把 src/api/users.ts 的 8 个 REST 端点迁移到 tRPC router，不改变请求/响应格式，迁移后全部测试通过

# 太模糊的目标
/goal 改善用户 API

# 太长的目标（包含过多背景信息）
/goal 背景：我们团队决定从 REST 迁移到 tRPC，因为 tRPC 提供了端到端的类型安全...
（后面还有 3000 字的迁移计划和背景说明）
```

### 目标文件引用

如果你的目标确实很长（比如一个详细的需求文档），不要硬塞进 `/goal` 的参数里。Codex 提供了一个更优雅的方式：把详细指令写到文件中，然后让 goal 指向那个文件。

```
# 把详细需求写到文件
> @docs/migration-plan.md  # 让 Codex 看到这个文件的内容

# 然后设置一个简短的目标
/goal 按照 @docs/migration-plan.md 的方案执行认证模块迁移，完成后跑 pnpm test 确认全部通过
```

这样做的优点是：目标文本保持简短（200 字符以内），但完整的上下文通过 `/mention` 注入到了对话中。模型既能看到具体目标，也能参考详细的需求文档。

还有一种方式是把文件路径直接写在目标里：

```
/goal 参见 goal-auth-migration.md 中的详细步骤和验收标准，逐条执行
```

Codex 会通过文件引用机制读取这个文件的内容作为上下文。

### /goal 可以在任务执行中使用

从源码的 `available_during_task` 方法可以看到，`/goal` 被标记为"任务执行期间可用"。这意味着你不需要等 Codex 停下来才能修改目标——如果 Codex 正在执行一个长任务，你可以随时输入 `/goal pause` 暂停目标，或者 `/goal <新描述>` 更新目标。

这是一个很实用的设计。你可能在 Codex 执行到一半时发现目标需要调整——不用中断整个任务，直接改目标就行。

### 不支持内联参数的特殊操作

`/goal` 支持内联参数（`supports_inline_args` 返回 `true`），但你只能用内联参数来**设置新目标**。`pause`、`resume`、`clear` 这三个操作是固定关键字，不能和目标文本混用。

```
# 正确
/goal 把测试覆盖率提升到 80%

# 错误 — pause 后面不能跟描述
/goal pause 因为要先修个紧急 bug
```

如果你需要给暂停加理由，单独用 `/goal pause`，然后正常输入你的理由——Codex 能理解上下文。

---

## 4. /goal 在多 Agent 场景下的作用

### 多 Agent 配置前提

Codex CLI 支持多 Agent 协作，但需要显式启用。在 `~/.codex/config.toml` 中：

```toml
[features]
multi_agent = true

[agents]
max_threads = 6    # 最大并发 agent 线程数，默认 6
max_depth = 1      # agent 嵌套深度，默认 1
```

- `multi_agent`：启用多 agent 协作工具（`spawn_agent`、`send_input`、`resume_agent`、`wait_agent`、`close_agent`）
- `max_threads`：控制同时运行的 agent 数量。设置太高可能超出 API 速率限制
- `max_depth`：控制 agent 的嵌套层级。1 表示主线程可以 spawn 子 agent，但子 agent 不能再 spawn 孙 agent。2 允许两层嵌套

启用后，你可以通过 `/agent` 命令切换不同的 agent 线程，用 `spawn_agent` 工具让 Codex 自动创建子 agent 来并行处理子任务。

### 目标如何在 agent 间传递

当主线程设置了 `/goal` 并 spawn 子 agent 时，目标文本会通过线程上下文传递给子 agent。具体来说，子 agent 继承了主线程的会话状态快照，其中包含 `GoalContext`。

这意味着：

```
主线程: /goal 重构认证模块，拆分为 auth-core、auth-middleware、auth-routes 三个包
  ├─ 子 agent A: 拆分 auth-core 包（知道总目标是重构认证模块）
  ├─ 子 agent B: 拆分 auth-middleware 包（知道总目标是重构认证模块）
  └─ 子 agent C: 拆分 auth-routes 包（知道总目标是重构认证模块）
```

每个子 agent 都能看到"总目标"，这能帮助它们在处理各自子任务时保持方向一致。比如子 agent A 在拆分 auth-core 时，如果发现需要调整某个接口，它能根据总目标判断这个调整是否会影响其他两个包。

不过有一点需要注意：子 agent 的目标是只读的。子 agent 不能用 `/goal` 修改从父线程继承来的目标。目标的生命周期绑定在主线程上。

### 与 /fork 和 /side 的配合

`/fork` 和 `/side` 都会创建当前对话的分叉，但它们和目标的交互方式不同。

**`/fork` — 持久化分叉**

`/fork` 创建一个新的独立线程，复制当前对话的所有状态——包括目标。分叉后的线程有自己独立的目标状态，你可以为新线程设置不同的目标，不影响原线程。

```
# 主线程设了一个目标
/goal 完成用户认证迁移

# 你想同时探索另一个方向
/fork

# 在新线程里设一个不同的目标
/goal 评估引入 OAuth2 的可行性

# 两个线程各自有自己的目标，互不影响
```

**`/side` — 临时旁路对话**

`/side` 启动一个临时的分叉对话，用于快速探索或验证，不持久化。`/side` 创建的对话**继承当前目标但不持久化目标修改**。你在 side 对话里做的任何 `/goal` 操作都会在 side 对话结束时丢失。

从源码看，`/side` 对话中可用的斜杠命令非常有限——只有 `Copy`、`Raw`、`Diff`、`Mention`、`Status`、`Ide` 六个。`/goal` 不在 `available_in_side_conversation` 列表中，这意味着你**不能在 side 对话中使用 `/goal`**。这是设计上的选择——side 对话是临时性的，不应该有持久化的状态变更。

这个限制是合理的。`/side` 的用途是"临时问个问题"或"快速验证一个想法"，不是"开启一个独立的长任务"。如果你发现需要在新方向上设目标，应该用 `/fork` 而不是 `/side`。

### 线程切换时的目标可见性

用 `/agent` 在多个活跃线程之间切换时，每个线程的目标状态是独立的。线程 A 设了 `/goal 做测试`，切到线程 B 时看到的是线程 B 自己的目标（可能是空的，可能是另一个）。

切换线程时注意看状态栏的目标指示器。如果忘记了自己在哪个线程设了什么目标，直接输入 `/goal` 查看当前线程的目标状态。

---

## 5. 实战工作流

### 场景一：大型重构任务

**任务**：把一个单体 Express 应用的 API 层拆分成独立的 tRPC router，涉及 12 个端点、3 个中间件、5 个数据模型。

**没有 `/goal` 的做法**：

```
> 把这个 Express 项目的 API 层迁移到 tRPC

（Codex 开始改文件，改到第 4 个端点时开始修类型错误，
然后发现数据库查询也需要调整，又去改那个...
最后改了 23 个文件，核心迁移完成了 7/12 个端点）
```

**有 `/goal` 的做法**：

```
> /goal 将 Express API 迁移到 tRPC：
> 1. 在 src/trpc/routers/ 下创建 user.ts、order.ts、product.ts 三个 router
> 2. 迁移全部 12 个端点，保持请求/响应格式不变
> 3. 中间件改为 tRPC middleware 格式
> 4. 迁移完成后 pnpm test 全部通过
> 5. 不改动 src/db/ 下的任何 schema 文件

> 按 /goal 中的步骤执行，从第 1 步开始
```

设置目标后再开始执行，Codex 在每一步操作时都能看到完整的 5 步计划。当它改到第 4 个端点想"顺手"修个类型错误时，目标中的第 5 条约束（"不改动 src/db/ 下的任何 schema 文件"）会把它拉回来。

如果中间需要暂停：

```
> /goal pause
> /goal 先帮我修一个紧急的 prod bug，修完我们继续迁移
```

修完 bug 后：

```
> /goal resume
> 继续迁移，刚才做到了第 2 步的 order.ts
```

### 场景二：多步骤功能开发

**任务**：为一个现有项目添加文件上传功能，涉及前端组件、后端 API、存储配置、文件校验。

**步骤**：

```
# 第一步：设定总体目标
> /goal 为应用添加文件上传功能：
> - 支持图片（jpg/png/webp，最大 10MB）和 PDF（最大 50MB）
> - 使用 S3 兼容存储（项目已配置 @aws-sdk/client-s3）
> - 前端用 react-dropzone 组件
> - 后端 API: POST /api/upload, GET /api/files/:id
> - 添加文件类型校验和病毒扫描 hook
> - 迁移脚本创建 files 表
> - 完成后跑完整测试套件

# 第二步：让 Codex 在规划模式下拆解
> /plan 按照 /goal 中的要求，设计一个分步实施方案

# 第三步：审阅方案，确认后执行
> （审阅 Codex 输出的方案）
> 按方案执行，从第一步开始

# 第四步：如果中途需要调整
> /goal pause
> /goal 更新：文件类型校验改用 file-type 库而不是 magic-number，因为 magic-number 对 webp 支持不完整

> /goal resume
> 继续执行，注意使用 file-type 库做文件类型检测
```

这个工作流的重点是：`/goal` 和 `/plan` 配合使用。`/goal` 锚定"要做什么"，`/plan` 负责"怎么做"。当需求变更时，先暂停目标、更新描述、再恢复——整个过程中 Codex 的注意力始终被正确的目标牵引。

### 场景三：跨文件 bug 修复

**任务**：修复一个用户报告的"上传大文件时页面崩溃"的 bug，根因不明，需要跨前端、后端、基础设施排查。

```
# 先设目标——即使还不知道根因，也要有明确的完成标准
> /goal 修复上传大文件（>5MB）时页面崩溃的问题：
> - 复现 bug 并定位根因
> - 修复后能成功上传 10MB 文件
> - 不破坏现有小文件上传功能
> - pnpm test 通过

# 开始排查
> 用户报告在 Chrome 上传 8MB PNG 时页面白屏。帮我排查。
> 先看 src/components/FileUpload.tsx 的上传逻辑
```

排查过程中，Codex 可能会发现问题出在后端的超时配置上。但因为有目标约束（"不破坏现有小文件上传功能"），它在修改超时配置时会同时检查小文件场景是否受影响。

修复完成后：

```
> /goal
当前目标：修复上传大文件（>5MB）时页面崩溃的问题

> 跑一遍测试确认没有回归
> /goal clear
目标已清除
```

---

## 6. 高级技巧

### 动态调整目标

长任务中需求变更是常态。`/goal` 的设计允许你在任何时候修改目标，不需要创建新会话。

有两种常见的调整方式：

**叠加式调整**：不清除原目标，追加新约束。

```
> 当前目标是"迁移认证模块"。注意：还需要同时把 rate limiter 从 express-rate-limit 迁移到 @upstash/ratelimit，因为我们下个月要下线 Redis 单机部署
```

**替换式调整**：直接用新的 `/goal` 覆盖旧目标。

```
> /goal 将认证迁移 + rate limiter 迁移合并执行：
> 1. 认证从 JWT 迁移到 session
> 2. Rate limiter 从 express-rate-limit 迁移到 @upstash/ratelimit
> 3. 两项迁移共用同一个 PR，测试全部通过后提交
```

选择哪种方式取决于变化的幅度。如果是小调整（加一条约束），叠加式更省事。如果是大变动（目标本身变了），替换式更清晰。

### 目标分解策略

当目标很大时（比如涉及整个模块的重写），可以采用"渐进式目标"策略：

```
# 第一阶段目标
> /goal 阶段 1/3：创建 tRPC router 骨架，定义所有 procedure 签名，不实现具体逻辑

（完成后清除）

# 第二阶段目标
> /goal 阶段 2/3：实现 user router 的全部 procedure，包括输入校验和错误处理

（完成后清除）

# 第三阶段目标
> /goal 阶段 3/3：实现 order 和 product router，全部测试通过
```

这种策略的好处是每个阶段的目标都很聚焦。Codex 不需要同时兼顾"所有要做的 12 件事"，而是每一阶段只关注当前要做的事。上下文窗口的压力也小很多。

当然，你也可以用多 Agent 来实现并行分解——主线程持有总体目标，通过 `spawn_agent` 把子任务分配给子 agent。但要注意 `max_depth` 的限制：默认值是 1，意味着子 agent 不能再 spawn 孙 agent。如果你的任务嵌套层级更深，需要在 config.toml 中调高 `max_depth`。

### 常见误区

**误区一：目标写得太详细**

有些人会把整个需求文档塞进 `/goal`：

```
> /goal 背景：我们的系统是一个电商后台管理系统，当前使用的是...
（2000 字的背景介绍）
具体要求：1. xxx 2. xxx ...（1500 字的具体步骤）
```

这不好。目标应该是"方向锚点"，不是"完整需求文档"。Codex 每一轮都会看到目标文本，目标越长，占用的 prompt token 越多，留给实际代码生成的空间越少。把详细内容放到文件里，目标里只放关键约束和完成标准。

**误区二：设置目标后不管理**

`/goal` 不是"设置后就不用管了"。长任务中你应该定期检查目标是否仍然准确——需求可能变了，或者你已经发现最初的方案有问题。至少在以下时机检查一次目标：

- 完成一个主要子任务后
- 发现需要偏离原计划时
- 对话超过 20 轮后

输入 `/goal` 看一眼，确认目标仍然是对的。

**误区三：一个目标里塞多个不相关任务**

```
# 不好
> /goal 修复登录 bug，顺便把用户列表的分页改了，还有首页加载速度也优化一下

# 好的做法：一次一个目标
> /goal 修复登录页输入密码后白屏的 bug（复现步骤：xxx）
```

一个目标只放一个内聚的任务。不相关的东西分不同的会话或者分阶段做。目标越聚焦，Codex 偏航的概率越低。

**误区四：忘了清除已完成的目标**

目标完成后不清除，会让 Codex 在后续对话中仍然受到旧目标的牵引。虽然通常不会导致严重问题（目标已经完成了，Codex 会判断不需要再做），但会浪费 prompt token，也可能在相似场景下产生混淆。

完成任务后养成习惯：`/goal clear`。

**误区五：在 side 对话里尝试用 /goal**

前面提到过，`/goal` 不在 side 对话的可用命令列表中。如果你在 `/side` 对话中输入 `/goal`，Codex 会提示这条命令不可用。这时候应该退出 side 对话，在主线程中操作。

### 与 exec 非交互模式的配合

在 CI/CD 场景下，你可能用 `codex exec` 模式运行 Codex 命令。exec 模式不支持交互式的斜杠命令，但你可以通过显式沙箱参数和 prompt 中内联目标来实现类似效果：

```bash
# 在 exec 模式中通过 prompt 指定目标
codex exec --sandbox workspace-write "目标：将 src/api/ 下所有 REST 端点迁移到 tRPC。完成后运行 pnpm test 确认通过。"
```

exec 模式的"目标"不是通过 `/goal` 命令设置的，而是直接写在 prompt 里。它的效果类似但不完全相同——prompt 中的目标只在第一轮可见，不会像 `/goal` 那样每轮注入。对于短任务（能在一两轮内完成的）这够用了，但对于长任务，还是推荐用交互式的 `/goal`。

---

## 延伸阅读

- **本系列第 13 篇：规划模式 /plan** — `/goal` 和 `/plan` 是天然搭档。先 `/plan` 做方案，再用 `/goal` 锚定执行目标
- **本系列第 10 篇：会话管理** — `/fork`、`/side`、`/resume` 与目标的交互关系
- **本系列第 11 篇：上下文管理** — 理解 `/goal` 为什么需要每轮注入，以及上下文窗口的 token 预算管理
- **本系列第 28 篇：AGENTS.md 项目指令文件** — 全局规则和会话级目标的分工
- [OpenAI Codex 官方文档](https://developers.openai.com/codex) — Codex CLI 使用指南
- [GitHub: openai/codex](https://github.com/openai/codex) — 源码仓库，`codex-rs/tui/src/slash_command.rs` 中可以看到 `/goal` 的命令定义
