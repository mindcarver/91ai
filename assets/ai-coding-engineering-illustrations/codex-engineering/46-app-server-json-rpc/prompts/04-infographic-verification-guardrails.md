---
illustration_id: 04
type: infographic
style: notion
article: "Codex App Server 架构：用 JSON-RPC 管好 Thread、Turn 与审批"
position: "审批是反向 RPC"
---

Guardrail Infographic

Layout: one central shield surrounded by four independent verification gates.

ZONES:
- Center: protected execution boundary represented by a simple shield and check mark
- Upper left: permission gate represented by a keyhole icon
- Upper right: evidence gate represented by a document-and-check icon
- Lower left: isolation gate represented by nested boxes
- Lower right: recovery gate represented by a curved return arrow

CONNECTIONS: thin dashed lines connect each gate to the central shield; no arrows cross.

LABELS (semantic anchors from the article; use them to choose symbols, but DO NOT render any words or letters):
- 审批是反向 RPC
- id
- threadId
- turnId
- approvalsReviewer
- user
- auto_review
- 命令或文件修改需要用户审批时，App Server 不是发一条普通通知，而是向客户端发送带 id 的请求

COLORS:
- Pure white background #FFFFFF
- Near-black hand-drawn outlines #1A1A1A
- Pastel blue #A8D4F0 for primary emphasis
- Pastel yellow #F9E79F for transition or caution
- Pastel pink #FADBD8 for exceptions
- Pale mint #BFE3D0 and lavender #D8CFF0 for supporting modules

STYLE: Notion-like minimalist hand-drawn line art. Slight intentional wobble, rounded modular cards, sparse pastel fills, soft shadows, generous whitespace, simple conceptual icons, no logos, no realistic people, no robots, no decorative scenery. Absolutely no visible text, letters, numbers, code, product names, or pseudo-text in the image.
ASPECT: 16:9, clean knowledge-card composition.
