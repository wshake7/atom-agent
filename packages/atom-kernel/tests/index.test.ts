import { expect, test } from "vite-plus/test";

test("内核骨架可导入", async () => {
  const mod = await import("../src/index.ts");
  expect(mod).toBeTypeOf("object");
});
