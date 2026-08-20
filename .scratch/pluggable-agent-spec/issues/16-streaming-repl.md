# 16 — 流式 REPL：人能打完一轮并看见流式输出

**Parent:** [spec.md](../spec.md)

**What to build:** 终端流式 REPL：人的输入变成 `user` 消息交给 `loop`；REPL 只订阅循环打到总线的最小事件集并写到屏幕。本票可用假 `llm`。无差分 TUI，不把回合状态机做进界面。

**Blocked by:** 14 — 默认循环插件：假 `llm` + 假工具跑完一轮

**Status:** ready-for-agent

- [ ] 人能在 REPL 打完一轮，终端出现助手流式输出
- [ ] REPL 不直接打模型、不直接调工具，只装配宿主并把输入交给 `loop`
- [ ] 屏幕上的流式与工具起止来自总线最小事件集，而不是第二套回合状态
- [ ] 无差分 TUI；测试可喂 stdin、看 stdout，仍走同一宿主接缝
