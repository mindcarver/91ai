# OpenSpec 实战复盘：Spec-Driven Development 重构三个项目的真实经验

> 更新日期：2026/06

**TL;DR：** 本文复盘了在三个不同规模的项目中引入 OpenSpec 的真实过程——个人博客（5000 行）、SaaS 后台管理系统（30000 行，3 人团队）、订单管理系统重构（80000 行，5 人团队）。结论是：项目规模越大、代码库越老、团队协作越频繁，OpenSpec 的收益越明显。小项目引入成本占比偏高但仍然值得，大项目的收益主要体现在 review 效率提升和新成员 onboarding 速度加快。但也有些场景 OpenSpec 增加了不必要的开销——比如极小改动和探索性开发。

---

## 写在前面

这篇文章记录的是我（以及我参与的团队）在过去几个月里用 OpenSpec 做项目开发的真实经验。三个项目规模不同、技术栈不同、团队配置不同。我会把每个项目的背景、引入 OpenSpec 的过程、遇到的问题、量化的数据、以及最终的评价都写出来。

需要提前说明几点：

- 数据基于个人和团队的实际操作记录，不是受控实验，不要把具体数字当成普遍规律
- 项目名称和团队成员做了匿名处理
- 三个项目都是真实的，但细节上有模糊处理以保护隐私

---

## 案例 1：小型 Side Project —— 个人博客

### 项目背景

这是一个用 React + Node.js 搭建的个人博客系统，大约 5000 行代码。前端用 React 18 + TypeScript，后端是 Express + SQLite，部署在 Vercel 上。功能包括文章管理、标签分类、Markdown 渲染、RSS 输出。

项目是我一个人维护的，持续开发了大约四个月。没有 CI/CD，没有 code review 流程，git commit 比较随意。

### 引入 OpenSpec 的契机

项目进行到第三个月时，我开始遇到"上下文丢失"的问题。博客有了文章、标签、RSS 三个核心模块，每个模块在不同会话中由 AI 生成。当我需要给文章模块加一个"草稿自动保存"功能时，Cursor 的 AI 完全不记得之前文章模型是怎么设计的——它试图重新创建一个 `Article` 类型，跟已有的冲突了。

我花了大约一个小时排查冲突，手动修复类型定义。这时候我决定试试 OpenSpec，看看它能不能解决"AI 跨会话失忆"的问题。

### 具体操作过程

**初始化**

```bash
cd my-blog
npm install -g @fission-ai/openspec@latest
openspec init --tools cursor
```

初始化后填写了 `openspec/project.md`：

```markdown
# Project Context

## Tech Stack
- Frontend: React 18 + TypeScript 5.0 + Vite
- Backend: Node.js 20 + Express 4
- Database: SQLite (better-sqlite3)
- No ORM, raw SQL queries

## Architecture
- Monorepo: /src/client (frontend) + /src/server (backend)
- REST API, JSON responses
- JWT auth (admin only)
- Markdown rendering with remark/rehype

## Code Standards
- camelCase everywhere
- Each route in its own file under /src/server/routes/
- React components: functional + hooks only
```

**第一个 Change：添加评论系统**

```bash
/opsx:propose add-comment-system
```

AI 生成了四个文件。`proposal.md` 描述了评论系统要做什么（访客评论、管理员回复、评论审核）。`specs/comment/spec.md` 包含 Delta Spec：

```markdown
# Delta for Comment

## ADDED Requirements

### Requirement: Visitor Comments
Visitors MUST be able to submit comments on published articles.

#### Scenario: Submit a comment
- GIVEN a visitor viewing a published article
- WHEN the visitor fills in name, email, and comment body
- THEN the comment is saved with "pending" status
- AND a success message is displayed

#### Scenario: Comment validation
- GIVEN a visitor submitting a comment
- WHEN the comment body is empty or exceeds 2000 characters
- THEN an error message is displayed

### Requirement: Admin Comment Moderation
Admin MUST be able to approve or reject pending comments.

#### Scenario: Approve a comment
- GIVEN an admin viewing pending comments
- WHEN the admin clicks "approve"
- THEN the comment status changes to "approved"
- AND the comment becomes visible on the article page
```

`design.md` 记录了技术方案：评论存储在新的 `comments` 表，通过文章 ID 关联，审核状态用 enum 字段。`tasks.md` 列出了 8 个原子任务。

**审查和修改**

我审查了 proposal，发现两个需要调整的地方：

1. 不需要 email 字段——个人博客没必要收集访客 email
2. 评论不需要审核流程——流量小，直接显示，有问题的手动删除

我直接在 `proposal.md` 和 `specs/comment/spec.md` 里修改了这些。这个过程花了大约 5 分钟。

**实现**

```bash
/opsx:apply
```

AI 按照修改后的 tasks.md 逐步实现。它读了 `specs/article/spec.md` 了解现有文章模型，确保评论和文章的关联方式跟已有设计一致。整个过程没有出现类型冲突。

**归档**

```bash
/opsx:archive
```

Delta Spec 合并进主 specs/。此时 specs/ 目录下有了两个 spec：`article/spec.md` 和 `comment/spec.md`。

### 产生的 Artifact 完整示例

```
openspec/
├── project.md
├── AGENTS.md
├── specs/
│   ├── article/
│   │   └── spec.md         # 已有的文章模块 spec
│   └── comment/
│       └── spec.md         # 新增的评论模块 spec（已合并）
└── changes/
    └── archive/
        └── 2026-03-add-comment-system/
            ├── proposal.md  # 归档的 proposal
            ├── design.md    # 归档的设计文档
            └── tasks.md     # 归档的任务清单（全部打勾）
```

### 花了多少时间、省了多少时间

**直接时间开销**：

- 初始化 OpenSpec：5 分钟
- 填写 project.md：3 分钟
- Propose（生成 + 审查修改）：10 分钟
- Apply + Archive：跟直接 Vibe Coding 时间一样，约 25 分钟
- 合计额外开销：约 18 分钟

**省下的时间**：

- 之前加功能时 AI 跟已有代码冲突，排查修复约 1 小时
- 引入 OpenSpec 后，后续 3 个功能（RSS 优化、搜索功能、SEO meta 标签）都没出现冲突问题
- 粗略估算省下了 2-3 小时的排查和修复时间

**净收益**：投入 18 分钟，省下 2-3 小时。对于这个规模的项目，回报比不错。

### 对小项目来说值不值

值，但有前提条件。前提是你会持续维护这个项目三个月以上，并且会频繁用 AI 添加功能。如果你的项目做完就不再改了，或者你每次改的代码量极小（改个样式、修个 bug），OpenSpec 的开销是纯浪费。

个人博客这类项目的特点是：改动不频繁但每次改动涉及多个文件。这种场景下 OpenSpec 的"跨会话上下文恢复"能力最有价值——你上个月加的评论系统，这个月加搜索功能时 AI 能读到评论系统的 spec，知道数据库里有哪些表、API 有哪些端点。

### 遇到的问题和解决方法

**问题一：AI 偶尔忽略 spec**

有一次 AI 没有读取 `specs/article/spec.md`，直接按照自己的"理解"生成了文章查询逻辑。解决方法是在 prompt 里显式要求："先读取 openspec/specs/ 下所有相关 spec，再开始实现。"

**问题二：spec 文件需要手动维护**

归档后如果我发现某个 spec 描述不够准确（比如遗漏了一个边界情况），需要手动编辑 spec 文件。OpenSpec 没有提供"自动修正 spec"的命令。解决办法是在下一次变更的 Delta Spec 里补充。

---

## 案例 2：中型团队项目 —— SaaS 后台管理系统

### 项目背景

这是一个 B2B SaaS 产品的后台管理系统，技术栈是 TypeScript + Next.js + PostgreSQL + Prisma，约 30000 行代码。团队 3 人：一个前端、一个后端、一个全栈。每个人用不同的 AI 工具——前端用 Cursor，后端用 Claude Code，全栈两个都切换着用。

项目的痛点不是"AI 生成代码质量差"，而是"多人同时用 AI 开发时协作混乱"。前端用 Cursor 的 Agent 模式加了一个权限管理页面，后端用 Claude Code 改了权限相关的 API——两边的理解不一致，PR review 时发现接口对不上。这种事情每周发生 1-2 次。

### 引入 OpenSpec 的策略

我们没有一次性在整个项目引入 OpenSpec。策略是先在后端同学负责的模块（支付和权限）试点，跑通流程后再推广到前端。

这个策略是正确的。直接全团队同时引入会带来太多变更——工具流程、审查习惯、commit 规范都在变，加上项目本身的需求压力，很容易半途而废。

### 具体操作：并行变更管理

项目的一个典型场景是同时开发两个独立功能：支付模块重构和权限模块优化。这两块代码有一定交叉——支付需要权限检查，权限修改可能影响支付流程。

**支付模块变更**

后端同学在 Claude Code 中执行：

```bash
/opsx:propose refactor-payment-module
```

AI 读取了 `specs/payment/spec.md` 和 `specs/auth/spec.md`，理解了现有支付流程和权限模型。生成的 Delta Spec 标记了：

- `MODIFIED` — 支付确认流程（增加了幂等性校验）
- `ADDED` — 支付超时自动取消
- `ADDED` — 支付记录导出

**权限模块变更**

全栈同学在 Cursor 中执行：

```bash
/opsx-propose optimize-permission-check
```

AI 读取了同样的 spec 文件，生成的 Delta Spec 标记了：

- `MODIFIED` — 权限检查逻辑（从每次查数据库改为缓存 + 数据库回源）
- `MODIFIED` — 权限粒度（从角色级改为功能级）

两个变更同时存在于 `openspec/changes/` 目录下，互不干扰。

### Delta Spec 在跨模块变更中的价值

关键在于：当支付变更的 Delta Spec 里写了 `ADDED: 支付超时自动取消` 时，它也标注了对权限模块的影响——"支付超时取消需要 `payment:cancel` 权限"。这个信息被写在了 `specs/auth/spec.md` 的 Delta 里。

当权限变更的作者审查支付变更的 proposal 时，他看到了这个 Delta 标记，意识到自己的"权限粒度改为功能级"的变更需要在支付取消权限上也做适配。

在以前的工作方式下，这个问题会在 PR 合并后的集成测试中被发现，修复需要 2-3 小时。有了 Delta Spec 的提前暴露，两边在 review proposal 阶段就对齐了，实际修复只花了 15 分钟。

### Code Review 中的 Spec 审查实践

我们建立了一个新规则：PR 必须包含对应的 OpenSpec 变更文件。Review 时先看 proposal.md 和 Delta Spec，再看代码。

这个规则的效果比预想的好。以前 review 代码时经常要问"你为什么要加这个函数？"，现在 proposal.md 里已经解释了动机。以前 review 50 行代码 diff 需要理解上下文，现在先看 Delta Spec 理解意图，再看代码确认实现。

**Review 流程变化**：

```
以前：看代码 diff → 猜意图 → 提问题 → 等回复 → 再审查
现在：看 proposal.md → 看 Delta Spec（理解意图）→ 看代码 diff（确认实现）→ 提问题
```

平均 review 时间从 45 分钟降到了 25 分钟。不是因为代码变好了，而是因为意图先被 spec 澄清了。

### 团队成员的反馈

**后端同学（Claude Code 用户）**：正面评价居多。他说"以前每次开新会话要花 10 分钟跟 AI 解释项目背景，现在它自动读 project.md 就行了。"他特别喜欢 Delta Spec 的 `MODIFIED` 标记，因为他在重构时经常担心"改了这个会不会影响其他地方"——Delta Spec 迫使他显式标注影响范围。

**前端同学（Cursor 用户）**：态度中立偏正面。他觉得"propose 阶段多花了 5-10 分钟，但确实减少了返工。"但他也指出"有时候 AI 生成的 proposal 质量参差不齐，需要人工修改的内容比较多，感觉像是'帮 AI 写 spec'而不是'AI 帮我写 spec'。"

**全栈同学（两个工具都用的）**：最积极的拥护者。他经常在 Cursor 和 Claude Code 之间切换，OpenSpec 的工具无关性对他最有价值。"不管我用哪个工具，spec 都是一样的。以前切换工具意味着重新给 AI 解释一遍项目。"

### 遇到的最大挑战：Spec 过时问题

这是三个项目中遇到的最严重的挑战。

大约在引入 OpenSpec 一个月后，我们发现有些 spec 文件已经过时了。原因是：有些小改动（修个 bug、调个接口字段名）没有走 OpenSpec 流程，直接改了代码。代码改了但 spec 没更新。

过时的 spec 比没有 spec 更危险。AI 读了过时的 spec 后生成的代码基于错误的假设，产生了新的 bug。

我们的解决办法：

1. 建立规则：任何涉及 API 接口、数据模型、业务逻辑的修改，必须走 OpenSpec 流程。纯粹的 UI 样式调整、bug fix 中的 typo 修复可以跳过。
2. 每周五做一次 spec review——用 `openspec validate --strict` 检查所有 spec 文件，人工抽查 spec 和代码是否一致。
3. 用 `/opsx:explore` 让 AI 读代码反向验证 spec 的准确性。

### 量化数据

引入 OpenSpec 前后三个月的数据对比（同一团队、同类需求）：

| 指标 | 引入前三个月 | 引入后三个月 |
|------|------------|------------|
| 平均 PR review 时间 | 45 分钟 | 25 分钟 |
| PR 返工率（review 后需要大改） | 35% | 18% |
| 跨模块冲突（合并后发现不兼容） | 每 2 周约 1 次 | 3 个月共 1 次 |
| 新人理解项目所需时间 | 约 3 天 | 约 1.5 天 |
| AI 生成代码的首次通过率 | 约 60% | 约 78% |
| 每周 AI 相关返工时间（人均） | 约 4 小时 | 约 1.5 小时 |
| 需求文档准确率（抽查） | 无法评估（无结构化文档） | 约 85% |

注意：这些数据受多种因素影响（团队对 AI 工具的熟悉度在提升、项目本身在成熟），不能全部归功于 OpenSpec。但 PR review 时间和返工率的改善是比较明确的。

### 引入过程中踩过的具体坑

在 SaaS 后台项目中，除了 spec 过时这个最大挑战外，还有几个具体的坑值得分享：

**坑一：project.md 写得太粗糙**

一开始我们的 `project.md` 只写了技术栈（"Next.js + PostgreSQL + Prisma"），没写架构约定和代码标准。结果 AI 在生成 spec 时，对项目结构的理解完全基于它读到的代码——而项目代码本身的架构并不统一（历史原因）。AI 生成的 proposal 里包含了"改进架构"的建议，但这不是我们需要的——我们只需要它按照现有架构来工作。

修复方法是花 20 分钟认真填写 project.md，把架构约定（"所有页面组件放在 /app/[route]/page.tsx"，"所有 API 调用走 /lib/api/client.ts"，"数据库操作只在 /lib/db/ 目录"）都写清楚。

**坑二：过度使用 Delta Spec 的 REMOVED 标记**

有一个变更在 Delta Spec 里标记了 `REMOVED: User Profile Caching`，但我们实际上只是把缓存策略从客户端改到了服务端——并没有"删除"用户资料缓存功能，只是改了实现方式。正确的做法应该是 `MODIFIED`，不是 `REMOVED`。

归档时，`REMOVED` 标记导致主 spec 里的用户资料缓存需求被删除了。后续开发中 AI 读 spec 时以为系统没有缓存，生成了完全没有缓存逻辑的代码。

教训是：Delta Spec 的标记要谨慎使用。`REMOVED` 意味着功能确实不要了，`MODIFIED` 意味着功能还在但行为变了。搞混了会导致后续 spec 不准确。

**坑三：没有及时 Archive**

有两个变更完成后忘记归档了。结果 `openspec/changes/` 里堆积了四个活跃变更（两个已完成未归档、两个正在开发），AI 在读取 spec 时被过时的 proposal 干扰，把已完成但未归档的 Delta Spec 当成了"待实施"的需求。

解决方法是养成习惯：每个变更完成并通过测试后立即 archive。后来我们把"检查是否有未归档变更"加入了每日站会的 checklist。

---

## 案例 3：Brownfield 遗留系统 —— 订单管理系统重构

### 项目背景

这是一个运行了 5 年的订单管理系统，Java + Spring Boot 技术栈，约 80000 行代码。团队 5 人：两个后端、一个前端、一个 QA、一个 DevOps。系统经历过三波不同团队的开发，代码风格混乱，文档严重缺失——唯一"文档"是两个过时的 Word 文件和一个没人维护的 Confluence 空间。

项目的核心挑战不是"加新功能"，而是"改老功能时不知道会炸什么"。订单状态的流转逻辑散落在 12 个 Service 类里，同一个状态转换在不同的 Service 里有不同的实现。加了新功能后，谁也不知道是否有边界情况被遗漏。

### 渐进式引入策略

这个项目不能像前两个那样直接 `openspec init` 就开始。80000 行代码、5 年历史，不可能一次性理解整个系统。

我们的策略是：**从修改最频繁的模块开始，逐个模块引入 spec。**

订单状态流转模块是最频繁被修改的部分，也是 bug 最多的部分。我们从这里开始。

### /opsx:explore 在理解遗留代码中的价值

OpenSpec 的扩展命令 `/opsx:explore` 在这个项目中发挥了关键作用。它的作用是让 AI 读代码、理解现有行为、反向生成 spec。

我们的做法：

1. 创建一个 "baseline" 变更：

```bash
/opsx:propose baseline-order-status
```

2. 在 proposal 里明确说明：这不是要做功能变更，而是要"记录系统当前怎么工作"

3. 让 AI 读 `src/main/java/com/example/order/` 下所有相关代码，反向生成 spec

AI 生成的 Delta Spec（标记为 `ADDED`，因为主 spec 是空的）包含了对订单状态流转的完整描述：

```markdown
## ADDED Requirements

### Requirement: Order Status Transition
The system SHALL manage order lifecycle through the following states:
CREATED → PAID → SHIPPED → DELIVERED → COMPLETED
Created → CANCELLED (before payment)
PAID → REFUNDING → REFUNDED

#### Scenario: Cancel before payment
- GIVEN an order in CREATED status
- WHEN the customer requests cancellation
- THEN the order status changes to CANCELLED
- AND inventory is released

#### Scenario: Cancel after payment
- GIVEN an order in PAID status
- WHEN the customer requests cancellation
- THEN the order status changes to REFUNDING
- AND a refund process is initiated
- AND inventory is NOT released until refund completes

#### Scenario: Invalid status transition
- GIVEN an order in any status
- WHEN a transition is attempted that is not in the allowed transitions
- THEN the system rejects the transition
- AND logs a warning
```

AI 在分析代码时还发现了几个我们之前没注意到的行为：

- `SHIPPED` 状态的订单不能取消，但代码里有一个未处理的分支，理论上可以绕过检查
- 订单创建时没有校验库存充足性，校验逻辑被意外放在了支付成功后的回调里
- 退款超时（7 天未完成）没有自动处理逻辑

这些发现本身就是有价值的——它们相当于一次低成本的代码审计。

### 用 Spec 记录"系统现在怎么工作"的过程

接下来两个月，我们对以下模块执行了同样的 baseline 流程：

- 支付模块（WeChat Pay + Alipay 集成）
- 库存管理模块
- 物流跟踪模块
- 通知模块（短信 + 邮件）

每个模块的 baseline spec 花费 1-2 小时生成，然后由对应的开发者 review 和修正。修正量通常在 20% 左右——AI 对主要流程的理解是准确的，但对边界情况和异常处理的描述经常不完整。

这 1-2 小时的投入换来的是：每个模块第一次有了准确的行为描述文档。这些文档比之前的 Word 文件和 Confluence 页面准确得多，因为它们是从实际代码反向生成的，而不是在项目启动时凭想象写的。

### 3 个月后的 Spec 覆盖率变化

引入 OpenSpec 三个月后的 spec 覆盖情况：

| 模块 | 代码行数 | 有 spec 覆盖 | 覆盖率 |
|------|---------|-------------|-------|
| 订单状态流转 | ~8000 行 | 完整 | ~100% |
| 支付模块 | ~6000 行 | 完整 | ~95% |
| 库存管理 | ~5000 行 | 主要流程 | ~80% |
| 物流跟踪 | ~4000 行 | 主要流程 | ~75% |
| 通知模块 | ~3000 行 | 部分 | ~50% |
| 用户管理 | ~3000 行 | 无 | 0% |
| 报表统计 | ~5000 行 | 无 | 0% |
| 其他 | ~46000 行 | 无 | 0% |
| **总计** | **~80000 行** | | **~40%** |

40% 的覆盖率看起来不高，但这 40% 覆盖的是系统中修改最频繁、bug 最多的部分。剩余 60% 大部分是稳定的或很少修改的代码。

### 对新成员 Onboarding 的影响

第三个月加入了一个新的后端开发者。对比他跟之前入职的同事的 onboarding 经历：

**之前新人的 onboarding（没有 OpenSpec）**：

- 第 1 天：搭建环境、读两个过时的 Word 文档
- 第 2-3 天：读代码、问老员工问题、画流程图理解业务
- 第 4-5 天：开始做第一个小需求，频繁问"这个逻辑为什么是这样的？"
- 约 2 周后才能独立做中等复杂度的需求

**这次新人的 onboarding（有 OpenSpec）**：

- 第 1 天：搭建环境、读 `openspec/project.md` 了解全局上下文
- 第 2 天：读 `openspec/specs/order/spec.md` 和 `openspec/specs/payment/spec.md`，对核心业务有了清晰理解
- 第 3 天：用 `/opsx:onboard` 让 AI 引导他理解项目 spec，开始做第一个小需求
- 第 5 天：已经能独立完成中等复杂度的需求

大约节省了 1 周的 onboarding 时间。更关键的是，新人问的问题质量变高了——他问的是"这个需求为什么要这样设计"（spec 层面的问题），而不是"这段代码在干什么"（代码层面的问题）。

### 最大的教训

**Baseline Spec 需要人工验证，不能盲信 AI 的分析。**

AI 在分析订单代码时，把一个 "临时 workaround"（开发者在注释里标了 `// TODO: fix this before v2 launch`）当成了"系统正常行为"写进了 spec。如果我们没有 review 就接受了这个 spec，后续的重构会基于错误的理解。

更具体地说，AI 发现了一段在支付失败后重试 5 次的逻辑，把它写成了 spec 的一个 Scenario："支付失败后系统 SHALL 自动重试最多 5 次"。但实际上这个重试逻辑是一个临时方案——原来的设计是通过消息队列异步重试，但当时消息队列还没搭建好，开发者在代码里写了个临时的同步重试。注释里清楚标了 `// TODO: replace with MQ-based retry`。

如果这个临时方案被固化到 spec 里，后续的重构会认为"同步重试 5 次"是正确行为，不会把它改成消息队列方案。

修正方法是在 review 时对照原始代码和业务逻辑，确认 AI 生成的每个 Scenario 都是"系统应该怎么做"而不是"代码目前碰巧怎么做的"。这个 review 过程不能省。

### 遗留系统引入 OpenSpec 的节奏控制

在订单管理系统这个项目上，我们学到的另一个重要教训是节奏控制。

一开始我比较激进，试图在第一个月就把所有核心模块的 baseline spec 都做完。但很快发现这不可行——每个模块的 baseline spec 需要 1-2 小时，加上 review 和修正又要 30-60 分钟。五个核心模块就是 8-15 小时的工作量，对于已经被需求排满的团队来说是很大的负担。

后来我们调整了策略：每周只做一个模块的 baseline spec，而且放在周五下午做（需求压力相对较小的时间段）。用三个月的时间逐步完成核心模块的覆盖。

这个节奏看起来慢，但好处是每次只引入一点变化，团队有时间适应和消化。如果一口气做太多，很容易因为"spec 质量参差不齐"而丧失信心。

### 对测试的影响

订单管理系统的测试覆盖率一直不高（约 40% 的单元测试覆盖率，几乎没有集成测试）。引入 OpenSpec 后，我们做了一个有趣的尝试：用 Delta Spec 里的 GIVEN/WHEN/THEN Scenario 作为测试用例的来源。

比如支付模块的 Delta Spec 里有这样的 Scenario：

```markdown
#### Scenario: Payment timeout auto-cancel
- GIVEN an order in PAID status
- WHEN 30 minutes pass without shipping confirmation
- THEN the order status changes to CANCELLED
- AND payment is refunded
```

我们让 AI 根据这个 Scenario 自动生成测试骨架代码：

```java
@Test
void testPaymentTimeoutAutoCancel() {
    // GIVEN an order in PAID status
    Order order = createTestOrder(OrderStatus.PAID);
    
    // WHEN 30 minutes pass without shipping confirmation
    timeService.advanceBy(Duration.ofMinutes(30));
    orderScheduler.checkTimeoutOrders();
    
    // THEN the order status changes to CANCELLED
    Order refreshed = orderRepository.findById(order.getId());
    assertEquals(OrderStatus.CANCELLED, refreshed.getStatus());
    
    // AND payment is refunded
    verify(refundService).processRefund(eq(order.getPaymentId()));
}
```

从 Scenario 到测试代码的转化不是全自动的（AI 生成的测试需要调整断言和 mock 设置），但比从零写测试快很多。支付模块的测试覆盖率从 35% 提升到了 62%。

这是一个 OpenSpec 的"副产物"价值——Delta Spec 里的结构化 Scenario 可以作为测试用例设计的输入，降低了"先有 spec 再有测试"的门槛。

---

## 三个项目的横向对比

### 项目规模 vs OpenSpec 收益的关系

| 维度 | 个人博客 | SaaS 后台 | 订单管理系统 |
|------|---------|----------|------------|
| 代码规模 | ~5000 行 | ~30000 行 | ~80000 行 |
| 团队规模 | 1 人 | 3 人 | 5 人 |
| 引入阶段 | 项目中期 | 项目中期 | 项目成熟期 |
| 引入成本 | 18 分钟/变更 | 30 分钟/变更 | 2 小时/模块（含 baseline） |
| 收益主要体现在 | 跨会话上下文恢复 | review 效率、跨模块协调 | 代码审计、新人 onboarding |
| 3 个月后的评价 | 正面，继续使用 | 正面，全面推广 | 正面，逐步扩展覆盖 |

一个清晰的规律：**项目规模越大，OpenSpec 的收益点越不同。**

- 小项目：收益在于"AI 不再失忆"
- 中型项目：收益在于"团队协作效率"
- 大型项目：收益在于"系统理解和新成员融入"

### 引入成本 vs 长期收益的曲线

```
收益
  │
  │                                          ╭────── 大型项目
  │                                    ╭─────╯
  │                              ╭─────╯
  │                        ╭─────╯
  │                  ╭─────╯ 中型项目
  │            ╭─────╯
  │      ╭─────╯ 小型项目
  │──────╯
  └────────────────────────────────────────────── 时间
         ↑
       引入成本
```

小型项目的收益曲线上升快但天花板低——系统规模有限，spec 覆盖到一定程度后边际收益递减。大型项目的收益曲线有较长的"爬坡期"（baseline spec 的投入），但长期收益天花板高——系统越复杂，有结构化文档的价值越大。

### 不同规模的推荐策略

**个人项目（< 10000 行）**：

- 从你频繁修改的模块开始引入
- `project.md` 一定要认真写——这是 AI 理解你项目的唯一入口
- 跳过 design.md，直接 proposal + spec + tasks
- 小改动（改个样式、修个 typo）不走 OpenSpec

**中小团队项目（10000-50000 行）**：

- 先在一个人的模块试点 2-3 周
- 建立"改代码必须同步更新 spec"的规则
- PR review 先看 spec 再看代码
- 每周做一次 spec 准确性检查
- 用 `openspec validate --strict` 加入 CI 流程

**大型遗留系统（> 50000 行）**：

- 从修改最频繁的模块开始做 baseline spec
- 不要试图一次性覆盖所有模块
- Baseline spec 必须人工 review，AI 的分析有 20% 左右的错误率
- 优先覆盖核心业务流程（订单、支付、权限），报表和工具类代码后做
- 把 spec 当成"活文档"——每次功能变更都更新对应 spec

---

## 综合经验教训

### 哪些场景 OpenSpec 带来了明显收益

1. **跨会话恢复上下文**：这是所有三个项目都受益的场景。用 OpenSpec 后，开新会话不需要重新解释项目背景。

2. **多人同时修改有交叉的模块**：Delta Spec 提前暴露了跨模块影响，避免了合并后的集成问题。

3. **PR Review 质量**：先看 spec 再看代码的 review 流程比直接看代码 diff 更高效。

4. **遗留代码理解**：用 `/opsx:explore` 反向生成 spec 是理解老系统的有效手段。

5. **新人 Onboarding**：读 spec 比读代码快 3-5 倍，新人能更快独立工作。

### 哪些场景增加了不必要的开销

1. **极小改动**：改个按钮文字、修个 CSS 样式，走 OpenSpec 流程的时间比改代码还长。

2. **探索性开发**：不确定方案时先试试，试了不行就扔掉。给探索性代码写 spec 是浪费。

3. **紧急修复**：线上出了 bug，每分钟都在损失收入，没有时间走 propose → review → apply 流程。

4. **AI 生成的低质量 Proposal**：有时候 AI 生成的 proposal 很空泛，你需要花大量时间修改它——感觉像是你在帮 AI 写 spec，而不是 AI 帮你规划。

### 最常见的 5 个误区和避坑建议

**误区 1："必须一次性把所有 spec 写好"**

这是最常见的错误想法。OpenSpec 文档明确说不要这么做。从你要改的地方开始，逐模块引入。正确的心态是"每次改动让系统多一份 spec"，而不是"先写完所有 spec 再写代码"。

**误区 2："Spec 写好了就不用再管了"**

Spec 会过时。代码改了但 spec 没更新，比没有 spec 还危险。必须建立"改代码必须同步更新 spec"的纪律。

**误区 3："AI 生成的 spec 不需要 review"**

AI 生成的 spec 有 15-25% 的错误率。主要错误包括：遗漏边界情况、把 bug 当成正常行为、对复杂业务逻辑理解不完整。Baseline spec 必须人工 review。

**误区 4："所有改动都要走 OpenSpec 流程"**

不是。一次性脚本、极小改动、紧急修复、探索性原型——这些场景直接改代码更快。OpenSpec 是工具不是法律，过度使用会增加不必要的摩擦。

**误区 5："OpenSpec 能解决所有 AI 编程的问题"**

不能。OpenSpec 解决的是"AI 不知道要做什么"的问题。它不解决"AI 写的代码有 bug"（那是测试和 review 的事）、"AI 选了错误的算法"（那是技术判断力的问题）、"AI 引入了安全漏洞"（那是 security review 的事）。

### 什么时候该用、什么时候不必用

**该用**：

- 跨会话继续开发同一个模块
- 多人同时修改有交叉的代码
- 重构已有模块（需要先理解现有行为）
- Code Review 需要理解变更意图
- 新成员需要快速理解系统

**不必用**：

- 改一行代码的 bug fix
- UI 样式微调
- 一次性数据处理脚本
- 探索性原型（试了可能就扔）
- 你自己手写的代码（你理解自己的意图，不需要 AI 帮你规划）

### 与 Vibe Coding 的效率对比估算

基于三个项目的实际经验，粗略估算：

| 操作 | Vibe Coding | OpenSpec | 差异 |
|------|-------------|----------|------|
| 添加一个新功能（首次） | 30-60 分钟 | 40-70 分钟 | +10 分钟（spec 开销） |
| 添加一个新功能（第 N 次，涉及已有模块） | 60-120 分钟（含返工） | 40-70 分钟 | -30~50 分钟 |
| 修改已有功能 | 40-90 分钟（含理解旧代码） | 30-60 分钟 | -10~30 分钟 |
| PR Review | 40-60 分钟 | 20-30 分钟 | -20~30 分钟 |
| 新人 Onboarding | 10-15 个工作日 | 5-8 个工作日 | -5~7 个工作日 |

模式很清楚：**单次操作的效率提升不明显（甚至略低），但多操作的累积效率提升显著。**OpenSpec 是"投资型"工具——前期投入换来的是长期回报。

---

## 对 OpenSpec 未来发展的期待和建议

基于三个项目的实战经验，我对 OpenSpec 的未来发展有以下期待：

**期待 1：Spec 自动验证**

目前 `openspec validate` 只检查 spec 格式（语法层面）。希望能增加"spec 和代码是否一致"的验证——比如 spec 里写了"支付成功后发送通知"，自动检查代码里是否有对应的逻辑。这能大幅减少"spec 过时"的问题。

**期待 2：更好的并行变更冲突检测**

当两个 change 修改同一个 requirement 时，目前依赖 AI 判断来合并。希望能有确定性的冲突检测——类似 git merge conflict 的机制，但针对 spec 文件。

**期待 3：Spec diff 和变更历史可视化**

希望能有更好的工具来查看 spec 的变更历史。目前要看某个模块的需求是怎么演变的，需要去 archive 里翻历史文件。一个简单的 `openspec history auth` 命令就能解决。

**期待 4：更轻量的"小改动"流程**

对于 1-2 个文件的极小改动，完整的 propose → apply → archive 流程太重。希望有一个"fast path"模式——只需要一行描述，自动跳过 design.md，直接 apply。

**期待 5：与测试框架的集成**

OpenSpec 的 Delta Spec 里已经有了 GIVEN/WHEN/THEN 格式的 Scenario。如果这些 Scenario 能自动生成为测试用例的骨架代码（比如 Jest 的 describe/it 块或 JUnit 的测试方法），会大幅降低从 spec 到测试的转换成本。我们在订单管理项目中已经尝试了手动把这个过程半自动化，效果不错。如果 OpenSpec 官方提供这个能力，会进一步降低"从 spec 到测试"的摩擦。

**期待 6：Spec 与代码的双向同步检测**

目前最大的痛点是"spec 过时"——代码改了但 spec 没更新，反过来也是。如果 OpenSpec 能在 CI 中自动检测"哪些 spec 描述的行为跟当前代码不一致"，就能在问题扩大之前发现并修复。理想的状态是：每次 CI 运行时，如果某个 spec 对应的代码被修改了但 Delta Spec 没有更新，自动发出警告。

**期待 7：更好的多人协作冲突解决**

当两个开发者同时 propose 了修改同一个 spec 的不同 change 时，归档时可能产生冲突。目前依赖 AI 判断来解决，但结果不完全可预测。希望能有更明确的冲突标记和解决策略——至少让开发者知道"这里有两个冲突的变更，请手动选择保留哪个"。

---

## 给准备引入 OpenSpec 的团队的建议

如果你读到了这里，正在考虑是否要给自己的团队引入 OpenSpec，以下是我的建议：

### 第一周：一个人在一个模块上试点

不要全团队同时切换。选一个技术能力强、愿意尝试新工具的人，在他负责的模块上试点 2-3 周。让他熟悉 propose → apply → archive 的完整流程，遇到问题自己解决。

### 第二到第三周：总结试点经验

试点的人把经验写成内部文档——不是写 OpenSpec 的使用教程，而是写"在我们的项目里，用 OpenSpec 开发是什么体验"。包括：哪些操作顺畅、哪些卡手、spec 的质量如何、花了多少额外时间、省了多少返工时间。

### 第四周：团队讨论是否推广

拿着试点数据和内部文档，跟团队讨论：要不要推广到其他模块？推广的策略是什么？哪些改动需要走 OpenSpec 流程、哪些可以跳过？spec review 的标准是什么？

### 第五周及以后：逐步推广

如果团队决定推广，每个模块指定一个人负责 baseline spec 的生成和 review。不要急，一周一个模块的节奏足够了。

### 一个需要提前想清楚的问题

引入 OpenSpec 意味着团队需要达成一个共识：**代码不再是唯一的真相源，spec 也是。** 当 spec 和代码不一致时，以 spec 为准（然后修改代码来匹配 spec，而不是反过来）。

这个认知转变比工具本身的引入更困难。有些开发者会觉得"spec 是多余的一层抽象"、"写 spec 的时间不如直接写代码"。这些想法不无道理——对于某些场景确实如此。但团队需要就"哪些场景需要 spec、哪些不需要"达成一致，而不是各做各的。

---

## 最终结论

三个项目、几个月的实战下来，我的结论是：

**OpenSpec 不是银弹，但它解决了一个真实且越来越重要的问题。**

这个问题的核心是：AI 编程工具的输出质量严重依赖输入的清晰度。Vibe Coding 让输入变得模糊（需求只存在于聊天记录里），导致输出质量不可预测。OpenSpec 让输入变得结构化（需求持久化为 spec 文件），使输出质量更可控。

它不是万能的——增加了前期时间、spec 可能过时、对 AI 模型有要求。但对于正在用 AI 编程做严肃项目的人来说，它是目前最轻量的"让 AI 写出你真正想要的代码"的方案。

最终判断标准跟我在第一篇文章里说的一样：**如果你在 AI 编程中，花在"修改 AI 第一次就理解错的东西"上的时间，超过了花在"提前告诉 AI 你要什么"上的时间，OpenSpec 就值得用。**

三个项目的经验都印证了这个判断。

---

## 延伸阅读

- [OpenSpec GitHub 仓库](https://github.com/Fission-AI/OpenSpec) — 源码和完整文档
- [OpenSpec Deep Dive（redreamality.com）](https://redreamality.com/garden/notes/openspec-guide/) — 架构深度解析，含 Retrofitting 模式和高级用法
- [A Practical Development Guide Based on OpenSpec + Claude CLI（Medium）](https://jxausea.medium.com/a-practical-development-guide-based-on-openspec-claude-cli-26da7df71356) — 基于 Claude CLI 的实践教程
- [OpenSpec Reddit 讨论（r/opencodeCLI）](https://www.reddit.com/r/opencodeCLI/comments/1rzo096/your_experience_with_the_new_openspec/) — 社区使用经验分享
- [6 Best Spec-Driven Development Tools（Augment Code）](https://www.augmentcode.com/tools/best-spec-driven-development-tools) — SDD 工具全景对比
- [Moving Toward Spec-Driven Development（jgcarmona.com）](https://jgcarmona.com/en/moving-toward-spec-driven-development/) — 从 Vibe Coding 迁移到 SDD 的实战经验
- [openspec-retrofit.md（GitHub Gist）](https://gist.github.com/) — Brownfield 项目引入 OpenSpec 的 Retrofitting 模式
