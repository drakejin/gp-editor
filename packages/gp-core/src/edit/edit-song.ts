import type { Beat, Measure, Note, Song, Track, Voice } from '../model/song';

/** Highest fret an edit may set (TuxGuitar's TGTrack.DEFAULT_MAX_FRET). */
export const MAX_FRET = 29;

/** Indexes (0-based) of a note inside a song. */
export interface NoteAddress {
  readonly track: number;
  readonly measure: number;
  readonly beat: number;
  readonly voice: number;
  readonly note: number;
}

export function findNote(song: Song, address: NoteAddress): Note | undefined {
  return findVoice(song, address)?.notes[address.note];
}

/** New song with the addressed note's fret set (clamped to 0…MAX_FRET). Same song if the address is invalid. */
export function setNoteFret(song: Song, address: NoteAddress, fret: number): Song {
  const clamped = Math.min(MAX_FRET, Math.max(0, Math.round(fret)));
  return updateNote(song, address, (note) => (note.fret === clamped ? note : { ...note, fret: clamped }));
}

/** New song with the note moved to `string`. Same song if that string does not exist or is used in the same voice. */
export function setNoteString(song: Song, address: NoteAddress, string: number): Song {
  const track = song.tracks[address.track];
  const voice = findVoice(song, address);
  if (track === undefined || voice === undefined || string < 1 || string > track.strings.length) {
    return song;
  }
  const taken = voice.notes.some((other, i) => i !== address.note && other.string === string);
  return taken ? song : updateNote(song, address, (note) => ({ ...note, string }));
}

/** New song without the addressed note. A voice whose last note is removed becomes a rest. */
export function deleteNote(song: Song, address: NoteAddress): Song {
  if (findNote(song, address) === undefined) {
    return song;
  }
  return updateVoice(song, address, (voice) => ({
    ...voice,
    notes: voice.notes.filter((_, i) => i !== address.note),
  }));
}

function findVoice(song: Song, address: NoteAddress): Voice | undefined {
  return song.tracks[address.track]?.measures[address.measure]?.beats[address.beat]?.voices[address.voice];
}

function updateNote(song: Song, address: NoteAddress, change: (note: Note) => Note): Song {
  const current = findNote(song, address);
  if (current === undefined) {
    return song;
  }
  const next = change(current);
  if (next === current) {
    return song;
  }
  return updateVoice(song, address, (voice) => ({ ...voice, notes: replaceAt(voice.notes, address.note, next) }));
}

/** Rebuilds only the path from the song down to one voice; every other branch is shared. */
function updateVoice(song: Song, address: NoteAddress, change: (voice: Voice) => Voice): Song {
  const track = song.tracks[address.track];
  const measure = track?.measures[address.measure];
  const beat = measure?.beats[address.beat];
  const voice = beat?.voices[address.voice];
  if (track === undefined || measure === undefined || beat === undefined || voice === undefined) {
    return song;
  }
  const nextBeat: Beat = { ...beat, voices: replaceAt(beat.voices, address.voice, change(voice)) };
  const nextMeasure: Measure = { ...measure, beats: replaceAt(measure.beats, address.beat, nextBeat) };
  const nextTrack: Track = { ...track, measures: replaceAt(track.measures, address.measure, nextMeasure) };
  return { ...song, tracks: replaceAt(song.tracks, address.track, nextTrack) };
}

function replaceAt<T>(items: readonly T[], index: number, item: T): readonly T[] {
  return items.map((existing, i) => (i === index ? item : existing));
}
