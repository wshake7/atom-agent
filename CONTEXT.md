# Atom Agent

自研极简、高扩展、可插拔的 agent 系统：pi 的极简、DeepSeek Harness 的一切皆插件、AgentScope 2.0 的企业级能力（靠加槽长出，不预埋进核）。不 fork 三家。v0 先打赢自己用的 coding CLI；可嵌入 Runtime 与多智能体是后续阶段，不是项目终点。

## Language

**内核**:
进程内的插件宿主，不允许用插件换掉。闭合集只有四件：服务注册、依赖注入、生命周期（加载 / 卸载 / 可逆 effect）、事件总线原语（发布 / 订阅）。不是回合循环；不含业务事件名、插件发现与组成。
_Avoid_: Runtime, Engine, Framework, 回合循环, agentLoop, boot

**循环插件**:
占据 `loop` 槽、实现一次「模型 ↔ 工具」回合的插件，可整颗替换。消费 `llm` 与 `tools`，不内置提供商。删掉则无法完成回合的东西，属于这颗插件。
_Avoid_: 内核

**推理块**:
`assistant` 消息上的思考内容（thinking / reasoning），不是第四种 role。默认循环合同必须保留并可在后续模型调用中回放。
_Avoid_: thinking role

**插件**:
同构的可替换模块：实现注册 / 注入 / 生命周期，向 Context 贡献服务。种类不是类型系统，内置分发仍是插件。
_Avoid_: Extension, Addon, Skill, PluginType

**槽**:
Context 上具名的服务位置。插件可贡献未点名的键。官方槽由契约点名，语义不可改，新能力只加新槽。
v0 官方槽：`loop`（循环）、`tools`（工具表）、`llm`（模型端口）。
_Avoid_: 插件种类, PluginType

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

**可嵌入 Runtime**:
作为库被其他应用调用的长期形态。本规格只为它留接缝，不实现。

**多智能体平台**:
多智能体编排与工作流的长期形态。本规格只为它留阶段边界与接缝，不设计产品。
