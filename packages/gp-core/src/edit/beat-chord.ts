// A beat's chord diagram, after TuxGuitar's TGInsertChordAction / TGRemoveChordAction (LGPL-2.1).
import { DEFAULT_VELOCITY } from '../formats/common/velocity';
import { EMPTY_NOTE_EFFECT } from '../model/defaults';
import type { Beat, Chord, Note, Song } from '../model/song';
import { chordFirstFret, isSameChord } from '../chords/shape';
import { type BeatAddress, locateVoice } from './addresses';
import { MAX_FRET, isFret } from './edit-song';
import { updateBeat, updateVoice } from './song-paths';
import { fillEmptyVoice } from './voice-entry';

/** The chord as a file holds it: a fret per track string (-1 = not played), a trimmed name, a first fret 1–MAX_FRET. */
function fitChord(chord: Chord, stringCount: number): Chord {
  const frets = Array.from({ length: stringCount }, (_, i) => {
    const fret = Math.round(chord.frets[i] ?? -1);
    return isFret(fret) ? fret : -1;
  });
  const firstFret = Number.isFinite(chord.firstFret) && chord.firstFret >= 1 ? Math.min(MAX_FRET, Math.round(chord.firstFret)) : chordFirstFret(frets);
  return { name: chord.name.trim(), firstFret, frets };
}

function withoutChord(beat: Beat): Beat {
  const { chord: _removed, ...rest } = beat;
  return rest;
}

/**
 * New song with the chord diagram of the addressed beat set, fitted to the track's strings; undefined, or a chord with
 * neither a name nor a played string, removes it. Same song when nothing changes or there is no beat. The notes stay.
 */
export function setBeatChord(song: Song, at: BeatAddress, chord: Chord | undefined): Song {
  const stringCount = song.tracks[at.trackIndex]?.strings.length ?? 0;
  const next = chord === undefined ? undefined : fitChord(chord, stringCount);
  const isEmpty = next === undefined || (next.name === '' && next.frets.every((fret) => fret < 0));
  return updateBeat(song, at, (beat) => {
    if (isEmpty) {
      return beat.chord === undefined ? beat : withoutChord(beat);
    }
    return isSameChord(next, beat.chord) ? beat : { ...beat, chord: next };
  });
}

function chordNotes(chord: Chord, previous: readonly Note[]): readonly Note[] {
  return chord.frets.flatMap((fret, i): Note[] => {
    const string = i + 1;
    if (!isFret(fret)) {
      return [];
    }
    const velocity = previous.find((note) => note.string === string)?.velocity ?? previous[0]?.velocity ?? DEFAULT_VELOCITY;
    return [{ string, fret, velocity, isTied: false, effect: EMPTY_NOTE_EFFECT }];
  });
}

/**
 * New song where the addressed voice plays the chord: its notes replaced by one per played string of the chord (a note
 * the chord plays on the same string keeps its velocity), as TuxGuitar inserts a chord. A rest becomes the chord; an
 * empty voice is filled with it and rests up to the bar lines. Same song when the chord plays no string or there is
 * no voice.
 */
export function setBeatChordNotes(song: Song, at: BeatAddress, chord: Chord): Song {
  const location = locateVoice(song, at);
  const stringCount = location?.track.strings.length ?? 0;
  const notes = chordNotes(fitChord(chord, stringCount), location?.voice.notes ?? []);
  const [first] = notes;
  if (location === undefined || first === undefined) {
    return song;
  }
  if (!location.voice.isEmpty) {
    return updateVoice(song, at, (voice) => ({ ...voice, notes }));
  }
  // Filling the voice may add rests before the beat, so it is found again by where it starts.
  const filled = fillEmptyVoice(song, at, first);
  const beatIndex = filled.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats.findIndex((beat) => beat.start === location.beat.start) ?? -1;
  return filled === song || beatIndex < 0 ? song : updateVoice(filled, { ...at, beatIndex }, (voice) => ({ ...voice, notes }));
}
