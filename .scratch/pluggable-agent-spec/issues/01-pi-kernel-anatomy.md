# pi 内核解剖

Type: research
Label: wayfinder:research
Triage: ready-for-agent
Status: resolved
Blocked by:

## Question

pi（Mario Zechner 的极简 coding agent，常见仓库名含 `pi-mono` / `pi-coding-agent`）的**内核实际装了什么、故意没装什么**？

必须从上游源码与第一方说明取证，不要转述博客。至少回答：

1. 权威仓库、语言、大致模块/文件规模。
2. 一次回合的运行闭环：消息、模型调用、工具执行、流式、取消，各在哪一层。
3. 内核类型（消息、工具、会话）的最小集合。
4. 扩展点：有没有插件/钩子/工具注册面；若有，边界在哪。
5. 作者明确排除在核心之外的东西（TUI、MCP、权限、压缩……）。
6. 对「极简」可操作的约束：什么变化会破坏 pi 之所以小。

产出一份带引用的调研笔记，供后续「内核最小闭合集」对照，不在本票做我们的内核决策。

## Answer

pi 的权威仓库是 TypeScript monorepo https://github.com/earendil-works/pi（历史名 `badlogic/pi-mono`）；真正的回合内核是 `@earendil-works/pi-agent-core` 的 `Agent`/`agentLoop`，不是整个 coding CLI。一次回合：产品把消息交给 `Agent.prompt` → 循环调注入的 `streamFn`（`pi-ai`）做流式模型调用 → 校验并执行 `AgentTool` → `toolResult` 再转；取消是 `AbortController`。内核类型最小集是 LLM 三角消息（user/assistant/toolResult）、可扩展 `AgentMessage`、`AgentTool`/`AgentContext`；会话 JSONL 与默认四工具（read/write/edit/bash）在 coding-agent。扩展面是循环钩子（`convertToLlm`/`beforeToolCall`/…）加上进程内 TS Extensions，没有 MCP 宿主。作者明确排除 MCP、子 agent、权限弹窗、plan、todo、后台 bash；TUI 独立成 `pi-tui`；压缩是产品层而非循环必选。破坏「小」的变化：把提供商、具体工具、权限或 TUI 焊进 `agentLoop`。笔记：[pi 内核解剖](../research/pi-kernel-anatomy.md)。
