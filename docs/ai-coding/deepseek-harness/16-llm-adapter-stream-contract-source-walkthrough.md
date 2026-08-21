# 🔍 LLM 适配器：dsh 的 stream 契约源码导读

> `dsh` 把"模型怎么调"压成了一条**封闭的流式协议**（`StreamChunk`），所有 provider 只负责往这条协议上吐 chunk，拼装、出错归一、重放、重试全由 harness 统一兜底。
> 适配器写得对不对，不靠 review 靠契约：八条硬性不变量加上一个 `assertNever`，错一个就编译不过或运行期直接断言炸出来。这一篇对着源码逐行拆这条契约。

## 为什么这一篇值得单开

很多 agent 框架接模型的方式是"每个 provider 写一个 client，各自解析各自的响应"。后果是：换一个 provider，错误处理、token 计费、工具调用解析、流式拼接全得重写一遍；agent loop 里到处散落着 `if (provider === 'openai')`。

`dsh` 反过来。它在 `packages/llm/llm` 里定义了一套 provider 中立的词汇表：消息怎么表示（`Message`/`ContentBlock`）、一次请求长什么样（`GenerateOptions`）、流回来的原始协议是什么（`StreamChunk`）、失败怎么统一（`LlmFailure`）。所有 provider 适配器，不管是 DeepSeek 官方的 direct-fetch 实现，还是 pi-ai 那种基于第三方库的实现，都吐同一种 chunk。**agent loop 只认 chunk，从不认 provider。**

这套设计把"接一个新模型"从"重写半个 harness"降级成"实现一个 `stream()` 方法"。但要让它成立，契约必须足够硬。这篇就是拆这条契约硬在哪。

## 先定位接缝：`ctx.llm`

`ctx.llm` 是 `dsh` 几十个能力接缝里最核心的一个。它的服务类型是 `LlmRuntime`，定义在 `packages/llm/llm/src/index.ts`。能力 seams 文档对它的描述只有一行：

> LLM adapter registry + streaming call API。

这句话拆成两半。`adapter registry` 这一半：`registerAdapter(providers, adapter)` 把一个适配器注册到若干 provider 路由上，重复注册同一个 provider 抛 `DUPLICATE_ADAPTER`，而且 all-or-nothing，要么全注册成功要么一个都不动；注册返回的 handle 既是 disposer，又能原子地 `replace(providers)` 换路由。`streaming call API` 这一半：`stream(options)` 发起一次调用，返回 `AsyncIterable<StreamChunk>`。

谁在用这个接缝？agent loop 在每个 step 组装好请求，调 `ctx.llm.stream()`；消费者（UI、压缩器、telemetry）要么直接读 chunk 流，要么用 `BlockAssembler` 拼装。三个官方 provider 全挂在同一个 `ctx.llm` 上：`llm-deepseek`、`llm-pi-ai`、`llm-replay`（测试用的录制回放适配器，从 fixture 文件里吐录制好的响应）。

路由还有一条容易忽略的规矩：`GenerateOptions.provider` 这个字符串选中适配器，`GenerateOptions.model` 传给那个适配器。模型 id 不需要在生命周期开始时注册，catalog 是 advisory（建议性的），适配器可以接受没列在 catalog 里的 model id。换句话说，路由认 provider，不认 model。

## `StreamChunk`：封闭的原始协议

这是整篇的核心。一次流式响应可能交织好几种块：文本、推理（reasoning）、多个工具调用。`StreamChunk` 用 `index` 把每个增量绑到它所属的块上，`block-end` 携带那个块拼好的完整 `ContentBlock`。类型定义在 `packages/llm/llm/src/types.ts`，七个变体，不多不少：

| 变体 | 带什么 | 语义 |
|---|---|---|
| `block-start` | `index` + `blockType` | 宣告一个块开始 |
| `text-delta` | `index` + `text` | 文本增量 |
| `reasoning-delta` | `index` + `text` | 推理增量 |
| `tool-call-delta` | `index` + `id` + `argumentsDelta` | 工具调用增量，`name` 可选 |
| `block-end` | `index` + `block` | 携带拼好的完整块 |
| `usage` | `TokenUsage` | 本次调用的 token 记账 |
| `finish` | `reason` + 可选 `replayState` | 终态，可带适配器私有的重建状态 |

几个设计决定撑住了这个协议。

它是封闭联合（closed discriminated union），不是随便往里加成员的开放集合。dsh 在每个对 `type` 的 `switch` 结尾放 `assertNever`：只要新增一个 chunk 变体，所有消费它的地方都编译失败，逼你逐个处理。这是故意把扩展成本做高，换来所有消费者都能依赖的类型安全。

用 `index` 而不是嵌套结构。一个 provider 同时流式吐两个工具调用的参数时，用 `index: 0` 和 `index: 1` 区分，不搞嵌套流。这把"交织"降维成"给每个增量贴个下标"。

`block-end` 带完整块。消费者不需要自己把 delta 拼回完整块，适配器在 `block-end` 时已经拼好了。拼装责任放在适配器（它最懂自己的协议）还是放在公共 assembler，是个取舍，dsh 选了两边都给：适配器吐带完整块的 `block-end`，同时 `BlockAssembler` 也能容忍只有 delta、没有 start/end 的协议。

`finish` 是终态，可以带 `replayState`。一段适配器私有的无损 JSON 状态，用来日后重建这个 provider 的原生响应。这个机制后面 replay 一节单独讲。

## 八条不变量：适配器必须守，消费者可以靠

契约原文是一长串"every adapter MUST obey"，列在 `StreamChunk` 的 JSDoc 里。浓缩成八条，每条都对应一个真实工程问题。

1. `usage` 在 `finish` 之前，`finish` 之后什么都不许有。两者都推迟到 provider 的流结束标记，"统计 token"和"判断结束"才能可靠并发，不会被一条只有 usage 的尾巴 chunk 破坏顺序。
2. 工具调用的 `arguments` 全程是原始 JSON 字符串。部分片段通过 `argumentsDelta` 流式传；原生返回解析后对象的 provider，在 `block-end` 时自己重新 stringify。为什么不让适配器吐对象？因为流式场景下对象没法增量拼，字符串可以。
3. 两条错误出口，一种 `LlmFailure` 类型。失败要么从 `stream()` 里 throw（传输/协议错误），要么用 `finish {kind:'error'|'aborted', failure}` 结束流（provider 在带内报错，适配器没法中途抛）。`LlmRuntime.stream()` 会把 throw 出来的错误归一成终态 `error` 或 `aborted` finish，再暴露给消费者，两条路殊途同归。

`LlmFailure` 是一个可序列化的 provider 中立负载：人可读的 `message`，稳定的路由 `code`，可选的 HTTP `status` 和诊断 `requestId`。有个字段容易误读：`providerRetryAfterMs` 只是"provider 请求等多久"，不是"决定要不要重试"。重试决策属于策略层（`dsh-llm-retry`），不属于适配器。这条区分 dsh 反复强调：**机制和策略分开**。

4. 一次适配器调用等于一次 provider 尝试。适配器必须关掉底层库自带的 retry。agent 级别的恢复是另开一个持久的、编号的 turn；直接调 `ctx.llm.stream()` 的调用方就是单次尝试，不重试。
5. provider 卡住由传输层兜底。两个线上远程适配器都暴露正的、有限的 `streamIdleTimeoutMs`，默认五分钟。看门狗只在迭代器 `next()` 挂起时上膛，整个请求用一个稳定信号，超时映射成 `TIMEOUT`，更早的调用方 abort 保持 `ABORTED`。
6. 上下文溢出有唯一 code。两个 DeepSeek 适配器通过 `isContextWindowExceededError()` 把 provider 的具体细节归一成 `CONTEXT_WINDOW_EXCEEDED`，不管失败是 throw 出来的 HTTP 错误还是带内 finish 错误。消费者只按 code 路由，绝不按 provider 文本字符串匹配。
7. 空响应是可重试错误，不是静默成功。终态 `stop` 但一个 content block 都没带的，映射成 `finish {kind:'error'}` 加 `EMPTY_RESPONSE` code，`dsh-llm-retry` 默认重试它。
8. 每个请求带 app 归因头。适配器必须发 `attributionHeaders()`（`packages/llm/llm/src/attribution.ts`），落到标准 `User-Agent`，并且要有 wire 级测试证明它真发出去了。

这八条不是文档摆设，每条都能在源码里找到对应的断言或测试。违反任何一条，要么编译期炸，要么运行期在不变量检查里炸，要么在 wire 测试里挂。

## `BlockAssembler`：唯一的拼装实现

chunk 是封闭协议，谁来把它折回 `ContentBlock`？答案是 `packages/llm/llm/src/assembler.ts` 里的 `BlockAssembler`，全局唯一一份实现。

agent loop 的用法是双轨：一边把原始 chunk 记进会话日志（保真，日后能 replay），一边把同一批 chunk 喂给一个 assembler，流结束后读 `blocks()`、`message()`、`usage`、`finish`。流被取消截断时，`interruptedBlocks()` 给出能安全定稿的前缀，工具调用被省掉，因为截断的调用不该被执行。需要拼装结果又不想自己重写折回逻辑的消费者，都用这一个类。

它有两个容错行为。第一，容忍只有 delta、没有 `block-start`/`block-end` 的协议。第二，某个 `index` 已经被 `block-end` 关闭了又来 delta 时直接忽略，行为异常的适配器既撑不爆内存，也污染不了一个已经完成的块。

## normalize：把五花八门的失败收拢成一种

前面不变量第 3、6、7 条说的其实是同一件事：归一化。

不同 provider 报错的方式千差万别。OpenAI 兼容端点返回 HTTP 429 加一段 JSON；DeepSeek 的 `prompt_tokens` 把缓存命中折进了一个总数；有些 provider 流到一半才在带内说"超长了"。如果让 agent loop 直接面对这些，代码会变成一堆 provider 专属的字符串匹配。

`dsh` 的做法是在适配器边界就把它们翻译成统一的 `code`。"上下文超长"无论以何种形式到达，都映射成 `CONTEXT_WINDOW_EXCEEDED`；空响应映射成 `EMPTY_RESPONSE`；看门狗超时映射成 `TIMEOUT`；调用方主动 abort 保持 `ABORTED`。

归一化之后，agent loop 的错误处理就干净了：`agent/request-error` 这个事件拿到的是结构化的 `LlmFailure` 加上不可变的事实（之前的重试事实、serving 策略、turn 信号），监听器返回 `{ kind: 'retry' }` 表示修好了要重试。没有恢复的话，这个结构化失败就成了 turn 的错误，这一次尝试不会提交任何 assistant 消息或工具副作用。

## replay：两个不同的东西，别搞混

"replay"在 `dsh` 里指两件不同的事，容易混。

第一个是 per-message 的 `replayState`。一次成功的 `finish` 可以带一段适配器私有的无损 JSON 状态，agent loop 把它和拼好的 assistant 消息一起存进会话日志。日后要把这个 provider 的原生响应重建出来（比如跨模型迁移、跨 provider 转换），这段状态就是原料。`LlmRuntime` 的规则是：只有当历史消息的 provider 和当前目标 provider 当前都注册在同一个适配器实例上时，才把这段状态传给那个适配器。适配器自己校验状态、自己负责跨模型或跨 provider 的转换。别的适配器只会收到 provider 中立的 content 加上 provider/model 字段，拿不到这段私有状态。

为什么要这么严格？因为 replayState 是适配器私有的，跨适配器传过去等于让一个不理解的适配器去解释别人的内部状态，会出诡异的 bug。用"同一实例"这个条件一刀切，干净。

第二个是 `llm-replay` 适配器。这是一个测试用的 provider，从 fixture 文件里吐录制好的响应，让测试可以确定性地重放，不碰真实 provider。它和 `llm-deepseek`、`llm-pi-ai` 一样注册在 `ctx.llm` 上，只是它的"调用"是读文件。配置参考文档明确写了："`dsh-llm-replay` 适配器从 fixture 文件提供录制好的 LLM 响应，支持确定性测试重放，无需真实 provider 访问。"

两回事：一个是消息级别的私有重建状态，一个是测试级别的整 provider 替身。读到源码里 `replayState` 字段和 `llm-replay` 包名时，要知道它们解决的不是同一个问题。

## `llm/stream` waterfall：接缝的扩展点

`ctx.llm` 不只是一个注册表。它还挂了一个 `llm/stream` 的 waterfall 事件，包住每一次流式调用，监听器拿到请求配置和一个通往下一层的 `next()`，定义在 `packages/llm/llm/src/index.ts`。

waterfall 的语义是"洋葱皮中间件"：监听器可以调 `next()` 把请求传给下一层（最终到达解析出的适配器的 `stream()`），也可以自己 yield chunk 来短路整个调用。retry、replay、路由这些横切逻辑都挂在这里，不需要改动 agent loop 或适配器。

一个细节：loop 构建的请求带一个进程局部的 `markAgentLoopRequest` 标记，并且是深度冻结的，对它 mutate 会抛错。原因是它的内容是会话日志的纯函数（可重建性硬规矩），监听器只能读、不能改。手搓的一次性调用不带这个标记，但它的 messages 也遵守不可变创建契约。

## 真实代码长什么样

光讲契约容易飘，给一个具体落点。`packages/llm/llm-deepseek/src/` 下的 DeepSeek 适配器是 direct-fetch 实现（不依赖第三方 SDK），职责切在三处：

- `translate.ts` 把 provider 中立的 `GenerateOptions` 翻译成 DeepSeek 的 HTTP 请求体。
- `sse.ts` 解析 provider 返回的 SSE 流。
- `adapter.ts` 实现 `stream()`，把 SSE 事件翻译成 `StreamChunk` 序列 yield 出去，`isContextWindowExceededError()` 这类归一化逻辑也在这里。

对比之下，`packages/llm/llm-pi-ai/src/` 是基于第三方库的实现，内部结构完全不同（多出 `catalog.ts`、`discovery.ts`、`replay.ts`），但它对外吐的同样是 `StreamChunk`。这就是封闭契约的回报：内部实现可以天差地别，外部接口一模一样。

## 权衡与局限

这套设计不是没有代价。最直接的是封闭联合的扩展成本：加一个 chunk 变体，所有消费者编译失败；一个 provider 专属、别的 provider 用不上的流式事件想进协议，会很别扭。dsh 的态度是，新模态只有当它的适配器、UI、压缩、持久化重放路径都支持了，才允许进 `ContentBlockMap`。

写适配器的门槛也真实存在。八条不变量、replayState 的所有权规则、归一化的 code 体系，写一个合规适配器不是半小时的事，官方专门有一篇 cookbook 带你写一个（接 OpenAI 兼容模型），那个流程本身就说明门槛。调试链也长：一个请求从 `agent/request` 到 `llm/stream` waterfall 到适配器再到 provider HTTP，中间好几层，出问题时定位"是适配器翻译错了还是 provider 返回怪"，需要对着 chunk 日志看。这是全插件化架构的共性代价。

回报是：接一个新模型不用碰 agent loop，错误处理统一，token 计费口径一致，测试能完全离线确定性回放。对一个要支撑"任意 OpenAI 兼容端点"的 harness 来说，这个取舍是划算的。

## 结论

`ctx.llm` 把"调模型"压成三个东西：一个注册表（适配器挂 provider 路由）、一个封闭流式协议（`StreamChunk` 七变体）、一套把 provider 花样收拢成统一 code 的归一化层。适配器只实现 `stream()` 吐 chunk，拼装交给唯一的 `BlockAssembler`，错误交给 `LlmFailure`，重试交给策略层，扩展交给 `llm/stream` waterfall。契约用 `assertNever` 和运行期断言把"写错适配器"变成编译失败或即时爆炸，而不是线上诡异行为。也因此 provider 是一个挂在接缝上、吐标准 chunk、可干净撤销的注册，而不是焊死在 agent loop 里的 import。

## 延伸阅读

- [LLM Streaming 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/llm-streaming.md)：本文主要依据，含全部类型定义与适配器契约原文
- [Capability Seams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)：`ctx.llm` 行，三个 provider 都挂同一接缝
- [Adding an LLM Adapter](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-an-llm-adapter.md)：写一个适配器的官方 cookbook
- [`packages/llm/llm/src/types.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/src/types.ts)：`StreamChunk`、`LlmFailure`、`GenerateOptions` 源码
- [`packages/llm/llm/src/assembler.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/llm/llm/src/assembler.ts)：`BlockAssembler` 唯一拼装实现

上一篇：[系统提示组装与动态 Cordis：dsh 让 agent 改自己的插件树](./15-system-prompt-assembly-and-dynamic-cordis.md)
下一篇：[多模态与 Attachment：dsh 怎么让 agent"看图"](./17-multimodal-attachments.md)
