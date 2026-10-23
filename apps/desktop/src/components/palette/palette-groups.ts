import {
  type DynamicName,
  type HarmonicType,
  type NoteValue,
  type SlideType,
  type StrokeDirection,
  TREMOLO_BAR_PRESETS,
  TUPLET_SIZES,
  type ToggleableEffect,
  type TremoloBarPresetName,
  type TripletFeel,
  dynamicOf,
  vibratoOf,
} from '@gp-editor/core';
import { DYNAMIC_GLYPHS, PICK_STROKE_GLYPHS } from '../../score/symbols/smufl';
import type { SongEdit } from '../../state/song-edits';
import type { GlyphKind } from './MusicIcon';
import { directionsTool, fadeTools, hairpinTools, pedalTools, rasgueadoTool } from './palette-marks';
import { accidentalTool, beamGroupingTool, beatMarkTools, fingeringTools } from './palette-notation';
import { type PaletteContext, type PaletteGroup, type PaletteOption, type PaletteRun, type PaletteTool, isSameBend } from './palette-tools';

const edit = (songEdit: SongEdit): PaletteRun => ({ kind: 'edit', edit: songEdit });

/** A tooltip that names the tool's key, as the shortcut sheet does. */
const withKey = (name: string, key: string | undefined): string => (key === undefined ? name : `${name} (${key})`);

/** An on/off note effect: pressing toggles it, the button is lit while the note has it. */
function effectTool(id: string, face: string, name: string, effect: ToggleableEffect, look: { readonly glyph?: GlyphKind; readonly key?: string } = {}): PaletteTool {
  const { glyph, key } = look;
  return { id, face, glyph, key, tooltip: withKey(name, key), scope: 'note', run: edit({ type: 'toggleEffect', effect }), isActive: (context) => context.note?.effect[effect] === true };
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
  tremolo: '',
  trill: '',
  grace: '',
  downBow: PICK_STROKE_GLYPHS.down.text,
  upBow: PICK_STROKE_GLYPHS.up.text,
  brushUp: '',
  brushDown: '',
  tuplet: '',
} as const;

/** Room for a short face and its key in the corner: four tools a row (the palette's 198 points inside). */
const TECHNIQUE_TOOL_WIDTH = 47;

const NOTE_VALUES: readonly (readonly [NoteValue, string, string])[] = [
  [1, '', 'Whole note'],
  [2, '', 'Half note'],
  [4, '', 'Quarter note'],
  [8, '', 'Eighth note'],
  [16, '', '16th note'],
  [32, '', '32nd note'],
  [64, '', '64th note'],
];

const DYNAMIC_ORDER: readonly DynamicName[] = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];

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
      directionsTool(),
      beamGroupingTool(),
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
    ...TUPLET_SIZES.map((enters) => ({ label: String(enters), tooltip: `${enters}-tuplet`, edit: { type: 'setTuplet', enters } as const, isActive: (c: PaletteContext) => c.voice?.duration.tuplet.enters === enters })),
  ];
  const innerTuplets: readonly PaletteOption[] = [
    { label: 'None', tooltip: 'No tuplet inside the beat’s tuplet', edit: { type: 'setInnerTuplet', enters: 1 }, isActive: (c) => c.voice !== undefined && c.voice.duration.innerTuplet === undefined },
    ...TUPLET_SIZES.map((enters) => ({ label: String(enters), tooltip: `${enters}-tuplet inside the beat’s tuplet`, edit: { type: 'setInnerTuplet', enters } as const, isActive: (c: PaletteContext) => c.voice?.duration.innerTuplet?.enters === enters })),
  ];
  return {
    title: 'Rhythm',
    tools: [
      ...values,
      { id: 'dot', face: GLYPH.dot, glyph: 'mark', tooltip: 'Dotted (.)', scope: 'beat', run: edit({ type: 'toggleDot' }), isActive: (c) => c.voice?.duration.dotted === true },
      { id: 'tuplet', face: GLYPH.tuplet, glyph: 'mark', tooltip: 'Tuplet (/ makes a triplet)', scope: 'beat', run: { kind: 'options', options: tuplets }, isActive: (c) => c.voice !== undefined && c.voice.duration.tuplet.enters !== c.voice.duration.tuplet.times },
      { id: 'innerTuplet', face: 'Inner', tooltip: 'Inner tuplet: a tuplet inside the beat’s tuplet (⌥/ makes a triplet)', scope: 'beat', run: { kind: 'options', options: innerTuplets }, isActive: (c) => c.voice?.duration.innerTuplet !== undefined },
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
      ...fingeringTools(),
      accidentalTool(),
    ],
  };
}

function dynamicsGroup(): PaletteGroup {
  return {
    title: 'Dynamics',
    tools: [
      ...DYNAMIC_ORDER.map((dynamic): PaletteTool => ({
        id: `dynamic-${dynamic}`,
        face: DYNAMIC_GLYPHS[dynamic].text,
        glyph: 'dynamic',
        tooltip: `Dynamic ${dynamic}`,
        scope: 'note',
        run: edit({ type: 'setDynamic', dynamic }),
        isActive: (c) => c.note !== undefined && dynamicOf(c.note.velocity) === dynamic,
      })),
      ...hairpinTools(),
    ],
  };
}

function articulationGroup(): PaletteGroup {
  return {
    title: 'Articulation',
    toolWidth: TECHNIQUE_TOOL_WIDTH,
    tools: [
      effectTool('accent', GLYPH.accent, 'Accent', 'accentuatedNote', { glyph: 'articulation', key: 'A' }),
      effectTool('heavyAccent', GLYPH.marcato, 'Heavy accent', 'heavyAccentuatedNote', { glyph: 'articulation' }),
      effectTool('staccato', GLYPH.staccato, 'Staccato', 'staccato', { glyph: 'articulation' }),
    ],
  };
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

/** Everything played on the note, the ones with a key first (in the order guitarists name them). */
function techniquesGroup(): PaletteGroup {
  const slides: readonly PaletteOption[] = SLIDES.map(([slide, label, tooltip]) => ({ label, tooltip, edit: { type: 'toggleSlideType', slide }, isActive: (c) => c.note?.effect.slides.includes(slide) === true }));
  const harmonics: readonly PaletteOption[] = [
    { label: 'None', tooltip: 'No harmonic', edit: { type: 'setHarmonic', harmonic: 'none' }, isActive: (c) => c.note?.effect.harmonic === undefined },
    ...HARMONICS.map(([harmonic, label, tooltip]) => ({ label, tooltip, edit: { type: 'setHarmonic', harmonic } as const, isActive: (c: PaletteContext) => c.note?.effect.harmonic?.type === harmonic })),
  ];
  return {
    title: 'Techniques',
    toolWidth: TECHNIQUE_TOOL_WIDTH,
    tools: [
      { id: 'bend', face: 'Bend', key: 'C', tooltip: withKey('Bend (choking): shape and amount', 'C'), scope: 'note', run: { kind: 'panel', panel: 'bend' }, isActive: (c) => c.note?.effect.bend !== undefined },
      { id: 'slide', face: 'Slide', key: 'S', tooltip: withKey('Slides: shift, legato, in and out — the key toggles a shift slide', 'S'), scope: 'note', run: { kind: 'options', options: slides }, isActive: (c) => (c.note?.effect.slides.length ?? 0) > 0 },
      effectTool('hammer', 'H/P', 'Hammer-on / pull-off to the next note — P too', 'hammer', { key: 'H' }),
      { id: 'harmonic', face: 'Harm.', key: 'N', tooltip: withKey('Harmonics — the key toggles a natural harmonic', 'N'), scope: 'note', run: { kind: 'options', options: harmonics }, isActive: (c) => c.note?.effect.harmonic !== undefined },
      effectTool('palmMute', 'P.M.', 'Palm mute', 'palmMute', { key: 'M' }),
      effectTool('letRing', 'L.R.', 'Let ring', 'letRing', { key: 'R' }),
      effectTool('dead', 'Dead', 'Dead (muted) note', 'deadNote', { key: 'X' }),
      {
        id: 'vibrato',
        face: 'Vib.',
        key: 'B',
        tooltip: withKey('Vibrato: slight or wide', 'B'),
        scope: 'note',
        run: { kind: 'panel', panel: 'vibrato' },
        isActive: (c) => c.note !== undefined && vibratoOf(c.note.effect) !== 'none',
      },
      effectTool('ghost', '( )', 'Ghost note', 'ghostNote', { key: 'G' }),
      { id: 'whammy', face: 'W.bar', tooltip: 'Whammy bar', scope: 'note', run: { kind: 'options', options: tremoloBarOptions() }, isActive: (c) => c.note?.effect.tremoloBar !== undefined },
      { id: 'trill', face: GLYPH.trill, glyph: 'mark', tooltip: 'Trill (with the fret 2 above)', scope: 'note', run: { kind: 'options', options: speedOptions('setTrill', [16, 32, 64]) }, isActive: (c) => c.note?.effect.trill !== undefined },
      { id: 'tremoloPicking', face: GLYPH.tremolo, glyph: 'mark', tooltip: 'Tremolo picking', scope: 'note', run: { kind: 'options', options: speedOptions('setTremoloPicking', [8, 16, 32]) }, isActive: (c) => c.note?.effect.tremoloPicking !== undefined },
      { id: 'grace', face: GLYPH.grace, glyph: 'note', tooltip: 'Grace note (2 frets below, hammered)', scope: 'note', run: { kind: 'options', options: graceOptions() }, isActive: (c) => c.note?.effect.grace !== undefined },
      effectTool('tapping', 'Tap', 'Tapping', 'tapping'),
      effectTool('slapping', 'Slap', 'Slap', 'slapping'),
      effectTool('popping', 'Pop', 'Pop', 'popping'),
      effectTool('fadeIn', 'Fade', 'Fade in', 'fadeIn'),
      ...fadeTools(),
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
    // A brush's wavy arrow is taller than a pick-stroke mark.
    glyph: kind === 'setStroke' ? 'stroke' : 'mark',
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
      { id: 'chord', face: 'Chord', key: 'K', tooltip: withKey('Chord diagram: grid, name and chord library', 'K'), scope: 'beat', run: { kind: 'chordPanel' }, isActive: (c) => c.beat?.chord !== undefined },
      rasgueadoTool(),
      ...pedalTools(),
      ...beatMarkTools(),
    ],
  };
}

/**
 * The edition palette, top to bottom: what is set on every note first — voice, rhythm, the note's techniques,
 * articulation, dynamics — so it shows without scrolling above the fretboard and tracks; then the note's fret and
 * string, the beat's strokes and text, and the bar.
 */
export const PALETTE_GROUPS: readonly PaletteGroup[] = [
  voiceGroup(),
  rhythmGroup(),
  techniquesGroup(),
  articulationGroup(),
  dynamicsGroup(),
  noteGroup(),
  strokeGroup(),
  barGroup(),
];
