# 系统提示何时重建

Type: grilling
Label: wayfinder:grilling
Triage: ready-for-human
Status:
Blocked by: 02, 03

## Question

一根系统提示在进程里何时重新拼装？

Skill 清单已是现扫；配置 JSON 是启动读一次。[Atom 系统提示文件的搜索根与叠法](./02-atom-prompt-file-search.md) 已锁：系统提示文件与 `AGENTS.md` 启动读一次，改这些 markdown 要重启。[默认正文骨架](./03-default-prompt-skeleton.md) 已锁：**无日期段**，本票不必再问跨天。本票只裁定 Skill / cwd / 工具名单等是否另触发重建，以及重建是否写进已有循环实例。

至少裁定：

- 启动装配一次之后，哪些事件触发重建：`/new`、工具 allow/deny 未变、Skill 目录变化、`/skill:`
- 重建是否写进已有循环实例（set）还是只能重启宿主
- 不重建时，过期的 cwd / Skill 清单可以错到什么程度
- 明确没有：监视文件、不重启热加载 `SYSTEM.md`（除非本票改口）；无日期段，跨天不是重建由头

不写代码。
