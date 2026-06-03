# 进阶学习路线与资源推荐：从入门到精通 Codex CLI

> TL;DR：72 篇文章读完了，接下来怎么系统提升？本文按四个阶段（入门期、熟练期、进阶期、专家期）给出学习路线，每个阶段推荐阅读哪些本系列文章、练什么项目、看什么外部资源。同时列出社区资源、开源项目、和持续更新的官方文档入口。后端工程师、前端工程师、DevOps、技术负责人各有不同的推荐阅读顺序。

---

## 1. 本系列 72 篇文章的阅读路线图

72 篇文章按主题分成了十一季，但你不应该按编号顺序从头读到尾。不同角色、不同阶段的人需要不同的阅读路线。

### 按角色推荐的阅读顺序

#### 后端工程师

后端工程师的核心关注点：命令执行、代码理解、重构、测试、CI/CD 集成。推荐路线：

```
第一季：入门篇（01-06）
    → 第二季：基础操作篇（07-15，重点 07/08/09/12）
    → 第五季：安全篇（29-35，重点 29/30）
    → 第八季：自动化篇（48-50）
    → 第十季：实战篇（59-65）
    → 第四季：配置篇按需查阅
```

为什么跳过第三季（斜杠命令参考）？因为后端工程师不需要背命令，用到时查就行。第四季（配置篇）是参考手册，不需要通读，遇到具体配置需求时翻对应文章。

#### 前端工程师

前端工程师的核心关注点：代码编辑、Web 搜索（查文档）、实时预览、UI 相关工作流。推荐路线：

```
第一季：入门篇（01-06）
    → 第二季：基础操作篇（07-15，重点 08/11/15）
    → 第六季：扩展篇（36-42，重点 36/40）
    → 第十季：实战篇（59/60/62）
    → 第十一季：附录篇（67/68 快速查阅）
```

前端工程师用 Codex CLI 的频率可能不如 Cursor 或 IDE 插件高，但在需要跨文件重构、批量修改组件、或写测试时，Codex CLI 的 Agent 能力比编辑器内补全更强。

#### DevOps 工程师

DevOps 的核心关注点：命令执行、沙箱安全、CI/CD 集成、自动化脚本。推荐路线：

```
第一季：入门篇（01-06）
    → 第五季：安全篇（29-35，全部重点）
    → 第八季：自动化篇（48-53，全部重点）
    → 第九季：企业篇（54-58，重点 54/55/57）
    → 第四季：配置篇（22-28，重点 26/27）
```

DevOps 工程师可能是 Codex CLI 最匹配的用户群体——终端是日常环境，命令执行是核心需求，CI/CD 集成是刚需。安全篇和自动化篇是必读。

#### 技术负责人

技术负责人需要了解 Codex 的全貌，但不需要深入每个配置细节。推荐路线：

```
第 01 篇（Codex 是什么）— 必读，建立全局认知
    → 第 05 篇（审批模式）— 了解安全控制
    → 第 29 篇（沙箱机制）— 了解安全模型
    → 第 43 篇（多 Agent 协作）— 了解并行能力
    → 第 48 篇（exec 模式）— 了解 CI 集成
    → 第 54 篇（管理员配置）— 了解企业管理
    → 第 71 篇（工具对比）— 帮助团队选型
```

技术负责人不需要会写 Skills 或开发 MCP 服务器，但需要知道 Codex 能做什么、不能做什么、安全边界在哪里。

---

## 2. 入门期（第 1-2 周）

### 目标

完成 Codex CLI 的安装和基本配置，能在日常开发中使用 Codex 做简单的代码阅读、编辑和命令执行。不需要掌握所有功能，能解决实际问题就行。

### 推荐阅读

| 优先级 | 文章编号 | 标题 | 阅读重点 |
|--------|---------|------|---------|
| 必读 | 01 | Codex 是什么 | 建立全局认知，了解四种形态 |
| 必读 | 02 | 安装全平台指南 | 跟着操作，完成安装 |
| 必读 | 03 | 认证配置 | 完成 API Key 或账号登录 |
| 必读 | 04 | 第一次和 Codex 对话 | 跑通第一个任务 |
| 必读 | 05 | 三种审批模式 | 理解 suggest / auto-edit / full-auto |
| 推荐 | 06 | 模型选择与切换 | 知道什么时候用什么模型 |
| 推荐 | 07 | 让 Codex 读你的代码 | 学会用 Codex 理解项目 |

### 入门期的实践任务

**任务一：安装并跑通第一个任务**

```bash
# 安装
npm install -g @openai/codex

# 认证（二选一）
# 方式一：用 ChatGPT 账号登录
codex auth login
# 方式二：用 API Key
export OPENAI_API_KEY="sk-..."

# 第一个任务
codex "列出当前目录下所有的 Python 文件，并统计每个文件的函数数量"
```

**任务二：用 Codex 读一个陌生项目**

找一个你不熟悉的 GitHub 仓库，clone 下来，让 Codex 帮你理解：

```bash
cd some-unfamiliar-project
codex "分析这个项目的架构：主要模块、入口文件、技术栈"
```

**任务三：用 Codex 做一个代码审查**

```bash
codex "审查 src/ 目录下的代码，找出潜在的 bug 和不规范的写法"
```

### 入门期常见问题

| 问题 | 解决方案 | 参考文章 |
|------|---------|---------|
| 安装失败（npm 权限） | 用 `npx` 或检查 npm 全局目录权限 | 02 |
| 认证失败 | 检查 API Key 是否正确，是否过期 | 03 |
| Codex 不改文件 | 检查审批模式是否是 `suggest` | 05 |
| 响应太慢 | 切换到 GPT-5.4-mini 模型 | 06 |
| Token 额度用完 | 等 5 小时窗口恢复，或切换 API Key | 01 |

### 入门期时间投入

- 阅读文章：约 3-4 小时（7 篇文章）
- 实践操作：约 4-6 小时（3 个任务 + 自由探索）
- 总计：约 1 周，每天投入 1-2 小时

---

## 3. 熟练期（第 3-4 周）

### 目标

掌握 Codex CLI 的配置体系，理解安全模型，能用 Codex 处理日常开发中的常见任务。开始接触扩展生态（MCP、Skills）。

### 推荐阅读

| 优先级 | 文章编号 | 标题 | 阅读重点 |
|--------|---------|------|---------|
| 必读 | 08 | 让 Codex 改你的代码 | 文件编辑的完整流程 |
| 必读 | 09 | 让 Codex 跑命令 | shell 执行和审批配合 |
| 必读 | 11 | 上下文管理 | 避免对话太长导致质量下降 |
| 必读 | 12 | 代码审查 | /review 和 /diff 的使用 |
| 必读 | 22 | 配置文件体系总览 | 理解四层加载优先级 |
| 必读 | 28 | AGENTS.md 项目指令文件 | 学会写项目规则 |
| 必读 | 29 | 沙箱机制全解析 | 理解安全边界 |
| 推荐 | 10 | 会话管理 | /fork、/resume 等操作 |
| 推荐 | 13 | 规划模式 /plan | 让 Codex 先规划再执行 |
| 推荐 | 23 | 基础配置项 | 常用配置项参考 |
| 推荐 | 30 | 审批策略详解 | 精细化权限控制 |
| 推荐 | 36 | MCP 服务器接入 | 扩展 Codex 的能力 |

### 熟练期的实践任务

**任务一：为你的项目写 AGENTS.md**

选一个你正在维护的项目，写一个 AGENTS.md：

```markdown
# AGENTS.md

## 项目概述
这是一个用 Express + TypeScript 写的 REST API 服务。

## 技术栈
- Node.js 20+
- TypeScript 5.x
- Express 4.x
- PostgreSQL 16
- Jest 测试框架

## 代码规范
- 使用 ESLint + Prettier
- 函数必须有 JSDoc 注释
- 错误处理用自定义的 AppError 类
- 数据库查询用 Knex.js query builder

## 禁止事项
- 不要修改 migrations/ 目录下的已有文件
- 不要在 controller 里直接写 SQL
- 不要引入新的 ORM（项目统一用 Knex）
- 不要修改 .env 文件的 key 名称
```

然后让 Codex 做一个任务，观察它是否遵守这些规则。

**任务二：配置沙箱和审批策略**

在你的 `~/.codex/config.toml` 中配置：

```toml
sandbox_mode = "workspace-write"
approval_policy = "on-request"

[sandbox_workspace_write]
network_access = true
exclude_slash_tmp = true

# 保护敏感目录
[permissions.dev.filesystem]
"/home/you/.ssh" = "deny"
"/home/you/.aws" = "deny"
```

然后让 Codex 执行一个需要网络的命令（比如 `npm install`），验证沙箱和审批策略是否按预期工作。

**任务三：接入一个 MCP 服务器**

选一个你常用的服务（比如 GitHub），配置 MCP 服务器：

```toml
[mcp_servers.github]
command = "npx"
args = ["-y", "@anthropic/mcp-github"]
env = { GITHUB_TOKEN = "env:GITHUB_TOKEN" }
```

然后让 Codex 通过 MCP 操作 GitHub（比如查看 PR 列表、创建 issue）。

### 熟练期常见问题

| 问题 | 解决方案 | 参考文章 |
|------|---------|---------|
| Codex 不遵守 AGENTS.md | 检查文件是否在项目根目录，格式是否正确 | 28 |
| 上下文太长导致质量下降 | 用 /compact 压缩，或开新会话 | 11 |
| 审批弹窗太频繁 | 切换到 auto-edit 模式 | 05/30 |
| MCP 服务器连不上 | 检查 command 路径、环境变量、网络 | 36 |
| 沙箱阻止了合法操作 | 检查 writable_roots 和 network_access 配置 | 29 |

### 熟练期时间投入

- 阅读文章：约 8-10 小时（12 篇文章）
- 实践操作：约 10-15 小时（3 个任务 + 日常使用）
- 总计：约 2 周，每天投入 1.5-2 小时

---

## 4. 进阶期（第 5-6 周）

### 目标

掌握多 Agent 协作、自动化脚本、CI/CD 集成。能用 Codex 解决复杂的工程问题，而不是只做简单的代码编辑。

### 推荐阅读

| 优先级 | 文章编号 | 标题 | 阅读重点 |
|--------|---------|------|---------|
| 必读 | 43 | 多 Agent 协作总览 | 理解子代理机制 |
| 必读 | 44 | 自定义 Agent 角色 | 为不同任务定义专门的 agent |
| 必读 | 45 | /fork 与 /side 分叉对话 | 并行探索多个方案 |
| 必读 | 48 | exec 非交互模式 | 自动化的核心入口 |
| 必读 | 50 | 脚本化 Codex | CI/CD 集成 |
| 必读 | 59 | 提示工程 | 写出高质量的 Codex 指令 |
| 推荐 | 46 | 多 Agent 目标协调 | /goal 追踪 |
| 推荐 | 49 | review 自动审查 | 自动化代码审查 |
| 推荐 | 51 | GitHub Actions 集成 | PR 自动审查 |
| 推荐 | 37 | MCP 工具开发实战 | 开发自定义 MCP 服务器 |
| 推荐 | 38 | Skills 技能开发 | 打包可复用的指令集 |

### 进阶期的实践任务

**任务一：多 Agent 并行审查一个 PR**

```bash
codex "用并行 subagent 审查当前分支。派三个 agent：
1. 安全风险：检查 SQL 注入、XSS、敏感信息泄露
2. 测试覆盖：找出没有测试的新增函数
3. 性能问题：检查 N+1 查询、不必要的全表扫描

等三个都完成后，按严重程度排序汇总。"
```

这个任务让你实际体验多 Agent 的并发能力和上下文隔离。观察每个子 Agent 的输出，对比单线程模式下全塞在一个会话里的效果。

**任务二：写一个自动化脚本**

用 `codex exec` 写一个每天早上自动检查代码质量的脚本：

```bash
#!/bin/bash
# daily-code-review.sh

REPORT_FILE="reports/code-review-$(date +%Y%m%d).md"
mkdir -p reports

codex exec -o "$REPORT_FILE" --sandbox workspace-write \
  "审查当前分支的代码质量：
1. 统计代码行数变化（相比昨天）
2. 找出新增的 TODO 和 FIXME
3. 检查是否有未处理的 lint 警告
4. 生成一份 Markdown 格式的报告"

echo "报告已生成: $REPORT_FILE"
```

把脚本加到 cron 里，每天早上 8 点跑：

```bash
0 8 * * * cd /path/to/project && ./daily-code-review.sh
```

**任务三：开发一个自定义 Skill**

为一个你频繁执行的任务创建一个 Skill。比如"新 API 端点脚手架"：

```markdown
---
name: new-api-endpoint
description: 创建一个新的 REST API 端点，包括路由、控制器、测试
---

创建一个新的 API 端点：

1. 在 routes/ 下添加路由定义
2. 在 controllers/ 下创建控制器
3. 在 services/ 下创建业务逻辑
4. 在 tests/ 下写单元测试
5. 更新 API 文档

遵循项目现有的代码风格和错误处理模式。
使用 AGENTS.md 中定义的技术栈和规范。
```

### 进阶期时间投入

- 阅读文章：约 8-10 小时（11 篇文章）
- 实践操作：约 15-20 小时（3 个任务 + 复杂场景实战）
- 总计：约 2 周，每天投入 2-3 小时

---

## 5. 专家期（持续）

### 目标

深入 Codex 的底层机制，参与社区贡献，构建团队级的 Codex 工程体系。这个阶段没有明确的"完成"标志，而是持续学习和实践。

### 推荐阅读

| 优先级 | 文章编号 | 标题 | 阅读重点 |
|--------|---------|------|---------|
| 必读 | 37 | MCP 工具开发实战 | 自定义工具的开发流程 |
| 必读 | 38 | Skills 技能开发 | 高级 Skill 设计 |
| 必读 | 41 | Plugins 插件开发 | 扩展 Codex 的能力 |
| 必读 | 52 | Codex SDK 编程接入 | 编程式集成 |
| 推荐 | 39 | Hooks 钩子机制 | 生命周期钩子 |
| 推荐 | 42 | Memories 记忆系统 | 持久化上下文 |
| 推荐 | 47 | 执行策略 | 高级执行控制 |
| 推荐 | 53 | App Server 模式 | 服务化部署 |
| 推荐 | 57 | OpenTelemetry 可观测性 | 监控和追踪 |
| 推荐 | 58 | 安全插件与合规 | 企业级安全 |
| 深入 | 71 | Codex vs Claude Code vs Cursor | 工具选型的全局视角 |

### 专家期实践方向

**方向一：阅读 Codex 源码**

Codex 是开源的（github.com/openai/codex）。对 Rust 感兴趣的人可以深入阅读以下模块：

| 源码目录 | 内容 | 学习价值 |
|---------|------|---------|
| `codex-rs/core/` | Agent 循环核心 | 理解 Agent 的推理-执行循环 |
| `codex-rs/tui/` | TUI 界面 | 学习 Ratatui 框架 |
| `codex-rs/exec/` | exec 模式 | 理解非交互执行 |
| `codex-rs/linux-sandbox/` | Linux 沙箱 | 理解 Bubblewrap + Landlock |
| `codex-rs/mcp-server/` | MCP 服务器 | 理解双向 MCP 架构 |
| `codex-rs/network-proxy/` | 网络代理 | 理解域名级网络控制 |

不需要读懂每一行代码。建议从 `codex-rs/core/src/` 开始，追踪一个完整的请求从接收到执行的流程。

**方向二：构建团队 Skills 库**

为你的团队创建一套标准化的 Skills，check 进代码仓库共享：

```markdown
skills/
├── new-api-endpoint.md    # 新 API 端点脚手架
├── code-review.md         # 代码审查模板
├── security-audit.md      # 安全审计清单
├── db-migration.md        # 数据库迁移脚本生成
└── test-coverage.md       # 测试覆盖率提升
```

每个 Skill 包含：触发条件、执行步骤、验证方式、输出格式。团队成员在 AGENTS.md 中引用这些 Skills。

**方向三：企业级 Codex 部署**

如果你负责团队的 Codex 部署，需要关注：

- 统一的 `config.toml` 模板（安全策略、审批规则、MCP 服务器）
- SSO/SAML 集成（第 55 篇）
- 审计日志和 OpenTelemetry（第 57 篇）
- 权限 Profile 的标准化（第 32 篇）
- CI/CD 流水线中的 Codex 集成（第 50/51 篇）

---

## 6. 推荐练习项目

五个由浅入深的练习项目，覆盖 Codex 的核心能力。

### 项目一：README 生成器（入门级）

**目标**：给任意项目自动生成 README.md

**练习要点**：代码阅读、文件创建、Markdown 格式

```bash
codex "阅读整个项目的代码，生成一份完整的 README.md，包括：
1. 项目简介
2. 安装步骤
3. 使用方法
4. 技术栈
5. 项目结构
6. 贡献指南"
```

**预期耗时**：30 分钟
**学到什么**：Codex 的代码理解能力、文件创建、基本的项目分析

### 项目二：依赖审计工具（入门-中级）

**目标**：让 Codex 分析项目依赖，找出过时的和有安全漏洞的包

**练习要点**：命令执行、网络搜索、报告生成

```bash
codex "审计这个项目的依赖：
1. 列出所有依赖和它们的版本
2. 检查哪些有已知的安全漏洞
3. 标记哪些已经过时
4. 生成一份 Markdown 格式的审计报告"
```

**预期耗时**：1 小时
**学到什么**：shell 命令执行、网络搜索、结构化输出

### 项目三：测试覆盖率提升（中级）

**目标**：为指定模块把测试覆盖率从当前值提升到 80% 以上

**练习要点**：代码理解、测试编写、命令执行、迭代改进

```bash
codex "分析 src/utils/ 目录下的代码，当前测试覆盖率是多少？
写测试把覆盖率提升到 80% 以上。
要求：
- 每个测试文件对应一个源文件
- 覆盖正常路径和边界情况
- 跑完测试确认全部通过"
```

**预期耗时**：2-3 小时
**学到什么**：多文件编辑、测试框架集成、迭代执行

### 项目四：跨文件重构（中级-高级）

**目标**：把一个 Express 项目的 JavaScript 代码迁移到 TypeScript

**练习要点**：多文件批量编辑、类型系统、构建配置

```bash
codex "把这个 Express 项目从 JavaScript 迁移到 TypeScript：
1. 添加 TypeScript 配置（tsconfig.json）
2. 把所有 .js 文件改成 .ts
3. 添加类型定义和接口
4. 更新构建脚本
5. 确保现有测试仍然通过
6. 更新 AGENTS.md 中的技术栈描述"
```

**预期耗时**：3-5 小时
**学到什么**：大规模文件修改、构建系统配置、项目规则更新

### 项目五：CI/CD 自动修复 Agent（高级）

**目标**：在 GitHub Actions 中集成 Codex，CI 失败时自动生成修复 PR

**练习要点**：exec 模式、GitHub Actions、自动化脚本、沙箱配置

**步骤**：

1. 写一个 GitHub Action workflow，在测试失败时触发
2. 调用 `codex exec` 分析失败原因并生成修复
3. 自动创建 fix 分支和 PR
4. 配置沙箱和审批策略确保安全

```yaml
# .github/workflows/auto-fix.yml
name: Auto Fix
on:
  workflow_run:
    workflows: ["Test"]
    types: [completed]
    conclusion: failure

jobs:
  auto-fix:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Analyze and Fix
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          codex exec "CI 测试失败了。阅读测试日志，找出失败原因，修复代码。" \
            --sandbox workspace-write \
            -o fix-report.md
      - name: Create Fix PR
        # ... 创建 PR 的步骤
```

**预期耗时**：5-8 小时
**学到什么**：完整的 CI/CD 集成、自动化 Agent、企业级安全配置

---

## 7. 外部学习资源

除了本系列文章，以下外部资源也值得关注。

### 官方文档

| 资源 | 地址 | 说明 |
|------|------|------|
| OpenAI 开发者文档 | developers.openai.com/codex | CLI、App、IDE、Web 的完整官方文档 |
| Codex CLI 仓库 | github.com/openai/codex | 源码、Issues、Discussions、Releases |
| Codex App 发布博客 | openai.com/index/introducing-the-codex-app | App 功能的官方介绍 |
| Codex 概念文档 | developers.openai.com/codex/concepts | 沙箱、审批、MCP 等概念解释 |
| Codex 配置参考 | developers.openai.com/codex/config-reference | config.toml 的完整字段说明 |
| Codex CLI 命令参考 | developers.openai.com/codex/cli | CLI 所有命令和标志的文档 |

### 社区资源

| 资源 | 地址 | 说明 |
|------|------|------|
| GitHub Discussions | github.com/openai/codex/discussions | 用户问答、功能建议、最佳实践 |
| GitHub Issues | github.com/openai/codex/issues | Bug 报告、功能请求 |
| Reddit r/codex | reddit.com/r/codex | 用户讨论、使用技巧 |
| Reddit r/ChatGPTCoding | reddit.com/r/ChatGPTCoding | 更广泛的 AI 编程讨论 |
| Discord | 通过 Codex 官网进入 | 实时聊天和问答 |

### 推荐博客和文章

| 资源 | 内容 |
|------|------|
| [termdock.com Codex vs Claude Code 对比](https://www.termdock.com/en/blog/claude-code-vs-codex-cli) | 第三方深度对比，包含基准测试 |
| [agent-safehouse.dev Codex 沙箱分析](https://agent-safehouse.dev/docs/agent-investigations/codex) | 独立安全研究，详细的沙箱拆解 |
| OpenAI Engineering Blog | OpenAI 工程团队的博客，偶尔有 Codex 相关的技术文章 |
| Simon Willison's Blog | 经常写 AI 编程工具的使用体验和对比 |

### YouTube 教程

YouTube 上有不少 Codex CLI 的使用教程，搜索以下关键词能找到：

- "Codex CLI tutorial"
- "OpenAI Codex CLI workflow"
- "Codex CLI vs Claude Code"

注意筛选：优先看发布时间在 2026 年的视频（工具更新快，旧视频可能过时），优先看有实际项目演示的视频（不只是功能介绍），优先看有 GitHub 仓库配套的视频（可以跟着做）。

---

## 8. 常见问题排查路径

遇到问题时，按以下顺序查找解决方案。

### 问题分类与对应文章

| 问题类别 | 典型症状 | 先查这些文章 |
|---------|---------|-------------|
| 安装/启动失败 | 命令找不到、启动报错、权限问题 | 02、03 |
| 认证问题 | 登录失败、API Key 无效、额度用完 | 03、06 |
| 代码编辑问题 | 不改文件、改错文件、改得不完整 | 08、11、59 |
| 命令执行问题 | 命令被拦截、执行失败、沙箱报错 | 09、29、30 |
| 上下文问题 | 对话太长质量下降、忘记早期指令 | 11、13、42 |
| 安全问题 | 权限错误、沙箱阻止合法操作 | 29、30、31、32 |
| MCP 问题 | 服务器连不上、工具调用失败 | 36、37 |
| 多 Agent 问题 | 子代理不触发、线程冲突、token 爆炸 | 43、44、45、46 |
| CI/CD 问题 | exec 模式失败、输出格式不对 | 48、50、51 |
| 性能问题 | 响应慢、token 消耗大 | 06、11、59 |
| 配置问题 | 配置不生效、优先级冲突 | 22、23、27 |

### 排查流程

```
遇到问题
├── 1. 查本系列对应文章 → 大部分问题有解答
├── 2. 查 GitHub Issues → 搜索是否有人报过同样的 bug
├── 3. 查 GitHub Discussions → 搜索是否有讨论和临时解决方案
├── 4. 查官方文档 → developers.openai.com/codex
└── 5. 提问 → 在 Discussions 中发帖，附上版本号和错误日志
```

---

## 9. 社区参与方式

### GitHub Issues：报 Bug

如果你发现了 Codex 的 bug，在 github.com/openai/codex/issues 提交。好的 bug 报告包含：

1. **版本号**：`codex --version` 的输出
2. **操作系统**：macOS 15.4 / Ubuntu 24.04 / Windows 11
3. **复现步骤**：最小可复现的步骤序列
4. **预期行为**：你期望发生什么
5. **实际行为**：实际发生了什么
6. **日志**：如果可以，附上 `--debug` 输出

### GitHub Discussions：问问题和分享经验

Discussions 是更适合问问题和分享使用技巧的地方。几个活跃的讨论分类：

- **Q&A**：使用问题、配置疑惑
- **Ideas**：功能建议、改进想法
- **Show and tell**：你的 Codex 工作流、自定义 Skills、有趣的使用案例
- **General**：其他讨论

### 贡献代码

Codex 是开源项目，接受社区 PR。贡献流程：

1. Fork 仓库
2. 创建 feature branch
3. 写代码 + 测试
4. 提交 PR，描述改动内容和原因

注意：Codex 用 Rust 写的，贡献代码需要 Rust 基础。但不是只有写代码才能贡献——文档改进、Bug 报告、使用反馈都是有价值的贡献。

### 社区贡献的其他方式

- **写 MCP 服务器**：为常用工具（Jira、Slack、数据库等）开发 MCP 服务器，发布到 npm 或 PyPI
- **写 Skills**：把你的 Codex 使用经验打包成 Skills，分享给社区
- **写博客/教程**：分享你的 Codex 使用经验和最佳实践
- **回答问题**：在 Discussions 和 Reddit 上帮助其他用户

---

## 10. 保持更新

AI 编程工具更新很快。以下是跟踪 Codex 版本更新和新功能的方式。

### 版本跟踪

| 渠道 | 说明 |
|------|------|
| GitHub Releases | github.com/openai/codex/releases — 每个版本的 changelog |
| npm 版本号 | `npm info @openai/codex version` — 查看最新版本 |
| Codex 官方博客 | openai.com/blog — 重大功能发布 |
| GitHub Discussions Announcements | 官方发布的功能公告和更新说明 |
| X/Twitter @OpenAIDevs | 开发者相关的更新和技巧 |

### 更新频率

Codex CLI 的更新频率大约是每 1-2 周一个小版本，每 1-2 个月一个大版本。小版本主要是 bug 修复和性能改进，大版本可能有新功能或破坏性变更。

更新方法：

```bash
npm update -g @openai/codex
```

### 关注新功能的方向

根据 Codex 仓库的公开信息（Issues、Discussions、PR）和行业趋势，以下是一些值得关注的方向：

- **更强大的多 Agent 协作**：更灵活的 Agent 间通信、更智能的任务分解
- **更多云端能力**：Codex Cloud 的功能扩展、更多的云端集成
- **更完善的 MCP 生态**：更多的官方 MCP 服务器、更好的兼容性
- **更强的安全控制**：更精细的权限系统、更好的企业合规支持
- **更多 IDE 支持**：除了 VS Code 和 JetBrains，可能会有更多的编辑器支持

---

## 11. 和其他 AI 编程工具的协同学习路线

如第 71 篇所述，Codex CLI 不是唯一的 AI 编程工具。以下是学习多个工具的建议路线。

### 推荐学习顺序

```
第一步：Cursor（入门）
    → 理解 AI 辅助编程的基本体验（Tab 补全、编辑器内对话）
    → 学习成本最低，5 分钟上手

第二步：Codex CLI 或 Claude Code（进阶）
    → 理解 Agent 模式的编程方式（任务描述 → 自主执行）
    → 选择一个深入学，不要同时学两个

第三步：学另一个 Agent 工具（补充）
    → 对比不同工具的优劣势
    → 建立自己的工具组合

第四步：深入一个工具的底层机制（专家）
    → 阅读源码、开发扩展、参与社区
```

### 学习交叉点

学 Codex CLI 时，以下概念在其他工具中也存在，可以互相参照：

| Codex 概念 | Claude Code 对应 | Cursor 对应 |
|-----------|-----------------|------------|
| AGENTS.md | CLAUDE.md | .cursorrules |
| config.toml | JSON settings | 设置面板 |
| MCP 服务器 | MCP 服务器（相同协议） | 不支持 |
| Skills | Slash Commands | Cursor Rules |
| 审批模式 | 权限控制 | Agent 确认 |
| 沙箱 | 沙箱（类似实现） | 基本隔离 |
| /fork /side | 分叉对话 | 不支持 |
| codex exec | claude -p | 不适用 |

理解这些概念的对应关系，可以大幅降低学习新工具的成本。你在 Codex 中学会的 Agent 编程思维（任务描述、审批策略、上下文管理）是通用的——换一个工具只需要学新的界面和配置方式。

---

## 12. 总结

把四个阶段的关键信息浓缩成一张表：

| 阶段 | 时间 | 核心目标 | 关键文章 | 关键实践 |
|------|------|---------|---------|---------|
| 入门期 | 1-2 周 | 安装、基本使用 | 01-07 | 3 个入门任务 |
| 熟练期 | 3-4 周 | 配置、安全、扩展 | 08-36（12 篇重点） | AGENTS.md + 沙箱 + MCP |
| 进阶期 | 5-6 周 | 多 Agent、自动化 | 43-59（11 篇重点） | 并行 Agent + CI 脚本 |
| 专家期 | 持续 | 深入机制、团队体系 | 37/38/41/52 + 源码 | Skills 库 + 企业部署 |

最后几点建议：

1. **不要试图一次读完所有文章**。按阶段、按角色、按需求阅读。本系列是参考手册，不是小说。
2. **实践比阅读重要**。每读 2-3 篇文章，就花等量的时间实际使用 Codex。只有动手做了，知识才会变成你的。
3. **遇到问题先查文章**。本系列 72 篇文章覆盖了绝大多数使用场景和常见问题。在提问之前，先用对应的关键词搜索。
4. **关注更新**。AI 编程工具迭代很快，半年前的知识可能已经过时。定期查看 GitHub Releases 和官方文档的更新。
5. **参与社区**。你的使用经验、Bug 报告、功能建议对社区有价值。同时社区也是你持续学习的重要渠道。

---

## 延伸阅读

- [第 71 篇：Codex vs Claude Code vs Cursor 全面对比](71-comparison.md) — 理解不同工具的定位，辅助选择
- [第 01 篇：Codex 是什么](01-what-is-codex.md) — 回到起点，全局视角重新审视
- [第 59 篇：提示工程](59-prompt-engineering.md) — 写好提示是所有阶段的核心技能
- [Codex CLI GitHub 仓库](https://github.com/openai/codex) — 源码、Issues、Discussions
- [OpenAI 开发者文档](https://developers.openai.com/codex) — 官方文档，持续更新
