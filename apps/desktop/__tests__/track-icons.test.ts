import { DEFAULT_CHANNEL, type Song, TRACK_ICON_IDS, type TrackIconName } from '@gp-editor/core';
import { TRACK_ICON_SIZE, engraveTrackIcon, shownTrackIcon } from '../src/score/track-icons';
import { allFinite, fitsSquare } from '../test-support/score-helpers';
import { makeSong } from '../test-support/songs';

const ICONS = Object.keys(TRACK_ICON_IDS) as TrackIconName[];

/** The one-track test song on a channel with this program (and name, drums, own icon). */
function songWith(program: number | undefined, name = 'Track', isPercussion = false, iconId?: number): Song {
  const song = makeSong([[]]);
  const track = { ...song.tracks[0]!, name, isPercussion, ...(iconId === undefined ? {} : { iconId }) };
  const channels = program === undefined ? [] : [{ ...DEFAULT_CHANNEL, id: track.channelId, program }];
  return { ...song, channels, tracks: [track] };
}

describe('shownTrackIcon', () => {
  it('shows the icon Guitar Pro gives the track’s instrument', () => {
    expect(shownTrackIcon(songWith(25), 0)).toBe('steelGuitar');
    expect(shownTrackIcon(songWith(24), 0)).toBe('nylonGuitar');
    expect(shownTrackIcon(songWith(30), 0)).toBe('electricGuitar');
    expect(shownTrackIcon(songWith(33), 0)).toBe('bass');
    expect(shownTrackIcon(songWith(0), 0)).toBe('keyboard');
    expect(shownTrackIcon(songWith(81), 0)).toBe('synthesizer');
    expect(shownTrackIcon(songWith(40), 0)).toBe('strings');
    expect(shownTrackIcon(songWith(56), 0)).toBe('brass');
    expect(shownTrackIcon(songWith(65), 0)).toBe('reeds');
    expect(shownTrackIcon(songWith(73), 0)).toBe('flute');
    expect(shownTrackIcon(songWith(11), 0)).toBe('mallets');
    expect(shownTrackIcon(songWith(47), 0)).toBe('timpani');
    expect(shownTrackIcon(songWith(105), 0)).toBe('banjo');
    expect(shownTrackIcon(songWith(122), 0)).toBe('other');
  });

  it('shows a voice for the voice programs and a track named like one, drums for a drum track', () => {
    expect(shownTrackIcon(songWith(53), 0)).toBe('voice');
    expect(shownTrackIcon(songWith(30, 'Lead Vocals'), 0)).toBe('voice');
    expect(shownTrackIcon(songWith(0, 'Kit', true), 0)).toBe('drums');
    expect(shownTrackIcon(songWith(undefined), 0)).toBe('steelGuitar');
  });

  it('shows the track’s own icon, and its instrument’s for an id it cannot draw', () => {
    expect(shownTrackIcon(songWith(33, 'Bass', false, TRACK_ICON_IDS.ukulele), 0)).toBe('ukulele');
    expect(shownTrackIcon(songWith(33, 'Bass', false, 3), 0)).toBe('bass');
    expect(shownTrackIcon(songWith(33), 4)).toBe('steelGuitar');
  });
});

describe('engraveTrackIcon', () => {
  it.each(ICONS)('draws the %s icon in the given colour inside the icon square', (icon) => {
    // Act
    const commands = engraveTrackIcon(icon, '#123456');

    // Assert
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((command) => command.color === '#123456')).toBe(true);
    expect(allFinite(commands)).toBe(true);
    expect(fitsSquare(commands, TRACK_ICON_SIZE)).toBe(true);
  });

  it('draws every icon differently', () => {
    const drawings = ICONS.map((icon) => JSON.stringify(engraveTrackIcon(icon, '#FFFFFF')));
    expect(new Set(drawings).size).toBe(ICONS.length);
  });
});
