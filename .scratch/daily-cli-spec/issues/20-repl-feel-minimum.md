# 20 — REPL 手感最小集

**Parent:** [spec.md](../spec.md)

**What to build:** 流式 REPL 补上手感最小集：进程内输入历史、粘贴多行合成一条、回合中键盘中断接到已有 Abort、空闲主提示上的斜杠。界面仍是流式 REPL，无新官方槽，循环五事件名不变。此票过且 18、19 已过 = **日常 CLI 闭环**。

**Blocked by:** 16 — 跨进程会话：关掉再开原文还在；18 — Skill：按需指令包能进回合

**Status:** ready-for-agent

- [ ] 输入历史：当前进程；存空闲主提示原始行（含斜杠原文）；不含 ASK、不含 Skill 展开正文。不另做跨进程历史文件
- [ ] 粘贴多行合成一条再交给循环。回合中键盘中断接到已有 Abort，不杀进程。空闲 stdin EOF 退出；`/exit` 随时退出；空闲中断信号不退出进程。ASK 与主提示同一套提交单位
- [ ] 斜杠只在空闲主提示、进 `loop.prompt` 之前拦；ASK 里的 `/` 当正文。未知命令报错不进循环。压缩 / 会话 / 斜杠不经循环总线
- [ ] 斜杠最小集：`/exit`；`/new`、`/resume`、`/session <id>`、`/sessions`；`/skill <name>`（清单命中则立刻 `loop.prompt`：正文在前，name 后文本接后，空 remainder 也立刻交；未知名报错）；`/model`；`/help`（打印本名单，一行一个）。不要 `/compact`、`/mcp`、`/config`、picker
- [ ] `/model` 本会话立刻换模型标识，不重读配置文件、不换插件列表、不改 `llm` 槽、不换 `baseUrl` / API key。只写用户层 settings：`/model` 打印当前 / default / forceDefault；`/model <id>` 本会话与 `default` 写成 `<id>`；`/model <id> --force` 另把 `forceDefault` 写成 `<id>`；`/model --force` 把 `forceDefault` 写成当前会话标识；`/model --unforce` 删除 `forceDefault`
- [ ] 屏幕上能看见思考增量（`assistantDelta` `type: "thinking"`）与工具 `arguments`。无差分 TUI、无完整 readline 选型。用假 `llm` 驱动 stdin/stdout 可单独验手感最小集
