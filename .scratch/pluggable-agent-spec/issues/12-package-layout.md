# 12 — 包布局与模块边界落地

**Parent:** [spec.md](../spec.md)

**What to build:** 工作区按统一依赖方向切好模块，后续票只往这些边界里填，不再另起炉灶。内核独立；默认循环、默认 `llm` 适配器、默认工具包、MCP 桥各为一颗插件模块且只依赖内核；流式 REPL / 默认装配是一个 app，依赖内核与默认插件，禁止反向依赖。公开面只有宿主加载已解析模块、Context 取槽、匿名事件总线。本票只落骨架（能过类型检查与空测试），不实现加载或回合。

**Blocked by:** 无 — 可立即开始

**Status:** resolved

**Constraints:**

- 工作区包名一律 `atom-` 前缀（`atom-kernel` / `atom-loop` / `atom-llm` / `atom-tools` / `atom-mcp` / `atom-cli`）
- 删除示例包 `packages/utils-template`

- [x] 工作区里能辨认出内核、四颗默认插件（循环 / `llm` / 工具包 / MCP 桥）、一个 CLI app，后续票有固定落点
- [x] 内核不依赖任何插件或 CLI；插件只依赖内核；CLI 依赖内核与插件，反向依赖不存在
- [x] 公开面可从模块边界描述为：加载已解析同进程模块、Context 取槽、匿名事件总线；没有第二套平行 API
- [x] 骨架能通过类型检查；有可运行的空测试。不实现插件加载、回合循环或 REPL

## Answer

包名一律 `atom-` 前缀，落点如下：

| 角色 | 包名 | 路径 |
| --- | --- | --- |
| 内核 | `atom-kernel` | `packages/atom-kernel` |
| 默认循环插件 | `atom-loop` | `packages/atom-loop` |
| 默认 `llm` 适配器 | `atom-llm` | `packages/atom-llm` |
| 默认工具包 | `atom-tools` | `packages/atom-tools` |
| MCP 桥 | `atom-mcp` | `packages/atom-mcp` |
| 流式 REPL / 默认装配 | `atom-cli` | `apps/atom-cli` |

依赖方向：内核无工作区依赖；四颗插件只依赖 `atom-kernel`；`atom-cli` 依赖内核与四颗插件。公开面收在 `PluginHost`（`load` + `context` + `events`），类型骨架，未实现加载/回合/REPL。已删除 `packages/utils-template`。`apps/website-template` 仍是仓库模板遗留，不在本票 agent 包集合内。
