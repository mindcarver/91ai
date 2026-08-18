---
illustration_id: 05
type: flowchart
style: notion
generator: gpt-image-2
text_mode: required
---

一次对话在内部怎么跑 — Process Flow

Layout: A clear left-to-right process flowchart on a wide 16:9 canvas, with a loop-back arrow from tool/result to the next step. Use a large outer rounded frame for “turn” and smaller cards for each “step”. Keep the event gates visually distinct but simple.

STEPS:
1. “turn” begins — receive pending input.
2. “agent/pre-step” — a waterfall gate decides what the model sees.
3. “step” begins — assemble system prompt and tool schema.
4. Request model and stream response.
5. “tool/call” — if the model calls a tool, enter the tool execution pipeline.
6. “tool/result” — normalize and finalize the result, then loop to the next step if more reasoning is needed.
7. “turn 结束” — close only when nothing is owed.

CONNECTIONS: Use a bold main arrow for the normal path, a curved loop-back from tool/result to step, and a clean exit arrow to turn 结束. Do not add extra implementation details beyond the supplied labels.

LABELS: Title: “一次对话在内部怎么跑”. Step labels: “turn”, “step”, “agent/pre-step”, “tool/call”, “tool/result”, “turn 结束”. Takeaway: “模型可见即可重建”. Render these exact labels only; do not invent pseudo-text.

COLORS: White background (#FFFFFF); near-black outlines and text (#1A1A1A); pastel blue (#A8D4F0) for input and model steps; pastel yellow (#F9E79F) for agent/pre-step and tool gates; pastel pink (#FADBD8) for tool/result and turn end; dark gray (#4A4A4A) arrows.

STYLE: GPT Image 2 illustration in a polished Notion-like hand-drawn flowchart style. Rounded cards, lightly wobbled arrows, simple stream and tool doodles, generous white space, restrained pastel accents, no texture, no gradients, no photorealism. Text is required, exact, large, prominent, readable, and in the article language. Do not use fake characters or pseudo-text. Render as a real PNG image, not SVG or programmatic vector artwork.

ASPECT: 16:9 landscape, medium information density, suitable for a technical agent-loop explainer.
