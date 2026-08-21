# dsh 的 Filesystem 接缝：读写编辑与观察策略

> `dsh` 的文件系统不是一个"读写函数集"，而是四个解耦的包，provider 只管原子读写、观察策略通过事件加新鲜度护栏、工具只负责执行和渲染，三者靠 `fs/*` 事件共享词汇表，谁都不直接依赖谁。
> 最反常识的一条：read-before-edit 是一层**可选的策略插件**，不是 provider 自带的；裸 provider 会无条件覆盖，装上策略才变成"先读再写"，而卸掉策略工具照常工作。

## 为什么文件系统要做成接缝

粗看，agent 读写文件就是几个函数：读、写、改、列目录。直接用 `fs.readFile` 不就行了？

认真想下去，"直接用"远远不够：

- agent 在远程沙箱里跑时，文件不在本地磁盘上，`fs.readFile` 读的是宿主机，不是 agent 看到的世界。
- agent 改文件前，怎么保证它"看过"这个文件？不看过就改，等于盲改，可能把别人刚改的内容覆盖掉。
- 同一个文件有多条路径（符号链接、相对路径），怎么保证不同路径指向的是同一个东西？
- 一个写操作跨进程边界时，怎么和沙箱的"能写哪里"对齐？
- 文件 IO 要不要设超时？设了能不能真管用？

`dsh` 把这些拆成四个包，各管一摊：

| 包 | 角色 | 干什么 |
|---|---|---|
| `dsh-fs` | Service Definition | 拥有 `ctx.fs` 接缝、原子文本操作、`fs/*` 事件词汇表 |
| `dsh-fs-local` | Provider | 本地磁盘实现 |
| `dsh-fs-observation-policy` | Policy（可选） | 记录观察到的存在/缺席，通过事件加新鲜度护栏 |
| `dsh-tool-fs` | Consumer | 执行模型面向的 read/write/edit，渲染读取窗口 |

注意一个关键事实：`dsh-fs-observation-policy` 是可选的。没有它，`FileSystem` 接口、一个 provider、`dsh-tool-fs` 消费者，就构成一个完整、不受约束的文件系统接缝：`write` 无条件创建或覆盖，`edit` 无条件替换字面文本。策略插件改变的是这些操作的"意图决策"，不是操作本身。卸掉它工具不坏，因为工具调的是 `ctx.fs`、派发的是事件，从不调策略方法。

这条设计的深意是：**读写能力和读写策略是两层**。能力由 provider 提供，策略由事件挂上。换后端不影响策略，换策略不影响后端。

## 接缝：`ctx.fs`

`ctx.fs` 的服务类型是 `FileSystem`，定义在 `packages/fs/fs/src/index.ts`。十来个 provider 原语按用途分四组：身份与坐标（`resolve`、`processPath`、`fileUrl`、`contains`），元数据（`stat`、`lstat`、`listDir`），读取（`readText`、`streamText`、`readBytes`），变更（`writeText`、`editText`）。下面挑有设计含量的说。

### 不透明的目标身份

每个操作第一步都是把用户给的路径解析成一个不透明的后端目标 `FsTarget`。它有两个字段：`targetKey` 是不透明 key，消费者绝不能解析，也不能假设它是本地绝对路径；`displayPath` 是给模型和 UI 看的路径，可能是本地绝对路径、相对路径或远程 URI。

`targetKey` 是 branded 不透明字符串。本地后端用类似 realpath 的字符串，远程后端可能用 workspace URI 或文件 id。把它做成黑盒，是为了逼消费者走正路拿坐标，而不是自己猜后端 internals。

那消费者要跨能力协作怎么办？比如 fs 读到的文件，shell 要打开它。答案是通过 provider 提供的坐标方法，而不是自己解析身份：

- `processPath(target)`：返回这个 fs 执行世界里子进程能打开的规范绝对路径。
- `fileUrl(target)`：返回 provider 平台的 `file:` URI。
- `contains(parent, child)`：测规范身份或后代包含关系。

这三个方法把"跨能力坐标"收敛到 provider。fs-local 给本地路径，fs-sandbox 或远程 provider 给的是那个世界里的路径，消费者不用知道差异，shell 和 fs 才能共享同一个执行世界。

### 新鲜度令牌

`FsVersion` 是另一个 branded 不透明令牌，write/edit 用它防陈旧。本地后端从高分辨率 stat 身份和新鲜度字段派生它，远程后端可能用 revision id。策略层记录它用于陈旧检查，消费者不解释它。

### stat 与 lstat

`stat` 返回元数据（绝不返回内容），目标不存在时返回 `undefined`。`type` 让消费者在读之前拒绝目录和特殊文件，`size` 让文本消费者不靠试错就能选 `readText` 还是 `streamText`。

`lstat` 是路径级的不跟随原语。它接路径而非 `FsTarget`，因为 `resolve` 故意跟随符号链接产生稳定身份，而要做信任边界检查的消费者可以先 `lstat`、在 resolve 之前拒绝 `symlink`。这处理了一个安全场景：仓库里有个符号链接指向仓库外，你不希望 agent 顺着它读出去。

### 读取的三种形态

- `readText`：整文件一个字符串。
- `streamText`：大文件的解码文本块流，后端负责跨块 UTF-8 解码和二进制拒绝，策略层从不碰原始字节。
- `readBytes`：原始字节，带必填的 `maxBytes` 上限。已知或发现的超限会以 `FS_TOO_LARGE` 失败，而不是截断或无界缓冲。

`readBytes` 把上限放在接缝上，是为了让后端永远不能缓冲一个无界文件。宁可明确失败，也不静默截断。

## write 与 edit：带可选护栏的原子操作

这是文件系统设计最精巧的部分。`writeText` 和 `editText` 的版本护栏都是可选的，护栏类型 `FsWriteIntent` 有两个变体：`createIfAbsent` 表示目标不存在才建，已存在则报 `FS_NOT_OBSERVED`；`replaceIfVersion` 表示版本匹配才替换，否则报 `FS_STALE_VERSION`。

省略 `expected` 就是无条件创建或覆盖。"不护栏"通过省略表达，不是联合类型里的第三个分支，write 和 edit 因此共用同一个可选 `expected` 字段。

`editText` 是 provider 级的单一变更，不是在别处组合的"读加写"。带护栏时，它先校验版本再字面匹配，所以陈旧的编辑报 `FS_STALE_VERSION`，而不是对更新后的内容匹配失败。无论是否护栏，匹配、行尾处理、陈旧检查、原子替换都在一个变更临界区里：一次编辑要么完整成功，要么完整失败，没有"匹配了但没写成"的中间态。

返回的 outcome 里带 `before` 和 `after`，都是 LF 规范化的存储文本，不是 diff。消费者在结果时自己算上下文 diff。存的是文本，diff 是派生的，"存储真值"和"展示差异"就此分开。

## read-before-edit：一层策略，不是 provider 内置

现在讲最反常识的部分。"先读再改"不是文件系统 provider 自带的行为，而是一层可选的策略插件 `dsh-fs-observation-policy`。

### 它怎么工作：观察状态

观察状态是个 `WeakMap<owner, Map<targetKey, FsObservation>>`，存在策略插件里。`FsObservation` 加上缺表项一共三态：

- 缺表项：没见过。
- `absent`：一次读取或编辑的 metadata miss 确认了它不存在。
- `present` + version：读、写、编辑观察到了这个版本。

两个决策都从这三态出发。写入决策把"没见过"和"缺席"映射成 `createIfAbsent`，把"存在"映射成 `replaceIfVersion`。编辑决策把"没见过"映射成 `FS_NOT_OBSERVED`，"缺席"映射成 `FS_NOT_FOUND`，"存在"映射成它的版本护栏。

owner 从事件 actor 派生（通常是 `exec.agent.session`），当作不透明对象身份用（WeakMap 的 key），策略包从不读它的任何字段。插件销毁时丢掉全部状态（HMR 安全），策略本身不做任何文件系统 IO。

### 共享词汇表，发射方不依赖监听方

这是整个设计的精髓。`dsh-fs` 拥有三个事件，工具派发、策略监听，发射方（`dsh-tool-fs`）和监听方（`dsh-fs-observation-policy`）共享一套词汇表，而发射方不依赖策略插件：

- `fs/write-intent`、`fs/edit-intent`：单槽决策 waterfall。工具带一个返回 `undefined`（裸 provider）的默认 thunk 派发，监听器完全决策、不调 `next()`。槽按注册顺序先到先得，策略插件拥有它是个部署约定，不是强制不变量。
- `fs/observed`：即发即忘的记录事件，携带 `FsObservation`。监听器必须同步、只做副作用，因为工具不保护这个 emit。一个抛错的监听器可能把一次读错误替换掉，或在变更已经成功后表现为工具的 `isError` 结果。

事件载荷只带 `dsh-fs` 词汇加一个不透明 `object` actor，没有模型面向的概念，也没有 agent/session owner 结构。策略插件需要的执行上下文，通过一个最小结构视图 `FsObservationActor` 拿到：`dsh-tool-fs` 把自己的执行对象直接当 actor 传过去，策略包不用 import 工具、agent 或 session 包。

### 一个反直觉：局部读取就能授权后续编辑

很多人以为"要授权编辑一个文件，得先把它整个读过"。`dsh` 的答案是不必。

读取的结果只有展示意义，没有 full/partial 之分。授权基于新鲜度：工具在 stat 拿到版本后，直接 emit 一个 present 的 `fs/observed`。所以**任何窗口化的读取，哪怕只读几行，都能在文件未变时授权后续的 write/edit**。一次 metadata miss（读不存在的文件）则 emit 一个 absent 观察，允许后续护栏式 write 重建一个被外部删除的目标，但不授权 edit。

这条规矩的实际意义很大：agent 读一个大文件的一小段，就能安全地编辑它，不用把整个文件塞进上下文。授权的依据是版本令牌，不是"读全了没有"。

## 与沙箱共享执行世界

`writeText` 和 `editText` 都接一个可选的 `sandboxPolicy` 参数（含 mode 和 workspaceRoot）。沙箱后端（`dsh-fs-sandbox`）按它围栏这次写，裸后端忽略它。

把 `ctx.fs` 和 `ctx.subprocess` 都指向同一个远程沙箱时，fs 的写、shell 的命令、LSP 的查询全都跟着同一个 sandbox mode 走。接缝在签名上预留这个参数，"按共享 sandbox mode 围栏"就是一次调用能携带的事，不用在外面拼装。

错误码上也能看出这层关系：`FS_SANDBOX_DENIED` 是沙箱后端的策略拒绝（mode 围栏否决了写），`FS_PERMISSION_DENIED` 是宿主内核拒绝，两者是不同的码。消费者按码分支，不用解析消息。

## 文件 IO 没有超时

这是个容易忽略的细节。`read`/`write`/`edit` 不接 `timeoutMs`，provider 契约也不上截止时间。

原因在于本地系统调用顶多是"尽力可中止"：超时没法强制一个进行中的 `fsync` 或 `rename` 停下来。在这里设 `timeoutMs`，就是一个接缝无法执行的截止时间，而"显式优于隐式"禁止在无法执行的地方放一个假装能执行的默认值。

对比一下：bash 和 web 消费 `@deepseek-ai/dsh-timeout`，subprocess 支撑的 `glob`/`grep` 声明的 `timeoutMs` 由 `@deepseek-ai/dsh-tool-call-timeout-policy` 执行。那些是进程支撑的，截止时间真能杀掉工作。文件 IO 不行，所以干脆不设。取消仍然通过工具执行信号在系统调用边界尽力传播。

## 错误分类：稳定码，不靠文本

文件系统失败用稳定的 `FsErrorCode` 字符串，由 `FsError`（`HarnessError`）携带。工具注册表在错误结果上保留 `{ name, code }`，重试、权限、UI 层可以不解析消息就分支。封闭联合共十三个码。

值得记住的区分有两处。`FS_NOT_OBSERVED` 是策略没有观察记录（或 createIfAbsent 撞上已存在文件），`FS_NOT_FOUND` 是确认缺席，一个"没看过"、一个"看过不在"，编辑决策就是靠这两个码分开"没见过"和"确认不存在"。`FS_STALE_VERSION` 是版本不匹配，陈旧编辑报它而不是匹配失败。沙箱拒绝和内核拒绝的区分上一节讲过。新鲜度授权没有 partial/full 之分，所以没有 `FS_PARTIAL_OBSERVATION` 这种码。

## 真实代码落点

- `packages/fs/fs/src/types.ts`：`FsTarget`、`FsVersion`、`FsInfo`、`FsWriteIntent`、`FsEditRequest`、`FsErrorCode`。
- `packages/fs/fs/src/index.ts`：`FileSystem` 抽象接缝，全部原语签名，加 `fs/*` 三个事件。
- `packages/fs/fs-local`：本地磁盘 provider。
- `packages/fs/fs-observation-policy/src/types.ts`：观察策略的类型，`FsObservation`、`FsObservationActor`。
- `packages/fs/tool-fs/src/read-render.ts`：读取窗口渲染，`FileReadOutcome`。

## 权衡与局限

这套设计把一部分可靠性押在部署约定和监听器自律上，换来的正交性有具体的价码。

read-before-edit 是部署约定，不是强制不变量。单槽 waterfall 的拥有权靠注册顺序先到先得，理论上另一个插件可以先注册占住槽。实践中部署会一起加载 `dsh-tool-fs` 和 `dsh-fs-observation-policy`，默认行为是 read-before-write，但这不是编译期保证。

`fs/observed` 的 emit 不被保护，一个行为异常的同步监听器能在变更已经成功后把结果变成 `isError`，或替换掉读错误。发射方因此保持简单，不用包 try-catch，代价转到监听方头上，监听方必须自律。

不透明身份增加调试难度。targetKey 和 FsVersion 都是不透明 branded 字符串，日志里看到的是一串 id，要回到 provider 才知道它指什么。这是"实现细节和对外契约隔离"的代价。

文件 IO 无超时，长卡的操作没有截止手段，只能靠取消信号在系统调用边界尽力中止。对绝大多数本地操作这不是问题，极端场景下要心里有数。

## 结论

`ctx.fs` 把文件操作拆成能力、策略、消费三层，靠 `fs/*` 事件共享词汇表：provider 只管原子读写和版本令牌，read-before-edit 是可选策略插件加上的护栏，工具不依赖策略插件的存在。editText 是 provider 级单一原子变更，局部读取就能靠版本令牌授权后续编辑。"换后端"（本地、沙箱、远程）和"换策略"（是否 read-before-edit）由此成为两个正交的轴，这就是接缝的价值。

## 延伸阅读

- [Filesystem 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/filesystem.md)：本文主要依据，含全部类型与接缝定义
- [Capability Seams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)：`ctx.fs` 行，fs-local / fs-sandbox provider
- [Process Sandbox](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/sandbox.md)：`sandboxPolicy` 参数与执行世界共享
- [`packages/fs/fs/src/index.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/fs/fs/src/index.ts)：`FileSystem` 抽象接缝与 `fs/*` 事件源码

上一篇：[沙箱、审批与权限：dsh 怎么安全地放 agent 上机](./19-sandbox-approval-permission.md)
下一篇：[dsh 命令执行三层：Subprocess / Shell / Terminal](./21-shell-subprocess-terminal.md)
