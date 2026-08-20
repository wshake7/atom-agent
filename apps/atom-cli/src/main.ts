import { existsSync } from "node:fs";
import { parseArgv } from "./argv.ts";
import { createDefaultPlugins } from "./assemble.ts";
import { createLineReader, runRepl } from "./repl.ts";

export async function main(
  argv: readonly string[],
  stdin: NodeJS.ReadableStream = process.stdin,
  stdout: { write(chunk: string): unknown } = process.stdout,
): Promise<void> {
  if (existsSync(".env")) {
    process.loadEnvFile();
  }
  const flags = parseArgv(argv);
  const lines = createLineReader(stdin);
  try {
    await runRepl({
      plugins: createDefaultPlugins({
        tools: flags.tools
          ? {
              ask: async (question) => {
                stdout.write(`[问] ${question}\n`);
                return (await lines.readLine()) ?? "";
              },
            }
          : false,
        mcpServers: flags.mcpServers,
      }),
      stdin,
      stdout,
      readLine: () => lines.readLine(),
    });
  } finally {
    lines.close();
  }
}
