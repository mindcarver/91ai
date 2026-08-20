# i18n 翻译配对与质量门禁：中英双语文档怎么不腐烂

> `dsh` 用一个三文件配对机制（`foo.md` + `foo.zh.md` + `foo.i18n.yaml`）和 blob hash 一致性记录，让中英双语文档无法悄悄分叉：改了一边没改另一边，CI 门禁就挂。
> 这一篇拆配对契约、一致性记录、结构镜像规则、verify-translation-pairing 门禁、Git merge driver，以及 lefthook hooks 怎么在提交前拦住分叉。

## 为什么双语文档是硬约束

`dsh` 的文档被公司内外的人和 agent 读，所以范围内的每一份文档都维护英文和简体中文两个版本。这不是"有精力就翻译"，是硬约束。

原文说得很直接：两种语言权威相等。一个文档可以先以任一语言写和 review，然后翻译出对应版本。一份中文先写的 Agent Note 和一份英文先写的一样合法。绑定它们的是"必须说同一件事"。

双语文档最常见的失败模式是**分叉**：英文改了，中文没跟着改，或者反过来。一旦分叉，读者不知道哪个版本是对的，文档从资产变成负债。`dsh` 的解法是一套机械化的配对和校验系统。

## 配对契约：三个兄弟文件

一个配对是同一目录下的三个兄弟文件：

- `foo.md`：英文版
- `foo.zh.md`：中文版
- `foo.i18n.yaml`：一致性记录

没有 locale 目录，没有独立翻译仓库，没有交替的双语文件。配对整体合并：一个 PR 永远不落地一种语言而不带另外两个文件。

这个三文件结构的好处是**配对是原子单元**。你不能只改英文、只改中文、或只改记录。一次确认同时更新三者。

## 一致性记录：blob hash

`foo.i18n.yaml` 持有每一侧在上次确认一致时的完整 git blob hash。整个文件就是文件名到 hash 的映射，两条记录：`foo.md` 一条，记 `3f786850e387550fdab836ed7e6dc881de23001b`；`foo.zh.md` 一条，记 `89e6c98d92887913cadf06b2adb97f26cde4849b`。

用 blob hash 而不是 commit hash，所以记录对同一个 PR 里编辑的文件可计算（`git hash-object foo.md`），一致性是纯内容比较。

这意味着：你改了 `foo.md` 但没重新确认配对，`foo.md` 的当前 blob hash 和记录的不一样，门禁失败。你必须同时更新中文版并重新记录两者。

`--write` 在记录前把快照存到本地 Git object database（包括未提交的工作树内容），并在 `refs/dsh/translation-pairing/snapshots/` 下为每个不同的 blob 固定一个 content-addressed ref，让垃圾回收不会让记录的恢复指针失效。

记录的 hash 能恢复任一侧上次确认时的确切文本。所以一个失步的配对通过对面对编辑侧的 diff 最小化地打补丁来更新，不是重新翻译整个文件。更新后跑 `pnpm run verify-translation-pairing --write <pair>` 重新记录两边的 hash。

## 结构镜像：一一对应

配对不只是文字翻译，是结构镜像。`dsh` 要求配对两侧的 Markdown 结构一一对应：

- 标题层级和顺序
- 列表类型（有序/无序）
- 有序列表的起始序号
- 列表项数量
- 表格的行数和列数
- 链接目标
- 逐字代码块（info string 和内容）

这些规则写在 `translation-rules.md` 里。门禁 `verify-translation-pairing` 机械地检查这些结构签名匹配。

为什么要管列表项数量？因为翻译时漏掉一个列表项是常见错误。为什么要管表格行列数？因为翻译时多一行少一列也是常见错误。结构签名检查把这些错误从"review 时容易漏"变成了"CI 自动抓"。

语言切换器的规则也精确。中文文件在 H1 后面紧跟一行切换器：链接文字 `English` 指向同目录的 `foo.md`，跟一个竖线，再跟纯文本 `中文`。authored 英文文件对等地反过来：纯文本 `English` 在前，链接文字 `中文` 指向 `foo.zh.md` 在后。列出的 generated 英文源省略这一行，保持和生成器输出字节一致。

## 门禁：verify-translation-pairing

`pnpm run verify-translation-pairing` 是 doc-sync 的一部分，机械化地执行配对契约。它检查三件事：

1. **范围内的每个文档有完整的配对。** 缺 `.zh.md` 或 `.i18n.yaml` 就失败。README 发现是 basename 大小写不敏感的，所以 `missions/readme.md` 和其他文档根一样在范围内。

2. **每个存在的配对 artifact 完整且一致。** 三个文件都在；每一侧的当前 blob hash 等于记录的；中文侧和每个 authored 英文源带语言切换器；结构签名按序匹配。

3. **列为 excluded 的文件没有 `.zh.md` 和 `.i18n.yaml`。** 这些文件明确排除在双语配对之外。

几个实用的变体：

- `verify-translation-pairing --list`：打印范围内每个文档的当前配对状态（missing、out-of-sync、ok）。从不失败，`missing` 和 `out-of-sync` 行标识违规。
- `verify-translation-pairing <pair...>`：只检查命名的配对。一个更新循环在几秒内验证自己的配对，不重新扫描整个语料库。
- `verify-translation-pairing --write <pair>`：重新记录确认的配对。

门禁创建的实际规则是：**当一个 PR 编辑了配对文档的任一侧，同一个 PR 必须直接更新对应版本并重新记录配对。** 一个让配对失步的 PR 在 CI 变红。

## Git merge driver：自动合并配对

这是配对系统里最精巧的部分。

两个分支包含同一配对的有效确认时，安装的 `dsh-translation-pairing` Git merge driver 在 Git 的默认 text merge 对两个记录的 owner-blob 三元组都成功、且合并后的配对保留必需的切换器和结构签名时，组合一个新记录。

中文文件必须保留英文回链；authored 英文源必须保留中文链接，而列出的 generated 英文源豁免。driver 无法验证的任何结构保留为普通冲突。

`pnpm run resolve-translation-pairing-conflicts` 对已经停止的 merge 执行同样的 fail-closed 操作：暂存每个安全的配对记录，在其他配对冲突仍需手动处理时不成功退出。

这个 merge driver 解决的是"两个分支各自更新了同一配对的不同侧"的合并问题。没有它，每次合并都要人肉解决配对冲突。有了它，干净的配对合并是自动的。

安装方式是通过 `scripts/install-lefthook.mjs`（postinstall 自动跑），worktree-local 的 Lefthook hooks 和 merge driver 一起配置。

## lefthook hooks：提交前拦住分叉

`lefthook.yml` 定义了本地 Git hooks，设计为快速的本地检查点，CI 拥有完整的仓库级门禁矩阵。

**pre-commit** 有六个 job：

1. **translation pairing (staged records)**：对暂存的 `.i18n.yaml` 文件跑配对校验。改了配对记录没更新内容？提交前就拦住。
2. **archived agent notes**：校验归档的 Agent Notes。
3. **lint (staged)**：用 Oxlint 校验暂存的 TS/TSX 文件，带 `--fix` 和有限重试。
4. **third-party notices (staged)**：当 package.json 或相关文件变化时，重新生成 `THIRD_PARTY_NOTICES.md` 并暂存。这是"重新生成而非拒绝"的设计：一个忘改 notices 的依赖编辑会在提交时被自动修正。
5. **whitespace (staged)**：`git diff --cached --check`。
6. **vendor manifest guard**：检查 vendored 代码的 manifest。

**pre-merge-commit** 重复 pairing 和 archived notes 检查。

**pre-push** 跑 `pnpm run typecheck`，完成 Host lib 阶段（包括生成的 Typert 合约）再跑 Client TypeScript 检查。

这些 hook 的设计原则是"快"。它们故意不跑测试、快照、文档检查、build 或 hygiene。贡献者跑一次和变更相关的检查，CI 拥有穷尽的覆盖。`pnpm run check:all` 是可选的完整本地门禁集，独立于 Git hooks。

## 绿色门禁的含义和局限

这个系统最重要的限制，原文用了粗体：

> A green gate means the pair was confirmed consistent at these exact contents, not that the confirmation was sound.

翻译过来：**绿色门禁意味着配对在这些确切内容下被确认一致，不意味着确认是合理的。**

门禁检查 hash 和 Markdown 结构。它不能判断两边是否真的说了同一件事，措辞是否准确、术语是否正确、表达是否自然。这些是 reviewer 的半边契约。

一个重新记录的配对，如果对应版本翻译得很差，门禁会过。但它不应该过 review。这是机械检查和人类判断的分工：门禁抓结构不一致，reviewer 抓语义不一致。

`dsh` 用 `terminology.md` 作为术语的真相来源，`translation-rules.md` 定义翻译规则。常规的对应版本更新由工作中的 agent 一次性直接完成，加载 terminology 后一 pass 翻译。它不调用翻译 skill、不生成 briefing、不跑单独的翻译 review pass、不委托给 subagent。扩展的 `dsh-translate-docs` workflow 保留给显式用户调用。

## 延伸阅读

- [Bilingual documentation 契约](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/i18n/README.md)
- [Translation Rules](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/i18n/translation-rules.md)
- [Terminology](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/i18n/terminology.md)
- [lefthook.yml](https://github.com/deepseek-ai/deepseek-harness/blob/master/lefthook.yml)
- [Automatic Pairing Merges Agent Note](https://github.com/deepseek-ai/deepseek-harness/blob/master/.agents/notes/implemented/process/2026-08-08-automatic-translation-pairing-merges.md)

上一篇：[文档即代码：用脚本自动生成图、目录和校验](./45-docs-as-code-autogen-graphs-catalogs.md)
下一篇：[Cordis 生态溯源：从 Koishi 到 DeepSeek Harness 的插件框架谱系](./47-cordis-lineage-koishi-plugin-framework-genealogy.md)
