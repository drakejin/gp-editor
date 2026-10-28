import { type Annotation, type AnnotationPlacement, type Beat, type Song, type StringAddress, isSameAnnotation, toAnnotation } from '@gp-editor/core';
import type { SongAction, TrackBeat } from '../state/song-actions';

/** Characters of an annotation's first line a button quotes ("Move “Watch the bend” here"). */
const EXCERPT_LENGTH = 22;

/** The annotation panel's text for one beat, written to the beat by Apply (or when the panel leaves the beat). */
export interface AnnotationDraft {
  readonly at: TrackBeat;
  /** The beat when the draft was made: found again if an edit moves it before the typing is written (none in an empty bar). */
  readonly beat?: Beat;
  /** Where that beat started in its bar, in ticks: its place, should the beat itself change. */
  readonly offset?: number;
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
  const offset = beat === undefined ? undefined : beat.start - (song.measureHeaders[at.measureIndex]?.start ?? 0);
  return { at, beat, offset, text: annotation?.text ?? '', placement: annotation?.placement ?? placement, isEdited: false };
}

/**
 * Where the drafted beat is now: its place while the beat there is it, or starts where it did (the beat itself was
 * edited); else where an edit moved it in its track (bars inserted or deleted before it shift its start but keep its
 * voices); undefined once it is gone. A draft in a bar without beats keeps its place.
 */
export function locateDraftBeat(song: Song, draft: AnnotationDraft): TrackBeat | undefined {
  const { at, beat, offset } = draft;
  const here = beatAt(song, at);
  if (beat === undefined || here === beat) {
    return at;
  }
  const measures = song.tracks[at.trackIndex]?.measures ?? [];
  for (let measureIndex = 0; measureIndex < measures.length; measureIndex++) {
    const beatIndex = measures[measureIndex]?.beats.findIndex((candidate) => candidate.voices === beat.voices) ?? -1;
    if (beatIndex >= 0) {
      return { trackIndex: at.trackIndex, measureIndex, beatIndex };
    }
  }
  const headerStart = song.measureHeaders[at.measureIndex]?.start ?? 0;
  return here !== undefined && here.start - headerStart === offset ? at : undefined;
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
