# 本阶段点哪些官方槽

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status: resolved
Blocked by: 05, 06, 07, 08, 09

## Question

日常 CLI 闭环**点名哪些新官方槽**（可以为空）？

规则已锁：只为退出条件要求的能力点名；不改 `loop` / `tools` / `llm` 语义；不预埋空槽；内核无第五件套。

前序各簇合同必须先关：退出条件、压缩与记忆、跨进程会话、装配与配置、Skill。REPL 手感与提供商包默认不加槽，除非那些票的答案改了这一点。

至少裁定：

- 新增官方槽名单（零个也是合法答案）
- 每个新槽的一句话语义、谁贡献、谁消费
- 未点名键继续允许
- 明确没有：为企业阶段预留 `telemetry` / `sandbox` 空位

不写代码。结案时更新 `CONTEXT.md` 的官方槽列表。

## Answer

本阶段官方槽就是这五颗，名单关闭。不改 `loop` / `tools` / `llm` 语义。内核不加第五件套。插件仍可贡献未点名键，那些键不是合同。不为后续阶段预点名空槽。

| 槽 | 阶段 | 一句话 | 贡献 | 消费 |
| --- | --- | --- | --- | --- |
| `loop` | v0 | 一次模型 ↔ 工具回合 | 循环插件 | CLI |
| `tools` | v0 | 工具表 | 工具类插件（含 MCP 桥、Skill 加载器） | 循环 |
| `llm` | v0 | 可流式、可 Abort 的模型端口；本阶段零增量 | 薄 `atom-llm` | 循环 |
| `compact` | 日常 CLI | 内存消息列表 → 送给模型的只读更短视图；不改原列表、不写盘 | 循环外插件；默认装配装一颗 | 默认循环可选 |
| `session` | 日常 CLI | 跨进程读写会话日志 | 循环外插件；默认装配装一颗 | 默认循环可选追加；CLI 新建 / 打开 / 列表 |

新增两槽的细节仍活在 [压缩与记忆挂在哪](./06-compaction-and-memory-placement.md) 与 [跨进程会话合同](./07-session-persistence-contract.md)。装配 / Skill / REPL / 兼容包簇都不加点名。

明确没有：`telemetry`、`sandbox`、`config`、`skills`、`hooks`、`commands`、记忆槽，以及任何空官方槽。

`CONTEXT.md` 的 **槽** 保持两行写法，并写明本阶段不再点名其它官方槽。不另写 ADR。

## Comments

- [提供商兼容包与 llm 槽边界](./11-provider-compat-package-vs-llm-slot.md) 结案：兼容包簇不点名新官方槽；`llm` 零增量。REPL 手感已同样不加点名。本票只汇总压缩 / 会话已点名的槽，外加是否还有别簇要加。
- Q1–Q4 皆 A：五槽名单关闭；未点名键仍允许；无空槽占位；术语表保持 v0 三槽 + 本阶段两槽。结案确认。
