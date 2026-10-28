import type { Song } from '@gp-editor/core';
import { draftLyrics, effectiveLyrics, gp5LyricsNote, initialLyricsDraft, isSameLyrics, lyricsFit, trackLyricsDraft } from '../src/lib/lyrics-draft';
import { beat, makeSong, note } from '../test-support/songs';

/** Two tracks of three bars, two notes and a rest in bar 1, one note in bars 2 and 3. */
function twoTracks(lyrics: readonly ({ from: number; text: string } | undefined)[] = []): Song {
  const song = makeSong([[beat(960, [note(1, 0)]), beat(1920, []), beat(2880, [note(1, 2)])], [beat(4800, [note(1, 3)])], [beat(8640, [note(1, 5)])]]);
  const track = song.tracks[0]!;
  const tracks = [0, 1].map((i) => {
    const sung = lyrics[i];
    return { ...track, number: i + 1, name: i === 0 ? 'Lead' : 'Voice', ...(sung === undefined ? {} : { lyrics: sung }) };
  });
  return { ...song, tracks };
}

describe('initialLyricsDraft', () => {
  it('opens on the shown track’s lyrics', () => {
    expect(initialLyricsDraft(twoTracks([undefined, { from: 2, text: 'la' }]), 1)).toEqual({ trackIndex: 1, from: 2, text: 'la' });
  });

  it('opens on the track that has lyrics when the shown one has none', () => {
    expect(initialLyricsDraft(twoTracks([undefined, { from: 2, text: 'la' }]), 0)).toEqual({ trackIndex: 1, from: 2, text: 'la' });
  });

  it('opens on a vocal track shown without lyrics yet, not on another track’s lyrics (a voice the PDF import added)', () => {
    // Arrange: track 2 is named "Voice" (its icon is the voice), track 1 sings already.
    const song = twoTracks([{ from: 1, text: 'la la' }, undefined]);

    // Act + Assert
    expect(initialLyricsDraft(song, 1)).toEqual({ trackIndex: 1, from: 1, text: '' });
    expect(lyricsFit(song, { trackIndex: 1, from: 1, text: 'one two three four' })).toBe('4 syllables for 4 notes from bar 1');
  });

  it('opens empty on the shown track from bar 1 when no track has lyrics', () => {
    expect(initialLyricsDraft(twoTracks(), 1)).toEqual({ trackIndex: 1, from: 1, text: '' });
    expect(trackLyricsDraft(twoTracks(), 0)).toEqual({ trackIndex: 0, from: 1, text: '' });
  });
});

describe('draftLyrics', () => {
  it('puts each Korean or Japanese character on a note of its own', () => {
    expect(draftLyrics({ trackIndex: 0, from: 2, text: '사랑해 love' })).toEqual({ from: 2, text: '사 랑 해 love' });
  });
});

describe('effectiveLyrics and isSameLyrics', () => {
  it('reads lyrics as the edit keeps them: none for a blank text, the first bar inside the song', () => {
    const song = twoTracks();
    expect(effectiveLyrics(song, { from: 1, text: '  ' })).toBeUndefined();
    expect(effectiveLyrics(song, { from: 9, text: 'la' })).toEqual({ from: 3, text: 'la' });
    expect(isSameLyrics({ from: 1, text: 'a' }, { from: 1, text: 'a' })).toBe(true);
    expect(isSameLyrics({ from: 1, text: 'a' }, { from: 2, text: 'a' })).toBe(false);
    expect(isSameLyrics(undefined, undefined)).toBe(true);
    expect(isSameLyrics(undefined, { from: 1, text: 'a' })).toBe(false);
  });
});

describe('lyricsFit', () => {
  it('counts the syllables against the notes from the first bar on', () => {
    expect(lyricsFit(twoTracks(), { trackIndex: 0, from: 1, text: 'Hel-lo you' })).toBe('3 syllables for 4 notes from bar 1');
    expect(lyricsFit(twoTracks(), { trackIndex: 0, from: 2, text: 'one two three' })).toBe('3 syllables for 2 notes from bar 2: the last 1 has no note');
    expect(lyricsFit(twoTracks(), { trackIndex: 0, from: 1, text: '사랑' })).toBe('2 syllables for 4 notes from bar 1');
    expect(lyricsFit(twoTracks(), { trackIndex: 0, from: 1, text: ' ' })).toBe('No lyrics on this track');
  });
});

describe('gp5LyricsNote', () => {
  it('warns that a Guitar Pro 5 file keeps only the first track’s lyrics', () => {
    const both = twoTracks([{ from: 1, text: 'a' }, { from: 1, text: 'b' }]);
    expect(gp5LyricsNote(both, 1)).toBe('Saved as Guitar Pro 5, the song keeps one track’s lyrics: those of “Lead”.');
    expect(gp5LyricsNote(both, 0)).toBeUndefined();
    expect(gp5LyricsNote(twoTracks([undefined, { from: 1, text: 'b' }]), 1)).toBeUndefined();
  });
});
