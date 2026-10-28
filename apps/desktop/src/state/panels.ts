/** The panels around the score that the top bar shows or hides (Guitar Pro's layout). */
export interface PanelVisibility {
  /** Edition palette, left. */
  readonly palette: boolean;
  /** Song / Track inspector, right. */
  readonly inspector: boolean;
  /** Tracks and bar map, bottom. */
  readonly tracks: boolean;
  /** Piano keyboard with the sounding notes' keys lit, above the fretboard (pitched tracks). */
  readonly keyboard: boolean;
  /** Fretboard (instrument view), above the tracks. */
  readonly neck: boolean;
  /** View ▸ Mixer: the tracks' effect strips and the master, at the bottom. */
  readonly mixer: boolean;
}

export type PanelId = keyof PanelVisibility;

export const INITIAL_PANELS: PanelVisibility = { palette: true, inspector: true, tracks: true, keyboard: true, neck: true, mixer: false };

export function togglePanel(panels: PanelVisibility, panel: PanelId): PanelVisibility {
  return { ...panels, [panel]: !panels[panel] };
}

/** View ▸ Focus: only the score and the top bar's transport stay. */
export const FOCUSED_PANELS: PanelVisibility = { palette: false, inspector: false, tracks: false, keyboard: false, neck: false, mixer: false };

/** The panels shown, and while focused the ones shown before (what Unfocus brings back). */
export interface PanelLayout {
  readonly panels: PanelVisibility;
  readonly unfocusedPanels?: PanelVisibility;
}

export function isFocused(layout: PanelLayout): boolean {
  return layout.unfocusedPanels !== undefined;
}

/** View ▸ Focus / Unfocus: hides every panel around the score, or brings back the ones shown before Focus. */
export function toggleFocus(layout: PanelLayout): PanelLayout {
  return layout.unfocusedPanels === undefined ? { panels: FOCUSED_PANELS, unfocusedPanels: layout.panels } : { panels: layout.unfocusedPanels };
}

/** Score zoom levels of the zoom menu and −/+ (⌘- / ⌘=): out to a quarter (four times the systems), in to four times. */
export const ZOOM_LEVELS: readonly number[] = [0.25, 0.33, 0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 3, 4];

/** The zoom one level up or down; a zoom between levels moves to the nearest level in that direction. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const levels = direction === 1 ? ZOOM_LEVELS : [...ZOOM_LEVELS].reverse();
  return levels.find((level) => (direction === 1 ? level > zoom + 1e-9 : level < zoom - 1e-9)) ?? levels.at(-1) ?? zoom;
}
