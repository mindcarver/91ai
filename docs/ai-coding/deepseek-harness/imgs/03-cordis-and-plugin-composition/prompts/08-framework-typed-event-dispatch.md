---
illustration_id: 08
type: framework
style: notion
generator: gpt-image-2
text_mode: required
---

类型化事件：插件不直接互调 — Event Dispatch Framework

Layout: A central typed event bus on a wide 16:9 canvas. Show one emitter and several listeners, with four distinct dispatch-mode lanes branching from the center. Make waterfall visually special with a next() gate and a veto short-circuit.

ZONES:
- Left: an emitter card labeled “emit” sends a typed event into the center event bus; a listener registration card labeled “on” connects from below.
- Center: a clean event bus with namespace/action style implied by simple structured tags, but no extra text.
- Right lanes: “parallel” runs listeners side by side; “serial” runs them in sequence; “waterfall” passes through next() gates; a veto mark shows a listener short-circuiting the chain.
- Keep the listener cards modular and independent; do not draw direct plugin-to-plugin arrows.

LABELS: Title: “类型化事件：插件不直接互调”. Labels: “emit”, “on”, “parallel”, “serial”, “waterfall”, “veto”. Takeaway: “只观察要调用 next()”. Render exact supplied labels only; do not invent pseudo-text.

COLORS: White background (#FFFFFF); near-black outlines and text (#1A1A1A); pastel blue (#A8D4F0) for emit/on; pastel yellow (#F9E79F) for parallel and serial; pastel pink (#FADBD8) for waterfall and veto; dark gray (#4A4A4A) arrows.

STYLE: GPT Image 2 illustration in a polished Notion-like editorial framework style. Hand-drawn lines with slight wobble, rounded cards, simple event and arrow doodles, generous whitespace, restrained pastel accents, no texture, no gradients, no logos, and no photorealism. Text is required, exact, large, prominent, readable, and article-specific. Render as a real PNG image, not SVG or programmatic vector artwork.

ASPECT: 16:9 landscape, medium information density.
