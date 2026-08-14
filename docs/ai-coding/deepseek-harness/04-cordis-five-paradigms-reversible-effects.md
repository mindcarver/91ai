# Cordis 五大范式：为什么"注册即可逆副作用"是灵魂

> 如果这一篇你只能带走一句话，带走这句：Cordis 的五条设计范式不是平级的五件事，前四条都是"可被设计出来"的常见模式，只有第五条"注册即可逆副作用"把前四条从静态声明变成了运行时可热替换的活物，所以它是灵魂。
> 这一篇把 Cordis 的五条范式逐条拆开，每一条说清它解决什么、长什么样、和 DI 容器或 VSCode 插件这类"看起来也插件化"的方案差在哪。论文那套 effect/coeffect 理论是上一篇的事，这里只讲工程上每条范式的具体长相。

## 先看全貌：五件事是一个整体

上一篇把 Cordis 的理论压成了两个维度：时间可组合性（能干净拆除）和空间可组合性（能自由拼接）。这两个维度落到 API 上，Cordis 文档归纳成五条设计范式：

1. **插件是实现了 Service 的对象**。
2. **context 是一个服务仓库**。
3. **用 `inject` 声明依赖**。
4. **用类型化事件通信**。
5. **注册是可逆副作用**。

前四条单独拎出来，业界都不陌生：插件对象、服务定位器、依赖声明、事件总线，这些模式在各种框架里反复出现过。Cordis 不是靠这四条创新的，它是靠第五条把它们拧成一股绳。

理解这一点很重要：**前四条是"形状"，第五条是"地基"。** 没有 fifth，前四条只是又一套 DI 容器；有了 fifth，前四条每一条都获得了运行时可撤销、可热替换的能力。下面逐条拆，最后回到第五条讲它凭什么是灵魂。

## 范式一：插件是实现了 Service 的对象

Cordis 的插件有三种合法形态，从最轻到最重：

```typescript
import { Service, type Context } from '@deepseek-ai/cordis'

// 形态一：函数插件，最常见
export function apply(ctx: Context) {
  // 在 ctx 上注册你想贡献的一切
}

// 形态二：对象插件，带一个 apply 方法
export const objectPlugin = {
  name: 'object-plugin',
  apply(ctx: Context) {},
}

// 形态三：类插件，继承 Service，要暴露能力给别人用时用它
export class MyService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myService')
  }
}
```

三种形态背后是同一个机制：Cordis 加载一个插件时，给它一个 `ctx`（context），插件在 `apply(ctx)` 里声明自己贡献什么。函数形态够用时就用函数，只有当你需要把一个能力作为服务暴露给别的插件时，才升级到 `Service` 子类形态。

和 VSCode 插件对比一下。VSCode 的扩展也是"入口函数 + context"模型：`activate(context: ExtensionContext)`，插件在 activate 里注册命令、视图、监听器。形态上很像。差异在两点：一是 VSCode 扩展的绝大多数贡献是写在 `package.json` 的 `contributes` 字段里、静态声明的，不是在 activate 里程序化注册的；二是 VSCode 没有把这三种形态统一成一个"`Service` 实现"的概念，扩展和服务是两套东西。Cordis 把"插件"和"服务"统一了：一个服务就是一个插件，一个插件可以是一个服务。

## 范式二：context 是一个服务仓库

插件怎么找到彼此提供的能力？靠 context。

一个服务在被创建时，用一个稳定的 key 把自己注册到 context 上。DeepSeek Harness 里，`ctx.tools`（工具注册表）、`ctx.llm`（模型适配）、`ctx.agents`（agent 注册表）都是这么注册上去的。消费者按 key 取用，不 import 具体实现：

```typescript
import { Service, type Context } from '@deepseek-ai/cordis'

// 这段 declare module 是 TypeScript 声明合并，只影响类型，不生成代码
declare module '@deepseek-ai/cordis' {
  interface Context {
    greeter: GreeterService
  }
}

export class GreeterService extends Service {
  constructor(ctx: Context) {
    // 第二个参数 'greeter' 是注册的 key
    super(ctx, 'greeter')
  }
  greet(who: string) {
    return `Hello, ${who}!`
  }
}
```

`super(ctx, 'greeter')` 这一行做了两件事：运行时把实例挂到 context 上（之后任何插件都能 `ctx.greeter` 访问），类型层面靠上面那段 `declare module` 让 `ctx.greeter` 在编译期就能过类型检查。这段声明合并不产生代码，删掉它服务照样能在运行时工作，只是消费者失去类型提示。

这一条的本质是**服务定位器模式**：能力按名字注册，按名字查找，而不是按具体实现 import。好处是配置层可以决定挂哪个 provider，消费者代码一行都不用改。DeepSeek Harness 能让"换一个模型 provider 不用改业务代码"，根就在这里。

服务名是一个**扁平的全局命名空间**。官方占用了 `tools`、`llm`、`agents`、`fs`、`shell` 这些短名字，自己写的服务得加前缀避免撞名。这也是为什么 Cordis 文档建议第三方插件的服务名带命名空间。

## 范式三：用 inject 声明依赖，让加载顺序消失

这是空间可组合性在工程上的化身，也是 Cordis 和传统 DI 容器差别最大的一条。

一个需要 `greeter` 服务的插件，这么写：

```typescript
import type { Context } from '@deepseek-ai/cordis'

export const name = 'consumer'
export const inject = ['greeter']

export function apply(ctx: Context) {
  // 进到这里时，ctx.greeter 保证已经就位
  console.log(ctx.greeter.greet('world'))
}
```

`inject` 字段声明这个插件需要哪些服务。Cordis 的承诺是：**这些服务没全部就位之前，插件一直停在 PENDING 状态，apply 不会执行。** 一旦 `greeter` 上线，Cordis 才激活消费者。

这条带来的直接后果是：**`cordis.yml` 里插件写的先后顺序不影响结果。** 官方教程里专门演示了这一点：把 provider 和 consumer 两行对调，输出完全一样；把 provider 那行整个删掉，consumer 不会崩溃，只会一直 PENDING，默默不输出（也不占着 Node 事件循环，进程会干净退出）。

到这里传统 DI 容器（Spring、NestJS、.NET 的 DI）也做得到：声明依赖、容器按拓扑序解析、构造时注入。Cordis 多出来的、也是它真正领先的地方，是**依赖在加载之后还在被追踪**。教程原话：如果一个被依赖的服务在运行时消失了（provider 被卸载或热替换），所有 inject 它的插件会被连带卸载，等这个服务以新实现回来时再重新加载。

这就是上一篇讲的"反应式协副作用"（Reactive Coeffects）的工程含义：依赖不是启动时匹配一次就完事，而是运行时持续维护。传统 DI 是一张静态依赖图，启动时解析一次；Cordis 是一张会随 provider 增删而实时重连的动态图。所以 DeepSeek Harness 能做到"换掉 shell provider，所有注入 shell 的插件自动对着新实现重启"，这套动态性传统 DI 给不了。

可选依赖用 `ctx.get('greeter')` 在用的时候探一下，返回 undefined 就是没有，插件照常跑。

## 范式四：用类型化事件通信，插件不直接互相调用

服务适合"直接调一个能力"（`ctx.tools.register(...)`）。但有些交互是单向广播或需要被多个插件拦截，这时候用事件。

事件也走声明合并，和服务是孪生机制：

```typescript
declare module '@deepseek-ai/cordis' {
  interface Events {
    'stats/report'(name: string, count: number): void
  }
}

// 广播
this.ctx.emit('stats/report', name, next)

// 监听
ctx.on('stats/report', (name, count) => {
  console.log(`[stats] ${name} -> ${count}`)
})
```

`interface Events` 的合并声明了事件名和监听器签名，于是 `ctx.emit` 和 `ctx.on` 都是类型安全的。事件名用 `namespace/action` 的写法（如 `agent/request`、`tools/pre-execute`），在扁平的事件命名空间里保持可读。

事件不止 `emit` 一种派发方式。Cordis 提供了好几种派发模式，按"监听器能不能返回值、能不能并发、能不能短路彼此"来区分。其中最关键的是 **waterfall**（瀑布流），它是 around 中间件语义：每个监听器收到参数和一个 `next()` 延续函数，可以改写 `next()` 的返回值，也可以不调 `next()` 直接返回，把整条链短路掉（Cordis 把这叫 veto，否决）。

DeepSeek Harness 把"可以被多个协作插件拦截或作答"的决策都用 waterfall：`agent/request` 让插件能改写发给模型的请求，`approval/request` 让一个策略插件能代替用户作答。waterfall 的纪律是铁的：**只观察或注解的监听器必须调 `next()`，不调就是故意短路。** 一个忘了写 `next()` 的日志监听器，会静默吞掉所有人的默认行为。

派发模式的具体机制（各模式怎么短路、怎么并发）是一整套单独的手艺，这里不展开。这一条你需要记住的是：**事件让插件之间不用直接调用，而靠声明事件名来协作**，这正是"没有特权核心、插件互相组合"能成立的通信基础。

顺带一个关键点：`ctx.on()` 注册的监听器，本身就是一个可逆副作用。插件卸载时，它注册的所有监听器自动移除，你永远不用手写 `removeListener`。这就接到了第五条。

## 范式五：注册即可逆副作用，这是灵魂

前四条讲完，现在讲把它们拧成一股绳的那条。

Cordis 里，凡是"注册一个东西"的操作，都被当成**副作用（effect）**对待。副作用的意思是：它不是一次性写入，而是带逆操作的一次挂载，插件卸载时按序撤销。三种注册方式都是 effect：

- `ctx.on(event, listener)` 注册监听器，卸载时移除。
- `ctx.plugin(child)` 挂载子插件，父插件卸载时连带卸载子插件。
- 各个 harness 注册表（如 `ctx.tools.register(...)`）注册工具，卸载时自动注销。

对于 Cordis 没有内置管理的资源（定时器、网络连接、文件监听），用 `ctx.effect()` 显式包一层，返回一个清理函数：

```typescript
ctx.effect(() => {
  const timer = setInterval(() => console.log('tick'), 200)
  // 返回的函数就是逆操作，卸载时执行
  return () => {
    clearInterval(timer)
    console.log('heartbeat cleaned up')
  }
})
```

挂载时执行 effect 体，卸载时执行它返回的清理函数。你永远不用自己调用这个清理函数，Cordis 替你管。

每个加载的插件实例都有一个叫 **fiber** 的运行时句柄，它在一条状态机里走：

```text
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                 ↘ FAILED
```

- PENDING：声明了但需要的 service 还没就位（见范式三）。
- LOADING / ACTIVE：apply 正在跑 / 已完成。
- FAILED：apply 或配置校验抛了异常。
- UNLOADING / DISPOSED：清理函数正在跑 / 已全部拆完。

`ctx.plugin(...)` 返回的就是一个 fiber。调 `fiber.dispose()`，它会等这个插件的所有清理（包括异步清理）跑完才 resolve，而且会递归卸载它挂载的所有子插件。教程演示了完整一圈：起一个心跳定时器、700 毫秒后 dispose 子插件，输出里能清楚看到"tick、tick、tick、heartbeat cleaned up、disposed"的顺序，清理函数确实在卸载时被调用了。

这里有个细节值得记住：**清理函数按注册的相反顺序执行，但多个异步清理函数是并发执行的。** 如果某些清理步骤必须串行，就把它们塞进同一个清理函数里 await。这个顺序规则是"路径无关"那条强性质的实现基础。

### 为什么灵魂是第五条，而不是其他

现在可以回答标题的问题了。把五条放一起看，前四条单独都"可被设计"：

- 服务定位器（范式二）DI 容器早就有了。
- 依赖声明（范式三）Spring 的 `@Autowired` 也是依赖声明。
- 事件总线（范式四）Node 的 EventEmitter、Vue 的事件系统都是。
- 插件对象（范式一）几乎每个框架都有。

但前面那个"老问题"还在：这些框架注册了，却不能干净注销。Koa 不告诉你怎么取消中间件，Vue 不告诉你怎么卸载全局组件，DI 容器里 bean 解析完就是静态的，热替换不了。

第五条把这个窟窿补上了。因为注册是带逆操作的 effect，所以：

- 范式三的"依赖运行时追踪"才安全。provider 没了，依赖它的插件连带卸载，它注册的所有东西按序撤销，不会留下指向已失效服务的引用。
- 范式四的监听器才不会泄漏。`ctx.on` 是 effect，插件没了监听器自动没。
- 整个"换 provider 等于换产品"的承诺才成立。换 provider 就是卸载旧 effect、挂载新 effect，运行时上下文干净。

换句话说，**前四条定义了"插件之间怎么组合"，第五条保证了"这个组合在运行时可以被增、删、换而永不脏"。** 没有 fifth，Cordis 就是又一套带类型事件的 DI 容器；有了 fifth，它才兑现了论文里"路径无关"的承诺。这就是为什么第五条是灵魂。

对比 VSCode 插件，这一点也最清楚。VSCode 其实有 dispose 概念，`context.subscriptions.push(disposable)` 是它的清理机制，单个扩展内部能做到资源回收。但 VSCode 扩展不能像 Cordis 那样在运行时被干净地卸载再热加载，换一个扩展通常要重载整个窗口；而且 VSCode 的多数贡献是静态写在 package.json 里的，不是程序化注册的可逆 effect。Cordis 把可逆性做到了每一行注册、且支持运行时热替换这一层，这是它的独门功夫。

## 这套范式要付的纪律成本

灵魂不是白给的，第五条对插件作者有硬纪律：

**每个有副作用的注册都要配清理函数。** 漏掉一个，就破坏了路径无关性。Cordis 文档反复强调"每个注册都该有一个 disposer"。用内置 API（`ctx.on`、注册表 register）时 Cordis 替你配好了；用了 `ctx.effect` 就得自己返回清理函数，没有就等于声明"这个副作用卸载时不用清理"，得心里有数。

**waterfall 监听器必须显式调 `next()`，除非你确实要短路。** 这条前面提过，再强调一次。忘了 `next()` 不是个无害的 bug，它会吞掉下游所有人的默认行为，而且静默。

**异步清理函数并发执行，顺序不保证。** 需要严格顺序的清理，要在单个清理函数里串行 await。这是 fiber 销毁的一个非显然陷阱。

**effect 不能在 UNLOADING 状态下创建。** DeepSeek Harness 自己在 vendored 的 `cordis/src/fiber.ts` 里打了个补丁，关闭了三个"销毁过程中又有新注册进来"的重入缺口：当 fiber 处于 UNLOADING 时，拒绝新的 effect 创建，防止清理时刻的注册逃逸出卸载快照。这从一个侧面说明，可逆性在并发和重入下的边界条件很硬，造轮子容易踩坑，所以 DeepSeek 选择直接内嵌 Cordis、自己审自己补。

## 结论

五条范式压成一句：插件是 Service 对象，能力按 key 注册进 context 仓库，依赖靠 inject 声明、由 Cordis 保证就位，插件间用类型化事件协作，而所有这些注册都是带逆操作的可逆副作用，卸载按序撤销。前四条定义组合的形状，第五条给这套形状加上运行时可增删可热替换的地基，所以第五条是灵魂。

理解了第五条，你才看得懂 DeepSeek Harness 那些"运行时换 provider""卸载插件不留垃圾""依赖消失自动连带重启"的承诺是怎么落地的，也才理解它为什么要选 Cordis 而不是随便一个 DI 容器。

## 时点与诚实声明

本文基于 2026-08-14 的 `deepseek-ai/deepseek-harness` 官方文档：Cordis Primer、Cordis 教程第 1 至 4 章（`docs/cordis-tutorial/`）、架构文档 Cordis 节。代码示例改写自上述教程，API 名称（`ctx.effect`、`ctx.on`、`ctx.plugin`、`Service`、`inject`、`fiber.dispose`）与 fiber 状态机（PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED / FAILED）均为文档陈述的可核实事实。

一处文档不一致需留意：Cordis Primer 的派发模式表列出四种（emit、waterfall、parallel、serial），而 Cordis 教程第 4 章列出五种（多了 `bail`，描述为 serial 的同步版本）。本文未对派发模式数量作硬性断言，以实际仓库版本为准。

文中"Cordis 与传统 DI 容器的差异（运行时反应式依赖追踪）""Cordis 与 VSCode 扩展的差异（运行时热替换粒度、静态 contributes vs 程序化可逆注册）"属分析判断，不是 DeepSeek 或 VSCode 官方对比表述。VSCode 的 `context.subscriptions`/Disposable 机制、扩展热替换需重载窗口，是 VSCode 公开文档与社区共识，具体行为以 VSCode 实际版本为准。vendor 文档记录的 `fiber.ts` 重入销毁补丁来自仓库 `vendor/README.md`，为可核实事实。

## 延伸阅读

- [DeepSeek Harness Cordis Primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)：五条范式的官方归纳与瀑布流语义
- [Cordis 教程第 1 章：你的第一个插件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/01-first-plugin.md)：三种插件形态
- [Cordis 教程第 2 章：生命周期与副作用](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/02-lifecycle-and-effects.md)：effect、fiber 状态机
- [Cordis 教程第 3 章：服务](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/03-services.md)：Service、inject、运行时依赖追踪
- [Cordis 教程第 4 章：事件](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/04-events.md)：类型化事件与派发模式
- [Koishi 可逆插件系统设计](https://koishi.chat/zh-CN/cookbook/design/disposable.html)：副作用插座与逆函数直觉的来源
- [VSCode 扩展 API：Disposable 与 subscriptions](https://code.visualstudio.com/api)：本文 VSCode 对比的参照

上一篇：[Cordis 速成：从《时空可组合性》论文说起](./03-cordis-primer-spatiotemporal-composability.md)
下一篇：[Profile 与 Bundle：一个跑起来的 dsh 怎么被拼出来](./05-profile-and-bundle-composition.md)
