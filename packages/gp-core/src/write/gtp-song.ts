// Port of TuxGuitar GTPOutputStream / GP5OutputStream song-level helpers (LGPL-2.1): what every GP3–GP5 writer derives from the song.
import { EMPTY_VOICE } from '../model/defaults';
import type { Beat, GuitarString, Lyrics, Measure, Note, Song, Track, Voice } from '../model/song';

/** GP3–GP5 tracks have at most seven strings. */
export const MAX_STRINGS = 7;
/** GP3–GP5 frets are signed bytes and the readers turn frets of 100 or more into 0. */
export const MAX_GP_FRET = 99;
/** Guitar Pro 3–5 hold two voices per beat (GP6+ up to four: the others are left out). */
export const MAX_GP_VOICES = 2;
const MAX_KEY = 7;

/** A song a GP3–GP5 file cannot hold (TuxGuitar's "Empty Song!!!"). */
export function assertWritable(song: Song): void {
  if (song.measureHeaders.length === 0 || song.tracks.length === 0) {
    throw new RangeError('A Guitar Pro file needs at least one measure and one track');
  }
}

/**
 * Key signature of every measure (GTPOutputStream#makeKeySignatures). Guitar Pro keeps one key per
 * measure header; it is taken from the first track that is not percussion (percussion measures read 0).
 */
export function resolveKeySignatures(song: Song): readonly number[] {
  const reference = song.tracks.find((track) => !track.isPercussion) ?? song.tracks[0];
  return song.measureHeaders.map((_, index) => {
    const key = reference?.measures[index]?.keySignature ?? 0;
    return Math.max(-MAX_KEY, Math.min(MAX_KEY, key));
  });
}

/** The track whose lyrics a GP4/GP5 file keeps: the first with lyrics text, else the first with lyrics. */
export function resolveLyricTrack(tracks: readonly Track[]): { readonly number: number; readonly lyrics: Lyrics } | undefined {
  const track = tracks.find((candidate) => (candidate.lyrics?.text ?? '') !== '') ?? tracks.find((candidate) => candidate.lyrics);
  return track?.lyrics === undefined ? undefined : { number: track.number, lyrics: track.lyrics };
}

/** The strings a GP3–GP5 file can hold (the first seven; GTPOutputStream#createWritableStrings). */
export function writableStrings(track: Track): readonly GuitarString[] {
  return track.strings.slice(0, MAX_STRINGS);
}

/**
 * The notes of a voice the file can hold: one per string (the first), on strings 1…`stringCount`,
 * in string order as the readers return them (frets are clamped when written: clampFret).
 */
export function writableNotes(voice: Voice, stringCount: number): readonly Note[] {
  const byString = new Map<number, Note>();
  for (const note of voice.notes) {
    if (note.string >= 1 && note.string <= Math.min(stringCount, MAX_STRINGS) && !byString.has(note.string)) {
      byString.set(note.string, note);
    }
  }
  return [...byString.values()].sort((a, b) => a.string - b.string);
}

export function clampFret(fret: number): number {
  return Math.max(0, Math.min(MAX_GP_FRET, Math.round(fret)));
}

/** Voice `voiceIndex` of a beat; the readers' placeholder (an empty quarter) when the beat has none. */
export function voiceAt(beat: Beat, voiceIndex: number): Voice {
  return beat.voices[voiceIndex] ?? EMPTY_VOICE;
}

/** The beats of a measure that have a (non-empty) voice `voiceIndex`, in time order. */
export function voiceBeats(measure: Measure, voiceIndex: number): readonly Beat[] {
  const beats = [...measure.beats].sort((a, b) => a.start - b.start);
  return beats.filter((beat) => isWrittenVoice(beat.voices[voiceIndex]));
}

function isWrittenVoice(voice: Voice | undefined): voice is Voice {
  return voice !== undefined && !voice.isEmpty;
}

/** The voice that carries a beat's chord and text: the first voice the file holds that is not empty. */
export function isBeatCarrier(beat: Beat, voiceIndex: number): boolean {
  const first = beat.voices.slice(0, MAX_GP_VOICES).findIndex(isWrittenVoice);
  return first === voiceIndex;
}

/** GP3–GP5 store a tempo as a whole number: a decimal tempo (92.5) is rounded. */
export function writtenTempo(song: Song, index: number): number | undefined {
  const tempo = song.measureHeaders[index]?.tempo;
  return tempo === undefined ? undefined : Math.round(tempo);
}

/**
 * Tempo to write as a mix-table change at the start of measure `index`, if any. The readers give each
 * measure header the tempo in effect after the measure, so a change on the first beat restores it;
 * the first measure takes the song tempo. Tempos are compared as written (rounded).
 */
export function tempoChangeAt(song: Song, index: number): number | undefined {
  const tempo = writtenTempo(song, index);
  const previous = writtenTempo(song, index - 1);
  return index > 0 && tempo !== undefined && tempo !== previous ? tempo : undefined;
}
