---
illustration_id: 08
type: comparison
style: notion
generator: gpt-image-2
---

标题「Fiber 状态审计」的中文状态对比图。

ZONES:
- 横向三列状态卡：绿色 `ACTIVE`（正常）、红色 `FAILED`（原始错误栈）、黄色 `PENDING`（等待服务）。
- 三列底部的箭头汇聚到一张审计卡：`assertEntriesActivated`，并写结果规则。
- PENDING 卡中用一个小服务插头图标标示依赖等待。
LABELS: 精确渲染标题「Fiber 状态审计」；「ACTIVE」「FAILED」「PENDING」「waiting for service」「assertEntriesActivated」；提示「每个启用条目都必须 ACTIVE」。
COLORS: 白底、近黑描边；状态使用低饱和绿、红、黄，汇聚卡淡蓝。
STYLE: GPT Image 2 生成真实 PNG；Notion 风格中文技术对比图，手绘线、圆角卡、清晰标签、宽松留白；不得伪文字或水印。
ASPECT: 16:9，横向。
