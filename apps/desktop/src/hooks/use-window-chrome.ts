import { useCallback, useState } from 'react';
import type { ChromeMenuId } from '../components/TopBar';
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
}

export function useWindowChrome(): WindowChrome {
  const [panels, setPanels] = useState<PanelVisibility>(INITIAL_PANELS);
  const [zoom, setZoom] = useState(1);
  const [menu, setMenu] = useState<OpenMenu | undefined>(undefined);
  const [pickingTrackIndex, setPickingTrackIndex] = useState<number | undefined>(undefined);
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
  };
}
