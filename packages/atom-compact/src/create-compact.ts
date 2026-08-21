import type { Compact, CompactReason, CompactResult, Message } from "./types.ts";

/** 仅默认提供方内部使用；合同不锁数字。 */
const THRESHOLD_CHARS = 8192;

export function createCompact(): Compact {
  return {
    compact(messages, reason) {
      return compactMessages(messages, reason);
    },
  };
}

function compactMessages(messages: readonly Message[], reason: CompactReason): CompactResult {
  const identity: CompactResult = { messages, shortened: false };
  if (messages.length < 2) {
    return identity;
  }
  if (reason === "threshold" && sizeOf(messages) <= THRESHOLD_CHARS) {
    return identity;
  }
  const cutIndex = pickCutIndex(messages, reason);
  if (cutIndex <= 0) {
    return identity;
  }
  const summary = `已压缩 ${cutIndex} 条先前消息`;
  const view: Message[] = [{ role: "user", content: summary }, ...messages.slice(cutIndex)];
  if (sizeOf(view) >= sizeOf(messages)) {
    return identity;
  }
  return { messages: view, shortened: true, summary, cutIndex };
}

function pickCutIndex(messages: readonly Message[], reason: CompactReason): number {
  const keep = reason === "threshold" ? Math.max(2, Math.ceil(messages.length / 2)) : 1;
  const desired = Math.max(1, messages.length - keep);
  return snapCut(messages, desired);
}

function snapCut(messages: readonly Message[], desired: number): number {
  let cut = Math.min(Math.max(desired, 1), messages.length - 1);
  while (cut > 0 && splitsToolPair(messages, cut)) {
    cut--;
  }
  if (cut > 0 && !splitsToolPair(messages, cut)) {
    return cut;
  }
  cut = Math.min(Math.max(desired, 1), messages.length - 1);
  while (cut < messages.length && splitsToolPair(messages, cut)) {
    cut++;
  }
  if (cut >= messages.length || splitsToolPair(messages, cut)) {
    return 0;
  }
  return cut;
}

function splitsToolPair(messages: readonly Message[], cutIndex: number): boolean {
  if (cutIndex <= 0 || cutIndex >= messages.length) {
    return false;
  }
  const firstKept = messages[cutIndex];
  if (firstKept?.role === "toolResult") {
    return true;
  }
  const lastDropped = messages[cutIndex - 1];
  if (lastDropped?.role !== "assistant") {
    return false;
  }
  const ids = new Set(
    lastDropped.content.filter((block) => block.type === "toolCall").map((block) => block.id),
  );
  if (ids.size === 0) {
    return false;
  }
  return messages
    .slice(cutIndex)
    .some((message) => message.role === "toolResult" && ids.has(message.toolCallId));
}

function sizeOf(messages: readonly Message[]): number {
  return JSON.stringify(messages).length;
}
