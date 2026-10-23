// Guitar Pro's rasgueado patterns (no TuxGuitar counterpart: TuxGuitar has no rasgueado): GPIF ids, fingers, rhythm.
import type { RasgueadoPattern } from '../../model/song';

/** How the strokes of a pattern share the time: evenly (a triplet too), or an anapaest's short, short, long. */
export type RasgueadoRhythm = 'even' | 'anapaest';

export interface RasgueadoInfo {
  readonly pattern: RasgueadoPattern;
  /** GPIF's id (`<Property name="Rasgueado"><Rasgueado>mii_1</Rasgueado>`). */
  readonly gpifId: string;
  /** One letter per stroke: p thumb, i index, m middle, a ring, e little finger. */
  readonly fingers: string;
  readonly rhythm: RasgueadoRhythm;
}

const info = (pattern: RasgueadoPattern, gpifId: string, fingers: string, rhythm: RasgueadoRhythm = 'even'): RasgueadoInfo => ({ pattern, gpifId, fingers, rhythm });

/** Guitar Pro's 18 patterns, in its menu's order. */
export const RASGUEADO_PATTERNS: readonly RasgueadoInfo[] = [
  info('ii', 'ii_1', 'ii'),
  info('mi', 'mi_1', 'mi'),
  info('miiTriplet', 'mii_1', 'mii'),
  info('miiAnapaest', 'mii_2', 'mii', 'anapaest'),
  info('pmpTriplet', 'pmp_1', 'pmp'),
  info('pmpAnapaest', 'pmp_2', 'pmp', 'anapaest'),
  info('peiTriplet', 'pei_1', 'pei'),
  info('peiAnapaest', 'pei_2', 'pei', 'anapaest'),
  info('paiTriplet', 'pai_1', 'pai'),
  info('paiAnapaest', 'pai_2', 'pai', 'anapaest'),
  info('amiTriplet', 'ami_1', 'ami'),
  info('amiAnapaest', 'ami_2', 'ami', 'anapaest'),
  info('ppp', 'ppp_1', 'ppp'),
  info('amii', 'amii_1', 'amii'),
  info('amip', 'amip_1', 'amip'),
  info('eami', 'eami_1', 'eami'),
  info('eamii', 'eamii_1', 'eamii'),
  info('peami', 'peami_1', 'peami'),
];

/** GP4/GP5 mark a beat as rasgueado without a pattern: it reads back as Guitar Pro's first one. */
export const DEFAULT_RASGUEADO: RasgueadoPattern = 'ii';

export function rasgueadoInfo(pattern: RasgueadoPattern): RasgueadoInfo {
  return RASGUEADO_PATTERNS.find((candidate) => candidate.pattern === pattern) ?? RASGUEADO_PATTERNS[0] ?? info('ii', 'ii_1', 'ii');
}

/** The pattern of a GPIF id; undefined for an unknown one. */
export function rasgueadoFromGpif(id: string): RasgueadoPattern | undefined {
  return RASGUEADO_PATTERNS.find((candidate) => candidate.gpifId === id.trim())?.pattern;
}

export function isRasgueadoPattern(value: unknown): value is RasgueadoPattern {
  return RASGUEADO_PATTERNS.some((candidate) => candidate.pattern === value);
}

/**
 * Where each stroke starts, as a fraction of the time the strokes share: evenly spread, or for an anapaest the first
 * two a quarter apart and the last at the half.
 */
export function rasgueadoOnsets(pattern: RasgueadoPattern): readonly number[] {
  const { fingers, rhythm } = rasgueadoInfo(pattern);
  if (rhythm === 'anapaest') {
    return [0, 1 / 4, 1 / 2];
  }
  return Array.from({ length: fingers.length }, (_, index) => index / fingers.length);
}
