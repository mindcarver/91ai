# OpenSpec：让 AI 编程告别"氛围感"

> 更新日期：2026/06

**TL;DR：** OpenSpec 是一个轻量级的规范驱动开发（Spec-Driven Development）框架，让 AI 编程助手在写代码之前先和你对齐"要做什么"。Spec 文件存放在项目仓库里，随代码一起版本控制。每次只记录变化量（Delta Spec），做完后合并进主规范。5 分钟上手，支持 25+ AI 编程工具。

## 你遇到过这些问题吗

用 AI 编程助手写过代码的人，大概都经历过这种场景：

你告诉 AI "帮我加个搜索功能"，它二话不说开始生成——创建了七八个文件，引入了你项目里根本没有的 Elasticsearch，代码看起来很专业，但跑不起来。你花了一下午修改，最后删掉整个分支重来。

或者更隐蔽的情况：AI 第一次生成的代码能用，你很高兴。三天后你让它改另一个功能，它完全忘了之前的实现逻辑，新代码跟老代码打架。会话太长之后，AI 开始"幻觉"，输出质量指数级下滑。

这些问题的根源是同一个：**需求只存在于聊天记录里，没有持久化、没有结构化、没有版本控制。** 聊天记录关了就没了，换个会话就忘了，团队成员看不到彼此的意图。

OpenSpec 就是来解决这个问题的。

## OpenSpec 是什么

一句话：**OpenSpec 是给 AI 编程助手用的施工图纸系统。**

你装修房子不会跟工头说"弄个好看的厨房"就让他开干。你会先画图纸——厨房多大、灶台在哪、水槽靠哪面墙、冰箱能不能打开门。工头照着图纸施工，有问题改图纸，不改墙。

OpenSpec 做的就是这件事，但服务对象是 AI 编程助手：

- 你在写代码之前，先用结构化的格式把"要做什么"写下来（叫 Spec）
- Spec 文件存在项目仓库里，跟代码一起 git 管理
- AI 读着 Spec 写代码，而不是猜你的意图
- 做完后，Spec 合并进主规范，成为系统的"真相源"

项目地址：[github.com/Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)，MIT 协议，npm 安装，一行命令初始化。

## 它怎么工作

### 一个简化的心智模型

想象你管理一个建筑项目：

1. **specs/ 目录** = 正式图纸。描述整栋楼现在的样子，永远是最新的
2. **changes/ 目录** = 变更单。每次改动是一份独立的变更单，包含：
   - **proposal.md** — 为什么要改、改什么（动机和范围）
   - **specs/** — 具体改哪些需求、怎么改（变化量）
   - **design.md** — 技术上怎么实现（方案设计）
   - **tasks.md** — 任务清单，带 checkbox
3. **archive/** = 归档区。做完的变更单移到这里，但改动已经合并进正式图纸了

工作流程四步走：

```
/opsx:propose  →  /opsx:apply  →  /opsx:sync  →  /opsx:archive
  画变更单        照单施工        更新图纸        归档收工
```

### 实际跑一遍

假设你要给应用加个暗黑模式。

**第一步：发起变更**

在 AI 编程工具里输入：

```
/opsx:propose add-dark-mode
```

AI 会创建一个变更文件夹 `openspec/changes/add-dark-mode/`，并自动生成四个文件：

```
openspec/changes/add-dark-mode/
├── proposal.md    ← "用户要求暗黑模式，减少夜间使用时的眼疲劳"
├── specs/ui/spec.md   ← Delta Spec：新增了哪些需求
├── design.md      ← "用 CSS 自定义属性 + React Context 管理主题状态"
└── tasks.md       ← 实现清单，每个任务一个 checkbox
```

Delta Spec 长这样：

```markdown
# Delta for UI

## ADDED Requirements

### Requirement: Theme Selection
The system SHALL allow users to choose between light and dark themes.

#### Scenario: Manual toggle
- GIVEN a user on any page
- WHEN the user clicks the theme toggle
- THEN the theme switches immediately
- AND the preference persists across sessions

#### Scenario: System preference
- GIVEN a user with no saved preference
- WHEN the application loads
- THEN the system's preferred color scheme is used
```

注意格式：每个需求有验收场景，用 GIVEN/WHEN/THEN 描述。这不是装饰——后面 verify 会检查这些场景有没有对应的实现。

**第二步：实现**

```
/opsx:apply
```

AI 按 tasks.md 的清单逐步实现代码，每完成一项打勾：

```markdown
## 1. Theme Infrastructure
- [x] 1.1 Create ThemeContext with light/dark state
- [x] 1.2 Add CSS custom properties for colors
- [x] 1.3 Implement localStorage persistence
```

**第三步（可选）：验证**

```
/opsx:verify
```

AI 检查三个维度：

| 维度 | 检查什么 |
|------|---------|
| 完整性 | 所有任务都打勾了吗？每个需求都有对应代码吗？ |
| 正确性 | 代码行为和 Spec 里描述的一致吗？边界情况处理了吗？ |
| 一致性 | 代码结构和 design.md 里的方案一致吗？命名规范统一吗？ |

如果 design.md 里写了"用事件驱动"，但代码用了轮询——verify 会报 WARNING。

**第四步：归档**

```
/opsx:archive
```

Delta Spec 合并进主 `specs/` 目录，变更文件夹移入 archive/。此时主规范已经包含了暗黑模式的所有需求描述，下一个变更可以在此基础上继续。

### 关键设计：Delta Spec

OpenSpec 最重要的设计选择是 **Delta Spec（变化量规范）**。

传统做法是维护一份完整的大文档，每次改动要重写整份文档。这在已有大量代码的项目（Brownfield）里几乎不可能——你不可能把整个系统的行为一次写完。

Delta Spec 的思路是：**只写变化了什么**，用三个标记区分：

- `## ADDED Requirements` — 新增的行为
- `## MODIFIED Requirements` — 修改的行为（会替换旧版本）
- `## REMOVED Requirements` — 删除的行为

归档时，ADDED 追加到主规范，MODIFIED 替换对应需求，REMOVED 从主规范中删除。

这意味着：
- 两个变更可以并行修改同一个 spec 文件的不同需求，不冲突
- 不需要一次性把系统所有行为都写成规范，从你要改的地方开始就行
- 审查变更时只需要看 Delta，不用 diff 整份文档

## 跟其他方案比怎么样

### OpenSpec vs 纯 Vibe Coding

| 维度 | Vibe Coding | OpenSpec |
|------|-------------|----------|
| 需求存放在哪 | 聊天记录 | 项目仓库里的 Markdown 文件 |
| 换个会话 | 上下文丢失，从头开始 | 读 spec 恢复完整上下文 |
| 团队协作 | 看不到彼此的聊天记录 | spec 文件在 git 里，PR 可审查 |
| 变更追踪 | 无 | 每个 change 有完整记录（为什么改、怎么改、改了什么） |
| 上手成本 | 零 | 约 5 分钟（npm install + init） |

### OpenSpec vs Spec Kit（GitHub 官方）

Spec Kit 是 GitHub 出的规范工具，理念类似但走的是重流程路线：

- 需要 Python 环境和 pyproject.toml 配置
- 有严格的 phase gate：plan → design → implement → verify → ship，每个阶段有准入条件
- 适合大型团队、需要严格审批流程的场景

OpenSpec 的区别：用 npm 一行安装，默认只有 4 个命令，没有强制阶段，可以随时回头改任何文件。代价是少了 Spec Kit 的严格管控能力。

### OpenSpec vs Kiro（AWS）

Kiro 是 AWS 的 AI IDE，内置了 spec 驱动开发能力。但：

- 只能用 Kiro 自己的 IDE
- 只支持 Claude 模型
- 生态封闭

OpenSpec 支持 25+ AI 工具（Claude Code、Cursor、Codex、Copilot、Windsurf、Gemini CLI 等），不绑定工具和模型。

### OpenSpec vs Superpowers

Superpowers（obra/superpowers）是基于 TDD 的 AI 编程工作流：

- 核心是测试驱动：先写测试、再写代码、红-绿-重构
- 强制工作流，每个步骤有自动化检查
- 适合追求代码质量和测试覆盖率的场景

OpenSpec 核心是规范驱动：先把"做什么"定清楚，再让 AI 实现。两者不冲突，社区里有人把它们组合使用（superpowers-bridge 社区 schema）。

## Brownfield 项目怎么开始

OpenSpec 最重要的理念之一是 **brownfield-first**——它被设计为给已有代码的项目使用，而不是只服务于从零开始的新项目。

关键原则：**不要试图一次性生成所有 spec。** OpenSpec 文档明确说"trying to generate all your specs upfront is a waste of time"。

推荐的做法：

1. 从你要修改的功能开始
2. 先把"它现在怎么工作"记录成 spec（或者让 AI 的 propose 命令帮你做）
3. 在这个基础上提出修改
4. 改完一个功能，就多了一份有 spec 的功能
5. 慢慢地，系统的 spec 覆盖率自然提高

这跟老房子装修一个道理——不需要一次性画出整栋楼的图纸，你要改厨房就先画厨房的，改完一间多一间。

## 安装和使用

**前置条件**：Node.js 20.19.0 或更高版本。

```bash
# 安装
npm install -g @fission-ai/openspec@latest

# 在项目中初始化
cd your-project
openspec init

# 开始第一个变更（在 AI 编程工具中输入）
/opsx:propose add-search-feature
```

初始化后项目结构：

```
your-project/
├── openspec/
│   ├── specs/          # 真相源（系统当前行为的规范）
│   ├── changes/        # 变更单
│   └── config.yaml     # 项目配置（可选）
└── src/                # 你的代码
```

CLI 常用命令：

```bash
openspec list                    # 列出所有活跃变更
openspec show add-dark-mode      # 查看某个变更的详情
openspec validate add-dark-mode  # 验证 spec 格式
openspec view                    # 打开交互式仪表板
openspec update                  # 刷新 AI 工具的 skill 文件
```

### 指定你的 AI 工具

```bash
# 初始化时指定工具（会生成对应的 slash command 文件）
openspec init --tools claude-code
openspec init --tools cursor
openspec init --tools opencode

# 也支持多个工具
openspec init --tools claude-code,cursor
```

不同工具的命令语法略有区别：

| 工具 | 命令格式 |
|------|---------|
| Claude Code | `/opsx:propose` |
| Cursor / Windsurf | `/opsx-propose` |
| GitHub Copilot | `/opsx-propose` |
| OpenCode | `/opsx:propose` |

## 权衡与局限

OpenSpec 不是银弹。诚实地说说它的问题。

**增加了前期时间。** 最快的路径是直接让 AI 写代码。OpenSpec 要求你先花 5-10 分钟生成和审查 spec。对于一次性脚本、快速原型、或者你非常确定要做什么的场景，这个额外步骤是净开销。

**Spec 可能过时。** 如果实现过程中偏离了 spec 但忘了更新 spec，verify 会报 WARNING，但如果你从不运行 verify，spec 就变成了不准确的文档。过时的 spec 比没有 spec 更危险——因为它给你错误的信心。

**上下文窗口的限制。** Spec 文件存在项目里，但 AI 的上下文窗口有限。OpenSpec 按需加载（只读当前 change 相关的 spec），但当你的系统有几十个 spec 文件时，跨功能的影响分析仍然依赖 AI 的判断力。

**并行变更的冲突。** 两个 change 修改同一个 spec 的同一个 requirement 时，bulk-archive 会让 AI 检查代码实际情况来裁决。但"让 AI 判断"意味着结果不完全可预测，不像 git merge conflict 那样有确定性的解决策略。

**对 AI 模型有要求。** OpenSpec 的 README 推荐使用高推理能力的模型（如 Claude Opus 4.7），因为生成高质量的 spec 和 verify 需要较强的推理能力。用小模型可能产生空泛的 spec。

### 什么时候不该用

- **一次性脚本**：用完就扔的代码，不需要 spec
- **探索性原型**：你还在试水，不确定要做什么
- **极小改动**：改个按钮颜色这种，spec 的开销大于收益
- **不读 spec 的团队**：如果团队不习惯读文档，spec 会变成摆设

## 一个容易被忽略的价值：可审查性

Spec 文件是 Markdown，存在 git 仓库里。这意味着：

- **Code Review 可以审 spec**：PR 里不仅看代码变了什么，还能看 spec 变了什么。Review 时看 Delta Spec 比看 200 行代码 diff 更容易理解意图
- **新人 onboarding**：新成员读 spec 比读代码更快理解系统做了什么
- **跨会话连续性**：昨天的工作今天捡起来，读 spec 就能恢复上下文
- **历史可追溯**：archive 里保留了每个变更的完整记录（为什么做、怎么做的、做了什么）

这个价值在个人项目里不明显，在团队和长期维护的项目里会越来越大。

## 写在最后

OpenSpec 解决的是一个真实且越来越重要的问题：AI 编程助手的输出质量严重依赖输入的清晰度。Spec-Driven Development 不是新概念（微软的规格说明书文化可以追溯到 90 年代），但 OpenSpec 把它做得足够轻——5 分钟安装，4 个命令开始，不绑定特定工具。

它不完美：增加了前期时间、spec 可能过时、并行冲突依赖 AI 判断。但对于正在用 AI 编程做严肃项目的人来说，这是目前最轻量的"让 AI 写出你真正想要的代码"的方案。

值得一试的判断标准：如果你曾经在 AI 编程中花超过 30 分钟修改它第一次就"理解错"的代码，OpenSpec 能帮你省下这个时间。

## 官方资料

- [GitHub 仓库](https://github.com/Fission-AI/OpenSpec) — 源码和完整文档
- [openspec.dev](https://openspec.dev/) — 官网和支持的工具列表
- [Getting Started](https://github.com/Fission-AI/OpenSpec/blob/main/docs/getting-started.md) — 入门指南
- [Concepts](https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md) — 核心概念详解
- [intent-driven.dev 知识中心](https://intent-driven.dev/knowledge/openspec/) — 教程、工作流图和博客合集

## 学习资料

- [Spec-Driven Development with OpenSpec（Medium）](https://medium.com/@harikrishnan/spec-driven-development-openspec-dbc5efe1d8ce) — 创建者 Hari Krishnan 的介绍文章
- [Superpowers VS OpenSpec（掘金）](https://juejin.cn/post/7605157203591020571) — 与 TDD 方案 Superpowers 的对比
- [Vibe Specs 模式（Tony Bai）](https://tonybai.com/2025/07/02/vibe-specs/) — Spec-First 工作流的效率分析
- [Spec Coding 与 Harness Engineering（知乎）](https://zhuanlan.zhihu.com/p/2020513059618206488) — 三种 AI 编程范式对比
- [Getting Started with OpenSpec（YouTube）](https://www.youtube.com/watch?v=raPTOBUpc3M) — 视频教程

## 当前判断

OpenSpec 是目前 Spec-Driven Development 赛道最活跃的开源项目（npm 周下载量持续增长，25+ 工具原生支持）。适合以下场景：

- 用 AI 编程做中长期项目（不是一次性脚本）
- 团队协作，需要可审查的需求文档
- Brownfield 项目，想逐步引入规范管理
- 跨 AI 工具使用，不想被单一 IDE 绑定

不建议用于：探索性原型、一次性脚本、极小改动、或者团队不习惯读文档的场景。

安装只需两行命令，花 10 分钟试试，比读十篇文章管用。
