# 提供商兼容包与 llm 槽边界

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status: resolved
Blocked by:

## Question

提供商兼容（OpenAI 兼容 HTTP 等）落在**新包**，**不锁进 `llm` 槽**。这个包和槽、和现有 `atom-llm` 的边界是什么？

已锁偏好：方言是新包的事；`llm` 仍只是可流式、可 Abort 的端口。v0 的 `atom-llm` 已经把 `{baseUrl}/chat/completions` 写在适配器里——本票要决定是拆出去、还是让 `atom-llm` 变成薄插件去依赖新包。

至少裁定：

- 新包是纯客户端库，还是一颗占 `llm` 槽的插件，还是库 + 插件分两包
- `llm` 槽合同增加什么、明确不增加什么（提供商名字、baseUrl、协议版本都不进槽）
- 默认装配如何挂上新包，而不把方言泄漏给循环插件
- 本阶段要锁「能接上至少一种兼容面」，还是「多提供商市场」（后者本图默认不要）
- 明确没有：计费、提供商账号体系、把方言字段加进官方槽

不写代码。不实现这个包。

## Comments

- Q1：库 + 薄插件。新包只懂兼容面；`atom-llm` 收成薄插件，只 `provide("llm")` 并依赖新包（C）。
- Q2：`llm` 槽零增量。明确不进槽：提供商名、baseUrl、协议版本、usage、原始 SSE、方言键、`listModels`、`LlmRequest.model`（A）。
- Q3：锁「至少一种兼容面」；多提供商市场明确没有（A）。
- Q4：这一种 = OpenAI 兼容 `{baseUrl}/chat/completions` 流式 SSE；Anthropic / Gemini 原生本图不做（A）。
- Q5：兼容库不认识槽类型；`atom-llm` 做槽形状 ↔ 兼容面翻译（B）。
- Q6：默认集合只装薄 `atom-llm`；兼容库是依赖不是插件；本簇不点名新官方槽（A）。
- Q7：只有 `atom-llm` 与兼容库自己的测试可 import；循环 / CLI / REPL / 工具 / Skill / `compact` / `session` 禁止（A）。
- Q8：配置不加 `provider` / `protocol` / 路径覆盖；三标量仍走 [装配与配置形态](./08-assembly-and-config-shape.md)（A）。
- Q9：装配传入已解析三标量；兼容库只吃调用参数，不读 settings、不读 `process.env`；插件只信 options（A）。
- Q10：术语 **兼容库**；npm 包名不锁。已写入 `CONTEXT.md`（A）。
- Q11：装配持有本进程可变三标量；`/model` 只改其中 `model`（写盘仍按 [REPL 手感最小集](./10-repl-feel-minimum.md)）；薄插件每次调兼容库读当前值。`Llm` 不加方法，不新增未点名键（A）。
- 结案确认。不另写 ADR。
- 后续修订：[压缩何时触发、压什么](./14-compaction-trigger-and-scope.md) 把「可识别的上下文溢出失败」写进 `llm` 合同（仍不加方法、不加方言）。本票「零增量」不再覆盖失败面。

## Answer

**兼容库**实现一种提供商兼容面：OpenAI 兼容 `{baseUrl}/chat/completions` 流式 SSE（含现有思考字段映射，仍留在库内）。不是插件，不占槽。口语「提供商兼容包」同义。术语已写入根目录 `CONTEXT.md`。npm 包名本票不锁。不写代码、本图不实现该库。

**`atom-llm` 变薄插件**：只 `provide("llm")`。把槽形状（`LlmRequest` / `LlmChunk`）译成兼容面形状，再调兼容库。兼容库不依赖内核、循环或槽类型。

**`llm` 槽零增量**：仍是可流式、可 Abort 的 `stream`。不加提供商名、baseUrl、协议版本、usage、原始 SSE、方言键、发现面，也不给请求加 `model`。循环只认槽，禁止 import 兼容库。

**装配**：默认集合仍只装这颗薄插件；兼容库是它的依赖，不进 `createDefaultPlugins()` 列表。本簇不点名新官方槽（[本阶段点哪些官方槽](./12-official-slots-this-stage.md) 的兼容包默认成立）。CLI 把已叠好的 `model` / `baseUrl` / `apiKey` 交给 `createLlmPlugin`。只有 `atom-llm` 与兼容库自己的测试可以 import 该库；CLI、REPL、`loop`、工具、Skill 加载器、`compact`、`session` 都不直接依赖。

**配置**：仍是上述三标量，不加 `provider`、`protocol`、`api`、协议版本或路径覆盖。端点去尾斜杠后拼 `/chat/completions` 是兼容库内部的事。日常 CLI 路径上，装配传入已解析三标量；兼容库只吃调用参数，不读 settings、不读 `process.env`；薄插件只信这份 options。缺任一标量则启动失败。优先级链仍见 [装配与配置形态](./08-assembly-and-config-shape.md)。

**`/model`**：装配持有本进程一份**可变**的已解析三标量。斜杠只改其中的 `model`（写盘合同不变，见 [REPL 手感最小集](./10-repl-feel-minimum.md)）。薄插件每次调用兼容库时读**当前**三标量，不是启动快照。不换插件列表、不改 `llm` 槽、不换 `baseUrl` / API key。`Llm` 不加方法，不另贡献未点名键。

**本阶段没有**：多提供商市场、计费、提供商账号体系、第二家原生协议、把方言字段锁进官方槽、改写 v0 规格。

不改 [v0 spec](../../pluggable-agent-spec/spec.md)。v0 里「OpenAI 兼容形态另开努力」由本票在日常 CLI 规格里收口。
