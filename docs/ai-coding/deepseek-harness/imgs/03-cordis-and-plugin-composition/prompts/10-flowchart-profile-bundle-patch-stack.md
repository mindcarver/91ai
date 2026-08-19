---
illustration_id: 10
type: flowchart
style: notion
generator: gpt-image-2
text_mode: required
---

profile + bundle：从空列表到插件树 — Layered Assembly Flow

Layout: A wide 16:9 top-down layered flowchart. Begin with a large empty list at the top, then stack layers in order: dsh-base, bundle layers, profile patch, home patch, and --patch overlay. At the bottom, branch into web / headless product surfaces.

STEPS:
1. “空列表” — start with no plugin entries.
2. “dsh-base” — insert shared harness infrastructure.
3. Bundle layers — add the selected bundle contents.
4. “profile patch” — user profile overrides.
5. “home patch” — home-level overrides.
6. “--patch” — highest temporary overlay.
7. Produce a plugin tree with two possible surfaces: “web / headless”.

CONNECTIONS: Use a clear vertical stacking metaphor. Make higher layers visually sit above lower layers and use a small priority arrow to show that upper layers can rewrite lower rows. Keep the result conceptual and uncluttered.

LABELS: Title: “profile + bundle：从空列表到插件树”. Labels: “空列表”, “dsh-base”, “profile patch”, “home patch”, “--patch”, “web / headless”. Takeaway: “越上层优先级越高”. Render exact supplied labels only; do not invent pseudo-text.

COLORS: White background (#FFFFFF); near-black outlines and text (#1A1A1A); pastel blue (#A8D4F0) for empty list and web surface; pastel yellow (#F9E79F) for dsh-base and bundle layers; pastel pink (#FADBD8) for user overlays and headless surface; dark gray (#4A4A4A) connectors.

STYLE: GPT Image 2 illustration in a polished Notion-like hand-drawn layered flowchart style. Rounded cards, simple stack and tree doodles, slight line wobble, generous whitespace, restrained pastel accents, no texture, no gradients, no logos, and no photorealism. Text is required, exact, large, prominent, readable, and article-specific. Render as a real PNG image, not SVG or programmatic vector artwork.

ASPECT: 16:9 landscape, medium information density.
