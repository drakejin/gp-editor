// The Windows build's window: files handed to the app (its command line, a second launch, a drop on the window) open
// as AppDelegate's application(_:open:) and the root view's onDrop do on the Mac, and the keys keep reaching the
// editor when focus falls back to the page.
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { postAppEvent } from './app-events';
import { call, isTauri } from './tauri';

/** Files the app reads (File ▸ Open…'s formats); anything else dropped on the window is ignored. */
const OPENABLE = /\.(gp|gpx|gp5|gp4|gp3|gtp|ptb|tef|mid|midi)$/i;

function openFiles(paths: readonly string[]): void {
  paths.filter((path) => OPENABLE.test(path)).forEach((path) => postAppEvent('fileOpened', { path }));
}

/** When focus falls to the page itself (a panel with the focused field closed), the root view takes it back. */
function keepKeyboardFocus(): () => void {
  const onFocusOut = () => {
    setTimeout(() => {
      if (document.activeElement === document.body || document.activeElement === null) {
        document.querySelector<HTMLElement>('#root [tabindex="0"]')?.focus({ preventScroll: true });
      }
    }, 0);
  };
  document.addEventListener('focusout', onFocusOut);
  return () => document.removeEventListener('focusout', onFocusOut);
}

export async function installWindow(): Promise<void> {
  keepKeyboardFocus();
  if (!isTauri()) {
    return;
  }
  openFiles(await call<string[]>('initial_files').catch(() => []));
  // A second launch (double-clicking another file) hands its files to this window (the single-instance plugin).
  await listen<string[]>('open-files', (event) => openFiles(event.payload));
  await getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === 'drop') {
      openFiles(event.payload.paths);
    }
  });
}
