# Cordis 生态溯源：从 Koishi 到 DeepSeek Harness 的插件框架谱系

> 如果你只能从这篇带走一句话，带走这句：Cordis 不是 DeepSeek 发明的，它从 Koishi 聊天机器人框架的四千多个社区插件和四年实战里长出来，被一篇论文形式化为"时空可组合性"范式，`dsh` 把它 vendor 进来并做了 18 处工程加固，让它能承载一个 agent harness 的全部生命周期。
> 这一篇拆 Cordis 的来源、它的基础库谱系、`dsh` 为什么 vendor 而不 npm install、18 处本地修改修了什么，以及它和 Spring、VSCode、NestJS 等插件框架的关键区别。

## Cordis 从哪来：Koishi 的四年实战

Cordis 的源头是 [Koishi](https://koishi.chat)，一个跨平台聊天机器人框架。Koishi 从 2020 年左右开始开发，到 2024 年积累了超过 4000 个社区插件。这是一个真实的、大规模的插件化系统，它的插件系统经过四年和几千个插件的考验。

Cordis 是从 Koishi 的插件系统里抽取出来的独立框架。这个过程类似于 React 从 Facebook 的产品里抽取出来变成独立库：核心抽象被验证有效后，从特定产品里解耦出来，变成一个通用的底层框架。

Cordis 的官方描述是"A Meta-Framework of Spatiotemporal Composability"（时空可组合性的元框架）。目前版本是 4.0.0-rc.7，API 尚未完全稳定。它在 [cordiverse](https://github.com/cordiverse) 组织下维护，有一篇配套论文《A Programming Paradigm for Spatiotemporal Composability》。

`dsh` 选择 Cordis 不是偶然。一个 agent harness 需要的插件能力（运行时挂载/卸载、依赖解析、副作用清理、热更新）正是 Koishi 四年实战打磨出来的。Cordis 把这些能力从聊天机器人场景泛化到了通用场景。

## 时空可组合性：论文说了什么

论文的核心贡献是形式化两个正交的可组合性属性。

**时间可组合性**（temporal composability）：插件可以在运行时安全加载和卸载，不留下垃圾。这是 Cordis 区别于大多数插件框架的关键。大部分框架（Spring、NestJS）能做到空间可组合性，但做不到时间可组合性：你不能在运行时干净地卸载一个模块而不留下悬挂的引用、监听器、定时器。

**空间可组合性**（spatial composability）：管理插件的 context 和依赖。插件声明依赖，框架等依赖就位才激活。插件之间的 context 是隔离的，一个插件的注册不会泄漏到另一个插件的 context 里。

Cordis 用两个机制实现这两个属性：

- **Effect tracking**（副作用追踪）：注册一个工具、监听器、定时器都是副作用，框架追踪它们，插件卸载时按序撤销。
- **Coeffect resolution**（协效应解析）：插件用 `inject` 声明它需要什么 service，框架在依赖就位时才激活插件。

这两个机制合在一起，让"一切皆插件"从一个口号变成了一个有运行时保证的工程事实。`dsh` 敢说"换一个 provider 等于换了整个产品"，因为 provider 的注册是一个可干净撤销的 effect，不是焊死在代码里的 import。

## 基础库谱系

`dsh` vendor 了 Cordis 生态的 9 个包，它们的谱系如下。

**`cosmokit`**（1.8.1）：基础工具库。类似 lodash 但为 Cordis 生态定制，提供一些通用工具函数。这是整个生态的最底层依赖。

**`schemastery`**（3.18.0）：schema 验证和配置系统。类似 zod，但来自 Koishi 生态，和 Cordis 的配置加载深度集成。`dsh` 的所有插件 Config 都用 Schemastery 定义，它的 `schema.toJSON()` 能驱动配置 UI 的表单渲染。

**`cordis`**（4.0.0-rc.7）：核心框架。提供 Context、Fiber、Service、Events、Registry、Reflect 等核心抽象。这是 effect tracking 和 coeffect resolution 的实现。

**`@cordisjs/plugin-loader`**（1.0.0-rc.5）：插件加载器。负责从 `cordis.yml` 读取插件树，加载插件，处理 HMR 和配置变更。`dsh` 的 profile/bundle/patch 系统建立在这个加载器上。

**`@cordisjs/plugin-include`**（1.0.4）：配置包含和 patch。`dsh` 的 patch 层叠（replace 不是 merge）语义实现在这里。

**`@cordisjs/plugin-group`**（1.0.0）：插件分组。管理一组插件的集体生命周期。

**`@cordisjs/plugin-hmr`**（1.0.15）：热模块替换。开发时文件变更触发插件热替换。

**`@cordisjs/plugin-timer`**（1.1.2）：定时器工具。和 effect tracking 集成，插件卸载时自动清理定时器。

**`@cordisjs/plugin-logger-console`**（1.0.0）：控制台日志器。

这个谱系说明 Cordis 不是一个单一的库，而是一个分层的基础设施：从底层工具（cosmokit）到 schema（schemastery）到核心框架（cordis）到上层插件（loader、include、hmr、group、timer、logger）。`dsh` 把整条链都 vendor 了。

## dsh 为什么 vendor 而不 npm install

`vendor/README.md` 的开头解释了这个决定：

> They are copied into this monorepo instead of being depended on via npm, so that the harness fully owns its framework layer (auditable, patchable, pinned).

三个理由：

**Auditable（可审计）**：源码在仓库里，你可以直接读，不需要跳到 node_modules 或 npm registry。安全审计、行为理解、bug 排查都在仓库内完成。

**Patchable（可打补丁）**：`dsh` 对 Cordis 做了 18 处本地修改（下面详述）。如果用 npm install，每次升级要维护一个 patch 文件；vendor 了之后，修改直接在源码里，版本和修改绑定。

**Pinned（固定版本）**：Cordis 是 4.0.0-rc.7，API 不稳定。vendor 锁定了确切的 commit hash（`56b3d4f...`），不会因为 npm 的 semver 解析意外升级。

所有 vendored 包重命名到 `@deepseek-ai` scope（`cordis` 变成 `@deepseek-ai/cordis`），因为 `dsh` 的每个包声明 `cordis` 为 peer dependency，发布 `dsh` 就发布了这层框架。用上游名字发布会在 registry 上抢注。

目录名和上游版本号故意不变，所以 manifest 读起来还是上游快照的样子。第三方依赖（`@standard-schema/spec`、`js-yaml`、`chokidar` 等）留在 npm 上。

## 18 处本地修改修了什么

`vendor/README.md` 列了 18 处本地修改，每一处都有具体的技术原因。挑几个关键的看。

**fiber.ts 生命周期加固**（修改 6）：这是最重要的修改。它关闭了三个 reentrant disposal gap（重入销毁缺口）。effect 的 owner-list wrapper 在 setup body 之前注册；async cleanup 在到达 quiescence 前对 owner 可见；在 owner UNLOADING 时拒绝创建新 effect。这些修改解决了插件卸载时的竞态条件，是 `dsh` 的 HMR 和多 agent 生命周期的安全基石。

**JSDoc 补充**（修改 7）：给 Cordis 的公共 API 加了 `@param`/`@returns` 标签和契约文档。原因是 `dsh` 的网站 API 参考生成器渲染这些文档，未文档化的成员会让它 hard-error。纯注释修改，不改代码。

**事务性 Loader/Include 配置对账**（修改 8）：Loader 在销毁前 import 变更的条目名，等生命周期结算，在候选应用失败时恢复前一个插件或配置。Include 读取和验证分离的候选内容，把 patch 应用到 clone 上，reconcile 树，然后才提交。这让配置变更（HMR、用户编辑）不会让插件树进入半应用状态。

**HMR 精确配置监视**（修改 9）：`registerConfig()` 监视一个绝对配置路径，序列化和合并刷新，返回一个 async disposer 关闭 watcher 并排空活跃工作。这解决了 Windows 短名别名和长格式 libuv 事件路径碰撞的问题。

**Include patch 语义导出**（修改 11）：把私有的 `applyPatches` body 抽成导出的纯函数 `applyEntryPatches`。原因是 `dsh --dump-config` 需要不启动树就组合和打印 include 会挂载什么，配置工具不能重新实现（和 drift）patch 算法。还修复了一个上游 bug：insert 的条目在同一个 patch list 里可以被后续 patch 配置或禁用。

**懒加载 Loader 配置解析**（修改 15）：port 了 cordiverse/cordis#41，保留原始 fiber config，只在声明的 injection 激活后才通过 `internal/config` 解析。这让 `!!js` 表达式在配置加载时求值，而不是在插件声明时。

这 18 处修改的共同主题是：**Cordis 的上游设计是对的，但一个 221 个包的 agent harness 对生命周期的正确性有比聊天机器人更严格的要求。** 这些修改把"大部分时候正确"升级到"在生产级 agent harness 里正确"。

## 和其他插件框架的对比

把 Cordis 放在更广的插件框架谱系里看，它的定位更清晰。

**Spring（Java）**：IoC 容器做到了空间可组合性（依赖注入、bean 生命周期），但做不到时间可组合性。Spring 的 bean 在启动时创建，运行时不能干净卸载。Spring 的热部署靠 OSGi 或 Spring DevTools，是外部方案，不是框架内置能力。Cordis 的时间可组合性是内置的。

**VSCode 扩展**：有一个 extension API，扩展可以安装和卸载。但 VSCode 有一个特权核心（编辑器本身不是扩展）。`dsh` 没有特权核心，连 agent loop 都是插件。VSCode 的扩展卸载也不如 Cordis 干净：扩展可以泄漏进程级状态（全局变量、环境变量修改）。Cordis 的 effect tracking 保证了卸载时清理。

**NestJS**：模块系统做到了空间可组合性（module、provider、dependency injection），但完全不做时间可组合性。NestJS 的模块在启动时静态组装，运行时不能动态加载卸载。它是一个应用框架，不是一个插件框架。

**Webpack/Tapable**：Tapable 做了 hook 系统（类似 Cordis 的事件系统），但它的 hook 不可逆。一旦注册，不能干净撤销。Webpack 的插件在构建时加载，运行时不能热替换。

Cordis 的独特之处在于**同时做到了时空可组合性**。空间上，依赖注入和 context 隔离。时间上，effect tracking 让注册可逆。这两个合在一起，让 `dsh` 的"一切皆插件"成为可能：不仅启动时组合灵活，运行时也能安全地挂载、卸载、热替换任何子系统。

## Cordis 给 agent harness 带来了什么

回到 `dsh` 的具体场景，Cordis 给 agent harness 带来了三个关键能力。

**干净的 provider 替换。** 模型适配器、文件系统、沙箱都是可替换的 service provider。挂一个新的 provider，卸载旧的，运行时上下文干净。这让"一个 provider 的替换移动了整个产品"成为可能（E2B 沙箱替换本地文件系统，Bash/PTY/LSP 全跟着搬）。

**HMR 不留垃圾。** 开发时改一个插件，热替换，旧实例的注册自动清理。这依赖 effect tracking 和 fiber 生命周期加固。没有这个，HMR 会逐渐积累幽灵注册，最终导致状态不一致。

**多 agent 的 context 隔离。** 每个 agent 有自己的 scope，注册在自己的 fiber 上。一个 agent 的卸载不影响其他 agent。这让 `dsh` 能在一个进程里安全地跑多个 agent（root agent、subagent、后台 job）。

这三个能力，传统插件框架至少需要两个才能实现（一个做空间组合，一个做热部署），而且通常做不到 Cordis 这么干净。Cordis 用一个框架同时解决，这是 `dsh` 选择它的核心理由。

## 时点与诚实声明

本文基于 2026-08-14 的 `deepseek-ai/deepseek-harness` `master` 分支，主要参考 `vendor/README.md` 全文。Cordis 和 Koishi 的背景参考 [cordiverse/cordis](https://github.com/cordiverse/cordis)、[Cordis 论文](https://github.com/cordiverse/paper) 和 [Koishi 官网](https://koishi.chat)。vendored 包的版本号和 commit hash 以 `vendor/README.md` manifest 表为准。

文中对 Cordis 与其他插件框架（Spring、VSCode、NestJS、Webpack/Tapable）的对比是分析判断，基于各框架的公开文档和设计。具体的本地修改数量（18 处）以 `vendor/README.md` 的修改日志为准。"Koishi 四千个社区插件"来自 Cordis 论文的 case study 描述。

## 延伸阅读

- [Cordis 框架仓库](https://github.com/cordiverse/cordis)
- [时空可组合性论文](https://github.com/cordiverse/paper)
- [Koishi 官网](https://koishi.chat)
- [dsh vendor README](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/README.md)
- [Cordis Primer（dsh 文档）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)

上一篇：[i18n 翻译配对与质量门禁：中英双语文档怎么不腐烂](./46-i18n-translation-pairing-and-quality-gates.md)
下一篇：[架构横评：dsh vs Claude Code vs Cursor vs Codex](./48-architecture-comparison-dsh-vs-claude-code-cursor-codex.md)
