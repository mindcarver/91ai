# Hermes Agent 实战专题

围绕 [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent)（Nous Research 2026.2 开源的自进化个人 AI 助手，MIT）的深度系列。**实测驱动，不写第 N 篇安装营销文**——每篇要么拆机制、要么实测、要么工程落地。

> 这是 living index，持续更新。下面每篇文章标注「最后核实」日期，Hermes 版本变更带来的影响记录在文末更新日志。

- **跟踪版本**：Hermes Agent（主线 main，核实至 2026-07）
- **系列进度**：25 / 25 已上线，全部 ≥8000 中文字（深度版，按 feynman-writer 流水线：调研 → 费曼 → 写作 → 去 AI 味）

## 阅读路径

### 主线 1 · 入门与定位

| # | 文章 | 维护 | 状态 |
| --- | --- | --- | --- |
| 1 | [Hermes 是什么：为什么它不是又一个聊天机器人](./01-what-is-hermes.md) | 🟢 | ✅ |
| 2 | [上手：60 分钟跑起来第一个 Hermes](./02-getting-started-60-minutes.md) | 🟡 | ✅ |
| 3 | [架构心智模型：agent loop、关键类、一次对话内部流程](./03-architecture-mental-model.md) | 🟢 | ✅ |
| 4 | [配置体系 + Context Files（SOUL.md / AGENTS.md）](./04-config-and-context-files.md) | 🟡 | ✅ |

### 主线 2 · 闭环学习与技能

| # | 文章 | 维护 | 状态 |
| --- | --- | --- | --- |
| 5 | [闭环学习总览：skill 自动创建的生命周期](./05-learning-loop-overview.md) | 🟢 | ✅ |
| 6 | [agentskills.io 标准 + skill 文件结构解剖](./06-agentskills-standard-and-skill-file-structure.md) | 🟡 | ✅ |
| 7 | [手写第一个 skill（调试 / 版本管理 / 回滚）](./07-write-first-skill.md) | 🟡 | ✅ |
| 8 | [Skills Hub：怎么用、怎么发、怎么挑](./08-skills-hub-usage.md) | 🟡 | ✅ |
| 9 | [skill 在用中自我改进：观察、调优、回滚](./09-skill-self-improvement-mechanism.md) | 🟢 | ✅ |

### 主线 3 · 记忆系统

| # | 文章 | 维护 | 状态 |
| --- | --- | --- | --- |
| 10 | [记忆全景：persistent memory 三层](./10-memory-three-layers.md) | 🟢 | ✅ |
| 11 | [agent-curated memory + periodic nudge 机制](./11-agent-curated-memory-nudge.md) | 🟡 | ✅ |
| 12 | [FTS5 session 搜索 + LLM 摘要 + Honcho 用户建模](./12-fts5-honcho-user-modeling.md) | 🟡 | ✅ |

> 原计划第 13 篇「实测 Hermes 记忆 vs 13 个记忆项目横评」暂不产出，如需补回再单开。

### 主线 4 · 多平台与自动化

| # | 文章 | 维护 | 状态 |
| --- | --- | --- | --- |
| 13 | [Messaging Gateway 多平台架构 + TG/Discord/Slack/WhatsApp/Signal 配置](./13-messaging-gateway-multiplatform.md) | 🟡 | ✅ |
| 14 | [微信桥 HermesClaw + voice memo + 跨平台连续性](./14-wechat-bridge-hermesclaw.md) | 🟡 | ✅ |
| 15 | [Cron 定时 + 子 Agent 委派（spawn / RPC）](./15-cron-subagent-delegation.md) | 🟢 | ✅ |
| 16 | [端到端实战：每日简报 / 夜间备份 / 周度审计](./16-end-to-end-recipes.md) | 🟢 | ✅ |

### 主线 5 · 工具、生态与长期运行

| # | 文章 | 维护 | 状态 |
| --- | --- | --- | --- |
| 17 | [40+ 内置工具 + toolset + MCP 集成（含 computer-use-linux）](./17-tools-toolset-mcp.md) | 🟡 | ✅ |
| 18 | [Nous Portal + 模型选择策略（成本 vs 能力）](./18-nous-portal-model-selection.md) | 🟡 | ✅ |
| 19 | [六种 backend 横比 + serverless 休眠唤醒真实成本](./19-backends-serverless-cost.md) | 🟡 | ✅ |
| 20 | [安全三件套：command approval / DM pairing / container 隔离](./20-security-command-approval-dm-pairing.md) | 🟢 | ✅ |
| 21 | [升级 / 备份 / 迁移（hermes update / doctor / OpenClaw 迁移）](./21-upgrade-backup-migrate.md) | 🟡 | ✅ |

### 主线 6 · 进阶、横评与持续追踪

| # | 文章 | 维护 | 状态 |
| --- | --- | --- | --- |
| 22 | [横评：Hermes vs OpenClaw vs Claude Code vs 其他个人助手](./22-comparison-openclaw-claude-code.md) | 🟢 | ✅ |
| 23 | [我用 Hermes 30 天（滚动栏目）](./23-30-days-rolling.md) | 🔴 | ✅ |
| 24 | [research-ready：批量轨迹生成 + 训练 tool-calling 模型](./24-research-trajectory-generation.md) | 🟢 | ✅ |
| 25 | [社区生态：Hermes Desktop / hermes-web-ui / 贡献上游](./25-community-ecosystem.md) | 🟡 | ✅ |

> 原 26 篇里第 13 篇（实测记忆）取消，故总计 25 篇核心 + 本导航页。

## 维护成本图例

- 🟢 **稳定**：架构/机制向，一次写厚，低维护
- 🟡 **中等**：版本敏感，每次 Hermes 发版后抽校对
- 🔴 **高频**：滚动栏目，季度大更

## 后续重点

1. **🟡 篇版本校对**：Hermes 每次发版后，优先抽校对入门（#2）、配置（#4）、工具/MCP（#17）、backend（#19）这几篇——它们最容易因版本变动失准。
2. **🔴 #23 滚动栏目**：建立 baseline 后按周/月更新真实数据，是这套专题的长期流量入口。
3. **#13 实测记忆**：如果后续决定补做，复用 [记忆系统评测专题](../../evaluation/memory-systems-eval/) 的统一后端协议，单独开篇。

## 更新日志

- 2026-07：系列开张，25 篇一次性上线。结构、读者画像、维护档定调。第 13 篇（实测记忆横评）暂缓，待后续单独补做。
- 2026-07（深度版）：全部 25 篇按 feynman-writer 流水线重写至 ≥8000 中文字（实测最低 8045、最高 9079）。3 个子智能体并发分波推进，每篇过完整四阶段（调研 → 费曼缺口填补 → 写作 → 去 AI 味）。重写中纠正若干幻觉（如"2+ 会话触发 skill"实为单任务 5+ 工具调用、3575 字符是 prompt memory 上限非 skill）、补强诚实批评（Issue #25833 四类失败、CSA Labs 9-CVE、内存中毒攻防）。
