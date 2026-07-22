---
illustration_id: 02
type: framework
style: notion
article: "Codex App Server 架构：用 JSON-RPC 管好 Thread、Turn 与审批"
position: "App Server 不是把 CLI 输出换成 JSON"
---

Conceptual Framework

STRUCTURE: hierarchical hub-and-spoke arrangement with one central module and five surrounding cards.

NODES:
- Central node: the section's governing mechanism
- Five outer nodes: roles, state, tools, evidence, and boundaries inferred from the semantic anchors

RELATIONSHIPS: thin hand-drawn connectors show coordination without implying shared identity.

LABELS (semantic anchors from the article; use them to choose symbols, but DO NOT render any words or letters):
- App Server 不是把 CLI 输出换成 JSON
- codex
- "jsonrpc":"2.0"
- 2.0
- 终端包装器常见的第一版做法是启动 codex ，读取屏幕文字，再猜命令是否完成
- 这个方案看不到稳定的 Thread ID、结构化文件变更或服务端审批请求，也很难区分增量消息与最终结果
- Codex App Server 架构：用 JSON-RPC 管好 Thread、Turn 与审批

COLORS:
- Pure white background #FFFFFF
- Near-black hand-drawn outlines #1A1A1A
- Pastel blue #A8D4F0 for primary emphasis
- Pastel yellow #F9E79F for transition or caution
- Pastel pink #FADBD8 for exceptions
- Pale mint #BFE3D0 and lavender #D8CFF0 for supporting modules

STYLE: Notion-like minimalist hand-drawn line art. Slight intentional wobble, rounded modular cards, sparse pastel fills, soft shadows, generous whitespace, simple conceptual icons, no logos, no realistic people, no robots, no decorative scenery. Absolutely no visible text, letters, numbers, code, product names, or pseudo-text in the image.
ASPECT: 16:9, clean knowledge-card composition.
