# REPL 手感最小集

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status: resolved
Blocked by:

## Question

流式 REPL 要达到「愿意天天开」，**最小手感**是什么？界面仍是 REPL，不是差分 TUI。

v0 现状：一行一条 stdin；ASK 用下一行答复；Abort 在循环内；无历史、无多行编辑、无斜杠命令。

至少裁定：

- 必须有：历史、多行、键盘中断、斜杠命令——各自是要还是不要
- 斜杠命令若要，最小集合（例如 `/exit`、会话切换、模型切换）；不要变成第二套 TUI
- REPL 是否继续只订阅循环最小事件集，还是本阶段要扩事件
- 明确没有：差分 TUI、完整 readline 框架选型、具体键位实现

不写代码。

## Comments

- Q1：要进程内输入历史，不另做跨进程历史文件（A）。术语 **输入历史** 已写入 `CONTEXT.md`。
- Q2：要粘贴多行合成一条再交给循环；不要第二套编辑器（A）。
- Q3：回合中键盘中断接到循环 Abort，不杀进程；空闲退出下一轮（A）。
- Q4：要斜杠命令这一产品面，不是第二套 TUI；名单下一轮（A）。术语 **斜杠命令** 已写入 `CONTEXT.md`。
- Q5：本阶段要扩循环最小事件集（B，未按推荐 A）。扩什么本轮追问。
- Q6：不新增事件名。五名不变。REPL 上屏思考增量，工具起止带已有 `arguments`（B）。Q5 落实为「多画已有载荷」，不是改循环契约。
- Q7：斜杠最小集 E+S+K+M+H：`/exit`、会话四条、`/skill <name>`、`/model`、`/help`。M 未按推荐，下一轮追问如何与「启动读一次」共存。不要 `/compact`、不要配置/MCP/权限/差分/plan。
- Q8：空闲 EOF 退出；`/exit` 随时退出；空闲中断信号不退出进程（A）。
- Q9：ASK 与主提示同一套提交单位（A）。
- Q10：作者先问 pi / Grok / Claude 的 `/model` 怎么实现；对照见本轮叙述。待选。
- Q10 二次：不要 A–E 字母。settings 要 `forceDefault` + 普通 `default`：有 forceDefault 则下次启动用它；没有则 `/model` 把 `default` 改成当前模型。字段形态、写哪一层、和 argv/env 优先级本轮追问。
- Q14：两字段都是模型 id；启动用户层有 `forceDefault` 用它否则用 `default`（A）。修订：无论有无 pin，`/model` 都写 `default`。
- Q15：只写用户层 `$ATOM_AGENT_HOME/settings.json`（A）。
- Q16：forceDefault/default 只填用户层标量；argv → env → local → 项目链仍在其上（A）。
- Q17：无参打印当前 / default / forceDefault；`/model <id>` 立刻换本会话并写 `default`。修订：`/model <id> --force` 可以把该 id pin 到 `forceDefault`。不要 picker。
- Q11：`/skill <name>` 立刻 `loop.prompt`；正文在前，同一提交单位其余文本接后；空 remainder 也立刻交（A）。
- Q12：只在空闲主提示拦斜杠；ASK 里当正文；未知命令报错不进循环（A）。
- Q13：输入历史存空闲主提示原始行（含斜杠原文）；不含 ASK；不含 Skill 展开正文（A）。
- Q18：`/model --unforce` 删 `forceDefault`（本会话不动）；`/model --force` 无 id 把当前会话标识 pin 上去（A）。整张对照确认结案。

## Answer

日常 CLI 的 REPL 手感最小集如下。界面仍是流式 REPL。不写代码、不选 readline 框架、不定具体键位。无新官方槽。循环最小事件集五名不变。

### 必须有

- **输入历史**（术语已在 `CONTEXT.md`）：只活在当前进程。存空闲主提示上人提交的原始行（含斜杠原文）。不含 ASK 答复，不含 `/skill` 展开后的正文。
- **多行**：粘贴进来的多行合成一条再 `loop.prompt`。不是第二套编辑器。
- **键盘中断**：回合进行中接到循环已有 Abort，不杀进程。空闲 stdin EOF 退出；`/exit` 随时退出；空闲中断信号不退出进程（只取消正在编辑的输入，若实现做得到）。
- **斜杠命令**（术语已在 `CONTEXT.md`）：只在空闲主提示、进 `loop.prompt` 之前拦。ASK 答复里的 `/…` 当普通文本。未知命令报错，不送给模型。

斜杠最小集：

| 命令 | 行为 |
| --- | --- |
| `/exit` | 退出进程 |
| `/new` | 新建会话 |
| `/resume` | 当前 cwd 最近一次 |
| `/session <id>` | 按 id 打开 |
| `/sessions` | 列表 |
| `/skill <name>` | 装配清单命中则立刻 `loop.prompt`：Skill 正文在前，同一提交单位里 name 后的文本接后；后面为空也立刻交。未知名报错、不调用 `loop.prompt` |
| `/model` | 见下节 |
| `/help` | 打印本名单，一行一个，不是交互菜单 |

会话四条对齐 [跨进程会话合同](./07-session-persistence-contract.md)，本票只锁斜杠名。`/skill` 读装配清单，对齐 [Skill 是否独立于插件与工具](./09-skill-vs-plugin-vs-tool.md)。

### `/model`

本会话立刻换模型标识。不重读配置文件、不换插件列表、不改 `llm` 槽、不换 `baseUrl` / API key。不要 picker。

用户层 `$ATOM_AGENT_HOME/settings.json` 修订 [装配与配置形态](./08-assembly-and-config-shape.md) 的单字符串 `model`：这一层改为对象（若仍是字符串，视为只有 `default`、无 pin；斜杠一旦写入则改成对象）：

```json
{
  "model": {
    "default": "<id>",
    "forceDefault": "<id>"
  }
}
```

`forceDefault` 可缺。叠层时用户层贡献的标量 = 有 `forceDefault` 用它，否则用 `default`。项目链 / 本机 local 仍是字符串 `model`。优先级仍是 argv `--model` → env `ATOM_LLM_MODEL` → local → 项目链 → 用户层该标量 → 内置。项目层的 `model` 仍压过用户 pin。

斜杠只写用户层，不写项目、不写 local。

| 调用 | 本会话 | `default` | `forceDefault` |
| --- | --- | --- | --- |
| `/model` | 不动 | 不动 | 不动；打印当前标识、`default`、`forceDefault`（无 pin 写明） |
| `/model <id>` | 换成 `<id>` | 写成 `<id>`（无论有无 pin） | 不动 |
| `/model <id> --force` | 换成 `<id>` | 写成 `<id>` | 写成 `<id>` |
| `/model --force` | 不动 | 不动 | 写成**当前会话**标识 |
| `/model --unforce` | 不动 | 不动 | 删除该键 |

### 事件与 ASK

不新增循环事件名。REPL 把已有的思考增量（`assistantDelta` `type: "thinking"`）画上屏；工具起止带上已有 `arguments`。压缩 / 会话 / 斜杠不经循环总线。

ASK 与主提示同一套提交单位（粘贴多行 = 一条答复）。不是权限弹窗，不改成新循环事件。

### 明确没有

- 差分 TUI、斜杠做成第二套 TUI、picker
- 完整 readline 选型、具体键位
- `/compact`（手动压缩边界归 [压缩何时触发、压什么](./14-compaction-trigger-and-scope.md)）
- `/mcp`、`/config`、权限、plan/todo
- 进程内换 `baseUrl` / key、热重载装配
- 新循环事件名、完整可观测 schema
- 跨进程输入历史文件
