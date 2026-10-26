// First: the native modules every src/native wrapper keeps when it loads.
import { answerNativeCalls, nativeCalls } from '../test-support/native-fakes';
import { DeviceEventEmitter } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import App from '../src/App';
import { MCP_LIMITS } from '../src/mcp/mcp-limits';
import { parseMcpRequest } from '../src/native/mcp-server';

// The MCP server as it runs in the window: App with every native module answering, requests arriving as the native
// listener sends them (`mcpRequest` events), answers read from what JS hands to GPMcpServer.respond.

jest.mock('../src/native/specs/GPScoreCanvasNativeComponent', () => 'GPScoreCanvas');
jest.mock('../src/native/focus-view', () => ({ focusView: () => undefined }));

const PORT = 18256;

beforeAll(() => answerNativeCalls((moduleName, method) => (moduleName === 'GPMcpServer' && method === 'attach' ? Promise.resolve({ version: '0.16.1', isSandboxed: false }) : undefined)));

const windows: ReactTestRenderer.ReactTestRenderer[] = [];

beforeEach(() => nativeCalls.clear());

afterEach(async () => {
  await ReactTestRenderer.act(async () => windows.splice(0).forEach((renderer) => renderer.unmount()));
});

async function openWindow(): Promise<void> {
  await ReactTestRenderer.act(async () => {
    windows.push(ReactTestRenderer.create(<App />));
  });
}

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown> | undefined;
  readonly outcome: string;
}

let nextId = 0;

/** Sends one JSON-RPC message as the listener would and waits for JS's answer. */
async function post(message: Record<string, unknown>, headers: Record<string, string> = {}): Promise<Answer> {
  const id = `request-${(nextId += 1)}`;
  const event = { id, method: 'POST', target: '/mcp', port: PORT, body: JSON.stringify({ jsonrpc: '2.0', ...message }), headers: { host: `127.0.0.1:${PORT}`, 'content-type': 'application/json', ...headers } };
  await ReactTestRenderer.act(async () => {
    DeviceEventEmitter.emit('mcpRequest', event);
    for (let tries = 0; tries < 50 && !answered(id); tries += 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
    }
  });
  const [, response] = (nativeCalls.get('GPMcpServer.respond') ?? []).find(([answerId]) => answerId === id) ?? [];
  const { status, body, outcome } = (response ?? {}) as { status: number; body: string; outcome: string };
  return { status, body: body === '' ? undefined : (JSON.parse(body) as Record<string, unknown>), outcome };
}

function answered(id: string): boolean {
  return (nativeCalls.get('GPMcpServer.respond') ?? []).some(([answerId]) => answerId === id);
}

const LEGACY = { 'mcp-protocol-version': '2025-11-25' };

describe('useMcpServer', () => {
  it('attaches to the native listener with the body and response limits', async () => {
    await openWindow();

    expect(nativeCalls.get('GPMcpServer.attach')).toEqual([[{ maxBodyBytes: MCP_LIMITS.maxBodyBytes, responseTimeoutMs: MCP_LIMITS.responseTimeoutMs }]]);
  });

  it('answers initialize with the app’s version, and tools/list with every tool', async () => {
    // Arrange
    await openWindow();

    // Act
    const initialize = await post({ id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
    const list = await post({ id: 2, method: 'tools/list' }, LEGACY);

    // Assert
    expect(initialize).toMatchObject({ status: 200, body: { result: { serverInfo: { name: 'gp-editor', version: '0.16.1' } } }, outcome: 'ok' });
    const names = ((list.body?.result as { tools: { name: string }[] }).tools ?? []).map((tool) => tool.name);
    expect(names).toEqual(expect.arrayContaining(['get_state', 'write_note', 'set_duration', 'play', 'save_as', 'export_file', 'run_command']));
  });

  it('edits the window: a new score, a note written, the window’s state read back, then undone', async () => {
    // Arrange
    await openWindow();

    // Act
    await post({ id: 1, method: 'tools/call', params: { name: 'new_document', arguments: {} } }, LEGACY);
    const written = await post({ id: 2, method: 'tools/call', params: { name: 'write_note', arguments: { string: 2, fret: 7 } } }, LEGACY);
    const state = await post({ id: 3, method: 'tools/call', params: { name: 'get_state', arguments: {} } }, LEGACY);
    const undone = await post({ id: 4, method: 'tools/call', params: { name: 'undo', arguments: {} } }, LEGACY);

    // Assert
    expect(written.body).toMatchObject({ result: { isError: false, structuredContent: { written: { notes: [{ string: 2, fret: 7 }] } } } });
    expect(state.body).toMatchObject({ result: { structuredContent: { document: { isEdited: true, canUndo: true, cursor: { string: 2 } } } } });
    expect(undone.body).toMatchObject({ result: { isError: false } });
    const setTitle = nativeCalls.get('GPFiles.setDocumentTitle') ?? [];
    expect(setTitle.at(-1)?.[0]).toMatch(/^Untitled/);
  });

  it('refuses a web page’s request with 403 before running anything', async () => {
    await openWindow();

    const refused = await post({ id: 1, method: 'tools/call', params: { name: 'new_document', arguments: {} } }, { ...LEGACY, origin: 'https://evil.example' });

    expect(refused.status).toBe(403);
    expect(nativeCalls.get('GPFiles.setDocumentTitle')?.at(-1)?.[0] ?? 'GP Editor').toBe('GP Editor');
  });

  it('detaches when the window goes', async () => {
    await openWindow();

    await ReactTestRenderer.act(async () => windows.splice(0).forEach((renderer) => renderer.unmount()));

    expect(nativeCalls.get('GPMcpServer.detach')).toHaveLength(1);
  });
});

describe('parseMcpRequest', () => {
  it('reads a request event and refuses one with a wrong field', () => {
    const event = { id: 'a', method: 'POST', target: '/mcp', headers: { host: 'localhost:1' }, body: '{}', port: 1 };

    expect(parseMcpRequest(event)).toEqual(event);
    expect(parseMcpRequest({ ...event, headers: { host: 1 } })).toBeUndefined();
    expect(parseMcpRequest({ ...event, port: 1.5 })).toBeUndefined();
    expect(parseMcpRequest(null)).toBeUndefined();
  });
});
