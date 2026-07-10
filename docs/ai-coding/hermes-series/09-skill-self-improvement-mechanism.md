# skill 在用中自我改进：观察、调优与回滚

> 系列第 9 篇 · 读者预设：用了一阵、发现 skill 会自己变的人 · 最后核实：2026-07

**TL;DR：** skill 的 "patched during use" 是 Hermes 最该被怀疑的功能。它会自己改 skill，但**没有外部 ground truth**，agent 同时是作者、执行者、评审者。这篇拆三层自我改进（前台 patch / 后台 Curator / 独立 Self-Evolution），给观察改了什么的可运行 git 命令，给判断改得对不对的三条标准，给改坏了的完整回滚流程，再用 GitHub Issue #25833 的四类失败（错误固化、风格漂移、指标错位、Self-Evolution 静默失败）讲清楚为什么"越改越笨"不是 bug 而是架构固有张力。结尾给一张 ASCII 决策树：什么时候开自动改进、什么时候锁死手动。

## 自我改进发生在哪：三层不是一层

很多人把 Hermes 的"自我改进"当成一个开关，要么开要么关。实际上它至少分三层，颗粒度、触发方式、影响范围都不同。你要管它，先得分清是哪一层在动。把三层混为一谈，是你下手的第一个错：锁了 Curator 以为安全了，结果前台 patch 还在悄悄写文件；或者关掉 Self-Evolution 以为稳了，结果 Curator 在后台把两个核心 skill 揉成一个四不像。三层是三个独立的旋钮，得分别理解、分别控制。

**第一层：前台 patch（patched during use）**

最细颗粒，也最常见。某次 skill 被实际用到，模型在执行中发现"这一步参数写错了"、"那个 endpoint 已经迁移了"、"换种说法模型更容易跟住"，就地改 skill 文件，下一次轮立刻生效。社区里 Akshay Pachaar 在 X 上的拆解提到一个反直觉细节：**pinned skill 也会被 patch**。pin 只是阻止 Curator 把它归档或合并，不阻止前台的小修小补。所以你 pin 了不等于锁死。这个反直觉点坑过不少人：他们认真 pin 了所有关键 skill，以为这就是上限，过了三周发现其中一个 SKILL.md 已经被前台 patch 改了七八次，pin 状态纹丝不动。

触发信号大致三类：

1. **失败信号**：工具调用报错、API 返回 4xx/5xx、子任务抛异常。模型在错误恢复时往往顺手把"导致出错的步骤"改掉，加个 fallback 或换条路径。这一类总体偏可靠，有具体的报错文本做依据，模型的改动通常对得上报错内容。
2. **用户纠正**：你打断它说"不对，应该这样"。这种是最强的信号，模型会把你纠正的内容 patch 进去。但要注意，用户纠正往往带着情绪、带着口语，模型把口语直接写进 skill，下次执行时就有了"用户当时的烦躁语气"残留。
3. **模型自己的"反思"**：没有外部错误，但模型在执行完某步后觉得"换个措辞会更清晰"。这一类最危险：它是模型的自我感觉，没有外部 ground truth 校验。

注意第三类。GitHub Issue #429 把它叫 **proactive patching noise**，模型为了"显得在改进"而改，每次用完都动一下，结果 skill 越改越臃肿，原始的清晰步骤被反复揉写。Issue 维护者明确说：guidance 应该强调"only if genuinely improved"，不是"用一次改一次"。这种噪音式 patch 的累积效应很可怕：单次 diff 看下来都是无关痛痒的小改，三周后回头看 baseline，发现 SKILL.md 已经从 80 行变成 240 行，每一步都被加了"以更严谨的方式"、"在确保准确性的前提下"这种废话前缀，可执行的指令被冲淡成了铺陈。

**第二层：后台 Curator 整理**

中颗粒，定期跑（第 5 篇讲的第一循环之外的第二个循环）。Curator 是个后台 agent，干三件事：

- **grade**：给每个 skill 打分（使用频率、最近一次调用时间、成功率）。
- **prune**：把长期不用的 skill 从 active 移到 stale，再到 archived。LinkedIn/Mem0 那篇拆解把它叫 active → stale → archived 的三态生命周期。
- **consolidate**：合并语义重叠的 skill。

关键点：**Curator 自己也是 agent**。它不是确定性脚本，是 LLM 调用。所以"合并重叠 skill"这步，本质是另一个 LLM 在判断"这两个 skill 是不是一回事"，它会判错。Reddit r/hermesagent 上有人贴过真实案例：Curator 把两个不同语境下名字相似的 skill 合并了，结果两边都不准，原本一个针对"代码 review"、一个针对"文档 review"的 skill 被揉成一团，下次两个场景都触发错的那个。这种错误为什么难以察觉？因为合并后的 skill 不会立刻崩，它会"看起来还在工作"，只是输出的细节全错位了，调用者很难第一时间意识到根因在 Curator 的合并。

CLI 命令层面，`hermes curator archive <skill_name>` 是手动归档的入口；但**自动 Curator 跑起来不受这个手动控制**，它会按自己的节奏扫整个 skills 目录。这意味着你即便不主动 `hermes curator` 任何东西，后台进程也会按它设定的时间表自己跑起来。你若没在 SOUL.md 或配置里关掉自动 Curator，它就一直在动。

**第三层：Self-Evolution（独立模块，DSPy + GEPA）**

最粗颗粒，也最有想象力。这是 NousResearch 单独一个仓库 [`hermes-agent-self-evolution`](https://github.com/NousResearch/hermes-agent-self-evolution)，不是默认开启的，要你自己接。它干的事和前两层本质不同：

- 前两层改的是"这一步对不对"、"这个 skill 还要不要"。
- Self-Evolution 改的是"**这个 skill 的文本怎么写，模型执行起来效果更好**"。

具体说，它读 agent 跑过的真实执行轨迹（execution traces），用 DSPy 把 skill 文本拆成可优化的"提示组件"，再用 GEPA（Genetic-Pareto Prompt Evolution，arXiv [2507.19457](https://arxiv.org/abs/2507.19457)）做进化搜索：生成一堆 skill 文本的变体，让 agent 拿这些变体跑任务，按效果指标打分，留下 Pareto 前沿上的那些，再迭代。**不改模型权重**，只改 `SKILL.md` 里的字。所以 Towards AI 那篇博客标题很直白：*Hermes Agent Doesn't Learn. It Mutates Strings.* 这话略刻薄但点得准：所谓"自我进化"，本质是字符串空间里的搜索，模型权重一毫不动。它能拿到提升，是因为 skill 文本本身是 prompt，prompt 写得好不好对 LLM 输出质量影响巨大；但它绝不是"模型变聪明了"。

跑一次的成本：社区实测在 $2-10 区间（看任务复杂度和候选变体数），不需要 GPU，纯调 API。

**三层合起来才是"自我改进"全貌**

| 层 | 触发 | 改什么 | 颗粒 | 谁在改 |
|---|---|---|---|---|
| 前台 patch | 失败/纠正/反思 | 单步措辞、参数、fallback | 字符级 | 执行中的 agent |
| 后台 Curator | 定时 | 归档、合并、分级 | skill 级 | 另一个 LLM agent |
| Self-Evolution | 手动触发 | skill 文本的进化优化 | 提示组件级 | 独立仓库的 DSPy+GEPA |

这三层**都是 agent 自己改自己**，区别只在改的颗粒度和触发方式。下面所有"怎么观察、怎么判断、怎么回滚"的讨论，都要先分清是哪一层动过。一层错配，整盘错配。

## 怎么观察改了什么：不主动看你不会知道

这是自我改进最隐蔽的地方：**它不弹通知、不打日志到你的终端、不发邮件**。skill 文件静默地变了，下次执行就用新的。如果你不主动去查，可能用了一个月才发现某个 skill 已经被改得面目全非。这种静默不是设计疏忽，是"不打扰用户"的产品取向。Hermes 团队默认假设"自我改进是好事，没必要为好事弹通知"。但这个假设的前提是"改进真的总是改进"，而 Issue #25833 整篇就在反驳这个前提。所以你作为使用者，必须把"主动观察"加进自己的工作流，不能依赖系统提醒。

三个观察抓手，从最实在到最间接：

**抓手一：git diff（最实在）**

第 7 篇让你把 `~/.hermes/skills/` 建成 git 仓库。如果你建了，这是最可靠的观察手段。常用命令：

```bash
# 看最近一周改了哪些 skill
git -C ~/.hermes/skills log --since="1 week ago" --name-only

# 看某个 skill 的完整改动历史
git -C ~/.hermes/skills log -p SKILL.md

# 看两个 commit 之间某个 skill 改了啥
git -C ~/.hermes/skills diff <old>..<new> -- <skill>/SKILL.md

# 看当前工作区有没有未提交的改动（前台 patch 往往直接写文件）
git -C ~/.hermes/skills status
```

养成两个习惯：

1. **每周扫一次**：`git -C ~/.hermes/skills log --since="1 week ago" -p | less`，从头到尾翻一遍。看到不认识的 commit，停下来想"这个改动是哪来的"。
2. **每次手写完一个 skill，提交一个 baseline commit**，tag 上 `baseline-<skill>-YYYYMMDD`。这样后续 diff 有个明确的"原始本意"参照点。

注意一个坑：**前台 patch 有时不走 git commit**，而是直接覆盖文件。这种情况下 `git status` 会显示工作区有改动但没提交。所以光看 `git log` 不够，要配合 `git status`。更深一层，前台 patch 走的是 Hermes 自己的写入路径，不一定调 git，所以你可能看到工作区脏了一整天却没新 commit（这正常，不代表改丢，只代表改动还没固化成 commit）。配合一个简单 cron 每天自动 `git add -A && git commit -m "auto-snapshot"` 能把零散的 patch 串成可回溯的历史。

**抓手二：Curator 日志**

后台 Curator 跑的时候有日志，记录它 grade 了哪些、prune 了哪些、consolidate 了哪些。日志位置看你的版本（通常在 `~/.hermes/logs/curator/` 或类似路径）。重点看三件事：

- **归档了哪些**：有没有把你其实还在用的 skill 误判成 stale。Curator 的判断依据是"最近调用时间"，但有些 skill 是低频但关键的（比如月度报表生成），可能被误归档。
- **合并了哪些**：这是风险最高的一步。看到合并记录，去 diff 看合并前后的文本，确认语义没丢。
- **打了什么分**：grade 的分数变化趋势能告诉你 skill 的"健康度"。某个 skill 分数持续下降，要么是它真的过时了，要么是 Curator 的打分指标有问题。

Curator 日志里最容易被忽略的是合并决策的依据。日志会写"similarity score 0.87, merged"，但这个 0.87 是 Curator 用 LLM 算的语义相似度，它跟"功能等价"不是一回事。两个 skill 写得都用"review"这个词、都涉及"质量"，相似度就被拉高，但功能完全不同。看到 0.85 以上的合并记录，建议都人工复核一遍。

**抓手三：Self-Evolution 报告**

如果你接了 `hermes-agent-self-evolution`，它会输出每次优化的报告，内容大致是：

- 这次优化改了哪些 skill 的哪些措辞
- 用了哪些任务做评估
- 优化前后在评估指标上的差异（成功率、token 消耗、调用次数等）

**关键看它优化的是什么指标**。Self-Evolution 默认会用一组指标（成功率、token 数、工具调用数等）做 Pareto 选择。但这些指标**未必是你的真实目标**。比如它可能报告"token 消耗降了 30%"，但你仔细看会发现它把 skill 改得更简短，结果模型在某些边界情况下漏掉了关键步骤，token 少了，准确度也少了。指标错位的问题后面单独展开。

**一个观察的实操节奏**

```
每天  → git status（看前台 patch 有没有乱写）
每周  → git log --since="1 week ago" -p（扫所有改动）
每月  → 看 Curator 日志 + 跑过 Self-Evolution 的话看报告
每季度 → 全量人工审一遍活跃 skill
```

这个节奏看起来累，实际每天那条 `git status` 是秒级的，养成习惯后等于看一眼手表，知道现在几点。真正耗时间的是每周那一次扫 diff，大约 15 到 30 分钟。值得不值得？看你 skill 数量和你愿意承担多大风险。skill 一旦管崩，你重新调回来的成本远高于每周半小时。

## 怎么判断改得对不对：三条标准

观察到了改动，下一步是判断"这个改动对不对"。这是最难的部分。模型自己觉得改对了，未必真对。三条标准，从客观到主观：

**标准一：改的依据可追溯吗**

好的改进，背后一定有具体的事件：某次报错、某个用户纠正、某次失败。比如 skill 里多了句"如果 API 返回 429，等 60 秒重试"，那一定是因为模型在某次任务里真的撞上了 429。这种改进**有依据**，可信。

差的改进，是模型"凭空觉得换个说法更好"。比如把"先检查用户登录状态"改成"在执行任何操作前，请务必验证当前用户的身份认证状态是否有效"。这种改写没有依据事件，纯粹是措辞优化，**多半是无依据改写**，应该撤回。

为什么无依据改写特别有害？因为它会累积。一次"显得更严谨"的改写可能只是行文啰嗦一点，但十次累积下来，原本一句清晰的指令变成了三段式排比加五个限定从句，模型读到自己都走神。skill 的可执行性靠的是清晰、可操作，不是文学性。无依据的措辞优化方向永远是"更长、更书面、更免责"，这恰好和清晰指令反着走。

怎么判断有没有依据：

```bash
# 看这个 commit 前后几天的执行轨迹日志，找对应的事件
grep -r "429\|rate.limit\|too many requests" ~/.hermes/logs/executions/
```

如果日志里能找到对应事件，说明这个 patch 是有依据的。找不到，就是模型自作主张。这个 grep 法不完美（有些事件如用户口头纠正、模型内部反思不一定进 execution 日志），但它是个起点。找不到依据的 patch 不是必须撤，而是必须人工 review 决定留不留，不能默认接受。

**标准二：和你的本意一致吗**

skill 是你设计的流程。模型可能"优化"成一个你根本不想要的方向。比如你写了个 skill 是"代码 review 时先看测试覆盖率"，模型把它"优化"成"代码 review 时先看代码风格"。从模型的角度，这或许能让 review 更快完成（指标更好看），但完全偏离了你的本意。你之所以写"先看覆盖率"，是因为你的团队的代码质量短板在测试而不是风格。

判断方法：把 baseline commit 的版本和当前版本并排对比，问自己一个问题：**"如果是我自己写，我会这么改吗？"** 答案是不会，那就得回头看。

这个标准看似主观，但其实最关键。skill 不是通用的"最佳实践"，是你**特定场景下的特定流程**。模型不知道你的场景约束，它的"优化"是脱离语境的。它会把"先确认是否是测试环境再发邮件"优化成"先发邮件再确认环境"，因为后者少一步，从效率指标看更优。但你的本意是"绝不能在测试环境误发真实邮件"，这个本意模型不知道，它只看到步骤数能减。

**标准三：跑过验证吗**

改完的 skill 在真实任务上效果是变好还是变差？这是终极标准。但这里有个陷阱：

- 前台 patch 和 Curator 整理**通常不做验证**，它们改完就生效，下次任务自然就用新的。等于直接上生产，没测过。
- Self-Evolution **会做验证**，但验证的是它自己选的指标。这个指标对不对，得你来判断。

"直接上生产没测过"这句话值得停一下。在传统软件里，没人敢把一个未测试的修改直接推生产。但在 Hermes 的自我改进里，这是默认行为：前台 patch 写完，下一轮立刻用；Curator 合并完，下次任务就触发新合并的版本。整个系统假设"模型改的总比不改的好"，所以不需要 gate。这个假设正是 Issue #25833 在攻击的核心。

如果你想严肃地验证某个被改过的 skill，得自己搭个评估：

1. 准备 5-10 个该 skill 应该能处理的代表性任务（包括边界情况）。
2. 用 baseline 版本跑一遍，记录结果。
3. 用当前版本跑同样的任务，对比。
4. 看的不仅是"成功了没"，还有"过程对不对"：有没有走你设计的步骤、有没有偷工减料。

这个工作量不小，但关键 skill 值得做。哪些是"关键 skill"？后面"怎么和张力共处"那节会讲分级。

**三条标准合起来**

```
依据可追溯  →  有对应事件吗？日志里查得到吗？
本意一致    →  我自己会这么改吗？
跑过验证    →  真实任务上效果变好了吗？
```

三条都过，放心接受。任何一条不过，进入下面的回滚流程。注意三条标准是"与"关系，不是"或"，一条不过就值得撤回。常见的错误是看到"依据可追溯"就放心了，忽略了"本意一致"和"跑过验证"。有依据的改动也可能跑偏本意：模型撞上 429 是事实，但它加的重试逻辑可能完全不对路（比如该用指数退避时它写了固定 60 秒）。

## 改坏了怎么回滚：完整流程

假设你判断某个 skill 被改坏了。完整回滚流程：

**第一步：定位坏的 skill**

```bash
# 看最近改了哪些
git -C ~/.hermes/skills log --since="3 days ago" --name-only

# 如果是 Curator 合并出的问题，看 Curator 日志找合并记录
# 合并通常会把多个 skill 揉成一个，diff 会很明显
```

**第二步：看具体改了什么**

```bash
# 找到 baseline commit（你手写完那个 skill 时打的 tag）
git -C ~/.hermes/skills log --oneline -- <skill>/

# 看 baseline 到现在的完整 diff
git -C ~/.hermes/skills diff baseline-<skill>-20260601..HEAD -- <skill>/SKILL.md
```

**第三步：撤回到 baseline**

```bash
# 单个 skill 撤回
git -C ~/.hermes/skills checkout baseline-<skill>-20260601 -- <skill>/SKILL.md
git -C ~/.hermes/skills commit -m "rollback <skill> to baseline"
```

如果 baseline tag 不存在（你忘了打），找最早的 commit：

```bash
git -C ~/.hermes/skills log --reverse --format=%H -- <skill>/ | head -1
```

**第四步：防止再被自动改**

撤回不等于结束。不改配置的话，下次 Curator 跑或者前台执行时，它又会改回去。三种锁法，从严到松：

1. **SOUL.md 写禁止自动修改**：在 SOUL.md（或等价的 agent 配置文件）里加一条规则，比如"禁止自动修改 `<skill>` 的 SKILL.md，任何改动必须人工提交"。这是最强的锁。具体语法看你的 Hermes 版本文档。
2. **移出 Curator 扫描范围**：把 skill 从 `~/.hermes/skills/` 移到一个 Curator 不扫的目录，或者用配置文件把它加进 Curator 的 ignore list。
3. **pin skill**：`hermes skill pin <name>`（或对应命令）。但**注意 pin 只挡 Curator，不挡前台 patch**：前面提过，pinned skill 还是会被前台小修小补。所以 pin 不是真正的锁，只能算半锁。

很多用户的回滚失败在这一步：撤回到 baseline，但忘了加锁，过两天发现 skill 又被改回坏的样子，前功尽弃。pin 不挡前台 patch 是最常见的坑，必须配合 SOUL.md 的禁止规则才算真锁。

**第五步：如果是 Self-Evolution 改的**

```bash
# 关掉这个 skill 的 evolution 开关
# 具体命令看 hermes-agent-self-evolution 仓库的 README，通常是在配置文件里把这个 skill 加进 no-evolve list
```

Self-Evolution 的优化结果，如果你发现指标错位（比如 token 少了但准确度也少了），撤回方式同样是 git checkout baseline。但要注意，Self-Evolution 可能改过的不止一个 skill：它通常是批量优化多个 skill，看它的报告确认改了哪些，全部一起撤回。

**回滚流程的 ASCII 总览**

```
定位 → 看 diff → checkout baseline → commit → 配置锁（SOUL.md/移出扫描/no-evolve）
                                                    ↓
                                            验证锁生效（跑一次任务，看 patch 有没有再写进来）
```

最后一步很重要：**锁完要验证锁生效**。跑一次会触发那个 skill 的任务，然后 `git status` 看文件有没有又被改。如果又被改，说明你的锁没起作用，回头看配置。这个验证是必须的：配置文件写错一行、SOUL.md 的规则语法不对、ignore list 路径写错，都会让"锁"形同虚设。你不跑一次任务确认，就不知道锁是真锁还是安慰剂。

## 越改越笨的可能：Issue #25833 的四类失败

到这里都是机制层面的操作。这一节讲为什么"自我改进"这个架构**本质上**有越改越笨的可能，不是 bug，是结构性问题。

GitHub Issue [#25833](https://github.com/NousResearch/hermes-agent/issues/25833) 把这个结构性问题点得很准，原文大意：

> Hermes Agent 的 skill 自动创建/改进系统有结构性缺陷：agent 同时是自己 skill 的**作者、执行者和质量检查员**，没有任何外部 ground truth 校验。

这句话的分量在于：它不是某个具体 bug，是整个架构的张力。pvishalkeerthan 在 [dev.to 的深度分析](https://dev.to/pvishalkeerthan/the-self-trust-problem-in-hermes-agents-skill-architecture-18bi) 里把它叫 **self-trust problem**：系统信任自己的判断，但没有机制验证这种信任是否合理。

类比一下：实习生自己写工作手册，自己照着执行，自己评估自己写得对不对，没人复核。两周后手册变成了什么样子，你猜。这个类比不是危言耸听：很多团队的实际体验就是这样。skill 文件被改得越来越长、越来越绕、越来越像"自我辩护"而不是"操作指南"，但因为没有外部 reviewer，没人喊停。

具体表现，四类失败：

**失败一：错误固化**

第一次执行任务时，模型用了一个次优解法。比如调某个 API 时多查了一次元数据（多花 200 token，慢了 1 秒）。任务"成功"了（用户没抱怨），模型把这次的过程 patch 成 skill，次优解法被固化。之后每次同类任务都按次优来，没人纠正就一直次优。

为什么这个失败难修？因为"次优"和"错误"不是一回事。错误会报错、会被发现、会被改；次优不报错，看起来一切正常，没有任何信号告诉系统"这里有改进空间"。次优解法一旦被 patch 进 skill，就获得了"权威性"：下次执行时它就是默认路径，没人会去质疑"为什么不换个更快的方法"。次优固化的时间越长，影响范围越大：所有同类任务都被多扣了 200 token、多花了 1 秒，一个月下来可能是几千美元和几小时的累计浪费，但因为是均匀分摊在每次任务上，谁都不会察觉。

pvishalkeerthan 的文章给了一个更狠的真实复现：某次 skill 写的时候引用了一个第三方 API endpoint，那个 endpoint 后来失效了（404）。但因为没有任何外部检查机制跟踪这个失败，agent 仍然在用这个 skill 生成指向死链接的代码，**任务静默失败**：错误被 skill 反复"权威化"，没人发现。

复现场景：假设你有个 skill 叫 `third-party-stripe-migration`，里面引用了 Stripe 旧版 API 的某个 endpoint（`/v1/charges/ref`）。Stripe 升级到 `/v2/refunds` 之后，旧 endpoint 返回 404。但 skill 文本没有跟踪机制，下次执行 skill 它还是写 `/v1/charges/ref`。模型在执行时会看到 404 报错，但报错恢复逻辑是"重试两次"，重试也是 404，最后任务以"看起来失败但没崩"的方式结束：生成的代码带了个死链接，用户没立刻发现。一周后用户跑生成的代码，才发现调用失败。这时候你已经基于坏 skill 跑了几十次任务，输出代码全部带死链接，修复成本巨大。

为什么这个难修？因为错误固化的检测需要"外部事实"：Stripe 升级了，这个事实在 Stripe 的 changelog 里，不在你的执行日志里。agent 看不到 changelog，它只看到当下 404，不知道这是"瞬时网络问题"还是"endpoint 永久失效"。所以它的 fallback 是重试，而不是改 skill。要修这个，得引入"外部事实源"：定期检查依赖的 endpoint 是否还有效。而 Hermes 现在没有这个机制。

这种失败的核心是：**"成功"标准太松**。模型觉得"没报错"就是成功，但用户视角的成功是"答得对、做得好"。标准错位导致次优解法被当成功固化。

**失败二：风格漂移**

Curator 合并 skill 时会把两个语义相近的 skill 揉成一个。但"语义相近"是 Curator 这个 LLM 判断的，它未必理解两个 skill 在不同语境下的差异。

Reddit r/hermesagent 上贴过的真实案例：一个叫 `code-review` 的 skill（针对代码质量）和一个叫 `doc-review` 的 skill（针对文档准确性），Curator 觉得"都是 review"就合并了。合并后的 skill 在两个场景下都不准：代码 review 时跑去检查文档格式，文档 review 时跑去跑 linter。

复现场景更具体。`code-review` skill 的步骤原本是：拉 git diff → 跑 eslint/prettier → 检查测试覆盖 → 给 review 意见。`doc-review` skill 的步骤是：读文档全文 → 检查术语一致性 → 检查示例可运行性 → 给修改建议。两个 skill 共享"review"这个动词，开头都是"读内容"，Curator 用 LLM 算语义相似度时给到 0.86，超过合并阈值 0.85，触发合并。合并后的 skill 把两套步骤揉成"读内容 → 跑 linter + 检查术语 + 检查示例 + 检查测试 → 给意见"。下次跑 code review 时，模型开始检查文档术语一致性（代码 review 不需要这个）；跑 doc review 时，模型开始跑 eslint（文档没有 eslint 概念，会报错或者误把代码片段当源码跑）。

这种失败比错误固化更阴险，因为它**不会报错**。任务还是"成功"完成，只是结果质量持续下降。用户可能用了一个月才发现"诶，怎么最近 code review 的反馈越来越不靠谱了"，回头一看 skill 早被合并成一个四不像了。等用户发现时，一个月累积的 code review 反馈质量都已经下降，这种隐性损失没法追回。

为什么这个难修？因为"语义相似 ≠ 功能等价"。LLM 算相似度是基于词频和上下文共现，它捕捉不到"这个 skill 是给代码用的"和"这个 skill 是给文档用的"这种语境边界。要修这个，Curator 需要在合并前检查两个 skill 的"触发场景标签"：它们是不是同一个领域、同一类对象、同一类操作。但目前 Curator 的合并逻辑没有这一步，纯粹靠 LLM 判断"看起来像不像"。所以它会持续误合并，只要你的 skill 库里有名字相近但功能不同的对子。

**失败三：指标错位**

Self-Evolution 用 GEPA 做进化搜索，GEPA 选的是 Pareto 前沿上的解，多个指标之间权衡。但**指标的选择本身就是个判断**。Self-Evolution 默认的指标通常是：

- 成功率（任务有没有完成）
- token 消耗（越少越好）
- 工具调用次数（越少越好）
- 步数（越少越好）

问题来了：**这些代理指标（proxy metric）和你的真实目标（answer quality）未必一致**。

举个具体的例子。你有个 skill 是"分析 GitHub issue 并给出修复建议"。Self-Evolution 优化它，发现把"先复现 bug、再读相关代码、最后给建议"这个流程压缩成"直接读 issue 标题就给建议"，token 降了 60%，工具调用从 5 次降到 1 次，"成功率"（用户接受了建议）差不多。从指标看，这是巨大改进。

但实际质量呢？建议的深度和准确性都下降了。用户之所以"接受"，是因为他们没有更好的对照，或者因为简单 issue 占多数、把复杂 issue 拖累了平均质量这种统计假象。简单 issue 一句话就能修，跳过复现也能蒙对；复杂 issue 需要复现和读代码，跳过这步就瞎猜。如果评估集里 80% 是简单 issue，压缩流程在 80% 上拿到 95% 成功率，在 20% 复杂 issue 上掉到 30% 成功率，平均还有 80%，看起来"差不多"。但那 20% 复杂 issue 才是真正吃工时的部分，掉到 30% 意味着用户要在事后花大量时间修模型瞎猜的建议。这种质量退化不会进报告，因为报告只看平均成功率。

GEPA 论文（[arXiv 2507.19457](https://arxiv.org/abs/2507.19457)）本身讲得很清楚：GEPA 优化的是你**给它的指标**，不是你**真正想要的**。它报告"比 GRPO 提升 10-20%、rollout 少 35×"，那是在它评估的 benchmark 上。换成你的真实场景，benchmark 的指标未必映射到你的真实目标。这是所有优化算法的通病：**优化器只对它看得见的指标负责**。

为什么这个难修？因为"真实目标"通常是隐式的、定性的、难以写成指标的。"建议质量好不好"这种判断需要人来看，而 Self-Evolution 是无人参与的自动优化。要修这个，得在优化回路里加 human-in-the-loop：每轮 GEPA 选出 Pareto 前沿后，由人工标注"哪些变体真的更好"，而不是只看代理指标。但这又把"自动优化"变回了"半自动辅助"，违背了 Self-Evolution 卖点本身。所以这是个产品定位层面的张力，不是加个开关能解决的。

更阴险的是指标错位有"反向拟合"倾向。GEPA 跑的轮次越多，skill 文本越往代理指标方向偏：token 越压越短、步骤越砍越少，最终 skill 变成"读标题就给答案"的极简版本，平均指标漂亮，真实质量崩坏。这个过程是不可逆的（除非撤回 baseline），而且越优化越偏离真实目标。这就是为什么 Self-Evolution 不能"开足马力让它一直跑"：跑得越久，skill 离你的真实需求越远。

**失败四：Self-Evolution 静默失败**

pvishalkeerthan 的 dev.to 文章专门点了这个：Self-Evolution 这个模块**自己也会静默失败**。它跑完一轮优化，报告"指标提升了 X%"，但如果中途某步出错（API 调用失败、JSON 解析失败、候选变体生成为空），它会**带着部分失败的结果继续跑**，最后给你一个看起来成功但实际不完整的报告。

复现场景：Self-Evolution 跑一轮优化，本应生成 20 个候选 skill 文本变体。第 7 个变体生成时 LLM 调用超时，返回空字符串；第 13 个变体生成时 JSON 解析失败，被丢弃；最终实际只有 18 个变体进入评估。这 18 个里有几个是劣质变体（因为生成时上下文不全），但 Self-Evolution 没标记这次失败，它把 18 个变体当作"完整 20 个"来算 Pareto 前沿。最终选出的"最优"变体，可能在一个 20 变体的完整集合里根本不在前沿，只是因为少了那 2 个，它"显得"在前沿。报告写"成功率提升 12%"，实际可能只提升了 5% 甚至更低。你不知道，因为报告不会告诉你"这次少跑了 2 个候选"。

更隐蔽的是：Self-Evolution 的优化结果依赖执行轨迹。如果输入的轨迹本身就**有偏**（比如某段时间你主要做简单任务），GEPA 选出来的"最优"skill 文本，是针对那段简单任务最优的：遇到复杂任务可能更差。但报告里只会说"在评估集上提升了 X%"，不会告诉你评估集本身有偏。这种偏差的影响是结构性的：你那段时间因为赶 deadline 都在做重复性简单任务，Self-Evolution 学到的是"简单任务的最优解"，把它推到所有任务上，复杂任务的质量反而退化。

为什么这个难修？因为 Self-Evolution 是优化器，优化器本身没有"自我怀疑"机制。它跑完一轮就报告结果，结果好不好的"对账"只能靠外部：你拿着它给的"提升 12%"报告，没法独立验证这个 12% 在你的真实场景下成立。要修这个，需要在 Self-Evolution 跑完之后做"第三方评估"：用一套独立于 GEPA 评估集的测试集，跑一遍优化前后的 skill，看真实任务上的差异。但这又需要你维护一套独立的评估集，工作量不小。

这是 self-trust problem 的极端形态：**连改进系统本身的可靠性，都没有外部校验**。

**四类失败的共同根源**

```
错误固化   ←  "成功"标准太松，没有外部 ground truth
风格漂移   ←  Curator 是 LLM，判断"语义相近"会错
指标错位   ←  GEPA 优化代理指标，不是真实目标
Self-Evolution 静默失败  ←  改进系统本身也没被监督
```

四类失败，根源都是同一个：**author = executor = reviewer，没有任何外部独立的一方来校验**。这不是 Hermes 团队能修的 bug，是"agent 自我改进"这个架构的固有张力。要消除这个张力，唯一办法是引入外部 ground truth，而这通常意味着人工 review，意味着自我改进不再是"全自动"的。

这个张力其实不新鲜。传统软件工程里"开发者自己写自己测自己审"也是同样的反模式，所以才有 code review、QA、生产灰度这些机制。Hermes 的自我改进本质上是在重蹈这个反模式，只是参与者都换成了 LLM：LLM 写、LLM 执行、LLM 评审，三种角色共享同一个模型的偏好和盲点。模型不会因为换了个角色就获得独立的判断力，它的局限是结构性的。理解这一点，你就明白为什么不能把自我改进当全自动升级系统。

## 怎么和这个张力共处：分级、锁死、定期审

读完上面你可能会想：那这功能是不是干脆别开？这反应过头了。完全关掉自我改进，等于放弃 Hermes 最大的卖点之一：agent 用得越久越懂你。务实的做法是**分级管理**：哪些 skill 开自动改进、哪些锁死、哪些定期人工审。

**关键 skill 锁死**

哪些是"关键 skill"：

- 你已经手写调顺、反复验证过、效果稳定的 skill
- 涉及生产环境写操作的 skill（部署、删数据、发邮件）
- 你特有的工作流，模型不理解的场景约束

这些 skill 严格锁死，禁止任何自动修改。锁法前面讲过：SOUL.md 写禁止规则，或者移出 Curator 扫描范围。**不要只用 pin**，pin 挡不了前台 patch。

锁死的关键 skill，迭代方式是纯手动：你看 diff、你判断、你写改动、你 commit。等于把它当成生产代码对待。Medium 上 sathishkraju 那篇 *Your Hermes Agent Has No Performance Review* 就是这个思路：skills 目录 = 代码仓库，该有 review、该有 CI、该有版本管理。这种心态下，关键 skill 的每次改动都过你的眼睛，没有"模型自作主张"的空间。

**低风险 skill 开自动改进**

哪些适合开：

- 探索性的、临时性的 skill（一次性任务用的）
- 错了也不会造成损失的 skill（查询、汇总、生成草稿）
- 你刚开始用、还没调顺、需要模型帮你跑出大致形态的 skill

这些 skill 开自动改进 + 定期（比如每周）扫一眼 diff，发现问题就撤回。损失可控，收益是省你的迭代时间。

低风险 skill 开自动改进有一个隐藏收益：你能从模型的 patch 里学到东西。模型在执行中发现的"参数写错了"、"endpoint 迁移了"这些事，是你自己写 skill 时不知道的。把这些 patch 收编进你的认知，下一次你写别的 skill 时会避坑。所以低风险 skill 不锁死，等于让模型当你的探索助手，把发现的事项反馈给你。

**Self-Evolution 单独分级**

Self-Evolution 因为是批量优化、影响大、不一定能撤干净，建议**默认关闭，只在显式触发时跑**。跑之前：

1. 选一小批低风险 skill 做实验
2. 跑之前 baseline 打 tag
3. 跑完看报告，重点关注**指标有没有错位**
4. 在你的真实任务上验证，而不是只信它给的 benchmark
5. 发现问题立即 checkout baseline，并把这几个 skill 加进 no-evolve list

Self-Evolution 的策略要更保守，因为它的改动批量、幅度大、且自带"看起来很科学"的报告。人很容易被报告里的"提升 X%"说服，忘了检查 X% 提升的是不是你真正想要的指标。所以跑之前要问自己一个问题：这次的评估指标，是不是真的反映我想要的"好"？如果不是，跑了反而比不跑更糟：它会朝错的方向偏移你的 skill。

**定期人工审的节奏**

```
每周  → 扫 git log，看所有自动改动
每月  → 评估关键 skill 有没有被"漏网"动过（即使锁了也要查）
每季度 → 全量审活跃 skill，问一遍"这个 skill 现在还符合我的本意吗"
```

每周扫 diff 的具体做法：找一个固定时间（比如周五下午），打开终端跑那条 `git log --since="1 week ago" -p`，从头翻到尾。看到不认识的 commit message、不熟悉的改动，停下来。这些就是"模型自作主张"的地方，需要你判断要不要保留。

每月那次的"评估锁有没有漏网"特别重要。锁不是设了就永久有效：Hermes 升级、配置文件被改、SOUL.md 规则语法变化，都可能让原本生效的锁失效。所以即使锁死了关键 skill，每月也得跑一次 `git log --since="1 month ago" -- <关键skill>/`，确认没有任何自动 commit 进来。如果有，说明锁破了，要查为什么破、怎么补。

**不期待全自动**

最重要的一条心态调整：**把 self-improvement 当"草稿助手"，不是"自动升级系统"**。

它给的修改建议你来批，不是它改了就直接上。这种心态下，自我改进是省时间的工具：模型帮你起草改动、标注可能的优化点，你做最终判断。一旦你期待它全自动、自我进化、无人值守，你就掉进了 Issue #25833 描述的结构性陷阱：author = executor = reviewer，没人复核。

"草稿助手"这个比喻很关键。人类写作者用写作助手时，从来不会把助手给的修改直接接受，都是看一遍、判断、改一改、再接受。Hermes 的自我改进也该是这个流程：模型给 patch 草稿，你看 diff、判断本意对不对、决定接受还是撤回。区别只在于人类助手有同理心和语境，LLM 助手只有概率和模式。所以你对它的输出该有更深的怀疑，不是更浅。

## 什么时候开自动改进 / 什么时候锁死：ASCII 决策树

把上面所有判断浓缩成一棵决策树，遇到新 skill 时照着走：

```
新 skill 写完
    │
    ├─ 这个 skill 错了会造成损失吗？（生产写操作、删数据、发邮件）
    │       │
    │       YES → 锁死（SOUL.md + 移出 Curator 扫描），永远手动迭代
    │       │
    │       NO ↓
    │
    ├─ 这个 skill 我已经调顺、反复验证过吗？
    │       │
    │       YES → 锁死，避免被自动改坏
    │       │
    │       NO ↓
    │
    ├─ 这个 skill 是探索性 / 临时性 / 低风险的吗？
    │       │
    │       YES → 开自动改进 + 每周扫 diff
    │       │
    │       NO ↓
    │
    ├─ 这个 skill 涉及我特有的工作流 / 场景约束吗？
    │       │
    │       YES → 锁死，模型不懂你的语境
    │       │
    │       NO → 可以开自动改进，但每月评估一次是否符合本意
    │
    └─ Self-Evolution：默认关。只在低风险 skill 上手动触发跑实验
```

这棵树的内核：**风险高的锁死，风险低的开但定期看，Self-Evolution 永远手动触发**。三个分支的判断顺序也有讲究：先看"会不会造成损失"（最严的红线），再看"调顺了没"（保护已成型资产），最后才看"低不低风险"（决定能不能开自动改进）。顺序不能反，先看低风险就可能把"调顺的关键 skill"误开自动改进。

## 和第 5、7、8 篇的衔接

这篇专拆自我改进机制。要把它放回系列里看：

- **第 5 篇**讲 learning loop 的完整生命周期，本篇的"前台 patch"和"后台 Curator"就是 learning loop 的两个执行环节。如果你对 learning loop 整体还不熟，先看第 5 篇再回来。
- **第 7 篇**讲怎么手写 skill，本篇的"baseline commit"思路、git 仓库建法、SOUL.md 锁的写法，都依赖第 7 篇搭的基础。
- **第 8 篇**讲 Hub，本篇没展开 Hub，但如果你从 Hub 装来的 skill，要注意：**Hub skill 也会被本地自动改进**。装来的不是只读的，前台 patch 和 Curator 都会动它。Hub skill 建议也锁死或定期审。这条容易被忽略：很多人觉得"从 Hub 装来的就是稳定的成品"，实际上落地到本地立刻进入自我改进循环，跟你自己手写的 skill 走同一条命运曲线。

## 权衡：省迭代 vs 接受不透明

self-improvement 的交易：**省手动迭代 vs 接受不透明的自动修改**。

完全开 = 省事，但你要承担 Issue #25833 描述的四类风险（错误固化、风格漂移、指标错位、Self-Evolution 静默失败）。这些风险不是概率事件，是**必然发生**的，只是发生得慢、不显眼。等你发现时，skills 目录可能已经面目全非。

完全关 = 安全，但失去 Hermes 最大的卖点之一。agent 用了一个月和用了一周没区别，每次任务都从头来，没有积累。

务实做法是中间路线：**分级**。低风险 skill 开自动改进 + 定期审，高风险 skill 锁死手动。把 self-improvement 当需要监督的实习生，不是当自动升级系统。

这个权衡的另一层是"认知成本"vs"维护成本"。锁死多了，认知成本低（你心里有数哪些 skill 是稳的），但维护成本高（每个改动都得你手动）；开自动多了，维护成本低（模型自己迭代），但认知成本高（你得持续盯 diff 防止走偏）。两条路都有代价，分级管理是把这两条路的代价分摊到不同的 skill 上：核心的、你愿意花时间的，锁死；边角的、试验性的，开自动。

## 结论

skill 自我改进是 Hermes 最该被怀疑也最有想象力的功能。

最该被怀疑，是因为它没有外部 ground truth：agent 同时是作者、执行者、评审者，author = executor = reviewer 的结构性问题，注定了它会越改越偏，只是偏得慢、偏得不显眼。

最有想象力，是因为它确实能让 agent 用得越久越懂你，前提是你**会管它**。

会用的人 = 三件事都做到的人：

1. **会观察**：`git diff` 是你最可靠的眼睛，每周扫一次 diff，养成习惯。
2. **会判断**：三条标准（依据可追溯、本意一致、跑过验证）。任何一条不过，进入回滚流程。
3. **会回滚**：baseline commit + checkout + SOUL.md 锁死关键 skill。锁完要验证锁生效。

做到这三件，自我改进就是省时间的工具。做不到，就是把 skills 目录的命运交给一个会自我感动但没有外部校验的系统。

最后一句话：**把自我改进当需要监督的实习生，不是当自动升级系统**。实习生写的草稿，你来批。批了才上，不批就是草稿。这个心态能让你既享受到自我改进的便利，又不掉进结构性陷阱。

## 延伸阅读

- [GitHub Issue #25833：self-created skills 结构性批评](https://github.com/NousResearch/hermes-agent/issues/25833)
- [dev.to pvishalkeerthan：The Self-Trust Problem in Hermes Agent's Skill Architecture](https://dev.to/pvishalkeerthan/the-self-trust-problem-in-hermes-agents-skill-architecture-18bi)
- [GitHub Issue #429：Skill Lifecycle Quality, proactive patching noise](https://github.com/NousResearch/hermes-agent/issues/429)
- [hermes-agent-self-evolution 仓库（DSPy + GEPA 独立模块）](https://github.com/NousResearch/hermes-agent-self-evolution) · [PLAN.md](https://github.com/NousResearch/hermes-agent-self-evolution/blob/main/PLAN.md)
- [GEPA 论文 arXiv 2507.19457：Reflective Prompt Evolution Can Outperform Reinforcement Learning](https://arxiv.org/abs/2507.19457) · [gepa-ai/gepa 代码](https://github.com/gepa-ai/gepa)
- [Towards AI：Hermes Agent Doesn't Learn. It Mutates Strings.](https://pub.towardsai.net/hermes-agent-doesnt-learn-24fb958f18d7)
- [Medium sathishkraju：Your Hermes Agent Has No Performance Review](https://medium.com/@sathishkraju/your-hermes-agent-has-no-performance-review-heres-how-to-fix-that-92254efdfe18)
- [Reddit r/hermesagent：Curator 合并 skill 出问题的真实案例](https://www.reddit.com/r/hermesagent/comments/1t9smfc/the_skill_curator_feature_in_hermes_agent_has_a/)
- [X / Akshay Pachaar：self-evolving skills, pinned skill 也会被 patch](https://x.com/akshay_pachaar/status/2056050422872465775)
- [第 5 篇：闭环学习总览](./05-learning-loop-overview.md) · [第 7 篇：手写 skill](./07-write-first-skill.md) · [第 8 篇：Hub](./08-skills-hub-usage.md)
