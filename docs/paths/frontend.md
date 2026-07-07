# 前端学习路径

面向前端工程师、全栈偏前端开发者、设计工程师。

核心目标：把 AI 能力做成用户愿意使用的产品体验，而不是只会调用一个聊天接口。

## 推荐路线

| 阶段 | 学什么 | 产出 |
| --- | --- | --- |
| 1 | AI 编程 | 用 Cursor、Claude Code、Codex 或 Cline 完成真实前端改动 |
| 2 | AI 交互界面 | 聊天、命令面板、内联编辑、生成式表单、AI 辅助状态 |
| 3 | 流式体验 | 流式输出、取消、重试、部分失败、加载状态 |
| 4 | 结构化输出 | 把模型输出约束成 JSON、表单状态或 UI patch |
| 5 | 工具调用 | 让 AI 调用搜索、文件、设计系统、后端 API |
| 6 | 多模态 | 图片理解、截图分析、设计稿到代码 |
| 7 | 评测 | 对生成结果做可用性、准确性、回归和人工修正量评估 |

## 先看这些专题

- [AI 编程](../ai-coding/)
- [Agent 学习路径](../agent/)
- [设计与可视化工具](../project-collections/design-tools.md)
- [开发者工具与 AI Coding](../project-collections/developer-tools.md)

## 第一个项目

做一个 **流式 AI 界面 Demo**。

它应该包含：

- 流式回复。
- 停止生成。
- 重试。
- 错误状态。
- 引用或工具调用结果展示。
- 用户可编辑的最终结果。

## 推荐工具方向

| 方向 | 工具类型 |
| --- | --- |
| 日常开发 | AI IDE、CLI coding agent |
| UI 生成 | 设计到代码、组件生成、截图理解 |
| 交互体验 | streaming SDK、structured output、tool result rendering |
| 质量控制 | Storybook、visual diff、E2E、人工评审清单 |

## 避坑

- 不要只做一个聊天框。真实 AI 产品需要状态、错误、撤销和可编辑结果。
- 不要把模型输出直接当 UI 状态写入生产数据。
- 不要忽略 loading、partial result 和 tool failure。
- 不要让 AI 自动改设计系统基础组件而没有 review。
