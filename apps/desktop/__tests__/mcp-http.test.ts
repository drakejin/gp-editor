import { RPC_ERROR } from '../src/mcp/json-rpc';
import { type McpHttpRequest, handleMcpHttp } from '../src/mcp/mcp-http';
import type { McpServer } from '../src/mcp/mcp-protocol';

const SERVER: McpServer<undefined> = { info: { name: 'gp-editor', title: 'GP Editor', version: '0.16.0' }, instructions: 'Drive GP Editor.', tools: [], host: undefined, toolTimeoutMs: 50 };

const PING = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' });

function post(overrides: Partial<McpHttpRequest> = {}, headers: Record<string, string> = {}): McpHttpRequest {
  return {
    method: 'POST',
    target: '/mcp',
    port: 18256,
    body: PING,
    ...overrides,
    headers: { host: '127.0.0.1:18256', 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers, ...overrides.headers },
  };
}

function bodyOf(body: string): unknown {
  return body === '' ? undefined : JSON.parse(body);
}

describe('handleMcpHttp', () => {
  it('answers a JSON-RPC request with 200 and a JSON body that is not cached', async () => {
    // Arrange
    const request = post();

    // Act
    const response = await handleMcpHttp(request, SERVER);

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers).toEqual({ 'content-type': 'application/json', 'cache-control': 'no-store' });
    expect(bodyOf(response.body)).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
    expect(response.summary).toEqual({ client: 'unknown', request: 'ping', outcome: 'ok', isError: false });
  });

  it('accepts a notification with 202 and no body', async () => {
    const response = await handleMcpHttp(post({ body: '{"jsonrpc":"2.0","method":"notifications/initialized"}' }), SERVER);

    expect(response.status).toBe(202);
    expect(response.body).toBe('');
  });

  it.each([
    ['a web page’s Origin', { origin: 'https://evil.example' }],
    ['a DNS-rebound Host', { host: 'evil.example:18256' }],
    ['a Host on another port', { host: '127.0.0.1:9999' }],
  ])('refuses %s with 403 and a JSON-RPC error without an id', async (_, headers) => {
    const response = await handleMcpHttp(post({}, headers), SERVER);

    expect(response.status).toBe(403);
    expect(bodyOf(response.body)).toEqual({ jsonrpc: '2.0', error: { code: RPC_ERROR.invalidRequest, message: expect.stringMatching(/^Forbidden/) } });
    expect(response.summary.isError).toBe(true);
    expect(response.summary.outcome).toMatch(/^refused 403/);
  });

  it('refuses the Host check before reading anything else (a DNS-rebound GET too)', async () => {
    const response = await handleMcpHttp(post({ method: 'GET', body: '' }, { host: 'evil.example:18256' }), SERVER);

    expect(response.status).toBe(403);
  });

  it('answers another path with 404', async () => {
    expect((await handleMcpHttp(post({ target: '/' }), SERVER)).status).toBe(404);
    expect((await handleMcpHttp(post({ target: '/mcp/extra' }), SERVER)).status).toBe(404);
  });

  it('takes the endpoint with a query string', async () => {
    expect((await handleMcpHttp(post({ target: '/mcp?client=x' }), SERVER)).status).toBe(200);
  });

  it.each(['GET', 'DELETE', 'PUT', 'OPTIONS'])('answers %s with 405 and Allow: POST (no standalone stream, no sessions)', async (method) => {
    const response = await handleMcpHttp(post({ method, body: '' }), SERVER);

    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe('POST');
  });

  it('answers a body that is not JSON with 415, or a client that takes no JSON with 406', async () => {
    expect((await handleMcpHttp(post({}, { 'content-type': 'text/plain' }), SERVER)).status).toBe(415);
    expect((await handleMcpHttp(post({}, { accept: 'text/html' }), SERVER)).status).toBe(406);
  });

  it('answers a body over the size limit with 413 without parsing it', async () => {
    const response = await handleMcpHttp(post({ body: `"${'x'.repeat(1_048_577)}"` }), SERVER);

    expect(response.status).toBe(413);
  });

  it('counts the body’s size in UTF-8 bytes', async () => {
    // 350 000 three-byte characters: about 1 MB of UTF-8 in a string of 350 000 characters.
    const response = await handleMcpHttp(post({ body: `"${'한'.repeat(350_000)}"` }), SERVER);

    expect(response.status).toBe(413);
  });

  it('answers a body that does not parse with 400 Parse error, and a batch with 400 Invalid request', async () => {
    const broken = await handleMcpHttp(post({ body: '{' }), SERVER);
    const batch = await handleMcpHttp(post({ body: `[${PING}]` }), SERVER);

    expect(broken.status).toBe(400);
    expect(bodyOf(broken.body)).toMatchObject({ error: { code: RPC_ERROR.parseError } });
    expect(batch.status).toBe(400);
    expect(bodyOf(batch.body)).toMatchObject({ error: { code: RPC_ERROR.invalidRequest } });
  });

  it('passes the protocol’s own status on (404 for a modern unknown method)', async () => {
    const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} };
    const body = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'prompts/list', params: { _meta: meta } });

    const response = await handleMcpHttp(post({ body }, { 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'prompts/list' }), SERVER);

    expect(response.status).toBe(404);
    expect(bodyOf(response.body)).toMatchObject({ id: 2, error: { code: RPC_ERROR.methodNotFound } });
  });
});
