import type { ResolvedPluginModule } from "atom-kernel";

export const plugin = {
  id: "atom-llm",
  apply() {},
} as const satisfies ResolvedPluginModule;
