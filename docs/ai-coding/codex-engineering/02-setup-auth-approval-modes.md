# 安装、认证和审批模式：从第一次运行到安全基线

**TL;DR：** Codex 的安装本身没有难度，真正的工程决策在于认证方式选择和审批模式配置。认证方式决定了谁能用、怎么计费、数据流向哪里；审批模式决定了 Codex 能自主执行到什么程度、什么操作需要人确认。第一次运行之前把这两件事想清楚，比事后补救成本低几个数量级。

## 安装

Codex 是一个 Node.js CLI 工具，官方提供两种安装方式。此外还有一个平台兼容性的问题需要处理。

### npm 全局安装

```bash
npm i -g @openai/codex
```

这是最直接的方式。前提是系统已经安装了 Node.js 22 或更高版本。可以用以下命令确认：

```bash
node --version
# 需要 v22.0.0 或以上

npm --version
# 需要 npm 10+ 来保证全局安装的依赖解析正确
```

安装完成后验证：

```bash
codex --version
codex --help
```

如果 `codex` 命令找不到，检查 npm 全局 bin 目录是否在 PATH 中：

```bash
npm config get prefix
# 输出类似 /usr/local，那么 bin 目录是 /usr/local/bin
# 确认这个目录在 $PATH 中
echo $PATH | tr ':' '\n' | grep npm
```

如果不在 PATH 中，在 shell 配置文件（`~/.zshrc` 或 `~/.bashrc`）中添加：

```bash
export PATH="$(npm config get prefix)/bin:$PATH"
```

### Homebrew 安装（macOS）

```bash
brew install codex
```

Homebrew 安装的优势在于自动处理 Node.js 依赖关系。如果你已经通过 Homebrew 安装了 Node.js，Codex 会直接链接到已有的 Node 运行时。版本更新也更方便：

```bash
brew upgrade codex
```

需要注意的是，npm 全局安装和 Homebrew 安装不要混用。混用会导致两个问题：一是版本冲突，`which codex` 可能指向不同安装路径下的不同版本；二是卸载时容易遗漏，以为已经卸载了但另一个安装路径下还有残留。选定一种方式，坚持使用。

### 平台支持矩阵

| 平台 | 支持状态 | 安装方式 | 注意事项 |
|------|----------|----------|----------|
| macOS (Apple Silicon) | 原生支持 | npm 或 Homebrew | 沙箱基于 Seatbelt，开箱即用 |
| macOS (Intel) | 原生支持 | npm 或 Homebrew | 同上，Seatbelt 在 Intel 上同样原生可用 |
| Linux (x86_64) | 原生支持 | npm | 沙箱基于 Landlock + seccomp，内核 5.13+ |
| Linux (ARM64) | 支持 | npm | 部分发行版的 Landlock 支持不完整，需要验证 |
| Windows (PowerShell) | 实验性支持 | npm（需要 Node.js） | 沙箱不可用，所有文件操作无隔离 |
| Windows (WSL2) | 支持 | npm（在 WSL2 内） | 走 Linux 的沙箱机制，推荐此方式使用 |

Windows 原生 PowerShell 环境下 Codex 可以运行，但沙箱机制不可用。沙箱是 Codex 安全模型的核心组件，它通过操作系统内核特性限制 Codex 的文件系统访问范围。macOS 用 Seatbelt（`sandbox-exec`），Linux 用 Landlock 和 seccomp。Windows 没有等价的内核级沙箱机制，这意味着 Codex 在 Windows 原生环境下对文件系统的任何操作都没有隔离保护。

如果你在 Windows 上使用 Codex，推荐通过 WSL2 运行。WSL2 的 Linux 内核支持 Landlock，沙箱可以正常工作。设置步骤：

```powershell
# 在 PowerShell 中
wsl --install
# 重启后进入 WSL2
wsl

# 在 WSL2 内部
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
npm i -g @openai/codex
```

Linux 环境下需要确认内核版本满足 Landlock 要求：

```bash
uname -r
# 5.13 或更高版本

# 如果内核版本不够，沙箱会退化为 no-op 模式
# 此时 Codex 仍然可以运行，但没有文件系统隔离
```

## 认证

Codex 有三种认证方式，对应不同的使用场景、计费模型和数据流路径。选择哪种认证方式不仅影响你的账单，还决定了你的代码和 prompt 数据流向哪里。

### 方式一：ChatGPT 登录

```bash
codex --login
```

执行后会打开浏览器，跳转到 ChatGPT 的 OAuth 登录页面。登录成功后，终端会显示认证成功的确认信息。此方式需要以下订阅之一：

- ChatGPT Plus（$20/月）
- ChatGPT Pro（$200/月）
- ChatGPT Team（$25/用户/月）

认证后的 token 存储在本地，具体位置是 `~/.codex/auth.json`。Token 有效期有限，过期后需要重新登录。

ChatGPT 登录的请求路径是：

```
chatgpt.com/backend-api/codex/responses
```

这意味着你的代码上下文和 prompt 数据会发送到 ChatGPT 的后端 API，而不是标准的 OpenAI API 平台。计费包含在 ChatGPT 订阅中，不单独按 Token 收费，但用量受限于订阅等级的速率配额。

这种方式的特点：

- **无需管理 API Key**。没有密钥泄露的风险，也不需要在 CI/CD 中配置环境变量。
- **用量配额而非按量计费**。每月固定费用，适合日常高频使用。但配额用完后会被限速，不像 API Key 那样可以无限调用。
- **数据流经过 ChatGPT 后端**。代码上下文的处理路径和直接使用 API 不同。如果你的组织有数据驻留要求，需要确认这一点。

### 方式二：API Key

```bash
export OPENAI_API_KEY="sk-..."
```

API Key 可以在 OpenAI Platform 的 API Keys 页面生成。设置环境变量后，Codex 自动使用 API Key 认证，不需要执行 `--login`。

API Key 的请求路径是：

```
api.openai.com/v1/responses
```

这是标准的 OpenAI API 端点，使用 Responses API（不是 Chat Completions API）。计费按 Token 用量，模型不同价格不同。Codex 默认使用的模型是 `codex-mini-latest`，也可以通过配置指定其他模型。

API Key 方式的特点：

- **按量计费，精确控制成本**。每次调用的 Token 用量都可以在 OpenAI Dashboard 中查看。适合需要精确追踪成本的场景。
- **适合 CI/CD 和脚本化**。API Key 可以设置为环境变量或 CI Secret，无需人工交互。这是自动化流水线中唯一可行的认证方式。
- **速率限制可预测**。API Key 的速率限制基于账户等级（Tier 1-5），比 ChatGPT 订阅的配额更透明。
- **密钥管理责任在用户**。泄露 API Key 等于泄露了你的 OpenAI 账户的调用权限。不要把 Key 硬编码在代码中，不要提交到 Git 仓库，使用 `.env` 文件或 CI Secret 管理。

设置 API Key 的推荐方式：

```bash
# 不要在 shell 配置文件中硬编码
# 使用 .env 文件或专门的 secrets 管理工具

# 方式一：在项目根目录创建 .env（确保 .gitignore 包含 .env）
echo 'OPENAI_API_KEY=sk-...' >> .env

# 方式二：临时设置，仅当前会话有效
export OPENAI_API_KEY="sk-..."

# 方式三：使用 direnv（推荐）
# 在项目根目录创建 .envrc
echo 'export OPENAI_API_KEY="sk-..."' >> .envrc
direnv allow
```

### 方式三：--oss 模式（本地模型）

```bash
export OPENAI_BASE_URL="http://localhost:11434/v1"
codex --oss
```

`--oss` 模式允许 Codex 使用本地运行的模型，不向任何外部服务发送数据。模型通过兼容 OpenAI API 格式的本地服务提供，常用的有：

- **Ollama**：默认监听 `localhost:11434`
- **LM Studio**：默认监听 `localhost:1234`
- **vLLM**：默认监听 `localhost:8000`

`--oss` 模式的请求路径是：

```
localhost:11434/v1/responses
```

所有数据都在本地环回网络中传输，不经过任何外部服务器。

设置 Ollama 作为后端的完整流程：

```bash
# 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 拉取模型（推荐至少 7B 参数的代码模型）
ollama pull codellama:13b
# 或
ollama pull deepseek-coder-v2:16b

# 启动 Ollama 服务（通常安装后自动启动）
ollama serve

# 配置 Codex 使用 Ollama
export OPENAI_BASE_URL="http://localhost:11434/v1"
codex --oss
```

`--oss` 模式的特点：

- **完全离线运行**。不需要网络连接，代码和 prompt 不会离开本机。适合处理敏感代码库的场景。
- **模型质量是瓶颈**。本地模型的能力远不如 Codex 默认的云端模型。代码生成质量、指令遵循能力和上下文理解都会显著下降。
- **硬件要求高**。13B 参数模型至少需要 8GB VRAM，33B 需要 24GB，70B 需要 48GB 以上。内存不足会导致推理极慢或直接失败。
- **Responses API 兼容性不完整**。Ollama 和 LM Studio 的 API 兼容层不一定完整支持 Responses API 的所有特性。部分 Codex 功能可能异常。

### 认证方式选择

| 维度 | ChatGPT 登录 | API Key | --oss 模式 |
|------|-------------|---------|-----------|
| 适用场景 | 日常开发 | CI/CD、脚本化、团队统一管理 | 离线环境、隐私敏感代码 |
| 计费方式 | 订阅包含，按配额 | 按 Token 用量 | 免费（自有硬件成本） |
| 数据流向 | chatgpt.com 后端 | api.openai.com | localhost |
| 密钥管理 | OAuth token 自动刷新 | 手动管理，需防泄露 | 无需密钥 |
| 模型质量 | 最优（云端最新模型） | 最优（同上） | 取决于本地模型 |
| 网络要求 | 需要联网 | 需要联网 | 完全离线 |
| 自动化支持 | 不支持（需要浏览器交互） | 完全支持 | 完全支持 |
| 推荐用途 | 个人开发者日常使用 | 团队和自动化场景 | 安全要求极高的场景 |

实际选择建议：

**个人开发者**先用 ChatGPT 登录。零配置，打开就用。当你发现自己需要在 CI 里跑 Codex 或者需要精确追踪成本时，再切换到 API Key。

**团队环境**直接用 API Key。统一的环境变量管理，用量可审计，不会出现有人用个人 ChatGPT 账号导致数据流向不一致的问题。

**离线或高安全场景**用 `--oss`。但要做好模型质量下降的准备，建议先用标准模式完成核心开发，再用 `--oss` 模式处理不能上云的代码部分。

## 审批模式

审批模式是 Codex 安全模型的第一道防线。它控制的是 Codex 在执行过程中对每一步操作的审批策略：哪些操作自动执行，哪些需要人工确认。

Codex 提供三种审批模式。选择哪种模式不是"方便 vs 安全"的简单二选一，而是要根据当前任务的风险等级、工作区的可恢复性和你对 Codex 输出质量的信任度综合判断。

### ask 模式（默认）

```bash
codex --ask-for-approval always
# 或直接运行，ask 是默认值
codex
```

在 ask 模式下，Codex 每一步操作都需要人工确认。这包括：

- 文件读取
- 文件写入和修改
- Shell 命令执行
- 目录遍历

每一步操作执行前，终端会显示操作的详细内容并等待用户输入 `y`（确认）或 `n`（拒绝）。例如：

```
Codex wants to run: npm test -- --watchAll=false
Allow? [y/n]: y

Codex wants to edit: src/utils/format.ts
- Remove line 42 (unused import)
- Add line 45 (new utility function)
Allow? [y/n]: y
```

ask 模式的适用场景：

- **第一次使用 Codex**。你需要观察 Codex 的行为模式，理解它如何分解任务、如何选择工具、生成的代码质量如何。ask 模式提供了完整的可见性。
- **高风险操作**。涉及数据库迁移、生产环境配置、安全相关代码修改等不可逆操作时，每一步确认是最安全的策略。
- **不熟悉的项目**。在一个你不了解的代码库中工作时，ask 模式可以防止 Codex 在错误的位置做错误的修改。

ask 模式的代价是效率低。一个中等复杂度的任务可能需要 20-50 步操作，每步都确认意味着大量的人工交互。这种交互开销在重复性任务中尤其明显——如果 Codex 要修改 10 个文件中相同模式的代码，你需要按 10 次 `y`。

### auto 模式

```bash
codex --ask-for-approval never
# 或
codex -a never
```

auto 模式下，Codex 在当前工作区内的操作自动执行，不需要人工确认。但以下操作仍然需要确认：

- 涉及工作区外部路径的文件操作（如修改 `~/.bashrc`）
- 删除文件的命令（`rm`、`git clean` 等）
- 网络相关的命令（`curl`、`wget` 等）
- Git push 等远程操作
- 安装新依赖（`npm install`、`pip install` 等）

auto 模式的适用场景：

- **日常开发**。在你熟悉的项目中做常规的代码修改、重构、测试编写。工作区内的修改可以自动执行，因为任何改动都在 Git 的版本控制之下，可以随时回退。
- **信任已建立**。你已经用过 Codex 足够多次，知道它的输出质量在什么水平，哪些类型的任务它做得好，哪些需要额外审查。
- **Git 保护的工作流**。只要工作在 Git 分支上，任何自动执行的修改都可以通过 `git diff` 审查和 `git checkout` 回退。这使得 auto 模式的风险可控。

auto 模式的隐含前提是你有 Git 保护。如果你在一个没有 Git 仓库的目录中以 auto 模式运行 Codex，任何文件修改都是不可逆的。这是使用 auto 模式前必须确认的前提条件。

### full-access 模式（--yolo）

```bash
codex --yolo
# 等价于
codex --full-auto
```

full-access 模式（也叫 yolo 模式）下，所有操作自动执行，没有任何人工确认步骤。同时会启用以下额外能力：

- 网络访问（Web Search）
- 实时搜索（Live Search）
- 所有 Shell 命令的执行权限，包括需要网络访问的命令
- 工作区外部的文件操作

这是权限最大的模式，也是风险最高的模式。

full-access 模式的适用场景：

- **低风险批量任务**。比如批量重命名文件、批量格式化代码、生成大量模板代码。这些任务的操作模式可预测，出错的影响有限。
- **一次性脚本生成**。让 Codex 在一个临时目录中生成脚本并执行，完成后整个目录可以丢弃。
- **充分受控的环境**。Docker 容器、临时 VM、CI runner 等环境，即使操作完全失控也不会影响宿主机。

full-access 模式不适用于：

- 生产代码库。没有任何确认步骤的情况下让 Codex 修改生产代码是不可接受的风险。
- 包含敏感信息的目录。`--yolo` 模式下 Codex 可以读取和发送任何文件内容，包括 `.env`、密钥文件、数据库配置等。
- 你不能丢失的数据。如果你不能接受 `rm -rf` 的后果，就不要用 `--yolo`。

### 模式选择决策矩阵

选择审批模式需要同时考虑三个维度：任务的风险等级、工作区的可恢复性、你对 Codex 输出质量的信任程度。

| 任务类型 | 风险等级 | 推荐模式 | 理由 |
|----------|----------|----------|------|
| 首次使用 Codex | 低 | ask | 建立对工具行为的直觉 |
| 日常功能开发 | 中 | auto | Git 保护下风险可控 |
| Bug 修复 | 低-中 | auto | 改动范围通常有限 |
| 重构（跨文件） | 中 | auto + Git 保护 | 变更量大但方向明确 |
| 数据库迁移 | 高 | ask | 不可逆操作必须逐步确认 |
| 安全相关代码修改 | 高 | ask | 每一步都需要人工审查 |
| 生产环境配置 | 高 | ask | 配置错误直接影响线上服务 |
| 批量文件操作 | 低 | full-access | 操作模式可预测，出错影响有限 |
| 代码生成（新目录） | 低 | full-access | 在独立环境中生成，无现有代码风险 |
| 依赖升级 | 中 | auto | 需要执行 install 命令但通常安全 |
| CI/CD 流水线 | 可变 | 取决于任务 | 按具体步骤的风险选择 |
| 不熟悉的代码库 | 中-高 | ask | 防止在错误位置做错误修改 |

一个更实用的判断方法：看这个操作的回退成本。如果 `git checkout .` 就能完全回退，auto 模式足够。如果回退需要手动修复或者根本无法回退，用 ask 模式逐步确认。如果你甚至不在乎回退（临时环境、一次性任务），full-access 模式可以最大化效率。

### 审批模式与沙箱的配合

审批模式控制的是"操作前是否需要确认"，沙箱控制的是"操作能力的上限"。两者是独立的安全层。

审批模式可以通过 CLI 参数放宽，但沙箱的限制无法通过 CLI 参数绕过。即使在 `--yolo` 模式下，沙箱仍然会阻止 Codex 访问工作区外的文件（除非沙箱也配置为 full-access）。

这种分层设计意味着你可以这样组合：

```bash
# yolo 模式但沙箱限制在工作区内
codex --yolo
# Codex 可以自动执行任何操作，但沙箱只允许写工作区内的文件

# auto 模式但沙箱完全开放（不推荐）
codex -a never --sandbox full-access
# 审批放开了部分，沙箱完全放开，双重风险
```

工程实践中推荐的组合是 auto 模式 + workspace-write 沙箱。这是日常开发中效率和安全性的平衡点。

## Responses API 端点映射

Codex 底层使用的是 OpenAI 的 Responses API，不是 Chat Completions API。不同的认证方式会路由到不同的端点。

| 认证方式 | API 端点 | 协议 |
|----------|---------|------|
| ChatGPT 登录 | `chatgpt.com/backend-api/codex/responses` | HTTPS，Bearer token（OAuth） |
| API Key | `api.openai.com/v1/responses` | HTTPS，Bearer token（API Key） |
| --oss | `localhost:{port}/v1/responses` | HTTP，无需认证 |

理解这个映射有两个实际用途：

**调试网络问题**。如果你在公司网络中使用 Codex 遇到连接问题，需要根据认证方式排查不同的域名。ChatGPT 登录需要 `chatgpt.com` 的访问权限，API Key 需要 `api.openai.com` 的访问权限。某些企业网络可能屏蔽了其中一个。

**配置代理**。如果需要通过代理访问 OpenAI 的服务，API Key 方式更容易配置：

```bash
# API Key 方式可以使用标准 HTTPS 代理
export HTTPS_PROXY="http://proxy.company.com:8080"

# 或针对 OpenAI 域名单独配置
export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://your-proxy.example.com/v1"
```

ChatGPT 登录方式因为走的是不同的后端路径，代理配置可能需要额外处理。

**合规审查**。如果你的组织需要审查数据流向，三种认证方式的数据路径完全不同。API Key 方式的数据路径最清晰——所有流量都经过 `api.openai.com`，可以在防火墙层面精确控制和审计。

## 首次运行验证清单

安装和认证完成后，不要急于投入实际工作。先跑一遍验证清单，确认每个环节都正常工作。这花不了五分钟，但能避免后续遇到问题时反复排查。

### 第一步：安装成功确认

```bash
codex --version
# 应该输出版本号，如 0.1.x

which codex
# 确认指向正确的安装路径
# npm 安装: /usr/local/bin/codex 或 $(npm prefix)/bin/codex
# Homebrew 安装: /opt/homebrew/bin/codex (Apple Silicon) 或 /usr/local/bin/codex (Intel)
```

如果版本号输出正常且路径正确，安装验证通过。

### 第二步：认证通过确认

```bash
# 检查认证状态（ChatGPT 登录）
ls -la ~/.codex/auth.json
# 文件存在且有内容说明登录有效

# 检查 API Key 是否设置
echo $OPENAI_API_KEY | head -c 10
# 应该输出 sk-... 的前 10 个字符

# 实际测试：让 Codex 执行一个简单任务
codex "echo hello from codex"
# 如果认证失败，这里会报错
```

认证失败的常见报错信息：

```
Error: No API key provided. Set OPENAI_API_KEY or run `codex --login`.
```

遇到这个错误时，按以下顺序排查：

1. 环境变量是否设置：`echo $OPENAI_API_KEY`
2. 环境变量是否在当前 shell 中生效：重新打开终端再试
3. `--login` 是否完成：检查 `~/.codex/auth.json` 是否存在
4. API Key 是否有效：在 OpenAI Dashboard 中确认 Key 状态

### 第三步：让 Codex 读 README.md 并复述项目结构

```bash
cd your-project
codex "Read README.md and describe the project structure in 3 sentences"
```

这一步验证的是 Codex 的核心能力循环：读取文件、理解内容、生成响应。如果这一步正常，说明认证、API 连接和基本工具调用都没有问题。

观察输出中的几个关键点：

- Codex 是否请求了读取 README.md 的权限（ask 模式下）
- 响应内容是否准确反映了 README.md 的内容
- 响应速度是否在合理范围内（通常 5-15 秒）

### 第四步：让 Codex 跑一次 lint 或 typecheck

```bash
codex "Run the project's linter and report the results"
# 或
codex "Run TypeScript type checking and summarize any errors"
```

这一步验证的是 Shell 命令执行能力。Codex 需要执行 `npm run lint` 或 `tsc --noEmit` 等命令，读取输出，然后生成摘要。这比第三步多了一个环节：Shell 命令执行和输出解析。

如果这一步失败，可能的原因：

- 项目没有安装依赖：先跑 `npm install`
- Codex 没有执行 Shell 命令的权限：检查审批模式设置
- 沙箱阻止了命令执行：检查沙箱配置

### 第五步：检查沙箱是否生效

```bash
# macOS：检查 sandbox-exec 是否可用
which sandbox-exec
# 应该输出 /usr/bin/sandbox-exec

# Linux：检查 Landlock 支持
# 方法一：通过 Codex 自身的诊断
codex "Try to write a file to /tmp/codex-sandbox-test.txt and report if it succeeds"

# 方法二：检查内核版本
uname -r
# 5.13+ 表示 Landlock 可用
```

沙箱验证的关键是确认 Codex 不能访问工作区外的文件。如果沙箱没有正常工作，你在 auto 或 full-access 模式下的风险暴露会显著增加。

### 验证清单汇总

| 步骤 | 验证内容 | 命令 | 预期结果 |
|------|----------|------|----------|
| 1 | 安装成功 | `codex --version` | 输出版本号 |
| 2 | 认证通过 | `codex "echo hello"` | 正常响应 |
| 3 | 文件读取 | `codex "read README.md"` | 准确复述内容 |
| 4 | 命令执行 | `codex "run linter"` | 成功执行并汇报 |
| 5 | 沙箱隔离 | 写 /tmp 测试文件 | 被沙箱阻止或受限 |

五步全部通过后，可以开始正式使用 Codex 进行开发工作。

## 常见问题排查

安装和认证过程中遇到的问题可以分为三类：安装失败、认证失败和运行时错误。

### 安装失败

**Node.js 版本过低**

```
error @openai/codex@0.1.x: The engine "node" is incompatible with this module.
```

解决方式：

```bash
# 使用 nvm 切换 Node.js 版本
nvm install 22
nvm use 22

# 或使用 Homebrew 升级
brew upgrade node
```

**全局安装权限不足**

```
EACCES: permission denied, access '/usr/local/lib/node_modules'
```

不要用 `sudo npm i -g`。正确的解决方式是修改 npm 全局安装路径：

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
npm i -g @openai/codex
```

**Homebrew 安装找不到包**

```bash
brew update
brew install codex
```

如果 `brew update` 后仍然找不到 `codex`，可能是 Homebrew 的 tap 没有包含这个包。回到 npm 安装方式。

### 认证失败

**ChatGPT 登录后仍然报认证错误**

```bash
# 检查 token 文件
cat ~/.codex/auth.json
# 如果文件为空或格式错误，重新登录
codex --login

# 检查文件权限
ls -la ~/.codex/auth.json
# 应该是 -rw------- （仅用户可读写）
# 如果权限过宽，修复
chmod 600 ~/.codex/auth.json
```

**API Key 已设置但报 401 错误**

```bash
# 确认 Key 的格式
echo $OPENAI_API_KEY
# 应该以 sk- 开头

# 确认 Key 是否有效（使用 curl 测试）
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  | head -20

# 如果返回 401，说明 Key 无效或已撤销
# 在 https://platform.openai.com/api-keys 检查 Key 状态
```

**API Key 报 429 速率限制**

这说明你的 API 用量超出了当前账户等级的速率限制。解决方案：

1. 在 OpenAI Dashboard 中查看当前等级和限额
2. 升级账户等级（增加限额）
3. 等待限额重置（通常按分钟或按天重置，取决于具体的限制类型）

**--oss 模式连接失败**

```bash
# 检查 Ollama 是否运行
curl http://localhost:11434/api/tags
# 应该返回已安装的模型列表

# 检查模型是否已拉取
ollama list
# 应该列出至少一个模型

# 检查环境变量
echo $OPENAI_BASE_URL
# 应该是 http://localhost:11434/v1
```

常见原因：

- Ollama 服务未启动：`ollama serve`
- 端口被占用：检查 `lsof -i :11434`
- 模型未拉取：`ollama pull <model-name>`
- OPENAI_BASE_URL 配置错误：确认末尾有 `/v1`

### 运行时错误

**Codex 启动后立即崩溃**

```bash
# 查看详细错误日志
codex --version 2>&1
codex "hello" 2>&1

# 检查 Node.js 是否完整安装
node -e "console.log(process.versions)"
```

**沙箱初始化失败（Linux）**

```
Sandbox initialization failed: landlock not supported
```

这意味着你的 Linux 内核不支持 Landlock。检查内核版本（需要 5.13+）。如果内核版本满足但仍然报错，可能是内核编译时没有启用 Landlock 选项。此时 Codex 仍然可以运行，但沙箱为 no-op 模式（无隔离）。

在这种情况下的安全建议：

- 始终使用 ask 模式，不要用 auto 或 full-access
- 在 Docker 容器中运行 Codex，用容器提供隔离
- 确保工作目录在一个独立的文件系统或分区上

**响应超时或速度极慢**

```bash
# 检查网络连通性
curl -w "@curl-format.txt" -o /dev/null -s https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# 检查 DNS 解析
nslookup api.openai.com

# 如果在代理环境中，确认代理配置
echo $HTTPS_PROXY
echo $HTTP_PROXY
```

常见原因：

- 网络延迟高：检查到 OpenAI 服务器的延迟
- 代理配置问题：确认代理服务器允许 WebSocket 长连接
- API 服务端负载高：在 OpenAI Status 页面确认服务状态
- 上下文窗口过大：项目文件太多导致 prompt 过长

## 配置固化

完成首次运行验证后，建议将你的配置固化为可复用的设置。这不是必须的，但能避免每次使用时重复输入参数。

Codex 的配置文件是 `~/.codex/config.toml`。以下是一个推荐的初始配置：

```toml
# ~/.codex/config.toml

# 模型选择（codex-mini-latest 是默认值，平衡速度和质量）
model = "codex-mini-latest"

# 审批模式（建议从 auto 开始，按需调整）
# "ask" | "auto" | "full-access"
approval_mode = "auto"

# 沙箱模式（建议保持 workspace-write）
# "read-only" | "workspace-write" | "full-access"
sandbox_mode = "workspace-write"

# 上下文控制
# 最多读取的文件数
max_read_files = 50

# Web search 模式
# "cached" | "live" | "disabled"
search_mode = "cached"
```

项目级别的配置可以放在项目根目录的 `.codex/config.toml` 中，会覆盖全局配置。这使得不同项目可以使用不同的审批模式和安全策略——比如开源项目用 auto，内部项目用 ask。

```toml
# 项目根目录/.codex/config.toml（示例：高安全项目）
approval_mode = "ask"
sandbox_mode = "read-only"
search_mode = "disabled"
```

这种分层配置的设计思路是：全局配置设为日常使用的默认值，项目配置根据具体项目的安全需求进行覆盖。新项目从 ask 模式开始，建立信任后逐步切换到 auto。这不是保守，而是工程化的渐进信任建立过程。

## 小结

从安装到第一次成功运行，核心决策点只有两个：认证方式和审批模式。

认证方式的选择取决于你的使用场景。个人日常开发用 ChatGPT 登录最省心，团队和自动化场景用 API Key 最可控，离线和隐私场景用 --oss 最安全。三种方式的数据路径不同，如果你的组织有数据合规要求，这是必须搞清楚的第一个问题。

审批模式的选择取决于任务的风险等级和你的信任程度。从 ask 开始建立直觉，在 Git 保护的条件下切换到 auto 提升效率，只在明确低风险的场景中使用 full-access。不要跳过 ask 阶段直接用 auto 或 full-access——你需要先观察 Codex 在你的项目中的行为模式，才能判断自动批准是否安全。

首次运行验证清单不是形式主义。五步验证确认的是安装、认证、文件读取、命令执行和沙箱隔离五个独立环节。跳过任何一步，都可能在后续使用中遇到难以定位的问题。

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
