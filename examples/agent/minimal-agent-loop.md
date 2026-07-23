---
title: 最小 Agent 循环模板
description: 用一个受控循环实现 observe、plan、act、stop，并保留可解释的运行轨迹。
tags: [agent, loop, template]
---

# 最小 Agent 循环模板

下面的伪代码刻意不绑定框架。先确认任务边界、工具权限、状态变化和停止条件，再选择 SDK 或框架。

```python
def run_agent(task, tools, model, limits):
    state = {
        "task": task,
        "steps": [],
        "status": "running",
    }

    for step_index in range(limits.max_steps):
        observation = observe(state)
        decision = model.decide(
            task=state["task"],
            observation=observation,
            allowed_tools=tools.allowed_schemas(),
        )

        if decision.kind == "final":
            state["status"] = "completed"
            state["answer"] = decision.output
            break

        if decision.kind != "tool_call":
            state["status"] = "failed"
            state["stop_reason"] = "invalid_decision"
            break

        tool = tools.get(decision.tool_name)
        if tool is None or not tools.is_allowed(tool, state):
            state["status"] = "stopped"
            state["stop_reason"] = "permission_denied"
            break

        result = tool.run(
            arguments=decision.arguments,
            timeout=limits.tool_timeout,
        )

        state["steps"].append({
            "step_index": step_index,
            "action": decision,
            "observation": result,
        })

        if result.is_error:
            state["status"] = "failed"
            state["stop_reason"] = "tool_error"
            break

    else:
        state["status"] = "stopped"
        state["stop_reason"] = "max_steps"

    return state
```

## 必须补齐的边界

| 边界 | 最小要求 |
| --- | --- |
| 最大步数 | 超过上限就停止，不让循环无限运行 |
| 工具权限 | 只暴露当前任务需要的工具 |
| 参数校验 | 工具执行前校验必填字段和数据范围 |
| 超时 | 工具和模型都要有超时 |
| 失败返回 | 错误要进入 observation 或 stop_reason |
| 副作用 | 写操作默认需要人工确认或在初版禁用 |
| trace | 每一步保存 action、arguments、observation 和结果 |
| 最终状态 | completed、failed、stopped 等状态可区分 |

## 不要把什么塞进这个模板

- 不要把整个业务流程都交给模型自由决定。
- 不要用“请谨慎操作”替代权限校验。
- 不要只保留最后答案。
- 不要让工具错误被吞掉后继续执行。
- 不要把重试次数、成本和停止条件写成不可观察的隐式行为。

配套的工具边界见 [工具卡模板](./tool-card-template.md)，运行记录字段见 [Trace Schema](./trace-schema.json)，评测用例见 [eval cases](./eval-cases.jsonl)。
