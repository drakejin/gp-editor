import { GM_DRUM_KEYS, gmPercussionName } from '@gp-editor/core';
import type { Palette } from '../theme';
import { type DrawCommand, scaleCommands, translateCommands } from './draw';

/** The kit is drawn in a box of these points, seen from above with the drummer at the bottom, and shrunk to fit. */
export const DRUM_KIT = { width: 600, height: 172, labelSize: 9, smallLabelSize: 8 } as const;

/** Drums and cymbals have their colours whatever the theme, as the piano's keys do. */
export const DRUM_COLORS = { head: '#E4E1DA', rim: '#6E6E73', cymbal: '#C8A24A', cymbalEdge: '#8C6E22', label: '#2C2E33', pedal: '#9A9AA0' } as const;

export type DrumPieceKind = 'drum' | 'cymbal' | 'pedal';

/** A piece of the kit: where it is drawn (kit points), the drums that light it and the one a click enters. */
export interface DrumPiece {
  readonly id: string;
  readonly label: string;
  /** The General MIDI key a click enters. */
  readonly key: number;
  /** Keys that light the piece (the kick for both bass drums). */
  readonly keys: readonly number[];
  readonly kind: DrumPieceKind;
  readonly x: number;
  readonly y: number;
  /** A pedal is a bar 2 × radius wide and radius high. */
  readonly radius: number;
  /** Where the label goes, from the centre down; small pieces carry theirs underneath. */
  readonly labelOffset?: number;
}

const K = GM_DRUM_KEYS;

function piece(id: string, label: string, keys: readonly number[], kind: DrumPieceKind, at: readonly [number, number, number], labelOffset?: number): DrumPiece {
  const [x, y, radius] = at;
  return { id, label, key: keys[0] ?? K.bassDrum, keys, kind, x, y, radius, labelOffset };
}

/** The kit, in drawing order (a piece drawn on another comes after it). */
export const DRUM_PIECES: readonly DrumPiece[] = [
  piece('splash', 'Splash', [K.splash], 'cymbal', [52, 30, 18]),
  piece('crash', 'Crash', [K.crash1], 'cymbal', [158, 32, 26]),
  piece('openHiHat', 'Open', [K.openHiHat], 'cymbal', [30, 92, 12], 20),
  piece('hiHat', 'Hi-hat', [K.closedHiHat], 'cymbal', [92, 92, 26]),
  piece('pedalHiHat', 'Pedal', [K.pedalHiHat], 'pedal', [92, 140, 18]),
  piece('snare', 'Snare', [K.snare, K.electricSnare], 'drum', [182, 108, 25]),
  piece('sideStick', 'Rim', [K.sideStick], 'drum', [205, 128, 8], 0),
  piece('tom1', 'Tom 1', [K.highTom], 'drum', [240, 48, 19]),
  piece('tom2', 'Tom 2', [K.hiMidTom], 'drum', [302, 40, 19]),
  piece('kick', 'Kick', [K.bassDrum, K.acousticBassDrum], 'drum', [300, 112, 34]),
  piece('tom3', 'Tom 3', [K.lowTom, K.lowMidTom], 'drum', [364, 48, 20]),
  piece('floorTom', 'Floor', [K.highFloorTom, K.lowFloorTom], 'drum', [418, 112, 27]),
  piece('crash2', 'Crash 2', [K.crash2], 'cymbal', [440, 30, 24]),
  piece('ride', 'Ride', [K.ride, K.ride2], 'cymbal', [508, 92, 34], -20),
  piece('rideBell', 'Bell', [K.rideBell], 'cymbal', [508, 92, 11], 0),
  piece('china', 'China', [K.china], 'cymbal', [566, 30, 20]),
  piece('cowbell', 'Cowbell', [K.cowbell], 'pedal', [572, 140, 18]),
];

const ALL_KIT_KEYS: ReadonlySet<number> = new Set(DRUM_PIECES.flatMap((drum) => drum.keys));

export interface DrumKitLayout {
  /** Kit points → canvas points. */
  readonly scale: number;
  /** Left edge of the kit in the canvas: the kit is centred when the canvas is wider. */
  readonly left: number;
}

/** The kit's size and place on a canvas `width` points wide: shrunk to fit, never enlarged. */
export function drumKitLayout(width: number): DrumKitLayout {
  const scale = Math.max(0, Math.min(1, width / DRUM_KIT.width));
  return { scale, left: (width - DRUM_KIT.width * scale) / 2 };
}

export function drumKitHeight(width: number): number {
  return DRUM_KIT.height * drumKitLayout(width).scale;
}

export interface DrumKitInput {
  readonly width: number;
  /** General MIDI keys sounding now (the playing beat, else the cursor's beat): a drum note's fret. */
  readonly keys: readonly number[];
  readonly palette: Palette;
}

/** The drum kit with the pieces of the sounding drums lit, and the sounding drums it has no piece for named. */
export function engraveDrumKit(input: DrumKitInput): DrawCommand[] {
  const { scale, left } = drumKitLayout(input.width);
  if (scale <= 0) {
    return [];
  }
  const lit: ReadonlySet<number> = new Set(input.keys);
  const commands = [...DRUM_PIECES.flatMap((drum) => engravePiece(drum, drum.keys.some((key) => lit.has(key)), input.palette)), ...otherDrums(input.keys, input.palette)];
  return translateCommands(scaleCommands(commands, scale), left, 0);
}

function pieceFill(drum: DrumPiece, isLit: boolean, palette: Palette): string {
  if (isLit) {
    return palette.accent;
  }
  return drum.kind === 'cymbal' ? DRUM_COLORS.cymbal : drum.kind === 'pedal' ? DRUM_COLORS.pedal : DRUM_COLORS.head;
}

function engravePiece(drum: DrumPiece, isLit: boolean, palette: Palette): DrawCommand[] {
  const fill = pieceFill(drum, isLit, palette);
  const edge = drum.kind === 'cymbal' ? DRUM_COLORS.cymbalEdge : DRUM_COLORS.rim;
  const shape: DrawCommand[] =
    drum.kind === 'pedal'
      ? [{ kind: 'rect', x: drum.x - drum.radius, y: drum.y - drum.radius / 2, width: drum.radius * 2, height: drum.radius, color: fill, radius: 3 }]
      : [
          { kind: 'circle', x: drum.x, y: drum.y, radius: drum.radius, color: fill },
          { kind: 'circle', x: drum.x, y: drum.y, radius: drum.radius, color: edge, strokeWidth: drum.kind === 'drum' ? 2.5 : 1 },
        ];
  const isInside = drum.labelOffset === undefined || Math.abs(drum.labelOffset) < drum.radius;
  const size = drum.radius < 15 ? DRUM_KIT.smallLabelSize : DRUM_KIT.labelSize;
  const color = isLit && isInside ? palette.accentText : isInside ? DRUM_COLORS.label : palette.text;
  const label: DrawCommand = { kind: 'text', x: drum.x, y: drum.y + (drum.labelOffset ?? 0), text: drum.label, size, color, font: 'ui', align: 'center', bold: isLit };
  return [...shape, label];
}

/** "Also: Hi Bongo, Maracas": sounding drums the kit has no piece for, in the corner. */
function otherDrums(keys: readonly number[], palette: Palette): DrawCommand[] {
  const names = [...new Set(keys)].filter((key) => !ALL_KIT_KEYS.has(key)).flatMap((key) => gmPercussionName(key) ?? []);
  if (names.length === 0) {
    return [];
  }
  return [{ kind: 'text', x: 0, y: DRUM_KIT.height - 7, text: `Also: ${names.join(', ')}`, size: DRUM_KIT.labelSize, color: palette.accent, font: 'ui', align: 'left', bold: true }];
}

function contains(drum: DrumPiece, x: number, y: number): boolean {
  const dx = x - drum.x;
  const dy = y - drum.y;
  return drum.kind === 'pedal' ? Math.abs(dx) <= drum.radius && Math.abs(dy) <= drum.radius / 2 : dx * dx + dy * dy <= drum.radius * drum.radius;
}

/** The piece under a point of a kit `width` points wide (the smallest when pieces overlap: the bell on the ride). */
export function hitTestDrumKit(width: number, x: number, y: number): DrumPiece | undefined {
  const { scale, left } = drumKitLayout(width);
  if (scale <= 0) {
    return undefined;
  }
  const kitX = (x - left) / scale;
  const kitY = y / scale;
  return DRUM_PIECES.filter((drum) => contains(drum, kitX, kitY)).reduce<DrumPiece | undefined>((best, drum) => (best === undefined || drum.radius < best.radius ? drum : best), undefined);
}
