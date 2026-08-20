# pi 内核解剖

- 票：`.scratch/pluggable-agent-spec/issues/01-pi-kernel-anatomy.md`
- 取证日期：2026-08-20
- 源码快照：`git clone --depth 1 https://github.com/earendil-works/pi.git` → commit `b7bb00b936dbe21b8e160b3e89efdec361846699`（2026-08-19，`main`）
- 本笔记只描述上游事实，**不做我们自己的内核决策**。

术语对照（本仓库 `CONTEXT.md`）：这里把 pi 的 **agent 循环**（`Agent` / `agentLoop`）当作其「内核」；把 `pi-coding-agent` 的 TUI / 扩展 / 技能 / 默认 coding 工具当作挂在循环上的产品层。pi 自己的文档用 “core / harness / coding agent”，不使用本仓库的「插件 / 接缝」词。

---

## 1. 权威仓库、语言、规模

### 权威入口

| 角色 | URL |
|------|-----|
| 当前权威 monorepo | https://github.com/earendil-works/pi |
| 历史仓库名（文档与构建徽章仍大量引用） | https://github.com/badlogic/pi-mono （fetch `github.com/badlogic/pi-mono` 会落到 `earendil-works/pi`） |
| 已死的误称 | https://github.com/mariozechner/pi-mono → 404 |
| 项目站 / 文档 | https://pi.dev 、 https://pi.dev/docs/latest |
| 作者第一方说明 | https://mariozechner.at/posts/2025-11-30-pi-coding-agent/ |
| 为何不做 MCP | https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/ |
| 现行 npm 包 | `@earendil-works/pi-coding-agent` / `@earendil-works/pi-agent-core` / `@earendil-works/pi-ai` |
| 旧 npm 名 | `@mariozechner/pi-coding-agent` 已 deprecated，提示改用 `@earendil-works/pi-coding-agent` |

根 README 自称 “Pi Agent Harness”，语言是 **TypeScript / Node（`engines.node >= 22.19.0`）**，MIT，workspace 包在 `packages/*`。见 https://github.com/earendil-works/pi/blob/main/README.md 与根 `package.json`。

开发文档仍把结构画成四包（`ai` / `agent` / `tui` / `coding-agent`）：https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/development.md 。根 README 的「All Packages」表额外列出 `pi-telemetry`。源码树里还有 `protocol`、`client`、`server`、`session-backends/sqlite-node`、`evals`——产品面已经长出远程会话与遥测，但 **CLI 一次回合仍走 `Agent` 循环**（见第 2 节）。

### 快照规模（`packages/*/src` 下 `.ts/.js` 文件数）

| 包 | npm 名 | src 文件约数 | 角色（第一方描述） |
|----|--------|--------------|-------------------|
| `ai` | `@earendil-works/pi-ai` | 177 | 统一多提供商 LLM API |
| `agent` | `@earendil-works/pi-agent-core` | 50 | Agent runtime：工具调用 + 状态 |
| `coding-agent` | `@earendil-works/pi-coding-agent` | 206 | 交互式 coding CLI |
| `tui` | `@earendil-works/pi-tui` | 39 | 差分渲染 TUI 库 |
| `telemetry` | `@earendil-works/pi-telemetry` | 6 | 厂商无关遥测契约 |
| `protocol` / `client` / `server` | 同前缀 | 8 / 10 / 17 | 远程会话协议（非循环本身） |

`pi-agent-core` 与 `pi-coding-agent` 在快照上均为 **0.84.2**。

循环本体文件行数（不含 harness 子目录）：

- `packages/agent/src/agent-loop.ts` ≈ 718 行
- `packages/agent/src/agent.ts` ≈ 528 行
- `packages/agent/src/types.ts` ≈ 412 行

作者 2025-11-30 博文把最小脚手架定义成四块：`pi-ai`、`pi-agent-core`、`pi-tui`、`pi-coding-agent`。https://mariozechner.at/posts/2025-11-30-pi-coding-agent/

---

## 2. 一次回合的运行闭环（各在哪一层）

生产 CLI / SDK **不走**尚未实现的 `AgentHarness` 状态机，而是：

```
用户输入
  → coding-agent AgentSession.prompt / steer / followUp
  → Agent.prompt / runAgentLoop          (pi-agent-core)
  → streamFn = models.streamSimple        (pi-ai)
  → 工具 execute（coding-agent 注册的 AgentTool）
  → 事件回流到 TUI / JSON / RPC
```

证据：`packages/coding-agent/src/core/sdk.ts` 里 `agent = new Agent({...})`；`packages/coding-agent/src/core/agent-session.ts` 把 `Agent` 包成所有运行模式共用的会话层。

### 分层

| 步骤 | 层 | 文件 | 做什么 |
|------|----|------|--------|
| 消息入队 | 产品 | `AgentSession` / `Agent.steer` / `Agent.followUp` | 用户消息、转向、收尾跟进 |
| 循环编排 | **内核** | `agent-loop.ts` `runLoop` | `turn_start` → 流式助手 → 工具批 → `turn_end` → 再转或结束 |
| 模型调用 | 注入的 `StreamFn` | 默认 `pi-ai` `streamSimple` | `AgentMessage[]` 经 `transformContext` + `convertToLlm` 变成 LLM `Message[]` 再请求 |
| 流式 | 内核消费 / 提供商产出 | `streamAssistantResponse` 把 `text_delta` / `toolcall_*` 转成 `message_update` | 失败必须编码进流，最终 `stopReason` 为 `error` 或 `aborted`（`StreamFn` 契约，`types.ts`） |
| 工具执行 | 内核调度 + 产品实现 | 内核：`beforeToolCall` → `execute` → `afterToolCall`；实现：coding-agent `createReadTool` 等 | 默认并行；单工具可标 `executionMode: "sequential"`，则整批串行 |
| 取消 | 内核 | `Agent.abort()` → `AbortController`；循环里 `signal.aborted` 时工具结果写成 `"Operation aborted"`，助手 `stopReason === "aborted"` 则直接 `agent_end` | 不持久化半截 provider 流（见 harness 规格 non-goals） |

事件顺序（第一方 README）：https://www.npmjs.com/package/@earendil-works/pi-agent-core

```
agent_start
  turn_start
    message_start/end          # user
    message_start / message_update* / message_end   # assistant（流式）
    tool_execution_start / update / end
    message_start/end          # toolResult
  turn_end
  …下一 turn…
agent_end
```

`Agent.subscribe` 的 listener **按注册顺序 await**；`waitForIdle()` / `prompt()` 要等 `agent_end` 的 listener 也结束。

`AgentHarness`（`packages/agent/src/harness/agent-harness.ts`）是规格里的**持久化运行时**（会话树、lane、崩溃恢复），但 `create()` 对已有记录抛 `HarnessNotImplemented("create.restore")`，多数操作 `unavailable()`。对照用的实现规格：https://github.com/earendil-works/pi/blob/main/packages/agent/docs/harness.md 。**当前 CLI 闭环仍是内存里的 `Agent` + JSONL `SessionManager`。**

---

## 3. 内核类型的最小集合

### LLM 消息（`pi-ai`）

`packages/ai/src/types.ts`：

- `UserMessage` — `role: "user"`
- `AssistantMessage` — `role: "assistant"`（含 thinking / toolCall 内容块、`usage`、`stopReason`）
- `ToolResultMessage` — `role: "toolResult"`
- `Message = UserMessage | AssistantMessage | ToolResultMessage`

内容块：`text` / `image` / `thinking` / `toolCall`。会话格式文档：https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md

### Agent 消息 / 工具 / 上下文（`pi-agent-core`）

`packages/agent/src/types.ts`：

- `AgentMessage = Message | CustomAgentMessages[...]`（declaration merging）
- `AgentContext = { systemPrompt, messages, tools? }`
- `AgentTool`：`name` + TypeBox `parameters` + `execute(toolCallId, params, signal?, onUpdate?)` + 可选 `label` / `executionMode` / `prepareArguments`
- `AgentToolResult`：`content`（text|image）+ `details` + 可选 `terminate`
- `AgentEvent`：上面那组生命周期事件
- `ThinkingLevel`、`ToolExecutionMode`、`QueueMode`

**循环不内置任何 coding 工具类型。** 工具是运行时数组。内核也不定义「会话文件」类型；会话是产品层 JSONL 树（header + 带 `id`/`parentId` 的 entry，现 v3）。

### 产品层才有的消息（不是循环的最小集）

`packages/coding-agent/src/core/messages.ts` 通过 merging 加上：`bashExecution`、`custom`、`branchSummary`、`compactionSummary`。`convertToLlm` 把它们滤掉或改写成 user 文本。这些是 coding-agent 对内核扩展面的用法，不是 `agentLoop` 的内置角色。

---

## 4. 扩展点与边界

### 内核循环上的钩子（`AgentLoopConfig` / `Agent`）

必须 / 常用：

- `convertToLlm` — `AgentMessage[]` → LLM `Message[]`（自定义消息的边界）
- `transformContext` — 剪枝、注入、压缩前变换
- `streamFn` — 可替换模型传输（内核不 import 提供商）
- `beforeToolCall` / `afterToolCall` — 拦截、改结果、`block`、`terminate`
- `shouldStopAfterTurn` / `prepareNextTurn`
- `getSteeringMessages` / `getFollowUpMessages`
- `getApiKey`、`onPayload`、`onResponse`

coding-agent 把扩展事件接到这些钩子上：`tool_call` → `beforeToolCall`，`transformContext` → `emitContext`，`before_provider_request` → `onPayload`（`sdk.ts` + `agent-session.ts` `_installAgentToolHooks`）。

### 产品扩展面（`pi-coding-agent`，不是 agent-core）

文档：https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md 、https://pi.dev/docs/latest

- **Extensions**：TS 模块，`pi.registerTool` / `registerCommand` / `registerProvider` / 生命周期事件 / 自定义 TUI
- **Skills**：`SKILL.md`，按需读入（progressive disclosure）
- **Prompt templates / Themes / Pi packages**
- 发现路径：`~/.pi/agent/extensions/`、项目 `.pi/extensions/`；`pi -e`；npm/git 包

**边界：**

- 扩展跑在**同一进程、同一用户权限**（扩展文档 Security 段）。
- 内核循环**没有**插件加载器、没有 MCP 客户端、没有权限对话框。
- 默认 coding 工具是 coding-agent（及正在迁入 `agent/src/harness/tools` 的副本）注册上去的 `AgentTool`，**可被 `--no-builtin-tools` / `--tools` 关掉**。
- `pi-ai` 只收录 **支持 tool calling** 的模型（`packages/ai/README.md`）。

默认四工具：`read`、`write`、`edit`、`bash`（README Quick Start）。另外实现了 `grep` / `find` / `ls`，默认不进 active 集（`sdk.ts` `defaultActiveToolNames`；`createCodingTools` vs `createAllTools`）。无 grep/find/ls 时系统提示写「用 bash 做 ls/rg/find」（`system-prompt.ts`）。

---

## 5. 作者明确排除在核心之外的东西

第一方清单在 coding-agent README **Philosophy**（https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md ）与 2025-11-30 博文：

| 排除项 | 作者给的替代 |
|--------|----------------|
| **No MCP** | CLI + README / Skills；或自己写扩展。理由：通用 MCP 工具描述吃 context、不可组合。https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/ |
| **No sub-agents** | tmux 再开一个 `pi`，或扩展/包自己做 |
| **No permission popups** | 容器 / 自己用扩展做确认。根 README：不内置限制 fs/进程/网络/凭据的权限系统。https://github.com/earendil-works/pi/blob/main/README.md 「Permissions & Containerization」 |
| **No plan mode** | 计划写成文件，或扩展/包 |
| **No built-in to-dos** | 「它们会搞混模型」；用 `TODO.md` 或扩展 |
| **No background bash** | 用 tmux，同步 bash |

TUI **不在** `pi-agent-core`：独立包 `pi-tui`。Agent README 的例子用 `subscribe` 自己打 stdout。

压缩：**不是**循环的必选件。`transformContext` / `shouldStopAfterTurn` 留给外层。coding-agent 已实现自动/手动 compaction 与分支摘要（https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/compaction.md ）；算法副本也在 `packages/agent/src/harness/compaction/`。博文里作者曾说自己不太需要 compaction，但产品层现在有了。

权限 / 沙箱：https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md — 无内置 sandbox；project trust 只控制是否加载项目扩展/设置，**不限制模型调用工具**。隔离靠 Docker / Gondolin / OpenShell。

YOLO：博文 “YOLO by default”——默认不弹权限。

---

## 6. 「极简」可操作约束（什么变化会破坏 pi 之所以小）

从第一方文本能落地的约束，而不是审美口号：

1. **循环不拥有提供商。** `Agent` 吃 `streamFn`。把 Vercel AI SDK 或具体 Anthropic/OpenAI 客户端焊进 `agent-loop.ts` 会拆掉「内核与传输分离」，也是作者避免自托管模型翻车的原因（博文）。
2. **循环不拥有具体工具。** 默认四工具属于 coding-agent 注册表。把 `bash`/`edit` 写死进 `agentLoop`、或默认塞进 MCP 工具清单，会把 context 税和策略绑死（博文 “Minimal toolset” + MCP 文）。
3. **LLM 只看见三种 role。** 自定义消息必须经 `convertToLlm` 过滤。把 TUI/通知/bash `!` 输出直接当 assistant/user 塞进 provider，会污染 context 工程（作者核心动机）。
4. **策略不进循环。** 权限、MCP、子 agent、plan、todo、后台进程都是「扩展 / 外部进程 / 文件」问题。把其中任一项做成 `agentLoop` 分支，就违反 README Philosophy。
5. **取消是 AbortSignal，不是权限状态机。** 半截流不落盘（harness.md non-goals：「Provider stream resumption」不做）。
6. **TUI 可替换。** 同一 `Agent` / `AgentSession` 支撑 interactive / print / JSON / RPC / SDK（coding-agent README）。把差分渲染焊进内核会堵死嵌入。
7. **默认工具保持「bash 能做的不要再做专用工具」。** 系统提示在没有 grep/find/ls 时明确让模型用 bash。默认 active 集膨胀会直接打进每一轮 system prompt。
8. **扩展是进程内 TS，不是 RPC 插件宿主。** 再做一个内置插件隔离运行时，等于另写一套产品（与当前「fork 或写扩展」哲学相反）。

反例（上游自己已经在长的部分，对照时要分开看）：

- `pi-ai` 提供商目录很大（catalog + OAuth + 多 API 方言）——这是传输层膨胀，不是循环膨胀。
- `packages/agent/src/harness/` 正在把 session / compaction / skills / 四工具收进 agent-core；`AgentHarness` 仍大量 `HarnessNotImplemented`。**循环最小集仍是 `types.ts` + `agent-loop.ts` + `agent.ts`，不要把整个 agent 包都叫内核。**

---

## 7. 对照用的一句话地图

```
pi-ai          消息类型 + 流式提供商适配 + 鉴权/用量
pi-agent-core  AgentMessage/AgentTool/AgentContext
               + agentLoop（流式、工具批、Abort、steer/follow-up）
               + （正在长）harness 规格与工具/压缩实现
pi-coding-agent  默认四工具、JSONL 会话树、压缩、扩展/技能/包
                 TUI/RPC/SDK 外壳、明确不做 MCP/权限弹窗/子agent/plan/todo/后台bash
pi-tui         终端渲染，循环不依赖
```

一次回合：产品把 user `AgentMessage` 交给 `Agent.prompt` → 内核 `runLoop` 调 `streamFn` → 流式事件 → 校验并执行 `AgentTool`（可被 `beforeToolCall` 拦住）→ `toolResult` 再进下一 turn → `abort()` 切断 signal。

---

## 来源

### Fetch / 页面

- https://github.com/earendil-works/pi
- https://github.com/badlogic/pi-mono （重定向到上一行）
- https://github.com/mariozechner/pi-mono （404）
- https://www.npmjs.com/package/@mariozechner/pi-coding-agent
- https://www.npmjs.com/package/@earendil-works/pi-agent-core
- https://mariozechner.at/posts/2025-11-30-pi-coding-agent/
- https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/
- https://pi.dev/docs/latest
- https://raw.githubusercontent.com/earendil-works/pi/main/README.md

### 本地源码（clone）

- `C:\tmp\pi-kernel-src` @ `b7bb00b936dbe21b8e160b3e89efdec361846699`
- 关键路径：`packages/agent/src/{types,agent,agent-loop}.ts`，`packages/ai/src/types.ts`，`packages/coding-agent/src/core/{sdk,agent-session,messages,system-prompt,tools/index}.ts`，`packages/coding-agent/README.md`，`packages/agent/docs/harness.md`

### 命令

```powershell
smart-search doctor --format json
smart-search search "Mario Zechner pi-mono pi-coding-agent github" --validation balanced --extra-sources 1 --timeout 90 --format json --output C:\tmp\smart-search-evidence\20260820-pi-kernel-anatomy\01-search.json
smart-search fetch "https://github.com/badlogic/pi-mono" --format markdown --output C:\tmp\smart-search-evidence\20260820-pi-kernel-anatomy\03-fetch-badlogic-pi-mono.md
smart-search fetch "https://www.npmjs.com/package/@mariozechner/pi-coding-agent" --format markdown --output C:\tmp\smart-search-evidence\20260820-pi-kernel-anatomy\05-fetch-npm-pi-coding-agent.md
smart-search fetch "https://mariozechner.at/posts/2025-11-30-pi-coding-agent/" --format markdown --output C:\tmp\smart-search-evidence\20260820-pi-kernel-anatomy\08-blog-pi-coding-agent.md
smart-search fetch "https://www.npmjs.com/package/@earendil-works/pi-agent-core" --format markdown --output C:\tmp\smart-search-evidence\20260820-pi-kernel-anatomy\10-npm-agent-core.md
smart-search fetch "https://pi.dev/docs/latest" --format markdown --output C:\tmp\smart-search-evidence\20260820-pi-kernel-anatomy\11-pi-dev-docs.md
git clone --depth 1 https://github.com/earendil-works/pi.git C:\tmp\pi-kernel-src
```

说明：`smart-search exa-search` 两次均 `HTTP 400`；结论改由 GitHub/npm/作者博文 fetch + clone 支撑。`search` 的 `content` 曾把仓库写成 `mariozechner/pi-mono`，**以 fetch 为准，不采用该合成内容。**

### 未核实 / 易过期

- GitHub star 数、周下载量会变。
- `AgentHarness` 可能在后续 commit 填满；本笔记以 `b7bb00b` 为准。
- 包集合比 development.md 的四包图更大；以根 README + 目录为准。
