---
type: mixed
density: rich
style: notion
generator: gpt-image-2
image_count: 10
language: zh-CN
---

# 《ChatGPT 为什么懂你》配图大纲

所有图片采用白底 Notion 风格知识卡片视觉，参考 `references/01-ref-card-layout.png` 的手绘卡片版式。每张图使用清晰、简短的中文标题和卡片标签；不使用品牌 Logo、机器人、深色背景或复杂知识图谱。

## Cover

**Purpose**: 作为公众号封面，先给出文章关于“像懂你”的核心解释。
**Visual Content**: 当前对话、长期记忆、自定义指令和工具四张知识卡片，汇入一张回答卡片；以简短提示强调这不是读心。
**Type Application**: framework
**Filename**: 00-cover-context-not-mind-reading.png

## Illustration 1

**Position**: 「先把『懂』拆开」之后
**Purpose**: 将文章的四种「懂」变成可见的输入来源。
**Visual Content**: 当前对话、长期偏好、意图推断、规则边界四张卡片汇入一张回答卡片。
**Type Application**: framework
**Filename**: 01-framework-four-layers.png

## Illustration 2

**Position**: 「一次回答前，模型收到的并不只有你最后那句话」之后
**Purpose**: 表达一次回答前的上下文装配过程。
**Visual Content**: 消息、聊天记录、指令、记忆、资料工具五类输入，经一个上下文托盘进入输出卡片。
**Type Application**: flowchart
**Filename**: 02-flowchart-context-assembly.png

## Illustration 3

**Position**: 「它怎么在一长串文字里抓住『这个』到底指什么」之后
**Purpose**: 解释注意力的关系选择，而非字面比喻。
**Visual Content**: 一串抽象 token 圆点中，当前输出位置以浅黄突出，几条不同粗细连线指向相关 token。
**Type Application**: framework
**Filename**: 03-framework-attention-links.png

## Illustration 4

**Position**: 「长期记忆不是聊天记录」之后
**Purpose**: 区分当前对话、保存记忆、历史综合三种信息形态。
**Visual Content**: 三个并列但不同形状的容器：短卷轴、便签卡、时间线档案；底部汇入一次任务。
**Type Application**: comparison
**Filename**: 04-comparison-memory-forms.png

## Illustration 5

**Position**: 「为什么记忆不是多存一点就更好」之后
**Purpose**: 呈现记忆的写入、更新、取回和遗忘循环。
**Visual Content**: 从聊天气泡开始，经筛选、带日期的小卡片、相关任务取回、更新或删除的循环。
**Type Application**: flowchart
**Filename**: 05-flowchart-memory-lifecycle.png

## Illustration 6

**Position**: 「一个长对话是怎样慢慢失控的」之后
**Purpose**: 解释长会话里状态漂移和主动重置的必要性。
**Visual Content**: 左侧是不断堆叠的多色任务卡，线条变得凌乱；右侧是一张干净的当前状态卡，旧卡被归档。
**Type Application**: comparison
**Filename**: 06-comparison-context-drift.png

## Illustration 7

**Position**: 「它为什么有时会说得很像，结果却完全不对」之后
**Purpose**: 区分事实、推断与待核实内容。
**Visual Content**: 三层分拣台：有来源的文件夹、半透明推理卡、带问号的核验卡，最后汇入带放大镜的回答页。
**Type Application**: framework
**Filename**: 07-framework-evidence-boundary.png

## Illustration 8

**Position**: 「它会不会把我的每句话都记住」之后
**Purpose**: 解释便利与隐私边界的可控取舍。
**Visual Content**: 四个由开放到隔离的工作空间卡片，锁、眼睛、垃圾桶和时钟图标分别表达查看、授权、删除、过期。
**Type Application**: framework
**Filename**: 08-framework-privacy-controls.png

## Illustration 9

**Position**: 「看一个完整场景」之后
**Purpose**: 用工作日场景串起任务约束、记忆、工具与过期背景。
**Visual Content**: 从上午短消息到下午客户邮件、晚上项目复盘、次日角色变化的四段时间线，最后加入最新数据工具。
**Type Application**: timeline
**Filename**: 09-timeline-working-day.png

## Illustration 10

**Position**: 「想让它更懂你，可以这样写上下文」之前
**Purpose**: 给读者一个可执行的上下文写作框架。
**Visual Content**: 一张主任务卡周围环绕受众、目标、禁区、时限、证据、状态重置六张小卡，用颜色和图标区分。
**Type Application**: infographic
**Filename**: 10-infographic-task-contract.png
