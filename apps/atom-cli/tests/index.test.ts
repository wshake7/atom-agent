import { expect, test } from "vite-plus/test";
import { defaultPlugins } from "../src/index.ts";

test("默认装配引用四颗插件模块", () => {
  expect(defaultPlugins.map((plugin) => plugin.id)).toEqual([
    "atom-loop",
    "atom-llm",
    "atom-tools",
    "atom-mcp",
  ]);
});
