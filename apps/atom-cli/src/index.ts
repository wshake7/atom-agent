import type { ResolvedPluginModule } from "atom-kernel";
import { plugin as llmPlugin } from "atom-llm";
import { plugin as loopPlugin } from "atom-loop";
import { plugin as mcpPlugin } from "atom-mcp";
import { plugin as toolsPlugin } from "atom-tools";

export { runRepl } from "./repl.ts";

export const defaultPlugins: readonly ResolvedPluginModule[] = [
  loopPlugin,
  llmPlugin,
  toolsPlugin,
  mcpPlugin,
];
