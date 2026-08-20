# 17 — 默认工具包：读改仓库、跑命令、搜索、问答

**Parent:** [spec.md](../spec.md)

**What to build:** 默认 `tools` 插件一整包：`read` / `write` / `edit` / `bash` / `rg` / ASK，均可关。`rg` 覆盖按内容搜索与按路径枚举。循环能读改当前仓库、跑命令、搜索、问答。ASK 是问答工具（模型提问，人答复成 `toolResult`），不拦截写文件或 bash。无权限弹窗、无默认沙箱。

**Blocked by:** 14 — 默认循环插件：假 `llm` + 假工具跑完一轮

**Status:** resolved

- [x] 假 `llm` 驱动下，循环能调用 `read` / `write` / `edit` / `bash` / `rg`，效果落在当前工作树或本机进程
- [x] ASK 能提问并收下答复作为 `toolResult`；它不拦截 `write` 或 `bash`
- [x] 整包可关；关掉后循环看不到这些工具
- [x] 无权限弹窗、无默认沙箱；不按单把工具拆票验收

## Answer

`atom-tools` 占 `tools` 槽，一整包登记 `read` / `write` / `edit` / `bash` / `rg` / `ASK`。`rg` 调用随包 `@vscode/ripgrep` 平台二进制（不依赖系统 PATH 上的 `rg`）：搜内容、`--files`/`-g` 枚举路径，替换原先的 `grep`/`glob`。效果落在插件 `cwd`（默认 `process.cwd()`）与本机进程。ASK 只通过 `createToolsPlugin({ ask })` 提问并收下答复当 `toolResult`，不拦截 `write` 或 `bash`。不装或卸载后循环看不到这些工具。无权限弹窗、无默认沙箱。验收在 `packages/atom-tools/tests/default-tools.test.ts`，假 `llm` 只经 `createPluginHost().load`。REPL 接线仍属第 19 票。
