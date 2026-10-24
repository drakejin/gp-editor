import type { ScoreMode } from '../score/geometry';
import type { StaffSpec } from '../score/score-layout';

/**
 * Which tracks the score shows (Guitar Pro 8's "Displaying tracks"): the selected one, or with View ▸ Multitrack (F3)
 * every track the tracks panel's eyes leave shown, one staff group each, in track order. A view setting of the
 * document's tab: not saved in the song and not an undo step. (Guitar Pro keeps the multitrack view's eyes in a .gp
 * file's LayoutConfiguration and GP5's track flags; gp-core does not read them.)
 */
export interface TrackDisplay {
  /** View ▸ Multitrack: the score shows the shown tracks, not just the selected one. */
  readonly isMultitrack: boolean;
  /** Tracks the multitrack view leaves out (their eye is off); a track added later is shown. */
  readonly hiddenTrackIndexes: readonly number[];
  /** A track's own staves in the multitrack view (the Track inspector's notation there); the score's mode otherwise. */
  readonly multitrackModes: Readonly<Record<number, ScoreMode>>;
}

export const INITIAL_TRACK_DISPLAY: TrackDisplay = { isMultitrack: false, hiddenTrackIndexes: [], multitrackModes: {} };

/** The hint when the selected track's eye is clicked: it cannot be hidden. */
export const SELECTED_TRACK_SHOWN_HINT = 'The selected track is always shown. Select another track to hide this one.';

/** The tracks the score shows, in track order: the selected one always, with Multitrack the ones not hidden too. */
export function shownTrackIndexes(display: TrackDisplay, trackCount: number, selectedTrackIndex: number): number[] {
  const indexes = Array.from({ length: trackCount }, (_, index) => index);
  if (!display.isMultitrack) {
    return indexes.filter((index) => index === selectedTrackIndex);
  }
  return indexes.filter((index) => index === selectedTrackIndex || !display.hiddenTrackIndexes.includes(index));
}

/** The score's staves: one per shown track, in track order, each drawn in its own staves. */
export function shownStaves(display: TrackDisplay, scoreMode: ScoreMode, trackCount: number, selectedTrackIndex: number): StaffSpec[] {
  return shownTrackIndexes(display, trackCount, selectedTrackIndex).map((trackIndex) => ({ trackIndex, mode: trackModeOf(display, scoreMode, trackIndex) }));
}

/** The score shows the track (its eye in the tracks panel is lit). */
export function isTrackShown(display: TrackDisplay, trackIndex: number, selectedTrackIndex: number): boolean {
  return trackIndex === selectedTrackIndex || (display.isMultitrack && !display.hiddenTrackIndexes.includes(trackIndex));
}

/** The staves a track is drawn with: its own in the multitrack view when it has them, else the score's mode. */
export function trackModeOf(display: TrackDisplay, scoreMode: ScoreMode, trackIndex: number): ScoreMode {
  return display.isMultitrack ? display.multitrackModes[trackIndex] ?? scoreMode : scoreMode;
}

/** View ▸ Multitrack on or off; the eyes are kept for the next time. */
export function toggleMultitrack(display: TrackDisplay): TrackDisplay {
  return { ...display, isMultitrack: !display.isMultitrack };
}

/**
 * A track's eye clicked: in the multitrack view it hides or shows the track; in the single-track view it turns the
 * multitrack view on with the selected track and this one. The selected track's eye changes nothing.
 */
export function toggleTrackShown(display: TrackDisplay, trackCount: number, selectedTrackIndex: number, trackIndex: number): TrackDisplay {
  if (trackIndex === selectedTrackIndex || trackIndex < 0 || trackIndex >= trackCount) {
    return display;
  }
  if (!display.isMultitrack) {
    const others = Array.from({ length: trackCount }, (_, index) => index).filter((index) => index !== selectedTrackIndex && index !== trackIndex);
    return { ...display, isMultitrack: true, hiddenTrackIndexes: others };
  }
  const isHidden = display.hiddenTrackIndexes.includes(trackIndex);
  const hidden = isHidden ? display.hiddenTrackIndexes.filter((index) => index !== trackIndex) : [...display.hiddenTrackIndexes, trackIndex].sort((a, b) => a - b);
  return { ...display, hiddenTrackIndexes: hidden };
}

/** The track's staves in the multitrack view. */
export function setMultitrackMode(display: TrackDisplay, trackIndex: number, mode: ScoreMode): TrackDisplay {
  return display.multitrackModes[trackIndex] === mode ? display : { ...display, multitrackModes: { ...display.multitrackModes, [trackIndex]: mode } };
}

/**
 * The display after tracks were added, deleted or moved: `remap` gives a track's new index (undefined: deleted). The
 * same object when nothing moved.
 */
export function remapTrackDisplay(display: TrackDisplay, remap: (oldIndex: number) => number | undefined): TrackDisplay {
  const hidden = display.hiddenTrackIndexes.flatMap((index) => {
    const next = remap(index);
    return next === undefined ? [] : [next];
  });
  const modes = Object.entries(display.multitrackModes).flatMap(([index, mode]): (readonly [number, ScoreMode])[] => {
    const next = remap(Number(index));
    return next === undefined ? [] : [[next, mode]];
  });
  const isSame = hidden.length === display.hiddenTrackIndexes.length && hidden.every((index, i) => index === display.hiddenTrackIndexes[i]) &&
    modes.length === Object.keys(display.multitrackModes).length && modes.every(([index, mode]) => display.multitrackModes[index] === mode);
  return isSame ? display : { ...display, hiddenTrackIndexes: [...hidden].sort((a, b) => a - b), multitrackModes: Object.fromEntries(modes) };
}

/**
 * The track ⌘↑ / ⌘↓ go to: the previous or next shown track in the multitrack view, the previous or next track of the
 * song otherwise; undefined past the first or last.
 */
export function adjacentTrackIndex(display: TrackDisplay, trackCount: number, selectedTrackIndex: number, step: -1 | 1): number | undefined {
  const candidates = display.isMultitrack ? shownTrackIndexes(display, trackCount, selectedTrackIndex) : Array.from({ length: trackCount }, (_, index) => index);
  const position = candidates.indexOf(selectedTrackIndex);
  return position < 0 ? undefined : candidates[position + step];
}
