<!--
调研来源（不发布，仅记录）：
1. OpenAI 官方文档 developers.openai.com/codex/config-reference — config.toml 全量配置表
2. OpenAI 官方文档 developers.openai.com/codex/cli/slash-commands — /compact、/status 等 slash commands
3. OpenAI 官方文档 developers.openai.com/api/docs/guides/compaction — 服务端压缩 API 机制
4. OpenAI 官方文档 developers.openai.com/codex/learn/best-practices — 最佳实践（session 管理 /compact）
5. inventivehq.com: How to Fix OpenAI Codex CLI Context Window Exceeded Errors
6. Reddit r/codex: 社区讨论 auto-compact 阈值（40-50%）、context window 上限
7. community.openai.com: Auto Compression Not Triggering 问题讨论
版本基准: 2026 年 6 月
-->

# Codex CLI 上下文管理：别让对话太长，/compact 压缩与 token 预算

> **TL;DR** — 每个模型都有一个上下文窗口上限（GPT-5.4 约 200K token），对话历史、文件内容、系统指令全挤在这个窗口里。超了就丢东西。Codex CLI 提供三个关键工具来管理 token 用量：`/status` 查看实时 token 消耗，`/compact` 手动压缩对话历史，`model_auto_compact_token_limit` 配置自动压缩阈值。加上 `tool_output_token_limit` 控制单次工具输出上限，以及 `.codexignore` 排除无关文件，你就能在长任务中保持 Codex 的回答质量不下降。

---

## 1. 为什么上下文管理很重要

用 Codex CLI 做过大型重构的人大概都遇到过这种情况：前 20 分钟回答又快又准，后面开始答非所问，甚至重复之前的修改。这不是模型变笨了——是上下文窗口满了。

### 上下文窗口是什么

每个语言模型在推理时能"看到"的文本量有一个硬性上限，叫作上下文窗口（context window），单位是 token。Token 介于字符和单词之间——它是模型分词器（tokenizer）的最小处理单元。对于 GPT 系列模型，一个常见的近似是：1 个 token 大约等于 4 个英文字符或 0.75 个英文单词。

不同模型的上下文窗口大小：

| 模型 | 上下文窗口 | 大约相当于 |
|------|-----------|-----------|
| GPT-4o | 128K token | ~96,000 英文单词 |
| GPT-5.4 | ~200K token | ~150,000 英文单词 |
| GPT-5.5 | ~200K token | ~150,000 英文单词 |

看起来很大。但问题是，上下文窗口里装的不只是你的提问和模型的回答。

### 窗口里都装了什么

Codex 每次调用模型 API 时，发送的 token 包含这些部分：

```
系统指令（system instructions）
  └─ Codex 内置行为规则 + AGENTS.md 内容 + developer_instructions
对话历史（conversation history）
  └─ 你的每一条输入 + 模型的每一条回复
工具调用与返回（tool calls & outputs）
  └─ shell 命令执行结果、文件读取内容、MCP 服务器返回数据
其他元数据
  └─ 模型 reasoning 内容、压缩摘要（compaction item）等
```

这些全部加在一起，不能超过上下文窗口。一旦超出，最老的内容会被丢弃——模型就"忘记"了之前的对话。

### 长会话的典型症状

上下文接近上限时，你会观察到：

1. **回答质量下降**：模型开始忽略你早期的约束和约定，做出和之前决策矛盾的修改
2. **重复劳动**：模型重新做已经完成的工作，因为"忘记"了之前已经改过
3. **幻觉增加**：对代码结构的理解出现偏差，生成不存在的方法名或文件路径
4. **响应变慢**：接近上下文上限时，API 处理时间随 token 数量线性增长

这些问题的根源都是同一个：上下文窗口不够用了。后面的所有技巧都围绕一个问题——怎么在有限的窗口里装下真正有用的信息。

---

## 2. `/status` 查看 token 用量

管理上下文的第一步是知道当前用了多少。Codex CLI 提供了 `/status` 命令来做这件事。

### 使用方法

在 Codex CLI 的 TUI 界面中，输入：

```
/status
```

Codex 会输出一段类似这样的信息：

```
Model: gpt-5.4
Approval policy: workspace-write
Writable roots: /Users/you/project
Token usage: 87,432 / 200,000 (43.7%)
Session ID: abc123-def456
```

这里的关键数据是 **Token usage** 这一行。它告诉你当前会话已经消耗了多少 token，上下文窗口的总容量是多少，以及使用百分比。

### 什么时候该看

两个时机特别需要检查 token 用量：

**长任务开始前**：如果你准备做一个跨多个文件的重构，先看一眼当前 token 消耗。如果已经有 60% 以上被占用，要么先 `/compact` 压缩一下，要么用 `/new` 开一个新对话。

**感觉回答质量下降时**：当你发现 Codex 开始忽略之前的约束，或者做出和已有代码风格不一致的修改，先查 `/status`。如果使用率超过 70%，压缩或开新会话是直接有效的解决方案。

### 底部状态栏

除了手动执行 `/status`，你还可以在 TUI 底部状态栏（status line）里显示 token 信息。用 `/statusline` 命令可以交互式地配置要显示哪些状态项：

```
/statusline
```

在弹出的选择器里，你可以添加"token counters"和"context stats"两个项目到状态栏。这样不用每次手动查，底部一直能看到 token 用量百分比。

配置完成后，Codex 会把你的选择持久化到 `~/.codex/config.toml` 里的 `tui.status_line` 字段。

---

## 3. `/compact` 压缩对话历史

`/compact` 是 Codex CLI 里最直接的上下文管理工具。它把之前的对话历史总结成一段摘要，用摘要替换原始的完整对话，从而释放大量 token。

### 压缩做了什么

当你执行 `/compact`：

```
/compact
```

Codex 会调用模型的压缩能力，把当前对话历史里所有轮次的内容——你的提问、模型的回答、工具调用结果——压缩成一段加密的 compaction item。这段 compaction item 保留了关键信息（做了什么决策、修改了哪些文件、当前代码状态），但丢弃了细节（具体的命令输出、中间讨论过程）。

压缩前后对比：

```
压缩前：
  用户输入 1 (500 token) + 模型回复 1 (800 token)
  工具调用 1 结果 (2000 token)
  用户输入 2 (300 token) + 模型回复 2 (600 token)
  工具调用 2 结果 (1500 token)
  用户输入 3 (400 token) + 模型回复 3 (700 token)
  总计: ~6800 token

压缩后：
  compaction item: "用户要求重构 auth 模块。已完成：将 session 认证替换为 JWT，
  修改了 src/auth.ts、src/middleware.ts，新增了 src/lib/jwt.ts。测试通过。
  约定：所有 token 过期时间设为 24h，refresh token 存 httpOnly cookie。"
  总计: ~200 token
```

一次压缩能把几千甚至几万 token 的历史压缩到几百 token。代价是你丢失了中间过程的细节。

### 什么时候该压缩

几个明确的触发时机：

**token 使用超过 50%**：这是社区里广泛认同的经验值。在 50% 左右压缩，给后续对话留足空间，同时历史还不算太长，压缩摘要的质量也较好。

**切换子任务时**：如果你在一个长会话里先做后端 API，再做前端组件，在切换之前 `/compact` 一次。让摘要记录"后端 API 已完成"这个结论，然后开始前端部分。这样后续对话不会被后端 API 的实现细节占据上下文。

**回答质量明显下降时**：查完 `/status` 发现超过 70%，直接压缩。再不压缩就要丢信息了。

**长会话中途休息前**：如果你要离开 30 分钟再回来，先压缩一次。回来后模型基于摘要继续，比你带着臃肿的完整历史继续效果好。

### `compact_prompt` 自定义压缩提示

默认的压缩行为由 Codex 内置的 compaction prompt 控制。如果你有特定需求——比如希望在摘要中保留某些类型的信息——可以通过 `compact_prompt` 配置项来自定义。

在 `~/.codex/config.toml` 中：

```toml
# 自定义压缩提示
compact_prompt = "请保留所有已修改文件的完整路径列表，以及每个修改的简要说明。重点保留代码风格约定和架构决策。"
```

或者用文件引用：

```toml
# 从文件加载压缩提示（实验性功能）
experimental_compact_prompt_file = "~/.codex/compact-instructions.md"
```

自定义压缩提示适合这些场景：

- 你的项目有特定的架构约定，需要确保压缩后不丢失
- 你在用 Codex 做持续集成/持续重构，需要保留每次修改的文件清单
- 你发现默认压缩总是丢掉某类你认为重要的信息

大多数情况下不需要自定义。Codex 的默认压缩行为对常规开发任务已经足够。

### 压缩的限制

压缩不是万能的。它有一个根本性的限制：**压缩是不可逆的**。一旦压缩完成，原始对话的细节就再也找不回来了。如果你后来发现需要之前某个工具调用的完整输出，只能重新执行那个命令。

这也意味着，如果你在压缩前没有仔细检查模型的修改，压缩后就很难回溯"模型到底改了什么"。一个好的习惯是：在压缩前用 `/diff` 看一眼当前改动，确认没有遗漏。

---

## 4. 上下文窗口的组成

理解上下文窗口里各部分怎么分配 token，有助于找到优化空间。

### 四大组成部分

一个典型的 Codex CLI 会话中，上下文窗口被分成四块：

**系统指令（System Instructions）**

这部分包括 Codex 的内置行为规则、你的 AGENTS.md 内容、`developer_instructions` 配置项的值，以及任何通过 hooks 注入的指令。对于大多数项目，系统指令占 2,000-8,000 token，取决于 AGENTS.md 的长度。

优化策略：
- AGENTS.md 控制在 3,000 字以内，太长的部分拆到子目录的 AGENTS.md
- 用 `project_doc_max_bytes` 限制 Codex 读取 AGENTS.md 的最大字节数
- 不要在 AGENTS.md 里放完整的代码示例，用文件路径引用代替

**对话历史（Conversation History）**

你和模型一来一回的所有消息。这是 token 消耗的大头。一个 10 轮对话（你问 10 次，模型答 10 次），不算工具输出，大约消耗 5,000-15,000 token。

优化策略：
- 定期 `/compact`
- 提问时保持精确，不说废话
- 一个线程做一个任务，不用一个线程做整个项目

**工具调用与返回（Tool Outputs）**

模型执行 shell 命令、读文件、调用 MCP 工具的输出。这是 token 消耗增长最快的部分。一个 `cat` 命令读取 500 行文件，可能直接带来 3,000-5,000 token。

优化策略：
- 用 `tool_output_token_limit` 限制单次工具输出的 token 上限
- 在 `.codexignore` 里排除大文件和无关目录
- 用 `/mention` 精确指定要读取的文件，而不是让 Codex 自己扫目录

**压缩摘要（Compaction Items）**

每次压缩产生的 compaction item。这部分通常很小（200-500 token），但它替代了之前可能几万 token 的完整历史。

### 典型的 token 分配

假设一个 GPT-5.4（200K 窗口）的会话，经过 20 分钟的重构工作：

```
系统指令:         ~5,000 token  ( 2.5%)
对话历史:        ~30,000 token  (15.0%)
工具输出:        ~80,000 token  (40.0%)
压缩摘要:           ~400 token  ( 0.2%)
────────────────────────────────────────
已使用:          ~115,400 token  (57.7%)
剩余:            ~84,600 token  (42.3%)
```

工具输出占了最大头。一次 `ls -la node_modules/` 可能就吃掉 20K token。这也是为什么 `.codexignore` 和精确的文件引用如此重要。

---

## 5. `tool_output_token_limit`

工具输出是上下文膨胀的重灾区。Codex 提供了一个配置项来控制它。

### 配置方法

在 `~/.codex/config.toml` 中：

```toml
# 限制每个工具调用的输出最多占用多少 token
tool_output_token_limit = 8000
```

这个值的意思是：当 Codex 执行一个工具（比如 shell 命令），返回的结果如果超过 8,000 token，就会被截断。只有前 8,000 token 的内容会保存到对话历史中。

### 设置太小会怎样

假设你把 `tool_output_token_limit` 设成 2,000：

```
tool_output_token_limit = 2000
```

模型执行 `npm test`，测试输出有 200 行（大约 3,000 token）。截断后模型只能看到前 130 行。如果测试失败的原因在最后几行，模型根本看不到错误信息，也就无法帮你修复。

### 设置太大会怎样

假设你设成 100,000：

```
tool_output_token_limit = 100000
```

模型读了一个 1,500 行的 JSON 文件。完整内容全部进入上下文，直接吃掉 30,000-50,000 token。一次文件读取就用掉了四分之一的上下文窗口。

### 推荐值

对于大多数项目，8,000-12,000 是一个合理的范围。这个值足够让模型看到大部分命令的完整输出，又不会因为一次工具调用就撑爆上下文。

```toml
# 日常开发
tool_output_token_limit = 10000

# 大型项目（文件较多）
tool_output_token_limit = 8000

# 小型项目（文件较少）
tool_output_token_limit = 15000
```

如果你发现模型频繁截断了你需要它看到的输出，适当调大。如果你发现模型经常读大文件浪费 token，适当调小。

---

## 6. 文件大小的 token 估算

管理上下文的一个实用技能是估算 token。你不需要精确计算，能估出数量级就够了。

### 估算规则

不同类型内容的 token 转换比例：

| 内容类型 | 估算规则 | 示例 |
|----------|----------|------|
| 英文文本 | 1 token ≈ 4 字符 ≈ 0.75 单词 | "Hello world" ≈ 2-3 token |
| 中文文本 | 1 token ≈ 1-2 个汉字 | "你好世界" ≈ 4-8 token |
| Python 代码 | 1 token ≈ 3-4 字符 | 100 行 ≈ 800-1,200 token |
| TypeScript 代码 | 1 token ≈ 3-4 字符 | 100 行 ≈ 800-1,200 token |
| JSON 数据 | 1 token ≈ 3-4 字符 | 100 行 ≈ 1,000-1,500 token |
| HTML/JSX | 1 token ≈ 3-4 字符 | 100 行 ≈ 800-1,200 token |

中文比英文消耗更多 token，因为中文的每个汉字在 GPT 分词器里通常对应 1-2 个 token，而英文一个单词大约 1-1.3 个 token。

### 实际项目示例

一个中等规模的 Next.js 项目：

```
src/app/page.tsx                    85 行  →  ~700 token
src/app/api/auth/route.ts          120 行  →  ~1,000 token
src/components/Header.tsx           95 行  →  ~800 token
src/lib/auth.ts                    200 行  →  ~1,600 token
src/db/schema/users.ts              60 行  →  ~500 token
package.json                        45 行  →  ~400 token
tsconfig.json                       25 行  →  ~200 token
──────────────────────────────────────────────────────────
单个文件读取总和                           ~5,200 token
```

如果 Codex 在一次会话里读取了 15 个文件，光是文件内容就占 50,000-80,000 token。加上对话历史和工具输出，200K 的窗口很快就满了。

### `.codexignore` 控制文件扫描

Codex 读取代码时会自动扫描项目目录。用 `.codexignore` 可以排除不需要的文件和目录，减少不必要的 token 消耗。

在项目根目录创建 `.codexignore`：

```
# 依赖目录（通常很大）
node_modules/
vendor/
.venv/

# 构建输出
dist/
build/
.next/
out/

# 二进制和媒体文件
*.jpg
*.png
*.gif
*.pdf
*.zip

# 锁文件（体积大，信息密度低）
package-lock.json
yarn.lock
pnpm-lock.yaml

# 测试覆盖率报告
coverage/
.nyc_output/

# 大型数据文件
*.csv
*.min.js
*.min.css
*.map
```

原则很简单：把不需要 Codex 看到的大文件和大目录排除掉。Codex 不会读这些文件，也就不会浪费 token。

---

## 7. 长任务的工作流拆解

理论讲够了。下面是一套在长任务中管理上下文的实践方法，直接可以照着做。

### 分阶段执行

把大任务拆成独立的阶段，每个阶段完成后压缩一次。

```
目标：重构用户认证系统

阶段 1：分析现有代码
  - 让 Codex 读取并理解当前 auth 实现
  - /compact（保留分析结论，丢弃读取过程）

阶段 2：设计新方案
  - 基于 compaction 摘要中的分析结论，讨论新方案
  - 确认方案后 /compact（保留方案设计，丢弃讨论过程）

阶段 3：实现核心逻辑
  - 基于 compaction 摘要中的方案设计，写代码
  - 完成后 /compact（保留已修改文件清单，丢弃具体代码diff）

阶段 4：编写测试
  - 基于 compaction 摘要中的文件清单，写测试
  - 完成后 /compact

阶段 5：运行测试并修复
  - 运行测试，修复失败的用例
```

每个阶段结束后压缩，下一个阶段基于摘要开始。这样每个阶段的上下文都很紧凑。

### 用 `/goal` 设目标

长任务中容易跑偏。用 `/goal` 给 Codex 一个持久目标：

```
/goal 完成认证模块从 session 到 JWT 的迁移，所有测试通过，不破坏现有 API 接口
```

Codex 会在整个任务过程中保持这个目标。即使压缩后，目标仍然保留在上下文里。当你发现 Codex 开始偏离方向，可以用 `/goal` 查看（不带参数），提醒它当前目标。

### 精确引用文件

不要让 Codex 自己扫描整个项目。用 `/mention` 精确告诉它看哪个文件：

```
# 不好——让 Codex 自己找
"看一下 auth 相关的代码"

# 好——精确指定
"读取 src/auth/middleware.ts 和 src/lib/session.ts，分析当前的认证流程"
```

或者用 `/mention` 命令：

```
/mention src/auth/middleware.ts
/mention src/lib/session.ts
```

这样 Codex 只读取你指定的文件，不会把 `node_modules/` 里的无关文件也拉进上下文。

### 分会话做不相关的任务

一个线程只做一件有逻辑关联的事。如果你正在重构 auth 模块，突然需要修一个 CSS bug，开一个新会话：

```
/new
```

在新的线程里修 CSS bug，修完后用 `/resume` 回到 auth 重构线程继续。两个任务互不干扰，各自保持紧凑的上下文。

### 用子代理处理子任务

Codex 支持子代理（subagent），可以把探索性的工作委派出去。子代理有自己独立的上下文窗口，不占用主线程的 token 预算。

比如你想在重构 auth 之前先了解现有的测试覆盖情况：

```
"用子代理扫描 src/auth/__tests__/ 目录，告诉我哪些认证场景有测试覆盖，哪些没有"
```

子代理在自己的上下文里完成扫描，返回一个简短的结果。主线程只消耗结果那几十个 token，而不是整个扫描过程的几千个 token。

---

## 8. 自动压缩机制

手动 `/compact` 需要你记得去做。Codex 还提供了自动压缩——当 token 使用量达到一个阈值时，自动触发压缩。

### `model_auto_compact_token_limit`

在 `~/.codex/config.toml` 中配置：

```toml
# 当 token 使用量达到这个值时，自动压缩
model_auto_compact_token_limit = 120000
```

这个值的含义是：当 Codex 检测到当前上下文的 token 使用量接近 120,000 时，自动执行压缩操作。压缩后 token 使用量会大幅下降，为新对话腾出空间。

### 阈值怎么设

合理的阈值取决于你的上下文窗口大小和任务类型：

```toml
# GPT-5.4（200K 窗口）—— 日常开发
model_auto_compact_token_limit = 100000

# GPT-5.4（200K 窗口）—— 复杂重构（需要更多上下文余量）
model_auto_compact_token_limit = 80000

# GPT-4o（128K 窗口）—— 日常开发
model_auto_compact_token_limit = 64000
```

如果你不设置这个值，Codex 会使用模型默认值。默认值通常是上下文窗口的 50-60%。但如果你发现自动压缩触发得太晚（已经出现了质量下降），可以手动设一个更低的阈值。

### 自动 vs 手动

两者不冲突，可以同时使用：

- **自动压缩**是安全网。即使你忘了手动压缩，也不会因为上下文溢出而丢信息
- **手动压缩**是精细控制。在切换子任务时手动压缩，比等自动触发更精准

一个推荐的做法是：设置一个偏低的自动压缩阈值作为兜底，同时在关键节点手动 `/compact`。

```toml
# 兜底自动压缩
model_auto_compact_token_limit = 100000
```

然后在 50,000-70,000 token 时根据需要手动压缩。

### 自动压缩的注意事项

自动压缩有一个潜在问题：它在模型推理过程中触发，会带来额外的延迟。压缩本身需要一次 API 调用来生成摘要。在低延迟场景下（比如你在 Codex CLI 里实时对话），突然的压缩可能导致一次回复慢 5-10 秒。

如果你对延迟敏感，可以把自动压缩阈值设得低一些，让压缩更早触发（此时上下文更短，压缩更快）：

```toml
model_auto_compact_token_limit = 60000
```

---

## 9. 实战：30 分钟重构任务的上下文管理

用一个具体的例子把前面所有的工具串起来。

### 任务描述

你有一个 Next.js 项目，需要把用户认证从 session cookie 迁移到 JWT。涉及 5 个文件，预计需要 30 分钟。

### Step 1：开始前检查（0 分钟）

```
/status
```

输出：

```
Token usage: 2,000 / 200,000 (1.0%)
```

新会话，干净的状态。设置目标：

```
/goal 完成 auth 从 session 到 JWT 的迁移。约束：不破坏现有 API 接口，所有测试必须通过
```

### Step 2：分析阶段（0-8 分钟）

告诉 Codex 读取相关文件：

```
读取 src/auth/session.ts、src/middleware.ts、src/app/api/auth/login/route.ts、
src/app/api/auth/logout/route.ts、src/lib/cookies.ts，分析当前 session 认证的完整流程
```

Codex 读取 5 个文件，分析完成后，你的提问加上模型的回复加上 5 个文件内容，大约消耗 15,000-20,000 token。

```
/status
```

输出：

```
Token usage: 18,000 / 200,000 (9.0%)
```

还好。但分析过程中 Codex 可能执行了一些 shell 命令（比如 `grep` 查找相关引用），加上工具输出，实际可能到 30,000-40,000 token。

分析完成后，立即压缩：

```
/compact
```

### Step 3：设计阶段（8-12 分钟）

基于 compaction 摘要中的分析结论，和 Codex 讨论 JWT 迁移方案：

```
基于刚才的分析，设计 JWT 迁移方案。要求：
1. 使用 RS256 算法签名
2. access token 过期时间 15 分钟
3. refresh token 过期时间 7 天，存 httpOnly cookie
4. 保持现有的 /api/auth/login 和 /api/auth/logout 接口不变
```

Codex 给出方案后，检查 token：

```
/status
```

输出可能类似：

```
Token usage: 28,000 / 200,000 (14.0%)
```

确认方案后，再次压缩：

```
/compact
```

### Step 4：实现阶段（12-22 分钟）

告诉 Codex 开始写代码：

```
按照确认的方案，实现 JWT 认证。先创建 src/lib/jwt.ts 实现 token 生成和验证，
然后修改 src/auth/session.ts 替换 session 逻辑，最后更新 middleware.ts 
验证 JWT 而不是 session。
```

实现过程中 Codex 会读写多个文件、执行测试命令。这个过程 token 增长最快——每次文件修改都会带来新的工具输出。

中间检查一次：

```
/status
```

输出：

```
Token usage: 85,000 / 200,000 (42.5%)
```

还没到 50%，但已经接近了。如果实现还没完成，可以等一会儿再压缩。如果快完成了，等完成后再压缩。

实现完成后：

```
/compact
```

### Step 5：测试与修复（22-28 分钟）

```
运行所有认证相关的测试，修复失败的用例
```

Codex 执行 `npm test`，查看输出，修复问题。测试输出可能很长。

```
/status
```

输出：

```
Token usage: 52,000 / 200,000 (26.0%)
```

压缩后 token 量已经降下来了。测试通过后做最终检查：

```
/diff
```

查看所有修改。确认没有遗漏和错误。

### Step 6：收尾（28-30 分钟）

```
/review
```

让 Codex 自己审查一遍改动。然后最终检查 token 使用：

```
/status
```

输出：

```
Token usage: 58,000 / 200,000 (29.0%)
```

30 分钟的重构任务，全程 token 使用控制在 30% 以下。全程执行了 3 次压缩，每次压缩把对话从几万 token 降到几百 token。Codex 始终有足够的上下文窗口来理解任务、执行修改、运行测试。

### 总结这个工作流

```
开始 → /status（检查初始状态）
     → /goal（设置任务目标）
     → 分析 → /compact
     → 设计 → /compact
     → 实现 → /compact
     → 测试 → /diff + /review
     → /status（确认最终状态）
```

关键原则：**每个阶段结束后压缩，不要等到上下文快满了才想起来**。

---

## 10. 下一步

上下文管理是 Codex CLI 日常使用中最影响体验的技能。掌握 `/status` 查看用量、`/compact` 压缩历史、`tool_output_token_limit` 控制工具输出，你已经能处理大多数长任务场景。

接下来可以深入的方向：

- **AGENTS.md 编写**：优化系统指令的 token 占用，让 Codex 在更少的指令下理解你的项目
- **MCP 服务器配置**：通过外部工具减少 Codex 自己扫描代码的需要
- **子代理工作流**：把探索性的工作委派给子代理，保护主线程的上下文预算
- **Prompt caching**：利用 OpenAI 的提示缓存机制降低重复上下文的成本

---

**延伸阅读**：

- [Codex CLI Slash Commands 官方文档](https://developers.openai.com/codex/cli/slash-commands)
- [Codex Config Reference 官方文档](https://developers.openai.com/codex/config-reference)
- [Codex Compaction API 文档](https://developers.openai.com/api/docs/guides/compaction)
- [Codex Best Practices 官方文档](https://developers.openai.com/codex/learn/best-practices)
