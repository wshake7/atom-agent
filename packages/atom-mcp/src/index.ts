import type { ResolvedPluginModule } from "atom-kernel";
import { connectMcpTools, createToolsRegistry } from "./create-mcp.ts";
import type { McpPluginOptions, Tools } from "./create-mcp.ts";

export type {
  McpPluginOptions,
  McpRuntime,
  McpServerSnapshot,
  McpStdioServer,
  McpToolInfo,
} from "./create-mcp.ts";

export function createMcpPlugin(options: McpPluginOptions = {}): ResolvedPluginModule {
  return {
    id: "atom-mcp",
    async apply(ctx) {
      if (!options.servers?.length) {
        return;
      }
      const { tools, servers, close } = await connectMcpTools(options.servers);
      ctx.provide("mcp", { servers });
      const previous = ctx.get("tools") as Tools | undefined;
      if (!previous) {
        ctx.provide("tools", createToolsRegistry(tools));
        return () => close();
      }
      const disposers = tools.map((tool) => previous.register(tool));
      return async () => {
        for (const dispose of disposers) {
          dispose();
        }
        await close();
      };
    },
  };
}

export const plugin = createMcpPlugin();
