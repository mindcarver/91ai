# Vibe Coding 实战：做一个命令行工具

> 更新日期：2026/05

落地页教了你怎么用 AI 做前端视觉项目。这篇换一个完全不同的方向——用 AI 做一个命令行工具。CLI 是 AI Coding Agent 最擅长的领域：文件读写、命令执行、输入输出处理，这些恰好是 Agent 的核心能力。

适合你如果：想做一个自己用的小工具、想处理文件或数据、想在终端里跑而不是浏览器里看。

## 为什么 CLI 是 Vibe Coding 的甜区

落地页和 CLI 工具的迭代方式完全不同：

| 维度 | 落地页 | CLI 工具 |
| --- | --- | --- |
| 反馈方式 | 浏览器预览，看视觉效果 | 终端运行，看输出和退出码 |
| 核心技能 | 视觉判断、布局感觉 | 逻辑思维、边界处理 |
| 常见问题 | 样式不对、移动端崩 | 边界情况遗漏、错误处理缺失 |
| 最佳工具 | Cursor、Bolt.new、v0.dev | Claude Code、Codex |
| 迭代节奏 | 改样式 → 刷新看 → 再改 | 改逻辑 → 跑测试 → 再改 |

CLI 工具的迭代循环更"工程化"：每次改动都可以通过运行命令验证，不需要主观判断"好不好看"。这让 AI Agent 能更自主地工作——给它一个目标，它能自己跑命令、看输出、修复问题、再验证。

## 项目拆解

一个典型的 CLI 工具包含这些部分：

| 模块 | 作用 | AI 生成难度 |
| --- | --- | --- |
| 参数解析 | `--input`、`--output`、`--help` | 低（模式固定） |
| 核心逻辑 | 处理输入、转换数据 | 中（需要明确边界） |
| 错误处理 | 文件不存在、格式错误、权限问题 | 中（容易遗漏） |
| 输出格式化 | 表格、JSON、彩色文本 | 低 |
| 测试 | 单元测试 + 端到端测试 | 低（AI 擅长生成） |

**边界定义模板：**

```
项目目标：做一个命令行工具 [工具名]，[一句话描述做什么]。
输入：[文件路径 / URL / 标准输入 / 命令行参数]
输出：[文件 / 终端输出 / JSON / CSV]
核心功能：
  1. [最核心的功能]
  2. [第二个功能]
  3. [第三个功能]
参数：
  --input：输入文件路径（必填）
  --output：输出文件路径（可选，默认 stdout）
  --format：输出格式 [json|csv|table]（可选，默认 table）
不做：GUI、Web 界面、数据库、网络服务、配置文件热加载
语言：Python（或 Node.js / Go）
```

## 选工具

CLI 工具的工具选择和落地页完全不同：

| 工具 | 适合程度 | 原因 |
| --- | --- | --- |
| **Claude Code** | ⭐⭐⭐ | 终端原生，文件操作和命令执行一体化，能自己跑测试验证 |
| **Codex** | ⭐⭐⭐ | 沙箱隔离执行，适合委托式开发，自动跑测试 |
| **Cursor** | ⭐⭐ | 能做但优势不明显，IDE 对 CLI 工具不是必需的 |
| **Cline** | ⭐⭐ | 类似 Cursor，VS Code 内执行命令 |
| **ChatGPT** | ⭐ | 能生成代码，但不能自主运行和验证 |

**选型建议：**

- 追求最自然的体验 → **Claude Code**（你就在终端里，工具也在终端里）
- 想委托 AI 自己做完 → **Codex**（写好 prompt，让它自己在沙箱里跑完）
- 不确定 → 用你最熟悉的那个

## 初始 Prompt

### 模板：文件处理 CLI

```
帮我从零创建一个 Python 命令行工具。

工具名：csv2json
功能：把 CSV 文件转换成 JSON 格式。

参数：
  positional：输入 CSV 文件路径（必填）
  --output / -o：输出文件路径（可选，默认输出到 stdout）
  --pretty / -p：格式化 JSON 输出（flag，默认关闭）
  --encoding / -e：输入文件编码（默认 utf-8）
  --array / -a：输出格式（默认每行一个 JSON 对象，加此 flag 输出 JSON 数组）

核心逻辑：
1. 读取 CSV 文件，自动检测分隔符（逗号或制表符）
2. 第一行作为 header，后续行作为数据
3. 空字段转成 null 而不是空字符串
4. 数字字段自动转成数字类型（"123" → 123）
5. 输出 JSON

错误处理：
- 文件不存在 → 友好提示 "文件不存在: xxx"
- 文件格式错误 → 提示具体哪一行有问题
- 编码错误 → 提示尝试用 --encoding 指定编码
- 没有参数 → 显示 help 信息

项目结构：
  csv2json.py：主程序（单文件，用 argparse）
  README.md：使用说明（包含安装和示例）

不做：pip 包发布、配置文件、GUI、Web 界面、多线程。

完成后运行以下命令验证：
  python csv2json.py test.csv
  python csv2json.py test.csv --pretty
  python csv2json.py test.csv -o output.json
  python csv2json.py --help
```

**这个 prompt 的关键设计：**

1. **参数全部列出来** —— CLI 工具的参数就是接口，模糊定义会导致 AI 自己发明参数名
2. **核心逻辑逐步描述** —— 每一步都是可验证的（空字段→null、数字自动转换）
3. **错误处理单独列出** —— 不列的话 AI 通常只写 happy path
4. **验证命令写出来** —— AI 能直接跑这些命令确认功能正确

### 模板：数据抓取 CLI

```
帮我从零创建一个 Python 命令行工具。

工具名：ghstats
功能：获取 GitHub 仓库的基本统计信息。

参数：
  positional：GitHub 仓库路径（格式：owner/repo，如 facebook/react）
  --token / -t：GitHub token（可选，不带 token 限制每小时 60 次请求）
  --output / -o：输出到文件（可选，默认 stdout）
  --format：输出格式 [json|table]（默认 table）

核心功能：
1. 调用 GitHub API 获取仓库信息
2. 显示：stars、forks、open issues、最近更新时间、主要语言、license
3. table 格式对齐输出，json 格式输出结构化数据

错误处理：
- 仓库不存在 → "仓库不存在: owner/repo"
- 网络错误 → "网络请求失败: [具体错误]"
- rate limit → 提示使用 --token

使用 requests 库，不使用 PyGithub。
单文件实现。
完成后用 python ghstats.py facebook/react 验证。
```

## 迭代策略

CLI 工具的迭代和落地页不同——不需要"看效果"，而是"跑测试"。

### 第一轮：跑通 happy path

第一轮只有一个目标：核心功能跑通。

```
验证步骤：
1. 准备一个测试输入文件 test.csv
2. 运行 python csv2json.py test.csv
3. 确认输出是合法 JSON
4. 确认字段名正确
5. 确认数字字段被正确转换
```

如果这一步就失败，把错误信息直接贴给 AI：

```
运行 python csv2json.py test.csv 后输出：
Traceback (most recent call last):
  File "csv2json.py", line 15, in <module>
    reader = csv.reader(f)
_csv.Error: line contains NUL
测试文件第一行是：name,age,city

请修复这个问题。
```

**CLI 调试的黄金法则：永远把完整的错误输出贴给 AI。** 不要自己总结"好像有个编码问题"，AI 看到完整 traceback 才能精准定位。

### 第二轮：处理边界情况

Happy path 跑通后，测试边界情况：

| 测试场景 | 预期行为 | 常见问题 |
| --- | --- | --- |
| 空文件 | 提示"文件为空" | 直接崩溃或输出 `[]` |
| 只有 header | 输出空数组 | 崩溃 |
| 字段包含逗号（引号包裹） | 正确解析 | CSV 解析错误 |
| 字段包含换行 | 正确解析 | 行错位 |
| 超大文件（100MB+） | 能处理或提示文件过大 | 内存溢出 |
| 中文内容 | 正确显示 | 编码问题 |
| 不存在的文件路径 | 友好提示 | FileNotFoundError 堆栈 |
| 没有参数 | 显示 help | IndexError |

逐个测试，发现问题就贴给 AI：

```
测试发现两个问题：
1. 运行 python csv2json.py 不带参数时，报 IndexError 而不是显示 help
2. CSV 中有引号包裹的字段（如 "Smith, John"），输出时被拆成两列

请修复这两个问题。
```

### 第三轮：加测试和文档

功能稳定后，让 AI 生成测试：

```
给 csv2json.py 补充单元测试，覆盖以下场景：
1. 正常 CSV 输入
2. 空文件
3. 只有 header
4. 字段包含逗号和换行
5. 数字和 null 转换
6. 文件不存在
7. 编码错误

使用 pytest，测试文件放在 test_csv2json.py。
```

然后写 README：

```
给 csv2json.py 写一个 README.md，包含：
1. 一句话描述
2. 安装方式（只需要 Python 3.8+，无额外依赖）
3. 使用示例（4-5 个常见用法）
4. 参数说明
```

### 迭代节奏总结

| 轮次 | 关注点 | 时间占比 | 止损信号 |
| --- | --- | --- | --- |
| 第 1 轮 | Happy path 跑通 | 30% | 改了 3 轮还没跑通 → 初始 prompt 可能有问题，重写 |
| 第 2 轮 | 边界情况 | 40% | 每个边界都出问题 → 核心逻辑架构不对，考虑重构 |
| 第 3 轮 | 测试 + 文档 | 30% | 不需要止损，这一轮是加固 |

## 让 AI 自主跑完整个流程

CLI 工具有一个落地页没有的优势：AI 可以自己验证结果。

**Claude Code 的自主开发模式：**

```
帮我做一个 Python CLI 工具 csv2json，[完整需求如上]。

完成后请自己验证：
1. 创建一个测试 CSV 文件
2. 运行所有核心功能
3. 测试边界情况（空文件、不存在的路径、无参数）
4. 修复发现的所有问题
5. 确认 python csv2json.py --help 正常显示

全部通过后再告诉我完成。
```

**Codex 的委托模式：**

```
做一个 Python CLI 工具 csv2json，[完整需求]。
写完后运行 python csv2json.py [测试文件] 验证。
如果失败就自动修复，直到所有测试通过。
```

两种方式的区别：Claude Code 在终端里实时执行和反馈，你能看到过程；Codex 在沙箱里自主完成，你只看最终结果。

## 常见坑

### 1. AI 用了你系统没装的库

**症状：** `ModuleNotFoundError: No module named 'rich'`

**原因：** AI 默认可能用 `rich`、`click`、`typer` 等第三方库美化输出，但你的环境没装。

**修复：** prompt 里明确写"只使用 Python 标准库"或"使用 requests（已安装），其他只用标准库"。如果已经生成了，让 AI 替换：`把 rich 替换成标准库实现，不要引入额外依赖。`

### 2. 错误处理只有 happy path

**症状：** 正常输入能跑，任何异常输入直接崩溃，堆栈信息暴露给用户。

**原因：** AI 默认不写防御性代码，除非你明确要求。

**修复：** 在 prompt 里单独列出需要处理的错误类型（如模板所示）。如果已经生成了代码，追加：`给所有用户输入和文件操作加 try-except，错误信息用 print 输出到 stderr，不要暴露 traceback。退出码用 1 表示错误。`

### 3. 编码问题

**症状：** 处理中文文件时报 `UnicodeDecodeError`。

**原因：** AI 默认用 UTF-8 打开文件，但实际文件可能是 GBK 或 Latin-1。

**修复：** 在 prompt 里加 `--encoding` 参数。代码中用 `encoding=encoding` 而不是硬编码 UTF-8。如果已有代码：`打开文件时使用 --encoding 参数指定的编码，捕获 UnicodeDecodeError 并提示用户尝试其他编码。`

### 4. 输出格式不符合预期

**症状：** 你想要 JSON 数组，AI 输出了每行一个 JSON 对象（或反过来）。

**原因：** 两种 JSON 输出格式都是合理的，AI 不知道你要哪种。

**修复：** 在 prompt 里明确说"输出一个 JSON 数组"或"每行输出一个 JSON 对象（JSONL 格式）"。加一个 `--format` 参数让用户选择更好。

### 5. 路径处理不跨平台

**症状：** Windows 上路径分隔符 `\` 没有被正确处理。

**原因：** AI 生成的路径拼接用了 `+` 或 f-string 而不是 `pathlib`。

**修复：** 让 AI 用 `pathlib` 处理所有路径操作：`用 pathlib 处理文件路径，确保跨平台兼容。`

## 要点总结

- **CLI 是 AI Agent 的甜区：** 能自己跑命令、看输出、修 bug，迭代效率高
- **工具选择：** Claude Code 或 Codex，不需要 IDE
- **prompt 要列全：** 参数、核心逻辑、错误处理、验证命令——CLI 的接口定义清楚了，AI 生成质量就高
- **错误信息直接贴：** 不要总结，给 AI 完整的 traceback
- **边界情况单独测：** 空文件、编码、路径、无参数——这些 AI 容易遗漏
- **自主验证：** CLI 工具可以让 AI 自己跑完整个开发+验证流程

## 延伸

- 回到 [Vibe Coding 实战总览](./vibe-coding.md) — 完整的方法论框架
- 落地页实战 → [实战：落地页](./vibe-coding-landing-page.md) — 前端视觉项目的迭代方法
- 想深入了解终端工具 → [Claude Code](./claude-code.md) / [Codex](./openai-codex.md) 专题
- 想用 AI 编程变现 → [AI 编程接单](../ai-money/10-ai-coding-freelance.md)

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
