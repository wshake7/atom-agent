# AgentScope 2.0 企业能力分层

Type: research
Label: wayfinder:research
Triage: ready-for-agent
Status: resolved
Blocked by:

## Question

AgentScope 2.0 自称的企业级能力，**实际分层是什么：哪些必须进运行时，哪些是框架，哪些是运维/产品**？

必须从官方 2.0 文档与仓库取证（注意 1.x 与 2.0 的断裂）。至少回答：

1. 权威文档/仓库与 2.0 相对 1.x 的架构变化（只记与分层有关的）。
2. 能力清单：多智能体编排、会话/状态、追踪与可观测、评测、工具生态、部署、人机协同……以官方模块名为准。
3. 每一项依赖运行时的哪些原语（事件、消息总线、会话存储、agent 作为可调度单元……）。
4. 哪些能力明显是产品/运维，不该污染内核。
5. 若只要「以后能长出这些」而不实现它们，内核最少要露出哪些接缝。

产出带引用的调研笔记，供「企业能力阶段切分与内核接缝」对照。不要排我们的阶段。

## Answer

AgentScope 2.0 的企业能力官方切成 Building Blocks（`Agent` 无状态循环 + 事件/中间件/权限/Workspace）与 Agent Service（`create_app` 多租户托管）；独立 Runtime 仓已归档并入主仓。1.x 的 MsgHub/pipeline、焊在 Agent 上的 OTel、`print`、嵌套 state_dict 被拆掉；生产多智能体是服务层 Agent Team（inbox + wakeup），评测/Studio 不再是 2.0 一等文档。循环必须留下事件流、可序列化 `AgentState`、中间件钩、权限三态、可调度 Agent；FastAPI/Redis/Hub/频道/Web UI/沙箱后端是产品运维，不该进内核。接缝观察见笔记，本票不排阶段。笔记：[AgentScope 2.0 企业能力分层](../research/agentscope-enterprise-layers.md)。
