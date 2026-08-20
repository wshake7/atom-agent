import type { ResolvedPluginModule } from "atom-kernel";
import { createLoop } from "./create-loop.ts";
import type { Llm, Tools } from "./types.ts";

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
    ctx.provide(
      "loop",
      createLoop({
        emit(topic, payload) {
          ctx.emit(topic, payload);
        },
        getLlm: () => ctx.get("llm") as Llm,
        getTools: () => ctx.get("tools") as Tools,
      }),
    );
  },
} as const satisfies ResolvedPluginModule;
