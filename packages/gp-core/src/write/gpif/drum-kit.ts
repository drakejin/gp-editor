// The <InstrumentSet> of a drum track (no TuxGuitar counterpart): Guitar Pro 7's factory kit (formats/common/drum-kit.ts),
// and an "Other" element for the notes it lacks.
import { DEFAULT_DRUM_NOTEHEADS, type DrumArticulation, type DrumElement, FACTORY_DRUM_KIT } from '../../formats/common/drum-kit';

export type { DrumArticulation, DrumElement } from '../../formats/common/drum-kit';

/** The snare's staff line, for notes the factory kit has no articulation for. */
const OTHER_STAFF_LINE = 3;

const FACTORY_INPUTS: ReadonlySet<number> = new Set(FACTORY_DRUM_KIT.flatMap((element) => element.articulations.map((a) => a.inputMidi)));

/** An articulation for a note the factory kit does not have: it plays the note's own MIDI number. */
function otherArticulation(midi: number): DrumArticulation {
  return {
    name: `MIDI ${midi}`,
    staffLine: OTHER_STAFF_LINE,
    noteheads: DEFAULT_DRUM_NOTEHEADS,
    techniquePlacement: 'outside',
    techniqueSymbol: '',
    inputMidi: midi,
    outputRseSound: '',
    outputMidi: midi,
  };
}

/**
 * The kit of a drum track: the factory kit, then (in an extra "Other" element) one articulation for every MIDI number in
 * `pitches` that no factory articulation takes as input.
 */
export function drumKitFor(pitches: readonly number[]): readonly DrumElement[] {
  const missing = [...new Set(pitches)].filter((pitch) => !FACTORY_INPUTS.has(pitch)).sort((a, b) => a - b);
  if (missing.length === 0) {
    return FACTORY_DRUM_KIT;
  }
  return [...FACTORY_DRUM_KIT, { name: 'Other', type: 'unpitched', soundbankName: '', articulations: missing.map(otherArticulation) }];
}

/** `<InstrumentArticulation>` of a drum note: the index (over the whole kit) of the first articulation taking `pitch` as input. */
export function drumArticulationIndex(kit: readonly DrumElement[], pitch: number): number {
  const index = kit.flatMap((element) => element.articulations).findIndex((articulation) => articulation.inputMidi === pitch);
  return Math.max(0, index);
}
