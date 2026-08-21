# 默认正文骨架

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status: resolved
Blocked by: 01

## Question

没有系统提示文件时，装配拼出的默认字符串里有哪些段、各长什么样？

图表前已锁：第一刀含短身份、当前工具名、Skill 清单。文件覆盖另票。对照 pi 默认模板，不 fork 原文（里面写的是 pi harness）。

至少裁定：

- 身份句（产品自称 atom，不是 pi）
- 工具名列表的格式；无工具时是否整段省略；要不要一段 guidelines（先读再改、路径写清等）
- Skill 清单的格式（是否 XML、是否仅当 `skill` 工具未在 allow/deny 里被禁）
- 是否写入日期、cwd、以及「只在用户问 atom 自身时去读仓库文档」这类元数据
- 默认模板内部顺序（身份 / 工具名 / guidelines / 日期 / cwd 等）
- 默认模板被 `SYSTEM.md` / `--system-prompt` **整份 XOR** 之后，APPEND 链与 AGENTS 链相对 Skill 等段的位置

不写代码。不锁搜索路径（[Atom 系统提示文件的搜索根与叠法](./02-atom-prompt-file-search.md) 已锁：XOR → APPEND → AGENTS；本票只排默认模板内部，以及 XOR 之后 Skill / 日期 / cwd 插在哪）。

## Answer

整根系统提示（段间 `\n\n`，缺席跳过、不造空段）：

`(默认模板 XOR SYSTEM.md|--system-prompt)` → APPEND 链 → AGENTS 链 → Skill XML → cwd。

**默认模板**（会被 SYSTEM XOR 整份换掉；术语已写入根目录 `CONTEXT.md`）内部顺序：身份 → 工具表 → guidelines。无工具则后两段都省略，只留身份。XOR 之后**不会**自动把工具名补回来。

身份（英文）：

```
You are atom, a coding agent. You help by reading files, running commands, and editing or writing code.
```

工具表：当前 `tools` 槽已登记短名（allow/deny、`--no-tools` 之后的实表）。一名都没有则整段省略，不写 `(none)`。版式：

```
Available tools:
- read: Read file contents
- mcp__foo__bar
```

一行摘要来自装配写死的英文对照表，只覆盖默认工具包 + `skill`。不改 `tools` 槽、不加字段。MCP 和其它插件工具只有 `- name`，**不**把 MCP description 抄进系统提示。表（只对当时登记到的名生效；实现时可微调措辞，不得改语言、不得改「谁写」）：

| 名 | 一行 |
|---|---|
| read | Read file contents |
| write | Create or overwrite files |
| edit | Make precise edits in existing files |
| bash | Execute shell commands |
| rg | Search file contents or list files by glob |
| ASK | Ask the user a question and wait |
| skill | Load a skill's instructions by name |

guidelines（固定英文，不算按工具收集；无工具则省略）：

```
Guidelines:
- Prefer dedicated file tools over bash cat/sed/ls when those tools are available.
- Read existing files before editing. Use write only for new files or complete rewrites.
- Show file paths clearly when working with files.
- Be concise.
```

**不是默认模板、XOR 之后仍在：**

- APPEND：原文，段间 `\n\n`。
- AGENTS：每份 `AGENTS.md (<绝对路径>):` + 正文，多份 `\n\n`。不用 `<project_context>`。
- Skill 清单：Agent Skills XML。同时满足「`skill` 已登记」且「现扫 catalog 非空」才出段。引导句用 `skill` 工具加载，不用 `read`。`name` / `description` / `location` XML 转义。正文仍只在 `skill({ name })` 返回值里。

```
The following skills provide specialized instructions for specific tasks.
Use the skill tool to load a skill's file when the task matches its description.
When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md) and use that absolute path in tool commands.

<available_skills>
  <skill>
    <name>…</name>
    <description>…</description>
    <location>…绝对路径…</location>
  </skill>
</available_skills>
```

- cwd：始终最后一行 `Current working directory: <abs path>`（`\` → `/`）。

**明确没有：** 日期；atom 自指文档路径；pi 的 `<project_context>` 壳；`promptSnippet` / `promptGuidelines` 字段。

**旁路（不是系统提示段，本刀一并锁）：** 默认工具包与 `skill` 的 `description` 改为英文，与身份同一语言；可比一行摘要略长，不必逐字相同。MCP description 仍用 server 原文，且不进系统提示。

## Comments

grilling 关闭。拼装示例与段合同见 Answer。
