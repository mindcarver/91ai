# Permission Modes 全解

> 更新日期：2025/06

**TL;DR：** Claude Code 有六种权限模式，核心区别是"谁来拍板决定每一次操作"。`default` 模式你亲自审批每一步；`acceptEdits` 让 Claude 自由改文件但仍要你批准命令；`plan` 只看不改；`auto` 用一个 AI 分类器代你审批——安全的放行，危险的拦下。选哪种取决于你在做什么、在什么环境做。

## 为什么需要权限模式

Claude Code 能读文件、写文件、跑 shell 命令、发网络请求。每次执行这些操作前，它需要得到"许可"。权限模式决定的是：这个许可由谁来给。

默认情况下，Claude 每要做一件事就停下来问你——"我要改这个文件，行吗？""我要跑这个命令，行吗？"刚上手时这让人安心，但用了一个小时后你会发现自己开始无脑按回车，根本不再看它在问什么。这就是所谓的"审批疲劳"：权限提示本意是保护你，但频率太高反而失去了意义。

另一种极端是用 `bypassPermissions` 直接关掉所有检查。这在自己笔记本上跑是有风险的——你的 SSH key、环境变量、git 凭证都在上面。

权限模式就是在"事事过问"和"完全放权"之间找平衡。

## 四种主要模式对比表

| 模式 | 不需要确认的操作 | 适合场景 | 风险等级 |
|------|-----------------|---------|---------|
| `default` | 只读操作 | 刚接触 Claude Code、处理敏感工作 | 最低 |
| `acceptEdits` | 读文件 + 改文件 + 基础文件系统命令（mkdir、mv、cp 等） | 日常编码迭代 | 低 |
| `plan` | 只读操作（同 default） | 探索陌生代码库、规划方案 | 最低 |
| `auto` | 所有操作（由 AI 分类器把关） | 长时间任务、减少审批疲劳 | 中 |

另外还有两个特殊模式：

| 模式 | 说明 |
|------|------|
| `dontAsk` | 只执行你预先批准的工具，其余一律拒绝。适合 CI 流水线 |
| `bypassPermissions` | 跳过一切检查。只适合隔离容器和虚拟机 |

`dontAsk` 和 `bypassPermissions` 用法特殊，本文重点讲前四种。

## 切换模式的方式

所有模式下，切换方式一致：

**会话中切换：** 按 `Shift+Tab` 循环切换 `default` → `acceptEdits` → `plan` → （如已启用）`auto`。当前模式显示在状态栏。

**启动时指定：**

```bash
claude --permission-mode plan
```

**设为默认：** 在 `settings.json` 中配置：

```json
{
  "permissions": {
    "defaultMode": "acceptEdits"
  }
}
```

注意：`auto` 模式不能通过项目级别的 `.claude/settings.json` 设置默认值（这是安全设计，防止仓库自行授权），只能放在用户级别的 `~/.claude/settings.json` 里。

## Default 模式详解

这是你第一次打开 Claude Code 时的模式。Claude 想改文件、跑命令、发请求——每一样都会先弹提示让你确认。

### 具体行为

- 读文件：不需要确认
- 写文件：需要确认
- 跑命令：需要确认
- 网络请求：需要确认

### 什么时候用

- 刚开始用 Claude Code，还不熟悉它会做什么
- 在生产环境或共享代码库上工作
- 做的事情你不希望出任何差错

### 实际体验

当你让 Claude "给这个函数加个日志"，在 default 模式下的流程是：

1. Claude 读取源文件（自动通过）
2. Claude 想要编辑文件 → 弹出确认 → 你按回车
3. Claude 想跑 `npm test` 验证 → 弹出确认 → 你按回车

两个确认，对一个简单任务来说还行。但如果让 Claude "重构整个认证模块"，可能会有二十几次确认。到第十次你大概率已经不看了。

## AcceptEdits 模式详解

这个模式解决的是 default 模式下最烦人的一类确认——文件编辑。在 `acceptEdits` 模式下，Claude 可以直接创建和编辑工作目录里的文件，不用每次都问你。但跑 shell 命令（比如 `npm run build`）仍然需要确认。

### 自动批准的操作

除了文件读写，以下 bash 命令也被自动批准：`mkdir`、`touch`、`rm`、`rmdir`、`mv`、`cp`、`sed`，以及加了 `LANG=C`、`NO_COLOR=1` 等安全环境变量前缀，或 `timeout`、`nice`、`nohup` 等包装器的版本。

这些自动批准只限于工作目录内的路径。工作目录之外的文件操作、受保护路径（如 `.git`、`.claude`）的写入，仍需确认。

### 什么时候用

- 你正在让 Claude 修改多个文件，不想每个改动都手动点一下
- 你打算事后用 `git diff` 或编辑器统一审查所有改动
- 你对 Claude 的改动方向有基本信心，只是不想实时盯着每一行

### 操作示例

```bash
# 启动时直接进入 acceptEdits
claude --permission-mode acceptEdits

# 或者在会话中按 Shift+Tab 切换一次
```

让 Claude "把所有 console.log 清掉"：

1. Claude 读文件（自动）
2. Claude 逐个编辑文件（自动）
3. Claude 想跑 `git diff --stat` 看改了哪些 → 弹出确认

你只在最后看结果时介入一次。

## Plan 模式详解

Plan 模式让 Claude 只做研究，不动代码。它会读文件、跑探索性命令（比如 `ls`、`grep`），然后输出一份计划，告诉你它打算怎么改。直到你批准这份计划，它才真正动手。

### 具体行为

- 读文件、搜索代码：自动通过
- 写文件：不允许（会等计划批准后切到其他模式再执行）
- 跑命令：需要确认（和 default 一样）

### 什么时候用

- 面对一个陌生的代码库，先让 Claude 了解全貌再动手
- 复杂任务（比如"迁移到 React 19"），需要先有方案再执行
- 代码审查场景：让 Claude 分析问题，但改动由你决定

### 计划的审批流程

当 Claude 完成分析后，会展示计划并问你如何处理：

- 批准并用 auto 模式执行
- 批准并用 acceptEdits 模式执行
- 批准但逐条确认
- 继续讨论，补充要求
- 用 Ultraplan 在浏览器中查看

批准后自动切出 plan 模式，进入你选择的执行模式。

### 操作示例

```bash
# 启动时进入 plan 模式
claude --permission-mode plan

# 或者在单条提问前加 /plan 前缀
# 输入框里打 /plan 这个项目有哪些性能瓶颈？
```

也可以在 `.claude/settings.json` 里把 plan 设为项目默认模式：

```json
{
  "permissions": {
    "defaultMode": "plan"
  }
}
```

这样每次打开项目，Claude 都会先"看看再说话"，降低误操作概率。

## Auto 模式详解

Auto 模式是 2026 年 3 月推出的权限模式，用一个独立的 AI 分类器（classifier）代替你做审批决定。Claude 要执行操作前，分类器先审查这个操作是否安全——安全就放行，危险就拦住。

### 分类器怎么工作

分类器检查三个维度：

1. **范围是否扩大**：Claude 在做你没要求的事吗？
2. **是否涉及不受信任的基础设施**：操作目标是不是分类器不认识的系统？
3. **是否存在提示注入**：操作是否被 Claude 读到的恶意内容驱动？

分类器基于 Sonnet 4.6 运行，和你主会话用的模型无关。它只看到你的消息和 Claude 的工具调用，看不到工具的返回结果——这是故意的，防止恶意文件内容通过工具输出操纵分类器的判断。

### 默认拦截的操作

- 下载并执行远程代码（`curl | bash`）
- 向外部端点发送敏感数据
- 生产环境部署和数据库迁移
- 云存储上的批量删除
- 授予 IAM 或仓库权限
- 修改共享基础设施
- 不可逆地删除会话前就存在的文件
- force push 或直接推送到 main

### 默认允许的操作

- 工作目录内的文件读写和编辑
- 安装 lock file 或 manifest 中已声明的依赖
- 读取 `.env` 并向对应的 API 发送凭证
- 只读 HTTP 请求
- 推送到当前分支或 Claude 创建的分支

### 一个关键细节：进入 auto 时会丢弃宽泛规则

如果你在 settings 里配了 `Bash(*)` 或 `Bash(node*)` 这样的通配 allow 规则，进入 auto 模式时这些规则会被临时移除。原因是：如果 `Bash(*)` 仍然生效，每条 shell 命令都会在分类器审查之前自动通过——那分类器就形同虚设了。窄规则如 `Bash(npm test)` 会保留。退出 auto 模式后，被移除的规则会恢复。

### 回退机制

分类器不是万能的。如果连续拦截 3 次或累计拦截 20 次，auto 模式会暂停，恢复成手动确认。这个阈值不可配置。

在非交互模式（`-p` 标志）下，多次拦截会直接中止会话，因为没有人在场手动批准。

### 什么时候用

- 长时间任务，不想被频繁的确认打断思路
- 你信任 Claude 的工作方向，但需要一个安全网兜底
- 无人值守的 agent loop 场景

### 什么时候别用

- 涉及生产环境变更（分类器默认就会拦）
- 在不熟悉的代码上工作，你想看每一步
- 需要确定性、可审计的权限控制（用 `dontAsk` + 显式 allow 规则代替）
- 对 token 消耗敏感（分类器调用有额外开销）

### 使用前提

不是所有人都能用 auto 模式：

- **订阅要求**：Max、Team、Enterprise 或 API。Pro 用户不可用
- **模型要求**：Opus 4.6+、Sonnet 4.6+。Haiku 和 claude-3 系列不支持
- **Team/Enterprise**：需要管理员先在后台启用
- **Bedrock/Vertex/Foundry**：需要设置 `CLAUDE_CODE_ENABLE_AUTO_MODE=1` 环境变量，且只支持 Opus 4.7+

### 操作示例

```bash
# 启动时直接进入 auto
claude --permission-mode auto

# 或在会话中 Shift+Tab 循环到 auto（首次会弹确认）
```

在 `~/.claude/settings.json`（注意是用户级别，不是项目级别）设为默认：

```json
{
  "permissions": {
    "defaultMode": "auto"
  }
}
```

## 模式选择决策树

根据你当前的情况，按这个顺序判断：

```
你在什么环境？
├─ 隔离容器 / 虚拟机 → bypassPermissions
├─ CI 流水线 → dontAsk + 显式 allow 规则
└─ 本地开发环境
    ├─ 任务类型？
    │   ├─ 探索陌生代码 → plan
    │   ├─ 敏感操作（生产配置、凭证） → default
    │   ├─ 多文件迭代开发 → acceptEdits
    │   └─ 长时间自主任务 → auto（前提是你满足使用条件）
    └─ 不确定？从 plan 开始，看完方案再切。
```

几个实用的组合模式：

- **plan → acceptEdits**：先用 plan 模式让 Claude 分析方案，确认后 Shift+Tab 切到 acceptEdits 执行。这是很多人的日常工作流。
- **plan → auto**：方案确认后让 Claude 用 auto 全速执行。适合大型重构。
- **acceptEdits 为主 + 临时切 default**：日常用 acceptEdits 保持流畅，遇到不确定的操作临时切回 default 仔细看。

## 常见误区

**"auto 模式等于完全放手"**

不是。auto 模式有分类器持续审查操作。它会拦截 force push、远程代码执行、数据外泄等高危操作。它比 `bypassPermissions` 安全得多——但也没有 default 模式那么安全。Anthropic 公布的数据：分类器对真实操作的误拦率是 0.4%，对"过度激进操作"测试集的漏放率是 17%。17% 不是零。

**"auto 模式能记住我说的边界"**

你在对话中说"先别 push"，分类器会遵守。但如果对话太长触发了上下文压缩（compaction），这条消息可能被清除，边界就消失了。需要硬保证时，用 settings.json 里的 deny 规则，不要依赖自然语言描述。

**"acceptEdits 会自动批准所有文件操作"**

不会。它只自动批准工作目录内的文件编辑和基础文件系统命令。写 `.git`、`.claude` 等受保护路径仍然要确认。路径在工作目录之外的也不行。

**"模式在对话中用自然语言切换"**

权限模式是通过 `Shift+Tab` 或启动参数设置的，不是在聊天框里说"切到 plan 模式"。

## 关键要点

- 六种权限模式形成从"事事过问"到"完全放权"的梯度，核心区别是审批权在谁手里
- `default` 和 `plan` 的自动批准范围相同（只读），区别在于 plan 模式下 Claude 不会编辑文件
- `acceptEdits` 是日常开发的好起点：文件改动自动通过，命令执行仍需确认
- `auto` 模式的分类器是一个 AI 安全审查员，不是万能的——17% 的漏放率意味着它不能替代你对敏感操作的判断
- 受保护路径（`.git`、`.claude`、shell 配置文件等）在所有模式下都有额外保护，除了 `bypassPermissions`
- 最实用的组合：plan 先看方案，确认后切 acceptEdits 或 auto 执行

## 延伸阅读

- [Claude Code 官方权限模式文档](https://code.claude.com/docs/en/permission-modes) — 六种模式的完整说明和切换方式
- [Configure auto mode](https://code.claude.com/docs/en/auto-mode) — auto 模式分类器的配置方法
- [Permissions 配置文档](https://code.claude.com/docs/en/permissions) — allow/deny 规则的详细配置
- 系列第 14 篇「交互模式入门」— 基础操作和快捷键
- [Auto mode classifier 的 arXiv 论文](https://arxiv.org/html/2604.04978v1) — 分类器的设计原理和评估数据

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
