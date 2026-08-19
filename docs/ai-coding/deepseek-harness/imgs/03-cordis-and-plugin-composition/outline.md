---
type: mixed
density: rich
style: notion
generator: gpt-image-2
image_count: 10
---

# Illustration Outline

## Illustration 1

**Position**: Section “一个老问题：能注册，却不能注销” / after the three requirements for an agent plugin system
**Purpose**: Establish the problem Cordis solves: ordinary frameworks accumulate side effects, while an agent harness needs dynamic add, replace, and clean removal.
**Visual Content**: Split comparison between register-only frameworks and a reversible plugin lifecycle.
**Text Plan**: Title: “能注册，却不能注销”. Labels: “注册”, “卸载”, “副作用”, “重启治百病”, “卸载即还原”. Takeaway: “加载与卸载必须对等”.
**Type Application**: Comparison.
**Filename**: 01-comparison-register-unregister.png

## Illustration 2

**Position**: Section “理论：两个编译期概念，搬进运行时” / after the two mechanism definitions
**Purpose**: Turn the paper’s two axes into a memorable mental model.
**Visual Content**: A two-axis framework contrasting lifecycle reversal with reactive dependency wiring, joined by a runtime Cordis node.
**Text Plan**: Title: “时空可组合性”. Labels: “effect”, “coeffect”, “Temporal Composability”, “Spatial Composability”, “Revertible Effects”, “Reactive Coeffects”. Takeaway: “把可逆性与依赖反应式变成运行时一等机制”.
**Type Application**: Framework.
**Filename**: 02-framework-spatiotemporal-composability.png
**Generation Prompt**: `prompts/02b-framework-spatiotemporal-composability.md`

## Illustration 3

**Position**: Section “Cordis 的来历：从 Koishi 里抽出来的元框架” / after the explanation of the three-layer relationship
**Purpose**: Show the lineage and clarify why Cordis is a meta-framework rather than another end-user product.
**Visual Content**: A clean lineage from Koishi through Cordis to DeepSeek Harness, with shared theory below and distinct product surfaces above.
**Text Plan**: Title: “Cordis 从哪里来”. Labels: “Koishi”, “Cordis”, “DeepSeek Harness”, “元框架”, “可审计、可打补丁”. Takeaway: “同一套底层理论，不同产品形态”.
**Type Application**: Framework / lineage.
**Filename**: 03-framework-cordis-lineage.png
**Generation Prompt**: `prompts/03b-framework-cordis-lineage.md`

## Illustration 4

**Position**: Section “工程：五条范式，第五条是灵魂” / after the table mapping the five paradigms
**Purpose**: Give the reader a single map before the article enters the five detailed subsections.
**Visual Content**: Five modular cards around a central Cordis runtime, with the fifth reversible-effects card as the foundation.
**Text Plan**: Title: “五条范式，第五条是灵魂”. Labels: “Service”, “context”, “inject”, “类型化事件”, “可逆副作用”. Takeaway: “前四条定义形状，第五条提供地基”.
**Type Application**: Framework.
**Filename**: 04-framework-five-paradigms.png

## Illustration 5

**Position**: Subsection “范式一：插件是实现了 Service 的对象” / after the three plugin forms code example
**Purpose**: Compare the three legal plugin shapes without repeating the source code.
**Visual Content**: Three equal cards—function, object, and class/Service—converging on the same apply(ctx) lifecycle.
**Text Plan**: Title: “插件的三种合法形态”. Labels: “函数插件”, “对象插件”, “类插件”, “Service”, “apply(ctx)”. Takeaway: “一个服务就是一个插件”.
**Type Application**: Comparison.
**Filename**: 05-comparison-plugin-service-shapes.png

## Illustration 6

**Position**: Subsection “范式二：context 是一个服务仓库” / after the service-locator explanation
**Purpose**: Make key-based service lookup concrete and show why consumers do not import providers directly.
**Visual Content**: Providers register services into a shared context repository; consumers retrieve ctx.tools, ctx.llm, ctx.agents, or greeter by key.
**Text Plan**: Title: “context 是一个服务仓库”. Labels: “ctx.tools”, “ctx.llm”, “ctx.agents”, “greeter”, “Service Locator”. Takeaway: “按 key 查能力，不 import 实现”.
**Type Application**: Framework.
**Filename**: 06-framework-context-service-repository.png

## Illustration 7

**Position**: Subsection “范式三：用 inject 声明依赖，让加载顺序消失” / after the reactive-dependency paragraph
**Purpose**: Show the difference between a static startup order and Cordis’s runtime-reactive dependency graph.
**Visual Content**: A provider and consumer move through PENDING and ACTIVE; removing and restoring the provider causes automatic unload and reactivation.
**Text Plan**: Title: “inject 让加载顺序消失”. Labels: “inject”, “PENDING”, “ACTIVE”, “provider”, “Reactive Coeffects”. Takeaway: “依赖变化时，消费者自动重连”.
**Type Application**: Flowchart / state framework.
**Filename**: 07-flowchart-inject-reactive-dependencies.png

## Illustration 8

**Position**: Subsection “范式四：类型化事件，插件不直接互调” / after the waterfall explanation
**Purpose**: Clarify the event API and the semantic difference between dispatch modes.
**Visual Content**: A typed event center broadcasts to listeners, with four branches for emit, parallel, serial, and waterfall; waterfall includes a next() gate and a veto short-circuit.
**Text Plan**: Title: “类型化事件：插件不直接互调”. Labels: “emit”, “on”, “parallel”, “serial”, “waterfall”, “veto”. Takeaway: “只观察要调用 next()”.
**Type Application**: Framework / process.
**Filename**: 08-framework-typed-event-dispatch.png

## Illustration 9

**Position**: Subsection “范式五：注册即可逆副作用” / after the fiber state machine and cleanup explanation
**Purpose**: Visualize why the fifth paradigm is the runtime foundation: every registration carries a disposer and the lifecycle ends cleanly.
**Visual Content**: A lifecycle loop from ACTIVE to UNLOADING to DISPOSED, with ctx.on, ctx.plugin, and ctx.effect registrations unwinding in reverse order.
**Text Plan**: Title: “注册即可逆副作用”. Labels: “ctx.on”, “ctx.plugin”, “ctx.effect”, “ACTIVE”, “UNLOADING”, “DISPOSED”. Takeaway: “卸载按相反顺序撤销”.
**Type Application**: Flowchart / lifecycle.
**Filename**: 09-flowchart-reversible-effects-lifecycle.png

## Illustration 10

**Position**: Section “拼装：profile 与 bundle，从空列表到产品” / after the patch-layer ordering explanation
**Purpose**: Show how a running dsh is assembled from an empty list and how higher layers override lower ones.
**Visual Content**: A vertical stack from empty list through dsh-base, bundle layers, profile patch, home patch, and --patch overlay, branching into web and headless surfaces.
**Text Plan**: Title: “profile + bundle：从空列表到插件树”. Labels: “空列表”, “dsh-base”, “profile patch”, “home patch”, “--patch”, “web / headless”. Takeaway: “越上层优先级越高”.
**Type Application**: Flowchart / layered framework.
**Filename**: 10-flowchart-profile-bundle-patch-stack.png
