# AGENTS.md：把项目知识写成 Codex 能执行的上下文

## TL;DR

`AGENTS.md` 是给 Codex 这类工程代理看的项目说明，不是写给新人的第二份 README。它应该回答五个问题：这个仓库是什么结构？常用命令怎么跑？代码风格和架构约束是什么？哪些文件、命令和模块有风险？完成任务时要怎样验证和汇报？

有效的 `AGENTS.md` 通常短、具体、可执行。它不需要讲公司愿景、系统历史、完整架构演化。它要让 Codex 在进入仓库后少猜一点：不要用错包管理器，不要跑错测试命令，不要改敏感文件，不要把临时修复当完成，不要在缺验证时声称任务结束。

OpenAI 官方 AGENTS 指南说明，Codex 会加载项目指令文件；空文件会被跳过；说明文件有大小限制，默认 `project_doc_max_bytes` 为 32 KiB；可以通过嵌套目录、`AGENTS.override.md` 和 fallback 文件名配置来控制规则发现。本文先讨论根目录 `AGENTS.md` 怎么写。

## 读者定位

本文面向已经在真实仓库里使用 Codex 的开发者、维护者和技术负责人。你可能已经发现 Codex 经常犯一些“新同事式错误”：用 npm 而不是 pnpm，跑全量测试而不是局部测试，改生成文件，碰迁移文件，忽略团队的提交规范，没跑 typecheck 就说完成。

这些问题不一定是模型能力不足。更多时候，是项目知识没有以可执行规则的形式出现在 Codex 上下文里。`AGENTS.md` 的目标，就是把高频、稳定、会影响行为的团队约定前置。

## 问题：项目知识如果只在人的脑子里，Codex 就只能猜

真实项目里有很多隐含规则。比如：

- Monorepo 用 `pnpm`，不能用 `npm install`。
- 前端组件必须优先放在 `packages/ui`，不能在业务目录复制一份。
- 修改 API 行为必须补契约测试。
- 已应用的数据库迁移不能重写。
- `.env*`、生产配置、账单逻辑、权限逻辑需要人工确认。
- 某些测试很慢，局部任务应该先跑过滤后的命令。
- 文档仓库没有构建系统，但有链接和 Markdown 校验脚本。

人类同事可以通过 onboarding、代码审查和历史经验学会这些规则。Codex 进入仓库时没有这些背景，只能读文件推断。推断可能对，也可能错。尤其是命令、权限和禁止事项，不能靠推断。

如果每次都把这些规则写进 prompt，会浪费上下文，也容易漏。`AGENTS.md` 的价值在于把稳定规则常驻到项目上下文中。它不是让任务 prompt 变短，而是让任务 prompt 能专注于本次任务。

## 心智模型：给会执行命令的代理看的工地告示

可以把 `AGENTS.md` 想成工地入口的告示。它不负责讲完整设计图，也不负责替代任务单。它告诉进入现场的人：从哪里进去，工具在哪里，哪些区域危险，完成后怎么验收。

这个告示的读者不是普通用户，而是会执行命令的代理。因此规则要能影响行为。下面两类写法差异很大：

```markdown
- 保持代码优雅。
- 注意测试。
- 遵循最佳实践。
```

这些句子对人也许有提醒作用，对 Codex 的约束很弱。更好的写法是：

```markdown
- Do not add production dependencies without explicit approval.
- Run `pnpm --filter web test` after changing `apps/web`.
- Do not edit applied migration files under `db/migrations`.
- If auth, billing, or permission logic changes, stop and summarize the plan before editing.
```

好的 `AGENTS.md` 通常有六块：

- Project Structure：仓库结构和目录职责。
- Commands：安装、lint、test、typecheck、build、局部测试命令。
- Working Rules：改代码时遵守的工程规则。
- Verification：完成任务前应跑的检查。
- Safety Boundaries：不能碰或必须审批的文件、命令、模块。
- Reporting：最终汇报必须包含的内容。

## 详细机制：Codex 怎样使用项目指令

官方 AGENTS 指南把项目指令视为 Codex 自定义上下文的一部分。对工程实践最有用的事实包括：

第一，指令会按层级发现。根目录可以有全局规则，子目录可以有更具体规则。Codex 会把更靠近当前目录的说明放在后面，让局部规则更贴近当前任务。下一篇会专门讲分层。

第二，空文件会被跳过。不要创建空 `AGENTS.md` 期待它占位。没有内容就没有规则。

第三，项目说明有大小限制，默认 `project_doc_max_bytes` 为 32 KiB。超过限制可能导致后续指令不完整。不要把长篇架构文档塞进 `AGENTS.md`；应该用短规则指向相关文档。

第四，官方文档说明可配置 fallback 文件名。如果团队已有 `TEAM_GUIDE.md` 或 `.agents.md`，可以通过 `project_doc_fallback_filenames` 让 Codex 把它们当作指令文件。但默认、跨团队最易懂的还是 `AGENTS.md`。

第五，`AGENTS.override.md` 可用于同目录覆盖。它适合临时或局部强约束，但不要滥用，否则不同成员看到的代理行为会分裂。

这些机制说明一件事：`AGENTS.md` 不是随便放一份 Markdown。它是 Codex 行为配置的一部分。写法要像配置一样克制、明确、可维护。

## 推荐结构：一份可直接改造的模板

下面是一份根目录 `AGENTS.md` 的骨架。它适合大多数应用仓库，实际使用时要删掉不相关内容，补上真实命令。

```markdown
# AGENTS.md

## Project Structure

- `apps/web` is the main web app.
- `packages/ui` contains shared UI components.
- `packages/shared` contains shared types and utilities.
- `services/api` contains backend API handlers.
- `docs` contains user-facing and internal documentation.

## Commands

- Install: `pnpm install`
- Lint: `pnpm lint`
- Type check: `pnpm typecheck`
- Test all: `pnpm test`
- Test web: `pnpm --filter web test`
- Build: `pnpm build`

## Working Rules

- Keep changes scoped to the requested task.
- Reuse existing helpers and patterns before adding abstractions.
- Do not add production dependencies without explicit approval.
- Update tests when public behavior changes.
- Prefer small, reviewable diffs over broad refactors.

## Verification

- Run the narrowest relevant test first.
- Run lint or typecheck when touching shared TypeScript code.
- If a command cannot run, report the reason and the risk.

## Safety Boundaries

- Do not edit `.env*` files.
- Do not rewrite applied migration files.
- Do not run deploy, publish, or `git push` unless explicitly requested.
- Ask before changing auth, billing, permission, or CI secrets logic.

## Reporting

- Summarize changed files.
- List commands run and their results.
- Call out tests not run.
- Mention remaining risks or manual checks.
```

这份模板的重点不是格式，而是信息类型。它告诉 Codex 从哪里理解项目、如何验证、哪些动作不能自动执行。

## 真实工作流案例：让 Codex 自检 AGENTS.md

写完 `AGENTS.md` 后，不要直接信任。用只读任务验证它是否被正确理解：

```text
请阅读当前仓库的 AGENTS.md 和 README。
不要修改文件，不要运行命令。
请输出你理解到的项目结构、常用命令、工作规则、安全边界和最终汇报要求。
如果有规则不清楚，请列出问题。
```

如果 Codex 输出的内容缺少关键命令、误解目录职责或看不到安全边界，说明 `AGENTS.md` 太长、太泛、位置不对或规则不够明确。

再做一个低风险执行验证：

```text
请按 AGENTS.md 的规则，修正文档里的一个错别字。
只修改 docs/example.md。
不要运行网络命令。
完成后按 AGENTS.md 的 Reporting 要求汇报。
```

这个测试可以看出 Codex 是否会遵守范围、是否会用正确汇报格式、是否会在无须运行测试时说明未运行原因。

## 操作清单：写出可维护的 AGENTS.md

- 控制长度。根目录优先 40 到 80 行，复杂仓库再用子目录文件分层。
- 每条规则都要能影响 Codex 行为，避免愿景、口号和抽象审美。
- 命令必须真实可运行，包含包管理器、局部测试和全量检查。
- 写清禁止事项：secrets、迁移、部署、发布、Git push、生产配置。
- 把高风险模块点名：auth、billing、permissions、data migration、CI。
- 给最终汇报格式，要求列出 diff、命令、失败、风险。
- 只放稳定规则。临时任务约束写在 prompt，不写进 `AGENTS.md`。
- 每次工具链迁移、测试框架迁移、目录调整后同步更新。

## 权衡与风险

`AGENTS.md` 会占用上下文。越长，留给源代码、命令输出和任务说明的空间越少。默认 32 KiB 限制不是目标长度，而是上限提醒。对多数仓库来说，短文件更有效。

它也会产生维护成本。命令过期比没有命令更糟，因为 Codex 会稳定地跑错。建议把 `AGENTS.md` 纳入代码审查：修改测试框架、包管理器、目录结构、发布流程时，同步检查它。

它不能替代测试。`AGENTS.md` 可以要求 Codex 跑测试，但测试缺失时，模型仍可能引入未被捕获的问题。也不能替代权限控制。写“不要改 `.env`”有用，但沙箱、审批和受保护路径才是硬边界。

## 常见误区

误区一：把 README 复制进去。README 面向人类读者，常包含背景、安装、用法、路线图。`AGENTS.md` 面向执行代理，应保留会改变行为的规则。

误区二：写抽象原则。比如“保持代码质量”“遵守团队规范”。这些话不如“公共行为变化必须补测试”“不引入新依赖”“优先复用 `src/lib/http.ts`”。

误区三：把所有子项目规则都塞根目录。Monorepo 中，根目录写全仓库共识，子目录写局部命令和风险。后端账单规则不应污染前端组件任务。

误区四：忽略最终汇报。Codex 做完任务后，如果不汇报命令结果和风险，人类 review 会缺关键信息。把 Reporting 写进 `AGENTS.md` 可以让每次任务产物更一致。

误区五：把临时偏好写成永久规则。比如“今天只改 A 文件”“本次不要运行测试”。这些属于任务 prompt，不属于项目规则。

## 团队落地：AGENTS.md 的维护制度

`AGENTS.md` 一旦进入仓库，就应该被当成工程资产维护。它不是某个 AI 爱好者写的提示词备忘录，而是代理进入项目后的默认操作手册。维护制度比一次写好更关键，因为项目命令、目录结构、测试框架和安全边界都会变化。

第一项制度是 owner。每个仓库的根 `AGENTS.md` 应该有明确负责人，通常是 Tech Lead、平台工程师或主要维护者。没有 owner 的规则会慢慢过期。子目录 `AGENTS.md` 则由对应模块 owner 维护，例如前端团队维护 `apps/web/AGENTS.md`，支付团队维护 `services/billing/AGENTS.md`。

第二项制度是变更触发条件。只要发生包管理器迁移、测试框架迁移、目录移动、构建命令变化、CI 命令变化、安全边界变化，就必须检查 `AGENTS.md`。这可以写进 PR 模板：如果本次变更影响 Codex 或其他代理的操作方式，请同步更新项目指令。这样能防止文档和实际命令脱节。

第三项制度是规则 review。`AGENTS.md` 修改不应绕过 code review。审查时重点看四点：命令是否真实可运行，规则是否可执行，禁止事项是否过宽或过窄，是否把临时需求写成永久约束。审查者不必关心提示词文采，只关心它是否会让代理做出正确动作。

第四项制度是定期演练。每隔一段时间，用只读 Codex 任务检查它读到的规则。例如要求它总结项目结构、命令、安全边界和汇报要求。再选择一个低风险任务，观察它是否按规则汇报。演练能发现规则太长、指令冲突、命令过期、子目录覆盖不生效等问题。

第五项制度是最小化。每次有人想往 `AGENTS.md` 加内容，都要问：这条规则是否稳定？是否适用于当前层级？是否能影响代理行为？是否已经存在于别处？如果答案是否定的，就不应加入。很多团队的代理说明失败，不是因为规则太少，而是因为把所有想提醒人的话都塞进去，导致真正的操作规则被埋没。

第六项制度是失败反馈。Codex 如果跑错命令、改错目录、忘记测试、碰了敏感文件，不要只在当次 prompt 里纠正。要判断这是本次任务描述问题，还是 `AGENTS.md` 缺规则。如果是高频失败，就把规则沉淀进去；如果是一次性约束，就保留在任务 prompt。这样 `AGENTS.md` 会随真实失败改进，而不是随个人想象膨胀。

第七项制度是区分人类文档和代理文档。README、架构文档、贡献指南仍然有价值，但它们服务的读者不同。`AGENTS.md` 可以链接这些文档，却不应复制全文。比如根文件写“架构背景见 docs/architecture.md，修改公共 API 前先阅读”，比把整篇架构文档贴进代理上下文更好。

最后，`AGENTS.md` 要承认边界。它不能防止所有错误，也不能替代沙箱、审批、测试、review。它提供的是默认项目知识。真正的安全来自多层配合：项目指令让 Codex 少猜，任务 brief 让本次目标清楚，沙箱和审批限制动作，验证命令提供证据，人类 review 承担责任。

## 反例分析：一份糟糕的 AGENTS.md 会怎样误导 Codex

理解 `AGENTS.md` 的价值，最好的方式是看反例。很多项目的代理说明失败，不是因为没有写，而是因为写成了混合文档：前半部分是愿景，后半部分是过期命令，中间夹着个人偏好。Codex 读到了内容，却无法把它转成稳定动作。

第一种反例是背景过重。文件开头用几百行介绍公司、产品历史、业务愿景、技术选型演化，但没有写测试命令。Codex 可能理解项目很重要，却不知道怎样验证修改。这类内容应该放 README 或架构文档，`AGENTS.md` 只保留目录职责和操作规则。

第二种反例是命令过期。项目已经迁移到 `pnpm`，文件里还写 `npm test`；测试框架从 Jest 换到 Vitest，文件里还写旧命令。Codex 会稳定地跑错命令，然后把环境失败当成项目失败。过期命令比没有命令更危险，因为它给了模型错误确定性。

第三种反例是规则抽象。“写高质量代码”“保持整洁”“注意安全”这些话不能直接指导代理。它不知道哪些模块敏感，也不知道质量标准怎样验证。应改成具体规则：“公共行为变化必须补测试”“auth、billing、permissions 修改前先给计划”“不运行 deploy 和 publish”。

第四种反例是边界缺失。文件写了构建命令和风格规则，却没写 `.env*`、secrets、迁移、发布、Git push 等禁止事项。Codex 在执行复杂任务时，可能认为这些动作只是普通工程步骤。安全边界不应只靠默认常识，因为代理没有团队事故记忆。

第五种反例是规则互相冲突。前面写“不要引入新依赖”，后面写“缺库就安装”；前面写“所有任务都运行全量测试”，后面写“只跑局部测试”。人类可以猜测语境，Codex 会被迫自行取舍。规则冲突时，应拆成条件：“默认不引入依赖，确需依赖时先说明理由并等待批准”。

第六种反例是把临时任务写成永久规则。比如“本周不要改 API”“只处理某个客户问题”。这些约束过期后会继续影响未来任务。临时规则应写在任务 prompt、issue 或短期计划中，不应进入根 `AGENTS.md`。

第七种反例是没有汇报要求。Codex 做完后只说完成，reviewer 不知道跑了什么命令、哪些测试失败、哪些检查没跑。`AGENTS.md` 中应写清最终摘要格式：修改文件、命令结果、未运行检查、剩余风险。这个要求对所有任务都有价值。

第八种反例是把 `AGENTS.md` 当防错万能药。文件写得再好，也不能替代测试和审批。若团队因此放宽沙箱、跳过 review，反而更危险。正确用法是把它当作上下文层，让 Codex 少犯低级项目错误；硬边界仍由工具和流程承担。

审查现有 `AGENTS.md` 时，可以专门按这些反例检查。删掉背景，修正命令，具体化规则，补上边界，消除冲突，移走临时约束，加入汇报格式。很多仓库不需要更长的代理说明，而需要更可执行的代理说明。

## 改写示例：从人类说明到代理规则

把人类文档改成代理规则时，可以按“意图、行为、验证”三步翻译。

人类文档常写：“本项目使用统一请求封装，新增接口时请保持一致。”这对 Codex 不够具体。代理规则应写：“新增 HTTP 请求时优先复用 `src/lib/http.ts`，不要直接调用 `fetch`；若现有封装不满足需求，先说明原因再新增封装。”这样 Codex 知道先查哪个文件，也知道什么时候停下。

人类文档常写：“数据库迁移要谨慎。”代理规则应写：“不要修改已经应用的 `db/migrations` 文件；需要新迁移时先给计划，说明字段变化、回滚方式和测试命令。”谨慎不是动作，禁止重写和先给计划才是动作。

人类文档常写：“测试要充分。”代理规则应写：“公共行为变化必须补回归测试；优先运行最窄相关测试；如果相关测试不存在，说明缺口并建议新增位置。”这能让 Codex 在完成时汇报测试证据，而不是只声称已测试。

人类文档常写：“不要泄露敏感信息。”代理规则应写：“不要读取或修改 `.env*`、secret 文件、生产凭据；不要在输出中包含密钥值；需要凭据时要求人工通过受管环境提供。”这把安全口号变成可执行边界。

人类文档常写：“保持改动小。”代理规则应写：“保持 diff 聚焦本次任务；不要顺手格式化无关文件；发现需要跨模块修改时先停下说明。”这能直接影响 Codex 是否扩大范围。

人类文档常写：“提交前检查。”代理规则应写：“最终摘要必须列出运行过的命令、结果、未运行检查和剩余风险。”这让每次任务都有证据，也方便 reviewer 追踪。

这个翻译过程可以由人类完成，也可以让 Codex 做初稿，但最终必须由项目 owner 审查。因为 Codex 可以总结规则，却不拥有团队风险判断。好的 `AGENTS.md` 往往不是写出来的，而是把抽象团队习惯翻译成代理能执行的短句。

还有一种实用做法，是维护一份“规则来源表”。每条 `AGENTS.md` 规则旁边不一定要写注释，但团队内部可以知道它来自哪次事故、哪次迁移或哪条 review 经验。比如“不运行 deploy”来自一次误触发发布，“先跑局部测试”来自全量测试耗时过长，“不改迁移文件”来自数据库回滚事故。知道来源后，规则就不容易被随意删除。若某条规则已经没有现实来源，也没有最近使用价值，就可以删掉。

当仓库规模继续扩大时，`AGENTS.md` 还可以承担“索引”角色。它不需要解释完整架构，但可以指向真正的长文档：接口规范、数据库迁移流程、安全审查流程、发布手册。Codex 需要时再读这些材料。这样既保留上下文入口，又避免把长文档全部塞进默认指令。

最后，项目指令应该服务于可重复行为。凡是每次任务都希望 Codex 遵守的内容，才值得写进去。凡是只在某个 issue、某个客户、某次事故中成立的内容，应留在任务 brief。这个边界划清后，`AGENTS.md` 会保持干净，也更容易被 Codex 稳定利用。

如果团队担心规则越写越多，可以给每条新增规则设置退出条件。例如“等迁移完成后删除”“等测试命令统一后上提到根目录”“等旧服务下线后移除”。规则能退出，文件才不会膨胀。Codex 需要的是当前有效的操作约束，不需要历史包袱。

若一条规则无法写出退出条件，也至少要写出适用条件。适用条件能帮助后来的人判断它是否还应存在。代理规则最怕变成永久口头禅，没人敢删，也没人真的遵守。

维护者还可以在评审中追问一句：这条规则能否被 Codex 执行或验证？如果不能，它更适合放进普通文档。

把这句话变成习惯后，`AGENTS.md` 会自然收敛到可执行规则，而不是不断扩张成第二份项目百科。对代理来说，少量明确规则通常比大量背景材料更有价值。

这也是长期维护的关键。

## 延伸阅读

- [AGENTS.md 官方指南](https://developers.openai.com/codex/guides/agents-md)
- [Codex customization](https://developers.openai.com/codex/customization)
- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference)
- [Agent approvals & security](https://developers.openai.com/codex/agent-approvals-security)
- [Codex Best Practices](https://developers.openai.com/codex/learn/best-practices)
