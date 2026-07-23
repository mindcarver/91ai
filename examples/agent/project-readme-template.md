---
title: Agent 项目 README 模板
description: 用于说明 Agent 场景、架构、运行方式、评测证据和已知限制。
tags: [agent, project, readme, template]
---

# {Project Name}

一句话说明：这个 Agent 为谁解决什么问题。

## 场景

- 用户：
- 输入：
- 输出：
- 成功标准：
- 非目标：
- 人工接管点：

## 为什么需要 Agent

说明这个问题为什么不是一次普通模型调用或固定 workflow 就能稳定解决。如果可以用更简单的方案，请先选择更简单的方案。

## 快速运行

```bash
# 安装
{install-command}

# 配置
{config-command}

# 运行
{run-command}
```

环境：

- Python / Node：
- 模型：
- 关键依赖版本：
- 数据或权限前置条件：

## 架构

```mermaid
flowchart LR
  I["输入"] --> M["模型"]
  M --> T["工具"]
  T --> R["Trace"]
  R --> O["输出"]
  O --> H["人工确认"]
```

说明：

- 状态：
- 工具：
- 停止条件：
- 失败处理：
- 版本信息：

## 工具与权限

| 工具 | 读 / 写 | 数据范围 | 风险 | 人工确认 |
| --- | --- | --- | --- | --- |
| {tool-name} | {read/write} | {scope} | {risk} | {yes/no} |

完整工具边界见 [工具卡](./tool-card-template.md)。

## Trace 示例

成功运行：

```json
{success-trace}
```

失败运行：

```json
{failure-trace}
```

完整字段参考 [Trace Schema](./trace-schema.json)。

## 评测

评测用例：[eval-cases.jsonl](./eval-cases.jsonl)

| 指标 | 定义 | 样本范围 | 当前结果 |
| --- | --- | --- | --- |
| 任务完成率 | {definition} | {sample} | {result} |
| 工具参数正确率 | {definition} | {sample} | {result} |
| 安全阻断率 | {definition} | {sample} | {result} |
| 平均耗时 / 成本 | {definition} | {sample} | {result} |

说明：

- 评测版本：
- 运行日期：
- 失败分类：
- 修改前后对比：

## 已知限制与风险

- {limit-1}
- {limit-2}
- {risk-1}
- {human-review-boundary}

## 下一步

| 计划 | 为什么现在不做 | 进入条件 |
| --- | --- | --- |
| {next-step} | {tradeoff} | {evidence} |

## 可复现性声明

- [ ] 干净环境启动成功。
- [ ] 运行命令和版本已写明。
- [ ] 至少保存 3 次 trace。
- [ ] eval cases 覆盖正常、边界、失败和越权。
- [ ] 结果没有把未验证内容写成确定结论。
