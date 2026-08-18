---
illustration_id: 04
type: flowchart
style: notion
generator: gpt-image-2
text_mode: required
---

profile + bundle = dsh — Process Flow

Layout: A top-down assembly flowchart on a wide 16:9 canvas. Start with one shared base card at the top, then branch into two clean vertical paths: web on the left and headless on the right. Add a thin patch layer crossing both paths near the bottom.

STEPS:
1. “dsh-base” — the shared base bundle containing model adapter, tools, session persistence, sandbox and approval policy.
2. Left branch “web” — add “dsh-web-app” and end in a simple browser-window doodle.
3. Right branch “headless” — add “dsh-headless” and end in a one-shot runner / terminal doodle.
4. Shared patch layer “patch” — a replaceable overlay that can rewrite or replace configuration registered below it.

CONNECTIONS: Use large lightly wobbled arrows from dsh-base to both branches. Use a bracket or overlay connector from patch to both branches. Avoid dense package lists and do not show a literal server room.

LABELS: Title: “profile + bundle = dsh”. Step labels: “web”, “headless”, “dsh-base”, “dsh-web-app”, “dsh-headless”, “patch”. Takeaway: “挂插件即可改行为”. Render exact labels only; do not invent pseudo-text.

COLORS: Pure white background (#FFFFFF); near-black outlines and text (#1A1A1A); pastel yellow (#F9E79F) for dsh-base; pastel blue (#A8D4F0) for web; pastel pink (#FADBD8) for headless; a soft gray outline and dark gray (#4A4A4A) for patch connectors.

STYLE: GPT Image 2 illustration in a polished Notion-like hand-drawn flowchart style. Rounded cards, simple browser and terminal doodles, large readable labels, clean arrows, generous whitespace, restrained pastel accents, no texture, no gradients, and no logos. Text is required and must be exact, article-specific, prominent, and free of fake characters or pseudo-text. Render as a real PNG image, not SVG or programmatic vector artwork.

ASPECT: 16:9 landscape, medium information density, suitable for a technical article workflow diagram.
