import { expect, test } from "vite-plus/test";
import cliPkg from "../package.json" with { type: "json" };
import compactPkg from "atom-compact/package.json" with { type: "json" };
import kernelPkg from "atom-kernel/package.json" with { type: "json" };
import llmPkg from "atom-llm/package.json" with { type: "json" };
import loopPkg from "atom-loop/package.json" with { type: "json" };
import mcpPkg from "atom-mcp/package.json" with { type: "json" };
import sessionPkg from "atom-session/package.json" with { type: "json" };
import skillPkg from "atom-skill/package.json" with { type: "json" };
import toolsPkg from "atom-tools/package.json" with { type: "json" };

type PkgJson = {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function atomWorkspaceDeps(pkg: PkgJson): string[] {
  return Object.keys({
    ...pkg.dependencies,
    ...pkg.devDependencies,
  })
    .filter((name) => name.startsWith("atom-"))
    .sort();
}

test("工作区包名都以 atom- 为前缀", () => {
  for (const pkg of [
    kernelPkg,
    loopPkg,
    llmPkg,
    toolsPkg,
    mcpPkg,
    sessionPkg,
    skillPkg,
    compactPkg,
    cliPkg,
  ]) {
    expect(pkg.name.startsWith("atom-")).toBe(true);
  }
});

test("依赖方向：内核独立，插件只依赖内核，CLI 依赖内核与插件", () => {
  expect(atomWorkspaceDeps(kernelPkg)).toEqual([]);
  expect(atomWorkspaceDeps(loopPkg)).toEqual(["atom-kernel"]);
  expect(atomWorkspaceDeps(llmPkg)).toEqual(["atom-kernel"]);
  expect(atomWorkspaceDeps(toolsPkg)).toEqual(["atom-kernel"]);
  expect(atomWorkspaceDeps(mcpPkg)).toEqual(["atom-kernel"]);
  expect(atomWorkspaceDeps(sessionPkg)).toEqual(["atom-kernel"]);
  expect(atomWorkspaceDeps(skillPkg)).toEqual(["atom-kernel"]);
  expect(atomWorkspaceDeps(compactPkg)).toEqual(["atom-kernel"]);
  expect(atomWorkspaceDeps(cliPkg)).toEqual([
    "atom-compact",
    "atom-kernel",
    "atom-llm",
    "atom-loop",
    "atom-mcp",
    "atom-session",
    "atom-skill",
    "atom-tools",
  ]);
});
