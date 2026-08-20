---
illustration_id: 02
type: flowchart
style: notion
generator: gpt-image-2
---

标题「bin.ts：按 mode 分发」的中文流程图。

ZONES:
- 左侧输入卡 `process.argv` 进入 `parseDshArgs`。
- 中间是一个分流菱形 `invocation.mode`。
- 右侧三张并排卡片：`profile`、`plugin`、`dump-config`；突出蓝色路径 `dsh web → profile → runProfile`。
- 每张分支卡旁标出轻量 `await import` 图标，其他两路用浅灰色。
LABELS: 精确渲染标题「bin.ts：按 mode 分发」；「parseDshArgs」「profile」「plugin」「dump-config」「await import」；提示「web 只加载 profile 路径」。
COLORS: 白底、黑色手绘轮廓；profile 使用柔和蓝，其余分支淡黄、淡粉，浅灰辅助元素。
STYLE: GPT Image 2 生成真实 PNG；Notion 风格手绘流程图，圆角卡片、简洁箭头、大留白；中文文字清晰准确，不得伪文字或水印。
ASPECT: 16:9，横向。
