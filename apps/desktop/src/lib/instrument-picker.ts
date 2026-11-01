import {
  GM_INSTRUMENT_FAMILIES,
  type InstrumentChange,
  type InstrumentChoice,
  type InstrumentPlan,
  type Song,
  type Track,
  type TrackKind,
  gmFamilyIndex,
  isSameTuning,
  planInstrumentChange,
  setTrackInstrument,
  trackTuning,
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
 * True when picking `choice` changes what the track is — its strings, tuning or clef (another kind, when `setsTrack`),
 * or drums ↔ a pitched instrument —, not only its sound: the picker closes after it, as trying another instrument would
 * change the track again.
 */
export function isKindChange(song: Song, trackIndex: number, choice: InstrumentChoice, setsTrack: boolean): boolean {
  const plan = planInstrumentChange(song, trackIndex, choice);
  return plan !== undefined && (isDrumChange(plan) || (setsTrack && (plan.tuning !== undefined || plan.clef !== undefined)));
}

/**
 * What picking `choice` does to the track beyond its sound, for its row ("Bass · 4 strings · E A D G · 1 note moved an
 * octave"): another kind's strings when `setsTrack`, a change between drums and a pitched instrument always, and what
 * the change could not keep, as picking it would (setTrackInstrument tried on the song). Undefined when only the sound
 * changes.
 */
export function choiceDetail(song: Song, trackIndex: number, choice: InstrumentChoice, setsTrack: boolean): string | undefined {
  const plan = planInstrumentChange(song, trackIndex, choice);
  if (plan === undefined || !isKindChange(song, trackIndex, choice, setsTrack)) {
    return undefined;
  }
  const change = setTrackInstrument(song, trackIndex, choice, { keepsTrack: !setsTrack });
  const strings = plan.tuning === undefined || plan.to === 'drums' ? [] : [t('common.strings', { count: plan.tuning.length }), tuningLabel(plan.tuning)];
  const losses = [
    ...(change.octaveShifted > 0 ? [t('window.picker.octaveMoved', { notes: notes(change.octaveShifted) })] : []),
    ...(change.removed > 0 ? [t('window.picker.leftOut', { notes: notes(change.removed) })] : []),
    ...(change.notesRemoved > 0 ? [t('window.picker.notesOut', { notes: notes(change.notesRemoved) })] : []),
  ];
  return [trackKindName(plan.to), ...strings, ...losses].join(' · ');
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
    : t('window.picker.askNotes', { instrument: choiceLabel(choice), track: track.name, count: plan.notesLost });
}

const KIND_IN_SENTENCE: Readonly<Record<Exclude<TrackKind, 'drums' | 'other'>, MessageKey>> = {
  guitar: 'tools.instrument.kind.guitar',
  bass: 'tools.instrument.kind.bass',
  banjo: 'tools.instrument.kind.banjo',
  ukulele: 'tools.instrument.kind.ukulele',
  keys: 'tools.instrument.kind.keys',
};

/** True when the track's strings, clef or drums changed between `before` and `after`: it is another kind of track now. */
function isTrackKindChanged(before: Track, after: Track): boolean {
  return before.isPercussion !== after.isPercussion || !isSameTuning(trackTuning(before), trackTuning(after)) || before.measures[0]?.clef !== after.measures[0]?.clef;
}

/** "“Lead” is now a bass track: 4 strings, E A D G." / "… a drum track." / "… now plays as Oboe: …", from what the track has now. */
function becameSentence(name: string, kind: TrackKind, track: Track, program: number | undefined): string {
  if (track.isPercussion) {
    return t('tools.instrument.nowDrums', { track: name });
  }
  const tuning = trackTuning(track);
  const strings = t('common.strings', { count: tuning.length });
  if (kind === 'drums' || kind === 'other') {
    return t('tools.instrument.nowPlays', { track: name, instrument: program === undefined ? '' : gmProgramName(program), strings, tuning: tuningLabel(tuning) });
  }
  return t('tools.instrument.now', { track: name, kind: t(KIND_IN_SENTENCE[kind]), strings, tuning: tuningLabel(tuning) });
}

/**
 * The hint strip's words after an instrument was chosen for the track of `before`: what the track became (from what
 * actually changed: strings, tuning, clef, drums), the notes taken out, what its new strings could not keep
 * (retuneNotice). Undefined when only the sound changed.
 */
export function instrumentChangeHint(before: Song, trackIndex: number, plan: InstrumentPlan, change: InstrumentChange): string | undefined {
  const old = before.tracks[trackIndex];
  const now = change.song.tracks[trackIndex];
  if (old === undefined || now === undefined) {
    return undefined;
  }
  const after = trackChoice(change.song, trackIndex);
  const parts = [
    isTrackKindChanged(old, now) ? becameSentence(old.name, plan.to, now, typeof after === 'number' ? after : undefined) : undefined,
    change.notesRemoved > 0 ? t('tools.instrument.notesOut', { notes: notes(change.notesRemoved) }) : undefined,
    retuneNotice(change),
  ];
  const said = parts.filter((part): part is string => part !== undefined);
  return said.length === 0 ? undefined : said.join(' ');
}
