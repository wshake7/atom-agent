import type { ResolvedPluginModule } from "atom-kernel";
import { createLoop } from "./create-loop.ts";
import type { Llm, Message, Tools } from "./types.ts";

export {
  LOOP_EVENTS,
  type AssistantBlock,
  type AssistantDeltaPayload,
  type AssistantMessage,
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
    const log = (
      ctx.get("session") as
        | { current?: { messages?: readonly Message[]; append?: (message: Message) => void } }
        | undefined
    )?.current;
    ctx.provide(
      "loop",
      createLoop({
        emit(topic, payload) {
          ctx.emit(topic, payload);
        },
        getLlm: () => ctx.get("llm") as Llm,
        getTools: () => ctx.get("tools") as Tools,
        initialMessages: log?.messages,
        persist: log?.append ? (message) => log.append?.(message) : undefined,
      }),
    );
  },
} as const satisfies ResolvedPluginModule;
