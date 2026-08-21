import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { createPluginHost } from "atom-kernel";
import type { LoadedPlugin, ResolvedPluginModule } from "atom-kernel";
import type { Llm, Loop } from "atom-loop";
import { isMessageRecord, type Session } from "atom-session";
import { expect, test } from "vite-plus/test";
import { assemble, main } from "../src/index.ts";

async function openHome() {
  const root = await mkdtemp(join(tmpdir(), "atom-sess-cli-"));
  const home = join(root, "home");
  const repo = join(root, "repo");
  await mkdir(home, { recursive: true });
  await mkdir(repo, { recursive: true });
  await writeFile(
    join(home, "settings.json"),
    JSON.stringify({
      model: "m1",
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

async function loadHost(plugins: readonly ResolvedPluginModule[]) {
  const host = createPluginHost();
  const loaded: LoadedPlugin[] = [];
  for (const module of plugins) {
    loaded.push(await host.load(module));
  }
  return {
    host,
    close: async () => {
      for (const item of [...loaded].reverse()) {
        await item.unload();
      }
    },
  };
}

function fakeLlm(stream: Llm["stream"]): ResolvedPluginModule {
  return {
    id: "fake-llm",
    apply(ctx) {
      ctx.provide("llm", { stream } satisfies Llm);
    },
  };
}

function withFakeLlm(
  plugins: readonly ResolvedPluginModule[],
  stream: Llm["stream"],
): ResolvedPluginModule[] {
  return [fakeLlm(stream), ...plugins.filter((module) => module.id !== "atom-llm")];
}

function textReply(text: string): Llm["stream"] {
  return async function* stream() {
    yield { type: "text" as const, text };
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
  return { stdout, text: () => chunks.join("") };
}

test("关掉再开：按 id 或 cwd 最近一次能 load 出原文；裸启动是新会话", async () => {
  const tree = await openHome();
  try {
    const first = assemble({ cwd: tree.repo, env: tree.env, argv: [] });
    expect(first.plugins.some((plugin) => plugin.id === "atom-session")).toBe(true);
    const loaded = await loadHost(withFakeLlm(first.plugins, textReply("好")));
    try {
      const loop = loaded.host.context.get("loop") as Loop;
      await loop.prompt("嗨");
      const session = loaded.host.context.get("session") as Session;
      const id = session.current.id;
      const snapshot = [...loop.messages];
      expect(snapshot).toEqual([
        { role: "user", content: "嗨" },
        { role: "assistant", content: [{ type: "text", text: "好" }] },
      ]);
      await loaded.close();

      const byId = assemble({ cwd: tree.repo, env: tree.env, argv: ["--session", id] });
      const opened = await loadHost(withFakeLlm(byId.plugins, textReply("续")));
      try {
        const restored = opened.host.context.get("loop") as Loop;
        expect(restored.messages).toEqual(snapshot);
      } finally {
        await opened.close();
      }

      const resumed = assemble({ cwd: tree.repo, env: tree.env, argv: ["--resume"] });
      const latest = await loadHost(withFakeLlm(resumed.plugins, textReply("续")));
      try {
        expect((latest.host.context.get("loop") as Loop).messages).toEqual(snapshot);
      } finally {
        await latest.close();
      }

      const bare = assemble({ cwd: tree.repo, env: tree.env, argv: [] });
      const fresh = await loadHost(withFakeLlm(bare.plugins, textReply("新")));
      try {
        expect((fresh.host.context.get("loop") as Loop).messages).toEqual([]);
        expect((fresh.host.context.get("session") as Session).current.id).not.toBe(id);
      } finally {
        await fresh.close();
      }
    } finally {
      await loaded.close().catch(() => undefined);
    }
  } finally {
    await rm(tree.root, { recursive: true, force: true });
  }
});

test("main --sessions 列出已有会话且不悄悄新建", async () => {
  const tree = await openHome();
  try {
    const first = assemble({ cwd: tree.repo, env: tree.env, argv: [] });
    const loaded = await loadHost(withFakeLlm(first.plugins, textReply("好")));
    const session = loaded.host.context.get("session") as Session;
    await (loaded.host.context.get("loop") as Loop).prompt("嗨");
    const id = session.current.id;
    await loaded.close();

    const { stdout, text } = memoryStdout();
    await main(["--sessions"], Readable.from([]), stdout, { cwd: tree.repo, env: tree.env });
    expect(text()).toContain(id);

    const listed = assemble({ cwd: tree.repo, env: tree.env, argv: ["--sessions"] });
    const sessionPlugin = listed.plugins.find((plugin) => plugin.id === "atom-session");
    if (!sessionPlugin) {
      throw new Error("缺少 session 插件");
    }
    const after = await loadHost([sessionPlugin]);
    try {
      const ids = (after.host.context.get("session") as Session).list().map((item) => item.id);
      expect(ids).toEqual([id]);
    } finally {
      await after.close();
    }
  } finally {
    await rm(tree.root, { recursive: true, force: true });
  }
});

test("续聊跟当前装配走，新助手盖当时模型标识", async () => {
  const tree = await openHome();
  try {
    const first = assemble({ cwd: tree.repo, env: tree.env, argv: [] });
    const loaded = await loadHost(withFakeLlm(first.plugins, textReply("旧答")));
    await (loaded.host.context.get("loop") as Loop).prompt("问");
    const id = (loaded.host.context.get("session") as Session).current.id;
    await loaded.close();

    await writeFile(
      join(tree.home, "settings.json"),
      JSON.stringify({
        model: "m2",
        baseUrl: "https://example.test",
        apiKey: "k",
      }),
    );
    const next = assemble({ cwd: tree.repo, env: tree.env, argv: ["--session", id] });
    expect(next.llm.model).toBe("m2");
    const opened = await loadHost(withFakeLlm(next.plugins, textReply("新答")));
    try {
      await (opened.host.context.get("loop") as Loop).prompt("再问");
      const models = (opened.host.context.get("session") as Session).current.records
        .filter(isMessageRecord)
        .filter((record) => record.message.role === "assistant")
        .map((record) => record.model);
      expect(models).toEqual(["m1", "m2"]);
    } finally {
      await opened.close();
    }
  } finally {
    await rm(tree.root, { recursive: true, force: true });
  }
});
