# 可插拔 Agent：到达 v0 产品闭环

Status: ready-for-agent

术语以根目录 [CONTEXT.md](../../CONTEXT.md) 为准，本文使用这些词、不复述定义。硬权衡见 `docs/adr/`，本文只锁结论并链接。对照调研只链不贴。决策过程见 [可插拔 Agent 内核规格与迭代路线图](./map.md)。

## Problem Statement

仓库级目标（[ADR-0008](../../docs/adr/0008-project-goal.md)）是自研极简、高扩展、可插拔的 agent 系统：pi 的极简、Harness 的一切皆插件、AgentScope 2.0 的企业级能力（加槽长出）。本规格只切到 **v0 产品闭环**：自己用的 coding CLI（终端里流式改代码、跑命令、搜仓库）。能力必须按契约以插件替换。不 fork 三家，也不把 v0 做成可嵌入 Runtime 或多智能体平台——那些是目标里的后续阶段，不是本规格的交付。

仓库目前是 TypeScript monorepo 绿场，没有可插拔内核、没有循环插件、没有流式 REPL。缺少一份可交接实现的规格：内核闭合集、插件契约、默认循环合同、v0 产品边界，以及到达 **v0 产品闭环** 的阶段边界。

## Solution

用 TypeScript 在本 monorepo 绿场实现一颗进程内**内核**（插件宿主，不是回合循环）。宿主运行时选用官方 Cordis，由 `atom-kernel` 薄封装兑现四件套；外加可整颗替换的默认**循环插件**、接到 `llm` 槽的真实模型端口、流式 REPL、默认可关的 coding **工具**包，以及只把 MCP server 的 tools 登记进 `tools` 槽的工具桥。MCP 桥退出即 v0 产品闭环。

只偷 pi / DeepSeek Harness / AgentScope 2.0 的原则，不 fork。不 vendor Harness 的 Cordis 分支。企业能力不预埋进核，靠已锁宿主加**槽**长出来；本规格不设计那些后续形态。

## User Stories

1. As an 作者, I want 在终端启动流式 REPL, so that 我能在当前仓库里用对话改代码，而不需要差分 TUI
2. As an 作者, I want 输入一句需求后看见助手文本流式打出, so that 我知道回合已经开始、不必等整段结束
3. As an 作者, I want agent 能读当前仓库里的文件, so that 它能基于真实代码回答和修改
4. As an 作者, I want agent 能写入当前仓库里的文件, so that 新文件能落在工作树上
5. As an 作者, I want agent 能按补丁方式编辑已有文件, so that 小改动不必整文件重写
6. As an 作者, I want agent 能跑 bash 命令, so that 测试、构建和仓库探查能在同一回合里完成
7. As an 作者, I want agent 能按内容搜索仓库, so that 它能找到相关符号和字符串
8. As an 作者, I want agent 能按路径模式枚举文件, so that 它能定位候选文件而不必先猜路径
9. As an 作者, I want 模型能通过 ASK 向我提问、我在 REPL 里答复, so that 缺信息时能继续回合，而不是被权限弹窗打断
10. As an 作者, I want ASK 不拦截 write 或 bash, so that 破坏性操作在 v0 里按「作者自己负责」执行，而不是伪装成权限系统
11. As an 作者, I want 在回合进行中 Abort, so that 跑飞的模型或工具能立刻停，而不是写完才停
12. As an 作者, I want 看见工具开始与结束, so that 我知道当前在读文件、改文件还是跑命令
13. As an 作者, I want 同一 REPL 进程里后续回合仍带着之前的消息, so that 我能连续改同一个问题
14. As an 作者, I want 重启进程后不指望会话还在, so that 我不会把内存列表误当成持久化
15. As an 作者, I want 模型产生的推理块在后续调用里被回放, so that 多步回合不会丢掉思考上下文
16. As an 作者, I want 默认工具包能整包关掉, so that 我可以只留自己的 `tools` 提供方
17. As an 作者, I want 接上某个 MCP server 后就能在回合里调用它的 tools, so that 我不必为每把外部工具手写插件
18. As an 作者, I want MCP 不做 resources / prompts / sampling, so that v0 只保证「工具能被循环调用」这一件事
19. As an 作者, I want 启动时不必确认权限、不必进沙箱, so that 自己用的 CLI 没有弹窗摩擦
20. As an 作者, I want 一次真实模型调用能跑通, so that REPL 不是只连假端口的演示
21. As an 作者, I want 关掉 MCP 桥后默认 coding 工具仍可用, so that 外部 server 不是 v0 的硬依赖
22. As an 作者, I want 不出现浏览器、子 agent、IDE 插件、内置 plan/todo 或后台 bash, so that v0 边界保持可理解、可完成
23. As a 插件作者, I want 所有插件都走同一套注册 / 注入 / 生命周期, so that 我不必按种类选不同的 PluginType
24. As a 插件作者, I want 向 Context 贡献官方槽上的服务, so that 循环、工具表、模型端口可以被替换
25. As a 插件作者, I want 贡献未点名的键, so that v0 没点名的能力不必改官方槽语义
26. As a 插件作者, I want 用另一颗循环插件整颗换掉默认循环, so that 回合合同可以替换而不是打补丁
27. As a 插件作者, I want 默认循环只消费 `llm` 与 `tools`、不内置提供商, so that 换模型或换工具不必改循环
28. As a 插件作者, I want 内置分发与第三方走同一加载面, so that 「官方工具」也只是默认可关的插件
29. As a 插件作者, I want 宿主只吃已解析的同进程模块和依赖, so that 发现（目录 / npm / preset）不是契约的一部分
30. As a 插件作者, I want 加载时登记的 effect 能在卸载时逆转, so that 热换插件不会留下半残状态
31. As a 插件作者, I want 通过内核的匿名事件总线发布和订阅, so that 我能观察回合，而不把业务事件名焊进内核
32. As a 插件作者, I want 默认循环把 turn 开始/结束、助手流式、工具开始/结束打到总线上, so that REPL 和测试能订阅同一最小事件集
33. As a 插件作者, I want 官方槽语义不可改、新能力只加新槽, so that 我加能力时不会破坏已有循环 / 工具 / 模型合同
34. As a 插件作者, I want 隔离保持能力级、模块同进程加载, so that v0 不必实现外进程沙箱槽
35. As a 内核维护者, I want 内核闭合集只有服务注册、依赖注入、生命周期、事件总线原语, so that 核里没有 agent 语义可腐蚀
36. As a 内核维护者, I want 无循环插件时宿主仍能加载、卸载并发匿名事件, so that 「内核不是循环」可以被检验
37. As a 内核维护者, I want 业务事件名、发现与组成、模型、工具、会话与持久化都不进内核, so that 后续阶段不必拆核
38. As a 内核维护者, I want 禁止第五件套, so that 企业能力不能借「再凿一刀接缝」混进核
39. As a 循环插件维护者, I want 消息 role 只有 `user` / `assistant` / `toolResult`, so that 推理不会变成第四种 role
40. As a 循环插件维护者, I want 推理块作为 `assistant` 内容块被保留, so that 回放合同对齐已锁的循环闭合集
41. As a 循环插件维护者, I want 工具分发（读 `tools`、校验、执行）留在循环内且默认串行批, so that 并行批和权限拦截都不是这颗插件的合同
42. As a 循环插件维护者, I want 流式消费与 Abort 都在循环内, so that 换 REPL 不会把取消语义带走
43. As a 循环插件维护者, I want 当前运行只有内存消息列表, so that 持久化不会偷偷进默认循环
44. As a 循环插件维护者, I want 用假 `llm` 和假工具就能跑完一轮, so that 循环合同不依赖真模型或真实仓库
45. As an `llm` 提供方作者, I want 槽上的端口可流式、可 Abort, so that 默认循环不必为提供商写方言分支
46. As an `llm` 提供方作者, I want 提供商方言私有在适配器里, so that 换一家模型不必改官方槽语义
47. As a REPL 维护者, I want 只订阅循环打到总线的最小事件集并写到终端, so that UI 不是第二套回合状态机
48. As a REPL 维护者, I want 人的输入变成 `user` 消息并交给 `loop`, so that 界面不直接打模型、不直接调工具
49. As a 默认工具包维护者, I want `read` / `write` / `edit` / `bash` / `rg` / ASK 作为一整包交付, so that 路线图不按每把工具拆阶段
50. As a 默认工具包维护者, I want 工具效果发生在当前工作树和本机进程, so that 作者能用 git 看见改动、用终端看见命令输出
51. As an MCP 桥维护者, I want 只把 server 的 tools 登记进 `tools` 槽, so that 循环调用它们的方式和内置工具相同
52. As an MCP 桥维护者, I want 未实现的 MCP 面保持关闭, so that resources / prompts / sampling 不会冒充 v0 能力
53. As a 后续阶段的实现者, I want v0 不点名 `session` / `sandbox` / `telemetry` 等槽, so that 到点再加槽，而不是先留空官方槽
54. As a 后续阶段的实现者, I want 可嵌入 Runtime 与多智能体只允许在 v0 产品闭环之后再谈, so that v0 不会被库形态或编排协议带偏
55. As a 测试作者, I want 在同一宿主加载面上替换假/真适配器, so that 六段阶段边界都能用对外行为验收，而不测实现细节
56. As a 测试作者, I want 断言总线上的最小事件集和工具的可见副作用, so that 换循环内部结构不会集体改测试
57. As a 仓库贡献者, I want 实现落在本 monorepo、语言为 TypeScript, so that 它和现有 Vite+ 工具链一致
58. As a 仓库贡献者, I want 不 fork pi / Harness / AgentScope, so that 我们只继承原则，不继承它们的产品边界

## Implementation Decisions

- 语言与落点：TypeScript 绿场，落在本 monorepo。沿用现有 `apps/*` 与 `packages/*` 工作区惯例。包如何切（内核 / CLI / 内置插件是否分 package）本规格不锁；但内核必须能在没有循环插件、没有 CLI 的情况下被装配和验收。
- 内核（ADR-0001、ADR-0007）：进程内插件宿主。闭合集只有四件——服务注册、依赖注入、生命周期（加载 / 卸载 / 可逆 effect）、事件总线原语（发布 / 订阅，不含业务事件名）。四件套由官方 Cordis 兑现，`atom-kernel` 薄封装加载面（已解析同进程模块、官方槽、匿名事件），不自研第二套 DI/生命周期/事件，不 vendor `@deepseek-ai/cordis`。插件形态对齐 Cordis：`apply` / `inject` / `Service` / 可逆 effect。不是回合循环。发现与组成、模型、工具、会话与持久化不进核。无第五件套。
- 循环插件（ADR-0006）：占 `loop` 槽，可整颗替换。消费 `llm` 与 `tools`，不内置提供商。「删掉则无法完成模型 ↔ 工具回合」用在这颗插件上，不用在内核上。
- 插件契约（ADR-0002）：插件同构，向 Context 贡献服务，不分 PluginType；实现上即 Cordis 插件。v0 官方槽仅 `loop`、`tools`、`llm`。未点名键仍可贡献。官方槽语义不可改，新能力只加新槽。
- 加载面：宿主只吃已解析的同进程模块加依赖。目录 / npm / preset 发现不进本契约。v0 的 CLI 可以用写死的默认插件列表启动；那是产品装配，不是内核发现逻辑。
- 隔离：能力级。模块同进程加载。沙箱若出现，是某槽提供方，且不是 v0 官方槽。
- 内置分发：默认循环、默认工具包、默认 `llm` 适配器、MCP 桥都是插件，与第三方同一加载面，可关可换。
- 默认循环消息：role 为 `user` / `assistant` / `toolResult`。推理块是 `assistant` 内容块，必须保留并可回放。不是第四种 role。
- 默认循环机械装置：工具分发（读 `tools`、校验、执行）、流式消费、Abort 都在循环内。默认串行工具批。当前运行只有内存消息列表。
- 默认循环事件：循环契约锁最小集并打到内核匿名总线——turn 开始/结束、助手流式、工具开始/结束。完整可观测 schema 是后续阶段。事件名属于循环契约，不属于内核。
- 默认循环不包含：压缩、记忆、图片一等化、并行工具批、持久化、CLI。
- `llm` 槽：必须可流式、可 Abort。提供商方言不进入内核或官方槽语义；第一颗内置适配器只要能完成一次真实模型调用即可，不做成多提供商市场。
- v0 界面（ADR-0003）：流式 REPL。人输入 → `loop`；REPL 订阅总线最小事件集并写到终端。无差分 TUI。
- 默认 `tools` 插件（均可关，一整包）：`read` / `write` / `edit` / `bash` / `rg` / ASK。`rg` 覆盖按内容搜索与按路径枚举。ASK 是问答工具（模型提问，人在 REPL 答复成 `toolResult`），不拦截写文件或 bash。
- 权限：v0 不管。无弹窗、无默认沙箱。
- MCP：默认可关的工具桥，只把某 server 的 tools 登记进 `tools`。不做 resources / prompts / sampling。登记后的工具必须能被循环调用。
- 接缝（ADR-0004）：就是已锁宿主加官方槽可加不可改。不预点名 `session` / `sandbox` / `telemetry` 等槽。可嵌入 Runtime、会话持久、可观测、权限/沙箱、多智能体编排标为后续阶段，到点再做。
- 路线图（ADR-0005）：到 v0 产品闭环共六段，顺序与退出条件如下。全程不变量：不改 `loop` / `tools` / `llm` 语义；内核无第五件套；无 TUI、无权限弹窗、无浏览器/多智能体/IDE。后续阶段至多加槽，本规格不对会话/可观测/沙箱排序。

| 阶段 | 必须有 | 明确没有 | 退出条件 |
| --- | --- | --- | --- |
| 宿主 | 四件套 | 业务事件名、发现逻辑、`loop` 语义 | 能加载/卸载同进程插件并发匿名事件；无循环也算过 |
| 默认循环插件 | 占 `loop`，能完成模型 ↔ 工具回合 | CLI、真模型、真实仓库工具 | 假 `llm` / 假工具下跑完一轮 |
| `llm` 端口 | 真模型接到 `llm` 槽 | 多提供商市场 | 一次真实模型调用成功 |
| 流式 REPL | 终端流式一轮 | 差分 TUI | 人能打完一轮并看见流式输出 |
| 默认工具包 | 四件套 + 搜索 + ASK，一整包均可关 | 每工具单独成阶段；权限拦截 | 能读改当前仓库、跑命令、搜索、问答 |
| MCP 工具桥 | 把某 MCP server 的 tools 登记进 `tools` | resources / prompts / sampling | 登记后的工具能被循环调用。此段退出 = **v0 产品闭环** |

- 实现前若碰到下列问题，另开努力，不要在本规格里补空槽或第五件套：插件发现与组成的具体机制；`llm` 槽的提供商方言（OpenAI 兼容形态）；压缩与记忆挂在哪；Skill 是否独立于插件与工具；Agent 评测平台怎么写。

## Testing Decisions

好的测试只测对外行为，不测实现细节：不断言内核内部字典形状、不断言循环私有调度器、不把提供商 HTTP 方言当成官方槽合同。验收以阶段边界的退出条件为准。

唯一测试接缝：插件宿主的进程内加载面。测试装配宿主、传入已解析的同进程插件模块（及其依赖），然后只观察：

- Context 上官方槽与未点名键是否按契约可取
- 加载 / 卸载是否发生、effect 是否可逆
- 匿名事件总线上的流量（由循环契约锁死的最小事件集）
- 回合的可见效果：内存消息列表、推理块是否回放、流式增量、Abort 是否中止、工具对工作树/进程的副作用

不要为内核、循环、工具、MCP、REPL 再开平行接缝。假 `llm`、假工具、真 `llm` 适配器、默认工具包、MCP 桥都是这条接缝上的适配器。REPL 是宿主外的 stdin/stdout 适配器：测 REPL 时仍装配同一宿主，用假 `llm` 驱动一轮，断言终端可见的流式输出。

按阶段验收（全部走同一接缝）：

- 宿主：只装探测插件，无 `loop`；能加载、卸载、发匿名事件
- 默认循环：假 `llm` + 假工具跑完一轮；校验串行工具批、推理块回放、Abort、最小事件集
- `llm` 端口：真模型适配器接到 `llm` 槽，一次真实调用成功（可流式、可 Abort）
- 流式 REPL：人输入一轮，终端出现流式输出
- 默认工具包：读改当前仓库、跑命令、搜索、ASK 问答；整包可关
- MCP 桥：登记后的工具能被循环调用；不暴露 resources / prompts / sampling

仓库里尚无 agent 测试。测试运行器沿用现有约定：`vite-plus/test`（见工作区里现有 package 测试）。真模型与真 MCP 的检查允许标为需要外部依赖；循环与宿主的阶段边界必须用假适配器在默认测试里锁死。

## Out of Scope

- fork 或移植 pi、DeepSeek Harness、AgentScope；Python 实现
- 把 v0 做成可嵌入 Runtime 或多智能体平台（v0 产品闭环之后才允许谈实现）
- 差分 TUI、浏览器、子 agent、IDE 插件、对外发布、内置 plan/todo、后台 bash
- 权限确认环、默认沙箱、评测平台、部署 / AaaS / 多租户 / RBAC / 计费
- 插件市场、目录 / npm / preset 发现机制、多提供商模型市场
- 会话持久化、压缩与记忆、图片一等化、并行工具批
- MCP resources / prompts / sampling
- 为尚未开始的阶段预点名官方槽，或在内核加第五件套
- 本规格不写生产代码的「只出文档」阶段已经结束；实现属于本规格要交接的工作。企业产品设计仍不属于本规格。

## Further Notes

参考系（解剖不是合同）：

- pi → 循环该有多小：[调研笔记](./research/pi-kernel-anatomy.md) · [pi 内核解剖](./issues/01-pi-kernel-anatomy.md)
- DeepSeek Harness → 什么必须是插件：[调研笔记](./research/deepseek-harness-plugin-model.md) · [DeepSeek Harness 插件模型](./issues/02-deepseek-harness-plugin-model.md)
- AgentScope 2.0 → 企业能力如何分层：[调研笔记](./research/agentscope-enterprise-layers.md) · [AgentScope 2.0 企业能力分层](./issues/03-agentscope-enterprise-layers.md)

内核对齐 Harness「宿主可换循环」，运行时选用与 Harness 相同的官方 Cordis，不把 pi 的循环叫做内核，也不 fork Harness 产品树。pi 的「小」落在默认循环插件上。AgentScope 的企业能力不预埋进核，靠加槽长出来。

ADR：

- [0001 内核是插件宿主，不是回合循环](../../docs/adr/0001-kernel-is-plugin-host.md)
- [0002 插件同构，v0 只点名三个槽](../../docs/adr/0002-plugin-slots.md)
- [0003 v0 是流式 REPL coding CLI，MCP 只作工具桥](../../docs/adr/0003-v0-coding-cli-boundary.md)
- [0004 企业能力靠加槽长出来，不在内核预埋接缝](../../docs/adr/0004-enterprise-is-later-phases-not-kernel-seams.md)
- [0005 到 v0 产品闭环共六段，其后加槽不排序](../../docs/adr/0005-roadmap-six-phases-to-v0.md)
- [0006 默认循环插件：三角消息 + 推理块 + 回合机械装置](../../docs/adr/0006-default-loop-plugin-closed-set.md)
- [0007 宿主运行时选用官方 Cordis](../../docs/adr/0007-cordis-as-host-runtime.md)
- [0008 项目目标：极简、一切皆插件、企业能力可长出的 agent 系统](../../docs/adr/0008-project-goal.md)

已关决策票：[内核最小闭合集](./issues/04-kernel-minimal-closed-set.md)、[插件契约：可替换面](./issues/05-plugin-contract-replaceable-surface.md)、[v0 Coding CLI 产品边界](./issues/06-v0-coding-cli-product-boundary.md)、[企业能力阶段切分与内核接缝](./issues/07-enterprise-stage-cuts-and-seams.md)、[路线图阶段与退出条件](./issues/08-roadmap-phases-and-exit-criteria.md)、[默认循环插件最小闭合集](./issues/10-default-loop-plugin-closed-set.md)。

下一跳：用 `/to-tickets` 按六段阶段边界拆垂直切片。本规格不拆工程任务列表。

## Comments

- `/to-spec`：把 wayfinder 已锁决策装配成可交接实现规格；测试接缝取宿主进程内加载面（唯一接缝）。
