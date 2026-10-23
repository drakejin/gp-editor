// The sustain pedal in playback (not in TuxGuitar, which has no pedal): the damper controller (CC 64) at each pedal
// mark of the played measures.
import { isPedalDownBefore } from '../model/defaults';
import { CONTROLLER, controlChangeEvent, type SequenceEvent } from './midi-events';
import type { TrackContext } from './note-search';

const PEDAL_DOWN = 127;
const PEDAL_UP = 0;

/** The track's pedal presses and releases as played (repeats and jumps included), and a press where playback starts with it down. */
export function pedalEvents(context: TrackContext): SequenceEvent[] {
  const { channel, track, headers, played, origin } = context;
  const first = played[0];
  const initial = first !== undefined && isPedalDownBefore(track.measures, first.headerIndex) ? [controlChangeEvent(channel.id, origin, CONTROLLER.SUSTAIN, PEDAL_DOWN)] : [];
  const marks = played.flatMap((measure) => {
    const header = headers[measure.headerIndex];
    const pedals = track.measures[measure.headerIndex]?.pedals ?? [];
    return header === undefined
      ? []
      : pedals.map((pedal) => controlChangeEvent(channel.id, header.start + measure.move + pedal.offset, CONTROLLER.SUSTAIN, pedal.action === 'down' ? PEDAL_DOWN : PEDAL_UP));
  });
  return [...initial, ...marks];
}
