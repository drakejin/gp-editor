// The edition palette laid out as EditionPalette and ChromeButton lay it out, with the widths of its texts as AppKit
// measures them (palette-text-widths.ts, written by scripts/palette-fit/run.sh): the rows each group takes and the
// palette's height, so __tests__/palette-fit.test.ts can check every group shows without scrolling at the default window;
// and where the window lays its parts out against the palette (placementOf), so __tests__/palette-fit-window.test.tsx
// can check that only the top bar and the tab strip stack above it.
import { StyleSheet } from 'react-native';
import type { ReactTestInstance } from 'react-test-renderer';
import { CHROME_BUTTON_SPACING } from '../src/components/chrome/ChromeButton';
import { EDITION_PALETTE_WIDTH, PALETTE_LAYOUT, PALETTE_ROW_HEIGHT, isLongHangulFace } from '../src/components/palette/EditionPalette';
import { MUSIC_ICON_SIZE } from '../src/components/palette/MusicIcon';
import type { PaletteGroup, PaletteTool } from '../src/components/palette/palette-tools';
import { TOP_BAR_HEIGHT } from '../src/components/TopBar';
import { TAB_STRIP } from '../src/lib/tab-strip';

/**
 * The window's content view at a first launch, title bar included: AppDelegate.swift's defaultSize(1280, 800) is the
 * whole window on macOS 26, its content view running under the title bar (measured 2026-11-01 on a QA copy without a
 * saved frame: a 1280 × 800 snapshot, "NSWindow Frame main" saved as 1280 × 800). Windows: tauri.conf.json's 1280 × 800
 * is the inner size, with no title strip in the page: 800 − 46 − 28 = 726 points under the tab strip, some 20 fewer if the
 * native menu bar takes its height from it — more room than the Mac's 694 either way (Windows' widths are not measured).
 */
export const DEFAULT_WINDOW_HEIGHT = 800;
/** The Mac's title bar over the content view: the React Native root starts under it (measured on the same snapshot). */
export const MAC_TITLE_BAR_HEIGHT = 32;
/**
 * Where the first group starts in that window: under the title bar, the top bar and the tab strip — and nothing else,
 * palette-fit-window.test.tsx checks (y = 106, as measured on 0.17.0's and 0.21's snapshots).
 */
export const PALETTE_GROUPS_TOP = MAC_TITLE_BAR_HEIGHT + TOP_BAR_HEIGHT + TAB_STRIP.height;
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

/** The nodes from the renderer's root down to `node`. */
function pathFromRoot(node: ReactTestInstance): readonly ReactTestInstance[] {
  return node.parent === null ? [node] : [...pathFromRoot(node.parent), node];
}

/** Where the window lays one node out against another: above or below it in a column, beside it in a row, or inside it. */
export type Placement = 'above' | 'below' | 'beside' | 'inside';

/**
 * Where the window lays `node` out against `other`: the view holding both (their nearest common node, or the nearest
 * view around it) stacks its children in a column (above / below, by their order; reversed for column-reverse) or
 * lines them up in a row (beside); one inside the other is `inside`, either way round.
 */
export function placementOf(node: ReactTestInstance, other: ReactTestInstance): Placement {
  const nodePath = pathFromRoot(node);
  const otherPath = pathFromRoot(other);
  const split = nodePath.findIndex((each, index) => each !== otherPath[index]);
  const common = nodePath[split - 1];
  const nodeBranch = nodePath[split];
  const otherBranch = otherPath[split];
  if (split < 1 || common === undefined || nodeBranch === undefined || otherBranch === undefined) {
    return 'inside';
  }
  const container = nodePath.slice(0, split).reverse().find((each) => typeof each.type === 'string');
  const direction = StyleSheet.flatten(container?.props.style)?.flexDirection ?? 'column';
  if (direction === 'row' || direction === 'row-reverse') {
    return 'beside';
  }
  const isFirst = common.children.indexOf(nodeBranch) < common.children.indexOf(otherBranch);
  return isFirst === (direction === 'column') ? 'above' : 'below';
}
