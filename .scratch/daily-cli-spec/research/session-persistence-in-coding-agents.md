# 跨进程会话：三家落盘合同

- 票：`.scratch/daily-cli-spec/issues/03-session-persistence-in-coding-agents.md`
- 取证日期：2026-08-21
- 本笔记只描述上游事实，**不决定我们的存储引擎，也不决定是否加 `session` 槽**。

源码快照：

| 产品 | 仓库 | 快照 |
|------|------|------|
| pi | `C:\tmp\pi-kernel-src`（`https://github.com/earendil-works/pi`） | `b7bb00b`（2026-08-19 附近，`main`） |
| Codex CLI | `C:\tmp\codex-src`（`https://github.com/openai/codex`） | `2151d3a` |
| Claude Code | 闭源 CLI；会话合同以第一方文档为准 | docs fetch 2026-08-21 |

---

## 对照一览

| 问题 | pi（现行 CLI） | Claude Code CLI | Codex CLI |
|------|----------------|-----------------|-----------|
| 会话本体 | 每会话一个 JSONL 树 | 每会话一个 JSONL transcript | 每 thread 一个 JSONL **rollout** |
| 路径 | `~/.pi/agent/sessions/--<cwd>--/<ts>_<uuid>.jsonl` | `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` | `~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<thread-id>.jsonl` |
| 默认恢复 | `pi -c` = 当前 cwd 最近一次；`pi -r` / `/resume` 选 | `claude --continue` = 当前目录最近；`--resume` 选 | `codex resume --last` = 当前 cwd 最近；无参打开 picker |
| 压缩 | **同一 JSONL**：追加 `compaction` / `branch_summary` 条目 | **同一 transcript**：`/compact` 改上下文；原文仍在 JSONL。另有 auto memory 目录 | **同一 rollout**：`Compacted` 项。另有 `~/.codex/memories/` + sqlite memories DB |
| 明确不存 | 半截 provider 流；`pending` 助手消息；`--no-session` 不落盘 | 若干启动 flag、后台 bash/monitor、部分权限模式；JSONL schema 不对外承诺 | `AdditionalTools` / `CompactionTrigger` / 大量瞬时 EventMsg；memory pipeline 的 developer 消息 |

---

## 1. pi

权威文档：`packages/coding-agent/docs/sessions.md`、`session-format.md`、`compaction.md`。现行产品循环仍是内存 `Agent` + JSONL `SessionManager`（见既有笔记 `.scratch/pluggable-agent-spec/research/pi-kernel-anatomy.md`）。`packages/agent/docs/harness.md` 描述的 **AgentHarness**（三存储：entries / registers / usage；Memory / JSONL v4 / SQLite）是规格与 `session-backends`，**不是**当前 `pi` CLI 默认路径：`AgentHarness.create()` 对已有记录抛 `HarnessNotImplemented("create.restore")`。

### 1.1 存什么

JSONL **header**（第一行，不进树）：

```json
{"type":"session","version":3,"id":"<uuid>","timestamp":"<ISO>","cwd":"<path>"}
```

fork/clone 可带 `parentSession`（源文件路径）。版本：v1 线性、v2 `id`/`parentId` 树、v3 `hookMessage`→`custom`；加载时迁到 v3。`CURRENT_SESSION_VERSION = 3`（`session-manager.ts`）。

其后每行是树节点（`id` 8-char hex，`parentId`，ISO `timestamp`）：

| `type` | 内容 |
|--------|------|
| `message` | 完整 `AgentMessage`：user / assistant / toolResult / bashExecution / custom / branchSummary / compactionSummary |
| `model_change` | provider + modelId |
| `thinking_level_change` | thinking 档 |
| `compaction` | summary、`firstKeptEntryId` 或 `retainedTail`、`tokensBefore`、可选 usage / details |
| `branch_summary` | 弃枝摘要 |
| `custom` | 扩展状态，**不进 LLM context** |
| `custom_message` | 扩展消息，**进 LLM context** |
| `label` | 书签 |
| `session_info` | 显示名（`/name`） |

消息内容块：`text` / `image`（base64）/ `thinking` / `toolCall`。assistant 还带 `api`/`provider`/`model`/`usage`/`stopReason`。`toolResult` 带 `details`、`isError`。`bashExecution` 可有 `fullOutputPath`、`excludeFromContext`（`!!` 前缀：文件里仍有，`convertToLlm` 滤掉）。

压缩与分支摘要 **写进同一文件**，不另开库。`buildSessionContext()` 从当前 leaf 走到根，遇到 compaction 则用 summary + `retainedTail` 或 `firstKeptEntryId` 之后的条目。文档明确：压缩改的是 **送给模型的 context**，不是擦除磁盘上的旧 entry。

### 1.2 存在哪

默认：

```
~/.pi/agent/sessions/--<cwd with / \ : → - >--/<ISO-ts>_<uuid>.jsonl
```

`getAgentDir()` = `$PI_CODING_AGENT_DIR` 或 `~/.pi/agent`。`$PI_CODING_AGENT_SESSION_DIR` / `--session-dir` 可改根目录。`SessionManager.inMemory()` / `pi --no-session` 不写文件。

可选 **harness 后端**（产品 CLI 未接上）：`packages/session-backends/sqlite-node` — **每会话一个 sqlite 文件**，表包括 `sessions`、`entries`（payload JSON）、`lanes`、`records`、`facts`、`writer_leases`、FTS。与 coding-agent v3 JSONL 是同一棵 entry 树的另一种编码，外加 crash-recovery registers。harness 规格 non-goal：**不持久化半截 provider 流**；torn JSONL 末行整行丢弃。

### 1.3 怎么恢复

| 入口 | 行为 |
|------|------|
| `pi -c` | `SessionManager.continueRecent(cwd)`：该 cwd 目录下最新文件，没有则新建 |
| `pi -r` / `/resume` | 当前项目 picker；可扩到全部项目 |
| `pi --session <path\|id>` | 打开指定文件或局部 ID |
| `pi --fork` | 新文件，header 记 `parentSession` |
| `/tree` | **同一文件内**改 leaf，不新开文件 |
| `/new` | 新会话文件 |

跨项目 `--session` 命中别的 cwd 时，交互询问是否 fork 进当前目录（`main.ts` `createSessionManager`）。

### 1.4 和压缩 / 记忆是不是同一份存储

- **压缩：同一 JSONL。** 追加 `compaction` 条目；旧消息仍在文件里，只是 `buildContextEntries` 不再送给模型。
- **跨会话记忆：不是会话文件。** 项目 `AGENTS.md` / skills / settings 是启动时另读的文件，不写进 session JSONL。
- harness 规格把 compaction 也做成 entry；registers 里的 `op.state` 是运行时，不是记忆产品。

### 1.5 明确不存什么

- `"pending"` 助手消息（流式中间态）；落盘前换成终态 `stopReason`（session-format.md）。
- 半截 provider 流（harness.md §0.6）。
- `custom` 条目不进 LLM；`bashExecution.excludeFromContext` 进文件但不进下一轮 prompt。
- `--no-session` / in-memory：进程结束即无。
- 工作区文件草稿：会话只记工具结果文本，不另做 checkpoint 快照（无 Claude 那种 `file-history/`）。

---

## 2. Claude Code

闭源。第一方：https://code.claude.com/docs/en/sessions.md 、https://code.claude.com/docs/en/memory.md 、https://code.claude.com/docs/en/checkpointing.md 、https://code.claude.com/docs/en/claude-directory.md 、https://code.claude.com/docs/en/context-window.md 。GitHub `anthropics/claude-code` 无实现源码。

### 2.1 存什么

文档把「session」定义成 **绑在项目目录上的已保存对话**，边写边存。

**Transcript JSONL**（文档原话）：每行是 message、tool use 或 metadata 的 JSON 对象。**格式是内部实现，版本间会变**；官方要求脚本走 `/export`、`claude -p --resume`、hooks 的 `transcript_path`、Agent SDK，不要自己 parse JSONL。

文档保证 resume 时从 transcript **恢复**：

- 完整对话史，含 tool call 与 tool result
- 当时用的 **model**（退休 / `availableModels` 禁止 / `--model` 或 `ANTHROPIC_MODEL` 覆盖 / Bedrock 等部署 ID 除外）
- `--agent` / `agent` setting 指定的 agent（系统提示、工具限制、模型）；找不到则退回默认并警告
- 部分 **permission mode**（见 2.5 例外）
- 仍 active 的 **goal**（turn count / timer / token baseline 重置）
- 未过期的 **scheduled tasks**

同进程 `/branch` 还拷贝「Allow for this session」授权；`--fork-session` 新进程不拷贝。

旁路（同 `~/.claude/`，**不是**那一个 JSONL 里的字段）：

| 路径 | 内容 |
|------|------|
| `projects/<project>/<id>/subagents/` | 子 agent transcript |
| `projects/<project>/<id>/tool-results/` | 过大的工具输出外溢 |
| `file-history/<session>/` | 编辑工具的 **文件快照**（checkpoint / `/rewind`），最近 100 个 checkpoint |
| `projects/<project>/memory/` | auto memory：`MEMORY.md` + topic 文件 |
| `history.jsonl` | 你打过的 prompt（↑ 回忆），**无限期**，不随 30 天清 transcript |
| `paste-cache/`、`image-cache/` | 大粘贴与图片 |
| `plans/`、`tasks/`、`session-env/` | plan、todo、环境元数据 |

### 2.2 存在哪

```
~/.claude/projects/<project>/<session-id>.jsonl
```

`<project>` = 工作目录路径，非字母数字换成 `-`；超过 200 字符则截断并加 full-path hash。可用：

- `CLAUDE_CONFIG_DIR` 把根从 `~/.claude` 挪走
- `CLAUDE_CODE_PROJECT_DIR_NAME` 自定义 `<project>` 目录名（与 config dir 一起用时，多仓可共享 auto memory）
- `cleanupPeriodDays`（默认约 30 天）清 transcript；**auto memory 目录排除在 sweep 外**
- `CLAUDE_CODE_SKIP_PROMPT_HISTORY` 全模式不写 transcript
- `claude -p --no-session-persistence` 单次非交互不写

明文落盘，无加密。文档警告：读到 `.env` 的内容会进 JSONL。

### 2.3 怎么恢复

| 入口 | 行为 |
|------|------|
| `claude --continue` | **当前目录**最近一次 |
| `claude --resume` | picker |
| `claude --resume <name\|id>` | 精确名直接开；歧义则搜索。ID 可从任意目录找，先当前仓/worktree，再全机；**恰好一个**其他项目命中才跨仓 |
| `claude --from-pr <n>` | picker 滤到该 PR |
| `/resume` | 会话内切换 |
| `--continue --fork-session` / `/branch` | 拷贝 transcript 到新 session ID |
| `/clear` | 新空 context；旧对话仍在磁盘，可 `/resume` 或同进程 rewind 菜单的 previous-session |

picker 默认当前 worktree（含 `bg` 后台会话）。`Ctrl+W` 同仓 worktree，`Ctrl+A` 全机，`Ctrl+B` 当前 git 分支。选无关项目时 **不直接 resume**，而是拷贝 `cd`+resume 命令到剪贴板。`claude -p` / Agent SDK 会话 **不出现在 picker**，但可用 ID `--resume`。

长时间 idle（约 >1h 且 >100k tokens）且 Pro/Max：resume 可先对话框，选 **从 summary 继续**（立刻 `/compact`）、原样全量、或不再询问。这只改 **之后请求带的 context**，不是换存储文件。

v2.1.169+：`/cd` 把会话文件迁到新目录的 project storage。

### 2.4 和压缩 / 记忆是不是同一份存储

**不是一件事，三层：**

1. **Transcript JSONL** = 可 resume 的对话日志。`/compact`、rewind「Summarize」压缩的是 **context 窗口**；checkpoint 文档写明：summarize **不改磁盘文件**，原消息仍在 transcript，便于以后引用。
2. **CLAUDE.md / rules / skills** = 每会话启动另载；compact 后 **项目根 CLAUDE.md 与 unscoped rules、auto memory 从磁盘再注入**。带 `paths:` 的 rules、子目录 CLAUDE.md 要等再次读到匹配文件。
3. **Auto memory** = `~/.claude/projects/<project>/memory/`，跨会话、跨 worktree（同 git repo）共享；**不是** JSONL 的一部分。启动只加载 `MEMORY.md` 前 200 行或 25KB。`cleanupPeriodDays` 清 transcript 时 **不删** 该目录。

`/clear` 清空 context 但保存上一场对话到磁盘。

### 2.5 明确不存 / 不恢复什么

文档列出 resume **不恢复**：

- `--mcp-config`、`--settings`、`--plugin-dir`、`--fallback-model`、`--add-dir`（启动目录）；会话中 `/add-dir` 也不恢复（picker 仍可能用它们定位）
- `plan` 与 `bypassPermissions` 模式（resume 回到「新会话会用的模式」）
- 后台 Bash、monitor tasks
- 新进程 fork 上的「Allow for this session」授权
- JSONL **对外稳定 schema**（官方拒绝当 API）
- checkpoint：**bash 改的文件**、多数 subagent 编辑、会话外手工改、symlink/hardlink

Desktop / web / VS Code **各自一份** session history；本页合同只覆盖 CLI。

---

## 3. Codex CLI

开源：`codex-rs/rollout`、`thread-store`、`history`、`state`、`memories`。用户文档：https://developers.openai.com/codex/developer-commands 、SDK README（threads 在 `~/.codex/sessions`）。

### 3.1 存什么

**Canonical history = JSONL rollout。** 一行一个 `RolloutLine`：`timestamp` + 可选 `ordinal` + flattened `RolloutItem`（`codex-rs/history/src/lib.rs`）。

`RolloutItem`：

- `SessionMeta` — thread/session id、cwd、originator、cli_version、source、fork/parent、model_provider、base_instructions、dynamic_tools、history_mode、context_window、memory_mode、subagent 字段等（`protocol.rs` `SessionMeta`）
- `ResponseItem` — 消息、reasoning、function/custom/web/image 工具调用与输出、compaction 等（见 policy）
- `Compacted` — 摘要文本 + 可选 `replacement_history`
- `TurnContext`、`WorldState`、`SecurityRiskScore`
- `EventMsg` — 按 `history_mode` 过滤
- 多智能体通信项

`is_persisted_rollout_item`（`rollout/src/policy.rs`）**明确写入**的 ResponseItem：Message、AgentMessage、Reasoning、各类 tool call/output、WebSearch、ImageGeneration、Compaction、ContextCompaction。**不写**：`AdditionalTools`、`CompactionTrigger`、`Other`。

大量 EventMsg 标成 **Transient, non-durable**（Error、队列变化、ExecCommandEnd、GuardianAssessment 等）。

SQLite 是 **旁路索引 / 元数据 / 记忆作业**，不是替代 JSONL 的会话本体。`LocalThreadStore`：history 走 rollout JSONL；可查询 metadata 走 state DB（`thread-store/README.md`）。`codex-rs/state/src/sqlite.rs` 在 `CODEX_HOME` 下：

| 文件 | 角色 |
|------|------|
| `state_5.sqlite` | thread 元数据、列表、backfill |
| `memories_1.sqlite` | Phase 1 记忆记录、lease |
| `thread_history_1.sqlite` | 分页/物化 history |
| `logs_2.sqlite` / `goals_1.sqlite` / `queue_1.sqlite` | 日志、goal、队列 |

压缩：`/compact` 把早先 turns 换成摘要；`Compacted` **写进同一 rollout**。记忆 pipeline 另读 rollout 再写入 memories DB + `~/.codex/memories/` 文件（`MEMORY.md`、`raw_memories.md`、`rollout_summaries/`）。

### 3.2 存在哪

```
$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<YYYY-MM-DDThh-mm-ss>-<thread-id>.jsonl
```

默认 `CODEX_HOME` ≈ `~/.codex`。文件名：`rollout-<ts>-<thread_id>.jsonl`；revert 后可变成 `rollout-<ts>-<thread_id>_<rollout_id>.jsonl`（thread id 稳定，rollout 新文件）。归档目录常量：`archived_sessions`。

SDK：`resumeThread(id)`，注释写明 threads persisted in `~/.codex/sessions`，可用 env 改 `CODEX_HOME`。

记忆工作区：`~/.codex/memories/`（含独立 `.git` baseline），**跨 thread 巩固**，不是单会话 JSONL。

### 3.3 怎么恢复

CLI（`codex-rs/cli/src/main.rs` `ResumeCommand`）：

| 入口 | 行为 |
|------|------|
| `codex resume` | TUI picker |
| `codex resume <SESSION_ID\|name>` | UUID 优先于名字 |
| `codex resume --last` | 不打开 picker，最近一次（默认 **cwd 过滤**） |
| `--all` | 关掉 cwd 过滤，显示 CWD 列 |
| `--include-non-interactive` | picker / `--last` 含 `codex exec` 一类 |
| `codex exec resume --last` | 非交互续跑；`--all` 跨会话搜 |
| `/resume` | 会话内 picker |
| `/fork`、`codex fork` | 新 thread id，原 transcript 不动 |
| `/new` | 同进程新 chat |
| `codex archive` / `unarchive` / `delete` | 从列表隐藏或真删 transcript |

`list.rs`：`cwd_filters` 用规范化路径匹配 session meta 里的 cwd。TUI `session_resume.rs` 可按配置 `ResumeCwdMode` 提示是否沿用记住的 cwd。

SDK `thread/resume`：按 thread id 续；可恢复 persisted token usage 与 permissions 相关状态（app-server README / Context7 摘录；以源码 `Resume` recorder params 为准：打开已有 rollout path 继续 append）。

### 3.4 和压缩 / 记忆是不是同一份存储

- **压缩：同一 rollout 文件**里的 `Compacted` / `ResponseItem::Compaction`。
- **Memories：另一套。** Phase 1 从 **idle 的 interactive rollout** 抽结构化记忆进 `memories_1.sqlite`；Phase 2 巩固到 `~/.codex/memories/MEMORY.md` 等。触发条件（memories README）：非 ephemeral、feature 开、非 sub-agent、state DB 可用。给记忆用的 ResponseItem 过滤 **去掉 `role == "developer"` 和 Reasoning** 等（`should_persist_response_item_for_memories`）。
- **AGENTS.md**：仓库内指令文件，启动另载，不是 session JSONL。

### 3.5 明确不存什么

- `ResponseItem::AdditionalTools` / `CompactionTrigger` / `Other`
- 标成 transient 的 EventMsg（执行结束、错误、协作 spawn 结束等）
- ephemeral 会话不进 memory pipeline
- 子 agent 会话不跑 memory 抽取
- JSONL 仍是 transcript；sqlite 挂了时 `init()` 返回 `None` 并 warning，**不挡**文件 rollout（`state_db.rs`）

未在第一方文档承诺、因此标 **未核实**：半截 SSE token 是否落盘。实现是按 **item** 追加 JSONL；与 pi 一样，合理推断不存未完成流，但 Codex 源码未用与 pi harness 同等的 non-goal 句子。

---

## 4. 跨产品合同（只陈述，不做我们的选择）

三家重启后「会话还在」，本质都是 **本地 append-only 对话日志 + 按 cwd（或显式 id）找回**，而不是把运行时堆快照序列化。

共同点：

1. **对话本体是 JSONL**（Claude / pi 现行 CLI / Codex rollout）。SQLite 若存在，是索引、lease、记忆作业或（pi harness）另一套编码，不是「唯一真相」替代品——Codex 文档/README 仍把 resume 锚在 `~/.codex/sessions`。
2. **默认按工作目录找最近一次**（`--continue` / `-c` / `resume --last`），另提供 picker 与按 id。
3. **压缩写进同一份日志（或同一套 entry 树）**，改的是下次送给模型的视图；跨会话记忆是 **旁路 markdown/DB**。
4. **工具结果会进会话文件**（Claude 过大输出可外溢 `tool-results/`；pi 长 bash 可 `fullOutputPath`）。
5. **推理块**：pi 存 `thinking` content；Codex 存 `ResponseItem::Reasoning`（记忆抽取却排除 reasoning）。Claude JSONL 内部格式未公开，但 resume 声称恢复完整 history。

分叉：

- pi：**一文件一树**，`/tree` 不换文件；压缩 entry 是树节点。
- Claude：**一文件一线式 transcript** + 旁路 file-history / memory / history.jsonl；schema 故意不稳定。
- Codex：**按日期分目录的 rollout 文件** + 家目录 sqlite 簇 + 全局 memories 工作区。

---

## 来源

### Fetch / 页面

- https://code.claude.com/docs/en/sessions.md
- https://code.claude.com/docs/en/memory.md
- https://code.claude.com/docs/en/context-window.md
- https://code.claude.com/docs/en/checkpointing.md
- https://code.claude.com/docs/en/claude-directory.md
- https://code.claude.com/docs/llms.txt
- https://developers.openai.com/codex/cli
- https://developers.openai.com/codex/developer-commands.md
- https://raw.githubusercontent.com/openai/codex/main/sdk/typescript/README.md
- https://github.com/openai/codex
- https://github.com/anthropics/claude-code/issues/15837 （用户侧路径印证；**不当 schema 权威**）

### 本地源码

- pi `@ b7bb00b`：`packages/coding-agent/docs/{sessions,session-format,compaction}.md`，`src/core/session-manager.ts`，`src/config.ts`，`src/main.ts`，`packages/agent/docs/harness.md`，`packages/session-backends/sqlite-node/`
- Codex `@ 2151d3a`：`codex-rs/{rollout,history,thread-store,state,memories,cli,protocol}`

### 命令

```powershell
smart-search doctor --format json
smart-search deep "主流 coding agent 重启进程后会话如何持久化：pi JSONL session-backends、Claude Code session 存储、Codex CLI session" --format json
smart-search search "Claude Code session storage JSONL resume --continue ~/.claude" --validation balanced --extra-sources 2 --timeout 90 --format json --output C:\tmp\smart-search-evidence\20260821-session-persistence\01-search-claude-code.json
smart-search search "Codex CLI session persistence resume --continue sqlite JSONL" --validation balanced --extra-sources 2 --timeout 90 --format json --output C:\tmp\smart-search-evidence\20260821-session-persistence\02-search-codex.json
smart-search fetch "https://code.claude.com/docs/en/sessions.md" --format markdown --output C:\tmp\smart-search-evidence\20260821-session-persistence\16-claude-sessions-md.md
smart-search fetch "https://code.claude.com/docs/en/memory.md" --format markdown --output C:\tmp\smart-search-evidence\20260821-session-persistence\17-claude-memory.md
smart-search fetch "https://code.claude.com/docs/en/context-window.md" --format markdown --output C:\tmp\smart-search-evidence\20260821-session-persistence\19-claude-context-window.md
smart-search fetch "https://code.claude.com/docs/en/checkpointing.md" --format markdown --output C:\tmp\smart-search-evidence\20260821-session-persistence\22-claude-checkpointing.md
smart-search fetch "https://code.claude.com/docs/en/claude-directory.md" --format markdown --output C:\tmp\smart-search-evidence\20260821-session-persistence\23-claude-directory.md
smart-search fetch "https://developers.openai.com/codex/developer-commands.md" --format markdown --output C:\tmp\smart-search-evidence\20260821-session-persistence\21-codex-developer-commands.md
smart-search fetch "https://raw.githubusercontent.com/openai/codex/main/sdk/typescript/README.md" --format markdown --output C:\tmp\smart-search-evidence\20260821-session-persistence\18-codex-ts-sdk.md
smart-search context7-docs "/openai/codex" "session resume JSONL ~/.codex/sessions rollout" --format json --output C:\tmp\smart-search-evidence\20260821-session-persistence\14-c7-codex-docs.json
```

说明：`smart-search exa-search` 一次 HTTP 400，未采用。`search` 的 `content` 未当证据；结论以 fetch 文档与 clone 源码为准。第三方博客（verdent、dev.to）只作发现，不引用为合同。

### 未核实 / 易过期

- Claude JSONL 行类型的字段级 schema（官方声明会变）。
- Claude Desktop/Web 与 CLI 是否共享同一 `~/.claude/projects` 文件（文档写「各自一份 history」）。
- Codex 未完成流式 token 是否曾短暂写入。
- pi `AgentHarness` / JSONL v4 / sqlite-node 一旦接到默认 CLI，现行 SessionManager v3 路径会过时。
- sqlite 文件名带版本后缀（`state_5.sqlite`），升级会改名。
