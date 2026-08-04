---
article: docs/ai-coding/llm-cache-read-write-agents.md
style: retro
palette: retro-neon
image_count: 6
generator: gpt-image-2
---

# 大模型缓存：复古配图大纲

## Illustration 1

**Position**: TL;DR 后
**Purpose**: 用一眼可懂的对比说明：缓存读是低价复用，缓存写是有溢价的未来押注。
**Visual Content**: 复古计算机的两个并排数据通道，左侧读缓存，右侧写缓存。
**Text Plan**: 标题「读缓存 vs 写缓存」；标签「0.1 倍价格」「首次写入」「未来复用」；提示「稳定前缀放最前」。
**Filename**: 01-comparison-read-write.png

## Illustration 2

**Position**: “为什么改一个字整条缓存作废”节后
**Purpose**: 展示块 hash 链怎样从第一个变化处断开。
**Visual Content**: 四个相连的 token 方块，其中第三块改动后向后发出故障波纹。
**Text Plan**: 标题「一个 token 改动」；标签「块 hash 链」「第 3 块失配」「后续全 miss」；提示「缓存只复用相同前缀」。
**Filename**: 02-framework-hash-chain.png

## Illustration 3

**Position**: “写缓存到底划不划算：算一笔账”节后
**Purpose**: 把写一次、读零次与读一次的成本分岔说清楚。
**Visual Content**: 复古街机式成本仪表板，三条路线分别通向亏损、回本和节省。
**Text Plan**: 标题「写缓存的回本线」；标签「写 1.25 倍」「读 0.1 倍」「至少复用 1 次」；提示「一次性前缀不值得写」。
**Filename**: 03-infographic-break-even.png

## Illustration 4

**Position**: “agent 的读写结构：大头是读，小头是写”节后
**Purpose**: 说明 Agent 多轮对话为什么读缓存越来越大、新写内容保持较小。
**Visual Content**: 从回合 1 到回合 5 的横向会话磁带，蓝色缓存读区不断增长，粉色新增写区保持短。
**Text Plan**: 标题「Agent 的读写账本」；标签「历史 = 缓存读」「新增 = 缓存写」「回合越多越省」；提示「工具结果追加到最后」。
**Filename**: 04-timeline-agent-ledger.png

## Illustration 5

**Position**: “断点：缓存从哪里开始算”节后
**Purpose**: 展示稳定层、显式断点与易变尾巴的正确排列。
**Visual Content**: 一条左到右的霓虹数据传送带，在断点处分成稳定缓存区与动态尾巴。
**Text Plan**: 标题「把断点放在这里」；标签「系统提示」「工具定义」「项目规则」「cache_control」；提示「稳定层在前，易变层追加」。
**Filename**: 05-flowchart-cache-breakpoint.png

## Illustration 6

**Position**: “5 分钟保鲜期：TTL 是怎么工作的”节后
**Purpose**: 对比命中续期、超时失效与上下文压缩导致的缓存断链。
**Visual Content**: 复古电子钟、5 分钟倒计时和被剪断的磁带，配三种状态卡。
**Text Plan**: 标题「缓存会过期」；标签「5 分钟 TTL」「命中续期」「超过 5 分钟」「压缩会断链」；提示「长停顿后准备重新写」。
**Filename**: 06-infographic-ttl-compaction.png
