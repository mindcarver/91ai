# LangChain 的纵向 4 层 loop:从 model in a loop 到 hill-climbing 的自我改进

> 原文：Sydney Runkle，《The Art of Loop Engineering》，LangChain 官方博客，2026 年 6 月 16 日

## TL;DR

LangChain 这篇是 11 篇来源里唯一一家 agent 基础设施厂商从「纵向叠 loop」视角系统阐述的文章。它的核心命题只有一句：**loop 不是一个,而是一摞**。把 Addy 横向铺开的 6 个原语(schedule / isolation / skills / connectors / verifier / STATE)纵向切成 4 层嵌套的 loop——① agent loop(model 调工具直到任务完成)② verification loop(grader 打分,失败带反馈重试)③ event-driven loop(事件触发 agent 跑,agent 成为持续运行的组件)④ hill-climbing loop(分析 trace 自动改 harness 本身)。前 3 层是「同一个系统反复跑」,第 4 层是「外层 loop 改造内层 loop」。LangChain 自己的判断很直接:"focus should pivot to loops 3 and 4 where value compounds"——价值在 3、4 层复利。

这篇深读要做三件事:逐层拆 4 层 loop 的机制,挖透第 4 层 hill-climbing 如何让系统自我进化,把 LangChain 的纵向视角和 Addy 的横向 6 原语做正交对照——同时指出厂商视角的盲区:它几乎不谈 isolation 和 STATE。

## 为何要单独深读这一篇

loop engineering 的主流叙事大多停在「一个 loop + 几个原语」的平面视角。Addy 的「五积木」给了横向的 6 个原语,告诉你一个 loop 由什么构成;Anthropic 的 engineering doc 讲 maker/checker 和 sampling strategies,讲的是单层 loop 内部的优化;Karpathy 的 LLM OS 叙事把 agent 定义为「just loops」,但没有展开 loop 怎么叠。这些视角都对,但都缺一个维度:**loop 怎么纵向嵌套**。

LangChain 这篇补的就是这个维度。它告诉你 agent 不是一个 loop,是 4 层 loop 套在一起,每一层外层 loop 都改造内层 loop。这个「纵向叠」的洞察在 11 篇源里是 LangChain 独占的,而且它把第 4 层 hill-climbing loop 作为「让系统自我改进」的机制单独提出来——这是其他源(包括 Addy 和 Anthropic)都没有等价物的贡献。

更深一层,这篇是厂商视角。LangChain 卖的就是 loop 3(LangSmith Deployment)和 loop 4(LangSmith Engine)的基础设施,所以它的叙事天然带着「为什么你应该把精力投到 3、4 层」的引导。这既是它的洞察所在,也是它的局限所在——厂商视角重 runtime 和 observability,轻文件系统状态。它几乎不谈 worktree(isolation)和 STATE 文件,而这恰恰是文件系统视角(Addy)的重心。两篇并置,正好拼出 loop engineering 的完整两维。

这篇深读的价值就在这里:读懂纵向 4 层,并知道它在哪里失明。

## 心智模型:loop 套 loop 像一个齿轮箱

先用一个类比把「stacking loops」讲清楚。

想象一个齿轮箱。最里面的齿轮是发动机——它自己转,每转一圈做一次功。这就是 loop 1,agent loop:模型调一次工具,看结果,再调一次,直到任务完成。这个齿轮单独存在就能工作,但它没有反馈,做错了不会自动纠正。

在它外面套一个稍大的齿轮,这个齿轮负责检查里面齿轮每次做功的质量——转速对不对、有没有异响、输出是不是合格的。不合格就把工件退回去,带着「哪里不对」的反馈重新做。这就是 loop 2,verification loop:一个 grader(maker/checker 的 checker)按 rubric 打分,失败就带反馈重试。这个齿轮和 loop 1 啮合,把「单次执行」升级成「带质量保证的执行」。

再外面套一个更大的齿轮,这个齿轮不直接管单次执行,它管的是「什么时候启动发动机」。有货物进来了,或者定时到了,或者有人按了按钮,它就把里面的齿轮组转起来。这就是 loop 3,event-driven loop:cron / webhook / channel 触发,agent 不再是「人手动调用一次跑一次」,而是「系统里持续运行的组件」。

最外面套一个最大的齿轮——它负责改造齿轮箱本身。它会观察前 3 层齿轮转了几千圈之后留下的痕迹(trace),分析「哪颗螺丝总在松动」「哪个齿轮磨损最快」「哪个工件的废品率最高」,然后伸手进去调整发动机的参数、换掉磨损的齿轮、修改质检标准。这就是 loop 4,hill-climbing loop:一个分析 agent 跑在生产 trace 之上,用发现重写 harness 配置。LangChain 给它一句话点睛——"the return arrow doesn't just loop back to the top — it reaches inside and updates the agent loop directly"(回返箭头不只是回到顶端,而是伸进内层直接改 agent loop 本身)。

这个类比的关键点是:**4 层齿轮不是平铺的,是嵌套的**。外层不取代内层,而是包住内层并改造内层。每一层外层都让内层的「单位产出价值」变高。这就是 LangChain 说的 "value compounds"——价值复利。

另一个类比:把 agent loop 想成一个会写代码的实习生。loop 1 是这个实习生独立写代码;loop 2 是给他配一个 code reviewer,每次提交都打回重改;loop 3 是把他接入工单系统,有需求就自动开工;loop 4 是每周复盘他所有提交的 trace,分析他常犯的错,然后改他的 onboarding 文档和工具配置,让他下周犯得更少。前 3 层是「同一个实习生反复干活」,第 4 层是「让这个实习生在结构上变得更强」。

## 详细机制:4 层 loop 逐层拆解

下面逐层拆。每一层我都讲清楚:它做什么、用什么 primitive 实现、docs agent 这一个贯穿全文的例子在这一层长什么样、有什么权衡。

### Loop 1:agent loop——model in a loop 的最纯粹形态

LangChain 给 agent 的定义是整个 loop engineering 圈子被引用最多的一句:

> "At its core, an agent is just a model calling tools in a loop until a task is complete."

(本质上,agent 就是一个模型在一个 loop 里反复调工具,直到任务完成。)

这一句把 agent 还原成最朴素的结构:**一个有状态的递归控制系统**。给它 context,给它 tools,让它自己决定下一步调什么工具,看到结果再决定下一步,直到它判断「任务完成了」就停下。这就是 "the most fundamental loop"——所有更高级的 loop 都是在这一层外面加壳。

实现层,LangChain 的 `create_agent` 就是这一层的 primitive:"Pick any model, plug in tools, and you have a working agent loop. Tools are what give the agent the power to take action in the real world."(选一个模型,插上工具,你就有一个能工作的 agent loop。工具是 agent 在真实世界采取行动的来源。)这句话点出一个常被忽略的事实:**model 没有 agency,tools 才是 agency 的来源**。loop 1 的「能力上限」不在模型本身,而在你给了它什么工具。一个没有工具的 LLM 只能说话,不能行动。

docs agent 在 loop 1 的形态:它接收一个文档改进请求 → model 规划并起草改动 → 用工具 clone 仓库、读文件、写文档、开 PR。这是最朴素的形态——agent 接到活,自己干完,交出去。这一层就能产生价值,但有两个问题:第一,它可能干错;第二,它只在有人手动触发时才跑。loop 2 解决第一个,loop 3 解决第二个。

注意一个细节:loop 1 在 Addy 的 6 原语框架里对应的是「context engineering → harness engineering」的最底层,它隐含了 skills(工具的定义)和 connectors(工具的实现),但 LangChain 在这一层不展开这俩原语,只讲「model + tools」。这是厂商视角和文件系统视角的第一个分歧点——Addy 会强调 SKILL.md 这种文件态的工具定义,LangChain 只讲 runtime 里的 tool schema。

### Loop 2:verification loop——maker/checker 的工程化

loop 1 能干活,但它「doesn't always produce correct or consistent work on the first pass」(第一次不一定对、不一定一致)。LangChain 的解法是在外面套一层 verification loop:

> "When consistency matters, it's often useful to wrap it in a verification loop that checks the output and sends feedback back to the model when it falls short."

(当一致性重要时,在外面套一层 verification loop 很有用——它检查输出,不达标就把结果连同反馈送回模型。)

机制是加一个 **grader**:"something that checks the agent's output against a rubric and, if it fails, sends the result back with feedback"。grader 有两种实现路径,LangChain 给了明确分类:

> "Graders can either be deterministic or agentic (LLM as a judge is a classic example)."

(grader 可以是确定性的,也可以是 agentic 的——LLM as a judge 是经典例子。)

这两种 grader 不是二选一,而是按检查项的属性分。能用确定性逻辑检查的(链接能不能解析、测试通不通过、JSON 格式对不对、diff 是否在范围内),就用确定性 grader——便宜、快、可复现。需要语义判断的(代码改得对不对、文案合不合适),才用 agentic grader(LLM as a judge)——贵、慢,但能判断「对不对」而不只是「通不通」。

实现层,`RubricMiddleware` 是这一层的 primitive,或者用 `create_agent` 上的 `after_agent` hook 自己接。

docs agent 在 loop 2 的 rubric 是 maker/checker 写法的范例,值得整组引用:grader 在每次尝试后跑测试,检查三件事——① 所有链接可解析;② 所有 CI 检查通过;③ diff 只在请求范围内(没有夹带私货改别的文件)。LangChain 自己的评价是 "No manual review needed to catch those classes of error"——这三类错误不需要人来 review 了,grader 全包。注意这三条全是确定性检查,这正是 docs 这种场景的理想设计:能自动化的检查全自动化,把人留给只有人能判断的事。

LangChain 在这一层主动点出一个 tradeoff,这是它比「加 verifier 就行」这种口号清醒的地方:

> "adding verification increases latency and cost per run. It's worth it when quality matters more than speed, which is most production use cases."

(加 verification 会增加每次运行的延迟和成本。当质量比速度重要时它才值得——而这正好是大多数生产场景。)

这句话承认了两件事:第一,maker/checker 不是免费午餐,每次 retry 都烧 token、都加延迟;第二,在生产场景「质量 > 速度」几乎总是成立,所以这个成本几乎总是值得付。但要注意反过来的推论:**如果你是低延迟实时场景(比如对话式交互、实时翻译),loop 2 的成本可能就不值得**。LangChain 没展开这个边界,但它隐含在 "when quality matters more than speed" 里。

verification loop 对应 Addy 6 原语里的 verifier 原语,而且是覆盖最强的一层。LangChain 在这里给的分类(deterministic vs agentic grader、human as grader for sensitive)比 Addy 的笼统「maker/checker」更细。

### Loop 3:event-driven loop——agent 从「被调用」变成「持续运行」

loop 1 和 2 解决了「单次执行的正确性」,但 agent 仍然是「人手动触发一次跑一次」。loop 3 把它推进到「系统里持续运行的组件」:

> "The event-driven loop connects your agent to your ecosystem. An event fires — a new document lands, a schedule triggers, a webhook arrives — and the agent runs. The agent isn't something you invoke manually; it's a component running continuously inside a larger system."

(事件驱动的 loop 把你的 agent 接入你的生态。一个事件触发——新文档到了、定时到了、webhook 来了——agent 就开跑。agent 不是你手动调用的东西,它是在更大系统里持续运行的一个组件。)

这一句是 loop engineering 从「单次任务」升级到「系统化运行」的转折点。它直接对应 Addy 6 原语里的 schedule 原语(cron / webhook)+ connectors 原语(把 agent 接入外部生态)。

实现层 LangChain 给了三个 primitive:

- **LangSmith Deployment**:支持 cron schedules 和 webhooks。
- **openclaw 的 heartbeats**:把 agent 变成 always-on 的主动助手("turn your agent into an always-on, proactive assistant")。heartbeats 这个词很形象——agent 有心跳,定时醒来主动做事,而不是被动等人调。
- **Fleet(LangChain 的 no-code agent builder)的 channels 和 schedules**:处理 event-driven 和 cron-style 触发。

docs agent 在 loop 3 的实际触发方式是一个活例,把抽象概念落地:

> "We use a channel to fire off the docs agent whenever a message is sent in our `#docs-plz` Slack channel."

(我们用一个 channel:每当 `#docs-plz` 这个 Slack 频道收到消息,就触发 docs agent 跑。)

这是一个 connectors + schedule 的完整闭环——人在 Slack 里发一句「这个文档第 3 节链接坏了」,事件触发 docs agent,agent 自己 clone 仓库、定位、修、开 PR、grader 验证、合不合条件决定要不要 retry。整个过程人只在 Slack 里说了一句话。这就是 loop 3 的威力:**agent 不再是工具,而是基础设施的一部分**。

loop 3 的复利在于它把 loop 1 + loop 2 的能力「自动化到生态里」。一个只会 loop 1-2 的 agent,你每天要手动调它 50 次;一个有 loop 3 的 agent,它自己 24 小时在 Slack / webhook / cron 的驱动下跑,你只需要看它产出的 PR。这一层是把「单次任务的 ROI」变成「单位时间吞吐量的 ROI」——同样的人力投入,产出量翻几十倍。

注意 loop 3 在 Addy 的 6 原语里对应 schedule + connectors,但不对应 isolation。这埋下一个隐患:多个 event 同时触发同一个 agent(比如 Slack 频道同时来了 5 个请求),如果 agent 没有隔离机制,它们会在同一份工作目录里打架。LangChain 完全不谈这个,因为它的产品模型是「每次 agent run 独立部署」——但如果你自己搭,这是你必须补的一层。这就是后面「权衡与局限」要展开的厂商盲区。

### Loop 4:hill-climbing loop——自动改进 harness 本身

这是全文最独特、也是其他 10 篇源都没有等价物的贡献。先把 LangChain 的定位句放上:

> "The first three loops automate work. The fourth (and arguably most important) automates improvement!"

(前 3 层 loop 自动化工作。第 4 层,而且可以论证是最重要的,自动化「改进」本身。)

机制要分两步理解。

**第一步:trace 是一等数据资产。** 每次 agent 运行(loop 1-3 任何一次 run)都会产出一个 trace——记录模型做了什么、调了什么工具、grader 的反馈是什么、最终结果是什么。LangChain 的判断是这些 trace 里有高价值信号:

> "Every agent run produces a trace: a record of what the model did, the tools it called, grader feedback, etc. Those traces contain high value signal regarding what's working and what isn't."

(每次 agent 运行产出一个 trace:记录模型做了什么、调了什么工具、grader 反馈是什么。这些 trace 里含有「什么在生效、什么没生效」的高价值信号。)

这个判断是 loop 4 成立的前提。如果 trace 只是日志(看完就扔),loop 4 就没意义。把 trace 当作「可被另一个 agent 分析、用来改进 harness 的原料」,是 LangSmith 产品化的核心心智——也是 LangChain 这篇区别于其他源的根本视角。其他源(Addy、Anthropic、Karpathy)都是个人博客或工程 doc,没有「trace 作为产品」的视角;LangChain 卖的就是 trace 收集和分析,所以它天然从「trace 能干什么」倒推出 loop 4。

**第二步:分析 agent 跑在 trace 上,用发现重写 harness。**

> "The hill climbing loop runs an analysis agent over those traces and uses the findings to rewrite the harness with improved configuration. That can include prompt/tool tweaks or grader tweaks."

(hill-climbing loop 跑一个分析 agent over 这些 trace,用发现去重写 harness,改成更好的配置。可以包括 prompt 调整、tool 调整,或 grader 调整。)

注意这里的关键——它改的不是 model 的输出,而是 **harness 的配置本身**。prompt 是 harness 的一部分;tool 的定义是 harness 的一部分;grader 的 rubric 是 harness 的一部分。loop 4 跑的分析 agent 是在改这三样,而不是在改某一次具体的输出。

然后是全文最精辟的一句,也是 loop 4 和 loop 1-3 的本质区别:

> "The key move here is that the return arrow doesn't just loop back to the top — it reaches inside and updates the agent loop directly. Each cycle of the outer loop makes the inner loops more effective."

(关键动作是:回返箭头不只是回到顶端——它伸进内层直接更新 agent loop 本身。外层 loop 的每一个 cycle 都让内层 loop 变得更有效。)

这一句把 loop 4 的独特性定义得清清楚楚。loop 1-3 的回返箭头都是「回到同一个系统的顶端重新跑」——系统不变,只是反复执行。loop 4 的回返箭头是「伸进系统内部改系统本身」——系统在每一轮被改写。前 3 层是**同构反复**(同一个系统跑很多次),loop 4 是**异构进化**(每一轮系统都不一样,而且越来越强)。这是 loop 4 叫 "hill-climbing"(爬山算法)的原因——它在目标函数上爬坡,每一步都让系统更接近最优。

实现层,`LangSmith Engine` 是这一层的 primitive,它是 LangChain 的 trace 分析 agent。

docs agent 在 loop 4 的形态:

> "We run Engine over the docs agent traces to detect any issues. When multiple traces signal a potential problem, an issue is filed requesting changes to the offending prompt or tool."

(我们跑 Engine over docs agent 的 trace 来检测问题。当多个 trace 都指向同一个潜在问题时,就 file 一个 issue,要求改对应的 prompt 或 tool。)

注意这里有一个工程化的细节:**「多个 trace 指向同一问题」才 file issue**。单次失败可能是偶发(grader 自己判断错、model 一次抽风),不构成改进信号;多个 trace 都在同一处摔跤,才说明 harness 那一处真的有结构性问题。这是一个去噪设计,避免 loop 4 被噪声 trace 带偏。

**hill-climbing 的未来:接到 RL fine-tuning。** LangChain 在 loop 4 末尾埋了一个把 loop engineering 和模型训练打通的伏笔:

> "For teams running open-weight models, the hill climbing loop can feed into RL fine-tuning, using trace or eval outcomes as training signal to improve the model itself. Auxiliary context like memory and retrieved skills can be improved the same way. The loop is the pattern; what it optimizes is up to you."

(对跑开源权重的团队,hill-climbing loop 可以喂给 RL 微调,用 trace 或 eval 结果作为训练信号来改进模型本身。辅助 context 如 memory、retrieved skills 可以用同样的方式改进。loop 是模式,它优化什么由你定。)

这一条把 loop 4 的优化对象从「prompt / tool / grader」推到「model weights / memory / skills」——直接改模型本身。这是 loop engineering 的终极形态:外层 loop 不只改 harness 的「配置层」,还改 harness 的「参数层」。「The loop is the pattern; what it optimizes is up to you」这一句把 loop engineering 从一个具体技术抽象成一个通用模式——loop 是结构,优化目标可插拔。这条在其他源里完全没有,是 LangChain 独占的视角。

### Human-in-the-loop:不是补丁,是一等公民

讲完 4 层 loop,必须补 LangChain 单独用一节强调的判断:**自动化不等于把人移出 loop**。

> "Automation doesn't mean removing humans from the loop."

它的论证很有质感,直接划出了 grader 能做和不能做的界线:

> "An automated grader can check whether links resolve; it takes a human to notice the framing is wrong for the audience. That kind of judgment, earned from context, experience, and taste, is exactly where human review earns its place."

(自动 grader 能查链接通不通;但「框架对不对、受众对不对」要人来判断。这种判断来自 context、经验和品味,正是 human review 不可替代的地方。)

这个判断是对「L3 全自动验证可达」的对冲。链接能不能解析,是确定性事实,机器能查;「这篇文章的开头是不是对目标读者来说太技术化」,是 context-dependent 的判断,机器查不了——因为它需要知道读者是谁、行业惯例是什么、作者的语气合不合适。这种判断是「earned」(挣来的),靠的是人在领域里泡出来的经验。

然后 LangChain 在 4 层 loop 各给了一个 human 接入点(写作时整组 cite):

1. **agent loop**:敏感动作 / 工具调用前要求 human input(比如执行数据库写操作、发金融交易前先问人)。
2. **verification loop**:human 可以作为敏感 workflow 的 grader(机器 grader 不放心的流程,人来打分)。
3. **application loop**:output 返回终端用户前 human 审批(PR 合不合、文案发不发由人批)。
4. **hill-climbing loop**:harness 改进上线前流过 human review(分析 agent 提的 prompt 改动,人确认了才合并)。

这 4 个接入点不是可选装饰,而是对应不同层级的「失败成本」。loop 1 的接入点防的是「单次危险动作」;loop 2 的接入点防的是「质量误判」;loop 3 的接入点防的是「错误输出触达用户」;loop 4 的接入点防的是「自我改进走偏」——这是最容易被忽略的一层。如果 loop 4 的分析 agent 自己判断错了,它会自动把 harness 改坏,而且因为它是「自动改进」,人更不容易发现。所以 loop 4 的 human review 不是 nice-to-have,是防自我改进反噬的最后一道闸。

LangChain 的收尾判断:"All of LangChain's open source frameworks make adding a 'human in the loop' a first class primitive."(所有 LangChain 开源框架都把「human in the loop」做成一等 primitive。)这是把 HITL 从「补丁」提升到「架构组件」的声明——它和 model、tool、grader 同级,是 loop 的原生组成。

## 把 4 层 loop 摆成一张表

LangChain 在结尾给了一张汇总表,是「纵向叠 loop」心智的结构化输出。这张表和 Addy 的横向 6 原语表正交——Addy 回答「一个 loop 由什么构成」,这张表回答「loop 怎么一层层叠上去」。两表并置是理解 loop engineering 二维结构的最强工具。

| Loop | 做什么 | 影响 | LangChain primitive |
| --- | --- | --- | --- |
| 1. Agent loop | 模型反复调工具直到任务完成 | 自动化工作 | `create_agent`,任何 LangChain 支持的模型 |
| 2. Verification loop | agent 跑,输出按 rubric 打分,失败带反馈重试 | 保证工作质量和正确性 | `RubricMiddleware` |
| 3. Event-driven loop | 事件触发 agent 跑,更新真实系统 | 规模化自动工作 | LangSmith Deployment(cron / webhook)或 Fleet channels |
| 4. Hill-climbing loop | 生产 trace 喂给分析 agent,改进 harness 配置 | 改进 harness 本身 | LangSmith Engine |

横向读这张表:每一层「做什么」越来越抽象,从「调工具」到「改 harness」;每一层「影响」越来越复利,从「自动化一次工作」到「让系统自我变强」。纵向读:每一层的 primitive 都是 LangChain 的产品——这是厂商视角的痕迹,但也是把概念落成代码最直接的脚手架。如果你不用 LangChain,你可以把这 4 个 primitive 映射到自己的栈:`create_agent` → 任何 agent 框架(LangGraph / Anthropic SDK / 自建);`RubricMiddleware` → 任何 maker/checker 实现;LangSmith Deployment → 任何 cron / webhook / queue 系统;LangSmith Engine → 任何跑在 trace / log 上的分析 agent。

## docs agent:4 层叠加的完整叙事

把 docs agent 这一贯穿全文的例子从 loop 1 到 loop 4 完整讲一遍,是最直观的脚手架。

- **Loop 1**:接收文档改进请求 → model 规划起草 → clone 仓库、读文件、写文档、开 PR。这是实习生独立干活。
- **Loop 2**:grader 每次尝试后跑测试,检查链接解析、CI 通过、diff 范围。"No manual review needed to catch those classes of error"——这三类错误机器全包。
- **Loop 3**:Fleet 的 channel 在 `#docs-plz` Slack 频道收到消息时触发 docs agent 跑。人在 Slack 说一句,agent 全程自动。
- **Loop 4**:Engine 跑 over docs agent 的 trace,多个 trace 指向同一问题时 file issue,要求改对应的 prompt 或 tool。

这 4 步叠加之后,docs agent 已经不是「一个写文档的 agent」——它是一个「会自己改自己写文档方式的系统」。人只需要在 Slack 提需求,看 PR,以及偶尔确认 Engine 提的改进 issue 要不要合并。这是 loop engineering 的终态:**人越来越少地干预执行,越来越多地干预改进**。

## 权威背书:三位 AI 领袖的趋同判断

LangChain 在结尾把 Steipete、Boris Cherny(Anthropic)、Andrej Karpathy 三人并列,给「loop > prompt」这个判断做权威背书:

> "AI leaders like Steipete, Boris, and Andrej have all arrived at the same conclusion: the potential in agents is in the loops you build around them."

(像 Steipete、Boris、Andrej 这些 AI 领袖都得出了同一个结论:agent 的潜力在于你围绕它建的 loop。)

这条的作用是给 loop engineering 的合法性背书。Cherny 来自 Anthropic(Claude Code 的作者),Karpathy 是「LLM OS」「agents are just loops」叙事的源头,Steipete 是 agent 工程圈的知名实践者。三个人从不同立场走到同一个结论,说明 loop engineering 不是某一家厂商的造词,而是 2026 年中这个时间点正在收敛的行业共识。

然后是 Satya(微软 CEO)的组织级判断,把 loop engineering 从工程议题升级到组织战略议题:

> "Satya frames the organizational stakes: companies that build learning loops early, where human judgment and token capital compound together, will build an advantage that's hard to replicate."

(Satya 给出了组织层面的利害关系:那些早建学习 loop、让人判断和 token 资本一起复利的公司,会建立起难以复制的优势。)

这一句是全文唯一一句把 loop engineering 上升到「竞争优势」层面的话。「人判断和 token 资本一起复利」这个表述很值得拆——「token 资本」指你喂给 agent 的计算预算,「人判断」指 human-in-the-loop 贡献的领域知识。loop engineering 让这两种资本不是线性消耗,而是复利累积:每一轮 hill-climbing 都把人的判断固化进 harness(变成 prompt / rubric / skill),让下一轮的 token 花得更有效。这就是「难以复制的优势」的来源——竞争对手可以抄你的 prompt,但抄不走你 18 个月 trace 积累出来的 harness 进化路径。

## 真实案例:从 docs agent 到「自己在改自己的系统」

docs agent 是 LangChain 自己的内部案例,它最有说服力的地方不是单层效果,而是 4 层叠加之后的形态变化。

只看 loop 1:一个会写文档的 agent,人每天要触发它几十次,每次都要 review。价值有限。

叠加 loop 2:grader 把链接、CI、diff 范围三类错误全自动了。人的 review 负担下降,但触发还是手动的。

叠加 loop 3:Slack channel 触发,agent 24 小时自动响应。人只在 Slack 提需求,PR 自动产生。吞吐量从「每天几个」变成「每天几十个」。

叠加 loop 4:Engine 分析 trace,自动发现「docs agent 总在某一类技术文档上 grader 误判」,file issue 要求改 grader rubric。harness 自我进化,误判率随时间下降。人的干预从「执行」彻底转向「改进的审批」。

这个案例的价值在于它把抽象的「value compounds」变成了可观测的曲线——每一层叠加,人的单位时间产出都在上一个数量级。这不是营销话术,是 4 层嵌套结构的数学后果:外层 loop 让内层 loop 的单位产出价值变高,而嵌套意味着复利是乘性的,不是加性的。

更广的案例视角,可以看 LangChain 提到的另一篇 companion 文章《Improving Deep Agents with Harness Engineering》——它讨论用 sandbox(Daytona)做 isolation、与 agent loop 交互、跑 verification + scoring。docs agent 是文档场景,deep agents 是更通用的长任务场景,两者都落在「harness engineering」这个母题下。这个母题的核心就是:**model 是给定的,可设计的是 harness;harness 设计的天花板,就是 agent 系统的天花板**。

## 权衡与局限:厂商视角的盲区

这一节是这篇深读最重要的对冲。LangChain 的 4 层 loop 是一个极强的纵向心智,但它有结构性的盲区——这些盲区恰恰是 Addy 文的横向 6 原语覆盖的地方。两个视角拼起来才是完整的。

**盲区 1:几乎不谈 isolation(worktree)。** LangChain 全文没提 worktree、没提 agent run 之间的隔离。这在一个「每次 agent run 独立部署」的托管产品模型里说得通——LangSmith Deployment 帮你隔离了。但如果你自己搭,这是一个致命缺口。考虑 docs agent 的 loop 3:Slack 频道同时来了 5 个文档改进请求,5 个 agent run 同时 clone 同一个仓库、改同一个文件、推同一个分支——它们会在文件层碰撞,产生冲突的 PR、覆盖的 diff、损坏的 git 状态。Addy 的 isolation 原语(worktree / 容器 / VM)就是解这个的:每个 agent run 在独立的工作目录里,互不干扰。LangChain 不讲这个,因为它的产品替你处理了;但「自己搭」的团队必须在 loop 3 之前补上 isolation 这一层,否则 event-driven 的并发会直接把 agent 体系搞崩。这是「厂商视角」和「文件系统视角」最大的分歧点——厂商看 runtime,文件系统看磁盘。

**盲区 2:几乎不谈 STATE 文件。** LangChain 全文没提 STATE.md 这种「跨 session 的持久状态脊柱」。trace 是数据资产,但 trace 是「事后分析」用的——它记录发生了什么,不直接驱动下一次 run 的行为。Addy 的 STATE 原语是「事前驱动」的:STATE 文件记录当前任务、已完成步骤、下一步、未解决问题,每次 agent 启动先读 STATE,结束时更新 STATE。这让 agent 能跨 session 续跑、能在崩溃后恢复、能被另一个 agent 接手。LangChain 的 loop 模型隐含的假设是「每次 run 都是相对独立的任务」,这在 docs agent 这种「一问一答」场景成立;但在长跑任务(跨几天、跨多次重启的迁移、重构、调研)里,没有 STATE 就等于失忆。这是 loop 3「持续运行」的隐藏前提——持续运行不等于每次都从头开始,真正的持续运行需要跨 run 的状态连续性。STATE 是这个连续性的载体,LangChain 不谈,因为它不在 LangSmith 的产品边界里。

**盲区 3:对 loop 4 的「自我改进可靠性」未讨论。** LangChain 把 hill-climbing 描绘得很正面,但没讨论两个风险。第一,分析 agent 自己也会犯错——它可能从噪声 trace 里读出「假信号」,把 harness 往错误方向改。LangChain 的「多个 trace 指向同一问题才 file issue」是一个去噪设计,但它不能完全消除误判。第二,改进可能是局部最优——hill-climbing 这个名字本身就暗示它是贪心算法,容易卡在局部最优。比如 grader rubric 被改成「越来越严格」,短期内 PR 质量上升,但长期可能导致 agent 永远过不了 grader、陷入死循环。LangChain 没讨论这些,因为它的产品卖的是「Engine 帮你分析」,不是「Engine 帮你做决定」——做决定的是人(human review before deployment)。但如果团队把 human review 这一层省了(「反正它自动改进嘛」),loop 4 就可能在没人盯着的情况下把 harness 慢慢改坏。这就是为什么前面强调 loop 4 的 human review 不是 nice-to-have。

**盲区 4:「focus should pivot to loops 3 and 4」的厂商立场。** 这句话有一个没说出口的潜台词:大量团队还卡在 loop 1-2,而 LangChain 卖的正是 loop 3-4 的产品(LangSmith Deployment + Engine)。它推荐你「把焦点转向 3、4」时,它推荐的恰好是它收费的层。这不代表这个判断错——loop 3-4 的复利是真的,前面已经论证过;但它意味着你需要带着 vendor perspective 的警觉读这条建议。判断「我是不是该投 3、4 层」的真正标准不是「LangChain 说我应该」,而是「我的 loop 1-2 是否已经稳定到值得投 3-4」。如果 loop 1(模型 + 工具)还不靠谱、loop 2(grader)还没建起来,跳到 loop 3-4 是在沙地上盖楼。复利的前提是底座稳定——底座不稳,复利的是错误。

**盲区 5:对 skills 原语只一笔带过。** LangChain 在 loop 4 末尾提到 "retrieved skills can be improved the same way"(skills 可以用 hill-climbing 的方式改进),但全文没展开 skills 是什么、怎么组织。Addy 的 skills 原语(SKILL.md 这种文件态的、可被 agent 检索的能力包)是 loop engineering 的横向支柱之一——它让 agent 的能力可组合、可复用、可演进。LangChain 不展开,因为它在 runtime 里用 tool schema 替代了 skills 的角色;但 tool schema 是「写死在代码里」的,skills 是「文件态、可被非工程师编辑、可被 agent 自己检索」的。后者在长期演进上更灵活,这是文件系统视角比 runtime 视角多出的一个维度。

把这 5 个盲区列出来,不是否定 LangChain 的贡献——4 层 loop 的纵向心智是真实且强的贡献。目的是提醒:任何单一视角都是局部的。LangChain 给纵向嵌套维度,Addy 给横向原语维度,Anthropic 给单层内部优化维度,Karpathy 给概念定义维度。loop engineering 的完整图景是这些视角的叠加,不是任何一个的单选。

## LangChain 4 层 与 Addy 6 原语的正交映射

把两个框架并置,是这篇深读最有用的实操产出。下面这张表把 LangChain 的 4 层 loop 逐层映射到 Addy 的 6 个原语,标出覆盖强度。

| LangChain loop | 对应 Addy 原语 | 映射强度 | 说明 |
| --- | --- | --- | --- |
| Loop 1 agent loop | skills(隐含)、connectors(隐含) | 弱-中 | LangChain 只讲 model + tools,不展开 skills 和 connectors 的文件态组织 |
| Loop 2 verification loop | verifier | 极强 | 完整覆盖,且给出 deterministic / agentic / human 三类 grader 的细分 |
| Loop 3 event-driven loop | schedule、connectors | 强 | 覆盖 cron / webhook / channel;但不覆盖 isolation(并发隔离) |
| Loop 4 hill-climbing loop | (无直接对应,是 Addy 框架之上的) | 超出 | Addy 没有等价物;loop 4 是「自我改进」维度,Addy 的 6 原语都是「构成 loop」维度 |
| 4 层共同缺失 | isolation、STATE | 缺口 | 这是厂商视角和文件系统视角的根本分歧 |

关键观察:LangChain 的 4 层 loop 主要覆盖 schedule + connectors + verifier 三个原语,对 isolation 和 STATE 几乎不谈,对 skills 只一笔带过。而 loop 4 是 Addy 框架里完全没有的维度——Addy 的 6 原语回答「一个 loop 由什么构成」,loop 4 回答「loop 怎么自我进化」。两个框架不是竞争,是正交互补:**Addy 给 loop 的横截面(构成),LangChain 给 loop 的纵切面(叠加和进化)**。

这给实操的启示是:搭一个完整的 loop engineering 体系,你需要同时带上两个框架。用 LangChain 的 4 层决定「我搭到第几层、每层用什么 primitive」;用 Addy 的 6 原语检查「每一层我有没有漏掉 isolation 和 STATE」。两个框架的交集(loop 2 ↔ verifier、loop 3 ↔ schedule+connectors)是共识区,你可以放心用任一方的实现;两个框架的差集(LangChain 的 loop 4、Addy 的 isolation+STATE)是各自独占区,你必须两边都抄,才不漏。

## 落地建议:怎么真的用上这 4 层

读完不是为了知道有 4 层,是为了能动手。给几条具体的落地路径。

**第一步:确认你在哪一层。** 大多数团队卡在 loop 1。判断标准:你的 agent 是不是「人手动触发、跑一次、看一次结果」?是的话你只有 loop 1。loop 1 不丢人,它是基础,但你要知道你的 ROI 上限就是「单次任务的正确率 × 手动触发的频次」。

**第二步:先补 loop 2,再想 loop 3。** 顺序很重要。loop 2(grader)是 loop 3(event-driven)的前提——如果一个 agent 的输出质量不稳定,你把它 24 小时自动跑,只会 24 小时持续产出次品。先把 loop 2 的 grader 建起来(先用确定性的:测试通过、格式正确、范围合规),让单次输出质量稳定到「基本不用人 review」,再上 loop 3。这个顺序 LangChain 没明说,但隐含在它的 4 层编号里——2 在 3 前面。

**第三步:loop 3 之前先补 isolation。** 这是 LangChain 的盲区,但你自己搭必须补。在 event-driven 触发之前,确保每个 agent run 有独立的工作目录(worktree 或容器)。否则并发触发会在文件层打架,而且这种 bug 极难排查——它只在并发时出现,单测发现不了。

**第四步:loop 4 是奢侈品,不是必需品。** loop 4 需要一个前置条件:**足够多的 trace**。hill-climbing 的分析 agent 要从 trace 里读信号,trace 不够就是噪声。一个每天跑 5 次的 agent,一个月才 150 条 trace,信号量不够支撑 loop 4。一个每天跑 500 次的 agent,一个月 15000 条,loop 4 才有意义。所以判断要不要上 loop 4 的标准是「你的 agent 跑得够不够多」。docs agent 能用 loop 4,是因为它在 loop 3 之后跑得足够频繁。如果你的 agent 还在 loop 1-2,跳到 loop 4 是浪费。

**第五步:每层都设 human 接入点,尤其是 loop 4。** loop 4 的 human review 是防自我改进反噬的闸。即使你信任 Engine 的分析,也要让 harness 改动上线前流过人——至少让人看一眼「这次改动改了什么、为什么」。自动改进听起来很诱人,但「自动改坏」的代价远高于「手动改慢」的代价。harness 是你 agent 体系的根基,根基自动崩塌比手动慢慢长更危险。

**第六步:trace 从第一天就开始存。** 哪怕你现在没有 loop 4,也要把每次 agent run 的 trace 存下来。trace 是 loop 4 的燃料,而它几乎是零成本积累的副产品——你本来就在产生 log,只要结构化存下来就行。等你的量到了支撑 loop 4 的规模,这些历史 trace 就是启动 hill-climbing 的第一桶金。LangChain 把 trace 当一等资产,这个心智早建立早受益。

**第七步:不用 LangChain 也能搭。** LangChain 的 4 个 primitive 是它的产品,但 4 层结构是模式,不绑定实现。`create_agent` → 用任何 agent 框架(LangGraph / Anthropic SDK / 自建 loop);`RubricMiddleware` → 自己写 maker/checker,或用 LLM as judge;LangSmith Deployment → 任何 cron / webhook / 消息队列 + 部署平台;LangSmith Engine → 任何跑在 trace 上的分析 agent(可以就是另一个 LLM agent,读 trace,输出改进建议)。模式是通用的,实现是可选的。别因为不用 LangChain 就觉得 4 层和你无关——4 层是 loop engineering 的结构,不是某家厂商的专利。

## 把它放回 loop engineering 的全景

最后把 LangChain 这篇放回整个 loop engineering 的全景里定位。

loop engineering 在 2026 年中的共识已经收敛到三层骨架:context engineering(喂给模型什么)→ harness engineering(围绕模型搭什么)→ loop engineering(harness 怎么反复跑和自我进化)。LangChain 这篇贡献的是第三层的纵向切法——loop engineering 不是「一个 loop」,是 4 层嵌套的 loop 栈,而且第 4 层让栈本身自我进化。

横向 6 原语(Addy)和纵向 4 层 loop(LangChain)拼起来,是 loop engineering 的二维坐标系。横轴回答「一个 loop 由什么构成」,纵轴回答「loop 怎么叠加和进化」。任何一个具体的 agent 体系,都可以在这张坐标系里定位:我在横轴上覆盖了几个原语?我在纵轴上搭到了第几层?两轴的交集处(loop 2 ↔ verifier、loop 3 ↔ schedule+connectors)是工程上最成熟的部分;两轴的边缘(loop 4、isolation、STATE)是各自还在演化的部分。

而 L0-L3 的成熟度分级,可以借 LangChain 的 4 层来细化:loop 1 = 能跑(L1);loop 2 = 能验证(L2 assisted);loop 3 = 能持续运行(L2-L3 之间);loop 4 = 能自我改进(超出共识框架的 L3,是 L3 之上的「学习型 loop」)。LangChain 没有显式给 L0-L3 分级,但它的 4 层暗含一个成熟度爬升曲线。这条曲线的终点不是「全自动」,而是「自我进化」——这是 loop engineering 区别于传统自动化的根本特征。传统自动化是「人写死规则,机器执行」;loop engineering 是「人搭 harness,harness 在 loop 里自己改自己」。这个区别决定了 loop engineering 不是自动化的延续,而是自动化的范式跃迁。

读懂 LangChain 这篇,就读懂了 loop engineering 的「进化维度」。它不完整(缺 isolation 和 STATE),但它在「自我改进」这个维度上给的是目前最清晰的脚手架。和 Addy 的横向视角一起读,你就有了一张能动手的两维地图。

## 延伸阅读

- [The Art of Loop Engineering — LangChain 官方原文](https://www.langchain.com/blog/the-art-of-loop-engineering) —— 本文深读的一手来源,Sydney Runkle 写,2026 年 6 月 16 日发布。1200 词正文 + 4 层 loop 汇总表 + 8 张架构图,信息密度极高。
- [Improving Deep Agents with Harness Engineering — LangChain](https://www.langchain.com/blog/improving-deep-agents-with-harness-engineering) —— companion 文章,讨论 sandbox(Daytona)isolation、与 agent loop 交互、verification + scoring。补了 LangChain 在 isolation 上的部分盲区。
- [The Anatomy of an Agent Harness — LangChain](https://www.langchain.com/blog/the-anatomy-of-an-agent-harness) —— 另一篇 companion,拆 harness 的解剖结构,和本文的 4 层 loop 互补。
- [Loop Engineering: Stop Prompting Agents — Eric Roby, Brain Bytes](https://codingwithroby.substack.com/p/loop-engineering-stop-prompting-agents) —— 第三方解读,把 LangChain 4 层 loop 放进 Claude Code 等工具的实践语境里讨论。
- Addy 的横向 6 原语文(本系列的另一篇深读)——和本文正交互补,横轴 vs 纵轴,两篇并读拼出 loop engineering 的完整两维地图。
