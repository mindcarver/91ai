# dsh 的浏览器与 Computer Use：agent 的第三种执行世界

> 文件系统、shell、终端是 agent 的前两种执行世界，`dsh` 在 2026 年 9 月把第三种接了进来：图形界面。浏览器接缝一次只许挂一个 provider，三个可换后端（Playwright MCP、Chrome DevTools MCP、Stagehand 原生），注册表本体薄到只存一个名字，工具和浏览器会话全部归 provider 所有；桌面控制走同一形状的注册表，Cua Driver 有原生 SDK 和独立应用两种驱动，截图作为持久附件进模型。两条硬边界贯穿始终：浏览器资源按 Session 独占、随 Session 销毁；GUI 动作不可回滚，取消救不回已经发出的点击。本篇按 2026 年 9 月下旬的实验性包状态拆这套接缝，所有包名都带 experimental 前缀，官方明说契约可变。

## 问题：让 agent 的手伸到 API 之外

从一个具体场景进。你让 agent 核对一个没有 API 的内部系统：登录、翻三页、找到上周的订单、把备注字段里的错误改掉。文件系统接缝管不了这件事，因为目标数据不在磁盘上；shell 接缝也管不了，因为页面逻辑在浏览器渲染进程里。agent 需要的手，是图形界面的手。

这件事的难度不在"能不能点"，在三个工程问题。第一，浏览器自动化有三套成熟生态（Playwright、Chrome DevTools 协议、Stagehand），各有长短，押错一套就把用户锁死。第二，浏览器是有状态资源：一个登录态、一组标签页、一个用户正在看的窗口，两个 agent 会话抢一个浏览器就是事故。第三，桌面控制比浏览器更野：它操作的是用户真实的窗口，权限归操作系统管，截图要不要进模型、取消之后已经点出去的鼠标怎么办，每个都是边界问题。

`dsh` 的答案延续它的看家套路：把这三个问题各自做成接缝。

## 三十秒模型

两句话。浏览器接缝是一个**只存名字的注册表**：一次只能挂一个 provider，第二个来注册直接报错，注册表里没有浏览器对象、没有操作接口、没有生命周期，这些全归 provider。桌面控制是同一形状的复制：`dsh-computer-use` 也是独占注册表，谁注册了谁拥有工具和资源。

选哪个后端是配置的事，不是模型的事。模型看到的永远是 provider 挂上来的那套工具，换后端等于换了一棵子树，注册表纹丝不动。

## 注册表为什么薄到只存名字

先看接缝本体，因为它薄得出人意料。

`dsh-browser-use` 这个包的源码里没有任何浏览器对象、操作接口、资源生命周期或 provider 选择器。它做的事只有一件：维护一个私有的名字槽，provider 插件调 `ctx.browserUse.register()` 放进自己的名字，拿到一个可撤销的注册效果；插件卸载时 Cordis 效果系统自动移除注册。槽里已有名字时，第二个注册者带着已注册者的名字失败。

为什么不做厚一点，比如把浏览器会话收进接缝统一管理？因为"浏览器怎么开、怎么复用、怎么关"恰恰是各家后端差异最大的部分。Playwright 走 MCP 服务器进程，Stagehand 原生后端自己起 worker 进程做 RPC，两种生命周期的形状完全不同，强行统一等于在接缝里发明第四种后端。薄的注册表把差异留在 provider 内部，接缝只承诺一件事：**这个部署里谁在提供浏览器能力，名字唯一。**

这个"名字唯一"不是排他癖，它决定了模型体验的稳定性。工具目录是请求前缀的一部分，两个 provider 同时挂工具，前缀随注册顺序漂移，KV 缓存复用就碎了。一次一个，前缀稳定，换后端是一次明确的配置变更而不是运行时竞赛。

## 三个后端，两种活法

实验目录里躺着三个浏览器 provider，按实现路径分两类。

两个 MCP 系：`browser-use-playwright-mcp` 和 `browser-use-chrome-devtools-mcp`。它们把浏览器操作放进一个 provider 自有的 MCP 服务器，Playwright 那套做常规网页自动化，Chrome DevTools 那套偏检查和调试。一个原生系：`browser-use-stagehand-native`，AI 辅助的原生浏览器操作，自己管理 worker 进程和 RPC 协议。

两类后端共享一个公共库 `browser-use-runtime`，它解决的是前面说的第二个工程问题：**浏览器资源归谁**。规则按 Session 划界：一个 Session 的多轮对话复用同一个浏览器，操作在同 Session 内排队串行，不同 Session 之间完全隔离互不等待；Session 运行时销毁时浏览器资源跟着关闭，清理失败则处置失败并保留所有权，宁可报错也不假装干净。附件模式处理特殊情形：某个外部浏览器被独占预留给单个 Session，忙的时候跳过启动，释放后新的 Agent 激活可以再取。

MCP 系后端的工具发现有讲究。公共库的 MCP 辅助函数在**每个未来 Agent 的创建事件里**完成一次受限范围的客户端启动和工具发现，发现完成之后创建才算完成，排队的输入才开始跑。这个顺序有两个后果。模型还没说话，工具目录已经在提示组装里了，第一轮请求就是完整的；发现失败则 Agent 创建或恢复直接失败并回滚（连带清理客户端），不存在"agent 起来了但浏览器工具时有时无"的中间态。重连被明确禁用，加载或重载 provider 只影响未来的 Agent 激活。这条时间线的设计意图：工具目录要么完整要么没有，不做渐进凑合。

## Computer Use：同一形状，更野的世界

桌面控制是浏览器故事的姊妹篇，接缝形状完全一样：`dsh-computer-use` 独占注册表，工具归 provider。差别在世界本身：浏览器操作的是受控的渲染进程，桌面操作的是用户真实的窗口。

两个 provider 都基于 Cua Driver，分法在"权限和进程住在哪"。

原生驱动 `cua-driver-native` 把 Cua Driver 的 npm SDK 直接装进 `dsh` 宿主进程。代价清单很直白：需要的是**启动 dsh 的那个应用**的桌面权限，npm 安装不会替你向操作系统申请；原生运行时与宿主共享进程，原生崩溃可能带走整个宿主。收益是零额外部署。MCP 驱动 `cua-driver-mcp` 把执行交给独立安装的 Cua Driver 应用，权限和进程都归它，dsh 这边只是个客户端。要隔离选 MCP，要省事选原生，这不是技术高下，是部署取舍。

截图怎么进模型是这套设计里最见功力的一环。桌面工具的产出天然带图（窗口快照、元素定位），provider 不自己发明图片通道，截图走 `dsh` 的持久附件机制变成内容寻址的图片引用，只有显式声明图片输入的模型路由收得到；模型吃不下图的调用，规范文本结果照常返回，原始字节留在执行侧的规范值里，不进模型历史。工具名带 `cua_driver_native__` 前缀加上游原名，schema 完全跟随上游 SDK 的版本。

安全边界集中在一段固定挂载的操作指导里，值得逐条读，因为它就是这套能力的风险清单：先拿新快照再动手，快照一刷新旧的元素令牌全部作废；优先后台投递，一次拒绝不授权前台重试；动作之后从新状态验证结果，点出去了不等于点对了；取消之后先看当前状态再重试。最后一条是整个 GUI 世界的物理约束：**已经交付给应用的输入不会被取消回滚**。这跟文件系统的世界完全两样，写错了可以擦掉重写，点出去的"删除"就是点出去了。

## 权衡与边界

这套接缝族截至 2026 年 9 月全部住在实验目录，包名带 experimental 前缀，官方明说契约可变。这不是免责套话：工具 schema 钉在上游 SDK 版本上，升级是破坏性的。

能力边界值得点名。独占注册只在单个 Cordis 服务实例内成立，管不住多进程。浏览器后端切换要动配置重启组合，模型在运行时换不了后端。附件模式忙时跳过启动后，同一次激活内不再重试。桌面共享是真实的：别的会话、别的人、别的应用可以和你同时操作同一个桌面，provider 既不预留窗口也不替你完成整个流程。截图进模型还意味着上下文成本：无障碍树、结果文本、被收纳的截图，每次调用都在长上下文。

与既有的两种执行世界比，GUI 接缝的可测性和可回放性最弱。文件写错了有会话日志可查、有版本令牌可挡；一个点错位置的按钮，事后只有截图和操作记录，没有"撤销"。这也是为什么操作指导把验证责任压给模型每一轮：GUI 世界的失败兜底不是机制回滚，是下一次观察。

## 延伸阅读

- [browser-use 接缝包](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/browser-use/browser-use)：注册表契约
- [browser-use-runtime](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/experimental/browser-use-runtime)：Session 所有权与 MCP 激活
- [浏览器子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/browser-use.md)：provider 选择与 Session 所有权
- [computer-use-cua-driver-native](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/experimental/computer-use-cua-driver-native)：原生驱动与宿主要求
- [浏览器 provider 注册决策笔记（2026-09-12）](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-09-12-browser-use-provider-registration.md)
