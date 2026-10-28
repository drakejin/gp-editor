import { BEAM_GROUPING_PRESETS, type BeamGroupingPreset, type BeamLink, FINGERS, type Finger, type Hand, effectiveBeamGrouping, isSameBeamGrouping, presetBeamGrouping } from '@gp-editor/core';
import { fingeringLabel } from '../../lib/fingering';
import { type MessageKey, t } from '../../lib/i18n/i18n';
import type { SongEdit } from '../../state/song-edits';
import type { PaletteContext, PaletteOption, PaletteTool } from './palette-tools';

/**
 * The palette's notation marks (Guitar Pro 8's fingering, accidental, slash and beam settings): at the end of the
 * Note, Beat and Bar groups.
 */

const FINGER_NAMES: Readonly<Record<Finger, MessageKey>> = {
  thumb: 'palette.finger.thumb',
  index: 'palette.finger.index',
  middle: 'palette.finger.middle',
  annular: 'palette.finger.ring',
  little: 'palette.finger.little',
};

/** Whose fingers a strip sets: the "none" tooltip and the name before each finger. */
const FINGERING_KINDS: Readonly<Record<Hand | 'piano', readonly [MessageKey, MessageKey]>> = {
  left: ['palette.fingering.left.none', 'palette.fingering.left.finger'],
  right: ['palette.fingering.right.none', 'palette.fingering.right.finger'],
  piano: ['palette.fingering.piano.none', 'palette.fingering.piano.finger'],
};

function fingerOf(context: PaletteContext, hand: Hand): Finger | undefined {
  return hand === 'left' ? context.note?.leftFinger : context.note?.rightFinger;
}

/** The edit setting one finger (or none): of a hand, or the piano's (kept as the left hand's). */
function fingerEdit(hand: Hand | 'piano', finger: Finger | 'none'): SongEdit {
  return hand === 'piano' ? { type: 'setPianoFinger', finger } : { type: 'setFinger', hand, finger };
}

/** None, then each finger as `hand` writes it (the piano's 1–5). */
function fingerOptions(hand: Hand | 'piano'): readonly PaletteOption[] {
  const stored: Hand = hand === 'piano' ? 'left' : hand;
  const [noneKey, whatKey] = FINGERING_KINDS[hand];
  const none: PaletteOption = { label: t('common.none'), tooltip: t(noneKey), edit: fingerEdit(hand, 'none'), isActive: (c) => c.note !== undefined && fingerOf(c, stored) === undefined };
  return [
    none,
    ...FINGERS.map((finger) => {
      const label = fingeringLabel(finger, stored, hand === 'piano');
      return { label, tooltip: t('palette.fingering.option', { what: t(whatKey), finger: t(FINGER_NAMES[finger]), label }), edit: fingerEdit(hand, finger), isActive: (c: PaletteContext) => fingerOf(c, stored) === finger };
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
    tool('leftFinger', t('palette.face.leftFinger'), t('palette.tool.leftFinger'), 'left', fingerOptions('left')),
    tool('rightFinger', t('palette.face.rightFinger'), t('palette.tool.rightFinger'), 'right', fingerOptions('right')),
    tool('pianoFinger', t('palette.face.pianoFinger'), t('palette.tool.pianoFinger'), 'left', fingerOptions('piano')),
  ];
}

/** The note's accidental: as the key and bar need it, as a reminder in parentheses, or always. */
export function accidentalTool(): PaletteTool {
  const options: readonly PaletteOption[] = [
    { label: t('palette.option.accidentalAuto'), tooltip: t('palette.option.accidentalAuto.tooltip'), edit: { type: 'setAccidentalDisplay', display: 'none' }, isActive: (c) => c.note !== undefined && c.note.accidentalDisplay === undefined },
    { label: '(♯)', tooltip: t('palette.option.accidentalCautionary'), edit: { type: 'setAccidentalDisplay', display: 'cautionary' }, isActive: (c) => c.note?.accidentalDisplay === 'cautionary' },
    { label: '♯ !', tooltip: t('palette.option.accidentalForced'), edit: { type: 'setAccidentalDisplay', display: 'forced' }, isActive: (c) => c.note?.accidentalDisplay === 'forced' },
  ];
  return { id: 'accidental', face: '(♯)', tooltip: t('palette.tool.accidental'), scope: 'note', run: { kind: 'options', options }, isActive: (c) => c.note?.accidentalDisplay !== undefined };
}

function beamTool(id: string, face: string, tooltip: string, link: BeamLink): PaletteTool {
  return { id, face, tooltip, scope: 'beat', run: { kind: 'edit', edit: { type: 'toggleBeamLink', link } }, isActive: (c) => c.voice?.beamToNext === link };
}

/** The beat's rhythm slash and its beam to the next beat; short faces keep the four on one row of the Beat group. */
export function beatMarkTools(): readonly PaletteTool[] {
  const slash: PaletteTool = {
    id: 'slash',
    face: '/',
    tooltip: t('palette.tool.slash'),
    scope: 'beat',
    run: { kind: 'edit', edit: { type: 'toggleSlash' } },
    isActive: (c) => c.voice?.isSlashed === true,
  };
  return [
    slash,
    beamTool('breakBeam', t('palette.face.breakBeam'), t('palette.tool.breakBeam'), 'break'),
    beamTool('joinBeam', t('palette.face.joinBeam'), t('palette.tool.joinBeam'), 'join'),
    beamTool('breakSecondaryBeam', t('palette.face.breakSecondaryBeam'), t('palette.tool.breakSecondaryBeam'), 'breakSecondary'),
  ];
}

const PRESET_NAMES: Readonly<Record<BeamGroupingPreset, readonly [MessageKey, MessageKey]>> = {
  byBeat: ['palette.option.beamByBeat', 'palette.option.beamByBeat.tooltip'],
  byTwoBeats: ['palette.option.beamByTwoBeats', 'palette.option.beamByTwoBeats.tooltip'],
  byBar: ['palette.option.beamByBar', 'palette.option.beamByBar.tooltip'],
};

function isPresetActive(context: PaletteContext, preset: BeamGroupingPreset): boolean {
  const { header } = context;
  return header !== undefined && isSameBeamGrouping(effectiveBeamGrouping(header), presetBeamGrouping(header.timeSignature, preset));
}

/** The bar's beam groups, from this bar on while the time signature lasts. */
export function beamGroupingTool(): PaletteTool {
  const options = BEAM_GROUPING_PRESETS.map((preset) => {
    const [label, tooltip] = PRESET_NAMES[preset];
    return { label: t(label), tooltip: t(tooltip), edit: { type: 'setBeamGrouping', preset } as const, isActive: (c: PaletteContext) => isPresetActive(c, preset) };
  });
  return { id: 'beamGrouping', face: t('palette.face.beamGrouping'), tooltip: t('palette.tool.beamGrouping'), scope: 'bar', run: { kind: 'options', options }, isActive: (c) => c.header?.beamGrouping !== undefined };
}
