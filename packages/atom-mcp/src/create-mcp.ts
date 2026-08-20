import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface McpStdioServer {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
}

export interface McpPluginOptions {
  readonly servers?: readonly McpStdioServer[];
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

export async function connectMcpTools(servers: readonly McpStdioServer[]): Promise<{
  tools: Tool[];
  close: () => Promise<void>;
}> {
  const clients: Client[] = [];
  try {
    const tools: Tool[] = [];
    for (const server of servers) {
      const client = await connectServer(server);
      clients.push(client);
      tools.push(...(await listServerTools(client)));
    }
    return {
      tools,
      close: () => closeClients(clients),
    };
  } catch (error) {
    await closeClients(clients);
    throw error;
  }
}

async function connectServer(server: McpStdioServer): Promise<Client> {
  const transport = new StdioClientTransport({
    command: server.command,
    args: server.args ? [...server.args] : undefined,
    env: server.env ? { ...server.env } : undefined,
    stderr: "pipe",
  });
  const client = new Client({ name: "atom-mcp", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

async function listServerTools(client: Client): Promise<Tool[]> {
  const tools: Tool[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listTools(cursor ? { cursor } : undefined);
    for (const tool of page.tools) {
      tools.push({
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
        execute(args, signal) {
          return callServerTool(client, tool.name, args, signal);
        },
      });
    }
    cursor = typeof page.nextCursor === "string" ? page.nextCursor : undefined;
  } while (cursor);
  return tools;
}

async function callServerTool(
  client: Client,
  name: string,
  args: unknown,
  signal?: AbortSignal,
): Promise<string> {
  const result = await client.callTool({ name, arguments: asArgs(args) }, undefined, { signal });
  const content = stringifyToolResult(result);
  if ("isError" in result && result.isError) {
    throw new Error(content);
  }
  return content;
}

function asArgs(args: unknown): Record<string, unknown> {
  if (args && typeof args === "object" && !Array.isArray(args)) {
    return args as Record<string, unknown>;
  }
  throw new Error("参数必须是对象");
}

function stringifyToolResult(result: unknown): string {
  if (!result || typeof result !== "object") {
    return String(result);
  }
  const record = result as {
    content?: unknown;
    isError?: boolean;
  };
  if (!Array.isArray(record.content)) {
    return JSON.stringify(result);
  }
  const texts = record.content.flatMap((block) => {
    if (
      block &&
      typeof block === "object" &&
      "type" in block &&
      block.type === "text" &&
      "text" in block
    ) {
      return typeof block.text === "string" ? [block.text] : [];
    }
    return [];
  });
  return texts.join("\n");
}

async function closeClients(clients: readonly Client[]): Promise<void> {
  await Promise.all(
    clients.map(async (client) => {
      try {
        await client.close();
      } catch {
        // 卸载时个别 client 已断开则忽略
      }
    }),
  );
}
