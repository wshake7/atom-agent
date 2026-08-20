# 15 — 真模型接到 `llm` 槽

**Parent:** [spec.md](../spec.md)

**What to build:** 一颗默认可关的 `llm` 适配器接到 `llm` 槽，默认循环对真实模型跑通一轮（可流式、可 Abort）。提供商方言留在适配器内，不进入内核或官方槽语义，不做多提供商市场。

**Blocked by:** 13 — 宿主：无循环也能加载、卸载、发匿名事件；14 — 默认循环插件：假 `llm` + 假工具跑完一轮

**Status:** resolved

- [x] 默认循环消费 `llm` 槽上的真实适配器，完成至少一轮真实模型调用
- [x] 该端口可流式、可 Abort；Abort 能中止进行中的调用
- [x] 提供商方言不出现在内核或官方槽合同里
- [x] 无密钥/无网络时，默认测试仍用假适配器保持绿灯；真调用验收不把内核绑死在某一家提供商

## Answer

`atom-llm` 经宿主 `provide("llm")` 接到槽上，默认循环只消费槽合同（`stream` + `AbortSignal`），不内置提供商。适配器用可配置的 `baseUrl` / `apiKey` / `model`（`ATOM_LLM_*` 或 `createLlmPlugin` 选项）发流式请求，方言留在插件内。验收在 `packages/atom-llm/tests/llm-slot.test.ts`：无密钥时用回环 HTTP 跑流式与 Abort，并经默认循环完成一轮；真模型用例在缺密钥时 skip。`atom-loop` 仍用假适配器保持默认绿灯。
