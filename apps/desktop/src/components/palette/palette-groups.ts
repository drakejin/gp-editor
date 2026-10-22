import {
  BEND_PRESETS,
  type BendPresetName,
  type DynamicName,
  type HarmonicType,
  type NoteValue,
  type SlideType,
  type StrokeDirection,
  TREMOLO_BAR_PRESETS,
  type ToggleableEffect,
  type TremoloBarPresetName,
  type TripletFeel,
  dynamicOf,
} from '@gp-editor/core';
import type { SongEdit } from '../../state/song-edits';
import type { GlyphKind } from './MusicIcon';
import { type PaletteContext, type PaletteGroup, type PaletteOption, type PaletteRun, type PaletteTool, isSameBend } from './palette-tools';

const edit = (songEdit: SongEdit): PaletteRun => ({ kind: 'edit', edit: songEdit });

/** An on/off note effect: pressing toggles it, the button is lit while the note has it. */
function effectTool(id: string, face: string, tooltip: string, effect: ToggleableEffect, glyph?: GlyphKind): PaletteTool {
  return { id, face, glyph, tooltip, scope: 'note', run: edit({ type: 'toggleEffect', effect }), isActive: (context) => context.note?.effect[effect] === true };
}

/** SMuFL code points of the palette's music symbols (drawn with Bravura). */
const GLYPH = {
  dot: '',
  rest: '',
  repeatOpen: '',
  repeatClose: '',
  accent: '',
  marcato: '',
  staccato: '',
  deadNote: '',
  tremolo: '',
  trill: '',
  grace: '',
  downBow: '',
  upBow: '',
  brushUp: '',
  brushDown: '',
  tuplet: '',
} as const;

const NOTE_VALUES: readonly (readonly [NoteValue, string, string])[] = [
  [1, '', 'Whole note'],
  [2, '', 'Half note'],
  [4, '', 'Quarter note'],
  [8, '', 'Eighth note'],
  [16, '', '16th note'],
  [32, '', '32nd note'],
  [64, '', '64th note'],
];

const DYNAMICS: readonly (readonly [DynamicName, string])[] = [
  ['ppp', ''],
  ['pp', ''],
  ['p', ''],
  ['mp', ''],
  ['mf', ''],
  ['f', ''],
  ['ff', ''],
  ['fff', ''],
];

/**
 * Tuplets an edit can make: those whose notes are a whole number of ticks (960 per quarter). 7, 9 and 11 are not,
 * so files that have them are read and played, but the palette does not offer them.
 */
const TUPLETS: readonly number[] = [3, 5, 6, 10, 12];

const SLIDES: readonly (readonly [SlideType, string, string])[] = [
  ['shift', 'Shift', 'Shift slide to the next note'],
  ['legato', 'Legato', 'Legato slide to the next note'],
  ['intoFromBelow', '↗ In', 'Slide in from below'],
  ['intoFromAbove', '↘ In', 'Slide in from above'],
  ['outDownwards', 'Out ↘', 'Slide out downwards'],
  ['outUpwards', 'Out ↗', 'Slide out upwards'],
];

const HARMONICS: readonly (readonly [HarmonicType, string, string])[] = [
  ['natural', 'N.H.', 'Natural harmonic'],
  ['artificial', 'A.H.', 'Artificial harmonic (12 frets above)'],
  ['tapped', 'T.H.', 'Tapped harmonic'],
  ['pinch', 'P.H.', 'Pinch harmonic'],
  ['semi', 'S.H.', 'Semi harmonic'],
];

export const BEND_LABELS: Readonly<Record<BendPresetName, string>> = {
  half: 'Bend ½',
  full: 'Bend full',
  bendRelease: 'Bend & release',
  bendReleaseBend: 'Bend, release, bend',
  preBend: 'Pre-bend',
  preBendRelease: 'Pre-bend & release',
};

export const TREMOLO_BAR_LABELS: Readonly<Record<TremoloBarPresetName, string>> = {
  dip: 'Dip',
  dive: 'Dive',
  releaseUp: 'Release up',
  invertedDip: 'Inverted dip',
  return: 'Return',
  releaseDown: 'Release down',
};

function voiceGroup(): PaletteGroup {
  const voiceTool = (voiceIndex: number): PaletteTool => ({
    id: `voice${voiceIndex + 1}`,
    face: String(voiceIndex + 1),
    tooltip: `Voice ${voiceIndex + 1}: edit the ${voiceIndex === 0 ? 'first' : 'second'} voice of the bar`,
    scope: 'beat',
    run: { kind: 'action', action: { type: 'selectVoice', voiceIndex } },
    isActive: (context) => context.cursor?.voiceIndex === voiceIndex,
  });
  return { title: 'Voice', tools: [voiceTool(0), voiceTool(1)] };
}

function barGroup(): PaletteGroup {
  const endings: readonly PaletteOption[] = [1, 2, 3, 4, 5, 6, 7, 8].map((ending) => ({
    label: `${ending}.`,
    tooltip: `Alternate ending ${ending}`,
    edit: { type: 'toggleAlternateEnding', ending },
    isActive: (context: PaletteContext) => ((context.header?.repeatAlternative ?? 0) & (1 << (ending - 1))) !== 0, // eslint-disable-line no-bitwise
  }));
  const feels: readonly (readonly [TripletFeel, string, string])[] = [
    ['none', 'Straight', 'No triplet feel'],
    ['eighth', '♫ 8th', 'Triplet feel: eighths played as triplets'],
    ['sixteenth', '♬ 16th', 'Triplet feel: sixteenths played as triplets'],
  ];
  return {
    title: 'Bar',
    tools: [
      { id: 'insertMeasure', face: '+ Bar', tooltip: 'Insert a bar after this one', scope: 'bar', run: edit({ type: 'insertMeasure' }) },
      { id: 'deleteMeasure', face: '− Bar', tooltip: 'Delete this bar', scope: 'bar', run: edit({ type: 'deleteMeasure' }) },
      { id: 'repeatOpen', face: GLYPH.repeatOpen, glyph: 'barline', tooltip: 'Repeat start', scope: 'bar', run: edit({ type: 'toggleRepeatOpen' }), isActive: (c) => c.header?.repeatOpen === true },
      { id: 'repeatClose', face: GLYPH.repeatClose, glyph: 'barline', tooltip: 'Repeat end', scope: 'bar', run: edit({ type: 'toggleRepeatClose' }), isActive: (c) => (c.header?.repeatClose ?? 0) > 0 },
      { id: 'endings', face: '1. 2.', tooltip: 'Alternate endings', scope: 'bar', run: { kind: 'options', options: endings }, isActive: (c) => (c.header?.repeatAlternative ?? 0) !== 0 },
      {
        id: 'tripletFeel',
        face: '♪³',
        tooltip: 'Triplet feel',
        scope: 'bar',
        run: { kind: 'options', options: feels.map(([feel, label, tooltip]) => ({ label, tooltip, edit: { type: 'setTripletFeel', feel }, isActive: (c: PaletteContext) => c.header?.tripletFeel === feel })) },
        isActive: (c) => (c.header?.tripletFeel ?? 'none') !== 'none',
      },
      {
        id: 'section',
        face: 'A',
        tooltip: 'Section (rehearsal mark) at this bar',
        scope: 'bar',
        run: { kind: 'text', placeholder: 'Section name, e.g. Verse 1', value: (c) => c.header?.marker?.title ?? '', edit: (title) => ({ type: 'setSection', title }) },
        isActive: (c) => c.header?.marker !== undefined,
      },
    ],
    steppers: [
      { id: 'numerator', label: 'Beats', tooltip: 'Time signature: beats per bar', value: (c) => String(c.header?.timeSignature.numerator ?? '–'), minus: { type: 'shiftTimeSignature', part: 'numerator', delta: -1 }, plus: { type: 'shiftTimeSignature', part: 'numerator', delta: 1 } },
      { id: 'denominator', label: 'Beat value', tooltip: 'Time signature: the beat’s note value', value: (c) => `÷${c.header?.timeSignature.denominator ?? '–'}`, minus: { type: 'shiftTimeSignature', part: 'denominator', delta: -1 }, plus: { type: 'shiftTimeSignature', part: 'denominator', delta: 1 } },
      { id: 'tempo', label: 'Tempo', tooltip: 'Written tempo from this bar (5 BPM steps)', value: (c) => `♩ ${c.header?.tempo ?? '–'}`, minus: { type: 'shiftTempo', delta: -5 }, plus: { type: 'shiftTempo', delta: 5 } },
      { id: 'key', label: 'Key', tooltip: 'Key signature from this bar', value: (c) => (c.keySignature === 0 ? 'C / Am' : `${Math.abs(c.keySignature)}${c.keySignature > 0 ? '♯' : '♭'}`), minus: { type: 'shiftKeySignature', delta: -1 }, plus: { type: 'shiftKeySignature', delta: 1 } },
      { id: 'repeats', label: 'Repeats', tooltip: 'Times the repeat is played', value: (c) => ((c.header?.repeatClose ?? 0) > 0 ? `×${c.header?.repeatClose}` : '–'), minus: { type: 'shiftRepeatCount', delta: -1 }, plus: { type: 'shiftRepeatCount', delta: 1 }, isEnabled: (c) => (c.header?.repeatClose ?? 0) > 0 },
    ],
  };
}

function rhythmGroup(): PaletteGroup {
  const values: readonly PaletteTool[] = NOTE_VALUES.map(([value, face, name]) => ({
    id: `value${value}`,
    face,
    glyph: 'note',
    tooltip: `${name} ([ and ] step the duration)`,
    scope: 'beat',
    run: edit({ type: 'setNoteValue', value }),
    isActive: (c) => c.voice?.duration.value === value,
  }));
  const tuplets: readonly PaletteOption[] = [
    { label: 'None', tooltip: 'No tuplet', edit: { type: 'setTuplet', enters: 1 }, isActive: (c) => c.voice?.duration.tuplet.enters === c.voice?.duration.tuplet.times },
    ...TUPLETS.map((enters) => ({ label: String(enters), tooltip: `${enters}-tuplet`, edit: { type: 'setTuplet', enters } as const, isActive: (c: PaletteContext) => c.voice?.duration.tuplet.enters === enters })),
  ];
  return {
    title: 'Rhythm',
    tools: [
      ...values,
      { id: 'dot', face: GLYPH.dot, glyph: 'mark', tooltip: 'Dotted (.)', scope: 'beat', run: edit({ type: 'toggleDot' }), isActive: (c) => c.voice?.duration.dotted === true },
      { id: 'tuplet', face: GLYPH.tuplet, glyph: 'mark', tooltip: 'Tuplet (/ makes a triplet)', scope: 'beat', run: { kind: 'options', options: tuplets }, isActive: (c) => c.voice !== undefined && c.voice.duration.tuplet.enters !== c.voice.duration.tuplet.times },
      { id: 'rest', face: GLYPH.rest, glyph: 'mark', tooltip: 'Rest: clear the beat’s notes', scope: 'beat', run: edit({ type: 'makeRest' }), isActive: (c) => c.voice !== undefined && !c.voice.isEmpty && c.voice.notes.length === 0 },
      { id: 'tie', face: 'tie', tooltip: 'Tie to the previous note (T)', scope: 'note', run: edit({ type: 'toggleTie' }), isActive: (c) => c.note?.isTied === true },
      { id: 'insertBeat', face: '+ Beat', tooltip: 'Insert a beat after the cursor (I)', scope: 'beat', run: edit({ type: 'insertBeat' }) },
      { id: 'deleteBeat', face: '− Beat', tooltip: 'Delete the beat (⇧⌫)', scope: 'beat', run: edit({ type: 'deleteBeat' }) },
    ],
  };
}

function noteGroup(): PaletteGroup {
  return {
    title: 'Note',
    tools: [
      { id: 'fretDown', face: 'Fret −', tooltip: 'Fret down (-)', scope: 'note', run: { kind: 'action', action: { type: 'shiftNoteFret', delta: -1 } } },
      { id: 'fretUp', face: 'Fret +', tooltip: 'Fret up (=)', scope: 'note', run: { kind: 'action', action: { type: 'shiftNoteFret', delta: 1 } } },
      { id: 'stringUp', face: 'Str ↑', tooltip: 'Move the note to the string above (⌥↑)', scope: 'note', run: { kind: 'action', action: { type: 'shiftNoteString', delta: -1 } } },
      { id: 'stringDown', face: 'Str ↓', tooltip: 'Move the note to the string below (⌥↓)', scope: 'note', run: { kind: 'action', action: { type: 'shiftNoteString', delta: 1 } } },
      { id: 'deleteNote', face: 'Delete', tooltip: 'Delete the note (⌫)', scope: 'note', run: { kind: 'action', action: { type: 'deleteNote' } } },
    ],
  };
}

function dynamicsGroup(): PaletteGroup {
  return {
    title: 'Dynamics',
    tools: DYNAMICS.map(([dynamic, face]) => ({
      id: `dynamic-${dynamic}`,
      face,
      glyph: 'dynamic',
      tooltip: `Dynamic ${dynamic}`,
      scope: 'note',
      run: edit({ type: 'setDynamic', dynamic }),
      isActive: (c) => c.note !== undefined && dynamicOf(c.note.velocity) === dynamic,
    })),
  };
}

function articulationGroup(): PaletteGroup {
  return {
    title: 'Articulation',
    tools: [
      effectTool('accent', GLYPH.accent, 'Accent (A)', 'accentuatedNote', 'articulation'),
      effectTool('heavyAccent', GLYPH.marcato, 'Heavy accent', 'heavyAccentuatedNote', 'articulation'),
      effectTool('staccato', GLYPH.staccato, 'Staccato', 'staccato', 'articulation'),
      effectTool('ghost', '( )', 'Ghost note (G)', 'ghostNote'),
      effectTool('dead', GLYPH.deadNote, 'Dead note (X)', 'deadNote', 'mark'),
      effectTool('letRing', 'L.R.', 'Let ring (L)', 'letRing'),
      effectTool('palmMute', 'P.M.', 'Palm mute (P)', 'palmMute'),
    ],
  };
}

function bendOptions(): readonly PaletteOption[] {
  const presets = (Object.keys(BEND_LABELS) as BendPresetName[]).map((preset) => ({
    label: BEND_LABELS[preset],
    tooltip: BEND_LABELS[preset],
    edit: { type: 'setBend', preset } as const,
    isActive: (c: PaletteContext) => isSameBend(c.note?.effect.bend, BEND_PRESETS[preset]),
  }));
  return [{ label: 'None', tooltip: 'No bend', edit: { type: 'setBend', preset: 'none' }, isActive: (c) => c.note?.effect.bend === undefined }, ...presets];
}

function tremoloBarOptions(): readonly PaletteOption[] {
  const presets = (Object.keys(TREMOLO_BAR_LABELS) as TremoloBarPresetName[]).map((preset) => ({
    label: TREMOLO_BAR_LABELS[preset],
    tooltip: `Whammy bar: ${TREMOLO_BAR_LABELS[preset]}`,
    edit: { type: 'setTremoloBar', preset } as const,
    isActive: (c: PaletteContext) => isSameBend(c.note?.effect.tremoloBar, TREMOLO_BAR_PRESETS[preset]),
  }));
  return [{ label: 'None', tooltip: 'No whammy bar', edit: { type: 'setTremoloBar', preset: 'none' }, isActive: (c) => c.note?.effect.tremoloBar === undefined }, ...presets];
}

function effectsGroup(): PaletteGroup {
  const slides: readonly PaletteOption[] = SLIDES.map(([slide, label, tooltip]) => ({ label, tooltip, edit: { type: 'toggleSlideType', slide }, isActive: (c) => c.note?.effect.slides.includes(slide) === true }));
  const harmonics: readonly PaletteOption[] = [
    { label: 'None', tooltip: 'No harmonic', edit: { type: 'setHarmonic', harmonic: 'none' }, isActive: (c) => c.note?.effect.harmonic === undefined },
    ...HARMONICS.map(([harmonic, label, tooltip]) => ({ label, tooltip, edit: { type: 'setHarmonic', harmonic } as const, isActive: (c: PaletteContext) => c.note?.effect.harmonic?.type === harmonic })),
  ];
  return {
    title: 'Effects',
    tools: [
      effectTool('hammer', 'H/P', 'Hammer-on / pull-off to the next note (H)', 'hammer'),
      { id: 'slide', face: 'sl.', tooltip: 'Slides (S toggles a shift slide)', scope: 'note', run: { kind: 'options', options: slides }, isActive: (c) => (c.note?.effect.slides.length ?? 0) > 0 },
      { id: 'bend', face: '↗', tooltip: 'Bend (B cycles ½, full, none)', scope: 'note', run: { kind: 'options', options: bendOptions() }, isActive: (c) => c.note?.effect.bend !== undefined },
      { id: 'whammy', face: 'w/bar', tooltip: 'Whammy bar', scope: 'note', run: { kind: 'options', options: tremoloBarOptions() }, isActive: (c) => c.note?.effect.tremoloBar !== undefined },
      effectTool('vibrato', '~', 'Vibrato (V)', 'vibrato'),
      { id: 'harmonic', face: '◇', tooltip: 'Harmonics (N toggles a natural harmonic)', scope: 'note', run: { kind: 'options', options: harmonics }, isActive: (c) => c.note?.effect.harmonic !== undefined },
      { id: 'trill', face: GLYPH.trill, glyph: 'mark', tooltip: 'Trill (with the fret 2 above)', scope: 'note', run: { kind: 'options', options: speedOptions('setTrill', [16, 32, 64]) }, isActive: (c) => c.note?.effect.trill !== undefined },
      { id: 'tremoloPicking', face: GLYPH.tremolo, glyph: 'mark', tooltip: 'Tremolo picking', scope: 'note', run: { kind: 'options', options: speedOptions('setTremoloPicking', [8, 16, 32]) }, isActive: (c) => c.note?.effect.tremoloPicking !== undefined },
      { id: 'grace', face: GLYPH.grace, glyph: 'note', tooltip: 'Grace note (2 frets below, hammered)', scope: 'note', run: { kind: 'options', options: graceOptions() }, isActive: (c) => c.note?.effect.grace !== undefined },
      effectTool('tapping', 'T', 'Tapping', 'tapping'),
      effectTool('slapping', 'S', 'Slap', 'slapping'),
      effectTool('popping', 'P', 'Pop', 'popping'),
      effectTool('fadeIn', '<', 'Fade in (volume swell)', 'fadeIn'),
    ],
  };
}

function speedOptions(type: 'setTrill' | 'setTremoloPicking', speeds: readonly (8 | 16 | 32 | 64)[]): readonly PaletteOption[] {
  const current = (c: PaletteContext) => (type === 'setTrill' ? c.note?.effect.trill?.duration.value : c.note?.effect.tremoloPicking?.duration.value);
  const option = (speed: 8 | 16 | 32 | 64): PaletteOption => ({
    label: `1/${speed}`,
    tooltip: `${type === 'setTrill' ? 'Trill' : 'Tremolo picking'} in ${speed}th notes`,
    edit: (type === 'setTrill' ? { type, speed } : { type, speed }) as SongEdit,
    isActive: (c) => current(c) === speed,
  });
  return [{ label: 'None', tooltip: 'Off', edit: { type, speed: 'none' } as SongEdit, isActive: (c) => current(c) === undefined }, ...speeds.map(option)];
}

function graceOptions(): readonly PaletteOption[] {
  return [
    { label: 'None', tooltip: 'No grace note', edit: { type: 'setGrace', grace: 'none' }, isActive: (c) => c.note?.effect.grace === undefined },
    { label: 'Before beat', tooltip: 'Grace note before the beat', edit: { type: 'setGrace', grace: 'beforeBeat' }, isActive: (c) => c.note?.effect.grace?.onBeat === false },
    { label: 'On beat', tooltip: 'Grace note on the beat', edit: { type: 'setGrace', grace: 'onBeat' }, isActive: (c) => c.note?.effect.grace?.onBeat === true },
  ];
}

function strokeGroup(): PaletteGroup {
  const stroke = (id: string, face: string, tooltip: string, direction: StrokeDirection, kind: 'setStroke' | 'setPickStroke'): PaletteTool => ({
    id,
    face,
    glyph: 'mark',
    tooltip,
    scope: 'beat',
    run: { kind: 'edit', edit: { type: kind, direction } },
    isActive: (c) => (kind === 'setStroke' ? c.beat?.stroke.direction : c.beat?.pickStroke) === direction,
  });
  return {
    title: 'Beat',
    tools: [
      stroke('brushDown', GLYPH.brushDown, 'Brush (strum) down', 'down', 'setStroke'),
      stroke('brushUp', GLYPH.brushUp, 'Brush (strum) up', 'up', 'setStroke'),
      stroke('pickDown', GLYPH.downBow, 'Pick stroke down', 'down', 'setPickStroke'),
      stroke('pickUp', GLYPH.upBow, 'Pick stroke up', 'up', 'setPickStroke'),
      {
        id: 'text',
        face: 'Text',
        tooltip: 'Text above the beat',
        scope: 'beat',
        run: { kind: 'text', placeholder: 'Text above the beat', value: (c) => c.beat?.text ?? '', edit: (text) => ({ type: 'setBeatText', text }) },
        isActive: (c) => (c.beat?.text ?? '') !== '',
      },
    ],
  };
}

/** The edition palette, top to bottom as in Guitar Pro: voice, bar, rhythm, note, dynamics, articulation, effects, beat. */
export const PALETTE_GROUPS: readonly PaletteGroup[] = [
  voiceGroup(),
  barGroup(),
  rhythmGroup(),
  noteGroup(),
  dynamicsGroup(),
  articulationGroup(),
  effectsGroup(),
  strokeGroup(),
];
