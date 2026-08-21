import type { ResolvedPluginModule } from "atom-kernel";
import { createCompact } from "./create-compact.ts";

export { createCompact } from "./create-compact.ts";
export type { Compact, CompactReason, CompactResult, Message } from "./types.ts";

export function createCompactPlugin(): ResolvedPluginModule {
  return {
    id: "atom-compact",
    apply(ctx) {
      ctx.provide("compact", createCompact());
    },
  };
}

export const plugin = createCompactPlugin();
