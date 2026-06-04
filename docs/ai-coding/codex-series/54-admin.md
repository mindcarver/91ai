# Codex 管理员配置指南：团队部署与策略管控

> TL;DR：Codex 的配置采用多层叠加模型（System → Enterprise → User → Project → Session），管理员通过 `requirements.toml` 和系统级配置文件实施治理策略——限制可用的沙箱模式、审批策略、模型选择，管控生命周期 hooks，强制执行合规要求。本文覆盖配置层级、`requirements.toml` 策略、managed hooks、feature 门控、审计与合规，以及团队部署的最佳实践。

---

## 1. 为什么团队需要管理员配置

一个人用 Codex 的时候，配置文件在 `~/.codex/config.toml`，怎么配都行。但当一个团队、一个部门甚至整个公司都在用 Codex 的时候，"随便配"就变成了管理灾难。

几个真实的问题：

- **安全策略不统一**：张三用了 `danger-full-access` sandbox，李四用了 `read-only`。张三的 Codex 可以执行任意 shell 命令，包括删除数据库
- **模型选择失控**：有人用 `gpt-5.4` 做日常改动，token 消耗是 `gpt-5.2` 的数倍。月底 OpenAI 账单暴增
- **合规要求**：金融行业的公司要求所有 AI 辅助编码必须有审计日志，不能绕过安全沙箱
- **hook 滥用**：有人装了自定义 hook 把代码自动发到外部服务器，违反数据安全策略

管理员配置解决的就是这些问题。它提供了一个自上而下的策略框架——公司或团队层面定义规则，个人层面在规则允许的范围内灵活配置。

Codex 的配置层级设计借鉴了操作系统的权限模型：root（系统管理员）可以覆盖用户设置，但用户可以在允许的范围内自定义。这种设计在保证统一管控的同时，保留了开发者的灵活性。

## 2. 配置层级模型

Codex 的配置采用**分层叠加**模型。层级从下到上优先级递增，上层的设置覆盖下层的同名设置。

```
┌─────────────────────────────┐
│     Session Flags (CLI)     │  ← 最高优先级：命令行参数
├─────────────────────────────┤
│      Project Config         │  ← 项目级：.codex/config.toml
├─────────────────────────────┤
│   User Profile + Config     │  ← 用户级：~/.codex/profiles/ 和 config.toml
├─────────────────────────────┤
│  Enterprise Managed Config  │  ← 企业级：云管理配置
├─────────────────────────────┤
│  Legacy Managed Config      │  ← 遗留管理配置：MDM 或文件
├─────────────────────────────┤
│      System Config          │  ← 最低优先级：系统级配置文件
└─────────────────────────────┘
```

### 各层级的定位

**System Config（系统级）**：由系统管理员在部署 Codex 时配置。通常放在系统级目录中，所有用户共享。适合设置公司范围内的基线策略——比如默认 sandbox 模式、默认模型。

**Enterprise Managed Config（企业级）**：通过 Codex Cloud 的管理后台下发的配置。适合有 Codex 企业订阅的组织，可以在线上管理策略，推送到所有客户端。

**Legacy Managed Config（遗留管理配置）**：通过 MDM（移动设备管理）系统或本地文件推送的配置。适用于无法使用云管理但需要集中管控的场景。

**User Config（用户级）**：存放在 `~/.codex/config.toml`。用户可以自由配置，但受上层约束。

**Project Config（项目级）**：存放在项目目录的 `.codex/config.toml` 中。随代码仓库版本控制，团队成员共享项目特定的配置。

**Session Flags（会话级）**：CLI 命令行参数和运行时标志。临时覆盖所有其他层级。

### 决策规则

当一个配置项在多个层级都有定义时，优先级高的层级覆盖优先级低的。但有一个例外：**管理员配置（requirements）可以锁定某些配置项，使其不可被下层覆盖**。

这就是 `requirements.toml` 的作用——它定义的不是"建议"，而是"约束"。

## 3. requirements.toml 策略文件

`requirements.toml` 是管理员管控的核心文件。它可以限制用户能做什么、不能做什么。`requirements.toml` 不是"配置文件"——它是"策略文件"。配置文件告诉你用什么，策略文件告诉你只能用什么。

### 策略项一览

| 策略项 | 类型 | 作用 |
|--------|------|------|
| `allowedApprovalPolicies` | 列表 | 允许使用的审批策略白名单 |
| `allowedSandboxModes` | 列表 | 允许使用的沙箱模式白名单 |
| `allowedPermissions` | 列表 | 允许的权限配置白名单 |
| `allowedWebSearchModes` | 列表 | 允许的 web search 模式白名单 |
| `allowManagedHooksOnly` | 布尔值 | 是否只允许 managed hooks |
| `computerUse` | 配置 | Computer Use 策略 |
| `featureRequirements` | 映射 | 强制指定的 feature 值 |
| `hooks` | 列表 | 管理员管理的 lifecycle hooks |
| `enforceResidency` | 布尔值 | 是否强制数据驻留 |
| `network` | 配置 | 网络访问约束 |
| 网络策略 | requirements / managed policy | 通过组织托管策略控制命令网络访问和 web search 模式 |

### 示例：限制沙箱和审批策略

```toml
# requirements.toml — 只允许安全的沙箱和审批策略
allowed_sandbox_modes = ["workspace-write", "read-only"]
allowed_approval_policies = ["on-request"]
```

设置了这些策略后，用户尝试使用 `danger-full-access` sandbox 或 `approval_policy = "never"` 时，Codex 会回落到兼容值或拒绝执行，具体行为取决于当前托管策略。

### 示例：强制数据驻留

对于有合规要求的组织：

```toml
# requirements.toml — 合规策略
enforce_residency = true
web_search = "disabled"
```

`enforce_residency` 确保数据不离开指定区域。`web_search = "disabled"` 禁止 Codex 使用 web search。命令网络访问应结合沙箱网络配置和组织托管策略单独约束。

### 策略读取方式

Codex 启动时自动读取 `requirements.toml`（和/或 MDM 配置）。可以通过 app-server 的 `configRequirements/read` 方法查询当前生效的策略：

```json
{
  "method": "configRequirements/read",
  "id": 1
}
```

返回的响应包含所有已加载的策略约束，或者 `null`（如果没有配置策略）。

## 4. Managed Hooks 管控

### 为什么管控 hooks

Lifecycle hooks 是 Codex 的扩展点——你可以在特定事件（会话开始、工具调用前后、compaction 等）触发自定义脚本。这很灵活，但也带来了安全风险：

- 用户可以通过 hook 把代码发送到外部服务器
- 恶意 hook 可以在文件编辑时注入后门代码
- hook 脚本的执行绕过了 Codex 的沙箱限制

### allow_managed_hooks_only

设置 `allow_managed_hooks_only = true` 后，用户、项目、会话级别的 hook 配置全部被忽略，只有来自 `requirements.toml` 和 managed config 层的 hook 生效。

```toml
# requirements.toml
allow_managed_hooks_only = true
```

这个设置只能在 `requirements.toml` 中使用。把它写在 `config.toml` 中不会生效。

### 禁用非 managed hook

管理员还可以通过 app-server 的 `config/batchWrite` 方法逐个禁用非 managed hook：

```json
{
  "method": "config/batchWrite",
  "id": 29,
  "params": {
    "edits": [{
      "keyPath": "hooks.state",
      "value": {
        "/Users/me/.codex/config.toml:pre_tool_use:0:0": {
          "enabled": false
        }
      },
      "mergeStrategy": "upsert"
    }],
    "reloadUserConfig": true
  }
}
```

### Hook 配置结构

```toml
# requirements.toml — managed hooks
[[SessionStart]]
[[SessionStart.hooks]]
type = "command"
command = "python3 /opt/codex-hooks/session_init.py"
timeout = 10
status_message = "initializing session"

[[PreToolUse]]
matcher = "^Bash$"
[[PreToolUse.hooks]]
type = "command"
command = "/opt/codex-hooks/pre_bash_check.sh"
timeout = 5

[[PostCompact]]
[[PostCompact.hooks]]
type = "command"
command = "/opt/codex-hooks/post_compact_audit.sh"
timeout = 5
```

### Hook 事件类型

| 事件 | 触发时机 | 典型用途 |
|------|---------|---------|
| `SessionStart` | 会话开始 | 初始化审计日志、检查环境 |
| `PreToolUse` | 工具调用前 | 拦截危险操作、审计日志 |
| `PostToolUse` | 工具调用后 | 记录执行结果 |
| `PostCompact` | 对话压缩后 | 清理、归档 |
| `PreTurn` | Turn 开始前 | 注入策略约束 |

`matcher` 字段支持正则表达式，可以精确匹配要拦截的工具类型。比如 `matcher = "^Bash$"` 只拦截 Bash 命令执行。

## 5. Feature 门控

`featureRequirements` 允许管理员锁定特定 feature 的值。用户无法通过配置或 CLI 参数改变这些值。

```toml
# requirements.toml — 锁定 feature 值
[featureRequirements]
goals = true
web_search = false
computer_use = false
```

设置了这些后，即使用户在 `config.toml` 中写 `web_search = true`，也会被覆盖为 `false`。

### 常用 Feature 控制

| Feature | 建议管控 | 理由 |
|---------|---------|------|
| `web_search` | 按需求限制 | 防止 Codex 访问外部网站，减少数据泄露风险 |
| `computer_use` | 严格限制 | Computer Use 给 Codex 浏览器和系统访问权限，风险较高 |
| `goals` | 通常开放 | 有助于 Codex 自主完成任务 |
| `mcp_server` | 按需求限制 | MCP server 可能连接到外部服务 |
| `apps` | 按需求限制 | 内置应用可能有网络访问需求 |

## 6. 审计与合规

### 审计日志

Codex 的操作日志可以被合规平台采集。app-server 的 `initialize` 请求中包含 `clientInfo.name`，这个字段用于在 OpenAI Compliance Logs Platform 中标识客户端来源。

如果你的组织开发了自己的 Codex 集成工具（比如内部 IDE 插件），需要在 `clientInfo.name` 中使用唯一的标识符，并联系 OpenAI 将其添加到已知客户端列表。

```json
{
  "method": "initialize",
  "id": 0,
  "params": {
    "clientInfo": {
      "name": "my_company_internal_ide",
      "title": "My Company Internal IDE Plugin",
      "version": "1.2.0"
    }
  }
}
```

### 数据驻留

`enforce_residency = true` 确保数据在指定区域内处理。对于有 GDPR、数据主权要求的组织，这是一个必要的配置项。

### 配置变更追踪

管理员可以通过 app-server 的配置 API 追踪配置变更：

```json
{
  "method": "config/read",
  "id": 1
}
```

配合 hook 系统，可以在配置变更时触发审计通知：

```toml
[[PostConfigChange]]
[[PostConfigChange.hooks]]
type = "command"
command = "/opt/codex-hooks/audit_config_change.sh"
timeout = 5
```

## 7. 团队部署最佳实践

### 阶段一：基线配置

从最关键的约束开始，不要一次性上太多策略：

```toml
# requirements.toml — 最小可行管控
# 1. 禁止最危险的 sandbox
allowed_sandbox_modes = ["workspace-write", "read-only"]

# 2. 限制审批策略
allowed_approval_policies = ["on-request"]

# 3. 禁止 web 搜索（数据安全）
allowed_web_search_modes = ["off"]
```

这三个策略覆盖了最大的安全风险：代码写入不受控、自动审批无人工把关、外部数据访问。

### 阶段二：审计与 hooks

在团队适应基线策略后，加入审计能力：

```toml
# 追加到 requirements.toml
allow_managed_hooks_only = true

[[SessionStart]]
[[SessionStart.hooks]]
type = "command"
command = "/opt/codex-hooks/audit_session_start.sh"
timeout = 10

[[PreToolUse]]
matcher = "^Bash$"
[[PreToolUse.hooks]]
type = "command"
command = "/opt/codex-hooks/audit_bash_command.sh"
timeout = 5
```

`audit_session_start.sh` 记录谁在什么时候启动了 Codex 会话。`audit_bash_command.sh` 记录每次 Codex 执行的 shell 命令。

### 阶段三：精细管控

根据团队需求逐步收紧：

```toml
# 追加到 requirements.toml
# 限制可用模型（成本控制）
# 通过 provider 配置实现，具体格式取决于企业订阅

# 禁止用户和项目自定义 hooks，只允许管理员托管 hooks
allow_managed_hooks_only = true
```

### 配置分发方式

| 方式 | 适用场景 | 优势 | 劣势 |
|------|---------|------|------|
| Codex Cloud 企业管理 | 有企业订阅 | 在线配置，实时生效 | 需要 Codex 企业版 |
| MDM 推送 | 企业设备管理 | 集中管控，无需每个用户配置 | 需要已有的 MDM 基础设施 |
| 文件分发 | 自托管环境 | 实施简单 | 需要自己管理分发 |
| Docker 镜像 | 容器化部署 | 环境一致性高 | 需要容器化基础设施 |

对于容器化部署，把 `requirements.toml` 打包进 Docker 镜像：

```dockerfile
FROM node:20
RUN npm install -g @openai/codex
COPY requirements.toml /etc/codex/requirements.toml
# Codex 会读取系统级配置目录中的 requirements.toml
```

### 用户沟通策略

推行管理员配置时，常见的问题是用户不理解为什么某些功能被禁用了。建议在 `requirements.toml` 同目录放一个 `POLICY.md` 文件，说明每条策略的理由和申诉流程。

## 8. 管理员配置 vs 用户配置

| 维度 | 管理员配置（requirements.toml） | 用户配置（config.toml） |
|------|-------------------------------|------------------------|
| 定位 | 约束和策略 | 个人偏好 |
| 优先级 | 可锁定，不可被覆盖 | 可被上层覆盖 |
| 位置 | 系统级或企业推送 | `~/.codex/config.toml` |
| 典型内容 | 允许的 sandbox、审批策略、hooks | 模型选择、推理强度、UI 偏好 |
| 可选性 | 强制执行 | 自愿配置 |
| 变更频率 | 低（季度或月度审查） | 高（按需调整） |

一个实用的原则：管理员配置管"不能做什么"，用户配置管"喜欢怎么做"。

## 9. 常见问题

**`requirements.toml` 放在哪里？**

放在系统级 Codex 配置目录中。具体路径取决于部署方式：Docker 镜像中通常在 `/etc/codex/`，原生安装在系统配置目录中。Codex 启动时会自动搜索并加载。

**`allow_managed_hooks_only` 设了之后用户的 AGENTS.md 还有用吗？**

`AGENTS.md` 是项目级的指令文件，不是 hook 配置。`allow_managed_hooks_only` 只影响 hooks，不影响 `AGENTS.md` 中的指令。用户的自定义指令（developer instructions）仍然生效。

**可以给不同团队配置不同的策略吗？**

可以。通过 Codex Cloud 的企业管理后台，可以按团队、部门设置不同的策略集。本地部署的话，可以在不同的目录放置不同的 `requirements.toml`，通过环境变量或启动参数指向对应的配置。

**配置冲突怎么排查？**

用 `codex doctor` 命令诊断配置问题。它会检查所有配置层的加载情况、认证状态和运行时健康度。

```bash
codex doctor
```

也可以通过 app-server API 读取当前生效的完整配置：

```json
{"method": "config/read", "id": 1}
```

## 10. 下一步

- 从阶段一的三个核心策略开始，在你的团队中部署基线管控
- 编写审计 hook 脚本，记录 Codex 的关键操作
- 用 `codex doctor` 检查你当前环境的配置状态
- 阅读本系列下一篇：《Codex 企业认证与 SSO：身份集成与安全管理》

---

**延伸阅读**

- [Codex 配置参考](https://developers.openai.com/codex/config-reference) — 全部配置项的完整文档
- [Codex 高级配置](https://developers.openai.com/codex/config-advanced) — 管理员配置和策略管控的详细说明
- [codex-config loader 源码](https://github.com/openai/codex/blob/main/codex-rs/config/src/loader/README.md) — 配置加载器的层级模型实现
- [app-server 配置 API](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) — `configRequirements/read`、`config/batchWrite` 等管理 API
