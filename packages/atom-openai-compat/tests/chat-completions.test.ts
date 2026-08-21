import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "vite-plus/test";
import { OpenAiCompatOverflowError, streamChatCompletions } from "../src/index.ts";

async function drain(req: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function serveChatCompletions(
  write: (res: NodeJS.WritableStream) => Promise<void> | void,
  onRequest?: (info: { url?: string; authorization?: string; body: unknown }) => void,
) {
  const server = createServer((req, res) => {
    void (async () => {
      const raw = await drain(req);
      onRequest?.({
        url: req.url,
        authorization: req.headers.authorization,
        body: raw.length > 0 ? (JSON.parse(raw) as unknown) : undefined,
      });
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

function sseDelta(delta: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`;
}

async function collect(input: Parameters<typeof streamChatCompletions>[0]): Promise<unknown[]> {
  const chunks: unknown[] = [];
  for await (const chunk of streamChatCompletions(input)) {
    chunks.push(chunk);
  }
  return chunks;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

test("录制的 chat/completions SSE 流出文本块", async () => {
  const server = await serveChatCompletions((res) => {
    res.write(sseDelta({ content: "你" }));
    res.write(sseDelta({ content: "好" }));
    res.write("data: [DONE]\n\n");
  });
  try {
    await expect(
      collect({
        apiKey: "test-key",
        baseUrl: server.origin,
        model: "dummy",
        messages: [{ role: "user", content: "嗨" }],
      }),
    ).resolves.toEqual([
      { type: "text", text: "你" },
      { type: "text", text: "好" },
    ]);
  } finally {
    await server.close();
  }
});

test("去尾斜杠后拼 /chat/completions，思考字段映射留在库内", async () => {
  let seen: { url?: string; body: unknown } | undefined;
  const server = await serveChatCompletions(
    (res) => {
      res.write(sseDelta({ reasoning_content: "想" }));
      res.write(sseDelta({ content: "答" }));
      res.write("data: [DONE]\n\n");
    },
    (info) => {
      seen = info;
    },
  );
  try {
    await expect(
      collect({
        apiKey: "k",
        baseUrl: `${server.origin}/`,
        model: "m",
        messages: [
          { role: "user", content: "问" },
          {
            role: "assistant",
            content: [
              { type: "thinking", text: "旧想" },
              { type: "text", text: "旧答" },
            ],
          },
        ],
      }),
    ).resolves.toEqual([
      { type: "thinking", text: "想" },
      { type: "text", text: "答" },
    ]);
    expect(seen?.url).toBe("/chat/completions");
    expect(seen?.body).toMatchObject({
      model: "m",
      stream: true,
      messages: [
        { role: "user", content: "问" },
        { role: "assistant", content: "旧答", reasoning_content: "旧想" },
      ],
    });
  } finally {
    await server.close();
  }
});

test("后续帧空 name 仍保留已解析工具名", async () => {
  const server = await serveChatCompletions((res) => {
    res.write(
      sseDelta({
        tool_calls: [
          {
            index: 0,
            id: "call_1",
            type: "function",
            function: { name: "write", arguments: "" },
          },
        ],
      }),
    );
    res.write(
      sseDelta({
        tool_calls: [{ index: 0, function: { name: "", arguments: '{"path":"' } }],
      }),
    );
    res.write(
      sseDelta({
        tool_calls: [{ index: 0, function: { name: "", arguments: 'test.md"}' } }],
      }),
    );
    res.write("data: [DONE]\n\n");
  });
  try {
    await expect(
      collect({
        apiKey: "k",
        baseUrl: server.origin,
        model: "m",
        messages: [{ role: "user", content: "写" }],
        tools: [{ name: "write" }],
      }),
    ).resolves.toEqual([
      {
        type: "toolCall",
        id: "call_1",
        name: "write",
        arguments: { path: "test.md" },
      },
    ]);
  } finally {
    await server.close();
  }
});

test("提供商上下文溢出抛出库内失败，Authorization 只信调用参数", async () => {
  const previousKey = process.env.ATOM_LLM_API_KEY;
  process.env.ATOM_LLM_API_KEY = "from-env";
  let authorization: string | undefined;
  const server = createServer((req, res) => {
    void (async () => {
      authorization = req.headers.authorization;
      await drain(req);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: "context_length_exceeded" } }));
    })();
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  try {
    await expect(
      collect({
        apiKey: "test-key",
        baseUrl: `http://127.0.0.1:${address.port}`,
        model: "dummy",
        messages: [{ role: "user", content: "长" }],
      }),
    ).rejects.toBeInstanceOf(OpenAiCompatOverflowError);
    expect(authorization).toBe("Bearer test-key");
  } finally {
    if (previousKey === undefined) {
      delete process.env.ATOM_LLM_API_KEY;
    } else {
      process.env.ATOM_LLM_API_KEY = previousKey;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
});

test("Abort 能中止进行中的兼容面调用", async () => {
  const firstWritten = deferred();
  const release = deferred();
  const server = await serveChatCompletions(async (res) => {
    res.write(sseDelta({ content: "半" }));
    firstWritten.resolve();
    await release.promise;
    res.write(sseDelta({ content: "截" }));
    res.write("data: [DONE]\n\n");
  });
  try {
    const controller = new AbortController();
    const chunks: unknown[] = [];
    const firstChunk = deferred();
    const pending = (async () => {
      for await (const chunk of streamChatCompletions({
        apiKey: "k",
        baseUrl: server.origin,
        model: "m",
        messages: [{ role: "user", content: "停" }],
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
