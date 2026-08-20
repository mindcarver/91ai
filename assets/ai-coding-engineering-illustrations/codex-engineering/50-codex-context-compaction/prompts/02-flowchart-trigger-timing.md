---
illustration_id: 02
type: flowchart
style: notion
generator: gpt-image-2
text_mode: required
---
压缩触发时机 - Process Flow
Layout: left to right with three branches converging into Compact.
STEPS: 1. 回合开始 - PreTurn 检查; 2. 模型采样后 - MidTurn 检查; 3. 模型切换 - 小窗口前先压缩; 4. token_limit_reached - 触发压缩; 5. continue - 压完继续循环.
CONNECTIONS: hand-drawn arrows, one warning diamond for threshold crossed.
LABELS: Title: 触发时机. Step labels: PreTurn, MidTurn, 模型切换, token_limit_reached. Takeaway: 每个回合前后都数 token.
STYLE: Notion hand-drawn flowchart, rounded cards, lightly wobbled arrows, white background, pastel warning color for threshold. Large readable Chinese text only.
ASPECT: 4:3.
