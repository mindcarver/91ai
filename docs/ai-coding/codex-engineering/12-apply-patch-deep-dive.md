# apply_patch 深度解析：diff 格式、CFG 语法和常见失败

**TL;DR：** apply_patch 是 OpenAI Codex 的核心文件编辑工具，基于 Responses API 的内置工具格式实现，使用 CFG（Context-Free Grammar）定义 diff 语法。模型在 apply_patch 格式上经过专门训练，正确率显著高于全文重写和其他编辑格式。本文从 diff 格式结构、CFG 语法规则、匹配机制、常见失败原因及处理策略五个维度，完整解析 apply_patch 的工作原理，并与全文重写、sed/awk 命令、Claude Code 的 Edit 工具进行横向对比。

## 为什么 Codex 选择 patch 而非全文重写

在 AI 代码编辑领域，编辑工具的选择直接决定了系统的精确度、效率和可审计性。Codex 选择 apply_patch 作为核心编辑工具，而非让模型重写整个文件，这个设计决策背后有四个工程考量。

**精确性。** patch 格式只描述文件的变更部分，通过上下文行（context lines）精确定位修改位置。模型只需要关注"改什么"和"在哪里改"，而不是"整个文件长什么样"。这大幅降低了模型输出错误信息的概率。一个修改单行代码的操作，patch 只需要 3-5 行输出，全文重写可能需要输出几百行。

**效率。** patch 格式的 token 消耗与变更规模成正比，而非与文件大小成正比。一个 2000 行文件里改 3 行，patch 的输出大约 10-15 行，全文重写的输出是 2000 行。在大规模代码修改场景下，这个差距直接决定了任务能否在上下文窗口内完成。Codex 的上下文窗口是有限资源，每一次工具调用的输入输出都占用 token 额度。用 patch 格式编辑文件，单次调用的 token 消耗可以比全文重写低一到两个数量级。

**可审计性。** patch 格式天然产生结构化的变更记录。每一条删除行以 `-` 开头，每一条新增行以 `+` 开头，上下文行作为位置锚点。审查者可以逐行确认模型做了什么修改，不需要对比两个完整的文件内容。这在代码审查、安全审计和问题追溯场景中至关重要。全文重写的输出是一个完整文件，审查者需要用 diff 工具才能看到变更，而且 diff 工具的输出可能因为格式化差异、import 重排序等噪声而难以阅读。

**幂等性风险控制。** 全文重写有一个隐含的工程风险：模型可能会在重写过程中"顺手"修改文件的其他部分——调整代码风格、重命名变量、添加注释。这些未授权的修改混在大量输出中，很难被人工发现。patch 格式限制了模型的操作范围：模型只能显式声明要删除和添加的行，不能悄悄修改其他内容。

## apply_patch 的定位：Responses API 内置工具

apply_patch 不是 Codex harness 自己实现的文本处理逻辑，而是 OpenAI Responses API 层面的内置工具。这意味着 patch 的生成和应用有两个关键特征。

第一，patch 的生成发生在模型推理阶段。模型在生成工具调用时，直接输出符合 CFG 语法的 patch 文本。这不是后处理步骤，而是模型输出的一部分。模型在训练数据中见过大量的 diff 和 patch 格式文本，对这种格式的掌握程度远高于自由格式的代码输出。

第二，patch 的应用发生在 harness 执行阶段。harness 接收模型输出的 patch 文本，根据 CFG 语法解析出文件路径、上下文行、删除行和新增行，然后在文件系统中执行匹配和替换。harness 的 patch 应用逻辑是确定性的——相同的 patch 和相同的文件，永远产生相同的输出。

这个两层架构的设计意味着：模型的职责是生成正确的 patch 文本，harness 的职责是正确地应用 patch。当 apply_patch 失败时，需要区分是模型生成了格式错误的 patch，还是 harness 无法在目标文件中找到匹配位置。前者是模型问题，后者通常是上下文行匹配问题。

## diff 格式详解

apply_patch 使用一种基于 unified diff 的自定义格式。以下是完整的格式结构：

```text
*** Begin Patch
*** Update File: src/auth/login.ts
@@ class AuthService @@
 export class AuthService {
   private tokenCache: Map<string, Token>;
 
-  constructor(private config: AuthConfig) {
+  constructor(private config: AuthConfig, private cacheTTL: number = 3600) {
     this.tokenCache = new Map();
+    this.startCacheCleanup();
   }
 
-  async getToken(userId: string): Promise<Token> {
+  async getToken(userId: string, forceRefresh: boolean = false): Promise<Token> {
     const cached = this.tokenCache.get(userId);
-    if (cached && !this.isExpired(cached)) {
+    if (!forceRefresh && cached && !this.isExpired(cached)) {
       return cached;
     }
*** End Patch
```

### 格式的三个层次

整个 patch 格式分为三个层次：patch 层、chunk 层和 hunk 层。

**Patch 层。** 一个完整的 patch 以 `*** Begin Patch` 开始，以 `*** End Patch` 结束。中间包含一个或多个 chunk。每个 chunk 描述对一个文件的一种操作。

```text
*** Begin Patch
[chunk_1]
[chunk_2]
...
[chunk_n]
*** End Patch
```

**Chunk 层。** 每个 chunk 以文件操作声明开头，后跟一个或多个 hunk。文件操作声明有三种类型：

```text
*** Update File: path/to/existing/file.ts    # 更新已有文件
*** Add File: path/to/new/file.ts            # 创建新文件
*** Delete File: path/to/obsolete/file.ts    # 删除文件
```

Update File 后面跟的是 hunk 列表。Add File 后面直接是新文件的完整内容（不需要 hunk）。Delete File 后面不需要任何内容。

**Hunk 层。** Hunk 是最小的编辑单元，描述文件中一个连续区域的变更。每个 hunk 由三部分组成：位置标记、上下文行和变更行。

位置标记的格式是 `@@ [定位信息] @@`。定位信息用于帮助 harness 找到 hunk 应用的位置。在实际实现中，定位信息可以是函数名、类名或其他结构性标识符，也可以是行号。但 apply_patch 的核心匹配机制依赖上下文行，而非位置标记。位置标记更多是给模型和人类阅读者的提示，而非匹配的严格依据。

上下文行（context lines）是 hunk 中不以 `-` 或 `+` 开头的行。它们在修改前后都存在于文件中，用于精确定位变更位置。harness 在目标文件中搜索与上下文行完全匹配的区域，然后在该位置应用删除和添加操作。

变更行有两种：以 `-` 开头的行表示删除，以 `+` 开头的行表示添加。删除行必须在文件中找到精确匹配，添加行则直接插入到对应位置。

### 一个完整的三文件修改示例

以下示例展示了 apply_patch 在一次调用中修改三个文件的完整格式：

```text
*** Begin Patch
*** Update File: src/config/database.ts
@@ connection pool @@
   private pool: ConnectionPool;
 
-  maxConnections: 10,
+  maxConnections: 50,
   idleTimeout: 30000,
*** Update File: src/models/user.ts
@@ interface User @@
 export interface User {
   id: string;
   name: string;
-  email: string;
+  email: string;
+  avatar?: string;
+  bio?: string;
   createdAt: Date;
 }
*** Add File: src/utils/avatar.ts
import { User } from '../models/user';

export function getAvatarUrl(user: User): string {
  if (user.avatar) {
    return user.avatar;
  }
  return `https://api.dicebear.com/7.x/initials/svg?name=${user.name}`;
}
*** End Patch
```

这个 patch 包含三个 chunk：更新 database.ts 的连接池配置、扩展 User 接口的字段、新建 avatar 工具函数。一次工具调用完成三个文件的变更，减少了 Agent Loop 的迭代次数。

## CFG 语法规则

apply_patch 的格式由一个 CFG（Context-Free Grammar）定义。理解这个语法有助于理解 patch 的合法性约束和解析过程。以下是简化版的语法规则：

```text
patch         → "*** Begin Patch" chunk* "*** End Patch"

chunk         → update_chunk | add_chunk | delete_chunk

update_chunk  → "*** Update File:" FILEPATH hunk+
add_chunk     → "*** Add File:" FILEPATH LINE*
delete_chunk  → "*** Delete File:" FILEPATH

hunk          → "@@" LOCATOR? "@@" hunk_body

hunk_body     → context_line* (removal_line+ addition_line*)+ context_line*

context_line  → LINE              （不以 - 或 + 开头）
removal_line  → "-" LINE
addition_line → "+" LINE

LINE          → 任意非空行文本
FILEPATH      → 文件路径字符串
LOCATOR       → 定位信息字符串
```

### 语法的关键约束

从 CFG 规则可以推导出几个关键的合法性约束：

**Chunk 必须有类型声明。** 每个 chunk 必须以 `*** Update File:`、`*** Add File:` 或 `*** Delete File:` 开头。模型不能省略这个声明，也不能发明新的声明类型。如果模型输出了 `*** Modify File:`，harness 会报语法错误。

**Update chunk 必须包含至少一个 hunk。** 更新文件的操作不能是空的——必须声明至少一处变更。一个没有任何 hunk 的 update chunk 在语法上不合法。

**Hunk 的变更行必须成组出现。** 在 hunk body 中，删除行和添加行按组排列：先是一组删除行（可能为空），然后是一组添加行（可能为空），再接上下文行。这个排列不能交叉——你不能在删除行和添加行之间插入上下文行。

```text
# 合法的 hunk body
  context line
- removed line
+ added line
  context line
- removed line
+ added line
+ another added line
  context line

# 不合法的 hunk body（上下文行插入在变更组中间）
  context line
- removed line
  context line        ← 错误：上下文行打断了变更组
+ added line
```

**Add chunk 不包含 hunk。** 新建文件的 chunk 直接写文件内容，不使用 hunk 结构。因为文件不存在，没有"上下文"可以匹配，也不需要定位。

**Delete chunk 不包含任何内容。** 删除文件的 chunk 只需要文件路径声明，不需要指定删除哪些行——整个文件被删除。

### 上下文行的匹配机制

CFG 规则中的 context_line 不只是一个格式约定，它是 apply_patch 匹配机制的核心。harness 在目标文件中搜索与上下文行完全匹配的位置，然后在该位置应用变更。

匹配过程的工作方式如下：

1. 提取 hunk 中所有上下文行和删除行的原始文本（去掉前导的空格或 `-`）
2. 在目标文件中搜索连续匹配这些行的位置
3. 如果找到精确匹配，在该位置执行删除和添加操作
4. 如果找到多个匹配（歧义），取第一个匹配位置
5. 如果没有找到匹配，返回错误

上下文行的数量直接决定匹配的精确度。上下文行越多，匹配越精确，失败的概率越低。反之，上下文行太少，容易出现歧义匹配或错误匹配。

```text
# 上下文行不足导致歧义的情况
# 目标文件中有三个 return null;
  if (!user) {
    return null;      ← 第 23 行
  }
  ...
  if (!session) {
    return null;      ← 第 45 行
  }
  ...
  if (!token) {
    return null;      ← 第 78 行
  }

# 如果 patch 只提供了：
  return null;
- return null;
+ throw new AuthError("invalid token");

# harness 无法确定要修改哪个 return null; → 匹配失败或错误匹配

# 充足的上下文行：
  if (!token) {
-   return null;
+   throw new AuthError("invalid token");
  }

# harness 可以精确定位到第 78 行的 return null;
```

## 匹配失败的四大原因

apply_patch 的匹配失败是 Codex 日常使用中最高频的工具错误之一。理解失败原因有助于编写更健壮的 prompt 和更有效地诊断问题。

### 原因一：上下文行不足导致匹配歧义

这是最常见的失败原因。当文件中存在重复代码段时，不足的上下文行会导致 harness 无法确定修改位置。

典型场景：文件中有多个结构相似的代码块（如多个 catch 块中相同的错误处理、多个 switch case 中相似的逻辑、多个测试用例中重复的 setup 代码）。

```text
# 文件中的重复结构
describe("AuthService", () => {
  describe("login", () => {
    it("should handle invalid credentials", async () => {
      const result = await service.login("bad", "creds");
      expect(result.success).toBe(false);       ← 重复模式
    });
  });

  describe("logout", () => {
    it("should handle invalid session", async () => {
      const result = await service.logout("bad-session");
      expect(result.success).toBe(false);       ← 完全相同的行
    });
  });
});

# 如果 patch 只用 expect(result.success).toBe(false); 作为上下文
# harness 无法区分是 login 测试还是 logout 测试中的那一行
```

**解决方法：** 模型在生成 patch 时应该包含足够的上下文行，确保 hunk 中的上下文行在目标文件中只出现一次。一般原则是：上下文行至少应该包含 hunk 前后各 2-3 行，并且这些行组合起来在文件中是唯一的。

### 原因二：文件已被修改导致 patch 基于过期内容

Codex 的 Agent Loop 是迭代的。在一次任务中，模型可能多次修改同一个文件。如果模型在第 1 轮修改了文件，第 3 轮的 patch 仍然基于第 1 轮修改前的文件内容，匹配就会失败。

这种失败在以下场景中特别常见：

- 模型在一次工具调用中修改了文件，但没有在后续的 patch 中反映这个修改
- 模型的上下文窗口中保留了旧版本的文件内容，而实际文件已经被其他操作修改
- 并发场景下，多个 agent 线程同时修改同一个文件

```text
# 第 1 轮 patch 修改了 import 区域
*** Update File: src/app.ts
@@ imports @@
+import { Logger } from './utils/logger';
 import { Config } from './config';

# 第 2 轮 patch 仍然使用旧的 import 区域作为上下文
*** Update File: src/app.ts
@@ imports @@
 import { Config } from './config';
+import { Database } from './database';

# 第 2 轮失败：因为第 1 轮已经在 import { Config } 前面插入了 import { Logger }
# 实际文件现在是：
# import { Logger } from './utils/logger';
# import { Config } from './config';
# 上下文行 "import { Config } from './config';" 虽然还在，但前面的行变了
```

**解决方法：** Codex 在 apply_patch 失败后会收到错误信息，包含当前文件的实际内容。模型根据这些信息重新生成 patch，使用文件当前状态作为上下文行。

### 原因三：空白字符不匹配

空白字符不匹配是一个隐蔽且令人沮丧的失败原因。模型的 patch 中的上下文行与文件中的实际行在可见字符上完全一致，但在空白字符上有差异。

常见的空白字符问题：

| 问题类型 | 模型输出 | 文件实际 | 后果 |
|----------|---------|---------|------|
| Tab vs Space | `  code`（2个空格） | `\tcode`（1个Tab） | 匹配失败 |
| 行尾符差异 | `code\n`（LF） | `code\r\n`（CRLF） | 可能匹配失败 |
| 尾部空格 | `code `（带尾部空格） | `code`（无尾部空格） | 匹配失败 |
| 缩进层级 | `    code`（4空格） | `  code`（2空格） | 匹配失败 |

其中 Tab vs Space 是最常见的问题。很多项目使用 EditorConfig 或 Prettier 强制统一的缩进风格，但模型可能根据训练数据的统计偏好生成不同风格的缩进。例如，模型知道一个 TypeScript 项目通常使用 2 空格缩进，但某个特定文件使用了 Tab 缩进（可能是遗留代码），模型生成的 patch 使用空格就会匹配失败。

```text
# 模型生成的 patch（使用空格缩进）
  if (condition) {
-   return oldValue;
+   return newValue;
  }

# 文件实际内容（使用 Tab 缩进）
	if (condition) {
		return oldValue;
	}
```

**解决方法：** Codex 在 apply_patch 失败后，错误信息中包含文件的实际内容（含空白字符）。模型可以看到实际的缩进风格，并在重试时使用正确的空白字符。在实践中，模型通常在第二次尝试时就能修正空白字符问题。

### 原因四：行号偏移

行号偏移发生在同一个文件被多次 patch 的场景。每次 patch 的插入和删除都会改变后续内容的行号。如果模型在 patch 中引用了行号（某些情况下位置标记会包含行号信息），而这些行号已经不再准确，就会导致定位错误。

不过需要注意，apply_patch 的匹配机制主要依赖上下文行而非行号。行号偏移更多影响的是依赖行号的编辑方式（如 sed 命令），对 apply_patch 的影响相对较小。但在某些极端情况下——比如文件中有大量重复的上下文行，harness 需要结合行号辅助定位时——行号偏移仍然可能导致错误匹配。

## 匹配失败的处理策略

Codex 的 Agent Loop 设计了一套自动化的失败处理流程。当 apply_patch 失败时，不会直接终止任务，而是进入重试循环。

### 自动重试流程

```
模型生成 patch
  ↓
harness 执行 apply_patch
  ↓
  ├─ 成功 → 返回应用结果 → 任务继续
  │
  └─ 失败 → 返回错误信息（含文件当前内容）
       ↓
       模型分析错误原因
       ↓
       模型重新生成 patch
       ↓
       harness 再次执行 apply_patch
       ↓
       （重复，直到成功或达到重试上限）
```

harness 返回的错误信息包含三个关键部分：

1. **错误类型**：是语法错误（patch 格式不合法）还是匹配错误（上下文行找不到）
2. **失败位置**：哪个 chunk 的哪个 hunk 失败
3. **文件当前内容**：目标文件的完整当前内容（或失败区域附近的内容）

这三个信息让模型能够诊断失败原因并生成正确的 patch。最常见的修正模式是：

- 对于上下文行不足：增加更多上下文行，消除匹配歧义
- 对于文件已修改：使用错误信息中返回的文件当前内容作为新的上下文行
- 对于空白字符不匹配：参照文件当前内容的空白字符风格
- 对于行号偏移：重新计算上下文行位置

### 手动干预策略

虽然 Codex 有自动重试机制，但在某些情况下仍然需要手动干预。以下是需要人工介入的场景：

**文件严重损坏。** 如果多次失败的 patch 已经导致文件处于不一致状态（部分 patch 成功应用，部分失败），可能需要手动恢复文件到已知状态，然后重新执行任务。

**循环重试。** 模型可能在同一种失败模式中循环：生成基于旧内容的 patch → 失败 → 看到新内容但仍然基于旧模式生成 patch → 再次失败。这种情况通常需要重新阅读文件后重新规划修改策略。

**大规模重构。** 当一个文件需要大量修改（超过 10 个 hunk），apply_patch 的累积失败率会显著上升。这时候更明智的做法是拆分为多次小 patch，每次修改一个逻辑单元。

## apply_patch 与其他编辑方式的对比

apply_patch 不是 AI 代码编辑的唯一方式。横向对比几种常见的编辑方式，可以更清楚地理解 apply_patch 的设计取舍。

### 方式对比表

| 维度 | apply_patch | 全文重写 | sed/awk 命令 |
|------|------------|---------|-------------|
| 精确度 | 高：基于上下文行精确匹配 | 中：依赖模型完整输出 | 中：依赖正则表达式 |
| Token 效率 | 高：只输出变更部分 | 低：输出整个文件 | 高：命令通常很短 |
| 可审计性 | 高：变更与上下文清晰对应 | 低：需要 diff 工具辅助 | 中：命令行可读但逻辑复杂 |
| 大文件表现 | 优秀：不受文件大小影响 | 差：受上下文窗口限制 | 优秀：流式处理 |
| 学习曲线 | 中：需要理解 diff 格式 | 低：直觉上最简单 | 高：需要精通正则表达式 |
| 失败模式 | 上下文行匹配失败 | 格式化噪声、未授权修改 | 正则表达式误匹配 |
| 并发安全 | 中：需要基于最新内容 | 差：容易覆盖并发修改 | 中：原子操作但不智能 |

### 全文重写的问题

全文重写是直觉上最简单的编辑方式：模型读取文件，输出修改后的完整文件内容，harness 用新内容覆盖旧文件。但这种方式在工程实践中存在严重问题。

首先是 token 浪费。一个 500 行的文件，只改 3 行，全文重写需要输出 500 行。apply_patch 只需要输出 10 行左右（上下文行 + 变更行）。当文件超过 1000 行时，全文重写的 token 成本可能让任务在上下文窗口内无法完成。

其次是未授权修改风险。模型在输出完整文件时，可能"顺手"做一些小的调整：重命名变量、调整 import 顺序、修改注释风格。这些修改混在 500 行输出中，几乎不可能在代码审查时被发现。apply_patch 限制了模型的操作范围：只有显式声明的删除行和添加行会被执行。

最后是格式化噪声。全文重写的输出需要与原文件的格式化风格完全一致（缩进、空行、注释风格）。任何偏差都会在 diff 中产生大量无意义的变更，污染 git 历史。apply_patch 只影响声明的行，不会引入格式化噪声。

### sed/awk 命令的问题

通过 shell_command 工具调用 sed 或 awk 是另一种编辑方式。它的优势是灵活——可以用正则表达式做复杂的文本替换。但在 AI 代理场景中，它的劣势也很明显。

首先是可审计性差。一条 `sed -i 's/old/new/g' file` 命令看起来很简单，但如果正则表达式复杂，审查者很难判断它的实际影响范围。apply_patch 的每一条变更都是显式的，一目了然。

其次是错误率高。正则表达式对空白字符、特殊字符和上下文语义的处理能力有限。一条 `sed` 命令可能匹配到意料之外的位置，或者因为文件中的特殊字符（如 `/`、`&`、`\`）而语法错误。apply_patch 的上下文行匹配是精确的字符串匹配，不会有意料之外的匹配。

最后是难以处理多行编辑。sed 主要是单行处理工具。当编辑涉及多行变更（如删除一个函数、插入一个代码块）时，sed 命令变得极其复杂且脆弱。apply_patch 天然支持多行编辑。

### 组合使用的最佳实践

在实际工程中，apply_patch 不是唯一的编辑手段。最佳实践是组合使用多种编辑方式，各取所长：

- **apply_patch** 用于精确的代码修改：函数签名变更、逻辑修改、bug 修复
- **shell_command + git** 用于文件操作：移动文件、重命名、批量操作
- **shell_command + 格式化工具** 用于代码风格：Prettier、ESLint --fix、Black
- **apply_patch + 测试** 用于验证修改正确性：修改代码后立即运行测试

## 实际案例：一次完整的 apply_patch 调用过程

以下案例展示了 Codex 处理一个真实任务时 apply_patch 的完整生命周期。

### 任务描述

```text
在 src/api/users.ts 中，将 getUserById 函数的返回类型从 User | null 改为 Result<User>，
并更新函数实现以使用 Result 包装。然后运行 pnpm test -- api/users.test.ts 确认测试通过。
```

### 第一步：模型读取文件

模型首先通过 shell_command 或文件读取工具获取目标文件内容：

```typescript
// src/api/users.ts（修改前）
import { User } from '../models/user';
import { Database } from '../utils/database';

export async function getUserById(id: string): Promise<User | null> {
  const db = Database.getInstance();
  const query = 'SELECT * FROM users WHERE id = $1';
  const result = await db.query(query, [id]);

  if (!result.rows.length) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: new Date(row.created_at),
  };
}
```

### 第二步：模型生成 patch

模型分析文件内容，生成修改 patch：

```text
*** Begin Patch
*** Update File: src/api/users.ts
@@ imports @@
 import { User } from '../models/user';
+import { Result, ok, err } from '../utils/result';
 import { Database } from '../utils/database';
@@ function signature @@
-export async function getUserById(id: string): Promise<User | null> {
+export async function getUserById(id: string): Promise<Result<User>> {
   const db = Database.getInstance();
   const query = 'SELECT * FROM users WHERE id = $1';
   const result = await db.query(query, [id]);
 
   if (!result.rows.length) {
-    return null;
+    return err(new NotFoundError(`User not found: ${id}`));
   }
 
   const row = result.rows[0];
-  return {
+  return ok({
     id: row.id,
     name: row.name,
     email: row.email,
     createdAt: new Date(row.created_at),
-  };
+  });
 }
*** End Patch
```

注意这个 patch 的几个设计要点：

1. 使用了两个 hunk，分别处理 import 区域和函数体。这是因为两个区域之间有大量未修改的代码，不需要包含在任何一个 hunk 中。
2. 每个 hunk 都包含足够的上下文行。第一个 hunk 用两行 import 语句定位，第二个 hunk 用函数签名和 query 语句定位。
3. 删除行和添加行成对出现，清晰展示了每个变更的原因。

### 第三步：harness 执行 patch

harness 收到 patch 后，按以下步骤执行：

1. 解析 patch 结构，识别出两个 chunk（这里只有一个 Update chunk，包含两个 hunk）
2. 打开目标文件 `src/api/users.ts`
3. 处理第一个 hunk：在文件中搜索 `import { User } from '../models/user';` 和 `import { Database } from '../utils/database';` 的连续匹配位置。找到后，在两者之间插入 `import { Result, ok, err } from '../utils/result';`
4. 处理第二个 hunk：在文件中搜索 `export async function getUserById(id: string): Promise<User | null> {` 等上下文行的匹配位置。找到后，应用删除和添加操作
5. 如果两个 hunk 都成功，返回成功信息

### 第四步：如果匹配失败

假设在第三步中，第二个 hunk 匹配失败。可能的原因是：文件的实际缩进使用 Tab 而不是空格，模型生成的 patch 使用了空格。

harness 返回的错误信息：

```text
apply_patch failed: context match error in hunk 2 of src/api/users.ts
Expected context line: "  const db = Database.getInstance();"
Actual file content near match location:
"	const db = Database.getInstance();"
Hint: whitespace mismatch detected (expected spaces, found tabs)
```

### 第五步：模型重试

模型收到错误信息，分析原因（空白字符不匹配），重新生成 patch：

```text
*** Begin Patch
*** Update File: src/api/users.ts
@@ function signature @@
-export async function getUserById(id: string): Promise<User | null> {
+export async function getUserById(id: string): Promise<Result<User>> {
	const db = Database.getInstance();
	const query = 'SELECT * FROM users WHERE id = $1';
	const result = await db.query(query, [id]);

	if (!result.rows.length) {
-		return null;
+		return err(new NotFoundError(`User not found: ${id}`));
	}

	const row = result.rows[0];
-	return {
+	return ok({
		id: row.id,
		name: row.name,
		email: row.email,
		createdAt: new Date(row.created_at),
-	};
+	});
 }
*** End Patch
```

模型修正了所有空白字符，使用 Tab 缩进匹配文件实际风格。第二次尝试成功。

### 第六步：运行测试验证

patch 成功应用后，模型执行验证步骤：

```bash
pnpm test -- api/users.test.ts
```

如果测试通过，任务完成。如果测试失败（比如 `NotFoundError` 未定义，需要额外的 import），模型会根据测试输出继续修复。

## 与 Claude Code 的 Edit 工具对比

Claude Code 使用 Edit 工具进行文件编辑，与 apply_patch 有相似的目标但不同的实现哲学。

### 核心机制差异

**Claude Code Edit：** 使用精确字符串匹配。模型提供 `old_string`（要替换的原始文本）和 `new_string`（替换后的文本），工具在文件中搜索 `old_string` 的精确出现位置并替换。如果 `old_string` 在文件中出现多次，工具会报错要求提供更多上下文。

**apply_patch：** 使用 hunk 级别的上下文行匹配。每个 hunk 包含多行上下文行和变更行，harness 在文件中搜索上下文行的连续匹配，然后应用变更。

### 格式表达能力

apply_patch 的格式表达能力更强。一个 apply_patch 调用可以：

- 同时修改多个文件
- 在同一个文件中修改多个不连续的区域
- 创建新文件和删除文件
- 用一个工具调用表达所有变更

Claude Code 的 Edit 工具每次调用只能修改一个文件中的一个位置。多文件修改需要多次 Edit 调用。这在 Agent Loop 中意味着更多的迭代次数。

但 Claude Code 的 Edit 工具有一个 apply_patch 缺少的特性：`replace_all` 参数。当设置 `replace_all: true` 时，Edit 工具会将文件中所有出现的 `old_string` 替换为 `new_string`。这对于全局重命名、批量替换等操作非常方便。apply_patch 要实现同样的效果，需要为每个替换位置写一个单独的 hunk。

### 匹配失败处理

两者在匹配失败时的处理策略相似：返回错误信息，包含文件当前内容，让模型修正并重试。

Claude Code Edit 的失败模式更简单——只有一种：`old_string` 在文件中找不到，或者找到多个。apply_patch 的失败模式更复杂——上下文行匹配失败、hunk 语法错误、chunk 类型错误等。

### Token 效率对比

在单次修改场景下，两者的 token 效率相近。apply_patch 需要写格式标记（`*** Begin Patch`、`@@` 等），Edit 需要写 `old_string` 和 `new_string` 参数。对于简单的单行修改，两者的开销差异不大。

在多文件、多位置修改场景下，apply_patch 的优势明显。一个 apply_patch 调用可以包含任意数量的 chunk 和 hunk，而 Claude Code 需要为每个修改位置发起一次 Edit 调用。每次 Edit 调用都有独立的工具调用开销（工具名、参数名、JSON 格式等）。

### 实际使用中的选择

两种工具各有适用场景。apply_patch 更适合：

- 多文件批量修改
- 结构化的代码重构
- 需要精确控制变更范围的场景

Claude Code Edit 更适合：

- 单个位置的快速修改
- 全局替换操作（配合 `replace_all`）
- 不需要关心 diff 格式的简单编辑

在实践中，两种工具的选择更多取决于使用的 AI 代理平台——Codex 只能用 apply_patch（和 shell_command），Claude Code 只能用 Edit（和 Write、Bash）。使用者不需要在两者之间做选择，但理解它们的设计差异有助于更好地使用各自的工具。

## 总结：apply_patch 的工程启示

apply_patch 的设计体现了 AI 代码编辑工具的几个关键工程原则。

**最小变更原则。** 编辑工具应该只影响声明要修改的部分，不做额外的隐含修改。这不仅是一个效率问题，更是一个安全和可审计性问题。apply_patch 通过 hunk 结构强制执行这个原则。

**确定性执行原则。** 相同的输入（patch + 文件）必须产生相同的输出。apply_patch 的匹配和应用逻辑是完全确定性的，不依赖启发式算法或概率模型。这使得 apply_patch 的行为可以精确预测和复现。

**失败透明原则。** 当操作失败时，错误信息应该包含足够的信息让调用者（模型或人类）理解失败原因并修正。apply_patch 的错误信息包含失败类型、位置和文件当前内容，支持自动化的重试流程。

**训练对齐原则。** 工具的格式设计应该利用模型的训练优势。模型在训练数据中见过大量 diff 格式的文本，对 unified diff 格式有天然的掌握。apply_patch 的格式基于 unified diff，降低了模型学习新格式的成本。

理解 apply_patch 的工作原理、失败模式和处理策略，是有效使用 Codex 的基础。当你能够预测 apply_patch 在什么情况下会成功、什么情况下会失败，你就能够在编写 prompt 时提供足够的上下文信息，在失败发生时快速诊断原因，在复杂修改任务中选择合适的编辑策略。

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
