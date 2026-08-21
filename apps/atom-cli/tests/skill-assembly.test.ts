import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createPluginHost } from "atom-kernel";
import type { LoadedPlugin, ResolvedPluginModule } from "atom-kernel";
import type { Llm, LlmChunk, Loop, Message } from "atom-loop";
import { expect, test } from "vite-plus/test";
import { assemble } from "../src/index.ts";

const userLlm = {
  model: "user-model",
  baseUrl: "https://user.example",
  apiKey: "user-key",
};

async function writeJson(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function writeSkill(dir: string, name: string, description: string, body: string) {
  const skillDir = join(dir, name);
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`,
    "utf8",
  );
}

async function openTree() {
  const root = await mkdtemp(join(tmpdir(), "atom-skill-asm-"));
  const home = join(root, "home");
  const repo = join(root, "repo");
  await mkdir(home, { recursive: true });
  await mkdir(join(repo, ".git"), { recursive: true });
  await writeJson(join(home, "settings.json"), userLlm);
  return {
    root,
    home,
    repo,
    env: { ATOM_AGENT_HOME: home } satisfies NodeJS.ProcessEnv,
  };
}

async function closeTree(root: string) {
  await rm(root, { recursive: true, force: true });
}

function assembleFrom(
  tree: { repo: string; env: NodeJS.ProcessEnv },
  extra: { cwd?: string; argv?: readonly string[] } = {},
) {
  return assemble({
    cwd: extra.cwd ?? tree.repo,
    argv: extra.argv ?? [],
    env: tree.env,
  });
}

async function loadHost(plugins: readonly ResolvedPluginModule[]) {
  const host = createPluginHost();
  const loaded: LoadedPlugin[] = [];
  for (const module of plugins) {
    loaded.push(await host.load(module));
  }
  return {
    host,
    close: async () => {
      for (const item of [...loaded].reverse()) {
        await item.unload();
      }
    },
  };
}

function skillTool(host: ReturnType<typeof createPluginHost>) {
  const tools = host.context.get("tools") as
    | {
        list(): { name: string; description?: string; execute(args: unknown): Promise<string> }[];
      }
    | undefined;
  return tools?.list().find((tool) => tool.name === "skill");
}

function fakeLlm(
  replies: ((messages: readonly Message[]) => LlmChunk[] | Promise<LlmChunk[]>)[],
): Llm {
  const received: Message[][] = [];
  return {
    async *stream({ messages, signal }) {
      const index = received.length;
      received.push([...messages]);
      const reply = replies[index];
      if (!reply) {
        throw new Error(`假 llm 没有第 ${index} 次回复`);
      }
      const chunks = await reply(messages);
      for (const chunk of chunks) {
        signal?.throwIfAborted();
        yield chunk;
      }
    },
  };
}

function withFakeLlm(plugins: readonly ResolvedPluginModule[], llm: Llm): ResolvedPluginModule[] {
  return [
    {
      id: "fake-llm",
      apply(ctx) {
        ctx.provide("llm", llm);
      },
    },
    ...plugins.filter((module) => module.id !== "atom-llm"),
  ];
}

test("用户根 skills 一层 SKILL.md 进清单，假 llm 调用 skill 拿到正文", async () => {
  const tree = await openTree();
  try {
    await writeSkill(join(tree.home, "skills"), "review", "审查当前改动", "先看 diff。");
    const { host, close } = await loadHost(
      withFakeLlm(
        assembleFrom(tree).plugins,
        fakeLlm([
          () => [{ type: "toolCall", id: "s", name: "skill", arguments: { name: "review" } }],
          () => [{ type: "text", text: "好了" }],
        ]),
      ),
    );
    try {
      const tool = skillTool(host);
      expect(tool?.description).toContain("review");
      expect(tool?.description).toContain("审查当前改动");
      expect(tool?.description).not.toContain("先看 diff。");
      const loop = host.context.get("loop") as Loop;
      await loop.prompt("加载 review");
      expect(loop.messages.find((message) => message.role === "toolResult")).toEqual({
        role: "toolResult",
        toolCallId: "s",
        name: "skill",
        content: "先看 diff。",
        isError: false,
      });
      expect(host.context.get("skills")).toBeUndefined();
    } finally {
      await close();
    }
  } finally {
    await closeTree(tree.root);
  }
});

test("同名 Skill 近 cwd 整颗替换，不合并正文", async () => {
  const tree = await openTree();
  try {
    await writeSkill(join(tree.home, "skills"), "review", "用户级审查", "用户正文");
    await writeSkill(join(tree.repo, ".atom-agent", "skills"), "review", "项目级审查", "项目正文");
    const nested = join(tree.repo, "pkg");
    await mkdir(nested, { recursive: true });
    await writeSkill(join(nested, ".atom-agent", "skills"), "review", "近处审查", "近处正文");
    const { host, close } = await loadHost(assembleFrom(tree, { cwd: nested }).plugins);
    try {
      const tool = skillTool(host);
      expect(tool?.description).toContain("近处审查");
      expect(tool?.description).not.toContain("用户级审查");
      expect(tool?.description).not.toContain("项目级审查");
      expect(await tool?.execute({ name: "review" })).toBe("近处正文");
    } finally {
      await close();
    }
  } finally {
    await closeTree(tree.root);
  }
});

test("不扫递归 SKILL.md 与扁平 md；坏条目跳过并告警", async () => {
  const tree = await openTree();
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (message?: unknown) => {
    if (typeof message === "string") {
      warnings.push(message);
    }
  };
  try {
    await writeSkill(join(tree.home, "skills"), "review", "审查当前改动", "先看 diff。");
    await mkdir(join(tree.home, "skills", "nested", "inner"), { recursive: true });
    await writeFile(
      join(tree.home, "skills", "nested", "inner", "SKILL.md"),
      "---\ndescription: 不该进清单\n---\n\n深层正文\n",
      "utf8",
    );
    await writeFile(join(tree.home, "skills", "flat.md"), "# 扁平\n", "utf8");
    await mkdir(join(tree.home, "skills", "broken"), { recursive: true });
    await mkdir(join(tree.home, "skills", "bad"), { recursive: true });
    await writeFile(join(tree.home, "skills", "bad", "SKILL.md"), "没有 YAML 头\n", "utf8");
    const { host, close } = await loadHost(assembleFrom(tree).plugins);
    try {
      const tool = skillTool(host);
      expect(tool?.description).toContain("review");
      expect(tool?.description).not.toContain("不该进清单");
      expect(tool?.description).not.toContain("flat");
      await expect(tool?.execute({ name: "nested" })).rejects.toThrow("nested");
      expect(warnings.some((line) => line.includes("broken"))).toBe(true);
      expect(warnings.some((line) => line.includes("bad"))).toBe(true);
    } finally {
      await close();
    }
  } finally {
    console.warn = original;
    await closeTree(tree.root);
  }
});

test("--no-tools 不卸 Skill 加载器", async () => {
  const tree = await openTree();
  try {
    await writeSkill(join(tree.home, "skills"), "review", "审查当前改动", "先看 diff。");
    const assembly = assembleFrom(tree, { argv: ["--no-tools"] });
    expect(assembly.plugins.map((plugin) => plugin.id)).toContain("atom-skill");
    expect(assembly.plugins.map((plugin) => plugin.id)).not.toContain("atom-tools");
    const { host, close } = await loadHost(assembly.plugins);
    try {
      const tools = host.context.get("tools") as { list(): { name: string }[] };
      expect(tools.list().map((tool) => tool.name)).toEqual(["skill"]);
      expect(await skillTool(host)?.execute({ name: "review" })).toBe("先看 diff。");
    } finally {
      await close();
    }
  } finally {
    await closeTree(tree.root);
  }
});

test("deny 工具名 skill 时加载器整把不登记", async () => {
  const tree = await openTree();
  try {
    await writeSkill(join(tree.home, "skills"), "review", "审查当前改动", "先看 diff。");
    await writeJson(join(tree.home, "settings.json"), {
      ...userLlm,
      tools: { deny: ["skill"] },
    });
    const { host, close } = await loadHost(assembleFrom(tree).plugins);
    try {
      const tools = host.context.get("tools") as { list(): { name: string }[] };
      expect(tools.list().map((tool) => tool.name)).not.toContain("skill");
      expect(tools.list().map((tool) => tool.name)).toEqual([
        "read",
        "write",
        "edit",
        "bash",
        "rg",
        "ASK",
      ]);
    } finally {
      await close();
    }
  } finally {
    await closeTree(tree.root);
  }
});
