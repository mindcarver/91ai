# shell_command 与工具响应截断：执行模式和上下文管理

**TL;DR：** Codex 执行 shell 命令有两种模式——字符串模式和数组模式，前者灵活但存在 shell 注入风险，后者安全但功能受限。无论哪种模式，命令执行产生的输出都受 10k tokens 的单次响应限制约束，超出部分按头尾保留、中间截断的策略处理。理解这套机制的核心意义在于：每一次工具调用都在消耗上下文预算，无意义的输出不仅浪费预算，还会挤压模型理解任务所需的有效信息空间。工程实践中的应对策略是管道过滤、grep 精确提取和重定向到文件再分段读取。

## shell_command 的两种执行模式

Codex 执行 shell 命令的工具（在内部实现中称为 shell_command 或类似名称）支持两种参数传递模式。这两种模式不是互斥的配置选项，而是 Codex 根据当前任务的性质自动选择的执行策略。理解两种模式的差异，有助于你在 AGENTS.md 中编写更精确的指令，引导 Codex 做出更合理的命令构造选择。

### 字符串模式

字符串模式是最直观的方式：直接传入一个完整的 shell 命令字符串，由底层 shell 解释执行。

```python
# 伪代码示意
shell_command("npm test")
shell_command("cat src/index.ts | grep -E 'import|export' | wc -l")
shell_command("find . -name '*.test.ts' -exec rm {} \\;")
```

字符串模式的执行过程：

1. Codex 将完整的命令字符串传递给 shell（通常是 `/bin/sh` 或 `/bin/bash`）
2. shell 负责解析字符串中的管道、重定向、变量展开、命令替换等语法
3. shell 按照解析结果创建子进程并执行

字符串模式的核心优势是**灵活性**。它天然支持所有 shell 特性：

- **管道**：`npm test 2>&1 | grep -E "PASS|FAIL"`
- **重定向**：`npm test > test-output.txt 2>&1`
- **命令替换**：`echo "Found $(grep -c 'TODO' src/*.ts) TODOs"`
- **链式执行**：`npm run build && npm test || echo "Build or test failed"`
- **环境变量**：`NODE_ENV=production npm run build`
- **通配符展开**：`cat src/**/*.test.ts`

这些特性在处理复杂任务时几乎是必需的。比如当你要求 Codex "运行测试并提取失败用例的名称"时，有效的做法通常需要管道组合多个命令。字符串模式让这种组合成为可能。

字符串模式的核心风险是 **shell 注入**。如果命令字符串中包含来自外部输入的内容（比如文件名、用户提供的参数），这些内容可能被 shell 解释为命令语法而不是普通数据。一个经典的例子：

```bash
# 假设文件名是来自某处的动态输入
filename="important file; rm -rf /"
# 字符串模式构造的命令
shell_command(f"cat {filename}")
# 实际执行的是：
# cat important file; rm -rf /
```

在 Codex 的场景下，直接的外部用户输入注入风险相对可控——Codex 自己构造命令，而不是直接把用户输入拼进命令字符串。但间接风险仍然存在：如果 Codex 在遍历文件系统后用文件名构造命令，而文件名恰好包含 shell 元字符（空格、分号、反引号等），就可能触发意外行为。Codex 的沙箱机制会限制这种意外行为的破坏范围，但不会消除行为本身的错误。

### 数组模式

数组模式将命令和每个参数分别作为数组元素传递，绕过 shell 的字符串解析过程。

```python
# 伪代码示意
shell_command(["npm", "test"])
shell_command(["npm", "test", "--", "auth/"])
shell_command(["grep", "-r", "TODO", "src/"])
```

数组模式的执行过程：

1. Codex 将数组第一个元素作为可执行文件路径（或通过 PATH 查找）
2. 后续每个数组元素作为独立的参数直接传递给目标进程
3. 不经过 shell 解析，不存在 shell 元字符的展开和解释

数组模式的核心优势是**安全性**。因为绕过了 shell 解析，以下问题都不存在：

- 文件名中的空格不会导致参数分割：`["cat", "my file.txt"]` 正确处理包含空格的文件名
- 文件名中的分号不会被解释为命令分隔符：`["cat", "file;rm -rf"]` 把整个字符串当作文件名
- 变量不会被展开：`["echo", "$HOME"]` 输出字面量 `$HOME` 而不是家目录路径
- 反引号不会触发命令替换：`["echo", "`whoami`"]` 输出字面量字符串

数组模式的核心限制是**无法使用 shell 特性**。管道、重定向、命令替换、链式执行——这些全部不可用。如果你需要管道组合多个命令，数组模式无法直接实现。它只能调用一个程序，传一组参数。

### 两种模式的对比

| 维度 | 字符串模式 | 数组模式 |
|------|-----------|---------|
| 参数解析 | 由 shell 完成，支持所有 shell 语法 | 由系统调用直接传递，不经过 shell |
| 管道支持 | 支持（`|`） | 不支持 |
| 重定向支持 | 支持（`>`、`>>`、`2>&1`） | 不支持 |
| 命令替换 | 支持（`$()`、反引号） | 不支持 |
| 链式执行 | 支持（`&&`、`||`、`;`） | 不支持 |
| 通配符展开 | 支持（`*`、`?`、`[]`） | 不支持（需程序自行处理） |
| shell 注入风险 | 存在（动态拼接时） | 不存在 |
| 文件名安全性 | 文件名中的元字符可能被解释 | 文件名作为原子参数传递 |
| 适用场景 | 复杂命令组合、输出过滤、多步管道 | 简单单命令、需要安全参数传递的场景 |

### Codex 如何选择执行模式

Codex 不是随机选择执行模式的。它根据任务需求自动判断：

- **简单命令**（运行测试、查看文件、安装依赖）：倾向于数组模式。这类命令参数明确、不需要 shell 特性、安全性更重要。
- **需要管道或重定向的命令**（过滤输出、组合多个命令）：必须使用字符串模式。数组模式无法表达管道语法。
- **包含动态文件名的命令**：如果文件名可能包含特殊字符，Codex 可能选择数组模式以确保安全。但这取决于模型对文件名内容的判断。
- **复杂的多步命令**：字符串模式。数组模式无法表达 `&&`、`||` 等控制流。

作为使用者，你不需要显式指定使用哪种模式。但理解这个机制有助于你编写更好的指令。例如，当你要求 Codex "运行测试并过滤出失败的用例"时，你知道它必须使用字符串模式来构造管道命令。如果你改为"运行测试，将完整输出保存到文件，然后读取文件中的失败信息"，Codex 可以使用两次数组模式调用（第一次重定向输出、第二次读取文件），避免 shell 注入风险。

### 在 AGENTS.md 中引导命令构造

你可以在 AGENTS.md 中添加指令来影响 Codex 的命令构造策略：

```markdown
## 命令执行策略

- 运行测试时，优先使用管道过滤输出，避免完整的测试日志：
  npm test 2>&1 | grep -E "PASS|FAIL|Error" | head -30
- 查找文件时使用 grep 而非 find，输出限制在 50 行以内：
  grep -rn "pattern" src/ | head -50
- 构建命令时将 stderr 重定向到 stdout以便捕获完整输出：
  npm run build 2>&1 | tail -20
```

这些指令的目的是引导 Codex 在构造命令时就考虑输出控制，而不是执行后再处理过长的响应。这是一种前置优化，比后置的截断策略更有效。

## shell_command 的安全限制

shell_command 的执行不是在不受约束的环境中进行的。Codex 的安全模型通过多层机制限制命令执行的范围和能力。理解这些限制有助于你判断哪些任务可以直接交给 Codex 执行，哪些需要调整策略或人工介入。

### 沙箱约束

所有 shell 命令都在沙箱内执行。沙箱通过操作系统内核特性实现文件系统级别的隔离：

- **macOS**：使用 Seatbelt（`sandbox-exec`），通过 Allow/Deny 规则控制文件访问
- **Linux**：使用 Landlock + seccomp，通过内核 LSM（Linux Security Module）限制文件操作

沙箱对 shell_command 的具体约束取决于沙箱模式：

| 沙箱模式 | 文件读取 | 文件写入 | 命令执行 | 网络访问 |
|----------|---------|---------|---------|---------|
| read-only | 工作区内 | 禁止 | 受限 | 禁止 |
| workspace-write | 工作区内 | 工作区内 | 受限 | 禁止 |
| full-access | 无限制 | 无限制 | 无限制 | 允许 |

默认沙箱模式是 workspace-write。这意味着：

- 命令可以读取工作区内的任何文件
- 命令可以在工作区内创建和修改文件
- 命令不能写入工作区外的任何位置（包括 `/tmp`、`~/.config` 等）
- 命令不能建立网络连接

沙箱限制作用于系统调用层面，shell 命令无法绕过。即使 Codex 构造了 `curl https://external-server.com` 这样的命令，在非 full-access 沙箱模式下，`curl` 进程的网络连接请求会被内核级别的沙箱机制拦截。

### 网络访问限制

默认情况下，shell_command 执行的命令无法访问网络。这是一个重要的安全特性，它阻止了以下潜在风险：

- **数据外泄**：命令无法通过网络将代码或敏感信息发送到外部服务器
- **供应链攻击**：命令无法从外部下载和执行恶意脚本
- **未授权的 API 调用**：命令无法访问内部 API 或第三方服务

如果你需要 Codex 执行需要网络访问的命令（比如 `npm install` 从 registry 下载包、`git push` 推送到远程仓库），需要满足以下条件之一：

1. 使用 full-access 模式（`--yolo`），同时沙箱配置为 full-access
2. 在 auto 模式下，Codex 会针对需要网络访问的命令单独请求审批

网络限制也影响一些常见的开发工具。例如 `npm test` 如果配置了覆盖率上报（如 Coveralls），测试过程会尝试网络请求，在受限沙箱下会失败。这种情况需要在测试命令中添加 `--coverage-reporter=text` 或禁用网络上报。

### 受保护目录

即使在 workspace-write 模式下，某些目录也被特别保护，不允许写入操作：

- **`.git/` 目录**：直接修改 Git 内部数据结构可能导致仓库损坏。如果需要 Git 操作，应通过 `git` 命令而非直接文件写入。
- **工作区外的系统目录**：`/etc`、`/usr`、`~/.ssh`、`~/.gnupg` 等系统目录始终不可写入。这防止了 Codex 通过 shell 命令修改系统配置或窃取凭据。
- **其他用户的工作区**：如果系统上有多个用户，Codex 的沙箱限制在当前用户的工作区范围内。

### 危险命令审批

某些命令即使在 auto 模式下也需要人工审批。Codex 维护了一个危险命令模式列表，匹配这些模式的命令会触发审批流程：

| 命令模式 | 风险类型 | 审批要求 |
|----------|---------|---------|
| `rm -rf`、`rm -r` | 不可逆删除 | 所有模式均需审批 |
| `git push --force` | 历史 重写 | 所有模式均需审批 |
| `DROP TABLE`、`DELETE FROM`（SQL） | 数据库修改 | 所有模式均需审批 |
| `chmod 777`、`chown` | 权限修改 | auto 模式需审批 |
| `curl | sh`、`wget | bash` | 远程代码执行 | 所有模式均需审批 |
| `npm publish`、`docker push` | 公开发布 | 所有模式均需审批 |
| `sudo` | 提权操作 | 所有模式均需审批 |

危险命令的判定基于命令模式匹配而非语义分析。这意味着 `echo "rm -rf /"` 不会触发审批（因为 echo 的参数不是实际执行的命令），但 `sh -c "rm -rf /"` 会触发审批（因为 sh 会执行参数中的命令）。

### 安全限制对工程实践的影响

理解安全限制的目的是为了更好地规划任务。以下是几个常见场景的处理策略：

**场景一：需要运行 `npm install` 安装新依赖**

在 workspace-write 沙箱模式下，`npm install` 可以执行，但可能因为网络限制无法从 registry 下载包。解决方案是切换到允许网络访问的执行环境，或者在 auto 模式下让 Codex 针对此命令请求审批。

**场景二：需要读取 `/etc/hosts` 等系统文件**

workspace-write 沙箱允许读取工作区外的文件（read-only 权限通常覆盖全文件系统）。如果读取被拒绝，说明沙箱配置为更严格的模式。可以通过调整沙箱配置解决。

**场景三：需要将临时文件写入 `/tmp`**

默认沙箱不允许写入工作区外的目录。替代方案是在工作区内创建临时目录：

```bash
mkdir -p .codex-tmp
# 将临时文件写入 .codex-tmp/
# 任务完成后清理：rm -rf .codex-tmp
```

## 工具响应截断机制

shell_command 执行命令后，命令的 stdout 和 stderr 输出会作为工具响应返回给模型。这个返回过程受到一个硬性限制：单次工具响应不能超过大约 10,000 tokens（具体数值可能随版本调整，但量级在 10k 左右）。超过这个限制的输出会被截断处理。

### 为什么是 10k tokens

这个限制不是随意设定的，而是上下文窗口管理和信息密度的平衡结果。

Codex 使用的模型有一个固定的上下文窗口（context window），通常在 128k 到 200k tokens 之间。这个窗口需要容纳：

1. **系统提示词**（system prompt）：包含工具定义、安全规则、行为指引，通常占 2k-5k tokens
2. **对话历史**（conversation history）：用户指令和模型之前的响应，可能占 10k-50k tokens
3. **AGENTS.md 内容**：项目级别的指引注入，可能占 1k-10k tokens
4. **工具调用和响应**：每次工具调用的参数和返回值
5. **模型推理的预留空间**：模型需要足够的 token 空间生成响应，通常预留 4k-8k tokens

假设一个典型的任务执行过程涉及 5-10 次工具调用（读取文件、执行命令、搜索代码等），如果每次工具响应不设上限，一个完整的测试输出可能就消耗 50k tokens。这意味着 5 次大型输出就会耗尽整个上下文窗口，模型将无法继续执行任务。

10k tokens 的限制是在这个约束下的工程折衷：

- 足以容纳大多数命令的完整输出（普通的 `npm test` 输出通常在 2k-5k tokens）
- 不会因为单次输出过大而快速消耗上下文预算
- 留出足够的空间给多次工具调用和模型推理
- 超出时通过头尾保留策略尽量保留最关键的信息

### 截断策略：头尾保留，中间截断

当工具响应超过 10k tokens 限制时，Codex 不会简单地从末尾截断。它采用的是"头尾保留、中间截断"的策略：

1. 对输出进行 token 计数
2. 如果总 token 数在限制以内，原样返回
3. 如果超出限制，保留头部的一定比例和尾部的一定比例，中间用截断标记替代

这个策略的伪代码实现：

```python
def truncate_output(output: str, max_tokens: int = 10000) -> str:
    tokens = tokenize(output)
    if len(tokens) <= max_tokens:
        return output

    half = max_tokens // 2
    head = tokens[:half]
    tail = tokens[-half:]
    return detokenize(head) + "\n... [truncated] ...\n" + detokenize(tail)
```

实际实现可能比这个伪代码更复杂，比如会考虑在完整的行边界处截断而不是在 token 边界处截断，以避免截断后出现不完整的代码行。但核心逻辑是一致的。

### 为什么保留头尾

头尾保留策略基于对命令输出结构的经验观察：

**头部的信息价值**：

- 命令回显和环境信息通常在输出开头。比如 `npm test` 的开头会显示测试运行器的版本、配置和测试文件列表
- 编译错误的第一个错误通常在开头，后续错误往往是第一个错误的级联效应
- 命令执行的环境上下文（工作目录、Node.js 版本等）在开头

**尾部的信息价值**：

- 命令的退出状态和总结信息在结尾。比如测试结果摘要、通过/失败数量、总耗时
- 错误信息和堆栈跟踪通常在输出尾部
- 构建或部署的状态总结在结尾

**中间的信息价值**：

- 通常是重复性的详细输出，比如每个测试用例的详细日志、每个文件的编译过程
- 这些信息的密度低，截断后对任务执行的影响最小

一个具体的例子。假设 `npm test` 产生了 30k tokens 的输出：

```
# 头部（保留前 5k tokens）
> my-project@1.0.0 test
> jest --coverage

PASS src/utils/format.test.ts
  formatDate
    ✓ should format ISO string to locale date (5ms)
    ✓ should handle null input (2ms)
  formatCurrency
    ✓ should format USD correctly (3ms)
    ...

... [truncated] ...

# 尾部（保留后 5k tokens）
    at Object.<anonymous> (src/auth/session.test.ts:89:12)
    at processTicksAndRejections (node:internal/process/task_queues:95:5)

Test Suites: 2 failed, 23 passed, 25 total
Tests:       4 failed, 156 passed, 160 total
Snapshots:   0 total
Time:        12.345s
Ran all test suites.
```

头部有测试运行的环境信息，尾部有失败测试的堆栈跟踪和总结数据。中间被截断的部分是大量通过测试的详细输出，这些信息通常不是解决问题的关键。

### 截断的实际影响

截断策略在大多数情况下能保留足够的信息，但有一些场景会导致关键信息丢失：

**场景一：关键信息恰好在中间**

如果你的测试框架在输出中间打印了某个特殊的警告或错误信息，而头部和尾部都是正常的通过测试输出，这条关键信息可能被截断。这种情况下模型无法看到完整的错误上下文。

**场景二：大型单文件输出**

如果 `cat large-file.ts` 的输出超过 10k tokens，截断会丢失文件中间部分的内容。如果模型需要完整理解这个文件，截断会导致分析不完整。

**场景三：多步管道的部分失败**

假设执行了 `npm run build 2>&1 | grep -c "error"`。如果 grep 本身因为某种原因失败了，截断可能只保留了 grep 的错误输出而丢失了构建的上下文信息。

这些场景说明截断不是完美的解决方案，而是一种有损的妥协。工程实践中的应对策略不是期望截断完美工作，而是主动控制输出量，确保关键信息在截断之前就被提取出来。

## 管理大型输出的策略

既然工具响应有 10k tokens 的限制，且截断是有损的，最佳策略是在命令执行阶段就控制输出量，而不是依赖截断机制。以下是几种经过实践验证的策略。

### 策略一：管道过滤

在命令中使用管道组合过滤工具，只保留关键输出行：

```bash
# 只看测试结果的摘要
npm test 2>&1 | tail -20

# 只看编译错误
npm run build 2>&1 | grep -i "error" | head -30

# 只看测试失败的信息
npm test 2>&1 | grep -A 5 "FAIL\|Error\|expect"

# 看构建日志的最后 50 行（通常包含结果摘要）
npm run build 2>&1 | tail -50
```

管道过滤的关键原则是**先限制行数，再限制匹配模式**。`head` 和 `tail` 提供硬性的行数上限，`grep` 提供基于内容的过滤。两者组合可以精确控制输出量。

示例对比：

```bash
# 差：可能产生 30k tokens 的输出
npm test

# 好：限制在 50 行以内，约 2k tokens
npm test 2>&1 | tail -50

# 更好：只提取失败相关信息，约 500 tokens
npm test 2>&1 | grep -E "FAIL|Error|expect" | head -30
```

### 策略二：grep 精确提取

使用 `grep` 的各种参数精确提取需要的行：

```bash
# 提取所有 TODO 注释（带行号）
grep -rn "TODO" src/ | head -30

# 提取特定模式的错误
npm test 2>&1 | grep -E "PASS|FAIL|Error" | head -50

# 提取 import 语句，了解依赖关系
grep -rn "^import" src/auth/ | head -40

# 使用 -c 统计数量而非列出所有匹配
grep -c "console.log" src/**/*.ts
```

`grep` 的 `-E` 参数（扩展正则表达式）特别有用，可以用一个模式匹配多种关键词：

```bash
# 同时匹配多种错误模式
npm test 2>&1 | grep -E "FAIL|Error|TypeError|ReferenceError|SyntaxError"

# 同时匹配多种日志级别
npm run build 2>&1 | grep -E "error|warning|critical"

# 匹配测试摘要行
npm test 2>&1 | grep -E "Tests:|Test Suites:|Snapshots:|Time:"
```

### 策略三：重定向到文件再分段读取

对于必须完整查看的大型输出，先重定向到文件，然后用 `head`/`tail`/`grep` 分段读取：

```bash
# 第一步：将完整输出保存到文件
npm test 2>&1 > .codex-tmp/test-output.txt

# 第二步：读取开头部分
head -50 .codex-tmp/test-output.txt

# 第三步：读取结尾部分（通常有摘要）
tail -30 .codex-tmp/test-output.txt

# 第四步：精确搜索失败信息
grep -n "FAIL" .codex-tmp/test-output.txt
# 然后根据行号读取上下文
sed -n '120,140p' .codex-tmp/test-output.txt
```

这种策略的优势是信息完整——所有输出都保存在文件中，可以根据需要反复读取不同部分。代价是多了一次工具调用（写入文件）和若干次分段读取，总共可能需要 3-5 次工具调用。

与截断相比，这种策略用更多的工具调用次数换取了信息的完整性。在需要精确理解大型输出的场景下（比如分析复杂的测试失败、理解大型构建日志），这是值得的。

### 策略四：在 AGENTS.md 中预设输出控制指令

最有效的策略是在 AGENTS.md 中预先定义输出控制规则，让 Codex 在构造命令时就自动应用过滤策略：

```markdown
## 命令输出控制

所有命令执行应遵循以下规则，避免产生过大输出：

1. 测试命令：始终使用管道过滤，只输出结果摘要和失败信息
   - `npm test 2>&1 | grep -E "PASS|FAIL|Tests:|Error" | head -50`
   - 不要直接运行 `npm test` 获取完整输出

2. 构建命令：只输出最后的构建结果和错误信息
   - `npm run build 2>&1 | tail -30`
   - 构建错误单独提取：`npm run build 2>&1 | grep -i "error" | head -20`

3. 文件搜索：始终限制输出行数
   - `grep -rn "pattern" src/ | head -50`
   - 不要使用不带限制的 `find` 命令

4. 文件读取：不要读取超过 200 行的文件
   - 如果文件很大，先用 `wc -l` 检查行数
   - 大文件使用 `head`/`tail`/`sed` 读取关键部分

5. 日志分析：使用精确的 grep 模式
   - `grep -E "ERROR|WARN" production.log | tail -100`
```

这种策略的优势是**一次配置，持续生效**。Codex 在每次执行相关命令时都会参考 AGENTS.md 中的指令，自动应用过滤策略。这比每次在 prompt 中手动指定过滤规则高效得多。

### 策略选择决策矩阵

不同场景下应选择不同的输出管理策略：

| 场景 | 推荐策略 | 命令示例 | 预期输出量 |
|------|---------|---------|-----------|
| 运行测试 | 管道过滤 | `npm test 2>&1 \| grep -E "PASS\|FAIL" \| head -50` | < 1k tokens |
| 构建项目 | 管道过滤 | `npm run build 2>&1 \| tail -30` | < 1k tokens |
| 搜索代码 | grep 精确提取 | `grep -rn "pattern" src/ \| head -30` | < 1k tokens |
| 分析大型日志 | 重定向+分段 | `cat log \| grep "ERROR" > tmp && head -50 tmp` | 按需控制 |
| 查看大文件 | 分段读取 | `head -100 file.ts` + `tail -50 file.ts` | < 2k tokens/次 |
| 调试复杂失败 | 重定向+分段 | 保存完整输出，按需读取 | 按需控制 |

核心原则是：**在命令层面控制输出，而不是在响应层面依赖截断**。管道和 grep 是第一道防线，重定向和分段读取是第二道防线，截断是最后的兜底机制。

## 上下文预算管理

工具响应截断只是上下文管理的一个方面。更深层的概念是**上下文预算**：每次工具调用都在消耗模型上下文窗口中的可用空间，而上下文窗口是有限的。理解和管理这个预算，直接影响 Codex 完成任务的能力和质量。

### 上下文窗口的构成

一个典型的 Codex 任务的上下文窗口分配如下：

```
上下文窗口（128k-200k tokens）
├── 系统提示词（3k-5k tokens）          # 固定开销
├── AGENTS.md 注入（1k-10k tokens）     # 固定开销
├── 对话历史（5k-30k tokens）           # 随任务进行增长
├── 工具调用和响应（可变）               # 核心消耗
│   ├── 读取文件 x N（每次 1k-10k tokens）
│   ├── 执行命令 x N（每次 0.5k-10k tokens）
│   ├── 搜索代码 x N（每次 1k-5k tokens）
│   └── 写入文件 x N（每次 0.5k-2k tokens）
├── 模型推理（4k-8k tokens）            # 预留空间
└── 剩余可用空间                        # 决定还能做多少操作
```

注意工具调用和响应占据的空间是可变的，也是最容易浪费的。一次 `cat large-file.ts` 可能消耗 10k tokens，而 `grep -n "function" large-file.ts | head -20` 只消耗 500 tokens，获取的信息可能对当前任务同样有效。

### 无效调用及其代价

以下几类工具调用是对上下文预算的浪费：

**过度广泛的搜索**：

```bash
# 浪费：搜索整个仓库，可能返回几百个匹配
grep -rn "import" . | head -100

# 高效：限定在相关目录中搜索
grep -rn "import" src/auth/ | head -30
```

**读取无关文件**：

```bash
# 浪费：读取整个配置文件来找一个端口号
cat config/production.yaml

# 高效：精确提取
grep "port" config/production.yaml
```

**未过滤的大型命令输出**：

```bash
# 浪费：完整的测试输出
npm test

# 高效：过滤后的输出
npm test 2>&1 | grep -E "PASS|FAIL|Error" | head -50
```

**重复读取同一文件**：

如果 Codex 需要多次引用同一个文件的内容，每次读取都消耗一次工具调用和相应的上下文空间。更好的做法是一次读取后在对话历史中保留关键信息，后续通过引用而非重新读取。

### AGENTS.md 的 Architecture 段落如何帮助

AGENTS.md 中的 Architecture 段落是上下文预算管理的核心工具。它告诉 Codex 项目的结构、关键文件的位置和各模块的职责。有了这个信息，Codex 可以精确定位需要读取的文件，而不是广泛搜索。

一个差的 Architecture 描述：

```markdown
## Architecture

This is a Next.js app with TypeScript. The backend uses Prisma and PostgreSQL.
```

这个描述太宽泛，Codex 无法从中判断任何具体文件的位置。

一个好的 Architecture 描述：

```markdown
## Architecture

### 目录结构
- src/app/ - Next.js App Router 页面和 API routes
  - src/app/api/ - 后端 API endpoints
    - src/app/api/auth/ - 认证相关（NextAuth 配置在 src/lib/auth.ts）
    - src/app/api/users/ - 用户 CRUD（Prisma model 在 prisma/schema.prisma 的 User model）
- src/components/ - React 组件
  - src/components/ui/ - shadcn/ui 基础组件
  - src/components/auth/ - 认证相关组件（LoginForm, SignupForm）
- src/lib/ - 工具函数和配置
  - src/lib/db.ts - Prisma client 实例
  - src/lib/auth.ts - NextAuth 配置
  - src/lib/validators.ts - Zod schemas
- prisma/ - 数据库相关
  - prisma/schema.prisma - 数据模型定义
  - prisma/migrations/ - 数据库迁移文件

### 关键文件索引
- 认证流程: src/lib/auth.ts -> src/app/api/auth/[...nextauth]/route.ts
- 数据库操作: src/lib/db.ts -> prisma/schema.prisma
- API 路由: src/app/api/*/route.ts
- 测试: __tests__/ 目录，与源文件同名加 .test.ts 后缀
```

有了这个 Architecture 描述，当用户要求 "修复登录功能的 bug" 时，Codex 可以直接定位到 `src/lib/auth.ts`、`src/app/api/auth/` 和 `src/components/auth/LoginForm.tsx`，而不需要先搜索整个项目来找认证相关的代码。这节省了 3-5 次可能产生大量输出的搜索调用。

### 上下文预算的量化估算

以下是一个典型任务中上下文预算的消耗估算：

| 操作 | 次数 | 每次 token 消耗 | 总消耗 |
|------|------|----------------|-------|
| 系统提示词 | 1 | 4,000 | 4,000 |
| AGENTS.md | 1 | 3,000 | 3,000 |
| 用户初始指令 | 1 | 200 | 200 |
| 读取项目结构 | 1 | 2,000 | 2,000 |
| 读取关键文件 | 3 | 3,000 | 9,000 |
| 搜索相关代码 | 2 | 2,000 | 4,000 |
| 执行测试命令 | 2 | 3,000 | 6,000 |
| 模型推理响应 | 5 | 2,000 | 10,000 |
| **总计** | | | **38,200** |

这个 38k tokens 的总消耗在 128k 的上下文窗口中占了约 30%，留出了充足的空间。但如果搜索和读取操作没有精确控制，消耗可能翻倍甚至三倍：

| 操作 | 次数 | 每次 token 消耗 | 总消耗 |
|------|------|----------------|-------|
| 系统提示词 | 1 | 4,000 | 4,000 |
| AGENTS.md | 1 | 3,000 | 3,000 |
| 用户初始指令 | 1 | 200 | 200 |
| 搜索整个项目 | 3 | 8,000 | 24,000 |
| 读取不确定的文件 | 5 | 5,000 | 25,000 |
| 运行未过滤的测试 | 3 | 8,000 | 24,000 |
| 模型推理响应 | 5 | 2,000 | 10,000 |
| **总计** | | | **90,200** |

90k tokens 的消耗在 128k 的上下文窗口中占了 70%，留给后续操作的空间非常有限。如果任务还需要更多工具调用，模型可能因为上下文不足而无法完成。

这就是为什么输出管理和上下文预算管理不是可选的优化，而是工程实践中的必要措施。每一次多余的 `cat`、每一次未过滤的 `npm test`，都在侵蚀 Codex 完成任务的能力空间。

## 截断感知的命令构造模式

将上述所有知识整合起来，可以总结出一套截断感知的命令构造模式。这套模式的目标是：在命令构造阶段就确保输出量在安全范围内，不依赖截断机制作为主要的信息保护手段。

### 测试类命令

```bash
# 快速检查：测试是否全部通过
npm test 2>&1 | tail -5

# 详细检查：提取所有失败信息
npm test 2>&1 | grep -E "FAIL|Error" -A 3 | head -50

# 针对特定模块运行测试
npm test -- --testPathPattern="auth" 2>&1 | tail -20

# 运行单个测试文件
npx jest src/auth/session.test.ts 2>&1 | grep -E "PASS|FAIL|Error" | head -20
```

### 构建类命令

```bash
# 构建结果摘要
npm run build 2>&1 | tail -10

# 只看错误
npm run build 2>&1 | grep -i "error" | head -20

# TypeScript 类型检查摘要
npx tsc --noEmit 2>&1 | tail -5

# lint 结果
npx eslint src/ 2>&1 | grep -E "error|warning" | head -30
```

### 搜索类命令

```bash
# 函数定义搜索
grep -rn "function handleClick" src/ | head -10

# 类型引用搜索
grep -rn "AuthSession" src/ --include="*.ts" | head -20

# 依赖关系搜索
grep -rn "from.*auth" src/ --include="*.ts" | head -30

# 文件名搜索
find src/ -name "*.test.ts" | head -20
```

### 文件读取命令

```bash
# 先检查文件大小
wc -l src/large-module.ts
# 根据行数决定读取策略

# 小文件（< 200 行）：直接读取
cat src/utils/format.ts

# 大文件：分段读取
head -50 src/large-module.ts
sed -n '100,150p' src/large-module.ts
tail -30 src/large-module.ts

# 精确读取：根据 grep 定位后读取上下文
grep -n "export function authenticate" src/auth/index.ts
# 假设匹配在第 42 行
sed -n '35,60p' src/auth/index.ts
```

### 日志分析命令

```bash
# 错误统计
grep -c "ERROR" server.log

# 最近的错误
grep "ERROR" server.log | tail -20

# 特定时间段的错误
grep "ERROR" server.log | grep "2026-05-26" | head -30

# 错误分布
grep "ERROR" server.log | awk '{print $4}' | sort | uniq -c | sort -rn | head -10
```

## 工具响应的生命周期

理解了截断机制和上下文预算后，可以把工具响应放在完整的生命周期中来看：

```
命令构造 → 命令执行 → 输出生成 → 截断检查 → 响应返回 → 上下文窗口
    ↑                                                          |
    └────── 模型根据响应决定下一步操作 ──────────────────────────┘
```

1. **命令构造**：Codex 根据当前任务状态构造 shell 命令。AGENTS.md 中的指令、之前的工具响应、对话历史都会影响命令的构造。
2. **命令执行**：命令在沙箱环境中执行，受安全限制约束。
3. **输出生成**：命令的 stdout 和 stderr 合并生成原始输出。
4. **截断检查**：如果原始输出超过 10k tokens 限制，按头尾保留策略截断。
5. **响应返回**：截断后（或不需要截断）的输出作为工具响应返回。
6. **上下文窗口**：工具响应被添加到对话历史中，占据上下文窗口的空间。
7. **模型推理**：模型根据完整的对话历史（包括新的工具响应）决定下一步操作——是继续调用工具，还是生成最终响应。

这个循环中的每个环节都有优化的空间：

- 命令构造阶段通过 AGENTS.md 指令优化
- 输出生成阶段通过管道过滤优化
- 截断检查阶段是自动的，无法直接控制
- 上下文窗口管理通过减少无效调用来优化

## 小结

shell_command 的两种执行模式——字符串模式和数组模式——分别服务于灵活性和安全性。Codex 根据任务自动选择合适的模式，你可以通过 AGENTS.md 中的指令影响它的选择偏好。

工具响应的 10k tokens 截断限制不是 bug，而是上下文窗口管理的工程必要。头尾保留策略在大多数情况下能保留关键信息，但最佳实践是在命令构造阶段就控制输出量，而不是依赖截断兜底。

输出管理的四种策略各有适用场景：管道过滤适合日常命令，grep 精确提取适合信息搜索，重定向分段读取适合需要完整信息的调试场景，AGENTS.md 预设指令是最具前瞻性的系统性解决方案。

上下文预算是 Codex 完成任务的底层约束。每一次工具调用都在消耗这个预算，无效调用（过度搜索、未过滤输出、重复读取）不仅浪费时间，更直接削减了 Codex 完成复杂任务的能力。AGENTS.md 的 Architecture 段落是管理这个预算的核心工具——它让 Codex 在第一次调用工具时就能精确定位，而不是盲目搜索。
