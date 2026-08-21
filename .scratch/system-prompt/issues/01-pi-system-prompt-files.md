# pi 系统提示文件的搜索与合并

Type: research
Label: wayfinder:research
Triage: ready-for-agent
Status: resolved
Blocked by:

## Question

pi coding-agent 如何把默认模板、`SYSTEM.md`、`APPEND_SYSTEM.md`、`AGENTS.md` / `CLAUDE.md`、Skill 清单拼成 `Agent.state.systemPrompt`？

必须从上游源码与第一方文档取证（https://github.com/earendil-works/pi ，文档 https://pi.dev/docs/latest/usage ）。至少回答：

1. 各文件的搜索根（用户级 / 项目级 / cwd）、文件名别名、是否沿目录链上走。
2. 替换 vs 追加的精确顺序；`--system-prompt` / `--append-system-prompt` 插在哪一段之后。
3. Skill catalog 进 prompt 的条件与格式（是否要求 `read` 可用）。
4. 默认模板里除身份外还写了什么（工具列表、guidelines、日期、cwd、文档路径）。
5. 何时 `setSystemPrompt` / `_rebuildSystemPrompt`（启动、换工具、`/new`、热加载扩展）。
6. session JSONL 是否保存这根字符串。

产出一份带引用的调研笔记，供后续「Atom 系统提示文件的搜索根与叠法」「默认正文骨架」对照。不在本票做我们的路径或正文决策。

## Answer

pi 把 `Agent.state.systemPrompt` 拼成：`(默认模板 XOR SYSTEM.md/--system-prompt) → APPEND_SYSTEM.md/--append-system-prompt → AGENTS/CLAUDE 链的 <project_context> → 需 read 工具的 Skill XML catalog → cwd`。`SYSTEM.md`/`APPEND_SYSTEM.md` 只在 `.pi/` 与 `~/.pi/agent/` 各取一份且需信任项目文件；`AGENTS.md` 从 cwd 走到 FS 根并带 `AGENTS.override.md`。JSONL 不存这根字符串；`setSystemPrompt` 已删，重建走 `_rebuildSystemPrompt`（启动/换工具/`/reload`/扩展资源发现），`/new` 整棵重载。

笔记：[pi-system-prompt-files.md](../research/pi-system-prompt-files.md)
