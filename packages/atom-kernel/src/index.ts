import { Context as CordisContext } from "cordis";
import type { Context as PluginContext, Inject } from "cordis";

declare module "cordis" {
  interface Events {
    [topic: string]: (payload?: unknown) => void;
  }
}

export { Service } from "cordis";
export type { Inject, PluginContext };

/** 已解析的同进程插件模块。宿主只吃模块本身，发现路径不进契约。 */
export interface ResolvedPluginModule {
  readonly id: string;
  readonly inject?: Inject;
  apply(this: void, ctx: PluginContext, config?: unknown): unknown;
}

/** Context：从官方槽或未点名键取服务。 */
export interface Context {
  get(slot: string): unknown;
}

export type OfficialSlot = "loop" | "tools" | "llm";

/** 匿名事件总线原语。业务事件名不属于内核。 */
export interface EventBus {
  publish(topic: string, payload?: unknown): void;
  subscribe(topic: string, handler: (payload: unknown) => void): () => void;
}

/**
 * 公开面只有这一条：加载已解析同进程模块、Context 取槽、匿名事件总线。
 */
export interface LoadedPlugin {
  readonly id: string;
  unload(): Promise<void>;
}

export interface PluginHost {
  readonly context: Context;
  readonly events: EventBus;
  load(module: ResolvedPluginModule): Promise<LoadedPlugin>;
}

export function createPluginHost(): PluginHost {
  const cordis = new CordisContext();
  return {
    context: {
      get(slot: string) {
        return cordis.get(slot);
      },
    },
    events: {
      publish(topic, payload) {
        cordis.emit(topic, payload);
      },
      subscribe(topic, handler) {
        const dispose = cordis.on(topic, handler);
        return () => {
          dispose();
        };
      },
    },
    async load(module) {
      const fiber = cordis.plugin({
        name: module.id,
        apply: (ctx: PluginContext, config: unknown) => module.apply(ctx, config),
        inject: module.inject,
      });
      await fiber;
      return {
        id: module.id,
        unload: async () => {
          await fiber.dispose();
        },
      };
    },
  };
}
