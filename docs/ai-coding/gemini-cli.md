# Gemini CLI 资料与项目索引

> 更新日期：2026-05-25  
> 范围：Gemini CLI、Google Gemini CLI GitHub Actions、GEMINI.md / settings、MCP、extensions、sandbox、checkpointing、迁移到 Antigravity CLI、学习资料和安全研究。

Gemini CLI 是 Google 推出的开源终端 AI agent。它曾经是 Gemini 进入开发者终端的主要入口，但 Google 已在 2026-05-19 宣布将 Gemini CLI 迁移到 Antigravity CLI。对个人和免费用户来说，**2026-06-18** 是一个关键日期：Gemini CLI 和 Gemini Code Assist IDE extensions 将停止为 Google AI Pro / Ultra 以及个人免费用户服务。

因此，这个专题应同时关注两件事：

- 现有 Gemini CLI 的能力、生态和安全边界。
- Gemini CLI 到 Antigravity CLI 的迁移风险和替代路径。

## 推荐阅读顺序

1. [Google Developers Blog: transitioning Gemini CLI to Antigravity CLI](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
2. [Gemini CLI docs](https://google-gemini.github.io/gemini-cli/docs/)
3. [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli)
4. [Gemini CLI for Gemini Code Assist](https://developers.google.com/gemini-code-assist/docs/gemini-cli)
5. [Gemini CLI commands](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md)
6. [Gemini CLI configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md)
7. [Gemini CLI sandbox](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/sandbox.md)
8. [run-gemini-cli GitHub Action](https://github.com/google-github-actions/run-gemini-cli)

## 官方资料

| 资源 | 类型 | 适合谁 | 价值 |
| --- | --- | --- | --- |
| [Transitioning Gemini CLI to Antigravity CLI](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/) | 官方公告 | 所有 Gemini CLI 用户 | 说明迁移原因、保留能力、Antigravity CLI 和 2026-06-18 时间点。 |
| [Gemini CLI docs](https://google-gemini.github.io/gemini-cli/docs/) | 官方文档 | 所有用户 | 安装、使用、配置、开发和架构入口。 |
| [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli) | 官方开源仓库 | 工具研究者 | 了解 CLI 架构、core package、配置、sandbox、extensions、MCP。 |
| [Gemini Code Assist: Gemini CLI](https://developers.google.com/gemini-code-assist/docs/gemini-cli) | 官方文档 | Google 生态用户 | 解释 Gemini CLI 与 Gemini Code Assist 的关系。 |
| [Commands](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md) | 官方文档 | 重度用户 | 内置命令、custom commands、extensions、GitHub Actions setup。 |
| [Configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md) | 官方文档 | 团队用户 | settings、MCP servers、sandbox、checkpointing、工具控制。 |
| [Sandbox](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/sandbox.md) | 官方文档 | 安全团队、重度用户 | 理解命令执行隔离、sandbox expansion request、风险边界。 |
| [Extensions reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md) | 官方文档 | 扩展开发者 | 把 commands、MCP、上下文和工作流打包成 extension。 |
| [run-gemini-cli](https://github.com/google-github-actions/run-gemini-cli) | 官方 GitHub Action | DevOps、平台团队 | 在 PR、Issue、CI 中运行 Gemini CLI 做 review、triage、修改。 |

## 学习资料

| 资源 | 类型 | 价值 |
| --- | --- | --- |
| [Gemini CLI docs](https://google-gemini.github.io/gemini-cli/docs/) | 官方文档 | 当前最可靠入口。 |
| [Commands reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md) | 官方参考 | 了解 `/review`、extensions、custom commands、GitHub Actions 等能力。 |
| [Configuration reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md) | 官方参考 | 学习 settings、MCP、sandbox、checkpointing 的配置方式。 |
| [TechTarget: Gemini CLI GitHub Actions](https://www.techtarget.com/searchsoftwarequality/news/366628210/Google-adds-Gemini-CLI-for-GitHub-Actions-coding-agent) | 新闻 / 解读 | 了解 Gemini CLI 进入 GitHub Actions 的背景。 |

## 生态项目与能带来的东西

### 1. 官方 GitHub / CI 自动化

| 项目 | 定位 | 能带来什么 | 风险 / 注意点 |
| --- | --- | --- | --- |
| [google-github-actions/run-gemini-cli](https://github.com/google-github-actions/run-gemini-cli) | 官方 GitHub Action | PR review、Issue triage、代码分析、自动修改、`@gemini-cli` 协作。 | 需要关注 token、secrets、workflow 权限和不受信 PR。 |
| Gemini CLI GitHub Actions setup | 官方命令 | 通过 CLI 命令配置 GitHub Actions 自动化。 | 自动化前要明确是否允许写 PR、写 issue、执行命令。 |

### 2. MCP / Extensions

| 项目 / 资源 | 定位 | 能带来什么 | 风险 / 注意点 |
| --- | --- | --- | --- |
| [Gemini CLI MCP commands](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md) | 官方 CLI 参考 | `gemini mcp add`、限制工具、管理 MCP server。 | MCP 工具越多，权限面越大。 |
| [Gemini CLI extensions](https://github.com/google-gemini/gemini-cli/blob/main/docs/extensions/reference.md) | 官方扩展机制 | 打包 commands、MCP servers、工作流和上下文。 | extension 安装前需要审查来源和脚本。 |
| [gemini-cli-extensions/mcp-toolbox](https://github.com/gemini-cli-extensions/mcp-toolbox) | 社区 MCP toolbox | 提供 Gemini CLI extension 形式的 MCP 集合。 | 社区项目，注意维护状态和权限。 |
| [GitHub topic: gemini-cli-extensions](https://github.com/topics/gemini-cli-extensions) | 生态索引 | 发现 Google Apps Script、PostgreSQL、MCP 等扩展。 | 质量参差，需要二次筛选。 |

### 3. 安全与供应链

| 资源 | 类型 | 价值 |
| --- | --- | --- |
| [Gemini CLI sandbox](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/sandbox.md) | 官方文档 | 理解命令执行隔离和 sandbox expansion。 |
| [CSA Gemini CLI supply chain note](https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/05/CSA_research_note_gemini_cli_supply_chain_CVSS10_20260506-csa-styled.pdf) | 安全报告 | 关注 Gemini CLI / GitHub Action 在 CI/CD 中的供应链风险。 |
| [CSA Gemini CLI RCE note](https://labs.cloudsecurityalliance.org/wp-content/uploads/2026/05/CSA_research_note_gemini_cli_rce_cvss10_ai_tool_security_20260502-csa-styled.pdf) | 安全报告 | 关注版本修复、CI 审计和 agent 执行边界。 |

## 研究与评测资料

| 资源 | 类型 | 价值 |
| --- | --- | --- |
| [Engineering Pitfalls in AI Coding Tools](https://arxiv.org/abs/2603.20847) | 论文 | 研究 Claude Code、Codex、Gemini CLI 的工程缺陷。 |
| [ABTest: Behavior-Driven Testing for AI Coding Agents](https://arxiv.org/abs/2604.03362) | 论文 | 使用 Claude Code、Codex CLI、Gemini CLI 做行为驱动 fuzzing。 |
| [Overeager Coding Agents](https://arxiv.org/abs/2605.18583) | 论文 | 评估 Claude Code、OpenHands、Codex CLI、Gemini CLI 越权行为。 |
| [Arbiter](https://arxiv.org/abs/2603.08993) | 论文 | 分析 Claude Code、Codex CLI、Gemini CLI 的系统提示冲突。 |

## 使用场景分类

### 适合优先尝试

- 终端内代码问答和修改
- 小到中型任务实现
- PR review、Issue triage、CI 中的自动分析
- MCP 工具接入
- sandbox 下的安全实验
- 研究开源 agent CLI 架构

### 适合谨慎尝试

- 2026-06-18 之后仍依赖 Gemini CLI 的个人工作流
- 不受信 PR 上的 GitHub Actions 自动化
- 需要长期稳定支持的团队默认工具
- 启用大量 extensions / MCP servers
- 自动审批 sandbox expansion

### 不建议直接交给 Gemini CLI

- 高权限生产操作
- 无人工 review 的自动修改和自动合并
- 包含长期 secrets 的 CI runner
- 没有迁移计划的关键开发流程

## Gemini CLI / Antigravity 迁移判断

| 问题 | 当前判断 |
| --- | --- |
| Gemini CLI 还值得整理吗 | 值得。它是重要的开源 agent CLI 样本，也有 GitHub Actions、MCP、extensions、sandbox 等设计可参考。 |
| 还适合新团队投入吗 | 对个人和免费用户要谨慎，因为官方已宣布迁移到 Antigravity CLI。 |
| 企业用户怎么办 | 需要看 Google 官方对企业和 Vertex / Gemini Code Assist 账号的具体安排。 |
| 资料如何标注 | 所有 Gemini CLI 资料都应标注更新时间和迁移状态。 |

## GitHub Actions 安全模板

```yaml
name: Gemini CLI PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

permissions:
  contents: read
  pull-requests: write
  issues: write

jobs:
  gemini-review:
    if: github.event.pull_request.draft == false
    runs-on: ubuntu-latest

    steps:
      - name: Checkout pull request
        uses: actions/checkout@v4
        with:
          persist-credentials: false

      - name: Run Gemini CLI
        uses: google-github-actions/run-gemini-cli@v0
        with:
          prompt: |
            Review this pull request for correctness bugs,
            missing tests, security risks, and breaking changes.
            Do not make changes. Return concise findings with file references.
```

安全注意：

- 检查 action 版本，避免使用已知受影响版本。
- 对 fork PR 使用更严格策略。
- 不要把 secrets 暴露给不受信代码。
- 避免在同一 job 中给 agent 同时提供写权限和高权限凭据。
- 若团队将迁移 Antigravity CLI，CI 配置要列入迁移清单。

## 评测维度建议

| 维度 | 看什么 |
| --- | --- |
| 工具稳定性 | CLI、sandbox、extensions、MCP 是否稳定 |
| 迁移风险 | 2026-06-18 后个人用户工作流是否可持续 |
| GitHub 集成 | PR review、Issue triage、CI 权限是否可控 |
| 安全边界 | sandbox、supply chain、secrets、workflow token |
| 代码质量 | bug fix、测试生成、重构质量 |
| 生态延续 | Antigravity CLI 是否继承关键能力 |

## 当前判断

Gemini CLI 的技术设计值得研究，但作为长期个人主力工具需要谨慎。它的最大变量不是能力，而是 **Google 已经明确将其迁移到 Antigravity CLI**。

核心评测问题：

> Gemini CLI 的开源 agent CLI 设计，哪些能力值得继承到下一代多 agent 工具，哪些工作流会被迁移风险抵消？
