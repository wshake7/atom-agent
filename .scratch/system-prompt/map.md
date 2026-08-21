# 极简系统提示

Label: `wayfinder:map`

## Destination

atom 日常 CLI 的默认回合把由 **装配** 拼成的 **系统提示** 经模型端口可选字段送给模型：含默认短身份、当前工具名、Skill 清单、以及 `SYSTEM.md` / `APPEND_SYSTEM.md` / `AGENTS.md`。三角消息与会话日志不出现 system role。本图把实现前该拍的板拍完；图走完再改代码。

## Notes

- 领域：日常 CLI 产品面的系统提示。术语以根目录 `CONTEXT.md` 为准（已加 **系统提示** / **默认模板** / **系统提示文件**）；新词落地时用 domain-modeling 当场改术语表。
- 每轮决策票默认同时用 grilling 与 domain-modeling；事实票用 research。
- 全程中文。指票用标题，不用裸编号。
- 本图只做决策，不实现。实现是图走完之后的另一次努力。目的地是落地改动，所以决策必须细到能直接开工。
- 对照 [日常 CLI 闭环规格](../daily-cli-spec/map.md) 与 [可插拔 Agent 内核规格与迭代路线图](../pluggable-agent-spec/map.md)。不改写已关闭规格正文。v0 不变量继续有效：内核四件套、官方槽五颗不新加、三角 role 不扩、无差分 TUI。
- 对照 pi 的 `AgentContext.systemPrompt` + coding-agent `buildSystemPrompt`，不 fork，不做子 agent。
- 图表前已锁：目的地是落地路径上的决策（不是再写一份日常 CLI 规格）；东西是系统提示不是第二套循环；`LlmRequest` 增加可选 `systemPrompt`，兼容库只在线上译成 `role: "system"`；由 CLI 装配拼装；第一刀含身份 + 工具名 + Skill 清单 + 三类文件；系统提示不进会话日志。

## Decisions so far

<!-- 索引：每条已关闭票一行 gist + 链接；细节只活在票里 -->

- [pi 系统提示文件的搜索与合并](./issues/01-pi-system-prompt-files.md) — 默认模板或 SYSTEM.md 二选一，再 append、AGENTS 链、需 read 的 Skill catalog、cwd；JSONL 不存这根字符串
- [Atom 系统提示文件的搜索根与叠法](./issues/02-atom-prompt-file-search.md) — 用户根+`.atom-agent/`：SYSTEM 近处 XOR 整份默认模板，APPEND 远→近全追加；裸 AGENTS.md 同序全追加（不认 CLAUDE.md）；argv 两开关；启动读一次
- [默认正文骨架](./issues/03-default-prompt-skeleton.md) — 默认模板=身份+工具表+guidelines；XOR 后 APPEND→AGENTS→Skill XML→cwd；无日期；默认工具 description 改英文

## Not yet specified

## Out of scope

- 第二套循环 / 子 agent / 名为 system agent 的运行时
- 新官方槽（`prompt` / `system` / `skills`）
- 把系统提示当三角消息或会话日志条目落盘
- 改写 [日常 CLI 闭环](../daily-cli-spec/spec.md) 或 [v0 规格](../pluggable-agent-spec/spec.md) 正文
- 本图内写生产代码
- 把 MCP 工具描述塞进系统提示
- 差分 TUI、权限弹窗、记忆库、可嵌入 Runtime、多智能体
- Prompt templates / themes（pi 的 `/name` 用户提示文件，不进系统提示拼装）
