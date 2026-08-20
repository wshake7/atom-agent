# 撰写 spec.md

Type: task
Label: wayfinder:task
Triage: ready-for-agent
Status: resolved
Blocked by: 10

## Question

把已锁决策装配成目的地文件 `.scratch/pluggable-agent-spec/spec.md`。

约束（见 [规格文档形态](./09-spec-document-shape.md)）：

- 中文。文首链根目录 `CONTEXT.md`，不复述术语定义。
- 决策从已关票的 Answer 与 `docs/adr/` 抽取并链接，不把 ADR 正文粘进来。
- 含「实现路线图」一章，内容来自 [路线图阶段与退出条件](./08-roadmap-phases-and-exit-criteria.md)，不另建 `roadmap.md`。
- 参考系只链 `research/pi-kernel-anatomy.md`、`research/deepseek-harness-plugin-model.md`、`research/agentscope-enterprise-layers.md`。
- 等 [默认循环插件最小闭合集](./10-default-loop-plugin-closed-set.md) 关闭后再写循环合同；未关则本票不可做。
- 不写生产代码。

## Answer

已装配 [spec.md](../spec.md)。术语链 `CONTEXT.md`；ADR 只链；路线图为第 8 章；调研只链 `research/*.md`。未发明新决策。
