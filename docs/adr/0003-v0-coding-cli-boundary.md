# v0 是流式 REPL coding CLI，MCP 只作工具桥

v0 界面是流式 REPL，不做差分 TUI。默认 `tools` 插件为 `read` / `write` / `edit` / `bash` / `grep` / `glob` 以及问答用 ASK（模型提问、REPL 答复，不是权限确认）。无权限弹窗、无默认沙箱。MCP 只把 server 的 tools 登记进 `tools`，不做 resources/prompts/sampling。不进 v0：浏览器、多智能体与子 agent、IDE 插件、对外发布、plan/todo、后台 bash。
