import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createPluginHost } from "atom-kernel";
import type { LoadedPlugin, ResolvedPluginModule } from "atom-kernel";
import { expect, test } from "vite-plus/test";
import { assemble, main } from "../src/index.ts";

const echoPath = fileURLToPath(
  new URL("../../../packages/atom-mcp/tests/fixtures/echo-mcp.mjs", import.meta.url),
);

const echoSidecar = {
  mcpServers: {
    echo: {
      command: process.execPath,
      args: [echoPath],
    },
  },
};

const userLlm = {
  model: "user-model",
  baseUrl: "https://user.example",
  apiKey: "user-key",
};

async function writeJson(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function openTree(options: { git?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "atom-cfg-"));
  const home = join(root, "home");
  const repo = join(root, "repo");
  await mkdir(home, { recursive: true });
  await mkdir(repo, { recursive: true });
  if (options.git !== false) {
    await mkdir(join(repo, ".git"));
  }
  await writeJson(join(home, "settings.json"), userLlm);
  return {
    root,
    home,
    repo,
    env: { ATOM_AGENT_HOME: home },
  };
}

async function closeTree(root: string) {
  await rm(root, { recursive: true, force: true });
}

function assembleFrom(
  tree: { repo: string; env: NodeJS.ProcessEnv },
  extra: {
    cwd?: string;
    argv?: readonly string[];
    env?: NodeJS.ProcessEnv;
  } = {},
) {
  return assemble({
    cwd: extra.cwd ?? tree.repo,
    argv: extra.argv ?? [],
    env: { ...tree.env, ...extra.env },
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

function toolNames(host: ReturnType<typeof createPluginHost>): string[] {
  const tools = host.context.get("tools") as { list(): { name: string }[] } | undefined;
  return tools?.list().map((tool) => tool.name) ?? [];
}

function memoryStdout() {
  const chunks: string[] = [];
  const stdout = new Writable({
    decodeStrings: false,
    write(chunk, _encoding, callback) {
      chunks.push(typeof chunk === "string" ? chunk : chunk.toString());
      callback();
    },
  });
  return { stdout, text: () => chunks.join("") };
}

test("用户层 settings 叠出三标量，宿主只吃已解析模块", async () => {
  const tree = await openTree();
  try {
    const assembly = assembleFrom(tree);
    expect(assembly.llm).toEqual(userLlm);
    const pluginIds = [
      "atom-llm",
      "atom-tools",
      "atom-skill",
      "atom-mcp",
      "atom-session",
      "atom-compact",
      "atom-loop",
    ];
    expect(assembly.plugins.map((plugin) => plugin.id)).toEqual(pluginIds);
    const llmSlot = assembly.llm;
    llmSlot.model = "session-model";
    expect(assembly.llm).toBe(llmSlot);
    expect(assembly.llm.model).toBe("session-model");
    expect(assembly.llm.baseUrl).toBe(userLlm.baseUrl);
    expect(assembly.llm.apiKey).toBe(userLlm.apiKey);
    expect(assembly.plugins.map((plugin) => plugin.id)).toEqual(pluginIds);
    const { host, close } = await loadHost(assembly.plugins);
    try {
      expect(host.context.get("llm")).toBeDefined();
      expect(host.context.get("loop")).toBeDefined();
      expect(toolNames(host)).toEqual(["read", "write", "edit", "bash", "rg", "ASK", "skill"]);
      expect(host.context.get("config")).toBeUndefined();
    } finally {
      await close();
    }
  } finally {
    await closeTree(tree.root);
  }
});

test("缺 model / baseUrl / apiKey 任一则启动失败", async () => {
  const tree = await openTree();
  try {
    await writeJson(join(tree.home, "settings.json"), { model: "only-model" });
    expect(() => assembleFrom(tree)).toThrow("启动失败: 缺少 baseUrl、apiKey");
  } finally {
    await closeTree(tree.root);
  }
});

test("项目文件里的 apiKey 丢掉不读，改用用户层密钥", async () => {
  const tree = await openTree();
  try {
    await writeJson(join(tree.repo, ".atom-agent", "settings.json"), {
      model: "proj-model",
      apiKey: "project-secret",
    });
    expect(assembleFrom(tree).llm).toEqual({
      model: "proj-model",
      baseUrl: userLlm.baseUrl,
      apiKey: userLlm.apiKey,
    });
  } finally {
    await closeTree(tree.root);
  }
});

test("密钥优先级：--api-key 压过环境变量、本机、用户", async () => {
  const tree = await openTree();
  try {
    await writeJson(join(tree.repo, ".atom-agent", "settings.local.json"), {
      apiKey: "local-key",
    });
    expect(assembleFrom(tree, { env: { ATOM_LLM_API_KEY: "env-key" } }).llm.apiKey).toBe("env-key");
    expect(assembleFrom(tree).llm.apiKey).toBe("local-key");
    expect(assembleFrom(tree, { argv: ["--api-key", "cli-key"] }).llm.apiKey).toBe("cli-key");
  } finally {
    await closeTree(tree.root);
  }
});

test("非密钥标量：argv 压过环境变量、本机、近 cwd 项目、用户", async () => {
  const tree = await openTree();
  try {
    const nested = join(tree.repo, "pkg");
    await mkdir(join(nested, ".atom-agent"), { recursive: true });
    await writeJson(join(tree.repo, ".atom-agent", "settings.json"), {
      model: "root-model",
      baseUrl: "https://root.example",
    });
    await writeJson(join(nested, ".atom-agent", "settings.json"), {
      model: "pkg-model",
    });
    await writeJson(join(nested, ".atom-agent", "settings.local.json"), {
      model: "local-model",
    });
    expect(assembleFrom(tree, { cwd: nested }).llm.model).toBe("local-model");
    expect(
      assembleFrom(tree, { cwd: nested, env: { ATOM_LLM_MODEL: "env-model" } }).llm.model,
    ).toBe("env-model");
    expect(assembleFrom(tree, { cwd: nested, argv: ["--model", "cli-model"] }).llm.model).toBe(
      "cli-model",
    );
    expect(assembleFrom(tree, { cwd: nested }).llm.baseUrl).toBe("https://root.example");
  } finally {
    await closeTree(tree.root);
  }
});

test("用户层 model 对象用 forceDefault，项目字符串仍压过 pin", async () => {
  const tree = await openTree();
  try {
    await writeJson(join(tree.home, "settings.json"), {
      ...userLlm,
      model: { default: "user-default", forceDefault: "user-pin" },
    });
    expect(assembleFrom(tree).llm.model).toBe("user-pin");
    await writeJson(join(tree.home, "settings.json"), {
      ...userLlm,
      model: { default: "user-default" },
    });
    expect(assembleFrom(tree).llm.model).toBe("user-default");
    await writeJson(join(tree.repo, ".atom-agent", "settings.json"), {
      model: "proj-model",
    });
    expect(assembleFrom(tree).llm.model).toBe("proj-model");
  } finally {
    await closeTree(tree.root);
  }
});

test("ATOM_AGENT_HOME 换整个用户根", async () => {
  const tree = await openTree();
  const otherHome = join(tree.root, "other-home");
  try {
    await mkdir(otherHome, { recursive: true });
    await writeJson(join(otherHome, "settings.json"), {
      model: "other-model",
      baseUrl: "https://other.example",
      apiKey: "other-key",
    });
    expect(assembleFrom(tree, { env: { ATOM_AGENT_HOME: otherHome } }).llm.model).toBe(
      "other-model",
    );
  } finally {
    await closeTree(tree.root);
  }
});

test("没有 git 时只叠 cwd，不走进父目录", async () => {
  const tree = await openTree({ git: false });
  try {
    const nested = join(tree.repo, "pkg");
    await mkdir(join(tree.repo, ".atom-agent"), { recursive: true });
    await mkdir(join(nested, ".atom-agent"), { recursive: true });
    await writeJson(join(tree.repo, ".atom-agent", "settings.json"), {
      model: "parent-model",
    });
    await writeJson(join(nested, ".atom-agent", "settings.json"), {
      model: "cwd-model",
    });
    expect(assembleFrom(tree, { cwd: nested }).llm.model).toBe("cwd-model");
    expect(assembleFrom(tree).llm.model).toBe("parent-model");
  } finally {
    await closeTree(tree.root);
  }
});

test("本机覆盖只认启动 cwd，父目录 settings.local.json 不生效", async () => {
  const tree = await openTree();
  try {
    const nested = join(tree.repo, "pkg");
    await mkdir(join(nested, ".atom-agent"), { recursive: true });
    await writeJson(join(tree.repo, ".atom-agent", "settings.local.json"), {
      model: "root-local",
    });
    expect(assembleFrom(tree, { cwd: nested }).llm.model).toBe(userLlm.model);
    await writeJson(join(nested, ".atom-agent", "settings.local.json"), {
      model: "cwd-local",
    });
    expect(assembleFrom(tree, { cwd: nested }).llm.model).toBe("cwd-local");
  } finally {
    await closeTree(tree.root);
  }
});

test(".env 只从启动 cwd 读，已有环境变量不被覆盖", async () => {
  const tree = await openTree();
  try {
    const nested = join(tree.repo, "pkg");
    await mkdir(nested, { recursive: true });
    await writeFile(join(tree.repo, ".env"), "ATOM_LLM_MODEL=root-env\n", "utf8");
    await writeFile(join(nested, ".env"), "ATOM_LLM_MODEL=cwd-env\n", "utf8");
    expect(assembleFrom(tree, { cwd: nested }).llm.model).toBe("cwd-env");
    expect(assembleFrom(tree, { cwd: nested, env: { ATOM_LLM_MODEL: "already" } }).llm.model).toBe(
      "already",
    );
  } finally {
    await closeTree(tree.root);
  }
});

test("MCP sidecar 同名整条替换；git 根 .mcp.json 可被同层 .atom-agent/mcp.json 整文件覆盖", async () => {
  const tree = await openTree();
  try {
    await writeJson(join(tree.repo, ".mcp.json"), echoSidecar);
    const fromDot = assembleFrom(tree);
    const loadedDot = await loadHost(fromDot.plugins);
    try {
      expect(toolNames(loadedDot.host)).toContain("mcp__echo__echo");
    } finally {
      await loadedDot.close();
    }

    await writeJson(join(tree.repo, ".atom-agent", "mcp.json"), { mcpServers: {} });
    const covered = assembleFrom(tree);
    const loadedCovered = await loadHost(covered.plugins);
    try {
      expect(toolNames(loadedCovered.host)).not.toContain("mcp__echo__echo");
    } finally {
      await loadedCovered.close();
    }
  } finally {
    await closeTree(tree.root);
  }
});

test("用户根与本机不认第二份 .mcp.json", async () => {
  const tree = await openTree();
  try {
    await writeJson(join(tree.home, ".mcp.json"), echoSidecar);
    await writeJson(join(tree.repo, ".atom-agent", ".mcp.json"), echoSidecar);
    const assembly = assembleFrom(tree);
    const { host, close } = await loadHost(assembly.plugins);
    try {
      expect(toolNames(host)).not.toContain("mcp__echo__echo");
    } finally {
      await close();
    }
  } finally {
    await closeTree(tree.root);
  }
});

test("未写 enable 则清单全可连再减 disable；enable 以最高层整表替换", async () => {
  const tree = await openTree();
  try {
    await writeJson(join(tree.home, "mcp.json"), echoSidecar);
    await writeJson(join(tree.home, "settings.json"), {
      ...userLlm,
      mcp: { disable: ["echo"] },
    });
    const disabled = await loadHost(assembleFrom(tree).plugins);
    try {
      expect(toolNames(disabled.host)).not.toContain("mcp__echo__echo");
    } finally {
      await disabled.close();
    }

    await writeJson(join(tree.home, "settings.json"), userLlm);
    await writeJson(join(tree.repo, ".atom-agent", "settings.json"), {
      mcp: { enable: [] },
    });
    const none = await loadHost(assembleFrom(tree).plugins);
    try {
      expect(toolNames(none.host)).not.toContain("mcp__echo__echo");
    } finally {
      await none.close();
    }
  } finally {
    await closeTree(tree.root);
  }
});

test("--mcp 追加且同名整条替换", async () => {
  const tree = await openTree();
  try {
    await writeJson(join(tree.home, "mcp.json"), {
      mcpServers: {
        echo: { command: "false", args: [] },
      },
    });
    const assembly = assembleFrom(tree, {
      argv: ["--mcp", "echo", process.execPath, echoPath],
    });
    const { host, close } = await loadHost(assembly.plugins);
    try {
      expect(toolNames(host)).toContain("mcp__echo__echo");
    } finally {
      await close();
    }
  } finally {
    await closeTree(tree.root);
  }
});

test("工具 deny 跨层并集，allow 以最高层整表替换", async () => {
  const tree = await openTree();
  try {
    await writeJson(join(tree.home, "settings.json"), {
      ...userLlm,
      tools: { deny: ["bash"] },
    });
    await writeJson(join(tree.repo, ".atom-agent", "settings.json"), {
      tools: { deny: ["ASK"], allow: ["read", "write", "edit", "rg", "ASK"] },
    });
    const { host, close } = await loadHost(assembleFrom(tree).plugins);
    try {
      expect(toolNames(host)).toEqual(["read", "write", "edit", "rg"]);
    } finally {
      await close();
    }
  } finally {
    await closeTree(tree.root);
  }
});

test("--no-tools 不装默认工具包，MCP 工具仍走名单", async () => {
  const tree = await openTree();
  try {
    await writeJson(join(tree.home, "mcp.json"), echoSidecar);
    const assembly = assembleFrom(tree, { argv: ["--no-tools"] });
    expect(assembly.plugins.map((plugin) => plugin.id)).toEqual([
      "atom-llm",
      "atom-skill",
      "atom-mcp",
      "atom-session",
      "atom-compact",
      "atom-loop",
    ]);
    const { host, close } = await loadHost(assembly.plugins);
    try {
      expect(toolNames(host)).toEqual(["skill", "mcp__echo__echo"]);
    } finally {
      await close();
    }
  } finally {
    await closeTree(tree.root);
  }
});

test("配置没有 plugins 路径表，不扫 plugins 目录，也没有 provider/protocol", async () => {
  const tree = await openTree();
  try {
    await mkdir(join(tree.repo, "plugins", "extra"), { recursive: true });
    await writeFile(join(tree.repo, "plugins", "extra", "index.js"), "export {}\n", "utf8");
    await writeJson(join(tree.home, "settings.json"), {
      ...userLlm,
      provider: "openai",
      protocol: "anthropic",
      plugins: ["./plugins/extra"],
    });
    const assembly = assembleFrom(tree);
    expect(assembly.plugins.map((plugin) => plugin.id)).toEqual([
      "atom-llm",
      "atom-tools",
      "atom-skill",
      "atom-mcp",
      "atom-session",
      "atom-compact",
      "atom-loop",
    ]);
    expect(assembly.llm.model).toBe(userLlm.model);
  } finally {
    await closeTree(tree.root);
  }
});

test("MCP 工具 allow 使用 mcp__<server>__<tool> 名", async () => {
  const tree = await openTree();
  try {
    await writeJson(join(tree.home, "mcp.json"), echoSidecar);
    await writeJson(join(tree.home, "settings.json"), {
      ...userLlm,
      tools: { allow: ["mcp__echo__echo"] },
    });
    const { host, close } = await loadHost(assembleFrom(tree).plugins);
    try {
      expect(toolNames(host)).toEqual(["mcp__echo__echo"]);
    } finally {
      await close();
    }
  } finally {
    await closeTree(tree.root);
  }
});

test("main 在缺三标量时失败，配齐后能启动", async () => {
  const tree = await openTree();
  const { stdout } = memoryStdout();
  try {
    await writeJson(join(tree.home, "settings.json"), { model: "m" });
    await expect(
      main([], Readable.from([]), stdout, { cwd: tree.repo, env: tree.env }),
    ).rejects.toThrow("启动失败");
    await writeJson(join(tree.home, "settings.json"), userLlm);
    await main([], Readable.from([]), stdout, { cwd: tree.repo, env: tree.env });
  } finally {
    await closeTree(tree.root);
  }
});
