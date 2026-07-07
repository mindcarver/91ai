<!--
调研来源（不发布，仅记录）：
1. OpenAI 官方文档 developers.openai.com/codex/exec-policy — Rules 和 execution policy 完整参考
2. OpenAI 官方文档 developers.openai.com/codex/config-reference — requirements.toml 中的 rules.*
3. OpenAI Codex 源码 openai/codex — codex-rs/execpolicy/ 规则引擎实现
版本基准: 2026 年 6 月
-->

# Codex CLI 执行策略 execution_policy：用规则控制 Codex 能跑什么命令

> TL;DR：execution policy（执行策略）是一套命令规则系统，让你精确控制 Codex 在沙箱外可以运行哪些命令。规则写在 `.rules` 文件中，用 Starlark 语法定义命令前缀匹配模式（pattern），每个规则有三种决策：`allow`（自动通过）、`prompt`（每次确认）、`forbidden`（直接拒绝）。优先级是 `forbidden > prompt > allow`。Codex 在处理 `bash -lc "git add . && rm -rf /"` 这类复合命令时会用 tree-sitter 拆分后逐个评估，防止危险命令被夹带。管理员可以在 `requirements.toml` 中强制执行规则。本文覆盖规则语法、匹配机制、拆分逻辑、`codex execpolicy check` 调试命令和实战规则配置。

---

## 1. 执行策略解决什么问题

Codex 默认运行在沙箱里，文件系统的访问受 `sandbox_mode` 控制。但有些命令需要在沙箱外执行——比如 `git push`、`docker build`、`npm publish` 这些操作需要访问外部服务或者修改系统级资源。

当 Codex 需要在沙箱外执行命令时，默认行为取决于 `approval_policy`：
- `untrusted`：每次都问你
- `on-request`：沙箱外的操作问你
- `never`：不问直接执行

问题在于，这个粒度太粗了。你可能想让 `git add` 和 `git commit` 自动通过（因为它们是安全的），但 `git push` 需要确认（因为它会改变远程仓库）。`npm test` 可以自动执行，但 `npm publish` 必须手动确认。

执行策略（execution policy）就是做这种细粒度控制的。它让你按命令前缀定义规则，精确控制哪些命令可以自动执行、哪些需要确认、哪些完全禁止。

## 2. 规则文件基础

### 文件位置

规则文件放在 `rules/` 目录下，文件扩展名为 `.rules`。Codex 在启动时扫描所有活跃配置层的 `rules/` 目录：

```
~/.codex/rules/default.rules         # 用户级规则
<project>/.codex/rules/default.rules  # 项目级规则（需信任）
```

`default.rules` 是默认文件名，你可以创建任意名称的 `.rules` 文件。项目级规则只在项目被标记为 trusted 时才会加载。

### 文件格式

规则文件使用 Starlark 语法（一种类似 Python 的安全子集）。核心函数是 `prefix_rule()`：

```python
# 允许 git add 自动执行
prefix_rule(
    pattern = ["git", "add"],
    decision = "allow",
    justification = "Git add 只修改暂存区，不会影响远程仓库",
    match = [
        "git add .",
        "git add src/main.ts",
        "git add -p",
    ],
    not_match = [
        "git commit -m 'update'",  # 不匹配，pattern 是 git add
    ],
)
```

## 3. prefix_rule() 字段详解

### pattern（必填）

定义命令前缀。每个元素匹配命令的一个参数位置：

```python
# 匹配: gh pr view 7888
# 匹配: gh pr view --repo openai/codex
# 不匹配: gh pr --repo openai/codex view 7888
prefix_rule(
    pattern = ["gh", "pr", "view"],
    decision = "allow",
)
```

每个位置可以是：
- **字符串**：精确匹配，如 `"git"`
- **列表**：多个可选值，如 `["view", "list"]` 表示这个位置匹配 `view` 或 `list`

```python
# 匹配: gh pr view 7888
# 匹配: gh pr list
# 不匹配: gh pr create
prefix_rule(
    pattern = ["gh", "pr", ["view", "list"]],
    decision = "allow",
)
```

### decision（默认 allow）

三种决策：

| 决策 | 行为 | 适用场景 |
|------|------|---------|
| `allow` | 自动执行，不提示 | 安全的只读命令 |
| `prompt` | 每次执行前确认 | 有副作用但可接受的命令 |
| `forbidden` | 直接拒绝，不提示 | 危险或禁止的命令 |

优先级规则：当多个规则匹配同一个命令时，取最严格的决策。`forbidden > prompt > allow`。

### justification（可选）

人类可读的理由。Codex 可能会在审批提示或拒绝消息中显示这个理由：

```python
prefix_rule(
    pattern = ["rm", "-rf"],
    decision = "forbidden",
    justification = "禁止递归强制删除，用 git clean 或手动删除代替",
)
```

### match 和 not_match（可选）

内联的单元测试。`match` 列出应该匹配的命令示例，`not_match` 列出不应该匹配的。Codex 在加载规则时会验证这些示例——如果某个示例的行为和预期不符，规则加载会失败并报告错误。

```python
prefix_rule(
    pattern = ["git", "push"],
    decision = "prompt",
    justification = "推送到远程需要确认",
    match = [
        "git push",
        "git push origin main",
        "git push --force",
    ],
    not_match = [
        "git pull",
        "git commit -m 'update'",
    ],
)
```

## 4. 复合命令的拆分

### bash -lc 的问题

Codex 执行命令时，很多工具调用会包装成 `bash -lc "command1 && command2"` 的形式。比如：

```
["bash", "-lc", "git add . && rm -rf /"]
```

如果只看命令前缀，这是 `["bash", "-lc", ...]`，你的规则可能不会匹配到里面的 `rm -rf /`。

Codex 对这个问题有两种处理方式。

### 可以安全拆分的情况

如果脚本是由以下元素组成的线性链：
- 纯文本命令（没有变量展开、没有 `$FOO`、没有 `*` 通配符）
- 用安全操作符连接（`&&`、`||`、`;`、`|`）

Codex 用 tree-sitter 解析脚本，把它拆分成独立的命令，然后逐个评估规则。

```
"git add . && rm -rf /"
```

拆分为：
1. `["git", "add", "."]` → 匹配你的 allow 规则 → allow
2. `["rm", "-rf", "/"]` → 匹配你的 forbidden 规则 → forbidden

最终结果：**forbidden**。即使 `git add` 是允许的，`rm -rf /` 的 forbidden 决策会阻止整个命令。

### 不能安全拆分的情况

如果脚本包含：
- 重定向（`>`、`>>`、`<`）
- 命令替换（`$(...)`、反引号）
- 环境变量赋值（`FOO=bar`）
- 通配符（`*`、`?`）
- 控制流（`if`、`for`、带赋值的 `&&`）

Codex 不会尝试拆分，而是把整个 `["bash", "-lc", "<完整脚本>"]` 当作一个命令来评估规则。

这意味着如果你的规则没有覆盖 `bash -lc`，这类复合命令可能被放过。建议在规则中覆盖常见的 shell 包装：

```python
# 对 bash -lc 包装的命令，要求确认
prefix_rule(
    pattern = ["bash", ["-lc", "-c"]],
    decision = "prompt",
    justification = "bash -lc 包装的命令需要确认内容",
)
```

## 5. 规则优先级

### 多条规则匹配同一个命令

当一个命令匹配多条规则时，Codex 取最严格的决策：

```
forbidden > prompt > allow
```

例子：

```python
# 规则 1：允许 git 所有操作
prefix_rule(pattern = ["git"], decision = "allow")

# 规则 2：git push 需要确认
prefix_rule(pattern = ["git", "push"], decision = "prompt")

# 规则 3：git push --force 禁止
prefix_rule(pattern = ["git", "push", "--force"], decision = "forbidden")
```

结果：
- `git add .` → allow（只匹配规则 1）
- `git push` → prompt（匹配规则 1 和 2，prompt > allow）
- `git push --force` → forbidden（匹配规则 1、2、3，forbidden 最严格）

### 配置层间的优先级

规则可以从多个配置层加载：

```
requirements.toml  →  用户 config  →  项目 config
（管理员强制）       （用户设置）     （项目设置）
```

管理员在 `requirements.toml` 中设置的规则不能被用户或项目规则覆盖。管理员规则只能有 `prompt` 和 `forbidden` 两种决策（不能 allow）。

## 6. requirements.toml 中的管理员规则

管理员可以在 `requirements.toml` 中强制执行规则：

```toml
[rules]
prefix_rules = [
  { pattern = [{token = "curl"}], decision = "forbidden", justification = "禁止从生产环境下载外部文件" },
  { pattern = [{token = "wget"}], decision = "forbidden", justification = "禁止从生产环境下载外部文件" },
  { pattern = [{token = "aws"}, {token = "s3"}, {any_of = [{token = "rm"}, {token = "delete"}]], decision = "forbidden", justification = "禁止删除 S3 对象" },
]
```

管理员规则的特点：
- 只能是 `prompt` 或 `forbidden`（不能 allow——管理员不应该允许用户本来不能做的事）
- 用户不能通过本地配置覆盖
- `justification` 会显示在拒绝消息中

### pattern 的 TOML 格式

在 TOML 中，pattern 是一个数组，每个元素可以是：
- `{token = "字符串"}`：精确匹配
- `{any_of = [{token = "a"}, {token = "b"}]}`：多个可选值

```toml
# 匹配: docker rm, docker rmi
{ pattern = [{token = "docker"}, {any_of = [{token = "rm"}, {token = "rmi"}]}], decision = "forbidden" }
```

## 7. codex execpolicy check

Codex 提供了命令行工具来测试规则的效果：

```bash
codex execpolicy check --pretty \
  --rules ~/.codex/rules/default.rules \
  -- gh pr view 7888 --json title,body,comments
```

输出：

```json
{
  "decision": "allow",
  "matching_rules": [
    {
      "pattern": ["gh", "pr", "view"],
      "decision": "allow",
      "justification": "查看 PR 是安全的只读操作"
    }
  ]
}
```

### 调试多个规则文件

```bash
codex execpolicy check --pretty \
  --rules ~/.codex/rules/default.rules \
  --rules .codex/rules/project.rules \
  -- docker rm -f $(docker ps -q)
```

`--pretty` 格式化输出，`--rules` 可以指定多个文件，命令放在 `--` 后面。

## 8. 实战规则配置

### 个人开发者的默认规则

```python
# ~/.codex/rules/default.rules

# Git 基础操作：自动通过
prefix_rule(
    pattern = ["git", ["status", "diff", "log", "branch", "show"]],
    decision = "allow",
    justification = "Git 只读操作安全",
)

# Git 写操作：确认
prefix_rule(
    pattern = ["git", ["add", "commit", "stash"]],
    decision = "allow",
    justification = "Git 本地写操作安全",
)

# Git 远程操作：确认
prefix_rule(
    pattern = ["git", "push"],
    decision = "prompt",
    justification = "推送到远程需要确认",
)

# npm/pnpm 基础操作：自动通过
prefix_rule(
    pattern = [["npm", "pnpm"], ["test", "run", "build", "lint"]],
    decision = "allow",
    justification = "包管理器的运行命令安全",
)

# npm publish：禁止
prefix_rule(
    pattern = [["npm", "pnpm"], "publish"],
    decision = "forbidden",
    justification = "发布包需要手动操作",
)
```

### 团队项目的规则

```python
# .codex/rules/default.rules（项目级）

# 项目的 lint 和测试：自动通过
prefix_rule(
    pattern = ["pnpm", ["test", "lint", "typecheck"]],
    decision = "allow",
)

# 数据库迁移：确认
prefix_rule(
    pattern = ["pnpm", "db", ["migrate", "push"]],
    decision = "prompt",
    justification = "数据库操作需要确认",
)

# Docker 操作：确认
prefix_rule(
    pattern = ["docker"],
    decision = "prompt",
    justification = "Docker 操作需要确认",
)
```

### CI/CD 环境的规则

```python
# CI 环境中只允许特定命令
prefix_rule(
    pattern = ["git", ["clone", "checkout", "fetch"]],
    decision = "allow",
)

prefix_rule(
    pattern = ["pnpm", ["install", "test", "build"]],
    decision = "allow",
)

# 其他一切都需要确认
prefix_rule(
    pattern = [["bash", "sh", "zsh"]],
    decision = "prompt",
    justification = "Shell 命令需要确认",
)
```

## 9. 常见问题

### 规则不生效？

检查清单：
1. 文件是否在 `rules/` 目录下，扩展名是否为 `.rules`
2. 项目是否被信任（`projects.<path>.trust_level = "trusted"`）
3. `match` / `not_match` 测试是否通过——如果不通过，规则加载会静默失败
4. 用 `codex execpolicy check` 验证规则是否按预期匹配

### 怎么让 Codex 自动建议规则？

启用 Smart approvals（默认开启）后，当 Codex 在沙箱外执行命令且被审批提示拦截时，它可能自动建议一个 `prefix_rule`。你可以审查并接受建议，Codex 会把它写入 `~/.codex/rules/default.rules`。

### Starlark 是什么？

Starlark 是一种类似 Python 的语言，设计上不允许有副作用（不能访问文件系统、不能执行系统命令）。规则引擎可以在没有安全风险的情况下执行 Starlark 代码。

---

## 延伸阅读

- [第 18 篇：权限与安全命令](18-cmd-permissions.md) — /permissions 和审批策略
- [第 30 篇：审批策略详解](30-approval-policy.md) — approval_policy 的四种模式
- [第 29 篇：沙箱机制全解析](29-sandbox.md) — 沙箱模式和文件系统隔离
- [第 22 篇：配置文件体系总览](22-config-overview.md) — 配置层和优先级
- [OpenAI 官方文档：Rules](https://developers.openai.com/codex/exec-policy) — 官方规则语法参考
