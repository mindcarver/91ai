# web-schedule：dsh 会话内的定时、提醒与自动化

> `web-schedule` 不是一个通知系统，它是一层 session 内的自动化 overlay，"提醒"本质是一个被推迟的 follow-up turn，记在会话日志里，等根 agent 完全空闲时在那个对话里排队一条普通消息，**不发浏览器通知、不发系统通知、不发邮件短信**。
> 时间上走绝对权威：没有 session 默认时区，`at` 必须带明确时区或 `Z`，进程关了定时器就停、但记录还在，重开会话补投过期的。

## 先纠正一个预期

看到"schedule"和"reminder"，多数人会预期一个通知系统：定个时间，到点了给我弹个浏览器通知、推个系统消息、发封邮件。`web-schedule` 不是这个。

它是一层 overlay，让一个 `dsh web` 进程拥有 Schedule 提醒能力，不改默认的 Web 组合，启动命令是 `dsh web --patch examples/web-schedule/cordis.yml`。

加载之后，模型通过三个工具管理提醒：`schedule_create`、`schedule_list`、`schedule_delete`。每个结果都把投递标识为 `session-local`。

"session-local"是关键词。一个提醒的投递，是这个会话的根 agent 等到完全空闲后，在那个对话里排队一个普通的 follow-up turn。它绝不 steering 当前正在做的工作，也不加单独的回执或提醒卡片。README 里有一句钉死的话：**Schedule 不提供浏览器、操作系统、邮件、短信或其他外部通知。**

这意味着什么？意味着你必须让那个 `dsh web` 进程开着、那个会话的 agent 空闲着，到点了提醒才会作为一条新消息出现在那个对话里。你合上笔记本、关掉进程，到点了什么都不会发生。这不是缺陷，是有意的边界：它解决的是"在 agent 会话内部安排后续动作"，不是"给人发定时通知"。

## 三种创建方式

`schedule_create` 支持三种触发方式：

- **`after_seconds`**：正整数秒数，从创建起等多久。
- **`at`**：绝对时间目标。
- **`every_seconds`**：固定频率间隔，最小 300 秒（5 分钟）。

`every_seconds` 的 300 秒下限是个防滥用闸：不允许高频轮询。如果你想要每秒触发的东西，schedule 不是工具，那是定时任务或事件循环的活。这个下限把 schedule 锁定在"人尺度的提醒"这个用途上。

`schedule_list` 列出当前的提醒，`schedule_delete` 删除。创建和实际删除只在会话持久化确认了事件前缀之后才确认成功。这保证了"我说删了"和"日志里真删了"是一致的，不会出现"工具返回成功但日志里还在"的撕裂。

## 绝对时间权威

时间处理是这个 overlay 最讲究的部分，也是最容易踩坑的地方。

### 浏览器 IANA 时区只管自然语言解释

浏览器会给每个 prompt 附上它的 IANA 时区。时间上下文告诉模型：把 otherwise-unqualified 的日期时间，按这个请求的浏览器时区解释。比如用户说"下午三点"，模型用浏览器时区把它落成具体时刻。

但这条假设只属于自然语言解释。落到 `schedule_create.at` 这个机器字段上，时区必须明确：

- 要么是一个严格的 RFC 3339 date-time，带 `Z` 或数字偏移；
- 要么是 `{ date, time, time_zone }`，带明确的 `UTC` 或 IANA Area/Location 时区。

### 没有 session 默认时区

这是关键设计：Schedule 不保留也不推断 session 默认时区。每次创建都得带明确时区，不存在"这个会话默认用东八区"这种隐式状态。

为什么这么严格？因为隐式的 session 默认时区是 bug 温床。用户在上海创建会话，飞到东京，时区变了，一个基于"会话默认时区"的提醒会在错误的时刻触发。强制每次明确时区、且只存最终的 UTC 目标，让提醒的触发时刻和会话所在的时区解耦。成功记录只保留算出来的 UTC 目标，原时区信息不留。

### 夏令时处理

夏令时是个经典的时间坑，这里处理得明确：

- **gap（夏令时跳 forward 的空档）**：拒绝。比如春季拨快一小时，凌晨 2 点到 3 点不存在，定在这个空档的直接拒。
- **overlap（夏令时跳 back 的重叠）**：选第一个瞬间。比如秋季拨慢一小时，凌晨 2 点到 3 点出现两次，定在这个重叠的选第一次。
- 成功记录只保留算出来的 UTC 目标。

这个处理把"本地时间的歧义"在创建时就消解成唯一的 UTC 瞬间，之后只认 UTC。提醒的对齐永远基于创建时间，不受后续时区或夏令时变化影响。

## 冷热恢复边界

这是这个 overlay 最有意思的工程部分，因为它把"定时器"和"记录"分得很清楚。

### 定时器是进程内的，记录是持久的

**原始的会话日志拥有每个提醒。** 一个 live 的根 agent 等到完全空闲，然后排队一个 follow-up turn。但那个"等到时间到"的定时器是进程内的内存状态。

所以：

- 关闭进程或让会话变冷，停止内存里的定时器，但不删记录。
- 重新打开同一个会话，恢复等待，补投过期的提醒。
- 读冷历史（只是看日志）永远不激活它。只有真正重开会话、让 agent 活过来，才会恢复等待。
- fork 不继承父的提醒。

这个分离的妙处在于：定时器可以死（进程关了），但提醒的意图不会丢（记在日志里）。重开会话，扫描日志里未投递的提醒，恢复等待，过期的补投。这比"定时器必须永远活着"鲁棒得多。

### 补投的语义

提醒永远对齐到创建时间。如果一个提醒过期了（该触发时 agent 在忙或进程关着），补投的规则是：

- 只有最新该到的那次被呈现。对于一个固定频率的提醒，下次目标仍按原始序列算，不因为补投而漂移。
- 在同一个空闲决策点上，所有不同的、同时过期的 Every 记录，合并成一个 follow-up，每个出现一次。
- 到期的一次性提醒在该批次之前跑。

**错过的间隔不积压成 backlog。** 假设有个每 5 分钟的提醒，进程关了一小时。朴素做法会补投 12 次（一小时除以 5 分钟），把对话刷爆。这里只补一次（最新那次），下次仍按原序列。这把"长时间离线后的补投"控制在可接受范围内。

## 投递到底长什么样

把整个投递链路串一遍：

1. 创建时，提醒作为事件记进会话日志，`schedule_create` 在持久化确认后返回成功。
2. 进程内定时器（如果进程开着、会话活）等到目标时刻。
3. 根 agent 等到完全空闲。
4. 在那个对话里，排队一个普通的 follow-up turn。没有单独的提醒卡片，没有特殊 UI，就是一条普通消息。
5. agent 处理这条消息，就像处理任何用户消息一样。

一条持久派发只记录"follow-up 已排队"，不确认模型成功或用户收到。因为一旦排队进 inbox，这就是一次普通的 turn，能不能做好取决于 agent，不取决于 schedule。

这条链路复用 agent 的 inbox FIFO 机制。提醒不是特殊的投递通道，它就是一条进 inbox 的消息，这让 schedule 不用造一套独立的消息系统，直接搭 session 的便车。

## 它怎么挂进来：overlay，不是核心

`web-schedule` 体现了 harness 反复出现的一个做法：一切皆插件，能做成按需 overlay 的就不进核心。

它不是默认 Web 组合的一部分。默认的 `dsh web` 没有 schedule 能力。你想要，就 `--patch examples/web-schedule/cordis.yml` 把这层 overlay 叠上去。这层 overlay 注册三个工具、挂上定时器逻辑、连上 session 的 follow-up 机制，就完成了。

这种"核心不带、按需 overlay"的做法，让默认的 Web 保持精简，只在实际需要定时能力的部署里才引入这层复杂度。一个纯 headless 的 CI runner、一个只做代码生成的部署，根本不需要 schedule，也就不会被它的复杂度拖累。

## 权衡：窄场景换零新增基础设施

先看清它不是什么：不是通用定时任务系统。没有 cron、没有 calendar 表达式、有最小间隔、没有外部通知，它只解决"在 agent 会话内安排一个延迟的后续动作"这个窄场景，拿它当 crontab 用会失望。投递依赖进程开着、agent 空闲，这对"长期挂着的开发助手"场景合理，对"偶尔打开用一下"的场景意味着提醒总会迟到，虽然重开会补投。补投只呈现最新该到的那次，对"统计错过了几次"的需求不友好。时区必须显式，防了 bug，代价是模型或调用方忘了带时区就会被拒。它是 example 不是核心，一个没 patch 这层 overlay 的部署里，模型根本没有 schedule 工具。

换来的是零新增基础设施：没有独立的通知系统，没有独立的消息通道，没有独立的持久化，提醒就是日志事件加一次普通的 follow-up，崩溃恢复也直接继承 session 的冷热语义。

## 结论

`web-schedule` 是一层 session 内的自动化 overlay，用 `--patch` 挂进 `dsh web`，给模型三个工具、三种触发方式。它的本质是"被推迟的 follow-up turn"：提醒记在会话日志里，等根 agent 完全空闲时在那个对话里排队一条普通消息，没有外部通知。时间走绝对权威，`at` 必须带明确时区，夏令时 gap 拒绝、overlap 选第一个，只存 UTC 目标；定时器是进程内的、记录是持久的，重开会话补投过期提醒，补投合并不积压。这个例子虽小，却把插件化、session 日志为真相、复用既有机制、显式优于隐式这几条主线，在一个具体功能上集中展示了一遍。

## 延伸阅读

- [Session-local Schedule 示例 README](https://github.com/deepseek-ai/deepseek-harness/blob/master/examples/web-schedule/README.md)：本文唯一依据，含全部行为契约
- [Examples 总览](https://github.com/deepseek-ai/deepseek-harness/blob/master/examples/README.md)：其他可运行示例（headless、JSON-RPC、ACP、MCP 等）
- [Profiles and Bundles](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/13-profiles-and-bundles.md)：`--patch` overlay 机制
- [Session Log and Events](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md)：提醒记录的归属

上一篇：[子 Agent 与多智能体：dsh 怎么调度另一个 agent](./30-subagents-multi-agent.md)
下一篇：[MCP 协议在 dsh 中的位置：一个通用客户端，一份记忆服务器接入手册](./32-mcp-in-dsh-and-mcp-memory.md)
