import { expect, test } from "vite-plus/test";
import { createPluginHost, Service } from "../src/index.ts";
import type { PluginContext } from "../src/index.ts";

test("装上探测插件后 Context 能取到未点名服务", async () => {
  const host = createPluginHost();
  await host.load({
    id: "probe",
    apply(ctx) {
      ctx.provide("probe", { ping: "pong" });
    },
  });

  expect(host.context.get("probe")).toEqual({ ping: "pong" });
  expect(host.context.get("loop")).toBeUndefined();
});

test("不装 loop 时官方槽仍可被探测插件贡献并取到", async () => {
  const host = createPluginHost();
  const tools = { list: ["probe-tool"] };
  await host.load({
    id: "probe-tools",
    apply(ctx) {
      ctx.provide("tools", tools);
    },
  });

  expect(host.context.get("tools")).toEqual(tools);
  expect(host.context.get("loop")).toBeUndefined();
  expect(host.context.get("llm")).toBeUndefined();
});

test("卸载后 effect 逆转，服务不再可取", async () => {
  const host = createPluginHost();
  const loaded = await host.load({
    id: "probe",
    apply(ctx) {
      ctx.provide("probe", { ping: "pong" });
    },
  });

  await loaded.unload();

  expect(host.context.get("probe")).toBeUndefined();
});

test("匿名事件总线可发布订阅，内核不规定业务事件名", async () => {
  const host = createPluginHost();
  const seen: unknown[] = [];
  const unsubscribe = host.events.subscribe("probe/tick", (payload) => {
    seen.push(payload);
  });

  host.events.publish("probe/tick", { n: 1 });
  expect(seen).toEqual([{ n: 1 }]);

  unsubscribe();
  host.events.publish("probe/tick", { n: 2 });
  expect(seen).toEqual([{ n: 1 }]);
});

test("插件打出的事件与宿主订阅走同一条匿名总线", async () => {
  const host = createPluginHost();
  const seen: unknown[] = [];
  host.events.subscribe("probe/tick", (payload) => {
    seen.push(payload);
  });

  await host.load({
    id: "probe",
    apply(ctx) {
      ctx.emit("probe/tick", { from: "plugin" });
    },
  });

  expect(seen).toEqual([{ from: "plugin" }]);
});

test("后装插件可通过 inject 取到先贡献的服务", async () => {
  const host = createPluginHost();
  const pending = await host.load({
    id: "echo",
    inject: ["probe"],
    apply(ctx) {
      const probe = ctx.get("probe") as { ping: string };
      ctx.provide("echo", { value: probe.ping });
    },
  });
  expect(host.context.get("echo")).toBeUndefined();

  await host.load({
    id: "probe",
    apply(ctx) {
      ctx.provide("probe", { ping: "pong" });
    },
  });

  expect(host.context.get("echo")).toEqual({ value: "pong" });
  await pending.unload();
});

test("探测插件可用 Cordis Service 贡献未点名服务", async () => {
  class ProbeService extends Service {
    ping = "pong";
    constructor(ctx: PluginContext) {
      super(ctx, "probe");
    }
  }

  const host = createPluginHost();
  await host.load({
    id: "probe",
    apply(ctx) {
      ctx.plugin(ProbeService);
    },
  });

  expect(host.context.get("probe")).toMatchObject({ ping: "pong" });
});
