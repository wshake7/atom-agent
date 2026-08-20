# DeepSeek Harness 插件模型

Type: research
Label: wayfinder:research
Triage: ready-for-agent
Status: resolved
Blocked by:

## Question

DeepSeek 的 agent harness（「一切皆插件」那一套，以官方仓库/文档为准）里，**插件到底替换什么、怎么挂上、内核还剩什么**？

必须从上游源码与第一方文档取证。至少回答：

1. 权威仓库与文档入口。
2. 官方意义上的插件类型清单（模型、工具、钩子、记忆、UI、协议……以源码为准）。
3. 插件生命周期：发现、加载、注册、卸载；进程内还是隔离。
4. 插件契约：一个插件必须实现的接口、错误与超时怎么处理。
5. 所谓「一切皆插件」之后，不可替换的内核闭环还剩哪些调用。
6. 对 coding agent 特别相关的插件（bash、编辑、MCP 等）是内置插件还是示例。

产出带引用的调研笔记，供「插件契约：可替换面」对照。不要设计我们的契约。

## Answer

DeepSeek Harness 的权威本体是 `deepseek-ai/deepseek-harness`（`dsh`，Cordis 驱动，口号「一切皆插件」）。官方没有 `PluginType` 枚举：插件就是 Cordis 模块（`apply`/`inject`/`Service`），模型、工具、技能、会话、沙箱、存储、循环、调度、UI 都按配置叠进同一棵树。发现靠 profile/bundle/`dsh plugin add`/`--patch`/preset；加载是同进程 Loader + 服务依赖；卸载靠可逆 effect；隔离只发生在 isolate realm、MCP 子进程、工具沙箱和 opt-in 的 `node:vm`。不可替换的只剩 Cordis 微内核（加载/卸载/依赖）、boot 组成器，以及事件/会话日志词汇——agent-loop 本身仍是可换插件。bash/编辑是 `dsh-base` 内置产品插件；MCP 是第一方但不进默认树；记忆只是 MCP 示例 overlay。笔记：[DeepSeek Harness 插件模型](../research/deepseek-harness-plugin-model.md)。
