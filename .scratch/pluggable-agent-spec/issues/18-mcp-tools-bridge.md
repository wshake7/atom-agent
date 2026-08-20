# 18 — MCP 工具桥：登记后的工具能被循环调用

**Parent:** [spec.md](../spec.md)

**What to build:** 一颗默认可关的 MCP 桥插件：只把某 MCP server 的 tools 登记进 `tools` 槽，默认循环能按普通工具调用它们。不做 resources / prompts / sampling。不依赖默认 coding 工具包。

**Blocked by:** 14 — 默认循环插件：假 `llm` + 假工具跑完一轮

**Status:** ready-for-agent

- [ ] 接上某 MCP server 后，其 tools 出现在 `tools` 槽，循环能调用并拿到 `toolResult`
- [ ] 桥可关；关掉后这些工具不再登记
- [ ] 不实现 MCP resources / prompts / sampling
- [ ] 不依赖默认 `read`/`write` 等工具包；测试仍走宿主加载面
