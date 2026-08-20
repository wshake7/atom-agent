import type { ResolvedPluginModule } from "atom-kernel";
import { createLlmPlugin } from "atom-llm";
import type { LlmPluginOptions } from "atom-llm";
import { plugin as loopPlugin } from "atom-loop";
import { createMcpPlugin } from "atom-mcp";
import type { McpPluginOptions, McpStdioServer } from "atom-mcp";
import { createToolsPlugin } from "atom-tools";
import type { ToolsPluginOptions } from "atom-tools";

export interface DefaultAssemblyOptions {
  readonly llm?: boolean | LlmPluginOptions;
  readonly tools?: boolean | ToolsPluginOptions;
  readonly mcpServers?: readonly McpStdioServer[];
}

const emptyToolsPlugin: ResolvedPluginModule = {
  id: "empty-tools",
  apply(ctx) {
    if (ctx.get("tools")) {
      return;
    }
    const tools: { name: string }[] = [];
    ctx.provide("tools", {
      list: () => tools,
      register(tool: { name: string }) {
        tools.push(tool);
        return () => {
          const index = tools.indexOf(tool);
          if (index >= 0) {
            tools.splice(index, 1);
          }
        };
      },
    });
  },
};

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
  } else if (!options.mcpServers?.length) {
    plugins.push(emptyToolsPlugin);
  }
  plugins.push(
    createMcpPlugin(
      options.mcpServers?.length
        ? ({ servers: options.mcpServers } satisfies McpPluginOptions)
        : {},
    ),
  );
  plugins.push(loopPlugin);
  return plugins;
}

export const defaultPlugins: readonly ResolvedPluginModule[] = createDefaultPlugins();
