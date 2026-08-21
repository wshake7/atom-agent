# Atom Agent

自研一套**极简、高扩展、可插拔**的 agent 系统，原则来自三家、实现是自己的，不 fork：

| 要对齐的                          | 落到本仓库                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| **pi 的极简**                     | 循环小；TUI、默认工具、权限不焊进内核                                                     |
| **DeepSeek Harness 的一切皆插件** | 宿主可换循环；能力按契约挂上。运行时是官方 [Cordis](https://github.com/cordiverse/cordis) |
| **AgentScope 2.0 的企业级能力**   | 可观测、会话、沙箱、可嵌入 Runtime、多智能体靠**加槽**长出，不预埋进核                    |

详见 [ADR-0008](docs/adr/0008-project-goal.md)。**v0** 只交付自己用的 coding CLI（流式 REPL、改当前仓库），用来钉死内核与插件契约；企业能力是后续阶段，不是「做完 REPL 项目就结束」。

当前切片：为自己用的 coding CLI，在终端里改代码。内核是进程内插件宿主；回合循环、模型、工具都是可替换插件。v0 只做到流式 REPL，不是对外产品，也不做差分 TUI。

## 它做什么

- 交互式流式 REPL：你输入一行，模型 ↔ 工具回合跑完再等下一行。
- 默认工具包：`read` / `write` / `edit` / `bash` / `rg`，以及问答用 `ASK`（模型提问、REPL 答复，不是权限确认）。
- Skill：按目录放下 `<name>/SKILL.md` 即可进清单；模型用 `skill({ name })` 按需取正文。
- MCP 只作工具桥：把 stdio MCP server 的 tools 登记进 `tools` 槽，不做 resources / prompts / sampling。
- 能力按契约替换：官方槽 `loop`、`tools`、`llm`、`compact`、`session`，可加不可改。

不进 v0：浏览器、多智能体、IDE 插件、权限弹窗、默认沙箱、plan/todo、后台 bash、对外发布。

## 架构

内核闭合集只有四件：服务注册、依赖注入、生命周期、匿名事件总线。运行时是官方 [Cordis](https://github.com/cordiverse/cordis) 的薄封装（`atom-kernel`），发现、boot、回合循环都不进核。

```
atom-cli（流式 REPL + 默认装配）
    │
    ▼
atom-kernel（插件宿主）
    ├── llm     ← atom-llm（薄插件，方言在 atom-openai-compat）
    ├── tools   ← atom-tools + atom-mcp（可选工具桥）+ atom-skill（skill 加载器）
    ├── compact ← atom-compact
    ├── session ← atom-session
    └── loop    ← atom-loop（一轮「模型 ↔ 工具」直到助手不再调工具或被 Abort）
```

| 包                            | 职责                                                                                    |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `packages/atom-kernel`        | 进程内插件宿主：加载已解析同进程模块、Context 取槽、匿名事件                            |
| `packages/atom-loop`          | 默认循环插件：三角消息（`user` / `assistant` / `toolResult`）、推理块回放、串行工具分发 |
| `packages/atom-llm`           | 薄 `llm` 插件：槽形状 ↔ 兼容面翻译；每次调用读装配里的当前三标量                        |
| `packages/atom-openai-compat` | OpenAI 兼容 `{baseUrl}/chat/completions` 流式 SSE 客户端库；不是插件、不占槽            |
| `packages/atom-tools`         | 默认 `tools` 插件：工作树读写、编辑、shell、ripgrep、ASK                                |
| `packages/atom-mcp`           | MCP stdio 工具桥：把远端 tools 登记进已有 `tools` 槽                                    |
| `packages/atom-skill`         | Skill 加载器：扫 `SKILL.md`，往 `tools` 登记一把 `skill({ name })`                      |
| `packages/atom-session`       | 会话日志                                                                                |
| `packages/atom-compact`       | 压缩（只读视图）                                                                        |
| `apps/atom-cli`               | 流式 REPL 与默认装配入口                                                                |

决策记录在 [`docs/adr/`](docs/adr/)。领域用语见 [`CONTEXT.md`](CONTEXT.md)。

## 要求

- Node.js `>= 22.12.0`
- pnpm `11.6.0`（见根 `package.json` 的 `packageManager`）
- [Vite+](https://viteplus.dev/guide/) 全局 CLI：`vp`

## 快速开始

```bash
vp i
```

复制环境变量并填写 OpenAI 兼容端点（兼容库请求 `{baseUrl}/chat/completions`）：

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

退出：空闲提示符 `/exit` 或 `Ctrl-C`；或对 stdin 发 EOF（Unix `Ctrl-D`）。回合进行中 `Ctrl-C` 只 Abort 当前回合，不退出进程。

## CLI

```bash
node apps/atom-cli/src/cli.ts
node apps/atom-cli/src/cli.ts --no-tools
node apps/atom-cli/src/cli.ts --mcp <command> [args...]
node apps/atom-cli/src/cli.ts --resume
node apps/atom-cli/src/cli.ts --session <id>
node apps/atom-cli/src/cli.ts --sessions
```

- 默认装上 `atom-llm`、`atom-tools`、`atom-skill`、`atom-mcp`、`atom-session`、`atom-compact`、`atom-loop`。
- `--no-tools` 关掉默认 coding 工具包。Skill 加载器不卸。没有 `--mcp` 且配置里也没有 MCP 时，循环仍能跑纯对话。
- `--mcp` 及其后参数视为一个 stdio MCP server 的 command + args，该 server 的 tools 会登记进 `tools` 槽。
- 裸启动永远是新会话。`--resume` 打开当前 cwd 最近一次；`--session <id>` 按 id 打开；`--sessions` 列出后退出。

REPL 会订阅循环事件：助手文本流式写出；工具调用打印 `[工具开始]` / `[工具结束]`；`ASK` 打印 `[问] …` 并读下一行作为答复。

### 斜杠命令

只在空闲主提示、交给循环之前拦截。`ASK` 答复里的 `/…` 当正文。`/help` 打印本表。

| 命令            | 行为                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/exit`         | 退出进程                                                                                                                                                           |
| `/new`          | 新建会话                                                                                                                                                           |
| `/resume`       | 打开当前 cwd 最近一次会话                                                                                                                                          |
| `/session <id>` | 按 id 打开会话                                                                                                                                                     |
| `/sessions`     | 列出会话                                                                                                                                                           |
| `/skill:<id>`   | 把该 Skill 正文立刻交给循环（id 后的文本接在正文后面）                                                                                                             |
| `/skills`       | 列出全部 Skill：name、desc、状态（`active` / `overridden`）、级别（`user` / `project` / `local`）、地址（`SKILL.md` 路径）。每次现扫磁盘，进程启动后新加的也能看见 |
| `/mcps`         | 列出已解析 MCP：name、desc、状态（`connected` / `disabled` / `not-enabled`）、级别、地址；已连接的再列出其 tools。改 sidecar 后需重启才会连上新 server             |
| `/model`        | 打印或切换本会话模型标识（只写用户层 settings，不换 baseUrl / key）                                                                                                |
| `/help`         | 打印本名单，一行一个                                                                                                                                               |

没有 `/compact`、`/mcp`、`/config`。

### Skill

一层目录约定：`<name>/SKILL.md`，YAML 头至少要有 `description`。

| 级别      | 搜索根                                                                                             |
| --------- | -------------------------------------------------------------------------------------------------- |
| `user`    | `$ATOM_AGENT_HOME/skills/`（未设时 `~/.atom-agent/skills/`）                                       |
| `project` | git 根到 cwd 沿途（不含仅 cwd 的那一层）`.atom-agent/skills/`；cwd 就是 git 根时这一层也算 project |
| `local`   | cwd 不是 git 根时，cwd 自己的 `.atom-agent/skills/`                                                |

同名近 cwd 整颗替换。`/skills`、`/skill:<id>` 与 `skill` 工具每次现读这些根，不必为新增 Skill 重启 REPL。

### 配置层

JSON，启动叠一次。密钥不要写进项目 `settings.json`（项目层 API key 会丢掉不读）。

| 层   | settings                                        | MCP 清单                                                                                               |
| ---- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 用户 | `$ATOM_AGENT_HOME/settings.json`                | `$ATOM_AGENT_HOME/mcp.json`                                                                            |
| 项目 | 沿途 `.atom-agent/settings.json`                | 沿途 `.atom-agent/mcp.json`；仅 git 根另认 `.mcp.json`（同层已有 `.atom-agent/mcp.json` 则整文件覆盖） |
| 本机 | 仅启动 cwd 的 `.atom-agent/settings.local.json` | 仅启动 cwd 的 `.atom-agent/mcp.local.json`                                                             |

MCP sidecar 只锁 stdio（`command` / `args` / `env`，可选 `description`）。settings 里 `mcp.enable` / `mcp.disable` 管连哪些名。

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

| 命令                    | 作用                            |
| ----------------------- | ------------------------------- |
| `vp i` / `just install` | 安装 monorepo 依赖              |
| `vp run ready`          | check + 全包测试 + 全包构建     |
| `vp run -r test`        | 各包测试                        |
| `vp run -r build`       | 各包构建（`vp pack`）           |
| `vp check`              | 格式、lint、类型检查            |
| `just atom`             | 启动默认 REPL                   |
| `just clean`            | 清理 `node_modules` / `dist` 等 |

提交前 lefthook 会对暂存文件跑 `vp staged` 和 cspell；push 前对源码/配置变更跑 `vp check`。需要跳过时用 `LEFTHOOK=0` 或 `--no-verify`。

## 仓库布局

```
apps/atom-cli/          # 流式 REPL
packages/atom-kernel/   # 插件宿主
packages/atom-loop/     # 默认循环
packages/atom-llm/      # 薄 llm 插件
packages/atom-openai-compat/ # OpenAI 兼容库
packages/atom-tools/    # 默认工具包
packages/atom-mcp/      # MCP 工具桥
packages/atom-skill/    # Skill 加载器
packages/atom-session/  # 会话日志
packages/atom-compact/  # 压缩（只读视图）
docs/adr/               # 架构决策
CONTEXT.md              # 领域用语
```

## 路线图

**项目目标**见上文与 [ADR-0008](docs/adr/0008-project-goal.md)。到 **v0 产品闭环** 共六段，顺序已锁：宿主 → 默认循环 → `llm` 端口 → 流式 REPL → 默认工具包 → MCP 工具桥。MCP 桥退出即 v0；其后才允许谈可嵌入 Runtime 与多智能体等企业能力。后续阶段靠加槽生长，不改现有三个官方槽的语义，也不给内核加第五件套。完整规格：[`.scratch/pluggable-agent-spec/spec.md`](.scratch/pluggable-agent-spec/spec.md)。
