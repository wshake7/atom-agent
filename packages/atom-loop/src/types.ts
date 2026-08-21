/** 默认循环契约锁死的最小事件集。事件名属于循环，不属于内核。 */
export const LOOP_EVENTS = {
  turnStart: "loop/turn-start",
  turnEnd: "loop/turn-end",
  assistantDelta: "loop/assistant-delta",
  toolStart: "loop/tool-start",
  toolEnd: "loop/tool-end",
} as const;

export type LoopEventName = (typeof LOOP_EVENTS)[keyof typeof LOOP_EVENTS];

export type AssistantDeltaPayload =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "thinking"; readonly text: string };

export interface ToolCallPayload {
  readonly id: string;
  readonly name: string;
  readonly arguments?: unknown;
}

export interface ToolEndPayload {
  readonly id: string;
  readonly name: string;
  readonly content: string;
  readonly isError: boolean;
}

export type AssistantBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "thinking"; readonly text: string }
  | {
      readonly type: "toolCall";
      readonly id: string;
      readonly name: string;
      readonly arguments: unknown;
    };

export interface UserMessage {
  readonly role: "user";
  readonly content: string;
}

export interface AssistantMessage {
  readonly role: "assistant";
  readonly content: readonly AssistantBlock[];
}

export interface ToolResultMessage {
  readonly role: "toolResult";
  readonly toolCallId: string;
  readonly name: string;
  readonly content: string;
  readonly isError?: boolean;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export interface ToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly parameters?: unknown;
}

export interface Tool extends ToolDefinition {
  execute(args: unknown, signal?: AbortSignal): Promise<string>;
}

/** `tools` 槽：循环只读 list；登记面留给工具包 / MCP 桥。 */
export interface Tools {
  list(): readonly Tool[];
}

export type LlmChunk =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "thinking"; readonly text: string }
  | {
      readonly type: "toolCall";
      readonly id: string;
      readonly name: string;
      readonly arguments: unknown;
    };

export interface LlmRequest {
  readonly messages: readonly Message[];
  readonly tools: readonly ToolDefinition[];
  readonly signal?: AbortSignal;
}

/** `llm` 槽：必须可流式、可 Abort。提供商方言不进此合同。 */
export interface Llm {
  stream(request: LlmRequest): AsyncIterable<LlmChunk>;
}

/** 循环只认这个上下文溢出失败面。不加方法、不加 usage、不加提供商方言。 */
export class ContextOverflowError extends Error {
  constructor(message = "上下文溢出") {
    super(message);
    this.name = "ContextOverflowError";
  }
}

export function isContextOverflowError(error: unknown): boolean {
  return error instanceof Error && error.name === "ContextOverflowError";
}

export type CompactReason = "threshold" | "overflow" | "manual";

export interface CompactResult {
  readonly messages: readonly Message[];
  readonly shortened: boolean;
  readonly summary?: string;
  readonly cutIndex?: number;
}

/** 默认循环可选消费：没有提供方则恒等。 */
export interface Compact {
  compact(
    messages: readonly Message[],
    reason: CompactReason,
  ): CompactResult | Promise<CompactResult>;
}

export interface PromptOptions {
  readonly signal?: AbortSignal;
}

/** `loop` 槽：一轮「模型 ↔ 工具」直到助手不再调用工具或被 Abort。 */
export interface Loop {
  readonly messages: readonly Message[];
  prompt(text: string, options?: PromptOptions): Promise<void>;
}
