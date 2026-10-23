// The Windows build's window menu and keyboard shortcuts: AppDelegate.swift's menus (File, Edit, Tools, Help) as a
// Tauri window menu, each item posting the app event its macOS twin posts (app-events.ts). Shortcuts are handled
// here, in the page, so they work whatever has focus; the menu shows them beside each item.
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
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

/**
 * An editor key (undo, copy …) sent to the focused view as if typed: the editor's own key handling runs it, as the
 * Mac's Edit menu sends its actions down the responder chain.
 */
function typeKey(key: string, modifiers: { ctrl?: boolean; shift?: boolean } = {}): () => void {
  return () => {
    // The app's root view is the outermost focusable element (App.tsx: `focusable`); it handles the editor's keys.
    const target = document.querySelector<HTMLElement>('#root [tabindex="0"]') ?? document.body;
    target.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: modifiers.ctrl === true, shiftKey: modifiers.shift === true, bubbles: true, cancelable: true }));
  };
}

function command(id: string, text: string, run: () => void, shortcut?: Shortcut, alsoShortcuts?: readonly Shortcut[]): CommandItem {
  return { kind: 'command', id, text, run, shortcut, alsoShortcuts };
}

function recentEntries(files: readonly RecentMenuFile[]): MenuEntry[] {
  const item = (file: RecentMenuFile, index: number): CommandItem => ({
    ...command(`recent-${index}`, file.isMissing ? `${file.title} (missing)` : file.title, post('openRecentRequested', { path: file.path })),
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
  entries.push({ ...command('clear-recent', 'Clear Menu', post('clearRecentRequested')), isEnabled: others.length > 0 });
  return entries;
}

/** The menus of the window (AppDelegate.swift's, the Windows way: Exit in File, Keyboard Shortcuts in Help). */
export function menuModel(recentFiles: readonly RecentMenuFile[]): readonly { readonly text: string; readonly items: readonly MenuEntry[] }[] {
  return [
    {
      text: '&File',
      items: [
        command('new', 'New Score + Tab', post('newRequested', { mode: 'notationAndTab' }), { key: 'n', ctrl: true }),
        command('new-score', 'New Score', post('newRequested', { mode: 'notation' })),
        command('new-tab', 'New Tab', post('newRequested', { mode: 'tab' })),
        SEPARATOR,
        command('open', 'Open…', post('openRequested'), { key: 'o', ctrl: true }),
        { kind: 'submenu', text: 'Open Recent', items: recentEntries(recentFiles) },
        command('recent-files', 'Recent Files…', post('recentFilesRequested')),
        command('import-pdf', 'Import PDF…', post('importPdfRequested'), { key: 'i', ctrl: true, shift: true }),
        SEPARATOR,
        command('close-tab', 'Close Tab', post('closeTabRequested'), { key: 'w', ctrl: true }, [{ key: 'F4', ctrl: true }]),
        command('next-tab', 'Next Tab', post('nextTabRequested'), { key: 'Tab', ctrl: true }),
        command('previous-tab', 'Previous Tab', post('previousTabRequested'), { key: 'Tab', ctrl: true, shift: true }),
        SEPARATOR,
        command('save', 'Save', post('saveRequested', { saveAs: false }), { key: 's', ctrl: true }),
        command('save-as', 'Save As…', post('saveRequested', { saveAs: true }), { key: 's', ctrl: true, shift: true }),
        SEPARATOR,
        command('export-pdf', 'Export PDF…', post('exportRequested'), { key: 'e', ctrl: true, shift: true }),
        command('export-png', 'Export PNG…', post('exportPngRequested')),
        command('export-midi', 'Export MIDI…', post('exportMidiRequested')),
        command('export-ascii', 'Export ASCII Tab…', post('exportAsciiTabRequested')),
        SEPARATOR,
        command('print', 'Print…', post('printRequested'), { key: 'p', ctrl: true }),
        SEPARATOR,
        { kind: 'quit' },
      ],
    },
    {
      text: '&Edit',
      items: [
        command('undo', 'Undo', typeKey('z', { ctrl: true }), { key: 'z', ctrl: true }),
        command('redo', 'Redo', typeKey('z', { ctrl: true, shift: true }), { key: 'y', ctrl: true }),
        SEPARATOR,
        command('cut', 'Cut', typeKey('x', { ctrl: true }), { key: 'x', ctrl: true }),
        command('copy', 'Copy', typeKey('c', { ctrl: true }), { key: 'c', ctrl: true }),
        command('paste', 'Paste', typeKey('v', { ctrl: true }), { key: 'v', ctrl: true }),
        SEPARATOR,
        { kind: 'submenu', text: 'AI Wizard', items: [command('song-writer', 'Song Writer…', post('songWriterRequested'))] },
      ],
    },
    { text: '&Tools', items: [command('tuner', 'Tuner…', post('tunerRequested'))] },
    { text: '&Help', items: [command('shortcuts', 'Keyboard Shortcuts', post('helpRequested'), { key: 'F1' }, [{ key: 'h', ctrl: true }])] },
  ];
}

/** "Ctrl+Shift+S", as Windows menus show a shortcut. */
export function shortcutText(shortcut: Shortcut): string {
  const key = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
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
const EDITOR_KEYS = new Set(['undo', 'cut', 'copy', 'paste']);
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

async function nativeItem(entry: MenuEntry): Promise<MenuItem | Submenu | PredefinedMenuItem> {
  switch (entry.kind) {
    case 'separator':
      return PredefinedMenuItem.new({ item: 'Separator' });
    case 'quit':
      return PredefinedMenuItem.new({ item: 'Quit', text: 'E&xit' });
    case 'submenu':
      return Submenu.new({ text: entry.text, items: await Promise.all(entry.items.map(nativeItem)) });
    case 'command': {
      // The shortcut is shown, not registered: the page handles the keys (installShortcuts), so they fire once.
      const text = entry.shortcut === undefined ? entry.text : `${entry.text}\t${shortcutText(entry.shortcut)}`;
      return MenuItem.new({ id: entry.id, text, enabled: entry.isEnabled ?? true, action: entry.run });
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
    const menus = await Promise.all(menuModel(currentRecent).map(async (menu) => Submenu.new({ text: menu.text, items: await Promise.all(menu.items.map(nativeItem)) })));
    const menu = await Menu.new({ items: menus });
    await menu.setAsAppMenu();
  });
  building = building.catch(() => undefined);
  return building;
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
