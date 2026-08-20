import type { ResolvedPluginModule } from "atom-kernel";

export const plugin = {
  id: "atom-tools",
  apply() {},
} as const satisfies ResolvedPluginModule;
