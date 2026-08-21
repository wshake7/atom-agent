import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPluginHost } from "atom-kernel";
import { expect, test } from "vite-plus/test";
import { createSessionPlugin, isCompactionRecord, isMessageRecord } from "../src/index.ts";
import type { Session } from "../src/index.ts";

const triangle = [
  { role: "user" as const, content: "写个函数" },
  {
    role: "assistant" as const,
    content: [
      { type: "thinking" as const, text: "先想" },
      { type: "text" as const, text: "调用工具" },
      { type: "toolCall" as const, id: "c1", name: "echo", arguments: { text: "hi" } },
    ],
  },
  {
    role: "toolResult" as const,
    toolCallId: "c1",
    name: "echo",
    content: "hi",
    isError: false,
  },
];

async function loadSession(options: {
  root: string;
  cwd: string;
  start?: "new" | "latest" | { id: string };
}) {
  const host = createPluginHost();
  await host.load(
    createSessionPlugin({
      root: options.root,
      cwd: options.cwd,
      start: options.start ?? "new",
      stamp: () => ({ model: "m1", provider: "atom-llm" }),
    }),
  );
  const session = host.context.get("session") as Session | undefined;
  if (!session) {
    throw new Error("session 槽为空");
  }
  return { host, session };
}

test("关掉宿主再开，按 id 能 load 出原文三角消息", async () => {
  const root = await mkdtemp(join(tmpdir(), "atom-session-"));
  const cwd = join(root, "proj");
  try {
    const first = await loadSession({ root, cwd });
    for (const message of triangle) {
      first.session.current.append(message);
    }
    const id = first.session.current.id;
    expect(first.session.current.messages).toEqual(triangle);

    const second = await loadSession({ root, cwd, start: { id } });
    expect(second.session.current.id).toBe(id);
    expect(second.session.current.messages).toEqual(triangle);
    expect(second.session.current.messages[1]).toMatchObject({
      role: "assistant",
      content: [
        { type: "thinking", text: "先想" },
        { type: "text", text: "调用工具" },
        { type: "toolCall", id: "c1", name: "echo", arguments: { text: "hi" } },
      ],
    });
    const assistant = second.session.current.records
      .filter(isMessageRecord)
      .find((record) => record.message.role === "assistant");
    expect(assistant?.model).toBe("m1");
    expect(assistant?.provider).toBe("atom-llm");
    expect(assistant?.timestamp).toEqual(expect.any(String));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("按 cwd 最近一次打开；裸启动是新会话", async () => {
  const root = await mkdtemp(join(tmpdir(), "atom-session-"));
  const cwdA = join(root, "a");
  const cwdB = join(root, "b");
  try {
    const older = await loadSession({ root, cwd: cwdA });
    older.session.current.append({ role: "user", content: "旧" });
    const newer = await loadSession({ root, cwd: cwdA });
    newer.session.current.append({ role: "user", content: "新" });
    const id = newer.session.current.id;

    const resumed = await loadSession({ root, cwd: cwdA, start: "latest" });
    expect(resumed.session.current.id).toBe(id);
    expect(resumed.session.current.messages).toEqual([{ role: "user", content: "新" }]);

    const fresh = await loadSession({ root, cwd: cwdA, start: "new" });
    expect(fresh.session.current.id).not.toBe(id);
    expect(fresh.session.current.messages).toEqual([]);

    await expect(loadSession({ root, cwd: cwdB, start: "latest" })).rejects.toThrow(
      "没有当前工作目录的会话",
    );

    const listed = fresh.session.list();
    expect(listed.map((item) => item.id).sort()).toEqual(
      [older.session.current.id, newer.session.current.id].sort(),
    );
    expect(listed.every((item) => item.cwd === cwdA || item.cwd.endsWith("a"))).toBe(true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("续聊盖当时装配标识，不冻写下那天的模型", async () => {
  const root = await mkdtemp(join(tmpdir(), "atom-session-"));
  const cwd = join(root, "proj");
  try {
    const first = await loadSession({ root, cwd });
    first.session.current.append({
      role: "assistant",
      content: [{ type: "text", text: "旧答" }],
    });
    const id = first.session.current.id;

    const host = createPluginHost();
    await host.load(
      createSessionPlugin({
        root,
        cwd,
        start: { id },
        stamp: () => ({ model: "m2", provider: "atom-llm" }),
      }),
    );
    const session = host.context.get("session") as Session;
    session.current.append({
      role: "assistant",
      content: [{ type: "text", text: "新答" }],
    });
    const models = session.current.records
      .filter(isMessageRecord)
      .filter((record) => record.message.role === "assistant")
      .map((record) => record.model);
    expect(models).toEqual(["m1", "m2"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("缩短才写压缩事件进同一份日志，原文消息仍在", async () => {
  const root = await mkdtemp(join(tmpdir(), "atom-session-"));
  const cwd = join(root, "proj");
  try {
    const first = await loadSession({ root, cwd });
    for (const message of triangle) {
      first.session.current.append(message);
    }
    first.session.current.appendCompaction({ summary: "早先对话摘要", cutIndex: 1 });
    const id = first.session.current.id;
    expect(first.session.current.messages).toEqual(triangle);
    expect(first.session.current.records.some(isCompactionRecord)).toBe(true);

    const second = await loadSession({ root, cwd, start: { id } });
    expect(second.session.current.messages).toEqual(triangle);
    const compaction = second.session.current.records.find(isCompactionRecord);
    expect(compaction).toMatchObject({
      kind: "compaction",
      summary: "早先对话摘要",
      cutIndex: 1,
    });
    expect(compaction && "timestamp" in compaction ? compaction.timestamp : undefined).toEqual(
      expect.any(String),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
