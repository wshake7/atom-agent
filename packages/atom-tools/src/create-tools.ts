import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";

export interface ToolsPluginOptions {
  readonly cwd?: string;
  readonly ask?: (question: string, signal?: AbortSignal) => Promise<string>;
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

export function createTools(options: ToolsPluginOptions = {}): Tools {
  const cwd = options.cwd ?? process.cwd();
  const tools: Tool[] = [
    {
      name: "read",
      description: "Read file contents",
      parameters: objectSchema({ path: { type: "string" } }, ["path"]),
      execute(args) {
        return readTool(cwd, stringField(args, "path"));
      },
    },
    {
      name: "write",
      description: "Create or overwrite files",
      parameters: objectSchema({ path: { type: "string" }, content: { type: "string" } }, [
        "path",
        "content",
      ]),
      execute(args) {
        return writeTool(cwd, stringField(args, "path"), stringField(args, "content", true));
      },
    },
    {
      name: "edit",
      description: "Make precise edits in existing files",
      parameters: objectSchema(
        {
          path: { type: "string" },
          oldString: { type: "string" },
          newString: { type: "string" },
        },
        ["path", "oldString", "newString"],
      ),
      execute(args) {
        return editTool(
          cwd,
          stringField(args, "path"),
          stringField(args, "oldString"),
          stringField(args, "newString", true),
        );
      },
    },
    {
      name: "bash",
      description: "Execute shell commands",
      parameters: objectSchema({ command: { type: "string" } }, ["command"]),
      execute(args, signal) {
        return bashTool(cwd, stringField(args, "command"), signal);
      },
    },
    {
      name: "rg",
      description: "Search file contents or list files by glob",
      parameters: objectSchema(
        {
          pattern: { type: "string" },
          path: { type: "string" },
          glob: { type: "string" },
          files: { type: "boolean" },
        },
        [],
      ),
      execute(args, signal) {
        return rgTool(
          cwd,
          {
            pattern: optionalString(args, "pattern"),
            path: optionalString(args, "path"),
            glob: optionalString(args, "glob"),
            files: optionalBoolean(args, "files"),
          },
          signal,
        );
      },
    },
    {
      name: "ask",
      description: "Ask the user a question and wait",
      parameters: objectSchema({ question: { type: "string" } }, ["question"]),
      async execute(args, signal) {
        const question = stringField(args, "question");
        if (!options.ask) {
          throw new Error("未配置问答");
        }
        return options.ask(question, signal);
      },
    },
  ];
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

function objectSchema(
  properties: Record<string, { type: "string" | "boolean" }>,
  required: string[],
): unknown {
  return { type: "object", properties, required };
}

function asRecord(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  throw new Error("参数必须是对象");
}

function stringField(args: unknown, key: string, allowEmpty = false): string {
  const value = asRecord(args)[key];
  if (typeof value !== "string" || (!allowEmpty && value.length === 0)) {
    throw new Error(`缺少 ${key}`);
  }
  return value;
}

function optionalString(args: unknown, key: string): string | undefined {
  const value = asRecord(args)[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${key} 必须是字符串`);
  }
  return value;
}

function optionalBoolean(args: unknown, key: string): boolean {
  const value = asRecord(args)[key];
  if (value === undefined) {
    return false;
  }
  if (typeof value !== "boolean") {
    throw new Error(`${key} 必须是布尔`);
  }
  return value;
}

function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : join(cwd, path);
}

async function readTool(cwd: string, path: string): Promise<string> {
  return readFile(resolvePath(cwd, path), "utf8");
}

async function writeTool(cwd: string, path: string, content: string): Promise<string> {
  const full = resolvePath(cwd, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
  return `已写入 ${path}`;
}

async function editTool(
  cwd: string,
  path: string,
  oldString: string,
  newString: string,
): Promise<string> {
  const full = resolvePath(cwd, path);
  const content = await readFile(full, "utf8");
  const parts = content.split(oldString);
  if (parts.length === 1) {
    throw new Error(`未找到要替换的文本: ${path}`);
  }
  if (parts.length > 2) {
    throw new Error(`旧文本在文件中不唯一: ${path}`);
  }
  await writeFile(full, parts.join(newString), "utf8");
  return `已编辑 ${path}`;
}

function bashTool(cwd: string, command: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, env: process.env, shell: true, signal });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      const output = [stdout, stderr, code ? `exit ${code}` : ""].filter(Boolean).join("\n");
      resolve(output || "(无输出)");
    });
  });
}

let rgPathPromise: Promise<string> | undefined;

function resolveRgPath(): Promise<string> {
  rgPathPromise ??= import("@vscode/ripgrep").then((module) => module.rgPath);
  return rgPathPromise;
}

async function rgTool(
  cwd: string,
  input: {
    readonly pattern?: string;
    readonly path?: string;
    readonly glob?: string;
    readonly files: boolean;
  },
  signal?: AbortSignal,
): Promise<string> {
  if (!input.files && !input.pattern) {
    throw new Error("缺少 pattern");
  }
  const args = ["--no-config", "--color", "never"];
  if (input.files) {
    args.push("--files");
  } else if (input.pattern) {
    args.push("--line-number", "--", input.pattern);
  }
  if (input.glob) {
    args.push("-g", input.glob);
  }
  args.push(input.path ?? ".");
  const rgPath = await resolveRgPath();
  return new Promise((resolve, reject) => {
    const child = spawn(rgPath, args, {
      cwd,
      env: process.env,
      signal,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error("未找到打包的 ripgrep"));
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trimEnd() || "(无输出)");
        return;
      }
      if (code === 1) {
        resolve(stdout.trimEnd() || "无匹配");
        return;
      }
      reject(new Error(stderr.trimEnd() || `rg 退出 ${code}`));
    });
  });
}
