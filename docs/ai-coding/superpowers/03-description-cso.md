# Superpowers 原理 · description 字段与 CSO

> 更新日期：2026/06

**TL;DR：** Description 字段是技能的"广告牌"，决定 AI 能否找到它。黄金法则：**只写触发条件，不写流程**。Obra 实验数据显示，description 总结工作流会导致 AI 跳过技能完整内容。好的 description 包含具体症状、错误信息、同义词，覆盖 Claude 会搜索的关键词。

## CSO 的目的

CSO（Claude Search Optimization）是技能发现的核心。未来某个 Claude 实例遇到问题时，需要通过搜索找到你的技能。

**工作流：**

1. Claude 遇到问题（"tests are flaky"）
2. Claude 扫描所有技能的 `description` 字段
3. 匹配到相关技能
4. 加载完整技能内容

你的 `description` 决定了第 2-3 步能否成功。

## 黄金法则：触发条件，不是流程总结

### 描述触发条件

好的 `description` 回答一个问题：**"现在是不是该用这个技能？"**

```yaml
# ✅ 好的 description
description: Use when implementing any feature or bugfix, before writing implementation code

# ✅ 好的 description
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
```

这些 description 明确说了：
- 什么情况下用（implementing features, encountering bugs）
- 什么时候用（before writing code, before proposing fixes）

### 不要总结流程

**为什么不能总结流程？** 因为 AI 会走捷径。

#### Obra 实验数据："code review between tasks" 反例

实验场景：`subagent-driven-development` 技能要求每个任务完成后进行两次审查：

1. **Spec 合规性审查**：检查代码是否符合 spec
2. **代码质量审查**：检查代码本身的质量

技能的流程图明确显示了这个两阶段审查流程。

**实验 A：description 总结了流程**

```yaml
# 实验设置
description: Use when executing plans - dispatches subagent per task with code review between tasks
```

**结果：** AI 只做了一次审查。

**原因：** AI 读到 description 里的 "code review between tasks"，认为已经理解了流程，就跳过了技能完整内容。Description 说了一次审查，AI 就只做一次。

**实验 B：description 只描述触发条件**

```yaml
# 实验设置
description: Use when executing implementation plans with independent tasks in the current session
```

**结果：** AI 正确执行了两次审查。

**原因：** Description 没有总结流程，AI 必须读取完整技能内容才能知道该做什么。

### The Trap

Description 总结工作流会创造一个"捷径"：

```
Description 说 "code review between tasks"
  ↓
AI 想：我已经知道要做什么了
  ↓
AI 跳过技能完整内容
  ↓
AI 只执行了 description 里的总结（一次审查）
  ↓
技能的详细流程图（两次审查）被忽略
```

**结论：** Description 只负责触发，不负责教育。触发后，让 AI 读完整内容。

## Description 的格式

### 标准格式

以 "Use when..." 开头，包含具体触发条件和症状：

```yaml
description: Use when [具体触发条件], [具体症状], [上下文]
```

**示例：**

```yaml
# 好的 description
description: Use when tests have race conditions, timing dependencies, or pass/fail inconsistently

# 好的 description
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
```

### 第三人称

Description 会注入到系统提示里，用第三人称：

```yaml
# ❌ 第一人称（不好）
description: I can help you with async tests when they're flaky

# ❌ 第二人称（不好）
description: You can use this when tests are flaky

# ✅ 第三人称（好）
description: Use when tests have race conditions, timing dependencies, or pass/fail inconsistently
```

### 技术特异性

如果技能是技术特定的，明确说出来：

```yaml
# 技能特定于 React Router
description: Use when using React Router and handling authentication redirects

# 技能通用（不说技术）
description: Use when tests have race conditions, timing dependencies, or pass/fail inconsistently
```

### 长度控制

保持简洁，最好在 500 字符以内：

```yaml
# ❌ 太长
description: Use when you need to implement test-driven development for your project. This includes writing tests before code, watching them fail, implementing minimal code to make them pass, and then refactoring. Apply this to all new features, bug fixes, and refactoring work.

# ✅ 简洁
description: Use when implementing any feature or bugfix, before writing implementation code
```

## 关键词覆盖

Claude 会根据问题里的关键词来搜索技能。你的 description 需要覆盖这些关键词。

### 四类关键词

**1. 错误信息：**

```yaml
# Claude 可能搜索："Hook timed out", "ENOTEMPTY"
description: Use when hooks fail with ENOTEMPTY, timeout errors, or race conditions
```

**2. 症状：**

```yaml
# Claude 可能搜索："flaky", "hanging", "zombie"
description: Use when tests are flaky, hanging, or produce zombie processes
```

**3. 同义词：**

```yaml
# Claude 可能搜索："timeout", "hang", "freeze"
description: Use when code times out, hangs, or freezes during execution
```

**4. 工具名称：**

```yaml
# Claude 可能搜索："setTimeout", "sleep", "pytest"
description: Use when tests use setTimeout, sleep, or arbitrary delays
```

### 技术无关 vs 技术特定

**技术无关（描述问题，不是实现）：**

```yaml
# ✅ 好：描述问题
description: Use when tests have race conditions, timing dependencies, or pass/fail inconsistently

# ❌ 不好：描述具体实现
description: Use when tests use setTimeout/sleep and are flaky
```

**技术特定（技能本身就是技术特定的）：**

```yaml
# ✅ 好：明确技术栈
description: Use when using React Router and handling authentication redirects
```

如果技能是通用的（比如调试技巧），不要用技术特定的描述。如果技能本身就是针对某个技术的（比如 React Router），明确说出来。

## 命名规范

技能的 `name` 字段也影响发现。

### 动词优先

用动词开头的名称，描述行为：

```yaml
# ✅ 好：动词开头
name: creating-skills
name: condition-based-waiting
name: root-cause-tracing

# ❌ 不好：名词短语
name: skill-creation
name: async-test-helpers
name: debugging-techniques
```

### 用连字符分隔

只使用字母、数字、连字符：

```yaml
# ✅ 好
name: test-driven-development
name: writing-skills
name: systematic-debugging

# ❌ 不好：特殊字符
name: test_driven_development
name: writing.skills
name: TDD
```

### 描述行为或核心洞察

用名称告诉你这个技能是做什么的：

```yaml
# ✅ 好：描述行为
name: condition-based-waiting
name: flatten-with-flags
name: defense-in-depth

# ❌ 不好：模糊的类别
name: async-helpers
name: refactoring-techniques
name: debugging-tools
```

### Gerunds（-ing 形式）

对于过程性技能，用 -ing 形式：

```yaml
# ✅ 好：过程性技能
name: creating-skills
name: testing-skills
name: debugging-with-logs
```

## Token 效率

Getting-started 类型的技能（如 `using-superpowers`）和频繁引用的技能会加载到每个会话中。Token 效率很重要。

### 字数目标

| 技能类型 | 目标字数 |
|---------|---------|
| **Getting-started 工作流** | < 150 字 |
| **频繁加载的技能** | < 200 字 |
| **其他技能** | < 500 字 |

### 压缩技巧

**1. 移动细节到工具帮助：**

```yaml
# ❌ 不好：在 SKILL.md 中列出所有标志
search-conversations supports --text, --both, --after DATE, --before DATE, --limit N

# ✅ 好：引用 --help
search-conversations supports multiple modes and filters. Run --help for details.
```

**2. 使用交叉引用：**

```markdown
# ❌ 不好：重复工作流细节
When searching, dispatch subagent with template...
[20 行重复指令]

# ✅ 好：引用其他技能
Always use subagents (50-100x context savings). REQUIRED: Use [other-skill-name] for workflow.
```

**3. 压缩示例：**

```markdown
# ❌ 不好：冗长的示例（42 字）
your human partner: "How did we handle authentication errors in React Router before?"
You: I'll search past conversations for React Router authentication patterns.
[Dispatch subagent with search query: "React Router authentication error handling 401"]

# ✅ 好：最小示例（20 字）
Partner: "How did we handle auth errors in React Router?"
You: Searching...
[Dispatch subagent → synthesis]
```

**4. 消除冗余：**

- 不要重复交叉引用的技能内容
- 不要解释命令的显而易见的部分
- 不要包含同一模式的多个示例

### 验证

写完技能后，检查字数：

```bash
wc -w skills/path/SKILL.md
# getting-started 工作流：目标是 <150
# 其他频繁加载：目标是 <200
```

## 真实案例对比

### 案例 1：系统调试技能

**Bad Description:**

```yaml
description: Debug systematically by finding root causes, gathering evidence, forming hypotheses, and testing fixes before implementation
```

**问题：** 总结了流程，AI 可能跳过完整内容。

**Good Description:**

```yaml
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
```

**优势：**
- 明确触发条件（encountering bugs）
- 明确时机（before proposing fixes）
- 不总结流程，让 AI 读完整内容

### 案例 2：异步测试技能

**Bad Description:**

```yaml
description: For async testing
```

**问题：** 太抽象，不包含触发条件。

**Good Description:**

```yaml
description: Use when tests have race conditions, timing dependencies, or pass/fail inconsistently
```

**优势：**
- 具体症状（race conditions, timing dependencies）
- 具体行为（pass/fail inconsistently）
- 覆盖关键词（race, timing, inconsistent）

### 案例 3：技术特定技能

**Bad Description:**

```yaml
description: Use for authentication redirects
```

**问题：** 没有说明是哪个技术栈。

**Good Description:**

```yaml
description: Use when using React Router and handling authentication redirects
```

**优势：**
- 明确技术栈（React Router）
- 明确场景（authentication redirects）
- 技术特定但不抽象

## 权衡与局限

### Description 的局限

- **只能做简单匹配**：基于文本相似度，不能做复杂判断
- **可能误触发**：description 写得太宽会触发不该触发的情况
- **可能欠触发**：description 写得太窄会漏掉应该触发的情况

### 调优成本

- **需要测试**：写完 description 需要用真实请求测试触发准确性
- **需要迭代**：第一次写的 description 往往不够好，需要根据测试结果调整
- **需要平衡**：太窄和太宽之间需要找到平衡点

### 什么时候不需要花太多时间

- **个人技能**：如果技能只是给自己用的，description 不需要太完美
- **狭窄场景**：如果技能只在很窄的场景下用，description 写得很具体就行
- **实验性技能**：如果还在实验阶段，description 可以先简单，后续优化

## 延伸阅读

- [02 - Skills 系统原理](02-skills-system.md) — 技能的加载和触发机制
- [writing-skills 技能原文](https://github.com/obra/superpowers/blob/master/skills/writing-skills/SKILL.md) — CSO 完整指南
- [Agent Skills 规范](https://agentskills.io/specification) — 技能文件的官方规范
- [Claude Search 最佳实践](https://docs.anthropic.com/claude/docs/skills) — Anthropic 官方的技能优化指南

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
