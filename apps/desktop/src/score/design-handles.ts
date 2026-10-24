import { type Song, stylesheetOf } from '@gp-editor/core';
import type { RowLayout } from '../lib/layout';
import type { Palette } from '../theme';
import type { DrawCommand } from './draw';
import type { RowGeometry } from './geometry';
import { placeRow } from './row';

/** The space Design Mode drags: under each system, between tracks, between a track's notation and tab. */
export type SpacingKind = 'systemSpacing' | 'trackSpacing' | 'staffSpacing';

/** Something Design Mode lets you drag on a staff's canvas (row-local layout points). */
export type DesignHandle =
  /** The beats starting `at` ticks into the bar (Guitar Pro 8's beat positions). */
  | { readonly kind: 'beat'; readonly measureIndex: number; readonly at: number; readonly x: number; readonly y: number; readonly isMoved: boolean }
  /** The bar line right of the bar (the bar's width). */
  | { readonly kind: 'barline'; readonly measureIndex: number; readonly x: number; readonly y: number; readonly isMoved: boolean }
  /** A space between systems or staves, dragged up and down. */
  | { readonly kind: 'spacing'; readonly spacing: SpacingKind; readonly x: number; readonly y: number; readonly isMoved: boolean };

/** Handles' sizes, in points. */
export const DESIGN_HANDLE = {
  /** Half the bar line triangle's width, its height, and its top. */
  triangle: 4,
  triangleTop: 1,
  beatRadius: 3,
  /** Under the heading band's bottom: the beats' dots. */
  beatAbove: 5,
  /** Half a spacing grip's width, and its height. */
  gripHalfWidth: 10,
  gripHeight: 3,
  /** How far from a handle a press still takes it. */
  hitX: 7,
  hitY: 7,
  /** The automatic guideline's colour: Guitar Pro 8's yellow (a palette's `designGuide` in its place). */
  guideColor: '#E8B400',
  guideWidth: 1.5,
} as const;

/** Where a staff's canvas sits in its system, and what that canvas's handles are. */
export interface DesignRowInput {
  readonly song: Song;
  readonly trackIndex: number;
  readonly row: RowLayout;
  /** Where the bars start on the canvas: the names column and the clef column. */
  readonly barsX: number;
  /** The names column (0 for one track): the spacing grips go in the clef column right of it. */
  readonly namesWidth: number;
  readonly geometry: RowGeometry;
  /** The canvas's height. */
  readonly height: number;
  /** The system's top staff: the beats' dots and bar lines' triangles go over it. */
  readonly isTop: boolean;
  /** The system's last staff: the grip for the space under the system. */
  readonly isLast: boolean;
  /** The heading band's height (the top staff's), where the beat dots sit. */
  readonly headingHeight: number;
}

const NOTATION_STAFF_HEIGHT = 32;
/** The spacing grips sit in the clef column, this far right of the names. */
const GRIP_LEFT = 14;

/** The beats' dots and the bar lines' triangles over the system's top staff; the last bar's line stays (the system's width). */
function barHandles(input: DesignRowInput): DesignHandle[] {
  const { song, row, barsX, headingHeight } = input;
  const track = song.tracks[input.trackIndex];
  const placed = placeRow(row, barsX);
  return placed.flatMap((measure, index) => {
    const header = song.measureHeaders[measure.layout.measureIndex];
    const beats = track?.measures[measure.layout.measureIndex]?.beats ?? [];
    const offsets = header?.design?.beatOffsets ?? [];
    const seen = new Set<number>();
    const beatHandles = measure.layout.beats.flatMap((beat): DesignHandle[] => {
      const at = (beats[beat.beatIndex]?.start ?? 0) - (header?.start ?? 0);
      if (seen.has(at)) {
        return [];
      }
      seen.add(at);
      const isMoved = offsets.some((offset) => offset.at === at);
      return [{ kind: 'beat', measureIndex: measure.layout.measureIndex, at, x: measure.x + beat.x, y: headingHeight - DESIGN_HANDLE.beatAbove, isMoved }];
    });
    const isLast = index === placed.length - 1;
    const line: DesignHandle[] = isLast
      ? []
      : [{ kind: 'barline', measureIndex: measure.layout.measureIndex, x: measure.x + measure.layout.width, y: DESIGN_HANDLE.triangleTop, isMoved: (header?.design?.widthScale ?? 1) !== 1 }];
    return [...beatHandles, ...line];
  });
}

/** The spacing grips of the canvas: between its tracks (over a lower staff), notation and tab, and under the system. */
function spacingHandles(input: DesignRowInput): DesignHandle[] {
  const { geometry, height, namesWidth } = input;
  const { systems } = stylesheetOf(input.song);
  const x = namesWidth + GRIP_LEFT;
  const grips: DesignHandle[] = [];
  if (!input.isTop) {
    grips.push({ kind: 'spacing', spacing: 'trackSpacing', x, y: DESIGN_HANDLE.gripHeight, isMoved: systems.trackSpacing !== 0 });
  }
  if (geometry.notationTop !== undefined && geometry.marksY !== undefined) {
    const y = geometry.notationTop + NOTATION_STAFF_HEIGHT + (geometry.marksY - geometry.notationTop - NOTATION_STAFF_HEIGHT) / 2;
    grips.push({ kind: 'spacing', spacing: 'staffSpacing', x, y, isMoved: systems.staffSpacing !== 0 });
  }
  if (input.isLast) {
    grips.push({ kind: 'spacing', spacing: 'systemSpacing', x, y: height - DESIGN_HANDLE.gripHeight - 1, isMoved: systems.systemSpacing !== 0 });
  }
  return grips;
}

/** Every handle Design Mode shows on a staff's canvas. */
export function designHandles(input: DesignRowInput): DesignHandle[] {
  return [...(input.isTop ? barHandles(input) : []), ...spacingHandles(input)];
}

/**
 * A handle drawn: a triangle over a bar line, a dot over a beat, a grip in a space; moved ones in the danger colour
 * (Guitar Pro 8's red), the others in the palette's handle colour (a blue, apart from that red on every paper).
 */
function handleCommands(handle: DesignHandle, palette: Palette): DrawCommand[] {
  const color = handle.isMoved ? palette.danger : (palette.designHandle ?? palette.accent);
  const { x, y } = handle;
  switch (handle.kind) {
    case 'beat':
      return [{ kind: 'circle', x, y, radius: DESIGN_HANDLE.beatRadius, color }];
    case 'barline': {
      const half = DESIGN_HANDLE.triangle;
      return [{ kind: 'polygon', points: [x - half, y, x + half, y, x, y + 2 * half], color }];
    }
    case 'spacing':
      return [{ kind: 'rect', x: x - DESIGN_HANDLE.gripHalfWidth, y: y - DESIGN_HANDLE.gripHeight / 2, width: 2 * DESIGN_HANDLE.gripHalfWidth, height: DESIGN_HANDLE.gripHeight, color, radius: 1.5 }];
  }
}

/** The handles, and the automatic guideline through the canvas when a drag snaps to `guideX`. */
export function engraveDesign(handles: readonly DesignHandle[], palette: Palette, height: number, guideX?: number): DrawCommand[] {
  const guide: DrawCommand[] =
    guideX === undefined ? [] : [{ kind: 'line', x1: guideX, y1: 0, x2: guideX, y2: height, width: DESIGN_HANDLE.guideWidth, color: palette.designGuide ?? DESIGN_HANDLE.guideColor }];
  return [...guide, ...handles.flatMap((handle) => handleCommands(handle, palette))];
}

/** The handle under a press (row-local layout points), the nearest when several are near; undefined for none. */
export function hitTestDesign(handles: readonly DesignHandle[], x: number, y: number): DesignHandle | undefined {
  const near = handles.filter((handle) => {
    const reachX = handle.kind === 'spacing' ? DESIGN_HANDLE.gripHalfWidth + 2 : DESIGN_HANDLE.hitX;
    return Math.abs(handle.x - x) <= reachX && Math.abs(handle.y - y) <= DESIGN_HANDLE.hitY;
  });
  return near.reduce<DesignHandle | undefined>((best, handle) => (best === undefined || Math.hypot(handle.x - x, handle.y - y) < Math.hypot(best.x - x, best.y - y) ? handle : best), undefined);
}
