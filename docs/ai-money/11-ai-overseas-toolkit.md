# 11 - AI 出海工具箱

把 AI 产品或服务卖给海外用户的技术栈、基础设施和实操指南。不是讲「为什么要出海」，而是回答「出海需要什么工具、怎么搭建、注意什么坑」。

## 判断

AI 出海的本质是用技术能力赚取美元收入。和国内做 AI 产品相比，出海多了三层基础设施需求：**收款**（收美元）、**部署**（让海外用户访问快）、**合规**（不踩 GDPR 等红线）。这三层是硬门槛，不解决就没法开始。

好消息是 2026 年这些基础设施已经非常成熟——Stripe 接收全球支付、Vercel 一键部署、Cloudflare 免费 CDN。一个技术人用一个周末可以搭完整个技术底座。

坏消息是获客难。海外市场没有「微信群发个链接」的获客方式，你需要 SEO、Product Hunt、Reddit、Twitter 等渠道长期经营。产品本身必须解决真实问题，不能靠信息差。

适合出海的 AI 产品类型：

| 类型 | 适合程度 | 原因 |
| --- | --- | --- |
| SaaS 工具（PDF 处理、图片工具等） | ⭐⭐⭐ | 全球通用需求，按月订阅收入稳定 |
| API 服务 | ⭐⭐⭐ | 开发者付费意愿强，不需要本地化 |
| 浏览器扩展 / Chrome 插件 | ⭐⭐ | 安装门槛低，但付费转化难 |
| 内容生成工具 | ⭐⭐ | 竞争激烈，需要差异化 |
| AI Agent 服务 | ⭐⭐ | 新赛道，但客户教育成本高 |

## 基础设施

### 收款

收款是出海的第一道门槛。国内银行卡收不了美元，必须有中间平台。

| 平台 | 手续费 | 结算周期 | 适合谁 | 限制 |
| --- | --- | --- | --- | --- |
| **Stripe** | 2.9% + $0.30 | 2-7 天 | SaaS、API 服务 | 中国大陆主体暂不支持直接开户，需用香港/美国主体或 Stripe Atlas |
| **LemonSqueezy** | 5% + $0.50 | 即时 | 数字产品、小工具 | 手续费高但开箱即用，支持中国大陆开发者 |
| **Paddle** | 5% + $0.50 | 每月 | SaaS、桌面软件 | 作为 MoR（代收代付），帮你处理全球税务 |
| **Gumroad** | 10% | 即时 | 电子书、课程、模板 | 手续费最高但最简单，适合试水 |
| **Creem** | 3.5% + $0 | 即时 | AI SaaS | 支持中国大陆开发者，专为 AI 产品设计 |

**选型建议：**

- 试水阶段 → **LemonSqueezy** 或 **Gumroad**（不需要海外主体，最快上手）
- 正式做 SaaS → **Stripe**（费率最低，生态最完善，需要海外主体）
- 不想处理税务 → **Paddle**（帮你代收全球 VAT）

**主体问题：** Stripe 需要非中国大陆主体。解决方案：

- 注册香港公司（成本约 3000-5000 元）
- 使用 Stripe Atlas 注册美国 LLC（$500 一次性费用）
- 用 LemonSqueezy / Paddle 等平台规避主体问题

### 部署

让海外用户访问快，不能把服务部署在国内服务器。

| 平台 | 免费额度 | 适合 | 说明 |
| --- | --- | --- | --- |
| **Vercel** | 有 | 前端 + Serverless | Next.js 最佳搭档，全球 CDN，免费额度 generous |
| **Cloudflare Pages** | 有 | 静态站点 + Workers | 免费额度最大方，Workers 支持边缘计算 |
| **Fly.io** | 有 | 全栈应用 | 可以跑 Docker，适合有后端的应用 |
| **Railway** | 有（$5/月额度） | 全栈应用 | 比 Fly.io 简单，支持数据库 |
| **Render** | 有 | 全栈应用 | 类似 Heroku，支持 Python/Node/Go |
| **AWS / GCP** | 按量 | 大规模应用 | 成本最低但运维复杂，不适合初期 |

**选型建议：**

- 纯前端（落地页、工具站）→ **Vercel** 或 **Cloudflare Pages**
- 需要后端 → **Fly.io** 或 **Railway**
- 需要 GPU（跑模型）→ **Replicate**、**Together AI**（API 调用比自己部署便宜）

### 域名和 DNS

| 服务 | 费用 | 说明 |
| --- | --- | --- |
| **Cloudflare** | 域名成本价 | 最便宜的域名注册商，免费 DNS + CDN + DDoS 防护 |
| **Namecheap** | ~$10/年 | 老牌域名注册商 |
| **Google Domains**（已并入 Squarespace） | ~$12/年 | 简单好用 |

**建议：** 域名注册用 Cloudflare（成本价），DNS 也用 Cloudflare（免费 CDN）。

### 邮件

海外用户不习惯加微信，邮件是主要沟通渠道。

| 服务 | 免费额度 | 适合 |
| --- | --- | --- |
| **Resend** | 3000 封/月 | 开发者友好，API 发邮件，最适合 SaaS |
| **Mailgun** | 有限 | 老牌邮件 API |
| **ConvertKit** | 1000 订阅者 | 邮件营销、Newsletter |

## 合规

不合规可能被罚款甚至关停。以下是最基础的合规要求。

### 隐私政策

任何收集用户数据的网站都需要隐私政策页面。AI 产品尤其敏感——你可能在收集用户输入的内容来改进模型。

- 用 AI 生成隐私政策草稿，然后找律师审核（成本约 $200-500）
- 或使用 [Termly](https://termly.io/)、[GetTerms](https://getterms.io/) 等工具生成

### GDPR（欧盟）

如果你有欧洲用户，必须遵守 GDPR：

- 网站必须展示 Cookie 同意弹窗
- 用户有权要求删除数据
- 数据处理需要合法依据
- 建议使用 [Cookiebot](https://www.cookiebot.com/) 处理 Cookie 合规

### AI 特有合规

部分国家对 AI 生成内容有额外要求：

- **欧盟 AI Act**（2026 生效）：高风险 AI 系统需要透明度和人工监督
- **美国**：目前没有联邦层面的 AI 法律，但 FTC 会打击虚假 AI 宣传
- **建议**：在产品中明确标注 AI 生成内容，提供人工审核选项

### 不要踩的坑

- ❌ 不要在未经同意的情况下用用户数据训练模型
- ❌ 不要在隐私政策中隐瞒数据收集行为
- ❌ 不要忽视 COPPA（如果有未成年用户）

## 获客

海外没有「微信群转发」这种低成本获客方式。以下渠道按投入产出比排序。

### 免费渠道（投入时间，不花钱）

| 渠道 | 怎么做 | 效果 |
| --- | --- | --- |
| **Product Hunt** | 产品上线当天发布，争取首日排名 | 一次性流量爆发，可能带来 1000-5000 访问 |
| **Reddit** | 在相关 subreddit 分享，不要纯广告 | 长期流量，但容易被骂推广 |
| **Hacker News** | 写技术博客投稿 Show HN | 技术人群精准，但审核严 |
| **SEO** | 写博客文章覆盖长尾关键词 | 见效慢（3-6 个月），但最持久 |
| **Twitter/X** | 分享开发过程、增长数据 | 需要持续经营，适合个人品牌 |
| **GitHub** | 开源部分代码吸引开发者 | 适合技术型产品 |

### 付费渠道（花钱买流量）

| 渠道 | 预算 | 效果 |
| --- | --- | --- |
| **Google Ads** | $500+/月 | 精准但贵，适合有明确搜索词的产品 |
| **Meta Ads** | $300+/月 | 适合面向非技术用户的产品 |
| **Product Hunt Ads** | 按曝光计费 | Product Hunt 首页广告 |
| **Newsletter 赞助** | $200-1000/期 | 在目标受众订阅的 Newsletter 投放 |

### Product Hunt 上线策略

Product Hunt 是 AI 工具最有效的冷启动渠道。一次成功的上线可以带来：

- 首日 2000-5000 访问
- 后续持续的自然搜索流量
- 被博客和 Newsletter 报道的机会

**上线准备：**

1. 提前 2 周在 Twitter 和社区预热
2. 准备好产品截图、视频演示、一句话描述
3. 找 3-5 个有影响力的人帮忙 upvote（不要买假票，会被惩罚）
4. 上线当天（周二到周四效果最好）在太平洋时间 12:01 AM 发布
5. 全天在线回复评论

## 多语言（i18n）

产品出海不一定要做多语言，但做多语言可以显著扩大市场。

| 阶段 | 建议 | 原因 |
| --- | --- | --- |
| MVP 阶段 | 只做英文 | 先验证需求，不要在翻译上花时间 |
| 有付费用户后 | 加上产品界面多语言 | 根据用户来源数据决定优先翻译哪些语言 |
| 稳定增长期 | 加上内容多语言（博客、文档） | SEO 流量翻倍 |

**多语言工具：**

| 工具 | 用途 | 说明 |
| --- | --- | --- |
| **next-intl** | Next.js 国际化 | 最成熟的 Next.js i18n 方案 |
| **Crowdin** | 翻译管理 | 支持社区贡献翻译 |
| **DeepL API** | 机器翻译 | 翻译质量高于 Google Translate |

## 真实案例

### 中国开发者出海成功案例

- **ChatPDF**：中国团队，产品面向全球，上线 5 天 10 万用户（[即刻](https://m.okjike.com/originalPosts/689c5ddf63d0ccf3151d023b)）
- **Pieter Levels**（参考案例）：非中国开发者，但方法论值得学习——零员工年收入 300 万美元，PHP + jQuery + SQLite 极简技术栈（[Fast SaaS](https://www.fast-saas.com/blog/pieter-levels-success-story/)）
- **PDF.ai**：MRR ~10 万美元，单人开发的 AI PDF 工具（[CrazyBurst](https://crazyburst.com/ai-saas-solo-founder-success-stories-2026/)）
- **即刻社区出海一周年**：月入万刀的独立开发者（[即刻](https://m.okjike.com/originalPosts/689c5ddf63d0ccf3151d023b)）

### AI SaaS 收入参考

| 产品 | MRR | 模式 | 技术栈特点 |
| --- | --- | --- | --- |
| PDF.ai | ~$10 万/月 | 订阅 | 单一功能做深 |
| SiteGPT | ~$9.5 万/月 | 订阅 | AI 聊天机器人定制 |
| BoredHumans | ~$7.3 万/月 | 广告 + 高级功能 | 100+ 小工具矩阵 |
| Chatbase | ~$5 万/月 | 订阅 | URL 生成聊天机器人 |

来源：[CrazyBurst](https://crazyburst.com/ai-saas-solo-founder-success-stories-2026/)

共同模式：MVP 几周内完成、聚焦细分市场、SEO/社区增长、使用量计价。

## 技术栈推荐

一个出海 AI SaaS 的最小技术栈：

```
前端：Next.js + Tailwind CSS
部署：Vercel（前端）+ Fly.io 或 Railway（后端）
AI：OpenAI API / Anthropic API / Replicate（按量付费）
收款：LemonSqueezy（初期）→ Stripe（正式）
域名：Cloudflare
邮件：Resend
分析：Vercel Analytics 或 Plausible
```

**月成本估算（MVP 阶段）：**

| 项目 | 费用 |
| --- | --- |
| 域名 | ~$1/月 |
| Vercel | $0（免费额度） |
| 后端托管 | $0-5/月 |
| AI API | $20-100/月（按量） |
| 收款平台 | 0（按交易抽成） |
| 邮件 | $0（免费额度） |
| **合计** | **$21-106/月** |

## 参考资源

- [From 0 to $10K MRR Guide](https://rethinklab.co/blog/from-0-to-10k-mrr-a-2026-indie-hacker-playbook) — 独立开发者完整路线图
- [AI SaaS Solo Founder Success Stories](https://crazyburst.com/ai-saas-solo-founder-success-stories-2026/) — 10 个有收入的案例
- [Micro SaaS Ideas for Solo Founders](https://ideaproof.io/lists/micro-saas-ideas) — 50 个可落地的想法
- [出海独立开发者案例（即刻）](https://m.okjike.com/originalPosts/689c5ddf63d0ccf3151d023b)
- [Stripe Atlas](https://stripe.com/atlas) — 注册美国 LLC 的最简路径
- [LemonSqueezy](https://www.lemonsqueezy.com/) — 无需海外主体的收款平台
- [Vercel](https://vercel.com/) — 全球 CDN 部署
- [Pieter Levels 方法论](https://levels.io/) — 极简技术栈的标杆

## 避坑

- **不要一开始就注册海外公司** —— 先用 LemonSqueezy 或 Gumroad 验证有人愿意付费，再注册主体。注册了公司但没收入等于白花钱
- **不要做多语言** —— 先做英文版验证需求。翻译成本不高但维护成本高，每次改功能都要同步多语言
- **不要忽视 SEO** —— 海外获客最持久的渠道是 Google 搜索。从第一天就写博客，3 个月后才有回报
- **不要只靠 Product Hunt** —— PH 带来的是一次性流量。长期增长靠 SEO 和社区口碑
- **不要用国内 AI API** —— 海外用户访问国内 API 延迟高，且部分国内 API 不允许出海使用
- **不要忘记隐私政策** —— 没有隐私政策的网站在欧美不受信任，也违反法律

## 和其他方向的关系

- 想用 AI 做产品 → 先看 [AI 编程接单](./10-ai-coding-freelance.md)积累经验
- 想做电商出海 → [AI 电商与跨境](./07-ecommerce.md) 有更详细的电商工具链
- 想通过内容赚美元 → [内容生成与自媒体](./01-content-creation.md) 有海外平台写作的方法
- 想做开源工具出海 → [开源工具变现](./03-open-source-monetization.md) 有 SaaS 托管和 API 变现模式
