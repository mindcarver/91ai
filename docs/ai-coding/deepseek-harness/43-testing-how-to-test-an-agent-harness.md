# 测试体系：怎么测一个 agent harness

> 如果你只能从这篇带走一句话，带走这句：`dsh` 的测试政策有一条反直觉的原则叫"我们是 DeepSeek，不要吝啬真 API 测试"，没有 key 的测试只证明管道通，有 key 的运行才证明 agent 真能干活；每层测试都有自己回答的问题，不能互相替代。
> 这一篇拆五层测试体系、with-key 策略、"验证世界不验证自述"原则、HMR 安全测试，以及为什么 mock 能让单测全绿但产品是坏的。

## 五层测试

`dsh` 的测试分五层，每层回答不同的问题。

**Unit**（`pnpm run test`）：vitest 跑包和示例的 `tests/**` 目录，加上仓库脚本 `scripts/**/*.spec.ts`。测试和它测试的代码放在一起。这一层覆盖边缘情况、错误路径、事件顺序、并发竞争、契约回归。每个 registry 都有一个 HMR 安全测试（销毁贡献 fiber，断言清理）。

**Coverage gate**（`pnpm run test:coverage`）：门禁运行，`packages/*/*/src` 上 per-file 100%。一行没覆盖通常意味着那行是死代码，门禁正确地在标记它该删，而不是缺一个测试去补。行覆盖是必要的，但永远不够：它证明代码行跑过，不证明功能按发布版本工作。

**Real-API e2e**（`pnpm run test:e2e`）：有 key 的测试打真实 provider API。DeepSeek 模型加上 provider 特定的 smoke（`EXA_API_KEY`、`PERPLEXITY_API_KEY` 等）。每个 suite 没有自己 key 时 self-skip，所以无 key 的 CI 保持绿。

**Snapshot**（`pnpm run test:snapshot`）：无 key 的期望输出覆盖外部行为（传输契约和呈现），持久化日志钉住组装后的后端行为。ACP 启动真实的 automation-server 示例，回放一个录制的 session，diff 归一化的 JSON-RPC 加重新持久化的日志。headless 后端场景通过一个非导出的 JSONL 测试驱动启动显式示例组合。

**Web browser snapshot**（`pnpm run test:web`）：Chromium 把回放的浏览器输出和 `apps/web/tests/snapshots/` 比较。这是 Linux PR 必须的门禁。CI 强制只读 `DSH_SNAPSHOT=replay`，不写期望输出；record/refresh 只在本地做，每个 diff 都要 review。

## with-key 策略：不吝啬真 API 测试

这是整个测试政策里最反直觉的一条，原文用粗体写：

> We are DeepSeek. Do not ration real-API tests.

翻译过来：**我们是 DeepSeek，不要吝啬真 API 测试。**

逻辑很直接：没有 key 的测试只证明管道通，只有有 key 的运行才证明 agent 能对真实模型工作。所以 `dsh` 要求覆盖写文件的 prompt、多轮对话、工具使用、流中途取消。

最高价值的是 **smoke 测试**：启动真实示例，发一个 prompt，检查世界。它们抓的是"单测全绿但产品是坏的"这一类 bug，mock 抓不到。

每个 suite 没有 key 时 self-skip，这不是成本信号，是让无 key 的 CI 和无 key 的贡献者不被阻塞。每个示例都自带无 key 和有 key 两套 smoke。

## 用真实实现，不用 mock

`dsh` 的 mock 原则很克制：**只 mock 昂贵或不确定的边界（LLM adapter、网络、时钟），下游全部用真实实现。**

一个手写的替身只证明桥搬运了字节，不证明发布的工具按断言工作。桥的工具调用测试用脚本化的 mock 模型加真实的工具和执行器：`makeBridgeHarness({ withBash: true })` 插入 `dsh-bash-local` 和 `dsh-tool-bash`，然后跑 `echo`。

恢复测试按 step 分离 chunk 前后的失败，证明失败的 chunk 不产生 message 或工具副作用。覆盖耗尽、取消、策略组合、持久化、状态、wire 计数、传输关闭的 idle 超时、以及发布的 Loader 组合。

这条原则的深层含义是：**mock 越少，测试越接近真实。** 一个 mock 模型加真实工具和真实执行器的测试，比一个 mock 模型加 mock 工具的测试能抓到多得多的 bug。代价是测试更慢、更依赖环境，但 `dsh` 选择用环境管理（CI runner、self-skip）来处理这个代价，而不是用更多 mock 来回避它。

## 验证世界，不验证自述

这条原则是区分好测试和坏测试的分界线。

一个 e2e 断言应该**重新跑命令或重新从外部读文件**。一个在 agent 自己输出上的关键词探针会让一个作弊的 agent 通过。

正确做法的例子：
- 断言未触及的文件是字节一致的。不是检查 agent 说"我没改那个文件"，而是重新读那个文件和原始版本对比。
- 断言 agent 真的写了文件，不是检查 agent 说"我写了文件"，而是检查文件存在且内容正确。
- 断言命令真的执行了，不是检查 agent 说"我跑了命令"，而是检查命令的副作用。

e2e 测试拥有自己的资源：在测试里创建 harness，在 `afterEach` 里 dispose（即使在失败/重试/超时时）。共享 fixture 放在普通的 `tests/harness.ts` 里，不是另一个 `*.e2e.ts`（import 一个 spec 会重新注册它的 `describe` 并复制真实 API 调用）。

## 测真实入口路径

这条原则解决"测试覆盖了代码但没覆盖入口"的问题。

产品可见的插件要求一个非 unit 的 REAL 组合测试。手建的 `ctx.plugin(...)` suite 不够：要通过 Loader 和 app/process 启动 test-only 的 `cordis.yml`，只 mock 外部服务或不确定输入，断言模型可见的 request/log、持久化状态、或用户可见输出。

一个 guard 只有在回归真的让它失败时才 guard。对于一个没有 `inject` 的插件（bundle/composition 插件），一个 Loader smoke 在 default export 替换了必需的 named exports 时保持绿。解法是加一个显式的 `expect('default' in mod).toBe(false)` 加 `unwrapExports` 往返断言，然后**证明它**：引入回归，看红，还原。

"真实入口路径"意味着发布的 artifact：一个包的 `bin` 在普通 `node` 下跑构建后的 `lib/bin.js`，暴露 tsx 掩盖的失败（settle 竞争、模块解析、吞掉的加载失败）。built-artifact smoke（`packages/examples/*/tests/built-bin.e2e.ts` 等）必须保持绿，并断言一个真正缺失的配置以非零退出。

## 测试解析：源码平面

这条解决"测试加载了错误的模块副本"的问题。

每个 vitest config 把 vite-tsconfig-paths 指向 `tsconfig.base.json`。裸 workspace import 解析到 `src`，**永远不**通过 package `exports` 到构建后的 `lib/`。`lib/` 里的过期 artifact 会加载第二份模块 singleton，导致状态不一致。

构建 artifact 只被显式消费：`lib`-mode 子进程和 built smokes。

子进程启动模式分三种：
- CI 和有 build 的 test lane 通过共享的 dual-mode launcher 从构建后的 `lib/` 跑每个 example 或 Cordis-config 子进程。不要手写 `--import tsx`。
- 不加载 Cordis 的协议和 OS fixture 用可擦除的 `.ts` 直接用 Node 跑，不用 tsx 或 root paths map。
- 只有测试主题是源码路径解析时才选 `src`，在测试里声明这个契约。

## 快照测试什么时候必须

每个非平凡的模型、协议或人类可见的变更，在同一个 PR 里通过 runnable example 的 snapshot suite 加或更新一个无 key 场景。

包测试、e2e 断言、mock/test-only 组合、PR 理由都不替代组装后的 transcript。需要时扩展 harness。

不同 surface 的快照归属：
- ACP automation 场景用 `examples/<name>/tests/snapshots/`
- headless 后端场景用 `examples/headless-agent` 的内部 canonical-event JSONL 快照和回放 fixture
- 交互终端旅程用 `apps/cli/tests/snapshots/` 下的 JSONL 驱动场景
- 浏览器渲染的 Web GUI 旅程用 `apps/web/tests/snapshots/`

一个 ACP 场景（`text-turn`）钉住完整的 system-prompt/tool-schema 内容。其他 fixture 把它 tokenize，这样一个编辑只动一行。这是刻意的设计：一个 header 改动只影响一个 fixture，不需要更新几十个。

用 `pnpm run test:snapshot:record` 当模型 transcript 变了，用 `pnpm run test:snapshot:refresh` 当回放输入仍然有效。每个 JSONL 和期望输出 diff 都要 review。

## 每个注册表都有 HMR 安全测试

因为 `dsh` 是全插件化的，注册是可逆副作用，HMR 安全是核心质量。

每个 registry 都有一个 HMR 安全测试：销毁贡献 fiber，断言清理。这验证了"注册是可逆副作用"不只是口号，而是运行时保证。

如果 HMR 后旧实例的注册没清理，新实例和旧实例的注册会冲突。这个测试确保不会发生。它覆盖了 Cordis 注册模型的核心承诺。

## 延伸阅读

- [Testing Policy 全文](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.md)
- [Development Guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md)
- [Defensive Patterns（测试侧对应模式）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/defensive-patterns.md)
- [Postmortem 0001: ACP Default Export](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/postmortem/0001-acp-default-export-drops-inject.md)
- [Real-API e2e Agent Note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/testing/2026-06-19-real-api-e2e-ci.md)

上一篇：[错误处理与容错哲学：一个 agent harness 怎么不崩](./42-error-handling-fault-tolerance-philosophy.md)
下一篇：[性能与压测：Web 客户端在高基数下怎么扛](./44-performance-and-stress-test.md)
