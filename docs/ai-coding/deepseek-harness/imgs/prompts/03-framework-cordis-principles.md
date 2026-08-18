---
illustration_id: 03
type: framework
style: notion
generator: gpt-image-2
text_mode: required
---

Cordis：让一切皆插件 — Conceptual Framework

Layout: A central rounded card labeled “Cordis” with five smaller principle cards arranged around it in a loose pentagon. Use light hand-drawn connectors to show that the five mechanisms jointly make plugin replacement safe and composable.

NODES:
- Center node: “Cordis”, drawn as a small runtime context with reversible plug connectors.
- Node 1: “Service”, represented by a service object registering a capability on shared context.
- Node 2: “inject”, represented by two dependency plugs meeting before activation.
- Node 3: “类型化事件”, represented by clean event arrows labeled emit / waterfall / serial, with no additional text.
- Node 4: “可逆副作用”, represented by a registration arrow paired with an undo arrow.
- Node 5: “干净卸载”, represented by a module being removed with its connectors retracting cleanly.

RELATIONSHIPS: All five nodes feed the center Cordis runtime guarantee. A subtle outer loop should show that a plugin can be mounted, used, and unloaded without leaving residue.

LABELS: Title: “Cordis：让一切皆插件”. Node labels: “Service”, “inject”, “类型化事件”, “可逆副作用”, “干净卸载”. Takeaway: “插件卸载时按序撤销副作用”. Render exact supplied labels only; do not invent pseudo-text.

COLORS: White background (#FFFFFF); near-black outlines and text (#1A1A1A); pastel yellow (#F9E79F) for Cordis; pastel blue (#A8D4F0) for dependency and event nodes; pastel pink (#FADBD8) for reversible effects and unload; dark gray (#4A4A4A) for connectors.

STYLE: GPT Image 2 illustration in a polished Notion-like editorial style. Minimal hand-drawn line art, modular rounded cards, slight wobble, sparse doodle icons, generous whitespace, no complex background, no gradients, and no photorealism. Text is required, exact, large, prominent, readable, and in the article language. Do not create fake characters or pseudo-text. Render as a real PNG image, not SVG or programmatic vector artwork.

ASPECT: 16:9 landscape, medium information density, suitable for a technical architecture explainer.
