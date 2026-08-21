# 测试体系与性能压测：怎么测 dsh 这个 agent harness

> `dsh` 的测试政策有一条反直觉的原则叫"我们是 DeepSeek，不要吝啬真 API 测试"，没有 key 的测试只证明管道通，有 key 的运行才证明 agent 真能干活；每层测试都有自己回答的问题，不能互相替代。
> 这一篇拆五层测试体系（外加一条 opt-in 的 Web 性能压测 lane）、with-key 策略、"验证世界不验证自述"原则、HMR 安全测试，以及为什么 mock 能让单测全绿但产品是坏的；后半段落到 `apps/web/tests/complex-history.perf.ts`，看性能压测为什么不做时间断言、只做结构断言。

## 五层测试

`dsh` 的测试分五层，每层回答不同的问题。

- Unit（`pnpm run test`）：vitest 跑包和示例的 `tests/**` 目录，加上仓库脚本 `scripts/**/*.spec.ts`，测试和被测代码放在一起。这一层覆盖边缘情况、错误路径、事件顺序、并发竞争、契约回归。每个 registry 还有一个 HMR 安全测试（销毁贡献 fiber，断言清理）。
- Coverage gate（`pnpm run test:coverage`）：门禁运行，`packages/*/*/src` 上 per-file 100%。一行没覆盖通常意味着那行是死代码，门禁正确地在标记它该删，而不是缺一个测试去补。行覆盖是必要的，但永远不够：它证明代码行跑过，不证明功能按发布版本工作。
- Real-API e2e（`pnpm run test:e2e`）：有 key 的测试打真实 provider API。DeepSeek 模型加上 provider 特定的 smoke（`EXA_API_KEY`、`PERPLEXITY_API_KEY` 等）。每个 suite 没有自己 key 时 self-skip。
- Snapshot（`pnpm run test:snapshot`）：无 key 的期望输出覆盖外部行为（传输契约和呈现），持久化日志钉住组装后的后端行为。ACP 启动真实的 automation-server 示例，回放一个录制的 session，diff 归一化的 JSON-RPC 加重新持久化的日志。headless 后端场景通过一个非导出的 JSONL 测试驱动启动显式示例组合。
- Web browser snapshot（`pnpm run test:web`）：Chromium 把回放的浏览器输出和 `apps/web/tests/snapshots/` 比较，这是 Linux PR 必须的门禁。CI 强制只读 `DSH_SNAPSHOT=replay`，不写期望输出；record/refresh 只在本地做，每个 diff 都要 review。

在这五条 CI lane 之外，还有一条 opt-in 的手动性能诊断 lane，这篇后半部分单拆。

## with-key 策略：不吝啬真 API 测试

这是整个测试政策里最反直觉的一条，原文用粗体写：

> We are DeepSeek. Do not ration real-API tests.

翻译过来：**我们是 DeepSeek，不要吝啬真 API 测试。**

逻辑很直接：没有 key 的测试只证明管道通，只有有 key 的运行才证明 agent 能对真实模型工作。所以 `dsh` 要求覆盖写文件的 prompt、多轮对话、工具使用、流中途取消。

最高价值的是 smoke 测试：启动真实示例，发一个 prompt，检查世界。它们抓的是"单测全绿但产品是坏的"这一类 bug，mock 抓不到。

每个 suite 没有 key 时 self-skip，这不是成本信号，是让无 key 的 CI 和无 key 的贡献者不被阻塞。每个示例都自带无 key 和有 key 两套 smoke。

## 用真实实现，不用 mock

`dsh` 的 mock 原则很克制：**只 mock 昂贵或不确定的边界（LLM adapter、网络、时钟），下游全部用真实实现。**

一个手写的替身只证明桥搬运了字节，不证明发布的工具按断言工作。桥的工具调用测试用脚本化的 mock 模型加真实的工具和执行器：`makeBridgeHarness({ withBash: true })` 插入 `dsh-bash-local` 和 `dsh-tool-bash`，然后跑 `echo`。

恢复测试按 step 分离 chunk 前后的失败，证明失败的 chunk 不产生 message 或工具副作用。覆盖耗尽、取消、策略组合、持久化、状态、wire 计数、传输关闭的 idle 超时、以及发布的 Loader 组合。

这条原则的深层含义是：mock 越少，测试越接近真实。一个 mock 模型加真实工具和真实执行器的测试，比一个 mock 模型加 mock 工具的测试能抓到多得多的 bug。代价是测试更慢、更依赖环境，但 `dsh` 选择用环境管理（CI runner、self-skip）来处理这个代价，而不是用更多 mock 来回避它。

## 验证世界，不验证自述

这条原则是区分好测试和坏测试的分界线。

一个 e2e 断言应该重新跑命令或重新从外部读文件。一个在 agent 自己输出上的关键词探针，会让一个作弊的 agent 通过。

正确做法的例子：

- 断言未触及的文件是字节一致的：不是检查 agent 说"我没改那个文件"，而是重新读那个文件和原始版本对比。
- 断言 agent 真的写了文件：不是检查 agent 说"我写了文件"，而是检查文件存在且内容正确。
- 断言命令真的执行了：不是检查 agent 说"我跑了命令"，而是检查命令的副作用。

e2e 测试拥有自己的资源：在测试里创建 harness，在 `afterEach` 里 dispose（即使在失败、重试、超时时）。共享 fixture 放在普通的 `tests/harness.ts` 里，不是另一个 `*.e2e.ts`（import 一个 spec 会重新注册它的 `describe` 并复制真实 API 调用）。

## 测真实入口路径

这条原则解决"测试覆盖了代码但没覆盖入口"的问题。

产品可见的插件要求一个非 unit 的 REAL 组合测试。手建的 `ctx.plugin(...)` suite 不够：要通过 Loader 和 app/process 启动 test-only 的 `cordis.yml`，只 mock 外部服务或不确定输入，断言模型可见的 request/log、持久化状态、或用户可见输出。

一个 guard 只有在回归真的让它失败时才 guard。对于一个没有 `inject` 的插件（bundle/composition 插件），一个 Loader smoke 在 default export 替换了必需的 named exports 时保持绿。解法是加一个显式的 `expect('default' in mod).toBe(false)` 加 `unwrapExports` 往返断言，然后证明它：引入回归，看红，还原。

"真实入口路径"意味着发布的 artifact：一个包的 `bin` 在普通 `node` 下跑构建后的 `lib/bin.js`，暴露 tsx 掩盖的失败（settle 竞争、模块解析、吞掉的加载失败）。built-artifact smoke（`packages/examples/*/tests/built-bin.e2e.ts` 等）必须保持绿，并断言一个真正缺失的配置以非零退出。

## 测试解析：源码平面

这条解决"测试加载了错误的模块副本"的问题。

每个 vitest config 把 vite-tsconfig-paths 指向 `tsconfig.base.json`。裸 workspace import 解析到 `src`，永远不通过 package `exports` 到构建后的 `lib/`。`lib/` 里的过期 artifact 会加载第二份模块 singleton，导致状态不一致。

构建 artifact 只被显式消费：`lib`-mode 子进程和 built smokes。

子进程启动模式分三种：

- CI 和有 build 的 test lane 通过共享的 dual-mode launcher 从构建后的 `lib/` 跑每个 example 或 Cordis-config 子进程，不要手写 `--import tsx`。
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

一个 ACP 场景（`text-turn`）钉住完整的 system-prompt/tool-schema 内容，其他 fixture 把它 tokenize，这样一个编辑只动一行。这是刻意的设计：一个 header 改动只影响一个 fixture，不需要更新几十个。

用 `pnpm run test:snapshot:record` 当模型 transcript 变了，用 `pnpm run test:snapshot:refresh` 当回放输入仍然有效。每个 JSONL 和期望输出 diff 都要 review。

## 每个注册表都有 HMR 安全测试

五层测试里提过一句：每个 registry 都有一个 HMR 安全测试，做法是销毁贡献 fiber、断言清理。这里说它为什么重要。

`dsh` 是全插件化的，注册是可逆副作用，HMR 安全是核心质量。如果 HMR 后旧实例的注册没清理，新实例和旧实例的注册会冲突。这个测试确保不会发生，它把"注册是可逆副作用"从口号变成 Cordis 注册模型的运行时保证。

## 第六条 lane：Web 性能压测

功能测试（e2e、snapshot）回答"行为对不对"，性能测试回答"扛不扛得住"。两个问题的失败模式不同，测试方式也不同。所以性能压测是一条独立的 opt-in lane，落在 `apps/web/tests/complex-history.perf.ts` 这个浏览器 benchmark 里。

它通过一个独立的 vitest config 运行，文件叫 `vitest.web.perf.config.ts`：以 `webConfig` 为基础，`include` 收窄成 `['apps/web/tests/**/*.perf.ts']`，打开 `disableConsoleIntercept`，把 hookTimeout 和 testTimeout 分别放宽到 3 分钟和 10 分钟。

几个关键配置选择揭示了它的定位：

- 独立 include：只跑 `.perf.ts` 文件，和 CI web gate 的 `.e2e.ts` / `.snapshot.ts` 分开。
- 不拦截 console：性能测试通过 `console.info` 打印测量结果，所以不禁用 console。
- 超时很长：性能测试要构造大量数据、等渲染稳定，跑得慢。
- 手动诊断：注释明确说，手动高基数诊断留在 CI web gate 之外。

这意味着性能测试不是 CI 门禁，是开发者手动运行的诊断工具。它告诉你"这个变更有没有让大场景变慢"，但不阻塞合并。

### 测什么：高基数场景

测试名称是"complex workspace and history"，构造的是极端数据量：

- 1000 个侧边栏会话（`SIDEBAR_SESSION_COUNT = 1000`）
- 500 轮的长历史会话（`LONG_HISTORY_TURNS = 500`）
- 每 10 轮一次工具调用，每次 10 个工具，总共 500 个工具调用
- 2100 行轨迹面板（`EXPECTED_TRAJECTORY_ROWS = 2100`）
- 默认历史窗口 24 轮（`DEFAULT_HISTORY_TURNS = 24`）

这不是典型的使用场景，这是压力测试的意图：如果渲染在 1000 个会话或 500 轮历史下不崩，那 20 个会话和 50 轮历史大概率也没问题。

构造方式是用合成的 session log fixture：程序化生成 session 事件（user/message、assistant/message、tool/call、tool/result、turn/start、turn/end、request/header），序列化成 JSONL，seed 到 Web scaffold 里。这样测试是完全确定性的，不依赖真实模型。

### 测量什么：Chromium 级别指标

测试通过 Playwright 的 CDP（Chrome DevTools Protocol）session 采集 Chromium 性能指标。每次操作前后各采一组，算 delta。

指标分三类：时间类，挂钟时间（`wallMs`）、浏览器 task 时间、JS 执行、布局、样式重算、DevTools 协议时间；增量类，DOM 节点变化、事件监听器变化、堆内存变化；存量类，总 DOM 节点数、总堆内存。一次操作花了多少时间在 JS、多少在布局、多少在样式重算，增加了多少 DOM 节点和堆内存，一目了然。

操作级别的测量覆盖：

- 启动到就绪时间、first contentful paint
- 侧边栏展开（1000 个会话）
- 内容搜索
- 打开长历史
- 冷轨迹渲染（首次渲染 2100 行）
- 折叠 turn
- 轨迹搜索
- 历史分页（load earlier）
- 热轨迹、热对话渲染（分页后再切回来）

### 不做时间断言：宿主速度不是正确性契约

这是整个性能测试最重要的设计决策，写在文件第一行注释里：

> It reports measurements without timing assertions because host speed is not a correctness contract.

翻译过来：**它报告测量值但不做时间断言，因为宿主速度不是正确性契约。**

什么意思？如果你写 `expect(measurement.wallMs).toBeLessThan(500)`，这个断言在你的快机器上过了，在 CI 的慢机器上可能挂，反过来也一样。时间断言把机器性能混进了正确性判断。

`dsh` 的做法是只做结构断言，回答"数量对不对"：

- `expect(sidebar.value).toBe(SIDEBAR_SESSION_COUNT + 2)`：侧边栏展开了全部 1000 个会话加两个结构性条目。
- `expect(opened.value).toBe(DEFAULT_HISTORY_TURNS)`：打开长历史时初始渲染了 24 轮。
- `expect(coldTrajectory.value).toBe(EXPECTED_TRAJECTORY_ROWS)`：冷轨迹渲染了全部 2100 行。
- `expect(warmConversation.value).toBe(LONG_HISTORY_TURNS)`：分页加载后对话窗口有全部 500 轮。

时间数据通过 `console.info` 打印为 JSON：每条结果以 `WEB_PERF_RESULT` 前缀开头，后接两空格缩进的对象。开发者手动跑这个测试，看输出的 JSON，人肉判断"这次比上次慢了"或"堆内存涨了"。

### 防止基数缩水

"基数缩水"是性能优化里一个隐蔽的 bug 类：你做了一个"优化"让渲染变快了，但优化方式是少渲染了一些东西。功能测试可能不抓这种 bug（可见的行为没变），但用户的体验变了（侧边栏少了几百个会话，或者轨迹少了行）。结构断言防的就是它，靠两个机制。

一是精确的行数断言。不是 `expect(count).toBeGreaterThan(0)`，而是 `expect(count).toBe(EXPECTED_TRAJECTORY_ROWS)` 这样的精确值。

二是 `stableCount` 辅助函数。它不读一次 count 就断言，而是循环读：每 50 毫秒读一次当前计数，连续 4 次读到相同且满足判断函数的值才返回，默认 60 秒超时。这防止异步渲染导致的暂时性计数误判。

### soak 测试：持续对话的保留状态

性能测试不只是"打开大历史"。它还有一个 soak 场景：在已有 500 轮历史的基础上，继续发 100 轮对话（`SOAK_TURNS = 100`），每 10 轮检查一次保留的浏览器状态。

每次检查采集 `retainedBrowserState`，四个字段：DOM 元素数、DOM 节点数、事件监听器数、堆内存 MB。这些数据回答的问题是：随着对话轮数增加，浏览器保留了什么。如果每轮对话都增加 10 个 DOM 元素和 5MB 堆内存，100 轮后就是 1000 个元素和 500MB，这是内存泄漏的信号。

soak 测试也测量每轮的性能指标（click 到 user echo 的时间、click 到 first chunk 的时间、first chunk 到 settled 的时间、mutation batches/records），并按 10 轮窗口汇总平均值和 p95。这些数据回答另一个问题：长对话是否变得越来越慢。如果第 1 轮和第 100 轮的响应时间差很多，说明有什么东西在积累。

### 流式渲染的探针

测试里有两个精细的探针，测量流式渲染的细节。

Mutation Probe 在对话内容区域挂一个 MutationObserver，统计流式输出期间的 mutation batches 和 records 数。这告诉你浏览器为了渲染流式输出做了多少次 DOM 变更，batches 越少越好（合并的变更更高效）。

User Render Probe 测量从用户点击发送到消息出现在 DOM 再到 paint 的时间，三个时间点：`sendAt`（点击发送）、`domAt`（消息文本出现在 DOM）、`paintAt`（实际被 paint）。三个 delta：`sendToDomMs`、`domToPaintMs`、`sendToPaintMs`（端到端）。探针还验证点击是 trusted 的（`event.isTrusted`），确保不是合成事件。

这个探针在 soak 测试后运行（`measurePostSoakUserRender`），回答的问题是：600 轮对话之后，发送一条消息的端到端延迟有没有退化。

### 运行方式

性能测试是 opt-in 的，不在 CI web gate 里。运行分两步：先 `pnpm run build:web` 构建（性能测试消费构建后的 CSS），再 `pnpm exec vitest run --config vitest.web.perf.config.ts apps/web/tests/complex-history.perf.ts` 跑测试。

测试只在 replay 模式下运行（`webSnapshotMode() === 'record'` 时抛异常）。这保证了确定性：同一个 replay override 每次产出同样的模型响应，测量才有可比性。

输出是一串 `WEB_PERF_RESULT` JSON，开发者自己对比历史结果判断趋势。

## 权衡与局限

不做时间断言是刻意的，这意味着性能退化不会被 CI 自动抓到，要靠人看 JSON 发现。这是"宿主速度不是正确性契约"的代价：放弃了自动化性能门禁，换来跨机器的可比性。

只测 Web 客户端。Host 侧（Node.js）的性能没有等价的 benchmark，agent loop 的性能、模型请求的延迟、工具执行的耗时都没有专门的性能测试。coverage gate 保证代码行跑过，但不保证跑得快。

只测高基数场景。典型使用场景（10 个会话、20 轮对话）没有性能测试，假设是"极端场景扛得住，典型场景没问题"。这个假设大部分时候成立，但不总是。

Chromium 专属。用 CDP 采集指标意味着只在 Chromium 上跑，Firefox 和 Safari 的性能特征不同，这个测试不覆盖。

soak 不是真压测。100 轮对话是持续使用，不是并发压力，真正的压测（多用户、高并发请求）不在范围。

## 结论

这套测试体系的骨架是分层：unit 管边缘情况，coverage gate 管行覆盖，real-API e2e 管真模型，snapshot 管组装后的转录，web snapshot 管浏览器呈现，性能 lane 管高基数场景。贯穿的原则有三条：不吝啬真 API 测试，验证世界不验证自述，mock 只留在昂贵或不确定的边界。性能压测不做时间断言，因为宿主速度不是正确性契约；结构断言保住基数不缩水，时间数据留给开发者看趋势。

## 延伸阅读

- [Testing Policy 全文](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.md)
- [Development Guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md)
- [Defensive Patterns（测试侧对应模式）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/defensive-patterns.md)
- [Postmortem 0001: ACP Default Export](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/postmortem/0001-acp-default-export-drops-inject.md)
- [Real-API e2e Agent Note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/testing/2026-06-19-real-api-e2e-ci.md)
- [Web Performance Test 源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/web/tests/complex-history.perf.ts)
- [vitest.web.perf.config.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/vitest.web.perf.config.ts)
- [Web GUI Browser E2E Lane Agent Note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/testing/2026-07-24-web-gui-browser-e2e-lane.md)

上一篇：[错误处理与容错哲学：dsh 这个 harness 怎么不崩](./42-error-handling-fault-tolerance-philosophy.md)
下一篇：[文档即代码：dsh 用脚本生成图、目录和校验门禁](./45-docs-as-code-autogen-graphs-catalogs.md)
