import { RPC_ERROR, parseRpcBody, rpcError, rpcResult } from '../src/mcp/json-rpc';

describe('parseRpcBody', () => {
  it('reads a request with its id, method and params', () => {
    // Arrange
    const body = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list', params: { cursor: 'a' } });

    // Act
    const parsed = parseRpcBody(body);

    // Assert
    expect(parsed).toEqual({ ok: true, message: { kind: 'request', id: 7, method: 'tools/list', params: { cursor: 'a' } } });
  });

  it('reads a request without params as one with empty params, and a string id', () => {
    expect(parseRpcBody('{"jsonrpc":"2.0","id":"x-1","method":"ping"}')).toEqual({ ok: true, message: { kind: 'request', id: 'x-1', method: 'ping', params: {} } });
  });

  it('reads a message without an id as a notification', () => {
    expect(parseRpcBody('{"jsonrpc":"2.0","method":"notifications/initialized"}')).toEqual({
      ok: true,
      message: { kind: 'notification', method: 'notifications/initialized', params: {} },
    });
  });

  it('reads a result or an error with an id as a response the server only acknowledges', () => {
    expect(parseRpcBody('{"jsonrpc":"2.0","id":3,"result":{}}')).toEqual({ ok: true, message: { kind: 'response' } });
    expect(parseRpcBody('{"jsonrpc":"2.0","id":3,"error":{"code":1,"message":"no"}}')).toEqual({ ok: true, message: { kind: 'response' } });
  });

  it('answers text that is not JSON with a parse error without an id', () => {
    expect(parseRpcBody('{"jsonrpc":')).toEqual({ ok: false, error: { jsonrpc: '2.0', error: { code: RPC_ERROR.parseError, message: 'Parse error: the body is not JSON' } } });
  });

  it.each([
    ['an array (a batch)', '[{"jsonrpc":"2.0","id":1,"method":"ping"}]'],
    ['another JSON-RPC version', '{"jsonrpc":"1.0","id":1,"method":"ping"}'],
    ['a null id', '{"jsonrpc":"2.0","id":null,"method":"ping"}'],
    ['a fractional id', '{"jsonrpc":"2.0","id":1.5,"method":"ping"}'],
    ['params that are not an object', '{"jsonrpc":"2.0","id":1,"method":"ping","params":[1]}'],
    ['no method and no result', '{"jsonrpc":"2.0","id":1}'],
    ['a number', '42'],
  ])('answers %s with an invalid request error', (_, body) => {
    const parsed = parseRpcBody(body);

    expect(parsed.ok).toBe(false);
    expect(parsed.ok ? undefined : parsed.error.error.code).toBe(RPC_ERROR.invalidRequest);
  });

  it('keeps the id of an invalid request when it can read one', () => {
    const parsed = parseRpcBody('{"jsonrpc":"2.0","id":9,"method":5}');

    expect(parsed.ok ? undefined : parsed.error).toEqual({ jsonrpc: '2.0', id: 9, error: { code: RPC_ERROR.invalidRequest, message: expect.stringContaining('method') } });
  });
});

describe('rpcResult and rpcError', () => {
  it('wrap a result and an error with the request id', () => {
    expect(rpcResult(4, { tools: [] })).toEqual({ jsonrpc: '2.0', id: 4, result: { tools: [] } });
    expect(rpcError('a', { code: RPC_ERROR.methodNotFound, message: 'Method not found: x' })).toEqual({
      jsonrpc: '2.0',
      id: 'a',
      error: { code: -32601, message: 'Method not found: x' },
    });
  });

  it('leaves the id out of an error that answers no readable request, and keeps its data', () => {
    expect(rpcError(undefined, { code: RPC_ERROR.invalidRequest, message: 'Forbidden', data: { reason: 'origin' } })).toEqual({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Forbidden', data: { reason: 'origin' } },
    });
  });
});
