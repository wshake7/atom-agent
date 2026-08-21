export type CompactReason = "threshold" | "overflow" | "manual";

export type AssistantBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "thinking"; readonly text: string }
  | {
      readonly type: "toolCall";
      readonly id: string;
      readonly name: string;
      readonly arguments: unknown;
    };

export type Message =
  | { readonly role: "user"; readonly content: string }
  | { readonly role: "assistant"; readonly content: readonly AssistantBlock[] }
  | {
      readonly role: "toolResult";
      readonly toolCallId: string;
      readonly name: string;
      readonly content: string;
      readonly isError?: boolean;
    };

export interface CompactResult {
  readonly messages: readonly Message[];
  readonly shortened: boolean;
  readonly summary?: string;
  readonly cutIndex?: number;
}

/** `compact` 槽：只读视图变换。不改原列表，不写盘。 */
export interface Compact {
  compact(
    messages: readonly Message[],
    reason: CompactReason,
  ): CompactResult | Promise<CompactResult>;
}
