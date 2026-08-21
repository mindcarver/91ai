# 系统提示组装与动态 Cordis：dsh 让 agent 改自己的插件树

> 模型每个 step 看到的系统提示，是若干段按 order 排序的贡献（section、context、tools、variable）经一道 waterfall 组装出来的；而动态 Cordis 让 agent 能在运行时挂载一个会注册工具、提示、监听器的包，修改正在跑它自己的那棵插件树，且这一切因为注册是可逆副作用而能干净撤销。
> 这一篇把两件事缝在一起：系统提示是怎么拼出来的，以及 agent 怎么通过 typert/apiProxy 和动态 Cordis 去观察甚至修改自己运行的那个 harness。

## 系统提示怎么拼出来：四种贡献加一道 waterfall

`ctx.systemPrompt` 是注册表服务。插件往它上面贡献四种东西：

- **section（段落）**：系统提示的一段，有名字、有 order、有文本（静态或按组装上下文算）。
- **context（上下文）**：动态模型上下文，组装成一条持久的 user 角色快照。
- **tools（工具）**：工具 schema 提供者，产出当前组装可见的工具 schema 集合。
- **variable（变量）**：提示里 `{{variable}}` 的值提供者。

段落和上下文都有 order，按升序拼接。文档给了一套约定：`-100` 是 harness 身份，`0` 是部署人格，工具引导用 100 到 199，其他负 order 也排在人格之前。比如 `harness:source` 段（告诉模型 dsh 实现的磁盘路径）order 是 `-99`，正好在身份 `-100` 之后、人格 `0` 之前；Code Mode 的 "只有 run_code 能直接调" 规则 order 是 `99`，在人格之后、工具引导 100 到 199 之前；生成的 SDK 段 order 是 `150`。

每段的 text 可以是静态字符串，也可以是一个按 `AssembleContext` 算值的函数。`AssembleContext` 标识这次组装解析哪个 scope 层，还可能带这次请求的控制信号（合并扩展的：`dsh-agent` 加了可选的 `agent` 字段）。text 里的 `{{variable}}` 占位符在后面由 `renderPrompt` 插值。

组装本身是一道 waterfall：`system-prompt/assemble`。它收到从注册的贡献构建出来的可变 assembly，监听器可以改它，返回值是权威的。一个注册了 `complete: true` 的段会在 waterfall 之后被恢复成唯一的提示段（多于一个有效 complete 段会让组装失败），所以一个想"完全接管系统提示"的插件能用 complete 段做到，但它仍然要让工具、上下文、变量被解析。

## 一个 step 的请求长什么样

把这些拼起来，一个 step 的请求 = 渲染后的 system 文本 + 可见工具 schema + 从会话日志投影出来的 messages。agent-loop 在每个 step 请求前调 `ctx.systemPrompt.assemble(assembleContextFor(this, signal))`，拿到 assembly，再 `renderPrompt(assembly)` 把段落拼成 system 字符串、插值变量。工具 schema 是 assembly 的一部分，模型看到的工具集和系统提示是同一次组装出来的。

这解释了一个现象：你注册一个工具，它的 schema 自动出现在模型看到的工具列表里。因为 `ToolRuntime` 构造时挂了 `ctx.systemPrompt.tools(context => this.wireSchemas(context.scope))`，工具注册表把自己当成了系统提示的一个工具 schema 提供者。注册工具和注册提示段，走的是同一个组装管线。

## 组装的权威性与 complete 段

`assemble` 的返回值是权威的，但有一个例外：complete 段。文档原话，一个有效的 complete 段在 waterfall 之后被恢复成唯一的提示段，"所以监听器不能往那个 scope 的系统提示里加东西或替换它"。

这是个有意思的设计。一个用 complete 段接管系统提示的部署，它的提示是封闭的：assemble waterfall 仍然会跑（让工具、上下文、变量被解析），但最终提示就是那个 complete 段，别的段加不进来。这给了一种"我要完全控制模型看到什么"的逃逸口，同时保留了组装管线解析工具和变量的能力。

## KV cache 视角：为什么组装要稳定

组装的稳定性直接关系 KV cache 复用。文档反复强调一个性质：**只要系统文本、工具 schema、更早的历史在同一个 provider 和 model 路由下字节相同，就是 prefix-stable、可复用的；一处变了，就从第一个改动的 token 起失效。**

这条性质把几个设计决策串起来了。order 约定让段落的顺序稳定（不会因为注册顺序波动）。Code Mode 的 SDK 段是确定性的（字典序工具排列，工具集不变则文本字节相同）。`harness:source` 段放在请求前缀头部且进程生命周期内稳定（端口是启动时的事实），所以不会跨 turn 失效缓存。这些都是为了让"模型每步重新组装提示"这件事不把 KV cache 打烂。

反过来，任何改变提示组成的操作（注册新工具、换 scope 限制、跑一个注册了新提示段的动态包）都可能从第一个改动的 token 起让缓存失效。组装不是免费的，它每次都跑，但它的目标是"不变就不付代价"。

## typert 与 apiProxy：浏览器怎么摸到活的服务

到这里讲的都是模型侧看到的提示。另一条线是浏览器（和 Host 客户端）怎么摸到 harness 内部活的服务。这靠三个 core 服务：

**`ctx.typert`（运行时类型注册表）**。插件直接或通过 `dsh-typert-loader` 注册 live zod 贡献；API gateway 消费调用描述符和 provider，其他运行时消费者在自己的边界上查 schema 和反射元数据。typert 给的是"这个服务有什么方法、什么签名"的类型化反射。

**`ctx.typertGateway`**。它把生成的 Remote 描述符和活的 Cordis 服务关联起来，解析注册的身份，通过共享的 Connection RPC 载体暴露一元调用。它把"类型描述"映射到"实际能调用的活服务"。

**`ctx.apiProxy`**。transport 无关的 host 网关面：它派发浏览器 API 调用，每个打开的 host 流订阅它转发的事件，而不是被一个广播动词推送。

这三个串起来，就是浏览器侧的 UI 调用到达 host 活服务的路径：apiProxy 是面向浏览器的派发面，typertGateway 把调用路由到具体的活服务，typert 提供这些服务的类型化描述。这套机制和 `cordis_inspect`（下一节）共享同一份 Cordis 声明投影，所以"模型读到的服务目录"和"浏览器能调的服务"不会漂移。

## 动态 Cordis：agent 修改自己的插件树

现在到了这篇最特别的部分：自指的 Cordis 工具集，`dsh-tool-cordis`。它的官方描述一句话：五个面向模型的工具，作用在当前 DSH 进程里的活运行时上。它注入 runner 服务（`ctx.dynamicCordisRunner`，由 `cordis-host-runner` 提供）；一个挂了这些工具但没挂 runner 的组合，这些工具永远不会激活。

五个工具：

- **`cordis_inspect`**：对当前进程的只读报告。列出服务、所有活着的插件 fiber、注册工具、本会话的动态包、反射支持的 `api`/`events` 引用、以及编译期的 `client` slot 面（浏览器半边能贡献 UI 的位置）。精确给一个 `name` 能窄化到单个服务、事件或 slot，拿到完整契约。
- **`cordis_define`**：记录一个包（name、purpose、host 半边 code 和/或 浏览器半边 client），两边都做语法检查。什么都不跑。用户在会话里看到一张带启动控件的卡片。它铸造一个 `dyn-<n>` id，这个 id 同时在结果值和持久展示元数据里，回放时卡片靠它定位到运行类动词。
- **`cordis_run`**：在 vm 沙箱里求值 host 半边，把浏览器半边投递给所有打开的网页。重跑一个已经在跑的包会重新投递活版本，而不是失败（页面重载后靠这个拿回它）。
- **`cordis_stop`**：把 host 半边 dispose 到静止，撤回浏览器半边。定义还在，能再跑。
- **`cordis_undefine`**：需要的话先停，再忘掉定义；它的卡片留在会话里作为一条卸载记录。

这里的"自指"在哪？`cordis_run` 跑起来的包能注册工具、提示贡献、监听器，改变后续请求针对的 scope 看到的东西。也就是说，正在跑这个 agent 的那棵插件树被修改了：agent 在用自己的工具，扩展自己运行的那个系统。`cordis_inspect` 让它先看清结构，`cordis_define` 和 `cordis_run` 让它动手改。

这套能力的边界很明确。动态包只活在共享的 DSH 进程内存里：跨后续 turn 保持活跃，可能影响该进程里的其他会话，但在 `cordis_stop`/`cordis_undefine`、工具集卸载、或 DSH 重启后消失。它不创建插件文件、不装包、不改 `cordis.yml` 或任何配置、不活过重启、不能被自动提升成正式插件。每个动词是会话作用域的：一个包只在定义它的会话里可见、可控。要保留一个实验，得让 agent 走常规开发流程实现一个正式的本地、项目或仓库插件。

## 信任姿态：把它当 bash 权限

让 agent 能挂代码、改活运行时，听起来很危险。文档对这套能力的信任姿态写得很直白：**沙箱是给诚实代码做隔离用的，不是安全边界。**

具体说：vm 沙箱隔离全局，Node 全局要么没有要么重定向到 `ctx.fs`、`ctx.web`、`ctx.bash` 这样的 Cordis 服务，对 `globalThis` 的写保持局部。但 host 领域的 helper 让逃逸成为可能。挂载的插件拿到一个没有框架内部的 façade，但它允许的服务影响活运行时。文档的结论是：**把这套工具集当成 bash 权限一样对待**，加载这个插件要像授予 bash 工具一样审慎。

一个相关的限制：ctx façade 不暴露 `effect()`，包代码不能注册自定义 disposer；`on`、`provide`、`tools.register` 是支持的清理路径。这把动态包能做的"注册"限制在 Cordis 内置的可逆注册 API 上，没有留 `effect` 这个更灵活但也更容易漏清理的口子。

## 自指的安全网：回到可逆副作用

读完动态 Cordis，回头看 Cordis 的可逆副作用，会发现它是这套自指能力的安全网。

一个动态包注册了新工具、新提示段、新监听器，这些注册都是可逆副作用。所以 `cordis_stop` 能把这些贡献干净撤掉（dispose 到静止），`cordis_undefine` 能彻底忘掉。撤掉是按序撤销注册，不是"重启进程清理"。文档敢说 `cordis_stop`/`cordis_undefine` 之后这些贡献被移除，依据就在这里：因为它们是 effect，有逆操作，Cordis 替你按序执行。

如果注册不是可逆副作用（像大多数框架那样只进不出），让 agent 动态改插件树就是自杀行为：改完撤不掉，越改越脏，最后只能重启。可逆副作用让"让 agent 改自己"这个激进的 self-modification 从一个不可收拾的操作，变成一个有边界、能回滚的实验。agent 试一个动态包、不满意、停掉，活运行时回到原状。

把这些串起来看：系统提示组装让模型的视图可组合、可缓存，typert 和 apiProxy 让外部能摸到活服务，动态 Cordis 让 agent 能观察和扩展自己运行的那个系统。而这些能力之所以不失控，归根结底还是靠那条"注册是可逆副作用、卸载按序撤销"的规矩。

## 结论

模型每个 step 看到的系统提示，是四种贡献按 order 排序、经 `system-prompt/assemble` waterfall 组装出来的，组装的稳定性直接关系 KV cache 复用。动态 Cordis 把这条组装管线对 agent 自己敞开：`cordis_define` 和 `cordis_run` 能挂载注册新工具、新提示、新监听器的包，修改正在跑它自己的那棵插件树。这套自指之所以不失控，是因为注册都是可逆副作用，`cordis_stop` 和 `cordis_undefine` 按序撤销、活运行时回到原状，而信任姿态等同 bash 权限。

## 延伸阅读

- [系统提示组装文档（docs/subsystems/system-prompt.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/system-prompt.md)：组装 API 与贡献类型的权威来源
- [system-prompt 包源码](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/system-prompt/src/index.ts)：组装实现
- [自指 Cordis 工具集（tool-cordis README）](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/tool-cordis/README.md)：五个 cordis_* 工具与动态包生命周期
- [cordis-host-runner README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/cordis-host-runner/README.md)：vm 沙箱与动态包运行器
- [能力接缝图（ctx.typert / typertGateway / apiProxy / dynamicCordisRunner 行）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)：这几个 core 服务的职责
- [自指 Cordis 工具集设计 Agent Note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md)：沙箱语义与设计决策

上一篇：[dsh tools 注册表与守卫管线源码导读](./14-tools-registry-guards-source-walkthrough.md)
下一篇：[🔍 LLM 适配器：dsh 的 stream 契约源码导读](./16-llm-adapter-stream-contract-source-walkthrough.md)
