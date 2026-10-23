import { type RasgueadoPattern, rasgueadoInfo } from '@gp-editor/core';

/** A rasgueado's fingers as one word ("mii"), ³ for a triplet and "an." for an anapaest (short, short, long). */
export function rasgueadoFingers(pattern: RasgueadoPattern): string {
  const { fingers, rhythm } = rasgueadoInfo(pattern);
  if (rhythm === 'anapaest') {
    return `${fingers} an.`;
  }
  return pattern.endsWith('Triplet') ? `${fingers}³` : fingers;
}

/** The mark over a rasgueado beat: "rasg." and its fingers. */
export function rasgueadoLabel(pattern: RasgueadoPattern): string {
  return `rasg. ${rasgueadoFingers(pattern)}`;
}
