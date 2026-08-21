# 配置、凭证与存储：dsh 的有状态底座三件套

> `dsh` 把用户配置、凭证、存储做成三个独立但同构的接缝，共同的原则是"引用和值分离、机制和策略分离、改了不用重启"。
> 这一篇拆 `ctx.settings`（分层配置解析）、`ctx.credentials`（每次解析的凭证引用）、`ctx.storage` 加 `ctx.storageDomain`（hub 不做 IO 的键值存储），看一个 agent harness 怎么管理会话日志之外的有状态数据。

## 为什么这三个放一起讲

`dsh` 的会话事件日志有自己的独立子系统（persistence），不在这篇的范围。这篇讲的是会话日志之外的另外三类有状态数据：用户配置（settings）、凭证（credentials）、键值存储（storage）。

这三个看起来不相关，但共享同一套设计模式：

- 引用和值分离。配置项、凭证名、存储域名是"引用"，实际的值由 provider 持有。消费者拿到的是引用，运行时才解析。
- 机制和策略分离。接缝定义抽象接口（hub），provider 实现具体介质（文件、环境变量、SQLite），消费者只管声明需求。
- 热更新。三个子系统都支持运行时修改后立即生效，不需要重启进程。
- Secret 感知。配置和凭证都区分 secret 字段，wire 传输时脱敏。

另有一道共用的护栏：`SettingsNamespace`、`CredentialRef` 都是 branded 类型，防止调用方把不同语义的字符串混在一起。理解了这套共同模式，三个子系统就能一次性看透。

## ctx.settings：三层分层解析

用户配置接缝的核心问题是：一个配置值从哪来？

`dsh-settings` 的答案是三层叠加。一个注册了 namespace 的插件，其配置值按以下顺序解析：

```
schema 默认值  →  组合层 base  →  用户层 user section
```

- schema 默认值：Schemastery schema 声明里写的 default，是最底层的兜底。
- 组合层 base：插件注册时声明的组合层值，介于默认值和用户值之间。这是 `cordis.yml` 能影响但不完全控制的那一层。
- 用户层 user section：用户通过 UI 或文件编辑写入的值，优先级最高。只更新这一层，永远不动 base。

一个字段如果不在 user section 里，就继承 base 和 schema 默认值；出现在 user section 里，就标记为"用户覆盖"。`describe()` 返回的 descriptor 会分离 `base` 和 `user` 两个层，让配置 UI 能标记哪些字段是用户改过的，哪些是继承来的。

这里有一个很实际的 API 设计：`replace({})` 会清空 user section，让所有字段回到继承状态。这是配置"重置"的实现方式。

### 跨字段验证

schema 能做单字段验证（类型、范围、枚举），但做不了跨字段验证。比如"如果选了 provider A，model 必须在 A 支持的列表里"这种约束，schema 表达不了。

`dsh-settings` 的解法是注册选项里的可选 `validate` 函数，和声明组合层的 `base`、声明生效时机的 `applies` 并列，在 schema 放行之后运行。它看到的是已经过 schema 校验的完整值，含默认值和组合层，和 owner 将来读到的一样。如果它抛异常，那次写入被拒绝，而不是存一个会让 owner 停工的值。`dsh-llm-pi-ai` 用这个机制拒绝一个它无法服务的 provider 配置，在写入时就报错。

### applies：什么时候生效

每个 namespace 声明一个 `applies` 字段：`'live'` 或 `'restart'`。

- `live`：值变化立即生效，owner 通过 `watch()` 观察变化。提交的变更发 `settings/updated` 事件，解析值没变（deep-equal）就不发。
- `restart`：值变化需要重启才生效，owner 只在构造时读一次，从不 watch。

注意 `applies` 是一个 UI 提示，不是机制。一个 `restart` owner 只是不调用 `watch()`，所以它的值在构造时读一次就固定了。配置 UI 可以据此标记"待重启生效"的 pending change。

### Secret 脱敏

`describe({ redactSecrets: true })` 是每个 wire 传输面必须调用的。它从 value、base、user 三层里剥掉 `role('secret')` 字段，只留下位置信息（path + set slot）。这样配置 UI 能渲染 write-only 输入框，永远不接收 secret 值。

但这带来一个问题：拿着脱敏 descriptor 的调用方无法安全重建 section（它没见过 secret 字段）。所以删除操作走 path op（`{ op: 'unset', path: [...] }`），不走 `replace`。如果脱敏方用 `replace` 重建 section，会悄悄删掉它从没收到过的 secret 字段。path op 让调用方能点名它要改的字段，不需要重述整个 section。

## ctx.credentials：引用和值分离，每次解析

凭证子系统解决的是"怎么把 secret 从配置里赶出去"。

做法很直接：配置项和 `cordis.yml` 条目里只放引用（环境变量名），provider 拥有实际值。消费者每次需要凭证时，调用 `resolve(ref)` 拿值。`CredentialRef` 是一个 branded 类型，底层是 POSIX 风格的环境变量名，brand 防止调用方把凭证引用和普通字符串混在一起。

### 每次解析：热更新的机制

这是凭证子系统最关键的设计决策：**消费者每次操作都重新解析，绝不跨操作缓存**。LLM 适配器每次模型请求都 resolve 一次，所以轮换过的 API key 会在下一次请求就生效，不需要重启。

这和传统配置系统"启动时读一次，缓存到内存"的做法完全相反。为什么能做到？因为 resolve 是一个轻量操作（读环境变量或文件），不是重计算。代价是每次请求多一次 resolve 调用，回报是凭证轮换的零延迟生效。

### 空值即不存在

一条贯穿所有 provider 的规则：**空的存储值在任何地方都等于不存在。**

`resolve` 跳过空值，`describe` 把空值报告为未配置。这防止了一个空白字符串冒充"已配置的 secret"。

### describe 不暴露值

`describe(ref)` 返回的 `CredentialInfo` 只回答三件事：这个引用是否已配置、从哪个层来的、能不能写入，永远不返回值本身。

`writable: false` 有一个具体场景：本地 provider 发现一个引用由当前进程环境变量提供时，报告 `writable: false`。因为写入会"看起来成功"但 resolve 继续返回被环境变量遮蔽的值，不如一开始就拒绝，让 UI 渲染成只读。

### 事件：只为 provider 管理的源触发

`credentials/updated` 事件在 provider 管理的源发生变更时触发（set、unset、外部编辑）。进程环境变量的变化不触发，因为进程环境不可观测。

有意思的是，消费者其实不需要这个事件（它们每次都重新解析）。这个事件存在的唯一理由是让配置 UI 刷新"已配置"的 badge。

## ctx.storage + ctx.storageDomain：hub 不做 IO

存储子系统持久化"除了会话事件日志之外的一切"。它拆成三个角色，严格遵循能力接缝模式。

- Hub（`ctx.storage`）：一个汇合点，不是存储。`ctx.storage.backend` 是一个 name 到 backend 的表，多个 backend 并排挂载。hub 自己不做任何 IO，backend 拥有介质，data form 拥有语义。
- Backend：拥有一种介质（文件树根、数据库文件），暴露可选的操作组，当前唯一的操作组是 `kv`（键值）。两个实现：`json`（每个 unit 一个人类可读文件，原子重写）和 `sqlite`（一个文档一行，适合频繁更新）。
- Data form（`ctx.storageDomain`）：typed API，消费者唯一使用的入口。它通过声明合并挂载到 hub 上，`ctx.storage.domain` 和 `ctx.storageDomain` 是同一个对象。

### Domain：声明一次的 spec

一个 domain 由它的拥有包声明为一个 spec 对象（`DomainSpec`），一次声明就是 domain 身份、布局和记录 schema 的唯一来源。`name` 必须匹配 `UNIT_NAME_RE`，同时当后端单元名用（既是安全的文件名，也是 SQL 标识符段）；`version` 是格式版本，介质上盖了不同版本会在 open 时拒绝；`global` 是可选的全局单例 slot；`tables` 是表声明。schema 用 zod 写，`z.infer` 让消费者类型不用重复。

`defineDomain(spec)` 在模块加载时就钉死 spec 的字面量类型。任何违规（名字不合法、version 不是非负整数、global schema 接受 null）在模块加载时抛异常，在任何介质被触碰之前。null 是介质的"从未写入"哨兵，所以一个能存 null 的 global schema 会让存取不对称。

### 写入链：先持久，再改内存，再发事件

每次写入（put、delete、update、global.set）排在 domain 的写入链上，执行顺序严格固定：

```
排入写入链  →  backend 持久化  →  改内存  →  发 domain/changed 事件
```

**backend 持久化在内存变更之前。** 如果 backend 写入失败，内存不变，读取永远不会和介质不一致。读取是从权威的内存状态同步返回的，不需要等 IO。

`domain/changed` 事件在 backend 确认持久化之后才发出。所以一个抛异常的监听器只是被 contain 和 log，不会拒绝一个已经持久的写入。这个事件是通知，不是事务参与者。

### 路由是 domain 插件的配置

哪个 backend 服务哪个 domain，是 domain 插件的路由表决定的，不是 hub 全局选择。路由写在插件 config 里：顶层 `backend` 键设默认路由（示例里是 `sqlite`），`routes` 下是 domain 到 backend 的映射，示例把 `my-fast-domain` 指到 `sqlite`、把 `my-readable-domain` 指到 `json`。这让"频繁更新的数据走 SQLite，需要人类可读的数据走 JSON"这种混合策略成为配置，不需要代码。

### 没有迁移

当前是 pre-release 姿态：一个盖了不同 version 的介质拒绝 `version-mismatch`，一个无法解析的介质拒绝 `malformed-medium`。没有迁移路径。这是明确的早期取舍。

## 权衡与局限

三个子系统都把"改了不用重启"当默认，软肋也同源：一部分约束靠约定而不是机制，观测各有各的边界。

settings 的 `applies: 'restart'` 没有强制力，只是 UI 提示。一个 restart owner 如果偷偷 watch 了，不会有机制阻止它。

credentials 不观测进程环境变量。改了环境变量但没走 provider 的 set/unset，`credentials/updated` 不发；消费者下次解析照样拿到新值（因为每次都 resolve），但 UI 的 badge 不会刷新。

storage 没有迁移，版本不匹配直接拒绝，pre-release 阶段 schema 变了就得手动处理旧数据。`domain/changed` 也只在进程内：两个进程共享同一个 SQLite 文件时，一个进程的写入不会通知另一个。

credentials 的每次解析有性能代价，每次模型请求多一次 resolve 调用。多数场景可忽略，极高吞吐下值得注意。

## 结论

settings、credentials、storage 是三个同构的接缝：引用和值分离，机制和策略分离，secret 在 API 层面就被脱敏或隔离，改了不用重启。消费者拿到的是引用和类型化入口，provider 持有介质和值，所以换后端、轮换凭证、改配置都不用惊动进程。会话日志之外的有状态数据，就由这三件套收拢。

## 延伸阅读

- [Settings 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/settings.md)
- [Credentials 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/credentials.md)
- [Storage 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/storage.md)
- [能力接缝设计记录](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)
- [Domain KV 存储 Agent Note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md)

上一篇：[web-cordis：dsh 里会改自己插件树的 agent](./34-web-cordis-self-referential-agent.md)
下一篇：[Telemetry 可观测性：dsh 怎么接 OTel 监控](./36-telemetry-observability.md)
