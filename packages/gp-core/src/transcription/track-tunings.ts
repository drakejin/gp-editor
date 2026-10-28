import { MAX_FRET } from '../edit/edit-song';
import { trackKindSpec, trackTuningChoices } from '../edit/track-kinds';
import { PERCUSSION_STRING_COUNT } from '../formats/midi/midi-strings';
import { STANDARD_TUNING } from '../model/defaults';
import { MAX_STRINGS } from '../write/gtp-song';
import { trackKindOf } from './instruments';
import { parsePitch } from './pitch';
import type { TranscribedBeat, TranscribedInstrument, TranscribedMeasure, TranscribedTrack } from './types';

const MAX_MIDI_PITCH = 127;

export interface ResolvedTuning {
  /** Open-string MIDI pitches, string 1 (highest) first. */
  readonly tuning: readonly number[];
  readonly warning?: string;
}

/** The lowest and highest pitch a part sounds. */
export interface PitchRange {
  readonly min: number;
  readonly max: number;
}

/** A drum track's six silent strings: a drum note's fret is its General MIDI key (TGSongManager.createPercussionStrings). */
export const DRUM_TUNING: readonly number[] = Array.from({ length: PERCUSSION_STRING_COUNT }, () => 0);

/** A fretted instrument's standard tuning: its Add Track kind's first (guitar E A D G B E, bass E A D G, ukulele G C E A, banjo open G). */
function standardTuningOf(instrument: TranscribedInstrument): readonly number[] {
  const kind = trackKindOf(instrument);
  return trackTuningChoices(kind, trackKindSpec(kind)?.stringCounts[0] ?? 0)[0]?.tuning ?? STANDARD_TUNING;
}

/**
 * A fretted instrument's open-string pitches, string 1 first. The contract lists them lowest first; a list given highest
 * first is read that way too (and a re-entrant ukulele's G C E A, whose first string is not its lowest). Standard tuning
 * when none is given, or (with a warning) when it cannot be read or has more strings than Guitar Pro 5 holds.
 */
export function resolveFrettedTuning(track: TranscribedTrack, name: string): ResolvedTuning {
  const standard = standardTuningOf(track.instrument);
  if (track.tuning.length === 0) {
    return { tuning: standard };
  }
  const pitches = track.tuning.flatMap((text) => parsePitch(text) ?? []);
  const first = pitches[0];
  const last = pitches[pitches.length - 1];
  if (pitches.length !== track.tuning.length || pitches.length > MAX_STRINGS || first === undefined || last === undefined) {
    return { tuning: standard, warning: `${name}: tuning ${track.tuning.join(' ')} could not be read; standard tuning used` };
  }
  return { tuning: first > last ? pitches : [...pitches].reverse() };
}

/** The written pitches of a part's notes that have one it can read. */
function writtenPitches(beats: readonly TranscribedBeat[]): readonly number[] {
  return beats.flatMap((beat) => (beat.rest === true ? [] : (beat.notes ?? [])).flatMap((note) => (note.pitch === undefined ? [] : (parsePitch(note.pitch) ?? []))));
}

/** The pitches a track's parts sound, from their written pitches; undefined when it has none. */
export function partPitchRange(measures: readonly TranscribedMeasure[], trackIndex: number, writtenAbove: number): PitchRange | undefined {
  const pitches = measures.flatMap((measure) => measure.parts.filter((part) => part.track === trackIndex).flatMap((part) => writtenPitches(part.beats)));
  // A reduce, not Math.min(...pitches): an answer may hold more notes than a call takes arguments.
  return pitches.reduce<PitchRange | undefined>((range, written) => {
    const pitch = written - writtenAbove;
    return { min: Math.min(range?.min ?? pitch, pitch), max: Math.max(range?.max ?? pitch, pitch) };
  }, undefined);
}

function holdsRange(tuning: readonly number[], range: PitchRange): boolean {
  return range.min >= Math.min(...tuning) && range.max <= Math.max(...tuning) + MAX_FRET;
}

const STANDARD_LOWEST = Math.min(...STANDARD_TUNING);
/** Pitches the standard tuning's six strings reach, open low E to the high E's last fret. */
const STANDARD_REACH = Math.max(...STANDARD_TUNING) - STANDARD_LOWEST + MAX_FRET;

/**
 * The strings a pitched part without tab (a voice, a keyboard, a violin …) goes on, string 1 first: Guitar Pro keeps
 * every note on a string and fret, so these strings only have to hold the part's notes, each at its pitch. The standard
 * guitar tuning when it holds them (most voices and melodies); else the same six strings moved so the part's range sits
 * in the middle of what they reach, room above and below for chords; else, for a part wider than that, Guitar Pro 5's
 * seven strings evenly spaced from its lowest note. Frets up to MAX_FRET. (Not the MIDI import's TuxGuitar tunings:
 * their spread tuning narrows to a semitone between strings for a wide range and leaves its top notes without a string.)
 */
export function pitchedPartTuning(range: PitchRange | undefined): readonly number[] {
  if (range === undefined || holdsRange(STANDARD_TUNING, range)) {
    return STANDARD_TUNING;
  }
  const width = range.max - range.min;
  if (width <= STANDARD_REACH) {
    const centered = range.min - Math.floor((STANDARD_REACH - width) / 2);
    const lowest = Math.min(Math.max(0, centered), MAX_MIDI_PITCH - (STANDARD_REACH - MAX_FRET));
    return STANDARD_TUNING.map((open) => open + lowest - STANDARD_LOWEST);
  }
  const spacing = Math.ceil((width - MAX_FRET) / (MAX_STRINGS - 1));
  return Array.from({ length: MAX_STRINGS }, (_, index) => range.min + (MAX_STRINGS - 1 - index) * spacing);
}
