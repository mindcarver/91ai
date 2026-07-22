---
illustration_id: 03
type: flowchart
style: notion
article: "Codex App Server 架构：用 JSON-RPC 管好 Thread、Turn 与审批"
position: "连接生命周期"
---

Process Flow

Layout: left-to-right flow with five rounded step cards.

STEPS:
1. trigger or input
2. prepare context
3. execute action
4. verify evidence
5. hand off, recover, or close

CONNECTIONS: solid arrows for the primary path and one dashed feedback loop from verification to preparation.

VISIBLE LABELS (render these exact short Chinese labels clearly; do not invent pseudo-text):
- 连接生命周期
- clientInfo.name
- thread/start
- thread/resume
- thread/fork
- thread/read
- item/started
- item/completed

COLORS:
- Pure white background #FFFFFF
- Near-black hand-drawn outlines #1A1A1A
- Pastel blue #A8D4F0 for primary emphasis
- Pastel yellow #F9E79F for transition or caution
- Pastel pink #FADBD8 for exceptions
- Pale mint #BFE3D0 and lavender #D8CFF0 for supporting modules

STYLE: GPT Image illustration in a polished Notion-like editorial style. White background, hand-drawn black line art, rounded modular cards, sparse pastel fills, subtle paper texture, soft shadows, generous whitespace, simple conceptual icons, no logos, no photorealism, no robots, no decorative scenery. Include only the supplied concise Chinese labels; typography must be clear, correctly spelled, and integrated into the information hierarchy. Create a distinct composition tailored to this section; do not imitate a repeated local template.
ASPECT: 16:9, clean knowledge-card composition.
