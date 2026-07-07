# Agent SDK 高阶

> 更新日期：2025/06

**TL;DR：** Agent SDK 的基础用法是发一条 prompt 拿一个结果。高阶用法包括：用 session 管理多轮对话上下文、用 structured output 拿到 JSON 格式的结构化响应、用 @tool 装饰器定义自定义工具、通过 MCP 协议集成外部服务、用 hooks 拦截生命周期事件、用 permission handler 控制工具调用权限。这些能力让你能构建真正的生产级 Agent 应用。

## 为什么这很重要

用 `query()` 发一条 prompt、拿到一个结果，这是 Agent SDK 的 hello world。它已经比直接调用 Claude API 方便很多——你不需要自己管理工具调用循环、不需要自己解析 tool_use 块。

但真实的应用场景远不止一次调用。你需要多轮对话、需要结构化输出、需要让 Agent 调用你自己的业务逻辑、需要控制它能做什么不能做什么。这些就是 Agent SDK 的高阶能力。

理解这些能力不是为了炫技。是因为你的 Agent 要从"能跑"变成"能上生产"，这些是绕不过去的。

## Sessions 管理

Session 是 Agent SDK 里多轮对话的基础。一个 session 自动维护对话历史，后续的 query 能看到前面的上下文。

### ClaudeSDKClient 方式

`ClaudeSDKClient` 提供了持久的连接，适合需要连续多轮交互的场景：

```python
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AssistantMessage, TextBlock

async with ClaudeSDKClient() as client:
    # 第一轮
    await client.query("项目的认证模块在哪？")
    async for message in client.receive_response():
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    print(block.text)

    # 第二轮 —— 自动记住上一轮的上下文
    await client.query("那个模块用的是什么认证方案？")
    async for message in client.receive_response():
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    print(block.text)
```

每次 `query()` 发送的消息都会追加到 session 的历史里。Agent 回答"那个模块"时知道你指的是上一轮提到的认证模块。

### query() 的 continue 方式

如果你不想维护 client 连接，可以用 `continue_conversation` 参数：

```python
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage

# 第一次调用
async for message in query(
    prompt="解释认证流程",
    options=ClaudeAgentOptions(max_turns=1, allowed_tools=["Read", "Grep"]),
):
    if isinstance(message, ResultMessage):
        print(message.result)

# 继续同一对话
async for message in query(
    prompt="解释授权流程",
    options=ClaudeAgentOptions(continue_conversation=True, max_turns=1),
):
    if isinstance(message, ResultMessage):
        print(message.result)
```

### Session 恢复

你可以保存 session ID，之后恢复对话：

```python
# 用自定义 session ID 创建
options = ClaudeAgentOptions(
    session_id="550e8400-e29b-41d4-a716-446655440000"
)

# 之后恢复这个 session
options = ClaudeAgentOptions(
    resume="550e8400-e29b-41d4-a716-446655440000"
)
```

这对需要跨进程、跨时间保持对话状态的应用很有用。比如一个代码审查 bot，用户上午问了一半，下午回来继续。

## Structured Output

默认情况下 Agent 返回的是文本。但很多时候你需要的是结构化数据——一个 JSON 对象，字段和类型都是确定的。

Agent SDK 通过 `output_format` 参数支持 JSON Schema 验证的输出：

```python
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage

schema = {
    "type": "object",
    "properties": {
        "file_count": {"type": "number"},
        "has_tests": {"type": "boolean"},
        "test_file_count": {"type": "number"},
    },
    "required": ["file_count", "has_tests"],
}

options = ClaudeAgentOptions(
    output_format={"type": "json_schema", "schema": schema},
    permission_mode="acceptEdits",
)

result_message = None
async for message in query(
    prompt="统计 src/ 下有多少 Python 文件，有没有测试文件",
    options=options,
):
    if isinstance(message, ResultMessage):
        result_message = message

# 结构化输出在 structured_output 字段里
print(result_message.structured_output)
# {"file_count": 12, "has_tests": true, "test_file_count": 3}
```

Agent 的响应会被强制匹配你定义的 schema。如果 Agent 的回答不符合 schema，SDK 会自动重试。这意味着你能直接拿到一个确定格式的 Python 字典，不需要自己解析文本。

典型场景：

- 代码审查结果的结构化报告（问题列表、严重程度、修复建议）
- 项目分析报告（文件统计、依赖关系、风险指标）
- 任何需要后续程序化处理的 Agent 输出

## Custom Tools

Agent 内置了 Read、Write、Edit、Bash、Grep 等工具。但你的应用可能需要 Agent 调用你自己的业务逻辑——查询数据库、调用内部 API、执行特定的计算。

Agent SDK 用 `@tool` 装饰器定义自定义工具，通过 MCP 协议暴露给 Agent：

```python
from claude_agent_sdk import tool, create_sdk_mcp_server, ClaudeAgentOptions, query

@tool("greet", "Greet a user", {"name": str})
async def greet_user(args):
    return {
        "content": [
            {"type": "text", "text": f"Hello, {args['name']}!"}
        ]
    }

# 创建 MCP 服务器，把工具注册进去
server = create_sdk_mcp_server(name="my-tools", tools=[greet_user])

options = ClaudeAgentOptions(
    mcp_servers={"tools": server},
    allowed_tools=["mcp__tools__greet"],
)

async for msg in query(prompt="Greet Alice", options=options):
    print(msg)
```

几个要点：

- `@tool` 的第一个参数是工具名称，第二个是描述（Agent 靠描述决定什么时候调用），第三个是参数 schema
- `create_sdk_mcp_server` 把工具包装成 MCP 服务器，工具在进程内运行，不需要启动单独的进程
- `allowed_tools` 里用 `mcp__<服务器名>__<工具名>` 的格式引用自定义工具

多个工具可以注册到同一个服务器：

```python
@tool("add", "Add numbers", {"a": float, "b": float})
async def add(args):
    return {"content": [{"type": "text", "text": str(args["a"] + args["b"])}]}

@tool("subtract", "Subtract numbers", {"a": float, "b": float})
async def subtract(args):
    return {"content": [{"type": "text", "text": str(args["a"] - args["b"])}]}

calculator = create_sdk_mcp_server(name="calc", tools=[add, subtract])

options = ClaudeAgentOptions(
    mcp_servers={"calc": calculator},
    allowed_tools=["mcp__calc__add", "mcp__calc__subtract"],
)
```

## MCP 集成

除了用 `create_sdk_mcp_server` 创建进程内工具，Agent SDK 也支持连接外部 MCP 服务器。

外部 MCP 服务器的配置方式和 Claude Code CLI 一样——在 MCP 配置里定义服务器的启动命令和参数。Agent SDK 启动时会连接这些服务器，把它们的工具暴露给 Agent。

这意味着两件事：

1. **你在 Claude Code CLI 里配置的 MCP 服务器，Agent SDK 也能用。** 如果你已经配了 Context7、Playwright、或者自己写的 MCP 服务器，SDK 里直接复用。

2. **你可以给 Agent 接任何 MCP 兼容的服务。** 数据库、内部 API、第三方 SaaS——只要写一个 MCP 服务器包装一下就行。

MCP 协议的好处是标准化。Agent 不需要知道工具的具体实现，它只需要知道工具的名称、描述和参数 schema。这让工具的替换和扩展变得简单。

## Hooks 和 Permissions

### Hooks：生命周期回调

Hooks 让你在 Agent 执行的特定节点插入自定义逻辑。比如在工具调用前后做日志、做转换、做拦截。

目前 SDK 主要通过 `can_use_tool` 回调来拦截工具调用。这是一个 async 函数，在 Agent 每次调用工具前被调用：

```python
from claude_agent_sdk import ClaudeAgentOptions, PermissionResultAllow, PermissionResultDeny

async def log_and_check(tool_name, tool_input, context):
    # 记录每次工具调用
    print(f"Tool called: {tool_name}, input: {tool_input}")

    # 允许所有调用
    return PermissionResultAllow()

options = ClaudeAgentOptions(can_use_tool=log_and_check)
```

### Permissions：细粒度权限控制

`can_use_tool` 最常见的用途是实现权限控制。你可以基于工具名称、输入参数、执行上下文来决定允许或拒绝：

```python
async def safe_bash(tool_name, tool_input, context):
    if tool_name == "Bash":
        command = tool_input.get("command", "")
        dangerous = ["rm -rf", "mkfs", "dd if=/dev/"]
        for pattern in dangerous:
            if pattern in command:
                return PermissionResultDeny(message=f"Blocked: {pattern}")
    return PermissionResultAllow()

options = ClaudeAgentOptions(
    can_use_tool=safe_bash,
    allowed_tools=["Bash"],  # 自动允许安全的 Bash 命令
)
```

这段代码做两件事：`allowed_tools` 列出默认允许的工具（不需要逐次确认），`can_use_tool` 在此基础上做额外的检查（拦截危险命令）。

权限控制的典型模式：

| 场景 | 实现方式 |
|-----|---------|
| 禁止危险命令 | 检查 Bash 工具的 command 参数 |
| 只读模式 | 拒绝 Write、Edit 工具的所有调用 |
| 限制文件路径 | 检查 Read/Write 工具的 file_path 参数 |
| 审计日志 | 在 can_use_tool 里记录所有调用 |
| 条件性允许 | 基于上下文（如用户角色）动态决定 |

## 关键要点

- Session 管理让 Agent 能跨多轮对话保持上下文，用 ClaudeSDKClient 或 continue_conversation 实现
- Structured Output 通过 JSON Schema 强制 Agent 返回结构化数据，省去自己解析文本的麻烦
- Custom Tools 用 @tool 装饰器定义，通过 MCP 协议暴露，Agent 自动根据描述决定何时调用
- MCP 集成让你能接入任何 MCP 兼容的服务，复用 CLI 里已有的 MCP 配置
- can_use_tool 回调同时提供 hooks（生命周期拦截）和 permissions（权限控制）两个能力

## 延伸阅读

- [Agent SDK Python 文档](https://code.claude.com/docs/en/agent-sdk/python) — API 完整参考
- [Claude Agent SDK Python GitHub](https://github.com/anthropics/claude-agent-sdk-python) — 源码和更多示例
- [Agent SDK Subagents](https://code.claude.com/docs/en/agent-sdk/subagents) — 高阶 subagent 定义和工具限制
- [第 66 篇：什么时候不用 Subagent](66-when-not-to-use-subagent.md) — subagent 使用决策指南
