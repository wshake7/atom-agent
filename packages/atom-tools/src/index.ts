import type { ResolvedPluginModule } from "atom-kernel";
import { createTools } from "./create-tools.ts";
import type { ToolsPluginOptions } from "./create-tools.ts";

export type { ToolsPluginOptions };

export function createToolsPlugin(options: ToolsPluginOptions = {}): ResolvedPluginModule {
  return {
    id: "atom-tools",
    apply(ctx) {
      ctx.provide("tools", createTools(options));
    },
  };
}

export const plugin = createToolsPlugin();
