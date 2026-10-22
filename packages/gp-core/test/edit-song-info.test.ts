import { describe, expect, it } from 'vitest';
import { setSongInfo } from '../src/edit/song-info';
import type { Song, SongInfo } from '../src/model/song';
import { buildSong, deepFreeze, n, play } from './helpers/edit-songs';

function makeSong(): Song {
  const song = buildSong({ tracks: [[[[play(1, n(1, 0))]]]] });
  return deepFreeze({ ...song, info: { ...song.info, title: 'Song', artist: 'Band', notice: ['line'] } });
}

describe('setSongInfo', () => {
  it('sets only the given fields, trimmed, and leaves the rest of the song alone', () => {
    // Arrange
    const song = makeSong();

    // Act
    const edited = setSongInfo(song, { title: '  New title ', album: ' Album', notice: [' first ', 'second'] });

    // Assert
    expect(edited.info).toEqual({ ...song.info, title: 'New title', album: 'Album', notice: ['first', 'second'] });
    expect(edited.tracks).toBe(song.tracks);
    expect(edited.measureHeaders).toBe(song.measureHeaders);
    expect(song.info.title).toBe('Song');
  });

  it('clears a field set to an empty text', () => {
    const edited = setSongInfo(makeSong(), { artist: '   ', notice: [] });
    expect(edited.info).toMatchObject({ artist: '', notice: [] });
  });

  it('sets every text field', () => {
    // Arrange
    const info: Omit<SongInfo, 'notice'> = {
      title: 't',
      subtitle: 's',
      artist: 'a',
      album: 'al',
      words: 'w',
      music: 'm',
      copyright: 'c',
      transcriber: 'tr',
      instructions: 'i',
    };

    // Act
    const edited = setSongInfo(makeSong(), info);

    // Assert
    expect(edited.info).toEqual({ ...info, notice: ['line'] });
  });

  it('returns the same song when nothing changes, ignoring fields that are not song info or not text', () => {
    const song = makeSong();
    expect(setSongInfo(song, {})).toBe(song);
    expect(setSongInfo(song, { title: ' Song ', notice: ['line'] })).toBe(song);
    expect(setSongInfo(song, { tempo: 90 } as Partial<SongInfo>)).toBe(song);
    expect(setSongInfo(song, { title: 7 as unknown as string, notice: 'x' as unknown as string[] })).toBe(song);
  });
});
