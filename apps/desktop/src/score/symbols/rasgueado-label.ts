import { type RasgueadoPattern, rasgueadoInfo } from '@gp-editor/core';

/** A rasgueado's fingers as one word ("mii"), ³ for a triplet and "an." for an anapaest (short, short, long). */
export function rasgueadoFingers(pattern: RasgueadoPattern): string {
  const { fingers, rhythm } = rasgueadoInfo(pattern);
  if (rhythm === 'anapaest') {
    return `${fingers} an.`;
  }
  return pattern.endsWith('Triplet') ? `${fingers}³` : fingers;
}

/** The mark over a rasgueado beat: "rasg." (or the stylesheet's label) and its fingers. */
export function rasgueadoLabel(pattern: RasgueadoPattern, name = 'rasg.'): string {
  return `${name} ${rasgueadoFingers(pattern)}`;
}
