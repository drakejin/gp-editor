// i18n-exempt-file: tool errors for MCP clients, never shown in the app
// tools/call: the named tool run with its checked arguments, within the server's time limit; what it answers, or why
// it could not, as MCP's tool result (`isError` for a failure the model can act on).

import { errorMessage } from '../lib/errors';
import { type JsonObject, RPC_ERROR, type RpcError, isJsonObject } from './json-rpc';
import { schemaProblem } from './json-schema';
import type { McpTool, ToolResult } from './tool-types';

/** A tools/call answered: the MCP result, or a protocol error (unknown tool, no name). */
export type CallOutcome = { readonly ok: true; readonly result: JsonObject; readonly isError: boolean; readonly text: string } | { readonly ok: false; readonly error: RpcError };

/** The tool's answer, or an error once `timeoutMs` has passed (the tool's work may still finish in the app). */
function withTimeout(running: Promise<ToolResult>, name: string, timeoutMs: number): Promise<ToolResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ToolResult>((resolve) => {
    timer = setTimeout(() => resolve({ text: `${name} did not answer within ${timeoutMs} ms; GP Editor may be busy (a panel or alert open in its window?)`, isError: true }), timeoutMs);
  });
  return Promise.race([running, timeout]).finally(() => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  });
}

async function runTool<Host>(tool: McpTool<Host>, args: JsonObject, host: Host, timeoutMs: number): Promise<ToolResult> {
  const problem = schemaProblem(tool.inputSchema, args);
  if (problem !== undefined) {
    return { text: `Invalid arguments: ${problem}`, isError: true };
  }
  try {
    return await withTimeout(Promise.resolve(tool.run(args, host)), tool.name, timeoutMs);
  } catch (error: unknown) {
    return { text: errorMessage(error), isError: true };
  }
}

function toCallResult(result: ToolResult): JsonObject {
  const content = [{ type: 'text', text: result.text }];
  const isError = result.isError === true;
  return result.structured === undefined ? { content, isError } : { content, structuredContent: result.structured, isError };
}

/** Runs `params.name` with `params.arguments`. */
export async function callTool<Host>(params: JsonObject, tools: readonly McpTool<Host>[], host: Host, timeoutMs: number): Promise<CallOutcome> {
  const { name } = params;
  if (typeof name !== 'string' || name === '') {
    return { ok: false, error: { code: RPC_ERROR.invalidParams, message: 'Invalid params: params.name must name a tool (see tools/list)' } };
  }
  const tool = tools.find((each) => each.name === name);
  if (tool === undefined) {
    return { ok: false, error: { code: RPC_ERROR.invalidParams, message: `Unknown tool: ${name}` } };
  }
  const args = params.arguments ?? {};
  if (!isJsonObject(args)) {
    return { ok: false, error: { code: RPC_ERROR.invalidParams, message: 'Invalid params: params.arguments must be an object' } };
  }
  const result = await runTool(tool, args, host, timeoutMs);
  return { ok: true, result: toCallResult(result), isError: result.isError === true, text: result.text };
}
