// Guitar Pro 7/8's instrument sets (no TuxGuitar counterpart): how Guitar Pro presents a General MIDI program — the
// `<InstrumentSet>` the .gp writer writes and the track icon (`<IconId>`) it gives an instrument.
import { GM_BANJO_PROGRAM, gmFamilyIndex, isGmBassProgram } from './channels';
import { TRACK_ICON_IDS } from './track-icons';

/** How Guitar Pro presents a track's instrument: its instrument set, icon and playing style. */
export interface InstrumentSet {
  readonly name: string;
  readonly type: string;
  /** Guitar Pro's icon id for it (`TRACK_ICON_IDS`). */
  readonly iconId: number;
  readonly isStringed: boolean;
}

const ICON = TRACK_ICON_IDS;

/** [instrument set name, Guitar Pro icon id] per General MIDI family (program / 8). */
const FAMILY_SETS: readonly (readonly [string, number])[] = [
  ['Acoustic Piano', ICON.keyboard], ['Vibraphone', ICON.mallets], ['Electric Organ', ICON.keyboard], ['Electric Guitar', ICON.electricGuitar],
  ['Electric Bass', ICON.bass], ['Violin', ICON.strings], ['Violin', ICON.strings], ['Trumpet', ICON.brass],
  ['Saxophone', ICON.reeds], ['Flute', ICON.flute], ['Lead Synthesizer', ICON.synthesizer], ['Pad Synthesizer', ICON.synthesizer],
  ['Pad Synthesizer', ICON.other], ['Banjo', ICON.banjo], ['Xylophone', ICON.percussion], ['Pad Synthesizer', ICON.other],
];

/** Programs whose instrument set differs from their family's. */
const PROGRAM_SETS: ReadonlyMap<number, readonly [string, number]> = new Map([
  [24, ['Nylon Guitar', ICON.nylonGuitar]],
  [25, ['Steel Guitar', ICON.steelGuitar]],
  [32, ['Acoustic Bass', ICON.bass]],
  [35, ['Acoustic Bass', ICON.bass]],
  [41, ['Viola', ICON.strings]],
  [42, ['Cello', ICON.strings]],
  [43, ['Contrabass', ICON.strings]],
  [46, ['Harp', ICON.keyboard]],
  [47, ['Timpani', ICON.timpani]],
  [52, ['Voice', ICON.voice]],
  [53, ['Voice', ICON.voice]],
  [54, ['Voice', ICON.voice]],
]);
const DRUM_SET: InstrumentSet = { name: 'Drums', type: 'drumKit', iconId: ICON.drums, isStringed: false };
const GUITAR_FAMILY = 3;

/** "Steel Guitar" → "steelGuitar", as Guitar Pro types its instrument sets. */
function typeOf(name: string): string {
  const [first = '', ...rest] = name.split(' ');
  return [first.charAt(0).toLowerCase() + first.slice(1), ...rest].join('');
}

/** The instrument set Guitar Pro gives a General MIDI program (the drum kit for a percussion track). */
export function instrumentSetOf(program: number, isPercussion: boolean): InstrumentSet {
  if (isPercussion) {
    return DRUM_SET;
  }
  const family = gmFamilyIndex(program);
  const [name, iconId] = PROGRAM_SETS.get(program) ?? FAMILY_SETS[family] ?? ['Steel Guitar', ICON.steelGuitar];
  return { name, type: typeOf(name), iconId, isStringed: family === GUITAR_FAMILY || isGmBassProgram(program) };
}

/** General MIDI program 43: the contrabass, written an octave above its sound like the guitars and basses. */
const CONTRABASS_PROGRAM = 43;
/** Semitones in the octave the guitars are written above their sound. */
const WRITTEN_OCTAVE = 12;
/** A ukulele's strings (the Add Track ukulele's standard and low-G tunings: none below G3). */
const UKULELE_STRINGS = 4;
const UKULELE_LOWEST_OPEN = 55;

/** A guitar sound on four strings tuned G3 or higher: a ukulele (General MIDI has none; the app plays it as a guitar). */
function isUkuleleTuning(tuning: readonly number[]): boolean {
  return tuning.length === UKULELE_STRINGS && tuning.every((open) => open >= UKULELE_LOWEST_OPEN);
}

/**
 * Semitones a track's notes are written above their sound: an octave for the guitars, the basses (General MIDI 24–39),
 * the banjo and the contrabass, none for every other instrument, for drums and for a ukulele (a guitar sound on a
 * ukulele's strings, `tuning` string 1 first), whose music is written where it sounds — as Guitar Pro writes them
 * (alphaTab, the tests' independent reader, gives Guitar Pro 3–5 tracks the same display transposition by program:
 * `GeneralMidi.isGuitar`). The score, the MusicXML writer and the PDF import's builder all take it from here.
 */
export function writtenTransposition(program: number, isPercussion: boolean, tuning: readonly number[]): number {
  const isGuitar = gmFamilyIndex(program) === GUITAR_FAMILY && !isUkuleleTuning(tuning);
  const isWrittenOctaveUp = isGuitar || isGmBassProgram(program) || program === GM_BANJO_PROGRAM || program === CONTRABASS_PROGRAM;
  return !isPercussion && isWrittenOctaveUp ? WRITTEN_OCTAVE : 0;
}
