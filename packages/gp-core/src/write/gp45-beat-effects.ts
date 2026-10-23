// Port of TuxGuitar GP4OutputStream/GP5OutputStream#writeBeatEffects (LGPL-2.1).
import type { Beat, Bend, Note, StrokeDirection } from '../model/song';
import type { ByteWriter } from './byte-writer';
import { writeBendCurve } from './gp-bends';
import { strokeSpeedToGp } from './gp-units';

/** Effects GP4/GP5 store per beat but the model per note: taken from the voice's notes. */
export interface VoiceEffects {
  readonly fadeIn: boolean;
  /** Wide vibrato is a beat effect (a note's own vibrato is slight). */
  readonly wideVibrato: boolean;
  /** 1 tapping, 2 slapping, 3 popping, 0 none. */
  readonly slapType: number;
  readonly tremoloBar?: Bend;
}

export function voiceEffects(notes: readonly Note[]): VoiceEffects {
  const tremoloBar = [...notes].reverse().find((note) => note.effect.tremoloBar !== undefined)?.effect.tremoloBar;
  const slapType = notes.some((note) => note.effect.tapping)
    ? 1
    : notes.some((note) => note.effect.slapping)
      ? 2
      : notes.some((note) => note.effect.popping)
        ? 3
        : 0;
  return {
    fadeIn: notes.some((note) => note.effect.fadeIn),
    wideVibrato: notes.some((note) => note.effect.wideVibrato),
    slapType,
    ...(tremoloBar === undefined ? {} : { tremoloBar }),
  };
}

export function hasBeatEffects(beat: Beat, effects: VoiceEffects): boolean {
  return (
    beat.stroke.direction !== 'none' ||
    beat.pickStroke !== 'none' ||
    effects.fadeIn ||
    effects.wideVibrato ||
    effects.slapType !== 0 ||
    effects.tremoloBar !== undefined ||
    beat.rasgueado !== undefined
  );
}

/** The two stroke bytes, `first` direction first. */
export function strokeBytes(direction: StrokeDirection, value: number, first: 'up' | 'down'): readonly [number, number] {
  const speed = strokeSpeedToGp(value);
  const second = first === 'up' ? 'down' : 'up';
  return [direction === first ? speed : 0, direction === second ? speed : 0];
}

/** GP4/GP5 beat effects; GP5 writes the up stroke byte first, GP4 (and GP3) the down one. */
export function writeBeatEffectsGp45(writer: ByteWriter, beat: Beat, effects: VoiceEffects, firstStroke: 'up' | 'down'): void {
  const hasStroke = beat.stroke.direction !== 'none';
  const flags1 = (effects.wideVibrato ? 0x02 : 0) | (effects.fadeIn ? 0x10 : 0) | (effects.slapType !== 0 ? 0x20 : 0) | (hasStroke ? 0x40 : 0);
  // 0x01: rasgueado (GP4/GP5 keep no pattern).
  const flags2 = (beat.rasgueado !== undefined ? 0x01 : 0) | (beat.pickStroke !== 'none' ? 0x02 : 0) | (effects.tremoloBar !== undefined ? 0x04 : 0);
  writer.writeUnsignedByte(flags1).writeUnsignedByte(flags2);
  if (effects.slapType !== 0) {
    writer.writeUnsignedByte(effects.slapType);
  }
  if (effects.tremoloBar !== undefined) {
    writeBendCurve(writer, effects.tremoloBar, 'tremoloBar');
  }
  if (hasStroke) {
    writer.writeBytes(strokeBytes(beat.stroke.direction, beat.stroke.value, firstStroke));
  }
  if (beat.pickStroke !== 'none') {
    writer.writeUnsignedByte(beat.pickStroke === 'up' ? 1 : 2);
  }
}
