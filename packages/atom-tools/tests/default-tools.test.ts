import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPluginHost } from "atom-kernel";
import { plugin as loopPlugin } from "../../atom-loop/src/index.ts";
import type { Llm, LlmChunk, Loop, Message } from "../../atom-loop/src/index.ts";
import { expect, test } from "vite-plus/test";
import { createToolsPlugin } from "../src/index.ts";

function fakeLlm(
  replies: ((messages: readonly Message[]) => LlmChunk[] | Promise<LlmChunk[]>)[],
): Llm {
  const received: Message[][] = [];
  return {
    async *stream({ messages, signal }) {
      const index = received.length;
      received.push([...messages]);
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

async function loadRound(llm: Llm, toolsModule: ReturnType<typeof createToolsPlugin>) {
  const host = createPluginHost();
  await host.load({
    id: "fake-llm",
    apply(ctx) {
      ctx.provide("llm", llm);
    },
  });
  await host.load(toolsModule);
  await host.load(loopPlugin);
  const loop = host.context.get("loop") as Loop | undefined;
  if (!loop) {
    throw new Error("loop 槽为空");
  }
  return { host, loop };
}

test("假 llm 驱动下循环能调用默认工具，效果落在工作树和本机进程", async () => {
  const root = await mkdtemp(join(tmpdir(), "atom-tools-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "seed.txt"), "seed-hello\n");

    const llm = fakeLlm([
      () => [
        {
          type: "toolCall",
          id: "w",
          name: "write",
          arguments: { path: "src/note.txt", content: "alpha\n" },
        },
        { type: "toolCall", id: "r", name: "read", arguments: { path: "src/note.txt" } },
        {
          type: "toolCall",
          id: "e",
          name: "edit",
          arguments: { path: "src/note.txt", oldString: "alpha", newString: "beta" },
        },
        {
          type: "toolCall",
          id: "b",
          name: "bash",
          arguments: { command: "printf hi-from-bash" },
        },
        { type: "toolCall", id: "g", name: "rg", arguments: { pattern: "beta", path: "src" } },
        {
          type: "toolCall",
          id: "o",
          name: "rg",
          arguments: { files: true, glob: "src/*.txt" },
        },
      ],
      () => [{ type: "text", text: "好了" }],
    ]);

    const { loop } = await loadRound(llm, createToolsPlugin({ cwd: root }));
    await loop.prompt("改仓库");

    expect(await readFile(join(root, "src/note.txt"), "utf8")).toBe("beta\n");
    const results = loop.messages.filter((message) => message.role === "toolResult");
    expect(results.find((message) => message.name === "read")?.content).toContain("alpha");
    expect(results.find((message) => message.name === "bash")?.content).toContain("hi-from-bash");
    const searches = results.filter((message) => message.name === "rg");
    expect(searches[0]?.content).toContain("note.txt");
    expect(searches[1]?.content).toContain("src/note.txt");
    expect(results.every((message) => message.isError !== true)).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rg 使用随包二进制，不依赖系统 PATH 上的 rg", async () => {
  const root = await mkdtemp(join(tmpdir(), "atom-tools-rg-"));
  const originalPath = process.env.PATH;
  process.env.PATH = join(root, "empty-path");
  try {
    await writeFile(join(root, "hit.txt"), "needle-in-packaged-rg\n");
    const llm = fakeLlm([
      () => [
        { type: "toolCall", id: "g", name: "rg", arguments: { pattern: "needle-in-packaged-rg" } },
      ],
      () => [{ type: "text", text: "好了" }],
    ]);
    const { loop } = await loadRound(llm, createToolsPlugin({ cwd: root }));
    await loop.prompt("搜");
    expect(loop.messages.find((message) => message.role === "toolResult")).toEqual({
      role: "toolResult",
      toolCallId: "g",
      name: "rg",
      content: expect.stringContaining("needle-in-packaged-rg"),
      isError: false,
    });
  } finally {
    process.env.PATH = originalPath;
    await rm(root, { recursive: true, force: true });
  }
});

test("ASK 能提问并收下答复作为 toolResult，且不拦截 write 或 bash", async () => {
  const root = await mkdtemp(join(tmpdir(), "atom-tools-ask-"));
  const asked: string[] = [];
  try {
    const llm = fakeLlm([
      () => [
        {
          type: "toolCall",
          id: "w",
          name: "write",
          arguments: { path: "x.txt", content: "ok" },
        },
        { type: "toolCall", id: "b", name: "bash", arguments: { command: "printf ran" } },
      ],
      () => [{ type: "toolCall", id: "a", name: "ASK", arguments: { question: "文件名是什么？" } }],
      () => [{ type: "text", text: "收到" }],
    ]);
    const { loop } = await loadRound(
      llm,
      createToolsPlugin({
        cwd: root,
        ask: async (question) => {
          asked.push(question);
          return "note.txt";
        },
      }),
    );

    await loop.prompt("先写再问");

    expect(asked).toEqual(["文件名是什么？"]);
    expect(await readFile(join(root, "x.txt"), "utf8")).toBe("ok");
    const results = loop.messages.filter((message) => message.role === "toolResult");
    expect(results.find((message) => message.name === "bash")?.content).toContain("ran");
    expect(results.find((message) => message.name === "ASK")).toEqual({
      role: "toolResult",
      toolCallId: "a",
      name: "ASK",
      content: "note.txt",
      isError: false,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("整包可关：不装或卸载后循环看不到这些工具", async () => {
  const names = ["read", "write", "edit", "bash", "rg", "ASK"];
  const hostWithTools = createPluginHost();
  const loaded = await hostWithTools.load(createToolsPlugin());
  const listed = hostWithTools.context.get("tools") as { list(): { name: string }[] } | undefined;
  expect(listed?.list().map((tool) => tool.name)).toEqual(names);

  await loaded.unload();
  expect(hostWithTools.context.get("tools")).toBeUndefined();

  const llm = fakeLlm([
    () => [{ type: "toolCall", id: "r", name: "read", arguments: { path: "x.txt" } }],
    () => [{ type: "text", text: "跳过" }],
  ]);
  const host = createPluginHost();
  await host.load({
    id: "fake-llm",
    apply(ctx) {
      ctx.provide("llm", llm);
    },
  });
  await host.load({
    id: "empty-tools",
    apply(ctx) {
      ctx.provide("tools", { list: () => [] });
    },
  });
  await host.load(loopPlugin);
  const loop = host.context.get("loop") as Loop;
  await loop.prompt("读");

  expect(loop.messages[2]).toEqual({
    role: "toolResult",
    toolCallId: "r",
    name: "read",
    content: "未知工具: read",
    isError: true,
  });
});
