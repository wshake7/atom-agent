import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

const kernelRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const kernelPkg = JSON.parse(readFileSync(join(kernelRoot, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
};

test("内核依赖官方 cordis（cordiverse）", () => {
  expect(kernelPkg.dependencies?.cordis).toBeTruthy();

  const require = createRequire(import.meta.url);
  const cordisPkgPath = require.resolve("cordis/package.json");
  const cordisPkg = JSON.parse(readFileSync(cordisPkgPath, "utf8")) as {
    name: string;
    repository?: { url?: string; directory?: string };
  };
  expect(cordisPkg.name).toBe("cordis");
  expect(cordisPkg.repository?.url).toMatch(/cordiverse\/cordis/);
});
