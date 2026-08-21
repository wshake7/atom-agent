import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SkillEntry } from "./create-skill.ts";

export interface ScannedSkill extends SkillEntry {
  readonly root: string;
  readonly file: string;
}

export function scanSkillCatalog(
  roots: readonly string[],
  warn: (message: string) => void = console.warn,
): SkillEntry[] {
  const byName = new Map<string, SkillEntry>();
  for (const item of scanSkillRecords(roots, warn)) {
    byName.set(item.name, {
      name: item.name,
      description: item.description,
      body: item.body,
    });
  }
  return [...byName.values()];
}

export function scanSkillRecords(
  roots: readonly string[],
  warn: (message: string) => void = console.warn,
): ScannedSkill[] {
  const records: ScannedSkill[] = [];
  for (const root of roots) {
    if (!existsSync(root)) {
      continue;
    }
    let entries;
    try {
      entries = readdirSync(root, { withFileTypes: true });
    } catch (error) {
      warn(`跳过 Skill 根: ${root}（${cause(error)}）`);
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const dir = join(root, entry.name);
      const file = join(dir, "SKILL.md");
      if (!existsSync(file) || !statSync(file).isFile()) {
        warn(`跳过 Skill: ${dir}（缺少 SKILL.md）`);
        continue;
      }
      let text: string;
      try {
        text = readFileSync(file, "utf8");
      } catch (error) {
        warn(`跳过 Skill: ${file}（${cause(error)}）`);
        continue;
      }
      const parsed = parseSkillMarkdown(text);
      if (!parsed) {
        warn(`跳过 Skill: ${file}（缺少 description 或 YAML 头）`);
        continue;
      }
      records.push({
        name: entry.name,
        description: parsed.description,
        body: parsed.body,
        root,
        file,
      });
    }
  }
  return records;
}

function parseSkillMarkdown(text: string): { description: string; body: string } | undefined {
  const source = text.replace(/^\uFEFF/, "");
  const match = source.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) {
    return undefined;
  }
  const fields = parseFrontmatter(match[1] ?? "");
  const description = fields.description?.trim();
  if (!description) {
    return undefined;
  }
  return { description, body: source.slice(match[0].length).trim() };
}

function parseFrontmatter(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of block.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index <= 0) {
      continue;
    }
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }
  return fields;
}

function cause(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
