# Claude Code 资料与项目索引

> 更新日期：2026-05-25  
> 范围：Claude Code CLI、Claude Code GitHub Actions、Claude Agent SDK、CLAUDE.md、slash commands、hooks、subagents、skills、plugins、MCP，以及围绕 Claude Code 的学习资料、生态项目和评测研究。

Claude Code 不只是一个“终端里的聊天式代码助手”。从当前生态看，它更像一个高度可配置的 agentic coding harness：

- **CLI**：在终端里读代码、改代码、跑命令、做多文件任务。
- **CLAUDE.md / Memory**：把项目规范、常用命令、架构约定写成长期上下文。
- **Slash Commands**：把常用工作流沉淀成 `/review`、`/fix-issue`、`/commit` 这类命令。
- **Hooks**：在工具调用、提交、停止、权限请求等事件上插入自动化和安全检查。
- **Subagents / Agent Teams**：把研究、审查、实现、测试等任务拆给隔离上下文里的专门 agent。
- **Skills / Plugins**：把可复用知识、脚本、资源和工作流打包复用。
- **MCP**：连接 GitHub、Linear、Slack、数据库、浏览器、Figma、监控系统等外部工具。
- **GitHub Actions / SDK**：把 Claude Code 放进 PR、Issue、CI/CD 和内部自动化系统。

## 推荐阅读顺序

如果你刚开始了解 Claude Code，建议按这个顺序看：

1. [Claude Code overview](https://docs.anthropic.com/en/docs/claude-code/overview)
2. [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices)
3. [Common workflows](https://docs.anthropic.com/en/docs/claude-code/common-workflows)
4. [Manage Claude's memory](https://docs.anthropic.com/en/docs/claude-code/memory)
5. [Slash commands](https://docs.anthropic.com/en/docs/claude-code/slash-commands)
6. [MCP in Claude Code](https://docs.anthropic.com/en/docs/claude-code/mcp)
7. [Hooks reference](https://docs.anthropic.com/en/docs/claude-code/hooks)
8. [Create custom subagents](https://code.claude.com/docs/en/sub-agents)
9. [Claude Code GitHub Actions](https://docs.anthropic.com/en/docs/claude-code/github-actions)
10. [Security](https://docs.anthropic.com/en/docs/claude-code/security)

## 官方资料

| 资源 | 类型 | 适合谁 | 价值 |
| --- | --- | --- | --- |
| [Claude Code overview](https://docs.anthropic.com/en/docs/claude-code/overview) | 官方文档 | 所有用户 | 建立 Claude Code 的整体概念：终端 agent、项目感知、MCP、脚本化和工作流。 |
| [Common workflows](https://docs.anthropic.com/en/docs/claude-code/common-workflows) | 官方指南 | 初学者、团队用户 | 提供常见任务模式，可直接转成项目内 slash command 或团队规范。 |
| [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices) | 官方工程文章 | 想提高产出的用户 | 强调清晰目标、测试/视觉反馈、迭代式协作、项目 onboarding 等高价值用法。 |
| [Manage Claude's memory](https://docs.anthropic.com/en/docs/claude-code/memory) | 官方文档 | 团队、重度用户 | 解释 CLAUDE.md 层级、项目记忆、用户记忆、导入机制和 `/memory`。 |
| [Slash commands](https://docs.anthropic.com/en/docs/claude-code/slash-commands) | 官方文档 | 想沉淀工作流的人 | 把常用 prompt、上下文、bash 命令和参数封装成可复用命令。 |
| [Settings](https://docs.anthropic.com/en/docs/claude-code/settings) | 官方文档 | 团队管理员、重度用户 | 管理权限、环境变量、MCP、commands、hooks、subagents 等配置层级。 |
| [MCP in Claude Code](https://docs.anthropic.com/en/docs/claude-code/mcp) | 官方文档 | 想接外部工具的人 | 连接 GitHub、数据库、Slack、Figma、浏览器等外部服务。 |
| [Hooks reference](https://docs.anthropic.com/en/docs/claude-code/hooks) | 官方文档 | 想做自动化和治理的人 | 在工具调用和生命周期事件上做审计、拦截、通知、自动测试。 |
| [Create custom subagents](https://code.claude.com/docs/en/sub-agents) | 官方文档 | 复杂任务用户 | 创建专门 agent，隔离上下文、工具、权限、模型和任务边界。 |
| [GitHub Actions](https://docs.anthropic.com/en/docs/claude-code/github-actions) | 官方文档 | DevOps、平台团队 | 在 PR、Issue、CI/CD 里运行 Claude Code，可通过 `@claude` 触发。 |
| [Security](https://docs.anthropic.com/en/docs/claude-code/security) | 官方文档 | 企业用户、安全团队 | 说明权限架构、prompt injection 防护、MCP 风险、团队安全实践。 |
| [Agent SDK features](https://code.claude.com/docs/en/agent-sdk/claude-code-features) | 官方文档 | 工具开发者 | 在 SDK 中使用 hooks、MCP、subagents、settings 等 Claude Code 能力。 |
| [Extend Claude Code](https://code.claude.com/docs/en/features-overview) | 官方文档 | 架构设计者 | 给出 CLAUDE.md、skills、subagents、hooks、MCP、plugins 的 mental model。 |

## 官方项目

| 项目 | 类型 | 能带来什么 |
| --- | --- | --- |
| [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action) | 官方 GitHub Action | 在 PR、Issue 和 automation workflow 里运行 Claude Code。支持代码审查、实现简单修复、Issue 处理、结构化输出、云厂商认证等。 |
| [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) | 官方 SDK | 把 Claude Code 的 agent loop、hooks、MCP、subagents 等能力嵌入自定义应用和内部平台。 |

## 学习资料

### 入门和官方学习路径

| 资源 | 语言 | 价值 |
| --- | --- | --- |
| [Claude Code overview](https://docs.anthropic.com/en/docs/claude-code/overview) | 英文 | 官方起点，适合了解 Claude Code 是什么、能做什么、如何进入工作流。 |
| [Common workflows](https://docs.anthropic.com/en/docs/claude-code/common-workflows) | 英文 | 官方任务手册，适合把日常工作流转成可复用命令。 |
| [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices) | 英文 | Anthropic 工程团队视角，适合学习真实使用习惯，而不是只看命令表。 |
| [Claude Code user FAQ](https://support.claude.com/en/articles/14554922-claude-code-user-faq) | 英文 | 面向用户的 FAQ，适合理解 MCP、hooks、subagents、commands 的常见疑问。 |
| [Claude Code 中文文档：subagents](https://code.claude.com/docs/zh-CN/sub-agents) | 中文 | 官方中文页面之一，适合中文用户理解 subagents 的场景和限制。 |
| [Claude Code 中文网](https://www.claude-cn.org/) | 中文 | 中文教程聚合站，可作为入门参考。需要定期检查是否和官方版本同步。 |
| [Claude Code 教程中文](https://www.cccode.dev/) | 中文 | 中文入门教程。适合初学者，但重要配置仍应回到官方文档确认。 |

### 进阶资料

| 资源 | 类型 | 价值 |
| --- | --- | --- |
| [Claude Code Advanced Patterns](https://resources.anthropic.com/hubfs/Claude%20Code%20Advanced%20Patterns_%20Subagents%2C%20MCP%2C%20and%20Scaling%20to%20Real%20Codebases.pdf) | 官方 PDF | 进阶讲 subagents、MCP、GitHub Actions 和真实代码库扩展方式。 |
| [How and when to use subagents in Claude Code](https://claude.com/blog/how-and-when-to-use-subagents-in-claude-code) | 官方博客 | 判断什么时候该用 subagent，什么时候留在主会话，适合复杂任务拆解。 |
| [Extend Claude Code](https://code.claude.com/docs/en/features-overview) | 官方文档 | 最适合建立“CLAUDE.md / Skills / MCP / Hooks / Subagents / Plugins 各自解决什么问题”的心智模型。 |
| [Claude Code skills vs subagents vs hooks vs plugins vs MCP](https://shrikar.com/writing/claude-code-skills-subagents-hooks-plugins-mcp) | 第三方文章 | 用表格解释几个扩展机制的差异，适合补充理解。 |
| [Dive into Claude Code](https://arxiv.org/abs/2604.14228) | 论文 | 从系统设计角度分析 Claude Code 的权限系统、上下文压缩、扩展机制和 subagent 架构。 |

## 生态项目与能带来的东西

### 1. Awesome List / 资源索引

| 项目 | 定位 | 能带来什么 | 风险 / 注意点 |
| --- | --- | --- | --- |
| [subinium/awesome-claude-code](https://github.com/subinium/awesome-claude-code) | Claude Code 资源索引 | 汇总工具、skills、plugins、MCP servers、hooks 和实践案例。适合发现生态项目。 | awesome list 需要二次筛选，不代表质量背书。 |
| [ccplugins/awesome-claude-code-plugins](https://github.com/ccplugins/awesome-claude-code-plugins) | Claude Code plugin 列表 | 聚合 slash commands、subagents、MCP servers、hooks、plugins。适合找可复用扩展。 | 插件可能执行命令或接外部服务，安装前要审计。 |
| [Claude Code Stack](https://www.claudecodestack.com/) | Claude Code 生态目录 | 按 MCP、Skills、Subagents、Hooks、Plugins、CLAUDE.md 等维度整理生态。适合调研。 | 网站目录型资源，需回到原仓库确认维护状态。 |
| [rohitg00/awesome-claude-code-toolkit](https://github.com/rohitg00/awesome-claude-code-toolkit) | 大型工具包 | 提供 agents、skills、commands、plugins、hooks、rules、templates、MCP configs 等。适合研究完整配置体系。 | 体量很大，团队使用前应挑选而不是全量安装。 |

### 2. GitHub / PR / CI 自动化

| 项目 | 定位 | 能带来什么 | 风险 / 注意点 |
| --- | --- | --- | --- |
| [anthropics/claude-code-action](https://github.com/anthropics/claude-code-action) | 官方 GitHub Action | 让 Claude Code 在 PR、Issue 和 workflow 中回答问题、review、实现修复、输出结构化结果。 | 必须控制 GitHub token、secrets、触发条件和外部贡献者权限。 |
| Claude Code GitHub App | 官方集成方式 | 通过 `/install-github-app` 配置，支持 `@claude` 触发和 PR/Issue 协作。 | 需要仓库管理员权限；团队应明确哪些仓库允许启用。 |
| [Claude Code GitHub Actions 文档](https://docs.anthropic.com/en/docs/claude-code/github-actions) | 官方示例 | 提供 workflow 配置、`claude_args`、MCP config、权限和云提供商配置。 | 示例需要按仓库风险调整，不应直接复制到敏感仓库。 |

### 3. Hooks / Skills / Subagents / Plugins

| 项目 / 资源 | 定位 | 能带来什么 | 风险 / 注意点 |
| --- | --- | --- | --- |
| [Hooks reference](https://docs.anthropic.com/en/docs/claude-code/hooks) | 官方 hooks 文档 | 在 PreToolUse、PostToolUse、Stop、Notification、SubagentStop 等事件上做自动化。 | hook 是外部命令，失败、阻塞、越权都会影响工作流。 |
| [Create custom subagents](https://code.claude.com/docs/en/sub-agents) | 官方 subagents 文档 | 创建代码审查、测试、研究、安全等专门 agent，隔离上下文和工具权限。 | subagent 不等于更聪明；任务边界不清会增加复杂度。 |
| [Plugins in the SDK](https://docs.claude.com/en/api/agent-sdk/plugins) | 官方 plugin 文档 | 通过 Agent SDK 加载 commands、agents、skills、hooks、MCP servers。 | 插件本质是可执行扩展，要按供应链依赖审查。 |
| [Agent Skills guide](https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf) | 官方 PDF | 解释如何把可复用知识、脚本和资源打包成 skill。 | skill 过多会增加发现和治理成本。 |
| [howells/arc](https://github.com/howells/arc) | Claude Code plugin / workflow | 从 idea 到实现的工作流插件，体现 skills、subagents、worktrees、tasks 的组合方式。 | 第三方插件，使用前要审查命令和权限。 |

### 4. MCP 与外部工具连接

| 资源 | 定位 | 能带来什么 | 风险 / 注意点 |
| --- | --- | --- | --- |
| [MCP in Claude Code](https://docs.anthropic.com/en/docs/claude-code/mcp) | 官方 MCP 文档 | 接 GitHub、Slack、Linear、数据库、浏览器、Figma 等外部工具。 | MCP server 不由 Anthropic 审计；权限和数据边界要自己负责。 |
| [GitHub MCP Server](https://github.com/github/github-mcp-server) | GitHub 官方 MCP | 让 Claude Code 访问 Issue、PR、Actions、仓库上下文。 | GitHub token 权限要最小化。 |
| [OpenAI Codex as MCP tool](https://github.com/tuannvm/codex-mcp-server) | 跨 agent 桥接 | 让 Claude Code 调用 Codex CLI，适合交叉 review 或多模型协作。 | 主控 agent、权限传递、失败回滚要设计清楚。 |
| [Context7](https://github.com/upstash/context7) | 文档 MCP | 获取最新库文档，减少过时 API 幻觉。 | 仍需校验版本和来源。 |

## 研究与评测资料

| 资源 | 类型 | 价值 |
| --- | --- | --- |
| [Dive into Claude Code](https://arxiv.org/abs/2604.14228) | 论文 | 系统性分析 Claude Code 的 agent loop、权限、上下文压缩、MCP、plugins、skills、hooks、subagents。 |
| [Configuring Agentic AI Coding Tools](https://arxiv.org/abs/2602.14690) | 论文 | 比较 Claude Code、Copilot、Cursor、Gemini、Codex 的配置机制，适合研究 CLAUDE.md、skills、subagents 的实际采用情况。 |
| [On the Use of Agentic Coding Manifests](https://arxiv.org/abs/2509.14744) | 论文 | 研究 Claude Code 中类似 CLAUDE.md 的 agent manifest 如何承载项目上下文和操作规则。 |
| [Decoding the Configuration of AI Coding Agents](https://arxiv.org/abs/2511.09268) | 论文 | 分析公开 Claude Code 项目的配置文件，适合了解真实用户会把什么规则写进配置。 |
| [Comparing AI Coding Agents](https://arxiv.org/abs/2602.08915) | 论文 | 从 PR 接受率角度比较 Codex、Claude Code、Cursor、Devin、Copilot。 |
| [A Task-Level Evaluation of AI Agents](https://arxiv.org/abs/2602.02345) | 论文 | 用 AIDev-pop 数据集分析多个 agent 在开源项目任务中的表现。 |
| [Engineering Pitfalls in AI Coding Tools](https://arxiv.org/abs/2603.20847) | 论文 | 研究 Claude Code、Codex、Gemini CLI 的工程缺陷和失败模式。 |
| [Prompt Injection Attacks on Agentic Coding Assistants](https://arxiv.org/abs/2601.17548) | 论文 | 研究 skills、tools、MCP 等生态中的 prompt injection 风险。 |

## 使用场景分类

### 适合优先尝试

- 读懂陌生代码库和快速 onboarding
- 多文件重构和架构迁移
- 测试补全、失败测试定位、CI 问题分析
- 代码审查和安全/性能/可维护性检查
- 文档更新和 README / changelog 维护
- 通过 `/commands` 固化团队工作流
- 用 subagents 做并行研究、并行 review、独立验证
- 用 hooks 做自动 lint、测试提醒、权限拦截和审计日志

### 适合谨慎尝试

- 自动修改生产配置
- 自动合并 PR
- 大量第三方 MCP server 同时启用
- 给 subagents 过宽的工具权限
- 让 hooks 执行复杂、有副作用的脚本
- 在不受信仓库或外部 PR 中运行高权限 GitHub Actions

### 不建议直接交给 Claude Code

- 生产数据库写操作
- 真实用户数据批量修改
- 高风险密钥、部署、权限变更
- 没有测试和回滚方案的核心业务重构
- 法务、安全、财务等最终决策
- 没有人工审查的自动化发布链路

## Claude Code 核心机制对比

| 机制 | 解决什么问题 | 适合放什么 | 不适合放什么 |
| --- | --- | --- | --- |
| CLAUDE.md | 长期项目上下文 | 架构、常用命令、风格、测试方式、安全边界 | 大段文档、临时任务、过期说明 |
| Slash Commands | 可复用工作流 | review、fix issue、commit、release、生成测试 | 需要持续后台运行的自动化 |
| Hooks | 事件驱动自动化 | 审计、阻断危险命令、运行 lint、发送通知 | 模糊推理、长时间交互任务 |
| Subagents | 隔离上下文和并行任务 | 安全 review、性能 review、测试生成、研究任务 | 必须共享完整主上下文的细粒度编辑 |
| Skills | 可复用知识和操作包 | 框架规范、部署流程、领域知识、脚本资源 | 永远都要加载的短规则 |
| Plugins | 打包分发扩展能力 | commands、agents、skills、hooks、MCP 的组合 | 未审计的团队级默认安装 |
| MCP | 连接外部工具和数据 | GitHub、Linear、Slack、DB、浏览器、Figma、文档 | 不可信服务、过宽权限、敏感数据裸奔 |
| GitHub Actions | CI/PR/Issue 自动化 | 自动 review、Issue triage、简单修复、结构化输出 | 无边界的自动提交、自动合并 |

## CLAUDE.md 最佳实践模板

可参考资料：

- [Manage Claude's memory](https://docs.anthropic.com/en/docs/claude-code/memory)
- [Claude Code settings](https://docs.anthropic.com/en/docs/claude-code/settings)
- [Claude Code best practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [On the Use of Agentic Coding Manifests](https://arxiv.org/abs/2509.14744)

推荐模板：

```md
# CLAUDE.md

## Project Context

- This repository is ...
- Primary stack:
- Main services / packages:
- Important directories:

## Commands

- Install:
- Lint:
- Type check:
- Test:
- Build:
- Run locally:

## Working Rules

- Keep changes scoped to the requested task.
- Prefer existing patterns and local helper APIs.
- Do not introduce new dependencies without explaining why.
- Update docs when changing behavior or public APIs.

## Testing Expectations

- Run the smallest relevant test first.
- Add or update tests when changing behavior.
- If tests cannot be run, explain why and list the unverified risk.

## Architecture Notes

- Key boundaries:
- Data flow:
- External services:
- Generated files:

## Safety Boundaries

- Do not touch production secrets, tokens, or deployment credentials.
- Do not run destructive commands without explicit approval.
- Do not modify generated artifacts unless the source is updated.
- Do not make production database writes.

## Review Checklist

- Summary of changes
- Tests run
- Risks and assumptions
- Files needing human review
```

## Claude Code GitHub Actions 安全模板

基础模板：

```yaml
name: Claude Code PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  claude-review:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest

    steps:
      - name: Checkout pull request
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: Run Claude Code review
        uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Review this pull request for:
            - correctness bugs
            - missing tests
            - security risks
            - breaking changes
            - unclear behavior

            Do not make changes. Return concise findings with file references.
          claude_args: "--max-turns 5"
```

安全注意：

- 默认先做 review，不自动 push 修复。
- 对外部贡献者 PR 使用更严格触发条件。
- 不要在不受信 PR 上用高权限 token 执行任意脚本。
- `permissions` 最小化。需要评论才给 `pull-requests: write`，不要默认给 `contents: write`。
- secrets 只通过 GitHub secrets 传入，不写入 prompt、日志或 checkout 内容。
- MCP 配置要显式审计，不要让 CI 里的 Claude 连接不必要的外部服务。

## Claude Code + MCP 典型组合

| 组合 | 适合场景 | 风险 |
| --- | --- | --- |
| Claude Code + GitHub MCP | Issue / PR / Actions / repo context，适合 review、triage、修 CI。 | GitHub token 权限要最小化。 |
| Claude Code + Context7 | 获取最新库文档，减少过时 API 和幻觉。 | 仍需确认文档版本。 |
| Claude Code + Playwright | 前端交互测试、截图验证、UI 回归。 | 浏览器可能访问外部站点，注意账号和 cookies。 |
| Claude Code + Linear / Jira | 把产品需求、Issue、验收标准接入 coding workflow。 | 任务描述可能带 prompt injection，要限制执行权限。 |
| Claude Code + Slack | 通知、状态汇报、触发任务。 | 不要让 Slack 消息直接驱动高权限操作。 |
| Claude Code + Database MCP | 数据分析、schema 查询、只读诊断。 | 优先只读账号，禁止生产写操作。 |

## 横向评测资料

目前没有找到一个同时覆盖 **Claude Code、Codex、Cursor、Cline、Gemini CLI** 且公开完整任务集、原始输出和评分规则的高质量同任务评测。可参考资料：

| 资源 | 覆盖范围 | 能带来什么 | 注意点 |
| --- | --- | --- | --- |
| [CCBench](https://ccbench.org/) | Claude Code、Codex CLI、Gemini CLI 等 | 真实小型代码库任务评估，可作为 benchmark 参考。 | 未必覆盖 Cline；要看具体模型版本。 |
| [Comparing AI Coding Agents](https://arxiv.org/abs/2602.08915) | Codex、Claude Code、Cursor、Devin、Copilot | 按 PR 任务类型分析 agent 表现。 | 不覆盖 Cline 和 Gemini CLI。 |
| [Configuring Agentic AI Coding Tools](https://arxiv.org/abs/2602.14690) | Claude Code、Copilot、Cursor、Gemini、Codex | 比较配置机制，不是能力榜单。 | 适合研究 CLAUDE.md、skills、subagents 等配置生态。 |
| [Engineering Pitfalls in AI Coding Tools](https://arxiv.org/abs/2603.20847) | Claude Code、Codex、Gemini CLI | 分析工程失败模式。 | 不覆盖 Cursor 和 Cline。 |
| [Dive into Claude Code](https://arxiv.org/abs/2604.14228) | Claude Code | 深入理解 Claude Code 系统设计。 | 不是横向评测，但对构建评测维度很有价值。 |

建议后续自建评测：

- 固定工具版本、模型、预算、允许命令、上下文和运行次数。
- 任务覆盖 bug fix、测试补全、重构、前端 UI、依赖升级、CI 修复、文档更新。
- 记录 diff、测试结果、耗时、token/费用、人工修正量、越权行为。
- 对 Claude Code 单独评测 hooks、subagents、CLAUDE.md、MCP 是否真的提升稳定性。

## 评测维度建议

| 维度 | 看什么 |
| --- | --- |
| 使用价值 | 是否能稳定完成真实开发任务 |
| 上手成本 | 安装、登录、权限、CLAUDE.md、MCP 配置是否顺畅 |
| 代码理解 | 是否能跨文件、跨模块理解项目 |
| 修改质量 | 代码风格、边界情况、错误处理、类型安全 |
| 测试意识 | 是否主动运行测试、补测试、处理失败 |
| 可控性 | 权限、hooks、settings、diff、回滚是否清晰 |
| 上下文管理 | CLAUDE.md、memory、compaction、subagents 是否稳定 |
| 工作流沉淀 | slash commands、skills、plugins 是否能降低重复成本 |
| 集成能力 | GitHub Actions、MCP、SDK、CI/CD、Issue/PR 流程 |
| 安全风险 | prompt injection、MCP 权限、secrets、shell 执行、CI token |

## 当前判断

Claude Code 最值得关注的地方不是单次代码生成，而是它围绕 agentic coding 形成了一套非常完整的可配置工作流：

- **CLAUDE.md** 负责项目长期上下文。
- **Commands** 负责常用操作入口。
- **Hooks** 负责自动化和治理。
- **Subagents** 负责隔离和并行。
- **Skills / Plugins** 负责可复用能力包。
- **MCP** 负责连接外部工具和数据。
- **GitHub Actions / SDK** 负责工程平台集成。

因此，Claude Code 适合放在 AI Coding 工具评测的高优先级位置。它的核心评测问题应该是：

> Claude Code 能否把复杂软件工程任务拆解成可监督、可审查、可复用、可治理的 agent 工作流？

## 待补充

- Claude Code 与 Codex、Cursor、Cline、Gemini CLI 的同任务横向评测
- Claude Code hooks / subagents / skills / MCP 的真实工程案例
- Claude Code Action 在公共仓库、私有仓库、外部贡献者 PR 中的安全配置差异
- CLAUDE.md 中文模板和反模式清单
- Claude Code 中文资料质量筛选
- Claude Code 与 Codex 的互相 review 工作流
