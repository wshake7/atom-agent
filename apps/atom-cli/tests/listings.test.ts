import { expect, test } from "vite-plus/test";
import { renderMcps, renderSkills } from "../src/listings.ts";

test("无 Skill / 无 MCP 各一行", () => {
  expect(renderSkills([])).toEqual(["（无 Skill）"]);
  expect(renderMcps([], undefined)).toEqual(["（无 MCP）"]);
});

test("Skill 行含 name、desc、状态、级别、地址", () => {
  expect(
    renderSkills([
      {
        name: "review",
        description: "审查当前改动",
        status: "active",
        level: "user",
        address: "/home/skills/review/SKILL.md",
      },
    ]),
  ).toEqual(["review\t审查当前改动\tactive\tuser\t/home/skills/review/SKILL.md"]);
});

test("MCP 已连接列出工具；未连接不列工具", () => {
  const lines = renderMcps(
    [
      {
        name: "echo",
        description: "回显",
        status: "connected",
        level: "user",
        address: "/home/mcp.json",
      },
      {
        name: "off",
        status: "disabled",
        level: "project",
        address: "/repo/.atom-agent/mcp.json",
      },
    ],
    {
      servers: [
        {
          name: "echo",
          description: "回显",
          tools: [{ name: "echo", description: "原样返回 text" }],
        },
      ],
    },
  );
  expect(lines).toEqual([
    "echo\t回显\tconnected\tuser\t/home/mcp.json",
    "\techo\t原样返回 text",
    "off\t（无）\tdisabled\tproject\t/repo/.atom-agent/mcp.json",
  ]);
});
