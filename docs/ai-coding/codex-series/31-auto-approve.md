<!--
调研来源（不发布，仅记录）：
1. Codex 官方文档: Agent approvals & security — approvals_reviewer、auto_review 配置
2. Codex 官方文档: Configuration Reference — review_model、guardian_policy_config
3. Codex 开源仓库 openai/codex: codex-rs/protocol/src/protocol.rs — ApproverKind 枚举
4. 本系列第 18 篇: /permissions、/approve 命令 — 交互层用法
5. 本系列第 30 篇: 审批策略详解 — approval_policy 四种模式
6. 本系列第 26 篇: Shell 与沙箱配置 — sandbox_mode 和环境变量策略
版本基准: 2026 年 6 月
-->

# Codex CLI 自动审核与权限持久化：让 AI 帮你把关

> TL;DR：`approvals_reviewer = "auto_review"` 是 Codex 内置的 AI 审查子代理，替你过滤审批请求——低风险的自动放行，高风险的拒绝后等你 `/approve` 手动决策。审查行为由 `[auto_review].policy` 自然语言策略描述控制，支持 `review_model` 指定独立模型做审查。权限持久化方面，`/permissions` 面板的修改默认只影响当前会话，但 Codex 提供了 `permissions.toml` 机制和 `default_permissions` 配置实现跨会话的权限记忆。企业环境还有 `guardian_policy_config` 云端策略兜底。本文从审查器的工作原理讲起，覆盖策略写法、模型选择、`/approve` 重试、权限持久化路径，以及团队场景下的推荐配置。

---

## 1. 自动审核解决什么问题

用 Codex 做过几天开发的人都会碰到一个矛盾：`on-request` 模式下审批弹窗太多影响效率，`never` 模式下又担心 Codex 搞出不可逆的破坏。

具体来说，假设你在做一个中等规模的重构——涉及十几个文件的改动。Codex 每改一个文件、每跑一条命令，`on-request` 模式下都要你确认。改 15 个文件，跑 5 次测试，安装 2 次依赖——你至少要按 22 次 Y。整个过程中你基本没什么判断可做，因为大部分操作是安全的（改业务代码、跑 `npm test`），但偶尔混进来一个需要仔细看的操作（比如 `DROP TABLE` migration），你又不能全选自动放行。

`never` 模式解决了效率问题但引入了风险。Codex 在全自动模式下可能执行你不想让它执行的操作——特别是在它对"任务目标"的理解和你的理解有偏差的时候。

自动审核就是在这两者之间插入一个 AI 过滤层。它的思路很简单：

- 你写一段策略描述，告诉审查器什么操作可以自动放行
- 审查器是一个轻量级 AI 模型，读你的策略，对每个审批请求做判断
- 低风险的操作自动放行，高风险的拒绝后等你手动 `/approve`
- 你只需要处理审查器"拿不准"的那一小部分操作

和 `never` 的区别在于：`never` 是零过滤全自动，审查器把自动执行拆成了"AI 先过滤 → 你再处理漏网之鱼"两步。和纯 `on-request` 的区别在于：你不用处理那些明显的安全操作了。

### 审查器的定位

审查器不是一个万能的安全网。它的设计目标有三个边界：

1. **只做"操作风险判断"**：审查器判断的是"这个操作是否应该执行"，不做"这个代码写得好不好"的质量判断。代码质量交给 `/review` 或 `codex review` 命令
2. **依赖你写的策略质量**：审查器能读懂自然语言策略，但如果策略太模糊（"允许安全的操作"），它的判断会很不可靠
3. **存在误判可能**：AI 审查器不是形式化验证工具。它可能放过有风险的操作，也可能拦截安全的操作。如果某个操作的安全判断不能容忍任何误判，应该用 `untrusted` 模式人工确认

---

## 2. approvals_reviewer 配置

### 2.1 两个可选值

```toml
# 默认值——审批请求到你面前
approvals_reviewer = "user"

# 开启自动审核——审批请求先经过 AI 审查器
approvals_reviewer = "auto_review"
```

`approvals_reviewer` 出现在 `config.toml` 的顶层，不在任何子表里。它的值只有两个选项：

| 值 | 审批路径 | 适用场景 |
|---|---|---|
| `"user"` | 审批请求直接弹到你面前 | 个人项目、小规模改动、需要精确控制 |
| `"auto_review"` | 审批请求先经过 AI 审查器，根据结果决定放行/拒绝/人工确认 | 日常开发、中等规模改动、需要减少审批弹窗 |

设置为 `"user"` 时，Codex 的行为和你在第 05 篇、第 18 篇里看到的一样——每个触发审批的操作都会在 TUI 里弹出一个确认提示，等你按 Y 或 N。

设置为 `"auto_review"` 时，审批请求先路由到审查器。审查器根据 `[auto_review].policy` 策略做出判断，然后：
- 允许的操作直接执行，不弹窗
- 拒绝的操作停在原地，等你用 `/approve` 重试
- 拿不准的操作弹到你面前

### 2.2 和 approval_policy 的配合

`approvals_reviewer` 和 `approval_policy` 是两个独立的维度：

- `approval_policy` 决定"哪些操作需要进入审批流程"
- `approvals_reviewer` 决定"进入审批流程后谁来审批"

两者组合的效果：

```
approval_policy = "untrusted"
approvals_reviewer = "auto_review"
→ 几乎所有操作都进入审批 → 审查器帮你过滤大部分读操作
  → 你只处理写操作和命令执行

approval_policy = "on-request"
approvals_reviewer = "auto_review"
→ 沙箱外操作进入审批 → 审查器过滤低风险的网络请求
  → 你只处理审查器拿不准的操作

approval_policy = "never"
approvals_reviewer = "auto_review"
→ 几乎没有操作进入审批 → 审查器基本不起作用
  → 这个组合没有意义，审查器没有输入可处理
```

第三个组合说明了一个重要原则：审查器只在有审批请求的时候才有事做。如果 `approval_policy = "never"`，所有操作直接执行，审查器收不到任何请求。审查器不会主动监控操作——它只在被调用时工作。

---

## 3. auto_review 策略写法

### 3.1 policy 基础语法

```toml
approvals_reviewer = "auto_review"

[auto_review]
policy = """
允许运行 pytest、cargo test、npm test 命令。
允许读写 src/ 和 tests/ 目录下的文件。
拒绝任何包含 DROP TABLE、DELETE FROM、TRUNCATE 的 SQL 命令。
拒绝访问 /etc/、~/.ssh/、~/.aws/、~/.gnupg/ 目录。
拒绝 sudo 命令。
拒绝任何包含 rm -rf / 的命令。
"""
```

`policy` 字段接受一个自然语言字符串。审查器解析这段文本，对每个审批请求做一次快速的"合规检查"。

策略不需要特殊的语法——用人类语言写就行。但写得越具体，审查器越不容易误判。

### 3.2 好的策略 vs 差的策略

差的策略：

```
允许安全的操作，拒绝危险的操作。
```

这段话对审查器来说几乎没有信息量。"安全"和"危险"是主观判断，审查器无法从中提取出可操作的规则。结果是：它要么几乎全部放行（因为大部分操作在某种意义上都是"安全的"），要么几乎全部拒绝（因为每个操作在某种意义上都有"潜在风险"）。

好的策略：

```
允许运行以下命令：pytest、cargo test、cargo build、npm test、npm run build、bun test。
允许读写 src/、lib/、tests/、test/ 目录下的文件。
允许运行 git diff、git log、git status 命令。
拒绝任何包含以下关键词的 SQL 命令：DROP TABLE、DELETE FROM、TRUNCATE、ALTER TABLE。
拒绝访问以下目录：/etc/、~/.ssh/、~/.aws/、~/.gnupg/、/var/log/。
拒绝 sudo 命令。
拒绝 rm -rf 命令。
```

好的策略有三个特点：
- **命令明确列出**：不说"允许测试命令"，而是列出具体的 `pytest`、`cargo test` 等
- **路径精确指定**：不说"允许读写项目文件"，而是指定 `src/`、`lib/` 等具体目录
- **危险操作逐条列举**：不说"拒绝危险命令"，而是列出 `DROP TABLE`、`sudo`、`rm -rf` 等具体模式

### 3.3 策略分区写法

对于复杂的项目，策略可以按功能分区写：

```toml
[auto_review]
policy = """
## 文件访问
允许读写 src/、tests/、lib/、pkg/ 目录。
允许读取 docs/、examples/ 目录。
拒绝写入 docs/ 和 examples/ 目录。
拒绝访问 .env、.env.* 文件。
拒绝访问 .git/ 目录。

## 命令执行
允许运行测试命令：pytest、cargo test、npm test、bun test。
允许运行构建命令：cargo build、npm run build、bun run build。
允许运行代码检查：eslint、ruff、mypy、cargo clippy。
拒绝 sudo 命令。
拒绝 rm -rf 命令。

## 数据库操作
允许 SELECT 查询。
拒绝所有修改数据库结构的命令：CREATE TABLE、DROP TABLE、ALTER TABLE。
拒绝所有修改数据的命令：INSERT、UPDATE、DELETE。

## 网络
拒绝 curl 和 wget 命令。
"""
```

`##` 分区标题对审查器没有语法意义，但对你自己维护策略时有帮助。审查器解析的是整段文本的内容，不在乎你怎么组织格式。

### 3.4 策略长度的取舍

策略不是越长越好。一个超长的策略（比如 50 行以上）可能导致两个问题：

1. **审查器处理慢**：每次审批请求都要重新解析策略文本，策略越长，处理时间越长。审批请求是阻塞式的——在审查器返回结果之前，Codex 的操作会暂停等待
2. **规则互相矛盾**：策略越长，越容易出现相互矛盾的规则。比如前面写了"允许 npm install"，后面又写了"拒绝所有网络请求"。审查器在遇到矛盾时可能做出不确定的选择

实用建议：策略控制在 15-30 行左右，覆盖最常见的操作场景。对于特别罕见的操作，交给 `/approve` 手动处理比写进策略更合理。

---

## 4. review_model 审查模型选择

### 4.1 默认行为

默认情况下，审查器使用当前会话的同一个模型。如果你用 `codex --model o3` 启动会话，审查器也是 `o3`。

大多数情况下这没问题——审查任务不需要很强的推理能力，主要是模式匹配和规则检查。但你可能希望审查器用更快、更便宜的模型，把昂贵的模型留给主任务。

### 4.2 指定独立审查模型

```toml
approvals_reviewer = "auto_review"
review_model = "o4-mini"
```

`review_model` 让你指定一个独立模型给审查器。主任务用 `o3` 做深度推理，审查器用 `o4-mini` 做快速规则判断——两者各司其职。

模型选择的考量：

| 模型 | 审查速度 | 策略理解能力 | token 成本 | 推荐场景 |
|---|---|---|---|---|
| `o4-mini` | 快 | 中 | 低 | 简单策略、高频审批、日常开发 |
| `o3` | 中 | 高 | 高 | 复杂策略、需要精确判断 |
| 当前会话模型 | 取决于配置 | 取决于配置 | 取决于配置 | 不想单独管理审查模型 |

### 4.3 review_model 和 cost 的关系

审查器的 token 消耗往往被忽略。每次审批请求，审查器需要：
- 接收策略文本（`[auto_review].policy` 的内容）
- 接收操作描述（命令内容、文件路径等）
- 输出判断结果（允许/拒绝/需要人工确认）

如果你的策略有 500 token，每个操作描述有 50 token，审查器每次调用的输入大约 550 token + 系统提示。一个涉及 20 个文件的重构任务，如果 15 个自动放行、5 个需要审查，审查器总共要处理 20 次请求，每次大约 600-800 token 的输入和 10-20 token 的输出。

用 `o3` 做审查，每次大约消耗 $0.003-0.005。用 `o4-mini`，大约 $0.0001-0.0003。对于高频使用场景，这个差距在一个月内可能达到几美元到几十美元。

---

## 5. guardian_policy_config 企业策略

### 5.1 云端策略下发

```toml
# 这个配置由企业管理员通过 OpenAI 后台设置
# 用户无法在本地修改或绕过
[guardian_policy_config]
policy = """
公司安全策略：
- 禁止访问生产数据库
- 禁止修改基础设施配置文件
- 禁止通过 Codex 执行任何网络请求
- 所有数据库写操作必须由授权人员审批
"""
```

`guardian_policy_config` 是企业环境下最高优先级的策略来源。它由企业管理员在 OpenAI 的管理后台配置，通过云端下发到所有使用企业账号的 Codex 实例。

### 5.2 优先级规则

三层策略的优先级从高到低：

```
guardian_policy_config（云端）  ← 最高，不可绕过
    ↓ 覆盖
[auto_review].policy（本地 config.toml）
    ↓ 覆盖
默认行为（审查器的内置安全基线）
```

这意味着：即使你的本地策略写着"允许所有操作"，企业管理员下发的 `guardian_policy_config` 仍然可以拦住高风险操作。你无法通过修改本地配置来绕过它。

反过来：如果 `guardian_policy_config` 没有覆盖某个操作，本地 `[auto_review].policy` 的规则仍然有效。两层策略是叠加关系，不是替代关系。

### 5.3 适用范围

`guardian_policy_config` 需要企业套餐（Business 或 Enterprise）。个人账号和 API Key 不支持这个配置项。

如果你看到某个教程提到了 `guardian_policy_config` 但你的 Codex 里不生效，检查你的账号类型。个人免费账号只能用 `[auto_review].policy` 做本地策略控制。

---

## 6. /approve 重试机制

### 6.1 工作流程

```
Codex: 我需要运行 `npm install @tanstack/react-query`
       （审批请求路由到 auto_review 审查器）
自动审查器: 拒绝。理由：策略禁止未明确的 npm install 操作。
Codex: 操作被自动审查器拒绝。如果需要重试，请输入 /approve。

你：/approve

（操作重新执行，这次可能弹到你的面前让你手动确认）
```

`/approve` 的行为取决于 `approval_policy` 的当前设置。如果 `approval_policy` 是 `on-request`，`/approve` 重试时操作可能弹到你面前（因为审查器已经拒绝了一次，这次走人工路径）。如果 `approval_policy` 是 `never`，`/approve` 重试时操作直接执行（绕过审查器）。

### 6.2 注意事项

几个需要知道的细节：

- `/approve` 只重试**最近一次**被拒绝的操作。如果连续多个操作被拒绝，你需要逐个 `/approve`
- 如果你不确定最近一次被拒绝的是什么，回头看 Codex 的输出——它会说明拒绝原因和操作内容
- 如果审查器反复拒绝同类操作，说明你的策略写得太严格了。应该调整 `[auto_review].policy` 让审查器放行这类操作，而不是每次都 `/approve`
- `/approve` 只在 `approvals_reviewer = "auto_review"` 时有用。如果你用的是 `approvals_reviewer = "user"`（默认），审批请求直接到你面前，不存在"被自动拒绝后需要重试"的场景

### 6.3 反复 /approve 的警示信号

如果你发现自己在频繁使用 `/approve`，这通常意味着策略配置有问题。几个常见原因：

1. **策略太严格**：比如策略写着"拒绝所有 npm install"，但你的工作流经常需要安装新依赖。应该在策略里加上"允许 npm install 和 pip install"
2. **策略太模糊**：审查器在模糊策略下倾向于保守拒绝。把模糊描述替换为具体的命令和路径
3. **策略和任务不匹配**：你在用处理后端项目的策略来处理前端项目（或者反过来），策略里列的命令模式不匹配

解决方法：定期回顾 `/approve` 的使用记录（Codex 的 transcript 里会记录），找出被反复拒绝的操作模式，更新策略。

---

## 7. 权限持久化

### 7.1 会话级 vs 持久级

通过 `/permissions` 面板在会话中途做的修改，默认只影响当前会话。关闭 Codex 后重新打开，所有配置恢复到 `config.toml` 的默认值。

这是一个安全设计——防止你在某个会话中临时放宽的权限意外地成为永久设置。想象一下你在调试时临时把策略切到了 `never`，如果这个设置自动持久化，下次打开 Codex 时你就会在不知情的情况下使用全自动模式。

但有时候你确实想让某些修改持久化。Codex 提供了几种方式：

### 7.2 手动编辑 config.toml

最直接的方式。在 `~/.codex/config.toml` 里修改配置：

```toml
# ~/.codex/config.toml

# 审批策略持久化
approval_policy = "on-request"

# 自动审核持久化
approvals_reviewer = "auto_review"

[auto_review]
policy = """
允许运行 pytest、cargo test、npm test 命令。
允许读写 src/ 和 tests/ 目录。
拒绝任何包含 DROP TABLE、DELETE FROM 的 SQL 命令。
拒绝访问 /etc/、~/.ssh/、~/.aws/ 目录。
"""
```

每次修改后，新会话会加载新的配置。不需要重启 Codex（下次启动自动生效）。

### 7.3 default_permissions 权限 Profile

`default_permissions` 是一种更结构化的权限持久化方式。它指向一个命名的权限 Profile，Profile 里定义了文件系统访问、网络策略等完整权限规则。

```toml
# ~/.codex/config.toml
default_permissions = "daily-dev"

# 定义权限 Profile
[permissions.daily-dev]
description = "日常开发：工作区可写，网络受限"

[permissions.daily-dev.filesystem]
":workspace_roots" = "write"

[permissions.daily-dev.network]
enabled = true
mode = "limited"
domains = {
  "registry.npmjs.org" = "allow"
  "pypi.org" = "allow"
  "github.com" = "allow"
  "*" = "deny"
}
```

`default_permissions` 的效果是：每次启动 Codex 时，自动加载 `daily-dev` 这个权限 Profile。你在 `/permissions` 面板里切换到其他 Profile 时，`default_permissions` 暂时被覆盖；会话结束后，下次启动恢复到 `daily-dev`。

这比直接写 `sandbox_mode = "workspace-write"` 更灵活，因为 Profile 可以包含文件系统路径规则和网络域名策略，而 `sandbox_mode` 只是一个粗粒度的模式开关。

### 7.4 permissions.toml 项目级权限

Codex 支持项目级别的权限配置文件。在项目根目录下创建 `permissions.toml`（和 `AGENTS.md` 同级），里面的配置会作为项目特定的权限约束。

```toml
# 项目根目录/permissions.toml

# 这个项目需要网络访问来安装依赖
[sandbox_workspace_write]
network_access = true

# 只允许访问特定的包管理器域名
[features.network_proxy]
enabled = true
domains = {
  "registry.npmjs.org" = "allow"
  "files.pythonhosted.org" = "allow"
}
```

`permissions.toml` 的优先级高于用户级的 `config.toml`，低于 `requirements.toml`（系统级约束）。它的作用是让项目自己声明"我需要什么权限"，而不是让每个开发者手动配置。

### 7.5 配置持久化路径对比

| 方式 | 作用范围 | 修改方式 | 是否影响其他人 | 持久性 |
|---|---|---|---|---|
| `/permissions` 面板 | 当前会话 | TUI 交互 | 否 | 关闭会话后失效 |
| `config.toml` | 所有会话 | 手动编辑 | 否 | 永久 |
| `default_permissions` | 所有会话 | 配置文件 | 否 | 永久 |
| Profile 文件（`*.config.toml`） | 指定 `--profile` 时 | 手动编辑 | 可共享 | 永久 |
| `permissions.toml` | 本项目 | 手动编辑，提交到 Git | 是（共享仓库） | 永久 |
| `requirements.toml` | 系统级 | 管理员编辑 | 是（所有用户） | 永久 |
| `guardian_policy_config` | 企业级 | 云端配置 | 是（所有用户） | 永久，不可绕过 |

---

## 8. 实战场景

### 场景一：日常开发的半自动审批

你一个人维护项目，希望 Codex 能自动处理安全操作，只在遇到不确定的操作时问你。

```toml
# ~/.codex/config.toml
approval_policy = "on-request"
approvals_reviewer = "auto_review"
review_model = "o4-mini"

[auto_review]
policy = """
允许运行 pytest、cargo test、npm test、bun test 命令。
允许运行 git diff、git log、git status 命令。
允许读写 src/、tests/、lib/ 目录。
允许 npm install、pip install、cargo build、npm run build。
拒绝 sudo 命令。
拒绝任何包含 DROP TABLE、DELETE FROM、TRUNCATE 的命令。
拒绝访问 ~/.ssh/、~/.aws/、/etc/ 目录。
"""

default_permissions = "dev"
```

对应的权限 Profile：

```toml
[permissions.dev]
description = "日常开发权限"

[permissions.dev.filesystem]
":workspace_roots" = "write"

[permissions.dev.network]
enabled = true
mode = "limited"
domains = {
  "registry.npmjs.org" = "allow"
  "pypi.org" = "allow"
  "github.com" = "allow"
  "*" = "deny"
}
```

效果：
- 改代码、跑测试：审查器自动放行，不需要你操作
- 安装依赖：审查器根据命令判断放行（`npm install` 在策略里明确允许了）
- 数据库操作：审查器拦截含有 `DROP TABLE` 的 SQL，等你 `/approve`
- 访问敏感目录：审查器拦截，等你手动确认

### 场景二：团队共享的审查策略

你需要在团队中统一审查标准。做法是把审查策略提交到项目仓库。

```toml
# 项目根目录/.codex/review-policy.toml（提交到 Git）
# 注意：这不是一个内置的配置文件名，是团队约定的方式
```

然后在项目的 `AGENTS.md` 里写明策略要求：

```markdown
## Codex 安全策略

团队成员使用 Codex 时，请在 `~/.codex/config.toml` 中配置：

```toml
approvals_reviewer = "auto_review"
review_model = "o4-mini"

[auto_review]
policy = """
允许运行 pytest、cargo test、npm test 命令。
允许读写 src/ 和 tests/ 目录。
拒绝 sudo 命令。
拒绝任何包含 DROP TABLE、DELETE FROM 的 SQL。
拒绝访问 ~/.ssh/、~/.aws/、~/.gnupg/ 目录。
"""
```
```

团队成员把这段配置复制到自己的 `config.toml` 里。好处是统一了审查标准——不会出现"他那边 Codex 自动跑了 `DROP TABLE`，我这边被拦住了"的情况。

如果团队用的是企业套餐，更好的方式是通过 `guardian_policy_config` 在云端统一下发，不需要每个人手动配置。

### 场景三：高频审查场景的优化

如果你的项目涉及大量的文件读写操作（比如大规模重构），审查器的响应速度会成为瓶颈。每次审批请求大约增加 1-3 秒的延迟（取决于审查模型和网络延迟）。如果有 50 次审批请求，额外的等待时间可能达到 2-3 分钟。

优化方向：

1. **用更快的审查模型**：`review_model = "o4-mini"` 比 `o3` 快得多，对于简单的规则判断够用
2. **收紧 `approval_policy`**：如果可能，把不需要审查的操作从审批列表中排除。比如把策略写成 `approval_policy = "on-request"`（只有沙箱外操作触发审批），而不是 `approval_policy = "untrusted"`（几乎所有操作都触发）
3. **策略精简**：减少策略文本的 token 数量，审查器处理更快
4. **用 Profile 区分场景**：大规模重构时临时切到宽松 Profile，重构完成后切回严格 Profile

---

## 9. 常见问题

### 审查器拒绝了一个安全的操作怎么办

用 `/approve` 手动批准。然后检查你的 `[auto_review].policy` 策略——如果这个操作类型经常被误拒，更新策略让它放行这类操作。

### 审查器放行了一个危险的操作怎么办

这说明你的策略写得不准确。审查器忠实地执行了你的策略——如果策略没有覆盖到某个危险模式，审查器就不会拦截。

修复方法：把危险模式添加到策略里。比如你发现审查器放行了一条 `rm -rf build/` 命令，但你的策略里没有提到 `rm -rf`，那就加上：

```
拒绝 rm -rf 命令。
```

### /approve 不起作用

检查你是否配置了 `approvals_reviewer = "auto_review"`。如果没配置（默认是 `"user"`），所有审批请求直接到你面前，不存在"被自动拒绝"的场景，`/approve` 无事可做。

### 审查器很慢怎么优化

1. 把 `review_model` 换成更快的模型（`o4-mini`）
2. 精简 `[auto_review].policy` 策略文本
3. 检查网络延迟——审查器需要调用 API，网络慢会影响审查速度

### guardian_policy_config 和本地策略冲突

`guardian_policy_config` 优先级更高。企业管理员设置的策略覆盖你的本地配置，这是设计如此。如果你认为某个策略过于严格，联系管理员调整，不要试图在本地绕过。

---

## 10. 下一步

本篇覆盖了 Codex CLI 自动审核和权限持久化的完整体系。从 `approvals_reviewer` 的两种审批路径，到 `[auto_review].policy` 的自然语言策略写法，再到 `review_model` 模型选择、`/approve` 重试机制、`default_permissions` 权限记忆、以及企业级的 `guardian_policy_config` 云端策略。

**下一篇（第 32 篇）**将讨论权限 Profile 机制——`[permissions]` 表的完整语法、`extends` 继承链、文件系统路径规则、网络域名策略，以及如何用 Profile 实现多环境的权限隔离。

---

**延伸阅读**

- [Codex 官方文档 - Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security) — 审批与安全机制的官方说明
- [Codex 官方文档 - Configuration Reference](https://developers.openai.com/codex/config-reference) — config.toml 所有配置项完整参考
- [Codex 开源仓库 - ApproverKind 枚举](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/protocol.rs) — 审批者类型的源码定义
- 本系列第 30 篇 [审批策略详解](./30-approval-policy.md) — approval_policy 四种模式深度拆解
- 本系列第 18 篇 [权限与安全命令](./18-cmd-permissions.md) — /permissions、/approve 交互层用法
- 本系列第 26 篇 [Shell 与沙箱配置](./26-shell-and-sandbox-config.md) — sandbox_mode 和环境变量策略

---

*本文基于 Codex CLI 源码（`ApproverKind` 枚举）和 2026 年 6 月的官方文档撰写。Codex 版本更新频繁，部分配置项和默认行为可能在未来版本中变更。*
