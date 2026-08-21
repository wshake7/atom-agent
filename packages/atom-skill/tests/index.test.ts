import { expect, test } from "vite-plus/test";
import { plugin } from "../src/index.ts";

test("Skill 加载器是已解析同进程模块", () => {
  expect(plugin.id).toBe("atom-skill");
});
