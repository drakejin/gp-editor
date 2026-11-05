import type { Measure, Song, Track } from '../model/song';
import type { VoiceFlow } from './bar-flow';
import { isSungBeat, withBlankSyllables } from './lyrics';
import { replaceAt } from './song-paths';
import { type VoiceEvent, type VoiceEvents, eventTicks } from './timeline';

/**
 * Lyrics kept on their notes when a ripple cuts a note at a bar line: every beat with notes takes a syllable, a tied
 * one too (TuxGuitar's TGLyric, alphaTab, Guitar Pro), so the tied piece would take the next note's syllable and every
 * later one would sing a note early. A blank syllable goes where the piece is sung.
 */

/** A bar's new events in a flowing voice. */
export interface WrittenBar {
  readonly measureIndex: number;
  readonly events: VoiceEvents;
}

/** Where a tied piece starts: its bar and its start in ticks. */
interface PiecePlace {
  readonly measureIndex: number;
  readonly start: number;
}

function piecePlaces(song: Song, writes: readonly WrittenBar[], pieces: readonly VoiceEvent[]): readonly PiecePlace[] {
  const isPiece = new Set(pieces);
  return writes.flatMap(({ measureIndex, events }) => {
    let start = song.measureHeaders[measureIndex]?.start ?? 0;
    return events.flatMap((event) => {
      const place = { measureIndex, start };
      start += eventTicks(event);
      return isPiece.has(event) ? [place] : [];
    });
  });
}

/** The syllable index of the beat starting at `place`, when only the flowing voice's piece makes it sung (another voice sings there anyway). */
function sungIndex(track: Track, firstIndex: number, place: PiecePlace, voiceIndex: number): number | undefined {
  const beats = track.measures[place.measureIndex]?.beats ?? [];
  const beat = beats.find((candidate) => candidate.start === place.start);
  const isOthersSung = beat === undefined || beat.voices.some((voice, index) => index !== voiceIndex && voice.notes.length > 0);
  if (isOthersSung || place.measureIndex < firstIndex) {
    return undefined;
  }
  const before = track.measures.slice(firstIndex, place.measureIndex).reduce((count, measure: Measure) => count + measure.beats.filter(isSungBeat).length, 0);
  return before + beats.filter((candidate) => candidate.start < place.start && isSungBeat(candidate)).length;
}

/**
 * The song with a blank syllable in the flowing track's lyrics for each tied piece (of `pieces`, as written in
 * `writes`) that a bar line made, where it takes a syllable of its own. The same song without lyrics or pieces.
 */
export function blankSyllablesForTies(song: Song, flow: VoiceFlow, writes: readonly WrittenBar[], pieces: readonly VoiceEvent[]): Song {
  const track = song.tracks[flow.trackIndex];
  const lyrics = track?.lyrics;
  if (track === undefined || lyrics === undefined || pieces.length === 0) {
    return song;
  }
  const firstIndex = Math.max(0, lyrics.from - 1);
  const indexes = piecePlaces(song, writes, pieces).flatMap((place) => sungIndex(track, firstIndex, place, flow.voiceIndex) ?? []);
  const text = withBlankSyllables(lyrics.text, indexes);
  return text === lyrics.text ? song : { ...song, tracks: replaceAt(song.tracks, flow.trackIndex, { ...track, lyrics: { ...lyrics, text } }) };
}
