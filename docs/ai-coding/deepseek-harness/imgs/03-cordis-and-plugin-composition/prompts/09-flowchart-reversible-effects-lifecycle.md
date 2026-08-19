---
illustration_id: 09
type: flowchart
style: notion
generator: gpt-image-2
text_mode: required
---

注册即可逆副作用 — Lifecycle Flow

Layout: A wide 16:9 lifecycle diagram. Place a main state machine across the top: ACTIVE → UNLOADING → DISPOSED, with a side entry from ACTIVE to FAILED and a prior PENDING/LOADING hint. Under ACTIVE, show three registrations; under UNLOADING, show them being removed in reverse order.

STEPS:
1. Active plugin registers “ctx.on”, “ctx.plugin”, and “ctx.effect”.
2. The runtime enters “UNLOADING” and runs disposer functions in reverse registration order.
3. Listener, child plugin, timer, and tool registration are removed.
4. The runtime reaches “DISPOSED” with a clean context.

CONNECTIONS: Use a bold reverse arrow to show cleanup order. Add a small fiber handle icon and keep the state labels readable. Do not include a long code sample.

LABELS: Title: “注册即可逆副作用”. Labels: “ctx.on”, “ctx.plugin”, “ctx.effect”, “ACTIVE”, “UNLOADING”, “DISPOSED”. Takeaway: “卸载按相反顺序撤销”. Render exact supplied labels only; do not invent pseudo-text.

COLORS: White background (#FFFFFF); near-black outlines and text (#1A1A1A); pastel blue (#A8D4F0) for ACTIVE; pastel yellow (#F9E79F) for registered effects; pastel pink (#FADBD8) for UNLOADING; soft mint-like white highlight for DISPOSED; dark gray (#4A4A4A) arrows.

STYLE: GPT Image 2 illustration in a polished Notion-like hand-drawn lifecycle flowchart style. Rounded state cards, reverse arrows, simple timer/listener/plug doodles, slight wobble, generous whitespace, restrained pastel accents, no texture, no gradients, no logos, and no photorealism. Text is required and must be exact, large, prominent, readable, and article-specific. Render as a real PNG image, not SVG or programmatic vector artwork.

ASPECT: 16:9 landscape, medium information density.
