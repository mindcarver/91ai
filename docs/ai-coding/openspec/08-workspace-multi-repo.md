# OpenSpec Workspace 与多仓库协作

> 更新日期：2026/06

## TL;DR

OpenSpec Workspace 是一个机器本地的协调视图层，用来解决多仓库和大 monorepo 场景下的规划、可见性和上下文同步问题。它不修改被关联仓库的内部结构，不引入新的共享状态，不强迫团队改变分支策略。Workspace 的核心思路是：用一个轻量级的本地配置文件（`workspace.yaml`）把散落在不同路径的仓库和目录映射成稳定的短名称，再通过 context store 和 initiative 机制在多个仓库之间共享协调上下文。当前 Workspace 仍处于 beta 状态，命令行接口和状态文件格式可能还会变化。

---

## 为什么这很重要

### 单仓库、多仓库、大 Monorepo 各自的规划困境

软件系统的代码组织方式有三种基本形态，每种都有各自的规划难题：

**单仓库（Single Repo）** 是 OpenSpec 默认的工作模式。`openspec init` 之后，所有 spec、change、archive 都在这个仓库的 `openspec/` 目录下运转。对于边界清晰的独立项目，这个模式没有问题。当项目膨胀到需要拆分，或者团队规模增长到需要多个服务独立迭代时，单仓库就不够用了。

**多仓库（Multi-Repo）** 的规划难题在于：一个跨服务的功能（比如"用户注册流程需要在 API 层创建账号、在 Web 前端增加表单、在 Mobile 端同步登录态"）如何被当作一个整体来规划？传统做法是靠工单系统做人工关联，或者在一个 wiki 页面里手动维护追踪表格。这类方案的问题是信息分散、状态不同步、AI agent 无法直接理解跨仓库的上下文。

**大 Monorepo** 的规划难题不同。代码在同一个仓库，但系统内部有明确的边界（services/billing、apps/checkout、libs/auth）。OpenSpec 的 repo-local 模式把所有 spec 放在一个 `openspec/specs/` 下，当边界内需要独立的规划上下文时，一个统一的 spec 目录反而模糊了边界。

这三类问题有一个共同的根源：缺少一个跨越仓库或模块边界的协调层。OpenSpec Workspace 的设计目标就是填补这个空白。

---

## Workspace 的心智模型

理解 Workspace 需要搞清楚四个概念之间的层次关系：

```
workspace     = 机器本地的私有协调视图
context store = 持久化的共享上下文容器
initiative    = context store 内的协调上下文
link          = 仓库或目录的稳定名称映射
change        = 一个计划中的工作单元
```

### Workspace：私有本地视图

Workspace 是一个机器本地的概念。它不会在被关联的仓库里创建任何文件，也不会修改仓库的 `.gitignore` 或目录结构。Workspace 只维护三样东西：

- `workspace.yaml`：记录 workspace 名称、关联的链接、绑定的 initiative
- `AGENTS.md`：由 OpenSpec 自动生成的运行时指导，给 AI agent 提供上下文
- `<workspace-name>.code-workspace`：VS Code 多根工作区配置文件

这三个文件都存放在 OpenSpec 的全局数据目录下，不在任何被关联的仓库里。

### Context Store：持久化的共享上下文容器

Context store 是独立于任何单一仓库的持久化上下文存储。它通常是一个 Git 仓库或目录，用来存放 initiative。Context store 解决的问题是：当多个仓库需要共享同一个规划上下文时，这个上下文不能放在任何一个仓库里（否则其他仓库无法直接引用），需要一个独立的存放位置。

### Initiative：协调上下文

Initiative 是 context store 内的一个具体协调上下文。比如一个"支付上线"计划涉及 API 仓库、Web 仓库和 Mobile 仓库的改动，这个计划就是一个 initiative。各仓库内的 change 可以通过 `--initiative` 参数绑定到这个 initiative，从而让所有参与方共享同一个协调上下文。

### Link：稳定的名称映射

Link 是 Workspace 最实用的基础能力。它把一个本地路径映射成一个短名称：

```
multi-repo 场景:
  api      -> /repos/api
  web      -> /repos/web
  mobile   -> /repos/mobile

大 monorepo 场景:
  billing  -> /repos/platform/services/billing
  checkout -> /repos/platform/apps/checkout
```

Link 名称在整个 workspace 内是稳定的。当仓库被移到新路径时，只需要 `relink` 更新路径，名称不变。这让 AI agent、脚本和工作流都能用一致的名称引用仓库，而不用关心具体的文件系统路径。

---

## Workspace 目录结构

一个典型的 workspace 在文件系统上的布局：

```
~/.local/share/openspec/workspaces/<workspace-name>/
├── workspace.yaml                 # 私有本地视图记录
├── AGENTS.md                      # 自动生成的运行时指导
└── <workspace-name>.code-workspace # VS Code 多根工作区文件
```

而被关联的仓库保持各自的目录结构不变：

```
repos/
├── api/
│   └── openspec/           # API 仓库自己的 spec 和 change
│       ├── specs/
│       └── changes/
├── web/
│   └── openspec/           # Web 仓库自己的 spec 和 change
│       ├── specs/
│       └── changes/
└── mobile/
    └── openspec/           # Mobile 仓库自己的 spec 和 change
        ├── specs/
        └── changes/
```

这个区分很重要。Workspace 不替代各仓库的 `openspec/` 目录。每个仓库的 spec、change、archive 仍然在各自的 `openspec/` 下管理。Workspace 只是提供一个跨越这些仓库的协调视图。

---

## workspace.yaml 配置详解

`workspace.yaml` 是 workspace 的核心配置文件。最简单的形态：

```yaml
# workspace.yaml
version: 1
name: platform
context: null
links:
  api: /repos/api
  web: /repos/web
```

### 基本字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `version` | number | 配置格式版本，当前为 1 |
| `name` | string | Workspace 名称，kebab-case 格式 |
| `context` | object/null | 当前绑定的 initiative 上下文，初始为 null |
| `links` | map | 稳定名称到本地路径的映射 |

### Link 的两种写法

Link 支持两种写法：

1. 隐式名称：`--link /repos/api`，名称从目录名推导（这里是 `api`）
2. 显式名称：`--link web=/repos/web-frontend`，用自定义名称映射路径

显式命名在目录名不够直观或多个仓库有相似目录名时很有用。

### 绑定 Initiative 后的配置

当 workspace 打开一个 initiative 时，`context` 字段会记录绑定的 context store 和 initiative ID：

```yaml
context:
  kind: initiative
  store:
    id: platform
    selector:
      kind: registry
      id: platform
  initiative:
    id: billing-launch
```

这里有两个 store 选择器：

- `registry`：通过注册到本地 registry 的 store ID 选择。跨机器可移植，因为只记录 ID。
- `path`：直接记录运行时的本地路径。适合开发者在自己的机器上使用临时路径的场景，但不可移植。

因为 `workspace.yaml` 是私有本地状态，path 选择器的设计是有意为之。它不需要跨机器共享。

---

## Initiative 绑定和 Context Store 选择

### Context Store 的生命周期

Context store 的创建和注册流程：

```bash
# 方式一：创建 OpenSpec 管理的 context store
openspec context-store setup platform

# 方式二：创建到指定路径
openspec context-store setup platform --path /repos/platform-context --init-git

# 方式三：注册一个已有的目录
openspec context-store register /repos/team-shared-context --id platform
```

创建后，store 被注册到本地 registry。后续命令通过 store ID 引用。

### Initiative 的创建和使用

```bash
# 在 context store 中创建 initiative
openspec initiative create billing-launch \
  --store platform \
  --title "支付功能上线" \
  --summary "API/Web/Mobile 三端协同完成支付流程"

# 查看所有 initiative
openspec initiative list --store platform

# 在各仓库中创建绑定到 initiative 的 change
cd /repos/api
openspec new change add-billing-api --initiative billing-launch --store platform

cd /repos/web
openspec new change add-billing-ui --initiative billing-launch --store platform
```

绑定之后，各仓库的 change 元数据会记录 initiative 关联信息。这样 AI agent 在处理某个 change 时，能感知到它在更大的计划中的位置。

---

## Workspace 命令完整参考

### openspec workspace setup

创建一个 workspace 并关联至少一个仓库或目录。

**交互式模式：**

```bash
openspec workspace setup
```

交互式模式会引导选择：workspace 名称、要关联的目录、首选 opener（codex-cli/claude/github-copilot/editor）、是否安装 agent skills。

**非交互式模式（适合脚本和 CI）：**

```bash
# 最小化非交互式 setup
openspec workspace setup \
  --no-interactive \
  --name platform \
  --link /repos/api \
  --link web=/repos/web

# 指定 opener
openspec workspace setup \
  --no-interactive \
  --name platform \
  --link /repos/api \
  --opener codex-cli

# 同时安装 agent skills
openspec workspace setup \
  --no-interactive \
  --name platform \
  --link /repos/api \
  --tools codex,claude

# JSON 输出
openspec workspace setup \
  --no-interactive \
  --json \
  --name checkout \
  --link /repos/platform/apps/checkout
```

**参数说明：**

| 参数 | 说明 |
| --- | --- |
| `--name <name>` | Workspace 名称，kebab-case |
| `--link <path>` | 关联目录，名称从目录名推导 |
| `--link <name>=<path>` | 关联目录，自定义名称 |
| `--opener <id>` | 首选 opener：codex-cli、claude、github-copilot、editor |
| `--tools <tools>` | 安装 agent skills：all、none、或逗号分隔的工具列表 |
| `--no-interactive` | 禁用交互式提示 |
| `--json` | JSON 输出（需要 --no-interactive） |

### openspec workspace link / relink

**添加关联：**

```bash
# 名称从目录名推导
openspec workspace link /repos/api

# 自定义名称
openspec workspace link api-service /repos/api

# 指定 workspace
openspec workspace link --workspace platform /repos/platform/apps/checkout
```

**修复或更新路径：**

```bash
# 仓库被移到新位置
openspec workspace relink api-service /new/path/to/api
```

`link` 和 `relink` 只记录已有的目录路径，不会创建、复制、移动或初始化任何仓库。操作完成后，OpenSpec 会自动刷新 `AGENTS.md` 和 VS Code 工作区文件。

### openspec workspace doctor

诊断 workspace 在当前机器上的状态：

```bash
openspec workspace doctor
openspec workspace doctor --workspace platform
```

Doctor 检查以下内容：

- workspace 目录位置
- 各 link 的路径是否存在
- 各仓库是否有 `openspec/specs/` 目录
- 建议的修复操作

Doctor 只报告问题，不自动修复。

### openspec workspace open

打开 workspace 的关联工作集：

```bash
# 使用存储的首选 opener
openspec workspace open

# 指定 workspace
openspec workspace open platform

# 一次性使用指定 agent
openspec workspace open platform --agent github-copilot

# 用 VS Code 编辑器模式打开
openspec workspace open --editor

# 打开绑定了 initiative 的视图
openspec workspace open --initiative billing-launch --store platform

# 使用 store/id 组合形式
openspec workspace open --initiative platform/billing-launch
```

`--agent` 和 `--editor` 不能同时使用。`open` 打开的是只读探索视图，不会自动开始实现。实现工作需要在明确请求后通过正常的 OpenSpec 工作流进行。

### openspec workspace list

列出本地 registry 中的所有 workspace：

```bash
openspec workspace list
openspec workspace ls
openspec workspace list --json
```

会显示每个 workspace 的位置和关联目录。过期的 registry 记录会被报告但不会被自动清理。

### openspec workspace update

刷新 workspace 本地的 OpenSpec 指导和 agent skills：

```bash
openspec workspace update
openspec workspace update platform
openspec workspace update --workspace platform --tools codex,claude
openspec workspace update --workspace platform --tools none
```

`update` 刷新 `AGENTS.md` 和 VS Code 工作区文件，并管理 workspace 根目录下的 agent skill 目录。被取消选择的 skill 会被移除，但不会影响被关联仓库内的任何文件。

---

## VS Code 多根工作区集成

Workspace 自动维护一个 `<workspace-name>.code-workspace` 文件。这个文件的内容类似：

```json
{
  "folders": [
    { "path": "/repos/api" },
    { "path": "/repos/web" },
    { "path": "/repos/mobile" }
  ],
  "settings": {}
}
```

当 initiative 被绑定时，context store 路径也会被加入 folders 列表。

VS Code 打开这个 `.code-workspace` 文件后，会显示为多根工作区。左侧资源管理器里每个仓库是独立的根节点。这意味着：

- 每个仓库的搜索范围独立
- 每个仓库的 Git 状态独立显示
- 全局搜索覆盖所有关联仓库

这个文件是机器本地的状态文件，不应该被提交到版本控制。

---

## 跨仓库 Change 的实现策略

一个关键设计决策：**change 的实现属于 owning repo**。

当一个跨仓库功能被规划为一个 initiative 时，各仓库内的 change 仍然是独立的：

```
initiative: billing-launch
  ├── change: add-billing-api    (在 api 仓库)
  ├── change: add-billing-ui     (在 web 仓库)
  └── change: add-billing-mobile (在 mobile 仓库)
```

每个 change 的 `proposal.md`、`design.md`、`tasks.md`、delta specs 都在各自仓库的 `openspec/changes/` 目录下。Archive 操作也在各自仓库内完成。Initiative 只是提供协调上下文，让各仓库的 change 知道彼此的存在和整体进度。

这个设计避免了跨仓库事务的复杂性。每个仓库的 OpenSpec 状态仍然是自包含的，可以独立 archive、独立回滚。

---

## 完整案例：三仓库团队的 Workspace 协调

### 场景描述

一个团队维护三个仓库：

- `api`：后端 API 服务（Node.js）
- `web`：Web 前端（React）
- `mobile`：移动端（React Native）

需要实现"支付功能"，涉及三个仓库的协同改动。

### 第一步：设置 Context Store

```bash
# 创建一个共享的 context store，放在一个团队可见的目录
openspec context-store setup platform \
  --path /repos/platform-context \
  --init-git

# 创建 initiative
openspec initiative create billing-launch \
  --store platform \
  --title "支付功能上线" \
  --summary "三端协同完成支付流程：API 支付接口、Web 支付页面、Mobile 支付界面"
```

### 第二步：设置 Workspace

```bash
# 交互式创建 workspace
openspec workspace setup
# 选择名称: platform
# 关联 /repos/api、/repos/web、/repos/mobile
# 选择 opener: claude

# 或者非交互式
openspec workspace setup \
  --no-interactive \
  --name platform \
  --link api=/repos/api \
  --link web=/repos/web \
  --link mobile=/repos/mobile \
  --opener claude \
  --tools claude
```

### 第三步：在各仓库创建绑定 Initiative 的 Change

```bash
# API 仓库
cd /repos/api
openspec new change add-billing-api \
  --initiative billing-launch \
  --store platform

# Web 仓库
cd /repos/web
openspec new change add-billing-ui \
  --initiative billing-launch \
  --store platform

# Mobile 仓库
cd /repos/mobile
openspec new change add-billing-mobile \
  --initiative billing-launch \
  --store platform
```

### 第四步：用 Workspace 视图查看全局进度

```bash
# 在 workspace 根目录下
openspec workspace open platform

# 或直接打开 initiative 视图
openspec workspace open --initiative billing-launch --store platform
```

此时 AI agent 能看到：

- 所有三个仓库的目录结构
- 各仓库中活跃的 change 状态
- Initiative 的协调上下文
- 各仓库已有的 spec（如果有的话）

### 第五步：各仓库独立工作

```bash
# 在 API 仓库实现支付接口
cd /repos/api
# AI agent 使用 /opsx:propose → /opsx:apply → openspec archive 流程

# 在 Web 仓库实现支付页面
cd /repos/web
# 同样的 propose → apply → archive 流程

# 在 Mobile 仓库实现支付界面
cd /repos/mobile
# 同样的流程
```

### 第六步：完成和清理

当所有仓库的 change 都 archive 后，initiative 自然进入完成状态。各仓库的 spec 各自更新，不依赖跨仓库操作。

```
最终状态：

api/openspec/specs/payments/spec.md     ← 合并了 add-billing-api 的 delta
web/openspec/specs/payments/spec.md     ← 合并了 add-billing-ui 的 delta
mobile/openspec/specs/payments/spec.md  ← 合并了 add-billing-mobile 的 delta

platform-context/initiatives/billing-launch/  ← initiative 的协调记录
```

---

## 数据目录路径

Workspace 的数据存放在 OpenSpec 的全局数据目录下。路径取决于操作系统和环境变量：

| 环境 | 路径 |
| --- | --- |
| 设置了 `XDG_DATA_HOME` | `$XDG_DATA_HOME/openspec/workspaces/` |
| Unix（默认） | `~/.local/share/openspec/workspaces/` |
| Windows 原生 | `%LOCALAPPDATA%\openspec\workspaces\` |

Context store 同理：

| 环境 | 路径 |
| --- | --- |
| 设置了 `XDG_DATA_HOME` | `$XDG_DATA_HOME/openspec/context-stores/` |
| Unix（默认） | `~/.local/share/openspec/context-stores/` |
| Windows 原生 | `%LOCALAPPDATA%\openspec\context-stores\` |

需要注意的是，Windows 原生 shell、PowerShell 和 WSL2 各自维护自己的路径字符串。OpenSpec 不会在 `D:\repo`、`/mnt/d/repo` 和 UNC WSL 路径之间做转换。

---

## Workspace 的限制和 Beta 状态说明

### 当前 Beta 限制

1. **Workspace 仍处于 beta**。命令行为、状态文件格式和 JSON 输出结构都可能变化。如果你在构建外部自动化或长期运行的集成，要做好应对 breaking change 的准备。

2. **本地私有状态**。`workspace.yaml` 是机器本地的私有文件。它不会被同步到其他机器。每个开发者需要在各自的机器上独立 setup workspace。这不影响共享的 context store 和 initiative（它们通常在 Git 仓库中）。

3. **Skill 安装仅限 workspace 根目录**。即使在全局配置中 delivery 设为 `commands` 或 `both`，workspace setup 只会在 workspace 根目录写入 agent skill 文件夹，不会创建 slash command 文件。

4. **跨路径格式不兼容**。Windows 和 WSL2 的路径格式不互通。如果你在 WSL2 里 setup 了 workspace，关联的路径是 `/mnt/d/repo` 格式，在 Windows 原生 shell 里这些路径无法解析。

5. **Workspace 不创建 `.gitignore`**。因为 workspace 不是仓库，OpenSpec 不创建默认的 `.gitignore` 或 workspace 级别的 `changes/` 目录。

### 不适合的场景

- 需要严格的跨仓库事务一致性（Workspace 不提供分布式锁或两阶段提交）
- 需要 workspace 状态跨机器自动同步（需要手动 setup 或脚本管理）
- 需要在 CI/CD 中使用 workspace 协调（beta 状态的接口不稳定，CI 场景建议用 repo-local 模式）

---

## 架构图

### Workspace 与仓库的关系

```
┌─────────────────────────────────────────────────────────────┐
│                    Workspace "platform"                      │
│                                                             │
│   workspace.yaml:                                           │
│     links:                                                  │
│       api    -> /repos/api                                  │
│       web    -> /repos/web                                  │
│       mobile -> /repos/mobile                               │
│                                                             │
│   AGENTS.md          (自动生成的 agent 指导)                │
│   platform.code-workspace  (VS Code 多根配置)               │
│                                                             │
└───────────────┬─────────────┬──────────────┬────────────────┘
                │             │              │
                ▼             ▼              ▼
        ┌───────────┐  ┌───────────┐  ┌───────────┐
        │ /repos/api│  │ /repos/web│  │/repos/     │
        │           │  │           │  │ mobile     │
        │ openspec/ │  │ openspec/ │  │ openspec/  │
        │ ├ specs/  │  │ ├ specs/  │  │ ├ specs/   │
        │ └ changes/│  │ └ changes/│  │ └ changes/ │
        └───────────┘  └───────────┘  └───────────┘

        ┌──────────────────────────────────────────┐
        │ Context Store "platform"                 │
        │                                          │
        │ initiatives/                             │
        │   └── billing-launch/                    │
        │         ├── initiative.yaml              │
        │         └── 协调上下文文件               │
        └──────────────────────────────────────────┘
```

### 跨仓库 Change 的归属模型

```
Initiative: billing-launch
  │
  ├── [api repo]      change: add-billing-api
  │     ├── proposal.md    ← 为什么要加支付接口
  │     ├── design.md      ← 技术方案
  │     ├── tasks.md       ← 实现清单
  │     └── specs/         ← delta specs
  │
  ├── [web repo]      change: add-billing-ui
  │     ├── proposal.md
  │     ├── design.md
  │     ├── tasks.md
  │     └── specs/
  │
  └── [mobile repo]   change: add-billing-mobile
        ├── proposal.md
        ├── design.md
        ├── tasks.md
        └── specs/

注意：每个 change 的 artifact 都在各自的仓库内。
Initiative 只提供引用关系，不存放 change 的具体内容。
```

### Workspace 命令工作流

```
┌──────────────────────────────────────────────────────────────────┐
│                    Workspace 生命周期                              │
│                                                                  │
│  1. setup ──► 2. link ──► 3. open ──► 4. [各仓库独立工作]       │
│      │            │           │                                   │
│      │            │           └──► workspace open --editor       │
│      │            │           └──► workspace open --agent <tool> │
│      │            │           └──► workspace open --initiative   │
│      │            │                                               │
│      │            └──► relink (路径变更时)                        │
│      │            └──► doctor  (诊断时)                          │
│      │            └──► update  (刷新时)                          │
│      │                                                            │
│      └──► list (查看所有 workspace)                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 权衡与局限

### Workspace 做了什么

- 提供跨仓库/跨目录的统一视图
- 用稳定名称映射解耦逻辑引用和物理路径
- 通过 initiative 机制共享协调上下文
- 自动生成 VS Code 多根工作区配置
- 自动生成 AGENTS.md 供 AI agent 消费

### Workspace 没做什么

- 没有跨仓库的事务保证。各仓库的 change 独立管理。
- 没有跨机器的状态同步。`workspace.yaml` 是私有本地文件。
- 没有修改被关联仓库的任何内容。仓库无感知。
- 没有替代项目管理系统。它不追踪优先级、截止日期、人员分配。
- 没有提供 Web UI 或可视化面板。CLI 和 VS Code 集成是当前的全部交互界面。

### 适用场景判断

| 场景 | 是否推荐 Workspace |
| --- | --- |
| 单仓库项目 | 否，用 repo-local 的 `openspec init` |
| 2-5 个关联仓库的中小团队 | 是，设置成本低，收益明显 |
| 大 monorepo 内的模块边界 | 是，用 link 映射子目录 |
| 需要严格跨仓库一致性的场景 | 否，缺少事务机制 |
| CI/CD 自动化 | 暂不推荐，beta 接口不稳定 |
| 纯个人项目 | 不一定需要，除非你有明确的多仓库协调需求 |

---

## 延伸阅读

- [OpenSpec 官方文档 - Concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md) - 核心概念的权威说明
- [OpenSpec CLI Reference](https://github.com/Fission-AI/OpenSpec/blob/main/docs/cli.md) - 完整命令参考
- [OpenSpec GitHub Discussions](https://github.com/Fission-AI/OpenSpec/discussions) - 社区讨论和反馈
- [Multi-Repo Spec Management Issue #725](https://github.com/Fission-AI/OpenSpec/issues/725) - 多仓库 spec 管理的功能请求讨论
- [OpenSpec Knowledge Hub](https://intent-driven.dev/knowledge/openspec/) - 教程、工作流图和博客文章索引
