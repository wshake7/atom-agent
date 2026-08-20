# 默认循环插件最小闭合集

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status: resolved
Blocked by: 04

## Question

内核已锁成插件宿主。v0 要能完成「模型 ↔ 工具」回合，**默认循环插件**里必须留下什么？其余降为别的插件或接缝。

检验：删掉它就无法完成一次回合的，才进这颗插件。至少裁定：

- 消息类型最小集（是否就是 user / assistant / toolResult）。
- 工具调度（分发、并行/串行、校验）是否在循环插件内。
- 流式消费与取消（Abort）是否在循环插件内。
- 模型调用是循环插件上的端口，还是另一颗插件。
- 会话对象是否在循环插件内；持久化是否只是接缝。
- 回合业务事件名（`turn_start` 一类）是否由这颗插件的契约锁死。

不锁插件加载方式，不锁 CLI，不排企业阶段。

## Answer

默认循环占 `loop`，闭合集如下。ADR：[默认循环插件：三角消息 + 推理块 + 回合机械装置](../../../docs/adr/0006-default-loop-plugin-closed-set.md)。

- **消息：** role 三角 `user` / `assistant` / `toolResult`。推理块是 `assistant` 内容块（非第四 role），必须保留并可回放，对齐 pi / Harness。
- **机械装置：** 工具分发（读 `tools` 槽、校验、执行）、流式、Abort 都在循环内。默认串行工具批。
- **模型：** 只消费 `llm` 槽（须可流式、可 Abort）；无内置提供商。OpenAI 兼容形态仍不锁。
- **会话：** 仅当前运行的内存消息列表；持久化是后续阶段。
- **事件：** 循环契约锁最小集并打到内核匿名总线：turn 开始/结束、助手流式、工具开始/结束。完整可观测 schema 仍是后续阶段。
- **不进闭合集：** 压缩、记忆、图片一等化、并行工具批、发现/CLI。
