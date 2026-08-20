import { expect, test } from "vite-plus/test";
import { parseArgv } from "../src/index.ts";

test("无参数时默认开工具包、关 MCP 桥", () => {
  expect(parseArgv([])).toEqual({ tools: true, mcpServers: [] });
});

test("--no-tools 关掉默认工具包", () => {
  expect(parseArgv(["--no-tools"])).toEqual({ tools: false, mcpServers: [] });
});

test("--mcp 打开桥并收下 command 与后续参数", () => {
  expect(parseArgv(["--mcp", "node", "server.mjs", "--flag"])).toEqual({
    tools: true,
    mcpServers: [{ command: "node", args: ["server.mjs", "--flag"] }],
  });
});

test("--no-tools 可与 --mcp 组合", () => {
  expect(parseArgv(["--no-tools", "--mcp", "node", "echo.mjs"])).toEqual({
    tools: false,
    mcpServers: [{ command: "node", args: ["echo.mjs"] }],
  });
});

test("未知参数报错", () => {
  expect(() => parseArgv(["--tui"])).toThrow("未知参数: --tui");
});

test("跳过参数分隔符 --", () => {
  expect(parseArgv(["--", "--no-tools"])).toEqual({ tools: false, mcpServers: [] });
});
