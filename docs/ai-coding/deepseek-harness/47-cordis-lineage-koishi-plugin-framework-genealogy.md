# dsh 的 Cordis 谱系：从 Koishi 插件框架到这个 harness

> dsh 的插件引擎不是为它发明的，是继承来的：Koishi 聊天机器人框架从 2019 年起积累的四千多个社区插件把插件系统的核心抽象踩实，中间经过 Satori 协议的抽象，抽出独立的 Cordis 元框架，再被一篇编程语言论文形式化为时空可组合性范式；dsh 把整条依赖链 vendor 进仓库，钉死到具体 commit，用 18 处本地修改把生命周期正确性提到生产级 agent harness 的标准。这条谱系解释了两件事：为什么 dsh 敢把连 agent loop 在内的一切都做成插件，以及为什么它选择拥有框架层而不是安装它。
> 这一篇先讲谱系本身，再拆 vendor 的机制和 18 处修改的主题，最后把 Cordis 放回 Spring、OSGi、Tapable、VSCode 组成的插件框架参照系，看"时间轴可组合"为什么是稀缺品。

## 一个聊天机器人框架的四五年

Cordis 的源头是 Koishi，一个 TypeScript 写的跨平台聊天机器人框架，由 koishijs 组织维护，2019 年前后开始开发。聊天机器人是插件框架最残酷的练兵场之一：平台多（每个聊天平台一个适配器）、用户杂（从爱好者到企业部署）、插件生态大，截至 2026-08 积累了超过 4000 个社区插件。生态的广度从官方文档的结构就看得出来：适配器层覆盖各平台的消息编码与收发，数据库层有模型、查询和权限系统，一个带扩展、数据交换、客户端组件和主题机制的 Console 网页控制台，国际化用 Crowdin 维护多语言。用户在 marketplace 里挑插件、装插件、配插件，全程不碰代码。一个插件系统要在这种环境里活上几年，运行时挂载卸载、依赖解析、副作用清理、热更新这些能力就不是设计文档里的愿望，是被几千个真实插件反复踩出来的约束。

从 Koishi 到 Cordis 中间还有一级：Satori 协议。聊天平台的消息收发先被抽象成统一的协议层，插件系统的通用部分再往上抽一层，就是 Cordis。这个过程眼熟：React 从 Facebook 的产品里解耦成通用库，核心抽象在特定产品里验证有效后独立出来。Cordis 的官方描述是 "A Meta-Framework of Spatiotemporal Composability"（时空可组合性的元框架），在 cordiverse 组织下维护，配套一篇北大与 DeepSeek 合作的编程语言论文，提出动态组合演算并证明了一组元理论性质：保存性、时间可组合性、空间可组合性、进展性、汇合性。这套理论把"插件能安全地来去"从工程直觉提升成了有形式语义支撑的范式。核心版本目前是 4.0.0-rc.7，README 里挂着一句对本文至关重要的警告：处于活跃开发中，API 不稳定，可能不经通知就变化。

这个现状直接决定了 dsh 消费它的方式。一个 API 随时会变的 rc 版本框架，要么不敢深用，要么把它钉死。dsh 选了后者，而且钉到了 commit 粒度。

dsh 选 Cordis 不是审美偏好。一个 agent harness 需要的插件能力（运行时挂载卸载、依赖解析、副作用清理、热更新）恰好是 Koishi 生态四五年实战打磨出来的那批，Cordis 把它们从聊天机器人场景泛化到了通用场景。买一个被四千个插件踩过的框架，比自己写一个没被踩过的，是更保守的选择。

## 时空可组合性：谱系里的核心资产

要理解这条谱系值钱在哪，需要两轴的最低限度解释。空间轴是插件怎么共存：Context 是服务的容器，插件通过 `inject` 声明自己需要的服务（比如 `ctx.tools`），框架等到依赖就位才挂载它，加载顺序由需求推导而不是人工编排。事件系统有四种分发模式，`emit`、`waterfall`、`parallel`、`serial`，模式是事件公共契约的一部分；waterfall 是环绕式中间件，监听器可以改写共享对象、替换结果、或者不调 `next()` 直接短路。

时间轴是插件怎么消失，这是 Cordis 和大多数框架的分水岭：所有注册都是可逆的 effect。提示词段落、工具、适配器、监听器，都通过 effect 机制注册，每个注册自带 disposer，插件卸载或热重载时注册按可预测的顺序回卷。两轴合起来，插件才能在运行时安全地来去，而不是只在启动时组装一次。论文里的元理论性质就是给这两轴兜底的：进展性保证系统不会因为组合卡死，汇合性保证不同的加载顺序收敛到同一个状态，这类保证在普通框架里根本没有陈述的词汇。

dsh 的一切皆插件直接押在这两轴上：换一个 provider 等于换一个产品的能力，靠的是服务容器和干净的卸载；HMR 不留垃圾，靠的是 effect tracking。这份资产不是理论，是 Koishi 生态用几年时间和几千个插件兑付过的工程信用。

## 挂载与卸载的一次走查

两轴的抽象落到一次具体的生命周期上看最清楚。一个插件声明它要用的服务，比如某个工具插件声明 `inject` 里有 `ctx.tools`。挂载时框架发现这个服务还不存在，插件就等，不发牢骚也不轮询；提供服务的插件先挂载，声明它的那一刻，等待者被激活。启动顺序从来不是引导脚本排出来的，是依赖关系推导出来的。新增一个插件不需要知道 boot 顺序表在哪，把 `inject` 写全，拓扑自动成立。

插件干活时注册的东西全走 effect 通道：注册一个工具，返回一个 disposer；订阅一个事件，同样。拆卸顺序敏感的一组工作放进同一个 effect，保证它们按声明序回卷。卸载时框架把 fiber 标记为 UNLOADING，从外向内调用 disposer，每个拆卸失败被圈在它自己的 observer 里，一个子插件清理失手不会炸掉整棵树。

这个走查在 dsh 里的对应物是把本地文件系统 provider 换成远程 SSH 工作区。卸载本地 provider：它注册的目录观察者、临时文件、工具注册逐项回卷，`ctx.fs` 这个键腾空。挂载远程 provider：它认领同一个键，声明依赖它的插件被重新激活，bash、PTY、LSP 整族能力现在指向远程执行世界。中间没有"重启进程"这一步，调用方按键解析，键后面的实现换了，解析路径没变。

## 谱系里的另一个维度：被验证过的配置面

Koishi 生态还给这份资产附赠了一个经常被低估的部分：配置面。四千个插件的配置各式各样，schemastery 用 schema 描述每个插件的 Config，描述本身可以序列化成 JSON，驱动表单渲染。dsh 的配置 UI、`--dump-config` 的可打印性、profile 和 patch 的可组合性，全都站在"配置是数据、有 schema、可机器处理"这块地基上。一个 schema 库能稳定服务四千个插件的配置描述，它对边缘情况的覆盖（可选字段、默认值、嵌套结构、联合类型）是被生态规模检验过的。这份检验跟着 vendor 一起进了仓库。

## vendor 的机制：拥有框架层，而不是安装它

dsh 没有把 Cordis 装进依赖，而是把 9 个包的源码整个复制进 monorepo。`vendor/README.md` 的原话给了理由：这样 harness 完全拥有它的框架层，可审计、可打补丁、版本钉死。

三个词各有落地机制。可审计是读的权限：源码在仓库里，安全审计、行为理解、bug 排查不需要跳进 node_modules 或 npm registry。可打补丁是写的权限：dsh 对 Cordis 做了 18 处本地修改（下一节），如果走 npm，每次升级都要维护 patch 文件追着版本跑；vendor 之后修改直接在源码里，版本和修改绑定。版本钉死是生存权限：每个 vendored 包钉在上游的具体 commit hash 上，cordis 核心和 loader 钉在 cordiverse/cordis 的 `56b3d4f7`，include、group、timer、hmr、logger-console 钉在 deepseek-harness 组织下 cordis fork 的 `abb0a307`，cosmokit 和 schemastery 各有自己 fork 的 hash，semver 解析的意外升级在这里没有入口。manifest 里这些上游 URL 的分布本身就是一条信息：五个功能插件已经从 dsh 团队维护的 fork 取snapshot，上游的分工早就不只是单向拉取。

钉死之后还有一整套防腐机制。所有包重命名进 `@deepseek-ai` scope，因为 dsh 的每个包把 cordis 声明为 peer dependency，发布 dsh 就发布了这层框架，用上游名字发布等于在 registry 上抢注。重命名是外科手术式的：包名、内部依赖、可达的说明符换成 scoped 名字，但上游的运行时标识符原样保留，`Symbol.for('schemastery')` 这类跨包识别记号和 `vendor:` 元数据不动，改名不改变运行时行为，映射关系单独记在 `docs/rescope.md`。目录名、上游版本号、依赖区间故意原样保留，manifest 读起来还是上游快照的样子；`pnpm-workspace.yaml` 的 linkWorkspacePackages 把这些保留的 semver 区间解析到钉死的工作区副本，`verify-vendored-links` 卫生门禁逐个断言每个 vendored 名字解析为工作区 `link:` 而不是 registry 副本。MIT 许可证文件原样保留。每次从上游同步后跑 `pnpm run rescope-vendor --apply` 重新套上 scope。

反方向的克制同样存在：有四个 Cordis 生态的包被确认用不到，刻意不 vendor。`reggol`、`@cordisjs/utils`、`@cordisjs/element`、`@cordisjs/unyaml`（后者只是开发期的 YAML import hook）。真正的第三方依赖如 `js-yaml`、`chokidar`、`picomatch`、`@standard-schema/spec` 留在 npm 上，它们不属于"框架层"，没有 vendor 的理由。

## 九个包的分层

vendor 进来的是一条完整的依赖链，不是一个孤立的核心：

| 包 | 上游版本 | 角色 |
|---|---|---|
| `cosmokit` | 1.8.1 | 基础工具库，整个生态的最底层依赖 |
| `schemastery` | 3.18.0 | schema 验证与配置系统，dsh 所有插件 Config 的定义处，`schema.toJSON()` 驱动配置 UI 表单 |
| `cordis` | 4.0.0-rc.7 | 核心框架：Context、Fiber、Service、Events、Registry，effect tracking 所在 |
| `@cordisjs/plugin-loader` | 1.0.0-rc.5 | 插件加载器：读 `cordis.yml` 插件树、处理挂载和配置变更，profile/bundle/patch 建在它上面 |
| `@cordisjs/plugin-include` | 1.0.4 | 配置包含与 patch，dsh 的 patch 层叠（replace 不是 merge）语义的实现处 |
| `@cordisjs/plugin-group` | 1.0.0 | 插件分组，管理一组插件的集体生命周期 |
| `@cordisjs/plugin-hmr` | 1.0.15 | 热模块替换 |
| `@cordisjs/plugin-timer` | 1.1.2 | 定时器工具，与 effect tracking 集成，卸载时自动清理定时器 |
| `@cordisjs/plugin-logger-console` | 1.0.0 | 控制台日志器 |

分三层读这张表：底下两个是无依赖的地基（工具和 schema），中间是核心框架，上面五个是官方功能插件。dsh 把三层全搬了，因为它不只消费核心范式，还把 loader 和 include 当作自己配置系统的基座改造。半途 vendor（只要核心不要插件）意味着自己重写配置装配，那就失去了谱系里最有价值的部分：被踩过的实现。

## 18 处修改：从"大部分时候正确"到生产级

18 处本地修改不逐条罗列，按主题归组着读更有信息量。它们共同的背景是：Cordis 的上游设计是对的，但一个两百多个包的 agent harness 对生命周期正确性的要求，比聊天机器人严格一档。

生命周期加固是分量最重的一组，核心是 `cordis/src/fiber.ts` 关闭三个重入销毁缺口。逐个看它们堵住的失效形态：effect 的 owner-list wrapper 如果在 setup body 之后才注册，setup 中途抛异常时已创建的 effect 就找不到 owner，拆卸时被跳过，注册泄漏；wrapper 先注册、同步失败回滚，泄漏窗口关闭。插件处于 UNLOADING 状态时拒绝创建新 effect，堵的是异步拆卸期间的注入：没有这条，一个正在销毁的插件还能在飞行中收到新注册，而它的清理路径已经走完，新注册永远没人 disposal。子 fiber 在发布前注册 disposer、排空待定 effect、在失效 epoch 上跳过执行、把拆卸失败限制在单个 observer 内，这套组合保证的是故障的隔离性：一个子树拆坏了，受害范围停在那个子树，父级和其他分支继续结算。一个 agent harness 频繁装卸 subagent、热重载插件、跑后台 job，卸载瞬间就是常态而不是边缘情况，这些竞态不是理论威胁。这组修改是 HMR 和多 agent 生命周期的安全基石。

事务性配置对账是第二组。Loader 在销毁旧插件前先 import 变更的条目，等生命周期结算，候选应用失败时恢复前一个插件或配置；include 把 patch 应用到验证过的候选副本上，reconcile 完整棵树才提交。动机很直接：配置变更（HMR、用户编辑 `cordis.yml`）不能让插件树进入半应用状态。半应用状态的插件树没有好的观测面，出了问题只能重启。

有一处修改值得单独讲，因为它是典型的"上游 bug 在新场景下现形"。include 的子树变更被序列化、HMR 改用 `ignoreInitial: true`，修复的是一个死锁：回滚路径销毁 HMR，而 HMR 的 teardown 在等一个排队的刷新，那个刷新又排在同一个 apply 后面，循环等待，进程以 exit 13 退出，零诊断信息。这类死锁在聊天机器人场景里几乎凑不齐触发条件（配置变更频率低、生命周期短），在把配置当运行时输入的 agent harness 里就成了必经之路。修它的人没有改上游的权限节奏，只能本地修，这正是 vendor 的可打补丁属性兑现的时刻。

18 处里还有一组看着琐碎、实则立了规矩的。所有 package.json 重新生成：标记 private、精确的 files 清单、`./src/*` 导出、声明文件指向 lib/types，删掉开发依赖、脚本和仓库元数据，让每个 vendored 包变成一个受控的发布单元而不是上游工程的一部分。cordis 的 exports 指向 `./src/*`，所以 files 清单里必须有 src，否则发布出一个指向不存在文件的 export map；发布变更判定读 files 清单来判断哪些 diff 真正触及载荷，构建自动化因此能对"这个改动要不要发版"给出机械答案。loader 声明一个原生的 node 依赖，hmr 声明 esbuild（因为 import 了它的类型），这两处例外各自有存在的理由，其余包的依赖面全部收干净。

还有一个几乎不可见但语义吃紧的修改：条目的 `disabled` 字段支持 `!!js` 插值，每次挂载决策都重新求值，原始节点保留用于写回。它是唯一被插值的元数据字段，边界收得很窄：配置可以是活的，但只有这一个字段活。想扩展插值面的人要先回答为什么自己的字段配得上 `disabled` 的待遇，这个先例的窄是有意的。

平台与运行时怪癖是第三组。HMR 的配置监视改成单个绝对路径、用 realpath 归一的原生路径，避开 Windows 短名别名和长格式 libuv 事件路径的碰撞；刷新序列化和合并，失败归一化、记日志、通过 `hmr/config-update-failed` 事件广播。include 的持久化写入加了防抖和持久性：写入串行、瞬时性 `EACCES`/`EBUSY`/`EPERM` 重命名错误有界重试、teardown 时排空，终态失败留在队列里让 `Include.stop()` 重新抛出。

为工具链开门是第四组。JSDoc 补充满 Cordis 公共 API，因为 dsh 的 API 参考生成器对未文档化成员 hard-error，纯注释修改，上游收了就退休。include 的私有 patch 应用逻辑被抽成导出的纯函数 `applyEntryPatches`，因为 `dsh --dump-config` 需要不启动插件树就组合并打印 include 会挂载什么，配置工具不能重新实现（然后漂移）patch 算法；顺手修了一个上游 bug，patch 循环里插入的条目现在会被索引，同列表里后续 patch 能配置它们，上游只在建索引时扫一遍，插入的行永远配不上。这个 bug 对 dsh 特别致命，因为 profile 的 bundle 层、profile patch、home patch、命令行 overlay 全部作为兄弟 patch 列表叠在同一层 include 上，插入出的行配不上等于用户配置够不着它们。loader 的配置解析改成懒的（port 了上游 PR #41），`!!js` 表达式在声明的 injection 激活后才求值。schemastery 的条件 exports 映射单独值得讲，因为它防的是一个时序炸弹：这个库同时被 CJS 和 ESM 消费，上游的懒加载形态里，一个迟到的 CJS require 可能和 ESM 加载竞态，在 vitest 这类挂了 module hook 的宿主里，模块加载顺序被测试框架搅动，竞态从理论变成偶现。条件 exports 把 import 路由到 `.mjs`、require 路由到 `.cjs`，两条加载路径各拿各的文件，从根上取消了共享一个懒加载入口的竞态条件。这种 bug 的讨厌之处在于本地永远复现不了，修它靠的是读懂模块系统的语义而不是加日志。

## 同步的仪式：vendor 是持续成本

vendor 不是一锤子买卖，每次想吸收上游进展都要走一套写在 README 里的流程：记下上游 `git rev-parse HEAD`，复制 `src/`（和变化的 bin、README、LICENSE），逐条重放或放弃本地修改并更新修改日志，更新 manifest 的版本和 commit，然后在仓库根跑完整的 install、test、build。新包入库另有 cookbook。

这套仪式是 vendor 决定的真实代价：18 处修改在每次 sync 时都是待重放的补丁集，上游重构了被修改的代码，重放就变成手工合并。换来的是每一刻仓库里的框架层都处于已知状态：哪个 commit、哪些修改、全部可查。对比 npm 路线的隐性成本（semver 漂移、patch 文件与版本脱节、审计要跳出仓库），这里把成本从"随机分布在未来的升级里"变成"集中在可计划的 sync 里"。

## 被否决的其他路

vendor 这个决定本身有三个被否决的邻居，摆在一起看边界更清楚。

npm 加 patch-package 是最像的替代：正常安装，修改用 patch 文件携带。它死在三处。rc 版本的 API 漂移让每次 `npm update` 都可能把 patch 打歪，而 patch 文件失效的报错发生在安装期，离修复它的知识最远；18 处修改里有事务性配置对账这种跨文件的语义修改，patch 格式表达它们非常勉强；审计心智分裂，读框架行为时一部分在 node_modules 一部分在 patch 文件，拼不回一个整体。

fork 上游仓库再让 dsh 依赖自己的 fork，听上去两全：修改有版本历史，依赖关系正常。代价是修改离开了 dsh 的评审流：改 fiber 的 PR 在另一个仓库走另一个 CI，那个仓库没有 dsh 的两百个包做回归面，加固改坏了自己不知道。vendor 把修改放在同一个仓库里，每次动框架层的 PR 跑的是 harness 自己的完整测试，这是把修改和它的验证条件锁在一起。manifest 里那五个走 deepseek-harness fork 的包也印证了这一点：取 snapshot 可以走 fork，修改本体仍然留在 dsh 仓库里。

从零写一个插件框架是最贵的路，也真的有人选。它的隐性成本不在第一版代码，在那四五年：Koishi 的信用是时间堆出来的，重写等于放弃全部已兑付的验证，自己重付一遍学费。dsh 团队对这条路的判断写在了行动里：宁可背 18 处修改的维护责任，也不接一个没有历史的框架。

## 插件框架谱系里的位置

把 Cordis 放回更大的谱系，它的独特性才显形。

Spring 的 IoC 容器做到了空间可组合：依赖注入、bean 生命周期。时间轴上不行，bean 在启动时创建，运行时不能干净卸载，热部署要靠 OSGi 或 DevTools 这类外挂方案。OSGi 本身值得多看一眼：Java 社区为运行时模块化造过它，类加载器的隔离和 bundle 生命周期都做了，代价是出了名的复杂度和调试困难，最后多数团队退回"停机再部署"。这条历史说明时间轴的可组合性不是加个模块加载器就有的，它要求所有副作用注册时就被追踪，这个约束必须从框架的第一行代码就在，事后补不进去。

这就是空间型框架没法改装出时间轴的原因：不可逆性是架构级的。一个插件在全局表里塞了条目、改了环境变量、起了后台线程，这些副作用没有统一的注册通道，卸载时没人知道要清理什么。Cordis 的答案是收窄"注册"这个词：有效的注册只有走 effect 通道的一种，通道保证可回卷。Tapable 的 hook 系统是反例，hook 注册了就撤不干净，构建期加载的插件也谈不上运行时热替换。NestJS 的 module 和 provider 组装是启动期静态的，它是一个应用框架，不是一个插件框架。VSCode 有真正的扩展系统和特权核心，但编辑器本身不是扩展，而 dsh 连 agent loop 都是插件；VSCode 的扩展卸载也不干净，进程级状态（全局变量、环境变量改动）可以泄漏，Cordis 的 effect tracking 保证注册回卷。

Cordis 同时内置两轴，这不是加分项的堆叠，是能力的前提：只有空间轴，得到的是"启动时灵活"的普通 DI 容器；只有时间轴，得到的是没有服务隔离的 effect 库。两轴合在一起，运行时安全地挂载、卸载、热替换任何子系统才成立，"一切皆插件"才不是修辞。

## 这条谱系给 agent harness 带来什么

落到 dsh 的日常运转上，谱系兑付成三件事。

provider 替换是产品级的。模型适配器、文件系统、沙箱都是服务容器里的 provider，挂新的、卸旧的，运行时上下文干净收场。换一组 SSH provider，bash、PTY、LSP 整族能力跟着搬进远程执行世界，这就是"换 provider 等于换产品"的机制基础。这个论断还被官方自己验证过一次：远程执行最初用 E2B 沙箱实现，2026 年 9 月换成 SSH 家族，消费者一行没改。

HMR 不留垃圾。开发时改一个插件，热替换，旧实例的注册自动回卷。这依赖 effect tracking 加上那组 fiber 生命周期加固；没有它们，HMR 会逐渐积累幽灵注册，状态漂移到只能重启。

多 agent 隔离。每个 agent 有自己的 scope，注册挂在自己的 fiber 上，一个 agent 卸载不影响别人，一个进程里才能同时跑 root agent、subagent 和后台 job。一个具体的压力场景：root agent 派生五个 subagent 并行干活，其中一个中途失败要整棵拆掉重派，其余四个的注册和会话状态不能被波及，fiber 边界就是这条故障隔离线的实现。

三件事的共同底座是被四千个插件踩过的抽象加 18 处针对性的加固。传统框架凑齐这些通常要一个做空间组合、一个做热部署，中间自己写胶水；Cordis 一个框架原生覆盖，这是 dsh 在谱系里选中它的核心理由。

## 权衡

vendor 的账另一面已经说过：上游演进要靠手工 sync 吸收，18 处修改是永久维护责任，上游如果大重构 fiber，重放成本会陡增。社区贡献者想理解 dsh 的框架行为，读的是仓库里被改过的 Cordis，和 cordiverse 上游有真实差异，论坛答案不能照搬。

rc 版本是悬着的时钟。钉死 commit 挡住了意外升级，也挡住了上游的修复和新特性，吸收它们永远要走 sync 仪式。4.0.0 正式发布之前，这层框架的 API 稳定性承诺为零，上游 README 的原话是可能不经通知就变化；dsh 的做法是把风险圈进仓库自己消化，而不是假装它不存在。一个连带效应是判断成本：看到 dsh 代码里的 Cordis 行为，先查那 18 处修改清单再对照上游文档，顺序反了会把本地加固误当成上游特性。

谱系成熟度也不等于适配完成。聊天机器人的负载画像（长连接、消息驱动、插件寿命长）和 agent harness（高频装卸、配置即运行时输入、多 agent 并发）不同，18 处修改就是两个画像之间的翻译层。这个判断对想抄作业的人最重要：vendor 一个成熟框架不等于白拿它的成熟度，场景差异的部分永远要自己付。

对上游生态还有一层反向影响值得记：dsh 的加固（fiber 生命周期、懒配置解析、patch 索引）对 Cordis 上游同样有价值，README 里"上游收了就退休"的条目就是在等这个回流。截至 2026-08 这个回流还没发生，18 处修改仍是单向的本地维护。

## 结论

Cordis 的谱系是一条信用链：Koishi 用四五年、四千多个插件验证了插件系统的核心抽象，Satori 协议做了中间层的抽取，论文把它形式化成有元理论支撑的时空可组合性范式，dsh 把整条依赖链 vendor 进仓库并用 commit hash 钉死，18 处本地修改把生命周期正确性从聊天机器人标准提到生产级 agent harness 标准。可审计、可打补丁、版本钉死不是三个口号，是 rescope、workspace link 门禁、sync 重放仪式支撑的一套机制。

这条链解释了 dsh 的底气从哪来：连 agent loop 都是插件，是因为插件在这条谱系里被证明可以安全地来去。它也标出了代价的位置：上游演进的吸收成本、rc API 的零稳定性承诺、场景差异的翻译层维护。评估类似决策时，先问一件事：你的场景对生命周期正确性的要求，是否超出了框架被验证过的范围。超出了，修改养不养得起、版本钉不钉得住，都是这个问题的衍生题；没超出，vendor 带来的掌控感就是纯收益。dsh 对这个问题的回答构成了这篇文章，也构成了它整个插件层的地基。

## 延伸阅读

- [Cordis 框架仓库](https://github.com/cordiverse/cordis)：元框架本体与 API 稳定性声明
- [Koishi 可逆插件系统设计文档](https://koishi.chat/zh-CN/cookbook/design/disposable.html)：effect 可逆注册理念的一手表述
- [dsh vendor README](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/README.md)：manifest、18 处修改日志与同步流程
- [Cordis Primer（dsh 文档）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)：四分发模式与 effect 语义入门
- [Rescope 说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/rescope.md)：vendored 包名映射

上一篇：[dsh 的 i18n 翻译配对与质量门禁：双语文档怎么不腐烂](./46-i18n-translation-pairing-and-quality-gates.md)
下一篇：[dsh 与 Claude Code、Cursor、Codex 的架构横评](./48-architecture-comparison-dsh-vs-claude-code-cursor-codex.md)
