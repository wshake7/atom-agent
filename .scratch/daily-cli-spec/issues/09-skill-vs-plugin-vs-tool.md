# Skill 是否独立于插件与工具

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status: resolved
Blocked by: 01

## Question

本仓库要不要一个独立于**插件**与**工具**的 **Skill** 概念？若要，它是什么、不是什么？

前序：[Skill 在主流 coding agent 里是什么](./01-skill-in-coding-agents.md)。

`CONTEXT.md` 现状：在「插件」下 `_Avoid_: Skill`，意思是不要把插件叫成 Skill。本票若采纳独立概念，必须当场写入术语表，并保持「插件 ≠ Skill」。

至少裁定：

- Skill 是提示词包、可执行工具、插件的一种，还是第四种东西
- 加载面（文件约定 vs 插件登记 vs `tools` 槽）
- 默认循环 / 默认工具包是否必须认识 Skill，还是某一颗插件消费它
- 是否需要新官方槽
- 明确没有：Skill 市场、具体目录布局的实现细节（合同级路径约定可以锁）

不写代码。

## Comments

- [装配与配置形态](./08-assembly-and-config-shape.md) 已锁搜索根：`$ATOM_AGENT_HOME/skills/` 与 git 根→cwd 沿途 `.atom-agent/skills/`。本票仍裁定 Skill 是什么、谁消费；不要重开「扫不扫这些目录」。
- Q1：A。第四种东西，跟 Agent Skills 核心。已写入 `CONTEXT.md` 的 **Skill**；「插件」仍 `_Avoid_: Skill`。
- Q2：A。纯文件约定；CLI 装配按已锁根扫一层 `<name>/SKILL.md`；无运行时 `register`。
- Q3：B（未按推荐 A）。Catalog + 专用工具 `skill({ name })` 返回正文。Skill 本身仍不是业务 function。
- Q4：B。默认装配另写死一颗插件，只登记 `skill` 加载器；`--no-tools` 不卸。默认工具包不认识 Skill。
- Q5：A。Catalog 写在 `skill` 工具 description 里。循环零改动。
- Q6：A。不要 `skills` 槽，也不把未点名键当合同。清单是装配构造参数。
- Q7：A。同名近 cwd 整颗替换；坏条目跳过并告警。
- 结案确认。

## Answer

要独立 **Skill** 概念：第四种东西，跟 Agent Skills 核心。不是插件，不是 `tools` 槽上的业务 function。术语已写入 `CONTEXT.md`；「插件」仍 `_Avoid_: Skill`。

### 是什么

带 `SKILL.md` 的按需指令包：`name` / `description` 元数据 + 正文渐进披露。目录内可选脚本经已有 `bash` / 文件工具执行，不因此变成业务工具。

### 加载面

纯文件约定。CLI 装配按已锁根扫一层 `<name>/SKILL.md`：`$ATOM_AGENT_HOME/skills/` 与 git 根→cwd 沿途 `.atom-agent/skills/`（前序：[装配与配置形态](./08-assembly-and-config-shape.md)）。无运行时 `register`。内核仍不发现。同名近 cwd 整颗替换（不合并正文）；坏条目跳过并告警。加载器插件启动装一次；清单由加载器与斜杠每次现扫，不必为新增 `SKILL.md` 重启。

### 谁消费

默认循环零改动，不进闭合集。默认工具包不认识 Skill。`--no-tools` 不卸加载器。

默认装配再写死一颗 **Skill 加载器插件**（像 MCP 桥）：按装配清单往 `tools` 表登记一把 `skill({ name })`，把当前 name+description 写进这把工具的 description。正文只在该工具返回值里。清单是装配构造参数，不是槽。空清单仍挂着这把工具（description 写无可用）。allow/deny 若禁掉工具名 `skill`，加载器整把不登记——这是已锁工具开关的后果，不是新权限系统。

人话显式激活（斜杠按名注入）若要，读装配清单，归 [REPL 手感最小集](./10-repl-feel-minimum.md)。

### 槽

不要新官方槽，也不把未点名 `skills` 键当合同。官方槽名单不变。

### 明确没有

- Skill 市场、插件打包分发 Skill
- 递归 `**/SKILL.md`、扁平 `<name>.md`
- 运行时登记表、`skills` 槽、未点名键合同
- 循环 / 默认工具包认识 Skill
- 本阶段 settings 里的 per-skill enable/disable、`allowed-tools` / `disable-model-invocation` 合同
- `--no-skills` argv
- 斜杠命令名单、提示词措辞、实现级目录细节

装配默认集合已补加载器插件，见 [装配与配置形态](./08-assembly-and-config-shape.md)。
