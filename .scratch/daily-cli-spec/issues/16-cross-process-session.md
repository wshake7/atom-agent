# 16 — 跨进程会话：关掉再开原文还在

**Parent:** [spec.md](../spec.md)

**What to build:** 关掉进程再开，能按 id 或当前 cwd 最近一次找回上一会话的原文消息。官方槽 `session` 读写会话日志；默认装配装一颗提供方。裸启动永远新会话。续聊不冻配置。此票退出 = **跨进程会话** 阶段边界。

**Blocked by:** 15 — 分层配置叠出装配

**Status:** resolved

- [x] 点名官方槽 `session`（会话日志）。贡献方是循环外插件，默认装配装一颗。默认循环可选消费：有提供方则追加终态消息，没有则纯内存。不进循环闭合集。内核不加第五件套，不改 `loop` / `tools` / `llm` 语义
- [x] CLI / REPL 能新建、按 id 打开、打开当前 cwd 最近一次、列出会话。裸启动永远是新会话，不会悄悄续上旧对话
- [x] 最小落盘集：三角消息（含推理块、`toolCall`、工具参数与结果、`isError`）；每条 `assistant` 的提供商 / 模型（写盘时盖当时装配标识，不改 `llm` 槽）；时间戳。日志带 cwd 只为索引。每追加一条终态消息就同步追加。不写流式增量。半截流与 Abort 半截助手不落盘
- [x] 恢复：从 `session` load 原文消息，交给默认循环工厂的可选初始列表。`Loop` 仍是 `messages` + `prompt`，不加 `hydrate`。续聊跟当前装配走，不冻写下日志那天的 MCP / 模型快照
- [x] 明确没有：配置快照、文件 checkpoint、记忆库、加密、多机同步、以及把存储引擎与路径格式写成合同。测试不断言存储引擎与路径格式；关掉再开，按 cwd 最近一次或 id 能 load 出原文三角消息

## Comments

实现落在 `atom-session`（官方槽提供方）+ 默认循环可选追加 + CLI `assemble`/`main`。

- 裸启动新会话；`--resume` 打开当前 cwd 最近一次；`--session <id>` 按 id 打开；`--sessions` 列出后退出。斜杠 `/new` `/resume` `/session` `/sessions` 留给票 20。
- 循环工厂吃 `session.current.messages`，`Loop` 仍是 `messages` + `prompt`。压缩事件留给票 17。
- `assemble()` 把会话根指到 `ATOM_AGENT_HOME`；测试只经槽 API 验收，不断言路径格式。
