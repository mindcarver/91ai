# 配置、凭证与存储三件套：agent harness 的有状态底座

> 如果你只能从这篇带走一句话，带走这句：`dsh` 把用户配置、凭证、存储做成三个独立但同构的接缝，共同的原则是"引用和值分离、机制和策略分离、改了不用重启"。
> 这一篇拆 `ctx.settings`（分层配置解析）、`ctx.credentials`（每次解析的凭证引用）、`ctx.storage` 加 `ctx.storageDomain`（hub 不做 IO 的键值存储），看一个 agent harness 怎么管理会话日志之外的有状态数据。

## 为什么这三个放一起讲

`dsh` 的会话事件日志有自己的独立子系统（persistence），不在这篇的范围。这篇讲的是**会话日志之外的另外三类有状态数据**：用户配置（settings）、凭证（credentials）、键值存储（storage）。

这三个看起来不相关，但它们共享同一套设计模式：

1. **引用和值分离。** 配置项、凭证名、存储域名是"引用"，实际的值由 provider 持有。消费者拿到的是引用，运行时才解析。
2. **机制和策略分离。** 接缝定义抽象接口（hub），provider 实现具体介质（文件、环境变量、SQLite），消费者只管声明需求。
3. **热更新。** 三个子系统都支持运行时修改后立即生效，不需要重启进程。
4. **Secret 感知。** 配置和凭证都区分 secret 字段，wire 传输时脱敏。

理解了这套共同模式，三个子系统就能一次性看透。

## ctx.settings：三层分层解析

用户配置接缝的核心问题是：一个配置值从哪来？

`dsh-settings` 的答案是**三层叠加**。一个注册了 namespace 的插件，其配置值按以下顺序解析：

```
schema 默认值  →  组合层 base  →  用户层 user section
```

- **schema 默认值**：Schemastery schema 声明里写的 default，是最底层的兜底。
- **组合层 base**：插件注册时通过 `SettingsRegisterOptions.base` 声明的组合层值，介于默认值和用户值之间。这是 `cordis.yml` 能影响但不完全控制的那一层。
- **用户层 user section**：用户通过 UI 或文件编辑写入的值，优先级最高。只更新这一层，永远不动 base。

一个字段如果不在 user section 里，就继承 base 和 schema 默认值。一个字段如果出现在 user section 里，就标记为"用户覆盖"。`describe()` 返回的 descriptor 会分离 `base` 和 `user` 两个层，让配置 UI 能标记哪些字段是用户改过的，哪些是继承来的。

这里有一个很实际的 API 设计：`replace({})` 会清空 user section，让所有字段回到继承状态。这是配置"重置"的实现方式。

### 跨字段验证

schema 能做单字段验证（类型、范围、枚举），但做不了跨字段验证。比如"如果选了 provider A，model 必须在 A 支持的列表里"这种约束，schema 表达不了。

`dsh-settings` 的解法是 `validate` 函数，在 schema 放行之后运行：

```typescript
interface SettingsRegisterOptions<T> {
  base?: Partial<T>
  applies?: SettingsApplies
  validate?: (value: T) => void
}
```

`validate` 看到的是已经过 schema 校验的完整值。如果它抛异常，**那次写入被拒绝**，而不是存一个会让 owner 停工的值。`dsh-llm-pi-ai` 用这个机制拒绝一个它无法服务的 provider 配置，在写入时就报错。

### applies：什么时候生效

每个 namespace 声明一个 `applies` 字段：`'live'` 或 `'restart'`。

- `live`：值变化立即生效，owner 通过 `watch()` 观察变化。
- `restart`：值变化需要重启才生效，owner 只在构造时读一次，从不 watch。

注意 `applies` 是一个 **UI 提示，不是机制**。一个 `restart` owner 只是不调用 `watch()`，所以它的值在构造时读一次就固定了。配置 UI 可以据此标记"待重启生效"的 pending change。

### Secret 脱敏

`describe({ redactSecrets: true })` 是每个 wire 传输面**必须**调用的。它从 value、base、user 三层里剥掉 `role('secret')` 字段，只留下位置信息（path + set slot）。这样配置 UI 能渲染 write-only 输入框，永远不接收 secret 值。

但这带来一个问题：拿着脱敏 descriptor 的调用方无法安全重建 section（它没见过 secret 字段）。所以删除操作走 **path op**（`{ op: 'unset', path: [...] }`），不走 `replace`。如果脱敏方用 `replace` 重建 section，会悄悄删掉它从没收到过的 secret 字段。path op 让调用方能点名它要改的字段，不需要重述整个 section。

## ctx.credentials：引用和值分离，每次解析

凭证子系统解决的是"怎么把 secret 从配置里赶出去"。

做法很直接：配置项和 `cordis.yml` 条目里只放**引用**（环境变量名），provider 拥有实际值。消费者每次需要凭证时，调用 `resolve(ref)` 拿值。

```typescript
type CredentialRef = Branded<'CredentialRef'>
```

`CredentialRef` 是一个 branded 类型，底层是 POSIX 风格的环境变量名。brand 防止调用方把凭证引用和普通字符串混在一起。

### 每次解析：热更新的机制

这是凭证子系统最关键的设计决策：

> Consumers re-resolve at each operation and must not cache across operations.

消费者**每次操作都重新解析，绝不跨操作缓存**。LLM 适配器每次模型请求都 resolve 一次。所以轮换过的 API key 会在下一次请求就生效，不需要重启。

这和传统配置系统"启动时读一次，缓存到内存"的做法完全相反。为什么能做到？因为 resolve 是一个轻量操作（读环境变量或文件），不是重计算。付出的代价是每次请求多一次 resolve 调用，换来的回报是凭证轮换的零延迟生效。

### 空值即不存在

一条贯穿所有 provider 的规则：**空的存储值在任何地方都等于不存在。**

`resolve` 跳过空值，`describe` 把空值报告为未配置。这防止了一个空白字符串冒充"已配置的 secret"。

### describe 不暴露值

`describe(ref)` 返回的是 `CredentialInfo`：

```typescript
interface CredentialInfo {
  configured: boolean
  source?: string
  writable: boolean
}
```

只告诉你：这个引用是否已配置、从哪个层来的、能不能写入。**永远不返回值本身。**

`writable: false` 有一个具体场景：本地 provider 发现一个引用由当前进程环境变量提供时，报告 `writable: false`。因为写入会"看起来成功"但 resolve 继续返回被环境变量遮蔽的值，不如一开始就拒绝，让 UI 渲染成只读。

### 事件：只为 provider 管理的源触发

`credentials/updated` 事件在 provider 管理的源发生变更时触发（set、unset、外部编辑）。**进程环境变量的变化不触发**，因为进程环境不可观测。

有意思的是，消费者其实不需要这个事件（它们每次都重新解析）。这个事件存在的唯一理由是让配置 UI 刷新"已配置"的 badge。

## ctx.storage + ctx.storageDomain：hub 不做 IO

存储子系统持久化"除了会话事件日志之外的一切"。它拆成三个角色，严格遵循能力接缝模式。

**Hub（`ctx.storage`）**：一个汇合点，不是存储。`ctx.storage.backend` 是一个 name 到 backend 的表，多个 backend 并排挂载。hub 自己不做任何 IO，backend 拥有介质，data form 拥有语义。

**Backend**：拥有一种介质（文件树根、数据库文件），暴露可选的操作组。当前唯一的操作组是 `kv`（键值）。两个实现：`json`（每个 unit 一个人类可读文件，原子重写）和 `sqlite`（一个文档一行，适合频繁更新）。

**Data form（`ctx.storageDomain`）**：typed API，消费者唯一使用的入口。它通过声明合并挂载到 hub 上，`ctx.storage.domain` 和 `ctx.storageDomain` 是同一个对象。

### Domain：声明一次的 spec

一个 domain 由它的拥有包声明为一个 spec 对象：

```typescript
interface DomainSpec {
  readonly name: string        // 必须匹配 UNIT_NAME_RE（同时是文件名和 SQL 标识符段）
  readonly version: number     // 版本不匹配会在 open 时拒绝
  readonly global?: DomainGlobalSpec<unknown>  // 可选的全局单例 slot
  readonly tables: Record<string, DomainTableSpec>  // 表声明
}
```

`defineDomain(spec)` 在模块加载时就钉死 spec 的字面量类型。任何违规（名字不合法、version 不是非负整数、global schema 接受 null）在模块加载时抛异常，在任何介质被触碰之前。`null` 是介质的"从未写入"哨兵，所以一个能存 null 的 global schema 会让存取不对称。

### 写入链：先持久，再改内存，再发事件

每次写入（put、delete、update、global.set）排在 domain 的写入链上，执行顺序严格固定：

```
排入写入链  →  backend 持久化  →  改内存  →  发 domain/changed 事件
```

**backend 持久化在内存变更之前。** 如果 backend 写入失败，内存不变，读取永远不会和介质不一致。读取是从权威的内存状态同步返回，不需要等 IO。

`domain/changed` 事件在 backend 确认持久化之后才发出。所以一个抛异常的监听器只是被 contain 和 log，不会拒绝一个已经持久的写入。这个事件是通知，不是事务参与者。

### 路由是 domain 插件的配置

哪个 backend 服务哪个 domain，是 domain 插件的路由表决定的，不是 hub 全局选择：

```yaml
backend: sqlite       # 默认路由
routes:
  my-fast-domain: sqlite
  my-readable-domain: json
```

这让"频繁更新的数据走 SQLite，需要人类可读的数据走 JSON"这种混合策略成为配置，不需要代码。

### 没有迁移

当前是 pre-release 姿态：一个盖了不同 version 的介质拒绝 `version-mismatch`，一个无法解析的介质拒绝 `malformed-medium`。没有迁移路径。这是明确的早期取舍。

## 三个子系统的共同模式

回头看，三个子系统共享几个设计决策：

**branding 防混淆。** `SettingsNamespace`、`CredentialRef` 都是 branded 类型，防止调用方把不同语义的字符串混在一起。编译器层面的护栏。

**provider 模式。** 三个都是 abstract seam 加 provider 实现。hub 只定义接口，provider 持有介质和值。消费者注入 service，不关心谁实现的。

**热更新。** settings 的 `watch()` + `settings/updated` 事件让 live owner 立即响应。credentials 的每次解析让轮换在下一次操作生效。storage 的写入链让变更在持久化后立即反映在内存读取里。三个都做到了"改了不用重启"。

**secret 感知。** settings 的 `redactSecrets`、credentials 的"describe 不返回值"、storage 的 record schema 都把敏感数据的处理放在了 API 设计层面，不是事后补丁。

**严格的事件语义。** `settings/updated` 是 deep-equal gated（值没变不发）。`credentials/updated` 只为 provider 源触发（环境变量不发）。`domain/changed` 在持久化之后发。每个事件都有明确的触发条件和时序保证。

## 权衡与局限

**settings 的 `applies: 'restart'` 没有强制力。** 它只是 UI 提示。一个 restart owner 如果偷偷 watch 了，不会有机制阻止它。约束靠约定，不靠类型。

**credentials 不观测进程环境变量。** 如果你改了环境变量但没通过 provider 的 set/unset，`credentials/updated` 不发。消费者下次解析时会拿到新值（因为每次都 resolve），但 UI 的 badge 不会刷新。

**storage 没有迁移。** 版本不匹配直接拒绝。pre-release 阶段这意味着 schema 变了就得手动处理旧数据。

**storage 的 domain/changed 事件只在进程内。** 跨进程的变更推送是已知限制。两个进程共享同一个 SQLite 文件时，一个进程的写入不会通知另一个进程。

**credentials 的每次解析有性能代价。** 每次模型请求多一次 resolve 调用。对于大多数场景这是可忽略的，但在极高吞吐场景下值得注意。

## 时点与诚实声明

本文基于 2026-08-14 的 `deepseek-ai/deepseek-harness` `master` 分支，主要参考 `docs/subsystems/settings.md`、`docs/subsystems/credentials.md`、`docs/subsystems/storage.md` 及其引用的源码文件。API 签名以仓库的生成目录（`gen-cordis-catalog`）为准。

文中对三个子系统共同模式的分析是解读结论，不是官方表述。具体的行为描述（分层解析顺序、写入链时序、secret 脱敏机制）直接引自子系统文档和源码。

## 延伸阅读

- [Settings 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/settings.md)
- [Credentials 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/credentials.md)
- [Storage 子系统文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/storage.md)
- [能力接缝设计记录](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-06-13-capability-seams.md)
- [Domain KV 存储 Agent Note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md)

上一篇：[web-cordis：一个会改自己插件树的 agent](./34-web-cordis-self-referential-agent.md)
下一篇：[Telemetry 与可观测性：给 agent 接上 OTel 监控](./36-telemetry-observability.md)
