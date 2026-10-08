# dsh 的跨平台沙箱原语：bwrap、Landlock、Seatbelt 与 Windows ACL

> 沙箱策略说"这个会话只能写工作区"，这句话本身一文不值，值钱的是谁来兑现。`dsh` 把兑现交还给三个操作系统的内核机制：Linux 上先找 bubblewrap 再找 Landlock，macOS 上走 Seatbelt，Windows 上走 ACL 受限令牌。每个平台一条候选链，启动时探测，选中的结论缓存到 provider 生命终点。最有性格的是诚实度设计：每次执行都报告强制力是 full 还是 partial，Windows 的 ACL 档和老旧 Landlock 内核档自我申报 partial，要求绝对边界的消费者可以直接拒绝。沙箱坏了和命令被拒用两套签名区分，绝不让一个坏沙箱冒充一次拒绝。本篇按 2026 年 9 月下旬的仓库状态拆这四套原语和它们背后的选择器。

## 问题：谁来兑现"只能写工作区"

从一个具体场景进。agent 在 workspace-write 模式下跑 `npm install`：要写工作区里的 node_modules，要写临时目录，尝试碰 `/etc/passwd` 时必须被挡住。这条策略谁来执行？答案得往下挖三层才到底：策略服务只是账本，真正把"不许写"变成内核级事实的，是每台机器操作系统自带的隔离机制。

麻烦在于三个操作系统给的是三套完全不同的东西。Linux 有 mount namespace（bubblewrap 用它）和 Landlock（无特权的内核 LSM）；macOS 有 Seatbelt（sandbox-exec 策略引擎）；Windows 两者都没有，只有令牌和 ACL 这套权限账本。同一句"只能写工作区"，在三台机器上落地成三种完全不同的机制，各自的语义缝隙还都不一样。

模式怎么解析、审批怎么升级，这些属于沙箱的策略层。这篇下到底层，看承诺的执行者。

## 三十秒模型

一句话：**平台先选链，探测定成员，结论用到底。**

每个平台一条候选链：Linux 是 bubblewrap 打头、Landlock 兜底；macOS 只有一条 Seatbelt；Windows 是内置的 ACL 受限令牌运行器。链上只有一个候选时不探测直接选；多个候选时按链序做一次功能性探测，第一个可用的胜出，结论在 provider 的整个生命周期内缓存。整条链全灭，或者平台没有链，`confine()` 以 `SANDBOX_UNAVAILABLE` 失败关闭，并报出该平台的候选项名单。命令永远不会因为沙箱不可用而悄悄裸跑。

## 强制力是报告出来的事实

这套设计最值得学的一点，是把"沙箱有效"从承诺改成了测量结果。每次受限执行都带一份强制力申报：`full` 意味着后端管辖策略承诺的全部文件效果；`partial` 意味着只管辖得住其中一部分。

当前两处 partial 是明摆着的。Windows 的 ACL 档：受限令牌为了进程能初始化必须保留 Everyone 组，于是任何外部对象只要给 Everyone 授了写权限就仍然可写；NTFS 硬链接还能把工作区内的一个文件别名化到工作区外的路径，同一个文件对象两条路。老旧 Landlock 内核档：旧的 ABI 只暴露部分访问类别，管得到的类别才被管辖。

申报制改变的是消费者的决策结构。要求绝对写边界的调用方看到 partial 可以直接拒绝执行，而不是信任一个名义上的沙箱然后被硬链接教做人。诚实的 partial 比虚假的 full 值钱，这句话整个子系统都在身体力行。

## 三套原语各自的形状

**bubblewrap（Linux 首选）** 用 mount namespace 造一个假世界：宿主根以只读挂载，一个全新的 /dev，/proc 来自一个私有 PID namespace。最后这条最讲究：命令看不见宿主的进程表，procfs 的 magic link 也就没法绕过挂载表去摸宿主文件。workspace-write 档追加一个随用随弃的 /tmp 和一个可写的工作区绑定挂载。隔离是"看见的世界就是全部世界"，不是"看见一切但不许碰"。

**Landlock（Linux 兜底）** 是无特权进程可用的内核 LSM，按访问类别授权。`dsh` 对它的封装方式体现了一个版本纪律：功能性探测、路径解析、授权词汇表全部收在一个带版本的二进制模块里，provider 这边只做模式到授权的映射。内核 ABI 的脏活被版本边界挡在插件之外，老内核报 partial 的判定也归那个版本化的模块所有。

**Seatbelt（macOS）** 是默认拒绝式策略：以 `deny file-write*` 开局，再从共享的可写根推导出写许可清单。它匹配的是解析后的路径，所以每个根都要先规范化，macOS 上 /tmp 就是 /private/tmp，不规范化许可清单就白写。这档的原罪是政策引擎本身：sandbox-exec 是苹果标记废弃的私有机制，苹果哪天真拿掉，这个 provider 既不能替换也不易探测，只能坏给你看。

**Windows ACL** 是唯一不用"造世界"思路的一档，它改账本：给工作区算一个确定性 SID（从规范化工作区路径派生，跨会话不变），在工作区上落一条常驻的允许 ACE（每个工作区在服务生命周期内只具现一次，之后 O(1)）；每个活跃会话另配一个随机私有临时目录，独立 SID、可撤销 ACE。受限运行器通过参数拿这两个 SID，自己不再管 DACL。会话崩了留下的残余授予既拦不住也不会授权一个恢复的会话：新 provider 永远选新的临时路径和新 SID。共享同一工作区的会话共享它该有的写权限，但互相继承不了对方的临时区权限。

## 坏沙箱不是被拒绝的命令

受限执行失败有两种根本不同的死法，混在一起就是事故。命令被策略拒绝（写 /etc 被挡），这是沙箱在正常工作；运行器自己崩了或拒绝加载策略（沙箱坏了），这是基础设施故障。前者该报给模型"此处不可写"，后者该报给运维"沙箱需要修"。

区分靠两套方言。每个运行器的内核拒绝消息有自己的措辞，作为拒绝签名随每次封装下发；每个运行器还有自己的致命签名表，标记"运行器自身失败"的特征。消费者先分类运行器故障，再看拒绝签名。配合失败关闭的 `SANDBOX_UNAVAILABLE`，三种结局（拒绝、运行器故障、无可用沙箱）各自可辨。

还有一个逃生门值得点破：自定义运行器命令是运维的断言。配置了它就跳过功能探测，声明"我配的这东西诚实实现了 bubblewrap 兼容的配置面"。如果它本身是个 bash 脚本，解释器启动发生在脚本施加隔离之前，这个窗口是运维自己的。

## 权衡

这套 provider 的定位边界要先说清：它共享宿主内核和文件系统，是"在本机把命令关进栅栏"，不是"给命令一个隔离环境"。需要真隔离（内核版本、依赖、网络环境都另起炉灶）时，正确答案是容器或远程执行器，那是换能力不是调参数，接缝体系里另有其位。

选中的运行器结论缓存到 provider 生命终点：中途装了新沙箱、修了坏的，要重载插件才会重新选择。这是把"启动时探测一次"的确定性置于"运行中自动切换"的灵敏性之上，对一个安全机制来说，行为可预期比自作聪明重要。

对评估者的总账：Linux 上 bubblewrap 档基本可以按 full 信任；Windows 档要按 partial 的本义对待，独立边界控制另想办法；macOS 档当下可用，但要看着苹果的脸色。一个跨平台产品的安全叙事能诚实到把这三句话印在自己的执行结果里，这本身就是工程设计。

## 延伸阅读

- [sandbox-local 包](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/sandbox/sandbox-local)：候选链、平台档与失败方言
- [sandbox-windows-acl 包](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/sandbox/sandbox-windows-acl)：Windows 受限令牌运行器
- [进程沙箱子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/sandbox.md)：模式、逐调用策略与方言分类
- [子进程沙箱决策笔记（2026-07-06）](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-07-06-sandbox.md)：能力边界与运行器选择语义
- [bwrap 私有 PID namespace 修复笔记（2026-08-06）](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/bug-fix/2026-08-06-bwrap-private-pid-namespace.md)
