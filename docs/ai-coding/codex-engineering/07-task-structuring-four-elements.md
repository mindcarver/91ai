# 任务结构化：目标、上下文、约束和完成条件四要素

**TL;DR：** 模糊的指令导致模糊的输出，结构化的任务描述是 Codex 高效执行的前提。本文定义任务四要素框架：Goal（目标）说明做什么、Context（上下文）告诉模型在哪些文件里做、Constraints（约束）划清不能碰的边界、Done-when（完成条件）定义怎样算做完。四个要素齐全的任务，模型单轮完成率显著高于随意描述的任务。文章提供 GitHub Issue 风格的任务模板、坏 prompt 到好 prompt 的转换示例、四类完成条件模式的写法、以及任务队列的清单格式。

---

## 为什么非结构化任务必然失败

先看一条真实的 Codex 指令：

```text
"fix auth"
```

两个字。开发者想表达的意思大概是"认证模块有个 bug，帮我修一下"。但 Codex 收到这条指令后面对的是一片空白：

- "auth" 指的是什么？是 `src/auth/` 目录？是 `auth/login.ts` 文件？是某个叫 `auth` 的 npm 包？
- "fix" 要修什么？编译错误？运行时异常？性能问题？安全漏洞？
- 修成什么样算修好了？所有测试通过？特定的报错消失？需要手动验证？
- 有没有什么不能动的？其他模块的接口？数据库 schema？配置文件？

模型的典型应对方式是"先读再猜"：遍历项目寻找可能相关的文件，读完后凭猜测判断哪里有问题，然后生成一个可能正确的修改。这个过程消耗大量轮次在文件搜索和猜测上，产出质量高度不可控。

一轮失败的对话通常是这样的：

```text
用户：fix auth

模型：我需要先了解一下 auth 模块的情况。让我搜索相关文件。
[搜索 src/auth/ 目录]
[读取 auth/login.ts]
[读取 auth/middleware.ts]
[读取 auth/session.ts]

模型：我发现了几个可能的问题：
1. login.ts 第 47 行 token 验证缺少空值检查
2. middleware.ts 第 23 行 session 过期处理逻辑有潜在竞态
3. session.ts 缺少对 Redis 连接断开的错误处理

请问你希望我修复哪个问题？

用户：第一个，token 验证那个

模型：好的，我来修复 login.ts 的 token 验证问题。
[修改 login.ts]

模型：修复完成。我在 handleTokenExpiry 函数中添加了空值检查。

用户：跑一下测试

模型：
[运行 pnpm test]
  3 个测试失败...

模型：看起来修改引入了新的问题。让我再调整一下。
[再次修改 login.ts]

用户：再跑

模型：
[运行 pnpm test]
  全部通过

用户：还有 lint 检查呢？

模型：
[运行 pnpm lint]
  1 个 warning...

模型：让我修复这个 warning。
[第三次修改]
```

6 轮对话，修了一个空值检查。如果指令一开始就写成下面这样，一轮就够：

```text
修复 src/auth/login.ts 中 handleTokenExpiry 函数的 token 空值检查缺失问题。

具体位置：第 47 行，verifyToken() 返回值直接传递给 decodePayload()，
没有处理 verifyToken 返回 null 的情况。

修复要求：在 verifyToken() 返回后添加空值检查，如果为 null 则抛出
TokenExpiredError 并清除 session。

验证：修改后运行 pnpm test -- auth/ && pnpm lint，全部通过即为完成。

不要修改 decodePayload 或其他 auth 模块的公共接口。
```

区别不在于模型的能力，在于信息的完整度。第一条指令缺少目标的具体性、缺少上下文的定位、缺少约束的边界、缺少完成条件的定义。模型需要自己填补这些空白，而填补的过程就是浪费的轮次。

四要素框架的目的就是把上述四类信息标准化，让你每次写任务时有一张清单可以对照，确保不遗漏关键信息。

## 四要素框架

四要素框架把一条完整的任务指令拆解为四个结构化部分：Goal（目标）、Context（上下文）、Constraints（约束）、Done-when（完成条件）。每个要素解决一个特定的问题，四个要素组合起来构成模型执行任务所需的全部信息。

```text
任务 = Goal + Context + Constraints + Done-when
```

| 要素 | 解决什么问题 | 缺失时的后果 |
|------|------------|------------|
| Goal | 做什么 | 模型猜测意图，产出南辕北辙 |
| Context | 在哪做、当前状态 | 模型遍历项目搜索，浪费轮次 |
| Constraints | 不能做什么 | 模型过度修改，引发级联变更 |
| Done-when | 怎样算做完 | 模型改完就停，缺少验证环节 |

### Goal（目标）：做什么

Goal 用一句话描述任务的执行目标。核心原则是**使用动作动词，明确期望的结果状态**。

Codex 是一个执行代理（acting agent），不是聊天机器人。它的训练目标是"做"而不是"说"。Goal 部分应该直接告诉模型期望的执行结果，而不是请求模型的分析或建议。

**动词选择直接决定模型的行为模式：**

| 动词 | 模型行为 | 适用场景 |
|------|---------|---------|
| 修复 | 定位问题 -> 修改代码 -> 验证 | 已知 bug |
| 重构 | 理解结构 -> 调整组织 -> 保持行为不变 | 代码整理、模式迁移 |
| 添加 | 理解现有模式 -> 在正确位置插入新代码 | 新功能、新测试 |
| 删除 | 定位目标 -> 确认无引用 -> 移除 | 废弃代码清理 |
| 迁移 | 理解源结构 -> 生成目标结构 -> 验证等价性 | 框架升级、API 版本迁移 |
| 更新 | 找到旧逻辑 -> 替换为新逻辑 -> 回归验证 | 依赖升级、配置变更 |

**不推荐的动词：**

| 动词 | 问题 | 替代写法 |
|------|------|---------|
| 看看 | 模型会输出分析而不是执行修改 | "修复" 或 "分析"（二选一） |
| 优化 | 目标模糊，不知道优化什么指标 | "将 O(n^2) 的查询优化为 O(n log n)" |
| 改进 | 同上，缺少具体方向 | "添加输入验证" 或 "减少内存分配" |
| 处理一下 | 不清楚是修复、重构还是添加 | 用上面表格中的具体动词 |
| 搞定 | 极其模糊 | 拆解为具体动词 + 具体目标 |

**好的 Goal 写法示例：**

```text
修复 src/auth/login.ts 中 handleTokenExpiry 函数在 token 为空时
未抛出 TokenExpiredError 的 bug。
```

```text
将 src/utils/date.ts 中的所有 moment.js 调用迁移为 date-fns 等价函数。
```

```text
为 src/payment/calculateFee 函数添加 5 个边界条件测试用例。
```

三个例子都满足：动词开头、定位到具体文件/函数、描述了期望的结果状态。

**差的 Goal 写法示例：**

```text
看看 auth 那个文件。
```

模型读完文件后输出一段分析，什么都没有修改。你还需要再发一条指令。

```text
优化一下性能。
```

模型不知道优化哪个指标（速度？内存？网络请求？）、优化到什么程度、从哪个模块入手。最可能的行为是在整个项目里搜索性能相关的代码，然后给出一堆泛泛的建议。

```text
这个登录页面有 bug，处理一下。
```

这是最常见的坏模式：描述了症状（"有 bug"），但没有描述目标（要修复成什么样）。模型需要先调查 bug 是什么，再决定怎么修。如果指令在一开始就说明"修复 token 过期后页面白屏的问题"，模型可以直接定位到相关代码开始修复。

### Context（上下文）：在哪做

Context 部分告诉模型在哪些文件和模块里执行任务，以及当前的代码状态。它的核心价值是**消除模型搜索和猜测的轮次**。

Codex 支持并行工具调用（`parallel_tool_calls`）。这意味着你可以在 Context 部分列出 3-5 个相关文件路径，模型会在一轮内并行读取所有文件，然后在下一轮基于完整的上下文开始执行。对比逐个搜索文件再逐个读取的串行模式，并行读取节省 3-5 轮对话。

**Context 应该包含的信息：**

```text
相关文件路径：列出 3-5 个与任务直接相关的文件
当前状态：描述相关模块的当前实现状态
依赖关系：指出这些文件之间的调用或数据依赖
```

**示例：**

```text
相关文件：
- src/auth/login.ts — handleTokenExpiry 函数所在文件，第 47 行有 bug
- src/auth/types.ts — TokenExpiredError 类型定义
- src/auth/session.ts — clearSession 函数，修复时可能需要调用
- src/__tests__/auth/login.test.ts — 相关测试文件
- src/middleware/auth.ts — 调用 handleTokenExpiry 的上游中间件

当前状态：
handleTokenExpiry 函数在第 47 行调用 verifyToken()，
返回值直接传递给 decodePayload()，中间没有空值检查。
verifyToken 在 token 过期时返回 null，但当前代码没有处理这个分支。
TokenExpiredError 已在 types.ts 中定义，可直接使用。
```

这个 Context 做了三件事：

1. 精确列出了需要读的文件和每个文件的角色
2. 说明了当前代码的问题所在（第 47 行，缺少空值检查）
3. 提供了修复时可能用到的相关信息（TokenExpiredError 已定义、clearSession 可用）

模型收到这些信息后，一轮并行读取就能建立完整的理解，不需要自己搜索和猜测。

**Context 的常见错误：**

| 错误 | 后果 | 修正 |
|------|------|------|
| 只给目录名不给文件名 | 模型需要遍历目录再选择文件，浪费 1-2 轮 | 给出具体文件路径 |
| 给了不相关的文件 | 噪声占用上下文窗口，分散模型注意力 | 只列直接相关的文件 |
| 省略了测试文件 | 模型不知道怎么验证，改完就停 | 始终包含对应的测试文件路径 |
| 省略了类型定义文件 | 模型可能自定义不存在的类型 | 如果涉及类型操作，包含类型文件 |

**一个实用的 Context 模板：**

```text
相关文件（模型应并行读取）：
- [主文件路径] — [这个文件在任务中的角色]
- [依赖文件 1] — [与主文件的关系]
- [依赖文件 2] — [与主文件的关系]
- [测试文件] — [验证修改的测试]
- [配置/类型文件] — [相关配置或类型定义]

当前状态：
[2-3 句话描述相关代码的现状，包括问题所在的位置]
```

### Constraints（约束）：不能做什么

Constraints 部分划定任务的范围边界，告诉模型什么不应该做。它的核心价值是**防止过度修改和级联变更**。

模型没有"适可而止"的概念。如果不告诉它边界，它会按照自己的判断尽可能"完善"代码。这种"完善"可能包括：

- 顺手重构了附近看起来不太好的代码
- 修改了公共接口的签名以"更合理"
- 在其他文件中添加了"相关"的新功能
- 修改了测试文件中"不够完善"的断言

每一次"顺手"都是一个风险点。在一个 50 个文件的项目中，一个本来只涉及 2 个文件的 bug 修复，可能因为缺乏约束而变成一个涉及 10 个文件的重构。

**Constraints 的三类内容：**

```text
范围边界：只修改哪些文件/模块
模式约束：遵循什么编码模式和风格
保护清单：明确不允许触碰的文件和接口
```

**示例：**

```text
约束：
- 只修改 src/auth/login.ts，不修改其他 auth 模块文件
- 保持 handleTokenExpiry 的函数签名不变（参数和返回类型）
- 不要修改 decodePayload 函数的实现
- 错误处理模式参照 src/utils/errors.ts 中已有的 Result 类型模式
- 不要引入新的依赖包
- 不要修改 src/middleware/auth.ts 中对 handleTokenExpiry 的调用方式
```

**Constraints 的写法建议：**

正向约束（应该做的）和负向约束（不应该做的）都需要写。但负向约束通常信息量更大，因为它直接阻止模型犯错。

| 约束类型 | 写法示例 | 作用 |
|---------|---------|------|
| 文件范围 | "只修改 src/auth/login.ts" | 防止跨文件修改 |
| 接口保护 | "保持 handleTokenExpiry 的函数签名不变" | 防止公共 API 破坏 |
| 模式约束 | "遵循 Result 类型模式" | 确保风格一致 |
| 依赖限制 | "不要引入新的依赖包" | 防止包膨胀 |
| 测试保护 | "不要修改现有测试的断言" | 防止测试失效 |

**一个常见的错误是只写正向约束，不写负向约束。**

```text
# 只有正向约束（不够）
约束：遵循项目现有的错误处理模式。

# 加上负向约束（完整）
约束：
- 遵循项目现有的错误处理模式（参照 src/utils/errors.ts）
- 不要使用 try/catch，项目统一用 Result 类型
- 不要在 handleTokenExpiry 中添加 console.log 或 console.error
```

### Done-when（完成条件）：怎样算做完

Done-when 部分定义任务的验收标准。它的核心价值是**让模型在修改完成后自行验证，而不是改完就停**。

没有 Done-when 的任务，模型的行为是"生成修改 -> 输出说明 -> 结束"。修改是否正确、测试是否通过、lint 是否干净，都留给你手动确认。如果发现问题，又是一轮新的对话。

有 Done-when 的任务，模型的行为是"生成修改 -> 执行验证命令 -> 检查结果 -> 如果不通过则自动修复 -> 再次验证 -> 通过后输出最终结果"。整个验证循环由模型自行完成。

**Done-when 的四类模式：**

```text
1. 测试驱动：运行测试命令，所有测试通过
2. Diff 驱动：检查 git diff，确认变更范围符合预期
3. 输出驱动：运行程序，检查输出内容
4. Review 驱动：代码审查，确认符合规范
```

详细说明和写法在后面的"完成条件模式"章节展开。

## GitHub Issue 风格的任务模板

把四要素组合起来，形成一份标准化的任务描述。下面的模板参考了 GitHub Issue 的格式，每个任务用一份这样的模板来描述：

```markdown
## 任务：[动词] + [具体目标]

### Goal
[一句话描述要做什么。使用动作动词，明确期望结果。]

### Context
相关文件（并行读取）：
- `path/to/main-file.ts` — [角色说明]
- `path/to/dependency.ts` — [与主文件的关系]
- `path/to/test-file.ts` — [验证用的测试]

当前状态：
[2-3 句描述现状，包括问题位置和已有条件。]

### Constraints
- [范围边界：只修改哪些文件]
- [模式约束：遵循什么编码风格]
- [保护清单：不允许触碰的文件/接口]
- [其他限制：依赖、性能、兼容性等]

### Done-when
- [ ] [验证命令 1，如 pnpm test -- path/to/test]
- [ ] [验证命令 2，如 pnpm lint]
- [ ] [验证命令 3，如 pnpm typecheck]
- [ ] [人工确认项，如 git diff 确认变更范围]
```

**使用示例——一个完整的任务描述：**

```markdown
## 任务：修复 token 过期后页面白屏的 bug

### Goal
修复 src/auth/login.ts 中 handleTokenExpiry 函数在 token 为空时
未抛出 TokenExpiredError 导致页面白屏的问题。

### Context
相关文件（并行读取）：
- `src/auth/login.ts` — handleTokenExpiry 函数所在文件，bug 在第 47 行
- `src/auth/types.ts` — TokenExpiredError 类型定义
- `src/auth/session.ts` — clearSession 函数，修复时需调用
- `src/__tests__/auth/login.test.ts` — 登录模块测试

当前状态：
handleTokenExpiry 在第 47 行调用 verifyToken()，返回值直接传递给
decodePayload()，没有处理 verifyToken 返回 null 的情况。
当 token 过期时 verifyToken 返回 null，decodePayload(null) 导致
未捕获异常，前端页面白屏。TokenExpiredError 已在 types.ts 定义。

### Constraints
- 只修改 src/auth/login.ts，不修改其他 auth 文件
- 保持 handleTokenExpiry 的函数签名不变
- 不要修改 decodePayload 的实现
- 错误处理使用已有的 TokenExpiredError 类型
- 不要添加新的依赖

### Done-when
- [ ] pnpm test -- src/__tests__/auth/login.test.ts 全部通过
- [ ] pnpm lint 无新增 error 或 warning
- [ ] pnpm typecheck 通过
- [ ] git diff 只包含 src/auth/login.ts 的变更
```

模型收到这份任务描述后的典型执行流程：

```text
Round 1: 并行读取 4 个文件（login.ts, types.ts, session.ts, login.test.ts）
Round 2: 理解代码，定位 bug，生成修复代码
Round 3: 执行 pnpm test，确认通过
Round 4: 执行 pnpm lint && pnpm typecheck，确认通过
Round 5: 执行 git diff，确认变更范围，输出最终结果
```

5 轮完成整个修复和验证。对比前面的"fix auth"需要 6 轮且缺少验证，效率和质量都有显著提升。

## 示例：从坏 prompt 到结构化任务

### 原始 prompt

```text
"这个登录页面有bug"
```

这条指令的问题：

| 要素 | 状态 | 后果 |
|------|------|------|
| Goal | 缺失 | 模型不知道要修复什么问题 |
| Context | 缺失 | 模型不知道在哪个文件、哪段代码 |
| Constraints | 缺失 | 模型可能修改任何文件 |
| Done-when | 缺失 | 模型不知道怎样算修好了 |

### 第一步：补充 Goal

先从模糊描述中提取出具体的执行目标。需要你自己明确"bug 是什么"和"期望的正确行为是什么"。

```text
Goal: 修复登录页面在 token 过期后白屏的 bug。
```

### 第二步：补充 Context

确定 bug 所在的文件和模块。如果不确定，先用 Ask 模式让模型调查。

```text
Context:
相关文件：
- src/pages/Login.tsx — 登录页面组件，白屏发生在这里
- src/auth/login.ts — 认证逻辑，包含 handleTokenExpiry
- src/auth/types.ts — 认证相关类型定义

当前状态：用户 token 过期后，页面不显示任何错误提示，直接白屏。
怀疑是 handleTokenExpiry 中的异常未正确捕获。
```

### 第三步：补充 Constraints

划定修改范围。

```text
Constraints:
- 只修改 src/auth/login.ts 和 src/pages/Login.tsx
- 保持 Login 组件的 props 接口不变
- 不要修改 src/auth/ 下的其他文件
- 错误提示使用已有的 ErrorBanner 组件
```

### 第四步：补充 Done-when

定义验证方式。

```text
Done-when:
- [ ] pnpm test -- src/__tests__/auth/ 全部通过
- [ ] pnpm lint && pnpm typecheck 通过
- [ ] 模拟 token 过期场景，页面显示"登录已过期"提示而非白屏
```

### 最终结果

```text
修复登录页面 token 过期后白屏的 bug。

Context:
- src/pages/Login.tsx — 登录页面组件
- src/auth/login.ts — 认证逻辑，handleTokenExpiry 函数
- src/auth/types.ts — 类型定义

当前状态：token 过期后页面白屏，怀疑 handleTokenExpiry 异常未捕获。

Constraints:
- 只修改 src/auth/login.ts 和 src/pages/Login.tsx
- 保持 Login 组件 props 接口不变
- 错误提示使用已有的 ErrorBanner 组件

Done-when:
- pnpm test -- src/__tests__/auth/ 全部通过
- pnpm lint && pnpm typecheck 通过
- token 过期时页面显示错误提示而非白屏
```

对比原始的"这个登录页面有 bug"，结构化的版本让模型在一轮内建立完整理解，不需要反复追问和猜测。

## 示例：多文件重构任务的范围声明

多文件重构是四要素框架最有价值的场景之一。涉及文件越多，缺少约束的风险越大。一个没有约束的重构任务可能变成一个不受控的全局重写。

### 任务背景

将项目中的 moment.js 依赖全部替换为 date-fns，涉及 5 个文件。

### 错误写法：只说不做什么

```text
将 moment.js 替换为 date-fns。
不要动 config/ 目录。
```

问题在于"不要动 config/" 告诉了模型不应该碰什么，但没有告诉模型应该碰什么。模型仍然可能修改不在 config/ 下的、与 date 运算无关的文件，比如顺手"优化"了附近的 lodash 调用。

### 正确写法：明确声明 scope（范围）

```markdown
## 任务：将 moment.js 替换为 date-fns

### Goal
将以下 5 个文件中的 moment.js 调用替换为 date-fns 等价函数，
保持所有函数的外部行为不变。

### Context
需要修改的文件（仅限这 5 个）：
- `src/utils/date.ts` — 日期格式化和解析工具函数
- `src/components/DatePicker.tsx` — 日期选择器组件
- `src/components/DateRange.tsx` — 日期范围组件
- `src/pages/Dashboard.tsx` — 仪表盘页面（日期显示）
- `src/services/report.ts` — 报告生成（日期计算）

参考文件（只读，不修改）：
- `src/utils/date.test.ts` — 现有测试，修改后必须全部通过
- `package.json` — 确认 date-fns 已安装

当前状态：
date-fns@3.6.0 已在 package.json 中声明为依赖。
moment.js 的调用分布在上述 5 个文件中，共计约 30 处。

### Constraints
- 只修改上面列出的 5 个文件，不修改其他任何文件
- 不修改任何函数的公共接口（参数类型、返回类型）
- 不修改 package.json（date-fns 已安装，不需要再添加）
- 不修改测试文件中的测试用例（通过现有测试即可，不增不减）
- date-fns 的导入使用具名导入：`import { format, parseISO } from 'date-fns'`
- 不使用 date-fns 的 locale 功能（项目只用默认英文格式）

### Done-when
- [ ] 在上述 5 个文件中搜索 "moment" 关键词，结果为零
- [ ] pnpm test 全部通过（包括 date.test.ts 的 23 个测试）
- [ ] pnpm lint && pnpm typecheck 通过
- [ ] git diff --stat 只包含上述 5 个文件
```

**这个写法的关键设计决策：**

1. **正向 + 负向 scope 双重声明**。Goal 中明确说"以下 5 个文件"，Constraints 中又说"只修改上面列出的 5 个文件"。正向说明给了模型清晰的目标清单，负向说明防止模型在执行中自行扩大范围。

2. **参考文件标注为只读**。测试文件和 package.json 被列入"参考文件"而非"需要修改的文件"。模型会读取这些文件获取信息，但不会修改它们。

3. **完成条件包含范围检查**。Done-when 中的 `git diff --stat 只包含上述 5 个文件` 是最后一道防线。即使模型在执行中违反了约束修改了其他文件，这个检查也能在验证阶段发现问题。

4. **技术细节作为约束**。具名导入的风格、不使用 locale 功能，这些都是防止模型引入不符合项目风格的代码。

## 完成条件模式

Done-when 的写法因任务类型而异。下面是四类常见的完成条件模式，每类给出模板和适用场景。

### 模式一：测试驱动

最常用的模式。通过运行测试命令来验证代码修改的正确性。

```text
Done-when:
- [ ] pnpm test -- src/__tests__/auth/login.test.ts 全部通过
- [ ] pnpm lint 无新增 error 或 warning
- [ ] pnpm typecheck 通过
```

适用场景：bug 修复、功能添加、重构。前提是项目有对应的测试覆盖。

**测试驱动模式的关键细节：**

- 指定具体的测试文件路径，而不是只写 `pnpm test`。跑全量测试耗时且不必要，只跑相关测试节省时间。
- 在测试之外补充 lint 和 typecheck。测试通过不代表代码风格和类型没有问题。
- 如果修复引入了新的行为，Done-when 中应包含"添加对应的测试用例"。

```text
Done-when:
- [ ] 添加 2 个测试用例覆盖 token 为 null 和 token 过期的场景
- [ ] pnpm test -- src/__tests__/auth/login.test.ts 全部通过（包括新用例）
- [ ] pnpm lint && pnpm typecheck 通过
```

### 模式二：Diff 驱动

通过检查 git diff 来验证变更范围和内容符合预期。适用于重构、迁移、配置修改等任务。

```text
Done-when:
- [ ] git diff --stat 只包含以下文件：
      src/utils/date.ts
      src/components/DatePicker.tsx
      src/components/DateRange.tsx
- [ ] git diff src/utils/date.ts 中不包含任何函数签名变更
- [ ] grep -r "moment" src/ --include="*.ts" --include="*.tsx" 返回零结果
- [ ] pnpm test 全部通过
```

适用场景：依赖迁移、API 版本升级、代码风格统一。这类任务的核心验收标准是"旧模式完全消失"和"变更范围受控"。

**Diff 驱动模式的进阶用法：**

当任务需要保持特定接口不变时，可以在 Done-when 中用 diff 检查：

```text
Done-when:
- [ ] git diff 不包含 export 语句的变更（公共接口未变）
- [ ] git diff 不包含 package.json 或 package-lock.json 的变更
```

### 模式三：输出驱动

通过运行程序并检查输出来验证结果。适用于 CLI 工具、数据处理脚本、生成器等任务。

```text
Done-when:
- [ ] pnpm build 构建成功，无 error
- [ ] node dist/cli.js --input fixtures/test.csv --output /tmp/result.json
      执行成功，退出码为 0
- [ ] /tmp/result.json 的结构与 fixtures/expected.json 一致
      （字段名和嵌套层级相同，值可能因数据不同而不同）
- [ ] pnpm lint 通过
```

适用场景：CLI 工具开发、数据处理流水线、代码生成器。这类任务的核心是"程序能跑出正确的结果"。

**输出驱动模式的注意事项：**

- 明确指定输入文件和预期输出。用 fixtures 目录存放测试数据，避免模型构造不确定的输入。
- 检查退出码而不只是输出内容。一个程序可能输出正确结果但以非零退出码退出（说明有未处理的异常）。
- 如果输出需要人工判断（如 UI 渲染结果），在 Done-when 中注明需要人工确认。

### 模式四：Review 驱动

通过代码审查标准来验证。适用于架构调整、设计模式引入、安全相关修改等任务。

```text
Done-when:
- [ ] 修改后的代码符合以下审查标准：
      1. 所有错误路径都有对应的错误处理
      2. 没有使用 any 类型
      3. 新增的公共函数都有 JSDoc 注释
      4. 复杂度超过 10 的函数有行内注释说明逻辑
- [ ] pnpm test 全部通过
- [ ] pnpm lint && pnpm typecheck 通过
- [ ] git diff 确认变更范围不超出预期
```

适用场景：安全审查修复、代码质量提升、技术债务清理。这类任务不能仅靠自动化测试验证，还需要满足特定的代码质量标准。

### 四类模式的选择指南

| 任务类型 | 推荐模式 | 核心验证命令 |
|---------|---------|------------|
| Bug 修复 | 测试驱动 | `pnpm test -- [test-file]` |
| 新功能 | 测试驱动 + Review | `pnpm test` + 代码审查清单 |
| 重构/迁移 | Diff 驱动 + 测试驱动 | `grep` + `pnpm test` |
| 配置变更 | Diff 驱动 | `git diff --stat` |
| CLI/工具 | 输出驱动 | `node dist/cli.js --input ...` |
| 安全修复 | 测试驱动 + Review | `pnpm test` + 安全审查清单 |
| 文档更新 | Review 驱动 | 人工阅读确认 |

实际使用中，多数任务需要组合多个模式。一个完整的 bug 修复任务通常包含测试驱动（测试通过）+ Diff 驱动（确认变更范围）双重验证。

## 反模式：过度指定实现细节

四要素框架的一个常见误用是把 Goal 和 Constraints 写成了实现说明书——告诉模型"怎么做"而不是"做什么"。这种反模式不仅不会提升质量，反而会降低产出。

### 过度指定的示例

```text
Goal: 修复 handleTokenExpiry 的空值检查 bug

实现步骤：
1. 在第 47 行后添加一个 if 语句
2. 条件是 verifyToken() 的返回值等于 null
3. if 块内调用 clearSession(sessionId)
4. 然后抛出 TokenExpiredError，message 是 "Token has expired"
5. 错误码设置为 "TOKEN_EXPIRED"
6. 在 catch 块中返回 { success: false, error: err.message }

约束：
- 使用 if (!token) 而不是 if (token === null)
- 不要使用可选链操作符 ?.
- clearSession 的参数必须从 this.sessionId 获取
```

**问题所在：**

你逐行告诉了模型应该怎么写代码。这不是在用 Codex，这是在用自然语言写代码然后让模型当打字员。几个具体问题：

1. **模型可能比你更了解上下文。** 你指定的第 47 行可能已经因为之前的修改变了行号。模型读取文件后能精确定位，你的硬编码行号反而是错的。

2. **实现细节可能不是最优解。** 你指定的 `if (!token)` 可能不如使用 Optional Chain 更符合项目的其他代码风格。模型读完全部代码后能做出更好的判断。

3. **约束过度限制了模型的灵活性。** "不要使用可选链" 这种约束除非有明确的技术原因（如目标环境不支持），否则是在限制模型选择更优方案。

### 正确的写法

```text
Goal: 修复 handleTokenExpiry 函数在 token 为空时未抛出 TokenExpiredError 的 bug

Context:
- src/auth/login.ts — handleTokenExpiry 函数
- src/auth/types.ts — TokenExpiredError 类型定义
- src/auth/session.ts — clearSession 函数

当前状态：verifyToken 返回 null 时，代码没有处理这个分支。

Constraints:
- 保持 handleTokenExpiry 的函数签名不变
- 错误处理遵循 src/utils/errors.ts 中的模式

Done-when:
- [ ] pnpm test -- src/__tests__/auth/login.test.ts 全部通过
- [ ] pnpm lint && pnpm typecheck 通过
```

**区别在于：** 正确的写法描述了"做什么"（修复空值检查的 bug）和"做好的标准"（测试通过、lint 通过），但没有规定"怎么做"。模型读完全部代码后，会根据项目的代码风格、已有的错误处理模式、函数的结构来决定最合适的实现方式。

**判断标准：如果你的 Goal/Constraints 读起来像伪代码，那就是过度指定了。**

四要素的正确使用边界：

| 应该指定 | 不应该指定 |
|---------|-----------|
| 修改哪些文件 | 每个文件具体改哪一行 |
| 保持什么接口不变 | 用什么语法实现 |
| 遵循什么编码模式 | 变量叫什么名字 |
| 测试要覆盖什么场景 | 测试的每个断言怎么写 |
| 不引入什么依赖 | 用什么算法（除非有明确要求） |

## 与 AGENTS.md 的关系

本系列的第三篇和第四篇文章详细讲了 AGENTS.md 的写法和分层继承机制。四要素框架和 AGENTS.md 解决的是不同层面的问题：

```text
AGENTS.md = 永久性上下文（项目级别的常识）
四要素   = 临时性上下文（任务级别的具体信息）
```

| 维度 | AGENTS.md | 四要素 |
|------|-----------|--------|
| 生命周期 | 跨任务持久存在 | 单次任务有效 |
| 信息类型 | 项目常识（构建命令、目录结构、编码规范） | 任务细节（具体文件、具体 bug、具体约束） |
| 谁来维护 | 项目所有者，随项目演进 | 任务发起者，每次任务重写 |
| 放在哪里 | 项目根目录的 AGENTS.md 文件 | prompt / Issue / 任务描述中 |
| 信息量 | 约 100 行，作为"内容目录"指向 docs/ | 每个任务 10-30 行 |

**互补而非替代。** AGENTS.md 提供了模型在所有任务中都需要知道的常识（怎么构建、怎么测试、目录在哪、编码风格是什么），四要素提供了单个任务的具体信息（这个任务改什么文件、修什么 bug、不能碰什么、怎么验证）。

一个常见的错误是在四要素中重复 AGENTS.md 的内容：

```text
# 不要这样做（重复 AGENTS.md 的信息）
Constraints:
- 使用 TypeScript strict 模式
- 代码风格遵循 ESLint 配置
- 测试框架使用 Jest
- 使用 pnpm 作为包管理器
```

这些信息已经在 AGENTS.md 的 Commands 和 Working Rules 段中声明了。Codex 每次执行任务都会自动加载 AGENTS.md，不需要在每个任务中重复。四要素的 Constraints 应该只包含**这个任务特有的约束**，而不是项目通用的规范。

**另一个常见的错误是只在 AGENTS.md 中写约束，不在任务中写约束。** AGENTS.md 的约束是全局性的（"所有数据库操作都要通过 Repository 层"），任务的约束是具体性的（"这次只修改 login.ts，不修改 auth/ 下的其他文件"）。两者不能互相替代。

```text
AGENTS.md 的约束（全局）：
- 所有 API 路由必须经过 auth 中间件验证
- 数据库操作通过 Repository 层
- 不要直接使用 SQL 字符串

任务的约束（本次特有）：
- 只修改 src/auth/login.ts
- 保持 handleTokenExpiry 函数签名不变
- 不引入新的依赖
```

正确的做法是：AGENTS.md 处理全局性的"项目常识"，四要素处理任务级别的"这次具体信息"。模型在执行时同时参考两者——先读 AGENTS.md 了解项目规则，再读任务描述了解具体要求。

## 任务队列格式

当你有一组相关的任务需要依次执行时，可以把它们组织成一个结构化的任务队列。每个任务用四要素描述，整体用一个清单来编排顺序。

### 队列模板

```markdown
# 任务队列：[项目名称] - [阶段名称]

## Task 1: [动词] + [目标]

**Goal:** [一句话目标]
**Context:** [文件列表 + 当前状态]
**Constraints:** [范围、模式、保护]
**Done-when:** [验证命令]

---

## Task 2: [动词] + [目标]
（同上格式）

---

## Task 3: [动词] + [目标]
（同上格式）
```

### 队列的设计原则

**原则一：任务之间有明确的依赖顺序。**

如果 Task 2 依赖 Task 1 的结果（比如 Task 1 创建了一个新函数，Task 2 要调用它），那么 Task 1 必须在 Task 2 前面。如果两个任务没有依赖关系，可以并行执行。

```text
依赖关系示例：
Task 1: 创建 Result<T, E> 类型 (src/utils/result.ts)
Task 2: 将 auth 模块的错误处理迁移为 Result 类型  — 依赖 Task 1
Task 3: 将 payment 模块的错误处理迁移为 Result 类型 — 依赖 Task 1
Task 4: 添加 Result 类型的单元测试 — 依赖 Task 1

执行顺序：Task 1 -> (Task 2 || Task 3 || Task 4 并行) -> 集成验证
```

**原则二：每个任务都是独立可验证的。**

即使任务之间有依赖关系，每个任务也应该有自己的 Done-when。这确保了每个步骤都有质量闸门，而不是到最后才发现中间某一步出了问题。

**原则三：队列的粒度适中。**

太粗的粒度（"重构整个 auth 模块"作为一个任务）会导致单个任务过于复杂，模型容易在中间步骤迷失方向。太细的粒度（"修改 login.ts 第 47 行的 if 语句"作为一个任务）会导致队列过长，编排成本高于执行成本。

合理的粒度是：每个任务涉及 1-5 个文件、有 1 个明确的执行目标、可以用 1-3 个命令验证。

### 实际示例

```markdown
# 任务队列：认证模块 Result 类型迁移

## Task 1: 创建 Result 类型和工具函数

**Goal:** 在 src/utils/result.ts 中创建 Result<T, E> 类型及 ok/err 工厂函数。

**Context:**
- src/utils/result.ts — 新建文件
- src/utils/errors.ts — 参考：现有的错误类型定义模式
- src/utils/index.ts — 需要导出 Result 相关类型

**Constraints:**
- Result<T, E> 类型仿照 Rust 的 Result 设计
- 不引入任何第三方库
- 类型必须导出并通过 src/utils/index.ts 统一导出

**Done-when:**
- [ ] pnpm typecheck 通过
- [ ] TypeScript 类型推导正确：`const r = ok(42)` 的类型被推导为 `Result<number, never>`

---

## Task 2: 迁移 auth 模块错误处理

**Goal:** 将 src/auth/login.ts 中所有 throw 语句替换为返回 Result 类型。

**Context:**
- src/auth/login.ts — 主文件，包含 3 个 throw 语句
- src/utils/result.ts — Task 1 创建的 Result 类型
- src/__tests__/auth/login.test.ts — 现有测试

**Constraints:**
- 只修改 src/auth/login.ts
- 不修改函数的参数列表，只修改返回类型（从 `T` 变为 `Result<T, AuthError>`）
- 不修改测试文件中的测试用例（测试应该不需要修改就能通过）
- 不修改 src/auth/ 下的其他文件

**Done-when:**
- [ ] src/auth/login.ts 中不包含任何 throw 语句（用 grep 验证）
- [ ] pnpm test -- src/__tests__/auth/ 全部通过
- [ ] pnpm lint && pnpm typecheck 通过

---

## Task 3: 迁移 payment 模块错误处理

**Goal:** 将 src/payment/service.ts 中所有 throw 语句替换为返回 Result 类型。

**Context:**
- src/payment/service.ts — 主文件
- src/utils/result.ts — Result 类型
- src/__tests__/payment/service.test.ts — 测试

**Constraints:**
- 只修改 src/payment/service.ts
- 返回类型从 `Promise<T>` 变为 `Promise<Result<T, PaymentError>>`
- 不修改测试文件
- 不修改 payment/handlers.ts（调用方会在后续任务中更新）

**Done-when:**
- [ ] grep -c "throw" src/payment/service.ts 返回 0
- [ ] pnpm test -- src/__tests__/payment/ 全部通过
- [ ] pnpm lint && pnpm typecheck 通过

---

## Task 4: 添加 Result 类型单元测试

**Goal:** 为 src/utils/result.ts 添加全面的单元测试。

**Context:**
- src/utils/result.ts — Task 1 创建的 Result 类型
- src/utils/__tests__/result.test.ts — 新建测试文件
- src/utils/errors.ts — 参考现有测试风格

**Constraints:**
- 测试风格与项目现有测试一致（参照 src/utils/__tests__/ 目录）
- 覆盖以下场景：ok 值、err 值、类型推导、嵌套 Result
- 不修改 src/utils/result.ts

**Done-when:**
- [ ] pnpm test -- src/utils/__tests__/result.test.ts 全部通过
- [ ] 测试覆盖 ok()、err()、isOk()、isErr()、unwrap()、map() 六个方法
- [ ] pnpm lint 通过
```

这个队列有 4 个任务。Task 1 是基础任务，Task 2/3/4 都依赖 Task 1 的产出，但彼此独立，可以并行执行。如果使用 `codex exec` 的非交互式批量执行能力，配合 git worktree 的并行隔离，可以用 2 个阶段串行完成全部 4 个任务。

### 队列与 Best-of-N 的结合

对于队列中的关键任务（成功率可能较低的任务），可以结合 Best-of-N 策略。在 codex exec 批量模式下，对同一个任务运行多次，选择最优结果：

```text
执行策略：
- Task 1: Best-of-1（创建类型文件，确定性高）
- Task 2: Best-of-3（涉及业务逻辑迁移，成功率为中等）
- Task 3: Best-of-3（同上）
- Task 4: Best-of-1（添加测试，确定性高）
```

## 四要素框架的边界

四要素框架不是一个万能公式。以下场景中它不是最优解：

**探索性任务。** 当你不确定要做什么、只是想了解代码库时，不需要四要素。用 Ask 模式让模型自由探索更合适。强行用四要素写一个"分析"任务会增加不必要的结构化开销。

```text
# 探索性任务不需要四要素，直接 Ask 即可
codex --ask "分析 src/payment/ 目录的模块结构和依赖关系"
```

**简单的一行修改。** 如果任务确实只需要改一行代码（修一个拼写错误、改一个硬编码的值），写一个完整的四要素模板是过度工程。直接说"把 src/config.ts 第 12 行的 API_URL 从 http 改成 https"就够了。

```text
# 简单修改不需要完整模板
codex "把 src/config.ts 中 API_BASE_URL 的值从 'http://api.example.com'
      改为 'https://api.example.com'。改完跑 pnpm typecheck 确认没类型错误。"
```

**连续对话中的后续任务。** 在一个会话中，如果你已经通过前几轮对话建立了上下文，后续任务不需要重复写 Context。模型已经在会话上下文中持有相关文件的内容。

```text
# 第一轮任务建立了上下文
用户：[完整的四要素任务描述]
模型：[执行完毕]

# 后续任务可以省略 Context，因为模型已经知道上下文
用户：好，现在用同样的方式修复 src/auth/logout.ts 中的类似问题。
模型：[基于已有上下文直接执行]
```

判断是否需要完整四要素的标准：

| 条件 | 需要完整四要素 | 可以简化 |
|------|-------------|---------|
| 涉及文件数 | 3 个以上 | 1-2 个 |
| 变更风险 | 可能影响其他模块 | 逻辑独立 |
| 会话上下文 | 新会话的第一条指令 | 基于已有上下文的后续任务 |
| 任务性质 | 明确的执行目标 | 探索或调查 |
| 验证要求 | 需要跑多个验证步骤 | 改完目视确认即可 |

## 总结

四要素框架的核心价值是**信息完整性**。一条任务指令包含 Goal、Context、Constraints、Done-when 四个要素时，模型不需要猜测意图、不需要搜索文件、不需要判断边界、不需要决定何时停止。它只需要按照指令执行，然后验证结果。

这四个要素的优先级：

1. **Goal 优先。** 没有明确目标，其他三个要素毫无意义。
2. **Done-when 其次。** 没有完成条件，模型不知道何时停止，验证环节缺失。
3. **Context 再次。** 有 Goal 和 Done-when 但缺少 Context，模型需要多花几轮搜索文件，但仍能完成任务。
4. **Constraints 最后。** 没有 Constraints 模型仍能执行，只是可能过度修改。风险是可控的，可以通过 git diff 事后检查。

实际使用中，先确保 Goal 和 Done-when 写清楚，再补充 Context 和 Constraints。这比试图一次性写一个完美的四要素描述更务实。

四要素与 AGENTS.md 的分工要牢记：AGENTS.md 写项目级别的永久性常识（构建命令、目录结构、编码规范），四要素写任务级别的临时性信息（具体文件、具体 bug、具体约束）。两者互补，不要重复。
