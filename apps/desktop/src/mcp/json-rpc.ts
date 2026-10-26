// i18n-exempt-file: JSON-RPC error messages for MCP clients, never shown in the app
// JSON-RPC 2.0 as MCP uses it: one message per HTTP body (no batches), ids that are strings or integers, never null.

export type JsonRpcId = string | number;

/** A JSON object read from a request (untrusted: check each value before use). */
export type JsonObject = Readonly<Record<string, unknown>>;

/** JSON-RPC's error codes and the ones MCP 2026-07-28 reserves for itself. */
export const RPC_ERROR = {
  parseError: -32700,
  invalidRequest: -32600,
  methodNotFound: -32601,
  invalidParams: -32602,
  internalError: -32603,
  headerMismatch: -32020,
  missingRequiredClientCapability: -32021,
  unsupportedProtocolVersion: -32022,
} as const;

export interface RpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

/** A message the server reads: a request (answered), a notification or a response (only acknowledged). */
export type RpcMessage =
  | { readonly kind: 'request'; readonly id: JsonRpcId; readonly method: string; readonly params: JsonObject }
  | { readonly kind: 'notification'; readonly method: string; readonly params: JsonObject }
  | { readonly kind: 'response' };

export interface RpcErrorResponse {
  readonly jsonrpc: '2.0';
  readonly id?: JsonRpcId;
  readonly error: RpcError;
}

export interface RpcResultResponse {
  readonly jsonrpc: '2.0';
  readonly id: JsonRpcId;
  readonly result: JsonObject;
}

export type ParsedBody = { readonly ok: true; readonly message: RpcMessage } | { readonly ok: false; readonly error: RpcErrorResponse };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRpcId(value: unknown): value is JsonRpcId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isInteger(value));
}

export function rpcResult(id: JsonRpcId, result: JsonObject): RpcResultResponse {
  return { jsonrpc: '2.0', id, result };
}

/** An error answer; without `id` when the request's id could not be read. */
export function rpcError(id: JsonRpcId | undefined, error: RpcError): RpcErrorResponse {
  return id === undefined ? { jsonrpc: '2.0', error } : { jsonrpc: '2.0', id, error };
}

function invalid(id: JsonRpcId | undefined, message: string): ParsedBody {
  return { ok: false, error: rpcError(id, { code: RPC_ERROR.invalidRequest, message: `Invalid request: ${message}` }) };
}

function readJson(body: string): { readonly value: unknown } | undefined {
  try {
    return { value: JSON.parse(body) as unknown };
  } catch {
    return undefined;
  }
}

/** One JSON-RPC message from an HTTP body, or the error to answer it with. */
export function parseRpcBody(body: string): ParsedBody {
  const json = readJson(body);
  if (json === undefined) {
    return { ok: false, error: rpcError(undefined, { code: RPC_ERROR.parseError, message: 'Parse error: the body is not JSON' }) };
  }
  const { value } = json;
  if (Array.isArray(value)) {
    return invalid(undefined, 'batches are not supported; send one message per request');
  }
  if (!isJsonObject(value)) {
    return invalid(undefined, 'the body is not a JSON-RPC object');
  }
  const id = isRpcId(value.id) ? value.id : undefined;
  if (value.jsonrpc !== '2.0') {
    return invalid(id, 'jsonrpc must be "2.0"');
  }
  return readMessage(value, id);
}

function readMessage(value: JsonObject, id: JsonRpcId | undefined): ParsedBody {
  const hasId = Object.prototype.hasOwnProperty.call(value, 'id');
  if (hasId && id === undefined) {
    return invalid(undefined, 'id must be a string or an integer');
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'method')) {
    const isResponse = id !== undefined && (value.result !== undefined || value.error !== undefined);
    return isResponse ? { ok: true, message: { kind: 'response' } } : invalid(id, 'method is missing');
  }
  if (typeof value.method !== 'string') {
    return invalid(id, 'method must be a string');
  }
  const params = value.params ?? {};
  if (!isJsonObject(params)) {
    return invalid(id, 'params must be an object');
  }
  const { method } = value;
  return { ok: true, message: id === undefined ? { kind: 'notification', method, params } : { kind: 'request', id, method, params } };
}
