import { readObject, toClampedInteger, toText, withoutUndefined } from './parse-values';
import {
  MAX_TRANSCRIBED_CAPO,
  MAX_TRANSCRIBED_NAME_LENGTH,
  MAX_TRANSCRIBED_PITCH_LENGTH,
  MAX_TRANSCRIBED_PROGRAM,
  MAX_TRANSCRIBED_TUNING_STRINGS,
  TRANSCRIBED_CLEFS,
  TRANSCRIBED_INSTRUMENTS,
  type TranscribedClef,
  type TranscribedInstrument,
  type TranscribedTrack,
} from './types';

/** Words an instrument the contract does not list may hold ("piano", "lead vocal"), each a kind, the first match winning. */
const INSTRUMENT_WORDS: readonly (readonly [pattern: RegExp, instrument: TranscribedInstrument])[] = [
  [/drum|percussion|\bkit\b/i, 'drums'],
  [/vocal|voice|vox|sing|choir/i, 'vocals'],
  [/ukulele|\buke\b/i, 'ukulele'],
  [/banjo/i, 'banjo'],
  [/bass/i, 'bass'],
  [/guitar/i, 'guitar'],
  [/piano|keyboard|\bkeys\b|organ|synth|rhodes|clav/i, 'keys'],
];

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

/**
 * A track's instrument: one the contract lists, as given; other text as the kind a word of it names ("piano" → keys),
 * else other; nothing (or not text) a guitar, as before the contract had more kinds.
 */
function parseInstrument(value: unknown): TranscribedInstrument {
  if (isOneOf(TRANSCRIBED_INSTRUMENTS, value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return 'guitar';
  }
  const text = value.slice(0, MAX_TRANSCRIBED_NAME_LENGTH);
  return INSTRUMENT_WORDS.find(([pattern]) => pattern.test(text))?.[1] ?? 'other';
}

/** Open strings as text, at most MAX_TRANSCRIBED_TUNING_STRINGS of them, each cut to a pitch's length. */
function parseTuning(value: unknown): readonly string[] {
  const entries: readonly unknown[] = Array.isArray(value) ? value.slice(0, MAX_TRANSCRIBED_TUNING_STRINGS) : [];
  return entries.map((entry) => (typeof entry === 'string' ? entry.trim() : typeof entry === 'number' ? String(entry) : '').slice(0, MAX_TRANSCRIBED_PITCH_LENGTH));
}

/**
 * A track; odd fields fall back (no name, a guitar, no tuning: standard, no capo, no program or clef: the instrument's)
 * since the builder can do without them. A name and a tuning list are cut to the contract's lengths.
 */
export function parseTrack(value: unknown, path: string): TranscribedTrack {
  const track = readObject(value, path);
  const clef: TranscribedClef | undefined = isOneOf(TRANSCRIBED_CLEFS, track.clef) ? track.clef : undefined;
  return withoutUndefined({
    name: toText(track.name)?.slice(0, MAX_TRANSCRIBED_NAME_LENGTH) ?? '',
    instrument: parseInstrument(track.instrument),
    tuning: parseTuning(track.tuning),
    capo: toClampedInteger(track.capo, 0, MAX_TRANSCRIBED_CAPO) ?? 0,
    program: toClampedInteger(track.program, 0, MAX_TRANSCRIBED_PROGRAM),
    clef,
  });
}

/** For the user: an instrument the contract does not list, and what it was read as ("Track 2 (Violin): …"). */
export function instrumentWarning(value: unknown, track: TranscribedTrack, trackIndex: number): string | undefined {
  if (typeof value !== 'string' || isOneOf(TRANSCRIBED_INSTRUMENTS, value)) {
    return undefined;
  }
  const label = track.name === '' ? `Track ${trackIndex + 1}` : `Track ${trackIndex + 1} (${track.name})`;
  return `${label}: instrument "${value.slice(0, MAX_TRANSCRIBED_NAME_LENGTH)}" read as ${track.instrument}`;
}
