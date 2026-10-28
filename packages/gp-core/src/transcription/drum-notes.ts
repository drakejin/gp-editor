import { sortByString } from '../edit/song-paths';
import { gmPercussionKey } from '../formats/common/channels';
import { DEFAULT_VELOCITY } from '../formats/common/velocity';
import { percussionStrings } from '../formats/midi/midi-strings';
import type { Note } from '../model/song';
import type { BeatNotes, VoiceAtBeat } from './beat-notes';
import { toNoteEffect } from './note-effects';
import type { TranscribedEffect, TranscribedNote } from './types';

/** The marks a drum note keeps: accents and ghost notes (a drum staff writes no bends, slides or palm mutes). */
const DRUM_EFFECTS: ReadonlySet<TranscribedEffect> = new Set<TranscribedEffect>(['accent', 'ghostNote']);

/** A drum one voice plays at the beat: its General MIDI key, the drum track's fret. */
interface DrumHit {
  readonly voiceIndex: number;
  readonly note: TranscribedNote;
  readonly key: number;
}

interface PlacedHit extends DrumHit {
  readonly string: number;
}

function toDrumNote(hit: PlacedHit): Note {
  const effect = toNoteEffect(hit.note.effects?.filter((name) => DRUM_EFFECTS.has(name)));
  return { fret: hit.key, velocity: DEFAULT_VELOCITY, string: hit.string, isTied: false, effect };
}

/**
 * Puts the drums every voice plays at one beat on the drum track's strings, as the MIDI import does (TuxGuitar's
 * TGDrumMap: kicks on string 6, snares on 4, hi-hats on 2, cymbals on 1 …, else the nearest free string). A note's fret
 * is the General MIDI key of the drum it names. Drums beyond the strings are left out (`leftOut`), and so are notes that
 * name no drum (`unreadable`). Drum notes are never tied.
 */
export function buildDrumBeatNotes(voices: readonly VoiceAtBeat[]): BeatNotes {
  const notes = voices.flatMap((voice, voiceIndex) => voice.notes.map((note) => ({ voiceIndex, note, key: note.drum === undefined ? undefined : gmPercussionKey(note.drum) })));
  const hits = notes.filter((hit): hit is DrumHit => hit.key !== undefined);
  const strings = percussionStrings(hits.map((hit) => hit.key));
  const placed = hits.flatMap((hit, index): PlacedHit[] => {
    const string = strings[index];
    return string === undefined ? [] : [{ ...hit, string }];
  });
  const ofVoice = (voiceIndex: number): readonly PlacedHit[] => placed.filter((hit) => hit.voiceIndex === voiceIndex);
  return {
    notes: voices.map((_, voiceIndex) => sortByString(ofVoice(voiceIndex).map(toDrumNote))),
    placed: voices.map((_, voiceIndex) => ofVoice(voiceIndex).map((hit) => ({ string: hit.string, fret: hit.key, pitch: hit.key }))),
    counts: { octaveMoved: 0, leftOut: hits.length - placed.length, unreadable: notes.length - hits.length },
  };
}
