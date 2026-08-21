import { expect, test } from "vite-plus/test";
import { plugin } from "../src/index.ts";

test("会话插件是已解析同进程模块", () => {
  expect(plugin.id).toBe("atom-session");
});
