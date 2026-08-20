# Code Runtime 与 Code Mode：模型写代码并执行

> 如果只能从这篇带走一句话：`dsh` 把"模型写一段程序并执行"做成两件事，`ctx.codeRuntime` 是底层执行接缝（跑一段带宿主绑定的程序，报告它打印和返回了什么），Code Mode 是建在它上面的消费模式（程序里能回调 agent 的工具，子调用照样走完整的工具管线）。
> 最关键的设计：程序失败是结果里的一个**字段**，不是异常；执行隔离是个诊断标签，**不是安全承诺**。

## 为什么 agent 要写代码并执行

agent 调工具，默认是一次调一个：读个文件、跑条命令、改段代码，每次都要模型想一步、发一个 tool call、等结果、再想下一步。这对简单任务够用，但对"把 30 个文件里的日期格式统一改掉""读 100 个 JSON 统计某个字段分布"这类任务就很笨，每一步的往返成本很高，模型还要在脑子里维护中间状态。

更好的办法是让模型写一段程序，程序里用循环、条件、数据处理逻辑去批量调工具，一次完成。这就是 code execution 的价值：把"很多次工具调用加编排逻辑"压成"一次程序执行"。

但这里有个核心的工程问题：程序里调工具，要不要和正常工具调用一样过策略关卡？如果不过，模型就能绕过审批和沙箱为所欲为；如果过，怎么把"程序里的子调用"接回工具管线。`dsh` 的答案分两层：底层 `ctx.codeRuntime` 只管执行程序加绑定，上层 Code Mode 把工具作为绑定暴露给程序，并让每个子调用走完整的工具执行管线。

## 底层接缝：`ctx.codeRuntime`

`ctx.codeRuntime` 的服务类型是 `CodeRuntime`，定义在 `packages/code-runtime/code-runtime`。它是一个可选能力，不在 agent-loop 主干里。它只做一件事：跑一段模型写的程序，程序能调用宿主提供的异步绑定，然后报告程序打印和返回了什么。

服务除了 `run(request)` 还有两个只读描述符：

- `language`：程序必须用什么语言写。`'typescript'` 和 `'python'` 是已知值，也是 `dsh-tools` 呈现的值，但**只有 `'typescript'` 有已发布的后端**。一个生成语言专属展示的消费者会 switch 它，遇到不能展示的就 fail loud。
- `isolation`：执行底质。`'worker-thread'`、`'process'`、`'container'`。注意文档特别强调：这是个**诊断标签，不是安全承诺**。

`isolation` 这一条要单独记住。看到 `worker-thread` 不等于"安全隔离了"。它只是告诉你程序跑在什么底质上，方便诊断。真正的安全边界由沙箱（`ctx.sandbox`）管，不归 code runtime 声明。把 isolation 当安全承诺，就会误以为代码跑在 worker 里就伤不到主机。

### 一次运行：请求进，结果出

`CodeRunRequest` 携带运行时作用其上的**一切**：

```ts
interface CodeRunRequest {
  program: string                              // 程序源码，作为 async 函数体跑
  bindings: CodeBindingNamespace[]             // 宿主函数，每命名空间一个全局对象
  signal?: AbortSignal                          // 中止：硬停程序，哪怕在循环里
}
```

`program` 作为一段 async 函数体执行，所以顶层 `await` 和 `return` 都可用，完成值变成结果的 `value`。`bindings` 是宿主暴露给程序的函数。`signal` 中止时，运行时硬停程序（哪怕在循环中途），resolve 出一个 `kind: 'abort'` 的失败。

为什么请求要带"一切"？因为"包边界处显式优于隐式"。默认值（时间预算、输出上限）是实现的已校验配置，不是藏在 `run()` 里的一个隐藏 `??`。请求不携带任何可选的调参旋钮让隐藏默认去填。

### 错误是字段，不是异常

这是这一层最重要的契约。`CodeRunResult` 把错误报告为**一个字段**，永远不是 `run()` 的 rejection：

```ts
interface CodeRunResult {
  value?: CodeJsonValue     // 完成值，跨过无损 JSON 边界才有
  logs: string[]            // 程序打印的文本，按顺序
  error?: CodeRunFailure    // 失败时才有
}
```

报告一个失败的程序是调用方的活，不是异常路径。这和 `ShellExecutor.run` 的"resolve-on-failure"契约一致。

`value` 只有在程序跑完、且完成值跨过了运行时的无损 JSON 边界时才存在。无效或超限的完成值会让运行失败，而不是替换成一个渲染好的字符串。这是个硬选择：宁可让运行失败，也不静默地把一个不能无损传输的值变成字符串糊弄过去。

## 绑定：宿主函数作为程序全局

每个 `CodeBindingNamespace` 在程序里变成一个全局对象，里面是一组 async 可调用函数。Code Mode 消费者传的就是一个命名空间：`tools`。也就是说，程序里能写 `await tools.someToolName({...})` 去调 agent 的工具。

绑定的参数和返回值**必须**是无损 JSON，可能通过 structured clone 跨越序列化边界。运行时会拒绝有损或不可克隆的值，给个描述性错误，而不是让运行坏掉。注意绑定解析**没有接缝级的字节上限**（上限由外层结果序列化统一管）。

### 把绑定名当敌意输入

这条很关键，体现了安全意识。运行时把绑定名当成**敌意输入**处理：

- 函数名是任意字符串，但运行时必须把 `__proto__` 或 `constructor` 这种名字当成普通自有属性（null-prototype 构造），绝不能当成原型碰撞。
- `global` 标识符必须匹配语言可移植子集 `[A-Za-z_][A-Za-z0-9_]*` 且不是任何语言的保留字。这样同一份命名空间列表对每个后端都工作，不管 `language` 是什么。一个 JS 专属拼法比如 `$tools` 被故意拒绝，不只是 Python 后端拒绝。
- 命名空间可以声明一个程序可见的错误类：运行时在 `name` 下注入真实的构造器，被拒的成员调用变成它的实例。这让程序能 `try/catch` 工具拒绝，但运行时不需要知道消费者的名字。

为什么这么防备？因为程序是模型写的，模型可能写出（或被诱导写出）试图污染原型、搞原型链攻击的代码。把绑定名当敌意输入，null-prototype 构造，从根上堵住这类攻击。

## 失败分类：正交，独立报告

`CodeRunFailure` 的 kind 是**正交结果，独立报告**（和 shell 的前台结果一个思路）：

```ts
interface CodeRunFailure {
  kind: 'exception' | 'timeout' | 'abort' | 'worker-exit' | 'invalid-output' | 'output-limit'
  message: string   // 人可读，适合喂回模型让它自我修正
}
```

文档讲得很清楚：预算到期不是异常，中止不是超时，底质死亡（比如 OOM）两者都不是。

- `exception`：程序抛了，或解析/转换失败。
- `timeout`：实现拥有的预算到期，message 说的是哪个预算。
- `abort`：调用方的 signal 触发。
- `worker-exit`：执行底质没结算就死了（比如 OOM）。
- `invalid-output`：完成值不是无损 JSON。
- `output-limit`：序列化的外层 logs/value/diagnostic 超过了配置上限。

把这几类分开报告，调用方才能区分"模型写错了代码"（exception，该让模型改）、"跑太久了"（timeout，该调预算或优化）、"底质崩了"（worker-exit，该换底质或查资源）、"返回值不合法"（invalid-output，该让模型改返回）。混成一团，就没法做对的事后处理。

输出上限也是一个明确的失败（`output-limit`），而不是带内值替换。这和 fs 的 `readBytes` 上限、shell 的 `CollectedOutput` 截断是一致的纪律：宁可明确失败或明确记下"丢了"，也不静默替换。

## Code Mode：程序里调工具，子调用走管线

理解了底层接缝，再看 Code Mode。Code Mode 是建在 `ctx.codeRuntime` 上的消费模式，它把 agent 的工具作为 `tools` 绑定命名空间暴露给程序。于是模型可以写一段程序，程序里用真实的编程逻辑去批量调工具。

关键的工程问题前面提过：程序里的子调用要不要过策略关卡？Code Mode 的答案是**要，完整地过**。工具执行管线文档原话：

> Code Mode sends both the reserved `run_code` transport and its serialized sub-calls through the pipeline; sub-calls carry the parent token, log `tool/code-dispatch`, return denials as binding rejections, and omit `additionalContexts` to preserve call/result adjacency.

拆开看：

- **两个东西都走管线**：Code Mode 把保留的 `run_code` 传输、以及它序列化的子调用，都送进工具执行管线。也就是说，跑代码这件事本身是一个工具调用（过 pre-execute、guards、approval、post-execute），代码里发起的每个工具子调用也各自过一遍同样的关卡。
- **子调用带父 token**：子调用携带父调用的 token，记 `tool/code-dispatch` 事件，这样审计能串起"哪个子调用属于哪次代码执行"。
- **拒绝作为绑定拒绝返回**：一个子调用被策略拒绝（审批没过、沙箱挡了），不是让整个程序崩，而是作为绑定拒绝返回到程序里。回忆前面，命名空间可以声明错误类，拒绝变成程序可 catch 的实例。这样程序能优雅地处理"某个工具调用被拒"，而不是整个崩溃。
- **不带 additionalContexts**：子调用省略 `additionalContexts`，保留 call/result 的邻接。这是为了让代码程序的子调用结果干净地回到程序里，不被额外的上下文注入打断。

这套设计让 Code Mode 既有编程的灵活性（循环、条件、数据处理），又不牺牲任何策略执行。模型写的一段批量改文件的程序，里面每个写文件的子调用，都和它单独发一个写文件工具调用一样，经过审批、沙箱、观察策略。没有任何"因为是在代码里调的所以绕过审批"的后门。

### 两个 Code Mode 基础

worker-thread Service Provider 和 tool-registry Consumer 由两份设计笔记规定：Code Mode foundation（2026-06-15）和 typed-return contract（2026-07-20）。后者特别重要：它让工具子调用的返回是类型化的，程序能拿到结构化的结果而不是一团文本，这对在程序里做数据处理很关键。

## 底层接缝与 Code Mode 的分工

把两层的关系讲清楚：

- `ctx.codeRuntime` 是**怎么执行一段带绑定的程序**。它不关心绑定的函数是什么，它只负责跑程序、桥接绑定调用、捕获输出、报告结果。换执行底质（worker、process、container）是换它的 provider。
- Code Mode 是**让程序能调 agent 工具的消费模式**。它把工具注册表包成 `tools` 绑定，让程序能回调工具，并保证子调用走完整管线。它是 codeRuntime 的消费者，不是 codeRuntime 的一部分。

换一个 code runtime 后端，Code Mode 的逻辑不变；不用 Code Mode，code runtime 也能跑（比如跑一段纯计算、不带工具绑定的程序）。两层正交。

## 真实代码落点

- `packages/code-runtime/code-runtime/src/types.ts`：`CodeRunRequest`、`CodeRunResult`、`CodeRunFailure`、`CodeBindingNamespace`、`CodeBindingErrorClass`。
- `packages/code-runtime/code-runtime/src/index.ts`：`CodeRuntime` 抽象接缝，`run`、`language`、`isolation`。
- worker-thread provider 和 tool-registry Consumer 由 Code Mode foundation 笔记规定。
- `run_code` 传输和 `tool/code-dispatch` 事件在工具执行管线里（`docs/tool-execution-pipeline.md`）。

## 权衡与局限

**isolation 不是安全承诺。** 这是最容易误解的一点。worker-thread 不等于安全沙箱。真正的安全边界由沙箱管。如果你让模型写的代码可能有害，必须配合沙箱和审批，不能指望"跑在 worker 里就没事"。

**只有 typescript 有已发布后端。** python 是已知值但没有已发布后端。想跑 python 程序，得等后端或自己实现。

**完成值必须无损 JSON。** 程序返回一个函数、一个循环引用对象、一个类的实例，都会因为过不了无损 JSON 边界而失败（`invalid-output`）。这把"程序能返回什么"限制在了可序列化数据。好处是结果能安全地跨边界传回；代价是复杂返回值得程序自己序列化。

**子调用过管线有开销。** Code Mode 里每个工具子调用都走完整的七层关卡（pre-execute、guards、approval、execute、post-execute、normalize、finalize）。这是为了不牺牲策略执行，但意味着批量子调用不像"直接在程序里调函数"那么快，每个都有策略开销。

**输出上限是硬失败。** logs 或 value 超过配置上限，整个运行 `output-limit` 失败，而不是截断。这对跑大量输出的程序要注意。

## 结论

`ctx.codeRuntime` 是执行模型所写程序的底层接缝：请求带一切（程序、绑定、中止信号），错误是结果字段不是异常，失败分类正交独立，绑定名当敌意输入，isolation 是诊断标签不是安全承诺。Code Mode 在它之上把工具暴露成 `tools` 绑定，让程序能用编程逻辑批量调工具，而每个子调用照样走完整的工具执行管线，拒绝作为绑定拒绝返回，不带额外上下文以保 call/result 邻接。

几个判断值得带走：程序失败永远走结果字段而非异常，和 shell 的 resolve-on-failure 同源；执行隔离不是安全边界，安全归沙箱；Code Mode 的子调用完整过管线，没有"代码里调工具就绕过审批"的后门；完成值必须无损 JSON，过不了就失败而不是糊弄。

这套设计让 agent 既拥有"写程序批量干活"的效率，又不牺牲任何一道策略关卡。底层接缝保持纯粹（只管执行），策略执行集中在管线，两者通过绑定命名空间这个接缝干净地接合。

## 延伸阅读

- [Code Runtime 官方文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/code-runtime.md)：本文主要依据，含运行请求、绑定、失败分类
- [Tool Execution Pipeline](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-execution-pipeline.md)：Code Mode 段，run_code 传输与子调用如何过管线
- [Code Mode foundation 笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-06-15-code-mode.md)：worker-thread provider 与 consumer 的设计
- [typed-return contract 笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-07-20-code-mode-typed-tool-returns.md)：工具子调用的类型化返回
- [defensive patterns](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/defensive-patterns.md)：正交失败分类的来源

上一篇：[LSP 接缝：让 agent 真正"懂"代码导航](./22-lsp-code-navigation.md)
下一篇：[Jobs 与 Workflow：后台任务与工作流编排](./24-jobs-and-workflow-ralph.md)
