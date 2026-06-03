# --bare 和脚本速度优化

> 更新日期：2025/06

**TL;DR：** `claude -p --bare "你的指令"` 跳过 hooks、LSP、插件同步、skill 目录扫描等启动开销，专门给脚本调用用的。它要求提前配好 API Key，不会走交互式登录。如果你的 CI 流水线或批量脚本里要频繁调 Claude Code，这是最快的方式。

## 为什么这很重要

Claude Code 启动不是只读一个配置文件就完事。它要做一连串初始化：找 CLAUDE.md、连 MCP 服务器、注册 hooks、扫插件、起 LSP……日常开发中这些都有用，但脚本场景下纯属浪费时间。

试想你的 CI 里有个步骤：对 50 个文件分别调 Claude Code 做代码审查。每个文件启动一次，每次多花 2 秒在初始化上，光等启动就要多等 100 秒。`--bare` 就是干掉这部分浪费的。

## Claude Code 启动时加载了什么

一次完整的 Claude Code 启动大致经过这些步骤：

```
1. 读取命令行参数
2. 查找并加载 CLAUDE.md（企业级 → 用户级 → 项目级 → 项目本地级）
3. 解析 CLAUDE.md 中的 @import 指令，递归加载
4. 连接配置的 MCP 服务器（每个服务器独立启动进程）
5. 注册 Hooks（PreToolUse、PostToolUse、SessionStart 等）
6. 扫描 skill 目录
7. 同步插件
8. 启动 LSP（语言服务协议）客户端
9. 加载 memory 文件
10. 初始化权限系统
11. 开始处理你的请求
```

其中第 2-9 步都是「准备工作」，跟你的实际任务无关。在交互式开发中，这些准备让你后续操作更顺畅（比如 MCP 提供额外工具，hooks 做安全检查）。但在 `-p` 脚本模式下，任务执行完进程就退出了，这些准备大多数白做。

### 启动开销从哪来

几个主要的时间消耗源：

- **MCP 服务器启动**：每个 MCP 服务器是一个独立进程，启动时间取决于服务器实现，快的几百毫秒，慢的几秒。配了 3-5 个 MCP 服务器，光等它们就绪就可能花 2-5 秒。
- **CLAUDE.md 扫描**：Claude Code 会从项目根目录开始向上查找，读所有层级的 CLAUDE.md。如果文件多、import 层级深，I/O 时间不低。
- **Skill 目录遍历**：扫描 `.claude/skills/` 目录下的所有文件。
- **插件同步**：检查远程插件仓库的更新状态。
- **LSP 初始化**：启动语言服务器（如 TypeScript Language Server），需要加载项目类型信息。

## --bare 跳过了什么

加上 `--bare` 后，Claude Code 跳过以下所有步骤：

| 被跳过的组件 | 正常启动时的作用 | 脚本场景是否需要 |
|-------------|----------------|----------------|
| Hooks | 工具调用前后的自定义脚本 | 通常不需要 |
| LSP | 代码补全、类型检查 | `-p` 模式不用 |
| 插件同步 | 从远程拉取插件更新 | 脚本不需要 |
| Skill 目录扫描 | 加载自定义 skill | 大多数脚本不需要 |
| MCP 服务器连接 | 提供额外工具能力 | 按需决定 |

### 基本用法

```bash
# 最简单的 bare 模式调用
claude -p --bare "列出 src/ 目录下的所有 TypeScript 文件"

# 配合工具权限
claude -p --bare --allowedTools "Read,Bash,Grep" "检查 package.json 里的依赖版本"

# 输出 JSON 格式，方便脚本解析
claude -p --bare --output-format json "这个函数的复杂度是多少？"
```

### 认证要求

`--bare` 跳过了交互式登录流程，所以你必须提前配好认证：

```bash
# 方式一：设置环境变量（最常用）
export ANTHROPIC_API_KEY="sk-ant-xxxxx"
claude -p --bare "你的 prompt"

# 方式二：在 settings.json 里配置 apiKeyHelper
# .claude/settings.json
{
  "apiKeyHelper": "/path/to/your/key-script.sh"
}
```

如果不配认证直接用 `--bare`，会直接报错退出，不会弹出浏览器让你登录。

## 使用场景对比

### 什么时候用 --bare

```bash
# CI/CD 流水线：代码审查步骤
# 每次调用都是独立进程，不需要 hooks 和 MCP
for file in $(git diff --name-only main); do
  claude -p --bare --allowedTools "Read" \
    "审查 $file 的代码质量，指出潜在问题" >> review-results.txt
done

# 批量文件处理：生成文档摘要
# 纯文本处理，不需要任何额外工具
find ./src -name "*.ts" -exec sh -c '
  claude -p --bare "为这个文件写一行摘要: $(cat "$1")" > "$1.summary.txt"
' _ {} \;

# Makefile 里的自动化任务
lint-review:
	claude -p --bare --allowedTools "Read,Bash" \
	  "跑 npm run lint，分析输出，给出修复建议"

# Git hook 里的提交信息生成
# .git/hooks/prepare-commit-msg
claude -p --bare --allowedTools "Bash" \
  "根据 git diff --cached 生成简洁的 commit message" > "$1"
```

### 什么时候不用 --bare

```bash
# 需要 MCP 工具（比如 Playwright 浏览器测试）
claude -p "用 Playwright 打开 localhost:3000 截图" \
  --allowedTools "mcp__playwright__*"

# 需要 hooks 做安全检查（比如防止修改生产配置）
# hooks 会在写入操作前拦截，--bare 会跳过这个保护
claude -p "修改 nginx.conf" --allowedTools "Edit"

# 需要 skill 里的自定义能力
claude -p "用 custom-deploy skill 部署到 staging"

# 正常交互式开发
claude  # 别加 --bare，你日常开发需要所有这些功能
```

### 速度对比

以下是一个粗略的参考（实际数据取决于你的项目大小和 MCP 配置）：

| 模式 | 启动开销（大约） | 适用场景 |
|------|-----------------|---------|
| `claude`（交互模式） | 3-8 秒 | 日常开发 |
| `claude -p`（非交互） | 3-8 秒 | 脚本，但需要 MCP/hooks |
| `claude -p --bare` | 0.5-2 秒 | 纯脚本，不需要额外能力 |

差距主要来自 MCP 服务器启动和目录扫描。如果你配了很多 MCP 服务器，`--bare` 的提速效果更明显。

## 其他速度优化技巧

`--bare` 是最直接的提速手段，但还有其他方法可以配合使用。

### 环境变量控制

```bash
# 禁用非必要的网络请求（遥测、自动更新检查等）
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

# 禁用自动更新器
export DISABLE_AUTOUPDATER=1

# 禁用遥测
export DISABLE_TELEMETRY=1

# 禁用非必要的模型调用（比如一些内部的辅助请求）
export DISABLE_NON_ESSENTIAL_MODEL_CALLS=1

# 设置 MCP 超时（毫秒），避免慢 MCP 服务器拖累启动
export MCP_TIMEOUT=5000

# 组合使用
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
export DISABLE_AUTOUPDATER=1
claude -p --bare "你的 prompt"
```

### 精简 CLAUDE.md

即使不用 `--bare`，也可以通过减少 CLAUDE.md 的体积来加速启动：

```bash
# ❌ 项目 CLAUDE.md 里塞了 500 行的编码规范
# Claude Code 每次启动都要读、解析、注入 context

# ✅ 保持 CLAUDE.md 精简，把大段规范放到单独文件
# CLAUDE.md 里只写核心规则（50 行以内），需要时用 @import 引入
```

### 关闭不需要的 MCP 服务器

```json
// .claude/settings.json
// 注释掉或删除不常用的 MCP 服务器
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    }
    // "playwright": { ... }  // CI 里不需要浏览器，注释掉
    // "context7": { ... }    // 简单脚本不需要查文档
  }
}
```

每个 MCP 服务器都是独立进程，少配一个就少等一个启动。对于脚本场景，只保留真正需要的那一两个。

### 用 disableAllHooks 全局关闭 hooks

如果你不想用 `--bare`（因为还需要 MCP 或 skill），但想关掉 hooks：

```json
// .claude/settings.json
{
  "disableAllHooks": true
}
```

也可以只关闭特定事件类型的 hook。

### 减少工具权限范围

工具权限列表越短，权限检查越快：

```bash
# ❌ 给了一堆工具，但实际只用 Read
claude -p --bare --allowedTools "Read,Write,Edit,Bash,Grep,Glob" "读一下 README"

# ✅ 只给需要的
claude -p --bare --allowedTools "Read" "读一下 README"
```

### 组合优化：CI 里的最佳实践

```bash
#!/bin/bash
# ci-code-review.sh — CI 流水线里的代码审查脚本

# 1. 环境准备
export ANTHROPIC_API_KEY="${CI_API_KEY}"
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
export DISABLE_AUTOUPDATER=1
export DISABLE_TELEMETRY=1

# 2. 获取变更文件
CHANGED_FILES=$(git diff --name-only origin/main...HEAD)

# 3. 逐文件审查（bare 模式 + 最小工具集）
for file in $CHANGED_FILES; do
  echo "=== 审查: $file ==="
  claude -p --bare \
    --allowedTools "Read" \
    --max-turns 2 \
    "审查 $file 的代码质量。只指出真正的问题，不要说废话。" \
    2>/dev/null
  echo ""
done
```

`--max-turns 2` 限制 Claude 最多做两轮工具调用，防止它在某个文件上花太多时间。

## 关键要点

1. **`--bare` 专为脚本设计**：跳过 hooks、LSP、插件同步、skill 扫描，把启动开销从几秒压到一秒以内。
2. **必须提前配好认证**：`--bare` 不支持交互式登录，用 `ANTHROPIC_API_KEY` 环境变量或 `apiKeyHelper` 配置。
3. **只跟 `-p` 一起用**：`--bare` 只在非交互模式下有意义。交互模式需要这些启动加载的功能。
4. **环境变量能进一步提速**：`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`、`DISABLE_AUTOUPDATER`、`MCP_TIMEOUT` 配合 `--bare` 效果更好。
5. **精简配置本身就是优化**：少配 MCP 服务器、保持 CLAUDE.md 精简、只声明需要的工具权限——这些习惯在任何模式下都有用。

## 延伸阅读

- [15 - 非交互模式](./15-non-interactive-mode.md)：`-p` 模式的完整用法，`--bare` 的前置知识
- [25 - CLI Flags 总览](./25-cli-flags-reference.md)：所有命令行参数的速查表
- [69 - Headless 模式](./69-headless-mode.md)：无头模式的高级用法，适合更复杂的自动化场景
- [70 - GitHub Actions / GitLab CI](./70-github-actions-gitlab-ci.md)：在 CI 流水线里集成 Claude Code 的完整方案
