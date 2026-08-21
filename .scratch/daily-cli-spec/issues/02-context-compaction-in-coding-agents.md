# 长上下文：压缩与记忆怎么挂

Type: research
Label: wayfinder:research
Triage: ready-for-agent
Status: resolved
Blocked by:

## Question

主流 coding agent 的**长上下文**（压缩 / compaction / memory）挂在哪一层、何时触发、压的是什么？

必须从上游源码与第一方文档取证。至少对照：

1. pi 的 compaction / 上下文管理（产品层还是循环内核）
2. Claude Code 的 auto-compact / memory
3. DeepSeek Harness 若有压缩或记忆插件
4. Codex CLI 若有 documented 的上下文管理

每家回答：触发条件、输入（整段消息？工具结果？）、输出（摘要消息？旁路记忆？）、能否关、和会话持久化是否同一件事。

产出带引用的调研笔记，供后续「压缩与记忆挂在哪」对照。不在本票决定我们挂循环、独立插件还是新槽。

## Answer

压缩改的是「下一轮模型可见历史」，记忆（若有）和会话落盘是另两件事。四家都不把 compaction 当成 persistence API。

- **pi**：产品层（coding-agent），循环只留 `transformContext`。阈值 / 溢出 / `/compact`；输入切点前的消息（摘要时 tool 结果截 2k）；输出 JSONL 追加 `compaction` 条目，LLM 看摘要+保留尾；`enabled: false` 关自动、手动仍可。原文仍在会话树。
- **Claude Code**：会话产品行为 + `PreCompact`/`PostCompact`。接近窗口 auto、`/compact`；输出替换对话为摘要，再从磁盘注入 `CLAUDE.md`/auto memory。auto memory 可关；auto-compact 只能调窗口或 hook 拦截，官方 env **无**总关。transcript ≠ memory。
- **DeepSeek Harness**：可选接缝 `ctx.compaction`，不是 loop 脊柱。压力 / 溢出 / `/compact`；surface replace 成 user 摘要，log 保留原文；`auto: false` 或卸插件可关。无官方 memory 插件（仅默认关的 MCP 示例）。持久化是 `sessionPersistence`。
- **Codex CLI**：core 的 compact session task。阈值或满窗口自动，手动 `/compact` / `thread/compact/start`；替换活动 history 并写 rollout `CompactedItem`。memories 是启动后旁路抽取。无文档化的一键关自动压缩。

笔记：`.scratch/daily-cli-spec/research/context-compaction-in-coding-agents.md`
