# Loop Engineering 长文版：三篇深读，先读哪篇？

> 这是 loop-engineering 系列（[6 篇正文](../README.md)）的"加长版"。正文讲方法，这三篇各从一个角度把方法展开：统一判断、可照抄的落地物、一张认知地图。每篇约 1.5 万字，都补了联网调研拿到的硬证据（真实成本数字、70-95% 生产失败率、CLI 脚手架、maker/checker 证伪逻辑）。

## 先读哪篇？看你现在最想干什么

| 你现在的状态 | 先读 | 为什么 |
| --- | --- | --- |
| 想判断"这东西能不能上生产、真实代价多大" | [**A · 能停的 Loop 才敢上生产**](./01-production-readiness.md) | 信息密度最高：真实成本数字、70-95% 失败率、L0-L3 渐进上线、9 问 readiness 自检 |
| 想直接动手做出一条能跑的 loop | [**B · 从零搭出你的第一条 Loop**](./02-build-first-loop.md) | Claude Code 全流程：`loop-init` 脚手架 + 完整 SKILL.md/STATE.md/Actions 文件，跟着就能跑 |
| 想先搞懂这是什么、给团队讲清楚 | [**C · 从 Prompt 到 Loop**](./03-concept-panorama.md) | 认知地图：prompt→context→harness→loop 演进坐标 + 四代循环谱系 + 边界判别 |

**如果只读一篇：读 A。** 它把"loop 为什么是控制系统、真实代价、怎么从 L1 起步"一次讲透，是三篇里最该先建立的判断框架。读完你大概率会知道下一步该读 B 还是 C。

## 三种通读路线

- **判断优先（推荐）**：A → C → B。先建生产判断，再补演进全貌，最后落地。
- **理解优先**：C → A → B。先建认知地图，再谈生产，最后动手。
- **动手优先**：B → A → C。先做一条跑起来，遇到问题再回头看框架和全貌。

## 三篇各自讲什么

### [A · 能停的 Loop 才敢上生产](./01-production-readiness.md)

从单次会话到可托付的代理控制系统。

- **角度**：生产落地深度解析
- **给谁**：想把 loop 真正上生产的中高级工程师、要做选型决策的人
- **带走**：统一判断框架、真实 token/成本数字、maker/checker「done 是断言不是证明」、L0-L3 上线路径、9 问 readiness 自检

### [B · 从零搭出你的第一条 Loop](./02-build-first-loop.md)

Claude Code + Daily Triage 实战手册。

- **角度**：实操教程
- **给谁**：想跟着做出第一条能跑的 loop 的人
- **带走**：`npx loop-init` 脚手架、完整 SKILL.md/STATE.md/budget/run-log/Actions yaml、denylist + kill switch、升 L2 前的 checklist

### [C · 从 Prompt 到 Loop](./03-concept-panorama.md)

AI 编程 Agent 四代循环的演进全景。

- **角度**：概念全景综述
- **给谁**：想建立全局认知、对齐团队共识的技术 Leader
- **带走**：prompt→context→harness→loop 演进坐标、loop vs goal/workflow/harness 边界、ReAct→Loop 四代谱系、「三债」判别

## 和 6 篇正文什么关系

[6 篇正文](../README.md)（1 总览 + 5 主题）讲方法本身，紧凑；这三篇长文是加长深读，把方法展开成统一判断、落地手册、认知地图。

- 没读过系列，直接读长文也行，每篇都自带背景。
- 想看更紧凑的方法论，回 [系列总览](../README.md)。
