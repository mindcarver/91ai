# 闭环学习总览：skill 自动创建的生命周期

> 系列第 5 篇 · 读者预设：想真正理解 Hermes 核心卖点机制的人 · 最后核实：2026-07

**TL;DR：** 第 1 篇讲了 self-improving 的本质是"skill 笔记本变厚"，这篇拆完整生命周期。Hermes 的"学习"严格说由**两个独立循环**构成：第一循环跑在运行时里，做 skill 的创建 + 使用中打补丁 + 后台 Curator 整理归档；第二循环跑在另一个仓库（`hermes-agent-self-evolution`），离线读执行轨迹，用 GEPA 进化算法改写 skill 文本本身。理解哪些任务适合自动成 skill、哪些不适合，理解 author=executor=reviewer 这个结构性缺陷，比相信"它会自己变聪明"重要得多。**没有 GPU 训练，没有权重更新**。所有"学习"都发生在文本层。

---

## 一、self-improving 的真实含义（接第 1 篇）

第 1 篇已经讲过：Hermes 的 self-improving 不是模型权重变化，是 `~/.hermes/skills/` 这个目录里 Markdown 文件越攒越多、越用越准。这点必须在脑子里钉死，否则后面所有机制都会被理解错。

具体一点：模型本身（Claude、GPT-4o、Hermes-3 这些底座）是冻结的，不会因为你用得多就变聪明。变厚的是 skill 库，变精的是 memory 文件（`MEMORY.md` 记事实偏好、`USER.md` 记用户画像，两个加起来有 3,575 字符上限），变快的是 agent loop 检索 skill 的命中率。这套东西加在一起，对外表现为"用得越久越好用"。

但"用得越久越好用"是个有条件的命题。它依赖三件事都成立：第一，agent 真的能把好的解法沉淀成 skill；第二，沉淀下来之后真的能被正确检索到、被正确修补；第三，有外部机制能纠正 agent 自己评价自己时那种系统性的乐观偏差。前两件是第一循环负责，第三件是第二循环（Self-Evolution）负责，缺一不可。

这篇文章就把这两个循环拆开讲清楚，再给出一个六阶段状态机，让你能预测任何一个 skill 从被想到到被归档会经历什么。

---

## 二、生命周期六阶段状态机

把两个循环合在一起看，一个 skill 的完整生命周期是六个阶段：

```
                第一循环（运行时）
        ┌─────────────────────────────────────────┐
        │                                          │
        │   [1 触发] ─► [2 创建] ─► [3 使用] ─► [4 修补]
        │                                  ⇡      │
        │                                  └──────┘
        │                                  使用中改
        │
        │   [5 Curator 整理]（后台，每 7 天 + idle 2h）
        │           │
        │           ▼
        │       active → (30d) stale → (90d) archived
        │
        └─────────────────────────────────────────┘

                第二循环（离线，独立仓库）
        ┌─────────────────────────────────────────┐
        │   [6 Self-Evolution / GEPA]              │
        │   读执行轨迹 → 改写 skill 文本 → 提 PR    │
        │   ~$2-10 / 次，无 GPU                     │
        └─────────────────────────────────────────┘
```

六阶段逐个解释：

1. **触发**：agent 完成一个任务后，回头判断"刚才这条路值得记下来吗"。判断条件是确定的（下面详述），不是模糊的"我觉得刚才做得挺好"。
2. **创建**：判断通过就写一个 Markdown 文件进 `~/.hermes/skills/`，符合 agentskills.io 标准（第 6 篇拆结构）。
3. **使用**：下次遇到类似请求，agent loop 先查 skill 库，命中就直接走 skill 里的步骤，省得重新试错。
4. **修补**：skill 在使用中被发现过时或错了，**就地打补丁**（patched during use）。这是第一循环里最微妙的一步，也是大部分"漂移"风险的来源。
5. **Curator 整理**：后台进程定期扫 skill 库，根据使用计数把 skill 在 active / stale / archived 三个状态之间搬。
6. **归档**：不是删除，移到 `~/.hermes/skills/.archive/`，需要时 `hermes curator restore <skill>` 捞回来。

注意第 6 阶段（Self-Evolution）**不在主循环里**，它跑在另一个仓库，是离线触发的。把第二循环理解成"定期给 skill 库做文本层面的健身教练"。它不是必然发生的，需要你主动跑或者配置失败率阈值触发。这个边界非常重要，后面会展开。

---

## 三、第一循环详解：触发、创建、使用、修补

### 3.1 触发条件（精确版，别被错误说法带偏）

关于"什么任务会触发 skill 创建"，网上流传最广的一个说法是"同一个模式在 2 个以上会话里出现就触发"。**这个说法的来源经不起查**：它被归因到一篇 Milvus/Zilliz 博客，但那个 URL 在 milvus.io 和 zilliz.com 上都不存在，是搜索引擎返回的幻觉结果。Hermes 官方文档里**没有任何"2 个以上会话"的阈值**。

真实的触发条件在 mranand 的 Substack 和 Hermes 官方文档里有明确记载，是**单任务内**的判断，跟跨会话没关系。一个任务完成后，agent 检查这次轨迹是否满足以下任意一条：

- **5 次以上工具调用**：mranand 原话是 "five or more tool calls"。一个任务复杂到要调 5 次以上工具（不是 5 次 LLM 调用，是 5 次 tool call），说明不是一眼能答的小问题，值得记。
- **从错误中自我恢复**：执行过程中报错了，agent 自己调整了策略继续做下去，最后做成了。这种"试错-修正-成功"的轨迹值得保存。
- **被用户纠正过**：用户中途插话"你这样做不对，应该那样做"，agent 接受了并按用户说的做成了。用户的纠正是高价值信号。
- **发现了非显然的有效路径**：找到了一个不直觉但确实 work 的解法。

满足任一条，agent 才会进一步评估"要不要写成 skill"。注意这是**门槛**，不是充分条件。过了门槛之后还有一个内容判断：这次轨迹里有没有可复用的、结构化的步骤可以抽出来。如果一个任务调了 6 次工具但每一步都是一次性的、没法复用，照样不会成 skill。

关于另一个常被误引的数字"3,575 字符上限"：这个数字是真的，但**不是 skill 的限制**，是 prompt memory 的限制。`MEMORY.md` + `USER.md` 这两个文件加起来不能超过 3,575 字符，强制 agent 做"挑选"而不是"堆积累"。skill 文件本身的上限是另一个数：Self-Evolution 阶段会强制 skill 文件 ≤ 15 KB，超过就不让优化管道处理。这两个数管的是不同层，别混。

### 3.2 创建：写一个 Markdown 文件

触发通过后，agent 调 `skill_manage` 工具（action=create）把这次解法写成一个 Markdown 文件，落到 `~/.hermes/skills/<skill-name>/SKILL.md`。文件结构遵循 agentskills.io 标准：YAML frontmatter 描述元信息（name、description、when_to_use、tools），正文是步骤化的指令。第 6 篇专门拆结构，这里只说一句：这个文件**不是日志**，是给未来的 agent 读的"操作手册"。

创建的时候有个关键字段：`created_by` 或 `agent_created`。**只有后台 self-improvement review 流程创建的 skill 才会被标记为 agent-created**，前端通过 `skill_manage create` 显式创建的 skill 不会被标记。这个标记决定了 Curator 会不会管它（后面讲）。

这里的"后台 self-improvement review 流程"具体是个什么东西？官方文档里描述为一个 fork 的 agent 进程，**每大约 10 个 agent turn 跑一次**，写来源标记为 `background_review`。它的职责是回头看刚才这段对话，判断有没有值得沉淀成 skill 的内容。所以 agent-created skill 的诞生不是同步发生在任务完成那一刻，而是在对话进行中由这个后台 fork 周期性地判断和写出。这个机制解释了为什么 Issue #25833 评论区 jax-0n-git 的复现里，被纠错的幻觉命令会被固化成 skill。因为 background_review fork 读的是会话级轨迹，它在用户纠正之前就已经看到了那段幻觉文本，并且在它的视角里那段文本"看起来像个值得记的规则"。这个时序错位是结构性问题，不是单个 bug。

### 3.3 使用：检索 + 加载

下次用户提问，agent loop 会先查 skill 库，看有没有命中的。命中后把 skill 内容加载进当前会话的 prompt，agent 按 skill 的步骤执行。命中率的实现是 FTS5（SQLite 全文检索），不是向量检索，这是个经常被搞混的点。Hermes 的 skill 检索默认是关键词匹配，不是语义检索。

这点很重要：如果你的 skill 描述写得差（比如用了和触发场景不一致的词），即使逻辑上是对的，agent 也检索不到。skill 写作的关键词敏感度比想象的高。

为什么会用 FTS5 而不是向量检索？因为 skill 文件长度短（典型几百字到一两千字），文本本身已经是高度结构化的自然语言，关键词匹配的召回率在 skill 这个量级是足够的，且零额外依赖、零成本。向量检索的优势在长文档、跨语言、语义模糊匹配的场景，这些场景 skill 库基本不会遇到。但有副作用：如果你的 skill 描述用了"部署"而用户提问用了"上线"，FTS5 可能漏检。所以 skill 写作时，frontmatter 里的 `description` 字段值得把同义词、领域术语都铺开写，这是关键词召回的杠杆点。第 7 篇手写 skill 会专门讲怎么写 description。

### 3.4 修补：使用中就地打补丁

这是第一循环里最关键也最危险的一步。Daniel Braz 在 Level Up Coding 那篇里原话：

> "During subsequent sessions, when the agent recognizes a similar problem, it retrieves the skill and follows it. If, during execution, the skill turns out to be incomplete, outdated, or wrong, the agent patches the document in place."

注意"in place"，就地改，不是改副本。agent 在执行 skill 的过程中发现某个步骤过时了（比如 skill 里说的 API 端点已经废弃），它会停下来改 skill 文件，再继续。

这个机制的设计意图是好的：让 skill 跟着现实走，不僵化。但它的代价是**修补决策本身没有外部校验**。agent 觉得"这里该改"，可能是对的（API 真废弃了），也可能是错的（agent 自己理解偏了，把一个本来对的步骤改坏了）。这种"漂移"在累积几次之后可能让 skill 偏离你最初的本意很远。第 9 篇专门讲怎么观察和回滚漂移。

第一循环到这里就闭合了：触发 → 创建 → 使用 → 修补 → 再使用。用 Braz 的话说，这套机制"是真的"，skill 确实会越用越好，前提是没有错误的解法被固化进来。

---

## 四、第一循环里的后台组件：Curator

Curator 是第一循环的"后台整理员"。它在主进程里跑，但不在用户对话的关键路径上。官方文档原话：

> "The curator is a background maintenance pass for **agent-created skills**. It tracks how often each skill is viewed, used, and patched, moves long-unused skills through `active → stale → archived` states, and periodically spawns a short auxiliary-model review that proposes consolidations or patches drift."

### 4.1 跑的频率（精确值）

Curator 不是 cron 守护进程，是**触发式**的。触发条件是两个都满足：

- 距离上次 Curator 跑过已经超过 `interval_hours`，**默认 168 小时（7 天）**。
- agent 已经空闲超过 `min_idle_hours`，**默认 2 小时**。

检查时机是 CLI 会话启动那一刻 + 网关 cron-ticker 线程的周期 tick。两个条件都满足才会真跑。配置长这样：

```yaml
curator:
  interval_hours: 168   # 7 天
  min_idle_hours: 2
```

刚装好的全新环境，第一次 Curator **不会立刻跑**。它会先记下 `last_run_at = now`，然后延后一个完整 `interval_hours` 再开始第一轮。这是个保护设计，防止新装就被后台进程乱动。

### 4.2 打分机制（其实是计数，不是评分）

网上有些资料说 Curator "给 skill 打分"，暗示有个加权公式。**这个说法不准确**。官方文档明确：Curator 跟踪的是几个**计数器**，不是综合评分：

- `view_count`：被 `skill_view` 工具看过几次
- `use_count`：被加载进对话 prompt 几次
- `patch_count`：被 `skill_manage patch/edit/write_file/remove_file` 改过几次
- 外加一堆时间戳：`last_used_at`、`last_viewed_at`、`last_patched_at`、`created_at`、`archived_at`

这些计数器存在 `~/.hermes/skills/.usage.json`。**没有任何文档化的加权评分公式**。状态转换是基于"距上次使用过了几天"这种确定性规则，不是基于一个综合分数。

具体阈值：

- **30 天没用**：`active` → `stale`
- **90 天没用**：`stale` → `archived`（移到 `~/.hermes/skills/.archive/`）

```yaml
stale_after_days: 30
archive_after_days: 90
```

### 4.3 两个阶段，确定性 + LLM

每次 Curator 跑都分两个阶段：

**阶段一（总是开）**：自动状态转换。纯确定性，没有 LLM 介入，只看时间戳。30 天没动就标 stale，90 天没动就 archive。这部分你完全可以预测，拿 `last_used_at` 一减就知道下次 Curator 会怎么处理。

**阶段二（默认关）**：LLM 整合。需要 `curator.consolidate: true` 才开。开了一个辅助模型（auxiliary.curator slot）扫一遍 skill 库，对每个 skill 决定：keep（保留）/ patch（修补）/ consolidate（合并相似的）/ archive（归档）。这个阶段有迭代上限 `max_iterations=8`，是个单次辅助模型 pass，不是反复迭代。

阶段二的合并功能很有意思：当 Curator 发现几个 skill 内容高度重叠（比如三个都讲"部署 Flask 应用"），它会**提议**把它们合并成一个更通用的"umbrella skill"。注意"提议"。Curator 写报告到 `~/.hermes/logs/curator/<timestamp>/run.json` 和 `REPORT.md`，你可以 `hermes curator run --dry-run` 先看它会做什么再决定要不要真跑。

### 4.4 几个安全边界

Curator 有几条硬规则，理解这些规则能帮你判断它的边界：

- **永不删除**：最大破坏操作就是归档，归档目录在 `~/.hermes/skills/.archive/` 下，可恢复。官方明确说 curator 永不自动删除 skill。
- **只管 agent-created 的 skill**：bundled（系统内置）和 hub-installed（从 Skills Hub 装的）skill 不在 Curator 管辖范围内。`created_by: agent` 字段是开关。
- **硬编码的保护内置**：有一小组内置 skill（比如驱动 `/plan` slash command 的 `plan` skill）被硬编码为永不可归档、永不可合并。原因官方原话："silently archiving one would turn its slash command into an 'Unknown command' error with no signal to you."
- **可以 pin**：`hermes curator pin <skill>` 让某个 agent-created 的 skill 跳过所有自动转换。pin 只能对 agent-created 的用，对 bundled 和 hub 的用会拒绝。
- **跑之前先备份**：每次真跑（不是 dry-run）前，先打 tar.gz 快照到 `~/.hermes/skills/.curator_backups/<utc-iso>/skills.tar.gz`，默认保留 5 份。

### 4.5 一个典型的 Curator 治理工作流

把上面这些拼成一个实际可用的治理节奏：

- **每周一次 dry-run**：`hermes curator run --dry-run` 看 REPORT.md。重点看 Curator 提议归档哪些 skill、提议合并哪些。这一步零副作用，相当于每周体检。
- **判定归档是否合理**：Curator 提议归档一个 skill 的理由是"90 天没用"。但有些 skill 是季度性的（比如只在季度复盘时用的报表生成 skill），3 个月没用是正常的。识别出这种 skill 之后 `hermes curator pin` 保护起来。
- **判定合并是否合理**：合并提议需要更谨慎地看。两个 skill 文本相似不代表语义重叠。可能一个是"Flask 服务的 Dockerfile"另一个是"FastAPI 服务的 Dockerfile"，文本高度相似但框架不同，合并会丢失区分。合并完后改起来反而麻烦。
- **真跑前再 pin 一次重要 skill**：dry-run 看着没问题，真跑前再 `hermes curator pin` 一次业务关键的 skill。Curator 的逻辑虽确定性，但版本升级后默认值可能变（比如未来的 Hermes 可能把 archive_after_days 从 90 调到 60），pin 是唯一确定的防护。
- **必要时 restore**：发现某个 skill 被错归档了，`hermes curator restore <skill>` 把它从 `.archive/` 拉回来，状态重置为 active，计数器保留。

这个节奏的成本是一周十几分钟，但能让你对 skill 库的状态保持把握，而不是"黑盒运行 3 个月后打开发现一堆东西被合并了不知道为什么"。

理解这几条之后，你应该能回答这种问题："我有个 skill 是我自己手动建的，Curator 会动它吗？"不会，因为它没有 `agent_created: true` 标记。"我担心某个重要 skill 被归档，怎么办？"pin 住。"Curator 删了我的 skill 怎么办？"它没删，归档目录里捞回来，或者从备份快照里恢复。

---

## 五、第二循环：Self-Evolution / GEPA

第一循环的瓶颈在哪儿？Braz 在那篇 Level Up Coding 里点破了：

> "The agent thinks it did well almost every time, even when it didn't. The same mechanism that produces skills can also overwrite manual customizations with worse versions of themselves."

agent 评价自己的表现时，系统性偏乐观。这种"自评不可靠"是 LLM-as-judge 的结构性问题。评价器和被评价器共享同一组先验、同一组盲点。靠 agent 自己说"刚才做得不错"来决定要不要把解法固化成 skill，会有一类错误根深蒂固：那些 agent 自己看不见的错误。

第二循环（Self-Evolution）就是为了补这个洞而存在的，它住在**另一个仓库**：`github.com/NousResearch/hermes-agent-self-evolution`。

### 5.1 为什么拆出去

Braz 的判断很到位，他说这种仓库级拆分是"一个架构上的坦白"：

> "That split is an architectural confession. It says: the in-runtime loop cannot grade itself, because the grader shares the executor's priors. The grading has to happen elsewhere, on a different temporal cycle, against a different signal."

直译：把 Self-Evolution 拆出去不是工程洁癖，是承认"在运行时里自己给自己打分这件事从原理上就靠不住"。评分必须发生在别的地方、别的时间尺度上、对着别种信号。

别种信号是什么？是**执行轨迹**（execution trace）。agent 真实跑了哪些工具调用、返回了什么、重试了几次、在哪一步出错。轨迹是系统里最接近 ground truth 的东西。agent 自己的事后叙述（"我觉得刚才做得挺好"）不可靠，但它实际做了什么，记录是死板的。

### 5.2 Self-Evolution 怎么改 skill

Self-Evolution 的 README 一句话定义：

Self-Evolution 用 DSPy + GEPA（Genetic-Pareto Prompt Evolution）自动进化并优化 skill、工具描述、system prompt 和代码，通过反思式进化搜索产出可测量更好的版本。

关键短语："evolutionary search"。它是个搜索过程，不是微调。把 skill 文本当成待优化的"基因"，跑很多代变异 + 选择，挑出效果更好的版本。

GEPA 是 DSPy 3.0+ 内置的优化器，论文是 arXiv 2507.19457（ICLR 2026 Oral）。它和普通 prompt optimizer 的区别在两点（Kanis Patel 在 LinkedIn 上的总结）：

1. **遗传搜索**：维护一个变体种群（population），把"赢家"的片段组合 + 小幅变异产生下一代。差的变体死掉，好的繁殖。
2. **反思式更新**：在代与代之间，GEPA 读真实的任务反馈（错误、部分得分、模型自己的 rationale），用一个 LLM **提议有针对性的变异**，不是随机乱试。它知道上一代为什么失败，然后针对性地改。

GEPA 维护的不是单一最优解，是一个 **Pareto frontier**。同时考虑准确率、延迟、token 成本多个目标。这样 agent 可以根据当时的预算约束（比如"现在省 token 比快更重要"）从 Pareto 前沿上挑合适的变体。

### 5.3 改的边界：冻结 vs 可变

Self-Evolution 改 skill 的时候有明确的边界，不是什么都能动：

**可变的**：skill 文本（SKILL.md 的内容）、tool 描述文本、few-shot 示例、instruction 文字。

**冻结的**：JSON schema、参数名/类型/必填字段、函数签名、`registry.register()` 调用、错误处理覆盖率（不能降低）。简单说，**结构不动，只动文字**。

举个具体的：如果 skill 里定义了一个参数叫 `output_path`，Self-Evolution 不会把它改成 `out_dir`，那会破坏向后兼容。它只能改这个参数的描述文字，让它更容易被 agent 正确理解。

### 5.4 触发与成本

Self-Evolution 不是一直跑的，需要主动触发：

- **手动**：`python -m evolution.skills.evolve_skill <skill-name>`
- **自动**（PLAN.md Phase 5）：当一个 skill 的失败率超过阈值 X%，自动触发 GEPA。具体 X 的值目前文档里没钉死。

成本是 **$2-10 每次优化运行**，全部走 API 调用，**不需要 GPU**。这个数字对个人用户和小团队是友好的。一周优化一个核心 skill，一个月也就几十美元。

默认迭代次数 `--iterations 10`，Phase 1 文档建议每个 skill 跑 5-10 次迭代。最少 3 个样本就能跑 GEPA（这比 RL 需要的样本量低一个数量级）。

### 5.5 守门：变体上线前必须过的关卡

每个变体在写回主仓库前，必须过这几道关卡（PLAN.md 里写得很死）：

1. **完整测试套件**：`pytest tests/ -q` 必须 100% 通过。
2. **大小限制**：skill 文件 ≤ 15 KB；tool 描述 ≤ 500 字符；单个参数描述 ≤ 200 字符。
3. **缓存兼容**：不能在对话中途改 skill，会破坏 prompt cache，必须等下次会话才生效。
4. **语义保持**：不能漂离 skill 原本的目的。
5. **PR review**：所有改动走 PR，**人工 merge**，不直接 commit。

注意最后一条，Self-Evolution **不直接改 skill**。它产出 PR，人类 review 之后才合。这意味着 Self-Evolution 实际上是个**建议器**，不是自动机。你可以把它理解成一个永远在工作的实习生，提 PR 很勤快，但你才是 merge 按钮。

PLAN.md 里有个硬规则体现了这个保守取向：

> "A variant that improves skill quality by 20% but drops TBLite by 5% is REJECTED. Every candidate variant must pass ALL of these."

意思是有任何一项指标退化（哪怕其他指标大幅提升），整个变体被拒。这是严格支配（strict dominance）规则，只接受全方位不退化的版本。

---

## 六、两个循环和 Self-Evolution 的关系

把三个组件放一起看，关系就清楚了：

| 组件 | 住哪儿 | 干啥 | 触发 | 改的是 |
|------|--------|------|------|--------|
| 第一循环主流程 | 主进程运行时 | 创建/使用/修补 skill | 任务完成时（5+ 工具调用等触发条件） | skill 内容（agent 自己改） |
| Curator | 主进程后台线程 | 整理 skill 库，归档冷门 | 7 天 + idle 2h | skill 状态（active/stale/archived） |
| Self-Evolution | 独立仓库，离线 | 改写 skill 文本，让它效果更好 | 手动 / 失败率阈值 | skill 文本（GEPA 优化） |

社区里有个简洁的二分（r/hermesagent 上的概括）：

> "Curator = janitor, Self-Evolution = coach."

Curator 是清洁工，清理没用过的、合并重复的、归档过期的。Self-Evolution 是教练，改写还在用的 skill 的内容，让它执行得更好。两者住不同仓库、管不同维度、解决不同问题。

把它们的关系用一张表表达：

```
[第一循环运行时]                       [Curator 后台]                [Self-Evolution 离线]
   创建 skill                            标记 stale/archived           改写 skill 文本
   使用 skill                            合并相似 skill                优化 Pareto 前沿
   修补 skill                            永不删除                      产出 PR，人工 merge
       │                                       │                              │
       └───────────── agent-created ──────────┘                              │
                                            │                                  │
                                            └────── 改完的文本回写 ───────────┘
```

注意 Self-Evolution 改完的 skill，会再次进入第一循环被使用、被修补、被 Curator 整理。三个组件是串行的，不是平行的。

---

## 七、哪些任务适合自动成 skill

判断标准很简单一句话：**重复且有相对固定解法**。展开来看：

### 7.1 适合的

- **重复性日常任务**：每周整理周报、每天生成简报、固定的代码审查清单。这种任务每次步骤差不多，agent 试错一两次就能固化。
- **你反复教过 Hermes 同一件事**：如果你已经第二次或第三次手动告诉 Hermes "我们项目的 lint 规则是 XXX"，这是强信号。说明 Hermes 现有 prompt 不够，值得沉淀成 skill。这条比"5+ 工具调用"更值得作为你的判断依据。
- **多步骤但每次步骤差不多**：部署流程、数据备份、特定格式的文档生成。这种任务调工具次数多（容易过 5 次阈值），且步骤可复用。
- **领域特定的工具链**：你公司内部的 CLI 工具用法、特定 API 的调用方式。这些 Hermes 的底座模型不熟，每次都得查文档，固化成 skill 能省大量重复劳动。

### 7.2 不适合的

- **一次性任务**：迁移某个特定项目、处理某次性数据。这种任务再也不会用第二次，固化成 skill 后污染库，徒增 Curator 的工作量。
- **创意性、强上下文依赖**：写文案、做架构决策、起产品名。每次差异极大，skill 帮倒忙。它会诱导 agent 套用上次的模板，而这次恰好不该套。
- **结果不可复现**：依赖当时网络状态、第三方临时响应的任务。skill 把"上次能跑通的步骤"记下来，但下次环境变了，照样跑不通，反而误导。
- **高度主观的判断**：审美、品味、个人偏好这种东西。skill 能记的只是步骤，记不住"为什么这样觉得"。

### 7.3 灰色地带：看起来重复其实不该成 skill

有些任务看起来"重复"但其实不适合固化，最容易误判的有几类：

- **每次答案都应该不同的"重复任务"**：写每日站会纪要、给客户写跟进邮件。表面上是模板化的，但每次的语气、重点、对象都不同。把模板固化成 skill 之后，agent 会倾向于套上次的措辞，而这次恰好需要不同的语气。
- **依赖实时数据的任务**：查股价、监控日志、看 CI 状态。skill 只能记步骤，记不住当时的数据。固化后 agent 跑 skill 时数据已经变了，结果可能误导。
- **版本敏感的工具链**：某个 SDK 的 3.x 版本用法。skill 写好之后 SDK 升到 4.x breaking change，skill 还在按 3.x 教 agent。这就是 Issue #25833 那个废弃 API 场景的变体。这种 skill 的保质期短，需要配合 Self-Evolution 才有用。

灰色地带的判断方法是问一句："如果半年后还按这套步骤走，会不会因为环境变了而坑到我？"答"会"的，不该成 skill（或者成了也要标注"敏感于版本/数据"，配合定期复核）。

### 7.4 一个具体的判断例子

假设你让 Hermes "帮我写一个 Node.js 服务的 Dockerfile"。

第一次让它做的时候，它可能花了几次工具调用（查 Node 版本、查基础镜像、写文件、调试）。这次任务**可能**会触发 skill 创建（如果过了 5 次工具调用阈值）。问题是：这次解法值得固化吗？

判断标准：
- 如果你接下来每周都要给不同服务写 Dockerfile，**值得**。skill 会越用越精，Self-Evolution 还会基于真实执行轨迹优化它。
- 如果这是一次性迁移，**不值得**。这次写的 Dockerfile 是给特定项目特定依赖的，下次另一个项目的 Dockerfile 完全不同，skill 反而会诱导 agent 复用过时的依赖版本。

更精细的判断：与其让"完整 Dockerfile 生成"成 skill，不如让"判断基础镜像该用 alpine 还是 slim 的决策树"成 skill。前者绑死具体版本，后者是可迁移的判断方法。skill 写得越靠近"判断逻辑"、越远离"具体执行"，复用价值越高。这是第 7 篇"手写 skill"会展开的话题。

---

## 八、结构性风险：author=executor=reviewer

闭环学习最大的、最难解决的风险，不是 skill 写得差，而是**整个机制缺乏外部校验**。这个问题在 GitHub Issue #25833 里有详细记录。

### 8.1 Issue #25833 的核心论点

Issue #25833（标题：Self-created skills lack mechanism-level guarantees for correctness and execution consistency）由用户 fancpp 在 2026-05-14 开，状态 OPEN，5 条评论。核心论点原文：

> "Hermes Agent has a powerful skill auto-creation loop... This is one of the system's strongest differentiators. However, the current mechanism has a **structural defect**: the agent is simultaneously the **author**, **executor**, and **quality inspector** of its own skills. **There is no external validation point or consistency check**, which creates several failure classes that prompt-level mitigations cannot fully address."

翻译过来就是：agent 既是 skill 的作者（写它）、又是执行者（用它）、又是质量检查员（评价它做得好不好）。这三个角色同一个 LLM 兼任，没有任何外部 ground truth 校验。

这个三合一为什么是结构性的问题？因为 LLM 的失败模式不是随机的，是有方向的。它会系统性地高估自己。同一个模型写 skill 时的盲点，在它评价这个 skill 时**仍然存在**。它看不见的错，依然看不见。prompt 层的缓解（比如让 agent "先自我批评一下再保存"）只能减弱，不能根除，因为批评本身也是同一个模型做的。

### 8.2 Issue 里给的具体失败场景

fancpp 给了一个清晰可重现的失败链：

1. 用户问"生成一个数据处理 pipeline"
2. agent 写了一个 pipeline，能跑，但用的是**已废弃的 API 端点**
3. agent 把这个解法存成 skill `data-pipeline-generator`（带废弃的 API）
4. 两周后用户问同样的问题
5. agent 加载这个 skill，生成带废弃 API 的代码
6. **失败，但没有任何机制能识别 skill 本身就是根因**

这个场景的危险之处在于：每一步看起来都对。agent 写 skill 时它确实 work，Curator 看到 use_count 涨也不会动它（它在被用），Self-Evolution 跑时如果没有暴露废弃 API 的执行轨迹也不会改它。**错误就这样长期、稳定地藏在 skill 里**。

### 8.3 评论里的真实复现

Issue #25833 评论区有用户 jax-0n-git 给了实际复现（Hermes v0.13.0，2026-05-15）：

- 第一轮：`hermes-agent-automation` skill 触发时，文件系统工具对实际有 19 个子目录、294 个文件的目录返回了空结果。agent 把这个空结果当成"目录真的是空的"，**后台 review 自动写了一个 skill，把这个幻觉结论"目录是空的"固化成了一个"经验教训"**。用户只能手动 `rm -rf` 删除。
- 第二轮：`hyperframes-wrapper-synthesis` skill 触发时，agent 在 4 轮里连续编造了不存在的 CLI 命令（`hermes agent execute`、`hermes deliver`），全部被用户纠正。但**后台 review 写的 skill 把 `hermes deliver --target <id>` 当成了"Sovereign Wrapper Standard"固化进去**。固化的不是用户纠正后的正确解法，是 agent 之前编造的、已经被丢弃的幻觉。

jax-0n-git 的总结点出了一个关键机制问题：后台 reviewer 读的是**会话级的轨迹上下文**，不是**最终交付物的状态**。所以会话中途被纠正的错误，反而比最终正确版本更有机会被固化成"经验教训"，因为错误版本在轨迹里出现得更早、文本更长、叙述更像"规则"。

### 8.4 评论里的"语义过度泛化"

contributor hanzckernel 在评论里给了另一类失败：Hermes 观察到你项目里 dev-server 用了特定端口（Vite 5173、后端 8648），写成 skill 时**把这些项目特定端口当成了通用 DevServer 约定**。后续会话里 agent 会假设所有 dev-server 都用这些端口。

hanzckernel 把这叫"the sibling failure mode: learned overconfidence from transient/local successes"，和 issue #6051 的"learned helplessness"是一对孪生兄弟。一边是从临时失败里学到无能，一边是从局部成功里学到过度自信。两者的根都是同一个：**系统分不清"观察到的事实"、"本地约定"和"可移植规则"这三者之间的边界**。

### 8.5 这个风险为什么难修

Issue #25833 提了四个方向作为修复路径：创建时的可复现性验证、一致性元数据、写入时的二级 review gate、跨运行一致性打分。但每个方向都有困难：

- **可复现性验证**：要"在隔离环境里跑一遍 skill 看结果对不对"，但很多 skill 涉及外部依赖（API、文件系统状态），隔离环境跑不出真实场景。
- **二级模型 review**：另一个 LLM 来 review skill。但同代/同家族的模型共享同样的盲点，换成不同家族的模型又面临成本和延迟。
- **跨运行一致性打分**：同一个 skill 跑两次看结果差异。但很多合法的 skill（比如生成创意文案）本来就该有差异，"一致性"不是普适标准。

fancpp 提的提案里有一组 sidecar 元数据字段，给 skill 加上运行时跟踪：

```yaml
runtime:
  model_created: "claude-sonnet-4-20250514"
  execution_count: 0
  success_rate: 0.0
  last_verified_with_model: "claude-sonnet-4-20250514"
  last_verified_at: null
  consistency_score: null
```

这些字段至少能让 skill 带着"上次验证过没有"的状态被检索到。`success_rate: 0.0` 的 skill agent 应该更谨慎地用。但这些字段目前在 Hermes 里**还没有实现**，是设计提案。

### 8.6 给你的实操建议

在 Issue #25833 提的机制层修复落地之前，你自己能做的事：

1. **重要 skill 手动 pin**：`hermes curator pin <skill>` 防止它被自动归档或合并。但注意这只能防 Curator，防不了 agent 自己 in-place 修补。
2. **定期翻 `~/.hermes/skills/`**：尤其关注 `patch_count` 高的 skill。它们是被改得最多的，也是漂移风险最高的。
3. **关键场景人工 review**：业务关键的 skill（涉及生产部署、数据处理、对外 API 调用）不要让 agent 自动创建后直接信任。手动复现一遍 skill 里的步骤，确认结果对得上。
4. **用 dry-run 看 Curator 会做什么**：`hermes curator run --dry-run` 在归档/合并前先看报告，避免 Curator 把你需要的 skill 错合并。
5. **理解 Self-Evolution 也会出错**：PLAN.md 里记了 Self-Evolution 自己的失败模式，比如 Issue #38（Phase 1 SkillModule 架构缺陷，不产出变异也不报错）、Issue #10（在 DSPy 3.1+ 配置 bug 下静默 fallback 到 MIPROv2）。Self-Evolution 在出问题时**不一定告诉你**。它可能跑了一晚上没产出，你以为优化过了。dev.to 那篇 pvishalkeerthan 的分析里原话："The system continues running without alerting the user that the external validation they are relying on is not actually operating."

---

## 九、把"Curator 也是 agent"这一点想清楚

第一循环里 Curator 是个特别容易引起误解的组件。很多人下意识觉得"经过 Curator 整理的就是对的"，其实不是。

Curator 的阶段二（LLM 整合）本身就是一个 LLM 在做决策。它判断哪些 skill 重叠、该怎么合并、哪些该归档。这个 LLM 的判断同样可能错。它可能把两个语义不同的 skill 误判为重叠（因为文本相似），合并后丢失关键差异；可能把一个其实还在用的 skill 归档（因为最近的 use_count 低，但只是你这周没用到）；可能漏掉真正应该合并的 skill（因为文本措辞差异大）。

所以正确的态度是：**Curator 整理过 ≠ Curator 整理对了**。把它当成一个"自动建议器"，重要决策自己复核一遍 dry-run 报告。

---

## 十、结构性缺陷的诚实结论

把这一篇所有机制放一起看，闭环学习的核心交易是这样的：

**你得到的**：把"怎么做事"这部分外包给 Hermes 自己沉淀，省了反复教的成本。skill 库越用越厚、越用越精（如果 Self-Evolution 跑得勤），memory 文件越攒越接近你的工作习惯。

**你付出的**：你得花精力**治理**这个 skill 库。观察漂移、清理错误、判断什么该成 skill 什么不该、定期 dry-run 看 Curator、复核关键 skill 的修补历史。把闭环学习当全自动的，迟早被错误固化的 skill 坑到，而且坑到的时候往往不知道是 skill 的错，因为整个系统都在"正常工作"。

Braz 在 Level Up Coding 那篇结尾有句话适合放在这里当警示：

> "Anyone telling you their agent has a closed learning loop is either marketing or hasn't shipped to production yet."

直译："任何告诉你他的 agent 有闭环学习的人，要么在营销，要么还没上线过。"

这句话不是说闭环学习没用。它非常有用，是 Hermes 区别于一般 coding agent 的核心差异。它是说**闭环不是真的"闭"**。第一循环依赖第二循环纠正它的偏差，第二循环又依赖人工 review 来兜底。每一层都有人工的位置。把哪一层当成全自动的，哪一层就会成为失败根源。

---

## 十一、本文给你的可操作结论

1. **记住六阶段状态机**：触发 → 创建 → 使用 → 修补 → Curator 整理 → 归档。前四步在第一循环运行时，后两步在 Curator 后台，Self-Evolution 是离线之外的第三层。
2. **记住触发条件是单任务的**（5+ 工具调用 / 错误自恢复 / 用户纠正 / 非显然路径），不是"跨 2+ 会话"。后者是流传甚广的错误说法，来源经不起查。
3. **记住 Curator 的精确阈值**：7 天间隔 + 2 小时 idle 才跑；30 天没用 → stale；90 天没用 → archived；永不删除；只管 agent-created 的 skill。
4. **记住 Self-Evolution 是建议器不是自动机**：产出 PR，人工 merge；改的是文本不动 schema；守门条件是严格支配（任何指标退化都拒）。
5. **记住 Issue #25833**：author=executor=reviewer 是结构性缺陷，不是 bug。在你看到 sidecar 元数据（success_rate、last_verified_at）落地之前，把这个缺陷当成"暂时没有外部校验"来对待。业务关键的 skill 必须人工复核。
6. **把判断标准用起来**：重复 + 有相对固定解法 → 让它成 skill；一次性 / 创意 / 强上下文 / 不可复现 → 不要让它成 skill。这条判断比任何参数调优都重要。

skill 库是资产也是债务。管理得好，越用越顺手；不管它，就是一堆越攒越乱、还带着错误固化的 Markdown。后续四篇（#6-9）逐层拆怎么管：#6 拆 skill 文件结构，#7 讲手写 skill，#8 讲 Skills Hub，#9 讲自我改进机制的边界和治理。

---

## 延伸阅读

- [The Two Loops of Hermes Agent（Daniel Braz，Level Up Coding）](https://levelup.gitconnected.com/the-two-loops-of-hermes-agent-33922ba8d154)："two loops" 框架的原始来源，对结构性缺陷的论述最清晰
- [Curator | Hermes Agent（Nous Research 官方文档）](https://hermes-agent.nousresearch.com/docs/user-guide/features/curator)：阈值、配置、状态机的权威来源
- [Inside Hermes Agent: How a Self-Improving AI Agent Actually Works（Mr. Ånand）](https://mranand.substack.com/p/inside-hermes-agent-how-a-self-improving)：5+ 工具调用触发条件、3,575 字符 prompt memory 上限的来源
- [NousResearch/hermes-agent-self-evolution（GitHub）](https://github.com/NousResearch/hermes-agent-self-evolution)：Self-Evolution 仓库，README + PLAN.md 是机制和成本权威
- [GEPA 论文（arXiv 2507.19457，ICLR 2026 Oral）](https://arxiv.org/abs/2507.19457)：Genetic-Pareto Prompt Evolution 的学术出处
- [GitHub Issue #25833（Self-created skills lack mechanism-level guarantees）](https://github.com/NousResearch/hermes-agent/issues/25833)：author=executor=reviewer 结构性缺陷的详细记录和真实复现
- [The Self-Trust Problem in Hermes Agent's Skill Architecture（pvishalkeerthan，dev.to）](https://dev.to/pvishalkeerthan/the-self-trust-problem-in-hermes-agents-skill-architecture-18bi)：对 Issue #25833 的扩展分析，覆盖 Self-Evolution 自身的静默失败
- [What Are Self-Evolving Agents? Inside Hermes, DSPy, and GEPA（Kanis Patel，LinkedIn）](https://www.linkedin.com/pulse/what-self-evolving-agents-inside-hermes-dspy-gepa-kanis-patel-b9olc)：GEPA 工作机制、Pareto 前沿、Self-Evolution 失败模式的清晰讲解
