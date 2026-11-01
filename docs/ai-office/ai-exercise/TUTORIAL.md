<!-- meta-description: 把长期记忆从各个 AI 编码工具搬进自托管 mem0，任何 agent 用一个 URL 读写同一份记忆。七步实战：mem0 部署、两百行 MCP 网关、多端接入、隧道、迁移、治理与备份。 -->

# 两百行网关收编所有 AI 编码工具：mem0 多 Agent 统一记忆实战

**TL;DR**：我把自己所有 AI 编码工具的记忆，搬进了一台自己服务器上的 mem0；任何机器上的任何 agent 配一个 URL 就能读写同一份记忆。这篇教程带你从零搭出同样的系统：自托管 mem0、一个两百行出头的 MCP 网关、各端一行配置接入、旧记忆迁移、定期整理与每日备份。

## 问题：每个工具各记各的

先说我原来的样子。我在 Mac 上用 Claude Code 干活，它把「shortagent 项目用 pytest 跑测试」记进了自己的记忆目录。第二天我换到 Windows 机器开 ZCode 继续干，它什么都不知道，我得重新交代一遍。Claude Code、Codex、ZCode 各有各的记忆文件，互不相通，还会对同一件事记出两个矛盾的版本。

根因是记忆存在客户端：谁产生记忆谁自己存，换工具、换机器、重装系统，记忆就断。我的解法一句话：记忆上收，存进一个所有工具都能通过网络访问的中央服务，agent 只留一行接入配置。

打个比方，这相当于我给所有 agent 发了同一个共享笔记本。类比到此为止：mem0 不是纯文本笔记，它把每条记忆转成向量（embedding，把文字变成一串可比对距离的数字），所以能按语义检索，你问「测试怎么跑」能召回写着 pytest 的那条，即使原文没有「怎么跑」三个字。

## 我们要构建什么

```
[Mac / Claude Code]──┐                          ┌─ mem0 REST :8888（docker + postgres/pgvector）
[Win / ZCode]────────┼── 内网直连或 SSH 隧道 ──▶ MCP 网关 :8889 ──▶ Ollama 嵌入 :11434（可选）
[任何 MCP 客户端]────┘                          └─ 全部数据在你的服务器上
```

三部分各管一段：

- **mem0 本体**：开源记忆服务（[mem0ai/mem0](https://github.com/mem0ai/mem0)），负责存储、语义检索和可选的 LLM 提炼
- **网关（[gateway.py](https://github.com/mindcarver/mem0-tools/blob/main/gateway.py)）**：两百行出头的翻译层兼守门员，下文细讲
- **工具集**：迁移（zcode_memory_migrate.py）、整理（dream.py）、备份（backup_mem0.sh）、巡检（consistency_check.py）

全文跟着一条典型的记忆走：比如 11 月 1 日我在 Mac 上让 Claude Code 记住「截至 2026-11-01，shortagent 测试统一用 make test，pytest 已废弃」。它会经过网关落库，第二天在 Windows 的 ZCode 里被召回，一个月后被整理程序合并掉旧版本，并且始终躺在每日备份里。

## 前置条件

- 一台常开的 Linux 服务器（内网即可），装好 Docker 和 docker compose
- 至少一台开发机，上面跑着你常用的 agent（Claude Code、Codex、ZCode 或任何支持 HTTP MCP 的客户端）
- 服务器上有 Python 3.8+
- 可选：服务器本机装 Ollama 和 bge-m3 嵌入模型，用于不想让记忆内容出内网的场景

整套工具没有 requirements.txt：网关、迁移、整理脚本全部只用 Python 标准库。

## 第一步：服务器上跑起 mem0

按 mem0 官方的 [自托管文档](https://docs.mem0.ai/open-source) 起 server：docker compose 会拉起三个容器，REST API（默认 8888 端口）、PostgreSQL 加 pgvector 插件（存记忆和向量）、管理面板。`.env` 里最关键的一项是 `ADMIN_API_KEY`，自己生成一个长随机串：

```bash
openssl rand -hex 32
```

起来后验证：

```bash
curl -s -H "X-API-Key: <ADMIN_API_KEY>" "http://127.0.0.1:8888/memories?user_id=test"
```

返回 JSON（哪怕是空列表）即通。接口细节见 [REST API 文档](https://docs.mem0.ai/open-source/features/rest-api)。

这里有两个选择题，说说我自己的选择。LLM 提炼我用智谱端点；海外可以用 OpenAI，全内网方案用本机 Ollama。

嵌入我选了服务器本机的 Ollama bge-m3。代价是约 3000 字符出头的正文会触发 413 错误，收益是记忆内容不离开我的机器。

## 第二步：部署网关，两百行解决三件事

网关存在的理由：mem0 说的是 HTTP REST，agent 说的是 MCP（Model Context Protocol，主流 AI 工具调用外部工具的通用协议），中间需要一个翻译。除了翻译，它还顺手解决了三个 mem0 开箱行为覆盖不到的问题：

1. **新旧排序**。mem0 检索按相似度排。同主题新旧两条并存时，旧的那条完全可能排前面。网关把结果按 `updated_at` 降序重排，新的永远在前。
2. **规则下发**。十几个 agent 怎么知道「任务开始先搜记忆」？规则内置在网关的 `mem0_rules` 工具里，agent 调一次就取到，不用每个客户端抄一份。
3. **鉴权收敛**。URL 带 `?key=`、`X-API-Key` 请求头、Bearer token 三种方式都收，对齐 mem0 服务端密钥，客户端怎么方便怎么来。

设计约束：只调 mem0 公开 REST，不改 mem0 一行源码。升级 mem0 不用改网关。

部署（systemd，服务器重启后自动拉起；先用 nohup 跑通再收编也行）：

```bash
# 先改 gateway.py 顶部三处常量：MEM0_URL、ENV_PATH（.env 路径）、DEFAULT_USER
sudo cp mem0-gateway.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now mem0-gateway
```

验收：

```bash
curl -s -X POST "http://<服务器IP>:8889/mcp?key=<ADMIN_API_KEY>" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

返回 `mem0_search`、`mem0_add` 等工具清单即通。

## 第三步：接入第一台 agent

内网机器一行命令。Claude Code：

```bash
claude mcp add --transport http mem0 "http://<服务器IP>:8889/mcp?key=<ADMIN_API_KEY>"
```

Codex 写进 `~/.codex/config.toml` 的 `[mcp_servers.mem0]`（带 `X-API-Key` 请求头），ZCode 写进 `~/.zcode/cli/config.json` 的 `mcp.servers`，完整格式见仓库 [README](https://github.com/mindcarver/mem0-tools/blob/main/README.md)。

`user_id` 在这里第一次出现：它是记忆的命名空间，同一个 `user_id` 下的记忆互相可见。默认所有机器共用一个（比如你的名字），这正是「共享」的实现方式；将来要给同事或客户隔离，再各发一个。

验收方式对所有客户端统一：对 agent 说「查一下记忆：服务器环境」，能返回结果就通了。再让它记一条本机身份事实，比如「Windows 机的 ZCode 已于今日接入」，之后在任何一台机器上都能搜到这条。

## 第四步：教会 agent 怎么写，两条铁律

这是全教程最值得带回的一节。两个实测踩出来的坑：

**坑一：mem0 这版只增不改。** 你写「更正：shortagent 改用 make test」，它不会去更新三个月前那条「用 pytest」，只会新增一条，两条并存。语义检索还偏爱旧的，因为旧条目和问题的字面更接近。

对策是写入纪律：项目状态类记忆必须带日期措辞，写成「截至 2026-11-01，shortagent 测试统一用 make test」。配合网关的时间排序，读到的人永远先看到新版本。日期是 ADD-only 模型下分辨新旧状态的唯一依据。

**坑二：LLM 提炼会吞长段落。** `infer` 是 mem0 的提炼开关：默认开启，服务端用 LLM 从你的文本里抽取事实再入库；密集的配置清单交给它，偶发返回空结果。对策：参数段落、环境清单这类内容传 `infer=false`，原文直存。

规则全文由网关下发，建议同时把「遵守 mem0 规则（调 mem0_rules 获取）」写进各 agent 的全局指令文件（CLAUDE.md、AGENTS.md），让它在会话一开始就生效。

拿上面的例子走一遍。我在 Mac 上说「记住，截至 11 月 1 日 shortagent 测试改用 make test」，agent 调 `mem0_add`，网关转发给 mem0，一条带元数据（来源、机器）的记忆落库。第二天我在 Windows 机上开 ZCode 修测试，会话开始 `mem0_search("shortagent 测试")`，网关重排后 11 月那条排在三个月前的 pytest 条目前面，agent 直接用对了命令。没人改过旧条目，是新旧顺序替我完成了「更新」。

## 第五步：外网机器走 SSH 隧道

不在内网的机器，先建隧道再连网关：`ssh -N -L 18889:localhost:8889 <你的服务器>`，然后 agent 里把 URL 换成 `http://127.0.0.1:18889/mcp`。

隧道的关键是要常驻。用 macOS 的 LaunchAgent（管理常驻进程的系统机制，进程挂了自动拉起），模板在仓库 [tunnel/ai.mem0.tunnel.plist](https://github.com/mindcarver/mem0-tools/blob/main/tunnel/ai.mem0.tunnel.plist)，改服务器地址、端口、用户三处。

不要用 nohup，这是我自己踩过的坑：nohup 起的隧道在 Mac 睡眠后静默退出，agent 每轮都报记忆不可用，我排查了很久才发现是转发进程没了。

两个模板细节：`KeepAlive` 必须写 `true`，写成条件保活（NetworkState 字典）实测不会在进程退出后重启；改完 plist 要先 `bootout` 再 `bootstrap` 才生效。

验收：`nc -z 127.0.0.1 18889` 通了再配 agent。

## 公网部署前：传输安全必做

到这一步为止，流量走的是内网直连或 SSH 隧道，HTTP 明文可以接受：内网流量不出网，隧道流量有 SSH 加密兜底。想把它暴露到公网让任何地方接入，先补三道锁。

第一道，HTTPS：在网关前面加一层反向代理（Caddy 或 Nginx）终结 TLS，网关继续只在内网监听，证书交给反代管。第二道，key 的位置：URL 里的 `?key=` 会进反代的访问日志和浏览器历史，公网形态下改用 `X-API-Key` 请求头（网关三种鉴权方式本来就都支持）。第三道，凭证隔离：给别人发接入凭证前先建独立 user_id，不要散播能读写全库的 admin key。

也可以永远不上公网：保持内网加隧道的形态，SSH 本身就是访问控制。我自己就一直跑这个形态。

## 第六步：把散落的旧记忆迁进来

`zcode_memory_migrate.py` 演示了迁移的通用套路：读本地记忆文件，`infer=false` 原文写入，元数据带上 `project` 标签；先拉全量按 (project, file) 去重再上传，所以幂等（重复执行不产生重复数据），中断了直接重跑：

```bash
MEM0_API_KEY=<ADMIN_API_KEY> python3 zcode_memory_migrate.py --dry-run   # 先预览
MEM0_API_KEY=<ADMIN_API_KEY> python3 zcode_memory_migrate.py             # 实际迁移
```

两个细节是我从失败里学来的。其一，嵌入模型有长度上限（bge-m3 约 3000 字符触发 413），超长正文按段落边界切段存，文件名标注 (i/n)。

其二，迁移脚本改版后新旧版本的条目键不一致，出现过整篇和分段并存。清理靠对账：本地键集合对库内键集合，多出来的手动删。

## 第七步：整理、备份、巡检

共享库会持续变脏，这是多端写入的必然结果。我第一次全库扫描拿到 1192 条：527 条 project 标签拼写错误、235 条占位标签待指认、966 条缺机器来源、5 条疑似凭据。没有治理的库，检索噪声随条数上涨，最后没人信任它。

`dream.py` 是整理驱动器，三段式流程，人在中间做裁决（完整流程与红线见 [skills/dream/SKILL.md](https://github.com/mindcarver/mem0-tools/blob/main/skills/dream/SKILL.md)）：

```bash
python3 dream.py status                                    # 连接自检
python3 dream.py scan > report.md                          # 人读报告
python3 dream.py scan --json > actions.json                # 机器可执行动作
python3 dream.py approve --all-safe < actions.json > ok.json
python3 dream.py apply < ok.json                           # 先备份再执行
```

动作分三级，对应三种信任程度：`auto_safe`（拼写纠正、标签回填，规则确定，可批量放行）；`review`（近重复合并、占位标签指认、过期状态打标，必须逐组过目）；`info`（凭据疑似，只报条目 id，不读原文不改不删）。

贯穿案例那条记忆就在这一步收尾：扫描发现「shortagent 测试」两条同前缀，生成合并候选，保 11 月新条删旧条，我过目后放行。

两条保险丝。apply 前强制在服务器上跑 pg_dump 全量备份，备份失败直接中止。多台机器都可能跑整理，服务器上的全局锁保证同一时刻只有一场，防止两个人同时删。

凭据疑似条目的处理顺序是先轮换密钥再谈删库，工具层面连预览都屏蔽，避免密文被带进报告。

备份独立于整理存在，每日 cron：pg_dump 两个库（记忆本体是权威备份）、`.env`、人可读 JSON 导出，保留 30 天。恢复就是把 gz 文件解压灌回 psql。巡检脚本每天按 project 分组把条目交给小模型找矛盾对，出报告人工裁决，兜住「带日期写」约定被忘掉的情况。

## 权衡与局限

- **单 key 全库读写**。接入零摩擦的代价：key 泄漏即全库暴露。给外人发 key 前先建独立 user_id，mem0 原生支持按 key 隔离。
- **两条通道权限不同**。网关刻意只开 search、add、get_all 和单条删除，收窄 agent 能碰的面。治理工具需要更新和批量操作，走的是能 ssh 到服务器的机器直连 REST。这是安全收益，代价是整理必须在受信机器上跑。
- **我没用官方托管平台**。mem0 有云托管版本，接入更省事，但记忆内容存在别人的云上，这是我不想接受的。这套方案的所有取舍都围绕一件事：数据在我自己的机器上。
- **原文直存保真但粒度粗**。`infer=false` 的条目长，检索命中后一大块。超 3000 字符的条目靠 split_tool 人工拆成原子条目，目前没有自动化。
- **只增不改是把双刃剑**。它让写入永不冲突，也让「最新状态」完全依赖日期措辞加时间排序的约定。约定靠巡检兜底，但没有数据库级的一致性保证。
- **语义检索不是精确查询**。想精确找某条、按条件批量统计，直接查 postgres 比调 API 可靠。

## 搬到你自己的环境要改哪里

脚本默认值就是我的环境，clone 后把这些常量全局搜一遍改掉：

| 文件 | 要改的常量 |
|---|---|
| gateway.py | `MEM0_URL`、`ENV_PATH`（.env 路径）、`DEFAULT_USER` |
| dream.py | `LAN`（内网地址）、`SSH_235`（ssh 别名）、`USER_ID` |
| consistency_check.py | `MEM0_URL`、`ENV_PATH`、模型端点 |
| backup_mem0.sh | `MEM0_DIR`、`OUT` |
| tunnel/ai.mem0.tunnel.plist | 服务器地址与用户 |

另外两个行为是版本相关的，遇到不一致先查版本：`GET /memories` 单页 1000 条上限（我的整理脚本因此改用大 top_k 的 search 做全量盘点），以及 infer 提炼返回空的行为。

## 上手

全部脚本、配置模板和 systemd unit 都在 [mem0-tools 仓库](https://github.com/mindcarver/mem0-tools/blob/main)：克隆后按「搬到你自己的环境要改哪里」一节改几处常量，第一步的 mem0 十分钟内就能跑起来验证。明天你的第二台机器，就能读到今天第一台机器写下的记忆。

## 延伸阅读

- [mem0 开源自托管文档](https://docs.mem0.ai/open-source)
- [mem0 REST API](https://docs.mem0.ai/open-source/features/rest-api)
- [mem0ai/mem0 仓库](https://github.com/mem0ai/mem0)
- [Model Context Protocol](https://modelcontextprotocol.io)
