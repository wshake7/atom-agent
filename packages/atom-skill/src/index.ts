import type { ResolvedPluginModule } from "atom-kernel";
import { createSkillTool, createToolsRegistry } from "./create-skill.ts";
import type { SkillPluginOptions, Tools } from "./create-skill.ts";

export type { SkillEntry, SkillPluginOptions } from "./create-skill.ts";
export { scanSkillCatalog } from "./scan-skills.ts";

export function createSkillPlugin(options: SkillPluginOptions = {}): ResolvedPluginModule {
  const tool = createSkillTool(options.catalog ?? []);
  return {
    id: "atom-skill",
    apply(ctx) {
      const previous = ctx.get("tools") as Tools | undefined;
      if (!previous) {
        ctx.provide("tools", createToolsRegistry([tool]));
        return;
      }
      return previous.register(tool);
    },
  };
}

export const plugin = createSkillPlugin();
