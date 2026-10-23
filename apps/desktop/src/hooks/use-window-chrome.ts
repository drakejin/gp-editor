import { useCallback, useState } from 'react';
import type { ChromeMenuId } from '../components/TopBar';
import type { NotePanel } from '../lib/key-commands';
import { INITIAL_PANELS, type PanelId, type PanelVisibility, togglePanel } from '../state/panels';

export interface OpenMenu {
  readonly id: ChromeMenuId;
  /** Pointer x of the click that opened it, in window points. */
  readonly x: number;
}

/** What the window shows around the score this session: panels, zoom, an open menu, the instrument picker. */
export interface WindowChrome {
  readonly panels: PanelVisibility;
  readonly togglePanel: (panel: PanelId) => void;
  readonly zoom: number;
  readonly setZoom: (zoom: number) => void;
  readonly menu?: OpenMenu;
  readonly openMenu: (id: ChromeMenuId, x: number) => void;
  readonly closeMenu: () => void;
  /** Track whose instrument is being picked. */
  readonly pickingTrackIndex?: number;
  readonly pickInstrument: (trackIndex: number) => void;
  readonly closePicker: () => void;
  /** The vibrato or bend panel for the note at the cursor (B, C). */
  readonly notePanel?: NotePanel;
  readonly openNotePanel: (panel: NotePanel) => void;
  readonly closeNotePanel: () => void;
  /** The chord diagram panel for the beat at the cursor (K, the palette's Chord tool). */
  readonly isChordPanelOpen: boolean;
  readonly openChordPanel: () => void;
  readonly closeChordPanel: () => void;
  /** The keyboard shortcut sheet (⌘H). */
  readonly isShortcutSheetOpen: boolean;
  readonly openShortcutSheet: () => void;
  readonly closeShortcutSheet: () => void;
  /** Esc: closes what is on top (instrument picker, note panel, chord panel, shortcut sheet, menu); false when nothing was open. */
  readonly closeOverlay: () => boolean;
}

export function useWindowChrome(): WindowChrome {
  const [panels, setPanels] = useState<PanelVisibility>(INITIAL_PANELS);
  const [zoom, setZoom] = useState(1);
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined);
  const [pickingTrackIndex, setPickingTrackIndex] = useState<number | undefined>(undefined);
  const [notePanel, setNotePanel] = useState<NotePanel | undefined>(undefined);
  const [isChordPanelOpen, setIsChordPanelOpen] = useState(false);
  const [isShortcutSheetOpen, setIsShortcutSheetOpen] = useState(false);
  // Same order as App draws them, the last one on top.
  const closeOverlay = useCallback(() => {
    if (pickingTrackIndex !== undefined) {
      setPickingTrackIndex(undefined);
    } else if (notePanel !== undefined) {
      setNotePanel(undefined);
    } else if (isChordPanelOpen) {
      setIsChordPanelOpen(false);
    } else if (isShortcutSheetOpen) {
      setIsShortcutSheetOpen(false);
    } else if (menu !== undefined) {
      setMenu(undefined);
    } else {
      return false;
    }
    return true;
  }, [pickingTrackIndex, notePanel, isChordPanelOpen, isShortcutSheetOpen, menu]);
  return {
    panels,
    togglePanel: useCallback((panel: PanelId) => setPanels((current) => togglePanel(current, panel)), []),
    zoom,
    setZoom,
    menu,
    openMenu: useCallback((id: ChromeMenuId, x: number) => setMenu({ id, x }), []),
    closeMenu: useCallback(() => setMenu(undefined), []),
    pickingTrackIndex,
    pickInstrument: useCallback((trackIndex: number) => setPickingTrackIndex(trackIndex), []),
    closePicker: useCallback(() => setPickingTrackIndex(undefined), []),
    notePanel,
    openNotePanel: useCallback((panel: NotePanel) => setNotePanel(panel), []),
    closeNotePanel: useCallback(() => setNotePanel(undefined), []),
    isChordPanelOpen,
    openChordPanel: useCallback(() => setIsChordPanelOpen(true), []),
    closeChordPanel: useCallback(() => setIsChordPanelOpen(false), []),
    isShortcutSheetOpen,
    openShortcutSheet: useCallback(() => setIsShortcutSheetOpen(true), []),
    closeShortcutSheet: useCallback(() => setIsShortcutSheetOpen(false), []),
    closeOverlay,
  };
}
