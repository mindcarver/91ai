# 上下文预算：Compaction 压缩与 Spill 溢出

> `dsh` 管上下文体积靠两个互补机制——**压缩**（compaction）治"很多中等内容撑爆上下文"，**溢出**（spill）治"单个超大内容塞不进去"；压缩没有面向模型的 compact 工具、由 harness 被动驱动、先确定性修剪后总结，spill 把超大工具结果整个搬到上下文外、给模型一个不透明定位符加检索提示。
> 测量这件事归单例 `ctx.tokenMeter`，它把请求压力和表面定价统一成一个可重放的快照。

## 反常识：没有 compact 工具

很多人第一次想"上下文太长怎么办"，本能方案是给模型一个 `compact` 工具，让它在觉得历史太长时自己调用，总结一下前面的对话。直觉上这很自然：模型最懂哪些内容重要，让它自己压缩最合理。

`dsh` 偏不这么干。压缩不是一个模型面向的工具。模型在它的工具列表里找不到"压缩历史"这个选项。压缩完全由 harness 驱动，触发点是两个被动的、事件驱动机制：

- **压力触发**：`agent/pre-step` 这道串行关卡，在每个模型请求**之前**探测上下文压力。压力够了，就考虑压缩。这一步在请求派生之前跑，所以压缩发生在模型看到请求之前。
- **溢出触发**：`agent/request-error` 在一次失败的请求**之后**收到 provider 报的上下文溢出（回忆 LLM 适配器那篇，溢出归一成 `CONTEXT_WINDOW_EXCEEDED` code）。这时尝试压缩来救场。

为什么不让模型自己压缩？因为"什么时候该压缩"是个工程判断，不是内容判断。模型自己调压缩工具有几个问题：它可能忘了调、可能调早了浪费一次昂贵的总结调用、可能调晚了已经溢出报错。把触发权交给 harness 的压力探测和溢出检测，压缩的时机就是确定性的、可预测的，不取决于模型记不记得。

有个细节要分清：**有一个面向人类的 `/compact` 命令**（`dsh-command-compact` consumer），让人可以手动触发压缩。但那是人发的命令，不是模型工具。模型这一侧，压缩永远是被动触发的。

## 先修剪，后总结

这是压缩流程里最实用、也最容易被忽略的一条。当压力够格时，`compaction-basic` 不是直接去跑 summarization，而是**先调可选的 `ctx.toolResultPruner` 修剪当前的超大工具结果，再重新测量**。

为什么先修剪？因为对话变长，最常见的原因不是"话太多了"，而是"某个工具结果太大了"。一个 `cat` 了大文件的 bash 输出、一个 web 抓取的长 HTML、一个 grep 的大量匹配，这些单个工具结果可能就占了几万 token。修剪它们是**确定性的、廉价的、无损语义的**（保留头尾、砍中间），比跑一次模型 summarization 便宜得多、可靠得多。

修剪完重新测量（通过 `ctx.tokenMeter`），如果压力降下来了，**表面就可以推进，不需要总结**。文档原话：修剪后重新测量，可以不靠 summary 就推进表面。只有修剪还不够时，才上 summarization 这个更重的后手。

这个"先廉价确定性手段，后昂贵模型手段"的分层，是 `dsh` 工程审美的典型体现。

## 工具结果修剪器：`ctx.toolResultPruner`

`ctx.toolResultPruner` 是个确定性的头/中/尾修剪服务，作用于当前的模型可见表面节点。它有三个方法：

- `measureContent(blocks)`：按 Unicode 码点测文本内容大小，非文本块算零。
- `pruneContent(blocks)`：把超预算的文本中间替换掉，保留富块的顺序。切片按 Unicode 码点走，不是 UTF-16 码元，所以保留的边界不会切断一个代理对。
- `pruneSession(session)`：对当前表面快照里每个超预算的工具结果做替换。每个替换保留完整的事件数据、只改 `content`，引用被遮蔽的节点（让回放能恢复替换前的输入），而且**前面紧跟一条 `compaction/prune` 阴影定价事件**，通过注入的 token meter 给被遮蔽节点定价，这样纯消费者不用维护每节点状态就能减去它。

按 Unicode 码点而不是 UTF-16 切，这条值得记。JavaScript 的字符串是 UTF-16，一个 emoji 可能是两个码元（代理对）。按码元切，可能把一个 emoji 切成两半变成乱码。按码点切保证不会切断代理对。这是个细节，但体现了"修剪不能制造新的损坏"的纪律。

## 测量：`ctx.tokenMeter`

测量请求压力和表面定价的，是单例 `ctx.tokenMeter`。它是个重放（replay）owner：通过会话的持久日志尾部重放出当前的请求压力和表面快照。

`measure(session, requestHeader?)` 返回一个**脱离的、深度不可变的**测量快照 `TokenMeasurement`：

```ts
interface TokenMeasurement {
  logRevision: number              // 消费的持久事件数，等于下一个未读事件 seq
  baseline: TokenMeasurementBaseline  // provider 或启发式锚点
  surfaceDeltaTokens: number       // 相对锚点的有符号重定价
  totalTokens: number              // 当前请求加响应压力（非负）
  surfaceTokens: number            // 当前表面的启发式 token 总数
  nodes: readonly TokenSurfaceNode[]  // 当前表面节点，位置头到尾顺序
}
```

baseline 有两种。`usage` 表示最近一次成功的 provider 调用有相同的规范请求信封、且它的总数不低于那次调用的完整启发式锚点，可以复用 provider 给的真实 usage。`estimated` 表示没有可复用的保守 usage 锚点，服务用固定启发式给完整信封和表面定价。有符号的 `surfaceDeltaTokens` 保留相对匹配锚点的增长和收缩。

为什么这么讲究 baseline？因为 provider 返回的真实 usage 是最准的，但只有请求信封没变时才能复用。一旦请求变了（比如系统提示组装变了、工具 schema 变了），就得退回启发式。这个"能复用就复用真实、不能就启发式"的策略，让测量在准和稳之间取了平衡。

快照是脱离的、不可变的，不随底层重放 fold 前进而增长。每次调用都克隆那些位置节点，所以测量是 O(表面) 的。这个"脱离快照"设计让多个消费者能安全地各拿一份测量，互不干扰。

## 压缩怎么做：锁、总结、替换

现在看完整的压缩流程。压缩用一个锁把**整个**操作括起来，这是为了崩溃恢复。

`compaction/*` 是三个会话事件，全是**纯日志**（不加入模型表面）：

| 事件 | 载荷 | 角色 |
|---|---|---|
| `compaction/start` | `{ turn }` | 获取日志记录的锁；数字标识打开的自动 turn，null 标识独立的手动尝试 |
| `compaction/summary` | summary、shadowedRange、shadowedSeqs、shadowedTokenCount、provider、model、usage | 安全的总结投影、被遮蔽的表面边界对、被遮蔽的 seq、估算 token 数、总结调用的信封 |
| `compaction/end` | `{ turn, error? }` | 释放锁 |

锁的顺序是关键：`compaction/start` 先追加，然后 summarization、`compaction/summary` 记录、`user/message` 替换都落地，**最后才** `compaction/end`。最后释放锁，让"操作中途崩溃"变成一个**可检测的孤儿锁**（一个没有配对 end 的 start），而不是一个虚假声称压缩完成的 end。这是个精巧的不变量：宁可留下一个明显的"没完成"标记，也不留一个骗人的"完成了"标记。

总结本身怎么进入模型表面？`SurfaceEventType` **故意不被扩展**（只有产生消息的事件到达模型）。总结骑在一条单独的 `user/message` 上，带 `surfaceOp: { op: 'replace', start, end }`。这是 summary 压缩做的**唯一**表面变更：用一条总结消息替换掉选中的表面区间。复用 `user/message` 而不是发明一个新的表面事件类型，是个有意的简化。

## 区域与工具配对

`compactRegion(start, end, agent, signal)` 强制把一个表面节点区间压成一个总结节点。`start` 和 `end` 按表面位置命名一个闭区间，**不是数字 seq 顺序**：之前的替换能让可见 seq 非单调。

一个硬约束：**两个边界必须是平衡的**，让 assistant 的工具调用和它们的结果保持配对。`toolPairingBalancedBefore` 和 `toolPairingBalancedAfter` 做边界检查。如果压缩区间把一个工具调用和它的结果分开了，模型会看到一个没有结果的调用或一个没有调用的结果，这就坏了。

但注意：区域保留工具调用/结果配对，**不保留整个 turn**。这意味着一个超大 turn 里早期已关闭的 step 可以被压缩，而不用把整个 turn 都包进去。这个灵活性让压缩能精准地砍掉该砍的，而不是被迫整 turn 处理。

## 失败恢复：溢出后重试

溢出触发的压缩走 `agent/request-error`，在失败的 step 关闭**之后**跑。它返回重试动作，**仅当表面替换的生成推进了**（也就是说压缩确实腾出了地方）。哪怕之后 summary 工作在修剪之后又抛了，只要表面替换已经推进，重试就能成立。取消永远优先。

这个"以表面是否推进为重试判据"的设计很务实：不管 summary 内部怎么折腾，只要模型下次请求能看到的空间确实变大了，就值得重试。它把"压缩成功"的判据从"summary 顺利生成"放宽到了"表面有效推进"，更鲁棒。

手动压缩的失败有一套预期错误码：`busy`、`cancelled`、`changed`、`summary`、`commit`、`persistence`。`changed` 和 `summary` 不改对话表面，但仍关闭并持久化失败的尝试。`commit` 可能跟在部分变更之后。`persistence` 表示内存里的括号关了但刷盘失败。失败的尝试在日志里保持可见，不静默消失。

## 压缩引擎：`ctx.compaction`

`ctx.compaction` 的服务类型是 `CompactionEngine`，定义在 `packages/compaction/compaction`。它是个可选能力，不在 agent-loop 主干里。和 bash 一样分 Service Definition、Service Provider（`dsh-compaction-basic`）、Consumer（`dsh-command-compact`）。但它和 bash 有个关键不同：它的接口**必然依赖** `dsh-session` 和 `dsh-llm`，因为它的动词作用于 agent 拥有的 `Session`，持久总结事件用 `ContentBlock` 词汇。

三个方法：

- `compactIfNeeded(agent, trigger, signal)`：自动压力或溢出策略。返回 `null` 表示没有可压缩的安全区间。注意：单个超大的保留单元或请求信封，没法靠表面压缩修复。
- `compactNow(agent, signal, sourceCommandId?)`：显式地在低于自动压力阈值时压缩有用的历史。作为 turn 之间的 agent 维护跑，没有有用区间时不写、返回 `null`。
- `compactRegion(start, end, agent, signal?)`：强制压缩一个表面区间。

替换用的 user 消息用 `compactCheckpointSource(compactionId, sourceCommandId?)` 构造来源。这个必需的事务身份关联替换检查点，而 `isCompactCheckpointSource()` 谓词让识别独立于任何单个后端。客户端和 wire 消费者从 cordis-free 的 `@deepseek-ai/dsh-compaction/checkpoint` 子路径导入，包根再导出给 host 消费者。

## 压缩救不了的场景：单个超大内容

压缩的边界就在上一节那句话：**单个超大的保留单元，没法靠表面压缩修复**。因为压缩要么修剪（砍中间留头尾），要么总结（跑模型生成摘要）。但有些工具结果，你既不想无脑砍它，也不想让它被总结成一团模糊的摘要——比如前面说的那份完整 API 文档、几万行日志、大量 grep 匹配。这些内容本身就是有用的完整数据，砍了就残缺，总结了就丢细节，但体积又大到塞不进上下文。

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

这个挂载位置很讲究。如果在 `tools/execute` 之前拦截，工具还没跑，不知道结果多大；如果在 `tools/result` 之后，结果已经进上下文了，晚了。`tools/post-execute`（工具执行后、结果规范化前的 waterfall）正好是"结果已产生、还没进上下文"的窗口，spill 在这里判断大小、决定是否搬走。挂载方式是标准的 Cordis waterfall 监听器，和 hooks、权限这些横切关注点共享同一条管线，溢出策略和其他工具后处理是平行的、可组合的，不互相耦合。

## Fork 继承：定位符跟着日志走

`SpillOwner.sessionId` 是保存时的存储命名空间。一个被 fork 的会话，从种子日志里**继承**已有的溢出定位符；这些工件**不被复制、也不重新归属**。fork 之后新产生的溢出用子会话的 id。

这条规矩和 attachment 接缝的"存留中立"很像：fork/resume 共享同一批溢出工件，不复制。定位符是日志里的引用，fork 把日志带过去，定位符就跟着过去了。实际工件还在原来的存储位置，谁引用谁取。

一个保留期清理可能让旧的定位符和别的旧会话工件一起过期，但 spill 接缝**不定义** per-session 的清理策略。清理归更高层，不归这个只管存的接缝。

## 压缩与溢出的分工

把 compaction 和 spill 并排看，分工清晰：

| | compaction | spill |
|---|---|---|
| 解决什么 | 很多中等内容撑爆上下文 | 单个超大内容塞不进去 |
| 怎么减负 | 修剪（确定性）或总结（模型调用） | 整个搬到上下文外，给定位符 |
| 信息损失 | 修剪砍中间，总结丢细节 | 不损失，完整存着，按需取 |
| 触发 | 压力探测、溢出检测 | tools/post-execute，超 maxInlineBytes |
| 成本 | 修剪廉价，总结贵 | 一次磁盘写，廉价 |

一个对话里两者可能同时存在：压缩把一堆中等内容压成摘要，spill 把一个超大结果搬走。它们不冲突，各管各的场景。

## 真实代码落点

- `packages/compaction/compaction`：`CompactionEngine` 接缝与 `compactIfNeeded` / `compactNow` / `compactRegion`。
- `packages/spill/spill/src/types.ts`、`index.ts`：`SpillStore` 接缝、`SaveTextSpill`、`SpillRef`、`SpillLocator`。
- `packages/spill/spill-local`：本地 provider，私有 session 级文件，`open(path, 'wx', 0o600)` 独占写。
- `packages/spill/spill-policy`：`tools/post-execute` 策略消费者，超 `maxInlineBytes` 替换。
- `packages/util/output-retention`：保留库，提供头/尾预览，预览机制归它不归 spill 接缝。

## 权衡与局限

**没有模型压缩工具，意味着模型不能主动救场。** 如果 harness 的压力探测和溢出检测都没触发（比如阈值设得不合理），模型就算"感觉"到历史太长也无力压缩。这要求阈值策略调得对。回报是时机确定、行为可预测。

**修剪是确定性的，可能丢信息。** 头/中/尾修剪砍掉中间，被砍的部分靠 spill 或日志恢复，但模型表面看不到了。对"中间这段是不是重要"的判断，修剪是无脑的。所以它只适合"这段是个大工具输出，头尾够了"的场景。

**summarization 是模型调用，有成本和失真。** 总结本身要调一次模型（走 `ctx.llm.stream()`），消耗 token，而且总结会丢信息。这是比修剪重的后手，只在修剪不够时用。

**baseline 退回启发式时不那么准。** 请求信封变了就只能启发式定价，准度下降。但启发式偏保守，宁可高估压力早压缩，也不低估压力导致溢出。

**模型得主动取溢出内容。** spill 把内容搬出上下文，模型只拿到定位符和提示。要用里面的数据，模型得发 read 或 grep 工具去取。这比内联多一次往返，但对超大内容别无选择。

**只存文本。** `saveText` 只存 UTF-8 文本。二进制大对象（比如大图片）走 attachment 接缝（回忆多模态那篇），不走 spill。两个接缝分工：文本溢出走 spill，二进制归 attachment。

**本地后端不加密。** 私有文件（0o600）靠文件系统权限保护，不加密。在多用户机器上，root 还是能读。对敏感内容，这是个要意识到的边界。

**保留策略不在接缝。** spill 只管存，不管什么时候删。长期运行的部署会累积溢出文件，需要更高层的清理策略。这和 attachment 的 GC 是同类问题：为了 fork/resume 正确性，宁可累积，也不绑死在单个会话的删除上。

**尽力而为，失败退回内联。** 存不下就退回内联结果，让上下文大一点。这是对的降级，但意味着在磁盘紧张时，溢出可能突然不生效，上下文又变大。运维上要给溢出存储留够空间。

## 结论

上下文体积管理在 `dsh` 里是两层互补的机制。压缩侧有三个反常识的设计：没有面向模型的 compact 工具，压缩是 harness 在压力探测和溢出检测时被动驱动的；第一道防线是确定性的工具结果修剪，summarization 是修剪不够时的后手；测量归单例 `ctx.tokenMeter`，能复用 provider usage 就复用，不能就启发式。溢出侧是个极简的单方法接缝：`saveText` 把完整文本原样存到 session 级私有存储，返回不透明定位符加检索提示，策略消费者挂在 `tools/post-execute`，超 `maxInlineBytes` 就用头/尾预览加溢出引用替换内联结果，尽力而为，失败退回内联。

几个判断：压缩时机由 harness 决定不由模型决定；先廉价修剪后昂贵总结；锁把整个压缩操作括起来、最后释放，让中途崩溃变成可检测的孤儿锁；总结骑在 `user/message` 的 `surfaceOp: replace` 上，是唯一的表面变更；溢出定位符是不透明的，检索方式跟后端走，不假设永远是 read；本地后端用独占 owner-only 写防符号链接攻击；fork 继承定位符不复制工件；溢出是优化不是必需，不让成功调用变 isError。

压缩治"很多中等"，spill 治"单个超大"，两者一起覆盖了上下文体积管理的两种主要场景。它不指望模型自己管理上下文，而是用工程机制保证上下文不会失控。

## 延伸阅读

- [Compaction 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/compaction.md)：压缩事件、引擎、修剪器的权威来源
- [Spill Storage 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/spill.md)：溢出接缝、本地后端、策略消费者
- [Token Meter 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/token-meter.md)：测量与重放
- [Tool output spill files 笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-07-08-tool-output-spill-files.md)：溢出存储的设计理由
- [Compaction capability-seam 笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-06-18-compaction-capability-seam.md)：接缝设计理由
- [Reconstructable requests 笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-07-05-reconstructable-requests.md)：summary 记录可重建性
- [Tool Execution Pipeline](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-execution-pipeline.md)：`tools/post-execute` 挂载点
- [Durable Image Attachments](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/attachment.md)：二进制大对象归 attachment 不归 spill

上一篇：[Web 搜索抓取与 Skills 技能系统](./25-web-search-fetch-and-skills.md)
下一篇：[跨会话记忆：session-query / projection / reference](./28-cross-session-memory-query-projection-reference.md)
