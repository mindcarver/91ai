---
type: mixed
density: per-section
style: notion
generator: gpt-image-2
image_count: 6
cover: 00-cover-context-compaction.png
---

## Cover
**Position**: Article top
**Purpose**: 微信封面与文章入口视觉。
**Visual Content**: 保留阿新聊AI知识卡片封面模板，替换为 Codex 上下文压缩主题。
**Text Plan**: Title: "Codex 上下文压缩". Labels: "触发", "四条路径", "交接". Takeaway: "把状态写进文件".
**Filename**: 00-cover-context-compaction.png

## Illustration 1
**Position**: TL;DR 后
**Purpose**: 解释上下文窗口由固定开销、历史、工具输出和压缩项组成。
**Visual Content**: 分层窗口卡片和 token 水位线。
**Text Plan**: Title: "上下文窗口". Labels: "272K输入", "128K输出预留", "Token阈值", "黑盒存档". Takeaway: "不是按时间，是按 token".
**Filename**: 01-framework-context-window.png

## Illustration 2
**Position**: Codex 怎么知道该压缩了
**Purpose**: 可视化 PreTurn、MidTurn 和模型切换三处触发点。
**Visual Content**: 左到右流程图，包含三条触发分支。
**Text Plan**: Title: "触发时机". Labels: "PreTurn", "MidTurn", "模型切换", "token_limit_reached". Takeaway: "每个回合前后都数 token".
**Filename**: 02-flowchart-trigger-timing.png

## Illustration 3
**Position**: 压缩的四条路径
**Purpose**: 用对比卡片说明四种压缩实现和保留内容。
**Visual Content**: 2×2 对比矩阵，强调远程 V2 是默认路径。
**Text Plan**: Title: "四条压缩路径". Labels: "TokenBudget", "远程 V2", "远程 V1", "本地总结", "encrypted_content". Takeaway: "差别在于丢多少、留什么".
**Filename**: 03-comparison-four-paths.png

## Illustration 4
**Position**: 外部怎么知道压缩发生了
**Purpose**: 展示人类界面和程序事件两层观测面。
**Visual Content**: 监控面板式信息图。
**Text Plan**: Title: "两层观测". Labels: "/status", "/statusline", "ContextCompaction", "AnalyticsAttempt". Takeaway: "轮询水位，接近阈值就交接".
**Filename**: 04-infographic-observability.png

## Illustration 5
**Position**: 能不能在压缩前交接任务
**Purpose**: 说明 PreCompact hook 只能中止，可靠交接应落到文件系统。
**Visual Content**: 决策流：拦截 hook、注入上下文、写文件。
**Text Plan**: Title: "压缩前交接". Labels: "PreCompact", "should_stop", "TurnAborted", "TODO文件", "AGENTS.md". Takeaway: "真正的记忆在磁盘上".
**Filename**: 05-flowchart-handoff-boundary.png

## Illustration 6
**Position**: 真实踩坑
**Purpose**: 把 fatal 撞墙、失忆和多次压缩降智整理成风险清单。
**Visual Content**: 三张风险卡 + 一条操作护栏。
**Text Plan**: Title: "三类踩坑". Labels: "巨大输出", "丢工具细节", "多次压缩", "手动 /compact", "状态外化". Takeaway: "别把关键决策只留在聊天里".
**Filename**: 06-infographic-pitfalls-guardrails.png
