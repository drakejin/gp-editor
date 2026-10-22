import type { TextCommand } from '../draw';
import { pickStrokeGlyph } from '../symbols/pick-strokes';
import { TECHNIQUE_GLYPHS } from '../symbols/smufl';
import { musicGlyph } from './glyphs';
import { ARTICULATION, NOTATION } from './metrics';
import { waveLine } from './ornaments';
import type { VoiceLayout } from './voice-layout';

const SPACE = NOTATION.space;

/** Room a trill ("tr" and its wave) or a vibrato wave takes over a chord, so a pick stroke goes above it. */
function waveRoom(layout: VoiceLayout, indexes: readonly number[]): number {
  const effects = indexes.flatMap(index => layout.chords[index]?.heads.map(head => head.note.effect) ?? []);
  if (effects.some(effect => effect.trill !== undefined)) {
    return TECHNIQUE_GLYPHS.ornamentTrill.top * SPACE + ARTICULATION.gap;
  }
  return effects.some(effect => effect.vibrato) ? TECHNIQUE_GLYPHS.guitarVibratoStroke.top * SPACE + ARTICULATION.gap : 0;
}

/**
 * Pick strokes over the notation staff (drawn there when the tab is hidden): a down- or up-bow mark centred over each
 * beat that has one, above its notes, stems, articulations, trills and vibrato, and inside the notation band.
 */
export function pickStrokes(layout: VoiceLayout): TextCommand[] {
  const beatIndexes = [...new Set(layout.events.filter(event => event.pickStroke !== 'none').map(event => event.beatIndex))];
  return beatIndexes.flatMap(beatIndex => {
    const indexes = layout.events.flatMap((event, i) => (event.beatIndex === beatIndex ? [i] : []));
    const event = layout.events[indexes[0] ?? -1];
    const glyph = pickStrokeGlyph(event?.pickStroke ?? 'none');
    if (event === undefined || glyph === undefined) {
      return [];
    }
    const height = glyph.top * SPACE;
    const y = Math.max(layout.top - NOTATION.above + height, waveLine(layout, indexes, height) - waveRoom(layout, indexes));
    return [musicGlyph(event.x, y, glyph.text, layout.color, 'center')];
  });
}
