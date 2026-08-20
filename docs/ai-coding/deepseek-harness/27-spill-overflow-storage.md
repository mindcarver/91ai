# Spill 溢出存储：超大工具结果去哪了

> 如果只能从这篇带走一句话：当一个工具结果大到塞不进模型上下文，`dsh` 不砍它也不截它，而是把完整内容存到 session 级的溢出存储里，给模型一个不透明的定位符加一句"用 read 或 grep 取这个路径"的检索提示。
> 这和压缩是互补的：压缩解决"很多中等内容"，spill 解决"单个超大内容"。spill 接缝只管存，策略、替换、保留归别的层。

## 一个压缩救不了的场景

压缩有个边界：单个超大的保留单元，没法靠表面压缩修复。为什么？因为压缩要么修剪（砍中间留头尾），要么总结（跑模型生成摘要）。但有些工具结果，你既不想无脑砍它，也不想让它被总结成一团模糊的摘要。

比如 agent `web_fetch` 了一份完整的 API 文档、`cat` 了一个几万行的日志、grep 出了大量匹配。这些内容的特点是：它本身就是有用的完整数据，砍了就残缺，总结了就丢细节。但它的体积又大到塞不进上下文，硬塞进去要么撑爆、要么挤掉别的内容。

这种"单个超大内容"需要一个不同的处理：把它整个搬到上下文之外存起来，给模型一个"钥匙"，模型需要哪段时自己去取。这就是 spill 干的事。

## 接缝：`ctx.spillStore`

`ctx.spillStore` 的服务类型是 `SpillStore`，定义在 `packages/spill/spill`。它是一个可选能力，不在 agent-loop 主干里。它的关键特征是**极简**：只有一个方法 `saveText`。

### 一个方法，只管存

`saveText(input)` 是接缝的全部操作：把 `content` 原样持久化，返回一个不透明的定位符、后端给的检索提示、和精确的字节数。请求 `SaveTextSpill` 携带：

```ts
interface SaveTextSpill {
  owner: SpillOwner          // 保存时的存储命名空间（sessionId）
  source: SpillSource         // 产生它的工具和调用（用于命名和检查，不做访问控制）
  suggestedName: string       // 调用方建议的名字（提示，不是路径）
  content: string             // 要持久化的完整文本（UTF-8）
}
```

`saveText` 持久化**完整**的 `content`，在真正的存储失败（权限、磁盘满、后端不可用）时 **reject**。由调用方决定怎么降级。

这个接缝**只管存储**。它不管保留策略、不做工具结果替换、不提供检索或搜索 API。这三件事分别归别的层：保留归 `dsh-output-retention` 库，替换归策略消费者，检索是模型用别的工具（read、grep）按提示去做。这种"接缝只做一件事"的克制，和 fs 接缝的"provider 只管原子读写"、LSP 的"只暴露四个操作"是一脉相承的。

### 定位符加检索提示

`SpillRef` 是保存的结果：

```ts
interface SpillRef {
  locator: SpillLocator   // 不透明的模型面向句柄
  bytes: number           // 精确字节数
  retrievalHint: string   // 后端给的检索提示
}
```

`SpillLocator` 是个 branded 不透明句柄。本地后端把它渲染成一个文件系统路径；远程或数据库后端可以渲染成 URI、key 或命令令牌。消费者把它当不透明的，用 `retrievalHint` 渲染，**不假设 `read` 永远是正确的检索方式**。

这条"不假设 read"很重要。本地后端的 hint 告诉模型"用 read 或 grep 取这个路径"，但一个远程后端可能给的是"用某个 API 查这个 key"。如果消费者硬假设定位符总是个能 read 的路径，换个后端就坏了。用 hint 而不是假设，让检索方式跟着后端走。

### source 不做访问控制

`SpillSource` 记录产生溢出内容的工具和调用（`toolName`、`callId`、`label`），但文档明确：它**不被解释为访问控制**，纯粹是描述性的，用于起可读的文件名和检查。

访问控制靠的是 `owner`（session 命名空间）和后端的私有存储，不是靠"这个 source 有没有权限"。这和 jobs 接缝的"靠 owner 授权不靠 id 保密"是同一种思路：安全边界建立在归属上，不建立在描述性元数据上。

## 本地后端：session 级私有文件

`dsh-spill-local` 是本地 provider，把溢出内容写到宿主文件系统的私有 session 级文件里。路径布局是：

```
<root>/session-<hash>/<random>-<safeName>
```

- `<root>` 是配置的或懒创建的私有（0700 权限）根目录。
- `sha256(sessionId)` 做 session 子目录，把不同会话的溢出隔开。
- `<random>-<safeName>` 是文件名，随机前缀加从 `suggestedName` 净化来的安全名。`suggestedName` 只是个命名提示，后端把它净化成单个安全的路径段，它**绝不是路径**。

几个安全细节值得记：

- **独占的 owner-only 写**：用 `open(path, 'wx', 0o600)`，`'wx'` 标志意味着文件已存在就失败（独占创建），`0o600` 是只有 owner 能读写。这样**一个被种下的符号链接没法重定向写入**。如果攻击者预先在目标位置放了个符号链接指向别处，`'wx'` 的独占语义会让写入失败，而不是顺着链接写过去。
- **session 隔离**：`sha256(sessionId)` 子目录让一个会话的溢出内容和另一个的分开。

这套安全措施把"把模型生成的大文本写到磁盘"这个 inherently 有风险的操作，收得相当紧。

## 策略消费者：`tools/post-execute` 替换

光有存储不够。谁来决定"这个工具结果太大，该溢出"？这是策略消费者 `dsh-spill-policy` 的活，它挂在 `tools/post-execute` 这个 waterfall 上。

策略的逻辑是：当一个纯文本的最终结果超过了 `maxInlineBytes`，就用保留库（`dsh-output-retention`）的头/尾预览，加上溢出引用，**替换**掉原本要内联返回的结果。模型拿到的不是一个几万行的大文本，而是一段"开头加结尾加'完整内容存在这个路径，用 read 或 grep 取'"的精简结果。

关键是这条策略是**尽力而为**（best-effort）：如果 `saveText` 失败了（比如磁盘满），策略保留原始的内联结果，而不是把一次成功的工具调用变成 `isError`。这是个重要的降级选择：溢出是优化，不是必需。存不下就退回内联，宁可让上下文大一点，也不让一次本来成功的调用报错。

## 触发点：tools/post-execute

回顾工具执行管线：`tools/post-execute` 是工具执行后、结果规范化前的 waterfall。spill 策略挂在这里，因为它要在工具结果**即将进入模型上下文之前**拦截它。

这个位置选择很讲究。如果在 `tools/execute` 之前拦截，工具还没跑，不知道结果多大；如果在 `tools/result` 之后，结果已经进上下文了，晚了。`tools/post-execute` 正好是"结果已产生、还没进上下文"的窗口，spill 在这里判断大小、决定是否搬走。

挂载方式是标准的 Cordis waterfall 监听器，和 hooks、权限这些横切关注点共享同一个管线。这意味着溢出策略和其他工具后处理（比如结果改写、加上下文）是平行的、可组合的，不互相耦合。

## Fork 继承：定位符跟着日志走

`SpillOwner.sessionId` 是保存时的存储命名空间。一个被 fork 的会话，从种子日志里**继承**已有的溢出定位符；这些工件**不被复制、也不重新归属**。fork 之后新产生的溢出用子会话的 id。

这条规矩和 attachment 接缝的"存留中立"很像：fork/resume 共享同一批溢出工件，不复制。定位符是日志里的引用，fork 把日志带过去，定位符就跟着过去了。实际工件还在原来的存储位置，谁引用谁取。

一个保留期清理可能让旧的定位符和别的旧会话工件一起过期，但 spill 接缝**不定义** per-session 的清理策略。清理归更高层，不归这个只管存的接缝。

## 和压缩的分工

把 spill 和 compaction 并排看，分工清晰：

| | compaction | spill |
|---|---|---|
| 解决什么 | 很多中等内容撑爆上下文 | 单个超大内容塞不进去 |
| 怎么减负 | 修剪（确定性）或总结（模型调用） | 整个搬到上下文外，给定位符 |
| 信息损失 | 修剪砍中间，总结丢细节 | 不损失，完整存着，按需取 |
| 触发 | 压力探测、溢出检测 | tools/post-execute，超 maxInlineBytes |
| 成本 | 修剪廉价，总结贵 | 一次磁盘写，廉价 |

一个对话里两者可能同时存在：压缩把一堆中等内容压成摘要，spill 把一个超大结果搬走。它们不冲突，各管各的场景。压缩文档说"单个超大单元救不了"，spill 正是那个"救单个超大单元"的机制。

## 真实代码落点

- `packages/spill/spill/src/types.ts`、`index.ts`：`SpillStore` 接缝、`SaveTextSpill`、`SpillRef`、`SpillLocator`。
- `packages/spill/spill-local`：本地 provider，私有 session 级文件，`open(path, 'wx', 0o600)` 独占写。
- `packages/spill/spill-policy`：`tools/post-execute` 策略消费者，超 `maxInlineBytes` 替换。
- `packages/util/output-retention`：保留库，提供头/尾预览，预览机制归它不归 spill 接缝。

## 权衡与局限

**模型得主动取溢出内容。** spill 把内容搬出上下文，模型只拿到定位符和提示。要用里面的数据，模型得发 read 或 grep 工具去取。这比内联多一次往返，但对超大内容别无选择。

**只存文本。** `saveText` 只存 UTF-8 文本。二进制大对象（比如大图片）走 attachment 接缝（回忆多模态那篇），不走 spill。两个接缝分工：文本溢出走 spill，二进制归 attachment。

**本地后端不加密。** 私有文件（0o600）靠文件系统权限保护，不加密。在多用户机器上，root 还是能读。对敏感内容，这是个要意识到的边界。

**保留策略不在接缝。** spill 只管存，不管什么时候删。长期运行的部署会累积溢出文件，需要更高层的清理策略。这和 attachment 的 GC 是同类问题：为了 fork/resume 正确性，宁可累积，也不绑死在单个会话的删除上。

**尽力而为，失败退回内联。** 存不下就退回内联结果，让上下文大一点。这是对的降级，但意味着在磁盘紧张时，溢出可能突然不生效，上下文又变大。运维上要给溢出存储留够空间。

## 结论

`ctx.spillStore` 是个极简的单方法接缝：`saveText` 把完整文本原样存到 session 级私有存储，返回不透明定位符加检索提示。它只管存，策略、替换、保留、检索都归别的层。策略消费者挂在 `tools/post-execute`，把超 `maxInlineBytes` 的内联结果换成头/尾预览加溢出引用，尽力而为，失败退回内联。

几个判断值得带走：spill 和压缩互补，一个治"单个超大"、一个治"很多中等"；定位符是不透明的，检索方式跟后端走，不假设永远是 read；本地后端用独占 owner-only 写防符号链接攻击；fork 继承定位符不复制工件；溢出是优化不是必需，存不下就退回内联，不让成功调用变 isError。

这套设计把"超大工具结果"这个会让上下文瞬间爆炸的问题，用"搬到外面加给把钥匙"解决了。它不损失信息，不依赖模型自己管理，在工具结果即将进上下文的那个窗口干净地拦截。和压缩一起，它们覆盖了上下文体积管理的两种主要场景。

## 延伸阅读

- [Spill Storage 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/spill.md)：本文主要依据，含接缝、本地后端、策略消费者
- [Tool output spill files 笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md)：溢出存储的设计理由
- [Tool Execution Pipeline](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-execution-pipeline.md)：`tools/post-execute` 挂载点
- [Compaction](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/compaction.md)：互补的上下文压缩机制
- [Durable Image Attachments](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/attachment.md)：二进制大对象归 attachment 不归 spill

上一篇：[上下文压缩 Compaction：对话太长怎么给模型腾地方](./26-compaction-context-compression.md)
下一篇：[跨会话记忆：session-query / projection / reference](./28-cross-session-memory-query-projection-reference.md)
