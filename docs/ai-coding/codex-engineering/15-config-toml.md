# config.toml：Codex 的项目级配置中心

**TL;DR：** config.toml 是 Codex 运行时的行为控制中枢，用 TOML 格式定义模型选择、搜索策略、MCP 服务接入、沙箱隔离等所有核心参数。它遵循五级分层加载——从系统级到当前工作目录，越靠近 CWD 优先级越高。理解这套配置体系，意味着你能精确控制 Codex 在每个项目中"能做什么、怎么做、做到什么程度"，而不是在默认值下盲跑。本文覆盖全部已知配置键、MCP 接入方法、团队共享策略、模型切换机制，以及与 Claude Code 的 settings.json 体系对比。

---

## config.toml 的定位

Codex 的 config.toml 不是可选的辅助文件，而是运行时的行为蓝图。它决定了四个核心维度：

1. **模型选择**：Codex 用哪个模型来推理和生成
2. **工具能力**：搜索、MCP 服务、沙箱等工具的开关和参数
3. **上下文管理**：项目文档的大小限制、备选文件名、压缩阈值
4. **行为约束**：开发者指令、自动审批策略、网络访问范围

没有 config.toml，Codex 也能运行——它会使用内置的默认值。但默认值是为通用场景设计的，不会照顾你项目的特殊情况。如果你的团队用 pnpm 而不是 npm，如果你的项目需要访问内网 Figma MCP，如果你的上下文经常在大型任务中溢出——这些都需要通过 config.toml 来定制。

TOML 格式的选择是有意为之的。相比 JSON，TOML 支持注释、更易读、更适合手工编辑。相比 YAML，TOML 没有缩进敏感的解析陷阱，不会因为一个空格导致整个配置失效。对于一个需要开发者频繁手动调整的配置文件，TOML 是在可读性和安全性之间的最佳平衡。

配置文件的物理位置是 `.codex/` 目录下。这个目录可以在仓库根目录，也可以在任意子目录，还可以在用户主目录甚至系统级目录。下一节详细说明。

---

## 分层配置加载顺序

Codex 在启动时按以下顺序查找并加载 config.toml 文件：

```
1. CWD/.codex/config.toml              ← 当前工作目录（最高优先级）
2. CWD/../.codex/config.toml           ← 父目录
3. CWD/../.. /.codex/config.toml       ← 祖父目录（继续向上）
4. 仓库根/.codex/config.toml           ← 项目级
5. ~/.codex/config.toml                ← 用户级全局
6. /etc/codex/config.toml              ← 系统级全局（最低优先级）
```

加载规则是：所有层级的配置都会被读取，但当同一个键出现冲突时，更靠近 CWD 的值覆盖更远的值。这意味着你不需要在每个层级重复所有配置——只要写差异部分。

### 各层级的设计意图

**系统级（/etc/codex/config.toml）** 由系统管理员设置，定义组织级的安全策略和默认行为。这个层级通常包含：

```toml
# /etc/codex/config.toml —— 组织级策略

# 强制使用企业认证的模型端点
model = "gpt-5.2-codex"

# 禁止实时搜索（防止数据外泄到外部搜索引擎）
web_search = "disabled"

# 限制上下文压缩阈值，避免长会话中的信息丢失
auto_compact_limit = 80000
```

系统级配置对所有用户的所有项目生效。普通开发者通常没有权限修改这个文件，这是企业安全团队的控制点。

**用户级（~/.codex/config.toml）** 定义个人偏好。这个层级不纳入版本控制，每个开发者独立维护：

```toml
# ~/.codex/config.toml —— 个人偏好

# 日常用轻量模型，性价比高
model = "o4-mini"

# 允许缓存搜索，加速重复查询
web_search = "cached"

# 个人全局的开发者指令
developer_instructions = "代码注释使用中文"
```

**项目级（仓库根/.codex/config.toml）** 定义团队共享的项目配置。这个层级纳入版本控制，所有团队成员共享同一份配置：

```toml
# .codex/config.toml —— 项目级配置

# 这个项目需要更强的推理模型
model = "gpt-5.2-codex"

# 项目特有的文档大小限制
project_doc_max_bytes = 49152

# 团队统一的项目文档备选文件名
project_doc_fallback_filenames = ["CONTRIBUTING.md", "TEAM_GUIDE.md"]
```

**子目录级（CWD 或父目录/.codex/config.toml）** 用于在 monorepo 或大型项目中为不同模块提供差异化配置：

```toml
# frontend/.codex/config.toml —— 前端模块配置

# 前端开发用轻量模型即可
model = "o4-mini"

# 前端模块的文档大小更小
project_doc_max_bytes = 16384
```

### 加载示例

假设目录结构如下：

```
/home/user/
  .codex/config.toml                    ← 用户级（model = "o4-mini"）
  projects/
    my-app/
      .codex/config.toml                ← 项目级（model = "gpt-5.2-codex"）
      frontend/
        .codex/config.toml              ← 子目录级（web_search = "disabled"）
        src/
          components/                   ← CWD 在这里
```

当你在 `components/` 目录下启动 Codex 时，它加载的配置经过以下合并：

1. `/home/user/projects/my-app/frontend/src/components/.codex/config.toml` — 不存在，跳过
2. `/home/user/projects/my-app/frontend/src/.codex/config.toml` — 不存在，跳过
3. `/home/user/projects/my-app/frontend/.codex/config.toml` — 存在，加载 `web_search = "disabled"`
4. `/home/user/projects/my-app/.codex/config.toml` — 存在，加载 `model = "gpt-5.2-codex"`
5. `/home/user/.codex/config.toml` — 存在，加载 `model = "o4-mini"`（被第 4 层覆盖）

最终生效的配置：`model = "gpt-5.2-codex"`，`web_search = "disabled"`。

---

## 已知配置键详解

### 完整配置键参考表

| Key | 类型 | 可选值 | 默认值 | 描述 |
|-----|------|--------|--------|------|
| `model` | string | 任何模型名 | `gpt-5.2-codex` | 默认使用的模型 |
| `project_doc_fallback_filenames` | string[] | 任意文件名数组 | `[]` | AGENTS.md 的备选文件名 |
| `project_doc_max_bytes` | integer | 正整数 | `32768` | AGENTS.md 单文件大小上限（字节） |
| `web_search` | string | `"cached"` / `"live"` / `"disabled"` | `"cached"` | 搜索模式 |
| `developer_instructions` | string | 任意文本 | （空） | 系统级开发者指令 |
| `auto_compact_limit` | integer | 正整数 | （模型相关） | 上下文自动压缩的 token 阈值 |
| `sandbox_mode` | string | `"read-only"` / `"workspace-write"` / `"full-access"` | `"workspace-write"` | 沙箱隔离级别 |
| `approval_mode` | string | `"suggest"` / `"auto-edit"` / `"full-auto"` | `"auto-edit"` | 审批模式 |
| `allowed_domains` | string[] | 域名数组 | （空=允许所有） | 允许访问的域名白名单 |
| `allow_localhost` | boolean | `true` / `false` | `false` | 是否允许访问 localhost |
| `allow_private_network` | boolean | `true` / `false` | `false` | 是否允许访问私有网络 |

### model：模型选择

`model` 是最直接影响 Codex 能力和成本的配置项。不同模型在推理深度、代码生成质量、响应速度和价格上差异很大。

```toml
# 高性价比：日常开发
model = "o4-mini"

# 标准能力：通用任务
model = "gpt-5.2-codex"

# 深度推理：复杂架构设计和调试
model = "o3"

# 最强推理：关键决策和安全审计
model = "o3-pro"
```

模型选择不是"越强越好"。更强的模型更慢、更贵，对于日常的 lint 修复、测试补全等简单任务，`o4-mini` 的性价比远高于 `o3`。工程化的做法是：项目级配置设一个合理的默认值（通常是 `gpt-5.2-codex` 或 `o4-mini`），然后通过 Profile 为特定任务配置更强的模型。

### project_doc_fallback_filenames：文档备选文件名

Codex 默认查找 `AGENTS.md` 作为项目上下文文档。但如果你的团队已经在使用其他名称的开发指南文件，不需要重命名——通过这个配置项让 Codex 识别备选文件名。

```toml
# Codex 在每个目录会按以下顺序查找：
# 1. AGENTS.md（首选，硬编码）
# 2. CONTRIBUTING.md（第一个备选）
# 3. TEAM_GUIDE.md（第二个备选）
# 找到一个就停止，不会叠加
project_doc_fallback_filenames = ["CONTRIBUTING.md", "TEAM_GUIDE.md"]
```

这个配置只对主文档文件名生效，不影响 `AGENTS.override.md` 的行为。

### project_doc_max_bytes：文档大小限制

控制单个 AGENTS.md 文件的最大字节数。超过这个限制的文件会被**静默忽略**——不报错，不警告，但内容不加载到上下文中。

```toml
# 默认 32 KiB
project_doc_max_bytes = 32768

# 大型项目可以适当放宽到 48 KiB
# 但不要超过 64 KiB，否则会挤占模型的推理空间
project_doc_max_bytes = 49152
```

这是一个隐蔽的失败模式。你写了 500 行 AGENTS.md，超过了 32 KiB，Codex 好像完全无视了你的规则，但没有任何错误提示。诊断方法：

```bash
# 检查文件大小
wc -c AGENTS.md

# 如果超过 project_doc_max_bytes 的值，文件不会被加载
# 解决方案：要么增大配置值，要么精简文件内容
```

### web_search：搜索模式

控制 Codex 是否以及如何使用网络搜索能力。

```toml
# cached：使用缓存的搜索结果，速度更快，不产生额外搜索请求
# 适合大多数场景，尤其是重复查询
web_search = "cached"

# live：每次搜索都发起新的网络请求
# 获取最新信息，但速度更慢、成本更高
web_search = "live"

# disabled：完全禁用搜索
# 适合离线环境或安全要求严格的场景
web_search = "disabled"
```

`cached` 模式的搜索结果来自预构建的索引或缓存层，不保证是最新信息。如果你需要 Codex 查询最新的 API 文档或最近的库更新，应该用 `live` 模式。如果项目处于内网隔离环境，或者你不希望任何代码片段通过搜索请求泄露到外部，用 `disabled`。

### developer_instructions：系统级开发者指令

这是一个字符串类型的配置项，其内容会被注入到 Codex 的系统提示中，作为全局的开发者指令生效。它的影响范围比 AGENTS.md 更广——AGENTS.md 是项目级的上下文，而 `developer_instructions` 是系统级的元指令。

```toml
# 用户级 ~/.codex/config.toml
developer_instructions = "所有代码注释使用中文。Git commit message 使用英文。变量命名遵循项目既有风格。"

# 项目级 .codex/config.toml
developer_instructions = "本项目使用 pnpm，禁止使用 npm 或 yarn。所有新代码必须有对应的测试用例。"
```

关键区分：`developer_instructions` 和 AGENTS.md 的定位不同。AGENTS.md 是项目知识（技术栈、架构、命令），`developer_instructions` 是行为约束（该做什么、不该做什么）。前者告诉模型"项目是什么"，后者告诉模型"你应该怎么工作"。

在实际使用中，建议把不变的个人偏好放在用户级的 `developer_instructions` 中，把项目特有的行为约束放在项目级的 `developer_instructions` 中。两者不冲突时会叠加生效。

### auto_compact_limit：上下文压缩阈值

Codex 在长会话中会自动压缩上下文，避免超出模型的 token 限制。`auto_compact_limit` 控制何时触发压缩——当上下文的 token 数达到这个阈值时，Codex 自动对历史消息进行摘要和压缩。

```toml
# 默认值取决于模型，通常在 80000-120000 之间
# 可以手动调低以更早触发压缩（牺牲信息完整度换更长会话）
auto_compact_limit = 60000

# 或者调高以保留更多上下文（适合需要精确跟踪长对话历史的场景）
auto_compact_limit = 100000
```

压缩是不可逆的。一旦触发，被压缩的消息细节会丢失，只保留摘要。如果你发现 Codex 在长会话的后半段"忘记"了前半段的指令或约定，很可能是压缩导致的。解决方案：

1. 调高 `auto_compact_limit`，延缓压缩触发
2. 把关键规则放在 AGENTS.md 中（不会被压缩，每次都加载）
3. 把重要约定放在 `developer_instructions` 中（作为系统级指令，优先级更高）

---

## MCP 服务配置

MCP（Model Context Protocol）是 Codex 扩展能力的标准接口。通过 MCP，Codex 可以接入外部工具和服务——从文档查询到设计工具，从数据库到内部 API。所有 MCP 服务都在 config.toml 的 `[mcp_servers]` 段落中配置。

### 本地命令型 MCP

对于通过本地命令启动的 MCP 服务，使用 `command` 和 `args` 字段：

```toml
# Context7：查询库和框架的官方文档
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

# 文件系统：受限的文件系统访问
[mcp_servers.filesystem]
command = "npx"
args = ["-y", "@anthropic-ai/mcp-filesystem", "/home/user/projects/my-app/src"]

# GitHub：仓库操作（issue、PR、代码搜索）
[mcp_servers.github]
command = "npx"
args = ["-y", "@anthropic-ai/mcp-github"]
# 环境变量传递
env = { GITHUB_TOKEN = "" }  # 从运行时环境读取 GITHUB_TOKEN
```

`command` 指定可执行文件的名称，`args` 是传给这个命令的参数列表。Codex 启动时会执行这些命令来初始化 MCP 服务。

### 远程 URL 型 MCP

对于通过 HTTP 端点提供服务的 MCP，使用 `url` 字段：

```toml
# Figma：设计稿查询
[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
bearer_token_env_var = "FIGMA_OAUTH_TOKEN"

# 内部 API 文档服务
[mcp_servers.api-docs]
url = "https://internal.company.com/mcp/api-docs"
bearer_token_env_var = "INTERNAL_API_TOKEN"
```

`bearer_token_env_var` 指定存储认证 token 的环境变量名。Codex 会从进程环境变量中读取这个值，附加到 MCP 请求的 Authorization header 中。token 本身不写在 config.toml 里，避免密钥泄露。

### MCP 配置的分层和共享

MCP 配置同样遵循分层加载。这意味着你可以在用户级配置个人常用的 MCP 服务，在项目级配置团队共享的 MCP 服务：

```toml
# ~/.codex/config.toml —— 个人 MCP
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

# .codex/config.toml —— 项目 MCP
[mcp_servers.figma]
url = "https://mcp.figma.com/mcp"
bearer_token_env_var = "FIGMA_OAUTH_TOKEN"

[mcp_servers.api-docs]
url = "https://internal.company.com/mcp/api-docs"
bearer_token_env_var = "INTERNAL_API_TOKEN"
```

当两个层级定义了同名的 MCP 服务时，项目级的定义覆盖用户级的。这允许项目用不同版本或不同配置的同名服务。

### MCP 排错

MCP 服务启动失败不会阻止 Codex 运行，但会导致该服务提供的工具不可用。排查步骤：

```bash
# 手动测试 MCP 服务是否可以启动
npx -y @upstash/context7-mcp
# 如果命令报错，说明依赖安装有问题

# 检查环境变量是否设置
echo $FIGMA_OAUTH_TOKEN
# 如果为空，MCP 认证会失败

# 检查网络连通性（对远程 MCP）
curl -I https://mcp.figma.com/mcp
# 如果连接失败，检查网络和代理配置
```

---

## 团队共享配置

config.toml 最大的工程价值在于团队共享。一个配置正确的 `.codex/` 目录可以让新加入的团队成员零配置上手——Codex 的行为在所有人的机器上一致。

### .codex/ 目录结构

```
.codex/
  config.toml           ← 团队统一的配置
  AGENTS.md             ← 团队统一的项目上下文（也可以在仓库根）
  skills/               ← 团队共享的技能文件
    create-api-endpoint.md
    write-component-test.md
  requirements.toml     ← Admin 强制约束（如果启用）
```

### 纳入版本控制

`.codex/` 目录应该提交到 Git。这是团队共享配置的前提。但要注意排除敏感信息：

```bash
# .gitignore 中不要忽略 .codex/
# .codex/ 应该被提交

# 但要忽略可能包含本地覆盖的文件
.codex/config.local.toml
AGENTS.override.md
```

### requirements.toml：Admin 强制约束

在团队环境中，管理员可以通过 `requirements.toml` 定义强制约束。这些约束不能被用户级或项目级配置覆盖，确保了组织级策略的强制执行。

```toml
# .codex/requirements.toml

# 强制沙箱模式，不允许用户覆盖
sandbox_mode = "workspace-write"

# 强制审批模式
approval_mode = "auto-edit"

# 禁止实时搜索
web_search = "disabled"

# 强制使用企业模型端点
model = "gpt-5.2-codex-enterprise"
```

`requirements.toml` 的优先级高于所有层级的 `config.toml`。如果 `requirements.toml` 中定义了某个键，那么无论 `config.toml` 怎么设置，最终生效的都是 `requirements.toml` 的值。这是企业环境中安全合规的关键机制。

### 团队配置最佳实践

**分层原则**：团队共享的配置放 `.codex/config.toml`，个人偏好放 `~/.codex/config.toml`，临时覆盖用 `AGENTS.override.md`。每层只管自己该管的事。

**最小配置**：团队配置只写必要的项。不要把所有可配置项都写进去——没写的会用默认值，默认值通常是合理的。一个 10 行的 config.toml 比一个 50 行的更容易维护。

**注释清楚**：每个非显而易见的配置项都应该有注释说明为什么这样设置。

```toml
# .codex/config.toml —— 团队共享配置

# 使用标准 Codex 模型，平衡速度和质量
model = "gpt-5.2-codex"

# 禁用实时搜索，防止代码片段泄露到外部搜索引擎
web_search = "cached"

# 项目使用 CONTRIBUTING.md 作为开发指南
project_doc_fallback_filenames = ["CONTRIBUTING.md"]

# 上下文压缩阈值设为 80K，适合本项目的典型会话长度
auto_compact_limit = 80000
```

---

## 模型切换

模型选择不是一个一次性的决策。不同任务需要不同能力等级的模型，同一个项目中你可能需要在多个模型之间切换。Codex 提供了三个层级的模型切换机制。

### config.toml 中设置默认模型

```toml
# 项目级默认模型
model = "gpt-5.2-codex"
```

这是最基础的设置。所有 Codex 会话默认使用这个模型，除非被其他机制覆盖。

### CLI 参数覆盖

```bash
# 单次会话使用不同模型
codex --model o3 "分析这个模块的架构问题"

# 使用更强的模型处理复杂任务
codex --model o3-pro "审查安全相关的认证逻辑"
```

CLI 的 `--model` 参数优先级高于所有 config.toml 配置。它只影响当前会话，不会修改任何配置文件。

### 会话中切换

在交互式会话中，可以通过 `/model` 命令实时切换模型：

```
> /model o3
Switched to model: o3

> 分析这个函数的性能瓶颈
[o3 开始分析...]

> /model o4-mini
Switched to model: o4-mini

> 给这个函数写单元测试
[o4-mini 开始生成测试...]
```

会话中切换模型适用于同一个任务的不同阶段。比如，先用强模型做架构分析和方案设计，再用轻量模型做具体的代码生成和测试编写。这种策略在成本和质量之间取得了平衡。

### Profile 配置预设模型

更系统化的做法是通过 Profile 为不同工作流预设不同的模型：

```toml
# 日常开发：轻量模型
[profiles.dev]
model = "o4-mini"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"

# 架构设计：深度推理模型
[profiles.arch]
model = "o3"
sandbox_mode = "read-only"
web_search = "disabled"

# 安全审计：最强模型
[profiles.security]
model = "o3-pro"
sandbox_mode = "read-only"
web_search = "disabled"
developer_instructions = "Focus on security vulnerabilities. Never modify any file."
```

通过命令行切换 Profile：

```bash
codex --profile dev "修复 lint 错误"
codex --profile arch "设计新的认证模块"
codex --profile security "审计所有 SQL 查询是否有注入风险"
```

---

## 完整的项目级 config.toml 示例

以下是一个面向中大型项目的完整 config.toml 示例。每个配置项都有注释说明其设置理由。

```toml
# .codex/config.toml
# 项目：my-saas-app
# 团队：后端 + 前端，6 人
# 维护者：技术负责人

## ── 模型 ──────────────────────────────────────

# 默认使用标准 Codex 模型
# 日常开发足够，复杂任务通过 Profile 或 CLI 参数切换
model = "gpt-5.2-codex"

## ── 项目文档 ──────────────────────────────────

# 项目已有 CONTRIBUTING.md，让 Codex 也读取它
project_doc_fallback_filenames = ["CONTRIBUTING.md", "TEAM_GUIDE.md"]

# 项目文档较大，放宽到 48 KiB
# 但仍建议每个 AGENTS.md 控制在 100 行以内
project_doc_max_bytes = 49152

## ── 搜索 ──────────────────────────────────────

# 使用缓存搜索，避免代码片段通过搜索请求泄露
# 如需最新信息（如查询新 API），通过 CLI 参数临时启用 live 模式
web_search = "cached"

## ── 上下文管理 ────────────────────────────────

# 项目的典型任务涉及多文件修改，会话较长
# 设置较高的压缩阈值，避免关键上下文被过早压缩
auto_compact_limit = 100000

## ── 安全 ──────────────────────────────────────

# 日常开发使用 workspace-write 沙箱
# 只允许写入当前工作目录
sandbox_mode = "workspace-write"

# 自动编辑模式：文件修改自动应用，命令执行需要确认
approval_mode = "auto-edit"

## ── 网络 ──────────────────────────────────────

# 允许访问的域名白名单
allowed_domains = [
    "github.com",
    "api.github.com",
    "npmjs.com",
    "registry.npmjs.org",
    "pypi.org"
]

# 禁止访问 localhost（本地可能有数据库和管理工具）
allow_localhost = false

# 禁止访问私有网络
allow_private_network = false

## ── 开发者指令 ────────────────────────────────

developer_instructions = """
本项目使用 pnpm，禁止使用 npm 或 yarn。
所有新代码必须有对应的测试用例。
修改 API 端点时必须同步更新 OpenAPI schema。
不要修改 .env 文件。
"""

## ── MCP 服务 ──────────────────────────────────

# Context7：查询库和框架的官方文档
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]

# GitHub：仓库操作
[mcp_servers.github]
command = "npx"
args = ["-y", "@anthropic-ai/mcp-github"]

## ── Profile 预设 ──────────────────────────────

# 日常开发
[profiles.dev]
model = "o4-mini"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"
web_search = "cached"

# 架构设计
[profiles.arch]
model = "o3"
sandbox_mode = "read-only"
web_search = "disabled"

# 安全审计
[profiles.audit]
model = "o3-pro"
sandbox_mode = "read-only"
web_search = "disabled"
developer_instructions = "只做分析和报告，不修改任何文件。"

# 测试生成
[profiles.test]
model = "gpt-5.2-codex"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"
developer_instructions = "只生成测试代码，不修改源代码。"
```

---

## 与 Claude Code 的 settings.json 对比

Codex 用 config.toml，Claude Code 用 settings.json。两者都是项目级配置中心，但设计哲学和实现细节有显著差异。

### 格式和可读性

| 维度 | Codex config.toml | Claude Code settings.json |
|------|-------------------|--------------------------|
| 格式 | TOML | JSON |
| 注释 | 原生支持 `#` 注释 | 不支持注释 |
| 可读性 | 高，专为手工编辑设计 | 中，需要严格 JSON 语法 |
| 编辑工具 | 任何文本编辑器 | 需要 JSON 感知的编辑器 |

TOML 的注释支持是一个实际优势。团队配置中每个非显而易见的设置都应该有注释说明理由，JSON 做不到这一点。你需要在 JSON 外部维护一份说明文档，或者依赖 Git commit message 来解释配置意图。

### 配置层级

| 维度 | Codex | Claude Code |
|------|-------|-------------|
| 层级数 | 五级（CWD → 父目录 → 仓库根 → 用户级 → 系统级） | 三级（项目 → 用户 → .claude/rules/） |
| 继承方向 | 从内到外，子覆盖父 | 从外到内，项目为基准 |
| 子目录配置 | 每个目录都可以有独立的 config.toml | 子目录不支持独立的 settings.json |
| 覆盖粒度 | 键级别覆盖（只覆盖冲突的键） | 文件级别（整个 settings 合并） |

Codex 的五级加载比 Claude Code 的三级更精细，但也更复杂。对于目录结构深的项目（超过 3 层），Codex 的多层覆盖提供了更好的局部定制能力。对于扁平项目，两者差异不大。

### MCP 配置

| 维度 | Codex | Claude Code |
|------|-------|-------------|
| MCP 定义位置 | config.toml 中的 `[mcp_servers]` 段落 | settings.json 中的 `mcpServers` 字段 |
| 认证方式 | `bearer_token_env_var` 引用环境变量 | 直接在配置中引用环境变量 |
| 服务类型 | command 型和 URL 型 | command 型和 URL 型 |
| 分层继承 | 支持（项目级覆盖用户级） | 支持（项目级覆盖用户级） |

两者在 MCP 配置上的能力基本对等，差异主要在语法风格上。

### 安全控制

| 维度 | Codex | Claude Code |
|------|-------|-------------|
| 沙箱 | 内核级（Seatbelt/Landlock） | 容器级（Docker/Podman） |
| 命令策略 | Starlark 规则引擎 | allowlist/denylist |
| 网络控制 | 域名白名单、localhost/私有网络开关 | 依赖沙箱网络隔离 |
| 强制约束 | requirements.toml（不可覆盖） | 企业策略（类似机制） |

Codex 在安全控制上更成熟。内核级沙箱比容器级沙箱的隔离性更强（绕过难度更高），Starlark 规则引擎比静态的 allowlist/denylist 更灵活（支持模式匹配和条件判断）。

### 选型建议

两者不是互斥的。实际项目中可以同时使用，但需要明确分工：

- 用 Codex 处理需要快速多文件编辑的开发任务，利用其五级配置继承和内核沙箱
- 用 Claude Code 处理需要深度代码分析和审查的任务，利用其条件化规则加载

共享的配置（构建命令、架构约束、安全边界）应该以两个工具都支持的格式各自维护一份，而不是试图用一个工具的配置文件驱动另一个工具。

---

## 常见配置错误和排查

### 错误一：配置文件路径错误

**症状**：修改了 config.toml 但 Codex 的行为没有变化。

**原因**：config.toml 放在了错误的目录。Codex 只在 `.codex/` 目录下查找配置文件。如果你把它放在了 `.codex/` 的上级目录、项目根目录（而非 `.codex/` 子目录）或其他位置，Codex 根本不会读取它。

**排查**：

```bash
# 确认配置文件在正确位置
ls -la .codex/config.toml

# 确认 CWD 是你以为的目录
pwd

# 确认 Codex 实际加载了哪个配置文件
# 启动 Codex 时观察日志输出，或运行：
codex --debug "echo config test" 2>&1 | grep config
```

### 错误二：TOML 语法错误

**症状**：Codex 启动时报错，或者某些配置项不生效。

**常见语法错误**：

```toml
# 错误：字符串值没有引号
model = o4-mini          # 应该是 model = "o4-mini"

# 错误：数组语法错误
allowed_domains = [github.com, npmjs.com]  # 缺少引号

# 正确：
allowed_domains = ["github.com", "npmjs.com"]

# 错误：布尔值用了字符串
sandbox_mode = "workspace-write"  # 这是正确的字符串
allow_localhost = "false"         # 错误！应该是布尔值

# 正确：
allow_localhost = false

# 错误：中文注释导致解析失败（极少数情况）
# 确保 TOML 文件使用 UTF-8 编码
```

**排查**：

```bash
# 使用 Python 验证 TOML 语法
python3 -c "
import tomllib
with open('.codex/config.toml', 'rb') as f:
    config = tomllib.load(f)
    print('TOML syntax OK')
    print(config)
"

# 或使用 toml-cli 工具
npx toml-validate .codex/config.toml
```

### 错误三：配置键拼写错误

**症状**：配置文件存在，语法正确，但某个配置项不生效。

**原因**：TOML 不支持 schema 验证。拼写错误的键会被静默忽略，不会报错。

```toml
# 错误的键名（不会报错，但不会生效）
search_mode = "cached"              # 正确：web_search
project_doc_max_byte = 32768        # 正确：project_doc_max_bytes
dev_instructions = "..."            # 正确：developer_instructions
compact_limit = 80000               # 正确：auto_compact_limit
```

**排查**：对照本文的配置键参考表，逐一检查拼写。

### 错误四：AGENTS.md 超过大小限制

**症状**：Codex 完全无视 AGENTS.md 中的规则。

**原因**：AGENTS.md 文件超过了 `project_doc_max_bytes` 的限制，被静默跳过。

**排查**：

```bash
# 检查文件大小
wc -c AGENTS.md

# 对比配置中的限制
grep project_doc_max_bytes .codex/config.toml

# 如果文件超过限制，增大配置值或精简文件
```

### 错误五：MCP 服务启动失败

**症状**：Codex 运行正常，但 MCP 相关的工具调用失败或不可用。

**排查步骤**：

```bash
# 1. 手动启动 MCP 服务，看是否有报错
npx -y @upstash/context7-mcp

# 2. 检查环境变量是否设置
env | grep TOKEN

# 3. 检查网络连通性（远程 MCP）
curl -I https://mcp.figma.com/mcp

# 4. 检查 MCP 服务名是否正确
# config.toml 中的服务名是自定义的，但要确保不重名
```

### 错误六：分层配置冲突

**症状**：项目级的配置似乎不生效，或者行为与预期不一致。

**原因**：用户级或系统级的配置覆盖了项目级的配置——但方向反了。记住，更靠近 CWD 的配置优先级更高，不是"项目级一定覆盖用户级"。

**排查**：

```bash
# 列出所有层级的 config.toml
find /etc/codex -name "config.toml" 2>/dev/null
find ~ -path "*/.codex/config.toml" 2>/dev/null
find . -name "config.toml" -path "*/.codex/*"

# 检查每个文件中的配置项
for f in $(find . -name "config.toml" -path "*/.codex/*"); do
  echo "=== $f ==="
  cat "$f"
done
```

### 错误七：requirements.toml 覆盖了 config.toml

**症状**：无论怎么修改 config.toml，某些配置项始终不变。

**原因**：管理员在 `.codex/requirements.toml` 中定义了强制约束，优先级高于所有 config.toml。

**排查**：

```bash
# 检查是否存在 requirements.toml
ls -la .codex/requirements.toml

# 如果存在，查看其内容
cat .codex/requirements.toml

# requirements.toml 中定义的键无法被任何 config.toml 覆盖
# 需要联系管理员修改
```

### 通用排查流程

遇到配置问题时，按以下顺序排查：

```
1. 确认文件位置正确（.codex/config.toml）
2. 验证 TOML 语法（python3 tomllib 或在线验证器）
3. 检查键名拼写（对照配置键参考表）
4. 检查分层冲突（列出所有层级的 config.toml）
5. 检查 requirements.toml 是否覆盖
6. 检查 CLI 参数是否覆盖了配置文件
7. 检查 AGENTS.md 大小是否超限
8. 检查 MCP 服务是否能独立启动
```

90% 的配置问题在前三步就能定位。剩下 10% 通常是分层冲突或 requirements.toml 覆盖导致的。

---

## 配置演进策略

一个项目的 config.toml 不应该一次写完就不再改动。随着团队对 Codex 的理解加深，配置应该持续演进。

### 第一阶段：最小配置（项目启动）

```toml
# .codex/config.toml —— 最小启动配置
model = "gpt-5.2-codex"
sandbox_mode = "workspace-write"
approval_mode = "auto-edit"
```

只写三个最关键的配置。其余用默认值。这个阶段的目标是让 Codex 跑起来，不追求完美配置。

### 第二阶段：安全加固（使用 1-2 周后）

```toml
# 新增安全相关配置
web_search = "cached"
allowed_domains = ["github.com", "npmjs.com"]
allow_localhost = false
allow_private_network = false
```

在使用过程中逐步收紧安全策略。根据实际需要决定哪些域名需要开放、哪些操作需要限制。

### 第三阶段：效率优化（使用 1 个月后）

```toml
# 新增上下文管理配置
project_doc_max_bytes = 49152
auto_compact_limit = 100000
developer_instructions = "本项目使用 pnpm..."

# 新增 MCP 服务
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
```

在理解了项目的典型会话模式后，调整上下文管理和 MCP 配置以提升效率。

### 第四阶段：团队标准化（多人使用后）

```toml
# 新增 Profile 预设
[profiles.dev]
model = "o4-mini"

[profiles.arch]
model = "o3"
sandbox_mode = "read-only"

# 新增 requirements.toml 强制约束
```

当多人使用同一套配置时，通过 Profile 提供标准化的工作流，通过 requirements.toml 确保安全策略不被个人配置覆盖。

---

## 小结

config.toml 是 Codex 工程化的控制面。理解它不是记住所有配置键，而是理解三个核心设计原则：

**分层加载**：五个层级从系统级到当前工作目录，越靠近 CWD 优先级越高。不同角色的配置各归其位——系统管理员管安全策略，团队负责人管项目规范，个人开发者管自己的偏好。每层只写差异部分，不重复。

**渐进配置**：不要试图一次把所有配置项都设好。从最小配置开始，在实际使用中逐步演进。每一阶段的配置都解决当时最迫切的问题——先能跑，再安全，再高效，最后标准化。

**团队共享**：`.codex/` 目录提交到 Git，让所有团队成员共享同一套配置。通过 requirements.toml 强制安全策略，通过 Profile 提供标准工作流，通过 MCP 接入团队工具链。配置文件是团队对"Codex 应该怎么工作"的共识，不是个人的实验场。

掌握 config.toml 的最终目标不是成为配置专家，而是让 Codex 在你的项目中做到"该做的做、不该做的不做、该怎么做就怎么做"——精确、可控、可复现。
