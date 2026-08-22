import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createPluginHost } from "atom-kernel";
import type { ResolvedPluginModule } from "atom-kernel";
import type { Llm, Loop } from "atom-loop";
import { expect, test } from "vite-plus/test";
import { createDefaultPlugins, createLineReader, main, runRepl } from "../src/index.ts";

const echoServer = {
  command: process.execPath,
  args: [
    fileURLToPath(
      new URL("../../../packages/atom-mcp/tests/fixtures/echo-mcp.mjs", import.meta.url),
    ),
  ],
};

async function loadAssembly(plugins: readonly ResolvedPluginModule[]) {
  const host = createPluginHost();
  for (const module of plugins) {
    await host.load(module);
  }
  return host;
}

function fakeLlmPlugin(stream: Llm["stream"]): ResolvedPluginModule {
  return {
    id: "fake-llm",
    apply(ctx) {
      ctx.provide("llm", { stream } satisfies Llm);
    },
  };
}

function memoryStdout() {
  const chunks: string[] = [];
  const stdout = new Writable({
    decodeStrings: false,
    write(chunk, _encoding, callback) {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      callback();
    },
  });
  return {
    stdout,
    text: () => chunks.join(""),
  };
}

test("默认装配占官方槽：循环、真 llm 模块、默认工具包；MCP 桥关闭", async () => {
  const host = await loadAssembly(createDefaultPlugins());
  expect(host.context.get("loop")).toBeDefined();
  expect(host.context.get("llm")).toBeDefined();
  const tools = host.context.get("tools") as
    | { list(): { name: string; description?: string }[] }
    | undefined;
  expect(tools?.list().map((tool) => tool.name)).toEqual([
    "read",
    "write",
    "edit",
    "bash",
    "rg",
    "ask",
    "skill",
  ]);
  expect(tools?.list().find((tool) => tool.name === "skill")?.description).toContain(
    "No skills are currently available",
  );
  expect(host.context.get("session")).toBeDefined();
  expect(host.context.get("compact")).toBeDefined();
  expect(host.context.get("skills")).toBeUndefined();
  expect(host.context.get("sandbox")).toBeUndefined();
  expect(host.context.get("resources")).toBeUndefined();
  expect(host.context.get("prompts")).toBeUndefined();
  expect(host.context.get("sampling")).toBeUndefined();
  expect(host.context.get("loop") as Loop | undefined).toBeDefined();
});

test("关掉默认工具包后循环看不到 read/write 等工具，Skill 加载器仍在", async () => {
  const host = await loadAssembly(createDefaultPlugins({ tools: false }));
  const tools = host.context.get("tools") as
    | { list(): { name: string; description?: string }[] }
    | undefined;
  expect(tools?.list().map((tool) => tool.name)).toEqual(["skill"]);
  expect(tools?.list()[0]?.description).toContain("No skills are currently available");
  expect(host.context.get("loop")).toBeDefined();
});

test("打开 MCP 桥后其 tools 与默认工具包同在 tools 槽", async () => {
  const host = await loadAssembly(createDefaultPlugins({ mcpServers: [echoServer] }));
  const tools = host.context.get("tools") as { list(): { name: string }[] } | undefined;
  expect(tools?.list().map((tool) => tool.name)).toEqual([
    "read",
    "write",
    "edit",
    "bash",
    "rg",
    "ask",
    "skill",
    "echo",
  ]);
  expect(host.context.get("resources")).toBeUndefined();
});

test("默认装配经 REPL 能写入当前工作树", async () => {
  const root = await mkdtemp(join(tmpdir(), "atom-cli-write-"));
  const { stdout, text } = memoryStdout();
  try {
    await runRepl({
      plugins: [
        fakeLlmPlugin(async function* stream({ messages }) {
          const hasResult = messages.some((message) => message.role === "toolResult");
          if (!hasResult) {
            yield {
              type: "toolCall",
              id: "w",
              name: "write",
              arguments: { path: "note.txt", content: "hi" },
            };
            return;
          }
          yield { type: "text", text: "写好了" };
        }),
        ...createDefaultPlugins({ llm: false, tools: { cwd: root } }),
      ],
      stdin: Readable.from(["写文件\n"], { encoding: "utf8" }),
      stdout,
    });
    expect(await readFile(join(root, "note.txt"), "utf8")).toBe("hi");
    expect(text()).toContain("[工具开始] write");
    expect(text()).toContain("[工具结束] write");
    expect(text()).toContain("写好了");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("打开 MCP 后同一 REPL 回合能调用登记的工具", async () => {
  const { stdout, text } = memoryStdout();
  await runRepl({
    plugins: [
      fakeLlmPlugin(async function* stream({ messages }) {
        const hasResult = messages.some((message) => message.role === "toolResult");
        if (!hasResult) {
          yield {
            type: "toolCall",
            id: "e",
            name: "echo",
            arguments: { text: "pong" },
          };
          return;
        }
        yield { type: "text", text: "回声到了" };
      }),
      ...createDefaultPlugins({
        llm: false,
        tools: false,
        mcpServers: [echoServer],
      }),
    ],
    stdin: Readable.from(["调用 echo\n"], { encoding: "utf8" }),
    stdout,
  });
  expect(text()).toContain("[工具开始] echo");
  expect(text()).toContain("[工具结束] echo");
  expect(text()).toContain("回声到了");
});

test("ask 在 REPL 里提问并收下下一行作为答复", async () => {
  const { stdout, text } = memoryStdout();
  const lines = createLineReader(Readable.from(["问我\n", "note.txt\n"], { encoding: "utf8" }));
  try {
    await runRepl({
      plugins: [
        fakeLlmPlugin(async function* stream({ messages }) {
          const reply = messages.find((message) => message.role === "toolResult");
          if (!reply) {
            yield {
              type: "toolCall",
              id: "a",
              name: "ask",
              arguments: { question: "文件名是什么？" },
            };
            return;
          }
          yield { type: "text", text: `收到 ${reply.content}` };
        }),
        ...createDefaultPlugins({
          llm: false,
          tools: {
            ask: async (question) => {
              stdout.write(`[问] ${question}\n`);
              return (await lines.readLine()) ?? "";
            },
          },
        }),
      ],
      stdin: Readable.from([]),
      stdout,
      readLine: () => lines.readLine(),
    });
    expect(text()).toContain("[问] 文件名是什么？");
    expect(text()).toContain("收到 note.txt");
  } finally {
    lines.close();
  }
});

test("main 用默认装配启动，空输入即退出", async () => {
  const root = await mkdtemp(join(tmpdir(), "atom-cli-main-"));
  const home = join(root, "home");
  await mkdir(home, { recursive: true });
  await writeFile(
    join(home, "settings.json"),
    JSON.stringify({
      model: "m",
      baseUrl: "https://example.test",
      apiKey: "k",
    }),
  );
  const { stdout } = memoryStdout();
  try {
    await main([], Readable.from([]), stdout, {
      cwd: root,
      env: { ATOM_AGENT_HOME: home },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("main 拒绝未知参数", async () => {
  const { stdout } = memoryStdout();
  await expect(main(["--tui"], Readable.from([]), stdout)).rejects.toThrow("未知参数: --tui");
});
