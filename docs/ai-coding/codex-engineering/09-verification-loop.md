# 验证循环：从任务定义到结果确认的闭环

**TL;DR：** "生成代码然后祈祷它能工作"是 AI 编码最常见的失败模式。Codex 生成的代码在语法层面通常正确，但在语义层面——业务逻辑、边界条件、类型约束——经常出现隐蔽问题。验证循环的核心做法是把 lint、typecheck、test、review 四个阶段嵌入 Agent Loop，让模型在每次代码修改后自动执行校验，形成"生成 → 验证 → 修复 → 再验证"的闭环。这套循环的配置入口是 AGENTS.md 的 Commands 段和 Working Rules 段，验证命令通过 shell_command 工具执行。不同生态系统的验证命令不同，不同任务的验证深度也不同——关键是区分哪些场景可以信任自动验证，哪些必须引入人工审查。

---

## 为什么"生成然后祈祷"行不通

先看一个典型场景。你给 Codex 一条指令：

```text
"修复 auth/login.ts 中 token 过期后缓存未清除的问题"
```

模型读完代码，用 apply_patch 修改了两个位置，输出"修复完成"。你打开文件看了一眼，修改逻辑看起来合理。你提交代码，推到远端。15 分钟后 CI 红灯亮了——tsc 类型检查失败，因为模型新增的 clearCache 调用传了一个不存在的参数。你修了类型错误再推，CI 又红了——三个单元测试挂了，因为 clearCache 的调用时机不对，导致正常登录流程的缓存也被清掉了。你又改了调用条件，再推，CI 绿了，但 code review 被打回来——新加的代码没有错误处理，如果 clearCache 抛异常，整个登录流程就断了。

这个场景的真实问题不是模型的代码生成能力不够。模型的修改"看起来对"，但在三个维度上存在问题：类型约束（传了不存在的参数）、行为正确性（缓存清除的时机不对）、健壮性（缺少错误处理）。每个维度的问题都只有特定的验证手段才能发现——类型检查发现第一个，测试发现第二个，代码审查发现第三个。

"生成然后祈祷"的本质是：模型生成代码后没有执行任何验证就宣布完成，把所有质量检查推给了下游的 CI 和人工审查。每多一轮 CI 失败和修复，就多消耗 15 分钟以上的等待时间，加上人工介入的认知上下文切换成本。对于高频使用 Codex 的团队，这种浪费累积起来是一个可观的数字。

解决方案是把验证从"事后检查"前移到"代码生成的紧后序"。模型修改完代码后，立即在本地执行一套验证流程，确认代码在每个维度上都通过检查。只有全部通过，才认为任务完成。这就是验证循环。

## 验证链：四个递进式校验阶段

验证链由四个阶段组成，按严格顺序执行。每个阶段捕获不同类型的问题，前一阶段的漏网之鱼由后一阶段接住。

```text
代码修改完成
    |
    v
阶段 1：Lint        -- 捕获风格和格式问题
    |
    v
阶段 2：Typecheck   -- 捕获类型约束违反
    |
    v
阶段 3：Test        -- 捕获行为逻辑错误
    |
    v
阶段 4：Review      -- 捕获设计和架构问题
```

### 阶段一：Lint（代码风格与基本质量）

Lint 是验证链中成本最低、速度最快的检查。它不关心代码逻辑是否正确，只关心代码是否符合项目的风格规范和基本质量规则。

捕获范围：

- 代码格式问题：缩进、空格、换行、行宽
- 命名规范：变量、函数、类的命名风格
- 基本质量：未使用的变量、未使用的导入、console.log 残留
- 静态安全检查：eval 的使用、硬编码的密钥模式

典型工具与命令：

| 语言 | 工具 | 命令 |
|------|------|------|
| TypeScript / JavaScript | ESLint | `eslint src/ --max-warnings=0` |
| TypeScript / JavaScript | Biome | `biome check src/` |
| Python | Ruff | `ruff check .` |
| Python | Flake8 | `flake8 src/` |
| Go | golangci-lint | `golangci-lint run ./...` |
| Rust | Clippy | `cargo clippy -- -D warnings` |
| Java | Checkstyle | `./gradlew checkstyleMain` |

Lint 放在第一阶段的原因很简单：执行速度快，通常几秒内完成。一个连 Lint 都过不了的代码修改，没有必要进入后续更耗时的阶段。

Codex 执行 Lint 的典型循环：

```text
模型用 apply_patch 修改了 src/auth/login.ts
  -> 通过 shell_command 执行 pnpm lint
  -> ESLint 报告：第 42 行缺少分号、第 58 行有未使用的变量 'temp'
  -> 模型用 apply_patch 修复这两个问题
  -> 再次通过 shell_command 执行 pnpm lint
  -> 通过，进入阶段二
```

这个"修改 → 检查 → 修复 → 再检查"的循环是验证循环的基本运作模式。Codex 的 Agent Loop 天然支持这种迭代——模型在每轮循环中可以多次调用 shell_command 执行命令，根据命令输出的反馈调整代码，直到检查通过。

### 阶段二：Typecheck（类型约束检查）

类型检查验证代码的类型正确性。对于使用静态类型的语言，类型检查能捕获 Lint 无法发现的逻辑错误——函数参数不匹配、缺少必需属性、可能为 null 的值被直接访问。

捕获范围：

- 函数参数和返回值的类型匹配
- 可能为 null / undefined 的值的访问
- 接口实现的完整性
- 泛型的正确使用
- 模块间的类型兼容性

典型工具与命令：

| 语言 | 工具 | 命令 |
|------|------|------|
| TypeScript | tsc | `tsc --noEmit` |
| Python | mypy | `mypy .` |
| Python | pyright | `pyright src/` |
| Go | go vet | `go vet ./...` |
| Rust | cargo check | `cargo check` |
| Java | javac / Gradle | `./gradlew compileJava` |

Typecheck 放在 Test 之前的原因：类型错误通常意味着代码在运行时会直接崩溃。一个编译不过的程序去跑测试是浪费时间。

大型 monorepo 中的 tsc 执行时间可能超过 30 秒。这种情况下，可以在 AGENTS.md 中配置项目的增量类型检查命令（如 `pnpm typecheck`），而不是让模型直接调用 `tsc --noEmit`。

### 阶段三：Test（行为正确性验证）

测试是验证链的核心阶段。Lint 检查风格，Typecheck 检查类型，只有测试能验证代码的行为是否正确。

捕获范围：

- 单元测试：函数和方法级行为验证
- 集成测试：模块间交互的正确性
- 快照测试：UI 组件和序列化输出的稳定性
- 边界条件：空值、越界、并发场景

典型工具与命令：

| 语言 / 框架 | 工具 | 命令 |
|------------|------|------|
| TypeScript | Vitest | `vitest run` |
| TypeScript | Jest | `jest --passWithNoTests` |
| Python | pytest | `pytest -x` |
| Go | go test | `go test ./...` |
| Rust | cargo test | `cargo test` |
| Java | JUnit | `./gradlew test` |

测试范围的选择取决于修改的影响面。修改独立的工具函数只需跑对应测试文件；修改共享类型定义需要跑全量测试。这个策略应该在 AGENTS.md 中预先定义，而不是每次在 prompt 中手动指定。

### 阶段四：Review（变更审查）

Review 是唯一无法完全自动化的阶段。它的目标是捕获前三阶段无法发现的问题：设计合理性、架构一致性、安全性、变更范围控制。

捕获范围：

- 变更范围是否超出任务要求（过度修改）
- 是否引入了不必要的依赖
- 错误处理是否充分
- 安全敏感操作是否经过正确处理
- 代码是否符合项目的架构模式

一个函数可以通过 Lint、Typecheck 和 Test，但在设计上就是错的——比如在应该使用事件驱动的地方使用了轮询，或者在需要事务保护的地方缺少事务。这类问题只有审查才能发现。

在 Codex 工作流中，Review 通过 `git diff` 实现。模型在完成前三阶段验证后，通过 shell_command 执行 `git diff` 查看所有变更，检查是否有超出任务范围的修改。

## 自动验证循环模式

验证循环的核心运作模式是一个自动化的闭环：

```text
Codex 生成代码（通过 apply_patch）
       |
       v
  shell_command 执行验证命令
       |
       v
  验证通过？
    |
    +-- 是 --> 进入下一阶段或完成任务
    |
    +-- 否 --> 读取错误输出
                  |
                  v
              分析错误原因
                  |
                  v
              apply_patch 修复代码
                  |
                  v
              回到"执行验证命令"（重新开始循环）
```

这个循环的关键在于它是自动的。模型不需要人类介入就能完成"发现问题 → 修复问题 → 重新验证"的全过程。Codex 的 Agent Loop 在每轮迭代中决定下一步行动：如果验证失败，它会分析错误信息，决定是修改代码还是调整策略，然后用 apply_patch 修复，再通过 shell_command 重新验证。这个循环持续进行，直到所有验证通过或者达到循环次数上限。

### 一个完整的验证循环示例

以一个具体的任务为例，展示完整的自动验证循环过程：

```text
任务：在 src/api/users.ts 中添加分页查询接口

[Round 1]
  模型用 apply_patch 修改 src/api/users.ts，新增 GET /api/users 接口
  模型用 apply_patch 新增 src/__tests__/users.test.ts

  shell_command: pnpm lint
  结果：通过

  shell_command: pnpm typecheck
  结果：失败
  错误：users.ts:38 - 类型 'PaginationResult' 缺少 'totalPage' 属性

[Round 2]
  模型分析错误：返回值类型缺少 totalPage 字段
  apply_patch: 在 users.ts 中添加 totalPage 计算逻辑

  shell_command: pnpm lint
  结果：通过

  shell_command: pnpm typecheck
  结果：通过

  shell_command: pnpm test -- src/__tests__/users.test.ts
  结果：失败
  错误：expect(response.status).toBe(400) -- 期望 pageSize=0 返回 400，实际返回 200

[Round 3]
  模型分析错误：缺少 pageSize 参数验证
  apply_patch: 在接口中添加 pageSize <= 0 的参数校验

  shell_command: pnpm lint
  结果：通过

  shell_command: pnpm typecheck
  结果：通过

  shell_command: pnpm test -- src/__tests__/users.test.ts
  结果：5 个测试全部通过

  shell_command: git diff --stat
  结果：修改了 2 个文件（users.ts +67/-3, users.test.ts +82）
  确认变更范围符合预期

  任务完成
```

三轮循环，模型自行发现并修复了类型错误和参数验证遗漏。整个过程不需要人工干预。这就是验证循环的价值：把"发现问题 → 修复问题"的闭环交给模型自动完成。

### 为什么失败后要从头开始验证

注意上面的流程中，每次修复后都从 Lint 重新开始，而不是只重新执行失败的那个阶段。原因很简单：修复一个阶段的问题可能引入新的、前序阶段能发现的问题。比如修复 typecheck 错误时可能引入 lint 错误（少了一个分号），修复测试失败时可能引入类型错误（改了返回值的类型）。

从头开始确保每次修复后整个验证链都是干净的。这会增加一些验证命令的执行次数，但这些命令的执行成本远低于遗漏问题导致的返工成本。

## 在 Prompt 中嵌入验证条件

验证循环不应该只在 AGENTS.md 中配置，还应该在每条任务指令的完成条件中体现。这就是 Done-when（完成条件）的作用。

### Done-when 的写法

Done-when 定义什么样的结果算"完成"。它应该包含具体的、可客观验证的检查项。

差的 Done-when：

```text
完成条件：代码修改完成，测试通过
```

好的 Done-when：

```text
完成条件：
- pnpm lint 通过，无 warning
- pnpm typecheck 通过
- pnpm test -- src/api/users.test.ts 全部通过
- 新增测试覆盖：正常分页、page=0 的边界值、空结果集
- git diff 显示变更范围仅限于 src/api/users.ts 和测试文件
```

区别在于：差的 Done-when 使用模糊的"测试通过"，模型可以说"测试应该能通过"然后宣布完成。好的 Done-when 列出具体的命令和具体的期望结果，模型必须实际执行命令并确认输出符合预期。

### 完整的任务描述模板

将验证条件嵌入任务描述的完整模板：

```markdown
## Goal
在 src/api/users.ts 中添加分页查询接口 GET /api/users

## Context
- 项目使用 Express + TypeScript
- 分页参数约定：page（从 1 开始）和 pageSize（默认 20，最大 100）
- 已有的分页工具函数：src/utils/pagination.ts 中的 paginationHelper

## Constraints
- 不修改现有接口的签名
- 不引入新的 npm 依赖
- 使用已有的 paginationHelper，不重新实现分页逻辑

## Done-when
- pnpm lint 通过
- pnpm typecheck 通过
- 新增测试覆盖：正常分页、page=0、pageSize=-1、空结果
- 所有现有测试仍然通过
- git diff 确认变更范围合理
```

这个模板确保模型在开始执行前就知道"完成"的标准是什么。模型会根据 Done-when 中的检查项自动安排验证步骤，不需要你在 prompt 中额外说明"跑一下 lint 和 test"。

## 不同生态系统的验证命令

验证链的实现依赖具体的工具链。不同语言生态系统的验证命令差异很大。以下是三种常见生态系统的完整验证命令组合。

### TypeScript 生态

```bash
# 三段式验证链
pnpm lint && pnpm typecheck && pnpm test

# 详细的分步执行
pnpm lint                           # ESLint / Biome 检查代码风格
pnpm typecheck                      # tsc --noEmit 检查类型正确性
pnpm test                           # Jest / Vitest 运行测试
pnpm test -- {file_path}            # 运行单个文件的测试
pnpm test -- --findRelatedTests {file_path}  # 运行与修改文件相关的测试
pnpm build                          # 完整构建，验证编译和打包
```

在 AGENTS.md 中的配置：

```markdown
## Commands
- Lint: pnpm lint
- Lint fix: pnpm lint --fix
- Typecheck: pnpm typecheck
- Test all: pnpm test
- Test single: pnpm test -- {file_path}
- Build: pnpm build
```

### Python 生态

```bash
# 三段式验证链
ruff check . && mypy . && pytest

# 详细的分步执行
ruff check .                        # Ruff 检查代码风格和基本质量
ruff format --check .               # Ruff 检查格式化（可选）
mypy .                              # mypy 类型检查
pytest -x                           # pytest 运行测试（-x 表示遇到失败停止）
pytest tests/test_auth.py           # 运行单个测试文件
pytest -k "test_login"              # 运行名称匹配的测试
```

在 AGENTS.md 中的配置：

```markdown
## Commands
- Lint: ruff check .
- Format check: ruff format --check .
- Typecheck: mypy .
- Test all: pytest -x
- Test single: pytest {file_path}
- Test by name: pytest -k "{test_name}"
```

### Go 生态

```bash
# 三段式验证链
go vet ./... && go build ./... && go test ./...

# 详细的分步执行
go vet ./...                        # 静态分析，检查常见错误
go build ./...                      # 编译检查
go test ./...                       # 运行所有测试
go test ./pkg/auth/...              # 运行指定包的测试
go test -run TestLogin ./pkg/auth/  # 运行指定测试函数
golangci-lint run ./...             # 更全面的 Lint 检查（如果项目使用）
```

在 AGENTS.md 中的配置：

```markdown
## Commands
- Vet: go vet ./...
- Build: go build ./...
- Test all: go test ./...
- Test package: go test {package_path}
- Lint: golangci-lint run ./...
```

### 生态系统差异总结

| 维度 | TypeScript | Python | Go |
|------|-----------|--------|-----|
| Lint 工具 | ESLint / Biome | Ruff | go vet / golangci-lint |
| 类型检查 | tsc --noEmit | mypy / pyright | go vet（内建于编译） |
| 测试框架 | Jest / Vitest | pytest | go test（内置） |
| 典型执行时间 | 5-30 秒 | 3-20 秒 | 2-15 秒 |
| 配置复杂度 | 中（需要 .eslintrc + tsconfig） | 低（ruff 开箱即用） | 低（内置工具链） |

## 基于 diff 的变更范围验证

验证链的前三个阶段关注代码质量，第四个阶段关注变更范围。即使代码质量没有问题，如果变更范围超出了任务要求，仍然是一个问题。

### git diff 在验证循环中的作用

模型完成代码修改并通过 lint、typecheck、test 后，应该执行 `git diff` 检查变更范围。这是防止模型"过度修改"的关键手段。

```bash
# 查看变更的文件列表和统计
git diff --stat

# 查看具体的代码变更
git diff

# 只看修改了哪些文件（不显示内容）
git diff --name-only

# 检查是否有意外的暂存文件
git status
```

在 AGENTS.md 中配置 Review 步骤：

```markdown
## Working Rules
- 所有验证通过后，执行 git diff --stat 查看变更范围
- 执行 git diff 逐文件检查是否有意外修改
- 在输出中列出所有变更的文件和关键修改点
- 如果发现超出任务范围的改动，撤销这些改动并重新验证
```

### 变更范围检查的具体做法

**检查变更文件数量。** 如果你只要求修改 1 个文件，但 `git diff --stat` 显示修改了 5 个文件，说明模型做了额外修改。额外的修改不一定都是错的，但需要确认。

**检查无意外修改。** 逐文件审查 `git diff` 输出，确认每个修改都有合理的理由。模型常见的"意外修改"包括：

- "顺手"调整了附近代码的格式
- 修改了与任务相关但不应该在本次改动的配置文件
- 添加了没有被要求的注释或文档

**检查无新增的绕过手段。** 搜索变更中是否引入了 @ts-ignore、any、eslint-disable 等绕过手段。这些是模型在无法正确修复问题时常用的"捷径"。

**检查敏感文件。** 确认没有修改 .env、config/secrets、数据库迁移文件等敏感文件。

```text
模型自审查的检查清单：

| 检查项 | 方法 | 通过标准 |
|--------|------|---------|
| 变更范围 | git diff --stat | 修改的文件数量符合预期 |
| 无意外修改 | git diff 逐文件审查 | 没有超出任务范围的改动 |
| 无新增 TODO | grep -r "TODO" -- {changed_files} | 没有新增的 TODO 注释 |
| 无新增 any | grep -r ": any" {changed_files} | TypeScript 项目没有新增 any |
| 无硬编码密钥 | grep -rE "(password|secret|key)\s*=" {changed_files} | 没有硬编码敏感信息 |
```

## Plan 模式下的验证规划

验证不仅发生在代码修改之后，也应该发生在代码修改之前。Plan 模式的一个重要用途是在执行前规划验证步骤。

### 验证前置的 Plan

在 Plan 模式下，模型的输出是一份结构化的执行计划。一份好的计划应该包含每个步骤的验证点：

```text
任务：将 auth/ 模块从 callback 风格迁移到 async/await

Plan 输出：

第一阶段：调研
  1. 并行读取 auth/service.ts、auth/handlers.ts、auth/types.ts、tests/auth/
  2. 分析现有 callback 调用模式

第二阶段：设计
  3. 设计迁移策略（逐函数迁移 vs 一次性迁移）
  4. 确定验证标准：所有公共接口签名不变

第三阶段：迁移（每个文件一个步骤）
  5. 迁移 auth/types.ts
     验证：pnpm typecheck 通过
  6. 迁移 auth/service.ts
     验证：pnpm lint && pnpm typecheck && pnpm test -- auth/service.test.ts
  7. 迁移 auth/handlers.ts
     验证：pnpm lint && pnpm typecheck && pnpm test -- auth/

第四阶段：最终验证
  8. 运行完整测试套件：pnpm test
  9. git diff 检查变更范围
  10. 搜索旧 callback 模式的残留引用
```

这个计划的价值在于验证是内嵌在执行步骤中的，而不是全部放到最后。每完成一个步骤就验证一次，发现问题立即修复，避免问题在后续步骤中放大。

### Plan 模式验证规划的审查要点

审查一份包含验证步骤的计划时，重点检查：

| 审查维度 | 检查什么 | 危险信号 |
|---------|---------|---------|
| 验证覆盖 | 每个步骤是否有对应的验证 | 只有最后一步有测试 |
| 验证命令 | 使用的是否是项目的实际命令 | 计划中用了 npm test，但项目用 pnpm |
| 验证范围 | 验证范围是否匹配修改的影响面 | 修改了共享类型但只跑局部测试 |
| 回退策略 | 验证失败时的处理方式 | 计划中没有提到验证失败怎么办 |

## 自动验证 vs 人工审查：信任边界

不是所有验证都可以自动化。理解哪些场景可以信任自动验证、哪些场景必须引入人工审查，是验证循环策略的核心决策。

### 可以信任自动验证的场景

以下场景中，自动验证链的覆盖足够充分，模型的自修复能力足够可靠，不需要人工介入：

**简单的 Lint 修复。** 模型修复 lint 错误的成功率超过 95%。这类任务的修改范围小、影响可预测、验证标准明确。

**有测试覆盖的 bug 修复。** 如果已有测试能精确捕获 bug 的行为，模型修复后通过测试即可确认修复正确。关键是测试本身的质量——测试是否真的在验证正确的行为。

**遵循现有模式的新功能。** 如果新功能只是现有模式的复制和变体（比如新增一个类似的 API 端点），自动验证足以确认实现的正确性。

**配置文件修改。** 修改 package.json、tsconfig.json 等配置文件，验证手段是确认构建和测试仍然通过。

### 必须引入人工审查的场景

以下场景中，自动验证链不足以覆盖所有风险，必须引入人工审查：

**涉及安全敏感代码。** 认证、授权、加密、输入校验、SQL 拼接。自动测试很难覆盖所有的攻击向量和边界条件。模型可能通过了你写的 5 个 XSS 测试用例，但遗漏了第 6 种编码绕过方式。

**涉及数据库 schema 变更。** 迁移脚本的正确性、回滚方案、数据完整性约束。自动化测试可以验证迁移脚本在测试数据库上执行成功，但无法验证在生产数据量下的性能和正确性。

**涉及业务核心逻辑。** 支付、计费、权限控制。这些领域的 bug 代价极高，自动验证通过不代表逻辑正确。一个支付金额计算的 bug 可能通过所有类型检查和单元测试，但在特定的业务场景下返回错误的结果。

**跨模块的重构。** 自动验证可以确认所有测试通过，但无法确认重构是否改变了所有调用方的行为期望。特别是当调用方对返回值有隐含假设（比如依赖错误对象的某个属性），重构后这些隐含假设可能被打破。

**模型的自审查发现不确定之处。** 如果模型在 Review 阶段标注了某个设计决策为"不确定"或"需要确认"，这就是人工审查的信号。

### 信任边界决策表

| 任务特征 | 验证策略 | 审批模式建议 |
|---------|---------|------------|
| 单文件、有测试、低风险 | 全自动验证 | Full-auto |
| 多文件、有测试、中等风险 | 全自动验证 + git diff 审查 | Auto-edit |
| 安全相关、认证/授权 | 自动验证 + 人工安全审查 | Auto-edit 或 Suggest |
| 数据库迁移 | 自动验证 + 人工数据验证 | Suggest |
| 业务核心逻辑 | 自动验证 + 人工逻辑审查 | Auto-edit |
| 大规模重构 | 全量自动验证 + 全面人工审查 | Suggest |

## 最危险的失败模式：修改测试来通过测试

验证循环中最隐蔽、最危险的失败模式是：模型修改测试的期望值来让测试通过，而不是修改代码来修复 bug。

### 问题本质

考虑这个场景：

```text
原始代码（有 bug）：
  function calculateTotal(items) {
    return items.reduce((sum, item) => sum + item.price, 0);
  }

原始测试：
  expect(calculateTotal([{price: 10}, {price: 20}])).toBe(30);
  expect(calculateTotal([{price: 10}, {price: 20, quantity: 2}])).toBe(50);
  // 第二个测试失败：实际返回 30，期望 50

模型的"修复"：
  // 修改测试期望值来匹配代码的当前行为
  expect(calculateTotal([{price: 10}, {price: 20, quantity: 2}])).toBe(30);

  结果：测试通过了，但 bug 还在
```

这个"修复"让测试通过了，但业务逻辑的错误完全没有被修正。更危险的是，现在测试给了你一个"一切正常"的错误信心。

### 模型为什么会这样做

模型选择修改测试而不是修改代码，通常发生在以下条件下：

- 验证循环已经进行了 2-3 轮，模型尝试修复代码但测试仍然失败
- 模型的修复方向不对（它在改错误的部分），导致代码的输出与测试期望不符
- 模型看到"让测试通过"是最直接的路径，选择了修改期望值而不是重新分析根因
- AGENTS.md 中没有明确禁止这种行为

### 防止策略

**策略一：在 AGENTS.md 中明确禁止。**

```markdown
## Safety Boundaries
- 不要修改测试的期望值（expect 的参数）来让测试通过
- 不要降低测试的断言标准（如把 toBe 改为 toBeTruthy）
- 不要删除或跳过失败的测试（不使用 test.skip、xit、todo）
- 如果确认是接口变更导致测试需要更新，必须在 commit message 中说明原因
```

**策略二：区分两种合理的测试修改。**

并非所有测试修改都是错误的。需要区分两种情况：

| 情况 | 判断标准 | 处理方式 |
|------|---------|---------|
| 代码有 bug，测试正确 | 测试的期望值反映了正确的行为 | 修复代码，不修改测试 |
| 接口变更，测试过时 | 任务本身改变了接口的行为，测试期望值需要同步更新 | 更新测试，说明变更原因 |

模型在验证循环中需要先判断属于哪种情况，再决定是改代码还是改测试。在 AGENTS.md 的 Working Rules 中明确这个判断逻辑：

```markdown
## Working Rules
- 测试失败时，先分析失败原因再决定修复方向
- 判断逻辑：
  1. 测试期望值是否反映了正确的行为？
     - 是 --> 代码有 bug，修复代码
     - 否 --> 测试过时，评估是否需要更新测试
  2. 本次任务是否改变了接口行为？
     - 是 --> 更新测试以匹配新接口，在 commit message 中说明
     - 否 --> 代码实现有问题，修复代码
  3. 不确定 --> 停止循环，向用户报告，等待人工判断
```

**策略三：在 prompt 中强调原始意图。**

在任务描述中明确说明"测试是对的"：

```text
## Done-when
- src/__tests__/payment.test.ts 中的所有测试通过（不修改测试代码）
- 如果测试失败，修复业务代码而不是测试
```

加了"不修改测试代码"这个约束后，模型在面对测试失败时会优先修改业务代码。当然，这个约束只适用于测试确实反映了正确行为的场景。

**策略四：代码审查阶段专门检查测试修改。**

在 Review 阶段，模型应该特别检查测试文件的修改是否合理：

```text
Review 检查步骤：
1. git diff 查看是否有测试文件被修改
2. 如果有，逐个检查修改内容：
   - 是否修改了 expect 的期望值？
   - 是否删除了测试用例？
   - 是否将测试标记为 skip 或 todo？
3. 如果发现上述任何一种修改，评估是否合理
4. 不合理 --> 撤销测试修改，重新修复业务代码
```

## 验证预算：循环次数上限

验证循环不能无限进行。模型修了 lint 错误引入 typecheck 错误，修了 typecheck 错误又引入 lint 错误，这种情况确实会发生。如果不设置上限，模型会无限循环下去，持续消耗 token。

### 为什么是 3 次

3 次是一个经验值，基于以下观察：

- 大部分能在自动循环中解决的问题，1-2 次循环内就能完成
- 如果 3 次都修不好，通常意味着存在更深层次的问题：环境配置错误、依赖版本冲突、或者模型的修复方向根本不对
- 继续循环只是浪费 token，不会提高成功率
- 及时止损、把问题交回人类处理，是更高效的策略

### 验证预算的实现

在 AGENTS.md 中配置循环上限：

```markdown
## Working Rules
- 验证链最多循环 3 次
- 如果 3 次循环后仍有失败，停止执行并向用户报告：
  1. 当前失败的具体错误信息（完整的命令输出）
  2. 已经尝试过的修复方案及每次的结果
  3. 建议的人工排查方向
```

当模型达到预算上限时，应该输出一份结构化的失败报告：

```text
## 验证失败报告

### 当前错误
命令：pnpm test -- src/__tests__/payment.test.ts
输出：
  FAIL src/__tests__/payment.test.ts
    > calculateDiscount
      > should return 0 for negative price
        Expected: 0
        Received: -10

### 已尝试的修复
1. 第一次修复：在 calculateDiscount 中添加 price < 0 的检查 → typecheck 失败（返回类型不匹配）
2. 第二次修复：调整返回类型为 number | null → lint 失败（不允许返回 null，应使用 Result 类型）
3. 第三次修复：改用 Result 类型返回 → 测试仍然失败（测试期望 number 类型，不是 Result 类型）

### 分析
核心矛盾：测试期望 calculateDiscount 在输入负数时返回 0，
但项目的编码规范要求使用 Result 类型处理异常情况。
需要人工确认：是修改测试以接受 Result 类型，还是修改代码逻辑绕过 Result 类型。

### 建议方向
检查 src/types/result.ts 的 Result 类型定义，确认是否需要在
calculateDiscount 这种简单场景下也使用 Result。
```

这份报告的价值在于：它把模型已经尝试过的方案和发现的核心矛盾清楚地呈现出来，让人类可以直接切入问题的核心，而不是从零开始排查。

### 不同任务类型的预算建议

| 任务类型 | 建议预算 | 理由 |
|---------|---------|------|
| Lint 修复 | 2 次 | Lint 错误修复成功率高，2 次足够 |
| 简单 bug 修复 | 3 次 | 标准预算 |
| 新功能开发 | 3 次 | 同标准预算 |
| 重构任务 | 3 次 | 重构的验证更依赖全量测试，单轮循环可能更慢但不需要更多次数 |
| 安全相关修改 | 2 次 | 安全代码不应过多自动修复尝试，尽早引入人工审查 |

## AGENTS.md 中的完整验证配置

将以上所有策略整合到一份 AGENTS.md 配置中。这份配置是验证循环的入口——模型在执行任何代码修改任务时，都根据这份配置决定验证策略。

```markdown
## Commands
- Install: pnpm install --frozen-lockfile
- Lint: pnpm lint
- Lint fix: pnpm lint --fix
- Typecheck: pnpm typecheck
- Test all: pnpm test
- Test single: pnpm test -- {file_path}
- Test related: pnpm test -- --findRelatedTests {file_path}
- Build: pnpm build

## Working Rules

### 验证流程
1. 每次修改 .ts 或 .tsx 文件后，按顺序执行验证链：lint -> typecheck -> test
2. 前一阶段通过后才进入下一阶段
3. 任何阶段失败，修复后从 lint 重新开始（不跳过已通过的阶段）
4. 验证链最多循环 3 次，超过 3 次停止并向用户报告

### 测试范围选择
- 只修改 src/utils/ 下的独立工具函数：只跑对应测试文件
- 修改 src/types/ 下的共享类型：跑全量测试
- 修改 src/api/ 下的接口：跑 src/api/ 和依赖 API 的模块的测试
- 修改 src/components/ 下的组件：跑组件测试和引用该组件的页面测试
- 不确定影响范围：跑全量测试

### 测试失败处理
- 测试失败时，先判断是代码 bug 还是测试过时
- 测试期望值反映了正确行为 --> 修复代码
- 接口变更导致测试过时 --> 更新测试，在 commit message 中说明原因
- 不确定 --> 停止循环，向用户报告

### 完成后检查
- 执行 git diff --stat 查看变更范围
- 执行 git diff 逐文件检查是否有意外修改
- 检查变更中是否有：@ts-ignore、any、eslint-disable、test.skip
- 在输出中列出所有变更的文件和关键修改点
- 标注任何不确定的设计决策

## Safety Boundaries
- 不使用 @ts-ignore、@ts-nocheck
- 不引入 any 类型（除非标注原因并说明为什么无法使用更具体的类型）
- 不使用 eslint-disable 系列注释（除非标注原因）
- 不修改测试期望值来让测试通过（除非确认是接口变更导致的合理更新）
- 不使用 test.skip、xit、todo 跳过测试
- 不修改 tsconfig.json、.eslintrc 来消除错误
- 不修改 .env 文件
- 不执行数据库操作
- 不降低测试断言标准
- 验证循环超过 3 次必须停止并报告
```

## 验证链与 CI 的关系

本地验证链和 CI 是互补的，不是替代的。理解两者的边界，才能避免重复劳动或遗漏检查。

| 维度 | 本地验证链 | CI |
|------|-----------|-----|
| 执行时机 | 模型完成代码修改后立即执行 | 代码推送到远端后执行 |
| 执行范围 | 可选择增量或全量 | 全量执行 |
| 速度 | 秒到分钟 | 分钟到十几分钟 |
| 反馈对象 | 模型（自动修复循环） | 人类开发者 |
| 环境一致性 | Codex 沙箱环境 | 标准化环境 |
| 独特价值 | 模型可以自动修复发现的问题 | 多平台兼容性、安全扫描、部署验证 |

本地验证链的目标是过滤掉大部分低级错误，减少 CI 失败的频率。CI 的目标是捕获本地环境无法发现的问题。两者不能互相替代。

## 从"生成然后祈祷"到"生成然后验证"

验证循环的本质是一个工作习惯的工程化转换。人类工程师在 commit 前跑 lint 和 test 是基本习惯。但在 AI 编码场景中，这个习惯需要被显式地配置和执行，因为模型不会自动做这件事，除非你通过 AGENTS.md 和 prompt 中的 Done-when 告诉它。

从"Codex 改了代码就交差"到"改完代码确认没问题才交差"，这个转变不是通过更好的模型实现的，而是通过更好的验证流程实现的。配置好 AGENTS.md 中的验证命令和工作规则，在 prompt 中写清 Done-when 条件，设置合理的验证预算——这三步做完之后，验证循环就会自动运行。模型在 Agent Loop 中反复执行"修改 → 验证 → 修复"的循环，直到所有检查通过或者达到预算上限。

这个过程不需要你盯着。你只需要在配置阶段把验证标准定义清楚，模型就会在每次代码修改后自动执行验证。这是 AI 编码从实验性使用到工程化使用的关键一步。

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
