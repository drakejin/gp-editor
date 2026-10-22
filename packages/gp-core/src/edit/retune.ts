// Retuning after TuxGuitar's TGChangeTrackTuningAction and TGTrackManager.allocateNotesToStrings (LGPL-2.1). Unlike
// TuxGuitar, which drops the notes it cannot place, every note keeps its pitch or moves by octaves and is counted.
import type { Beat, Chord, Note, NoteEffect, Song, Track, Voice } from '../model/song';
import { MAX_FRET } from './edit-song';
import { replaceAt, sortByString } from './song-paths';
import { type FretRange, type NoteToPlace, type StringPlacement, fretRange, homeStrings, placeNotes } from './string-placement';
import { isSameTuning, trackTuning } from './tuning-presets';

const SEMITONES_PER_OCTAVE = 12;
const MAX_MIDI_PITCH = 127;

/** A retuned song and what the new tuning could not keep. */
export interface TuningChange {
  readonly song: Song;
  /** Notes moved by octaves: no free string of the new tuning held their pitch (tied notes follow the note they continue). */
  readonly octaveShifted: number;
  /** Notes left out: their beat holds more notes than the new tuning has strings. */
  readonly removed: number;
}

/** Where a note of the previous event went: its new string and how many semitones its pitch moved. */
interface MovedNote {
  readonly string: number;
  readonly shift: number;
}

/** The last event of one voice: its measure and where its notes went, by old string. */
interface VoiceMemory {
  readonly measureIndex: number;
  readonly moved: ReadonlyMap<number, MovedNote>;
}

interface RetuneContext {
  readonly from: readonly number[];
  readonly to: readonly number[];
  readonly homes: readonly number[];
  readonly range: FretRange;
}

interface BeatEntry {
  readonly voiceIndex: number;
  readonly note: Note;
  /** The note this tied note continues, when it was found in the previous event. */
  readonly tie?: MovedNote;
  readonly toPlace: NoteToPlace;
}

interface PlacedEntry {
  readonly entry: BeatEntry;
  readonly placement: StringPlacement;
}

interface BeatRetune {
  readonly beat: Beat;
  readonly octaveShifted: number;
  readonly removed: number;
  readonly memory: readonly (VoiceMemory | undefined)[];
}

function isValidTuning(tuning: readonly number[]): boolean {
  return tuning.length > 0 && tuning.every((open) => Number.isInteger(open) && open >= 0 && open <= MAX_MIDI_PITCH);
}

/** The previous note on `string` of a tied note's voice: in the last event of this measure or of the one before. */
function tieFor(memory: VoiceMemory | undefined, measureIndex: number, string: number): MovedNote | undefined {
  return memory !== undefined && memory.measureIndex >= measureIndex - 1 ? memory.moved.get(string) : undefined;
}

/** Every note of a beat (all voices) to place; tied notes first so they keep the string of the note they continue. */
function beatEntries(beat: Beat, measureIndex: number, context: RetuneContext, memory: readonly (VoiceMemory | undefined)[]): readonly BeatEntry[] {
  const entries = beat.voices.flatMap((voice, voiceIndex) =>
    voice.notes.flatMap((note): BeatEntry[] => {
      const open = context.from[note.string - 1];
      if (open === undefined) {
        return [];
      }
      const tie = note.isTied ? tieFor(memory[voiceIndex], measureIndex, note.string) : undefined;
      const preferredString = tie?.string ?? context.homes[note.string - 1] ?? 1;
      return [{ voiceIndex, note, tie, toPlace: { pitch: open + note.fret + (tie?.shift ?? 0), preferredString } }];
    }),
  );
  return [...entries.filter((entry) => entry.tie !== undefined), ...entries.filter((entry) => entry.tie === undefined)];
}

function clampFret(fret: number): number {
  return Math.min(MAX_FRET, Math.max(0, fret));
}

/** Grace, trill and tapped-harmonic frets sit on the note's string, so they move with its fret. */
function shiftEffectFrets(effect: NoteEffect, delta: number): NoteEffect {
  if (delta === 0) {
    return effect;
  }
  const { grace, trill, harmonic } = effect;
  return {
    ...effect,
    ...(grace === undefined ? {} : { grace: { ...grace, fret: clampFret(grace.fret + delta) } }),
    ...(trill === undefined ? {} : { trill: { ...trill, fret: clampFret(trill.fret + delta) } }),
    ...(harmonic?.type === 'tapped' ? { harmonic: { ...harmonic, data: harmonic.data + delta } } : {}),
  };
}

/** Semitones a placed note's pitch moved: the shift of the note it continues plus its own octaves. */
function pitchShift({ entry, placement }: PlacedEntry): number {
  return (entry.tie?.shift ?? 0) + placement.octaves * SEMITONES_PER_OCTAVE;
}

/** The note on its new string. A tie forced off the string of the note it continues is undone (ties stay on one string). */
function refret({ entry, placement }: PlacedEntry): Note {
  const { note, tie } = entry;
  const isTied = note.isTied && (tie === undefined || tie.string === placement.string);
  return { ...note, string: placement.string, fret: placement.fret, isTied, effect: shiftEffectFrets(note.effect, placement.fret - note.fret) };
}

function rememberVoices(beat: Beat, placed: readonly PlacedEntry[], measureIndex: number, memory: readonly (VoiceMemory | undefined)[]): readonly (VoiceMemory | undefined)[] {
  return beat.voices.map((voice, voiceIndex) => {
    if (voice.isEmpty) {
      return memory[voiceIndex];
    }
    const inVoice = placed.filter(({ entry }) => entry.voiceIndex === voiceIndex);
    const moved = new Map(inVoice.map((item): [number, MovedNote] => [item.entry.note.string, { string: item.placement.string, shift: pitchShift(item) }]));
    return { measureIndex, moved };
  });
}

/** A chord diagram re-fretted on the new strings; a string it cannot keep at the same pitch is left unplayed. */
function retuneChord(chord: Chord, context: RetuneContext): Chord {
  const fretted = chord.frets.flatMap((fret, i): NoteToPlace[] => {
    const open = context.from[i];
    return fret >= 0 && open !== undefined ? [{ pitch: open + fret, preferredString: context.homes[i] ?? 1 }] : [];
  });
  const placements = placeNotes(fretted, context.to, context.range);
  const frets = context.to.map((_, i) => placements.find((placement) => placement?.string === i + 1 && placement.octaves === 0)?.fret ?? -1);
  const lowestFretted = Math.min(...frets.filter((fret) => fret > 0));
  return { ...chord, frets, firstFret: lowestFretted < chord.firstFret ? lowestFretted : chord.firstFret };
}

function retuneBeat(beat: Beat, measureIndex: number, context: RetuneContext, memory: readonly (VoiceMemory | undefined)[]): BeatRetune {
  const entries = beatEntries(beat, measureIndex, context, memory);
  const placements = placeNotes(entries.map((entry) => entry.toPlace), context.to, context.range);
  const placed = entries.flatMap((entry, i): PlacedEntry[] => {
    const placement = placements[i];
    return placement === undefined ? [] : [{ entry, placement }];
  });
  const voices = beat.voices.map((voice, voiceIndex): Voice => ({
    ...voice,
    notes: sortByString(placed.filter(({ entry }) => entry.voiceIndex === voiceIndex).map(refret)),
  }));
  const noteCount = beat.voices.reduce((count, voice) => count + voice.notes.length, 0);
  const retuned: Beat = { ...beat, voices, ...(beat.chord === undefined ? {} : { chord: retuneChord(beat.chord, context) }) };
  return {
    beat: retuned,
    octaveShifted: placed.filter((item) => pitchShift(item) !== 0).length,
    removed: noteCount - placed.length,
    memory: rememberVoices(beat, placed, measureIndex, memory),
  };
}

/** Every beat in order, so a tied note can follow the note it continues, across bar lines. */
function retuneMeasures(track: Track, context: RetuneContext): Omit<TuningChange, 'song'> & { readonly measures: Track['measures'] } {
  let memory: readonly (VoiceMemory | undefined)[] = [];
  let octaveShifted = 0;
  let removed = 0;
  const measures = track.measures.map((measure, measureIndex) => ({
    ...measure,
    beats: measure.beats.map((beat) => {
      const result = retuneBeat(beat, measureIndex, context, memory);
      memory = result.memory;
      octaveShifted += result.octaveShifted;
      removed += result.removed;
      return result.beat;
    }),
  }));
  return { measures, octaveShifted, removed };
}

/**
 * New song with the track on `tuning` (open-string MIDI pitches, string 1 first; the string count may change) and every
 * note re-placed so it sounds the same: on the same string when the new fret is on the neck (with different string
 * counts: the string of closest open pitch), else the nearest free string, as many notes on the 24-fret neck as fit;
 * a tied note stays on the string of the note it continues. A note no free string holds moves by octaves; a note
 * without any free string is left out — both are counted. Grace, trill and chord-diagram frets follow. The capo is kept.
 * Same song (and zero counts) for the same tuning, a percussion track, a missing track or a tuning that is not 1+
 * MIDI pitches.
 */
export function setTrackTuning(song: Song, trackIndex: number, tuning: readonly number[]): TuningChange {
  const track = song.tracks[trackIndex];
  if (track === undefined || track.isPercussion || !isValidTuning(tuning) || isSameTuning(trackTuning(track), tuning)) {
    return { song, octaveShifted: 0, removed: 0 };
  }
  const from = trackTuning(track);
  const context: RetuneContext = { from, to: tuning, homes: homeStrings(from, tuning), range: fretRange(track.offset) };
  const { measures, octaveShifted, removed } = retuneMeasures(track, context);
  const strings = tuning.map((open, i) => ({ number: i + 1, tuning: open }));
  return { song: { ...song, tracks: replaceAt(song.tracks, trackIndex, { ...track, strings, measures }) }, octaveShifted, removed };
}
