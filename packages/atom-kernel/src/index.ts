/** 已解析的同进程插件模块。宿主只吃模块本身，发现路径不进契约。 */
export interface ResolvedPluginModule {
  readonly id: string;
}

/** Context：从官方槽或未点名键取服务。本票不实现。 */
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
 * 本票不实现加载。
 */
export interface PluginHost {
  readonly context: Context;
  readonly events: EventBus;
  load(module: ResolvedPluginModule): void;
}
