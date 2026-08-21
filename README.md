# Atom Agent

自研一套**极简、高扩展、可插拔**的 agent 系统，原则来自三家、实现是自己的，不 fork：

| 要对齐的 | 落到本仓库 |
| --- | --- |
| **pi 的极简** | 循环小；TUI、默认工具、权限不焊进内核 |
| **DeepSeek Harness 的一切皆插件** | 宿主可换循环；能力按契约挂上。运行时是官方 [Cordis](https://github.com/cordiverse/cordis) |
| **AgentScope 2.0 的企业级能力** | 可观测、会话、沙箱、可嵌入 Runtime、多智能体靠**加槽**长出，不预埋进核 |

详见 [ADR-0008](docs/adr/0008-project-goal.md)。**v0** 只交付自己用的 coding CLI（流式 REPL、改当前仓库），用来钉死内核与插件契约；企业能力是后续阶段，不是「做完 REPL 项目就结束」。

当前切片：为自己用的 coding CLI，在终端里改代码。内核是进程内插件宿主；回合循环、模型、工具都是可替换插件。v0 只做到流式 REPL，不是对外产品，也不做差分 TUI。

## 它做什么

- 交互式流式 REPL：你输入一行，模型 ↔ 工具回合跑完再等下一行。
- 默认工具包：`read` / `write` / `edit` / `bash` / `rg`，以及问答用 `ASK`（模型提问、REPL 答复，不是权限确认）。
- MCP 只作工具桥：把 stdio MCP server 的 tools 登记进 `tools` 槽，不做 resources / prompts / sampling。
- 能力按契约替换：官方槽只有 `loop`、`tools`、`llm`，可加不可改。

不进 v0：浏览器、多智能体、IDE 插件、权限弹窗、默认沙箱、plan/todo、后台 bash、对外发布。

## 架构

内核闭合集只有四件：服务注册、依赖注入、生命周期、匿名事件总线。运行时是官方 [Cordis](https://github.com/cordiverse/cordis) 的薄封装（`atom-kernel`），发现、boot、回合循环都不进核。

```
atom-cli（流式 REPL + 默认装配）
    │
    ▼
atom-kernel（插件宿主）
    ├── llm    ← atom-llm（OpenAI 兼容 /chat/completions 流式适配）
    ├── tools  ← atom-tools（默认 coding 工具）+ atom-mcp（可选工具桥）
    └── loop   ← atom-loop（一轮「模型 ↔ 工具」直到助手不再调工具或被 Abort）
```

| 包 | 职责 |
| --- | --- |
| `packages/atom-kernel` | 进程内插件宿主：加载已解析同进程模块、Context 取槽、匿名事件 |
| `packages/atom-loop` | 默认循环插件：三角消息（`user` / `assistant` / `toolResult`）、推理块回放、串行工具分发 |
| `packages/atom-llm` | 默认 `llm` 适配器：流式、可 Abort；提供商方言不进槽合同 |
| `packages/atom-tools` | 默认 `tools` 插件：工作树读写、编辑、shell、ripgrep、ASK |
| `packages/atom-mcp` | MCP stdio 工具桥：把远端 tools 登记进已有 `tools` 槽 |
| `apps/atom-cli` | 流式 REPL 与默认装配入口 |

决策记录在 [`docs/adr/`](docs/adr/)。领域用语见 [`CONTEXT.md`](CONTEXT.md)。

## 要求

- Node.js `>= 22.12.0`
- pnpm `11.6.0`（见根 `package.json` 的 `packageManager`）
- [Vite+](https://viteplus.dev/guide/) 全局 CLI：`vp`

## 快速开始

```bash
vp i
```

复制环境变量并填写 OpenAI 兼容端点（适配器请求 `{baseUrl}/chat/completions`）：

```bash
cp .env.example .env
```

```dotenv
ATOM_LLM_API_KEY=
ATOM_LLM_BASE_URL=
ATOM_LLM_MODEL=
```

启动 REPL（仓库根目录）：

```bash
just atom
# 或
node apps/atom-cli/src/cli.ts
```

不要用 `vp run` 启 REPL：它不会把键盘交给进程，stdin 非 TTY 时会因 EOF 立刻退出。根脚本 `pnpm atom` 同样走上面这条 `node` 入口。

退出：对 stdin 发 EOF（Unix `Ctrl-D`，Windows 视终端而定）。

## CLI

```bash
node apps/atom-cli/src/cli.ts
node apps/atom-cli/src/cli.ts --no-tools
node apps/atom-cli/src/cli.ts --mcp <command> [args...]
```

- 默认装上 `atom-llm`、`atom-tools`、`atom-mcp`、`atom-loop`。
- `--no-tools` 关掉默认 coding 工具包。没有 `--mcp` 时会装一颗空 `tools` 表，循环仍能跑纯对话。
- `--mcp` 及其后参数视为一个 stdio MCP server 的 command + args，该 server 的 tools 会登记进 `tools` 槽。`--mcp` 必须是最后一个选项。

REPL 会订阅循环事件：助手文本流式写出；工具调用打印 `[工具开始]` / `[工具结束]`；`ASK` 打印 `[问] …` 并读下一行作为答复。

作为库装配（不走 CLI）：

```ts
import { createPluginHost } from "atom-kernel";
import { createDefaultPlugins } from "atom-cli";

const host = createPluginHost();
for (const plugin of createDefaultPlugins()) {
  await host.load(plugin);
}
const loop = host.context.get("loop");
```

## 开发

| 命令 | 作用 |
| --- | --- |
| `vp i` / `just install` | 安装 monorepo 依赖 |
| `vp run ready` | check + 全包测试 + 全包构建 |
| `vp run -r test` | 各包测试 |
| `vp run -r build` | 各包构建（`vp pack`） |
| `vp check` | 格式、lint、类型检查 |
| `just atom` | 启动默认 REPL |
| `just clean` | 清理 `node_modules` / `dist` 等 |

提交前 lefthook 会对暂存文件跑 `vp staged`。需要跳过时用 `LEFTHOOK=0` 或 `--no-verify`。

## 仓库布局

```
apps/atom-cli/          # 流式 REPL
packages/atom-kernel/   # 插件宿主
packages/atom-loop/     # 默认循环
packages/atom-llm/      # 默认模型端口
packages/atom-tools/    # 默认工具包
packages/atom-mcp/      # MCP 工具桥
docs/adr/               # 架构决策
CONTEXT.md              # 领域用语
```

## 路线图

**项目目标**见上文与 [ADR-0008](docs/adr/0008-project-goal.md)。到 **v0 产品闭环** 共六段，顺序已锁：宿主 → 默认循环 → `llm` 端口 → 流式 REPL → 默认工具包 → MCP 工具桥。MCP 桥退出即 v0；其后才允许谈可嵌入 Runtime 与多智能体等企业能力。后续阶段靠加槽生长，不改现有三个官方槽的语义，也不给内核加第五件套。完整规格：[`.scratch/pluggable-agent-spec/spec.md`](.scratch/pluggable-agent-spec/spec.md)。
