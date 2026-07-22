---
illustration_id: 02
type: framework
style: notion
article: "Claude Code Worktree 隔离：并行开发不互相覆盖的 Git 边界"
position: "路径一：给完整会话一个工作树"
---

Conceptual Framework

STRUCTURE: hierarchical hub-and-spoke arrangement with one central module and five surrounding cards.

NODES:
- Central node: the section's governing mechanism
- Five outer nodes: roles, state, tools, evidence, and boundaries inferred from the semantic anchors

RELATIONSHIPS: thin hand-drawn connectors show coordination without implying shared identity.

VISIBLE LABELS (render these exact short Chinese labels clearly; do not invent pseudo-text):
- 路径一：给完整会话一个工作树
- claude
- .claude/worktrees/feature-auth/
- worktree-feature-auth
- claude -p --worktree ...
- fresh
- 先在仓库中正常运行一次 claude 并接受 workspace trust，再启动隔离会话：
- bash

COLORS:
- Pure white background #FFFFFF
- Near-black hand-drawn outlines #1A1A1A
- Pastel blue #A8D4F0 for primary emphasis
- Pastel yellow #F9E79F for transition or caution
- Pastel pink #FADBD8 for exceptions
- Pale mint #BFE3D0 and lavender #D8CFF0 for supporting modules

STYLE: GPT Image illustration in a polished Notion-like editorial style. White background, hand-drawn black line art, rounded modular cards, sparse pastel fills, subtle paper texture, soft shadows, generous whitespace, simple conceptual icons, no logos, no photorealism, no robots, no decorative scenery. Include only the supplied concise Chinese labels; typography must be clear, correctly spelled, and integrated into the information hierarchy. Create a distinct composition tailored to this section; do not imitate a repeated local template.
ASPECT: 16:9, clean knowledge-card composition.
