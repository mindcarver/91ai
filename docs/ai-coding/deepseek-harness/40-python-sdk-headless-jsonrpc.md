# Python SDK、Headless 与 JSON-RPC：把 dsh 编进流水线

> `dsh` 不只有 Web UI，它有三种自动化姿势，headless 跑一次性任务，Python SDK 把 agent 当库调，JSON-RPC 是底层的 stdio 协议，三种都共享同一套 agent 组合，区别只在谁来驱动。
> 这一篇拆 `dsh --profile headless`、`deepseek-harness-sdk` Python 包、以及它们底层的 JSON-RPC runtime，看怎么把 agent 能力嵌进 CI、批处理、或你自己的程序。

## 三种自动化姿势

Web UI 是给人用的。当你需要把 `dsh` 嵌进自动化流程时，有三个选择，复杂度递增。

**Headless**（`dsh --profile headless`）：命令行一次性 runner。接一个任务字符串，创建全新会话，跑完，打印最终 assistant 文本，退出。最简单，适合"给我跑一个任务拿结果"的场景。

**Python SDK**（`deepseek-harness-sdk`）：把 `dsh` 当 Python 库用。`DeepSeekHarness` 类管理 runtime 生命周期，`Session.run()` 发任务收结果。适合需要在 Python 程序里编排 agent 的场景。

**JSON-RPC runtime**：底层协议。headless 和 Python SDK 底层都走 JSON-RPC stdio 和 runtime 通信。如果你用的不是 Python，可以直接实现这个协议的客户端。

三者共享同一套 agent 组合（Cordis 配置），区别只在谁来驱动 turns 和怎么收结果。

## Headless：一行命令跑完一个任务

这是最直接的自动化方式，跑一句 `pnpm dsh --profile headless "fix the failing test in this workspace"`。它做四件事：接收一个非空任务字符串，创建并持久化一个全新会话，打印最终 assistant 文本，退出。不开 server，不起 UI。

headless profile 的组合包含：DeepSeek V4 模型、本地 bash 和文件系统工具、subagent 委托、workflows、todo_write、JSONL 持久化。它显式挂载共享 agent spine、一个 root agent、持久化和 checkpoint 策略。

需要 `DEEPSEEK_API_KEY` 在环境或 repo 根目录的 `.env` 里。`DEEPSEEK_BASE_URL` 可选，默认用公开 API。

一个实用的变体是 E2B 远程沙箱 overlay。`e2b.cordis.yml` 把本地文件系统和子进程 provider 替换成一个共享的 E2B 沙箱，保留相同的模型可见工具。这样 agent 在远程沙箱里跑 FS、Bash、PTY、LSP，而 Cordis、模型调用、会话状态留在本地。但这只是一个 provider-composition POC，不是全 harness 迁移或 workspace-sync 功能。

## Python SDK：把 agent 当库用

Python SDK 是自动化集成的推荐方式，安装用 `python -m pip install deepseek-harness-sdk`。这个包会安装同版本的 `deepseek-harness-runtime-bin` 平台 wheel。**runtime 是捆绑的单文件可执行文件，目标机器不需要 Node.js。**

最简用法三步：从 `deepseek_harness` 包导入 `DeepSeekHarness` 类；用 `with DeepSeekHarness() as harness:` 建实例管理生命周期，块内调 `result = harness.run("Say hi.")` 发任务；退出块后 `print(result.final_response)` 取最终文本。

`DeepSeekHarness` 懒启动 runtime 子进程，跨调用复用。用 context manager 管理生命周期，或显式调 `close()`。

### 带配置的用法

如果你需要指定 provider、model、workspace、session，完整流程四步：

1. 用 `pathlib.Path` 准备三个绝对路径：`config` 是 `Path("examples/jsonrpc-agent/minimal.cordis.yml").resolve()`，`workspace` 和 `sessions` 分别对各自的目标目录 `Path(...).resolve()`。
2. 构造 `DeepSeekHarness`，六个关键字参数：`provider="deepseek-official"`、`model="deepseek-v4-flash"`、`max_tokens=49_152`、`cwd=str(workspace)`、`session_root=str(sessions)`、`cordis=str(config)`，三个路径都转成字符串。
3. 仍用 `with ... as harness:` 管理生命周期，`harness.run(...)` 这次带两个参数：任务字符串 `"Inspect the repository and fix the failing tests."` 和 `session_id="example-001"`。
4. 结果同样从 `result.final_response` 取最终文本。

`provider` 选择组合里注册的 provider route，`model` 是 adapter 解析的模型 id。`max_tokens` 是可选的正整数，root agent 及其进程内后代的单次请求输出 token 上限。`cordis` 指向你的 Cordis 配置文件。

### RunResult 的结构

`Session.run()` 返回 `RunResult`，包含：

- `session_id`：会话标识
- `final_response`：interval 内最后一条 committed 的 root-session assistant 文本
- `finish_reason`：interval 内最后一条 root-session `turn/end` 的 `kind`（如 `completed`、`max-tokens`、`error`），没有 turn 结束时为 None
- `events`：root-session 事件
- `notifications`：root session 和所有已知后代的通知，按 wire 顺序
- `session_root`：JSONL 会话目录

`final_response` 和 `finish_reason` 描述的是 owned interval，不是因果归因到 prompt 的输出或结束。steering、注入的 context 和其他排队的工作可能在 idle 前贡献。

## JSON-RPC runtime：stdio 协议

Python SDK 底层通过 JSON-RPC stdio 和 runtime 通信。这个协议是自动化的基础设施。

runtime（`dsh-jsonrpc-agent`）是一个 unattended coding-agent 组合。它**刻意不加载** terminal UI、console logger、approval UI、user-questions tool，因为 stdout 归 SDK 协议，turns 由 SDK 驱动。

模型可见的工具是精简的：bash（foreground only）、read/write/edit、subagent（一个 foreground in-process spawn provider）、todo_write。runtime 还加载 JSONL 会话持久化和自动上下文 compaction。

`maxTokensAsSuccess` 是一个评测相关的配置：它让 token-limited 的模型 turn 被当作可接受的评测结果，同时保留 `max-tokens` reason。设为 false 则报告为错误。

### 环境变量

runtime 继承正常的 `dsh` 环境变量：

| 变量 | 用途 |
|---|---|
| `DEEPSEEK_API_KEY` | 传给 OpenAI 兼容端点的凭证 |
| `DEEPSEEK_BASE_URL` | `dsh-llm-deepseek` 使用的端点 |
| `DSH_CWD` | agent 的 workspace |
| `DSH_MODEL` | `minimal.py` 的默认模型 |
| `DSH_SESSION_ROOT` | JSONL 会话目录 |
| `DSH_SYSTEM_PROMPT` | 部署提供的 coding persona |
| `DSH_MAX_TOKENS_AS_SUCCESS` | true（默认）接受 token-limited 结果 |

### 默认配置注入

当你不传 `cordis` 参数时，SDK 用捆绑的默认配置（`DSH_CORDIS_CONFIG` 注入）。这个默认配置包含：stdio JSON-RPC server、agent core、预加载的 DeepSeek adapter、JSONL 会话持久化、local bash。

如果你想跑自己的插件组合，在配置里保留 `@deepseek-ai/dsh-sdk-jsonrpc-server` 条目，然后传 Cordis 配置路径。一个自定义组合可以挂 `llm-pi-ai`，配置 provider 特定的凭证和端点，选择 pi-ai 安装目录里的任何 provider/model。

## workspace 和 session 隔离

自动化场景的隔离比交互场景更重要。两个维度：

**workspace 隔离。** `cwd` 选择 agent 可用的 workspace，`session_root` 存储会话日志和状态。两者在子进程启动前解析为绝对路径。

**session 隔离。** 用全新的 session_id 跑独立任务。复用同一个 session_id 只在下一次调用应该继续同一段持久对话时使用。复用同一个 harness 和 session id 会保留 session 拥有的 Bash 进程，包括工作目录、导出的变量和 shell 函数。

这和 ACP server 的设计哲学一致：每个 `session/new` 创建全新 agent，会话之间互不干扰。但 Python SDK 的方式更直接，不需要走 JSON-RPC 协议。

## 安全边界：danger-full-access

自动化组合通常用 `danger-full-access` 权限模式。这意味着 Bash 和编辑器可以修改 runtime 进程能访问的任何路径。

这是刻意的。自动化场景没有人在旁边审批，如果每次工具调用都要确认，流水线就卡住了。代价是：**只在一次性 checkout 或容器里跑这些组合。** 别在生产仓库或有敏感数据的机器上直接跑。

持久 PTY backend 需要 POSIX terminal 环境，所以这些组合不支持 Windows agent。在 Windows 上跑 Python SDK 需要用不依赖 PTY 的组合，或者在 WSL/Linux 容器里跑。

`minimal.cordis.yml` 是 Web `minimal` preset 的完整独立对应版本。它挂载本地 PTY、bare `fs-local` backend、danger-full-access 策略、未压缩 JSONL 持久化。模型可见工具恰好是：owner-scoped 持久 `bash` 和 `str_replace_editor`（view、create、str_replace、insert）。

## 权衡与局限

**Headless 是一次性的。** 每次跑都是一个新进程、一个新会话。不适合需要跨调用复用状态的场景。复用状态用 Python SDK。

**Python SDK 是子进程模型。** runtime 是一个子进程，通过 stdio 通信。这意味着 Python 进程崩溃时 runtime 也会被清理（context manager 退出时）。如果你需要跨进程的持久性，用 session 日志的 resume 能力。

**JSON-RPC 协议是 stdio 的。** 不适合远程调用（用 ACP 的 streamable-http 那条路）。stdio 限制了客户端和 runtime 必须在同一台机器上，通过子进程管道通信。

**自动化组合权限宽。** danger-full-access 意味着 agent 能做任何 runtime 进程能做的事。安全边界靠隔离环境（容器、一次性 checkout）保证，不靠权限策略。

**POSIX 限制。** 持久 PTY 需要 POSIX terminal。Windows 上不能直接跑这些组合。

**stdout 归协议。** JSON-RPC runtime 的 stdout 是协议通道。任何混入 stdout 的日志都会破坏协议。诊断信息走 stderr。

## 延伸阅读

- [Python SDK 教程](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/python-sdk.md)
- [Python SDK 参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/python/sdk/README.md)
- [jsonrpc-agent 示例](https://github.com/deepseek-ai/deepseek-harness/blob/master/examples/jsonrpc-agent/README.md)
- [headless-agent 示例](https://github.com/deepseek-ai/deepseek-harness/blob/master/examples/headless-agent/README.md)
- [SDK Runtime 参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/python/sdk-runtime/README.md)

上一篇：[给 dsh 写一个 Conversation Node：Web 自定义渲染](./39-write-a-conversation-node.md)
下一篇：[dsh Web 客户端：Chat Nodes 与多 agent 协议](./41-web-client-chat-nodes-multi-agent-protocol.md)
