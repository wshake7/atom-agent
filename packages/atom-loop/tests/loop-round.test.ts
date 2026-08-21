import { createPluginHost } from "atom-kernel";
import { expect, test } from "vite-plus/test";
import { ContextOverflowError, LOOP_EVENTS, plugin } from "../src/index.ts";
import type {
  Compact,
  CompactReason,
  CompactResult,
  Llm,
  LlmChunk,
  Loop,
  Message,
  Tool,
  Tools,
} from "../src/index.ts";

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

async function loadRound(
  llm: Llm,
  tools: Tools,
  extras?: {
    session?: {
      messages: Message[];
      append(message: Message): void;
      appendCompaction?(event: { summary: string; cutIndex: number }): void;
    };
    compact?: Compact;
  },
) {
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
  if (extras?.session) {
    const session = extras.session;
    await host.load({
      id: "fake-session",
      apply(ctx) {
        ctx.provide("session", {
          current: {
            id: "s1",
            cwd: "/tmp",
            get messages() {
              return session.messages;
            },
            append: (message: Message) => session.append(message),
            appendCompaction: session.appendCompaction
              ? (event: { summary: string; cutIndex: number }) => session.appendCompaction?.(event)
              : undefined,
          },
        });
      },
    });
  }
  if (extras?.compact) {
    const compact = extras.compact;
    await host.load({
      id: "fake-compact",
      apply(ctx) {
        ctx.provide("compact", compact);
      },
    });
  }
  await host.load(plugin);
  const loop = host.context.get("loop") as Loop | undefined;
  if (!loop) {
    throw new Error("loop 槽为空");
  }
  return { host, loop };
}

function recordingCompact(
  handler: (messages: readonly Message[], reason: CompactReason) => CompactResult,
): Compact & {
  readonly calls: readonly { messages: readonly Message[]; reason: CompactReason }[];
} {
  const calls: { messages: readonly Message[]; reason: CompactReason }[] = [];
  return {
    get calls() {
      return calls;
    },
    compact(messages, reason) {
      calls.push({ messages: messages.map((message) => message), reason });
      return handler(messages, reason);
    },
  };
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

test("有 session 提供方则追加终态消息；没有则纯内存", async () => {
  const stored: Message[] = [];
  const withSession = await loadRound(
    fakeLlm([() => [{ type: "text", text: "好" }]]),
    fakeTools([]),
    {
      session: {
        messages: stored,
        append(message) {
          stored.push(message);
        },
      },
    },
  );
  await withSession.loop.prompt("嗨");
  expect(stored).toEqual([
    { role: "user", content: "嗨" },
    { role: "assistant", content: [{ type: "text", text: "好" }] },
  ]);
  expect(withSession.loop.messages).toEqual(stored);

  const without = await loadRound(fakeLlm([() => [{ type: "text", text: "内存" }]]), fakeTools([]));
  await without.loop.prompt("嗨");
  expect(without.loop.messages).toEqual([
    { role: "user", content: "嗨" },
    { role: "assistant", content: [{ type: "text", text: "内存" }] },
  ]);
  expect(without.host.context.get("session")).toBeUndefined();
});

test("恢复时工厂吃初始原文列表，Loop 仍是 messages + prompt", async () => {
  const initial: Message[] = [
    { role: "user", content: "上次" },
    { role: "assistant", content: [{ type: "text", text: "记着" }] },
  ];
  const stored = [...initial];
  const llm = fakeLlm([() => [{ type: "text", text: "继续" }]]);
  const { loop } = await loadRound(llm, fakeTools([]), {
    session: {
      messages: stored,
      append(message) {
        stored.push(message);
      },
    },
  });
  expect(loop).toEqual(expect.objectContaining({ messages: initial }));
  expect(Object.keys(loop).sort()).toEqual(["messages", "prompt"].sort());
  await loop.prompt("下一句");
  expect(llm.received[0]).toEqual([...initial, { role: "user", content: "下一句" }]);
  expect(loop.messages).toEqual([
    ...initial,
    { role: "user", content: "下一句" },
    { role: "assistant", content: [{ type: "text", text: "继续" }] },
  ]);
});

test("Abort 半截助手不落盘，已写入的 user 终态会追加", async () => {
  const stored: Message[] = [];
  const firstDelta = deferred();
  const llm: Llm = {
    async *stream({ signal }) {
      yield { type: "text", text: "半" };
      firstDelta.resolve();
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
    },
  };
  const { loop } = await loadRound(llm, fakeTools([]), {
    session: {
      messages: stored,
      append(message) {
        stored.push(message);
      },
    },
  });
  const controller = new AbortController();
  const pending = loop.prompt("停", { signal: controller.signal });
  await firstDelta.promise;
  controller.abort();
  await expect(pending).rejects.toSatisfy((error) => error instanceof Error);
  expect(stored).toEqual([{ role: "user", content: "停" }]);
  expect(loop.messages).toEqual(stored);
});

test("没有 compact 提供方则恒等；有提供方时阈值可恒等且不改原文列表", async () => {
  const identity = recordingCompact((messages) => ({ messages, shortened: false }));
  const llm = fakeLlm([() => [{ type: "text", text: "答" }]]);
  const { loop } = await loadRound(llm, fakeTools([]), { compact: identity });
  await loop.prompt("嗨");
  expect(identity.calls.map((call) => call.reason)).toEqual(["threshold"]);
  expect(llm.received[0]).toEqual([{ role: "user", content: "嗨" }]);
  expect(loop.messages).toEqual([
    { role: "user", content: "嗨" },
    { role: "assistant", content: [{ type: "text", text: "答" }] },
  ]);

  const none = fakeLlm([() => [{ type: "text", text: "原样" }]]);
  const without = await loadRound(none, fakeTools([]));
  await without.loop.prompt("嗨");
  expect(none.received[0]).toEqual([{ role: "user", content: "嗨" }]);
  expect(without.host.context.get("compact")).toBeUndefined();
});

test("超预算缩短后 llm 看见压缩视图，原文内存列表仍在；下次仍交原文", async () => {
  const history: Message[] = [
    { role: "user", content: "很久以前".repeat(20) },
    { role: "assistant", content: [{ type: "text", text: "那时" }] },
    { role: "user", content: "昨天" },
    { role: "assistant", content: [{ type: "text", text: "记得" }] },
  ];
  const compact = recordingCompact((messages) => {
    if (messages.length < 5) {
      return { messages, shortened: false };
    }
    return {
      messages: [{ role: "user", content: "摘要" }, ...messages.slice(2)],
      shortened: true,
      summary: "摘要",
      cutIndex: 2,
    };
  });
  const stored: Message[] = [...history];
  const events: { summary: string; cutIndex: number }[] = [];
  const llm = fakeLlm([
    () => [{ type: "text", text: "继续" }],
    () => [{ type: "text", text: "再来" }],
  ]);
  const topics: string[] = [];
  const { host, loop } = await loadRound(llm, fakeTools([]), {
    compact,
    session: {
      messages: stored,
      append(message) {
        stored.push(message);
      },
      appendCompaction(event) {
        events.push(event);
      },
    },
  });
  host.events.subscribe("loop/compact", () => {
    topics.push("compact");
  });
  host.events.subscribe(LOOP_EVENTS.turnStart, () => {
    topics.push("start");
  });
  host.events.subscribe(LOOP_EVENTS.turnEnd, () => {
    topics.push("end");
  });

  await loop.prompt("下一句");

  expect(compact.calls[0]?.reason).toBe("threshold");
  expect(llm.received[0]).toEqual([
    { role: "user", content: "摘要" },
    { role: "user", content: "昨天" },
    { role: "assistant", content: [{ type: "text", text: "记得" }] },
    { role: "user", content: "下一句" },
  ]);
  expect(loop.messages).toEqual([
    ...history,
    { role: "user", content: "下一句" },
    { role: "assistant", content: [{ type: "text", text: "继续" }] },
  ]);
  expect(events).toEqual([{ summary: "摘要", cutIndex: 2 }]);
  expect(topics).toEqual(["start", "end"]);

  await loop.prompt("又一句");
  expect(compact.calls[1]?.messages).toEqual(loop.messages.slice(0, -1));
  expect(compact.calls[1]?.reason).toBe("threshold");
});

test("溢出则 reason=overflow 再打至多一次；不能更短则把溢出交给用户", async () => {
  const history: Message[] = [
    { role: "user", content: "早先".repeat(30) },
    { role: "assistant", content: [{ type: "text", text: "旧" }] },
    { role: "user", content: "现在" },
  ];
  const compact = recordingCompact((messages, reason) => {
    if (reason === "threshold") {
      return { messages, shortened: false };
    }
    return {
      messages: [{ role: "user", content: "摘要" }, messages.at(-1)!],
      shortened: true,
      summary: "摘要",
      cutIndex: messages.length - 1,
    };
  });
  const llm = fakeLlm([
    () => {
      throw new ContextOverflowError();
    },
    () => [{ type: "text", text: "压完了" }],
  ]);
  const events: { summary: string; cutIndex: number }[] = [];
  const { loop } = await loadRound(llm, fakeTools([]), {
    compact,
    session: {
      messages: [...history],
      append() {},
      appendCompaction(event) {
        events.push(event);
      },
    },
  });
  await loop.prompt("问");
  expect(compact.calls.map((call) => call.reason)).toEqual(["threshold", "overflow"]);
  expect(events).toEqual([{ summary: "摘要", cutIndex: history.length }]);
  expect(llm.received).toHaveLength(2);
  expect(llm.received[1]).toEqual([
    { role: "user", content: "摘要" },
    { role: "user", content: "问" },
  ]);
  expect(loop.messages.at(-1)).toEqual({
    role: "assistant",
    content: [{ type: "text", text: "压完了" }],
  });

  const stuck = recordingCompact((messages) => ({
    messages,
    shortened: true,
    summary: "假",
    cutIndex: 0,
  }));
  const failing = fakeLlm([
    () => {
      throw new ContextOverflowError();
    },
    () => [{ type: "text", text: "不该打" }],
  ]);
  const second = await loadRound(failing, fakeTools([]), { compact: stuck });
  await expect(second.loop.prompt("问")).rejects.toSatisfy(
    (error) => error instanceof ContextOverflowError,
  );
  expect(failing.received).toHaveLength(1);
  expect(stuck.calls.map((call) => call.reason)).toEqual(["threshold", "overflow"]);

  const none = fakeLlm([
    () => {
      throw new ContextOverflowError();
    },
    () => [{ type: "text", text: "不该打" }],
  ]);
  const without = await loadRound(none, fakeTools([]));
  await expect(without.loop.prompt("问")).rejects.toSatisfy(
    (error) => error instanceof ContextOverflowError,
  );
  expect(none.received).toHaveLength(1);
});

test("溢出恢复最多再打一枪，第二次溢出不再 compact", async () => {
  const compact = recordingCompact((messages, reason) => {
    if (reason === "overflow") {
      return {
        messages: [{ role: "user", content: "摘要" }, messages.at(-1)!],
        shortened: true,
        summary: "摘要",
        cutIndex: messages.length - 1,
      };
    }
    return { messages, shortened: false };
  });
  const llm = fakeLlm([
    () => {
      throw new ContextOverflowError();
    },
    () => {
      throw new ContextOverflowError();
    },
  ]);
  const { loop } = await loadRound(llm, fakeTools([]), {
    compact,
    session: {
      messages: [
        { role: "user", content: "早先".repeat(40) },
        { role: "assistant", content: [{ type: "text", text: "旧" }] },
      ],
      append() {},
    },
  });
  await expect(loop.prompt("问")).rejects.toSatisfy(
    (error) => error instanceof ContextOverflowError,
  );
  expect(compact.calls.map((call) => call.reason)).toEqual(["threshold", "overflow"]);
  expect(llm.received).toHaveLength(2);
});
