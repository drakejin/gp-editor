import { DEFAULT_STYLESHEET, type Song, type TextStyle, stylesheetOf } from '@gp-editor/core';
import type { Palette } from '../theme';
import { type DrawCommand, translateCommands } from './draw';
import { type RowGeometry, stavesSpan } from './geometry';
import { type RowContext, engraveRowAnnotations, engraveRowStaves, placeRow } from './row';
import { SYSTEM, type ScoreLayout, staffLabel, systemNameFormat } from './score-layout';
import { textWidth } from './symbols/shapes';
import { styleText } from './text-styles';

const BRACKET_WIDTH = 3;
/** The bracket's ends: they reach past the outer staff lines and curl towards the staves. */
const BRACKET_OVERHANG = 3;
const BRACKET_CURL = 7;
const BRACKET_CURL_WIDTH = 1.5;

/** What a staff of a multitrack system draws around its own row: the track's label, the bracket, the bar lines through the system. */
export interface StaffDecor {
  /** The names column; the staff's row is drawn right of it. */
  readonly namesWidth: number;
  /** The track's name (first system) or short name (the others). */
  readonly label: string;
  readonly isFirstStaff: boolean;
  readonly isLastStaff: boolean;
  /** The staff's canvas: its geometry's height, and the gap under a system's last staff. */
  readonly height: number;
}

/** The decor of a staff in a system; undefined for a one-track score, which draws its rows as they always were. */
export function staffDecor(song: Song, layout: ScoreLayout, systemIndex: number, staffIndex: number): StaffDecor | undefined {
  const system = layout.systems[systemIndex];
  const staff = system?.staves[staffIndex];
  const track = staff === undefined ? undefined : song.tracks[staff.trackIndex];
  if (layout.staves.length < 2 || staff === undefined || system === undefined || track === undefined) {
    return undefined;
  }
  return {
    namesWidth: system.namesWidth,
    label: staffLabel(track, systemIndex === 0, systemNameFormat(song, systemIndex)),
    isFirstStaff: staffIndex === 0,
    isLastStaff: staffIndex === layout.staves.length - 1,
    height: staff.height,
  };
}

/** Where a track's staves run, top line to bottom line, and the gap between its notation and its tab when it has both. */
interface StaffSpan {
  readonly top: number;
  readonly bottom: number;
  readonly inner?: { readonly from: number; readonly to: number };
}

function staffSpan(geometry: RowGeometry, stringCount: number): StaffSpan | undefined {
  const span = stavesSpan(geometry, stringCount);
  if (span === undefined) {
    return undefined;
  }
  const { top, bottom, notationBottom } = span;
  const { tabTop } = geometry;
  return { top, bottom, inner: notationBottom === undefined || tabTop === undefined ? undefined : { from: notationBottom, to: tabTop } };
}

/**
 * The system's start line and every bar line, continued over the canvas above and below the staff (and between its
 * staves); only the start line when the stylesheet keeps each track's bar lines to its own staves.
 */
function systemLines(context: RowContext, decor: StaffDecor, span: StaffSpan): DrawCommand[] {
  const placed = placeRow(context.row, context.headerWidth);
  const barXs = stylesheetOf(context.song).systems.showsBarlinesAcrossSystem ? placed.map((measure) => measure.x + measure.layout.width) : [];
  const xs = [0.5, ...barXs].map((x) => x + decor.namesWidth);
  const segments = [
    ...(decor.isFirstStaff ? [] : [[0, span.top] as const]),
    ...(span.inner === undefined ? [] : [[span.inner.from, span.inner.to] as const]),
    ...(decor.isLastStaff ? [] : [[span.bottom, decor.height] as const]),
  ];
  const color = context.palette.text;
  return xs.flatMap((x) => segments.map(([y1, y2]): DrawCommand => ({ kind: 'line', x1: x, y1, x2: x, y2, width: 1, color })));
}

/** The bracket's part on this staff's canvas: the thick line, curled at the system's top and bottom. */
function bracket(decor: StaffDecor, span: StaffSpan, color: string): DrawCommand[] {
  const x = decor.namesWidth - SYSTEM.bracketGap;
  const top = decor.isFirstStaff ? span.top - BRACKET_OVERHANG : 0;
  const bottom = decor.isLastStaff ? span.bottom + BRACKET_OVERHANG : decor.height;
  const curl = (y: number, direction: 1 | -1): DrawCommand => ({
    kind: 'curve', x1: x - BRACKET_WIDTH / 2, y1: y, cx: x + BRACKET_CURL / 2, cy: y, x2: x + BRACKET_CURL, y2: y - direction * BRACKET_CURL,
    width: BRACKET_CURL_WIDTH, color,
  });
  return [
    { kind: 'line', x1: x, y1: top, x2: x, y2: bottom, width: BRACKET_WIDTH, color },
    ...(decor.isFirstStaff ? [curl(top, 1)] : []),
    ...(decor.isLastStaff ? [curl(bottom, -1)] : []),
  ];
}

/** The label, cut with an ellipsis to the names column's longest (at the label's font size). */
function fittedLabel(label: string, size: number): string {
  if (textWidth(label, size) <= SYSTEM.maxNameWidth) {
    return label;
  }
  const chars = Math.max(1, Math.floor(SYSTEM.maxNameWidth / textWidth('M', size)) - 1);
  return `${label.slice(0, chars)}…`;
}

/** The track's name right of the bracket, in the stylesheet's track name font; none when the stylesheet hides it. */
function nameLabel(decor: StaffDecor, span: StaffSpan, palette: Palette, style: TextStyle): DrawCommand[] {
  if (decor.label === '') {
    return [];
  }
  const base = DEFAULT_STYLESHEET.texts.trackName;
  const x = decor.namesWidth - SYSTEM.bracketGap - SYSTEM.nameGap;
  const text = fittedLabel(decor.label, (SYSTEM.nameSize * style.size) / base.size);
  return [styleText({ kind: 'text', x, y: (span.top + span.bottom) / 2, text, size: SYSTEM.nameSize, color: palette.text, font: 'ui', align: 'right' }, style, base)];
}

/**
 * A staff of a multitrack system on its own canvas: the track's row right of the names column, its label, its part of
 * the bracket and of the bar lines that run through the system (the canvases of a system touch, so the parts join).
 */
export function engraveSystemStaff(context: RowContext, decor: StaffDecor): DrawCommand[] {
  const track = context.song.tracks[context.trackIndex];
  const row = translateCommands(engraveRowStaves(context), decor.namesWidth, 0);
  // The annotations last: no bar line through the system crosses their boxes.
  const annotations = translateCommands(engraveRowAnnotations(context), decor.namesWidth, 0);
  const span = track === undefined ? undefined : staffSpan(context.geometry, track.strings.length);
  if (span === undefined) {
    return [...row, ...annotations];
  }
  const style = stylesheetOf(context.song).texts.trackName;
  return [...row, ...systemLines(context, decor, span), ...bracket(decor, span, context.palette.text), ...nameLabel(decor, span, context.palette, style), ...annotations];
}
