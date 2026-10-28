import { type PaletteContext, isToolEnabled } from '../components/palette/palette-tools';
import type { AppCommand } from '../state/app-command';
import type { McpServerCommand } from '../native/mcp-server';
import type { TrackMenuCommand } from '../native/track-menu';
import type { PanelId } from '../state/panels';
import { t } from './i18n/i18n';
import { type KeyCommand, type KeyPress, keyCommand } from './key-commands';

/** What a command's `isEnabled` reads: the document, the selection, history and tabs, and the cursor's note, beat and bar. */
export interface CommandState {
  readonly hasDocument: boolean;
  readonly hasSelection: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly tabCount: number;
  /** The shown track is a drum track. */
  readonly isPercussion: boolean;
  /** The cursor's note, voice, beat and bar, as the edition palette sees them. */
  readonly palette: PaletteContext;
  /** Open strings of the shown track, string 1 first (Expression Text's chord diagrams). */
  readonly tuning?: readonly number[];
}

/** The handlers commands call: the same ones the menus, keys and buttons reach. */
export interface CommandActions {
  /** A key's or a button's command, through the editor's own path (`useEditorCommands().runCommand`). */
  readonly runCommand: (command: AppCommand | KeyCommand) => void;
  readonly save: (saveAs: boolean) => void;
  readonly exportPng: () => void;
  readonly exportMidi: () => void;
  readonly exportAsciiTab: () => void;
  readonly exportMusicXml: () => void;
  readonly exportCompressedMusicXml: () => void;
  /** File ▸ Export Audio…: the audio export panel. */
  readonly exportAudio: () => void;
  readonly print: () => void;
  /** File ▸ Stylesheet… (F7): the stylesheet dialog. */
  readonly openStylesheet: () => void;
  readonly closeTab: () => void;
  readonly cycleTab: (step: 1 | -1) => void;
  readonly openRecentFiles: () => void;
  readonly openSongWriter: () => void;
  readonly openShortcuts: () => void;
  /** GP Editor ▸ Settings… (⌘,). */
  readonly openSettings: () => void;
  readonly openTranspose: () => void;
  readonly openTuner: () => void;
  readonly openScales: () => void;
  /** Tools ▸ Line In…: a real instrument through a track's effects. */
  readonly openLineIn: () => void;
  /** Tools ▸ Expression Text…: the palette with “>” typed (a chord, dynamic, key, octave sign, clef or direction). */
  readonly openExpressionText: () => void;
  /** The instrument picker for the shown track. */
  readonly pickInstrument: () => void;
  /** Track ▸ Add Audio Track…: a recording played in sync with the score. */
  readonly addAudioTrack: () => void;
  /** Track ▸ Add Track…, Duplicate Track, Delete Track, Move Track Up / Down, on the shown track. */
  readonly runTrackCommand: (command: TrackMenuCommand) => void;
  readonly togglePanel: (panel: PanelId) => void;
  readonly toggleLoop: () => void;
  /** View ▸ Focus / Unfocus. */
  readonly toggleFocus: () => void;
  /** View ▸ Drum Key: how the shown drum track's drums are written on the staff. */
  readonly toggleDrumKey: () => void;
  readonly togglePreviewOnHover: () => void;
  /** Tools ▸ MCP Server ▸ Settings…, Show Log…, Restart, Copy Setup Command (the server's native menus). */
  readonly runMcpServerCommand: (command: McpServerCommand) => void;
}

/** One row of the command palette (⇧⌘P). A new feature's command is one more row of the registry (commands.ts) and its title in the catalogues. */
export interface Command {
  readonly id: string;
  readonly title: string;
  /** Where it lives: a menu (File, Edit, View, Tools, Help) or a part of the editor (Note, Beat, Go, Playback, a palette group). */
  readonly group: string;
  /** More words it is found by. */
  readonly keywords: readonly string[];
  /** Its key as the shortcut sheet writes it ("⇧⌘S"), when it has one. */
  readonly shortcut?: string;
  /** The editor command it runs, when it is one (keys, palette tools): what `run` hands to `runCommand`. */
  readonly command?: AppCommand | KeyCommand;
  readonly isEnabled: (state: CommandState) => boolean;
  readonly run: (actions: CommandActions) => void;
}

/** When a command can run (`notes`: a note at the cursor or a selection, as the palette's Delete). */
export type Requirement = 'always' | 'document' | 'note' | 'beat' | 'bar' | 'notes' | 'undo' | 'redo' | 'tabs' | 'pitched';

export function isRequirementMet(requirement: Requirement, state: CommandState): boolean {
  switch (requirement) {
    case 'always':
      return true;
    case 'note':
    case 'beat':
    case 'bar':
    case 'notes':
      return state.hasDocument && isToolEnabled({ scope: requirement }, { ...state.palette, hasSelection: state.hasSelection });
    case 'undo':
      return state.canUndo;
    case 'redo':
      return state.canRedo;
    case 'tabs':
      return state.tabCount > 1;
    case 'pitched':
      return state.hasDocument && !state.isPercussion;
    case 'document':
      return state.hasDocument;
  }
}

const MODIFIER_SYMBOLS: readonly (readonly [keyof Omit<KeyPress, 'key'>, string])[] = [
  ['altKey', '⌥'],
  ['shiftKey', '⇧'],
  ['metaKey', '⌘'],
];

const KEY_NAMES: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Backspace: '⌫',
  Delete: '⌦',
  Escape: 'Esc', // i18n-exempt: the key cap as the Mac keyboard prints it
  Enter: '↩',
};

/** A key press as macOS menus write it: "⇧⌘Z", "⌥↑", "R" ("Space" in the shown language). */
export function pressLabel(keyPress: KeyPress): string {
  const modifiers = MODIFIER_SYMBOLS.filter(([flag]) => keyPress[flag]).map(([, symbol]) => symbol).join('');
  const name = keyPress.key === ' ' ? t('commands.key.space') : (KEY_NAMES[keyPress.key] ?? (keyPress.key.length === 1 ? keyPress.key.toUpperCase() : keyPress.key));
  return `${modifiers}${name}`;
}

export function press(key: string, modifiers: Partial<Omit<KeyPress, 'key'>> = {}): KeyPress {
  return { key, metaKey: false, shiftKey: false, altKey: false, ...modifiers };
}

export interface RowSpec {
  readonly when?: Requirement;
  readonly keywords?: readonly string[];
  readonly shortcut?: string;
}

/** A command that calls one of the handlers; it needs a document unless `spec.when` says otherwise. */
export function row(id: string, group: string, title: string, run: (actions: CommandActions) => void, spec: RowSpec = {}): Command {
  const when = spec.when ?? 'document';
  return { id, group, title, keywords: spec.keywords ?? [], shortcut: spec.shortcut, isEnabled: (state) => isRequirementMet(when, state), run };
}

/** A command that runs an editor command, the way its key or button does. */
export function editorRow(id: string, group: string, title: string, command: AppCommand | KeyCommand, spec: RowSpec = {}): Command {
  return { ...row(id, group, title, (actions) => actions.runCommand(command), spec), command };
}

/** A command that does what a key does; the key is its shortcut. Throws for a press no key command answers. */
export function keyRow(id: string, group: string, title: string, keyPress: KeyPress, spec: RowSpec = {}): Command {
  const command = keyCommand(keyPress, { current: undefined }, 0);
  if (command === undefined) {
    // i18n-exempt: a programming error, never shown
    throw new Error(`No key command for ${pressLabel(keyPress)}`);
  }
  return editorRow(id, group, title, command, { ...spec, shortcut: pressLabel(keyPress) });
}

