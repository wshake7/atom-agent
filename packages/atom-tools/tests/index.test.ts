import { expect, test } from "vite-plus/test";
import { plugin } from "../src/index.ts";

test("默认工具包是已解析同进程模块", () => {
  expect(plugin.id).toBe("atom-tools");
});
