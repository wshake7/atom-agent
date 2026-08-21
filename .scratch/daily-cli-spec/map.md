# 日常 CLI 闭环规格

Label: `wayfinder:map`

## Destination

一份可交接的**日常 CLI 闭环**规格（本图不写生产代码）：作者愿意把 v0 这套 coding CLI 当天天用。覆盖长上下文、跨进程会话、装配与配置、Skill、REPL 手感、提供商兼容包；不改写 [v0 spec](../pluggable-agent-spec/spec.md)，不把提供商方言锁进 `llm` 槽，不做可嵌入 Runtime / 多智能体。

## Notes

- 领域：日常 CLI 阶段边界。术语以根目录 `CONTEXT.md` 为准；新词落地时用 domain-modeling 当场改术语表。
- 每轮决策票默认同时用 grilling 与 domain-modeling；事实票用 research。
- 全程中文。指票用标题，不用裸编号。
- 本图只做决策，不实现。实现是图走完之后的另一次努力。
- v0 不变量继续有效：内核四件套、官方槽 `loop` / `tools` / `llm` 语义不改、流式 REPL、无差分 TUI。本阶段允许为退出条件要求的能力点名新官方槽，禁止预埋空槽，内核不加第五件套。
- 提供商兼容在**新包**实现，不锁进 `llm` 槽合同。`llm` 仍是可流式、可 Abort 的端口。
- 规格落点：`.scratch/daily-cli-spec/spec.md`。形态沿用 v0：文首链 `CONTEXT.md`，硬权衡进 `docs/adr/`，路线图是 spec 一章，调研只链不贴。旧 spec 只链、不改写。
- `CONTEXT.md` 里「插件」的 `_Avoid_: Skill` 的意思是**不要把插件叫成 Skill**，不是禁止 Skill 这个概念。**Skill** 已是独立词，见术语表。
- 对照上一张图：[可插拔 Agent 内核规格与迭代路线图](../pluggable-agent-spec/map.md)。

## Decisions so far

<!-- 索引：每条已关闭票一行 gist + 链接；细节只活在票里 -->

- [Skill 在主流 coding agent 里是什么](./issues/01-skill-in-coding-agents.md) — 四家都有 Skill：带 `SKILL.md` 的按需指令包，不是 MCP、不是默认工具、也不是插件容器。
- [长上下文：压缩与记忆怎么挂](./issues/02-context-compaction-in-coding-agents.md) — 压缩改下一轮模型可见历史，不是 persistence API；记忆和会话落盘是另两件事。
- [跨进程会话常见合同](./issues/03-session-persistence-in-coding-agents.md) — 三家都是本地 JSONL 对话日志 + 按 cwd/id 找回；压缩改送给模型的视图，跨会话记忆是旁路存储。
- [装配与配置：项目级和用户级从哪来](./issues/04-assembly-config-in-coding-agents.md) — 用户默认 + 项目覆盖；Claude/Codex 有插件市场（本图不做）；pi 无内置 MCP，扩展是本地/install。
- [日常 CLI 闭环的退出条件](./issues/05-daily-cli-exit-criteria.md) — 四段：装配与配置 → 跨进程会话 → 长上下文（压缩）→ Skill · 兼容包 · REPL 手感；最后一段退出即闭环。记忆明确没有。允许为退出条件点名新官方槽。
- [压缩与记忆挂在哪](./issues/06-compaction-and-memory-placement.md) — 新官方槽 `compact`：只读视图变换；不进默认循环闭合集；记忆不挂槽。
- [跨进程会话合同](./issues/07-session-persistence-contract.md) — 新官方槽 `session`：日志含三角消息、压缩事件、模型标识与时间戳；循环可选追加；CLI 按 cwd/id 恢复；不冻配置。
- [装配与配置形态](./issues/08-assembly-and-config-shape.md) — CLI 读 JSON 分层配置（非槽）；git 根→cwd 项目链 + cwd 本机覆盖；MCP sidecar；工具 allow/deny；写死默认集合；锁 `skills/` 搜索根；无本地 `plugins/` 扫描、无 hooks、无 `config` 槽。
- [Skill 是否独立于插件与工具](./issues/09-skill-vs-plugin-vs-tool.md) — Skill 是按需指令包，不是插件也不是业务工具；装配扫一层 `SKILL.md`，默认集合一颗加载器登记 `skill({ name })`；无 `skills` 槽。
- [REPL 手感最小集](./issues/10-repl-feel-minimum.md) — 进程内输入历史、粘贴多行一条、键盘 Abort；斜杠最小集含会话四条、`/skill`、`/model`（用户层 `default`/`forceDefault`）、`/help`；循环五事件名不扩，屏幕加思考增量与工具参数。
- [提供商兼容包与 llm 槽边界](./issues/11-provider-compat-package-vs-llm-slot.md) — 兼容库只做 OpenAI `chat/completions` SSE；`atom-llm` 变薄插件做槽翻译；`llm` 零增量、无新槽；`/model` 改装配活标量。
- [本阶段点哪些官方槽](./issues/12-official-slots-this-stage.md) — 官方槽五颗：v0 的 `loop` / `tools` / `llm` 加 `compact` / `session`；名单关闭；未点名键仍允许；无空槽占位。
- [压缩何时触发、压什么](./issues/14-compaction-trigger-and-scope.md) — 默认提供方：阈值 + 溢出恢复；切点前摘要、尾部原文；`reason` 含 manual 但本阶段无 `/compact`；`llm` 失败面可识别上下文溢出。
- [撰写日常 CLI 闭环 spec.md](./issues/13-write-spec.md) — 已装配 `.scratch/daily-cli-spec/spec.md`；四段路线图在规格里；未发明新决策。

## Not yet specified

## Out of scope

- 在本图内实现生产代码（目的地是规格）
- 可嵌入 Runtime、多智能体平台
- 危险操作确认、权限系统、沙箱
- 并行工具批、图片一等化
- plan/todo、后台 bash
- 差分 TUI
- npm / 远程插件市场协议
- 本地 `plugins/` 目录扫描（后续图，不进本图目的地）
- hooks（后续图；本图目录也不扫）
- 把提供商方言锁进 `llm` 槽
- 改写 v0 规格、改官方三槽语义、内核第五件套
- 完整企业产品：多租户、RBAC、部署、计费
- 跨会话记忆（旁路存储）——长上下文簇只含压缩；本图不设计记忆库。已关决策见 [日常 CLI 闭环的退出条件](./issues/05-daily-cli-exit-criteria.md)
