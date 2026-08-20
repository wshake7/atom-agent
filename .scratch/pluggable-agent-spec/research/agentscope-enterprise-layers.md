# AgentScope 2.0 企业能力分层

- 票：[AgentScope 2.0 企业能力分层](../issues/03-agentscope-enterprise-layers.md)
- 调研日：2026-08-20
- 范围：官方 2.0 文档与仓库取证；不排本仓库阶段；不实现产品
- 术语对照：本笔记用 AgentScope 自己的模块名；落到本仓库时，**内核 / 插件 / 接缝**以根目录 `CONTEXT.md` 为准。AgentScope 自称的 Runtime 不是我们的「内核」。

## 结论（给后续对照用）

AgentScope 2.0 的「企业级」不是一张 RBAC/计费产品清单，而是官方自己切开的两层：

1. **Building Blocks（SDK / 框架）**：`Agent` 被写成「无状态 reasoning-acting 循环引擎」，加上 `Msg` / `AgentEvent`、中间件、权限与 HITL、Workspace。
2. **Agent Service（`agentscope.app` / 部署产品）**：FastAPI 把同一套 `Agent` 做成多租户、多会话 HTTP 服务；会话锁、回放、inbox、wakeup 走 Redis `MessageBus`。

独立仓库 **AgentScope Runtime**（`agentscope-ai/agentscope-runtime`）已声明归档：沙箱、AaaS API、全栈可观测「已原生并入 AgentScope 2.0」。这是 2.0 相对 1.x 最重要的分层变化——企业运行时不再是旁路包，而是主仓 `app/` + `workspace/`。

对「以后能长出这些、现在不实现」：不要把 FastAPI、Redis、Hub、频道、Web UI、评测平台塞进内核；内核最少露出 **事件流、可序列化会话状态、中间件钩位、权限三态、可调度的 Agent 单元、存储/总线接口、工具注册面**。

## 权威源（已确认是 2.0）

| 角色 | URL | 如何确认是 2.0 |
| --- | --- | --- |
| Python 主仓 | https://github.com/agentscope-ai/agentscope | README 标题 *What is AgentScope 2.0?*；`Agent` + `create_app`；引用 1.0 论文为历史 |
| 2.0 文档站 | https://docs.agentscope.io/ | 首页 *What's AgentScope 2.0?*；目录分 Building Blocks / Agent as Service |
| 文档索引 | https://docs.agentscope.io/llms.txt | 条目指向 `versions/2.0.7dev/en/...` |
| 2.0 vs 1.0 changelog | https://docs.agentscope.io/versions/2.0.7dev/en/others/change-log.md | 开篇 *breaking release* |
| Agent 循环 | https://docs.agentscope.io/versions/2.0.7dev/en/building-blocks/agent/overview.md | *stateless reasoning-acting loop engine* |
| 事件 | https://docs.agentscope.io/versions/2.0.7dev/en/building-blocks/message-and-event.md | `Msg` / `AgentEvent` |
| 中间件 | https://docs.agentscope.io/versions/2.0.7dev/en/building-blocks/middleware.md | `TracingMiddleware` 等 |
| 权限 | https://docs.agentscope.io/versions/2.0.7dev/en/building-blocks/permission-system/overview.md | allow / deny / ask |
| Workspace | https://docs.agentscope.io/versions/2.0.7dev/en/building-blocks/workspace/overview.md | 七种后端 |
| Agent Service | https://docs.agentscope.io/versions/2.0.7dev/en/deploy/agent-service.md | 明确「owns everything *around* the agent」 |
| Agent Team | https://docs.agentscope.io/versions/2.0.7dev/en/deploy/agent-team.md | 服务层编排 |
| Runtime 归档 | https://runtime.agentscope.io/en/intro.html 、 https://github.com/agentscope-ai/agentscope-runtime | Archive Notice：能力并入 2.0 |
| 1.x 教程站（对照，勿当 2.0） | https://doc.agentscope.io/ | Sphinx：`ReActAgent`、`MsgHub`、`pipeline`、`evaluate`、`Studio`、`agentscope.init(tracing_url=...)` |
| 1.0 论文 | https://arxiv.org/abs/2508.16279 | *AgentScope 1.0: A Developer-Centric Framework* |
| 2024 论文 | https://arxiv.org/abs/2402.14034 | 更早的 multi-agent platform |
| 同组织 Java 2.0（兄弟实现，非 Python 主线） | https://java.agentscope.io/ 、 https://github.com/agentscope-ai/agentscope-java | `ReActAgent` vs `HarnessAgent` |

许可证：主仓 Apache-2.0。论文与 Runtime README 署名 Tongyi Lab / 阿里；**不是** Apache 软件基金会项目。ModelScope 是同集团的模型社区，不是 AgentScope 2.0 的模块边界。

文档域名断裂：`doc.agentscope.io` = 1.x 教程；`docs.agentscope.io` = 2.0。`docs.agentscope.io/v2` 当前 404，稳定入口是 `/latest` 与 `/versions/2.0.x`。

## 1. 2.0 相对 1.x：只记与分层有关的变化

来源：changelog + 1.x 教程 + 2.0 目录。

| 主题 | 1.x（`doc.agentscope.io`） | 2.0（`docs.agentscope.io` + 主仓） | 分层含义 |
| --- | --- | --- | --- |
| Agent | `ReActAgent` / `AgentBase`：`reply` + `observe` + **`print`**；`__call__` | 统一 `Agent`；公开 `reply` / `reply_stream`；**去掉 `print`，Agent 是纯生产者** | UI 不再进循环；前端靠事件 |
| 扩展点 | Agent hook | **Middleware**（洋葱 + transformer）；弃用 hook | 追踪/记忆/RAG 从类内迁到可插拔中间件 |
| 状态 | 嵌套 `state_dict` / `load_state_dict` | 显式 `AgentState` | 会话可外置存储 |
| 可观测 | `agentscope.init(studio_url / tracing_url)` 把 OTel **焊在 Agent 类里** | **从 Agent 类移除 OTel**，改 `TracingMiddleware` | 追踪是框架中间件，不是循环内建 |
| 事件 | 靠 `print` / Studio | 新增 **Event System**；`Msg.append_event` | 流式、HITL、前端的统一原语 |
| 权限 / HITL | 中断 `handle_interrupt` | 独立 Permission System；事件 `RequireUserConfirmEvent` 等 | 人机协同进循环，不进产品 UI |
| 编排 | `pipeline.MsgHub`、`sequential_pipeline`、`fanout_pipeline` | 2.0 文档目录**没有** MsgHub/pipeline；生产编排是 **Agent Team**（服务层工具 + 总线） | 1.x 进程内广播糖；2.0 把多 agent 当成可调度会话 |
| 记忆 | 独立 memory 模块 | changelog：**deprecate memory module**；长记忆走 `AgenticMemoryMiddleware` / `Mem0Middleware` / ReMe | 记忆不是内核对象 |
| RAG | 1.x 模块 | changelog：与 LTM 合并，1→2 迁移进行中；服务层另有 RAG Service | 知识库是可选服务 |
| 执行环境 | 工具直接跑宿主 | 新增 **Workspace**（local / Docker / E2B / K8s / …） | 沙箱是可替换后端 |
| 托管 | 无内建 AaaS；旁路 Runtime 仓 | 新增 **`agentscope.app.create_app`**；Runtime 归档并入 | 企业托管进主仓的 `app/`，但是「agent 周围」 |
| 评测 | `agentscope.evaluate`（Ray / ACEBench） | 2.0 `llms.txt` **无 Evaluation 章节** | 评测未作为 2.0 一等文档能力 |
| Studio | npm 本地可视化 + Friday | 2.0 示例是 `examples/web_ui` + Agent Service | 可视化是产品，不是 SDK |

Runtime 仓归档声明（必须引用）：

> With the release of AgentScope 2.0, all capabilities of AgentScope Runtime — including tool sandboxing, Agent-as-a-Service APIs, and full-stack observability — have been natively integrated into AgentScope 2.0.

来源：https://runtime.agentscope.io/en/intro.html 、 https://github.com/agentscope-ai/agentscope-runtime

Java 2.0 把同一故事说得更干净：`ReActAgent` = 一回合推理核；`HarnessAgent` = 在 Middleware + Toolkit 上叠 workspace / memory / sandbox / sub-agent / skills / Plan，**「harness layers on, never replaces」**。Python 2.0 没有单独的 Harness 类，而是 `Agent` + 可选中间件 + `app` 服务。对照时用 Python 官方分层；Java 只作旁证。来源：https://java.agentscope.io/

## 2. 能力清单（官方模块名）与分层

分层标签（本票用语，不是 AgentScope 自己的词）：

- **循环原语（必须能跑完一回合）**：没有它们 `reply_stream` 不成立。
- **框架**：官方 Building Blocks，可替换实现，但挂在 Agent 上。
- **服务运行时（AgentScope 的 Runtime/AaaS，≠我们的内核）**：`agentscope.app` 为多进程托管引入的总线/存储/调度。
- **运维 / 产品**：UI、频道、Hub、租户资源、部署拓扑、认证、评测台。

### 2.1 循环原语（Building Blocks 核心）

| 官方名 | 中文 | 源码目录 | 职责 | 层 |
| --- | --- | --- | --- | --- |
| `Agent` | 智能体 / ReAct 循环引擎 | `src/agentscope/agent` | 无状态 reasoning-acting；`reply` / `reply_stream` / `observe` / `compress_context` | 循环原语 |
| `Msg` + `ContentBlock` | 消息与内容块 | `src/agentscope/message` | 用户/助手/系统消息；text / data / thinking / tool_call / tool_result / **hint** | 循环原语 |
| `AgentEvent` | 智能体事件 | `src/agentscope/event` | 流式增量、工具生命周期、HITL、hint、自定义信号 | 循环原语 |
| `AgentState` | 智能体状态 | `src/agentscope/state` | 会话级工作记忆、权限上下文、任务上下文、`session_id` | 循环原语 |
| `Toolkit` / `ToolBase` | 工具箱 | `src/agentscope/tool` | Python 工具、MCP、Skill、ToolGroup | 循环原语（注册）+ 框架（具体工具） |
| `ChatModel` + `Credential` | 模型与凭证 | `src/agentscope/model`、`credential` | 提供商解耦；`ModelCard` | 框架（可换） |
| Permission System | 权限系统 | `src/agentscope/permission` | Rule + Mode + tool-level check → allow / deny / ask | 循环原语（决策） |
| `MiddlewareBase` | 中间件 | `src/agentscope/middleware` | `on_reply` / `on_reasoning` / `on_acting` / `on_model_call` / `on_compress_context` / `on_system_prompt` | 接缝（机制）+ 框架（实现） |

内置中间件（框架，不是循环）：`TracingMiddleware`、`ReplyBudgetControlMiddleware`、`TTSMiddleware`、`AgenticMemoryMiddleware`、`Mem0Middleware`、`RAGMiddleware`。

### 2.2 框架 Building Blocks（可不上服务）

| 官方名 | 中文 | 文档 | 层 |
| --- | --- | --- | --- |
| Context | 上下文：压缩、offload、环境注入 | `/building-blocks/context` | 框架 |
| Plan / Task tools | 任务规划：`TaskCreate` 等 | `/building-blocks/plan` | 框架 |
| Skill | 技能（markdown 指令集） | `/building-blocks/tool/skill` | 框架 |
| MCP | MCP 客户端 | `/building-blocks/tool/mcp` | 框架 |
| Workspace / Sandbox | 工作区 / 沙箱 | `/building-blocks/workspace` | 框架（接口）+ 运维（Docker/K8s/E2B 后端） |
| Console | 终端调试 | `/building-blocks/console` | 产品（开发者 CLI） |
| Long-Term Memory | 长期记忆 | `/building-blocks/long-term-memory` | 框架中间件 |
| RAG（SDK） | 检索增强 | `/building-blocks/rag` | 框架中间件 |

Workspace 实现（同一 `WorkspaceBase`）：`LocalWorkspace`、`BubblewrapWorkspace`、`DockerWorkspace`、`E2BWorkspace`、`DaytonaWorkspace`、`K8sWorkspace`、`OpenSandboxWorkspace`。

### 2.3 Agent Service（官方「企业托管」）

README 自称 *batteries-included agent service*。文档原话：服务拥有 **agent 周围的一切**——路由、每用户生命周期、会话、持久化、调度、工具 offload——**业务 `Agent` 代码不用为生产流量重写**。

| 官方名 | 中文 | 层 |
| --- | --- | --- |
| Serving / `create_app` | 托管：多租户、多会话、FastAPI | 服务运行时 + 产品 API |
| `StorageBase`（Redis / SQLAlchemy） | 持久化 | 服务运行时 |
| `MessageBus`（Redis） | 消息总线：会话锁、回放日志、inbox、wakeup | 服务运行时 |
| `WorkspaceManager` | 工作区生命周期与隔离粒度 | 服务运行时 |
| `ChatService` / `SessionService` | 跑/中断一次会话 | 服务运行时 |
| `SchedulerManager` | Cron 调度 | 服务运行时 |
| `BackgroundTaskManager` + `ToolOffloadMiddleware` | 后台工具卸载 | 服务运行时 |
| Agent Team | 领导者–工人编排 | 框架工具 + 服务运行时 |
| Channels | 飞书 / Discord / 自定义频道 | 产品 |
| RAG Service | 多租户知识库服务 | 产品 + 运维（worker） |
| MCP & Skill Hub | 从 Registry/ClawHub 安装 | 产品 |
| Resource Sharing | 组/组织级共享凭证、MCP、技能、工作区 | 产品 |
| `examples/web_ui` | 预置前端 | 产品 |
| `get_current_user_id` / `X-User-ID` | **没有内建用户系统**，占位头 | 运维接入点 |

分布式部署官方标 **WIP**：共享状态在 Redis，多 worker/多节点共用一个逻辑服务。

### 2.4 1.x 有、2.0 文档未作为一等公民的

| 官方名 | 1.x 位置 | 2.0 现状 |
| --- | --- | --- |
| Evaluation（`Benchmark` / `Evaluator` / `RayEvaluator`） | https://doc.agentscope.io/tutorial/task_eval.html | 2.0 目录无对应页 |
| Pipeline / MsgHub | https://doc.agentscope.io/tutorial/task_pipeline.html | 被 Agent Team + 总线替代 |
| AgentScope Studio | https://doc.agentscope.io/tutorial/task_studio.html ；仓 `agentscope-ai/agentscope-studio` | 2.0 走 Web UI + 事件流 |
| `agentscope.init` 全局 tracing | https://doc.agentscope.io/tutorial/task_tracing.html | 改为进程内 OTel `TracerProvider` + `TracingMiddleware` |

组织内另有 `agentscope-ai/pawbench`、`agentscope-ai/agentteams` 等仓，**不是** Python 2.0 主文档模块，本票不把它们算进 2.0 分层。

## 3. 每项能力依赖的运行时原语

AgentScope 自己的运行时原语（跨 SDK 与 Service）：

| 原语 | 官方符号 | 谁依赖它 |
| --- | --- | --- |
| 事件流 | `AgentEvent`；`reply_stream`；SSE `/sessions/{id}/stream` | UI、HITL、协议适配（AG-UI / A2A）、session replay |
| 可重建消息 | `Msg.append_event` | 前端、持久化 transcript |
| 提示块 | `HintBlock` / `HintBlockEvent`；`source` | 调度触发、Team 消息、后台工具完成、预算耗尽提醒 |
| 会话状态 | `AgentState`；`SessionRecord` | 压缩、权限、任务、HITL 暂停续跑 |
| 会话身份 | `user_id` + `agent_id` + `session_id` | 多租户隔离、Team worker、调度 |
| Agent 作为可调度单元 | `ChatService.run` / interrupt；单会话单 run（409） | 聊天、cron、wakeup、Team |
| 消息总线 | `MessageBus`：lock、replay log、inbox、wakeup | 多进程、Team、调度、offload |
| Inbox 注入 | `InboxMiddleware` | 所有「闲时送达」路径的唯一入口 |
| 唤醒分发 | `WakeupDispatcher` | 把总线信号变成一次 `ChatService.run` |
| 存储 | `StorageBase` 记录：Agent / Session / Credential / Schedule / Team / KB / Msg | 重启恢复 |
| 工作区 | `WorkspaceBase` + `Offloader` | 工具执行、Skill、上下文卸载 |
| 权限闸门 | `PermissionContext`；ASK → 事件 | 无人值守 vs 交互 |
| 中间件钩 | 见上表 6+1 位 | 追踪、记忆、RAG、TTS、审计 |
| 工具注册 | `Toolkit` / `list_tools` | MCP、Skill、Team 工具 |

对应关系：

| 能力 | 依赖的原语 |
| --- | --- |
| 多智能体编排（Agent Team） | 独立 session 的 worker Agent；`TeamRecord`；`TeamSay`→inbox `HintBlock`；wakeup；共享 workspace/model 上下文；PermissionMode（如 EXPLORE） |
| 会话 / 状态 | `AgentState` 外置；`SessionService`；storage；可选 workspace 绑定 |
| 追踪 / 可观测 | 事件流（产品 UI）+ `TracingMiddleware`/OTel（运维后端）；服务层还可加 ASGI OTel。**Agent 类不再内嵌 tracing** |
| 评测 | 1.x 要轨迹 `SolutionOutput.trajectory`；2.0 未规定。接缝上至少要能导出事件/消息轨迹 |
| 工具生态 | `ToolBase` + Toolkit 分组；MCP client；Skill loader；权限 check；可选 Workspace 隔离 |
| 部署 | `create_app` + Redis 总线/存储 + WorkspaceManager；K8s 是 workspace **后端** 与拓扑 WIP，不是 Agent 循环的一部分 |
| 人机协同 | 权限 ASK；`RequireUserConfirmEvent` / `ExternalExecutionResultEvent`；interrupt；事件流暂停-恢复 |

## 4. 明显是产品 / 运维、不该进内核的

官方已经把边界写进 Agent Service 首页：服务管 **around the agent**。下列即使官方放进同一 PyPI 包，对「内核」仍应视为污染源：

| 能力 | 为什么是产品/运维 |
| --- | --- |
| FastAPI 路由、OpenAPI、`examples/web_ui` | 应用壳与前端 |
| Channels（飞书/Discord/自定义） | IM 适配 |
| MCP & Skill Hub、ClawHub、GitHub MCP Registry | 应用市场 |
| Resource Sharing（组/组织） | 多租户产品 |
| RAG Service 的 blob / IndexWorker / IndexSweeper | 检索平台与批处理 |
| Cron UI 与 schedule CRUD | 作业系统 |
| `CredentialRecord` 加密保管、ModelCard 表单 schema | 控制台 |
| `X-User-ID` 占位鉴权 | 明确让你换成 JWT/OAuth |
| Redis / Postgres 选型、Alembic、多副本 WIP | 运维 |
| Docker/K8s/E2B/Daytona 具体沙箱 | 执行后端，保留 `WorkspaceBase` 即可 |
| Studio、CloudMonitor、Langfuse、Phoenix | 观测产品；2.0 只留 OTLP 中间件 |
| 1.x Ray 评测器、ACEBench 集成 | 评测产品 |
| TTS 语音、预算中间件的默认文案 | 可选框架，非循环 |
| 协议适配 AG-UI / A2A | 网关 |

反面：官方把 Runtime **并进主仓**，说明他们愿意用一个框架包同时装 SDK 与 AaaS。这是他们的发行策略，**不是**「这些必须进循环引擎」的证据。Java 文档反而强调核心模块与 Spring/Quarkus 无关、水平扩展靠外置 `AgentStateStore`。

## 5. 只要「以后能长出这些」：内核最少接缝（观察，不是决策）

不实现 AgentScope 的 `app/`、Hub、Team、RAG 服务。循环要能被后续阶段接到同类能力上，官方实践对应这些**稳定面**：

1. **事件流接缝**  
   一次回复产出类型化事件（开始/增量/工具/结束/HITL/hint）。消息可从事件重建。UI、SSE、追踪、评测轨迹都挂这里。

2. **Agent 作为可调度单元**  
   `reply` / `reply_stream` / `observe` / **interrupt** / 暂停后用确认或外部结果继续。身份至少能绑 `session_id`（服务层再加 `user_id`/`agent_id`）。

3. **显式状态接缝**  
   `AgentState`（或等价物）可序列化、可外置；循环本身无状态。不要嵌套 `state_dict` 焊死对象图。

4. **中间件钩位**  
   至少：整段回复、推理、工具执行、模型调用、上下文压缩、系统提示变换。追踪/记忆/RAG/审计全部后挂，不要进 Agent 类。

5. **权限三态接缝**  
   每个工具调用输出 allow / deny / **ask**；ask 变成事件而不是打印。无人值守模式是策略，不是另一套循环。

6. **Inbox / 异步投递接缝（可先空实现）**  
   调度、子 agent、后台工具完成，最终都是「往某会话塞 Hint + 唤醒」。没有总线也可以单进程队列；**不要**先写 Redis。

7. **存储接口接缝（可先内存）**  
   会话记录 + 消息 transcript。认证、多租户策略在接口外。

8. **工具注册面**  
   工具、MCP、Skill 都是注册进 Toolkit 的插件；内核只认 `ToolBase` 与分组激活。

9. **Workspace / Offloader 协议（可先本地目录）**  
   执行环境与循环解耦；Docker/K8s 是实现。

10. **观测导出接缝**  
    默认无 OTel；允许中间件把同一事件/模型调用打到 OTLP。不要 `init(studio_url=)` 那种全局焊死。

不需要预先露出的：多租户资源目录、IM 频道、Hub、RBAC、计费、Ray 评测集群、协议网关。

## 分层总表（运行时 / 框架 / 运维）

此处「运行时」= AgentScope 跑完一回合并被调度所需的原语（接近本仓库「内核」候选，但仍是观察）。「框架」= 官方 Building Blocks 可替换件。「运维/产品」= Service 外壳与周边仓。

| 能力 | 运行时（循环/调度原语） | 框架 | 运维 / 产品 |
| --- | --- | --- | --- |
| ReAct 循环 | `Agent.reply_stream` | 批处理工具调度策略 | Console / Web UI |
| 消息与事件 | `Msg`、`AgentEvent` | TS `@agentscope-ai/agentscope` 重建 | SSE、AG-UI/A2A 网关 |
| 会话 / 状态 | `AgentState`、session 身份 | Context 压缩/offload | Redis/SQL `Storage`、多租户 `user_id` |
| 多智能体 | 可调度 Agent + Hint/inbox | Team 工具、SubAgent 模板 | Team CRUD、跨进程总线 |
| 人机协同 | 权限 ASK + HITL 事件 + interrupt | PermissionMode/Rule | 确认 UI |
| 工具 / MCP / Skill | Toolkit 注册 | 具体工具、MCP、Skill loader | Hub 市场 |
| Workspace | `WorkspaceBase` / Offloader | Local 实现 | Docker/K8s/E2B/Daytona |
| 追踪 | 事件 + 中间件钩 | `TracingMiddleware` | OTLP 后端、Studio、Langfuse |
| 记忆 / RAG | 无（钩上注入即可） | LTM/RAG middleware | RAG Service、向量库、IndexWorker |
| 部署 | ChatService 级「跑一次会话」 | `create_app` 工厂 | FastAPI、K8s、健康检查 |
| 调度 / 后台任务 | inbox + wakeup | ToolOffload 中间件 | APScheduler、cron API |
| 评测 | 可导出轨迹 | （2.0 未文档化） | Ray、Benchmark 产品 |
| 频道 / 分享 / 凭证仓 | 无 | ChannelBase 适配器 | 飞书/Discord、组织共享 |

## 未核实 / 降级

- Exa 官方域搜索本次 HTTP 400，未用 Exa 结果。
- `smart-search search` 的模型综述含幻觉（RBAC/Helm/SAP 连接器等），**全部忽略**；本笔记只采用 fetch / Context7 指向的官方页。
- 2.0 源码是否仍残留 `agentscope.evaluate` / `pipeline`：**未打开对应 py 文件核实**。文档目录与 changelog 显示评测与 MsgHub 不再是 2.0 一等能力。
- Java 2.0 Harness 与 Python `app/` 的 API 并非一一对应；企业叙事一致，模块名不要混用。
- 分布式部署官方 WIP，不能当成已交付的多活方案。

## 调研命令

```powershell
smart-search doctor --format json
smart-search deep "AgentScope 2.0 enterprise features architecture layers vs 1.x official docs agentscope-ai" --format json
smart-search context7-library "agentscope" --format json
smart-search zhipu-search "AgentScope 2.0 企业级 官方文档" --count 8 --format json
smart-search search "AgentScope 2.0 official documentation enterprise features agentscope-ai github" --validation balanced --extra-sources 2 --timeout 90 --format json
smart-search map "https://doc.agentscope.io" --instructions "Find 2.0 intro, architecture, session, tracing, evaluation, pipeline, studio, runtime, migration from 1.x" --max-depth 1 --max-breadth 30 --limit 50 --format json
smart-search fetch "https://docs.agentscope.io/llms.txt" --format markdown
smart-search fetch "https://raw.githubusercontent.com/agentscope-ai/agentscope/main/README.md" --format markdown
smart-search fetch "https://docs.agentscope.io/versions/2.0.7dev/en/others/change-log.md" --format markdown
smart-search fetch "https://docs.agentscope.io/versions/2.0.7dev/en/index.md" --format markdown
smart-search fetch "https://docs.agentscope.io/versions/2.0.7dev/en/deploy/agent-service.md" --format markdown
smart-search fetch "https://runtime.agentscope.io/en/intro.html" --format markdown
```

证据文件目录：`C:\tmp\smart-search-evidence\20260820-agentscope-enterprise-layers\`
