# 规格文档形态

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status: resolved
Blocked by:

## Question

规格与路线图落在哪些文件，和 `CONTEXT.md` / ADR 怎么分工？

本仓库约定 feature spec 在 `.scratch/<feature>/spec.md`。裁定本图目的地的文档形态：

- 单一 `spec.md` 是否就是目的地，还是还要 `docs/adr/` 里的硬决策。
- `CONTEXT.md` 只保留术语，还是规格允许复述术语。
- 路线图是 spec 的一章，还是独立文件。
- 三份参考系调研笔记如何被规格引用（链接，不粘贴）。

不决定内核内容，不排阶段。

## Answer

目的地是 `.scratch/pluggable-agent-spec/spec.md`。`docs/adr/` 只记硬权衡，规格链接、不抄正文。术语只活在根目录 `CONTEXT.md`，规格使用这些词、文首链术语表、不另建词汇表。路线图是 spec 的一章，不单独成文件。三份调研只链 `research/*.md` 与对应已关票，不贴解剖。装配正文见 [撰写 spec.md](./11-write-spec.md)（堵住默认循环合同）。
