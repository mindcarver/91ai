# /usage 和成本感知

> 更新日期：2025/06

**TL;DR：** `/usage` 是 Claude Code 内置的用量查看命令，告诉你当前会话花了多少钱、消耗了多少 token、哪些操作最烧资源。看懂它之前，你在 Claude Code 上的花费是黑箱；看懂之后，你才能有意识地控制开销。

## 为什么这很重要

Claude Code 按 token 计费。每个请求的输入和输出都在消耗你的额度，但你平时看不到这些数字——它不像打车软件那样有实时跳动的计价器。

`/usage` 就是这个计价器。

不理解成本构成的常见后果：

- 用 Opus 做简单格式化，一天烧掉半个月的预算
- 安装了 10 个 MCP 服务器但只用 2 个，每个请求多花 15% 的 token
- 一个会话开了 3 小时没清理，上下文膨胀到每轮对话都要重发几万 token
- 不清楚 thinking token 按输出价格计费，以为"让 Claude 多想想"是免费的

养成定期看 `/usage` 的习惯，一周后你就会对自己的消费模式心里有数。

## Claude Code 怎么计费

### 三种 token 类型

每次你发一条消息，背后发生三件事，每件事都产生 token：

| 类型 | 包含什么 | 计费方式 |
|------|---------|---------|
| 输入 token | 你的指令 + CLAUDE.md + 文件内容 + 历史对话 + MCP 工具定义 + Skills 元数据 | 按输入单价 |
| 输出 token | Claude 的回复 + 生成的代码 + 工具调用指令 | 按输出单价 |
| Thinking token | 扩展思考过程（Claude 的"内心独白"） | 按输出单价 |

关键点：**thinking token 按输出价格算**。Opus 的输出单价大约是输入的 5 倍。当你看到 Claude 在"思考"的时候，它在持续消耗最贵的 token 类型。

### 不同模型的单价差异

以 API 定价为参考（订阅计划内部换算不同，但比例类似）：

| 模型 | 输入 | 输出/Thinking | 定位 |
|------|------|-------------|------|
| Haiku | 最低 | 最低 | 子代理的简单任务 |
| Sonnet | 中等 | 中等 | 日常编码，性价比最高 |
| Opus | 较高 | 较高（约 Sonnet 的 5 倍） | 复杂架构、难 debug |

企业用户实测平均值：约 $13/开发者/天，月均 $150-250/开发者。90% 的用户日均不超过 $30。

### 订阅计划 vs API

两种付费模式，成本感知方式不同：

**订阅计划（Pro / Max）**：固定月费，有额度上限。Pro 约 44,000 token / 5 小时窗口；Max 5x 是 Pro 的 5 倍；Max 20x 是 20 倍。Claude 网页版和 Claude Code 共享同一个额度池——在 claude.ai 上聊天会把 CLI 的额度也用掉。

**API 按量计费**：没有上限，用了多少算多少。适合高频用户，但需要自己监控消费。

## /usage 命令详解

### 基本用法

在交互模式中输入：

```
/usage
```

输出分两大块：**Session 块**和**Plan 块**。

### Session 块：当前会话花了多少

Session 块显示当前会话的 token 消耗统计：

```
Total cost:            $0.55
Total duration (API):  6m 19.7s
Total duration (wall): 6h 33m 10.2s
Total code changes:    0 lines added, 0 lines removed
```

字段含义：

| 字段 | 说明 |
|------|------|
| Total cost | 本次会话的本地估算费用（基于 token 数和已知单价计算，可能与实际账单有出入） |
| Total duration (API) | 实际调用 API 的时间 |
| Total duration (wall) | 从会话开始到现在的实际时间 |
| Total code changes | 本次会话修改了多少行代码 |

如果你在会话中切换了模型（比如先用 Sonnet 后切 Opus），`/usage` 会按模型分别列出每种的 input、output、cache read、cache write 和费用小计。

**注意：费用数字是本地估算**。它是根据 token 计数和公开价格算出来的，不是从 API 实时拉取的账单数据。查实际账单去 Claude Console 的 Usage 页面。

### Plan 块：额度还剩多少

Pro、Max、Team、Enterprise 计划用户还会看到 Plan 块——当前额度使用情况。

它会按来源分类显示消耗：

- 各个 Skills 的 token 占比
- Subagents 的 token 占比
- Plugins 的 token 占比
- 各个 MCP 服务器的 token 占比

按 `d` 切换到最近 24 小时视图，按 `w` 切换到最近 7 天视图。

这些数字来自本机的会话历史。你在其他设备或 claude.ai 上的使用不会出现在这里。

### 相关命令

`/cost` 和 `/stats` 是 `/usage` 的别名，效果相同。用哪个都行。

`/context` 是另一个有用的命令——它用可视化方式显示当前上下文窗口的占用情况。配合 `/usage` 一起用，能帮你判断是该继续还是会话该压缩了。

## 各操作的成本差异

了解哪些操作烧 token 多，哪些少，有助于做决策。

### MCP 服务器：隐形的 token 消耗大户

这是很多人忽略的成本来源。每个连接的 MCP 服务器都会把工具定义注入每条消息。虽然 Claude Code 已经做了延迟加载（只注入工具名，使用时才加载完整定义），但活跃的工具列表仍然占上下文空间。

社区实测数据：每个 MCP 服务器的工具定义可以占 10,000-18,000 token/轮。如果你连了 5 个 MCP 服务器但只常用 2 个，每个请求都在浪费 token。

用 `/mcp` 查看当前配置的服务器，禁用不常用的。

### Skills：一次性加载，开销可控

Skills 的元数据在会话开始时加载一次，通常不到 500 token。这比 MCP 的持续开销小得多。

而且有些 skills 反而省 token——比如用 skill 抓取 PDF 内容比让 Claude 自己读文件更高效。

### Subagents 和 Agent Teams

Subagent 会创建独立的上下文窗口，只把摘要返回主会话。适合把大量输出（比如测试结果、日志分析）隔离出去，避免污染主会话的上下文。

Agent Teams 的 token 消耗大约是标准会话的 7 倍。每个 teammate 都运行独立的 Claude 实例，各带各的上下文窗口。用 teams 时保持任务小而明确，用完及时清理。

### Extended Thinking

Thinking token 是按输出单价计费的，这是很多人低估的成本项。默认情况下，Opus 的 thinking budget 可以到数万 token 每请求。

对于一个复杂问题，Claude 可能用 20,000-50,000 thinking token 来推理。在 Opus 上，这相当于额外 $0.5-1.25 的输出成本——仅仅是为了"思考"。

用 `/effort` 调整级别，或设置 `MAX_THINKING_TOKENS` 环境变量来硬性限制上限。

### 对话长度的累积效应

这是成本感知中最容易被忽视的一点：**每一轮对话，所有历史消息都要重新发送**。

假设你的会话有 20 轮对话：

- 第 1 轮：发送 5,000 token 输入
- 第 10 轮：发送 5,000 + 前 9 轮的历史 ≈ 30,000 token 输入
- 第 20 轮：发送 5,000 + 前 19 轮的历史 ≈ 80,000 token 输入

到后面，每发一条消息的输入成本是开始时的十几倍。这就是为什么长会话需要用 `/compact` 压缩，或者用 `/clear` 重新开始。

## 省钱策略

### 立即能做的（零成本）

1. **切任务时 `/clear`**：切换到不相关的工作时清空上下文。用 `/rename` 给当前会话起个名字，之后用 `/resume` 回来继续。

2. **长会话中期 `/compact`**：不丢关键上下文，但把历史压缩到合理大小。可以带指令：`/compact 保留代码修改和测试结果`。

3. **每天看一次 `/usage`**：一周后你就知道自己的消费模式了。

4. **具体化你的请求**：说"给 auth.ts 的 login 函数加输入验证"比"改进这个代码库"省 90% 的 token——后者触发大范围扫描。

5. **跑偏了按 Esc**：Claude 走错方向时立刻按 Escape 停止，不要等它完成一个错误的方案。用 `/rewind` 回到之前的状态。

### 需要一点配置的（低门槛）

6. **日常用 Sonnet，难活用 Opus**：80% 的编码任务 Sonnet 足够。用 `/model` 随时切换。

7. **简单任务降低 effort**：`/effort low` 适合格式化、小查询这些不需要深度思考的操作。

8. **禁用不用的 MCP 服务器**：用 `/mcp` 查看，关掉不活跃的。

9. **CLAUDE.md 控制在 200 行内**：不常用的指令移到 skills 里按需加载。CLAUDE.md 每轮都要发送。

10. **设 thinking token 上限**：`MAX_THINKING_TOKENS=10000` 防止思考失控。

### 团队级优化（需要管理员）

11. **按团队规模配置 rate limit**：5 人以下团队每人约 200k-300k TPM，500 人以上团队每人 10k-15k TPM。具体参考 Claude Code 官方成本文档的推荐表。

12. **设置月度消费上限**：Pro 和 Max 计划用 `/usage-credits` 命令设定月度上限。达到上限后可以调整，但至少有个告警。

13. **子代理指定 Haiku 模型**：简单的搜索、格式化任务用最便宜的模型。

## 关键要点

- `/usage` 是你的成本仪表盘。养成定期查看的习惯，从看到数字开始，才能控制数字
- 三种 token 里 thinking token 最贵——它按输出单价计费，在 Opus 上一个复杂问题可以烧掉 $0.5+ 仅仅在"思考"
- MCP 服务器是隐形的 token 消耗源。每个活跃服务器每轮增加数千到上万 token。不用的就关掉
- 对话越长越贵。每轮对话都重新发送全部历史。长会话用 `/compact`，切任务用 `/clear`
- 费用数字是本地估算，不是实际账单。查实际消费去 Claude Console

## 延伸阅读

- [第 28 篇：交互模式基础操作](./28-interactive-mode-basics.md) — `/usage` 所在的交互模式基础
- [第 29 篇：内置 Slash Commands 地图](./29-built-in-slash-commands.md) — 所有命令的完整参考
- [第 31 篇：/compact 与上下文压缩](./31-compact-context-compression.md) — 省钱的核心操作
- [第 76 篇：成本和性能优化](./76-cost-performance-optimization.md) — 本文的进阶版，深入到模型策略和缓存优化
- [Claude Code 官方成本文档](https://code.claude.com/docs/en/costs) — 定价细节、团队管理、rate limit 推荐
- [Claude Code Help Center: Models, Usage, and Limits](https://support.claude.com/en/articles/14552983-models-usage-and-limits-in-claude-code) — 各计划的额度详情

<!-- CONTACT-START -->
<!-- Auto-generated by scripts/inject-contact.sh — 单一真实源: docs/_snippets/contact.html -->
<div align="center">

**「阿新聊 AI」同步更新，欢迎关注**

<br>

<table>
<tr>
<td align="center">📢<br><b>微信公众号</b><br>阿新聊ai</td>
<td align="center">🎵<br><b>抖音</b><br>阿新聊ai</td>
<td align="center">📕<br><b>小红书</b><br>阿新聊ai</td>
<td align="center">💬<br><b>微信</b><br>mindcarver</td>
</tr>
</table>

🌐 AI 社区 · <a href="https://91aihub.com/">91aihub.com</a>

</div>
<!-- CONTACT-END -->
