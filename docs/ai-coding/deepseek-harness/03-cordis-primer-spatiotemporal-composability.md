# Cordis 速成：从《时空可组合性》论文说起

> 如果这一篇你只能带走一句话，带走这句：DeepSeek Harness 那句"一切皆插件、卸载即还原"，不是产品文案，而是一个叫 Cordis 的框架用数学保证出来的工程事实。
> 这一篇不拆源码、不列 API，只回答三个问题：Cordis 解决的那个"老问题"是什么、它的理论主张（一篇论文）在说什么、为什么 agent harness 恰好是它的天选场景。

## 一个老问题：能注册，却不能注销

写过后端的人都干过一件事：往框架里注册一个东西。往 Express 注册一个中间件、往 Koa 注册一个中间件、往 Webpack 注册一个 loader、往 Vue 注册一个全局组件。注册很容易，一行代码。

然后问题来了：你想把它取消掉，怎么做？

大多数框架不告诉你。你可以 `app.use(middleware)`，但没有一个对称的 `app.unuse(middleware)`。Koa 不告诉你怎么取消一个中间件，Vue 不告诉你怎么卸载一个全局组件。这不是疏忽，是设计：这些框架假设注册是一次性的、在启动时完成的，运行时不需要撤销。

Koishi（一个全插件化的跨平台聊天机器人框架）的作者 Shigma 把这件事叫作现代软件的一次退步。他在框架设计文档里写得很直白：低层语言里，一个资源被分配出来，往往伴随一个显式的回收方式（文件描述符要 close，内存要 free）；而到了高层框架，资源被抽象掉了，回收方式也被抽象掉了。一个插件起了一个监听端口、改了全局状态、注册了若干回调，这些副作用散落在各处，框架不替你记，也不替你还。

代价是具体的：想换掉某个子系统？重启整个应用。想热更新一个插件？做不到。插件装多了卸不掉，内存和状态像滚雪球。开发者只能"重启治百病"。

Cordis 就是为解决这个问题生的。它的目标用一句话讲：**让"加载一个插件"和"卸载一个插件"成为对等的、可逆的操作。** 不只是能装，还要能干净地拆。

## 论文在说什么：时空两个维度

Cordis 的设计思想写在一篇论文里，标题是《A Programming Paradigm for Spatiotemporal Composability》（一种面向时空可组合性的编程范式），托管在 [cordiverse/paper](https://github.com/cordiverse/paper) 仓库。

论文开头点出了一个矛盾：现代软件越来越依赖动态组合（从插件系统到自演化的 agent harness，论文原话用到了 "self-evolving agent harnesses" 这个词），但这件事的**形式化基础一直没建立起来**。换句话说，大家都在写插件框架，却没有一套像样的理论说清"什么样的插件框架是对的"。

论文的核心主张是把程序语言理论里两个成熟概念，从编译期搬到运行期：

- **effect（副作用）**：一段计算对环境**做了什么**。比如改了状态、做了 IO、注册了回调。effect 系统负责追踪一个函数可能产生哪些副作用。
- **coeffect（协副作用）**：一段计算**需要环境提供什么**。比如要读某个上下文变量、依赖某个服务就位。coeffect 系统负责追踪一个函数需要哪些先决条件。

传统的插件框架只处理了一半：它们让你注册副作用（effect），但副作用没有"逆"，卸载就漏；它们让你声明依赖（coeffect），但往往是静态的、一次性的，运行时一变就乱。

论文的提案是把这两个维度都变成**运行时的一等机制**，并给它起两个名字：

> **Temporal Composability（时间可组合性）**：the ability to completely revert a component's side effects upon removal.（移除一个组件时，能完全撤销它的副作用。）
>
> **Spatial Composability（空间可组合性）**：the ability to declare and reactively manage inter-component dependencies.（声明组件间依赖，并对依赖变化做出反应。）

用大白话翻译这两个词，"时间"和"空间"对应的是两个工程直觉：

- **时间维度**关心"生命周期"：一个组件装上去做了很多事，拆下来时这些事能不能逐件还回去。像 git 的 revert，像撕一张不留胶的贴纸，而不是拆一面承重墙。
- **空间维度**关心"依赖接线"：一堆组件怎么找到彼此、怎么按需连上，而且**不依赖加载顺序**。像拼图，先放哪块后放哪块都能拼上，因为每块都声明了自己要卡在哪。

论文更进一步给了两条机制定义：

> **Revertible Effects（可逆副作用）**：every context transformation carries an inverse that the runtime tracks.（每一次对上下文的改动，都自带一个被运行时追踪的逆操作。）
>
> **Reactive Coeffects（反应式协副作用）**：each change of the context notifies a component against its coeffect specification.（上下文一变，就按组件声明的需求通知它。）

这两条就是 Cordis 全部的理论内核。后面所有的 API、所有的"魔法"，都是在落地这两句话。

## 时间可组合性：每个副作用都自带一个逆函数

先把时间维度讲透，因为它是 Cordis 的灵魂，也是后面理解 DeepSeek Harness 那句"卸载即还原"的钥匙。

Shigma 的设计起点是一个数学直觉：**群**。群的定义里有一条，每个元素都要有一个逆元，元素和它的逆元组合起来等于单位元。把这个直觉搬到插件系统：你做了一个操作，就要能做一个等价的反向操作，两个操作叠起来等于"什么都没发生"。

具体怎么落地？Cordis 引入了一个核心对象叫 **context（上下文）**。Koishi 的文档给了一个很准的比喻：context 是**"副作用的插座"**。

一个插件想干任何有副作用的事，都不能直接去碰全局，而是去 `ctx` 上"插电"：

- 注册一个监听器？`ctx.on(event, listener)`
- 注册一段工具定义？`ctx.tools.register(...)`
- 起一个定时器？`ctx.effect(() => { const t = setInterval(...); return () => clearInterval(t) })`

关键在最后这种形式：`ctx.effect()` 接收一个函数，这个函数做正事，**返回一个做反事的清理函数**。Cordis 把这个清理函数记下来，挂在当前插件对应的 context 上。

当一个插件被卸载，Cordis 把它 context 上挂着的所有清理函数**按注册的相反顺序**逐个执行。监听器被移除，工具被注销，定时器被清掉，端口被关闭。整个过程像卷帘门往上收，最后那个 context 干干净净，和插件从未加载过一样。

这就引出论文承诺的一个强性质，Koishi 文档叫它**"路径无关"**：

> 不管你以什么顺序加载和卸载插件，最终系统的行为只取决于"当前还启用着哪些插件"，和操作的历史路径无关。

这是个很硬的保证。它意味着：热更新不是黑魔法，只是"卸载旧版 + 加载新版"；换掉一个子系统不是改源码，只是"卸载旧的 provider + 挂载新的 provider"；测试一个插件不需要重启进程，装上跑、拆掉就行。

DeepSeek Harness 敢把"换一个 provider 等于换了整个产品"写进架构文档，底气就在这里。provider 是一个可逆注册，不是焊死在代码里的 import。

## 空间可组合性：用依赖声明代替启动顺序

时间维度解决了"怎么干净地拆"，空间维度解决"怎么自由地拼"。

传统框架的另一个痼疾是**启动顺序**。A 插件要用数据库，B 插件提供数据库，那 B 必须先于 A 加载。系统一大，启动顺序就变成一份脆弱的清单：谁先谁后、谁等谁、循环依赖怎么办。改一个插件可能要重排整条启动链。

Cordis 的做法是：**别写顺序，写需求。**

一个插件通过 `inject` 字段声明它依赖哪些服务：

```typescript
// 示意：一个需要文件系统和模型两个服务的插件
export const inject = ['fs', 'llm']

export function apply(ctx) {
  // Cordis 保证：等 ctx.fs 和 ctx.llm 都就位后，才执行这里
  ctx.tools.register({ /* ... */ })
}
```

`inject` 就是前面说的 coeffect 在工程上的化身：它声明"我这个插件需要环境提供 `fs` 和 `llm`"。Cordis 不关心加载顺序，它只关心依赖关系。`fs` 还没就位，这个插件就等着（pending）；`fs` 一上线，Cordis 通知所有声明依赖它的插件，把它们激活。

这里藏着论文里 "Reactive Coeffects" 的"反应式"三字：依赖不是启动时匹配一次就完了，而是**运行时持续追踪**。一个 provider 中途被换掉，依赖它的消费者会感知到变化，重新接线。这就是为什么 DeepSeek Harness 改完模型 key 立即生效、不用重启：换 provider 是一次 context 变化，反应式机制把新 provider 接到了所有消费者上。

把两个维度合起来，Cordis 想兑现的承诺是：**你可以把任意一堆插件以任意顺序装上去、拆下来、换掉，系统永远只反映"当前装着什么"，不残留、不混乱、不需要重启。** 这就是"时空可组合性"的工程含义。

## Cordis 的来历：从 Koishi 里抽出来的"元框架"

理论有了，实现从哪来？答案是 Koishi。

Koishi（[koishi.chat](https://koishi.chat)）是 Shigma 主导的全插件化聊天机器人框架，插件生态上千。前面讲的那些"可逆副作用""context 插座""inject 声明依赖"，最早都是在 Koishi 里打磨成型的，在几千个真实插件的负载下跑了多年。

Cordis 是把 Koishi 插件系统里那套**和聊天机器人无关的、纯框架层**的东西抽出来，独立成一个项目。它的官方定位写得很清楚：**A Meta-Framework of Spatiotemporal Composability**，"元框架"。元框架的意思是"造框架的框架"：Koishi 是用 Cordis 造出来的机器人框架，DeepSeek Harness 是用 Cordis 造出来的 agent harness。底层同一套时空可组合性理论，上层是完全不同的两个产品形态。

名字也值得说一句。Cordis 是拉丁语"心"（heart）。一个叫"心"的框架，做的是给整个产品当承重的心肌：所有插件挂在它上面跳动，它保证每一次收缩（加载）都有一次舒张（卸载）。

Cordis 的代码托管在 [cordiverse](https://github.com/cordiverse/cordis) 组织下。截至 2026-08-14，它仍在活跃开发，官方仓库顶部就声明 "The API is not yet stable and may change without notice"，配套论文也标注 "coming soon"。这是个还在快速演化的基础设施，用它要接受这条前提。

## 两个抽象维度，工程上长成五件事

论文的两个抽象维度（effect / coeffect）落到 DeepSeek Harness 的文档里，被归纳成五条具体的设计要点。这里只把它们和论文的两轴对上号，让你看到理论是怎么变成 API 的：

| 工程要点 | 对应论文维度 | 一句话 |
|---|---|---|
| 插件是实现 `Service` 的对象 | 时间 | 一个插件就是一段可挂载、可卸载的生命周期 |
| context 是服务仓库（`ctx.tools`、`ctx.llm`） | 空间 | 能力按 key 注册和查找，不 import 具体实现 |
| 用 `inject` 声明依赖 | 空间（coeffect） | 依赖决定激活，不由人排启动顺序 |
| 类型化事件，四种派发模式 | 空间 | 插件间用事件通信，不直接互相调用 |
| 注册是可逆副作用（`ctx.effect`/`ctx.on`） | 时间（effect） | 每个注册自带逆操作，卸载按序撤销 |

第五条是灵魂，它把"一切皆插件"从一个口号变成有运行时保证的事实。第五条也解释了为什么 DeepSeek Harness 反复强调"卸载一个插件，它注册的所有东西会按序撤销"。

这五条每一条都值得单独展开机制和对比，那是下一篇的事。这一篇你只要记住那个映射：**时间维度管"能不能干净地拆"，空间维度管"能不能自由地拼"，Cordis 的全部 API 都在兑现这两个承诺。**

## 为什么 agent harness 是它的天选场景

到这里有个自然的问题：聊天机器人用 Cordis 合理，agent harness 为什么也非它不可？

论文开头其实已经把答案埋进去了。它列出的应用场景是"from plugin systems to self-evolving agent harnesses"（从插件系统到自演化的 agent harness）。"自演化"这三个字是关键。

一个 agent harness 和一个普通后端服务最大的不同在于：**它会自己改自己。** 模型在运行时决定装一个 skill、挂一个 MCP server、起一个子 agent、换一个执行环境。这不是部署时由人配好的静态插件集，而是运行时动态演化、随时可能增删的插件集。

这种场景对插件系统提出了最严苛的要求：

- **动态增删是常态，不是边缘情况**。普通框架"装一次用到底"的假设在这里彻底破产。
- **替换要原子**。把执行环境从本地切到远程沙箱，要保证换的过程中没有半成品状态。
- **卸载要干净**。一个临时挂上的能力用完要能彻底撤掉，不能污染后续的会话。

这三条，恰好是"时间可组合性"承诺的东西。一个做不到可逆副作用的框架，塞给 agent 用，要么禁止 agent 动态改自己（阉割能力），要么在一次次增删后状态越来越脏（埋雷）。Cordis 的路径无关性，让 agent 可以放心地"装了拆、拆了装"，因为系统永远只反映当前装着什么。

空间维度同样关键。agent harness 里的能力接缝（`ctx.llm` 模型、`ctx.fs` 文件系统、`ctx.shell` 命令、`ctx.sandbox` 沙箱）需要随配置自由替换和组合。靠 `inject` 声明依赖、靠反应式 coeffect 接线，才不至于为每一种组合手写一套启动序列。

DeepSeek Harness 对 Cordis 的态度也很说明问题：它没有把 Cordis 当成一个 npm 依赖，而是把 Cordis 及其基础库（cosmokit、schemastery）**整套源码内嵌**进自己的 monorepo。它的 vendor 文档原话是：内嵌是为了"让 harness 完全拥有自己的框架层（可审计、可打补丁、固定版本）"。内嵌进来的包全部改名为 `@deepseek-ai` 作用域（`cordis` 变成 `@deepseek-ai/cordis`，版本钉在 4.0.0-rc.7）。

这意味着两件事：第一，DeepSeek 把 Cordis 当地基，不希望它被上游一个 breaking change 推翻，所以钉死版本、自己审、自己补。第二，他们真的在往 Cordis 里打补丁。vendor 文档记录了十几处本地修改，其中一处是在 `cordis/src/fiber.ts`（fiber 是 Cordis 管理插件生命周期的核心数据结构）里"补上三个重入销毁的缺口"。换句话说，DeepSeek 在用 agent 这个最严苛的场景，反过来帮 Cordis 把可逆性的边界条件磨硬。

这是一个良性循环：Cordis 给了 DeepSeek Harness "一切皆插件"的工程保证，DeepSeek Harness 用 agent 的极端场景反过来给 Cordis 提真实的 bug 和硬化补丁。

## 代价：这套优雅不便宜

讲完了好处，必须讲清楚代价，否则就是软文。

**第一，抽象层多，调试链长。** 一个工具调用，从模型发出，要穿过事件、守卫、接缝、provider 若干层才落地。每一层都是"可替换"的代价。出问题时，你要沿着这条链一层层找，而不是像看一个普通函数调用栈那样直接。DeepSeek Harness 自己的文档也承认，这套架构的代价之一就是抽象层多、调试复杂。

**第二，可逆性是强约束，写插件心智负担重。** 每个有副作用的注册都要配一个清理函数，漏了就破坏路径无关性。Cordis 文档反复强调"每个注册都该有一个 disposer"。这对插件作者是有纪律要求的，不是写个 `app.use` 就完事。

**第三，边界条件极多，自己造轮子会踩坑。** 前面提到 DeepSeek 在 `fiber.ts` 补的"重入销毁缺口"就是一例：插件正在卸载的过程中，又有新的注册进来怎么办？同步 setup 失败怎么回滚？异步清理还没完成时再调一次卸载怎么保证幂等？这些都是论文理论不会展开、但生产里真实存在的并发与重入难题。Cordis 在 rc 阶段，这类硬化还在进行。

**第四，理论新、生态小。** "时空可组合性"是个新鲜范式，能熟练用 Cordis 写插件的人不多，社区文档和踩坑经验远不如 React、Spring 这类主流框架厚。对一个想二次开发的团队，学习成本是真实存在的。

权衡的结论是：如果你做的是一个静态的、装好就不动的服务，Cordis 是杀鸡用牛刀，它的可逆性红利你吃不到，复杂度成本你全得付。但如果你做的是 agent harness 这种**天生要动态演化、随时增删能力**的系统，可逆性就不是奢侈品，而是地基。DeepSeek 选 Cordis，赌的就是 agent 这个场景值得为可逆性付这个代价。

## 结论

把这一篇压成几句：

Cordis 是一个把"副作用可逆"和"依赖反应式"做成运行时一等机制的元框架，理论出自《时空可组合性》论文。它脱胎于 Koishi 的插件系统，由 Shigma 主导。论文的"时间可组合性"承诺插件能被干净拆除，"空间可组合性"承诺插件能自由拼接且不依赖加载顺序。agent harness 因为天生要动态演化、随时增删能力，恰好是这套理论最刚需的场景，所以 DeepSeek Harness 把 Cordis 整套内嵌、钉死版本、自己打补丁。

理解了 Cordis，你才能理解 DeepSeek Harness 为什么敢把"一切皆插件""换 provider 换整个产品""模型可见即可重建"这些话当工程事实，而不是营销话术。这些保证的底层，都是 Cordis 用可逆副作用和反应式依赖撑起来的。

## 时点与诚实声明

本文基于 2026-08-14 的 `cordiverse/cordis` 仓库与 `deepseek-ai/deepseek-harness` 仓库、DeepSeek Harness 官方架构文档与 Cordis primer，以及《A Programming Paradigm for Spatiotemporal Composability》论文（[cordiverse/paper](https://github.com/cordiverse/paper)）的公开摘要。

Cordis 截至 2026-08-14 仍标注 API 不稳定、论文 "coming soon"，本文引用的论文定义（时间/空间可组合性、可逆副作用、反应式协副作用）来自论文仓库公开摘要的英文原文，是官方陈述。

文中"agent harness 是 Cordis 天选场景""DeepSeek 反过来帮 Cordis 磨硬边界"属分析判断，不是官方表述。"Cordis 名字源自拉丁语心""脱胎于 Koishi、Shigma 主导"来自 cordiverse 仓库与 Koishi 文档，为社区与官方材料一致记录，但具体作者署名细节以仓库实际贡献者为准。vendor 文档列出的 `fiber.ts` 重入补丁、`@deepseek-ai/cordis` 版本号 4.0.0-rc.7 均来自仓库 vendor/README.md，为可核实事实。

## 延伸阅读

- [Cordis 官方仓库（cordiverse/cordis）](https://github.com/cordiverse/cordis)：官方定位 "A Meta-Framework of Spatiotemporal Composability"
- [《A Programming Paradigm for Spatiotemporal Composability》论文](https://github.com/cordiverse/paper)：本文的理论来源
- [Koishi 可逆插件系统设计](https://koishi.chat/zh-CN/cookbook/design/disposable.html)：Cordis 工程直觉的起源
- [Koishi 官网](https://koishi.chat)：Cordis 落地的第一个大规模产品
- [DeepSeek Harness 架构文档（Cordis 节）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：Cordis 在 harness 中的定位
- [DeepSeek Harness Cordis Primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)：五条要点的官方归纳
- [vendor/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/README.md)：Cordis 如何被内嵌、改名、打补丁

上一篇：[从 0 跑起来：first run 全流程](./02-first-run-web-ui.md)
下一篇：[Cordis 五大范式：为什么"注册即可逆副作用"是灵魂](./04-cordis-five-paradigms-reversible-effects.md)
