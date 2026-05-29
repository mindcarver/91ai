# AI 搞钱系列

> 目标：帮技术人判断哪些 AI 变现方向值得投入，哪些是割韭菜，以及每种方向的工具链和关键资源。

AI 赚钱的信息已经严重过载。随便搜一下就有「3 天赚 5783 元」「月入 10 万」的标题。这个系列不追热点，只关注：哪些方向有真实需求、有哪些成熟工具、有什么坑。

## 资料筛选原则

优先收录：

- 有开源项目支撑的工具链（可审计、可二次开发）
- 有真实收入数据或可验证案例的内容
- 能解释「为什么能赚钱」和「钱从哪来」的分析
- 对某个变现方向有明确帮助的实战资源

暂不优先收录：

- 只讲故事不给工具链和操作步骤的内容
- 需要先付费才能看到核心方法的课程推广
- 没有数据支撑的「AI 月入百万」类文章
- 明显的金字塔模式或拉人头变现

## 方向总览

| 方向 | 启动成本 | 收入潜力 | 技术门槛 | 判断 |
| --- | --- | --- | --- | --- |
| [内容生成与自媒体](./01-content-creation.md) | 0-300 元 | 1k-5 万+/月 | 低 | 最容易上手，但竞争激烈，需要差异化 |
| [AI 自由职业](./02-freelancing.md) | 0-500 元 | 5k-3 万+/月 | 低-中 | 需求真实增长中，Upwork AI 技能需求 +1847% |
| [开源工具变现](./03-open-source-monetization.md) | 1k-5k 元 | 1 万-10 万+/月 | 中 | 技术人最佳路径，SaaS 托管/API/咨询 |
| [AI 自动化机构](./04-automation-agency.md) | 1k-3k 元 | 1 万-5 万+/月 | 中 | 利润率 ~75%，适合从自由职业升级 |
| [AI 交易与金融](./05-trading-finance.md) | 1k-5k 元 | 不确定 | 中-高 | 高风险，开源工具有但需要策略验证 |
| [AI 数字人直播](./06-digital-human.md) | 500-5k 元 | 2k-5 万+/月 | 中 | 中国市场热门，成本仅真人 1/10 |
| [AI 电商与跨境](./07-ecommerce.md) | 500-3k 元 | 5k-5 万+/月 | 中 | 一件代发 + AI 自动化，有真实案例 |
| [AI 音乐与有声内容](./08-ai-music-audio.md) | 0-500 元 | 500-3 千美元/月 | 低 | 新兴方向，Suno/Udio 流媒体版税 |
| [AI 小说推文与短视频](./09-ai-novel-push.md) | 0-300 元 | 3k-5 万/月 | 低 | 2024-2025 热门副业，佣金约 8 元/单 |
| [AI 编程接单](./10-ai-coding-freelance.md) | 0-500 元 | 5k-10 万+/月 | 中 | Vibe Coding 大幅提升交付速度 |
| [AI 出海工具箱](./11-ai-overseas-toolkit.md) | $20-100/月 | 不确定 | 中 | 收款/部署/合规/获客全栈指南，适合想做全球市场的技术人 |

判断：技术人优先考虑开源工具变现（方向 3）和自动化机构（方向 4），因为已有技术积累可以直接变现。AI 编程接单（方向 10）适合有开发基础的人利用 Vibe Coding 提升效率。想赚美元的技术人看方向 11（出海工具箱），基础设施已经非常成熟，月成本可以控制在 $100 以内。内容生成（方向 1）虽然门槛最低，但如果没有差异化优势，很难持续。交易（方向 5）风险最高，不建议作为主要方向。

## 精选开源项目

> 开源项目是 AI 搞钱的基础设施。以下按用途分类，优先收录 Stars 高、维护活跃、有明确变现路径的项目。

### 合集类（一站式资源）

| 项目 | Stars | 为什么收录 | 链接 |
| --- | --- | --- | --- |
| MakeMoneyWithAI | 高 | 366+ 项目，每个附 star 数和变现角度，最全面的单一资源 | [GitHub](https://github.com/garylab/MakeMoneyWithAI) |
| aimoneyhunter | ~5.1k | 中文 AI 变现指南，覆盖视频/图片/音频/直播全方向（已归档但内容仍有价值） | [GitHub](https://github.com/bleedline/aimoneyhunter) |
| ai-money-maker-handbook | ~2.2k | 开发者变现指南 + 跨境技术栈，适合有技术背景的人 | [GitHub](https://github.com/XiaomingX/ai-money-maker-handbook) |
| Awesome-AI-Market-Maps | - | 500+ AI 市场地图，含「AI Apps 如何赚钱」专题 | [GitHub](https://github.com/joylarkin/Awesome-AI-Market-Maps) |

### 内容生成工具

| 项目 | Stars | 变现路径 | 链接 |
| --- | --- | --- | --- |
| MoneyPrinterTurbo | 44.0k | 一键短视频 → 广告/联盟/订阅 | [GitHub](https://github.com/harry0703/MoneyPrinterTurbo) |
| Stable Diffusion WebUI | 157.0k | AI 图像 → 印刷品/许可/商品/API | [GitHub](https://github.com/AUTOMATIC1111/stable-diffusion-webui) |
| ComfyUI | 89.8k | 模块化图像工作流 → SaaS 图像工具 | [GitHub](https://github.com/comfyanonymous/ComfyUI) |
| ChatTTS | 37.9k | 语音合成 → 有声读物/语音助手/API | [GitHub](https://github.com/2noise/ChatTTS) |
| MockingBird | 36.7k | 语音克隆 → 配音/广告/订阅 | [GitHub](https://github.com/babysor/MockingBird) |
| upscayl | 40.0k | 图像放大 → 白标 SaaS/电商增强 | [GitHub](https://github.com/upscayl/upscayl) |
| ShortGPT | - | YouTube Shorts/TikTok 短视频自动化框架 | [GitHub](https://github.com/RayVentura/ShortGPT) |
| VideoCaptioner | 10.8k | 字幕生成、转录、翻译 | [GitHub](https://github.com/buxuku/VideoCaptioner) |
| CosyVoice | 11k+ | 阿里通义实验室语音合成 | [GitHub](https://github.com/FunAudioLLM/CosyVoice) |
| fish-speech | 10k+ | 高质量多语言语音合成 | [GitHub](https://github.com/fishaudio/fish-speech) |

### AI 视频生成（开源模型）

| 项目 | Stars | 说明 | 链接 |
| --- | --- | --- | --- |
| Wan2.1 | 高 | 万能视频生成模型，号称超越 Sora，支持本地运行 | [GitHub](https://github.com/Wan-Video/Wan2.1) |
| Open-Sora | 高 | 高效视频生成开源项目，民主化视频制作 | [GitHub](https://github.com/hpcaitech/Open-Sora) |
| Open-Sora-Plan | - | 北大团队复现 Sora 的开源计划 | [GitHub](https://github.com/PKU-YuanGroup/Open-Sora-Plan) |
| CogVideo | 12.0k | 清华文本/图片转视频 | [GitHub](https://github.com/THUDM/CogVideo) |

### 自动化与 Agent 平台

| 项目 | Stars | 变现路径 | 链接 |
| --- | --- | --- | --- |
| n8n | 143.7k | 工作流自动化 → SaaS/咨询/托管 | [GitHub](https://github.com/n8n-io/n8n) |
| Dify | 115.6k | AI 应用平台 → 垂直 SaaS/咨询 | [GitHub](https://github.com/langgenius/dify) |
| LangChain | 116.5k | LLM 框架 → 付费 SaaS 产品 | [GitHub](https://github.com/langchain-ai/langchain) |
| CrewAI | 38.7k | 多 Agent 编排 → 产品化自动化 | [GitHub](https://github.com/crewAIInc/crewAI) |
| Flowise | 44.1k | 低代码 Agent → SaaS/咨询订阅 | [GitHub](https://github.com/FlowiseAI/Flowise) |
| Open SaaS | 12.4k | SaaS 启动模板 → 快速变现 | [GitHub](https://github.com/wasp-lang/open-saas) |

### AI Agent 与浏览器自动化

| 项目 | Stars | 变现路径 | 链接 |
| --- | --- | --- | --- |
| AutoGPT | 178.8k | 自主 Agent → SaaS/插件市场 | [GitHub](https://github.com/Significant-Gravitas/AutoGPT) |
| browser-use | 70.7k | 浏览器自动化 → 数据提取/获客 | [GitHub](https://github.com/browser-use/browser-use) |
| MetaGPT | 58.8k | 多 Agent → SaaS 自动构建 | [GitHub](https://github.com/geekan/MetaGPT) |
| Open Interpreter | - | LLM 本地执行 → 自动化自由职业 | [GitHub](https://github.com/OpenInterpreter/open-interpreter) |
| gpt-researcher | 23.7k | 自主研究 → 付费报告/咨询 | [GitHub](https://github.com/assafelovic/gpt-researcher) |
| skyvern | 14.5k | CV + LLM → RPA 自动化 | [GitHub](https://github.com/skyvern-ai/skyvern) |

### 翻译与本地化

| 项目 | Stars | 变现路径 | 链接 |
| --- | --- | --- | --- |
| LibreTranslate | 高 | 自托管翻译 API → SaaS 翻译服务 | [GitHub](https://github.com/LibreTranslate/LibreTranslate) |
| Argos Translate | - | 离线翻译库 → 本地化工具 | [GitHub](https://github.com/argosopentech/argos-translate) |

### 交易与金融

| 项目 | Stars | 说明 | 链接 |
| --- | --- | --- | --- |
| freqtrade | 高 | 最流行的开源加密货币交易机器人（Python），支持回测和 ML 策略 | [GitHub](https://github.com/freqtrade/freqtrade) |
| OctoBot | - | 支持 15+ 交易所的加密货币交易机器人 | [GitHub](https://github.com/drakkar-software/octobot) |
| awesome-ai-in-finance | - | 金融 AI/LLM 策略与工具精选列表 | [GitHub](https://github.com/georgezouq/awesome-ai-in-finance) |

### 数字人与直播

| 项目 | Stars | 说明 | 链接 |
| --- | --- | --- | --- |
| Fay | 11.9k | 数字人（2.5D/3D）+ LLM 集成框架 | [GitHub](https://github.com/xszyou/Fay) |

## 真实案例

### 独立开发者标杆：Pieter Levels

- 年收入 300 万美元以上，零员工
- 技术栈：PHP + jQuery + SQLite（极其简单）
- 方法论：「12 个月推 12 个产品」，快速发布快速验证
- 来源：[Fast SaaS](https://www.fast-saas.com/blog/pieter-levels-success-story/)、[Levels.io](https://levels.io/)

### AI SaaS 真实收入案例（2026）

| 产品 | MRR | 模式 |
| --- | --- | --- |
| PDF.ai | ~10 万美元/月 | 与 PDF 对话 |
| SiteGPT | ~9.5 万美元/月 | 自定义 AI 聊天机器人 |
| BoredHumans | ~7.33 万美元/月 | 100+ AI 工具（广告+高级功能） |
| Chatbase | ~5 万美元/月 | URL 生成聊天机器人 |
| CustomGPT | 5 万美元+/月 | 企业 AI Agent |
| Write With AI (Substack) | ~33 万美元/年 | AI 资讯付费订阅，Nicolas Cole |

来源：[CrazyBurst](https://crazyburst.com/ai-saas-solo-founder-success-stories-2026/)、[LinkedIn](https://www.linkedin.com/posts/nicolascole_my-400000year-substack-paid-newsletter-activity-7348690827361112065-SwEp)

判断：成功的 AI SaaS 有共同模式 — MVP 几周内完成、聚焦细分市场、SEO/社区增长、使用量计价。不要一开始就做大平台。

### Micro SaaS 数据

- SaaS 市场预计 2026 年达 **$3000 亿**，Micro SaaS 从 $157 亿增长至 2030 年 $596 亿（30% CAGR）
- 成功的 Micro SaaS 独立创始人月入 **$10K-$60K**
- 盈利中位值 MRR **~$4,200**
- 70% 的 Micro SaaS MRR 低于 $1K；90% 的 AI Wrapper 会失败

来源：[StartuPage](https://startupa.ge/blog/micro-saas-ideas-2026)、[BigIdeasDB](https://bigideasdb.com/guides/most-profitable-ai-micro-saas-ideas-2026)

### 中文市场案例

- **自由撰稿人**：月入 8k → 3.5 万元（AI 辅助）([知乎](https://zhuanlan.zhihu.com/p/2014269880564741793))
- **网络小说 AI**：2 人团队月入 100 万+([WoShipm](https://www.woshipm.com/ai/6229764.html))
- **京东数字人**：1.7 万商家用数字人主播，转化率提升 30%，GMV 超 140 亿
- **AI 一件代发**：60 万美元案例 ([YouTube](https://www.youtube.com/watch?v=V5voCDX8bZA))
- **AI 漫画推文**：15 天赚 3 万+ ([知乎](https://zhuanlan.zhihu.com/p/678506616))
- **简历写作副业**：Fiverr 上赚 $250K+ ([Entrepreneur](https://www.entrepreneur.com/side-hustle/my-resume-side-hustle-hit-250k-on-fiverr-and-400k-total-clinchy-career-consulting))
- **即刻社区**：出海一周年月入万刀 ([即刻](https://m.okjike.com/originalPosts/689c5ddf63d0ccf3151d023b))
- **00 后视频号**：AI 知识付费 3 个月变现数十万 ([飞书文档](https://docs.feishu.cn/v/wiki/Un99wkgUyiUj50ksv2vcnEoTnCb/a9))

## 推荐视频资源

### YouTube（英文）

| 频道 | 订阅者 | 内容方向 |
| --- | --- | --- |
| **Matt Wolfe** ([@mreflow](https://www.youtube.com/@mreflow)) | 95 万+ | AI 工具测评、周新闻，FutureTools.io 创始人 |
| **Liam Ottley** ([@LiamOttley](https://www.youtube.com/@LiamOttley)) | 71 万+ | AI 自动化机构（AIAA）商业模式，社区 30 万人 |
| **Sabrina Ramonov** ([@sabrina_ramonov](https://www.youtube.com/@sabrina_ramonov)) | 140 万+ | AI Agent 系统、1 人 AI 企业 |
| **Nate Herk** ([@nateherk](https://www.youtube.com/@nateherk)) | 50 万+ | n8n 工作流、AI Agent，前高盛，社区 25 万人 |
| **Matthew Berman** ([@matthew_berman](https://www.youtube.com/@matthew_berman)) | 54 万+ | AI 新闻、模型发布、开源 LLM 对比 |
| **Greg Isenberg** ([@GregIsenberg](https://www.youtube.com/@GregIsenberg)) | 50 万+ | AI 创业想法、社区建设 |
| **Alex Finn** ([@AlexFinnOfficial](https://www.youtube.com/@AlexFinnOfficial)) | 6.4 万+ | Vibe Coding，非技术人员用 AI 构建产品 |
| **Mark Kashef** ([@Mark_Kashef](https://www.youtube.com/@Mark_Kashef)) | 77.4k | AI 专家，10 年 Data Science & NLP 经验，Prompt Advisers 创始人 |
| **Dan Martell** ([@danmartell](https://www.youtube.com/@danmartell)) | 275 万+ | SaaS 创业教练，25 种 AI 赚钱方法，商业模式拆解 |
| **Corbin Brown** ([@corbinbrown](https://www.youtube.com/@corbinbrown)) | 17.1 万+ | AI 自动化实战，n8n/Make 工作流，从零到 $10K MRR |
| **Grace Leung** ([@GraceLeungCEO](https://www.youtube.com/@GraceLeungCEO)) | 13.8 万+ | AI 副业与在线收入，女性创业者视角 |
| **Ryan Doser** ([@RyanDoser](https://www.youtube.com/@RyanDoser)) | 3.56 万+ | AI 赚钱实战，联盟营销+AI 自动化 |
| **WeAreNoCode** ([@WeAreNoCode](https://www.youtube.com/@WeAreNoCode)) | 30.9 万+ | 无代码+AI 创业，非技术人员构建产品 |
| **Dorian Develops** ([@DorianDevelops](https://www.youtube.com/@DorianDevelops)) | 31 万+ | AI 开发者视角，SaaS 构建与变现 |
| **Authority Hacker** ([@authorityhacker](https://www.youtube.com/@authorityhacker)) | 高 | SEO+AI 内容变现，联盟营销权威 |

### Bilibili（中文）

| 频道 | 要点 |
| --- | --- |
| **暴走 AI 君** ([B 站](https://space.bilibili.com/12638951/)) | AI 赚钱教程、副业方向，~5 万粉丝 |
| **小鱼儿 AI 技术课堂** ([B 站](https://space.bilibili.com/3546654984636898/) / [YouTube](https://www.youtube.com/@xiaoyuerjishu)) | AI 赚钱教程、副业风口 |
| **蚂蚁学 Python** ([B 站](https://space.bilibili.com/61036655/)) | 24 门课程，ChatGPT 赚钱实测 |
| **老麦的工具库** | AI 工具推荐，「爆款选题器」12.9 万播放 |
| **秋芝2046** | 1.25M+ 粉丝，AI 工具深度测评，变现实操 |
| **大黄 AI 黑科技** | AI 前沿工具分享，副业赚钱方向 |
| **AI 冷科长** | AI 赚钱案例分析，实用工具推荐 |
| **艾克 AI 分享** | AI 副业教程，新手友好 |
| **鱼总聊 AI** | AI 创业与商业变现，行业洞察 |
| **土豆的 AI 创业** | AI 创业实战记录，从 0 到 1 |
| **AI 研习社** | AI 技术与商业结合，行业报告解读 |

### 值得看的单集视频

| 视频 | 平台 | 要点 |
| --- | --- | --- |
| [How To Start A 1-Person AI Business](https://www.youtube.com/watch?v=WvsWbgE_kWg) | YouTube | Sabrina Ramonov，1 人 AI 企业完整路线 |
| [YouTube Automation with AI FULL COURSE](https://www.youtube.com/watch?v=BRG51nGbgE_kWg) | YouTube | AI YouTube 自动化免费课程 |
| [How to Build & Sell AI Automations](https://www.youtube.com/watch?v=5TxSqvPbnWw) | YouTube | 构建和销售 AI 自动化 |
| [AI 一件代发 60 万美元案例](https://www.youtube.com/watch?v=V5voCDX8bZA) | YouTube | 完整案例研究 |
| [亲身实操，用 ChatGPT 赚钱的四个办法](https://www.bilibili.com/video/BV1Xs4y127Ar/) | B 站 | 蚂蚁学 Python 出品 |
| [2026 年最赚钱的 6 个 AI 业务](https://www.bilibili.com/video/BV14JmiBAENE/) | B 站 | 长期饭票，非短期风口 |
| [If I Started AI Freelancing in 2026](https://www.youtube.com/watch?v=CRYea6gFWgk) | YouTube | 构建自由职业 AI 生涯 |
| [The 2026 AI Playbook: Focus, Scale, or Die](https://www.youtube.com/watch?v=p7lRrKJFf58) | YouTube | Mark Kashef，AI 专家视角 |
| [Marketing Secrets Behind $300K/Year Newsletter](https://www.youtube.com/watch?v=Qk0zAlUdEcM) | YouTube | AI 付费 Newsletter 营销策略 |
| [5 Profitable Micro SaaS Ideas 2026](https://www.youtube.com/watch?v=Mjp9ME3CJhk) | YouTube | 可落地的 Micro SaaS 想法 |

## 推荐文章

### 中文

| 文章 | 要点 |
| --- | --- |
| [普通人用 AI 赚钱的 10 个方法（2025）](https://zhuanlan.zhihu.com/p/1904922817243358481) | AI 视频 + HeyGen，抖音/快手变现 |
| [普通人如何用 AI 搞钱？月入过万](https://zhuanlan.zhihu.com/p/28020872326) | 数字产品定价模型（29-99 元） |
| [30 个 AI 商业化成功案例](https://zhuanlan.zhihu.com/p/714866165) | 30 个可执行的副业项目 |
| [40 个搞钱 GitHub 仓库](https://zhuanlan.zhihu.com/p/2023156869699510797) | 含 Toonflow（小说转短剧）等 |
| [如何利用 AI 赚钱：17 种方法](https://www.shopify.com/zh/blog/how-to-make-money-using-ai) | Shopify 官方，涵盖软件开发、聊天机器人、数字人 |
| [2026 用 AI 多赚一份收入：12 条路](https://www.woshipm.com/ai/6304504.html) | 适合大陆普通人的 12 条实操路径 |
| [2026 年 AI 赚钱八大方向](https://cloud.tencent.com/developer/article/2660253) | 从 AI 视频、垂直小号到出海 |
| [AI 海外平台写作赚美元](https://www.adspower.net/blog/ai-xie-wenzhang-zhuan-meijun) | 海外内容平台变现指南 |
| [AI 漫画小说推文详细教程](https://zhuanlan.zhihu.com/p/678506616) | 15 天赚 3 万+，AI 漫画推文全流程 |
| [用 ChatGPT+爬虫搞钱](https://cloud.tencent.com/developer/article/2281863) | AI 写爬虫接单变现 |
| [AI 知识付费围猎银发族](https://m.ofweek.com/ai/2025-07/ART-201718-8500-30666887.html) | 知识付费风险警示 |

### 英文

| 文章 | 要点 |
| --- | --- |
| [25 Legit Ways to Make Money with AI in 2026](https://www.danmartell.com/25-legit-ways-to-make-money-in-2026-using-ai-beginner-to-advanced/) | Dan Martell，初学者到高级 |
| [How to Make Money with AI: Complete Guide](https://medium.com/@barronqasem/how-to-make-money-with-ai-in-2026-the-complete-guide-to-building-a-10k-month-digital-business-a09db9dcd698) | Medium，构建 1 万美元/月数字业务 |
| [12 GitHub Projects Making $10K-$50K/Month](https://osintteam.blog/i-analyzed-500-github-projects-these-12-are-quietly-making-developers-10k-50k-month-cb86a987f520) | 500 个项目分析，12 个高收入 |
| [6 AI Wrapper Strategies That Print $10K/Month](https://blog.startupstash.com/6-ai-wrapper-strategies-that-print-10k-month-even-if-you-arent-a-dev-f76ff5691ed3) | StartupStash，AI 封装策略 |
| [AI Agency Business Model 2026](https://medium.com/write-a-catalyst/ai-agency-business-model-2026-how-to-build-a-scalable-system-not-a-freelance-trap-b27e2023878c) | Medium，可扩展系统而非自由职业 |
| [AI SaaS Solo Founder Success Stories](https://crazyburst.com/ai-saas-solo-founder-success-stories-2026/) | CrazyBurst，10 个有收入的案例 |
| [From 0 to $10K MRR Guide](https://rethinklab.co/blog/from-0-to-10k-mrr-a-2026-indie-hacker-playbook) | Rethink Lab，独立开发者路线 |
| [50 Micro-SaaS Ideas for Solo Founders](https://ideaproof.io/lists/micro-saas-ideas) | IdeaProof，50 个可落地的想法 |
| [Most Profitable AI Micro SaaS Ideas 2026](https://bigideasdb.com/guides/most-profitable-ai-micro-saas-ideas-2026) | 窄 B2B 工具比通用 AI 更赚钱 |
| [The AI Freelancer's Playbook: $15K/Month](https://medium.com/@bhallaanuj69/the-ai-freelancers-playbook-15k-month-in-2026-without-writing-code-18f7d9096812) | 不写代码也能月入 $15K |
| [AI Consultant Hourly Rate Guide 2026](https://golance.com/hiring/best-freelance-ai-consultants-hourly-rate) | $40-$350/小时，按经验分层 |

## 社区与信息源

### 中文社区

| 社区 | 说明 |
| --- | --- |
| [V2EX 副业节点](https://www.v2ex.com/go/sidehustle) | 「专注于 MVP 验证、独立开发与睡后收入」，真实数据分享 |
| [即刻社区](https://m.okjike.com) | AI 领域实践者聚集，分享真实收入数据 |
| [生财有术](https://www.shengcaiyoushu.com) | 付费社群，有 AI 变现专题 |
| [小红书 AI 标签](https://www.xiaohongshu.com) | 搜索「AI赚钱」「AI副业」有大量实操分享 |

### 英文社区

| 社区 | 说明 |
| --- | --- |
| [Reddit r/SideProject](https://www.reddit.com/r/SideProject/) | 副业项目分享，有 AI 变现案例 |
| [Reddit r/automation](https://www.reddit.com/r/automation/) | AI 自动化讨论 |
| [Reddit r/OnlineIncomeHustle](https://www.reddit.com/r/OnlineIncomeHustle/) | 在线收入策略，含 AI 变现方法 |
| [Reddit r/AISEOInsider](https://www.reddit.com/r/AISEOInsider/) | AI + SEO 变现策略 |
| [Indie Hackers](https://www.indiehackers.com/) | 独立开发者社区 |
| [AI Automation Discord](https://www.reddit.com/r/automation/comments/1izdjvx/discord_channel_for_ai_automation_enthusiasts/) | AI 自动化爱好者 Discord |
| [AI YouTubers Discord](https://www.reddit.com/r/youtubers/) | YouTube AI 频道创作者社区 |

### Newsletter

| Newsletter | 说明 |
| --- | --- |
| [Write With AI (Substack)](https://substack.com/@writewithai) | Nicolas Cole，年收入 $400K 的付费 AI 资讯 |
| [Latent Space](https://latent.space/) | AI 工程深度分析，技术人必读 |
| [Superhuman AI](https://substack.com/@superhumanai) | AI 新闻与工具速递 |
| [One Useful Thing](https://www.oneusefulthing.org/) | Ethan Mollick，沃顿商学院 AI 应用研究 |

## 行业数据

- AI 原生公司占 GenAI 收入 **63%**（[Menlo Ventures](https://menlovc.com/perspective/2025-the-state-of-generative-ai-in-the-enterprise/)）
- 42% 公司将 AI 工作流优化列为首要支出（[NVIDIA](https://blogs.nvidia.com/blog/state-of-ai-report-2026/)）
- Upwork AI 技能需求增长 **1847%**（2023-2026）
- AI 内容创作市场：2024 年 21.5 亿美元 → 2033 年预计 105.9 亿美元
- AI 图像生成市场预计 2033 年达 **$1.88B**（18.1% CAGR）
- Micro SaaS 市场：$157 亿 → 2030 年 $596 亿（30% CAGR）
- 京东数字人主播：转化率提升 **30%**，成本降低 **82%**
- Shutterstock 2024 年收入 $9.35 亿，其中 $1.04 亿来自 AI 相关

## 避坑指南

以下信号通常意味着不值得投入：

- 需要先买课才能看到核心方法的「AI 赚钱课」
- 收入截图没有对应的产品或服务说明
- 强调「零基础、零成本、躺赚」但需要拉人头的模式
- 没有开源项目或可验证工具支撑的「独家方法」
- 收益完全依赖平台补贴或短期政策的方向
- 「免费带你赚钱」的社群 — 真正轻松赚钱的机会不会无私分享（[V2EX 避坑指南](https://hk.v2ex.com/t/1184892)）
- AI 知识付费课程：售价从几十元到数万元，部分被指「贩卖焦虑」（[北京日报](https://xinwen.bjd.com.cn/content/s67a5c8e3e4b08edd28f4c10a.html)）
