import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createPluginHost } from "atom-kernel";
import { LOOP_EVENTS, plugin as loopPlugin } from "../../atom-loop/src/index.ts";
import type { Llm, Loop } from "../../atom-loop/src/index.ts";
import { expect, test } from "vite-plus/test";
import { createLlmPlugin, plugin } from "../src/index.ts";

const liveReady = Boolean(
  process.env.ATOM_LLM_API_KEY && process.env.ATOM_LLM_BASE_URL && process.env.ATOM_LLM_MODEL,
);

async function loadLlm(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
}): Promise<{ host: ReturnType<typeof createPluginHost>; llm: Llm }> {
  const host = createPluginHost();
  await host.load(createLlmPlugin(options));
  const llm = host.context.get("llm") as Llm | undefined;
  if (!llm) {
    throw new Error("llm 槽为空");
  }
  return { host, llm };
}

async function loadLoop(host: ReturnType<typeof createPluginHost>): Promise<Loop> {
  await host.load({
    id: "fake-tools",
    apply(ctx) {
      ctx.provide("tools", { list: () => [] });
    },
  });
  await host.load(loopPlugin);
  const loop = host.context.get("loop") as Loop | undefined;
  if (!loop) {
    throw new Error("loop 槽为空");
  }
  return loop;
}

async function drain(req: NodeJS.ReadableStream) {
  for await (const _chunk of req) {
    /* 只为放行请求体 */
  }
}

async function serveChatCompletions(write: (res: NodeJS.WritableStream) => Promise<void> | void) {
  const server = createServer((req, res) => {
    void (async () => {
      await drain(req);
      if (req.method !== "POST" || req.url !== "/chat/completions") {
        res.statusCode = 404;
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      await write(res);
      res.end();
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}

function sseDelta(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
}

test("经宿主装上默认 llm 插件后能取到可 stream 的 llm 槽", async () => {
  const host = createPluginHost();
  await host.load(plugin);
  const llm = host.context.get("llm") as { stream?: unknown } | undefined;
  expect(typeof llm?.stream).toBe("function");
});

test("默认循环外也能从 llm 槽流式读到文本块", async () => {
  const server = await serveChatCompletions((res) => {
    res.write(sseDelta("你"));
    res.write(sseDelta("好"));
    res.write("data: [DONE]\n\n");
  });
  try {
    const { llm } = await loadLlm({
      apiKey: "test-key",
      baseUrl: server.origin,
      model: "dummy",
    });
    const chunks: unknown[] = [];
    for await (const chunk of llm.stream({
      messages: [{ role: "user", content: "嗨" }],
      tools: [],
    })) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([
      { type: "text", text: "你" },
      { type: "text", text: "好" },
    ]);
  } finally {
    await server.close();
  }
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

test("Abort 能中止进行中的 llm 调用", async () => {
  const firstWritten = deferred();
  const release = deferred();
  const server = await serveChatCompletions(async (res) => {
    res.write(sseDelta("半"));
    firstWritten.resolve();
    await release.promise;
    res.write(sseDelta("截"));
    res.write("data: [DONE]\n\n");
  });
  try {
    const { llm } = await loadLlm({
      apiKey: "test-key",
      baseUrl: server.origin,
      model: "dummy",
    });
    const controller = new AbortController();
    const chunks: unknown[] = [];
    const firstChunk = deferred();
    const pending = (async () => {
      for await (const chunk of llm.stream({
        messages: [{ role: "user", content: "停" }],
        tools: [],
        signal: controller.signal,
      })) {
        chunks.push(chunk);
        firstChunk.resolve();
      }
    })();
    await firstWritten.promise;
    await firstChunk.promise;
    controller.abort();
    await expect(pending).rejects.toSatisfy((error) => error instanceof Error);
    expect(chunks).toEqual([{ type: "text", text: "半" }]);
  } finally {
    release.resolve();
    await server.close();
  }
});

test("默认循环消费 llm 槽上的适配器即可完成一轮流式回合", async () => {
  const server = await serveChatCompletions((res) => {
    res.write(sseDelta("你"));
    res.write(sseDelta("好"));
    res.write("data: [DONE]\n\n");
  });
  try {
    const { host } = await loadLlm({
      apiKey: "test-key",
      baseUrl: server.origin,
      model: "dummy",
    });
    const loop = await loadLoop(host);
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
  } finally {
    await server.close();
  }
});

test("经默认循环 Abort 能中止进行中的真实适配器调用", async () => {
  const firstWritten = deferred();
  const release = deferred();
  const server = await serveChatCompletions(async (res) => {
    res.write(sseDelta("半"));
    firstWritten.resolve();
    await release.promise;
    res.write(sseDelta("截"));
    res.write("data: [DONE]\n\n");
  });
  try {
    const { host } = await loadLlm({
      apiKey: "test-key",
      baseUrl: server.origin,
      model: "dummy",
    });
    const loop = await loadLoop(host);
    const firstDelta = deferred();
    host.events.subscribe(LOOP_EVENTS.assistantDelta, () => {
      firstDelta.resolve();
    });
    const controller = new AbortController();
    const pending = loop.prompt("停", { signal: controller.signal });
    await firstWritten.promise;
    await firstDelta.promise;
    controller.abort();
    await expect(pending).rejects.toSatisfy((error) => error instanceof Error);
    expect(loop.messages).toEqual([{ role: "user", content: "停" }]);
  } finally {
    release.resolve();
    await server.close();
  }
});

test.skipIf(!liveReady)(
  "有密钥时默认循环经适配器完成一次真实模型调用",
  async () => {
    const host = createPluginHost();
    await host.load(plugin);
    const loop = await loadLoop(host);
    const deltas: unknown[] = [];
    host.events.subscribe(LOOP_EVENTS.assistantDelta, (payload) => {
      deltas.push(payload);
    });
    await loop.prompt("只回复一个汉字：好。不要调用工具。");
    const last = loop.messages.at(-1);
    expect(deltas.length).toBeGreaterThan(0);
    expect(last?.role).toBe("assistant");
    expect(last).toMatchObject({
      role: "assistant",
      content: expect.arrayContaining([{ type: "text", text: expect.any(String) }]),
    });
  },
  60_000,
);
