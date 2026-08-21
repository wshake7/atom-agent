# 15 — 分层配置叠出装配

**Parent:** [spec.md](../spec.md)

**What to build:** 作者不改源码、只改分层 JSON 配置（以及 argv / 环境变量），启动后的装配跟着变：至少能换模型端点、MCP 列表、工具开关。CLI 把配置叠成已解析同进程模块再交给宿主；宿主仍不读文件、不做发现。配置不是官方槽。此票退出 = **装配与配置** 阶段边界。

**Blocked by:** 无 — 可立即开始

**Status:** resolved

- [x] `ATOM_AGENT_HOME` 换整个用户根；默认用户根仍是家目录下的 `.atom-agent/`。项目链从 git 根走到 cwd 沿途每一层都叠进去；没 git 则只有 cwd。`.env` 只从启动 cwd 读。启动读一次，改文件要重启才生效
- [x] 用户 / 项目链 / 本机覆盖分层生效：本机覆盖仅启动 cwd。项目文件里的 API key 丢掉不读。密钥：`--api-key` → `ATOM_LLM_API_KEY`（含 cwd `.env`）→ local settings → 用户 settings。非密钥标量：argv → `ATOM_LLM_MODEL` / `ATOM_LLM_BASE_URL` → local → 项目链（近 cwd 赢）→ 用户 → 内置默认
- [x] 用户层 `model` 为 `{ default, forceDefault? }`（旧字符串视为只有 `default`）；这一层叠进去的值 = 有 `forceDefault` 用它否则 `default`。项目链与本机仍是字符串 `model`；项目 `model` 仍压过用户 pin
- [x] MCP 启动定义写在 sidecar（本阶段只锁 stdio）；settings 只写 enable/disable 名。同名整条替换。优先级：`--mcp` → local → 项目链近者 → 用户。未写 enable = 已解析清单全可连，再减 disable。disable 跨层并集；enable 以最高层整表替换。仅 git 根另认 `.mcp.json`（同层已有 `.atom-agent/mcp.json` 则整文件覆盖）；用户 / 本机不认第二份 `.mcp.json`
- [x] 工具 allow/deny 是装配期名单：MCP 名 `mcp__<server>__<tool>`，内置短名。deny 跨层并集；某层写了 allow 则以最高层那份 allow 整表替换。没写 allow = 只减 deny。不是运行时权限弹窗
- [x] argv：`--model`、`--base-url`、`--api-key`；`--mcp` 追加（可重复，同名整条替换）；`--no-tools` 不装默认工具包，MCP 工具仍走名单
- [x] 缺 model / baseUrl / apiKey 任一则启动失败。配置没有 `provider` / `protocol` 字段，也没有 `plugins: []` 路径表，不扫 `plugins/`
- [x] 默认装配仍写死循环、薄 `llm`、默认可卸工具包、MCP 桥（Skill 加载器 / `compact` / `session` 由后续票补进写死名单）。宿主只吃已解析同进程模块；发现逻辑不进内核。只改 JSON / argv / env，启动后的模块列表与三标量跟着变。测试走同一宿主加载面，假 `llm` 保持默认绿灯

## Comments

CLI `assemble` 读分层 JSON / argv / cwd `.env`，叠出已解析模块与三标量再交给宿主。`--mcp` 现为 `--mcp <name> <command> [args…]`（可重复，同名整条替换）。有 `name` 的 MCP server 把工具登记为 `mcp__<server>__<tool>`。Skill / `compact` / `session` 仍留给后续票。
