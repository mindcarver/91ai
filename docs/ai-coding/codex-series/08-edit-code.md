# 让 Codex 改你的代码：编辑流程、diff 查看、回滚与 git 集成

> **TL;DR** Codex 不是直接覆盖文件，而是生成精确的 patch（差异修改），一次操作可以同时改多个文件。改完用 `/diff` 查看改动全貌，不满意用 undo 或 git 回滚。配置 `codex_git_commit` 可以让它自动提交。本文从底层 patch 机制讲起，覆盖 diff 查看、回滚操作、自动提交、文件创建删除、多文件编辑策略，最后用三个实战场景收尾。

---

## 1. Codex 编辑代码的完整流程

当你在 Codex 里输入「把 `src/lib/auth.ts` 里的 `createSession` 函数的过期时间从 7 天改成 1 小时」时，背后发生了什么？

### 从指令到文件落盘的六步

整个过程可以拆成六个阶段：

**第一步：读取相关文件。** Codex 根据你的指令，调用内部的 `read_file` 工具读取目标文件。如果你在提示词里提到了多个文件，它会依次读取。如果没提到具体文件，它会根据目录结构和 AGENTS.md 的项目约定猜测需要读哪些文件。

**第二步：规划修改方案。** 模型在理解了文件内容之后，决定需要改哪些文件的哪些部分。这一步对用户不可见——Codex 不会把它的「思考过程」单独展示出来。但你可以在 TUI 的输出中看到它的推理摘要。

**第三步：生成 patch。** Codex 不是把整个文件重写一遍。它使用一套叫做 `apply_patch` 的内部协议，生成精确的差异描述。一个 patch 的结构长这样：

```diff
*** Begin Patch
*** Update File: src/lib/auth.ts
@@ export function createSession(userId: string) {
-  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
+  const expires = new Date(Date.now() + 1 * 3600 * 1000);
*** End Patch
```

这个 patch 只修改了两行代码。`-` 开头的行是被删除的旧代码，`+` 开头的行是新代码。周围的行（`@@` 之后的上下文）用来定位修改位置。

**第四步：等待审批（取决于审批模式）。** 如果你用的是 `untrusted` 模式，Codex 会在这个阶段停下来等你确认。如果你用的是默认的 `on-request` 模式且操作在沙箱范围内，patch 会直接应用。`full-auto` 模式下一切自动执行，不需要确认。

关于审批模式的详细说明，可以回顾本系列第 05 篇。

**第五步：应用 patch。** 确认（或自动通过）后，Codex 的 patch 引擎解析 patch 内容，在文件系统中执行修改。这一步是原子操作——要么全部成功，要么全部不执行。

**第六步：汇报结果。** Codex 在 TUI 中显示修改了哪些文件、改了什么。你会看到类似这样的输出：

```
Updated src/lib/auth.ts
  - 第 12 行: 过期时间从 7 天改为 1 小时
```

### Codex 不是直接覆盖文件

这一点值得强调。Codex 不是把整个文件读出来、改完再整个写回去。它生成的是 patch——一种精确的差异描述。

这样做有几个好处：

- **精确性**：只修改需要改的行。如果 Codex 把整个文件重写，可能会意外改变格式、缩进、注释等无关内容。patch 机制避免了这个问题。
- **可审查性**：patch 的格式和 `git diff` 类似，你可以清楚地看到「删了什么、加了什么」。
- **可回滚性**：因为修改是精确的差异，undo 操作只需要反向应用 patch 就能恢复原状。

### 多文件编辑

patch 机制天然支持多文件操作。一个 patch 可以包含多个文件段：

```diff
*** Begin Patch
*** Update File: src/lib/auth.ts
@@ export function createSession(userId: string) {
-  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
+  const expires = new Date(Date.now() + 1 * 3600 * 1000);
+  const refreshThreshold = new Date(expires.getTime() - 5 * 60 * 1000);
+  return { token, expires, refreshThreshold };
*** Update File: src/types/session.ts
@@ export interface Session {
   token: string;
   expires: Date;
+  refreshThreshold: Date;
*** End Patch
```

这个 patch 同时修改了两个文件。Codex 在处理复杂任务时经常会生成这样的多文件 patch。

### 编辑过程中你看到什么

在 TUI 中，Codex 的编辑过程会实时展示：

```
⠋ Reading src/lib/auth.ts...
  Reading src/types/session.ts...
  Generating patch...
  Applying patch...
✓ Updated src/lib/auth.ts (2 lines changed)
✓ Updated src/types/session.ts (1 line changed)
```

每个阶段都有对应的状态指示。如果 patch 应用失败（比如文件在你不知情时被其他进程修改了，导致上下文行不匹配），Codex 会报错并建议你检查文件状态。

---

## 2. `/diff` 查看改动

Codex 改完代码后，第一件事不是继续下一个任务，而是查看改动。`/diff` 命令就是干这个的。

### 基本用法

在 Codex TUI 的输入框中输入：

```
/diff
```

Codex 会调用底层 git 来展示当前工作区的所有未提交改动。输出格式和 `git diff` 一致：

```diff
diff --git a/src/lib/auth.ts b/src/lib/auth.ts
index 3a7f2b1..e9c4d82 100644
--- a/src/lib/auth.ts
+++ b/src/lib/auth.ts
@@ -10,7 +10,9 @@ export function createSession(userId: string) {
-  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
+  const expires = new Date(Date.now() + 1 * 3600 * 1000);
+  const refreshThreshold = new Date(expires.getTime() - 5 * 60 * 1000);
+  return { token, expires, refreshThreshold };
 }
```

### `/diff` 包含的内容

`/diff` 显示的是工作区中**所有未提交的改动**，包括：

- **已修改的已跟踪文件**：git 已知、内容有变化的文件
- **未跟踪的新文件**：Codex 新创建的、还没被 `git add` 过的文件
- **已暂存的改动**：通过 `git add` 暂存但还没 commit 的改动

这意味着 `/diff` 给你的是一个完整的改动全貌——不只是 Codex 刚才改的那几行，而是整个工作区从上次 commit 以来的所有变化。如果你在让 Codex 改代码之前自己手动改了几个文件，`/diff` 会把这些改动也一并展示。

### staged vs unstaged 的区分

`/diff` 主要展示 unstaged 的改动。如果你需要区分 staged 和 unstaged，有两个办法：

**方法一：在 Codex 里跑 git 命令。**

```
让 Codex 跑 git diff --staged 来看暂存区的改动
```

Codex 会执行这条命令，把输出展示给你。

**方法二：直接在终端看。**

另开一个终端窗口，执行：

```bash
git diff          # unstaged 改动
git diff --staged # staged 改动
```

### 在 TUI 中滚动查看 diff

如果改动较多，diff 输出可能很长。在 TUI 中你可以用以下按键浏览：

- **上下方向键**：逐行滚动
- **Page Up / Page Down**：翻页
- **j / k**：和 Vim 一样的逐行滚动（如果你的终端支持）
- **q**：退出 diff 查看，回到输入框

### `/diff` 和 `git diff` 的区别

`/diff` 底层调用的就是 `git diff`，但有几个差异：

| 维度 | `/diff` | `git diff` |
|------|---------|------------|
| 运行位置 | Codex TUI 内部 | 终端 shell |
| 输出展示 | TUI 内的滚动面板 | 终端标准输出 |
| 未跟踪文件 | 包含 | 需要加 `--no-index` 或额外参数 |
| 用途 | Codex 会话内快速查看 | 任何 git 工作流 |

`/diff` 的优势是不用离开 Codex 的会话。你在 TUI 里就能看到改动，看完直接继续下一条指令。如果你需要更精细的 diff 控制（比如只看某个文件的 diff、对比两个分支），直接在终端用 `git diff` 更灵活。

### 养成习惯：改完就 `/diff`

建议把 `/diff` 变成肌肉记忆。每次让 Codex 改完代码后，执行一下 `/diff`，确认改动符合预期。这比事后发现 Codex 改了不该改的文件再回滚要省事得多。

一个典型的检查流程：

```
你: 把 createSession 的过期时间从 7 天改成 1 小时

Codex: [修改完成]

你: /diff

[查看 diff，确认只改了 auth.ts 里的过期时间]

你: 看起来没问题。接下来……
```

---

## 3. 回滚操作

Codex 改了代码，你看了 diff，发现改得不对。怎么办？Codex 提供了两个层面的回滚机制。

### undo：回滚 Codex 的操作

Codex 有一个内置的 undo 功能。在 TUI 中，当 Codex 完成一次文件修改后，你可以在审批提示中选择撤销（如果你在审批模式下），或者使用 undo 相关的交互来回滚上一次操作。

undo 的行为取决于你使用的审批模式：

- **`untrusted` 模式**：每次操作前都有审批。你可以直接拒绝（按 N），文件不会被修改。
- **`on-request` 模式**：文件修改自动执行。如果改错了，你需要用 undo 或 git 回滚。

undo 回滚的是**单次 patch 操作**。如果 Codex 在一个 patch 里同时改了三个文件，undo 会把这三个文件全部恢复到修改前的状态。

### thread/rollback：回滚整个会话

Codex 的底层 API 提供了一个 `thread/rollback` 接口，可以回退会话中的最近 N 轮对话和对应的代码改动。这个功能在 Codex 的 SDK 和 API 模式下使用：

```python
# 回退最近 2 轮对话及其代码改动
result = await codex.thread_rollback(thread_id, n=2)
```

在 TUI 中，这个功能通过 undo 操作间接提供。你每 undo 一次，就回退一轮操作。

### git 作为终极回滚

不管 undo 功能多好用，git 永远是最可靠的回滚手段。原因很简单：undo 依赖 Codex 内部的状态追踪，如果 Codex 的会话出了问题（进程崩溃、上下文压缩导致状态丢失），undo 可能不可用。git 的版本控制是独立于 Codex 的。

几种常用的 git 回滚方式：

**回滚所有未提交的改动：**

```bash
git checkout .
```

这会把所有被 Codex 修改的文件恢复到最近一次 commit 的状态。干净利落。

**暂存改动，稍后恢复：**

```bash
git stash
```

如果你不确定要不要回滚，先用 `git stash` 把改动藏起来。确认不需要了，`git stash drop` 丢弃；如果发现还是要用，`git stash pop` 恢复。

**只回滚某个文件：**

```bash
git checkout -- src/lib/auth.ts
```

只恢复一个文件，其他文件的改动保留。

### 最佳实践：改代码前先 stage

一个简单但有效的习惯：在让 Codex 改代码之前，先执行 `git add .`。这样所有当前的文件状态都被记录在暂存区。

```
你: /diff
（确认当前工作区是干净的）

你: [开始给 Codex 下编辑指令]

（Codex 改完了）

你: /diff
（发现改错了）

你（在另一个终端）: git checkout .
（所有改动恢复到上一次 git add 的状态）
```

为什么用 `git add .` 而不是 commit？因为 `git add .` 只是把文件状态存入暂存区，不需要写 commit message。操作更快，适合这种「临时存档」的场景。如果改得对，你再 `git commit` 正式提交；如果改得不对，`git checkout .` 回滚到暂存区状态。

### undo 和 git 回滚的区别

| 维度 | Codex undo | git 回滚 |
|------|-----------|---------|
| 粒度 | 单次 patch 操作 | 按文件、按 commit |
| 依赖 | Codex 内部状态 | git 版本控制 |
| 可靠性 | 会话丢失则不可用 | 只要 git 仓库在就能用 |
| 速度 | 即时 | 即时 |
| 适用范围 | 只能回滚 Codex 的改动 | 回滚任何改动 |

建议的回滚策略：

1. 改动少、刚改完就发现不对 → 用 undo
2. 改动多、需要精确控制回滚范围 → 用 `git checkout -- <file>`
3. 改得一团糟、想全部重来 → 用 `git checkout .` 或 `git stash`

---

## 4. `codex_git_commit` 自动提交

Codex 提供了一个实验性功能：每次修改完代码后自动执行 `git commit`。这在某些工作流中能省不少事。

### 开启配置

在 `~/.codex/config.toml` 中添加：

```toml
[features]
codex_git_commit = true
```

开启后，Codex 每完成一轮文件修改，会自动把改动 commit 到当前分支。commit message 由 Codex 根据改动内容自动生成——它不是写一个通用的「update files」，而是分析 patch 内容，生成描述性的 message。

### commit 署名：`commit_attribution`

如果你关心 commit 的作者信息，可以通过 `commit_attribution` 配置控制：

```toml
[features]
codex_git_commit = true

[codex_git_commit]
commit_attribution = "codex"
```

Codex 自动提交的 commit 会带有 `Co-authored-by` trailer，标明这个 commit 是由 AI 协助完成的：

```
feat: reduce session expiry to 1 hour with auto-refresh

Co-authored-by: Codex <codex@openai.com>
```

这在你需要区分「人工写的代码」和「AI 辅助的代码」时很有用。有些团队规范要求 AI 辅助的 commit 必须标注来源，`commit_attribution` 就是满足这种需求的设计。

### 什么时候适合开

- **个人项目、实验性项目**：你一个人开发，commit 历史不需要给其他人看。自动提交省去了手动 commit 的步骤。
- **频繁的小改动**：如果你和 Codex 的交互模式是「下一小条指令 → 改一点代码 → 下一条指令」，自动提交能给每一步改动留下记录。
- **CI/CD 需要触发**：你的部署流程依赖 git commit 触发。自动提交让 Codex 的改动自动进入流水线。

### 什么时候不适合开

- **团队协作项目**：自动提交会往共享分支上推未经 review 的 commit。即使是 AI 生成的，也应该经过人工审查后才提交。
- **需要精细的 commit 粒度**：你可能希望把几个相关的改动合并成一个 commit，而不是每改一个文件就 commit 一次。
- **commit 历史有规范要求**：如果你的团队要求 conventional commits（`feat:`、`fix:`、`chore:` 等），AI 自动生成的 message 可能不完全符合规范。

### 搭配 undo 使用

一个容易忽略的问题：如果你开启了自动提交，undo 回滚的时候会怎样？

答案是 undo 会回滚代码改动，但不会撤销自动生成的 commit。undo 只影响文件系统的状态，不操作 git 历史。所以如果你 undo 了一次自动提交的改动，你的工作区文件恢复了，但 git log 里还留着那个 commit。

这种情况下，你需要手动处理：

```bash
# 撤销最近一次 commit，但保留文件改动
git reset HEAD~1

# 或者撤销最近一次 commit，同时丢弃文件改动
git reset --hard HEAD~1
```

如果你打算开自动提交，建议对 git 的 `reset` 命令熟悉一些。

---

## 5. 文件创建和删除

Codex 不只是修改已有文件。通过 `apply_patch` 协议的三种操作类型，它能创建新文件、删除文件、重命名文件。

### 创建新文件

patch 中的 `*** Add File:` 操作用于创建新文件：

```diff
*** Begin Patch
*** Add File: src/lib/session-refresh.ts
+export function shouldRefreshToken(expiresAt: Date): boolean {
+  const now = new Date();
+  const fiveMinutes = 5 * 60 * 1000;
+  return now.getTime() + fiveMinutes >= expiresAt.getTime();
+}
+
+export function refreshSession(token: string): Promise<Session> {
+  return fetch('/api/auth/refresh', {
+    method: 'POST',
+    headers: { Authorization: `Bearer ${token}` },
+  }).then(res => res.json());
+}
*** End Patch
```

注意新文件的每一行都用 `+` 前缀标记。这和修改文件时新增行的标记方式一致。

**审批行为**：在 `untrusted` 模式下，创建新文件需要你确认。在 `on-request` 模式下，如果新文件在 workspace 范围内，会自动通过。Codex 不会在 workspace 外创建文件——这是沙箱层面的硬限制。

### 删除文件

`*** Delete File:` 操作用于删除文件：

```diff
*** Begin Patch
*** Delete File: src/lib/deprecated-auth.ts
*** End Patch
```

删除操作不需要指定文件内容——因为文件要被整个删除。

**风险和审批**：删除文件是一个风险较高的操作。即使在 `on-request` 模式下，有些版本/配置的 Codex 也会在删除文件时弹出确认提示。如果你发现 Codex 要删一个你认为不该删的文件，拒绝这次操作，然后用 `/diff` 检查它还想做什么。

### 重命名和移动文件

`*** Update File:` 操作可以搭配 `*** Move to:` 来实现重命名：

```diff
*** Begin Patch
*** Update File: src/lib/old-auth.ts
*** Move to: src/lib/auth-utils.ts
@@ export function createSession(userId: string) {
-  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
+  const expires = new Date(Date.now() + 1 * 3600 * 1000);
*** End Patch
```

这个 patch 做了两件事：把 `src/lib/old-auth.ts` 重命名为 `src/lib/auth-utils.ts`，同时修改了其中的代码。

重命名文件后，项目中其他文件对这个旧文件名的 import 不会自动更新。你需要让 Codex 单独处理 import 路径的修改。一个更好的做法是在一条指令中同时要求重命名和更新引用：

```
把 src/lib/old-auth.ts 重命名为 src/lib/auth-utils.ts，
并更新所有引用这个文件路径的 import 语句
```

这样 Codex 会在一个 patch 里同时处理重命名和 import 更新。

### 混合操作

一个 patch 可以同时包含创建、修改、删除多种操作：

```diff
*** Begin Patch
*** Add File: src/lib/session-refresh.ts
+export function shouldRefreshToken(expiresAt: Date): boolean {
+  // ...
+}
*** Update File: src/lib/auth.ts
@@ export function createSession(userId: string) {
-  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
+  const expires = new Date(Date.now() + 1 * 3600 * 1000);
*** Delete File: src/lib/deprecated-session.ts
*** End Patch
```

这种多操作 patch 在重构场景中很常见——删掉旧的实现、创建新的模块、修改引用。

---

## 6. 多文件编辑的策略

Codex 修改代码时，一次操作涉及多少文件，取决于任务的复杂度和你的指令精确度。

### Codex 自动判断改哪些文件

当你给 Codex 一个任务时，它会根据项目结构、AGENTS.md 中的约定和已有文件的依赖关系，自己判断需要改哪些文件。

比如你说「给 UserService 加一个分页查询方法」，Codex 不只改 `UserService.ts`。它可能还会改：

- `UserService.ts`：添加 `paginate` 方法
- `types/user.ts`：添加 `PaginatedResponse` 类型
- `routers/user.ts`：添加 tRPC 路由暴露新方法

这个判断是自动的。Codex 读了项目结构之后，知道哪些文件之间有依赖关系，然后在 patch 中一次性改完。

### 一次改一个 vs 一次改多个

两种策略各有适用场景：

**一次改一个文件**适合以下情况：

- 改动范围小且确定。比如只改一个函数的实现
- 你想在每一步都精确审查改动
- 你不确定 Codex 是否理解了任务，想先让它改一个文件看效果

操作方式：

```
只修改 src/lib/auth.ts 里的 createSession 函数，
把过期时间从 7 天改成 1 小时。不要改其他文件。
```

关键词是「只修改」和「不要改其他文件」。这些约束让 Codex 把 patch 限制在一个文件内。

**一次改多个文件**适合以下情况：

- 任务涉及跨文件的逻辑变更
- 你信任 Codex 对项目结构的理解
- 改动之间有强依赖（比如改了类型定义，必须同时改使用方）

操作方式：

```
给 UserService 添加分页查询方法，
同时更新类型定义和 tRPC 路由
```

不限制文件范围，让 Codex 自行决定改哪些文件。

### 约束修改范围

不约束修改范围，Codex 可能会改一些你没想到的文件。比如你说「优化 auth 模块」，Codex 可能在改完 `auth.ts` 之后，觉得 `auth.test.ts` 也需要同步更新，于是也改了测试文件。

如果你只关心生产代码的改动，可以明确约束：

```
重构 auth 模块的 token 刷新逻辑。
只改 src/lib/ 目录下的文件，不要动 src/app/ 和 src/components/。
```

或者更精确：

```
修改 src/lib/auth.ts 中的 createSession 函数签名。
如果需要更新其他文件来适配新签名，只改 src/server/ 目录下的文件。
```

### 分步进行大规模重构

如果一次重构涉及 10 个以上文件，建议分步进行。不是让 Codex 一次改完——那样生成的 patch 可能包含几十个 hunk，diff 很难审查。

拆成小步骤：

```
第一步：创建新的类型定义文件 src/types/pagination.ts
第二步：修改 src/lib/auth.ts 使用新类型
第三步：更新 src/server/auth.ts 的业务逻辑
第四步：更新 src/trpc/routers/auth.ts 的 API 路由
```

每一步完成后 `/diff` 检查，确认没问题再进行下一步。虽然步骤多了，但每一步的风险更低，出问题也更容易定位。

---

## 7. 实战：三个编辑场景

理论讲了够多，来看三个具体的编辑场景。每个场景对应不同复杂度的文件改动。

### 场景一：修改一个函数的签名（单文件改动）

**任务**：把 `src/lib/auth.ts` 中 `createSession` 函数的第二个参数从 `options?: SessionOptions` 改成 `expiryMinutes: number`。

**你的指令**：

```
修改 src/lib/auth.ts 中 createSession 函数的签名。
把第二个参数从 options?: SessionOptions 改成 expiryMinutes: number。
函数内部用 expiryMinutes 计算过期时间。只改这一个文件。
```

**Codex 的执行过程**：

1. 读取 `src/lib/auth.ts`
2. 找到 `createSession` 函数
3. 生成 patch

```diff
*** Begin Patch
*** Update File: src/lib/auth.ts
@@ export function createSession(
@@   userId: string,
-@@   options?: SessionOptions
+@@   expiryMinutes: number
@@ ) {
-  const expiry = options?.expiry ?? 7 * 24 * 60;
+  const expiry = expiryMinutes;
   const expires = new Date(Date.now() + expiry * 60 * 1000);
   // ...
*** End Patch
```

**你的检查**：

```
/diff
```

确认只改了 `src/lib/auth.ts`，改动内容是参数签名和内部使用方式。符合预期。

**关键点**：指令中明确了「只改这一个文件」。没有这个约束，Codex 可能会去改所有调用 `createSession` 的地方。在这个场景下你可能正想自己手动改调用方，所以限制修改范围是有意义的。

### 场景二：添加一个新 API 端点（多文件改动）

**任务**：添加一个 `POST /api/users/:id/deactivate` 端点，用于停用用户账户。需要同时改路由定义、业务逻辑和类型。

**你的指令**：

```
添加一个停用用户的 API 端点。

具体要求：
1. 在 src/trpc/routers/user.ts 添加 deactivate mutation
2. 在 src/server/user.ts 添加 deactivateUser 业务逻辑函数
3. 在 src/types/user.ts 添加 DeactivateResult 类型

停用用户的逻辑：把用户的 status 设为 inactive，
记录 deactivatedAt 时间戳，清除该用户的活跃 session。
```

**Codex 的执行过程**：

1. 依次读取三个文件
2. 同时读取相关的 schema 文件（Codex 自行判断需要看 user 表结构）
3. 生成多文件 patch

```diff
*** Begin Patch
*** Update File: src/types/user.ts
@@ export interface User {
@@   id: string;
@@   name: string;
@@   status: 'active' | 'inactive';
+@@  deactivatedAt: Date | null;
@@ }
+
+@@ export interface DeactivateResult {
+@@   success: boolean;
+@@   deactivatedAt: Date;
+@@ }

*** Update File: src/server/user.ts
@@ import { db } from '@/db';
@@ import { users, sessions } from '@/db/schema';
+@@ import type { DeactivateResult } from '@/types/user';
+
+@@ export async function deactivateUser(
+@@   userId: string
+@@ ): Promise<DeactivateResult> {
+@@   const now = new Date();
+@@   await db
+@@     .update(users)
+@@     .set({ status: 'inactive', deactivatedAt: now })
+@@     .where(eq(users.id, userId));
+@@   await db
+@@     .delete(sessions)
+@@     .where(eq(sessions.userId, userId));
+@@   return { success: true, deactivatedAt: now };
+@@ }

*** Update File: src/trpc/routers/user.ts
@@ import { deactivateUser } from '@/server/user';
+
+@@ deactivate: protectedProcedure
+@@   .input(z.object({ userId: z.string().uuid() }))
+@@   .mutation(async ({ input }) => {
+@@     return deactivateUser(input.userId);
+@@   }),
*** End Patch
```

**你的检查**：

```
/diff
```

确认三个文件都被正确修改，类型定义、业务逻辑、API 路由三层的改动互相匹配。

**关键点**：指令中列出了需要改的三个文件，并描述了每层各自负责什么。这种清晰的分文件描述让 Codex 不会遗漏任何一层。如果你只说「添加一个停用用户的 API」，Codex 可能只改了路由文件，忘了加业务逻辑和类型定义。

### 场景三：重构一个模块（大量文件改动，分步进行）

**任务**：把 `src/lib/` 目录下散落的认证相关函数（`createSession`、`validateToken`、`refreshToken`、`revokeSession`）统一迁移到一个新的 `src/lib/session/` 模块中，每个函数一个文件。

**分步指令**：

```
第一步：创建新模块的文件结构。
创建以下文件：
- src/lib/session/index.ts（导出所有函数）
- src/lib/session/create.ts（createSession）
- src/lib/session/validate.ts（validateToken）
- src/lib/session/refresh.ts（refreshToken）
- src/lib/session/revoke.ts（revokeSession）

内容直接从 src/lib/auth.ts 中对应的函数搬过去。
不要删除 src/lib/auth.ts，先保留原文件。
```

Codex 创建五个新文件，每个文件包含对应的函数。

```
第二步：/diff
```

确认新文件创建正确，函数签名和实现没有丢失。

```
第三步：更新所有 import 引用。
查找项目中所有 import { createSession } from '@/lib/auth' 
和类似的 import 语句，改为从 '@/lib/session' 导入。
只改 import 语句，不要改其他代码。
```

Codex 搜索项目中所有引用旧路径的文件，批量更新 import。

```
第四步：/diff
```

确认所有 import 都指向了新路径，没有遗漏。

```
第五步：运行测试确认没有破坏功能。

运行 bun test
```

测试通过后，删除旧文件：

```
第六步：现在可以删除 src/lib/auth.ts 了。
```

**关键点**：这种大规模重构拆成了六步。每一步的改动范围可控，每一步都能用 `/diff` 检查。如果第三步改 import 时出了问题，你可以 undo 或 `git checkout .` 回到第二步的状态，重新来。比一口气让 Codex 改 20 个文件安全得多。

---

## 8. 常见问题

### Codex 改错了怎么办

改错了分两种情况：

- **刚改完就发现了**：用 undo 回滚，或者在审批时直接拒绝
- **改完之后过了一会儿才发现**：用 git 回滚。`git checkout .` 恢复所有改动，或 `git checkout -- <file>` 只恢复特定文件

越早发现越好。这就是为什么建议每次改完都 `/diff` 检查。

### 改了不该改的文件

Codex 有时候会「顺手」改一些你没打算让它动的文件。比如你让它修一个 bug，它改完业务代码后又顺手跑了一下 formatter，把整个文件的格式都调了——diff 里全是格式变更，真正的逻辑改动被淹没了。

解决方案：

- **预防**：在 AGENTS.md 中写清楚哪些文件不要动
- **约束指令**：明确说「只改 src/lib/auth.ts」
- **事后处理**：`git checkout -- <不该改的文件>` 单独恢复

### 改动太大看不过来

如果 Codex 一次改了太多东西，diff 输出几百行，逐行审查不现实。

应对方式：

- **分步执行**：不要一次给太大任务，拆成小步
- **分段查看**：用 `git diff -- src/lib/` 只看某个目录的改动
- **重新来过**：`git checkout .` 丢弃所有改动，重新用更精确的指令来一次

### 多人协作时的冲突

Codex 修改文件和你的同事修改文件没有本质区别——都是对文件做改动，都通过 git 管理。如果 Codex 改了一个文件，你的同事也改了同一个文件，合并时会产生标准的 git 冲突。

处理方式和处理普通冲突一样：`git pull`（或 `git merge`/`git rebase`），解决冲突，然后提交。不需要特殊的 Codex 相关操作。

一个建议：如果团队中有人频繁使用 Codex，让 Codex 在独立分支上工作，避免直接在共享的开发分支上自动修改代码。

---

## 9. 下一步

本文覆盖了 Codex 修改代码的完整生命周期：从底层 patch 机制到 `/diff` 查看改动，从 undo 回滚到 git 集成，从单文件修改到多文件重构策略。

Codex 能改文件，也能跑命令。下一篇将进入 Codex 的命令执行领域——从跑测试、启动开发服务器到执行构建脚本，带你了解 Codex 在终端里能做什么、不能做什么，以及如何安全地利用它的命令执行能力。

**下一篇**：[让 Codex 跑命令：沙箱、权限和命令执行安全](./09-run-commands.md)（即将发布）

### 延伸阅读

- [Codex CLI apply_patch 协议 — GitHub 源码](https://github.com/openai/codex/blob/main/codex-rs/prompts/templates/apply_patch_tool_instructions.md) — patch 格式的完整语法定义
- [Codex CLI Slash Commands — GitHub 源码](https://github.com/openai/codex/blob/main/codex-rs/tui/src/slash_command.rs) — 所有内置斜杠命令的定义，包括 `/diff`
- [Codex thread/rollback API — GitHub 源码](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) — 会话回滚的 API 文档
- [Codex CLI GitHub 仓库](https://github.com/openai/codex) — 开源代码，可以看 apply_patch 引擎的实现
- [本系列第 05 篇：审批模式详解](./05-approval-modes.md) — 三种审批策略和它们对文件编辑的影响

---

*本文基于 Codex CLI 官方文档、源码和 2026 年 6 月的最新版本撰写。Codex 更新频繁，部分功能细节（特别是 undo 和自动提交相关配置）可能在未来版本中调整。*
