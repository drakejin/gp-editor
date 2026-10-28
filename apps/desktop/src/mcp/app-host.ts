import type { WritableFormat } from '@gp-editor/core';
import type { Command, CommandActions, CommandState } from '../lib/command-types';
import type { KeyCommand } from '../lib/key-commands';
import type { SavedFile } from '../native/gp-files';
import type { AppCommand } from '../state/app-command';
import type { PracticeAction, PracticeSettings } from '../state/practice';
import type { WorkspaceAction, WorkspaceState } from '../state/workspace';

/** What the transport shows: playing or not, the beat heard, the session's practice settings. */
export interface PlaybackView {
  readonly isPlaying: boolean;
  readonly playing?: { readonly measureIndex: number; readonly beatIndex: number };
  readonly practice: PracticeSettings;
}

/** Files written straight to a path from JS (the app's own writers), as File ▸ Export … writes them after its panel. */
export type PathExportFormat = 'midi' | 'ascii_tab' | 'musicxml' | 'mxl' | 'pdf';

/** The exports that run through a panel of the window (its options are chosen there). */
export type PanelExportFormat = 'png' | 'audio';

/** The window's files: the same handlers as File ▸ Open…, Save, Save As… and Export …. */
export interface FileHost {
  /** Reads a file into a new tab (a recent file through its bookmark); the workspace says how it went. */
  readonly open: (path: string) => Promise<void>;
  readonly showOpenPanel: () => void;
  /** ⌘S on a tab whose file the app writes; true once written. */
  readonly save: (tabId: string) => Promise<boolean>;
  /** Writes a tab's song to `path` in `format`; true once written (a failure is the tab's error). */
  readonly saveTo: (tabId: string, path: string, format: WritableFormat) => Promise<boolean>;
  readonly showSaveAsPanel: (tabId: string) => void;
  /** Writes the shown tab's song as `format` to `path`; rejects with why it could not. */
  readonly exportTo: (format: PathExportFormat, path: string) => Promise<SavedFile>;
  /** File ▸ Export MIDI… and the others: their save panel, or the export panel's for PNG and audio. */
  readonly showExportPanel: (format: PathExportFormat | PanelExportFormat) => void;
}

/** The registry's commands, in English, and what they need to run (the command palette's). */
export interface CommandHost {
  readonly list: () => readonly Command[];
  readonly state: () => CommandState;
  readonly actions: () => CommandActions;
}

/** The app as the MCP tools drive it: the window's state and the handlers its menus, keys and buttons use. */
export interface AppHost {
  /** The app runs in the App Sandbox (the shipped build): files outside what a person chose are out of reach. */
  readonly isSandboxed: boolean;
  /** The open documents now (an action dispatched through `dispatch` is in it at once). */
  readonly workspace: () => WorkspaceState;
  /** Runs an editor or tab action as the window does; returns the workspace after it. */
  readonly dispatch: (action: WorkspaceAction) => WorkspaceState;
  /** Resolves once the window has drawn what was done so far (after an asynchronous file read, say): the workspace then. */
  readonly settle: () => Promise<WorkspaceState>;
  /** A key's or a button's command, through the editor's own path (Space's playback, ⌘C …). */
  readonly runCommand: (command: AppCommand | KeyCommand) => void;
  readonly playback: () => PlaybackView;
  readonly startPlayback: (measureIndex: number) => void;
  readonly stopPlayback: () => void;
  readonly changePractice: (action: PracticeAction) => void;
  readonly files: FileHost;
  readonly commands: CommandHost;
}
