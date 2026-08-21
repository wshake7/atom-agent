# pi 系统提示文件的搜索与合并

- 票：`.scratch/system-prompt/issues/01-pi-system-prompt-files.md`
- 取证日期：2026-08-21
- 源码快照：`git clone --depth 1 https://github.com/earendil-works/pi.git` → `/tmp/pi-src`，commit `77f2d1235ee2992c6072b9dcb6e99439a70c6f45`（2026-08-21，`main`）
- 文档：仓库内 `packages/coding-agent/docs/usage.md`（与 https://pi.dev/docs/latest/usage 同源；本机 fetch `pi.dev` 被 SSRF 拦截，正文以 clone 为准）
- 本笔记只描述上游事实，**不做 Atom 自己的路径或正文决策**。

权威入口：

| 角色 | 路径 / URL |
|------|------------|
| 拼装函数 | `packages/coding-agent/src/core/system-prompt.ts` `buildSystemPrompt` |
| 文件发现 | `packages/coding-agent/src/core/resource-loader.ts` |
| 会话层重建 | `packages/coding-agent/src/core/agent-session.ts` `_rebuildSystemPrompt` |
| SDK | `packages/coding-agent/src/core/sdk.ts` `createAgentSession` |
| Skill 清单格式 | `packages/coding-agent/src/core/skills.ts` `formatSkillsForPrompt` |
| 内核状态字段 | `packages/agent/src/types.ts` `AgentState.systemPrompt` |
| 发给模型 | `packages/agent/src/agent-loop.ts` `llmContext.systemPrompt`（不进 `messages`） |
| 用法文档 | `packages/coding-agent/docs/usage.md`；GitHub：https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/usage.md |

术语：pi 把最终字符串放在 `Agent.state.systemPrompt`。coding-agent 再拆 `_baseSystemPrompt`（文件+模板拼装结果）和本回合 `_systemPromptOverride`（`before_agent_start` 扩展改写）。

---

## 0. 拼装总览

数据流：

```
CLI / SDK 选项
  → DefaultResourceLoader.reload()
       SYSTEM.md / --system-prompt          → getSystemPrompt()          （替换默认模板，二选一）
       APPEND_SYSTEM.md / --append-system-prompt → getAppendSystemPrompt() （数组，join "\n\n"）
       AGENTS.md 链                         → getAgentsFiles()
       skills                               → getSkills()
  → AgentSession._rebuildSystemPrompt(activeToolNames)
       收集各 ToolDefinition.promptSnippet / promptGuidelines
       customPrompt = loader.getSystemPrompt()
       appendSystemPrompt = loader appends join
  → buildSystemPrompt(options) → _baseSystemPrompt
  → agent.state.systemPrompt = _systemPromptOverride ?? _baseSystemPrompt
```

证据：`resource-loader.ts` `reload()` 约 L515–546；`agent-session.ts` `_rebuildSystemPrompt` L1034–1067；`system-prompt.ts` L28–161。

`createAgentSession` 先把 `Agent` 建成 `systemPrompt: ""`，真正的字符串在 `new AgentSession()` → `_buildRuntime` → `setActiveToolsByName` → `_rebuildSystemPrompt` 时写入。见 `sdk.ts` L304–310 与 `agent-session.ts` L404–407、L939–953。

---

## 1. 各文件的搜索根、别名、是否沿目录链上走

全局配置目录默认 `~/.pi/agent`（`PI_CODING_AGENT_DIR` 可覆盖）。项目配置目录名是 `.pi`（`CONFIG_DIR_NAME`）。见 `packages/coding-agent/src/config.ts` L492、L515–521。

### 1.1 `SYSTEM.md`（替换默认模板）

| 优先级 | 路径 | 条件 |
|--------|------|------|
| 1 | CLI `--system-prompt` / loader 选项 `systemPrompt` | 存在则**不再发现**文件。值可以是字面量，也可以是存在的文件路径（`resolvePromptInput`） |
| 2 | `<cwd>/.pi/SYSTEM.md` | **仅项目已信任**（`settingsManager.isProjectTrusted()`） |
| 3 | `<agentDir>/SYSTEM.md` 即 `~/.pi/agent/SYSTEM.md` | 项目文件不存在或项目未信任时回落到此 |

- 项目与全局**不会合并**：`discoverSystemPromptFile` 先项目后全局，返回**一个**路径。`resource-loader.ts` L1023–1034。
- **不沿目录链上走**（没有父目录 `.pi/SYSTEM.md` 搜索）。
- 未信任项目：跳过 `<cwd>/.pi/SYSTEM.md`，仍可读全局文件。测试：`test/resource-loader.test.ts` L418–452。
- 文档：`docs/usage.md` L110–117；`README.md` L333–335。
- CLI 覆盖两者：CHANGELOG `#309`（`packages/coding-agent/CHANGELOG.md` 约 L4598）。

`getSystemPromptSource()`：字面量没有 source；文件路径才带 `{ path }`。`resource-loader.ts` L529–530；测试 L501–517。

### 1.2 `APPEND_SYSTEM.md`（追加，不替换）

| 优先级 | 路径 | 条件 |
|--------|------|------|
| 1 | CLI `--append-system-prompt`（可重复）/ `appendSystemPrompt: string[]` | 一旦传入（哪怕是数组），**跳过文件发现** |
| 2 | `<cwd>/.pi/APPEND_SYSTEM.md` | 项目已信任 |
| 3 | `<agentDir>/APPEND_SYSTEM.md` | 否则 |

- 同样只取**一个**发现文件，项目与全局不叠。`discoverAppendSystemPromptFile` L1037–1048。
- **不沿目录链上走**。
- 多个 CLI 值按出现顺序进数组，拼装时 `join("\n\n")`。`agent-session.ts` L1051–1053；CHANGELOG `#3171`。
- 每个元素同样走 `resolvePromptInput`：路径存在则读文件，否则当字面量。`resource-loader.ts` L54–68、L532–545。
- SDK 若只要自定义替换、不要家目录里的 `APPEND_SYSTEM.md`，须设 `appendSystemPromptOverride: () => []`。见 `examples/sdk/03-custom-prompt.ts` L21–24。

### 1.3 `AGENTS.md` / `CLAUDE.md`（上下文文件，始终追加到 prompt）

每目录只选**一份**，候选顺序（`loadContextFileFromDir`，`resource-loader.ts` L71–72）：

1. `AGENTS.override.md`（同目录内替换另外四个，**其它目录的文件仍拼接**）
2. `AGENTS.md`
3. `AGENTS.MD`
4. `CLAUDE.md`
5. `CLAUDE.MD`

必须是普通文件；同名目录会跳过（避免把目录当文件读）。L77–78；测试 L377–390。

搜索范围（`loadProjectContextFiles` L119–157）：

1. **用户级**：只在 `agentDir` 根上找一份（`~/.pi/agent/AGENTS.md` 等），**不**从 `$HOME` 往上走。
2. **从 `cwd` 一直 `dirname` 到文件系统根**：每个目录至多一份。祖先被插到数组头部，因此最终顺序是 **全局 → 最远祖先 → … → cwd**。
3. `--no-context-files` / `-nc` 时整段为空。`reload()` L515–521；`docs/usage.md` L230。

**不要求项目信任**：未信任时仍加载 cwd 与祖先的 `AGENTS.md`。测试 L430–456。

去重：`seenPaths` 按路径字符串。若 `cwd === agentDir`，全局那份不会因二次遍历再加一次（历史上修过双载，CHANGELOG `#239`）。

嵌套 git worktree：`findShadowedContextFile` 会跳过「被 worktree 自己那份阴影掉的主仓同名文件」，避免同一逻辑仓库上下文出现两次。L101–117、L137–147；测试块 `loadProjectContextFiles - nested worktree`。

文档：`docs/usage.md` L98–108；`README.md` L320–331；`docs/sdk.md` L344–359。

### 1.4 Skill 清单（进 prompt 的是 catalog，不是 SKILL.md 全文）

发现根（`docs/skills.md` L24–42；`docs/sdk.md` L344–358）：

- 全局：`~/.pi/agent/skills/`、`~/.agents/skills/`
- 项目（需信任）：`<cwd>/.pi/skills/`；以及从 cwd 向上的 `.agents/skills/`（到 git 根，非仓库则到文件系统根）
- 包 / `settings.json` `skills` 数组 / CLI `--skill`（`--no-skills` 时 CLI 路径仍加载）

进系统提示的是 `getSkills().skills`，由 `formatSkillsForPrompt` 生成 XML catalog。正文要模型自己 `read` 技能文件。见第 3 节。

### 1.5 不是系统提示文件

- **Prompt templates**（`~/.pi/agent/prompts/*.md`、`.pi/prompts/`）是编辑器 `/name` 展开的用户提示，不进入 `buildSystemPrompt`。`docs/prompt-templates.md`。
- 扩展文档把 `customPrompt` 说成「`--system-prompt`、`SYSTEM.md`、or custom templates」（`docs/extensions.md` L541）。源码里 `customPrompt` 只来自 `ResourceLoader.getSystemPrompt()`，不是 prompt template 文件。

---

## 2. 替换 vs 追加的精确顺序；CLI 插在哪一段之后

`buildSystemPrompt`（`system-prompt.ts`）两条路径：

### 2.1 有 `customPrompt`（`--system-prompt` 或 `SYSTEM.md` 读出的正文）

顺序：

1. `customPrompt` 原文（**整段替换默认模板**：身份、Available tools、Guidelines、Pi documentation **全部丢掉**）
2. 若有 append：`\n\n` + `appendSystemPrompt`
3. 若有 context files：`\n\n<project_context>…</project_context>\n`
4. 若 `read` 可用且有 skills：`formatSkillsForPrompt`
5. `\nCurrent working directory: ${cwd}`（反斜杠改成 `/`）

文档明确：`--system-prompt`「Replace default prompt; context files and skills are still appended」。`docs/usage.md` L242。

### 2.2 无 `customPrompt`（默认模板）

顺序：

1. 默认模板（身份 + Available tools + Guidelines + Pi documentation 段）
2. 若有 append：`\n\n` + `appendSystemPrompt`
3. context files（同上 XML）
4. skills（`hasRead && skills.length > 0`）
5. `\nCurrent working directory: ${cwd}`（默认路径末尾**没有**再加一个 `\n`，custom 路径有）

`appendSystemPrompt` 的来源（在进入 `buildSystemPrompt` 之前就拼好）：

- 无 CLI：至多一份发现到的 `APPEND_SYSTEM.md` 正文
- 有 CLI：仅 CLI 各值（文件或字面量），**不再叠加**发现文件
- 多段之间：`loaderAppendSystemPrompt.join("\n\n")`

`--system-prompt` **不是**插在默认模板之后，而是成为第 1 段。`--append-system-prompt` 插在「默认模板或 customPrompt」之后、**项目上下文 XML 之前**。

context 块格式（`system-prompt.ts` L54–61、L145–151）：

```
<project_context>

Project-specific instructions and guidelines:

<project_instructions path="...">
...file content...
</project_instructions>

</project_context>
```

多文件按 `loadProjectContextFiles` 顺序逐个包 `<project_instructions>`。

---

## 3. Skill catalog 进 prompt 的条件与格式

条件：

- `skills.length > 0`
- **当前选中工具含 `read`**
  - 默认路径：`tools.includes("read")`，`tools = selectedTools || ["read","bash","edit","write"]`
  - custom 路径：`!selectedTools || selectedTools.includes("read")`（`selectedTools` 未传时也当有 read）
- `disable-model-invocation: true` 的 skill **不进** catalog（只能 `/skill:name`）

证据：`system-prompt.ts` L63–67、L154–157；`skills.ts` L347–353、L355–381。

格式（Agent Skills 标准 XML，见 https://agentskills.io/integrate-skills）：

```
The following skills provide specialized instructions for specific tasks.
Use the read tool to load a skill's file when the task matches its description.
When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.

<available_skills>
  <skill>
    <name>…</name>
    <description>…</description>
    <location>…绝对路径…</location>
  </skill>
</available_skills>
```

`name` / `description` / `location` 做 XML 转义。文档：`docs/skills.md` L65–72。

`--no-skills` 使发现为空，catalog 自然不出现。CLI `--skill` 仍可加路径。

---

## 4. 默认模板里除身份外还写了什么

默认身份句（`system-prompt.ts` L121）：

> You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

其余段：

| 段 | 有无 | 说明 |
|----|------|------|
| Available tools | 有 | 仅列出**同时**在 `selectedTools` 且有 `toolSnippets[name]` 的工具。无 snippet 则整表 `(none)`。默认选中名是 `read, bash, edit, write`，但列表正文来自各 `ToolDefinition.promptSnippet`。 |
| 其它自定义工具一句 | 有 | 「In addition to the tools above, you may have access to other custom tools depending on the project.」 |
| Guidelines | 有 | 见下 |
| Pi documentation | 有 | 绝对路径：`getReadmePath()` / `getDocsPath()` / `getExamplesPath()`（安装包内 `README.md`、`docs/`、`examples/`），并写「不要按 cwd 解析 docs/…」 |
| 当前日期 / 时间 | **无** | `system-prompt.ts` 不含 `Date`；changelog 旧文曾提过 date/time（`#321`），现行拼装已去掉 |
| cwd | 有 | 始终追加一行 `Current working directory:`，custom 与默认都有 |
| 工具 schema / MCP 描述 | 无 | 不把参数 JSON 塞进系统提示 |

Guidelines 组装（L87–117）：

1. 仅当有 `bash` 且没有 `grep`/`find`/`ls`：`Use bash for file operations like ls, rg, find`
2. 各活动工具的 `promptGuidelines`（去重、trim）
3. 固定两条：`Be concise in your responses`；`Show file paths clearly when working with files`

内置工具贡献（`promptSnippet` / `promptGuidelines`）：

| 工具 | snippet | guidelines |
|------|---------|------------|
| read | Read file contents | Use read to examine files instead of cat or sed. |
| bash | Execute bash commands (ls, grep, find, etc.) | You can inspect PI_* environment variables…（仅 `exposeSessionEnvironment` 时挂上） |
| edit | Make precise file edits… | 精确 oldText、多处一调用、不重叠、oldText 尽量短 |
| write | Create or overwrite files | Use write only for new files or complete rewrites. |
| grep | Search file contents for patterns (respects .gitignore) | （空） |
| find | Find files by glob pattern (respects .gitignore) | （空） |
| ls | List directory contents | （空） |

来源：`tools/read.ts` L27–29、`edit.ts` L56–64、`write.ts` L20–23、`bash.ts` L46–49、`grep.ts` L38–41、`find.ts` L37–40、`ls.ts` L19–22。`AgentSession._rebuildSystemPrompt` 从当前 registry 收集这些字段。

「先 read 再 edit」**不是**默认模板里的固定 bullet；edit 的 guidelines 强调精确替换，read 的 guidelines 强调别用 cat/sed。

有 `customPrompt` 时上述身份/工具表/guidelines/Pi docs **都不出现**，只保留 append + context + skills + cwd。

---

## 5. 何时写入 `systemPrompt` / `_rebuildSystemPrompt`

### 5.1 没有 `setSystemPrompt`

`pi-agent-core` 已删除 `agent.setSystemPrompt(value)`，改为 `agent.state.systemPrompt = value`。`packages/agent/CHANGELOG.md` 0.65.0 breaking changes。

`AgentSession` 也没有公开 `setSystemPrompt`。对外是 `session.systemPrompt` getter 与直接改 `session.agent.state.systemPrompt`。

私有 `_rebuildSystemPrompt(toolNames)` 只在 coding-agent 会话层。

### 5.2 会重建 `_baseSystemPrompt` 的时机

| 时机 | 调用链 |
|------|--------|
| **启动** | `createAgentSession` → `new AgentSession` → `_buildRuntime` → `_refreshToolRegistry` → `setActiveToolsByName` → `_rebuildSystemPrompt`。`sdk.ts` L171+；`agent-session.ts` L404–407、L2678–2732、L939–953。CLI 在此之前 `DefaultResourceLoader.reload()`（`main.ts` `createRuntime` → `createAgentSessionServices`）。 |
| **换工具** | `setActiveToolsByName` 文档写「Also rebuilds the system prompt to reflect the new tool set. Changes take effect on the next agent turn.」L933–937。扩展 `getTools/setTools` 最终也走 `_refreshToolRegistry`。 |
| **扩展 `resources_discover` 之后** | `bindExtensions` → `extendResourcesFromExtensions`：扩展追加 skill/prompt/theme 路径后立刻 `_rebuildSystemPrompt`。L2387–2409。交互/print/RPC 模式启动都会 `bindExtensions`。 |
| **热加载 `/reload`** | `AgentSession.reload()`：关旧扩展 → `settingsManager.reload()` → `_resourceLoader.reload()` → `_buildRuntime`（再走 `setActiveToolsByName`）→ 若已 bind，再 `session_start` reason=`reload` + `extendResourcesFromExtensions("reload")`。L2735–2759。CHANGELOG 称 `/reload` 含 AGENTS.md、SYSTEM.md、APPEND_SYSTEM.md、skills、extensions。 |
| **`/new`（以及 `/resume` `/fork`）** | **不**在旧 session 上调 `_rebuildSystemPrompt`。`AgentSessionRuntime.newSession` 调 `createRuntime` 整棵重建：新的 `SettingsManager` + `DefaultResourceLoader.reload()` + `createAgentSessionFromServices`。`agent-session-runtime.ts` L226–259；`main.ts` L710–835。因此 `/new` 会重新读磁盘上的系统提示文件。 |

每回合 `prepareNextTurnWithContext` 把 `context.systemPrompt` 设为 `_systemPromptOverride ?? _baseSystemPrompt`，避免循环里用过期覆盖。L540–560。

### 5.3 不重建 base、只覆盖本回合

`before_agent_start` 扩展若返回 `systemPrompt`，写入 `_systemPromptOverride` 并立刻赋给 `agent.state.systemPrompt`。未返回则清 override、回到 `_baseSystemPrompt`。agent 跑完 `_runAgentPrompt` 的 `finally` 再把 override 清掉。L1243–1271、L1082。

这是**整串替换**（扩展应自己 `event.systemPrompt + extra`），不是再走 `buildSystemPrompt`。`docs/extensions.md` L530–565。

---

## 6. session JSONL 是否保存这根字符串

**不保存。**

`SessionHeader` 字段：`type, version?, id, timestamp, cwd, parentSession?`。无 `systemPrompt`。`session-manager.ts` L32–38。

JSONL 条目类型：`message` / `thinking_level_change` / `model_change` / `compaction` / `branch_summary` / `custom` / `label` / `session_info` / `custom` 消息等。`docs/session-format.md`；`session-manager.ts` L144+。

持久化的对话是 `message_end` 时的 user / assistant / toolResult / custom，不是 system role。`agent-session.ts` L650–668。

`createAgentSession` 从已有 session 恢复的是 **messages + model + thinkingLevel**，然后按**当前磁盘上的文件**重新 `buildSystemPrompt`。`sdk.ts` L189–206、L372–384。继续会话不会把旧 system prompt 字符串读回来。

HTML 导出：在线会话可把**此刻内存里的** `state.systemPrompt` 写进 HTML 数据包；从文件离线导出则为 `undefined`。`export-html/index.ts` L263–304。这不是 JSONL 字段。

发给模型时，内核把 `systemPrompt` 放在 `Context` 上，与 `messages` 分开：`agent-loop.ts` L297–302。coding-agent 的 `convertToLlm` 只转换会话消息，不把系统提示变成一条 `role: "system"` 的 JSONL 记录。

---

## 7. 对照票内六问的短答

1. **搜索根**：`SYSTEM.md` / `APPEND_SYSTEM.md` 只在 `<cwd>/.pi/`（需信任）与 `~/.pi/agent/`，不沿链。`AGENTS*` / `CLAUDE*` 在 `agentDir` 一份 + 从 cwd 走到 FS 根每目录一份；同目录别名 `AGENTS.override.md` > `AGENTS.md` > `AGENTS.MD` > `CLAUDE.md` > `CLAUDE.MD`。Skill 另有 `~/.pi/agent/skills`、`~/.agents/skills`、`.pi/skills`、祖先 `.agents/skills`。
2. **顺序**：`(默认模板 XOR customPrompt) → append → <project_context> → skills XML → cwd`。`--system-prompt` 占据 customPrompt；`--append-system-prompt` 在模板/custom 之后、上下文 XML 之前，且一旦给出就不再读 `APPEND_SYSTEM.md`。
3. **Skills**：要 `read` 在活动工具里；格式为 `<available_skills>` XML catalog，不含 SKILL.md 正文。
4. **默认模板**：身份 + 带 snippet 的工具一行表 + 工具/全局 guidelines + 安装包内 README/docs/examples 绝对路径；**无日期**；cwd 在所有路径末尾。
5. **重建**：无 `setSystemPrompt`；`_rebuildSystemPrompt` 在启动构造、换工具、扩展资源发现、`/reload` 时调用。`/new` 走整棵 `createRuntime` 重载文件再拼。扩展可每回合覆盖。
6. **JSONL**：**不**保存这根字符串；恢复会话时按当前文件重拼。
