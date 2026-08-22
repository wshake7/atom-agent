import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { scanSkillRecords } from "atom-skill";
import { projectChain, skillSearchRoots, userRoot } from "./config.ts";

const IDENTITY =
  "You are atom, a coding agent. You help by reading files, running commands, and editing or writing code.";

const GUIDELINES = `Guidelines:
- Prefer dedicated file tools over bash cat/sed/ls when those tools are available.
- Read existing files before editing. Use write only for new files or complete rewrites.
- Show file paths clearly when working with files.
- Be concise.`;

export interface PromptAgentFile {
  readonly path: string;
  readonly body: string;
}

export interface PromptFileBundle {
  readonly system: string | undefined;
  readonly appends: readonly string[];
  readonly agents: readonly PromptAgentFile[];
}

export interface PromptTool {
  readonly name: string;
  readonly description?: string;
}

export interface PromptSkill {
  readonly name: string;
  readonly description: string;
  readonly location: string;
}

export function loadPromptFiles(input: {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly systemPrompt?: string;
  readonly appendSystemPrompts?: readonly string[];
  readonly warn?: (message: string) => void;
}): PromptFileBundle {
  const cwd = resolve(input.cwd);
  const warn = input.warn ?? console.warn;
  const home = userRoot(input.env);
  const chain = projectChain(cwd);
  const atomDirs = chain.map((dir) => join(dir, ".atom-agent"));
  const seen = new Set<string>();

  let system: string | undefined;
  if (input.systemPrompt !== undefined) {
    system = resolvePromptArg(input.systemPrompt, cwd, "--system-prompt");
  } else {
    for (const dir of [...atomDirs].reverse()) {
      const text = readOptionalFile(join(dir, "SYSTEM.md"), seen, warn, "系统提示文件");
      if (text !== undefined) {
        system = text;
        break;
      }
    }
    if (system === undefined) {
      system = readOptionalFile(join(home, "SYSTEM.md"), seen, warn, "系统提示文件");
    }
  }

  const appends: string[] = [];
  if (input.appendSystemPrompts !== undefined) {
    for (const raw of input.appendSystemPrompts) {
      const text = resolvePromptArg(raw, cwd, "--append-system-prompt");
      if (text.length > 0) {
        appends.push(text);
      }
    }
  } else {
    for (const dir of [home, ...atomDirs]) {
      const text = readOptionalFile(join(dir, "APPEND_SYSTEM.md"), seen, warn, "系统提示文件");
      if (typeof text === "string" && text.length > 0) {
        appends.push(text);
      }
    }
  }

  const agents: PromptAgentFile[] = [];
  for (const path of [join(home, "AGENTS.md"), ...chain.map((dir) => join(dir, "AGENTS.md"))]) {
    const text = readOptionalFile(path, seen, warn, "AGENTS.md");
    if (typeof text === "string" && text.length > 0) {
      agents.push({ path: resolve(path), body: text });
    }
  }

  return { system, appends, agents };
}

export function livePromptSkills(cwd: string, env: NodeJS.ProcessEnv): PromptSkill[] {
  const byName = new Map<string, PromptSkill>();
  for (const item of scanSkillRecords(skillSearchRoots(cwd, env))) {
    byName.set(item.name, {
      name: item.name,
      description: item.description,
      location: dirname(item.file),
    });
  }
  return [...byName.values()];
}

export function composeSystemPrompt(input: {
  readonly files: PromptFileBundle;
  readonly tools: readonly PromptTool[];
  readonly skills: readonly PromptSkill[];
  readonly cwd: string;
}): string {
  const sections: string[] = [];
  const base = input.files.system === undefined ? defaultTemplate(input.tools) : input.files.system;
  if (base.length > 0) {
    sections.push(base);
  }
  for (const append of input.files.appends) {
    if (append.length > 0) {
      sections.push(append);
    }
  }
  for (const agent of input.files.agents) {
    if (agent.body.length > 0) {
      sections.push(`AGENTS.md (${posixPath(agent.path)}):\n${agent.body}`);
    }
  }
  const skills = skillCatalogSection(input.tools, input.skills);
  if (skills) {
    sections.push(skills);
  }
  sections.push(`Current working directory: ${posixPath(resolve(input.cwd))}`);
  return sections.join("\n\n");
}

function defaultTemplate(tools: readonly PromptTool[]): string {
  if (tools.length === 0) {
    return IDENTITY;
  }
  const lines = [
    "Available tools:",
    ...tools.map((tool) =>
      tool.description ? `- ${tool.name}: ${tool.description}` : `- ${tool.name}`,
    ),
  ];
  return [IDENTITY, lines.join("\n"), GUIDELINES].join("\n\n");
}

function skillCatalogSection(
  tools: readonly PromptTool[],
  skills: readonly PromptSkill[],
): string | undefined {
  if (!tools.some((tool) => tool.name === "skill") || skills.length === 0) {
    return undefined;
  }
  const items = skills
    .map(
      (skill) => `  <skill>
    <name>${escapeXml(skill.name)}</name>
    <description>${escapeXml(skill.description)}</description>
    <location>${escapeXml(posixPath(skill.location))}</location>
  </skill>`,
    )
    .join("\n");
  return `The following skills provide specialized instructions for specific tasks.
Use the skill tool to load a skill's file when the task matches its description.
When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md) and use that absolute path in tool commands.

<available_skills>
${items}
</available_skills>`;
}

function resolvePromptArg(raw: string, cwd: string, flag: string): string {
  if (raw.length === 0) {
    return "";
  }
  const path = resolve(cwd, raw);
  if (!existsSync(path)) {
    return raw;
  }
  let st;
  try {
    st = statSync(path);
  } catch (error) {
    throw new Error(`启动失败: ${flag} 无法读取: ${path}（${cause(error)}）`);
  }
  if (st.isDirectory()) {
    throw new Error(`启动失败: ${flag} 指向目录: ${path}`);
  }
  if (!st.isFile()) {
    throw new Error(`启动失败: ${flag} 不是普通文件: ${path}`);
  }
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`启动失败: ${flag} 无法读取: ${path}（${cause(error)}）`);
  }
}

function readOptionalFile(
  path: string,
  seen: Set<string>,
  warn: (message: string) => void,
  label: string,
): string | undefined {
  const absolute = resolve(path);
  if (seen.has(absolute)) {
    return undefined;
  }
  if (!existsSync(absolute)) {
    return undefined;
  }
  seen.add(absolute);
  try {
    const st = statSync(absolute);
    if (st.isDirectory()) {
      warn(`跳过${label}: ${absolute}（是目录）`);
      return undefined;
    }
    if (!st.isFile()) {
      warn(`跳过${label}: ${absolute}（不是普通文件）`);
      return undefined;
    }
    return readFileSync(absolute, "utf8");
  } catch (error) {
    warn(`跳过${label}: ${absolute}（${cause(error)}）`);
    return undefined;
  }
}

function posixPath(path: string): string {
  return path.split(sep).join("/");
}

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cause(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
