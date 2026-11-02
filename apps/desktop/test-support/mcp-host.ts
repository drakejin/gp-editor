// An AppHost for the MCP tools' tests: the real workspace reducer, a transport that only records, files and commands
// that answer as the test says. `call` runs a tool by name through tools/call, as a client would.

import type { Song } from '@gp-editor/core';
import { allCommands } from '../src/lib/commands';
import type { CommandActions } from '../src/lib/command-types';
import { withLanguage } from '../src/lib/i18n/i18n';
import type { AppHost, FileHost, PlaybackView } from '../src/mcp/app-host';
import type { JsonObject } from '../src/mcp/json-rpc';
import { callTool } from '../src/mcp/tool-call';
import { APP_TOOLS } from '../src/mcp/tools';
import { commandStateOf } from '../src/hooks/use-command-palette';
import type { OpenResult } from '../src/hooks/use-document';
import { openFailedMessage } from '../src/state/editor';
import { INITIAL_PRACTICE, type PracticeAction, practiceReducer } from '../src/state/practice';
import { INITIAL_WORKSPACE, type WorkspaceAction, type WorkspaceState, workspaceReducer } from '../src/state/workspace';

export interface FakeApp {
  readonly host: AppHost;
  /** What the host was asked to do that is not an editor action ("start 2", "showOpenPanel", "exportTo midi /a.mid" …). */
  readonly calls: string[];
  readonly state: () => WorkspaceState;
}

export interface FakeAppOptions {
  readonly isSandboxed?: boolean;
  readonly files?: Partial<FileHost>;
  /** What the window's open does with a path: the action it dispatches (`loaded`, `loadFailed`); nothing by default. */
  readonly openAnswer?: (path: string) => WorkspaceAction;
  /** What the window's save does with a tab (and the path given): the action it dispatches (`inTab` saved …). */
  readonly saveAnswer?: (tabId: string, path?: string) => WorkspaceAction;
  /**
   * The window draws what a file handler did only after `settle`'s first wait (a big song laid out for longer than it
   * waits): `settle()` still sees the workspace from before the handler ran; `settle(isReady)` waits until it holds.
   */
  readonly isRenderSlow?: boolean;
  readonly playing?: PlaybackView['playing'];
  readonly commandActions?: Partial<CommandActions>;
}

/** A workspace with `song` open in one tab (tab-1), its cursor on the first beat. */
export function openWorkspace(song: Song, path = '/Songs/Riff.gp5'): WorkspaceState {
  return workspaceReducer(INITIAL_WORKSPACE, { type: 'loaded', document: { fileName: path.split('/').pop() ?? 'Riff.gp5', path, song } });
}

/** Records `what` was asked and answers `value`. */
function recorded<T>(calls: string[], what: string, value: T): T {
  calls.push(what);
  return value;
}

/** What the window's open answers after dispatching `action`. */
function openResultOf(action: WorkspaceAction | undefined): OpenResult {
  if (action?.type === 'loaded') {
    return { kind: 'opened', path: action.document.path };
  }
  return action?.type === 'loadFailed' ? { kind: 'failed', message: openFailedMessage(action.message) } : { kind: 'cancelled' };
}

/** The window's file handlers: `answer` dispatches what the test says a handler does (nothing by default). */
interface FileAnswers {
  readonly open: (path: string) => WorkspaceAction | undefined;
  readonly save: (tabId: string, path?: string) => void;
}

function noFiles(calls: string[], answers: FileAnswers): FileHost {
  return {
    open: async (path) => {
      const action = answers.open(path);
      calls.push(`open ${path}`);
      return openResultOf(action);
    },
    showOpenPanel: () => recorded(calls, 'showOpenPanel', undefined),
    save: async (tabId) => {
      answers.save(tabId);
      return recorded(calls, `save ${tabId}`, true);
    },
    saveTo: async (tabId, path, format) => {
      answers.save(tabId, path);
      return recorded(calls, `saveTo ${tabId} ${path} ${format}`, true);
    },
    showSaveAsPanel: (tabId) => recorded(calls, `showSaveAsPanel ${tabId}`, undefined),
    exportTo: async (format, path) => recorded(calls, `exportTo ${format} ${path}`, { name: path.split('/').pop() ?? '', path }),
    showExportPanel: (format) => recorded(calls, `showExportPanel ${format}`, undefined),
  };
}

export function fakeApp(start: WorkspaceState, options: FakeAppOptions = {}): FakeApp {
  const calls: string[] = [];
  let workspace = start;
  // What a slow window has drawn: the workspace before the last file handler ran.
  let drawn = start;
  let practice = INITIAL_PRACTICE;
  let isPlaying = false;
  const dispatch = (action: WorkspaceAction): WorkspaceState => {
    workspace = workspaceReducer(workspace, action);
    return workspace;
  };
  const handled = <T extends WorkspaceAction>(action: T | undefined): T | undefined => {
    drawn = workspace;
    if (action !== undefined) {
      dispatch(action);
    }
    return action;
  };
  const answers: FileAnswers = {
    open: (path) => handled(options.openAnswer?.(path)),
    save: (tabId, path) => handled(options.saveAnswer?.(tabId, path)),
  };
  const actions = { runCommand: (command: unknown) => calls.push(`runCommand ${JSON.stringify(command)}`), ...options.commandActions } as unknown as CommandActions;
  const host: AppHost = {
    isSandboxed: options.isSandboxed ?? false,
    workspace: () => workspace,
    dispatch,
    settle: async (isReady) => (options.isRenderSlow === true && isReady?.(workspace) !== true ? drawn : workspace),
    runCommand: (command) => {
      calls.push(`runCommand ${command.type}`);
      isPlaying = command.type === 'togglePlayback' ? !isPlaying : isPlaying;
    },
    playback: () => ({ isPlaying, practice, playing: options.playing }),
    startPlayback: (measureIndex) => {
      calls.push(`start ${measureIndex}`);
      isPlaying = true;
    },
    stopPlayback: () => {
      calls.push('stop');
      isPlaying = false;
    },
    changePractice: (action: PracticeAction) => {
      calls.push(`practice ${action.type}`);
      practice = practiceReducer(practice, action);
    },
    files: { ...noFiles(calls, answers), ...options.files },
    commands: { list: () => withLanguage('en', allCommands), state: () => commandStateOf(workspace), actions: () => actions },
  };
  return { host, calls, state: () => workspace };
}

/** A tool's answer to a client's tools/call: its text, structured content and whether it failed. */
export async function call(app: FakeApp, name: string, args: JsonObject = {}): Promise<{ readonly text: string; readonly structured?: JsonObject; readonly isError: boolean }> {
  const outcome = await callTool({ name, arguments: args }, APP_TOOLS, app.host, 1000);
  if (!outcome.ok) {
    throw new Error(outcome.error.message);
  }
  const content = outcome.result.content as readonly { readonly text: string }[];
  return { text: content[0]?.text ?? '', structured: outcome.result.structuredContent as JsonObject | undefined, isError: outcome.isError };
}
