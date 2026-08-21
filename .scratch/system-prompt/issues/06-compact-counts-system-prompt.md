# 压缩阈值是否计入系统提示

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status:
Blocked by:

## Question

`compact` 槽只变换三角消息列表。系统提示每轮另附。阈值与溢出恢复要不要把系统提示的长度算进去？

至少裁定：

- 默认压缩提供方的阈值只看消息，还是消息 + 系统提示
- 溢出恢复仍只 compact 消息（系统提示无法切）时，超长系统提示的失败面是什么
- 本阶段是否锁 token 数字（日常 CLI 规格明确不锁算法与数字——本票不要偷偷锁死）

不写代码。不改 `compact` 槽语义，除非本票证明非改不可（若非改不可，应考虑标出范围外并缩小第一刀）。
