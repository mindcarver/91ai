# Lenny's Newsletter 深读：新手怎么在 Claude Code 和 Codex 里把 loop 跑起来

## TL;DR

Lenny's Newsletter 这篇《How I AI: How to Write AI Agent Loops in Claude Code and Codex》（2026-06-22，主讲为 ChatPRD 创始人 Claire Vo 和 Mozilla distinguished engineer Brian Grinstead）是 loop engineering 所有公开资料里最接地气的新手入口。它做了三件别的文章不做的事：

- 把 loop 去神秘化成一句话："一个会自己触发自己的 prompt"。
- 把 loop 按**触发方式**拆成四类——heartbeat、cron、hook、goal——并直接映射到 Claude Code 的 `/loop`、`/schedule`、hooks 和 Codex 的 `/goal`、Automation tab 的按钮级对照。
- 给了一个真实生产级 verifier 案例：Mozilla 一个月用 loop harness 提交 **423 个 Firefox 安全 fix**。

主线一句话：新手别先纠结理论，先按"你想让这个 loop 怎么醒过来"选工具按钮，再把 loop prompt 当成一份员工 JD 来写。这篇深读把这套入门方法拆透，并诚实指出它没覆盖 worktree 隔离、STATE.md、并发锁这些工程硬骨头。

## 为何值得为这篇单独写一篇深读

loop engineering 这块资料大致分两派。一派是理论框架派，代表是 Addy Osmani、LangChain、Anthropic 那批——讲五个原语、maker/checker 分离、agent runtime，适合建认知。另一派是实操落地派，但多数要么贴一段 prompt 就完事，要么只盯着某一个产品的 UI。

Lenny 这篇的独特位置在于：它是**新手实操向**的，同时**横跨两个主流工具**（Claude Code 和 Codex），并且它给的对照粒度是按钮级的——heartbeat 对应 `/loop`、cron 对应 `/schedule`、hook 对应 hooks、goal 对应 `/goal`。这个粒度的对照表，在其余十几篇公开资料里都找不到。

它还有两个别的来源给不了的东西。第一是递归 subagent 的第一手 demo：Codex 里的 skills loop 会为每个候选 skill 派两个具名 subagent 各自跑 goal loop，这是"loop 产 loop"最具体的公开例子。第二是 Mozilla 那个真实在跑的 harness，带具体数字（423 个 fix、14 次尝试才成功的 bug、两段式 verifier）和可复刻的架构，不是概念图。

对新手来说，从这篇切入比从 Addy Osmani 那篇切入要低门槛得多。Addy 那篇读完你会知道 loop 是什么，但可能不知道第一步该按哪个按钮。这篇读完，你至少知道：如果你想每天定时跑，按 Claude Code 的 `/schedule`；如果你想做"跑到目标为止"的自动修复，用 Codex 的 `/goal`，并且你会知道为什么 goal loop 是最容易烧钱的那一类。

需要先说明：这篇深读会复述原文的核心判断，也会补原文没讲但新手绕不开的内容（worktree 隔离、状态持久化、并发锁）。原文实操 prompt 的完整版本需要去 chatprd.ai 看（邮件 recap 没贴全文），本篇会把已公开的关键句和命令路径整理出来。

## 心智模型：先把 loop 降维成"一个会自己触发自己的 prompt"

### 一句话定义

邮件里 Claire Vo 给的定义是整篇最值得记住的一句话：

> "A loop is just a prompt that fires itself, nothing more exotic than that."

这句话的好处是它把新手最大的心理障碍拆掉了。很多人听到 loop engineering 会以为这是一个新框架、新 SDK、新范式。Claire 的意思是：heartbeat、cron、webhook 这三样东西，软件工程师用了几十年。你以前用 cron 每天凌晨跑一个数据备份脚本，现在你用 cron 每天上午 10:15 让一个 AI agent 去扫一遍 PR 状态。机制是同一个机制，只是被触发的东西从"批处理脚本"换成了"AI agent"。新意只在于这一步替换。

所以 loop engineering 的入门门槛不在"学新东西"，而在"把已有的老工具指向一个新对象"。这个认知一旦建立，后面所有按钮对照就都顺了。

### 用三种老东西来类比触发方式

邮件把 loop 按"触发方式"分四类。为了帮新手记牢，可以用生活里三种老东西来对应前三个，第四个 goal 比较特殊单独讲：

- **heartbeat（心跳）像闹钟**：固定间隔响一次，秒级或分钟级。你定每 5 分钟响一次，它就每 5 分钟叫醒一次 agent 去看一眼某个状态。Claude Code 的 `/loop` 就是这个闹钟。
- **cron 像日历提醒**：按日历时间触发，不是按间隔。每周五上午 10 点、每月 1 号、每天 10:15 这种。Claude Code 的 `/schedule`、Codex 的 Automation tab 都是日历提醒。
- **hook 像门铃**：不是按时间响，是有人按了才响。具体到工程里，就是某个事件发生——PR 被合并、一个 commit 推上来、一个 issue 被创建——门铃一响，agent 启动。Claude Code 的 hooks 就是门铃。
- **goal 像计时赛**：这一类跟前三个本质不同。前三个是"什么时候开始"，goal 是"什么时候结束"。goal loop 不按时间停，按"目标达成"或"卡住了"才停。一个 goal loop 可能跑 5 分钟，也可能跑 5 小时，取决于 verifier 什么时候点头。Codex 的 `/goal` 就是计时赛的终点裁判。

闹钟、日历提醒、门铃这三个都是你早就熟悉的东西。把它们指向 agent，就是 heartbeat/cron/hook loop。计时赛是第四种，它的风险也跟前三个完全不同，下面专门讲。

### 把 loop prompt 当员工 JD 来写

这是邮件里对新手最实用的一句话级方法。Claire 把 loop prompt 等同于一份新员工 onboarding 的岗位描述：

> "Think about loops the way you think about onboarding an employee. Define the job: what they check, how often, what output you want, and who to contact when something's wrong. 'Every Friday at 10 a.m., review all merged PRs and identify skills our agents are missing' is a job description. It's also a loop prompt."

这段话的关键是它点出了 loop prompt 必须包含的四要素：

- **查什么**（what they check）——agent 每次醒来要看的输入是什么。
- **多久查一次**（how often）——这就是触发方式，对应 heartbeat/cron/hook。
- **要什么输出**（what output you want）——是报告、是 PR、是 Slack 通知，必须明确。
- **出问题找谁**（who to contact）——agent 自己搞不定时升级路径。

这四要素其实就对应了 loop engineering 通用框架里的 schedule + verifier + connector + human gate。Claire 没用这些术语，但她用"JD"这个比喻把同样的东西讲给了不懂框架的新手。这是这篇最值得传播的部分。

## 详细机制：四类触发方式 × 两个工具的按钮对照

下面把四类触发方式逐个拆开，配 Claude Code 和 Codex 的具体按钮。这张对照表是本篇的核心，也是原文最实操的部分。

### Loop 类型四分法总表

| 类型 | 触发方式 | 谁负责停 | Claude Code 按钮 | Codex 按钮 |
| --- | --- | --- | --- | --- |
| Heartbeat | 周期性心跳（秒/分钟级） | 时间窗 | `/loop` | （需用 cron 表达式近似，无原生 heartbeat） |
| Cron | 定时（天/周级，如 10:15 a.m. / 每周五 10 a.m.） | 日历 | `/schedule` | Automation tab |
| Hook | 事件驱动（PR 合并、commit、issue 创建） | 事件闭合 | hooks（`PostToolUse` 等） | （需结合外部 webhook + Automation） |
| Goal | 目标达成或卡住才停 | verifier | （需手工拼，subagent + 自定义 verifier） | `/goal`（配合 OpenAI goal-writing guide） |

注意第三列"谁负责停"——这是四类 loop 最本质的差别。前三类的停止条件是时间或事件，相对可控。第四类 goal 的停止条件是"目标达成"，而"达成"是否成立要靠 verifier 判断，这就是 goal loop 容易失控的根源。

### 第一类：heartbeat loop（`/loop`）

heartbeat 是最简单的 loop。它每隔固定时间触发一次 agent，跑完就睡，到点再醒。典型间隔是 5 分钟、10 分钟、30 分钟。Claude Code 里对应的命令是 `/loop`。

适合 heartbeat 的场景是"需要持续盯一个会变的状态"。比如：

- 盯一个 CI run，每 5 分钟看一次，绿了就通知，红了就尝试修。
- 盯一个 PR 的 merge check，每 10 分钟看一次，全绿就合，失败就报。
- 盯一个 deploy 的进度，每 30 分钟看一次，完成或卡住就升级。

heartbeat 的特点是**时间窗短、单次任务轻**。它不适合做"扫一遍整个仓库"这种重活——间隔太短，前一轮还没跑完后一轮就被触发了，会撞车。

Claude Code 里 `/loop` 的典型用法（参考系列第四篇跨工具映射）：

```
/loop 5m 看 CI run #1234，绿了在 #deploy 通知，红了尝试修 .env.example 这种安全文件
```

这个命令背后的意思就是：每 5 分钟（heartbeat）醒一次，每次跑那个 prompt。新手从 heartbeat 起步的好处是它最直观——你设个 5 分钟，过 5 分钟就能看到 agent 动一次，反馈快。

### 第二类：cron loop（`/schedule` 和 Automation tab）

cron 比 heartbeat 间隔更长，按日历时间触发，不是按固定间隔。典型是每天、每周、每月。Claude Code 里是 `/schedule`，Codex 里是 Automation tab。

邮件给了一个具体的 cron 例子，是 Claire 在 Claude Code 里搭的 PR review loop：

- **触发**：每天上午 10:15（cron）。
- **行为**：扫所有 aging PR → 给每条 PR 派一个 subagent 当保姆 → 跑到 merge check 全绿为止。
- **双分支**：能自动修就修；不能修就总结并通知团队（邮件原话"alerts your team four ways"，即四条 alert 路径）。

这个例子比 heartbeat 重得多——它不是盯一个状态，是每天把整片 PR 列表都过一遍。所以它用 cron 而不是 heartbeat：一天一次足够，每 5 分钟跑一次会浪费 token 也会把 PR review 的工作切成碎片。

cron loop 的特点是**间隔长、单次任务重、产出要明确**。它的 prompt 必须像一份正式的 JD，因为每次跑完都要产出能让人看的东西（一个总结、一个 PR、一个 Slack 消息）。Claude 的原话提醒：

> "Every Friday at 10 a.m., review all merged PRs and identify skills our agents are missing" is a job description. It's also a loop prompt.

注意这句里的"Every Friday at 10 a.m."——这是 cron；"review all merged PRs"——这是查什么；"identify skills our agents are missing"——这是要什么输出。一份合格的 cron loop prompt 就是这么具体。

Codex 的 Automation tab 是同一类东西的不同产品形态。邮件里讲的第二个 workflow——Codex 的 skills loop——就是用 Automation tab 跑的：

- **周期**：每周一次（扫最近一周的 commits / PRs / comments，邮件说"≈ one week of commits is reasonable"才够数据量）。
- **行为**：识别团队 agent 缺失的 skill → 为每个候选 skill 派两个**具名 subagent**各自跑 goal loop 实时验证。

这个例子是 cron 触发 + goal 执行的复合体：外层用 cron 每周叫醒一次，内层对每个候选项 spawn 一个 goal loop。这是"loop 产 loop"的具体形态，下面在 goal loop 部分还会展开。

### 第三类：hook loop（hooks）

hook 不是按时间触发，是按事件触发。门铃模式。Claude Code 的 hooks 系统允许你在特定事件发生时启动 agent——比如 `PostToolUse`（一个工具用完之后）、`Stop`（agent 准备停下时）、`PreToolUse`（一个工具要用之前）。

hook loop 适合"事件闭合"型任务。典型场景：

- 一个 PR 被合并 → hook 触发 → agent 跑一遍 changelog 草稿生成。
- 一个 commit 推上来 → hook 触发 → agent 跑一遍 lint 和类型检查。
- 一个 issue 被创建 → hook 触发 → agent 跑一遍 triage 分类。

hook 比 cron 的好处是**反应快、不打扰**——没有事件时 agent 完全不动，事件一来立刻响应。坏处是**它依赖事件源稳定**——如果你的 webhook 链路断了，hook loop 就哑了，而你可能很久都不知道。

邮件里没有花大篇幅讲 Claude Code hooks，这是它的一个盲区。新手如果要做 hook loop，建议先确认两件事：第一，事件源是什么（GitHub webhook、本地 git hook、CI 事件）；第二，事件来了 agent 要做什么、做完怎么收尾。hook loop 的 prompt 同样要按 JD 四要素来写，只是"how often"那一栏换成"什么事件触发"。

Codex 这边原生 hook 体验不如 Claude Code 直观，通常需要用外部 webhook + Automation 来近似——这是两套工具在 hook 维度上的真实差距。

### 第四类：goal loop（`/goal`）——最容易烧钱的一类

goal loop 是四类里最特殊、最强大、也最危险的一类。它不按时间停，按"目标达成"停。Codex 的 `/goal` 是这一类的原生按钮，Claude Code 这边需要手工拼（用 subagent + 自定义 verifier）。

goal loop 的逻辑是：你给 agent 一个目标（"把所有 lint 错误修掉"、"让测试从红变绿"、"把这个 fuzzing 目标真的搞 crash"），agent 就一直跑、一直试，直到 verifier 认为达成，或者 agent 自己卡住。

它的力量在于**让 agent 干"反复尝试"的活**。Brian Grinstead 在邮件里讲了 agent 在安全 fuzzing 上的优势：

> "Agents will try 14, 15, 20 different approaches to trigger a bug without getting tired or losing focus."

他举了一个具体例子：Mozilla 找到过一个 bug，agent 试了 **14 次**才成功触发。换成人，试到第 5 次基本就放弃了，或者开始走神。Brian 的原话是这句，值得记住：

> "Cognitive energy declines over time in a way that agents don't."

这就是 goal loop 的价值上限——它把人最容易在"反复尝试"这件事上消耗的认知能量，外包给了一个不会累的东西。

但 goal loop 也是邮件明确警告最危险的一类。Claire 直接说：

> "Loops get expensive if you don't write them carefully."

失败模式很具体：**模糊的成功标准 → agent 永远跑、永远烧 token**。如果 verifier 的判断标准写得不严（比如"让代码更好"这种没法判对错的目标），goal loop 就会变成 token 黑洞。这也是为什么 Codex 的 `/goal` 会配一份 OpenAI goal-writing guide——goal 怎么写，决定了这个 loop 是干 5 分钟就收工，还是干 5 小时还停不下来。

goal loop 的新手入门建议是：**先别碰**。在 heartbeat、cron、hook 都跑顺之前，不要上来就用 goal loop。原因有二：第一，goal loop 的成本不可预测，前三种的成本是 cadence × 单次成本，是线性的，goal loop 不是；第二，goal loop 对 verifier 质量要求最高，verifier 写不好整个 loop 就废了。新手先把 cron loop 跑顺，把 verifier 的写法练熟，再升级到 goal loop。

### Claude Code vs Codex 按钮对照速查

把上面四类压成一张速查表，新手对着这张表选工具：

| 你想做的事 | 触发类型 | Claude Code | Codex |
| --- | --- | --- | --- |
| 每 5 分钟盯一次 CI | heartbeat | `/loop 5m` | cron 表达式 `*/5 * * * *` + Automation |
| 每天定时 review PR | cron | `/schedule` | Automation tab |
| 每周扫一遍识别缺失 skill | cron + 内层 goal | `/schedule` + subagent | Automation + `/goal` |
| PR 合并后自动起 changelog | hook | hooks（`PostToolUse`） | 外部 webhook + Automation |
| 跑到目标达成为止 | goal | 手工拼（subagent + verifier） | `/goal` |

这张表是这篇深读最想让你带走的东西。新手最大的困惑常常是"我知道我要做什么，但不知道按哪个按钮"。对着这张表，先问自己"我想让它怎么醒过来"，就能落到具体命令。

## Mozilla Firefox 案例：一个真实在跑的 verifier-heavy harness

邮件第二段是 Brian Grinstead（Mozilla distinguished engineer）讲他们怎么用 AI agent harness 在一个月里提交 **423 个 Firefox 安全 fix**。这是整篇里最硬核的部分，也是 loop engineering 在公开资料里少见的带具体数字的生产级案例。

### 最关键的一句判断

Brian 给的最重要判断是这句：

> "The real unlock wasn't just a better model, but the custom harness around it."

这句话和 loop engineering 通用框架里"verifier / harness engineering"的判断完全吻合。换句话说，Mozilla 这 423 个 fix 不是靠某个新模型刷出来的，是靠在模型外面包的那层 harness 实现的。模型是同一个模型，harness 是 Mozilla 自己写的。

这个判断对所有想用 loop 的人都有用：**你能不能跑出 Mozilla 这种结果，瓶颈不在你用的是哪个模型，而在你能不能写出像样的 harness**。harness 是 model 之外那层"喂什么、验什么、停在哪、升给谁"的工程外壳。

### Harness 是什么

Brian 给的定义很简单：

> "It's actually a reasonably simple wrapper around it. You just need to give it access to the right tools for the job."

他建议用 vendor SDK（Claude agent SDK、OpenAI agent SDK）而不是第三方框架，理由是：

> "Models are likely post-trained to work best with their own infrastructure."

这是个有争议的建议（vendor lock-in 和生态多元的张力，后面权衡章节会展开），但对新手来说它的可操作价值在于：**第一版 harness 用 vendor SDK 写就行，别一上来就挑框架**。框架是后期优化，前期 SDK 够用。

### 两段式 verifier：maker/checker 分离的教科书例子

Mozilla harness 最值得复刻的部分是它的两段式 verifier。这是 maker/checker 分离原则在生产里最干净的公开例子。

- **第一段**：agent 必须在 fuzzing build 里触发一个真实 crash。Brian 把这个信号叫"crystal-clear signal"——不是"看起来像 bug"，是真的 crash 了。这是硬性、可验证、没法糊弄的停止条件。
- **第二段**：一个独立的 verifier subagent 检查 bug report 是否合理、是否涉及 test-only config（test-only 的 bug 不算线上问题，要过滤掉）。

两段式的结果 Brian 是这么说的：

> "By the time a bug reaches human engineers, there are almost no false positives."

注意这句的分量。绝大多数 AI 找 bug 的方案最大的问题是误报多——人花在分拣假 bug 上的时间比真 bug 还多。Mozilla 的两段式 verifier 把这个问题压到了"几乎为零误报"。这正是 maker/checker 分离的价值：第一段负责生成，第二段负责把关，两段独立、两段都用各自的 verifier。

这个架构完全可以搬到非安全的场景。任何 goal loop 都可以套这个模板：

- 第一段：agent 必须产出一个可机器验证的硬信号（测试绿了、lint 通过、类型检查没报错、build 成功）。
- 第二段：独立 verifier 检查产出是否合理（不只是测试过，而是改的地方对、没动不该动的地方、没引入 test-only 假修复）。

新手写 goal loop，照这个两段式来写，至少不会掉进"agent 自己说自己成功"的坑。

### Agent 比 human 强的地方：relentless

Brian 在邮件里反复强调 agent 的一个特质：**relentless（不知疲倦）**。

> "Agents will try 14, 15, 20 different approaches to trigger a bug without getting tired or losing focus."

那个 14 次才成功的 bug 是具体数字。换成人类安全研究员，到第 5 次基本就换方向或放弃了。这就是 goal loop + agent 在"反复尝试型任务"上的真实优势——它把人在重复劳动里最稀缺的东西（持续专注的认知能量）变成了一个不衰减的资源。

这对选场景有用：**如果你的任务是"试 20 种方法找到一种行得通"型，goal loop 比 human 有结构性优势；如果你的任务是"判断这 20 种方法里哪种是对的"型，human 仍然不可替代**。前者是 fuzzing、lint 修复、测试修补；后者是架构判断、安全权衡、产品取舍。

### Agent 的盲区：只见树木

Brian 同时也很诚实地指出了 agent 的盲区，这是大多数 hype 文章回避的：

> "Agents get laser-focused on the specific task and miss the bigger picture."

具体例子：patch agent 只修它接到那一个点，人类工程师会顺手说"我们应该也查另外 3 个类似位置"。agent 不会自己这么想。这是对"无人值守"叙事的一个直接反例——loop 可以让 agent 不知疲倦地修单点，但全局判断、跨位置的关联推理，仍然要 human 保留。

这个判断对 loop 设计的直接指导是：**loop 里必须保留 human gate，尤其当任务涉及"还有没有别的地方也该修"这种全局判断时**。把 agent 当不知疲倦的执行者，把人当全局判断者，两者分工，不要让 agent 单独做需要全局视野的决策。

### 优先级 LLM judge：任何人都能复刻

Brian 还给了一个非常便宜好用的技巧——**优先级 LLM judge**。对每个文件打两个分：

- **内存安全可能性**（这个文件有没有内存安全问题的可能）。
- **从 web 可达性**（这个文件能不能被 web 上的攻击者触达）。

Brian 自己说这套打分"very, very simple"。但它特别有效，因为它把"先扫什么"这件事变成了一个可排序的优先级队列——内存安全可能高、web 可达性高的文件先扫，低的文件后扫或不扫。这把 harness 的扫描效率提了一个量级。

这个技巧不局限于安全。任何 loop 都可以做类似的优先级 judge：tech debt loop 可以打"修改频率 × 复杂度"两维分；UX loop 可以打"用户访问频率 × 报错率"两维分；performance loop 可以打"调用频率 × 耗时"两维分。两个维度的简单打分，把无序的文件列表变成有序的扫描队列，是 loop 工程里最便宜的杠杆之一。

### 多模型 / 多 harness 策略

Brian 最后给的一个策略是：用多个模型、多个 harness 同时扫。

> "Because attackers will use whatever model and technique finds bugs, defenders need to scan with multiple approaches."

不同模型在不同 bug 类型上有不同的"嗅觉盲区"——A 模型擅长找内存问题，B 模型擅长找逻辑问题。只靠一个模型，等于只从一个角度看。多个模型 spike，覆盖面才够。

这个策略可推广到 loop engineering 的通用场景：**不要把所有 loop 押在一个模型上**。同一种任务（比如 PR review）用两个不同模型各跑一遍，互相印证，比一个模型跑两遍更有效。成本会高一些，但覆盖盲区的价值通常值得。

## 真实案例的几个具体数字

把 Mozilla 这个案例里值得记的数字拎出来，方便后续引用：

- **423 个 Firefox 安全 fix / 一个月**——这是 Brian 团队用 agent harness ship 的修复量。
- **14 次**——某个 bug 需要 agent 尝试 14 次才成功触发，是 agent "relentless"特质的具体证据。
- **两段 verifier**——第一段硬信号（crash），第二段合理性检查（report + test-only 过滤）。
- **两个维度 LLM judge**——内存安全可能性 + web 可达性，very very simple。
- **每周一次**（Codex skills loop）——一周的 commits 数据量才够识别 skill 缺口，少于一周数据不足。
- **每天 10:15 a.m.**（Claire 的 PR review cron loop）——具体到分钟，是 cron 而非 heartbeat。

这些数字不是营销话术，是真实在跑的系统给出的可验证数字。在 loop engineering 这块充满"提升 N 倍效率"模糊表述的领域，Brian 给的数字级别是少见的硬。

## 把 Mozilla 案例映射到 6 原语和 L0-L3

为了让这套案例和 loop engineering 的通用框架对上号，这里做个映射。如果你读过本系列前几篇，这个映射能帮你把 Mozilla 的实践放进你已经建立的认知里。

| 框架元素 | Mozilla / Claire / Brian 怎么落地 |
| --- | --- |
| ① schedule（调度） | "Heartbeats, crons, and webhooks have been around forever. What's new is pointing them at an AI agent."——cron 是日历级，heartbeat 是分钟级，hook 是事件级。 |
| ② isolation（隔离） | 邮件未明确讲 worktree——这是盲区，新手要自己补。 |
| ③ skills（技能） | Codex skills loop 的整个目的就是**自动识别缺失 skill**，直接对应 SKILL.md 原语。 |
| ④ connectors（连接器） | 邮件未明确点 MCP——实操向补缺需结合其他资料。 |
| ⑤ verifier（maker/checker） | Mozilla 两段式 verifier 是最硬核的对应物；goal loop 的成败也完全靠 verifier。 |
| ⑥ STATE（状态持久化） | 邮件未明确讲 STATE.md——这是盲区，下面权衡章节展开。 |

L0-L3 渐进式上线，邮件隐含但没命名：

- morning briefing（下面会讲）= **L1 Report**（只报告不动代码）。
- Claire 的 PR review cron loop = **L2 Assisted**（在 verifier 保护下做小修复）。
- Mozilla harness（human 在 review 关卡）= 高 **L2**，没到 L3 无人值守。
- Claire 说的"loops that generate their own subagent loops"接近 **L3**，但她明确警告成本失控风险。

这套映射让你看到：邮件讲的所有案例，都在 L1 到 L2 这个区间。**没有任何一个真实在生产跑的案例是 L3 全自动无人值守**。L3 在公开资料里基本是理论状态，这点对新手设预期很重要。

## 权衡与局限：这篇没覆盖的工程硬骨头

Lenny/Claire/Brian 这篇是绝佳的入门入口，但它有几个明确的盲区。新手如果只读这篇就开始搭 loop，会在以下几处摔跤。这些是本系列前几篇讲过、但邮件没提的内容。

### 盲区一：worktree 隔离几乎没提

邮件讲了 subagent，但几乎没讲 worktree。这是个大窟窿。任何要在代码上动手的 loop（不只是报告），都必须解决"agent 的修改不要直接砸进主工作区"这个问题。否则会出现：

- 两个 loop 同时改同一个文件，互相覆盖。
- 一个 loop 的半成品修改污染了主分支，CI 一片红。
- 一个 goal loop 跑飞了，把整个仓库改成无法恢复的状态。

worktree 的作用是给每个 loop（或每个 subagent）一个独立的工作目录。git worktree 是底层机制，Claude Code 的 subagent worktree、Codex 的内建 worktree 是产品形态。Mozilla 那个 harness 显然有自己的隔离方案（Brian 没细讲），但邮件里没把这个原则拎出来。

新手实操建议：**任何 L2 以上（要动代码）的 loop，第一件事就是配 worktree 隔离**。不要让 agent 直接在主工作区改东西。这一条邮件没讲，但不做会出事。

### 盲区二：STATE.md 状态持久化没讲

邮件说"agent runs until done or stuck"，但没讲"agent 怎么记得自己上一轮做到哪了"。这是 STATE.md 解决的问题。

没有状态文件，loop 每次重启都失忆：上轮已经修过的文件这轮又修一遍；上轮已经决定放过的 PR 这轮又 triage 一遍；上轮已经升级给某个人的 issue 这轮又通知一遍。状态文件是 loop 的脊柱，让每一轮之间有连续性。

邮件讲的 morning briefing、PR review、skills loop、Mozilla harness，每一个背后都隐含着某种状态记录（否则它们没法"接着上一轮做"），但邮件没把这个原语拎到台面上。新手要自己补 STATE.md 的写法——这是本系列第二篇的主题，本篇不展开。

### 盲区三：多 loop 之间的 acting_on 锁没讲

邮件偏"单 loop 跑得好"，没讲"多 loop 协同"。当你同时跑 5 个 loop——一个盯 CI、一个 review PR、一个扫 tech debt、一个更新依赖、一个生成 changelog——它们之间会撞车。两个 loop 同时对同一个 PR 评论；三个 loop 同时改同一个文件；一个 loop 把另一个 loop 刚处理完的 issue 又捞了起来。

解决这类问题需要 acting_on 锁——一个轻量的"我正在处理这个对象"的标记，别的 loop 看到这个标记就绕开。这是多 loop 协同的基本盘，邮件完全没提。新手前期 loop 少时不会感受到，loop 多了必然撞车。

### 盲区四：cadence 与成本的线性倍数没量化

邮件承认"loop 会变贵"，但没给具体的成本上限数字或 cadence 成本模型。这是 loop engineering 文献共同的空白。

实际成本是 cadence × 单次 token × 轮数。一个每天跑一次的 cron loop，月成本是 30 × 单次；一个每 5 分钟跑一次的 heartbeat loop，月成本是 8640 × 单次——差 288 倍。新手很容易设一个"5 分钟一次"的 heartbeat 觉得没事，结果月底账单爆了。

实操建议：**给每个 loop 设预算上限**（日预算或月预算），跑超了自动停。这个机制邮件没讲，但任何要把 loop 跑在生产的人都必须配。

### 盲区五：vendor SDK 建议的争议

Brian 建议用 vendor SDK 而非第三方框架，理由是"models are likely post-trained to work best with their own infrastructure"。这个建议有道理但也有张力——它把你锁在一家厂商的生态里。如果你用 Claude agent SDK 写了整个 harness，之后想换到 OpenAI 或 Gemini，迁移成本不低。

对新手这个建议是 OK 的（前期 SDK 简单直接），但要知道它是一个 trade-off，不是免费午餐。本系列第四篇跨工具映射讲的就是怎么让 loop 尽量可迁移，可作为这个盲区的补充。

## 落地建议：新手第一个 loop 怎么起

把这篇所有实操内容压成新手可执行的步骤。如果你是从零开始，照这个顺序走，能在最少踩坑的前提下把第一个 loop 跑起来。

### 第一步：从 morning briefing 起步（零代码 loop）

邮件推荐的新手起点是 morning briefing——一个每日触发、查日历 + 邮件、汇总到 Slack 的 loop。Claire 原话：

> "The morning briefing in Claude Cowork is a perfect loop starter."

它为什么适合起步：

- 每日触发（cron），节奏慢，不会烧钱。
- 只输出汇总（report-only），不动代码，零风险。
- 输入明确（日历 + 邮件），输出明确（Slack 消息），verifier 简单（人看一眼对不对）。
- 不需要 worktree、不需要 STATE.md、不需要并发锁——所有工程硬骨头都不涉及。

跑顺 morning briefing，你就理解了 loop 的最小闭环。然后升级到 PR review 或 tech debt scan 是自然路径。

### 第二步：按 JD 四要素写 prompt

无论第一个 loop 是什么，prompt 都按 Claire 的 JD 四要素来写：

- **查什么**：明确输入。日历 + 邮件？所有 aging PR？最近一周的 commits？
- **多久一次**：选触发类型。每日（cron）、每 5 分钟（heartbeat）、事件（hook）、目标达成（goal）。
- **要什么输出**：明确产出。一条 Slack 消息？一个 PR？一份报告？
- **出问题找谁**：明确升级路径。搞不定时通知谁、用什么通道？

写完这四要素，你的 prompt 大概长这样（用 Claire 原话做模板）：

> "Every Friday at 10 a.m., review all merged PRs and identify skills our agents are missing."

注意这句每个部分都对应一个要素。"Every Friday at 10 a.m." = cron；"review all merged PRs" = 查什么；"identify skills our agents are missing" = 要什么输出；隐含的"告诉团队"= 升级路径。

### 第三步：对着按钮对照表选工具

写完 prompt，对着前面那张按钮对照速查表选工具。判断顺序：

1. 你的 loop 是按时间触发还是按事件触发？→ 时间用 cron 或 heartbeat，事件用 hook。
2. 如果按时间，间隔是分钟级还是天/周级？→ 分钟级用 heartbeat（`/loop`），天/周级用 cron（`/schedule` 或 Automation）。
3. 你的 loop 是按"目标达成"停吗？→ 是的话用 goal loop（Codex `/goal`），但要先确认你的 verifier 够硬。
4. 你在用 Claude Code 还是 Codex？→ 对着表选具体按钮。

### 第四步：L1 起步，别一上来就 L2

通用框架的 L0-L3 分级里，新手必须从 L1（只报告）起步。原因：

- L1 不动代码，零破坏风险。
- L1 的产出是人看的，verifier 就是人自己，最简单可靠。
- L1 让你先验证 loop 的节奏、输入、输出对不对，再谈动代码。

跑顺 L1 一两周，确认输出有价值、节奏不烧钱、没有噪音，再升级到 L2（在 worktree + verifier 保护下做小修复）。**绝不要直接从"想省事"跳到 L3 全自动**——这是 loop engineering 失败案例里最常见的死法。

### 第五步：上 L2 之前补三件事

升级到 L2 之前，必须先配齐：

- **worktree 隔离**：每个会动代码的 loop 或 subagent 跑在独立 worktree 里。
- **STATE.md**：记录每轮做了什么、跳过了什么、升级了什么，避免失忆。
- **预算上限**：日预算或月预算，跑超自动停。

这三件事邮件没讲，但不配齐就上 L2，必然出事。本系列第二篇（五个构件与状态中枢）和第五篇（风险、成本与反模式）是这几块的展开。

### 一个新手 30 分钟起步的最小路径

把上面五步压成一个 30 分钟能跑通的最小路径：

1. 打开 Claude Code 或 Codex。
2. 选一个你每天都做的、5 分钟能描述清楚的重复任务（日报、PR 扫一眼、依赖检查）。
3. 按 JD 四要素写一段 prompt。
4. 用 `/schedule`（Claude Code）或 Automation（Codex）设成每日触发。
5. 让它输出一条汇总消息给你看，不改任何代码。
6. 跑两天，看输出有没有用，没用就调 prompt，有用就稳定下来。

跑通这个最小路径，你就有了第一个 loop。后面所有的升级——加 worktree、加 verifier、加 STATE、换 goal loop——都是在这个最小闭环上做加法。

## 关于"递归 subagent"：loop 产 loop的天花板和成本

邮件里有一句反复被引用的"power move"：

> "The power move is loops that generate their own subagent loops."

Codex 的 skills loop 就是这句的具体形态：外层 cron loop 每周扫一次，识别出 N 个缺失 skill，给每个候选 skill 派两个具名 subagent 各自跑 goal loop 实时验证。Claire 还有一句对应的话：

> "Your agent can have its own agents."

这是 loop engineering 的天花板所在——天花板不再是工程复杂度，而是"你把岗位描述写得多清楚"。一个 loop 能 spawn 出自己的 sub-loop，意味着你的自动化可以层层展开，每一层都是一个独立的 JD。

但这一层也是新手最容易翻车的地方。原因：

- **递归意味着成本指数级**：外层一个 loop spawn 5 个 sub-loop，每个 sub-loop 再 spawn 3 个 sub-sub-loop，15 个并发 loop 烧 token 的速度是单 loop 的十几倍。
- **递归意味着失控面扩大**：每多一层，verifier 的责任就重一分。外层 verifier 没问题，不代表内层 sub-loop 的 verifier 也没问题。
- **递归意味着调试难度爆炸**：一个跑飞的递归 loop，出问题时你要追的不是一条链，是一棵树。

新手建议：**在你跑顺单层 loop（L1 + L2 都稳）之前，不要碰递归 subagent**。递归 subagent 是 L3 级别的能力，不是入门级。邮件把它作为"power move"来展示是对的，但它不是新手第一步该模仿的东西。

## 和系列其他几篇的关系

这篇深读在 loop engineering 系列里的位置是"实操入门补丁"。它的价值在两处：

- 给本系列第一篇（什么是 loop engineering）补一个最直观的新手入口——如果你觉得第一篇太框架，从这篇切入。
- 给本系列第四篇（跨工具迁移）补一个按钮级对照——第四篇讲的是能力映射，这篇讲的是具体按哪个按钮。

它的盲区由本系列第二篇（五个构件与状态中枢，讲 worktree 和 STATE.md）、第三篇（模式库与上线分级，讲 L0-L3 渐进）、第五篇（风险、成本与反模式，讲预算和并发锁）补齐。建议的完整阅读路径是：本篇（建立直觉）→ 01（建框架）→ 02（补原语）→ 03（看模式）→ 04（迁移工具）→ 05（防风险）。

## 一句话总结这篇要带走什么

Lenny 这篇是 loop engineering 最接地气的新手入口，核心带走三样东西：第一，loop 就是"一个会自己触发自己的 prompt"，别被术语吓住；第二，按触发方式四分法（heartbeat/cron/hook/goal）选工具按钮，对着那张速查表落命令；第三，先做 morning briefing 这种 L1 cron loop 跑顺，再谈 goal loop 和递归 subagent，Mozilla 的 423 个 fix 是靠 harness 和两段式 verifier 撑起来的，不是靠某个魔法模型。

剩下没讲的工程硬骨头——worktree、STATE、并发锁、预算上限——是这篇的盲区，但不是 loop engineering 的盲区，本系列前几篇都讲过。读完这篇去做第一个 loop，遇到坑再回来翻其他几篇，是最顺的路径。

## 延伸阅读

- [How I AI: How to Write AI Agent Loops in Claude Code and Codex — Lenny's Newsletter](https://www.lennysnewsletter.com/p/how-i-ai-how-to-write-ai-agent-loops) — 本篇深读的原文，2026-06-22，Claire Vo（ChatPRD）和 Brian Grinstead（Mozilla）主讲。
- [Loop Engineering — Addy Osmani](https://addyosmani.com/blog/loop-engineering/) — loop engineering 的标杆文（2026/6/7），五个积木块 + 产品映射表，比 Lenny 这篇更框架，适合读完 Lenny 之后建系统认知。
- [The Art of Loop Engineering — LangChain](https://www.langchain.com/blog/the-art-of-loop-engineering) — "agent 本质就是一个 model in a loop"，从框架视角讲 loop。
- [Harness Engineering — OpenAI](https://openai.com/index/harness-engineering/) — Brian 说的"real unlock 是 harness 不是 model"的源头立场，OpenAI 视角讲 harness 与 loop 的关系。
- [OpenAI goal-writing guide](https://platform.openai.com/docs/guides/goal-writing)（Codex `/goal` 的配套指南）—— goal loop 怎么写目标，决定它是 5 分钟收工还是 5 小时不停。
- 本系列 [01 什么是 Loop Engineering](../01-what-is-loop-engineering.md) / [02 五个构件与状态中枢](../02-five-primitives-and-state.md) / [03 模式库与上线分级](../03-patterns-and-rollout-levels.md) / [04 跨工具迁移](../04-cross-tool-mapping.md) / [05 风险、成本与反模式](../05-risks-costs-and-anti-patterns.md)——把这篇的盲区（worktree、STATE、并发锁、预算）展开讲透。
