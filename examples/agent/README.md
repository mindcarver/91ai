---
title: Agent 可复用模板
description: 第一个 Agent 项目所需的最小循环、工具卡、trace、评测用例和 README 模板。
tags: [agent, examples, templates]
---

# Agent 可复用模板

这些模板不是框架，也不是生产级实现。它们只负责把一个 Agent 项目最容易遗漏的证据先固定下来。

## 模板清单

| 模板 | 用途 |
| --- | --- |
| [最小 Agent 循环](./minimal-agent-loop.md) | 明确 observe → plan → act → stop 的伪代码和边界 |
| [工具卡](./tool-card-template.md) | 记录工具 schema、权限、失败处理和副作用 |
| [Trace Schema](./trace-schema.json) | 统一一次运行的输入、步骤、停止原因和结果字段 |
| [评测用例](./eval-cases.jsonl) | 用 JSONL 保存正常、边界、失败和越权样例 |
| [项目 README](./project-readme-template.md) | 把场景、架构、证据、限制和运行方式交付出来 |

## 推荐使用顺序

1. 复制 [项目 README 模板](./project-readme-template.md)，先填场景、非目标和完成标准。
2. 复制 [工具卡](./tool-card-template.md)，删掉暂时不用的工具。
3. 按 [最小 Agent 循环](./minimal-agent-loop.md) 实现第一个版本。
4. 用 [Trace Schema](./trace-schema.json) 保存至少三次运行。
5. 用 [评测用例](./eval-cases.jsonl) 做第一次回归。
6. 回到 README，写清失败、限制和下一步。

这些产物对应 [第一个 Agent 项目契约](../../docs/agent/getting-started/04-first-project-contract.md)，而不是额外的流程负担：它们是为了让别人可以理解、运行和质疑你的结果。
