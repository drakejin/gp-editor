import { NativeModules } from 'react-native';
import type { McpHttpRequest, McpHttpResponse } from '../mcp/mcp-http';
import { subscribeNativeEvents } from './native-events';

/**
 * JS side of macos/GPEditor-macOS/GPMcpServer.m: the MCP server's native listener (127.0.0.1 only) hands each HTTP
 * request to JS as an `mcpRequest` event and writes back what `respondMcp` answers; it keeps the server's log and its
 * menu bar item. The listener runs while the app does, across JS reloads; requests reach JS only while it is attached.
 */

/** What the listener enforces itself, so a request over them never reaches JS. */
export interface McpListenerLimits {
  readonly maxBodyBytes: number;
  /** The listener answers 504 itself when JS has not answered by then. */
  readonly responseTimeoutMs: number;
}

/** What the native side says about the app the server runs in. */
export interface McpAppInfo {
  readonly version: string;
  readonly isSandboxed: boolean;
}

/** A request from the listener: its id (to answer), and the HTTP request as read. */
export interface McpNativeRequest extends McpHttpRequest {
  readonly id: string;
}

interface GPMcpServerModule {
  attach(limits: McpListenerLimits): Promise<McpAppInfo>;
  detach(): void;
  respond(requestId: string, response: Readonly<Record<string, unknown>>): void;
}

const native = NativeModules.GPMcpServer as GPMcpServerModule | undefined;

/** Starts taking requests with these limits; the app's version and sandbox. Rejects where the module is missing. */
export function attachMcpServer(limits: McpListenerLimits): Promise<McpAppInfo> {
  // i18n-exempt: a developer's diagnostic naming the native module
  return native === undefined ? Promise.reject(new Error('GPMcpServer native module is not available on this platform')) : native.attach(limits);
}

/** JS stops taking requests (the listener answers 503 until it attaches again). */
export function detachMcpServer(): void {
  native?.detach();
}

/** The answer to request `id`, and what the server log keeps of it. */
export function respondMcp(id: string, response: McpHttpResponse): void {
  const { status, headers, body, summary } = response;
  native?.respond(id, { status, headers, body, client: summary.client, request: summary.request, outcome: summary.outcome, isError: summary.isError });
}

function isStringRecord(value: unknown): value is Readonly<Record<string, string>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

/** An `mcpRequest` event's body checked (the bridge carries untyped values); undefined when it is not one. */
export function parseMcpRequest(body: unknown): McpNativeRequest | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const { id, method, target, headers, body: text, port } = body as Readonly<Record<string, unknown>>;
  const isRequest =
    typeof id === 'string' && typeof method === 'string' && typeof target === 'string' && isStringRecord(headers) && typeof text === 'string' && typeof port === 'number' && Number.isInteger(port);
  return isRequest ? { id, method, target, headers, body: text, port } : undefined;
}

/** Calls `listener` for each request the listener hands over; returns the unsubscribe function. */
export function subscribeMcpRequests(listener: (request: McpNativeRequest) => void): () => void {
  return subscribeNativeEvents(native, {
    mcpRequest: (body: unknown) => {
      const request = parseMcpRequest(body);
      if (request !== undefined) {
        listener(request);
      }
    },
  });
}
