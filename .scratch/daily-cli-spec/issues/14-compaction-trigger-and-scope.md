# 压缩何时触发、压什么

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status: resolved
Blocked by: 06

## Question

官方槽 `compact` 已锁：默认循环每次请求 `llm` 前把内存消息列表交给提供方，取只读视图；是否缩短由提供方决定。

**默认提供方何时把视图缩短，压哪些消息、保留哪些？**

前序：[压缩与记忆挂在哪](./06-compaction-and-memory-placement.md)。

至少裁定：

- 自动触发的条件类别（阈值、溢出恢复、仅手动——可多选；不锁具体数字）
- 缩短时压哪一段、必须留下哪一段（例如切点前 vs 尾部；不锁算法）
- 手动压缩（若有）是提供方合同的一部分，还是只属于 REPL 斜杠，本票只锁边界
- 明确没有：提示词模板、token 精确阈值、记忆库、落盘条目形状（落盘见会话票）

不写代码。

## Comments

- Q1：阈值 + 溢出恢复（A+B），不要仅手动。本阶段斜杠最小集没有 `/compact`，日常路径必须能自动缩短。
- Q2：切点前压成摘要，切点后尾部原文保留（A）。切点不得落在一对 tool call / tool result 中间。术语 **切点** 已写入 `CONTEXT.md`。
- Q3：槽增加 `reason`：`threshold` | `overflow`（A）。threshold 可恒等；overflow 必须缩短，已经只剩尾部则失败。
- Q4：槽预留 `manual`，本阶段不加 `/compact`（B）。不改 REPL 最小集。
- Q5：返回视图 + 是否缩短；缩短时带摘要与切点，供循环写压缩事件（B）。槽仍不写盘。
- Q6：默认循环、有 compact 提供方时，溢出则 `reason=overflow` 再 compact、再打一次 llm，最多一次（A）。无提供方不 retry。
- Q7：把「可识别的上下文溢出失败」写进 `llm` 合同，仍不加方法、不加方言字段（B）。对「零增量」的窄修订。兼容库 / `atom-llm` 翻译提供商错误；循环只认合同。
- Q8：溢出 compact 若不能比恒等更短，不打第二次 `llm`，直接把溢出报给用户（A）。
- 结案确认。不另写 ADR。

## Answer

默认 `compact` 提供方按 **阈值 + 溢出恢复** 缩短视图；缩短时 **切点前成摘要、切点后尾部原文保留**。手动压缩只在槽合同里预留，本阶段没有 `/compact`。

### 触发

- **阈值**：默认循环每次请求 `llm` 前调用 `compact(messages, "threshold")`。提供方可返回恒等；超预算才缩短。不锁 token 数字、不锁估算算法、不锁自动开关配置键。
- **溢出恢复**：`llm` 报出合同上可识别的上下文溢出后，再调用 `compact(messages, "overflow")`。必须比恒等更短，否则不再打 `llm`，把溢出交给用户。更短则用新视图再打一次 `llm`，最多一次。没有 `compact` 提供方则不 retry。溢出仍吃**原文内存列表**，不是上一轮视图。
- **手动**：`reason` 含 `"manual"`（低于阈值也缩短）。本阶段 REPL 不加 `/compact`，不改 [REPL 手感最小集](./10-repl-feel-minimum.md)。

### 压什么

- 切点前压成摘要，切点后尾部原文必须保留。切点不得落在一对 tool call / tool result 中间。
- 原文内存列表不改。`compact` 不写盘。缩短时返回视图 + 摘要 + 切点；循环用来写**压缩事件**（落盘字段形状仍见 [跨进程会话合同](./07-session-persistence-contract.md)）。未缩短则不写压缩事件。

### 槽与循环

- `compact` 签名：`messages` + `reason`（`threshold` | `overflow` | `manual`）。返回视图；缩短时附带摘要与切点。
- 默认循环继续可选消费 `compact`。溢出 retry 也在这颗默认循环里。不改 [ADR-0006](../../../docs/adr/0006-default-loop-plugin-closed-set.md) 的闭合集（role / 工具分发 / 五事件名）。循环事件名不扩，压缩过程不上新事件。

### `llm` 失败面（窄修订）

把「可识别的上下文溢出失败」写进 `llm` 合同。仍是 `stream` + Abort，不加方法、不加 usage、不加提供商方言。兼容库 / `atom-llm` 负责翻译提供商错误；循环只认这个失败面。这是对 [提供商兼容包与 llm 槽边界](./11-provider-compat-package-vs-llm-slot.md)「零增量」的有意修订：只加失败可识别性。

### 明确没有

提示词模板、token 精确阈值、自动开关配置键、记忆库、落盘条目形状、本阶段 `/compact`、新循环事件名。

术语 **切点** 已写入 `CONTEXT.md`。
