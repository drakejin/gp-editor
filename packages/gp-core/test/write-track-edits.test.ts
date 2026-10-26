// Songs whose tracks were added, deleted, duplicated and moved — and renamed, coloured and given icons — save and read
// back in every format gp-core writes, and alphaTab reads the files as gp-core does.
import { describe, expect, it } from 'vitest';
import { setNoteFret } from '../src/edit/edit-song';
import { buildNewSong } from '../src/edit/new-song';
import { setTrackColor, setTrackIcon, setTrackName, setTrackShortName } from '../src/edit/track-properties';
import { addTrack, deleteTrack, duplicateTrack, moveTrack } from '../src/edit/tracks';
import { TRACK_COLORS, TRACK_ICON_IDS } from '../src/formats/common/track-icons';
import type { Channel, Song } from '../src/model/song';
import { readSong } from '../src/read-song';
import { type WritableFormat, writeSong } from '../src/write/index';
import { encodeMusicXml } from '../src/write/musicxml/musicxml-archive';
import { writeMusicXml } from '../src/write/musicxml/musicxml-writer';
import { compareReadings } from './helpers/alphatab-cross-check';
import { assertSongInvariants } from './helpers/invariants';
import { songDifference } from './helpers/write-compare';
import { expectedAfterGp34, expectedAfterGp5 } from './helpers/write-expected';
import { expectedAfterGp } from './helpers/write-expected-gpif';

const SEVEN_STRINGS = [64, 59, 55, 50, 45, 40, 35];
/** Kick drum: a drum note's fret is its General MIDI key. */
const KICK = 36;

/**
 * A new sheet with a bass, drums and a 7-string guitar added and a note in every track, then the bass moved to the top,
 * the drums duplicated and the first guitar deleted: Bass, Drums, Drums (copy), 7-string.
 */
function editedSong(): Song {
  const added = [
    { kind: 'bass', name: 'Bass' },
    { kind: 'drums' },
    { kind: 'guitar', name: '7-string', tuning: SEVEN_STRINGS },
  ] as const;
  const withTracks = added.reduce<Song>((song, newTrack) => addTrack(song, newTrack), buildNewSong());
  const notes = [
    [0, 1, 3],
    [1, 4, 5],
    [2, 1, KICK],
    [3, 7, 2],
  ] as const;
  const withNotes = notes.reduce<Song>((song, [trackIndex, string, fret]) => setNoteFret(song, { trackIndex, measureIndex: 0, beatIndex: 0, voiceIndex: 0, string }, fret), withTracks);
  return deleteTrack(duplicateTrack(moveTrack(withNotes, 1, 0), 2), 1);
}

/**
 * The song with its channels as the GP3–GP5 readers number them (write-expected.ts): in the order the tracks first play
 * them, every drum track on the first drum channel (all drums play on MIDI channel 10).
 */
function withChannelsInTrackOrder(song: Song): Song {
  const channels: Channel[] = [];
  const newIds = new Map<number, number>();
  const tracks = song.tracks.map((track) => {
    const channel = song.channels.find((candidate) => candidate.id === track.channelId) as Channel;
    const known = newIds.get(track.channelId) ?? (channel.isPercussion ? channels.find((kept) => kept.isPercussion)?.id : undefined);
    if (known !== undefined) {
      return { ...track, channelId: known };
    }
    const id = channels.length + 1;
    newIds.set(track.channelId, id);
    channels.push({ ...channel, id });
    return { ...track, channelId: id };
  });
  return { ...song, channels, tracks };
}

function expectedAfter(song: Song, format: WritableFormat, again: Song): Song {
  if (format === 'gp') {
    return expectedAfterGp(song);
  }
  const numbered = withChannelsInTrackOrder(song);
  return format === 'gp5' ? expectedAfterGp5(numbered, again) : expectedAfterGp34(numbered, again);
}

describe('a song with added, deleted, duplicated and moved tracks', () => {
  it('is the song the edits describe', () => {
    // Arrange / Act
    const song = editedSong();

    // Assert
    assertSongInvariants(song);
    expect(song.tracks.map((track) => [track.number, track.name, track.isPercussion, track.strings.length])).toEqual([
      [1, 'Bass', false, 4],
      [2, 'Drums', true, 6],
      [3, 'Drums', true, 6],
      [4, '7-string', false, 7],
    ]);
  });

  it.each<WritableFormat>(['gp', 'gp5', 'gp4', 'gp3'])('saves as %s and reads back with every track', (format) => {
    // Arrange
    const song = editedSong();

    // Act
    const again = readSong(writeSong(song, format));

    // Assert
    assertSongInvariants(again);
    expect(again.tracks.map((track) => [track.name, track.isPercussion])).toEqual(song.tracks.map((track) => [track.name, track.isPercussion]));
    expect(songDifference(expectedAfter(song, format, again), again)).toBeUndefined();
  });

  it.each<WritableFormat>(['gp', 'gp5', 'gp4', 'gp3'])('written as %s, reads in alphaTab as in gp-core', (format) => {
    // Arrange
    const bytes = writeSong(editedSong(), format);

    // Act
    const { unexplained } = compareReadings(bytes, format);

    // Assert
    expect(unexplained.slice(0, 5)).toEqual([]);
  });

  it('saves as MusicXML and reads back with every track, its tuning and its note', () => {
    // Arrange
    const song = editedSong();

    // Act
    const again = readSong(encodeMusicXml(writeMusicXml(song)));

    // Assert
    assertSongInvariants(again);
    expect(again.tracks.map((track) => [track.name, track.isPercussion])).toEqual(song.tracks.map((track) => [track.name, track.isPercussion]));
    expect(again.tracks[0]?.strings.map((guitarString) => guitarString.tuning)).toEqual([43, 38, 33, 28]);
    expect(again.tracks[3]?.strings.map((guitarString) => guitarString.tuning)).toEqual(SEVEN_STRINGS);
    const firstNotes = again.tracks.map((track) => track.measures[0]?.beats[0]?.voices[0]?.notes.map((note) => note.fret));
    expect(firstNotes).toEqual([[5], [KICK], [KICK], [2]]);
  });
});

/** The edited song with the bass renamed and given a short name, a colour and the strings' icon, the copied drums blue. */
function dressedSong(): Song {
  const named = setTrackShortName(setTrackName(editedSong(), 0, 'Upright Bass'), 0, 'Upr. B.');
  const coloured = setTrackColor(setTrackColor(named, 0, TRACK_COLORS[4] ?? { r: 0, g: 0, b: 0 }), 2, { r: 0, g: 64, b: 255 });
  return setTrackIcon(coloured, 0, TRACK_ICON_IDS.strings);
}

/** Each track's name, short name, icon and colour. */
function appearanceOf(song: Song): readonly unknown[] {
  return song.tracks.map((track) => [track.name, track.shortName, track.iconId, `${track.color.r} ${track.color.g} ${track.color.b}`]);
}

describe('a song whose tracks were renamed, coloured and given icons', () => {
  it('saves as .gp with every name, short name, icon and colour', () => {
    // Arrange
    const song = dressedSong();

    // Act
    const again = readSong(writeSong(song, 'gp'));

    // Assert
    expect(appearanceOf(again)).toEqual([
      ['Upright Bass', 'Upr. B.', TRACK_ICON_IDS.strings, '181 208 140'],
      ['Drums', undefined, undefined, '255 0 0'],
      ['Drums', undefined, undefined, '0 64 255'],
      ['7-string', undefined, undefined, '255 0 0'],
    ]);
    expect(songDifference(expectedAfterGp(song), again)).toBeUndefined();
  });

  it.each<WritableFormat>(['gp5', 'gp4', 'gp3'])('saves as %s with the names and colours; the icons follow the instruments again', (format) => {
    // Arrange
    const song = dressedSong();

    // Act
    const again = readSong(writeSong(song, format));

    // Assert
    expect(appearanceOf(again)).toEqual([
      ['Upright Bass', undefined, undefined, '181 208 140'],
      ['Drums', undefined, undefined, '255 0 0'],
      ['Drums', undefined, undefined, '0 64 255'],
      ['7-string', undefined, undefined, '255 0 0'],
    ]);
    expect(songDifference(expectedAfter(song, format, again), again)).toBeUndefined();
  });

  it.each<WritableFormat>(['gp', 'gp5', 'gp4', 'gp3'])('written as %s, reads in alphaTab as in gp-core, colours too', (format) => {
    // Act
    const { unexplained } = compareReadings(writeSong(dressedSong(), format), format);

    // Assert
    expect(unexplained.slice(0, 5)).toEqual([]);
  });

  it('saves as MusicXML with the short name as the part’s abbreviation', () => {
    // Act
    const again = readSong(encodeMusicXml(writeMusicXml(dressedSong())));

    // Assert
    expect(again.tracks.map((track) => [track.name, track.shortName])).toEqual([
      ['Upright Bass', 'Upr. B.'],
      ['Drums', undefined],
      ['Drums', undefined],
      ['7-string', undefined],
    ]);
  });
});
