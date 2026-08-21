# 18 — Skill：按需指令包能进回合

**Parent:** [spec.md](../spec.md)

**What to build:** 按目录放下 `SKILL.md` 就能被扫进清单；模型调用 `skill({ name })` 拿到正文。Skill 是第四种东西（按需指令包），不是插件、不是业务 function、不要 `skills` 槽。默认循环零改动。此票可单独验收 Skill 簇（`/skill` 斜杠留给第 20 票）。

**Blocked by:** 15 — 分层配置叠出装配

**Status:** ready-for-agent

- [ ] 搜索根：`$ATOM_AGENT_HOME/skills/` 与 git 根→cwd 沿途 `.atom-agent/skills/`。只扫一层 `<name>/SKILL.md`。无运行时 `register`。同名近 cwd 整颗替换（不合并正文）；坏条目跳过并告警。启动读一次
- [ ] 默认装配另写死一颗 Skill 加载器插件（像 MCP 桥一样写死，不是官方槽）。按装配清单往 `tools` 表登记 `skill({ name })`，把当前 name+description 写进这把工具的 description；正文只在返回值里。空清单仍挂着这把工具（description 写无可用）
- [ ] 默认工具包不认识 Skill。`--no-tools` 卸默认工具包，不卸 Skill 加载器。allow/deny 若禁掉工具名 `skill`，加载器整把不登记
- [ ] 明确没有：Skill 市场、递归 `**/SKILL.md`、扁平 `<name>.md`、per-skill enable、`--no-skills`、`skills` 槽。一层 `SKILL.md` 进清单、`skill({ name })` 返回正文，可在假 `llm` 下经宿主加载面单独验过
