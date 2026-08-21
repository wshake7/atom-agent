# Skill 在主流 coding agent 里是什么

Type: research
Label: wayfinder:research
Triage: ready-for-agent
Status: resolved
Blocked by:

## Question

主流 coding agent 里 **Skill**（或同类物）实际是什么、和工具 / 插件 / 系统提示怎么分界？

必须从上游源码与第一方文档取证，不要转述博客。至少对照：

1. Claude Code 的 `SKILL.md` / skills
2. Codex（OpenAI Codex CLI / 相关第一方文档）若有 skill 或等价物
3. pi（`earendil-works/pi`）的 extensions / skills
4. DeepSeek Harness 若有同类物；没有就明确写「没有」

每家回答：它叫什么、加载面（文件？包？运行时登记？）、运行时是提示词还是可执行工具、和 MCP / 插件 / 默认工具的关系、作者明确说它不是什么。

产出一份带引用的调研笔记，供后续「Skill 是否独立于插件与工具」对照。不在本票做我们的术语决策。本仓库 `CONTEXT.md` 目前在「插件」下 `_Avoid_: Skill`，调研时不要把上游的 skill 翻译成本仓库的插件。

## Answer

四家都有 **Skill**（不是「没有」）：它是带 `SKILL.md` 的**按需指令包**（Agent Skills 开放标准），启动只披露 name/description，正文和脚本后加载。它不是 MCP、不是默认 function 工具、也不是各家的插件/扩展容器——Claude/Codex 的 plugin 用来**分发** skill；pi 的对照物是 Extension（TS 可执行模块），skill 走系统提示 catalog + `read`；DeepSeek 的 Cordis 插件**实现** `ctx.skills` 接缝，模型侧另挂工具 `skill(name)`。完整引用与对照表见 [research/skill-in-coding-agents.md](../research/skill-in-coding-agents.md)。
