<!--
调研来源（不发布，仅记录）：
1. OpenAI 官方文档 developers.openai.com/codex/cli/slash-commands — /review、/diff、/approve 斜杠命令
2. OpenAI 官方文档 developers.openai.com/codex/config-reference — review_model、approvals_reviewer、auto_review 等配置项
3. OpenAI 官方文档 developers.openai.com/codex/agent-approvals-security — 审批策略与自动审查机制
4. openai/codex 源码 codex-rs/cli/src/main.rs — codex review 子命令和 ExecCommand::Review 实现
5. openai/codex 源码 codex-rs/exec/src/cli.rs — review 模式的 --uncommitted、--base、--commit 参数
6. openai/codex 源码 codex-rs/tui/src/slash_command.rs — TUI 内斜杠命令定义
7. openai/codex 源码 codex-rs/exec/src/lib.rs — review/start API 调用逻辑
8. zread.ai/openai/codex 综合文档 — 非交互式执行模式、TUI 命令列表、配置参考
版本基准: 2026 年 6 月
-->

# Codex CLI 代码审查：/review、/diff 与自动审查

> **TL;DR** — `/review` 让 Codex 审查当前工作树的改动，它会关注行为变化、缺失的测试、安全隐患这些人类容易遗漏的问题。`/diff` 显示完整的 Git diff（包括未跟踪文件），帮你确认具体改了什么。两者配合使用是 Codex 工作流中最基本的代码审查方式。进阶玩法包括 `review_model` 指定审查专用模型、`approvals_reviewer = "auto_review"` 开启自动审查子代理、`codex review` 命令行批量审查。本文从为什么要审查开始，逐层拆解每个命令的用法和底层机制，最后用三个实际场景把所有工具串起来。

---

## 1. 为什么代码审查重要

先说一个真实场景。

你的同事（或者昨天的你自己）让 Codex 做了一次多文件修改——给用户认证模块加了 JWT 刷新逻辑。改完之后跑了测试，全部通过。Codex 报告"任务完成"。你满意地点点头，commit，push。

第二天线上出了 bug：用户的 session 在某些情况下会无限刷新，导致服务器负载飙升。回过头去看代码，发现问题出在一个边界条件上——当 refresh token 过期但 access token 还没过期时，刷新逻辑进入了一个死循环。测试没覆盖到这个边界，Codex 也没发现。

这个问题本来可以在改完代码后一次 3 分钟的审查中发现。但没人审查，问题就这样上线了。

### 人眼审查的盲区

代码审查不是走形式。它的核心价值在于发现几类特定的问题：

- **逻辑漏洞**：代码在正常路径上跑得通，但边界条件（空值、溢出、并发、时序）没处理好
- **隐式行为变更**：改了 A 函数，B 函数因为依赖 A 的返回值也变了，但没人注意到
- **缺失的测试**：改了逻辑但没加对应的测试用例，或者测试只覆盖了 happy path
- **安全隐患**：引入了新的攻击面（注入、权限绕过、信息泄露）

人眼审查有一个根本性矛盾：审查者既要理解代码的上下文（它为什么这样写），又要跳出上下文去发现问题。阅读代码时，人很容易顺着作者的思路走，反而跳不出思维框架。

### Codex 审查的优势

Codex 做代码审查有几个人类做不到的事：

1. **逐行对比 diff**：它可以精确分析每一行改动，不会因为疲劳跳过任何一行
2. **跨文件追踪**：改了一个函数签名，它可以自动检查所有调用方是否适配，人类得靠 grep 或者记忆力
3. **模式识别**：它能识别常见的安全反模式（硬编码密钥、未校验的用户输入、不安全的随机数生成）
4. **一致性检查**：它能检查新代码是否和项目已有的代码风格、命名约定一致

当然，Codex 审查也有局限。它不理解业务上下文（为什么这个字段可以为 null），不理解团队的历史决策（为什么没用那个看起来更优雅的方案），也容易漏掉需要运行时才能暴露的问题。所以 Codex 审查是补充，不是替代。

### 什么时候该审查

不是每次让 Codex 改两行代码都需要审查。但以下情况建议审查：

- 改了 3 个以上文件
- 修改涉及权限、认证、数据校验等安全相关逻辑
- 改了公共 API 的接口签名
- 重构了核心模块
- 改了数据库 schema 或数据迁移逻辑
- 准备发 PR 之前

---

## 2. /review 命令详解

`/review` 是 Codex TUI 中内置的代码审查命令。它的作用是让 Codex 审查当前工作树中的改动。

### 基本用法

在 Codex TUI 的输入框中输入：

```
/review
```

Codex 会读取当前工作树的 diff（和 `/diff` 看到的一样），然后对改动进行审查。审查过程是只读的——`/review` 不会修改你的代码，不会提交，不会跑命令。它只是在分析 diff 后给出审查意见。

审查完成后，Codex 会在 TUI 中输出一段审查报告。报告通常包含：

```
审查 src/lib/auth.ts 的改动：

1. 第 45 行：refreshToken 函数缺少过期检查
   当 refresh token 已过期时，函数仍然尝试使用它来获取新的 access token。
   建议：在调用 token 端点之前检查 refresh token 的过期时间。

2. 第 67 行：潜在的无限循环
   while (needsRefresh) 循环中缺少退出条件。
   如果 refresh 请求持续失败，循环不会终止。
   建议：添加最大重试次数限制。

3. 缺失测试
   改动涉及 token 刷新逻辑，但没有对应的测试覆盖以下场景：
   - refresh token 过期
   - 刷新请求失败（网络错误）
   - 并发刷新请求
```

### 带参数的审查

`/review` 支持内联参数，可以指定审查重点：

```
/review 重点关注安全问题
```

```
/review 检查是否有性能问题
```

```
/review 看看测试覆盖是否充分
```

参数作为审查指令传给 Codex，它会在审查时特别关注你提到的方向。这不是说其他方向不管了，而是审查报告会优先展示你关注的问题。

### 审查输出的解读

Codex 的审查报告一般按严重程度排列问题。你需要关注的几个维度：

**行为变化**：改动是否引入了和之前不同的行为？这个行为变化是否符合预期？

**缺失的测试**：改了逻辑有没有加测试？测试是否覆盖了边界条件？

**安全隐患**：新代码是否引入了攻击面？输入校验是否充分？权限检查是否到位？

**代码质量**：命名是否清晰？是否有重复代码？是否符合项目已有的风格？

**依赖影响**：改动是否会影响其他模块？调用方是否需要适配？

一个实用的习惯：审查完之后，让 Codex 把发现的问题逐个修掉：

```
根据刚才的审查结果，逐个修复这些问题。修复完后我会再 /review 一次
```

### review_model：审查专用模型

默认情况下，`/review` 使用当前会话的模型。如果你在用 `o4-mini` 做日常开发（速度快），但希望审查时用 `o3`（推理更深），可以通过 `review_model` 配置项覆盖：

```toml
# ~/.codex/config.toml

# 会话模型（日常开发）
model = "o4-mini"

# 审查模型（更深入的分析）
review_model = "o3"
```

这样，你平时和 Codex 对话用的是 `o4-mini`，执行 `/review` 时自动切换到 `o3` 进行审查。审查完成后，会话模型仍然是 `o4-mini`。

为什么审查要用更强的模型？

- 审查需要更深入的推理——它不只是生成代码，而是要发现代码中的问题，这属于「找错」任务，对推理能力要求更高
- 审查是一次性操作，不会频繁消耗 token——审查一个 diff 的 token 消耗大约是一次普通对话的 2-3 倍，但频率低得多
- 强模型的审查结果更可靠——它能发现弱模型可能遗漏的边界条件和逻辑漏洞

`review_model` 不设的话，默认跟随 `model` 的值。如果你只用一个模型，不需要单独配置。

### /review 是只读操作

这一点需要强调：`/review` 不会修改你的代码。它做的事情只有两步：

1. 读取工作树的 diff
2. 对 diff 进行分析，输出审查报告

不会 touch 任何文件，不会执行任何命令。所以你不用担心执行 `/review` 之后代码被意外改动。在 `untrusted` 模式下，`/review` 也会自动通过（它是只读操作）。

---

## 3. /diff 查看具体改动

`/diff` 和 `/review` 是配合使用的两个命令。`/review` 给你审查结论，`/diff` 给你原始数据。

### 基本用法

在 Codex TUI 中输入：

```
/diff
```

Codex 会调用底层 Git，输出当前工作区中所有未提交的改动。输出格式和 `git diff` 一致：

```diff
diff --git a/src/lib/auth.ts b/src/lib/auth.ts
index 3a7f2b1..e9c4d82 100644
--- a/src/lib/auth.ts
+++ b/src/lib/auth.ts
@@ -42,7 +42,12 @@ export async function refreshToken(
   token: string
 ): Promise<TokenPair> {
   const payload = verify(token);
-  return generateTokenPair(payload.userId);
+  while (payload.refreshCount < MAX_REFRESH) {
+    const newPair = await generateTokenPair(payload.userId);
+    if (newPair.valid) return newPair;
+    payload.refreshCount++;
+  }
+  throw new AuthError('Token refresh exceeded maximum attempts');
 }
```

`/diff` 的一个重要特点：它包含 Git 未跟踪的新文件。如果你用 Codex 创建了一个新文件但还没 `git add`，`/diff` 会把它也展示出来。这是和原生 `git diff` 的区别——`git diff` 默认不显示未跟踪文件，你需要额外加 `--no-index` 或者 `git status` 才能看到。

### /diff 和 /review 的配合

实际使用中，`/diff` 和 `/review` 的典型配合流程是：

```
你: （让 Codex 修改了一些代码）

Codex: 修改完成。

你: /diff
（查看改了什么——这是原始数据层面的检查）

你: /review
（让 Codex 分析改动中是否有问题——这是逻辑层面的检查）
```

先 `/diff` 再 `/review`，还是先 `/review` 再 `/diff`？两种顺序都行，取决于你的习惯。

先 `/diff` 适合你对代码改动比较敏感、想先确认改动范围的情况。先 `/review` 适合你信任 Codex 的修改能力、想直接看审查结论的情况。

一个折中方案：

```
/diff
```

快速扫一眼 diff，确认改动范围和你预期一致（比如确认 Codex 只改了 auth 模块，没有顺手改别的文件）。然后：

```
/review 重点关注边界条件
```

让 Codex 做更深层的逻辑分析。

### 理解 diff 输出

如果你对 Git diff 的格式不熟悉，这里快速过一遍关键标记：

```diff
@@ -42,7 +42,12 @@ export async function refreshToken(
```

这行是 hunk header。`-42,7` 表示旧文件从第 42 行开始，共 7 行；`+42,12` 表示新文件从第 42 行开始，共 12 行。也就是说，原来 7 行代码变成了 12 行（净增 5 行）。

```diff
-  return generateTokenPair(payload.userId);
```

`-` 开头的行是被删除的旧代码。

```diff
+  while (payload.refreshCount < MAX_REFRESH) {
+    const newPair = await generateTokenPair(payload.userId);
+    if (newPair.valid) return newPair;
+    payload.refreshCount++;
+  }
+  throw new AuthError('Token refresh exceeded maximum attempts');
```

`+` 开头的行是新增的代码。

`-` 和 `+` 之间没有前缀的行是上下文行，用来定位修改位置。

### 在 TUI 中滚动

改动较多时，diff 输出可能很长。在 TUI 中可以用方向键和 Page Up/Page Down 滚动查看。看完按 `q` 回到输入框。

### 和原生 git diff 的区别

| 维度 | `/diff` | `git diff` |
|------|---------|------------|
| 运行位置 | Codex TUI 内部 | 终端 shell |
| 未跟踪文件 | 包含 | 默认不包含 |
| 退出后 | 回到 Codex 会话 | 回到 shell |
| 精细控制 | 不支持（显示全部） | 支持 `-- <path>` 等参数 |

如果你需要只看某个文件的 diff，可以在 Codex 里让它跑命令：

```
运行 git diff -- src/lib/auth.ts
```

或者开另一个终端窗口直接用 `git diff`。

---

## 4. 自动审查机制

Codex 的审批系统有一个进阶功能：自动审查（auto_review）。它的作用是把审批决策交给一个 AI 审查子代理，而不是让你手动确认。

### approvals_reviewer 配置

在 `~/.codex/config.toml` 中：

```toml
# 审批请求由谁处理
approvals_reviewer = "user"          # 默认，弹给你确认
approvals_reviewer = "auto_review"   # 由 AI 审查子代理处理
```

两种模式的区别：

**`approvals_reviewer = "user"`**（默认）

当 Codex 需要执行一个需要审批的操作时，审批请求弹到你的 TUI 界面，你按 Y 确认、按 N 拒绝。这就是你在第 05 篇里学的标准审批流程。

**`approvals_reviewer = "auto_review"`**

审批请求先经过一个 AI 审查子代理。这个子代理会评估操作的风险等级：

- 低风险操作（读文件、跑 lint）→ 自动通过
- 中风险操作（文件修改、安装依赖）→ 自动通过
- 高风险操作（删除文件、执行破坏性命令）→ 拒绝

你不需要手动确认任何操作。审查子代理替你做了判断。

### auto_review 工作原理

自动审查不是一个简单的规则匹配。Codex 启动一个独立的子代理来评估每个审批请求。这个子代理有自己的上下文，能看到：

- 操作的类型（读文件 / 写文件 / 执行命令）
- 操作的目标（哪个文件、什么命令）
- 操作的上下文（当前的对话历史、你之前确认过的类似操作）
- 安全策略（exec policy 规则、沙箱配置）

基于这些信息，子代理给出通过或拒绝的决策。

一个具体的例子。假设你在 `on-request` 模式下让 Codex 重构一个模块，Codex 想要执行 `npm install zod`：

```
approvals_reviewer = "user" 时的流程：

Codex: 我需要安装 zod 依赖
[审批提示] 执行命令: npm install zod
你: Y（手动确认）

approvals_reviewer = "auto_review" 时的流程：

Codex: 我需要安装 zod 依赖
（AI 审查子代理评估：npm install 是常规操作，zod 是知名验证库，风险低）
→ 自动通过
（你在 TUI 中看到一条记录："自动批准：npm install zod"）
```

子代理的速度很快，通常在 1-2 秒内做出决策。大多数情况下你感知不到延迟。

### 什么时候用 auto_review

auto_review 适合这些场景：

- **个人项目的日常开发**：你一个人开发，每次确认审批很烦，auto_review 能自动处理大部分安全操作
- **CI/CD 中的自动化**：`codex exec` 模式下没有人盯着，审批请求需要有东西处理
- **信任 Codex 但想留个记录**：auto_review 会记录每个通过/拒绝的决策，事后可以查看

auto_review 不适合这些场景：

- **团队协作的共享分支**：自动通过的操作可能影响其他人的工作
- **生产环境相关操作**：数据库迁移、配置变更这些操作不应该自动批准
- **你还在学习 Codex 的行为模式**：auto_review 省掉了你观察 Codex 操作的机会

### /approve 重试被拒绝的操作

当 `auto_review` 拒绝了一个操作，Codex 不会继续执行。它会在 TUI 中告诉你操作被拒绝了。

如果你想覆盖自动审查的决定，手动批准这个操作，使用 `/approve` 命令：

```
/approve
```

这会重试最近一次被拒绝的操作，但这次由你手动确认，而不是由自动审查子代理判断。

一个典型的场景：

```
Codex: 我需要删除 src/lib/legacy-auth.ts
（AI 审查子代理评估：删除文件属于高风险操作）
→ 自动拒绝

Codex: 删除 src/lib/legacy-auth.ts 被自动审查拒绝

你: /approve
[审批提示] 确认删除文件 src/lib/legacy-auth.ts
你: Y（手动确认）
```

`/approve` 只重试最近一次被拒绝的操作。如果你之前有多个被拒绝的操作，需要多次 `/approve`。

### 审查策略的完整配置

把审批策略和自动审查结合起来，有几种常见的配置方案：

**方案一：默认配置（适合大多数开发者）**

```toml
approval_policy = "on-request"
# approvals_reviewer 不设置，默认为 "user"
```

常规操作在沙箱内自动通过，突破沙箱的操作弹给你确认。最稳定的选择。

**方案二：个人项目的日常开发**

```toml
approval_policy = "on-request"
approvals_reviewer = "auto_review"
```

大部分审批请求由 AI 子代理处理，你只需要在操作被拒绝时用 `/approve` 手动覆盖。效率最高。

**方案三：精细控制**

```toml
approval_policy = { granular = {
  sandbox_approval = true,
  rules = true,
  mcp_elicitations = false,
  request_permissions = false,
  skill_approval = true
} }
approvals_reviewer = "auto_review"
```

`granular` 模式控制哪些类型的审批会弹出，`auto_review` 控制弹出的审批由谁处理。两层配合，精度最高。

**方案四：CI 环境**

```toml
approval_policy = "never"
# CI 中不需要审批，但沙箱仍然提供保护
```

`codex exec` 默认在只读沙箱中运行。CI 中如果需要 Codex 直接修改文件，要显式设置最小可用权限，例如 `--sandbox workspace-write`；不要依赖已废弃的 `--full-auto` 兼容参数。

---

## 5. 完整的代码审查工作流

理论讲完了，下面是三个具体的审查场景。每个场景对应不同的开发阶段和需求。

### 场景一：日常开发审查

**背景**：你让 Codex 给 UserService 添加了一个分页查询方法。Codex 改了三个文件：类型定义、业务逻辑、API 路由。

**审查流程**：

```
你: /diff
```

先看改动范围。确认三个文件的改动都和分页查询相关，没有附带改动。

```diff
diff --git a/src/types/user.ts b/src/types/user.ts
--- a/src/types/user.ts
+++ b/src/types/user.ts
@@ 新增 PaginatedResult 类型
+export interface PaginatedResult<T> {
+  items: T[];
+  total: number;
+  page: number;
+  pageSize: number;
+  hasNext: boolean;
+}

diff --git a/src/server/user.ts b/src/server/user.ts
--- a/src/server/user.ts
+++ b/src/server/user.ts
@@ 新增 paginateUsers 函数
+export async function paginateUsers(
+  page: number = 1,
+  pageSize: number = 20
+): Promise<PaginatedResult<User>> {
+  const offset = (page - 1) * pageSize;
+  const [items, count] = await Promise.all([
+    db.select().from(users).limit(pageSize).offset(offset),
+    db.select({ count: sql<number>`count(*)` }).from(users)
+  ]);
+  return {
+    items,
+    total: Number(count[0].count),
+    page,
+    pageSize,
+    hasNext: offset + pageSize < Number(count[0].count)
+  };
+}
```

快速扫了一眼 diff，改动符合预期。但有一个细节引起了你的注意：`page` 和 `pageSize` 参数没有下界校验。如果有人传 `page = -1` 或 `pageSize = 0`，SQL 查询会怎样？

```
你: /review 重点关注参数校验和边界条件
```

让 Codex 做更深入的分析。

Codex 的审查报告：

```
发现 2 个问题：

1. [中] paginateUsers 缺少参数校验
   - page 参数没有最小值校验，传负数会导致 offset 为负，SQL 行为不可预测
   - pageSize 没有上下界校验，传 0 会导致空结果，传超大值（如 1000000）
     可能导致内存问题
   建议：添加 Math.max(1, page) 和 Math.min(100, Math.max(1, pageSize))

2. [低] 缺失测试
   paginateUsers 是新函数，但 src/server/user.test.ts 中没有对应的测试
   建议覆盖：正常分页、超出范围的 page、pageSize 边界值、空结果集
```

第一个问题你刚才扫 diff 时就隐约感觉到了，Codex 帮你确认了。第二个问题你没想到——测试覆盖。

```
你: 修复这两个问题。给 paginateUsers 加参数校验，
    写测试覆盖边界条件，然后运行测试
```

修复完成，测试通过。再来一轮：

```
你: /review
```

确认问题已修复，没有新的问题引入。

```
你: /diff
```

最终确认改动正确。

```
你: 提交改动。commit message 用 "feat: add pagination to UserService"
```

整个审查流程大约花了 3 分钟。如果跳过审查直接提交，参数校验的 bug 很可能在后续被发现，到时候定位和修复的成本更高。

### 场景二：PR 前检查

**背景**：你在一个 feature 分支上工作了两天，准备提 PR。改动涉及 8 个文件，包括数据库 schema 变更。你想在提 PR 之前做一次全面审查。

**审查流程**：

```
你: /diff
```

8 个文件的 diff 输出很长，可能有 200 多行。在 TUI 中滚动浏览，确认改动范围。

```
你: /review 做一次全面的 PR 前审查。检查：
1. 逻辑正确性
2. 测试覆盖
3. 数据库迁移是否安全
4. 是否有遗漏的 import 或类型错误
```

Codex 的审查报告会比较长，可能覆盖 5-8 个问题。逐个过一遍：

```
Codex: 审查完成，发现以下问题：

1. [高] schema migration 缺少回滚脚本
   20240603_add_user_preferences.sql 只包含 UP 迁移，
   没有 DOWN 迁移。如果迁移失败，数据库会处于不一致状态。
   
2. [中] 新增的 UserPreferenceService 没有错误处理
   getPreferences 方法在数据库查询失败时直接抛出未处理的异常。
   
3. [低] types/preferences.ts 中的接口和 schema 定义不完全匹配
   schema 中 type 字段是 VARCHAR(50)，TypeScript 类型中是 string，
   但缺少运行时校验（zod schema 或类似的验证）。
```

针对每个问题决定处理方式：

- 问题 1：必须修。加上 DOWN 迁移脚本
- 问题 2：看情况。如果项目有全局错误处理中间件，这里不需要单独处理。需要你判断
- 问题 3：可以后续处理，不阻塞这次 PR

```
你: 修复问题 1 和 2。问题 3 记录为 TODO，下次迭代处理
```

修复后再审查一次：

```
你: /review
```

确认问题 1 和 2 已修复，没有引入新问题。

### 场景三：命令行批量审查

**背景**：你的同事提了一个 PR，你想用 Codex 快速审查一下改动。

**方法一：codex review 命令**

Codex CLI 提供了 `codex review`（别名 `codex r`）命令，可以在终端直接运行审查，不需要进入 TUI：

```bash
# 审查当前工作区的未提交改动
codex review --uncommitted

# 审查某个分支相对于 main 的改动
codex review --base main

# 审查特定的 commit
codex review --commit abc1234

# 审查并附加自定义审查指令
codex review --base main "重点关注数据库操作的 N+1 查询问题"
```

`codex review` 底层调用的是 `codex exec review`，属于非交互式执行模式。它会启动一个临时线程，运行审查，输出结果，然后退出。适合脚本化使用：

```bash
# 在 CI 中自动审查 PR
codex review --base main --output json > review-result.json
```

**方法二：管道审查**

你可以把 diff 管道传给 Codex：

```bash
git diff main...feature-branch | codex exec "审查这些改动，列出潜在问题"
```

这在审查别人的 PR 时很方便——你不需要 checkout 那个分支，直接把 diff 内容传给 Codex 分析。

**方法三：在 TUI 中审查外部 diff**

```bash
# 先获取 PR 的 diff
gh pr diff 123 > /tmp/pr-123.diff

# 然后在 Codex TUI 中
你: 读取 /tmp/pr-123.diff，审查这些改动
```

---

## 6. 审查策略最佳实践

### 审查时机

几个建议的审查时间点：

**改完一个逻辑单元后**：比如改完一个函数、加完一个 API 端点。不要攒着一起审查——改动越多，审查难度越高。

**准备 commit 之前**：commit 前的 `/review` + `/diff` 是最后一道关卡。确认没问题再提交。

**准备提 PR 之前**：做一次全面的 PR 前审查。这次审查可以更深入，覆盖跨文件的影响、测试覆盖、文档更新等。

**merge 前的最终确认**：如果 PR 有多个 commit，review 之前再 `/diff` 看一眼最终的改动全貌。

### 审查粒度

审查粒度取决于改动大小：

**小改动（1-2 个文件，<50 行 diff）**：直接 `/review` + `/diff`，一两分钟搞定。

**中等改动（3-5 个文件，50-200 行 diff）**：`/diff` 先确认范围，`/review` 带参数指定重点。5 分钟左右。

**大改动（5+ 个文件，200+ 行 diff）**：分文件审查。先让 Codex 按模块列出改动摘要，然后逐模块审查。

```
你: 列出这次改动涉及的所有文件，按模块分组

Codex: 改动文件：
  认证模块：src/lib/auth.ts, src/middleware/auth.ts, src/types/session.ts
  用户模块：src/server/user.ts, src/types/user.ts
  数据层：drizzle/migrations/20240603_xxx.sql, src/db/schema.ts

你: /review 先审查认证模块的改动
```

### 常见问题

**Codex 审查结果太泛**：有时候 Codex 的审查报告像是模板生成的，全是泛泛而谈。解决方法是给 `/review` 加更具体的参数：

```
# 不好——太宽泛
/review 审查一下

# 好——具体明确
/review 检查：1) 新增的 SQL 查询是否有 N+1 问题
    2) 错误处理是否会导致信息泄露
    3) 新增的类型定义和数据库 schema 是否一致
```

越具体的指令，越能得到有用的审查结果。

**审查结果有误报**：Codex 有时会报告一些不是问题的问题。比如它觉得某个变量命名不清晰，但实际上这个命名是项目已有的约定。遇到误报不用纠结，跳过就行。误报率大概在 20-30%，这是正常的。

**审查发现太多问题**：如果一次审查发现 10 个以上问题，说明改动范围太大或者改动质量不够好。考虑让 Codex 一次性修复，然后重新审查，而不是你手动逐个修。

**没有 diff 怎么审查**：如果工作区是干净的（所有改动都已提交），`/review` 和 `/diff` 都没有内容可展示。这种情况下你可以：

```bash
# 审查最近一次 commit
codex review --commit HEAD

# 或者审查最近 3 次 commit 的累计改动
codex review --base HEAD~3
```

---

## 7. 与 Git 的深度集成

Codex 的审查功能和 Git 之间有几个配置项值得了解。

### codex_git_commit 自动提交

如果你开启了自动提交功能，Codex 每完成一轮文件修改就会自动 commit。这在频繁修改的场景下很方便，但和审查工作流有冲突——如果你想在 commit 之前审查，自动提交会跳过这个环节。

```toml
[features]
codex_git_commit = true
```

开启自动提交后，建议的工作流是：

1. 让 Codex 修改代码
2. 自动 commit 发生
3. 你事后用 `codex review --commit HEAD` 审查最近的 commit
4. 如果发现问题，`git reset HEAD~1` 回退，修复后重新 commit

如果你更习惯在 commit 前审查，不要开自动提交。手动 commit 虽然多一步操作，但给了你审查的机会。

### commit_attribution 提交署名

自动提交的 commit 会带上一条署名信息，标明这个 commit 是由 AI 辅助生成的：

```toml
[features]
codex_git_commit = true
```

生成的 commit 大概长这样：

```
feat: add pagination to UserService

Co-authored-by: Codex <noreply@openai.com>
```

`Co-authored-by` trailer 让你在 `git log` 中一眼就能区分人工 commit 和 AI 辅助 commit。这在团队协作中特别有用——团队成员可以知道哪些 commit 经过了 AI 辅助，审查时可以更仔细地看。

如果你不想带署名，可以配置：

```toml
[features]
codex_git_commit = true

[codex_git_commit]
commit_attribution = "none"
```

### undo 与回滚

审查发现问题后，回滚的方式取决于改动是否已经 commit：

**未 commit 的改动**：

```bash
# 回滚所有改动
git checkout .

# 只回滚特定文件
git checkout -- src/lib/auth.ts
```

**已 commit 的改动**：

```bash
# 撤销最近一次 commit，保留改动在工作区
git reset HEAD~1

# 撤销最近一次 commit，同时丢弃改动
git reset --hard HEAD~1
```

**自动提交开启时的 undo**：

Codex 的 undo 功能回滚的是代码改动（文件系统状态），不会撤销自动生成的 commit。所以 undo 之后，你的文件恢复了，但 git log 里还有那个 commit。这种不一致需要你手动处理：

```bash
git reset HEAD~1
```

如果你打算开自动提交，对 `git reset` 命令要熟悉。本系列第 08 篇有更详细的 undo 和回滚机制说明。

---

## 下一步

本文覆盖了 Codex CLI 代码审查的完整工具链：`/review` 做逻辑分析，`/diff` 看原始改动，`auto_review` 自动处理审批，`codex review` 命令行批量审查。

代码审查不是一个孤立的操作——它嵌入在整个开发工作流中。一个好的习惯是：每次 Codex 改完代码，花 1-2 分钟 `/diff` + `/review`，这个小投入能避免后续很多问题。

相关内容可以继续看本系列的其他文章：

- **本系列第 05 篇**：[审批模式详解](./05-approval-modes.md) — `approval_policy` 的四种配置和审批流程
- **本系列第 08 篇**：[编辑流程与 diff 查看](./08-edit-code.md) — patch 机制、`/diff` 详细用法和回滚策略
- **本系列第 11 篇**：[上下文管理](./11-context-management.md) — `/compact`、`/status` 和长任务工作流

### 延伸阅读

- [Codex CLI Slash Commands 官方文档](https://developers.openai.com/codex/cli/slash-commands) — 所有内置斜杠命令的参考
- [Codex Config Reference 官方文档](https://developers.openai.com/codex/config-reference) — `review_model`、`approvals_reviewer` 等配置项
- [Codex Agent Approvals & Security 官方文档](https://developers.openai.com/codex/agent-approvals-security) — 审批策略和自动审查的安全机制
- [codex review 源码 — main.rs](https://github.com/openai/codex/blob/main/codex-rs/cli/src/main.rs) — `codex review` 子命令的实现
- [codex exec review — non-interactive mode](https://github.com/openai/codex/blob/main/codex-rs/exec/src/cli.rs) — `--uncommitted`、`--base`、`--commit` 参数
- [Codex CLI GitHub 仓库](https://github.com/openai/codex) — 完整开源代码

---

*本文基于 Codex CLI 源码（slash_command.rs、main.rs、cli.rs、lib.rs）和 2026 年 6 月的官方文档撰写。Codex 版本更新频繁，`/review` 的审查行为和 `auto_review` 的策略细节可能在未来版本中调整。*
