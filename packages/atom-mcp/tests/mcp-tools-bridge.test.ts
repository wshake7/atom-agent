import { fileURLToPath } from "node:url";
import { createPluginHost } from "atom-kernel";
import { plugin as loopPlugin } from "../../atom-loop/src/index.ts";
import type { Llm, LlmChunk, Loop, Message } from "../../atom-loop/src/index.ts";
import { expect, test } from "vite-plus/test";
import { createMcpPlugin, plugin as defaultMcpPlugin } from "../src/index.ts";

const echoServer = {
  command: process.execPath,
  args: [fileURLToPath(new URL("./fixtures/echo-mcp.mjs", import.meta.url))],
};

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

type ToolsSlot = { list(): { name: string }[] };

async function loadWithMcp(llm: Llm, mcpModule = createMcpPlugin({ servers: [echoServer] })) {
  const host = createPluginHost();
  await host.load({
    id: "fake-llm",
    apply(ctx) {
      ctx.provide("llm", llm);
    },
  });
  const loadedMcp = await host.load(mcpModule);
  await host.load(loopPlugin);
  const loop = host.context.get("loop") as Loop | undefined;
  if (!loop) {
    throw new Error("loop 槽为空");
  }
  return { host, loop, loadedMcp };
}

test("默认 MCP 桥关闭，不登记工具", async () => {
  const host = createPluginHost();
  await host.load(defaultMcpPlugin);
  expect(host.context.get("tools")).toBeUndefined();
  expect(host.context.get("resources")).toBeUndefined();
  expect(host.context.get("prompts")).toBeUndefined();
  expect(host.context.get("sampling")).toBeUndefined();
});

test("有 name 的 server 把工具登记为 mcp__<server>__<tool>", async () => {
  const llm = fakeLlm([]);
  const { host, loadedMcp } = await loadWithMcp(
    llm,
    createMcpPlugin({ servers: [{ name: "echo", ...echoServer }] }),
  );
  try {
    const tools = host.context.get("tools") as ToolsSlot;
    expect(tools.list().map((tool) => tool.name)).toEqual(["mcp__echo__echo"]);
  } finally {
    await loadedMcp.unload();
  }
});

test("接上 MCP server 后其 tools 进入 tools 槽，循环能调用并拿到 toolResult", async () => {
  const llm = fakeLlm([
    () => [{ type: "toolCall", id: "e", name: "echo", arguments: { text: "pong" } }],
    () => [{ type: "text", text: "好了" }],
  ]);
  const { host, loop, loadedMcp } = await loadWithMcp(llm);
  try {
    const tools = host.context.get("tools") as ToolsSlot;
    expect(tools.list().map((tool) => tool.name)).toEqual(["echo"]);
    expect(host.context.get("resources")).toBeUndefined();
    expect(host.context.get("prompts")).toBeUndefined();
    expect(host.context.get("sampling")).toBeUndefined();

    await loop.prompt("调用 echo");

    expect(loop.messages.find((message) => message.role === "toolResult")).toEqual({
      role: "toolResult",
      toolCallId: "e",
      name: "echo",
      content: "pong",
      isError: false,
    });
  } finally {
    await loadedMcp.unload();
  }
});

test("关掉桥后这些工具不再登记", async () => {
  const host = createPluginHost();
  const loaded = await host.load(createMcpPlugin({ servers: [echoServer] }));
  const tools = host.context.get("tools") as ToolsSlot;
  expect(tools.list().map((tool) => tool.name)).toEqual(["echo"]);

  await loaded.unload();
  expect(host.context.get("tools")).toBeUndefined();
});

test("不依赖默认工具包：先有其他 tools 时只追加 MCP 工具，循环仍能调用", async () => {
  const host = createPluginHost();
  const probe = {
    name: "probe",
    execute: async () => "probe-ok",
  };
  const items = [probe];
  await host.load({
    id: "probe-tools",
    apply(ctx) {
      ctx.provide("tools", {
        list: () => items,
        register(tool: (typeof items)[number]) {
          items.push(tool);
          return () => {
            const index = items.indexOf(tool);
            if (index >= 0) {
              items.splice(index, 1);
            }
          };
        },
      });
    },
  });
  const llm = fakeLlm([
    () => [{ type: "toolCall", id: "e", name: "echo", arguments: { text: "pong" } }],
    () => [{ type: "text", text: "好了" }],
  ]);
  await host.load({
    id: "fake-llm",
    apply(ctx) {
      ctx.provide("llm", llm);
    },
  });
  const loaded = await host.load(createMcpPlugin({ servers: [echoServer] }));
  await host.load(loopPlugin);
  try {
    const tools = host.context.get("tools") as ToolsSlot;
    expect(tools.list().map((tool) => tool.name)).toEqual(["probe", "echo"]);
    expect(tools.list().some((tool) => tool.name === "read")).toBe(false);
    const loop = host.context.get("loop") as Loop;
    await loop.prompt("调用 echo");
    expect(loop.messages.find((message) => message.role === "toolResult")).toEqual({
      role: "toolResult",
      toolCallId: "e",
      name: "echo",
      content: "pong",
      isError: false,
    });
  } finally {
    await loaded.unload();
  }
  expect((host.context.get("tools") as ToolsSlot).list().map((tool) => tool.name)).toEqual([
    "probe",
  ]);
});
