import type { McpRuntime } from "atom-mcp";
import type { McpListing, SkillListing } from "./config.ts";

const EMPTY_DESC = "（无）";

export function renderSkills(items: readonly SkillListing[]): string[] {
  if (items.length === 0) {
    return ["（无 Skill）"];
  }
  return items.map((item) =>
    [item.name, cell(item.description), item.status, item.level, item.address].join("\t"),
  );
}

export function renderMcps(
  items: readonly McpListing[],
  runtime: McpRuntime | undefined,
): string[] {
  if (items.length === 0) {
    return ["（无 MCP）"];
  }
  const live = new Map((runtime?.servers ?? []).map((server) => [server.name, server]));
  const lines: string[] = [];
  for (const item of items) {
    const snapshot = live.get(item.name);
    lines.push(
      [
        item.name,
        cell(item.description ?? snapshot?.description),
        item.status,
        item.level,
        item.address,
      ].join("\t"),
    );
    if (item.status !== "connected") {
      continue;
    }
    const tools = snapshot?.tools ?? [];
    if (tools.length === 0) {
      lines.push("\t（无工具）");
      continue;
    }
    for (const tool of tools) {
      lines.push(`\t${tool.name}\t${cell(tool.description)}`);
    }
  }
  return lines;
}

function cell(value: string | undefined): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : EMPTY_DESC;
}
