import { type Song, deleteMeasures, deleteTrack, insertMeasure, moveTrack, setBeatAnnotation, setBeatDuration } from '@gp-editor/core';
import { annotationExcerpt, canMoveAnnotation, cursorBeat, draftEdit, draftOf, locateDraftBeat } from '../src/lib/annotation-draft';
import { beat, makeSong, note } from '../test-support/songs';

/** Bar 1: three beats; bar 2: one; bar 3: none (the track rests). */
function song(): Song {
  return makeSong([[beat(960, [note(1, 0)]), beat(1920, [note(1, 2)]), beat(2880, [note(2, 3)])], [beat(4800, [note(6, 0)])], []]);
}

const at = (measureIndex: number, beatIndex: number) => ({ trackIndex: 0, measureIndex, beatIndex });
const annotated = () => setBeatAnnotation(song(), { ...at(0, 1), voiceIndex: 0 }, { text: 'Watch the bend\nsofter', placement: 'below' });

describe('cursorBeat', () => {
  it('is the cursor’s beat, whatever its string and voice', () => {
    expect(cursorBeat({ trackIndex: 1, measureIndex: 2, beatIndex: 3, voiceIndex: 1, string: 4 })).toEqual({ trackIndex: 1, measureIndex: 2, beatIndex: 3 });
    expect(cursorBeat(undefined)).toBeUndefined();
  });
});

describe('draftOf', () => {
  it('starts from the beat’s annotation, else empty at the placement asked for', () => {
    expect(draftOf(annotated(), at(0, 1))).toMatchObject({ at: at(0, 1), text: 'Watch the bend\nsofter', placement: 'below', isEdited: false });
    expect(draftOf(annotated(), at(0, 2), 'below')).toMatchObject({ at: at(0, 2), text: '', placement: 'below', isEdited: false });
    expect(draftOf(song(), at(2, 0))).toMatchObject({ text: '', placement: 'above', beat: undefined });
  });
});

describe('draftEdit', () => {
  it('writes what the beat does not show yet, and nothing when it shows it', () => {
    // Arrange
    const base = annotated();
    const plain = song();
    const draft = draftOf(base, at(0, 1));

    // Act + Assert
    expect(draftEdit(base, draft)).toBeUndefined();
    expect(draftEdit(base, { ...draft, text: 'louder', isEdited: true })).toEqual({ type: 'setBeatAnnotation', at: at(0, 1), annotation: { text: 'louder', placement: 'below' } });
    expect(draftEdit(base, { ...draft, text: '  ', isEdited: true })).toEqual({ type: 'setBeatAnnotation', at: at(0, 1), annotation: undefined });
    expect(draftEdit(plain, draftOf(plain, at(0, 0)))).toBeUndefined();
  });

  it('writes on the bar without beats (its rest gets the annotation)', () => {
    const plain = song();
    const draft = { ...draftOf(plain, at(2, 0)), text: 'tacet', isEdited: true };
    expect(draftEdit(plain, draft)).toEqual({ type: 'setBeatAnnotation', at: at(2, 0), annotation: { text: 'tacet', placement: 'above' } });
  });
});

describe('locateDraftBeat', () => {
  it('finds the drafted beat where an edit moved it, or on its place when only the beat itself changed', () => {
    // Arrange
    const base = annotated();
    const draft = draftOf(base, at(1, 0));

    // Act
    const afterInsert = insertMeasure(base, 0, 'before');
    const afterOwnEdit = setBeatDuration(base, { ...at(1, 0), voiceIndex: 0 }, { value: 2, dotted: false, doubleDotted: false, tuplet: { enters: 1, times: 1 } });

    // Assert
    expect(locateDraftBeat(afterInsert, draft)).toEqual(at(2, 0));
    expect(locateDraftBeat(afterOwnEdit, draft)).toEqual(at(1, 0));
    expect(locateDraftBeat(base, draft)).toEqual(at(1, 0));
  });

  it('follows the beat to another track when tracks are deleted or moved, never onto another track’s beat', () => {
    // Arrange: a track like it (beats of its own) before it, drafting the second track's bar 2.
    const base = annotated();
    const track = base.tracks[0]!;
    const alike = { ...track, strings: [...track.strings], measures: track.measures.map((m) => ({ ...m, beats: m.beats.map((b) => ({ ...b, voices: [...b.voices] })) })) };
    const two: Song = { ...base, tracks: [alike, track] };
    const draft = draftOf(two, { trackIndex: 1, measureIndex: 1, beatIndex: 0 });

    // Act
    const deleted = deleteTrack(two, 0);
    const moved = moveTrack(two, 1, 0);
    const ownGone = deleteTrack(two, 1);

    // Assert
    expect(locateDraftBeat(deleted, draft)).toEqual({ trackIndex: 0, measureIndex: 1, beatIndex: 0 });
    expect(locateDraftBeat(moved, draft)).toEqual({ trackIndex: 0, measureIndex: 1, beatIndex: 0 });
    expect(locateDraftBeat(ownGone, draft)).toBeUndefined();
  });

  it('is none when its bar was deleted, not the beat of the bar that took its place', () => {
    const base = annotated();
    const draft = draftOf(base, at(0, 2));
    expect(locateDraftBeat(deleteMeasures(base, 0, 0), draft)).toBeUndefined();
    const emptyBar = draftOf(base, at(2, 0));
    expect(locateDraftBeat(base, emptyBar)).toEqual(at(2, 0));
    expect(locateDraftBeat(insertMeasure(base, 0, 'before'), emptyBar)).toBeUndefined();
  });

  it('is none when the beat is gone', () => {
    const base = annotated();
    const draft = draftOf(base, at(0, 2));
    const fewer = { ...base, tracks: base.tracks.map((track) => ({ ...track, measures: track.measures.map((m, i) => (i === 0 ? { ...m, beats: m.beats.slice(0, 1) } : m)) })) };
    expect(locateDraftBeat(fewer, draft)).toBeUndefined();
  });
});

describe('canMoveAnnotation', () => {
  it('moves an annotation to another beat that has none', () => {
    expect(canMoveAnnotation(annotated(), at(0, 1), at(1, 0))).toBe(true);
    expect(canMoveAnnotation(annotated(), at(0, 1), at(0, 1))).toBe(false);
    expect(canMoveAnnotation(annotated(), at(0, 0), at(1, 0))).toBe(false);
    expect(canMoveAnnotation(annotated(), undefined, at(1, 0))).toBe(false);
    const both = setBeatAnnotation(annotated(), { ...at(1, 0), voiceIndex: 0 }, { text: 'x', placement: 'above' });
    expect(canMoveAnnotation(both, at(0, 1), at(1, 0))).toBe(false);
  });
});

describe('annotationExcerpt', () => {
  it('is the first line, cut short', () => {
    expect(annotationExcerpt('Watch the bend\nsofter')).toBe('Watch the bend');
    expect(annotationExcerpt('a very long first line of an annotation that goes on')).toBe('a very long first line…');
    expect(annotationExcerpt('여기서 숨 쉬기')).toBe('여기서 숨 쉬기');
  });
});
