// The GP3–GP5 readers' tie resolution (TuxGuitar GTPInputStream#getTiedNoteValue, LGPL-2.1), replayed by the writers.
import { findTiedFret, resolveFret } from '../formats/gtp/shared';
import { durationTicks, EMPTY_VOICE, measureTicks, NO_STROKE } from '../model/defaults';
import { type Beat, type Measure, type Note, QUARTER_TIME, type Song, type Track, type Voice } from '../model/song';
import { clampFret, writableNotes, writableStrings } from './gtp-song';

/** One voice of one beat as the file holds it, in the order the reader reads it. */
export interface VoicePlacement {
  readonly voiceIndex: number;
  /** The voice written (its notes are filtered by writableNotes, its duration is `duration`). */
  readonly voice: Voice;
  /** The duration written. */
  readonly duration: Voice['duration'];
}

/** The voices of a measure in reading order (GP5: voice 1, then voice 2; GP3/GP4: one voice). */
export type ReadOrder = (measure: Measure, measureIndex: number) => readonly VoicePlacement[];

/** Start of every measure as the readers compute it (measure 1 at QUARTER_TIME). */
function measureStarts(song: Song): readonly number[] {
  let start = QUARTER_TIME;
  return song.measureHeaders.map((header) => {
    const current = start;
    start += measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
    return current;
  });
}

/** The readers' placeVoice: the beat at the same start takes the voice, else a new beat is appended. */
function placeVoice(beats: readonly Beat[], start: number, voiceIndex: number, voice: Voice): readonly Beat[] {
  const index = beats.findIndex((beat) => beat.start === start);
  const base = beats[index] ?? { start, voices: [EMPTY_VOICE, EMPTY_VOICE], stroke: NO_STROKE, pickStroke: 'none' };
  const beat: Beat = { ...base, voices: base.voices.map((current, i) => (i === voiceIndex ? voice : current)) };
  return index >= 0 ? beats.map((current, i) => (i === index ? beat : current)) : [...beats, beat];
}

interface TieReplay {
  /** Measures of the track read back so far. */
  readonly previous: readonly Measure[];
  readonly kept: Set<Note>;
  readonly stringCount: number;
}

/** The written notes of a voice; tied ones the reader resolves to their own fret go into `kept`. */
function readBackNotes(voice: Voice, placed: readonly Beat[], replay: TieReplay): readonly Note[] {
  const notes = voice.isEmpty ? [] : writableNotes(voice, replay.stringCount);
  return notes.map((note) => {
    const fret = clampFret(note.fret);
    if (note.isTied && resolveFret(fret, true, () => findTiedFret(replay.previous, placed, note.string)) === fret) {
      replay.kept.add(note);
    }
    return { ...note, fret };
  });
}

/** Reads one measure back as the reader would: every voice laid out from the measure start. */
function replayMeasure(measure: Measure, start: number, placements: readonly VoicePlacement[], replay: TieReplay): Measure {
  let beats: readonly Beat[] = [];
  const cursors = new Map<number, number>();
  for (const { voiceIndex, voice, duration } of placements) {
    const cursor = cursors.get(voiceIndex) ?? start;
    beats = placeVoice(beats, cursor, voiceIndex, { ...voice, duration, notes: readBackNotes(voice, beats, replay) });
    cursors.set(voiceIndex, cursor + (voice.isEmpty ? 0 : durationTicks(duration)));
  }
  return { ...measure, beats: [...beats].sort((a, b) => a.start - b.start) };
}

/**
 * The tied notes of a track the reader gives back with their own fret. GP3–GP5 files hold no fret for
 * a tied note: the reader repeats the latest note on that string (TuxGuitar's search, which in GP5 looks
 * at the whole first voice before the second). A tie that would change the fret is written as a plain
 * note instead, keeping the pitch.
 */
export function resolveKeptTies(song: Song, track: Track, readOrder: ReadOrder): ReadonlySet<Note> {
  const starts = measureStarts(song);
  const previous: Measure[] = [];
  const replay: TieReplay = { previous, kept: new Set<Note>(), stringCount: writableStrings(track).length };
  track.measures.forEach((measure, index) => {
    previous.push(replayMeasure(measure, starts[index] ?? QUARTER_TIME, readOrder(measure, index), replay));
  });
  return replay.kept;
}
