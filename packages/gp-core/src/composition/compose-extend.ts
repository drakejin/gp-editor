import { restMeasure } from '../edit/measures';
import { type NewTrack, addTrack } from '../edit/tracks';
import { headerTicks } from '../model/defaults';
import type { MeasureHeader, Song, Track } from '../model/song';
import { isTimeSignature } from '../transcription/durations';
import { isFrettedInstrument, resolveClef, resolveProgram, trackKindOf } from '../transcription/instruments';
import { partPitchRange, pitchedPartTuning, resolveFrettedTuning } from '../transcription/track-tunings';
import type { TranscribedMeasure, TranscribedTrack } from '../transcription/types';

// What Compose from Here adds to a song before it writes the bars: the bars past its end and the new tracks.

/** A bar added past the song's end, and the key its measures take when a composed bar sets one. */
interface AddedBar {
  readonly header: MeasureHeader;
  readonly keySignature?: number;
}

/** The header after `previous`: the composed bar's meter and tempo when it sets them, else `previous`'s; no repeats, no marker. */
function nextHeader(previous: MeasureHeader, bar: TranscribedMeasure | undefined, headerIndex: number): MeasureHeader {
  const marked = bar?.timeSignature;
  const timeSignature = marked !== undefined && isTimeSignature(marked) ? { numerator: marked.numerator, denominator: marked.denominator } : previous.timeSignature;
  return {
    number: headerIndex + 1,
    start: previous.start + headerTicks(previous),
    timeSignature,
    tempo: bar?.tempo ?? previous.tempo,
    repeatOpen: false,
    repeatClose: 0,
    repeatAlternative: 0,
    tripletFeel: previous.tripletFeel,
  };
}

/** The bars from the song's end to `endIndex`, each carrying the meter, tempo and key of the one before unless it sets its own. */
function addedBars(song: Song, bars: readonly TranscribedMeasure[], startIndex: number, endIndex: number): readonly AddedBar[] {
  const last = song.measureHeaders.at(-1);
  if (last === undefined) {
    return [];
  }
  const count = Math.max(0, endIndex - song.measureHeaders.length);
  return Array.from({ length: count }).reduce<readonly AddedBar[]>((added, _, offset) => {
    const headerIndex = song.measureHeaders.length + offset;
    const before = added.at(-1);
    const bar = bars[headerIndex - startIndex];
    const keySignature = bar?.keySignature ?? before?.keySignature;
    return [...added, { header: nextHeader(before?.header ?? last, bar, headerIndex), ...(keySignature === undefined ? {} : { keySignature }) }];
  }, []);
}

/** A track with rest bars under the added headers, in the clef and key of its last bar unless the bar sets a key. */
function withRestBars(track: Track, added: readonly AddedBar[], firstIndex: number): Track {
  const rests = added.map(({ header, keySignature }, offset) => {
    const measure = restMeasure(track, firstIndex - 1, header, firstIndex + offset);
    return keySignature === undefined ? measure : { ...measure, keySignature };
  });
  return { ...track, measures: [...track.measures, ...rests] };
}

/**
 * The song with bars of rests in every track up to `startIndex + bars.length` (bars it already has stay as they are),
 * each in the meter, tempo and key of the bar before unless its composed bar sets them. The same song when it has them.
 */
export function appendComposedBars(song: Song, bars: readonly TranscribedMeasure[], startIndex: number): Song {
  const added = addedBars(song, bars, startIndex, startIndex + bars.length);
  if (added.length === 0) {
    return song;
  }
  const firstIndex = song.measureHeaders.length;
  return { ...song, measureHeaders: [...song.measureHeaders, ...added.map((bar) => bar.header)], tracks: song.tracks.map((track) => withRestBars(track, added, firstIndex)) };
}

interface NewTrackSpec {
  readonly newTrack: NewTrack;
  readonly name: string;
  readonly warning?: string;
}

/**
 * A contract track as the Add Track panel's new track: its kind, General MIDI program (resolveProgram), and strings — a
 * fretted instrument's tuning, a drum kit's, else strings holding the pitches its parts sound (`trackIndex` in the bars).
 */
function toNewTrack(track: TranscribedTrack, bars: readonly TranscribedMeasure[], trackIndex: number): NewTrackSpec {
  const name = track.name.trim() === '' ? `Track ${trackIndex + 1}` : track.name.trim();
  const kind = trackKindOf(track.instrument);
  if (kind === 'drums') {
    return { newTrack: { kind, name }, name };
  }
  const program = resolveProgram(track, name);
  if (!isFrettedInstrument(track.instrument)) {
    return { newTrack: { kind, name, program, tuning: pitchedPartTuning(partPitchRange(bars, trackIndex)) }, name };
  }
  const { tuning, warning } = resolveFrettedTuning(track, name);
  return { newTrack: { kind, name, program, tuning, capo: track.capo }, name, ...(warning === undefined ? {} : { warning }) };
}

export interface AddedTracks {
  readonly song: Song;
  readonly added: number;
  readonly warnings: readonly string[];
}

/**
 * The song with the composed new tracks after its last one, in order (the bars' parts name them from `song.tracks.length`
 * on): rests in every bar, each measure in the track's clef. A track that cannot be added stops the adding, so no later
 * track takes its index; a warning says which were left out.
 */
export function addComposedTracks(song: Song, tracks: readonly TranscribedTrack[], bars: readonly TranscribedMeasure[]): AddedTracks {
  const result = tracks.reduce<AddedTracks & { readonly isStopped?: boolean }>(
    (result, track, offset) => {
      if (result.isStopped === true) {
        return result;
      }
      const spec = toNewTrack(track, bars, song.tracks.length + offset);
      const next = addTrack(result.song, spec.newTrack);
      if (next === result.song) {
        return { ...result, isStopped: true, warnings: [...result.warnings, `New track "${spec.name}" could not be added: it and the tracks after it were left out`] };
      }
      const clef = resolveClef(track);
      const tracksWithClef = next.tracks.map((added, index) => (index === next.tracks.length - 1 ? { ...added, measures: added.measures.map((measure) => ({ ...measure, clef })) } : added));
      return { song: { ...next, tracks: tracksWithClef }, added: result.added + 1, warnings: [...result.warnings, ...(spec.warning === undefined ? [] : [spec.warning])] };
    },
    { song, added: 0, warnings: [] },
  );
  return { song: result.song, added: result.added, warnings: result.warnings };
}
