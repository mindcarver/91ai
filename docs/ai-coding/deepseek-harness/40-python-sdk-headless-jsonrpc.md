# dsh 的 Python SDK、Headless 与 JSON-RPC：把 agent 编进流水线

> dsh 不只有 Web UI。把它嵌进自动化流程有三种姿势，复杂度递增：headless 用一条命令跑一次性任务，Python SDK 把 agent 当库调，JSON-RPC 是两者脚下共用的 stdio 协议。三种姿势跑的是同一套 agent 组合，差别只在谁来驱动 turns、怎么收结果。
> 两条最容易踩的边界：runtime 的 stdout 归协议所有，混进任何日志都会破坏通信，诊断信息一律走 stderr；默认组合 sdk-minimal 把权限钉死在 danger-full-access，agent 能做 runtime 进程能做的任何事，安全不靠权限策略兜底，靠一次性 checkout 或容器兜底。

![三种自动化入口](imgs/40-01-three-entry-modes.webp)

## 流水线要的是什么

Web UI 是给人用的：人在对话框里发任务，看 agent 干活，必要时点个批准。把 agent 编进 CI、批处理或你自己的程序时，需求完全变了。没有人坐在屏幕前，没有可点的批准按钮，任务来自上一步的输出，结果要交给下一步消费。此时一个交互式 UI 不但帮不上忙，还是障碍：你没法在流水线里"打开一个页面"。

dsh 为这类场景提供了三个入口，按嵌入深度排：

| 姿势 | 是什么 | 适合 |
|---|---|---|
| Headless（`dsh --profile headless`） | 命令行一次性 runner：接一个任务字符串（或从 stdin 读），创建或续用一个会话，跑完，打印最终 assistant 文本，退出；`--json` 换成事件流输出 | shell 里"给我跑一个任务拿结果" |
| Python SDK（`deepseek-harness-sdk`） | 把 dsh 当 Python 库用：`DeepSeekHarness` 管 runtime 生命周期，`Session.run()` 发任务收结果 | Python 程序里编排 agent、复用会话 |
| JSON-RPC runtime | 底层 stdio 协议，headless 和 SDK 的地基 | 用的不是 Python，自己实现协议客户端 |

三者共享同一套 Cordis 组合，模型、工具、持久化完全一致。选哪个不看功能强弱，看驱动方是谁：shell 拿一次性结果，Python 进程做编排，其他语言直接说协议。给三个具体场景定位：CI 里挂一步"自动修测试"，headless 一行命令嵌进 YAML 就完；自己的服务里跑一个"每晚巡检仓库并开 issue"的循环，Python SDK 管生命周期、按天分 session；团队的工具链是 Go 写的，想内嵌 agent 能力，直接实现 stdio 协议客户端。同一个任务从 headless 迁到 SDK 不需要改任何 agent 侧的东西，改的只是驱动代码。

![Headless 一次性 runner](imgs/40-02-headless-one-shot.webp)

## Headless：一条命令，一个会话，一次退出

最直接的用法一行：

```sh
pnpm dsh --profile headless "fix the failing test in this workspace"
```

它做的事：接收一个非空任务字符串（位置参数缺省或为单独的 `-` 时从 stdin 读整段），创建并持久化一个全新会话，或者用 `--session-id` 续用一个已存的会话，然后打印最终 assistant 文本，退出。不开 server，不起 UI，没有任何交互。

这个 profile 的组合值得看一眼，因为它声明了"无人值守的 coding agent 长什么样"：它踩在共享核心 `dsh-base` 之上，继承模型适配、沙箱、审批、工具注册表和安全默认值，自己只补三样：无人值守的启动器（解析任务文本和选项）、runner 驱动器、退出语义（最后一个 turn 正常完成返回 0，其余一律返回 1），并关掉 Web 侧默认开启的热载。官方文档特意强调它"不是第二个产品入口"：headless 不是和 Web UI 并列的另一个产品，而是同一棵共享核心换了个无人值守的驱动器。这个定位决定了它没有也不该有自己的专属功能，组合里多出来的每样东西都得在两种入口下都成立。

凭证走环境变量：`DEEPSEEK_API_KEY` 必须在环境或仓库根目录 gitignore 的 `.env` 里；模型走 OpenAI 兼容代理时加 `DEEPSEEK_BASE_URL`，默认打公开 API。

输出有一条明确的分界。默认模式下 stdout 只有一行最终答案，模型的推理过程走 stderr（每段带 `dsh:` 前缀），中间的工具输出不打印；监督进程要机器可读的进展时，`--json` 把最终文本那行换成按行分隔的 JSON 事件流，以 `session` 事件开场、`final` 事件收尾，中间是 status、text、thinking、tool_call、tool_result。这条流是投影不是日志：除 final 外每个字符串封顶 8 KiB，投影没建模的事件不会出现，要无损记录去会话 JSONL 里找。一个相关事实不变：子会话不会作为独立条目出现在输出里，它们只通过父会话的工具事件和结果可见。

`--session-id` 的续用语义也值得点名。传入一个已存的会话号，runner 采用那份持久会话继续对话；会话号不存在，任务开始之前就失败，不会悄悄开一份空历史。采用有边界：换过工作目录的会话、子会话、fork 出来的会话、跑在别的 agent 预设下的会话，一律拒绝，一个监督进程没法悄悄顶替别人的对话。

![Headless 输出边界](imgs/40-03-headless-output-boundary.webp)

### SSH 远程工作区 overlay

headless 有一个变体值得知道：远程工作区。SSH 家族把本地的文件系统和子进程 provider 整体指向一台远程 POSIX 机器，模型可见的工具保持原样。效果是 agent 的文件读写、Bash、沙箱、终端全在远程执行，而 Cordis 编排、模型调用、会话状态、日志留在本地。官方明确 headless 类 profile 支持这种排布；浏览器界面的工作区路径仍然假设本地文件系统，完整的远程体验目前在命令行侧。

这条边界要划准。远程执行的前提全部前置：连接用部署方预先配好的 OpenSSH 主机别名，认证和主机密钥启动前就绪，运行时不做任何交互式认证；远程机器上预装 helper 和 Node，产物用 SHA-256 摘要钉死；断线不重连不重放，待决操作直接失败，最后一步成没成要由调用方决定是否重来。它不是"云上的一次性沙箱"：远程那台机器就是工作区，文件是持久的，环境是你配的。

价值取向和容器里跑 danger-full-access 一脉相承：模型驱动的文件改动和命令执行落在远程机器上，宿主机只留编排和日志，agent 犯错时爆炸半径别落在你的笔记本上。

![SDK 捆绑 runtime](imgs/40-05-sdk-bundled-runtime.webp)

## Python SDK：把 agent 当库用

推荐给集成方的入口是 Python SDK。前置条件写在教程里：Python 3.10 以上、Git，平台支持 Linux x64、Linux arm64 和 macOS 14 以上的 arm64。安装一条命令：

```sh
python -m pip install deepseek-harness-sdk
```

一个命名差异先记住：PyPI 上叫 `deepseek-harness-sdk`，import 时叫 `deepseek_harness`。发行名和模块名不一致，报错找不到模块时先检查是不是 import 错了名字。

安装路径有两条，对应两种用法。纯使用：任何机器上 pip 装 SDK 就够，捆绑 runtime 自带，你的程序跑起来不依赖仓库。要跑官方示例：克隆仓库、起 venv、再装 SDK，因为 `minimal.py` 这类示例脚本在仓库的 `python/sdk/examples` 目录里，PyPI 包不带它们。第一条路是生产用法，第二条路是学习用法，分清楚能少踩"为什么 pip 装完找不到 examples"的迷惑。

安装 SDK 会同时装上严格同版本的 `deepseek-harness-runtime-bin` 平台 wheel，两个包的版本钉在一起，由仓库根 `package.json` 的共同版本号驱动。这个 wheel 里装的是真正的运行时：一个单文件 Node 可执行程序 `dsh-jsonrpc-agent-pkg-<platform>-<arch>`，外加一个 ripgrep 边车（`-rg` 伴随文件）。目标机器不需要装 Node.js，Node 运行时被编译进了这个可执行文件。平台覆盖是固定的三个组合：`linux-x64`（wheel 标签 `manylinux_2_28_x86_64`）、`linux-arm64`（`manylinux_2_28_aarch64`）、`macos-arm64`（`macosx_14_0_arm64`，保守对齐捆绑 Node 24 可执行文件的 macOS 13.5 部署目标）。不发布源码包。macOS wheel 额外带一个给 node-pty 用的原生 spawn-helper，Linux 用 staged 的 pty.node 插件。一条硬规则：边车文件缺失是启动期硬错误，哪怕你的配置根本不用文件搜索或 PTY，完整性检查照样让进程起不来。宁可拒绝启动，不带病运行。

还有一个仅供开发的运行时载体：完整的 `runtime/node/` 目录闭包，用系统 Node 22.19 以上直接跑，执行 `dsh-sdk-jsonrpc-demo` 的 packaged-bin。它永远不会被自动选中：模式选择的优先级是显式参数高于 `DSH_RUNTIME_MODE` 环境变量（取值 exe 或 node），都缺省时自动解析只找生产 exe。生产部署绝不会悄悄跑在源码构建上，这是刻意钉死的。

![DeepSeekHarness 生命周期](imgs/40-06-sdk-lazy-lifecycle.webp)

## 最小用法与生命周期

三行就是全部：

```python
from deepseek_harness import DeepSeekHarness

with DeepSeekHarness() as harness:
    result = harness.run("Say hi.")
```

`DeepSeekHarness` 懒启动 runtime 子进程：第一次 `run()` 时才拉起，之后跨调用复用同一个进程，退出 with 块或显式调 `close()` 时清理。这个设计意味着反复发任务不会反复付启动成本，一次冷启动摊到整个程序生命周期里。批处理 100 个文件就是这样写的：一个 with 块里循环 100 次 `run()`，每次新的 session id，runtime 进程从头到尾只有一个。runtime 子进程继承你的环境变量，`DEEPSEEK_API_KEY` 和 `DEEPSEEK_BASE_URL` 直接透传给模型适配层，不需要在两套配置里各写一遍。

![构造参数的去向](imgs/40-07-constructor-parameters.webp)

### 构造参数

要指定 provider、模型、工作区、会话，在构造时传关键字参数：

```python
with DeepSeekHarness(
    provider="deepseek-official",
    model="deepseek-v4-flash",
    max_tokens=49_152,
    cwd=str(workspace),
    session_root=str(sessions),
    cordis=str(config),
) as harness:
    result = harness.run(
        "Inspect the repository and fix the failing tests.",
        session_id="example-001",
    )
```

逐个看语义。`provider` 选组合里注册的 provider 路由，捆绑默认组合注册的是 `deepseek-official`。`model` 是适配器解析的模型 id，它随每个会话的 initialize 请求经 JSON-RPC 传给 runtime，组合配置自己不钉模型；官方示例脚本 `minimal.py` 的解析顺序是命令行 `--model` 优先，然后 `DSH_MODEL` 环境变量，最后落到 `deepseek-v4-flash`。组合的入口有两档：`profile` 参数选内置组合（示例脚本默认 `sdk-minimal`），`cordis` 参数指向你自己的组合配置文件，二者取一。`max_tokens` 是可选的正整数，作为 root agent 及其进程内后代单次请求的输出 token 上限，不传就留给 provider 默认；压缩摘要不吃这个上限，摘要调用有自己的独立限额，来自压缩插件自己的配置。`cwd` 和 `runtime_cwd` 在子进程启动前就解析成绝对路径，再进环境注入和握手。`session_root` 是设置 `DSH_SESSION_ROOT` 的高层便捷参数；部署 persona 和持久化策略归 `cordis.yml` 管，不要塞进构造参数。

![RunResult 的六个字段](imgs/40-08-runresult-six-fields.webp)

![owned interval 时间边界](imgs/40-09-owned-interval-timeline.webp)

### RunResult 的六个字段

`Session.run()` 返回的 `RunResult` 有六个字段，两个字段描述结果，四个字段描述过程。

`session_id` 是会话标识。`final_response` 是 interval 内最后一条已提交的 root 会话 assistant 文本。`finish_reason` 是 interval 内最后一条 root 会话 `turn/end` 的 kind，取值如 `completed`、`max-tokens`、`error`，没有 turn 结束时为 None。`events` 只含 root 会话的事件，后代消息不能顶替 root 的回复，这个限制保证了"最终答案"永远来自你直接对话的那个 agent。`notifications` 反过来横跨整个进程树：root 和所有已知后代的通知，按 wire 顺序排列，嵌套的 subagent 生命周期和会话事件都在里面，祖先链在 runtime 进程的整个生命周期里保留；配套还有 `on_notification` 回调，不想事后翻列表可以流式消费。`session_root` 是 JSONL 会话目录。

最重要的限定是 owned interval 的边界：`Session.run()` 拥有的区间从你的 prompt 被持久 inbox 签收开始，到下一个 whole-agent idle 为止。`final_response` 和 `finish_reason` 描述的是这个区间，不是对你那句 prompt 的因果归因。区间内如果有 steering、注入的 context 或其他排队的工作，它们的结果也会算进来。

拿一条具体时间线看这个语义怎么落地。你的程序在 agent 正跑着上一个任务时投了一句新 prompt：消息先落进持久 inbox（这一刻就是 interval 的起点，签收即拥有），此时 agent 还在忙；跑到一半你又通过别的通道注入了一条 context；上一个任务结束，agent 开始处理队列，先消化你的 prompt，再消化注入的 context，期间一个 subagent 被派出去又回来；最后整棵进程树安静下来，whole-agent idle 到达，interval 关闭。`final_response` 取的是这条时间线上最后一条已提交的 root 回复，它可能同时回应了你的 prompt 和那段注入。你觉得"答非所问"时，先查 `events` 和 `notifications`，看区间里到底还发生过什么，而不是假设 runtime 弄丢了因果。idle 是唯一干净的切割线，拿"我发的那句话"切割在并发排队面前没有良定义，这个语义是有意选的。

两个进阶出口。低层的 `HarnessClient.session_prompt()` 把消息入队后立刻返回 MessageId，不等结果；绕过 `Session.run()` 用它，活动边界的所有权就归你自己。协议侧的纪律是：一条 `turn/end` 缺了字符串形式的 `data.reason.kind` 就违反协议，SDK 直接抛 `SdkProtocolError`（`python/sdk/src/deepseek_harness/api.py` 的 `finish_reason` 里实现），不会静默吞掉畸形事件。错误类型一共四层：`HarnessError` 基类、`TransportClosedError`、`SdkProtocolError`、带 code 的 `JsonRpcError`，按故障位置选捕获层级。

![子进程与协议的设计理由](imgs/40-10-subprocess-protocol-rationale.webp)

## 为什么是子进程加协议，不是原生绑定

看到"Python 包里捆一个可执行文件"，第一反应可能是为什么不做一个纯 Python 的原生绑定，省掉子进程和序列化。这套设计有三层理由，每层都能落到具体后果。

第一层是语言中立。runtime 的对外接口是 JSON-RPC over stdio，Python SDK 只是众多可能的客户端之一，任何能开子进程、读写管道的语言都能驱动同一个 runtime。headless 命令、Python SDK、你手写的 Go 客户端，走的完全是同一条协议，dsh 不需要为每种宿主语言维护一份绑定。代价是跨语言的中立性换来一条进程边界，调用成本比函数调用高，但 agent 的单次 run 本来就以秒计，进程边界的开销消失在噪声里。

第二层是故障隔离。agent runtime 跑的是模型驱动的工具执行，一个模型幻觉出来的 `rm` 或一段卡死的 PTY 都在 runtime 进程里发酵。子进程模型下 runtime 崩了，你的 Python 进程还活着，能拿到非零退出码、能重启、能把现场写进自己的日志；反过来你的程序崩溃，with 块的清理路径把 runtime 一并收走，不留孤儿进程占着会话锁。

第三层是版本钉死。SDK 包和 runtime 包严格同版本发布，你 pip 装进来的就是你测过的，不存在"我机器上的 Node 版本和你不同导致行为漂移"这一整类问题。这也是捆绑单文件可执行文件的动机：把 Node 运行时、依赖闭包、ripgrep 边车全部封进一个产物，部署面上只剩一个变量，就是平台对不对。

![CI 自动修测试走查](imgs/40-11-ci-integration-walkthrough.webp)

## 一次 CI 集成的完整走查

把前面的机制串成一个真实场景：在 CI 里让 agent 修失败的测试。按时间线走一遍，每步标注决策依据。

流水线起一个干净容器，checkout 代码到 `/workspace`。装 SDK，这一步装上的 runtime 可执行文件和 SDK 同版本，容器里没有 Node 也不影响。构造 harness：`cwd` 指向 `/workspace`，`session_root` 指向 CI 的 artifact 目录，让会话日志跟着构建存档，事后排查有据可查。`session_id` 用构建号拼出来，比如 `ci-1234-fix-tests`，全新任务全新 id，不复用历史。

发任务，prompt 就是"fix the failing test in this workspace"。interval 从签收开始，agent 读代码、跑测试、改文件、再跑测试，可能派 subagent 分头查，这些对 CI 全部不可见也不需要可见，CI 要的只有结果。run 返回后先看 `finish_reason`：`completed` 走正常产物流程；`max-tokens` 按你的评测口径决定算过还是不算（`DSH_MAX_TOKENS_AS_SUCCESS` 控制：完整 `sdk` 组合默认 true 接受截断结果，minimal 组合直接钉死 false，把超长任务显式筛出来让人看）；`error` 直接让 job 失败并归档 `session_root` 下的 JSONL。

artifact 里的 JSONL 日志是这个方案真正的调试资产：每一次模型请求、每一次工具调用、每一轮 turn 的结束原因都在里面，`finish_reason` 说 error 时，答案在日志里而不在 CI 控制台那几行 stdout 里。这也是为什么不鼓励解析 headless 的 stdout：同样的信息在会话日志里有规范格式，控制台输出是给人的，日志才是给机器的。

容器销毁，runtime 随之清理，没有状态残留。下次构建新容器、新 checkout、新 session id，从头来过。danger-full-access 在这个故事里不吓人，因为 agent 能碰到的"任何路径"就是一个用完即弃的 checkout，权限策略不需要精确，环境边界已经精确了。

![SDK 配置注入规则](imgs/40-12-config-injection.webp)

![完整组合与 minimal 的差异](imgs/40-13-full-vs-minimal-composition.webp)

## 配置注入的规则

runtime 对配置的态度很强硬：永远要求显式配置，`DSH_CORDIS_CONFIG` 或 argv 位置参数二选一，都没有就直接退出。它自己不做任何配置回退。

那你什么都不传也能跑，是因为 SDK 客户端在包装层做了注入（`python/sdk/src/deepseek_harness/client.py` 的 `start()`）：启动解析到捆绑 runtime、你没传 `cordis`、`DSH_CORDIS_CONFIG` 为空，三个条件同时满足时，SDK 把 runtime wheel 里检入的默认 `runtime/cordis.yml` 通过 `DSH_CORDIS_CONFIG` 传进去。这是显式的参数传递，不是 runtime 的回退逻辑，两层的责任分得很清。反过来，显式指定 `runtime_bin`、`bridge_bin` 或 `launch_args_override` 会完全禁用注入，你要自己负责配置从哪来。

默认配置包含：stdio JSON-RPC server、agent core、预载的 DeepSeek 适配器、带语义 checkpoint 策略的 JSONL 持久化、本地 bash、用于有界加载工作区指令的本地文件系统 provider。跑自己的组合时有一条不能省：配置里必须保留 `@deepseek-ai/dsh-sdk-jsonrpc-server` 条目，它是 serving 接口，文档的原话是没有它"启动的 agent 没有对外通道"。

runtime 继承的正常环境变量表：

| 变量 | 用途 |
|---|---|
| `DEEPSEEK_API_KEY` | 传给 OpenAI 兼容端点的凭证 |
| `DEEPSEEK_BASE_URL` | `dsh-llm-deepseek` 使用的端点 |
| `DSH_CWD` | bash 和文件系统工具的 agent workspace |
| `DSH_CONTEXT_WINDOW` | 极简变体里给 `DSH_MODEL` 目录条目记录的上下文容量 |
| `DSH_MODEL` | 示例脚本的默认模型，显式参数可覆盖 |
| `DSH_SESSION_ROOT` | JSONL 会话目录 |
| `DSH_SYSTEM_PROMPT` | 部署提供的 coding persona，缺省回落到内置提示 |
| `DSH_MAX_TOKENS_AS_SUCCESS` | 完整 sdk 组合默认 true、minimal 组合钉 false，控制 token 受限的 turn 算不算可接受结果 |

`DSH_MAX_TOKENS_AS_SUCCESS` 值得多看一眼，它是评测场景的开关。token 上限截断的 turn 默认被当成可接受结果，`finish_reason` 里保留 `max-tokens` 的原始记录；设成 false 则报告为错误。跑评测时两种口径各有用处：接受截断能看到"尽力而为的答案"，拒绝截断能把超长任务显式筛出来。

### 两个内置组合的分寸

SDK 现在带两个内置组合，分寸值得细看。`sdk` 踩在共享核心 `dsh-base` 之上：完整工具集、凭据管理、持久化、遥测一样不少，自己只补编程式 persona（系统提示声明模型名和工作目录）、JSON-RPC 服务器，并关掉热载。`sdk-minimal` 反过来，一棵全显式的独立树：内核每一行服务都自己声明，不用的一律不挂，模型可见的面收窄到持久 bash（超时 300 秒）这一档，JSONL 持久化显式关掉压缩。示例脚本默认走 minimal，要完整能力时把 `profile` 换成 `sdk`。

两档的差异有实惠的判断价值。完整组合跑到上下文吃紧会自动收窄历史，任务能继续；minimal 的会话会在窗口耗尽时撞上限。跑长任务的自动化选组合时，把"有没有压缩"当成和"有哪些工具"同级的条件来筛，minimal 的极简是为了确定性和可枚举，不是为了生产吞吐。MCP 客户端两档都能用 stdio 和 Streamable HTTP 两种 transport；资源（Resources）的发现有共享核心里的专门插件行负责，minimal 树里也显式挂了这一行。

还有一个安全上的分档要记住：minimal 树把沙箱模式钉死在 danger-full-access，token 受限的 turn 也钉死按失败处理；完整 `sdk` 组合继承共享核心的 workspace-write 默认和 token 受限默认可接受。两档不是强弱关系，是两种立场：minimal 假设你拿它当评测和编排的确定性底座，完整组合假设你拿它当产品。

![JSON-RPC stdio 管道纪律](imgs/40-14-jsonrpc-stdio-discipline.webp)

## 自己写协议客户端要知道的事

用不上 Python 的场景（Go 的工具链、Rust 的批处理器、一个 shell 脚本）可以直接对 JSON-RPC stdio 编程。官方文档没有公布方法级的协议细节，但客户端一侧的义务是明确的，把它们当成检查清单。

进程怎么拉：spawn 捆绑的可执行文件，配置必须显式给，`DSH_CORDIS_CONFIG` 指向路径或 argv 里放一个位置参数，两样都没有进程直接退出。配置内容必须包含 `@deepseek-ai/dsh-sdk-jsonrpc-server`，它是 serving 接口，缺了它 agent 起得来但没有对外的通道，你握着一根连不到任何人的管道。环境变量是配置的一部分：`DEEPSEEK_API_KEY` 这类凭证靠进程继承传进去，你的客户端别把它们写进协议消息。

管道纪律是双向的。runtime 侧 stdout 归协议、诊断走 stderr，文档反复强调；你这边对称成立：自己客户端的任何 print、日志、进度条只要落到 stdout，混进的就是同一条协议流。这是自写客户端最常见的翻车点，调试期就把客户端自己的输出全部锁到 stderr。

消费侧的语义照抄 SDK 的经验。prompt 入队拿到 MessageId 就返回，活动边界自己定义；`turn/end` 必须带字符串形式的 reason kind，缺了就是协议错误，按错误处理而不是跳过；通知流横跨 root 和全部后代，想看到 subagent 的动静就得消费通知，只盯响应会漏掉半棵进程树。仓库里 `python/sdk/examples/minimal.py` 是一个现成的最小驱动样本，命令行上直接给 workspace、dsh-home、session-id 和任务串就能跑，写客户端之前先读它，比从零猜协议形状快得多。

![会话复用决策](imgs/40-15-session-reuse-decision.webp)

## 什么时候复用会话，什么时候换新的

session 维度的决策规则一句话能说完：独立任务全新 id，继续同一段对话才复用。难的不是规则，是识别"独立"的边界，两个具体例子把边界画清楚。

批处理 100 个文件，每个文件一个修复任务：100 个全新 session。任务之间没有任何共同的上下文，复用只会让每个任务背上前面所有任务的会话历史，token 成本线性叠加，前面任务的 shell 状态（cd 到的目录、export 的变量）还会悄悄影响后面的任务，出一个诡异的"只在第 73 个文件上复现"的问题。

迭代的场景反过来：让 agent 改一段代码、跑测试、你看了结果再说一句"把错误处理也补上"，这是同一段对话的延续，复用 session id 让它记得刚才改了什么、bash 里 cd 到了哪。此时会话拥有的 Bash 进程被保留是特性不是缺陷，agent 不需要每轮重新定位工作目录。

判断的试金石是"这个任务需不需要知道上一个任务的任何事"。需要，复用；不需要，新开。拿不准就新开，会话日志按 id 各自落盘，事后要串联总能串，反过来想拆开一段被复用污染的会话就没有工具了。

![隔离才是自动化安全边界](imgs/40-16-isolation-and-safety.webp)

## 隔离与安全

自动化的隔离比交互场景更要紧，分两个维度设计。

workspace 维度：`cwd` 圈定 agent 可用的工作区，`session_root` 存会话日志和状态。session 维度：独立任务每次用全新的 session_id，只有下一次调用要继续同一段持久对话时才复用。复用的含义比"接着聊"具体得多：同一个 harness 加同一个 session id，session 拥有的 Bash 进程被保留，工作目录、导出的环境变量、shell 函数全在。这既是便利也是泄漏面，前一个任务 cd 到的目录、export 的变量会原样进入下一个任务，复用前想清楚这个会话的 shell 里沉淀了什么。

权限模式分档：minimal 树把默认钉死在 `danger-full-access`，Bash 和编辑器可以修改 runtime 进程能访问的任何路径，这是刻意的选择，不是疏忽。自动化场景没有人在旁边审批，每次工具调用都要确认等于流水线永远卡住，所以干脆不做假门。完整 `sdk` 组合继承共享核心的 workspace-write 默认和审批策略，但把它当无人值守组合用的人多半会放开。代价直接写在文档里：只在一次性 checkout 或容器里跑 minimal 这类组合，别在生产仓库或有敏感数据的机器上直接跑。安全边界靠执行环境隔离保证，不靠权限策略，这两句话是同一件事的正反两面。

平台限制来自 PTY：持久 PTY backend 需要 POSIX terminal 环境，Windows 没有对应的 wheel，不是"不稳定"而是根本不发布。在 Windows 上用 SDK 要么换不依赖 PTY 的组合，要么进 WSL 或 Linux 容器。

![平台覆盖与排障入口](imgs/40-17-platform-and-troubleshooting.webp)

## 权衡

三种姿势各有一道天花板。headless 是一次性的：每次跑都是新进程、新会话，要跨调用复用状态就升到 SDK。SDK 是子进程模型：runtime 通过 stdio 通信，Python 进程退出时 runtime 一并清理，要跨进程的持久性就靠会话日志的 resume 能力。JSON-RPC 协议本身绑在 stdio 上：客户端和 runtime 必须同机、走子进程管道，要远程调用走 ACP 的 streamable-http 那条路，那是另一个协议。

两条运行纪律贯穿所有姿势。stdout 归协议：JSON-RPC runtime 的 stdout 是协议通道，任何混进去的日志都会破坏通信，诊断信息走 stderr，这条对想自己写协议客户端的人尤其致命，你的 print 调试可能就是协议崩溃的原因。权限默认全开：danger-full-access 没有上限可言，隔离环境是唯一的安全边界，容器或一次性 checkout 不是最佳实践，是前提条件。

平台面是硬收缩：三个 wheel 覆盖 Linux x64、Linux arm64、macOS arm64，Windows 没有位置。多数 CI 容器在覆盖内，但 Windows 原生的流水线要提前知道这条路不通。版本钉死是双刃：同版本意味着行为可复现，也意味着 runtime 的升级只能跟着 SDK 版本走，想单独换 runtime 或混搭版本不被支持。

排错时按故障位置选入口，三个入口对应三层。任务层的问题看 `finish_reason` 和会话 JSONL：error 或 max-tokens 都有完整的请求与工具调用记录可回放，`session_root` 目录就是现场。协议层的问题表现为 `SdkProtocolError`：turn 结束缺了规范的原因字段，这属于客户端和 runtime 之间的约定被破坏，查你的客户端有没有改写消息。启动层的问题进程直接起不来：配置缺失（没给 `DSH_CORDIS_CONFIG` 也没给位置参数）、运行时边车不完整、平台不在三个支持的组合里，都是启动期硬错误，报错信息直接说原因，不需要猜。

![把 agent 编进流水线的总结](imgs/40-18-unified-tradeoff-summary.webp)

## 结论

三种姿势共享同一套 agent 组合，差别只在驱动方：shell 拿一次性结果用 headless，Python 程序里编排用 SDK，其他语言实现 JSON-RPC stdio 客户端。SDK 的体验核心是三件事：捆绑的同版本单文件 runtime，目标机器零 Node 依赖；懒启动跨调用复用的子进程生命周期；owned interval 语义的 RunResult，最终回复来自 root 会话，通知横跨整棵进程树。用的时候记住边界：stdout 归协议、诊断走 stderr；minimal 组合权限钉死 danger-full-access，安全靠一次性 checkout 或容器兜底；headless 的机器可读输出用 `--json` 事件流，但它是有截断的投影，无损记录永远去会话 JSONL 里找。

## 延伸阅读

- [Python SDK 教程](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/python-sdk.md)：安装、首次运行、workspace 与 session id 选择
- [Python SDK 参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/python/sdk/README.md)：RunResult 语义、配置注入条件、运行时选择
- [headless bundle](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/bundle/headless)：一次性 runner 的契约、`--json` 事件流与会话续用
- [python/sdk/examples](https://github.com/deepseek-ai/deepseek-harness/tree/master/python/sdk/examples)：`minimal.py` 最小驱动样本
- [SDK Runtime 参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/python/sdk-runtime/README.md)：两种运行时载体与零配置设计

上一篇：[dsh 的 Conversation Node：给 Web 写一个自定义渲染节点](./39-write-a-conversation-node.md)
下一篇：[dsh 的 Web 客户端：Chat Nodes 与多 agent 协议](./41-web-client-chat-nodes-multi-agent-protocol.md)
