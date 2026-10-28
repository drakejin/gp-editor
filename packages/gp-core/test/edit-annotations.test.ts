import { describe, expect, it } from 'vitest';
import type { BeatAddress } from '../src/edit/addresses';
import { hasAnnotations, moveBeatAnnotation, setBeatAnnotation, songAnnotations, withoutAnnotations } from '../src/edit/annotations';
import { copyBeats, deleteBeatsFlowing, insertBeatsFlowing } from '../src/edit/beat-ranges';
import { deleteBeat, insertBeat, setBeatDuration } from '../src/edit/beats';
import { deleteMeasures, insertMeasure } from '../src/edit/measures';
import { deleteRunNotes } from '../src/edit/run-notes';
import { deleteTrack, duplicateTrack, moveTrack } from '../src/edit/tracks';
import { transpose } from '../src/edit/transpose';
import { moveNotesToVoice } from '../src/edit/voice-moves';
import type { Annotation, Song } from '../src/model/song';
import { assertEditInvariants, buildSong, deepFreeze, dur, n, play, rest } from './helpers/edit-songs';

function at(measureIndex: number, beatIndex: number, trackIndex = 0, voiceIndex = 0): BeatAddress {
  return { trackIndex, measureIndex, beatIndex, voiceIndex };
}

const NOTE: Annotation = { text: 'Watch the bend\nsofter the second time', placement: 'above' };
const BELOW: Annotation = { text: 'breathe', placement: 'below' };

const QUARTERS = [play(4, n(1, 0)), play(4, n(1, 1)), play(4, n(1, 2)), play(4, n(1, 3))];
const OTHERS = [play(4, n(2, 5)), play(4, n(2, 6)), play(4, n(2, 7)), play(4, n(2, 8))];

/** Two tracks of three 4/4 bars of quarters (voice 1 only). */
function twoTracks(): Song {
  return deepFreeze(buildSong({ tracks: [[[QUARTERS], [QUARTERS], [QUARTERS]], [[OTHERS], [OTHERS], [OTHERS]]] }));
}

/** The song with NOTE on bar 2, beat 3 of track 1. */
function annotated(): Song {
  return deepFreeze(setBeatAnnotation(twoTracks(), at(1, 2), NOTE));
}

function annotationAt(song: Song, address: BeatAddress): Annotation | undefined {
  return song.tracks[address.trackIndex]?.measures[address.measureIndex]?.beats[address.beatIndex]?.annotation;
}

/** Where the song's annotations are, as "track:bar:beat text". */
function places(song: Song): string[] {
  return songAnnotations(song).map(({ trackIndex, measureIndex, beatIndex, annotation }) => `${trackIndex}:${measureIndex}:${beatIndex} ${annotation.text.split('\n')[0]}`);
}

describe('setBeatAnnotation', () => {
  it('puts the annotation on the addressed beat and shares everything else', () => {
    // Arrange
    const song = twoTracks();

    // Act
    const edited = setBeatAnnotation(song, at(1, 2), NOTE);

    // Assert
    expect(annotationAt(edited, at(1, 2))).toEqual(NOTE);
    expect(edited.tracks[1]).toBe(song.tracks[1]);
    expect(edited.tracks[0]?.measures[0]).toBe(song.tracks[0]?.measures[0]);
    expect(edited.tracks[0]?.measures[1]?.beats[1]).toBe(song.tracks[0]?.measures[1]?.beats[1]);
    assertEditInvariants(edited);
  });

  it('stores the text normalized: trimmed, line ends trimmed, the blank lines around it left out', () => {
    const edited = setBeatAnnotation(twoTracks(), at(0, 0), { text: '\n  slow down \r\n\n', placement: 'below' });
    expect(annotationAt(edited, at(0, 0))).toEqual({ text: 'slow down', placement: 'below' });
  });

  it('changes the text or the placement, and takes the annotation away with none or a blank text', () => {
    // Act
    const moved = setBeatAnnotation(annotated(), at(1, 2), { ...NOTE, placement: 'below' });
    const removed = setBeatAnnotation(annotated(), at(1, 2), undefined);
    const blanked = setBeatAnnotation(annotated(), at(1, 2), { text: '  \n ', placement: 'above' });

    // Assert
    expect(annotationAt(moved, at(1, 2))).toEqual({ ...NOTE, placement: 'below' });
    expect(annotationAt(removed, at(1, 2))).toBeUndefined();
    expect(removed.tracks[0]?.measures[1]?.beats[2]).not.toHaveProperty('annotation');
    expect(annotationAt(blanked, at(1, 2))).toBeUndefined();
  });

  it('returns the same song when nothing changes or there is no such beat', () => {
    const song = annotated();
    expect(setBeatAnnotation(song, at(1, 2), { ...NOTE })).toBe(song);
    expect(setBeatAnnotation(song, at(0, 0), undefined)).toBe(song);
    expect(setBeatAnnotation(song, at(1, 9), NOTE)).toBe(song);
    expect(setBeatAnnotation(song, at(7, 0), NOTE)).toBe(song);
    expect(setBeatAnnotation(song, at(0, 0, 5), NOTE)).toBe(song);
  });

  it('annotates a bar without beats on the rest it gets (the rest drawn there)', () => {
    // Arrange: track 2 rests in bar 2 with no beats at all, as many files leave it.
    const song = twoTracks();
    const empty: Song = deepFreeze({
      ...song,
      tracks: song.tracks.map((track, i) => (i === 1 ? { ...track, measures: track.measures.map((m, j) => (j === 1 ? { ...m, beats: [] } : m)) } : track)),
    });

    // Act
    const edited = setBeatAnnotation(empty, at(1, 0, 1), BELOW);

    // Assert
    expect(annotationAt(edited, at(1, 0, 1))).toEqual(BELOW);
    expect(edited.tracks[1]?.measures[1]?.beats[0]?.voices[0]?.notes).toEqual([]);
    assertEditInvariants(edited);
  });
});

describe('moveBeatAnnotation', () => {
  it('moves the annotation to another beat, in its bar or another one, in one edit', () => {
    // Act
    const inBar = moveBeatAnnotation(annotated(), at(1, 2), at(1, 0));
    const elsewhere = moveBeatAnnotation(annotated(), at(1, 2), at(2, 3));

    // Assert
    expect(places(inBar)).toEqual(['0:1:0 Watch the bend']);
    expect(places(elsewhere)).toEqual(['0:2:3 Watch the bend']);
  });

  it('moves it to another track’s beat too', () => {
    expect(places(moveBeatAnnotation(annotated(), at(1, 2), at(0, 1, 1)))).toEqual(['1:0:1 Watch the bend']);
  });

  it('leaves the song as it is when there is nothing to move, nowhere to go or the target has one', () => {
    const song = setBeatAnnotation(annotated(), at(2, 0), BELOW);
    expect(moveBeatAnnotation(song, at(0, 0), at(0, 1))).toBe(song);
    expect(moveBeatAnnotation(song, at(1, 2), at(1, 2))).toBe(song);
    expect(moveBeatAnnotation(song, at(1, 2), at(9, 0))).toBe(song);
    expect(moveBeatAnnotation(song, at(1, 2), at(2, 0))).toBe(song);
  });
});

describe('songAnnotations, hasAnnotations, withoutAnnotations', () => {
  it('lists the annotations track by track, bar by bar, beat by beat', () => {
    // Arrange
    const song = setBeatAnnotation(setBeatAnnotation(annotated(), at(0, 3, 1), BELOW), at(0, 1), { text: 'first', placement: 'above' });

    // Act
    const listed = places(song);

    // Assert
    expect(listed).toEqual(['0:0:1 first', '0:1:2 Watch the bend', '1:0:3 breathe']);
    expect(hasAnnotations(song)).toBe(true);
    expect(hasAnnotations(twoTracks())).toBe(false);
  });

  it('takes every annotation away, and gives a song without any back as it is', () => {
    const song = setBeatAnnotation(annotated(), at(0, 3, 1), BELOW);
    const plain = withoutAnnotations(song);
    expect(hasAnnotations(plain)).toBe(false);
    expect(plain.tracks[0]?.measures[0]).toBe(song.tracks[0]?.measures[0]);
    const untouched = twoTracks();
    expect(withoutAnnotations(untouched)).toBe(untouched);
  });
});

describe('an annotation goes with its beat', () => {
  it('when bars are inserted or deleted before it, and with its bar when that is deleted', () => {
    expect(places(insertMeasure(annotated(), 0, 'before'))).toEqual(['0:2:2 Watch the bend']);
    expect(places(deleteMeasures(annotated(), 0, 0))).toEqual(['0:0:2 Watch the bend']);
    expect(places(deleteMeasures(annotated(), 1, 1))).toEqual([]);
  });

  it('when tracks are deleted, moved or copied', () => {
    const onSecond = moveBeatAnnotation(annotated(), at(1, 2), at(1, 2, 1));
    expect(places(deleteTrack(onSecond, 0))).toEqual(['0:1:2 Watch the bend']);
    expect(places(moveTrack(annotated(), 0, 1))).toEqual(['1:1:2 Watch the bend']);
    expect(places(duplicateTrack(annotated(), 0))).toEqual(['0:1:2 Watch the bend', '1:1:2 Watch the bend']);
  });

  it('when beats are inserted before it or its own length changes', () => {
    // Act
    const inserted = insertBeat(annotated(), at(1, 0), 'before');
    const shorter = setBeatDuration(annotated(), at(1, 2), dur(8));

    // Assert
    expect(places(inserted)).toEqual(['0:1:3 Watch the bend']);
    expect(places(shorter)).toEqual(['0:1:2 Watch the bend']);
    expect(shorter.tracks[0]?.measures[1]?.beats[2]?.voices[0]?.notes).toEqual([n(1, 2)]);
    assertEditInvariants(shorter);
  });

  it('with its beat when that beat is deleted, and stays when another one is', () => {
    expect(places(deleteBeat(annotated(), at(1, 2)))).toEqual([]);
    const earlier = deleteBeat(annotated(), at(1, 0));
    expect(annotationAt(earlier, at(1, 1))?.text).toBe(NOTE.text);
  });

  it('on a rest: the rest is not free time a longer note before it may take', () => {
    // Arrange: bar 2's beat 3 becomes an annotated rest.
    const song = deepFreeze(setBeatAnnotation(buildSong({ tracks: [[[[play(4, n(1, 0)), play(4, n(1, 1)), rest(4), rest(4)]]]] }), at(0, 2), BELOW));

    // Act
    const longer = setBeatDuration(song, at(0, 1), dur(2));

    // Assert
    expect(places(longer)).toEqual(['0:0:2 breathe']);
    assertEditInvariants(longer);
  });

  it('when the notes of a run are deleted (the beats stay as rests)', () => {
    const emptied = deleteRunNotes(annotated(), at(1, 0), at(1, 3));
    expect(places(emptied)).toEqual(['0:1:2 Watch the bend']);
    expect(emptied.tracks[0]?.measures[1]?.beats[2]?.voices[0]?.notes).toEqual([]);
  });

  it('through cut and paste, and a copy carries it', () => {
    // Arrange
    const song = annotated();
    const copied = copyBeats(song, at(1, 1), at(1, 2));

    // Act
    const cut = deleteBeatsFlowing(song, at(1, 1), at(1, 2));
    const pasted = insertBeatsFlowing(cut, at(2, 0), copied);
    const duplicated = insertBeatsFlowing(song, at(0, 0), copied);

    // Assert
    expect(copied.items.map((item) => item.annotation)).toEqual([undefined, NOTE]);
    expect(places(cut)).toEqual([]);
    // The cut beats' bars flowed left; pasted at bar 3's start, the annotated beat is the second one there.
    expect(places(pasted)).toEqual(['0:2:1 Watch the bend']);
    expect(places(duplicated)).toEqual(['0:0:1 Watch the bend', '0:2:0 Watch the bend']);
    assertEditInvariants(pasted);
  });

  it('when its notes move to another voice', () => {
    const moved = moveNotesToVoice(annotated(), at(1, 2), 1);
    expect(places(moved)).toEqual(['0:1:2 Watch the bend']);
    expect(moved.tracks[0]?.measures[1]?.beats[2]?.voices[1]?.notes).toEqual([n(1, 2)]);
  });

  it('when the song is transposed', () => {
    const { song } = transpose(annotated(), { kind: 'song' }, { mode: 'chromatic', amount: 2 });
    expect(places(song)).toEqual(['0:1:2 Watch the bend']);
    expect(song.tracks[0]?.measures[1]?.beats[2]?.voices[0]?.notes[0]?.fret).toBe(4);
  });
});
