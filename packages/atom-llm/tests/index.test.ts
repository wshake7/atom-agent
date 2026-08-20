import { expect, test } from "vite-plus/test";
import { plugin } from "../src/index.ts";

test("默认 llm 适配器是已解析同进程模块", () => {
  expect(plugin.id).toBe("atom-llm");
});
