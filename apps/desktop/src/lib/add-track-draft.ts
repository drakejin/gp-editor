import {
  GM_INSTRUMENT_FAMILIES,
  GM_INSTRUMENT_NAMES,
  MAX_CAPO,
  type NewTrack,
  type TrackKind,
  type TrackTuningChoice,
  gmFamilyIndex,
  trackKindSpec,
  trackTuningChoices,
} from '@gp-editor/core';

/** What the Add Track panel (Track ▸ Add Track…) has chosen so far. */
export interface AddTrackDraft {
  readonly kind: TrackKind;
  /** 0 for drums. */
  readonly stringCount: number;
  /** A TrackTuningChoice id of the kind and string count; empty for drums. */
  readonly tuningId: string;
  /** General MIDI program (unused for drums). */
  readonly program: number;
  /** As typed; blank: defaultTrackName. */
  readonly name: string;
  readonly capo: number;
}

/** Programs of one General MIDI family. */
const FAMILY_SIZE = 8;

function draftOf(kind: TrackKind, name: string, capo: number): AddTrackDraft {
  const spec = trackKindSpec(kind);
  const stringCount = spec?.stringCounts[0] ?? 0;
  const tuningId = trackTuningChoices(kind, stringCount)[0]?.id ?? '';
  return { kind, stringCount, tuningId, program: spec?.program ?? 0, name, capo: kind === 'drums' ? 0 : capo };
}

/** A 6-string guitar in standard tuning, its default sound, no capo. */
export function initialAddTrackDraft(): AddTrackDraft {
  return draftOf('guitar', '', 0);
}

/** Another kind: its first string count, tuning and its sound; the typed name stays, and the capo (none for drums). */
export function withKind(draft: AddTrackDraft, kind: TrackKind): AddTrackDraft {
  return kind === draft.kind ? draft : draftOf(kind, draft.name, draft.capo);
}

/** Another string count of the kind, on its first tuning; the same draft for a count the kind does not have. */
export function withStringCount(draft: AddTrackDraft, stringCount: number): AddTrackDraft {
  const first = trackTuningChoices(draft.kind, stringCount)[0];
  return first === undefined || stringCount === draft.stringCount ? draft : { ...draft, stringCount, tuningId: first.id };
}

/** The tunings the draft's kind and string count offer. */
export function tuningChoices(draft: AddTrackDraft): readonly TrackTuningChoice[] {
  return trackTuningChoices(draft.kind, draft.stringCount);
}

export function draftTuning(draft: AddTrackDraft): TrackTuningChoice | undefined {
  return tuningChoices(draft).find((choice) => choice.id === draft.tuningId);
}

/** Another tuning of the same string count; the same draft for one it does not offer. */
export function withTuning(draft: AddTrackDraft, tuningId: string): AddTrackDraft {
  return tuningChoices(draft).some((choice) => choice.id === tuningId) ? { ...draft, tuningId } : draft;
}

/** The eight sounds of the program's General MIDI family; none for drums (their kit is the percussion bank's). */
export function soundChoices(draft: AddTrackDraft): readonly number[] {
  const first = gmFamilyIndex(draft.program) * FAMILY_SIZE;
  return draft.kind === 'drums' ? [] : Array.from({ length: FAMILY_SIZE }, (_, index) => first + index);
}

export function withProgram(draft: AddTrackDraft, program: number): AddTrackDraft {
  return Number.isInteger(program) && program >= 0 && program < GM_INSTRUMENT_NAMES.length ? { ...draft, program } : draft;
}

/** "Other": the first sound of another General MIDI family. */
export function withFamily(draft: AddTrackDraft, familyIndex: number): AddTrackDraft {
  return Number.isInteger(familyIndex) && familyIndex >= 0 && familyIndex < GM_INSTRUMENT_FAMILIES.length ? { ...draft, program: familyIndex * FAMILY_SIZE } : draft;
}

/** The capo a fret up or down, within 0…MAX_CAPO. */
export function shiftDraftCapo(draft: AddTrackDraft, delta: number): AddTrackDraft {
  return { ...draft, capo: Math.min(MAX_CAPO, Math.max(0, draft.capo + delta)) };
}

/** The name the track gets while none is typed: the kind's, an "other" track's General MIDI instrument. */
export function defaultTrackName(draft: AddTrackDraft): string {
  const spec = trackKindSpec(draft.kind);
  return draft.kind === 'other' ? (GM_INSTRUMENT_NAMES[draft.program] ?? spec?.name ?? '') : (spec?.name ?? '');
}

/** gp-core's NewTrack for the draft. */
export function toNewTrack(draft: AddTrackDraft): NewTrack {
  const typed = draft.name.trim();
  const name = typed === '' ? undefined : typed;
  if (draft.kind === 'drums') {
    return { kind: 'drums', name };
  }
  return { kind: draft.kind, name, program: draft.program, tuning: draftTuning(draft)?.tuning, capo: draft.capo };
}
