import { useEffect, useRef } from 'react';
import { errorMessage } from '../lib/errors';
import type { AppHost } from '../mcp/app-host';
import { type McpHttpResponse, handleMcpHttp, internalErrorResponse } from '../mcp/mcp-http';
import { MCP_LIMITS, SERVER_NAME, SERVER_TITLE } from '../mcp/mcp-limits';
import type { McpServer } from '../mcp/mcp-protocol';
import { APP_TOOLS, SERVER_INSTRUCTIONS } from '../mcp/tools';
import { type McpAppInfo, type McpNativeRequest, attachMcpServer, detachMcpServer, respondMcp, subscribeMcpRequests } from '../native/mcp-server';
import type { WorkspaceState } from '../state/workspace';
import { type WindowAccess, windowHost } from './mcp-window-host';
import type { WindowModel } from './use-window';

/** How long `settle` waits for a render before answering with the workspace as it is. */
const SETTLE_TIMEOUT_MS = 250;

type Waiter = () => void;

/** The window's latest render, the workspace with what the tools dispatched since, and who waits for the next render. */
interface WindowRefs {
  readonly model: { current: WindowModel };
  readonly workspace: { current: WorkspaceState };
  readonly isRenderPending: { current: boolean };
  readonly waiters: { current: readonly Waiter[] };
}

function nextRender(refs: WindowRefs): Promise<void> {
  return new Promise((resolve) => {
    refs.waiters.current = [...refs.waiters.current, resolve];
    setTimeout(resolve, SETTLE_TIMEOUT_MS);
  });
}

function windowAccess(refs: WindowRefs, isSandboxed: boolean): WindowAccess {
  return {
    isSandboxed,
    model: () => refs.model.current,
    workspace: () => refs.workspace.current,
    predict: (next) => {
      refs.workspace.current = next;
      refs.isRenderPending.current = true;
    },
    whenRendered: () => (refs.isRenderPending.current ? nextRender(refs) : Promise.resolve()),
    settle: () => nextRender(refs).then(() => refs.workspace.current),
  };
}

interface ServerOnWindow {
  readonly server: McpServer<AppHost>;
  readonly access: WindowAccess;
}

function serverOn(info: McpAppInfo, refs: WindowRefs): ServerOnWindow {
  const access = windowAccess(refs, info.isSandboxed);
  const host = windowHost(access);
  return { access, server: { info: { name: SERVER_NAME, title: SERVER_TITLE, version: info.version }, instructions: SERVER_INSTRUCTIONS, tools: APP_TOOLS, host, toolTimeoutMs: MCP_LIMITS.toolTimeoutMs } };
}

/** A request answered on a window that has drawn the requests before it; a failure of the server itself is a 500. */
async function answer(ready: Promise<ServerOnWindow>, request: McpNativeRequest): Promise<McpHttpResponse> {
  try {
    const { server, access } = await ready;
    await access.whenRendered();
    return await handleMcpHttp(request, server);
  } catch (error: unknown) {
    return internalErrorResponse(errorMessage(error));
  }
}

/**
 * The MCP server's JS half (the protocol and the tools, src/mcp/): attaches to the native listener while the window
 * is up and answers its requests one at a time, each on a window that has drawn the requests before it.
 */
export function useMcpServer(model: WindowModel): void {
  const refs = useRef<WindowRefs>({ model: { current: model }, workspace: { current: model.base.workspace }, isRenderPending: { current: false }, waiters: { current: [] } }).current;
  refs.model.current = model;
  refs.workspace.current = model.base.workspace;
  useEffect(() => {
    refs.isRenderPending.current = false;
    const waiting = refs.waiters.current;
    refs.waiters.current = [];
    waiting.forEach((resolve) => resolve());
  });
  useEffect(() => {
    let queue: Promise<void> = Promise.resolve();
    const ready = attachMcpServer({ maxBodyBytes: MCP_LIMITS.maxBodyBytes, responseTimeoutMs: MCP_LIMITS.responseTimeoutMs }).then((info) => serverOn(info, refs));
    // Without the native module (tests, other platforms) no request ever comes.
    ready.catch(() => undefined);
    const unsubscribe = subscribeMcpRequests((request) => {
      // The queue goes on whatever happens to one answer (answer itself never rejects).
      queue = queue
        .then(() => answer(ready, request))
        .then((response) => respondMcp(request.id, response))
        .catch(() => undefined);
    });
    return () => {
      unsubscribe();
      detachMcpServer();
    };
  }, [refs]);
}
