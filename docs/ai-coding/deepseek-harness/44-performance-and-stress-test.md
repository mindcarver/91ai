# 性能与压测：Web 客户端在高基数下怎么扛

> 如果你只能从这篇带走一句话，带走这句：`dsh` 的 Web 性能测试不做时间断言，因为"宿主速度不是正确性契约"，它做的是结构断言加上指标报告，确保 1000 个会话的侧边栏、500 轮的长历史、2100 行的轨迹面板不会悄悄缩水，同时把 Chromium 级别的耗时数据打印出来供人工判断。
> 这一篇拆 `apps/web/tests/complex-history.perf.ts` 这个 opt-in 浏览器 benchmark，看它测什么场景、量什么指标、为什么用这个方式。

## 为什么 Web 性能测试和功能测试分开

功能测试（e2e、snapshot）回答"行为对不对"。性能测试回答"扛不扛得住"。两个问题的失败模式不同，测试方式也不同。

`dsh` 的 Web 性能测试通过一个独立的 vitest config 运行：

```typescript
// vitest.web.perf.config.ts
export default defineConfig({
  ...webConfig,
  test: {
    ...webConfig.test,
    include: ['apps/web/tests/**/*.perf.ts'],
    disableConsoleIntercept: true,
    hookTimeout: 180_000,
    testTimeout: 600_000,
  },
})
```

几个关键配置选择揭示了它的定位：

- **独立 include**：只跑 `.perf.ts` 文件，和 CI web gate 的 `.e2e.ts`/`.snapshot.ts` 分开。
- **disableConsoleIntercept**：不禁用 console，因为性能测试通过 `console.info` 打印测量结果。
- **超时很长**：hookTimeout 3 分钟，testTimeout 10 分钟。性能测试跑得慢，因为要构造大量数据、等渲染稳定。
- **手动诊断**：注释明确说"手动高基数诊断留在 CI web gate 之外"。

这意味着性能测试不是 CI 门禁，是开发者手动运行的诊断工具。它告诉你"这个变更有没有让大场景变慢"，但不阻塞合并。

## 测什么：高基数场景

测试文件叫 `complex-history.perf.ts`，测试名称是"complex workspace and history"。它构造的是极端数据量：

- **1000 个侧边栏会话**：`SIDEBAR_SESSION_COUNT = 1000`
- **500 轮的长历史会话**：`LONG_HISTORY_TURNS = 500`
- **每 10 轮一次工具调用，每次 10 个工具**：总共 500 个工具调用
- **2100 行轨迹面板**：`EXPECTED_TRAJECTORY_ROWS = 2100`
- **默认历史窗口 24 轮**：`DEFAULT_HISTORY_TURNS = 24`

这不是典型的使用场景。这是压力测试的意图：如果你的渲染在 1000 个会话或 500 轮历史下不崩，那 20 个会话和 50 轮历史大概率也没问题。

构造方式是用合成的 session log fixture：程序化生成 session 事件（user/message、assistant/message、tool/call、tool/result、turn/start、turn/end、request/header），序列化成 JSONL，seed 到 Web scaffold 里。这样测试是完全确定性的，不依赖真实模型。

## 测量什么：Chromium 级别指标

测试通过 Playwright 的 CDP（Chrome DevTools Protocol）session 采集 Chromium 性能指标。每次操作前后采集一组指标，算 delta。

采集的指标：

```typescript
interface Measurement {
  wallMs: number        // 挂钟时间
  taskMs: number        // 浏览器 task 时间
  scriptMs: number      // JS 执行时间
  layoutMs: number      // 布局时间
  recalcStyleMs: number // 样式重算时间
  devtoolsMs: number    // DevTools 协议时间
  nodesDelta: number    // DOM 节点变化
  listenersDelta: number // 事件监听器变化
  heapDeltaMb: number   // 堆内存变化
  totalNodes: number    // 总 DOM 节点数
  heapMb: number        // 总堆内存
}
```

这些指标让你看到一次操作（比如展开 1000 个会话的侧边栏）在浏览器里花了多少时间在 JS、多少在布局、多少在样式重算，以及它增加了多少 DOM 节点和堆内存。

操作级别的测量覆盖：
- 启动到就绪时间、first contentful paint
- 侧边栏展开（1000 个会话）
- 内容搜索
- 打开长历史
- 冷轨迹渲染（首次渲染 2100 行）
- 折叠 turn
- 轨迹搜索
- 历史分页（load earlier）
- 热轨迹/热对话渲染（分页后再切回来）

## 不做时间断言：宿主速度不是正确性契约

这是整个性能测试最重要的设计决策，写在文件第一行注释里：

> It reports measurements without timing assertions because host speed is not a correctness contract.

翻译过来：**它报告测量值但不做时间断言，因为宿主速度不是正确性契约。**

什么意思？如果你写 `expect(measurement.wallMs).toBeLessThan(500)`，这个断言在你的快机器上过了，在 CI 的慢机器上可能挂，反过来也一样。时间断言把机器性能混进了正确性判断。

`dsh` 的做法是：**只做结构断言**。结构断言回答"数量对不对"：

- `expect(sidebar.value).toBe(SIDEBAR_SESSION_COUNT + 2)`：侧边栏展开了全部 1000 个会话加两个结构性条目。
- `expect(opened.value).toBe(DEFAULT_HISTORY_TURNS)`：打开长历史时初始渲染了 24 轮。
- `expect(coldTrajectory.value).toBe(EXPECTED_TRAJECTORY_ROWS)`：冷轨迹渲染了全部 2100 行。
- `expect(warmConversation.value).toBe(LONG_HISTORY_TURNS)`：分页加载后对话窗口有全部 500 轮。

这些断言防止的是"基数缩水"：如果一次重构让虚拟化列表少渲染了行，或者让分页少加载了历史，结构断言会失败。但它们不断言"渲染有多快"。

时间数据通过 `console.info` 打印为 JSON：

```javascript
console.info(`WEB_PERF_RESULT ${JSON.stringify({ ... }, null, 2)}`)
```

开发者手动跑这个测试，看输出的 JSON，人肉判断"这次比上次慢了"或"堆内存涨了"。

## 结构断言：防止基数缩水

"基数缩水"是性能优化里一个隐蔽的 bug 类。你做了一个"优化"，让渲染变快了，但优化方式是少渲染了一些东西。功能测试可能不抓这种 bug（因为可见的行为没变），但用户的体验变了（侧边栏少了几百个会话，或者轨迹少了行）。

`dsh` 用两个机制防止它：

1. **精确的行数断言**。不是 `expect(count).toBeGreaterThan(0)`，而是 `expect(count).toBe(EXPECTED_TRAJECTORY_ROWS)` 或 `expect(count).toBe(SIDEBAR_SESSION_COUNT + 2)`。

2. **stableCount 辅助函数**。它不是读一次 count 就断言，而是连续读多次直到稳定（4 次相同读数）。这防止异步渲染导致的暂时性计数误判。

```typescript
async function stableCount(locator, accepts, timeoutMs = 60_000) {
  let stableReads = 0
  while (performance.now() < deadline) {
    const count = await locator.count()
    stableReads = accepts(count) && count === previous ? stableReads + 1 : 0
    if (stableReads >= 4) return count
    previous = count
    await new Promise(resolve => setTimeout(resolve, 50))
  }
}
```

## soak 测试：持续对话的保留状态

性能测试不只是"打开大历史"。它还有一个 soak 场景：在已有 500 轮历史的基础上，继续发 100 轮对话（`SOAK_TURNS = 100`），每 10 轮检查一次保留的浏览器状态。

每次检查采集 `retainedBrowserState`：

```typescript
interface RetainedBrowserState {
  domElements: number   // DOM 元素数
  nodes: number         // DOM 节点数
  listeners: number     // 事件监听器数
  heapMb: number        // 堆内存 MB
}
```

这些数据告诉你：**随着对话轮数增加，浏览器保留了什么。** 如果每轮对话都增加 10 个 DOM 元素和 5MB 堆内存，100 轮后就是 1000 个元素和 500MB。这是内存泄漏的信号。

soak 测试也测量每轮的性能指标（click 到 user echo 的时间、click 到 first chunk 的时间、first chunk 到 settled 的时间、mutation batches/records），并按 10 轮窗口汇总平均值和 p95。

这些数据回答的问题是：**长对话是否变得越来越慢？** 如果第 1 轮和第 100 轮的响应时间差很多，说明有什么东西在积累。

## 流式渲染的探针

测试里有两个精细的探针，测量流式渲染的细节。

**Mutation Probe**：在对话内容区域挂一个 MutationObserver，统计流式输出期间的 mutation batches 和 records 数。这告诉你浏览器为了渲染流式输出做了多少次 DOM 变更。batches 越少越好（合并的变更更高效）。

**User Render Probe**：测量从用户点击发送到消息出现在 DOM 再到 paint 的时间。三个时间点：

- `sendAt`：点击发送的时刻
- `domAt`：消息文本出现在 DOM 的时刻
- `paintAt`：消息实际被 paint 的时刻

三个 delta：`sendToDomMs`（发送到 DOM 插入）、`domToPaintMs`（DOM 插入到 paint）、`sendToPaintMs`（端到端）。这个探针还验证点击是 trusted 的（`event.isTrusted`），确保不是合成事件。

这个探针在 soak 测试后运行（`measurePostSoakUserRender`），回答的问题是：**在 600 轮对话之后，发送一条消息的端到端延迟是否退化？**

## 运行方式

性能测试是 opt-in 的，不在 CI web gate 里。运行方式：

```sh
# 需要先 build（因为性能测试消费构建后的 CSS）
pnpm run build:web

# 运行性能测试
pnpm exec vitest run --config vitest.web.perf.config.ts apps/web/tests/complex-history.perf.ts
```

测试只在 replay 模式下运行（`webSnapshotMode() === 'record'` 时抛异常）。这保证了确定性：同一个 replay override 每次产出同样的模型响应，测量才有可比性。

输出是一串 `WEB_PERF_RESULT` JSON，开发者自己对比历史结果判断趋势。

## 权衡与局限

**不做时间断言是刻意的。** 这意味着性能退化不会被 CI 自动抓到。退化要靠人看 JSON 发现。这是"宿主速度不是正确性契约"的代价：你放弃了自动化性能门禁，换来了跨机器的可比性。

**只测 Web 客户端。** Host 侧（Node.js）的性能没有等价的 benchmark。agent loop 的性能、模型请求的延迟、工具执行的耗时，这些没有专门的性能测试。coverage gate 保证代码行跑过，但不保证跑得快。

**只测高基数场景。** 典型使用场景（10 个会话、20 轮对话）没有性能测试。假设是"如果极端场景扛得住，典型场景没问题"。这个假设大部分时候成立，但不总是。

**Chromium 专属。** 用 CDP 采集指标意味着只在 Chromium 上跑。Firefox 和 Safari 的性能特征不同，这个测试不覆盖。

**soak 不是真压测。** 100 轮对话是持续使用，不是并发压力。真正的压测（多用户、高并发请求）不在这个测试范围。

## 延伸阅读

- [Web Performance Test 源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/web/tests/complex-history.perf.ts)
- [vitest.web.perf.config.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/vitest.web.perf.config.ts)
- [Testing Policy](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.md)
- [Web GUI Browser E2E Lane Agent Note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/testing/2026-07-24-web-gui-browser-e2e-lane.md)

上一篇：[测试体系：怎么测一个 agent harness](./43-testing-how-to-test-an-agent-harness.md)
下一篇：[文档即代码：用脚本自动生成图、目录和校验](./45-docs-as-code-autogen-graphs-catalogs.md)
