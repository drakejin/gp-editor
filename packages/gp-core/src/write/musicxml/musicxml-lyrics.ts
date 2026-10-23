// Port of TuxGuitar app.tuxguitar.io.musicxml.MusicXMLLyricWriter (LGPL-2.1): a track's lyrics as one syllable per sung beat.
import type { Measure, Track } from '../../model/song';

export type Syllabic = 'single' | 'begin' | 'middle' | 'end';

/** The lyric of one note: MusicXML's syllabic and text. */
export interface NoteLyric {
  readonly syllabic: Syllabic;
  readonly text: string;
}

/** Each measure's lyrics (by measure index), keyed by the index of the beat they are sung on. */
export type TrackLyrics = ReadonlyMap<number, ReadonlyMap<number, NoteLyric>>;

const HYPHEN = '-';

/** TGLyric.getLyricBeats: line breaks count as spaces, and every single space separates two syllables. */
function lyricBeats(text: string): readonly string[] {
  return text.replace(/\r\n|\r|\n/g, ' ').split(' ');
}

/** Beats with notes in any voice: each takes one syllable (TGBeat.isRestBeat is false). */
function sungBeatIndexes(measure: Measure): readonly number[] {
  return measure.beats.flatMap((beat, index) => (beat.voices.some((voice) => voice.notes.length > 0) ? [index] : []));
}

type State = 'none' | 'inWord';

/** generateLyricList's state machine: a syllable ending in "-" begins or continues a word, the next one ends it. */
function toNoteLyric(syllable: string, state: State): { readonly lyric: NoteLyric; readonly state: State } {
  const isContinued = syllable.endsWith(HYPHEN);
  const text = isContinued ? syllable.slice(0, -1) : syllable;
  if (state === 'none') {
    return { lyric: { syllabic: isContinued ? 'begin' : 'single', text }, state: isContinued ? 'inWord' : 'none' };
  }
  return { lyric: { syllabic: isContinued ? 'middle' : 'end', text }, state: isContinued ? 'inWord' : 'none' };
}

/**
 * The track's syllables, from the lyrics' first measure on, one per sung beat in order; a blank syllable leaves its beat
 * without a lyric. (TuxGuitar drops a whole measure when the lyrics run out inside it; here its first beats keep theirs.)
 */
export function buildTrackLyrics(track: Track): TrackLyrics {
  const lyrics = track.lyrics;
  if (lyrics === undefined || lyrics.text.trim() === '') {
    return new Map();
  }
  const syllables = lyricBeats(lyrics.text);
  const byMeasure = new Map<number, ReadonlyMap<number, NoteLyric>>();
  let next = 0;
  let state: State = 'none';
  track.measures.forEach((measure, measureIndex) => {
    if (measureIndex + 1 < lyrics.from) {
      return;
    }
    const sung = new Map<number, NoteLyric>();
    for (const beatIndex of sungBeatIndexes(measure)) {
      const syllable = syllables[next++];
      if (syllable === undefined) {
        break;
      }
      const result = toNoteLyric(syllable, state);
      state = result.state;
      if (result.lyric.text !== '') {
        sung.set(beatIndex, result.lyric);
      }
    }
    byMeasure.set(measureIndex, sung);
  });
  return byMeasure;
}
