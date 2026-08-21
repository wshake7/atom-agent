import type { ResolvedPluginModule } from "atom-kernel";
import { createLoop } from "./create-loop.ts";
import type { Compact, Llm, Message, ToolDefinition, Tools } from "./types.ts";

function resolveSystemPrompt(
  provided: unknown,
  input: { tools: readonly ToolDefinition[] },
): string | undefined {
  if (typeof provided === "function") {
    const resolved = (provided as (input: { tools: readonly ToolDefinition[] }) => unknown)(input);
    return typeof resolved === "string" && resolved.length > 0 ? resolved : undefined;
  }
  if (typeof provided === "string" && provided.length > 0) {
    return provided;
  }
  return undefined;
}

export {
  ContextOverflowError,
  isContextOverflowError,
  LOOP_EVENTS,
  type AssistantBlock,
  type AssistantDeltaPayload,
  type AssistantMessage,
  type Compact,
  type CompactReason,
  type CompactResult,
  type Llm,
  type LlmChunk,
  type LlmRequest,
  type Loop,
  type LoopEventName,
  type Message,
  type PromptOptions,
  type Tool,
  type ToolCallPayload,
  type ToolDefinition,
  type ToolEndPayload,
  type ToolResultMessage,
  type Tools,
  type UserMessage,
} from "./types.ts";

export const plugin = {
  id: "atom-loop",
  inject: ["llm", "tools"],
  apply(ctx) {
    const session = ctx.get("session") as
      | {
          current?: {
            messages?: readonly Message[];
            append?: (message: Message) => void;
            appendCompaction?: (event: { summary: string; cutIndex: number }) => void;
          };
        }
      | undefined;
    const log = session?.current;
    ctx.provide(
      "loop",
      createLoop({
        emit(topic, payload) {
          ctx.emit(topic, payload);
        },
        getLlm: () => ctx.get("llm") as Llm,
        getTools: () => ctx.get("tools") as Tools,
        getCompact: () => ctx.get("compact") as Compact | undefined,
        getSystemPrompt: (input) => resolveSystemPrompt(ctx.get("systemPrompt"), input),
        initialMessages: log?.messages,
        persist: log?.append ? (message) => log.append?.(message) : undefined,
        persistCompaction: log?.appendCompaction
          ? (event) => log.appendCompaction?.(event)
          : undefined,
      }),
    );
  },
} as const satisfies ResolvedPluginModule;
