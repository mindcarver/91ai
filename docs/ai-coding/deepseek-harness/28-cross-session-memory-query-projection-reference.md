# dsh 的跨会话记忆：session-query / projection / reference

> `dsh` 用三个不同层次的机制让 agent 记住别的会话，`ctx.sessionQuery` 是跨会话的全文检索与血缘追踪，`ctx.sessionProjections` 是框架驱动、领域计算的状态投影 fold，`ctx.sessionReferenceResolver` 是把另一个会话的快照注入当前消息。
> 三者共享一个根基：都在"live-preferred 逻辑语料库"上读，活的会话优先于持久化的，但都不把整个日志一次性塞进内存。

## 为什么跨会话记忆是三个机制

agent 干活时，"记忆"不止是当前会话的上下文。它经常要回答三类问题：

- "我上次在这个项目里解决过类似问题吗？"这是检索：跨一堆会话搜文本、看血缘。
- "这个会话当前的 todo 列表、目标、权限状态是什么？"这是派生状态：从日志折叠出来的当前值，要实时推给客户端。
- "把昨天那个会话的结论带进我现在这个对话。"这是快照注入：把另一个会话的内容塞进当前消息。

这三件事粗看都是"读会话日志"，需求完全不同。检索要全文索引和排序；派生状态要增量 fold 和一致性切面；快照注入要预算受控的上下文搬运。揉成一个 API 必然拧巴。

`dsh` 拆成三个接缝：`ctx.sessionQuery`（检索）、`ctx.sessionProjections`（派生状态）、`ctx.sessionReferenceResolver`（快照注入）。三者共享"live-preferred 逻辑语料库"这个根基：每个会话有个逻辑记录，活的（在 `ctx.sessions` 里）优先于持久化的，读取时两者都算，且都不一次性把整个日志搬进内存。

## 检索：`ctx.sessionQuery`

`ctx.sessionQuery` 的服务类型是 `SessionQueryEngine`，定义在 `packages/session-query/session-query`。它提供跨会话的查询词汇：精确读、过滤、血缘追踪、语义提取、全文搜索。

### live-preferred 逻辑记录

`SessionRecord` 是跨语料库 list 返回的逻辑记录，把克隆的 live-preferred 头部和来源可用性分开报告：`header` 是从 live-preferred 语料库选的克隆头部；`live` 说这个 id 当前是否在 `ctx.sessions` 里；`persisted` 说当前持久化后端是否物化了这个 id。

`live` 和 `persisted` 独立报告，因为一个会话可能活着但没持久化、或持久化了但不活。这种区分让消费者能判断"这个记录现在到底在哪儿可用"。

事件也有个表面分类 `SessionEventSurface`：`current`（当前模型上下文）、`shadowed`（被替换的上下文）、`log-only`（只在原始日志里），分类用的是和模型历史派生相同的 `foldSurface()` 转移。这把"事件现在对模型可见吗"变成了一个明确的属性。

### 全文搜索：query 是数据不是语法

接缝有两个全文范围：`searchSessions(request)` 跨会话搜索，按最强匹配事件分组会话；`searchEvents(request)` 单个会话内搜索。请求把一个不透明游标绑到归一化的查询、元数据过滤、limit 上。

一个关键安全点：**query 被当作数据解释，绝不是可执行的 FTS 语法**。用户或模型输入的搜索词不会被当成 SQL 或 FTS5 表达式注入，只能做全文匹配。

跨会话搜索按"每个会话最强匹配的事件"排序，相关性高的会话排在前面。会话内搜索即使一页没命中，也必须暴露它观察到的目标头部，让调用方知道"这个会话我看了，没匹配"，区别于"这个会话我没看到"。

### provider 无关的过滤

会话和事件过滤数组是 AND（与），一个子句内的 values 是 OR（或）。事件有个 `text` 子句：字面的、Unicode 大小写不敏感、空白灵活的正则扫描，扫的是提取出来的语义文本，独立于全文 provider。

哪些内容贡献语义文本？消息、推理、工具调用/结果、被拦的 prompt、todo、失败/状态细节。结构事件和流块不贡献。这个"什么算可搜内容"的界定，让全文索引只装有意义的东西，不装一堆结构噪声。

具体全文索引的生命周期（SQLite 的 FTS）由 provider（`session-query-sqlite`）拥有，但精确读、过滤、血缘追踪是 provider 无关的具体行为，跑在同一个 `ctx.sessionQuery` 服务上。换全文后端不影响这些精确读。

### 血缘与事件关系

`traceSession` 返回一个会话的已知祖先（从近到远）和后代森林。完整性判别让"已知根"和"缺父"互斥：要么完整链在，要么告诉你第一个解析不出来的父 id。

`traceEvent` 追踪单个事件的直接表面替换和被引用的源事件。`replacementChain` 沿着即时替换者从目标追到最终位置替换；`sourceEventSeqs` 是被引用为源的更早事件；`derivedEventSeqs` 是直接引用目标为源的更晚事件。这套事件关系把压缩造成的"表面替换"和"快照注入造成的源引用"都追踪清楚了。

### 封闭错误码

`SessionQueryErrorCode` 是封闭联合，区分请求校验、缺失目标、坏表面日志、后端失败、搜索被部署禁用、矛盾的源元数据等。调用方按码路由，不解析消息。这和前面所有接缝的错误纪律一致。

## 派生状态：`ctx.sessionProjections`

`ctx.sessionProjections` 的服务类型是 `SessionProjectionRegistry`，定义在 `packages/session/session-projection`。它解决的是"从日志折叠出来的 per-session 状态怎么实时给客户端"。

### 框架驱动，领域计算

这是这个接缝的核心切分。**框架驱动，领域计算**：注册表订阅一次 `session/event`，把每个已提交事件 fold 过每个单元；领域不持有任何订阅，客户端从不 fold 领域事件，只接收算好的值。

一个领域贡献一个 `ProjectionDefinition`，三个纯同步函数加声明。`init()` 给空日志一个初始状态；`apply(state, event)` 是纯转移，前状态加一个事件得到下一状态；`view(state)` 把状态变成 wire 载荷。外围三样声明：`key` 标识这个投影单元，`schema` 校验 `view` 的输出，`stateVersion` 是持久化缓存的失效版本。三个函数必须同步（异步单元会撕裂 carrier 的一致性切面），`state` 必须是纯 JSON（持久化缓存的前提）。

为什么领域不订阅？因为如果每个领域插件都自己订阅 `session/event`，N 个领域就是 N 份订阅、N 次 fold，浪费且容易不一致。注册表订阅一次、fold 过所有单元，保证所有领域看到的是同一个事件流、同一次 fold。

### 整值事件规矩

一条规矩撑住所有转移：**一个带状态的日志事件携带变更后的完整状态，绝不是裸 delta**。这让每次转移都平凡地廉价，每个服务的值都自描述（消费者 last-wins）。

这条规矩和 fs 的 `before`/`after`（存完整文本不存 diff）、attachment 的"引用不字节"是一类设计：宁可重复存完整值，也不存增量然后到处算差。

### apply 返回同一引用 = 零下游工作

`apply` 有个硬规矩：单元对一个不感兴趣的事件必须返回同一个状态引用。用 `Object.is` 判断，未变的引用产生零下游工作（不触发变更通知）。

这是个性能关键。一个会话可能每秒处理很多事件，但某个投影单元只关心其中一类（比如只关心 todo 事件）。对不关心的事件返回同一引用，注册表就知道"这个单元没变"，跳过它的变更通知和 schema 校验。

### 一致性切面

`snapshot(session)` 完全同步：一个 carrier 在和它的页切片同一个 tick 里读它，所以 `asOfSeq`（共享水位，所有值反映到的最后事件 seq）在一次读里覆盖所有值。每个值在返回前过它单元的 schema；一个不小心写成 async 的 `view` 返回 Promise，会被 schema 校验拒绝。

变更 feed 对每个状态引用变了的单元，每个已提交事件触发一次。这把"哪个投影变了"精确地通知出去。

## 冷读阶梯：投影缓存

会话冷启动时（比如 resume 一个持久化的会话），怎么恢复投影状态？全量重放整个日志太慢。`ctx.sessionProjectionCache` 提供了一个冷读阶梯：

1. 缓存行（零 IO）：从持久化的 `(sessionId, key, ver, seq, val)` 行直接 view，能 view 出来的就给。值是 stale 的（上次检查点的），但永远不错，也绝不来自无关日志。
2. 持久化尾部：从 `restoreFloor` 开始读一个事件尾部，覆盖缓存行之后的事件。
3. 注册表 restore：用缓存的种子状态加尾部事件 forward replay，fold 出当前值。
4. 持久化回写：把刷新的检查点行写回（fail-soft），下次冷读起点更近。

`restoreFloor` 是个精巧的设计：它返回的 seq 比最低可用水位低一。这个"低一锚点"是刻意的：尾部 read 从这里开始，能证明存储的日志还延伸到多远。如果日志被崩溃修复截断、缩到了某个行的水位以下，这个低一锚点能让 restore 检测到日志缩了，而不是把 stale 行当当前值吐出去。一个空尾部读从这个锚点得到一个低于所有水位的结尾，restore 拒绝并触发全量重读。

`stateVersion` 是失效版本：只要序列化的状态字段或 fold 语义变了就 bump，旧版本单元持久化的行会被丢弃，而不是被向前 apply 成垃圾。

每个持久化写是 fail-soft：失败记个警告，缓存在下次写或冷读时自愈。两个强制检查点：`turn/end` 和会话销毁（活到冷的时刻）。节流的 write-behind 在计数/间隔触发时检查点。

## 快照注入：`ctx.sessionReferenceResolver`

`ctx.sessionReferenceResolver` 的服务类型是 `SessionReferenceResolver`，定义在 `packages/context/session-reference`。它解决的是"把另一个会话的内容带进当前消息"。

### host 适配器，不是 UI 语法

host 适配器用这些类型，而不是把 UI 里的 mention 语法塞进 agent 核心。`SessionReferenceInput` 是 host 无关的选择：id 权威，label 是展示元数据。

`listCandidates` 按工作目录亲和性排序，排除 self，过滤只搜会话 id 和 cwd，绝不搜转录文本。这条"候选发现不搜转录"是个隐私/性能边界：列候选时不能把别的会话内容片段暴露出来。

### prepare：聚合一个上下文

`prepare` 在入队前快照所有引用，返回至多一个聚合上下文 `PreparedReferencedMessage`：`content` 是去掉 host mention token 后的可读消息；`additionalContext` 是一条聚合的不受信快照（`UserMessage` 类型），没有引用时缺省。

错误码区分自引用、太多、读失败、预算超限、取消。`BUDGET_EXCEEDED` 说明注入有预算控制：引用的会话快照不能无限大，超预算就拒。

把引用快照标记为"不受信"是个安全姿态：来自别的会话的内容，不应该和当前会话的可信指令同等对待。这和 web 抓取的非 2xx 是结果不是错误、code runtime 的程序是敌意输入，是同一类"对外来内容保持警惕"的设计。

## 三者怎么协作

把三个机制串起来看，各自的方向和手段都不同：

| 机制 | 方向 | 手段 |
|---|---|---|
| query | 被动检索，模型或 host 主动发起 | 全文索引加游标分页 |
| projection | 主动推送，框架 fold 后实时推给客户端 | 增量 fold 加冷读阶梯缓存 |
| reference | 定向注入，用户 mention 另一个会话 | 预算受控的快照聚合 |

一个实际场景：用户在会话 A 里说"参考会话 B 的结论"。host 用 `listCandidates` 找到 B，用户选中后，`prepare` 把 B 的当前表面快照成一条不受信的 `additionalContext` 注入 A 的消息。A 的 agent loop 处理这条消息时，这个快照和 A 的系统提示、工具 schema 一起组装进请求。如果 A 的 agent 还想查更多，可以用基于 `ctx.sessionQuery` 的工具跨会话搜索。

## 真实代码落点

- `packages/session-query/session-query/src/types.ts`、`index.ts`：`SessionQueryEngine`、过滤器、全文搜索、血缘。
- `packages/session-query/session-query-sqlite`：SQLite 全文索引 provider。
- `packages/session/session-projection/src/index.ts`：`SessionProjectionRegistry`、`ProjectionDefinition`。
- `packages/session/session-projection-cache/src/index.ts`：`SessionProjectionCache`、冷读阶梯。
- `packages/context/session-reference/src/types.ts`、`index.ts`：`SessionReferenceResolver`、prepare。

## 权衡与局限

三个机制各自把一类成本压给了使用方。

query 的全文索引依赖 provider，SQLite FTS 是当前实现，换全文后端要重做索引生命周期。精确读、过滤、血缘是 provider 无关的，不受影响。

projection 要求领域函数纯且同步，一个写成 async 的 view 会被拒。这限制了领域能做什么（不能在 fold 里做异步 IO），换来一致性切面和可持久化，需要异步的派生状态得另想办法。

冷读阶梯不是免费的。第一次冷读一个很长的会话，可能要 forward replay 一大段尾部，缓存会逐步让它变快，但首次有成本。`stateVersion` bump 会让缓存失效，重新付这个成本。

reference 有预算控制，引用一个超大会话的快照可能 `BUDGET_EXCEEDED`。这保护了当前上下文不被撑爆，但用户想带大量历史进来时可能被拒，得分次或先压缩。

三者都基于 live-preferred，活会话优先。一个还在跑的会话的状态，可能比它持久化的版本更新。多数情况这是对的，但活会话没持久化的那部分，在进程崩了之后就没了。

## 结论

`ctx.sessionQuery` 管被动检索，query 永远是数据不是可执行语法；`ctx.sessionProjections` 管主动推送，框架只订阅一次、领域只算数学，整值事件加同引用跳过让 fold 廉价；`ctx.sessionReferenceResolver` 管定向注入，快照不受信且有预算上限。三者共享 live-preferred 根基，都不全量加载日志。跨会话记忆这个容易做重的话题，就这样被拆成了三件各自轻量的工具。

## 延伸阅读

- [Session Query 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session-query.md)：本文主要依据之一，检索、过滤、血缘
- [Session Projections 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session-projection.md)：派生状态 fold 与冷读缓存
- [Session References 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session-reference.md)：跨会话快照注入
- [Session projection RFC](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/proposed/architecture/2026-07-27-session-projection-and-command-log.md)：投影设计提案
- [Session Log and Events](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md)：三者共同的基础

上一篇：[上下文预算：dsh 的 Compaction 压缩与 Spill 溢出](./26-context-budget-compaction-and-spill.md)
下一篇：[Plan Mode 与 Goal：dsh 怎么管理目标和计划](./29-plan-mode-and-goal.md)
