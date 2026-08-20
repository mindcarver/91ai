# MCP 协议在 dsh 中的位置：一个通用客户端，一份记忆服务器接入手册

> `dsh` 对 MCP 的做法不是"内置几个服务器"，而是写一个通用桥接插件，让任何 MCP 服务器的工具在模型眼里变成原生工具，命名方式和 Claude Code、Codex 完全一致。
> 这一篇拆两件事：桥接插件 `@deepseek-ai/dsh-mcp-client` 怎么把外部 MCP 工具搬进 `ctx.tools`，以及 `examples/mcp-memory/` 怎么用同一套机制接入三个第三方记忆服务器。

## MCP 解决了什么问题

先把背景说清楚，后面才有判断的基准。

MCP（Model Context Protocol）是 Anthropic 在 2024 年 11 月开源的协议，目标是把"AI 应用如何连接外部数据源和工具"这件事标准化。它用 JSON-RPC 消息在客户端（client）和服务器（server）之间通信，服务器暴露三类能力：tools（工具）、resources（资源）、prompts（提示模板）。

这个协议之所以重要，是因为它把"给 agent 加一个能力"从"每个客户端各写一套适配"变成了"写一个符合协议的服务器，所有支持 MCP 的客户端都能用"。社区里已经有大量现成的 MCP 服务器：GitHub、文件系统、数据库、Slack、记忆系统，等等。一个 agent harness 如果支持 MCP，就等于拿到了这个生态的入场券。

`dsh` 当然支持。但它支持的方式值得仔细看，因为这里有一个设计判断。

## dsh 怎么消费 MCP：一个桥接插件，不是一堆内置服务器

很多 agent 客户端的做法是：内置几个常用 MCP 服务器，或者提供一个配置面板让你填。`dsh` 的做法不同。它写了**一个通用的桥接插件** `@deepseek-ai/dsh-mcp-client`，这个插件本身不实现任何具体功能，它的职责是连接一个外部 MCP 服务器，发现那个服务器的工具，然后把它们注册到 `dsh` 自己的工具注册表 `ctx.tools` 上。

一个插件实例对应一个 MCP 服务器。要接三个服务器，就在配置里挂三个实例。这和 `dsh` "一切皆插件"的哲学一致：MCP 集成本身也是一个可挂载、可卸载的插件，不是一个焊死在内核里的特性。

挂载方式是在 `cordis.yml` 里加一条配置：

```yaml
- id: mcp-github
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: github
    transport: stdio
    command: npx
    args: ['-y', '@modelcontextprotocol/server-github']
    env:
      GITHUB_TOKEN: !!js process.env.GITHUB_TOKEN
```

这条配置做四件事：声明一个叫 `mcp-github` 的插件实例，指定 MCP 服务器命名空间为 `github`，用 stdio 方式拉起一个 `@modelcontextprotocol/server-github` 子进程，把环境变量里的 `GITHUB_TOKEN` 传进去。

除了 stdio（本地子进程），还支持 `streamable-http`（远程 HTTP 服务），填 `url` 和 `headers` 即可。两种传输对应两种场景：本地工具用 stdio，团队共享或托管的服务用 HTTP。

## 模型看到的东西：原生工具，一样的命名

这里是最关键的工程细节。

桥接插件发现 MCP 服务器的工具后，给每个工具生成一个**模型可见的公开名称**：

```
mcp__<serverName>__<rawName>
```

比如 `github` 服务器暴露一个叫 `create_issue` 的工具，模型看到的就是 `mcp__github__create_issue`。这个命名方式和 Claude Code、Codex 用的完全一样。这不是巧合，而是刻意的兼容设计：如果你从 Claude Code 迁移过来，工具名的形状不变，模型的行为不会因为换了个 harness 就乱掉。

工具名有两个约束。第一，MCP 服务器自己的工具名（raw name）只在线上传输时用（`tools/call` 的 `name` 字段），模型永远只看到公开名称，两者之间不靠解析转换。第二，公开名称必须符合 DeepSeek 的函数名契约：最多 64 个字符，只允许 `[A-Za-z0-9_-]`。

如果原始名称包含非法字符或者拼接后超过 64 字符怎么办？插件不是简单截断，而是在名称后面追加一个 12 位的十六进制哈希（`SHA-256(serverName + rawName)` 的前 12 位）。这个哈希保证不同的工具永远不会因为名称归一化而塌缩成同一个名字。换句话说，工具的公开名称是 `(serverName, rawName)` 的确定性纯函数，连接顺序、重新同步、其他服务器的存在都不会改变它。

这套命名机制不是纸面设计，源码里的 `publicToolName()` 函数就是干这个的：

```typescript
export function publicToolName(serverName: string, rawName: string): string {
  const joined = `mcp__${serverName}__${rawName}`
  const normalized = joined.replace(INVALID_NAME_CHARS, '_')
  if (normalized === joined && normalized.length <= MAX_PUBLIC_NAME_LENGTH) return normalized
  const hash = createHash('sha256').update(`${serverName}\0${rawName}`).digest('hex').slice(0, HASH_LENGTH)
  return `${normalized.slice(0, MAX_PUBLIC_NAME_LENGTH - HASH_LENGTH - 1)}_${hash}`
}
```

干净情况直接返回拼接结果，只有发生截断或字符替换时才追加哈希。大部分工具走第一条路径。

## 注册机制：两阶段代际切换

工具注册不是"发现一个注册一个"那么简单。`dsh` 用了一个**两阶段代际切换**模式来保证安全：

**阶段一（fetch）**：调用 MCP 的 `tools/list`（支持分页，用 cursor 翻完），构建下一代的完整工具定义集合。这个阶段**完全不碰**注册表。如果发现过程中出错（网络断了、服务器列了重名工具），直接中止，上一代的注册原封不动。

**阶段二（swap）**：先销毁上一代的全部注册，再注册新的一代。如果注册时发现冲突（有别的注册占了这个命名空间），把这次的部分注册全部回滚，这个服务器的工具显示为零。

这个设计的意思是：模型要么看到一个服务器全部工具的完整集合，要么一个都看不到，永远不会看到半套。源码里 `syncTools()` 函数用 `ToolDisposers`（一个 `Map<string, () => void>`）来管理每代的销毁器，swap 时先逐个调用旧代的销毁器，再逐个注册新工具。

为什么要这么谨慎？因为 MCP 服务器是外部进程，它的工具列表可能随时变（MCP 有 `notifications/tools/list_changed` 通知），如果注册过程不是原子的，模型可能在工具集合切换的瞬间看到不一致的状态。

## 重连：有预算的指数退避

MCP 服务器会崩。stdio 子进程会挂，HTTP 服务会断。桥接插件有一套完整的重连机制：

- 连接断开时，用指数退避重连（默认初始延迟 500ms，每次翻倍，上限 30000ms）。
- 重连成功后重新跑发现流程，恢复的工具集合替换旧集合，工具不会重复也不会泄漏。
- 每次断线有**重连预算**：默认最多连续失败 10 次，超过就放弃，注销这个服务器的全部工具，直到 HMR 重载或 Host 重启。
- 一个连接如果存活时间超过 `maxDelayMs`（默认 30 秒），预算重置。这意味着偶尔崩的服务器能无限恢复，而持续崩溃循环的服务器即使偶尔连上也会耗尽预算停下来，不会无限重启。

这些状态对用户可见：重连中打 warn（带尝试次数和延迟），恢复打 info，最终失败打 error。

这套机制背后是一个工程判断：外部进程不可靠是常态，harness 要在不崩的前提下优雅降级，而不是假装外部世界总是好的。

## 信任边界：防御性解析

MCP 服务器返回的数据来自网络（子进程也是另一个信任域），`dsh` 在解析时做了防御。MCP 的内容块（content block）有好几种类型：text、image、audio、resource。桥接插件的处理方式：

- text 块用换行拼接成一段文本，保留在模型上下文里。
- image、audio、resource 块变成短占位符（如 `[image: image/png, content discarded]`），二进制内容不进上下文。

完整的 JSON 块和结构化内容（`structuredContent`）会保留在执行局部的规范值里，给 Code Mode 等编程化调用方用，但模型上下文里只放文本投影。这是一个有意识的取舍：当前不做富媒体的原生渲染，但保留了结构化数据供未来扩展。

MCP 的 `isError: true` 会被映射成抛异常，走工具注册表的错误路径，让模型看到一个 `isError` 结果。这个映射很重要，否则模型会把错误信息当成正常返回。

还有一个安全细节：stdio 方式启动子进程时，桥接插件会**清洗环境变量**。所有名字看起来像凭证的环境变量，以及所有 `DSH_*` 开头的变量，都会被移除，只保留无害的环境变量。然后把你配置里 `env` 字段指定的变量加回去。这防止了 agent 的内部凭证（比如 API key）通过环境变量泄漏给第三方 MCP 服务器。

## mcp-memory：三个记忆服务器的接入手册

`examples/mcp-memory/` 目录不是内置功能，而是三份**默认关闭的参考配置**，演示如何用同一个桥接插件接入不同的第三方记忆系统。

三个选择：

| 系统 | 测试版本 | 传输方式 | 前置条件 |
|---|---|---|---|
| Memorix | 1.3.0 | stdio | Node 22.18+，`npm install --global memorix@1.3.0` |
| MCP Reference Memory | 2026.7.4 | stdio | `npm install --global @modelcontextprotocol/server-memory@2026.7.4` |
| Engram | v1.20.0 | stdio | Go 1.25.10+，`go install ...@v1.20.0` 或下载二进制 |

启动方式都一样，用 `--patch` 传入对应的配置文件：

```sh
dsh web --patch "$PWD/examples/mcp-memory/memorix.cordis.yml"
```

配置文件本身极简（以 Memorix 为例）：

```yaml
- insert:
    - id: memory-memorix
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: memorix
        transport: stdio
        command: memorix
        args: [serve]
        cwd: !!js process.cwd()
```

这就是一个标准的 `mcp-client` 插件配置，和接 GitHub 服务器没有任何结构上的区别。三个记忆系统的区别全在上游（各自怎么存数据、怎么检索），`dsh` 这边做的事情完全一样：拉起进程、发现工具、注册到 `ctx.tools`。

这里有一个重要的边界声明：`dsh` 不负责下载服务器、初始化数据库、选择嵌入模型、创建云账号、迁移厂商数据。它只负责连接和桥接。服务器自身的安装、认证、存储、许可都是提供方的事。

## 验证记忆是否真的生效

记忆系统的价值在于跨会话。`dsh` 的会话是隔离的，一个会话里记的东西，另一个会话默认看不到。记忆服务器的作用就是在会话之外提供持久层。验证方法分三步：

1. 在会话 A 里说"记住我的验证饮料是 lapsang-xxx"，确认模型调用了记忆写入工具并返回成功。
2. 在同一个 Host 里新建会话 B（不用复制会话 A 的对话），问"我的验证饮料是什么？查一下记忆"，确认模型调用了搜索工具并返回了值。
3. 在会话 B 里说"用这个偏好给我推荐一杯饮料"，确认回答用到了召回的值。

注意一个时序细节：初始发现是异步的，发送第一个验证消息前要等 `mcp__` 开头的工具出现。如果 MCP 子进程崩了，当前通用客户端不会自动重连，工具注册保留但调用会失败，需要重启或 HMR。

## 权衡与局限

这套设计的代价和边界要讲清楚。

**只桥接了 tools。** MCP 协议有三类能力（tools、resources、prompts），`dsh` 只接 tools。Resources 和 Prompts 在 harness 里没有消费者，暂时搁置。如果你依赖这两类能力，当前用不了。

**启动超时继承自 MCP SDK。** `dsh` 没有暴露连接/发现超时，用的是 MCP SDK 默认的 60 秒。一个不响应的服务器可能拖慢激活和销毁。

**非文本渲染有损。** 图片、音频、资源块在模型上下文里变成占位符，虽然执行局部的规范值保留了完整 JSON。富媒体的原生投影是后续工作。

**记忆系统的检索质量取决于上游。** 比如 MCP Reference Memory 的搜索是大小写不敏感的子串匹配，不是语义检索，没有嵌入、没有自动摘要、没有冲突解决、没有遗忘策略。选哪个记忆系统，本质上是选哪个检索能力，而不是选 `dsh` 怎么接。

但最大的价值在于通用性。因为桥接插件是通用的，接入一个新的 MCP 服务器只需要写一段配置，不需要改一行 `dsh` 的代码。这就是协议标准化的回报：N 个客户端和 M 个服务器，只需要 N+M 的工作量，而不是 N 乘以 M。

## 延伸阅读

- [MCP 官方规范](https://modelcontextprotocol.io/specification/2026-07-28)
- [Anthropic: Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol)
- [dsh-mcp-client README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md)
- [mcp-memory 示例配置](https://github.com/deepseek-ai/deepseek-harness/tree/master/examples/mcp-memory)
- [MCP 官方服务器集合（含 server-memory）](https://github.com/modelcontextprotocol/servers)

上一篇：[web-schedule：定时、提醒与 session 内自动化](./31-web-schedule-timer-automation.md)
下一篇：[ACP 协议与 acp-agent：让 agent 之间能通话的标准](./33-acp-protocol-acp-agent.md)
