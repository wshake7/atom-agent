# 14 — 默认循环插件：假 `llm` + 假工具跑完一轮

**Parent:** [spec.md](../spec.md)

**What to build:** 默认循环占 `loop` 槽，可整颗替换。用假 `llm` 与假工具经宿主跑完一轮「模型 ↔ 工具」：三角消息、推理块保留并可回放、默认串行工具批、流式消费、Abort、最小事件集（turn 开始/结束、助手流式、工具开始/结束）打到匿名总线。不内置提供商，不写 CLI，不动真实仓库。

**Blocked by:** 13 — 宿主：无循环也能加载、卸载、发匿名事件

**Status:** resolved

- [x] 宿主只装默认循环 + 假 `llm` + 假 `tools` 即可跑完一轮；循环不内置提供商
- [x] 消息 role 只有 `user` / `assistant` / `toolResult`；推理块是 `assistant` 内容块，后续模型调用能回放
- [x] 工具分发读 `tools` 槽、校验、执行，默认串行批；流式与 Abort 发生在循环内
- [x] 当前运行只有内存消息列表；总线上能观察到 turn 开始/结束、助手流式、工具开始/结束
- [x] 测试只走宿主加载面，不测循环内部调度器

## Answer

`atom-loop` 占 `loop` 槽，`inject: ["llm", "tools"]`，不内置提供商。`Loop.prompt` 在内存消息列表上跑「模型 ↔ 工具」直到无 toolCall 或 Abort：三角 role、推理块作为 `assistant` 的 `thinking` 块回放、读 `tools.list()` 校验并串行执行、流式消费 `llm.stream`。最小事件集打到宿主匿名总线（`loop/turn-start|end`、`loop/assistant-delta`、`loop/tool-start|end`）。验收在 `packages/atom-loop/tests/loop-round.test.ts`，只经 `createPluginHost().load`。
