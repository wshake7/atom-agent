import { createPluginHost } from "atom-kernel";
import { expect, test } from "vite-plus/test";
import { LOOP_EVENTS, plugin } from "../src/index.ts";
import type { Llm, LlmChunk, Loop, Message, Tool, Tools } from "../src/index.ts";

function fakeLlm(
  replies: ((messages: readonly Message[]) => LlmChunk[] | Promise<LlmChunk[]>)[],
): Llm & { readonly received: readonly (readonly Message[])[] } {
  const received: Message[][] = [];
  return {
    get received() {
      return received;
    },
    async *stream({ messages, signal }) {
      const index = received.length;
      received.push(messages.map((message) => message));
      const reply = replies[index];
      if (!reply) {
        throw new Error(`假 llm 没有第 ${index} 次回复`);
      }
      const chunks = await reply(messages);
      for (const chunk of chunks) {
        signal?.throwIfAborted();
        yield chunk;
      }
    },
  };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function fakeTools(tools: readonly Tool[]): Tools {
  return {
    list: () => tools,
  };
}

async function loadRound(llm: Llm, tools: Tools) {
  const host = createPluginHost();
  await host.load({
    id: "fake-llm",
    apply(ctx) {
      ctx.provide("llm", llm);
    },
  });
  await host.load({
    id: "fake-tools",
    apply(ctx) {
      ctx.provide("tools", tools);
    },
  });
  await host.load(plugin);
  const loop = host.context.get("loop") as Loop | undefined;
  if (!loop) {
    throw new Error("loop 槽为空");
  }
  return { host, loop };
}

test("只装循环、不装 llm 与 tools 时 loop 槽仍空", async () => {
  const host = createPluginHost();
  await host.load(plugin);
  expect(host.context.get("loop")).toBeUndefined();
  expect(host.context.get("llm")).toBeUndefined();
});

test("宿主只装默认循环与假 llm、假工具即可完成一轮纯文本回合", async () => {
  const llm = fakeLlm([
    () => [
      { type: "text", text: "你" },
      { type: "text", text: "好" },
    ],
  ]);
  const { host, loop } = await loadRound(llm, fakeTools([]));
  const topics: string[] = [];
  const deltas: unknown[] = [];
  host.events.subscribe(LOOP_EVENTS.turnStart, () => {
    topics.push("start");
  });
  host.events.subscribe(LOOP_EVENTS.turnEnd, () => {
    topics.push("end");
  });
  host.events.subscribe(LOOP_EVENTS.assistantDelta, (payload) => {
    topics.push("delta");
    deltas.push(payload);
  });

  await loop.prompt("嗨");

  expect(topics).toEqual(["start", "delta", "delta", "end"]);
  expect(deltas).toEqual([
    { type: "text", text: "你" },
    { type: "text", text: "好" },
  ]);
  expect(loop.messages).toEqual([
    { role: "user", content: "嗨" },
    { role: "assistant", content: [{ type: "text", text: "你好" }] },
  ]);
  expect(
    loop.messages.every((message) => ["user", "assistant", "toolResult"].includes(message.role)),
  ).toBe(true);
});

test("工具分发读 tools 槽并写入 toolResult，推理块会回放到下一次模型调用", async () => {
  const llm = fakeLlm([
    () => [
      { type: "thinking", text: "先" },
      { type: "thinking", text: "想" },
      {
        type: "toolCall",
        id: "call-1",
        name: "echo",
        arguments: { text: "hi" },
      },
    ],
    () => [{ type: "text", text: "好了" }],
  ]);
  const seen: unknown[] = [];
  const { host, loop } = await loadRound(
    llm,
    fakeTools([
      {
        name: "echo",
        async execute(args) {
          seen.push(args);
          return "echoed";
        },
      },
    ]),
  );
  const topics: string[] = [];
  host.events.subscribe(LOOP_EVENTS.turnStart, () => {
    topics.push("start");
  });
  host.events.subscribe(LOOP_EVENTS.turnEnd, () => {
    topics.push("end");
  });
  host.events.subscribe(LOOP_EVENTS.toolStart, (payload) => {
    topics.push(`tool-start:${(payload as { name: string }).name}`);
  });
  host.events.subscribe(LOOP_EVENTS.toolEnd, (payload) => {
    topics.push(`tool-end:${(payload as { name: string }).name}`);
  });

  await loop.prompt("用工具");

  expect(seen).toEqual([{ text: "hi" }]);
  expect(topics).toEqual(["start", "tool-start:echo", "tool-end:echo", "end", "start", "end"]);
  expect(loop.messages.map((message) => message.role)).toEqual([
    "user",
    "assistant",
    "toolResult",
    "assistant",
  ]);
  expect(loop.messages[1]).toEqual({
    role: "assistant",
    content: [
      { type: "thinking", text: "先想" },
      { type: "toolCall", id: "call-1", name: "echo", arguments: { text: "hi" } },
    ],
  });
  expect(loop.messages[2]).toEqual({
    role: "toolResult",
    toolCallId: "call-1",
    name: "echo",
    content: "echoed",
    isError: false,
  });
  expect(llm.received).toHaveLength(2);
  expect(llm.received[1]).toEqual(loop.messages.slice(0, 3));
  expect(llm.received[1]?.[1]).toMatchObject({
    role: "assistant",
    content: [
      { type: "thinking", text: "先想" },
      { type: "toolCall", id: "call-1", name: "echo", arguments: { text: "hi" } },
    ],
  });
});

test("未登记的工具会校验失败并写成错误 toolResult，不执行其它副作用", async () => {
  let executed = 0;
  const llm = fakeLlm([
    () => [{ type: "toolCall", id: "missing", name: "nope", arguments: {} }],
    () => [{ type: "text", text: "跳过" }],
  ]);
  const { loop } = await loadRound(
    llm,
    fakeTools([
      {
        name: "echo",
        async execute() {
          executed += 1;
          return "no";
        },
      },
    ]),
  );

  await loop.prompt("不存在的工具");

  expect(executed).toBe(0);
  expect(loop.messages[2]).toEqual({
    role: "toolResult",
    toolCallId: "missing",
    name: "nope",
    content: "未知工具: nope",
    isError: true,
  });
});

test("同一批多个工具调用按串行执行", async () => {
  let current = 0;
  let maxConcurrent = 0;
  const order: string[] = [];
  const tool = (name: string): Tool => ({
    name,
    async execute() {
      current += 1;
      maxConcurrent = Math.max(maxConcurrent, current);
      order.push(`${name}-start`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(`${name}-end`);
      current -= 1;
      return name;
    },
  });
  const llm = fakeLlm([
    () => [
      { type: "toolCall", id: "a", name: "alpha", arguments: {} },
      { type: "toolCall", id: "b", name: "beta", arguments: {} },
    ],
    () => [{ type: "text", text: "done" }],
  ]);
  const { loop } = await loadRound(llm, fakeTools([tool("alpha"), tool("beta")]));

  await loop.prompt("两个工具");

  expect(maxConcurrent).toBe(1);
  expect(order).toEqual(["alpha-start", "alpha-end", "beta-start", "beta-end"]);
  expect(
    loop.messages.filter((message) => message.role === "toolResult").map((message) => message.name),
  ).toEqual(["alpha", "beta"]);
});

test("Abort 中止进行中的工具，后续工具不再执行", async () => {
  const firstStarted = deferred();
  const order: string[] = [];
  const llm = fakeLlm([
    () => [
      { type: "toolCall", id: "a", name: "alpha", arguments: {} },
      { type: "toolCall", id: "b", name: "beta", arguments: {} },
    ],
    () => [{ type: "text", text: "不该到这" }],
  ]);
  const { host, loop } = await loadRound(
    llm,
    fakeTools([
      {
        name: "alpha",
        async execute(_args, signal) {
          order.push("alpha");
          firstStarted.resolve();
          await new Promise<void>((_resolve, reject) => {
            const onAbort = () => {
              reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
            };
            if (signal?.aborted) {
              onAbort();
              return;
            }
            signal?.addEventListener("abort", onAbort, { once: true });
          });
          return "alpha";
        },
      },
      {
        name: "beta",
        async execute() {
          order.push("beta");
          return "beta";
        },
      },
    ]),
  );
  const toolEnds: unknown[] = [];
  host.events.subscribe(LOOP_EVENTS.toolEnd, (payload) => {
    toolEnds.push(payload);
  });
  const controller = new AbortController();
  const pending = loop.prompt("停工具", { signal: controller.signal });
  await firstStarted.promise;
  controller.abort();
  await expect(pending).rejects.toSatisfy((error) => error instanceof Error);

  expect(order).toEqual(["alpha"]);
  expect(toolEnds).toEqual([
    { id: "a", name: "alpha", content: expect.any(String), isError: true },
  ]);
  expect(loop.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
});

test("Abort 中止进行中的模型流，不把半截助手写进消息列表", async () => {
  const gate = deferred();
  const llm: Llm = {
    async *stream({ signal }) {
      yield { type: "text", text: "半" };
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          gate.resolve();
          reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    },
  };
  const { host, loop } = await loadRound(llm, fakeTools([]));
  const topics: string[] = [];
  const firstDelta = deferred();
  host.events.subscribe(LOOP_EVENTS.turnStart, () => {
    topics.push("start");
  });
  host.events.subscribe(LOOP_EVENTS.turnEnd, () => {
    topics.push("end");
  });
  host.events.subscribe(LOOP_EVENTS.assistantDelta, () => {
    topics.push("delta");
    firstDelta.resolve();
  });
  const controller = new AbortController();

  const pending = loop.prompt("停", { signal: controller.signal });
  await firstDelta.promise;
  controller.abort();
  await expect(pending).rejects.toSatisfy((error) => error instanceof Error);
  await gate.promise;

  expect(topics).toEqual(["start", "delta", "end"]);
  expect(loop.messages).toEqual([{ role: "user", content: "停" }]);
});
