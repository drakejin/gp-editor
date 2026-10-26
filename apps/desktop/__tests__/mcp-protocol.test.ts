import { RPC_ERROR, type RpcMessage } from '../src/mcp/json-rpc';
import { type McpServer, handleRpc } from '../src/mcp/mcp-protocol';
import type { McpTool } from '../src/mcp/tool-types';

interface FakeHost {
  readonly calls: string[];
}

const ECHO: McpTool<FakeHost> = {
  name: 'echo',
  title: 'Echo',
  description: 'Says the text back.',
  inputSchema: { type: 'object', properties: { text: { type: 'string', minLength: 1 } }, required: ['text'], additionalProperties: false },
  annotations: { readOnlyHint: true },
  run: (args, host) => {
    host.calls.push(String(args.text));
    return { text: `echo ${String(args.text)}`, structured: { text: args.text } };
  },
};

const SLOW: McpTool<FakeHost> = {
  name: 'slow',
  title: 'Slow',
  description: 'Never answers.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: {},
  run: () => new Promise(() => undefined),
};

const BROKEN: McpTool<FakeHost> = {
  name: 'broken',
  title: 'Broken',
  description: 'Throws.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: {},
  run: () => {
    throw new Error('the score is not open');
  },
};

function server(host: FakeHost = { calls: [] }): McpServer<FakeHost> {
  return { info: { name: 'gp-editor', title: 'GP Editor', version: '0.16.0' }, instructions: 'Drive GP Editor.', tools: [ECHO, SLOW, BROKEN], host, toolTimeoutMs: 50 };
}

const MODERN_META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'claude-code', version: '3.1.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

function request(method: string, params: Record<string, unknown> = {}, id: number | string = 1): RpcMessage {
  return { kind: 'request', id, method, params };
}

function modernHeaders(method: string, name?: string): Record<string, string> {
  return { 'mcp-protocol-version': '2026-07-28', 'mcp-method': method, ...(name === undefined ? {} : { 'mcp-name': name }) };
}

describe('handleRpc, legacy clients (initialize)', () => {
  it('answers initialize with the version asked for when it speaks it, its tools capability and who it is', async () => {
    // Arrange
    const message = request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'inspector', version: '1.0' } });

    // Act
    const outcome = await handleRpc(message, {}, server());

    // Assert
    expect(outcome.status).toBe(200);
    expect(outcome.body).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'gp-editor', title: 'GP Editor', version: '0.16.0' },
        instructions: 'Drive GP Editor.',
      },
    });
    expect(outcome.summary).toEqual({ client: 'inspector 1.0', request: 'initialize', outcome: 'ok', isError: false });
  });

  it('offers its newest legacy version to a client asking for one it does not speak', async () => {
    const outcome = await handleRpc(request('initialize', { protocolVersion: '2024-11-05', capabilities: {} }), {}, server());

    expect(outcome.body).toMatchObject({ result: { protocolVersion: '2025-11-25' } });
  });

  it('answers ping and lists its tools in a fixed order with their schemas', async () => {
    const headers = { 'mcp-protocol-version': '2025-11-25' };

    const ping = await handleRpc(request('ping'), headers, server());
    const list = await handleRpc(request('tools/list', {}, 2), headers, server());

    expect(ping.body).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
    const tools = (list.body as unknown as { result: { tools: { name: string; inputSchema: unknown; annotations: unknown }[] } }).result.tools;
    expect(tools.map((tool) => tool.name)).toEqual(['echo', 'slow', 'broken']);
    expect(tools[0]).toEqual({ name: 'echo', title: 'Echo', description: 'Says the text back.', inputSchema: ECHO.inputSchema, annotations: { readOnlyHint: true } });
  });

  it('takes a request without MCP-Protocol-Version as 2025-03-26', async () => {
    const outcome = await handleRpc(request('tools/list'), {}, server());

    expect(outcome.status).toBe(200);
  });

  it('refuses a version header it does not speak with 400 and the versions it does', async () => {
    const outcome = await handleRpc(request('tools/list'), { 'mcp-protocol-version': '2024-11-05' }, server());

    expect(outcome.status).toBe(400);
    expect(outcome.body).toMatchObject({ error: { code: RPC_ERROR.unsupportedProtocolVersion, data: { supported: ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'], requested: '2024-11-05' } } });
  });

  it('answers an unknown method with Method not found in a 200 answer', async () => {
    const outcome = await handleRpc(request('resources/list'), {}, server());

    expect(outcome.status).toBe(200);
    expect(outcome.body).toMatchObject({ error: { code: RPC_ERROR.methodNotFound, message: 'Method not found: resources/list' } });
  });
});

describe('handleRpc, modern clients (2026-07-28, per-request _meta)', () => {
  it('answers server/discover with the versions, capabilities, instructions and caching hints', async () => {
    const outcome = await handleRpc(request('server/discover', { _meta: MODERN_META }), modernHeaders('server/discover'), server());

    expect(outcome.status).toBe(200);
    expect(outcome.body).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        resultType: 'complete',
        supportedVersions: ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26'],
        capabilities: { tools: {} },
        instructions: 'Drive GP Editor.',
        ttlMs: 3_600_000,
        cacheScope: 'private',
        _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'gp-editor', title: 'GP Editor', version: '0.16.0' } },
      },
    });
    expect(outcome.summary.client).toBe('claude-code 3.1.0');
  });

  it('marks tools/list complete and cacheable', async () => {
    const outcome = await handleRpc(request('tools/list', { _meta: MODERN_META }), modernHeaders('tools/list'), server());

    expect(outcome.body).toMatchObject({ result: { resultType: 'complete', ttlMs: 3_600_000, cacheScope: 'private' } });
  });

  it('answers an unknown method with 404 and Method not found', async () => {
    const outcome = await handleRpc(request('initialize', { _meta: MODERN_META }), modernHeaders('initialize'), server());

    expect(outcome.status).toBe(404);
    expect(outcome.body).toMatchObject({ error: { code: RPC_ERROR.methodNotFound } });
  });

  it.each([
    ['a missing Mcp-Method', { 'mcp-protocol-version': '2026-07-28' }],
    ['an Mcp-Method that is not the body’s', modernHeaders('tools/call', 'echo')],
    ['an MCP-Protocol-Version that is not the body’s', { ...modernHeaders('tools/list'), 'mcp-protocol-version': '2025-11-25' }],
  ])('refuses %s with 400 HeaderMismatch', async (_, headers) => {
    const outcome = await handleRpc(request('tools/list', { _meta: MODERN_META }), headers, server());

    expect(outcome.status).toBe(400);
    expect(outcome.body).toMatchObject({ error: { code: RPC_ERROR.headerMismatch } });
  });

  it('checks Mcp-Name against the tool called, decoding the base64 sentinel', async () => {
    const params = { name: 'echo', arguments: { text: 'hi' }, _meta: MODERN_META };

    const wrong = await handleRpc(request('tools/call', params), modernHeaders('tools/call', 'slow'), server());
    const encoded = await handleRpc(request('tools/call', params), modernHeaders('tools/call', '=?base64?ZWNobw==?='), server());

    expect(wrong.status).toBe(400);
    expect(encoded.status).toBe(200);
  });

  it('refuses a request whose _meta lacks the client capabilities with 400 Invalid params', async () => {
    const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' };

    const outcome = await handleRpc(request('tools/list', { _meta: meta }), modernHeaders('tools/list'), server());

    expect(outcome.status).toBe(400);
    expect(outcome.body).toMatchObject({ error: { code: RPC_ERROR.invalidParams } });
  });

  it('refuses a modern version header on a request without _meta (a modern request must carry it)', async () => {
    const outcome = await handleRpc(request('tools/list'), modernHeaders('tools/list'), server());

    expect(outcome.status).toBe(400);
    expect(outcome.body).toMatchObject({ error: { code: RPC_ERROR.invalidParams } });
  });

  it('refuses a version it does not speak with 400 UnsupportedProtocolVersion', async () => {
    const meta = { ...MODERN_META, 'io.modelcontextprotocol/protocolVersion': '2030-01-01' };

    const outcome = await handleRpc(request('tools/list', { _meta: meta }), { ...modernHeaders('tools/list'), 'mcp-protocol-version': '2030-01-01' }, server());

    expect(outcome.status).toBe(400);
    expect(outcome.body).toMatchObject({ error: { code: RPC_ERROR.unsupportedProtocolVersion, data: { requested: '2030-01-01' } } });
  });
});

describe('handleRpc, tools/call', () => {
  const legacy = { 'mcp-protocol-version': '2025-11-25' };

  it('runs the tool with its arguments and answers its text and structured content', async () => {
    // Arrange
    const host = { calls: [] as string[] };

    // Act
    const outcome = await handleRpc(request('tools/call', { name: 'echo', arguments: { text: 'riff' } }), legacy, server(host));

    // Assert
    expect(host.calls).toEqual(['riff']);
    expect(outcome.body).toEqual({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'echo riff' }], structuredContent: { text: 'riff' }, isError: false } });
    expect(outcome.summary).toEqual({ client: 'unknown', request: 'tools/call echo', outcome: 'ok', isError: false });
  });

  it('answers arguments that do not fit the schema with a tool error the model can correct, without running it', async () => {
    const host = { calls: [] as string[] };

    const outcome = await handleRpc(request('tools/call', { name: 'echo', arguments: { text: '' } }), legacy, server(host));

    expect(host.calls).toEqual([]);
    expect(outcome.body).toEqual({ jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'Invalid arguments: arguments.text must have at least 1 character' }], isError: true } });
    expect(outcome.summary.outcome).toBe('error: Invalid arguments: arguments.text must have at least 1 character');
  });

  it('answers an unknown tool, or no name, with Invalid params', async () => {
    const unknown = await handleRpc(request('tools/call', { name: 'play_solo' }), legacy, server());
    const unnamed = await handleRpc(request('tools/call', {}), legacy, server());

    expect(unknown.body).toMatchObject({ error: { code: RPC_ERROR.invalidParams, message: 'Unknown tool: play_solo' } });
    expect(unnamed.body).toMatchObject({ error: { code: RPC_ERROR.invalidParams } });
  });

  it('turns a tool that throws into a tool error', async () => {
    const outcome = await handleRpc(request('tools/call', { name: 'broken' }), legacy, server());

    expect(outcome.body).toMatchObject({ result: { content: [{ type: 'text', text: 'the score is not open' }], isError: true } });
  });

  it('gives up on a tool that does not answer in time, so the client does not hang', async () => {
    const outcome = await handleRpc(request('tools/call', { name: 'slow' }), legacy, server());

    expect(outcome.body).toMatchObject({ result: { isError: true, content: [{ type: 'text', text: expect.stringContaining('did not answer within 50 ms') }] } });
  });

  it('adds resultType and serverInfo to a modern call’s result', async () => {
    const params = { name: 'echo', arguments: { text: 'a' }, _meta: MODERN_META };

    const outcome = await handleRpc(request('tools/call', params), modernHeaders('tools/call', 'echo'), server());

    expect(outcome.body).toMatchObject({ result: { resultType: 'complete', isError: false, _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'gp-editor' } } } });
  });
});

describe('handleRpc, notifications and responses', () => {
  it('accepts a notification or a response with 202 and no body', async () => {
    const notification = await handleRpc({ kind: 'notification', method: 'notifications/initialized', params: {} }, {}, server());
    const response = await handleRpc({ kind: 'response' }, {}, server());

    expect(notification).toEqual({ status: 202, summary: { client: 'unknown', request: 'notifications/initialized', outcome: 'accepted', isError: false } });
    expect(response.status).toBe(202);
    expect(response.body).toBeUndefined();
  });

  it('names the client by its User-Agent when the request does not', async () => {
    const outcome = await handleRpc(request('ping'), { 'user-agent': 'node' }, server());

    expect(outcome.summary.client).toBe('node');
  });
});
