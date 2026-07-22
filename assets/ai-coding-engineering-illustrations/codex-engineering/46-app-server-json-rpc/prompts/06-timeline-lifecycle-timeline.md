---
illustration_id: 06
type: timeline
style: notion
article: "Codex App Server 架构：用 JSON-RPC 管好 Thread、Turn 与审批"
position: "状态恢复与幂等"
---

Chronological View

DIRECTION: horizontal from left to right.

EVENTS:
- initial state
- task start
- active execution
- interruption or decision point
- recovery and verification
- retained result

MARKERS: six distinct hand-drawn milestone symbols connected by one gently curved line.

VISIBLE LABELS (render these exact short Chinese labels clearly; do not invent pseudo-text):
- 状态恢复与幂等
- thread/read
- thread/resume
- turn/start
- clientUserMessageId
- turn/interrupt
- turn/completed
- 客户端数据库至少保存 Thread ID、最后已完成 Turn ID、当前 cwd、客户端版本和 schema 版本

COLORS:
- Pure white background #FFFFFF
- Near-black hand-drawn outlines #1A1A1A
- Pastel blue #A8D4F0 for primary emphasis
- Pastel yellow #F9E79F for transition or caution
- Pastel pink #FADBD8 for exceptions
- Pale mint #BFE3D0 and lavender #D8CFF0 for supporting modules

STYLE: GPT Image illustration in a polished Notion-like editorial style. White background, hand-drawn black line art, rounded modular cards, sparse pastel fills, subtle paper texture, soft shadows, generous whitespace, simple conceptual icons, no logos, no photorealism, no robots, no decorative scenery. Include only the supplied concise Chinese labels; typography must be clear, correctly spelled, and integrated into the information hierarchy. Create a distinct composition tailored to this section; do not imitate a repeated local template.
ASPECT: 16:9, clean knowledge-card composition.
