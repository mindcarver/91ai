# 计划优先工作流

> 更新日期：2025/06

**TL;DR：** 动手之前先让 Claude Code 出计划。按 `Shift+Tab` 切到 plan 模式（或用 `/plan` 命令），它会只读代码、分析结构、列出步骤，但不动任何文件。看完计划、确认方向，再切回默认模式执行。大改动、跨模块修改、不确定影响范围的任务——都应该先 plan。

## 为什么需要"先计划再动手"

直接让 Claude Code 改代码，三种常见翻车：

1. **改了不该改的。** 你说"优化一下数据库查询"，它把 DAO 层重写了一遍，连带着改了 5 个 service 文件。你只想优化一个慢查询，结果触发了全面回归测试。
2. **方向跑偏。** 你说"加个缓存"，它选了一个和你项目架构不搭的缓存方案，改了 10 个文件后你才发现方向不对，但代码已经改了一大堆。
3. **上下文浪费。** 大改动分好几步，Claude Code 在第一步就改了 8 个文件，上下文窗口被文件内容占满，后面几步的质量直线下降。

这三个问题的根源一样：**没有在看清楚全貌之前就动手。** 计划模式就是强制 Claude Code 先看、再想、最后再改。

## 什么是 plan 模式

plan 模式是 Claude Code 的一种权限模式。在这个模式下，Claude Code 只能执行只读操作（读文件、搜索代码），不能编辑文件、不能执行有副作用的命令。

### 进入 plan 模式

三种方式：

| 方式 | 操作 | 适用场景 |
|------|------|---------|
| Shift+Tab | 在输入框按 Shift+Tab，循环选择到 plan | 临时切换，最常用 |
| `/plan` | 在输入框输入 `/plan` 加上你的需求 | 快捷命令，一次性 plan |
| 启动参数 | `claude --permission-mode plan` | 一开始就锁定为只读 |

`Shift+Tab` 会循环切换四种模式：default → plan → autoEdits → auto。切到 plan 就行。

### plan 模式下能做什么、不能做什么

| 操作 | plan 模式 | default 模式 |
|------|----------|-------------|
| 读取文件 | 可以 | 可以 |
| 搜索代码 | 可以 | 可以 |
| 列出目录 | 可以 | 可以 |
| 执行只读命令（git log、npm list） | 可以 | 可以 |
| 编辑文件 | 不可以 | 需要确认 |
| 执行写操作命令 | 不可以 | 需要确认 |

在 plan 模式下，Claude Code 的所有工具调用都限制在只读范围内。即使它想改文件也改不了——权限不够。

## 什么时候用 plan 模式

不是所有任务都需要先 plan。判断标准：

| 场景 | 是否先 plan | 原因 |
|------|------------|------|
| 改一个函数的实现 | 不需要 | 影响范围小，直接改 |
| 修一个明确的 bug | 不需要 | 有报错信息定位，直接修 |
| 跨模块重构 | 需要 | 影响多个文件，需要先看依赖 |
| 新功能涉及 3+ 文件 | 需要 | 需要了解当前架构再决定怎么加 |
| 不确定改动范围 | 需要 | 先摸底，再动手 |
| 分析性能问题 | 需要 | 纯分析任务，本来就不该改代码 |
| 代码 review | 需要 | 只读操作 |

简单判断：**改动涉及 3 个以上文件，或者你不确定要改几个文件，就先 plan。**

## plan 模式怎么用

### 第一步：切到 plan 模式，描述你的需求

```text
按 Shift+Tab，切到 plan 模式。

然后输入：
我想把用户认证从 session 改成 JWT。
先帮我分析当前认证流程涉及的文件和依赖关系，
列出需要改动的模块，以及推荐的改动顺序。
```

plan 模式下，Claude Code 会：
1. 搜索项目中和认证相关的文件
2. 阅读关键文件，理解当前实现
3. 分析依赖关系
4. 给出改动计划和顺序

但它不会改任何文件。你看到的是一份分析报告，不是代码 diff。

### 第二步：审查计划

Claude Code 给出的计划通常包含这些内容：

```text
分析结果：

当前认证流程：
1. 用户登录 → POST /api/login
2. 服务端验证密码 → 创建 session → 返回 session cookie
3. 后续请求携带 cookie → session 中间件验证

涉及的文件（6 个）：
- src/middleware/auth.ts — session 验证中间件
- src/routes/login.ts — 登录路由
- src/services/session.ts — session 管理
- src/config/auth.ts — 认证配置
- src/utils/cookies.ts — cookie 工具
- tests/auth/ — 认证测试

推荐的改动顺序：
1. 先在 src/services/ 新建 jwt.ts（JWT token 签发和验证）
2. 修改 src/middleware/auth.ts（从验证 session 改为验证 JWT）
3. 修改 src/routes/login.ts（从返回 cookie 改为返回 token）
4. 更新测试
5. 删除旧的 session 相关代码（最后一步）

风险点：
- 已登录用户的 session 会失效，需要迁移方案
- cookie.ts 被其他模块引用，不能直接删除
```

### 第三步：评估计划

看计划时关注这几件事：

- **文件数量是否合理。** 你预估改 5 个文件，它列了 15 个——要么分析过度，要么你的预估不准。搞清楚是哪种。
- **改动顺序是否合理。** 应该先改底层再改上层。如果它先改路由再改中间件，顺序可能有问题。
- **风险点是否遗漏。** 你知道的坑（比如线上兼容性），它不一定知道。补充给它。
- **是否需要拆成多个会话。** 改动量特别大时，不要指望一次干完。按阶段拆，每阶段一个会话。

### 第四步：补充约束，切回 default 模式执行

确认计划没问题后，加上具体约束再执行：

```text
按 Shift+Tab 切回 default 模式。

按照刚才的计划执行阶段 1：
在 src/services/ 新建 jwt.ts，实现 token 签发和验证。

要求：
- 只新建这一个文件
- 不修改任何现有文件
- 不删除任何代码
- 先装 jsonwebtoken 依赖（如果还没装的话）
- 写完后展示完整文件内容让我确认
```

"只新建这一个文件"、"不修改任何现有文件"——这些约束在计划模式下不需要，因为 plan 模式本来就改不了文件。但切回 default 模式后，约束必须跟上。

## 大改动的分阶段执行

改动量大时，按阶段推进。每个阶段都是一次"plan → review → execute"循环。

### 分阶段模板

```text
现在是阶段 1 / 共 3 阶段。
按 Shift+Tab 切到 plan 模式。

阶段 1 目标：新建 JWT 服务
请确认：
1. 当前 src/services/ 目录下有哪些文件
2. 项目是否已有 jsonwebtoken 或类似的 JWT 库
3. 现有的 session.ts 暴露了哪些接口（JWT 服务需要兼容这些接口签名）

只分析，不改代码。
```

完成分析后：

```text
按 Shift+Tab 切回 default 模式。

执行阶段 1：新建 src/services/jwt.ts。
按照刚才分析的接口签名来写。
只创建这一个文件。
```

每个阶段完成后提交一次 commit，然后进入下一阶段。这样即使中途翻车，最多损失一个阶段的改动。

### 什么时候可以跳过 plan

阶段 2、阶段 3 如果改动内容和阶段 1 的计划一致，而且阶段 1 执行顺利，可以适当简化 plan 步骤。在 default 模式下直接执行，但保持"每次只做一件事"的约束。

## 一个完整的例子

**场景：** 你想把 Express 项目从 CommonJS (`require`) 迁移到 ESM (`import`)。

**第一步——plan：**

```text
按 Shift+Tab → plan 模式。

我想把项目从 CommonJS 迁移到 ESM。
先帮我分析：
1. package.json 当前有没有 "type": "module"？
2. 有多少文件用了 require()？
3. 有没有 __dirname、__filename 等只在 CommonJS 下可用的变量？
4. 依赖的第三方包是否都支持 ESM？

列出所有需要改动的文件，以及推荐的迁移顺序。
只分析，不改代码。
```

Claude Code 返回分析：

```text
分析结果：

1. package.json 没有 "type": "module"
2. 共 23 个文件使用 require()
3. 7 个文件使用了 __dirname 或 __filename
4. 依赖的 mysql2、lodash 支持 ESM；node-fetch v3+ 是纯 ESM

推荐顺序：
阶段 1：package.json 加 "type": "module"，改入口文件
阶段 2：工具文件迁移（src/utils/，6 个文件）
阶段 3：路由文件迁移（src/routes/，9 个文件）
阶段 4：中间件和服务层（src/middleware/ + src/services/，5 个文件）
阶段 5：测试文件（tests/，3 个文件）
阶段 6：清理 CommonJS 兼容代码

风险：node-cron v3 是纯 ESM，当前用的 v2 是 CommonJS。
升级可能需要改 cron 任务初始化方式。
```

**第二步——评估：**

你看了分析，发现阶段 1 涉及入口文件改动，风险最高。让 Claude Code 细化阶段 1：

```text
继续 plan 模式。
细化阶段 1：
1. 阅读 src/index.js（入口文件），列出所有 require() 调用
2. 分析哪些 require 可以直接改成 import
3. 哪些需要特殊处理（动态 require、条件导入等）
```

**第三步——执行阶段 1：**

```text
按 Shift+Tab → default 模式。

执行阶段 1：
1. package.json 加 "type": "module"
2. src/index.js 的 require 改成 import
3. 只改这两个文件
4. 改完后展示 diff

不改其他文件。不改测试文件。
```

确认 diff 没问题后提交：

```text
提交阶段 1 的改动。
commit message: "chore: add ESM module type and convert entry file"
只包含 package.json 和 src/index.js。
```

**第四步——循环推进阶段 2-6。**

每个阶段重复：plan → review → execute → commit。

## plan 模式和"先读后写"原则的关系

系列第 46 篇讲了"先读后写"原则——改代码之前先读文件。plan 模式是这个原则的强化版：

- **先读后写**是习惯层面的约束：提醒你在改代码前让 Claude Code 先读相关文件
- **plan 模式**是机制层面的约束：强制 Claude Code 只能读、不能写，读完之后给你一份分析报告

两者配合使用：plan 模式保证了先读，你的审查保证了方向正确，然后切回 default 模式执行。比单靠"先读后写"习惯更可靠。

## 常见问题

**Q：plan 模式会不会浪费 token？**

会多花一些 token 在分析上，但省下的 token 比浪费的多。没有计划时，Claude Code 可能改错方向，那些改了又撤回的操作消耗的 token 远远超过一次 plan。改错 3 个文件然后 `/rewind` 回退，比先 plan 再改多花 2-3 倍 token。

**Q：小改动也需要 plan 吗？**

不需要。改一个函数、修一个明确的 bug、加一个简单的验证——这些直接做。plan 模式用于改动范围不确定或跨多文件的情况。

**Q：plan 模式下 Claude Code 给的分析不准确怎么办？**

让它补充细节。"你漏了 src/cache/ 目录下的文件"、"这个模块还有 Redis 依赖，你分析的时候没提到"。plan 模式的好处是你可以反复追问，直到分析完整，因为不改代码所以没有副作用。

**Q：切回 default 模式后，Claude Code 会忘记刚才的计划吗？**

不会。plan 模式下的对话历史仍然在上下文里。切回 default 后继续说"按照刚才的计划执行阶段 1"，它能接上。但如果 plan 阶段对话特别长，切回 default 后可以先 `/compact` 压缩一下，保留计划要点。

**Q：`/plan` 命令和 Shift+Tab 切 plan 模式有什么区别？**

效果一样，都是进入 plan 权限模式。`/plan` 是命令形式的快捷入口，Shift+Tab 是通用模式切换。用哪个都行。

## 关键要点

1. **改动涉及 3+ 文件或范围不确定时，先 plan**：强制只读，避免方向跑偏后浪费 token 和时间
2. **进入 plan 模式用 Shift+Tab 或 `/plan`**：Claude Code 只能读文件和搜索，不能改任何东西
3. **plan 阶段关注四件事**：文件数量、改动顺序、风险点、是否需要拆分多个会话
4. **切回 default 执行时要加约束**："只改这个文件"、"不碰其他模块"、"展示 diff"
5. **大改动分阶段推进**：每个阶段都是 plan → review → execute → commit 的循环
6. **每个阶段提交一次 commit**：翻车时最多回退一个阶段，不用从头来
7. **plan 模式和先读后写原则互补**：plan 是机制保障，先读后写是日常习惯，两者结合最安全

## 延伸阅读

- 系列第 28 篇「交互模式基础操作」——Shift+Tab 切换模式的操作细节
- 系列第 43 篇「Permission Modes 全解」——四种权限模式的完整说明
- 系列第 46 篇「先读后写原则」——改代码前的文件阅读策略
- 系列第 31 篇「`/compact` 与上下文压缩」——plan 阶段对话太长时的处理方法
- 系列第 53 篇「修 Bug 标准流程」——修 bug 场景下 plan 和执行怎么配合
- 系列第 54 篇「重构流程」——重构场景的分阶段 plan 策略
- [Claude Code Best Practices](https://code.claude.com/docs/en/best-practices) -- 官方推荐的计划优先工作流

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
