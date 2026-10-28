import { acceptsJson, decodeHeaderValue, isAllowedHost, isAllowedOrigin, isJsonContentType } from '../src/mcp/http-guards';

const PORT = 18256;

describe('isAllowedHost', () => {
  it.each(['127.0.0.1:18256', 'localhost:18256', 'LOCALHOST:18256', '[::1]:18256'])('accepts %s, a loopback name with the server port', (host) => {
    expect(isAllowedHost(host, PORT)).toBe(true);
  });

  it.each([
    ['a DNS-rebound name', 'evil.example:18256'],
    ['another port', '127.0.0.1:8080'],
    ['no port', 'localhost'],
    ['a LAN address', '192.168.0.4:18256'],
    ['nothing', undefined],
    ['a name that only starts like localhost', 'localhost.evil.example:18256'],
  ])('refuses %s', (_, host) => {
    expect(isAllowedHost(host, PORT)).toBe(false);
  });
});

describe('isAllowedOrigin', () => {
  it('accepts a request without an Origin (command-line clients send none)', () => {
    expect(isAllowedOrigin(undefined, PORT)).toBe(true);
  });

  it.each(['http://127.0.0.1:18256', 'http://localhost:18256', 'http://[::1]:18256'])('accepts the server’s own origin %s', (origin) => {
    expect(isAllowedOrigin(origin, PORT)).toBe(true);
  });

  it.each([
    ['a web page', 'https://evil.example'],
    ['a DNS-rebound page on the same port', 'http://evil.example:18256'],
    ['an opaque origin', 'null'],
    ['the loopback on another port', 'http://localhost:3000'],
    ['https on the server port', 'https://localhost:18256'],
    ['an empty value', ''],
  ])('refuses %s', (_, origin) => {
    expect(isAllowedOrigin(origin, PORT)).toBe(false);
  });
});

describe('isJsonContentType and acceptsJson', () => {
  it('reads the media type without its parameters, case-insensitively', () => {
    expect(isJsonContentType('application/json')).toBe(true);
    expect(isJsonContentType('Application/JSON; charset=utf-8')).toBe(true);
    expect(isJsonContentType('text/plain')).toBe(false);
    expect(isJsonContentType(undefined)).toBe(false);
  });

  it('accepts a client that takes JSON, any type, or says nothing', () => {
    expect(acceptsJson('application/json, text/event-stream')).toBe(true);
    expect(acceptsJson('*/*')).toBe(true);
    expect(acceptsJson('application/*')).toBe(true);
    expect(acceptsJson(undefined)).toBe(true);
    expect(acceptsJson('text/event-stream')).toBe(false);
  });
});

describe('decodeHeaderValue', () => {
  it('returns a plain value as it is and decodes the base64 sentinel (UTF-8)', () => {
    expect(decodeHeaderValue('write_note')).toBe('write_note');
    expect(decodeHeaderValue('=?base64?SGVsbG8sIOS4lueVjA==?=')).toBe('Hello, 世界');
  });

  it('gives undefined for a sentinel that is not base64', () => {
    expect(decodeHeaderValue('=?base64?***?=')).toBeUndefined();
  });
});
