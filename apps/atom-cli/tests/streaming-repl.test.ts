import { Readable, Writable } from "node:stream";
import type { ResolvedPluginModule } from "atom-kernel";
import { plugin as loopPlugin } from "atom-loop";
import type { Llm, LlmChunk, Tool } from "atom-loop";
import { expect, test } from "vite-plus/test";
import { runRepl } from "../src/index.ts";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
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

function fakeLlmPlugin(stream: Llm["stream"]): ResolvedPluginModule {
  return {
    id: "fake-llm",
    apply(ctx) {
      ctx.provide("llm", { stream } satisfies Llm);
    },
  };
}

function fakeToolsPlugin(tools: readonly Tool[] = []): ResolvedPluginModule {
  return {
    id: "fake-tools",
    apply(ctx) {
      ctx.provide("tools", { list: () => tools });
    },
  };
}

test("人输入一轮后终端按总线增量出现助手流式输出", async () => {
  const firstSeen = deferred();
  const secondChunk = deferred<LlmChunk[]>();
  const { stdout, text } = memoryStdout();

  const running = runRepl({
    plugins: [
      fakeLlmPlugin(async function* stream() {
        yield { type: "thinking", text: "暗" };
        yield { type: "text", text: "你" };
        firstSeen.resolve();
        for (const chunk of await secondChunk.promise) {
          yield chunk;
        }
      }),
      fakeToolsPlugin(),
      loopPlugin,
    ],
    stdin: Readable.from(["嗨\n"], { encoding: "utf8" }),
    stdout,
  });

  await firstSeen.promise;
  expect(text()).toContain("暗");
  expect(text()).toContain("你");
  expect(text()).not.toContain("好");

  secondChunk.resolve([{ type: "text", text: "好" }]);
  await running;

  expect(text()).toContain("你好");
});

test("工具起止来自总线最小事件集并写到终端", async () => {
  const { stdout, text } = memoryStdout();

  await runRepl({
    plugins: [
      fakeLlmPlugin(async function* stream({ messages }) {
        const hasResult = messages.some((message) => message.role === "toolResult");
        if (!hasResult) {
          yield {
            type: "toolCall",
            id: "call-1",
            name: "echo",
            arguments: { text: "hi" },
          };
          return;
        }
        yield { type: "text", text: "好了" };
      }),
      fakeToolsPlugin([
        {
          name: "echo",
          async execute() {
            return "hi";
          },
        },
      ]),
      loopPlugin,
    ],
    stdin: Readable.from(["跑工具\n"], { encoding: "utf8" }),
    stdout,
  });

  expect(text()).toContain("[工具开始] echo");
  expect(text()).toContain(JSON.stringify({ text: "hi" }));
  expect(text()).toContain("[工具结束] echo");
  expect(text()).toContain("好了");
});
