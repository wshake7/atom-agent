import { expect, test } from "vite-plus/test";
import cliPkg from "../package.json" with { type: "json" };
import { defaultPlugins } from "../src/index.ts";

test("一条命令指向默认装配入口", () => {
  expect(cliPkg.bin).toEqual({ atom: "./src/cli.ts" });
  expect(cliPkg.scripts?.start).toBe("node ./src/cli.ts");
});

test("默认装配引用四颗插件模块", () => {
  expect(defaultPlugins.map((plugin) => plugin.id)).toEqual([
    "atom-llm",
    "atom-tools",
    "atom-mcp",
    "atom-loop",
  ]);
});
