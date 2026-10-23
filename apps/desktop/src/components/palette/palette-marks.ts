import { BEAM_GROUPING_PRESETS, type BeamGroupingPreset, type BeamLink, FINGERS, type Finger, type Hand, effectiveBeamGrouping, isSameBeamGrouping, presetBeamGrouping } from '@gp-editor/core';
import { fingeringLabel } from '../../lib/fingering';
import type { SongEdit } from '../../state/song-edits';
import type { PaletteContext, PaletteOption, PaletteTool } from './palette-tools';

/**
 * The palette's notation marks (Guitar Pro 8's fingering, accidental, slash and beam settings): at the end of the
 * Note, Beat and Bar groups.
 */

const FINGER_NAMES: Readonly<Record<Finger, string>> = { thumb: 'Thumb', index: 'Index finger', middle: 'Middle finger', annular: 'Ring finger', little: 'Little finger' };

function fingerOf(context: PaletteContext, hand: Hand): Finger | undefined {
  return hand === 'left' ? context.note?.leftFinger : context.note?.rightFinger;
}

/** The edit setting one finger (or none): of a hand, or the piano's (kept as the left hand's). */
function fingerEdit(hand: Hand | 'piano', finger: Finger | 'none'): SongEdit {
  return hand === 'piano' ? { type: 'setPianoFinger', finger } : { type: 'setFinger', hand, finger };
}

/** None, then each finger as `hand` writes it (the piano's 1–5). */
function fingerOptions(hand: Hand | 'piano', what: string): readonly PaletteOption[] {
  const stored: Hand = hand === 'piano' ? 'left' : hand;
  const none: PaletteOption = { label: 'None', tooltip: `No ${what.toLowerCase()}`, edit: fingerEdit(hand, 'none'), isActive: (c) => c.note !== undefined && fingerOf(c, stored) === undefined };
  return [
    none,
    ...FINGERS.map((finger) => {
      const label = fingeringLabel(finger, stored, hand === 'piano');
      return { label, tooltip: `${what}: ${FINGER_NAMES[finger]} (${label})`, edit: fingerEdit(hand, finger), isActive: (c: PaletteContext) => fingerOf(c, stored) === finger };
    }),
  ];
}

/** Left hand, right hand and piano fingering: three lit buttons, each with its fingers in a strip. */
export function fingeringTools(): readonly PaletteTool[] {
  const tool = (id: string, face: string, tooltip: string, hand: Hand, options: readonly PaletteOption[]): PaletteTool => ({
    id,
    face,
    tooltip,
    scope: 'note',
    run: { kind: 'options', options },
    isActive: (c) => fingerOf(c, hand) !== undefined,
  });
  return [
    tool('leftFinger', 'L.H.', 'Left-hand fingering: T 1 2 3 4, next to the notehead', 'left', fingerOptions('left', 'Left-hand finger')),
    tool('rightFinger', 'R.H.', 'Right-hand fingering: p i m a c, over or under the note', 'right', fingerOptions('right', 'Right-hand finger')),
    tool('pianoFinger', 'Piano', 'Piano fingering: 1–5 (thumb = 1), over or under the note on a keyboard track', 'left', fingerOptions('piano', 'Piano finger')),
  ];
}

/** The note's accidental: as the key and bar need it, as a reminder in parentheses, or always. */
export function accidentalTool(): PaletteTool {
  const options: readonly PaletteOption[] = [
    { label: 'Auto', tooltip: 'Accidental only where the key and the bar need one', edit: { type: 'setAccidentalDisplay', display: 'none' }, isActive: (c) => c.note !== undefined && c.note.accidentalDisplay === undefined },
    { label: '(♯)', tooltip: 'Cautionary accidental: a reminder in parentheses', edit: { type: 'setAccidentalDisplay', display: 'cautionary' }, isActive: (c) => c.note?.accidentalDisplay === 'cautionary' },
    { label: '♯ !', tooltip: 'Forced accidental: always written', edit: { type: 'setAccidentalDisplay', display: 'forced' }, isActive: (c) => c.note?.accidentalDisplay === 'forced' },
  ];
  return { id: 'accidental', face: '(♯)', tooltip: 'Accidental: cautionary (in parentheses) or forced', scope: 'note', run: { kind: 'options', options }, isActive: (c) => c.note?.accidentalDisplay !== undefined };
}

function beamTool(id: string, face: string, tooltip: string, link: BeamLink): PaletteTool {
  return { id, face, tooltip, scope: 'beat', run: { kind: 'edit', edit: { type: 'toggleBeamLink', link } }, isActive: (c) => c.voice?.beamToNext === link };
}

/** The beat's rhythm slash and its beam to the next beat. */
export function beatMarkTools(): readonly PaletteTool[] {
  return [
    { id: 'slash', face: 'Slash', tooltip: 'Slash: write the beat as a rhythm slash', scope: 'beat', run: { kind: 'edit', edit: { type: 'toggleSlash' } }, isActive: (c) => c.voice?.isSlashed === true },
    beamTool('breakBeam', 'Break', 'Break beam: no beam from this beat to the next', 'break'),
    beamTool('joinBeam', 'Join', 'Join beam: beam this beat to the next across the beat', 'join'),
    beamTool('breakSecondaryBeam', 'Break 2', 'Break secondary beams: only the eighth beam goes on to the next beat', 'breakSecondary'),
  ];
}

const PRESET_NAMES: Readonly<Record<BeamGroupingPreset, readonly [string, string]>> = {
  byBeat: ['Beat', 'Beams by the beat (the time signature’s grouping)'],
  byTwoBeats: ['2 beats', 'Beams over two beats'],
  byBar: ['Bar', 'One beam over the whole bar'],
};

function isPresetActive(context: PaletteContext, preset: BeamGroupingPreset): boolean {
  const { header } = context;
  return header !== undefined && isSameBeamGrouping(effectiveBeamGrouping(header), presetBeamGrouping(header.timeSignature, preset));
}

/** The bar's beam groups, from this bar on while the time signature lasts. */
export function beamGroupingTool(): PaletteTool {
  const options = BEAM_GROUPING_PRESETS.map((preset) => {
    const [label, tooltip] = PRESET_NAMES[preset];
    return { label, tooltip, edit: { type: 'setBeamGrouping', preset } as const, isActive: (c: PaletteContext) => isPresetActive(c, preset) };
  });
  return { id: 'beamGrouping', face: 'Beams', tooltip: 'Beam grouping of the bar: by beat, by two beats or the whole bar', scope: 'bar', run: { kind: 'options', options }, isActive: (c) => c.header?.beamGrouping !== undefined };
}
