import type { StringAddress } from '../edit/addresses';
import { MAX_FRET } from '../edit/edit-song';
import { neckFrets } from '../edit/string-placement';
import { untieOrphanNotes } from '../edit/ties';
import { trackTuning } from '../edit/tuning-presets';
import { writtenTransposition } from '../formats/common/instrument-sets';
import type { Measure, Song } from '../model/song';
import { type Neck, buildBeatNotes } from '../transcription/beat-notes';
import { buildDrumBeatNotes } from '../transcription/drum-notes';
import type { PlannedMeasure } from '../transcription/header-plan';
import { isFrettedInstrument } from '../transcription/instruments';
import { type TrackLayout, buildTrackMeasures } from '../transcription/track-measures';
import type { TranscribedMeasure } from '../transcription/types';
import { addComposedTracks, appendComposedBars } from './compose-extend';
import type { ComposeOutcome, ComposedBars } from './compose-types';
import { trackInstrumentOf } from './track-instrument';

/** What a track plays when it has no channel (the readers' default). */
const DEFAULT_PROGRAM = 25;

function trackName(song: Song, trackIndex: number): string {
  const name = song.tracks[trackIndex]?.name.trim() ?? '';
  return name === '' ? `Track ${trackIndex + 1}` : name;
}

/**
 * How the PDF import's builder places a part's notes on an existing track: drums by name; a fretted instrument's tab as
 * written, its pitches written an octave above their sound for a guitar, bass or banjo (PAGE_PITCH_RULE); any other
 * track's sounding pitches on its own strings.
 */
function trackLayoutOf(song: Song, trackIndex: number): TrackLayout {
  const track = song.tracks[trackIndex];
  const instrument = trackInstrumentOf(song, trackIndex) ?? 'guitar';
  const program = song.channels.find((channel) => channel.id === track?.channelId)?.program ?? DEFAULT_PROGRAM;
  const tuning = track === undefined ? [] : trackTuning(track);
  const isFretted = isFrettedInstrument(instrument);
  const capo = track?.offset ?? 0;
  const neck: Neck = { tuning, capo, lastFret: isFretted ? neckFrets(capo) : MAX_FRET, writtenAbove: isFretted ? writtenTransposition(program, false, tuning) : 0, readsTab: isFretted };
  const name = trackName(song, trackIndex);
  return {
    trackIndex,
    placeBeat: track?.isPercussion === true ? buildDrumBeatNotes : (voices) => buildBeatNotes(voices, neck),
    isPercussion: track?.isPercussion === true,
    clef: track?.measures[0]?.clef ?? 'treble',
    where: (barNumber) => `Bar ${barNumber}, ${name}`,
  };
}

function noteCount(measures: readonly Measure[]): number {
  return measures.reduce((count, measure) => count + measure.beats.reduce((beats, beat) => beats + beat.voices.reduce((notes, voice) => notes + voice.notes.length, 0), 0), 0);
}

interface WrittenTrack {
  readonly song: Song;
  readonly notes: number;
  readonly warnings: readonly string[];
}

/** The track's bars from `startIndex` replaced by the composed ones (a bar without its part: rests), each keeping its clef and key. */
function writeTrack(song: Song, trackIndex: number, bars: readonly TranscribedMeasure[], startIndex: number): WrittenTrack {
  const track = song.tracks[trackIndex];
  if (track === undefined) {
    return { song, notes: 0, warnings: [] };
  }
  const planned = bars.flatMap((source, offset): PlannedMeasure[] => {
    const headerIndex = startIndex + offset;
    const header = song.measureHeaders[headerIndex];
    return header === undefined ? [] : [{ source, header, headerIndex, keySignature: track.measures[headerIndex]?.keySignature ?? 0 }];
  });
  const built = buildTrackMeasures(planned, trackLayoutOf(song, trackIndex));
  const measures = track.measures.map((measure, index) => {
    const written = index >= startIndex ? built.measures[index - startIndex] : undefined;
    return written === undefined ? measure : { ...written, clef: measure.clef, keySignature: measure.keySignature };
  });
  const tracks = song.tracks.map((other, index) => (index === trackIndex ? { ...track, measures } : other));
  return { song: { ...song, tracks }, notes: noteCount(built.measures), warnings: built.warnings };
}

/** Tied notes in the bar after the written ones, in the written tracks: those whose tie now has nothing to continue are untied. */
function untieAfter(song: Song, trackIndexes: readonly number[], measureIndex: number): Song {
  const addresses = trackIndexes.flatMap((trackIndex): StringAddress[] =>
    (song.tracks[trackIndex]?.measures[measureIndex]?.beats ?? []).flatMap((beat, beatIndex) =>
      beat.voices.flatMap((voice, voiceIndex) => voice.notes.filter((note) => note.isTied).map((note) => ({ trackIndex, measureIndex, beatIndex, voiceIndex, string: note.string }))),
    ),
  );
  return addresses.length === 0 ? song : untieOrphanNotes(song, addresses);
}

/** Existing bars keep their header and key: a composed bar setting others is said once per bar. */
function headerWarnings(song: Song, bars: readonly TranscribedMeasure[], startIndex: number): readonly string[] {
  return bars.flatMap((bar, offset) => {
    const header = song.measureHeaders[startIndex + offset];
    if (header === undefined) {
      return [];
    }
    const meter = bar.timeSignature;
    const isMeterChanged = meter !== undefined && (meter.numerator !== header.timeSignature.numerator || meter.denominator !== header.timeSignature.denominator);
    const isTempoChanged = bar.tempo !== undefined && bar.tempo !== header.tempo;
    const isKeyChanged = bar.keySignature !== undefined && bar.keySignature !== song.tracks[0]?.measures[startIndex + offset]?.keySignature;
    return isMeterChanged || isTempoChanged || isKeyChanged ? [`Bar ${header.number}: kept its meter, tempo and key (only added bars take new ones)`] : [];
  });
}

/** A written track that has lyrics: they stay, and follow its notes. */
function lyricsWarnings(song: Song, trackIndexes: readonly number[], startIndex: number): readonly string[] {
  return trackIndexes.flatMap((trackIndex) =>
    (song.tracks[trackIndex]?.lyrics?.text.trim() ?? '') === ''
      ? []
      : [`${trackName(song, trackIndex)}: its lyrics stay as they were; they follow its notes, so syllables from bar ${startIndex + 1} on may sit on other notes`],
  );
}

/** The tracks with a part in any bar that the song has once the new tracks are added, in order. */
function writtenTrackIndexes(bars: readonly TranscribedMeasure[], trackCount: number): readonly number[] {
  return [...new Set(bars.flatMap((bar) => bar.parts.map((part) => part.track)))].filter((trackIndex) => trackIndex < trackCount).sort((a, b) => a - b);
}

/**
 * Writes a checked answer into the song from bar `startIndex` (0-based; past the end: right after the last bar), as one
 * edit: the bars past the end added to every track (rests; the meter, tempo and key of the bar before unless a composed
 * bar sets them), the new tracks added after the last one (rests where they do not play), then each track with a part in
 * any bar rewritten over all the composed bars — notes placed as the PDF import places them, a short part filled with
 * rests, a bar without its part rests. Every other track and bar, and the existing bars' meter, tempo and key, stay as
 * they were; a tie after the written bars left with nothing to continue is undone. The same song when there are no bars.
 */
export function applyComposedBars(song: Song, composed: ComposedBars, startIndex: number): ComposeOutcome {
  const { bars } = composed;
  if (bars.length === 0) {
    return { song, barsWritten: 0, barsAdded: 0, tracksAdded: 0, notes: 0, writtenTracks: [], warnings: composed.warnings };
  }
  const start = Math.max(0, Math.min(Math.round(startIndex), song.measureHeaders.length));
  const extended = appendComposedBars(song, bars, start);
  const withTracks = addComposedTracks(extended, composed.newTracks, bars);
  const writtenTracks = writtenTrackIndexes(bars, withTracks.song.tracks.length);
  const written = writtenTracks.reduce<WrittenTrack>((result, trackIndex) => {
    const next = writeTrack(result.song, trackIndex, bars, start);
    return { song: next.song, notes: result.notes + next.notes, warnings: [...result.warnings, ...next.warnings] };
  }, { song: withTracks.song, notes: 0, warnings: [] });
  const existingWritten = writtenTracks.filter((trackIndex) => trackIndex < song.tracks.length);
  return {
    song: untieAfter(written.song, writtenTracks, start + bars.length),
    barsWritten: bars.length,
    barsAdded: extended.measureHeaders.length - song.measureHeaders.length,
    tracksAdded: withTracks.added,
    notes: written.notes,
    writtenTracks,
    warnings: [...composed.warnings, ...headerWarnings(song, bars, start), ...withTracks.warnings, ...written.warnings, ...lyricsWarnings(song, existingWritten, start)],
  };
}
