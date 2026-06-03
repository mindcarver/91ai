<!--
调研来源（不发布，仅记录）：
1. GitHub 仓库 openai/codex: codex-rs/protocol/src/protocol.rs — AskForApproval 枚举、GranularApprovalConfig 结构体
2. GitHub 仓库 openai/codex: codex-rs/exec/src/exec.rs — execpolicy 规则引擎、pattern 匹配、decision 执行
3. Codex 官方文档: Agent approvals & security — approval_policy 四种模式、auto_review 审查器
4. Codex 官方文档: Configuration Reference — approvals_reviewer、auto_review.policy、guardian_policy_config
5. Codex 官方文档: requirements.toml — allowed_approval_policies、allowed_approvals_reviewers 约束
6. 本系列第 05 篇: 审批模式基础概念 — untrusted / on-request / never 的行为与场景
7. 本系列第 18 篇: /permissions /approve 命令 — 交互层切换和 auto_review 实战
版本基准: 2026 年 6 月
-->

# Codex CLI 审批策略详解：从 untrusted 到 never 的安全梯度

> **TL;DR** — `approval_policy` 是 Codex 安全体系的核心旋钮，控制 AI 在执行操作前是否需要停下来问你。四种模式形成从保守到激进的安全梯度：`untrusted` 每步都确认、`on-request` 沙箱内自动沙箱外询问、`never` 全自动适合 CI、`granular` 提供五个独立维度逐项开关。`approvals_reviewer` 可以把审批交给 AI 自动审查器（`auto_review`），配合 `[auto_review].policy` 策略文件和 `/approve` 重试机制实现"半自动"审批。execpolicy 命令规则让你按前缀模式拦截特定命令。`requirements.toml` 的 `allowed_approval_policies` 和 `allowed_approvals_reviewers` 让企业安全团队统一管控审批策略的可用范围。本文把这套体系从配置语法到实际场景完整拆开。

---

## 1. 审批策略解决什么问题

LLM 编程代理有一个根本矛盾：你希望它足够自主来完成复杂任务，但又害怕它自主过头搞出不可逆的破坏。

想象一个具体的场景。你让 Codex 做一个"给数据库加一个字段"的任务。正常流程是：读 model 文件 → 改 migration 文件 → 跑 migration → 更新 API 接口 → 跑测试。这五步里，读文件和改代码文件基本无害——有 git 可以回滚。但跑 migration 是一条 SQL 命令，直接操作你的数据库。如果 Codex 的 SQL 写错了，可能丢数据或者锁表。

审批策略就是解决这个矛盾的。它在"完全手动确认"和"完全放权"之间提供一个梯度，让你按场景选择。

第 05 篇已经介绍了四种审批模式的表面行为。本篇的目标是把它拆到工程层面：每个配置项到底怎么工作、什么时候生效、互相之间怎么组合、企业环境怎么管。

先厘清几个容易混淆的概念：

**审批策略 vs 沙箱模式**：沙箱模式（`sandbox_mode`）控制 Codex "能不能做"某个操作——比如能不能写 workspace 外的文件。审批策略（`approval_policy`）控制 Codex "要不要问你"才能做这个操作。即使审批策略是 `never`，沙箱仍然会拦住超出范围的文件访问。反过来，审批策略是 `untrusted` 时，沙箱内的读操作也要你确认——沙箱允许的，审批不一定放行。

**审批策略 vs execpolicy**：审批策略是用户侧的配置，决定哪些操作需要确认。execpolicy（执行策略）是规则引擎侧的配置，通过命令前缀匹配来决定对特定命令做 `prompt`（询问）还是 `forbidden`（禁止）。两者配合工作：execpolicy 的 `prompt` 规则触发后，实际走哪条审批路径，取决于你的 `approval_policy` 设置。

**`false` 不等于自动通过**：这是 `granular` 模式里最常见的误解。五个子开关设成 `false` 不是"自动放行"，而是"自动拒绝"。每个通道只有两个状态：弹审批让你手动决定（`true`），或者直接拒绝（`false`）。如果你把所有五个通道都设成 `false`，Codex 几乎什么操作都做不了。

---

## 2. 四种审批模式

`approval_policy` 接受四种值。它们的核心区别不在于"哪些操作被拦截"，而在于"谁来做拦截决策"。

### 2.1 untrusted：每步都问

```toml
approval_policy = "untrusted"
```

这是最保守的模式。只有 Codex 内部的 `is_safe_command()` 判定为已知安全的只读操作会自动通过——通常是 `cat`、`grep`、`ls`、`git diff`、`git log` 这些不会产生副作用的命令。文件编辑、命令执行（哪怕是 `npm test`）都需要你手动确认。

实际体验：如果你让 Codex 做一个涉及 20 个文件的重构任务，你需要按大约 40 次 Y——读文件 20 次，改文件 20 次。还有中间可能穿插的命令执行（lint、test），每次都弹审批。效率大约是全自动模式的三分之一到一半。

什么情况下值得用这个模式？三种：

1. 你第一次用 Codex，想观察它的行为模式。
2. 你在处理陌生代码库，不确定里面有没有恶意的构建脚本或者危险的 Makefile。
3. 你在做高风险操作——数据库 migration、生产环境配置修改、涉及金钱的业务逻辑。

一个实用技巧：用 `untrusted` 开头，观察 Codex 前几步的行为是否合理。如果它在预期之内，会话中途通过 `/permissions` 切到 `on-request`。这样你不需要全程按 Y，又能在开头建立一个基本的信任判断。

### 2.2 on-request：默认平衡

```toml
approval_policy = "on-request"
```

这是默认值。Codex 在沙箱权限范围内的操作自动执行，需要突破沙箱边界时才弹审批。

"沙箱权限范围内"具体是什么？以默认的 `workspace-write` 沙箱为例：

- 读写 workspace 内的文件 → 自动通过
- 执行不会访问网络的命令 → 自动通过
- 安装依赖（需要网络） → 弹审批
- 修改 workspace 外的文件 → 弹审批
- 执行 `curl`、`wget` 等网络命令 → 弹审批

设计逻辑是"undo 成本"。改文件可以用 `git checkout` 回滚，风险可控；网络请求和跨目录操作可能产生不可逆的副作用，需要人工把关。

这个模式的一个隐含假设是：Codex 不会主动做"超出任务范围"的改动。但在实际使用中，Codex 可能顺手改了它认为"相关"的文件——比如你在让它修 A 文件的 bug，它发现 B 文件有一个相关的 import 路径不规范就一起改了。这些改动单独看都合理，但如果你只检查目标文件的 diff，可能漏掉。

建议：养成 `codex` 会话结束后跑 `git diff` 的习惯。不只是检查有没有改错——你在读 diff 的过程中也在理解项目变更，比单纯看 diff 更有学习价值。

### 2.3 never：全自动

```toml
approval_policy = "never"
```

Codex 永远不会停下来问你。所有操作直接执行，不弹审批提示。失败的操作返回错误信息给模型，模型自行决定下一步。

`never` 不等于没有安全网。沙箱仍然生效：

- macOS 上 Seatbelt 限制文件系统访问和网络
- Linux 上 Bubblewrap + seccomp 限制系统调用
- 受保护路径（`.git`、`.codex`、`.agents`）始终只读
- 所有操作记录在 transcript 中，可事后审查

适用场景：

- `codex exec` 非交互模式（CI/CD 环境，没有人类审批入口）
- 你已经对 Codex 在这个项目上的表现有充分信任
- 大规模重构任务，需要 Codex 连贯执行不被打断

一个重要的安全提醒：不要在 config.toml 里永久设置 `never`。只在特定任务的 CLI 标志中临时启用（`codex -a never "重构这个模块"`），任务完成后默认恢复到 `on-request`。

### 2.4 四种模式对比

| 维度 | `untrusted` | `on-request` | `never` | `granular` |
|------|-------------|--------------|---------|------------|
| 审批触发 | 几乎所有写操作 | 沙箱边界操作 | 无 | 按五个维度分别控制 |
| 审批决策者 | 你 | Codex（模型判断） | 无 | 你（`true`）或直接拒绝（`false`） |
| 文件编辑 | 每次确认 | workspace 内自动 | 自动 | 取决于 sandbox_approval |
| 命令执行 | 每次确认 | 沙箱内自动 | 自动 | 取决于 rules |
| MCP 交互 | 每次确认 | 沙箱内自动 | 自动 | 取决于 mcp_elicitations |
| 典型场景 | 陌生项目、学习 | 日常开发 | CI/CD、大规模重构 | 需要精细控制的场景 |
| CLI 标志 | `-a untrusted` | 默认，无需指定 | `-a never` | 需写配置文件 |
| 风险等级 | 低 | 中 | 高 | 取决于配置 |

一个微妙但重要的区别：`untrusted` 的审批是由"硬编码的安全列表"决定的——只有列表里的命令自动通过。`on-request` 的审批是由模型自己判断的——它根据任务上下文决定这个操作是否需要你确认。`granular` 的审批是由你通过配置文件决定的——五个通道独立控制。三种决策机制完全不同。

---

## 3. granular 五个维度

`granular` 是给那些觉得"三个预设都不够精确"的人准备的。它把审批拆成五个独立的通道，每个通道有自己的开关。

```toml
approval_policy = { granular = {
  sandbox_approval = true,
  rules = true,
  mcp_elicitations = true,
  request_permissions = false,
  skill_approval = false
} }
```

理解 `granular` 的关键在于：`true` 表示"弹出审批让你决定"，`false` 表示"直接拒绝，不问"。不存在"自动通过"的选项。如果你希望某个通道自动通过，你应该用 `on-request` 或 `never` 模式，而不是 `granular` 模式下设 `true` 然后每次都按 Y。

### 3.1 sandbox_approval

控制沙箱升级审批。当 Codex 当前在 `workspace-write` 沙箱内运行，但某个操作需要突破沙箱限制（比如修改 workspace 外的配置文件、访问网络），这个请求会路由到 `sandbox_approval` 通道。

- `true`：弹审批提示，你选择允许或拒绝
- `false`：直接拒绝，Codex 无法突破沙箱，任务可能卡住

典型场景：你的项目在 `~/projects/myapp/`，Codex 需要读取 `/etc/nginx/nginx.conf` 来帮你配置反向代理。这个路径不在 workspace 内，触发 `sandbox_approval`。

一个容易忽略的点：`sandbox_approval` 只在沙箱"升级"时触发，不在沙箱"降级"时触发。如果 Codex 主动放弃某个权限（比如从 full-access 降级到 workspace-write），不需要你确认。

### 3.2 rules

控制 execpolicy 命令规则触发后的审批路径。Codex 内部有一套命令执行策略引擎（execpolicy），可以通过 `.rules` 文件或 `requirements.toml` 定义命令前缀规则。当某个命令匹配到 `decision = "prompt"` 的规则时，触发 `rules` 通道。

- `true`：匹配到 `prompt` 规则的命令弹审批
- `false`：匹配到 `prompt` 规则的命令直接拒绝

典型场景：你在 `.rules` 文件里定义了一条规则——"所有包含 `DROP TABLE` 的命令触发审批"。Codex 尝试执行一条 migration SQL，SQL 里有 `DROP TABLE IF EXISTS temp_table`，匹配到规则。如果 `rules = true`，你看到审批提示，可以判断这条 SQL 是否安全然后决定；如果 `rules = false`，直接拒绝，Codex 需要换一种方式完成任务。

`rules` 和 `sandbox_approval` 的区别：`sandbox_approval` 关注的是"能不能做"（权限边界），`rules` 关注的是"做了什么"（命令内容）。一个操作可能同时触发两个通道——比如 Codex 想在 workspace 外执行一条 `rm -rf` 命令，`sandbox_approval` 因为跨沙箱触发，`rules` 因为命令前缀匹配触发。

### 3.3 mcp_elicitations

控制 MCP（Model Context Protocol）工具的交互请求。MCP 服务器除了提供工具外，还可以发起需要用户参与的交互——比如 OAuth 登录确认、输入 API 凭据、确认是否允许某个操作。

- `true`：MCP 服务器的交互请求弹到你面前
- `false`：交互请求直接拒绝

典型场景：你连接了一个 GitHub MCP 服务器。Codex 想用这个服务器创建一个 PR。GitHub MCP 发起一个确认请求："即将在 openai/codex 仓库创建 Pull Request #123，是否继续？"如果 `mcp_elicitations = true`，你看到这个确认；如果是 `false`，直接拒绝，Codex 无法通过 MCP 创建 PR。

这个通道的安全意义在于：MCP 服务器是外部进程，你无法完全控制它的行为。一个恶意的 MCP 服务器可能在"确认请求"中伪装成 Codex 让你输入密码或者授权某个危险操作。`mcp_elicitations` 让你有机会审查每一个来自 MCP 的交互请求。

日常开发中，如果你只连接了自己信任的 MCP 服务器（比如官方的 GitHub MCP、PostgreSQL MCP），可以设成 `true` 来减少审批弹窗。如果你不确定某个 MCP 服务器是否安全，设成 `false` 拒绝所有交互。

### 3.4 request_permissions

控制 Codex 通过 `request_permissions` 工具主动请求额外权限。Codex 在任务执行过程中，如果发现当前权限不够完成目标，可以通过这个工具向你申请额外权限——比如"我需要读取 `/etc/hosts` 来帮你诊断网络问题，可以吗？"

- `true`：权限请求弹到你面前，你决定是否授予
- `false`：权限请求直接拒绝，Codex 在当前权限范围内继续工作

一个设计选择上的问题：为什么不让 Codex 直接尝试操作，失败了再回退？因为某些操作如果直接执行，即使被沙箱拦截，也可能留下副作用或者日志记录。`request_permissions` 让 Codex 在"尝试之前"先问你，避免无谓的尝试。

实际使用中，`request_permissions = false` 比较常见。日常开发中 Codex 很少需要额外的系统权限——大多数任务都可以在 workspace-write 沙箱内完成。设成 `false` 可以避免一个不太常见的审批弹窗。

### 3.5 skill_approval

控制 Skill 脚本的执行审批。Codex 的 Skill 系统允许执行自定义脚本——比如一个自动格式化代码的 Skill 会调用 `prettier`，一个部署 Skill 会调用 `docker` 命令。这些脚本有实际的副作用。

- `true`：Skill 脚本执行前弹审批
- `false`：Skill 脚本执行前直接拒绝

典型场景：你的团队在 AGENTS.md 里定义了一个 `deploy` Skill，它会在 CI 通过后自动执行 `docker build` 和 `docker push`。如果 `skill_approval = true`，每次 Skill 执行前你都会看到审批提示；如果 `false`，Skill 无法执行。

如果你主要使用自己或团队编写的、经过审核的 Skill，可以考虑设成 `true` 然后在每次弹审批时快速确认——至少你能知道 Skill 什么时候被触发了。如果你很少用 Skill，设成 `false` 没什么影响。

### 3.6 granular 配置的实用模板

个人日常开发（信任 Codex 但保留关键控制）：

```toml
approval_policy = { granular = {
  sandbox_approval = true,       # 沙箱升级要问
  rules = true,                   # 命令规则匹配要问
  mcp_elicitations = true,        # MCP 交互要问
  request_permissions = false,    # 不允许主动要权限
  skill_approval = false          # 不用 Skill
} }
```

团队开发（只开放读和沙箱内写，其他一律拒绝）：

```toml
approval_policy = { granular = {
  sandbox_approval = false,       # 不允许突破沙箱
  rules = false,                  # 命令规则匹配直接拒绝
  mcp_elicitations = false,       # MCP 交互直接拒绝
  request_permissions = false,    # 不允许要权限
  skill_approval = false          # 不允许 Skill
} }
sandbox_mode = "workspace-write"
```

注意这个配置下，Codex 只能做沙箱内自动通过的操作（读写 workspace 文件）。任何需要审批的操作都会被拒绝。适合不信任 Codex 但又想用它做代码分析的场景。

---

## 4. 自动审查 auto_review

### 4.1 approvals_reviewer 配置

`approval_policy` 决定了"什么操作需要审批"，而 `approvals_reviewer` 决定了"谁来审批"。

```toml
approval_policy = "on-request"
approvals_reviewer = "user"          # 默认值，审批请求到你自己面前
```

```toml
approval_policy = "on-request"
approvals_reviewer = "auto_review"   # 审批请求先经过 AI 审查器
```

两个可选值：

- `"user"`：审批请求直接弹到你面前。这是默认行为。第 05 篇和第 18 篇里描述的所有审批交互，都是基于这个值。
- `"auto_review"`：审批请求不直接给你，先经过一个 AI 审查子代理。审查器根据策略判断是允许、拒绝、还是需要你亲自看。

`auto_review` 本质上是在"每步都问人"和"全自动"之间插了一个缓冲层。审查器是一个轻量级的 AI 模型，它能理解操作的含义和风险，但不需要你盯着屏幕。

### 4.2 auto_review.policy 策略

审查器的行为由 `[auto_review].policy` 控制。这是一个自然语言策略描述——你用人类语言告诉审查器什么能通过、什么要拒绝。

```toml
approvals_reviewer = "auto_review"

[auto_review]
policy = """
允许运行以下命令：npm test、cargo test、pytest、cargo build、npm run build。
允许读写 src/ 和 tests/ 目录下的文件。
拒绝任何包含 DROP TABLE、DELETE FROM、TRUNCATE 的 SQL 命令。
拒绝访问 /etc/、~/.ssh/、~/.aws/ 目录。
拒绝 sudo 命令。
拒绝任何包含 rm -rf / 的命令。
"""
```

审查器的工作方式：

1. Codex 需要执行某个操作。
2. 操作触发审批（根据 `approval_policy`）。
3. 审批请求被路由到 `auto_review` 审查器，而不是你的屏幕。
4. 审查器读取 `policy` 文本，分析操作的风险。
5. 审查器输出判断结果：允许、拒绝、或需要人工确认。
6. 允许的操作直接执行。拒绝的操作等你用 `/approve` 决定。需要人工确认的操作弹到你面前。

策略写得越精确，审查器越不容易误判。好的策略用具体的命令模式和路径，而不是笼统的描述。

好的写法：

```
允许运行 pytest 和 cargo test 命令。
允许读写 src/ 和 tests/ 目录下的 .py 和 .rs 文件。
拒绝任何包含 DROP TABLE 或 DELETE FROM 的 SQL 命令。
拒绝访问 /etc/ 目录。
```

不好的写法：

```
允许安全的操作。
拒绝危险的操作。
```

后者太模糊了，审查器几乎无法做出准确判断。"安全"和"危险"对不同的人意味着不同的事情。

### 4.3 guardian_policy_config

企业环境下还有一个更高优先级的策略来源：`guardian_policy_config`。

```toml
# 这个配置通常由企业管理员通过 OpenAI 后台设置
# 不由个人用户手动编辑
[guardian_policy_config]
policy = "公司安全策略：禁止访问生产数据库，禁止修改基础设施配置文件"
```

优先级规则：`guardian_policy_config` > 本地 `[auto_review].policy` > 默认行为。

这意味着：即使你的本地策略写着"允许所有操作"，企业管理员下发的策略仍然可以拦住高风险操作。你无法绕过它——这是设计如此。

这种机制在大型团队里很关键。安全团队不需要逐个修改每个人的 config.toml，统一在 OpenAI 管理后台配置策略，所有使用企业账号的 Codex 实例都会加载这个策略。当策略更新时，不需要用户做任何操作，下次启动 Codex 自动生效。

`guardian_policy_config` 需要企业套餐（Business 或 Enterprise）。个人账号和 API Key 不支持这个配置项。

### 4.4 /approve 重试机制

当 `auto_review` 拒绝了一个操作，Codex 不会自动放弃——它会告诉你"某个操作被自动审查器拒绝了"。如果你看了被拒绝的操作内容，判断它是安全的，可以在 TUI 里输入 `/approve` 重试一次。

流程：

```
Codex: 我需要运行 `npm install @tanstack/react-query`
（审批请求路由到 auto_review 审查器）
自动审查器: 拒绝。理由：策略禁止网络访问。
Codex: 操作被自动审查器拒绝。如果需要重试，请输入 /approve。

你：/approve

（操作重新执行，这次你可能需要手动确认）
```

几个注意事项：

- `/approve` 只重试最近一次被拒绝的操作。如果连续多个操作被拒绝，需要逐个 `/approve`。
- 如果审查器反复拒绝同类操作，你应该调整 `policy` 策略，而不是每次都手动批准。反复手动批准说明策略写得太严格了。
- 如果你的 `approval_policy` 不是 `auto_review`（即 `approvals_reviewer = "user"`），`/approve` 没有意义——因为审批请求直接到你自己面前，不存在"被自动拒绝后需要手动批准"的场景。
- `/approve` 执行后如果操作成功，Codex 继续原来的工作流。如果操作仍然失败（比如网络确实不通），Codex 会尝试换一种方式完成任务。

---

## 5. 执行策略 execpolicy

### 5.1 什么是 execpolicy

execpolicy 是 Codex 内部的命令规则引擎。它通过匹配命令的前缀模式来决定对特定命令做什么：弹审批（`prompt`）还是直接禁止（`forbidden`）。

execpolicy 的规则来自两个地方：

1. **项目根目录的 `.rules` 文件**：项目级别的命令规则，提交到版本控制，团队共享。
2. **`requirements.toml` 中的 `rules.prefix_rules`**：更正式的规则定义，通常由项目管理员维护。

两条路径都可以定义规则，`requirements.toml` 的优先级更高。

### 5.2 命令规则格式

`.rules` 文件的格式：

```
pattern: "DROP TABLE"
decision: prompt
justification: "DROP TABLE 操作不可逆，需要人工确认"

pattern: "rm -rf /"
decision: forbidden
justification: "递归删除根目录，极度危险"

pattern: "sudo "
decision: prompt
justification: "提权操作需要人工确认"
```

`requirements.toml` 中的等价配置：

```toml
[[rules.prefix_rules]]
pattern = "DROP TABLE"
decision = "prompt"
justification = "DROP TABLE 操作不可逆，需要人工确认"

[[rules.prefix_rules]]
pattern = "rm -rf /"
decision = "forbidden"
justification = "递归删除根目录，极度危险"

[[rules.prefix_rules]]
pattern = "sudo "
decision = "prompt"
justification = "提权操作需要人工确认"
```

### 5.3 pattern 匹配规则

`pattern` 字段是命令的前缀表达式。Codex 执行命令时，会检查命令字符串是否以 `pattern` 指定的字符串开头。

几个例子：

- `pattern = "DROP TABLE"` → 匹配 `DROP TABLE users;`、`DROP TABLE IF EXISTS temp;`
- `pattern = "rm -rf /"` → 匹配 `rm -rf /var/log/app`
- `pattern = "sudo "` → 匹配 `sudo apt-get install`、`sudo systemctl restart nginx`

注意 `pattern` 是前缀匹配，不是子串匹配。`pattern = "rm"` 会匹配 `rm file.txt`，也会匹配 `rm -rf /`——如果你只想拦截后者，需要写完整的 `rm -rf /`。

如果 `pattern = "DROP"`，那么 `DROP TABLE`、`DROP INDEX`、`DROP DATABASE` 都会匹配。这是一种宽泛但有效的防护——任何 DROP 操作都值得人工确认。

`pattern` 匹配到的命令走哪条路径，取决于两个东西：

1. `decision` 字段：`prompt`（弹审批）还是 `forbidden`（直接禁止）。
2. 你的 `approval_policy` 设置：如果 `decision = "prompt"`，实际弹不弹审批由审批策略决定。

### 5.4 decision 类型

两种：

- **`prompt`**：匹配到的命令触发审批。如果 `approval_policy` 是 `untrusted`，弹到你面前；如果是 `on-request` 且操作在沙箱外，弹到你面前；如果是 `granular`，走 `rules` 通道。
- **`forbidden`**：匹配到的命令直接禁止执行。不论 `approval_policy` 是什么，`forbidden` 命令都不会被执行。Codex 收到禁止信号后需要换一种方式完成任务。

`forbidden` 的优先级高于审批策略。即使你设置了 `approval_policy = "never"`，`forbidden` 的命令仍然会被拦截。这是一个硬性安全边界——execpolicy 的 `forbidden` 不受审批策略的影响。

`justification` 字段是可选的。它的内容会在审批弹窗或拒绝信息中显示，帮助你理解为什么这条规则存在。对于团队协作的项目，`justification` 特别有用——新加入的成员看到 "DROP TABLE 操作不可逆，需要人工确认" 就知道为什么每次跑 migration 都要确认了。

### 5.5 execpolicy 和审批策略的交互

完整的决策流程：

```
Codex 要执行命令 "npm install lodash"
    ↓
execpolicy 规则引擎检查
    ↓
是否有匹配的 prefix_rules？
    ├─ 没有 → 按 approval_policy 正常处理
    ├─ 匹配到 decision = "forbidden" → 直接拒绝（不受 approval_policy 影响）
    └─ 匹配到 decision = "prompt"
         ↓
         approval_policy 决定怎么处理
         ├─ "untrusted" → 弹到你面前
         ├─ "on-request" → 沙箱内自动通过（如果 npm install 在沙箱内的话）
         ├─ "never" → 直接执行
         └─ "granular" → 走 rules 通道
              ├─ rules = true → 弹到你面前
              └─ rules = false → 直接拒绝
```

理解这个流程后你就知道：execpolicy 的 `prompt` 规则不是"必定弹审批"，而是"把命令标记为需要关注"。最终弹不弹审批、由谁来审批，取决于你的 `approval_policy` 和 `approvals_reviewer` 设置。

### 5.6 实用的 execpolicy 配置示例

一个前端项目的 `.rules` 文件：

```
pattern: "rm -rf"
decision: prompt
justification: "递归删除操作需要确认目标路径"

pattern: "DROP TABLE"
decision: prompt
justification: "数据库结构变更需要人工确认"

pattern: "sudo "
decision: forbidden
justification: "前端项目不应该需要 sudo 权限"

pattern: "curl "
decision: prompt
justification: "外部网络请求需要确认"

pattern: "git push"
decision: prompt
justification: "推送代码到远程需要确认"
```

一个后端项目的 `.rules` 文件：

```
pattern: "DROP TABLE"
decision: prompt
justification: "数据库表删除不可逆"

pattern: "DELETE FROM"
decision: prompt
justification: "数据删除需要确认"

pattern: "TRUNCATE"
decision: prompt
justification: "清空表操作不可逆"

pattern: "ALTER TABLE"
decision: prompt
justification: "表结构变更需要确认"

pattern: "sudo systemctl"
decision: forbidden
justification: "禁止修改系统服务状态"

pattern: "rm -rf /"
decision: forbidden
justification: "绝对禁止删除根目录"
```

建议把 `.rules` 文件提交到版本控制。这样团队成员共享同一套命令规则，不会因为个人配置差异导致安全防护不统一。

---

## 6. requirements.toml 管理约束

### 6.1 什么是 requirements.toml

`requirements.toml` 是项目级别的配置文件，放在项目根目录（和 `AGENTS.md` 同级）。它和 config.toml 的区别在于：config.toml 偏向个人偏好（模型选择、主题、快捷键），requirements.toml 偏向项目规范（安全策略、依赖约束、审批限制）。

在审批策略这个维度上，`requirements.toml` 提供了两个约束能力：

- `allowed_approval_policies`：限制可用的审批策略列表
- `allowed_approvals_reviewers`：限制可用的审批审查者列表

### 6.2 allowed_approval_policies

```toml
# requirements.toml

allowed_approval_policies = ["untrusted", "on-request"]
```

这个配置的意思是：在这个项目中，团队成员只能使用 `untrusted` 或 `on-request` 两种审批策略。`never` 和 `granular` 被禁止。

如果有人尝试在这个项目中用 `codex -a never "重构模块"`，Codex 会拒绝启动或者忽略 `never` 设置，降级到允许列表中的某个策略。

为什么需要这个约束？几个典型场景：

1. **企业安全合规**：合规要求 AI 编程代理不能在无人监督的情况下执行操作。`never` 模式违反这个要求。
2. **团队统一基线**：技术负责人希望团队使用一致的审批策略，避免有人用全自动模式引入风险。
3. **敏感项目**：涉及金融数据、医疗数据的项目，需要严格的操作确认机制。

如果你不设置 `allowed_approval_policies`，默认所有审批策略都可用。只有显式列出的策略才被允许——这是一个白名单机制。

配置为空列表是一个有效的做法：

```toml
allowed_approval_policies = []
```

这意味着所有审批策略都被禁止——Codex 无法在这个项目中使用任何审批模式。这是一个极端的安全设置，通常只在最高安全等级的项目中使用。

### 6.3 allowed_approvals_reviewers

```toml
# requirements.toml

allowed_approvals_reviewers = ["user"]
```

这个配置的意思是：在这个项目中，审批必须由人工完成，不能使用 `auto_review` 自动审查器。

如果有人尝试配置 `approvals_reviewer = "auto_review"`，Codex 会拒绝或者降级到 `"user"`。

为什么需要这个约束？

1. **合规要求**：某些行业的合规规定要求关键操作必须由"经过授权的自然人"确认，AI 自动审查不满足这个要求。
2. **审计追踪**：人工审批可以在审计日志中追踪到具体的人。`auto_review` 的审批是由 AI 做的，审计追踪的颗粒度不够细。
3. **信任边界**：团队不信任 `auto_review` 的判断能力，宁可每次都人工确认也不冒误判的风险。

反过来，如果团队希望强制使用 `auto_review`（比如为了统一审批标准，避免不同人判断标准不一致），可以只允许 `auto_review`：

```toml
allowed_approvals_reviewers = ["auto_review"]
```

### 6.4 企业强制策略的综合配置

把上面的能力组合起来，一个典型的企业安全配置可能是这样的：

```toml
# requirements.toml（提交到版本控制）

# 只允许 on-request 和 untrusted 审批策略
# 禁止 never（全自动）和 granular（细粒度控制可能绕过安全基线）
allowed_approval_policies = ["on-request", "untrusted"]

# 审批必须由人工完成
allowed_approvals_reviewers = ["user"]

# execpolicy 命令规则
[[rules.prefix_rules]]
pattern = "DROP TABLE"
decision = "prompt"
justification = "数据库表删除不可逆，需要人工确认"

[[rules.prefix_rules]]
pattern = "DELETE FROM"
decision = "prompt"
justification = "数据删除需要人工确认"

[[rules.prefix_rules]]
pattern = "rm -rf /"
decision = "forbidden"
justification = "绝对禁止删除根目录"

[[rules.prefix_rules]]
pattern = "sudo "
decision = "prompt"
justification = "提权操作需要人工确认"

[[rules.prefix_rules]]
pattern = "curl "
decision = "prompt"
justification = "外部网络请求需要确认"
```

团队成员拿到这个项目后，无论他们的个人 config.toml 怎么配，Codex 都会强制执行这些约束。`requirements.toml` 的优先级高于个人配置。

### 6.5 配置优先级总结

从高到低排列：

1. **`guardian_policy_config`**（企业管理员云端下发）——最高优先级，不可绕过
2. **`requirements.toml`**（项目根目录，版本控制）——项目级约束，覆盖个人配置
3. **CLI 标志**（`codex -a never`）——覆盖 config.toml，但被 requirements.toml 限制
4. **`config.toml`**（个人全局或项目级）——个人偏好，最低优先级

```
guardian_policy_config（云端）
    ↓ 覆盖
requirements.toml（项目根目录）
    ↓ 覆盖
CLI 标志
    ↓ 覆盖
config.toml
    ↓ 覆盖
config.toml（项目级）
```

如果 `requirements.toml` 禁止了 `never` 策略，那么 CLI 标志 `-a never` 也会被忽略。这是安全设计——你不能通过命令行参数绕过项目级的安全约束。

---

## 7. 审批策略选择指南

### 场景一：个人项目

你一个人维护一个 side project，代码在 GitHub 上有版本控制。

推荐配置：

```toml
# ~/.codex/config.toml
approval_policy = "on-request"
sandbox_mode = "workspace-write"
```

理由：`on-request` 是日常开发的最佳平衡。文件修改自动执行不打断你，只有需要网络或访问 workspace 外时才弹审批。你的项目有 git，改错了随时回滚。不需要搞复杂的 `granular` 配置。

如果你偶尔需要做大规模重构，临时用 CLI 标志：

```bash
codex -a never "把所有 class component 重构为 hooks"
```

任务完成后 `git diff` 检查。`never` 只在这条命令中生效，不影响后续会话。

### 场景二：团队协作

你和五六个同事一起开发一个内部工具。项目在私有仓库，有代码审查流程。

推荐配置：

项目级 `requirements.toml`（提交到版本控制）：

```toml
allowed_approval_policies = ["on-request", "untrusted"]
allowed_approvals_reviewers = ["user"]

[[rules.prefix_rules]]
pattern = "DROP TABLE"
decision = "prompt"
justification = "数据库表删除不可逆"

[[rules.prefix_rules]]
pattern = "rm -rf /"
decision = "forbidden"
justification = "绝对禁止"

[[rules.prefix_rules]]
pattern = "sudo "
decision = "prompt"
justification = "提权操作需要确认"
```

个人 `~/.codex/config.toml`：

```toml
approval_policy = "on-request"
sandbox_mode = "workspace-write"
```

理由：`requirements.toml` 确保没有人用 `never` 全自动模式，`forbidden` 规则硬性拦截最危险的操作。个人配置保持 `on-request` 日常开发效率高。`prompt` 规则覆盖了剩余的灰色地带。

### 场景三：CI/CD 自动化

你在 GitHub Actions 里用 `codex exec` 做代码审查或自动修复。

推荐配置：

```yaml
# .github/workflows/codex-review.yml
- run: |
    codex exec --sandbox workspace-write \
      "审查这个 PR 的代码变更"
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

项目级 `requirements.toml`：

```toml
# CI 环境不需要审批策略约束
# 因为 codex exec 默认就是 never
# 沙箱提供足够的保护
sandbox_mode = "workspace-write"
```

理由：`codex exec` 是非交互模式，默认使用 `never`（因为没有人类审批入口）。沙箱仍然生效，限制 Codex 只能写工作目录。环境变量通过 CI secrets 注入，不会泄露。

如果 CI 任务需要联网（比如安装依赖），在 `.github/workflows` 里单独开启：

```bash
codex exec --sandbox network-read "安装依赖并运行测试"
```

### 场景四：高安全环境

金融、医疗、政府等合规要求严格的项目。

推荐配置：

```toml
# requirements.toml

allowed_approval_policies = ["untrusted"]
allowed_approvals_reviewers = ["user"]

[[rules.prefix_rules]]
pattern = "DROP TABLE"
decision = "forbidden"
justification = "合规要求：禁止自动删除数据库表"

[[rules.prefix_rules]]
pattern = "DELETE FROM"
decision = "forbidden"
justification = "合规要求：禁止自动删除数据"

[[rules.prefix_rules]]
pattern = "rm -rf"
decision = "forbidden"
justification = "合规要求：禁止递归删除操作"

[[rules.prefix_rules]]
pattern = "sudo "
decision = "forbidden"
justification = "合规要求：禁止提权操作"

[[rules.prefix_rules]]
pattern = "curl "
decision = "forbidden"
justification = "合规要求：禁止外部网络请求"
```

企业管理后台配置 `guardian_policy_config`：

```toml
[guardian_policy_config]
policy = """
所有涉及数据库写入的操作必须由授权人员审批。
禁止访问生产环境。
禁止通过 Codex 执行任何网络请求。
禁止修改基础设施配置。
"""
```

个人 `~/.codex/config.toml`：

```toml
# 个人偏好不起作用——被 requirements.toml 覆盖
# 但可以设置沙箱为最严格的 read-only
sandbox_mode = "read-only"
```

理由：多层防护。`requirements.toml` 限制只能用 `untrusted`，每步都要确认。execpolicy 把危险命令直接设成 `forbidden`，即使有人配了宽松的个人策略也执行不了。`guardian_policy_config` 提供云端层面的兜底保护。

这种配置下 Codex 的使用体验会比较"卡"——每一步都要确认。但对于高安全环境来说，宁可慢一点也不要出事。Codex 在这种环境下更适合做代码分析和审查，而不是直接修改代码。

---

## 8. 常见问题

### 策略不生效怎么办

检查优先级链：`guardian_policy_config` > `requirements.toml` > CLI 标志 > config.toml。

最常见的两个原因：

1. **`requirements.toml` 覆盖了你的设置**。如果你在 config.toml 里设了 `approval_policy = "never"`，但项目的 `requirements.toml` 里 `allowed_approval_policies` 没有包含 `"never"`，你的设置会被忽略。检查项目根目录有没有 `requirements.toml`。

2. **`guardian_policy_config` 覆盖了所有本地配置**。如果你用的是企业账号，企业管理员可能在后台配置了强制策略。这种情况下你无法通过本地配置绕过。联系管理员确认策略内容。

### granular 和 /permissions 的关系

`/permissions` 命令是 TUI 里的交互式权限切换面板。它目前只提供两个快速预设：Auto（对应 `on-request`）和 Read Only（对应 `untrusted`）。

`granular` 模式无法通过 `/permissions` 面板配置——你需要手动编辑 config.toml 或者用 CLI 标志。这是因为 `granular` 有五个子开关，不适合在简单的面板里交互式设置。

如果你用 `granular` 模式，`/permissions` 面板切换到 Auto 或 Read Only 会**覆盖**你的 `granular` 配置。这是一个需要注意的点——你精心调配的五个开关会被一个面板操作全部覆盖。

### 审批提示过多如何优化

如果你觉得审批弹窗太频繁，影响工作效率，有几个优化方向：

1. **检查是否该用 `on-request` 而不是 `untrusted`**。如果你在日常开发中还在用 `untrusted`，切换到 `on-request` 可以减少大部分审批弹窗。

2. **启用 `auto_review`**。设置 `approvals_reviewer = "auto_review"`，写一个合理的 `[auto_review].policy`，让 AI 审查器过滤掉低风险操作。你只需要处理审查器不确定的操作。

3. **检查 execpolicy 规则**。如果你在 `.rules` 或 `requirements.toml` 里定义了很多 `prompt` 规则，但很多匹配到的命令其实是安全的，考虑把部分规则的 `decision` 改成 `forbidden`（如果确实应该禁止）或者直接删除（如果不需要拦截）。

4. **检查 MCP 配置**。如果你连接了很多 MCP 服务器，`mcp_elicitations = true` 会导致 MCP 的每次交互都弹审批。如果你信任某些 MCP 服务器，可以考虑在 AGENTS.md 里写明使用规范，而不是依赖审批弹窗。

5. **考虑 Profile 切换**。创建两个 profile——一个严格模式（`untrusted`），一个宽松模式（`on-request` 或 `never`）。在不敏感的任务中用宽松 profile，在敏感操作前切到严格 profile。

### execpolicy 的 pattern 匹配不准确

如果 `pattern` 太短，可能匹配到不想拦截的命令。比如 `pattern = "rm"` 会匹配 `rm file.txt`（无害）和 `rm -rf /`（危险）。

解决方法：

- 写完整的命令前缀：`pattern = "rm -rf"` 而不是 `pattern = "rm"`
- 在 `justification` 中说明匹配范围，方便后续维护
- 如果需要更精细的控制，考虑用 `approval_policy = "granular"` 的 `rules` 通道来处理

### requirements.toml 和 .rules 同时存在怎么办

如果 `requirements.toml` 中的 `rules.prefix_rules` 和项目根目录的 `.rules` 文件都定义了规则，`requirements.toml` 的规则优先级更高。

实际操作建议：只用一个地方定义规则。要么全部写在 `requirements.toml` 里（更正式，适合团队），要么全部写在 `.rules` 里（更简单，适合个人项目）。不要两个地方都写——容易产生冲突和维护负担。

---

## 9. 下一步

本篇完整拆解了 Codex CLI 的审批策略体系。从四种审批模式的行为差异，到 `granular` 的五个独立维度，再到 `auto_review` 自动审查器、execpolicy 命令规则引擎、`requirements.toml` 管理约束——这套体系形成了一个从个人偏好到企业强制的多层安全梯度。

**下一篇（第 31 篇）**将讨论自动审核与权限持久化——`auto_review` 的深入配置、`permissions.toml` 持久化机制、以及如何在团队中分发和维护审批策略。

### 延伸阅读

- [Codex 官方文档 - Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security) — 审批与安全机制的官方说明
- [Codex 官方文档 - Configuration Reference](https://developers.openai.com/codex/config-reference) — config.toml 所有配置项的完整参考
- [Codex 官方文档 - requirements.toml](https://developers.openai.com/codex/requirements-toml) — 项目级约束配置
- [Codex 开源仓库 - AskForApproval 枚举](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs) — 审批策略的源码定义
- [Codex 开源仓库 - execpolicy 规则引擎](https://github.com/openai/codex/blob/main/codex-rs/exec/src/exec.rs) — 命令规则匹配和决策的源码实现
- 本系列第 05 篇 [三种审批模式详解](./05-approval-modes.md) — 审批策略的基础概念
- 本系列第 18 篇 [权限与安全命令](./18-cmd-permissions.md) — /permissions、/approve 交互层
- 本系列第 09 篇 [让 Codex 跑命令](./09-run-commands.md) — 命令执行与沙箱机制
- 本系列第 29 篇 [沙箱机制全解析](./29-sandbox.md) — 沙箱隔离的深入分析

---

*本文基于 Codex CLI 源码（`AskForApproval` 枚举、`GranularApprovalConfig` 结构体、execpolicy 规则引擎）和 2026 年 6 月的官方文档撰写。Codex 版本更新频繁，部分配置项和默认行为可能在未来版本中变更。*
