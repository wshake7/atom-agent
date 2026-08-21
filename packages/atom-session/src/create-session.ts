import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  isMessageRecord,
  type Session,
  type SessionLog,
  type SessionMessage,
  type SessionPluginOptions,
  type SessionRecord,
  type SessionStamp,
} from "./types.ts";

interface StoredLog {
  id: string;
  cwd: string;
  createdAt: string;
  records: SessionRecord[];
}

export function createSession(options: SessionPluginOptions): Session {
  const store = options.root ? fileStore(resolve(options.root)) : memoryStore();
  const cwd = resolve(options.cwd);
  const stamp = options.stamp;
  const start = options.start ?? "new";
  const opened =
    start === "new"
      ? undefined
      : start === "latest"
        ? openLatest(store, cwd, stamp)
        : openExisting(store, start.id, stamp);
  return makeSession(store, stamp, cwd, opened);
}

function makeSession(
  store: Store,
  stamp: (() => SessionStamp) | undefined,
  cwd: string,
  opened: SessionLog | undefined,
): Session {
  let current = opened;
  const session: Session = {
    get current() {
      current ??= openCreated(store, cwd, stamp);
      return current;
    },
    create(cwd) {
      current = openCreated(store, resolve(cwd), stamp);
      return current;
    },
    open(id) {
      current = openExisting(store, id, stamp);
      return current;
    },
    latest(cwd) {
      const id = store.latestId(resolve(cwd));
      if (!id) {
        return undefined;
      }
      current = openExisting(store, id, stamp);
      return current;
    },
    list() {
      return store.list();
    },
  };
  return session;
}

function openCreated(
  store: Store,
  cwd: string,
  stamp: (() => SessionStamp) | undefined,
): SessionLog {
  const stored = store.create(cwd);
  return wrapLog(store, stored, stamp);
}

function openExisting(
  store: Store,
  id: string,
  stamp: (() => SessionStamp) | undefined,
): SessionLog {
  const stored = store.read(id);
  if (!stored) {
    throw new Error(`找不到会话: ${id}`);
  }
  return wrapLog(store, stored, stamp);
}

function openLatest(
  store: Store,
  cwd: string,
  stamp: (() => SessionStamp) | undefined,
): SessionLog {
  const id = store.latestId(cwd);
  if (!id) {
    throw new Error("没有当前工作目录的会话");
  }
  return openExisting(store, id, stamp);
}

function wrapLog(
  store: Store,
  stored: StoredLog,
  stamp: (() => SessionStamp) | undefined,
): SessionLog {
  const records = stored.records;
  return {
    id: stored.id,
    cwd: stored.cwd,
    get messages() {
      return records.flatMap((record) => (isMessageRecord(record) ? [record.message] : []));
    },
    get records() {
      return records;
    },
    append(message: SessionMessage) {
      const extra = message.role === "assistant" ? stamp?.() : undefined;
      const record: SessionRecord = {
        message,
        timestamp: new Date().toISOString(),
        model: extra?.model,
        provider: extra?.provider,
      };
      records.push(record);
      store.append(stored.id, record);
    },
    appendCompaction(event) {
      const record: SessionRecord = {
        kind: "compaction",
        summary: event.summary,
        cutIndex: event.cutIndex,
        timestamp: new Date().toISOString(),
      };
      records.push(record);
      store.append(stored.id, record);
    },
  };
}

interface Store {
  create(cwd: string): StoredLog;
  read(id: string): StoredLog | undefined;
  append(id: string, record: SessionRecord): void;
  latestId(cwd: string): string | undefined;
  list(): { id: string; cwd: string; updatedAt: string }[];
}

function memoryStore(): Store {
  const logs = new Map<string, StoredLog>();
  return {
    create(cwd) {
      const stored: StoredLog = {
        id: crypto.randomUUID(),
        cwd,
        createdAt: new Date().toISOString(),
        records: [],
      };
      logs.set(stored.id, stored);
      return stored;
    },
    read(id) {
      const stored = logs.get(id);
      return stored ? { ...stored, records: stored.records } : undefined;
    },
    append() {},
    latestId(cwd) {
      return newest(summaries(logs.values()), cwd)?.id;
    },
    list() {
      return summaries(logs.values());
    },
  };
}

function fileStore(root: string): Store {
  const dir = resolve(root, "sessions");
  const pending = new Map<string, StoredLog>();
  return {
    create(cwd) {
      const stored: StoredLog = {
        id: crypto.randomUUID(),
        cwd,
        createdAt: new Date().toISOString(),
        records: [],
      };
      pending.set(stored.id, stored);
      return stored;
    },
    read(id) {
      const path = logPath(dir, id);
      if (existsSync(path)) {
        return parseLog(readFileSync(path, "utf8"));
      }
      return pending.get(id);
    },
    append(id, record) {
      mkdirSync(dir, { recursive: true });
      const path = logPath(dir, id);
      if (!existsSync(path)) {
        const stored = pending.get(id);
        if (stored) {
          writeFileSync(path, `${JSON.stringify(toMeta(stored))}\n`, "utf8");
        }
      }
      appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
    },
    latestId(cwd) {
      return newest(scan(dir), cwd)?.id;
    },
    list() {
      return scan(dir);
    },
  };
}

function logPath(dir: string, id: string): string {
  return resolve(dir, `${id}.jsonl`);
}

function toMeta(stored: StoredLog) {
  return { id: stored.id, cwd: stored.cwd, createdAt: stored.createdAt };
}

function parseLog(raw: string): StoredLog | undefined {
  const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return undefined;
  }
  const meta = JSON.parse(lines[0] ?? "") as { id?: string; cwd?: string; createdAt?: string };
  if (!meta.id || !meta.cwd || !meta.createdAt) {
    return undefined;
  }
  const records: SessionRecord[] = [];
  for (const line of lines.slice(1)) {
    records.push(JSON.parse(line) as SessionRecord);
  }
  return { id: meta.id, cwd: meta.cwd, createdAt: meta.createdAt, records };
}

function scan(dir: string): { id: string; cwd: string; updatedAt: string }[] {
  if (!existsSync(dir)) {
    return [];
  }
  const items: { id: string; cwd: string; updatedAt: string }[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".jsonl")) {
      continue;
    }
    const stored = parseLog(readFileSync(resolve(dir, name), "utf8"));
    if (!stored) {
      continue;
    }
    items.push(summary(stored));
  }
  return items;
}

function summaries(logs: Iterable<StoredLog>): { id: string; cwd: string; updatedAt: string }[] {
  return [...logs].map(summary);
}

function summary(stored: StoredLog): { id: string; cwd: string; updatedAt: string } {
  return {
    id: stored.id,
    cwd: stored.cwd,
    updatedAt: stored.records.at(-1)?.timestamp ?? stored.createdAt,
  };
}

function newest(
  items: readonly { id: string; cwd: string; updatedAt: string }[],
  cwd: string,
): { id: string; cwd: string; updatedAt: string } | undefined {
  return items
    .filter((item) => item.cwd === cwd)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))[0];
}
