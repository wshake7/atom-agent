import type { McpStdioServer } from "atom-mcp";

export interface CliFlags {
  readonly tools: boolean;
  readonly mcpServers: readonly McpStdioServer[];
}

export function parseArgv(argv: readonly string[]): CliFlags {
  let tools = true;
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
    if (arg === "--mcp") {
      const command = argv[i + 1];
      if (!command) {
        throw new Error("--mcp 需要 command");
      }
      mcpServers.push({ command, args: argv.slice(i + 2) });
      return { tools, mcpServers };
    }
    throw new Error(`未知参数: ${arg}`);
  }
  return { tools, mcpServers };
}
