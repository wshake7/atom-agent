# 装配与配置形态

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status: resolved
Blocked by: 04

## Question

日常 CLI 的**装配与配置**长什么样：从哪读模型端点、MCP 列表、工具开关，优先级怎么叠？

前序：[装配与配置：项目级和用户级从哪来](./04-assembly-config-in-coding-agents.md)。v0 是写死插件列表 + argv + `.env`。本图不做 npm / 目录插件市场。

至少裁定：

- 用户级 vs 项目级是否都要；各自管什么
- MCP 列表与工具开关如何声明，而不把发现做成内核契约
- 和现有 argv / 环境变量的优先级
- 配置是 CLI 产品面还是新官方槽；宿主是否仍只吃已解析的同进程模块
- 明确没有：插件市场、远程配置中心

不写代码。

## Comments

- Q1：CLI 产品面，不点名 `config` 槽（A）。
- Q2：术语拆开——配置 = 声明，装配 = 叠成已解析模块；已写入 `CONTEXT.md`（A）。
- Q3：项目可写模型名、baseUrl、MCP、工具开关；API key 不进可提交的项目文件（B）。
- Q4：要本机项目覆盖层（A）。
- Q5：完整 allow/deny 名单，内置和 MCP 同一套名字表（C，未按推荐 A）。
- Q6：MCP 独立 sidecar（用户一份、项目一份）；settings 只写开关/启用名（B，未按推荐 A）。
- Q7：非密钥标量 argv → 环境变量（含 cwd `.env` 的 `ATOM_LLM_*`）→ local → 项目 → 用户 → 默认（B）。
- Q8：密钥 `--api-key` → env → local settings → 用户 settings；项目文件不读 key（A）。
- Q9：MCP sidecar 三层含本机；同名整条替换，local → 项目 → 用户；出现可连，settings disable / 可选 enable 名单（A）。
- Q10：命名 `mcp__<server>__<tool>` + 内置短名（N1）；deny 跨层并集，allow 以最高层整表替换（S1）。
- Q11：JSON，根目录 `~/.atom-agent/` 与项目 `.atom-agent/`。项目层 MCP **同时认** `.atom-agent/mcp.json` 与仓库根 `.mcp.json`，前者存在则覆盖后者。
- Q13：`--mcp` 追加（可重复、同名 argv 赢）（M1）；`--no-tools` 不装默认工具包，MCP 仍走名单（T1）；要 `--model` / `--base-url` / `--api-key`（F1）。
- Q14：双路径只在项目层；`.atom-agent/mcp.json` 存在则整文件覆盖 `.mcp.json`；用户/本机不双认（A）。
- Q15：启动读一次（R1）；`ATOM_AGENT_HOME` 换用户根（H1）；sidecar 只 stdio（P1）；MCP enable/disable 叠法同 S1（E1）。
- Q12：从 cwd 向上走到 git 根，沿途每一层 `.atom-agent/` 都叠，标量近者赢；`.env` 仍只读启动 cwd（C）。
- Q16：答了 C（扫用户/项目 `plugins/` 目录）。与本图 Out of scope「npm / 目录插件市场」、以及「发现不进内核契约」冲突，本轮复问，未锁定。
- Q17：沿途叠 `settings.json` 与每层 `.atom-agent/mcp.json`；`.mcp.json` 只在 git 根且被同层 `.atom-agent/mcp.json` 整文件覆盖；`settings.local.json` / `mcp.local.json` 只在启动 cwd（A）。
- Q16 二次：要 plugins / hooks / skills 扫描，并改地图范围。按 D 理解（改 Out of scope），语义与 hooks 是否进目的地本轮复问，未锁定。
- Q16 三次：改地图，允许本地 `plugins/` + `skills/` 扫描；不扫 hooks；无 npm / 远程市场；内核仍无发现（B）。
- Q18：Destination 六簇不动。Out of scope「npm / 目录插件市场」改为「npm / 远程插件市场协议」。hooks 不进目的地（A）。
- Q19：`plugins/<id>/` 每个直接子目录一颗已解析同进程模块；坏条目跳过并告警，启动不失败（A）。
- 结案确认。
- 结案后修订：本地 `plugins/` 扫描与 hooks 都不进本图目的地，留给后续图；本图装配仍是写死默认集合。`skills/` 搜索根仍锁，供 Skill 票。
- [Skill 是否独立于插件与工具](./09-skill-vs-plugin-vs-tool.md) 结案：默认集合补 Skill 加载器插件；`--no-tools` 不卸。搜索根合同不变。
- [REPL 手感最小集](./10-repl-feel-minimum.md) 结案修订：用户层 `model` 改为 `{ default, forceDefault? }` 两个模型 id（字符串旧形视为只有 `default`）；叠层时这一层贡献 forceDefault 否则 default。项目链 / local 仍是字符串 `model`。优先级链不变，故项目 `model` 仍压过用户 pin。`/model` 只写用户层。

## Answer

**配置**是 CLI 产品面，不点名 `config` 槽。**装配**由 CLI 把配置叠成已解析同进程模块再交给宿主 `load`。宿主不读文件、不做发现；内核契约不变。续聊不冻配置（前序：[跨进程会话合同](./07-session-persistence-contract.md)）。启动读一次，改文件要重启。

术语已写入 `CONTEXT.md`：**配置**、**装配**、**本机覆盖**、**MCP 清单**。

### 搜索路径

JSON。`ATOM_AGENT_HOME` 换整个用户根（只从启动环境读）；默认 `~/.atom-agent/`（Windows `%USERPROFILE%\.atom-agent\`）。

项目链：从 **git 根走到 cwd**，沿途每一层 `.atom-agent/`；没 git 则只有 cwd。`.env` 仍只从**启动 cwd** 读。

| 层 | settings | MCP 清单 |
| --- | --- | --- |
| 用户 | `$ATOM_AGENT_HOME/settings.json` | `$ATOM_AGENT_HOME/mcp.json` |
| 项目链 | 沿途 `.atom-agent/settings.json` | 沿途 `.atom-agent/mcp.json`；**仅 git 根**另认 `.mcp.json`，同层已有 `.atom-agent/mcp.json` 则整文件覆盖 `.mcp.json` |
| 本机 | **仅启动 cwd** `.atom-agent/settings.local.json` | **仅启动 cwd** `.atom-agent/mcp.local.json` |

用户 / 本机不认第二份 `.mcp.json`。local 文件约定 gitignore，本票不改仓库 `.gitignore`。

### 谁管什么

项目链可写模型名、baseUrl、MCP、工具开关。项目文件里的 API key **丢掉不读**。密钥：`--api-key` → 环境变量（`ATOM_LLM_API_KEY`，含 cwd `.env`）→ local settings → 用户 settings。

非密钥标量（`model` / `baseUrl`）：argv → 环境变量（`ATOM_LLM_MODEL` / `ATOM_LLM_BASE_URL`）→ local → 项目链（近 cwd 赢）→ 用户 → 内置默认。

用户层 `model` 经 [REPL 手感最小集](./10-repl-feel-minimum.md) 改为对象 `{ default, forceDefault? }`（旧字符串视为只有 `default`）；这一层叠进去的值 = `forceDefault` 若有否则 `default`。项目链与本机 local 仍是字符串 `model`。优先级链不变。

argv：`--model`、`--base-url`、`--api-key`；`--mcp` **追加**（可重复，同名整条替换）；`--no-tools` **不装默认工具包**，MCP 工具仍走名单。

### MCP 与工具开关

MCP **清单**是 sidecar，本阶段只锁 stdio（`command` / `args` / `env`）。settings 只写 enable/disable 名，不写启动定义。同名整条替换，不字段合并。优先级：argv `--mcp` → local → 项目链近者 → 用户。未写 enable = 已解析清单全可连，再减 disable。enable/disable 叠法同工具 S1：disable 跨层并集；enable 以最高层整表替换。

工具开关是装配期 allow/deny：不 `register` 进 `tools` 槽，不是运行时权限弹窗。MCP 工具名 `mcp__<server>__<tool>`，内置短名。deny 跨层并集；某层写了 allow 则以**最高层那份 allow 整表替换**。没写 allow = 只减 deny。

### 默认集合

CLI 写死默认集合：`loop` / `llm` / 默认工具包（可卸）/ MCP 桥 / Skill 加载器（`--no-tools` 不卸）/ 本阶段已点名的官方槽提供方（`compact`、`session`）。配置没有 `plugins: []` 路径表，也**不扫** `plugins/`。

`skills/` 搜索根仍锁：`$ATOM_AGENT_HOME/skills/` 与 git 根→cwd 沿途 `.atom-agent/skills/`。扫一层 `<name>/SKILL.md`，清单交给加载器插件。Skill 是什么、谁消费，见 [Skill 是否独立于插件与工具](./09-skill-vs-plugin-vs-tool.md)。

### 明确没有

- `config` 槽、未点名配置服务
- 远程配置中心
- npm / 远程插件市场协议
- 本地 `plugins/` 目录扫描（后续图）
- hooks（目录也不扫；后续图）
- 内核发现、热重载、HTTP MCP

不收窄 [日常 CLI 闭环的退出条件](./05-daily-cli-exit-criteria.md) 不变量第 9 条：本图仍无插件市场、无本地插件目录发现。
