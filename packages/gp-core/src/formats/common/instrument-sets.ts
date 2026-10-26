// Guitar Pro 7/8's instrument sets (no TuxGuitar counterpart): how Guitar Pro presents a General MIDI program — the
// `<InstrumentSet>` the .gp writer writes and the track icon (`<IconId>`) it gives an instrument.
import { gmFamilyIndex, isGmBassProgram } from './channels';
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
