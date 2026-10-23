// Transposition after TuxGuitar's TGTransposeAction and TGMeasureManager.transposeNotes (LGPL-2.1): every note of a
// selection, a track or the song moves by semitones — or, not in TuxGuitar, by steps of the key's scale — keeping its
// string while the new fret is on the neck. TuxGuitar removes a note no string can hold; here it stays and is counted.
import type { Beat, Chord, Measure, Song, Track } from '../model/song';
import type { BeatAddress } from './addresses';
import { type NoteNameMove, chromaticNameMove, diatonicNameMove, transposeChord } from './chord-transpose';
import { shiftDiatonic, transposeKeySignature } from './key-spelling';
import { hasSameItems, replaceAt } from './song-paths';
import { neckFrets } from './string-placement';
import { type BeatContext, type TieMemory, transposeBeatNotes } from './transpose-beat';
import { trackTuning } from './tuning-presets';

/** By semitones, or by steps of the scale of each measure's key signature (a raised degree stays raised). */
export type TranspositionMode = 'chromatic' | 'diatonic';

/** What moves: the whole song, one track, or the beats from one address to another (either order) in one voice of one track. */
export type TranspositionScope =
  | { readonly kind: 'song' }
  | { readonly kind: 'track'; readonly trackIndex: number }
  | { readonly kind: 'beats'; readonly from: BeatAddress; readonly to: BeatAddress };

export interface TranspositionOptions {
  readonly mode: TranspositionMode;
  /** Semitones (chromatic) or scale steps (diatonic); negative goes down. */
  readonly amount: number;
  /** Whole octaves added to `amount`: 12 semitones or 7 scale steps each. */
  readonly octaves?: number;
  /** Only chord names and diagrams move; the notes and key signatures stay (Guitar Pro's chord transposition). */
  readonly isChordsOnly?: boolean;
}

/** A transposed song and what could not move. */
export interface Transposition {
  readonly song: Song;
  /** Notes moved to their new pitch. */
  readonly moved: number;
  /** Notes left as they were: no free string holds the new pitch on the neck, or the note they are tied to stayed. */
  readonly unplaced: number;
  /** Chords whose name or diagram moved. */
  readonly chords: number;
  /** Chords left as they were: no octave of the shift fits the diagram's shape on the neck. */
  readonly unplacedChords: number;
}

type Counts = Omit<Transposition, 'song'>;

const NO_COUNTS: Counts = { moved: 0, unplaced: 0, chords: 0, unplacedChords: 0 };
const SEMITONES_PER_OCTAVE = 12;
const STEPS_PER_OCTAVE = 7;

/** One track's part of a transposition. */
interface TrackPlan {
  readonly mode: TranspositionMode;
  readonly total: number;
  readonly isChordsOnly: boolean;
  /** True when the notes of this voice of this beat move (before following ties). */
  readonly includes: (measureIndex: number, beatIndex: number, voiceIndex: number) => boolean;
  /** True when this beat's chord moves. */
  readonly includesBeat: (measureIndex: number, beatIndex: number) => boolean;
  readonly movesKey: boolean;
}

function addCounts(a: Counts, b: Counts): Counts {
  return { moved: a.moved + b.moved, unplaced: a.unplaced + b.unplaced, chords: a.chords + b.chords, unplacedChords: a.unplacedChords + b.unplacedChords };
}

function isPercussion(song: Song, track: Track): boolean {
  return track.isPercussion || song.channels.some((channel) => channel.id === track.channelId && channel.isPercussion);
}

function beatOrder(at: Pick<BeatAddress, 'measureIndex' | 'beatIndex'>): readonly [number, number] {
  return [at.measureIndex, at.beatIndex];
}

function isAtOrAfter(measureIndex: number, beatIndex: number, [m, b]: readonly [number, number]): boolean {
  return measureIndex > m || (measureIndex === m && beatIndex >= b);
}

/** The chord with its name and diagram moved; undefined when its diagram cannot move. */
function moveChord(chord: Chord, track: Track, plan: TrackPlan, keySignature: number, newKey: number): Chord | undefined {
  const neck = neckFrets(track.offset);
  if (plan.mode === 'chromatic') {
    return transposeChord(chord, chromaticNameMove(plan.total, newKey), plan.total, neck);
  }
  const pitches = chord.frets.flatMap((fret, i) => {
    const open = track.strings[i]?.tuning;
    return fret >= 0 && open !== undefined ? [open + track.offset + fret] : [];
  });
  const lowest = pitches.length === 0 ? undefined : Math.min(...pitches);
  const shift = lowest === undefined ? undefined : shiftDiatonic(lowest, keySignature, plan.total) - lowest;
  const names: NoteNameMove = diatonicNameMove(plan.total, keySignature);
  return transposeChord(chord, names, shift, neck);
}

interface MeasureResult {
  readonly measure: Measure;
  readonly counts: Counts;
  readonly memory: TieMemory;
}

interface BeatResult {
  readonly beat: Beat;
  readonly counts: Counts;
  readonly memory: TieMemory;
}

function transposeBeat(beat: Beat, beatContext: BeatContext, chordMove: (chord: Chord) => Chord | undefined, memory: TieMemory): BeatResult {
  const notes = transposeBeatNotes(beat, beatContext, memory);
  const chord = beat.chord === undefined ? undefined : chordMove(beat.chord);
  const isChordMoved = chord !== undefined && chord !== beat.chord;
  const counts = { moved: notes.moved, unplaced: notes.unplaced, chords: isChordMoved ? 1 : 0, unplacedChords: beat.chord !== undefined && chord === undefined ? 1 : 0 };
  return { beat: isChordMoved ? { ...notes.beat, chord } : notes.beat, counts, memory: notes.memory };
}

function transposeMeasure(track: Track, measureIndex: number, plan: TrackPlan, memory: TieMemory): MeasureResult {
  const measure = track.measures[measureIndex] as Measure;
  const key = measure.keySignature;
  const newKey = plan.movesKey ? transposeKeySignature(key, plan.total) : key;
  const movePitch = plan.mode === 'chromatic' ? (pitch: number) => pitch + plan.total : (pitch: number) => shiftDiatonic(pitch, key, plan.total);
  const base = { tuning: trackTuning(track), offset: track.offset, neck: neckFrets(track.offset), measureIndex, movePitch };
  let counts = NO_COUNTS;
  let current = memory;
  const beats = measure.beats.map((beat, beatIndex) => {
    const isMoving = (voiceIndex: number) => !plan.isChordsOnly && plan.includes(measureIndex, beatIndex, voiceIndex);
    const chordMove = (chord: Chord) => (plan.includesBeat(measureIndex, beatIndex) ? moveChord(chord, track, plan, key, newKey) : chord);
    const result = transposeBeat(beat, { ...base, isMoving }, chordMove, current);
    counts = addCounts(counts, result.counts);
    current = result.memory;
    return result.beat;
  });
  const isSame = newKey === key && hasSameItems(beats, measure.beats);
  return { measure: isSame ? measure : { ...measure, keySignature: newKey, beats }, counts, memory: current };
}

function transposeTrack(track: Track, plan: TrackPlan): { readonly track: Track; readonly counts: Counts } {
  let counts = NO_COUNTS;
  let memory: TieMemory = [];
  const measures = track.measures.map((_, measureIndex) => {
    const result = transposeMeasure(track, measureIndex, plan, memory);
    counts = addCounts(counts, result.counts);
    memory = result.memory;
    return result.measure;
  });
  return { track: hasSameItems(measures, track.measures) ? track : { ...track, measures }, counts };
}

/** Which tracks a scope touches and, per track, which beats and voices; undefined for a scope that names no track. */
function trackPlans(song: Song, scope: TranspositionScope, base: Pick<TrackPlan, 'mode' | 'total' | 'isChordsOnly'>): ReadonlyMap<number, TrackPlan> | undefined {
  const movesKey = base.mode === 'chromatic' && !base.isChordsOnly;
  const everything: TrackPlan = { ...base, includes: () => true, includesBeat: () => true, movesKey };
  if (scope.kind === 'song') {
    return new Map(song.tracks.map((_, trackIndex) => [trackIndex, everything]));
  }
  if (scope.kind === 'track') {
    return song.tracks[scope.trackIndex] === undefined ? undefined : new Map([[scope.trackIndex, everything]]);
  }
  const { from, to } = scope;
  if (from.trackIndex !== to.trackIndex || song.tracks[from.trackIndex] === undefined) {
    return undefined;
  }
  const [first, last] = isAtOrAfter(to.measureIndex, to.beatIndex, beatOrder(from)) ? [from, to] : [to, from];
  const includesBeat = (measureIndex: number, beatIndex: number) =>
    isAtOrAfter(measureIndex, beatIndex, beatOrder(first)) && !isAtOrAfter(measureIndex, beatIndex - 1, beatOrder(last));
  const includes = (measureIndex: number, beatIndex: number, voiceIndex: number) => voiceIndex === from.voiceIndex && includesBeat(measureIndex, beatIndex);
  return new Map([[from.trackIndex, { ...base, includes, includesBeat, movesKey: false }]]);
}

function totalOf(options: TranspositionOptions): number {
  const octaves = options.octaves ?? 0;
  if (!Number.isInteger(options.amount) || !Number.isInteger(octaves)) {
    return 0;
  }
  return options.amount + octaves * (options.mode === 'chromatic' ? SEMITONES_PER_OCTAVE : STEPS_PER_OCTAVE);
}

/**
 * New song with the notes of `scope` transposed: chromatically by semitones, or diatonically by steps of each measure's
 * key (major and its relative minor share one scale; altered notes keep their alteration). On a fretted track a note
 * keeps its string while the new fret is on the neck (frets 0…NECK_FRETS above the capo), else it goes to the nearest
 * string that holds it; one no free string holds stays as it was and is counted (`unplaced`). A tied note follows the
 * note it continues, past the scope too; a tied note whose note is not transposed starts afresh. Grace, trill and
 * tapped-harmonic frets follow their note. Chord names and diagrams move with the notes (or alone, `isChordsOnly`).
 * A chromatic transposition of the song or a track moves the key signatures too. Drum tracks never move. Same song
 * (and zero counts) for no amount, an amount that is not whole, or a scope that names no track (a selection across
 * tracks).
 */
export function transpose(song: Song, scope: TranspositionScope, options: TranspositionOptions): Transposition {
  const total = totalOf(options);
  const plans = total === 0 ? undefined : trackPlans(song, scope, { mode: options.mode, total, isChordsOnly: options.isChordsOnly === true });
  if (plans === undefined) {
    return { song, ...NO_COUNTS };
  }
  let counts = NO_COUNTS;
  let tracks = song.tracks;
  for (const [trackIndex, plan] of plans) {
    const track = song.tracks[trackIndex];
    if (track !== undefined && !isPercussion(song, track)) {
      const result = transposeTrack(track, plan);
      counts = addCounts(counts, result.counts);
      tracks = replaceAt(tracks, trackIndex, result.track);
    }
  }
  return { song: hasSameItems(tracks, song.tracks) ? song : { ...song, tracks }, ...counts };
}
