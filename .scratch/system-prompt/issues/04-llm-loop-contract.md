# LlmRequest 与循环如何带上系统提示

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status:
Blocked by:

## Question

可选系统提示如何从装配进到每一轮 `llm.stream`，而不增加第四种 role、不加官方槽？

图表前已锁：`LlmRequest` 增加可选 `systemPrompt`；兼容库只在线上译成 `role: "system"`；`Loop.prompt` 仍只吃用户文本；会话日志不存这根字符串。

至少裁定：

- `Loop` / `createLoop` 是否持有这根字符串（工厂参数 vs 每次从 Context 未点名键读取）；静态 `atom-loop` 插件如何接到 CLI 装配
- 缺省（undefined / 空串）时兼容库是否省略 system 消息，以便假 llm 与旧测试仍绿
- `compact` 仍只看见三角消息列表，系统提示是否绕过压缩视图
- 这是对 `llm` 槽的加法、不改语义：要不要一篇 ADR 写明「可选字段不是改槽」
- 验收：假 llm 必须能断言请求带上了装配给出的字符串

不写代码。不锁文件搜索与默认正文。
