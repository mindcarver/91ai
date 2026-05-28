# 仓库指南

## 项目结构与模块组织

本仓库是一个精选的 AI 指南与评估知识库。

- `README.md` 是公开入口页。保持简短，并以导航为主。
- `docs/README.md` 是学习路径、雷达图和路线图的内容地图。
- `docs/ai-coding/` 存放 AI 编程工具索引。每个工具使用一个聚焦的 Markdown 文件，例如 `docs/ai-coding/claude-code.md`。
- `assets/` 存放 README 使用的媒体资源，例如 `assets/awesome-ai-guide-cover.png`。

目前还没有应用源码或测试套件。

## 构建、测试与开发命令

当前不需要构建系统。项目提供校验脚本，用于检查文档质量和一致性：

```sh
./scripts/check.sh lint       # Markdown 格式检查（标题层级、列表风格、空行规则）
./scripts/check.sh links      # 内部链接检查（文件/目录是否存在）
./scripts/check.sh links-ext  # 内部 + 外部链接检查（较慢，需网络）
./scripts/check.sh badges     # README badge 计数验证
./scripts/check.sh all        # 运行 lint + links + badges
./scripts/check.sh all-full   # 运行全部检查（含外部链接）
```

每次修改文档后，运行 `./scripts/check.sh all` 确认没有引入格式或链接问题。提交前确保所有检查通过。

常用的本地辅助命令：

```sh
git status --short
find docs -maxdepth 2 -type f | sort
```

## 写作风格与命名约定

使用简洁的 Markdown，配合清晰标题、短段落和用于比较的表格。优先提供实用判断，而不是堆砌链接。

文件命名：

- 新文档使用小写 kebab-case：`tool-name.md`。
- AI 编程工具放在 `docs/ai-coding/` 下。
- 使用描述性章节名：`Official Resources`、`Learning Resources`、`Use Cases`、`Evaluation Criteria`、`Current Judgment`。

避免营销话术。说明资源适合谁、提供什么，以及存在哪些风险或限制。

## 视觉与学习专题图规范

为学习专题生成图片时，必须先完成内容整理，再生成图像：

1. 先总结专题目标、学习阶段和关键产出。
2. 再提取 6-12 个关键信息点，例如基础、工具调用、工作流、记忆、RAG、评测、安全、生产化。
3. 最后基于这些信息生成图片。

学习专题图统一使用 Notion 风格的知识卡片图：白底、干净、模块化卡片、轻量连接线、标签/图标式视觉层级、轻微阴影、留白充足，适合文档阅读。图片应该表达“整理过的知识结构”和“学习路径”，而不是抽象风景或装饰海报。

知识卡片图应包含 6-12 个视觉卡片或模块，卡片内容由前置总结提炼而来。可以使用图标、几何符号、色块、编号感和流程连接，但不要生成可读文字。不要使用风景图、机器人、赛博朋克、深色背景、品牌 logo、真实产品 logo、复杂知识图谱或拥挤的信息墙。

图片文件放在 `assets/`，命名使用 kebab-case，例如 `assets/agent-learning-cover.png`。文档中使用相对路径引用，例如 `../../assets/agent-learning-cover.png`。

## 测试指南

自动化校验通过 `./scripts/check.sh` 执行。人工审查应额外检查：

- Markdown 渲染清晰。
- 链接有效，且相对链接可用。
- 对时效性声明使用明确日期。
- 工具能力、价格、迁移和安全行为等信息优先使用官方来源。
- 社区资源标注为社区或第三方材料。

## 提交与拉取请求指南

近期提交使用简短的祈使式摘要，例如：

- `Add Claude Code resource index`
- `Add AI guide navigation map`
- `Simplify README and update cover`

沿用这种风格：简洁、使用现在时，并限定在本次变更范围内。

拉取请求应包含：

- 变更章节的简短摘要。
- 新增声明所使用的关键来源。
- 只有在修改 README 图片或视觉布局时才需要截图。
- 对任何不确定、过时或快速变化的信息进行说明。

## 安全与来源质量

不要添加密钥、令牌、私有 URL 或专有文档。对于会执行命令的 AI 工具，应明确提醒并谨慎处理 shell 访问、MCP 服务器、GitHub Actions 权限、生产凭据和外部 PR 工作流。
