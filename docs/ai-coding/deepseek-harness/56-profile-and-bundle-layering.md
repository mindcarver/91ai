# dsh 的 Profile 与 Bundle 分层：一棵插件树长出五个入口

> 同一个 `dsh`，命令行敲 `dsh web` 是浏览器应用，敲 `dsh --profile headless "跑测试"` 是一次性任务进程，还有 SDK 服务器、最小 SDK、ACP 服务器三个入口。这五个形态共享同一套插件、安全默认值和模型适配，不靠 fork 五份代码。机制是 profile 加 bundle 两层组合：`dsh-base` 贡献共享核心，五个模式束各盖一层补丁，用户的 profile 补丁和调用层 `--patch` 再叠上去。本篇按 2026 年 9 月下旬的仓库状态拆这套分层学，核心是三条纪律：补丁整行替换不合并、跨模式取值不同的行只住在模式层、`sdk-minimal` 干脆不继承 base 而用一棵全显式树。最后回答一个问题：这套东西解决的是"产品形态"问题，它让形态本身成了组合的输出。

## 问题：一个 harness 怎么同时是五个产品

从一个具体场景进。你在服务器上装了 `dsh`，白天用浏览器界面跟 agent 对话；CI 里用一条命令跑无人值守任务；同事写 Python 脚本，用 SDK 把 agent 编进流水线；隔壁组的编辑器插件需要走 ACP 协议挂进来。四种用法要的是同一个 agent 能力，但边界完全不同：浏览器应用要 Web 服务器和 HMR 热载，一次性任务进程这两样恰恰一个都不能有，它跑完就退，开着端口就是事故。

朴素的解法有两个。fork 四份代码各自维护，能力修复要打四遍，一个月后四份代码开始互相不认识。或者写一份巨型配置，所有能力全装进去，按入口开关：任务进程背着 Web 服务器的行活着，虽然不启动，但组合树里躺着，加载、校验、版本冲突一样不少。两条路都见过尸体。

`dsh` 的回答是把"产品形态"本身做成组合的输出。入口不是编译期分支，是运行期选择的不同插件树。选哪棵树、树长什么样，由 profile 和 bundle 两层机制决定。

## 三十秒模型

把整套机制压成一句话：**profile 是一棵有名字的插件树，bundle 是预先叠好的一叠补丁。**

叠放顺序从底到顶：`dsh-base` 先立起共享核心（模型适配、会话、沙箱、审批、工具注册表这些每个入口都要的行），模式束再盖一层（web-app 补上 Web 服务器和界面行，headless 补上启动器和退出语义），然后是你在 profile 目录里的 `cordis.patch.yml`，最后是命令行 `--patch` 临时盖一层。越往上优先级越高，同一行后写的赢。

浏览器入口和一次性任务入口的区别，不在代码里，在树里：headless 那棵树没有 Web 服务器的行，也没有热载的行，它天生不带这些能力，不是带了再关掉。

## 五个内置入口长什么样

截至 2026 年 9 月下旬，launcher 内置五个 profile，对应五张不同的脸。

| 入口 | 命令 | 形态 | 在 base 之上补了什么 |
|---|---|---|---|
| `web` | `dsh web` | 浏览器界面，端口 3080 | Web 服务器、界面行、按 agent 分组的工具组合 |
| `headless` | `dsh --profile headless "任务"` | 一次性进程，stdout 出答案 | 启动器、任务文本解析、退出码语义，并关掉 HMR |
| `sdk` | `dsh --profile sdk` | stdio 上的 JSON-RPC 服务器 | SDK 服务器，桌面应用复用的就是它 |
| `sdk-minimal` | `dsh --profile sdk-minimal` | 最小 JSON-RPC 服务器 | 不继承 base，一棵全显式的独立树 |
| `acp` | `dsh --profile acp` | ACP 协议服务器 | ACP 桥接，给编辑器类客户端挂载 |

值得盯住的是表格右上角那个例外：**桌面应用没有自己的 bundle**。桌面形态在组合上就是把浏览器前端的传输换到本地 SDK 服务器，所以它复用 `sdk` 的组合，不另立门户。五张脸背后其实只有四棵 base 系的树加一棵独立树，这是分层的第一个红利：形态之间的复用发生在树的层面，不需要新包。

每个 profile 是 `$DSH_HOME/profiles/<name>` 下的一个目录，首次使用时从内置模板自动初始化。想从模板另起一个自己的 profile，`dsh --from-default-profile <模板名>` 会拒绝覆盖已存在的目录，未知模板名在任何文件创建之前就失败。这些细节共同守一条边界：profile 目录是用户的财产，launcher 对它只有初始化权，没有改写权。

## 三条分层纪律

分层谁都会画，这套设计的价值在纪律。`dsh-base` 的补丁文件开头把规矩写得很直白。

**纪律一：补丁替换整行配置，不做深度合并。** 后一层补丁对某一行的配置是整体替换，不是字段级合并。这条看似笨，实则把"配置属于哪层"变成了可判定的问题：一行的完整定义只出现在一个 bundle 层加用户的层里，不存在 base 写一半、模式层补另一半的行。代价是模式相关的行必须在模式层完整重述，换来的是任何一行的问题只需要看最多两个地方。

**纪律二：跨模式取值不同的行，不进 base。** base 只承载共享的插件身份和中性默认值；一个行只要 web 和 headless 想要不同的值，它的完整配置就只能住在模式层。这条纪律是纪律一的直接推论：既然补丁整行替换，base 里放一个"部分值"就没有意义，模式层一替换它就整个没了。base 因此保持纯粹：它承载的是"这些行存在"，不是"这些行怎么配"。

**纪律三：`sdk-minimal` 不继承任何人。** 最小 SDK 入口没有踩在 base 上，它的补丁树从空白根开始，每一行显式声明。官方文档给它的定位是"刻意保留较小的功能集"的编程式入口。为什么放弃继承？因为它的卖点是可审计：一个把 agent 嵌进自己产品的团队，需要能枚举宿主里到底挂了什么，全显式树可以逐行读完，继承树要追五层补丁才能知道某行的最终值。继承换来简洁，显式换来可控，这个入口的用户要的是后者。独立树仍然参与完整的组合顺序：用户 profile 补丁、home 目录补丁、`--patch` 照常叠上去，它只是把"出身"从继承换成了自述。

## 解析链：一棵树是怎么叠出来的

启动时 launcher 把各层按固定顺序叠成一棵完整的组合文档，然后交给 Cordis loader 求值挂载。顺序从底到顶：

1. bundle 层。base-back 系的四个入口先铺 `dsh-base`，再铺各自的模式束；`sdk-minimal` 只铺自己那一份完整树。
2. profile 层。你 profile 目录里的 `cordis.patch.yml`，属于这个入口的持久定制。
3. home 层。`$DSH_HOME` 下的全局补丁，对这台机器上所有 profile 生效。
4. 调用层。命令行 `--patch` 传进来的文件，以及由标志派生的补丁（比如遥测的开关），用完即走。

同一行后写的赢，这就是"换 provider 等于换产品"落到入口层面的形状：你不需要改任何包，在自己的 profile 补丁里替换一行，整个入口的能力面就变了。想看最终叠出来什么而不真启动，`dsh --dump-config` 把整棵组合树打出来。

模块解析走双锚点：bundle 里的包名先从 dsh 安装目录解析（launcher 自己的包），用户装的插件从 profile 目录的 node_modules 解析。内置的永远来自安装目录，你装的永远来自你的目录，两边不会互相劫持。

## 运行时怎么知道"我是谁"

组合叠完是静态的，运行时还需要一个答案：当前进程是哪个 profile 起的。这个答案放在 `profileContext` 服务里，暴露当前 profile 的名字、目录、启动的 bundle 和覆盖层。

它不是装饰品。`plugin-manager`（插件管理页的后端）用一条条件表达式在自己身上判这个服务：不是 profile 启动的进程里它自禁。HMR 的条件更实际：web 默认开（你在外部编辑补丁文件，插件树热重载），headless 和 sdk 默认关（一次性进程和服务器进程里，热重载等于运行中换引擎）。配置热载默认跟随 profile，模块根目录的变化则是显式 opt-in。同一个行为在不同入口有不同默认值，而实现它的机制只是"模式层对同一行给了不同的值"，纪律二在背后兜底。

## 往入口里装插件

第三方能力的安装也长在 profile 上。树内的 bundle 从安装目录解析，树外的插件用 `dsh plugin --profile <name> add <包名>` 装进对应 profile 的目录，装完它就参与那棵树的解析。装到 web 的不出现在 headless 里，装到某个自定义 profile 的不影响任何内置入口。

这解释了一个容易困惑的现象：同一台机器上，Web 界面里启用的能力在 headless 任务里不存在。不是 bug，是两棵树。能力属于树，不属于安装。

## 权衡

这套分层不是免费的。

间接层是明码标价的。回答"这个入口最终挂了哪些行、某行的值是什么"需要理解四层叠放和整行替换规则，`--dump-config` 和生成的组合图是必备工具而不是锦上添花。纪律本身也是维护成本：base 的维护者每加一个行为都要先回答"这个行跨模式取值相同吗"，答错一次，纪律一就会让某个模式层的配置静默丢失半截。

对二次开发者的约束是真实的。你若基于 base 系入口做产品，跟着 base 演进；你若选 `sdk-minimal`，官方往 base 里加新能力时你的独立树不会自动得到，每一样都要显式采纳。这是当初选可审计性时就付掉的灵活性，不是缺陷，但要有预期。

换来的东西也具体：一个代码库五个入口零 fork；安全默认值（沙箱、审批、权限预设）在 base 一处维护，五个入口同时继承；产品形态的差异收敛成"几行补丁"，可以 diff、可以版本管理、可以回滚。

## 延伸阅读

- [bundle 包组与六个 bundle](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/bundle)：每个 bundle 的 README 和补丁文件
- [app-boot：profile 如何被解析、分层和定制](https://github.com/deepseek-ai/deepseek-harness/tree/master/packages/boot/app-boot)
- [Profile 插件 bundle 设计笔记（2026-08-05）](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/architecture/2026-08-05-profile-plugin-bundles.md)
- [生成的组合图：每个出厂 profile 的精确组合](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/composition.md)
- [配置参考：profile 目录、模块解析与 HMR](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.md)
