import type { ResolvedPluginModule } from "atom-kernel";
import { createLlm } from "./create-llm.ts";
import type { LlmPluginOptions } from "./create-llm.ts";

export type { LlmPluginOptions };

export function createLlmPlugin(options: LlmPluginOptions = {}): ResolvedPluginModule {
  return {
    id: "atom-llm",
    apply(ctx) {
      ctx.provide("llm", createLlm(options));
    },
  };
}

export const plugin = createLlmPlugin();
