/** The panels around the score that the top bar shows or hides (Guitar Pro's layout). */
export interface PanelVisibility {
  /** Edition palette, left. */
  readonly palette: boolean;
  /** Song / Track inspector, right. */
  readonly inspector: boolean;
  /** Tracks and bar map, bottom. */
  readonly tracks: boolean;
  /** Fretboard (instrument view), above the tracks. */
  readonly neck: boolean;
}

export type PanelId = keyof PanelVisibility;

export const INITIAL_PANELS: PanelVisibility = { palette: true, inspector: true, tracks: true, neck: true };

export function togglePanel(panels: PanelVisibility, panel: PanelId): PanelVisibility {
  return { ...panels, [panel]: !panels[panel] };
}

/** Score zoom levels of the zoom menu and −/+ (⌘- / ⌘=). */
export const ZOOM_LEVELS: readonly number[] = [0.5, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

/** The zoom one level up or down; a zoom between levels moves to the nearest level in that direction. */
export function stepZoom(zoom: number, direction: 1 | -1): number {
  const levels = direction === 1 ? ZOOM_LEVELS : [...ZOOM_LEVELS].reverse();
  return levels.find((level) => (direction === 1 ? level > zoom + 1e-9 : level < zoom - 1e-9)) ?? levels.at(-1) ?? zoom;
}
