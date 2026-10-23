// GPIF notation marks (no TuxGuitar counterpart): the inverse of the reader's directions, hairpins, fades, rasgueado and
// sustain pedal automations.
import { gpifDirectionName, isDirectionTarget, sortDirections } from '../../formats/common/directions';
import { rasgueadoInfo } from '../../formats/common/rasgueado';
import { PEDAL_REFERENCES, SUSTAIN_PEDAL_TYPE } from '../../formats/gpif/gpif-pedals';
import { measureTicks } from '../../model/defaults';
import type { Hairpin, MeasureHeader, Note, RasgueadoPattern, Track } from '../../model/song';
import { property } from './gpif-properties';
import { type XmlNode, xmlElement, xmlText } from './xml-writer';

const HAIRPIN_NAMES: Readonly<Record<Hairpin, string>> = { crescendo: 'Crescendo', decrescendo: 'Decrescendo' };

/** `<Directions>`: the bar's targets, then its jumps; undefined without any. */
export function directionsNode(header: MeasureHeader): XmlNode | undefined {
  const directions = sortDirections(header.directions ?? []);
  if (directions.length === 0) {
    return undefined;
  }
  const targets = directions.filter(isDirectionTarget).map((target) => xmlText('Target', gpifDirectionName(target)));
  const jumps = directions.filter((direction) => !isDirectionTarget(direction)).map((jump) => xmlText('Jump', gpifDirectionName(jump)));
  return xmlElement('Directions', [...targets, ...jumps]);
}

export function hairpinNode(hairpin: Hairpin | undefined): XmlNode | undefined {
  return hairpin === undefined ? undefined : xmlText('Hairpin', HAIRPIN_NAMES[hairpin]);
}

/** `<Property name="Rasgueado"><Rasgueado>ii_1</Rasgueado></Property>`. */
export function rasgueadoProperty(pattern: RasgueadoPattern | undefined): XmlNode | undefined {
  return pattern === undefined ? undefined : property('Rasgueado', 'Rasgueado', rasgueadoInfo(pattern).gpifId);
}

/** GPIF's `<Fadding>` of a voice (one per beat): the first of fade in, fade out and volume swell a note has. */
export function faddingOf(notes: readonly Note[]): string | undefined {
  if (notes.some((note) => note.effect.fadeIn)) {
    return 'FadeIn';
  }
  if (notes.some((note) => note.effect.fadeOut === true)) {
    return 'FadeOut';
  }
  return notes.some((note) => note.effect.volumeSwell === true) ? 'VolumeSwell' : undefined;
}

/** The track's sustain pedal changes as SustainPedal automations, at their bar and their place in it (0–1). */
export function pedalAutomationNodes(track: Track, headers: readonly MeasureHeader[]): readonly XmlNode[] {
  return track.measures.flatMap((measure, index) => {
    const header = headers[index];
    if (header === undefined) {
      return [];
    }
    const length = measureTicks(header.timeSignature.numerator, header.timeSignature.denominator);
    return (measure.pedals ?? []).map((pedal) =>
      xmlElement('Automation', [
        xmlText('Type', SUSTAIN_PEDAL_TYPE),
        xmlText('Linear', 'false'),
        xmlText('Bar', index),
        xmlText('Position', String(Math.min(1, Math.max(0, pedal.offset / length)))),
        xmlText('Visible', 'true'),
        xmlText('Value', `0 ${PEDAL_REFERENCES[pedal.action]}`),
      ]),
    );
  });
}
