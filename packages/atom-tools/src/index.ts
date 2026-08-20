import type { ResolvedPluginModule } from "atom-kernel";
import { createTools } from "./create-tools.ts";
import type { Tools, ToolsPluginOptions } from "./create-tools.ts";

export type { ToolsPluginOptions };

export function createToolsPlugin(options: ToolsPluginOptions = {}): ResolvedPluginModule {
  return {
    id: "atom-tools",
    apply(ctx) {
      const ours = createTools(options);
      const existing = ctx.get("tools") as Tools | undefined;
      if (existing) {
        const disposers = ours.list().map((tool) => existing.register(tool));
        return () => {
          for (const dispose of disposers) {
            dispose();
          }
        };
      }
      ctx.provide("tools", ours);
    },
  };
}

export const plugin = createToolsPlugin();
