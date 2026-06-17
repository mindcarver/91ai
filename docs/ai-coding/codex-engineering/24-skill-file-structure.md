# Skill 文件结构：触发描述、条件匹配和资源组织

**TL;DR：** Skill 的核心是一个 SKILL.md 文件，由 YAML frontmatter 和 Markdown 正文组成。frontmatter 声明元数据（名称、描述、触发条件），使得 Codex 能在合适的上下文中自动发现和激活技能。正文是 Codex 实际读取并执行的指令内容。围绕 SKILL.md，一个完整的 Skill 可以包含 scripts/、references/、assets/ 三个资源子目录，分别存放可执行脚本、模板文件和静态配置。Skill 被加载时消耗 token，因此保持聚焦、避免冗余是结构设计的核心原则。本文逐层拆解 SKILL.md 的解剖结构、when.file_pattern 的条件匹配机制、资源目录的组织方式，并给出一个完整的 PR Review Skill 示例。

---

## SKILL.md 的解剖结构

### 两个组成部分

SKILL.md 是一个标准的 Markdown 文件，在文件顶部嵌入了一段 YAML frontmatter。这两部分各司其职：

```markdown
---
name: pr-review
description: 按照团队审查规范执行结构化 PR Review
trigger: /review
when:
  file_pattern: "*.py"
---

# PR Review Skill

## 执行流程

1. 获取 PR 的 diff 和元信息
2. 按架构变更、逻辑变更、测试覆盖三个阶段依次审查
3. 输出结构化审查报告

## 检查标准

（具体检查项...）
```

- **YAML frontmatter**（`---` 之间的部分）：机器可读的元数据，Codex 的发现和匹配引擎读取这些字段来决定"这个 Skill 什么时候该被加载"。
- **Markdown 正文**（`---` 之后的部分）：Codex 执行时读取的指令内容。这部分直接进入模型的上下文窗口，告诉模型具体该做什么。

两部分的设计哲学截然不同。frontmatter 追求精确和结构化，是给匹配引擎看的；正文追求清晰和可执行，是给模型看的。

### YAML frontmatter 字段详解

#### name 字段

```yaml
name: pr-review
```

Skill 的唯一标识符。命名规范建议使用小写字母和连字符（kebab-case），因为这个名字会出现在多个地方：

- 命令行触发：`/pr-review`
- Skill 列表展示：`codex skills list` 的输出
- 日志和调试信息中

命名应该简短且描述性强。好的命名让人一看就知道这个 Skill 做什么：`pr-review`、`deploy-verify`、`doc-update`。坏的命名过于模糊或过于冗长：`review`（什么都可能被 review）、`automatically-review-pull-requests-according-to-team-standards`（太长）。

#### description 字段

```yaml
description: 按照团队审查规范执行结构化 PR Review，覆盖架构变更、逻辑变更和测试覆盖三个维度
```

一到两句话的自然语言描述。这个字段有两个用途：

1. **人工浏览**：当团队成员执行 `codex skills list` 或查看 Skill 目录时，description 帮助快速理解 Skill 的用途。
2. **模型理解**：Codex 在决定是否激活某个 Skill 时，会将 description 作为判断依据之一。描述越精确，匹配越准确。

好的描述应该明确说出"做什么"和"按什么标准做"。差的描述只说"做什么"但不说标准，导致模型在执行时缺乏锚定。

#### trigger 字段

```yaml
trigger: /review
```

定义触发 Skill 的命令。用户在对话中输入 `/review` 时，Codex 查找具有该 trigger 值的 Skill 并加载。trigger 是一个字符串，通常以 `/` 开头，但不强制要求。

一个 Skill 只能有一个 trigger。如果同一个流程需要支持多个触发词，有两种做法：

- 定义多个 Skill，每个有不同的 trigger，但引用相同的资源文件
- 在 trigger 中使用主触发词，在正文开头的说明中告知用户也可以用什么方式触发

#### when.file_pattern 字段

```yaml
when:
  file_pattern: "*.py"
```

这是 Skill 条件激活的核心字段，下一节专门展开。它定义了一个 glob 模式，当 Codex 当前工作上下文中的文件路径匹配该模式时，Skill 会被自动推荐或加载。不是所有 Skill 都需要 file_pattern，纯命令触发的 Skill 可以省略这个字段。

### Markdown 正文的结构

正文没有固定的模板，但经过实践验证，以下结构能产生最稳定的执行效果：

```markdown
# [Skill 名称]

## 用途
简要说明这个 Skill 解决什么问题、适用什么场景。

## 前置条件
执行前必须满足的条件（如需要的 MCP 工具、环境变量、文件存在性）。

## 执行流程
按顺序编号的具体步骤，每一步包含：
- 做什么
- 用什么工具（如果需要）
- 成功/失败的判断标准

## 输出格式
定义输出的结构，包括必需的章节、字段和格式要求。

## 错误处理
异常情况的处理策略：终止、跳过还是降级。
```

正文的质量直接决定 Skill 的执行稳定性。以下几个写法原则值得严格遵守：

- 每一步都是可执行的指令，不是模糊的方向。写"调用 github.get_pull_request_diff 获取 diff"而不是"先看看代码改了什么"。
- 包含判断标准，不留给模型自由发挥的空间。写"如果 ERROR 日志超过基线的 150% 则标记异常"而不是"看看日志有没有异常"。
- 用编号列表表示顺序，用无序列表表示选项。1/2/3 表示先做后做，bullet points 表示任选其一。

### frontmatter 与正文的关系

frontmatter 和正文解决的是两个不同层面的问题：

| 层面 | frontmatter | 正文 |
|------|------------|------|
| 读者 | 匹配引擎 | 大语言模型 |
| 目的 | 发现和激活 | 执行和产出 |
| 格式 | 结构化 YAML | 自然语言 Markdown |
| 修改频率 | 低（Skill 身份稳定） | 高（流程持续优化） |
| 对 token 的影响 | 忽略不计 | 直接消耗 token |

理解这个分工很重要。不要把执行指令塞进 frontmatter 的 description 里（description 不进入模型的执行上下文），也不要在正文中重复 frontmatter 已经声明过的元数据（浪费 token）。

## when.file_pattern 条件匹配系统

### 设计意图

当你在编辑一个 Python 测试文件时，你可能希望 Codex 自动激活测试相关的 Skill；当你在修改一个 React 组件时，你希望组件规范检查的 Skill 自动就绪。手动输入 `/trigger` 命令可以精确控制，但在高频切换文件的日常开发中，自动匹配能显著减少操作负担。

`when.file_pattern` 就是为了解决这个问题而设计的。它让 Skill 能够根据当前工作上下文中的文件类型自动激活，而不需要用户每次都记住并输入触发命令。

### Glob 模式语法

file_pattern 使用标准的 glob 模式语法。以下是最常用的模式：

| 模式 | 含义 | 匹配示例 |
|------|------|---------|
| `*.py` | 匹配所有 Python 文件 | `app.py`, `utils.py` |
| `test_*.py` | 匹配所有测试文件 | `test_auth.py`, `test_utils.py` |
| `*_test.go` | 匹配 Go 测试文件 | `handler_test.go`, `service_test.go` |
| `*.tsx` | 匹配 React 组件文件 | `Button.tsx`, `App.tsx` |
| `*.spec.ts` | 匹配 TypeScript 测试文件 | `auth.spec.ts`, `api.spec.ts` |
| `src/**/*.py` | 匹配 src 目录下所有 Python 文件 | `src/auth/handler.py` |
| `*.md` | 匹配所有 Markdown 文件 | `README.md`, `CHANGELOG.md` |
| `Dockerfile*` | 匹配所有 Dockerfile 变体 | `Dockerfile`, `Dockerfile.prod` |
| `*.yaml` | 匹配 YAML 配置文件 | `config.yaml`, `deploy.yaml` |
| `*.proto` | 匹配 Protocol Buffer 定义 | `api.proto`, `user.proto` |

### 匹配机制

Codex 对 file_pattern 的匹配过程如下：

```text
1. Codex 获取当前工作上下文中的文件信息
   - 用户正在编辑的文件
   - 当前对话中最近引用的文件
   - 工作目录中变更的文件

2. 将这些文件路径与所有 Skill 的 file_pattern 逐一匹配

3. 匹配成功的 Skill 进入"候选列表"

4. 候选列表中的 Skill 按优先级排序后呈现给用户或自动加载
```

匹配的粒度是文件路径字符串。Codex 不会打开文件检查内容，只根据路径的模式进行匹配。这意味着 `test_*.py` 会匹配名为 `test_config.py` 的文件，无论文件内容是否真的是测试代码。

### 常用场景的 file_pattern 配置

**测试相关 Skill**

```yaml
when:
  file_pattern: "test_*.py"
```

当用户正在编辑或查看以 `test_` 开头的 Python 文件时自动激活。这个模式覆盖了 pytest 的默认命名约定（`test_*.py` 或 `*_test.py`，这里选择前者）。

**React 组件 Skill**

```yaml
when:
  file_pattern: "*.tsx"
```

当用户正在处理 TSX 文件时自动激活，可以加载组件规范检查、样式指南、props 类型定义模板等。

**API 定义 Skill**

```yaml
when:
  file_pattern: "api/**/*.proto"
```

匹配 api 目录下的所有 Protocol Buffer 定义文件，适合 proto 规范检查和代码生成相关的 Skill。

**配置文件 Skill**

```yaml
when:
  file_pattern: "*.toml"
```

匹配 TOML 配置文件，可以加载配置规范检查、环境变量验证等 Skill。

### 多模式匹配

一个 Skill 如果需要匹配多种文件模式，可以使用列表形式：

```yaml
when:
  file_pattern:
    - "*.py"
    - "*.pyx"
    - "*.pyi"
```

当工作上下文中的文件匹配列表中的任何一个模式时，Skill 都会被激活。列表中的模式之间是"或"的关系。

### 与 trigger 的优先级关系

当 Skill 同时声明了 trigger 和 when.file_pattern 时，两种激活方式都有效：

- 用户输入 `/review` 命令：无论当前在编辑什么文件，都会触发
- 用户编辑匹配 `file_pattern` 的文件：Skill 被自动推荐，但可能需要用户确认

```text
激活方式       | 确定性  | 用户主动性  | 适用场景
-------------|--------|-----------|----------
trigger 命令  | 高     | 高        | 明确知道要用某个 Skill
file_pattern | 中     | 低        | 根据上下文自动推荐
```

建议的策略：对于核心工作流 Skill（如 PR Review、部署验证），同时声明 trigger 和 file_pattern，提供两种入口。对于辅助性 Skill（如文件格式检查），只声明 file_pattern，减少用户需要记忆的命令数量。

## 资源目录结构

SKILL.md 定义了 Skill 的身份和流程，但一个真正有用的 Skill 往往还需要额外的资源文件：执行脚本、模板、配置示例等。这些资源文件按约定放在 SKILL.md 同级目录下的特定子目录中。

### 目录布局总览

```text
skills/
  pr-review/                  # Skill 名称即目录名
    SKILL.md                  # 入口文件（必需）
    scripts/                  # 可执行脚本（可选）
      review-checklist.sh
      complexity-analyzer.py
    references/               # 模板和参考文件（可选）
      review-template.md
      severity-guide.md
    assets/                   # 静态资源（可选）
      config-schema.json
      default-rules.yaml
```

三个子目录各自有明确的职责划分。不是每个 Skill 都需要全部三个目录，但一旦使用了某个目录，就应该遵循其约定。

### scripts/ 目录

存放可执行脚本。这些脚本在 Skill 执行过程中由 Codex 通过 shell 命令调用。脚本可以是任何可执行格式：bash、Python、Node.js 等。

scripts/ 目录的关键规则：

- 所有脚本必须有可执行权限（`chmod +x`）
- 脚本应该是自包含的，或者在其开头声明依赖
- 脚本应该通过退出码传递成功/失败状态（0 表示成功，非 0 表示失败）
- 脚本的输出应该是结构化的，方便模型解析

```bash
#!/bin/bash
# scripts/review-checklist.sh
# 输出 PR 审查检查项的状态

set -euo pipefail

PR_NUMBER="${1:?Usage: review-checklist.sh <pr_number>}"

echo "=== PR #${PR_NUMBER} 审查检查清单 ==="
echo ""

# 检查 PR 大小
CHANGED_FILES=$(gh pr diff "$PR_NUMBER" --name-only | wc -l)
if [ "$CHANGED_FILES" -gt 20 ]; then
    echo "[WARN] 变更文件数: ${CHANGED_FILES}，超过 20 个文件的建议上限"
else
    echo "[OK]   变更文件数: ${CHANGED_FILES}"
fi

# 检查是否有测试文件
HAS_TESTS=$(gh pr diff "$PR_NUMBER" --name-only | grep -c "test_\|_test\.\|spec\." || true)
if [ "$HAS_TESTS" -eq 0 ]; then
    echo "[WARN] 未发现测试文件变更"
else
    echo "[OK]   测试文件变更: ${HAS_TESTS} 个"
fi

# 检查 CI 状态
CI_STATUS=$(gh pr checks "$PR_NUMBER" 2>/dev/null | tail -1 || echo "unknown")
echo "[INFO] CI 状态: ${CI_STATUS}"

exit 0
```

Skill 正文通过相对路径引用脚本：

```markdown
## 执行步骤

1. 运行审查清单脚本：
   ```bash
   bash scripts/review-checklist.sh ${PR_NUMBER}
   ```
   根据输出中的 [WARN] 和 [OK] 标记判断需要重点关注的检查项。
```

### references/ 目录

存放模板文件、示例代码、文档片段等参考性资源。与 scripts/ 的区别在于：references/ 中的文件不是用来执行的，而是作为模型生成内容时的参考或模板。

```markdown
<!-- references/review-template.md -->

# PR Review 报告模板

## 摘要
<!-- 一句话概述 PR 的目的和变更范围 -->

## 架构变更审查
<!-- 列出架构层面的发现，按严重程度排序 -->
- [严重] ...
- [建议] ...

## 逻辑变更审查
<!-- 列出逻辑层面的问题，附文件名和行号 -->
- [需修改] `path/to/file.ts:L42` - ...
- [关注] `path/to/file.ts:L78` - ...

## 测试覆盖评估
<!-- 评估变更部分的测试覆盖是否充分 -->

## 建议
<!-- 批准 / 需要修改 / 需要讨论 -->
```

模型在执行 Skill 时读取这个模板，然后按照模板的结构填充内容。这比在正文里用自然语言描述"输出应该长什么样"有效得多——模型拿到模板后的输出一致性显著高于拿到文字描述。

### assets/ 目录

存放静态配置文件，如 JSON Schema、YAML 默认配置、规则定义等。这些文件通常被 scripts/ 中的脚本读取，或者被模型用作配置参考。

```json
{
  "severity_levels": {
    "critical": {
      "description": "必须修复后才能合并",
      "examples": ["安全漏洞", "数据丢失风险", "竞态条件"]
    },
    "major": {
      "description": "应该修复，可在后续 PR 中处理",
      "examples": ["缺少错误处理", "接口不兼容", "性能回退"]
    },
    "minor": {
      "description": "建议修复，不阻塞合并",
      "examples": ["命名不规范", "缺少注释", "可以简化的逻辑"]
    },
    "suggestion": {
      "description": "可选优化，供作者参考",
      "examples": ["替代实现方案", "更好的抽象", "文档改进"]
    }
  }
}
```

### 资源加载的路径解析

Codex 加载资源文件时使用相对路径，基准路径是 SKILL.md 所在的目录。也就是说：

```text
skills/
  pr-review/
    SKILL.md              # 基准路径 = skills/pr-review/
    scripts/check.sh      # 引用方式: scripts/check.sh
    references/tmpl.md    # 引用方式: references/tmpl.md
    assets/rules.json     # 引用方式: assets/rules.json
```

如果资源文件嵌套在更深的子目录中，路径照常使用相对层级：

```text
skills/
  deploy-verify/
    SKILL.md
    scripts/
      health/
        check.sh          # 引用方式: scripts/health/check.sh
    references/
      reports/
        daily.md          # 引用方式: references/reports/daily.md
```

不建议创建超过两层的子目录嵌套。过深的目录结构增加路径出错的风险，也让 Skill 的维护成本上升。

## 完整示例：PR Review Skill

下面给出一个结构完整的 PR Review Skill，包含所有组成部分。

### 目录结构

```text
skills/
  pr-review/
    SKILL.md
    scripts/
      review-checklist.sh
      diff-stats.sh
    references/
      review-template.md
      severity-guide.md
    assets/
      severity-schema.json
```

### SKILL.md

```markdown
---
name: pr-review
description: 按照团队审查规范执行结构化 PR Review，覆盖架构变更、逻辑变更和测试覆盖三个维度
trigger: /review
when:
  file_pattern:
    - "*.py"
    - "*.ts"
    - "*.go"
---

# PR Review Skill

## 用途

对指定的 Pull Request 执行结构化代码审查，产出包含架构评估、逻辑分析和测试覆盖检查的标准化报告。

## 前置条件

- GitHub MCP Server 已连接且可用
- 当前工作目录是一个 Git 仓库
- 存在一个打开状态的 PR（通过参数指定编号，或从当前分支自动推断）

## 执行流程

### 阶段一：信息收集

1. 确定 PR 编号。如果用户提供了编号，直接使用。否则通过 `git branch --show-current` 获取当前分支名，用 `gh pr list --head <branch>` 查找对应的 PR 编号。

2. 调用 `gh pr view <number>` 获取 PR 元信息（标题、描述、作者、标签）。

3. 调用 `gh pr diff <number>` 获取完整 diff。

4. 运行 `bash scripts/review-checklist.sh <number>` 获取基础检查结果。

5. 运行 `bash scripts/diff-stats.sh <number>` 获取变更统计数据。

### 阶段二：架构变更审查

对以下类型的文件变更进行重点审查：
- 目录结构变更（新增/删除/重命名目录）
- 接口定义变更（TypeScript interface, Go interface, Python protocol）
- 配置文件变更（依赖、构建配置、环境变量）
- 跨模块的导入关系变更

检查标准：
- 变更是否与项目架构方向一致
- 新增接口是否与现有接口风格统一
- 新增依赖是否必要、是否引入安全风险
- 变更是否影响其他模块的公共接口

### 阶段三：逻辑变更审查

对业务逻辑代码的具体修改进行审查。

检查标准：
- 边界条件处理（空值、超时、并发、大数据量）
- 错误处理完整性（不只是 try-catch，还有错误传播和恢复）
- 资源管理（连接释放、锁释放、临时文件清理）
- 变更意图与 PR 描述的一致性

### 阶段四：测试覆盖评估

检查变更部分的测试覆盖情况。

检查标准：
- 逻辑变更是否有对应的测试
- 测试是否覆盖了关键边界条件
- 测试是否验证行为而非实现细节
- CI 状态是否全部通过

### 输出格式

使用 `references/review-template.md` 的结构输出报告。
使用 `assets/severity-schema.json` 中定义的严重程度分级标准。
使用 `references/severity-guide.md` 中的示例辅助判断。

### 错误处理

- PR 不存在或已关闭：终止执行，通知用户
- diff 获取失败：重试一次，仍然失败则终止
- 脚本执行失败：跳过该脚本的检查结果，在报告中标注 "SKIPPED"
- MCP 工具不可用：降级为使用 gh CLI 替代，在报告中标注降级说明
```

### scripts/review-checklist.sh

```bash
#!/bin/bash
# PR 审查基础检查脚本
# 用法: review-checklist.sh <pr_number>

set -euo pipefail

PR="${1:?用法: review-checklist.sh <pr_number>}"

echo "=== PR #${PR} 基础检查 ==="

# 变更文件数
FILE_COUNT=$(gh pr diff "$PR" --name-only | wc -l | tr -d ' ')
echo "变更文件: ${FILE_COUNT}"

if [ "$FILE_COUNT" -gt 30 ]; then
    echo "[WARN] 变更文件超过 30 个，建议拆分 PR"
elif [ "$FILE_COUNT" -gt 15 ]; then
    echo "[INFO] 变更文件较多 (${FILE_COUNT})，需要重点关注跨模块影响"
fi

# 测试文件检查
TEST_FILES=$(gh pr diff "$PR" --name-only | grep -cE "(test_|_test\.|spec\.)" || echo "0")
echo "测试文件: ${TEST_FILES}"

if [ "$TEST_FILES" -eq 0 ]; then
    echo "[WARN] 未包含测试文件变更"
fi

# 新增依赖检查
DEPENDENCY_CHANGES=$(gh pr diff "$PR" --name-only | grep -cE "(package\.json|requirements\.txt|go\.mod|Cargo\.toml)" || echo "0")
if [ "$DEPENDENCY_CHANGES" -gt 0 ]; then
    echo "[ATTENTION] 包含依赖变更，需要审查安全性和许可证"
fi

exit 0
```

### scripts/diff-stats.sh

```bash
#!/bin/bash
# PR diff 统计脚本
# 用法: diff-stats.sh <pr_number>

set -euo pipefail

PR="${1:?用法: diff-stats.sh <pr_number>}"

echo "=== PR #${PR} 变更统计 ==="

# 按文件类型统计变更
echo ""
echo "按文件类型分布:"
gh pr diff "$PR" --name-only | sed 's/.*\.//' | sort | uniq -c | sort -rn

# 增删行数统计
ADDITIONS=$(gh pr view "$PR" --json additions -q '.additions')
DELETIONS=$(gh pr view "$PR" --json deletions -q '.deletions')
echo ""
echo "增删统计: +${ADDITIONS} -${DELETIONS}"

exit 0
```

### references/review-template.md

```markdown
# PR Review: #<编号> - <标题>

## 摘要
<一句话概述 PR 的目的和变更范围。包含变更文件数、涉及模块数>

## 架构变更
<如果存在架构级变更，列出发现的问题，按严重程度排序>
- [严重] ...
- [关注] ...
- [建议] ...

## 逻辑变更
<列出逻辑层面的问题，附文件路径和行号>
- [需修改] `path/to/file:L42` - 描述
- [关注] `path/to/file:L78` - 描述

## 测试覆盖
<评估变更部分的测试覆盖是否充分，指出缺失的场景>

## 建议
<批准 / 需要修改 / 需要讨论，附理由>
```

### references/severity-guide.md

```markdown
# 审查严重程度分级指南

## critical（必须修复）
- 安全漏洞（SQL 注入、XSS、认证绕过）
- 数据丢失风险（未处理的写入失败、并发冲突）
- 生产环境崩溃风险（空指针、资源耗尽）

## major（应该修复）
- 错误处理不完整（捕获了异常但未处理、错误信息不明确）
- 接口不兼容（破坏现有调用方的行为）
- 性能回退（引入了不必要的全量操作或 N+1 查询）

## minor（建议修复）
- 代码风格不一致（命名、格式、注释风格）
- 可简化的逻辑（过度嵌套、重复代码）
- 缺少边界条件处理（空输入、极大值）

## suggestion（可选优化）
- 替代实现方案
- 更好的抽象或设计模式
- 文档或注释改进
```

### assets/severity-schema.json

```json
{
  "levels": ["critical", "major", "minor", "suggestion"],
  "defaults": {
    "auto_block": ["critical"],
    "recommend_action": ["major"],
    "informational": ["minor", "suggestion"]
  },
  "escalation": {
    "three_minor_equals_major": true,
    "two_major_equals_critical": false
  }
}
```

## Skill 加载机制

### 发现过程

Codex 通过目录扫描发现 Skill。扫描规则如下：

```text
1. 扫描项目根目录下的 skills/ 目录
   找到所有包含 SKILL.md 文件的子目录

2. 扫描用户级 Skill 目录（~/.codex/skills/）
   找到用户个人定义的 Skill

3. 读取每个 SKILL.md 的 YAML frontmatter
   提取 name、description、trigger、when.file_pattern 等字段

4. 构建可用 Skill 的索引
   按名称、触发器和文件模式建立查找表
```

这个扫描过程在会话启动时执行一次，之后在整个会话期间，Skill 索引保持不变。如果会话期间修改了 SKILL.md 文件，需要重启会话才能生效。

### 加载时机

Skill 的加载有两种模式，取决于激活方式：

**命令触发加载（trigger 匹配）**

当用户输入匹配某个 Skill 的 trigger 命令时（如 `/review`），Codex 立即加载该 Skill 的 SKILL.md 正文。加载是即时的、确定性的——没有模糊匹配，没有候选排序。

**上下文匹配加载（file_pattern 匹配）**

当 Codex 检测到当前工作上下文中的文件匹配某个 Skill 的 file_pattern 时，该 Skill 进入"推荐"状态。推荐不等于加载。Codex 可能会：

- 将推荐 Skill 列在候选列表中供用户选择
- 在特定条件下自动加载推荐 Skill（取决于配置和上下文）
- 仅在用户确认后加载

file_pattern 匹配的加载时机不如 trigger 精确，因为用户可能同时在处理多个文件，而这些文件触发了不同的 Skill 推荐。

### Token 成本

Skill 被加载后，SKILL.md 的全部正文内容会进入模型的上下文窗口。这意味着每次加载一个 Skill 都会消耗 token。消耗量取决于 SKILL.md 正文的长度。

粗略的 token 估算：

| Skill 复杂度 | SKILL.md 正文字数 | 估算 token 消耗 |
|-------------|------------------|----------------|
| 简单 | 200-400 字 | 300-600 tokens |
| 中等 | 500-1000 字 | 800-1500 tokens |
| 复杂 | 1000-2000 字 | 1500-3000 tokens |

此外，如果 Skill 引用了 references/ 中的模板文件，这些文件在被读取时也会消耗额外 token。scripts/ 和 assets/ 中的文件在被调用或读取时同样消耗 token。

这个成本在单次 Skill 执行中不算大，但在以下场景下需要关注：

- 一次会话中加载多个 Skill：token 叠加
- Skill 正文过于冗长：不必要的内容浪费 token
- references/ 目录中存放了大量文件但只用到其中一两个：可以考虑拆分

### 按需加载与预加载

Codex 默认使用按需加载策略：只有在 Skill 被触发或推荐时才加载 SKILL.md 的正文。frontmatter 元数据在会话启动时就被索引，但正文内容不在此时加载。

这意味着你可以在项目中定义大量 Skill 而不用担心启动时的 token 成本。只有实际使用的 Skill 才会消耗 token。

但有一个例外：如果 Codex 在评估当前上下文时需要读取多个 Skill 的 description 来做匹配决策，这些 description 字段（不是正文）会在决策阶段被读取。description 通常很短，对 token 的消耗可以忽略。

## 多 Skill 项目管理

### 命名和组织

当项目中存在多个 Skill 时，命名和组织需要遵循一致的规则，避免混乱。

**目录命名规则**

```text
skills/
  pr-review/            # kebab-case，与 name 字段一致
  deploy-verify/        # 动词-名词结构，描述行为
  doc-update/           # 简短但明确
  test-coverage/        # 不使用缩写，保持可读性
```

不建议的命名：

```text
skills/
  review/               # 太模糊，什么类型的 review？
  deployVerification/   # 混用 camelCase，风格不一致
  skill-pr-review/      # 不需要 skill 前缀，目录位置已经表明这是 skill
  tmp-review/           # 不要使用临时性前缀
```

**文件组织规则**

```text
每个 Skill 一个独立目录，不要把多个 SKILL.md 放在同一个目录中。

正确：
skills/
  pr-review/
    SKILL.md
  deploy-verify/
    SKILL.md

错误：
skills/
  SKILL.md              # 这是谁的 Skill？
  pr-review-SKILL.md    # 不要改名，必须是 SKILL.md
  deploy-verify-SKILL.md
```

SKILL.md 这个文件名是硬性要求。Codex 在扫描目录时只查找名为 SKILL.md 的文件。如果你的文件命名为 `pr-review-skill.md` 或 `skill.md`（小写），它不会被识别。

### 触发器冲突处理

当两个 Skill 的 trigger 相同时，Codex 无法自动决定加载哪一个。避免这种冲突的方法：

1. **触发器命名空间**：给 trigger 加上领域前缀。`/review-pr` 和 `/review-doc` 比 `/review` 更不容易冲突。

2. **file_pattern 细化**：用 file_pattern 作为辅助区分。两个 Skill 可以有相同的 trigger，但通过不同的 file_pattern 在不同上下文中生效。

3. **Skill 合并**：如果两个 Skill 经常一起被触发，考虑合并为一个更大的 Skill，用正文中的条件判断来区分执行路径。

### file_pattern 重叠处理

当多个 Skill 的 file_pattern 都匹配当前文件时：

```yaml
# Skill A
when:
  file_pattern: "*.py"

# Skill B
when:
  file_pattern: "test_*.py"
```

如果一个用户正在编辑 `test_auth.py`，两个 Skill 都会被匹配。Codex 处理这种重叠的方式：

- 更具体的模式优先。`test_*.py` 比 `*.py` 更具体。
- 用户可以通过配置声明优先级偏好。
- 如果自动决策不可靠，向用户展示候选列表让其选择。

建议在设计 Skill 时主动避免重叠。如果 Skill A 处理所有 Python 文件，Skill B 专门处理测试文件，那么 Skill A 的正文应该明确排除测试文件的逻辑，或者 Skill A 只处理非测试文件。

```yaml
# Skill A: 只处理非测试的 Python 文件
# （通过正文中的条件判断实现，而非 file_pattern 语法）
when:
  file_pattern: "*.py"

# SKILL.md 正文中注明：
# 本 Skill 不处理以 test_ 开头的 Python 文件。
# 测试文件由 test-runner Skill 处理。
```

## Skill 版本控制与团队共享

### 版本控制策略

Skill 文件应该纳入项目的 Git 版本控制。原因：

1. Skill 是团队流程的代码化表达，和项目代码一样需要版本历史
2. Skill 的修改需要经过 review，防止一个人的偏好影响整个团队
3. 回滚到之前的 Skill 版本比重新编写更可靠

推荐的 `.gitignore` 配置：

```text
# 不要忽略 Skill 文件
!skills/

# 可以忽略 Skill 运行时产生的临时文件
skills/*/tmp/
skills/*/*.log
```

### 团队共享模式

**项目级 Skill（推荐）**

放在项目仓库的 `skills/` 目录下，随代码一起版本控制。所有团队成员共享同一套 Skill，保证行为一致性。

```text
project-repo/
  skills/
    pr-review/
      SKILL.md
    deploy-verify/
      SKILL.md
```

**用户级 Skill**

放在 `~/.codex/skills/` 目录下，不纳入版本控制。适合个人偏好的工作流，不影响团队其他成员。

```text
~/.codex/skills/
  my-custom-review/
    SKILL.md
  personal-notes/
    SKILL.md
```

**团队 Skill 库（进阶）**

大型团队可以维护一个独立的 Skill 仓库，各项目通过引用或软链接的方式使用：

```bash
# 引用团队共享 Skill
ln -s /path/to/team-skills/pr-review ./skills/pr-review

# 或者在 CI 中自动同步
git clone team-skills-repo ./skills/team
```

### 版本演进

Skill 的版本演进应该遵循以下原则：

- SKILL.md 的修改需要经过 PR review，和代码变更同等待遇
- frontmatter 的变更（尤其是 trigger 和 file_pattern）需要通知团队，因为这影响所有人的使用习惯
- 正文内容的优化可以高频进行，因为每次执行都会读取最新版本
- scripts/ 中的脚本修改需要测试，因为脚本的错误会导致整个 Skill 执行失败
- references/ 中的模板修改影响输出格式，需要同步更新团队的期望

### Skill 变更的沟通

当一个被广泛使用的 Skill 发生变更时，建议通过以下方式沟通：

```text
1. 在 PR 描述中说明变更原因和影响范围
2. 如果 trigger 变更，在团队频道中通知
3. 如果输出格式变更，提供新旧格式的对比示例
4. 如果删除了某个 Skill，在 AGENTS.md 或项目文档中注明替代方案
```

## 设计原则总结

**聚焦原则**：一个 Skill 只解决一个问题。不要把 PR Review 和部署验证塞进同一个 Skill。聚焦的 Skill 更容易编写、测试和维护，加载时的 token 消耗也更低。

**自包含原则**：Skill 目录应该包含执行所需的所有资源。不要让 Skill 依赖项目中的其他非标准位置的文件。scripts/ 中的脚本应该能在只有标准工具的环境下运行。

**可测试原则**：Skill 的每一步都应该可以独立验证。如果某个 Skill 依赖外部服务（如 GitHub API），在正文中明确声明这个依赖，并提供无外部服务时的降级策略。

**渐进复杂度原则**：从最简单的 SKILL.md 开始，只有当流程稳定后再添加 scripts/ 和 references/。过早引入资源文件会增加维护负担，而此时流程本身还在频繁变动。

**Token 意识原则**：始终记住 SKILL.md 的正文会直接消耗 token。用最少的文字传达最清晰的指令。删除冗余的说明、重复的示例和不必要的背景信息。如果某个参考文档很长，放在 references/ 中按需读取，而不是全部塞进 SKILL.md。

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
