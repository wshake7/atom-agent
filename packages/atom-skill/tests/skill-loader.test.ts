import { createPluginHost } from "atom-kernel";
import { plugin as loopPlugin } from "../../atom-loop/src/index.ts";
import type { Llm, LlmChunk, Loop, Message } from "../../atom-loop/src/index.ts";
import { expect, test } from "vite-plus/test";
import { createSkillPlugin, plugin as defaultSkillPlugin } from "../src/index.ts";

const review = {
  name: "review",
  description: "审查当前改动",
  body: "先看 diff，再下结论。",
};

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

type ListedTool = {
  name: string;
  description?: string;
  execute(args: unknown, signal?: AbortSignal): Promise<string>;
};

type ToolsSlot = { list(): ListedTool[] };

async function loadWithSkill(llm: Llm, skillModule = createSkillPlugin({ catalog: [review] })) {
  const host = createPluginHost();
  await host.load({
    id: "fake-llm",
    apply(ctx) {
      ctx.provide("llm", llm);
    },
  });
  const loadedSkill = await host.load(skillModule);
  await host.load(loopPlugin);
  const loop = host.context.get("loop") as Loop | undefined;
  if (!loop) {
    throw new Error("loop 槽为空");
  }
  return { host, loop, loadedSkill };
}

test("空清单仍登记 skill 工具，description 写无可用，且不占 skills 槽", async () => {
  const host = createPluginHost();
  await host.load(defaultSkillPlugin);
  const tools = host.context.get("tools") as ToolsSlot;
  expect(tools.list().map((tool) => tool.name)).toEqual(["skill"]);
  expect(tools.list()[0]?.description).toContain("No skills are currently available");
  expect(host.context.get("skills")).toBeUndefined();
});

test("清单的 name 与 description 写进 skill 工具 description，正文不在 description 里", async () => {
  const host = createPluginHost();
  await host.load(createSkillPlugin({ catalog: [review] }));
  const skill = (host.context.get("tools") as ToolsSlot).list()[0];
  expect(skill?.name).toBe("skill");
  expect(skill?.description).toContain("review");
  expect(skill?.description).toContain("审查当前改动");
  expect(skill?.description).not.toContain(review.body);
});

test("假 llm 调用 skill({ name }) 后循环拿到正文，不是业务 function 表上的多把工具", async () => {
  const llm = fakeLlm([
    () => [{ type: "toolCall", id: "s", name: "skill", arguments: { name: "review" } }],
    () => [{ type: "text", text: "好了" }],
  ]);
  const { host, loop } = await loadWithSkill(llm);
  const tools = host.context.get("tools") as ToolsSlot;
  expect(tools.list().map((tool) => tool.name)).toEqual(["skill"]);

  await loop.prompt("加载 review");

  expect(loop.messages.find((message) => message.role === "toolResult")).toEqual({
    role: "toolResult",
    toolCallId: "s",
    name: "skill",
    content: review.body,
    isError: false,
  });
});

test("catalog 为函数时每次 list/execute 重新取清单", async () => {
  const catalog = [review];
  const host = createPluginHost();
  await host.load(createSkillPlugin({ catalog: () => catalog }));
  const skill = (host.context.get("tools") as ToolsSlot).list()[0];
  expect(skill?.description).toContain("review");
  catalog.splice(0, catalog.length);
  expect(skill?.description).toContain("No skills are currently available");
  await expect(skill?.execute({ name: "review" })).rejects.toThrow("未知 Skill: review");
});

test("未知 name 走工具错误，不登记第二把工具", async () => {
  const llm = fakeLlm([
    () => [{ type: "toolCall", id: "s", name: "skill", arguments: { name: "missing" } }],
    () => [{ type: "text", text: "没有" }],
  ]);
  const { host, loop } = await loadWithSkill(llm);
  await loop.prompt("加载 missing");
  const result = loop.messages.find((message) => message.role === "toolResult");
  expect(result?.isError).toBe(true);
  expect(result?.content).toContain("missing");
  expect((host.context.get("tools") as ToolsSlot).list().map((tool) => tool.name)).toEqual([
    "skill",
  ]);
});

test("先有其他 tools 时只追加 skill，循环仍能调用", async () => {
  const host = createPluginHost();
  const probe = {
    name: "probe",
    execute: async () => "probe-ok",
  };
  const items = [probe];
  await host.load({
    id: "probe-tools",
    apply(ctx) {
      ctx.provide("tools", {
        list: () => items,
        register(tool: (typeof items)[number]) {
          items.push(tool);
          return () => {
            const index = items.indexOf(tool);
            if (index >= 0) {
              items.splice(index, 1);
            }
          };
        },
      });
    },
  });
  const llm = fakeLlm([
    () => [{ type: "toolCall", id: "s", name: "skill", arguments: { name: "review" } }],
    () => [{ type: "text", text: "好了" }],
  ]);
  await host.load({
    id: "fake-llm",
    apply(ctx) {
      ctx.provide("llm", llm);
    },
  });
  const loaded = await host.load(createSkillPlugin({ catalog: [review] }));
  await host.load(loopPlugin);
  try {
    const tools = host.context.get("tools") as ToolsSlot;
    expect(tools.list().map((tool) => tool.name)).toEqual(["probe", "skill"]);
    const loop = host.context.get("loop") as Loop;
    await loop.prompt("加载 review");
    expect(loop.messages.find((message) => message.role === "toolResult")).toEqual({
      role: "toolResult",
      toolCallId: "s",
      name: "skill",
      content: review.body,
      isError: false,
    });
  } finally {
    await loaded.unload();
  }
  expect((host.context.get("tools") as ToolsSlot).list().map((tool) => tool.name)).toEqual([
    "probe",
  ]);
});
