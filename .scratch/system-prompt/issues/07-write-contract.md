# 撰写系统提示合同增量

Type: task
Label: wayfinder:task
Triage: ready-for-agent
Status:
Blocked by: 02, 03, 04, 05, 06

## Question

把本图已锁决策收成一份可交接的短合同，让实现 session 不必再打开每张票猜。

落点：`.scratch/system-prompt/spec.md`。形态沿用日常 CLI：文首链 `CONTEXT.md`，硬权衡进 `docs/adr/`（仅当合同票决定要 ADR），不改写 [日常 CLI 闭环](../daily-cli-spec/spec.md) 正文，只链。调研只链不贴。不发明新决策；缺决策就停并开票，不要补写。

退出：实现者只读这份短合同 + `CONTEXT.md` 就能改 `LlmRequest`、兼容库、循环工厂与 CLI 装配，而不必再问「文件从哪读、默认正文有哪些段、何时重建」。
