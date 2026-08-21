import type { McpStdioServer } from "atom-mcp";

export interface CliFlags {
  readonly tools: boolean;
  readonly mcpServers: readonly McpStdioServer[];
  readonly model?: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly resume: boolean;
  readonly sessions: boolean;
  readonly sessionId?: string;
}

const ATOM_FLAGS = new Set([
  "--",
  "--no-tools",
  "--model",
  "--base-url",
  "--api-key",
  "--mcp",
  "--resume",
  "--session",
  "--sessions",
]);

export function parseArgv(argv: readonly string[]): CliFlags {
  let tools = true;
  let model: string | undefined;
  let baseUrl: string | undefined;
  let apiKey: string | undefined;
  let resume = false;
  let sessions = false;
  let sessionId: string | undefined;
  const mcpServers: McpStdioServer[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") {
      continue;
    }
    if (arg === "--no-tools") {
      tools = false;
      continue;
    }
    if (arg === "--resume") {
      resume = true;
      continue;
    }
    if (arg === "--sessions") {
      sessions = true;
      continue;
    }
    if (arg === "--session") {
      sessionId = takeValue(argv, i, "--session");
      i += 1;
      continue;
    }
    if (arg === "--model") {
      model = takeValue(argv, i, "--model");
      i += 1;
      continue;
    }
    if (arg === "--base-url") {
      baseUrl = takeValue(argv, i, "--base-url");
      i += 1;
      continue;
    }
    if (arg === "--api-key") {
      apiKey = takeValue(argv, i, "--api-key");
      i += 1;
      continue;
    }
    if (arg === "--mcp") {
      const parsed = takeMcp(argv, i);
      upsertMcp(mcpServers, parsed.server);
      i = parsed.end;
      continue;
    }
    throw new Error(`未知参数: ${arg}`);
  }
  if (resume && sessionId) {
    throw new Error("--resume 与 --session 不能同时使用");
  }
  return { tools, mcpServers, model, baseUrl, apiKey, resume, sessions, sessionId };
}

function takeValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || ATOM_FLAGS.has(value)) {
    throw new Error(`${flag} 需要值`);
  }
  return value;
}

function takeMcp(argv: readonly string[], index: number): { server: McpStdioServer; end: number } {
  const raw = argv[index + 1];
  if (!raw) {
    throw new Error("--mcp 需要 name 与 command");
  }
  if (raw.startsWith("{")) {
    return { server: parseMcpJson(raw), end: index + 1 };
  }
  const command = argv[index + 2];
  if (!command || ATOM_FLAGS.has(command)) {
    throw new Error("--mcp 需要 name 与 command");
  }
  const args: string[] = [];
  let end = index + 2;
  while (end + 1 < argv.length) {
    const next = argv[end + 1];
    if (next === undefined || ATOM_FLAGS.has(next)) {
      break;
    }
    args.push(next);
    end += 1;
  }
  return { server: { name: raw, command, args }, end };
}

function parseMcpJson(raw: string): McpStdioServer {
  let json: unknown;
  try {
    json = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("--mcp JSON 无法解析");
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("--mcp 需要 name 与 command");
  }
  const rec = json as Record<string, unknown>;
  const name = typeof rec.name === "string" ? rec.name : undefined;
  const command = typeof rec.command === "string" ? rec.command : undefined;
  if (!name || !command) {
    throw new Error("--mcp 需要 name 与 command");
  }
  const args = Array.isArray(rec.args) ? rec.args : undefined;
  if (args && args.some((item) => typeof item !== "string")) {
    throw new Error("--mcp args 必须是字符串数组");
  }
  const env =
    rec.env && typeof rec.env === "object" && !Array.isArray(rec.env)
      ? (rec.env as Record<string, string>)
      : undefined;
  return {
    name,
    command,
    args: args as string[] | undefined,
    env,
  };
}

function upsertMcp(servers: McpStdioServer[], server: McpStdioServer) {
  const name = server.name ?? server.command;
  const next = { ...server, name };
  const index = servers.findIndex((item) => (item.name ?? item.command) === name);
  if (index >= 0) {
    servers[index] = next;
    return;
  }
  servers.push(next);
}
