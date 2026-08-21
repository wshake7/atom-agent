import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createPluginHost } from "atom-kernel";
import type { ResolvedPluginModule } from "atom-kernel";
import type { Llm, LlmChunk, Loop, Message } from "atom-loop";
import { expect, test } from "vite-plus/test";
import { assemble } from "../src/index.ts";
import { composeSystemPrompt, loadPromptFiles } from "../src/system-prompt.ts";

const identity =
  "You are atom, a coding agent. You help by reading files, running commands, and editing or writing code.";

const guidelines = `Guidelines:
- Prefer dedicated file tools over bash cat/sed/ls when those tools are available.
- Read existing files before editing. Use write only for new files or complete rewrites.
- Show file paths clearly when working with files.
- Be concise.`;

async function openTree() {
  const root = await mkdtemp(join(tmpdir(), "atom-prompt-"));
  const home = join(root, "home");
  const repo = join(root, "repo");
  await mkdir(home, { recursive: true });
  await mkdir(join(repo, ".git"), { recursive: true });
  await mkdir(join(repo, "pkg"), { recursive: true });
  await writeFile(
    join(home, "settings.json"),
    `${JSON.stringify({ model: "m", baseUrl: "https://x", apiKey: "k" }, null, 2)}\n`,
  );
  return { root, home, repo, pkg: join(repo, "pkg"), env: { ATOM_AGENT_HOME: home } };
}

async function closeTree(root: string) {
  await rm(root, { recursive: true, force: true });
}

async function writeText(path: string, body: string) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, "utf8");
}

function fakeLlmPlugin(capture: {
  systemPrompt?: string;
  messages?: readonly Message[];
}): ResolvedPluginModule {
  const llm: Llm = {
    async *stream(request) {
      capture.systemPrompt = request.systemPrompt;
      capture.messages = request.messages.map((message) => message);
      const chunks: LlmChunk[] = [{ type: "text", text: "ok" }];
      yield* chunks;
    },
  };
  return {
    id: "atom-llm",
    apply(ctx) {
      ctx.provide("llm", llm);
    },
  };
}

test("无工具时默认模板只留身份，cwd 始终在最后", () => {
  const cwd = "/tmp/work";
  const text = composeSystemPrompt({
    files: { system: undefined, appends: [], agents: [] },
    tools: [],
    skills: [{ name: "review", description: "审", location: "/skills/review" }],
    cwd,
  });
  expect(text).toBe(`${identity}\n\nCurrent working directory: /tmp/work`);
  expect(text).not.toContain("Available tools:");
  expect(text).not.toContain("Guidelines:");
  expect(text).not.toContain("<available_skills>");
});

test("有工具时默认模板是身份、工具表、guidelines；MCP 无摘要", () => {
  const text = composeSystemPrompt({
    files: { system: undefined, appends: [], agents: [] },
    tools: [{ name: "read" }, { name: "mcp__foo__bar" }, { name: "skill" }],
    skills: [],
    cwd: "/tmp/work",
  });
  expect(text).toContain(identity);
  expect(text).toContain("- read: Read file contents");
  expect(text).toContain("- mcp__foo__bar\n");
  expect(text).not.toContain("- mcp__foo__bar:");
  expect(text).toContain(guidelines);
  expect(text.endsWith("Current working directory: /tmp/work")).toBe(true);
});

test("SYSTEM XOR 掉默认模板后不补工具名；Skill XML 仍在；空串清空默认", () => {
  const withSystem = composeSystemPrompt({
    files: { system: "custom", appends: ["tail"], agents: [] },
    tools: [{ name: "read" }, { name: "skill" }],
    skills: [{ name: "review", description: "a <b>", location: "/s/review" }],
    cwd: "/tmp/work",
  });
  expect(withSystem.startsWith("custom\n\ntail\n\n")).toBe(true);
  expect(withSystem).not.toContain(identity);
  expect(withSystem).not.toContain("Available tools:");
  expect(withSystem).toContain("<name>review</name>");
  expect(withSystem).toContain("<description>a &lt;b&gt;</description>");
  expect(withSystem).toContain("Use the skill tool to load a skill's file");

  const empty = composeSystemPrompt({
    files: { system: "", appends: [], agents: [] },
    tools: [{ name: "read" }],
    skills: [],
    cwd: "/tmp/work",
  });
  expect(empty).toBe("Current working directory: /tmp/work");
});

test("搜索根：SYSTEM 近处 XOR，APPEND 远到近全追加，AGENTS 裸文件同序", async () => {
  const tree = await openTree();
  const warnings: string[] = [];
  try {
    await writeText(join(tree.home, "SYSTEM.md"), "user-system");
    await writeText(join(tree.repo, ".atom-agent", "SYSTEM.md"), "root-system");
    await writeText(join(tree.pkg, ".atom-agent", "SYSTEM.md"), "pkg-system");
    await writeText(join(tree.home, "APPEND_SYSTEM.md"), "user-append");
    await writeText(join(tree.repo, ".atom-agent", "APPEND_SYSTEM.md"), "root-append");
    await writeText(join(tree.pkg, ".atom-agent", "APPEND_SYSTEM.md"), "pkg-append");
    await writeText(join(tree.home, "AGENTS.md"), "user-agents");
    await writeText(join(tree.repo, "AGENTS.md"), "root-agents");
    await writeText(join(tree.pkg, "AGENTS.md"), "pkg-agents");
    await writeText(join(tree.repo, "SYSTEM.md"), "bare-system");
    await writeText(join(tree.repo, "CLAUDE.md"), "claude");
    await writeText(join(tree.repo, ".atom-agent", "AGENTS.md"), "hidden-agents");

    const files = loadPromptFiles({
      cwd: tree.pkg,
      env: tree.env,
      warn: (message) => warnings.push(message),
    });
    expect(files.system).toBe("pkg-system");
    expect(files.appends).toEqual(["user-append", "root-append", "pkg-append"]);
    expect(files.agents.map((item) => item.body)).toEqual([
      "user-agents",
      "root-agents",
      "pkg-agents",
    ]);
    expect(files.agents.some((item) => item.body === "hidden-agents")).toBe(false);

    const composed = composeSystemPrompt({
      files,
      tools: [],
      skills: [],
      cwd: tree.pkg,
    });
    expect(composed).not.toContain("user-system");
    expect(composed).not.toContain("bare-system");
    expect(composed).not.toContain("claude");
    expect(composed).not.toContain(identity);
  } finally {
    await closeTree(tree.root);
  }
});

test("空 SYSTEM.md 命中即清空默认模板；坏文件跳过并告警", async () => {
  const tree = await openTree();
  const warnings: string[] = [];
  try {
    await writeText(join(tree.home, "SYSTEM.md"), "");
    await mkdir(join(tree.repo, ".atom-agent", "APPEND_SYSTEM.md"), { recursive: true });
    const files = loadPromptFiles({
      cwd: tree.repo,
      env: tree.env,
      warn: (message) => warnings.push(message),
    });
    expect(files.system).toBe("");
    expect(files.appends).toEqual([]);
    expect(warnings.some((item) => item.includes("是目录"))).toBe(true);
    const composed = composeSystemPrompt({
      files,
      tools: [{ name: "read" }],
      skills: [],
      cwd: tree.repo,
    });
    expect(composed).not.toContain(identity);
  } finally {
    await closeTree(tree.root);
  }
});

test("--system-prompt / --append-system-prompt 覆盖发现；指向目录则启动失败", async () => {
  const tree = await openTree();
  try {
    await writeText(join(tree.home, "SYSTEM.md"), "user-system");
    await writeText(join(tree.home, "APPEND_SYSTEM.md"), "user-append");
    await writeText(join(tree.repo, "prompt.md"), "from-file");
    const literal = loadPromptFiles({
      cwd: tree.repo,
      env: tree.env,
      systemPrompt: "literal",
      appendSystemPrompts: ["one", "", "two"],
    });
    expect(literal.system).toBe("literal");
    expect(literal.appends).toEqual(["one", "two"]);

    const fromFile = loadPromptFiles({
      cwd: tree.repo,
      env: tree.env,
      systemPrompt: "prompt.md",
    });
    expect(fromFile.system).toBe("from-file");

    const empty = loadPromptFiles({
      cwd: tree.repo,
      env: tree.env,
      systemPrompt: "",
    });
    expect(empty.system).toBe("");

    expect(() =>
      loadPromptFiles({
        cwd: tree.repo,
        env: tree.env,
        systemPrompt: ".",
      }),
    ).toThrow(/指向目录/);
  } finally {
    await closeTree(tree.root);
  }
});

test("装配把拼好的系统提示交给假 llm，且不进三角消息", async () => {
  const tree = await openTree();
  const capture: { systemPrompt?: string; messages?: readonly Message[] } = {};
  try {
    await writeText(
      join(tree.home, "skills", "review", "SKILL.md"),
      "---\ndescription: 审查\n---\nbody\n",
    );
    const assembly = assemble({ cwd: tree.repo, env: tree.env, argv: [] });
    const plugins = assembly.plugins.map((plugin) =>
      plugin.id === "atom-llm" ? fakeLlmPlugin(capture) : plugin,
    );
    const host = createPluginHost();
    for (const plugin of plugins) {
      await host.load(plugin);
    }
    const loop = host.context.get("loop") as Loop;
    await loop.prompt("嗨");
    expect(capture.systemPrompt).toContain(identity);
    expect(capture.systemPrompt).toContain("- read: Read file contents");
    expect(capture.systemPrompt).toContain("<name>review</name>");
    expect(capture.systemPrompt).toContain("Current working directory:");
    expect(capture.messages).toEqual([{ role: "user", content: "嗨" }]);
    expect(
      loop.messages.every((message) => ["user", "assistant", "toolResult"].includes(message.role)),
    ).toBe(true);
  } finally {
    await closeTree(tree.root);
  }
});
