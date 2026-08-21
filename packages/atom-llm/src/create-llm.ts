import { OpenAiCompatOverflowError, streamChatCompletions } from "atom-openai-compat";
import type { CompatChunk, CompatMessage, CompatToolDefinition } from "atom-openai-compat";

export interface LlmPluginOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

type LlmChunk =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "thinking"; readonly text: string }
  | {
      readonly type: "toolCall";
      readonly id: string;
      readonly name: string;
      readonly arguments: unknown;
    };

interface LlmRequest {
  readonly messages: readonly Message[];
  readonly tools: readonly ToolDefinition[];
  readonly signal?: AbortSignal;
}

type Message =
  | { readonly role: "user"; readonly content: string }
  | {
      readonly role: "assistant";
      readonly content: readonly LlmChunk[];
    }
  | {
      readonly role: "toolResult";
      readonly toolCallId: string;
      readonly name: string;
      readonly content: string;
      readonly isError?: boolean;
    };

interface ToolDefinition {
  readonly name: string;
  readonly description?: string;
  readonly parameters?: unknown;
}

interface Llm {
  stream(request: LlmRequest): AsyncIterable<LlmChunk>;
}

export function createLlm(options: LlmPluginOptions = {}): Llm {
  return {
    async *stream(request) {
      const apiKey = options.apiKey ?? "";
      const baseUrl = options.baseUrl ?? "";
      const model = options.model ?? "";
      if (!apiKey || !baseUrl || !model) {
        throw new Error("llm 插件未配置 apiKey、baseUrl 或 model");
      }
      try {
        for await (const chunk of streamChatCompletions({
          apiKey,
          baseUrl,
          model,
          messages: request.messages.map(toCompatMessage),
          tools: request.tools.map(toCompatTool),
          signal: request.signal,
        })) {
          yield toLlmChunk(chunk);
        }
      } catch (error) {
        throw translateFailure(error);
      }
    },
  };
}

function translateFailure(error: unknown): Error {
  if (error instanceof OpenAiCompatOverflowError) {
    const overflow = new Error(error.message);
    overflow.name = "ContextOverflowError";
    return overflow;
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function toCompatMessage(message: Message): CompatMessage {
  if (message.role === "user") {
    return { role: "user", content: message.content };
  }
  if (message.role === "toolResult") {
    return {
      role: "tool",
      toolCallId: message.toolCallId,
      name: message.name,
      content: message.content,
      isError: message.isError,
    };
  }
  return {
    role: "assistant",
    content: message.content.map(toCompatChunk),
  };
}

function toCompatTool(tool: ToolDefinition): CompatToolDefinition {
  return {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
}

function toCompatChunk(chunk: LlmChunk): CompatChunk {
  if (chunk.type === "toolCall") {
    return {
      type: "toolCall",
      id: chunk.id,
      name: chunk.name,
      arguments: chunk.arguments,
    };
  }
  return { type: chunk.type, text: chunk.text };
}

function toLlmChunk(chunk: CompatChunk): LlmChunk {
  if (chunk.type === "toolCall") {
    return {
      type: "toolCall",
      id: chunk.id,
      name: chunk.name,
      arguments: chunk.arguments,
    };
  }
  return { type: chunk.type, text: chunk.text };
}
