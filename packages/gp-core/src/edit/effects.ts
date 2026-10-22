// Note effect edits after TuxGuitar's TGMeasureManager setters (setVibrato, changeDeadNote, setBendNote …), with the
// presets of its bend and tremolo bar dialogs (TGBendDialog, TGTremoloBarDialog), LGPL-2.1.
import { BEND_MAX_POSITION, BEND_MAX_VALUE, TREMOLO_BAR_LIMIT } from '../formats/common/bend-units';
import { artificialHarmonicOffset, harmonicFretOffset } from '../formats/common/harmonics';
import { toVibratoFlags, vibratoOf } from '../model/defaults';
import type { Bend, BendPoint, Harmonic, HarmonicType, Note, NoteEffect, SlideType, Song, VibratoKind } from '../model/song';
import type { StringAddress } from './addresses';
import { buildBend, isSameCurve } from './bend-shapes';
import { MAX_FRET } from './edit-song';
import { updateNote } from './song-paths';

export { setNoteTied } from './ties';

/** The on/off note effects an editor toggles. */
export type ToggleableEffect =
  | 'hammer'
  | 'palmMute'
  | 'letRing'
  | 'vibrato'
  | 'deadNote'
  | 'ghostNote'
  | 'accentuatedNote'
  | 'heavyAccentuatedNote'
  | 'staccato'
  | 'tapping'
  | 'slapping'
  | 'popping'
  | 'fadeIn';

/** GP3–GP5 store tapping, slapping and popping as one beat value, so a note has at most one of them. */
const SLAP_EFFECTS: readonly ToggleableEffect[] = ['tapping', 'slapping', 'popping'];

function bendOf(...points: readonly (readonly [position: number, value: number])[]): Bend {
  return { points: points.map(([position, value]) => ({ position, value })) };
}

/** A whole tone, in quarter tones: TGBendDialog's presets bend this far. */
const WHOLE_TONE = 4;
const HALF_TONE = 2;

/** Guitar Pro's usual bends (TGBendDialog's presets, plus a half-tone bend), in quarter tones over positions 0–12. */
export const BEND_PRESETS = {
  half: buildBend('bend', HALF_TONE),
  full: buildBend('bend', WHOLE_TONE),
  bendRelease: buildBend('bendRelease', WHOLE_TONE),
  bendReleaseBend: buildBend('bendReleaseBend', WHOLE_TONE),
  preBend: buildBend('preBend', WHOLE_TONE),
  preBendRelease: buildBend('preBendRelease', WHOLE_TONE),
} as const satisfies Readonly<Record<string, Bend>>;

export type BendPresetName = keyof typeof BEND_PRESETS;

/** TGTremoloBarDialog's presets in quarter tones (TuxGuitar keeps semitones: its ±2 is ±4 here). */
export const TREMOLO_BAR_PRESETS = {
  dip: bendOf([0, 0], [6, -4], [12, 0]),
  dive: bendOf([0, 0], [9, -4], [12, -4]),
  releaseUp: bendOf([0, -4], [9, -4], [12, 0]),
  invertedDip: bendOf([0, 0], [6, 4], [12, 0]),
  return: bendOf([0, 0], [9, 4], [12, 4]),
  releaseDown: bendOf([0, 4], [9, 4], [12, 0]),
} as const satisfies Readonly<Record<string, Bend>>;

export type TremoloBarPresetName = keyof typeof TREMOLO_BAR_PRESETS;

/** Slide kinds in the order the model keeps them. */
const SLIDE_ORDER: readonly SlideType[] = ['shift', 'legato', 'outDownwards', 'outUpwards', 'intoFromBelow', 'intoFromAbove'];

const HARMONIC_TYPES: readonly HarmonicType[] = ['natural', 'artificial', 'tapped', 'pinch', 'semi'];

/** Harmonic types whose `data` means something (artificial: semitone offset, tapped: fret). */
const HARMONICS_WITH_DATA: readonly HarmonicType[] = ['artificial', 'tapped'];

/** The data a new harmonic starts from in TuxGuitar's harmonic dialog: entry 0 of its table, the 12th-fret harmonic. */
const DEFAULT_HARMONIC_ENTRY = 0;

/** The note effects a note may lack (the model leaves them out rather than undefined). */
export type OptionalEffect = 'bend' | 'tremoloBar' | 'harmonic' | 'grace' | 'trill' | 'tremoloPicking';

export type EffectValue<K extends OptionalEffect> = Exclude<NoteEffect[K], undefined>;

/**
 * New song with one optional effect of the addressed note set, or left out when `next` is undefined. Same song when
 * the note already has it (`isSame`) or there is no note.
 */
export function setOptionalEffect<K extends OptionalEffect>(
  song: Song,
  at: StringAddress,
  key: K,
  next: EffectValue<K> | undefined,
  isSame: (current: EffectValue<K>, next: EffectValue<K>) => boolean,
): Song {
  return updateNote(song, at, (note): Note => {
    const current = note.effect[key] as EffectValue<K> | undefined;
    const isUnchanged = current === undefined || next === undefined ? current === next : isSame(current, next);
    if (isUnchanged) {
      return note;
    }
    const { [key]: _removed, ...rest } = note.effect;
    const effect = (next === undefined ? rest : { ...rest, [key]: next }) as NoteEffect;
    return { ...note, effect };
  });
}

/**
 * setOptionalEffect for a value checked first: `normalize` gives the value to store, or undefined when it is invalid,
 * which leaves the song as it is. An undefined value clears the effect.
 */
export function setCheckedEffect<K extends OptionalEffect>(
  song: Song,
  at: StringAddress,
  key: K,
  value: EffectValue<K> | undefined,
  rules: { readonly normalize: (value: EffectValue<K>) => EffectValue<K> | undefined; readonly isSame: (a: EffectValue<K>, b: EffectValue<K>) => boolean },
): Song {
  const next = value === undefined ? undefined : rules.normalize(value);
  return value !== undefined && next === undefined ? song : setOptionalEffect(song, at, key, next, rules.isSame);
}

/** What else an effect turned on clears: tapping, slapping and popping exclude each other; slight vibrato clears wide. */
function clearedBy(effect: ToggleableEffect): Partial<NoteEffect> {
  if (SLAP_EFFECTS.includes(effect)) {
    return { tapping: false, slapping: false, popping: false };
  }
  return effect === 'vibrato' ? { wideVibrato: false } : {};
}

/**
 * New song with one on/off effect of the addressed note switched. A dead note is never tied (changeDeadNote),
 * tapping, slapping and popping exclude each other, and slight vibrato replaces wide vibrato. Same song when there is
 * no note there.
 */
export function toggleNoteEffect(song: Song, at: StringAddress, effect: ToggleableEffect): Song {
  return updateNote(song, at, (note) => {
    const isOn = !note.effect[effect];
    const cleared = isOn ? clearedBy(effect) : {};
    const next: Note = { ...note, effect: { ...note.effect, ...cleared, [effect]: isOn } };
    return effect === 'deadNote' && isOn ? { ...next, isTied: false } : next;
  });
}

/** New song with the note's vibrato set to none, slight or wide (TGMeasureManager.setVibrato). Same song when nothing changes. */
export function setNoteVibrato(song: Song, at: StringAddress, vibrato: VibratoKind): Song {
  return updateNote(song, at, (note) =>
    vibratoOf(note.effect) === vibrato ? note : { ...note, effect: { ...note.effect, ...toVibratoFlags(vibrato) } },
  );
}

/** New song with the note's slides set; duplicates dropped, kept in model order. Same song when nothing changes. */
export function setNoteSlides(song: Song, at: StringAddress, slides: readonly SlideType[]): Song {
  const next = SLIDE_ORDER.filter((slide) => slides.includes(slide));
  return updateNote(song, at, (note) => {
    const current = note.effect.slides;
    const isSame = current.length === next.length && current.every((slide, i) => slide === next[i]);
    return isSame ? note : { ...note, effect: { ...note.effect, slides: next } };
  });
}

function clampRound(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value) + 0));
}

/** Points rounded onto the 0…12 grid and their values into min…max quarter tones, sorted by position; undefined when there are none. */
function normalizeCurve(curve: Bend | undefined, min: number, max: number): Bend | undefined {
  const points = (curve?.points ?? [])
    .filter((point) => Number.isFinite(point.position) && Number.isFinite(point.value))
    .map((point): BendPoint => ({ position: clampRound(point.position, 0, BEND_MAX_POSITION), value: clampRound(point.value, min, max) }))
    .sort((a, b) => a.position - b.position);
  return points.length === 0 ? undefined : { points };
}

/** New song with the note's bend set (see BEND_PRESETS; values 0…12 quarter tones) or cleared. Same song when nothing changes. */
export function setNoteBend(song: Song, at: StringAddress, bend: Bend | undefined): Song {
  return setOptionalEffect(song, at, 'bend', normalizeCurve(bend, 0, BEND_MAX_VALUE), isSameCurve);
}

/**
 * New song with the note's tremolo bar set (see TREMOLO_BAR_PRESETS; values ±24 quarter tones) or cleared. Same song
 * when nothing changes.
 */
export function setNoteTremoloBar(song: Song, at: StringAddress, tremoloBar: Bend | undefined): Song {
  return setOptionalEffect(song, at, 'tremoloBar', normalizeCurve(tremoloBar, -TREMOLO_BAR_LIMIT, TREMOLO_BAR_LIMIT), isSameCurve);
}

function normalizeHarmonic(harmonic: Harmonic): Harmonic | undefined {
  if (!HARMONIC_TYPES.includes(harmonic.type)) {
    return undefined;
  }
  const hasData = HARMONICS_WITH_DATA.includes(harmonic.type) && Number.isFinite(harmonic.data);
  return { type: harmonic.type, data: hasData ? Math.round(harmonic.data) + 0 : 0 };
}

/** New song with the note's harmonic set or cleared. Same song when nothing changes or the type is unknown. */
export function setNoteHarmonic(song: Song, at: StringAddress, harmonic: Harmonic | undefined): Song {
  return setCheckedEffect(song, at, 'harmonic', harmonic, {
    normalize: normalizeHarmonic,
    isSame: (a, b) => a.type === b.type && a.data === b.data,
  });
}

/**
 * A new harmonic of `type` for a note at `fret`, with the data TuxGuitar's harmonic dialog starts from (the 12th-fret
 * harmonic): artificial 12 semitones above the note, tapped 12 frets above it (MAX_FRET at most); no data otherwise.
 */
export function buildHarmonic(type: HarmonicType, fret: number): Harmonic {
  switch (type) {
    case 'artificial':
      return { type, data: artificialHarmonicOffset(DEFAULT_HARMONIC_ENTRY) };
    case 'tapped': {
      const from = Number.isFinite(fret) ? Math.max(0, Math.round(fret)) : 0;
      return { type, data: Math.min(MAX_FRET, from + harmonicFretOffset(DEFAULT_HARMONIC_ENTRY)) };
    }
    default:
      return { type, data: 0 };
  }
}
