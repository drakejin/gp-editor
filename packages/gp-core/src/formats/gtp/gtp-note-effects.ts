// Port of TuxGuitar app.tuxguitar.io.gtp.GP3InputStream/GP4InputStream/GP5InputStream shared parts (LGPL-2.1): note effects GP4/GP5 share (bends, tremolo bar, tremolo picking, trill, harmonic, grace transitions).
import type { ByteReader } from '../../io/byte-reader';
import { plainDuration } from '../../model/defaults';
import type { BendPoint, NoteEffect, TremoloPicking, Trill } from '../../model/song';
import { GTP_BEND_POSITIONS, bendPositionFromGp } from '../common/bend-units';
import { TREMOLO_PICKING_CODES, TRILL_PERIOD_CODES, noteValueOfCode } from '../common/gtp-codes';

/** GP4/GP5 bend and tremolo bar: type and value (skipped), then the points. */
export function readBendPoints(reader: ByteReader, toValue: (raw: number) => number): readonly BendPoint[] {
  reader.skip(5);
  const count = reader.readInt();
  const points: BendPoint[] = [];
  for (let i = 0; i < count; i++) {
    const position = reader.readInt();
    const value = reader.readInt();
    reader.readByte(); // vibrato
    points.push({ position: bendPositionFromGp(position, GTP_BEND_POSITIONS), value: toValue(value) });
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
  const value = noteValueOfCode(TREMOLO_PICKING_CODES, reader.readUnsignedByte());
  return value === undefined ? undefined : { duration: plainDuration(value) };
}

export function readTrill(reader: ByteReader): Trill | undefined {
  const fret = reader.readByte();
  const value = noteValueOfCode(TRILL_PERIOD_CODES, reader.readByte());
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

