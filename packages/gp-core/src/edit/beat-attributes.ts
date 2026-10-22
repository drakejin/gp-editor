// Beat marks after TuxGuitar's TGChangeStrokeAction, TGChangePickStrokeUpAction / TGChangePickStrokeDownAction and
// TGInsertTextAction / TGRemoveTextAction (LGPL-2.1).
import { NO_STROKE, STROKE_VALUES } from '../model/defaults';
import type { Beat, Song, Stroke, StrokeDirection } from '../model/song';
import type { BeatAddress } from './addresses';
import { updateBeat } from './song-paths';

const STROKE_DIRECTIONS: readonly StrokeDirection[] = ['none', 'up', 'down'];

/** The stroke to store: NO_STROKE for direction none; undefined for an unknown direction or speed. */
function normalizeStroke(stroke: Stroke): Stroke | undefined {
  if (!STROKE_DIRECTIONS.includes(stroke.direction)) {
    return undefined;
  }
  if (stroke.direction === 'none') {
    return NO_STROKE;
  }
  return STROKE_VALUES.includes(stroke.value) ? { direction: stroke.direction, value: stroke.value } : undefined;
}

/**
 * New song with the stroke (strum) of the addressed beat set: up or down at a speed of STROKE_VALUES, or none. Same
 * song when it is the same, the direction or speed is unknown, or there is no beat. The beat's voices all share it.
 */
export function setBeatStroke(song: Song, at: BeatAddress, stroke: Stroke): Song {
  const next = normalizeStroke(stroke);
  if (next === undefined) {
    return song;
  }
  return updateBeat(song, at, (beat) => (beat.stroke.direction === next.direction && beat.stroke.value === next.value ? beat : { ...beat, stroke: next }));
}

/** New song with the pick stroke of the addressed beat set (up, down or none). Same song when nothing changes. */
export function setBeatPickStroke(song: Song, at: BeatAddress, direction: StrokeDirection): Song {
  if (!STROKE_DIRECTIONS.includes(direction)) {
    return song;
  }
  return updateBeat(song, at, (beat) => (beat.pickStroke === direction ? beat : { ...beat, pickStroke: direction }));
}

function withoutText(beat: Beat): Beat {
  const { text: _removed, ...rest } = beat;
  return rest;
}

/** New song with the text of the addressed beat set, trimmed; an empty text removes it. Same song when nothing changes. */
export function setBeatText(song: Song, at: BeatAddress, text: string | undefined): Song {
  const next = typeof text === 'string' ? text.trim() : '';
  return updateBeat(song, at, (beat) => {
    if ((beat.text ?? '') === next) {
      return beat;
    }
    return next === '' ? withoutText(beat) : { ...beat, text: next };
  });
}
