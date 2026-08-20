# v0 Coding CLI 产品边界

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status: resolved
Blocked by: 01, 04

## Question

v0 作为**自己用的 coding CLI agent**，产品边界画在哪——以及哪些东西即使 v0 要用，也必须以插件交付？

至少裁定：

- 界面：纯 REPL / 极简 TUI / 以后再说。
- v0 必须能做的事：读改仓库、跑命令、搜代码……的最小清单。
- 权限与破坏性操作：v0 要不要锁策略，还是只留接缝。
- 明确不进 v0 的：MCP 宿主、浏览器、多智能体、IDE 插件、对外发布。

不锁插件加载实现，不排企业阶段。

## Answer

界面：流式 REPL，无差分 TUI。默认 `tools` 插件：`read` / `write` / `edit` / `bash` / `grep` / `glob` / ASK；ASK 是问答工具（模型提问，人在 REPL 答复成 `toolResult`），不拦截写文件或 bash。权限：v0 不管，无弹窗、无默认沙箱。MCP：一颗默认可关插件，只把 MCP server 的 tools 登记进 `tools`，不做 resources / prompts / sampling。

不进 v0：浏览器、多智能体与子 agent、IDE 插件、对外发布、plan/todo 内置、后台 bash。ADR：[v0 是流式 REPL coding CLI，MCP 只作工具桥](../../../docs/adr/0003-v0-coding-cli-boundary.md)。
