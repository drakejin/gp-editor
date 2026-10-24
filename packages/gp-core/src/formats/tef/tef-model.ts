// Port of TuxGuitar app.tuxguitar.io.tef3.base (TESong, TESongMetadata, TELyrics, TEChordDefinition, TEMeasure, TETrack,
// TEPosition and the TEComponent classes the song is built from) (LGPL-2.1): a TablEdit file as read.
import type { TimeSignature } from '../../model/song';
import type { TeFileMetadata } from './tef-header';

export interface TeLyrics {
  /** 0-based track ("A" = 0). */
  readonly trackIndex: number;
  readonly text: string;
}

export interface TeSongMetadata {
  readonly title: string;
  readonly author: string;
  readonly comments: string;
  readonly copyright: string;
  readonly lyrics: readonly TeLyrics[];
  readonly textEvents: readonly string[];
}

export interface TeChordDefinition {
  /** Fret per string, first string first (seven strings). */
  readonly frets: readonly number[];
  readonly name: string;
}

export interface TeMeasure {
  /** Sharps (+) or flats (-). */
  readonly keySignature: number;
  readonly timeSignature: TimeSignature;
}

/** TETrack.getIsPercussion: TablEdit's drum instrument. */
export const TE_PERCUSSION_PROGRAM = 96;

/** TETrack.TETrackClef values the song keeps (anything else is the default treble clef). */
export const TE_CLEF = { TREBLE: 1, BASS: 2, TENOR: 4, ALTO: 5 } as const;

export interface TeTrack {
  readonly stringCount: number;
  /** MIDI program; 96 marks a drum track (TETrack.getIsPercussion). */
  readonly midiInstrument: number;
  readonly capo: number;
  /** One of TETrack.TETrackClef. */
  readonly clef: number;
  /** 0–15, 7 = centre. */
  readonly pan: number;
  /** 0 = loudest … 15. */
  readonly volume: number;
  /** Per string, first string first: 96 minus the sounding open-string pitch (the capo included). */
  readonly tuning: readonly number[];
  readonly name: string;
}

/** TEPosition: where a component sits; `position` counts sixty-fourth notes from the measure start. */
export interface TePosition {
  readonly measure: number;
  readonly position: number;
  /** String within the track, 0 = first string. */
  readonly string: number;
  readonly trackIndex: number;
}

/** TEComponentNote: the raw fields the song uses. */
export interface TeNote {
  readonly kind: 'note';
  readonly at: TePosition;
  readonly fret: number;
  readonly isGraceNote: boolean;
  /** TENoteDuration value (0–31). */
  readonly duration: number;
  /** TEComponentNoteDynamics (0 = fff … 7 = ppp, which TablEdit also uses to mark a tie). */
  readonly dynamics: number;
  readonly effect1: number;
  /** TEComponentNoteAttributes: 2 = upper voice, 3 = lower voice. */
  readonly attributes: number;
  readonly graceNoteEffect: number;
  readonly graceNoteFret: number;
  readonly effect2: number;
  readonly effect3: number;
  readonly stroke: number;
  readonly isTied: boolean;
}

export interface TeRest {
  readonly kind: 'rest';
  readonly at: TePosition;
  readonly duration: number;
  readonly isLowerVoice: boolean;
}

export interface TeChord {
  readonly kind: 'chord';
  readonly at: TePosition;
  readonly chordIndex: number;
}

/** TEComponentGraceNoteMetadata: more about the grace note of the previous note on the string. */
export interface TeGraceNoteMetadata {
  readonly kind: 'graceMetadata';
  readonly at: TePosition;
  /** TEComponentGraceNoteMetadataDuration (2 = 32nd, 3 = 16th, 4–6 = eighth, quarter, half). */
  readonly duration: number;
  /** The grace note's fret when it does not fit the note's five bits; 0 = unused. */
  readonly doubleNoteOne: number;
}

export interface TeTextEvent {
  readonly kind: 'text';
  readonly at: TePosition;
  readonly textIndex: number;
}

export interface TeTempoChange {
  readonly kind: 'tempo';
  readonly at: TePosition;
  readonly bpm: number;
}

export interface TeEnding {
  readonly kind: 'ending';
  readonly at: TePosition;
  readonly endingNumber: number;
  readonly isOpenBracket: boolean;
  readonly isCloseBracket: boolean;
}

export type TeComponent = TeNote | TeRest | TeChord | TeGraceNoteMetadata | TeTextEvent | TeTempoChange | TeEnding;

/** TEComponentBase.getSortOrder of each kind kept: components at one position are handled in this order. */
const TE_SORT_ORDER: Readonly<Record<TeComponent['kind'], number>> = {
  note: 0,
  chord: 10,
  rest: 20,
  graceMetadata: 30,
  tempo: 40,
  text: 60,
  ending: 130,
};

export interface TeSong {
  readonly fileMetadata: TeFileMetadata;
  readonly songMetadata: TeSongMetadata;
  readonly chordDefinitions: readonly TeChordDefinition[];
  readonly measures: readonly TeMeasure[];
  readonly tracks: readonly TeTrack[];
  readonly components: readonly TeComponent[];
}

/** TESongParser.sortComponents: by measure, then position, then kind (stable). */
export function sortComponents(components: readonly TeComponent[]): readonly TeComponent[] {
  return [...components].sort(
    (a, b) => a.at.measure - b.at.measure || a.at.position - b.at.position || TE_SORT_ORDER[a.kind] - TE_SORT_ORDER[b.kind],
  );
}
