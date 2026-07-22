---
illustration_id: 03
type: flowchart
style: notion
article: "Claude Code 记忆与强制规则：CLAUDE.md、Auto Memory、Subagent Memory 和 Hooks 如何分层"
position: "CLAUDE.md：人负责维护的公开约定"
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
- CLAUDE.md：人负责维护的公开约定
- @path
- CLAUDE.md 适合放团队希望每次会话都看见的事实：构建命令、目录边界、代码约定、审查流程
- 项目根文件在启动时加载，嵌套 CLAUDE.md 会在 Claude 读取对应子树文件时延迟加载
- Claude Code 记忆与强制规则：CLAUDE.md、Auto Memory、Subagent Memory 和 Hooks 如何分层

COLORS:
- Pure white background #FFFFFF
- Near-black hand-drawn outlines #1A1A1A
- Pastel blue #A8D4F0 for primary emphasis
- Pastel yellow #F9E79F for transition or caution
- Pastel pink #FADBD8 for exceptions
- Pale mint #BFE3D0 and lavender #D8CFF0 for supporting modules

STYLE: GPT Image illustration in a polished Notion-like editorial style. White background, hand-drawn black line art, rounded modular cards, sparse pastel fills, subtle paper texture, soft shadows, generous whitespace, simple conceptual icons, no logos, no photorealism, no robots, no decorative scenery. Include only the supplied concise Chinese labels; typography must be clear, correctly spelled, and integrated into the information hierarchy. Create a distinct composition tailored to this section; do not imitate a repeated local template.
ASPECT: 16:9, clean knowledge-card composition.
