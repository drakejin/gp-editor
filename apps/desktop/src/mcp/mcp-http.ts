// i18n-exempt-file: HTTP answers for MCP clients, never shown in the app
// One HTTP request to the MCP endpoint (Streamable HTTP, answered with one JSON body — no SSE streams), from what the
// native listener read: the loopback-only checks first (Host, Origin: DNS rebinding and web pages are refused with
// 403), then the endpoint, the method, the body's type and size, the JSON-RPC message and the protocol's answer.

import { acceptsJson, isAllowedHost, isAllowedOrigin, isJsonContentType, utf8ByteLength } from './http-guards';
import { RPC_ERROR, parseRpcBody, rpcError } from './json-rpc';
import { type Headers, clientName } from './mcp-era';
import { MCP_LIMITS, MCP_PATH } from './mcp-limits';
import { type McpServer, handleRpc } from './mcp-protocol';
import type { LogSummary } from './tool-types';

/** A request as the native listener hands it over (header names in lower case, the body as UTF-8 text). */
export interface McpHttpRequest {
  readonly method: string;
  readonly target: string;
  readonly headers: Headers;
  readonly body: string;
  /** The port the server listens on (the Host and Origin it accepts name it). */
  readonly port: number;
}

/** The answer the native listener writes back (header names in lower case), with the log's line for it. */
export interface McpHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
  readonly summary: LogSummary;
}

const JSON_HEADERS = { 'content-type': 'application/json', 'cache-control': 'no-store' } as const;

function refusal(request: McpHttpRequest, status: number, message: string, headers: Readonly<Record<string, string>> = {}): McpHttpResponse {
  const body = JSON.stringify(rpcError(undefined, { code: RPC_ERROR.invalidRequest, message }));
  const summary = { client: clientName({}, request.headers), request: `${request.method} ${request.target}`, outcome: `refused ${status}: ${message}`, isError: true };
  return { status, headers: { ...JSON_HEADERS, ...headers }, body, summary };
}

/** Why the request is refused before its body is read, or undefined when it may go on. */
function transportRefusal(request: McpHttpRequest): McpHttpResponse | undefined {
  const { headers, port } = request;
  if (!isAllowedHost(headers.host, port)) {
    return refusal(request, 403, `Forbidden: the Host must be 127.0.0.1:${port} or localhost:${port}`);
  }
  if (!isAllowedOrigin(headers.origin, port)) {
    return refusal(request, 403, 'Forbidden: requests from web pages (an Origin header) are refused');
  }
  if (request.target.split('?')[0] !== MCP_PATH) {
    return refusal(request, 404, `Not found: the MCP endpoint is ${MCP_PATH}`);
  }
  if (request.method !== 'POST') {
    return refusal(request, 405, 'Method not allowed: send each JSON-RPC message as a POST', { allow: 'POST' });
  }
  return contentRefusal(request);
}

function contentRefusal(request: McpHttpRequest): McpHttpResponse | undefined {
  const { headers } = request;
  if (!isJsonContentType(headers['content-type'])) {
    return refusal(request, 415, 'Unsupported media type: the body must be application/json');
  }
  if (!acceptsJson(headers.accept)) {
    return refusal(request, 406, 'Not acceptable: this server answers with application/json');
  }
  if (utf8ByteLength(request.body) > MCP_LIMITS.maxBodyBytes) {
    return refusal(request, 413, `Payload too large: at most ${MCP_LIMITS.maxBodyBytes} bytes`);
  }
  return undefined;
}

/** The answer to one request to the server. */
export async function handleMcpHttp<Host>(request: McpHttpRequest, server: McpServer<Host>): Promise<McpHttpResponse> {
  const refused = transportRefusal(request);
  if (refused !== undefined) {
    return refused;
  }
  const parsed = parseRpcBody(request.body);
  if (!parsed.ok) {
    const summary = { client: clientName({}, request.headers), request: 'POST /mcp', outcome: `error: ${parsed.error.error.message}`, isError: true };
    return { status: 400, headers: JSON_HEADERS, body: JSON.stringify(parsed.error), summary };
  }
  const outcome = await handleRpc(parsed.message, request.headers, server);
  const body = outcome.body === undefined ? '' : JSON.stringify(outcome.body);
  return { status: outcome.status, headers: body === '' ? {} : JSON_HEADERS, body, summary: outcome.summary };
}

/** The answer when the server itself failed (a bug, not the request): 500 with a JSON-RPC internal error. */
export function internalErrorResponse(message: string): McpHttpResponse {
  const body = JSON.stringify(rpcError(undefined, { code: RPC_ERROR.internalError, message: `Internal error: ${message}` }));
  return { status: 500, headers: JSON_HEADERS, body, summary: { client: 'unknown', request: 'POST /mcp', outcome: `error: ${message}`, isError: true } };
}
