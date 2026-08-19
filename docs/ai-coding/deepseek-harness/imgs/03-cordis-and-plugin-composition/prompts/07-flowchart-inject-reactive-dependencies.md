---
illustration_id: 07
type: flowchart
style: notion
generator: gpt-image-2
text_mode: required
---

inject 让加载顺序消失 — Dependency State Flow

Layout: A wide 16:9 state flow. Put a provider on the left and a consumer on the right. Show the consumer moving from PENDING to ACTIVE when the provider becomes available, then automatically unloading and returning to PENDING when the provider disappears, and reactivating when a replacement returns.

STEPS:
1. Provider absent — consumer waits in “PENDING”.
2. Provider appears — “inject” dependency resolves and the consumer becomes “ACTIVE”.
3. Provider is removed or hot-replaced — the consumer unloads and returns to PENDING.
4. New provider returns — the consumer reconnects and becomes ACTIVE again.

CONNECTIONS: Use arrows that emphasize a reactive loop, not a fixed startup order. Add a small crossed-out boot sequence list to contrast with traditional manual ordering, but do not add extra labels.

LABELS: Title: “inject 让加载顺序消失”. Labels: “inject”, “PENDING”, “ACTIVE”, “provider”, “Reactive Coeffects”. Takeaway: “依赖变化时，消费者自动重连”. Render exact supplied labels only; do not invent pseudo-text.

COLORS: White background (#FFFFFF); near-black outlines and text (#1A1A1A); pastel blue (#A8D4F0) for provider; pastel yellow (#F9E79F) for PENDING; pastel pink (#FADBD8) for ACTIVE and reload; dark gray (#4A4A4A) connectors.

STYLE: GPT Image 2 illustration in a polished Notion-like hand-drawn flowchart style. Rounded state cards, clear arrows, simple dependency plug icons, slight line wobble, generous whitespace, restrained pastel accents, no texture, no gradients, and no photorealism. Text is required, exact, large, prominent, readable, and article-specific. Render as a real PNG image, not SVG or programmatic vector artwork.

ASPECT: 16:9 landscape, medium information density.
