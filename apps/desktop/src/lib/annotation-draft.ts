import { type Annotation, type AnnotationPlacement, type Beat, type GuitarString, type MeasureHeader, type Song, type StringAddress, isSameAnnotation, toAnnotation } from '@gp-editor/core';
import type { SongAction, TrackBeat } from '../state/song-actions';

/** Characters of an annotation's first line a button quotes ("Move “Watch the bend” here"). */
const EXCERPT_LENGTH = 22;

/** The annotation panel's text for one beat, written to the beat by Apply (or when the panel leaves the beat). */
export interface AnnotationDraft {
  readonly at: TrackBeat;
  /** The beat when the draft was made: found again if an edit moves it before the typing is written (none in an empty bar). */
  readonly beat?: Beat;
  /** Where that beat started in its bar, in ticks, the bar's header and the track's strings (no beat edit replaces them): its place, should the beat itself change. */
  readonly offset?: number;
  readonly header?: MeasureHeader;
  readonly strings?: readonly GuitarString[];
  readonly text: string;
  readonly placement: AnnotationPlacement;
  /** Typed (or placed) and not written to the beat yet. */
  readonly isEdited: boolean;
}

/** The cursor's beat, whatever its string and voice. */
export function cursorBeat(cursor: StringAddress | undefined): TrackBeat | undefined {
  return cursor === undefined ? undefined : { trackIndex: cursor.trackIndex, measureIndex: cursor.measureIndex, beatIndex: cursor.beatIndex };
}

export function isSameBeat(a: TrackBeat | undefined, b: TrackBeat | undefined): boolean {
  return a !== undefined && b !== undefined && a.trackIndex === b.trackIndex && a.measureIndex === b.measureIndex && a.beatIndex === b.beatIndex;
}

function beatAt(song: Song, at: TrackBeat): Beat | undefined {
  return song.tracks[at.trackIndex]?.measures[at.measureIndex]?.beats[at.beatIndex];
}

export function beatAnnotation(song: Song, at: TrackBeat | undefined): Annotation | undefined {
  return at === undefined ? undefined : beatAt(song, at)?.annotation;
}

/** A draft of the beat's annotation; empty, at `placement`, for a beat without one. */
export function draftOf(song: Song, at: TrackBeat, placement: AnnotationPlacement = 'above'): AnnotationDraft {
  const beat = beatAt(song, at);
  const annotation = beat?.annotation;
  const header = song.measureHeaders[at.measureIndex];
  const offset = beat === undefined ? undefined : beat.start - (header?.start ?? 0);
  const strings = song.tracks[at.trackIndex]?.strings;
  return { at, beat, offset, header, strings, text: annotation?.text ?? '', placement: annotation?.placement ?? placement, isEdited: false };
}

/** The draft's beat is the one at its place still (a bar without beats: still that bar of that track, still empty). */
export function isDraftHere(song: Song, draft: AnnotationDraft): boolean {
  return beatAt(song, draft.at) === draft.beat && (draft.beat !== undefined || isSamePlace(song, draft));
}

/** The draft's place is still the same bar of the same track (its header and the track's strings are the same objects). */
function isSamePlace(song: Song, { at, header, strings }: AnnotationDraft): boolean {
  return song.measureHeaders[at.measureIndex] === header && song.tracks[at.trackIndex]?.strings === strings;
}

/**
 * Where a beat is now, by its voices (bars inserted or deleted before it, track moves and deletions keep them): in the
 * drafted track first (its strings), then at its index, then any track.
 */
function findBeat(song: Song, draft: AnnotationDraft, beat: Beat): TrackBeat | undefined {
  const own = song.tracks.findIndex((track) => track.strings === draft.strings);
  const first = [own, draft.at.trackIndex].filter((index) => index >= 0);
  const trackIndexes = [...first, ...song.tracks.map((_, index) => index).filter((index) => !first.includes(index))];
  for (const trackIndex of trackIndexes) {
    const measures = song.tracks[trackIndex]?.measures ?? [];
    for (let measureIndex = 0; measureIndex < measures.length; measureIndex++) {
      const beatIndex = measures[measureIndex]?.beats.findIndex((candidate) => candidate.voices === beat.voices) ?? -1;
      if (beatIndex >= 0) {
        return { trackIndex, measureIndex, beatIndex };
      }
    }
  }
  return undefined;
}

/**
 * Where the drafted beat is now: its place while the beat there is it; else wherever an edit moved it (any track); else
 * its place when that is still the same bar of the same track and a beat starts where it did (the beat itself was
 * edited). Undefined once it is gone: the typing is never written to another bar's or track's beat.
 */
export function locateDraftBeat(song: Song, draft: AnnotationDraft): TrackBeat | undefined {
  const { at, beat, offset } = draft;
  if (isDraftHere(song, draft)) {
    return at;
  }
  const found = beat === undefined ? undefined : findBeat(song, draft, beat);
  if (found !== undefined || !isSamePlace(song, draft)) {
    return found;
  }
  const here = beatAt(song, at);
  return here !== undefined && beat !== undefined && here.start - (draft.header?.start ?? 0) === offset ? at : undefined;
}

/** The edit that writes the draft to its beat (a blank text takes the annotation away); undefined when the beat shows it already or is gone. */
export function draftEdit(song: Song, draft: AnnotationDraft): SongAction | undefined {
  const at = locateDraftBeat(song, draft);
  const annotation = toAnnotation(draft.text, draft.placement);
  return at === undefined || isSameAnnotation(beatAnnotation(song, at), annotation) ? undefined : { type: 'setBeatAnnotation', at, annotation };
}

/** The beat shows what the draft says (nothing typed is waiting). */
export function isDraftShown(song: Song, draft: AnnotationDraft): boolean {
  return isSameAnnotation(beatAnnotation(song, locateDraftBeat(song, draft)), toAnnotation(draft.text, draft.placement));
}

/** `source`'s annotation can go to `target`: another beat, which has none of its own. */
export function canMoveAnnotation(song: Song, source: TrackBeat | undefined, target: TrackBeat): boolean {
  return source !== undefined && !isSameBeat(source, target) && beatAnnotation(song, source) !== undefined && beatAt(song, target) !== undefined && beatAnnotation(song, target) === undefined;
}

/** An annotation's first line, cut short with an ellipsis. */
export function annotationExcerpt(text: string): string {
  const line = text.split('\n')[0] ?? '';
  return line.length <= EXCERPT_LENGTH ? line : `${line.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}
