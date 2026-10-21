import { EMPTY_NOTE_EFFECT, EMPTY_SONG_INFO, NO_STROKE, QUARTER, RED } from '@gp-editor/core';
import type { Beat, Duration, MeasureHeader, Note, NoteEffect, Song } from '@gp-editor/core';

export function note(string: number, fret: number, effect: Partial<NoteEffect> = {}): Note {
  return { string, fret, velocity: 95, isTied: false, effect: { ...EMPTY_NOTE_EFFECT, ...effect } };
}

export function beat(start: number, notes: Note[], duration: Duration = QUARTER): Beat {
  return {
    start,
    voices: [{ duration, notes, isEmpty: false, direction: 'none' }],
    stroke: NO_STROKE,
    pickStroke: 'none',
  };
}

export function header(number: number, overrides: Partial<MeasureHeader> = {}): MeasureHeader {
  return {
    number,
    start: 960 + (number - 1) * 3840,
    timeSignature: { numerator: 4, denominator: 4 },
    tempo: 120,
    repeatOpen: false,
    repeatClose: 0,
    repeatAlternative: 0,
    tripletFeel: 'none',
    ...overrides,
  };
}

/** One 6-string track; `measures[i]` are the beats of bar i. */
export function makeSong(measures: Beat[][], headers: MeasureHeader[] = measures.map((_, i) => header(i + 1))): Song {
  return {
    source: { format: 'gp5', version: 'FICHIER GUITAR PRO v5.10' },
    info: { ...EMPTY_SONG_INFO, title: 'Test' },
    channels: [],
    measureHeaders: headers,
    tracks: [
      {
        number: 1,
        name: 'Guitar',
        channelId: 1,
        strings: [64, 59, 55, 50, 45, 40].map((tuning, i) => ({ number: i + 1, tuning })),
        color: RED,
        offset: 0,
        isPercussion: false,
        solo: false,
        mute: false,
        measures: measures.map((beats, headerIndex) => ({ headerIndex, clef: 'treble', keySignature: 0, beats })),
      },
    ],
  };
}
