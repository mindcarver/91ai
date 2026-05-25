# 仓库指南

## 项目结构与模块组织

本仓库是一个精选的 AI 指南与评估知识库。

- `README.md` 是公开入口页。保持简短，并以导航为主。
- `docs/README.md` 是学习路径、雷达图和路线图的内容地图。
- `docs/ai-coding/` 存放 AI 编程工具索引。每个工具使用一个聚焦的 Markdown 文件，例如 `docs/ai-coding/claude-code.md`。
- `assets/` 存放 README 使用的媒体资源，例如 `assets/awesome-ai-guide-cover.png`。

目前还没有应用源码或测试套件。

## 构建、测试与开发命令

当前不需要构建系统。常用的本地检查命令：

```sh
git status --short
find docs -maxdepth 2 -type f | sort
```

提交变更前，请在 GitHub 或 Markdown 查看器中预览文档，并验证 `./docs/ai-coding/` 等相对链接是否可用。

## 写作风格与命名约定

使用简洁的 Markdown，配合清晰标题、短段落和用于比较的表格。优先提供实用判断，而不是堆砌链接。

文件命名：

- 新文档使用小写 kebab-case：`tool-name.md`。
- AI 编程工具放在 `docs/ai-coding/` 下。
- 使用描述性章节名：`Official Resources`、`Learning Resources`、`Use Cases`、`Evaluation Criteria`、`Current Judgment`。

避免营销话术。说明资源适合谁、提供什么，以及存在哪些风险或限制。

## 测试指南

当前没有自动化测试。人工审查应检查：

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
