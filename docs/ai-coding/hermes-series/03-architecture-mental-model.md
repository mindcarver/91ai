# 架构心智模型：agent loop、关键类、一次对话内部流程

> 系列第 3 篇 · 读者预设：跑通了 Hermes（读完 02 篇）、想知道黑盒里到底发生什么的人 · 最后核实：2026-07

**TL;DR：** Hermes 把六块东西拼成一个长期运行的有状态回路：**gateway（20 个平台入口）→ AIAgent（`run_agent.py` 里的同步编排引擎）→ skills（程序性记忆，渐进式披露）+ memory（MEMORY.md / USER.md / SQLite-FTS5 / Honcho 四层）+ tools（70+ 内置，6 种 backend）→ terminal backend（local / Docker / SSH / Singularity / Modal / Daytona）**。一次对话内部不是「问→答」一次，而是 agent loop 跑多轮，每轮 9 步：生成 task_id、追加消息、构建 system prompt、预检压缩（>50% 触发）、转 API 消息、注入临时层、加缓存标记、可中断 API 调用、解析（工具调用就执行后回到第 5 步，文本回复就持久化收尾）。理解这条回路后，本系列后面 22 篇每一篇都是在某个节点上加深度。

## 为什么值得花一篇文章讲架构

把 Hermes 当「一个能聊天的 CLI」用，是低估它。把它当「一个完整的 OS」用，又会被复杂度吞掉。两种误判都来自同一件事：**你不知道消息进来之后，到底在哪些组件之间转了一圈**。

读完这篇你应该能回答：

- 用户从 Telegram 发一句话，到收到回复，中间经过了哪些类、哪些文件
- 为什么对话不会随着轮次变多而 token 爆炸（提示：不是「丢了」，是分层 + 压缩 + 渐进式披露）
- 为什么 Hermes 敢说「self-improving」，以及它自己也不能闭环的那一半（提示：仓库外有第二个 repo 用 GEPA 给它纠偏）
- 修改一个东西该改哪里：`config.yaml` / `MEMORY.md` / `~/.hermes/skills/` / `SOUL.md` / `AGENTS.md`

后面 22 篇每一篇都是「在某个方块或某一步上加深度」。这一篇给你那张地图。

## 这篇和你将读到的其他资料的区别

写之前先界定边界。Hermes 官方 [Architecture 文档](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture) 给的是「代码地图」：目录结构、文件用途、推荐阅读顺序，适合你想动手改源码时用。[Agent Loop Internals](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop) 给的是「`AIAgent` 类的方法级文档」：每个 API mode、每个 callback、每个边界条件。社区博客（mranand 的 [Inside Hermes Agent](https://mranand.substack.com/p/inside-hermes-agent-how-a-self-improving)、Daniel Braz 的 [two loops](https://levelup.gitconnected.com/the-two-loops-of-hermes-agent-33922ba8d154)）视角偏「为什么这么设计」。

这一篇做的是官方文档不做、社区博客只部分做的事：**把六块组件拼成一张可走通的对话时序图，让你从「知道有哪些类」升级到「知道一次对话怎么穿过这些类」**。读完你应当能拿着这张图去读源码，而不是被目录结构淹没。

一个需要先纠正的常见误解：很多人把 agent loop 当「模型调一次 API」的同义词。它**不是**。agent loop 是一个多轮回环：模型每次返回 tool_calls，loop 执行工具、把结果塞回去、再调一次模型，直到模型返回纯文本回复才结束。一次「对话」内部可能跑了 5 到 30 次模型调用。这个数字直接决定了延迟、token 成本和 iteration budget 的设计。后面会反复回到这点。

## 一个坐标系：把 Hermes 想成「一个办事员 + 一张办公桌」

纯技术架构图往后放，先用一个能记住的比喻建立坐标系。把整套系统想象成「一个长期雇佣的办事员」，他的工作环境是这样的：

| 角色 | 现实里是什么 | 文件 / 类 |
| --- | --- | --- |
| **收发室** | 20 个平台的消息进出一个口子 | `gateway/run.py`（`GatewayRunner`）+ `gateway/platforms/*` |
| **办事员本人** | 同步编排引擎，每个回合决定下一步干啥 | `AIAgent` 类，在 `run_agent.py` |
| **办公桌** | 干活的实际环境 | `tools/environments/*`（6 个 backend） |
| **工作手册** | 「上次怎么做的」程序性记忆 | `~/.hermes/skills/` 下的 Markdown |
| **笔记本** | 「这个人是谁、以前聊过啥」 | `MEMORY.md` / `USER.md` / SQLite-FTS5 / Honcho |
| **工具箱** | 能调用的能力 | `tools/registry.py`（70+ 工具，28 个 toolset） |

关键不是这张表本身，是几个**容易看错**的点：

- **办事员只有一个**。Hermes 是单 agent 架构，不是多 agent 编排（这是它和 OpenClaw 的核心差别，第 22 篇详讲）。所谓「子 agent」是办事员临时叫来帮手（`delegate_task` 工具），不是常驻角色。
- **收发室不只是转发**。gateway 自己也干事：用户授权（allowlist + DM 配对）、session 路由、cron 触发、hook 调度。把它当薄薄的 HTTP 转发层是低估它。
- **办公桌可以换**。同样一句「`ls -la`」，在本地跑、Docker 里跑、SSH 上跑、Modal 上跑，是四件事。backend 是可插拔的执行环境抽象。
- **工作手册不是全文进上下文**。默认只把「标题 + 一行摘要」塞进 system prompt，全文按需加载（progressive disclosure）。这是为什么 skill 数量从 40 涨到 200，token 成本几乎不涨。

记住这个坐标系，下面正式拆组件。

## 六大组件总图

先一张 ASCII 把六块和它们的数据流固定下来。后面每一节都是 zoom in 某一块。

```
                    ┌─────────────────────────────────────────────┐
                    │            Entry Points（入口）              │
                    │  CLI / Gateway / ACP(IDE) / Cron / API       │
                    └────────┬────────────────────────────────────┘
                             │ 文本 + session_id + user_id
                             ▼
        ┌────────────────────────────────────────────────────────────┐
        │                  AIAgent （run_agent.py）                   │
        │                                                            │
        │  每个 turn 9 步：构建 prompt → 预检压缩 → API 调用 →        │
        │  解析（工具调用？执行后回环；文本？持久化收尾）              │
        │                                                            │
        │   ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │
        │   │ prompt_      │  │ runtime_     │  │ model_tools    │   │
        │   │  builder.py  │  │  provider.py │  │  .py（dispatch）│   │
        │   └──────┬───────┘  └──────┬───────┘  └────────┬───────┘   │
        │          │                 │                   │           │
        │   ┌──────▼─────┐    ┌──────▼─────┐    ┌────────▼────────┐  │
        │   │ Context    │    │ 3 API mode │    │ Tool Registry   │  │
        │   │ Compressor │    │ chat/codex │    │ 70+ tools       │  │
        │   │ + caching  │    │ /anthropic │    │ 28 toolsets     │  │
        │   └────────────┘    └────────────┘    └────────┬────────┘  │
        └─────────────────────────────────────────────────┼──────────┘
                                              │          │
                          ┌───────────────────┘          │
                          ▼                              ▼
        ┌──────────────────────────────┐   ┌──────────────────────────┐
        │  检索 / 副作用（按需触发）    │   │   Terminal Backends       │
        │                              │   │  local / Docker / SSH     │
        │  ┌────────┐  ┌────────────┐  │   │  Modal / Daytona /        │
        │  │ skills │  │   memory   │  │   │  Singularity              │
        │  │（渐进  │  │ MEMORY.md  │  │   │                           │
        │  │ 披露） │  │ USER.md    │  │   │   + browser / web / MCP   │
        │  │        │  │ SQLite-FTS5│  │   │     backends              │
        │  │        │  │ Honcho     │  │   │                           │
        │  └────────┘  └────────────┘  │   └──────────────────────────┘
        └──────────────────────────────┘
                          ▲
                          │  写新 skill / 更新 MEMORY.md（周期性 nudge + 任务完成钩子）
                          └──────────────┐
                                         │
        ┌────────────────────────────────────────────┐
        │   Curator （后台进程，周循环）              │
        │   active → stale → archived / 合并 / 打分  │
        └────────────────────────────────────────────┘
```

下面六节，每块 zoom in 一次：**职责 / 输入输出 / 和谁交互**。

## 1. agent loop：大脑调度（`AIAgent`）

### 一句话职责

`AIAgent` 是 `run_agent.py` 里的同步编排引擎。它的工作是「**每个 turn 把 9 步走完，决定下一步是回话、调工具，还是结束**」。它是 Hermes 唯一的大脑，CLI、gateway、ACP、cron、API server 五个入口都复用同一个类。

> 注意区分「两个 agent loop」，这是社区里反复被搞混的点。
>
> - **执行 loop（AIAgent，`run_agent.py`）**：每个对话回合内的循环，处理「模型 → 工具 → 模型」。
> - **学习 loop（learning loop，跨 session）**：跨多个 session 的反馈闭环，处理「这次怎么做的 → 写成 skill → 下次同类问题直接用」。第 5 篇详拆。
>
> 两者不是同一个东西。前者是单回合编排，后者是跨 session 沉淀。所谓 self-improving 是后者，不是前者。

### 一个 turn 的 9 步生命周期

来自官方 `Agent Loop Internals` 文档，这是你最该背下来的一段。下面除了 9 步本身，还展开几个最容易卡住的地方。

```
run_conversation() 每个迭代：
  1. 没有 task_id 就生成一个
  2. 把用户消息追加到 conversation history
  3. 构建或复用缓存的 system prompt（prompt_builder.py）
  4. 预检压缩（context 已用 > 50% 时触发）
  5. 把 conversation history 转成 API 消息格式
       - chat_completions：OpenAI 原生格式
       - codex_responses：转成 Responses API input items
       - anthropic_messages：通过 anthropic_adapter.py 转
  6. 注入临时 prompt 层（预算警告、context 压力提示）
  7. 如果是 Anthropic，加 prompt caching 标记
  8. 发起可中断的 API 调用（_interruptible_api_call）
  9. 解析响应：
       - 如果是 tool_calls：执行，append 结果，回到第 5 步
       - 如果是文本回复：持久化 session、按需 flush memory、返回
```

第 9 步是「回环」的关键。一次「对话」往往不是 1 次 API 调用，而是 5-20 次模型调用串起来（因为每次工具结果回来都要让模型再看一眼）。

### 一个 turn 的伪代码展开

把 9 步展开成伪代码，更直观地看到回环点：

```python
def run_conversation(user_message, system_message=None, history=None, task_id=None):
    # 第 1 步
    task_id = task_id or generate_task_id()

    # 第 2 步
    conversation.append({"role": "user", "content": user_message})

    while True:  # 整个 turn 内可能多轮 API 调用
        # 第 3 步
        system_prompt = build_or_cache_system_prompt(system_message)

        # 第 4 步：预检压缩
        if context_usage(conversation) > 0.5:
            conversation = compress_middle_turns(
                conversation,
                protect_last_n=20,
                keep_tool_pairs_together=True,
            )
            # 压缩会生成新 lineage_id（child session）

        # 第 5 步：根据 API mode 转消息格式
        api_messages = convert_to_api_format(conversation, api_mode)

        # 第 6 步：注入易变层（不进 cache）
        api_messages = inject_ephemeral_layers(
            api_messages,
            budget_warning=check_budget(iteration_count),
            context_pressure=context_usage(conversation),
        )

        # 第 7 步：Anthropic 专有 cache 标记
        if api_mode == "anthropic_messages":
            api_messages = apply_cache_breakpoints(api_messages)

        # 第 8 步：可中断调用
        response = _interruptible_api_call(
            api_messages,
            on_interrupt=lambda: handle_user_interruption(),
        )

        # 第 9 步：解析
        if response.tool_calls:
            results = execute_tools(response.tool_calls)  # 可能并发
            conversation.append(response.assistant_msg)    # tool_calls 在这里
            conversation.extend(results)                   # 多个 tool 消息
            # 回环：while True 下一轮，conversation 多了 assistant+tool
            continue
        else:
            # 文本回复 → 收尾
            persist_session(conversation, sqlite_db)
            flush_memory_if_dirty()
            return {"final_response": response.text, "messages": conversation}
```

几个细节从这个伪代码里看得出：

- `while True` 没有显式 turn 计数器，但被 `IterationBudget`（默认 90）守护，超了强制返回总结
- 压缩发生在**轮间**，不是 turn 间。一次 turn 内如果第 5 轮 API 调用前 context 超 50%，会触发压缩
- tool 消息可以连续多条（前述「严格交替」规则中 `tool` 角色是唯一例外）
- `_interruptible_api_call` 被打断时**不**把半成品塞进 conversation，这是防止脏数据的关键

### 消息格式：严格角色交替

模型 API 对消息序列有硬性要求，Hermes 强制执行：

```
system → user → assistant → user → assistant → ...
                          或
system → user → assistant(tool_calls) → tool → tool → ... → assistant
```

四条铁律（违反会被 provider 拒）：

- system 之后，user / assistant 必须严格交替
- **绝对不连续两个 assistant 消息**
- **绝对不连续两个 user 消息**
- 只有 `tool` 角色可以连续出现（并行工具结果）

理解这条，你就理解了为什么「执行 5 个工具再让模型总结」中间一定要塞 `tool` 角色消息。

### 单工具 vs 多工具：并发规则

模型一次返回多个 tool_calls 时：

- **单个 tool_call** → 主线程直接执行
- **多个 tool_call** → `ThreadPoolExecutor` 并发执行
  - 例外：标了 interactive（比如 `clarify`）的工具强制串行
  - 结果按**原始 tool_call 顺序**回填，不管谁先完成

这意味着 Hermes 默认是「乐观并发」，遇到需要用户输入的工具才退化为串行。

### 可中断的 API 调用

`_interruptible_api_call()` 是个值得单独提的设计。HTTP 调用在后台线程跑，主线程同时盯着三个事件：

```
┌───────────────────────────────────────────────┐
│  主线程                     API 线程          │
│                                               │
│  等：                        发 HTTP POST     │
│   - response ready  ◀────   给 provider      │
│   - interrupt event          （流式或一次性） │
│   - timeout                                   │
└───────────────────────────────────────────────┘
```

被打断的几种触发：用户发了新消息、`/stop` 命令、信号。打断时**不把半成品塞进 conversation history**，这是关键设计，避免脏数据污染上下文。

### Agent 级工具：被 loop 拦截，不走 registry

有四个工具在到达 `handle_function_call()` 之前被 `run_agent.py` 直接拦下：

| 工具 | 为什么拦截 |
| --- | --- |
| `todo` | 读写 agent 局部任务状态 |
| `memory` | 写持久化记忆文件（带字符上限） |
| `session_search` | 查 agent 自己的 session DB |
| `delegate_task` | 起 subagent（隔离上下文） |

它们直接改 agent 内部状态，返回合成的 tool 结果，不经过 `tools/registry.py`。这是个重要的设计信号：**最核心的「自我操作」不走通用工具链路，而是直接 hook 在 loop 上**。

### 预算和 fallback

- **iteration 预算**：默认 90 turn（`agent.max_turns`）。每个 agent 独立预算，subagent 单独算（上限 `delegation.max_iterations` 默认 50）。父+子加起来可以超过父的上限，这点反直觉。
- **fallback provider**：主 provider 失败（429 限流、5xx、401/403 鉴权）时，按 `config.yaml` 里 `fallback_providers` 列表挨个试。401/403 会先试一次 credential refresh。辅助任务（视觉、压缩、网页抽取）有自己独立的 fallback 链。

## 2. skills：程序性记忆（「怎么做某类事」）

### 职责

skill 是 Markdown 文件，存「上一次怎么解决一类问题的」。模型决定「这次要不要套用某个 skill」，命中就把全文按需加载进上下文。

存储位置 `~/.hermes/skills/`，目录结构：

```
~/.hermes/skills/
├── mlops/
│   ├── axolotl/
│   │   ├── SKILL.md          # 主指令（必需）
│   │   ├── references/       # 补充文档
│   │   ├── templates/        # 输出格式模板
│   │   ├── scripts/          # 可调用脚本
│   │   └── assets/           # 附件
│   └── vllm/
│       └── SKILL.md
├── devops/
│   └── deploy-k8s/           # agent 自己创建的 skill
│       ├── SKILL.md
│       └── references/
├── .hub/                     # Skills Hub 状态
│   ├── lock.json
│   ├── quarantine/
│   └── audit.log
└── .bundled_manifest         # 跟踪内置 skill
```

格式遵循 [agentskills.io](https://agentskills.io/) 开放标准，跨兼容 agent 可移植。

### 渐进式披露：为什么 skill 多了 token 不爆炸

这是 skill 系统最容易被看错的点。**默认 system prompt 里只放 skill 的名字 + 一行 description**，全文不进。只有模型判定「这个 skill 跟当前任务相关」时，全文才被加载进来。

直接后果：

> 一个装了 200 个 skill 的 agent，上下文成本跟装 40 个的差不多，因为详细内容只在被命中时才进。

这跟「把所有文档一股脑塞向量库检索」是两条路。Hermes 走的是「**让模型自己决定要不要 fetch**」，不是「embedding top-k 自动塞」。

### skill 的 6 个动作

通过 `skill_manage` 工具：

- `create` / `patch` / `edit` / `delete` / `write_file` / `remove_file`

**默认走 `patch` 而不是 `edit`**，只传变更片段（old string + new string），不重写全文。这是个刻意的取舍：

- 正确性：全文重写容易弄坏原本能跑的部分
- 效率：patch 的 token 开销远小于 edit

### 触发写 skill 的条件

不是每次任务都写。触发条件之一满足才写：

- **≥ 5 次工具调用**（说明任务有复杂度）
- **从错误中恢复**（说明有可学习的纠错路径）
- **用户纠正过**（说明原方案需要修正）
- **非显然的工作流跑通了**（说明有可沉淀的经验）

第 5、9 篇详拆这套机制。

### Curator：后台图书管理员

`Curator` 是个后台进程（不是 agent loop 的一部分），周期性（默认每周）扫 skill 库：

- 跟踪每个 skill 的「被查看 / 被使用 / 被 patch」次数
- 状态机：`active → stale → archived`
- 发现近似重复时，起一个辅助模型（auxiliary model）评审，提议合并
- **绝不自动删**，最坏结果是归档到可恢复目录
- **不碰 bundled 和 hub 安装的 skill**，只管 agent 自己写的
- 用户可以 `pin` 关键 skill，防止被归档

这是 procedural memory 的治理层。没有它，skill 库会随着使用堆积几十个窄场景近似副本，污染检索。第 9 篇详讲。

### self-congratulation 问题（必须知道的真实坑）

Level Up Coding 那篇 [The two loops of Hermes Agent](https://levelup.gitconnected.com/the-two-loops-of-hermes-agent-33922ba8d154) 把这个讲透了：

> 「agent 给自己打分几乎每次都觉得做得不错，即使并没有。同一个产出 skill 的机制，也会用更差的版本覆盖你手写的 customization。」

这是结构性缺陷，不是 bug：**评估者和执行者是同一种模型，共享同一套偏见**。Nous 自己也知道，所以另起了一个仓库 `hermes-agent-self-evolution`（不在主运行时里）：

- 离线运行
- 读执行 trace（不是 agent 的自我报告）
- 跑 [GEPA](https://arxiv.org/abs/2411.02993)（Genetic-Pareto Prompt Evolution）做进化搜索
- 提议改动，**人类 review**

把 GEPA 放主 runtime 外是个**架构性表态**：runtime 内的 loop 无法给自己打分，因为打分者跟执行者共享先验。社区有人因此说「Hermes 的 closed loop 其实是 open loop，只是换了个名字」。

实操影响：**别指望 skill 自动进化是靠谱的**。重要的 skill 你得 `pin` 起来，或者定期人工审一遍 `~/.hermes/skills/`。

## 3. memory：情节 + 语义记忆（「之前发生过什么 + 你是谁」）

四层架构，**每层存在不同地方、读取时机也不同**。把它们当「一个东西」是初学者最大的误解。

### 第 1 层：MEMORY.md（事实 / 偏好 / 经验教训）

- 位置：`~/.hermes/memories/MEMORY.md`
- **always-on**：每个 session 开头自动注入 system prompt，不需要模型主动 fetch
- 写法：通过 `memory` 工具的 `add` / `replace` / `remove` 操作
- 字符上限：和 USER.md 加起来 **3575 字符**硬上限（刻意的紧，倒逼精选）
- **关键细节**：session 内改的 MEMORY.md **下一次 session 才生效**，当前会话不变

### 第 2 层：USER.md（用户画像）

- 位置：`~/.hermes/memories/USER.md`
- 同样 always-on，同样吃 3575 字符配额
- 存「你是谁」：角色、沟通风格、领域、长期偏好

### 第 3 层：session archive（情节记忆）

- 位置：SQLite（`hermes_state.py` 管理），FTS5 全文索引
- **on-demand**：模型主动调 `session_search` 工具时才查
- 不是直接把老 session 塞回上下文，是 FTS5 查 → 命中片段 → LLM 摘要 → 注入

边界很清晰：

> **永久重要 → 进 MEMORY.md / USER.md**
> **只在特定话题重现时有用 → 留在 session archive**

periodic nudge 时模型自己判断一条信息该进哪一层，不默认全塞一个地方。

### 第 4 层：Honcho（被动用户建模，可选）

- 跨 session **被动**积累：偏好、沟通风格、领域知识随时间漂移
- dialectic modeling：同时建模「你」和「agent 跟你的关系」，12 个 identity layer
- **可选**，不是默认开

什么时候值得开 Honcho 的开销？**当你把 Hermes 当日常个人助理用、希望回答贴合你的工作方式时**。如果是任务型或自动化场景，前三层够了。第 12 篇详讲 Honcho。

### 为什么这么分

社区博客（[mranand 的拆解](https://mranand.substack.com/p/inside-hermes-agent-how-a-self-improving)）把这点讲得很直白：

> 「把所有东西塞一个 memory store，是大多数 agent memory 系统随着时间变得不可靠的原因。」

四层分开是为了回答不同的问题：「**我是谁**」（USER.md）、「**我相信什么**」（MEMORY.md）、「**之前发生过什么**」（session archive）、「**这个用户在怎么变化**」（Honcho）。混在一起的代价是检索信号噪声比崩塌。

## 3.6 上下文压缩：50% / 85% 两档阈值

压缩是个被严重低估的子系统。`agent/context_compressor.py` 是默认引擎（`agent/context_engine.py` 是 ABC，可以插件化替换）。它干的事不是「丢老的」，是「**摘要中间的，保护最近的，配对的不拆**」。

### 两档阈值

- **50%**（preflight）：API 调用前检查，context 已用超 50% 时触发。`AIAgent` 内部走。
- **85%**（gateway auto-compression）：更激进，**只在 gateway 场景**触发，**轮间**跑（不在 turn 内）。gateway 比 CLI 更激进是因为 gateway 可能无人值守，长会话风险更高。

### 压缩算法做的事

```
压缩前 conversation:
  [system]
  [user 1] [assistant 1]              ← 老的中间轮
  [user 2] [assistant 2 + tool_calls] ← 老的中间轮
  [tool] [tool] [assistant 3]         ← 老的中间轮
  ...
  [user N-20] ... [assistant N]       ← 最近 20 条（保护）
  [user N+1]                          ← 当前

压缩后 conversation:
  [system]
  [summary_block: N-21 轮被摘要]      ← 新增的摘要消息
  [user N-20] ... [assistant N]       ← 最近 20 条（原样保留）
  [user N+1]                          ← 当前

副产物：
  - 新 lineage_id（child session，可追溯到原 session）
  - tool_calls + tool 配对不被拆开（防孤儿）
```

几个反直觉的点：

**① 不是丢，是摘要**。中间轮不直接删除，是起一个 auxiliary model（auxiliary_client.py）扫一遍，提取「值得保留的事实 / 决策 / 用户偏好」，写到 3575 字符以内的摘要块里。

**② memory 先 flush 再压缩**。压缩前先把脏 memory 写盘（防止压缩过程丢数据）。

**③ 最近 N 条永远原样保留**（默认 N=20）。因为最近的轮次是模型当前推理的「工作记忆」，动它会让模型迷失。

**④ tool_calls 和 tool 结果不拆开**。如果一条 `assistant(tool_calls)` 被摘要了但对应 `tool` 消息没摘要，模型会看到一个「调了工具但没结果」的破损历史。压缩算法保证配对原子性。

**⑤ lineage 链留在 SQLite**。压缩生成的 child session 通过 lineage 表关联到 parent。需要时 agent 可以 trace 回原始内容（通过 `session_search` 检索 parent session）。

### 替换压缩引擎

`ContextEngine` 是 ABC（抽象基类）。`context_compressor.py` 是默认实现（lossy summarization）。你可以写一个插件替换它（比如用纯向量检索、或用更激进的丢弃策略）。通过 `plugins/context_engine/` 注册。一次只能激活一个 context engine，这是刻意的单选约束，避免多个引擎打架。



`prompt_builder.py` 是个被低估的文件。它的工作不是「拼一个 system prompt 字符串」，是**按层拼一个有缓存语义的 prompt**。这个设计直接决定了 token 成本和延迟。

### 三层结构

```
┌─────────────────────────────────────────────┐  ← stable tier（缓存前缀）
│  identity / 人格（SOUL.md）                  │
│  tool guidance（工具使用规则）               │
│  skill 名字 + 一行 description（渐进披露）  │
│  context files（AGENTS.md 等工作区指令）     │
├─────────────────────────────────────────────┤  ← context tier（缓存前缀）
│  MEMORY.md（事实/偏好）                      │
│  USER.md（用户画像）                         │
├─────────────────────────────────────────────┤  ← volatile tier（不缓存）
│  当前时间戳                                  │
│  预算警告（"已用 73/90 turn"）               │
│  context 压力提示（"已用 65% context"）      │
│  当前任务 ID                                 │
└─────────────────────────────────────────────┘
```

为什么这么分？因为大多数 API provider（特别是 Anthropic）支持 prompt caching：**前缀稳定就命中缓存，前缀变化就全部重算**。

设计原则用一句话说清楚：

> **stable 永远不变（除非用户显式切模型 / 改 memory / 改 context file），volatile 每个 turn 都可能变。volatile 不进缓存前缀。**

这就解释了几个反直觉的行为：

- **MEMORY.md 改了，当前 session 不生效**：因为改 memory 破坏了 stable 前缀，要下个 session 重建 prompt 时才用新内容。Hermes 不在 session 中途重写 system prompt。
- **「当前时间」这种看似无害的字段被放 volatile**：因为它每个 turn 都变，进缓存前缀会让缓存永远不命中。
- **切模型会触发全量重处理**：换 provider 通常意味着不同的 prompt template，cache 直接失效。生产环境换模型是个昂贵的动作。

第 4 篇详讲 `SOUL.md`、`AGENTS.md` 等 context files 怎么写、放在哪一层。

### Anthropic prompt caching

`agent/prompt_caching.py` 负责在 Anthropic API 调用上加 cache breakpoints。它做两件事：

1. 在 stable / context tier 之间加 cache breakpoint（前缀长这样）
2. 收集 cache hit / miss 指标，反馈给预算系统

直接后果：在 Anthropic 上跑 Hermes，长会话第 2 轮开始 system prompt 部分几乎全命中 cache，输入 token 成本能降到原来的 1/10。这是为什么「Hermes 在 Anthropic 上跑长会话比 OpenAI 便宜」的真实原因：不是模型定价差，是 cache 命中率差。

## 4. tools：工具箱（70+ 内置，28 个 toolset）

### 注册机制

每个 `tools/*.py` 文件在 import 时调 `registry.register()`，自动被发现。**不需要手动维护 import list**：只要文件放在那里、有顶层 register 调用，就会被发现。

依赖链：

```
tools/registry.py  （无依赖，被所有工具文件 import）
       ↑
tools/*.py  （import 时各自 register）
       ↑
model_tools.py  （import registry + 触发 tool 发现）
       ↑
run_agent.py / cli.py / batch_runner.py / environments/
```

### 工具分 5 大类

| 类别 | 干啥的 | 例子 |
| --- | --- | --- |
| 执行类 | 终端命令、代码运行 | terminal、execute_code |
| Web 类 | 搜索、浏览器自动化 | web_search、browser_tool |
| 媒体类 | 视觉、图像生成、TTS | vision、image_gen |
| 协作类 | subagent 委派、多模型推理 | delegate_task |
| 记忆/规划 | 改自己的记忆层 | memory、todo |

### 危险命令审批

`tools/approval.py` 检测危险命令。命中后触发 `approval_callback`，等用户确认。gateway 场景下走交互式消息。第 20 篇详讲安全边界。

### MCP 外接

MCP（Model Context Protocol）客户端在 `tools/mcp_tool.py`（大文件），支持动态注册外部 MCP server 暴露的工具。这是「不 fork 代码也能加工具」的主要扩展点之一。第 17 篇详讲。

## 5. gateway：多平台入口

### 职责

gateway 是个长跑进程（`hermes gateway` 启动），20 个平台适配器。**不只是消息转发**，它干五件事：

1. **messaging**：收发消息（每个平台一个 adapter，`gateway/platforms/*`）
2. **session routing**：消息路由到正确的 session（按 session_id，不按平台）
3. **delivery**：出站消息投递
4. **pairing**：新平台和 agent 实例配对（DM 配对授权）
5. **cron ticking**：定时任务触发

### 平台适配器（20 个）

```
telegram / discord / slack / whatsapp / signal / matrix / mattermost /
email / sms / dingtalk / feishu / wecom / wecom_callback / weixin /
bluebubbles / qqbot / homeassistant / webhook / api_server / yuanbao
```

### session 跨平台

这是 gateway 最重要的设计：

> **session 绑 session_id，不绑平台。**

Telegram 上开的会话，可以在 CLI 里继续，因为 session_id 相同。session 路由是「**关联到一个 ID 而不是一个平台**」。

Telegram 还有「Project Conversations」特性：在一个 chat 内开多个 Topic，每个 Topic 独立 skill 绑定 + 独立 session context。

### gateway 数据流

```
平台事件 → Adapter.on_message() → MessageEvent
  → GatewayRunner._handle_message()
    → authorize user
    → resolve session key
    → 创建 AIAgent（带 session history）
    → AIAgent.run_conversation()
    → 把回复通过 adapter 投递回去
```

第 13、14 篇详讲（包括微信桥接）。

### gateway vs OpenClaw 的差别

OpenClaw 里 gateway 只管投递，skill 创建、memory 写入、定时任务输出走完全独立的机制。

Hermes 里 gateway 是同一个 loop 的一部分：消息进来能触发 skill 创建，定时任务输出也走同一个 gateway 层。**跨平台连续性是 session routing 焊死在系统里，不是外挂**。

## 6. terminal backend：执行环境（可插拔）

### 6 个 backend

| backend | 适合场景 | 特性 |
| --- | --- | --- |
| **local** | 个人开发，不要求隔离 | 直接动本机文件 |
| **Docker** | 要沙箱、不动主机 | 只读 rootfs、降权、namespace 隔离（架构默认） |
| **SSH** | 工作在远程服务器 | 文件/DB/服务都在那 |
| **Singularity** | HPC / 研究环境，Docker 不可用 | 集群场景 |
| **Modal** | serverless，成本敏感 | 空闲休眠、按需启动 |
| **Daytona** | serverless，要持久环境 | 同上，但环境状态可保 |

### 抽象层

backend 是统一接口（`tools/environments/`），同样一条 `terminal` 工具调用，落到哪个 backend 是配置决定的。这就是为什么工具代码不需要为每种环境写一份。

具体怎么配置：

```yaml
# ~/.hermes/config.yaml 片段
terminal:
  backend: docker              # 或 local / ssh / modal / daytona / singularity
  default_timeout: 120         # 秒

  docker:
    image: hermes-agent:latest
    read_only_root: true       # 架构默认，不建议关
    drop_capabilities: true    # 架构默认
    work_dir: /workspace

  ssh:
    host: prod-server.example.com
    user: deploy
    key_path: ~/.ssh/deploy_key
    work_dir: /home/deploy/agent-workspace

  modal:
    function_name: hermes-terminal
    keep_warm_seconds: 300     # 空闲多久后休眠

  daytona:
    workspace_id: ws-xxxx
    persistent: true           # 环境状态在休眠后保留
```

切 backend 不需要改 agent 代码、不需要改 skill、不需要改 prompt。所有差异被 environments 抽象层吃掉了。

### 一个真实的 trace：同样一条命令在 4 个 backend 上的差别

「读取 `/etc/os-release` 看操作系统版本」这条命令：

| backend | 实际行为 | 隔离 | 状态 |
| --- | --- | --- | --- |
| local | 直接 `cat /etc/os-release` 读主机文件 | 无 | 立即返回 |
| docker | 在容器内 `cat`，看到的是镜像的 OS 版本，**不是主机的** | 强 | 立即返回 |
| ssh | SSH 到远端，在远端执行，看到的是远端 OS | 完全隔离 | 网络延迟 ×2 |
| modal | 启动 serverless container（可能冷启动 5-30 秒）→ 在内执行 → 释放 | 强 | 冷启动慢 |

这个 trace 揭示一个常被忽略的事：**backend 不是「换个地方执行」这么简单，它决定了 agent 看到的世界**。在 docker backend 跑 `apt install` 装的包，主机上不存在。在 modal backend 写的临时文件，函数结束后可能消失。

第 19 篇详讲每个 backend 的成本模型和坑。

### serverless 的坑

**Modal 和 Daytona 空闲会休眠，环境重置**：如果你依赖某个文件持续存在（比如 cache、临时数据库），休眠后可能丢。第 19 篇详讲怎么选 backend 和怎么算成本。

### Docker 的安全默认

跑 Docker backend 时，Hermes 默认开：

- 只读根文件系统
- 降 Linux capabilities
- namespace 隔离

这些**不是可选项，是架构默认**。agent 不能写到指定目录之外，不能提权。零遥测也是同样性质：不出机是设计属性，不是隐私开关。

## 一次对话的内部流程（端到端走一遍）

把六块串起来。例子：你从 Telegram 发「**把上周的会议纪要整理成飞书表格**」。

```
时序图：

你 (TG)           gateway            AIAgent            skills/memory       backend
 │                  │                   │                    │                 │
 │── "整理纪要" ──▶│                   │                    │                 │
 │                  │                   │                    │                 │
 │                  │  ① authorize      │                    │                 │
 │                  │  ② resolve        │                    │                 │
 │                  │     session_id    │                    │                 │
 │                  │── create AIAgent ─▶│                    │                 │
 │                  │   + history ─────▶│                    │                 │
 │                  │                   │                    │                 │
 │                  │              [turn 1 开始]              │                 │
 │                  │                   │ ③ build prompt ◀───│                 │
 │                  │                   │   (skill 名字+摘要) │                 │
 │                  │                   │   (MEMORY.md/USER) │                 │
 │                  │                   │ ④ preflight comp.  │                 │
 │                  │                   │   (<50% 不压缩)    │                 │
 │                  │                   │ ⑤ 转 API 消息      │                 │
 │                  │                   │ ⑥ 注入临时层        │                 │
 │                  │                   │ ⑦ cache 标记        │                 │
 │                  │                   │ ⑧ API 调用 ────────┼─────────────────┼─▶
 │                  │                   │ ⑨ 解析：要调工具   │                 │
 │                  │                   │   - read_file ───────────────────────▶│
 │                  │                   │   ◀────────────── (文件内容)          │
 │                  │                   │   回到 ⑤                                  │
 │                  │                   │                                          │
 │                  │              [turn 2/3/4...]                              │
 │                  │                   │   - web_search                        ▶│
 │                  │                   │   - feishu API                        ▶│
 │                  │                   │   ...                                  │
 │                  │                   │                                          │
 │                  │              [最终 turn]                                 │
 │                  │                   │ ⑨' 文本回复 + 持久化                  │
 │                  │                   │   - 写 SQLite                         │
 │                  │                   │   - flush memory                      │
 │                  │                   │                                          │
 │                  │                   │   [周期性 nudge / 任务完成钩子]        │
 │                  │                   │   - 评估要不要写 skill                │
 │                  │                   │   - 评估要不要更新 MEMORY.md          │
 │                  │                   │                    │                 │
 │                  │◀── 投递回复 ──────│                    │                 │
 │◀── "整理好了" ──│                   │                    │                 │
```

### 编号步骤详解

1. **gateway 收消息**：TG adapter 的 `on_message()` 把文本包成 `MessageEvent`，调 `GatewayRunner._handle_message()`。
2. **授权 + session 解析**：检查 user 在 allowlist 或完成 DM 配对；按 `user_id + platform` 解析出 `session_id`，必要时新建。
3. **构建 system prompt**：`prompt_builder.py` 把「identity / tool guidance / skill 名字+摘要 / context files / MEMORY.md / USER.md / 时间戳」按层拼起来。**system prompt 在一个 session 内不变**（这是 prompt cache 能命中的前提）。
4. **预检压缩**：context 已用 < 50% 跳过；> 50% 时 auxiliary model 先扫一遍，把中间几轮摘要成块、保护最近 N 条（默认 20）+ tool 配对不拆 + 生成新 lineage ID。
5. **转 API 消息**：根据 provider 选的 API mode（chat / codex / anthropic）转格式。
6. **注入临时层**：预算警告、context 压力提示等易变信息，**这一层不进缓存**。
7. **加 cache 标记**（仅 Anthropic）。
8. **可中断 API 调用**：后台线程发 HTTP，主线程盯 interrupt event。
9. **解析响应**：
   - **tool_calls** → 走 `model_tools.handle_function_call()` → 查 registry → 跑 pre_tool_call hook → 检查危险命令 → 执行 → post_tool_call hook → append tool 消息 → **回到第 5 步**
   - **文本回复** → 持久化 session → flush memory → 返回

### 真实 trace：对话内部到底跑了多少次模型调用

拿前面「整理会议纪要成飞书表格」的例子展开，看模型到底被调了几次。下面是个**典型 trace**（实际数字会变，但结构稳定）：

```
turn 内的模型调用序列（简化）：

API call #1:  模型看 system prompt + 用户消息
              → 返回 tool_calls: [read_file("meetings/2026-06-28.md")]
              → 执行，返回文件内容
              → 回环

API call #2:  模型看历史 + 文件内容
              → 返回 tool_calls: [read_file("meetings/2026-07-04.md")]
              → 执行
              → 回环

API call #3:  模型看两个会议纪要
              → 返回 tool_calls: [web_search("飞书表格 API 文档")]  // 不确定字段名
              → 执行
              → 回环

API call #4:  模型有了 API 文档
              → 返回 tool_calls: [terminal("python build_table.py")]  // 生成表格
              → 执行
              → 回环

API call #5:  模型看脚本输出
              → 返回 tool_calls: [web_extract("https://open.feishu.cn/...")]  // 调飞书 API
              → 执行
              → 回环

API call #6:  模型确认成功
              → 返回纯文本：「已整理好，飞书表格链接：...」
              → 持久化 session
              → 触发任务完成钩子（满足 ≥5 工具调用条件）
              → 异步触发 skill 评估

[后台异步]
  - periodic nudge：模型收到 system prompt，评估最近活动
                  → 决定写一条 memory："用户偏好表格列：日期、参会人、决策、行动项"
  - skill 评估：模型生成新 skill `meetings-to-feishu-table.md`
              → 写到 ~/.hermes/skills/productivity/meetings-to-feishu-table/SKILL.md
```

几个关键的工程量数字：

- **6 次 API 调用**完成一次「用户感知到一次问答」的对话
- **token 消耗**远大于「用户消息 + 最终回复」的字数：每次工具结果都让模型重读了整个上下文
- **延迟**是 6 次 API 调用 + 工具执行时间的总和，**不是 1 次**
- **副作用发生在主对话回路之外**：用户拿到回复时，memory 和 skill 可能还没写完（异步）

这就是为什么 iteration budget 默认 90：复杂任务可能真要 30-50 次 API 调用，留余量给回退和重试。

### 为什么这次对话触发了 skill 写入

回看触发条件：

- ✅ ≥ 5 次工具调用（实际 5 次）
- ✅ 非显然工作流（读多文件 → 搜索 API → 生成脚本 → 调外部 API）

满足两条，触发 skill 评估。下次你说「把上周的 standup 整理成 Notion 表格」，模型可能直接命中这个 skill，少走 4 次 API 弯路，这是 self-improving 的实际收益。

但要注意：**这次写出来的 skill 质量不一定好**。模型可能写得太特化（只认飞书），或太宽泛（任何表格都用同一套字段）。这是 self-congratulation 问题的具体表现：agent 觉得自己做得不错就写了，但实际质量需要时间或外部 review 才能验证。

### 三个容易看错的点

**① 「一次对话」≠ 一次 API 调用**。中间可能是 5-20 次模型调用串起来（每次工具结果回来都让模型再看一眼）。理解这点你才理解为什么 iteration budget 默认 90。

**② system prompt 不变是刻意的**。中途改 system prompt 会破坏 cache。所以 Hermes 把易变信息（预算警告、context 压力）放到第 6 步注入的**临时层**，不污染缓存前缀。

**③ session_search 不是每次都查**。它是 on-demand 工具，模型判断「需要过去上下文」时才主动调。MEMORY.md / USER.md 才是 always-on。

### 副作用（最容易漏掉的部分）

主对话回路之外，三件事可能在后台发生：

- **周期性 nudge**：session 进行中，每隔一段时间模型收到一个 system-level prompt，问它「最近发生的有没有值得 persist 的」。模型自己决定写不写、写哪层。
- **任务完成钩子**：满足写 skill 触发条件时（≥5 工具调用、错误恢复、用户纠正、非显然工作流），写新 skill 或 patch 已有 skill。
- **Curator 周循环**：后台扫 skill 库，归档/合并。

**这三件事都是后台发生的，你不主动看日志可能完全不知道 agent 记了什么**。第 9、11 篇讲怎么观察和干预。

## 关键设计决策（为什么这么取舍）

这一节回答几个「为什么不是另一种做法」的问题，这些是面试级别的问题，理解了你就真的懂 Hermes 了。

### 决策 1：为什么 skill 是 Markdown，不是代码 / 向量库

三个理由：

- **可审计**：Markdown 是文本，你可以 `cat` 看、可以用 git 跟踪、可以 diff。skill 库不是一个黑盒 embedding，是一个**目录树**，你能 `ls`。
- **可手改**：agent 写得不好你可以直接打开 Neovim 改。这个「人机协作」的接口在向量库里做不到。
- **prompt-friendly**：LLM 读 Markdown 比读代码或 JSON 自然得多。skill 直接进上下文就能用，不需要额外的「解释层」。

代价是：**skill 是声明式的，不能保证执行严格**。agent 可能跳过某一步，也可能在错的情况下硬套。这是「可读」和「可靠」之间的取舍。

### 决策 2：为什么 memory 分四层，不一个向量库解决

「全塞一个向量库」是社区最常见的初学者方案。Hermes 不这么做，因为：

- **always-on vs on-demand 必须分开**。MEMORY.md 这种每个 session 都要的，不能跟「特定话题才查」的混在一起，混了就是每次都查一堆没用的，token 浪费。
- **永久 vs 临时必须分开**。session archive 是流水账，MEMORY.md 是精选笔记。混在一起，重要的事被噪声淹没。
- **主动写 vs 被动积累必须分开**。MEMORY.md 是模型主动写的，Honcho 是被动从行为里推断的。信号源不同，不能混。

代价是：**四层配置心智负担重**。新手容易在错的地方写错东西（比如把临时偏好塞 USER.md）。第 11 篇详讲怎么治。

### 决策 3：为什么 backend 可插拔

**因为工作在哪就在哪执行**。让 SSH 上的远程文件先拉回本地、跑完再推回去是疯狂的开销。让 Hermes 直接在 SSH 上跑，是更自然的选择。

可插拔的抽象让「同一个 agent」覆盖五种部署上下文：个人开发（local）、隔离（Docker）、远程运维（SSH）、HPC（Singularity）、serverless（Modal/Daytona）。

代价是：**backend 选择影响能力，但抽象层藏住了差异**。比如 serverless 休眠后状态丢失，这点不读文档你不会知道。第 19 篇详讲。

### 决策 4：为什么把 gateway 焊进 loop，不做成独立服务

OpenClaw 把 gateway 做成独立服务，Hermes 把它焊进同一个 loop。后者好处是：

- 跨平台 session 连续性是**架构级保证**，不是 bolt-on。
- 定时任务输出能直接走 gateway，不需要第二个机制。
- skill 创建可以由消息触发，链路短。

代价是：**gateway 是个长跑进程，运维负担在用户这边**。你要管进程、管 PID、管重启。

### 决策 5：为什么 GEPA 在主 runtime 外

如前述：**评估者和执行者不能是同一个先验**。这是最被低估的设计决策。`hermes-agent-self-evolution` 这个仓库的存在本身，就是 Nous 团队承认「runtime 内的 learning loop 不能闭环」。

### 决策 6：为什么用 SQLite + FTS5，不用向量库

memory 和 session 持久化用 SQLite + FTS5 全文检索，不用 PostgreSQL，不用 Pinecone/Weaviate 这类向量库。理由：

- **零依赖部署**：SQLite 是个文件（`~/.hermes/sessions.db`），不需要起数据库 server。这对「个人助手」的部署场景是关键。
- **WAL 模式支持并发读**：多 session 并行时，WAL（Write-Ahead Log）允许多读单写，足够 Hermes 的并发量。
- **FTS5 满足需求**：session_search 不需要语义相似度，需要的是「**这个关键词在哪些 session 出现过**」。FTS5 干这件事比向量库准、快、便宜。
- **lineage 链需要关系型查询**：parent / child session 关系用 SQL 表达自然，用向量库别扭。

代价是：**没有语义检索**。「我想找那次讨论 React hooks 的对话」这种语义查询，FTS5 必须命中「React」「hooks」字面词才行。如果想要语义检索，得装 Honcho 或自己写 memory provider 插件。

### 决策 7：为什么 AIAgent 是单类大文件

`run_agent.py` 是个公认的大文件（社区反复吐槽）。为什么不拆？因为 `AIAgent` 类的职责（prompt 组装 / API 调用 / 工具执行 / 重试 / 回退 / 压缩 / 持久化）高度耦合，拆成多个小类反而引入更多状态同步开销。这是个**刻意的复杂度集中**：

- 入口简单：所有平台（CLI / gateway / ACP / cron）只认一个 `AIAgent` 类
- 内部复杂度集中：状态机都在一个文件里，便于推理
- 测试集中：相关行为在一个类里，集成测试好写

代价是：**新人读源码会被 `run_agent.py` 吓到**。Hermes 团队的取舍是「读源码的痛苦 < 状态分散的痛苦」。

### 决策 8：为什么 callback 而不是事件总线

`AIAgent` 通过一组 callback（`tool_progress_callback`、`thinking_callback`、`reasoning_callback` 等）向平台暴露进度。不是事件总线、不是消息队列。

| callback | 触发时机 | 谁用 |
| --- | --- | --- |
| `tool_progress_callback` | 工具执行前后 | CLI spinner、gateway 进度消息 |
| `thinking_callback` | 模型开始/结束思考 | CLI「thinking...」指示器 |
| `reasoning_callback` | 模型返回 reasoning 内容 | CLI reasoning 显示、gateway reasoning 块 |
| `clarify_callback` | `clarify` 工具被调 | CLI 输入提示、gateway 交互式消息 |
| `step_callback` | 每个 turn 结束 | gateway 步骤跟踪、ACP 进度 |
| `stream_delta_callback` | 每个 stream token | CLI 流式显示 |

理由：**callback 是同步的，事件总线是异步的**。同步意味着 callback 阻塞 agent loop，平台可以可靠地知道「工具执行前 agent 一定在等」。异步事件总线会引入时序问题（消息被消费前 agent 已经走下一步了），对需要交互的场景（`clarify`）是灾难。

代价是：**callback 不能做重活**。你想在 callback 里写日志、发通知，必须 fire-and-forget，不能阻塞。否则整个 agent loop 卡住。

## 目录结构导览：拿到源码先看哪里

官方文档给了一份完整的目录树（[Architecture 页面](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)），但太长容易迷失。下面是**最小阅读路径**：如果你只有 30 分钟读源码，按这个顺序看：

```
hermes-agent/
├── run_agent.py          ← ① 第 1 站：AIAgent 类，agent loop 核心
│                           看 run_conversation()、_interruptible_api_call()、
│                           handle_function_call()。这是大脑。
├── agent/
│   ├── prompt_builder.py ← ② 第 2 站：system prompt 怎么分层拼
│   ├── context_compressor.py  ← 第 3 站：50% 阈值的压缩算法
│   ├── prompt_caching.py      ← Anthropic cache 标记
│   ├── auxiliary_client.py    ← 辅助模型（视觉/摘要）客户端
│   ├── memory_manager.py      ← memory 编排
│   └── memory_provider.py     ← memory provider ABC（可替换）
├── hermes_state.py       ← ③ 第 4 站：SQLite + FTS5 schema、session lineage
├── model_tools.py        ← ④ 第 5 站：工具 dispatch，handle_function_call()
│
├── tools/
│   ├── registry.py       ← ⑤ 第 6 站：工具注册中心（先看这个）
│   ├── approval.py       ← 危险命令检测
│   ├── terminal_tool.py  ← terminal 工具编排
│   ├── file_tools.py     ← read_file / write_file / patch / search_files
│   ├── web_tools.py      ← web_search / web_extract
│   ├── browser_tool.py   ← 浏览器自动化
│   ├── delegate_tool.py  ← 子 agent 委派
│   ├── mcp_tool.py       ← MCP 客户端（大文件）
│   └── environments/     ← ⑥ 第 7 站：6 个 terminal backend
│
├── gateway/
│   ├── run.py            ← ⑦ 第 8 站：GatewayRunner，消息 dispatch
│   ├── session.py        ← SessionStore
│   ├── delivery.py       ← 出站投递
│   ├── pairing.py        ← DM 配对授权
│   ├── hooks.py          ← hook 发现 + 生命周期
│   └── platforms/        ← ⑧ 第 9 站：20 个平台 adapter
│
├── hermes_cli/
│   ├── main.py           ← hermes 子命令入口
│   ├── config.py         ← DEFAULT_CONFIG、迁移
│   ├── auth.py           ← PROVIDER_REGISTRY、凭证解析
│   └── runtime_provider.py ← provider → api_mode + 凭证
│
├── acp_adapter/          ← ACP（IDE 集成，stdio/JSON-RPC）
├── cron/                 ← 调度器
├── plugins/memory/       ← memory provider 插件
├── plugins/context_engine/ ← context engine 插件
├── skills/               ← 内置 skill（首次运行时 copy 到 ~/.hermes/skills/）
├── optional-skills/      ← 可选 skill（需显式安装）
└── tests/                ← ~25,000 个测试，~1,250 个文件
```

阅读顺序的本质：

1. 先读大脑（`run_agent.py` 的 `AIAgent`）
2. 再读它怎么跟外部世界对话（`prompt_builder.py` 拼 prompt、`model_tools.py` 调工具）
3. 然后是状态层（`hermes_state.py` 持久化）
4. 最后是入口层（`gateway/run.py`、`hermes_cli/main.py`）

### 一个关键的依赖链

工具注册发生在 **import 时**，不是运行时：

```
tools/registry.py  （无依赖）
       ↑
tools/*.py  （每个文件顶层调 registry.register()）
       ↑
model_tools.py  （import tools/registry，触发工具发现）
       ↑
run_agent.py / cli.py / batch_runner.py / environments/
```

这意味着：**任何 `tools/*.py` 文件只要有顶层 `registry.register()` 调用就会被自动发现**。你新增一个工具文件，不需要改任何 import list。这是 Hermes 工具扩展性强的底层原因。

### 测试规模

`tests/` 目录约 25,000 个测试，分布在 ~1,250 个文件。这是 Hermes 工程化程度的一个重要信号：它不是个粗糙的开源 demo，是个有完整测试覆盖的工程项目。如果你怀疑某个行为，先去 `tests/` 找对应测试用例，往往比读文档更准。

## Profile 隔离（多实例并行）

`hermes -p <name>` 启动一个独立 profile：

- 独立 `HERMES_HOME`（配置 / 记忆 / skill / session）
- 独立 gateway PID
- 独立 config

多个 profile 能并行跑，工作 / 个人 / 实验互不污染。这点对长期使用很重要：**你不会想用一个 agent 实例同时管生产代码和私人备忘录**，记忆会串。

第 21 篇详讲 profile、备份、迁移。

## 后续每篇在哪个节点加深（路标）

这张表是后续 22 篇的导航，对照前面那张总图看：

| 篇 | 加深的节点 |
| --- | --- |
| 04 配置与 context files | `prompt_builder.py` 拼 system prompt 的细节，`SOUL.md` / `AGENTS.md` 在哪一层 |
| 05 learning loop 总览 | 跨 session 的「学习 loop」（不是单 turn 的执行 loop） |
| 06-09 skill 系统 | skill 文件结构、写第一个 skill、Skills Hub、self-improvement + Curator |
| 10-12 memory 三层 | MEMORY.md / USER.md / session archive / Honcho 各自细节 |
| 13-14 多平台 gateway | 平台适配器细节、微信桥接 |
| 15-16 cron + 子 agent + 端到端 recipe | gateway cron ticking、delegate_task、真实工作流 |
| 17 tools / toolset / MCP | 工具注册、toolset 分组、MCP 外接 |
| 18 模型选择 | provider resolution、3 API mode、Nous Portal |
| 19 backend / serverless / 成本 | 6 backend 对比、serverless 休眠坑 |
| 20 安全 / 审批 / DM 配对 | `tools/approval.py`、危险命令检测、pairing |
| 21 升级 / 备份 / 迁移 | profile、HERMES_HOME、跨机器 |
| 22 对比 OpenClaw / Claude Code | 单 agent vs 多 agent、harness 工程哲学 |
| 23-25 30 天实战 / 轨迹生成 / 社区 | 长期使用、trajectory 训练数据、生态 |

## 真实坑（再强调一遍）

- **副作用不可见**：skill 创建、MEMORY.md 改动是后台发生的。养成习惯定期 `git -C ~/.hermes diff` 看 agent 改了什么。
- **agent 给自己打分偏高**：重要的 skill 一定要 `pin`，否则可能被 self-improvement 用更差版本覆盖。GEPA 是外部纠偏，但需要你手动跑。
- **backend 选择影响能力**：local 能动本机文件；serverless（Modal/Daytona）休眠后环境重置。第 19 篇详讲。
- **system prompt 中途改会破坏缓存**：换模型、改 memory 文件、改 context 文件都会触发重处理。生产环境慎用。
- **MEMORY.md 改了当 session 不生效**：要下个 session 才生效。着急就开新会话。
- **3575 字符硬上限**：MEMORY.md + USER.md 加起来。写多了会被截或被挤掉，得精选。

## 权衡：什么时候该用 Hermes，什么时候不该

Hermes 把「模型 + 一堆外围系统」打包成一个长期运行的有状态 agent。**好处是你不用自己拼**（prompt builder、context compression、memory、skill、gateway、cron、backend 全有）；**代价是复杂度你都得吃下**：配置、记忆治理、安全边界、profile 管理、gateway 进程维护全是你的活。

把它当「一个会记笔记的 CLI 工具」用就低估了它（你不会用到 90% 的卖点）。把它当「一个完整 OS 式助手」用就要接受运维负担。

判断标准：

- **该用**：你想要一个跨平台、跨会话、长期持续工作的个人/团队助理。任务会重复且演进。愿意做配置和记忆治理。
- **不该用**：你只想要一次性问答（用 ChatGPT 网页版更简单）。任务窄、短期、不需要跨会话状态。不能接受长跑进程的运维。

## 结论

记住三件事：

1. **那张六块组件总图**：gateway / AIAgent / skills / memory / tools / terminal backend，外加后台的 Curator。
2. **一个 turn 的 9 步生命周期**：这是 agent loop 的核心，所有功能都在某一步上加机制。
3. **两个 loop 的区别**：执行 loop（单 turn 编排）vs 学习 loop（跨 session 沉淀），后者依赖前者 + 外部 GEPA 才能闭环。

后面 22 篇每一篇都是在某个节点上加深度。读到任何一篇忘了上下文，回到这张图定位。

## 延伸阅读

官方文档（最权威，先看）：

- [Hermes Agent Architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)：顶层架构图 + 目录结构 + 推荐阅读顺序
- [Agent Loop Internals](https://hermes-agent.nousresearch.com/docs/developer-guide/agent-loop)：`AIAgent` 9 步生命周期详解
- [Gateway Internals](https://hermes-agent.nousresearch.com/docs/developer-guide/gateway)：20 个适配器、session 路由、hook 系统
- [Session Storage](https://hermes-agent.nousresearch.com/docs/developer-guide/session-storage)：SQLite schema、FTS5、session lineage
- [Tools Runtime](https://hermes-agent.nousresearch.com/docs/developer-guide/tools-runtime)：工具注册、dispatch、6 backend
- [NousResearch/hermes-agent（GitHub）](https://github.com/nousresearch/hermes-agent)：源码

社区深度拆解（值得读）：

- [Inside Hermes Agent: How a Self-Improving AI Agent Actually Works（mranand）](https://mranand.substack.com/p/inside-hermes-agent-how-a-self-improving)：学习 loop、四层 memory、gateway、agent loop 全拆
- [The two loops of Hermes Agent（Daniel Braz, Level Up Coding）](https://levelup.gitconnected.com/the-two-loops-of-hermes-agent-33922ba8d154)：self-congratulation 问题、GEPA、第二个仓库的意义
- [Designing Hermes Agent from Scratch: A Systems Deep Dive（Ken Huang）](https://kenhuangus.substack.com/p/designing-hermes-agent-from-scratch)：长跑控制循环视角
- [开源 AI Agent 新秀 Hermes Agent：纯 Python 架构能否撼动 OpenClaw（jimo.studio）](https://jimo.studio/blog/hermes-agent-the-python-native-ai-agent-challenging-the-status-quo/)：Python 原生架构、Agent-loop-first vs Gateway-first 对比
- [Hermes Agent Deep Dive & Build-Your-Own Guide（dev.to）](https://dev.to/truongpx396/hermes-agent-deep-dive-build-your-own-guide-1pcc)：端到端实战拆解
- [Hermes Agent 中的两套 Agent Loop（cnblogs）](https://www.cnblogs.com/softlin/p/19897809)：中文源码级分析，确认 `run_agent.py` vs `agent_loop.py` 的区分
