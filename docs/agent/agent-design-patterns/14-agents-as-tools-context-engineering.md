# 组合与上下文：Agents-as-Tools 与 Context Engineering

**TL;DR：** Agents-as-Tools 把 Agent 当作工具嵌套调用——主 Agent 不直接处理所有事情，而是调用专家 Agent 获取结果，像调用 API 一样。Context Engineering 解决的是 Agent 的"视野"问题：不是简单地往 prompt 里塞更多信息，而是精心设计 Agent 在每个时刻能看到什么、需要什么、忽略什么。两者组合使用可以构建出既专业又高效的系统。

## 它解决什么失控点

### Agents-as-Tools：能力边界的失控

单个 Agent 不可能擅长所有事。硬把搜索、编程、写作、数据分析全塞给一个 Agent，结果是每个都做得一般。Agents-as-Tools 解决的是**能力边界**：让每个 Agent 只做自己最擅长的事，主 Agent 通过工具调用的方式组合这些能力。

### Context Engineering：上下文窗口的失控

LLM 的上下文窗口有限（128K、200K tokens），而 Agent 需要处理的信息可能远超这个限制。Context Engineering 解决的不是"怎么塞更多东西"，而是**在有限窗口内放最相关的信息**。这包括：什么时候检索、检索什么、怎么排列、什么时候清理。

## Agents-as-Tools：组合而非堆砌

在[协作章节](13-swarm-handoff-debate.md)中我们已经提到了 Agents-as-Tools 的基本概念。这里深入讨论它的工程实践。

### 与微服务架构的类比

Agents-as-Tools 的思路很像微服务：每个 Agent 是一个独立服务，有自己的职责和接口。主 Agent 是 API Gateway，负责路由和编排。

```text
微服务架构:
  API Gateway → 用户服务 → 订单服务 → 支付服务

Agents-as-Tools:
  主 Agent → 研究 Agent（as_tool）→ 编码 Agent（as_tool）→ 审查 Agent（as_tool）
```

好处相同：每个服务/Agent 独立演进、独立测试。坏处也类似：增加了调用链的复杂度和延迟。

### 三种组合模式

**串行管道**：主 Agent 依次调用多个专家 Agent，前一个的输出是后一个的输入。

```python
# 串行管道：研究 → 写作 → 审查
from agents import Agent

researcher = Agent(name="研究员", tools=[search, scrape])
writer = Agent(name="作者", tools=[write])
reviewer = Agent(name="审稿人", tools=[check_grammar, check_facts])

coordinator = Agent(
    name="主编",
    instructions="按顺序调用：研究 → 写作 → 审查",
    tools=[
        researcher.as_tool(name="research", description="调研指定主题"),
        writer.as_tool(name="write", description="基于调研结果写文章"),
        reviewer.as_tool(name="review", description="审查文章质量"),
    ],
)
```

**并行调用**：多个专家 Agent 同时工作，主 Agent 汇总结果。

```python
# 并行调用：多个专家同时分析
from agents import Agent, Runner
import asyncio

analysts = [
    Agent(name="技术分析", instructions="从技术角度分析"),
    Agent(name="市场分析", instructions="从市场角度分析"),
    Agent(name="财务分析", instructions="从财务角度分析"),
]

async def parallel_analysis(question):
    tasks = [
        Runner.run(analyst.as_tool(), question)
        for analyst in analysts
    ]
    results = await asyncio.gather(*tasks)

    # 由主 Agent 综合
    synthesis = await Runner.run(
        coordinator,
        f"综合以下分析：\n" + "\n".join(results),
    )
    return synthesis
```

**条件路由**：主 Agent 根据问题类型选择调用哪些专家。

```python
# 条件路由
coordinator = Agent(
    name="路由器",
    instructions="""判断问题类型，只调用相关的专家：
    - 技术问题 → 调用 tech_agent
    - 账单问题 → 调用 billing_agent
    - 一般咨询 → 自己直接回答
    """,
    tools=[
        tech_agent.as_tool(name="tech_support", description="..."),
        billing_agent.as_tool(name="billing_support", description="..."),
    ],
)
```

### 递归调用的风险

Agents-as-Tools 允许 Agent A 调用 Agent B，Agent B 也可以调用 Agent C。但递归调用有风险：如果 Agent A 调用了 Agent B，Agent B 又调用了 Agent A，就形成了无限循环。

必须设置**调用深度限制**，类似 HTTP 请求的 hop limit：

```python
MAX_AGENT_DEPTH = 3  # 最多嵌套 3 层

def invoke_as_tool(agent, input, current_depth=0):
    if current_depth >= MAX_AGENT_DEPTH:
        return "错误：Agent 调用嵌套过深"
    return agent.invoke(input, depth=current_depth + 1)
```

## Context Engineering：视野决定输出质量

Context Engineering 是 2024-2025 年 Agent 工程中越来越受重视的概念。它的核心观点：**Agent 的输出质量主要取决于它看到了什么，而不是它有多"聪明"**。

### 为什么不叫 Prompt Engineering

Prompt Engineering 关注的是"怎么写指令"。Context Engineering 的范围更广：

```text
Prompt Engineering:  怎么写指令 → 系统 prompt、few-shot 示例
Context Engineering:  Agent 每个时刻能看到什么 → 指令 + 工具描述 + 检索结果 + 对话历史 + 中间状态
```

在 Agent 系统中，prompt 只是上下文的一小部分。Agent 的上下文窗口里通常还有：
- 系统指令（system prompt）
- 工具定义（每个工具的 name、description、parameters）
- 检索到的文档片段（RAG 结果）
- 对话历史（之前所有的 Thought/Action/Observation）
- 执行结果（代码输出、API 返回值）
- 其他 Agent 的输出（多 Agent 场景）

这些加在一起，很容易撑满 128K 的上下文窗口。

### Context Engineering 的四个原则

**1. 只保留相关的**

对话历史是最常见的上下文膨胀源。一个 10 步的 ReAct 循环，每步的 Thought/Action/Observation 都完整保留，到第 10 步时上下文中可能有大段已经不相关的早期推理。

```python
# 上下文压缩：只保留关键信息
def compress_history(messages, max_tokens=4000):
    """压缩对话历史，保留关键转折点"""
    if estimate_tokens(messages) <= max_tokens:
        return messages

    # 策略：保留最后 3 步的完整信息，早期步骤只保留摘要
    recent = messages[-6:]  # 最近 3 步（每步 2 条消息）
    early = messages[:-6]

    summary = llm.invoke(
        "将以下早期对话浓缩为一段摘要，保留关键发现和决策：\n"
        + format_messages(early)
    )

    return [{"role": "system", "content": f"历史摘要：{summary}"}] + recent
```

**2. 结构优于堆砌**

信息在上下文中的排列方式影响模型的理解效率。结构化的信息比大段文本更容易被正确利用。

```python
# 坏：把所有工具结果堆在一起
context = f"搜索结果：{search_1}\n{search_2}\n{search_3}"

# 好：结构化标注来源和相关性
context = f"""
## 调研结果

### 来源 1：{source_1_name}（相关性：高）
{search_1}

### 来源 2：{source_2_name}（相关性：中）
{search_2}

### 来源 3：{source_3_name}（相关性：低）
{search_3}

### 关键发现
- {finding_1}
- {finding_2}
"""
```

**3. 分层加载**

不是所有信息都需要在开始时就加载。按需加载（lazy loading）可以节省上下文空间。

```text
初始上下文（小）: 系统指令 + 工具定义 + 用户问题
  → Agent 决定需要查资料
检索后上下文（中）: + 相关文档片段
  → Agent 执行代码
执行后上下文（大）: + 代码输出
  → Agent 发现需要更多信息
第二轮检索（中）: 压缩早期对话 + 新检索结果
```

**4. 明确信息的边界**

模型需要知道哪些信息是"事实"（来自工具/API）、哪些是"推理"（模型自己生成的）、哪些是"假设"（尚未验证的）。

```python
# 在上下文中明确信息来源
def format_observation(tool_name, result, metadata=None):
    return f"""
[工具返回 - {tool_name}]
时间: {metadata.get("timestamp", "未知")}
置信度: {metadata.get("confidence", "未评估")}
结果:
{result}
[/工具返回]
"""
```

### Context Engineering 与 RAG 的关系

Context Engineering 包含 RAG，但不止于 RAG。RAG 解决的是"从外部知识库检索信息"，Context Engineering 解决的是"Agent 在整个生命周期中如何管理信息"：

| 维度 | RAG | Context Engineering |
|------|-----|-------------------|
| 范围 | 知识检索 | 所有上下文管理 |
| 触发时机 | 查询时 | Agent 整个执行过程 |
| 内容来源 | 文档库 | 对话历史、工具结果、知识库、中间状态 |
| 核心操作 | 检索 + 排序 | 加载 + 压缩 + 结构化 + 清理 |

详见[知识检索章节](03-external-world-tools-mcp-knowledge-retrieval.md)中 RAG 的完整讨论。

### 实际案例：长对话 Agent 的上下文管理

一个客服 Agent 处理 20 轮对话，上下文管理策略：

```python
class ContextManager:
    def __init__(self, max_tokens=8000):
        self.max_tokens = max_tokens

    def build_context(self, session):
        context = []

        # 1. 系统指令（始终保留）
        context.append({"role": "system", "content": SYSTEM_PROMPT})

        # 2. 对话摘要（压缩早期对话）
        if len(session.turns) > 5:
            summary = self.summarize(session.turns[:-5])
            context.append({"role": "system", "content": f"对话摘要：{summary}"})
            context.extend(session.turns[-5:])
        else:
            context.extend(session.turns)

        # 3. 相关知识（按需加载）
        if session.needs_knowledge:
            docs = self.retrieve(session.current_query)
            context.append({"role": "system", "content": self.format_docs(docs)})

        # 4. 工具结果（最新结果完整保留）
        if session.latest_tool_result:
            context.append({
                "role": "system",
                "content": f"工具结果：{session.latest_tool_result}"
            })

        return self.trim_to_budget(context, self.max_tokens)
```

## 工程考量

### Token 预算分配

在有限上下文窗口中，需要给不同类型的信息分配预算：

```text
典型 128K 窗口分配：
- 系统指令: 2-5K tokens
- 工具定义: 2-5K tokens（5-10 个工具）
- 对话历史: 20-50K tokens（压缩后）
- 检索结果: 10-20K tokens
- 执行结果: 5-10K tokens
- 预留给模型输出: 4K tokens
- 安全余量: 10-20K tokens
```

超出预算时，按优先级裁剪：工具结果 > 检索结果 > 早期对话历史 > 工具定义（可以懒加载）。

### Agents-as-Tools 的上下文隔离

当主 Agent 调用专家 Agent（as_tool）时，专家 Agent 有自己独立的上下文窗口。这意味着：

- 专家 Agent 看不到主 Agent 的完整对话历史——只看到传给它的输入
- 这是有意的隔离：避免专家被无关信息干扰
- 但如果专家需要上下文，主 Agent 必须在调用时显式传递

```python
# 传递上下文给专家 Agent
research_result = research_agent.invoke(
    f"用户原始问题：{user_question}\n"
    f"已知信息：{known_facts}\n"
    f"请调研：{specific_topic}"
)
```

### 缓存策略

重复的上下文（如系统指令、工具定义）可以通过 prompt caching 节省成本。Anthropic 的 prompt caching 可以缓存前缀，避免每次重新处理相同的系统指令和工具定义。

## 延伸阅读

- [Building Effective Agents - Anthropic](https://www.anthropic.com/engineering/building-effective-agents) — Agents 组合的工程实践
- [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) — `as_tool()` 的官方实现
- [Context Engineering for AI Agents](https://www.anthropic.com/research/building-effective-agents) — Anthropic 对 Context Engineering 的讨论
- [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172) — 模型在长上下文中的信息利用效率研究
- [Prompt Caching - Anthropic](https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching) — 上下文缓存降低成本的官方文档
