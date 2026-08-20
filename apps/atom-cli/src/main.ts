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
  const interactive = stdin === process.stdin && process.stdin.isTTY === true;
  if (stdin === process.stdin && !interactive) {
    process.stderr.write(
      "stdin 不是交互终端。`vp run` 不会把键盘交给 REPL，进程会因 EOF 立刻退出。\n请在仓库根目录运行：just atom   或   node apps/atom-cli/src/cli.ts\n",
    );
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
      prompt: interactive ? "> " : undefined,
    });
  } finally {
    lines.close();
  }
}
