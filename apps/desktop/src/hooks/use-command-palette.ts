import { useCallback, useEffect, useState } from 'react';
import { paletteContext } from '../components/palette/palette-tools';
import { rememberCommand } from '../lib/command-search';
import type { Command, CommandActions, CommandState } from '../lib/command-types';
import { EXPRESSION_PREFIX } from '../lib/expression-commands';
import { type CommandPaletteMode, subscribeCommandPaletteRequests, subscribeTransposeRequests } from '../native/gp-files';

/** One opening of the palette: a new id each time (a fresh field), and what the field starts with (“>”: Expression Text). */
export interface CommandPaletteSession {
  readonly id: number;
  readonly initialQuery: string;
}
import { type WorkspaceState, activeEditor } from '../state/workspace';

/** Tools ▸ Command Palette… (⇧⌘P) and Tools ▸ Expression Text… (⌥⌘E): whether it is shown, and running a command from it. */
export interface CommandPalette {
  readonly isOpen: boolean;
  readonly session: CommandPaletteSession;
  /** Opens the palette, on its commands or (`expression`) on Expression Text. */
  readonly open: (mode?: CommandPaletteMode) => void;
  readonly close: () => void;
  /** Commands run from the palette this session, newest first: listed first. */
  readonly recentIds: readonly string[];
  /** Closes the palette, remembers the command, gives the keyboard back to the score (`onRan`), then runs it. */
  readonly run: (command: Command, actions: CommandActions) => void;
}

export function useCommandPalette(onRan: () => void): CommandPalette {
  const [isOpen, setIsOpen] = useState(false);
  const [session, setSession] = useState<CommandPaletteSession>({ id: 0, initialQuery: '' });
  const [recentIds, setRecentIds] = useState<readonly string[]>([]);
  const open = useCallback((mode: CommandPaletteMode = 'commands') => {
    setSession((current) => ({ id: current.id + 1, initialQuery: mode === 'expression' ? EXPRESSION_PREFIX : '' }));
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  useEffect(() => subscribeCommandPaletteRequests(open), [open]);
  const run = useCallback(
    (command: Command, actions: CommandActions) => {
      setIsOpen(false);
      // An expression is what was typed, not a command to offer again first.
      if (!command.id.startsWith('expression.')) {
        setRecentIds((ids) => rememberCommand(ids, command.id));
      }
      onRan();
      command.run(actions);
    },
    [onRan],
  );
  return { isOpen, session, open, close, recentIds, run };
}

/** What the commands' `isEnabled` read, from the open tabs and the shown one's editor. */
export function commandStateOf(workspace: WorkspaceState): CommandState {
  const { document, cursor, selectionAnchor, past, future, trackIndex } = activeEditor(workspace);
  const song = document?.song;
  return {
    hasDocument: document !== undefined,
    hasSelection: selectionAnchor !== undefined,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    tabCount: workspace.tabs.length,
    isPercussion: song?.tracks[trackIndex]?.isPercussion === true,
    palette: song === undefined ? { keySignature: 0 } : paletteContext(song, cursor),
    tuning: song?.tracks[trackIndex]?.strings.map((string) => string.tuning) ?? [],
  };
}

/** Tools ▸ Transpose…: the panel is shown while a document is open. */
export interface TransposePanel {
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly close: () => void;
}

export function useTransposePanel(hasDocument: boolean): TransposePanel {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(hasDocument), [hasDocument]);
  const close = useCallback(() => setIsOpen(false), []);
  useEffect(() => subscribeTransposeRequests(open), [open]);
  return { isOpen: isOpen && hasDocument, open, close };
}
