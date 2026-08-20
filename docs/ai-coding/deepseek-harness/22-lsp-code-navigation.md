# LSP 接缝：让 agent 真正"懂"代码导航

> `dsh` 把 LSP 做成一个只暴露四个归一化操作、且**没有任何协议逃生舱**的能力接缝，模型永远只问"跳定义、查引用、跳实现、hover"这四件事，原始 JSON-RPC、文档同步、进程控制全部藏在 provider 后面，换语言服务器不影响模型怎么问。
> 这是个很硬的设计取舍：宁可让 agent 只能做这四件事，也不让它直接对着 LSP 协议乱发，换来的是模型工具的跨 provider 稳定。

## 为什么 agent 需要 LSP 接缝

agent 想理解代码，最朴素的办法是 grep。但 grep 是文本匹配，它不知道 `foo` 在第 30 行是个变量定义、在第 200 行是个调用、在第 50 行只是注释里提到。它会把三者混在一起，agent 就得自己猜哪个是真正的引用。

语言服务器协议（LSP）解决的就是这个问题。它给的是**语义**导航：这个符号的定义在哪、谁引用了它、它的实现是什么、悬停在上面是什么类型信息。这才是 agent 真正"懂"代码该用的工具，而不是把代码当纯文本扫。

但 LSP 是个庞大、复杂、面向编辑器的协议。它有几十个方法、一套文档同步机制、一套能力协商流程。如果让 agent 直接对着原始 LSP JSON-RPC 发请求，后果是：每换一个语言服务器，模型就得重新学一套能力差异；文档同步、进程生命周期这些编辑器才该操心的事，全暴露给了 agent loop；模型的工具签名永远在变。

`dsh` 的解法是做一个**极薄的归一化接缝**：只暴露四个操作，把协议的一切复杂度藏在 provider 后面，并且**故意不给任何逃生舱**让你绕过这四个操作去碰原始协议。

## 四个归一化操作

接缝和模型暴露的语义查询**精确地只有四个**：

联合类型 `LspOperation` 的取值是 `goToDefinition`、`findReferences`、`goToImplementation`、`hover`。

跳定义、查引用、跳实现、悬停。没了。

这是个**封闭联合**。加一个操作不是改一个地方，而是在接缝、所有 provider、模型工具三处同时改，编译器强制你改全。这种"故意把扩展成本做高"的设计，和 stream 契约里的 `StreamChunk` 是一个路子：换来的是所有消费者都能依赖的稳定类型安全。

值得注意它**故意不包括**什么。符号搜索（workspace/symbol）、调用层级（call hierarchy）这些 LSP 也有的能力，在这里不是操作。文档说得很直白：它们需要不同的 schema。与其硬把它们塞进一个统一的操作类型里拧巴，不如先不做。这是一种克制：接缝只做能做干净的四件事。

## 无协议逃生舱

这是整个 LSP 接缝最强势、也最值得理解的一条设计决策。文档原话：

> The seam exposes no protocol types, process/document controls, or generic JSON-RPC escape hatch.

接缝不暴露任何协议类型、不暴露进程或文档控制、不给任何通用 JSON-RPC 逃生舱。

什么意思？你没法通过这个接缝给底层的语言服务器发一个任意的 LSP 请求。你只能发那四个归一化操作。文档同步、能力协商、进程启动关闭、`textDocument/didOpen` 这些，全藏在 provider（`dsh-lsp-stdio`）内部，调用方看不见也碰不到。

为什么这么硬？因为只要留一个逃生舱，就会有插件走捷径直接发原始协议请求，于是模型的工具签名就开始泄漏协议细节，跨 provider 的稳定性就被破坏了。关死逃生舱，强迫所有导航走四个归一化操作，模型怎么问就永远只取决于这四个操作，不取决于底层是 tsserver 还是 gopls 还是 rust-analyzer。

代价是明确的：agent 做不了这四件事之外的 LSP 能力。想查符号、查调用层级、做重命名、跑代码动作，这个接缝帮不了你。要么等接缝扩展（要同时打通三处编译），要么用别的工具（比如 grep、或者 code runtime）。这是个主动的取舍：用有限的能力，换干净的抽象。

## 接缝：`ctx.lsp`

`ctx.lsp` 的服务类型是 `LspService`，定义在 `packages/lsp/lsp`。它只做两件事：注册 provider，按扩展名选 provider 跑查询。

### 注册与选择

一个 provider 拥有一个稳定的 branded `id` 和一张排他的、小写带前导点的扩展名映射（比如 `{ '.ts': 'typescript' }`）。`registerProvider` **原子地**预留这个 id 和它的每个扩展名：任何一个无效或冲突，整个注册什么都不发布，抛 `LspError`。返回的 disposer 释放所有预留。

选择是**按查询、与顺序无关**的。来一个查询，按文件扩展名找到对应的 provider，转发。没匹配到就抛 `LSP_UNAVAILABLE`。因为选择是按查询的，所以多个 provider 可以共存，各管各的扩展名，互不干扰，也不依赖注册顺序。

### provider 拿到的是加过工的请求

调用方给的是 `LspQueryRequest`，每个字段都必填：operation、filePath、position、workspaceRoot。注意没有 `resolve()` 这一步。为什么不需要？因为 `languageId` 不在请求里，它来自 provider 的注册（扩展名映射），由接缝在转发时派生出来加到请求上。消费者自己拥有超时和结果上限。没有任何字段需要实现层补默认值，所以没有 resolve 步骤。

provider 拿到的是 `LspProviderQuery`：调用方的请求加派生出的 `languageId`。这个 languageId 的唯一作用是同步瞬态文档（让语言服务器知道这是个什么语言的文件），**不参与 provider 选择**。选择是按扩展名做的，languageId 只是给被选中的 provider 用的。

### findReferences 自带声明

一个体贴的细节：`findReferences` 的结果**总是包含声明本身**。这件事由 provider 内部强制，调用方拿不到也不需要一个"是否包含声明"的标志。这避免了"我查了引用，但定义本身没在结果里"的困惑。

## 坐标：零基 UTF-16 与工作区 URI

坐标系统有两个细节值得记住。

**第一，位置是零基 UTF-16。** 这和 LSP 线上协议一致。模型面向的工具另外维护一套一基的光标约定，在进出的时候转换。也就是说，模型看到的是一基（人更习惯），接缝和协议用的是零基 UTF-16。这个转换在 `dsh-tool-lsp` 里做，不污染接缝。

**第二，locations 结果带 `resolvedWorkspaceUri`。** 导航操作返回的位置里，带的是 provider 规范化的工作区 `file:` URI。调用方要把位置 URI 相对化时，**必须**用这个坐标，而不是用宿主平台的路径规则去解析可能带符号链接的请求根。为什么？因为执行平台可能和调用方平台不同（回忆前面几篇，fs 和 shell 可能指向远程沙箱）。用 provider 给的规范 URI，才不会在跨平台时把路径搞错。

## 结果：封闭联合

结果也是个封闭的判别联合：

类型 `LspQueryResult` 按 `kind` 判别出两个分支：`kind` 为 `locations` 的带 `locations`（`readonly LspLocation[]`）和 `resolvedWorkspaceUri`（字符串）；`kind` 为 `hover` 的带 `hover`（`LspHover | null`）。

导航操作（跳定义、查引用、跳实现）归一成 `locations`；hover 归一成内容或 `null`。消费者在 `kind` 上 switch 到穷尽，加一个新的 arm 会编译失败直到处理。hover 在该位置没有内容时返回 `null`，不是空字符串，也不是错误。

## 错误：稳定码

LSP 失败用稳定的 `LspError`（继承 `HarnessError`）携带码：`LSP_INVALID_PROVIDER`、`LSP_CONFLICT`、`LSP_UNAVAILABLE`、`LSP_DISPOSED`、`LSP_UNSUPPORTED_OPERATION`、`LSP_MALFORMED_RESPONSE`。调用方按码路由，不解析 `message`。这和 fs、sandbox、shell 的错误分类是同一套纪律：机器可路由的码，人可读的消息。

`LSP_MALFORMED_RESPONSE` 这一条值得注意：语言服务器返回的 JSON 不符合预期形状时，是这个码而不是一个通用解析错误。这意味着 provider 负责校验语言服务器的响应，坏响应被归一成一个明确的码，调用方可以据此决定重试还是放弃。

## provider 怎么翻译

`dsh-lsp-stdio` 是通用的 provider：一个可配置的 stdio 语言服务器宿主。它的工作就是把接缝的四个归一化操作，翻译成底层语言服务器说的原始 LSP JSON-RPC。

subprocess 接缝提到 LSP 用它的原始协议管道（`stdout: 'pipe'`）。这条链路是：`ctx.lsp` 收到一个归一化查询，选中 `dsh-lsp-stdio` provider，provider 通过 `ctx.subprocess` 起一个语言服务器进程，拿原始管道和它说 JSON-RPC，把响应翻译回四个归一化结果之一。文档同步、能力协商、进程生命周期，全在这一个 provider 内部。接缝和模型看不见这些。

这就是"无协议逃生舱"在物理上的实现：协议翻译集中在一个 provider 里，而不是散落在每个调用方。换一个 provider（比如换成基于远程语言服务器的 provider），模型的查询一个字不用改。

## 真实代码落点

- `packages/lsp/lsp/src/types.ts`：`LspOperation`、`LspQueryRequest`、`LspProviderQuery`、`LspQueryResult`、`LspProvider`、`LspService`。
- `packages/lsp/lsp-stdio`：通用 stdio 语言服务器宿主 provider，做协议翻译。
- `packages/lsp/tool-lsp`：模型面向的 `lsp` 工具 schema，拥有一基光标约定和进出转换、结果渲染。
- LSP 是可选能力，不在 agent-loop 主干里。它的词汇表在 `docs/subsystems/lsp.md`，不在 `core.md`。

## 权衡与局限

**只有四个操作。** 这是最大的局限。符号搜索、调用层级、重命名、代码动作、格式化，这个接缝都做不了。如果你需要这些，要么等接缝扩展，要么用别的工具兜。这是为了抽象干净主动选择的有限性。

**无逃生舱限制了高级用法。** 一个精通 LSP 的用户没法通过这个接缝发任意请求。所有能力都被四个操作框住。好处是稳定，坏处是灵活度被锁死在 provider 愿意翻译的范围内。

**坐标转换的负担在工具层。** 零基 UTF-16 和一基的转换、结果渲染，都在 `dsh-tool-lsp` 里。如果工具层有 bug，agent 看到的坐标就会错位。这是把"协议细节"和"模型友好表示"分离的代价。

**provider 要负责校验语言服务器响应。** 一个行为异常的语言服务器返回怪东西，provider 要把它归一成 `LSP_MALFORMED_RESPONSE`，而不是让坏数据流到调用方。这给 provider 实现增加了责任。

## 结论

`ctx.lsp` 是一个极薄、极克制的接缝：四个归一化操作，封闭的操作联合和结果联合，按扩展名选 provider，没有任何协议逃生舱。所有的 LSP 协议复杂度（文档同步、能力协商、JSON-RPC、进程生命周期）都藏在 `dsh-lsp-stdio` provider 内部，接缝和模型只看四个操作。

几个判断：四个操作是故意选的最小集，符号和调用层级因为需要不同 schema 暂时不做；无逃生舱是主动取舍，用有限能力换跨 provider 的模型工具稳定；坐标用零基 UTF-16 对齐协议，工作区相对化必须用 provider 给的 `resolvedWorkspaceUri`；findReferences 自带声明，错误按稳定码路由。

这个接缝体现的设计哲学和前面几篇一脉相承：在包边界做归一化，把协议复杂度集中到一处，让消费者依赖稳定的抽象而不是多变的实现。LSP 这个最容易泄漏协议细节的地方，被这条规矩收得最干净。

## 延伸阅读

- [LSP navigation 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/lsp.md)：本文主要依据，含四个操作与封闭联合定义
- [LSP capability seam 设计笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-07-15-lsp-capability-seam.md)：接缝的设计理由
- [Capability Seams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)：`ctx.lsp` 行，三角色模式
- [Subprocess](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subprocess.md)：LSP 用它的原始协议管道
- [`packages/lsp/lsp/src/types.ts`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/lsp/lsp/src/types.ts)：接缝类型源码

上一篇：[Shell / Subprocess / Terminal：命令执行的三层抽象](./21-shell-subprocess-terminal.md)
下一篇：[Code Runtime 与 Code Mode：模型写代码并执行](./23-code-runtime-and-code-mode.md)
