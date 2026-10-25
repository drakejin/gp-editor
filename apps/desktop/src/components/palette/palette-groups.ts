import {
  type DynamicName,
  type HarmonicType,
  type NoteValue,
  type SlideType,
  type StrokeDirection,
  TUPLET_SIZES,
  type ToggleableEffect,
  type TripletFeel,
  dynamicOf,
  vibratoOf,
} from '@gp-editor/core';
import { type MessageKey, memoByLanguage, t } from '../../lib/i18n/i18n';
import { parseTempoText } from '../../lib/practice-tempo';
import { DYNAMIC_GLYPHS, PICK_STROKE_GLYPHS } from '../../score/symbols/smufl';
import { voiceTint } from '../../score/voices';
import type { SongEdit } from '../../state/song-edits';
import type { GlyphKind } from './MusicIcon';
import { directionsTool, fadeTools, hairpinTools, pedalTools, rasgueadoTool } from './palette-marks';
import { accidentalTool, beamGroupingTool, beatMarkTools, fingeringTools } from './palette-notation';
import { clefTool, expressionTextTool, ottavaTool } from './palette-expression';
import { type PaletteContext, type PaletteGroup, type PaletteOption, type PaletteRun, type PaletteStepper, type PaletteTool } from './palette-tools';

const edit = (songEdit: SongEdit): PaletteRun => ({ kind: 'edit', edit: songEdit });

/** A tooltip that names the tool's key, as the shortcut sheet does. */
const withKey = (name: string, key: string | undefined): string => (key === undefined ? name : `${name} (${key})`);

/** An on/off note effect: pressing toggles it, the button is lit while the note has it. */
function effectTool(id: string, face: string, name: MessageKey, effect: ToggleableEffect, look: { readonly glyph?: GlyphKind; readonly key?: string } = {}): PaletteTool {
  const { glyph, key } = look;
  return { id, face, glyph, key, tooltip: withKey(t(name), key), scope: 'note', run: edit({ type: 'toggleEffect', effect }), isActive: (context) => context.note?.effect[effect] === true };
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

const NOTE_VALUES: readonly (readonly [NoteValue, string, MessageKey])[] = [
  [1, '', 'palette.noteValue.whole'],
  [2, '', 'palette.noteValue.half'],
  [4, '', 'palette.noteValue.quarter'],
  [8, '', 'palette.noteValue.eighth'],
  [16, '', 'palette.noteValue.16th'],
  [32, '', 'palette.noteValue.32nd'],
  [64, '', 'palette.noteValue.64th'],
];

const DYNAMIC_ORDER: readonly DynamicName[] = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];

const SLIDES: readonly SlideType[] = ['shift', 'legato', 'intoFromBelow', 'intoFromAbove', 'outDownwards', 'outUpwards'];

/** The harmonics' faces copy the score's marks. */
const HARMONICS: readonly (readonly [HarmonicType, string])[] = [
  ['natural', 'N.H.'], // i18n-exempt: notation abbreviation
  ['artificial', 'A.H.'], // i18n-exempt: notation abbreviation
  ['tapped', 'T.H.'], // i18n-exempt: notation abbreviation
  ['pinch', 'P.H.'], // i18n-exempt: notation abbreviation
  ['semi', 'S.H.'], // i18n-exempt: notation abbreviation
];

const VOICE_INDEXES = [0, 1, 2, 3] as const;
/** Seven tools on one row: the four voices, Move Voice, Multivoice and Design Mode. */
const VOICE_TOOL_WIDTH = 26;

/**
 * Guitar Pro 8's voices: the four, each in its voice's colour (⌘1–⌘4), Move Voice (⌥1–⌥4) and Multivoice (every
 * voice edited at once, none faded).
 */
function voiceGroup(): PaletteGroup {
  const voiceTool = (voiceIndex: number): PaletteTool => ({
    id: `voice${voiceIndex + 1}`,
    face: String(voiceIndex + 1),
    tooltip: t(`palette.tool.voice${voiceIndex + 1}` as MessageKey),
    scope: 'beat',
    run: { kind: 'action', action: { type: 'selectVoice', voiceIndex } },
    isActive: (context) => context.cursor?.voiceIndex === voiceIndex,
    tint: (palette) => voiceTint(voiceIndex, palette),
  });
  const moves: readonly PaletteOption[] = VOICE_INDEXES.map((voiceIndex) => ({
    label: `→ ${voiceIndex + 1}`,
    tooltip: t('palette.option.moveToVoice', { number: voiceIndex + 1 }),
    edit: { type: 'moveToVoice', voiceIndex },
  }));
  return {
    id: 'voice',
    title: t('palette.group.voice'),
    toolWidth: VOICE_TOOL_WIDTH,
    tools: [
      ...VOICE_INDEXES.map(voiceTool),
      { id: 'moveVoice', face: '⇄', tooltip: t('palette.tool.moveVoice'), scope: 'beat', run: { kind: 'options', options: moves } },
      {
        id: 'multivoice',
        face: '1–4',
        tooltip: t('palette.tool.multivoice'),
        scope: 'beat',
        run: { kind: 'action', action: { type: 'toggleMultivoice' } },
        isActive: (context) => context.isMultivoice === true,
      },
      // Guitar Pro 8 puts Design Mode right of the voices.
      {
        id: 'designMode',
        face: '↔',
        tooltip: t('palette.tool.designMode'),
        scope: 'bar',
        run: { kind: 'action', action: { type: 'toggleDesignMode' } },
        isActive: (context) => context.isDesignMode === true,
      },
    ],
  };
}

/** Alternate endings 1–8, lit where the bar has them. */
function endingsTool(): PaletteTool {
  const endings: readonly PaletteOption[] = [1, 2, 3, 4, 5, 6, 7, 8].map((ending) => ({
    label: `${ending}.`,
    tooltip: t('palette.option.ending', { number: ending }),
    edit: { type: 'toggleAlternateEnding', ending },
    isActive: (context: PaletteContext) => ((context.header?.repeatAlternative ?? 0) & (1 << (ending - 1))) !== 0, // eslint-disable-line no-bitwise
  }));
  return { id: 'endings', face: '1. 2.', tooltip: t('palette.tool.endings'), scope: 'bar', run: { kind: 'options', options: endings }, isActive: (c) => (c.header?.repeatAlternative ?? 0) !== 0 };
}

/** The bar's triplet feel: none, eighths, sixteenths. */
function tripletFeelTool(): PaletteTool {
  const feels: readonly TripletFeel[] = ['none', 'eighth', 'sixteenth'];
  return {
    id: 'tripletFeel',
    face: '♪³',
    tooltip: t('palette.tool.tripletFeel'),
    scope: 'bar',
    run: {
      kind: 'options',
      options: feels.map((feel) => ({
        label: t(`palette.option.feel.${feel}` as MessageKey),
        tooltip: t(`palette.option.feel.${feel}.tooltip` as MessageKey),
        edit: { type: 'setTripletFeel', feel },
        isActive: (c: PaletteContext) => c.header?.tripletFeel === feel,
      })),
    },
    isActive: (c) => (c.header?.tripletFeel ?? 'none') !== 'none',
  };
}

/** The bar's time signature (its two numbers on one row), tempo (typed too), key and repeat count. */
function barSteppers(): readonly PaletteStepper[] {
  return [
    { id: 'numerator', label: t('palette.stepper.numerator'), tooltip: t('palette.stepper.numerator.tooltip'), value: (c) => String(c.header?.timeSignature.numerator ?? '–'), minus: { type: 'shiftTimeSignature', part: 'numerator', delta: -1 }, plus: { type: 'shiftTimeSignature', part: 'numerator', delta: 1 } },
    { id: 'denominator', label: t('palette.stepper.denominator'), tooltip: t('palette.stepper.denominator.tooltip'), value: (c) => `÷${c.header?.timeSignature.denominator ?? '–'}`, minus: { type: 'shiftTimeSignature', part: 'denominator', delta: -1 }, plus: { type: 'shiftTimeSignature', part: 'denominator', delta: 1 }, isBesidePrevious: true },
    {
      id: 'tempo',
      label: t('palette.stepper.tempo'),
      tooltip: t('palette.stepper.tempo.tooltip'),
      value: (c) => `♩ ${c.header?.tempo ?? '–'}`,
      minus: { type: 'shiftTempo', delta: -5 },
      plus: { type: 'shiftTempo', delta: 5 },
      typed: { placeholder: t('palette.stepper.tempo.placeholder'), value: (c) => String(c.header?.tempo ?? ''), edit: (text) => ({ type: 'setTempo', tempo: parseTempoText(text) ?? Number.NaN }) },
    },
    // i18n-exempt: key names (C / Am)
    { id: 'key', label: t('palette.stepper.key'), tooltip: t('palette.stepper.key.tooltip'), value: (c) => (c.keySignature === 0 ? 'C / Am' : `${Math.abs(c.keySignature)}${c.keySignature > 0 ? '♯' : '♭'}`), minus: { type: 'shiftKeySignature', delta: -1 }, plus: { type: 'shiftKeySignature', delta: 1 } },
    { id: 'repeats', label: t('palette.stepper.repeats'), tooltip: t('palette.stepper.repeats.tooltip'), value: (c) => ((c.header?.repeatClose ?? 0) > 0 ? `×${c.header?.repeatClose}` : '–'), minus: { type: 'shiftRepeatCount', delta: -1 }, plus: { type: 'shiftRepeatCount', delta: 1 }, isEnabled: (c) => (c.header?.repeatClose ?? 0) > 0 },
  ];
}

function barGroup(): PaletteGroup {
  return {
    id: 'bar',
    title: t('palette.group.bar'),
    tools: [
      { id: 'insertMeasure', face: t('palette.face.insertMeasure'), tooltip: t('palette.tool.insertMeasure'), scope: 'bar', run: edit({ type: 'insertMeasure' }) },
      { id: 'deleteMeasure', face: t('palette.face.deleteMeasure'), tooltip: t('palette.tool.deleteMeasure'), scope: 'bar', run: edit({ type: 'deleteMeasure' }) },
      { id: 'repeatOpen', face: GLYPH.repeatOpen, glyph: 'barline', tooltip: t('palette.tool.repeatOpen'), scope: 'bar', run: edit({ type: 'toggleRepeatOpen' }), isActive: (c) => c.header?.repeatOpen === true },
      { id: 'repeatClose', face: GLYPH.repeatClose, glyph: 'barline', tooltip: t('palette.tool.repeatClose'), scope: 'bar', run: edit({ type: 'toggleRepeatClose' }), isActive: (c) => (c.header?.repeatClose ?? 0) > 0 },
      endingsTool(),
      tripletFeelTool(),
      {
        id: 'section',
        face: 'A',
        tooltip: t('palette.tool.section'),
        scope: 'bar',
        run: { kind: 'text', placeholder: t('palette.tool.section.placeholder'), value: (c) => c.header?.marker?.title ?? '', edit: (title) => ({ type: 'setSection', title }) },
        isActive: (c) => c.header?.marker !== undefined,
      },
      directionsTool(),
      beamGroupingTool(),
      clefTool(),
    ],
    steppers: barSteppers(),
  };
}

function rhythmGroup(): PaletteGroup {
  const values: readonly PaletteTool[] = NOTE_VALUES.map(([value, face, name]) => ({
    id: `value${value}`,
    face,
    glyph: 'note',
    tooltip: t('palette.tool.noteValue', { name: t(name) }),
    scope: 'beat',
    run: edit({ type: 'setNoteValue', value }),
    isActive: (c) => c.voice?.duration.value === value,
  }));
  const tuplets: readonly PaletteOption[] = [
    { label: t('common.none'), tooltip: t('palette.option.noTuplet'), edit: { type: 'setTuplet', enters: 1 }, isActive: (c) => c.voice?.duration.tuplet.enters === c.voice?.duration.tuplet.times },
    ...TUPLET_SIZES.map((enters) => ({ label: String(enters), tooltip: t('palette.option.tuplet', { enters }), edit: { type: 'setTuplet', enters } as const, isActive: (c: PaletteContext) => c.voice?.duration.tuplet.enters === enters })),
  ];
  const innerTuplets: readonly PaletteOption[] = [
    { label: t('common.none'), tooltip: t('palette.option.noInnerTuplet'), edit: { type: 'setInnerTuplet', enters: 1 }, isActive: (c) => c.voice !== undefined && c.voice.duration.innerTuplet === undefined },
    ...TUPLET_SIZES.map((enters) => ({ label: String(enters), tooltip: t('palette.option.innerTuplet', { enters }), edit: { type: 'setInnerTuplet', enters } as const, isActive: (c: PaletteContext) => c.voice?.duration.innerTuplet?.enters === enters })),
  ];
  return {
    id: 'rhythm',
    title: t('palette.group.rhythm'),
    tools: [
      ...values,
      { id: 'dot', face: GLYPH.dot, glyph: 'mark', tooltip: t('palette.tool.dot'), scope: 'beat', run: edit({ type: 'toggleDot' }), isActive: (c) => c.voice?.duration.dotted === true },
      { id: 'tuplet', face: GLYPH.tuplet, glyph: 'mark', tooltip: t('palette.tool.tuplet'), scope: 'beat', run: { kind: 'options', options: tuplets }, isActive: (c) => c.voice !== undefined && c.voice.duration.tuplet.enters !== c.voice.duration.tuplet.times },
      { id: 'innerTuplet', face: t('palette.face.innerTuplet'), tooltip: t('palette.tool.innerTuplet'), scope: 'beat', run: { kind: 'options', options: innerTuplets }, isActive: (c) => c.voice?.duration.innerTuplet !== undefined },
      { id: 'rest', face: GLYPH.rest, glyph: 'mark', tooltip: t('palette.tool.rest'), scope: 'beat', run: edit({ type: 'makeRest' }), isActive: (c) => c.voice !== undefined && !c.voice.isEmpty && c.voice.notes.length === 0 },
      { id: 'tie', face: t('palette.face.tie'), tooltip: t('palette.tool.tie'), scope: 'note', run: edit({ type: 'toggleTie' }), isActive: (c) => c.note?.isTied === true },
      { id: 'insertBeat', face: t('palette.face.insertBeat'), tooltip: t('palette.tool.insertBeat'), scope: 'beat', run: edit({ type: 'insertBeat' }) },
      { id: 'deleteBeat', face: t('palette.face.deleteBeat'), tooltip: t('palette.tool.deleteBeat'), scope: 'beat', run: edit({ type: 'deleteBeat' }) },
    ],
  };
}

function noteGroup(): PaletteGroup {
  return {
    id: 'note',
    title: t('palette.group.note'),
    tools: [
      { id: 'fretDown', face: t('palette.face.fretDown'), tooltip: t('palette.tool.fretDown'), scope: 'note', run: { kind: 'action', action: { type: 'shiftNoteFret', delta: -1 } } },
      { id: 'fretUp', face: t('palette.face.fretUp'), tooltip: t('palette.tool.fretUp'), scope: 'note', run: { kind: 'action', action: { type: 'shiftNoteFret', delta: 1 } } },
      { id: 'stringUp', face: t('palette.face.stringUp'), tooltip: t('palette.tool.stringUp'), scope: 'note', run: { kind: 'action', action: { type: 'shiftNoteString', delta: -1 } } },
      { id: 'stringDown', face: t('palette.face.stringDown'), tooltip: t('palette.tool.stringDown'), scope: 'note', run: { kind: 'action', action: { type: 'shiftNoteString', delta: 1 } } },
      { id: 'deleteNote', face: t('palette.face.deleteNote'), tooltip: t('palette.tool.deleteNote'), scope: 'note', run: { kind: 'action', action: { type: 'deleteNote' } } },
      ...fingeringTools(),
      accidentalTool(),
    ],
  };
}

function dynamicsGroup(): PaletteGroup {
  return {
    id: 'dynamics',
    title: t('palette.group.dynamics'),
    tools: [
      ...DYNAMIC_ORDER.map((dynamic): PaletteTool => ({
        id: `dynamic-${dynamic}`,
        face: DYNAMIC_GLYPHS[dynamic].text,
        glyph: 'dynamic',
        tooltip: t('palette.tool.dynamic', { dynamic }),
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
    id: 'articulation',
    title: t('palette.group.articulation'),
    toolWidth: TECHNIQUE_TOOL_WIDTH,
    tools: [
      effectTool('accent', GLYPH.accent, 'palette.tool.accent', 'accentuatedNote', { glyph: 'articulation', key: 'A' }),
      effectTool('heavyAccent', GLYPH.marcato, 'palette.tool.heavyAccent', 'heavyAccentuatedNote', { glyph: 'articulation' }),
      effectTool('staccato', GLYPH.staccato, 'palette.tool.staccato', 'staccato', { glyph: 'articulation' }),
    ],
  };
}

/** Everything played on the note, the ones with a key first (in the order guitarists name them). */
function techniquesGroup(): PaletteGroup {
  const slides: readonly PaletteOption[] = SLIDES.map((slide) => ({ label: t(`palette.option.slide.${slide}` as MessageKey), tooltip: t(`palette.option.slide.${slide}.tooltip` as MessageKey), edit: { type: 'toggleSlideType', slide }, isActive: (c) => c.note?.effect.slides.includes(slide) === true }));
  const harmonics: readonly PaletteOption[] = [
    { label: t('common.none'), tooltip: t('palette.option.noHarmonic'), edit: { type: 'setHarmonic', harmonic: 'none' }, isActive: (c) => c.note?.effect.harmonic === undefined },
    ...HARMONICS.map(([harmonic, label]) => ({ label, tooltip: t(`palette.option.harmonic.${harmonic}` as MessageKey), edit: { type: 'setHarmonic', harmonic } as const, isActive: (c: PaletteContext) => c.note?.effect.harmonic?.type === harmonic })),
  ];
  return {
    id: 'techniques',
    title: t('palette.group.techniques'),
    toolWidth: TECHNIQUE_TOOL_WIDTH,
    tools: [
      { id: 'bend', face: t('palette.face.bend'), key: 'C', tooltip: withKey(t('palette.tool.bend'), 'C'), scope: 'note', run: { kind: 'panel', panel: 'bend' }, isActive: (c) => c.note?.effect.bend !== undefined },
      { id: 'slide', face: t('palette.face.slide'), key: 'S', tooltip: withKey(t('palette.tool.slide'), 'S'), scope: 'note', run: { kind: 'options', options: slides }, isActive: (c) => (c.note?.effect.slides.length ?? 0) > 0 },
      effectTool('hammer', 'H/P', 'palette.tool.hammer', 'hammer', { key: 'H' }), // i18n-exempt: notation abbreviation
      { id: 'harmonic', face: t('palette.face.harmonic'), key: 'N', tooltip: withKey(t('palette.tool.harmonic'), 'N'), scope: 'note', run: { kind: 'options', options: harmonics }, isActive: (c) => c.note?.effect.harmonic !== undefined },
      effectTool('palmMute', 'P.M.', 'palette.tool.palmMute', 'palmMute', { key: 'M' }), // i18n-exempt: notation abbreviation
      effectTool('letRing', 'L.R.', 'palette.tool.letRing', 'letRing', { key: 'R' }), // i18n-exempt: notation abbreviation
      effectTool('dead', t('palette.face.dead'), 'palette.tool.dead', 'deadNote', { key: 'X' }),
      {
        id: 'vibrato',
        face: t('palette.face.vibrato'),
        key: 'B',
        tooltip: withKey(t('palette.tool.vibrato'), 'B'),
        scope: 'note',
        run: { kind: 'panel', panel: 'vibrato' },
        isActive: (c) => c.note !== undefined && vibratoOf(c.note.effect) !== 'none',
      },
      effectTool('ghost', '( )', 'palette.tool.ghost', 'ghostNote', { key: 'G' }),
      // i18n-exempt: Guitar Pro's abbreviation (W.bar)
      { id: 'whammy', face: 'W.bar', tooltip: t('palette.tool.whammy'), scope: 'note', run: { kind: 'panel', panel: 'tremoloBar' }, isActive: (c) => c.note?.effect.tremoloBar !== undefined },
      { id: 'trill', face: GLYPH.trill, glyph: 'mark', tooltip: t('palette.tool.trill'), scope: 'note', run: { kind: 'options', options: speedOptions('setTrill', [16, 32, 64]) }, isActive: (c) => c.note?.effect.trill !== undefined },
      { id: 'tremoloPicking', face: GLYPH.tremolo, glyph: 'mark', tooltip: t('palette.tool.tremoloPicking'), scope: 'note', run: { kind: 'options', options: speedOptions('setTremoloPicking', [8, 16, 32]) }, isActive: (c) => c.note?.effect.tremoloPicking !== undefined },
      { id: 'grace', face: GLYPH.grace, glyph: 'note', tooltip: t('palette.tool.grace'), scope: 'note', run: { kind: 'options', options: graceOptions() }, isActive: (c) => c.note?.effect.grace !== undefined },
      effectTool('tapping', t('palette.face.tapping'), 'palette.tool.tapping', 'tapping'),
      effectTool('slapping', t('palette.face.slapping'), 'palette.tool.slapping', 'slapping'),
      effectTool('popping', t('palette.face.popping'), 'palette.tool.popping', 'popping'),
      effectTool('fadeIn', t('palette.face.fadeIn'), 'palette.tool.fadeIn', 'fadeIn'),
      ...fadeTools(),
    ],
  };
}

function speedOptions(type: 'setTrill' | 'setTremoloPicking', speeds: readonly (8 | 16 | 32 | 64)[]): readonly PaletteOption[] {
  const current = (c: PaletteContext) => (type === 'setTrill' ? c.note?.effect.trill?.duration.value : c.note?.effect.tremoloPicking?.duration.value);
  const option = (speed: 8 | 16 | 32 | 64): PaletteOption => ({
    label: `1/${speed}`,
    tooltip: t(type === 'setTrill' ? 'palette.option.trillSpeed' : 'palette.option.tremoloSpeed', { speed }),
    edit: (type === 'setTrill' ? { type, speed } : { type, speed }) as SongEdit,
    isActive: (c) => current(c) === speed,
  });
  return [{ label: t('common.none'), tooltip: t('common.off'), edit: { type, speed: 'none' } as SongEdit, isActive: (c) => current(c) === undefined }, ...speeds.map(option)];
}

function graceOptions(): readonly PaletteOption[] {
  return [
    { label: t('common.none'), tooltip: t('palette.option.noGrace'), edit: { type: 'setGrace', grace: 'none' }, isActive: (c) => c.note?.effect.grace === undefined },
    { label: t('palette.option.graceBeforeBeat'), tooltip: t('palette.option.graceBeforeBeat.tooltip'), edit: { type: 'setGrace', grace: 'beforeBeat' }, isActive: (c) => c.note?.effect.grace?.onBeat === false },
    { label: t('palette.option.graceOnBeat'), tooltip: t('palette.option.graceOnBeat.tooltip'), edit: { type: 'setGrace', grace: 'onBeat' }, isActive: (c) => c.note?.effect.grace?.onBeat === true },
  ];
}

function strokeGroup(): PaletteGroup {
  const stroke = (id: string, face: string, tooltip: MessageKey, direction: StrokeDirection, kind: 'setStroke' | 'setPickStroke'): PaletteTool => ({
    id,
    face,
    // A brush's wavy arrow is taller than a pick-stroke mark.
    glyph: kind === 'setStroke' ? 'stroke' : 'mark',
    tooltip: t(tooltip),
    scope: 'beat',
    run: { kind: 'edit', edit: { type: kind, direction } },
    isActive: (c) => (kind === 'setStroke' ? c.beat?.stroke.direction : c.beat?.pickStroke) === direction,
  });
  return {
    id: 'beat',
    title: t('palette.group.beat'),
    tools: [
      stroke('brushDown', GLYPH.brushDown, 'palette.tool.brushDown', 'down', 'setStroke'),
      stroke('brushUp', GLYPH.brushUp, 'palette.tool.brushUp', 'up', 'setStroke'),
      stroke('pickDown', GLYPH.downBow, 'palette.tool.pickDown', 'down', 'setPickStroke'),
      stroke('pickUp', GLYPH.upBow, 'palette.tool.pickUp', 'up', 'setPickStroke'),
      {
        id: 'text',
        face: t('palette.face.text'),
        tooltip: t('palette.tool.text'),
        scope: 'beat',
        run: { kind: 'text', placeholder: t('palette.tool.text'), value: (c) => c.beat?.text ?? '', edit: (text) => ({ type: 'setBeatText', text }) },
        isActive: (c) => (c.beat?.text ?? '') !== '',
      },
      { id: 'chord', face: t('palette.face.chord'), key: 'K', tooltip: withKey(t('palette.tool.chord'), 'K'), scope: 'beat', run: { kind: 'chordPanel' }, isActive: (c) => c.beat?.chord !== undefined },
      rasgueadoTool(),
      ...pedalTools(),
      expressionTextTool(),
      ...beatMarkTools(),
      ottavaTool(),
    ],
  };
}

/**
 * The edition palette, top to bottom: what is set on every note first — voice, rhythm, the note's techniques,
 * articulation, dynamics — so it shows without scrolling above the fretboard and tracks; then the note's fret and
 * string, the beat's strokes and text, and the bar. Built once per language: call it where the groups are shown.
 */
export const paletteGroups: () => readonly PaletteGroup[] = memoByLanguage(() => [
  voiceGroup(),
  rhythmGroup(),
  techniquesGroup(),
  articulationGroup(),
  dynamicsGroup(),
  noteGroup(),
  strokeGroup(),
  barGroup(),
]);
