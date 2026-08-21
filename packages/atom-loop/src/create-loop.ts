import { isContextOverflowError, LOOP_EVENTS } from "./types.ts";
import type {
  AssistantBlock,
  AssistantMessage,
  Compact,
  CompactReason,
  CompactResult,
  Llm,
  LlmChunk,
  Loop,
  Message,
  Tool,
  ToolDefinition,
  ToolResultMessage,
  Tools,
} from "./types.ts";

export function createLoop(deps: {
  emit: (topic: string, payload?: unknown) => void;
  getLlm: () => Llm;
  getTools: () => Tools;
  getCompact?: () => Compact | undefined;
  initialMessages?: readonly Message[];
  persist?: (message: Message) => void;
  persistCompaction?: (event: { summary: string; cutIndex: number }) => void;
}): Loop {
  const messages: Message[] = [...(deps.initialMessages ?? [])];
  const push = (message: Message) => {
    messages.push(message);
    deps.persist?.(message);
  };

  return {
    get messages() {
      return messages;
    },
    async prompt(text, options) {
      const signal = options?.signal;
      push({ role: "user", content: text });

      while (true) {
        signal?.throwIfAborted();
        deps.emit(LOOP_EVENTS.turnStart, {});
        let calls: Extract<AssistantBlock, { type: "toolCall" }>[] = [];
        try {
          const tools = deps.getTools().list();
          const assistant = await consumeStream({
            llm: deps.getLlm(),
            compact: deps.getCompact?.(),
            persistCompaction: deps.persistCompaction,
            messages,
            tools,
            signal,
            emit: deps.emit,
          });
          push(assistant);
          calls = assistant.content.filter((block) => block.type === "toolCall");
          for (const call of calls) {
            const result = await runTool(call, tools, signal, deps.emit);
            push(result);
          }
        } finally {
          deps.emit(LOOP_EVENTS.turnEnd, {});
        }
        if (calls.length === 0) {
          return;
        }
      }
    },
  };
}

async function consumeStream(input: {
  llm: Llm;
  compact?: Compact;
  persistCompaction?: (event: { summary: string; cutIndex: number }) => void;
  messages: readonly Message[];
  tools: readonly Tool[];
  signal?: AbortSignal;
  emit: (topic: string, payload?: unknown) => void;
}): Promise<AssistantMessage> {
  const original = input.messages;
  const first = await applyCompact(input.compact, original, "threshold");
  noteCompaction(first, input.persistCompaction);
  try {
    return await drainStream(input, first.messages);
  } catch (error) {
    if (!isContextOverflowError(error) || !input.compact) {
      throw error;
    }
    const overflow = await applyCompact(input.compact, original, "overflow");
    if (!overflow.shortened || !isShorter(overflow.messages, original)) {
      throw error;
    }
    noteCompaction(overflow, input.persistCompaction);
    return await drainStream(input, overflow.messages);
  }
}

async function applyCompact(
  compact: Compact | undefined,
  messages: readonly Message[],
  reason: CompactReason,
): Promise<CompactResult> {
  if (!compact) {
    return { messages, shortened: false };
  }
  return await compact.compact(messages, reason);
}

function noteCompaction(
  result: CompactResult,
  persist?: (event: { summary: string; cutIndex: number }) => void,
) {
  if (!result.shortened || result.summary === undefined || result.cutIndex === undefined) {
    return;
  }
  persist?.({ summary: result.summary, cutIndex: result.cutIndex });
}

function isShorter(view: readonly Message[], original: readonly Message[]): boolean {
  return JSON.stringify(view).length < JSON.stringify(original).length;
}

async function drainStream(
  input: {
    llm: Llm;
    tools: readonly Tool[];
    signal?: AbortSignal;
    emit: (topic: string, payload?: unknown) => void;
  },
  messages: readonly Message[],
): Promise<AssistantMessage> {
  const blocks: AssistantBlock[] = [];
  const tools: ToolDefinition[] = input.tools.map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));

  for await (const chunk of input.llm.stream({
    messages,
    tools,
    signal: input.signal,
  })) {
    input.signal?.throwIfAborted();
    appendChunk(blocks, chunk, input.emit);
  }

  return { role: "assistant", content: blocks };
}

function appendChunk(
  blocks: AssistantBlock[],
  chunk: LlmChunk,
  emit: (topic: string, payload?: unknown) => void,
) {
  if (chunk.type === "toolCall") {
    blocks.push({
      type: "toolCall",
      id: chunk.id,
      name: chunk.name,
      arguments: chunk.arguments,
    });
    return;
  }

  emit(LOOP_EVENTS.assistantDelta, { type: chunk.type, text: chunk.text });
  const last = blocks.at(-1);
  if (last && last.type === chunk.type) {
    blocks[blocks.length - 1] = { type: chunk.type, text: last.text + chunk.text };
    return;
  }
  blocks.push({ type: chunk.type, text: chunk.text });
}

async function runTool(
  call: Extract<AssistantBlock, { type: "toolCall" }>,
  tools: readonly Tool[],
  signal: AbortSignal | undefined,
  emit: (topic: string, payload?: unknown) => void,
): Promise<ToolResultMessage> {
  emit(LOOP_EVENTS.toolStart, { id: call.id, name: call.name, arguments: call.arguments });
  let content = "";
  let isError = false;
  try {
    signal?.throwIfAborted();
    const tool = tools.find((item) => item.name === call.name);
    if (!tool) {
      isError = true;
      content = `未知工具: ${call.name}`;
    } else {
      content = await tool.execute(call.arguments, signal);
    }
  } catch (error) {
    isError = true;
    content = error instanceof Error ? error.message : String(error);
    signal?.throwIfAborted();
  } finally {
    emit(LOOP_EVENTS.toolEnd, { id: call.id, name: call.name, content, isError });
  }
  return {
    role: "toolResult",
    toolCallId: call.id,
    name: call.name,
    content,
    isError,
  };
}
