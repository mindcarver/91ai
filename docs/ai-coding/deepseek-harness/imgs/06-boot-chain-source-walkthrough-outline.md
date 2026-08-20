---
article: ../06-boot-chain-source-walkthrough.md
type: mixed
density: rich
style: notion
palette: default
image_count: 10
generator: gpt-image-2
language: zh
---

# dsh 启动链插图大纲

| # | 位置 | 类型 | 文件 | 文字计划 |
| --- | --- | --- | --- | --- |
| 01 | 三层启动链说明后 | framework | `01-framework-startup-chain.png` | dsh 启动链；bin.ts、profile-boot.ts、app-boot、插件树；三层代码，走完一次启动 |
| 02 | `bin.ts` 分发说明后 | flowchart | `02-flowchart-cli-dispatch.png` | bin.ts：按 mode 分发；parseDshArgs、profile、plugin、dump-config、await import；web 只加载 profile 路径 |
| 03 | 环境快照说明后 | framework | `03-framework-layered-env.png` | 启动环境快照；继承环境、调用目录 .env、Harness home .env、context slot；所有插件读取同一时刻的环境 |
| 04 | `composeEntries` 说明后 | infographic | `04-infographic-patch-stack.png` | Patch 栈：由下到上；bundle、profile、home、overlay、composeEntries；越靠上，覆盖优先级越高 |
| 05 | 空根重写说明后 | comparison | `05-comparison-empty-root.png` | 空根为什么每次重写；cordis.yml、[]、Loader 写回、重复 insert；根配置只做锚点，组合来自 patch |
| 06 | `boot()` 九步列表后 | flowchart | `06-flowchart-boot-lifecycle.png` | boot() 的六步启动；new Context、Loader、prepare、mountRootInclude、loader.await、审计；prepare 必须早于条目挂载 |
| 07 | 根 include 说明后 | framework | `07-framework-root-include.png` | 根 include：插件树入口；id='include'、cordis:include、cordis:group、EntryOptions、patches；根条目把配置和 patch 展开成树 |
| 08 | Fiber 状态列表后 | comparison | `08-comparison-fiber-states.png` | Fiber 状态审计；ACTIVE、FAILED、PENDING、waiting for service、assertEntriesActivated；每个启用条目都必须 ACTIVE |
| 09 | 失败清理说明后 | flowchart | `09-flowchart-failure-cleanup.png` | 启动失败也要可诊断；host preparation failed、plugin tree failed to load、dispose、cause、2000 ms；清理有界，错误链保留 |
| 10 | `structuredClone` 说明后 | framework | `10-framework-hot-patches.png` | 用户 Patch 保持热；profile patch、home patch、watchUserPatches、structuredClone、HMR；每一代深拷贝，避免 insert 别名污染 |
