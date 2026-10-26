// i18n-exempt-file: protocol answers for MCP clients, never shown in the app
// The MCP methods the server answers, for both eras (mcp-era.ts): legacy `initialize`, `ping`, and for everyone
// `server/discover`, `tools/list` and `tools/call`. Each answer comes with its HTTP status and what the log keeps of it.

import { type JsonObject, type JsonRpcId, RPC_ERROR, type RpcError, type RpcErrorResponse, type RpcMessage, type RpcResultResponse, rpcError, rpcResult } from './json-rpc';
import { type Era, type Headers, META_KEY, clientName, eraOf, negotiatedVersion } from './mcp-era';
import { LIST_TTL_MS, SUPPORTED_VERSIONS } from './mcp-limits';
import { callTool } from './tool-call';
import type { LogSummary, McpTool } from './tool-types';

export interface ServerInfo {
  readonly name: string;
  readonly title: string;
  readonly version: string;
}

/** The server: who it is, what it tells the model, its tools, what they act on and how long they may take. */
export interface McpServer<Host> {
  readonly info: ServerInfo;
  readonly instructions: string;
  readonly tools: readonly McpTool<Host>[];
  readonly host: Host;
  readonly toolTimeoutMs: number;
}

/** An answer to one message: its HTTP status, its JSON body (none for 202) and its log line. */
export interface RpcOutcome {
  readonly status: number;
  readonly body?: RpcResultResponse | RpcErrorResponse;
  readonly summary: LogSummary;
}

interface RequestContext<Host> {
  readonly id: JsonRpcId;
  readonly method: string;
  readonly params: JsonObject;
  readonly era: Era;
  readonly server: McpServer<Host>;
  readonly summary: LogSummary;
}

function errorOutcome(id: JsonRpcId, status: number, error: RpcError, summary: LogSummary): RpcOutcome {
  return { status, body: rpcError(id, error), summary: { ...summary, outcome: `error: ${error.message}`, isError: true } };
}

/** A modern result carries its type and the server's identity (MCP 2026-07-28); a legacy one is sent as it is. */
function resultOutcome<Host>(context: RequestContext<Host>, result: JsonObject, outcome = 'ok', isError = false): RpcOutcome {
  const { era, server, id, summary } = context;
  const body = era.kind === 'modern' ? { resultType: 'complete', ...result, _meta: { [META_KEY.serverInfo]: server.info } } : result;
  return { status: 200, body: rpcResult(id, body), summary: { ...summary, outcome, isError } };
}

function toolList<Host>(server: McpServer<Host>): readonly JsonObject[] {
  return server.tools.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations }));
}

function cacheable<Host>(context: RequestContext<Host>, result: JsonObject): JsonObject {
  return context.era.kind === 'modern' ? { ...result, ttlMs: LIST_TTL_MS, cacheScope: 'private' } : result;
}

async function answerToolCall<Host>(context: RequestContext<Host>): Promise<RpcOutcome> {
  const { server, params, id, summary } = context;
  const called = await callTool(params, server.tools, server.host, server.toolTimeoutMs);
  if (!called.ok) {
    return errorOutcome(id, 200, called.error, summary);
  }
  const firstLine = called.text.split('\n')[0] ?? '';
  return resultOutcome(context, called.result, called.isError ? `error: ${firstLine}` : 'ok', called.isError);
}

function answerLegacyOnly<Host>(context: RequestContext<Host>): RpcOutcome | undefined {
  const { method, params, server } = context;
  if (method === 'initialize') {
    const { name, title, version } = server.info;
    const result = { protocolVersion: negotiatedVersion(params.protocolVersion), capabilities: { tools: { listChanged: false } }, serverInfo: { name, title, version }, instructions: server.instructions };
    return resultOutcome(context, result);
  }
  return method === 'ping' ? resultOutcome(context, {}) : undefined;
}

function answerSync<Host>(context: RequestContext<Host>): RpcOutcome | undefined {
  const { method, server, era } = context;
  if (method === 'tools/list') {
    return resultOutcome(context, cacheable(context, { tools: toolList(server) }));
  }
  if (era.kind === 'legacy') {
    return answerLegacyOnly(context);
  }
  if (method === 'server/discover') {
    return resultOutcome(context, cacheable(context, { supportedVersions: SUPPORTED_VERSIONS, capabilities: { tools: {} }, instructions: server.instructions }));
  }
  return undefined;
}

async function answerRequest<Host>(context: RequestContext<Host>): Promise<RpcOutcome> {
  if (context.method === 'tools/call') {
    return answerToolCall(context);
  }
  const answer = answerSync(context);
  if (answer !== undefined) {
    return answer;
  }
  // A modern server answers an unknown method with 404 (Streamable HTTP); legacy clients read the JSON-RPC error.
  return errorOutcome(context.id, context.era.kind === 'modern' ? 404 : 200, { code: RPC_ERROR.methodNotFound, message: `Method not found: ${context.method}` }, context.summary);
}

/** The answer to one JSON-RPC message (`headers` in lower case). */
export async function handleRpc<Host>(message: RpcMessage, headers: Headers, server: McpServer<Host>): Promise<RpcOutcome> {
  if (message.kind !== 'request') {
    const request = message.kind === 'notification' ? message.method : 'response';
    const client = message.kind === 'notification' ? clientName(message.params, headers) : clientName({}, headers);
    return { status: 202, summary: { client, request, outcome: 'accepted', isError: false } };
  }
  const { id, method, params } = message;
  const name = method === 'tools/call' && typeof params.name === 'string' ? ` ${params.name}` : '';
  const summary: LogSummary = { client: clientName(params, headers), request: `${method}${name}`, outcome: 'ok', isError: false };
  const check = eraOf(method, params, headers);
  if (!check.ok) {
    return errorOutcome(id, check.status, check.error, summary);
  }
  return answerRequest({ id, method, params, era: check.era, server, summary });
}
