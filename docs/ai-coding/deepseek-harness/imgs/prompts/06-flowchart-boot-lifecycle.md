---
illustration_id: 06
type: flowchart
style: notion
generator: gpt-image-2
---

标题「boot() 的六步启动」的中文流程图。

ZONES:
- 一条左到右的六步流程，六张编号圆角卡：`new Context`、`baseUrl`、`Loader`、`prepare`、`mountRootInclude`、`loader.await + 审计`。
- 在 `prepare` 卡上方放一个小注释，强调它位于条目挂载之前。
- 结束处为绿色稳定树形图标。
LABELS: 精确渲染标题「boot() 的六步启动」；「new Context」「Loader」「prepare」「mountRootInclude」「loader.await」「审计」；提示「prepare 必须早于条目挂载」。
COLORS: 白色背景、近黑线条；六步采用柔和蓝黄粉交替，prepare 以淡紫突出，成功标记绿色。
STYLE: GPT Image 2 生成真实 PNG；Notion 风格手绘技术流程图，清晰箭头、模块化卡片、中文与代码标签准确可读、无伪文字、无水印。
ASPECT: 16:9，横向。
