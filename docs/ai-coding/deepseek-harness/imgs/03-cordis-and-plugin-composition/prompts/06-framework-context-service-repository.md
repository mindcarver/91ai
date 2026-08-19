---
illustration_id: 06
type: framework
style: notion
generator: gpt-image-2
text_mode: required
---

context 是一个服务仓库 — Conceptual Framework

Layout: A central shared context repository on a wide 16:9 canvas. Several provider cards plug services into it by stable keys, and consumer cards retrieve them by key without importing concrete implementations.

ZONES:
- Left zone: three provider inputs with small icons for tools, model, and agents.
- Center zone: a large rounded repository card labeled “Service Locator”, with slots labeled “ctx.tools”, “ctx.llm”, “ctx.agents”, and “greeter”.
- Right zone: simple consumer cards that request a capability by key, with arrows from the repository to consumers. Do not show concrete provider imports.
- Add a small namespace boundary line around the repository to communicate a flat shared key space.

RELATIONSHIPS: Provider implementations can be swapped at the context slots while consumers remain unchanged. Keep the diagram conceptual and sparse.

LABELS: Title: “context 是一个服务仓库”. Labels: “ctx.tools”, “ctx.llm”, “ctx.agents”, “greeter”, “Service Locator”. Takeaway: “按 key 查能力，不 import 实现”. Render exact supplied labels only; do not invent pseudo-text.

COLORS: White background (#FFFFFF); near-black outlines and text (#1A1A1A); pastel yellow (#F9E79F) for the central repository; pastel blue (#A8D4F0) for providers; pastel pink (#FADBD8) for consumers; dark gray (#4A4A4A) connectors.

STYLE: GPT Image 2 illustration in a polished Notion-like editorial framework style. Hand-drawn line work with slight wobble, rounded modular cards, simple service and plug doodles, generous whitespace, restrained pastel accents, no texture, no gradients, no logos, and no photorealism. Text is required, exact, large, readable, and in the article language. Render as a real PNG image, not SVG or programmatic vector artwork.

ASPECT: 16:9 landscape, medium information density.
