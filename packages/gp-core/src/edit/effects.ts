// Note effect edits after TuxGuitar's TGMeasureManager setters (setVibrato, changeDeadNote, setBendNote …), LGPL-2.1.
import { BEND_MAX_POSITION } from '../formats/common/bend-units';
import type { Bend, BendPoint, Harmonic, HarmonicType, Note, NoteEffect, SlideType, Song } from '../model/song';
import type { StringAddress } from './addresses';
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

/** Highest bend value, in quarter tones (TGEffectBend.MAX_VALUE_LENGTH: three tones). */
const BEND_MAX_VALUE = 12;

function bendOf(...points: readonly (readonly [position: number, value: number])[]): Bend {
  return { points: points.map(([position, value]) => ({ position, value })) };
}

/** Guitar Pro's usual bends (TuxGuitar's bend dialog presets), in quarter tones over positions 0–12. */
export const BEND_PRESETS: { readonly half: Bend; readonly full: Bend; readonly bendRelease: Bend; readonly preBend: Bend } = {
  half: bendOf([0, 0], [6, 2], [12, 2]),
  full: bendOf([0, 0], [6, 4], [12, 4]),
  bendRelease: bendOf([0, 0], [3, 4], [6, 4], [9, 0], [12, 0]),
  preBend: bendOf([0, 4], [12, 4]),
};

/** Slide kinds in the order the model keeps them. */
const SLIDE_ORDER: readonly SlideType[] = ['shift', 'legato', 'outDownwards', 'outUpwards', 'intoFromBelow', 'intoFromAbove'];

const HARMONIC_TYPES: readonly HarmonicType[] = ['natural', 'artificial', 'tapped', 'pinch', 'semi'];

/** Harmonic types whose `data` means something (artificial: semitone offset, tapped: fret). */
const HARMONICS_WITH_DATA: readonly HarmonicType[] = ['artificial', 'tapped'];

function withEffect(note: Note, effect: NoteEffect): Note {
  return { ...note, effect };
}

/**
 * New song with one on/off effect of the addressed note switched. A dead note is never tied (changeDeadNote), and
 * tapping, slapping and popping exclude each other. Same song when there is no note there.
 */
export function toggleNoteEffect(song: Song, at: StringAddress, effect: ToggleableEffect): Song {
  return updateNote(song, at, (note) => {
    const isOn = !note.effect[effect];
    const cleared = isOn && SLAP_EFFECTS.includes(effect) ? { tapping: false, slapping: false, popping: false } : {};
    const next = withEffect(note, { ...note.effect, ...cleared, [effect]: isOn });
    return effect === 'deadNote' && isOn ? { ...next, isTied: false } : next;
  });
}

/** New song with the note's slides set; duplicates dropped, kept in model order. Same song when nothing changes. */
export function setNoteSlides(song: Song, at: StringAddress, slides: readonly SlideType[]): Song {
  const next = SLIDE_ORDER.filter((slide) => slides.includes(slide));
  return updateNote(song, at, (note) => {
    const current = note.effect.slides;
    const isSame = current.length === next.length && current.every((slide, i) => slide === next[i]);
    return isSame ? note : withEffect(note, { ...note.effect, slides: next });
  });
}

function clampRound(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value) + 0));
}

/** Points rounded onto the 0…12 grid, values to 0…12 quarter tones, sorted by position; undefined when there are none. */
function normalizeBend(bend: Bend | undefined): Bend | undefined {
  const points = (bend?.points ?? [])
    .filter((point) => Number.isFinite(point.position) && Number.isFinite(point.value))
    .map((point): BendPoint => ({ position: clampRound(point.position, 0, BEND_MAX_POSITION), value: clampRound(point.value, 0, BEND_MAX_VALUE) }))
    .sort((a, b) => a.position - b.position);
  return points.length === 0 ? undefined : { points };
}

function isSameBend(a: Bend | undefined, b: Bend | undefined): boolean {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  return a.points.length === b.points.length && a.points.every((point, i) => point.position === b.points[i]?.position && point.value === b.points[i]?.value);
}

/** Effect without one optional key (the model leaves unset effects out rather than undefined). */
function without(effect: NoteEffect, key: 'bend' | 'harmonic'): NoteEffect {
  const { [key]: _removed, ...rest } = effect;
  return rest;
}

/** New song with the note's bend set (see BEND_PRESETS) or cleared. Same song when nothing changes. */
export function setNoteBend(song: Song, at: StringAddress, bend: Bend | undefined): Song {
  const next = normalizeBend(bend);
  return updateNote(song, at, (note) => {
    if (isSameBend(note.effect.bend, next)) {
      return note;
    }
    return withEffect(note, next === undefined ? without(note.effect, 'bend') : { ...note.effect, bend: next });
  });
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
  const next = harmonic === undefined ? undefined : normalizeHarmonic(harmonic);
  if (harmonic !== undefined && next === undefined) {
    return song;
  }
  return updateNote(song, at, (note) => {
    const current = note.effect.harmonic;
    if (current?.type === next?.type && current?.data === next?.data) {
      return note;
    }
    return withEffect(note, next === undefined ? without(note.effect, 'harmonic') : { ...note.effect, harmonic: next });
  });
}
