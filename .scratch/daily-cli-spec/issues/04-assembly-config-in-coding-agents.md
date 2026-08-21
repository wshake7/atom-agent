# 装配与配置：项目级和用户级从哪来

Type: research
Label: wayfinder:research
Triage: ready-for-agent
Status: resolved
Blocked by:

## Question

主流 coding agent 的**装配与配置**（模型端点、MCP 列表、工具开关、项目说明）从哪读、怎么叠？

必须从上游源码与第一方文档取证。至少对照：

1. Claude Code：`CLAUDE.md`、settings、`.mcp.json` 一类
2. Codex CLI 的配置面
3. pi 的配置 / extensions / 项目文件
4. 若有「发现插件目录 / npm」的，标明那是市场还是本地加载

每家回答：用户级 vs 项目级、文件名与搜索路径、MCP 怎么声明、和 argv / 环境变量的优先级、有没有插件市场（有则单独标出，本图不做市场）。

产出带引用的调研笔记，供后续「装配与配置形态」对照。不在本票决定我们的文件格式。

## Answer

三家都是「用户默认 + 项目覆盖」，说明用 Markdown 拼接、装配用 JSON/TOML；项目代码/MCP 往往要 trust。Claude：`~/.claude/settings.json` vs `.claude/settings.json`（另有 local/managed）；MCP 在 `~/.claude.json` 与仓库根 `.mcp.json`，不是 `~/.claude/mcp.json`；**有插件市场**。Codex：`~/.codex/config.toml` vs 受信任的 `.codex/config.toml`；MCP 写在同一 TOML 的 `[mcp_servers]`；项目层禁止 `model_providers` 等路由键；**有插件市场**。pi：`~/.pi/agent/settings.json` vs 受信任的 `.pi/settings.json`；**无内置 MCP**；扩展/包是本地目录 + `pi install` npm/git（gallery 只做发现，不是市场协议）。CLI 均为单次覆盖；Claude managed 政策通常压过 argv。

笔记：[装配与配置：主流 coding agent 从哪读、怎么叠](../research/assembly-config-in-coding-agents.md)
