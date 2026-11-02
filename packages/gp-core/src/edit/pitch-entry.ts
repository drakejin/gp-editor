import type { Note, Song, Track, Voice } from '../model/song';
import { type BeatAddress, type StringAddress, findNote, locateVoice, otherVoiceOnString } from './addresses';
import { tabFret } from './banjo';
import { deleteBeatNotes } from './beats';
import { MAX_FRET, deleteNote, setNoteFret, setNoteVelocity } from './edit-song';
import { neckFrets, placeNotes, stringsNearHand } from './string-placement';
import { trackTuning } from './tuning-presets';

/** A note played in (MIDI input): its sounding pitch, its velocity, and the string a MIDI guitar played it on. */
export interface PlayedNote {
  /** MIDI pitch; on a drum track, the General MIDI percussion key. */
  readonly pitch: number;
  readonly velocity?: number;
  /** 1 = highest string: a MIDI guitar sends each string on its own channel. */
  readonly string?: number;
}

export interface PitchEntry {
  readonly song: Song;
  /** Notes the beat got. */
  readonly entered: number;
  /** Pitches left out: out of the neck's reach, or more notes than strings. */
  readonly skipped: readonly number[];
}

/** Where a played note goes: a string and the fret stored there (the drum key on a drum track). */
interface NoteSpot {
  readonly string: number;
  readonly fret: number;
  readonly velocity?: number;
}

/** The first position: where the hand is when nothing fretted comes before. */
const FIRST_POSITION = 1;

/** The beats of the track's voice before `at`, nearest first, across bar lines. */
function* beatsBefore(track: Track, at: BeatAddress): Generator<readonly { readonly string: number; readonly fret: number }[]> {
  for (let measureIndex = at.measureIndex; measureIndex >= 0; measureIndex--) {
    const beats = track.measures[measureIndex]?.beats ?? [];
    const last = measureIndex === at.measureIndex ? at.beatIndex - 1 : beats.length - 1;
    for (let beatIndex = last; beatIndex >= 0; beatIndex--) {
      yield beats[beatIndex]?.voices[at.voiceIndex]?.notes ?? [];
    }
  }
}

/** The fretting hand's position before `at`: the lowest fretted fret (as the tab shows it) of the last beat with one. */
export function handFretBefore(song: Song, at: BeatAddress): number {
  const track = song.tracks[at.trackIndex];
  if (track === undefined) {
    return FIRST_POSITION;
  }
  const tuning = trackTuning(track);
  for (const notes of beatsBefore(track, at)) {
    const fretted = notes.map((note) => tabFret(tuning, note.string, note.fret)).filter((fret) => fret > 0);
    if (fretted.length > 0) {
      return Math.min(...fretted);
    }
  }
  return FIRST_POSITION;
}

/** The strings other voices sound on the beat at `at` (setNoteFret leaves them to those voices). */
function heldStrings(song: Song, at: BeatAddress): readonly number[] {
  const stringCount = song.tracks[at.trackIndex]?.strings.length ?? 0;
  return Array.from({ length: stringCount }, (_, i) => i + 1).filter((string) => otherVoiceOnString(song, { ...at, string }) !== undefined);
}

/** A played note and where it goes; no spot when it is left out. */
interface PlacedNote {
  readonly note: PlayedNote;
  readonly spot?: NoteSpot;
}

/** Drum pads: each key on the next string, as many as the track has strings. */
function drumSpots(notes: readonly PlayedNote[], stringCount: number): readonly PlacedNote[] {
  return notes.map((note, i) => ({ note, spot: i < stringCount ? { string: i + 1, fret: note.pitch, velocity: note.velocity } : undefined }));
}

/** True when a MIDI guitar's string can play the note on the neck (frets from the capo). */
function fitsOwnString(note: PlayedNote, track: Track): boolean {
  const open = note.string === undefined ? undefined : track.strings[note.string - 1]?.tuning;
  const fret = open === undefined ? -1 : note.pitch - track.offset - open;
  return fret >= 0 && fret <= MAX_FRET;
}

/**
 * Neck notes: a MIDI guitar note keeps its own string when that string can play it; the others take the strings nearest
 * the hand (stringsNearHand) that no other voice sounds on the beat, and placeNotes settles clashes. Notes it could
 * only place an octave away, or on a string another voice sounds, are left out.
 */
function neckSpots(song: Song, at: BeatAddress, track: Track, notes: readonly PlayedNote[]): readonly PlacedNote[] {
  const tuning = trackTuning(track);
  const neck = neckFrets(track.offset);
  const owned = notes.filter((note) => fitsOwnString(note, track));
  const others = notes.filter((note) => !fitsOwnString(note, track));
  const ownedStrings = owned.flatMap((note) => (note.string === undefined ? [] : [note.string]));
  const held = heldStrings(song, at);
  const nearHand = stringsNearHand(others.map((note) => note.pitch - track.offset), tuning, handFretBefore(song, at), neck, [...ownedStrings, ...held]);
  const preferred = [...ownedStrings, ...nearHand];
  const ordered = [...owned, ...others];
  const placements = placeNotes(ordered.map((note, i) => ({ pitch: note.pitch - track.offset, preferredString: preferred[i] ?? 1 })), tuning, neck);
  return ordered.map((note, i) => {
    const placement = placements[i];
    const isAtPitch = placement !== undefined && placement.octaves === 0 && !held.includes(placement.string);
    return { note, spot: isAtPitch ? { string: placement.string, fret: placement.fret, velocity: note.velocity } : undefined };
  });
}

function uniquePitches(notes: readonly PlayedNote[]): readonly PlayedNote[] {
  return notes.filter((note, i) => notes.findIndex((other) => other.pitch === note.pitch) === i);
}

/**
 * Step entry of notes played together (MIDI input): afterwards the voice at `at` holds exactly these notes, with its
 * duration (an empty voice is filled with rests to the bar lines). On a drum track the pitch is the drum key; on a neck
 * each note goes on its MIDI guitar string when it has one that plays it, else near the hand (handFretBefore). Pitches
 * no string plays are skipped. Same song when nothing could be entered or the position does not exist.
 */
export function enterPlayedNotes(song: Song, at: BeatAddress, notes: readonly PlayedNote[]): PitchEntry {
  const location = locateVoice(song, at);
  const played = uniquePitches(notes);
  if (location === undefined) {
    return { song, entered: 0, skipped: played.map((note) => note.pitch) };
  }
  const { track } = location;
  const placements = track.isPercussion ? drumSpots(played, track.strings.length) : neckSpots(song, at, track, played);
  const skipped = placements.filter((placement) => placement.spot === undefined).map((placement) => placement.note.pitch);
  const placed = placements.flatMap((placement) => (placement.spot === undefined ? [] : [placement.spot]));
  if (placed.length === 0) {
    return { song, entered: 0, skipped };
  }
  // Filling an empty voice may add rests before the beat: each note finds the beat again by where it starts.
  const start = location.beat.start;
  const entered = placed.reduce((current, spot) => {
    const beatIndex = current.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats.findIndex((beat) => beat.start === start) ?? -1;
    const address = { ...at, beatIndex: beatIndex < 0 ? at.beatIndex : beatIndex, string: spot.string };
    const fretted = setNoteFret(current, address, spot.fret);
    return spot.velocity === undefined ? fretted : setNoteVelocity(fretted, address, spot.velocity);
  }, deleteBeatNotes(song, at));
  return { song: entered, entered: placed.length, skipped };
}

/**
 * A click on the fretboard (Guitar Pro 8's instrument view: "click on the guitar fretboard at the desired fret and
 * string. To delete a note, simply click on it"): the voice at `at` gets `fret` on the addressed string beside the
 * beat's other notes (setNoteFret: an empty voice filled to the bar lines, never a string another voice sounds), or
 * loses the note when it plays that fret there already.
 */
export function toggleFretNote(song: Song, at: StringAddress, fret: number): Song {
  return findNote(song, at)?.fret === fret ? deleteNote(song, at) : setNoteFret(song, at, fret);
}

/** The voice's note sounding `pitch` (frets from the capo; a dead note sounds none). */
function noteAtPitch(track: Track, voice: Voice, pitch: number): Note | undefined {
  return voice.isEmpty ? undefined : voice.notes.find((note) => !note.effect.deadNote && (track.strings[note.string - 1]?.tuning ?? Number.NaN) + track.offset + note.fret === pitch);
}

/** The free string nearest the hand that plays `neckPitch` (from the capo) on the neck, and its fret; undefined when none. */
function freeSpot(song: Song, at: BeatAddress, track: Track, voice: Voice, neckPitch: number): NoteSpot | undefined {
  const tuning = trackTuning(track);
  const neck = neckFrets(track.offset);
  const taken = [...(voice.isEmpty ? [] : voice.notes.map((note) => note.string)), ...heldStrings(song, at)];
  const [string] = stringsNearHand([neckPitch], tuning, handFretBefore(song, at), neck, taken);
  const open = string === undefined ? undefined : tuning[string - 1];
  const fret = open === undefined ? -1 : neckPitch - open;
  return string === undefined || taken.includes(string) || fret < 0 || fret > neck ? undefined : { string, fret };
}

/**
 * A click on the piano keyboard ("click on a piano key. To delete a note, simply click on it"): the note the voice at
 * `at` sounds at `pitch` is taken out; else the pitch goes on the free string nearest the hand (handFretBefore) beside
 * the beat's other notes — not one the voice or another voice sounds on the beat. The same song for a pitch no free
 * string plays on the neck, and on a drum track.
 */
export function togglePitchNote(song: Song, at: BeatAddress, pitch: number): Song {
  const location = locateVoice(song, at);
  if (location === undefined || location.track.isPercussion) {
    return song;
  }
  const { track, voice } = location;
  const sounding = noteAtPitch(track, voice, pitch);
  if (sounding !== undefined) {
    return deleteNote(song, { ...at, string: sounding.string });
  }
  const spot = freeSpot(song, at, track, voice, pitch - track.offset);
  return spot === undefined ? song : setNoteFret(song, { ...at, string: spot.string }, spot.fret);
}

/** The string of the note the voice at `at` sounds at `pitch` (where a piano key's click put it); undefined when none. */
export function stringAtPitch(song: Song, at: BeatAddress, pitch: number): number | undefined {
  const location = locateVoice(song, at);
  return location === undefined ? undefined : noteAtPitch(location.track, location.voice, pitch)?.string;
}
