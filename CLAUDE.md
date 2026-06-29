# 项目规则

具体规则见 `.claude/rules/` 目录。

## 内容原则

- 资料要全，但不只追求数量。
- 评测要明确，不写模糊的万能推荐。
- 优先真实使用体验，谨慎引用营销话术。
- 关注工程落地、长期维护、安全边界和成本。
- 过时、低质量或失效资料会被移除或标记。

## 提交与推送

用户要求改动内容（文档、代码、配置等）后，完成改动并确认**本次改动未引入新的 lint/links/badges 失败**（运行 `./scripts/check.sh all`；仓库既有的 `.cursor/`、`.agents/` 等历史失败不阻塞），即**自动 commit + push 到远程，无需再询问是否提交**。

自动提交仍须遵守：

- 仅 stage 本次改动相关的文件，**不要扫入工作区里用户其他未提交的改动**。
- 若本次改动引入检查失败，先修复或报告，不提交未通过的内容。
- commit message 遵循 conventional commits，**不加 `Co-Authored-By` 或任何 AI 署名**（详见 `.claude/rules/commit.md`）。
- push 到当前分支 upstream（本项目默认直接 push `main`）。
- 提交后简述改了什么、推到哪，但不再请求确认。

## 项目地图

### 目录职责

- `README.md` — 公开入口页，导航为主，保持简短。包含计数 badge（项目、ML 文章、Coding 工具、角色路线）
- `docs/README.md` — 内容地图、学习路径、技术雷达、Roadmap
- `docs/ai-coding/` — AI 编程工具评测。每个工具一个文件（如 `claude-code.md`），子目录放工程实践系列文章
- `docs/machine-learning/` — 机器学习系列教程，按 stage0-stage8 分阶段，每阶段多篇
- `docs/project-collections/` — AI 项目分类收藏，每篇一个主题表格
- `docs/ai-money/` — AI 变现实战资源，按方向分篇
- `docs/paths/` — 按角色划分的学习路线（前端、后端、AI 应用、DevOps、产品、普通用户）
- `docs/agent/` — Agent 开发学习路线
- `docs/knowledge-map.md` — 知识图谱总览
- `assets/` — 图片资源，kebab-case 命名

### 校验命令

每次修改文档后运行 `./scripts/check.sh all`，提交前确保全部通过。

```
./scripts/check.sh lint       # Markdown 格式检查
./scripts/check.sh links      # 内部链接检查
./scripts/check.sh links-ext  # 内部 + 外部链接检查（较慢）
./scripts/check.sh badges     # README badge 计数验证
./scripts/check.sh all        # lint + links + badges
./scripts/check.sh all-full   # 全部（含外部链接）
```

### 索引同步规则

新增或删除文件后，必须同步更新以下内容：

1. **README.md badge** — 运行 `./scripts/check.sh badges` 检查是否需要更新
2. **对应目录的 README.md** — 如果目录有 README，更新其中的索引或计数
3. **docs/README.md** — 如果是新增目录或影响导航结构的变更

### 禁区

- `assets/` — 只通过图片生成流程添加，不随意修改已有图片
- `LICENSE` — 不修改
- `README.md` 的 HTML 结构（`<p align="center">` 块）— 不随意调整布局
- `.claude/` — 不修改项目配置文件
- `scripts/` — 校验脚本，修改需验证所有检查仍能通过

### 文件命名

新文档使用 kebab-case：`tool-name.md`。README.md、CLAUDE.md、AGENTS.md 豁免。

### 联系方式卡片

每篇内容文章（`docs/` 下非 `README.md` 的 `.md`）开头（文件最顶部）必须有联系方式卡片。详见 `.claude/rules/contact-card.md`。

- 单一真实源：`docs/_snippets/contact.html`——改联系方式只改这里
- 注入脚本：`./scripts/inject-contact.sh`（幂等：已有占位符原地替换，无则开头插入）
- 占位符：`<!-- CONTACT-START --> … <!-- CONTACT-END -->`，**不要手改其中内容**
- 子目录 `README.md` 不加卡片（脚本全量模式自动排除）；根 `README.md` 在 banner 之后有一张卡片，改联系方式后需额外运行 `./scripts/inject-contact.sh README.md`
