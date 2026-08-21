import { createPluginHost } from "atom-kernel";
import { expect, test } from "vite-plus/test";
import { plugin } from "../src/index.ts";
import type { Compact, CompactResult, Message } from "../src/index.ts";

async function loadCompact() {
  const host = createPluginHost();
  await host.load(plugin);
  const compact = host.context.get("compact") as Compact | undefined;
  if (!compact) {
    throw new Error("compact 槽为空");
  }
  return { host, compact };
}

function snapshot(messages: readonly Message[]): Message[] {
  return JSON.parse(JSON.stringify(messages)) as Message[];
}

function sizeOf(messages: readonly Message[]): number {
  return JSON.stringify(messages).length;
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

function assertShortened(result: CompactResult, original: readonly Message[]) {
  expect(result.shortened).toBe(true);
  expect(result.summary).toEqual(expect.any(String));
  expect(result.cutIndex).toEqual(expect.any(Number));
  const cut = result.cutIndex ?? 0;
  expect(splitsToolPair(original, cut)).toBe(false);
  expect(sizeOf(result.messages)).toBeLessThan(sizeOf(original));
  const tail = original.slice(cut);
  for (const message of tail) {
    expect(result.messages).toContainEqual(message);
  }
  for (const message of original.slice(0, cut)) {
    expect(result.messages).not.toContainEqual(message);
  }
}

test("宿主装上 compact 后槽可取，且不改原消息列表", async () => {
  const { compact } = await loadCompact();
  const messages: Message[] = [
    { role: "user", content: "你好" },
    { role: "assistant", content: [{ type: "text", text: "好" }] },
  ];
  const before = snapshot(messages);
  const result = await compact.compact(messages, "threshold");
  expect(messages).toEqual(before);
  expect(result.shortened).toBe(false);
  expect(result.messages).toEqual(before);
});

test("阈值下短对话恒等，超预算才缩短", async () => {
  const { compact } = await loadCompact();
  const short: Message[] = [
    { role: "user", content: "短" },
    { role: "assistant", content: [{ type: "text", text: "答" }] },
  ];
  expect((await compact.compact(short, "threshold")).shortened).toBe(false);

  const long: Message[] = [];
  for (let i = 0; i < 40; i++) {
    long.push({ role: "user", content: `u${i}:${"x".repeat(400)}` });
    long.push({
      role: "assistant",
      content: [{ type: "text", text: `a${i}:${"y".repeat(400)}` }],
    });
  }
  const before = snapshot(long);
  const result = await compact.compact(long, "threshold");
  expect(long).toEqual(before);
  assertShortened(result, long);
});

test("overflow 必须比恒等更短；已经只剩无法再切时不缩短", async () => {
  const { compact } = await loadCompact();
  const bulky: Message[] = [
    { role: "user", content: "早先".repeat(200) },
    { role: "assistant", content: [{ type: "text", text: "中间".repeat(200) }] },
    { role: "user", content: "现在" },
  ];
  const overflow = await compact.compact(bulky, "overflow");
  assertShortened(overflow, bulky);

  const lone: Message[] = [{ role: "user", content: "只有一条".repeat(300) }];
  const stuck = await compact.compact(lone, "overflow");
  expect(stuck.shortened).toBe(false);
  expect(stuck.messages).toEqual(lone);
  expect(sizeOf(stuck.messages)).toBe(sizeOf(lone));
});

test("缩短时切点不落在 tool call 与 tool result 中间", async () => {
  const { compact } = await loadCompact();
  const messages: Message[] = [
    { role: "user", content: "先做".repeat(300) },
    {
      role: "assistant",
      content: [
        { type: "thinking", text: "要想" },
        { type: "toolCall", id: "c1", name: "echo", arguments: { text: "hi" } },
      ],
    },
    {
      role: "toolResult",
      toolCallId: "c1",
      name: "echo",
      content: "hi",
      isError: false,
    },
    { role: "user", content: "然后".repeat(300) },
    { role: "assistant", content: [{ type: "text", text: "好了" }] },
  ];
  const result = await compact.compact(messages, "overflow");
  assertShortened(result, messages);
});

test("manual 预留：低于阈值也可以缩短", async () => {
  const { compact } = await loadCompact();
  const messages: Message[] = [
    { role: "user", content: "昨天的问题".repeat(40) },
    { role: "assistant", content: [{ type: "text", text: "昨天的答复" }] },
    { role: "user", content: "继续" },
  ];
  const threshold = await compact.compact(messages, "threshold");
  expect(threshold.shortened).toBe(false);
  const manual = await compact.compact(messages, "manual");
  assertShortened(manual, messages);
});
