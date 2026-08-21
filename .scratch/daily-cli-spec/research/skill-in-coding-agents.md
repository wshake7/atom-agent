# Skill 在主流 coding agent 里是什么

- 票：`.scratch/daily-cli-spec/issues/01-skill-in-coding-agents.md`
- 取证日期：2026-08-21
- 本笔记只描述上游事实，**不做我们自己的术语决策**。本仓库 `CONTEXT.md` 在「插件」下 `_Avoid_: Skill`；下文保留各家自己的 **Skill / Plugin / Extension / Tool** 原词，不把上游 Skill 翻译成本仓库的插件。

源码快照：

| 树 | 本地 / 远程 | 取证点 |
|----|-------------|--------|
| pi | `C:\tmp\pi-kernel-src` ← https://github.com/earendil-works/pi | commit `b7bb00b936dbe21b8e160b3e89efdec361846699`（2026-08-19） |
| DeepSeek Harness | `C:\tmp\deepseek-harness` ← https://github.com/deepseek-ai/deepseek-harness | commit `141eb6fef83422698aef7a981029e843e8161534`（2026-08-19，`0.1.0-rc.8`） |
| Codex CLI | 第一方文档 + 公开源码 `codex-rs/skills` | 文档 fetch 2026-08-21；源码 raw：https://github.com/openai/codex/tree/main/codex-rs/skills |
| Claude Code | 第一方文档 + 开放标准 + `anthropics/skills` | 文档 fetch 2026-08-21。**Claude Code CLI 本体没有完整公开实现仓**；公开源码侧是格式仓与 SDK 文档，不是 CLI 内核。 |

共享格式（四家都承认或兼容）：[Agent Skills](https://agentskills.io) 开放标准（Anthropic 2025-12-18 宣布）。规格：https://agentskills.io/specification ；集成指南：https://agentskills.io/integrate-skills

---

## 0. 开放标准里 Skill 实际是什么

规格原文：一个 skill **是一个目录**，至少含 `SKILL.md`（YAML frontmatter + Markdown 正文），可选 `scripts/`、`references/`、`assets/`。

必填 frontmatter：`name`、`description`。可选：`license`、`compatibility`、`metadata`、`allowed-tools`（实验性）。

**渐进披露（progressive disclosure）** 是设计原则，不是可选花活：

| 层 | 何时进上下文 | 内容 |
|----|--------------|------|
| 1 元数据 | 会话启动，全部 skill | `name` + `description`（约 100 tokens / skill） |
| 2 指令 | 激活该 skill | `SKILL.md` 正文（建议 <5k tokens） |
| 3 资源 | 指令引用时 | 脚本执行或再读参考文件；未访问则 0 token |

集成指南给两种激活实现：

1. **读文件**：系统提示列出 catalog，模型用已有 file-read 工具去读 `SKILL.md` 路径。
2. **专用 `activate_skill` 工具**：模型按名字加载正文。

用户显式激活常见为 `/skill-name` 或 `$skill-name`。

作者明确说它**不是**：一次性对话 prompt；也**不是**把全部说明书塞进系统提示。工程博文还把它和 MCP 分开：Skills 教流程；MCP 接外部工具，两者可互补，不是同一物。https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

---

## 1. Claude Code：`SKILL.md` / Agent Skills

### 它叫什么

官方产品名 **Agent Skills**，Claude Code 文档标题是 **Skills**。自定义 slash command **已并入 skills**：`.claude/commands/deploy.md` 与 `.claude/skills/deploy/SKILL.md` 都生成 `/deploy`。

入口：

- Claude Code：https://code.claude.com/docs/en/skills
- 平台总览：https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- 发布：https://www.anthropic.com/news/skills （2025-10；2025-12-18 更新开放标准）
- 开放技能仓：https://github.com/anthropics/skills

### 加载面

文件系统为主，插件可打包分发：

| 范围 | 路径 |
|------|------|
| 企业 | managed settings |
| 个人 | `~/.claude/skills/<name>/SKILL.md` |
| 项目 | `.claude/skills/<name>/SKILL.md` |
| 插件 | `<plugin>/skills/<name>/SKILL.md`（调用名 `/plugin-name:skill-name`） |

文档还写：单 skill 插件可以把 `SKILL.md` 放在插件根。Bundled skills（`/debug`、`/code-review`、`/doctor` 等）随产品内置。

运行时：**扫描目录登记 catalog**，不是 npm 包运行时 `register()`。插件是分发容器，不是 skill 的另一种类型。

### 运行时：提示词，可带脚本

- 默认：**prompt-based**。文档原话：bundled skills「give Claude detailed instructions and let it orchestrate the work using its tools」；对照：多数 **built-in commands**「execute fixed logic directly」。
- 启动只把 **name + description** 放进 listing（预算默认模型窗口的 1%；可配 `skillListingBudgetFraction`）。
- 用户 `/name` 或模型匹配 `description` 后，**整份渲染后的 `SKILL.md` 作为一条消息进入会话并留下**；Claude Code **后面几轮不重读文件**。
- 可选 `scripts/`：模型用 Bash 执行，脚本代码本身不必进上下文。
- Claude Code 扩展：`` !`cmd` `` 动态注入、`context: fork` 子代理、`allowed-tools` 本回合预授权。

平台 API 路径另需 **code execution tool** 容器；那是 Claude API 表面，不是 Claude Code CLI 的默认加载器。

### 和 MCP / 插件 / 默认工具 / 系统提示的关系

| 东西 | 关系（第一方措辞） |
|------|-------------------|
| **Plugins** | 「Create custom plugins to extend Claude Code with skills, agents, hooks, and MCP servers。」插件**分发** skills，skill 不是 plugin。独立 `.claude/` 适合个人/项目；插件适合分享与版本化。https://code.claude.com/docs/en/plugins |
| **MCP** | 插件组件之一，与 skills 并列。工程博文：Skills 可**补充** MCP，教怎么组合外部工具，不是 MCP 替代物。 |
| **默认 / 内置工具** | Skill 不注册新 function-calling 工具；它指挥 Claude 去用已有工具。`allowed-tools` 只做**本回合免确认**，**不限制**可调用工具集。`disallowed-tools` 才从池子里拿掉。 |
| **CLAUDE.md（memory）** | 文档：CLAUDE.md 是「procedure rather than a fact」长出来之前的常驻事实；skill body **只用时才加载**。Related：Memory 管 CLAUDE.md，Skills 管可复用流程。 |
| **Subagents / Hooks** | 并列扩展面；skill 可用 `context: fork` 或 `hooks` 字段挂上，但它们不是 skill。 |

### 作者明确说它不是什么

- **不是**对话级一次性 prompt（平台 overview：「Unlike prompts (conversation-level instructions for one-off tasks)」）。
- **不是** CLAUDE.md：后者常驻，skill 正文按需。
- **不是** built-in command 的固定逻辑；bundled skill 仍是提示编排。
- **不是**插件：插件是打包 skills/agents/hooks/MCP 的分发单元。
- **不是**默认把全部正文塞进系统提示；listing 只有元数据。
- `disable-model-invocation: true` 的 skill **不是**模型可自触发的能力，只给人 `/name`。

公开源码缺口：**没有**完整 Claude Code 运行时实现可引用。证据来自第一方文档 + `anthropics/skills` 示例仓 + Agent Skills 规格。

---

## 2. Codex（OpenAI Codex CLI）

### 它叫什么

第一方文档：**agent skills** / **Skills**。明确「Skills build on the open agent skills standard」。

入口：

- https://developers.openai.com/codex/skills （markdown：同 URL + `.md`）
- 仓内指针：https://github.com/openai/codex/blob/main/docs/skills.md → 转到上面文档
- 源码 crate：https://github.com/openai/codex/tree/main/codex-rs/skills
- 示例仓：https://github.com/openai/skills

### 加载面

本地目录扫描 + 插件包 + 内嵌系统 skill：

| Scope | 路径 |
|-------|------|
| `REPO` | 从 `$CWD` 到 git root 每一层 `.agents/skills` |
| `USER` | `$HOME/.agents/skills` |
| `ADMIN` | `/etc/codex/skills` |
| `SYSTEM` | 随 Codex 捆绑（如 `skill-creator`、`plan`）；源码把样本嵌进 crate，安装到 `CODEX_HOME/skills/.system`（`codex-rs/skills/src/lib.rs` `install_system_skills`） |

同名 skill **不合并**，选择器里可同时出现。支持 symlink。

分发：本地文件夹用于写作；要给别人装、绑 MCP connector，用 **plugin**（`.codex-plugin/plugin.json` + `skills/` + 可选 `.mcp.json` / hooks）。文档原话：「Skills are the authoring format… Plugins distribute reusable skills and connectors」。

配置：`~/.codex/config.toml` 的 `[[skills.config]]` 可 `enabled = false`。可选 `agents/openai.yaml`：UI、`allow_implicit_invocation`、MCP 依赖。

### 运行时：提示词为主，脚本可选

文档：「Instruction-only is the default。」Prefer instructions over scripts unless 需要确定性或外部工具。

激活：

1. **显式**：ChatGPT `@skill`；CLI / IDE `$skill` 或 `/skills`
2. **隐式**：任务匹配 `description`；`allow_implicit_invocation: false` 则只走显式

渐进披露：先 name + description（CLI 列表还带路径）；列表最多占上下文 **2%** 或未知窗口时 8000 字符；选中后再读完整 `SKILL.md`。列表预算**不含**激活后的正文。

源码形状（`SkillMetadata`）：`name`、`description`、`path_to_skills_md`、`scope`、可选 `plugin_id`、`policy.allow_implicit_invocation`、`dependencies.tools`（MCP 等）。crate 负责发现/解析/调用检测，不是把 skill 变成新的 function tool 类型。

### 和 MCP / 插件 / 默认工具的关系

- **Plugin ≠ Skill**：plugin 是分发单元，可含多个 skill + MCP + hooks。
- **MCP**：可写在 skill 的 `agents/openai.yaml` `dependencies.tools`，或打进 plugin 的 `.mcp.json`。Skill 声明依赖，不替代 MCP 运行时。
- **默认工具**：skill 正文指挥模型走已有 shell/文件工具；脚本是目录里的可执行文件，不是 Codex 工具注册表里的新工具名。
- 文档没有把 skill 描述成系统提示替换物；系统提示只放 catalog。

### 作者明确说它不是什么

- **不是** plugin（「Use skills to design the workflow itself, then package it as a plugin when you want other people to install it」）。
- 默认 **不是** 必须带脚本的可执行包。
- 隐式匹配关掉时 **不是** 模型可自行选用的条目。
- 第一方 **有** 这类物，不是「没有」。

---

## 3. pi（`earendil-works/pi`）

### 它叫什么

产品层 **Skills**（与 **Extensions**、**Prompt templates**、**Themes**、**Pi packages** 并列）。实现 Agent Skills 标准，校验从宽：允许 `name` 与父目录不一致。

文档：

- https://pi.dev/docs/latest/skills
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md
- README Skills 段：https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md

源码：`packages/coding-agent/src/core/skills.ts`、`system-prompt.ts`（`formatSkillsForPrompt`）。循环内核 `pi-agent-core` **不内置** skill 类型。

### 加载面

启动扫描，结果交给 `resourceLoader.getSkills()`：

- 全局：`~/.pi/agent/skills/`、`~/.agents/skills/`
- 项目（需 trust）：`.pi/skills/`、从 cwd 上溯的 `.agents/skills/`
- 包：`skills/` 或 `package.json` 的 `pi.skills`
- settings `skills` 数组；CLI `--skill`（可重复）；`--no-skills` 关掉发现（显式 `--skill` 仍加载）

可把 Claude Code / Codex 目录加进 settings 当额外根。SDK：`skillsOverride` 可过滤或内联登记。

`Skill` 类型只有：`name`、`description`、`filePath`、`baseDir`、`sourceInfo`、`disableModelInvocation`。没有 `registerTool`。

### 运行时：系统提示 catalog + 用已有 `read` 工具

`formatSkillsForPrompt`（`skills.ts`）把可见 skill 写成 `<available_skills>` XML，并写明：

> Use the read tool to load a skill's file when the task matches its description.

`system-prompt.ts`：**仅当 `read` 工具可用时**才追加这段。这是标准的「读文件」路径，**没有**名为 `skill` 的模型工具。

用户侧：`/skill:name` 把正文注入（参数变成 `User: <args>`）。`disable-model-invocation: true` 则不进系统提示，只能 slash。

脚本：技能目录里的 helper；模型按正文用 `bash` 跑。扩展才 `pi.registerTool()`。

### 和 MCP / 插件 / 默认工具的关系

pi **没有**名为 Plugin 的产品概念。对照：

| pi 词 | 是什么 |
|-------|--------|
| **Extension** | 同进程 TypeScript，可 `registerTool` / 命令 / 事件。**可执行宿主代码**。 |
| **Skill** | `SKILL.md` 包，按需读入。 |
| **Prompt template** | `/name` 展开的 markdown 提示，不是渐进披露包。 |
| **Pi package** | npm/git 分发：可同时带 extensions + skills + prompts + themes。 |
| **默认工具** | coding-agent 注册的 `read`/`write`/`edit`/`bash`（及可选 grep/find/ls）。Skill 依赖 `read` 才能自动加载。 |
| **MCP** | README Philosophy：**No MCP**。替代：「Build CLI tools with READMEs (see Skills), or build an extension that adds MCP」。 |

项目 trust 控制是否加载项目扩展/技能，**不**限制模型调工具。

### 作者明确说它不是什么

- **不是** Extension（TS 模块 vs 文件夹说明书）。
- **不是** MCP 服务器；作者用 skill/README CLI **代替**内置 MCP。
- **不是**内核循环的一部分（产品层 / 正在迁的 harness 副本，不是 `agentLoop` 最小集）。
- **不是**默认四工具之一。

---

## 4. DeepSeek Harness：**有**同类物，不是「没有」

### 它叫什么

官方 **Skill** 能力族：`ctx.skills` 注册表 + 本地提供方 + 模型工具 `skill`。文档：「Skills are optional instructions, not session events」。

产品站把「技能」和「插件」并列：模型、工具、**技能**、会话、沙箱、循环等**均由插件组合而成**——意思是 **Skill 能力由插件实现**，不是「Skill = 插件种类」。

入口：

- 子系统：https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/skills.md
- 包族：`packages/skill/`
- 接缝表：`docs/capability-seams.md` 行 `ctx.skills`（seam，不是 core）

### 加载面

**运行时登记提供方**，默认实现扫盘：

| 包 | 角色 | ctx |
|----|------|-----|
| `dsh-skill` | 纯注册表 | `ctx.skills` |
| `dsh-skill-filesystem` | 本地发现 | 向 `ctx.skills` registerProvider |
| `dsh-skill-badge` | 可选捆绑 skill | 同上 |
| `dsh-tool-skill` | catalog + 模型工具 | `ctx.tools` 上的 `skill` |

文件系统根（rank 越小越优先）：`.dsh/skills` → `.agents/skills` → custom → `~/.dsh/skills` → `~/.agents/skills` → bundled。只认 **一层** `<name>/SKILL.md` 或扁平 `<name>.md`，**故意不做**递归 `**/SKILL.md`。

也可 `ctx.skills.register(skill)` 嵌入运行时 skill（`provider: "runtime"`）。提供方可换 HTTP/远程，不改模型合同。

### 运行时：专用 `skill` 工具 + 会话 catalog 消息

这是标准的 **activate_skill** 路径，不是 pi 那种 read 路径。

- `dsh-tool-skill` 在 `agent/pre-step` 调 `snapshot()`，把 **仅 name + description** 写成 durable user-role `<system-reminder><available_skills>`。正文、路径、provider **不进 catalog**。
- 模型调用工具 `skill({ name })`，结果是 `<skill_content>`（指令 + resourceBase 提示）。资源**不枚举、不预取**。
- 用户在消息里写 `/name`：注入同一份 `<skill_content>`，且 **不再**让模型用工具重载（catalog 里写明）。`disable-model-invocation` 的 skill **只走这条人话路径**。

注册表 **不**渲染提示、**不**注册工具。Consumer 边界原文：`The registry does not render model guidance or register model-facing tools.`

### 和 MCP / 插件 / 默认工具的关系

- **Cordis 插件**：实现 seam 的代码单元（`dsh-skill` 等）。Skill **内容**是注册表里的指令包。
- **`ctx.tools`**：另一条 core 服务。`tool-skill` 是往工具表挂的**消费者**，和 `tool-bash` 同级。
- **MCP**：`dsh-mcp-client` 把外部 server 工具登记到 `ctx.tools`。官方 MCP 只桥 Tools，不桥 Resources/Prompts。Skill 不走 MCP。
- **默认 fs/bash 工具**：skill 加载后模型按正文去调它们；filesystem provider 在 `write`/`edit` 碰到 skill 文件时会 invalidate catalog。

### 作者明确说它不是什么

- **不是**插件框架的另一种 PluginType（仓库没有 PluginType 枚举；先前调研笔记同结论）。
- **不是** session event / core 词汇。
- **不是**工具注册表本身（`ctx.skills` ≠ `ctx.tools`）。
- **没有「没有」**：base bundle 含 skill / skill-filesystem / tool-skill。

---

## 5. 对照表（供后续「Skill 是否独立于插件与工具」用）

| 维度 | Claude Code | Codex CLI | pi | DeepSeek Harness |
|------|-------------|-----------|----|------------------|
| 官方名 | Agent Skills / Skills | agent skills / Skills | Skills | Skill（`ctx.skills`） |
| 格式 | `SKILL.md` 目录；跟 Agent Skills；CC 有大量私有 frontmatter | 同标准 + `agents/openai.yaml` | 同标准，name 可不等于目录 | `SKILL.md` 或扁平 `.md`；一层发现 |
| 发现 | 目录扫描；插件 `skills/` | `.agents/skills` 多层 + 系统嵌入 + 插件 | `~/.pi` / `.agents` / 包 / CLI | **Provider 注册**；默认扫盘 |
| 进模型的方式 | listing 元数据；激活后注入正文；无独立 skill 函数（文档称 Skill tool 承载部分内置命令） | listing 元数据；显式 `$` / 隐式匹配后读正文 | 系统提示 XML catalog；模型 **`read` 文件**；`/skill:name` 注入 | 会话 catalog 消息 + **工具 `skill(name)`** |
| 可执行部分 | 可选 scripts，经 Bash；bundled 仍是提示 | 可选 scripts；默认 instruction-only | 可选 scripts，经 `bash` | 正文指引；资源按需再读 |
| 相对「插件」 | Plugin **打包** skill | Plugin **分发** skill | 无 Plugin；对照物是 **Extension** | 插件实现 seam；skill **内容**不是插件 |
| 相对 MCP | 并列；可互补 | skill 可声明 MCP 依赖；plugin 可绑 MCP | 默认不做 MCP，用 skill/扩展替代 | MCP 只进 `ctx.tools` |
| 相对默认工具 | 编排已有工具；`allowed-tools` 只授权 | 编排已有工具 | 依赖 `read`；不新增工具名 | `skill` 是**多出来的一个**模型工具，加载后仍用 bash/fs |
| 相对系统提示 / 记忆 | ≠ CLAUDE.md；listing ≠ 正文 | catalog ≠ 正文 | catalog 进 system prompt，正文不进 | catalog 是 user-role reminder，正文是 tool result |
| 作者说「不是」 | 不是一次性 prompt、不是 CLAUDE.md、不是 plugin、不是固定逻辑 command | 不是 plugin；默认不是脚本包 | 不是 extension、不是 MCP、不是内核 | 不是 session event、不是工具表、不是 PluginType |

四家共同点（有第一方文本）：

1. Skill 是 **可发现的指令包**（文件夹 + `SKILL.md`），核心价值是 **渐进披露**。
2. 可选捆绑脚本，但 **默认叙事是说明书**，确定性代码是附件。
3. **分发容器**（Claude/Codex plugin、pi package、dsh Cordis 插件）≠ skill 内容本身。
4. 和 **MCP / 默认 function tools** 分层：skill 教何时何地用工具，一般不把自己注册成业务工具。

最大分叉：激活通道——pi 复用 `read`；DeepSeek 新增 `skill` 工具；Claude/Codex 产品层注入正文（listing 在提示里，激活像消息/选择器，不是给循环新增一种 tool 类型）。

---

## 6. 取证命令与未覆盖

`smart-search doctor --format json`（2026-08-21）`ok: true`。主张均经 `fetch` 或本地第一方树，不靠 `search.content`。

关键 fetch：

- `smart-search fetch https://code.claude.com/docs/en/skills.md`
- `smart-search fetch https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview`
- `smart-search fetch https://www.anthropic.com/news/skills`
- `smart-search fetch https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills`
- `smart-search fetch https://agentskills.io/specification`
- `smart-search fetch https://agentskills.io/integrate-skills`
- `smart-search fetch https://developers.openai.com/codex/skills.md`
- `smart-search fetch https://developers.openai.com/plugins/build/plugins`
- `smart-search fetch https://pi.dev/docs/latest/skills`
- `smart-search fetch https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/skills.md`
- `smart-search fetch https://raw.githubusercontent.com/openai/codex/main/codex-rs/skills/src/lib.rs` 等

未覆盖 / 降级：

- Claude Code **运行时源码**：没有完整第一方公开实现；上表 Claude 行以文档为准。
- Exa 本轮 HTTP 400，未用。
- OpenAI Responses API 的 [Tools → Skills](https://developers.openai.com/api/docs/guides/tools-skills) 是 API 工具表面，不是 Codex CLI 合同；本票不展开。
- 不把 AgentScope 的 Skill 写入对照（票未要求）。
