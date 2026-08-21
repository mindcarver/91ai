# 🛠 给 dsh 写一个 LLM 适配器：接 OpenAI 兼容端点

> 接一个新模型 provider，在 `dsh` 里就是继承 `LlmAdapter`、实现一个 `stream()` 方法、把它注册到 `ctx.llm`，剩下的事（拼装、归一化、重试、日志）harness 全替你兜了。
> 难点不在写代码，在守契约：七条协议义务，每条都对应一个真实 provider 的坑，守不住就线上出诡异行为。这一篇带你接一个 OpenAI 兼容端点，把契约逐条落到实现里。

## 这一篇解决什么问题

你有一个 OpenAI 兼容的模型端点（自建的 vLLM、第三方网关、或者任何实现了 `/v1/chat/completions` 的服务），想让 `dsh` 能用它。你不打算 fork 源码，只想挂一个插件。

这正是 `ctx.llm` 接缝存在的意义。回顾前两篇：所有 provider 适配器都吐同一种 `StreamChunk`，agent loop 只认 chunk。所以接一个新 provider，本质上是写一个"把 OpenAI 兼容协议翻译成 `StreamChunk`"的适配器。

`dsh` 官方有两个参考实现：`packages/llm/llm-deepseek`（direct HTTP，SSE 用 `eventsource-parser` 解析）和 `packages/llm/llm-pi-ai`（包装一个 LLM 库）。这篇以 OpenAI 兼容端点为例，但结构对齐 `llm-deepseek` 的布局。

## 最小骨架长什么样

cookbook 给的最小形状是一个 Cordis 插件文件。核心是适配器类：继承 `LlmAdapter`，只实现一个异步生成器方法 `stream(options)`，产出 `StreamChunk`，方法体就是适配器的全部工作：翻译请求、发 HTTP、解析 SSE、yield chunk。外面套插件的标准件：`name` 声明插件名，`inject` 声明依赖 `ctx.llm`，`Config` 用 schemastery 声明配置（`apiKey` 标成 secret，`baseURL` 给默认值）。入口 `apply(ctx, config)` 里一句 `ctx.llm.registerAdapter(['my-provider'], new MyAdapter(config))`，把适配器挂上 `my-provider` 路由。

四条注册规矩值得先记住。

注册是基于副作用的。`apply` 里调 `registerAdapter`，这个调用是 Cordis 的可逆副作用，插件卸载时自动撤销。它因此 HMR 安全：改了配置热重载，旧路由干净撤掉，新路由挂上，不留垃圾。

一个 provider 路由只能有一个适配器。重复注册会抛 `DUPLICATE_ADAPTER`，而且是 all-or-nothing，要么全注册成功要么一个都不动。这条规矩杜绝了"同一个 provider 有两个适配器，运行期不知道走哪个"的歧义（注册表的完整机制见 16 篇）。

`options.provider` 选适配器，`options.model` 是 provider 的模型 id。模型 id 不需要在生命周期开始时注册，所以一个能动态发现模型的适配器，可以不重启就服务新模型。

密钥走 schemastery Config 加环境变量回退。Config 里声明 `apiKey`，从 `cordis.yml` 里用 `!!js process.env.MY_KEY` 注入，绝不在代码里自己读 key 文件。这是 `dsh` 凭证管理的统一姿势：集中、可轮换、不散落。

## 把职责拆开

写适配器最容易犯的错，是把所有逻辑堆进一个 `stream()` 方法里。cookbook 明确建议把五件事拆成独立职责，对齐 `llm-deepseek` 的布局：

| 职责 | 干什么 | llm-deepseek 里的位置 |
|---|---|---|
| wire 类型 | provider 请求和响应的原生类型定义 | `types.ts` |
| 请求序列化 | 把 `GenerateOptions` 翻译成 provider 的 HTTP 请求体 | `translate.ts` |
| 传输解析 | 解析 provider 返回的流（SSE、chunked 等） | `sse.ts` |
| chunk 翻译 | 把 provider 事件翻译成 `StreamChunk` | `translate.ts` / `adapter.ts` |
| 适配器类 | 实现 `LlmAdapter`，串起上面四件事 | `adapter.ts` |

拆开的好处是可测：你可以单测"请求序列化对不对"而不需要发真实 HTTP，也可以单测"SSE 解析对不对"而不需要管模型逻辑。`llm-deepseek` 的测试目录里就有 `translate.spec.ts`、`sse.spec.ts` 各自独立测。

## 一步步接 OpenAI 兼容端点

下面给一个接 OpenAI 兼容 `/v1/chat/completions` 端点的示意实现，教学用的骨架，重点是契约怎么落，不是生产就绪代码。

### 第一步：翻译请求

`GenerateOptions` 是 provider 中立的，你要把它变成 OpenAI 的请求体。`system` 映射到第一条 system 消息，`messages` 映射到 `messages` 数组，`tools` 映射到 `tools` 字段，`temperature`、`maxTokens`、`stop` 一一对应。写成一个 `serializeRequest()` 函数：组 messages 数组（有 system 就先放一条，再逐条转换 content），URL 是 baseURL 拼 `/chat/completions`，请求体里 `maxTokens` 映射到 `max_tokens`。

两个开关是关键：`stream: true` 要流式；`stream_options: { include_usage: true }` 让 provider 在流末尾给 usage。OpenAI 兼容端点默认不在流式响应里给 token 用量，你得显式要，它才会在流结束时发一个带 usage 的尾巴 chunk。这关系到下面第一条契约。

### 第二步：解析 SSE 流

OpenAI 兼容端点用 SSE 推流：每个事件是 `data: {...}`，流结束是 `data: [DONE]`。解析写成一个异步生成器 `parseSSE(response)`：取 `response.body`，串两条管道，先过 `TextDecoderStream` 把字节解成文本，再过 `eventsource-parser` 的 `EventSourceParserStream` 切成 SSE 事件；然后 `for await` 遍历，见到 `[DONE]` 就结束，否则把 `event.data` 解析成对象交给下游。用库解析是为了避免手写分隔出错，`llm-deepseek` 用的就是它。

### 第三步：把 provider 事件翻译成 StreamChunk

这是核心。OpenAI 流式响应里，每个 chunk 是 `choices[0].delta`，delta 里可能有 `content`（文本）、`tool_calls`（工具调用片段），尾巴 chunk 里可能有 `usage`。翻译规则一句话：**block 的 index 按首次出现顺序分配，同一块的每个 delta 复用同一个 index**。

`stream()` 的主流程五段。发请求：用 `serializeRequest()` 的结果发 POST，请求头带 `Authorization` 和 `Content-Type`，再展开 `attributionHeaders()`（app 归因头必须带），`signal` 必须传 `options.signal`；响应不 ok 就抛 `LlmError`。备记账：一张 `toolCallIndexes` 映射，从 OpenAI 的 tool call index 映到本地 block index；一个 `nextBlock` 发号器。翻译：遍历 `parseSSE()` 吐出的每个事件，文本内容就三连发 `block-start`、`text-delta`、`block-end`；工具调用片段首次出现时领一个新 index 并发 `block-start`，然后发 `tool-call-delta`，`argumentsDelta` 保持原始 JSON 字符串；usage 出现就发 `usage` chunk。收尾：给每个工具调用块发 `block-end`，把累计的 arguments 拼好后封口。最后发 `finish`，reason 是 `{ kind: 'stop' }`。

注意这是简化骨架。真实实现要在内存里累计每个工具调用的 `argumentsDelta`，在流结束时拼成完整 JSON 字符串，再用 `block-end` 发出完整的 `ToolCallBlock`。上面为了讲清主流程省略了累计逻辑。

### 第四步：token 用量的口径

这是最容易踩的坑。`dsh` 用的是**不相交（disjoint）计数**：`inputTokens` 只算未缓存输入，缓存命中单独报为 `cacheReadTokens`/`cacheWriteTokens`，计费输入是三者之和。

但 OpenAI 兼容端点（和 DeepSeek 的 `prompt_tokens`）经常把缓存命中折进一个总数。你的适配器有责任把它减出来：换算函数 `toTokenUsage()` 做三个字段的映射，`outputTokens` 取 `completion_tokens`，`cacheReadTokens` 取 `prompt_tokens_details` 里的 `cached_tokens`，而 `inputTokens` 如果这个数里含缓存命中，要先减出来。

口径错了，token 计费和上下文压力探测就全错。cookbook 专门单列一节讲这个，两个官方适配器都因为它专门做了减法。

## 七条协议义务，逐条对账

cookbook 把契约浓缩成七条，写适配器时逐条自检。

1. `usage` 在 `finish` 之前，`finish` 之后什么都不发。稳妥做法是把 finish 和 usage 缓冲到 provider 的流结束标记再一起 flush，这处理了某些 provider 发"只有 usage 的尾巴 chunk"的情况。上面的实现里，靠 `stream_options: { include_usage: true }` 拿到 usage，再在 `[DONE]` 后发 finish，顺序就对了。
2. 工具调用 `arguments` 全程是原始 JSON 字符串，片段用 `argumentsDelta` 流式传。如果你的 provider 直接返回解析后的对象，在 `block-end` 时重新 stringify。
3. block 的 `index` 按首次出现顺序分配，同一个块的每个 delta 复用同一个 index。
4. 错误只有两条合法出口。要么从 `stream()` 里 throw（传输和协议失败，用 `LlmError` 带稳定 code），要么用 `finish {kind:'error'|'aborted'}` 结束流（provider 带内失败）。按失败类别选一个，并写进文档。
5. 必须响应 `options.signal`。把它传给 fetch 或你的 SDK，调用方取消时你要能及时停下来。
6. 不支持的字段要明确报错。provider 不支持 `stop` 序列，就抛 `LlmError(..., 'UNSUPPORTED')`，而不是静默丢弃。静默丢弃会让调用方以为生效了，bug 极难查。
7. 需要 native 元数据的，用 `finish.replayState`。如果 provider 在后续调用里要求带上次的响应 id、签名之类的原生元数据，把最小化的无损 JSON 投影作为 `replayState` 发出，重建历史时校验它。`LlmRuntime` 只在历史 provider 路由和目标 provider 路由当前属于同一个适配器实例时才传这段状态；你的适配器自己决定同模型、跨模型、跨 provider 的恢复是否合法。状态缺失时，绝不凭 provider/model 名字猜 native replay。

这七条不是建议，是硬性义务。两个官方适配器都是按这套契约验证过的，你的适配器也得这样。

## 模型元数据与 reasoning

除了 `stream()`，适配器还可以实现几个可选方法提供模型元数据。最常用的是 `resolveModel(provider, model, signal)`，返回精确模型的身份加可选的 `context`（上下文窗口）和 `reasoning`（推理档位）字段。

reasoning 档位是适配器拥有的有序不透明 id 列表，由适配器映射到 provider 请求。注意几点：保留适配器权威的可选列表（包括适配器自定义的 `off` 档，如果支持的话）；不要暴露最终的 wire 拼写；不要把不支持的值 clamp 掉；一个 id 不必等于它的 wire 表示。只有当确实存在部署默认档位时，才声明 `defaultEffort`。

provider 专属的思考模式开关留在适配器的 Config 里，不进 provider 中立的请求类型。

## 验证：别只靠手测

写完适配器，验证要走仓库的 testing policy。`llm-deepseek` 的测试目录给出了范例：

- `translate.spec.ts`：单测请求序列化，不发真实 HTTP。
- `sse.spec.ts`：单测 SSE 解析。
- `mock-server.ts`：一个本地 mock server，跑端到端的 stream 流程但不碰真实 provider。
- `adapter.spec.ts`：用 mock server 测适配器整体行为。
- `adapter.e2e.ts`：真实 provider 的端到端测试，通常在 CI 里按条件运行。

关键是三件事：验证 app 归因头真的发出去了（wire 级测试），验证 token 用量口径对，验证错误归一化的 code 对。这些在契约里都是硬要求。

## 权衡与坑

别把 provider 中立类型和 wire 类型混在一起。`GenerateOptions` 是 provider 中立的，OpenAI 的请求体是 wire 类型。混在一起，适配器就和 provider 中立层耦合了，以后换 harness 内部表示会牵连你。分开两个文件，中间一个翻译函数。

fetch 库的 retry 要关掉。契约要求一次适配器调用等于一次 provider 尝试。很多 HTTP 库默认开 retry，你要显式关掉，否则重试会和 agent 级别的恢复（`dsh-llm-retry`）叠加，行为不可控。

上下文溢出要归一化。你的 provider 报"上下文超长"时，通过类似 `isContextWindowExceededError()` 的判断，归一成 `CONTEXT_WINDOW_EXCEEDED` code，不管它是 HTTP 413 还是带内消息。消费者只按 code 路由。

空响应要当错误。终态 `stop` 但一个 content block 都没有的，映射成 `finish {kind:'error'}` 加 `EMPTY_RESPONSE` code，别让它静默成功。

## 结论

接一个 OpenAI 兼容 provider，在 `dsh` 里是个边界清晰的活：继承 `LlmAdapter`、实现 `stream()`、拆成 wire 类型/序列化/传输解析/chunk 翻译/适配器类五块、注册到 `ctx.llm`、密钥走 schemastery Config。难的不是写代码，是守七条协议义务：usage 顺序、原始 JSON 参数、index 分配、两条错误出口、响应 signal、不支持就报错、replayState 所有权。

守住了，你的 provider 就和官方三个 provider 一样，享受 harness 的拼装、归一化、重试、日志、可重建全套兜底。守不住，bug 会藏在 token 计费、上下文压力、错误恢复这些不容易复现的地方。

## 延伸阅读

- [Cookbook: adding an LLM adapter](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-an-llm-adapter.md)：本文主要依据，含契约原文与参考实现指引
- [LLM Streaming 文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/llm-streaming.md)：`StreamChunk` 协议与适配器契约的完整定义
- [`packages/llm/llm-deepseek`](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/llm/llm-deepseek)：direct HTTP 参考实现，本文布局对齐它
- [Testing Policy](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.md)：适配器覆盖、真实 provider 检查、发布要求

上一篇：[多模态与 Attachment：dsh 怎么让 agent"看图"](./17-multimodal-attachments.md)
下一篇：[沙箱、审批与权限：dsh 怎么安全地放 agent 上机](./19-sandbox-approval-permission.md)
