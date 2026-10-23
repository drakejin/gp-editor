// Guitar Pro's musical directions (no TuxGuitar counterpart: TuxGuitar skips them): GP5's slots and GPIF's names.
import type { DirectionJump, DirectionTarget, MusicalDirection } from '../../model/song';

/** The targets, in GP5's slot order. */
export const DIRECTION_TARGETS: readonly DirectionTarget[] = ['coda', 'doubleCoda', 'segno', 'segnoSegno', 'fine'];

/** The jumps, in GP5's slot order (also the order playback tries them in when a bar holds several). */
export const DIRECTION_JUMPS: readonly DirectionJump[] = [
  'daCapo',
  'daCapoAlCoda',
  'daCapoAlDoubleCoda',
  'daCapoAlFine',
  'daSegno',
  'daSegnoAlCoda',
  'daSegnoAlDoubleCoda',
  'daSegnoAlFine',
  'daSegnoSegno',
  'daSegnoSegnoAlCoda',
  'daSegnoSegnoAlDoubleCoda',
  'daSegnoSegnoAlFine',
  'daCoda',
  'daDoubleCoda',
];

/**
 * Every direction in GP5's order: the 19 measure numbers after the channels of a GP5 file (pyguitarpro's
 * readDirections), and the order a measure header keeps its directions in.
 */
export const MUSICAL_DIRECTIONS: readonly MusicalDirection[] = [...DIRECTION_TARGETS, ...DIRECTION_JUMPS];

export function isDirectionTarget(direction: MusicalDirection): direction is DirectionTarget {
  return (DIRECTION_TARGETS as readonly MusicalDirection[]).includes(direction);
}

/** GPIF's name of a direction (`<Target>Coda</Target>`, `<Jump>DaSegnoAlCoda</Jump>`): the model's, capitalised. */
export function gpifDirectionName(direction: MusicalDirection): string {
  return direction.charAt(0).toUpperCase() + direction.slice(1);
}

const BY_GPIF_NAME: ReadonlyMap<string, MusicalDirection> = new Map(MUSICAL_DIRECTIONS.map((direction) => [gpifDirectionName(direction), direction]));

/** The direction a GPIF `<Target>` or `<Jump>` names; undefined for an unknown name or one of the other kind. */
export function directionFromGpif(name: string, kind: 'target' | 'jump'): MusicalDirection | undefined {
  const direction = BY_GPIF_NAME.get(name.trim());
  return direction === undefined || isDirectionTarget(direction) !== (kind === 'target') ? undefined : direction;
}

/** The directions given, each once, in MUSICAL_DIRECTIONS order. */
export function sortDirections(directions: readonly MusicalDirection[]): readonly MusicalDirection[] {
  return MUSICAL_DIRECTIONS.filter((direction) => directions.includes(direction));
}
