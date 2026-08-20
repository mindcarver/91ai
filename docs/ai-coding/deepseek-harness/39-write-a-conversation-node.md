# 写一个 Conversation Node：在 Web 客户端做自定义渲染

> Conversation Node 是把一组相关的会话事件折叠成一个有状态视图单元的机制，你写一个 Definition 声明怎么匹配事件、怎么构建状态、怎么渲染，引擎保证回放正确、分页不乱、性能是常数级。
> 这一篇拆 `ConversationNodeDefinition` 的结构、三条事件摄入路径、性能不变量，以及 keyed renderer 的消费方式。

## 什么是 Conversation Node

Web 客户端的对话视图（Chat view）由一排排 Node 组成。一个 Node 可能是一条用户消息、一段 assistant 回复、一个工具调用结果，也可能是你自己定义的业务单元（比如一个代码审查进度卡片、一个目标追踪面板）。

Conversation Node 就是后者的扩展机制。它做的事是：**把一组相关的会话事件折叠成一个有状态的视图单元。** 你不需要自己监听事件、自己管理状态、自己触发重渲染。你写一个 Definition，声明四件事：

1. 哪些事件属于这个 Node（match）
2. 从事件里怎么构建状态（start + update）
3. 状态变化什么时候发布（publication）
4. 发布成什么样的渲染数据（buildViewNode）

引擎负责剩下的：事件回放、分页一致性、Context 生命周期、渲染调度。

这套机制的前提是 Host 已经记录了相关事件。你在 Host 侧的业务插件产生 session 事件（通过 `SessionEventMap` 声明合并），在 Client 侧的插件里写 Definition 消费它们。

## 设计一个可回放的事件族

写 Definition 之前，先设计事件族。核心原则：**选一个稳定的业务 id，每个事件要么携带它，要么能从自己的 payload 推导出来。**

以一个代码审查 Job 为例：

| 事件 | 角色 | 必须携带的持久事实 |
|---|---|---|
| `review/start` | 唯一的开始 | `reviewId`、Turn/Step 坐标、标题 |
| `review/progress` | 更新 | 同一个 `reviewId`、坐标、可回放的进度 |
| `review/end` | 更新 | 同一个 `reviewId`、坐标、最终摘要 |

每个 `(kind, id)` 最多有一个 start 事件。一个只有单事件的业务可以用事件自身的稳定身份（比如 `event.seq`）作为 Definition-local id。

事件类型通过 `SessionEventMap` 声明合并注册：

```typescript
declare module '@deepseek-ai/dsh-session/types' {
  interface SessionEventMap {
    'review/start': ReviewStartData
    'review/progress': ReviewProgressData
    'review/end': ReviewEndData
  }
}
```

branded id 类型（`ReviewId`）跨进程边界使用，防止和别的字符串混淆。

**增量事件是支持的，但有一个要求：每个 delta 必须在按 `seq` 升序回放时产生确定性的 State。** 不能依赖 live-only 的内存状态。如果当前加载的历史窗口只有 update 没有 start，assembler 保留一个 pending Context，不构建 State，直到更早的页面提供 start。如果产品必须在 start 加载前就渲染，一个 terminal 或 checkpoint 事件必须携带足够的 whole fallback state。

## ConversationNodeDefinition 的结构

一个 Definition 是一个对象，有七个关键成员：

```typescript
const reviewDefinition: ConversationNodeDefinition<ReviewState> = {
  kind: 'review-job',
  target: 'chat',
  match: (event) => { /* 身份提取 */ },
  start: (context, match) => { /* 初始化状态 */ },
  update: (context, match) => { /* 更新状态 */ },
  publication: (match) => { /* 发布时机 */ },
  buildLocationData: (context, scope) => { /* 发布到 Turn/Step */ },
  buildViewNode: (context) => { /* 产出渲染数据 */ },
}
```

逐个看。

**`match(event)`**：身份提取器，不是 fold。它只看当前事件，返回 Definition-local id 和生命周期角色（`start` 或 `update`），或 null 表示不匹配。匹配后，assembler 按 `(kind, id)` 定位 Context。

```typescript
match: (event) => {
  if (event.type === 'review/start') {
    return { id: String(event.data.reviewId), role: 'start' }
  }
  if (event.type === 'review/progress' || event.type === 'review/end') {
    return { id: String(event.data.reviewId), role: 'update' }
  }
  return null
}
```

**`start(context, match)`**：在 start 事件时调用一次，返回初始 State。

```typescript
start: (_context, match) => {
  return {
    turn: match.event.data.turn,
    step: match.event.data.step,
    title: match.event.data.title,
    completed: 0,
    status: 'running',
  }
}
```

**`update(context, match)`**：在每个 update 事件时调用，返回新 State。推荐返回新的不可变值，但原地修改后返回同一个对象也有相同的 adoption 语义。

```typescript
update: (context, match) => {
  if (match.event.type === 'review/progress') {
    return { ...context.state, completed: match.event.data.completed }
  }
  if (match.event.type === 'review/end') {
    return { ...context.state, completed: 100, status: 'completed', summary: match.event.data.summary }
  }
  return context.state
}
```

**`publication(match)`**：控制状态变化什么时候物化。三个选项：`immediate`（结构性或终止性变化）、`animation-frame`（高频可见 delta，合并到下一帧）、`none`（状态变化只喂给后续 publication）。引擎仍然按 log 顺序应用每个 update，cadence 只合并视图发布。

**`buildLocationData(context, scope)`**：可选，把 Definition 拥有的数据发布到引擎拥有的 Turn 或 Step 上。同一个 Location 的另一个 Node 可以通过受约束的 slot hook（如 `useTurnData(key)`）消费这个值，不需要接收 Session 或扫描 `snapshot.chat.nodes`。

**`buildViewNode(context)`**：产出渲染就绪的 Node。保留 `context.key` 作为 React 身份，从持久排序证据里选 `anchorSeq`，只返回 renderer-ready 数据。一旦 target Node 发布了，持续返回同一个 key；需要暂时离开可见流时用 `visibility: 'hidden'`，不要返回 null 撤回它。

**`target`** 和 `buildViewNode` 必须一起出现，声明一个 target 拥有的渲染贡献。

## 三条事件摄入路径

引擎从三个路径接收事件，每条路径的工作量不同。

**Replace（打开、resync、gap 修复）。** 重建加载的窗口，对每个 Definition 匹配每个事件一次，然后回放每个已启动的 Context。对 Definition 来说，这是 start 后跟按 seq 升序的 update；只有 update 的 pending Context 保持无 State。

**Prepend（加一个更早的页面）。** 只匹配新的更早事件，按 `(kind, id)` 合并到现有 Context，保留已有的 keyed node，只回放受影响的 Context 和依赖。一个新发现的 start 激活它收集的 update；一个变化的 Location 或 predecessor 可能重跑 Context。

**Append（一个 live 事件）。** 对每个 Definition 的 `match` 调用一次，按 key 查找匹配的 Context，只更新那个 Context。一次 update，一次请求的 publication，不扫描任何现有 Context。

三条路径的设计目标是：**历史可以是分页的、可以是乱序到达的、可以是 live 追加的，但最终的 State 在任何情况下都是正确的。** 这靠可回放的 start + update 保证。

## 性能不变量：不做全窗口扫描

这是 Definition 代码必须守住的硬约束：

> With D registered Definitions, one incoming event performs D current-event matches and constant-time Context-key lookup after a match.

D 个注册的 Definition，一个事件到来时做 D 次当前事件匹配，匹配后做常数时间的 Context-key 查找。

这意味着 Definition 代码不能在正常的 append 路径上：
- 遍历完整的事件窗口
- 遍历所有 Context
- 遍历 `context.matches`
- 遍历已渲染的 Node 集合

用什么替代？用 State 存累积事实，用 Location data 做 same-Turn/Step 共享，用 `reader.previous()` 做索引化的 predecessor 依赖查询。

`reader.previous(kind)` 在 `start` 时可用，返回当前 start seq 之前最近的已启动 Context 的只读数据。assembler 记录这个依赖。如果后来一个更早的 prepend 提供了更近的 predecessor、关闭了一个之前未知的窗口间隙、或修改了 predecessor State，它会从 start 重跑依赖的 Context 并按 seq 升序回放 update。

reader 不暴露业务特定的查询方法，也不授予对另一个 Context 的修改权。

## keyed renderer：React 组件怎么消费

渲染侧是一个 keyed React 组件，通过 `ChatNodeViewProps` 接收 Node 数据：

```typescript
function ReviewNodeView({ node }: ChatNodeViewProps<'review-job'>) {
  const text = node.data.summary ?? `${node.data.title}: ${node.data.completed}%`
  return createElement('p', null, text)
}
```

组件只消费 `node.data` 和受约束的 Location hook。它不直接接收 Session 事件、不扫描 Context 集合、不访问其他 Chat Node。

注册方式是在 client 插件的 `apply` 里：

```typescript
export const inject = ['conversationEvents', 'slots']

export function apply(ctx: ClientContext): void {
  ctx.conversationEvents.register(reviewDefinition)
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'review-job',
  }, ReviewNodeView))
}
```

Chat 数据类型通过声明合并注册：

```typescript
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ChatNodeDataMap {
    'review-job': ReviewChatData
  }
}
```

这给了每个 key 精确的值类型，TypeScript 会在编译时检查组件消费的数据形状和 Definition 产出的一致。

## 验证清单

写完一个 Conversation Node，需要验证这些结果：

1. **完整窗口 replace** 产生预期的最终 State、Location data、Node payload 和 anchorSeq。
2. **只有 update 的尾部** 保持 pending；prepend 唯一的 start 后产生和完整 replace 相同的结果。
3. **初始历史后 live append** 产生和回放合并窗口相同的结果。
4. **prepend 更早页面** 添加更早的行，不替换数据未变的已有 keyed Node。
5. **重复的可见 delta** 保留 `context.key`，在请求时每帧最多发布一次。
6. **keyed renderer** 只消费 `node.data` 和受约束的 Location hook，不扫描 Session 事件窗口、Context 或 Chat Node。

仓库里有现成的参考实现：`assistant.ts` 做流式和中断，`inbox.ts` 加 `message.ts` 做 predecessor 查询，`ui-deliverables` 做一个发布 Turn 数据但不创建自己 Node 的 Definition。

## 权衡与局限

**事件必须是可回放的。** 如果你的业务逻辑依赖 live-only 的内存状态，Definition 会出错。所有 State 必须在按 seq 升序回放时确定性地重建。这是一个硬约束，不是建议。

**start 之前不能渲染。** 如果窗口里只有 update 没有 start，Context 保持 pending，不构建 State。产品必须在 start 加载前渲染的话，需要一个 checkpoint 事件携带 whole fallback state。

**不跨 Node 共享状态。** 一个 Node 不能直接读另一个 Node 的 State。需要共享时，用 Location data 发布到 Turn/Step 层，另一个 Node 通过 hook 消费。

**Definition 代码不能扫描全窗口。** 这是性能不变量。违反它会导致 append 路径退化到 O(N) 而不是 O(D + 1)。

**target 固定为 'chat'。** 当前教程只覆盖 Chat 视图。Trajectory 等其他视图目标是 out of scope。

## 延伸阅读

- [Add a Web Client conversation node](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-conversation-node.md)
- [Conversation Node Assembly Decision](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-08-09-client-conversation-node-assembly.md)
- [assistant.ts 参考实现](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-conversation/src/client/conversation-nodes/assistant.ts)
- [ui-deliverables（无 Node 的 Definition 参考）](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/client/ui-deliverables)

上一篇：[排查与调试实战：一个全插件化 harness 怎么追问题](./38-debugging-and-troubleshooting.md)
下一篇：[Python SDK、Headless 与 JSON-RPC：把 dsh 编进流水线](./40-python-sdk-headless-jsonrpc.md)
