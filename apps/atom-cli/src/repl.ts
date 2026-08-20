import { createInterface } from "node:readline";
import { createPluginHost } from "atom-kernel";
import type { ResolvedPluginModule } from "atom-kernel";
import { LOOP_EVENTS } from "atom-loop";
import type { AssistantDeltaPayload, Loop, ToolCallPayload, ToolEndPayload } from "atom-loop";

export async function runRepl(options: {
  readonly plugins: readonly ResolvedPluginModule[];
  readonly stdin: NodeJS.ReadableStream;
  readonly stdout: { write(chunk: string): unknown };
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

  const rl = createInterface({ input: options.stdin });
  try {
    for await (const line of rl) {
      const text = line.trim();
      if (text === "") {
        continue;
      }
      await loop.prompt(text);
    }
  } finally {
    rl.close();
  }
}
