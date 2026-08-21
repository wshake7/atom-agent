# 长上下文：压缩与记忆怎么挂

- 票：`.scratch/daily-cli-spec/issues/02-context-compaction-in-coding-agents.md`
- 取证日期：2026-08-21
- 本笔记只描述上游事实，**不做我们自己挂循环 / 插件 / 新槽的决策**。

对照对象与快照：

| 对象 | 权威入口 | 本笔记用的快照 |
|------|----------|----------------|
| pi | https://github.com/earendil-works/pi | 本地 `C:\tmp\pi-kernel-src` @ `b7bb00b`（2026-08-19 `main`） |
| Claude Code | https://code.claude.com/docs | 2026-08-21 fetch；公开仓库主要是文档/changelog，**没有**与 pi/DSH/Codex 同级的完整 CLI 源码可核算法 |
| DeepSeek Harness | https://github.com/deepseek-ai/deepseek-harness | 本地 `C:\tmp\deepseek-harness` @ `141eb6f`（2026-08-19，`dsh-0.1.0-rc.8`） |
| Codex CLI | https://github.com/openai/codex | 本地 `C:\tmp\codex-src` @ `2151d3a`（2026-08-21） |

先给结论对照，再分家展开。每家都按票面五问：触发、输入、输出、能否关、是否等于会话持久化。

---

## 对照表

| | **挂在哪一层** | **触发** | **输入** | **输出** | **能否关** | **是否等于会话持久化** |
|---|---|---|---|---|---|---|
| **pi** | 产品层 `pi-coding-agent`；循环内核只有 `transformContext` 钩子 | 阈值、溢出恢复、`/compact`；`/tree` 另有分支摘要 | 切点之前的会话消息（序列化后含 user/assistant/thinking/tool）；工具结果在摘要请求里截到 2k 字符 | 会话树上追加 `compaction` 条目；发给模型的是摘要 + `firstKeptEntryId` 之后的消息 | 自动可关（`compaction.enabled=false`）；手动 `/compact` 仍可用 | **否**。JSONL 仍保留被摘要前的原文；压缩只改「下次发给模型看什么」 |
| **Claude Code** | 产品会话层（文档：接近窗口上限时自动压；hooks 在循环外的 `PreCompact`/`PostCompact`） | 接近上下文上限的 auto-compact；`/compact [instructions]` | 会话对话历史（文档称 `/compact` **替换对话为结构化摘要**） | 会话内摘要替换；随后从磁盘再注入根 `CLAUDE.md`、auto memory、部分 skill | 窗口可调（`/autocompact`、`autoCompactWindow`、`CLAUDE_CODE_AUTO_COMPACT_WINDOW`）；`PreCompact` 可挡；官方 env 表**未**列出一键永久关掉 auto-compact 的开关。auto memory 可关 | **否**。transcript JSONL 是另一套；memory/`CLAUDE.md` 是跨会话旁路；`/clear` 清对话但留项目记忆 |
| **DeepSeek Harness** | 可选能力接缝 `ctx.compaction`，**不是** agent-loop 脊柱 | `agent/pre-step` 压力；`agent/request-error` 规范溢出；人类 `/compact` | 当前 surface（`user/message` / `assistant/message` / `tool/result`）；可先无模型剪枝过大 tool result | log-only `compaction/*` + 一条带 `surfaceOp.replace` 的 user 摘要节点；原文留在 append-only log | `auto: false` 只留手动；不装插件则没有压缩。记忆不是一等插件 | **否**。持久化是另一条 `ctx.sessionPersistence` 接缝；压缩只改派生 history |
| **Codex CLI** | `codex-core` 的 session task（自动/手动 compact 任务） | 自动：`model_auto_compact_token_limit` 或满有效窗口；手动：`/compact` / `thread/compact/start` | 当前 thread 历史 + `compact_prompt`（或缺省摘要 prompt）；远端走 Responses compact API | 用摘要 **替换** 活动 history，并在 rollout 写入 `CompactedItem`；UI 项 `contextCompaction` | 可改阈值；满窗口仍会压。仓库 markdown **没有**「关闭 auto-compact」一等开关。memories 功能另关 | **否**。rollout 仍是会话日志；memories 管道从 rollout 抽旁路文件 |

跨产品共性（证据能撑住的）：

1. **压缩改的是「下一轮模型可见历史」**，不是把磁盘上的会话原文抹掉（pi / DSH 明确；Codex 用 `CompactedItem` 做模型上下文切点但仍写 rollout；Claude 文档强调摘要替换对话，同时 transcript 另存）。
2. **记忆（若有）是另一条路径**：跨会话的文件/索引（Claude `CLAUDE.md` + auto memory；Codex `~/.codex/memories`；DSH 只有可选第三方 MCP 示例）。没有一家把 compaction 和 session persistence 做成同一个服务。
3. **循环内核通常不内置压缩策略**：pi 循环只留 `transformContext`；DSH 文档写 compaction 不是 loop spine。Codex 把 compact 做成独立 `SessionTask`，仍在 core，但是独立任务而不是普通 turn 的必选步骤。Claude 公开文档把它放在会话/产品行为 + hooks，没有开源循环实现可核对。

---

## 1. pi

### 挂在哪一层

压缩**不是** `agentLoop` 的必选件。内核只提供：

- `transformContext`：请求前把 `AgentMessage[]` 剪枝/注入（`packages/agent/src/types.ts`，`agent-loop.ts` 在 `convertToLlm` 之前调用）。
- coding-agent 的 `transformContext` 默认只转给扩展 `emitContext`，**不是**内置摘要器（`packages/coding-agent/src/core/sdk.ts`）。

产品实现在 `pi-coding-agent`：`docs/compaction.md` + `src/core/compaction/*`。算法副本也在 `packages/agent/src/harness/compaction/`，但现行 CLI 闭环仍是 `Agent` + JSONL `SessionManager`（见 `.scratch/pluggable-agent-spec/research/pi-kernel-anatomy.md`）。自定义角色 `compactionSummary` / `branchSummary` 由产品 `convertToLlm` 改写成 user 文本，循环本身没有这些 role。

### 触发

自动：

```
contextTokens > contextWindow - reserveTokens
```

默认 `reserveTokens = 16384`。另有 **overflow**：provider 报上下文溢出或可恢复的 length stop 时 compact 并最多 retry 一次（`agent-session.ts` `_checkCompaction`，reason `"threshold" | "overflow"`）。

手动：`/compact [instructions]`。扩展 `session_before_compact` 的 `reason` 为 `"manual" | "threshold" | "overflow"`。

分支摘要是另一机制：`/tree` 换分支时可选总结被放弃的枝。

### 输入

- 从最新消息往回走到 `keepRecentTokens`（默认 20k）切点。
- 切点只允许 user / assistant / bashExecution / custom / branch_summary，**不能切在 tool result**（必须跟 tool call）。
- 单 turn 超过预算会 split turn，分别摘要历史与 turn prefix。
- 摘要器看到的是 `serializeConversation()` 文本，不是继续对话；**工具结果在序列化时截到 2000 字符**。
- 重复压缩从上一轮 `firstKeptEntryId` 再摘要，避免丢掉上次保留的消息。

### 输出

- 会话 JSONL **追加** `CompactionEntry`（`type: "compaction"`，含 `summary`、`firstKeptEntryId`、`tokensBefore`、可选 `usage` / `details.readFiles|modifiedFiles`）。
- 下次 LLM 看到：`system` + 摘要 + 从 `firstKeptEntryId` 起的消息。`convertToLlm` 把 `compactionSummary` 包成：

```
The conversation history before this point was compacted into the following summary:
<summary>…</summary>
```

被摘要的旧 entry **仍在文件里**，只是不送进模型。

### 能否关

```json
{ "compaction": { "enabled": true, "reserveTokens": 16384, "keepRecentTokens": 20000 } }
```

`enabled: false` 关掉自动压缩；**仍可** `/compact`。RPC 另有 `set_auto_compaction`。扩展可 `cancel` 或提供自定义 summary。

### 是否等于会话持久化

**否。** 会话是 `~/.pi/agent/sessions/` 下的 JSONL 树（header + `id`/`parentId`）。`--no-session` 才不落盘。压缩条目是树上的一种 entry，用来重建模型上下文；持久化照样保存完整枝（含未送进模型的旧消息）。`/tree` 分支摘要也是往树上追加 `branch_summary`，不是另写记忆库。

pi **没有** Claude/Codex 那种一等「跨会话 auto memory」产品。上下文管理 = 会话树 + compaction/branch summary + `transformContext`。

---

## 2. Claude Code

### 挂在哪一层

第一方文档把压缩放在**会话上下文窗口管理**，不在开源循环里：

- 接近上限自动 compact，效果与 `/compact` 相同（[Explore the context window](https://code.claude.com/docs/en/context-window)）。
- Hooks 生命周期把 `PreCompact` / `PostCompact` 画在每轮 agentic loop **之后**、`SessionEnd` 之前（[hooks](https://code.claude.com/docs/en/hooks.md)）。matcher：`manual` = `/compact`，`auto` = 窗口满时 auto-compact。
- 公开 `github.com/anthropics/claude-code` 能核到的是 changelog / 插件技能（如 PreCompact 可 block），**不能**像 pi/DSH 那样指出循环文件里的 cut-point 算法。未采用非官方「泄露源码」镜像。

记忆是**另一层**：每个会话从空窗口开始；跨会话靠你写的 `CLAUDE.md` 和 Claude 自写的 auto memory（[memory](https://code.claude.com/docs/en/memory)）。

### 触发

- **Auto-compact**：接近模型上下文上限。默认阈值随模型变（文档指向 [Default auto-compact thresholds](https://code.claude.com/docs/en/model-config#default-auto-compact-thresholds)；changelog 曾把警告阈值从 60% 调到 80%，并加三次 compact 后 thrash 保护）。
- **手动**：`/compact [instructions]`，可指定摘要焦点。
- **提前压**：`/autocompact [auto|<size>]`（v2.1.221+），例如 `/autocompact 500k`。
- **PreCompact**：主动压可被 hook block 后继续未压缩对话；若已是 API context-limit **恢复**路径，block 后原错误会冒出来、当前请求失败。

### 输入

文档把 compact 描述为「把 conversation history 收成结构化摘要」。`PreCompact` 输入含 `trigger` 与 `custom_instructions`（手动时是 `/compact` 后的文字；auto 时为空）。摘要请求从 v2.1.198 起继承会话的 extended thinking 配置。

没有开源实现说明是否整段消息还是只压 tool 结果。文档明确：path-scoped rules 和嵌套 `CLAUDE.md` 是读文件时进 **message history** 的，所以会被一起摘要掉。

### 输出

- `/compact` **替换对话为结构化摘要**（context-window 时间线）。
- 压缩后从磁盘再注入：system prompt / output style（本就不在 message history）、项目根 `CLAUDE.md` 与 unscoped rules、auto memory。Skill body 再注入但有上限（每个 skill 5k tokens、合计 25k，先丢最旧）。hooks 是代码不是上下文。
- `PostCompact` 收到 `compact_summary`。
- 会话开始类 hooks 的 `source` 可取 `"compact"`：压缩后会当一次会话再装载。

### 能否关

| 机制 | 官方开关 |
|------|----------|
| 自动压缩窗口 | `/autocompact`、`--autocompact`、`autoCompactWindow`、env `CLAUDE_CODE_AUTO_COMPACT_WINDOW`（100000–1000000 纯整数） |
| 单次压缩 | `/compact`；PreCompact 可 block |
| auto memory | 默认开；`/memory` 开关写入 `autoMemoryEnabled`；项目 `"autoMemoryEnabled": false`；`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` |
| 对话清空但留记忆 | `/clear` |

2026-08-21 的 [env-vars](https://code.claude.com/docs/en/env-vars.md) **没有** `DISABLE_AUTO_COMPACT` 一类总开关。能把窗口调大、或用 PreCompact 挡住主动压缩；API 已溢出时的恢复路径挡掉会让请求失败。是否还能在 `/config` UI 里关 auto-compact：**本笔记未从 settings 全文抽出独立 boolean**，标为未核实。

### 是否等于会话持久化

**否。**

- 会话 transcript：`~/.claude/projects/<project>/<session-id>.jsonl`；`--continue` / `--resume` / `/resume`。可用 `CLAUDE_CODE_SKIP_PROMPT_HISTORY` 或 `-p --no-session-persistence` 抑制写入。
- 压缩：同一会话里缩小模型可见对话。
- 记忆：`CLAUDE.md` 与 `~/.claude/projects/<project>/memory/`（`MEMORY.md` + topic 文件）。auto memory **排除**在 transcript 的 `cleanupPeriodDays` 清理之外。文档原话：每个会话窗口是新的；两种机制把知识带到下一会话。

troubleshooting 写明：只在对话里说过、没写进 `CLAUDE.md` 的指示，compact 后会丢。

---

## 3. DeepSeek Harness

### 挂在哪一层

文档原句：compaction 是 **one optional capability，不是 agent-loop spine**（`docs/subsystems/compaction.md`）。接缝拆成 bash 同款三角：

| 包 | 角色 |
|----|------|
| `@deepseek-ai/dsh-compaction` | Service Definition：`ctx.compaction` |
| `@deepseek-ai/dsh-compaction-basic` | Provider：压力、保留尾、`llm.stream()` 摘要 |
| `@deepseek-ai/dsh-command-compact` | Consumer：人类 `/compact` → `compactNow()` |
| `@deepseek-ai/dsh-compaction-tool-result-pruner` | 可选 companion：无模型剪枝过大 `tool/result` |

没有面向模型的 compact **工具**。

### 触发

`CompactionTrigger = 'pressure' | 'context-overflow'`。

- **pressure**：串行 `agent/pre-step`、在派生请求之前。默认 `thresholdRatio: 0.8`（`floor(routedContextWindow × ratio)`），保留尾默认 `retainRatio: 0.16`。
- **overflow**：`agent/request-error` 且适配器把错误归一成规范上下文溢出；绕过普通阈值做一次最大平衡头压缩。只有 surface `replaceGeneration` 前进才授权新 retry turn。
- **手动**：`/compact` 无参数；空闲时压一段「有用且平衡」的旧 span，即使低于压力。进行中 turn 报 `busy`。

低于压力的 step **不会**先剪枝。

### 输入

- 度量对象是整次请求信封：system prompt、tools、routing、assistant、tool results、缓冲 context、steering（`ctx.tokenMeter`）。
- **表面压缩只收缩派生 history**，不压缩 system/tools/session prefix。
- 触发后可选 `toolResultPruner`：超 `thresholdChars`（默认 8192 码点）的 tool 文本改成 head+标记+tail。
- 摘要调用：把被阴影区间的对话 **原样回放**（含 system、tools、图片引用），最后加一条 compaction instruction；`purpose: compaction`。只取返回文本，不要 reasoning / tool call。

切边必须 tool-call/result 配对；不保护整个 turn，所以一次失控 turn 里已闭合的前半步可以压。

### 输出

成功路径（surface 上**不能**出现 `compaction/*`）：

1. log-only `compaction/start`（锁）
2. 摘要
3. log-only `compaction/summary`
4. **唯一 surface 突变**：`user/message` + `surfaceOp: { op: 'replace', start, end }`，source = `compactCheckpointSource(compactionId)`，正文用 `<compacted-summary>` 包起来
5. log-only `compaction/end`

`deriveMessages()` 看到：一条 user 摘要 + 保留尾。被阴影事件仍在原始 log，replay 确定。

### 能否关

- 不装 compaction 插件：没有该能力。
- `auto: false`：不注册压力/溢出监听，只留 `compactNow` / `compactRegion`。
- `maxOverflowRetries: 0`：关掉溢出恢复（仍可压力压）。
- 不装 command-compact：自动化面只有自动压力压。

### 是否等于会话持久化

**否。** `Session` 是 append-only `SessionEvent` log；LLM 历史是派生的。落盘是 `ctx.sessionPersistence`（JSONL/SQLite 等）。压缩失败的 `changed`/`summary` 仍可能把尝试写进 log，但 surface 不变。

### 记忆插件？

交付组合 **没有** 一等 memory 插件。`examples/mcp-memory` 是默认关闭的第三方 MCP 示例（Memorix / MCP reference memory / Engram），经 `dsh-mcp-client` 暴露 `mcp__<server>__<tool>`。DSH 不下载服务器、不选 embedding、不维护遗忘策略。这与 compaction 无关。

---

## 4. Codex CLI

### 挂在哪一层

压缩在 **`codex-core` 的 session task**，不是 slash-docs 里一句空话：

- 手动：`CompactTask`（`codex-rs/core/src/tasks/compact.rs`）→ token-budget **或** remote compact V2/V1 **或** 本地 `run_compact_task`。
- 自动：`run_inline_auto_compact_task`（`compact.rs`），以及 remote 变体。
- App server：`thread/compact/start`；通知 `item.type = contextCompaction`（可自动发生）。

官方 CLI 文档把 slash 指到 https://developers.openai.com/codex/cli/slash-commands；仓库 `docs/slash_commands.md` 本身没有算法。配置注释在 `config_toml.rs`：`model_auto_compact_token_limit` = 「触发自动压缩会话历史的 token 阈值」。

记忆是 **另一套管线**（`codex-rs/memories/README.md`）：根会话启动后后台 Phase 1 从 rollout 抽记忆、Phase 2 合并到 `~/.codex/memories`。条件包括 session 非 ephemeral、memory feature 打开、非 sub-agent。

### 触发

自动（`context_window.rs`）：

- 作用域 `Total`：拿全部 active context tokens 比 `auto_compact_token_limit`。
- 作用域 `BodyAfterPrefix`：只计当前 compaction window 前缀之后新增的 token。
- `token_limit_reached` = 达到（可加 fallback buffer 的）auto-compact 限 **或** 达到有效上下文窗口（`effective_context_window_percent`，默认 95%）。

手动：用户 `/compact`（app-server 注释）或 RPC `thread/compact/start`。可 abort。

策略优先级（手动任务）：`Feature::TokenBudget` → remote V2（若 feature 开）→ remote V1/V2 能力 → 本地摘要。

### 输入

- 本地路径：把 `compact_prompt`（或内置 `SUMMARIZATION_PROMPT`）当作合成 user 文本，连同当前 history 做一次 compaction turn（`CodexResponsesRequestKind::Compaction`）。
- 远端：测试挂在 `POST .../v1/responses/compact`（`compact_remote` / 测试夹具）。
- 若 compact 自己溢出：从 history **头**丢掉最旧 item 以保前缀缓存，直到只剩 1 条。
- 用户消息在替换 history 时另有 `COMPACT_USER_MESSAGE_MAX_TOKENS = 20_000` 上限。

### 输出

- `replace_compacted_history(...)`：活动模型历史换成摘要（`SUMMARY_PREFIX` + 最后一条 assistant 文本）以及收集到的 user 消息骨架。
- 预/手动 compact 用 `InitialContextInjection::DoNotInject`，下一普通 turn 会重新注入 initial context。
- Mid-turn compact 必须把 initial context 插在最后一条真 user 消息之上（训练假设摘要在 history 末尾）。
- Rollout 写入 `CompactedItem`（可带 `replacement_history` + `window_number`）。`ModelContextScan` 用「看到带 replacement 的 compaction + 完整 turn context」作为重建模型上下文的切点；**存储仍保留更旧的 rollout item**，只是 resume 扫描可以停。
- 完成后警告：长线程多次 compact 会降低准确性，建议新开 thread。

### 能否关

- 可配置 `model_auto_compact_token_limit` 与 `model_auto_compact_token_limit_scope`、`compact_prompt`。
- 有效窗口满仍会 `full_context_window_limit_reached` 而强制压。
- 仓库 `docs/*.md` **没有**「disable auto compact」配置项。把 limit 设极大只能推迟 scoped 阈值，不能取消满窗口路径（源码如此）。
- Memories：README 写明 feature 关闭则管道不跑；与 compact 开关独立。

### 是否等于会话持久化

**否。** 会话/thread 有 rollout JSONL（含 inference、tool、compaction checkpoint）。Compact 改的是 **下一步送给模型的 history 视图** 和 rollout 上的 `CompactedItem` 切点。Memories 是启动后对已结束/空闲 rollout 的旁路抽取（`raw_memory`、`rollout_summary`、`MEMORY.md` 等），跨 thread，不是把当前窗口压进同一条 log。

---

## 5. 对后续「挂在哪」有用、但本票不做的观察

这些只是对照事实，不是方案：

- 四家里，**只有 DSH 把 compaction 做成可拔插接缝**（定义 / 后端 / `/compact` / 可选 pruner），并写明 loop 不拥有它。
- pi 的循环只留 `transformContext`；真正摘要、切点、会话条目都在 coding-agent。
- Codex 把 compact 放进 core session task，同时又把 memories 放进独立 crate + 启动后台任务。
- Claude 文档把 compact 与 memory 分栏写，并强调 compact 后哪些磁盘文件会再注入——产品上已经当两件事。
- 会话持久化（JSONL/SQLite/rollout）在三家开源实现里都是「全量或近全量 log + 派生可见历史」；压缩是派生层或替换层，不是 persistence API。

---

## 来源

### Fetch / 页面

- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/compaction.md
- https://code.claude.com/docs/en/context-window
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/sessions
- https://code.claude.com/docs/en/hooks.md
- https://code.claude.com/docs/en/commands.md
- https://code.claude.com/docs/en/env-vars.md
- https://code.claude.com/docs/en/model-config.md
- https://code.claude.com/docs/llms.txt
- https://github.com/deepseek-ai/deepseek-harness
- https://github.com/openai/codex
- https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md

### 本地源码

- `C:\tmp\pi-kernel-src` @ `b7bb00b`
- `C:\tmp\deepseek-harness` @ `141eb6f`
- `C:\tmp\codex-src` @ `2151d3a`

### 命令

```powershell
smart-search doctor --format json
smart-search deep "coding agent context compaction vs memory: pi compaction, Claude Code auto-compact, DeepSeek Harness, Codex CLI" --format json
smart-search search "pi coding agent compaction context compression transformContext" --validation balanced --extra-sources 1 --timeout 90 --format json --output C:\tmp\smart-search-evidence\20260821-context-compaction\01-pi-search.json
smart-search search "Claude Code auto-compact memory documentation official" --validation balanced --extra-sources 2 --timeout 90 --format json --output C:\tmp\smart-search-evidence\20260821-context-compaction\02-claude-search.json
smart-search search "OpenAI Codex CLI context compaction compact memory documentation github.com/openai/codex" --validation balanced --extra-sources 2 --timeout 90 --format json --output C:\tmp\smart-search-evidence\20260821-context-compaction\03-codex-search.json
smart-search context7-docs "/anthropics/claude-code" "auto-compact compact context memory PreCompact" --format json --output C:\tmp\smart-search-evidence\20260821-context-compaction\06-c7-claude.json
smart-search context7-docs "/openai/codex" "compact compaction context window memory" --format json --output C:\tmp\smart-search-evidence\20260821-context-compaction\07-c7-codex.json
smart-search fetch "https://code.claude.com/docs/en/memory" --format markdown --output C:\tmp\smart-search-evidence\20260821-context-compaction\04-claude-memory.md
smart-search fetch "https://code.claude.com/docs/en/context-window" --format markdown --output C:\tmp\smart-search-evidence\20260821-context-compaction\08-claude-context-window.md
smart-search fetch "https://code.claude.com/docs/en/hooks.md" --format markdown --output C:\tmp\smart-search-evidence\20260821-context-compaction\13-claude-hooks.md
git clone --depth 1 https://github.com/openai/codex.git C:\tmp\codex-src
```

### 未核实 / 缺口

- Claude Code compact 的 cut-point、是否单独剪 tool 结果、`/config` 是否有 auto-compact boolean：官方文档未给出实现级描述；未使用非官方源码镜像。
- Claude「Resume from a summary」小节在 sessions 页存在标题，fetch 正文残缺，未当完整行为描述。
- Codex 官方 slash 页本次 fetch 被站点导航稀释；手动 compact 以 app-server README + `CompactTask` 源码为准。
- `smart-search search` 的合成 `content` 不可靠（曾臆造不存在的 `docs/guides/context-compaction.md`）；主张以 fetch 与 clone 为准。
- doctor：`ok: true`；Exa 连通性 warning（HTTP 400），本任务未依赖 Exa 成稿。
