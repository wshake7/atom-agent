# DeepSeek Harness 插件模型（调研）

供后续票「插件契约：可替换面」对照。本文只陈述上游事实，**不设计我们的契约**。

取证日期：2026-08-20。权威树以 GitHub `deepseek-ai/deepseek-harness` 的 `master` 浅克隆为准（本地：`C:\tmp\deepseek-harness`）。仓库根 `package.json` 当时为 `0.1.0-rc.8`；npm 包 `@deepseek-ai/dsh` 当时为 `0.1.0-rc.7`。官方明确处于 developer preview，**会有破坏兼容性变更**。

---

## 1. 选定仓库与文档入口

### 为何选定这一个

选定 **[deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)**。依据：

- GitHub org 为官方 `deepseek-ai`；仓库 tagline 即 “Everything is a Plugin.”
- README 自称 DeepSeek Harness（`dsh`），架构口号为 **everything is a plugin**，由 Cordis 驱动。
- npm 产品入口 `@deepseek-ai/dsh` 的 repository 字段指向该仓库。
- 第一方站点 [https://deepseek.com/harness/](https://deepseek.com/harness/) 的「查看 GitHub」链到同一仓库。

中文 README 同句：采用**一切皆插件**的架构。

- 英文 README：<https://github.com/deepseek-ai/deepseek-harness/blob/master/README.md>
- 中文 README：<https://github.com/deepseek-ai/deepseek-harness/blob/master/README.zh.md>
- 原始英文：<https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/README.md>

### 第一方文档入口

| 入口 | URL |
|---|---|
| 产品站 | <https://deepseek.com/harness/> |
| 开发者文档（GitHub Pages） | <https://deepseek-harness.github.io/deepseek-harness/guide/quickstart> |
| 架构（源码即文档） | <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md> 中文：<https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.zh.md> |
| 用户指南 | <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/index.md> |
| 写插件教程 | <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md> |
| 打包/安装 | <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md> |
| Cordis 入门 | <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md> |
| 插件生命周期教程 | <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/02-lifecycle-and-effects.md> |
| 扩展 cookbook | <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md> |
| 能力接缝图 | <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md> |
| 工具目录（生成） | <https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-catalog.md> |
| npm CLI | <https://www.npmjs.com/package/@deepseek-ai/dsh> |
| 社区插件话题 | <https://github.com/topics/dsh-plugin> |
| 底层框架 Cordis | <https://github.com/cordiverse/cordis> |
| Cordis 论文 | <https://github.com/cordiverse/paper> |

运行入口（官方 README）：`npx @deepseek-ai/dsh web`，默认 `http://127.0.0.1:3080`。

### 未选仓库 / 易混对象

| 候选 | 为何不选 |
|---|---|
| [princeton-nlp/SWE-agent](https://github.com/princeton-nlp/SWE-agent) 及各类 “SWE harness” | 学术 coding-agent 评测/执行框架，与 DeepSeek 官方 Harness 无关。 |
| DeepSeek 模型卡、R1/V3/V4 论文与权重仓 | 模型发布物，不是 agent harness。 |
| [cordiverse/cordis](https://github.com/cordiverse/cordis) | **被 Harness vendor 的微内核**，不是产品仓库。Harness 在 `vendor/` 里改名为 `@deepseek-ai/cordis`。 |
| [anywhere-labs/deepseek-harness-desktop](https://github.com/anywhere-labs/deepseek-harness-desktop) | 社区桌面封装；报道明确写「并非 DeepSeek 官方产品」。 |
| 其它 `dsh-plugin` 话题下的第三方插件仓 | 生态插件，不是 harness 本体。 |

---

## 2. 官方意义上的插件类型

上游**没有**单独的 `PluginType` 枚举。官方把「插件」定义为 **Cordis 插件**：实现 `Service` 的对象（函数 / `{ name, inject, apply }` / `Service` 子类），向共享 `Context` 贡献服务、类型化事件、可撤销 effect。

产品站原话（[deepseek.com/harness](https://deepseek.com/harness/)）：

> 模型、工具、技能、会话、沙箱、存储、循环、调度、UI 等所有 Agent 能力均由插件组合而成

架构文档原话（[docs/architecture.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)）：

> Every part of the product is a plugin, including the model adapter, the tool registry, the session log, and the agent loop itself

下面按**源码分组**列出可替换面。npm 范围 `@deepseek-ai/dsh-*`。组 README：<https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/README.md>。

### 2.1 能力接缝（seam = 定义 + 提供方 + 消费者）

官方术语 **seam**（[docs/glossary.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/glossary.md)）：可替换能力，三角色——Service Definition（占 `ctx.<key>`）、Service Provider、Consumer（常见是面向模型的 tool）。**单独一个角色不是 seam。** 模板是 shell：

- `dsh-shell`（定义）
- `dsh-bash-local` / `dsh-bash-sandbox`（提供方）
- `dsh-tool-bash`（消费者）

架构文档「Where new behavior goes」把常见挂载点写成表（同页）：

| 目标 | 机制 |
|---|---|
| 加模型提供商 | 在 `ctx.llm` 注册 adapter |
| 加面向模型的能力 | 在 `ctx.tools` 注册；schema 进入 prompt 组装 |
| 给某一会话不同能力集 | agent preset；服务行需要 `isolate` realm |
| 加 shell | 注册 `ctx.shell` backend；本地实现经 `ctx.subprocess` spawn |
| 加持久终端 | 注册 `ctx.terminals` backend + `dsh-tool-terminal` |
| 加人类命令 | 注册 `ctx.commands`（不进模型回合） |
| 加后台工作 | 注册 `ctx.jobs` |
| 加文件系统/策略 | 注册 `ctx.fs` 或听 `fs/*` |
| 约束子进程 | `ctx.sandbox` backend |
| 拦截请求/工具/回合 | `agent/*` 或 `tools/*`；`agent/turn-stopping` 停回合 |
| 加模型可见上下文 | `agent.inject()` |
| 加 UI / 编辑器集成 | 驱动 `ctx.agents`，从 `session/event` 渲染 |
| 加 Web Chat 节点 | `ConversationNodeDefinition` + keyed renderer |
| 加持久会话状态 | 扩展 `SessionEventMap` |
| 生成会话标题 | 唯一的 `ctx.sessionTitle` provider |
| 同会话目标 | `ctx.goals` |

### 2.2 产品包组（源码清单）

来自 [packages/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/README.md)：

| 组 | 角色（官方措辞） |
|---|---|
| `core/` | 产品 API 脊骨：session、prompt、tools、agent 服务、具体 loop |
| `llm/` | LLM 抽象服务 + 提供方 adapter（`llm-deepseek`、`llm-pi-ai`） |
| `shell/` | Bash/pwsh 执行器接缝 + 本地/沙箱实现 + 面向模型的 tool |
| `fs/` | 文件系统接缝 + 本地/沙箱 + `read`/`write`/`edit`/`glob`/`grep` |
| `subprocess/` / `sandbox/` / `terminal/` / `lsp/` | 子进程、隔离、PTY、语言服务器 |
| `skill/` | Skill 提供方注册表 + 本地提供方 + 模型工具 |
| `web/` | 搜索/抓取接缝 + 模型工具 |
| `compaction/` | 压缩接缝 |
| `session/` + `session-query/` | 持久化接缝（JSONL/SQLite）、投影、检索 |
| `storage/` / `credentials/` / `settings/` / `attachment/` / `spill/` | 非会话存储、密钥、用户设置、附件、溢出 |
| `subagent/` / `jobs/` / `workflow/` / `goal/` / `schedule/` / `plan/` / `todo/` | 委派、后台任务、工作流、目标、调度、计划、todo |
| `hooks/` | Claude Code / Codex 的 **shell-hook 桥**（canonical 扩展面仍是 Cordis 事件） |
| `interaction/` | 审批、权限预设、人类命令、ask-user |
| `extensions/` | 运行时自修改：动态 Cordis 包 define/run/undefine |
| `preset/` | 每会话 agent 组成（`agent.cordis.yml`） |
| `client/` | Web GUI：`ui-*` 也是插件 |
| `host/` / `api/` | Web 宿主、RPC 网关 |
| `acp/` | Agent Client Protocol 服务端 |
| `sdk/` | 进程外 JSON-RPC SDK |
| `mcp/` | MCP 客户端桥（把外部 server 工具注册到 `ctx.tools`） |
| `code-runtime/` | Code Mode 运行时 |
| `bundle/` | 可安装的 profile 层（`dsh-base`、`dsh-web-app`、`dsh-headless`） |
| `boot/` | **bin 启动胶水**（见第 5 节：不在「能力插件」树里） |
| `examples/`（packages） | **demo 包**，`-demo` 后缀，非产品面 |
| `experimental/` | 未发布原型（Agent Teams） |

### 2.3 不是独立「插件类型」的东西

- **Skill**：独立能力族（`ctx.skills`），不是插件框架的另一种插件。
- **Hook**：canonical 是 Cordis 事件监听；`hooks-claude-code` / `hooks-codex` 只是把外部 `hooks.json` 翻译到同一表面（[packages/hooks/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/hooks/README.md)）。
- **记忆**：没有第一方 memory 插件。记忆走 MCP 示例 overlay（见第 6 节）。
- **MCP Resources / Prompts**：官方声明未桥接，仅 Tools（[mcp-client README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/mcp-client/README.md)）。

---

## 3. 插件生命周期：发现、加载、注册、卸载

### 3.1 发现与挂上（配置层，不改 harness 源码）

运行时是一棵 **plugin tree**，从空 entry list 叠层（[docs/architecture.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)、[docs/user/develop/basic/publish.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)）：

1. **Profile**（`$DSH_HOME/profiles/<name>`，默认 `~/.dsh`）：`dsh.profile.bundles` 有序列表 + 用户 `cordis.patch.yml`。
2. **Bundle**：npm 包声明 `dsh.bundle.patch`，指向 `cordis.patch.yml`。每个产品 profile 第一层是 [`@deepseek-ai/dsh-base`](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/base/README.md)。
3. 然后：profile 自己的 patch → 家目录 `$DSH_HOME/cordis.patch.yml` → CLI `--patch` overlay。
4. 按 **row id** 整表替换 config（无 deep-merge）。`insert` 加新行。`!!js` 在挂载时插值。

发现渠道：

| 渠道 | 机制 | 出处 |
|---|---|---|
| 内置 bundle | `dsh-base` / `dsh-web-app` / `dsh-headless` | [apps/cli/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md) |
| 安装包 | `dsh plugin --profile <name> add <pkg\|github:…\|./local>`，转发 pnpm | [publish.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) |
| GitHub topic | `dsh-plugin` | README |
| 本地 overlay | `--patch ./foo.cordis.yml`，绝对路径模块 | [first plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md) |
| Agent preset | 目录内 `agent.cordis.yml`，挂到单个 agent 的 scope | [preset README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/preset/README.md) |
| 运行时自写 | `cordis_define` / `cordis_run`（opt-in，不在默认树） | [extensions README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/README.md) |

检查实际树：`dsh --profile web --dump-config`。

### 3.2 加载

- **Loader**（vendored `@deepseek-ai/cordis-plugin-loader` + include/group）并发挂载 rows。
- `inject: ['tools', 'llm', …]`：**等到服务出现才 `apply`**，不靠 YAML 行序（base patch 注释写明 row order 无加载语义）。
- 启动胶水 `boot()`：建 root context → 装 Loader → 挂 include 树 → `assertEntriesLoaded` + `assertEntriesActivated`；失败则 dispose 半树并带 bin 名报错（[app-boot README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/boot/app-boot/README.md)）。
- Fiber 状态机（[lifecycle 教程](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-tutorial/02-lifecycle-and-effects.md)、[user framework](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/index.md)）：

```
PENDING → LOADING → ACTIVE → UNLOADING → DISPOSED
                 ↘ FAILED
```

`PENDING` = 已声明但依赖服务还没有。

### 3.3 注册

`apply(ctx)` 里通过 **可逆 effect** 注册：`ctx.on`、`ctx.tools.register`、`ctx.llm` adapter、`ctx.effect(() => disposer)`。卸载时自动 unwind。

三种形态（[first plugin](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/index.md)）：

1. `export function apply(ctx)`（可加 `name` / `inject`）
2. `export default { name, inject, apply }`
3. `class extends Service`（向其它插件提供 `ctx.<key>`）

### 3.4 卸载

- 配置编辑、HMR、显式 `fiber.dispose()`、所需服务消失 → 卸载。
- disposer **开始**按注册逆序；多个 **async** disposer **并发**。顺序敏感的清理必须放进同一个 disposer。
- 用户 patch 文件被 watch：读/解析失败则保留上一棵好树，并广播 `hmr/config-update-failed`。
- MCP：HMR 热换会 disconnect + reconnect；插件 dispose 取消重连。

### 3.5 进程内还是隔离？

**默认：同一 Node 进程内的 Cordis 树。** 官方**没有**把普通插件做成 OS 进程沙箱。隔离是分层的：

| 层 | 行为 | 出处 |
|---|---|---|
| 普通插件 | 同进程，共享 `Context` | Cordis primer |
| `ctx.isolate` / `cordis:group` | **服务作用域隔离**（例如 preset 里给 `terminals`/`fs` 独立 realm），仍同进程 | [cordis-api/context.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-api/context.md)、minimal preset |
| Agent scope | 工具/prompt 对单个 agent 可见，不继承到子 agent | glossary `scope` |
| MCP stdio | **子进程**；HTTP 则连已有服务 | mcp-client README |
| bash/fs 工具 | 经 `ctx.subprocess` / `ctx.sandbox`（bwrap/Landlock/Seatbelt / Windows ACL） | dsh-base、sandbox 组 |
| 动态插件 host half | `node:vm`；官方写明 **不是安全边界**，「当作 bash 权限」 | [cordis-host-runner README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/extensions/cordis-host-runner/README.md) |
| SDK / ACP | **进程外** JSON-RPC / ACP 客户端驱动 runtime | sdk、acp 组 |
| E2B | 远程沙箱提供方（POC） | `packages/e2b` |

---

## 4. 插件契约：必须实现什么；错误与超时

### 4.1 最小必须实现

对「一个插件」官方最小契约（教程原话 “That is the complete configuration.”）：

```ts
export const name = 'my-plugin'
export function apply(ctx: Context) { /* 注册能力 */ }
```

消费其它服务时加 `inject`。提供服务时用 `Service` 子类并 `super(ctx, 'myService')`。

面向模型的工具另有 **ToolDefinition** 契约（[dsh-tools README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/tools/README.md)）：

- 强制：`name`、schema、`output { schema, render }`、`execute(args, exec)`
- `execute` 只返回 output schema 声明的 canonical JSON；必须观察 `exec.signal`
- 可选：`timeoutMs`（正有限；**声明性政策元数据，注册表本身不执行截止**）、`finalizeContent`、`presentCall`/`presentResult`、`isConcurrencySafe`
- 推荐 `defineTool()`；参数校验失败走 `INVALID_ARGS` 的正常 error-result 路径

能力接缝作者应对 Definition / Provider / Consumer 三角色，而不是只写一个 tool。

### 4.2 错误处理

| 层 | 行为 | 出处 |
|---|---|---|
| 插件 `apply` 抛错 | Fiber `FAILED`；`boot()` fail-loud，标出失败插件与栈 | app-boot |
| 启用但无 fiber / 一直 PENDING | `assertEntriesLoaded` / `assertEntriesActivated` 拒绝启动 | 同上 |
| 工具体 / 流水线抛错 | 规范化为 `{ isError: true, … }`；模型看到 `Error: <message>` | tools README、[pipeline](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/tool-execution-pipeline.md) |
| `tools/pre-execute` | allow / deny / ask（无 approval 服务则 ask→deny） | tools README |
| 单调 guard | `ctx.tools.guard()` 在 pre-execute 之后；不可被后续 waterfall 改回允许 | 同上 |
| 插件失败 vs loop | **结束当前 turn，不结束 loop** | [agent-loop README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/agent-loop/README.md) |
| LLM 失败 | `agent/request-error`；`dsh-llm-retry` 可返回 `{ kind: 'retry' }` | 同上 |
| MCP 启动失败 | 默认 `failOnStartupError: false`：激活但 0 工具；true 则拒绝激活 | mcp-client |
| 动态包 | 语法预检失败则不发 id；run 拒绝码：`definition-missing` / `host-half-failed` / `rejected` / `cancelled`… | host-runner |

取消：合作式 `AbortSignal`。开始前取消 = `ABORTED_BEFORE_DISPATCH`；开始后只把成功结果换成 `ABORTED`；deny/timeout 更具体。注册表不硬杀 in-flight promise。

### 4.3 超时

- **工具 `timeoutMs`**：注册表**不执行**。执行靠独立插件 `@deepseek-ai/dsh-tool-call-timeout-policy`，在 `tools/execute` around-dispatch 上给声明了预算的工具 arm 合作截止，超时结果 `TOOL_TIMEOUT`（[timeout-policy README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/guard/timeout-policy/README.md)）。
- **忽略 signal 的工具不会因超时停止**。官方明确 shipped `bash`/`read`/`write`/`edit` **故意不声明** `timeoutMs`。
- MCP `toolCallTimeoutMs` 默认 60000；连接/发现超时继承 MCP SDK 60s，DSH 尚未暴露。
- 动态 host half：`vmTimeoutMs` 默认 5000（同步评估）；对人审批的 run **没有** round-trip 定时器，只跟调用方 `AbortSignal`。
- 会话标题 LLM 等个别插件自带 `timeoutMs` config（见 dsh-base patch）。

工具执行顺序（生成图）：`tools/pre-execute` → monotonic guards → `tools/execute`（timeout/retry/metrics）→ 工具体 → `tools/post-execute` → `finalizeContent` → `tools/result`。

---

## 5. 「一切皆插件」之后，不可替换的内核还剩什么

产品站把这句话钉死了（[deepseek.com/harness](https://deepseek.com/harness/)）：

> **Cordis 内核只负责插件的加载、卸载和依赖关系，不承载 Agent 的具体能力。**

架构文档：

> There is no privileged core to patch: you extend dsh by mounting a plugin beside the others

因此：session、tools 注册表、system-prompt、**agent-loop 本身** 在产品意义上都是可替换插件（`core/` 仍标 Product — stable API）。`dsh-agent-loop` 自称「唯一包含具体 loop 逻辑的包」，其它东西挂扩展点；扩展插件依赖 `dsh-agent` **不要**直接依赖 loop，以便换 driver（[core README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/core/README.md)）。

真正**不能当「能力插件」换掉**、否则树无法启动的，是下面这层闭环：

1. **Vendored Cordis 微内核**：`Context` / `Fiber` / `Service` / 事件（emit、waterfall、parallel、serial）/ effect 追踪。源码在 `vendor/`，发布名为 `@deepseek-ai/cordis`（[vendor/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/vendor/README.md)）。上游论文：[A Programming Paradigm for Spatiotemporal Composability](https://github.com/cordiverse/paper)。
2. **Loader 族**：`cordis-plugin-loader`、`include`、`group`、可选 `hmr`/`timer`。负责 YAML 树、`!!js`、isolate realm。
3. **Boot 胶水** `dsh-app-boot`：**库，不是能力插件**。解析 profile/bundle、叠 patch、`boot()`、fail-loud、profile 的 `node_modules` 愈合。没有它，配置成不了进程。
4. **启动器** `@deepseek-ai/dsh`：只解析 launcher 旗标，把其余 argv 交给已 boot 的 profile（[apps/cli/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/README.md)）。
5. **兼容性不变量（换插件也得遵守，否则其它插件对不上）**：
   - 会话日志是模型可见事实的唯一来源；「Model-visible means logged」（architecture）。
   - 回合流水线事件名：`turn/*`、`step/*`、`agent/pre-step`、`agent/request`、`llm/stream`、`tools/*`（architecture Turn flow）。
   - `ctx` 键与声明合并的事件名（生成目录 [docs/subsystems](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/subsystems)）。
   - 工具 canonical output / 取消 / 作用域规则。

一次默认回合（仍由 **agent-loop 插件** 驱动，但是对照「内核还剩什么」时要知道循环长什么样）：

```
turn/start
  claim inbox
  assemble prompt + tool schemas
  agent/pre-step  (waterfall: reject | enter)
  step/start
  agent/request → llm/stream → assistant/chunk* → assistant/message
  tool/call* → tools/pre-execute → execute → post-execute → tool/result*
  step/end
  agent/turn-stopping
turn/end
```

`scope/` 是无 `ctx` 键的库（作用域原语），也不是可卸载能力插件。

**对照时注意官方用词：** 他们的 “core packages” = 产品脊骨插件（仍可替换）；他们的 “Cordis 内核” = 加载/卸载/依赖。与本仓库 `CONTEXT.md` 的「内核」不是同一层。

---

## 6. Coding agent 相关插件：内置还是示例

默认每个 profile 第一层 `dsh-base` 的 row 集合见  
<https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/bundle/base/cordis.patch.yml>  
（约 70+ 行：timer/hmr、llm、session、agent、sandbox、bash/pwsh、fs 工具、skills、subagent、workflow、web、**agent-loop**、llm-deepseek…）。

| 能力 | 判定 | 证据 |
|---|---|---|
| **bash / pwsh（一次性）** | **内置产品插件**，在 `dsh-base`。POSIX 挂 `bash-sandbox`+`tool-bash`；win32 挂 pwsh 孪生。 | base patch ids `bash-sandbox` / `tool-bash` / `pwsh-*`；[shell 组](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/shell/README.md) |
| **持久 bash（PTY）** | **第一方产品插件**，默认 **preset 选用**（极简模式只要持久 shell + 编辑器）。 | [minimal agent.cordis.yml](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/config/agent-presets/minimal/agent.cordis.yml)；tool-catalog 对 `dsh-tool-bash-persistent` |
| **read / write / edit** | **内置产品** `dsh-tool-fs`，base 含 `tool-fs` + `fs-observation-policy` + `fs-sandbox`。 | [tool-fs README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/fs/tool-fs/README.md) |
| **str_replace_editor** | **第一方产品**，base 也插入；极简 preset 用它当唯一编辑器。 | base id `tool-str-replace-editor`；minimal preset |
| **glob / grep** | **内置产品** `dsh-tool-fs-search`（经 `ctx.subprocess` 调打包的 ripgrep）。 | tool-catalog |
| **MCP** | **第一方桥插件** `@deepseek-ai/dsh-mcp-client`，**不在 dsh-base / web-app 默认树**。用户 `insert` 一行 per server。只桥 Tools。 | [mcp README](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/mcp/README.md)；bundle 内无 `mcp` 匹配 |
| **记忆** | **示例 overlay only**。`examples/mcp-memory` 用通用 MCP 客户去连 Memorix / MCP Reference Memory / Engram。官方写「不构成背书」；未 `--patch` 则无记忆。 | [examples/mcp-memory/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/examples/mcp-memory/README.md) |
| **Skills** | **内置产品**：base 有 `skill` / `skill-filesystem` / `tool-skill`。 | base patch |
| **Web search/fetch** | **内置产品**（DeepSeek search 提供方 + `tool-web`）。 | base ids `web` / `web-search-deepseek` / `tool-web` |
| **LSP** | 第一方产品包；**默认 base 未列出**，需组合加载。无 provider 时工具返回 `LSP_UNAVAILABLE`。 | tool-catalog |
| **Claude Code / Codex hooks** | 第一方**桥插件**；**默认 bundle 未挂**。 | hooks 组 README；web-app patch 无 hooks |
| **动态 Cordis 工具** | 第一方但 **「Not in any shipped tree」**，故意 opt-in。 | tool-catalog `dsh-tool-cordis` |
| **ACP / JSON-RPC / headless demo** | **示例/demo 包**（`packages/examples/*-demo` + repo `examples/` leaves）。产品 one-shot 是 `dsh --profile headless`。 | [packages/examples/README.md](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/examples/README.md) |
| **Agent 模式（preset）** | 内置四套：标准 / PTC(code) / 极简 / 创造（cordis）。极简 = 持久 bash + `str_replace_editor`。 | [apps/cli/config/agent-presets](https://github.com/deepseek-ai/deepseek-harness/tree/master/apps/cli/config/agent-presets)；产品站「多种运行模式」 |

---

## 7. 对「插件契约：可替换面」的对照要点（仍非我们的设计）

上游把可替换面做成三层，不要压成一种「插件接口」：

1. **Cordis 插件模块契约**：`apply` + `inject` + 可逆注册。
2. **能力接缝三角色**：换提供方不必改 tool 名；换 tool 不必改 `ctx.fs`。
3. **配置组成**：bundle / profile / patch / preset / `--patch`，按 id 整行替换。

Coding 工具（bash、编辑、MCP）在上游都是**插件**；前两类是默认分发的产品插件，MCP 是第一方但默认不挂，记忆只是 MCP 示例。

内核若对标他们的口号，只剩 **加载/卸载/依赖的微内核 + boot 组成器 + 事件/日志词汇**；agent loop、模型、工具注册表官方都算插件。

---

## 8. 调研命令与证据路径

```powershell
smart-search doctor --format json
smart-search search "DeepSeek Agent Harness 一切皆插件 GitHub deepseek-ai" --validation balanced --extra-sources 2 --timeout 90 --format json --output C:\tmp\smart-search-evidence\20260820-deepseek-harness\01-search.json
smart-search zhipu-search "DeepSeek Agent Harness 一切皆插件 官方仓库" --count 8 --format json --output C:\tmp\smart-search-evidence\20260820-deepseek-harness\02-zhipu.json
smart-search fetch "https://github.com/deepseek-ai/deepseek-harness" --format markdown --output C:\tmp\smart-search-evidence\20260820-deepseek-harness\04-github-repo.md
smart-search fetch "https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/README.md" --format markdown --output C:\tmp\smart-search-evidence\20260820-deepseek-harness\05-readme.md
smart-search fetch "https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/docs/architecture.md" --format markdown --output C:\tmp\smart-search-evidence\20260820-deepseek-harness\08-architecture.md
smart-search fetch "https://www.npmjs.com/package/@deepseek-ai/dsh" --format markdown --output C:\tmp\smart-search-evidence\20260820-deepseek-harness\12-npm-dsh.md
smart-search fetch "https://deepseek.com/harness/" --format markdown --output C:\tmp\smart-search-evidence\20260820-deepseek-harness\15-official-site.md
```

`exa-search` 因 HTTP 400 未用成（doctor 亦报 Exa warning）；关键论断均来自 fetch 页面或上游源码。源码树浅克隆：`git clone --depth 1 https://github.com/deepseek-ai/deepseek-harness.git`。
