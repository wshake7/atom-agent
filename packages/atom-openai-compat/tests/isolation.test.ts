import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

const consumersForbidden = [
  "apps/atom-cli",
  "packages/atom-compact",
  "packages/atom-kernel",
  "packages/atom-loop",
  "packages/atom-mcp",
  "packages/atom-session",
  "packages/atom-skill",
  "packages/atom-tools",
];

function walkTs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") {
      continue;
    }
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      out.push(...walkTs(path));
      continue;
    }
    if (name.endsWith(".ts")) {
      out.push(path);
    }
  }
  return out;
}

test("循环 / CLI / 工具 / Skill / compact / session 不依赖、不 import 兼容库", () => {
  for (const relative of consumersForbidden) {
    const root = join(repoRoot, relative);
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["atom-openai-compat"]).toBeUndefined();
    expect(pkg.devDependencies?.["atom-openai-compat"]).toBeUndefined();
    for (const file of walkTs(root)) {
      expect(readFileSync(file, "utf8")).not.toMatch(/from ["']atom-openai-compat["']/);
    }
  }
});
