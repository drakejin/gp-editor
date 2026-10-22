import {
  BEND_PRESETS,
  type Bend,
  type BendPresetName,
  type BendShape,
  DYNAMICS,
  type Duration,
  type DynamicName,
  type Grace,
  type Harmonic,
  type HarmonicType,
  MAX_FRET,
  type Note,
  type NoteValue,
  QUARTER,
  type SlideType,
  type Song,
  type StringAddress,
  TREMOLO_BAR_PRESETS,
  type ToggleableEffect,
  type TremoloBarPresetName,
  type Trill,
  type VibratoKind,
  buildBend,
  buildHarmonic,
  findNote,
  setNoteBend,
  setNoteGrace,
  setNoteHarmonic,
  setNoteSlides,
  setNoteTied,
  setNoteTremoloBar,
  setNoteTremoloPicking,
  setNoteTrill,
  setNoteVelocity,
  setNoteVibrato,
  toggleNoteEffect,
} from '@gp-editor/core';

/** Edits of the note at the cursor; each returns the same song when there is no note there. */
export type NoteEdit =
  | { readonly type: 'toggleEffect'; readonly effect: ToggleableEffect }
  | { readonly type: 'toggleTie' }
  | { readonly type: 'toggleSlide' }
  /** Adds or removes one slide type, keeping the others. */
  | { readonly type: 'toggleSlideType'; readonly slide: SlideType }
  | { readonly type: 'cycleBend' }
  | { readonly type: 'setBend'; readonly preset: BendPresetName | 'none' }
  /** A bend of any shape, `amount` quarter tones high (1–12, rounded and clamped by buildBend). */
  | {
      readonly type: 'setBendShape';
      readonly shape: BendShape | 'none';
      readonly amount: number;
    }
  | { readonly type: 'setVibrato'; readonly vibrato: VibratoKind }
  | {
      readonly type: 'setTremoloBar';
      readonly preset: TremoloBarPresetName | 'none';
    }
  | { readonly type: 'toggleHarmonic' }
  | { readonly type: 'setHarmonic'; readonly harmonic: HarmonicType | 'none' }
  | { readonly type: 'setDynamic'; readonly dynamic: DynamicName }
  | {
      readonly type: 'setGrace';
      readonly grace: 'none' | 'beforeBeat' | 'onBeat';
    }
  | { readonly type: 'setTrill'; readonly speed: 16 | 32 | 64 | 'none' }
  | {
      readonly type: 'setTremoloPicking';
      readonly speed: 8 | 16 | 32 | 'none';
    };

/** Every note edit; a Record, so the compiler keeps it in step with NoteEdit. */
const NOTE_EDIT_TYPES: Readonly<Record<NoteEdit['type'], true>> = {
  toggleEffect: true,
  toggleTie: true,
  toggleSlide: true,
  toggleSlideType: true,
  cycleBend: true,
  setBend: true,
  setBendShape: true,
  setVibrato: true,
  setTremoloBar: true,
  toggleHarmonic: true,
  setHarmonic: true,
  setDynamic: true,
  setGrace: true,
  setTrill: true,
  setTremoloPicking: true,
};

/** Whether an edit sets something on the note at the cursor (a tie can also be typed on an empty string). */
export function needsNote(edit: { readonly type: string }): boolean {
  return edit.type !== 'toggleTie' && Object.prototype.hasOwnProperty.call(NOTE_EDIT_TYPES, edit.type);
}

/** A new grace note: two frets below the note, a 32nd (TuxGuitar's grace duration 2), hammered on. */
const GRACE_FRETS_BELOW = 2;
const GRACE_DURATION = 2;
/** A new trill alternates with the note two frets up. */
const TRILL_FRETS_ABOVE = 2;

/** Applies one note edit at the cursor. A tie may also add a tied note on an empty string (setNoteTied). */
export function applyNoteEdit(
  song: Song,
  cursor: StringAddress,
  edit: NoteEdit,
): Song {
  const note = findNote(song, cursor);
  if (edit.type === 'toggleTie') {
    return setNoteTied(song, cursor, !(note?.isTied ?? false));
  }
  if (note === undefined) {
    return song;
  }
  switch (edit.type) {
    case 'toggleEffect':
      return toggleNoteEffect(song, cursor, edit.effect);
    case 'toggleSlide':
      return setNoteSlides(
        song,
        cursor,
        note.effect.slides.length > 0 ? [] : ['shift'],
      );
    case 'toggleSlideType':
      return setNoteSlides(
        song,
        cursor,
        toggled(note.effect.slides, edit.slide),
      );
    case 'cycleBend':
    case 'setBend':
    case 'setBendShape':
      return setNoteBend(song, cursor, bendFor(note, edit));
    case 'setVibrato':
      return setNoteVibrato(song, cursor, edit.vibrato);
    default:
      return applyNoteDetail(song, cursor, note, edit);
  }
}

type BendEdit = Extract<
  NoteEdit,
  { readonly type: 'cycleBend' | 'setBend' | 'setBendShape' }
>;

/** The bend a bend edit gives the note: the next one of the cycle, a preset, a shape, or none. */
function bendFor(note: Note, edit: BendEdit): Bend | undefined {
  switch (edit.type) {
    case 'cycleBend':
      return nextBend(bendPeak(note.effect.bend?.points ?? []));
    case 'setBend':
      return edit.preset === 'none' ? undefined : BEND_PRESETS[edit.preset];
    case 'setBendShape':
      return edit.shape === 'none'
        ? undefined
        : buildBend(edit.shape, edit.amount);
  }
}

/** The tremolo bar, harmonics, dynamics and the effects with a speed or a grace note. */
function applyNoteDetail(
  song: Song,
  cursor: StringAddress,
  note: Note,
  edit: NoteEdit,
): Song {
  switch (edit.type) {
    case 'setTremoloBar':
      return setNoteTremoloBar(
        song,
        cursor,
        edit.preset === 'none' ? undefined : TREMOLO_BAR_PRESETS[edit.preset],
      );
    case 'toggleHarmonic':
      return setNoteHarmonic(
        song,
        cursor,
        note.effect.harmonic === undefined
          ? harmonicFor(note, 'natural')
          : undefined,
      );
    case 'setHarmonic':
      return setNoteHarmonic(song, cursor, harmonicFor(note, edit.harmonic));
    case 'setDynamic': {
      const velocity = DYNAMICS.find(
        ({ name }) => name === edit.dynamic,
      )?.velocity;
      return velocity === undefined
        ? song
        : setNoteVelocity(song, cursor, velocity);
    }
    case 'setGrace':
      return setNoteGrace(song, cursor, graceFor(note, edit.grace));
    case 'setTrill':
      return setNoteTrill(song, cursor, trillFor(note, edit.speed));
    case 'setTremoloPicking':
      return setNoteTremoloPicking(
        song,
        cursor,
        edit.speed === 'none' ? undefined : { duration: plain(edit.speed) },
      );
    default:
      return song;
  }
}

function plain(value: NoteValue): Duration {
  return { ...QUARTER, value };
}

function harmonicFor(
  note: Note,
  harmonic: HarmonicType | 'none',
): Harmonic | undefined {
  return harmonic === 'none' ? undefined : buildHarmonic(harmonic, note.fret);
}

/** The note's trill at a new speed; a new trill alternates with the note two frets up. */
function trillFor(note: Note, speed: 16 | 32 | 64 | 'none'): Trill | undefined {
  if (speed === 'none') {
    return undefined;
  }
  const fret =
    note.effect.trill?.fret ??
    Math.min(MAX_FRET, note.fret + TRILL_FRETS_ABOVE);
  return { fret, duration: plain(speed) };
}

function toggled(
  slides: readonly SlideType[],
  slide: SlideType,
): readonly SlideType[] {
  return slides.includes(slide)
    ? slides.filter(other => other !== slide)
    : [...slides, slide];
}

/** The note's grace note placed on or before the beat; a new one is a 32nd hammer-on two frets below. */
function graceFor(
  note: Note,
  placement: 'none' | 'beforeBeat' | 'onBeat',
): Grace | undefined {
  if (placement === 'none') {
    return undefined;
  }
  const onBeat = placement === 'onBeat';
  const current = note.effect.grace;
  if (current !== undefined) {
    return { ...current, onBeat };
  }
  return {
    fret: Math.max(0, note.fret - GRACE_FRETS_BELOW),
    duration: GRACE_DURATION,
    velocity: note.velocity,
    transition: 'hammer',
    onBeat,
    isDead: false,
  };
}

function bendPeak(points: readonly { readonly value: number }[]): number {
  return Math.max(0, ...points.map(point => point.value));
}

/** No bend → ½ → full → no bend. */
function nextBend(peak: number): Bend | undefined {
  const half = bendPeak(BEND_PRESETS.half.points);
  const full = bendPeak(BEND_PRESETS.full.points);
  if (peak === 0) {
    return BEND_PRESETS.half;
  }
  if (peak <= half) {
    return BEND_PRESETS.full;
  }
  return peak >= full ? undefined : BEND_PRESETS.full;
}
