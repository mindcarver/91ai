# Profile 与 Bundle：一个跑起来的 dsh 怎么被拼出来

> 如果这一篇你只能带走一句话，带走这句：一个跑起来的 DeepSeek Harness 不是"一个程序加一堆配置"，而是一棵插件树，由若干层 patch 在启动时往一张空列表上叠加而成，每一层都能改写下面那层注册的任何一行。
> 这一篇讲组合的规则：profile 和 bundle 是什么、层的叠加顺序是什么、patch 怎么工作、怎么用 `--dump-config` 看清你自己机器实际启动了什么。源码层面的启动链路是另一篇的事，这里只把"产品是怎么被拼出来的"这条机制讲透。

## 问题：没有"那个核心"，产品从哪拼出来

DeepSeek Harness 的架构文档有一句反复出现的话：**There is no privileged core to patch**（没有可以被改的特权核心）。你扩展它，不是去改一个内核，而是在别的插件旁边挂一个插件。

这句话立刻引出一个工程问题：如果连模型适配器、工具注册表、会话日志、agent 驱动器本身都是可替换插件，那"一个跑起来的 dsh"到底是怎么从一堆插件变成一个能用的产品的？谁决定挂哪些插件、以什么顺序挂、谁覆盖谁？

答案是一套叫 **profile（配置方案）** 和 **bundle（束）** 的组合机制。它们做的事，用一句话讲：**在启动时，往一张空的插件条目列表上，按固定顺序叠若干层 patch，最终拼出一棵插件树。** 下面拆开讲。

## 两个词：profile 和 bundle

先定义清楚这两个词，它们经常被混着说。

**profile（配置方案）** 是一个命名组合，存在 Harness home 目录下。Harness home 的解析顺序是 `$DSH_HOME` 环境变量，没有就退到 `~/.dsh`。每个 profile 是 `$DSH_HOME/profiles/<名字>` 下的一个目录，里面有三样东西：

- 一个 `package.json`，声明这个 profile 用到的"树外插件"依赖，以及一个 profile 清单字段 `dsh.profile`，里面有一份**有序的 bundles 列表**。
- 用户自己的一份 `cordis.patch.yml`，这是用户自己的 patch 层。
- 那些树外插件的 `node_modules`。

**bundle（束）** 是 Cordis 配置行和它们挂载的代码的分发格式。一个 bundle 是一个 npm 包，它的 `package.json` 里声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，指向自己那份 patch 文件。bundle 的本质就是"一组插件条目 + 它们的默认配置"，被打包成一层可叠加的 patch。

两者的关系：profile 列出要叠哪些 bundle，bundle 提供每一层的实际内容。你可以把 profile 想成"菜谱"，bundle 想成"预制菜"，菜谱决定拿哪几盒预制菜、按什么顺序下锅。

DeepSeek Harness 自带两个 profile 模板：`web` 和 `headless`。它们在第一次使用时自动初始化。别的名字不会自动建，要用得走 `dsh plugin` 路径手动 `initProfile` 创建。

## 拼装的唯一规则：往空列表上叠 patch 层

这是整篇最关键的一段。一个 profile 启动时，组合过程做的是同一件事：

1. 拿一张**空的插件条目列表**。
2. 按 profile 的 `dsh.profile.bundles` 列表顺序，依次把每个 bundle 的 patch 叠上去。
3. 叠完 bundle，叠 profile 自己的 `cordis.patch.yml`。
4. 再叠 home 级的 `cordis.patch.yml`（在 `$DSH_HOME` 根下）。
5. 最后叠任何通过 `--patch` 命令行参数指定的 overlay。

这个顺序很关键：**bundle 在下，用户层在上，命令行 overlay 最上。** 越上面的层优先级越高，能改写下面任何一层注册的内容。

patch 怎么改写？只有两种动作，且规则很硬：

- **按 id 改写**：一个 patch 用 `id` 指向某个已有条目，**替换它整段 `config`**。注意是整段替换，不是深合并。你要保留某个字段，就得在自己的 patch 里把它原样重述一遍。这点在多个 README 的"已知限制"里都被点名强调：没有深合并层。
- **插入新条目**：用 `insert` 加一行全新的插件条目。

另外有一种叫 `!!js` 的表达式，能在挂载时按环境动态算值。最典型的用法是给一行的 `disabled` 字段写一个表达式，让它按平台或条件决定要不要挂载。`disabled` 是唯一一个被这样插值的元数据字段。

这套 patch 的应用，用的是 vendored include 插件自带的 `applyEntryPatches` 算法。这是个刻意的设计选择：组合、flag 推导、配置 dump 用的都是同一个算法，所以"打印出来的配置"和"实际挂载的配置"不会漂移。

## 第一层永远是 dsh-base

不管哪个 profile，bundles 列表的第一层都是一个叫 `dsh-base` 的 bundle。它是所有 profile 共享的地基，往空列表上插入的那批条目，装的是一个 agent harness 必须有的全部基础设施：

- 模型适配器（DeepSeek 自家、还有 Codex 和 Claude Code 的 provider，后两者默认休眠，由 Agent Preset 决定是否启用）
- 默认模型选择（`agent-default-model`）
- 工具注册表
- 持久化（会话存储）
- 沙箱与审批策略
- settings、credentials
- 遥测
- host 级的 subagent provider

`dsh-base` 自己没有运行时 API，它纯粹是一份 patch，通过 manifest 的 `dsh.bundle.patch` 字段被解析。它里面还有一个值得一提的真实例子，说明 `!!js` 和 patch 怎么落地：同一份 patch 文件按平台决定挂哪一套 shell。在 Windows 上，`bash-sandbox` 和 `tool-bash` 这两行带 `disabled: !!js process.platform === 'win32'`（Windows 没有 bash runner，禁用）；它们的孪生行 `pwsh-sandbox` 和 `tool-pwsh` 反过来，只在 win32 上挂载。一份 patch，每台机器恰好挂一套 shell 栈。POSIX 机器看到的是 pwsh 行被禁用，Windows 机器看到的是 bash 行被禁用。

## 两个内置 profile 模板：web 和 headless

在 `dsh-base` 之上，叠什么 bundle 决定了产品的形态。两个内置模板就是两种叠法。

**`web` profile** 叠的是 `dsh-web-app`，它骑在 `dsh-base` 之上，加出浏览器界面这一层。它做的事包括：设置编程人格、插入 Web host 相关的行（webserver、API gateway、workspace、projection cache、storage）、插入浏览器插件清单、装上常驻的客户端插件热重载链，以及挂一个叫 `web-runtime` 的粘合插件。这个 profile 还拥有自己的命令行处理：一个 `web-startup` provider 解析 `--host`、`--port`、可重复的 `--trusted-host` 和 `--help`。它会在发布服务之前就拒绝 `--host 0.0.0.0`，因为 CLI 目前还不支持监听所有网卡。启动后会打印一行本地地址，默认是 `http://127.0.0.1:3080`。

**`headless` profile** 叠的是 `dsh-headless`，它同样直接骑在 `dsh-base` 上，但走的是完全不同的形态：一次性 runner。它设置人格和工具模式、禁用 HMR、挂上 Code Mode 的执行 worker，然后挂一个 `headless-runner` 插件，配置里带一个 `task`（任务文本）。它不挂任何 Host、HTTP server、Web runtime 或浏览器插件，进程不开监听端口。

headless runner 干的事很直接：等 Loader 稳定后，读默认模型，通过 `ctx.agents` 创建一个全新的持久化 Agent，把任务当作一条普通用户消息提交，然后等它跑完（quiescence）。跑完后把最后一段非空的助手文本写到 stdout，通过 launcher 提供的 `ctx.appExit` 钩子请求退出：最后一个 `turn/end` 正常完成就返回 0，否则返回 1。任务文本本身就是命令行的位置参数：`dsh --profile headless "你的任务"`。

两个模板是兄弟关系，共享同一个 `dsh-base` 地基，区别只在上面那层 surface bundle。`web-app` 不挂 `headless`，`headless` 不挂 `web-app`。

## 一个 patch 长什么样

把上面的规则凑成一个具体的形状。一个 patch 文件（不管是 bundle 的 `cordis.patch.yml` 还是用户自己的）是一个顶层的 YAML 数组，数组里每一项是一个 patch 操作。它的结构大致是这样（下面是结构示意，字段名遵循文档记录的 PatchOptions）：

```yaml
# 一个 patch 层 = 一个 YAML 数组，每一项是一个 patch 操作
# 操作一：按 id 改写已有行的整段 config（整段替换，不深合并）
- id: some-existing-row
  config:
    # 这里要重述你想保留的所有字段，再加你要改的字段
    someField: newValue

# 操作二：插入全新的行
- insert:
    - name: './my-plugin.ts'        # 模块说明符，相对路径或 npm 包名
      config:
        greet: hello

# 操作三：用 !!js 按环境动态决定是否挂载（disabled 是唯一被插值的元数据字段）
- id: platform-specific-row
  config:
    disabled: !!js process.platform === 'win32'
```

三个要点再强调一次：第一，`id` 改写是整段 `config` 替换，不是合并，要保留的字段必须重写。第二，`insert` 加新行，新行也能被后续 patch 按 id 改写或禁用。第三，`!!js` 表达式在挂载时按上下文算值，`disabled` 是它最常见、也是唯一被插值的元数据字段。

一个边界情况值得知道：如果一个 patch 的 `id` 指向的条目在已组合的树里根本不存在，它不会让启动失败，只会打一条 stderr 警告。反过来，一个空文件或只有注释的文件会抛错（因为它解析成"什么都没有"，而不是"一个空列表"）；要禁用某个 patch 层，写 `[]`。

## 看你机器实际启动了什么

讲了这么多规则，怎么验证？跑一句：

```sh
dsh --profile web --dump-config
```

它做的事叫 `renderConfigDump`：用 include 插件自己的解析器和 patch 算法，**离线**把基础配置和各层 overlay 组合出来，再渲染成 YAML（`!!js` 表达式原样保留）。因为用的是和真正 `boot()` 挂载时同一个 `applyEntryPatches` 算法，打印出来的就是实际会挂载的那棵树，不会漂移。

输出有个贴心的小设计：凡是用同一个源文件、同一组 patch 层叠出来的一段连续条目，前面会带一条 `# ==` 注释，标明源文件和涉及的层。整个输出是一份可加载的合法 YAML 文档。

它打印出来的每一行，都能被你自己的某个 patch 替换掉。这就是"没有特权核心"的实操含义：你不用 fork 源码、不用改 `dsh-base`，在 profile 或 home 的 `cordis.patch.yml` 里写一行 patch，或者挂一个自己的插件，就能改任何一行的行为。

## 用户的口子：三层 patch 加环境层都能改

作为一个想二次开发的用户，你有好几条改的入口，按优先级从低到高：

- **bundle 层**：`dsh-base`、`dsh-web-app`、`dsh-headless` 这些官方 bundle 提供的默认配置。你最底层。
- **profile 的 `cordis.patch.yml`**：你在某个 profile 目录下自己写的 patch，叠在所有 bundle 之上。
- **home 级的 `cordis.patch.yml`**：在 `$DSH_HOME` 根下写的 patch，叠在 profile patch 之上，所以优先级比 profile patch 更高。
- **`--patch` overlay**：命令行临时指定的 patch，最上层，临时覆盖一切。

这些 patch 层在运行时还活着：boot 会通过一个 HMR watcher 盯着用户 patch 文件，你改了 patch 文件，它会事务化地重新组合整条 patch 列表。如果某次重组合失败（读、解析或 Loader 候选挂了），它会保留上一次能跑的树继续运行，并通过 `hmr/config-update-failed` 事件广播失败，不会让正在用的进程崩掉。

除了 patch，还有一层环境变量。Harness home 和当前调用目录下都可以有 `.env` 文件，调用目录的 `.env` 优先于 home 的，两者都低于继承来的环境变量。凭证单独存在 `.credentials.yaml` 里，和 `.env` 分开，避免凭证混在普通环境配置里。

## 这套组合为什么成立

回头看，profile 和 bundle 这套机制能成立，靠的还是 Cordis 那套可逆副作用。这里值得点出两层联系。

第一，组合本身用的就是 Cordis 的 patch 算法。bundle 不是"配置文件加代码"那么简单，它的每一行都是会被 Loader 当成插件挂载、且注册成可逆 effect 的条目。所以"换掉某层"在运行时是真的卸载一批 effect、挂载一批新 effect，而不是重启进程读新配置。这也是为什么前面那些 HMR、热重载能工作。

第二，正因为每一行都是可逆注册，"patch 改写下面那层"才不是危险操作。你用 patch 禁用一个行、替换一个 provider 的 config，对应的就是卸载旧 effect、挂载新 effect，Cordis 保证这个过程干净。没有可逆副作用撑着，往一棵活着的插件树上随便换层，状态会越改越脏。

所以 profile 和 bundle 不只是"配置管理"，它们是"如何用 Cordis 的可逆组合能力，把一个产品从空列表拼出来、并允许任何一层被替换"的那套规则。理解了这套规则，你才理解 DeepSeek Harness 为什么敢说"任何一行配置都能被你自己的 patch 替换"，也理解了 `dsh --profile web --dump-config` 打印的那棵树，为什么每一行都真的可改。

## 结论

一个跑起来的 DeepSeek Harness 是一棵插件树，由 profile 里有序的 bundle 列表、profile 自己的 patch、home 级 patch、命令行 overlay，依次往一张空列表上叠加而成。第一层永远是 `dsh-base`，装着所有 profile 共享的地基；之上叠 `dsh-web-app` 得到浏览器形态，叠 `dsh-headless` 得到一次性 runner 形态。patch 只做两件事：按 id 整段改写某行的 config，或插入新行，配上 `!!js` 表达式按环境动态决定挂载。`dsh --profile web --dump-config` 用和实际启动相同的算法，把最终那棵树打印出来，每一行都可被你自己的 patch 替换。这套组合之所以能在运行时干净地增删替换，底子是 Cordis 的可逆副作用。

## 时点与诚实声明

本文基于 2026-08-14 的 `deepseek-ai/deepseek-harness` 仓库：架构文档 Profiles and bundles 节、`packages/bundle/base/README.md`、`packages/bundle/web-app/README.md`、`packages/bundle/headless/README.md`、`packages/boot/app-boot/README.md`。文中 profile/bundle 的定义、层叠加顺序（bundle → profile patch → home patch → `--patch` overlay）、patch 的两种动作（id 整段改写、insert）、`!!js` 与 `disabled` 插值、`dsh-base` 的内容清单、两个 profile 模板的职责、`--dump-config` 用 `applyEntryPatches` 离线组合，均来自上述官方文档，为可核实事实。

patch 的 YAML 结构示意是基于文档记录的 PatchOptions（id-targeted config overrides、insert lists、`!!js` allowed）整理的形态，具体行名、字段以仓库 `cordis.patch.yml` 实际内容为准。文中引用的行名（`bash-sandbox`、`tool-bash`、`pwsh-sandbox`、`tool-pwsh`、`agent-default-model`、`headless-runner`、`web-runtime` 等）来自 bundle README，为真实条目或包名。`~/.dsh` 默认 home、`http://127.0.0.1:3080` 默认地址来自 README 与 first-run 指南。`dsh` 处于 developer preview，profile 模板、bundle 清单、patch 字段会随版本变，以实际版本为准。

文中"组合机制靠 Cordis 可逆副作用才成立""patch 改写是卸载旧 effect 挂载新 effect"属分析判断，把官方的 patch 算法和 Cordis effect 机制连起来解释，不是官方文档的原话表述。

## 延伸阅读

- [架构文档：Profiles and bundles](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：profile 与 bundle 的官方定义
- [dsh-base bundle README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/base/README.md)：第一层地基的内容与平台门控
- [dsh-web-app bundle README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/web-app/README.md)：浏览器形态那一层
- [dsh-headless bundle README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/headless/README.md)：一次性 runner 那一层
- [dsh-app-boot README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/app-boot/README.md)：profile 解析、patch 叠加、`--dump-config` 的实现入口
- [生成式组合图（apps/cli/composition.md）](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/composition.md)：官方生成的插件组合关系图

上一篇：[Cordis 五大范式：为什么"注册即可逆副作用"是灵魂](./04-cordis-five-paradigms-reversible-effects.md)
下一篇：[启动链源码导读：从 npx dsh web 到插件树挂载](./06-boot-chain-source-walkthrough.md)
