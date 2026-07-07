# MindStudio 选型手册：四种 Loop 架构与好/坏 Agent 的四维判别

> 来源：MindStudio《What Is Loop Engineering?》（2026/06/09），loop engineering 系列里最早一批的系统科普。本文是该来源的深度解析，聚焦它最实操的那一面——工程师怎么按场景选 loop 架构，怎么用四个维度判断一个 agent 设计得好不好。

## TL;DR

MindStudio 这篇的核心主张只有一句：**好 agent 和坏 agent 的差别，通常不在底座模型，而在 loop 设计**。这句话有点绝对（后面会拆它的立场），但它把「loop 设计」拆成了工程师能直接用的东西——四种标准架构（Retry / Plan-Execute-Verify / Explore-Narrow / Human-in-the-Loop），加上一张四维判别清单（错误处理 / context 维护 / scope 控制 / 验证），再加五条明天就能落地的工程 checklist。

它的价值在于把抽象的「loop engineering」翻译成了选型语言：你的任务长什么样，决定了你该用哪种 loop；你的 loop 在四个维度上表现怎么样，决定了它是个好 agent 还是坏 agent。这是五篇来源里最「工程师友好」的一篇，不跟你讲学术谱系，不跟你讲企业架构，只跟你讲——你今天下午要给一个任务搭 agent，你该怎么选、怎么验、怎么改。

它的局限也很清楚：没有代际深度（不讲 ReAct → Reflexion 的演进），没有系统原语视角（不讲 worktree、MCP、外部状态脊柱），后半段夹带自家产品（Agent Skills Plugin）的推销。所以它适合做选型入门和判别手册，不适合做架构深读。这篇解析会把它的实操价值榨干，同时把它的立场和缺口标出来。

## 为何单独深读这篇

loop engineering 这个话题，大部分文章要么偏学术（讲 ReAct/Reflexion 的论文谱系），要么偏企业（讲生产部署的 runtime 治理）。MindStudio 这篇卡在一个很特殊的位置——它是**写给「明天要搭 agent 的工程师」看的选型手册**。

具体来说，它做了三件别的来源没做的事：

第一，它给 loop 做了**形态分类**而不是谱系分类。它不说「loop 从 ReAct 演化到 Ralph Loop」，它说「loop 有四种干活方式，分别是 Retry、Plan-Execute-Verify、Explore-Narrow、Human-in-Loop，各有各的适用场景和坑」。形态分类的好处是工程师能直接对号入座——你这个任务像 Retry 还是像 Plan-Execute-Verify，一眼就看出来。谱系分类的好处是理解历史，但对今天的选型决策帮助有限。

第二，它给了**好 agent vs 坏 agent 的四维判别清单**。这是五篇来源里最贴近「我手里这个 agent 到底行不行」这个问题的。DSD 给的是「选 loop 类型的决策表」，Truefoundry 给的是「企业级 runtime 的治理清单」，都不如 MindStudio 这张四维表直接——你拿一个 agent 的运行日志，照着四个维度一对照，好坏立判。

第三，它给了**五条明天就能用的 checklist**，其中「结构化反馈」和「日志格式示例」是别的来源都没给的。这两条特别值钱，因为它们解决的是 loop 工程里最具体的那层——agent 出错时你到底该喂它什么、记什么。

所以这篇的定位是：**最实操的选型与判别手册**。读完它你不会懂 loop 的演进史，也不会懂企业级 loop 系统的架构，但你会知道——给你的任务选哪种 loop，以及怎么判断你选的 loop 设计得好不好。

## 心智模型：四种 Loop 架构像四种厨具

要把四种 loop 架构记牢，可以用一个类比：**它们像厨房里的四种厨具，各管一类活，混用就会出事**。

Retry Loop 像厨师刀。它能干最基础、最原子的事——切一刀，看看切得对不对，不对再来一刀。它适合短、清晰、一刀就能判定成败的活。你不会用厨师刀去炖一锅汤，也不会用 Retry Loop 去重构一个模块。

Plan-Execute-Verify Loop 像菜谱。你先写好步骤（备料 → 腌制 → 热锅 → 下锅 → 调味 → 出锅），然后一步步执行，每步做完尝一下味道再走下一步。它适合顺序重要、早期错误会复合（姜还没切就下锅，后面全乱）的多步任务。它的风险是过度相信菜谱——做到一半发现菜谱写错了，你得改菜谱，而不是硬着头皮把错的步骤推下去。

Explore-Narrow Loop 像试味勺。你不知道这道菜该放多少盐，于是你尝一小口、加一点、再尝、再加，根据中间结果收窄到合适的咸度。它适合「正确答案 upfront 不知道，得边试边调」的活——debug 未知错误、调性能、摸不熟的 API。它的风险是成本高（尝很多次），必须早且勤地剪枝，否则 context 会爆。

Human-in-the-Loop 像问主厨。你做到一个岔路口，自己拿不准，停下来问主厨一句，得到答复后继续。它适合需求没法完全 upfront 说清、或者错了代价很高的活。它的风险是问得太频繁——每个小决策都问，主厨烦死，你也没省到时间。

这个类比的关键是：**没有「最好的厨具」，只有「最合适的厨具」**。一个好厨房四样都得有，一个好 agent 工程师得知道手上这个任务该抄起哪一样。MindStudio 的贡献就是把这四样摆出来，告诉你每样的适用场景和坑。

往共识框架上靠一下：这四种 loop 架构是 loop 的**形态分类**，对应的是 6 原语里「loop」这一原语的内部细分。它们都跑在 context/harness/loop 三层里的 loop 层，用的是 schedule、isolation、skills、connectors、verifier、STATE 这 6 个原语里的不同组合。比如 Plan-Execute-Verify 重度依赖 verifier 原语（每步验证），Explore-Narrow 重度依赖 STATE 原语（得多路径记忆），Human-in-Loop 重度依赖 schedule 原语（暂停/恢复）。但 MindStudio 自己没上升到原语视角，它停在「loop 内部的工程模式」这一层——这是它的深度边界，也是它的入门友好之处。

## 详细机制：从 chain 到 loop 的根本区别

要理解 loop engineering 为什么是一门单独的学科，得先搞清楚 loop 和 chain 的区别。MindStudio 给的辨析很干净：

- **chain** 是线性的：A → B → C。每一步往后走，不回头，不分支。
- **loop** 是动态的：agent 可能从 A 走到 B，发现 B 不行，换一种方法重试，再继续。

原文说得很直白：「A loop is dynamic: the agent might go from step A to step B, discover that B didn't work, retry with a modified approach, and only then move on.」

这个区别为什么对 coding agent 特别重要？因为 coding 本身就是迭代的。MindStudio 引了一句话点破这件事：「Even experienced engineers don't write perfect code on the first try. They run it, see the error, fix it, run it again.」——有经验的工程师也不会一次写对代码，他们也是跑、看错、改、再跑。一个跳过这个循环的 coding agent，本质上是残缺的，它在假装一种人类工程师都不具备的能力。

ReAct（Reason + Act，Princeton 和 Google 的工作）是这个迭代性最早的形式化。MindStudio 对 ReAct 的表述极简：把推理步和行动步交错。放到 coding 场景，它的具体形态是：

1. 理解目标
2. 写代码
3. 运行并观察输出（或错误）
4. 推理哪里错了
5. 修改并重跑
6. 重复，直到测试通过或任务完成

这就是一个 loop 的骨架。但骨架不等于工程——ReAct 告诉你「要循环」，没告诉你「怎么循环得不像个无底洞」。loop engineering 就是补这一层的。

### 一个「工程化 loop」的五个组件

MindStudio 自己整理了五个组件，算是对「loop engineering 到底 engineer 什么」的最简回答。逐个过一遍，每个都带一句值得记住的原话。

**1. 清晰的目标和任务定义**。你必须知道「done」长什么样。「让所有单元测试通过」是好目标，因为它可判定；「让这个 app 更好」是坏目标，因为它要么无限循环，要么随便吐个东西交差。这条听起来像废话，但工程里最常见的 loop 失效，就是目标定义得不可判定——agent 不知道什么时候该停，于是要么空转，要么瞎停。

**2. 工具集**。agent 必须能真正碰环境——代码执行、文件系统、终端、搜索/文档查询、测试运行器。MindStudio 给了一句很硬的话：「If the agent can't run its own code, the loop is just guessing」——agent 跑不了自己写的代码，loop 就只是在猜。这把一类「假 agent」钉死了：那些只能生成代码、不能执行代码的系统，不管 prompt 多花哨，本质上没在 loop，它们在 chain。

**3. context management**。每次迭代都会产生更多 context，不管理就会撞 token 上限，或者更糟——丢失之前试过什么，导致重复犯错。MindStudio 给了三条策略：把前序迭代 summarize 成紧凑的工作记忆、维护「已尝试方法」的结构化日志、剪掉无关 context。这条是后面「context 维护」判别维度和「结构化反馈」checklist 的基础。

**4. termination logic**。包括成功条件（测试通过、输出匹配、用户批准）、失败条件（达到最大迭代数、重复错误、工具调用失败）、升级路径（卡住时交给人或换 agent）。MindStudio 又给了一句硬话：「Without explicit termination logic, loops become resource sinks」——没有显式终止逻辑的 loop 就是资源黑洞。它还说「Good loop engineering treats stopping conditions as first-class design requirements, not afterthoughts」——好的 loop 工程把停止条件当成一等设计需求，而不是事后补丁。这句话值得贴在显示器上。

**5. error handling and recovery**。要区分可恢复错误（语法错、缺 import）和硬阻塞（缺凭证、未定义行为），根据错误类型调整策略，避免无限重复同一个失败方法。第三句硬话：「A loop that retries the exact same action after the same error isn't learning — it's spinning」——一个在同一个错误后重试完全相同动作的 loop，不是在学习，是在空转。这句话定义了「坏的 Retry Loop」长什么样。

这五个组件是后面所有内容的脚手架。四种架构是这五个组件的不同组合方式，四维判别是看这五个组件做得好不好，五条 checklist 是改进这五个组件的具体动作。

## 详细机制：四种 Loop 架构逐个拆

这是 MindStudio 这篇最核心的贡献。四种架构，每种拆三件事：它长什么样、什么时候用、什么时候会坑你。

### 架构一：Retry Loop（重试循环）

**形态**：最简单的一种。try → check → retry。agent 试一次，检查结果，不行就再试。

**适用场景**：短、原子、有明确 pass/fail 信号的任务。典型例子：

- 写一个能让某个测试通过的函数
- 生成一张符合 spec 的图
- 跑一个查询，直到它返回有效数据

这些任务的共同点是：成功条件清晰（测试过没过、图对不对、数据有没有效），单次尝试成本低，错了重试不心疼。

**警惕点**：无策略变化的无限重试。这是 Retry Loop 最经典的失败模式——agent 用一模一样的方法重试一模一样的失败。MindStudio 的原话已经说过：「isn't learning — it's spinning」。一个好的 Retry Loop，每次重试都得带点变化——换一种实现思路、换一个库、或者至少换个参数。如果连续几次同样方法都失败，loop 得有能力说「这条路不通，我得换条路」，而不是死磕。

**工程要点**：Retry Loop 看起来最简单，但最容易写成坏的。关键是给它装上「策略变化检测」——记录上一次试了什么，如果这一次和上一次一模一样，就强制注入变化（换 prompt、换工具、或直接升级）。没有这个检测的 Retry Loop，就是 MindStudio 说的「spinning」。

### 架构二：Plan-Execute-Verify Loop（规划-执行-验证）

**形态**：先生成一个计划，然后逐步执行，每步执行完后验证，验证过了再前进。

**适用场景**：顺序重要、早期错误会复合的多步任务。典型例子：

- 重构一个模块（先理清依赖、再拆分、再改、再测，顺序错了全乱）
- 搭一个新服务（先定接口、再写实现、再接测试，跳步会返工）
- 写一个多组件的 feature（先后端、再前端、再联调）

这些任务的共同点是：错误会**复合**——第一步走错了，后面每一步都在错的基础上叠加，到最后发现问题时已经烂成一团，没法局部修。Plan-Execute-Verify 通过「每步验证后再前进」把这个复合性切断——错了立刻知道，立刻改，不让它往后传。

**警惕点**：对坏计划的过度承诺。这是 Plan-Execute-Verify 最隐蔽的坑——agent 在第二步发现计划本身错了（比如第一步的假设不成立），但它不回头改计划，而是硬把第二步推下去。MindStudio 的提醒是：step 2 发现 plan 错了，agent 需要的是改 plan，而不是硬推。一个设计得好的 Plan-Execute-Verify，必须有一个「重新规划」的出口——验证失败到一定程度，不是继续执行，而是回到规划阶段重写计划。

**工程要点**：Plan-Execute-Verify 的核心张力是「坚持计划」和「推翻计划」之间的平衡。坚持太多，会陷入坏计划的泥潭；推翻太多，又会退化成没有计划的乱试。好的做法是给「重新规划」设触发条件——比如连续两步验证失败、或者发现计划的前提假设被证伪——满足条件就回头，不满足就继续。这个触发条件得显式写出来，不能让 agent 自己临场判断，否则它要么过度固执，要么过度摇摆。

### 架构三：Explore-Narrow Loop（探索-收窄）

**形态**：同时（或顺序）探索多条解法路径，根据中间结果收窄到最有希望的那条。

**适用场景**：不知道正确方法 upfront 的问题。典型例子：

- debug 一个未知错误（不知道是哪一行、哪个模块、哪次调用引起的，得广撒网探）
- 摸一个不熟的 API（不知道哪个 endpoint 对、哪个参数有效，得试）
- 性能优化（不知道瓶颈在 CPU、内存、IO 还是网络，得测）

这些任务的共同点是：**解空间大、正确答案藏得深、 upfront 没法判断哪条路对**。Explore-Narrow 的策略是先广度探索（多开几条路径看看），拿到中间信号后收窄（砍掉没希望的，集中资源给有希望的）。

**警惕点**：context 爆炸。这是 Explore-Narrow 最贵的坑——并行跑多条路径很烧 token 和工具调用，每条路径都产生一堆中间结果，不及时剪枝的话 context window 会爆，agent 反而忘了自己在干嘛。MindStudio 的提醒：必须早且勤地剪枝（prune early and often）。

**工程要点**：Explore-Narrow 的关键是**剪枝纪律**。你得定一个规则：什么时候砍掉一条路径。常见的剪枝信号包括——这条路径连续 N 步没进展、它的中间结果明显比其他路径差、维护它的 context 成本超过预期收益。剪枝不能手软，也不能太狠——手软了 context 爆，太狠了可能砍掉本来能走通的路径。一个好的 Explore-Narrow，剪枝规则是显式的、可调的、有日志的（记录为什么砍掉某条路径，方便复盘）。

Explore-Narrow 是四种架构里最像「研究」的一种——它本质上是在解空间里做搜索。这也意味着它最贵、最需要治理。MindStudio 把它单独列出来，是提醒工程师：不是所有任务都该用 Retry 的「死磕一条路」思路，有些任务天然需要广度搜索，但你得为这个广度付成本管理的代价。

### 架构四：Human-in-the-Loop（人在环中）

**形态**：技术上是 loop 的一个变体——agent 跑到需要澄清或遇歧义时暂停，等人输入，拿到输入后继续。

**适用场景**：三种典型情况：

- 需求没法完全 upfront 指定的任务（用户自己也没想清楚，得到一半才知道要什么）
- 生产变更需要人审（上线一个改动前让人看一眼，防止事故）
- 错一次代价很高的任务（错了赔不起，宁可慢一点也要人确认）

**警惕点**：打断太频繁。如果 agent 每个小决策都问人，那它根本没省时间——人成了 agent 的全职保姆。MindStudio 的提醒：每打断一次都得值回成本。一个好的 Human-in-Loop，打断是**有节制**的——只在真正歧义、真正高风险、真正信息不足的点暂停，其余时候自己拿主意。

**工程要点**：Human-in-Loop 的核心设计是「打断阈值」。你得定义清楚什么级别的决策该问人、什么级别自己决。常见分级：

- 低风险可逆决策（改个变量名、调个参数）——绝不问，自己决
- 中风险可逆决策（改个函数实现、换一个库）——自己决，但在日志里标记，方便人复盘
- 高风险不可逆决策（删数据、上线生产、改 schema）——必须问
- 真正歧义的决策（需求没说清、两种方案都合理）——必须问

没有这个分级的 Human-in-Loop，要么问得太频繁（保姆模式），要么问得太少（脱缰模式）。分级得显式写进 agent 的配置，不能让 agent 临场判断——临场判断本身就会消耗 context 和推理预算，得不偿失。

### 四种架构不是互斥的

一个细节值得点出来：这四种架构不是互斥的，现实里的严肃 agent 通常是**嵌套组合**的。比如一个 Plan-Execute-Verify 的执行阶段里，某一步可能用 Retry Loop 来过那个具体的单元测试；整个流程的某个高风险点可能挂一个 Human-in-Loop 暂停；debug 阶段可能切成 Explore-Narrow 来定位问题。

MindStudio 在 multi-agent 那段提了这个组合性——planning agent 拆大任务、多个 executor agent 并行各做一个子任务、reviewer agent 检查每个输出把失败路由回去修正，这是「nested or coordinated」的 loop，整体能处理远超单 agent 的复杂度。它说得简略，但方向对——四种架构是积木，不是宗教，工程师该按任务结构组合它们。

## 详细机制：好 Agent vs 坏 Agent 的四维判别

这是 MindStudio 这篇最实用的部分——一张能直接拿去用的判别清单。它的前提主张是：**质量差异通常不在底座模型，而在 loop 设计**。这个主张服务于「我们卖 loop 基础设施」的立场（后面局限部分会拆），但剥离立场后，四维判别本身是有用的。

四个维度，每个都给「好的长什么样、坏的长什么样」。

### 维度一：如何处理错误

**好的 agent**：读完整的 stack trace，基于它推理根因，再动手改。它把错误当成信号，认真解读。

**坏的 agent**：扫一眼错误信息，做一个通用 fix（比如包个 try-catch、加个 None 检查），然后祈祷能过。它把错误当成噪音，急着盖过去。

这个维度的判别方法：看 agent 出错后的第一次动作。如果它的下一步是「仔细读 trace + 定位具体行 + 推理原因」，那是好的；如果它的下一步是「套一个通用模式 + 重跑」，那是坏的。坏的 agent 经常陷入「通用 fix 循环」——套 try-catch 不过，再套个 if-None，再套个默认值，一层层糊下去，根因始终没解决。

### 维度二：如何维护 context

**好的 agent**：记得 8 次迭代前试过什么，不会重复同一个失败方法。它有结构化的「已尝试方法」记忆。

**坏的 agent**：每次迭代都像失忆了一样，重复 5 次迭代前已经失败过的方法。它要么没有记忆，要么记忆太散乱没法用。

这个维度的判别方法：让 agent 连续跑 10 轮，然后看它的第 10 轮有没有引用前 9 轮的信息。好的 agent 在第 10 轮会说「我已经试过 A 和 B 都失败了，这次试 C」；坏的 agent 在第 10 轮会说「让我试试 A」（而 A 在第 3 轮已经失败过）。context 维护失败的根因，通常是 loop 没有显式的「已尝试方法」结构化日志——所有历史都散在 raw transcript 里，agent 想用也提取不出来。

### 维度三：如何 scope 工作

**好的 agent**：知道任务太大，会主动拆解成子任务，一个一个来。

**坏的 agent**：一头扎进去，试图一次性搞定整个大任务，结果输出乱七八糟、半途失控。

这个维度的判别方法：给 agent 一个明显需要拆解的任务（比如「重构这个 2000 行的模块」），看它的第一反应。好的 agent 会先输出一个拆解（「我先理清这个模块的职责、再拆成 X、Y、Z 三个子模块、再逐个重构」）；坏的 agent 会直接开始改代码，改到一半才发现自己不知道在干嘛。scope 控制失败的根因，通常是 loop 没有「先规划再执行」的阶段——它把规划省了，直接执行，结果执行的方向就是错的。

### 维度四：如何验证输出

**好的 agent**：确认方案真的能用——跑测试、跑 demo、检查边界情况。它验证的是「这个方案 work」。

**坏的 agent**：只确认能编译、没有语法错误。它验证的是「这个方案没崩」，但不验证「这个方案对不对」。

这个维度的判别方法：看 agent 完成任务后的最后一个动作。好的 agent 会主动跑一遍完整测试、或构造一个使用场景跑一下；坏的 agent 写完代码就停了，最多让 linter 过一遍。验证失败的根因，通常是 loop 的终止条件定得太弱——「能编译」被当成了「完成」，而真正的完成条件（测试过、边界情况过、用户场景跑通）从来没写进 loop。

### 四维判别的用法

这张表最实际的用法，是拿它去**评估现成的 coding agent**。你拿一个 agent，跑几个标准任务，然后照着四个维度打分：

- 错误处理：好/中/坏
- context 维护：好/中/坏
- scope 控制：好/中/坏
- 验证：好/中/坏

四个都好的是成熟 agent；两好两坏的是有短板的 agent；四个都坏的是玩具。这个打分比「它用的什么底座模型」有用得多——因为四个维度反映的都是 loop 设计，而 loop 设计是你可以改的（改 prompt、改工具配置、改终止条件），底座模型是你改不了的（除非换平台）。

## 详细机制：五条明天就能用的工程 checklist

这是 MindStudio 这篇最接地气的部分。五条，每条都具体到能立刻动手。

### Checklist 1：先写终止条件，再写 loop 逻辑

这条是说**顺序**的——别先写 loop 怎么跑、跑通了再补终止条件，而是先把终止条件钉死，再围绕它搭 loop。

为什么顺序重要？因为后补的终止条件往往是软的、模糊的，而先写的终止条件会被当成硬约束贯穿整个 loop 设计。

MindStudio 给的对比很清楚：

- 好的终止条件：「All tests pass and no linting errors」——所有测试过、没有 lint 错误。这是可判定的、机器能验证的。
- 坏的终止条件：「The code looks good」——代码看着不错。这是主观的、不可判定的、agent 会随便解释的。

同样要写**失败出口**，不能只写成功条件。MindStudio 给的例子：「After 10 iterations with no progress, escalate to human review」——10 轮没进展就升级给人审。失败出口防止 loop 变成资源黑洞。

这条 checklist 的落地动作：在写任何 loop 逻辑之前，先用一句话写下「这个 loop 在什么条件下算成功、在什么条件下算失败、失败了去哪」。这三句话写不出来，就别开始写 loop——说明你对任务的理解还不够。

### Checklist 2：给 agent 结构化反馈，不只是 raw output

这条是说**错误反馈格式**的。agent 跑代码出错时，你喂给它的反馈格式，直接决定它下一轮能不能学到东西。

MindStudio 的主张：结构化反馈比 raw dump 有用得多。一个有用的错误反馈应该包含：

- **导致错误的 relevant code**——不只是 stack trace，而是出错位置的实际代码片段，让 agent 看见是哪几行
- **agent 当时想做什么的 context**——它这一轮的目标是什么，这样它能把错误和意图关联起来
- **repeated errors vs new ones 的标记**——如果这个错误和上次一样，要明确标出来「这是重复错误」，提示 agent 必须换方法

raw stack trace 的问题在于它是机器视角的，agent 得花推理预算去解读它、关联到自己的意图、判断是不是重复错误。结构化反馈把这些预处理都做了，agent 拿到的就是「错误在哪、我想干嘛、是不是重复」三件套，能直接进入「怎么改」的推理。

这条 checklist 的落地动作：在你的 agent 框架里加一个错误反馈格式化层——拦截 raw error，提取 relevant code、附加 agent 当轮意图、查重标记，输出结构化反馈。这层不大，但能把 agent 的迭代效率提一个台阶。

### Checklist 3：记录一切，频繁总结

这条是 context 管理的具体做法。两个动作：

**记录**：维护每个 action 及其结果的运行日志。agent 每做一件事，记下做了什么、结果是什么。

**总结**：每次新迭代前，把日志 summarize 成紧凑的工作记忆（compact working memory）。不是把整段历史塞进 context，而是提炼成「试过什么、什么成了、什么败了、现在在哪」。

MindStudio 给了一个日志格式的例子，可以直接拿来当模板：

> 「Attempted fix A (failed: TypeError), attempted fix B (failed: same error), attempted fix C (partially successful: error resolved but tests still failing on line 47)」

这个格式比三次失败的全 transcript 有用得多，原因有三：

- 它是**结构化的**——每次尝试有动作、有结果、有错误类型，方便 agent 提取
- 它是**去重的**——A 和 B 失败原因一样会标出来，agent 不会重复
- 它是**紧凑的**——三次失败的信息压缩成一行，不爆 context

这条 checklist 的落地动作：在 loop 里加一个「迭代前总结」步骤——每一轮开始前，把上一轮的日志提炼成这种格式的工作记忆，再放进 context。这个总结本身可以是个小模型调用，成本低，但能极大延长 loop 的可跑轮数。

### Checklist 4：设严格的工具调用预算

这条是**成本治理**。MindStudio 的观察：无限的工具调用会导致「bloated, slow, expensive runs」——臃肿、慢、贵的运行。

预算不只是 token 成本（虽然 token 是大头），还包括：

- **工具调用次数**：每轮 loop 调几次工具，整个 loop 最多调多少次
- **墙钟时间**：loop 跑多久算超时
- **迭代轮数**：最多迭代多少轮

关键是把预算当成**失败信号**——agent 耗尽预算还没进展，不是「再加点预算」，而是「这个 loop 设计有问题，得换策略」。MindStudio 的建议：按迭代预算工具调用，agent 耗尽预算无进展就路由到不同策略。

这条 checklist 的落地动作：给每个 loop 配一个预算配置——max_tool_calls、max_iterations、max_wall_clock。预算耗尽触发「换策略」或「升级给人」，而不是「继续跑」。这把 loop 从「可能无限烧钱」变成「成本有上限」。

这条也连到一个共识：**cadence（迭代节奏）是成本的线性倍数**。loop 每多跑一轮，成本就线性涨一截。所以预算不只是防失控，也是控成本——每一轮都得值回它的 token。

### Checklist 5：在失败案例上测试 loop，不只是 happy path

这条是**测试纪律**，也是 MindStudio 给的最有哲学味的一句话：

> 「The hard part of loop engineering isn't getting it to work when everything goes right. It's making it fail gracefully when things go wrong」——loop engineering 的难点不是在一切顺利时让它工作，而是在出错时让它优雅地失败。

落地动作：生产部署前，故意测这三类失败场景：

- **不完整或歧义的任务定义**：给 agent 一个目标不清的任务，看它是停下来问、还是瞎跑、还是无限循环
- **返回错误或意外格式的工具**：让某个工具故意返回错误或畸形数据，看 agent 是处理了、还是崩了、还是假装没看见
- **真正无解的任务**：给 agent 一个客观上做不到的任务，看它的 exit condition 工作——它该在合理轮数后放弃并升级，而不是死磕到天荒地老

这三类测试覆盖了 loop 的三个脆弱点：目标解析、工具容错、终止逻辑。happy path 测试（一切顺利）只能验证 loop 能不能跑；失败案例测试才能验证 loop 在真实世界里活不活得下来。

这条 checklist 是五条里最反直觉的——多数工程师只测 happy path，因为失败案例难构造、看起来「不正常」。但 MindStudio 说得对：loop 的工程价值，恰恰在它失败时的表现。一个在 happy path 上跑得飞快但失败时崩成碎片的 loop，比一个 happy path 慢一点但失败时优雅退出的 loop，生产风险高得多。

## 真实案例：四维判别怎么用

把四维判别和五种 checklist 串起来用，举两个具体场景。

**场景一：评估一个开源 coding agent**

假设你在选一个开源 coding agent（比如某个基于 Claude/GPT 的 fork），想判断它靠不靠谱。跑三个标准任务，记录运行日志，然后照四维打分：

任务 A：让它写一个能让某个测试通过的函数（Retry Loop 场景）。

- 错误处理：看它出错后第一次动作。读了 trace 再改 = 好；套通用 fix = 坏。
- context 维护：让它连续失败 5 次，看第 5 次有没有引用前 4 次。
- scope：这个任务不需要拆解，看它有没有过度复杂化（把一个函数搞成一个类）。
- 验证：看它最后跑没跑测试。

任务 B：让它重构一个中等模块（Plan-Execute-Verify 场景）。

- 错误处理：重构过程中某个测试坏了，看它怎么处理。
- context 维护：重构多步，看它记不记得前几步做了什么。
- scope：看它有没有先拆解、还是一头扎进去。
- 验证：看它重构完跑没跑完整测试套件。

任务 C：让它 debug 一个未知错误（Explore-Narrow 场景）。

- 错误处理：debug 的核心就是错误处理，看它读 trace 的深度。
- context 维护：debug 会产生大量中间假设，看它怎么管理。
- scope：看它是广撒网还是聚焦，有没有剪枝。
- 验证：找到根因后，看它验证不验证修复真的解决问题。

三个任务跑完，12 个维度打分，好坏一目了然。这个打分比「它跑分多少」有用——跑分反映底座模型，四维反映 loop 设计，而 loop 设计是你可以改的。

**场景二：改进自己搭的 agent**

假设你搭了个内部 agent，跑生产任务时经常失控（跑太久、烧太多 token、输出质量不稳）。拿五条 checklist 过一遍：

- 终止条件写了没？如果没写，先写。多数失控 loop 的根因是没显式终止条件。
- 错误反馈是 raw 还是结构化？如果是 raw，加个格式化层。
- 有没有运行日志 + 迭代前总结？如果没有，context 在爆，agent 在失忆。
- 工具有预算没？如果没有，加 max_tool_calls、max_iterations。
- 测过失败案例没？如果只测过 happy path，故意构造三个失败场景跑一遍。

这五条过一遍，能抓出 80% 的 loop 设计问题。剩下 20% 是更深的（比如底座模型选择、prompt 工程），但那 20% 是优化，前 80% 是有没有基本工程纪律。

## 权衡与局限：MindStudio 的立场和缺口

这篇是五篇来源里最实操的，但也是最浅的，而且有明显的立场。把局限说清楚，免得读者把它当圣经。

**局限一：最浅的一篇**。它没有 DSD 的代际深度（不讲 ReAct → Reflexion → Ralph Loop 的演进谱系），没有 Tosea 的四层框架（不讲 context/harness/loop 的分层），没有 Truefoundry 的企业深度（不讲生产 runtime 的治理），没有 OpenAI 的一手实践（不讲 harness 工程的具体取舍）。它停在「loop 内部的工程模式」这一层，没上升到「loop 作为系统原语」。这意味着它适合入门，不适合做架构深读。读完它你懂怎么选 loop、怎么判好坏，但你不懂 loop 在整个 agent 系统里和 schedule、isolation、skills、MCP、STATE 这些原语怎么咬合。

**局限二：6 原语覆盖不全**。对照共识框架的 6 个原语：

- schedule：未直接讲
- isolation（worktree）：未讲
- skills（SKILL.md）：未讲
- connectors（MCP）：未讲
- verifier（maker/checker 分离）：讲了 verify 步，但没讲身份分离
- STATE（外部状态脊柱）：讲了 context management，但没讲外部状态

MindStudio 讲的是 loop 内部，不是 loop 作为系统原语。它的 context management 全在 context window 内，没上升到外部 STATE 脊柱；它的 verify 在 prompt 层，没上升到独立的 maker/checker 身份。这是它和 Truefoundry/DSD 的根本差距——后两者讲的是「loop 作为系统」，MindStudio 讲的是「loop 作为技巧」。

**局限三：四种架构和别的谱系不互通**。MindStudio 的四种（Retry / Plan-Execute-Verify / Explore-Narrow / Human-in-Loop）是**工程模式**分类，DSD 的（ReAct / Reflexion / Ralph Loop）是**学术/产品 lineage**分类。两者分类维度不同，不能混着用。写文章或做选型时，得选一个主框架，否则会让读者混淆。MindStudio 的四种更适合工程师日常选型（因为它直接对应任务形态），DSD 的谱系更适合理解历史和技术演进。

**局限四：「质量差通常是 loop 设计而非底座模型」这个论断过度绝对**。这条主张服务于 MindStudio 的立场——它是卖 loop 基础设施的，所以得说「loop 比模型重要」。实际情况是：2026 年的模型差异（GPT-5 vs Claude Sonnet 4 vs 开源模型）在长 loop 中仍然显著。底座模型决定了 agent 的推理上限、长程一致性、工具调用稳定性，这些都是 loop 设计救不回来的。更准确的说法是：**在底座模型相近的前提下，loop 设计决定好坏**；但跨模型档次比较时，底座模型仍然是天花板。MindStudio 的论断在「同档模型比」时成立，在「跨档模型比」时不成立。

**局限五：强烈的产品自推销**。文章后半段大篇幅推销 MindStudio 的 Agent Skills Plugin（`@mindstudio-ai/agent` SDK，120+ typed capabilities）和 visual workflow builder。这部分读的时候得有意识地过滤——技术内容（四种架构、四维判别、五条 checklist）是有价值的，但产品 CTA 是商业立场，不是技术结论。研究 loop engineering 本身时，产品部分可忽略。

**局限六：发布最早（6/9），可能没吸收后续讨论**。DSD（晚几天）、Tosea（6/16）、Truefoundry（6/12）都引用了更多后续材料。MindStudio 作为最早一批综述，有先发优势（最早的系统科普之一），但也有滞后风险（没来得及吸收后续的代际深度和企业深度讨论）。

把这些局限汇总成一句话：**MindStudio 是最好的 loop engineering 入门手册和选型清单，但不是架构圣经**。用它选型、用它判好坏、用它做 checklist，但别用它理解 loop 在整个 agent 系统里的位置——那部分得靠 DSD（代际）+ Tosea（四层）+ Truefoundry（企业）+ OpenAI（harness 实战）。

## 落地建议：怎么给自己的任务选架构

把这篇的实操价值榨干，给一个「拿到任务后怎么选 loop」的决策流程。

**第一步：判断任务的形态**。问自己三个问题：

- 这个任务能一刀判定成败吗？（能 → Retry 候选）
- 这个任务有明确的顺序、早期错误会复合吗？（有 → Plan-Execute-Verify 候选）
- 这个任务的正确方法 upfront 知道吗？（不知道 → Explore-Narrow 候选）

三个问题都不明显的，大概率需要组合多种架构。

**第二步：判断任务的风险等级**。问自己：

- 错了能回滚吗？（不能 → 必须 Human-in-Loop）
- 错了代价高吗？（高 → 必须 Human-in-Loop）
- 需求 upfront 清楚吗？（不清楚 → 需要 Human-in-Loop）

高风险、不可逆、需求模糊的任务，Human-in-Loop 是必选项，不是可选项。

**第三步：定终止条件**。在写任何 loop 之前，写下：

- 成功条件：什么算 done（可判定、可验证）
- 失败条件：什么时候放弃（max iterations、max tool calls、重复错误阈值）
- 升级路径：放弃后去哪（换策略、换 agent、交给人）

三句话写不出来，别开始写 loop。

**第四步：配 context 管理**。

- 加运行日志（每个 action + 结果）
- 加迭代前总结（提炼成 compact working memory）
- 加已尝试方法的结构化记录（防重复）

**第五步：配成本治理**。

- max_tool_calls（每轮 + 总额）
- max_iterations
- max_wall_clock
- 预算耗尽 = 失败信号，不是「加预算」

**第六步：测失败案例**。部署前故意测：

- 歧义任务（看它问还是瞎跑）
- 工具出错（看它处理还是崩）
- 无解任务（看它退出还是死磕）

这六步走完，你的 loop 设计就过了 MindStudio 这篇给的所有工程纪律。剩下的是实测调优——跑起来，看四维表现（错误处理、context 维护、scope、验证），哪里弱补哪里。

这个流程的价值在于它是**任务驱动**的，不是**架构驱动**的。你不先选一个「最酷的架构」，而是先看任务长什么样，再选合适的架构。这是 MindStudio 这篇最对的思路——loop 是工具，任务是主人，别本末倒置。

## 延伸阅读

- [What Is Loop Engineering? The New Meta for AI Coding Agents — MindStudio](https://www.mindstudio.ai/blog/what-is-loop-engineering-ai-coding-agents)（本文解析的原文，2026/06/09 发布，loop engineering 系列里最早的系统科普之一，注意后半段的产品推销立场）
- ReAct: Synergizing Reasoning and Acting in Language Models（Princeton + Google，MindStudio 引用的 loop 起点，讲 reasoning 步和 action 步交错）
- DSD 关于 loop 代际演进的综述（ReAct → Reflexion → Ralph Loop 谱系，补 MindStudio 缺的代际深度）
- Tosea 关于 agent 系统四层框架的论述（context/harness/loop 分层，补 MindStudio 缺的系统视角）
- Truefoundry 关于企业级 loop runtime 的治理（schedule/isolation/skills/MCP/STATE 原语，补 MindStudio 缺的原语视角）
- 本系列其他来源解析（对照阅读，理解 loop engineering 的多维度视角）
