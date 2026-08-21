# 日常 CLI 闭环

Status: ready-for-agent

术语以根目录 [CONTEXT.md](../../CONTEXT.md) 为准，本文使用这些词、不复述定义。硬权衡见 `docs/adr/`，本文只锁结论并链接。对照调研只链不贴。决策过程见 [日常 CLI 闭环规格](./map.md)。不改写 [v0 规格](../pluggable-agent-spec/spec.md)。

## Problem Statement

仓库级目标（[ADR-0008](../../docs/adr/0008-project-goal.md)）不变。前一张图已把实现切到 **v0 产品闭环**：[可插拔 Agent：到达 v0 产品闭环](../pluggable-agent-spec/spec.md)。v0 退出时宿主、默认循环、`llm` 槽、流式 REPL、默认工具包与 MCP 工具桥就绪，但作者还不能把这套 CLI **当天天用**：配置写死在 argv / `.env`，进程一关会话就没了，长对话不会缩短，没有 Skill，提供商方言仍堆在 `atom-llm` 里，REPL 没有输入历史、多行粘贴和斜杠。

缺少一份可交接的 **日常 CLI 闭环** 规格：在不改写 v0、不改 `loop` / `tools` / `llm` 语义、不加内核第五件套的前提下，锁装配与配置、跨进程会话、压缩、Skill、兼容库与 REPL 手感，以及到达该阶段边界的四段路线图。提供商方言不锁进 `llm` 槽。可嵌入 Runtime 与多智能体仍是更后的阶段。

## Solution

在 v0 之上用同一颗内核与默认循环，由 CLI 读分层 JSON **配置**、叠成已解析同进程模块再 **装配** 给宿主。新增两颗官方槽：`compact`（只读视图变换）与 `session`（会话日志）。默认装配写死：循环、薄 `atom-llm`、默认可卸工具包、MCP 桥、Skill 加载器、`compact` 与 `session` 提供方。兼容面落在独立 **兼容库**（OpenAI `chat/completions` SSE），`atom-llm` 只做槽翻译。REPL 仍是流式终端，补上手感最小集。跨会话记忆、本地 `plugins/` 扫描、hooks、插件市场、差分 TUI 都不进本规格。

只偷主流 coding agent 的原则，不 fork。v0 不变量继续有效。本规格不写生产代码；实现是规格走完之后的另一次努力。

## User Stories

1. As an 作者, I want 不改源码、只改 JSON 配置就能换模型端点 / MCP 列表 / 工具开关, so that 日常装配跟着配置变，而不必改仓库代码
2. As an 作者, I want 用户级默认被项目级覆盖、启动 cwd 还能有本机覆盖, so that 共享仓库配置与本机密钥、本机 MCP 能分开
3. As an 作者, I want 项目文件里的 API key 被丢掉不读, so that 密钥不会被提交进 git
4. As an 作者, I want 用 `ATOM_AGENT_HOME` 换整个用户根, so that 测试和多套配置不必抢默认家目录
5. As an 作者, I want 从 git 根走到 cwd 的每一层 `.atom-agent/` 都叠进去, so that monorepo 子目录能近处覆盖
6. As an 作者, I want MCP 启动定义写在 sidecar、settings 只写 enable/disable 名, so that 清单和开关不是同一份文件
7. As an 作者, I want 仓库根 `.mcp.json` 在没有 `.atom-agent/mcp.json` 时也能被认, so that 与常见 MCP 清单习惯兼容
8. As an 作者, I want `--no-tools` 卸掉默认工具包但仍按名单装 MCP 工具, so that 我可以只用外部工具
9. As an 作者, I want `--no-tools` 不卸 Skill 加载器, so that 关默认工具包时仍能按需读 Skill
10. As an 作者, I want 关掉进程再开、用斜杠找回上一会话的原文消息, so that 连续改同一个问题不必靠内存
11. As an 作者, I want 裸启动永远是新会话, so that 误开 CLI 不会悄悄续上旧对话
12. As an 作者, I want 会话日志里同时有三角消息和压缩事件, so that 我能溯源回放当时模型看见的视图，原文也不丢
13. As an 作者, I want 续聊不冻配置, so that 新回合跟当前装配走，而不是跟写下日志那天的 MCP / 模型快照
14. As an 作者, I want 长对话在下次请求前被压成更短的模型可见视图, so that 日常路径不必手敲压缩
15. As an 作者, I want 上下文溢出时自动再压一次并最多再打一枪模型, so that 常见窗口打满能恢复，而不是直接死
16. As an 作者, I want 切点后的尾部原文仍送给模型, so that 最近的工具对不会被摘要吃掉
17. As an 作者, I want 溢出压完仍不够短时把溢出报给我、不再打第二次模型, so that 假缩短不会空转
18. As an 作者, I want 本阶段没有 `/compact`, so that 斜杠最小集保持可记，自动路径必须自己能缩短
19. As an 作者, I want 按目录放下 `SKILL.md` 就能被扫进清单, so that Skill 是文件约定，不是运行时登记表
20. As an 作者, I want 模型能调用 `skill({ name })` 拿到正文, so that 按需指令能进回合，而不把 Skill 登记成业务工具
21. As an 作者, I want `/skill <name>` 立刻把正文交给循环, so that 我能显式激活一颗 Skill
22. As an 作者, I want 同名 Skill 近 cwd 整颗替换, so that 项目能覆盖用户级同名包
23. As an 作者, I want 进程内能召回先前一次主提示, so that 重复指令不必重打；我不指望这份历史跨进程
24. As an 作者, I want 粘贴多行合成一条再交给循环, so that 代码块和 ASK 答复都不必拆成多轮 stdin
25. As an 作者, I want 回合中键盘中断接到已有 Abort、不杀进程, so that 跑飞能停、CLI 还在
26. As an 作者, I want 空闲主提示上的斜杠被拦下、ASK 里的 `/` 当正文, so that 斜杠不是第二套 TUI，也不污染问答
27. As an 作者, I want `/new` `/resume` `/session` `/sessions` `/exit` `/help` `/skills` `/mcps`, so that 会话、清单与退出不必记另一套 UI
28. As an 作者, I want `/model` 立刻换本会话模型标识并按规则写用户层 settings, so that 换模型不必重启、也不换 baseUrl / key
29. As an 作者, I want 屏幕上能看见思考增量与工具参数, so that 手感够用，而不必扩循环事件名
30. As an 作者, I want 接上 OpenAI 兼容 `{baseUrl}/chat/completions` SSE 就能跑, so that 日常路径至少有一种兼容面
31. As an 作者, I want 配置里没有 `provider` / `protocol` 字段, so that 方言是兼容库内部的事
32. As an 作者, I want 缺 model / baseUrl / apiKey 时启动失败, so that 半残端点不会在回合中才爆
33. As an 作者, I want 不出现记忆库、差分 TUI、权限弹窗、插件市场、本地 `plugins/` 扫描, so that 本阶段边界可完成
34. As a 插件作者, I want 官方槽就是 `loop` / `tools` / `llm` / `compact` / `session` 这五颗, so that 本阶段名单关闭、没有空槽占位
35. As a 插件作者, I want 仍能贡献未点名键, so that 没点名的能力不必改官方槽语义
36. As a 插件作者, I want `compact` 不改原消息列表、不写盘, so that 压缩是视图变换，不是 persistence API
37. As a 插件作者, I want `session` 只追加终态消息与压缩事件, so that 半截流和 Abort 半截助手不会落盘
38. As a 插件作者, I want 默认循环闭合集不扩, so that 换循环不必带走压缩或持久化；有提供方才可选消费
39. As a 插件作者, I want Skill 加载器像 MCP 桥一样是写死的一颗插件, so that 默认工具包不必认识 Skill
40. As a 插件作者, I want 兼容库不认识槽类型、循环禁止 import 它, so that 方言泄漏面只剩薄 `atom-llm`
41. As a 内核维护者, I want 宿主仍只吃已解析同进程模块, so that 配置搜索与 `skills/` 扫描都不进内核
42. As a 内核维护者, I want 内核不加第五件套、不改 v0 三槽语义, so that 日常 CLI 只靠加槽与 CLI 产品面长出来
43. As a 循环插件维护者, I want 每次请求 `llm` 前把原文列表交给 `compact(messages, "threshold")`, so that 是否缩短由提供方决定
44. As a 循环插件维护者, I want `llm` 报出可识别上下文溢出时用原文列表再 `compact(..., "overflow")` 并最多 retry 一次, so that 溢出恢复在默认循环里，而不改五事件名
45. As a 循环插件维护者, I want 恢复会话时工厂吃初始原文列表、`Loop` 不加 `hydrate`, so that 循环接口与 v0 兼容
46. As an `llm` 提供方作者, I want 槽仍是可流式、可 Abort 的 `stream`, so that 只多一个可识别的上下文溢出失败面，不加方法、不加方言字段
47. As a REPL 维护者, I want 斜杠与压缩 / 会话不经循环总线, so that UI 不是第二套回合状态机
48. As a 后续阶段的实现者, I want 本规格不点名 `telemetry` / `sandbox` / `config` / `skills` / `hooks` / `commands` / 记忆槽, so that 那些能力到点再加，而不是先留空官方槽
49. As a 测试作者, I want 四段退出条件都能用对外行为验收, so that 换压缩算法或日志路径格式不会集体改测试
50. As a 测试作者, I want 兼容库只有 `atom-llm` 与该库自己的测试可 import, so that 循环 / CLI / REPL / 工具 / Skill / `compact` / `session` 测的是槽合同

## Implementation Decisions

- 落点与前序：本规格接在 [v0 规格](../pluggable-agent-spec/spec.md) 之后，不改写它。语言与 monorepo 工作区惯例沿用 v0。内核四件套、官方 Cordis 薄封装、默认循环闭合集（[ADR-0001](../../docs/adr/0001-kernel-is-plugin-host.md)、[ADR-0006](../../docs/adr/0006-default-loop-plugin-closed-set.md)、[ADR-0007](../../docs/adr/0007-cordis-as-host-runtime.md)）不变。v0 界面仍是流式 REPL（[ADR-0003](../../docs/adr/0003-v0-coding-cli-boundary.md)）。企业能力与 Runtime / 多智能体仍靠加槽后置（[ADR-0004](../../docs/adr/0004-enterprise-is-later-phases-not-kernel-seams.md)）。
- 官方槽（[本阶段点哪些官方槽](./issues/12-official-slots-this-stage.md)）：本阶段五颗，名单关闭。v0 的 `loop` / `tools` / `llm` 语义不改；新增 `compact`、`session`。插件仍可贡献未点名键，那些键不是合同。明确没有：`telemetry`、`sandbox`、`config`、`skills`、`hooks`、`commands`、记忆槽，以及任何空官方槽。内核不加第五件套。
- 装配与配置（[装配与配置形态](./issues/08-assembly-and-config-shape.md)）：**配置**是 CLI 产品面，不点名 `config` 槽。**装配**把配置叠成已解析同进程模块再 `load`。宿主不读文件、不做发现。启动读一次，改文件要重启。续聊不冻配置。
- 搜索路径：JSON。`ATOM_AGENT_HOME` 换整个用户根（只从启动环境读）；默认 `~/.atom-agent/`（Windows `%USERPROFILE%\.atom-agent\`）。项目链从 **git 根走到 cwd** 沿途每一层 `.atom-agent/`；没 git 则只有 cwd。`.env` 只从**启动 cwd** 读。用户层 `$ATOM_AGENT_HOME/settings.json` + `mcp.json`；项目链沿途 `settings.json` + `mcp.json`，**仅 git 根**另认 `.mcp.json`（同层已有 `.atom-agent/mcp.json` 则整文件覆盖）；本机覆盖**仅启动 cwd** 的 `settings.local.json` / `mcp.local.json`。用户 / 本机不认第二份 `.mcp.json`。
- 谁管什么：项目链可写模型名、baseUrl、MCP、工具开关；项目文件里的 API key **丢掉不读**。密钥：`--api-key` → `ATOM_LLM_API_KEY`（含 cwd `.env`）→ local settings → 用户 settings。非密钥标量：argv → `ATOM_LLM_MODEL` / `ATOM_LLM_BASE_URL` → local → 项目链（近 cwd 赢）→ 用户 → 内置默认。用户层 `model` 为 `{ default, forceDefault? }`（旧字符串视为只有 `default`）；这一层叠进去的值 = 有 `forceDefault` 用它否则 `default`。项目链与本机仍是字符串 `model`。项目 `model` 仍压过用户 pin。
- argv：`--model`、`--base-url`、`--api-key`；`--mcp` 追加（可重复，同名整条替换）；`--no-tools` 不装默认工具包，MCP 工具仍走名单，Skill 加载器不卸。
- MCP 与工具开关：sidecar 本阶段只锁 stdio（`command` / `args` / `env`）。settings 只写 enable/disable 名。同名整条替换。优先级：`--mcp` → local → 项目链近者 → 用户。未写 enable = 已解析清单全可连，再减 disable。disable 跨层并集；enable 以最高层整表替换。工具 allow/deny 是装配期名单：MCP 名 `mcp__<server>__<tool>`，内置短名。deny 跨层并集；某层写了 allow 则以最高层那份 allow 整表替换。没写 allow = 只减 deny。不是运行时权限弹窗。
- 默认集合：CLI 写死 `loop` / 薄 `llm` / 默认工具包（可卸）/ MCP 桥 / Skill 加载器 / `compact` 提供方 / `session` 提供方。配置没有 `plugins: []` 路径表，也**不扫** `plugins/`。
- 跨进程会话（[跨进程会话合同](./issues/07-session-persistence-contract.md)）：官方槽 `session` 读写**会话日志**。贡献方是循环外插件，默认装配装一颗。默认循环可选消费：有提供方则**追加**终态消息与压缩事件，没有则纯内存。不进闭合集。CLI / REPL 管新建、按 id 打开、当前 cwd 最近一次、列表；裸启动永远新会话。
- 最小落盘集：三角消息（含推理块、`toolCall`、工具参数与结果、`isError`）；同一份日志里的**压缩事件**（摘要 + 切点），原文仍在；每条 `assistant` 的提供商 / 模型（写盘时盖当时装配标识，不改 `llm` 槽）；时间戳。日志带 cwd 只为索引。每追加一条终态消息或一次压缩事件就同步追加。不写流式增量。
- 恢复：CLI 从 `session` load 原文消息，交给默认循环工厂的可选初始列表。`Loop` 仍是 `messages` + `prompt`，不加 `hydrate`。下次请求仍把恢复后的原文列表交给 `compact`；压缩事件只用来回溯当时模型看到的视图。明确没有：配置快照、半截流、Abort 半截助手、文件 checkpoint、记忆库、加密、多机同步、存储引擎与路径格式。
- 压缩挂点（[压缩与记忆挂在哪](./issues/06-compaction-and-memory-placement.md)）：官方槽 `compact` 把内存消息列表映射成送给模型的更短视图。不改原列表，不写盘。贡献方循环外插件，默认装配装一颗。默认循环可选消费：每次请求 `llm` 前若有提供方则调用；没有则恒等。记忆不挂槽，本规格不设计记忆库。不改 [ADR-0006](../../docs/adr/0006-default-loop-plugin-closed-set.md) 闭合集。
- 压缩触发与范围（[压缩何时触发、压什么](./issues/14-compaction-trigger-and-scope.md)）：默认提供方按 **阈值 + 溢出恢复** 缩短。`compact(messages, reason)`，`reason` 为 `threshold` | `overflow` | `manual`。阈值：每次请求前调用，提供方可恒等。溢出：`llm` 报出合同上可识别的上下文溢出后，对**原文内存列表**再 compact；必须比恒等更短，否则把溢出交给用户、不再打 `llm`；更短则用新视图再打一次，最多一次。无提供方不 retry。`manual` 预留（低于阈值也缩短）；本阶段 REPL 无 `/compact`。缩短时切点前成摘要、切点后尾部原文保留；切点不得落在一对 tool call / tool result 中间。缩短才写压缩事件。循环事件名不扩。不锁 token 数字、估算算法、提示词模板、自动开关配置键。
- `llm` 失败面：把「可识别的上下文溢出失败」写进 `llm` 合同。仍是 `stream` + Abort，不加方法、不加 usage、不加提供商方言。兼容库 / `atom-llm` 翻译提供商错误；循环只认这个失败面。这是对「零增量」的有意窄修订（见提供商簇）。
- Skill（[Skill 是否独立于插件与工具](./issues/09-skill-vs-plugin-vs-tool.md)）：第四种东西，跟 Agent Skills 核心。带 `SKILL.md` 的按需指令包（`name` / `description` + 正文渐进披露）。不是插件，不是业务 function。搜索根：`$ATOM_AGENT_HOME/skills/` 与 git 根→cwd 沿途 `.atom-agent/skills/`。扫一层 `<name>/SKILL.md`。无运行时 `register`。同名近 cwd 整颗替换（不合并正文）；坏条目跳过并告警。加载器插件启动装一次；`/skills`、`/skill` 与 `skill` 工具每次现扫搜索根（进程内新加的 `SKILL.md` 不必重启）。默认循环零改动。默认工具包不认识 Skill。默认装配另写死 **Skill 加载器插件**：按清单往 `tools` 表登记 `skill({ name })`，把当前 name+description 写进这把工具的 description；正文只在返回值里。空清单仍挂着这把工具（description 写无可用）。allow/deny 若禁掉工具名 `skill`，加载器整把不登记。不要 `skills` 槽。明确没有：Skill 市场、递归 `**/SKILL.md`、扁平 `<name>.md`、per-skill enable、`--no-skills`。
- REPL 手感（[REPL 手感最小集](./issues/10-repl-feel-minimum.md)）：界面仍是流式 REPL，无新官方槽，循环五事件名不变。必须有：**输入历史**（当前进程；存空闲主提示原始行，含斜杠原文；不含 ASK、不含 Skill 展开正文）；粘贴多行合成一条；回合中键盘中断 → 已有 Abort，不杀进程；空闲 stdin EOF、`/exit`、空闲 SIGINT 均退出进程（`/exit` 须 pause stdin，避免 TTY 把事件循环挂住）。斜杠只在空闲主提示、进 `loop.prompt` 之前拦；ASK 里当正文；未知命令报错不进循环。
- 斜杠最小集：`/exit`；`/new`、`/resume`、`/session <id>`、`/sessions`（对齐会话合同）；`/skill <name>`（清单命中则立刻 `loop.prompt`：正文在前，name 后文本接后，空 remainder 也立刻交；未知名报错）；`/skills`（列出 name / desc / 状态 `active|overridden` / 级别 `user|project|local` / 地址，每次现扫）；`/mcps`（列出已解析 MCP 的 name / desc / 状态 `connected|disabled|not-enabled` / 级别 / 地址，已连接的再列出其 tools；改 sidecar 要重启才连上新 server）；`/model`；`/help`（打印本名单，一行一个）。不要 `/compact`、不要改配置的 `/mcp` / `/config`、不要 picker。REPL 上屏已有思考增量（`assistantDelta` `type: "thinking"`）与工具 `arguments`。压缩 / 会话 / 斜杠不经循环总线。ASK 与主提示同一套提交单位。
- `/model`：本会话立刻换模型标识。不重读配置文件、不换插件列表、不改 `llm` 槽、不换 `baseUrl` / API key。只写用户层 `$ATOM_AGENT_HOME/settings.json`。

  | 调用 | 本会话 | `default` | `forceDefault` |
  | --- | --- | --- | --- |
  | `/model` | 不动 | 不动 | 不动；打印当前 / default / forceDefault |
  | `/model <id>` | 换成 `<id>` | 写成 `<id>` | 不动 |
  | `/model <id> --force` | 换成 `<id>` | 写成 `<id>` | 写成 `<id>` |
  | `/model --force` | 不动 | 不动 | 写成当前会话标识 |
  | `/model --unforce` | 不动 | 不动 | 删除该键 |

- 提供商兼容（[提供商兼容包与 llm 槽边界](./issues/11-provider-compat-package-vs-llm-slot.md)）：**兼容库**实现 OpenAI 兼容 `{baseUrl}/chat/completions` 流式 SSE（含现有思考字段映射，仍留在库内）。不是插件，不占槽。npm 包名不锁。`atom-llm` 变薄插件：只 `provide("llm")`，把槽形状译成兼容面再调库。兼容库不依赖内核、循环或槽类型。默认集合只装这颗薄插件；库是依赖，不进 `createDefaultPlugins()` 列表。CLI 把已叠好的 `model` / `baseUrl` / `apiKey` 交给 `createLlmPlugin`。装配持有本进程可变三标量；薄插件每次调用读当前值。`/model` 只改其中 `model`。缺任一标量则启动失败。配置不加 `provider` / `protocol` / 路径覆盖。只有 `atom-llm` 与兼容库自己的测试可 import 该库。本阶段没有多提供商市场、第二家原生协议。v0 规格里「OpenAI 兼容形态另开努力」由本规格收口，仍不改写 v0 正文。

## 实现路线图

内容来自 [日常 CLI 闭环的退出条件](./issues/05-daily-cli-exit-criteria.md)。硬权衡见 [ADR-0009](../../docs/adr/0009-roadmap-four-phases-to-daily-cli.md)。对照 [ADR-0005](../../docs/adr/0005-roadmap-six-phases-to-v0.md)：本图从 v0 产品闭环之后再切四段，不重开 v0 六段。

**日常 CLI 闭环**仍是一段阶段边界。走到它的路线图共四段；最后一段退出即目的地达成。六簇全部必须有。压缩与记忆是两件事：压缩必须有；记忆明确没有。

全程不变量（写在章首，不每行重复）：

1. 不改写 [v0 spec](../pluggable-agent-spec/spec.md)
2. 不改 `loop` / `tools` / `llm` 语义
3. 内核不加第五件套
4. 不预埋空官方槽；新槽只为某段退出条件要求的能力点名
5. 提供商方言不锁进 `llm` 槽
6. 界面仍是流式 REPL，无差分 TUI
7. 无权限弹窗、无默认沙箱
8. 无可嵌入 Runtime、无多智能体
9. 无 npm / 目录插件市场（本图仍无本地 `plugins/` 扫描）

槽规则：允许为某段退出条件要求的能力点名新官方槽；禁止预埋空槽。本阶段实际点名见上节五槽名单。

| 阶段 | 必须有 | 明确没有 | 退出条件 |
| --- | --- | --- | --- |
| 装配与配置 | 用户级 + 项目级能改装配（至少：模型端点、MCP 列表、工具开关）；宿主仍只吃已解析的同进程模块 | 插件市场、远程配置中心、发现逻辑进内核 | 不改源码、只改配置，启动后的装配跟着变 |
| 跨进程会话 | 重启后能找回对话（落盘集与恢复面见会话合同） | 多机同步、加密、记忆库 | 关掉进程再开，上一会话的消息还在 |
| 长上下文 | 压缩改变下一轮模型可见历史 | 记忆、压缩算法/阈值（数字不锁） | 长对话下一轮送给模型的是压缩后的视图；会话日志不因此只剩压缩稿 |
| Skill · 兼容包 · REPL 手感 | 能按需加载 Skill；新包接上至少一种提供商兼容面且方言不进 `llm` 槽；REPL 达到本图手感最小集 | Skill 市场、多提供商市场、差分 TUI、完整 readline 选型 | 三件事都能单独验过。此段退出 = **日常 CLI 闭环** |

实现前若碰到下列问题，另开努力，不要在本规格里补空槽或第五件套：本地 `plugins/` 扫描与 hooks；跨会话记忆库；权限 / 沙箱；并行工具批；图片一等化；第二家原生协议。

## Testing Decisions

好的测试只测对外行为，不测实现细节：不断言内核内部字典形状、不断言循环私有调度器、不把提供商 HTTP 方言当成官方槽合同、不断言会话存储引擎与路径格式、不断言压缩 token 数字。验收以四段阶段边界的退出条件为准。

唯一测试接缝仍是插件宿主的进程内加载面（沿用 v0）。测试装配宿主、传入已解析的同进程插件模块（及其依赖），然后只观察：

- Context 上五颗官方槽与未点名键是否按契约可取
- 默认循环在有 / 无 `compact`、有 / 无 `session` 时的可选消费（恒等视图、缩短视图、溢出最多 retry 一次、终态追加）
- 匿名事件总线上仍是循环契约锁死的五名；压缩过程与斜杠不上新事件
- 回合的可见效果：原文内存列表不被 compact 改写；缩短时返回摘要与切点；溢出失败可识别
- CLI 作为宿主外适配器：读分层配置叠出模块列表；`--no-tools` 卸默认工具包、不卸 Skill 加载器；缺三标量启动失败

不要为配置解析、压缩、会话、Skill、兼容库、REPL 再开平行接缝。假 `llm`、假 `compact`、假 `session`、Skill 加载器、薄 `atom-llm` 都是这条接缝上的适配器。REPL 测的是 stdin/stdout：用假 `llm` 驱动，断言斜杠拦截、输入历史、粘贴多行、思考增量上屏。兼容库的 HTTP / SSE 方言只允许在兼容库测试与 `atom-llm` 测试里出现。

按阶段验收（全部走同一接缝）：

- 装配与配置：只改 JSON（用户 / 项目 / 本机 / argv / env），启动后的模块列表与三标量跟着变；宿主仍只吃已解析模块
- 跨进程会话：关掉再开，按 cwd 最近一次或 id 能 load 出原文三角消息；压缩事件在同一日志且原文仍在；裸启动是新会话
- 长上下文：假 `llm` 下阈值可恒等、超预算缩短；切点不落在 tool 对中间；溢出则 `reason=overflow` 再打至多一次；不能更短则把溢出交给用户
- Skill · 兼容包 · REPL 手感：一层 `SKILL.md` 进清单，`skill({ name })` 返回正文；`/skill` 立刻 prompt；`/skills` 现扫列出状态与级别；兼容面一次真实或录制的 `{baseUrl}/chat/completions` SSE 经薄插件跑通；REPL 手感最小集可单独验。此段过 = **日常 CLI 闭环**

测试运行器沿用现有约定：`vite-plus/test`。真模型与真 MCP 的检查允许标为需要外部依赖；循环、压缩可选消费、会话追加、配置叠层必须用假适配器在默认测试里锁死。

## Out of Scope

- 在本规格内实现生产代码（目的地是规格；实现是另一次努力）
- 改写 [v0 规格](../pluggable-agent-spec/spec.md)、改官方三槽语义、内核第五件套
- 把提供商方言锁进 `llm` 槽；多提供商市场；Anthropic / Gemini 原生协议
- 可嵌入 Runtime、多智能体平台
- 危险操作确认、权限系统、沙箱
- 并行工具批、图片一等化
- plan/todo、后台 bash
- 差分 TUI、完整 readline 选型、具体键位
- npm / 远程插件市场协议
- 本地 `plugins/` 目录扫描（后续图）
- hooks（后续图；本图目录也不扫）
- 跨会话记忆（旁路存储）
- Skill 市场、递归 / 扁平 Skill 布局、`--no-skills`、本阶段 `/compact`
- 远程配置中心、HTTP MCP、热重载装配
- 完整企业产品：多租户、RBAC、部署、计费
- 存储引擎与会话路径格式、压缩算法与 token 精确阈值

## Further Notes

参考系（解剖不是合同）：

- Skill → 按需指令包，不是插件也不是业务工具：[调研笔记](./research/skill-in-coding-agents.md) · [Skill 在主流 coding agent 里是什么](./issues/01-skill-in-coding-agents.md)
- 长上下文 → 压缩改下一轮模型可见历史：[调研笔记](./research/context-compaction-in-coding-agents.md) · [长上下文：压缩与记忆怎么挂](./issues/02-context-compaction-in-coding-agents.md)
- 跨进程会话 → 本地对话日志 + 按 cwd/id 找回：[调研笔记](./research/session-persistence-in-coding-agents.md) · [跨进程会话常见合同](./issues/03-session-persistence-in-coding-agents.md)
- 装配与配置 → 用户默认 + 项目覆盖：[调研笔记](./research/assembly-config-in-coding-agents.md) · [装配与配置：项目级和用户级从哪来](./issues/04-assembly-config-in-coding-agents.md)

ADR：

- [0001 内核是插件宿主，不是回合循环](../../docs/adr/0001-kernel-is-plugin-host.md)
- [0002 插件同构，v0 只点名三个槽](../../docs/adr/0002-plugin-slots.md)（v0 名单；本阶段加槽见 CONTEXT.md 与 [本阶段点哪些官方槽](./issues/12-official-slots-this-stage.md)）
- [0003 v0 是流式 REPL coding CLI，MCP 只作工具桥](../../docs/adr/0003-v0-coding-cli-boundary.md)
- [0004 企业能力靠加槽长出来，不在内核预埋接缝](../../docs/adr/0004-enterprise-is-later-phases-not-kernel-seams.md)
- [0005 到 v0 产品闭环共六段，其后加槽不排序](../../docs/adr/0005-roadmap-six-phases-to-v0.md)
- [0006 默认循环插件：三角消息 + 推理块 + 回合机械装置](../../docs/adr/0006-default-loop-plugin-closed-set.md)
- [0007 宿主运行时选用官方 Cordis](../../docs/adr/0007-cordis-as-host-runtime.md)
- [0008 项目目标：极简、一切皆插件、企业能力可长出的 agent 系统](../../docs/adr/0008-project-goal.md)
- [0009 到日常 CLI 闭环共四段，记忆不进退出条件](../../docs/adr/0009-roadmap-four-phases-to-daily-cli.md)

已关决策票：[日常 CLI 闭环的退出条件](./issues/05-daily-cli-exit-criteria.md)、[压缩与记忆挂在哪](./issues/06-compaction-and-memory-placement.md)、[跨进程会话合同](./issues/07-session-persistence-contract.md)、[装配与配置形态](./issues/08-assembly-and-config-shape.md)、[Skill 是否独立于插件与工具](./issues/09-skill-vs-plugin-vs-tool.md)、[REPL 手感最小集](./issues/10-repl-feel-minimum.md)、[提供商兼容包与 llm 槽边界](./issues/11-provider-compat-package-vs-llm-slot.md)、[本阶段点哪些官方槽](./issues/12-official-slots-this-stage.md)、[压缩何时触发、压什么](./issues/14-compaction-trigger-and-scope.md)。

下一跳：用 `/to-tickets` 按四段阶段边界拆垂直切片。本规格不拆工程任务列表。
