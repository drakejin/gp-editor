// The edition palette laid out as EditionPalette and ChromeButton lay it out, with the widths of its texts as AppKit
// measures them (palette-text-widths.ts, written by scripts/palette-fit/run.sh): the rows each group takes and the
// palette's height, so __tests__/palette-fit.test.ts can check every group shows without scrolling at the default window.
import { CHROME_BUTTON_SPACING } from '../src/components/chrome/ChromeButton';
import { EDITION_PALETTE_WIDTH, PALETTE_LAYOUT, PALETTE_ROW_HEIGHT, isLongHangulFace } from '../src/components/palette/EditionPalette';
import { MUSIC_ICON_SIZE } from '../src/components/palette/MusicIcon';
import type { PaletteGroup, PaletteTool } from '../src/components/palette/palette-tools';

/** The default window's height (AppDelegate.swift's defaultSize 1280 × 800; tauri.conf.json's window too). */
export const DEFAULT_WINDOW_HEIGHT = 800;
/**
 * Where the first group starts in that window: under the title bar, the top bar and the tab's title row (measured on
 * 0.17.0's 1280 × 800 snapshot: VOICE's group from y = 106, each group 16 + 24 × rows points tall then).
 */
export const PALETTE_GROUPS_TOP = 106;
/** The groups' rows wrap in this width: the palette less its right border and the groups' padding. */
export const PALETTE_INNER_WIDTH = EDITION_PALETTE_WIDTH - PALETTE_LAYOUT.border - 2 * PALETTE_LAYOUT.groupPadding;

/** A text whose width a tool's width depends on, at the size and weight the palette draws it. */
export interface TextRequest {
  readonly text: string;
  readonly size: number;
  readonly weight: 'semibold' | 'bold';
}

export const textKey = ({ text, size, weight }: TextRequest): string => `${size}/${weight}/${text}`;

const keyText = (key: string): TextRequest => ({ text: key, size: PALETTE_LAYOUT.keySize, weight: 'bold' });

function fixedWidth(tool: PaletteTool, group: PaletteGroup): number | undefined {
  return tool.width ?? group.toolWidth;
}

/** The texts a tool's width depends on: none for a fixed width; its face (as drawn beside a key or alone) and its key. */
export function toolTexts(tool: PaletteTool, group: PaletteGroup): readonly TextRequest[] {
  if (fixedWidth(tool, group) !== undefined) {
    return [];
  }
  const keys = tool.key === undefined ? [] : [keyText(tool.key)];
  if (tool.glyph !== undefined) {
    return keys;
  }
  const size = tool.key === undefined ? PALETTE_LAYOUT.faceSize : isLongHangulFace(tool.face) ? PALETTE_LAYOUT.longHangulFaceSize : PALETTE_LAYOUT.keyedFaceSize;
  return [{ text: tool.face, size, weight: 'semibold' }, ...keys];
}

/** A tool's width with its margins: ChromeButton's minimum or its content and padding, or the fixed width. */
export function toolWidth(tool: PaletteTool, group: PaletteGroup, widthOf: (request: TextRequest) => number): number {
  const { margin, padding } = CHROME_BUTTON_SPACING;
  const fixed = fixedWidth(tool, group);
  if (fixed !== undefined) {
    return fixed + 2 * margin;
  }
  const key = tool.key === undefined ? 0 : PALETTE_LAYOUT.keyGap + widthOf(keyText(tool.key));
  const [faceText] = toolTexts(tool, group);
  const face = tool.glyph !== undefined || faceText === undefined ? MUSIC_ICON_SIZE : widthOf(faceText);
  // Text is laid out on whole points at most: rounding up errs towards one more row.
  return Math.max(PALETTE_LAYOUT.toolMinWidth, Math.ceil(face + key) + 2 * padding) + 2 * margin;
}

/** The widths of a group's tools, row by row, as flex-wrap lays them in PALETTE_INNER_WIDTH. */
export function groupRows(group: PaletteGroup, widthOf: (request: TextRequest) => number): readonly (readonly number[])[] {
  return group.tools.reduce<readonly (readonly number[])[]>((rows, tool) => {
    const width = toolWidth(tool, group, widthOf);
    const last = rows[rows.length - 1];
    const used = last?.reduce((sum, w) => sum + w, 0) ?? 0;
    return last !== undefined && used + width <= PALETTE_INNER_WIDTH ? [...rows.slice(0, -1), [...last, width]] : [...rows, [width]];
  }, []);
}

/** A group's height: its title line, its rows of tools and steppers (a stepper beside the previous shares its row), its border. */
export function groupHeight(group: PaletteGroup, widthOf: (request: TextRequest) => number): number {
  const stepperRows = (group.steppers ?? []).filter((stepper) => stepper.isBesidePrevious !== true).length;
  return PALETTE_LAYOUT.titleHeight + PALETTE_ROW_HEIGHT * (groupRows(group, widthOf).length + stepperRows) + PALETTE_LAYOUT.border;
}
