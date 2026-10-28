// The Windows build's window menu and keyboard shortcuts: AppDelegate.swift's menus (File, Edit, View, Tools, Track,
// Help) as a Tauri window menu, each item posting the app event its macOS twin posts (app-events.ts), titled from the
// command palette's catalogue so it follows the language shown. Shortcuts are handled here, in the page, so they work
// whatever has focus; the menu shows them beside each item. Not on Windows: Line In, Export Audio, the audio track and
// the MCP server (their native sides are macOS only).
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
import { type MessageKey, t } from '../../lib/i18n/i18n';
import { postAppEvent } from './app-events';
import { isTauri } from './tauri';

/** A key combination: the key (KeyboardEvent.key, any case) and its modifiers. */
interface Shortcut {
  readonly key: string;
  readonly ctrl?: boolean;
  readonly shift?: boolean;
  readonly alt?: boolean;
}

interface CommandItem {
  readonly kind: 'command';
  readonly id: string;
  readonly text: string;
  readonly shortcut?: Shortcut;
  /** Shortcuts that do the same, not shown (Ctrl+Y for Redo). */
  readonly alsoShortcuts?: readonly Shortcut[];
  readonly run: () => void;
  readonly isEnabled?: boolean;
}

type MenuEntry = CommandItem | { readonly kind: 'separator' } | { readonly kind: 'submenu'; readonly text: string; readonly items: readonly MenuEntry[] } | { readonly kind: 'quit' };

interface TopMenu {
  readonly text: string;
  readonly items: readonly MenuEntry[];
}

/** A recent file as the Open Recent submenu lists it. */
export interface RecentMenuFile {
  readonly path: string;
  readonly title: string;
  readonly isPinned: boolean;
  readonly isMissing: boolean;
}

const SEPARATOR = { kind: 'separator' } as const;

function post(name: string, body: unknown = {}): () => void {
  return () => postAppEvent(name, body);
}

function command(id: string, title: MessageKey, run: () => void, shortcut?: Shortcut, alsoShortcuts?: readonly Shortcut[]): CommandItem {
  return { kind: 'command', id, text: t(title), run, shortcut, alsoShortcuts };
}

/** A top menu's title with its access key ("&File"): the group's name, the key its first letter where it is Latin. */
function topMenu(title: MessageKey, items: readonly MenuEntry[]): TopMenu {
  const text = t(title);
  return { text: /^[A-Za-z]/.test(text) ? `&${text}` : text, items };
}

function recentEntries(files: readonly RecentMenuFile[]): MenuEntry[] {
  const item = (file: RecentMenuFile, index: number): CommandItem => ({
    kind: 'command',
    id: `recent-${index}`,
    text: file.isMissing ? t('window.menu.missingFile', { name: file.title }) : file.title,
    run: post('openRecentRequested', { path: file.path }),
    isEnabled: !file.isMissing,
  });
  const pinned = files.filter((file) => file.isPinned);
  const others = files.filter((file) => !file.isPinned);
  const entries: MenuEntry[] = [...pinned.map(item)];
  if (pinned.length > 0 && others.length > 0) {
    entries.push(SEPARATOR);
  }
  entries.push(...others.map((file, index) => item(file, pinned.length + index)));
  if (files.length > 0) {
    entries.push(SEPARATOR);
  }
  entries.push({ ...command('clear-recent', 'window.menu.clearRecent', post('clearRecentRequested')), isEnabled: others.length > 0 });
  return entries;
}

function fileMenu(recentFiles: readonly RecentMenuFile[]): TopMenu {
  return topMenu('commands.group.file', [
    command('new', 'commands.title.file.new', post('newRequested', { mode: 'notationAndTab' }), { key: 'n', ctrl: true }),
    command('new-score', 'commands.title.file.newScore', post('newRequested', { mode: 'notation' })),
    command('new-tab', 'commands.title.file.newTab', post('newRequested', { mode: 'tab' })),
    SEPARATOR,
    command('open', 'commands.title.file.open', post('openRequested'), { key: 'o', ctrl: true }),
    { kind: 'submenu', text: t('window.menu.openRecent'), items: recentEntries(recentFiles) },
    command('recent-files', 'commands.title.file.recent', post('recentFilesRequested')),
    command('import-pdf', 'commands.title.file.importPdf', post('importPdfRequested'), { key: 'i', ctrl: true, shift: true }),
    SEPARATOR,
    command('close-tab', 'commands.title.file.closeTab', post('closeTabRequested'), { key: 'w', ctrl: true }, [{ key: 'F4', ctrl: true }]),
    // i18n-exempt: a key's name (KeyboardEvent.key)
    command('next-tab', 'commands.title.file.nextTab', post('nextTabRequested'), { key: 'Tab', ctrl: true }),
    // i18n-exempt: a key's name (KeyboardEvent.key)
    command('previous-tab', 'commands.title.file.previousTab', post('previousTabRequested'), { key: 'Tab', ctrl: true, shift: true }),
    SEPARATOR,
    command('save', 'commands.title.file.save', post('saveRequested', { saveAs: false }), { key: 's', ctrl: true }),
    command('save-as', 'commands.title.file.saveAs', post('saveRequested', { saveAs: true }), { key: 's', ctrl: true, shift: true }),
    SEPARATOR,
    command('export-pdf', 'commands.title.file.exportPdf', post('exportRequested'), { key: 'e', ctrl: true, shift: true }),
    command('export-png', 'commands.title.file.exportPng', post('exportPngRequested')),
    command('export-midi', 'commands.title.file.exportMidi', post('exportMidiRequested')),
    command('export-ascii', 'commands.title.file.exportAsciiTab', post('exportAsciiTabRequested')),
    command('export-musicxml', 'commands.title.file.exportMusicXml', post('exportMusicXmlRequested')),
    command('export-mxl', 'commands.title.file.exportCompressedMusicXml', post('exportCompressedMusicXmlRequested')),
    SEPARATOR,
    command('stylesheet', 'commands.title.file.stylesheet', post('layoutCommandRequested', { command: 'stylesheet' }), { key: 'F7' }),
    command('print', 'commands.title.file.print', post('printRequested'), { key: 'p', ctrl: true }),
    SEPARATOR,
    command('settings', 'commands.title.app.settings', post('settingsRequested'), { key: ',', ctrl: true }),
    SEPARATOR,
    { kind: 'quit' },
  ]);
}

function editMenu(): TopMenu {
  return topMenu('commands.group.edit', [
    command('undo', 'commands.title.edit.undo', post('undoRequested'), { key: 'z', ctrl: true }),
    command('redo', 'commands.title.edit.redo', post('redoRequested'), { key: 'y', ctrl: true }),
    SEPARATOR,
    command('cut', 'commands.title.edit.cut', post('clipboardCommandRequested', { command: 'cut' }), { key: 'x', ctrl: true }),
    command('copy', 'commands.title.edit.copy', post('clipboardCommandRequested', { command: 'copy' }), { key: 'c', ctrl: true }),
    command('paste', 'commands.title.edit.paste', post('clipboardCommandRequested', { command: 'paste' }), { key: 'v', ctrl: true }),
    SEPARATOR,
    command('delete-notes', 'commands.title.edit.deleteNotes', post('deleteRequested', { what: 'notes' })),
    command('delete-bars', 'commands.title.edit.deleteBars', post('deleteRequested', { what: 'bars' }), { key: 'd', ctrl: true }),
    SEPARATOR,
    command('lyrics', 'commands.title.edit.lyrics', post('lyricsRequested')),
    command('annotation', 'commands.title.edit.annotation', post('annotationRequested')),
    { kind: 'submenu', text: t('window.menu.aiWizard'), items: [command('song-writer', 'commands.title.edit.songWriter', post('songWriterRequested'))] },
  ]);
}

function viewMenu(): TopMenu {
  return topMenu('commands.group.view', [
    command('focus', 'commands.title.view.focus', post('focusRequested'), { key: 'f', ctrl: true, shift: true }),
    command('multitrack', 'commands.title.view.multitrack', post('multitrackRequested'), { key: 'F3' }),
    command('previous-track', 'commands.title.go.previousTrack', post('previousTrackRequested')),
    command('next-track', 'commands.title.go.nextTrack', post('nextTrackRequested')),
    SEPARATOR,
    command('design-mode', 'commands.title.view.designMode', post('layoutCommandRequested', { command: 'designMode' })),
    command('reset-positions', 'commands.title.view.resetPositions', post('layoutCommandRequested', { command: 'resetPositions' })),
    SEPARATOR,
    command('mixer', 'commands.title.view.panel.mixer', post('mixerRequested')),
    command('drum-key', 'commands.title.view.drumKey', post('drumKeyRequested')),
  ]);
}

function toolsMenu(): TopMenu {
  return topMenu('commands.group.tools', [
    command('tuner', 'commands.title.tools.tuner', post('tunerRequested')),
    command('scales', 'commands.title.tools.scales', post('scalesRequested')),
    command('transpose', 'commands.title.tools.transpose', post('transposeRequested')),
    SEPARATOR,
    command('command-palette', 'window.menu.commandPalette', post('commandPaletteRequested', { mode: 'commands' }), { key: 'p', ctrl: true, shift: true }),
    command('expression-text', 'commands.title.tools.expressionText', post('commandPaletteRequested', { mode: 'expression' }), { key: 'e', ctrl: true, alt: true }),
  ]);
}

function trackMenu(): TopMenu {
  return topMenu('commands.group.track', [
    command('track-add', 'commands.title.track.add', post('trackCommandRequested', { command: 'add' }), { key: 'n', ctrl: true, alt: true }),
    command('track-duplicate', 'commands.title.track.duplicate', post('trackCommandRequested', { command: 'duplicate' })),
    command('track-delete', 'commands.title.track.delete', post('trackCommandRequested', { command: 'delete' }), { key: 'r', ctrl: true, alt: true }),
    SEPARATOR,
    command('track-up', 'commands.title.track.moveUp', post('trackCommandRequested', { command: 'moveUp' })),
    command('track-down', 'commands.title.track.moveDown', post('trackCommandRequested', { command: 'moveDown' })),
  ]);
}

/** The menus of the window (AppDelegate.swift's, the Windows way: Settings and Exit in File, Keyboard Shortcuts in Help). */
export function menuModel(recentFiles: readonly RecentMenuFile[]): readonly TopMenu[] {
  return [
    fileMenu(recentFiles),
    editMenu(),
    viewMenu(),
    toolsMenu(),
    trackMenu(),
    topMenu('commands.group.help', [command('shortcuts', 'commands.title.help.shortcuts', post('helpRequested'), { key: 'F1' }, [{ key: 'h', ctrl: true }])]),
  ];
}

/** "Ctrl+Shift+S", as Windows menus show a shortcut. */
export function shortcutText(shortcut: Shortcut): string {
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  // i18n-exempt: Windows writes the modifier keys' names so in every language
  return [shortcut.ctrl === true ? 'Ctrl' : '', shortcut.alt === true ? 'Alt' : '', shortcut.shift === true ? 'Shift' : '', key].filter((part) => part !== '').join('+');
}

function matches(shortcut: Shortcut, event: KeyboardEvent): boolean {
  return (
    event.key.toLowerCase() === shortcut.key.toLowerCase() &&
    (event.ctrlKey || event.metaKey) === (shortcut.ctrl === true) &&
    event.shiftKey === (shortcut.shift === true) &&
    event.altKey === (shortcut.alt === true)
  );
}

function commandItems(entries: readonly MenuEntry[]): CommandItem[] {
  return entries.flatMap((entry) => (entry.kind === 'command' ? [entry] : entry.kind === 'submenu' ? commandItems(entry.items) : []));
}

/** Editor keys the root view handles itself (key-commands.ts: Ctrl acts as ⌘); the menu only shows them. */
const EDITOR_KEYS = new Set(['undo', 'cut', 'copy', 'paste', 'delete-bars']);
/** Ctrl+Y (Redo) is the Windows key for the editor's ⇧⌘Z; in a text field it is the field's. */
const FIELD_KEYS = new Set(['redo']);

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

/** The menu command a key press runs, when it is one of the menu's shortcuts (editor keys excepted). */
export function shortcutCommand(event: KeyboardEvent, recentFiles: readonly RecentMenuFile[] = []): CommandItem | undefined {
  const items = menuModel(recentFiles).flatMap((menu) => commandItems(menu.items));
  const isTaken = (item: CommandItem) => EDITOR_KEYS.has(item.id) || (FIELD_KEYS.has(item.id) && isTyping(event.target));
  return items.find((item) => !isTaken(item) && [item.shortcut, ...(item.alsoShortcuts ?? [])].some((shortcut) => shortcut !== undefined && matches(shortcut, event)));
}

/** Items enabled or disabled by the app (Undo / Redo), by id; kept for the next build of the menu. */
const enabledStates = new Map<string, boolean>();
/** The built menu's items by id, to enable or disable them in place. */
const builtItems = new Map<string, MenuItem>();

async function nativeItem(entry: MenuEntry): Promise<MenuItem | Submenu | PredefinedMenuItem> {
  switch (entry.kind) {
    case 'separator':
      return PredefinedMenuItem.new({ item: 'Separator' }); // i18n-exempt: Tauri's item kind
    case 'quit':
      return PredefinedMenuItem.new({ item: 'Quit', text: t('window.menu.exit') }); // i18n-exempt: Tauri's item kind
    case 'submenu':
      return Submenu.new({ text: entry.text, items: await Promise.all(entry.items.map(nativeItem)) });
    case 'command': {
      // The shortcut is shown, not registered: the page handles the keys (installShortcuts), so they fire once.
      const text = entry.shortcut === undefined ? entry.text : `${entry.text}\t${shortcutText(entry.shortcut)}`;
      const item = await MenuItem.new({ id: entry.id, text, enabled: entry.isEnabled ?? enabledStates.get(entry.id) ?? true, action: entry.run });
      builtItems.set(entry.id, item);
      return item;
    }
  }
}

let currentRecent: readonly RecentMenuFile[] = [];
let building: Promise<void> = Promise.resolve();

/** Builds (again) the window menu, with these recent files under File ▸ Open Recent. */
export function installMenu(recentFiles: readonly RecentMenuFile[] = currentRecent): Promise<void> {
  currentRecent = recentFiles;
  if (!isTauri()) {
    return Promise.resolve();
  }
  building = building.then(async () => {
    builtItems.clear();
    const menus = await Promise.all(menuModel(currentRecent).map(async (menu) => Submenu.new({ text: menu.text, items: await Promise.all(menu.items.map(nativeItem)) })));
    const menu = await Menu.new({ items: menus });
    await menu.setAsAppMenu();
  });
  building = building.catch(() => undefined);
  return building;
}

/** Enables or disables menu items by id (Edit ▸ Undo / Redo), in the built menu and the next one. */
export function setMenuItemsEnabled(states: Readonly<Record<string, boolean>>): void {
  Object.entries(states).forEach(([id, isEnabled]) => {
    enabledStates.set(id, isEnabled);
    builtItems.get(id)?.setEnabled(isEnabled).catch(() => undefined);
  });
}

/** Browser keys that make no sense in the app (reload, find, history, caret browsing, view source …). */
function isBrowserKey(event: KeyboardEvent): boolean {
  const ctrl = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  if (['f3', 'f5', 'f7', 'browserback', 'browserforward'].includes(key)) {
    return true;
  }
  if (ctrl && ['r', 'f', 'g', 'u', 'j', 'd', 'l', 'k', 'e'].includes(key) && !event.shiftKey) {
    return true;
  }
  if (event.altKey && (key === 'arrowleft' || key === 'arrowright') && !isTyping(event.target)) {
    return true;
  }
  return key === 'backspace' && !isTyping(event.target);
}

/** Routes the menu's shortcuts to their commands and keeps the browser's own keys and context menu out of the app. */
export function installShortcuts(isDevelopment: boolean): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const item = shortcutCommand(event, currentRecent);
    if (item !== undefined) {
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) {
        item.run();
      }
      return;
    }
    if (isBrowserKey(event)) {
      // Not stopped: the editor (Backspace, Alt+arrows) still gets the key; only the browser's action is cancelled.
      event.preventDefault();
    }
  };
  const onContextMenu = (event: MouseEvent) => {
    // The score's own right-click (a beat's annotation) still runs; only the browser's menu is kept out.
    if (!isDevelopment && !isTyping(event.target)) {
      event.preventDefault();
    }
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('contextmenu', onContextMenu);
  return () => {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('contextmenu', onContextMenu);
  };
}
