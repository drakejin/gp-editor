import { type TrackKind, trackKindSpec } from '../edit/track-kinds';
import { trackKindClef } from '../edit/tracks';
import type { Clef } from '../model/song';
import type { TranscribedInstrument, TranscribedTrack } from './types';

/**
 * Each transcribed instrument as the Add Track panel's kind (edit/track-kinds.ts: its default program, strings and
 * tunings); a sung part is an "other" track on a voice.
 */
const TRACK_KIND_OF: Readonly<Record<TranscribedInstrument, TrackKind>> = {
  guitar: 'guitar',
  bass: 'bass',
  ukulele: 'ukulele',
  banjo: 'banjo',
  drums: 'drums',
  vocals: 'other',
  keys: 'keys',
  other: 'other',
};

/** General MIDI 53, Voice Oohs: what a sung part plays — Guitar Pro's "Voice" instrument set and icon. */
const VOCALS_PROGRAM = 53;

/** Words in a guitar or bass track's name that choose its General MIDI program, the first match winning. */
const NAMED_PROGRAMS: Readonly<Partial<Record<TranscribedInstrument, readonly (readonly [word: string, program: number])[]>>> = {
  guitar: [
    ['nylon', 24],
    ['classical', 24],
    ['jazz', 26],
    ['clean', 27],
    ['mute', 28],
    ['overdrive', 29],
    ['crunch', 29],
    ['distort', 30],
    ['electric', 27],
  ],
  bass: [
    ['acoustic', 32],
    ['upright', 32],
    ['fretless', 35],
    ['slap', 36],
    ['pick', 34],
    ['synth', 38],
  ],
};

export function trackKindOf(instrument: TranscribedInstrument): TrackKind {
  return TRACK_KIND_OF[instrument];
}

/** True for the instruments read from tab, with strings, frets, a tuning and a capo of their own. */
export function isFrettedInstrument(instrument: TranscribedInstrument): boolean {
  const kind = trackKindOf(instrument);
  return kind === 'guitar' || kind === 'bass' || kind === 'ukulele' || kind === 'banjo';
}

/**
 * The General MIDI program a track plays: drums the percussion bank's kit (0); the page's program for any other; else a
 * word of a guitar's or bass's name ("Distortion Guitar" → 30); else the instrument's (a voice for vocals, the Add Track
 * kind's for the rest: steel guitar, fingered bass, nylon guitar for the ukulele, banjo, piano, string ensemble).
 */
export function resolveProgram(track: TranscribedTrack, name: string): number {
  if (track.instrument === 'drums') {
    return 0;
  }
  if (track.program !== undefined) {
    return track.program;
  }
  const lowerName = name.toLowerCase();
  const named = (NAMED_PROGRAMS[track.instrument] ?? []).find(([word]) => lowerName.includes(word))?.[1];
  return named ?? (track.instrument === 'vocals' ? VOCALS_PROGRAM : (trackKindSpec(trackKindOf(track.instrument))?.program ?? 0));
}

/** The track's clef: its kind's for fretted instruments and drums (bass clef for a bass), else the page's, else treble. */
export function resolveClef(track: TranscribedTrack): Clef {
  const kindClef = trackKindClef(trackKindOf(track.instrument));
  return isFrettedInstrument(track.instrument) || track.instrument === 'drums' ? kindClef : (track.clef ?? kindClef);
}
