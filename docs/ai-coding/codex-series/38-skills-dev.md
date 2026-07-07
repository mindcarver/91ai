<!--
调研来源（不发布，仅记录）：
1. OpenAI Codex 源码 openai/codex — codex-skills/src/assets/samples/skill-creator/SKILL.md 技能创建规范
2. OpenAI Codex 源码 openai/codex — core-skills/src/loader.rs 技能加载与发现
3. OpenAI Codex 源码 openai/codex — core-skills/src/injection.rs 技能注入与 $mention 语法
4. OpenAI Codex 源码 openai/codex — core-skills/src/render.rs 技能渲染与 token 预算
5. OpenAI Codex 源码 openai/codex — core-skills/src/model.rs 技能元数据模型
6. OpenAI Codex 源码 openai/codex — core-skills/src/invocation_utils.rs 隐式调用检测
7. zread.ai/openai/codex/11-skills-framework — 技能框架完整架构文档
版本基准: 2026 年 6 月
-->

# Codex CLI Skills 技能开发：把领域知识打包成可复用指令

> TL;DR：技能（Skill）是 Codex 的知识注入机制——一个文件夹里放一个 SKILL.md 文件，写清楚"这个领域该怎么做"，Codex 在遇到相关任务时就会按你的规矩来。技能有四个发现路径（系统级、用户级、项目级、管理员级），支持显式调用（`$skill-name`）和隐式触发两种激活方式。本文从技能结构设计、元数据编写、指令内容组织到实战案例，走完从"想写一个技能"到"技能跑起来"的全流程。

---

## 1. 技能解决什么问题

你用 Codex 做项目开发，很快会发现一个模式：每次让它做某类工作时，你都在重复输入同样的约束条件。比如写前端组件时，你反复说"用函数式组件、用 Tailwind 做样式、props 用 TypeScript 接口定义"。做数据库迁移时，你反复说"先生成 migration 文件、确认是 additive 的、然后跑测试"。

这些重复信息有两个问题：一是浪费 token——每次对话都要输入一遍；二是不一致——有时候忘了说某个约束，Codex 就按默认方式做了。

技能的本质是**可复用的领域知识包**。你把"前端组件怎么写"这件事一次性写清楚，存成一个 SKILL.md 文件。以后需要 Codex 做前端工作时，引用这个技能，它会自动获得完整的上下文——不用你重复解释。

和 MCP 服务器相比，技能不提供"能力"（工具），它提供"知识"（指令）。MCP 服务器让 Codex 能调用 GitHub API，技能告诉 Codex "调用 GitHub API 创建 issue 时，标题格式要这样写"。两者互补。

## 2. 技能的结构

### 2.1 文件组织

一个技能就是一个目录，核心是 `SKILL.md` 文件。完整的技能目录结构：

```
skill-name/
├── SKILL.md                  # 必需：技能的元数据和指令内容
├── agents/
│   └── openai.yaml           # 推荐：UI 元数据（显示名、图标等）
├── scripts/                  # 可选：可执行脚本
├── references/               # 可选：按需加载的参考文档
└── assets/                   # 可选：模板、图片等资源文件
```

最简单的技能只需要 `SKILL.md` 一个文件。其他目录是可选的，按需添加。

### 2.2 SKILL.md 的两部分

`SKILL.md` 分为两个区域，用 `---` 分隔：

```markdown
---
name: frontend-react
description: React 前端组件开发规范。当你需要创建 React 组件、编写前端页面、处理 UI 交互时使用此技能。涵盖组件结构、样式方案、状态管理、TypeScript 类型定义。
---

# React 前端组件开发规范

## 技术栈约定
- React 18+ 函数式组件 + hooks
- TypeScript 严格模式
- Tailwind CSS 做样式（不用 CSS Modules）
- ...

## 组件结构
...
```

`---` 之间的 YAML 是**前置元数据**（frontmatter），包含 `name` 和 `description` 字段。`---` 之后是 Markdown 正文，包含具体的指令内容。

这个分离设计有明确的目的：

- **元数据**始终在上下文中（约 100 词），Codex 用它判断什么时候该用这个技能
- **正文**只在技能被触发时加载（建议不超过 500 行），包含具体的操作指令
- **引用文件**在需要时才读取（无 token 限制，因为脚本可以直接执行）

这就是 Codex 技能框架的**渐进式披露**设计——根据需要逐层加载信息，避免一次性塞满上下文。

### 2.3 元数据字段

前置元数据的 YAML 字段：

| 字段 | 必需 | 说明 |
|------|------|------|
| `name` | 是 | 技能标识符，最长 64 字符。省略时从目录名自动推导 |
| `description` | 是 | 决定技能在什么时候触发，最长 1024 字符。要写得清晰全面 |
| `metadata.short-description` | 否 | UI 芯片上显示的简短描述，最长 1024 字符 |

`description` 字段是技能调度的关键。Codex 根据它来判断用户的请求是否匹配某个技能。写得越具体，触发越准确。含糊的描述（比如"前端开发辅助"）会导致不该触发的时候触发。

### 2.4 UI 元数据（openai.yaml）

`agents/openai.yaml` 提供面向 TUI 的显示信息：

```yaml
interface:
  display_name: "React 前端组件"
  short_description: "React 组件开发规范"
  icon_small: "icons/react-sm.svg"
  icon_large: "icons/react-lg.svg"
  brand_color: "#61DAFB"
  default_prompt: "帮我创建一个新的 React 组件"

policy:
  allow_implicit_invocation: true    # 允许隐式触发
  products: []                       # 空列表 = 所有产品可用

dependencies:
  tools: []                          # 工具依赖（MCP 工具等）
```

关键字段：

- `policy.allow_implicit_invocation`：控制技能是否能被隐式触发。默认 `true`。设为 `false` 则只能通过显式 `$skill-name` 调用
- `policy.products`：产品门控。可以限制技能只在特定产品中可用（如 `chatgpt`、`codex`）。空列表表示不限
- `default_prompt`：在 TUI 中选中技能时，自动填入的提示词模板

## 3. 技能的发现路径

Codex 从多个位置发现技能，每个位置对应一个**作用域**（scope），决定了优先级和可见性：

| 作用域 | 来源路径 | 优先级 | 说明 |
|--------|---------|--------|------|
| **Repo（项目级）** | `.agents/skills/`（在项目树中） | 最高 | 项目专属技能，从项目根目录向 cwd 方向搜索 |
| **User（用户级）** | `$CODEX_HOME/skills/`、`$HOME/.agents/skills/`、插件贡献 | 中 | 用户安装的技能和插件自带的技能 |
| **System（系统级）** | `$CODEX_HOME/skills/.system/`（内置） | 低 | Codex 自带的技能 |
| **Admin（管理员级）** | `/etc/codex/skills/` | 最低 | 系统管理员部署的技能 |

当同名技能出现在多个作用域时，优先级高的胜出。所以项目级技能可以覆盖用户级技能，用户级技能可以覆盖系统级技能。

Codex 在发现技能时会做 BFS 遍历，扫描深度限制为 6 层，每个根目录最多扫描 2000 个子目录。以 `.` 开头的目录会被跳过，symlink 在 System 作用域下不跟随。

### 实际的目录布局

```
# 用户级技能（所有项目可用）
~/.codex/skills/
├── rust-expert/
│   └── SKILL.md
├── code-review/
│   └── SKILL.md
└── .system/           # 内置系统技能
    ├── skill-creator/
    └── imagegen/

# 项目级技能（仅当前项目）
my-project/
├── .agents/
│   └── skills/
│       ├── api-convention/
│       │   └── SKILL.md
│       └── db-migration/
│           ├── SKILL.md
│           └── scripts/
│               └── validate_migration.py
```

项目根目录由 `project_root_markers` 配置决定（默认是 `.git`）。Codex 从项目根目录向下搜索，检查每个子目录是否有 `.agents/skills/` 子目录。

## 4. 技能的激活方式

### 4.1 显式调用（`$mention`）

在输入中使用 `$技能名` 语法来显式调用技能：

```
$frontend-react 帮我创建一个用户列表页面，支持搜索和分页
```

Codex 的注入引擎会扫描输入文本，提取 `$` 后面的名称，匹配到对应的 SKILL.md 后，把文件内容注入到发给模型的上下文中。

也可以通过 Markdown 链接语法：

```
[$frontend-react](skill://.agents/skills/frontend-react/SKILL.md) 帮我创建用户列表页
```

显式调用有一个重要规则：**同名技能不会自动激活**。如果多个技能有相同的 `name` 字段，`$skill-name` 会被跳过，避免错误激活。这时候需要用路径语法或 `/skills` 命令来选择。

在 TUI 中输入 `/skills` 会弹出技能选择器，你可以浏览所有已发现的技能，选中后 Codex 会把它标记为"已提及"。

### 4.2 隐式触发

即使你不用 `$mention`，Codex 在运行过程中也可能自动激活技能。隐式触发基于两种检测路径：

| 检测路径 | 触发条件 | 示例 |
|---------|---------|------|
| **脚本运行** | Agent 执行的命令涉及技能的 `scripts/` 目录 | `python .agents/skills/db-migration/scripts/validate.py` |
| **文档读取** | Agent 读取的文件在技能目录中 | `cat .agents/skills/api-convention/references/headers.md` |

比如你的 `db-migration` 技能有一个 `scripts/validate_migration.py` 脚本，当 Codex 运行这个脚本时，技能会自动激活，它的指令内容会被注入到上下文中。

隐式触发是 opt-out 的——默认开启。如果想禁用某个技能的隐式触发，在 `agents/openai.yaml` 中设置：

```yaml
policy:
  allow_implicit_invocation: false
```

或者通过配置规则禁用：

```toml
[skills]
[[skills.config]]
name = "db-migration"
enabled = false
```

### 4.3 注入流程

技能被触发后，注入流程经历几个步骤：

1. **收集提及**：`collect_explicit_skill_mentions()` 函数遍历用户输入，提取 `$skill-name` 和结构化选择
2. **解析匹配**：先按路径精确匹配，再按名称匹配（名称匹配只在无歧义时生效）
3. **读取内容**：`build_skill_injections()` 异步读取每个被选中技能的 SKILL.md 正文
4. **注入上下文**：文件内容作为 `SkillInjection` 项插入到最终的提示词中

每个注入都会产生遥测数据（`codex.skill.injected` 指标），方便追踪技能使用情况。

## 5. 技能内容的编写原则

### 5.1 核心原则

Codex 内置的 `skill-creator` 技能本身就是最好的写作参考。从中提炼的核心原则：

**保持简洁**。上下文窗口是共享资源。只写 Codex 不知道的信息。每写一段，问自己："这段内容值得占用 token 吗？"

**设定适当的自由度**。根据任务的脆弱程度调整指令的具体程度。灵活性高的任务给文本指令（"使用函数式组件"），脆弱度高的任务给具体脚本（"运行 `scripts/validate.py` 验证"）。把 Codex 想象成在探索一条路径——窄桥需要护栏，开阔地可以自由行走。

**使用渐进式披露**。SKILL.md 控制在 500 行以内。详细内容拆到 `references/` 目录，在 SKILL.md 中明确说明什么时候加载哪个文件。按领域或框架变体组织，让 Codex 只加载需要的部分。

**不要创建辅助文档**。不需要 `README.md`、`CHANGELOG.md`、`INSTALLATION_GUIDE.md`。技能目录里只放 AI Agent 执行任务所需的东西。

### 5.2 指令组织结构

一个结构良好的 SKILL.md 正文通常包含这些部分：

```markdown
---
name: api-convention
description: API 接口开发规范。涵盖路由定义、请求验证、错误处理、响应格式、认证中间件。当需要创建或修改 API 端点时使用。
---

# API 接口开发规范

## 基本约定
- 使用 tRPC 定义路由
- 输入验证用 zod schema
- 错误响应统一格式

## 路由结构
src/trpc/routers/
├── user.ts      # 用户相关
├── auth.ts      # 认证相关
└── admin.ts     # 管理员操作

## 新建端点的步骤
1. 在对应路由文件中定义 procedure
2. 输入用 .input(zodSchema) 验证
3. 业务逻辑写在 src/server/ 下
4. 错误用 TRPCError 抛出

## 错误处理模板
\```typescript
throw new TRPCError({
  code: "NOT_FOUND",
  message: "用户不存在"
});
\```

## 认证检查
需要认证的端点使用 isAuthed 中间件：
\```typescript
export const protectedProcedure = t.procedure
  .use(isAuthed);
\```

## 参考
- 完整的错误码列表见 references/error-codes.md
- 数据库 schema 参考 references/schema.md
```

几个要点：

- 每个部分用 `##` 标题分隔，方便 Codex 快速定位
- 代码示例用围栏代码块，具体到能直接复制粘贴的程度
- 参考文件用明确路径指引，不要让 Codex 猜
- "步骤"类的指令用有序列表，逻辑关系用无序列表

### 5.3 常见写法错误

| 错误 | 问题 | 修正 |
|------|------|------|
| 大段通用知识 | Codex 已经知道 React 是什么 | 只写项目特有的约定 |
| 模糊的指导 | "使用最佳实践" | 写出具体的模式和反模式 |
| 过多示例 | 10 个代码示例占满上下文 | 1-2 个代表性示例，其余放 references |
| 没有触发条件 | description 写得太笼统 | 具体说明适用场景 |
| 混合关注点 | 一个技能包含前端 + 后端 + 部署 | 按职责拆分多个技能 |

## 6. 实战案例

### 案例一：数据库迁移技能

技能目标：规范数据库 schema 变更流程，确保每次迁移都经过验证。

```
my-project/
└── .agents/
    └── skills/
        └── db-migration/
            ├── SKILL.md
            ├── scripts/
            │   └── validate_migration.py
            └── references/
                └── migration-checklist.md
```

**SKILL.md**：

```markdown
---
name: db-migration
description: 数据库 schema 迁移规范。当需要修改数据库表结构、添加字段、创建索引、修改约束时使用此技能。涵盖迁移文件生成、验证、回滚方案。
---

# 数据库迁移规范

## 工具
使用 Drizzle ORM + drizzle-kit 管理迁移。

## 迁移步骤
1. 修改 src/db/schema/ 中对应的 schema 文件
2. 运行 `pnpm drizzle-kit generate` 生成迁移文件
3. 检查生成的 SQL 文件，确认是 additive 的（只增不减）
4. 如果需要删除列或表，必须先创建过渡迁移
5. 运行验证脚本：`python .agents/skills/db-migration/scripts/validate_migration.py <migration-file>`
6. 验证通过后运行 `pnpm drizzle-kit migrate`

## 验证要求
- 新增字段必须 nullable 或有默认值
- 不允许直接删除已存在的列
- 索引创建必须带 CONCURRENTLY 关键字（避免锁表）
- 每个迁移文件只能做一件事

## 回滚方案
每个迁移文件头部注释中写明回滚 SQL：
\```sql
-- rollback: ALTER TABLE users DROP COLUMN new_column;
\```

## 参考
- 完整检查清单见 references/migration-checklist.md
```

**validate_migration.py**：

```python
#!/usr/bin/env python3
"""迁移文件验证脚本"""
import sys
from pathlib import Path

def validate(migration_path: str) -> tuple[bool, list[str]]:
    errors = []
    content = Path(migration_path).read_text()

    # 检查是否包含回滚注释
    if "-- rollback:" not in content:
        errors.append("缺少回滚 SQL 注释（-- rollback: ...）")

    # 检查是否有 DELETE/TRUNCATE（危险操作）
    for line in content.split("\n"):
        line_lower = line.strip().lower()
        if any(kw in line_lower for kw in ["delete from", "truncate", "drop table"]):
            if "-- rollback:" not in content[:content.index(line)]:
                errors.append(f"检测到危险操作: {line.strip()}")

    return len(errors) == 0, errors

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python validate_migration.py <migration-file>")
        sys.exit(1)

    ok, errors = validate(sys.argv[1])
    if ok:
        print("验证通过")
    else:
        for e in errors:
            print(f"错误: {e}")
        sys.exit(1)
```

使用时，只需要在提示中提及数据库迁移相关的任务，技能的隐式触发机制会在 Codex 执行 `validate_migration.py` 脚本时自动激活。或者显式调用：

```
$db-migration 给 users 表增加 phone_number 字段，类型 varchar(20)，允许为空
```

### 案例二：代码审查技能

技能目标：规范代码审查的检查项和输出格式。

```
~/.codex/skills/
└── code-review/
    └── SKILL.md
```

**SKILL.md**：

```markdown
---
name: code-review
description: 代码审查规范。当需要审查 PR diff、检查代码质量、评估架构变更时使用。涵盖安全检查、性能评估、代码风格、测试覆盖。
---

# 代码审查规范

## 审查流程
1. 先读变更文件列表，确认影响范围
2. 逐文件审查 diff，按下面的检查清单
3. 最后给出总结：通过/需修改/需讨论

## 检查清单

### 安全（一票否决）
- [ ] 是否有硬编码的密钥、token、密码
- [ ] SQL 查询是否使用参数化
- [ ] 用户输入是否经过验证和转义
- [ ] 权限检查是否到位

### 性能
- [ ] 是否有 N+1 查询
- [ ] 是否有不必要的数据库查询（可以用缓存）
- [ ] 循环内是否有可以提前计算的值

### 代码质量
- [ ] 函数是否超过 30 行（拆分）
- [ ] 是否有重复逻辑（抽象）
- [ ] 错误处理是否完整
- [ ] 类型定义是否准确（不允许 any）

### 测试
- [ ] 是否覆盖了变更的功能点
- [ ] 边界条件是否测试到
- [ ] 是否有 mock 不当导致的无效测试

## 输出格式
\```
## 审查结果：[通过 | 需修改 | 需讨论]

### 安全
[检查结果]

### 性能
[检查结果]

### 代码质量
[检查结果]

### 测试
[检查结果]

### 总结
[一句话总结]
\```
```

这个技能放在用户级目录 `~/.codex/skills/`，所有项目都可以使用：

```
$code-review 审查当前分支的改动
```

### 案例三：技能的启用与禁用

如果你有一个技能想暂时不用，不用删除文件——在 config.toml 中禁用即可：

```toml
# ~/.codex/config.toml
[skills]
[[skills.config]]
name = "code-review"
enabled = false

[[skills.config]]
path = "/home/user/.codex/skills/custom/experimental/SKILL.md"
enabled = true
```

规则可以按名称或路径指定。按路径的规则优先级高于按名称的规则。

## 7. Token 预算与渲染

技能元数据渲染到系统提示词中时，受 token 预算约束。默认预算是**模型上下文窗口的 2%**，如果上下文窗口大小未知，回退到 8000 字符。

当技能元数据总量超出预算时，渲染器按三级策略逐级裁剪：

1. **完整渲染**：所有技能带完整描述
2. **截断描述**：保留所有技能名称和路径，描述按比例缩短
3. **最小渲染**：只保留名称和路径，描述全部丢弃；如果还超预算，去掉最低优先级的技能

这是一个自动过程，你通常不需要关心。但如果你发现技能经常被截断或省略，说明要么技能数量太多，要么描述写得太长。精简技能数量，把低频技能合并或删除。

## 8. 常见问题

**技能和 AGENTS.md 有什么区别？**

AGENTS.md 是项目级指令文件，Codex 每次启动都会自动读取，适合放项目级别的通用规则。技能是任务级别的知识包，按需加载，适合放特定领域的方法论。一个项目可以有一个 AGENTS.md（全局规则）加多个技能（各领域规范）。

**技能内容会被 Codex 修改吗？**

不会。技能文件是只读的——Codex 读取 SKILL.md 的内容注入到上下文中，但不会修改文件本身。只有你在外部编辑 SKILL.md 才能改变技能内容。

**技能能在多个项目间共享吗？**

可以。放在用户级目录 `~/.codex/skills/` 的技能对所有项目可见。放在项目级 `.agents/skills/` 的只对当前项目可见。如果同一技能在两个位置都存在，项目级优先。

**技能和 MCP 工具怎么配合？**

技能告诉 Codex "该怎么做"，MCP 工具让 Codex "能做到什么"。技能中可以引用 MCP 工具——比如数据库迁移技能可以指示 Codex 使用某个 MCP 工具来检查迁移状态。在 `agents/openai.yaml` 的 `dependencies.tools` 中声明工具依赖。

## 9. 下一步

- 用 `/skills` 命令浏览 Codex 内置的系统技能，学习它们的写作风格
- 为你最常重复输入的指令创建第一个技能
- 把项目特有规范写成技能提交到 `.agents/skills/`，让团队共享
- 阅读本系列下一篇：《Codex CLI Hooks 钩子机制》

---

**延伸阅读**

- [Codex 技能框架](https://zread.ai/openai/codex/11-skills-framework) — 技能发现、加载、渲染、注入的完整架构文档
- [Codex 插件系统](https://zread.ai/openai/codex/12-plugin-system) — 插件如何贡献技能、技能的打包与分发
- [Codex 提示词工程](https://zread.ai/openai/codex/19-prompt-engineering-and-context) — 技能注入在上下文管道中的位置
- [MCP 协议规范](https://modelcontextprotocol.io) — 技能可以和 MCP 工具配合使用
