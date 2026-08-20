import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { glob, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { createInterface } from "node:readline";

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
}

export function createTools(options: ToolsPluginOptions = {}): Tools {
  const cwd = options.cwd ?? process.cwd();
  const tools: Tool[] = [
    {
      name: "read",
      description: "读取工作树中的文件内容",
      parameters: objectSchema({ path: { type: "string" } }, ["path"]),
      execute(args) {
        return readTool(cwd, stringField(args, "path"));
      },
    },
    {
      name: "write",
      description: "写入工作树中的文件，可创建新文件",
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
      description: "用唯一旧文本替换编辑已有文件",
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
      description: "在当前工作树下执行 shell 命令",
      parameters: objectSchema({ command: { type: "string" } }, ["command"]),
      execute(args, signal) {
        return bashTool(cwd, stringField(args, "command"), signal);
      },
    },
    {
      name: "grep",
      description: "按正则搜索工作树文件内容",
      parameters: objectSchema({ pattern: { type: "string" }, path: { type: "string" } }, [
        "pattern",
      ]),
      execute(args) {
        return grepTool(cwd, stringField(args, "pattern"), optionalString(args, "path"));
      },
    },
    {
      name: "glob",
      description: "按路径模式枚举工作树文件",
      parameters: objectSchema({ pattern: { type: "string" } }, ["pattern"]),
      execute(args) {
        return globTool(cwd, stringField(args, "pattern"));
      },
    },
    {
      name: "ASK",
      description: "向人提问并等待答复。不拦截 write 或 bash。",
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
  return { list: () => tools };
}

function objectSchema(properties: Record<string, { type: "string" }>, required: string[]): unknown {
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

async function grepTool(cwd: string, pattern: string, path?: string): Promise<string> {
  const regex = new RegExp(pattern);
  const start = path ? resolvePath(cwd, path) : cwd;
  const hits: string[] = [];
  for await (const file of glob("**/*", { cwd: start })) {
    const full = join(start, file);
    const rel = relative(cwd, full) || file;
    await collectMatches(full, rel, regex, hits);
  }
  return hits.join("\n") || "无匹配";
}

async function collectMatches(
  full: string,
  rel: string,
  regex: RegExp,
  hits: string[],
): Promise<void> {
  try {
    const stream = createReadStream(full, { encoding: "utf8" });
    const lines = createInterface({ input: stream });
    let lineNumber = 0;
    for await (const line of lines) {
      lineNumber += 1;
      if (regex.test(line)) {
        hits.push(`${rel}:${lineNumber}:${line}`);
      }
    }
  } catch {
    /* 跳过不可读文件 */
  }
}

async function globTool(cwd: string, pattern: string): Promise<string> {
  const files: string[] = [];
  for await (const file of glob(pattern, { cwd })) {
    files.push(file);
  }
  return files.join("\n") || "无匹配";
}
