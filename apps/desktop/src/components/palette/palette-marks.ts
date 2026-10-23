import { type DirectionJump, type Hairpin, MUSICAL_DIRECTIONS, type MusicalDirection, type PedalAction, RASGUEADO_PATTERNS, durationTicks, measureTicks } from '@gp-editor/core';
import { DIRECTION_TEXTS } from '../../score/directions';
import { MARK_GLYPHS } from '../../score/symbols/smufl';
import { rasgueadoFingers } from '../../score/symbols/rasgueado-label';
import type { PaletteContext, PaletteOption, PaletteTool } from './palette-tools';

/** The palette's notation marks: directions (bar), hairpins (dynamics), fades (techniques), rasgueado and pedal (beat). */

/** Labels and tooltips of the targets and of the jumps to a coda; the other jumps are made from DIRECTION_TEXTS. */
const NAMED: Readonly<Partial<Record<MusicalDirection, readonly [string, string]>>> = {
  segno: ['Segno', 'Segno: where a D.S. jump goes back to'],
  segnoSegno: ['Segno Segno', 'Segno segno: where a D.S.S. jump goes back to'],
  coda: ['Coda', 'Coda: where playback goes on from the Da Coda after a jump al Coda'],
  doubleCoda: ['Double Coda', 'Double coda: where playback goes on from the Da Double Coda after a jump al Double Coda'],
  fine: ['Fine', 'Fine: where playback ends after a jump al Fine'],
  daCoda: ['Da Coda', 'Da Coda (“To Coda”): after a jump al Coda, on to the coda from the end of this bar'],
  daDoubleCoda: ['Da Double Coda', 'Da Double Coda (“To Double Coda”): after a jump al Double Coda, on to the double coda from the end of this bar'],
};

const JUMP_FROM: readonly (readonly [string, string])[] = [
  ['daSegnoSegno', 'back to the segno segno'],
  ['daSegno', 'back to the segno'],
  ['daCapo', 'back to the start'],
];

const JUMP_ENDS: readonly (readonly [string, string])[] = [
  ['AlDoubleCoda', ', then from the Da Double Coda on to the double coda'],
  ['AlCoda', ', then from the Da Coda on to the coda'],
  ['AlFine', ', then on to the fine'],
];

/** A jump back: its words and what it does ("D.S. al Coda: back to the segno, then from the Da Coda on to the coda"). */
function jumpName(jump: DirectionJump): readonly [string, string] {
  const from = JUMP_FROM.find(([prefix]) => jump.startsWith(prefix))?.[1] ?? '';
  const end = JUMP_ENDS.find(([suffix]) => jump.endsWith(suffix))?.[1] ?? ', then on to the end';
  return [DIRECTION_TEXTS[jump], `${DIRECTION_TEXTS[jump]}: ${from}${end}`];
}

function directionOption(direction: MusicalDirection): PaletteOption {
  const [label, tooltip] = NAMED[direction] ?? jumpName(direction as DirectionJump);
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
    tooltip: 'Directions on this bar: segno, coda, fine and the jumps (D.C., D.S. al Coda …), which playback follows',
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
    tooltip: `${isCrescendo ? 'Crescendo: louder' : 'Decrescendo: softer'} over the selected beats (or the beat), to the dynamic after it`,
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
  return [fade('fadeOut', 'F.Out', 'Fade out'), fade('volumeSwell', 'Swell', 'Volume swell: louder, then softer')];
}

/** Rasgueado with Guitar Pro's 18 patterns (the Beat group). */
export function rasgueadoTool(): PaletteTool {
  const options: readonly PaletteOption[] = [
    { label: 'None', tooltip: 'No rasgueado', edit: { type: 'setRasgueado', pattern: 'none' }, isActive: (c) => c.beat !== undefined && c.beat.rasgueado === undefined },
    ...RASGUEADO_PATTERNS.map(({ pattern, fingers, rhythm }) => ({
      label: rasgueadoFingers(pattern),
      tooltip: `Rasgueado ${fingers.split('').join('-')}${rhythm === 'anapaest' ? ', anapaest (short, short, long)' : pattern.endsWith('Triplet') ? ', triplet' : ''}`,
      edit: { type: 'setRasgueado', pattern } as const,
      isActive: (c: PaletteContext) => c.beat?.rasgueado === pattern,
    })),
  ];
  return { id: 'rasgueado', face: 'Rasg.', tooltip: 'Rasgueado: the beat strummed by each finger in turn', scope: 'beat', run: { kind: 'options', options }, isActive: (c) => c.beat?.rasgueado !== undefined };
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
    tooltip: isDown ? 'Sustain pedal down (Ped.) where the beat starts' : 'Sustain pedal up (✱) where the beat ends',
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
