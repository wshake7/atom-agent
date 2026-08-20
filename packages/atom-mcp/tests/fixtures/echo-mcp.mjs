#!/usr/bin/env node
/**
 * 最小 MCP stdio server：只暴露 echo 工具，同时实现 resources/prompts
 * 以便验收桥不会把那些面登记进 tools。
 */
import { createInterface } from "node:readline";

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function result(id, value) {
  send({ jsonrpc: "2.0", id, result: value });
}

function error(id, message) {
  send({ jsonrpc: "2.0", id, error: { code: -32000, message } });
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of rl) {
  if (!line) {
    continue;
  }
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    continue;
  }
  const { id, method, params } = message;
  if (id === undefined) {
    continue;
  }
  if (method === "initialize") {
    result(id, {
      protocolVersion: params?.protocolVersion ?? "2024-11-05",
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
      },
      serverInfo: { name: "echo", version: "1.0.0" },
    });
    continue;
  }
  if (method === "ping") {
    result(id, {});
    continue;
  }
  if (method === "tools/list") {
    result(id, {
      tools: [
        {
          name: "echo",
          description: "原样返回 text",
          inputSchema: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
        },
      ],
    });
    continue;
  }
  if (method === "tools/call") {
    if (params?.name !== "echo") {
      error(id, `未知工具: ${params?.name}`);
      continue;
    }
    const text = params?.arguments?.text;
    result(id, {
      content: [{ type: "text", text: typeof text === "string" ? text : "" }],
    });
    continue;
  }
  if (method === "resources/list") {
    result(id, {
      resources: [{ uri: "echo://secret", name: "secret" }],
    });
    continue;
  }
  if (method === "prompts/list") {
    result(id, {
      prompts: [{ name: "secret-prompt" }],
    });
    continue;
  }
  error(id, `未实现: ${method}`);
}
