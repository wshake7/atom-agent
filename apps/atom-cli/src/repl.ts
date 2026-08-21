import type { LoadedPlugin, ResolvedPluginModule } from "atom-kernel";
import { createPluginHost } from "atom-kernel";
import { LOOP_EVENTS } from "atom-loop";
import type { AssistantDeltaPayload, Loop, ToolCallPayload, ToolEndPayload } from "atom-loop";
import type { Session } from "atom-session";
import type { SkillEntry } from "atom-skill";
import type { LlmCredentials } from "./assemble.ts";
import { patchUserModel, readUserModelFields } from "./config.ts";
import { parseModelSlash, parseSlash, SLASH_HELP } from "./slash.ts";

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";
const HISTORY_UP = "\x1b[A";

export interface LineReader {
  readonly readLine: () => Promise<string | undefined>;
  readonly cancel: () => void;
  readonly close: () => void;
}

export interface ReplInterrupt {
  on(event: "SIGINT", listener: () => void): unknown;
  off(event: "SIGINT", listener: () => void): unknown;
}

export function createLineReader(
  stdin: NodeJS.ReadableStream,
  options: { stdout?: { write(chunk: string): unknown } } = {},
): LineReader {
  let buffer = "";
  let closed = false;
  const pending: string[] = [];
  const waiters: ((line: string | undefined) => void)[] = [];
  const tty = "isTTY" in stdin && stdin.isTTY === true;
  if (tty) {
    options.stdout?.write("\x1b[?2004h");
  }

  const flush = () => {
    while (true) {
      const next = extractSubmission(buffer, closed);
      if (next.kind === "need-more") {
        return;
      }
      buffer = next.rest;
      if (next.kind === "end") {
        while (waiters.length > 0) {
          waiters.shift()?.(undefined);
        }
        return;
      }
      const waiter = waiters.shift();
      if (waiter) {
        waiter(next.value);
      } else {
        pending.push(next.value);
      }
    }
  };

  const onData = (chunk: string | Buffer) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    flush();
  };
  const onEnd = () => {
    if (closed) {
      return;
    }
    closed = true;
    flush();
    while (waiters.length > 0) {
      waiters.shift()?.(undefined);
    }
  };

  stdin.on("data", onData);
  stdin.once("end", onEnd);
  stdin.once("close", onEnd);
  if ("resume" in stdin && typeof stdin.resume === "function") {
    stdin.resume();
  }

  return {
    readLine: () => {
      if (pending.length > 0) {
        return Promise.resolve(pending.shift());
      }
      if (closed) {
        return Promise.resolve(undefined);
      }
      return new Promise((resolve) => {
        waiters.push(resolve);
      });
    },
    cancel: () => {
      buffer = "";
      const waiter = waiters.shift();
      if (waiter) {
        waiter("");
      }
    },
    close: () => {
      stdin.off("data", onData);
      stdin.off("end", onEnd);
      stdin.off("close", onEnd);
      if (tty) {
        options.stdout?.write("\x1b[?2004l");
      }
      closed = true;
      while (waiters.length > 0) {
        waiters.shift()?.(undefined);
      }
    },
  };
}

function extractSubmission(
  source: string,
  closed: boolean,
):
  | { kind: "need-more"; rest: string }
  | { kind: "end"; rest: string }
  | { kind: "value"; value: string; rest: string } {
  const pasteAt = source.indexOf(PASTE_START);
  const nl = indexOfNewline(source);
  if (pasteAt >= 0 && (nl < 0 || pasteAt <= nl)) {
    const endAt = source.indexOf(PASTE_END, pasteAt + PASTE_START.length);
    if (endAt < 0) {
      if (closed) {
        return { kind: "end", rest: "" };
      }
      return { kind: "need-more", rest: source };
    }
    const value = normalizeNewlines(source.slice(pasteAt + PASTE_START.length, endAt));
    return {
      kind: "value",
      value,
      rest: skipFollowingNewline(source.slice(endAt + PASTE_END.length)),
    };
  }
  if (nl >= 0) {
    return {
      kind: "value",
      value: stripCr(source.slice(0, nl)),
      rest: source.slice(nl + 1),
    };
  }
  if (!closed) {
    return { kind: "need-more", rest: source };
  }
  if (source.length === 0) {
    return { kind: "end", rest: "" };
  }
  return { kind: "value", value: stripCr(source), rest: "" };
}

function indexOfNewline(source: string): number {
  return source.indexOf("\n");
}

function stripCr(value: string): string {
  return value.endsWith("\r") ? value.slice(0, -1) : value;
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function skipFollowingNewline(value: string): string {
  if (value.startsWith("\r\n")) {
    return value.slice(2);
  }
  if (value.startsWith("\n") || value.startsWith("\r")) {
    return value.slice(1);
  }
  return value;
}

export async function runRepl(options: {
  readonly plugins: readonly ResolvedPluginModule[];
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: { write(chunk: string): unknown };
  readonly readLine?: () => Promise<string | undefined>;
  readonly cancelInput?: () => void;
  readonly prompt?: string;
  readonly skills?: readonly SkillEntry[];
  readonly llm?: LlmCredentials;
  readonly userRoot?: string;
  readonly cwd?: string;
  readonly interrupt?: ReplInterrupt;
}): Promise<void> {
  const host = createPluginHost();
  const loaded: LoadedPlugin[] = [];
  for (const module of options.plugins) {
    loaded.push(await host.load(module));
  }
  let loop = host.context.get("loop") as Loop | undefined;
  if (!loop) {
    throw new Error("loop 槽为空");
  }

  host.events.subscribe(LOOP_EVENTS.assistantDelta, (payload) => {
    const delta = payload as AssistantDeltaPayload;
    if (delta.type === "text" || delta.type === "thinking") {
      options.stdout.write(delta.text);
    }
  });
  host.events.subscribe(LOOP_EVENTS.toolStart, (payload) => {
    const tool = payload as ToolCallPayload;
    const args = tool.arguments === undefined ? "" : ` ${JSON.stringify(tool.arguments)}`;
    options.stdout.write(`[工具开始] ${tool.name}${args}\n`);
  });
  host.events.subscribe(LOOP_EVENTS.toolEnd, (payload) => {
    const tool = payload as ToolEndPayload;
    options.stdout.write(`[工具结束] ${tool.name}\n`);
  });
  host.events.subscribe(LOOP_EVENTS.turnEnd, () => {
    options.stdout.write("\n");
  });

  const owned = options.readLine
    ? undefined
    : createLineReader(options.stdin, { stdout: options.stdout });
  const readLine = options.readLine ?? (() => owned?.readLine() ?? Promise.resolve(undefined));
  const cancelInput = options.cancelInput ?? (() => owned?.cancel());
  const history: string[] = [];
  const cwd = options.cwd ?? process.cwd();
  let turnAbort: AbortController | undefined;

  const onInterrupt = () => {
    if (turnAbort && !turnAbort.signal.aborted) {
      turnAbort.abort();
      return;
    }
    cancelInput();
  };
  options.interrupt?.on("SIGINT", onInterrupt);

  const remountLoop = async () => {
    const index = loaded.findIndex((plugin) => plugin.id === "atom-loop");
    const module = options.plugins.find((plugin) => plugin.id === "atom-loop");
    if (index < 0 || !module) {
      return;
    }
    await loaded[index]?.unload();
    loaded[index] = await host.load(module);
    loop = host.context.get("loop") as Loop;
  };

  const write = (text: string) => {
    options.stdout.write(text);
  };

  try {
    while (true) {
      if (options.prompt) {
        write(options.prompt);
      }
      const raw = await readLine();
      if (raw === undefined) {
        return;
      }
      let submitted = raw === HISTORY_UP ? history.at(-1) : raw;
      if (submitted === undefined) {
        continue;
      }
      const text = submitted.trim();
      if (text === "") {
        continue;
      }
      history.push(text);
      const slash = parseSlash(text);
      if (slash) {
        const outcome = await handleSlash({
          slash,
          write,
          hostSession: () => host.context.get("session") as Session | undefined,
          remountLoop: async () => {
            await remountLoop();
            loop = host.context.get("loop") as Loop;
          },
          cwd,
          skills: options.skills ?? [],
          llm: options.llm,
          userRoot: options.userRoot,
        });
        if (outcome === "exit") {
          return;
        }
        if (outcome === "handled") {
          continue;
        }
        submitted = outcome.prompt;
      }
      turnAbort = new AbortController();
      try {
        await loop.prompt(submitted, { signal: turnAbort.signal });
      } catch (error) {
        if (!isAbortError(error)) {
          throw error;
        }
      } finally {
        turnAbort = undefined;
      }
    }
  } finally {
    options.interrupt?.off("SIGINT", onInterrupt);
    owned?.close();
    for (const plugin of [...loaded].reverse()) {
      await plugin.unload();
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

async function handleSlash(input: {
  readonly slash: { command: string; rest: string };
  readonly write: (text: string) => void;
  readonly hostSession: () => Session | undefined;
  readonly remountLoop: () => Promise<void>;
  readonly cwd: string;
  readonly skills: readonly SkillEntry[];
  readonly llm?: LlmCredentials;
  readonly userRoot?: string;
}): Promise<"exit" | "handled" | { prompt: string }> {
  const { command, rest } = input.slash;
  switch (command) {
    case "exit":
      return "exit";
    case "help":
      for (const line of SLASH_HELP) {
        input.write(`${line}\n`);
      }
      return "handled";
    case "sessions": {
      const session = input.hostSession();
      if (!session) {
        input.write("session 槽为空\n");
        return "handled";
      }
      for (const item of session.list()) {
        input.write(`${item.id}\t${item.cwd}\t${item.updatedAt}\n`);
      }
      return "handled";
    }
    case "new": {
      const session = input.hostSession();
      if (!session) {
        input.write("session 槽为空\n");
        return "handled";
      }
      session.create(input.cwd);
      await input.remountLoop();
      return "handled";
    }
    case "resume": {
      const session = input.hostSession();
      if (!session) {
        input.write("session 槽为空\n");
        return "handled";
      }
      try {
        const latest = session.latest(input.cwd);
        if (!latest) {
          input.write("没有当前工作目录的会话\n");
          return "handled";
        }
        await input.remountLoop();
      } catch (error) {
        input.write(`${error instanceof Error ? error.message : String(error)}\n`);
      }
      return "handled";
    }
    case "session": {
      if (!rest) {
        input.write("/session 需要 id\n");
        return "handled";
      }
      const session = input.hostSession();
      if (!session) {
        input.write("session 槽为空\n");
        return "handled";
      }
      try {
        session.open(rest);
        await input.remountLoop();
      } catch (error) {
        input.write(`${error instanceof Error ? error.message : String(error)}\n`);
      }
      return "handled";
    }
    case "skill": {
      const name = rest.split(/\s+/, 1)[0] ?? "";
      const remainder = name.length === 0 ? "" : rest.slice(name.length).trim();
      if (!name) {
        input.write("/skill 需要 name\n");
        return "handled";
      }
      const entry = input.skills.find((skill) => skill.name === name);
      if (!entry) {
        input.write(`未知 Skill: ${name}\n`);
        return "handled";
      }
      const prompt = remainder.length > 0 ? `${entry.body}\n${remainder}` : entry.body;
      return { prompt };
    }
    case "model":
      return handleModelSlash(input, rest);
    default:
      input.write(`未知命令: /${command || rest}\n`);
      return "handled";
  }
}

function handleModelSlash(
  input: {
    readonly write: (text: string) => void;
    readonly llm?: LlmCredentials;
    readonly userRoot?: string;
  },
  rest: string,
): "handled" {
  if (!input.llm || !input.userRoot) {
    input.write("无法切换模型\n");
    return "handled";
  }
  const parsed = parseModelSlash(rest);
  if (!parsed.ok) {
    input.write(`${parsed.error}\n`);
    return "handled";
  }
  if (!parsed.id && !parsed.force && !parsed.unforce) {
    const fields = readUserModelFields(input.userRoot);
    input.write(`当前: ${input.llm.model}\n`);
    input.write(`default: ${fields.default ?? "（无）"}\n`);
    input.write(`forceDefault: ${fields.forceDefault ?? "（无）"}\n`);
    return "handled";
  }
  if (parsed.unforce) {
    patchUserModel(input.userRoot, { forceDefault: null });
    return "handled";
  }
  if (parsed.id) {
    input.llm.model = parsed.id;
    patchUserModel(input.userRoot, {
      default: parsed.id,
      forceDefault: parsed.force ? parsed.id : undefined,
    });
    return "handled";
  }
  patchUserModel(input.userRoot, { forceDefault: input.llm.model });
  return "handled";
}
