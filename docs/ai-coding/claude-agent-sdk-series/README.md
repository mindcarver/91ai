# Claude Agent SDK 全书

这是一套关于 Claude Agent SDK 的中文参考，共 33 篇。SDK 的本质是把 Claude Code 引擎当作库用：你的 Python 或 TypeScript 程序通过它驱动一个完整的 agent（工具循环、权限、会话、子代理），获得全部编程控制面。内容从定位与进程模型讲起，经过输入输出、工具体系、定制、控制与观测，收在生产化、实战与迁移参考。

> SDK 与引擎都在快速演进。涉及选项、事件类型和版本门槛时，以文章内的时点标注为线索，核对官方文档与两门语言的参考手册。

返回：[AI 编程总览](../README.md)

## 推荐阅读路径

- **第一次接触**：01 → 02 → 03 → 04，弄清它是什么、怎么跑、引擎盖下发生了什么。
- **按主题查阅**：七个部分各成体系，从下面目录直接进入。
- **准备上生产**：重点看 20-28（控制、观测、托管、安全、测试），再读 29 决定嵌入式还是托管式。

## 一、定位与地基（01-04）

| # | 文章 |
| --- | --- |
| 01 | [四个 SDK，一个引擎：Agent SDK 到底是什么](./01-what-is-agent-sdk.md) |
| 02 | [第一个 agent：从安装到看懂它的输出](./02-quickstart-first-agent.md) |
| 03 | [引擎盖下：SDK 如何驱动一个 Claude Code 子进程](./03-subprocess-model-protocol.md) |
| 04 | [白得的功能：SDK 从 Claude Code 继承了什么](./04-inherited-features.md) |

## 二、输入输出与状态（05-09）

| # | 文章 |
| --- | --- |
| 05 | [消息流与事件模型：读懂 agent 的每一次心跳](./05-message-stream-events.md) |
| 06 | [流式输入与人工介入：把审批接进你的程序](./06-streaming-input-approvals.md) |
| 07 | [结构化输出：把 agent 变成一个 API](./07-structured-outputs.md) |
| 08 | [会话：创建、恢复与分叉](./08-sessions-resume-fork.md) |
| 09 | [会话存储：让会话跟着你的基础设施走](./09-session-storage.md) |

## 三、工具体系（10-14）

| # | 文章 |
| --- | --- |
| 10 | [内置工具的控制与裁剪：划定 agent 的能力边界](./10-built-in-tools-control.md) |
| 11 | [自定义工具：把你的系统能力交到 agent 手里](./11-custom-tools.md) |
| 12 | [外部 MCP：把第三方世界接进会话](./12-external-mcp.md) |
| 13 | [Tool Search：大规模工具面的上下文经济学](./13-tool-search.md) |
| 14 | [子代理与多 agent 编排：委派的艺术](./14-subagents-orchestration.md) |

## 四、定制与上下文（15-19）

| # | 文章 |
| --- | --- |
| 15 | [系统提示的修改：换脑还是加规矩](./15-system-prompts.md) |
| 16 | [配置加载全解：选项、文件与环境的三国志](./16-configuration-loading.md) |
| 17 | [Skills 在 SDK 里：给产品化 agent 装上可插拔的专长](./17-skills-in-sdk.md) |
| 18 | [Plugins 在 SDK 里：把 agent 的扩展打包分发](./18-plugins-in-sdk.md) |
| 19 | [上下文窗口管理：长跑 agent 的生存术](./19-context-window-management.md) |

## 五、控制与观测（20-25）

| # | 文章 |
| --- | --- |
| 20 | [权限系统全解：六道门与六种模式](./20-permissions.md) |
| 21 | [Hooks：把你的代码织进 agent 的生命周期](./21-hooks.md) |
| 22 | [文件检查点：agent 时代的撤销键](./22-file-checkpointing.md) |
| 23 | [成本追踪与预算：从 token 到美元的账本](./23-cost-tracking.md) |
| 24 | [OTel 可观测性：给 agent 装上飞行记录仪](./24-observability-otel.md) |
| 25 | [Todo 追踪：把 agent 的任务清单暴露给你的程序](./25-todo-tracking.md) |

## 六、生产化（26-30）

| # | 文章 |
| --- | --- |
| 26 | [托管架构：把 agent 服务跑起来、扩出去](./26-hosting-architecture.md) |
| 27 | [安全部署：给 agent 一个它闯不了祸的世界](./27-secure-deployment.md) |
| 28 | [测试与评估：给会变聪明的系统写测试](./28-testing-evals.md) |
| 29 | [Managed Agents：把 harness 也交出去](./29-managed-agents.md) |
| 30 | [实战收尾：从零做一个工单处理 agent](./30-capstone-product-agent.md) |

## 七、参考与迁移（31-33）

| # | 文章 |
| --- | --- |
| 31 | [从 CLI 与旧 SDK 迁移到 Agent SDK](./31-migration-from-cli.md) |
| 32 | [排错手册：高频故障的症状、根因与修法](./32-troubleshooting.md) |
| 33 | [Python 与 TypeScript：同一引擎的两种手感](./33-python-typescript-api-map.md) |
