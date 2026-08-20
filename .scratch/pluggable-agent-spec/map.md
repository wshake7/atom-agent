# 可插拔 Agent 内核规格与迭代路线图

Label: `wayfinder:map`

## Destination

一份可交接实现的**规格 + 分阶段迭代路线图**（本图不写生产代码）：TypeScript 绿场，落在本 monorepo；只偷 pi / DeepSeek Harness / AgentScope 2.0 的原则，不 fork。v0 场景是自己用的 coding CLI agent；可嵌入 Runtime 与多智能体平台是演进路径，内核只为它们留接缝。规格锁死三件事——内核不变量、插件契约、企业能力的阶段边界——不设计完整企业产品。

## Notes

- 领域：内核 / 插件契约 / 阶段边界。术语以根目录 `CONTEXT.md` 为准；新词落地时用 domain-modeling 当场改术语表。
- 每轮决策票默认同时用 grilling 与 domain-modeling；事实票用 research；手感问题再用 prototype。
- 全程中文。指票用标题，不用裸编号。
- 本图只做决策，不实现。实现是图走完之后的另一次努力。
- 三个参考系是对照，不是底座：pi → 内核该有多小；Harness → 什么必须是插件；AgentScope 2.0 → 企业能力如何分层、哪些只需接缝。

## Decisions so far

<!-- 索引：每条已关闭票一行 gist + 链接；细节只活在票里 -->

- [pi 内核解剖](./issues/01-pi-kernel-anatomy.md) — pi 的内核是 `pi-agent-core` 的 `Agent`/`agentLoop`（三角消息 + 可注入 stream/工具/钩子），不是 TUI/MCP/权限/默认 coding 工具。
- [DeepSeek Harness 插件模型](./issues/02-deepseek-harness-plugin-model.md) — 插件即 Cordis 模块；模型/工具/会话/循环/UI 都可换；不可替换的只剩加载器、boot 与事件词汇。
- [AgentScope 2.0 企业能力分层](./issues/03-agentscope-enterprise-layers.md) — 企业能力是 Building Blocks 循环 + Agent Service 托管；Runtime 已并入；内核只需事件/状态/中间件/权限/可调度单元接缝。
- [内核最小闭合集](./issues/04-kernel-minimal-closed-set.md) — 内核是宿主四件套（注册/注入/生命周期/事件原语）；循环是插件；发现与业务事件名不进核。
- [插件契约：可替换面](./issues/05-plugin-contract-replaceable-surface.md) — 插件同构；v0 官方槽 `loop`/`tools`/`llm`（可加不可改）；同进程加载；内置工具走 `tools` 槽。
- [v0 Coding CLI 产品边界](./issues/06-v0-coding-cli-product-boundary.md) — 流式 REPL；默认工具四件套+搜索+ASK；MCP 只作工具桥；无权限弹窗；无 TUI/浏览器/多智能体/IDE。
- [企业能力阶段切分与内核接缝](./issues/07-enterprise-stage-cuts-and-seams.md) — 核不再预埋接缝；可嵌入/会话/可观测/沙箱/多智能体为后续阶段；评测与部署不进规格。
- [路线图阶段与退出条件](./issues/08-roadmap-phases-and-exit-criteria.md) — 六段到 v0 闭环（宿主→循环→llm→REPL→工具包→MCP 桥）；其后加槽不排序。
- [规格文档形态](./issues/09-spec-document-shape.md) — 目的地是 `spec.md`；ADR 只链；术语只在 CONTEXT；路线图为一章；调研只链不贴。
- [默认循环插件最小闭合集](./issues/10-default-loop-plugin-closed-set.md) — 三角 role + 推理块；分发/流式/Abort 在循环内；只消费 `llm`；内存会话；锁最小业务事件名。
- [撰写 spec.md](./issues/11-write-spec.md) — 目的地已写成 [spec.md](./spec.md)。

## Not yet specified

- 包布局（内核 / CLI / 内置插件如何切 package）
- 模型供应商抽象（`llm` 槽已点名；OpenAI 兼容面、多提供商未锁）
- 权限与沙箱（后续阶段才加槽或提供方；本图不点名）
- 上下文压缩与记忆挂在循环插件上还是独立插件
- Skill 是否独立于插件与工具（术语未决，勿先当架构）
- 会话持久化形态（后续阶段，本图不锁）
- 多智能体协议（后续阶段，本图不锁）
- 插件发现与组成的具体机制（契约只锁进程内加载面；目录 / npm / preset 未锁）
- Agent 测试怎么写（评测平台不进规格）
- 可观测如何消费事件总线（后续阶段；业务事件名不在核内）
- 循环插件手感验证原型（本图不必；spec 之后若还要再开）
- `llm` 槽的提供商方言（OpenAI 兼容形态未锁）

## Out of scope

- 在本图内实现生产 agent 系统（目的地是规格与路线图）
- 完整企业产品：多租户、RBAC、部署拓扑、计费
- fork 或移植 pi、DeepSeek Harness、AgentScope
- Python 实现
- 把 v0 做成可嵌入 Runtime 或多智能体平台
- 权限确认环、评测平台、部署/AaaS/多租户（本规格不管）
