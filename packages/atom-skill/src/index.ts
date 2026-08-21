import type { ResolvedPluginModule } from "atom-kernel";
import { createSkillTool, createToolsRegistry } from "./create-skill.ts";
import type { SkillPluginOptions, Tools } from "./create-skill.ts";

export type { SkillCatalog, SkillEntry, SkillPluginOptions } from "./create-skill.ts";
export { scanSkillCatalog, scanSkillRecords } from "./scan-skills.ts";
export type { ScannedSkill } from "./scan-skills.ts";

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
