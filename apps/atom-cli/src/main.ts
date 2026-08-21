import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgv } from "./argv.ts";
import { assemble } from "./assemble.ts";
import { createLineReader, runRepl } from "./repl.ts";

export async function main(
  argv: readonly string[],
  stdin: NodeJS.ReadableStream = process.stdin,
  stdout: { write(chunk: string): unknown } = process.stdout,
  runtime: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<void> {
  const cwd = runtime.cwd ?? process.cwd();
  if (!runtime.env && existsSync(join(cwd, ".env"))) {
    process.loadEnvFile(join(cwd, ".env"));
  }
  const env = runtime.env ?? process.env;
  const interactive = stdin === process.stdin && process.stdin.isTTY === true;
  if (stdin === process.stdin && !interactive) {
    process.stderr.write(
      "stdin 不是交互终端。`vp run` 不会把键盘交给 REPL，进程会因 EOF 立刻退出。\n请在仓库根目录运行：just atom   或   node apps/atom-cli/src/cli.ts\n",
    );
  }
  const flags = parseArgv(argv);
  const lines = createLineReader(stdin);
  try {
    const assembly = assemble({
      argv,
      cwd,
      env,
      tools: flags.tools
        ? {
            cwd,
            ask: async (question) => {
              stdout.write(`[问] ${question}\n`);
              return (await lines.readLine()) ?? "";
            },
          }
        : false,
    });
    await runRepl({
      plugins: assembly.plugins,
      stdin,
      stdout,
      readLine: () => lines.readLine(),
      prompt: interactive ? "> " : undefined,
    });
  } finally {
    lines.close();
  }
}
