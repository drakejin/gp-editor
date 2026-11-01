import {
  GM_INSTRUMENT_FAMILIES,
  type InstrumentChange,
  type InstrumentChoice,
  type InstrumentPlan,
  type Song,
  type TrackKind,
  gmFamilyIndex,
  planInstrumentChange,
} from '@gp-editor/core';
import { type MessageKey, t } from './i18n/i18n';
import { gmFamilyName, gmProgramName, trackInstrument, trackKindName } from './instruments';
import { tuningLabel } from './pitch';
import { retuneNotice } from './tuning-hint';

// The instrument picker's families and instruments (the 16 General MIDI families, then the drum kit) and its words:
// what picking an instrument makes of the track (gp-core's planInstrumentChange), asked first when notes go.

/** General MIDI programs in a family. */
const FAMILY_SIZE = 8;
/** The drums come after the General MIDI families: the kit is no program but the percussion bank. */
export const DRUMS_FAMILY_INDEX = GM_INSTRUMENT_FAMILIES.length;
export const PICKER_FAMILY_COUNT = DRUMS_FAMILY_INDEX + 1;

export function familyLabel(familyIndex: number): string {
  return familyIndex === DRUMS_FAMILY_INDEX ? t('instruments.drums') : gmFamilyName(familyIndex);
}

/** The family's instruments: its 8 General MIDI programs, or the drum kit. */
export function familyChoices(familyIndex: number): readonly InstrumentChoice[] {
  return familyIndex === DRUMS_FAMILY_INDEX ? ['drums'] : Array.from({ length: FAMILY_SIZE }, (_, index) => familyIndex * FAMILY_SIZE + index);
}

export function familyOf(choice: InstrumentChoice): number {
  return choice === 'drums' ? DRUMS_FAMILY_INDEX : gmFamilyIndex(choice);
}

export function choiceLabel(choice: InstrumentChoice): string {
  return choice === 'drums' ? t('instruments.drumKit') : gmProgramName(choice);
}

/** What the track plays now: its channel's program, or the drum kit; undefined without the track or its channel. */
export function trackChoice(song: Song, trackIndex: number): InstrumentChoice | undefined {
  const instrument = trackInstrument(song, trackIndex);
  return instrument === undefined ? undefined : instrument.isPercussion ? 'drums' : instrument.program;
}

const isDrumChange = (plan: InstrumentPlan): boolean => (plan.from === 'drums') !== (plan.to === 'drums');

/** The notes that go, counted ("2 notes"). */
const notes = (count: number): string => t('common.notes', { count });

/**
 * What picking `choice` does to the track beyond its sound, for its row ("Bass · 4 strings · E A D G"): another kind's
 * strings when `setsTrack`, the notes a change between drums and a pitched instrument takes out always. Undefined when
 * only the sound changes.
 */
export function choiceDetail(song: Song, trackIndex: number, choice: InstrumentChoice, setsTrack: boolean): string | undefined {
  const plan = planInstrumentChange(song, trackIndex, choice);
  if (plan === undefined || (!isDrumChange(plan) && (!setsTrack || plan.tuning === undefined))) {
    return undefined;
  }
  const strings = plan.tuning === undefined || plan.to === 'drums' ? [] : [t('common.strings', { count: plan.tuning.length }), tuningLabel(plan.tuning)];
  const lost = plan.notesLost > 0 ? [t('window.picker.notesOut', { notes: notes(plan.notesLost) })] : [];
  return [trackKindName(plan.to), ...strings, ...lost].join(' · ');
}

/** True when an instrument of the family would give a pitched track other strings: the picker offers to keep them. */
export function canFamilyChangeStrings(song: Song, trackIndex: number, familyIndex: number): boolean {
  return familyChoices(familyIndex).some((choice) => {
    const plan = planInstrumentChange(song, trackIndex, choice);
    return plan !== undefined && !isDrumChange(plan) && plan.tuning !== undefined;
  });
}

/** The question before a change that takes the track's notes out; undefined when it takes none. */
export function notesLostQuestion(song: Song, trackIndex: number, choice: InstrumentChoice): string | undefined {
  const plan = planInstrumentChange(song, trackIndex, choice);
  const track = song.tracks[trackIndex];
  return plan === undefined || track === undefined || plan.notesLost === 0
    ? undefined
    : t('window.picker.askNotes', { instrument: choiceLabel(choice), track: track.name, notes: notes(plan.notesLost) });
}

const KIND_IN_SENTENCE: Readonly<Record<Exclude<TrackKind, 'drums'>, MessageKey>> = {
  guitar: 'tools.instrument.kind.guitar',
  bass: 'tools.instrument.kind.bass',
  banjo: 'tools.instrument.kind.banjo',
  ukulele: 'tools.instrument.kind.ukulele',
  keys: 'tools.instrument.kind.keys',
  other: 'tools.instrument.kind.other',
};

/** "“Lead” is now a bass track: 4 strings, E A D G." / "… a drum track."; undefined when the track stayed what it was. */
function becameSentence(name: string, plan: InstrumentPlan, program: number | undefined): string | undefined {
  if (plan.to === 'drums') {
    return t('tools.instrument.nowDrums', { track: name });
  }
  if (plan.tuning === undefined) {
    return undefined;
  }
  const kind = t(KIND_IN_SENTENCE[plan.to], { instrument: program === undefined ? '' : gmProgramName(program) });
  return t('tools.instrument.now', { track: name, kind, strings: t('common.strings', { count: plan.tuning.length }), tuning: tuningLabel(plan.tuning) });
}

/**
 * The hint strip's words after an instrument was chosen for the track of `before`: what the track became, the notes
 * taken out, what its new strings could not keep (retuneNotice). Undefined when only the sound changed.
 */
export function instrumentChangeHint(before: Song, trackIndex: number, plan: InstrumentPlan, change: InstrumentChange): string | undefined {
  const name = before.tracks[trackIndex]?.name ?? '';
  const isTrackChanged = change.song.tracks[trackIndex] !== before.tracks[trackIndex] && (plan.from !== plan.to || isDrumChange(plan));
  const after = trackChoice(change.song, trackIndex);
  const parts = [
    isTrackChanged ? becameSentence(name, plan, typeof after === 'number' ? after : undefined) : undefined,
    change.notesRemoved > 0 ? t('tools.instrument.notesOut', { notes: notes(change.notesRemoved) }) : undefined,
    retuneNotice(change),
  ];
  const said = parts.filter((part): part is string => part !== undefined);
  return said.length === 0 ? undefined : said.join(' ');
}
