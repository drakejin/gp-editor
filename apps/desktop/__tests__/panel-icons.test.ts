import { DEFAULT_CHANNEL, type Song } from '@gp-editor/core';
import type { DrawCommand } from '../src/score/draw';
import {
  type InstrumentIconKind,
  PANEL_ICON_SIZE,
  engraveEyeIcon,
  engraveHeadphonesIcon,
  engraveInstrumentIcon,
  engraveSpeakerIcon,
  instrumentIconKind,
} from '../src/score/panel-icons';
import { allFinite } from '../test-support/score-helpers';
import { makeSong } from '../test-support/songs';

const KINDS: readonly InstrumentIconKind[] = ['guitar', 'bass', 'drums', 'keys', 'voice', 'other'];

/** The one-track test song on a channel with this program (and name, drums). */
function songWith(program: number | undefined, name = 'Track', isPercussion = false): Song {
  const song = makeSong([[]]);
  const track = { ...song.tracks[0]!, name, isPercussion };
  const channels = program === undefined ? [] : [{ ...DEFAULT_CHANNEL, id: track.channelId, program }];
  return { ...song, channels, tracks: [track] };
}

/** Every x and y a command reaches. */
function points(command: DrawCommand): number[] {
  switch (command.kind) {
    case 'line':
      return [command.x1, command.y1, command.x2, command.y2];
    case 'curve':
      return [command.x1, command.y1, command.x2, command.y2];
    case 'polygon':
      return [...command.points];
    case 'rect':
      return [command.x, command.y, command.x + command.width, command.y + command.height];
    case 'circle':
      return [command.x - command.radius, command.y - command.radius, command.x + command.radius, command.y + command.radius];
    case 'text':
      return [command.x, command.y];
  }
}

function fitsTheIcon(commands: readonly DrawCommand[]): boolean {
  return commands.flatMap(points).every((value) => value >= 0 && value <= PANEL_ICON_SIZE + 0.5);
}

describe('instrumentIconKind', () => {
  it('picks the icon from the track’s General MIDI family', () => {
    expect(instrumentIconKind(songWith(30), 0)).toBe('guitar');
    expect(instrumentIconKind(songWith(33), 0)).toBe('bass');
    expect(instrumentIconKind(songWith(0), 0)).toBe('keys');
    expect(instrumentIconKind(songWith(81), 0)).toBe('keys');
    expect(instrumentIconKind(songWith(56), 0)).toBe('other');
  });

  it('draws a voice for the voice programs and for a track named like one', () => {
    expect(instrumentIconKind(songWith(53), 0)).toBe('voice');
    expect(instrumentIconKind(songWith(30, 'Lead Vocals'), 0)).toBe('voice');
  });

  it('draws drums for a percussion track and a guitar for a track without a channel', () => {
    expect(instrumentIconKind(songWith(0, 'Kit', true), 0)).toBe('drums');
    expect(instrumentIconKind(songWith(undefined), 0)).toBe('guitar');
  });
});

describe('panel icons', () => {
  it.each(KINDS)('draws the %s icon in the given colour inside the icon square', (kind) => {
    // Act
    const commands = engraveInstrumentIcon(kind, '#123456');

    // Assert
    expect(commands.length).toBeGreaterThan(0);
    expect(commands.every((command) => command.color === '#123456')).toBe(true);
    expect(allFinite(commands)).toBe(true);
    expect(fitsTheIcon(commands)).toBe(true);
  });

  it('crosses the speaker out when the track is muted', () => {
    // Act
    const playing = engraveSpeakerIcon('#FFFFFF', false);
    const muted = engraveSpeakerIcon('#FFFFFF', true);

    // Assert
    expect(playing.filter((command) => command.kind === 'curve')).toHaveLength(2);
    expect(muted.filter((command) => command.kind === 'curve')).toHaveLength(0);
    expect(muted.filter((command) => command.kind === 'line')).toHaveLength(2);
  });

  it('keeps the eye, speaker and headphones inside the icon square', () => {
    const icons = [engraveEyeIcon('#FFFFFF'), engraveSpeakerIcon('#FFFFFF', true), engraveSpeakerIcon('#FFFFFF', false), engraveHeadphonesIcon('#FFFFFF')];
    expect(icons.every((commands) => commands.length > 0 && fitsTheIcon(commands) && allFinite(commands))).toBe(true);
  });
});
