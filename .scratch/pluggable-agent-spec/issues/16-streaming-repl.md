# 16 — 流式 REPL：人能打完一轮并看见流式输出

**Parent:** [spec.md](../spec.md)

**What to build:** 终端流式 REPL：人的输入变成 `user` 消息交给 `loop`；REPL 只订阅循环打到总线的最小事件集并写到屏幕。本票可用假 `llm`。无差分 TUI，不把回合状态机做进界面。

**Blocked by:** 14 — 默认循环插件：假 `llm` + 假工具跑完一轮

**Status:** resolved

- [x] 人能在 REPL 打完一轮，终端出现助手流式输出
- [x] REPL 不直接打模型、不直接调工具，只装配宿主并把输入交给 `loop`
- [x] 屏幕上的流式与工具起止来自总线最小事件集，而不是第二套回合状态
- [x] 无差分 TUI；测试可喂 stdin、看 stdout，仍走同一宿主接缝

## Answer

`atom-cli` 的 `runRepl` 装配同一宿主、把 stdin 行交给 `loop.prompt`，只订阅循环最小事件集写 stdout：助手 `text` 增量即时上屏，`thinking` 不上屏，工具起止写成 `[工具开始]` / `[工具结束]`。不直接打模型或调工具，无差分 TUI。验收在 `apps/atom-cli/tests/streaming-repl.test.ts`，假 `llm` / 假工具走宿主加载面。默认一条命令装配仍属第 19 票。
