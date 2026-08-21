export type AssistantBlock =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "thinking"; readonly text: string }
  | {
      readonly type: "toolCall";
      readonly id: string;
      readonly name: string;
      readonly arguments: unknown;
    };

export type SessionMessage =
  | { readonly role: "user"; readonly content: string }
  | { readonly role: "assistant"; readonly content: readonly AssistantBlock[] }
  | {
      readonly role: "toolResult";
      readonly toolCallId: string;
      readonly name: string;
      readonly content: string;
      readonly isError?: boolean;
    };

export interface SessionStamp {
  readonly model: string;
  readonly provider: string;
}

export interface SessionMessageRecord {
  readonly message: SessionMessage;
  readonly timestamp: string;
  readonly model?: string;
  readonly provider?: string;
}

export interface CompactionRecord {
  readonly kind: "compaction";
  readonly summary: string;
  readonly cutIndex: number;
  readonly timestamp: string;
}

export type SessionRecord = SessionMessageRecord | CompactionRecord;

export function isMessageRecord(record: SessionRecord): record is SessionMessageRecord {
  return "message" in record;
}

export function isCompactionRecord(record: SessionRecord): record is CompactionRecord {
  return "kind" in record && record.kind === "compaction";
}

export interface SessionInfo {
  readonly id: string;
  readonly cwd: string;
  readonly updatedAt: string;
}

export interface SessionLog {
  readonly id: string;
  readonly cwd: string;
  readonly messages: readonly SessionMessage[];
  readonly records: readonly SessionRecord[];
  append(message: SessionMessage): void;
  appendCompaction(event: { summary: string; cutIndex: number }): void;
}

export interface Session {
  readonly current: SessionLog;
  create(cwd: string): SessionLog;
  open(id: string): SessionLog;
  latest(cwd: string): SessionLog | undefined;
  list(): readonly SessionInfo[];
}

export type SessionStart = "new" | "latest" | { readonly id: string };

export interface SessionPluginOptions {
  readonly cwd: string;
  readonly root?: string;
  readonly start?: SessionStart;
  readonly stamp?: () => SessionStamp;
}
