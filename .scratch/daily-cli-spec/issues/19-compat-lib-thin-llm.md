# 19 — 兼容库 + 薄 `atom-llm`

**Parent:** [spec.md](../spec.md)

**What to build:** 接上 OpenAI 兼容 `{baseUrl}/chat/completions` SSE 就能跑。方言落在独立兼容库；`atom-llm` 变薄，只做槽翻译。提供商方言不锁进 `llm` 槽。此票可单独验收兼容包簇。

**Blocked by:** 17 — 长上下文：下一轮看见压缩视图

**Status:** ready-for-agent

- [ ] 兼容库实现 OpenAI 兼容 `{baseUrl}/chat/completions` 流式 SSE（含现有思考字段映射，仍留在库内）。不是插件，不占槽。不依赖内核、循环或槽类型。npm 包名不锁
- [ ] `atom-llm` 只 `provide("llm")`，把槽形状译成兼容面再调库。默认集合只装这颗薄插件；库是依赖，不进默认插件列表。循环禁止 import 该库
- [ ] CLI 把已叠好的 `model` / `baseUrl` / `apiKey` 交给薄插件工厂。装配持有本进程可变三标量；薄插件每次调用读当前值。`/model` 只改其中 `model`（斜杠拦下与写用户层 settings 属第 20 票）；不换 `baseUrl` / API key，不重读配置文件，不改 `llm` 槽
- [ ] 把提供商错误译成合同上可识别的上下文溢出失败面；循环只认这个失败面。配置不加 `provider` / `protocol` / 路径覆盖。本阶段没有多提供商市场、第二家原生协议
- [ ] 只有 `atom-llm` 与兼容库自己的测试可 import 该库。一次真实或录制的 `{baseUrl}/chat/completions` SSE 经薄插件跑通。循环 / CLI / REPL / 工具 / Skill / `compact` / `session` 的测试仍只测槽合同
