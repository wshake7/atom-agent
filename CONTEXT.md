# Atom Agent

自研极简、高扩展、可插拔的 agent 系统：pi 的极简、DeepSeek Harness 的一切皆插件、AgentScope 2.0 的企业级能力（靠加槽长出，不预埋进核）。不 fork 三家。v0 先打赢自己用的 coding CLI；可嵌入 Runtime 与多智能体是后续阶段，不是项目终点。

## Language

**内核**:
进程内的插件宿主，不允许用插件换掉。闭合集只有四件：服务注册、依赖注入、生命周期（加载 / 卸载 / 可逆 effect）、事件总线原语（发布 / 订阅）。不是回合循环；不含业务事件名、插件发现与组成。
_Avoid_: Runtime, Engine, Framework, 回合循环, agentLoop, boot

**循环插件**:
占据 `loop` 槽、实现一次「模型 ↔ 工具」回合的插件，可整颗替换。消费 `llm` 与 `tools`，不内置提供商。删掉则无法完成回合的东西，属于这颗插件。
_Avoid_: 内核

**兼容库**:
实现一种提供商兼容面的客户端库。不是插件，不占槽。口语「提供商兼容包」同义。
_Avoid_: 适配器, 提供商插件, 把兼容库叫成 Skill, 把兼容库叫成插件

**推理块**:
`assistant` 消息上的思考内容（thinking / reasoning），不是第四种 role。默认循环合同必须保留并可在后续模型调用中回放。
_Avoid_: thinking role

**插件**:
同构的可替换模块：实现注册 / 注入 / 生命周期，向 Context 贡献服务。种类不是类型系统，内置分发仍是插件。
_Avoid_: Extension, Addon, Skill, PluginType

**槽**:
Context 上具名的服务位置。插件可贡献未点名的键（不是合同）。官方槽由契约点名，语义不可改，新能力只加新槽。
v0 官方槽：`loop`（循环）、`tools`（工具表）、`llm`（模型端口）。
日常 CLI 闭环新增官方槽：`compact`（压缩）、`session`（会话日志）。本阶段不再点名其它官方槽。
_Avoid_: 插件种类, PluginType, 预埋空官方槽

**接缝**:
后续形态的生长面：已锁的宿主四件套，加上官方槽可加不可改。不为未开始的阶段预点名槽，也不在内核加第五件套。
_Avoid_: Hook, Extension point, 空官方槽, Harness 的 seam（那是「定义 + 提供方 + 消费者」的可替换能力，不是本词）

**阶段边界**:
路线图上某一阶段结束时必须锁死的能力与不变量；后续阶段不得破坏。
_Avoid_: Epic, Milestone（阶段可用编号，但术语用阶段边界）

**规格**:
可交接实现的决策集合与分阶段路线图，不是代码。
_Avoid_: 实现计划

**v0 场景**:
作者自己使用的 coding CLI agent：流式 REPL；默认工具走 `tools` 槽；MCP 只作工具桥。不是对外产品。
_Avoid_: MVP, 产品, TUI

**v0 产品闭环**:
路线图上 MCP 工具桥阶段退出之时：宿主、默认循环、`llm` 槽、流式 REPL、默认工具包均已就绪。其后才允许谈可嵌入 Runtime / 多智能体的实现。
_Avoid_: MVP

**日常 CLI 闭环**:
v0 产品闭环之后的下一段阶段边界：路线图上 Skill · 兼容包 · REPL 手感阶段退出之时。规格另文，不改写 v0 规格。提供商方言不锁进 `llm` 槽。
_Avoid_: v1, MVP, 产品

**斜杠命令**:
REPL 在交给 `loop.prompt` 之前拦下的产品命令（以 `/` 开头）。不是官方槽，不是插件，不是第二套 TUI。
_Avoid_: 命令面板, commands 槽, 把斜杠做成差分 TUI

**配置**:
日常 CLI 的分层声明（用户 / 项目 / 本机覆盖，以及 argv 与环境变量）：模型端点、MCP 列表、工具开关。不是官方槽，不是内核契约。
_Avoid_: 装配, config 槽, 远程配置中心

**装配**:
CLI 把配置叠成已解析的同进程模块列表并交给宿主加载。默认集合写死。宿主不读配置文件，也不做发现。本地 `plugins/` 扫描不在本图。
_Avoid_: 配置, 内核发现, 插件市场, hooks

**本机覆盖**:
某仓库内不提交的配置层（`settings.local.json` / `mcp.local.json`）。不是用户级默认，也不是可共享的项目配置。
_Avoid_: Claude 的 MCP local（写在家目录、按项目路径存）

**MCP 清单**:
独立于 settings 的 sidecar 文件，声明如何启动 MCP server。本阶段只含 stdio。不是工具 allow/deny，也不是插件。
_Avoid_: 把 `.mcp.json` 当成唯一路径, 把 MCP 清单当成插件市场

**Skill**:
带 `SKILL.md` 的按需指令包（Agent Skills 核心：`name` / `description` 元数据 + 正文渐进披露）。不是插件，不是 `tools` 槽上的业务 function；目录内可选脚本仍经已有工具执行。
_Avoid_: 把插件叫成 Skill, PluginType, 把 Skill 登记成业务工具

**压缩**:
`compact` 槽上的服务：把送给模型的历史改成更短的视图。不是会话落盘，也不是跨会话旁路存储。
_Avoid_: 记忆, summarization

**记忆**:
跨会话的旁路长期存储（项目笔记、抽出的事实）。不是压缩，也不是会话日志。
_Avoid_: 压缩, 会话

**会话**:
一次可跨进程找回的对话。不是压缩，也不是记忆。
_Avoid_: thread, transcript, rollout, 记忆

**会话日志**:
会话的落盘真相：可恢复的消息序列，不是运行时堆快照。可含压缩事件；原文仍在。
_Avoid_: 记忆, 压缩, transcript, rollout

**输入历史**:
当前进程内对先前一次提交文本的召回。不是会话日志，也不另做跨进程历史文件。
_Avoid_: 会话, 会话日志, history 文件

**切点**:
一次压缩在原文消息列表上的分界：此前压成摘要，此后尾部原文保留。不得落在一对 tool call / tool result 中间。不是摘要算法，也不是 token 数字。
_Avoid_: 把切点当成落盘格式, 把切点当成记忆

**压缩事件**:
会话日志里的一条记录：某次压缩的摘要与切点。不是 `compact` 槽的写盘，也不替代原文。
_Avoid_: 记忆, summarization, 把 compact 槽当成落盘

**可嵌入 Runtime**:
作为库被其他应用调用的长期形态。本规格只为它留接缝，不实现。

**多智能体平台**:
多智能体编排与工作流的长期形态。本规格只为它留阶段边界与接缝，不设计产品。
