# Superpowers 工作流 · verification-before-completion 与 code review

> 更新日期：2025/06

**TL;DR：** Superpowers 把「完成」独立成一个阶段，不允许修完代码就说完成。必须先验证：跑命令、读输出、数失败数，然后才能声明状态。code review 配对存在：请求 review 时给审查者精心设计的上下文（不是你的会话历史），收到 review 后先验证再实现——不表演式同意，不盲目实现，技术上错了就技术性推回。Critical 级别问题阻断进度，必须立即修复。

## 为什么「完成」独立成一段

常见的开发流程里，修完 bug、写完功能，立即说「完成了！」。Superpowers 认为这是不诚实，不是效率。

问题在于：没验证的完成声明是猜测。你以为测试通过了，但你上次跑测试是两小时前。你以为 build 没问题，但你没跑最新的改动。你以为 bug 修好了，但你没手动复现原症状。

Superpowers 的解决方案：完成 = 完成修复 + 验证证据。两个独立阶段，缺一不可。

**为什么不能合并？**

合并会导致「假完成」。你改了代码，感觉良好，就直接跳到下一个任务。等到 CI 挂了、测试失败了、用户抱怨了，你才发现当时的「完成」是幻觉。

独立阶段强制停下来验证。你必须在声明完成前运行验证命令、读取输出、确认数字。这让完成变成可测量的状态，不是主观感觉。

## Verification-Before-Completion

**核心原则：证据优先于断言，永远。**

### 铁律

```
NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE
```

没在本消息里跑验证命令，就不能声明通过。

### 门函数

```
声明任何状态或表达满意前：

1. 识别：什么命令证明这个声明？
2. 运行：执行完整命令（全新、完整）
3. 读取：完整输出、检查退出码、计数失败
4. 验证：输出确认声明吗？
   - 否：声明实际状态附证据
   - 是：声明附证据
5. 然后：才能做声明

跳过任何一步 = 说谎，不是验证
```

### 常见失败模式

| 声明 | 需要 | 不够 |
|------|------|------|
| 测试通过 | 测试命令输出：0 失败 | 之前运行、「应该通过」 |
| Linter 干净 | Linter 输出：0 错误 | 部分检查、外推 |
| Build 成功 | Build 命令：exit 0 | Linter 通过、日志看起来好 |
| Bug 修复 | 测试原症状：通过 | 代码改了、假设修好了 |
| 回归测试工作 | 红绿循环验证 | 测试通过一次 |
| Agent 完成 | VCS diff 显示改变 | Agent 报告「成功」 |
| 需求满足 | 逐行检查清单 | 测试通过 |

### 关键模式

**测试：**
```
✅ [跑测试命令] [见：34/34 通过] "All tests pass"
❌ "Should pass now" / "Looks correct"
```

**回归测试（TDD 红绿）：**
```
✅ 写 → 跑（通过）→ 回退修复 → 跑（必须失败）→ 恢复 → 跑（通过）
❌ "I've written a regression test"（没红绿验证）
```

**Build：**
```
✅ [跑 build] [见：exit 0] "Build passes"
❌ "Linter passed"（linter 不检查编译）
```

**需求：**
```
✅ 重读计划 → 创建清单 → 验证每个 → 报告缺口或完成
❌ "Tests pass, phase complete"
```

**Agent 委托：**
```
✅ Agent 报告成功 → 检查 VCS diff → 验证改变 → 报告实际状态
❌ 信任 agent 报告
```

### 红旗标志

- 用「应该」、「可能」、「看起来」
- 验证前表达满意（"Great!", "Perfect!", "Done!" 等）
- 准备 commit/push/PR 但没验证
- 信任 agent 成功报告
- 依赖部分验证
- 想「就这一次」
- 累了想结束工作
- **任何暗示成功但没跑验证的措辞**

### 为什么重要

从 24 个失败记忆：
- 你的伙伴说「我不信你」——信任崩塌
- 未定义函数被发布——会崩溃
- 缺失需求被发布——功能不完整
- 时间浪费在假完成 → 重定向 → 重做
- 违反：「诚实是核心价值。如果你说谎，你被替换。」

## Requesting Code Review

Superpowers 要求在任务完成后请求代码审查。不是可选项，是强制步骤。

**核心原则：早审查，常审查。**

### 什么时候请求

**强制：**
- subagent-driven development 的每个任务后
- 完成主要功能后
- 合并到 main 前

**可选但有价值：**
- 卡住时（新鲜视角）
- 重构前（基线检查）
- 修复复杂 bug 后

### 如何请求

**1. 获取 git SHA：**
```bash
BASE_SHA=$(git rev-parse HEAD~1)  # 或 origin/main
HEAD_SHA=$(git rev-parse HEAD)
```

**2. 派发代码审查 subagent：**

用 Task 工具 `general-purpose` 类型，填充 `code-reviewer.md` 模板

**占位符：**
- `{DESCRIPTION}` - 你构建什么的简要总结
- `{PLAN_OR_REQUIREMENTS}` - 它应该做什么
- `{BASE_SHA}` - 起始提交
- `{HEAD_SHA}` - 结束提交

**3. 对反馈行动：**
- 立即修复 Critical 问题
- 继续前修复 Important 问题
- 记录 Minor 问题稍后处理
- 审查者错了就技术性推回（附理由）

### 示例

```
[刚完成任务 2：添加验证函数]

你：让我在继续前请求代码审查。

BASE_SHA=$(git log --oneline | grep "Task 1" | head -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)

[派发代码审查者 subagent]
  DESCRIPTION: 添加 verifyIndex() 和 repairIndex()，4 种问题类型
  PLAN_OR_REQUIREMENTS: docs/superpowers/plans/deployment-plan.md 的任务 2
  BASE_SHA: a7981ec
  HEAD_SHA: 3df7661

[Subagent 返回]：
  优势：干净架构、真实测试
  问题：
    Important: 缺失进度指示器
    Minor: 报告间隔的魔法数字 (100)
  评估：可以继续

你：[修复进度指示器]
[继续任务 3]
```

### 工作流集成

**Subagent-Driven Development：**
- 每个任务后审查
- 在问题复合前捕获
- 继续下个任务前修复

**Executing Plans：**
- 每个任务后或自然检查点审查
- 获取反馈、应用、继续

**Ad-Hoc Development：**
- 合并前审查
- 卡住时审查

## Receiving Code Review

收到代码审查反馈后，Superpowers 强制技术评估，不是情绪表演。

**核心原则：实现前验证。假设前提问。技术正确性胜过社交舒适。**

### 响应模式

```
收到代码审查反馈时：

1. 读：完整反馈不反应
2. 理解：用自己的话重述要求（或提问）
3. 验证：对照代码库现实检查
4. 评估：对这个代码库技术上正确吗？
5. 响应：技术确认或理由推回
6. 实现：一次一项，测每个
```

### 禁止响应

**永远不要：**
- "You're absolutely right!"（明确违反 CLAUDE.md）
- "Great point!" / "Excellent feedback!"（表演式）
- "Let me implement that now"（验证前）

**而是：**
- 重述技术要求
- 问澄清问题
- 错了就技术性推回
- 直接开始工作（行动 > 言语）

### 处理不明确反馈

```
如果任何项不明确：
  停止 - 还不要实现任何东西
  问不明确项的澄清

为什么：项可能相关。部分理解 = 错误实现。
```

**示例：**
```
你的伙伴："Fix 1-6"
你理解 1,2,3,6。4,5 不明确。

❌ 错：现在实现 1,2,3,6，稍后问 4,5
✅ 对："我理解项 1,2,3,6。继续前需要 4 和 5 的澄清。"
```

### 来源特定处理

**来自你的伙伴**
- **信任** - 理解后实现
- **仍然问**如果范围不明确
- **无表演式同意**
- **跳到行动**或技术确认

**来自外部审查者**
```
实现前：
  1. 检查：对这个代码库技术上正确吗？
  2. 检查：破坏现有功能吗？
  3. 检查：当前实现的理由？
  4. 检查：在所有平台/版本工作吗？
  5. 检查：审查者理解完整上下文吗？

如果建议似乎错：
  技术性推回

如果不能容易验证：
  说明："我不能验证这个没有 [X]。我应该 [调查/问/继续]？"

如果和你的伙伴之前的架构决策冲突：
  停止并先和你的伙伴讨论
```

**你伙伴的规则：** "外部反馈——怀疑，但仔细检查"

### YAGNI 检查「专业」功能

```
如果审查者建议「正确实现」：
  grep codebase 实际用法

  如果未用："这个端点没被调用。移除它（YAGNI）？"
  如果用了：然后正确实现
```

**你伙伴的规则：** "你和审查者都向我报告。如果我们不需要这个功能，别加。"

### 实现顺序

```
多项反馈：
  1. 任何不明确的先澄清
  2. 然后按顺序实现：
     - 阻塞问题（崩溃、安全）
     - 简单修复（拼写、导入）
     - 复杂修复（重构、逻辑）
  3. 测试每个修复单独
  4. 验证无回归
```

### 什么时候推回

推回当：
- 建议破坏现有功能
- 审查者缺完整上下文
- 违反 YAGNI（未用功能）
- 对这个栈技术上不正确
- 存在遗留/兼容性原因
- 和你伙伴的架构决策冲突

**如何推回：**
- 用技术推理，不防御性
- 问具体问题
- 引用工作测试/代码
- 如果架构性就涉及你的伙伴

**如果大声推回不舒服的信号：** "Strange things are afoot at the Circle K"

### 确认正确反馈

反馈**确实**正确时：
```
✅ "Fixed. [什么改变的简要描述]"
✅ "Good catch - [具体问题]。在 [位置] 修复。"
✅ [直接修并在代码里显示]

❌ "You're absolutely right!"
❌ "Great point!"
❌ "Thanks for catching that!"
❌ "Thanks for [任何东西]"
❌ 任何感谢表达
```

**为什么不用谢：** 说话在行动。直接修。代码本身显示你听到反馈。

**如果抓到自己要写 "Thanks"：** 删掉。陈述修复代替。

### 优雅纠正你的推回

如果你推回并且错了：
```
✅ "You were right - 我查了 [X] 确实 [Y]。现在实现。"
✅ "验证这个你是对的。我初始理解错了因为 [理由]。修复中。"

❌ 长道歉
❌ 辩护为什么推回
❌ 过度解释
```

事实性陈述纠正并继续。

### 常见错误

| 错误 | 修复 |
|------|------|
| 表演式同意 | 陈述要求或直接行动 |
| 盲目实现 | 先对照代码库验证 |
| 批量不测试 | 一个一个，测每个 |
| 假设审查者对 | 检查是否破坏东西 |
| 避免推回 | 技术正确性 > 舒适 |
| 部分实现 | 先澄清所有项 |
| 不能验证，继续 | 陈述限制，问方向 |

### 真实示例

**表演式同意（错）：**
```
审查者："Remove legacy code"
❌ "You're absolutely right! Let me remove that..."
```

**技术验证（对）：**
```
审查者："Remove legacy code"
✅ "检查... build target 是 10.15+，这个 API 需要 13+。向后兼容需要 legacy。当前 impl 有错 bundle ID - 修复还是放弃 pre-13 支持？"
```

**YAGNI（对）：**
```
审查者："Implement proper metrics tracking with database, date filters, CSV export"
✅ "Grepped codebase - 没东西调这个端点。移除它（YAGNI）？还是有我遗漏的用法？"
```

**不明确项（对）：**
```
你的伙伴："Fix items 1-6"
你理解 1,2,3,6。4,5 不明确。
✅ "理解 1,2,3,6。继续前需要 4 和 5 的澄清。"
```

## Critical Issue 阻断流程

Superpowers 定义问题严重性：

- **Critical** - 阻断进度，必须立即修复
- **Important** - 继续前修复
- **Minor** - 稍后处理

收到 Critical 级别问题后，AI 被禁止继续到下一个任务。必须：
1. 停止当前工作流
2. 修复 Critical 问题
3. 验证修复
4. 重新请求审查确认
5. 然后才能继续

这不是惩罚，是防止错误扩散。一个内存泄漏或安全漏洞在早期是 10 分钟修复，合并到 main 后是 2 小时排雷。

## 权衡与局限

Superpowers 的验证和审查不是免费午餐。

**时间成本：** 每个任务后请求审查确实慢过「写完直接继续」。差出来的 5-10 分钟在审查和修复。但你捕获的是会累积的技术债。3 个任务的小问题如果不在每个任务后捕获，第 4 个任务时会变成大重构。

**审查疲劳：** 如果每次小改动都审查，审查者会疲劳、草率。Superpowers 的策略是：小改动可以批量审查（比如 5 个小任务后），但必须每个主要功能后审查。这不是固定规则，是团队共识。

**推回的社交成本：** 技术性推回外部反馈需要技巧。太频繁显得傲慢，太顺从引入 bug。Superpowers 的建议是：技术上错了就推回，但语气要中立、理由要具体、引用证据。这不是冲突，是协作找正确答案。

**验证的环境差异：** 本地验证通过不等于 CI 通过。依赖版本、操作系统差异、并行执行都可能导致不一致。Superpowers 要求最终验证在接近 CI 的环境中进行——不是跑测试就够，是跑完整的 CI pipeline。

## 延伸阅读

- [Superpowers GitHub 仓库](https://github.com/obra/superpowers) - 完整技能库和最新文档
- [verification-before-completion SKILL.md](https://github.com/obra/superpowers/blob/master/skills/verification-before-completion/SKILL.md) - 验证优先 skill 完整实现
- [requesting-code-review SKILL.md](https://github.com/obra/superpowers/blob/master/skills/requesting-code-review/SKILL.md) - 请求审查 skill 和模板
- [receiving-code-review SKILL.md](https://github.com/obra/superpowers/blob/master/skills/receiving-code-review/SKILL.md) - 接收审查 skill 和模式
- [test-driven-development SKILL.md](https://github.com/obra/superpowers/blob/master/skills/test-driven-development/SKILL.md) - TDD 和验证的配合
