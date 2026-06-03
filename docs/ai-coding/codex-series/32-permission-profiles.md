<!--
调研来源（不发布，仅记录）：
1. Codex 官方文档: Configuration Reference — [permissions] 表、default_permissions、内置 Profile
2. Codex 官方文档: Sandboxing and Security — 权限 Profile 与沙箱模式的关系
3. Codex 开源仓库 openai/codex: codex-rs/config/src/config_toml.rs — PermissionsConfig 结构体
4. 本系列第 27 篇: Profile 配置 — 配置 Profile 和权限 Profile 的区别
5. 本系列第 26 篇: Shell 与沙箱配置 — sandbox_mode 的三种模式
6. 本系列第 30 篇: 审批策略详解 — approval_policy 与权限 Profile 的交互
版本基准: 2026 年 6 月
-->

# Codex CLI 权限 Profile 机制：文件系统与网络访问的精细控制

> TL;DR：`[permissions]` 表是 Codex 权限体系的底层引擎。和 `sandbox_mode` 的三个粗粒度预设不同，权限 Profile 支持按路径、glob 模式、域名、Unix Socket 精细控制 Codex 能读哪些文件、能写哪些目录、能连哪些网络地址。内置三个 Profile（`:read-only`、`:workspace-write`、`:danger-full-access`）对应沙箱模式，自定义 Profile 通过 `extends` 继承后叠加规则。`default_permissions` 设置默认 Profile，`--profile-permissions` 运行时切换。企业环境通过 `requirements.toml` 的 `[filesystem]` 和 `[network]` 约束实现管理员级管控。本文从权限引擎的工作原理讲起，覆盖内置 Profile、自定义语法、文件系统规则、网络策略、继承机制，以及四个实战场景。

---

## 1. 权限 Profile 解决什么问题

`sandbox_mode` 给了你三个选择：`read-only`、`workspace-write`、`danger-full-access`。这三个模式覆盖了最基本的使用场景，但它们是粗粒度的开关。

想象几个 `sandbox_mode` 解决不了的需求：

- "Codex 可以读写工作区，但不能动 `src/config/` 下的配置文件"
- "Codex 可以联网安装依赖，但只能访问 npm registry 和 PyPI，不能访问任意网址"
- "Codex 可以读我 `~/Documents/reference` 下的参考文档，但不能写"
- "Codex 可以连接 Docker daemon，但不能访问其他 Unix Socket"

这些需求涉及的是**差异化访问控制**——同一个维度（文件系统）内，不同路径有不同的权限；同一个维度（网络）内，不同域名有不同的策略。`sandbox_mode` 做不到这种精细控制。

权限 Profile 就是为此设计的。它把 Codex 的文件系统和网络访问控制从一个三选一的开关，升级为一个可编程的规则引擎。

### 和配置 Profile 的区别

本系列第 27 篇讲过配置 Profile（`[profiles]` 表和 `*.config.toml` 文件）。配置 Profile 控制的是"用哪个模型、审批策略多严格"这类偏好的切换。权限 Profile 控制的是更底层的"能读哪些文件、能写哪些目录、能连哪些网络"。

两者可以搭配使用。比如你的配置 Profile 选了 `o3` 模型和 `on-request` 审批策略，你的权限 Profile 限定只能读写 `src/` 目录。两个维度各管各的，互不干扰。

---

## 2. 内置权限 Profile

### 2.1 三个内置选项

Codex 硬编码了三个权限 Profile，名字以冒号开头：

| 内置 Profile | 文件系统 | 网络 | 等价 sandbox_mode |
|---|---|---|---|
| `:read-only` | 全局只读 | 关闭 | `read-only` |
| `:workspace-write` | 工作区可读写，工作区外只读 | 关闭 | `workspace-write` |
| `:danger-full-access` | 全部可读写 | 全部开放 | `danger-full-access` |

冒号前缀是内置 Profile 的标识符，防止和你自定义的 Profile 名称冲突。你自己的 Profile 不能以冒号开头。

### 2.2 使用内置 Profile

在 `config.toml` 的顶层设置 `default_permissions`：

```toml
# ~/.codex/config.toml
default_permissions = ":workspace-write"
```

这行配置的效果等同于 `sandbox_mode = "workspace-write"`。两者独立运作——如果你同时设置了 `default_permissions` 和 `sandbox_mode`，`default_permissions` 优先级更高。

内置 Profile 的一个隐含行为：`:danger-full-access` 模式下，`web_search` 的默认值自动变成 `"live"`。如果你不希望这样，需要显式设置：

```toml
default_permissions = ":danger-full-access"
web_search = "cached"   # 显式覆盖自动行为
```

### 2.3 内置 Profile 的局限

内置 Profile 只有三个，每个都是全有或全无的设计。`:workspace-write` 允许工作区内所有文件的读写，没有办法排除特定子目录。`:danger-full-access` 开放所有网络访问，没有办法限制到特定域名。

对于需要差异化控制的场景，你需要自定义 Profile。

---

## 3. 自定义权限 Profile

### 3.1 基本语法

```toml
# ~/.codex/config.toml
default_permissions = "strict-dev"

[permissions.strict-dev]
description = "工作区可写，网络只允许包管理器"

[permissions.strict-dev.filesystem]
":workspace_roots" = "write"

[permissions.strict-dev.network]
enabled = true
mode = "limited"
domains = {
  "registry.npmjs.org" = "allow"
  "pypi.org" = "allow"
  "files.pythonhosted.org" = "allow"
  "github.com" = "allow"
  "*" = "deny"
}
```

每个权限 Profile 支持的字段：

| 字段 | 类型 | 作用 |
|---|---|---|
| `description` | string | 描述文本，在 `/permissions` 面板里显示 |
| `extends` | string | 父 Profile 名称（不能引用内置 Profile） |
| `filesystem` | table | 文件系统访问规则 |
| `network` | table | 网络访问规则 |
| `workspace_roots` | table | 工作区根路径定义 |

### 3.2 设置默认 Profile

```toml
default_permissions = "strict-dev"
```

`default_permissions` 的值可以是：
- 以冒号开头的内置 Profile 名称（`:read-only`、`:workspace-write`、`:danger-full-access`）
- 你在 `[permissions]` 表下定义的自定义 Profile 名称

每次启动 Codex 时，自动加载 `default_permissions` 指定的 Profile。如果指定了 `--profile-permissions` 标志，运行时覆盖默认值。

```bash
# 使用默认 Profile
codex

# 临时切换到另一个 Profile
codex --profile-permissions opensource-review
```

`--profile-permissions` 只影响本次会话，不影响 `default_permissions` 的值。

---

## 4. 文件系统权限规则

### 4.1 规则格式

文件系统规则在 `[permissions.<name>.filesystem]` 下配置：

```toml
[permissions.dev.filesystem]
":workspace_roots" = "write"
":workspace_roots/src/config" = "read"
":workspace_roots/.env*" = "deny"
"/Users/me/.ssh" = "deny"
"/Users/me/.gnupg" = "deny"
"/etc" = "deny"
```

每条规则的值可以是三种：

- `"read"`：允许读取该路径下的文件，不能写入
- `"write"`：允许读取和写入
- `"deny"`：完全禁止访问，即使其他规则允许

### 4.2 特殊 token

Codex 提供几个特殊 token 用于路径表达：

| Token | 含义 |
|---|---|
| `:workspace_roots` | 当前工作目录（启动 Codex 时所在的目录） |
| `:minimal` | 最小权限——基本等于什么都不让做 |

`:workspace_roots` 后面可以跟子路径：

```toml
[permissions.dev.filesystem]
":workspace_roots" = "write"              # 工作区全部可读写
":workspace_roots/src/config" = "read"    # 但 config 子目录只能读
":workspace_roots/.env*" = "deny"         # .env 文件完全禁止
":workspace_roots/.git" = "deny"          # .git 目录完全禁止
```

`~` 会被展开为当前用户的 home 目录。环境变量 `${HOME}` 也可以使用：

```toml
[permissions.dev.filesystem]
"${HOME}/Documents/reference" = "read"
"${HOME}/projects" = "write"
```

### 4.3 Glob 模式

路径支持 glob 模式匹配：

```toml
[permissions.dev.filesystem]
":workspace_roots/src/**/*.ts" = "write"
":workspace_roots/src/**/*.test.ts" = "read"
":workspace_roots/**/*.env*" = "deny"
":workspace_roots/src/config/**" = "read"
```

规则解释：
- `src/` 下所有 `.ts` 文件可读写
- `src/` 下所有 `.test.ts` 文件只能读（保护测试用例不被随意修改）
- 工作区内所有 `.env*` 文件禁止访问
- `src/config/` 目录只能读（保护配置文件）

Glob 扫描有深度限制 `glob_scan_max_depth`，防止在特别深的目录结构中扫描耗时过长。默认值由 Codex 内部设定，通常不需要调整。

### 4.4 deny 规则的优先级

`deny` 是最高优先级的规则。不管其他规则怎么配置，`deny` 匹配的路径就是不让访问。

```toml
[permissions.dev.filesystem]
":workspace_roots" = "write"           # 工作区全部可读写
"/Users/me/.ssh" = "deny"             # 但 SSH 密钥目录禁止
":workspace_roots/.env*" = "deny"      # .env 文件禁止
```

即使 `:workspace_roots = "write"` 覆盖了 `/Users/me/.ssh`，`deny` 规则仍然生效。这是一种"先放后收"的配置思路——先放开一大片区域，再用 `deny` 精确排除敏感位置。

反过来也可以"先收后放"——默认拒绝，然后逐个允许：

```toml
[permissions.locked-down.filesystem]
":workspace_roots/src" = "read"        # src 只能读
":workspace_roots/tests" = "read"      # tests 只能读
"/tmp" = "write"                       # /tmp 可以写（构建产物）
```

### 4.5 实用的文件系统规则模板

前端项目：

```toml
[permissions.frontend.filesystem]
":workspace_roots" = "write"
":workspace_roots/.env*" = "deny"
":workspace_roots/.git" = "deny"
":workspace_roots/src/config" = "read"
```

后端项目：

```toml
[permissions.backend.filesystem]
":workspace_roots" = "write"
":workspace_roots/.env*" = "deny"
":workspace_roots/.git" = "deny"
":workspace_roots/migrations" = "read"   # migration 文件只能读
"${HOME}/.ssh" = "deny"
"/etc" = "deny"
```

多项目共享目录：

```toml
[permissions.multi-project.filesystem]
"${HOME}/projects/app-a" = "write"
"${HOME}/projects/app-b" = "write"
"${HOME}/projects/shared-libs" = "read"   # 共享库只能读
```

---

## 5. 网络权限规则

### 5.1 基本配置

```toml
[permissions.limited-net.network]
enabled = true
mode = "limited"
domains = { "docs.rs" = "allow", "developer.mozilla.org" = "allow", "*" = "deny" }
```

网络权限有三个核心字段：

| 字段 | 类型 | 默认值 | 作用 |
|---|---|---|---|
| `enabled` | boolean | `false` | 是否允许网络访问 |
| `mode` | `"limited"` / `"full"` | `"limited"` | 网络访问模式 |
| `domains` | map | `{}` | 域名到策略的映射 |

### 5.2 limited vs full 模式

`mode = "limited"`：只能访问 `domains` 里明确 allow 的域名。这是白名单模式——默认全部拒绝，逐个允许。

```toml
[permissions.limited-net.network]
enabled = true
mode = "limited"
domains = {
  "registry.npmjs.org" = "allow"
  "pypi.org" = "allow"
  "github.com" = "allow"
  "docs.python.org" = "allow"
  "*" = "deny"
}
```

`mode = "full"`：所有域名都可以访问，除非被 `domains` 里的 deny 规则排除。这是黑名单模式——默认全部允许，逐个禁止。

```toml
[permissions.mostly-open.network]
enabled = true
mode = "full"
domains = {
  "malware-cdn.example.com" = "deny"
  "suspicious-tracker.net" = "deny"
}
```

安全建议：日常开发用 `mode = "limited"`。只开放你明确需要访问的域名，减少攻击面。`mode = "full"` 只适合测试环境或受控网络环境。

### 5.3 域名匹配规则

`domains` 里的 key 是域名，value 是 `"allow"` 或 `"deny"`。

域名匹配是精确匹配。`api.openai.com = "allow"` 不会覆盖 `cdn.openai.com` 或 `chat.openai.com`。如果你需要 allow 一个域名下的所有子域名，需要逐个写。

`"*" = "deny"` 是一个特殊的兜底规则——匹配所有域名。在 `mode = "limited"` 下通常配合使用，确保未明确 allow 的域名全部拒绝。

### 5.4 Unix Socket 控制

```toml
[permissions.my-net.network]
enabled = true
unix_sockets = {
  "/var/run/docker.sock" = "allow"
  "/tmp/*.sock" = "deny"
}
```

有些服务通过 Unix Socket 通信，比如 Docker daemon（`/var/run/docker.sock`）、PostgreSQL（`/var/run/postgresql/.s.PGSQL.5432`）。

`unix_sockets` 的 key 是 socket 路径（支持 glob），value 是 `allow` 或 `deny`。

一个危险的选项：

```toml
dangerously_allow_all_unix_sockets = true
```

名字里就有 `dangerously`——让所有 Unix Socket 都可以访问。Docker socket 泄漏等于 root 权限泄露，因为通过 Docker socket 可以执行任意命令。

### 5.5 SOCKS5 代理

```toml
[permissions.proxy-net.network]
enabled = true
proxy_url = "http://proxy.example.com:8080"
socks_url = "socks5://127.0.0.1:1080"
enable_socks5 = true
enable_socks5_udp = false
```

| 字段 | 作用 |
|---|---|
| `proxy_url` | HTTP/HTTPS 代理地址 |
| `socks_url` | SOCKS5 代理地址 |
| `enable_socks5` | 是否启用 SOCKS5 |
| `enable_socks5_udp` | 是否允许 SOCKS5 上的 UDP 流量 |
| `allow_local_binding` | 是否允许绑定本地端口 |
| `allow_upstream_proxy` | 是否允许使用上游代理链 |
| `dangerously_allow_non_loopback_proxy` | 允许非 loopback 地址的代理 |

企业环境通常通过代理上网。`socks_url` 指向你本地的代理工具（Clash、V2Ray 等），`proxy_url` 指向公司的 HTTP 代理。

`dangerously_allow_non_loopback_proxy` 允许通过非本地回环地址（公网或内网 IP）的代理发请求。代理被劫持时等于把流量送给第三方。不要随意开启。

### 5.6 实用的网络规则模板

只允许包管理器：

```toml
[permissions.package-only.network]
enabled = true
mode = "limited"
domains = {
  "registry.npmjs.org" = "allow"
  "registry.yarnpkg.com" = "allow"
  "pypi.org" = "allow"
  "files.pythonhosted.org" = "allow"
  "crates.io" = "allow"
  "github.com" = "allow"
  "api.github.com" = "allow"
  "*" = "deny"
}
```

文档查阅 + 包管理器：

```toml
[permissions.doc-search.network]
enabled = true
mode = "limited"
domains = {
  "registry.npmjs.org" = "allow"
  "pypi.org" = "allow"
  "docs.python.org" = "allow"
  "developer.mozilla.org" = "allow"
  "doc.rust-lang.org" = "allow"
  "nextjs.org" = "allow"
  "tailwindcss.com" = "allow"
  "*" = "deny"
}
```

完全离线：

```toml
[permissions.offline.network]
enabled = false
```

---

## 6. extends 继承机制

### 6.1 继承语法

```toml
[permissions.base]
description = "基础权限：只读"

[permissions.base.filesystem]
":workspace_roots" = "read"

[permissions.dev]
description = "开发权限：基于 base，增加写权限"
extends = "base"

[permissions.dev.filesystem]
":workspace_roots" = "write"    # 覆盖父 Profile 的 read
```

`extends` 让子 Profile 继承父 Profile 的所有规则，然后用子 Profile 的规则覆盖。覆盖是字段级别的——你只需要写和父 Profile 不同的部分。

### 6.2 继承的限制

两个重要限制：

1. **不能继承内置 Profile**：`extends` 只能引用自定义 Profile（没有冒号前缀的），不能写 `extends = ":read-only"`。内置 Profile 是代码中硬编码的 Rust 结构体，不在 TOML 配置空间里

2. **循环继承检测**：如果 A extends B，B extends A，Codex 启动时会报错并拒绝加载

```toml
# 错误：循环继承
[permissions.a]
extends = "b"

[permissions.b]
extends = "a"
```

### 6.3 多层继承

```toml
# 第一层：基础只读
[permissions.base-readonly]
description = "基础只读权限"

[permissions.base-readonly.filesystem]
":workspace_roots" = "read"
"${HOME}/Documents/reference" = "read"

# 第二层：只读 + 网络搜索
[permissions.readonly-with-net]
description = "只读 + 有限网络"
extends = "base-readonly"

[permissions.readonly-with-net.network]
enabled = true
mode = "limited"
domains = {
  "docs.python.org" = "allow"
  "developer.mozilla.org" = "allow"
  "*" = "deny"
}

# 第三层：读写 + 网络
[permissions.full-dev]
description = "完整开发权限"
extends = "readonly-with-net"

[permissions.full-dev.filesystem]
":workspace_roots" = "write"   # 覆盖 base 的 read

[permissions.full-dev.network]
mode = "full"                   # 覆盖上一层的 limited
```

最终 `full-dev` 的效果：
- 文件系统：工作区可写（覆盖了 base 的 read），参考文档只读
- 网络：全部开放（覆盖了 readonly-with-net 的 limited）

继承链最多几层没有硬性限制，但超过三层后可读性会变差。建议控制在 2-3 层。

---

## 7. workspace_roots 定义

### 7.1 顶级 workspace_roots

```toml
[permissions.multi-project]
description = "多项目权限"

[permissions.multi-project.workspace_roots]
"/Users/me/projects/app-a" = true
"/Users/me/projects/app-b" = true
"/Users/me/projects/archive" = false
```

这个 `workspace_roots` 定义在权限 Profile 顶层（不在 `filesystem` 子表里）。它是一个 `map<string, boolean>`，控制哪些路径可以被识别为工作区根。

当你用这个权限 Profile 启动 Codex 时，只有标为 `true` 的路径会被视为有效工作区。标为 `false` 或不在表里的路径会被拒绝。

这在多项目开发场景下有用——你维护三个项目，每个项目有不同的安全要求。通过不同的 Profile 定义不同的 `workspace_roots`，确保 Codex 在每个环境下只能操作对应的目录。

### 7.2 filesystem 中的 :workspace_roots token

上一节提到的 `:workspace_roots` 是 `filesystem` 子表里的特殊 token，代表当前工作目录。两者的区别：

| 位置 | 含义 |
|---|---|
| `[permissions.<name>.filesystem]` 中的 `:workspace_roots` | 当前工作目录路径，用于构建文件系统规则 |
| `[permissions.<name>.workspace_roots]` 顶级表 | 定义哪些路径可以被视为工作区根 |

---

## 8. 实战场景

### 场景一：开发 / 审查 / 上线三套权限

```toml
# ~/.codex/config.toml
default_permissions = "dev"

[permissions.dev]
description = "日常开发：工作区读写，包管理器网络"

[permissions.dev.filesystem]
":workspace_roots" = "write"
":workspace_roots/.env*" = "deny"
":workspace_roots/.git" = "deny"

[permissions.dev.network]
enabled = true
mode = "limited"
domains = {
  "registry.npmjs.org" = "allow"
  "pypi.org" = "allow"
  "github.com" = "allow"
  "*" = "deny"
}

[permissions.review]
description = "代码审查：只读，允许查文档"

[permissions.review.filesystem]
":workspace_roots" = "read"

[permissions.review.network]
enabled = true
mode = "limited"
domains = {
  "docs.python.org" = "allow"
  "developer.mozilla.org" = "allow"
  "github.com" = "allow"
  "*" = "deny"
}

[permissions.prod-check]
description = "生产环境检查：只读，断网"

[permissions.prod-check.filesystem]
":workspace_roots" = "read"
"/etc" = "deny"

[permissions.prod-check.network]
enabled = false
```

使用方式：

```bash
# 日常开发
codex

# 审查别人的 PR
codex --profile-permissions review "帮我看看这个 PR 的改动"

# 检查生产环境配置（只看不改）
codex --profile-permissions prod-check "检查 nginx.conf 有没有安全问题"
```

### 场景二：开源项目审查专用 Profile

```toml
[permissions.opensource.filesystem]
"${HOME}/projects/oss" = "read"
"${HOME}/projects/oss/*/node_modules" = "deny"

[permissions.opensource.network]
enabled = true
mode = "limited"
domains = {
  "github.com" = "allow"
  "docs.rs" = "allow"
  "crates.io" = "allow"
  "developer.mozilla.org" = "allow"
  "stackoverflow.com" = "allow"
  "*" = "deny"
}
```

特点：文件系统完全只读（防止 Codex 修改你不熟悉的代码），网络允许查文档和访问 GitHub（帮助你理解项目上下文），但禁止访问任意网址。

### 场景三：企业环境下的管理员约束

```toml
# /etc/codex/requirements.toml（系统级，管理员配置）

[filesystem]
read = ["${HOME}/projects/*"]
write = ["${HOME}/projects/*"]
"/etc" = "deny"
"~/.ssh" = "deny"

[network]
mode = "allow"
domains = {
  "registry.npmjs.org" = "allow"
  "pypi.org" = "allow"
  "api.internal.company.com" = "allow"
  "*" = "deny"
}
```

这个配置的效果：
- 所有开发者只能读写自己 `projects/` 目录下的文件
- 不能访问系统配置和 SSH 密钥
- 网络只允许包管理器和公司内部 API
- 管理员的约束优先级高于个人配置，无法绕过

---

## 9. 常见问题

### default_permissions 和 sandbox_mode 同时设置怎么办

`default_permissions` 优先级更高。如果两个都设置了，`sandbox_mode` 的值会被忽略。建议二选一，不要同时使用。

### extends 引用内置 Profile 报错

`extends` 不能引用以冒号开头的内置 Profile。内置 Profile 是硬编码的 Rust 结构体，不在 TOML 配置空间里。`extends` 只能引用你在 `[permissions]` 表下定义的其他自定义 Profile。

### 规则不生效

检查配置加载顺序：`guardian_policy_config` > `requirements.toml` > Profile 文件 > `config.toml`。如果某个约束层覆盖了你的规则，你在 Profile 里配的规则不会生效。

### 域名匹配不到

域名匹配是精确匹配，不支持通配符（除了 `*` 兜底）。`api.openai.com = "allow"` 不会覆盖 `cdn.openai.com`。需要 allow 的子域名要逐个写。

---

## 10. 下一步

本篇覆盖了 Codex CLI 权限 Profile 的完整机制。从内置的三个 Profile 到自定义语法，从文件系统路径规则（精确路径、glob、deny 优先级）到网络域名策略（limited/full 模式、Unix Socket、SOCKS5 代理），从 `extends` 继承链到 `workspace_roots` 定义，再到企业级的 `requirements.toml` 管理员约束。

**下一篇（第 33 篇）**将讨论网络安全与隔离——Codex 的网络访问路径、搜索工具的网络通道与沙箱网络的分离、Cyber Safety 特性、以及网络隔离的最佳实践。

---

**延伸阅读**

- [Codex 官方文档 - Sandboxing and Security](https://developers.openai.com/codex/sandboxing-security) — 权限 Profile 与沙箱模式的官方说明
- [Codex 官方文档 - Configuration Reference](https://developers.openai.com/codex/config-reference) — [permissions] 表完整字段参考
- [Codex 开源仓库 - PermissionsConfig](https://github.com/openai/codex/blob/main/codex-rs/config/src/config_toml.rs) — 权限配置的源码结构
- 本系列第 27 篇 [Profile 配置](./27-config-profiles.md) — 配置 Profile 和权限 Profile 的区别
- 本系列第 26 篇 [Shell 与沙箱配置](./26-shell-and-sandbox-config.md) — sandbox_mode 三种模式
- 本系列第 30 篇 [审批策略详解](./30-approval-policy.md) — approval_policy 与权限 Profile 的交互

---

*本文基于 Codex CLI 源码（`PermissionsConfig` 结构体）和 2026 年 6 月的官方文档撰写。Codex 版本更新频繁，部分配置项和默认行为可能在未来版本中变更。*
