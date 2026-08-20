# 多模态与 Attachment：dsh 怎么让 agent"看图"

> 在 `dsh` 里，一张图永远不会原样出现在会话日志里，日志只存一个内容寻址的不可变引用，真正的字节存在 attachment 存储里，谁要用谁去按引用取。
> 这条"二进制所有权和会话日志分离"的规矩，是让图片能在 fork、resume、跨 provider 迁移时不丢不乱、也不撑爆日志的根基。

## 为什么 agent 看图是个难题

让模型看图，听起来就是"把图片塞进请求"。但一旦你想清楚几个工程问题，就会发现"塞进去"远没那么简单：

- 图片是二进制大对象，base64 之后体积膨胀三分之一，直接写进会话日志，日志立刻变成几 MB 起步，序列化、持久化、传输全受拖累。
- 同一张图可能在 fork 出来的会话、resume 的会话、以及原始会话里被反复引用，如果每个会话都存一份字节，空间浪费且容易不一致。
- 模型可见的任何东西都必须能从会话日志重建。如果图片是浏览器临时 URL 或宿主机临时路径，进程一重启、一换机器，路径就失效，日志就废了。
- 不同 provider 接受图片的格式不一样，有的要 base64 data URL，有的要图床 URL，有的要 multipart。把任何一种 provider 专属格式写进日志，就等于把日志和 provider 绑死了。

`dsh` 的解法是引入一个专门的接缝 `ctx.attachments`，把"二进制图片归谁管"从会话日志里彻底剥离出去。

## 心智模型：引用，不是字节

一句话的心智模型：**会话日志和模型请求里流通的是引用，字节待在 attachment 存储里。**

生产者（比如浏览器前端、或模型自己产出的图）把校验过的编码字节交给 `ctx.attachments`，服务返回一个**内容寻址的不可变引用**（`ImageAttachmentRef`）。之后，会话事件里、模型可见的 `ImageBlock` 里，装的都是这个引用加元数据，绝不是浏览器 object URL、宿主机临时路径、provider 图床 URL，也不是 base64 payload。

字节什么时候真正落盘？在宿主接受用户消息、把用户事件追加进日志**之前**。文档原话：图片会先搬到 `<DSH_HOME>/attachments/v1` 下面，然后才追加用户事件。结构化的模型图片输出也遵守同一条"先持久化再发事件"的规矩。

这条规矩的直接后果是：日志永远是轻的、纯文本可序列化的、和具体机器无关的。图片字节是个独立的内容寻址存储，谁需要谁按引用取，取的时候还要再校验一遍。

## 接缝：`ctx.attachments`

`ctx.attachments` 的服务类型是 `AttachmentStore`，定义在 `packages/attachment/attachment/src/index.ts`，是个抽象接缝。能力 seams 文档对它的定位是：把二进制图片所有权和会话日志分开。

和所有接缝一样，它有三个角色。Service Definition 是 `packages/attachment/attachment`（零具体依赖的接口包），Service Provider 是 `packages/attachment/attachment-local`（本地实现，存到 `<DSH_HOME>/attachments/v1`），Consumer 是会话日志和组装模型请求的适配器。宿主为每个接缝组合且仅组合一个 provider，挂第二个会按 Cordis 标准的重复服务行为抛错。

接缝只暴露三个方法，每个都极克制：

`validateImage(input: SaveImageAttachment)` 返回 `Promise<void>`，`saveImage(input: SaveImageAttachment)` 返回 `Promise<ImageAttachmentRef>`，`readImage(ref: ImageAttachmentRef, signal?: AbortSignal)` 返回 `Promise<StoredImageAttachment>`。

- **`validateImage`**：跑完整的准入校验（完全解码字节、核对声明的 media type、检查尺寸和体积上限），但不落盘。批量提交时，调用方先用它把每一张都验过，再开始存任何一张，这样一旦某张被拒，不会留下半截已存的对象。
- **`saveImage`**：校验加原子落盘一个对象，然后才返回引用。返回的引用就是它对外暴露的全部身份。
- **`readImage`**：接受一个引用，返回字节，但返回之前**重新校验**：摘要、媒体签名、尺寸、元数据，全都要和记录的对得上。校验失败抛存储错误，abort 抛信号原因。

注意 `readImage` 的"再校验"。这是为什么引用敢用内容寻址：存储层不信任任何中间缓存，每次读都重新确认字节没动过、没坏。

## 引用里有什么

`ImageAttachmentRef`（`packages/attachment/attachment/src/types.ts`）记录的不是字节，是足够让客户端在不解码的情况下布局的元数据：

- `attachmentId`：类型 `AttachmentId`，不透明存储 id，绝不是路径或带凭证的 URL。
- `mediaType`：类型 `ImageMediaType`，从存储字节验证出来的媒体类型。
- `bytes`：数字，精确编码字节数。
- `width`：数字，编码固有宽度，像素。
- `height`：数字，编码固有高度，像素。
- `name`：可选字符串，展示名，已剥离本地路径信息。

`AttachmentId` 是个 branded 不透明字符串。本地后端当前发的是 `sha256:<digest>`，但文档明确警告：消费者既不能去解析这个表示，也不能从中推出文件系统路径。今天它是 sha256 前缀，明天换成别的，消费者不该受影响。这是把"实现细节"和"对外契约"用类型隔开的典型做法。

支持的栅格格式当前是四种：`image/png`、`image/jpeg`、`image/webp`、`image/gif`。`ImageAttachmentLimits` 还管着部署级的几道闸：单图最大字节、单消息最多图片数、单消息图片总字节、最大像素数、允许的媒体类型列表。

## 两个反常识的取舍

**第一，存留中立（retention-neutral）。** attachment 服务故意不绑死垃圾回收策略。resume 和 fork 出来的会话可能共享同一批对象，所以"一个会话删了就把它引用的图也删了"是错的，会误伤别的会话。`dsh` 把引用感知的 GC 推迟处理，而不是绑在某个会话的删除上。代价是存储会慢慢累积，需要更高层的清理策略；回报是 fork/resume 不会因为图片被误删而坏掉。

**第二，先持久化再发事件。** 无论用户提交的图还是模型产出的图，都必须先在 attachment 存储里落盘、拿到引用，然后才允许把引用写进会话事件。反过来会怎样？如果先写事件再存图，一旦存图失败，日志里就挂着一个指向不存在的引用，这个会话就半残了。把顺序定死成"先存后记"，事件日志就永远是自洽的。

## provider-native content：引用怎么变成 provider 能吃的格式

会话日志里存的是引用，但 provider 的 HTTP API 不认引用，它认 base64、认图床 URL、认它自己的多模态结构。这个翻译发生在哪？发生在 LLM 适配器的 `translate` 阶段。

`GenerateOptions`：它的 `messages` 是 `Message[]`，每条 message 的 `content` 是 `ContentBlock[]`，其中 `ImageBlock` 携带的就是 attachment 引用和元数据。适配器在把 provider 中立的请求翻译成具体 provider 的 wire 格式时，遇到 `ImageBlock`，就用 `ctx.attachments.readImage(ref)` 把字节取出来，再按这个 provider 接受的方式编码（比如 base64 data URL）塞进 HTTP 请求体。

这套设计的妙处在于：**会话日志和 provider 完全解耦**。同一份带图的会话日志，今天用 DeepSeek 的 vision 模型跑，字节被编码成 DeepSeek 要的格式；明天换一个 provider，同一个引用被另一个适配器用另一种方式编码。日志一个字都不用改。这也是为什么文档反复强调 ImageBlock 里绝不放 provider URL 或 base64，那等于把日志焊死在某个 provider 上。

## 模态声明：模型得先说自己能看图

光有图和接缝还不够，模型本身得声明它支持图片输入。Quick Start 文档的排错表里有一条很说明问题：

| 症状 | 原因 | 修法 |
|---|---|---|
| 图片在发送前被拒 | 模型没声明 image 模态 | 在 `$DSH_HOME/settings.yaml` 里给模型加 `input: [text, image]` |

也就是说，模态能力是模型元数据的一部分（`LlmModelInfo` 的 `inputModalities` 字段）。模型如果没声明 image 模态，图片在组装请求时就会被拦下来，根本到不了 provider。这把"能不能看图"从一个运行期试错，变成了一个前置的、可校验的声明。

## 宿主怎么提交图

把链路从头串一遍。在 Web UI 场景下：

1. 浏览器前端把用户选的图暂存在内存里（未发送的草稿可以只待在内存，原生客户端可以暂存到操作系统的临时存储）。
2. 用户点发送，宿主接受这条消息。在此之前或同时，前端把图的字节交给 `ctx.attachments.saveImage()`。
3. `saveImage` 校验字节、原子落盘到 `<DSH_HOME>/attachments/v1`，返回 `ImageAttachmentRef`。
4. 这个引用被写进用户消息事件，追加进会话日志。字节本身从没进过日志。
5. 后续某个 step 组装模型请求时，适配器读出 `ImageBlock` 里的引用，用 `readImage` 取字节，编码成 provider 格式发出去。

关键不变量在第 3 步和第 4 步的顺序：先拿到引用，才允许写事件。这也解释了为什么"保存后立即生效、不用重启"对图片也成立，因为 attachment 存储是写时校验、读时再校验的，没有需要预热的状态。

## 真实代码落点

给几个能对上的源码位置：

- `packages/attachment/attachment/src/types.ts`：`ImageAttachmentRef`、`SaveImageAttachment`、`StoredImageAttachment`、`ImageAttachmentLimits`、`ImageMediaType`。
- `packages/attachment/attachment/src/index.ts`：`AttachmentStore` 抽象接缝，三个方法。
- `packages/attachment/attachment-local/src/store.ts`：本地实现，内容寻址落盘。
- `packages/attachment/attachment-local/src/image.ts`：解码、校验媒体签名和尺寸的准入逻辑。
- 模型可见的 `ImageBlock` 定义在 `packages/llm/llm/src/message.ts`，是 `ContentBlockMap` 的一个成员。一个新模态要进这个 map，得先让适配器、UI、压缩、持久化重放路径都支持它（16 篇讲的封闭联合门禁）。图片是当前唯一落地的非文本模态。

## 权衡与局限

**当前只支持图片，且是四种栅格格式。** 没有音频、视频、PDF 这类模态。想加一个新模态，不是改一个地方，而是要同时打通适配器翻译、UI 渲染、压缩器处理、持久化重放四条路径，门槛不低。

**GC 是个待解的债。** 存留中立意味着没有自动清理，长期跑的部署会累积孤儿对象。这是为了 fork/resume 正确性主动欠下的债，需要部署方自己补引用感知的清理策略。

**适配器翻译图片是 provider 专属逻辑。** 虽然 `dsh` 把字节所有权统一了，但"字节怎么变成 provider 要的格式"仍然是每个适配器自己写。这意味着接一个新 vision provider，图片编码这摊事还是省不掉，只是省掉了"日志里存什么"那一摊。

**`readImage` 每次都重新校验，有成本。** 大图、高频读的场景下，完整的摘要和签名校验不是免费的。换来的安全性（字节被篡改或损坏能被发现）在多数场景下值这个钱，但极端高频场景要注意。

## 结论

`ctx.attachments` 用一个内容寻址的不可变引用层，把图片字节从会话日志里彻底剥离。日志只存引用和元数据，字节待在独立存储里，谁用谁按引用取，取的时候再校验。这条规矩让图片在 fork、resume、跨 provider 迁移时都安全，让日志保持轻量、可序列化、与机器无关，也让"模型可见即可重建"这条硬约束对图片同样成立。

provider-native 的翻译发生在适配器层：同一个引用，不同适配器编码成不同格式，日志一个字不用改。模态能力则是模型自己的前置声明，没声明 image 模态的模型在请求组装阶段就会被拦下。

理解了这一层，你就能解释一个现象：为什么 `dsh` 的会话日志可以很小，却能驱动一个看图 agent。因为图不在日志里，日志里只有一把能取回图的钥匙。

## 延伸阅读

- [Durable Image Attachments 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/attachment.md)：本文主要依据，含全部类型与接缝定义
- [Capability Seams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)：`ctx.attachments` 行，三角色模式
- [Quick Start 排错表](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md)：图片被拒与模态声明的关系
- [`packages/attachment/attachment/src/types.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/attachment/attachment/src/types.ts)：`ImageAttachmentRef` 等类型源码

上一篇：[🔍 LLM 适配器：dsh 的 stream 契约源码导读](./16-llm-adapter-stream-contract-source-walkthrough.md)
下一篇：[🛠 给 dsh 写一个 LLM 适配器：接 OpenAI 兼容端点](./18-write-an-llm-adapter.md)
