# 17 — 默认工具包：读改仓库、跑命令、搜索、问答

**Parent:** [spec.md](../spec.md)

**What to build:** 默认 `tools` 插件一整包：`read` / `write` / `edit` / `bash` / `grep` / `glob` / ASK，均可关。循环能读改当前仓库、跑命令、搜索、问答。ASK 是问答工具（模型提问，人答复成 `toolResult`），不拦截写文件或 bash。无权限弹窗、无默认沙箱。

**Blocked by:** 14 — 默认循环插件：假 `llm` + 假工具跑完一轮

**Status:** ready-for-agent

- [ ] 假 `llm` 驱动下，循环能调用 `read` / `write` / `edit` / `bash` / `grep` / `glob`，效果落在当前工作树或本机进程
- [ ] ASK 能提问并收下答复作为 `toolResult`；它不拦截 `write` 或 `bash`
- [ ] 整包可关；关掉后循环看不到这些工具
- [ ] 无权限弹窗、无默认沙箱；不按单把工具拆票验收
