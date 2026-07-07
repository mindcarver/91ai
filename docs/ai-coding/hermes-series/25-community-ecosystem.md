# 社区生态：Hermes Desktop / hermes-web-ui / 贡献上游

> 系列第 25 篇 · 读者预设：想用社区周边项目、或想给 Hermes 贡献代码的人 · 最后核实：2026-07

**TL;DR：** Hermes 的外圈挂着 **Hermes Desktop**（桌面图形界面，自称 Hermes One）、**hermes-web-ui**（Hermes Studio，网页仪表板）、**HermesClaw**（微信桥，第 14 篇）、**computer-use-linux**（Linux 桌面控制 MCP，第 17 篇）、**hermes-agent-self-evolution**（用 DSPy 加 GEPA 自动演化 skill 的官方伴生仓库）。这些项目性质不一：有的官方、有的社区、有的 MIT、有的 BSL。这篇做两件事，一是把周边项目过一遍，告诉你哪个稳、哪个实验、哪个装之前要小心；二是把"给上游贡献代码"的完整流程拆开讲清楚，包括一个官方反复强调、新人最容易踩的 venv 坑。系列到这里收尾，回头会顺带把这 25 篇的脉络串一下。

## 一个心智模型：核心仓库是树干，周边项目是枝叶

读这篇之前先建立一个画面。把 `NousResearch/hermes-agent` 想成一根树干。它是 MIT 协议、官方维护、接受社区 PR 的核心代码库，所有版本节奏、安全更新、能力扩展都从这里发出。围绕树干长出的枝叶是各种周边项目：桌面图形界面、网页仪表板、微信桥、桌面控制 MCP、自动演化框架。枝叶靠树干活，树干不靠枝叶。

这个模型带来三个直接推论。第一，枝叶会滞后：核心仓库做了一次大重构（比如改了 skill 文件结构、改了 gateway 接口），周边项目可能要几周甚至几个月才跟上来，跟不上的就直接坏掉。第二，枝叶质量参差：有的是官方团队顺手做的（computer-use-linux、self-evolution），有的是个人开发者的实验（HermesClaw 早期），有的是小团队商业化尝试（hermes-web-ui 走 BSL 协议）。第三，安全责任不一样：官方仓库有相对完整的审批流程和 CI，社区项目可能连测试都没有，装之前你自己得审一遍。

所以这一篇反复要回答的问题其实是三个：哪些周边项目是成熟的、装之前看什么、想给核心贡献代码怎么走流程。下面挨个展开。

## 周边项目盘点

先上一张总表，把目前能找到的 Hermes 周边项目列清楚。表里的"成熟度"是个主观判断，依据是仓库活跃度、文档完整度、是否有完整测试、官方是否背书。

| 项目 | 仓库 | 是什么 | 官方还是社区 | 协议 | 成熟度 |
| --- | --- | --- | --- | --- | --- |
| Hermes Desktop | `fathah/hermes-desktop` | 桌面图形界面，安装、配置、对话三合一，品牌叫 Hermes One | 社区（README 明确声明与 Nous Research 无关） | MIT | 中等偏早 |
| hermes-web-ui | `EKKOLearnAI/hermes-web-ui` | 网页仪表板 Hermes Studio，桌面、npm、Docker 三种发行方式 | 社区 | BSL-1.1 | 中等 |
| HermesClaw | 社区项目 | 让 Hermes Agent 和 OpenClaw 共用一个微信号的桥（详见第 14 篇） | 社区 | 开源 | 实验性 |
| computer-use-linux | 官方仓库下 | Linux 桌面控制 MCP，AT-SPI 无障碍树加 Wayland/X11 输入 | 官方 | MIT | 中等 |
| hermes-agent-self-evolution | `NousResearch/hermes-agent-self-evolution` | 用 DSPy 加 GEPA 自动演化 skill 文件、工具描述、系统提示词 | 官方伴生仓库 | MIT（Phase 4 Darwinian Evolver 部分 AGPL v3） | 实验性，Phase 1 可用 |

下面挨个展开，重点说每个项目适合谁、边界在哪、装之前要看什么。

## Hermes Desktop：给不想碰终端的人

核心 Hermes 的官方入口是一条 `curl | bash` 的安装脚本加一个 TUI 终端界面。对天天写命令的工程师来说这没什么，但对产品经理、运营、研究者、学生这些"我只想用 AI 不想学 bash"的人，这道门槛是实打实的。Hermes Desktop 就是为这一波人做的。它是一个 Electron 打包的桌面应用，品牌名 Hermes One，把安装、配置、对话三件事包成图形界面：第一次打开是引导式安装向导，会自动跑官方安装脚本、装依赖、初始化目录；装完之后是多供应商配置页，可以从 OpenRouter、Anthropic、OpenAI、Gemini、xAI、Nous Portal、Qwen、MiniMax、Hugging Face、Groq，以及本地 OpenAI 兼容端点（LM Studio、Ollama、vLLM、llama.cpp）里选一个填 key；再往后就是流式聊天界面，支持 22 个 slash 命令（`/new`、`/clear`、`/fast`、`/web`、`/image`、`/browse`、`/code`、`/shell`、`/skills`、`/model`、`/memory`、`/persona` 等等），以及 SQLite FTS5 全文检索的会话管理。

它的能力其实远超"聊天界面"。Profile 切换、persona 编辑器（对应 SOUL.md）、14 个工具集面板、16 个消息网关（Telegram、Discord、Slack、WhatsApp、Signal、Matrix、Mattermost、Email IMAP/SMTP、SMS Twilio/Vonage、iMessage BlueBubbles、钉钉、飞书/Lark、企业微信、微信 iLink Bot、Webhook、Home Assistant）、cron 调度器（15 个投递目标）、Hermes Office（Claw3d）三维界面、备份导入、日志查看、自动更新，这些都是真东西。多语言支持英、简中、日、拉丁美西四个语种。

但它的边界也要说清楚。第一，社区项目。README 第一行就声明：本项目与 Nous Research 无关，由社区维护。状态警告也写在显眼位置：本项目处于活跃开发中，功能可能变化，部分内容可能不可用。这意味着核心 Hermes 大改之后，Desktop 可能要等几天到几周才能跟上，期间你装的版本可能跑不起来。第二，平台坑。Windows 安装包没有代码签名，SmartScreen 会拦，要点"更多信息"再"仍要运行"；WSL 安装时 Playwright 会等 sudo 密码但没 TTY 导致卡死，得手动给个临时 NOPASSWD 再装完撤掉（issue #109 跟踪）；Fedora 的 rpm 包没 GPG 签名，要 `--nogpgcheck` 装，且 rpm 不走自动更新。第三，深度用户会回到 CLI。高级功能比如 cron 的复杂表达式、subagent 委派、自定义 skill 调试，图形界面要么覆盖不全要么不直观，最后还是得开终端。Desktop 的定位是"入门和日常使用"，不是"替代 CLI"。

凭证安全是另一个要注意的点。Desktop 默认把 key 明文写在 `~/.hermes/.env`，这对本地单人使用够用，但对共享机器或截图分享配置的人不安全。它支持一个 `command` provider，每次需要 key 时调用你指定的命令（比如读 KeePassXC、GnuPG、pass、secret-tool、Bitwarden CLI、1Password CLI），但这个 provider 只在 POSIX 系统上工作，Windows 没有，且有 3 秒超时和 1 MiB 输出上限。生产环境建议走这条路，别图方便填死。

## hermes-web-ui：网页仪表板

如果说 Desktop 解决的是"不想碰终端"，hermes-web-ui 解决的是"想坐下来长时间用"。它的品牌叫 Hermes Studio，仓库在 `EKKOLearnAI/hermes-web-ui`，是一个网页仪表板，给 Hermes Agent 提供浏览器界面。它有三种发行方式：Electron 桌面安装包（Windows/macOS/Linux）、npm 全局命令（`npm install -g hermes-web-ui` 然后 `hermes-web-ui start`，默认开在 `http://localhost:8648`）、Docker Compose 单容器（集成 Hermes，数据持久化在 `./hermes_data`，默认开在 `http://localhost:6060`）。

技术栈前端是 Vue 3 加 TypeScript 加 Vite 加 Naive UI 加 Pinia 加 vue-i18n，后端是 Koa 2 做 BFF 加 node-pty 做网页终端，聊天走 Socket.IO 的 `/chat-run` 事件桥接到 Hermes 运行时。架构很清晰：浏览器到 BFF 到 Socket.IO 到 Hermes agent bridge 到 Hermes 运行时，Hermes 相关代码都收敛在 `hermes/` 目录下，留了多 agent 扩展的口子。

功能密度比 Desktop 还高。AI 聊天带流式、工具调用追踪、文件上传下载、本地 SQLite 会话库；单页聚合八个平台通道（Telegram、Discord、Slack、WhatsApp、Matrix、飞书、微信 iLink 二维码、企业微信）；多 profile 克隆导入导出；超级管理员和普通管理员两种角色；定时任务 cron 增删改查加暂停恢复立即触发；看板（profile 维度）；群聊房间（多 agent、@路由、上下文压缩、邀请码、SQLite 持久化）；编码 agent runner（Codex 和 Claude Code 代理）；skill 和 memory 浏览器；日志查看器（按级别文件关键词过滤）；网页终端（node-pty 加 xterm）；MCP 管理器（自动注入一个 `hermes-studio` MCP 服务）；语音合成（Edge TTS、OpenAI 兼容 `/audio/speech`、自定义端点、MiMo 声音克隆）和语音识别（浏览器或服务端）；用量分析（token 拆分、成本追踪、缓存命中率、模型分布、30 天趋势）。

适合谁？想在浏览器里集中管理对话、多平台多会话并行的重度用户。比手机 IM 屏幕大、比 CLI 直观、比 Desktop 适合多人共享（一台机器部署、多人浏览器访问）。它的存在把 Hermes 从"个人终端工具"变成"小团队运营平台"。

边界和安全模型要说清楚。第一，协议。这个项目不是 MIT，是 BSL-1.1（Business Source License）。BSL 不是 OSI 认证的开源协议，它通常对商业使用设限，具体的限制要看 LICENSE 文件里的"Change Date"和"Allowed Use"，过 Change Date 之后会自动转成宽松协议。如果你打算在公司里跑或者拿它做产品，先读 LICENSE，别假设它是 MIT。第二，默认凭证。首次启动的引导账户是 `admin` / `123456`，登录后强制改密，但如果你装完忘了改、又把端口暴露在公网，等于裸奔。重置命令是 `hermes-web-ui clear-login-locks` 和 `hermes-web-ui reset-default-login`。第三，Web 暴露面。CLI 只在你的终端里，Web UI 是个 HTTP 服务，一旦监听 0.0.0.0 或上了公网，攻击面大得多，未鉴权访问、token 泄露、XSS、CSRF、SSRF 都得自己想清楚。第 20 篇详细讨论过命令审批和 DM 配对，这里的建议一样：Web UI 默认绑 127.0.0.1，要远程用就走 VPN 或 SSH 隧道，别直接挂公网。第四，外部 TTS 限制。自定义或 OpenAI 兼容的 TTS 端点必须是公网 `http`/`https`，不能指向 localhost 或私网，这是它做的 SSRF 防护，但也意味着你不能本地起一个 TTS 服务直接接。第五，会话历史只读不同步。Hermes 自己 `state.db` 里的会话历史不会被 Web UI 索引，Web UI 搜索的只是它自己本地 SQLite 里的会话，所以如果你从 CLI 起的会话，在 Web UI 里搜不到。

## HermesClaw 与桥接类项目：实验性最前端的代价

总表里 HermesClaw 标了"实验性"，要单独拎出来讲。它是让 Hermes Agent 和 OpenClaw 共用一个微信号的桥，第 14 篇详细拆过技术原理。这里只从生态角度说它的位置。

桥接类项目（HermesClaw 之外，hermes-web-ui 里的 iLink 微信通道、企业微信通道、iMessage BlueBubbles 通道都属于这一类）有个共同特点：它们依赖的另一端是闭源且随时可能改的。微信本身对第三方客户端的态度一直不友好，iLink 这种二维码登录方案本质上是用 web 端协议做的逆向，腾讯任何一次接口调整都可能让桥失效。iMessage BlueBubbles 要在 macOS 上跑一个服务端转发，依赖苹果不封禁相关 API。企业微信、飞书、钉钉这些官方有开放接口的相对稳，但 token 申请和权限审批流程本身是道门槛。

这类项目的成熟度评估要看三点。第一，依赖链稳定性。它依赖的第三方接口（微信 web 协议、iLink API、BlueBubbles）最近有没有大改？项目最近一次适配是什么时候？如果桥接的目标平台改了接口、项目又三个月没动，基本可以判它死了。第二，维护者投入。桥接项目通常是个人或小团队维护，维护者一旦弃坑，项目就死。看 commit 频率和 issue 响应速度。一个有二十个未回 issue、上次 commit 半年前的桥接项目，不要碰。第三，账号风险。微信对桥接客户端的检测越来越严，长期用桥接可能触发风控甚至封号。你拿主号去接桥接服务，等于拿自己的社交关系链赌这个项目稳不稳。生产环境（比如真用来做客户服务）千万别依赖这类桥，更不要把账号凭证交给不开源的桥接服务。

HermesClaw 在第 14 篇里讲过具体怎么用、坑在哪。从生态角度的判断是：能用，但当成实验性增强而不是稳定基座。如果你只是个人想让 Hermes 接一下微信试试，可以玩；如果你想做产品或长期运营，等官方或大团队下场做更稳的方案，或者走有官方开放接口的通道（企业微信、飞书）。一个朴素的原则：桥接项目用在丢了不心疼的场景，不绑主力账号、不接客户流量、不做合规承诺。

## 官方周边还是社区周边：装前怎么判断

上面五个项目，性质差别很大。把它们分两类来看。

**官方（NousResearch 名下）**：和核心 Hermes 同步发布、有官方 issue 通道、相对可信。computer-use-linux 是官方维护的 Linux 桌面控制 MCP，AT-SPI 无障碍树加 Wayland/X11 输入，给 Hermes 加一双看屏幕和点鼠标的眼睛（详见第 17 篇）。hermes-agent-self-evolution 是官方伴生仓库，用 DSPy 加 GEPA 自动演化 skill 文件，下文单独讲。这两个项目的版本节奏和 hermes-agent 主仓库对齐，安全更新会跟。

**社区（个人或团队名下）**：维护看作者心情，更新可能滞后，安全自己把关。Hermes Desktop 是 fathah 个人项目，README 第一行就声明与 Nous 无关。hermes-web-ui 是 EKKOLearnAI 团队项目，走 BSL 协议，有商业化味道。HermesClaw 是早期实验性微信桥，稳定性看维护者投入。

判断一个社区项目能不能用，过这五道关：

第一，活跃度。看最近 commit 时间。如果一个项目最近半年没动，核心 Hermes 这期间已经发了几版，大概率装不上或者跑出问题。看 issue 区有没有人报 bug、维护者有没有回。死气沉沉的 issue 区比关闭的 issue 更可怕。

第二，权限。装之前看它要什么。要你的 OpenRouter key？要 root？要监听端口？要写 `~/.hermes`？凡是权限超出它功能需要的，警惕。一个聊天界面没必要 root，一个本地工具没必要监听 0.0.0.0。

第三，开源协议。MIT、Apache 2.0、BSD 这类宽松协议没问题。BSL、SSPL、Elastic 这类"源码可见但商业受限"的协议，公司用之前先读 LICENSE。GPL 系列要注意是否传染，比如 self-evolution 里的 Darwinian Evolver 是 AGPL v3，意味着你改了用它就得开源你的改动。

第四，凭证处理。看它怎么存你的 key。明文写配置文件是最危险的，命令式 provider（每次调外部密码管理器）最稳。中间还有加密存配置文件但 key 在内存里解密的折中方案。

第五，依赖链。一个 Electron 应用打包了一堆 npm 包，每个 npm 包都可能被投毒。Docker 镜像里的基础镜像可能过期。看一眼它依赖什么、作者是否及时跟依赖更新。

务实做法：核心场景（对话、skill、消息网关）靠官方核心；社区项目当"可选增强"，每个装之前都过这五道关；不熟的社区项目先用一次性虚拟机或容器跑，别直接装主力机。

## 贡献上游：给 Hermes 核心提 PR

讲完消费周边项目，反过来讲讲怎么反哺。Hermes 是 MIT 开源，官方明确欢迎社区贡献，README 里直接给了 contributor 快速上手。流程不复杂，但有几个坑新人容易踩。

### 推荐路径：先用标准 installer 装好，再切开发模式

官方推荐的不是从零 clone，而是先用用户视角的 installer 装一遍，再从它创建的 git checkout 切到开发模式。这样的好处是你已经有了一个能跑的运行时，改完立刻就能 `hermes doctor`、`hermes chat -q "Hello"` 验证，不用从空配置开始。

具体步骤。先用 installer 装：

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

然后进到它创建的 checkout（默认在 `${HERMES_HOME:-$HOME/.hermes}/hermes-agent`），切到开发安装：

```bash
cd "${HERMES_HOME:-$HOME/.hermes}/hermes-agent"
uv pip install -e ".[all,dev]"
npm install   # 可选，浏览器工具或文档需要
```

`-e` 是 editable 模式，你改的代码立刻生效，不用反复重装。`[all,dev]` 把所有可选依赖和开发依赖（pytest、ruff 等）都装上。

如果是 CI 或一次性容器，不想跑 installer，也可以手动 clone：

```bash
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent
uv venv ~/.hermes/venvs/hermes-dev --python 3.11
export VIRTUAL_ENV="$HOME/.hermes/venvs/hermes-dev"
export PATH="$VIRTUAL_ENV/bin:$PATH"
uv pip install -e ".[all,dev]"
```

注意这里 venv 建在 `~/.hermes/venvs/hermes-dev`，不在 clone 出来的 `hermes-agent` 目录里。这就是官方反复强调的那个坑，下面单独讲。

### venv 别建在 source tree 内部：最容易踩的坑

官方原文这么说：把 venv 建在克隆出来的源码目录外面。一个位于 agent 工作目录里的 venv，可能被 agent 自己跑的一条相对路径命令清掉（`rm -rf venv`、`uv venv venv` 之类），这会在会话进行中悄悄把正在运行的运行时摧毁。理由是：放在外面意味着工作区里没有任何相对路径能解析到它。

这是个反直觉但很重要的设计。Agent 经常会跑 `rm -rf` 清理工作区、跑 `find` 找文件、跑 `uv pip install` 装东西。如果 venv 就在工作区里，agent 跑一条命令就可能把自己赖以运行的 Python 解释器和依赖删了，而且不会有明显报错，进程还在跑，但下次 import 就崩。这种 bug 极难排查。

正确做法：venv 永远建在 `~/.hermes/venvs/` 下，永远叫一个和源码目录无关的名字（比如 `hermes-dev`）。如果你用 installer 装的，installer 已经替你处理了；如果你手动 clone，记得照上面的命令建。

### 配置开发环境

装完依赖还要建目录结构和配置文件：

```bash
mkdir -p ~/.hermes/{cron,sessions,logs,memories,skills}
cp cli-config.yaml.example ~/.hermes/config.yaml
touch ~/.hermes/.env
echo 'OPENROUTER_API_KEY=sk-or-v1-your-key' >> ~/.hermes/.env
```

这一步是给 Hermes 一个能跑的家目录。config.yaml 是主配置，.env 放 key。改完代码后用 `hermes doctor` 做自检、用 `hermes chat -q "Hello"` 跑一个最小对话验证。

### 跑测试和提 PR

测试用官方封装好的脚本：

```bash
scripts/run_tests.sh
```

这是 CI 一致的封装。直接 `python -m pytest` 也能跑，但只在脚本不可用或要调试单个测试时才用。

PR 流程。第一步，从 main 切分支，分支名遵循约定：`fix/description`、`feat/description`、`docs/description`、`test/description`、`refactor/description`。第二步，commit 用 Conventional Commits 格式：`<type>(<scope>): <description>`，scope 可以是 `cli`、`gateway`、`tools`、`skills`、`agent`、`install`、`whatsapp`、`security` 这些。第三步，提 PR 前自检：跑 `scripts/run_tests.sh`、做手动 smoke、如果改了文件 I/O 或进程信号处理就跑 `scripts/check-windows-footguns.py` 验证 Windows 兼容、确认一个 PR 只做一个逻辑改动。第四步，PR 描述写四件事：改了什么和为什么、怎么测、在哪些平台测过、相关 issue 编号。

贡献优先级官方有明确排序，从高到低：bug 修复（崩溃、错误行为、数据丢失）→ 跨平台兼容（macOS、Linux 发行版、WSL2）→ 安全加固（shell 注入、prompt 注入、路径穿越）→ 性能和健壮性（重试、错误处理、优雅降级）→ 新 skill（广泛有用的）→ 新工具（"极少需要，大多数能力应该是 skill 而不是 tool"）→ 文档。这个排序很说明问题：官方更希望你修 bug 和加固安全，而不是堆新功能。新工具尤其不被鼓励，因为 Hermes 的设计哲学是能力尽量做成 skill，tool 留给真正需要副作用的场景。

代码风格也有规矩。PEP 8 但不强制行长；注释只写非显然的意图和权衡；catch 具体异常，不要裸 `except`，意外错误用 `logger.warning()` 或 `error()` 配 `exc_info=True` 记录；永远不要硬编码 `~/.hermes`，用 `get_hermes_home()` 或 `display_hermes_home()` 拿。跨平台规则一长串，主要是 Windows 适配：不要直接用 `signal.SIGKILL`（Windows 没有），用 `gateway.status.terminate_pid(pid, force=True)` 或 `getattr(signal, "SIGKILL", signal.SIGTERM)`；`os.kill(pid, 0)` 要同时 catch `OSError` 和 `ProcessLookupError`；POSIX 专属调用（`os.setsid`、`os.killpg`、`os.fork`）用 `if sys.platform != "win32":` 包起来；打开文件显式写 `encoding="utf-8"`（Windows 默认 cp1252 会乱码）；路径用 `pathlib.Path` 或 `os.path.join`，不要手动拼 `/`。

## 贡献 skill 而不是代码：门槛更低价值更高

不是只有改代码才算贡献。写好一个 skill 发到 Skills Hub（第 8 篇详细讲过），也是实打实的贡献，而且门槛低、影响面广。原因有几个。

第一，skill 是 markdown 文件，不需要懂 Python。一个 skill 就是一个 `SKILL.md` 加若干资源文件，写好 frontmatter（name、description、when-to-use）和正文就行。会写文档的人就能贡献。

第二，skill 解决的是"长尾问题"。代码层面的改动通常解决通用问题，skill 解决具体场景，比如怎么读财报、怎么写 commit message、怎么做用户研究、怎么部署到某朵云。你工作中遇到的某个具体痛点，写成 skill 发出来，可能正好帮到几百个有同样痛点的人。

第三，skill 走 Skills Hub 分发，不用过 PR review。Hub 是社区市场，你发了别人能搜到、能装、能评分，质量靠用户反馈沉淀，不靠维护者审。这意味着发布速度快、迭代也快，你看到反馈不好可以立刻改、立刻发新版。

第四，官方把"新 skill"列在贡献优先级的第五位，高于"新工具"和"文档"。说明官方明确希望社区贡献以 skill 形式涌入，而不是大家都去改核心代码。

所以如果你想给 Hermes 社区做贡献但不确定从哪开始，写 skill 是性价比最高的入口。第 7 篇讲了怎么写第一个 skill，第 8 篇讲了怎么发到 Hub，第 9 篇讲了 skill 自我改进的机制，这一篇到这里和它们形成闭环。

## computer-use-linux：官方的"看屏幕点鼠标"扩展

这个项目放在官方仓库下，是给 Hermes（也兼容其他 MCP 宿主）加 Linux 桌面控制能力的 MCP 服务。第 17 篇详细讲过怎么用，这里只从生态位置说几句。

它的实现走的是 AT-SPI 无障碍树加 Wayland/X11 输入。AT-SPI 是 Linux 桌面的辅助技术接口，本来是给读屏软件用的，computer-use-linux 借它来读窗口结构、识别控件名称和层次。Wayland 和 X11 两套显示服务都支持，输入走合成器的协议接口或 X11 的 XTest 扩展。截图走各自的截图接口。整体思路是不依赖像素识别，而是直接读桌面应用程序暴露的语义结构，这比纯视觉方案稳，但前提是目标应用得正确实现 AT-SPI（不少跨平台 Electron 应用和 GTK/Qt 应用支持得好，老旧 Motif 或自绘界面应用可能不暴露）。

为什么这个项目重要？因为它补上了 Hermes 作为命令行 agent 缺的一块，也就是操作图形应用。Hermes 默认强项是 shell、文件、API 这些文本交互，遇到"点开浏览器导出 PDF"、"在 GIMP 里跑一个滤镜"、"读 LibreOffice 里的表格"这类必须走 GUI 的任务就抓瞎。computer-use-linux 给它加了眼睛和手。和其他社区桌面控制方案比，它的优势是官方背书、和 Hermes 的 MCP 集成开箱即用、走 AT-SPI 比纯视觉稳；局限是只支持 Linux（macOS 和 Windows 没有对应实现），且依赖目标应用的无障碍实现质量。

适合谁？Linux 桌面用户、把 Hermes 跑在 Linux 工作站上的开发者、做 Linux 自动化测试的人。不适合谁？macOS 和 Windows 用户（没对应实现）、需要操作不支持 AT-SPI 的老旧应用的人、对桌面控制稳定性要求极高的生产场景（AT-SPI 路径偶尔会因为应用更新失效）。

## 你的 PR 会不会被合并：读官方优先级

提 PR 之前值得花两分钟想想：你这个改动官方会不会要。官方的 Contributing 文档里写了贡献优先级排序，从高到低：bug 修复（崩溃、错误行为、数据丢失）→ 跨平台兼容（macOS、Linux 发行版、WSL2）→ 安全加固（shell 注入、prompt 注入、路径穿越）→ 性能和健壮性（重试、错误处理、优雅降级）→ 新 skill（广泛有用的）→ 新工具（极少需要）→ 文档。

这个排序告诉你几件事。第一，bug 修复几乎一定受欢迎，只要你复现清楚、修得干净、加了测试。第二，跨平台兼容是高优先级，意味着如果你在 Windows 或 macOS 上发现了 Linux 没有的 bug，修了它，PR 通过率高。第三，安全加固永远是优先级，发现 prompt 注入、路径穿越、命令注入这类问题，提修复 PR 几乎不会被拒。第四，新工具被明确标注"极少需要"，意味着你想加一个新 tool 进核心仓库，门槛非常高，得证明这个能力不能做成 skill。第五，文档也是贡献，但优先级最低，意味着大段文档重写可能不会被优先 review，最好先开 issue 讨论。

提高 PR 通过率的几条实操建议。一，提之前先开 issue 沟通。除非是显然的 bug 修复，否则先开 issue 描述你想改什么、为什么，让维护者有机会说"这个我们不想做"或者"这个方向对，继续"。这能避免你写完几百行代码之后被拒。二，一个 PR 只做一件事。混合多个不相关改动的 PR 几乎一定会被要求拆分。三，测试必须过且必须有意义。只跑 `scripts/run_tests.sh` 不够，还要想你的改动是否需要新增测试覆盖。四，跨平台影响要自查。改了文件 I/O、进程信号、路径处理，自己跑一下 `scripts/check-windows-footguns.py`，或者在 Windows 上手动验证一下。五，commit message 和 PR 描述按规范写。Conventional Commits 格式，scope 用对的（cli、gateway、tools、skills、agent、install、whatsapp、security），描述说清楚改了什么、为什么、怎么测、在哪些平台测过、相关 issue 编号。

被拒了怎么办？官方 review 文化整体是建设性的，被拒通常有明确理由（不在路线图、设计不符、有更好方案）。被拒不代表你的工作白费，可以 fork 维护自己用，或者改成 skill 形式发布（如果是能力扩展而不是 bug 修复，往往能转成 skill）。也可以问维护者："如果这个方向你们不要，那你们现在最缺什么贡献？"这种问题在 Discord 或 GitHub Discussions 里通常能得到回应。

## self-evolution：用 DSPy 加 GEPA 自动演化 skill

这个项目值得一提，因为它代表了 Hermes 生态里"研究型周边"的方向。`NousResearch/hermes-agent-self-evolution` 是官方伴生仓库，用 DSPy 加 GEPA（Genetic-Pareto Prompt Evolution，ICLR 2026 Oral）自动演化 Hermes 的 skill 文件、工具描述、系统提示词、相关代码。

它和主仓库的关系是：单独 repo，把 hermes-agent 当依赖装进来，跑优化后产出的改动以 PR 形式回主仓库。具体跑法：

```bash
git clone https://github.com/NousResearch/hermes-agent-self-evolution.git
cd hermes-agent-self-evolution
pip install -e ".[dev]"

export HERMES_AGENT_REPO=~/.hermes/hermes-agent

# 用合成评估数据演化某个 skill
python -m evolution.skills.evolve_skill \
    --skill github-code-review \
    --iterations 10 \
    --eval-source synthetic

# 或用真实会话历史
python -m evolution.skills.evolve_skill \
    --skill github-code-review \
    --iterations 10 \
    --eval-source sessiondb
```

GEPA 和普通 prompt 优化的区别在于：它读执行轨迹理解为什么失败，不只看失败本身，然后提出针对性改进。每个演化出的变体必须过五道关才算数：pytest 100% 通过、size 限制（skill 不超过 15KB、tool 描述不超过 500 字符）、缓存兼容（不能在对话中途改）、语义保持（不能偏离原始用途）、人工 review（绝不直接 commit）。

成本大约 2 到 10 美元一次优化运行，纯 API 调用不需要 GPU。目前 Phase 1（skill 文件演化）已实现，Phase 2（工具描述）、Phase 3（系统提示词）、Phase 4（工具代码，用 Darwinian Evolver，AGPL v3）、Phase 5（持续改进循环）都还在规划里。

为什么这个项目重要？因为它把第 9 篇讲的 skill 自我改进机制做成了一个独立工具。你不只能让 Hermes 在使用中渐进改进，还能用 self-evolution 主动跑批量演化，把 skill 推到更优状态。这是研究型用户和生产型用户都关心的方向。

## 真实坑

盘点这一路看到的坑，按踩到的概率排序。

**社区项目失效**。最常见。核心 Hermes 大改之后（比如改了 skill 文件结构、改了 gateway 接口），社区周边可能几周到几个月跟不上，期间你装的版本跑不起来或行为异常。装之前看最近 commit 时间、看 issue 区有人报兼容问题没有。一个简单的判断：如果项目最近一次 commit 在三个月前、核心 Hermes 这期间发了两个版本，慎装。

**venv 建在 source tree 内部**。前面讲过的官方反复强调的坑。手动 clone 的贡献者最容易踩，因为直觉上 venv 建在项目目录里最方便。结果是 agent 跑一条 `rm -rf venv` 就把自己 runtime 干掉了。venv 永远建在 `~/.hermes/venvs/` 下。

**Web UI 暴露公网**。hermes-web-ui 默认凭证 `admin`/`123456`，装完不改、又监听 0.0.0.0 上了公网，等于把整个 Hermes 控制台裸奔给全世界。生产环境必须：改默认密、绑 127.0.0.1、走 VPN 或反向代理加鉴权、定期看日志。

**Windows 安装包未签名**。Hermes Desktop 的 Windows 包没代码签名，SmartScreen 会拦。新人看到警告可能不敢点，或者点了"更多信息"之后仍然不确定是否安全。官方建议是点"仍要运行"，但这意味着你信任了社区项目的未签名二进制，风险自己评估。

**WSL 安装卡 sudo**。Desktop 在 WSL 装 Playwright 时会等 sudo 密码但没 TTY，进程卡死。解决方法是临时给 NOPASSWD 装完撤掉，但这个操作本身要求你有 sudo 权限且懂安全含义。多人共享的 WSL 环境别这么搞。

**第三方凭证泄露**。社区 GUI 或桥接项目可能要你的 token、key、cookie。授权前想清楚：这个项目是不是开源、维护者是谁、key 存在哪、会不会上传到第三方服务器。能走环境变量就别在 GUI 里填死，能用 OAuth 临时授权就别给长期 token。HermesClaw 这种桥接微信的项目尤其敏感，微信 cookie 泄露等于账号被接管。

**BSL 协议误用**。hermes-web-ui 是 BSL-1.1 不是 MIT。公司里部署、做商业产品之前先读 LICENSE 的"Allowed Use"和"Change Date"，别假设它和 MIT 一样自由。这个坑不是技术坑，是法务坑，但踩了代价不低。

## 权衡

社区生态的核心交易是：**周边项目扩能力，代价是增加维护和安全负担**。

用官方核心最稳，但能力边界就那么大。社区项目能帮你跨过终端门槛（Desktop）、做团队运营（Web UI）、接微信（HermesClaw）、控制桌面（computer-use-linux）、自动演化 skill（self-evolution）。但每装一个社区项目，你就多了一个升级跟踪点、一个安全审计对象、一个潜在故障源。

务实路线是这样：核心场景靠官方核心，能用 CLI 就用 CLI；社区项目当"可选增强"，每个装之前过五道关（活跃度、权限、协议、凭证、依赖）；生产环境慎用社区项目，要用就上隔离（容器、专用账户、网络分段）；想反哺就从写 skill 开始，门槛低、不踩 venv 坑、影响面广。

另一个权衡是 GUI 还是 CLI。GUI 上手快但深度有限，遇到高级功能（cron 复杂表达式、subagent、skill 调试、MCP 自定义）还是要回 CLI。建议把 GUI 当入门和日常入口，CLI 当深度工作台，两者并存而不是二选一。一个典型的工作流是：装 Hermes Desktop 给团队里不写命令的同事日常用、自己主力在 CLI 做开发和 skill 调试、需要远程或多人共享时上 hermes-web-ui。三种入口对应三种使用密度，不冲突。

第三个权衡是跟进核心还是锁定版本。Hermes 迭代快，社区项目跟进慢，意味着你永远在追赶，要么忍受新功能延迟、要么自己 fork 维护补丁。生产环境建议锁版本（比如锁某个 release tag，不跟 main），稳定优先；个人实验可以追 main，享受新功能但接受偶尔坏掉。第 21 篇讲过升级、备份、迁移的具体操作，这里只强调原则：生产环境永远有回滚预案，每次升级前备份 `~/.hermes`，验证关键 skill 和 cron 在新版本下还能跑。

最后一个权衡是贡献投入。写代码 PR 时间成本高、通过率不确定，但能直接影响核心；写 skill 时间成本低、影响面广、不卡 review，但不能改底层；写文档门槛最低但优先级也最低。按你能投入的时间和想得到的回报选：周末一两小时就从 skill 开始，整块时间且有具体 bug 要修就走 PR，想建立社区影响力就两个都做。

## 跟上生态：信息源和参与姿势

Hermes 生态变化快，怎么持续跟进是个真问题。几个值得订阅的信息源。

官方的 GitHub release 是最权威的。每个版本会列改动、新增、修复、破坏性变更。生产环境升级前必读。官方文档站（hermes-agent.nousresearch.com）会跟着版本更新，重大变更通常会有迁移指南。Discord 的 NousResearch 频道是讨论最活跃的地方，维护者日常出没，设计提案会先在那里讨论。GitHub Discussions 适合长文提案和问答，比 Discord 更适合复杂技术讨论。

社区侧的信息源比较散。Reddit 的 r/hermesagent 和 r/LocalLLaMA 偶尔有深度讨论和踩坑帖。中文社区目前没有特别集中的阵地，零散在掘金、知乎、即刻等平台。这篇系列所在的 91ai 仓库会持续整理 Hermes 相关评测和实践，可以作为中文读者的一个稳定入口。

参与姿势上，几个建议。第一，问问题之前先搜 issue 和 Discord 历史。Hermes 用户量大，常见问题早就有人问过、有人答过。第二，报 bug 走 GitHub issue 不走 Discord。issue 是可追踪的，Discord 消息会沉。报 bug 时给完整复现步骤、环境信息（OS、Python 版本、Hermes 版本）、期望行为和实际行为。第三，提设计提案先开 Discussion 不要直接开 PR。让维护者有机会在你写代码之前对方向表态。第四，尊重维护者时间。Hermes 是开源项目，维护者不拿你钱，回复慢或者要求你改这改那都是正常的，不要催不要抱怨。第五，贡献时署真名或稳定 ID。开源贡献是你简历的一部分，匿名贡献得不到累积。

社区行为方面，Hermes 整体文化偏工程师向、偏直接。技术讨论不需要客套，但人身攻击、骚扰、歧视这类行为在任何开源社区都不被接受。官方有行为准则，参与前扫一眼，别踩红线。

## 系列 25 篇回顾

这是系列最后一篇，顺带把这 25 篇的脉络串一下，方便回头看整条路径。

第一阶段是认识和上手。第 1 篇讲 Hermes 是什么，一个会从使用中学习、会自己改 skill 的 AI agent。第 2 篇是 60 分钟上手。第 3 篇是架构心智模型。第 4 篇是配置和上下文文件。这五篇让你能跑起来、能配置、能理解它怎么组织。

第二阶段是 skill 体系。第 5 篇讲学习循环概览。第 6 篇讲 agentskills 标准和 skill 文件结构。第 7 篇讲写第一个 skill。第 8 篇讲 Skills Hub 的使用。第 9 篇讲 skill 自我改进机制。这五篇是从用户到贡献者的桥，让你会写 skill、会用 Hub、理解改进循环。

第三阶段是记忆和用户建模。第 10 篇讲三层记忆。第 11 篇讲 agent curated memory nudge。第 12 篇讲 FTS5 和 Honcho 用户建模。这三篇是 Hermes 怎么记住你、怎么形成对你的模型。

第四阶段是消息网关和多平台。第 13 篇讲消息网关整体。第 14 篇讲 HermesClaw 微信桥。第 15 篇讲 cron 和 subagent 委派。第 16 篇讲端到端实战。这四篇是怎么把 Hermes 接到你日常的 IM、怎么定时跑任务、怎么组合出完整工作流。

第五阶段是工具和模型。第 17 篇讲工具、toolset、MCP（含 computer-use-linux）。第 18 篇讲 Nous Portal 和模型选择。第 19 篇讲后端、serverless、成本。这三篇是怎么给 Hermes 加手眼、怎么选模型、怎么管成本。

第六阶段是安全和运维。第 20 篇讲安全、命令审批、DM 配对。第 21 篇讲升级、备份、迁移。第 22 篇讲和 OpenClaw、Claude Code 的对比。这三篇是怎么在生产环境里安全地跑、怎么持续运维、和同类工具比怎么样。

第七阶段是实践和研究。第 23 篇讲 30 天滚动实践。第 24 篇讲研究轨迹生成（给训练 tool-calling 模型产数据）。这两篇是怎么把 Hermes 用到日常、用到研究里。

第八阶段就是这一篇，社区生态和贡献上游。

整个系列的隐线是"从使用者到参与者"。前 12 篇教你用，第 13 到 22 篇教你部署和运维，第 23 到 25 篇教你深度实践和反哺社区。如果你一路读下来，现在应该能：跑生产环境、写自己的 skill、给上游提 PR、判断社区项目好坏、跟上 Hermes 的版本节奏。

这个系列会持续更新。Hermes 还在快速迭代（self-evolution 的 Phase 2 到 5 都没实现、官方明确说新工具"极少需要"意味着 tool 体系还在收敛、消息网关的 16 个通道里好几个是社区贡献的状态）。版本大改之后，系列对应篇会同步修订，新出现的重要周边项目会补到这一篇的总表里。如果你在跟随某个具体版本，先看官方 release note 再回来对篇。

## 延伸阅读

- [NousResearch/hermes-agent（核心仓库）](https://github.com/NousResearch/hermes-agent)
- [Hermes 官方 Contributing 文档](https://hermes-agent.nousresearch.com/docs/developer-guide/contributing)
- [Hermes 官方 Installation 文档（讲 venv 怎么处理）](https://hermes-agent.nousresearch.com/docs/getting-started/installation)
- [Hermes Desktop / Hermes One（fathah/hermes-desktop）](https://github.com/fathah/hermes-desktop)
- [hermes-web-ui / Hermes Studio（EKKOLearnAI/hermes-web-ui）](https://github.com/EKKOLearnAI/hermes-web-ui)
- [hermes-agent-self-evolution（DSPy + GEPA 自动演化）](https://github.com/NousResearch/hermes-agent-self-evolution)
- [GEPA 论文（ICLR 2026 Oral，Prompt 演化算法）](https://arxiv.org/abs/2410.19137)
- [第 8 篇：Skills Hub 使用](./08-skills-hub-usage.md)
- [第 9 篇：skill 自我改进机制](./09-skill-self-improvement-mechanism.md)
- [第 14 篇：HermesClaw 微信桥](./14-wechat-bridge-hermesclaw.md)
- [第 17 篇：工具、toolset、MCP（含 computer-use-linux）](./17-tools-toolset-mcp.md)
- [第 20 篇：安全、命令审批、DM 配对](./20-security-command-approval-dm-pairing.md)
- [第 21 篇：升级、备份、迁移](./21-upgrade-backup-migrate.md)
- [系列 README：Hermes 系列导读](./README.md)
