import { expect, test } from "vite-plus/test";
import pkg from "../package.json" with { type: "json" };

test("兼容库不是插件、不依赖内核或槽", () => {
  expect(pkg.name).toBe("atom-openai-compat");
  expect("dependencies" in pkg).toBe(false);
});
