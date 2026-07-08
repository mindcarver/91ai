# 开源 Agent Skills 专题（Star > 1000）

Agent Skills 是 Anthropic 主导的开放格式（`SKILL.md` + YAML frontmatter），把可复用的指令、流程和资源打包，给 Claude Code、Codex、Cursor、Gemini CLI、Antigravity 等 AI 编程 Agent 加载。本专题收录 **Star 超过 1000 的开源 Skill 仓库**、官方标准与大型聚合列表，以及主要的 Skill 目录/市场网站。

> 数据来源：GitHub API，Star 为 **2026-07 快照**，按仓库当前值四舍五入到百位。仅做分类和概括，不作推荐结论；安装第三方 Skill 前请自行审查代码（Skill 可包含可执行脚本）。

数量：58 个 Star > 1000 的 SKILL 仓库 · 2 个相邻格式（Cursor Rules / Prompt）· 1 个中文补充（接近门槛）· 9 个目录网站

## 官方与标准

定义格式、提供官方实现和包管理器的源头仓库。

| 名称 | 概括 | Star | 标签 | 链接 |
| --- | --- | --- | --- | --- |
| anthropics/skills - Anthropic 官方公开 Skill 仓库 | Anthropic 官方维护的示例 Skill（frontend-design 等），理解格式的第一手参考 | 159.4k | 官方, 标准, 参考实现 | [打开](https://github.com/anthropics/skills) |
| anthropics/claude-plugins-official - 官方 Plugin 目录 | Anthropic 管理的高质量 Claude Code Plugin 目录 | 31.8k | 官方, plugin, 目录 | [打开](https://github.com/anthropics/claude-plugins-official) |
| agentskills/agentskills - Agent Skills 规范 | 开放格式规范与文档，定义 frontmatter、触发描述等字段 | 22.7k | 标准, 规范, 格式定义 | [打开](https://github.com/agentskills/agentskills) |
| anthropics/courses - Anthropic 官方课程 | 含 Skill 编写与 Agent 工程的官方教学材料 | 22.1k | 官方, 教程, 学习 | [打开](https://github.com/anthropics/courses) |
| vercel-labs/skills - `npx skills` 包管理器 | Vercel Labs 出的 Skill 包管理 CLI，跨 Agent 安装/管理 | 25.5k | 工具, cli, 包管理 | [打开](https://github.com/vercel-labs/skills) |

## 大型聚合 / Awesome 列表

收录大量 Skill 的索引仓库，适合按需淘选，质量参差需自筛。

| 名称 | 概括 | Star | 标签 | 链接 |
| --- | --- | --- | --- | --- |
| ComposioHQ/awesome-claude-skills - Claude Skills 精选列表 | 社区维护的 Claude Skills 资源汇总 | 67.2k | awesome, 聚合, 列表 | [打开](https://github.com/ComposioHQ/awesome-claude-skills) |
| addyosmani/agent-skills - 工程类生产级 Skill | addyosmani 维护的生产级工程 Skill 集 | 73.1k | awesome, 工程, 生产级 | [打开](https://github.com/addyosmani/agent-skills) |
| sickn33/antigravity-awesome-skills - 1800+ Skill 库 | 含 1800+ agentic skill、installer CLI 和 bundle 的大库 | 42.6k | awesome, 大合集, cli | [打开](https://github.com/sickn33/antigravity-awesome-skills) |
| VoltAgent/awesome-agent-skills - 1000+ Agent Skill | 来自官方团队与社区的 1000+ skill 聚合，跨 Agent 兼容 | 27.6k | awesome, 聚合, 跨平台 | [打开](https://github.com/VoltAgent/awesome-agent-skills) |
| VoltAgent/awesome-claude-code-subagents - 100+ 子代理 | 100+ 专项 Claude Code subagent 集合 | 23.0k | awesome, subagent, 代理 | [打开](https://github.com/VoltAgent/awesome-claude-code-subagents) |
| travisvn/awesome-claude-skills - Claude Skills 精选 | 社区精选 Claude Skills 列表 | 14.0k | awesome, 聚合, 列表 | [打开](https://github.com/travisvn/awesome-claude-skills) |
| BehiSecc/awesome-claude-skills - Claude Skills 列表 | 社区维护的 Claude Skills 汇总 | 9.7k | awesome, 聚合, 列表 | [打开](https://github.com/BehiSecc/awesome-claude-skills) |
| heilcheng/awesome-agent-skills - 教程与目录 | Agent Skills 教程、指南和目录导航 | 5.9k | awesome, 教程, 导航 | [打开](https://github.com/heilcheng/awesome-agent-skills) |
| libukai/awesome-agent-skills - 中文终极指南 | 中文 Agent Skills 入门、资源推荐与精选技能 | 4.8k | awesome, 中文, 入门 | [打开](https://github.com/libukai/awesome-agent-skills) |
| rohitg00/awesome-claude-code-toolkit - Claude Code 工具箱 | 135 agents / 35 skills / 42 commands / 176 plugins 的大杂烩 | 2.3k | awesome, 工具箱, 大合集 | [打开](https://github.com/rohitg00/awesome-claude-code-toolkit) |
| taishi-i/awesome-ChatGPT-repositories - ChatGPT 仓库列表 | ChatGPT 相关开源仓库大盘点，支持用 Claude Code skill 检索 | 3.1k | awesome, 列表, 检索 | [打开](https://github.com/taishi-i/awesome-ChatGPT-repositories) |

## 框架 / 方法论 / 大合集

不止是 skill 列表，还带工作流方法论或打包分发体系。

| 名称 | 概括 | Star | 标签 | 链接 |
| --- | --- | --- | --- | --- |
| obra/superpowers - Skill 框架与开发方法论 | agentic skills 框架 + 软件开发方法论，本系列开篇引用 | 249.5k | 框架, 方法论, 工作流 | [打开](https://github.com/obra/superpowers) |
| alirezarezvani/claude-skills - 345 个 skill 合集 | 345 skills + 30 agents + 70 commands，跨 10+ 编程 Agent | 21.6k | 大合集, 跨平台, 全栈 | [打开](https://github.com/alirezarezvani/claude-skills) |
| jeremylongshore/claude-code-plugins-plus-skills - 2810 skills | 425 plugins / 2810 skills / 200 agents，配 tonsofskills.com 市场 | 2.5k | 大合集, marketplace, 全栈 | [打开](https://github.com/jeremylongshore/claude-code-plugins-plus-skills) |
| mrgoonie/claudekit-skills - ClaudeKit 技能集 | ClaudeKit.cc 的全量 skill 集合 | 2.2k | 大合集, 全栈, 工具 | [打开](https://github.com/mrgoonie/claudekit-skills) |

## 厂商官方 Skill 集

各厂商/团队以官方身份发布的领域 Skill。

| 名称 | 概括 | Star | 标签 | 链接 |
| --- | --- | --- | --- | --- |
| vercel-labs/agent-skills - Vercel 官方 skill | Vercel 官方 Agent Skill 合集 | 28.8k | 厂商, vercel, 官方 | [打开](https://github.com/vercel-labs/agent-skills) |
| googleworkspace/cli - Google Workspace CLI | Drive/Gmail/Calendar/Sheets 等的 CLI，含 AI agent skills | 29.5k | 厂商, google, cli | [打开](https://github.com/googleworkspace/cli) |
| github/awesome-copilot - GitHub Copilot 配置 | 社区贡献的 Copilot instructions/agents/skills/配置 | 36.3k | 厂商, github, copilot | [打开](https://github.com/github/awesome-copilot) |
| kepano/obsidian-skills - Obsidian Agent Skill | 教 Agent 用 Obsidian CLI 和 Markdown/Bases/Canvas 等开放格式 | 40.3k | 厂商, obsidian, 知识管理 | [打开](https://github.com/kepano/obsidian-skills) |
| trailofbits/skills - 安全研究 Skill | Trail of Bits 出的安全研究、漏洞检测和审计工作流 skill | 6.0k | 厂商, 安全, 审计 | [打开](https://github.com/trailofbits/skills) |

## 明星单体 Skill

围绕单一能力爆红的独立 Skill，多数可直接复制使用。

| 名称 | 概括 | Star | 标签 | 链接 |
| --- | --- | --- | --- | --- |
| JuliusBrussee/caveman - 省_token_文风 Skill | 让 Claude 用「穴居人」短语回答，宣称省约 65% token | 86.6k | 单体, 省 token, 文风 | [打开](https://github.com/JuliusBrussee/caveman) |
| blader/humanizer - 去 AI 味 Skill | 移除文本中 AI 生成痕迹的 Claude Code skill | 28.0k | 单体, 去 AI 味, 写作 | [打开](https://github.com/blader/humanizer) |
| op7418/Humanizer-zh - 中文去 AI 味 | Humanizer 的中文版，消除中文文本 AI 痕迹 | 12.7k | 单体, 中文, 去 AI 味 | [打开](https://github.com/op7418/Humanizer-zh) |
| mvanhorn/last30days-skill - 30 天研究 Skill | 跨 Reddit/X/YouTube/HN/Polymarket 等调研并合成摘要 | 50.5k | 单体, 调研, 信息聚合 | [打开](https://github.com/mvanhorn/last30days-skill) |
| virgiliojr94/book-to-skill - 技术书转 Skill | 把技术书 PDF 转成可参考的 Claude Code skill | 8.2k | 单体, 转换, 学习 | [打开](https://github.com/virgiliojr94/book-to-skill) |
| SawyerHood/dev-browser - 浏览器 Skill | 给 Agent 加浏览器使用能力的 Skill | 6.4k | 单体, 浏览器, 自动化 | [打开](https://github.com/SawyerHood/dev-browser) |
| SimoneAvogadro/android-reverse-engineering-skill - 安卓逆向 | 支持安卓 App 逆向工程的 Claude Code skill | 6.4k | 单体, 逆向, 安卓 | [打开](https://github.com/SimoneAvogadro/android-reverse-engineering-skill) |
| zarazhangrui/codebase-to-course - 代码库转课程 | 把任意代码库转成给非技术读者的单页 HTML 课程 | 5.2k | 单体, 教学, 转换 | [打开](https://github.com/zarazhangrui/codebase-to-course) |
| joeseesun/qiaomu-anything-to-notebooklm - 多源转 NotebookLM | 中文 Skill：微信文章/网页/YouTube/PDF 转 Podcast/PPT/思维导图 | 5.5k | 单体, 中文, 内容转换 | [打开](https://github.com/joeseesun/qiaomu-anything-to-notebooklm) |
| glitternetwork/pinme - 一键部署前端 | 一条命令部署前端，支持 Claude Code Skill | 3.7k | 单体, 部署, 前端 | [打开](https://github.com/glitternetwork/pinme) |
| nowork-studio/NotFair - SEO/广告 Skill | 面向 SEO、GEO、Google Ads、Meta Ads 的开源 skill | 3.1k | 单体, 营销, SEO | [打开](https://github.com/nowork-studio/NotFair) |
| lackeyjb/playwright-skill - Playwright 自动化 | 让 Claude 自主编写并执行 Playwright 浏览器自动化的 skill | 2.9k | 单体, 测试, 浏览器 | [打开](https://github.com/lackeyjb/playwright-skill) |
| dominikmartn/nothing-design-skill - Nothing 设计风 | 生成 Nothing 设计语言（单色/排版/工业风）UI 的 skill | 2.6k | 单体, 设计, UI | [打开](https://github.com/dominikmartn/nothing-design-skill) |
| Agentchengfeng/chengfeng-videocut-skills - 视频剪辑 | 中文 Skill：用 Claude Code Skills 做视频剪辑 Agent | 2.6k | 单体, 中文, 视频剪辑 | [打开](https://github.com/Agentchengfeng/chengfeng-videocut-skills) |
| huangserva/skill-prompt-generator - 人像 Prompt 生成 | 中文 Skill：智能组合生成高质量人像描述 Prompt，带自学习 | 1.4k | 单体, 中文, 绘图 prompt | [打开](https://github.com/huangserva/skill-prompt-generator) |
| browserwing/browserwing - 浏览器动作转命令 | 把浏览器操作转成 MCP 命令或 Claude Skill，降低 token 消耗 | 1.3k | 单体, 浏览器, mcp | [打开](https://github.com/browserwing/browserwing) |

## 垂直领域 Skill 集

面向具体行业或角色打包的 Skill 集。

| 名称 | 概括 | Star | 标签 | 链接 |
| --- | --- | --- | --- | --- |
| K-Dense-AI/scientific-agent-skills - 科研 Skill 库 | 140+ 科研 skill + 100+ 科学数据库，覆盖生医化药，跨 Agent | 30.5k | 垂直, 科研, 学术 | [打开](https://github.com/K-Dense-AI/scientific-agent-skills) |
| calesthio/OpenMontage - 视频制作系统 | 开源 agentic 视频制作：12 pipeline / 52 工具 / 500+ skill | 35.4k | 垂直, 视频, 制作 | [打开](https://github.com/calesthio/OpenMontage) |
| phuryn/pm-skills - 产品经理 Skill 市场 | 100+ PM agentic skill/command/plugin，覆盖发现到增长 | 23.0k | 垂直, 产品经理, 市场 | [打开](https://github.com/phuryn/pm-skills) |
| Jeffallan/claude-skills - 全栈开发 Skill | 66 个面向全栈开发者的专项 Skill | 10.5k | 垂直, 全栈, 开发 | [打开](https://github.com/Jeffallan/claude-skills) |
| nidhinjs/prompt-master - Prompt 生成 Skill | 为任意 AI 工具写出准确 prompt 的 skill | 10.3k | 垂直, prompt, 写作 | [打开](https://github.com/nidhinjs/prompt-master) |
| jherrodthomas/automotive-skills-suite - 汽车工程 Skill | 100+ 汽车工程 skill（ISO 26262/21434/SOTIF/ASPICE 等） | 2.0k | 垂直, 汽车, 合规 | [打开](https://github.com/jherrodthomas/automotive-skills-suite) |

## 安全研究 Skill（授权红队 / Bug Bounty）

> 这类 Skill 面向**授权**安全测试与漏洞披露，仅用于合法红队、Bug Bounty 和防御研究；勿用于未授权目标。

| 名称 | 概括 | Star | 标签 | 链接 |
| --- | --- | --- | --- | --- |
| elementalsouls/Claude-BugHunter - Bug 狩猎 Skill 包 | 71 skill + 15 命令 + 681 披露报告模式，覆盖 24 类漏洞 | 2.9k | 安全, 红队, bug-bounty | [打开](https://github.com/elementalsouls/Claude-BugHunter) |
| SnailSploit/Claude-Red - 进攻安全 Skill 库 | 进攻安全方法库（SQLi/EDR 绕过/漏洞利用等），SKILL.md 结构 | 2.7k | 安全, 红队, 进攻 | [打开](https://github.com/SnailSploit/Claude-Red) |
| elementalsouls/Claude-OSINT - 外部侦察 Skill | 90+ 侦察模块 + 秘密正则 + 攻击路径模板，面向授权红队 | 1.9k | 安全, osint, 红队 | [打开](https://github.com/elementalsouls/Claude-OSINT) |

## Plugin / 工具型与脚手架

以 Claude Code Plugin 或项目脚手架形式分发 Skill 与配套能力。

| 名称 | 概括 | Star | 标签 | 链接 |
| --- | --- | --- | --- | --- |
| hesreallyhim/awesome-claude-code - Claude Code 资源总览 | 精选 skill/agent/plugin/statusline 等 Claude Code 资源 | 49.5k | plugin, 资源, 总览 | [打开](https://github.com/hesreallyhim/awesome-claude-code) |
| wshobson/agents - Claude Code 代理集 | 高质量的 Claude Code agent 集合 | 37.7k | plugin, agent, 合集 | [打开](https://github.com/wshobson/agents) |
| davila7/claude-code-templates - Claude Code 模板 | Claude Code 命令/agent/skill 模板与脚手架 | 28.5k | plugin, 模板, 脚手架 | [打开](https://github.com/davila7/claude-code-templates) |
| jarrodwatts/claude-hud - 状态显示 Plugin | 显示上下文用量/活动工具/运行中 agent/进度的 plugin | 26.3k | plugin, 状态, 可观测 | [打开](https://github.com/jarrodwatts/claude-hud) |
| wasp-lang/open-saas - SaaS 脚手架（含 skill） | 免费 JS SaaS 样板，带 AGENTS.md、skills 和 Claude Code plugin | 14.9k | 脚手架, saas, 全栈 | [打开](https://github.com/wasp-lang/open-saas) |
| daymade/claude-code-skills - 生产级 Skill 市场 | GitHub 托管的生产级 skill 市场 | 1.3k | plugin, 市场, 生产级 | [打开](https://github.com/daymade/claude-code-skills) |
| obra/superpowers-marketplace - Plugin 市场 | superpowers 的策展 Claude Code plugin 市场 | 1.1k | plugin, 市场, 策展 | [打开](https://github.com/obra/superpowers-marketplace) |
| JuliusBrussee/cavekit - 蓝图驱动构建 Plugin | 自然语言→蓝图→并行构建计划→可运行软件，含跨模型评审 | 1.1k | plugin, 构建, 自动化 | [打开](https://github.com/JuliusBrussee/cavekit) |

## 相邻格式：Cursor Rules / 提示词

不是 SKILL.md 格式，但同属「给 Agent 喂规则/指令」的相邻资源。

| 名称 | 概括 | Star | 标签 | 链接 |
| --- | --- | --- | --- | --- |
| sanjeed5/awesome-cursor-rules-mdc - Cursor Rules 精选 | Cursor Rules `.mdc` 文件精选列表 | 3.6k | cursor-rules, 相邻, 列表 | [打开](https://github.com/sanjeed5/awesome-cursor-rules-mdc) |
| instructa/ai-prompts - AI Prompt 合集 | 面向 Cursor/Cline/Windsurf/Copilot 的规则与 prompt 合集 | 1.1k | prompt, 相邻, 跨平台 | [打开](https://github.com/instructa/ai-prompts) |

## Skill 目录与市场网站

非 GitHub 仓库的浏览/检索站点（无 Star 列；规模与质量需自行判断）。

| 名称 | 概括 | 链接 |
| --- | --- | --- |
| agentskills.io - Agent Skills 规范站 | 开放格式官方说明、规范字段与兼容客户端列表 | [打开](https://agentskills.io/) |
| skills.sh - Skill 目录与 CLI | 社区 Skill 目录，支持 CLI 安装（常被教程引用） | [打开](https://skills.sh/) |
| SkillsMP - Agent Skills 市场 | 声称 2M+ skill，兼容 Claude Code/Codex/ChatGPT，SKILL.md 格式 | [打开](https://skillsmp.com/) |
| ClaudeSkills.info - Claude Skills 市场 | 自称最大的 Claude Skills 浏览/下载站 | [打开](https://claudeskills.info/) |
| agentskills.host - Skill 市场 | 发现并安装 Claude Code/Cursor 等 agent skill | [打开](https://agentskills.host/) |
| skillsdirectory.com - 已审核 Skill 目录 | 每个 skill 经恶意码/提示注入/凭证窃取扫描，主打安全 | [打开](https://www.skillsdirectory.com/) |
| awesomeclaude.ai - Claude Agent Skill 目录 | 按类别浏览 169+ Claude Agent Skill | [打开](https://awesomeclaude.ai/awesome-claude-skills) |
| mcpservers.org/agent-skills - Agent Skill 列表 | Awesome MCP Servers 维护的 agent skill 页 | [打开](https://mcpservers.org/agent-skills) |
| code.claude.com/docs/skills - 官方 Skill 文档 | Anthropic 官方 Skill 创建/管理/分享文档 | [打开](https://code.claude.com/docs/en/skills) |

## 中文社区补充（接近门槛）

主表按 >1000 Star 收录；以下是中文圈有价值但当前未达门槛的项目，单独列出以免误导。

| 名称 | 概括 | Star | 标签 | 链接 |
| --- | --- | --- | --- | --- |
| laolaoshiren/claude-code-skills-zh - 中文 Skill 合集 | 精选 100+ skill，含 18 个原创可安装技能包，面向中文开发者 | 0.6k | 中文, 合集, 原创 | [打开](https://github.com/laolaoshiren/claude-code-skills-zh) |
