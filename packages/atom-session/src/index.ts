import type { ResolvedPluginModule } from "atom-kernel";
import { createSession } from "./create-session.ts";
import type { SessionPluginOptions } from "./types.ts";

export { createSession } from "./create-session.ts";
export {
  isCompactionRecord,
  isMessageRecord,
  type AssistantBlock,
  type CompactionRecord,
  type Session,
  type SessionInfo,
  type SessionLog,
  type SessionMessage,
  type SessionMessageRecord,
  type SessionPluginOptions,
  type SessionRecord,
  type SessionStamp,
  type SessionStart,
} from "./types.ts";

export function createSessionPlugin(options: SessionPluginOptions): ResolvedPluginModule {
  return {
    id: "atom-session",
    apply(ctx) {
      ctx.provide("session", createSession(options));
    },
  };
}

export const plugin = createSessionPlugin({ cwd: process.cwd() });
