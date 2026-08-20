# 19 — v0 默认装配：一条命令起真实 CLI

**Parent:** [spec.md](../spec.md)

**What to build:** CLI 用写死的默认插件列表装配：真 `llm` + 默认循环 + 默认工具包 + 流式 REPL，MCP 桥默认可关。作者一条命令即可在当前仓库里流式改代码。此票退出 = **v0 产品闭环**。发现机制（目录 / npm / preset）仍不做。

**Blocked by:** 15 — 真模型接到 `llm` 槽；16 — 流式 REPL：人能打完一轮并看见流式输出；17 — 默认工具包：读改仓库、跑命令、搜索、问答；18 — MCP 工具桥：登记后的工具能被循环调用

**Status:** resolved

- [x] 一条命令启动默认装配：宿主 + 默认循环 + 真 `llm` + 默认工具包 + 流式 REPL
- [x] MCP 桥可关可开；开时登记的工具能在同一 REPL 回合里被调用
- [x] 官方槽 `loop` / `tools` / `llm` 语义未被改写；内核仍无第五件套
- [x] 无差分 TUI、无权限弹窗、无浏览器/多智能体/IDE；此票完成即 v0 产品闭环

## Answer

`atom-cli` 用写死的 `createDefaultPlugins()` 装配宿主：真 `llm`、默认工具包、默认可关的 MCP 桥、默认循环，再交给流式 REPL。一条命令：`just atom`、`vp run atom-cli#start` 或包内 `bin` `atom`。`--no-tools` 关掉默认工具包；`--mcp <command> [args...]` 打开桥，登记的工具可在同一 REPL 回合被调用。ASK 由 REPL 下一行答复。不改官方槽语义，内核无第五件套，无发现机制 / TUI / 权限弹窗。验收在 `apps/atom-cli/tests/default-assembly.test.ts` 与 `argv.test.ts`，假 `llm` 仍走宿主加载面。
