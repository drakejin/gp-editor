// Port of TuxGuitar app.tuxguitar.io.gtp.GP3InputStream/GP4InputStream/GP5InputStream shared parts (LGPL-2.1): note effects GP4/GP5 share (bends, tremolo bar, tremolo picking, trill, harmonic, grace transitions).
import type { ByteReader } from '../../io/byte-reader';
import { plainDuration } from '../../model/defaults';
import type { BendPoint, Duration, NoteEffect, TremoloPicking, Trill } from '../../model/song';
import { bendPositionFromGp } from '../common/bend-units';

/** GP3–GP5 bend positions run 0…60. */
const GP_BEND_POSITION = 60;

/** GP4/GP5 bend and tremolo bar: type and value (skipped), then the points. */
export function readBendPoints(reader: ByteReader, toValue: (raw: number) => number): readonly BendPoint[] {
  reader.skip(5);
  const count = reader.readInt();
  const points: BendPoint[] = [];
  for (let i = 0; i < count; i++) {
    const position = reader.readInt();
    const value = reader.readInt();
    reader.readByte(); // vibrato
    points.push({ position: bendPositionFromGp(position, GP_BEND_POSITION), value: toValue(value) });
  }
  return points;
}

export function withBend(effect: NoteEffect, points: readonly BendPoint[]): NoteEffect {
  return points.length > 0 ? { ...effect, bend: { points } } : effect;
}

export function withTremoloBar(effect: NoteEffect, points: readonly BendPoint[]): NoteEffect {
  return points.length > 0 ? { ...effect, tremoloBar: { points } } : effect;
}

export function readTremoloPicking(reader: ByteReader): TremoloPicking | undefined {
  const values: Readonly<Record<number, Duration['value']>> = { 1: 8, 2: 16, 3: 32 };
  const value = values[reader.readUnsignedByte()];
  return value === undefined ? undefined : { duration: plainDuration(value) };
}

export function readTrill(reader: ByteReader): Trill | undefined {
  const fret = reader.readByte();
  const values: Readonly<Record<number, Duration['value']>> = { 1: 16, 2: 32, 3: 64 };
  const value = values[reader.readByte()];
  return value === undefined ? undefined : { fret, duration: plainDuration(value) };
}

export function withTremoloPicking(effect: NoteEffect, tremoloPicking: TremoloPicking | undefined): NoteEffect {
  return tremoloPicking === undefined ? effect : { ...effect, tremoloPicking };
}

export function withTrill(effect: NoteEffect, trill: Trill | undefined): NoteEffect {
  return trill === undefined ? effect : { ...effect, trill };
}

export function withHarmonic(effect: NoteEffect, harmonic: NoteEffect['harmonic']): NoteEffect {
  return harmonic === undefined ? effect : { ...effect, harmonic };
}

export const GRACE_TRANSITIONS: readonly NonNullable<NoteEffect['grace']>['transition'][] = [
  'none',
  'slide',
  'bend',
  'hammer',
];
