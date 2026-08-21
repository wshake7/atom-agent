# Atom 系统提示文件的搜索根与叠法

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status: resolved
Blocked by: 01

## Question

系统提示文件和 `AGENTS.md` 在 atom 里从哪读、怎么叠？CLI 要不要 `--system-prompt` / `--append-system-prompt`？

前序：[pi 系统提示文件的搜索与合并](./01-pi-system-prompt-files.md)。约束：沿用日常 CLI 的用户根 `ATOM_AGENT_HOME`（默认 `~/.atom-agent/`）与 git 根→cwd 的 `.atom-agent/` 链，不引入 `~/.pi` 或项目 `.pi/`，除非本票明确改口。不新加官方槽。

至少裁定：

- `SYSTEM.md` / `APPEND_SYSTEM.md` 放在用户根还是 `.atom-agent/` 下；项目链是否沿途每一层都读
- `AGENTS.md` 认哪些路径（仓库根裸文件、`.atom-agent/AGENTS.md`、用户根）；是否把 `CLAUDE.md` 当别名
- 同名多层是近 cwd 整文件替换，还是全部追加
- argv 是否要覆盖/追加开关；没有就不做斜杠
- 启动读一次还是每次回合现读（与「配置启动读一次、Skill 现扫」对齐）

不写代码，不锁默认正文句子（那是 [默认正文骨架](./03-default-prompt-skeleton.md)）。

## Answer

搜索根与日常 CLI 配置同一套：用户根 `$ATOM_AGENT_HOME`（默认 `~/.atom-agent/`），项目链 git 根 → cwd 沿途每一层（没 git 只有 cwd）。不引入 `~/.pi`、项目 `.pi/`、项目信任门。启动装配读一次；改这些 markdown 要重启。坏文件（读失败、是目录）在发现链上跳过并告警；路径去重按解析后的绝对路径。

**系统提示文件**（只在用户根与沿途 `.atom-agent/` 里，不认仓库根裸 `SYSTEM.md` / `APPEND_SYSTEM.md`，没有 `SYSTEM.local.md`）：

- `SYSTEM.md`：近 cwd 整文件替换。命中一份则 **整份默认模板 XOR 掉**（身份、工具名、guidelines 一并被换）。用户根也是一层，会被项目近处盖掉。没有命中则用默认模板。
- `APPEND_SYSTEM.md`：沿链 **全部追加**，顺序用户 → git 根 → … → cwd，段间 `\n\n`。没有则跳过，不造空段。不因 SYSTEM 命中而取消。

**`AGENTS.md`**（不是系统提示文件）：用户根 `$ATOM_AGENT_HOME/AGENTS.md` + git 根 → cwd **每一层目录的裸** `AGENTS.md`。不读 `.atom-agent/AGENTS.md`，不认 `CLAUDE.md` / `AGENTS.override.md`，不走到 git 根之外。多层 **全追加**，顺序与 APPEND 相同。

跨家族顺序：`(默认模板 XOR SYSTEM.md|--system-prompt) → APPEND 链 → AGENTS 链`。Skill / 日期 / cwd 等段的有无与位置由 [默认正文骨架](./03-default-prompt-skeleton.md) 锁，但它们不是被 SYSTEM 吃掉的默认模板正文。

**argv**（无对应斜杠）：

- `--system-prompt`：字面量，或指向普通文件的路径（相对启动 cwd）。一旦出现（含空串）不再发现任何 `SYSTEM.md`，空串也 XOR 掉默认模板。指向目录或读失败则启动失败。
- `--append-system-prompt` 可重复：一旦出现不再发现任何 `APPEND_SYSTEM.md`，按出现顺序拼接；空串不造段。
- 二者都不关掉 AGENTS 链。不要 `--no-context-files`。

存在即命中：磁盘上的空 `SYSTEM.md` 与空的 `--system-prompt` 都算有意清空默认模板，不 trim 成「当没写」。
