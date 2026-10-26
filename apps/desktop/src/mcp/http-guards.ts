// i18n-exempt-file: HTTP header names and values, never shown in the app
// The checks a local server without authentication must make (MCP Streamable HTTP, "Security & Endpoint"): it listens
// on the loopback only (natively), and a request must name the loopback in Host and come from no web page — a page's
// Origin, or its own host name after DNS rebinding, is refused. Header names arrive in lower case.

import { base64ToBytes } from '../lib/base64';

/** Host names that mean this Mac's loopback, as a Host header or an Origin writes them. */
const LOOPBACK_NAMES: readonly string[] = ['127.0.0.1', 'localhost', '[::1]'];

/** `Host: 127.0.0.1:<port>` (or localhost, [::1]): what a client of http://127.0.0.1:<port>/mcp sends. */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  if (host === undefined) {
    return false;
  }
  const value = host.trim().toLowerCase();
  return LOOPBACK_NAMES.some((name) => value === `${name}:${port}`);
}

/** No Origin (command-line clients), or the server's own: anything else is a web page reaching for the server. */
export function isAllowedOrigin(origin: string | undefined, port: number): boolean {
  if (origin === undefined) {
    return true;
  }
  const value = origin.trim().toLowerCase();
  return LOOPBACK_NAMES.some((name) => value === `http://${name}:${port}`);
}

/** The media type of a Content-Type, without its parameters. */
function mediaType(value: string): string {
  return (value.split(';')[0] ?? '').trim().toLowerCase();
}

export function isJsonContentType(contentType: string | undefined): boolean {
  return contentType !== undefined && mediaType(contentType) === 'application/json';
}

/** The client takes a JSON answer (or names no Accept at all). */
export function acceptsJson(accept: string | undefined): boolean {
  if (accept === undefined) {
    return true;
  }
  return accept.split(',').map(mediaType).some((type) => type === 'application/json' || type === 'application/*' || type === '*/*');
}

const SENTINEL = /^=\?base64\?(.*)\?=$/;

/** UTF-8 bytes as text; undefined when they are not UTF-8. */
function utf8Text(bytes: Uint8Array): string | undefined {
  try {
    return decodeURIComponent(Array.from(bytes, (byte) => `%${byte.toString(16).padStart(2, '0')}`).join(''));
  } catch {
    return undefined;
  }
}

/** An `Mcp-Name` value: as it is, or decoded from MCP's `=?base64?…?=` sentinel; undefined when that is not base64 of UTF-8. */
export function decodeHeaderValue(value: string): string | undefined {
  const encoded = SENTINEL.exec(value)?.[1];
  if (encoded === undefined) {
    return value;
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    return undefined;
  }
  return utf8Text(base64ToBytes(encoded));
}

/** The UTF-8 length of a body, in bytes. */
export function utf8ByteLength(text: string): number {
  let length = 0;
  for (const character of text) {
    const codePoint = character.codePointAt(0) ?? 0;
    length += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
  }
  return length;
}
