# 装配与配置：主流 coding agent 从哪读、怎么叠

- 票：`.scratch/daily-cli-spec/issues/04-assembly-config-in-coding-agents.md`
- 取证日期：2026-08-21
- 本笔记只描述上游事实，**不决定我们自己的文件格式**。
- 有插件市场的产品单独标出；本图对照的是本地/项目/用户装配面，不把市场做成我们的内核契约。

术语：这里的「装配」= 模型端点、MCP/工具列表、项目说明、扩展资源从哪来、按什么优先级叠成一次运行时的有效配置。

---

## 0. 三家对照（先看这张表）

| 面 | Claude Code | Codex CLI | pi |
|----|-------------|-----------|----|
| 结构化配置 | `settings.json` 分层 JSON | `config.toml` 分层 TOML | `settings.json` 全局 + 项目 deep merge |
| 用户级根 | `~/.claude/`（可用 `CLAUDE_CONFIG_DIR` 换） | `~/.codex/`（可用 `CODEX_HOME` 换） | `~/.pi/agent/`（可用 `PI_CODING_AGENT_DIR` 换） |
| 项目级根 | `.claude/` + 根目录 `.mcp.json` / `CLAUDE.md` | `.codex/`（**仅 trusted 项目**） | `.pi/`（**仅 trusted 项目**） |
| 个人项目覆盖 | `.claude/settings.local.json`、`CLAUDE.local.md` | 无独立 `local.toml`；用 user 层或 CLI `-c` | 无独立 local 文件；CLI 标志 + 不提交 `.pi/` |
| 项目说明 | `CLAUDE.md` 树走 + 拼接 | `AGENTS.md` 链，每目录最多一个文件 | `AGENTS.md`/`CLAUDE.md` 拼接；`AGENTS.override.md` 替换同目录 |
| MCP | 有。用户/local 在 `~/.claude.json`，项目在 `.mcp.json` | 有。写进同一份 `config.toml` 的 `[mcp_servers.*]` | **无内置 MCP**；扩展自己接 |
| 模型端点 | 环境变量 / settings `env` / 托管网关；不是用户随便写 base URL 表 | `config.toml` 的 model / provider；**项目层禁止** `model_providers` 等密钥路由键 | `~/.pi/agent/models.json` + `auth.json` + 环境变量 |
| argv / env | CLI 仅次于 managed；settings 的 `env` 会写进进程并盖掉同名 shell 变量 | CLI `--config` 高于项目/用户文件；`CODEX_HOME` 换整个 home | `--api-key` > `auth.json` > env > `models.json`；多数资源可用 `--no-*` 关掉发现 |
| 插件市场 | **有**（marketplace + `enabledPlugins`） | **有**（universal plugin directory + `/plugins`） | **无运行时市场协议**；本地目录 + `pi install` npm/git + 可选 gallery |

---

## 1. Claude Code

第一方文档：https://code.claude.com/docs/en/settings 、https://code.claude.com/docs/en/mcp 、https://code.claude.com/docs/en/memory 、https://code.claude.com/docs/en/cli-reference 、https://code.claude.com/docs/en/env-vars 、https://code.claude.com/docs/en/plugins

Windows 上文档写的 `~/.claude` 解析为 `%USERPROFILE%\.claude`。

### 1.1 用户级 vs 项目级（还有 managed / local）

官方四层 scope：

| Scope | 位置 | 谁受影响 | 是否进 git |
|-------|------|----------|------------|
| Managed | 远端 server-managed、plist/注册表、系统 `managed-settings.json` | 组织或整机 | IT 下发 |
| User | `~/.claude/` | 你的所有项目 | 否 |
| Project | 仓库 `.claude/` | 协作者 | 是 |
| Local | 仓库根 `.claude/settings.local.json` | 你在这个仓库 | Claude 写入时会 gitignore |

同一份 `settings.json` 形状，落点决定作用域：

- User：`~/.claude/settings.json`
- Project：`.claude/settings.json`
- Local：`.claude/settings.local.json`（git 仓库里解析到主 checkout 根；非 git / 家目录仓库 / Agent SDK 则跟启动目录）

`CLAUDE_CONFIG_DIR` 替换整个配置根（默认 `~/.claude`），含 settings、会话、插件。只从启动环境读，不从 settings 的 `env` 块读。

Managed 文件位置（与用户/项目并列，不是「再一个项目文件」）：

- macOS：`/Library/Application Support/ClaudeCode/`
- Linux/WSL：`/etc/claude-code/`
- Windows：`C:\Program Files\ClaudeCode\`（`C:\ProgramData\ClaudeCode\` 自 v2.1.75 不再支持）
- 另有 `managed-settings.d/*.json` drop-in

### 1.2 项目说明（CLAUDE.md）

这是**上下文**，不是强制配置。加载进会话后当 user message，不保证严格遵守。

文档给出的加载顺序（广 → 窄）：

| Scope | 路径 |
|-------|------|
| Managed policy | macOS `/Library/Application Support/ClaudeCode/CLAUDE.md`；Linux/WSL `/etc/claude-code/CLAUDE.md`；Windows `C:\Program Files\ClaudeCode\CLAUDE.md`；或 managed settings 的 `claudeMd` 键 |
| User | `~/.claude/CLAUDE.md` |
| Project | `./CLAUDE.md` 或 `./.claude/CLAUDE.md` |
| Local | `./CLAUDE.local.md` |

实现细节：

- 从 cwd **向上走目录树**，每层读 `CLAUDE.md` 和 `CLAUDE.local.md`，**拼接不覆盖**。
- 顺序是文件系统根 → cwd，所以离启动目录近的后读。同目录内 `CLAUDE.local.md` 接在 `CLAUDE.md` 后面。
- 子目录里的 CLAUDE.md **按需**加载（读到该目录文件时），不是启动全量。
- `.claude/rules/` 是模块化规则；可带 `paths:` frontmatter 做路径作用域。
- 可用 `@path` 再 import 文件；项目文件里指向工作区外的 import 要审批。
- 也认 `AGENTS.md`（symlink 或 `/import`），但不把 `AGENTS.md` 当成默认主文件名。
- `--append-system-prompt` / `--system-prompt` 才是系统提示级；CLAUDE.md 不是。

### 1.3 MCP 怎么声明

**不是** `~/.claude/mcp.json`。官方明确：

| Scope | 存储 | 共享 |
|-------|------|------|
| Local（默认 `claude mcp add`） | `~/.claude.json` 里**该项目路径**下的条目 | 否；只在这个项目出现 |
| Project | 仓库根 `.mcp.json` 的 `mcpServers` | 是，进 git |
| User | `~/.claude.json` 顶层 | 否；所有项目 |
| Managed | `managed-mcp.json` + `allowedMcpServers` / `deniedMcpServers` | IT |
| 插件 | 插件根 `.mcp.json` 或 `plugin.json` 内联 | 随插件 |
| Session CLI | `--mcp-config` | 本次进程 |

注意：MCP 的「local scope」**不是** `.claude/settings.local.json`。后者是 settings 的 local；MCP local 写在家目录 `~/.claude.json` 的项目条目下。

同名服务器只连一次，**整条定义取最高优先级源，字段不跨 scope 合并**：

1. Local
2. Project
3. User

插件/claude.ai connector 按 endpoint 去重。`claude mcp add --scope project|user|local`。项目 `.mcp.json` 在交互会话要审批；`claude -p` / SDK / cloud 不弹窗。未信任工作区会忽略仓库里提交的 `enabledMcpjsonServers`。

传输：stdio / http（`streamable-http` 别名）/ 已弃用 sse / ws。JSON 有 `url` 无 `type` 会被当成坏的 stdio 配置而跳过。

开关：

- `.mcp.json` 审批：`enabledMcpjsonServers` / `disabledMcpjsonServers`
- 内置/常规服务器：`enabledMcpServers` / `disabledMcpServers`（另一套，不要混）
- `--strict-mcp-config`：只信 `--mcp-config`
- `--tools` **不管** MCP 工具；要禁 MCP 用 `--disallowedTools "mcp__*"`

### 1.4 模型端点

没有用户级「任意 OpenAI 兼容端点表」作为主路径。端点来自：

- `ANTHROPIC_BASE_URL`（代理/网关）
- `ANTHROPIC_API_KEY` / 订阅登录 / Bedrock、Vertex、Foundry 一族变量
- settings 的 `model`、`fallbackModel`、`availableModels`、`env`

环境变量规则（env-vars 页）：

- 多数行为：同名 **环境变量优先于 settings 键**（例：`ANTHROPIC_MODEL` 盖掉 `model`）。例外：`ANTHROPIC_DEFAULT_MODEL`。
- 同一变量既在 **shell** 又在 settings `env` 块：Claude **把 `env` 块写进进程环境**，盖掉 shell。
- 不能在 settings 里「删除」变量，只能设成空字符串。

### 1.5 argv / 环境变量优先级

Settings 标量（文档「Settings precedence」，高 → 低）：

1. **Managed**（除少数安全例外，CLI 也盖不掉）
2. **命令行**，含 `--settings` JSON（只覆盖写出的键）
3. Local `.claude/settings.local.json`
4. Project `.claude/settings.json`
5. User `~/.claude/settings.json`

数组多数跨 scope **拼接去重**（`permissions.allow` 等）。`fallbackModel` 整链替换。Managed 定义了 `availableModels` 则用户/项目加不进去。

`--setting-sources user,project,local` 可裁层。`--safe-mode` 关掉 CLAUDE.md / skills / plugins / hooks / MCP 等自定义，但仍走鉴权、内置工具、权限和 managed 政策。

开头「How scopes interact」把 CLI 放在 Managed 之后、Local 之前，与 Settings precedence 一致。

### 1.6 市场 vs 本地加载 — **有市场，单独标出**

**市场（本图不做）：**

- `/plugin` 浏览、安装、启用
- `extraKnownMarketplaces` / 别名 `additionalMarketplaces`：仓库可预注册团队 marketplace（需 workspace trust）
- `enabledPlugins`：`plugin@marketplace` ID
- `strictKnownMarketplaces`：managed 允许名单
- 官方源 `anthropics/claude-plugins-official`
- 插件可带 skills / agents / hooks / MCP

**本地加载（对照装配面时用这个）：**

- 独立 `.claude/` 目录（skills、agents、hooks）— 文档叫 standalone，不是插件
- `--plugin-dir` / `--plugin-url`：本 session 侧载
- 项目 `.mcp.json`、用户 `~/.claude.json`

---

## 2. Codex CLI

第一方文档：https://developers.openai.com/codex/config-basic （现跳到 learn.chatgpt.com）、https://learn.chatgpt.com/docs/config-file/config-advanced 、https://learn.chatgpt.com/docs/extend/mcp 、https://learn.chatgpt.com/docs/agent-configuration/agents-md 、https://learn.chatgpt.com/docs/plugins

源码：https://github.com/openai/codex `codex-rs/config/src/loader/README.md`、`config_layer_source.rs`。GitHub `docs/config.md` 只做跳转。

CLI 与 IDE 扩展、ChatGPT desktop **共用同一套配置层**。IDE **不支持 plugins**；MCP 仍共用。

### 2.1 用户级 vs 项目级

| 层 | 路径 | 条件 |
|----|------|------|
| User | `$CODEX_HOME/config.toml`，默认 `~/.codex/config.toml` | 总是 |
| Profile | `~/.codex/<name>.config.toml`，`--profile` | 可选 |
| Project | 从项目根走到 cwd 的每一层 `.codex/config.toml`，**离 cwd 最近的赢** | **仅 trusted 项目** |
| System | Unix `/etc/codex/config.toml` | 若存在 |
| Session | CLI 标志与 `-c`/`--config` dotted TOML | 本次 |
| Managed | `requirements.toml`、MDM、enterprise bundle、legacy `managed_config.toml` | 组织 |

未信任项目：**跳过** 全部项目 `.codex/`（含项目 config、hooks、rules）。用户/系统层仍加载。

项目层有 **denylist**（来自 `codex-rs/config/src/loader/mod.rs`）。这些键永远从项目配置剥掉，因为它们决定凭证打到哪、跑什么命令：

`openai_base_url`、`chatgpt_base_url`、`model_provider`、`model_providers`、`notify`、`profile`、`profiles`、`otel`、若干 experimental URL、`apps_mcp_product_sku`、`responses_api_metadata`。

它们仍可出现在 user / system / managed / runtime 层。

### 2.2 项目说明（AGENTS.md）

启动时建 instruction chain（TUI 通常每 session 一次）：

1. **Global：** `$CODEX_HOME` 下若有非空 `AGENTS.override.md` 用它，否则 `AGENTS.md`。这一层只用第一个非空文件。
2. **Project：** 从 git 根走到 cwd；每目录按 `AGENTS.override.md` → `AGENTS.md` → `project_doc_fallback_filenames`，**每目录最多一个文件**。
3. **拼接：** 根 → cwd，空行连接；靠近 cwd 的后出现，视为覆盖。合计超过 `project_doc_max_bytes`（默认 32 KiB）停止追加。

`CODEX_HOME=$(pwd)/.codex` 会把「用户级」整锅指到项目目录——这是换 home，不是项目层 overlay。

### 2.3 MCP 怎么声明

MCP **写在 `config.toml` 里**，不是独立 `.mcp.json`。

```toml
[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
```

或 HTTP：`url` + `bearer_token_env_var` / `http_headers` / OAuth。

CLI：`codex mcp add <name> --env K=V -- <command>`、`codex mcp list`、`codex mcp login`。TUI `/mcp`。

每服务器可选：`enabled`、`required`、`enabled_tools`、`disabled_tools`（deny 在 allow 之后）、`startup_timeout_sec`、`tool_timeout_sec`、`default_tools_approval_mode`。

项目 `.codex/config.toml` 里的 MCP 同样受 trust 门闩。用户级 MCP 跨项目。

ChatGPT **网页**不读本地 `config.toml`；网页走 hosted plugin/connector。本地 MCP 只给 desktop / CLI / IDE。

### 2.4 模型端点

用户 `config.toml`：`model`、provider 相关键、`[features]`。官方 basics 例子：`model = "gpt-5.6"`。

源码把 `model_provider` / `model_providers` / `openai_base_url` 列为 **项目 denylist**：仓库不能把流量拐到自己的 URL。自定义提供商属于用户/系统/托管层，不是「提交到 git 的项目装配」。

### 2.5 argv / 环境变量优先级

用户文档（高 → 低）：

1. CLI flags 与 `--config`
2. 项目 `.codex/config.toml`（根→cwd，近者赢，trusted only）
3. `--profile` 选中的 profile 文件
4. 用户 `~/.codex/config.toml`
5. 系统 `/etc/codex/config.toml`
6. 内置默认

源码 `ConfigLayerSource::precedence()`（数字大覆盖小）与文档大体同向，但 **legacy managed TOML（40/50）高于 SessionFlags（30）**。现行用户路径应把 CLI 当成最高日常覆盖；组织 legacy managed 仍能压过 CLI。另有 `PackagedDefaults = -10`。

`CODEX_HOME` 换整个用户根，不是单键覆盖。

MCP 注册源码（`codex-mcp` `RegistrationPrecedence`）：Plugin < SelectedPlugin < **Config** < Compatibility < Extension。同名时 **用户 config.toml 压过插件自带 MCP**。

### 2.6 市场 vs 本地加载 — **有市场，单独标出**

**市场（本图不做）：**

- ChatGPT/Codex 共用 public plugin catalog
- CLI：`codex /plugins` 按 marketplace 分组安装/开关；新 session 才生效
- `features.remote_plugin`（stable，默认开）
- managed `marketplaces.restrict_to_allowed_sources` + `allowed_sources`（git / host_pattern / **local 目录**）
- 插件可绑 skills、connectors、MCP、hooks

**本地加载：**

- `~/.codex/config.toml` 与项目 `.codex/config.toml` 的 `[mcp_servers]`
- `codex mcp add`
- requirements 允许的 `source = "local"` marketplace 目录是「本地市场根」，仍属市场协议，不是 MCP 文件发现

---

## 3. pi（`earendil-works/pi`）

快照：本地 clone `C:\tmp\pi-kernel-src` @ `b7bb00b936dbe21b8e160b3e89efdec361846699`（2026-08-19）。文档：`packages/coding-agent/docs/settings.md`、`extensions.md`、`packages.md`、`environment-variables.md`、`providers.md`、`models.md`、README。

### 3.1 用户级 vs 项目级

| 位置 | Scope |
|------|--------|
| `~/.pi/agent/settings.json` | 全局 |
| `.pi/settings.json` | 项目，deep merge **覆盖**全局 |

`PI_CODING_AGENT_DIR`（源码 `ENV_AGENT_DIR`）替换 agent 目录，默认 `~/.pi/agent`。SDK 可改 `CONFIG_DIR_NAME`（默认 `.pi`）。

**Project trust：** 交互启动时，若项目有 `.pi` 资源 / 项目 `.agents/skills` 且 `~/.pi/agent/trust.json` 无记录，会询问。信任后才加载项目 settings、项目包、项目扩展。非交互默认跟全局 `defaultProjectTrust`（`ask`/`never` 忽略项目资源，`always` 信任）。`--approve` / `--no-approve` 单次覆盖。

源码 `deepMergeSettings`：嵌套对象递归合并，项目值覆盖全局。

### 3.2 项目说明

启动加载 `AGENTS.md` 或 `CLAUDE.md`：

- `~/.pi/agent/AGENTS.md`（全局）
- 从 cwd 向上的父目录
- 当前目录

同目录若有 `AGENTS.override.md`，**替换该目录的** `AGENTS.md`/`CLAUDE.md`；其他目录的文件仍拼接。全部匹配文件拼接。`--no-context-files` / `-nc` 关掉。

系统提示另走：

- 替换：`.pi/SYSTEM.md` 或 `~/.pi/agent/SYSTEM.md`
- 追加：`APPEND_SYSTEM.md`

CLI `--system-prompt` / `--append-system-prompt` 再盖一层。

### 3.3 MCP 怎么声明

**没有。** 作者明确 No MCP（README Philosophy + 2025-11-02 博文）。内核无 MCP 客户端。扩展文档把「MCP server integration」列为扩展能做的事，不是产品内置声明格式。

工具开关是 **名字 allow/deny 列表**，不是 MCP 清单：

- `--tools` / `-t`：跨内置、扩展、自定义工具的 allowlist
- `--no-tools`：默认全关
- `--no-builtin-tools`：只关内置，保留扩展工具
- `--exclude-tools`：denylist

### 3.4 模型端点

用户级文件，不在项目 `settings.json` 里当主源：

- `~/.pi/agent/models.json`：自定义 provider `baseUrl` + `api`（openai-completions / responses / anthropic / google）
- `~/.pi/agent/auth.json`：API key 与 OAuth（`0600`）
- 内置 catalog；刷新缓存在 `models-store.json`

凭证解析（providers.md）：

1. CLI `--api-key`
2. `auth.json`
3. 环境变量（`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、…）
4. `models.json` 里的 custom provider keys

`auth.json` 优先于环境变量。CLI `--provider` / `--model`（可 `provider/id`）选模型。

### 3.5 argv / 环境变量优先级

资源发现可被 CLI 裁掉，且 **显式路径仍生效**：

- `--no-extensions` 仍加载 `-e`
- `--no-skills` / `--no-prompt-templates` / `--no-themes` / `--no-context-files`
- `--offline` = `PI_OFFLINE=1`
- `--session-dir` 覆盖 `PI_CODING_AGENT_SESSION_DIR`
- `externalEditor` setting 优先于 `$VISUAL`/`$EDITOR`

没有 Claude 那种 managed JSON 政策层。信任门闩是项目代码执行边界，不是模型路由政策。

### 3.6 市场 vs 本地加载 — **本地加载 + 可选 gallery，不是插件市场运行时**

**本地 / 包加载（对照时用这个）：**

| 资源 | 用户 | 项目 |
|------|------|------|
| Extensions | `~/.pi/agent/extensions/*.ts` 或 `*/index.ts` | `.pi/extensions/`（需 trust） |
| Skills | `~/.pi/agent/skills/`、`~/.agents/skills/` | `.pi/skills/`、向上走的 `.agents/skills/` |
| Prompts / themes | `~/.pi/agent/prompts|themes/` | `.pi/prompts|themes/` |
| settings 列表 | `packages`、`extensions` 路径数组 | 同键，`-l` 写项目 |

`pi install npm:@foo/bar` / `git:host/user/repo@ref` / 本地路径。默认写用户 settings；`-l` 写项目。安装落点：`~/.pi/agent/npm|git/` 或 `.pi/npm|git/`。`-e npm:@foo/bar` 是本次临时目录，不写入 settings。

**发现面（标出，不当成 Claude/Codex 那种 marketplace 协议）：**

- npm keyword `pi-package`
- https://pi.dev/packages gallery（展示用 metadata：`video`/`image`）
- Discord 频道

没有 `/plugin marketplace add`、没有 `plugin@marketplace` ID、没有 managed allowlist 市场。包在**同一进程、同一用户权限**执行。

---

## 4. 对照时反复出现的形状（仍不做我们的格式决定）

三家都把「说明文本」和「结构化装配」分开：

- 说明：Markdown，向上走目录，拼接；越近 cwd 越后出现。
- 装配：JSON 或 TOML；用户默认 + 项目覆盖；敏感项目资源要 **trust**。
- 个人覆盖：Claude 做成正式 local 文件；Codex/pi 更依赖 user 层或 CLI。

MCP：

- Claude：独立 `.mcp.json` + 家目录 `~/.claude.json` 分 scope。
- Codex：MCP 就是 config 的一张表。
- pi：不做 MCP。

argv：

- 三家都用 CLI 做单次覆盖。
- Claude 的 managed 政策压过 CLI（少量例外）。
- Codex 日常 CLI 最高，但 legacy managed TOML 在源码里比 session flags 还高。
- pi 的 `--no-*` + 显式 `-e`/`--tools` 是「关掉发现、保留点名加载」。

市场：Claude 与 Codex **有**；pi 是 **npm/git 本地安装 + gallery**。本图后续形态若只做 argv + 文件列表，应对齐 pi 的本地加载，而不是对齐两家的 marketplace。

---

## 来源

### Fetch / 页面

- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/plugins
- https://code.claude.com/docs/en/env-vars
- https://code.claude.com/docs/en/cli-reference
- https://developers.openai.com/codex/config-basic （跳转到 learn.chatgpt.com Config basics）
- https://learn.chatgpt.com/docs/config-file/config-advanced
- https://learn.chatgpt.com/docs/extend/mcp
- https://learn.chatgpt.com/docs/agent-configuration/agents-md
- https://learn.chatgpt.com/docs/plugins
- https://raw.githubusercontent.com/openai/codex/main/docs/config.md
- https://raw.githubusercontent.com/openai/codex/main/codex-rs/config/src/loader/README.md
- https://raw.githubusercontent.com/openai/codex/main/codex-rs/config/src/config_layer_source.rs
- https://github.com/openai/codex/blob/main/codex-rs/config/src/loader/mod.rs （Context7 摘录 PROJECT_LOCAL_CONFIG_DENYLIST）
- https://github.com/openai/codex/blob/main/codex-rs/codex-mcp/src/catalog.rs （Context7 摘录 RegistrationPrecedence）

### 本地源码

- `C:\tmp\pi-kernel-src` @ `b7bb00b936dbe21b8e160b3e89efdec361846699`
- `packages/coding-agent/docs/{settings,extensions,packages,environment-variables,providers,models}.md`
- `packages/coding-agent/README.md`
- `packages/coding-agent/src/config.ts`
- `packages/coding-agent/src/core/settings-manager.ts`
- `packages/coding-agent/src/core/extensions/loader.ts`
- `packages/coding-agent/src/cli/args.ts`

### 命令

```powershell
smart-search doctor --format json
smart-search search "Claude Code CLAUDE.md settings.json mcp.json user vs project config" --validation balanced --extra-sources 1 --timeout 90 --format json --output C:\tmp\smart-search-evidence\20260821-assembly-config\01-search-claude.json
smart-search fetch "https://code.claude.com/docs/en/settings" --format markdown --output C:\tmp\smart-search-evidence\20260821-assembly-config\02-claude-settings.md
smart-search map "https://code.claude.com/docs/en" --instructions "Find settings, memory, MCP, plugins, CLAUDE.md, configuration pages" --max-depth 1 --max-breadth 30 --limit 50 --format json --output C:\tmp\smart-search-evidence\20260821-assembly-config\04-map-claude-docs.json
smart-search fetch "https://code.claude.com/docs/en/mcp" --format markdown --output C:\tmp\smart-search-evidence\20260821-assembly-config\05-claude-mcp.md
smart-search fetch "https://code.claude.com/docs/en/memory" --format markdown --output C:\tmp\smart-search-evidence\20260821-assembly-config\06-claude-memory.md
smart-search search "OpenAI Codex CLI config.toml user project MCP" --validation balanced --extra-sources 1 --timeout 90 --format json --output C:\tmp\smart-search-evidence\20260821-assembly-config\03-search-codex.json
smart-search context7-docs "/openai/codex" "config.toml MCP project user configuration precedence" --format json --output C:\tmp\smart-search-evidence\20260821-assembly-config\10-context7-codex-docs.json
smart-search fetch "https://developers.openai.com/codex/config-basic.md" --format markdown --output C:\tmp\smart-search-evidence\20260821-assembly-config\15-codex-config-basic.md
smart-search fetch "https://learn.chatgpt.com/docs/extend/mcp.md" --format markdown --output C:\tmp\smart-search-evidence\20260821-assembly-config\19-codex-mcp.md
smart-search fetch "https://learn.chatgpt.com/docs/plugins.md" --format markdown --output C:\tmp\smart-search-evidence\20260821-assembly-config\21-codex-plugins.md
```

说明：`smart-search search` 的合成内容把 Claude 用户 MCP 写成 `~/.claude/mcp.json`、把 Codex 环境变量优先级写反。**以 fetch 的第一方页面和源码为准，不采用该合成内容。** `exa-search` 在 doctor 里 HTTP 400，本票未依赖 Exa。

### 未核实 / 易过期

- Claude Code / Codex 文档随版本号（文中出现 v2.1.xxx）快速改路径与例外表。
- Codex `config_layer_source.rs` 与公开 docs 对「legacy managed vs CLI」谁更高不完全同句；笔记两者都引了。
- pi 的 `AgentHarness` 与包版本会变；本笔记以 `b7bb00b` 的 coding-agent 文档/加载器为准。
- 未 clone `openai/codex` 全文；MCP 同名优先级与项目 denylist 来自 Context7 对 GitHub 源码的摘录，已对照 loader README 与官方 config-basic。
