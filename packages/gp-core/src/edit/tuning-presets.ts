// Tuning presets after TuxGuitar's common/resources/tunings/tunings.xml (LGPL-2.1): its 6-string guitar and 4-string bass groups, named for the app.
import { GM_BANJO_PROGRAM, isGmBassProgram } from '../formats/common/channels';
import { STANDARD_BASS_TUNING, STANDARD_TUNING } from '../model/defaults';
import type { Channel, Song, Track } from '../model/song';
import { isFiveStringBanjo } from './banjo';

/** What neck a track is shown on: a 6-string guitar, a 4-string bass, a banjo, or none (drums). */
export type Instrument = 'percussion' | 'bass' | 'guitar' | 'banjo';

/** An instrument with a neck. */
export type NeckInstrument = Exclude<Instrument, 'percussion'>;

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

/** Every preset in menu order: guitar, bass, then banjo, standard (banjo: open G) first. */
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
];

/** Highest open string a bass tuning has: the high C3 of a 6-string bass. */
const BASS_HIGHEST_OPEN_STRING = 48;
const BASS_MAX_STRINGS = 6;

/** The instrument's presets in menu order; none for percussion. */
export function tuningPresetsFor(instrument: Instrument): readonly TuningPreset[] {
  return TUNING_PRESETS.filter((candidate) => candidate.instrument === instrument);
}

/** The standard tuning of a neck instrument. */
export function standardTuningFor(instrument: NeckInstrument): readonly number[] {
  return instrument === 'bass' ? STANDARD_BASS_TUNING : instrument === 'banjo' ? BANJO_OPEN_G : STANDARD_TUNING;
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

/**
 * The neck a track is shown on. Percussion tracks have none. A track is a bass when its channel plays a General MIDI
 * bass (programs 32–39), a banjo when it plays the GM banjo (105) or has a 5-string banjo's tuning (isFiveStringBanjo),
 * else a bass when its strings are tuned like one (isBassTuning). Every other pitched track — strings ensemble, choir,
 * piano, 7-string guitar — is shown on a guitar neck.
 */
export function resolveInstrument(song: Song, track: Track): Instrument {
  return resolveTrackInstrument(track, song.channels);
}

/** resolveInstrument from the track and the song's channels alone. */
export function resolveTrackInstrument(track: Track, channels: readonly Channel[]): Instrument {
  if (track.isPercussion) {
    return 'percussion';
  }
  const program = channels.find((channel) => channel.id === track.channelId)?.program;
  if (program !== undefined && isGmBassProgram(program)) {
    return 'bass';
  }
  const tuning = trackTuning(track);
  if (program === GM_BANJO_PROGRAM || isFiveStringBanjo(tuning)) {
    return 'banjo';
  }
  return isBassTuning(tuning) ? 'bass' : 'guitar';
}
