---
illustration_id: 09
type: flowchart
style: notion
generator: gpt-image-2
---

标题「启动失败也要可诊断」的中文失败处理流程图。

ZONES:
- 左侧红色错误卡进入 `ctx.fiber.dispose()` 清理卡。
- 上方并列两个带标签的错误分期卡：`host preparation failed` 与 `plugin tree failed to load`。
- 右侧是错误链 `cause` 卡和终端清理卡，后者配一个小计时器 `2000 ms`。
- 最右底部输出一张“清晰诊断”卡。
LABELS: 精确渲染标题「启动失败也要可诊断」；「host preparation failed」「plugin tree failed to load」「dispose」「cause」「2000 ms」；提示「清理有界，错误链保留」。
COLORS: 白色背景、黑色手绘轮廓；故障淡粉红，阶段卡淡黄，清理淡蓝，最终诊断淡绿。
STYLE: GPT Image 2 生成真实 PNG；Notion 风格技术流程图，简洁箭头、圆角知识卡、大量留白；英文与中文标签须精准清晰，无伪文字和水印。
ASPECT: 16:9，横向。
