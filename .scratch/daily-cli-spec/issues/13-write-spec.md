# 撰写日常 CLI 闭环 spec.md

Type: task
Label: wayfinder:task
Triage: ready-for-agent
Status: resolved
Blocked by: 05, 06, 07, 08, 09, 10, 11, 12, 14

## Question

把已锁决策装配成目的地文件 `.scratch/daily-cli-spec/spec.md`。

约束：

- 中文。文首链根目录 `CONTEXT.md`，不复述术语定义。
- 决策从已关票的 Answer 与 `docs/adr/` 抽取并链接，不把 ADR 正文粘进来。
- 含「实现路线图」一章，内容来自 [日常 CLI 闭环的退出条件](./05-daily-cli-exit-criteria.md)，不另建 `roadmap.md`。
- 调研只链 `research/*.md` 与对应已关票，不贴解剖。
- 链到 v0 规格 [spec.md](../../pluggable-agent-spec/spec.md)，不改写它。
- 不写生产代码。

## Answer

已装配 [spec.md](../spec.md)。术语链 `CONTEXT.md`；ADR 只链；路线图为独立一章，内容来自 [日常 CLI 闭环的退出条件](./05-daily-cli-exit-criteria.md)；调研只链 `research/*.md` 与对应已关票。链到 [v0 规格](../../pluggable-agent-spec/spec.md)，未改写。未发明新决策。
