import type { Beat, Measure, MeasureHeader, Note, Song, Track, Voice } from '../model/song';

/** One voice of one beat — where the editor cursor sits, without the string. */
export interface BeatAddress {
  readonly trackIndex: number;
  readonly measureIndex: number;
  readonly beatIndex: number;
  readonly voiceIndex: number;
}

/**
 * A string position in one voice of one beat — where the editor cursor sits. The position may hold no note yet:
 * setting a fret there adds one.
 */
export interface StringAddress extends BeatAddress {
  /** 1 = highest string, as Note.string. */
  readonly string: number;
}

/** What an address points at, down to the voice; the voice may be empty. */
export interface VoiceLocation {
  readonly track: Track;
  readonly header: MeasureHeader;
  readonly measure: Measure;
  readonly beat: Beat;
  readonly voice: Voice;
}

export function locateVoice(song: Song, at: BeatAddress): VoiceLocation | undefined {
  const track = song.tracks[at.trackIndex];
  const header = song.measureHeaders[at.measureIndex];
  const measure = track?.measures[at.measureIndex];
  const beat = measure?.beats[at.beatIndex];
  const voice = beat?.voices[at.voiceIndex];
  if (track === undefined || header === undefined || measure === undefined || beat === undefined || voice === undefined) {
    return undefined;
  }
  return { track, header, measure, beat, voice };
}

export function findVoice(song: Song, at: BeatAddress): Voice | undefined {
  return song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex]?.voices[at.voiceIndex];
}

/** The note on the addressed string, if there is one. */
export function findNote(song: Song, at: StringAddress): Note | undefined {
  return findVoice(song, at)?.notes.find((note) => note.string === at.string);
}

/** True when the string number exists on the addressed track. */
export function hasString(song: Song, at: StringAddress): boolean {
  const stringCount = song.tracks[at.trackIndex]?.strings.length ?? 0;
  return Number.isInteger(at.string) && at.string >= 1 && at.string <= stringCount;
}
