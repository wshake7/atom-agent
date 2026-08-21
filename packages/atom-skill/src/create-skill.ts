export interface SkillEntry {
  readonly name: string;
  readonly description: string;
  readonly body: string;
}

export type SkillCatalog = readonly SkillEntry[] | (() => readonly SkillEntry[]);

export interface SkillPluginOptions {
  readonly catalog?: SkillCatalog;
}

interface Tool {
  readonly name: string;
  readonly description?: string;
  readonly parameters?: unknown;
  execute(args: unknown, signal?: AbortSignal): Promise<string>;
}

export interface Tools {
  list(): readonly Tool[];
  register(tool: Tool): () => void;
}

export function createSkillTool(catalog: SkillCatalog = []): Tool {
  const load = () => (typeof catalog === "function" ? catalog() : catalog);
  return {
    name: "skill",
    get description() {
      return skillDescription(load());
    },
    parameters: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
    async execute(args) {
      const name = stringField(args, "name");
      const entry = load().find((item) => item.name === name);
      if (!entry) {
        throw new Error(`未知 Skill: ${name}`);
      }
      return entry.body;
    },
  };
}

export function createToolsRegistry(initial: readonly Tool[] = []): Tools {
  const tools = [...initial];
  return {
    list: () => tools,
    register(tool) {
      tools.push(tool);
      return () => {
        const index = tools.indexOf(tool);
        if (index >= 0) {
          tools.splice(index, 1);
        }
      };
    },
  };
}

function skillDescription(catalog: readonly SkillEntry[]): string {
  if (catalog.length === 0) {
    return "Load a skill's instructions by name. No skills are currently available.";
  }
  const listing = catalog.map((entry) => `${entry.name}: ${entry.description}`).join("; ");
  return `Load a skill's instructions by name. Available: ${listing}`;
}

function asRecord(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  throw new Error("参数必须是对象");
}

function stringField(args: unknown, key: string): string {
  const value = asRecord(args)[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`缺少 ${key}`);
  }
  return value;
}
