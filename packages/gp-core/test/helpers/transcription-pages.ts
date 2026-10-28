import type {
  TranscribedBeat,
  TranscribedDuration,
  TranscribedMeasure,
  TranscribedNote,
  TranscribedTrack,
  TranscriptionPage,
} from '../../src/transcription/types';

/** Small hand-written transcriptions, shaped like what a model returns for one page. */

export const GUITAR: TranscribedTrack = { name: 'Guitar', instrument: 'guitar', tuning: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'], capo: 0 };
export const BASS: TranscribedTrack = { name: 'Bass', instrument: 'bass', tuning: ['E1', 'A1', 'D2', 'G2'], capo: 0 };
export const DRUMS: TranscribedTrack = { name: 'Drums', instrument: 'drums', tuning: [], capo: 0 };
export const VOCALS: TranscribedTrack = { name: 'Vocals', instrument: 'vocals', tuning: [], capo: 0 };
/** A grand staff: the upper staff (right hand) and the lower staff (left hand), each a track of its own. */
export const PIANO_RIGHT: TranscribedTrack = { name: 'Piano (right hand)', instrument: 'keys', tuning: [], capo: 0, clef: 'treble' };
export const PIANO_LEFT: TranscribedTrack = { name: 'Piano (left hand)', instrument: 'keys', tuning: [], capo: 0, clef: 'bass' };

/** A note on a drum staff: the drum played, by its General MIDI percussion name. */
export function drum(name: string, extra: Omit<TranscribedNote, 'drum'> = {}): TranscribedNote {
  return { drum: name, ...extra };
}

/** A note from a tab staff. */
export function tab(string: number, fret: number, extra: Omit<TranscribedNote, 'string' | 'fret'> = {}): TranscribedNote {
  return { string, fret, ...extra };
}

/** A note from a staff without tab: its written pitch. */
export function written(pitch: string, extra: Omit<TranscribedNote, 'pitch'> = {}): TranscribedNote {
  return { pitch, ...extra };
}

export function play(duration: TranscribedDuration, ...notes: TranscribedNote[]): TranscribedBeat {
  return { duration, notes };
}

export function rest(duration: TranscribedDuration): TranscribedBeat {
  return { duration, rest: true };
}

/** A measure with one part, for track 0, plus any measure fields. */
export function bar(beats: readonly TranscribedBeat[], extra: Omit<TranscribedMeasure, 'parts'> = {}): TranscribedMeasure {
  return { ...extra, parts: [{ track: 0, beats }] };
}

/** A page with the guitar track (unless `extra` says otherwise). */
export function page(measures: readonly TranscribedMeasure[], extra: Omit<TranscriptionPage, 'measures'> = { tracks: [GUITAR] }): TranscriptionPage {
  return { ...extra, measures };
}

/** `count` beats of the same duration on one string, frets 0, 1, 2 … */
export function run(duration: TranscribedDuration, count: number, string = 1): TranscribedBeat[] {
  return Array.from({ length: count }, (_, fret) => play(duration, tab(string, fret)));
}
