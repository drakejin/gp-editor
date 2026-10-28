import { describe, expect, it } from 'vitest';
import {
  MAX_CAPO,
  abbreviateTrackName,
  instrumentIconId,
  setTrackCapo,
  setTrackColor,
  setTrackIcon,
  setTrackName,
  setTrackShortName,
  normalizeIconId,
  normalizeShortName,
  trackIconId,
  trackShortName,
} from '../src/edit/track-properties';
import { TRACK_ICON_IDS } from '../src/formats/common/track-icons';
import type { Song } from '../src/model/song';
import { buildSong, deepFreeze, n, play } from './helpers/edit-songs';

/** Two guitar tracks, fret 5 on string 1 in the first. */
function twoTracks(): Song {
  return deepFreeze(buildSong({ tracks: [[[[play(1, n(1, 5))]]], [[[play(1, n(2, 0))]]]] }));
}

describe('setTrackName', () => {
  it('renames the track, trimmed', () => {
    // Arrange
    const song = twoTracks();

    // Act
    const edited = setTrackName(song, 1, '  Bass  ');

    // Assert
    expect(edited.tracks[1]?.name).toBe('Bass');
    expect(edited.tracks[0]).toBe(song.tracks[0]);
    expect(song.tracks[1]?.name).toBe('Track 2');
  });

  it('returns the same song for the same name, a blank name or a missing track', () => {
    const song = twoTracks();
    expect(setTrackName(song, 0, 'Track 1')).toBe(song);
    expect(setTrackName(song, 0, '   ')).toBe(song);
    expect(setTrackName(song, 0, '')).toBe(song);
    expect(setTrackName(song, 3, 'Lead')).toBe(song);
  });
});

describe('setTrackCapo', () => {
  it('puts a capo on the track and keeps the frets as written', () => {
    // Arrange
    const song = twoTracks();

    // Act
    const edited = setTrackCapo(song, 0, 3);

    // Assert
    expect(edited.tracks[0]?.offset).toBe(3);
    expect(edited.tracks[0]?.measures).toBe(song.tracks[0]?.measures);
    expect(edited.tracks[1]).toBe(song.tracks[1]);
  });

  it('keeps the capo on frets 0…24, rounded', () => {
    expect(MAX_CAPO).toBe(24);
    expect(setTrackCapo(twoTracks(), 0, 30).tracks[0]?.offset).toBe(24);
    expect(setTrackCapo(twoTracks(), 0, -2).tracks[0]?.offset).toBe(0);
    expect(setTrackCapo(twoTracks(), 0, 2.6).tracks[0]?.offset).toBe(3);
  });

  it('returns the same song for the same capo, a capo that is not a number, a missing track or a percussion track', () => {
    const song = twoTracks();
    expect(setTrackCapo(song, 0, 0)).toBe(song);
    expect(setTrackCapo(song, 0, Number.NaN)).toBe(song);
    expect(setTrackCapo(song, 5, 2)).toBe(song);
    const drums = deepFreeze({ ...song, tracks: song.tracks.map((track) => ({ ...track, isPercussion: true })) });
    expect(setTrackCapo(drums, 0, 2)).toBe(drums);
  });
});

/** The two-track song with the first track on this program (or the drum kit). */
function withProgram(program: number, isPercussion = false): Song {
  const song = twoTracks();
  return deepFreeze({ ...song, channels: song.channels.map((channel) => ({ ...channel, program, isPercussion })) });
}

describe('setTrackName and the short name', () => {
  it('drops a short name the new name makes redundant', () => {
    // Arrange
    const song = setTrackShortName(twoTracks(), 0, 'Lead');

    // Act
    const renamed = setTrackName(song, 0, 'Lead');

    // Assert
    expect(song.tracks[0]?.shortName).toBe('Lead');
    expect(renamed.tracks[0]?.name).toBe('Lead');
    expect(renamed.tracks[0]?.shortName).toBeUndefined();
  });
});

describe('abbreviateTrackName and trackShortName', () => {
  it('cuts words longer than five letters to four and a dot', () => {
    expect(abbreviateTrackName('Bass')).toBe('Bass');
    expect(abbreviateTrackName('Distortion Guitar')).toBe('Dist. Guit.');
    expect(abbreviateTrackName('  Acoustic   Guitar 2 ')).toBe('Acou. Guit. 2');
    expect(abbreviateTrackName('   ')).toBe('');
  });

  it('gives the track’s own short name, else its name abbreviated', () => {
    expect(trackShortName({ name: 'Steel Guitar' })).toBe('Steel Guit.');
    expect(trackShortName({ name: 'Steel Guitar', shortName: 's.guit.' })).toBe('s.guit.');
  });
});

describe('setTrackShortName', () => {
  it('sets the short name, trimmed, on that track only', () => {
    // Arrange
    const song = twoTracks();

    // Act
    const edited = setTrackShortName(song, 1, '  E.Gt  ');

    // Assert
    expect(edited.tracks[1]?.shortName).toBe('E.Gt');
    expect(edited.tracks[0]).toBe(song.tracks[0]);
    expect(song.tracks[1]?.shortName).toBeUndefined();
  });

  it('removes it for a blank text, the name, or the name abbreviated', () => {
    // Arrange
    const song = setTrackShortName(twoTracks(), 0, 'Gt');

    // Act / Assert
    expect(setTrackShortName(song, 0, '  ').tracks[0]?.shortName).toBeUndefined();
    expect(setTrackShortName(song, 0, 'Track 1').tracks[0]?.shortName).toBeUndefined();
    expect('shortName' in (setTrackShortName(song, 0, '').tracks[0] ?? {})).toBe(false);
  });

  it('returns the same song when nothing changes or the track is missing', () => {
    const song = twoTracks();
    expect(setTrackShortName(song, 0, '')).toBe(song);
    expect(setTrackShortName(song, 0, 'Track 1')).toBe(song);
    expect(setTrackShortName(song, 4, 'Gt')).toBe(song);
    const named = setTrackShortName(song, 0, 'Gt');
    expect(setTrackShortName(named, 0, ' Gt ')).toBe(named);
  });
});

describe('setTrackColor', () => {
  it('colours the track, each channel rounded into 0…255', () => {
    // Arrange
    const song = twoTracks();

    // Act
    const edited = setTrackColor(song, 1, { r: 117.4, g: 300, b: -4 });

    // Assert
    expect(edited.tracks[1]?.color).toEqual({ r: 117, g: 255, b: 0 });
    expect(edited.tracks[0]).toBe(song.tracks[0]);
    expect(song.tracks[1]?.color).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('returns the same song for the same colour, a channel that is not a number or a missing track', () => {
    const song = twoTracks();
    expect(setTrackColor(song, 0, { r: 255, g: 0, b: 0 })).toBe(song);
    expect(setTrackColor(song, 0, { r: Number.NaN, g: 0, b: 0 })).toBe(song);
    expect(setTrackColor(song, 2, { r: 1, g: 2, b: 3 })).toBe(song);
  });
});

describe('instrumentIconId and trackIconId', () => {
  it('gives the icon Guitar Pro gives the track’s instrument', () => {
    expect(instrumentIconId({ name: 'Gt', isPercussion: false }, { program: 25, isPercussion: false })).toBe(TRACK_ICON_IDS.steelGuitar);
    expect(instrumentIconId({ name: 'Gt', isPercussion: false }, { program: 24, isPercussion: false })).toBe(TRACK_ICON_IDS.nylonGuitar);
    expect(instrumentIconId({ name: 'Gt', isPercussion: false }, { program: 30, isPercussion: false })).toBe(TRACK_ICON_IDS.electricGuitar);
    expect(instrumentIconId({ name: 'Bs', isPercussion: false }, { program: 33, isPercussion: false })).toBe(TRACK_ICON_IDS.bass);
    expect(instrumentIconId({ name: 'Pno', isPercussion: false }, { program: 0, isPercussion: false })).toBe(TRACK_ICON_IDS.keyboard);
    expect(instrumentIconId({ name: 'Tp', isPercussion: false }, { program: 56, isPercussion: false })).toBe(TRACK_ICON_IDS.brass);
    expect(instrumentIconId({ name: 'Choir', isPercussion: false }, { program: 52, isPercussion: false })).toBe(TRACK_ICON_IDS.voice);
  });

  it('draws drums for a percussion track or channel, a voice for a track named like one, a steel guitar without a channel', () => {
    expect(instrumentIconId({ name: 'Kit', isPercussion: true }, { program: 0, isPercussion: false })).toBe(TRACK_ICON_IDS.drums);
    expect(instrumentIconId({ name: 'Kit', isPercussion: false }, { program: 0, isPercussion: true })).toBe(TRACK_ICON_IDS.drums);
    expect(instrumentIconId({ name: 'Lead Vocals', isPercussion: false }, { program: 30, isPercussion: false })).toBe(TRACK_ICON_IDS.voice);
    expect(instrumentIconId({ name: 'Gt', isPercussion: false }, undefined)).toBe(TRACK_ICON_IDS.steelGuitar);
  });

  it('gives the track’s own icon, else its instrument’s', () => {
    // Arrange
    const song = withProgram(33);

    // Act
    const chosen = setTrackIcon(song, 0, TRACK_ICON_IDS.banjo);

    // Assert
    expect(trackIconId(song, 0)).toBe(TRACK_ICON_IDS.bass);
    expect(trackIconId(chosen, 0)).toBe(TRACK_ICON_IDS.banjo);
    expect(trackIconId(chosen, 7)).toBeUndefined();
  });
});

describe('setTrackIcon', () => {
  it('chooses an icon apart from the instrument, and undefined goes back to the instrument’s', () => {
    // Arrange
    const song = withProgram(25);

    // Act
    const chosen = setTrackIcon(song, 0, TRACK_ICON_IDS.ukulele);
    const reset = setTrackIcon(chosen, 0, undefined);

    // Assert
    expect(chosen.tracks[0]?.iconId).toBe(TRACK_ICON_IDS.ukulele);
    expect(chosen.tracks[1]).toBe(song.tracks[1]);
    expect(reset.tracks[0]?.iconId).toBeUndefined();
    expect('iconId' in (reset.tracks[0] ?? {})).toBe(false);
  });

  it('keeps no icon equal to the instrument’s: the track follows its instrument', () => {
    const chosen = setTrackIcon(withProgram(25), 0, TRACK_ICON_IDS.banjo);
    expect(setTrackIcon(chosen, 0, TRACK_ICON_IDS.steelGuitar).tracks[0]?.iconId).toBeUndefined();
  });

  it('returns the same song for the same icon, an id Guitar Pro has not, or a missing track', () => {
    const song = withProgram(25);
    expect(setTrackIcon(song, 0, undefined)).toBe(song);
    expect(setTrackIcon(song, 0, TRACK_ICON_IDS.steelGuitar)).toBe(song);
    expect(setTrackIcon(song, 0, -1)).toBe(song);
    expect(setTrackIcon(song, 0, 2.5)).toBe(song);
    expect(setTrackIcon(song, 0, 100)).toBe(song);
    expect(setTrackIcon(song, 3, TRACK_ICON_IDS.banjo)).toBe(song);
  });
});

describe('normalizeIconId and normalizeShortName', () => {
  it('keeps a file’s icon only when it is an icon id other than the instrument’s', () => {
    expect(normalizeIconId(24, TRACK_ICON_IDS.electricGuitar)).toBe(24);
    expect(normalizeIconId(4, TRACK_ICON_IDS.electricGuitar)).toBeUndefined();
    expect(normalizeIconId(undefined, TRACK_ICON_IDS.electricGuitar)).toBeUndefined();
    expect(normalizeIconId(-3, TRACK_ICON_IDS.electricGuitar)).toBeUndefined();
    expect(normalizeIconId(1000, TRACK_ICON_IDS.electricGuitar)).toBeUndefined();
  });

  it('keeps a file’s short name only when it says more than the name', () => {
    expect(normalizeShortName(' s.guit. ', 'Steel Guitar')).toBe('s.guit.');
    expect(normalizeShortName('Steel Guitar', 'Steel Guitar')).toBeUndefined();
    expect(normalizeShortName('Steel Guit.', 'Steel Guitar')).toBeUndefined();
    expect(normalizeShortName('  ', 'Steel Guitar')).toBeUndefined();
    expect(normalizeShortName(undefined, 'Steel Guitar')).toBeUndefined();
  });
});
