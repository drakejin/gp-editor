import { gmFamilyIndex, type Song } from '@gp-editor/core';
import { trackInstrument } from '../lib/instruments';
import type { DrawCommand } from './draw';

/** Icons of the tracks panel, drawn by the native canvas in a PANEL_ICON_SIZE square (origin top-left). */
export const PANEL_ICON_SIZE = 16;

export type InstrumentIconKind = 'guitar' | 'bass' | 'drums' | 'keys' | 'voice' | 'other';

/** General MIDI families drawn as a keyboard: piano, chromatic percussion, organ, synth lead, synth pad. */
const KEYS_FAMILIES: ReadonlySet<number> = new Set([0, 1, 2, 10, 11]);
const GUITAR_FAMILY = 3;
const BASS_FAMILY = 4;
/** Choir Aahs, Voice Oohs, Synth Voice. */
const VOICE_PROGRAMS = { first: 52, last: 54 } as const;
const VOICE_NAME = /voc|vox|voice|sing|choir/i;

/** Which icon stands for a track: drums, a voice (by program or name), else by its General MIDI family. */
export function instrumentIconKind(song: Song, trackIndex: number): InstrumentIconKind {
  const track = song.tracks[trackIndex];
  const instrument = trackInstrument(song, trackIndex);
  if (track?.isPercussion === true || instrument?.isPercussion === true) {
    return 'drums';
  }
  const program = instrument?.program;
  const isVoiceProgram = program !== undefined && program >= VOICE_PROGRAMS.first && program <= VOICE_PROGRAMS.last;
  if (isVoiceProgram || VOICE_NAME.test(track?.name ?? '')) {
    return 'voice';
  }
  if (program === undefined) {
    return 'guitar';
  }
  const family = gmFamilyIndex(program);
  return family === GUITAR_FAMILY ? 'guitar' : family === BASS_FAMILY ? 'bass' : KEYS_FAMILIES.has(family) ? 'keys' : 'other';
}

export function engraveInstrumentIcon(kind: InstrumentIconKind, color: string): DrawCommand[] {
  switch (kind) {
    case 'guitar':
      return guitar(color, { bodyX: 5.5, bodyY: 11.5, body: 4, upper: 2.8, neckEnd: 13.4, neckWidth: 1.6 });
    case 'bass':
      return guitar(color, { bodyX: 5, bodyY: 12, body: 3.4, upper: 2.4, neckEnd: 14, neckWidth: 1.3 });
    case 'drums':
      return drums(color);
    case 'keys':
      return keys(color);
    case 'voice':
      return microphone(color);
    case 'other':
      return eighthNote(color);
  }
}

interface GuitarShape {
  readonly bodyX: number;
  readonly bodyY: number;
  /** Radius of the lower bout; the upper bout sits up and right of it. */
  readonly body: number;
  readonly upper: number;
  /** Where the neck meets the head (x = 16 - y). */
  readonly neckEnd: number;
  readonly neckWidth: number;
}

/** A guitar lying diagonally: body bottom-left, head top-right. */
function guitar(color: string, shape: GuitarShape): DrawCommand[] {
  const upperX = shape.bodyX + shape.body * 0.65;
  const upperY = shape.bodyY - shape.body * 0.65;
  const end = shape.neckEnd;
  return [
    { kind: 'circle', x: shape.bodyX, y: shape.bodyY, radius: shape.body, color },
    { kind: 'circle', x: upperX, y: upperY, radius: shape.upper, color },
    { kind: 'line', x1: upperX, y1: upperY, x2: end, y2: 16 - end, width: shape.neckWidth, color },
    { kind: 'line', x1: end - 0.3, y1: 16.3 - end, x2: end + 2, y2: 14 - end, width: 2.8, color },
  ];
}

function drums(color: string): DrawCommand[] {
  return [
    { kind: 'rect', x: 2, y: 8.5, width: 12, height: 6, color, radius: 1.5 },
    { kind: 'rect', x: 1.5, y: 7, width: 13, height: 1.4, color, radius: 0.7 },
    { kind: 'line', x1: 3, y1: 1.5, x2: 8.5, y2: 6.5, width: 1.2, color },
    { kind: 'line', x1: 13, y1: 1.5, x2: 7.5, y2: 6.5, width: 1.2, color },
  ];
}

/** A keyboard: an outlined case, three black keys, white keys parted below them. */
function keys(color: string): DrawCommand[] {
  const top = 3.5;
  const bottom = 12.5;
  const outline: DrawCommand[] = [
    { kind: 'line', x1: 1.5, y1: top, x2: 14.5, y2: top, width: 1.2, color },
    { kind: 'line', x1: 1.5, y1: bottom, x2: 14.5, y2: bottom, width: 1.2, color },
    { kind: 'line', x1: 1.5, y1: top - 0.6, x2: 1.5, y2: bottom + 0.6, width: 1.2, color },
    { kind: 'line', x1: 14.5, y1: top - 0.6, x2: 14.5, y2: bottom + 0.6, width: 1.2, color },
  ];
  const blackKeys = [4.2, 7.2, 10.2].map((x): DrawCommand => ({ kind: 'rect', x, y: top, width: 1.8, height: 5, color }));
  const parts = [5.1, 8.1, 11.1].map((x): DrawCommand => ({ kind: 'line', x1: x, y1: top + 5, x2: x, y2: bottom, width: 0.8, color }));
  return [...outline, ...blackKeys, ...parts];
}

function microphone(color: string): DrawCommand[] {
  return [
    { kind: 'rect', x: 5.5, y: 1, width: 5, height: 8, color, radius: 2.5 },
    { kind: 'curve', x1: 3.5, y1: 6.5, cx: 8, cy: 14.5, x2: 12.5, y2: 6.5, width: 1.2, color },
    { kind: 'line', x1: 8, y1: 10.5, x2: 8, y2: 14, width: 1.2, color },
    { kind: 'line', x1: 5, y1: 14.4, x2: 11, y2: 14.4, width: 1.2, color },
  ];
}

function eighthNote(color: string): DrawCommand[] {
  return [
    { kind: 'circle', x: 6, y: 12, radius: 2.6, color },
    { kind: 'line', x1: 8, y1: 12, x2: 8, y2: 2.5, width: 1.3, color },
    { kind: 'curve', x1: 8, y1: 2.5, cx: 13, cy: 5, x2: 12, y2: 9.5, width: 1.3, color },
  ];
}

/** An open eye: the track shown in the score. */
export function engraveEyeIcon(color: string): DrawCommand[] {
  return [
    { kind: 'curve', x1: 1, y1: 8, cx: 8, cy: 1, x2: 15, y2: 8, width: 1.3, color },
    { kind: 'curve', x1: 1, y1: 8, cx: 8, cy: 15, x2: 15, y2: 8, width: 1.3, color },
    { kind: 'circle', x: 8, y: 8, radius: 2.6, color },
  ];
}

/** A speaker with sound waves, or crossed out when muted. */
export function engraveSpeakerIcon(color: string, isMuted: boolean): DrawCommand[] {
  const speaker: DrawCommand = { kind: 'polygon', points: [2, 6, 5, 6, 9, 2.5, 9, 13.5, 5, 10, 2, 10], color };
  if (isMuted) {
    return [
      speaker,
      { kind: 'line', x1: 11, y1: 5.5, x2: 15, y2: 10.5, width: 1.3, color },
      { kind: 'line', x1: 15, y1: 5.5, x2: 11, y2: 10.5, width: 1.3, color },
    ];
  }
  return [
    speaker,
    { kind: 'curve', x1: 11, y1: 5.5, cx: 13, cy: 8, x2: 11, y2: 10.5, width: 1.2, color },
    { kind: 'curve', x1: 12.5, y1: 3.5, cx: 16, cy: 8, x2: 12.5, y2: 12.5, width: 1.2, color },
  ];
}

/** Headphones: solo. */
export function engraveHeadphonesIcon(color: string): DrawCommand[] {
  return [
    { kind: 'curve', x1: 3, y1: 10.5, cx: 8, cy: -3, x2: 13, y2: 10.5, width: 1.5, color },
    { kind: 'rect', x: 1.5, y: 9, width: 3.5, height: 5.5, color, radius: 1 },
    { kind: 'rect', x: 11, y: 9, width: 3.5, height: 5.5, color, radius: 1 },
  ];
}
