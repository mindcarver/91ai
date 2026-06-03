# Codex CLI 权限与安全命令：/permissions、/approve、/mcp、/experimental

> **TL;DR** Codex CLI 的权限与安全类命令让你在会话中实时控制 AI 能做什么、不能做什么。`/permissions` 切换审批预设（Auto / Read Only），也可以绑定命名的权限 profile；`/approve` 在自动审查拒绝某个操作后让你手动批准重试；`/mcp` 列出当前已配置的 MCP 工具和服务器诊断信息；`/sandbox-add-read-dir`（仅 Windows）给沙箱追加额外的可读目录；`/experimental` 开关实验性功能（Apps、Smart Approvals 等），写入 config.toml 持久生效。这些命令配合第 05 篇讲过的 `approval_policy` 四种模式（untrusted / on-request / never / granular）和 `approvals_reviewer = "auto_review"` 自动审查器，构成 Codex 安全体系的交互层。

---

## 1. 权限模型概览

在第 05 篇里我拆解了 Codex 的审批策略配置：`approval_policy` 有四个值（`untrusted`、`on-request`、`never`、`{ granular = {...} }`），`approvals_reviewer` 可以设成 `"user"`（你亲自审批）或 `"auto_review"`（AI 自动审查）。这些配置项写在 config.toml 里，或者在启动时通过 `--ask-for-approval` 标志指定，覆盖粒度是「每次启动」或「全局默认」。

但实际开发中，你经常需要在会话中途调整权限。几个典型场景：

- 你用 `untrusted` 模式开始审查一个陌生项目，观察了几轮操作后觉得 Codex 的行为没问题，想把审批放宽到 `on-request`——不想退出会话重来。
- 自动审查器拒绝了一个你认为安全的操作，你想手动批准让它继续。
- 你想看看当前连了哪些 MCP 工具，确认有没有不该暴露的工具。
- 你想试试 Smart Approvals 这个实验性功能，但不想翻 config.toml 手动改。

这些需求都对应 TUI 里的斜杠命令。本篇逐个拆解。

先厘清两个容易混淆的词：

**「审批」vs「权限」**：审批（approval）是 Codex 在执行某个操作前要不要问你；权限（permission）是 Codex 技术上能做什么（沙箱决定）。`/permissions` 命令的名字有点误导——它实际控制的是审批策略，不是沙箱权限。但这是官方命名，沿用。

**「预设」vs「策略」**：预设（preset）是 `/permissions` 面板里让你选的快速选项（Auto / Read Only 等），对应到 config.toml 里的 `approval_policy` 值；策略（policy）是更广义的概念，包括 `approval_policy`、`sandbox_mode`、`approvals_reviewer` 等所有配置项的集合。

---

## 2. /permissions 实时调整权限

### 2.1 基本用法

在 TUI 输入框里输入 `/permissions`，会弹出一个权限设置面板。面板里你可以选择审批预设。

目前面板提供两个快速预设：

- **Auto**：对应 `approval_policy = "on-request"`。Codex 在沙箱内的常规操作自动通过，需要突破沙箱边界时才弹审批。这是大多数情况下的默认选择。
- **Read Only**：对应 `approval_policy = "untrusted"`。只有已知安全的只读操作自动通过，写操作和命令执行都要你确认。

选完后，当前会话立刻切换到新的审批策略。后续 Codex 执行的操作遵循新策略。

注意：`/permissions` 面板里没有直接提供 `never`（全自动）选项。这是一个有意的设计——全自动模式风险较高，官方不鼓励通过简单的面板点击来开启。如果你确实需要 `never`，用 CLI 标志 `codex -a never` 或 config.toml 的 `approval_policy = "never"` 来配置。

### 2.2 Profile 绑定

`/permissions` 面板还支持选择命名的权限 profile。如果你在 `~/.codex/` 下创建了多个 profile 配置文件（比如 `safe.config.toml`、`dev.config.toml`），面板里会列出这些 profile，选中后会加载对应的配置。

Profile 文件的命名约定是 `<name>.config.toml`，放在 `~/.codex/` 目录下。比如：

```toml
# ~/.codex/safe.config.toml
approval_policy = "untrusted"
sandbox_mode = "read-only"
```

```toml
# ~/.codex/dev.config.toml
approval_policy = "on-request"
sandbox_mode = "workspace-write"
```

在 `/permissions` 面板里选中 `safe` profile，等价于启动时用了 `codex --profile safe`。区别在于 profile 切换发生在会话中间，不是会话开始时。

Profile 里能配置的不只是 `approval_policy`——它是一个完整的 config.toml 覆盖。你可以把模型选择、沙箱模式、MCP 配置、feature 开关都写进去。Profile 切换后，所有这些配置项都会立即更新。

### 2.3 配置持久化

通过 `/permissions` 面板做的修改默认只影响当前会话。关闭 Codex 后重新打开，会恢复到 config.toml 里的默认值。

如果你想让修改持久化，有两个办法：

1. 手动编辑 `~/.codex/config.toml`，把 `approval_policy` 改成你想要的值。
2. 在 `/permissions` 面板切换后，Codex 可能提示你是否保存到配置文件（取决于版本）。

大多数情况下，你不需要在 config.toml 里永久设成 `untrusted`——用 `on-request` 作为默认值，遇到不信任的项目时通过 CLI 标志临时指定 `untrusted` 更灵活。

### 2.4 实际交互示例

```
> codex "分析这个项目的目录结构"

（默认 on-request 模式，Codex 自动读取文件和目录）

你：/permissions

[权限面板]
  当前策略: on-request
  可选预设:
    > Auto (on-request)    ← 当前选中
      Read Only (untrusted)
  Profiles:
    safe
    dev

（用方向键选择 Read Only，回车确认）

[权限已更新]
  当前策略: untrusted

Codex: 我需要读取 src/config/database.ts
[审批提示] 读取文件 src/config/database.ts
> Y
```

你可以看到，切换到 `untrusted` 后，连读文件这种原本自动通过的操作也需要确认了（取决于 Codex 的 `is_safe_command()` 判断）。这就是两种模式在实际交互中的区别。

---

## 3. /approve 重试被拒绝的操作

### 3.1 触发场景

`/approve` 只在一个特定场景下有用：**自动审查器（auto_review）拒绝了某个操作，你手动批准重试**。

流程是这样的：

1. 你配置了 `approvals_reviewer = "auto_review"`。
2. Codex 执行某个操作时，自动审查器根据 `[auto_review].policy` 判断风险等级。
3. 审查器认为风险太高，拒绝了这个操作。
4. Codex 告诉你这个操作被拒绝了。
5. 你看了被拒绝的操作，觉得没问题，输入 `/approve`。
6. 被拒绝的操作重新执行。

如果你没有配置 `auto_review`（即 `approvals_reviewer = "user"`，默认值），`/approve` 不会用到——因为所有审批请求都直接到你自己面前，不存在"被自动拒绝后需要手动批准"的场景。

### 3.2 使用方法

直接在 TUI 输入框里输入 `/approve`，没有额外参数。它会重试最近一次被自动审查拒绝的操作。

如果你不确定最近一次被拒绝的操作是什么，可以查看 Codex 的输出日志——它通常会说明拒绝原因（比如"自动审查策略不允许此操作"或"操作被 auto_review 标记为高风险"）。

### 3.3 审查策略配置

自动审查器的行为由 `[auto_review].policy` 控制。这是一个自然语言策略描述，自动审查器用它来判断操作的风险等级。

```toml
approvals_reviewer = "auto_review"

[auto_review]
policy = """
允许运行测试命令和构建命令。
拒绝任何包含 rm -rf 或 drop database 的命令。
允许读写 src/ 目录下的文件。
拒绝修改 config/ 目录下的配置文件。
"""
```

自动审查器是一个轻量级的 AI 子代理，它会解析你的策略文本，对每个需要审批的操作做一个快速的"安全判断"。判断结果有几种可能：

- **允许**：操作自动执行。
- **拒绝**：操作被拦截，等你用 `/approve` 决定是否重试。
- **降级**：操作以受限方式执行（比如把写操作降级为读操作）。

审查策略支持自然语言描述，不需要学专门的语法。但写得越精确，审查器越不容易误判。

### 3.4 企业级策略下发

在 Enterprise 或 Business 套餐下，企业管理员可以通过 `guardian_policy_config` 从云端下发审批策略。这个策略优先级高于你本地的 `[auto_review].policy` 配置。

```toml
# 这个配置项通常由企业管理员通过后台设置，不由用户手动编辑
[guardian_policy_config]
policy = "公司安全策略：禁止访问生产数据库，禁止修改基础设施配置文件"
```

当云端策略和本地策略冲突时，云端策略优先。这意味着即使你的本地策略写着"允许所有操作"，云端策略仍然可以拦住高风险操作。

这种设计在大型团队里很重要——安全团队可以在不修改每个人 config.toml 的情况下，统一控制所有 Codex 实例的审批行为。

### 3.5 /approve 的注意事项

- `/approve` 只重试最近一次被拒绝的操作。如果连续多个操作被拒绝，你需要逐个 `/approve`。
- 如果自动审查器反复拒绝同类操作，你应该考虑调整 `[auto_review].policy` 的策略描述，让审查器对这个操作类型放行，而不是每次都手动批准。
- `/approve` 执行后，如果操作成功了，Codex 会继续原来的工作流。如果操作还是失败（比如文件确实不存在），Codex 会换一种方式完成任务。

---

## 4. 审批策略详解

第 05 篇已经覆盖了四种审批模式的基本行为。这一节补充 `/permissions` 命令的交互层怎么和这些模式衔接，以及 `auto_review` 和 `granular` 的高级配置。

### 4.1 四种审批模式回顾

快速回顾一下四种模式的核心区别：

| 模式 | config.toml 值 | 自动通过 | 需要审批 | 被拒绝 |
|------|---------------|---------|---------|-------|
| 最保守 | `"untrusted"` | 已知安全的只读操作 | 其他所有操作 | — |
| 默认 | `"on-request"` | 沙箱内常规操作 | 超出沙箱边界的操作 | — |
| 最宽松 | `"never"` | 所有操作 | — | — |
| 细粒度 | `{ granular = {...} }` | 取决于五个子开关 | 取决于五个子开关 | 取决于五个子开关 |

`/permissions` 面板里的 Auto 对应 `on-request`，Read Only 对应 `untrusted`。`never` 和 `granular` 需要通过 config.toml 或 CLI 标志配置。

### 4.2 granular 细粒度控制

`granular` 模式把审批分成五个独立通道，每个通道有自己的开关：

```toml
approval_policy = { granular = {
  sandbox_approval = true,
  rules = true,
  mcp_elicitations = true,
  request_permissions = false,
  skill_approval = false
} }
```

五个通道的含义（第 05 篇有详细拆解，这里只做简要回顾）：

- **sandbox_approval**：Codex 想突破沙箱限制时，是否弹审批。`true` = 弹审批让你决定，`false` = 直接拒绝。
- **rules**：Codex 内部的 execpolicy 前缀规则匹配到 `prompt` 级别的命令时，是否弹审批。`true` = 弹，`false` = 拒绝。
- **mcp_elicitations**：MCP 服务器发起的交互请求（OAuth 确认等），是否弹审批。
- **request_permissions**：Codex 通过 `request_permissions` 工具主动请求额外权限时，是否弹审批。
- **skill_approval**：Skill 脚本执行前，是否弹审批。

一个常见的误解：很多人以为 `false` 是"自动通过"。不是的——`false` 是"自动拒绝"。在 `granular` 模式下，每个通道只有两个状态：弹审批让你手动决定（`true`），或者直接拒绝（`false`）。没有"自动通过"这个选项。

这意味着如果你把所有五个通道都设成 `false`，Codex 几乎什么都做不了——所有需要审批的操作都被拒绝。这在 CI/CD 环境里可能是你想要的（只让 Codex 做安全的只读操作），但在日常开发中不要这么配。

### 4.3 auto_review 自动审查

`auto_review` 是一种替代人工审批的机制。启用后，审批请求不直接到你面前，而是先经过一个 AI 审查器。

```toml
approvals_reviewer = "auto_review"

[auto_review]
policy = """
允许测试和构建命令。
允许读写 src/ 和 tests/ 目录。
拒绝任何删除操作。
拒绝访问 ~/.ssh/ 目录。
"""
```

自动审查器的工作方式：

1. Codex 需要执行某个操作。
2. 操作被路由到 `auto_review` 审查器。
3. 审查器读取 `[auto_review].policy`，分析操作的风险。
4. 审查器做出判断：允许、拒绝或标记为需要人工确认。
5. 允许的操作直接执行，拒绝的操作等你 `/approve`，需要人工确认的操作弹到你面前。

这相当于在"完全自动"和"每步都问人"之间加了一个缓冲层。对于重复性的、模式明确的项目，`auto_review` 可以大幅减少审批弹窗的数量。

但要注意：自动审查器本身也是一个 AI 模型，它有自己的判断偏差。写得模糊的策略容易导致误判——要么放过危险操作，要么拦截安全操作。策略写法建议用具体的命令模式或路径，而不是笼统的描述。

好的策略写法：

```
允许运行 pytest 和 cargo test 命令。
允许读写 src/ 和 tests/ 目录下的 .py 和 .rs 文件。
拒绝任何包含 DROP TABLE 或 DELETE FROM 的 SQL 命令。
拒绝访问 /etc/ 目录。
```

不好的策略写法：

```
允许安全的操作。
拒绝危险的操作。
```

后者太模糊了，审查器几乎无法做出准确判断。

---

## 5. /mcp 管理 MCP 工具

### 5.1 基本用法

`/mcp` 命令列出当前已配置的 MCP（Model Context Protocol）工具和服务器。

在 TUI 输入框里输入 `/mcp`，会显示已连接的 MCP 服务器列表、每个服务器提供的工具列表、以及工具的基本信息。

### 5.2 verbose 模式

`/mcp verbose` 显示更详细的诊断信息，包括：

- 每个服务器的连接状态（已连接 / 未连接 / 错误）
- 服务器的启动命令和参数
- 工具的输入输出 schema
- 传输类型（stdio / SSE）
- 连接失败时的错误信息

```
> /mcp verbose

MCP Servers:
  [1] github-mcp
    Status: connected
    Transport: stdio
    Command: npx -y @modelcontextprotocol/server-github
    Tools (12):
      - create_issue: 创建 GitHub issue
      - list_issues: 列出仓库的 issues
      - create_pull_request: 创建 PR
      - ...
    Resources: 0

  [2] postgres-mcp
    Status: error
    Transport: stdio
    Command: npx -y @modelcontextprotocol/server-postgres
    Error: connection timeout
    Tools: unavailable
```

这个信息在调试 MCP 连接问题时非常有用。如果你配置了一个 MCP 服务器但 Codex 调不到它的工具，用 `/mcp verbose` 检查连接状态和错误信息。

### 5.3 非 verbose 参数

直接输入 `/mcp`（不加 `verbose`）会显示简洁的工具列表和命令用法说明。

### 5.4 MCP 安全考量

MCP 工具是 Codex 权限体系里一个需要特别关注的点。MCP 服务器可以给 Codex 提供额外的能力——比如访问数据库、调用 API、操作 GitHub 等。这些能力不在 Codex 沙箱的默认控制范围内。

几个安全建议：

- **只配置你信任的 MCP 服务器**。不要从不明来源安装 MCP 服务器包。
- **审查 MCP 工具的权限**。用 `/mcp verbose` 查看每个工具能做什么，确认没有超出预期的能力。
- **用 `mcp_elicitations` 控制 MCP 交互**。在 `granular` 模式下，`mcp_elicitations = true` 会让 MCP 服务器的交互请求弹审批。
- **在 AGENTS.md 里写明 MCP 工具使用规范**。比如"不要用 github-mcp 创建 PR，只用来读取 issue 列表"。

MCP 服务器的配置在 config.toml 里：

```toml
[[mcp_servers]]
name = "github-mcp"
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env = { GITHUB_TOKEN = "${GITHUB_TOKEN}" }
```

如果你发现某个 MCP 服务器不需要了，从 config.toml 里删掉对应的 `[[mcp_servers]]` 段落，重启 Codex 生效。`/mcp` 命令本身不提供删除或禁用 MCP 服务器的功能。

---

## 6. /sandbox-add-read-dir 授予沙箱读取权限（仅 Windows）

### 6.1 适用平台

这个命令只在 Windows 原生运行时下可用。macOS 和 Linux 不需要它——因为这两个平台的沙箱实现（Seatbelt 和 Bubblewrap）允许你通过 `sandbox_workspace_write.writable_roots` 或 `readable_roots` 配置项来添加额外的目录访问权限。

Windows 的沙箱实现基于受限令牌（restricted tokens）和文件系统 ACL。添加额外的可读目录需要在运行时修改 ACL，`/sandbox-add-read-dir` 就是做这件事的。

### 6.2 使用方法

```
> /sandbox-add-read-dir C:\Users\me\Documents\project-config
```

执行后，Codex 的沙箱会获得对指定目录的读取权限。Codex 可以读取该目录下的文件，但不能写入。

### 6.3 使用场景

什么时候需要这个命令？典型情况：

- 你的项目配置文件放在工作目录外的一个共享目录里（比如 `C:\Company\SharedConfig\`）。
- Codex 需要读取这些配置文件来理解项目的部署环境。
- 但默认的 `workspace-write` 沙箱不允许访问工作目录外的文件。

在这些情况下，用 `/sandbox-add-read-dir` 授予 Codex 对配置目录的读取权限。

### 6.4 安全注意事项

- 只授予读取权限。`/sandbox-add-read-dir` 不会授予写入权限。
- 不要把敏感目录（比如 `C:\Windows\System32`、`C:\Users\me\.ssh`）加入读取列表。
- 添加的目录权限在当前会话结束后失效。如果需要持久化，考虑在 config.toml 里配置 `readable_roots`（如果 Windows 版本支持）。

### 6.5 macOS/Linux 替代方案

如果你在 macOS 或 Linux 上遇到类似需求，用 config.toml 配置：

```toml
[sandbox_workspace_write]
writable_roots = ["/extra/path/for/writing"]
# readable_roots 在某些版本中也可用
```

或者临时切换到 `danger-full-access` 模式（不推荐，除非在隔离环境中）。

---

## 7. /experimental 切换实验性功能

### 7.1 基本用法

`/experimental` 命令让你在 TUI 里开关实验性功能。执行后会显示一个功能列表，你可以逐个开启或关闭。

### 7.2 典型的实验性功能

实验性功能会随着版本更新变化，以下是一些常见的功能项：

- **Apps**：Codex 的连接器生态，允许 Codex 与外部服务（Figma、Vercel、Notion 等）交互。
- **Smart Approvals**：增强版自动审批，基于操作上下文和项目历史做出更智能的审批判断。
- **Computer Use**：让 Codex 操控桌面应用（点击按钮、输入文字），用于 GUI 测试。
- **其他**：根据版本不同，可能还有新的模型能力、UI 功能等。

实验性功能的特点：

- **可能不稳定**。这些功能还在开发中，可能有 bug 或意外行为。
- **可能随时变更**。API 和行为可能在后续版本中改变，不保证向后兼容。
- **需要重启**。部分功能开启后会提示你需要重启 Codex 才能生效。

### 7.3 配置持久化

`/experimental` 修改的设置会写入 config.toml，持久生效。具体来说，实验性功能通常对应 config.toml 里的 `[features]` 段落：

```toml
[features]
apps = true
smart_approvals = true
computer_use = false
```

你也可以直接编辑 config.toml 来管理这些开关，效果和用 `/experimental` 一样。

### 7.4 使用建议

- 只在测试环境或非关键项目中开启实验性功能。不要在生产环境的工作流中依赖它们。
- 开启后观察 Codex 的行为变化。如果出现异常，及时关闭。
- 关注 Codex 的 release notes，了解实验性功能的变更和稳定化进度。
- Smart Approvals 和第 4.3 节讲过的 `auto_review` 有功能重叠。Smart Approvals 是更新的实现，未来可能会替代 `auto_review`。如果你已经配置了 `auto_review`，开启 Smart Approvals 后注意两者的交互——可能需要调整或移除旧的 `auto_review` 配置。

---

## 8. 权限管理实战

### 8.1 场景一：从严格到宽松渐进调整

你刚 clone 了一个陌生项目，想用 Codex 分析代码但又不完全信任。

第一步：用最保守的方式启动。

```bash
codex --ask-for-approval untrusted "帮我理解这个项目的架构"
```

观察 Codex 的操作。它每读一个文件都会弹审批提示。你逐个确认，同时观察它在读什么——有没有读不该读的文件（比如 `.env`、密钥文件）。

第二步：观察几轮后，信任 Codex 的读操作行为。在会话中切换到 `on-request`。

```
> /permissions
（选择 Auto）
```

第三步：现在 Codex 可以自动读取文件了。你让它做更深入的分析——修改配置、跑测试。

```
你：帮我配置开发环境并跑一下测试
```

Codex 可能会请求安装依赖（需要网络），这时候会弹审批。你确认后继续。

第四步：任务完成后，`git diff` 检查所有变更。

这个渐进式的过程让你在不冒大风险的情况下建立对 Codex 的信任。每一步的权限调整都是在你观察到前一步行为合理后才做的。

### 8.2 场景二：企业环境下的权限控制

你是团队的技术负责人，需要给团队配置 Codex 的安全基线。

config.toml 模板（分发给团队成员）：

```toml
# 团队安全基线配置

# 默认审批策略：沙箱内自动，沙箱外要审批
approval_policy = "on-request"

# 使用自动审查器减少审批弹窗
approvals_reviewer = "auto_review"

[auto_review]
policy = """
允许运行 npm test、cargo test、pytest 命令。
允许读写 src/ 和 tests/ 目录。
拒绝任何包含 DROP TABLE、DELETE FROM 的 SQL。
拒绝访问 /etc/、~/.ssh/ 目录。
拒绝 sudo 命令。
"""

# 沙箱限制
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = false

# 环境变量策略
[shell_environment_policy]
inherit = "all"
ignore_default_excludes = false
exclude = ["AWS_SECRET*", "GITHUB_TOKEN", "DB_PASSWORD*"]
```

团队成员拿到的权限：

- 日常开发（读写 src/、跑测试）：自动通过，不需要审批。
- 安装依赖、访问网络：被拒绝（因为 `network_access = false`）。需要手动开启。
- 危险操作（DROP TABLE、sudo）：被自动审查器拒绝。
- 敏感环境变量：自动过滤，不会传给 Codex。

如果某个成员需要更宽松的权限（比如需要网络安装包），可以创建一个 dev profile：

```toml
# ~/.codex/dev.config.toml（个人配置，覆盖团队模板）
[sandbox_workspace_write]
network_access = true

[auto_review]
policy = """
允许运行 npm test、cargo test、pytest 命令。
允许 npm install 和 pip install。
允许读写 src/ 和 tests/ 目录。
拒绝任何包含 DROP TABLE、DELETE FROM 的 SQL。
拒绝访问 /etc/、~/.ssh/ 目录。
拒绝 sudo 命令。
"""
```

启动时用：

```bash
codex --profile dev
```

### 8.3 场景三：CI/CD 中的权限配置

在 GitHub Actions 或其他 CI 环境中使用 `codex exec` 非交互模式时，权限配置需要完全自动化——没有人盯着屏幕来审批。

```yaml
# .github/workflows/codex-review.yml
name: Codex Auto Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g @openai/codex
      - run: |
          codex exec --sandbox workspace-write \
            "审查这个 PR 的代码变更，检查是否有安全问题、性能问题或代码风格问题"
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

对应的 config.toml（项目根目录）：

```toml
# CI 环境：全自动执行，沙箱保护
approval_policy = "never"
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = false

# CI 环境不需要安装包
# 所有需要的工具应该在 CI runner 的环境里预装好

# 严格的环境变量过滤
[shell_environment_policy]
inherit = "core"
set = { PATH = "/usr/bin:/usr/local/bin:/home/runner/.npm-global/bin" }
```

关键设计决策：

- `approval_policy = "never"`：CI 环境没有交互界面，审批请求只会卡住流程。
- `network_access = false`：CI 任务不应该访问网络（除非有特殊需求）。
- `inherit = "core"`：只继承核心环境变量，不泄露 CI secrets。
- 沙箱仍然生效：即使审批关了，文件系统限制还在。Codex 只能写工作目录。

如果 CI 任务需要联网（比如安装依赖），用 `codex exec --sandbox network-read` 或在 config.toml 里单独为 CI 环境开启网络。

### 8.4 场景四：配合 MCP 工具的权限管理

你配置了 GitHub MCP 服务器和 PostgreSQL MCP 服务器，想让 Codex 能读 GitHub issues 和查询数据库，但要限制它的写入能力。

config.toml：

```toml
approval_policy = { granular = {
  sandbox_approval = true,     # 沙箱升级要审批
  rules = true,                 # execpolicy 匹配要审批
  mcp_elicitations = true,      # MCP 交互要审批
  request_permissions = false,  # 不允许 Codex 主动请求权限
  skill_approval = true         # Skill 执行要审批
} }
sandbox_mode = "workspace-write"

[[mcp_servers]]
name = "github-mcp"
command = "npx"
args = ["-y", "@modelcontextprotocol/server-github"]
env = { GITHUB_TOKEN = "${GITHUB_TOKEN}" }

[[mcp_servers]]
name = "postgres-mcp"
command = "npx"
args = ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/mydb"]
```

AGENTS.md 里补充规则：

```markdown
## MCP 工具使用规范

### GitHub MCP
- 只允许读取操作：list_issues、get_issue、list_pull_requests、get_pull_request
- 禁止写入操作：create_issue、create_pull_request、merge_pull_request
- 如果需要创建 issue 或 PR，请告诉我，我来手动操作

### PostgreSQL MCP
- 只允许 SELECT 查询
- 禁止 INSERT、UPDATE、DELETE、DROP、ALTER 操作
- 查询前请说明查询目的
```

在会话中用 `/mcp verbose` 确认两个服务器都正常连接。如果 Codex 尝试调用 `create_pull_request`，`mcp_elicitations = true` 会弹审批让你拦截。

---

## 9. 常见问题

### /permissions 切换后之前的操作怎么办

切换审批策略只影响后续操作。之前已经执行的操作不受影响。如果你担心切换前 Codex 已经做了不该做的事，用 `git diff` 检查。

### 为什么 /permissions 面板没有 never 选项

这是安全设计的考量。全自动模式风险较高，不鼓励通过简单的 UI 点击开启。如果你确实需要，用 CLI 标志 `codex -a never` 或 config.toml 配置。

### /approve 一直不起作用

检查以下几点：

1. 你是否配置了 `approvals_reviewer = "auto_review"`？如果没配置（默认是 `"user"`），审批请求直接到你面前，不存在"被自动拒绝"的场景。
2. 是否有操作确实被拒绝了？查看 Codex 的输出日志确认。
3. 如果审查器反复拒绝同类操作，调整 `[auto_review].policy` 策略，让审查器放行这类操作。

### /mcp 显示服务器连接错误

常见原因：

- MCP 服务器的 npm 包没有安装或版本不兼容。
- 服务器启动命令有误（检查 config.toml 中的 `command` 和 `args`）。
- 环境变量缺失（MCP 服务器需要的 API token 没配置）。
- 权限不足（比如 GitHub MCP 需要有效的 GITHUB_TOKEN）。

用 `/mcp verbose` 查看具体的错误信息，针对性地解决。

### /experimental 开启后 Codex 行为异常

实验性功能本身就不稳定。出现异常时：

1. 用 `/experimental` 关掉刚开启的功能。
2. 重启 Codex。
3. 如果问题持续，检查 config.toml 里的 `[features]` 段落，手动把有问题的功能设成 `false`。
4. 如果功能 A 和功能 B 同时开启才出问题，可能是功能间有冲突，逐个排查。

### Windows 上 /sandbox-add-read-dir 报错

确认你在用 Windows 原生运行时（不是 WSL）。在 WSL 里，沙箱行为和 Linux 一样，用 config.toml 的 `writable_roots` / `readable_roots` 配置替代。

如果路径有中文或空格，试试用引号包裹路径。Windows 的路径分隔符注意用 `\` 或 `/`。

---

## 10. 下一步

本篇覆盖了 Codex CLI 权限与安全类的五个斜杠命令：`/permissions`、`/approve`、`/mcp`、`/sandbox-add-read-dir`、`/experimental`。这些命令是 Codex 安全体系的交互层，让你在不退出会话的情况下实时调整权限、重试被拒绝的操作、检查 MCP 工具、管理实验性功能。

配合第 05 篇的审批策略配置和第 09 篇的命令执行机制，你应该已经能完整地控制 Codex 在你机器上的行为——从它读什么文件、改什么代码、跑什么命令，到它能不能连外部服务、能不能用 MCP 工具。

**下一篇（第 19 篇）**将讨论信息查看类命令：`/status`、`/diff`、`/compact`、`/copy`、`/raw`、`/debug-config`——这些命令帮你查看会话状态、代码差异、压缩上下文、复制输出、查看原始协议数据和调试配置。

### 延伸阅读

- [Codex 官方文档 - Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security) — 审批与安全机制的官方说明
- [Codex 官方文档 - Configuration Reference](https://developers.openai.com/codex/config-reference) — config.toml 所有配置项的完整参考
- [Codex 官方文档 - Slash Commands](https://developers.openai.com/codex/cli/slash-commands) — TUI 内置斜杠命令完整列表
- [Codex 官方文档 - MCP Server Configuration](https://developers.openai.com/codex/mcp) — MCP 服务器配置与安全
- [Codex 开源仓库 - AskForApproval 枚举](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs) — 审批策略的源码定义
- 本系列第 05 篇 [三种审批模式详解](./05-approval-modes.md) — 审批策略的基础概念
- 本系列第 09 篇 [让 Codex 跑命令](./09-run-commands.md) — 命令执行与沙箱机制

---

*本文基于 Codex CLI 源码和 2026 年 6 月的官方文档撰写。Codex 版本更新频繁，部分命令行为和配置项可能在未来版本中变更。*
