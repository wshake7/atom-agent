import type { ResolvedPluginModule } from "atom-kernel";
import { createCompactPlugin } from "atom-compact";
import { createLlmPlugin } from "atom-llm";
import type { LlmPluginOptions } from "atom-llm";
import { plugin as loopPlugin } from "atom-loop";
import { createMcpPlugin } from "atom-mcp";
import type { McpPluginOptions, McpStdioServer } from "atom-mcp";
import { createSessionPlugin } from "atom-session";
import type { SessionPluginOptions } from "atom-session";
import { createSkillPlugin, scanSkillCatalog } from "atom-skill";
import type { SkillEntry } from "atom-skill";
import { createToolsPlugin } from "atom-tools";
import type { ToolsPluginOptions } from "atom-tools";
import { parseArgv } from "./argv.ts";
import { mergeCwdEnv, skillSearchRoots, stackConfig, userRoot } from "./config.ts";

export interface DefaultAssemblyOptions {
  readonly llm?: boolean | LlmPluginOptions;
  readonly tools?: boolean | ToolsPluginOptions;
  readonly mcpServers?: readonly McpStdioServer[];
  readonly toolAllow?: readonly string[];
  readonly toolDeny?: readonly string[];
  readonly skills?: readonly SkillEntry[];
  readonly session?: boolean | SessionPluginOptions;
}

export interface AssembleInput {
  readonly argv?: readonly string[];
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly tools?: boolean | ToolsPluginOptions;
}

export interface LlmCredentials {
  model: string;
  baseUrl: string;
  apiKey: string;
}

export interface Assembly {
  readonly plugins: readonly ResolvedPluginModule[];
  /** 本进程可变三标量；薄 llm 插件每次调用读当前值。 */
  readonly llm: LlmCredentials;
}

export function assemble(input: AssembleInput): Assembly {
  const flags = parseArgv(input.argv ?? []);
  const env = mergeCwdEnv(input.cwd, input.env ?? process.env);
  const stacked = stackConfig({ cwd: input.cwd, env, flags });
  const missing = [
    stacked.model ? undefined : "model",
    stacked.baseUrl ? undefined : "baseUrl",
    stacked.apiKey ? undefined : "apiKey",
  ].filter((key): key is string => key !== undefined);
  if (missing.length > 0 || !stacked.model || !stacked.baseUrl || !stacked.apiKey) {
    throw new Error(`启动失败: 缺少 ${missing.join("、")}`);
  }
  const llm = {
    model: stacked.model,
    baseUrl: stacked.baseUrl,
    apiKey: stacked.apiKey,
  };
  const tools =
    flags.tools === false || input.tools === false
      ? false
      : typeof input.tools === "object"
        ? input.tools
        : true;
  const start: SessionPluginOptions["start"] = flags.sessionId
    ? { id: flags.sessionId }
    : flags.resume
      ? "latest"
      : "new";
  return {
    llm,
    plugins: createDefaultPlugins({
      llm,
      tools,
      mcpServers: stacked.mcpServers,
      toolAllow: stacked.toolAllow,
      toolDeny: stacked.toolDeny,
      skills: scanSkillCatalog(skillSearchRoots(input.cwd, env)),
      session: {
        root: userRoot(env),
        cwd: input.cwd,
        start,
        stamp: () => ({ model: llm.model, provider: "atom-llm" }),
      },
    }),
  };
}

export function createDefaultPlugins(options: DefaultAssemblyOptions = {}): ResolvedPluginModule[] {
  const plugins: ResolvedPluginModule[] = [];
  if (options.llm !== false) {
    plugins.push(
      typeof options.llm === "object" ? createLlmPlugin(options.llm) : createLlmPlugin(),
    );
  }
  if (options.tools !== false) {
    plugins.push(
      typeof options.tools === "object" ? createToolsPlugin(options.tools) : createToolsPlugin(),
    );
  }
  plugins.push(createSkillPlugin({ catalog: options.skills ?? [] }));
  const mcp = createMcpPlugin(
    options.mcpServers?.length ? ({ servers: options.mcpServers } satisfies McpPluginOptions) : {},
  );
  plugins.push(applyAllowDeny(mcp, options.toolAllow, options.toolDeny));
  if (options.session !== false) {
    plugins.push(
      typeof options.session === "object"
        ? createSessionPlugin(options.session)
        : createSessionPlugin({ cwd: process.cwd() }),
    );
  }
  plugins.push(createCompactPlugin());
  plugins.push(loopPlugin);
  return plugins;
}

export const defaultPlugins: readonly ResolvedPluginModule[] = createDefaultPlugins();

function applyAllowDeny(
  module: ResolvedPluginModule,
  allow: readonly string[] | undefined,
  deny: readonly string[] | undefined,
): ResolvedPluginModule {
  if (!allow && !deny?.length) {
    return module;
  }
  const denySet = new Set(deny ?? []);
  return {
    id: module.id,
    async apply(ctx) {
      const dispose = await Promise.resolve(module.apply(ctx));
      const tools = ctx.get("tools") as { list(): { name: string }[] } | undefined;
      if (!tools) {
        return dispose;
      }
      const listed = tools.list();
      const keep = listed.filter((tool) => {
        if (denySet.has(tool.name)) {
          return false;
        }
        if (allow) {
          return allow.includes(tool.name);
        }
        return true;
      });
      listed.splice(0, listed.length, ...keep);
      return dispose;
    },
  };
}
