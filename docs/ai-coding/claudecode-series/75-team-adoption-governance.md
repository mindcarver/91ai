# 团队推广与治理

> 更新日期：2025/06

你是一个技术负责人，刚在公司内部验证了 Claude Code 确实能提效。老板说"推广到全团队吧"。然后呢？直接全员发邮件说"大家开始用"？恭喜，两周后你会面对三个问题：有人把密钥提交了、有人一个月烧了两千美元 API 额度、还有一半人装了之后就没再打开过。

这篇文章讲的是怎么把 Claude Code 从"一个人用得好"变成"整个团队安全、高效地用起来"。

## 推广前的准备

在通知任何人之前，先把这几件事做掉。跳过这一步，后面的推广都会打折。

**确认你的 Claude 订阅计划**

团队推广至少需要 Team 计划。如果涉及权限管控、审计日志、SSO 集成，那得上 Enterprise 计划。具体区别在于：

- Team：基础协作、用量仪表盘、共享项目
- Enterprise：managed settings、Compliance API、SSO/SCIM、域捕获、细粒度额度控制

如果你已经在 Enterprise 计划上，跳到下一节。如果还在 Pro 计划，先升级，别试图在个人订阅上搞团队治理。

**梳理现有工作流**

列出团队当前的代码开发流程：用什么 IDE、怎么跑测试、怎么部署、代码审查的流程是什么。Claude Code 不是来替代这些流程的，是来嵌入这些流程的。搞清楚它在哪个环节介入效果最好，推广时才有说服力。

**准备安全基线**

读一下第 50 篇（企业托管设置），准备好你的 `managed-settings.json`。这个文件是推广的基石——没有它，等于把一辆没有刹车的车交给整个团队。

## 分阶段推广策略

不要一步到位。从 Gartner 的数据看，58% 的组织还在摸索 AI 工具治理框架。分阶段推广不是保守，是务实。

### 阶段一：试点（2-4 周，5-10 人）

选人的标准不是"谁最闲"，而是"谁最可能成功且最有影响力"：

- 技术骨干 2-3 人：他们能评估工具的真实价值，发现问题
- 意见领袖 2-3 人：他们在团队中的话语权能影响后续推广
- 新人 1-2 人：新人没有既有习惯的包袱，上手最快

试点期间要跟踪的数据：
- 每人每天用 Claude Code 完成了多少任务
- 代码审查的一次通过率有没有变化
- 试点成员的主观评价（用简单问卷，别搞复杂了）

这个阶段允许出错。试点成员遇到问题，就是你发现治理漏洞的机会。

### 阶段二：部门推广（4-6 周，20-50 人）

试点数据好看之后，扩展到一个部门。这个阶段的核心是培训，不是工具本身。DX 的研究数据很明确：没有系统培训的团队，AI 工具带来的效率提升比有培训的团队低 60%。

培训方式建议：
- 1 小时实操工坊（不是 PPT 讲座，是大家打开电脑跟着做）
- 录制 3-5 个 10 分钟的短视频覆盖常见场景
- 建一个内部频道专门回答 Claude Code 相关问题

### 阶段三：全员推广

到这一步，你应该已经有了：
- 经过验证的 managed-settings.json
- 一套培训材料
- 几个愿意带新人的 Champion
- 真实数据证明工具有效

全员推广时，把以上这些东西打包成一个"新人启动包"，让每个人半小时内就能安全地开始使用。

## 权限模板设计

权限模板是治理的核心。下面给两个可以直接用的模板，根据团队情况调整。

### 保守模板（适合刚起步的团队）

```json
{
  "permissions": {
    "deny": [
      "Bash(curl *)",
      "Bash(wget *)",
      "Bash(rm -rf *)",
      "Bash(kubectl delete *)",
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(**/secrets/*)",
      "Read(**/.ssh/*)",
      "Read(**/credentials*)"
    ],
    "ask": [
      "Bash(git push *)",
      "Bash(npm publish *)",
      "Bash(docker push *)",
      "Write(**)"
    ]
  },
  "disableBypassPermissionsMode": "disable"
}
```

这个模板的逻辑：
- `deny`：完全禁止危险操作——网络下载、删除文件、读取敏感文件
- `ask`：每次都确认——推送代码、写文件等不可逆操作
- `disableBypassPermissionsMode`：设为 `disable`，防止任何人用 `--dangerously-skip-permissions` 绕过所有规则

### 宽松模板（适合有经验的团队）

```json
{
  "permissions": {
    "deny": [
      "Bash(curl * | bash)",
      "Bash(rm -rf /)",
      "Read(**/.env)",
      "Read(**/secrets/*)"
    ],
    "allow": [
      "Bash(git *)",
      "Bash(npm test *)",
      "Bash(npm run lint *)",
      "Read(**)"
    ],
    "ask": [
      "Bash(npm publish *)",
      "Bash(docker push *)",
      "Write(**/prod/**)"
    ]
  }
}
```

宽松模板把常用的 git 操作、测试命令放进了 `allow`，减少确认弹窗的频率。但依然锁定敏感文件和生产环境写入。

### MCP 服务器治理

如果你的团队用 MCP 服务器扩展 Claude Code 的能力，加上这一条：

```json
{
  "allowManagedMcpServersOnly": true
}
```

这会阻止团队成员自行添加未授权的 MCP 服务器。所有 MCP 服务器必须由管理员通过 managed settings 配置。

## 使用监控和成本控制

推广之后不监控，等于闭着眼睛开车。

### 额度设置

在 Claude Admin Console 里设置双层额度：

- **组织级额度**：整个组织的月度总上限，防止单月意外暴涨
- **用户级额度**：每人每月的用量上限，防止个别人滥用

具体路径：Admin Console → Settings → Spend Management。建议初始设一个偏低的上限，跑两周看实际用量再调。大部分开发者每月 50-100 美元够用，重度用户可能到 200 美元。

### 用量数据收集

Enterprise 计划提供 Compliance API，可以拉取：
- 每个用户的对话次数和 token 消耗
- 权限请求和审批记录
- 工具调用统计（Bash、文件操作等）

如果你用 OpenTelemetry，Claude Code 支持把遥测数据导出到你现有的可观测性平台（Grafana、Datadog 等），这样不用单独建一套监控体系。

## 培训材料

培训材料不用写成长篇大论。以下是实测有效的最小集：

**必做清单（半小时速通）**

1. 安装和认证：`npm install -g @anthropic-ai/claude-code` → `claude` → 登录
2. 基本对话：在项目目录里打开，问"这个项目的结构是什么"
3. 文件编辑：让 Claude Code 修一个 bug，观察它怎么读写文件和请求权限
4. 上下文管理：用 `/add` 添加文件到上下文，用 `/clear` 清空上下文

**进阶技巧（第二周学）**

- Prompt chaining：把大任务拆成连续的小指令
- Meta-prompting：让 Claude Code 先分析问题再动手写代码
- `/init` 命令：让 Claude Code 生成项目特定的 CLAUDE.md 配置文件

**踩坑指南**

- 不要让 Claude Code 处理超过 10 个文件的大重构——拆成小步骤
- 上下文窗口会满，满了之后 Claude Code 的回答质量下降，及时 `/clear`
- 生成代码后一定要跑测试，别直接合并

## Champion Kit

Champion 是推广成功的关键角色。每个试点小组或部门指定 1-2 个 Champion，他们负责：

- 回答团队成员的日常问题
- 收集反馈，向上传递
- 定期分享使用技巧（每月一次 15 分钟的 show & tell）

Champion 不是全职工作，但他们需要：
- 比其他人多 2-3 小时的深度使用经验
- 能访问 managed-settings.json 的权限（至少能提修改建议）
- 一个直接跟你（技术负责人）沟通的渠道

激励方式不需要复杂：公开认可、优先体验新功能、把 Champion 经历写进绩效评估就行。

## 审计和合规

如果你的组织有合规要求（SOC 2、ISO 27001 等），Claude Code 的使用需要留下审计痕迹。

### 对话日志

Enterprise 计划默认保留对话记录。`cleanupPeriodDays` 控制保留时长：

```json
{
  "cleanupPeriodDays": 90
}
```

设为 90 天意味着 90 天后对话记录自动清理。根据你的合规要求调整——有些行业要求保留 1 年以上。

### 权限审计

通过 Compliance API 定期检查：
- 有没有用户频繁触发 `deny` 规则（可能说明权限模板需要调整）
- `ask` 规则的通过率（如果通过率 99%，说明这条规则可以降级为 `allow`）
- 异常的 token 消耗模式

### 沙箱环境

对于安全要求更高的团队，建议用 devcontainer 或 Docker 容器运行 Claude Code，把文件系统和网络隔离开：

```bash
# 在 devcontainer 中运行 Claude Code
docker run -it -v $(pwd):/workspace claude-code-sandbox
```

这样即使 Claude Code 执行了意外命令，影响范围也被限制在容器内。

## 常见推广问题和解决方案

**"团队里有人抵触使用"**

正常现象。不要强制推广，也不要把使用量和绩效挂钩。让数据说话——用试点阶段收集的效率数据，让抵触者自己判断。给他们安排一个 Champion 做 1v1 演示，比群发邮件有效 10 倍。

**"有人反馈 Claude Code 生成的代码质量差"**

先排查是不是使用方式的问题：
- 提示词太模糊？教他们写具体的指令
- 上下文不够？检查有没有用 `/add` 添加相关文件
- 任务太大？引导拆分任务

如果以上都不是，检查是不是用的模型能力不足。有时候换个模型（比如从 Sonnet 换到 Opus）就能解决。

**"成本超预期"**

检查是不是有少数重度用户拉高了平均数。通常是 1-2 个人贡献了 50% 以上的 token 消耗。找他们聊聊，看看是不是使用习惯有问题（比如频繁用 Claude Code 做它不擅长的事情），然后调整他们的个人额度。

**"权限弹窗太多，影响体验"**

这说明权限模板需要优化。收集两周的权限请求数据，把通过率 >95% 的 `ask` 规则降级为 `allow`。权限治理的目标不是锁死一切，而是在安全和效率之间找到平衡点。

## 关键要点

- 治理先行：在推广之前把 managed-settings.json 准备好，`disableBypassPermissionsMode` 必须设为 `disable`
- 分批推进：5 人试点 → 部门推广 → 全员推广，每阶段都有明确的评估指标
- 培训是关键：没有培训的推广，效率提升会低 60%
- 监控不要停：设好额度上限，用 Compliance API 或 OpenTelemetry 持续跟踪
- Champion 带路：每个小组有一个深度用户做支持，比文档管用
- 迭代优化：权限模板不是一次定死的，根据实际使用数据持续调整

## 延伸阅读

- [Claude Code 官方文档 - 企业管理](https://docs.anthropic.com/en/docs/claude-code/enterprise)
- [TrueFoundry: Claude Code 企业治理指南](https://www.truefoundry.com/blog/claude-code-enterprise-guide)
- [DX: AI 代码工具企业采用实践](https://getdx.com/research/ai-coding-assistants)
- [Checkmarx: AI 代码工具安全风险](https://checkmarx.com/appsec-knowledge-hub/ai-ml-security/)
- 第 50 篇：企业托管设置
- 第 49 篇：Prompt injection 防护
- 第 48 篇：Secrets 安全处理

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
