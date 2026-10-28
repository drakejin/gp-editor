// Port of TuxGuitar MidiSongReader.TrackTuningHelper and TGTrackManager's allocate*NotesToStrings / fixInvalidTiedNote (LGPL-2.1): notes onto strings.
import { MAX_FRET } from '../../edit/edit-song';
import { placeNotes } from '../../edit/string-placement';
import { TUNING_PRESETS } from '../../edit/tuning-presets';
import { EMPTY_NOTE_EFFECT, STANDARD_BASS_TUNING, STANDARD_TUNING } from '../../model/defaults';
import type { Note } from '../../model/song';
import type { RawNote } from './midi-quantize';
import type { PitchRange } from './midi-track-parser';

/** TGTrack.DEFAULT_MAX_FRET: the frets the import places notes on. */
const MAX_IMPORT_FRET = MAX_FRET;
/** TGSongManager.createPercussionStrings(6): six strings tuned to 0, the fret being the drum's MIDI key. */
export const PERCUSSION_STRING_COUNT = 6;
/** TrackTuningHelper: a spread tuning leaves this many frets of room at the top. */
const SPREAD_TUNING_FRET_MARGIN = 4;
/** TrackTuningHelper: strings further apart than this get a seventh string. */
const SPREAD_TUNING_MAX_SPACING = 5;

function presetTuning(id: string): readonly number[] {
  return TUNING_PRESETS.find((preset) => preset.id === id)?.tuning ?? STANDARD_TUNING;
}

/** tunings.xml's priority tunings, in order: standard and drop D guitar, 7-string guitar, 4- and 5-string bass. */
const PRIORITY_TUNINGS: readonly (readonly number[])[] = [
  STANDARD_TUNING,
  presetTuning('guitar-drop-d'),
  [64, 59, 55, 50, 45, 40, 35],
  STANDARD_BASS_TUNING,
  [43, 38, 33, 28, 23],
];

/** TGTuning.isWithinRange: the lowest note on the lowest string, the highest within MAX_IMPORT_FRET of the highest string. */
function holdsRange(tuning: readonly number[], range: PitchRange): boolean {
  return tuning.length > 0 && range.min >= Math.min(...tuning) && range.max - MAX_IMPORT_FRET <= Math.max(...tuning);
}

/**
 * TrackTuningHelper.getStrings' last resort: 6 (or 7 when they would be far apart) evenly spaced strings from the
 * lowest note. TuxGuitar's spacing can be 0 or less for a narrow range of very low notes; it is kept at 1 or more.
 */
function spreadTuning(range: PitchRange): readonly number[] {
  const span = range.max - (MAX_IMPORT_FRET - SPREAD_TUNING_FRET_MARGIN) - range.min;
  let count = 6;
  let spacing = Math.trunc(span / count);
  if (spacing > SPREAD_TUNING_MAX_SPACING) {
    count = 7;
    spacing = Math.trunc(span / count);
  }
  const step = Math.max(1, spacing);
  return Array.from({ length: count }, (_, index) => range.min + (count - 1 - index) * step);
}

/**
 * The tuning for a pitched track: a standard 6-string guitar, or a 4-string bass for a bass program, when it holds the
 * track's notes; else TrackTuningHelper.getStrings (the first priority tuning that holds them, else a spread tuning).
 * A track without notes gets the standard tuning.
 */
export function resolveImportTuning(range: PitchRange | undefined, isBassProgram: boolean): readonly number[] {
  const standard = isBassProgram ? STANDARD_BASS_TUNING : STANDARD_TUNING;
  if (range === undefined || holdsRange(standard, range)) {
    return standard;
  }
  return PRIORITY_TUNINGS.find((tuning) => holdsRange(tuning, range)) ?? spreadTuning(range);
}

/** allocateNotesToLowestFret's choice for one note: the string where its fret is lowest. */
function lowestFretString(pitch: number, tuning: readonly number[]): number {
  let best = 1;
  let bestFret = Number.POSITIVE_INFINITY;
  tuning.forEach((open, index) => {
    const fret = pitch - open;
    if (fret >= 0 && fret < bestFret) {
      best = index + 1;
      bestFret = fret;
    }
  });
  return best;
}

function newNote(raw: RawNote, string: number, fret: number, previous: readonly Note[]): Note {
  // fixInvalidTiedNote: a tie needs the same string and fret in the beat before, else it is removed
  const isTied = raw.isTied && previous.some((note) => note.string === string && note.fret === fret);
  return { fret, string, velocity: raw.velocity, isTied, effect: EMPTY_NOTE_EFFECT };
}

/**
 * allocateNotesToStrings for one beat of a pitched track, with the repo's string placement: tied notes keep the
 * string of the note they continue, the others (highest first) take the string of their lowest fret, and as many
 * notes as possible fit. A note left without a string at its pitch is dropped (removeUnallocatedNotes).
 */
export function placePitchedNotes(notes: readonly RawNote[], tuning: readonly number[], previous: readonly Note[]): Note[] {
  const pitchOf = (note: Note): number => (tuning[note.string - 1] ?? 0) + note.fret;
  const ordered = [...notes].sort((a, b) => Number(b.isTied) - Number(a.isTied) || b.pitch - a.pitch);
  const toPlace = ordered.map((raw) => {
    const continued = raw.isTied ? previous.find((note) => pitchOf(note) === raw.pitch) : undefined;
    return { pitch: raw.pitch, preferredString: continued?.string ?? lowestFretString(raw.pitch, tuning) };
  });
  const placements = placeNotes(toPlace, tuning, MAX_IMPORT_FRET);
  return ordered
    .flatMap((raw, index) => {
      const placement = placements[index];
      return placement === undefined || placement.octaves !== 0 ? [] : [newNote(raw, placement.string, placement.fret, previous)];
    })
    .sort((a, b) => a.string - b.string);
}

/** TGDrumMap's preferred string per General MIDI drum key (kicks low, cymbals high); 1 for the others. */
const DRUM_STRINGS: ReadonlyMap<number, number> = new Map([
  [35, 6], [36, 6], [37, 4], [38, 4], [40, 4], [42, 2], [46, 2], [44, 2], [49, 1], [57, 1], [55, 1],
  [52, 1], [51, 2], [59, 2], [53, 2], [41, 5], [43, 5], [45, 5], [47, 4], [48, 3], [50, 3],
]);
const DEFAULT_DRUM_STRING = 1;

/** The free string nearest `preferred` (the last of equally near ones, as TuxGuitar's `<=`). */
function nearestFreeString(free: readonly number[], preferred: number): number | undefined {
  let best: number | undefined;
  let bestDistance = -1;
  for (const string of free) {
    const distance = Math.abs(string - preferred);
    if (bestDistance < 0 || distance <= bestDistance) {
      best = string;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * allocatePercussionNotesToStrings' strings for one beat's drum keys, in the keys' order: each drum on its preferred
 * string, else the nearest free one; undefined for a drum left without one (more drums than strings).
 */
export function percussionStrings(keys: readonly number[]): readonly (number | undefined)[] {
  const preferredOf = (key: number): number => DRUM_STRINGS.get(key) ?? DEFAULT_DRUM_STRING;
  const order = keys.map((_, index) => index).sort((a, b) => preferredOf(keys[a] ?? 0) - preferredOf(keys[b] ?? 0));
  const strings: (number | undefined)[] = keys.map(() => undefined);
  let free: readonly number[] = Array.from({ length: PERCUSSION_STRING_COUNT }, (_, index) => index + 1);
  for (const index of order) {
    const preferred = preferredOf(keys[index] ?? 0);
    const string = free.includes(preferred) ? preferred : nearestFreeString(free, preferred);
    if (string !== undefined) {
      free = free.filter((other) => other !== string);
      strings[index] = string;
    }
  }
  return strings;
}

/** allocatePercussionNotesToStrings for one beat: each drum on its preferred string, else the nearest free one, else dropped. */
export function placePercussionNotes(notes: readonly RawNote[], previous: readonly Note[]): Note[] {
  const strings = percussionStrings(notes.map((raw) => raw.pitch));
  return notes
    .flatMap((raw, index) => {
      const string = strings[index];
      return string === undefined ? [] : [newNote(raw, string, raw.pitch, previous)];
    })
    .sort((a, b) => a.string - b.string);
}
