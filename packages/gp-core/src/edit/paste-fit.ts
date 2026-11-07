// Copied beats fitted to the track they are pasted into (no TuxGuitar counterpart: TuxGuitar pastes frets as they
// were). Guitar Pro 8's guide (Copy, Paste and Cut): the single track copy "can be used across different tracks, even
// if the instruments are not compatible, for example, guitar and piano"; between percussion and a melodic instrument
// "only the rhythm represented by rests is retained". Here the notes go too, by MIDI number: a drum note's fret is its
// General MIDI key (TuxGuitar's convention), so a pitched note becomes the drum of its pitch and a drum the pitch of its
// key; between pitched tracks every note keeps its pitch (another tuning, capo or number of strings), as a retune does.
import type { Beat, Note, NoteEffect, Track } from '../model/song';
import type { BeatFragment, BeatFragmentItem } from './beat-fragment';
import { MAX_DRUM_KEY } from './edit-song';
import { retuneBeatRun } from './retune';
import { sortByString } from './song-paths';
import { neckFrets, placeNotes, stringsNearHand } from './string-placement';
import { isSameTuning, trackTuning } from './tuning-presets';

/** How a paste put the copied notes on its track. */
export type PasteMapping = 'asCopied' | 'byPitch' | 'pitchedToDrums' | 'drumsToPitched' | 'rhythmOnly';

/** The copied beats as the track takes them, and what could not stay as it sounded. */
export interface FittedFragment {
  readonly items: readonly BeatFragmentItem[];
  readonly mapping: PasteMapping;
  /** Notes moved by octaves: no free string of the track held their pitch on its neck. */
  readonly octaveShifted: number;
  /** Notes left out: their beat holds more notes than the track has strings, or their pitch is not known. */
  readonly leftOut: number;
}

const SEMITONES_PER_OCTAVE = 12;

/** The fret where the neck's first position stands: placing a drum's key, the hand is at the nut. */
const NUT_POSITION = 0;

function noteCount(items: readonly BeatFragmentItem[]): number {
  return items.reduce((count, item) => count + item.notes.length, 0);
}

/** A pitch brought into the drum keys 0…MAX_DRUM_KEY by octaves. */
function drumKey(pitch: number): number {
  let key = pitch;
  while (key > MAX_DRUM_KEY) {
    key -= SEMITONES_PER_OCTAVE;
  }
  while (key < 0) {
    key += SEMITONES_PER_OCTAVE;
  }
  return key;
}

/** The note's effects without those of pitch and fret position (bends, slides, harmonics, grace and trill frets …), which a drum has not. */
function drumSafeEffect(effect: NoteEffect): NoteEffect {
  const { bend, tremoloBar, harmonic, grace, trill, ...kept } = effect;
  return { ...kept, slides: [], vibrato: false, wideVibrato: false, hammer: false };
}

/** The items without their chord diagrams (they name a track's strings), with `notes` as each item's notes. */
function withNotes(items: readonly BeatFragmentItem[], notes: readonly (readonly Note[])[]): readonly BeatFragmentItem[] {
  return items.map((item, index) => {
    const { chord, ...rest } = item;
    return { ...rest, notes: notes[index] ?? [] };
  });
}

/** Ties only where the beat before has the same fret on the same string: a converted note continues nothing else. */
function settledTies(items: readonly BeatFragmentItem[]): readonly BeatFragmentItem[] {
  return items.map((item, index) => {
    const before = items[index - 1]?.notes ?? [];
    const isLoose = (note: Note): boolean => note.isTied && !before.some((other) => other.string === note.string && other.fret === note.fret);
    return item.notes.some(isLoose) ? { ...item, notes: item.notes.map((note) => (isLoose(note) ? { ...note, isTied: false } : note)) } : item;
  });
}

/** Notes on strings 1…`count` as they are; others onto the free strings in order (drums); the rest left out. */
function onFreeStrings(notes: readonly Note[], count: number): readonly Note[] {
  const kept = notes.filter((note) => note.string <= count);
  const taken = new Set(kept.map((note) => note.string));
  const free = Array.from({ length: count }, (_, i) => i + 1).filter((string) => !taken.has(string));
  const moved = notes.filter((note) => note.string > count).flatMap((note, i) => (free[i] === undefined ? [] : [{ ...note, string: free[i] }]));
  return sortByString([...kept, ...moved]);
}

function asCopied(items: readonly BeatFragmentItem[], count: number, movesDrums: boolean): FittedFragment {
  const fits = items.every((item) => item.notes.every((note) => note.string <= count));
  const onTrack = (notes: readonly Note[]): readonly Note[] => (movesDrums ? onFreeStrings(notes, count) : notes.filter((note) => note.string <= count));
  const fitted = fits ? items : items.map((item) => ({ ...item, notes: onTrack(item.notes) }));
  return { items: fitted, mapping: 'asCopied', octaveShifted: 0, leftOut: noteCount(items) - noteCount(fitted) };
}

function itemBeat(item: BeatFragmentItem, index: number): Beat {
  const { duration, notes, ...marks } = item;
  return { ...marks, start: index, voices: [{ duration, notes, isEmpty: false, direction: 'none' }] };
}

/** Pitched beats onto a pitched track, every note keeping its sounding pitch (`sounding`: the copied track's open strings with its capo). */
function byPitch(items: readonly BeatFragmentItem[], sounding: readonly number[], track: Track): FittedFragment {
  const from = sounding.map((pitch) => pitch - track.offset);
  const to = trackTuning(track);
  if (isSameTuning(from, to)) {
    return asCopied(items, to.length, false);
  }
  const retuned = retuneBeatRun(items.map(itemBeat), from, to, neckFrets(track.offset));
  const fitted = items.map((item, index): BeatFragmentItem => {
    const beat = retuned.beats[index];
    const { chord, ...rest } = item;
    return { ...rest, notes: beat?.voices[0]?.notes ?? [], ...(beat?.chord === undefined ? {} : { chord: beat.chord }) };
  });
  return { items: fitted, mapping: 'byPitch', octaveShifted: retuned.octaveShifted, leftOut: retuned.removed };
}

/** Pitched beats onto a drum track: each note the drum of its MIDI pitch (one per key), on the kit's strings in order. */
function pitchedOntoDrums(items: readonly BeatFragmentItem[], sounding: readonly number[], count: number): FittedFragment {
  const notes = items.map((item) => {
    const keyed = item.notes.flatMap((note) => {
      const open = sounding[note.string - 1];
      return open === undefined ? [] : [{ note, key: drumKey(open + note.fret) }];
    });
    const distinct = keyed.filter((each, index) => keyed.findIndex((other) => other.key === each.key) === index).slice(0, count);
    return distinct.map(({ note, key }, index): Note => ({ ...note, string: index + 1, fret: key, effect: drumSafeEffect(note.effect) }));
  });
  const fitted = settledTies(withNotes(items, notes));
  return { items: fitted, mapping: 'pitchedToDrums', octaveShifted: 0, leftOut: noteCount(items) - noteCount(fitted) };
}

/** One drum beat's notes onto a pitched track: each key a pitch, placed as notes played together are (octaves where none fits). */
function drumsOntoStrings(notes: readonly Note[], track: Track): { readonly notes: readonly Note[]; readonly octaveShifted: number } {
  const tuning = trackTuning(track);
  const neck = neckFrets(track.offset);
  const pitches = notes.map((note) => note.fret - track.offset);
  const preferred = stringsNearHand(pitches, tuning, NUT_POSITION, neck);
  const placements = placeNotes(pitches.map((pitch, i) => ({ pitch, preferredString: preferred[i] ?? 1 })), tuning, neck);
  const placed = notes.flatMap((note, i): Note[] => {
    const placement = placements[i];
    return placement === undefined ? [] : [{ ...note, string: placement.string, fret: placement.fret, effect: drumSafeEffect(note.effect) }];
  });
  return { notes: sortByString(placed), octaveShifted: placements.filter((placement) => placement !== undefined && placement.octaves !== 0).length };
}

function drumsOntoPitched(items: readonly BeatFragmentItem[], track: Track): FittedFragment {
  const placed = items.map((item) => drumsOntoStrings(item.notes, track));
  const fitted = settledTies(withNotes(items, placed.map((each) => each.notes)));
  const octaveShifted = placed.reduce((count, each) => count + each.octaveShifted, 0);
  return { items: fitted, mapping: 'drumsToPitched', octaveShifted, leftOut: noteCount(items) - noteCount(fitted) };
}

/** Beats whose pitches are not known (an earlier version's clipboard) onto a drum track: their rhythm, as rests. */
function rhythmOnly(items: readonly BeatFragmentItem[]): FittedFragment {
  return { items: withNotes(items, []), mapping: 'rhythmOnly', octaveShifted: 0, leftOut: noteCount(items) };
}

/**
 * The fragment's beats as `track` takes them: onto the same tuning and capo as they are; onto another pitched track
 * pitch for pitch (retune's placement: the nearest string, octaves when no string holds a pitch, notes beyond the
 * strings left out); between drums and a pitched track by MIDI number (a pitch becomes its drum key, a key its pitch);
 * drums onto drums with notes on strings the kit lacks moved onto free ones. Counts what moved by octaves or was left out.
 */
export function fitFragment(fragment: BeatFragment, track: Track): FittedFragment {
  const { items, tuning, capo = 0 } = fragment;
  const count = track.strings.length;
  if (fragment.isPercussion) {
    return track.isPercussion ? asCopied(items, count, true) : drumsOntoPitched(items, track);
  }
  if (tuning === undefined) {
    return track.isPercussion ? rhythmOnly(items) : asCopied(items, count, false);
  }
  const sounding = tuning.map((open) => open + capo);
  return track.isPercussion ? pitchedOntoDrums(items, sounding, count) : byPitch(items, sounding, track);
}
