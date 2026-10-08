# 第一个 agent：从安装到看懂它的输出

> 更新日期：2026/10

**TL;DR：** 跑通一个 Agent SDK 的最小 agent 只需要三步：装包（Python 用 uv，TypeScript 用 npm）、设好 ANTHROPIC_API_KEY、调 query() 并用异步循环接住事件流。真正的分水岭不在跑通，而在看懂输出：流里那几种消息分别是什么、任务怎么结束、错了长什么样。这篇把三步走完，然后把输出逐类拆给你看，再处理三个第一周必撞的安装错误。

## 我们要构建什么

目标定得具体：一个能读指定目录里的代码文件、找出明显 bug、报告结论的最小 agent。它不改文件、不跑 shell 命令，只用只读工具。这个范围刻意压小，第一课的任务是把"程序、引擎、事件流"三者的关系建立起来，炫功能轮不到这一课。范围里的每个元素都有用意：读代码需要文件工具，找 bug 需要多步推理，报告结论需要你解析最终消息。麻雀虽小，循环俱全。

官方 quickstart 用一个带两处故意 bug的小工具文件当测试对象：一个计算平均值的函数在空列表上会除零，一个取用户名的函数在空入参上会抛类型错误。这个 fixture 很适合复用，你自己手写一个类似的十行文件即可，两处 bug 分别是"数学边界"和"空值边界"，能逼着 agent 真的去读代码而不是瞎猜。

## 第一步：装环境

两个语言选一个。Python 要 3.10 以上，推荐用 uv 管环境：

```sh
uv init upgrade-bot
cd upgrade-bot
uv add claude-agent-sdk
```

TypeScript 要 Node 18 以上：

```sh
mkdir upgrade-bot && cd upgrade-bot
npm init -y
npm pkg set type=module
npm install @anthropic-ai/claude-agent-sdk
npm install --save-dev tsx
```

两个细节值得停留。`npm pkg set type=module` 把项目标成 ES module，这样顶层 await 才能用，SDK 的示例代码全部假设这一点；如果你的项目是 CommonJS，把脚本命名成 .mts 后缀可以达到同样效果。tsx 是让 TS 直接跑的解释器，省掉编译配置，学习阶段够用。

装包成功的标志在 npm 侧是输出里出现 added 若干 packages。更重要的是确认二进制进来了：SDK 在绝大多数平台会把 Claude Code 的原生二进制作为依赖一起装上，这个二进制就是你的引擎。后面排错一节会讲它偶尔缺席的情形。

## 第二步：认证

在运行 agent 的那个 shell 里导出 API key：

```sh
export ANTHROPIC_API_KEY=sk-ant-xxxxx
```

一个高频踩点写在这里：**SDK 不会替你加载 .env 文件**。很多框架惯例是自动读项目根目录的 .env，这里没有这个行为，key 不在进程环境变量里，第一次运行立刻报 Not logged in 或 Invalid API key。要在 Python 里用 dotenv 就自己 import 并调用，要在 TS 里用 dotenv 就自己 require 并 config，SDK 不管这段。

企业环境走 Bedrock 或 Vertex 时，换成对应的一组环境变量（CLAUDE_CODE_USE_BEDROCK 之类），认证语义相同：引擎从环境里找凭据，找不到就拒绝启动。

## 第三步：最小程序

Python 版的主程序长这样（展示结构，照抄可运行）：

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    options = ClaudeAgentOptions(
        allowed_tools=["Read", "Glob", "Grep"],
        permission_mode="default",
    )
    async for message in query(
        prompt="读 ./src 目录，找出里面可能的 bug，逐条报告文件名、行号和原因",
        options=options,
    ):
        print(message)

asyncio.run(main())
```

TypeScript 版结构一致：

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

const options = {
  allowedTools: ["Read", "Glob", "Grep"],
  permissionMode: "default",
};

for await (const message of query({
  prompt: "读 ./src 目录，找出里面可能的 bug，逐条报告文件名、行号和原因",
  options,
})) {
  console.log(message);
}
```

运行分别是 `uv run main.py` 和 `npx tsx main.ts`。

这段十行的程序里有两个设计要专门说一下。第一个是 query() 的形状：传一个任务进去，拿一个异步迭代器出来。你的程序和引擎的全部交互都压缩在这一个函数调用里，后面无论功能多复杂，交互面的入口不变。第二个是 allowed_tools 这个选项：它把文件读取、文件名匹配、内容搜索三个工具设为免批准，其余工具保持默认审批流程。工具集和权限的边界从第一行代码就开始控制，这是 SDK 区别于 CLI 脚本调用的核心价值，权限细节后面有专门篇幅，这里先建立"工具白名单"的手感。

## 读懂输出：流里的五种消息

程序跑起来后终端会滚过一大片输出。新手常犯的错误是把它当日志扫一眼就过，其实逐类看懂这片输出，比多写十行代码更有用。默认配置下你会看到四类，第五类要开选项。

第一类是 SystemMessage，任务开始时最先出现，subtype 为 init。它携带会话元数据，其中最有用的是会话 ID，TS 版直接在这个消息上读 session_id，Python 版在 data 字段里取。把这个 ID 存下来，你的程序就从"发完即忘"升级到"可续会话"。

第二类是 AssistantMessage，模型的发言。一条这类消息对应一个内容块：要么是一段推理文本，要么是一次工具调用。模型一次回复里有多个块时，它们共享同一个消息 ID。你会在流里看到它"说要读某个文件"，紧跟着下一类消息把读取结果递回去。

第三类是 UserMessage，工具执行结果。名字容易误导，这条消息跟用户敲的字没有关系，它是系统在每轮工具执行后回灌给模型的结果载体。AssistantMessage 和 UserMessage 交替出现，就是 agent 循环的心跳：模型决定调工具，引擎执行，结果回流，模型继续。

第四类是 ResultMessage，循环结束的标志。它携带最终文本、token 用量、花费、轮数和会话 ID。subtype 字段值得逐个认识：success 是唯一带最终文本的；error_max_turns 表示轮数上限被打穿；error_max_budget_usd 表示预算上限；error_during_execution 是执行期异常。第一次调试时先看 subtype 再看别的，能省一半时间。

第五类是 StreamEvent，默认关闭。在选项里打开 include_partial_messages 之后，流里会混进模型的原始增量事件，text_delta 一块一块地吐文本。做实时界面的程序需要它，只关心最终结果的程序不要开，开了只会增加噪音。这五种消息构成了 SDK 的输出全景，后续所有功能都在这五种之上做文章。

还有一个容易被忽略的细节：ResultMessage 之后流可能还有少量尾部事件，比如系统附带的建议类消息。迭代循环要跑完，不要拿到结果就 break，否则会错过会话收尾信息。

## 给它加一点危险的能力

最小程序只读不写。现在做第二个实验：把 allowed_tools 里加上 "Edit"，permission_mode 换成 "acceptEdits"，让 agent 真的去修那两个 bug。再进一步，加 "Bash"，它就能跑测试验证修复。

这三档能力递进对应三种信任级别：只读工具让 agent 能看，Edit 让它能改，Bash 让它能跑命令。官方文档对这一层级的表述很直白：Read、Glob、Grep 是只读；加 Edit 就能改代码；加 Bash 就是完整自动化。给权限时按这个阶梯逐级放，不要一上来全给。第一课的原则是：agent 的能力边界由你在代码里划定，划定的动作本身就是产品决策。

## 三个第一周必撞的错误

认证错误排第一。报 Not logged in 或 Invalid API key，原因几乎总是 key 没在运行 agent 的那个 shell 里。注意是"运行 agent 的 shell"，不是你写代码的编辑器环境。虚拟环境激活与否、CI 里的 secret 注入与否，都归因到同一个检查点：printenv ANTHROPIC_API_KEY 看一眼。

第二常见的是二进制缺失。症状是启动即失败，提示找不到可执行文件。Python 的 pip 在个别平台（文档点名 Windows ARM64 的源码发行版）不带二进制，TS 侧的诱因通常是装依赖时加了 --omit=optional，npm 的 optional 依赖里装的就是二进制，跳过它等于把引擎扔了。修复方式两种：重装时不省略 optional 依赖；或先原生安装 Claude Code，让 SDK 从 PATH 找到它，必要时用 pathToClaudeCodeExecutable 选项显式指路。

第三个坑是类型判断写错。Python 用 isinstance(message, SomeType) 判断消息类型，TS 判断 message.type 字段。两边的类型体系有细微不对称（TS 把部分系统子类型拆成了独立类型），照着单一语言的示例代码翻译到另一门语言会踩坑。写成三分支分发（System / Assistant / Result）先跑通，再补全类型。

## 权衡与局限

最小程序跑通之后，值得泼一点冷水。第一，它没有任何审批界面：permission_mode 为 default 时，未白名单的工具调用会请求批准，而你的十行程序还没有处理批准的代码，这类调用会被挂起。要把审批接进你的程序，需要审批回调，那是流式输入一节的内容。第二，它是单发单收的：一次 query 一个任务，任务结束进程结束，多轮对话要靠会话机制续。第三，输出是原样打印的，生产程序需要按消息类型分发处理，而不是 print 整个对象。

这些局限是教学范围刻意留下的缺口，每一个都对应后续一个专题。第一课的完成标准只有一条：你能指着滚动的输出，说出每一行属于哪类消息、处在循环的哪个阶段。

## 完成的自检

跑通之后用三个问题自测，都答得上，第一课才算过关。

第一问：不看文档，说出流里五类消息的顺序和判定方法。答不上就回去把"读懂输出"一节再过一遍，后面所有功能都长在这五种消息上。

第二问：你的 agent 现在能做什么、不能做什么，分别列出清单。能做什么看工具集（只读三件套就是能读能搜能引用），不能做什么也看工具集（没有编辑工具就是改不了任何文件）。这一问训练的是"能力由工具集定义"的手感，它是后面权限配置的直觉基础。

第三问：如果把 allowed_tools 里的 Glob 去掉，agent 的行为会怎么变。答"它会少一个搜索文件名的工具，遇到需要按名字找文件的场景会退化或绕路"是对的；答"会报错"是错的（工具不在视野里不是错误，这个语义前面埋过、后面还会反复出现）。

三问都过，你对这个最小程序的理解就不止于"它能跑"，还到得了"它为什么这样跑"。

## 关键要点

- 三步跑通：装包、导出 key、query() 接事件流；SDK 不加载 .env，认证错误先查 shell 环境。
- 输出五种消息：init 系统消息拿会话 ID，Assistant 与 User 交替是循环心跳，Result 的 subtype 决定你怎么处理结局。
- 权限按三档阶梯给：只读、Edit、Bash，逐级放行。
- 二进制缺失的两个诱因：pip 源码包不带、npm --omit=optional 跳过。
- 迭代循环跑完整条流，Result 之后还有尾部事件。

## 延伸阅读

- [Agent SDK Quickstart（官方）](https://code.claude.com/docs/en/agent-sdk/quickstart)
- [Streaming vs Single Mode（官方）](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)
- [Agent SDK Overview（官方）](https://code.claude.com/docs/en/agent-sdk/overview)
