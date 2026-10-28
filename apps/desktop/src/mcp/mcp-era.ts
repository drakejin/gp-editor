// i18n-exempt-file: protocol errors for MCP clients, never shown in the app
// Which protocol a request speaks (MCP 2026-07-28 "Versioning and Compatibility": a dual-era server). A request carrying
// `io.modelcontextprotocol/protocolVersion` in `_meta` is modern and served statelessly, its HTTP headers checked against
// its body; any other is legacy (2025-11-25 … 2025-03-26: `initialize` first, the version in MCP-Protocol-Version).

import { decodeHeaderValue } from './http-guards';
import { type JsonObject, RPC_ERROR, type RpcError, isJsonObject } from './json-rpc';
import { LEGACY_VERSIONS, MODERN_VERSIONS, SUPPORTED_VERSIONS, VERSION_WITHOUT_HEADER } from './mcp-limits';

export const META_KEY = {
  protocolVersion: 'io.modelcontextprotocol/protocolVersion',
  clientInfo: 'io.modelcontextprotocol/clientInfo',
  clientCapabilities: 'io.modelcontextprotocol/clientCapabilities',
  serverInfo: 'io.modelcontextprotocol/serverInfo',
} as const;

export type Era = { readonly kind: 'modern' | 'legacy'; readonly version: string };

/** HTTP request headers, names in lower case. */
export type Headers = Readonly<Record<string, string>>;

/** The era of a request, or the error (and its HTTP status) it is refused with. */
export type EraCheck = { readonly ok: true; readonly era: Era } | { readonly ok: false; readonly status: number; readonly error: RpcError };

function metaOf(params: JsonObject): JsonObject {
  return isJsonObject(params._meta) ? params._meta : {};
}

function unsupported(requested: string): EraCheck {
  return {
    ok: false,
    status: 400,
    error: { code: RPC_ERROR.unsupportedProtocolVersion, message: `Unsupported protocol version: ${requested}`, data: { supported: SUPPORTED_VERSIONS, requested } },
  };
}

function refused(code: number, message: string): EraCheck {
  return { ok: false, status: 400, error: { code, message } };
}

/** The headers a modern request mirrors from its body (Streamable HTTP "Server Validation"). */
function headerMismatch(method: string, params: JsonObject, version: string, headers: Headers): string | undefined {
  if (headers['mcp-protocol-version'] !== version) {
    return `MCP-Protocol-Version header ${JSON.stringify(headers['mcp-protocol-version'] ?? null)} does not match the body's ${version}`;
  }
  if (headers['mcp-method'] !== method) {
    return `Mcp-Method header ${JSON.stringify(headers['mcp-method'] ?? null)} does not match the body's ${method}`;
  }
  if (method !== 'tools/call') {
    return undefined;
  }
  const name = headers['mcp-name'] === undefined ? undefined : decodeHeaderValue(headers['mcp-name']);
  return name === params.name ? undefined : `Mcp-Name header ${JSON.stringify(name ?? null)} does not match the tool called, ${JSON.stringify(params.name ?? null)}`;
}

function modernEra(method: string, params: JsonObject, version: string, headers: Headers): EraCheck {
  const mismatch = headerMismatch(method, params, version, headers);
  if (mismatch !== undefined) {
    return refused(RPC_ERROR.headerMismatch, `Header mismatch: ${mismatch}`);
  }
  if (!isJsonObject(metaOf(params)[META_KEY.clientCapabilities])) {
    return refused(RPC_ERROR.invalidParams, `Invalid params: _meta must hold ${META_KEY.clientCapabilities}`);
  }
  return { ok: true, era: { kind: 'modern', version } };
}

function legacyEra(method: string, headers: Headers): EraCheck {
  const header = headers['mcp-protocol-version'];
  if (method === 'initialize' || header === undefined) {
    return { ok: true, era: { kind: 'legacy', version: header ?? VERSION_WITHOUT_HEADER } };
  }
  if (MODERN_VERSIONS.includes(header)) {
    return refused(RPC_ERROR.invalidParams, `Invalid params: a ${header} request must carry ${META_KEY.protocolVersion} and ${META_KEY.clientCapabilities} in params._meta`);
  }
  return LEGACY_VERSIONS.includes(header) ? { ok: true, era: { kind: 'legacy', version: header } } : unsupported(header);
}

/** The era a request is served in, from its `_meta` and headers. */
export function eraOf(method: string, params: JsonObject, headers: Headers): EraCheck {
  const version = metaOf(params)[META_KEY.protocolVersion];
  if (typeof version !== 'string') {
    return legacyEra(method, headers);
  }
  if (MODERN_VERSIONS.includes(version)) {
    return modernEra(method, params, version, headers);
  }
  return LEGACY_VERSIONS.includes(version) ? { ok: true, era: { kind: 'legacy', version } } : unsupported(version);
}

/** The version a legacy `initialize` settles on: the client's when the server speaks it, else the server's newest. */
export function negotiatedVersion(requested: unknown): string {
  return typeof requested === 'string' && LEGACY_VERSIONS.includes(requested) ? requested : (LEGACY_VERSIONS[0] ?? VERSION_WITHOUT_HEADER);
}

function implementationName(value: unknown): string | undefined {
  if (!isJsonObject(value) || typeof value.name !== 'string' || value.name.trim() === '') {
    return undefined;
  }
  const version = typeof value.version === 'string' && value.version !== '' ? ` ${value.version}` : '';
  return `${value.name.trim()}${version}`.slice(0, 80);
}

/** Who sent a request, for the log: the client info it carries (modern `_meta`, legacy `initialize`), else its User-Agent. */
export function clientName(params: JsonObject, headers: Headers): string {
  return implementationName(metaOf(params)[META_KEY.clientInfo]) ?? implementationName(params.clientInfo) ?? headers['user-agent']?.slice(0, 80) ?? 'unknown';
}
