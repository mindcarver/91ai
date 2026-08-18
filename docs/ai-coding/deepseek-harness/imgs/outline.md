---
type: mixed
density: rich
style: notion
generator: gpt-image-2
image_count: 6
---

# Illustration Outline

## Illustration 1

**Position**: Article opening, after the introductory blockquote
**Purpose**: Give readers a single mental model for the article: dsh is the open-source Harness layer that turns a model into an agent, and its defining mechanism is a fully pluginized runtime.
**Visual Content**: A centered equation-like framework. The left side is a simple model node; the middle is a larger modular dsh/Cordis plugin layer; the right side is an agent workspace with tools and execution capabilities. Around the harness layer, show replaceable capability seams and profile/bundle composition without turning the image into a dense architecture diagram.
**Text Plan**: Title: “模型 + Harness = Agent”. Labels: “DeepSeek Harness”, “一切皆插件”, “Cordis”, “能力接缝”, “可替换 provider”. Takeaway: “换 provider，换整个产品”.
**Type Application**: Framework with a left-to-right causal relationship and a modular center.
**Filename**: 01-framework-model-harness-agent.png

## Illustration 2

**Position**: Section “为什么是开源，为什么是"全插件化"” / after the comparison paragraph
**Purpose**: Make the trade-off between closed harnesses and dsh’s fully pluginized harness visible at a glance.
**Visual Content**: A balanced left-right comparison with closed harnesses on the left and dsh on the right, contrasting fixed inner harnesses with replaceable providers, loops, tools, and logs.
**Text Plan**: Title: “封闭 harness vs 全插件化 harness”. Labels: “开箱即用”, “用户改不了内核”, “可组合、可替换”, “上手门槛高”. Takeaway: “模型是 DeepSeek 的，harness 是大家的”.
**Type Application**: Comparison view with equal visual weight and a central trade-off divider.
**Filename**: 02-comparison-closed-open-harness.png

## Illustration 3

**Position**: Section “Cordis：让"一切皆插件"不只是口号” / after the five numbered principles
**Purpose**: Distill Cordis’s runtime guarantee into a compact mechanism diagram rather than another list.
**Visual Content**: Five connected modular cards around a clean central Cordis node: Service registration, dependency injection, typed events, reversible effects, and clean replacement/unload.
**Text Plan**: Title: “Cordis：让一切皆插件”. Labels: “Service”, “inject”, “类型化事件”, “可逆副作用”, “干净卸载”. Takeaway: “插件卸载时按序撤销副作用”.
**Type Application**: Framework with a central runtime mechanism and five supporting principles.
**Filename**: 03-framework-cordis-principles.png

## Illustration 4

**Position**: Section “一个跑起来的 dsh 长什么样” / after the two profile templates
**Purpose**: Show how a profile is assembled by stacking bundles and patches, making “没有特权核心” concrete.
**Visual Content**: Two vertical assembly paths from dsh-base: web adds dsh-web-app and a browser UI; headless adds dsh-headless and a one-shot runner. A patch layer crosses both paths and points to replaceable configuration.
**Text Plan**: Title: “profile + bundle = dsh”. Labels: “web”, “headless”, “dsh-base”, “dsh-web-app”, “dsh-headless”, “patch”. Takeaway: “挂插件即可改行为”.
**Type Application**: Top-down branching flowchart with two profiles sharing a base bundle.
**Filename**: 04-flowchart-profile-bundle.png

## Illustration 5

**Position**: Section “一次对话在内部怎么跑” / after the turn/step skeleton
**Purpose**: Give readers a memorable sequence for the internal agent loop and show where tools and event gates enter.
**Visual Content**: A left-to-right loop from turn start through input, agent/pre-step, step, model request, tool/call, tool execution, tool/result, and the next step or turn end.
**Text Plan**: Title: “一次对话在内部怎么跑”. Labels: “turn”, “step”, “agent/pre-step”, “tool/call”, “tool/result”, “turn 结束”. Takeaway: “模型可见即可重建”.
**Type Application**: Process flowchart with a visible loop-back from tool/result to the next step.
**Filename**: 05-flowchart-agent-loop.png

## Illustration 6

**Position**: Section “能力接缝：换一个 provider，换整个产品” / after the three roles of a seam
**Purpose**: Explain why replacing one provider can move the whole execution world, not just one isolated feature.
**Visual Content**: A central capability seam with three roles—definition, provider, consumer—feeding a shared execution world. Show ctx.llm, ctx.fs, and ctx.sandbox as replaceable plugs, with local and remote/E2B worlds as alternatives.
**Text Plan**: Title: “能力接缝：换 provider，换整个产品”. Labels: “Service Definition”, “Service Provider”, “Consumer”, “ctx.llm”, “ctx.fs”, “ctx.sandbox”. Takeaway: “一个 provider 的替换，移动整个产品”.
**Type Application**: Framework with a three-role seam on the left and alternate execution worlds on the right.
**Filename**: 06-framework-capability-seams.png
