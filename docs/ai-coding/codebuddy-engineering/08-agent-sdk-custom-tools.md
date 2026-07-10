# 用 Agent SDK 造你自己的编程智能体

我用 CodeBuddy 用了一段时间之后，遇到一个现成形态解决不了的需求。我们团队有个内部的代码审查流程，要对照一份团队规范检查 PR，规范有二十多条，每条都要人去看。我想造一个自动跑这个流程的 Agent，让它读 PR diff、对照规范、输出结构化的 findings。

IDE 和 CLI 都做不到这个。它们是现成的产品形态，你不能把自定义逻辑塞进去。这个时候需要的是 Agent SDK。

这篇讲我怎么用 CodeBuddy Agent SDK 造了一个代码审查 Agent。不是教程，是实战记录。有些细节我可能记得不全，以官方文档为准。

## 什么时候需要 SDK

先说清楚什么时候该用 SDK，什么时候不该。

前面讲的 IDE、CLI、插件，都是用 CodeBuddy 现成的产品形态，覆盖大多数个人开发场景。但有些需求它们做不到：你想把 CodeBuddy 的能力嵌进公司内部的开发平台，你要造一个专门干某件事的 Agent（比如只做代码审查或安全扫描），你需要自定义的工具而现成 MCP 满足不了。

这些场景下你需要 Agent SDK。SDK 给你的是 CodeBuddy agent 能力的编程接口，你用它组装自己的智能体。

不该用 SDK 的情况：你的需求用 IDE 或 CLI 加 MCP 就能满足。SDK 的学习和开发成本不低，如果你的场景是"日常写代码要 AI 帮忙"，用现成形态，不要为了"用 SDK"而用 SDK。

## 理解 Agent 的心智模型

动手之前先建立心智模型。一个 Agent 本质上是一个循环：接收任务，思考（模型推理），调用工具，看工具结果，再思考，再调工具，直到给出最终结果。

这个循环里有三样东西：模型（负责推理和决策）、工具（Agent 能调用的能力）、循环逻辑（什么时候继续、什么时候停）。

IDE 和 CLI 把这三样打包好了，你直接用。SDK 把这三样拆开，让你自己组装。你控制用哪个模型、配哪些工具、循环怎么跑。

SDK 的核心价值在自定义工具这一环。内置工具和现成 MCP 覆盖通用场景，但你公司的部署系统、内部 API、专属工作流，现成工具够不到。SDK 让你把这些接进 Agent。

## 自定义工具长什么样

我翻官方的 SDK Custom Tools 文档，核心包是 `@tencent-ai/agent-sdk`（自定义工具相关的 `createSdkMcpServer`、`tool` 从子路径 `@tencent-ai/agent-sdk/mcp` 导入，`query` 从根包导入）。

一个自定义工具的最小结构，我写的读 PR diff 的工具大概是这样：

```typescript
import { createSdkMcpServer, tool } from "@tencent-ai/agent-sdk/mcp";
import { z } from "zod";

const readPrDiff = tool({
  name: "read_pr_diff",
  description: "读取指定 PR 号的代码变更",
  schema: z.object({
    prNumber: z.number(),
  }),
  handler: async ({ prNumber }) => {
    const diff = await githubClient.getPrDiff(prNumber);
    return { diff };
  },
});
```

几个要点我摸索出来的。

参数用 zod 定义。你用它定义工具接受什么参数、什么类型。Agent 会根据这个 schema 来生成参数。描述很重要，写得清楚，Agent 才知道什么时候该用这个工具、参数怎么传。我一开始 description 写得太简略，Agent 经常不知道该不该调用这个工具，后来写详细了触发才准。

handler 是实际逻辑。工具被调用时执行什么，这里你可以做任何事：调内部 API、查数据库、跑脚本。对 Agent 来说，它只看到一个返回结果。

用 createSdkMcpServer 把多个工具组装成一个 Server，再在 `query` 的 `options.mcpServers` 里挂上去。

## 我的代码审查 Agent

我把整个 Agent 串起来大概是这样。先定义两个工具，一个读 PR diff，一个查团队规范：

```typescript
const readPrDiff = tool({
  name: "read_pr_diff",
  description: "读取指定 PR 号的完整代码变更，返回每个文件的 diff，用于代码审查",
  schema: z.object({ prNumber: z.number().describe("PR 编号") }),
  handler: async ({ prNumber }) => {
    const diff = await githubClient.getPrDiff(prNumber);
    return { diff };
  },
});

const getTeamStandards = tool({
  name: "get_team_standards",
  description: "获取团队的代码审查规范，可按类别筛选",
  schema: z.object({
    category: z.enum(["security", "performance", "style"]).optional().describe("规范类别"),
  }),
  handler: async ({ category }) => {
    return getStandards(category);
  },
});

const reviewServer = createSdkMcpServer("review-tools", {
  tools: [readPrDiff, getTeamStandards],
});
```

然后发起一次带这些工具的查询。审查需要深度推理，我用 R1。系统提示写清楚它该干什么：读 PR diff，对照团队规范，输出结构化审查结果，每个 finding 包含严重级别、位置、问题描述、修复建议，只读不写不直接改代码。

```typescript
const result = query({
  prompt: "审查 PR #42，重点关注安全和性能",
  options: {
    model: "deepseek-r1",
    systemPrompt: `你是代码审查员。读取 PR diff，对照团队规范，
      输出结构化审查结果：每个 finding 包含严重级别、位置、问题描述、修复建议。
      只读不写，不直接改代码。`,
    mcpServers: { "review-tools": reviewServer },
  },
});

for await (const message of result) {
  console.log(message);
}
```

这个 Agent 跟我在 IDE 里手动开 Craft 模式改代码完全不同。它是一个专门化、可嵌入、可复用的智能体，接进工单系统或 CI，就能自动化地跑代码审查。我把它接进了我们的 PR 流程，现在每个 PR 进来自动跑一遍，产出 findings 供人参考。

## 工具设计的几个教训

写过几个自定义工具后，我摸到一些规律，多数是踩坑得来的。

工具粒度别太细。我一开始把工具拆得很细，读 diff 一个、解析 diff 一个、匹配规范一个、生成 finding 一个。结果 Agent 要调四五个工具才能完成一次审查，推理链条太长，出错概率高。后来把相关的操作合并成一个工具，让 Agent 一次调用做完一件事，成功率上来了。

描述要写给 AI 看。description 不是给人看的注释，是告诉 Agent 这个工具干什么、什么时候该用。我最初写成"读取 PR 变更"这种简短描述，Agent 经常误判。后来改成"读取指定 PR 号的完整代码变更，返回每个文件的 diff，用于代码审查"，触发才精准。

只读工具和写工具分开。审查类的工具绝不能有写权限。我把只读工具和写工具做成独立的 Server，按需挂载，降低误操作风险。

返回结构化数据。工具返回结构化结果（比如 JSON），而不是大段文本。Agent 解析结构化数据更准，也省 token。

## SDK 的边界

SDK 很强大，但也要说清楚它的边界。

学习成本不低。你得理解 Agent 循环、工具定义、模型选择、上下文管理。这不是装个插件就能用的东西，是开发任务。我花了一周才把第一个 Agent 跑通，中间踩了不少坑。

调试有难度。Agent 行为不完全确定，同样的输入，可能走不同的工具调用路径。调试自定义工具时要习惯这种不确定性，做好日志和可观测性。我有一次同一个 PR 跑两次得到不同的 findings，排查了半天才发现是模型推理路径不同。

不是所有场景都值得。如果你的需求是"我写代码时 AI 帮我补全"，用 IDE 或插件就好，不要上 SDK。SDK 适合"现成形态做不到、且有复用价值"的专属场景。我那个代码审查 Agent 造一次用无数次，值得。但如果只是临时需求，不值得投入。

## 一个判断

Agent SDK 是 CodeBuddy 能力的最深层，把 agent loop 嵌进你自己的系统，造专属智能体。

现成形态够用就别上 SDK，它的学习和开发成本不低。SDK 的核心价值在自定义工具，把你公司的专属工作流接进 Agent。工具设计是关键，粒度、描述、只读写分离、结构化返回，这几条决定了 Agent 好不好用。

适合有复用价值的场景，比如代码审查 Agent、安全扫描 Agent，造一次用无数次。这是我自己造了一个之后真实感受到的价值。

---

*基于 2026-07 的产品状态。SDK API 参考 [CodeBuddy SDK Custom Tools 官方文档](https://www.codebuddy.ai/docs/zh/cli/sdk-custom-tools)（要求 Agent SDK v0.1.24+，Preview 功能）。真实包为 `@tencent-ai/agent-sdk`：`createSdkMcpServer`、`tool` 从子路径 `@tencent-ai/agent-sdk/mcp` 导入，`query` 从根包导入；工具用 `schema`+`handler` 定义，参数用 `zod`。代码示例已对照官方文档校正，但 API 仍可能随版本变化，使用前请查阅最新文档。*
