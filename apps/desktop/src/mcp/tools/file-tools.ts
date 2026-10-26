// i18n-exempt-file: tool descriptions and answers for MCP clients (English, read by a language model), never shown in the app
// Files as the File menu handles them: a new sheet, opening, Save, Save As… (the format by the path's extension) and
// the exports. With a path the app's own readers and writers act at once; without one the window's panel opens for the
// person at the Mac. The App Store build is sandboxed: it reads and writes only what a person chose (panels, drops,
// recent files) and ~/Documents/GP Editor Projects/, so a path elsewhere fails there — the answer says so.

import { SAVE_FORMATS, saveFormatOf } from '../../lib/file-formats';
import { errorMessage } from '../../lib/errors';
import { isPdfPath } from '../../hooks/use-document';
import type { AppHost, PanelExportFormat, PathExportFormat } from '../app-host';
import { songJson, stateJson } from '../song-json';
import type { McpTool, ToolArguments, ToolResult } from '../tool-types';
import { TAB_ARGUMENT, answer, editTab, editorIn, objectSchema, optionalString, toolError } from './tool-kit';

/** Where the sandboxed app may read and write without a panel. */
export const SANDBOX_NOTE =
  'GP Editor runs in the App Sandbox: without a panel it can read and write only files a person opened or saved in it (its recent files) and anything in ~/Documents/GP Editor Projects/. Use a path there, or call this tool without a path to show the panel to the person at the Mac.';

const FILE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;

const PATH_ARGUMENT = { type: 'string', minLength: 2, maxLength: 1024, description: 'Absolute path (/Users/…). Leave it out to show the panel to the person at the Mac.' } as const;

/** The extensions a path exported in each format may have; the first is the one asked for. */
const EXPORT_EXTENSIONS: Readonly<Record<PathExportFormat, readonly string[]>> = {
  midi: ['mid', 'midi'],
  ascii_tab: ['txt'],
  musicxml: ['musicxml', 'xml'],
  mxl: ['mxl'],
  pdf: ['pdf'],
};

const PANEL_FORMATS: readonly PanelExportFormat[] = ['png', 'audio'];

function pathProblem(path: string): string | undefined {
  return path.startsWith('/') ? undefined : `Give an absolute path (starting with /), not ${JSON.stringify(path)}.`;
}

/** A failure with what the sandbox allows, when the app runs in it. */
function fileError(host: AppHost, message: string): ToolResult {
  return toolError(host.isSandboxed ? `${message}\n${SANDBOX_NOTE}` : message);
}

function extensionOf(path: string): string {
  const name = path.split('/').pop() ?? '';
  return name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : '';
}

const newDocument: McpTool<AppHost> = {
  name: 'new_document',
  title: 'New score',
  description: 'Opens a blank score in a new tab (File ▸ New): 4 bars of 4/4 at 120, one guitar track in standard tuning. view: notationAndTab (default), notation or tab.',
  inputSchema: objectSchema({ view: { type: 'string', enum: ['notationAndTab', 'notation', 'tab'], description: 'What the score shows.' } }),
  annotations: FILE,
  run: (args, host) => {
    const view = optionalString(args, 'view');
    const mode = view === 'notation' || view === 'tab' ? view : 'notationAndTab';
    const workspace = host.dispatch({ type: 'created', mode });
    return answer(`New score in ${workspace.activeTabId ?? 'a new tab'}.`, stateJson(workspace, host.playback()));
  },
};

async function openPath(host: AppHost, path: string): Promise<ToolResult> {
  await host.files.open(path);
  const workspace = await host.settle();
  if (workspace.error !== undefined) {
    return fileError(host, workspace.error);
  }
  const tab = workspace.tabs.find((each) => each.editor.document?.path === path) ?? workspace.tabs.find((each) => each.id === workspace.activeTabId);
  const song = tab?.editor.document?.song;
  return song === undefined ? toolError(`${path} did not open.`) : answer(`Opened ${path} in ${tab?.id ?? ''}.`, { tab: tab?.id ?? null, song: songJson(song) });
}

const openFile: McpTool<AppHost> = {
  name: 'open_file',
  title: 'Open a file',
  description:
    'Opens a file in a new tab, as File ▸ Open… does: Guitar Pro (.gp .gpx .gp5 .gp4 .gp3 .gtp), Power Tab (.ptb), TablEdit (.tef), MIDI (.mid) or MusicXML (.musicxml .xml .mxl). A file already open is shown. Without a path, the Open panel is shown to the person at the Mac. PDFs are not opened here (File ▸ Import PDF… asks Claude to transcribe them).',
  inputSchema: objectSchema({ path: PATH_ARGUMENT }),
  annotations: { ...FILE, openWorldHint: true },
  run: (args, host) => {
    const path = optionalString(args, 'path');
    if (path === undefined) {
      host.files.showOpenPanel();
      return answer('GP Editor shows its Open panel: the person at the Mac picks the file. Call get_state afterwards.');
    }
    const problem = pathProblem(path) ?? (isPdfPath(path) ? 'PDFs are imported with File ▸ Import PDF… in GP Editor (an AI transcription), not opened.' : undefined);
    return problem === undefined ? openPath(host, path) : toolError(problem);
  },
};

const save: McpTool<AppHost> = {
  name: 'save',
  title: 'Save',
  description: 'Saves a tab to its own file in its own format (File ▸ Save, ⌘S) when that is a format GP Editor writes (.gp .gp5 .gp4 .gp3). For a new score or another format use save_as.',
  inputSchema: objectSchema({ tab: TAB_ARGUMENT }),
  annotations: FILE,
  run: async (args, host) => {
    const target = editTab(host, args);
    if (!target.ok) {
      return target.result;
    }
    const { path } = target.tab.editor.document ?? { path: '' };
    if (path === '' || saveFormatOf(path) === undefined) {
      return toolError(`${target.tab.id} has no ${SAVE_FORMATS.map((format) => `.${format.extension}`).join(' ')} file to save to: call save_as with a path (or without one to show the Save panel).`);
    }
    const isSaved = await host.files.save(target.tab.id);
    const editor = editorIn(await host.settle(), target.tab.id);
    return isSaved ? answer(`Saved ${path}.${editor?.hint === undefined ? '' : ` ${editor.hint}`}`) : fileError(host, editor?.error ?? `${path} was not saved.`);
  },
};

async function saveTo(host: AppHost, tabId: string, path: string): Promise<ToolResult> {
  const format = saveFormatOf(path);
  if (format === undefined) {
    return toolError(`GP Editor saves ${SAVE_FORMATS.map((each) => `.${each.extension}`).join(', ')}: end the path with one of them (for MIDI, MusicXML, ASCII tab or PDF use export_file).`);
  }
  const isSaved = await host.files.saveTo(tabId, path, format.id);
  const editor = editorIn(await host.settle(), tabId);
  return isSaved ? answer(`Saved ${path} as ${format.label}.${editor?.hint === undefined ? '' : ` ${editor.hint}`}`) : fileError(host, editor?.error ?? `${path} was not saved.`);
}

const saveAs: McpTool<AppHost> = {
  name: 'save_as',
  title: 'Save as',
  description:
    'Saves a tab to a new file (File ▸ Save As…), in the format of the path’s extension: .gp (Guitar Pro 7/8, keeps everything), .gp5, .gp4 or .gp3 (what they cannot hold is said in the answer). The tab then belongs to that file. Without a path, the Save panel is shown to the person at the Mac.',
  inputSchema: objectSchema({ path: PATH_ARGUMENT, tab: TAB_ARGUMENT }),
  annotations: { ...FILE, openWorldHint: true },
  run: (args, host) => {
    const target = editTab(host, args);
    if (!target.ok) {
      return target.result;
    }
    const path = optionalString(args, 'path');
    if (path === undefined) {
      host.files.showSaveAsPanel(target.tab.id);
      return answer('GP Editor shows its Save panel: the person at the Mac picks where and in which format.');
    }
    const problem = pathProblem(path);
    return problem === undefined ? saveTo(host, target.tab.id, path) : toolError(problem);
  },
};

async function exportTo(host: AppHost, format: PathExportFormat, path: string): Promise<ToolResult> {
  const extensions = EXPORT_EXTENSIONS[format];
  if (!extensions.includes(extensionOf(path))) {
    return toolError(`A ${format} export’s path ends in .${extensions.join(' or .')}.`);
  }
  try {
    const saved = await host.files.exportTo(format, path);
    return answer(`Exported ${saved.path}.`);
  } catch (error: unknown) {
    return fileError(host, errorMessage(error));
  }
}

const exportFile: McpTool<AppHost> = {
  name: 'export_file',
  title: 'Export',
  description:
    'Exports the shown tab (or the tab given), as File ▸ Export … does: midi (as playback plays it: repeats unfolded, mute/solo), ascii_tab (the fretted tracks), musicxml, mxl (compressed MusicXML), pdf (the score as shown, on the stylesheet’s pages) — written to path at once, or through the save panel without one. png and audio always open their export panel (resolution, format and quality are chosen there) for the person at the Mac.',
  inputSchema: objectSchema(
    { format: { type: 'string', enum: [...Object.keys(EXPORT_EXTENSIONS), ...PANEL_FORMATS], description: 'What to export.' }, path: PATH_ARGUMENT, tab: TAB_ARGUMENT },
    ['format'],
  ),
  annotations: { ...FILE, openWorldHint: true },
  run: (args: ToolArguments, host) => {
    const target = editTab(host, args);
    if (!target.ok) {
      return target.result;
    }
    const format = optionalString(args, 'format') as PathExportFormat | PanelExportFormat;
    const path = optionalString(args, 'path');
    const isPanelFormat = (PANEL_FORMATS as readonly string[]).includes(format);
    if (path === undefined || isPanelFormat) {
      if (path !== undefined) {
        return toolError(`${format} exports choose their options in GP Editor’s export panel: call export_file without a path to open it.`);
      }
      host.files.showExportPanel(format);
      return answer(`GP Editor shows its ${format} export panel: the person at the Mac finishes it.`);
    }
    const problem = pathProblem(path);
    return problem === undefined ? exportTo(host, format as PathExportFormat, path) : toolError(problem);
  },
};

export const FILE_TOOLS: readonly McpTool<AppHost>[] = [newDocument, openFile, save, saveAs, exportFile];
