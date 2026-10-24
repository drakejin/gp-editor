import { type DirectionJump, type Hairpin, MUSICAL_DIRECTIONS, type MusicalDirection, type PedalAction, RASGUEADO_PATTERNS, durationTicks, measureTicks } from '@gp-editor/core';
import { type MessageKey, t } from '../../lib/i18n/i18n';
import { DIRECTION_TEXTS } from '../../score/directions';
import { MARK_GLYPHS } from '../../score/symbols/smufl';
import { rasgueadoFingers } from '../../score/symbols/rasgueado-label';
import type { PaletteContext, PaletteOption, PaletteTool } from './palette-tools';

/** The palette's notation marks: directions (bar), hairpins (dynamics), fades (techniques), rasgueado and pedal (beat). */

/**
 * Labels (the marks' own words, as the score writes them in every language) and tooltip keys of the targets and of the
 * jumps to a coda; the other jumps are made from DIRECTION_TEXTS.
 */
const NAMED: Readonly<Partial<Record<MusicalDirection, readonly [string, MessageKey]>>> = {
  segno: ['Segno', 'palette.direction.segno'], // i18n-exempt: notation
  segnoSegno: ['Segno Segno', 'palette.direction.segnoSegno'], // i18n-exempt: notation
  coda: ['Coda', 'palette.direction.coda'], // i18n-exempt: notation
  doubleCoda: ['Double Coda', 'palette.direction.doubleCoda'], // i18n-exempt: notation
  fine: ['Fine', 'palette.direction.fine'], // i18n-exempt: notation
  daCoda: ['Da Coda', 'palette.direction.daCoda'], // i18n-exempt: notation
  daDoubleCoda: ['Da Double Coda', 'palette.direction.daDoubleCoda'], // i18n-exempt: notation
};

const JUMP_FROM: readonly (readonly [string, MessageKey])[] = [
  ['daSegnoSegno', 'palette.direction.from.segnoSegno'],
  ['daSegno', 'palette.direction.from.segno'],
  ['daCapo', 'palette.direction.from.start'],
];

/** By the jump's id suffix (daCapoAlCoda …), not text. */
const JUMP_ENDS: readonly (readonly [string, MessageKey])[] = [
  ['AlDoubleCoda', 'palette.direction.end.doubleCoda'], // i18n-exempt: an id suffix
  ['AlCoda', 'palette.direction.end.coda'], // i18n-exempt: an id suffix
  ['AlFine', 'palette.direction.end.fine'], // i18n-exempt: an id suffix
];

/** A jump back: its words and what it does ("D.S. al Coda: back to the segno, then from the Da Coda on to the coda"). */
function jumpName(jump: DirectionJump): readonly [string, string] {
  const from = JUMP_FROM.find(([prefix]) => jump.startsWith(prefix))?.[1];
  const end = JUMP_ENDS.find(([suffix]) => jump.endsWith(suffix))?.[1] ?? 'palette.direction.end.end';
  const label = DIRECTION_TEXTS[jump];
  return [label, t('palette.direction.jump', { label, from: from === undefined ? '' : t(from), end: t(end) })];
}

/** A direction's label and what it does, as the palette and Expression Text name it ("D.S. al Coda", "Segno"). */
export function directionName(direction: MusicalDirection): readonly [string, string] {
  const named = NAMED[direction];
  return named === undefined ? jumpName(direction as DirectionJump) : [named[0], t(named[1])];
}

function directionOption(direction: MusicalDirection): PaletteOption {
  const [label, tooltip] = directionName(direction);
  return { label, tooltip, edit: { type: 'toggleDirection', direction }, isActive: (c) => c.header?.directions?.includes(direction) === true };
}

/** The targets and the jumps to a coda first, then the jumps back (D.C. …, D.S. …, D.S.S. …). */
const DIRECTION_ORDER: readonly MusicalDirection[] = [
  ...MUSICAL_DIRECTIONS.filter((direction) => NAMED[direction] !== undefined),
  ...MUSICAL_DIRECTIONS.filter((direction) => NAMED[direction] === undefined),
];

/** The bar's segno, coda, fine and jumps, each on or off (the Bar group). */
export function directionsTool(): PaletteTool {
  return {
    id: 'directions',
    face: MARK_GLYPHS.segno.text,
    glyph: 'mark',
    tooltip: t('palette.tool.directions'),
    scope: 'bar',
    run: { kind: 'options', options: DIRECTION_ORDER.map(directionOption) },
    isActive: (c) => (c.header?.directions?.length ?? 0) > 0,
  };
}

function hairpinTool(hairpin: Hairpin): PaletteTool {
  const isCrescendo = hairpin === 'crescendo';
  return {
    id: hairpin,
    face: (isCrescendo ? MARK_GLYPHS.dynamicCrescendoHairpin : MARK_GLYPHS.dynamicDiminuendoHairpin).text,
    glyph: 'dynamic',
    tooltip: t(isCrescendo ? 'palette.tool.crescendo' : 'palette.tool.decrescendo'),
    scope: 'beat',
    run: { kind: 'edit', edit: { type: 'toggleHairpin', hairpin } },
    isActive: (c) => c.beat?.hairpin === hairpin,
  };
}

/** Crescendo and decrescendo (the Dynamics group). */
export function hairpinTools(): readonly PaletteTool[] {
  return [hairpinTool('crescendo'), hairpinTool('decrescendo')];
}

/** Fade out and volume swell, after fade in (the Techniques group). */
export function fadeTools(): readonly PaletteTool[] {
  const fade = (id: 'fadeOut' | 'volumeSwell', face: string, tooltip: string): PaletteTool => ({
    id,
    face,
    tooltip,
    scope: 'note',
    run: { kind: 'edit', edit: { type: 'toggleEffect', effect: id } },
    isActive: (c) => c.note?.effect[id] === true,
  });
  return [fade('fadeOut', t('palette.face.fadeOut'), t('palette.tool.fadeOut')), fade('volumeSwell', t('palette.face.volumeSwell'), t('palette.tool.volumeSwell'))];
}

/** Rasgueado with Guitar Pro's 18 patterns (the Beat group). */
export function rasgueadoTool(): PaletteTool {
  const options: readonly PaletteOption[] = [
    { label: t('common.none'), tooltip: t('palette.option.noRasgueado'), edit: { type: 'setRasgueado', pattern: 'none' }, isActive: (c) => c.beat !== undefined && c.beat.rasgueado === undefined },
    ...RASGUEADO_PATTERNS.map(({ pattern, fingers, rhythm }) => ({
      label: rasgueadoFingers(pattern),
      tooltip: t('palette.option.rasgueado', {
        fingers: fingers.split('').join('-'),
        // i18n-exempt: a pattern id ('…Triplet'), not text
        rhythm: rhythm === 'anapaest' ? t('palette.option.rasgueado.anapaest') : pattern.endsWith('Triplet') ? t('palette.option.rasgueado.triplet') : '',
      }),
      edit: { type: 'setRasgueado', pattern } as const,
      isActive: (c: PaletteContext) => c.beat?.rasgueado === pattern,
    })),
  ];
  // i18n-exempt: the score's mark (rasg.)
  return { id: 'rasgueado', face: 'Rasg.', tooltip: t('palette.tool.rasgueado'), scope: 'beat', run: { kind: 'options', options }, isActive: (c) => c.beat?.rasgueado !== undefined };
}

/** Where the cursor's beat starts ('down') or ends ('up') in its bar, in ticks; undefined without a beat. */
function pedalOffset(c: PaletteContext, action: PedalAction): number | undefined {
  const { beat, voice, header } = c;
  if (beat === undefined || voice === undefined || header === undefined || voice.isEmpty) {
    return undefined;
  }
  const start = beat.start - header.start;
  const offset = action === 'down' ? start : start + durationTicks(voice.duration);
  return Math.min(measureTicks(header.timeSignature.numerator, header.timeSignature.denominator), offset);
}

function pedalTool(action: PedalAction): PaletteTool {
  const isDown = action === 'down';
  return {
    id: isDown ? 'pedalDown' : 'pedalUp',
    face: (isDown ? MARK_GLYPHS.keyboardPedalPed : MARK_GLYPHS.keyboardPedalUp).text,
    glyph: 'mark',
    tooltip: t(isDown ? 'palette.tool.pedalDown' : 'palette.tool.pedalUp'),
    scope: 'beat',
    run: { kind: 'edit', edit: { type: 'togglePedal', action } },
    isActive: (c) => {
      const offset = pedalOffset(c, action);
      return offset !== undefined && (c.measure?.pedals ?? []).some((mark) => mark.action === action && mark.offset === offset);
    },
  };
}

/** Sustain pedal down and up (the Beat group). */
export function pedalTools(): readonly PaletteTool[] {
  return [pedalTool('down'), pedalTool('up')];
}
