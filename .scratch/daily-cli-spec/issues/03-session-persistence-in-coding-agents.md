# 跨进程会话常见合同

Type: research
Label: wayfinder:research
Triage: ready-for-agent
Status: resolved
Blocked by:

## Question

主流 coding agent **重启进程后会话怎么还在**？落盘合同是什么？

必须从上游源码与第一方文档取证。至少对照 pi、Claude Code、Codex CLI（有则写，无则标明）。

每家回答：

1. 存什么（消息、工具结果、推理块、文件草稿、元数据）
2. 存在哪（路径约定、JSONL / sqlite / 其他）
3. 怎么恢复（启动选会话、默认最近一次、按工作目录）
4. 和压缩 / 记忆是不是同一份存储
5. 明确不存什么

产出带引用的调研笔记，供后续「跨进程会话合同」对照。不在本票决定我们的存储引擎或是否加 `session` 槽。

## Answer

三家都是 **本地 JSONL 对话日志 + 按 cwd/id 找回**，不是运行时堆快照。压缩写进同一份日志（改的是下次送给模型的视图）；跨会话记忆是旁路 markdown/DB。Claude JSONL schema 官方不承诺稳定；pi 现行 CLI 是 v3 JSONL 树（harness sqlite 未接上）；Codex 是日期分目录 rollout + 家目录 sqlite 索引/记忆。

笔记：`.scratch/daily-cli-spec/research/session-persistence-in-coding-agents.md`
