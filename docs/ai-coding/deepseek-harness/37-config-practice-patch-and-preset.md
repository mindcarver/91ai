# dsh 的配置实战：用 patch 改行为，用 preset 做分发组合

> dsh 把"改行为"和"改代码"切开的方式是配置层叠：插件树里每一行都有自己的 id，patch 按 id 整行替换 config，不做深度合并，层与层按固定顺序叠加，后面的层逐行赢。想确认一层到底改成了什么，`--dump-config` 打印叠完的整棵树，每行带来源注释。preset 则在 host 组合之上做参数化选择：每个 preset 在进程内常驻挂载一次，会话通过作用域认父加入，让一组 agent 配置能被保存、复制、分发、切换。
> 最容易踩的坑也藏在替换语义里：整行替换会把你没写的字段一并丢掉；用字面量整行替换还会杀掉运行时的命令行覆盖，`--port` 从此失效。

## 三个真实场景

先看这一篇要解决的问题有多日常。

场景一：默认 Web 界面监听 3080 端口，你的机器上 3080 被占了。你想改端口，不想重新编译任何东西。场景二：团队里每个人用的模型网关不一样，有人走官方 DeepSeek 端点，有人走自建网关，API key 各自放环境变量。场景三：你给 agent 挂了一个 MCP 记忆服务器，用得很顺，想把这整套组合打包，让同事一条命令得到同样的东西。

三个场景对应三层的答案：改一个值，是 patch 的事；让值可声明、可校验，是插件 Config 和 schema 的事；打包分发，是 preset 和 plugin 管理命令的事。dsh 在这三层上各有一条明确规则，这一篇把三条规则和它们之间的缝讲清楚，截至 2026-08 的版本 0.1.1-rc.2。

为什么这件事值得认真对待。dsh 的卖点是"模型之外的一切都是可替换插件"，如果替换一个 subsystem 要 fork 源码改常量，这个卖点就垮了。配置系统是"没有特权核心"这句话的落点：任何一个插件的行为差异，都应该能在一行配置里表达。反过来说，配置系统一旦有含糊之处，例如你不知道自己的 patch 有没有生效、不知道一个字段从哪层来的，所有插件的可替换性都建立在你不敢动的基础上。所以 patch 的语义必须简单到可以心算，层叠的顺序必须确定，验证手段必须一条命令。

## cordis.yml 是一棵扁平的树

启动时，dsh 从 profile 指定的 bundle 序列加载 patch 层，叠出一棵插件树。这棵树在文件里是一个扁平的 YAML 数组，每行一个插件条目：

```yaml
- id: webserver
  name: '@deepseek-ai/dsh-host-webserver'
  config:
    host: '127.0.0.1'
    port: 3080
- id: llm-deepseek
  name: '@deepseek-ai/dsh-llm-deepseek'
  config:
    apiKeyEnv: DEEPSEEK_API_KEY
```

每个条目四类信息：`id` 是这一行的标识符，patch 靠它定位；`name` 是 npm 包名或本地路径，告诉 loader 加载什么；`config` 是传给插件 apply 函数的配置对象；`disabled` 可选，设为 true 就禁用这一行。

`id` 有一个容易理解偏的属性：它是你的命名，不是包名。同一个包可以挂多个实例，比如三个 MCP server 各占一行，id 分别是 memory、search、db，name 都是同一个 mcp-client 包，config 各自给各自的连接参数。这也解释了为什么 patch 按 id 而不是按包名定位：按包名定位在多实例场景下是歧义的，按 id 定位永远指向确定的一行。

树的形状是扁平的，没有嵌套层级。插件之间的影响靠服务注入和事件，不靠配置上的父子关系。这个决定直接决定了 patch 语义可以做成什么样：对一棵扁平的行列表，"整行替换"是一个无歧义的操作；对一棵深嵌套的树，任何替换都要回答"子节点怎么办"，深度合并的复杂度就从这里开始。

## Config 和 schema：类型即文档，默认值即声明

插件作者在入口导出三样东西：一个 `name` 常量、一个 `Config` 接口、一个同名的 Schemastery schema。schema 用 `Schema.object` 逐字段声明类型和默认值，比如 `Schema.string().default('Hello')`。`apply(ctx, config)` 拿到的，是校验通过且填完默认值的配置。

schema 做两件事，校验和填默认值。Cordis 加载插件时拿它校验 cordis.yml 里的 config，校验不过，加载时报可行动的错误，进程不会带着一份坏配置继续跑。约束写法是分层的：字段自身的约束（类型、必填、枚举、范围）写在 schema 里，`Schema.union(['fast', 'accurate']).default('fast')` 一行就够；跨字段的约束归 settings 子系统的 validate 函数管。判断标准是约束需不需要看见别的字段或活的服务：不需要就进 schema，加载期就拦下；需要就进 validate，等到服务都在了再判断。

默认值直接长在 schema 字段上，不单独维护一份。这个安排和后文的替换语义是配套的：既然 patch 是整行替换，被替换后丢掉的字段靠什么兜底？靠 schema 默认值。默认值和校验声明在同一个位置，意味着"这个字段有哪些合法取值、不写会是什么值"在源码里一处可查。

dsh 在这里有一条硬性设计原则，官方文档原文是：harness requires anything that two deployments may want to set differently to be a configuration field，任何两个部署可能想设置不同的值，都必须是配置字段。检验方法也给了：cordis.yml 能不能不改代码就改变这个值。不能，它就是被硬编码了，是错的。错的写法是把超时写成模块常量 `const TIMEOUT = 30000`；对的写法是在 Config 接口里加 `timeoutMs` 字段，默认值 30000 由 schema 填。这条原则把"配置面"从感觉变成了可检验的命题：review 一个插件时，扫一遍模块级常量，每个常量都问一句"会不会有部署想改它"。

配套原则是无效配置大声失败。能在 schema 里表达的约束都进 schema，加载期拒绝；不要把无效配置存起来，运行期静默停工。静默失败在配置场景里特别毒：一份坏配置可以让某个插件悄悄不干活，界面照常，直到几小时后你发现某个能力一直没生效。

这些声明的汇总有一份自动生成的参考：`docs/config-catalog.md`，由仓库脚本从源码生成，包含每个可加载包的完整 config 声明，连 JSDoc 注释都在内。生成器同时做交叉校验，把运行时 schema 和粘贴的类型声明比对，schema 校验的每个 key（包括嵌套 key）都必须能在声明上定位到。这道校验防的是一种漂移：loader 实际接受一个字段，类型声明里却没有，使用者看文档永远不知道它存在。每个条目还带 `Requires:` 行，列出这个插件注入的 service key；你加载了它，树里就必须同时加载那些 service 的 provider，缺了会在组合期暴露。三个参考各管一个维度：config catalog 是部署维度的配置参考，各子系统页面的 Cordis API 区域是插件作者的工作面，tool catalog 是模型可见的工具 schema。

## patch 语义：replace 不是 merge

这是整个配置系统最关键的一条规则：一个 patch 替换目标行的整个 config，不做深度合并。CLI 参考的原文说得很精确：patch 替换目标行完整的 `config` 值而不是按键合并，并且可以插入新行。

走一个会出错的例子。base bundle 注册了一行 id 为 `webserver` 的条目，config 里有 `host: '127.0.0.1'` 和 `port: 3080`。你在自己的 patch 里写一行同 id 的条目，config 只写 `port: 3081`。叠完的结果是 webserver 的 config 只有 `port: 3081`，host 没了。不是 host 变回某个默认，是整个对象被换掉了，你没写的键不存在。

这个设计看起来不体贴，实际是在防一类更阴险的问题。深度合并的世界里，一个字段读到某个值，你分不清它是"你没设置，继承了下层的值"还是"某层显式设置成了这个值"。排查配置问题时，深度合并逼你把所有层的所有键在脑子里做一遍交并补；replace 语义下每一行只有一个所有者，就是赢的那一层。明确性换便利性，dsh 选了明确。

只想改一个字段而保留其余，有两条正路。推荐的一条是只写你关心的字段，其余字段靠 schema 默认值兜底：你 patch 里只写 `port: 9090`，host 落回 schema 声明的默认值，行为等价于"改了一个字段"。前提是插件作者守了上一节那条原则，把所有部署可能想调的值都做成了带默认值的字段。另一条是在 patch 里写完整的 config，把每个字段都显式写出来，不依赖默认值。第二条更啰嗦，但当你不确定 schema 默认值是什么时，它是唯一保证结果的方式。

插入新行走 `insert` 键：patch 里写一个 `insert`，值是条目列表，格式和顶层条目一样，追加到插件树末尾。替换和插入是 patch 仅有的两种动作，没有删除、没有重排。想"删掉"一行 base 里的插件，用条目上的 `disabled: true`。这是我的归纳：动作词表收得这么小，是因为插件之间的影响本来就不靠配置树里的位置表达，一个插件要用另一个插件的服务，走的是注入声明，不是排在它后面。

替换语义和层叠规则组合起来，会产生一个单看任何一条都想不到的结果，值得用例子走一遍。bundle 层给 webserver 行写了 `host` 和 `port` 两个字段。你在 profile patch 里只想改端口，写了 `config: {port: 9090}`，叠完这行只剩 port，host 落回 schema 默认值。接着你的同事在 home patch 里只想改监听地址，写了 `config: {host: '0.0.0.0'}`，让机器上的所有 profile 都对外可见。最终结果是什么？不是 host 和 port 都改了。home 层的替换同样作用于整行，port 字段被这次替换抹掉，落回 schema 默认值 3080。两层各改一个字段，活下来的只有后一层改的那个字段，前一层改的字段被替换回默认值。两个人各自检查自己的 patch 都"只写了一个字段"，谁也没做错什么，端口却回到了 3080。这是 replace 语义在多层场景下的真实代价：每一层的替换都是对"叠到此为止的整行"做的，不是对"bundle 的原始行"做的，所以层与层之间的字段不会自动并集。想让跨层改同一行的多个字段共存，要么并进同一层，要么有一层写完整 config。

### 一个用字面量替换杀掉命令行的故障

替换语义里埋着一个官方参考点名的问题，值得完整推演一遍。

Web 界面的端口既能写在 config 里，也能在启动时用 `--port 8080` 临时覆盖。命令行覆盖的机制值得先看清：每个从 flag 取值的配置行注入 `cmdlineArgs` 服务，loader 等这个服务激活后再对配置行求值，webserver 的端口字段写的是 `port: !!js ctx.webStartup.port ?? 3080` 这样的运行时读取，flag 的值在求值那一刻赢过写死的值。现在你嫌 3080 不吉利，在 home patch 里整行替换 webserver 的 config，把 host 和 port 都写成字面量，port 写死 9090。保存，热重载生效，端口变成 9090，一切正常。

第二天你想临时换个端口跑一次，敲 `dsh web --port 7070`，起来的还是 9090。原因就在那行字面量替换：你替换掉的不只是值，是"这个字段会被运行时再读一次"这个机制本身。config 里是字面量，`!!js` 读取没了，命令行覆盖失去了挂靠点。官方参考的原话：用户 patch 用字面量替换整个 config，也会随之移除运行时读取。

修复方式不是绕过 patch，而是回到正路：patch 里只写你真正要改的字段，让端口字段保持它原有的运行时读取性质。这个故障的特征是"配置看起来完全正常"，端口确实是 9090，没有报错，没有日志异常，只有命令行覆盖悄悄失灵。配置问题里最难排查的一类就是这种：不是失败了，是某个机制被无声地换掉了。

顺带一条反向的安心消息：在线编辑 `cordis.patch.yml` 时，系统会根据仍在运行的服务重新计算表达式，因此一次热重载不会重置当前正在使用的端口。表达式活着，热编辑就温和；表达式被字面量替换掉了，热编辑和命令行覆盖一起失灵。

## 层叠：谁覆盖谁

多个 patch 层同时存在时，顺序是定死的。CLI 参考给出的组合顺序，在一个空根上依次应用：profile manifest（`dsh.profile.bundles` 列表）里各 bundle 的 patch，按列表顺序；然后是 profile 自己的 `cordis.patch.yml`；然后是 home 级的 `$DSH_HOME/cordis.patch.yml`，这是各 profile 共享的机器本地偏好，所以优先于逐 profile 层；最后是命令行上每个 `--patch` 路径，按 argv 出现顺序。规则一句话：后面的层逐行赢。同一个 id 被多层覆盖，赢的是最后碰它的那层；多个 `--patch` 同时给，后面的胜前面的。

| 层 | 来源 | 生命周期 | 生效方式 |
|---|---|---|---|
| Schema 默认值 | Schemastery schema 声明 | 随插件定义 | 运行时填入 |
| 组合层 base | 插件注册时的 base option | 直到重新注册 | 随组合变化 |
| Bundle patch | bundle 包里的 `cordis.patch.yml` | 随 profile 冻结 | 重启时应用 |
| Profile patch | `$DSH_HOME/profiles/<name>/cordis.patch.yml` | 直到用户编辑 | 实时监听 |
| Home 用户 patch | `$DSH_HOME/cordis.patch.yml` | 直到用户编辑 | 实时监听 |
| Launcher patch | CLI 的 `--patch` overlay | 本次运行 | 启动时应用 |

注意这个表里没有"环境变量层"。环境变量不出现在层叠顺序里，它们是值的来源而不是层：config 里写 `apiKeyEnv: DEEPSEEK_API_KEY`，意思是这个字段的值去环境变量里读。层叠决定"这行 config 是谁说了算"，环境变量决定"某个字段的值从哪来"，两个问题正交。

`--patch` 是给一次性场景的：临时挂一份补丁文件试一下，比如 `dsh web --patch ./my-trial.yml`，用完即走，什么都不留。想持久化，就把内容并进 profile 或 home 的 `cordis.patch.yml`。判断该放哪层的依据是生命周期：跟这个 profile 走的放 profile，跟这台机器上所有 profile 走的放 home，只活一次的放 `--patch`。

模块解析也有确定的链条。组合包名称先从 dsh 安装本身找，再从 profile 自己的 node_modules 找，所以内置组合包（`dsh-base` 基座、`dsh-web-app` Web 应用、`dsh-headless` 无头模式、`dsh-sdk-app` SDK 服务器、`dsh-acp-app` ACP 服务器、独立树的 `dsh-sdk-minimal`）永远来自当前安装，树外组合包来自 profile 里 pnpm 管的依赖。patch 行里的裸插件 `name` 从 profile 目录开始按 Node 的规则逐级向上查找，终点是 dsh 维护的安装后备目录 `$DSH_HOME/profiles/node_modules`，那里为安装所依赖的每个包维护一个符号链接，每次启动时修复。

外部插件的进出走 `dsh plugin --profile <name> add <package-or-git-spec>`。它在 profile 缺失时先初始化它（五个内置名字有随附模板：web、headless、sdk、sdk-minimal、acp；其他名字装 base），然后以 profile 目录为工作目录把参数转发给 pnpm，add、remove、why、update 全部照常可用。关键是每次成功运行后，系统按当前安装状态更新 `dsh.profile.bundles`：依赖的包在 manifest 里声明了 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`，它就加入配置层栈；没有声明的依赖保留为普通依赖并给一次性警告；被移除的依赖从层栈里删掉。装包即叠层，卸包即撤层，中间没有手工编辑 manifest 的环节。

## 生命周期错位：活的层和冻的层

层叠表里最值得盯的一列是生效方式，因为它不是统一的。profile patch 和 home patch 是被监听的：进程跑着，你编辑保存，下一次启动或热重载触发时就生效，不用重启。CLI 参考的描述是，每次启动 profile 时都会监听这两层 patch 的有效编辑，并以事务方式重新应用。"事务性"在这里的含义是重新应用要么整体成功要么整体不动，不会出现半棵树是新配置半棵树是旧配置的中间态。

但热重载有一条物理上限：表达式在重新求值时，只能对着还活着的服务求值。端口是最直观的例子，一个已经在监听的端口没法被热重载"改掉"，要换端口只能重启。这不是实现偷懒，是热更新和已分配资源的边界：配置能换掉插件实例，换不掉操作系统里已经绑定的 socket。上一节那条"热编辑不重置在用端口"正是这条上限的温和面。

值得把"事务性重新应用"在热重载里的分量单独说清。一次 patch 编辑可能同时影响多行，比如你在一个文件里改了 webserver 的端口又插入了记忆插件。如果应用是逐行渐进的，会存在一个时间窗口，webserver 已经按新配置重建而记忆插件还没挂上，这个窗口里任何一次请求都会看到半新半旧的树。事务性要求的是这个窗口不存在：全部变更一起提交，要么整棵树进入新状态，要么保持旧状态。对一次编辑内部是如此，对失败也是如此，新配置里有一行加载不了，整次编辑不落地，运行中的树不受牵连。这和无效配置大声失败是同一条纪律在两个生命周期上的表现：冷启动时坏配置拒绝启动，热更新时坏编辑拒绝落地。

bundle 层则是完全冻结的。一个运行中的 profile 保持它启动时那套 bundle 集合，你增删改了 bundle 声明（包括 plugin 命令带来的自动更新），正在跑的这个进程不知道也不需要知道，下次启动才用新的。原因和上面同源：bundle patch 决定的是"这棵树有哪些行"这种结构性事实，结构的变更牵动加载、依赖解析和整批插件的起停，把它做成热的，事务性重新应用的粒度就不再可信。所以边界画在：行内 config 的变更是热的，行集合的变更是冷的。

还有一条容易被漏掉的联动：换了 bundle，新 bundle 带来的工具不会自动出现在已有 agent 手里。plugin 命令的输出明确提醒：下一次启动时每个已安装 bundle 只注册自己的休眠 host provider，还要在复制出的 preset 中单独启用对应工具行，新 agent 才能看到该工具。配置层叠叠出了插件树，工具面是另一个维度上的显式选择，两层各自叠，不会互相推断。这个设计防的是"升级即扩权"：新 bundle 装进来，agent 的能力面不会悄悄变大。

## dump-config：一条命令看清层叠结果

改完配置，验证手段是 `dsh --profile web --dump-config`。它组合整棵插件树但不起进程，把叠完的结果打印出来。相关 flag 有两个，分工明确：`--dump-default-config` 只打印 bundle 各层，`--dump-config` 在其上再叠 profile patch、home patch 和 `--patch` overlay。前者回答"这套 bundle 出厂长什么样"，后者回答"我的环境里最终长什么样"，两个答案的差就是你所有的本地定制。

dump 的输出不是裸 YAML，带来源注释：每一行标明它来自哪个文件，以及后续每一个改过它的 overlay。排查"我的 patch 到底生效没有"时这个注释就是证据链，看到目标行上挂着你的 patch 文件名，就是生效了；看到行上没有你的文件名，就是被更高层盖了或者 id 写错了。两个方向都能从同一份输出里读出来。前面那个 home 层抹掉 profile 层端口的例子，在 dump 里是可见的：webserver 行的注释会同时列出 bundle 的文件、profile 的 patch 文件和 home 的 patch 文件，最终 config 里却只有 host 没有 port，对上"最后碰它的层说了算"这条规则，原因就不用猜了。provenance 注释的价值正在这里，它把层叠这种纯声明式的机制变成了事后可审计的事实，你不需要在脑中重放四层顺序，输出替你记了账。

dump 还有四个细节。`!!js` 表达式保持未求值状态原样打印，所以 dump 里看到 `!!js process.cwd()` 不要求值，启动时才求。patch 里指向了不存在的 id，dump 在 stderr 报 unmatched targets，这是最便宜的 id 拼写检查。dump 不会运行应用的命令行参数提供方，展示的是解析任何应用参数之前的组合配置树。带应用参数的调用会被 dump 拒绝，`--dump-config` 是纯配置动作，不和运行动作混在一个调用里。

有一个字段没出现在 dump 里不代表它没生效，可能是它走了 schema 默认值。dump 显示显式设置和 patch 覆盖的值，schema 默认值在运行时填入，不一定出现在打印里。看到少字段先想默认值，再想丢失。

排查配置问题的完整路径现在可以内化成三步。第一步 `--dump-config` 看目标行的来源注释，确认你的 patch 是赢的那层；第二步看 stderr 有没有 unmatched，排除 id 拼错；第三步对照 config catalog 查这个字段是不是 schema 默认值在兜底，以及 `Requires:` 列出的 service provider 是不是都在树上。三步走完，配置"没生效"的原因基本都在其中：被高层覆盖、id 不匹配、默认值顶上了、依赖的服务没加载。

## 实战走查：改端口并挂一个记忆服务器

把前面的机制串在一个完整操作里。目标：web profile 的端口从 3080 改到 9090，同时挂一个叫 memorix 的 MCP 记忆服务器。

创建 `$DSH_HOME/profiles/web/cordis.patch.yml`：

```yaml
# 替换：只写字段，其余靠 schema 默认值
- id: webserver
  config:
    port: 9090

# 插入：新插件行
- insert:
    - id: memory-memorix
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: memorix
        transport: stdio
        command: memorix
        args: [serve]
```

注意 webserver 的替换只写了 `port`，没写 `host`。host 落回 schema 默认值 `127.0.0.1`，等价于只改了端口，而且保住了端口字段原有的 `!!js` 运行时读取，前面那个 `--port` 失灵的故障不会发生。memorix 走 `insert` 追加到树尾，作为新行获得自己的 id。

保存后验证：跑 `dsh --profile web --dump-config`，在输出里找到 webserver 行，确认注释里挂着你的 profile patch 路径、port 是 9090；找到 memory-memorix 行，确认它作为新行存在；看一眼 stderr 没有 unmatched 报告。然后正常启动，profile patch 是被监听的层，这次编辑会在下次启动或热重载时生效。想确认运行时行为，再看端口是否真的在 9090 上监听；如果在换端口前进程已经在跑，记住热重载换不了已绑定的 socket，这一步要重启。

YAML 里还可以用 `!!js` 写在加载时求值的表达式，比如 `!!js process.env.MY_VAR` 把环境变量引进配置，`!!js process.cwd()` 拿当前目录。它给配置带来了环境驱动的取值能力，而不需要外部模板引擎。边界也要知道：求值发生在配置加载时，对已经活着的服务的引用拿不到（除了被 loader 特意排序的 cmdlineArgs 那类），这也是热重载里"表达式只能对还活着的服务求值"那条上限的另一面。

## Preset：host 组合之上的参数化选择

patch 和 profile 解决"怎么叠出你的插件树"，preset 解决另一个问题：一组 agent 的配置怎么被定义、选择、分发。

管理 preset 的是 `@deepseek-ai/dsh-agent-presets` 插件，它的 Config 三个字段。`default` 必填，是调用方没点名时挂载的 preset id，缺了会在挂载时大声失败，不是静默跳过。`roots` 默认空列表，是按优先级排序的扫描目录，每项提供 `path`（开头的 `~` 会展开）和 `trust`（默认 user）。`includeUserRoot` 默认 true，在全部配置根之后追加 `<dshHome>/.agent-presets` 作为 user 级兜底，所以一个什么都没配的启动器同样能发现并创作 preset，而靠前的根永远赢得重复 id，随附的 `standard` 仍然遮蔽一个占用这个名字的家目录副本。

一个 preset 是一个目录，里面放一份组合定义 `agent.cordis.yml`。挂载模型值得看清：roster 在整个进程内把每个 preset 挂载一次（常驻 scope），命名它的每个会话通过把自己的 agent scope key 认父到那个挂载来加入，agent 的视图按 `agent → preset → global` 三层解析，近者遮蔽远者，兄弟 preset 的监听器互相失聪。挂载的工具、提示词段落、投影单元只存在一份覆盖所有加入的 agent，插件本就按 Session/Agent 分键存状态，会话在共享实例里互不串扰。每个代际记录组装文件的 stamp（mtime 加大小），文件被改过或删过，后续会话开下一个代际，正在运行的会话保持各自当初加入的那份。发现过程不做缓存，新写的 preset 立即可见，删除的下一次读取就消失；组装文件损坏的目录作为带 `broken` 原因的行列出而不是跳过，因为被跳过的目录还在磁盘上占着 id，界面却没有任何可删的东西。

信任分两级，措辞值得原样引用：system 级随部署发布，可信；user 级在本地创建，不管是人写的还是 agent 写的，信任等同 shell 访问。这个等同不是修辞，user preset 里可以写任意的插件行和本地路径，它能让你做的事和给你 shell 能让你做的事一样多，所以对 user preset 的警惕应该和对一段来路不明的脚本一样。创作即复制：`copy()` 通过整目录复制一个既有 preset 创建本地 preset，是唯一的创作写入，输入只有两个 id 加一个可选显示名，调用方从不提供组装文本，一次复制不会授予 roster 尚未携带的任何能力。

有一个反直觉的设计点：preset 的行不从 preset 目录解析，从 host 组合解析。裸包名按 host 组合的基准去找，README 给的理由很具体：Loader 按 entry 所属树的 baseUrl 解析，本地创作的 preset 在用户主目录下，Node 向上查找 node_modules 永远够不到 harness，每一个 `@deepseek-ai/dsh-*` 行都会导入失败，所以挂载在插入子树前先记录宿主的基址，把裸标识符送往那里。相对路径仍从 preset 自己的目录解析，preset 自带的插件文件和 skill 目录随它迁移；绝对路径转成 `file:` URL 再交给 ESM。所以 preset 不是一棵独立的插件树，是挂在 host 组合上的参数化选择，它能选择和参数化 host 里已有的能力，不能凭空引入 host 解析不到的东西。

默认 preset 还有一层用户设置。组装中存在 settings 提供方时，插件注册 `agent-presets` 命名空间，以 `config.default` 作为组装 base，用户的 `agent-presets.default` 文档层叠覆盖部署的工程默认值，每次解析时读取而非快照，热重载的文档对之后创建的会话生效，运行中的会话停留在它当初据以组装的 preset 上。

随附 preset 现在有四个。`standard` 是全工具的默认形态；`code` 走 Code Mode 工具传输；`cordis` 让 agent 检查和修改自己的 Cordis 插件树，是自指能力在 preset 层的入口；`minimal` 是 2026-08-11 新加的极简模式，保留部署的呈现方式，把完整系统提示词固定为一句 "You are a helpful software engineer assistant."，只组合持久 bash 和 str_replace_editor 两个工具，用于评测基线、最小依赖场景和"别的都能坏但这两个要能用"的兜底。四个都是 system 信任级，随部署发布。

## 权衡与局限

replace 语义的代价是心智上的第一下不适。从深度合并世界来的人会在第一次丢字段时觉得系统有 bug，直到理解"你没写的键不存在"是刻意承诺。换来的东西是每一行单一所有者和可心算的层叠，规模一大这笔账就越划算。

层的生命周期不统一是学习成本。config 热生效、bundle 冷生效、已绑定资源热不了，三条边界要分别记住。它们各有不可简化的事务性理由，但对使用者来说这是一组必须建立的直觉，没有统一的"改了就生效"可指望。

dump 依赖你主动跑。层叠是声明式的，系统不会在你编辑时告诉你"这层会被那层盖掉"，provenance 注释要你去看。配置漂移的发现时机取决于你查的频率，这是声明式系统共有的性质：一致性好了，主动性要求高了。

preset 的信任模型是粗粒度的。两级信任中间没有细分，一个 user preset 要么整体等同 shell 访问，要么不做。想给"半可信"的 preset 一个更窄的能力面，现在的机制里没有这个档位，需要靠收窄工具面的 preset 加部署侧约束去拼。常驻挂载加代际也有一条温和的滞后：文件改了，运行中的会话不会热切换，只有后续会话拿到新代际，想要"改完立刻全员生效"的部署要接受重启或新会话的节奏。

## 结论

dsh 的配置实践可以压成三句话。行为差异做成配置字段，默认值长在 schema 上，这是插件作者的纪律。patch 按 id 整行替换，层叠顺序固定为 bundle、profile、home、命令行 overlay，后面的层逐行赢，外部插件经 `dsh plugin` 进出并自动维护层栈，这是改行为的机制。preset 在 host 组合之上做参数化选择，进程内常驻挂载、作用域认父、代际跟文件 stamp，信任分 system 和 user 两级，user 级等同 shell，这是分发的单元。

验证和排查围绕一条命令：`--dump-config` 打印叠完的树，每行带来源注释，unmatched 目标走 stderr。最值得记住的故障模式是用字面量整行替换会杀掉运行时读取，`--port` 失灵而配置看起来完全正常；对应的正确姿势是 patch 只写要改的字段，其余交给 schema 默认值。配置系统是"没有特权核心"的兑现处，它的每条规则都在保证同一件事：换掉任何一个 subsystem，是一行配置的事，不是一次 fork 的事。

## 延伸阅读

- [CLI 参考文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md)：层叠顺序、patch 语义、plugin 命令与 dump 的权威表述
- [插件配置文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.md)：schema、默认值与配置字段原则
- [Config Catalog（generated）](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/config-catalog.md)：全部可加载包的配置声明与 Requires 行
- [agent-presets README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/preset/agent-presets/README.md)：常驻挂载、代际与信任模型
- [极简 preset 决策笔记](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/feature/2026-08-11-minimal-profiles-bare-two-tool-runtime.md)：双工具运行时的动机

上一篇：[dsh 的 Telemetry 可观测性：怎么接 OTel 监控](./36-telemetry-observability.md)
下一篇：[dsh 的排查与调试：全插件化 harness 怎么追问题](./38-debugging-and-troubleshooting.md)
