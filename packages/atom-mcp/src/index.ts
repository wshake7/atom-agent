import type { ResolvedPluginModule } from "atom-kernel";

export const plugin = {
  id: "atom-mcp",
  apply() {},
} as const satisfies ResolvedPluginModule;
