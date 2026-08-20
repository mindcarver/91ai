# 配置实战：dsh 用 patch 改行为，用 preset 做分发组合

> `dsh` 的配置改法是"按 id 替换整行，不做深度合并"，这意味着改一个子系统的行为只需要在 patch 层写一行同 id 的配置覆盖它，不用 fork 源码。
> 这一篇拆三件事：插件 Config 怎么定义、patch 怎么按 id 替换、preset 怎么把一组插件打包成分发单元。

## 配置的心智模型：cordis.yml 是一棵树

`dsh` 启动时，从 profile 指定的 bundle 序列里加载 patch 层，叠出一棵插件树。这棵树是一个扁平的 YAML 数组，每行是一个插件条目。比如一行 id 为 `webserver`，name 是 npm 包 `@deepseek-ai/dsh-host-webserver`，config 下设 `host: '127.0.0.1'` 和 `port: 3080`；再一行 id 为 `llm-deepseek`，name 是 `@deepseek-ai/dsh-llm-deepseek`，config 下只设 `apiKeyEnv: DEEPSEEK_API_KEY`。

每个条目有四个字段：`id`（行标识符，patch 按 id 定位它）、`name`（npm 包名或本地路径）、`config`（传给插件 apply 函数的配置对象）、`disabled`（可选，设为 true 禁用这一行）。

关键点：`id` 是你自己的命名，不是包名。你可以给同一个包挂多个实例（比如多个 MCP server），每个用不同的 id。patch 层通过 id 找到行，替换它的 config 或插入新行。

## Config 怎么定义：Schemastery schema 加类型

插件作者定义配置的方式是在插件入口里导出三样东西：一个 `name` 常量（字符串，如 `my-plugin`）、一个 `Config` 接口、一个同名的 Schemastery schema（`export const Config: Schema<Config>`）。类型上，`Context` 从 `@deepseek-ai/cordis` 导入，`Schema` 从 `@deepseek-ai/schemastery` 导入。`Config` 接口声明三个字段：`greeting: string`、`maxRetries: number`、可选的 `verbose?: boolean`。schema 用 `Schema.object` 构造，逐字段声明类型和默认值：`greeting` 是 `Schema.string().default('Hello')`，`maxRetries` 是 `Schema.number().default(3)`，`verbose` 是 `Schema.boolean().default(false)`。最后的 `apply(ctx: Context, config: Config)` 函数体里只有一句 `console.log(config.greeting)`。

schema 做两件事：校验和填默认值。Cordis 加载插件时用 schema 校验 cordis.yml 里的 config，校验不过就在加载时报错。默认值直接写在 schema 字段上，不单独维护。

`dsh` 有一个硬性的设计原则：**任何两个部署可能想设置不同的值，都必须是配置字段。** 测试方法是：cordis.yml 能不改代码就改变这个值吗？如果不能，它就被硬编码了，这是错的。

错的做法是把超时写成模块常量 `const TIMEOUT = 30000`。对的做法是在 `Config` 接口里加 `timeoutMs: number` 字段，默认值 30000 由 schema 填。

另一个原则：**无效配置大声失败。** 能在 schema 里表达的约束（类型、范围、枚举）写在 schema 里，让插件加载时就拒绝。跨字段的约束用 settings 子系统的 `validate` 函数。不要把无效配置存起来然后运行时静默停工。

## Patch 语义：replace 不是 merge

这是 `dsh` 配置系统最关键的一条规则，值得单独说：

**一个 patch 替换目标行的整个 config，不做深度合并。**

什么意思？假设 base bundle 注册了一行 id 为 `webserver` 的条目，config 下设 `host: '127.0.0.1'` 和 `port: 3080`。你在自己的 patch 里写一行同 id 的条目，config 下只设 `port: 3081`。结果是 webserver 的 config 变成 `{ port: 3081 }`，不是 `{ host: '127.0.0.1', port: 3081 }`。`host` 被丢了，因为你替换了整个 config 对象。

这个设计看起来不方便，实际上很安全。深度合并的问题在于：你不清楚一个字段是"你没有设置所以继承默认值"还是"你显式设置成了这个值"。replace 语义让每次覆盖都是明确的、完整的，没有隐式继承的歧义。

如果你只想改一个字段而保留其余的，你有两条路：要么在 schema 默认值里设好其余字段（这是推荐做法），要么在 patch 里写完整的 config。

插入新行用 `insert`。patch 里写一个 `insert` 键，值是条目列表，比如一条 id 为 `my-custom-tool` 的条目：name 指向本地路径 `./src/my-tool.ts`，config 下设 `apiKey: 'xxx'`。`insert` 列表里的条目和顶层条目格式一样。它们被追加到插件树的末尾。

## Patch 层叠：谁覆盖谁

`dsh` 的配置按层从低到高叠加，高优先级层覆盖低优先级层：

| 层 | 来源 | 生命周期 | 热更新 |
|---|---|---|---|
| Schema 默认值 | Schemastery schema 声明 | 永久 | 不适用 |
| 组合层 base | 插件注册的 `base` option | 直到重新注册 | 不适用 |
| Bundle patch | bundle 包里的 `cordis.patch.yml` | 直到 profile 变更 | HMR 重启 |
| Profile patch | `$DSH_HOME/profiles/<name>/cordis.patch.yml` | 直到用户编辑 | Live（watched） |
| Home 用户 patch | `$DSH_HOME/cordis.patch.yml` | 直到用户编辑 | Live（watched） |
| Launcher patch | CLI 的 `--patch` overlay | 本次运行 | 不适用 |

Home 级 patch 优先级高于 per-profile patch。同一个 id 被多层 patch 覆盖时，最高优先级的那层赢。

`--patch` 是命令行参数，用于一次性覆盖，比如 `dsh web --patch "$PWD/examples/mcp-memory/memorix.cordis.yml"`。这是临时加一层 patch 的方式。想持久化，把内容合并到 profile 或 home 的 `cordis.patch.yml` 里。

## 实战：改一行配置换掉一个子系统

举个具体的例子。假设你想把 web profile 的端口从 3080 改到 9090，并且在 web 上挂一个 MCP 记忆服务器。

创建 `$DSH_HOME/profiles/web/cordis.patch.yml`，内容分两块。第一块是替换：一行 id 为 `webserver` 的条目，config 下重写完整的 `host: '127.0.0.1'` 和 `port: 9090`。第二块是 `insert`：插入一条 id 为 `memory-memorix` 的条目，name 是 `@deepseek-ai/dsh-mcp-client`，config 下设 `serverName: memorix`、`transport: stdio`、`command: memorix`，`args` 是只有一个元素 `serve` 的数组，`cwd` 写 `!!js process.cwd()`。

保存后，profile patch 是 watched 的，下一次启动或者 HMR 触发时就生效了。webserver 的 config 被完整替换（包括 host 和 port），memorix 作为新行被插入。

`!!js process.cwd()` 是 Cordis Loader 支持的 JS 表达式，在配置加载时求值。你可以用它做环境驱动的配置（比如 `!!js process.env.MY_VAR`），不需要外部模板引擎。

## dump-config：改完怎么确认生效

改完配置后跑一句 `dsh --profile web --dump-config`。它打印实际组合后的插件树（不启动进程），你看到的每一行都是所有 patch 层叠完的最终结果，任何一行都能被你自己的 patch 替换掉——这就是"没有特权核心"的实际证明。

一个细节：如果一行 config 的某个字段没出现在 dump 里，可能是它用了 schema 默认值。dump 只显示 cordis.yml 里显式设置的值和 patch 覆盖的值，schema 默认值在运行时填入但不一定显示。

排查语境的完整用法（插件没生效、config 值不对、加载顺序问题的排查路径）见 [38 篇](./38-debugging-and-troubleshooting.md)。

## Preset 系统：可分发的 agent 组合

profile 和 bundle 解决的是"怎么叠出你的插件树"。preset 解决的是另一个问题：**怎么定义一组 agent 的配置，让它们可以被选择和切换。**

`@deepseek-ai/dsh-agent-presets` 插件管理 preset 目录。它的 `Config` 接口有三个字段：`default: string` 是没指定时挂载的 preset id；`roots: PresetRoot[]` 是扫描根目录列表，按优先级排序；`includeUserRoot: boolean` 决定是否追加 harness home 的 `USER_PRESET_DIR`。

一个 preset 是一个目录，里面有一个组合定义。preset 有两个信任级别：

- `system`：随部署发布，可信。
- `user`：本地创建（人写的或 agent 写的），信任级别等同 shell 访问。

preset 的行从 host 组合里解析，不从 preset 目录里解析。这意味着 preset 引用的插件必须已经在 profile 的插件树里。preset 不是独立的插件树，是对现有树的参数化选择。

Quick Start 里提到了几个内置 preset：有减少工具面的 preset，有能让 agent 检查和修改自己 Cordis 插件树的 `cordis` preset。这些是 system trust 的 preset。

## config-catalog：自动生成的配置参考

怎么知道每个插件接受哪些配置字段？看 `docs/config-catalog.md`。

这个文件是由 `scripts/gen-config-catalog.ts` 从源码自动生成的，包含每个可加载包的完整 config 声明（JSDoc 包含在内）。它不是手写的，是编译时事实。

生成器还做一件事：**交叉校验**。它把 runtime Schemastery schema 和粘贴的 config 声明做交叉检查，确保每个 schema 校验的 key（包括嵌套 key）都能在声明的 config 类型上定位到。这样粘贴就不能藏一个 loader 接受但声明里没有的字段。

每个条目还有一个 `Requires:` 行，列出这个插件 `inject` 的 service key。如果你在 cordis.yml 里加载了这个插件，你的插件树里还必须加载那些 service 的 provider。

这个文件是部署维度的参考。插件作者工作面是各子系统页面上生成的 Cordis API 区域，模型可见的工具 schema 是 tool catalog。三个参考各管一个维度。

## HMR：改配置不用重启

配置编辑会热替换插件。Cordis 的 HMR 机制卸载旧实例，加载新实例。因为注册是可逆副作用，旧实例的注册在卸载时自动清理，新实例的注册在加载时建立。

这意味着你改了 cordis.yml 的一行 config，不用重启 `dsh` 进程。插件被替换，行为立即变化。Profile patch 和 home patch 都是 watched 的，文件保存后触发 HMR。

但 bundle patch 不是 live watched 的，它在 HMR 重启时重新应用。这个区别在于：用户级 patch 是你随时可能编辑的，bundle patch 是包发布时固定的。

## 延伸阅读

- [插件配置文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.md)
- [Config Catalog（generated）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/config-catalog.md)
- [Profiles and Bundles 文档](https://zread.ai/deepseek-ai/deepseek-harness/13-profiles-and-bundles)
- [Configuration Reference](https://zread.ai/deepseek-ai/deepseek-harness/21-configuration-reference)
- [Architecture Overview](https://zread.ai/deepseek-ai/deepseek-harness/7-architecture-overview)

上一篇：[Telemetry 可观测性：dsh 怎么接 OTel 监控](./36-telemetry-observability.md)
下一篇：[排查与调试：dsh 这个全插件化 harness 怎么追问题](./38-debugging-and-troubleshooting.md)
