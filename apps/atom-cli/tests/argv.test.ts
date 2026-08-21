import { expect, test } from "vite-plus/test";
import { parseArgv } from "../src/index.ts";

test("无参数时默认开工具包、关 MCP 桥", () => {
  expect(parseArgv([])).toEqual({
    tools: true,
    mcpServers: [],
    model: undefined,
    baseUrl: undefined,
    apiKey: undefined,
    resume: false,
    sessions: false,
    sessionId: undefined,
    systemPrompt: undefined,
    appendSystemPrompts: undefined,
  });
});

test("--no-tools 关掉默认工具包", () => {
  expect(parseArgv(["--no-tools"])).toEqual({
    tools: false,
    mcpServers: [],
    model: undefined,
    baseUrl: undefined,
    apiKey: undefined,
    resume: false,
    sessions: false,
    sessionId: undefined,
    systemPrompt: undefined,
    appendSystemPrompts: undefined,
  });
});

test("--mcp 打开桥并收下 name、command 与后续参数", () => {
  expect(parseArgv(["--mcp", "echo", "node", "server.mjs", "--flag"])).toEqual({
    tools: true,
    mcpServers: [{ name: "echo", command: "node", args: ["server.mjs", "--flag"] }],
    model: undefined,
    baseUrl: undefined,
    apiKey: undefined,
    resume: false,
    sessions: false,
    sessionId: undefined,
    systemPrompt: undefined,
    appendSystemPrompts: undefined,
  });
});

test("--mcp 可重复，同名整条替换", () => {
  expect(parseArgv(["--mcp", "echo", "false", "--mcp", "echo", "node", "server.mjs"])).toEqual({
    tools: true,
    mcpServers: [{ name: "echo", command: "node", args: ["server.mjs"] }],
    model: undefined,
    baseUrl: undefined,
    apiKey: undefined,
    resume: false,
    sessions: false,
    sessionId: undefined,
    systemPrompt: undefined,
    appendSystemPrompts: undefined,
  });
});

test("--no-tools 可与 --mcp 组合，且 --model 仍可解析", () => {
  expect(parseArgv(["--no-tools", "--mcp", "echo", "node", "echo.mjs", "--model", "m"])).toEqual({
    tools: false,
    mcpServers: [{ name: "echo", command: "node", args: ["echo.mjs"] }],
    model: "m",
    baseUrl: undefined,
    apiKey: undefined,
    resume: false,
    sessions: false,
    sessionId: undefined,
    systemPrompt: undefined,
    appendSystemPrompts: undefined,
  });
});

test("--model / --base-url / --api-key 收下值", () => {
  expect(parseArgv(["--model", "m", "--base-url", "https://x", "--api-key", "k"])).toEqual({
    tools: true,
    mcpServers: [],
    model: "m",
    baseUrl: "https://x",
    apiKey: "k",
    resume: false,
    sessions: false,
    sessionId: undefined,
    systemPrompt: undefined,
    appendSystemPrompts: undefined,
  });
});

test("--resume / --session / --sessions 解析会话入口", () => {
  expect(parseArgv(["--resume"])).toMatchObject({
    resume: true,
    sessions: false,
    sessionId: undefined,
  });
  expect(parseArgv(["--session", "abc"])).toMatchObject({
    resume: false,
    sessions: false,
    sessionId: "abc",
  });
  expect(parseArgv(["--sessions"])).toMatchObject({
    resume: false,
    sessions: true,
    sessionId: undefined,
  });
  expect(() => parseArgv(["--resume", "--session", "abc"])).toThrow();
});

test("未知参数报错", () => {
  expect(() => parseArgv(["--tui"])).toThrow("未知参数: --tui");
});

test("跳过参数分隔符 --", () => {
  expect(parseArgv(["--", "--no-tools"])).toEqual({
    tools: false,
    mcpServers: [],
    model: undefined,
    baseUrl: undefined,
    apiKey: undefined,
    resume: false,
    sessions: false,
    sessionId: undefined,
    systemPrompt: undefined,
    appendSystemPrompts: undefined,
  });
});

test("--system-prompt 收下字面量或空串；--append-system-prompt 可重复", () => {
  expect(parseArgv(["--system-prompt", "You are atom."])).toMatchObject({
    systemPrompt: "You are atom.",
    appendSystemPrompts: undefined,
  });
  expect(parseArgv(["--system-prompt", ""])).toMatchObject({
    systemPrompt: "",
    appendSystemPrompts: undefined,
  });
  expect(
    parseArgv([
      "--append-system-prompt",
      "a",
      "--append-system-prompt",
      "",
      "--append-system-prompt",
      "b",
    ]),
  ).toMatchObject({
    systemPrompt: undefined,
    appendSystemPrompts: ["a", "", "b"],
  });
  expect(() => parseArgv(["--system-prompt"])).toThrow("--system-prompt 需要值");
});
