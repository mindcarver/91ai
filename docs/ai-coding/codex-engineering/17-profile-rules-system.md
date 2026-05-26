# Profile 配置与 Rules 系统：命名预设和命令策略

**TL;DR：** Codex 的 Profile 是命名的配置预设，把模型、沙箱、审批模式等参数打包成一个可切换的集合，解决"不同任务需要不同安全姿态"的问题。Rules 是基于 Starlark 语言的命令策略引擎，在每次 shell_command 执行前评估，决定 allow、prompt 还是 deny。两者组合使用可以实现精细的工作流控制：代码审查用只读 Profile + 严格 Rules，部署用高权限 Profile + 生产路径 Deny 规则，日常开发用宽松 Profile + 基本 Rules。本文覆盖 Profile 系统的设计、Starlark Rules 的三种规则类型和三种决策、Profile 与 Rules 的组合模式、与 Claude Code Hooks 体系的哲学对比，以及常见的配置反模式。

---

## 为什么需要 Profile 和 Rules

### 一个参数不够用的现实

config.toml 中的 `approval_mode`、`sandbox_mode`、`model` 等参数是全局生效的。设置 `approval_mode = "auto"`，所有会话都用 auto 模式；设置 `model = "o3"`，所有任务都用 o3 模型。这在实际工作中不够用：

- 代码审查只需要读权限，日常开发需要写权限，两者不该用同一个沙箱级别
- lint 修复用 o4-mini 就够了，架构设计需要 o3，安全审计需要 o3-pro
- CI 环境中的 Codex 不该有任何交互式审批，但本地开发时应该保留关键操作的确认
- 某些命令（如 `git push`）在个人分支上可以自动执行，在 main 分支上应该被拦截

如果每次切换任务都手动改 config.toml，要么改错忘改回来，要么干脆不改、用不合适的配置硬跑。两种选择都不好。

Profile 和 Rules 是解决这个问题的两层机制：

| 机制 | 控制粒度 | 解决的问题 | 实现层级 |
|------|---------|-----------|---------|
| Profile | 整体配置预设 | 不同任务需要不同的模型、沙箱、审批组合 | config.toml 配置段 |
| Rules | 单条命令决策 | 同一个 Profile 内，不同命令需要不同的执行策略 | Starlark 规则引擎 |

Profile 管"大方向"，Rules 管"细颗粒度"。一个 Profile 定义了整体的安全姿态，Rules 在这个姿态内做逐命令的精细控制。

---

## Profile 系统

### Profile 的定位

Profile 是一组配置参数的命名集合。一个 Profile 可以覆盖以下参数：

- `model`：使用的模型
- `sandbox_mode`：沙箱隔离级别（read-only / workspace-write / full-access）
- `approval_mode`：审批模式（suggest / auto-edit / full-auto）
- `web_search`：搜索模式（cached / live / disabled）
- `developer_instructions`：开发者指令（每个 Profile 可以有不同的指令）
- `allowed_domains`：允许访问的域名白名单
- `allow_localhost`：是否允许访问 localhost
- `allow_private_network`：是否允许访问私有网络

一个 Profile 不需要覆盖所有参数。未覆盖的参数使用 config.toml 中的全局默认值。

### 内置 Profile

Codex 提供两个内置 Profile，开箱即用。

**careful**

```toml
# careful Profile 的等效配置
# 适合高风险任务：生产环境操作、安全审计、不熟悉的代码库

model = "o3"                    # 使用更强的推理模型
sandbox_mode = "read-only"      # 只读沙箱，不允许任何写入
approval_mode = "suggest"       # 每一步都需要人工确认
web_search = "disabled"         # 禁用搜索，防止数据外泄
```

careful Profile 的设计意图是"宁可慢，不可错"。它牺牲了效率和自动化程度，换取最大的安全性和可见性。适用场景：

- 第一次在一个陌生的代码库中使用 Codex
- 审查安全相关的代码（认证、加密、权限控制）
- 在生产环境或预发布环境中做分析
- 对 Codex 的输出质量还不熟悉，需要逐步观察

**deep-review**

```toml
# deep-review Profile 的等效配置
# 适合深度代码审查：需要强模型的推理能力，但不修改代码

model = "o3-pro"                # 最强推理模型
sandbox_mode = "read-only"      # 只读
approval_mode = "suggest"       # 每一步确认
web_search = "cached"           # 允许缓存搜索，辅助分析
developer_instructions = "只做分析和报告，不修改任何文件。输出结构化的审查报告。"
```

deep-review 与 careful 的区别在于模型能力和搜索权限。deep-review 使用最强的推理模型和允许缓存搜索，适合需要深度理解代码逻辑的审查任务。careful 更偏向安全防御，deep-review 更偏向分析深度。

### 通过 --profile 标志切换

Profile 通过 CLI 的 `--profile` 标志激活：

```bash
# 使用内置 Profile
codex --profile careful "分析这个模块的安全问题"
codex --profile deep-review "审查 PR #42 的所有变更"

# 使用自定义 Profile（在 config.toml 中定义）
codex --profile dev "修复 lint 错误"
codex --profile deploy "更新 staging 环境的配置"
codex --profile audit "审计所有 API 端点的认证逻辑"
```

`--profile` 参数的优先级高于 config.toml 中的全局设置，低于 CLI 的直接参数。即：

```
CLI 直接参数（--model, --sandbox） > --profile 中的设置 > config.toml 全局默认
```

这意味着你可以用 CLI 参数覆盖 Profile 中的任何设置：

```bash
# 使用 dev Profile，但临时切换到更强的模型
codex --profile dev --model o3 "重构认证模块"

# 使用 careful Profile，但允许缓存搜索
codex --profile careful --web-search cached "查询最新的 OWASP Top 10"
```

### 在 config.toml 中定义自定义 Profile

自定义 Profile 在 config.toml 的 `[profiles.NAME]` 段落中定义。每个段落名对应一个 Profile 名称：

```toml
# .codex/config.toml

# 全局默认配置
model = "gpt-5.2-codex"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"

# ── 开发 Profile ────────────────────────────────
# 日常开发：轻量模型、可写工作区、自动编辑
[profiles.dev]
model = "o4-mini"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"
web_search = "cached"
developer_instructions = "代码注释使用中文。使用 pnpm 而不是 npm。"

# ── 架构 Profile ────────────────────────────────
# 架构设计：强推理模型、只读、禁用搜索
[profiles.arch]
model = "o3"
sandbox_mode = "read-only"
approval_mode = "suggest"
web_search = "disabled"
developer_instructions = "只输出架构分析报告和方案建议，不修改任何文件。"

# ── 测试 Profile ────────────────────────────────
# 测试生成：标准模型、可写、限制只改测试文件
[profiles.test]
model = "gpt-5.2-codex"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"
developer_instructions = "只生成和修改测试文件（*.test.ts, *.spec.ts, __tests__/）。不修改源代码文件。"

# ── 部署 Profile ────────────────────────────────
# 部署操作：强模型、完全访问、严格指令
[profiles.deploy]
model = "o3"
sandbox_mode = "full-access"
approval_mode = "full-auto"
developer_instructions = "只执行部署相关操作。不允许修改源代码。所有操作前先确认目标环境。"
```

Profile 命名建议使用简短、语义明确的名称。`dev`、`test`、`deploy`、`audit` 这样的名称比 `development-mode` 或 `profile-for-testing` 更好，因为 Profile 名称需要在 CLI 中频繁输入。

### Profile 的分层和覆盖

Profile 同样遵循 config.toml 的分层加载规则。用户级 config.toml 可以定义个人偏好的 Profile，项目级 config.toml 可以定义团队共享的 Profile：

```toml
# ~/.codex/config.toml -- 个人 Profile
[profiles.personal]
model = "o4-mini"
approval_mode = "auto-edit"
developer_instructions = "代码注释使用中文。"

# .codex/config.toml -- 项目 Profile（团队共享）
[profiles.dev]
model = "o4-mini"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"
web_search = "cached"
```

当项目级和用户级定义了同名 Profile 时，项目级的定义覆盖用户级的。这确保了团队共享的 Profile 行为一致。

### 会话中切换 Profile

在交互式会话中，可以通过 `/profile` 命令实时切换 Profile：

```
> /profile dev
Switched to profile: dev (model: o4-mini, sandbox: workspace-write)

> 修复所有 lint 错误
[o4-mini 开始修复...]

> /profile arch
Switched to profile: arch (model: o3, sandbox: read-only)

> 分析这个模块的架构，给出重构建议
[o3 只读模式下开始分析...]
```

会话中切换 Profile 适用于同一个工作流的不同阶段。例如，先用 `dev` Profile 做代码修改，再切换到 `arch` Profile 做架构审查，最后切换到 `test` Profile 生成测试。这种按阶段切换的模式在成本和质量之间取得了平衡——只在需要强推理的阶段使用昂贵的模型。

---

## Rules 系统：Starlark 策略引擎

### Starlark 是什么

Starlark 是 Python 语言的一个安全子集，最初为 Bazel 构建系统设计，用于编写构建规则。它的核心特征：

- 语法与 Python 几乎相同，学习成本极低
- 不支持 `import`、`exec`、`eval`、`open` 等危险操作
- 沙箱执行，规则文件无法访问文件系统或网络
- 确定性执行，不依赖外部状态

Codex 选择 Starlark 作为规则语言的原因很明确：需要一个足够灵活的表达能力来描述命令策略，但又不能给规则文件本身带来安全风险。Starlark 的受限特性恰好满足这个需求——规则文件可以做模式匹配和条件判断，但不能执行系统命令或访问文件系统。

Starlark 与 Python 的关键差异：

| 特性 | Python | Starlark | 影响 |
|------|--------|----------|------|
| 文件 I/O | `open()`, `os.path` | 不支持 | 规则不能读写文件 |
| 网络访问 | `socket`, `requests` | 不支持 | 规则不能发起网络请求 |
| 进程创建 | `subprocess` | 不支持 | 规则不能创建子进程 |
| 全局变量修改 | 自由修改 | 冻结（frozen） | 规则执行期间状态不可变 |
| 类定义 | `class` | 不支持 | 使用函数和字典替代 |
| 异常处理 | `try/except` | 不支持 | 用条件判断替代 |
| 列表推导 | `[x for x in ...]` | 支持 | 语法完全兼容 |
| 字典推导 | `{k: v for ...}` | 支持 | 语法完全兼容 |
| 三元表达式 | `x if cond else y` | 支持 | 语法完全兼容 |

### Rules 的执行时机

Rules 在 Codex 每次执行 `shell_command` 工具之前被评估。评估流程：

```
Codex 决定执行一条 shell 命令
        |
        v
   Rules 引擎加载
        |
        v
   按优先级顺序评估规则
        |
        v
   +----+--------+--------+
   |    |        |        |
 allow  prompt   deny   无匹配
   |    |        |        |
   v    v        v        v
 自动  等待     拒绝    回退到
 执行  用户     执行    审批模式
       确认             默认行为
```

关键点：Rules 只对 `shell_command` 生效。文件读写操作由沙箱和审批模式控制，不经过 Rules 引擎。这是有意为之的分层设计——文件操作的安全边界由内核沙箱保障（不可绕过），命令执行的安全策略由 Rules 控制（灵活可配置）。

### 三种规则类型

#### prefix_rule：前缀匹配

`prefix_rule` 检查命令字符串是否以指定的前缀开头。这是最常用的规则类型，覆盖了大多数命令策略场景。

```python
# prefix_rule 语法
prefix_rule(
    prefix = "git status",      # 命令前缀
    decision = "allow",         # allow / prompt / deny
)
```

前缀匹配是精确的字符串前缀比较，不是正则表达式。`git status` 匹配 `git status`、`git status --short`、`git status --porcelain`，但不匹配 `git stash`。

实际示例：

```python
# 允许所有 git 只读命令
prefix_rule(prefix = "git status", decision = "allow")
prefix_rule(prefix = "git diff", decision = "allow")
prefix_rule(prefix = "git log", decision = "allow")
prefix_rule(prefix = "git branch", decision = "allow")
prefix_rule(prefix = "git show", decision = "allow")
prefix_rule(prefix = "git remote", decision = "allow")

# 允许项目构建和测试命令
prefix_rule(prefix = "pnpm lint", decision = "allow")
prefix_rule(prefix = "pnpm test", decision = "allow")
prefix_rule(prefix = "pnpm typecheck", decision = "allow")
prefix_rule(prefix = "pnpm build", decision = "allow")

# 需要确认的写操作
prefix_rule(prefix = "git push", decision = "prompt")
prefix_rule(prefix = "git commit", decision = "prompt")
prefix_rule(prefix = "npm publish", decision = "prompt")
prefix_rule(prefix = "docker push", decision = "prompt")

# 拒绝危险操作
prefix_rule(prefix = "rm -rf /", decision = "deny")
prefix_rule(prefix = "rm -rf ~", decision = "deny")
```

#### regex_rule：正则匹配

`regex_rule` 使用正则表达式匹配命令字符串。当前缀匹配不够灵活时使用，例如需要匹配参数顺序不固定的命令。

```python
# regex_rule 语法
regex_rule(
    pattern = r"rm\s+-rf\s+/",   # 正则表达式
    decision = "deny",
)
```

正则匹配的典型场景：

```python
# 拒绝任何形式的 rm -rf / 和 rm -rf ~
# 前缀匹配无法覆盖 rm -f -r / 或 rm --recursive --force / 等变体
regex_rule(
    pattern = r"rm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+-[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*r[a-zA-Z]*\s+-[a-zA-Z]*f[a-zA-Z]*|-rf)\s+(/|~|\*)",
    decision = "deny",
)

# 拒绝管道到 shell 的远程脚本执行
regex_rule(pattern = r"(curl|wget)\s+.*\|\s*(bash|sh|zsh)", decision = "deny")

# 拒绝 sudo 提权
regex_rule(pattern = r"sudo\s+(su|-i|bash|sh)", decision = "deny")

# 对生产环境相关路径的操作需要确认
regex_rule(pattern = r".*(production|prod|staging).*", decision = "prompt")

# 允许所有 pnpm/npm 命令（但排除 publish）
regex_rule(pattern = r"(pnpm|npm)\s+(?!publish)", decision = "allow")
```

#### custom：自定义规则函数

`custom` 规则允许你编写任意的 Starlark 函数来做判断。这是最灵活的规则类型，可以实现复杂的条件逻辑。

```python
# custom 规则语法
def check_command(command):
    # command 是一个字符串，包含待执行的完整命令
    # 返回 "allow"、"prompt" 或 "deny"

    # 示例：生产部署始终需要确认
    if "deploy" in command and "production" in command:
        return "prompt"

    if command.startswith("npm install"):
        # 检查是否安装了已知的危险包
        dangerous_packages = ["eval-pipeline", "crossenv"]
        for pkg in dangerous_packages:
            if pkg in command:
                return "deny"
        return "allow"

    # 未匹配的规则返回 None，继续评估下一条规则
    return None

custom(fn = check_command)
```

`custom` 规则函数的返回值决定了决策。返回 `"allow"`、`"prompt"` 或 `"deny"` 表示匹配并采取对应决策。返回 `None` 表示不匹配，继续评估下一条规则。

### 三种决策

| 决策 | 效果 | 适用场景 |
|------|------|---------|
| `allow` | 自动执行，不需要人工确认 | 安全的只读命令、项目构建工具、git 只读操作 |
| `prompt` | 暂停执行，等待用户确认或拒绝 | 写操作、推送操作、安装依赖、影响范围不确定的命令 |
| `deny` | 拒绝执行，不提供人工覆盖选项 | 危险命令、生产环境破坏性操作、安全策略禁止的操作 |

`deny` 是最强硬的决策。被 deny 的命令不会展示给用户确认，直接拒绝执行。这意味着即使你在 `--yolo` 模式下运行，deny 规则仍然生效。这是 Rules 作为安全治理层而非便利性层的设计体现。

### 规则优先级和评估顺序

Rules 按定义顺序从上到下评估，**第一条匹配的规则生效，后续规则不再评估**。这是短路评估（short-circuit evaluation），与很多防火墙规则的工作方式相同。

```python
# 规则文件的评估顺序

# 第一条：允许所有 git 只读命令（匹配即生效）
prefix_rule(prefix = "git status", decision = "allow")
prefix_rule(prefix = "git diff", decision = "allow")
prefix_rule(prefix = "git log", decision = "allow")

# 第二条：拦截 git push --force（比下面的 git push 规则更具体）
regex_rule(pattern = r"git\s+push\s+.*(--force|-f)", decision = "deny")

# 第三条：git push 需要 prompt
prefix_rule(prefix = "git push", decision = "prompt")

# 第四条：允许所有 pnpm 命令
prefix_rule(prefix = "pnpm", decision = "allow")

# 第五条：拒绝 rm -rf 的所有变体
regex_rule(pattern = r"rm\s+.*-rf", decision = "deny")

# 第六条：默认策略
default_decision = "prompt"
```

顺序至关重要。如果把 `prefix_rule(prefix = "pnpm", decision = "allow")` 放在 `prefix_rule(prefix = "pnpm publish", decision = "prompt")` 前面，那 `pnpm publish` 永远会被前一条规则匹配为 `allow`，后面的 `prompt` 规则永远不会被评估。

**规则排序原则**：

1. 具体规则在前，通用规则在后
2. deny 规则在前，allow 规则在中，prompt 规则在后
3. 最危险的命令应该被最早的规则拦截

### Rules 文件位置和加载顺序

Rules 文件存放在 `.codex/rules/` 目录下，文件扩展名为 `.star`。加载顺序：

```
1. ~/.codex/rules/*.star               ← 用户级全局规则（最先加载）
2. .codex/rules/*.star                 ← 项目级规则（后加载）
3. .codex/rules/profiles/NAME.star     ← Profile 专属规则（最后加载）
```

同一层级内，文件按字母顺序加载。多个文件中的规则按加载顺序串联后统一评估。

```bash
# 典型的规则目录结构
.codex/
  rules/
    base.star             # 基础规则：允许安全的只读命令
    git.star              # Git 相关规则
    dangerous.star        # 危险命令拦截规则
    profiles/
      dev.star            # dev Profile 专属规则（更宽松）
      deploy.star         # deploy Profile 专属规则（更严格）
      audit.star          # audit Profile 专属规则（只读+报告）
```

当使用 `--profile dev` 启动 Codex 时，加载的规则文件是：

1. `~/.codex/rules/*.star`（用户全局规则）
2. `.codex/rules/*.star`（项目基础规则）
3. `.codex/rules/profiles/dev.star`（dev Profile 专属规则）

三层规则串联后按顺序评估。Profile 专属规则在最后加载，意味着它可以覆盖基础规则的行为——但需要注意，由于短路评估机制，如果基础规则已经匹配了某条命令，Profile 规则就没有机会再处理该命令。因此，基础规则应该尽量通用，Profile 规则处理特定场景的覆盖。

---

## Profile 与 Rules 组合实战

### 组合一：代码审查（只读 + 严格 Rules）

```toml
# config.toml 中的 audit Profile
[profiles.audit]
model = "o3-pro"
sandbox_mode = "read-only"
approval_mode = "suggest"
web_search = "cached"
developer_instructions = "只做分析和报告，不修改任何文件。输出格式：按安全/性能/可维护性分类的审查报告。"
```

```python
# .codex/rules/profiles/audit.star
# 审查模式下的规则：只允许只读命令，拒绝一切写入

# 允许的只读命令
prefix_rule(prefix = "git status", decision = "allow")
prefix_rule(prefix = "git diff", decision = "allow")
prefix_rule(prefix = "git log", decision = "allow")
prefix_rule(prefix = "git show", decision = "allow")
prefix_rule(prefix = "git blame", decision = "allow")
prefix_rule(prefix = "grep", decision = "allow")
prefix_rule(prefix = "cat", decision = "allow")
prefix_rule(prefix = "head", decision = "allow")
prefix_rule(prefix = "tail", decision = "allow")
prefix_rule(prefix = "wc", decision = "allow")
prefix_rule(prefix = "find", decision = "allow")
prefix_rule(prefix = "tsc --noEmit", decision = "allow")

# 允许只读的工具命令
prefix_rule(prefix = "pnpm lint", decision = "allow")
prefix_rule(prefix = "pnpm typecheck", decision = "allow")

# 拒绝所有写入操作
regex_rule(pattern = r"(write|modify|delete|remove|create|touch|mkdir|cp |mv )", decision = "deny")

# 拒绝所有 git 写入操作
prefix_rule(prefix = "git commit", decision = "deny")
prefix_rule(prefix = "git push", decision = "deny")
prefix_rule(prefix = "git merge", decision = "deny")
prefix_rule(prefix = "git rebase", decision = "deny")
prefix_rule(prefix = "git cherry-pick", decision = "deny")
prefix_rule(prefix = "git reset", decision = "deny")
prefix_rule(prefix = "git checkout", decision = "deny")

# 默认策略：任何未明确允许的命令都需要确认
default_decision = "prompt"
```

使用方式：

```bash
codex --profile audit "审查 src/auth/ 目录下所有文件的安全问题，输出结构化报告"
```

这个组合的特点是双重保障：Profile 层面通过 `sandbox_mode = "read-only"` 在内核层阻止写入，Rules 层面通过 deny 规则在应用层拦截写入命令。即使其中一层因为 bug 或配置错误失效，另一层仍然提供保护。

### 组合二：部署操作（高权限 + 生产路径 Deny）

```toml
# config.toml 中的 deploy Profile
[profiles.deploy]
model = "o3"
sandbox_mode = "full-access"
approval_mode = "full-auto"
developer_instructions = "只执行部署相关操作。执行前必须确认目标环境。不允许修改源代码文件。"
```

```python
# .codex/rules/profiles/deploy.star
# 部署模式下的规则：允许部署命令，严格拦截生产路径的误操作

# 拒绝对生产数据库的直接操作
regex_rule(pattern = r".*(production-db|prod-mysql|prod-postgres).*", decision = "deny")

# 拒绝直接操作生产环境文件
regex_rule(pattern = r".*(/etc/|/var/www/production/|/opt/production/).*", decision = "deny")

# 拒绝修改源代码
regex_rule(pattern = r"(vim|nano|code|sed -i|awk.*-i)\s+.*\.(ts|js|py|go|rs|java)", decision = "deny")

# 拒绝 force push
regex_rule(pattern = r"git\s+push\s+.*(--force|-f)", decision = "deny")

# 拒绝删除分支
regex_rule(pattern = r"git\s+(push\s+.*--delete|branch\s+-[dD])", decision = "deny")

# 允许部署相关命令
prefix_rule(prefix = "docker build", decision = "allow")
prefix_rule(prefix = "docker push", decision = "prompt")    # push 需要确认
prefix_rule(prefix = "docker compose", decision = "allow")
prefix_rule(prefix = "kubectl apply", decision = "prompt")  # k8s 应用需要确认
prefix_rule(prefix = "kubectl rollout", decision = "prompt")
prefix_rule(prefix = "helm upgrade", decision = "prompt")
prefix_rule(prefix = "terraform plan", decision = "allow")
prefix_rule(prefix = "terraform apply", decision = "prompt")
prefix_rule(prefix = "ansible-playbook", decision = "prompt")

# 允许 Git 只读命令
prefix_rule(prefix = "git status", decision = "allow")
prefix_rule(prefix = "git diff", decision = "allow")
prefix_rule(prefix = "git log", decision = "allow")

# 允许构建命令
prefix_rule(prefix = "pnpm build", decision = "allow")
prefix_rule(prefix = "npm run build", decision = "allow")

# 默认策略
default_decision = "prompt"
```

使用方式：

```bash
codex --profile deploy "构建 Docker 镜像并部署到 staging 环境"
```

部署 Profile 的设计哲学是"给了高权限，但用 Rules 在关键路径上设卡"。`sandbox_mode = "full-access"` 和 `approval_mode = "full-auto"` 给了 Codex 执行复杂部署流程的能力，但 Rules 确保它不会误操作生产数据库或 force push 到主分支。

### 组合三：日常开发（宽松 + 基本 Rules）

```toml
# config.toml 中的 dev Profile
[profiles.dev]
model = "o4-mini"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"
web_search = "cached"
developer_instructions = "代码注释使用中文。使用 pnpm 而不是 npm。所有新代码必须有对应的测试用例。"
```

```python
# .codex/rules/profiles/dev.star
# 开发模式下的规则：宽松但拦截致命操作

# 拒绝对 main/master 分支的 push
regex_rule(pattern = r"git\s+push\s+.*(main|master)", decision = "deny")

# 拒绝 force push
regex_rule(pattern = r"git\s+push\s+.*(--force|-f)", decision = "deny")

# 拒绝危险命令
regex_rule(pattern = r"rm\s+.*-rf\s+(/|~|\*)", decision = "deny")
regex_rule(pattern = r"(curl|wget)\s+.*\|\s*(bash|sh|zsh)", decision = "deny")
regex_rule(pattern = r"sudo\s+", decision = "deny")

# 拒绝修改 .env.production
regex_rule(pattern = r".*\.env\.production", decision = "deny")

# 允许日常开发命令
prefix_rule(prefix = "git ", decision = "allow")
prefix_rule(prefix = "pnpm ", decision = "allow")
prefix_rule(prefix = "node ", decision = "allow")
prefix_rule(prefix = "tsc ", decision = "allow")
prefix_rule(prefix = "eslint", decision = "allow")
prefix_rule(prefix = "prettier", decision = "allow")
prefix_rule(prefix = "jest", decision = "allow")
prefix_rule(prefix = "vitest", decision = "allow")
prefix_rule(prefix = "cargo ", decision = "allow")
prefix_rule(prefix = "go ", decision = "allow")
prefix_rule(prefix = "python", decision = "allow")
prefix_rule(prefix = "make", decision = "allow")

# npm publish 需要确认
prefix_rule(prefix = "npm publish", decision = "prompt")
prefix_rule(prefix = "pnpm publish", decision = "prompt")

# 默认策略：未匹配的命令自动执行（开发模式宽松）
default_decision = "allow"
```

使用方式：

```bash
codex --profile dev "修复 src/utils/format.ts 中的类型错误并补充测试"
```

开发 Profile 的设计哲学是"最大效率，最小摩擦"。大多数命令自动放行，只拦截不可逆的致命操作。注意 `default_decision = "allow"` 的使用——这意味着任何未被前述规则匹配的命令都会自动执行。这在受控的开发环境中是合理的，因为你随时可以用 Git 回滚，但不应该在有敏感文件的环境中使用。

### 三种组合的对比

| 维度 | 审查组合 | 部署组合 | 开发组合 |
|------|---------|---------|---------|
| 沙箱级别 | read-only | full-access | workspace-write |
| 审批模式 | suggest | full-auto | auto-edit |
| 默认决策 | prompt | prompt | allow |
| deny 规则数 | 多（拦截一切写入） | 中（拦截生产路径） | 少（只拦截致命操作） |
| 适用环境 | 不信任/生产 | 部署流水线 | 本地开发/受信任 |
| 回退成本 | 无（没改任何东西） | 高（影响线上） | 低（Git 回滚） |
| 推荐模型 | o3-pro | o3 | o4-mini |

---

## 常见模式与反模式

### 模式一：默认 deny，逐步 allow

安全团队推荐的做法是从 `default_decision = "deny"` 开始，然后逐步添加 allow 规则。这样每一条放行的命令都是经过思考的、有记录的。

```python
# 安全优先的规则文件
# 默认拒绝一切，逐步放行

# 拒绝危险命令
regex_rule(pattern = r"rm\s+.*-rf", decision = "deny")
regex_rule(pattern = r"sudo\s+", decision = "deny")
regex_rule(pattern = r"(curl|wget).*\|\s*(bash|sh)", decision = "deny")

# 放行日常命令
prefix_rule(prefix = "git status", decision = "allow")
prefix_rule(prefix = "git diff", decision = "allow")
prefix_rule(prefix = "git log", decision = "allow")
prefix_rule(prefix = "pnpm test", decision = "allow")
prefix_rule(prefix = "pnpm lint", decision = "allow")
prefix_rule(prefix = "pnpm build", decision = "allow")

# 默认拒绝
default_decision = "deny"
```

### 模式二：按文件分组的规则组织

当规则数量增多时，按功能分文件组织可以提高可维护性：

```bash
.codex/rules/
  00-deny.star        # 全局 deny 规则（最先加载）
  10-git.star         # Git 相关规则
  20-build.star       # 构建工具规则
  30-deploy.star      # 部署工具规则
  99-default.star     # 默认策略（最后加载）
```

文件名前缀的数字控制加载顺序。`00-deny.star` 最先加载，确保 deny 规则最先被评估。`99-default.star` 最后加载，定义 default_decision。

### 模式三：团队共享 + 个人扩展

团队共享的基础规则放在项目级 `.codex/rules/` 中，个人偏好规则放在用户级 `~/.codex/rules/` 中。由于用户级规则先加载，个人规则不会覆盖团队规则——团队的 deny 规则不会被个人规则绕过。

但这里有一个设计张力。用户级规则先加载，意味着个人规则会先被评估。如果个人规则中有一条 `prefix_rule(prefix = "git", decision = "allow")`，它会匹配所有 git 命令，团队规则中的 `regex_rule(pattern = r"git\s+push\s+.*main", decision = "deny")` 就永远不会被评估。

这是 Rules 短路评估的一个设计张力。有两种解决方案：

1. **基础规则只定义 deny，个人规则只定义 allow**：明确分工，避免冲突
2. **通过文件命名约定控制评估顺序**：团队 deny 规则放在 `00-deny.star` 中，确保最先加载

方案一更实用。团队规则文件只放 deny 规则，个人规则文件只放 allow 和 prompt 规则。deny 规则的决策更强硬，即使评估顺序靠后，只要命令不匹配 allow 规则，deny 规则仍然会生效。

### 反模式一：过于宽松的 allow 规则

```python
# 危险：允许所有命令
regex_rule(pattern = r".*", decision = "allow")

# 危险：允许所有 git 命令（包括 force push）
prefix_rule(prefix = "git", decision = "allow")

# 危险：允许所有 npm 命令（包括 publish）
prefix_rule(prefix = "npm", decision = "allow")
```

这些规则表面上"方便"，实际上剥夺了 Rules 系统的防御能力。如果所有命令都 allow，Rules 系统形同虚设。正确做法是细化到具体的命令前缀。

### 反模式二：Rules 中的正则表达式过于复杂

```python
# 过于复杂，难以理解和维护
regex_rule(
    pattern = r"^(?!.*(?:sudo|su|root))((?!.*(?:rm\s+-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|rm\s+-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*)).*$(?<!.*--force.*))",
    decision = "allow",
)
```

Starlark Rules 是安全策略，应该让任何团队成员都能理解和审计。复杂的正则表达式既容易出错（边界条件遗漏），也难以审查。如果一条规则需要超过 10 秒来理解其匹配范围，它就是过于复杂了。

更好的做法是把复杂逻辑拆成多条简单规则：

```python
# 清晰，容易理解和审计
regex_rule(pattern = r"sudo\s+", decision = "deny")
regex_rule(pattern = r"rm\s+.*-rf", decision = "deny")
regex_rule(pattern = r".*--force", decision = "deny")
# ... 然后放行安全的命令
```

### 反模式三：Profile 与 Rules 的安全姿态矛盾

```toml
# 反模式：Profile 说只读，Rules 说允许写入
[profiles.audit]
sandbox_mode = "read-only"    # Profile 层面只读
```

```python
# 但 Rules 允许写入命令
prefix_rule(prefix = "pnpm build", decision = "allow")
prefix_rule(prefix = "git commit", decision = "allow")
```

这个组合不会导致安全问题——内核沙箱的 read-only 限制会覆盖 Rules 的 allow 决策。但它会造成混淆：看 Rules 文件的人会以为写入命令可以执行，但实际上会被沙箱拦截。正确做法是让 Profile 和 Rules 传达一致的意图——如果 Profile 是只读的，Rules 也应该 deny 写入命令。

### 反模式四：在 Profile 之间复制粘贴配置

```toml
# 反模式：三个 Profile 重复了大量配置
[profiles.dev]
model = "o4-mini"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"
web_search = "cached"
allowed_domains = ["github.com", "npmjs.com"]    # 重复
allow_localhost = false                            # 重复
allow_private_network = false                      # 重复

[profiles.test]
model = "gpt-5.2-codex"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"
web_search = "cached"
allowed_domains = ["github.com", "npmjs.com"]    # 重复
allow_localhost = false                            # 重复
allow_private_network = false                      # 重复

[profiles.audit]
model = "o3-pro"
sandbox_mode = "read-only"
approval_mode = "suggest"
web_search = "disabled"
allowed_domains = ["github.com", "npmjs.com"]    # 重复
allow_localhost = false                            # 重复
allow_private_network = false                      # 重复
```

Profile 不需要覆盖所有参数。把共享的配置放在全局默认中，每个 Profile 只写差异部分：

```toml
# 全局默认（所有 Profile 共享）
allowed_domains = ["github.com", "npmjs.com"]
allow_localhost = false
allow_private_network = false

[profiles.dev]
model = "o4-mini"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"
web_search = "cached"

[profiles.test]
model = "gpt-5.2-codex"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"
web_search = "cached"

[profiles.audit]
model = "o3-pro"
sandbox_mode = "read-only"
approval_mode = "suggest"
web_search = "disabled"
```

---

## Codex Rules（Starlark）vs Claude Code Hooks（Shell 脚本）

### 设计哲学差异

两者的根本差异在于安全模型的设计哲学。

Codex Rules 走的是**声明式策略引擎**路线。你在 `.star` 文件中声明"什么命令应该被怎样处理"，Starlark 引擎负责匹配和决策。规则文件本身是受限的——不能执行系统命令、不能访问文件系统、不能读写网络。规则文件的能力被严格限制在"评估命令字符串、返回决策"这一个动作上。这种设计的安全假设是：规则文件本身不引入新的攻击面。

Claude Code Hooks 走的是**命令式事件处理**路线。你在 settings.json 中注册 shell 脚本到特定事件（PreToolUse、PostToolUse 等），脚本可以做任何事情——读取环境变量、调用外部 API、修改文件、发送通知。这种设计的安全假设是：用户完全信任自己的 Hook 脚本（因为是自己写的），不需要限制脚本的能力。

### 能力对比

| 维度 | Codex Rules（Starlark） | Claude Code Hooks（Shell） |
|------|------------------------|--------------------------|
| 语言 | Starlark（Python 子集） | 任意 Shell 脚本（bash、python、node 等） |
| 沙箱 | 规则文件在 Starlark 沙箱中执行 | 无沙箱，脚本有完整的系统访问权限 |
| 触发时机 | 仅 shell_command 执行前 | 26 个 Hook 事件（工具调用前后、通知、停止等） |
| 覆盖范围 | 命令执行 | 命令执行 + 文件操作 + 通知 + 会话生命周期 |
| 返回值 | allow / prompt / deny | exit 0（放行）/ exit 2（阻止）/ 其他（报错） |
| 动态决策 | 基于命令字符串的模式匹配 | 可以查询外部 API、读取文件、检查 Git 状态 |
| 状态保持 | 无状态（每次评估独立） | 有状态（脚本可以读写文件、使用环境变量） |
| 可审计性 | 高（声明式规则易于审查） | 低（脚本行为依赖运行时环境） |
| 逃逸风险 | 无（Starlark 受限） | 有（脚本可以做任何事，包括绕过其他 Hook） |
| 配置格式 | `.star` 文件 | settings.json 中的 `hooks` 段 |

### 适用场景分析

**Codex Rules 更适合**：

- 需要可审计的安全策略。团队中的安全审查员可以快速阅读 `.star` 文件并确认策略正确
- 不需要动态决策的命令控制。规则基于命令字符串的静态匹配，不依赖运行时状态
- 多人共享的标准化策略。声明式规则比脚本更容易标准化和复制
- CI/CD 环境中的自动化策略。无状态特性确保每次执行的决策一致

**Claude Code Hooks 更适合**：

- 需要运行时上下文的决策。比如"根据当前 Git 分支决定是否允许 push"、"检查 Jira ticket 状态后再决定是否允许合并"
- 需要外部通知的集成。比如"部署完成后发送 Slack 通知"、"代码审查完成后更新 Jira ticket"
- 需要覆盖更多事件类型的场景。Hooks 可以拦截文件读写、工具调用、会话停止等，不限于命令执行
- 高度定制化的个人工作流。脚本的灵活性允许实现任何你能想到的逻辑

### 实际选型建议

如果你只用 Codex，Rules 是唯一的命令策略机制，没有选择余地。如果你同时使用 Codex 和 Claude Code，不需要在两者之间复制策略——各自用各自的安全机制。Codex 的 Rules 文件不需要同步到 Claude Code 的 settings.json，反过来也一样。

但两者的策略意图应该保持一致。如果你的 Codex Rules 拒绝了 `rm -rf`，你的 Claude Code Hooks 也应该拒绝 `rm -rf`。策略意图的文档化（比如写在 AGENTS.md 或 CLAUDE.md 中）比策略实现的同步更重要。

---

## 完整的项目配置示例

以下是一个中大型项目的完整 Profile + Rules 配置，覆盖四种典型工作流。

### config.toml

```toml
# .codex/config.toml
# 项目：SaaS 平台后端
# 团队：8 人，后端 + DevOps

# ── 全局默认 ──────────────────────────────────────
model = "gpt-5.2-codex"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"
web_search = "cached"

# 安全基线
allowed_domains = ["github.com", "api.github.com", "registry.npmjs.org", "pypi.org"]
allow_localhost = false
allow_private_network = false

# 上下文管理
project_doc_max_bytes = 49152
auto_compact_limit = 100000
developer_instructions = "本项目使用 pnpm。所有新代码必须有对应的测试。修改 API 端点时必须同步更新 OpenAPI schema。"

# ── MCP 服务 ──────────────────────────────────────
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.github]
command = "npx"
args = ["-y", "@anthropic-ai/mcp-github"]

# ── Profile 预设 ──────────────────────────────────

[profiles.dev]
model = "o4-mini"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"
web_search = "cached"

[profiles.test]
model = "gpt-5.2-codex"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"
developer_instructions = "只生成和修改测试文件。不修改源代码。"

[profiles.arch]
model = "o3"
sandbox_mode = "read-only"
approval_mode = "suggest"
web_search = "disabled"
developer_instructions = "只做架构分析和方案建议。不修改任何文件。"

[profiles.audit]
model = "o3-pro"
sandbox_mode = "read-only"
approval_mode = "suggest"
web_search = "disabled"
developer_instructions = "只做安全审计和报告。不修改任何文件。输出格式：按严重程度分类的漏洞报告。"

[profiles.deploy]
model = "o3"
sandbox_mode = "full-access"
approval_mode = "full-auto"
developer_instructions = "只执行部署相关操作。执行前确认目标环境。不允许修改源代码。"
```

### 基础 Rules 文件

```python
# .codex/rules/00-deny.star
# 全局 deny 规则：任何 Profile 都必须遵守

# 拒绝递归删除
regex_rule(pattern = r"rm\s+.*-rf\s+(/|~|\*)", decision = "deny")

# 拒绝远程脚本执行
regex_rule(pattern = r"(curl|wget)\s+.*\|\s*(bash|sh|zsh|fish)", decision = "deny")

# 拒绝 sudo 提权
regex_rule(pattern = r"sudo\s+", decision = "deny")

# 拒绝 fork bomb
regex_rule(pattern = r":\(\)\{\s*:\|:&\s*\};:", decision = "deny")

# 拒绝磁盘操作
prefix_rule(prefix = "mkfs", decision = "deny")
regex_rule(pattern = r"dd\s+if=/dev/(zero|random|urandom)", decision = "deny")

# 拒绝修改受保护文件
regex_rule(pattern = r".*(\.env\.production|\.env\.staging|\.aws/|\.ssh/)", decision = "deny")
```

```python
# .codex/rules/10-git.star
# Git 相关规则

# 拒绝 force push 到任何分支
regex_rule(pattern = r"git\s+push\s+.*(--force|-f)\s", decision = "deny")

# 拒绝 push 到 main/master
regex_rule(pattern = r"git\s+push\s+.*(origin\s+)?(main|master)", decision = "deny")

# 拒绝删除 main/master 分支
regex_rule(
    pattern = r"git\s+(branch\s+-[dD]\s+(main|master)|push\s+.*--delete\s+(main|master))",
    decision = "deny",
)

# git push 到其他分支需要确认
prefix_rule(prefix = "git push", decision = "prompt")

# git 只读命令自动放行
prefix_rule(prefix = "git status", decision = "allow")
prefix_rule(prefix = "git diff", decision = "allow")
prefix_rule(prefix = "git log", decision = "allow")
prefix_rule(prefix = "git show", decision = "allow")
prefix_rule(prefix = "git blame", decision = "allow")
prefix_rule(prefix = "git branch", decision = "allow")
prefix_rule(prefix = "git remote", decision = "allow")
prefix_rule(prefix = "git stash", decision = "allow")

# git 写操作需要确认
prefix_rule(prefix = "git commit", decision = "allow")
prefix_rule(prefix = "git add", decision = "allow")
prefix_rule(prefix = "git checkout", decision = "allow")
prefix_rule(prefix = "git switch", decision = "allow")
prefix_rule(prefix = "git merge", decision = "prompt")
prefix_rule(prefix = "git rebase", decision = "prompt")
prefix_rule(prefix = "git cherry-pick", decision = "prompt")
prefix_rule(prefix = "git reset", decision = "prompt")
```

```python
# .codex/rules/20-build.star
# 构建和测试工具规则

prefix_rule(prefix = "pnpm lint", decision = "allow")
prefix_rule(prefix = "pnpm test", decision = "allow")
prefix_rule(prefix = "pnpm typecheck", decision = "allow")
prefix_rule(prefix = "pnpm build", decision = "allow")
prefix_rule(prefix = "pnpm install", decision = "allow")
prefix_rule(prefix = "pnpm add", decision = "prompt")
prefix_rule(prefix = "pnpm remove", decision = "prompt")
prefix_rule(prefix = "pnpm publish", decision = "prompt")

prefix_rule(prefix = "tsc --noEmit", decision = "allow")
prefix_rule(prefix = "eslint", decision = "allow")
prefix_rule(prefix = "prettier", decision = "allow")
prefix_rule(prefix = "jest", decision = "allow")
prefix_rule(prefix = "vitest", decision = "allow")
```

```python
# .codex/rules/99-default.star
# 默认策略

# 未匹配的命令需要确认
default_decision = "prompt"
```

### Profile 专属 Rules

```python
# .codex/rules/profiles/dev.star
# dev Profile：更宽松的默认策略

# 未匹配的命令允许执行（开发模式）
# 这会覆盖 99-default.star 中的 prompt
default_decision = "allow"
```

```python
# .codex/rules/profiles/deploy.star
# deploy Profile：额外的部署安全规则

# 拒绝直接操作生产环境路径
regex_rule(pattern = r".*(/etc/systemd/|/etc/nginx/|/var/www/production/).*", decision = "deny")

# 部署命令需要确认
prefix_rule(prefix = "docker push", decision = "prompt")
prefix_rule(prefix = "kubectl apply", decision = "prompt")
prefix_rule(prefix = "kubectl delete", decision = "deny")
prefix_rule(prefix = "terraform apply", decision = "prompt")
prefix_rule(prefix = "terraform destroy", decision = "deny")

# 默认需要确认（部署模式不能自动执行未知命令）
default_decision = "prompt"
```

---

## 小结

Profile 和 Rules 是 Codex 工程化安全控制的两个互补层次。

Profile 解决"大图景"问题——不同的任务需要不同的模型能力、不同的沙箱级别、不同的审批策略。通过命名预设，你不需要每次手动调整参数，一个 `--profile` 标志就切换了整个安全姿态。内置的 careful 和 deep-review 覆盖了高风险和深度分析两个极端，自定义 Profile 填补了团队特有的需求空白。

Rules 解决"细颗粒度"问题——在同一个 Profile 内，不同命令需要不同的执行策略。Starlark 作为策略语言的选择是刻意为之的：足够灵活来表达前缀匹配、正则匹配和自定义逻辑，又足够受限来保证规则文件本身不引入安全风险。三种规则类型（prefix_rule、regex_rule、custom）对应三种精度级别，三种决策（allow、prompt、deny）对应三种安全姿态。

两者的组合遵循一个核心原则：Profile 设定安全姿态的上限，Rules 在这个上限内做逐命令的精细控制。Profile 说"这个工作流可以写入"，Rules 说"但不是所有命令都能执行"。Profile 说"这个工作流只读"，Rules 说"而且我要拦截所有写入命令作为双重保险"。这种分层设计不是冗余，而是纵深防御——每一层独立工作，不依赖另一层的正确性。

与 Claude Code Hooks 的对比揭示了一个深层的工程权衡：Codex 选择受限但安全的声明式策略，Claude Code 选择灵活但有风险的命令式脚本。没有对错，只有取舍。如果你需要可审计、可标准化、团队成员都能理解和审查的策略，Starlark Rules 是更好的选择。如果你需要运行时上下文、外部 API 集成和高度定制化的逻辑，Shell Hooks 是更好的选择。两者可以共存，策略意图的一致性比实现的同步更重要。
