# Superpowers 边界 · 什么情况不该用，以及避坑指南

> superpowers 的整套流程很重。把它套在所有任务上，会让简单的事情变复杂；不用它，又怕 AI 跑偏。这篇拆边界和踩坑。

**TL;DR**：superpowers 是一套"重型工程化方法论"，适合多步骤、需要审查、出错的代价高于流程成本的任务。它不适合一次性脚本、探索性原型、纯 UI 微调、纯阅读理解类任务。即使适合，落地时也会踩三类坑：skill 触发率不稳、subagent 上下文污染、worktree 与现有工作流冲突。这篇文章把这些边界和坑都列出来，并给"只用其中一部分 skill"的折中方案。

## 哪些任务不该用 superpowers

把 superpowers 套在所有任务上是常见的误用。下面这几类任务，套上去反而拖慢节奏。

### 一次性脚本和快速原型

写一个 50 行的 Python 脚本拉数据、画张图、跑一次就扔。这种任务走 brainstorming → writing-plans → SDD 的完整流程，开销可能比脚本本身还大。直接让 Claude Code 写完跑一遍就够了。

判断标准：如果你预期这个代码活不过一周，superpowers 流程是过度工程。

### 探索性研究

"我想了解一下这个新框架的设计思路"——这种以阅读、理解、总结为主的任务，不需要 plan、不需要 TDD、不需要 subagent。直接让 agent 读代码、问问题、给总结，效率最高。

强行套 superpowers 会出现 agent 给你写一份《关于阅读 React 源码的 implementation plan》这种荒诞产物。

### 纯 UI 微调

改一个按钮的颜色、调一处间距、修一处文案。这类任务的反馈周期极短——你眼睛看到效果就是验证。verification-before-completion 的"跑测试 → 看 lint → 跑 typecheck"这套流程对 UI 微调基本没价值。

直接改、直接看、直接 commit，比走完整流程高效十倍。

### 已经被工具强制的规则

如果一条规则已经被 lint、typecheck、pre-commit hook 强制执行了，再写一个 skill 来"提醒 agent 遵守"就是冗余。机器能强制的就别用文档——这是 [writing-skills](./16-writing-skills.md) 的核心原则之一。

反例：团队有 ESLint 规则禁止 any。再写一个 skill 说"不要用 any"完全多余，ESLint 会自动报错。skill 该写的是 ESLint 抓不到的部分，比如"什么时候可以用 unknown 替代 any"。

### 单文件单函数的小改动

改一个函数的命名、抽一个常量、修一个 typo。这类任务的 spec、plan、review 全部加起来比改动本身还长。直接让 agent 改完跑测试就行。

## 哪些任务适合 superpowers

反过来，下面这些场景 superpowers 的流程开销能赚回来。

### 跨多文件、需要逐步推进的功能开发

涉及 5+ 文件、需要协调接口、需要先想清楚再动手的功能，brainstorming + writing-plans 能省掉大量返工。颗粒度 2-5 分钟一颗任务的设计，让你能随时停下、审查、调整方向。

### 出错代价高的任务

数据库迁移、生产环境配置改动、涉及资金或权限的代码。这类任务一个错误可能要花几小时修复。superpowers 的双段 review（spec + quality）能把风险降到最低。

### 团队协作中需要留下决策痕迹的任务

writing-plans 生成的 plan 文档、brainstorming 生成的 spec 文档，本身就是团队沟通和回顾的材料。新成员入职可以读历史 plan 理解项目演进。

### 需要保证可重复性的任务

如果一个任务可能会被多次类似地执行（比如每次新接一个客户要做一遍 onboarding），把流程沉淀成 skill 一次，后面省下大量重复沟通成本。

### 教学场景

superpowers 的强制 TDD、强制 plan-first 对新手是好习惯训练。如果团队里有需要培养工程习惯的成员，让他用一段时间 superpowers 比口头讲规范有效。

## 三个常见踩坑

### 坑一：skill 触发率不稳

"我装了 superpowers，但 agent 还是不按 skill 做事。"

最常见的原因是 description 字段写得不好。Claude 在每次会话里要决定加载哪几个 skill，依据就是 description。如果 description 没包含当前任务的关键词，skill 不会被加载。

排查方法：在任务开始时让 agent 说一句"我打算用哪些 skill"。如果它说的列表里没有你期望的那个，就是 description 没写好。

修复：参考 [03 · description 字段与 CSO](./03-description-cso.md) 的反例和正例。核心是 description 只写触发条件，不写流程。

第二个原因是 skill 太多互相冲突。如果同时装了 superpowers 和 SuperClaude，两个 plugin 都想注入 SessionStart 钩子，可能只有一个生效。解决方法是只用其中一个，或者把冲突的 skill 显式 disable。

### 坑二：subagent 上下文污染

"subagent 应该是隔离的，但它居然看到了主会话的内容。"

正常情况下 subagent-driven-development 的每个 subagent 都是全新上下文，只看到 controller 给它的 prompt。但下面几种情况会污染：

1. **Controller 在 prompt 里塞了主会话的引用**——比如复述了之前用户的发言，subagent 通过这段复述看到了不该看的上下文
2. **Subagent 跑了某些工具会暴露历史**——比如跑 git log 看到了之前的提交信息
3. **平台本身的 subagent 隔离不严格**——见 [17 · 跨平台](./17-cross-platform.md) 的"工具名映射"部分

排查方法：让 subagent 在执行前复述它能看到什么。如果它说出了 controller 没给它的信息，就找到了污染源。

修复：controller 给 subagent 的 prompt 要尽量自洽，不依赖主会话的隐式上下文。需要引用某些文件时，把文件内容直接贴进 prompt，不要让 subagent 自己去 grep。

### 坑三：worktree 与现有工作流冲突

"我平时用 git branch 工作流，superpowers 强制 worktree 让我混乱。"

superpowers 的 git-worktrees skill 默认在 `.worktrees/` 目录下创建工作树。如果你的项目已经有自己的分支管理流程，可能会出现：

- 在 worktree 里提交后，回到主仓库忘记 pull
- 多个 worktree 切换时记不清当前在哪个分支
- worktree 占用磁盘，长期累积几个 GB

排查方法：跑 `git worktree list` 看当前有多少 worktree。如果列出一长串已经不用的，说明 finishing-a-development-branch 没正确清理。

修复：每次任务完成后，严格走 finishing-a-development-branch 流程，确认 worktree 被删除。如果你只是临时切换不用整个 worktree，可以用 `git stash` 替代，但这样就放弃了 worktree 的隔离优势。

更激进的方案：把 worktree 流程改成普通 branch 流程，但你要承担多任务并行时上下文混乱的风险。

## token 与速度代价

superpowers 不便宜。一次完整的 SDD 流程：

- brainstorming 一次：~10K tokens
- writing-plans 一次：~15K tokens
- 每个任务的 implementer subagent：~5-10K tokens
- spec reviewer subagent：~3K tokens
- code quality reviewer subagent：~3K tokens
- verification-before-completion：~2K tokens

一个 5 任务的功能开发，全流程跑完 80-150K tokens 是常见数字。如果用 Sonnet 4.5（$3/M input, $15/M output），一次完整功能开发成本在 $0.5-2 之间。

更明显的代价是时间。subagent 的派发和审查需要时间，每个任务的 review loop 可能跑 2-3 轮。一个 5 任务的功能，从 brainstorm 到 finishing，30 分钟到 2 小时不等。

这是不是值得，取决于任务本身的价值。修复一个 typo 走这套流程，时间成本是任务本身的 100 倍。开发一个新功能走这套流程，时间成本可能只占 20%，但能把返工率从 50% 降到 10%。

## 只用一部分 skill 的折中方案

不需要全开。superpowers 的 skill 是松耦合的，你可以只挑需要的部分用。

**最小方案**：只用 brainstorming。把 superpowers 当成一个"开始写代码前先把需求想清楚"的工具，其他 skill 全关。这能解决 80% 的"AI 上手就跑偏"问题。

**轻量方案**：brainstorming + writing-plans + TDD。不要 SDD、不要双段 review、不要 worktree。这套适合个人开发者在中小项目上用，保留了核心的"先想后做"和"测试驱动"，去掉了团队协作的部分。

**完整方案**：所有 skill 都开。适合团队协作、生产环境开发、出错代价高的任务。这是 superpowers 的完整体验，也是开销最大的方案。

**自定义方案**：基于现有 skill 写自己的。比如你想要 SDD 的双段 review 但不需要 worktree，可以 fork subagent-driven-development skill 改掉 worktree 依赖。superpowers 的开源协议允许这样做。

## 和其他生态的关系

**SuperClaude**：SuperClaude 是另一套 Claude Code 增强框架，主打"角色 persona + 多模式"。它和 superpowers 在 SessionStart 钩子上会冲突。建议二选一，或者把其中一个的 SessionStart 关掉。两者风格不同：SuperClaude 偏角色扮演，superpowers 偏工程方法论。

**Anthropic 官方 skills**：Anthropic 在 plugin marketplace 上也提供官方 skills。这些 skill 和 superpowers 的 skill 格式完全兼容，可以共存。但功能可能重叠，比如 Anthropic 的 TDD skill 和 superpowers 的 TDD skill 都讲测试驱动，细节不同。建议挑一个用，不要同时启用两个 TDD skill。

**自有 CLAUDE.md**：你的项目 CLAUDE.md 应该和 superpowers 互补，不冲突。CLAUDE.md 写项目特定规则（"这个项目用 pnpm 不用 npm"），superpowers skill 写通用工程方法。两者各司其职。

**agsd / 其他工作流框架**：市场上还有其他工作流框架，比如 agsd。这类框架通常针对特定场景（比如深度研究、长任务监控）。如果你已经在用某个，要先评估它和 superpowers 的重叠程度。重叠的部分选一个，不重叠的可以共存。

## 何时升级到完整方案

如果你开始只是最小方案（只用 brainstorming），什么时候应该升级到完整方案？几个信号：

- 团队里其他人开始用 Claude Code，需要统一流程
- AI 生成的代码经常需要返工，issue 数量上升
- 任务复杂度增加，单次会话上下文不够用，需要 subagent 隔离
- 团队开始做 code review，发现 AI 生成的代码质量参差

任何一个信号出现，都说明只靠 brainstorming 不够了，可以引入 writing-plans 和 SDD。如果出现了"AI 生成的代码导致线上事故"，那 verification-before-completion 和 systematic-debugging 也应该上。

## 何时该弃用 superpowers

反过来，某些情况下你应该考虑不用 superpowers：

- 项目周期紧，需要快速产出原型，质量让位于速度
- 团队对 TDD、plan-first 这些方法论本身就抵触
- 你已经在用另一套等价的工程方法论（比如 SuperClaude）
- 任务主要是探索性的，工程化流程会拖慢探索

弃用不一定是永久。某些项目阶段用，某些阶段不用。superpowers 是工具，不是宗教。

## 延伸阅读

- [obra/superpowers - README](https://github.com/obra/superpowers#readme)
- [obra/superpowers - RELEASE-NOTES.md](https://github.com/obra/superpowers/blob/main/RELEASE-NOTES.md)
- [Superpowers: A methodology plugin for coding agents (Jesse Vincent)](https://blog.fsck.com/2025/10/09/superpowers/)
- [obra/superpowers - docs/plans](https://github.com/obra/superpowers/blob/main/docs/plans)
- [obra/superpowers - issues](https://github.com/obra/superpowers/issues)
- 本系列 [01 · 入门](./01-overview.md)
- 本系列 [16 · writing-skills](./16-writing-skills.md)
- 本系列 [17 · 跨平台](./17-cross-platform.md)

<!-- CONTACT-START -->
<!-- Auto-generated by scripts/inject-contact.sh — 单一真实源: docs/_snippets/contact.html -->
<div align="center">

**「阿新聊 AI」同步更新，欢迎关注**

<br>

<table>
<tr>
<td align="center">📢<br><b>微信公众号</b><br>阿新聊ai</td>
<td align="center">🎵<br><b>抖音</b><br>阿新聊ai</td>
<td align="center">📕<br><b>小红书</b><br>阿新聊ai</td>
<td align="center">💬<br><b>微信</b><br>mindcarver</td>
</tr>
</table>

🌐 AI 社区 · <a href="https://91aihub.com/">91aihub.com</a>

</div>
<!-- CONTACT-END -->
