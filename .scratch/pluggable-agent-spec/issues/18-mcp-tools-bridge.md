# 18 — MCP 工具桥：登记后的工具能被循环调用

**Parent:** [spec.md](../spec.md)

**What to build:** 一颗默认可关的 MCP 桥插件：只把某 MCP server 的 tools 登记进 `tools` 槽，默认循环能按普通工具调用它们。不做 resources / prompts / sampling。不依赖默认 coding 工具包。

**Blocked by:** 14 — 默认循环插件：假 `llm` + 假工具跑完一轮

**Status:** resolved

- [x] 接上某 MCP server 后，其 tools 出现在 `tools` 槽，循环能调用并拿到 `toolResult`
- [x] 桥可关；关掉后这些工具不再登记
- [x] 不实现 MCP resources / prompts / sampling
- [x] 不依赖默认 `read`/`write` 等工具包；测试仍走宿主加载面

## Answer

`atom-mcp` 是默认可关的 MCP 工具桥：默认 `plugin` 无 server，不占 `tools`。`createMcpPlugin({ servers })` 经 stdio 接上 MCP server，只 `listTools` / `callTool`，把 tools 登记进 `tools` 槽（空槽则 `provide` 带 `register` 的表；已有表则 `register`，卸载逆转）。默认循环按普通工具调用并写入 `toolResult`。不做 resources / prompts / sampling。验收在 `packages/atom-mcp/tests/mcp-tools-bridge.test.ts`，假 `llm` + 夹具 MCP server，只经 `createPluginHost().load`，不装 `atom-tools`。REPL 默认装配仍属第 19 票。
