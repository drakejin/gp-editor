import type { Beat, Channel, Song, Track } from '../model/song';
import { type NoteToPlace, homeStrings, neckFrets, placeNotes } from './string-placement';
import {
  type Instrument,
  type NeckInstrument,
  type TuningPreset,
  findTuningPreset,
  keepsStandardShapes,
  resolveTrackInstrument,
  standardTuningFor,
  trackTuning,
  tuningPresetsFor,
} from './tuning-presets';

/** Lowest and highest sounding MIDI pitch of a track (open string + fret + capo). */
export interface PitchRange {
  readonly lowest: number;
  readonly highest: number;
}

export interface PresetFit {
  readonly preset: TuningPreset;
  /** Notes this tuning cannot hold on the neck; 0 = it plays the whole track. */
  readonly unplayableNotes: number;
}

/** What the neck settings show for a track: its instrument, how each preset fits, and which to pick. */
export interface TuningAdvice {
  readonly instrument: Instrument;
  /** The preset the track is tuned to; undefined for a custom tuning or string count. */
  readonly current?: TuningPreset;
  /** Notes the track's own tuning cannot hold on the neck (e.g. past fret 24). */
  readonly currentUnplayableNotes: number;
  /** The instrument's presets in menu order; empty for percussion. */
  readonly presets: readonly PresetFit[];
  /**
   * Presets that play every note, best first: those that keep standard chord shapes (standard, lowered, drop) by fewest
   * semitones changed from standard — so standard leads when it fits — then open tunings the same way.
   */
  readonly suggested: readonly TuningPreset[];
  /** When no preset plays every note: the one that moves the fewest notes. */
  readonly closest?: PresetFit;
  /** Undefined when the track has no notes. */
  readonly pitchRange?: PitchRange;
  /** True when a pitched track is not on one of its instrument's presets, or its tuning cannot hold every note. */
  readonly needsTuning: boolean;
}

/** The notes of a beat, all voices, as pitches counted from the capo. A note on a string the track lacks gets no pitch. */
function beatNotesToPlace(beat: Beat, from: readonly number[], homes: readonly number[]): readonly (NoteToPlace | undefined)[] {
  return beat.voices.flatMap((voice) =>
    voice.notes.map((note) => {
      const open = from[note.string - 1];
      return open === undefined ? undefined : { pitch: open + note.fret, preferredString: homes[note.string - 1] ?? 1 };
    }),
  );
}

/** True when each note fits its preferred string on the neck, all on different strings: the common case, no search needed. */
function fitsPreferredStrings(notes: readonly NoteToPlace[], to: readonly number[], neck: number): boolean {
  const taken = new Set<number>();
  for (const note of notes) {
    const fret = note.pitch - (to[note.preferredString - 1] ?? Number.POSITIVE_INFINITY);
    if (fret < 0 || fret > neck || taken.has(note.preferredString)) {
      return false;
    }
    taken.add(note.preferredString);
  }
  return true;
}

function unplayableInBeat(beat: Beat, from: readonly number[], to: readonly number[], homes: readonly number[], neck: number): number {
  const notes = beatNotesToPlace(beat, from, homes);
  const known = notes.filter((note): note is NoteToPlace => note !== undefined);
  if (fitsPreferredStrings(known, to, neck)) {
    return notes.length - known.length;
  }
  const placed = placeNotes(known, to, neck);
  return notes.length - known.length + placed.filter((placement) => placement === undefined || placement.octaves !== 0).length;
}

/** Notes of the track that `tuning` cannot hold on the neck (frets 0–24 from the capo), each note of a beat on its own string. */
export function countUnplayableNotes(track: Track, tuning: readonly number[]): number {
  const from = trackTuning(track);
  const homes = homeStrings(from, tuning);
  const neck = neckFrets(track.offset);
  return track.measures.reduce(
    (count, measure) => count + measure.beats.reduce((sum, beat) => sum + unplayableInBeat(beat, from, tuning, homes, neck), 0),
    0,
  );
}

/** True when every beat of the track can be played on `tuning` within the neck's frets, one string per note. */
export function canPlayOnTuning(track: Track, tuning: readonly number[]): boolean {
  return countUnplayableNotes(track, tuning) === 0;
}

/** Lowest and highest sounding pitch of the track; undefined without notes. */
export function trackPitchRange(track: Track): PitchRange | undefined {
  const pitches = track.measures.flatMap((measure) =>
    measure.beats.flatMap((beat) =>
      beat.voices.flatMap((voice) =>
        voice.notes.flatMap((note) => {
          const open = track.strings[note.string - 1]?.tuning;
          return open === undefined ? [] : [open + note.fret + track.offset];
        }),
      ),
    ),
  );
  return pitches.length === 0 ? undefined : { lowest: Math.min(...pitches), highest: Math.max(...pitches) };
}

function semitonesFromStandard(preset: TuningPreset): number {
  const standard = standardTuningFor(preset.instrument);
  return preset.tuning.reduce((sum, open, i) => sum + Math.abs(open - (standard[i] ?? open)), 0);
}

/** Presets in suggestion order: standard chord shapes first, then by fewest semitones changed from standard. */
function rankPresets(fits: readonly PresetFit[]): readonly PresetFit[] {
  const rank = (fit: PresetFit): readonly [number, number] => [keepsStandardShapes(fit.preset) ? 0 : 1, semitonesFromStandard(fit.preset)];
  return [...fits].sort((a, b) => {
    const [shapeA, semitonesA] = rank(a);
    const [shapeB, semitonesB] = rank(b);
    return shapeA - shapeB || semitonesA - semitonesB;
  });
}

function adviseNeck(track: Track, instrument: NeckInstrument): Omit<TuningAdvice, 'instrument' | 'pitchRange'> {
  const tuning = trackTuning(track);
  const current = findTuningPreset(instrument, tuning);
  const currentUnplayableNotes = countUnplayableNotes(track, tuning);
  const presets = tuningPresetsFor(instrument).map((preset): PresetFit => ({ preset, unplayableNotes: countUnplayableNotes(track, preset.tuning) }));
  const ranked = rankPresets(presets);
  const suggested = ranked.filter((fit) => fit.unplayableNotes === 0).map((fit) => fit.preset);
  const closest = suggested.length > 0 ? undefined : ranked.reduce<PresetFit | undefined>((best, fit) => (best === undefined || fit.unplayableNotes < best.unplayableNotes ? fit : best), undefined);
  const needsTuning = current === undefined || currentUnplayableNotes > 0;
  return { current, currentUnplayableNotes, presets, suggested, closest, needsTuning };
}

/**
 * How the track's tuning fits the neck, and which presets of its instrument play every note (see TuningAdvice).
 * Undefined for a missing track; a percussion track gets no presets.
 */
export function suggestTunings(song: Song, trackIndex: number): TuningAdvice | undefined {
  const track = song.tracks[trackIndex];
  return track === undefined ? undefined : suggestTrackTunings(track, song.channels);
}

/** suggestTunings from the track and the song's channels alone, so a caller can recompute it only when they change. */
export function suggestTrackTunings(track: Track, channels: readonly Channel[]): TuningAdvice {
  const instrument = resolveTrackInstrument(track, channels);
  if (instrument === 'percussion') {
    return { instrument, currentUnplayableNotes: 0, presets: [], suggested: [], needsTuning: false };
  }
  return { instrument, pitchRange: trackPitchRange(track), ...adviseNeck(track, instrument) };
}
