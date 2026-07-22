---
illustration_id: 03
type: flowchart
style: notion
article: "Codex Security 架构：沙箱、审批、凭据、网络与项目边界"
position: "第一层：项目边界与受保护路径"
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

LABELS (semantic anchors from the article; use them to choose symbols, but DO NOT render any words or letters):
- 第一层：项目边界与受保护路径
- workspace-write
- /status
- .git
- .agents
- .codex
- Codex 根据当前工作目录和可写根定义项目范围
- 对于版本控制仓库，默认组合通常是 workspace-write 与按需审批

COLORS:
- Pure white background #FFFFFF
- Near-black hand-drawn outlines #1A1A1A
- Pastel blue #A8D4F0 for primary emphasis
- Pastel yellow #F9E79F for transition or caution
- Pastel pink #FADBD8 for exceptions
- Pale mint #BFE3D0 and lavender #D8CFF0 for supporting modules

STYLE: Notion-like minimalist hand-drawn line art. Slight intentional wobble, rounded modular cards, sparse pastel fills, soft shadows, generous whitespace, simple conceptual icons, no logos, no realistic people, no robots, no decorative scenery. Absolutely no visible text, letters, numbers, code, product names, or pseudo-text in the image.
ASPECT: 16:9, clean knowledge-card composition.
