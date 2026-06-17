# 进阶实践：CI/CD 集成、团队协作与避坑指南

> 更新日期：2026/06

**TL;DR：** 把 OpenSpec 从"个人工具"升级到"团队基础设施"需要做三件事：CI 集成（`openspec validate --strict` 拦截格式问题）、Code Review 流程改造（先审 proposal 和 Delta Spec 再审代码）、团队纪律建设（改代码同步更新 spec、及时 archive、定期清理过时 spec）。本文还覆盖了并行变更管理、大型代码库的性能考量、常见坑的完整清单，以及什么时候该升级或降级 OpenSpec 使用程度的判断框架。

---

## CI/CD 集成

把 OpenSpec 的验证加入 CI 流水线，是从"手动检查"到"自动化保障"的关键一步。

### GitHub Actions 配置

最基础的配置——每次 PR 跑 OpenSpec 验证：

```yaml
name: OpenSpec Validate

on:
  pull_request:
    paths:
      - 'openspec/**'
      - '.github/prompts/**'
      - '.claude/skills/**'
      - '.cursor/rules/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install OpenSpec
        run: npm install -g @fission-ai/openspec@latest

      - name: Validate OpenSpec
        run: openspec validate --strict
```

`--strict` 标志会让 WARNING 也变成失败条件。默认不加 `--strict` 时，只有 ERROR 级别的问题才会导致验证失败。

### `openspec validate --strict` 检查什么

strict 模式下的检查项：

| 检查项 | 级别 | strict 是否阻塞 |
|--------|------|---------------|
| Delta Spec 没有 ADDED/MODIFIED/REMOVED section | ERROR | 是 |
| ADDED/MODIFIED 的 Requirement 缺少 SHALL/MUST | ERROR | 是 |
| ADDED/MODIFIED 的 Requirement 没有 Scenario | ERROR | 是 |
| 同一 Requirement 同时出现在 ADDED 和 REMOVED | ERROR | 是 |
| 主 Spec 缺少 Purpose section | ERROR | 是 |
| 主 Spec 缺少 Requirements section | ERROR | 是 |
| Purpose 文本太短 | WARNING | 是（strict 模式） |
| Requirement 没有 Scenario | WARNING | 是（strict 模式） |
| Delta 描述太简短 | WARNING | 是（strict 模式） |

strict 模式适合以下场景：

- 团队刚开始使用 OpenSpec，需要强制规范格式
- Spec 质量要求高的项目（金融、医疗、安全相关）
- Spec 由不同能力的 AI 模型生成，需要统一质量下限

非 strict 模式适合：

- 个人项目
- 已经熟练使用 OpenSpec 的团队
- 探索性变更（先快速 propose，后续补齐质量）

### 进阶 CI 配置

更完整的 CI 配置可以包含多个检查阶段：

```yaml
name: OpenSpec Checks

on:
  pull_request:
    paths:
      - 'openspec/**'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # 需要完整历史来检查 archive

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install OpenSpec
        run: npm install -g @fission-ai/openspec@latest

      - name: Validate all specs
        run: openspec validate --strict

      - name: Check for stale changes
        run: |
          # 检查是否有超过 7 天的未归档变更
          find openspec/changes -maxdepth 1 -mindepth 1 \
            -not -name "archive" \
            -mtime +7 \
            -exec echo "Warning: stale change found: {}" \; \
            -exec false \;

      - name: Validate proposal has scope
        run: |
          # 检查每个活跃 change 的 proposal 是否有 Scope section
          for dir in openspec/changes/*/; do
            if [ -f "${dir}proposal.md" ]; then
              if ! grep -q "## Scope" "${dir}proposal.md"; then
                echo "Error: ${dir}proposal.md missing ## Scope section"
                exit 1
              fi
            fi
          done
```

这个配置增加了两个自定义检查：

1. **过期变更检测**：如果 changes/ 目录中有超过 7 天的未归档变更，CI 报错
2. **Proposal Scope 检查**：确保每个 proposal 都有 Scope section

这两个检查不是 OpenSpec 内置的，是通过 shell 脚本实现的。你可以根据团队的规范添加类似的检查。

### CI 集成的注意事项

**只在 spec 相关文件变更时触发**。用 `paths:` 过滤器避免每次 PR 都跑 OpenSpec 验证。只有当 PR 包含 `openspec/` 目录下的文件变更时才触发。

**不要在 CI 中运行 propose 或 apply**。这些命令需要 AI 模型参与，不适合在 CI 环境中运行。CI 只做 `validate`——纯结构检查，不需要 AI。

**锁定 OpenSpec 版本**。上面的配置用 `@latest`，但在生产环境中建议锁定版本：

```yaml
- name: Install OpenSpec
  run: npm install -g @fission-ai/openspec@0.4.0
```

避免 OpenSpec 更新后新版本的验证规则导致原本通过的 CI 突然失败。

---

## Code Review 实践

OpenSpec 改变了 Code Review 的方式。传统 review 只看代码 diff，OpenSpec 让 review 可以"先审意图、再审实现"。

### Review 三步流程

**第一步：审 proposal.md（理解意图）**

Review 者首先看 proposal.md，回答这些问题：

- 为什么要做这个变更？动机是否合理？
- Scope 是否合理？有没有多做或漏做？
- Approach 方向是否正确？

如果 proposal 有问题，这一步就可以打回，不需要看后面的 spec 和代码。

**第二步：审 Delta Spec（理解影响范围）**

Delta Spec 告诉 review 者系统行为会有什么变化：

- ADDED：新增了什么行为？是否需要？
- MODIFIED：改了什么行为？是否有破坏性变更？
- REMOVED：删了什么行为？是否有依赖方会受影响？

重点检查 Scenario 的完整性——正常路径和异常路径是否都覆盖了。

**第三步：审代码 diff（确认实现）**

最后才看代码。此时 review 者已经理解了"为什么做"和"做了什么行为变更"，只需要确认"实现是否正确"。

### PR 中的文件组织

一个好的 OpenSpec PR 应该包含：

```
PR: Add user preference settings

Files changed:
  openspec/
  ├── changes/add-user-preferences/
  │   ├── proposal.md     ← 审查意图
  │   ├── specs/           ← 审查行为变更
  │   │   ├── user-settings/spec.md
  │   │   └── api/spec.md
  │   ├── design.md        ← 审查技术方案
  │   └── tasks.md         ← 审查实现计划
  ├── src/                 ← 审查代码实现
  │   ├── controllers/
  │   ├── models/
  │   └── services/
  └── tests/               ← 审查测试覆盖
```

PR 描述中建议包含一个简短的 summary：

```markdown
## Summary
Adds user preference settings (language, timezone, notifications).

OpenSpec change: `add-user-preferences`
- Proposal: [link to proposal.md in PR]
- Delta Spec: user-settings, api
- All tasks complete (10/10)

## Review Guide
1. Start with `proposal.md` for intent
2. Check delta specs for behavior changes
3. Review code implementation
```

### Review 清单

把以下清单作为 review 的参考：

**Proposal 审查**：

- [ ] Intent 是否清晰？（一句话能说清楚为什么要做）
- [ ] Scope 的 In scope 和 Out of scope 是否明确？
- [ ] Approach 方向是否正确？

**Delta Spec 审查**：

- [ ] ADDED 的 Requirement 是否用了 SHALL/MUST？
- [ ] 每个 Requirement 是否有至少一个 Scenario？
- [ ] Scenario 是否覆盖正常路径和异常路径？
- [ ] MODIFIED 是否标注了 Previous value？
- [ ] REMOVED 是否解释了为什么移除？

**Design 审查**：

- [ ] 技术方案是否符合项目现有架构？
- [ ] 是否列出了关键决策和理由？
- [ ] 是否考虑了向后兼容？

**代码审查**：

- [ ] 代码实现是否和 Delta Spec 描述的行为一致？
- [ ] 是否覆盖了 tasks.md 中的所有任务？
- [ ] 是否遵循了 design.md 中的技术方案？

### Spec Review 的常见问题

**Spec 写得太模糊**。

```markdown
### Requirement: Search
The system SHALL support search functionality.
```

这种 spec 没有 Scenario，没有具体的搜索规则。AI 根据这个 spec 生成的代码可能是全文搜索、也可能是简单的 LIKE 查询，完全取决于 AI 怎么猜。

Review 时应该要求补充 Scenario：

```markdown
### Requirement: Search
The system SHALL support full-text search across article titles and content.

#### Scenario: Basic search
- GIVEN articles with titles "React Hooks Guide" and "Vue 3 Migration"
- WHEN the user searches for "React"
- THEN only "React Hooks Guide" appears in results

#### Scenario: No results
- GIVEN no articles matching "xyz"
- WHEN the user searches for "xyz"
- THEN an empty result set is returned
- AND a "No results found" message is displayed
```

**Spec 混入了实现细节**。

```markdown
### Requirement: Authentication
The system SHALL use JWT tokens stored in httpOnly cookies
with RS256 signing algorithm and 15-minute expiration.
```

"JWT"、"httpOnly cookies"、"RS256" 是实现细节，不是行为描述。Spec 应该描述"做什么"（认证用户、保持登录状态、超时失效），而不是"怎么做"（用什么算法、存在哪里）。

正确写法：

```markdown
### Requirement: Authentication
The system SHALL authenticate users and maintain sessions
that expire after 15 minutes of inactivity.

#### Scenario: Session expiration
- GIVEN an authenticated user who has been idle for 15 minutes
- WHEN the user makes a request
- THEN the session is rejected
- AND the user must re-authenticate
```

具体的实现选择（JWT vs Session、RS256 vs HS256）应该放在 design.md 中。

---

## 团队纪律

工具提供了能力，但纪律决定了效果。以下几条是团队使用 OpenSpec 时必须建立的规则。

### 纪律一：改代码同步更新 spec

**规则**：如果你在 apply 过程中改变了某个 Requirement 的行为，必须同步更新 delta spec。

**为什么重要**：spec 过时比没有 spec 更危险。没有 spec 时，所有人都知道"不知道系统怎么工作"。有过时的 spec 时，人们以为"知道系统怎么工作"，但实际是错的。错误的信心比没有信心更危险。

**怎么执行**：

- 每次 apply 结束后运行 `/opsx:verify`。如果 verify 报 WARNING（实现和 spec 不一致），立即修复
- 在 PR review 中检查 spec 和代码的一致性
- 如果修改了已经 archive 的 spec，直接编辑主 spec 文件

### 纪律二：及时 archive

**规则**：功能上线后 24 小时内完成 archive。

**为什么重要**：未归档的 change 堆积在 changes/ 目录中，会干扰 AI 的判断。AI 在 propose 新变更时会读取所有活跃 change 的信息，过期的 change 是噪音。

**怎么执行**：

- 在 CI 中加过期变更检测（见上文 CI 配置部分）
- 每周做一次 changes/ 目录清理
- 如果有多个已完成的 change，用 `/opsx:bulk-archive` 批量归档

### 纪律三：定期清理过时 spec

**规则**：每季度做一次 spec 审查，清理不再准确的内容。

**为什么重要**：代码在持续演进，如果不及时更新 spec，spec 会越来越不准确。一个运行了两年的项目可能已经经历了多次架构调整、功能增减、接口变更。如果 spec 还停留在一年前的状态，它的价值是负的。

**怎么执行**：

- 每季度花半天时间，逐个审查主 spec 文件
- 对比 spec 和实际代码行为，标记过时部分
- 用 `/opsx:explore` 辅助理解代码的当前行为
- 需要修正的 spec，要么直接编辑，要么发一个专门的 "spec-cleanup" change

### 纪律四：proposal 必须有 Scope

**规则**：每个 proposal 必须有 `## Scope` section，包含 In scope 和 Out of scope。

**为什么重要**：Scope 是约束 AI 行为的关键手段。没有明确 Out of scope 的 proposal，AI 可能自作主张加入你没要求的功能。这不仅是浪费开发时间，更危险的是 AI 可能引入你不需要的架构变更。

**怎么执行**：

- 在 CI 中检查 proposal 是否有 Scope section（见上文 CI 配置）
- 在 PR review 中检查 Scope 是否合理

### 纪律五：使用高质量模型

**规则**：OpenSpec 的 propose 和 verify 操作必须使用高推理能力的模型。

**为什么重要**：低质量模型生成的 spec 有两个特征——模糊和遗漏。模糊的 spec 让 AI 在 apply 时"自由发挥"，违背了 spec 驱动的初衷。遗漏的 spec 漏掉了关键行为，导致 verify 无法检测问题。

**推荐配置**：

| 操作 | 最低模型要求 | 推荐 |
|------|------------|------|
| propose | Claude Sonnet 4 / GPT-4.5 | Claude Opus 4.5+ / GPT-5+ |
| apply | Claude Sonnet 4 / GPT-4.5 | Claude Sonnet 4+ / GPT-4.5+ |
| verify | Claude Opus 4.5 / GPT-5 | Claude Opus 4.5+ / GPT-5+ |
| explore | Claude Sonnet 4 / GPT-4.5 | Claude Opus 4.5+ / GPT-5+ |

propose 和 verify 对推理能力的要求最高。apply 相对宽容，因为 AI 在 apply 时有 spec 文件作为指导，不需要太多自主判断。

---

## 并行变更管理

当多个开发者同时在不同模块上工作，或者一个开发者在同一模块上做多个变更时，需要管理并行变更。

### 并行变更的冲突类型

**类型一：不同 spec 文件，无冲突**

```
Change A: 修改 specs/auth/spec.md
Change B: 修改 specs/payment/spec.md
```

完全并行，互不影响。先归档谁都行。

**类型二：同一 spec 文件，不同 Requirement，无冲突**

```
Change A: ADDED "Two-Factor Authentication" to specs/auth/spec.md
Change B: MODIFIED "Session Timeout" in specs/auth/spec.md
```

Delta Spec 的合并是按 Requirement 名称匹配的。不同的 Requirement 互不影响。先归档谁都行。

**类型三：同一 spec 文件，同一 Requirement，有冲突**

```
Change A: MODIFIED "Session Timeout" to 15 minutes
Change B: MODIFIED "Session Timeout" to 30 minutes
```

后归档的会覆盖先归档的。结果取决于归档顺序。

### 冲突处理策略

**策略一：避免冲突**

在 propose 阶段检查是否有活跃的 change 正在修改同一个 Requirement。如果有，要么等它完成，要么把两个变更合并成一个。

```bash
# 查看当前活跃的变更
openspec list

# 查看某个变更涉及的 spec
openspec show change-name
```

**策略二：用 bulk-archive 检测冲突**

```text
/opsx:bulk-archive
```

bulk-archive 会自动检测冲突：

```text
AI: Found 3 completed changes:
     - add-2fa (5/5 tasks complete)
     - update-session-timeout (3/3 tasks complete)
     - add-export (4/4 tasks complete)

     Checking for spec conflicts...
     ⚠ add-2fa and update-session-timeout both touch specs/auth/spec.md
     ⚠ Both changes modify "Session Timeout" requirement

     Inspecting codebase to resolve...
     Both changes are implemented. Will merge in chronological order:
     1. add-2fa (created Jan 20)
     2. update-session-timeout (created Jan 22)

     Note: update-session-timeout's version of "Session Timeout" will
     take precedence (last modified wins).

     Archive all 3 changes?
```

bulk-archive 在检测到冲突时会明确告诉你哪个版本会生效，让你确认。

**策略三：手动逐个归档**

如果你知道有冲突，可以按特定顺序逐个归档：

```text
/opsx:archive add-2fa
# 检查合并结果
/opsx:archive update-session-timeout
```

逐个归档可以在每次归档后检查主 spec 的状态，确保合并结果正确。

### 多人交叉模块的最佳实践

5 人以上的团队中，并行变更交叉是常态。以下实践可以减少冲突：

1. **沟通优先**。在 propose 之前，在团队频道里说一句"我要改 auth 模块的 Session Timeout"，让别人知道
2. **小变更优先**。把大变更拆成多个小变更。小变更的 propose → apply → archive 周期短，减少并行时间窗口
3. **指定变更负责人**。每个 change 有一个明确的负责人，其他人修改相关模块前先跟负责人沟通
4. **定期同步**。每天的 standup 中提及你正在进行的 OpenSpec change

---

## 性能考量：大型代码库的 spec 管理

当项目规模超过 40 万行代码时，OpenSpec 的使用方式需要做一些调整。

### Spec 文件膨胀问题

一个运行了三年的大型系统可能有 20-30 个 spec 文件，每个文件 100-500 行。总 spec 量可能达到 5,000-10,000 行 Markdown。

问题是：AI 在 propose 时需要读取相关的 spec 文件来生成准确的 delta spec。如果 spec 文件太多，会消耗大量上下文窗口。

**解决方法：按需加载**。

OpenSpec 的 propose 流程不是读取所有 spec 文件，而是根据你描述的变更范围选择性地读取。如果你说"修改支付模块"，它读取 `specs/payment/spec.md`，而不是读取所有 30 个 spec 文件。

你可以通过优化 spec 文件的组织来帮助 AI 更精确地找到相关上下文：

```
openspec/specs/
├── auth/
│   ├── login/spec.md          # 登录行为
│   ├── session/spec.md        # 会话管理行为
│   └── oauth/spec.md          # OAuth 行为
├── payment/
│   ├── checkout/spec.md       # 结账流程
│   ├── refund/spec.md         # 退款流程
│   └── webhook/spec.md        # 支付回调
├── notification/
│   ├── email/spec.md          # 邮件通知
│   └── push/spec.md           # 推送通知
└── ...
```

每个 spec 文件保持聚焦。一个大而全的 `specs/everything/spec.md`（3000 行）比 10 个小 spec 文件更难管理。

### Archive 目录膨胀

每次归档都会在 `changes/archive/` 目录下保留一份完整的变更记录。三年的项目可能有 100+ 个归档目录。

```text
openspec/changes/archive/
├── 2026-01-05-add-dark-mode/
├── 2026-01-08-fix-login-redirect/
├── 2026-01-12-add-search-filters/
...（100+ 目录）
```

这些归档目录不影响 OpenSpec 的运行（propose 不读取 archive），但会：

- 增加仓库体积
- 让 `git clone` 变慢
- 在某些 AI 工具中可能被意外读取

**解决方法**：

1. 把 archive 目录加入 `.gitignore`，只保留最近 3 个月的归档在仓库中
2. 或者把老的归档移到单独的归档仓库

```bash
# 只保留最近 3 个月的归档
find openspec/changes/archive -maxdepth 1 -mindepth 1 \
  -mtime +90 \
  -exec rm -rf {} \;
```

如果需要历史归档，可以从 git 历史中恢复。

### 大型变更的 spec 管理

一个涉及 5 个模块的大型重构，delta spec 可能涉及 5 个不同的 spec 文件。这对 AI 的上下文管理是个挑战。

**建议做法**：把大型重构拆成多个小型 change。每个 change 聚焦一个模块。

```
大型重构：拆分通知模块

Change 1: extract-email-service
  - 只涉及 specs/notification/email/spec.md
  - 把邮件发送逻辑从 notification.py 拆出

Change 2: extract-template-engine
  - 只涉及 specs/notification/email/spec.md
  - 把模板渲染逻辑独立出来

Change 3: add-notification-queue
  - 只涉及 specs/notification/spec.md
  - 加异步通知队列
```

拆分的好处：

- 每个 change 的 delta spec 更小更精确
- AI 的上下文窗口利用率更高
- Review 更容易（每次只看一个模块的变更）
- 归档更简单（减少冲突概率）

---

## 常见坑汇总

从社区反馈和实战中提炼的常见问题，按严重程度排序。

### 坑 1：Spec 过时给你错误信心

**严重程度**：高

**表现**：你读着 spec 觉得"系统应该有密码强度校验"，但实际代码里这个校验三个月前被注释掉了。你基于 spec 开发新功能，结果和实际代码冲突。

**原因**：有人改了代码但没更新 spec。

**预防**：

- 每次 apply 后运行 verify
- PR review 中检查 spec 和代码一致性
- 每季度做 spec 审查

**修复**：发现过时 spec 后立即修正。如果是小错误，直接编辑主 spec。如果是大偏差，发一个 "spec-sync" change 专门修正 spec。

### 坑 2：小模型生成的 spec 质量差

**严重程度**：高

**表现**：Spec 只有模糊的描述，没有 Scenario。Proposal 没有 Scope。Design 只写了"用什么技术"没写"为什么选这个"。

**原因**：使用低推理能力的模型（参数量较小的模型、免费档位的模型）。

**预防**：

- propose 和 verify 使用高质量模型
- 在 CI 中加 strict 验证（强制 Scenario 和 SHALL/MUST）
- Review 中检查 spec 质量

**修复**：如果低质量 spec 已经 archive，直接编辑主 spec 文件修正。不需要重新发起 change。

### 坑 3：上手前两周磨合期

**严重程度**：中

**表现**：

- 忘了用 propose 直接写代码
- propose 生成的 spec 需要大幅修改
- 不确定什么改动该走 OpenSpec
- archive 后发现 spec 有错

**原因**：OpenSpec 的概念简单，但养成习惯需要时间。

**预防**：

- 第一个星期不强求所有改动都走 OpenSpec
- 从简单功能开始（加搜索、加导出）
- 找一个已经用过的同事做 mentor
- 每天回顾"哪些改动应该走 OpenSpec 但没走"

**时间线**：大多数人 2-3 周后形成习惯。

### 坑 4：过度定制 Schema

**严重程度**：中

**表现**：团队设计了一个包含 7 个 artifact 的自定义 Schema，每次 propose 需要填 7 个文件。开发效率明显下降。

**原因**：把"理想中的规范流程"塞进了 Schema，而不是从实际需求出发。

**预防**：

- 先用标准 Schema 跑一个月
- 一个月后根据实际痛点决定是否定制
- 定制时只加必要的东西
- 定期评估自定义 Schema 的使用情况

**修复**：回退到标准 Schema，把自定义部分简化为 config.yaml 中的 rules。

### 坑 5：不按时 archive 导致 changes/ 目录堆积

**严重程度**：中

**表现**：changes/ 目录有 10 个以上的未归档变更，其中 5 个是已经完成的。

**原因**：没有建立 archive 的纪律，或者 archive 操作遇到了合并冲突就搁置了。

**预防**：

- 功能上线当天 archive
- 在 CI 中检测过期变更
- 遇到合并冲突不要搁置，立即处理

**修复**：用 `/opsx:bulk-archive` 批量处理已完成的变更。

### 坑 6：改代码不更新 spec 导致 drift

**严重程度**：高

**表现**：代码和 spec 的描述不一致。可能代码有某行为但 spec 没提，或者 spec 描述了某行为但代码已经没有。

**原因**：实现过程中偏离了 spec 但没有同步更新。

**预防**：

- apply 后跑 verify
- PR review 中检查一致性
- 培养团队"改代码同步改 spec"的习惯

**修复**：发现 drift 后立即修正 spec。修正方式取决于偏差程度——小偏差直接编辑主 spec，大偏差发一个专门的 change。

### 坑 7：一个 change 包含太多变更

**严重程度**：中

**表现**：一个 change 的 delta spec 涉及 5 个以上的 spec 文件，tasks.md 有 30+ 个任务。

**原因**：没有控制变更的范围，把多个功能打包成一个 change。

**预防**：

- 每个 change 聚焦一个功能或一个模块
- 如果一个 change 涉及超过 3 个 spec 文件，考虑拆分
- tasks.md 超过 15 个任务时考虑拆分

**修复**：如果已经创建了过大的 change，可以手动把它拆成多个 change。把相关的 artifact 文件和 delta spec 复制到新的 change 文件夹中。

### 坑 8：AI 在 apply 时偏离 design

**严重程度**：中

**表现**：design.md 写了用 Redis 做缓存，但 AI 在 apply 时用了内存 Map。design.md 写了用事件驱动，但代码用了轮询。

**原因**：AI 在 apply 时不一定严格遵循 design.md。特别是当 design.md 和实际代码环境有冲突时，AI 可能选择"它认为更好"的方案。

**预防**：

- apply 后跑 verify。verify 会检查实现是否和 design 一致
- 在 apply 的对话中明确提醒 AI："请严格按照 design.md 的方案实现"
- 如果需要偏离 design，先更新 design.md 再继续

**修复**：如果偏离已经发生，两种选择——更新 design.md 承认偏离的事实，或者修改代码回到 design 的方案。

---

## 什么时候升级/降级 OpenSpec 使用程度

OpenSpec 不是"要么用要么不用"的二选一。它的使用程度可以随着项目阶段和团队需求调整。

### 升级信号：应该增加 OpenSpec 使用深度

| 信号 | 说明 | 建议 |
|------|------|------|
| AI 生成代码的返工率超过 30% | AI 经常理解错需求 | 加强 propose 阶段的 spec 质量 |
| PR review 时间超过 40 分钟 | reviewer 难以理解变更意图 | 确保每个 PR 都带 proposal 和 delta spec |
| 跨会话开发频繁丢失上下文 | 每次新会话 AI 都要从头理解项目 | 检查 spec 覆盖率，补充关键模块的 spec |
| 新成员 onboarding 超过 1 周 | 新人难以理解系统行为 | 用 spec 做 onboarding 材料 |
| 多人修改同一模块经常冲突 | 缺乏变更协调机制 | 建立 propose 前沟通的流程 |

**升级操作**：

- 从 Core profile 切换到 Custom profile，解锁 verify、bulk-archive 等命令
- 在 CI 中启用 strict 验证
- 建立团队级的 spec 审查流程
- 给关键模块补充 spec

### 降级信号：应该减少 OpenSpec 使用深度

| 信号 | 说明 | 建议 |
|------|------|------|
| 团队抱怨 OpenSpec 增加太多开销 | 仪式感 > 实际价值 | 放宽使用范围，只给重大变更走 OpenSpec |
| 小改动也被迫走 propose 流程 | 判断标准太严格 | 明确"什么改动不需要 OpenSpec"的界限 |
| Spec 文件没人读 | spec 成了形式主义 | 重新评估 spec 的价值，考虑简化格式 |
| 自定义 Schema 维护成本高 | 定制化带来的负担 | 回退到标准 Schema |
| CI strict 验证频繁失败 | strict 标准太高 | 切换到非 strict 模式，只检查 ERROR |

**降级操作**：

- 简化 spec 格式要求（不加 `--strict`）
- 只给涉及 API 变更和架构调整的改动走 OpenSpec
- 移除不必要的 CI 检查
- 回退到 Core profile

### 使用程度的光谱

```
Level 0：不用 OpenSpec
  - 适合：一次性脚本、探索性原型

Level 1：个人使用，不强制
  - 适合：个人项目、小团队（2 人以下）
  - 做法：重大变更走 propose，小改动直接做

Level 2：团队使用，部分强制
  - 适合：3-10 人团队
  - 做法：涉及多模块的变更必须走 propose，CI 跑 validate（非 strict）

Level 3：团队使用，全面强制
  - 适合：10+ 人团队，或高安全要求项目
  - 做法：所有非 trivial 变更走 propose，CI 跑 strict 验证，spec 审查纳入 PR 流程
```

大部分项目适合 Level 1 或 Level 2。Level 3 只在确有需要时使用——它的管理成本不低。

### 切换使用程度的时机

| 项目阶段 | 建议级别 | 原因 |
|---------|---------|------|
| 项目初期（0-1 个月） | Level 0 | 系统行为还不稳定，过早写 spec 是浪费 |
| 功能开发期（1-6 个月） | Level 1 | 系统有了基本骨架，开始积累 spec |
| 功能迭代期（6 个月+） | Level 2 | spec 积累到一定量，需要团队级管理 |
| 大型重构期 | Level 2-3 | 重构风险高，spec 是行为基线 |
| 维护期（功能稳定） | Level 1 | 改动减少，不需要严格的 spec 管理 |

---

## 一个完整的 CI/CD + Review 工作流示例

把上面所有内容串起来，展示一个团队使用 OpenSpec 的完整工作流。

### 开发者工作流

```text
1. 开发者收到需求："给用户设置页加头像上传"

2. 评估是否需要走 OpenSpec
   - 涉及新 API 端点：是
   - 涉及文件上传逻辑：是
   - 涉及前端组件：是
   → 结论：需要走 OpenSpec

3. 在 AI 工具中发起 propose
   /opsx:propose add-avatar-upload

4. 审查生成的文件
   - proposal.md：Scope 合理（只做头像上传，不做头像裁剪）
   - delta spec：两个文件被修改（user-settings、api）
   - design.md：使用 S3 存储，加图片大小限制
   - tasks.md：8 个任务

5. 在团队频道沟通
   "我要改 user-settings spec，加头像上传功能"

6. 执行 apply
   /opsx:apply

7. 执行 verify
   /opsx:verify
   → 一个 WARNING：design.md 说用 S3，但代码用了本地存储
   → 修改代码使用 S3，或者更新 design.md 改为本地存储

8. 提交 PR
   PR 包含：openspec/changes/add-avatar-upload/ + 代码变更
   PR 描述包含 review guide

9. Review
   Reviewer 先看 proposal → delta spec → 代码
   提出修改意见

10. 修改后合并

11. Archive
    /opsx:archive
```

### CI 流程

```text
PR 提交 →
  OpenSpec Validate (strict) →
    通过 → Code Review
    失败 → 要求修改 spec

Code Review 通过 →
  合并到 main →
    自动 archive 检查 →
      有未归档变更？→ 提醒
      无 → 正常
```

### 团队周度维护

每周五下午：

1. 检查 changes/ 目录，归档已完成的变更
2. 检查是否有超过 7 天的未归档变更
3. 检查最近 archive 的 delta spec 质量
4. 在周会上简短回顾 OpenSpec 使用情况

---

## 写在最后

OpenSpec 从个人工具升级到团队基础设施，需要三样东西：自动化（CI 集成）、流程（Code Review 改造）、纪律（同步更新 spec、及时 archive）。

自动化是三者中最容易实现的——加一个 GitHub Actions 配置文件就行。流程改造需要团队达成共识，但有了 spec 文件做 review 依据，改造过程是自然的。纪律是最难的部分——它依赖人的行为改变，没有技术手段能强制。

从实际经验看，最有效的推广方式是"示范效应"：让团队中一个人先用好 OpenSpec，做出几个高质量的 PR（proposal + delta spec + 代码），其他人在 review 这些 PR 时自然体会到"有 spec 的 PR 更容易 review"。这比任何培训都有说服力。

最后，记住 OpenSpec 的目标不是让团队写更多文档，而是让 AI 写出更准确的代码、让 reviewer 更高效地审查、让团队成员之间更好地共享项目理解。如果某个 OpenSpec 实践不能实现这三个目标中的至少一个，那它就是不必要的仪式，应该果断砍掉。

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
