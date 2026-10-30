import { durationTicks, headerTicks } from '../model/defaults';
import type { Song } from '../model/song';
import { toDuration } from '../transcription/durations';
import { isFrettedInstrument } from '../transcription/instruments';
import type { TranscribedBeat, TranscribedMeasure, TranscribedNote, TranscribedPart } from '../transcription/types';
import { countOf } from '../transcription/wording';
import { trackInstrumentOf } from './track-instrument';

/** One track's composed bars, fitted to the song's bars, and what fitting left out. */
export interface FittedBars {
  readonly bars: readonly TranscribedMeasure[];
  readonly warnings: readonly string[];
}

interface FittedPart {
  readonly part: TranscribedPart;
  readonly beatsLeftOut: number;
  readonly notesLeftOut: number;
}

/** A tab note on a string past the track's last one: the builder would move it onto that last string. */
function isOffNeck(note: TranscribedNote, stringCount: number): boolean {
  return note.string !== undefined && note.fret !== undefined && note.string > stringCount;
}

/** The beats that end within the bar, each without notes on strings the track lacks (`stringCount`, a fretted track). */
function fitPart(part: TranscribedPart, barTicks: number, stringCount: number | undefined): FittedPart {
  let end = 0;
  const inBar = part.beats.filter((beat) => {
    end += durationTicks(toDuration(beat));
    return end <= barTicks;
  });
  let notesLeftOut = 0;
  const beats = inBar.map((beat): TranscribedBeat => {
    const notes = beat.notes ?? [];
    const kept = stringCount === undefined ? notes : notes.filter((note) => !isOffNeck(note, stringCount));
    notesLeftOut += notes.length - kept.length;
    return kept.length === notes.length ? beat : { ...beat, notes: kept };
  });
  return { part: { ...part, beats }, beatsLeftOut: part.beats.length - inBar.length, notesLeftOut };
}

/**
 * A track's parts in the composed bars (from `startIndex`, whose headers the song has) fitted to its bars: beats running
 * past a bar's end left out — the existing bars after them stay as they are — and, on a fretted track, notes on strings
 * it does not have; a warning per bar says what was left out. Other tracks' parts are returned as they were.
 */
export function fitTrackParts(song: Song, trackIndex: number, bars: readonly TranscribedMeasure[], startIndex: number): FittedBars {
  const track = song.tracks[trackIndex];
  const instrument = trackInstrumentOf(song, trackIndex);
  const stringCount = instrument !== undefined && isFrettedInstrument(instrument) ? track?.strings.length : undefined;
  const name = track?.name.trim() || `Track ${trackIndex + 1}`;
  const warnings: string[] = [];
  const fitted = bars.map((bar, offset) => {
    const header = song.measureHeaders[startIndex + offset];
    if (header === undefined) {
      return bar;
    }
    const parts = bar.parts.map((part) => (part.track === trackIndex ? fitPart(part, headerTicks(header), stringCount) : { part, beatsLeftOut: 0, notesLeftOut: 0 }));
    const beatsLeftOut = parts.reduce((sum, item) => sum + item.beatsLeftOut, 0);
    const notesLeftOut = parts.reduce((sum, item) => sum + item.notesLeftOut, 0);
    const where = `Bar ${header.number}, ${name}`;
    warnings.push(
      ...(beatsLeftOut > 0 ? [`${where}: ${countOf(beatsLeftOut, 'beat')} past the end of the bar left out`] : []),
      ...(notesLeftOut > 0 ? [`${where}: ${countOf(notesLeftOut, 'note')} on a string the track does not have left out`] : []),
    );
    return { ...bar, parts: parts.map((item) => item.part) };
  });
  return { bars: fitted, warnings };
}
