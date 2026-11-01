// A fingering written back into a track: chosen notes on their new string and fret, nothing else about them changed.
import { diagramFirstFret, shiftEffectFrets } from '../edit/retune';
import { sortByString } from '../edit/song-paths';
import type { Beat, Chord, Measure, Note, Track, Voice } from '../model/song';
import type { StringOption, Timeline } from './timeline';

/** The note at a new place: grace, trill and tapped-harmonic frets move with it; its left-hand finger no longer applies. */
function placed(note: Note, option: StringOption): Note {
  const { leftFinger: _finger, ...kept } = note;
  return { ...kept, string: option.string, fret: option.fret, effect: shiftEffectFrets(note.effect, option.fret - note.fret) };
}

/** Each string's fret among a beat's notes (every voice). */
function fretsByString(beat: Beat, stringCount: number): readonly number[] {
  const frets = Array.from({ length: stringCount }, () => -1);
  beat.voices.forEach((voice) => voice.notes.forEach((note) => (frets[note.string - 1] = note.fret)));
  return frets;
}

/** A chord diagram that showed the beat's notes shows them where they now are; any other diagram stays. */
function followChord(chord: Chord | undefined, before: Beat, after: Beat, stringCount: number): Chord | undefined {
  const old = fretsByString(before, stringCount);
  if (chord === undefined || chord.frets.length !== stringCount || chord.frets.some((fret, i) => fret !== old[i])) {
    return chord;
  }
  const frets = fretsByString(after, stringCount);
  return { ...chord, frets, firstFret: diagramFirstFret(frets, chord.firstFret) };
}

type Moves = ReadonlyMap<string, StringOption>;

function voiceWith(voice: Voice, moves: Moves, at: string): Voice {
  const notes = voice.notes.map((note, noteIndex) => {
    const option = moves.get(`${at}:${noteIndex}`);
    return option === undefined ? note : placed(note, option);
  });
  return notes.every((note, i) => note === voice.notes[i]) ? voice : { ...voice, notes: sortByString(notes) };
}

function beatWith(beat: Beat, moves: Moves, at: string, stringCount: number): Beat {
  const voices = beat.voices.map((voice, voiceIndex) => voiceWith(voice, moves, `${at}:${voiceIndex}`));
  if (voices.every((voice, i) => voice === beat.voices[i])) {
    return beat;
  }
  const moved = { ...beat, voices };
  const chord = followChord(beat.chord, beat, moved, stringCount);
  return chord === beat.chord ? moved : { ...moved, chord };
}

/** The track with each chosen note (option index other than 0) moved; the same track when none moves. */
export function applyFingering(track: Track, timeline: Timeline, choices: ReadonlyMap<number, number>): Track {
  const moves = new Map<string, StringOption>();
  choices.forEach((index, id) => {
    const note = timeline.notes[id];
    const option = note?.options[index];
    if (note !== undefined && option !== undefined && index !== 0) {
      moves.set(`${note.measureIndex}:${note.beatIndex}:${note.voiceIndex}:${note.noteIndex}`, option);
    }
  });
  if (moves.size === 0) {
    return track;
  }
  const measures = track.measures.map((measure, measureIndex): Measure => {
    const beats = measure.beats.map((beat, beatIndex) => beatWith(beat, moves, `${measureIndex}:${beatIndex}`, track.strings.length));
    return beats.every((beat, i) => beat === measure.beats[i]) ? measure : { ...measure, beats };
  });
  return { ...track, measures };
}
