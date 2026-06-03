# Codex SDK 编程接入：用 Python 控制 Codex Agent

> TL;DR：`openai-codex` Python SDK 以编程方式调用 Codex 的 app-server JSON-RPC v2 协议，让你在脚本、CI pipeline、批处理工具中直接使用 Codex 的 agent 能力。SDK 封装了 app-server 的启动、线程管理、turn 控制和事件流，提供同步和异步两套 API。本文覆盖安装认证、线程与 turn 模型、流式处理、错误重试、结构化输出、批处理实战，以及 SDK 和 CLI 的区别。

---

## 1. 为什么需要 SDK 而不是 CLI

Codex CLI 的 TUI 交互和 `codex exec` 非交互模式覆盖了大多数使用场景。但有些需求它们满足不了：

- **CI pipeline 集成但不使用 GitHub Actions**：比如 GitLab CI、Jenkins、Buildkite
- **多轮对话编排**：在一次执行中跑多个 turn，根据上一步的输出决定下一步
- **流式处理**：边接收 Codex 的输出边做处理（进度条、实时写入文件、转发到 WebSocket）
- **批处理**：对 100 个仓库分别跑同一套 Codex 分析，汇总结果
- **自定义工具链**：把 Codex 嵌入到你自己的 CLI 工具、Web 服务或桌面应用中

`openai-codex` SDK 解决的就是这些问题。它的本质是一个 Python 客户端，通过 stdio 和 `codex app-server` 通信，使用 JSON-RPC v2 协议。SDK 在内部管理 app-server 进程的启动和关闭，对外暴露 Pythonic 的 API。

一个关键区别：SDK 不是直接调用 OpenAI 的 HTTP API。它启动一个本地的 `codex app-server` 进程，通过 stdio 交换 JSON-RPC 消息。这意味着你需要在运行环境中安装 Codex CLI（或 SDK 自带的 `openai-codex-cli-bin` 运行时包）。

SDK 目前是实验性的（experimental），API 可能会在正式发布前调整。但它已经足够稳定，可以在生产脚本中使用。

## 2. 安装与认证

### 安装

```bash
pip install openai-codex
```

SDK 包 `openai-codex` 会自动拉取 `openai-codex-cli-bin` 运行时依赖，这个包携带了平台特定的 Codex 二进制文件。SDK 版本号和运行时版本号保持一致。

要求：Python >= 3.10。

从源码安装（开发用）：

```bash
cd sdk/python
uv sync
source .venv/bin/activate
```

### 认证

SDK 复用已有的 Codex 认证状态。如果你之前用 `codex login` 登录过 ChatGPT 账号，SDK 会直接使用那个状态。你也可以在代码中显式认证。

**API Key 认证**（推荐用于自动化场景）：

```python
from openai_codex import Codex

with Codex() as codex:
    codex.login_api_key("sk-...")
    account = codex.account()
    print(account.account)
```

`login_api_key` 是同步调用，传入 key 后立即生效。

**ChatGPT 浏览器登录**（适合需要 ChatGPT 订阅额度的场景）：

```python
with Codex() as codex:
    login = codex.login_chatgpt()
    print("Open this URL:", login.auth_url)
    completed = login.wait()       # 阻塞等待用户完成登录
    print("Success:", completed.success)
```

`login_chatgpt()` 返回一个 `ChatgptLoginHandle`，你需要打开 `auth_url` 在浏览器中完成登录，然后 `wait()` 会阻塞直到收到登录完成事件。`cancel()` 可以取消正在进行的登录。

**设备码登录**（适合无浏览器环境）：

```python
with Codex() as codex:
    login = codex.login_chatgpt_device_code()
    print("Visit:", login.verification_url)
    print("Code:", login.user_code)
    completed = login.wait()
```

设备码登录在终端中显示一个 URL 和一个短代码，你在任意设备上打开 URL 输入代码即可完成认证。

## 3. 核心概念：线程与 Turn

SDK 的 API 围绕两个核心概念展开：**线程（Thread）** 和 **Turn**。

**Thread** 是一次对话的状态容器。一个 Thread 包含多个 Turn，每个 Turn 是一次模型执行。Thread 会被持久化到磁盘，你可以在后续的代码执行中恢复它。

**Turn** 是 Thread 中的一次交互。通常从一条用户消息开始，到模型的最终回复结束。每个 Turn 包含多个 Item（用户消息、agent 思考、agent 回复、shell 命令、文件编辑等）。

心智模型：Thread = 一段聊天记录，Turn = 聊天记录中的一轮问答。

### 基本用法

```python
from openai_codex import Codex

with Codex() as codex:
    # 创建一个线程，指定模型和配置
    thread = codex.thread_start(
        model="gpt-5.4",
        config={"model_reasoning_effort": "high"},
    )
    # 运行一个 turn，传入提示文本
    result = thread.run("Summarize this repository in three bullets.")
    print(result.final_response)
```

`thread.run()` 接受纯字符串作为输入，内部转换为 `TextInput`。它启动一个 turn，消费所有事件直到完成，返回 `TurnResult`。

### TurnResult 的结构

```python
@dataclass
class TurnResult:
    id: str                      # turn 的唯一标识
    status: TurnStatus           # completed / failed / cancelled
    error: TurnError | None      # 失败时的错误信息
    started_at: int | None        # 开始时间戳
    completed_at: int | None      # 完成时间戳
    duration_ms: int | None       # 执行时长（毫秒）
    final_response: str | None    # 最终的文本回复
    items: list[ThreadItem]      # 该 turn 中的所有 item
    usage: ThreadTokenUsage | None  # token 使用量
```

`final_response` 在 turn 没有产生 `final-answer` 类型的 assistant 消息时为 `None`。大多数情况下它会包含模型的最终文本输出。

### 多轮对话

```python
from openai_codex import Codex

with Codex() as codex:
    thread = codex.thread_start(
        model="gpt-5.4",
        config={"model_reasoning_effort": "high"},
    )

    # 第一轮：让 Codex 分析代码
    first = thread.run("List all public functions in src/api/routes.py.")
    print("Analysis:", first.final_response)

    # 第二轮：基于上一轮的结果继续
    second = thread.run("Now add docstrings to each function.")
    print("Result:", second.final_response)
```

多个 `thread.run()` 在同一个 Thread 上执行时，Codex 会保留之前的对话上下文。第二轮能"看到"第一轮的分析结果。

### 恢复已有线程

```python
THREAD_ID = "thr_abc123"

with Codex() as codex:
    thread = codex.thread_resume(THREAD_ID)
    result = thread.run("Continue from where we left off.")
    print(result.final_response)
```

`thread_resume` 从磁盘加载已有的 Thread 状态，继续对话。Thread ID 可以从 `thread.id` 获取。

## 4. 流式处理与 Turn 控制

对于需要实时反馈的场景（进度条、流式写入、转发到 WebSocket），使用 `thread.turn()` 获取 `TurnHandle`，然后调用 `stream()`。

### 流式事件处理

```python
from openai_codex import Codex

with Codex() as codex:
    thread = codex.thread_start(model="gpt-5.4")

    turn = thread.turn("Explain SIMD in 3 short bullets.")

    for event in turn.stream():
        if event.method == "turn/started":
            print("[started]")
        elif event.method == "item/agentMessage/delta":
            delta = event.payload.delta
            if delta:
                print(delta, end="", flush=True)
        elif event.method == "turn/completed":
            print(f"\n[completed: {event.payload.turn.status.value}]")
```

流式事件的关键方法：

| 事件方法 | 含义 |
|---------|------|
| `turn/started` | turn 开始执行 |
| `item/started` | 一个 item（消息、命令、编辑等）开始 |
| `item/agentMessage/delta` | agent 消息的增量文本 |
| `item/completed` | 一个 item 完成 |
| `turn/completed` | turn 完成，包含最终状态和 token 使用量 |

### 中断 Turn

```python
turn = thread.turn("Perform a long-running analysis...")

# 根据条件中断
if some_condition:
    turn.interrupt()
    print("Turn interrupted")
```

### Turn 内追加输入（Steer）

```python
turn = thread.turn("Analyze the codebase structure.")

# 追加额外指令
turn.steer("Focus only on the API layer, skip frontend code.")
```

`steer()` 在 turn 运行过程中注入新输入，相当于"纠正方向"。适用于长任务中需要追加约束的场景。

## 5. 错误处理与重试

### 错误类型

SDK 定义了几种 JSON-RPC 错误类型：

```python
from openai_codex import (
    JsonRpcError,          # 通用 JSON-RPC 错误
    MethodNotFoundError,     # 方法不存在（通常是版本不匹配）
    InvalidParamsError,    # 参数错误
    ServerBusyError,       # 服务过载（可重试）
    is_retryable_error,     # 判断错误是否可重试
)
```

### 重试机制

`retry_on_overload` 提供了带指数退避和抖动的重试逻辑，只对 `ServerBusyError` 生效：

```python
from openai_codex import (
    Codex,
    ServerBusyError,
    retry_on_overload,
)
from openai_codex.types import TurnStatus

with Codex() as codex:
    thread = codex.thread_start(model="gpt-5.4")

    try:
        result = retry_on_overload(
            lambda: thread.turn("Analyze the code.").run(),
            max_attempts=3,
            initial_delay_s=0.25,
            max_delay_s=2.0,
        )
    except ServerBusyError as exc:
        print("Server overloaded after retries:", exc.message)
    else:
        if result.status == TurnStatus.failed:
            print("Turn failed:", result.error)
        else:
            print("Result:", result.final_response)
```

不要盲目重试所有错误。`InvalidParamsError` 和 `MethodNotFoundError` 通常是代码问题，重试不会解决。

## 6. 结构化输出

`codex exec --output-schema` 的 SDK 对应物是 `output_schema` 参数：

```python
import json
from openai_codex import Codex

SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "actions": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": ["summary", "actions"],
    "additionalProperties": False,
}

with Codex() as codex:
    thread = codex.thread_start(model="gpt-5.4")
    turn = thread.turn(
        "Analyze the migration plan and return JSON matching the schema.",
        output_schema=SCHEMA,
    )
    result = turn.run()

    structured = json.loads(result.final_response.strip())
    print("Summary:", structured["summary"])
    for action in structured["actions"]:
        print("-", action)
```

结构化输出让你拿到可解析的 JSON 而不是自由文本。适合需要后续程序处理的场景。

## 7. 沙箱控制

SDK 支持在每个 thread 和每个 turn 上设置沙箱策略：

```python
from openai_codex import Codex, Sandbox

with Codex() as codex:
    # Thread 级别：workspace-write 沙箱
    thread = codex.thread_start(sandbox=Sandbox.workspace_write)

    # 正常 turn：继承 thread 的沙箱
    thread.run("Make the requested code changes.")

    # 特定 turn：覆盖为只读
    review = thread.run(
        "Review the changes you just made.",
        sandbox_policy=Sandbox.read_only,
    )
```

沙箱枚举值：

| 值 | 含义 |
|---|------|
| `Sandbox.read_only` | 只读，不能写文件或访问网络 |
| `Sandbox.workspace_write` | 可在当前 workspace 内写文件，无网络 |
| `Sandbox.danger_full_access` | 完全访问，无任何限制 |

线程级别的 `sandbox` 参数设置初始策略，turn 级别的 `sandbox_policy` 参数覆盖该 turn 的策略。

## 8. 异步 API

`AsyncCodex` 提供了与 `Codex` 完全对称的异步接口：

```python
import asyncio
from openai_codex import AsyncCodex

async def main():
    async with AsyncCodex() as codex:
        thread = await codex.thread_start(
            model="gpt-5.4",
            config={"model_reasoning_effort": "high"},
        )
        result = await thread.run("Explain async/await in Python.")
        print(result.final_response)

asyncio.run(main())
```

`AsyncCodex` 延迟初始化——在 `async with` 入口时才启动 app-server。这和 `Codex` 的立即初始化不同（`Codex()` 在 `__init__` 中就启动 app-server）。

异步流式处理：

```python
async def stream_example():
    async with AsyncCodex() as codex:
        thread = await codex.thread_start(model="gpt-5.4")
        turn = await thread.turn("Analyze the codebase.")

        async for event in turn.stream():
            if event.method == "item/agentMessage/delta":
                delta = event.payload.delta
                if delta:
                    print(delta, end="", flush=True)
            elif event.method == "turn/completed":
                print(f"\nDone: {event.payload.turn.status.value}")

asyncio.run(stream_example())
```

一个 `AsyncCodex` 实例可以同时消费多个 turn 的事件流。Turn 流按 turn ID 路由，互不干扰。

## 9. 实战案例：批量代码审查

场景：你的团队有 20 个微服务仓库，需要用 Codex 对每个仓库做一轮安全审查并生成报告。

```python
"""Batch security review across multiple repositories."""
import json
import os
from pathlib import Path
from openai_codex import Codex, ServerBusyError, retry_on_overload

REPOS = [
    "/data/repos/service-auth",
    "/data/repos/service-payment",
    "/data/repos/service-notification",
    "/data/repos/service-user",
    "/data/repos/service-gateway",
]

PROMPT = """Review this codebase for security issues.
Focus on:
1. Hardcoded secrets or credentials
2. SQL injection vulnerabilities
3. Missing input validation
4. Insecure dependency versions

Output a JSON object with this schema:
{
  "findings": [{"severity": "high|medium|low", "file": "...", "line": N, "description": "..."}],
  "summary": "..."
}
"""

def review_repo(codex, repo_path):
    """Review a single repository."""
    thread = codex.thread_start(
        model="gpt-5.4",
        config={"model_reasoning_effort": "high"},
        cwd=repo_path,
        sandbox=Sandbox.read_only,
    )

    try:
        result = retry_on_overload(
            lambda t=thread: t.run(PROMPT),
            max_attempts=3,
            initial_delay_s=1.0,
            max_delay_s=5.0,
        )
    except ServerBusyError:
        return {"repo": repo_path, "error": "server_overloaded"}

    try:
        findings = json.loads(result.final_response.strip())
    except (json.JSONDecodeError, AttributeError):
        findings = {"summary": result.final_response or "no output", "findings": []}

    return {"repo": repo_path, **findings}


def main():
    all_results = []

    with Codex() as codex:
        for repo_path in REPOS:
            print(f"Reviewing: {repo_path}")
            result = review_repo(codex, repo_path)

            # 统计发现数
            count = len(result.get("findings", []))
            print(f"  Found {count} issues")

            all_results.append(result)

    # 输出汇总报告
    output_path = Path("security-review-report.json")
    output_path.write_text(json.dumps(all_results, indent=2))
    print(f"\nReport saved to {output_path}")

    # 按严重程度汇总
    severity_counts = {"high": 0, "medium": 0, "low": 0}
    for result in all_results:
        for finding in result.get("findings", []):
            sev = finding.get("severity", "low")
            severity_counts[sev] = severity_counts.get(sev, 0) + 1

    print(f"\nSummary: {severity_counts}")
    print(f"Total repos reviewed: {len(all_results)}")


if __name__ == "__main__":
    main()
```

### 代码要点

- **每个仓库一个新 Thread**：用 `cwd=repo_path` 指定工作目录，Codex 在该目录下分析代码
- **`Sandbox.read_only`**：审查只读代码，不修改任何东西
- **`retry_on_overload`**：处理 OpenAI API 过载的情况
- **JSON 输出**：用 prompt 约束 Codex 输出结构化 JSON，便于后续处理

## 10. SDK vs CLI 对照

| 维度 | CLI (`codex exec`) | SDK (`openai-codex`) |
|------|-------------------|---------------------|
| 交互方式 | 命令行，一次性执行 | Python 代码，可编程控制 |
| 多轮对话 | 需要手动管理 session | `thread.run()` 天然支持 |
| 流式输出 | 终端打印 | 事件驱动，可自定义处理 |
| 错误处理 | 退出码 + stderr | Python 异常 + 重试机制 |
| 批处理 | shell 循环 + 调用 | 原生 Python 循环 |
| 沙箱控制 | `--sandbox` 参数 | `sandbox` 参数，可按 turn 调整 |
| 结构化输出 | `--output-schema` 文件 | `output_schema` 参数，直接在内存中处理 |
| 线程恢复 | `codex resume` | `thread_resume(thread_id)` |
| 适用场景 | 快速一次性任务、shell 脚本集成 | 复杂编排、自定义工具、批处理 |

一个实用的选择标准：如果你能在 shell one-liner 里表达完整需求，用 CLI。如果你需要条件分支、循环、错误恢复、结果聚合，用 SDK。

## 11. 常见问题

**`Codex()` 构造函数失败怎么办？**

`Codex()` 在 `__init__` 中就启动 app-server 并执行 `initialize`。常见失败原因：
- `openai-codex-cli-bin` 运行时包未安装
- 本地 `codex_bin` 覆盖指向了不存在的文件
- app-server 版本和 SDK schema 版本不匹配

**Turn 一直"挂住"是什么原因？**

Turn 只有在收到 `turn/completed` 事件时才算完成。如果你用 `stream()` 手动消费事件，必须持续消费直到收到 `turn/completed`。用 `run()` 的话它会自动等待。

**`final_response` 为 `None` 怎么办？**

当 turn 完成时没有产生 `final-answer` 或无阶段的 assistant 消息时，`final_response` 为 `None`。检查 `result.items` 是否有内容，或者检查 `result.status` 是否为 `failed`。

**同步和异步客户端怎么选？**

如果你的应用本身就是异步的（FastAPI、asyncio），用 `AsyncCodex`。否则用 `Codex`。两者 API 形状完全对称，迁移成本低。

**SDK 可以在没有网络的环境中使用吗？**

可以，但需要提前登录缓存认证状态。SDK 启动 app-server 后，如果已有缓存的有效认证，不需要网络。但如果认证过期或首次使用，需要网络连接。

## 12. 下一步

- 从 `examples/` 目录中找到和你需求匹配的示例，直接运行测试效果
- 把批量审查脚本集成到你的 CI pipeline 中（GitLab CI、Jenkins 等）
- 用 `thread.turn().stream()` 构建实时进度展示的 CLI 工具
- 阅读本系列下一篇：《Codex App Server 模式：远程连接与团队共享》

---

**延伸阅读**

- [openai-codex SDK 仓库](https://github.com/openai/codex/tree/main/sdk/python) — 源码、示例和 Jupyter walkthrough
- [SDK API Reference](https://github.com/openai/codex/blob/main/sdk/python/docs/api-reference.md) — 完整的方法签名和行为说明
- [SDK Getting Started](https://github.com/openai/codex/blob/main/sdk/python/docs/getting-started.md) — 从安装到多轮对话的快速路径
- [SDK FAQ](https://github.com/openai/codex/blob/main/sdk/python/docs/faq.md) — 常见问题和陷阱
- [Codex app-server 协议](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) — SDK 底层通信协议的完整文档
