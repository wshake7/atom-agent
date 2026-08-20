# 企业能力阶段切分与内核接缝

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status: resolved
Blocked by: 03, 04

## Question

AgentScope 2.0 对照清单里，哪些能力变成路线图上的**后续阶段**，内核现在必须露出哪些**接缝**，哪些彻底不进这张规格？

至少裁定：

- 可观测/追踪、会话持久、评测、多智能体编排、人机协同、部署——各自是「接缝 / 独立阶段 / 本规格不管」。
- 每条接缝的稳定原语叫什么（对照 `CONTEXT.md`，缺词就补）。
- 禁止：为尚未开始的阶段在内核里预实现功能。

不写企业产品设计，不锁 v0 CLI 功能清单。

## Answer

内核不再额外凿接缝。后续形态只靠已锁宿主 + 官方槽可加不可改。本图不点名 `session` / `sandbox` / `telemetry` 等未来槽。ADR：[企业能力靠加槽长出来，不在内核预埋接缝](../../../docs/adr/0004-enterprise-is-later-phases-not-kernel-seams.md)。

后续阶段（本图不设计）：可嵌入 Runtime（同一宿主当库）、会话持久、可观测/追踪（消费事件总线原语）、权限/沙箱、多智能体编排（不锁协议）。

本规格不管：权限确认环（v0 问答 ASK 不是这个）、评测平台、部署/AaaS/多租户。循环内消息/事件合同见 [默认循环插件最小闭合集](./10-default-loop-plugin-closed-set.md)。
