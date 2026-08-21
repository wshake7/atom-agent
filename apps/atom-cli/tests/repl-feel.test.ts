import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import type { ResolvedPluginModule } from "atom-kernel";
import { plugin as loopPlugin } from "atom-loop";
import type { Llm, Message } from "atom-loop";
import { expect, test } from "vite-plus/test";
import { assemble, createDefaultPlugins, createLineReader, runRepl } from "../src/index.ts";

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

function fakeToolsPlugin(
  tools: readonly {
    name: string;
    execute(args: unknown, signal?: AbortSignal): Promise<string>;
  }[] = [],
): ResolvedPluginModule {
  return {
    id: "fake-tools",
    apply(ctx) {
      ctx.provide("tools", { list: () => tools });
    },
  };
}

function textReply(text: string): Llm["stream"] {
  return async function* stream() {
    yield { type: "text" as const, text };
  };
}

function withFakeLlm(
  plugins: readonly ResolvedPluginModule[],
  stream: Llm["stream"],
): ResolvedPluginModule[] {
  return [fakeLlmPlugin(stream), ...plugins.filter((module) => module.id !== "atom-llm")];
}

function userContents(messages: readonly Message[]): string[] {
  return messages.filter((message) => message.role === "user").map((message) => message.content);
}

async function openHome() {
  const root = await mkdtemp(join(tmpdir(), "atom-repl-feel-"));
  const home = join(root, "home");
  const repo = join(root, "repo");
  await mkdir(home, { recursive: true });
  await mkdir(repo, { recursive: true });
  await writeFile(
    join(home, "settings.json"),
    JSON.stringify({
      model: { default: "m1" },
      baseUrl: "https://example.test",
      apiKey: "k",
    }),
  );
  return {
    root,
    home,
    repo,
    env: { ATOM_AGENT_HOME: home } satisfies NodeJS.ProcessEnv,
  };
}

const slashRoster = [
  "/exit",
  "/new",
  "/resume",
  "/session <id>",
  "/sessions",
  "/skill <name>",
  "/model",
  "/help",
];

test("斜杠最小集 /help 一行一个，未知命令不进循环，/exit 退出", async () => {
  const prompts: string[] = [];
  const { stdout, text } = memoryStdout();
  await runRepl({
    plugins: [
      fakeLlmPlugin(async function* stream({ messages }) {
        prompts.push(...userContents(messages));
        yield { type: "text", text: "不应出现" };
      }),
      fakeToolsPlugin(),
      loopPlugin,
    ],
    stdin: Readable.from(["/help\n", "/nope\n", "/exit\n"], { encoding: "utf8" }),
    stdout,
  });
  const output = text();
  const helpLines = output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("/"));
  expect(helpLines).toEqual(slashRoster);
  expect(output).not.toContain("/compact");
  expect(output).not.toContain("/mcp");
  expect(output).not.toContain("/config");
  expect(output).toContain("未知命令: /nope");
  expect(output).not.toContain("不应出现");
  expect(prompts).toEqual([]);
});

test("ASK 里的斜杠当正文，主提示斜杠才拦截", async () => {
  const { stdout, text } = memoryStdout();
  const lines = createLineReader(
    Readable.from(["问我\n", "/still-body\n", "/exit\n"], { encoding: "utf8" }),
  );
  try {
    await runRepl({
      plugins: [
        fakeLlmPlugin(async function* stream({ messages }) {
          const reply = messages.find((message) => message.role === "toolResult");
          if (!reply) {
            yield {
              type: "toolCall",
              id: "a",
              name: "ASK",
              arguments: { question: "文件名是什么？" },
            };
            return;
          }
          yield { type: "text", text: `收到 ${reply.content}` };
        }),
        ...createDefaultPlugins({
          llm: false,
          session: false,
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
    expect(text()).toContain("收到 /still-body");
    expect(text()).not.toContain("未知命令");
  } finally {
    lines.close();
  }
});

test("粘贴多行合成一条再交给循环；ASK 同一套提交单位", async () => {
  const prompts: string[] = [];
  const { stdout, text } = memoryStdout();
  const paste = "\x1b[200~alpha\nbeta\x1b[201~\n";
  const askPaste = "\x1b[200~one\ntwo\x1b[201~\n";
  const lines = createLineReader(
    Readable.from(["问我\n", askPaste, paste, "/exit\n"], { encoding: "utf8" }),
  );
  try {
    await runRepl({
      plugins: [
        fakeLlmPlugin(async function* stream({ messages }) {
          const last = messages.at(-1);
          if (last?.role === "user") {
            prompts.push(last.content);
          }
          const reply = messages.find((message) => message.role === "toolResult");
          if (!reply && last?.role === "user" && last.content === "问我") {
            yield {
              type: "toolCall",
              id: "a",
              name: "ASK",
              arguments: { question: "多行？" },
            };
            return;
          }
          if (reply) {
            yield { type: "text", text: `收到 ${reply.content}` };
            return;
          }
          yield { type: "text", text: "好" };
        }),
        ...createDefaultPlugins({
          llm: false,
          session: false,
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
    expect(text()).toContain("收到 one\ntwo");
    expect(prompts).toEqual(["问我", "alpha\nbeta"]);
  } finally {
    lines.close();
  }
});

test("输入历史只存空闲主提示原始行，不含 ASK，不含 Skill 展开正文", async () => {
  const prompts: string[] = [];
  const { stdout, text } = memoryStdout();
  const lines = createLineReader(
    Readable.from(
      ["问我\n", "ask-secret\n", "主二\n", "\x1b[A\n", "/skill missing\n", "\x1b[A\n", "/exit\n"],
      { encoding: "utf8" },
    ),
  );
  try {
    await runRepl({
      plugins: [
        fakeLlmPlugin(async function* stream({ messages }) {
          const last = messages.at(-1);
          if (last?.role === "user") {
            prompts.push(last.content);
          }
          const reply = messages.find((message) => message.role === "toolResult");
          if (!reply && last?.role === "user" && last.content === "问我") {
            yield {
              type: "toolCall",
              id: "a",
              name: "ASK",
              arguments: { question: "秘密？" },
            };
            return;
          }
          yield { type: "text", text: "ok" };
        }),
        ...createDefaultPlugins({
          llm: false,
          session: false,
          tools: {
            ask: async () => (await lines.readLine()) ?? "",
          },
        }),
      ],
      stdin: Readable.from([]),
      stdout,
      readLine: () => lines.readLine(),
    });
    expect(prompts).toEqual(["问我", "主二", "主二"]);
    expect(text()).not.toContain("ask-secret");
    expect(text().split("未知 Skill: missing").length - 1).toBe(2);
  } finally {
    lines.close();
  }
});

test("/skill 命中立刻 prompt，未知名报错不进循环", async () => {
  const prompts: string[] = [];
  const { stdout, text } = memoryStdout();
  await runRepl({
    plugins: [
      fakeLlmPlugin(async function* stream({ messages }) {
        const last = messages.at(-1);
        if (last?.role === "user") {
          prompts.push(last.content);
        }
        yield { type: "text", text: "ok" };
      }),
      fakeToolsPlugin(),
      loopPlugin,
    ],
    skills: [{ name: "demo", description: "d", body: "BODY" }],
    stdin: Readable.from(["/skill missing\n", "/skill demo extra\n", "/exit\n"], {
      encoding: "utf8",
    }),
    stdout,
  });
  expect(text()).toContain("未知 Skill: missing");
  expect(prompts).toEqual(["BODY\nextra"]);
});

test("回合中键盘中断接到 Abort 不杀进程；空闲中断不退出；空闲 EOF 退出", async () => {
  const firstSeen = deferred();
  const { stdout } = memoryStdout();
  const stdin = new Readable({ read() {} });
  const interrupt = new EventEmitter();
  let aborted = false;
  const running = runRepl({
    plugins: [
      fakeLlmPlugin(async function* stream({ signal }) {
        yield { type: "text", text: "半" };
        firstSeen.resolve();
        await new Promise<void>((_resolve, reject) => {
          const onAbort = () => {
            aborted = true;
            reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
          };
          if (signal?.aborted) {
            onAbort();
            return;
          }
          signal?.addEventListener("abort", onAbort, { once: true });
        });
      }),
      fakeToolsPlugin(),
      loopPlugin,
    ],
    stdin,
    stdout,
    interrupt,
  });
  stdin.push("嗨\n");
  await firstSeen.promise;
  interrupt.emit("SIGINT");
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(aborted).toBe(true);
  interrupt.emit("SIGINT");
  await new Promise((resolve) => setTimeout(resolve, 20));
  stdin.push(null);
  await running;
});

test("/new /session /sessions /resume 走会话槽，不经循环总线", async () => {
  const tree = await openHome();
  try {
    const first = assemble({ cwd: tree.repo, env: tree.env, argv: [] });
    const seen: string[][] = [];
    const listed = memoryStdout();
    await runRepl({
      plugins: withFakeLlm(first.plugins, async function* stream({ messages }) {
        seen.push(userContents(messages));
        yield { type: "text", text: "一" };
      }),
      cwd: tree.repo,
      stdin: Readable.from(["先问\n", "/sessions\n", "/exit\n"], { encoding: "utf8" }),
      stdout: listed.stdout,
    });
    expect(seen).toEqual([["先问"]]);
    const id = listed
      .text()
      .split("\n")
      .map((line) => line.split("\t")[0])
      .find((value) => value && !value.startsWith("/") && value !== "一");
    expect(id).toBeTruthy();

    const { stdout, text } = memoryStdout();
    const prompts: string[][] = [];
    const second = assemble({ cwd: tree.repo, env: tree.env, argv: [] });
    await runRepl({
      plugins: withFakeLlm(second.plugins, async function* stream({ messages }) {
        prompts.push(userContents(messages));
        yield { type: "text", text: "二" };
      }),
      cwd: tree.repo,
      stdin: Readable.from(
        [
          `/session ${id}\n`,
          "/sessions\n",
          "续上\n",
          "/new\n",
          "全新\n",
          "/resume\n",
          "最近\n",
          "/exit\n",
        ],
        { encoding: "utf8" },
      ),
      stdout,
    });
    expect(text()).toContain(id);
    expect(prompts[0]).toEqual(["先问", "续上"]);
    expect(prompts[1]).toEqual(["全新"]);
    expect(prompts[2]).toEqual(["全新", "最近"]);
  } finally {
    await rm(tree.root, { recursive: true, force: true });
  }
});

test("/model 立刻改本会话标识并只写用户层 default/forceDefault", async () => {
  const tree = await openHome();
  try {
    const assembly = assemble({ cwd: tree.repo, env: tree.env, argv: [] });
    const { stdout, text } = memoryStdout();
    await runRepl({
      plugins: withFakeLlm(assembly.plugins, textReply("ok")),
      cwd: tree.repo,
      llm: assembly.llm,
      userRoot: tree.home,
      stdin: Readable.from(
        [
          "/model\n",
          "/model m2\n",
          "/model m3 --force\n",
          "/model --unforce\n",
          "/model --force\n",
          "/exit\n",
        ],
        { encoding: "utf8" },
      ),
      stdout,
    });
    const printed = text();
    expect(printed).toMatch(/当前:\s*m1/);
    expect(printed).toMatch(/default:\s*m1/);
    expect(printed).toMatch(/forceDefault:\s*（无）/);
    expect(assembly.llm.model).toBe("m3");
    expect(assembly.llm.baseUrl).toBe("https://example.test");
    expect(assembly.llm.apiKey).toBe("k");
    const saved = JSON.parse(await readFile(join(tree.home, "settings.json"), "utf8")) as {
      model: { default?: string; forceDefault?: string };
      baseUrl: string;
      apiKey: string;
    };
    expect(saved.model.default).toBe("m3");
    expect(saved.model.forceDefault).toBe("m3");
    expect(saved.baseUrl).toBe("https://example.test");
    expect(saved.apiKey).toBe("k");
  } finally {
    await rm(tree.root, { recursive: true, force: true });
  }
});
