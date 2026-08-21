export class OpenAiCompatOverflowError extends Error {
  constructor(message = "上下文溢出") {
    super(message);
    this.name = "OpenAiCompatOverflowError";
  }
}

export type CompatChunk =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "thinking"; readonly text: string }
  | {
      readonly type: "toolCall";
      readonly id: string;
      readonly name: string;
      readonly arguments: unknown;
    };

export type CompatMessage =
  | { readonly role: "user"; readonly content: string }
  | {
      readonly role: "assistant";
      readonly content: readonly CompatChunk[];
    }
  | {
      readonly role: "tool";
      readonly toolCallId: string;
      readonly name: string;
      readonly content: string;
      readonly isError?: boolean;
    };

export interface CompatToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly parameters?: unknown;
}

export interface StreamChatCompletionsInput {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly messages: readonly CompatMessage[];
  readonly systemPrompt?: string;
  readonly tools?: readonly CompatToolDefinition[];
  readonly signal?: AbortSignal;
}

export async function* streamChatCompletions(
  input: StreamChatCompletionsInput,
): AsyncGenerator<CompatChunk> {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      stream: true,
      messages: toProviderMessages(input.systemPrompt, input.messages),
      tools: input.tools && input.tools.length > 0 ? input.tools.map(toProviderTool) : undefined,
    }),
    signal: input.signal,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw httpFailure(response.status, detail);
  }
  if (!response.body) {
    throw new Error("OpenAI 兼容调用失败: 空响应体");
  }

  let buffer = "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        yield* chunksFromFrame(frame, toolCalls);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      yield* chunksFromFrame(buffer, toolCalls);
    }
  } finally {
    reader.releaseLock();
  }
  const ordered = [...toolCalls.entries()].sort((left, right) => left[0] - right[0]);
  for (const [, call] of ordered) {
    if (call.name.length === 0) {
      continue;
    }
    yield {
      type: "toolCall",
      id: call.id,
      name: call.name,
      arguments: parseToolArguments(call.arguments),
    };
  }
}

function httpFailure(status: number, detail: string): Error {
  if (isContextOverflow(status, detail)) {
    return new OpenAiCompatOverflowError(`上下文溢出: ${status} ${detail}`);
  }
  return new Error(`OpenAI 兼容调用失败: ${status} ${detail}`);
}

function isContextOverflow(status: number, detail: string): boolean {
  if (status === 413) {
    return true;
  }
  const text = detail.toLowerCase();
  return (
    text.includes("context_length_exceeded") ||
    text.includes("context length") ||
    text.includes("maximum context") ||
    text.includes("prompt is too long")
  );
}

function toProviderMessages(
  systemPrompt: string | undefined,
  messages: readonly CompatMessage[],
): Record<string, unknown>[] {
  const translated = messages.map(toProviderMessage);
  if (typeof systemPrompt === "string" && systemPrompt.length > 0) {
    return [{ role: "system", content: systemPrompt }, ...translated];
  }
  return translated;
}

function toProviderMessage(message: CompatMessage): Record<string, unknown> {
  if (message.role === "user") {
    return { role: "user", content: message.content };
  }
  if (message.role === "tool") {
    return { role: "tool", tool_call_id: message.toolCallId, content: message.content };
  }
  const text = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  const thinking = message.content
    .filter((block) => block.type === "thinking")
    .map((block) => block.text)
    .join("");
  const toolCalls = message.content.filter((block) => block.type === "toolCall");
  return {
    role: "assistant",
    content: text.length > 0 ? text : null,
    ...(thinking.length > 0 ? { reasoning_content: thinking } : {}),
    ...(toolCalls.length > 0
      ? {
          tool_calls: toolCalls.map((block) => ({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.arguments ?? {}),
            },
          })),
        }
      : {}),
  };
}

function toProviderTool(tool: CompatToolDefinition) {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters ?? { type: "object", properties: {} },
    },
  };
}

type ProviderToolCallDelta = {
  readonly index?: number;
  readonly id?: string;
  readonly function?: { readonly name?: string; readonly arguments?: string };
};

type ParsedFrame =
  | { readonly kind: "chunk"; readonly chunk: CompatChunk }
  | { readonly kind: "toolCalls"; readonly deltas: readonly ProviderToolCallDelta[] };

function* chunksFromFrame(
  frame: string,
  toolCalls: Map<number, { id: string; name: string; arguments: string }>,
): Generator<CompatChunk> {
  const parsed = parseSseFrame(frame);
  if (!parsed) {
    return;
  }
  if (parsed.kind === "chunk") {
    yield parsed.chunk;
    return;
  }
  for (const delta of parsed.deltas) {
    accumulateToolCall(toolCalls, delta);
  }
}

function parseSseFrame(frame: string): ParsedFrame | undefined {
  const dataLines = frame
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (dataLines.length === 0) {
    return undefined;
  }
  const data = dataLines.join("\n");
  if (data === "[DONE]") {
    return undefined;
  }
  const payload = JSON.parse(data) as {
    choices?: {
      delta?: {
        content?: string | null;
        reasoning_content?: string | null;
        tool_calls?: ProviderToolCallDelta[];
      };
    }[];
  };
  const delta = payload.choices?.[0]?.delta;
  const text = delta?.content;
  if (typeof text === "string" && text.length > 0) {
    return { kind: "chunk", chunk: { type: "text", text } };
  }
  const thinking = delta?.reasoning_content;
  if (typeof thinking === "string" && thinking.length > 0) {
    return { kind: "chunk", chunk: { type: "thinking", text: thinking } };
  }
  const toolDeltas = delta?.tool_calls;
  if (toolDeltas && toolDeltas.length > 0) {
    return { kind: "toolCalls", deltas: toolDeltas };
  }
  return undefined;
}

function accumulateToolCall(
  toolCalls: Map<number, { id: string; name: string; arguments: string }>,
  delta: ProviderToolCallDelta,
) {
  const index = delta.index ?? 0;
  const current = toolCalls.get(index) ?? { id: "", name: "", arguments: "" };
  const id = delta.id && delta.id.length > 0 ? delta.id : current.id;
  const name =
    delta.function?.name && delta.function.name.length > 0 ? delta.function.name : current.name;
  toolCalls.set(index, {
    id,
    name,
    arguments: `${current.arguments}${delta.function?.arguments ?? ""}`,
  });
}

function parseToolArguments(raw: string): unknown {
  if (raw.length === 0) {
    return {};
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}
