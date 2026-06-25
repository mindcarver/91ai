# codex apply：把 Codex Cloud diff 安全落到本地仓库

## TL;DR

`codex apply <TASK_ID>` 的职责很窄：把你有权限访问的 Codex Cloud 任务生成的最新 diff 应用到本地工作区。官方 CLI reference 说明它是稳定命令；如果底层 `git apply` 因冲突等原因失败，命令会非零退出。`apply` 成功不代表代码可合并，只代表远程任务的 diff 已落到本地。正确流程是：确认来源和基线，在干净分支或 worktree 中应用，检查 `git diff`，运行验证命令，记录 provenance，最后走正常 code review。

## 读者定位

这篇适合使用 Codex Cloud、Codex Web、Slack/Linear/GitHub 委派任务，或经常把远程 Codex 结果带回本地审查的开发者和技术负责人。你需要熟悉 Git patch、分支、冲突处理、测试命令、PR review 和回滚。本文不讨论 Cloud 环境如何配置，重点是远程生成 diff 回到真实仓库后的安全落地。

## 问题：远程 diff 不是可合并代码

Codex Cloud 任务很适合并行处理、异步委派和从其他设备发起工作。官方文档说明 Cloud 线程运行在隔离环境里，会克隆仓库并检出要工作的分支或 commit；Cloud 环境和本地环境可能不同。也正因为它不在你的本地工作区里，Cloud 生成的 diff 回到本地时必须重新审查。

远程 diff 常见风险包括：

- 基于旧 commit 生成，和当前本地分支冲突。
- 改动范围超过原任务。
- 测试在 Cloud 环境通过，但本地或 CI 不通过。
- 为了通过检查引入 `any`、跳过测试、关闭 lint 或改宽规则。
- 修改了锁文件、生成文件、配置文件，但没有说明原因。
- 在业务语义上解决了表面问题，却破坏了权限、认证、计费或数据迁移边界。

如果你把 `codex apply` 当成“接受修改”，这些风险会直接进入本地工作区，甚至进入 PR。正确心智是：`apply` 只是把远程 PR 下载成未提交 diff。

## 心智模型：把 Cloud task diff 当外部 PR

你不会把陌生外部 PR 直接 merge 到 main。你会看来源、看 diff、跑测试、审查风险、必要时要求作者拆小或重做。Codex Cloud diff 也应该这样处理。

```text
确认任务来源
-> 准备干净工作区
-> codex apply
-> 检查 diff 范围
-> 运行验证命令
-> 人工审查语义
-> 提交或丢弃
```

`codex apply` 只覆盖第三步。它不会替你验证业务正确性，不会自动跑测试，不会判断是否越界，也不会替代人类 review。

## 官方命令边界

官方 CLI reference 中，`codex apply` 的描述是“Apply the most recent diff from a Codex cloud task to your local repository”。它需要你已认证且有权限访问该任务。参数是 `TASK_ID`，即 Cloud 任务标识。命令会打印被 patch 的文件；如果 `git apply` 失败，例如冲突，会非零退出。

这几个事实决定了工程边界：

- 它应用的是任务的最新 diff，不是任意本地 `.patch` 文件。
- 它依赖你的本地仓库当前状态，冲突由 `git apply` 暴露。
- 它不等同于提交、合并或发布。
- 它要求本地用户能访问对应 Cloud 任务。

如果你拿到的是本地 patch 文件，应该用 Git 原生命令：

```bash
git apply --check change.patch
git apply --stat change.patch
git apply change.patch
```

不要把本地 patch 文件和 `codex apply` 混为一谈。

## 详细机制：应用前准备

应用前先确认工作区干净：

```bash
git status --short
git branch --show-current
git rev-parse --short HEAD
```

如果当前工作区已有未提交改动，先决定它们是否属于同一个任务。不要在脏工作区里应用远程 diff，否则后续很难区分哪些改动来自 Cloud，哪些是本地旧状态。

推荐创建专门分支：

```bash
git switch main
git pull --ff-only
git switch -c codex/apply-auth-timeout
```

或者使用 worktree：

```bash
git worktree add .worktrees/apply-auth-timeout -b codex/apply-auth-timeout
cd .worktrees/apply-auth-timeout
```

然后记录任务来源：

```markdown
## Codex diff provenance

- Source: Codex Cloud task `<TASK_ID>`
- Task URL: `<url>`
- Requested change: fix auth timeout retry
- Local base before apply: `<commit>`
- Applied at: 2026-06-22
- Reviewer: pending
```

provenance 不是文档洁癖。几天后如果发现回归，你需要知道这个 diff 从哪里来、当时基线是什么、谁审查过、验证了什么。

## 详细机制：应用后审查

应用：

```bash
codex apply <TASK_ID>
```

如果失败，先不要手工揉冲突。记录错误，确认当前分支是否正确、任务是否基于旧 commit、是否需要让 Codex 基于当前仓库重新生成更小 diff。手工修大 patch 很容易制造混合来源的变更，后续难审。

应用成功后，先看范围：

```bash
git diff --name-only
git diff --stat
git diff --check
```

`git diff --check` 能抓到空白错误和部分 patch 质量问题。然后看关键文件：

```bash
git diff -- src/auth src/api
```

再运行项目验证：

```bash
pnpm lint
pnpm typecheck
pnpm test -- src/auth
```

如果是文档 diff，跑文档检查；如果是生成文件，尽量用项目生成命令重新生成，而不是直接接受 AI 写出的最终生成物。

## 风险扫描：AI diff 常见气味

应用后可以快速扫描一些高风险模式：

```bash
rg -n "eslint-disable|@ts-ignore|@ts-expect-error|test\\.skip|it\\.skip|describe\\.skip" .
rg -n "\\bany\\b|TODO|HACK|temporary|workaround" src tests
git diff -- package.json pnpm-lock.yaml package-lock.json yarn.lock
```

这些命令不能证明 diff 好坏，但能提示“为了过检查而降约束”的可能。不要机械禁止所有 `@ts-expect-error` 或 `any`；重点是要求解释。比如为了兼容第三方类型缺陷，局部 `@ts-expect-error` 可能合理；为了让 Codex 快速通过 typecheck，就不合理。

还要看是否改了任务范围外文件。一个修 auth timeout 的任务，如果顺手改了主题样式、依赖版本和 CI 配置，应拆开处理。范围外改动要么删除，要么变成独立任务。

## 真实工作流案例：把 Cloud 修复带回本地

假设你在 Codex Web 委派了“修复认证超时重试”任务，Cloud 生成了 diff。

第一步，在本地准备：

```bash
git fetch origin
git switch main
git pull --ff-only
git switch -c codex/auth-timeout-from-cloud
git status --short
```

第二步，应用：

```bash
codex apply task_123456
```

第三步，检查范围：

```bash
git diff --name-only
git diff --stat
git diff --check
```

第四步，验证：

```bash
pnpm lint
pnpm typecheck
pnpm test -- src/auth
```

第五步，让 Codex 做只读 review，而不是继续自动改：

```bash
codex --sandbox read-only \
  "Review the current diff from Codex Cloud. Focus on auth security, retry loops, token leakage, missing tests, and scope creep. Do not edit."
```

第六步，根据审查结果决定是否提交：

```bash
git add src/auth src/api tests
git commit -m "Fix auth timeout retry"
```

如果验证失败，把错误和当前 diff 交给 Codex 本地修复，但仍要限制范围：

```bash
codex --sandbox workspace-write --ask-for-approval on-request \
  "The Codex Cloud diff has been applied locally but pnpm test -- src/auth fails. Fix only the applied auth-related diff. Do not broaden scope. Run pnpm test -- src/auth and pnpm typecheck."
```

## 回滚策略

如果你在干净分支里应用且没有混入其他改动，丢弃很容易：

```bash
git status --short
git restore .
```

如果产生未跟踪文件，先 dry run：

```bash
git clean -fd --dry-run
```

确认只列出本次 apply 产生的文件后再清理。不要在不干净工作区里运行 destructive 命令。团队流程里更推荐 worktree：失败就保留 worktree 供检查，或删除整个隔离 worktree。

如果已提交，可以用普通 Git revert。不要依赖 Codex 记忆来撤销文件；以 Git 历史为准。

## 操作清单

- 应用前确认工作区干净。
- 为 Cloud diff 创建专门分支或 worktree。
- 记录任务 ID、任务链接、基线 commit、应用时间和 reviewer。
- `codex apply` 失败时，不要急着手工揉大冲突。
- 应用后先看 `git diff --name-only`、`git diff --stat`、`git diff --check`。
- 运行 lint、typecheck、相关测试和必要构建。
- 扫描跳过测试、关闭规则、降低类型约束等风险模式。
- 检查是否修改任务范围外文件。
- 对生成文件使用项目生成命令重新生成。
- 走正常 PR review，不把 apply 成功当成合并依据。

## 权衡与风险

`codex apply` 的价值是把 Cloud 任务和本地审查连接起来。它节省复制 patch 的成本，也减少手工搬运错误。但它不能解决环境差异、基线漂移和业务审查。

Cloud 环境与本地环境可能不同。依赖版本、系统库、测试数据、环境变量、网络和 secrets 可见性都会影响验证结果。官方 Cloud 任务运行在隔离环境，setup 阶段与 agent 阶段权限也有差异；本地验证仍然必要。

远程 diff 越大，apply 后的审查成本越高。超过 5 到 10 个文件的 AI diff，建议拆成更小任务，除非它是机械迁移且有强验证命令。大 diff 即使能应用，也不容易建立信任。

`apply` 还可能给团队制造“已由 AI 完成”的心理偏差。实际应该反过来：AI 生成 diff 只是候选，审查标准不能降低。

## 常见误区

误区一：把 `codex apply` 当 `git merge`。它只是应用 diff。

误区二：在脏工作区应用。后续无法区分来源，回滚也危险。

误区三：本地 patch 文件也用 `codex apply`。本地 patch 用 `git apply --check` 和 `git apply`。

误区四：apply 成功后不跑测试。`git apply` 成功只说明文本 patch 对上了，不说明代码能跑。

误区五：接受范围外顺手修改。AI diff 的常见风险就是把相邻清理混进主任务。

## Provenance 与审计记录

`codex apply` 落地的 diff 必须能追溯。建议团队把 provenance 写进 PR 描述，而不是只放在本地笔记里。

```markdown
## Codex Cloud provenance

- Task ID:
- Task URL:
- Requested by:
- Original prompt summary:
- Cloud environment:
- Base branch / commit:
- Applied locally at:
- Local branch:
- Verification:
- Reviewer:
```

这份记录解决三个问题。第一，出现回归时能找到来源；第二，reviewer 能判断 Cloud 环境和本地环境是否一致；第三，团队能统计哪些类型的 Cloud 任务质量高，哪些需要收紧模板。

如果任务来自 Slack、Linear 或 GitHub 评论，也要记录入口。一个 `@Codex` 评论发起的任务，可能包含上下文片段和权限边界；几周后只看本地 diff，很难知道当初为什么这么改。

## 大 diff 的拆解策略

当 `codex apply` 后看到大量文件变化，第一反应不应是开始逐个 review，而是判断是否应该拆。可以用几个阈值：

- 超过 10 个源码文件：要求拆分或重新生成更小任务。
- 同时改业务代码、测试、文档、依赖：拆成多 PR。
- 改锁文件但没有说明依赖原因：先拒绝或要求解释。
- 改 CI、权限、部署脚本：单独审查，不混入业务修复。
- 大量格式化变化：确认是否来自项目 formatter，并单独提交。

拆解时，不要让 Codex 在已应用的大 diff 上“删掉无关部分”作为唯一方案。更稳的是回到干净分支，重新委派更窄任务。已应用的大 diff 可以作为参考，但不作为最终合并来源。

## 冲突处理：不要把冲突修成无来源混合物

`codex apply` 可能因为 `git apply` 冲突而失败。此时有三种选择。

第一，当前分支错了。切到任务基线附近的分支或更新本地 main 后重试。

第二，Cloud diff 过期。让 Codex Cloud 或本地 Codex 基于当前代码重新生成 diff。

第三，冲突很小且语义清楚。可以人工修，但要在 PR 中说明哪些部分来自 Cloud，哪些部分是本地冲突修复。

最差的做法是打开 patch，凭感觉把一大段内容复制进当前文件。这样产生的变更没有清晰来源，验证失败时也不知道是原始 diff 错，还是手工合并错。AI diff 已经需要额外审查，手工混合会让审查成本再上一个台阶。

## 安全敏感 diff 的额外检查

以下文件或目录被 `codex apply` 改动时，应触发额外审查：

```text
.github/workflows/
infra/
terraform/
kubernetes/
auth/
permissions/
billing/
migrations/
scripts/deploy*
package.json / lockfiles
```

安全敏感 diff 的问题通常不在语法，而在边界。例如 workflow 增加了 `pull_request_target`，可能改变外部 PR 的 secret 暴露面；迁移脚本默认删除数据，测试可能完全覆盖不到；认证逻辑把服务端校验移到客户端，单测仍可能通过。

建议让 Codex 做一次只读安全复核：

```bash
codex --sandbox read-only \
  "Review the applied diff for auth, authorization, secret exposure, CI permission, deployment, and data migration risks. Do not edit. Cite file paths."
```

但最终批准仍由人做。安全复核是证据来源，不是合并授权。

## 应用后的 PR 分层

一个好的 `codex apply` PR 应该分层描述：

```markdown
## What changed

业务行为变化。

## Source

Codex Cloud task provenance。

## Verification

本地命令和结果。

## Review focus

希望 reviewer 重点看的文件或语义。

## Not included

明确未处理的相邻问题。
```

“Not included” 很重要。AI 生成 diff 容易顺手处理相邻问题，或者让 reviewer 误以为所有相关问题都解决了。明确不包含哪些内容，可以防止范围继续膨胀。

## 与普通 PR 的差异

Codex Cloud diff 和普通人工 PR 的审查标准不应降低，但审查重点会略有不同。人工 PR 通常能从作者那里追问设计动机；Cloud diff 的作者是一个任务执行过程，真正的责任人是委派任务的人。因此 reviewer 要额外检查任务描述是否足够清楚、Cloud 环境是否合适、生成结果是否超出原始请求。

普通 PR 里，开发者可能已经在本地反复运行过项目命令；Cloud diff 里，这个假设不成立。即使任务页面显示某些检查通过，也要确认本地或 CI 的对应检查。尤其是依赖安装、数据库、浏览器测试、系统库和企业网络相关任务，Cloud 结果只能作为候选证据。

普通 PR 的范围漂移通常能通过作者解释；Cloud diff 的范围漂移更应该直接收紧。如果一个“修复按钮文案”的 Cloud 任务改了路由、样式系统和测试快照，最佳处理不是让 reviewer 慢慢理解，而是要求重新生成更窄 diff。AI 任务越小，结果越容易审。

## 委派前的 prompt 质量

`codex apply` 的安全性很大程度取决于 Cloud 任务创建时的 prompt。落地阶段发现 diff 过大，往往说明委派阶段就没有写清边界。一个好的 Cloud 任务至少包含：

```text
目标：要修复或实现什么。
范围：允许修改哪些目录或文件。
禁止项：不能改哪些配置、依赖、生成文件或测试期望。
验证：希望 Cloud 环境运行哪些命令。
输出：希望任务完成后报告哪些信息。
风险：哪些地方必须人工 review。
```

如果任务创建时没有这些内容，`codex apply` 后就要更保守。不要因为 diff 已经生成，就默认接受它。可以把不合格 diff 当成一次调研结果：从中提取线索，重新写更窄任务。

## 本地二次修复的边界

Cloud diff 应用后，本地可能还需要二次修复。二次修复要保持来源清晰。建议在提交历史里分两步：

```text
commit 1: Apply Codex Cloud task diff
commit 2: Fix local verification failures
```

如果团队习惯 squash，也应在 PR 描述中说明哪些调整是本地补充。这样回归时能判断问题来自原始 Cloud diff 还是本地修复。

本地二次修复不要无限扩大。比如 Cloud diff 修 auth，二次修复发现测试工具也坏了，应单独开任务处理测试工具，而不是把测试基础设施重构混进同一个 PR。应用远程 diff 后，人的责任不是把所有相邻问题顺手解决，而是把这次变更收敛到可审查范围。

## 失败样例复盘

每次 `codex apply` 失败都值得分类：冲突、验证失败、范围越界、环境差异、任务描述不清、Cloud 环境缺依赖。把分类记录下来，能反向改进 Cloud 环境和委派模板。

如果冲突多，说明任务运行基线太旧，应该缩短 Cloud 任务生命周期或在开始前更新分支。如果范围越界多，说明 prompt 缺少禁止项。如果验证失败多，说明 Cloud 环境的 setup 或本地验证矩阵不一致。如果任务描述不清，说明委派入口需要模板化。

复盘目标不是责怪 Codex，而是减少下一次同类失败。`codex apply` 是远程生成和本地工程制度之间的接口；接口两边都要调。

## 应用前审查：先看补丁形状

在运行 `codex apply` 或接受任何远程 diff 前，先看补丁形状。补丁形状指文件数量、目录分布、删除新增比例、锁文件变化、生成文件变化和测试变化。形状异常时，内容再好也要谨慎。

一个文档修复任务如果改了脚本和配置，形状异常。一个小 bug 修复如果删除大量测试，形状异常。一个依赖升级如果没有 lockfile，形状异常。一个安全修复如果只改前端校验，形状异常。形状审查能在读细节前快速发现不匹配。

可以先运行：

```bash
git diff --stat
git diff --name-status
```

再按任务说明检查允许范围。这个步骤不替代代码审查，但能决定是否继续投入审查成本。范围明显越界的补丁，直接丢弃或要求重新生成，比人工慢慢修更便宜。

## 应用后的验证顺序

补丁落地后，不要马上全量测试。先做便宜检查，再做昂贵检查。建议顺序是：工作区状态、格式或 lint、类型检查、定向测试、相关集成测试、全量检查。失败越早发现，定位越快。

验证失败时，不要立刻让 Codex 大范围修复。先分类。格式失败通常可以直接修。类型失败要看是导入、契约还是缺依赖。测试失败要看是目标行为变了、测试不完整、环境缺失还是补丁错误。分类后再决定是小修、重生成还是人工介入。

验证结果要写进补丁记录。尤其是没有运行的命令，必须写原因。比如“浏览器端到端测试未运行，因为当前环境没有浏览器依赖”比沉默可靠。reviewer 可以据此决定是否在 CI 或本地补跑。

## 冲突处理原则

`codex apply` 遇到冲突时，不要把冲突解决当成机械合并。冲突说明远程生成时的基线与当前仓库不同。冲突文件可能包含新的业务逻辑、重命名、删除或安全修复。直接把两边拼起来，容易产生语义错误。

冲突处理应先回答三问：当前主分支的新变化是什么，补丁想改变什么，两者是否仍然兼容。如果当前变化已经解决了同一问题，补丁可以丢弃。如果补丁仍有价值，最好重新委派基于最新基线生成。只有冲突很小且语义清楚时，才手工解决。

解决冲突后要重新跑验证。不能因为原始 Cloud 任务跑过检查，就认为合并后的版本也安全。冲突解决本身是新改动。

## 补丁来源和责任边界

远程 diff 的来源要清楚。PR 描述或提交信息里应写明任务链接、委派人、基线、应用时间和本地补充。责任不在模型，而在合并流程。人类委派任务、人类审查补丁、人类决定合并。

如果补丁来自多个候选，不要混在一个无来源提交里。可以保留候选编号，或在最终 PR 里写明“基于候选 B，人工补充验证修复”。这对回归调查很重要。发现问题时，维护者能判断是候选设计错、应用冲突错，还是本地二次修复错。

## 何时拒绝补丁

拒绝补丁也要有标准。以下情况建议拒绝：修改范围明显超过任务；依赖或锁文件变化没有解释；测试被删除或弱化；安全边界从服务端移到客户端；生成文件不可复现；补丁无法说明验证；引用来源不可靠；任务输入来自不可信外部内容且权限过宽。

拒绝后可以把补丁当作调研材料。它可能指出相关文件、失败路径或缺失测试。把这些线索写进新任务，用更窄范围重新生成。不要把“已经有补丁”当成继续修的理由。工程上，丢弃坏补丁通常比修坏补丁更省。

## 发布前复核

`codex apply` 文章发布前要确认它没有暗示“远程生成的 diff 可以直接信任”。正确叙述应始终把 Cloud diff 当作候选补丁：先看形状，再落地，再验证，再审查。任何跳过本地复核的表达都应删掉。

还要检查回滚路径。文章应让读者知道，应用补丁前要记录当前状态，应用后要看 `git diff --stat`，验证失败要能撤回，冲突严重要能丢弃。Codex Cloud 的价值是并行生成候选，不是绕过本地工程制度。这个边界越明确，团队越敢使用远程委派。

## 检查口径

这篇文章的检查口径是“补丁能否被拒绝”。如果流程设计让人很难丢弃一个坏补丁，说明 `apply` 被用成了信任机制。正确流程应允许快速拒绝：范围越界就拒绝，验证不可解释就拒绝，冲突语义不清就拒绝，安全边界变弱就拒绝。能拒绝，才说明审查仍在人手里。

## 最后确认

补丁落地还要保留人工判断空间。即使 diff 很小，也要看它是否符合原始任务；即使命令通过，也要看它是否改变了安全边界；即使冲突解决成功，也要重新验证。`apply` 的终点不是文件写入，而是形成一份可以被 reviewer 接受或拒绝的变更。

这条底线必须写清：补丁只是候选，合并才是工程决定，责任链也必须清晰。

## 延伸阅读

- [Codex CLI Reference](https://developers.openai.com/codex/cli/reference)
- [Codex Cloud](https://developers.openai.com/codex)
- [Codex Non-interactive Mode](https://developers.openai.com/codex/noninteractive)
- [Git apply 文档](https://git-scm.com/docs/git-apply)
- [Agent approvals and security](https://developers.openai.com/codex/agent-approvals-security)
