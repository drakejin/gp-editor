import type { Note, Track } from '@gp-editor/core';
import { pitchName } from '../lib/pitch';
import type { Palette } from '../theme';
import type { DrawCommand } from './draw';
import { type PitchRegion, neckFret } from './fretboard';
import { type ScaleHighlight, scaleMarkColor } from './scale-marks';

/** An 88-key piano, A0 (MIDI 21) to C8 (108); sizes in points. */
export const PIANO = {
  lowest: 21,
  highest: 108,
  whiteKeyHeight: 54,
  /** A black key's share of a white key's height and width. */
  blackHeight: 0.62,
  blackWidth: 0.6,
  /** Room above and below the keys. */
  padding: 6,
  /** Between white keys, where the edge colour shows. */
  gap: 1,
  radius: 2,
  labelSize: 8,
  /** A label's centre above the bottom of its key. */
  labelLift: 8,
  /** A scale dot's centre above the bottom of its key, clear of the label, and its largest radius. */
  dotLift: 20,
  blackDotLift: 18,
  dotRadius: 4,
} as const;

/** Piano keys are white and black whatever the theme, as on the instrument. */
export const KEY_COLORS = { white: '#F4F3EF', black: '#1C1C1E', edge: '#55555A', label: '#8A8A90' } as const;

/** Pitch classes of the black keys: C♯ D♯ F♯ G♯ A♯. */
const BLACK_CLASSES: ReadonlySet<number> = new Set([1, 3, 6, 8, 10]);

const isBlackKey = (pitch: number): boolean => BLACK_CLASSES.has(((pitch % 12) + 12) % 12);

const PITCHES: readonly number[] = Array.from({ length: PIANO.highest - PIANO.lowest + 1 }, (_, i) => PIANO.lowest + i);

/** White keys below each key: a white key's place in the row, or the white key a black key sits after (+1). */
const WHITE_KEYS_BELOW: readonly number[] = PITCHES.map((pitch) => PITCHES.filter((other) => other < pitch && !isBlackKey(other)).length);

export const WHITE_KEY_COUNT = PITCHES.filter((pitch) => !isBlackKey(pitch)).length;

export interface PianoKey {
  readonly pitch: number;
  readonly x: number;
  readonly width: number;
  readonly isBlack: boolean;
}

/** Where a key is on a keyboard `width` points wide: white keys share the width, a black key straddles the gap between two. */
export function pianoKey(width: number, pitch: number): PianoKey | undefined {
  const whitesBelow = WHITE_KEYS_BELOW[pitch - PIANO.lowest];
  if (whitesBelow === undefined) {
    return undefined;
  }
  const whiteWidth = width / WHITE_KEY_COUNT;
  if (!isBlackKey(pitch)) {
    return { pitch, x: whitesBelow * whiteWidth, width: whiteWidth, isBlack: false };
  }
  const blackWidth = whiteWidth * PIANO.blackWidth;
  return { pitch, x: whitesBelow * whiteWidth - blackWidth / 2, width: blackWidth, isBlack: true };
}

/** Every key's area (canvas points) with its pitch, white keys first so the black ones, listed after, lie on top. */
export function keyboardHoverRegions(width: number): PitchRegion[] {
  const keys = PITCHES.flatMap((pitch) => pianoKey(width, pitch) ?? []);
  const region = (key: PianoKey): PitchRegion => ({ pitch: key.pitch, x: key.x, y: PIANO.padding, width: key.width, height: keyHeight(key) });
  return [...keys.filter((key) => !key.isBlack).map(region), ...keys.filter((key) => key.isBlack).map(region)];
}

export function keyboardHeight(): number {
  return PIANO.whiteKeyHeight + PIANO.padding * 2;
}

/** The pitches the notes sound on the track's neck (frets count from the capo); dead notes have none. */
export function soundingPitches(track: Track, notes: readonly Note[]): number[] {
  return notes.flatMap((note) => {
    const tuning = track.strings[note.string - 1]?.tuning;
    return tuning === undefined || note.effect.deadNote ? [] : [tuning + neckFret(track, note.fret)];
  });
}

export interface KeyboardInput {
  readonly width: number;
  /** Pitches to light (MIDI); those outside the 88 keys are left out. */
  readonly pitches: readonly number[];
  readonly palette: Palette;
  /** The Scales panel's scale: a dot on each of its keys, the root's in its own colour. */
  readonly scale?: ScaleHighlight;
}

/**
 * A piano keyboard with the given pitches lit and named, every C named so the octaves can be found, and the chosen
 * scale's keys dotted.
 */
export function engraveKeyboard(input: KeyboardInput): DrawCommand[] {
  const { width, palette } = input;
  const lit: ReadonlySet<number> = new Set(input.pitches);
  const keys = PITCHES.flatMap((pitch) => pianoKey(width, pitch) ?? []);
  const top = PIANO.padding;
  const edge: DrawCommand = { kind: 'rect', x: 0, y: top, width, height: PIANO.whiteKeyHeight, color: KEY_COLORS.edge, radius: PIANO.radius };
  return [
    edge,
    ...keys.filter((key) => !key.isBlack).map((key) => keyRect(key, lit.has(key.pitch), palette)),
    ...keys.filter((key) => key.isBlack).map((key) => keyRect(key, lit.has(key.pitch), palette)),
    ...keys.flatMap((key) => keyLabel(key, lit.has(key.pitch), palette)),
    ...keys.flatMap((key) => scaleDot(key, input.scale)),
  ];
}

/** A dot above the key's label where the key is a note of the scale. */
function scaleDot(key: PianoKey, scale: ScaleHighlight | undefined): DrawCommand[] {
  const color = scaleMarkColor(key.pitch, scale);
  if (color === undefined) {
    return [];
  }
  const y = PIANO.padding + keyHeight(key) - (key.isBlack ? PIANO.blackDotLift : PIANO.dotLift);
  return [{ kind: 'circle', x: key.x + key.width / 2, y, radius: Math.min(PIANO.dotRadius, key.width * 0.3), color }];
}

function keyHeight(key: PianoKey): number {
  return key.isBlack ? PIANO.whiteKeyHeight * PIANO.blackHeight : PIANO.whiteKeyHeight;
}

function keyRect(key: PianoKey, isLit: boolean, palette: Palette): DrawCommand {
  const inset = key.isBlack ? 0 : PIANO.gap / 2;
  const color = isLit ? palette.accent : key.isBlack ? KEY_COLORS.black : KEY_COLORS.white;
  return { kind: 'rect', x: key.x + inset, y: PIANO.padding, width: key.width - inset * 2, height: keyHeight(key), color, radius: PIANO.radius };
}

/** A lit key's name at its foot; an unlit C's octave name, for finding your way. */
function keyLabel(key: PianoKey, isLit: boolean, palette: Palette): DrawCommand[] {
  const isC = key.pitch % 12 === 0;
  if (!isLit && !isC) {
    return [];
  }
  const y = PIANO.padding + keyHeight(key) - PIANO.labelLift;
  const color = isLit ? palette.accentText : KEY_COLORS.label;
  return [{ kind: 'text', x: key.x + key.width / 2, y, text: pitchName(key.pitch), size: PIANO.labelSize, color, font: 'ui', align: 'center', bold: isLit }];
}
