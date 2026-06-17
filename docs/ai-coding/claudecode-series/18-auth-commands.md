# 认证命令

> 更新日期：2025/06

**TL;DR：** `claude auth login` 登录、`claude auth logout` 登出、`claude auth status` 查状态。三个命令覆盖日常认证管理。企业 SSO 加 `--sso`，Console API 计费加 `--console`，CI 场景用 `claude setup-token` 生成长期 token。

## 为什么这很重要

认证命令是你和 Claude Code 之间的"钥匙"。不知道怎么登录，后面所有功能都用不了。知道怎么切换认证方式，才能在不同场景（个人开发、企业 SSO、CI/CD 管道）之间无缝切换。

上一篇 [07 - 登录与认证](./07-authentication.md) 讲的是认证方式和原理。这一篇聚焦具体命令：每个命令怎么用、有哪些参数、输出什么、什么场景下用。

## 命令总览

| 命令 | 作用 | 常用场景 |
|------|------|----------|
| `claude auth login` | 登录 Anthropic 账号 | 首次使用、切换账号 |
| `claude auth logout` | 登出当前账号 | 换号、清理凭证 |
| `claude auth status` | 查看认证状态 | 排查认证问题、脚本检测 |
| `claude setup-token` | 生成长期 OAuth token | CI/CD 管道、自动化脚本 |

前三个是 `claude auth` 子命令，后一个是独立的顶层命令。

## claude auth login

### 基本用法

```bash
claude auth login
```

执行后，Claude Code 会在默认浏览器中打开 Anthropic 的 OAuth 授权页面。你在浏览器里完成登录，授权后自动跳回终端，认证完成。

### 参数

| 参数 | 说明 |
|------|------|
| `--email <邮箱>` | 预填邮箱，跳过手动输入 |
| `--sso` | 强制走 SSO 认证流程 |
| `--console` | 用 Console 账号登录（API 计费，不走订阅） |

### --email：预填邮箱

省去在浏览器里手动输入邮箱的步骤：

```bash
claude auth login --email you@company.com
```

适合脚本化部署，或者你知道自己只用一个邮箱登录的场景。

### --sso：强制 SSO

企业环境通常需要通过 IdP（如 Okta、Azure AD）统一认证。加 `--sso` 强制走 SSO 流程，跳过普通的邮箱密码登录：

```bash
claude auth login --sso
```

如果你的组织已经配置了 Claude for Enterprise 的 SSO，这个参数确保登录流程走 IdP 通道。不加的话，系统可能会先尝试普通 OAuth，遇到企业策略限制再回退到 SSO，多一步。

### --console：Console 登录

默认登录走 Claude.ai 订阅（Pro/Max/Team）计费。如果你想在 Console 账号上按 API 用量计费，加 `--console`：

```bash
claude auth login --console
```

这会把计费从订阅月费切换到 Console 的按 token 计费。适合两种情况：

- 你有 Console 预算额度，想精确控制花费
- 你的组织通过 Console 统一管理 API 调用

注意：Console 账号需要管理员先在 Console 里邀请你。没有邀请的话，登录会失败。

### 浏览器打不开怎么办

在 WSL2、SSH 会话、容器等无图形界面的环境中，浏览器不会自动打开。此时终端会提示：

```
Press c to copy the login URL to clipboard
```

按 `c` 复制授权链接，在宿主机或有浏览器的机器上打开，完成授权后会显示一个 login code，粘贴回终端即可。

## claude auth logout

### 基本用法

```bash
claude auth logout
```

登出当前账号，清除本地存储的 OAuth 凭证。登出后需要重新 `claude auth login` 才能继续使用。

### 什么时候用

- **切换账号**：从个人账号切到公司账号，先登出再登入
- **凭证异常**：订阅状态已更新但 Claude Code 还是用旧凭证，登出重登
- **共用机器**：在公共或共享开发机上清理自己的登录状态

### 登出只清 OAuth

`claude auth logout` 只清除 OAuth 凭证。如果你设了 `ANTHROPIC_API_KEY` 环境变量，登出后 Claude Code 仍然会用 API Key 认证。要完全清除，还需要 `unset ANTHROPIC_API_KEY`。

### 交互模式中的等价操作

在 Claude Code 交互会话里，也可以直接输入斜杠命令：

```
/logout
```

效果和 `claude auth logout` 一样。

## claude auth status

### 基本用法

```bash
claude auth status
```

输出当前认证状态的 JSON：

```json
{
  "loggedIn": true,
  "account": {
    "type": "subscription",
    "plan": "max"
  }
}
```

### --text：人类可读格式

JSON 不好读？加 `--text` 输出纯文本：

```bash
claude auth status --text
```

输出类似：

```
Logged in as you@example.com
Plan: Claude Max
```

### 退出码

这个命令的退出码在脚本中很有用：

| 退出码 | 含义 |
|--------|------|
| `0` | 已登录 |
| `1` | 未登录 |

脚本中判断认证状态：

```bash
#!/bin/bash
if claude auth status > /dev/null 2>&1; then
  echo "已登录，继续执行"
  claude -p "检查代码质量"
else
  echo "未登录，请先运行 claude auth login"
  exit 1
fi
```

### 排查认证问题

`claude auth status` 是排查认证问题的第一步。常见的排查流程：

1. 运行 `claude auth status --text`，看当前用的是什么认证方式
2. 如果显示未登录，运行 `claude auth login`
3. 如果登录了但还是报错，检查环境变量是否覆盖了 OAuth：`echo $ANTHROPIC_API_KEY`、`echo $ANTHROPIC_AUTH_TOKEN`
4. 优先级高的环境变量会覆盖登录状态，这是最常见的问题

## claude setup-token

### 基本用法

```bash
claude setup-token
```

这不是 `claude auth` 的子命令，而是独立的顶层命令。用于生成一个有效期约 1 年的 OAuth token，专门给 CI/CD 管道和自动化脚本使用。

### 执行流程

1. 命令会打开浏览器完成 OAuth 授权
2. 授权成功后，token 打印到终端
3. 命令不会自动保存 token 到任何地方

### 使用方式

拿到 token 后，设为环境变量：

```bash
export CLAUDE_CODE_OAUTH_TOKEN=your-token-here
claude -p "运行代码审查"
```

在 GitHub Actions 中：

```yaml
env:
  CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_TOKEN }}
```

### 限制

- 需要订阅计划（Pro/Max/Team/Enterprise），不能在免费账号上生成
- Token 只能用于推理调用，不能建立 Remote Control 会话
- `--bare` 模式不会读取这个环境变量，bare 模式下用 `ANTHROPIC_API_KEY` 或 `apiKeyHelper` 替代
- Token 过期后需要重新运行 `claude setup-token`

## 认证优先级速查

当多种认证同时存在时，Claude Code 按以下顺序选择：

```
1. 云厂商标记（CLAUDE_CODE_USE_BEDROCK / USE_VERTEX / USE_FOUNDRY）
2. ANTHROPIC_AUTH_TOKEN
3. ANTHROPIC_API_KEY
4. apiKeyHelper 脚本输出
5. CLAUDE_CODE_OAUTH_TOKEN
6. 订阅 OAuth（claude auth login 的结果）
```

编号越小优先级越高。这也是为什么"明明登录了但还是走 API Key"——第 3 项比第 6 项优先。

用 `claude auth status` 确认当前实际生效的是哪一层。

## 常见问题

### 登录后还是报 401

检查 `ANTHROPIC_API_KEY` 是否指向了一个已失效的 Console 组织：

```bash
echo $ANTHROPIC_API_KEY
```

如果有值，要么 `unset ANTHROPIC_API_KEY`，要么在 `/config` 里切换"Use custom API key"开关。

### 切换 Console 和订阅计费

已经用订阅登录了，想临时切到 Console API 计费：

```bash
claude auth login --console
```

切回来：

```bash
claude auth logout
claude auth login
```

也可以用 `ANTHROPIC_API_KEY` 环境变量直接走 Console，不走 OAuth：

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
claude -p "快速检查"
unset ANTHROPIC_API_KEY  # 用完清除
```

### CI Token 过期了

重新生成：

```bash
claude setup-token
```

然后把新 token 更新到 CI 平台的 secrets 配置里。建议在日历上标记 token 生成日期，提前一个月续期。

### 多个环境变量冲突

逐个排查：

```bash
# 查看所有可能影响认证的环境变量
env | grep -E "ANTHROPIC|CLAUDE_CODE"
```

按优先级从高到低，找到最先命中的那个，确认它是你期望的认证方式。不确定的话，全部 `unset` 后重新 `claude auth login`。

## 关键要点

- 日常使用记住三个命令：`claude auth login`、`claude auth logout`、`claude auth status`
- 企业 SSO 加 `--sso`，Console API 计费加 `--console`，脚本化加 `--email`
- `claude auth status` 的退出码（0 = 已登录，1 = 未登录）可以用于脚本判断
- CI/CD 用 `claude setup-token` 生成 1 年有效期的 token，别把 API Key 写进流水线
- 认证优先级：云厂商 > Bearer Token > API Key > apiKeyHelper > CI Token > 订阅 OAuth
- 环境变量会覆盖浏览器登录状态，排查认证问题时先查 `env | grep ANTHROPIC`

## 延伸阅读

- [07 - 登录与认证](./07-authentication.md) — 认证方式和原理详解
- [25 - CLI Flags 总览](./25-cli-flags-reference.md) — 所有 CLI flags 速查
- [Claude Code 官方认证文档](https://code.claude.com/docs/en/authentication)
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference)

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
