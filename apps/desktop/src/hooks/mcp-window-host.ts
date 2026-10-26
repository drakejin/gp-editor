// The MCP tools' AppHost over the window (useWindow's model): its reducer, its playback, its file handlers and the
// command palette's registry and actions — the same code its menus, keys and buttons run, never a second one.
//
// Editor actions are reduced at once (the workspace a tool reads next includes them) and dispatched to the window. The
// window's own handlers (Save, exports, Space …) read the state of its last render, so they run once the window has
// drawn what a tool dispatched before them (`whenRendered`).

import { allCommands } from '../lib/commands';
import { withLanguage } from '../lib/i18n/i18n';
import type { AppHost, FileHost, PanelExportFormat, PathExportFormat } from '../mcp/app-host';
import { type WorkspaceAction, type WorkspaceState, workspaceReducer } from '../state/workspace';
import { commandStateOf } from './use-command-palette';
import type { WindowModel } from './use-window';
import { commandActionsOf } from './use-window-commands';

/** What the host needs of the hook that holds it. */
export interface WindowAccess {
  readonly isSandboxed: boolean;
  /** The window's model of its last render. */
  readonly model: () => WindowModel;
  /** The workspace with every action dispatched so far. */
  readonly workspace: () => WorkspaceState;
  /** Keeps the workspace after an action until the window renders it. */
  readonly predict: (next: WorkspaceState) => void;
  /** Resolves at once when the window has drawn every action dispatched, else after its next render. */
  readonly whenRendered: () => Promise<void>;
  /** Resolves after the window's next render (or a moment, when nothing renders): the workspace then. */
  readonly settle: () => Promise<WorkspaceState>;
}

function showExportPanel(model: WindowModel, format: PathExportFormat | PanelExportFormat): void {
  const { songExport, pdfExport, audioExport } = model.files;
  const panels: Readonly<Record<PathExportFormat | PanelExportFormat, () => void>> = {
    midi: songExport.exportMidi,
    ascii_tab: songExport.exportAsciiTab,
    musicxml: songExport.exportMusicXml,
    mxl: songExport.exportCompressedMusicXml,
    pdf: pdfExport.open,
    png: pdfExport.openPng,
    audio: audioExport.open,
  };
  panels[format]();
}

function windowFiles(access: WindowAccess): FileHost {
  const rendered = async <T>(run: (model: WindowModel) => T | Promise<T>): Promise<T> => {
    await access.whenRendered();
    return run(access.model());
  };
  return {
    // A recent file is read through its bookmark (the sandbox's permission from when it was chosen).
    open: (path) => rendered(({ files }) => (files.recentFiles.files.some((file) => file.path === path) ? files.documents.openRecent(path) : files.documents.openPath(path))),
    showOpenPanel: () => {
      void rendered(({ files }) => files.documents.openDialog());
    },
    save: (tabId) => rendered(({ files }) => files.documents.saveTab(tabId, false)),
    saveTo: (tabId, path, format) => rendered(({ files }) => files.documents.saveTabTo(tabId, path, format)),
    // The panel stays up until the person answers it: nothing waits for the save.
    showSaveAsPanel: (tabId) => {
      void rendered(({ files }) => {
        void files.documents.saveTab(tabId, true);
      });
    },
    exportTo: (format, path) => rendered(({ files }) => (format === 'pdf' ? files.pdfExport.saveTo(path) : files.songExport.exportTo(format, path))),
    showExportPanel: (format) => {
      void rendered((model) => showExportPanel(model, format));
    },
  };
}

/** The AppHost the MCP server's tools act through. */
export function windowHost(access: WindowAccess): AppHost {
  const { model } = access;
  const afterRender = (run: (current: WindowModel) => void): void => {
    void access.whenRendered().then(() => run(model()));
  };
  return {
    isSandboxed: access.isSandboxed,
    workspace: access.workspace,
    dispatch: (action: WorkspaceAction) => {
      const next = workspaceReducer(access.workspace(), action);
      access.predict(next);
      model().base.dispatch(action);
      return next;
    },
    settle: access.settle,
    runCommand: (command) => afterRender((current) => current.commands.editor.runCommand(command)),
    playback: () => {
      const { isPlaying, playing, practice } = model().media.playback;
      return { isPlaying, playing, practice };
    },
    startPlayback: (measureIndex) => afterRender((current) => current.media.playback.start(measureIndex)),
    stopPlayback: () => model().media.playback.stop(),
    changePractice: (action) => model().media.playback.changePractice(action),
    files: windowFiles(access),
    commands: {
      list: () => withLanguage('en', allCommands),
      state: () => commandStateOf(access.workspace()),
      actions: () => commandActionsOf(model()),
    },
  };
}
