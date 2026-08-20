import { createInterface } from "node:readline";
import { createPluginHost } from "atom-kernel";
import type { ResolvedPluginModule } from "atom-kernel";
import { LOOP_EVENTS } from "atom-loop";
import type { AssistantDeltaPayload, Loop, ToolCallPayload, ToolEndPayload } from "atom-loop";

export interface LineReader {
  readonly readLine: () => Promise<string | undefined>;
  readonly close: () => void;
}

export function createLineReader(stdin: NodeJS.ReadableStream): LineReader {
  const rl = createInterface({ input: stdin });
  const pending: string[] = [];
  const waiters: ((line: string | undefined) => void)[] = [];
  let closed = false;

  rl.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter) {
      waiter(line);
      return;
    }
    pending.push(line);
  });
  rl.once("close", () => {
    closed = true;
    while (waiters.length > 0) {
      waiters.shift()?.(undefined);
    }
  });

  const readLine = (): Promise<string | undefined> => {
    if (pending.length > 0) {
      return Promise.resolve(pending.shift());
    }
    if (closed) {
      return Promise.resolve(undefined);
    }
    return new Promise((resolve) => {
      waiters.push(resolve);
    });
  };

  return {
    readLine,
    close: () => {
      rl.close();
    },
  };
}

export async function runRepl(options: {
  readonly plugins: readonly ResolvedPluginModule[];
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: { write(chunk: string): unknown };
  readonly readLine?: () => Promise<string | undefined>;
  readonly prompt?: string;
}): Promise<void> {
  const host = createPluginHost();
  for (const module of options.plugins) {
    await host.load(module);
  }
  const loop = host.context.get("loop") as Loop | undefined;
  if (!loop) {
    throw new Error("loop 槽为空");
  }

  host.events.subscribe(LOOP_EVENTS.assistantDelta, (payload) => {
    const delta = payload as AssistantDeltaPayload;
    if (delta.type === "text") {
      options.stdout.write(delta.text);
    }
  });
  host.events.subscribe(LOOP_EVENTS.toolStart, (payload) => {
    const tool = payload as ToolCallPayload;
    options.stdout.write(`[工具开始] ${tool.name}\n`);
  });
  host.events.subscribe(LOOP_EVENTS.toolEnd, (payload) => {
    const tool = payload as ToolEndPayload;
    options.stdout.write(`[工具结束] ${tool.name}\n`);
  });
  host.events.subscribe(LOOP_EVENTS.turnEnd, () => {
    options.stdout.write("\n");
  });

  const owned = options.readLine ? undefined : createLineReader(options.stdin);
  const readLine = options.readLine ?? (() => owned?.readLine() ?? Promise.resolve(undefined));
  try {
    while (true) {
      if (options.prompt) {
        options.stdout.write(options.prompt);
      }
      const line = await readLine();
      if (line === undefined) {
        return;
      }
      const text = line.trim();
      if (text === "") {
        continue;
      }
      await loop.prompt(text);
    }
  } finally {
    owned?.close();
  }
}
