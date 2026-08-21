import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseEnv } from "node:util";
import type { McpStdioServer } from "atom-mcp";
import type { CliFlags } from "./argv.ts";

export interface StackedConfig {
  readonly model?: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly mcpServers: readonly McpStdioServer[];
  readonly toolAllow?: readonly string[];
  readonly toolDeny?: readonly string[];
}

interface SettingsLayer {
  readonly model?: string;
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly mcpEnable?: readonly string[];
  readonly mcpDisable?: readonly string[];
  readonly toolAllow?: readonly string[];
  readonly toolDeny?: readonly string[];
}

export function mergeCwdEnv(cwd: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...env };
  const envFile = join(cwd, ".env");
  if (!existsSync(envFile)) {
    return merged;
  }
  const parsed = parseEnv(readFileSync(envFile, "utf8"));
  for (const [key, value] of Object.entries(parsed)) {
    if (merged[key] === undefined && value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}

export function userRoot(env: NodeJS.ProcessEnv): string {
  const home = env.ATOM_AGENT_HOME;
  if (typeof home === "string" && home.length > 0) {
    return home;
  }
  return join(homedir(), ".atom-agent");
}

export function skillSearchRoots(cwd: string, env: NodeJS.ProcessEnv): string[] {
  const resolved = resolve(cwd);
  const gitRoot = findGitRoot(resolved);
  const dirs = projectDirs(resolved, gitRoot);
  return [join(userRoot(env), "skills"), ...dirs.map((dir) => join(dir, ".atom-agent", "skills"))];
}

export function stackConfig(input: {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly flags: CliFlags;
}): StackedConfig {
  const cwd = resolve(input.cwd);
  const gitRoot = findGitRoot(cwd);
  const dirs = projectDirs(cwd, gitRoot);
  const home = userRoot(input.env);

  const userSettings = readSettings(join(home, "settings.json"), "user");
  const projectSettings = dirs.map((dir) =>
    readSettings(join(dir, ".atom-agent", "settings.json"), "project"),
  );
  const localSettings = readSettings(join(cwd, ".atom-agent", "settings.local.json"), "local");

  const model = pickScalar([
    input.flags.model,
    input.env.ATOM_LLM_MODEL,
    localSettings.model,
    ...[...projectSettings].reverse().map((layer) => layer.model),
    userSettings.model,
  ]);
  const baseUrl = pickScalar([
    input.flags.baseUrl,
    input.env.ATOM_LLM_BASE_URL,
    localSettings.baseUrl,
    ...[...projectSettings].reverse().map((layer) => layer.baseUrl),
    userSettings.baseUrl,
  ]);
  const apiKey = pickScalar([
    input.flags.apiKey,
    input.env.ATOM_LLM_API_KEY,
    localSettings.apiKey,
    userSettings.apiKey,
  ]);

  const servers = new Map<string, McpStdioServer>();
  mergeServers(servers, readMcpSidecar(join(home, "mcp.json")));
  for (const dir of dirs) {
    mergeServers(servers, readProjectMcp(dir, gitRoot));
  }
  mergeServers(servers, readMcpSidecar(join(cwd, ".atom-agent", "mcp.local.json")));
  for (const server of input.flags.mcpServers) {
    const name = server.name ?? server.command;
    servers.set(name, { ...server, name });
  }

  const settingsLayers = [userSettings, ...projectSettings, localSettings];
  const mcpDisable = new Set<string>();
  let mcpEnable: readonly string[] | undefined;
  const toolDeny: string[] = [];
  let toolAllow: readonly string[] | undefined;
  for (const layer of settingsLayers) {
    for (const name of layer.mcpDisable ?? []) {
      mcpDisable.add(name);
    }
    if (layer.mcpEnable) {
      mcpEnable = layer.mcpEnable;
    }
    for (const name of layer.toolDeny ?? []) {
      if (!toolDeny.includes(name)) {
        toolDeny.push(name);
      }
    }
    if (layer.toolAllow) {
      toolAllow = layer.toolAllow;
    }
  }

  const connected = (mcpEnable ?? [...servers.keys()]).filter(
    (name) => servers.has(name) && !mcpDisable.has(name),
  );

  const mcpServers: McpStdioServer[] = [];
  for (const name of connected) {
    const server = servers.get(name);
    if (server) {
      mcpServers.push(server);
    }
  }

  return {
    model,
    baseUrl,
    apiKey,
    mcpServers,
    toolAllow,
    toolDeny,
  };
}

function pickScalar(values: readonly (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function findGitRoot(cwd: string): string | undefined {
  let dir = cwd;
  while (true) {
    if (existsSync(join(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

function projectDirs(cwd: string, gitRoot: string | undefined): string[] {
  if (!gitRoot) {
    return [cwd];
  }
  const rel = relative(gitRoot, cwd);
  if (!rel) {
    return [gitRoot];
  }
  const dirs = [gitRoot];
  let acc = gitRoot;
  for (const part of rel.split(sep)) {
    acc = join(acc, part);
    dirs.push(acc);
  }
  return dirs;
}

const missingJson = Symbol("missing-json");

function readJson(path: string): unknown {
  if (!existsSync(path)) {
    return missingJson;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    throw new Error(`配置无法解析: ${path}`);
  }
}

function readSettings(path: string, kind: "user" | "project" | "local"): SettingsLayer {
  const json = readJson(path);
  if (json === missingJson) {
    return {};
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error(`配置无效: ${path}`);
  }
  const rec = json as Record<string, unknown>;
  const mcp = asRecord(rec.mcp);
  const tools = asRecord(rec.tools);
  return {
    model: kind === "user" ? readUserModel(rec.model) : readString(rec.model),
    baseUrl: readString(rec.baseUrl),
    apiKey: kind === "project" ? undefined : readString(rec.apiKey),
    mcpEnable: optionalStringArray(mcp?.enable, `${path} mcp.enable`),
    mcpDisable: optionalStringArray(mcp?.disable, `${path} mcp.disable`),
    toolAllow: optionalStringArray(tools?.allow, `${path} tools.allow`),
    toolDeny: optionalStringArray(tools?.deny, `${path} tools.deny`),
  };
}

function readUserModel(raw: unknown): string | undefined {
  if (typeof raw === "string") {
    return readString(raw);
  }
  const rec = asRecord(raw);
  if (!rec) {
    return undefined;
  }
  return readString(rec.forceDefault) ?? readString(rec.default);
}

function readString(raw: unknown): string | undefined {
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

function asRecord(raw: unknown): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  return raw as Record<string, unknown>;
}

function optionalStringArray(raw: unknown, label: string): readonly string[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== "string")) {
    throw new Error(`配置无效: ${label} 必须是字符串数组`);
  }
  return raw as string[];
}

function readProjectMcp(dir: string, gitRoot: string | undefined): Record<string, McpStdioServer> {
  const sidecar = join(dir, ".atom-agent", "mcp.json");
  if (existsSync(sidecar)) {
    return readMcpSidecar(sidecar);
  }
  if (gitRoot && dir === gitRoot) {
    return readMcpSidecar(join(dir, ".mcp.json"));
  }
  return {};
}

function readMcpSidecar(path: string): Record<string, McpStdioServer> {
  const json = readJson(path);
  if (json === missingJson) {
    return {};
  }
  const rec = asRecord(json);
  if (!rec) {
    throw new Error(`配置无效: ${path}`);
  }
  const source = asRecord(rec.mcpServers) ?? rec;
  const servers: Record<string, McpStdioServer> = {};
  for (const [name, value] of Object.entries(source)) {
    if (name === "mcpServers") {
      continue;
    }
    const server = asRecord(value);
    const command = readString(server?.command);
    if (!server || !command) {
      throw new Error(`MCP 清单只支持 stdio（需要 command）: ${name}`);
    }
    servers[name] = {
      name,
      command,
      args: optionalStringArray(server.args, `${path} ${name}.args`) ?? undefined,
      env: optionalEnv(server.env, `${path} ${name}.env`),
    };
  }
  return servers;
}

function optionalEnv(raw: unknown, label: string): Readonly<Record<string, string>> | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const rec = asRecord(raw);
  if (!rec || Object.values(rec).some((value) => typeof value !== "string")) {
    throw new Error(`配置无效: ${label} 必须是字符串映射`);
  }
  return rec as Record<string, string>;
}

function mergeServers(
  target: Map<string, McpStdioServer>,
  incoming: Record<string, McpStdioServer>,
) {
  for (const [name, server] of Object.entries(incoming)) {
    target.set(name, server);
  }
}
