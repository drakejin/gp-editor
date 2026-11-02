// Tuning presets after TuxGuitar's common/resources/tunings/tunings.xml (LGPL-2.1): its 6-string guitar, 4-string bass
// and ukulele groups, named for the app.
import { GM_BANJO_PROGRAM, isGmBassProgram } from '../formats/common/channels';
import { isGuitarProgram, isKeyboardProgram, isUkuleleTuning } from '../formats/common/instrument-sets';
import { STANDARD_BASS_TUNING, STANDARD_TUNING } from '../model/defaults';
import type { Channel, Song, Track } from '../model/song';
import { isFiveStringBanjo } from './banjo';
import { isVoiceName } from './track-properties';

/**
 * What a track is, as Guitar Pro 7/8 give a track one instrument (the kinds of Add Track and of a changed instrument):
 * a stringed instrument whose strings are its own (guitar, bass, banjo, ukulele), one whose strings only hold its notes
 * (keys, vocals, any other instrument), or drums.
 */
export type Instrument = 'percussion' | 'guitar' | 'bass' | 'banjo' | 'ukulele' | 'keys' | 'vocals' | 'other';

/** A stringed instrument: its strings are its own, tuned to its presets. */
export type NeckInstrument = 'guitar' | 'bass' | 'banjo' | 'ukulele';

/** True for the stringed instruments, which have tuning presets. */
export function isNeckInstrument(instrument: Instrument): instrument is NeckInstrument {
  return instrument === 'guitar' || instrument === 'bass' || instrument === 'banjo' || instrument === 'ukulele';
}

export interface TuningPreset {
  /** Unique across instruments, e.g. "guitar-drop-d". */
  readonly id: string;
  /** Name shown in the app. */
  readonly name: string;
  readonly instrument: NeckInstrument;
  /** Open-string MIDI pitches, string 1 (highest) first, as GuitarString.tuning. */
  readonly tuning: readonly number[];
}

function preset(instrument: NeckInstrument, key: string, name: string, tuning: readonly number[]): TuningPreset {
  return { id: `${instrument}-${key}`, name, instrument, tuning };
}

/** The 5-string banjo's open G (g D G B D): the short 5th string, string 5, is the high g. */
const BANJO_OPEN_G: readonly number[] = [62, 59, 55, 50, 67];

/** The ukulele's re-entrant G C E A: string 4, the high g, above string 3. */
const UKULELE_STANDARD: readonly number[] = [69, 64, 60, 67];

/** Every preset in menu order: guitar, bass, banjo, then ukulele, standard (banjo: open G) first. */
export const TUNING_PRESETS: readonly TuningPreset[] = [
  preset('guitar', 'standard', 'Standard', STANDARD_TUNING),
  preset('guitar', 'drop-d', 'Drop D', [64, 59, 55, 50, 45, 38]),
  preset('guitar', 'e-flat-standard', 'E♭ standard', [63, 58, 54, 49, 44, 39]),
  preset('guitar', 'd-standard', 'D standard', [62, 57, 53, 48, 43, 38]),
  preset('guitar', 'drop-c-sharp', 'Drop C♯', [63, 58, 54, 49, 44, 37]),
  preset('guitar', 'drop-c', 'Drop C', [62, 57, 53, 48, 43, 36]),
  preset('guitar', 'c-standard', 'C standard', [60, 55, 51, 46, 41, 36]),
  preset('guitar', 'drop-b', 'Drop B', [61, 56, 52, 47, 42, 35]),
  preset('guitar', 'b-standard', 'B standard', [59, 54, 50, 45, 40, 35]),
  preset('guitar', 'open-g', 'Open G', [62, 59, 55, 50, 43, 38]),
  preset('guitar', 'open-d', 'Open D', [62, 57, 54, 50, 45, 38]),
  preset('guitar', 'dadgad', 'DADGAD', [62, 57, 55, 50, 45, 38]),
  preset('bass', 'standard', 'Standard', STANDARD_BASS_TUNING),
  preset('bass', 'drop-d', 'Drop D', [43, 38, 33, 26]),
  preset('bass', 'e-flat-standard', 'E♭ standard', [42, 37, 32, 27]),
  preset('bass', 'd-standard', 'D standard', [41, 36, 31, 26]),
  preset('bass', 'drop-c', 'Drop C', [41, 36, 31, 24]),
  preset('bass', 'beade', 'B E A D', [38, 33, 28, 23]),
  preset('banjo', 'open-g', 'Open G', BANJO_OPEN_G),
  preset('banjo', 'double-c', 'Double C', [62, 60, 55, 48, 67]),
  preset('banjo', 'open-d', 'Open D', [62, 57, 54, 50, 66]),
  preset('banjo', 'g-modal', 'G modal', [62, 60, 55, 50, 67]),
  preset('banjo', 'tenor', 'Tenor', [69, 62, 55, 48]),
  preset('banjo', 'irish-tenor', 'Irish tenor', [64, 57, 50, 43]),
  preset('banjo', 'plectrum', 'Plectrum', [62, 59, 55, 48]),
  // TuxGuitar calls low G "Tenor". Its baritone (D G B E) is no preset: tuned like a guitar's top strings, it reads as
  // a 4-string guitar (isUkuleleTuning), so it stays a choice for a new ukulele (track-kinds.ts).
  preset('ukulele', 'standard', 'Standard', UKULELE_STANDARD),
  preset('ukulele', 'low-g', 'Low G', [69, 64, 60, 55]),
];

/** Highest open string a bass tuning has: the high C3 of a 6-string bass. */
const BASS_HIGHEST_OPEN_STRING = 48;
const BASS_MAX_STRINGS = 6;

/** The instrument's presets in menu order; none for percussion, keyboards, voices and other instruments. */
export function tuningPresetsFor(instrument: Instrument): readonly TuningPreset[] {
  return TUNING_PRESETS.filter((candidate) => candidate.instrument === instrument);
}

const STANDARD_TUNINGS: Readonly<Record<NeckInstrument, readonly number[]>> = {
  guitar: STANDARD_TUNING,
  bass: STANDARD_BASS_TUNING,
  banjo: BANJO_OPEN_G,
  ukulele: UKULELE_STANDARD,
};

/** The standard tuning of a neck instrument. */
export function standardTuningFor(instrument: NeckInstrument): readonly number[] {
  return STANDARD_TUNINGS[instrument];
}

/** Open-string pitches of a track, string 1 first. */
export function trackTuning(track: Track): readonly number[] {
  return track.strings.map((guitarString) => guitarString.tuning);
}

export function isSameTuning(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((open, i) => open === b[i]);
}

/** The instrument's preset with exactly this tuning, if any. */
export function findTuningPreset(instrument: Instrument, tuning: readonly number[]): TuningPreset | undefined {
  return tuningPresetsFor(instrument).find((candidate) => isSameTuning(candidate.tuning, tuning));
}

/**
 * True when the preset plays standard chord shapes: every string moved by the same amount from standard, except the
 * lowest, which may go further down (a drop tuning). False for open tunings.
 */
export function keepsStandardShapes(tuningPreset: TuningPreset): boolean {
  const standard = standardTuningFor(tuningPreset.instrument);
  const shifts = tuningPreset.tuning.map((open, i) => open - (standard[i] ?? open));
  const first = shifts[0] ?? 0;
  const lowest = shifts[shifts.length - 1] ?? first;
  return shifts.slice(0, -1).every((shift) => shift === first) && lowest <= first;
}

/** True for a tuning that reads as a bass: at most six strings, the highest no higher than C3. */
export function isBassTuning(tuning: readonly number[]): boolean {
  return tuning.length > 0 && tuning.length <= BASS_MAX_STRINGS && Math.max(...tuning) <= BASS_HIGHEST_OPEN_STRING;
}

/** General MIDI 52–54: choir aahs, voice oohs, synth voice. */
const VOICE_PROGRAMS = { first: 52, last: 54 } as const;
/** What a track plays when it has no channel: a steel guitar, as the readers' default channel. */
const DEFAULT_PROGRAM = 25;

/** The General MIDI program the channel plays; a steel guitar for a track without a channel. */
export function channelProgramOf(channels: readonly Channel[], channelId: number | undefined): number {
  return channels.find((channel) => channel.id === channelId)?.program ?? DEFAULT_PROGRAM;
}

/**
 * What a track is: percussion for a drum track; vocals for a voice program or a track named like a voice; a bass by
 * its program; a banjo by its program or a 5-string banjo's strings; on a guitar program a ukulele's strings make a
 * ukulele, a bass's few low strings a bass, any other strings a guitar; pianos and organs keys; everything else other
 * (strings ensemble, winds, a contrabass), whatever strings hold its notes.
 */
export function resolveInstrument(song: Song, track: Track): Instrument {
  return resolveTrackInstrument(track, song.channels);
}

/** resolveInstrument from the track and the song's channels alone. */
export function resolveTrackInstrument(track: Track, channels: readonly Channel[]): Instrument {
  if (track.isPercussion) {
    return 'percussion';
  }
  const program = channelProgramOf(channels, track.channelId);
  const tuning = trackTuning(track);
  if ((program >= VOICE_PROGRAMS.first && program <= VOICE_PROGRAMS.last) || isVoiceName(track.name)) {
    return 'vocals';
  }
  if (isGmBassProgram(program)) {
    return 'bass';
  }
  if (program === GM_BANJO_PROGRAM || isFiveStringBanjo(tuning)) {
    return 'banjo';
  }
  if (isGuitarProgram(program)) {
    return isUkuleleTuning(tuning) ? 'ukulele' : isBassTuning(tuning) ? 'bass' : 'guitar';
  }
  return isKeyboardProgram(program) ? 'keys' : 'other';
}
